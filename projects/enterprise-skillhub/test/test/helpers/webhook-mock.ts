import type { INestApplication } from '@nestjs/common';

/**
 * Webhook mock helper
 *
 * Goals:
 * - Intercept outbound webhook notifications in e2e tests
 * - Avoid leaking real webhook URLs
 *
 * NOTE: For now this is a light-weight placeholder. When NotificationModule
 * is available, replace with nock/undici mock or provider override.
 */

export type WebhookCapture = {
  calls: Array<{ url: string; body?: any; headers?: Record<string, any> }>;
  reset: () => void;
};

export function createWebhookCapture(): WebhookCapture {
  const calls: WebhookCapture['calls'] = [];
  return {
    calls,
    reset() {
      calls.splice(0, calls.length);
    },
  };
}

export async function installWebhookMock(_app: INestApplication, _cap: WebhookCapture) {
  // TODO(DEV): override webhook sender service and push data into cap.calls
}
