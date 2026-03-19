import { Test, TestingModule } from '@nestjs/testing';
import { GitCloneService } from './git-clone.service';
import { ConfigService } from '../config/config.service';
import { GitCredentialService } from './git-credential.service';
import { StorageService } from '../storage/storage.service';
import { BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

// Mock child_process and fs
jest.mock('child_process', () => ({
  execSync: jest.fn(),
}));

// Mock PrismaService to avoid native binary dependency
jest.mock('../prisma/prisma.service', () => ({
  PrismaService: jest.fn().mockImplementation(() => ({
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  })),
}));

describe('GitCloneService', () => {
  let service: GitCloneService;
  let storage: jest.Mocked<StorageService>;
  let credentialService: jest.Mocked<GitCredentialService>;

  const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;

  beforeEach(async () => {
    jest.clearAllMocks();

    const mockConfig = {
      gitCredentialKey: 'test-key',
      gitAllowedDomains: [],
      gitCloneTimeoutMs: 60000,
      gitMaxRepoSizeMb: 500,
    };

    const mockStorage = {
      uploadFile: jest.fn().mockResolvedValue(undefined),
    };

    const mockCredService = {
      getDecryptedCredential: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GitCloneService,
        { provide: ConfigService, useValue: mockConfig },
        { provide: StorageService, useValue: mockStorage },
        { provide: GitCredentialService, useValue: mockCredService },
      ],
    }).compile();

    service = module.get<GitCloneService>(GitCloneService);
    storage = module.get(StorageService);
    credentialService = module.get(GitCredentialService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ==========================================================
  // CLONE AND PACKAGE
  // ==========================================================
  describe('cloneAndPackage', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = '';
      // Mock fs.mkdtempSync to return a controllable temp dir
      const realMkdtemp = jest.spyOn(fs, 'mkdtempSync');
      tmpDir = path.join(os.tmpdir(), 'test-git-clone-' + Date.now());
      realMkdtemp.mockReturnValue(tmpDir);

      // Mock fs.existsSync to check for repo dir
      jest.spyOn(fs, 'existsSync').mockImplementation((p: any) => {
        const pStr = p.toString();
        if (pStr === path.join(tmpDir, 'repo')) return true;
        if (pStr === tmpDir) return true;
        return false;
      });

      // Mock fs.readdirSync for getDirectorySize
      jest.spyOn(fs, 'readdirSync').mockReturnValue([] as any);

      // Mock fs.readFileSync for ZIP reading
      const mockZipBuffer = Buffer.from('PK\x03\x04mock-zip-content');
      jest.spyOn(fs, 'readFileSync').mockReturnValue(mockZipBuffer);

      // Mock fs.rmSync for cleanup
      jest.spyOn(fs, 'rmSync').mockImplementation(() => {});

      // Mock execSync: first call for clone, second for zip
      mockExecSync.mockImplementation(() => Buffer.from(''));
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should clone, zip, and upload to MinIO', async () => {
      const result = await service.cloneAndPackage(
        'https://github.com/org/repo.git',
        'v1.0.0',
      );

      expect(result.fileKey).toMatch(/^git-packages\/.+\.zip$/);
      expect(result.sha256).toBeDefined();
      expect(result.sha256.length).toBe(64);
      expect(result.size).toBeGreaterThan(0);
      expect(result.ref).toBe('v1.0.0');
      expect(storage.uploadFile).toHaveBeenCalledTimes(1);
    });

    it('should use HEAD as default ref', async () => {
      const result = await service.cloneAndPackage(
        'https://github.com/org/repo.git',
      );

      expect(result.ref).toBe('HEAD');
      // Verify clone command doesn't include --branch when ref is HEAD
      const cloneCall = mockExecSync.mock.calls[0][0] as string;
      expect(cloneCall).toContain('--depth');
      expect(cloneCall).toContain('--single-branch');
    });

    it('should handle sub-path extraction', async () => {
      jest.spyOn(fs, 'existsSync').mockImplementation((p: any) => {
        return true; // All paths exist
      });

      const result = await service.cloneAndPackage(
        'https://github.com/org/monorepo.git',
        'main',
        'packages/my-template',
      );

      expect(result.subPath).toBe('packages/my-template');
    });

    it('should throw when sub-path does not exist', async () => {
      jest.spyOn(fs, 'existsSync').mockImplementation((p: any) => {
        const pStr = p.toString();
        if (pStr.includes('nonexistent-path')) return false;
        return true;
      });

      await expect(
        service.cloneAndPackage(
          'https://github.com/org/repo.git',
          'main',
          'nonexistent-path',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw on clone timeout', async () => {
      mockExecSync.mockImplementation(() => {
        const error: any = new Error('Timeout');
        error.killed = true;
        throw error;
      });

      await expect(
        service.cloneAndPackage('https://github.com/org/repo.git'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw on clone failure', async () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('fatal: repository not found');
      });

      await expect(
        service.cloneAndPackage('https://github.com/org/repo.git'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw when repo exceeds size limit', async () => {
      // Mock getDirectorySize to return a large size
      jest.spyOn(fs, 'readdirSync').mockReturnValue([
        { name: 'bigfile', isFile: () => true, isDirectory: () => false } as any,
      ]);
      jest.spyOn(fs, 'statSync').mockReturnValue({ size: 600 * 1024 * 1024 } as any);

      await expect(
        service.cloneAndPackage('https://github.com/org/huge-repo.git'),
      ).rejects.toThrow(/exceeds limit/);
    });

    it('should cleanup temp dir even on error', async () => {
      const rmSyncSpy = jest.spyOn(fs, 'rmSync');
      mockExecSync.mockImplementation(() => {
        throw new Error('clone failed');
      });

      await expect(
        service.cloneAndPackage('https://github.com/org/repo.git'),
      ).rejects.toThrow();

      expect(rmSyncSpy).toHaveBeenCalled();
    });
  });
});
