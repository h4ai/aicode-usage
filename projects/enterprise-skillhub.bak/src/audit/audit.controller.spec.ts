import { Test, TestingModule } from '@nestjs/testing';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';

// ============================================================
// TDD Test Suite: AuditController
// Written BEFORE implementation per Sprint 4 TDD mandate
// ============================================================

describe('AuditController', () => {
  let controller: AuditController;
  let auditService: jest.Mocked<AuditService>;

  const mockAdmin = {
    sub: 'admin-1',
    role: 'ADMIN',
    department: 'Engineering',
  };

  const mockAuditLog = {
    id: 'log-1',
    action: 'SKILL_CREATE',
    resource: 'skill',
    userId: 'user-1',
    ip: '127.0.0.1',
    userAgent: 'Chrome',
    detail: { name: 'Test' },
    createdAt: new Date('2026-01-15T10:00:00Z'),
  };

  const mockPaginated = {
    data: [mockAuditLog],
    total: 1,
    page: 1,
    limit: 50,
    totalPages: 1,
  };

  beforeEach(async () => {
    const mockAuditService = {
      findAll: jest.fn(),
      exportCsv: jest.fn(),
      log: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuditController],
      providers: [
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    controller = module.get<AuditController>(AuditController);
    auditService = module.get(AuditService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ==========================================================
  // GET /api/v1/admin/audit-logs
  // ==========================================================
  describe('findAll', () => {
    it('should return paginated audit logs', async () => {
      auditService.findAll.mockResolvedValue(mockPaginated);

      const result = await controller.findAll({} as any);

      expect(result).toEqual(mockPaginated);
      expect(auditService.findAll).toHaveBeenCalled();
    });

    it('should pass query params to service', async () => {
      auditService.findAll.mockResolvedValue(mockPaginated);

      const query = { actorId: 'user-1', action: 'SKILL_CREATE', page: 1, limit: 50 } as any;
      await controller.findAll(query);

      expect(auditService.findAll).toHaveBeenCalledWith(query);
    });

    it('should support date range filtering', async () => {
      auditService.findAll.mockResolvedValue(mockPaginated);

      const query = {
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        page: 1,
        limit: 50,
      } as any;
      await controller.findAll(query);

      expect(auditService.findAll).toHaveBeenCalledWith(query);
    });
  });

  // ==========================================================
  // GET /api/v1/admin/audit-logs/export
  // ==========================================================
  describe('exportCsv', () => {
    it('should return CSV content', async () => {
      const csvContent = 'id,action,resource,actor,ip,userAgent,detail,createdAt\nlog-1,...';
      auditService.exportCsv.mockResolvedValue(csvContent);

      const mockRes = {
        setHeader: jest.fn(),
        send: jest.fn(),
      };

      await controller.exportCsv({} as any, mockRes as any);

      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('audit-logs-'),
      );
      expect(mockRes.send).toHaveBeenCalledWith(csvContent);
    });

    it('should pass filter params to service', async () => {
      auditService.exportCsv.mockResolvedValue('csv-content');

      const mockRes = { setHeader: jest.fn(), send: jest.fn() };
      const query = { actorId: 'user-1' } as any;

      await controller.exportCsv(query, mockRes as any);

      expect(auditService.exportCsv).toHaveBeenCalledWith(query);
    });
  });
});
