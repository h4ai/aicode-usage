import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

// ============================================================
// TDD — RED Phase: All tests written BEFORE implementation
// ============================================================

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  const createMockContext = (userRole: string): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { sub: 'user-001', role: userRole, department: 'Engineering' },
        }),
      }),
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
    } as unknown as ExecutionContext;
  };

  it('should allow access when no roles are required', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const context = createMockContext('USER');
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow ADMIN to access admin endpoints', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
    const context = createMockContext('ADMIN');
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should deny USER from accessing admin endpoints', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
    const context = createMockContext('USER');
    expect(guard.canActivate(context)).toBe(false);
  });

  it('should allow PUBLISHER to create skills', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['PUBLISHER', 'ADMIN']);
    const context = createMockContext('PUBLISHER');
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should deny USER from creating skills', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['PUBLISHER', 'ADMIN']);
    const context = createMockContext('USER');
    expect(guard.canActivate(context)).toBe(false);
  });

  it('should allow REVIEWER to review skills', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['REVIEWER', 'ADMIN']);
    const context = createMockContext('REVIEWER');
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should deny access when user object is missing', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({}),
      }),
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
    } as unknown as ExecutionContext;
    expect(guard.canActivate(context)).toBe(false);
  });

  it('should ADMIN bypass all role checks (ADMIN can do everything)', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['REVIEWER']);
    const context = createMockContext('ADMIN');
    expect(guard.canActivate(context)).toBe(true);
  });
});
