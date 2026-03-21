import { Test, TestingModule } from '@nestjs/testing';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';

describe('TemplatesController', () => {
  let controller: TemplatesController;
  let service: jest.Mocked<TemplatesService>;

  const mockUser = { sub: 'user-1', role: 'PUBLISHER' };

  const mockTemplate = {
    id: 'tpl-1',
    name: 'java-springboot',
    namespaceId: 'ns-1',
    namespace: { id: 'ns-1', name: 'backend-team' },
  };

  beforeEach(async () => {
    const mockService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      createVersion: jest.fn(),
      getVersion: jest.fn(),
      publishVersion: jest.fn(),
      resolve: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TemplatesController],
      providers: [{ provide: TemplatesService, useValue: mockService }],
    }).compile();

    controller = module.get<TemplatesController>(TemplatesController);
    service = module.get(TemplatesService) as jest.Mocked<TemplatesService>;
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('POST /templates', () => {
    it('should create a template', async () => {
      service.create.mockResolvedValue(mockTemplate as any);
      const req = { user: mockUser } as any;
      const result = await controller.create({ namespaceId: 'ns-1', name: 'java-springboot' }, req);
      expect(result).toEqual(mockTemplate);
    });
  });

  describe('GET /templates', () => {
    it('should return templates list', async () => {
      const paginatedResult = { data: [mockTemplate], total: 1, page: 1, limit: 20, totalPages: 1 };
      service.findAll.mockResolvedValue(paginatedResult as any);
      const req = { user: mockUser } as any;
      const result = await controller.findAll({} as any, req);
      expect(result.data).toHaveLength(1);
    });
  });

  describe('GET /templates/:id', () => {
    it('should return template details', async () => {
      service.findOne.mockResolvedValue(mockTemplate as any);
      const result = await controller.findOne('tpl-1');
      expect(result).toEqual(mockTemplate);
    });
  });

  describe('POST /templates/:id/versions', () => {
    it('should create a version', async () => {
      const mockVersion = { id: 'ver-1', version: '1.0.0' };
      service.createVersion.mockResolvedValue(mockVersion as any);
      const req = { user: mockUser } as any;
      const file = { buffer: Buffer.from('test'), originalname: 'test.zip', size: 100 } as any;
      const result = await controller.createVersion('tpl-1', { version: '1.0.0' }, file, req);
      expect(result).toEqual(mockVersion);
    });
  });

  describe('GET /templates/:id/versions/:version', () => {
    it('should return version details', async () => {
      const mockVersion = { id: 'ver-1', version: '1.0.0' };
      service.getVersion.mockResolvedValue(mockVersion as any);
      const result = await controller.getVersion('tpl-1', '1.0.0');
      expect(result).toEqual(mockVersion);
    });
  });

  describe('POST /templates/:id/versions/:version/publish', () => {
    it('should publish a version', async () => {
      const mockVersion = { id: 'ver-1', version: '1.0.0', status: 'PENDING_REVIEW' };
      service.publishVersion.mockResolvedValue(mockVersion as any);
      const req = { user: mockUser } as any;
      const result = await controller.publishVersion('tpl-1', '1.0.0', req);
      expect(result.status).toBe('PENDING_REVIEW');
    });
  });

  describe('GET /templates/resolve', () => {
    it('should resolve a template', async () => {
      const resolved = { template: mockTemplate, version: '1.0.0', downloadUrl: 'https://test.com', skills: [] };
      service.resolve.mockResolvedValue(resolved as any);
      const result = await controller.resolve('backend-team', 'java-springboot');
      expect(result).toHaveProperty('downloadUrl');
    });
  });
});
