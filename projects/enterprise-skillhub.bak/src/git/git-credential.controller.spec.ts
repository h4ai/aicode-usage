import { Test, TestingModule } from '@nestjs/testing';
import { GitCredentialController } from './git-credential.controller';
import { GitCredentialService } from './git-credential.service';

describe('GitCredentialController', () => {
  let controller: GitCredentialController;
  let service: jest.Mocked<GitCredentialService>;

  const mockUser = { sub: 'user-1', role: 'PUBLISHER' };
  const mockReq = { user: mockUser } as any;

  const mockCredential = {
    id: 'cred-1',
    name: 'github-token',
    type: 'TOKEN',
    url: 'https://github.com/org/repo.git',
    credentialMasked: '***',
    ownerId: 'user-1',
    scope: 'PERSONAL',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      remove: jest.fn(),
      testConnectivity: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GitCredentialController],
      providers: [{ provide: GitCredentialService, useValue: mockService }],
    }).compile();

    controller = module.get<GitCredentialController>(GitCredentialController);
    service = module.get(GitCredentialService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ==========================================================
  // CREATE
  // ==========================================================
  describe('create', () => {
    it('should create a credential and return sanitized result', async () => {
      service.create.mockResolvedValue(mockCredential as any);

      const dto = {
        name: 'github-token',
        type: 'TOKEN' as any,
        url: 'https://github.com/org/repo.git',
        credential: 'ghp_token123',
      };

      const result = await controller.create(dto, mockReq);

      expect(result).toEqual(mockCredential);
      expect(service.create).toHaveBeenCalledWith(dto, 'user-1');
    });
  });

  // ==========================================================
  // FIND ALL
  // ==========================================================
  describe('findAll', () => {
    it('should return list of credentials for user', async () => {
      service.findAll.mockResolvedValue([mockCredential] as any);

      const result = await controller.findAll(mockReq);

      expect(result).toHaveLength(1);
      expect(service.findAll).toHaveBeenCalledWith('user-1');
    });
  });

  // ==========================================================
  // DELETE
  // ==========================================================
  describe('remove', () => {
    it('should delete a credential', async () => {
      service.remove.mockResolvedValue({ deleted: true, id: 'cred-1' } as any);

      const result = await controller.remove('cred-1', mockReq);

      expect(result).toEqual({ deleted: true, id: 'cred-1' });
      expect(service.remove).toHaveBeenCalledWith('cred-1', 'user-1');
    });
  });

  // ==========================================================
  // TEST
  // ==========================================================
  describe('test', () => {
    it('should test credential connectivity', async () => {
      service.testConnectivity.mockResolvedValue({ success: true, message: 'OK' });

      const result = await controller.test('cred-1', mockReq);

      expect(result.success).toBe(true);
      expect(service.testConnectivity).toHaveBeenCalledWith('cred-1', 'user-1');
    });
  });
});
