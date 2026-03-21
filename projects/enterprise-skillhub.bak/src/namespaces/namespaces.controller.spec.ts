import { Test, TestingModule } from '@nestjs/testing';
import { NamespacesController } from './namespaces.controller';
import { NamespacesService } from './namespaces.service';

describe('NamespacesController', () => {
  let controller: NamespacesController;
  let service: jest.Mocked<NamespacesService>;

  const mockUser = { sub: 'user-1', role: 'PUBLISHER' };

  const mockNamespace = {
    id: 'ns-1',
    name: 'backend-team',
    description: 'Backend',
    ownerId: 'user-1',
    members: [],
  };

  beforeEach(async () => {
    const mockService = {
      create: jest.fn(),
      findAll: jest.fn(),
      addMember: jest.fn(),
      removeMember: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NamespacesController],
      providers: [{ provide: NamespacesService, useValue: mockService }],
    }).compile();

    controller = module.get<NamespacesController>(NamespacesController);
    service = module.get(NamespacesService) as jest.Mocked<NamespacesService>;
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('POST /namespaces', () => {
    it('should create a namespace', async () => {
      service.create.mockResolvedValue(mockNamespace as any);

      const req = { user: mockUser } as any;
      const result = await controller.create({ name: 'backend-team' }, req);

      expect(result).toEqual(mockNamespace);
      expect(service.create).toHaveBeenCalledWith({ name: 'backend-team' }, mockUser);
    });
  });

  describe('GET /namespaces', () => {
    it('should return namespace list', async () => {
      service.findAll.mockResolvedValue([mockNamespace] as any);

      const req = { user: mockUser } as any;
      const result = await controller.findAll(req);

      expect(result).toEqual([mockNamespace]);
      expect(service.findAll).toHaveBeenCalledWith(mockUser);
    });
  });

  describe('POST /namespaces/:id/members', () => {
    it('should add a member', async () => {
      const newMember = { id: 'mem-2', namespaceId: 'ns-1', userId: 'user-2', role: 'MEMBER' };
      service.addMember.mockResolvedValue(newMember as any);

      const req = { user: mockUser } as any;
      const result = await controller.addMember('ns-1', { userId: 'user-2', role: 'MEMBER' as any }, req);

      expect(result).toEqual(newMember);
    });
  });

  describe('DELETE /namespaces/:id/members/:userId', () => {
    it('should remove a member', async () => {
      service.removeMember.mockResolvedValue({ success: true });

      const req = { user: mockUser } as any;
      const result = await controller.removeMember('ns-1', 'user-2', req);

      expect(result).toEqual({ success: true });
    });
  });
});
