import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  Inject,
  Logger,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateSkillDto } from './dto/create-skill.dto';
import { UpdateSkillDto } from './dto/update-skill.dto';
import { QuerySkillsDto } from './dto/query-skills.dto';
import { PaginatedResult } from '../common/dto/pagination.dto';
import * as AdmZip from 'adm-zip';
import * as crypto from 'crypto';

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
const POPULAR_CACHE_PREFIX = 'skills:popular:';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

type CounterField = 'downloadCount' | 'installCount' | 'starCount';
const VALID_COUNTERS: CounterField[] = [
  'downloadCount',
  'installCount',
  'starCount',
];

@Injectable()
export class SkillsService {
  private readonly logger = new Logger(SkillsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  /**
   * Create a new skill
   */
  async create(dto: CreateSkillDto, user: any) {
    // Validate slug format
    this.validateSlug(dto.slug);

    // Check slug uniqueness
    const existing = await this.prisma.skill.findUnique({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new ConflictException(`Slug "${dto.slug}" is already taken`);
    }

    return this.prisma.skill.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        summary: dto.summary || null,
        category: (dto.category as any) || 'GENERAL',
        visibility: (dto.visibility as any) || 'PUBLIC',
        tags: dto.tags || [],
        ownerId: user.sub,
      },
      include: {
        owner: {
          select: { id: true, displayName: true, department: true },
        },
      },
    });
  }

  /**
   * List skills with pagination, filtering, and visibility
   */
  async findAll(
    query: QuerySkillsDto,
    user: any,
  ): Promise<PaginatedResult<any>> {
    const limit = Math.min(query.limit || 20, 100);
    const page = query.page || 1;
    const skip = (page - 1) * limit;

    // Check cache for popular sort
    if (query.sort === 'popular') {
      const cacheKey = `${POPULAR_CACHE_PREFIX}${page}:${limit}:${query.category || ''}`;
      const cached = await this.cacheManager.get<PaginatedResult<any>>(cacheKey);
      if (cached) return cached;
    }

    const where = this.buildWhereClause(query, user);

    const orderBy = this.buildOrderBy(query.sort);

    const [data, total] = await Promise.all([
      this.prisma.skill.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          owner: {
            select: { id: true, displayName: true, department: true },
          },
        },
      }),
      this.prisma.skill.count({ where }),
    ]);

    const result: PaginatedResult<any> = {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };

    // Cache popular results
    if (query.sort === 'popular') {
      const cacheKey = `${POPULAR_CACHE_PREFIX}${page}:${limit}:${query.category || ''}`;
      await this.cacheManager.set(cacheKey, result, CACHE_TTL_MS);
    }

    return result;
  }

  /**
   * Get a single skill by slug with visibility check
   */
  async findOne(slug: string, user: any) {
    const skill = await this.prisma.skill.findUnique({
      where: { slug },
      include: {
        owner: {
          select: { id: true, displayName: true, department: true },
        },
      },
    });

    if (!skill || skill.moderationStatus === 'REMOVED') {
      throw new NotFoundException(`Skill "${slug}" not found`);
    }

    this.checkVisibility(skill, user);

    return skill;
  }

  /**
   * Update a skill (owner or admin only)
   */
  async update(slug: string, dto: UpdateSkillDto, user: any) {
    const skill = await this.prisma.skill.findUnique({
      where: { slug },
    });

    if (!skill) {
      throw new NotFoundException(`Skill "${slug}" not found`);
    }

    this.checkOwnership(skill, user);

    const updated = await this.prisma.skill.update({
      where: { slug },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.summary !== undefined && { summary: dto.summary }),
        ...(dto.category !== undefined && { category: dto.category as any }),
        ...(dto.visibility !== undefined && {
          visibility: dto.visibility as any,
        }),
        ...(dto.tags !== undefined && { tags: dto.tags }),
        ...(dto.badges !== undefined && { badges: dto.badges as any }),
      },
      include: {
        owner: {
          select: { id: true, displayName: true, department: true },
        },
      },
    });

    // Invalidate cache
    await this.invalidateCache();

    return updated;
  }

  /**
   * Soft delete — set moderationStatus to REMOVED
   */
  async remove(slug: string, user: any) {
    const skill = await this.prisma.skill.findUnique({
      where: { slug },
    });

    if (!skill) {
      throw new NotFoundException(`Skill "${slug}" not found`);
    }

    this.checkOwnership(skill, user);

    const result = await this.prisma.skill.update({
      where: { slug },
      data: { moderationStatus: 'REMOVED' },
    });

    // Invalidate cache
    await this.invalidateCache();

    return result;
  }

  /**
   * Atomically increment a counter field
   */
  async incrementCounter(skillId: string, field: CounterField) {
    if (!VALID_COUNTERS.includes(field)) {
      throw new BadRequestException(
        `Invalid counter field: ${field}. Must be one of: ${VALID_COUNTERS.join(', ')}`,
      );
    }

    return this.prisma.skill.update({
      where: { id: skillId },
      data: { [field]: { increment: 1 } },
    });
  }

  // ==========================================================
  // Upload / Download
  // ==========================================================

  /**
   * Upload a skill ZIP package:
   * 1. Validate ZIP format and entries
   * 2. Parse SKILL.md for metadata
   * 3. Create or update Skill + SkillVersion + SkillFile records
   * 4. Store files in MinIO
   */
  async uploadSkillPackage(file: Express.Multer.File, user: any) {
    if (!file || !file.buffer) {
      throw new BadRequestException('No file provided');
    }

    const buffer = file.buffer;

    // Validate ZIP magic bytes
    this.storage.validateZipMagicBytes(buffer);

    // Parse ZIP
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();

    // Validate entries (zip bomb, path traversal, file count)
    await this.storage.validateZipEntries(
      entries.map((e) => ({
        entryName: e.entryName,
        header: { size: e.header.size },
      })),
    );

    // Validate SKILL.md presence
    this.storage.validateSkillMdPresence(
      entries.map((e) => ({
        entryName: e.entryName,
        header: { size: e.header.size },
      })),
    );

    // Parse SKILL.md
    const skillMdEntry = entries.find(
      (e) => e.entryName === 'SKILL.md' || e.entryName === './SKILL.md',
    );
    if (!skillMdEntry) {
      throw new BadRequestException('SKILL.md not found in ZIP');
    }
    const skillMdContent = skillMdEntry!.getData().toString('utf8');
    const meta = this.parseSkillMd(skillMdContent);

    if (!meta.slug) {
      throw new BadRequestException(
        'SKILL.md must contain a slug field (e.g., "- slug: my-skill")',
      );
    }

    // Validate slug
    this.validateSlug(meta.slug);

    const version = meta.version || '1.0.0';
    const [major, minor, patch] = version.split('.').map(Number);

    // Ensure user exists in DB (create if needed for JWT-signed tokens)
    const dbUser = await this.ensureUser(user);

    // Upsert the Skill record
    let skill = await this.prisma.skill.findUnique({
      where: { slug: meta.slug },
    });

    if (skill) {
      // Check ownership
      this.checkOwnership(skill, user);

      // Update metadata
      skill = await this.prisma.skill.update({
        where: { slug: meta.slug },
        data: {
          name: meta.name || skill.name,
          summary: meta.description || skill.summary,
          category: (meta.category as any) || skill.category,
          tags: meta.tags || skill.tags,
        },
      });
    } else {
      // Create new skill
      skill = await this.prisma.skill.create({
        data: {
          name: meta.name || meta.slug,
          slug: meta.slug,
          summary: meta.description || null,
          category: (meta.category as any) || 'GENERAL',
          visibility: 'PUBLIC',
          tags: meta.tags || [],
          ownerId: dbUser.id,
        },
      });
    }

    // Check for duplicate version
    const existingVersion = await this.prisma.skillVersion.findUnique({
      where: {
        skillId_version: { skillId: skill.id, version },
      },
    });

    if (existingVersion) {
      throw new ConflictException(
        `Version ${version} already exists for skill "${meta.slug}"`,
      );
    }

    // Create SkillVersion
    const skillVersion = await this.prisma.skillVersion.create({
      data: {
        skillId: skill.id,
        version,
        major: major || 1,
        minor: minor || 0,
        patch: patch || 0,
        changelog: meta.changelog || null,
        readme: skillMdContent,
        parsedMeta: meta as any,
        tag: 'latest',
        reviewStatus: 'APPROVED',
        createdById: dbUser.id,
      },
    });

    // Update skill's latestVersionId
    await this.prisma.skill.update({
      where: { id: skill.id },
      data: {
        latestVersionId: skillVersion.id,
        publishedVersionId: skillVersion.id,
      },
    });

    // Store files in MinIO and create SkillFile records
    const fileRecords = [];
    for (const entry of entries) {
      if (entry.isDirectory) continue;

      const fileBuffer = entry.getData();
      const storageKey = StorageService.buildStorageKey(
        meta.slug,
        version,
        entry.entryName,
      );
      const sha256 = crypto
        .createHash('sha256')
        .update(fileBuffer)
        .digest('hex');

      await this.storage.uploadFile(storageKey, fileBuffer);

      const fileRecord = await this.prisma.skillFile.create({
        data: {
          skillVersionId: skillVersion.id,
          fileName: entry.entryName,
          filePath: storageKey,
          fileSize: fileBuffer.length,
          sha256,
        },
      });
      fileRecords.push(fileRecord);
    }

    // Also store the original ZIP
    const zipStorageKey = `skills/${meta.slug}/${version}/_package.zip`;
    await this.storage.uploadFile(zipStorageKey, buffer, 'application/zip');

    this.logger.log(
      `Skill "${meta.slug}" v${version} uploaded: ${fileRecords.length} files`,
    );

    return {
      skillId: skill.id,
      slug: skill.slug,
      versionId: skillVersion.id,
      version,
      filesCount: fileRecords.length,
      message: `Skill "${meta.slug}" v${version} uploaded successfully`,
    };
  }

  /**
   * Download the latest version of a skill package as ZIP
   */
  async downloadSkillPackage(
    slug: string,
    user: any,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const skill = await this.prisma.skill.findUnique({
      where: { slug },
      include: {
        owner: {
          select: { id: true, displayName: true, department: true },
        },
      },
    });

    if (!skill || skill.moderationStatus === 'REMOVED') {
      throw new NotFoundException(`Skill "${slug}" not found`);
    }

    this.checkVisibility(skill, user);

    if (!skill.latestVersionId) {
      throw new NotFoundException(`No versions available for skill "${slug}"`);
    }

    const version = await this.prisma.skillVersion.findUnique({
      where: { id: skill.latestVersionId },
    });

    if (!version) {
      throw new NotFoundException('Version not found');
    }

    // Try to download the package ZIP from MinIO
    const zipStorageKey = `skills/${slug}/${version.version}/_package.zip`;
    try {
      const url = await this.storage.getPresignedUrl(zipStorageKey);
      // Fetch from MinIO using presigned URL
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to download: ${response.status}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      return {
        buffer: Buffer.from(arrayBuffer),
        filename: `${slug}-${version.version}.zip`,
      };
    } catch (error) {
      this.logger.warn(`Failed to download ZIP for ${slug}: ${error.message}`);

      // Fallback: reconstruct from individual files
      const files = await this.prisma.skillFile.findMany({
        where: { skillVersionId: version.id },
      });

      if (files.length === 0) {
        throw new NotFoundException('No files found for this skill version');
      }

      const zip = new AdmZip();
      for (const file of files) {
        try {
          const url = await this.storage.getPresignedUrl(file.filePath);
          const resp = await fetch(url);
          if (resp.ok) {
            const buf = Buffer.from(await resp.arrayBuffer());
            zip.addFile(file.fileName, buf);
          }
        } catch {
          this.logger.warn(`Skipping file ${file.fileName}: download failed`);
        }
      }

      return {
        buffer: zip.toBuffer(),
        filename: `${slug}-${version.version}.zip`,
      };
    }
  }

  /**
   * Parse SKILL.md frontmatter-style metadata
   */
  private parseSkillMd(content: string): Record<string, any> {
    const meta: Record<string, any> = {};
    const lines = content.split('\n');

    // Extract name from first heading
    for (const line of lines) {
      const headingMatch = line.match(/^#\s+(.+)/);
      if (headingMatch) {
        meta.name = headingMatch[1].trim();
        break;
      }
    }

    // Extract key-value pairs (- key: value)
    for (const line of lines) {
      const kvMatch = line.match(/^-\s+(\w[\w-]*)\s*:\s*(.+)/);
      if (kvMatch) {
        const key = kvMatch[1].trim();
        let value: any = kvMatch[2].trim();

        // Handle comma-separated lists for tags
        if (key === 'tags') {
          value = value.split(',').map((t: string) => t.trim());
        }

        meta[key] = value;
      }
    }

    return meta;
  }

  /**
   * Ensure user exists in DB for JWT-signed test tokens
   */
  private async ensureUser(jwtUser: any) {
    let dbUser = await this.prisma.user.findFirst({
      where: {
        OR: [
          { id: jwtUser.sub },
          { username: jwtUser.username || 'unknown' },
        ],
      },
    });

    if (!dbUser) {
      dbUser = await this.prisma.user.create({
        data: {
          id: jwtUser.sub,
          username: jwtUser.username || `user-${jwtUser.sub}`,
          displayName: jwtUser.displayName || jwtUser.username || 'Test User',
          email: jwtUser.email || `${jwtUser.username || jwtUser.sub}@skillhub.local`,
          department: jwtUser.department || 'Engineering',
          role: (jwtUser.role as any) || 'USER',
        },
      });
    }

    return dbUser;
  }

  // ==========================================================
  // Private helpers
  // ==========================================================

  private validateSlug(slug: string): void {
    if (!slug || slug.length < 3 || slug.length > 64) {
      throw new BadRequestException(
        'Slug must be between 3 and 64 characters',
      );
    }
    if (!SLUG_REGEX.test(slug)) {
      throw new BadRequestException(
        'Slug must be lowercase alphanumeric with hyphens, starting and ending with alphanumeric',
      );
    }
  }

  private checkOwnership(skill: any, user: any): void {
    if (user.role === 'ADMIN') return;
    if (skill.ownerId !== user.sub) {
      throw new ForbiddenException(
        'You do not have permission to modify this skill',
      );
    }
  }

  private checkVisibility(skill: any, user: any): void {
    if (user.role === 'ADMIN') return;

    switch (skill.visibility) {
      case 'PUBLIC':
        return;
      case 'DEPARTMENT':
        if (user.department === skill.owner?.department) return;
        throw new ForbiddenException(
          'This skill is restricted to its department',
        );
      case 'PRIVATE':
        if (user.sub === skill.ownerId) return;
        throw new ForbiddenException('This skill is private');
      default:
        throw new ForbiddenException('Access denied');
    }
  }

  private buildWhereClause(query: QuerySkillsDto, user: any): any {
    const where: any = {
      moderationStatus: { not: 'REMOVED' },
    };

    // Category filter
    if (query.category) {
      where.category = query.category;
    }

    // Tag filter
    if (query.tags && query.tags.length > 0) {
      where.tags = { hasEvery: query.tags };
    }

    // Search filter
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { summary: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    // Visibility filter
    if (user.role !== 'ADMIN') {
      where.OR = [
        ...(where.OR || []),
        { visibility: 'PUBLIC' },
        { visibility: 'PRIVATE', ownerId: user.sub },
        {
          visibility: 'DEPARTMENT',
          owner: { department: user.department },
        },
      ];
    }

    return where;
  }

  private buildOrderBy(sort?: string): any {
    switch (sort) {
      case 'popular':
        return [{ downloadCount: 'desc' }, { starCount: 'desc' }];
      case 'downloads':
        return { downloadCount: 'desc' };
      default:
        return { createdAt: 'desc' };
    }
  }

  private async invalidateCache(): Promise<void> {
    // Invalidate all popular cache keys
    try {
      await this.cacheManager.del(`${POPULAR_CACHE_PREFIX}*`);
    } catch {
      // Cache invalidation failure is non-critical
    }
  }
}
