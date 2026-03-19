import type { HttpClient } from './auth-helper';
import { authHeader } from './auth-helper';

export type AdminUser = {
  id: string;
  username?: string;
  role?: string;
  status?: string;
  isActive?: boolean;
};

export async function listAdminUsers(http: HttpClient, token: string, query?: any) {
  const res = await http
    .get('/api/v1/admin/users')
    .query(query ?? {})
    .set(authHeader(token));
  return res;
}

export async function patchUserRole(http: HttpClient, token: string, userId: string, role: string) {
  const res = await http
    .patch(`/api/v1/admin/users/${encodeURIComponent(userId)}/role`)
    .send({ role })
    .set(authHeader(token));
  return res;
}

export async function patchUserStatus(
  http: HttpClient,
  token: string,
  userId: string,
  enabled: boolean,
) {
  const res = await http
    .patch(`/api/v1/admin/users/${encodeURIComponent(userId)}/status`)
    .send({ enabled })
    .set(authHeader(token));
  return res;
}

export async function listAuditLogs(http: HttpClient, token: string, query?: any) {
  const res = await http
    .get('/api/v1/admin/audit-logs')
    .query(query ?? {})
    .set(authHeader(token));
  return res;
}

export async function exportAuditLogs(http: HttpClient, token: string, query?: any) {
  const res = await http
    .get('/api/v1/admin/audit-logs/export')
    .query(query ?? {})
    .set(authHeader(token));
  return res;
}

export async function createPolicy(http: HttpClient, token: string, payload: any) {
  const res = await http.post('/api/v1/admin/review-policies').send(payload).set(authHeader(token));
  return res;
}

export async function listPolicies(http: HttpClient, token: string, query?: any) {
  const res = await http
    .get('/api/v1/admin/review-policies')
    .query(query ?? {})
    .set(authHeader(token));
  return res;
}

export async function patchPolicy(http: HttpClient, token: string, id: string, payload: any) {
  const res = await http
    .patch(`/api/v1/admin/review-policies/${encodeURIComponent(id)}`)
    .send(payload)
    .set(authHeader(token));
  return res;
}

export async function deletePolicy(http: HttpClient, token: string, id: string) {
  const res = await http
    .delete(`/api/v1/admin/review-policies/${encodeURIComponent(id)}`)
    .set(authHeader(token));
  return res;
}

export async function getSystemConfig(http: HttpClient, token: string) {
  const res = await http.get('/api/v1/admin/system-config').set(authHeader(token));
  return res;
}

export async function patchSystemConfig(http: HttpClient, token: string, payload: any) {
  const res = await http
    .patch('/api/v1/admin/system-config')
    .send(payload)
    .set(authHeader(token));
  return res;
}

export async function triggerSync(http: HttpClient, token: string) {
  const res = await http.post('/api/v1/admin/sync/trigger').set(authHeader(token));
  return res;
}

export async function getSyncStatus(http: HttpClient, token: string) {
  const res = await http.get('/api/v1/admin/sync/status').set(authHeader(token));
  return res;
}
