import { Test, TestingModule } from '@nestjs/testing';
import { NamespacesService } from './namespaces.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';

describe('NamespacesService', () => {
  let service: NamespacesService;
  let prisma: any;

  const mockUser = { sub: 'user-1', role: 'PUBLISHER', department: 'Eng' };
  const mockAdminUser = { sub: 'admin-1', role: 'ADMIN', department: 'Eng' };

  const mockNamespace = {
    id: 'ns-1',
    name: 'backend-team',
    description: 'Backend team namespace',
    ownerId: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    members: [{ id: 'mem-1', namespaceId: 'ns-1', userId: 'user-1', role: 'ADMIN' }],
    owner: { id: 'user-1', displayName: 'User 1' },
  };

  beforeEach(async () => {
    const mockPrisma = {
      namespace: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      namespaceMember: {
        create: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NamespacesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<NamespacesService>(NamespacesService);
    prisma = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ==========================================================
  // CREATE NAMESPACE
  // ==========================================================
  describe('create', () => {
    it('should create a namespace and add creator as ADMIN', async () => {
      prisma.namespace.findUnique.mockResolvedValue(null);
      prisma.namespace.create.mockResolvedValue(mockNamespace);

      const result = await service.create({ name: 'backend-team', description: 'Backend team namespace' }, mockUser);

      expect(result).toEqual(mockNamespace);
      expect(prisma.namespace.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'backend-team',
            ownerId: 'user-1',
            members: expect.objectContaining({
              create: expect.objectContaining({
                userId: 'user-1',
                role: 'ADMIN',
              }),
            }),
          }),
        }),
      );
    });

    it('should throw ConflictException if namespace name already exists', async () => {
      prisma.namespace.findUnique.mockResolvedValue(mockNamespace);

      await expect(
        service.create({ name: 'backend-team' }, mockUser),
      ).rejects.toThrow(ConflictException);
    });

    it('should reject reserved namespace names (@system)', async () => {
      prisma.namespace.findUnique.mockResolvedValue(null);

      await expect(
        service.create({ name: 'system' }, mockUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject reserved namespace names (@official)', async () => {
      prisma.namespace.findUnique.mockResolvedValue(null);

      await expect(
        service.create({ name: 'official' }, mockUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject reserved namespace names (@skillhub)', async () => {
      prisma.namespace.findUnique.mockResolvedValue(null);

      await expect(
        service.create({ name: 'skillhub' }, mockUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject names shorter than 3 characters', async () => {
      await expect(
        service.create({ name: 'ab' }, mockUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject names with invalid characters', async () => {
      await expect(
        service.create({ name: 'Invalid_Name!' }, mockUser),
      ).rejects.toThrow(BadRequestException);
    });

    // === TC-003: Reserved namespace @system returns 403/400 ===
    it('TC-003: should reject "system" with clear reserved error message', async () => {
      prisma.namespace.findUnique.mockResolvedValue(null);

      await expect(
        service.create({ name: 'system' }, mockUser),
      ).rejects.toThrow(/reserved/i);
    });

    it('TC-003: should reject all reserved names with BadRequestException', async () => {
      prisma.namespace.findUnique.mockResolvedValue(null);
      const reservedNames = ['system', 'official', 'skillhub'];

      for (const name of reservedNames) {
        await expect(
          service.create({ name }, mockUser),
        ).rejects.toThrow(BadRequestException);
      }
    });

    // === TC-005: Namespace name format validation ===
    it('TC-005: should reject names longer than 32 characters', async () => {
      const longName = 'a'.repeat(33);
      await expect(
        service.create({ name: longName }, mockUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('TC-005: should reject names with spaces', async () => {
      await expect(
        service.create({ name: 'my namespace' }, mockUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('TC-005: should reject names with Chinese characters', async () => {
      await expect(
        service.create({ name: '团队空间' }, mockUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('TC-005: should reject names starting with hyphen', async () => {
      await expect(
        service.create({ name: '-my-team' }, mockUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('TC-005: should reject names ending with hyphen', async () => {
      await expect(
        service.create({ name: 'my-team-' }, mockUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('TC-005: should reject single-character names', async () => {
      await expect(
        service.create({ name: 'a' }, mockUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('TC-005: should reject names with uppercase letters', async () => {
      await expect(
        service.create({ name: 'MyTeam' }, mockUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('TC-005: should reject empty string name', async () => {
      await expect(
        service.create({ name: '' }, mockUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('TC-005: should accept valid names (3-32 chars, lowercase alphanumeric with hyphens)', async () => {
      prisma.namespace.findUnique.mockResolvedValue(null);
      prisma.namespace.create.mockResolvedValue(mockNamespace);

      // These should NOT throw
      const validNames = ['abc', 'my-team', 'backend-team-01', 'a1b'];
      for (const name of validNames) {
        prisma.namespace.findUnique.mockResolvedValue(null);
        prisma.namespace.create.mockResolvedValue({ ...mockNamespace, name });
        await expect(
          service.create({ name }, mockUser),
        ).resolves.toBeDefined();
      }
    });

    it('TC-005: should reject names with special characters (@, #, $, etc.)', async () => {
      const invalidNames = ['@team', 'team#1', '$team', 'team.name', 'team/name'];
      for (const name of invalidNames) {
        await expect(
          service.create({ name }, mockUser),
        ).rejects.toThrow(BadRequestException);
      }
    });
  });

  // ==========================================================
  // LIST NAMESPACES
  // ==========================================================
  describe('findAll', () => {
    it('should return namespaces the user is a member of', async () => {
      prisma.namespace.findMany.mockResolvedValue([mockNamespace]);

      const result = await service.findAll(mockUser);

      expect(result).toEqual([mockNamespace]);
      expect(prisma.namespace.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            members: { some: { userId: 'user-1' } },
          },
        }),
      );
    });

    it('should return all namespaces for ADMIN users', async () => {
      prisma.namespace.findMany.mockResolvedValue([mockNamespace]);

      const result = await service.findAll(mockAdminUser);

      expect(result).toEqual([mockNamespace]);
      expect(prisma.namespace.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
        }),
      );
    });
  });

  // ==========================================================
  // ADD MEMBER
  // ==========================================================
  describe('addMember', () => {
    it('should add a member to namespace when user is ADMIN of namespace', async () => {
      prisma.namespace.findUnique.mockResolvedValue(mockNamespace);
      prisma.namespaceMember.findUnique.mockResolvedValue({
        id: 'mem-1', userId: 'user-1', role: 'ADMIN', namespaceId: 'ns-1',
      });
      prisma.namespaceMember.create.mockResolvedValue({
        id: 'mem-2', namespaceId: 'ns-1', userId: 'user-2', role: 'MEMBER',
      });

      const result = await service.addMember('ns-1', { userId: 'user-2', role: 'MEMBER' as any }, mockUser);

      expect(result.userId).toBe('user-2');
    });

    it('should throw ForbiddenException if user is not namespace ADMIN', async () => {
      prisma.namespace.findUnique.mockResolvedValue(mockNamespace);
      prisma.namespaceMember.findUnique.mockResolvedValue({
        id: 'mem-1', userId: 'user-1', role: 'MEMBER', namespaceId: 'ns-1',
      });

      await expect(
        service.addMember('ns-1', { userId: 'user-2', role: 'MEMBER' as any }, mockUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if namespace not found', async () => {
      prisma.namespace.findUnique.mockResolvedValue(null);

      await expect(
        service.addMember('ns-999', { userId: 'user-2', role: 'MEMBER' as any }, mockUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('should allow global ADMIN to add members without namespace ADMIN role', async () => {
      prisma.namespace.findUnique.mockResolvedValue(mockNamespace);
      prisma.namespaceMember.findUnique.mockResolvedValue(null); // not a member
      prisma.namespaceMember.create.mockResolvedValue({
        id: 'mem-2', namespaceId: 'ns-1', userId: 'user-2', role: 'MEMBER',
      });

      const result = await service.addMember('ns-1', { userId: 'user-2', role: 'MEMBER' as any }, mockAdminUser);

      expect(result.userId).toBe('user-2');
    });
  });

  // ==========================================================
  // REMOVE MEMBER
  // ==========================================================
  describe('removeMember', () => {
    it('should remove a member from namespace', async () => {
      prisma.namespace.findUnique.mockResolvedValue(mockNamespace);
      prisma.namespaceMember.findUnique
        .mockResolvedValueOnce({ id: 'mem-1', userId: 'user-1', role: 'ADMIN', namespaceId: 'ns-1' }) // caller check
        .mockResolvedValueOnce({ id: 'mem-2', userId: 'user-2', role: 'MEMBER', namespaceId: 'ns-1' }); // target check
      prisma.namespaceMember.delete.mockResolvedValue({ id: 'mem-2' });

      const result = await service.removeMember('ns-1', 'user-2', mockUser);

      expect(result).toEqual({ success: true });
    });

    it('should throw ForbiddenException if non-admin tries to remove member', async () => {
      prisma.namespace.findUnique.mockResolvedValue(mockNamespace);
      prisma.namespaceMember.findUnique.mockResolvedValue({
        id: 'mem-1', userId: 'user-1', role: 'MEMBER', namespaceId: 'ns-1',
      });

      await expect(
        service.removeMember('ns-1', 'user-2', mockUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if target member not found', async () => {
      prisma.namespace.findUnique.mockResolvedValue(mockNamespace);
      prisma.namespaceMember.findUnique
        .mockResolvedValueOnce({ id: 'mem-1', userId: 'user-1', role: 'ADMIN', namespaceId: 'ns-1' })
        .mockResolvedValueOnce(null);

      await expect(
        service.removeMember('ns-1', 'user-999', mockUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ==========================================================
  // CHECK MEMBERSHIP
  // ==========================================================
  describe('checkMembership', () => {
    it('should return true if user is a member', async () => {
      prisma.namespaceMember.findUnique.mockResolvedValue({
        id: 'mem-1', userId: 'user-1', role: 'MEMBER',
      });

      const result = await service.checkMembership('ns-1', 'user-1');
      expect(result).toBe(true);
    });

    it('should return false if user is not a member', async () => {
      prisma.namespaceMember.findUnique.mockResolvedValue(null);

      const result = await service.checkMembership('ns-1', 'user-999');
      expect(result).toBe(false);
    });
  });
});
