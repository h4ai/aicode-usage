import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '../config/config.service';
import { firstValueFrom } from 'rxjs';

const MAX_RESULTS = 50;

export interface SearchQuery {
  query: string;
  limit?: number;
  category?: string;
}

export interface SearchResultItem {
  id: string;
  name: string;
  slug: string;
  summary: string | null;
  category: string;
  similarityScore: number | null;
  downloadCount: number;
  installCount: number;
  starCount: number;
}

export interface SearchResult {
  data: SearchResultItem[];
  total: number;
  fallback: boolean;
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Generate embedding via BGE-M3 HTTP API
   * Returns null on failure (graceful degradation)
   */
  async generateEmbedding(text: string): Promise<number[] | null> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          this.config.bgeM3Url,
          { texts: [text] },
          { timeout: this.config.bgeM3Timeout },
        ),
      );
      return response.data.embeddings[0];
    } catch (error) {
      this.logger.warn(
        `BGE-M3 embedding generation failed: ${error.message}. Falling back to text search.`,
      );
      return null;
    }
  }

  /**
   * Hybrid search: vector similarity + keyword ILIKE fallback
   */
  async searchSkills(
    params: SearchQuery,
    user: any,
  ): Promise<SearchResult> {
    const limit = Math.min(params.limit || 20, MAX_RESULTS);
    const query = params.query || '';

    // Try to get embedding for semantic search
    const embedding = query ? await this.generateEmbedding(query) : null;

    if (embedding) {
      return this.vectorSearch(embedding, query, limit, user);
    }

    // Fallback: ILIKE text search
    return this.textSearch(query, limit, user);
  }

  /**
   * Vector similarity search using pgvector
   */
  private async vectorSearch(
    embedding: number[],
    query: string,
    limit: number,
    user: any,
  ): Promise<SearchResult> {
    const embeddingStr = `[${embedding.join(',')}]`;
    const visibilityClause = this.buildVisibilitySql(user);

    // Using $queryRaw tagged template with visibility as raw SQL (safe: built internally)
    const sql = `
      SELECT
        s.id,
        s.name,
        s.slug,
        s.summary,
        s.category,
        s."downloadCount" AS download_count,
        s."installCount" AS install_count,
        s."starCount" AS star_count,
        1 - (sv.embedding <=> $1::vector) AS similarity_score
      FROM "Skill" s
      INNER JOIN "SkillVersion" sv ON sv.id = s."latestVersionId"
      WHERE s."moderationStatus" != 'REMOVED'
        AND sv.embedding IS NOT NULL
        ${visibilityClause}
      ORDER BY sv.embedding <=> $1::vector ASC
      LIMIT $2
    `;

    const results: any[] = await this.prisma.$queryRawUnsafe(
      sql,
      embeddingStr,
      limit,
    );

    return {
      data: results.map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        summary: r.summary,
        category: r.category,
        similarityScore: r.similarity_score
          ? parseFloat(Number(r.similarity_score).toFixed(4))
          : null,
        downloadCount: r.download_count,
        installCount: r.install_count,
        starCount: r.star_count,
      })),
      total: results.length,
      fallback: false,
    };
  }

  /**
   * ILIKE text search fallback (when BGE-M3 unavailable)
   */
  private async textSearch(
    query: string,
    limit: number,
    user: any,
  ): Promise<SearchResult> {
    const visibilityClause = this.buildVisibilitySql(user);
    const searchPattern = `%${query}%`;

    const sql = `
      SELECT
        s.id,
        s.name,
        s.slug,
        s.summary,
        s.category,
        s."downloadCount" AS download_count,
        s."installCount" AS install_count,
        s."starCount" AS star_count,
        NULL AS similarity_score
      FROM "Skill" s
      WHERE s."moderationStatus" != 'REMOVED'
        AND (
          s.name ILIKE $1
          OR s.summary ILIKE $1
        )
        ${visibilityClause}
      ORDER BY s."downloadCount" DESC, s."starCount" DESC
      LIMIT $2
    `;

    const results: any[] = await this.prisma.$queryRawUnsafe(
      sql,
      searchPattern,
      limit,
    );

    return {
      data: results.map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        summary: r.summary,
        category: r.category,
        similarityScore: null,
        downloadCount: r.download_count,
        installCount: r.install_count,
        starCount: r.star_count,
      })),
      total: results.length,
      fallback: true,
    };
  }

  /**
   * Build SQL WHERE clause for visibility filtering
   */
  private buildVisibilitySql(user: any): string {
    if (user.role === 'ADMIN') {
      return ''; // Admin sees everything
    }

    // Non-admin: PUBLIC + own PRIVATE + same-department DEPARTMENT
    return `
      AND (
        s.visibility = 'PUBLIC'
        OR (s.visibility = 'PRIVATE' AND s."ownerId" = '${user.sub}')
        OR (s.visibility = 'DEPARTMENT' AND s."ownerId" IN (
          SELECT id FROM "User" WHERE department = '${user.department}'
        ))
      )
    `;
  }
}
