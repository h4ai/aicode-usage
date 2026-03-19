import { Test, TestingModule } from '@nestjs/testing';
import { GitCredentialService } from './git-credential.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '../config/config.service';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { encrypt } from './crypto.util';

describe('GitCredentialService', () => {
  let service: GitCredentialService;
  let prisma: any;

  const ENCRYPTION_KEY = 'test-key-for-unit-tests';
  const mockUserId = 'user-1';

  const mockCredential = {
    id: 'cred-1',
    name: 'github-token',
    type: 'TOKEN',
    url: 'https://github.com/org/repo.git',
    credential: '', // will be set in beforeEach
    ownerId: 'user-1',
    scope: 'PERSONAL',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    // Encrypt a mock credential
    mockCredential.credential = encrypt('ghp_testtoken123', ENCRYPTION_KEY);

    const mockPrisma = {
      gitCredential: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
    };

    const mockConfig = {
      gitCredentialKey: ENCRYPTION_KEY,
      gitAllowedDomains: [], // empty = allow all (dev mode)
      gitCloneTimeoutMs: 60000,
      gitMaxRepoSizeMb: 500,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GitCredentialService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<GitCredentialService>(GitCredentialService);
    prisma = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ==========================================================
  // CREATE
  // ==========================================================
  describe('create', () => {
    it('should create a credential with encrypted value', async () => {
      prisma.gitCredential.create.mockResolvedValue(mockCredential);

      const result = await service.create(
        {
          name: 'github-token',
          type: 'TOKEN' as any,
          url: 'https://github.com/org/repo.git',
          credential: 'ghp_testtoken123',
        },
        mockUserId,
      );

      expect(result.credentialMasked).toBe('***');
      expect(result.credential).toBeUndefined();
      expect(prisma.gitCredential.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'github-token',
            type: 'TOKEN',
            ownerId: 'user-1',
          }),
        }),
      );
      // Verify the stored credential is encrypted (not plaintext)
      const storedData = prisma.gitCredential.create.mock.calls[0][0].data;
      expect(storedData.credential).not.toBe('ghp_testtoken123');
      expect(storedData.credential.length).toBeGreaterThan(20);
    });

    it('should default scope to PERSONAL', async () => {
      prisma.gitCredential.create.mockResolvedValue(mockCredential);

      await service.create(
        {
          name: 'test',
          type: 'TOKEN' as any,
          url: 'https://github.com/test.git',
          credential: 'token',
        },
        mockUserId,
      );

      expect(prisma.gitCredential.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ scope: 'PERSONAL' }),
        }),
      );
    });
  });

  // ==========================================================
  // FIND ALL
  // ==========================================================
  describe('findAll', () => {
    it('should return credentials without plaintext', async () => {
      prisma.gitCredential.findMany.mockResolvedValue([mockCredential]);

      const results = await service.findAll(mockUserId);

      expect(results).toHaveLength(1);
      expect(results[0].credentialMasked).toBe('***');
      expect(results[0].credential).toBeUndefined();
    });

    it('should only query for the given user', async () => {
      prisma.gitCredential.findMany.mockResolvedValue([]);

      await service.findAll('user-2');

      expect(prisma.gitCredential.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { ownerId: 'user-2' },
        }),
      );
    });
  });

  // ==========================================================
  // FIND ONE
  // ==========================================================
  describe('findOne', () => {
    it('should return sanitized credential when owned by user', async () => {
      prisma.gitCredential.findUnique.mockResolvedValue(mockCredential);

      const result = await service.findOne('cred-1', 'user-1');

      expect(result.id).toBe('cred-1');
      expect(result.credential).toBeUndefined();
      expect(result.credentialMasked).toBe('***');
    });

    it('should throw NotFoundException for non-existent credential', async () => {
      prisma.gitCredential.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent', mockUserId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException when not owner', async () => {
      prisma.gitCredential.findUnique.mockResolvedValue(mockCredential);

      await expect(service.findOne('cred-1', 'other-user')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ==========================================================
  // DELETE
  // ==========================================================
  describe('remove', () => {
    it('should delete credential when owned by user', async () => {
      prisma.gitCredential.findUnique.mockResolvedValue(mockCredential);
      prisma.gitCredential.delete.mockResolvedValue(mockCredential);

      const result = await service.remove('cred-1', 'user-1');

      expect(result).toEqual({ deleted: true, id: 'cred-1' });
      expect(prisma.gitCredential.delete).toHaveBeenCalledWith({ where: { id: 'cred-1' } });
    });

    it('should throw NotFoundException for non-existent credential', async () => {
      prisma.gitCredential.findUnique.mockResolvedValue(null);

      await expect(service.remove('nonexistent', mockUserId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException when not owner', async () => {
      prisma.gitCredential.findUnique.mockResolvedValue(mockCredential);

      await expect(service.remove('cred-1', 'other-user')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ==========================================================
  // TEST CONNECTIVITY
  // ==========================================================
  describe('testConnectivity', () => {
    it('should return success when credential can be decrypted', async () => {
      prisma.gitCredential.findUnique.mockResolvedValue(mockCredential);

      const result = await service.testConnectivity('cred-1', 'user-1');

      expect(result.success).toBe(true);
      expect(result.message).toContain('valid');
    });

    it('should return failure when decryption fails', async () => {
      const badCred = { ...mockCredential, credential: 'not-valid-encrypted-data' };
      prisma.gitCredential.findUnique.mockResolvedValue(badCred);

      const result = await service.testConnectivity('cred-1', 'user-1');

      expect(result.success).toBe(false);
      expect(result.message).toContain('failed');
    });

    it('should throw NotFoundException for non-existent credential', async () => {
      prisma.gitCredential.findUnique.mockResolvedValue(null);

      await expect(service.testConnectivity('nonexistent', mockUserId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException when not owner', async () => {
      prisma.gitCredential.findUnique.mockResolvedValue(mockCredential);

      await expect(service.testConnectivity('cred-1', 'other-user')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ==========================================================
  // SSRF PROTECTION
  // ==========================================================
  describe('SSRF protection', () => {
    let restrictedService: GitCredentialService;
    let restrictedPrisma: any;

    beforeEach(async () => {
      restrictedPrisma = {
        gitCredential: {
          create: jest.fn().mockResolvedValue(mockCredential),
          findMany: jest.fn(),
          findUnique: jest.fn(),
          delete: jest.fn(),
        },
      };

      const restrictedConfig = {
        gitCredentialKey: ENCRYPTION_KEY,
        gitAllowedDomains: ['github.com', 'gitlab.internal.com'],
        gitCloneTimeoutMs: 60000,
        gitMaxRepoSizeMb: 500,
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          GitCredentialService,
          { provide: PrismaService, useValue: restrictedPrisma },
          { provide: ConfigService, useValue: restrictedConfig },
        ],
      }).compile();

      restrictedService = module.get<GitCredentialService>(GitCredentialService);
    });

    it('should allow URLs with whitelisted domains', async () => {
      await expect(
        restrictedService.create(
          { name: 'test', type: 'TOKEN' as any, url: 'https://github.com/org/repo.git', credential: 'tok' },
          mockUserId,
        ),
      ).resolves.toBeDefined();
    });

    it('should allow URLs with subdomains of whitelisted domains', async () => {
      await expect(
        restrictedService.create(
          { name: 'test', type: 'TOKEN' as any, url: 'https://api.github.com/org/repo.git', credential: 'tok' },
          mockUserId,
        ),
      ).resolves.toBeDefined();
    });

    it('should reject URLs with non-whitelisted domains', async () => {
      await expect(
        restrictedService.create(
          { name: 'test', type: 'TOKEN' as any, url: 'https://evil.com/repo.git', credential: 'tok' },
          mockUserId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject URLs with localhost', async () => {
      await expect(
        restrictedService.create(
          { name: 'test', type: 'TOKEN' as any, url: 'http://localhost:8080/repo.git', credential: 'tok' },
          mockUserId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle SSH-style URLs', async () => {
      await expect(
        restrictedService.create(
          { name: 'test', type: 'SSH_KEY' as any, url: 'git@github.com:org/repo.git', credential: 'key' },
          mockUserId,
        ),
      ).resolves.toBeDefined();
    });

    it('should reject SSH-style URLs with non-whitelisted domains', async () => {
      await expect(
        restrictedService.create(
          { name: 'test', type: 'SSH_KEY' as any, url: 'git@evil.com:org/repo.git', credential: 'key' },
          mockUserId,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ==========================================================
  // GET DECRYPTED CREDENTIAL (internal use)
  // ==========================================================
  describe('getDecryptedCredential', () => {
    it('should return decrypted credential for clone operations', async () => {
      prisma.gitCredential.findUnique.mockResolvedValue(mockCredential);

      const result = await service.getDecryptedCredential('cred-1');

      expect(result.url).toBe('https://github.com/org/repo.git');
      expect(result.type).toBe('TOKEN');
      expect(result.credential).toBe('ghp_testtoken123');
    });

    it('should throw NotFoundException if not found', async () => {
      prisma.gitCredential.findUnique.mockResolvedValue(null);

      await expect(service.getDecryptedCredential('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
