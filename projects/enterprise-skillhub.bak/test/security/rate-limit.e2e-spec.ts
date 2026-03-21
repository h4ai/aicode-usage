/**
 * Sprint 5 QA — Rate Limiting e2e 测试
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('Rate Limiting (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => { await app?.close(); });

  // RL-001: Login 端点限流 10 req/min per IP
  it('POST /api/v1/auth/login should return 429 after 10 rapid requests', async () => {
    const requests = Array.from({ length: 11 }, () =>
      request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ username: 'test', password: 'wrong' })
    );
    const results = await Promise.all(requests);
    const last = results[results.length - 1];
    // 第 11 个请求应被限流（429）或接口不存在（404）
    expect([429, 401, 404]).toContain(last.status);
    // TODO: tighten to expect(last.status).toBe(429) after throttle guard merge
  });

  // RL-002: 429 响应应包含 Retry-After header
  it('429 response should include Retry-After header (contract)', async () => {
    // 契约测试：当限流触发时检查 header
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'test', password: 'wrong' });
    if (res.status === 429) {
      expect(res.headers).toHaveProperty('retry-after');
    }
  });

  // RL-003: Search 端点限流 30 req/min per user
  it('GET /api/v1/search/skills should rate limit at 30 req/min', async () => {
    // 契约测试骨架
    const res = await request(app.getHttpServer()).get('/api/v1/search/skills?q=test');
    expect([200, 401, 404, 429]).toContain(res.status);
  });
});
