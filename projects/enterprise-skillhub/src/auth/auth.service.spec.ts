import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '../config/config.service';

// ============================================================
// TDD — RED Phase: All tests written BEFORE implementation
// ============================================================

describe('AuthService', () => {
  let authService: AuthService;
  let prismaService: PrismaService;
  let jwtService: JwtService;
  let configService: ConfigService;

  // Mock LDAP client
  const mockLdapBind = jest.fn();
  const mockLdapSearch = jest.fn();
  const mockLdapUnbind = jest.fn();

  const mockUser = {
    id: 'user-001',
    username: 'jdoe',
    displayName: 'John Doe',
    email: 'jdoe@example.com',
    department: 'Engineering',
    adGroups: ['CN=SkillHub-Publishers,OU=Groups,DC=example,DC=com'],
    role: 'PUBLISHER',
    isActive: true,
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockLdapEntry = {
    sAMAccountName: 'jdoe',
    displayName: 'John Doe',
    mail: 'jdoe@example.com',
    department: 'Engineering',
    memberOf: [
      'CN=SkillHub-Publishers,OU=Groups,DC=example,DC=com',
      'CN=Domain-Users,OU=Groups,DC=example,DC=com',
    ],
    userAccountControl: '512', // Active account
  };

  const mockGroupRoleMap: Record<string, string> = {
    'CN=SkillHub-Admins,OU=Groups,DC=example,DC=com': 'ADMIN',
    'CN=SkillHub-Publishers,OU=Groups,DC=example,DC=com': 'PUBLISHER',
    'CN=SkillHub-Reviewers,OU=Groups,DC=example,DC=com': 'REVIEWER',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: jest.fn(),
              upsert: jest.fn(),
            },
            auditLog: {
              create: jest.fn(),
            },
          },
        },
        {
          provide: JwtService,
          useValue: {
            signAsync: jest.fn().mockResolvedValue('mock-jwt-token'),
            verifyAsync: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            jwtSecret: 'test-secret',
            jwtExpiresIn: '12h',
            ldapUrl: 'ldap://localhost:389',
            ldapBindDn: 'cn=admin,dc=example,dc=com',
            ldapBindPassword: 'admin_password',
            ldapSearchBase: 'ou=users,dc=example,dc=com',
            ldapSearchFilter: '(sAMAccountName={{username}})',
            ldapGroupRoleMap: mockGroupRoleMap,
            loginThrottleTtl: 60,
            loginThrottleLimit: 10,
          },
        },
        {
          provide: 'LDAP_CLIENT_FACTORY',
          useValue: () => ({
            bind: mockLdapBind,
            search: mockLdapSearch,
            unbind: mockLdapUnbind,
          }),
        },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
    prismaService = module.get<PrismaService>(PrismaService);
    jwtService = module.get<JwtService>(JwtService);
    configService = module.get<ConfigService>(ConfigService);

    jest.clearAllMocks();
  });

  describe('login', () => {
    it('should return JWT token for valid AD credentials', async () => {
      // Arrange: LDAP bind succeeds, search returns user entry
      mockLdapBind.mockResolvedValue(undefined);
      mockLdapSearch.mockResolvedValue([mockLdapEntry]);
      (prismaService.user.upsert as jest.Mock).mockResolvedValue(mockUser);

      // Act
      const result = await authService.login('jdoe', 'correct-password');

      // Assert
      expect(result).toHaveProperty('accessToken');
      expect(result.accessToken).toBe('mock-jwt-token');
      expect(result).toHaveProperty('user');
      expect(result.user.username).toBe('jdoe');
      expect(jwtService.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: 'user-001',
          role: 'PUBLISHER',
          department: 'Engineering',
        }),
      );
    });

    it('should throw UnauthorizedException for invalid password', async () => {
      // Arrange: LDAP bind fails (wrong password)
      mockLdapBind.mockRejectedValue(new Error('Invalid credentials'));

      // Act & Assert
      await expect(authService.login('jdoe', 'wrong-password')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException for non-existent user', async () => {
      // Arrange: LDAP search returns empty result
      mockLdapBind.mockResolvedValue(undefined);
      mockLdapSearch.mockResolvedValue([]);

      // Act & Assert
      await expect(authService.login('nonexistent', 'password')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw ForbiddenException for disabled user', async () => {
      // Arrange: LDAP returns user with disabled flag (userAccountControl 514)
      const disabledEntry = { ...mockLdapEntry, userAccountControl: '514' };
      mockLdapBind.mockResolvedValue(undefined);
      mockLdapSearch.mockResolvedValue([disabledEntry]);

      // Act & Assert
      await expect(authService.login('jdoe', 'password')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should sync AD attributes on login (department, email, adGroups)', async () => {
      // Arrange
      mockLdapBind.mockResolvedValue(undefined);
      mockLdapSearch.mockResolvedValue([mockLdapEntry]);
      (prismaService.user.upsert as jest.Mock).mockResolvedValue(mockUser);

      // Act
      await authService.login('jdoe', 'correct-password');

      // Assert: upsert called with synced AD attributes
      expect(prismaService.user.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { username: 'jdoe' },
          update: expect.objectContaining({
            displayName: 'John Doe',
            email: 'jdoe@example.com',
            department: 'Engineering',
            adGroups: mockLdapEntry.memberOf,
          }),
          create: expect.objectContaining({
            username: 'jdoe',
            displayName: 'John Doe',
            email: 'jdoe@example.com',
            department: 'Engineering',
          }),
        }),
      );
    });

    it('should map AD groups to UserRole (highest privilege wins)', async () => {
      // Arrange: User belongs to both ADMIN and PUBLISHER groups
      const adminEntry = {
        ...mockLdapEntry,
        memberOf: [
          'CN=SkillHub-Admins,OU=Groups,DC=example,DC=com',
          'CN=SkillHub-Publishers,OU=Groups,DC=example,DC=com',
        ],
      };
      const adminUser = { ...mockUser, id: 'user-admin', role: 'ADMIN' };
      mockLdapBind.mockResolvedValue(undefined);
      mockLdapSearch.mockResolvedValue([adminEntry]);
      (prismaService.user.upsert as jest.Mock).mockResolvedValue(adminUser);

      // Act
      const result = await authService.login('jdoe', 'correct-password');

      // Assert: ADMIN should win over PUBLISHER
      expect(prismaService.user.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            role: 'ADMIN',
          }),
          create: expect.objectContaining({
            role: 'ADMIN',
          }),
        }),
      );
    });

    it('should return 503 when LDAP server is unavailable', async () => {
      // Arrange: LDAP connection fails
      mockLdapBind.mockRejectedValue(new Error('ECONNREFUSED'));

      // Act & Assert
      await expect(authService.login('jdoe', 'password')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('should default to USER role when no AD groups match', async () => {
      // Arrange: User has no matching groups
      const noGroupEntry = {
        ...mockLdapEntry,
        memberOf: ['CN=Domain-Users,OU=Groups,DC=example,DC=com'],
      };
      const userRoleUser = { ...mockUser, role: 'USER' };
      mockLdapBind.mockResolvedValue(undefined);
      mockLdapSearch.mockResolvedValue([noGroupEntry]);
      (prismaService.user.upsert as jest.Mock).mockResolvedValue(userRoleUser);

      // Act
      await authService.login('jdoe', 'correct-password');

      // Assert: Should default to USER
      expect(prismaService.user.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ role: 'USER' }),
          create: expect.objectContaining({ role: 'USER' }),
        }),
      );
    });
  });

  describe('validateToken', () => {
    it('should validate JWT and return user payload', async () => {
      // Arrange
      const payload = { sub: 'user-001', role: 'PUBLISHER', department: 'Engineering' };
      (jwtService.verifyAsync as jest.Mock).mockResolvedValue(payload);
      (prismaService.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      // Act
      const result = await authService.validateToken('valid-jwt-token');

      // Assert
      expect(result).toEqual(expect.objectContaining({
        sub: 'user-001',
        role: 'PUBLISHER',
        department: 'Engineering',
      }));
    });

    it('should reject expired tokens', async () => {
      // Arrange
      (jwtService.verifyAsync as jest.Mock).mockRejectedValue(
        new Error('jwt expired'),
      );

      // Act & Assert
      await expect(authService.validateToken('expired-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should reject tampered tokens', async () => {
      // Arrange
      (jwtService.verifyAsync as jest.Mock).mockRejectedValue(
        new Error('invalid signature'),
      );

      // Act & Assert
      await expect(authService.validateToken('tampered-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should reject tokens for deactivated users', async () => {
      // Arrange
      const payload = { sub: 'user-001', role: 'USER', department: 'Engineering' };
      (jwtService.verifyAsync as jest.Mock).mockResolvedValue(payload);
      (prismaService.user.findUnique as jest.Mock).mockResolvedValue({
        ...mockUser,
        isActive: false,
      });

      // Act & Assert
      await expect(authService.validateToken('valid-but-deactivated')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
