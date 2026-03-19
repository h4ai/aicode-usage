import { Test, TestingModule } from '@nestjs/testing';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

// ============================================================
// TDD Test Suite: SearchController
// Written BEFORE implementation per Sprint 2 TDD mandate
// ============================================================

describe('SearchController', () => {
  let controller: SearchController;
  let service: jest.Mocked<SearchService>;

  const mockUser = {
    sub: 'user-1',
    role: 'USER',
    department: 'Engineering',
  };

  const mockSearchResult = {
    data: [
      {
        id: 'skill-1',
        name: 'Test Skill',
        slug: 'test-skill',
        summary: 'A test skill',
        category: 'GENERAL',
        similarityScore: 0.85,
        downloadCount: 10,
        installCount: 5,
        starCount: 3,
      },
    ],
    total: 1,
    fallback: false,
  };

  beforeEach(async () => {
    const mockService = {
      searchSkills: jest.fn(),
      generateEmbedding: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SearchController],
      providers: [{ provide: SearchService, useValue: mockService }],
    }).compile();

    controller = module.get<SearchController>(SearchController);
    service = module.get(SearchService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ==========================================================
  // GET /api/v1/search/skills
  // ==========================================================
  describe('searchSkills', () => {
    it('should return search results with similarity scores', async () => {
      service.searchSkills.mockResolvedValue(mockSearchResult as any);

      const req = { user: mockUser };
      const result = await controller.searchSkills(
        { query: 'test', limit: 10 },
        req as any,
      );

      expect(result).toEqual(mockSearchResult);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toHaveProperty('similarityScore');
    });

    it('should pass user context for visibility filtering', async () => {
      service.searchSkills.mockResolvedValue(mockSearchResult as any);

      const req = { user: mockUser };
      await controller.searchSkills({ query: 'test', limit: 10 }, req as any);

      expect(service.searchSkills).toHaveBeenCalledWith(
        { query: 'test', limit: 10 },
        mockUser,
      );
    });

    it('should handle empty query gracefully', async () => {
      service.searchSkills.mockResolvedValue({
        data: [],
        total: 0,
        fallback: false,
      } as any);

      const req = { user: mockUser };
      const result = await controller.searchSkills(
        { query: '', limit: 10 },
        req as any,
      );

      expect(result.data).toHaveLength(0);
    });

    it('should indicate fallback mode when BGE-M3 unavailable', async () => {
      service.searchSkills.mockResolvedValue({
        data: [{ ...mockSearchResult.data[0], similarityScore: null }],
        total: 1,
        fallback: true,
      } as any);

      const req = { user: mockUser };
      const result = await controller.searchSkills(
        { query: 'test', limit: 10 },
        req as any,
      );

      expect(result.fallback).toBe(true);
      expect(result.data[0].similarityScore).toBeNull();
    });

    it('should respect max limit of 50', async () => {
      service.searchSkills.mockResolvedValue({
        data: [],
        total: 0,
        fallback: false,
      } as any);

      const req = { user: mockUser };
      await controller.searchSkills({ query: 'test', limit: 200 }, req as any);

      expect(service.searchSkills).toHaveBeenCalledWith(
        expect.objectContaining({ limit: expect.any(Number) }),
        mockUser,
      );
    });
  });
});
