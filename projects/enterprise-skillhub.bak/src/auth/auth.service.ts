import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  ServiceUnavailableException,
  Inject,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '../config/config.service';

// Role priority: ADMIN > REVIEWER > PUBLISHER > USER
const ROLE_PRIORITY: Record<string, number> = {
  ADMIN: 4,
  REVIEWER: 3,
  PUBLISHER: 2,
  USER: 1,
};

export interface JwtPayload {
  sub: string;
  role: string;
  department: string;
  iat?: number;
  exp?: number;
}

export interface LoginResult {
  accessToken: string;
  user: {
    id: string;
    username: string;
    displayName: string;
    email: string;
    department: string | null;
    role: string;
    isActive: boolean;
  };
}

interface LdapClient {
  bind(dn: string, password: string): Promise<void>;
  search(base: string, options: Record<string, unknown>): Promise<LdapEntry[]>;
  unbind(): Promise<void>;
}

interface LdapEntry {
  sAMAccountName: string;
  displayName: string;
  mail: string;
  department?: string;
  memberOf?: string | string[];
  userAccountControl?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Inject('LDAP_CLIENT_FACTORY')
    private readonly ldapClientFactory: () => LdapClient,
  ) {}

  /**
   * Authenticate user via LDAP/AD and return JWT token.
   * Syncs AD attributes to local DB on every login.
   */
  async login(username: string, password: string): Promise<LoginResult> {
    const ldapClient = this.ldapClientFactory();

    let ldapEntry: LdapEntry;

    try {
      // Step 1: Bind with service account to search for user
      await ldapClient.bind(
        this.configService.ldapBindDn,
        this.configService.ldapBindPassword,
      );

      // Step 2: Search for user by username
      const searchFilter = this.configService.ldapSearchFilter.replace(
        '{{username}}',
        username,
      );
      const entries = await ldapClient.search(this.configService.ldapSearchBase, {
        filter: searchFilter,
        scope: 'sub',
      });

      if (!entries || entries.length === 0) {
        throw new UnauthorizedException({
          code: 'AUTH_INVALID_CREDENTIALS',
          message: 'Invalid username or password',
        });
      }

      ldapEntry = entries[0];

      // Step 3: Check if account is disabled (AD bit 0x2 = ACCOUNTDISABLE)
      if (ldapEntry.userAccountControl) {
        const uac = parseInt(ldapEntry.userAccountControl, 10);
        if ((uac & 0x2) !== 0) {
          throw new ForbiddenException({
            code: 'AUTH_ACCOUNT_DISABLED',
            message: 'Account is disabled',
          });
        }
      }
    } catch (err) {
      if (
        err instanceof UnauthorizedException ||
        err instanceof ForbiddenException
      ) {
        throw err;
      }
      // Connection errors → 503
      const message = err instanceof Error ? err.message : String(err);
      if (
        message.includes('ECONNREFUSED') ||
        message.includes('ETIMEDOUT') ||
        message.includes('ENOTFOUND')
      ) {
        throw new ServiceUnavailableException({
          code: 'LDAP_UNAVAILABLE',
          message: 'LDAP server is unavailable',
        });
      }
      // Invalid credentials from LDAP bind
      throw new UnauthorizedException({
        code: 'AUTH_INVALID_CREDENTIALS',
        message: 'Invalid username or password',
      });
    } finally {
      try {
        await ldapClient.unbind();
      } catch {
        // Ignore unbind errors
      }
    }

    // Step 4: Map AD groups to highest-privilege role
    const adGroups = Array.isArray(ldapEntry.memberOf)
      ? ldapEntry.memberOf
      : ldapEntry.memberOf
        ? [ldapEntry.memberOf]
        : [];

    const role = this.mapGroupsToRole(adGroups);

    // Step 5: Sync user to local database
    const userData = {
      username: ldapEntry.sAMAccountName,
      displayName: ldapEntry.displayName,
      email: ldapEntry.mail,
      department: ldapEntry.department || null,
      adGroups: adGroups,
      role: role as any,
      isActive: true,
    };

    const user = await this.prisma.user.upsert({
      where: { username: ldapEntry.sAMAccountName },
      update: userData,
      create: userData,
    });

    // Step 6: Sign JWT
    const payload: JwtPayload = {
      sub: user.id,
      role: user.role,
      department: user.department || '',
    };

    const accessToken = await this.jwtService.signAsync(payload);

    return {
      accessToken,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        email: user.email,
        department: user.department,
        role: user.role,
        isActive: user.isActive,
      },
    };
  }

  /**
   * Validate JWT token and return payload.
   * Also checks that user is still active.
   */
  async validateToken(token: string): Promise<JwtPayload> {
    let payload: JwtPayload;

    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.configService.jwtSecret,
      });
    } catch {
      throw new UnauthorizedException({
        code: 'AUTH_TOKEN_INVALID',
        message: 'Invalid or expired token',
      });
    }

    // Verify user still exists and is active
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException({
        code: 'AUTH_USER_DEACTIVATED',
        message: 'User account is deactivated',
      });
    }

    return payload;
  }

  /**
   * Get user profile by userId.
   */
  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        displayName: true,
        email: true,
        department: true,
        role: true,
        isActive: true,
        avatarUrl: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException({
        code: 'AUTH_USER_NOT_FOUND',
        message: 'User not found',
      });
    }

    return user;
  }

  /**
   * Logout — for stateless JWT, this is a no-op server-side.
   * Client should discard the token.
   */
  async logout(): Promise<{ message: string }> {
    return { message: 'Logged out successfully' };
  }

  /**
   * Map AD group memberships to the highest-privilege UserRole.
   * Priority: ADMIN > REVIEWER > PUBLISHER > USER
   */
  private mapGroupsToRole(adGroups: string[]): string {
    const groupRoleMap = this.configService.ldapGroupRoleMap;
    let highestRole = 'USER';
    let highestPriority = ROLE_PRIORITY['USER'];

    for (const group of adGroups) {
      const mappedRole = groupRoleMap[group];
      if (mappedRole && ROLE_PRIORITY[mappedRole] > highestPriority) {
        highestRole = mappedRole;
        highestPriority = ROLE_PRIORITY[mappedRole];
      }
    }

    return highestRole;
  }
}
