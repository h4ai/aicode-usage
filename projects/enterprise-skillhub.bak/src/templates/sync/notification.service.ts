import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface SyncNotification {
  id?: string;
  userId: string;
  type: 'MAJOR_VERSION_CHANGE' | 'DEPENDENCY_UPDATE' | 'DEPRECATION';
  title: string;
  message: string;
  metadata?: Record<string, any>;
  read: boolean;
  createdAt: Date;
}

/**
 * Service for managing dependency sync notifications.
 * Stores notifications as SystemConfig entries (lightweight approach).
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger('SyncNotificationService');

  // In-memory store for notifications (in production, use a dedicated table)
  private notifications: SyncNotification[] = [];

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Notify a user about a major version change in a skill dependency.
   */
  async notifyMajorChange(
    userId: string,
    templateName: string,
    skillName: string,
    fromVersion: string,
    toVersion: string,
  ): Promise<SyncNotification> {
    const notification: SyncNotification = {
      userId,
      type: 'MAJOR_VERSION_CHANGE',
      title: `Major version update available: ${skillName}`,
      message: `Skill "${skillName}" has a major version update (${fromVersion} → ${toVersion}) ` +
        `that may contain breaking changes. Template "${templateName}" was NOT auto-updated. ` +
        `Please review the changelog and update manually if compatible.`,
      metadata: {
        templateName,
        skillName,
        fromVersion,
        toVersion,
      },
      read: false,
      createdAt: new Date(),
    };

    this.notifications.push(notification);

    this.logger.log(
      `Notification sent to ${userId}: ${skillName} major change ${fromVersion} → ${toVersion}`,
    );

    // Persist to DB as system config (audit trail)
    try {
      await this.prisma.systemConfig.create({
        data: {
          key: `notification:${userId}:${Date.now()}`,
          value: notification as any,
        },
      });
    } catch (error) {
      this.logger.warn(`Failed to persist notification: ${error.message}`);
    }

    return notification;
  }

  /**
   * Notify about a dependency update.
   */
  async notifyDependencyUpdate(
    userId: string,
    templateName: string,
    skillName: string,
    newVersion: string,
  ): Promise<SyncNotification> {
    const notification: SyncNotification = {
      userId,
      type: 'DEPENDENCY_UPDATE',
      title: `Dependency updated: ${skillName}`,
      message: `Skill "${skillName}" in template "${templateName}" has been auto-updated to ${newVersion}.`,
      metadata: { templateName, skillName, newVersion },
      read: false,
      createdAt: new Date(),
    };

    this.notifications.push(notification);
    return notification;
  }

  /**
   * Get notifications for a user.
   */
  getNotifications(userId: string, unreadOnly: boolean = false): SyncNotification[] {
    let filtered = this.notifications.filter((n) => n.userId === userId);
    if (unreadOnly) {
      filtered = filtered.filter((n) => !n.read);
    }
    return filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Mark a notification as read.
   */
  markAsRead(userId: string, index: number): void {
    const userNotifs = this.notifications.filter((n) => n.userId === userId);
    if (index >= 0 && index < userNotifs.length) {
      userNotifs[index].read = true;
    }
  }

  /**
   * Get count of unread notifications.
   */
  getUnreadCount(userId: string): number {
    return this.notifications.filter((n) => n.userId === userId && !n.read).length;
  }
}
