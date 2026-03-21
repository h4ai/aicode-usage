import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DepartmentVisibilityGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const { slug } = request.params;

    // If no slug param, this guard doesn't apply
    if (!slug) {
      return true;
    }

    const skill = await this.prisma.skill.findUnique({
      where: { slug },
      include: { owner: { select: { department: true } } },
    });

    if (!skill) {
      return false;
    }

    // ADMIN can access everything
    if (user.role === 'ADMIN') {
      return true;
    }

    switch (skill.visibility) {
      case 'PUBLIC':
        return true;

      case 'DEPARTMENT':
        // Only users in the same department as the skill owner can access
        return user.department === skill.owner.department;

      case 'PRIVATE':
        // Only the owner can access
        return user.sub === skill.ownerId;

      default:
        return false;
    }
  }
}
