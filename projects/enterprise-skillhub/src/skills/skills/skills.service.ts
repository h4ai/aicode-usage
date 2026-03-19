import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSkillDto } from './dto/create-skill.dto';
import { UpdateSkillDto } from './dto/update-skill.dto';
import { QuerySkillsDto } from './dto/query-skills.dto';
import { PaginatedResult } from '../common/dto/pagination.dto';

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
  constructor(
    private readonly prisma: PrismaService,
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
