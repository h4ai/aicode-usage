import { Test, TestingModule } from '@nestjs/testing';
import { AdminService } from './admin.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';

// ============================================================
// TDD Test Suite: AdminService
// Written BEFORE implementation per Sprint 4 TDD mandate
// ============================================================

describe('AdminService', () => {
  let service: AdminService;
  let prisma: any;
  let auditService: any;

  const mockUser = {
    id: 'user-1',
    username: 'alice',
    displayName: 'Alice',
    email: 'alice@corp.com',
    department: 'Engineering',
    role: 'USER',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPolicy = {
    id: 'policy-1',
    name: 'Default Policy',
    category: null,
    department: null,
    autoApprove: false,
    autoApproveMinScore: 90,
    requiredReviews: 1,
    reviewerAdGroups: [],
    maxReviewDays: 3,
    timeoutHours: 72,
    blockOnSecurityFail: true,
    blockOnLicenseFail: true,
    requiredFiles: ['SKILL.md'],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockSystemConfig = {
    id: 'config-1',
    key: 'maintenance_mode',
    value: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
      reviewPolicy: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      skillReview: {
        count: jest.fn(),
      },
      systemConfig: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
    };

    auditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ==========================================================
  // USER MANAGEMENT
  // ==========================================================
  describe('listUsers', () => {
    it('should return paginated user list', async () => {
      prisma.user.findMany.mockResolvedValue([mockUser]);
      prisma.user.count.mockResolvedValue(1);

      const result = await service.listUsers({ page: 1, limit: 20, skip: 0 } as any);

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('total', 1);
      expect(result).toHaveProperty('page', 1);
      expect(result).toHaveProperty('limit', 20);
    });

    it('should filter by search keyword (name or email)', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      await service.listUsers({ search: 'alice', page: 1, limit: 20, skip: 0 } as any);

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { displayName: { contains: 'alice', mode: 'insensitive' } },
              { email: { contains: 'alice', mode: 'insensitive' } },
              { username: { contains: 'alice', mode: 'insensitive' } },
            ]),
          }),
        }),
      );
    });

    it('should filter by role', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      await service.listUsers({ role: 'ADMIN', page: 1, limit: 20, skip: 0 } as any);

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ role: 'ADMIN' }),
        }),
      );
    });

    it('should filter by department', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      await service.listUsers({ department: 'Engineering', page: 1, limit: 20, skip: 0 } as any);

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ department: 'Engineering' }),
        }),
      );
    });
  });

  describe('updateUserRole', () => {
    it('should update user role', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.user.update.mockResolvedValue({ ...mockUser, role: 'REVIEWER' });

      const result = await service.updateUserRole('user-1', 'REVIEWER', {
        sub: 'admin-1',
        role: 'ADMIN',
      });

      expect(result.role).toBe('REVIEWER');
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: { role: 'REVIEWER' },
        }),
      );
    });

    it('should create audit log on role change', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.user.update.mockResolvedValue({ ...mockUser, role: 'REVIEWER' });

      await service.updateUserRole('user-1', 'REVIEWER', {
        sub: 'admin-1',
        role: 'ADMIN',
      });

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'USER_ROLE_CHANGE',
          resource: 'user',
          resourceId: 'user-1',
        }),
      );
    });

    it('should throw NotFoundException if user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.updateUserRole('nonexistent', 'REVIEWER', { sub: 'admin-1', role: 'ADMIN' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject invalid role', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);

      await expect(
        service.updateUserRole('user-1', 'INVALID_ROLE' as any, { sub: 'admin-1', role: 'ADMIN' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateUserStatus', () => {
    it('should enable a disabled user', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...mockUser, isActive: false });
      prisma.user.update.mockResolvedValue({ ...mockUser, isActive: true });

      const result = await service.updateUserStatus('user-1', true, {
        sub: 'admin-1',
        role: 'ADMIN',
      });

      expect(result.isActive).toBe(true);
    });

    it('should disable an active user', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.user.update.mockResolvedValue({ ...mockUser, isActive: false });

      const result = await service.updateUserStatus('user-1', false, {
        sub: 'admin-1',
        role: 'ADMIN',
      });

      expect(result.isActive).toBe(false);
    });

    it('should create audit log on status change', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.user.update.mockResolvedValue({ ...mockUser, isActive: false });

      await service.updateUserStatus('user-1', false, {
        sub: 'admin-1',
        role: 'ADMIN',
      });

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'USER_STATUS_CHANGE',
          resource: 'user',
          resourceId: 'user-1',
        }),
      );
    });

    it('should throw NotFoundException if user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.updateUserStatus('nonexistent', true, { sub: 'admin-1', role: 'ADMIN' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ==========================================================
  // REVIEW POLICIES
  // ==========================================================
  describe('listPolicies', () => {
    it('should return all review policies', async () => {
      prisma.reviewPolicy.findMany.mockResolvedValue([mockPolicy]);

      const result = await service.listPolicies();

      expect(result).toEqual([mockPolicy]);
    });
  });

  describe('createPolicy', () => {
    it('should create a new review policy', async () => {
      prisma.reviewPolicy.create.mockResolvedValue(mockPolicy);

      const result = await service.createPolicy({
        name: 'Default Policy',
        autoApprove: false,
        requiredReviews: 1,
      } as any);

      expect(result).toEqual(mockPolicy);
    });

    it('should reject duplicate policy name', async () => {
      prisma.reviewPolicy.create.mockRejectedValue({
        code: 'P2002',
        meta: { target: ['name'] },
      });

      await expect(
        service.createPolicy({ name: 'Default Policy' } as any),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('updatePolicy', () => {
    it('should update a review policy', async () => {
      prisma.reviewPolicy.findUnique.mockResolvedValue(mockPolicy);
      prisma.reviewPolicy.update.mockResolvedValue({
        ...mockPolicy,
        autoApprove: true,
      });

      const result = await service.updatePolicy('policy-1', { autoApprove: true } as any);

      expect(result.autoApprove).toBe(true);
    });

    it('should throw NotFoundException if policy not found', async () => {
      prisma.reviewPolicy.findUnique.mockResolvedValue(null);

      await expect(
        service.updatePolicy('nonexistent', {} as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deletePolicy', () => {
    it('should delete a policy with no active reviews', async () => {
      prisma.reviewPolicy.findUnique.mockResolvedValue(mockPolicy);
      prisma.skillReview.count.mockResolvedValue(0);
      prisma.reviewPolicy.delete.mockResolvedValue(mockPolicy);

      await expect(
        service.deletePolicy('policy-1'),
      ).resolves.not.toThrow();
    });

    it('should reject deletion if policy has active reviews', async () => {
      prisma.reviewPolicy.findUnique.mockResolvedValue(mockPolicy);
      prisma.skillReview.count.mockResolvedValue(5);

      await expect(
        service.deletePolicy('policy-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException if policy not found', async () => {
      prisma.reviewPolicy.findUnique.mockResolvedValue(null);

      await expect(
        service.deletePolicy('nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ==========================================================
  // SYSTEM CONFIG
  // ==========================================================
  describe('getSystemConfig', () => {
    it('should return all system configs', async () => {
      prisma.systemConfig.findMany.mockResolvedValue([mockSystemConfig]);

      const result = await service.getSystemConfig();

      expect(result).toEqual([mockSystemConfig]);
    });
  });

  describe('updateSystemConfig', () => {
    it('should upsert a system config entry', async () => {
      prisma.systemConfig.upsert.mockResolvedValue({
        ...mockSystemConfig,
        value: true,
      });

      const result = await service.updateSystemConfig('maintenance_mode', true);

      expect(prisma.systemConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { key: 'maintenance_mode' },
          update: { value: true },
          create: { key: 'maintenance_mode', value: true },
        }),
      );
    });
  });
});
