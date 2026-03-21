/**
 * Sprint 1 — SPEC-001 自动化测试数据
 */

export type TestUser = {
  username: string;
  password: string;
  department?: string | null;
  email?: string | null;
  adGroups?: string[];
  isActive?: boolean;
};

export const TEST_USERS: Record<string, TestUser> = {
  normal: {
    username: 'zhangsan',
    password: 'Test@123',
    department: 'Engineering',
    email: 'zhangsan@company.com',
    adGroups: ['SkillHub-Publisher'],
    isActive: true,
  },
  admin: {
    username: 'admin01',
    password: 'Admin@123',
    department: 'IT',
    email: 'admin@company.com',
    adGroups: ['SkillHub-Admin'],
    isActive: true,
  },
  reviewer: {
    username: 'reviewer01',
    password: 'Rev@123',
    department: 'Security',
    email: 'rev@company.com',
    adGroups: ['SkillHub-Reviewer'],
    isActive: true,
  },
  disabled: {
    username: 'disabled01',
    password: 'Dis@123',
    isActive: false,
  },
  noEmail: {
    username: 'noemail01',
    password: 'No@123',
    department: 'Sales',
    email: null,
    isActive: true,
  },
  noDept: {
    username: 'nodept01',
    password: 'No@123',
    department: null,
    email: 'nodept@company.com',
    isActive: true,
  },
  multiGroup: {
    username: 'multi01',
    password: 'Multi@123',
    adGroups: ['SkillHub-Reviewer', 'SkillHub-Admin'],
    department: 'IT',
    email: 'multi@company.com',
    isActive: true,
  },
};

/**
 * USERS — alias with role-based keys for e2e tests
 */
export const USERS: Record<string, TestUser> = {
  ...TEST_USERS,
  user: TEST_USERS.normal,
  publisher: {
    username: 'publisher01',
    password: 'Pub@123',
    department: 'Engineering',
    email: 'publisher@company.com',
    adGroups: ['SkillHub-Publisher'],
    isActive: true,
  },
};
