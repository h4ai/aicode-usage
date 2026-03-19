import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PaginatedResult } from '../common/dto/pagination.dto';
import {
  QueryUsersDto,
  CreatePolicyDto,
  UpdatePolicyDto,
} from './dto/admin.dto';

const VALID_ROLES = ['ADMIN', 'PUBLISHER', 'REVIEWER', 'USER'];

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  // ==========================================================
  // USER MANAGEMENT
  // ==========================================================

  async listUsers(query: QueryUsersDto): Promise<PaginatedResult<any>> {
    const where: Record<string, any> = {};

    if (query.search) {
      where.OR = [
        { displayName: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { username: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.role) {
      where.role = query.role;
    }

    if (query.department) {
      where.department = query.department;
    }

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
        select: {
          id: true,
          username: true,
          displayName: true,
          email: true,
          department: true,
          role: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data,
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit),
    };
  }

  async updateUserRole(userId: string, role: string, actor: any): Promise<any> {
    if (!VALID_ROLES.includes(role)) {
      throw new BadRequestException(`Invalid role: ${role}. Must be one of: ${VALID_ROLES.join(', ')}`);
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    const oldRole = user.role;
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { role: role as any },
    });

    await this.auditService.log({
      action: 'USER_ROLE_CHANGE',
      resource: 'user',
      resourceId: userId,
      actorId: actor.sub,
      detail: { oldRole, newRole: role },
    });

    return updated;
  }

  async updateUserStatus(userId: string, isActive: boolean, actor: any): Promise<any> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { isActive },
    });

    await this.auditService.log({
      action: 'USER_STATUS_CHANGE',
      resource: 'user',
      resourceId: userId,
      actorId: actor.sub,
      detail: { oldStatus: user.isActive, newStatus: isActive },
    });

    return updated;
  }

  // ==========================================================
  // REVIEW POLICIES
  // ==========================================================

  async listPolicies(): Promise<any[]> {
    return this.prisma.reviewPolicy.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async createPolicy(dto: CreatePolicyDto): Promise<any> {
    try {
      return await this.prisma.reviewPolicy.create({ data: dto as any });
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new ConflictException(`Policy with name "${dto.name}" already exists`);
      }
      throw error;
    }
  }

  async updatePolicy(id: string, dto: UpdatePolicyDto): Promise<any> {
    const policy = await this.prisma.reviewPolicy.findUnique({ where: { id } });
    if (!policy) {
      throw new NotFoundException(`Policy ${id} not found`);
    }

    return this.prisma.reviewPolicy.update({
      where: { id },
      data: dto as any,
    });
  }

  async deletePolicy(id: string): Promise<void> {
    const policy = await this.prisma.reviewPolicy.findUnique({ where: { id } });
    if (!policy) {
      throw new NotFoundException(`Policy ${id} not found`);
    }

    // Check for active reviews using this policy
    const activeReviewCount = await this.prisma.skillReview.count({
      where: {
        policyId: id,
        status: { in: ['PENDING_AUTO', 'PENDING_MANUAL', 'IN_REVIEW'] },
      },
    });

    if (activeReviewCount > 0) {
      throw new ConflictException(
        `Cannot delete policy: ${activeReviewCount} active review(s) are using it`,
      );
    }

    await this.prisma.reviewPolicy.delete({ where: { id } });
  }

  // ==========================================================
  // SYSTEM CONFIG
  // ==========================================================

  async getSystemConfig(): Promise<any[]> {
    return this.prisma.systemConfig.findMany({
      orderBy: { key: 'asc' },
    });
  }

  async updateSystemConfig(key: string, value: any): Promise<any> {
    return this.prisma.systemConfig.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }
}
