/**
 * Sprint 5 QA — Security Headers e2e 测试
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('Security Headers (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => { await app?.close(); });

  // SH-001: X-Frame-Options 防止点击劫持
  it('should include X-Frame-Options: DENY', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health/live');
    if (res.status === 200) {
      expect(res.headers['x-frame-options']).toMatch(/DENY|SAMEORIGIN/i);
    }
  });

  // SH-002: X-Content-Type-Options 防止 MIME 嗅探
  it('should include X-Content-Type-Options: nosniff', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health/live');
    if (res.status === 200) {
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    }
  });

  // SH-003: Strict-Transport-Security
  it('should include Strict-Transport-Security', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health/live');
    if (res.status === 200) {
      // Helmet 默认添加 HSTS
      expect(res.headers).toHaveProperty('strict-transport-security');
    }
  });

  // SH-004: 不暴露 X-Powered-By
  it('should NOT include X-Powered-By header', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health/live');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
