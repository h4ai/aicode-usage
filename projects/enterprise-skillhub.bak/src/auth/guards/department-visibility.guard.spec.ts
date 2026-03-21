import { ExecutionContext } from '@nestjs/common';
import { DepartmentVisibilityGuard } from './department-visibility.guard';
import { PrismaService } from '../../prisma/prisma.service';

// ============================================================
// TDD — RED Phase: All tests written BEFORE implementation
// ============================================================

describe('DepartmentVisibilityGuard', () => {
  let guard: DepartmentVisibilityGuard;
  let prismaService: PrismaService;

  const mockPublicSkill = {
    id: 'skill-001',
    visibility: 'PUBLIC',
    ownerId: 'user-002',
    owner: { department: 'Marketing' },
  };

  const mockDepartmentSkill = {
    id: 'skill-002',
    visibility: 'DEPARTMENT',
    ownerId: 'user-002',
    owner: { department: 'Engineering' },
  };

  const mockPrivateSkill = {
    id: 'skill-003',
    visibility: 'PRIVATE',
    ownerId: 'user-002',
    owner: { department: 'Engineering' },
  };

  beforeEach(() => {
    prismaService = {
      skill: {
        findUnique: jest.fn(),
      },
    } as unknown as PrismaService;
    guard = new DepartmentVisibilityGuard(prismaService);
  });

  const createMockContext = (
    userId: string,
    userRole: string,
    userDepartment: string,
    params: Record<string, string> = {},
  ): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { sub: userId, role: userRole, department: userDepartment },
          params,
        }),
      }),
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
    } as unknown as ExecutionContext;
  };

  it('should allow access to PUBLIC skills for any user', async () => {
    (prismaService.skill.findUnique as jest.Mock).mockResolvedValue(mockPublicSkill);
    const context = createMockContext('user-100', 'USER', 'Sales', { slug: 'my-skill' });
    expect(await guard.canActivate(context)).toBe(true);
  });

  it('should allow access to DEPARTMENT skills for same department', async () => {
    (prismaService.skill.findUnique as jest.Mock).mockResolvedValue(mockDepartmentSkill);
    const context = createMockContext('user-100', 'USER', 'Engineering', { slug: 'my-skill' });
    expect(await guard.canActivate(context)).toBe(true);
  });

  it('should deny access to DEPARTMENT skills for different department', async () => {
    (prismaService.skill.findUnique as jest.Mock).mockResolvedValue(mockDepartmentSkill);
    const context = createMockContext('user-100', 'USER', 'Marketing', { slug: 'my-skill' });
    expect(await guard.canActivate(context)).toBe(false);
  });

  it('should allow access to PRIVATE skills for owner only', async () => {
    (prismaService.skill.findUnique as jest.Mock).mockResolvedValue(mockPrivateSkill);
    const context = createMockContext('user-002', 'USER', 'Engineering', { slug: 'my-skill' });
    expect(await guard.canActivate(context)).toBe(true);
  });

  it('should deny access to PRIVATE skills for non-owner', async () => {
    (prismaService.skill.findUnique as jest.Mock).mockResolvedValue(mockPrivateSkill);
    const context = createMockContext('user-100', 'USER', 'Engineering', { slug: 'my-skill' });
    expect(await guard.canActivate(context)).toBe(false);
  });

  it('should allow ADMIN to access any skill regardless of visibility', async () => {
    (prismaService.skill.findUnique as jest.Mock).mockResolvedValue(mockPrivateSkill);
    const context = createMockContext('user-admin', 'ADMIN', 'IT', { slug: 'my-skill' });
    expect(await guard.canActivate(context)).toBe(true);
  });

  it('should return true when no slug parameter exists (non-skill routes)', async () => {
    const context = createMockContext('user-100', 'USER', 'Engineering', {});
    expect(await guard.canActivate(context)).toBe(true);
  });

  it('should return false when skill is not found', async () => {
    (prismaService.skill.findUnique as jest.Mock).mockResolvedValue(null);
    const context = createMockContext('user-100', 'USER', 'Engineering', { slug: 'non-existent' });
    expect(await guard.canActivate(context)).toBe(false);
  });
});
