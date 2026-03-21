import { Test, TestingModule } from '@nestjs/testing';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

// ============================================================
// TDD Test Suite: AdminController
// Written BEFORE implementation per Sprint 4 TDD mandate
// ============================================================

describe('AdminController', () => {
  let controller: AdminController;
  let adminService: jest.Mocked<AdminService>;

  const mockAdmin = {
    sub: 'admin-1',
    role: 'ADMIN',
    department: 'Engineering',
  };

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
    isActive: true,
  };

  const mockPaginated = {
    data: [mockUser],
    total: 1,
    page: 1,
    limit: 20,
    totalPages: 1,
  };

  beforeEach(async () => {
    const mockAdminService = {
      listUsers: jest.fn(),
      updateUserRole: jest.fn(),
      updateUserStatus: jest.fn(),
      listPolicies: jest.fn(),
      createPolicy: jest.fn(),
      updatePolicy: jest.fn(),
      deletePolicy: jest.fn(),
      getSystemConfig: jest.fn(),
      updateSystemConfig: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        { provide: AdminService, useValue: mockAdminService },
      ],
    }).compile();

    controller = module.get<AdminController>(AdminController);
    adminService = module.get(AdminService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ==========================================================
  // USER MANAGEMENT
  // ==========================================================
  describe('listUsers', () => {
    it('should return paginated users', async () => {
      adminService.listUsers.mockResolvedValue(mockPaginated);

      const result = await controller.listUsers({} as any);

      expect(result).toEqual(mockPaginated);
    });

    it('should pass search, role, department to service', async () => {
      adminService.listUsers.mockResolvedValue(mockPaginated);

      const query = { search: 'alice', role: 'ADMIN', department: 'Engineering' } as any;
      await controller.listUsers(query);

      expect(adminService.listUsers).toHaveBeenCalledWith(query);
    });
  });

  describe('updateUserRole', () => {
    it('should update user role', async () => {
      adminService.updateUserRole.mockResolvedValue({ ...mockUser, role: 'REVIEWER' });

      const req = { user: mockAdmin } as any;
      const result = await controller.updateUserRole('user-1', { role: 'REVIEWER' }, req);

      expect(result.role).toBe('REVIEWER');
      expect(adminService.updateUserRole).toHaveBeenCalledWith('user-1', 'REVIEWER', mockAdmin);
    });
  });

  describe('updateUserStatus', () => {
    it('should disable user', async () => {
      adminService.updateUserStatus.mockResolvedValue({ ...mockUser, isActive: false });

      const req = { user: mockAdmin } as any;
      const result = await controller.updateUserStatus('user-1', { isActive: false }, req);

      expect(result.isActive).toBe(false);
    });

    it('should enable user', async () => {
      adminService.updateUserStatus.mockResolvedValue(mockUser);

      const req = { user: mockAdmin } as any;
      const result = await controller.updateUserStatus('user-1', { isActive: true }, req);

      expect(result.isActive).toBe(true);
    });
  });

  // ==========================================================
  // REVIEW POLICIES
  // ==========================================================
  describe('listPolicies', () => {
    it('should return policy list', async () => {
      adminService.listPolicies.mockResolvedValue([mockPolicy]);

      const result = await controller.listPolicies();

      expect(result).toEqual([mockPolicy]);
    });
  });

  describe('createPolicy', () => {
    it('should create a new policy', async () => {
      adminService.createPolicy.mockResolvedValue(mockPolicy);

      const result = await controller.createPolicy({ name: 'Default Policy' } as any);

      expect(result).toEqual(mockPolicy);
    });
  });

  describe('updatePolicy', () => {
    it('should update a policy', async () => {
      adminService.updatePolicy.mockResolvedValue({ ...mockPolicy, autoApprove: true });

      const result = await controller.updatePolicy('policy-1', { autoApprove: true } as any);

      expect(result.autoApprove).toBe(true);
    });
  });

  describe('deletePolicy', () => {
    it('should delete a policy', async () => {
      adminService.deletePolicy.mockResolvedValue(undefined);

      await expect(controller.deletePolicy('policy-1')).resolves.not.toThrow();
    });
  });

  // ==========================================================
  // SYSTEM CONFIG
  // ==========================================================
  describe('getSystemConfig', () => {
    it('should return all config entries', async () => {
      const configs = [{ key: 'maintenance_mode', value: false }];
      adminService.getSystemConfig.mockResolvedValue(configs);

      const result = await controller.getSystemConfig();

      expect(result).toEqual(configs);
    });
  });

  describe('updateSystemConfig', () => {
    it('should update a config entry', async () => {
      const updated = { key: 'maintenance_mode', value: true };
      adminService.updateSystemConfig.mockResolvedValue(updated);

      const result = await controller.updateSystemConfig({
        key: 'maintenance_mode',
        value: true,
      } as any);

      expect(adminService.updateSystemConfig).toHaveBeenCalledWith('maintenance_mode', true);
    });
  });
});
