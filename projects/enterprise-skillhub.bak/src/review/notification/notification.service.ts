import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '../../config/config.service';

/**
 * Notification Service: Sends webhook notifications to Feishu/WeCom
 * Supports configurable templates and graceful failure handling
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * Send timeout alert for overdue reviews
   */
  async sendReviewTimeoutAlert(review: any, overdueDays: number): Promise<void> {
    const webhookUrl = this.config.webhookUrl;
    if (!webhookUrl) {
      this.logger.warn('No webhook URL configured, skipping notification');
      return;
    }

    const title = 'Review Timeout Alert';
    const content = `Review ${review.id} for ${review.skill?.name || 'Unknown'} v${review.version?.version || '?'} has been pending for ${overdueDays} days.`;

    await this.sendWebhook(webhookUrl, title, content);
  }

  /**
   * Send notification when a review is assigned
   */
  async sendReviewAssignedNotification(
    review: any,
    reviewerId: string,
    reviewerName: string,
  ): Promise<void> {
    const webhookUrl = this.config.webhookUrl;
    if (!webhookUrl) return;

    const title = 'Review Assigned';
    const content = `Review ${review.id} for ${review.skill?.name || 'Unknown'} has been assigned to ${reviewerName}.`;

    await this.sendWebhook(webhookUrl, title, content);
  }

  /**
   * Build Feishu interactive card payload
   */
  buildFeishuPayload(title: string, content: string): any {
    return {
      msg_type: 'interactive',
      card: {
        header: {
          title: {
            tag: 'plain_text',
            content: title,
          },
          template: 'orange',
        },
        elements: [
          {
            tag: 'markdown',
            content,
          },
        ],
      },
    };
  }

  /**
   * Build WeCom markdown payload
   */
  buildWecomPayload(title: string, content: string): any {
    return {
      msgtype: 'markdown',
      markdown: {
        content: `# ${title}\n\n${content}`,
      },
    };
  }

  /**
   * Send webhook with automatic format detection
   */
  private async sendWebhook(
    webhookUrl: string,
    title: string,
    content: string,
  ): Promise<void> {
    try {
      const webhookType = this.config.webhookType || 'feishu';
      const payload =
        webhookType === 'wecom'
          ? this.buildWecomPayload(title, content)
          : this.buildFeishuPayload(title, content);

      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      this.logger.log(`Notification sent: ${title}`);
    } catch (error: any) {
      // Notification failures are non-critical — log and swallow
      this.logger.error(`Failed to send notification: ${error.message}`);
    }
  }
}
