// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Http = any;

export type CreateSkillInput = {
  slug: string;
  displayName: string;
  summary?: string;
  category?: string;
  visibility?: 'PUBLIC' | 'DEPARTMENT' | 'PRIVATE';
  allowedDepts?: string[];
  tags?: string[];
};

export async function createSkill(http: Http, token: string, input: CreateSkillInput) {
  return http
    .post('/api/v1/skills')
    .set('Authorization', `Bearer ${token}`)
    .send({
      category: 'GENERAL',
      visibility: 'DEPARTMENT',
      allowedDepts: [],
      tags: [],
      ...input,
    });
}

export async function getSkillList(http: Http, token: string, query: Record<string, any> = {}) {
  return http.get('/api/v1/skills').set('Authorization', `Bearer ${token}`).query(query);
}

export async function getSkillDetail(http: Http, token: string, slug: string, query: Record<string, any> = {}) {
  return http.get(`/api/v1/skills/${encodeURIComponent(slug)}`).set('Authorization', `Bearer ${token}`).query(query);
}

export async function patchSkill(http: Http, token: string, slug: string, patch: Record<string, any>) {
  return http
    .patch(`/api/v1/skills/${encodeURIComponent(slug)}`)
    .set('Authorization', `Bearer ${token}`)
    .send(patch);
}

export async function deleteSkill(http: Http, token: string, slug: string, query: Record<string, any> = {}) {
  return http
    .delete(`/api/v1/skills/${encodeURIComponent(slug)}`)
    .set('Authorization', `Bearer ${token}`)
    .query(query);
}
