import { Test, TestingModule } from '@nestjs/testing';
import { NotificationService } from './notification.service';
import { ConfigService } from '../../config/config.service';

// ============================================================
// TDD Test Suite: NotificationService
// Written BEFORE implementation per Sprint 3 TDD mandate
// ============================================================

describe('NotificationService', () => {
  let service: NotificationService;
  let configService: any;
  let fetchSpy: jest.SpyInstance;

  const mockReview = {
    id: 'review-1',
    skillId: 'skill-1',
    versionId: 'version-1',
    submitterId: 'submitter-1',
    status: 'PENDING_MANUAL',
    skill: { name: 'Test Skill', slug: 'test-skill' },
    version: { version: '1.0.0' },
    submitter: { displayName: 'Submitter' },
  };

  beforeEach(async () => {
    configService = {
      get webhookUrl() { return 'https://hooks.example.com/webhook'; },
      get webhookType() { return 'feishu'; },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);

    // Mock global fetch
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ code: 0 }),
    } as Response);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendReviewTimeoutAlert', () => {
    it('should send webhook notification for overdue review', async () => {
      await service.sendReviewTimeoutAlert(mockReview as any, 5);

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://hooks.example.com/webhook',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        }),
      );
    });

    it('should include review details in notification payload', async () => {
      await service.sendReviewTimeoutAlert(mockReview as any, 5);

      const callArgs = fetchSpy.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      // Feishu webhook format
      expect(body).toHaveProperty('msg_type');
    });

    it('should not throw if webhook fails', async () => {
      fetchSpy.mockRejectedValue(new Error('Network error'));

      // Should not throw — notification failures are non-critical
      await expect(
        service.sendReviewTimeoutAlert(mockReview as any, 5),
      ).resolves.not.toThrow();
    });

    it('should skip notification if no webhook URL configured', async () => {
      // Create a new service with empty webhook URL
      const emptyConfigService = {
        get webhookUrl() { return ''; },
        get webhookType() { return 'feishu'; },
      };
      const emptyModule = await Test.createTestingModule({
        providers: [
          NotificationService,
          { provide: ConfigService, useValue: emptyConfigService },
        ],
      }).compile();
      const emptyService = emptyModule.get<NotificationService>(NotificationService);

      await emptyService.sendReviewTimeoutAlert(mockReview as any, 5);

      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('sendReviewAssignedNotification', () => {
    it('should send notification when review is assigned', async () => {
      await service.sendReviewAssignedNotification(
        mockReview as any,
        'reviewer-1',
        'Reviewer One',
      );

      expect(fetchSpy).toHaveBeenCalled();
    });
  });

  describe('notification templates', () => {
    it('should format feishu webhook payload correctly', () => {
      const payload = service.buildFeishuPayload(
        'Review Timeout Alert',
        'Review review-1 for Test Skill v1.0.0 has been pending for 5 days.',
      );

      expect(payload).toHaveProperty('msg_type', 'interactive');
      expect(payload).toHaveProperty('card');
    });

    it('should format wecom webhook payload correctly', () => {
      const payload = service.buildWecomPayload(
        'Review Timeout Alert',
        'Review review-1 has been pending for 5 days.',
      );

      expect(payload).toHaveProperty('msgtype', 'markdown');
      expect(payload).toHaveProperty('markdown');
    });
  });
});
