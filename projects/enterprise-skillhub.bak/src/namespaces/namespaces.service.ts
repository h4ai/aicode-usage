import {
  Injectable,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNamespaceDto } from './dto/create-namespace.dto';
import { AddMemberDto } from './dto/add-member.dto';

const NAMESPACE_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
const RESERVED_NAMES = ['system', 'official', 'skillhub'];

@Injectable()
export class NamespacesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new namespace. Creator becomes ADMIN automatically.
   */
  async create(dto: CreateNamespaceDto, user: any) {
    this.validateName(dto.name);

    const existing = await this.prisma.namespace.findUnique({
      where: { name: dto.name },
    });
    if (existing) {
      throw new ConflictException(`Namespace "${dto.name}" already exists`);
    }

    return this.prisma.namespace.create({
      data: {
        name: dto.name,
        description: dto.description || null,
        ownerId: user.sub,
        members: {
          create: {
            userId: user.sub,
            role: 'ADMIN',
          },
        },
      },
      include: {
        members: true,
        owner: { select: { id: true, displayName: true } },
      },
    });
  }

  /**
   * List namespaces the user has access to.
   * ADMIN users see all namespaces.
   */
  async findAll(user: any) {
    const where: any = user.role === 'ADMIN'
      ? {}
      : { members: { some: { userId: user.sub } } };

    return this.prisma.namespace.findMany({
      where,
      include: {
        members: true,
        owner: { select: { id: true, displayName: true } },
        _count: { select: { templates: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Add a member to a namespace. Only namespace ADMIN or global ADMIN.
   */
  async addMember(namespaceId: string, dto: AddMemberDto, user: any) {
    const namespace = await this.prisma.namespace.findUnique({
      where: { id: namespaceId },
    });
    if (!namespace) {
      throw new NotFoundException('Namespace not found');
    }

    await this.checkNamespaceAdmin(namespaceId, user);

    return this.prisma.namespaceMember.create({
      data: {
        namespaceId,
        userId: dto.userId,
        role: dto.role,
      },
    });
  }

  /**
   * Remove a member from namespace. Only namespace ADMIN or global ADMIN.
   */
  async removeMember(namespaceId: string, userId: string, user: any) {
    const namespace = await this.prisma.namespace.findUnique({
      where: { id: namespaceId },
    });
    if (!namespace) {
      throw new NotFoundException('Namespace not found');
    }

    await this.checkNamespaceAdmin(namespaceId, user);

    // Check target member exists
    const targetMember = await this.prisma.namespaceMember.findUnique({
      where: { namespaceId_userId: { namespaceId, userId } },
    });
    if (!targetMember) {
      throw new NotFoundException('Member not found in namespace');
    }

    await this.prisma.namespaceMember.delete({
      where: { id: targetMember.id },
    });

    return { success: true };
  }

  /**
   * Check if a user is a member of a namespace.
   */
  async checkMembership(namespaceId: string, userId: string): Promise<boolean> {
    const member = await this.prisma.namespaceMember.findUnique({
      where: { namespaceId_userId: { namespaceId, userId } },
    });
    return !!member;
  }

  // ==========================================================
  // Private helpers
  // ==========================================================

  private validateName(name: string): void {
    if (!name || name.length < 3 || name.length > 32) {
      throw new BadRequestException('Namespace name must be between 3 and 32 characters');
    }
    if (!NAMESPACE_REGEX.test(name)) {
      throw new BadRequestException(
        'Namespace name must be lowercase alphanumeric with hyphens, starting and ending with alphanumeric',
      );
    }
    if (RESERVED_NAMES.includes(name)) {
      throw new BadRequestException(`Namespace name "${name}" is reserved`);
    }
  }

  private async checkNamespaceAdmin(namespaceId: string, user: any): Promise<void> {
    // Global ADMIN can do anything
    if (user.role === 'ADMIN') return;

    const membership = await this.prisma.namespaceMember.findUnique({
      where: { namespaceId_userId: { namespaceId, userId: user.sub } },
    });

    if (!membership || membership.role !== 'ADMIN') {
      throw new ForbiddenException('Only namespace admins can perform this action');
    }
  }
}
