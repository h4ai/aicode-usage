import { Test, TestingModule } from '@nestjs/testing';
import { TemplatesService } from './templates.service';
import { PrismaService } from '../prisma/prisma.service';
import { NamespacesService } from '../namespaces/namespaces.service';
import { StorageService } from '../storage/storage.service';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';

describe('TemplatesService', () => {
  let service: TemplatesService;
  let prisma: any;
  let namespacesService: any;
  let storageService: any;

  const mockUser = { sub: 'user-1', role: 'PUBLISHER', department: 'Eng' };
  const mockAdminUser = { sub: 'admin-1', role: 'ADMIN', department: 'Eng' };

  const mockTemplate = {
    id: 'tpl-1',
    namespaceId: 'ns-1',
    name: 'java-springboot',
    description: 'Spring Boot starter template',
    authorId: 'user-1',
    isPublic: true,
    tags: ['java', 'backend'],
    downloadCount: 100,
    weeklyDownloads: 20,
    createdAt: new Date(),
    updatedAt: new Date(),
    namespace: { id: 'ns-1', name: 'backend-team' },
    author: { id: 'user-1', displayName: 'User 1' },
    versions: [],
  };

  const mockVersion = {
    id: 'ver-1',
    templateId: 'tpl-1',
    version: '1.0.0',
    manifest: { name: 'java-springboot', variables: [] },
    fileKey: 'templates/backend-team/java-springboot/1.0.0.zip',
    status: 'DRAFT',
    extends: null,
    publishedAt: null,
    createdAt: new Date(),
    skills: [],
  };

  beforeEach(async () => {
    const mockPrisma = {
      template: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
      templateVersion: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      templateSkill: {
        createMany: jest.fn(),
      },
      namespace: {
        findUnique: jest.fn(),
      },
    };

    const mockNamespaces = {
      checkMembership: jest.fn(),
    };

    const mockStorage = {
      uploadFile: jest.fn(),
      getPresignedUrl: jest.fn().mockResolvedValue('https://minio.test/presigned'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TemplatesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NamespacesService, useValue: mockNamespaces },
        { provide: StorageService, useValue: mockStorage },
      ],
    }).compile();

    service = module.get<TemplatesService>(TemplatesService);
    prisma = module.get(PrismaService);
    namespacesService = module.get(NamespacesService);
    storageService = module.get(StorageService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ==========================================================
  // CREATE TEMPLATE
  // ==========================================================
  describe('create', () => {
    const createDto = {
      namespaceId: 'ns-1',
      name: 'java-springboot',
      description: 'Spring Boot starter',
      tags: ['java'],
    };

    it('should create a template in a namespace', async () => {
      namespacesService.checkMembership.mockResolvedValue(true);
      prisma.template.findUnique.mockResolvedValue(null);
      prisma.template.create.mockResolvedValue(mockTemplate);

      const result = await service.create(createDto, mockUser);

      expect(result).toEqual(mockTemplate);
      expect(namespacesService.checkMembership).toHaveBeenCalledWith('ns-1', 'user-1');
    });

    it('should throw ForbiddenException if user is not namespace member', async () => {
      namespacesService.checkMembership.mockResolvedValue(false);

      await expect(service.create(createDto, mockUser)).rejects.toThrow(ForbiddenException);
    });

    it('should throw ConflictException if template name exists in namespace', async () => {
      namespacesService.checkMembership.mockResolvedValue(true);
      prisma.template.findUnique.mockResolvedValue(mockTemplate);

      await expect(service.create(createDto, mockUser)).rejects.toThrow(ConflictException);
    });

    it('should allow global ADMIN to create in any namespace', async () => {
      namespacesService.checkMembership.mockResolvedValue(false); // not a member
      prisma.template.findUnique.mockResolvedValue(null);
      prisma.template.create.mockResolvedValue(mockTemplate);

      const result = await service.create(createDto, mockAdminUser);
      expect(result).toEqual(mockTemplate);
    });
  });

  // ==========================================================
  // FIND ALL (list + search + filter)
  // ==========================================================
  describe('findAll', () => {
    it('should return paginated templates', async () => {
      prisma.template.findMany.mockResolvedValue([mockTemplate]);
      prisma.template.count.mockResolvedValue(1);

      const result = await service.findAll({}, mockUser);

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('total', 1);
      expect(result).toHaveProperty('page', 1);
    });

    it('should filter by namespace name', async () => {
      prisma.namespace.findUnique.mockResolvedValue({ id: 'ns-1', name: 'backend-team' });
      prisma.template.findMany.mockResolvedValue([mockTemplate]);
      prisma.template.count.mockResolvedValue(1);

      const result = await service.findAll({ namespace: 'backend-team' }, mockUser);

      expect(result.data).toHaveLength(1);
    });

    it('should filter by tag', async () => {
      prisma.template.findMany.mockResolvedValue([mockTemplate]);
      prisma.template.count.mockResolvedValue(1);

      const result = await service.findAll({ tag: 'java' }, mockUser);
      expect(result.data).toHaveLength(1);
    });

    it('should sort by popular (weeklyDownloads)', async () => {
      prisma.template.findMany.mockResolvedValue([mockTemplate]);
      prisma.template.count.mockResolvedValue(1);

      await service.findAll({ sort: 'popular' }, mockUser);

      expect(prisma.template.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: expect.arrayContaining([
            expect.objectContaining({ weeklyDownloads: 'desc' }),
          ]),
        }),
      );
    });

    it('should sort by newest', async () => {
      prisma.template.findMany.mockResolvedValue([]);
      prisma.template.count.mockResolvedValue(0);

      await service.findAll({ sort: 'newest' }, mockUser);

      expect(prisma.template.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('should sort by name', async () => {
      prisma.template.findMany.mockResolvedValue([]);
      prisma.template.count.mockResolvedValue(0);

      await service.findAll({ sort: 'name' }, mockUser);

      expect(prisma.template.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { name: 'asc' },
        }),
      );
    });

    it('should cap limit to 100', async () => {
      prisma.template.findMany.mockResolvedValue([]);
      prisma.template.count.mockResolvedValue(0);

      await service.findAll({ limit: 500 }, mockUser);

      expect(prisma.template.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });
  });

  // ==========================================================
  // FIND ONE
  // ==========================================================
  describe('findOne', () => {
    it('should return a template by id with versions', async () => {
      prisma.template.findUnique.mockResolvedValue(mockTemplate);

      const result = await service.findOne('tpl-1');
      expect(result).toEqual(mockTemplate);
    });

    it('should throw NotFoundException if template not found', async () => {
      prisma.template.findUnique.mockResolvedValue(null);

      await expect(service.findOne('tpl-999')).rejects.toThrow(NotFoundException);
    });
  });

  // ==========================================================
  // CREATE VERSION
  // ==========================================================
  describe('createVersion', () => {
    const versionDto = {
      version: '1.0.0',
      manifest: { name: 'java-springboot' },
      skills: [{ skillName: 'code-review', versionRange: '^1.0.0' }],
    };

    it('should create a new version with valid semver', async () => {
      prisma.template.findUnique.mockResolvedValue(mockTemplate);
      namespacesService.checkMembership.mockResolvedValue(true);
      prisma.templateVersion.findUnique.mockResolvedValue(null);
      prisma.templateVersion.create.mockResolvedValue(mockVersion);
      storageService.uploadFile.mockResolvedValue(undefined);
      prisma.templateSkill.createMany.mockResolvedValue({ count: 1 });

      const mockFile = { buffer: Buffer.from('test'), originalname: 'test.zip', size: 100 };
      const result = await service.createVersion('tpl-1', versionDto, mockFile as any, mockUser);

      expect(result).toEqual(mockVersion);
    });

    it('should throw BadRequestException for invalid semver', async () => {
      prisma.template.findUnique.mockResolvedValue(mockTemplate);
      namespacesService.checkMembership.mockResolvedValue(true);

      const invalidDto = { ...versionDto, version: 'not-semver' };
      const mockFile = { buffer: Buffer.from('test'), originalname: 'test.zip', size: 100 };

      await expect(
        service.createVersion('tpl-1', invalidDto, mockFile as any, mockUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException for duplicate version', async () => {
      prisma.template.findUnique.mockResolvedValue(mockTemplate);
      namespacesService.checkMembership.mockResolvedValue(true);
      prisma.templateVersion.findUnique.mockResolvedValue(mockVersion);

      const mockFile = { buffer: Buffer.from('test'), originalname: 'test.zip', size: 100 };

      await expect(
        service.createVersion('tpl-1', versionDto, mockFile as any, mockUser),
      ).rejects.toThrow(ConflictException);
    });

    it('should reject ZIP files over 50MB', async () => {
      prisma.template.findUnique.mockResolvedValue(mockTemplate);
      namespacesService.checkMembership.mockResolvedValue(true);
      prisma.templateVersion.findUnique.mockResolvedValue(null);

      const bigFile = { buffer: Buffer.alloc(51 * 1024 * 1024), originalname: 'big.zip', size: 51 * 1024 * 1024 };

      await expect(
        service.createVersion('tpl-1', versionDto, bigFile as any, mockUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if template not found', async () => {
      prisma.template.findUnique.mockResolvedValue(null);

      const mockFile = { buffer: Buffer.from('test'), originalname: 'test.zip', size: 100 };

      await expect(
        service.createVersion('tpl-999', versionDto, mockFile as any, mockUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ==========================================================
  // GET VERSION
  // ==========================================================
  describe('getVersion', () => {
    it('should return a specific version', async () => {
      prisma.templateVersion.findUnique.mockResolvedValue(mockVersion);

      const result = await service.getVersion('tpl-1', '1.0.0');
      expect(result).toEqual(mockVersion);
    });

    it('should throw NotFoundException if version not found', async () => {
      prisma.templateVersion.findUnique.mockResolvedValue(null);

      await expect(service.getVersion('tpl-1', '9.9.9')).rejects.toThrow(NotFoundException);
    });
  });

  // ==========================================================
  // PUBLISH VERSION
  // ==========================================================
  describe('publishVersion', () => {
    it('should set version status to PENDING_REVIEW', async () => {
      const draftVersion = { ...mockVersion, status: 'DRAFT' };
      prisma.template.findUnique.mockResolvedValue(mockTemplate);
      prisma.templateVersion.findUnique.mockResolvedValue(draftVersion);
      namespacesService.checkMembership.mockResolvedValue(true);
      prisma.templateVersion.update.mockResolvedValue({
        ...draftVersion,
        status: 'PENDING_REVIEW',
      });

      const result = await service.publishVersion('tpl-1', '1.0.0', mockUser);

      expect(result.status).toBe('PENDING_REVIEW');
    });

    it('should throw BadRequestException if version is not DRAFT', async () => {
      const publishedVersion = { ...mockVersion, status: 'PUBLISHED' };
      prisma.template.findUnique.mockResolvedValue(mockTemplate);
      prisma.templateVersion.findUnique.mockResolvedValue(publishedVersion);
      namespacesService.checkMembership.mockResolvedValue(true);

      await expect(
        service.publishVersion('tpl-1', '1.0.0', mockUser),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ==========================================================
  // RESOLVE TEMPLATE
  // ==========================================================
  describe('resolve', () => {
    it('should resolve a template with its dependencies', async () => {
      prisma.template.findUnique.mockResolvedValue({
        ...mockTemplate,
        namespace: { id: 'ns-1', name: 'backend-team' },
      });
      prisma.namespace.findUnique.mockResolvedValue({ id: 'ns-1', name: 'backend-team' });
      prisma.templateVersion.findMany.mockResolvedValue([
        {
          ...mockVersion,
          status: 'PUBLISHED',
          skills: [{ skillName: 'code-review', versionRange: '^1.0.0' }],
        },
      ]);
      storageService.getPresignedUrl.mockResolvedValue('https://minio.test/presigned');

      const result = await service.resolve('backend-team', 'java-springboot');

      expect(result).toHaveProperty('template');
      expect(result).toHaveProperty('downloadUrl');
      expect(result).toHaveProperty('skills');
    });

    it('should throw NotFoundException if template not found', async () => {
      prisma.namespace.findUnique.mockResolvedValue({ id: 'ns-1', name: 'backend-team' });
      prisma.template.findUnique.mockResolvedValue(null);

      await expect(
        service.resolve('backend-team', 'nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
