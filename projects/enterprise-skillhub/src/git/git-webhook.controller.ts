import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import * as crypto from 'crypto';

export interface WebhookPayload {
  ref?: string;
  repository?: {
    full_name?: string;
    clone_url?: string;
    html_url?: string;
  };
  after?: string; // commit SHA
  pusher?: { name?: string };
}

@Controller('webhooks')
export class GitWebhookController {
  private readonly logger = new Logger(GitWebhookController.name);
  private readonly webhookSecret: string;

  constructor(private readonly config: ConfigService) {
    this.webhookSecret = this.config.gitWebhookSecret;
  }

  /**
   * POST /api/v1/webhooks/git — Receive Git push webhooks (GitHub/GitLab).
   * Validates HMAC-SHA256 signature before processing.
   */
  @Post('git')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Body() payload: WebhookPayload,
    @Headers('x-hub-signature-256') signatureHeader?: string,
    @Headers('x-gitlab-token') gitlabToken?: string,
  ) {
    // Verify signature
    this.verifySignature(payload, signatureHeader, gitlabToken);

    const repoName = payload.repository?.full_name || 'unknown';
    const ref = payload.ref || 'unknown';
    const commitSha = payload.after || 'unknown';

    this.logger.log(`Webhook received: repo=${repoName} ref=${ref} commit=${commitSha}`);

    // Process the webhook (trigger template version sync)
    // In full implementation, this would:
    // 1. Find templates linked to this git repo
    // 2. Trigger re-clone and version update
    // 3. Notify template maintainers

    return {
      received: true,
      repository: repoName,
      ref,
      commit: commitSha,
      message: 'Webhook processed successfully',
    };
  }

  /**
   * Verify webhook signature (GitHub HMAC-SHA256 or GitLab token).
   */
  private verifySignature(
    payload: any,
    signatureHeader?: string,
    gitlabToken?: string,
  ): void {
    if (!this.webhookSecret) {
      this.logger.warn('Webhook secret not configured, skipping signature verification');
      return;
    }

    // GitLab uses a simple token comparison
    if (gitlabToken) {
      if (gitlabToken !== this.webhookSecret) {
        throw new UnauthorizedException('Invalid GitLab webhook token');
      }
      return;
    }

    // GitHub uses HMAC-SHA256
    if (!signatureHeader) {
      throw new UnauthorizedException('Missing webhook signature');
    }

    const expectedSignature = 'sha256=' +
      crypto.createHmac('sha256', this.webhookSecret)
        .update(JSON.stringify(payload))
        .digest('hex');

    const isValid = crypto.timingSafeEqual(
      Buffer.from(signatureHeader),
      Buffer.from(expectedSignature),
    );

    if (!isValid) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
  }
}
