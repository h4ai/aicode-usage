import { Test, TestingModule } from '@nestjs/testing';
import { NotificationService } from './notification.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('SyncNotificationService', () => {
  let service: NotificationService;
  let prisma: any;

  beforeEach(async () => {
    const mockPrisma = {
      systemConfig: {
        create: jest.fn().mockResolvedValue({}),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
    prisma = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ==========================================================
  // NOTIFY MAJOR CHANGE
  // ==========================================================
  describe('notifyMajorChange', () => {
    it('should create a major change notification', async () => {
      const result = await service.notifyMajorChange(
        'user-1',
        'java-starter',
        'deploy-helper',
        '1.0.0',
        '2.0.0',
      );

      expect(result.type).toBe('MAJOR_VERSION_CHANGE');
      expect(result.userId).toBe('user-1');
      expect(result.title).toContain('deploy-helper');
      expect(result.message).toContain('1.0.0');
      expect(result.message).toContain('2.0.0');
      expect(result.message).toContain('NOT auto-updated');
      expect(result.read).toBe(false);
      expect(result.metadata?.skillName).toBe('deploy-helper');
    });

    it('should persist notification to DB', async () => {
      await service.notifyMajorChange('user-1', 'tpl', 'skill', '1.0.0', '2.0.0');

      expect(prisma.systemConfig.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            key: expect.stringContaining('notification:user-1:'),
          }),
        }),
      );
    });

    it('should not throw when DB persist fails', async () => {
      prisma.systemConfig.create.mockRejectedValue(new Error('DB error'));

      await expect(
        service.notifyMajorChange('user-1', 'tpl', 'skill', '1.0.0', '2.0.0'),
      ).resolves.toBeDefined();
    });
  });

  // ==========================================================
  // NOTIFY DEPENDENCY UPDATE
  // ==========================================================
  describe('notifyDependencyUpdate', () => {
    it('should create a dependency update notification', async () => {
      const result = await service.notifyDependencyUpdate(
        'user-1',
        'react-starter',
        'lint-check',
        '1.2.0',
      );

      expect(result.type).toBe('DEPENDENCY_UPDATE');
      expect(result.message).toContain('auto-updated');
      expect(result.message).toContain('1.2.0');
    });
  });

  // ==========================================================
  // GET NOTIFICATIONS
  // ==========================================================
  describe('getNotifications', () => {
    it('should return all notifications for a user', async () => {
      await service.notifyMajorChange('user-1', 'tpl1', 'skill1', '1.0.0', '2.0.0');
      await service.notifyDependencyUpdate('user-1', 'tpl2', 'skill2', '1.1.0');
      await service.notifyMajorChange('user-2', 'tpl3', 'skill3', '1.0.0', '3.0.0');

      const user1Notifs = service.getNotifications('user-1');
      const user2Notifs = service.getNotifications('user-2');

      expect(user1Notifs).toHaveLength(2);
      expect(user2Notifs).toHaveLength(1);
    });

    it('should filter unread only', async () => {
      await service.notifyMajorChange('user-1', 'tpl1', 'skill1', '1.0.0', '2.0.0');
      await service.notifyDependencyUpdate('user-1', 'tpl2', 'skill2', '1.1.0');

      service.markAsRead('user-1', 0);

      const unread = service.getNotifications('user-1', true);
      expect(unread).toHaveLength(1);
    });

    it('should sort by newest first', async () => {
      await service.notifyMajorChange('user-1', 'tpl1', 'skill1', '1.0.0', '2.0.0');
      await new Promise((r) => setTimeout(r, 10));
      await service.notifyDependencyUpdate('user-1', 'tpl2', 'skill2', '1.1.0');

      const notifs = service.getNotifications('user-1');
      expect(notifs[0].type).toBe('DEPENDENCY_UPDATE'); // newest
    });
  });

  // ==========================================================
  // MARK AS READ
  // ==========================================================
  describe('markAsRead', () => {
    it('should mark notification as read', async () => {
      await service.notifyMajorChange('user-1', 'tpl', 'skill', '1.0.0', '2.0.0');

      service.markAsRead('user-1', 0);

      const notifs = service.getNotifications('user-1');
      expect(notifs[0].read).toBe(true);
    });

    it('should not throw for invalid index', () => {
      expect(() => service.markAsRead('user-1', 999)).not.toThrow();
    });
  });

  // ==========================================================
  // UNREAD COUNT
  // ==========================================================
  describe('getUnreadCount', () => {
    it('should count unread notifications', async () => {
      await service.notifyMajorChange('user-1', 'tpl1', 'skill1', '1.0.0', '2.0.0');
      await service.notifyDependencyUpdate('user-1', 'tpl2', 'skill2', '1.1.0');

      expect(service.getUnreadCount('user-1')).toBe(2);

      service.markAsRead('user-1', 0);
      expect(service.getUnreadCount('user-1')).toBe(1);
    });

    it('should return 0 for user with no notifications', () => {
      expect(service.getUnreadCount('user-nobody')).toBe(0);
    });
  });
});
