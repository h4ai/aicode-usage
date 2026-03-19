import { Test, TestingModule } from '@nestjs/testing';
import { SkillsController } from './skills.controller';
import { SkillsService } from './skills.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

// ============================================================
// TDD Test Suite: SkillsController
// Written BEFORE implementation per Sprint 2 TDD mandate
// ============================================================

describe('SkillsController', () => {
  let controller: SkillsController;
  let service: jest.Mocked<SkillsService>;

  const mockUser = {
    sub: 'user-1',
    role: 'PUBLISHER',
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
    downloadCount: 0,
    installCount: 0,
    starCount: 0,
    tags: ['test'],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const paginatedResult = {
    data: [mockSkill],
    total: 1,
    page: 1,
    limit: 20,
    totalPages: 1,
  };

  beforeEach(async () => {
    const mockService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      incrementCounter: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SkillsController],
      providers: [{ provide: SkillsService, useValue: mockService }],
    }).compile();

    controller = module.get<SkillsController>(SkillsController);
    service = module.get(SkillsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ==========================================================
  // POST /api/v1/skills
  // ==========================================================
  describe('create', () => {
    const createDto = {
      name: 'Test Skill',
      slug: 'test-skill',
      summary: 'A test skill',
      tags: ['test'],
    };

    it('should create a skill and return it', async () => {
      service.create.mockResolvedValue(mockSkill as any);

      const req = { user: mockUser };
      const result = await controller.create(createDto as any, req as any);

      expect(result).toEqual(mockSkill);
      expect(service.create).toHaveBeenCalledWith(createDto, mockUser);
    });
  });

  // ==========================================================
  // GET /api/v1/skills
  // ==========================================================
  describe('findAll', () => {
    it('should return paginated results', async () => {
      service.findAll.mockResolvedValue(paginatedResult as any);

      const req = { user: mockUser };
      const query = { page: 1, limit: 20, skip: 0 };
      const result = await controller.findAll(query as any, req as any);

      expect(result).toEqual(paginatedResult);
      expect(result.data).toHaveLength(1);
    });

    it('should pass category filter to service', async () => {
      service.findAll.mockResolvedValue({ ...paginatedResult, data: [] } as any);

      const req = { user: mockUser };
      const query = { page: 1, limit: 20, skip: 0, category: 'DEVELOPMENT' };
      await controller.findAll(query as any, req as any);

      expect(service.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'DEVELOPMENT' }),
        mockUser,
      );
    });

    it('should pass search term to service', async () => {
      service.findAll.mockResolvedValue({ ...paginatedResult, data: [] } as any);

      const req = { user: mockUser };
      const query = { page: 1, limit: 20, skip: 0, search: 'test' };
      await controller.findAll(query as any, req as any);

      expect(service.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'test' }),
        mockUser,
      );
    });
  });

  // ==========================================================
  // GET /api/v1/skills/:slug
  // ==========================================================
  describe('findOne', () => {
    it('should return a skill by slug', async () => {
      service.findOne.mockResolvedValue(mockSkill as any);

      const req = { user: mockUser };
      const result = await controller.findOne('test-skill', req as any);

      expect(result).toEqual(mockSkill);
      expect(service.findOne).toHaveBeenCalledWith('test-skill', mockUser);
    });

    it('should propagate NotFoundException', async () => {
      service.findOne.mockRejectedValue(new NotFoundException());

      const req = { user: mockUser };
      await expect(
        controller.findOne('nonexistent', req as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ==========================================================
  // PATCH /api/v1/skills/:slug
  // ==========================================================
  describe('update', () => {
    const updateDto = { name: 'Updated Name' };

    it('should update and return the skill', async () => {
      service.update.mockResolvedValue({ ...mockSkill, name: 'Updated Name' } as any);

      const req = { user: mockUser };
      const result = await controller.update('test-skill', updateDto as any, req as any);

      expect(result.name).toBe('Updated Name');
      expect(service.update).toHaveBeenCalledWith('test-skill', updateDto, mockUser);
    });

    it('should propagate ForbiddenException', async () => {
      service.update.mockRejectedValue(new ForbiddenException());

      const req = { user: mockUser };
      await expect(
        controller.update('test-skill', updateDto as any, req as any),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ==========================================================
  // DELETE /api/v1/skills/:slug
  // ==========================================================
  describe('remove', () => {
    it('should soft delete and return result', async () => {
      service.remove.mockResolvedValue({
        ...mockSkill,
        moderationStatus: 'REMOVED',
      } as any);

      const req = { user: mockUser };
      const result = await controller.remove('test-skill', req as any);

      expect(result.moderationStatus).toBe('REMOVED');
      expect(service.remove).toHaveBeenCalledWith('test-skill', mockUser);
    });

    it('should propagate ForbiddenException for non-owner', async () => {
      service.remove.mockRejectedValue(new ForbiddenException());

      const req = { user: mockUser };
      await expect(
        controller.remove('test-skill', req as any),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ==========================================================
  // POST /api/v1/skills/:id/download — increment counter
  // ==========================================================
  describe('incrementDownload', () => {
    it('should increment download count', async () => {
      service.incrementCounter.mockResolvedValue({
        ...mockSkill,
        downloadCount: 1,
      } as any);

      const result = await controller.incrementDownload('skill-1');

      expect(service.incrementCounter).toHaveBeenCalledWith(
        'skill-1',
        'downloadCount',
      );
      expect(result.downloadCount).toBe(1);
    });
  });
});
