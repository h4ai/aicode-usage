/**
 * Auth helper: login and auth header
 */

import request, { type SuperTest, type Test } from 'supertest';

export type LoginResponse = {
  accessToken: string;
  user?: any;
};

export async function login(
  http: SuperTest<Test>,
  username: string,
  password: string,
): Promise<LoginResponse> {
  const res = await http.post('/auth/login').send({ username, password });
  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty('accessToken');
  return res.body as LoginResponse;
}

/**
 * loginAs — convenience wrapper that takes a TestUser object
 */
export async function loginAs(
  http: SuperTest<Test>,
  user: { username: string; password: string },
): Promise<string> {
  const res = await login(http, user.username, user.password);
  return res.accessToken;
}

export function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}
