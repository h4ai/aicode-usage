import { Test, TestingModule } from '@nestjs/testing';
import { SkillsService } from './skills.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';

// ============================================================
// TDD Test Suite: SkillsService
// Written BEFORE implementation per Sprint 2 TDD mandate
// ============================================================

describe('SkillsService', () => {
  let service: SkillsService;
  let prisma: jest.Mocked<PrismaService>;
  let cacheManager: { get: jest.Mock; set: jest.Mock; del: jest.Mock };

  const mockUser = {
    sub: 'user-1',
    role: 'PUBLISHER',
    department: 'Engineering',
  };

  const mockAdminUser = {
    sub: 'admin-1',
    role: 'ADMIN',
    department: 'Engineering',
  };

  const mockSkill = {
    id: 'skill-1',
    name: 'Test Skill',
    slug: 'test-skill',
    summary: 'A test skill',
    category: 'GENERAL',
    visibility: 'PUBLIC',
    moderationStatus: 'ACTIVE',
    ownerId: 'user-1',
    latestVersionId: null,
    publishedVersionId: null,
    downloadCount: 0,
    installCount: 0,
    starCount: 0,
    badges: null,
    tags: ['test', 'demo'],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    owner: {
      id: 'user-1',
      displayName: 'Test User',
      department: 'Engineering',
    },
  };

  beforeEach(async () => {
    const mockPrisma = {
      skill: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    cacheManager = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SkillsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CACHE_MANAGER, useValue: cacheManager },
        {
          provide: StorageService,
          useValue: {
            uploadFile: jest.fn(),
            getPresignedUrl: jest.fn(),
            deleteFile: jest.fn(),
            validateZipMagicBytes: jest.fn(),
            validateZipEntries: jest.fn(),
            validateSkillMdPresence: jest.fn(),
            ensureBucket: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SkillsService>(SkillsService);
    prisma = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ==========================================================
  // CREATE
  // ==========================================================
  describe('create', () => {
    const createDto = {
      name: 'Test Skill',
      slug: 'test-skill',
      summary: 'A test skill',
      category: 'GENERAL' as const,
      tags: ['test', 'demo'],
    };

    it('should create a skill with valid data', async () => {
      (prisma.skill.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.skill.create as jest.Mock).mockResolvedValue(mockSkill);

      const result = await service.create(createDto, mockUser);

      expect(result).toEqual(mockSkill);
      expect(prisma.skill.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Test Skill',
            slug: 'test-skill',
            ownerId: 'user-1',
          }),
        }),
      );
    });

    it('should throw ConflictException if slug already exists', async () => {
      (prisma.skill.findUnique as jest.Mock).mockResolvedValue(mockSkill);

      await expect(service.create(createDto, mockUser)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should reject invalid slug format', async () => {
      const invalidDto = { ...createDto, slug: 'INVALID_SLUG!' };
      (prisma.skill.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.create(invalidDto, mockUser)).rejects.toThrow();
    });

    it('should reject slug shorter than 3 characters', async () => {
      const shortDto = { ...createDto, slug: 'ab' };
      (prisma.skill.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.create(shortDto, mockUser)).rejects.toThrow();
    });

    it('should reject slug longer than 64 characters', async () => {
      const longDto = { ...createDto, slug: 'a'.repeat(65) };
      (prisma.skill.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.create(longDto, mockUser)).rejects.toThrow();
    });

    it('should set default category to GENERAL', async () => {
      const noCategory = { name: 'No Cat', slug: 'no-cat', tags: [] };
      (prisma.skill.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.skill.create as jest.Mock).mockResolvedValue({
        ...mockSkill,
        ...noCategory,
        category: 'GENERAL',
      });

      await service.create(noCategory, mockUser);

      expect(prisma.skill.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ category: 'GENERAL' }),
        }),
      );
    });
  });

  // ==========================================================
  // FIND ALL (list with pagination)
  // ==========================================================
  describe('findAll', () => {
    const queryDto = {
      page: 1,
      limit: 20,
      get skip() { return (this.page - 1) * this.limit; },
    };

    it('should return paginated skills list', async () => {
      (prisma.skill.findMany as jest.Mock).mockResolvedValue([mockSkill]);
      (prisma.skill.count as jest.Mock).mockResolvedValue(1);

      const result = await service.findAll(queryDto as any, mockUser);

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('page', 1);
      expect(result).toHaveProperty('limit', 20);
      expect(result).toHaveProperty('totalPages');
    });

    it('should filter by category', async () => {
      const withCategory = { ...queryDto, category: 'DEVELOPMENT' };
      (prisma.skill.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.skill.count as jest.Mock).mockResolvedValue(0);

      await service.findAll(withCategory as any, mockUser);

      expect(prisma.skill.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ category: 'DEVELOPMENT' }),
        }),
      );
    });

    it('should filter by search term (name or summary)', async () => {
      const withSearch = { ...queryDto, search: 'test' };
      (prisma.skill.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.skill.count as jest.Mock).mockResolvedValue(0);

      await service.findAll(withSearch as any, mockUser);

      expect(prisma.skill.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({
                name: expect.objectContaining({ contains: 'test' }),
              }),
            ]),
          }),
        }),
      );
    });

    it('should filter by tags (array contains)', async () => {
      const withTags = { ...queryDto, tags: ['test'] };
      (prisma.skill.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.skill.count as jest.Mock).mockResolvedValue(0);

      await service.findAll(withTags as any, mockUser);

      expect(prisma.skill.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tags: expect.objectContaining({ hasEvery: ['test'] }),
          }),
        }),
      );
    });

    it('should filter out REMOVED skills', async () => {
      (prisma.skill.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.skill.count as jest.Mock).mockResolvedValue(0);

      await service.findAll(queryDto as any, mockUser);

      expect(prisma.skill.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            moderationStatus: { not: 'REMOVED' },
          }),
        }),
      );
    });

    it('should apply visibility filtering for non-admin users', async () => {
      (prisma.skill.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.skill.count as jest.Mock).mockResolvedValue(0);

      await service.findAll(queryDto as any, mockUser);

      // Non-admin should see PUBLIC + own PRIVATE + department DEPARTMENT
      expect(prisma.skill.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { visibility: 'PUBLIC' },
            ]),
          }),
        }),
      );
    });

    it('should use Redis cache for popular sort', async () => {
      const popularQuery = { ...queryDto, sort: 'popular' };
      cacheManager.get.mockResolvedValue(null);
      (prisma.skill.findMany as jest.Mock).mockResolvedValue([mockSkill]);
      (prisma.skill.count as jest.Mock).mockResolvedValue(1);

      await service.findAll(popularQuery as any, mockUser);

      // Should attempt cache read
      expect(cacheManager.get).toHaveBeenCalled();
    });

    it('should return cached result if available for popular', async () => {
      const popularQuery = { ...queryDto, sort: 'popular' };
      const cachedResult = {
        data: [mockSkill],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      };
      cacheManager.get.mockResolvedValue(cachedResult);

      const result = await service.findAll(popularQuery as any, mockUser);

      expect(result).toEqual(cachedResult);
      expect(prisma.skill.findMany).not.toHaveBeenCalled();
    });

    it('should cap limit to 100', async () => {
      const bigLimit = { ...queryDto, limit: 200, get skip() { return 0; } };
      (prisma.skill.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.skill.count as jest.Mock).mockResolvedValue(0);

      await service.findAll(bigLimit as any, mockUser);

      expect(prisma.skill.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100,
        }),
      );
    });
  });

  // ==========================================================
  // FIND ONE
  // ==========================================================
  describe('findOne', () => {
    it('should return a skill by slug', async () => {
      (prisma.skill.findUnique as jest.Mock).mockResolvedValue(mockSkill);

      const result = await service.findOne('test-skill', mockUser);

      expect(result).toEqual(mockSkill);
    });

    it('should throw NotFoundException if skill does not exist', async () => {
      (prisma.skill.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.findOne('nonexistent', mockUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for REMOVED skills', async () => {
      (prisma.skill.findUnique as jest.Mock).mockResolvedValue({
        ...mockSkill,
        moderationStatus: 'REMOVED',
      });

      await expect(
        service.findOne('test-skill', mockUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('should allow admin to see PRIVATE skills', async () => {
      const privateSkill = {
        ...mockSkill,
        visibility: 'PRIVATE',
        ownerId: 'other-user',
        owner: { ...mockSkill.owner, id: 'other-user' },
      };
      (prisma.skill.findUnique as jest.Mock).mockResolvedValue(privateSkill);

      const result = await service.findOne('test-skill', mockAdminUser);
      expect(result).toEqual(privateSkill);
    });

    it('should block non-owner from PRIVATE skills', async () => {
      const privateSkill = {
        ...mockSkill,
        visibility: 'PRIVATE',
        ownerId: 'other-user',
        owner: { ...mockSkill.owner, id: 'other-user' },
      };
      (prisma.skill.findUnique as jest.Mock).mockResolvedValue(privateSkill);

      await expect(
        service.findOne('test-skill', mockUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow same-department user for DEPARTMENT skills', async () => {
      const deptSkill = {
        ...mockSkill,
        visibility: 'DEPARTMENT',
        ownerId: 'other-user',
        owner: { ...mockSkill.owner, id: 'other-user', department: 'Engineering' },
      };
      (prisma.skill.findUnique as jest.Mock).mockResolvedValue(deptSkill);

      const result = await service.findOne('test-skill', mockUser);
      expect(result).toEqual(deptSkill);
    });

    it('should block different-department user for DEPARTMENT skills', async () => {
      const deptSkill = {
        ...mockSkill,
        visibility: 'DEPARTMENT',
        ownerId: 'other-user',
        owner: { ...mockSkill.owner, id: 'other-user', department: 'Marketing' },
      };
      (prisma.skill.findUnique as jest.Mock).mockResolvedValue(deptSkill);

      const diffDeptUser = { ...mockUser, department: 'Sales' };
      await expect(
        service.findOne('test-skill', diffDeptUser),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ==========================================================
  // UPDATE
  // ==========================================================
  describe('update', () => {
    const updateDto = { name: 'Updated Skill', summary: 'Updated summary' };

    it('should update a skill by owner', async () => {
      (prisma.skill.findUnique as jest.Mock).mockResolvedValue(mockSkill);
      (prisma.skill.update as jest.Mock).mockResolvedValue({
        ...mockSkill,
        ...updateDto,
      });

      const result = await service.update('test-skill', updateDto, mockUser);

      expect(result.name).toBe('Updated Skill');
      expect(prisma.skill.update).toHaveBeenCalled();
    });

    it('should allow admin to update any skill', async () => {
      const otherSkill = { ...mockSkill, ownerId: 'other-user' };
      (prisma.skill.findUnique as jest.Mock).mockResolvedValue(otherSkill);
      (prisma.skill.update as jest.Mock).mockResolvedValue({
        ...otherSkill,
        ...updateDto,
      });

      const result = await service.update('test-skill', updateDto, mockAdminUser);

      expect(result.name).toBe('Updated Skill');
    });

    it('should throw ForbiddenException for non-owner non-admin', async () => {
      const otherSkill = { ...mockSkill, ownerId: 'other-user' };
      (prisma.skill.findUnique as jest.Mock).mockResolvedValue(otherSkill);

      await expect(
        service.update('test-skill', updateDto, mockUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if skill not found', async () => {
      (prisma.skill.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.update('nonexistent', updateDto, mockUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('should invalidate cache on update', async () => {
      (prisma.skill.findUnique as jest.Mock).mockResolvedValue(mockSkill);
      (prisma.skill.update as jest.Mock).mockResolvedValue({
        ...mockSkill,
        ...updateDto,
      });

      await service.update('test-skill', updateDto, mockUser);

      expect(cacheManager.del).toHaveBeenCalled();
    });
  });

  // ==========================================================
  // SOFT DELETE
  // ==========================================================
  describe('remove (soft delete)', () => {
    it('should soft delete by setting moderationStatus to REMOVED', async () => {
      (prisma.skill.findUnique as jest.Mock).mockResolvedValue(mockSkill);
      (prisma.skill.update as jest.Mock).mockResolvedValue({
        ...mockSkill,
        moderationStatus: 'REMOVED',
      });

      const result = await service.remove('test-skill', mockUser);

      expect(result.moderationStatus).toBe('REMOVED');
      expect(prisma.skill.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ moderationStatus: 'REMOVED' }),
        }),
      );
    });

    it('should throw ForbiddenException for non-owner non-admin', async () => {
      const otherSkill = { ...mockSkill, ownerId: 'other-user' };
      (prisma.skill.findUnique as jest.Mock).mockResolvedValue(otherSkill);

      await expect(
        service.remove('test-skill', mockUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow admin to soft delete', async () => {
      const otherSkill = { ...mockSkill, ownerId: 'other-user' };
      (prisma.skill.findUnique as jest.Mock).mockResolvedValue(otherSkill);
      (prisma.skill.update as jest.Mock).mockResolvedValue({
        ...otherSkill,
        moderationStatus: 'REMOVED',
      });

      const result = await service.remove('test-skill', mockAdminUser);
      expect(result.moderationStatus).toBe('REMOVED');
    });

    it('should invalidate cache on deletion', async () => {
      (prisma.skill.findUnique as jest.Mock).mockResolvedValue(mockSkill);
      (prisma.skill.update as jest.Mock).mockResolvedValue({
        ...mockSkill,
        moderationStatus: 'REMOVED',
      });

      await service.remove('test-skill', mockUser);

      expect(cacheManager.del).toHaveBeenCalled();
    });
  });

  // ==========================================================
  // STATS: increment counters atomically
  // ==========================================================
  describe('incrementCounter', () => {
    it('should atomically increment downloadCount', async () => {
      (prisma.skill.update as jest.Mock).mockResolvedValue({
        ...mockSkill,
        downloadCount: 1,
      });

      const result = await service.incrementCounter('skill-1', 'downloadCount');

      expect(prisma.skill.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'skill-1' },
          data: { downloadCount: { increment: 1 } },
        }),
      );
      expect(result.downloadCount).toBe(1);
    });

    it('should atomically increment installCount', async () => {
      (prisma.skill.update as jest.Mock).mockResolvedValue({
        ...mockSkill,
        installCount: 1,
      });

      const result = await service.incrementCounter('skill-1', 'installCount');

      expect(prisma.skill.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { installCount: { increment: 1 } },
        }),
      );
    });

    it('should atomically increment starCount', async () => {
      (prisma.skill.update as jest.Mock).mockResolvedValue({
        ...mockSkill,
        starCount: 1,
      });

      const result = await service.incrementCounter('skill-1', 'starCount');

      expect(prisma.skill.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { starCount: { increment: 1 } },
        }),
      );
    });

    it('should reject invalid counter field names', async () => {
      await expect(
        service.incrementCounter('skill-1', 'invalidField' as any),
      ).rejects.toThrow();
    });
  });
});
