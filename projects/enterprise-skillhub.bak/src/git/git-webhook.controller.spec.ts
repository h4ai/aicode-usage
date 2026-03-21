import { Test, TestingModule } from '@nestjs/testing';
import { GitWebhookController } from './git-webhook.controller';
import { ConfigService } from '../config/config.service';
import { UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';

describe('GitWebhookController', () => {
  const WEBHOOK_SECRET = 'test-webhook-secret';

  let controller: GitWebhookController;

  const mockPayload = {
    ref: 'refs/heads/main',
    repository: {
      full_name: 'org/repo',
      clone_url: 'https://github.com/org/repo.git',
      html_url: 'https://github.com/org/repo',
    },
    after: 'abc123def456',
    pusher: { name: 'developer' },
  };

  // Helper: compute valid GitHub signature
  function computeGitHubSignature(payload: any, secret: string): string {
    return 'sha256=' +
      crypto.createHmac('sha256', secret)
        .update(JSON.stringify(payload))
        .digest('hex');
  }

  describe('with webhook secret configured', () => {
    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        controllers: [GitWebhookController],
        providers: [
          { provide: ConfigService, useValue: { gitWebhookSecret: WEBHOOK_SECRET } },
        ],
      }).compile();

      controller = module.get<GitWebhookController>(GitWebhookController);
    });

    it('should be defined', () => {
      expect(controller).toBeDefined();
    });

    // ==========================================================
    // GITHUB SIGNATURE VERIFICATION
    // ==========================================================
    describe('GitHub webhook (HMAC-SHA256)', () => {
      it('should accept valid GitHub signature', async () => {
        const signature = computeGitHubSignature(mockPayload, WEBHOOK_SECRET);

        const result = await controller.handleWebhook(mockPayload, signature);

        expect(result.received).toBe(true);
        expect(result.repository).toBe('org/repo');
        expect(result.ref).toBe('refs/heads/main');
        expect(result.commit).toBe('abc123def456');
      });

      it('should reject invalid GitHub signature', async () => {
        const badSignature = computeGitHubSignature(mockPayload, 'wrong-secret');

        await expect(
          controller.handleWebhook(mockPayload, badSignature),
        ).rejects.toThrow(UnauthorizedException);
      });

      it('should reject missing signature when secret is configured', async () => {
        await expect(
          controller.handleWebhook(mockPayload),
        ).rejects.toThrow(UnauthorizedException);
      });

      it('should handle payload with missing optional fields', async () => {
        const minimalPayload = {};
        const signature = computeGitHubSignature(minimalPayload, WEBHOOK_SECRET);

        const result = await controller.handleWebhook(minimalPayload, signature);

        expect(result.received).toBe(true);
        expect(result.repository).toBe('unknown');
        expect(result.ref).toBe('unknown');
      });
    });

    // ==========================================================
    // GITLAB TOKEN VERIFICATION
    // ==========================================================
    describe('GitLab webhook (token)', () => {
      it('should accept valid GitLab token', async () => {
        const result = await controller.handleWebhook(
          mockPayload,
          undefined,
          WEBHOOK_SECRET,
        );

        expect(result.received).toBe(true);
      });

      it('should reject invalid GitLab token', async () => {
        await expect(
          controller.handleWebhook(mockPayload, undefined, 'wrong-token'),
        ).rejects.toThrow(UnauthorizedException);
      });
    });
  });

  // ==========================================================
  // NO SECRET CONFIGURED (dev mode)
  // ==========================================================
  describe('without webhook secret', () => {
    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        controllers: [GitWebhookController],
        providers: [
          { provide: ConfigService, useValue: { gitWebhookSecret: '' } },
        ],
      }).compile();

      controller = module.get<GitWebhookController>(GitWebhookController);
    });

    it('should accept webhooks without signature when secret is empty', async () => {
      const result = await controller.handleWebhook(mockPayload);

      expect(result.received).toBe(true);
      expect(result.repository).toBe('org/repo');
    });
  });
});
