/**
 * Notification templates for review workflow events
 */

export interface NotificationTemplate {
  title: string;
  content: string;
}

export function reviewTimeoutTemplate(
  reviewId: string,
  skillName: string,
  version: string,
  overdueDays: number,
): NotificationTemplate {
  return {
    title: '⏰ 审核超时提醒',
    content: [
      `**审核单**: ${reviewId}`,
      `**Skill**: ${skillName} v${version}`,
      `**已等待**: ${overdueDays} 天`,
      '',
      '请尽快处理该审核单，避免影响发布进度。',
    ].join('\n'),
  };
}

export function reviewAssignedTemplate(
  reviewId: string,
  skillName: string,
  version: string,
  reviewerName: string,
): NotificationTemplate {
  return {
    title: '📋 审核任务分配',
    content: [
      `**审核单**: ${reviewId}`,
      `**Skill**: ${skillName} v${version}`,
      `**审核人**: ${reviewerName}`,
      '',
      '请在规定时间内完成审核。',
    ].join('\n'),
  };
}

export function reviewDecisionTemplate(
  reviewId: string,
  skillName: string,
  version: string,
  decision: string,
  reviewerName: string,
  comment?: string,
): NotificationTemplate {
  const statusEmoji =
    decision === 'APPROVE' ? '✅' : decision === 'REJECT' ? '❌' : '🔄';

  return {
    title: `${statusEmoji} 审核结果通知`,
    content: [
      `**审核单**: ${reviewId}`,
      `**Skill**: ${skillName} v${version}`,
      `**决策**: ${decision}`,
      `**审核人**: ${reviewerName}`,
      ...(comment ? [`**备注**: ${comment}`] : []),
    ].join('\n'),
  };
}
