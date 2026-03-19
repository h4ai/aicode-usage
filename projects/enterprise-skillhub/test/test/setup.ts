/**
 * Sprint 1 — E2E Test Setup
 *
 * 说明：当前仓库仅包含测试计划文档，尚未引入 Nest.js 应用代码。
 * 本文件提供“可对接”的测试初始化骨架：
 * - 预留 Mock LDAP / Mock Redis / Prisma 测试库 Hook
 * - 统一 SuperTest http client 的获取方式
 *
 * 当 API 代码合入后：
 * - 将 createTestApp() 中的动态 import 替换为真实 AppModule
 * - 在 beforeAll 中启用 Nest TestingModule
 */

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const RedisMock = require('ioredis-mock');

export type TestBootstrap = {
  app: INestApplication;
  http: ReturnType<typeof request>;
  moduleRef: TestingModule;
  redis: any;
};

export async function createTestApp(): Promise<TestBootstrap> {
  // TODO(DEV): replace placeholder module with real AppModule
  // Example:
  // const { AppModule } = await import('../src/app.module');
  // const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

  const moduleRef = await Test.createTestingModule({
    imports: [],
  }).compile();

  const app = moduleRef.createNestApplication();

  // TODO: attach global pipes/filters if app uses them

  await app.init();

  const redis = new RedisMock();

  return {
    app,
    http: request(app.getHttpServer()),
    moduleRef,
    redis,
  };
}

export async function closeTestApp(t: TestBootstrap) {
  if (t?.redis?.disconnect) t.redis.disconnect();
  if (t?.app) await t.app.close();
}
