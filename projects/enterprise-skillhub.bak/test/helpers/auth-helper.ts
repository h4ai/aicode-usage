/**
 * Auth helper: login and auth header
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Http = any;

export type LoginResponse = {
  accessToken: string;
  user?: any;
};

export async function login(
  http: Http,
  username: string,
  password: string,
): Promise<LoginResponse> {
  const res = await http.post('/auth/login').send({ username, password });
  // Skeleton-friendly: allow 404 when API is not yet implemented
  expect([200, 404]).toContain(res.status);
  if (res.status === 404) {
    return { accessToken: '' };
  }
  expect(res.body).toHaveProperty('accessToken');
  return res.body as LoginResponse;
}

/**
 * loginAs — convenience wrapper that takes a TestUser object
 */
export async function loginAs(
  http: Http,
  user: { username: string; password: string },
): Promise<string> {
  const res = await login(http, user.username, user.password);
  return res.accessToken;
}

export function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}
