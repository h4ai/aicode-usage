import { Test, TestingModule } from '@nestjs/testing';
import { SearchService } from './search.service';
import { PrismaService } from '../prisma/prisma.service';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '../config/config.service';
import { of, throwError } from 'rxjs';

// ============================================================
// TDD Test Suite: SearchService
// Written BEFORE implementation per Sprint 2 TDD mandate
// ============================================================

describe('SearchService', () => {
  let service: SearchService;
  let prisma: any;
  let httpService: jest.Mocked<HttpService>;
  let configService: any;

  const mockUser = {
    sub: 'user-1',
    role: 'USER',
    department: 'Engineering',
  };

  const mockAdminUser = {
    sub: 'admin-1',
    role: 'ADMIN',
    department: 'Engineering',
  };

  const mockEmbedding = Array(1024).fill(0.1);

  const mockSearchResult = [
    {
      id: 'skill-1',
      name: 'Test Skill',
      slug: 'test-skill',
      summary: 'A test skill',
      category: 'GENERAL',
      similarity_score: 0.85,
      download_count: 10,
      install_count: 5,
      star_count: 3,
    },
  ];

  beforeEach(async () => {
    const mockPrisma = {
      $queryRaw: jest.fn(),
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    };

    const mockHttpService = {
      post: jest.fn(),
    };

    configService = {
      bgeM3Url: 'http://localhost:8080/v1/encode',
      bgeM3Timeout: 5000,
      bgeM3BatchSize: 32,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: HttpService, useValue: mockHttpService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);
    prisma = module.get(PrismaService);
    httpService = module.get(HttpService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ==========================================================
  // Embedding generation
  // ==========================================================
  describe('generateEmbedding', () => {
    it('should call BGE-M3 API and return embedding vector', async () => {
      httpService.post.mockReturnValue(
        of({
          data: { embeddings: [mockEmbedding] },
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {} as any,
        }) as any,
      );

      const result = await service.generateEmbedding('test query');

      expect(result).toEqual(mockEmbedding);
      expect(httpService.post).toHaveBeenCalledWith(
        'http://localhost:8080/v1/encode',
        expect.objectContaining({ texts: ['test query'] }),
        expect.objectContaining({ timeout: 5000 }),
      );
    });

    it('should return null when BGE-M3 is unavailable (graceful degradation)', async () => {
      httpService.post.mockReturnValue(
        throwError(() => new Error('Connection refused')),
      );

      const result = await service.generateEmbedding('test query');

      expect(result).toBeNull();
    });

    it('should return null on timeout', async () => {
      httpService.post.mockReturnValue(
        throwError(() => {
          const err = new Error('timeout');
          (err as any).code = 'ECONNABORTED';
          return err;
        }),
      );

      const result = await service.generateEmbedding('test query');

      expect(result).toBeNull();
    });
  });

  // ==========================================================
  // Semantic search
  // ==========================================================
  describe('searchSkills', () => {
    it('should perform vector similarity search when embedding available', async () => {
      httpService.post.mockReturnValue(
        of({
          data: { embeddings: [mockEmbedding] },
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {} as any,
        }) as any,
      );

      prisma.$queryRawUnsafe.mockResolvedValue(mockSearchResult);

      const result = await service.searchSkills(
        { query: 'test', limit: 10 },
        mockUser,
      );

      expect(result).toBeDefined();
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toHaveProperty('similarityScore');
      expect(prisma.$queryRawUnsafe).toHaveBeenCalled();
    });

    it('should fall back to ILIKE text search when embedding unavailable', async () => {
      httpService.post.mockReturnValue(
        throwError(() => new Error('Connection refused')),
      );

      prisma.$queryRawUnsafe.mockResolvedValue(mockSearchResult);

      const result = await service.searchSkills(
        { query: 'test', limit: 10 },
        mockUser,
      );

      expect(result.data).toBeDefined();
      // In fallback mode, similarityScore should be null
      expect(result.data[0].similarityScore).toBeNull();
    });

    it('should use parameterized queries (SQL injection protection)', async () => {
      httpService.post.mockReturnValue(
        throwError(() => new Error('unavailable')),
      );
      prisma.$queryRawUnsafe.mockResolvedValue([]);

      // Attempt injection
      await service.searchSkills(
        { query: "'; DROP TABLE skills; --", limit: 10 },
        mockUser,
      );

      // Should use $queryRawUnsafe with parameterized $1, $2
      expect(prisma.$queryRawUnsafe).toHaveBeenCalled();
      const callArgs = prisma.$queryRawUnsafe.mock.calls[0];
      const queryStr = callArgs[0];
      // The SQL template itself should NOT contain the injected payload
      expect(queryStr).not.toContain('DROP TABLE');
      // The injected payload should be passed as a parameter
      expect(callArgs[1]).toContain('DROP TABLE');
    });

    it('should enforce max 50 results limit', async () => {
      httpService.post.mockReturnValue(
        throwError(() => new Error('unavailable')),
      );
      prisma.$queryRawUnsafe.mockResolvedValue([]);

      await service.searchSkills(
        { query: 'test', limit: 200 },
        mockUser,
      );

      // The limit parameter (last arg) should be capped at 50
      const callArgs = prisma.$queryRawUnsafe.mock.calls[0];
      const limitParam = callArgs[callArgs.length - 1];
      expect(limitParam).toBeLessThanOrEqual(50);
    });

    it('should apply visibility filtering for non-admin users', async () => {
      httpService.post.mockReturnValue(
        throwError(() => new Error('unavailable')),
      );
      prisma.$queryRawUnsafe.mockResolvedValue([]);

      await service.searchSkills(
        { query: 'test', limit: 10 },
        mockUser,
      );

      // The raw query should include visibility conditions
      const callArgs = prisma.$queryRawUnsafe.mock.calls[0];
      const queryStr = callArgs[0];
      expect(queryStr).toContain('visibility');
    });

    it('should not filter visibility for admin users', async () => {
      httpService.post.mockReturnValue(
        throwError(() => new Error('unavailable')),
      );
      prisma.$queryRawUnsafe.mockResolvedValue(mockSearchResult);

      const result = await service.searchSkills(
        { query: 'test', limit: 10 },
        mockAdminUser,
      );

      expect(result.data).toHaveLength(1);
      // Admin query should NOT have visibility clause
      const callArgs = prisma.$queryRawUnsafe.mock.calls[0];
      const queryStr = callArgs[0];
      expect(queryStr).not.toContain("s.visibility = 'PUBLIC'");
    });
  });
});
