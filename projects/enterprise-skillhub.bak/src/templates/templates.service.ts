import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NamespacesService } from '../namespaces/namespaces.service';
import { StorageService } from '../storage/storage.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { CreateTemplateVersionDto } from './dto/create-template-version.dto';
import { QueryTemplatesDto } from './dto/query-templates.dto';
import { PaginatedResult } from '../common/dto/pagination.dto';
import * as semver from 'semver';

const MAX_ZIP_SIZE = 50 * 1024 * 1024; // 50MB

@Injectable()
export class TemplatesService {
  private readonly logger = new Logger(TemplatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly namespacesService: NamespacesService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Create a new template in a namespace
   */
  async create(dto: CreateTemplateDto, user: any) {
    // Check namespace membership (global ADMIN bypasses)
    if (user.role !== 'ADMIN') {
      const isMember = await this.namespacesService.checkMembership(dto.namespaceId, user.sub);
      if (!isMember) {
        throw new ForbiddenException('You are not a member of this namespace');
      }
    }

    // Check uniqueness within namespace
    const existing = await this.prisma.template.findUnique({
      where: { namespaceId_name: { namespaceId: dto.namespaceId, name: dto.name } },
    });
    if (existing) {
      throw new ConflictException(`Template "${dto.name}" already exists in this namespace`);
    }

    return this.prisma.template.create({
      data: {
        namespaceId: dto.namespaceId,
        name: dto.name,
        description: dto.description || null,
        authorId: user.sub,
        isPublic: dto.isPublic ?? true,
        tags: dto.tags || [],
      },
      include: {
        namespace: { select: { id: true, name: true } },
        author: { select: { id: true, displayName: true } },
        versions: true,
      },
    });
  }

  /**
   * List templates with pagination, filtering, and sorting
   */
  async findAll(query: QueryTemplatesDto, _user: any): Promise<PaginatedResult<any>> {
    const limit = Math.min(query.limit || 20, 100);
    const page = query.page || 1;
    const skip = (page - 1) * limit;

    const where: any = { isPublic: true };

    // Filter by namespace
    if (query.namespace) {
      const ns = await this.prisma.namespace.findUnique({ where: { name: query.namespace } });
      if (ns) {
        where.namespaceId = ns.id;
      }
    }

    // Filter by tag
    if (query.tag) {
      where.tags = { has: query.tag };
    }

    // Search
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const orderBy = this.buildOrderBy(query.sort);

    const [data, total] = await Promise.all([
      this.prisma.template.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          namespace: { select: { id: true, name: true } },
          author: { select: { id: true, displayName: true } },
        },
      }),
      this.prisma.template.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get template details by ID
   */
  async findOne(id: string) {
    const template = await this.prisma.template.findUnique({
      where: { id },
      include: {
        namespace: { select: { id: true, name: true } },
        author: { select: { id: true, displayName: true } },
        versions: {
          include: { skills: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    return template;
  }

  /**
   * Upload a new template version (ZIP file)
   */
  async createVersion(
    templateId: string,
    dto: CreateTemplateVersionDto,
    file: Express.Multer.File,
    user: any,
  ) {
    // Validate template exists
    const template = await this.prisma.template.findUnique({
      where: { id: templateId },
      include: { namespace: true },
    });
    if (!template) {
      throw new NotFoundException('Template not found');
    }

    // Check namespace membership
    if (user.role !== 'ADMIN') {
      const isMember = await this.namespacesService.checkMembership(template.namespaceId, user.sub);
      if (!isMember) {
        throw new ForbiddenException('You are not a member of this namespace');
      }
    }

    // Validate semver
    if (!semver.valid(dto.version)) {
      throw new BadRequestException(`Invalid SemVer version: ${dto.version}`);
    }

    // Check ZIP size
    if (file && file.size > MAX_ZIP_SIZE) {
      throw new BadRequestException(`ZIP file exceeds maximum size of 50MB`);
    }

    // Check duplicate version
    const existingVersion = await this.prisma.templateVersion.findUnique({
      where: { templateId_version: { templateId, version: dto.version } },
    });
    if (existingVersion) {
      throw new ConflictException(`Version ${dto.version} already exists`);
    }

    // Upload to MinIO
    const fileKey = `templates/${template.namespaceId}/${template.name}/${dto.version}.zip`;
    if (file && file.buffer) {
      await this.storage.uploadFile(fileKey, file.buffer, 'application/zip');
    }

    // Create version record
    const version = await this.prisma.templateVersion.create({
      data: {
        templateId,
        version: dto.version,
        manifest: dto.manifest || {},
        fileKey,
        status: 'DRAFT',
        extends: dto.extends || null,
      },
      include: { skills: true },
    });

    // Create skill dependencies
    if (dto.skills && dto.skills.length > 0) {
      await this.prisma.templateSkill.createMany({
        data: dto.skills.map((s) => ({
          templateVersionId: version.id,
          skillName: s.skillName,
          versionRange: s.versionRange,
        })),
      });
    }

    this.logger.log(`Template "${template.name}" v${dto.version} created`);

    return version;
  }

  /**
   * Get a specific version of a template
   */
  async getVersion(templateId: string, version: string) {
    const ver = await this.prisma.templateVersion.findUnique({
      where: { templateId_version: { templateId, version } },
      include: { skills: true },
    });

    if (!ver) {
      throw new NotFoundException(`Version ${version} not found`);
    }

    return ver;
  }

  /**
   * Submit a version for review (DRAFT → PENDING_REVIEW)
   */
  async publishVersion(templateId: string, version: string, user: any) {
    const template = await this.prisma.template.findUnique({
      where: { id: templateId },
    });
    if (!template) {
      throw new NotFoundException('Template not found');
    }

    // Check membership
    if (user.role !== 'ADMIN') {
      const isMember = await this.namespacesService.checkMembership(template.namespaceId, user.sub);
      if (!isMember) {
        throw new ForbiddenException('You are not a member of this namespace');
      }
    }

    const ver = await this.prisma.templateVersion.findUnique({
      where: { templateId_version: { templateId, version } },
    });
    if (!ver) {
      throw new NotFoundException(`Version ${version} not found`);
    }

    if (ver.status !== 'DRAFT') {
      throw new BadRequestException('Only DRAFT versions can be submitted for review');
    }

    return this.prisma.templateVersion.update({
      where: { id: ver.id },
      data: { status: 'PENDING_REVIEW' },
    });
  }

  /**
   * Resolve a template by namespace name and template name.
   * Returns the latest published version with download URL and skill dependencies.
   */
  async resolve(namespaceName: string, templateName: string, versionStr?: string) {
    const namespace = await this.prisma.namespace.findUnique({
      where: { name: namespaceName },
    });
    if (!namespace) {
      throw new NotFoundException(`Namespace "${namespaceName}" not found`);
    }

    const template = await this.prisma.template.findUnique({
      where: { namespaceId_name: { namespaceId: namespace.id, name: templateName } },
    });
    if (!template) {
      throw new NotFoundException(`Template "@${namespaceName}/${templateName}" not found`);
    }

    // Get the latest PUBLISHED version (or specific version)
    let versions;
    if (versionStr) {
      versions = await this.prisma.templateVersion.findMany({
        where: { templateId: template.id, version: versionStr, status: 'PUBLISHED' },
        include: { skills: true },
      });
    } else {
      versions = await this.prisma.templateVersion.findMany({
        where: { templateId: template.id, status: 'PUBLISHED' },
        include: { skills: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
      });
    }

    if (versions.length === 0) {
      throw new NotFoundException('No published version found');
    }

    const latestVersion = versions[0];
    const downloadUrl = await this.storage.getPresignedUrl(latestVersion.fileKey);

    return {
      template: {
        id: template.id,
        name: template.name,
        namespace: namespaceName,
        fullName: `@${namespaceName}/${template.name}`,
      },
      version: latestVersion.version,
      downloadUrl,
      manifest: latestVersion.manifest,
      extends: latestVersion.extends,
      skills: latestVersion.skills.map((s: any) => ({
        skillName: s.skillName,
        versionRange: s.versionRange,
      })),
    };
  }

  // ==========================================================
  // Private helpers
  // ==========================================================

  private buildOrderBy(sort?: string): any {
    switch (sort) {
      case 'popular':
        return [{ weeklyDownloads: 'desc' }, { downloadCount: 'desc' }];
      case 'newest':
        return { createdAt: 'desc' };
      case 'name':
        return { name: 'asc' };
      default:
        return [{ weeklyDownloads: 'desc' }, { downloadCount: 'desc' }];
    }
  }
}
