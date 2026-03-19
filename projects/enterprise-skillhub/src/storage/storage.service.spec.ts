import { Test, TestingModule } from '@nestjs/testing';
import { StorageService } from './storage.service';
import { ConfigService } from '../config/config.service';
import * as path from 'path';

// ============================================================
// TDD Test Suite: StorageService
// Written BEFORE implementation per Sprint 2 TDD mandate
// ============================================================

// Mock minio module
const mockMinioClient = {
  bucketExists: jest.fn(),
  makeBucket: jest.fn(),
  putObject: jest.fn(),
  presignedGetObject: jest.fn(),
  removeObject: jest.fn(),
};

jest.mock('minio', () => ({
  Client: jest.fn().mockImplementation(() => mockMinioClient),
}));

describe('StorageService', () => {
  let service: StorageService;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    const mockConfig = {
      minioEndpoint: 'localhost',
      minioPort: 9000,
      minioUseSsl: false,
      minioAccessKey: 'minioaccess',
      minioSecretKey: 'miniosecret',
      minioBucket: 'skillhub',
    };

    // Reset mocks
    Object.values(mockMinioClient).forEach((fn) => fn.mockReset());

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageService,
        {
          provide: ConfigService,
          useValue: mockConfig,
        },
      ],
    }).compile();

    service = module.get<StorageService>(StorageService);
    configService = module.get(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ==========================================================
  // Upload
  // ==========================================================
  describe('uploadFile', () => {
    it('should upload a buffer to MinIO with correct storageKey', async () => {
      mockMinioClient.putObject.mockResolvedValue({ etag: 'abc123' });

      const buffer = Buffer.from('test content');
      const storageKey = 'skills/test-skill/1.0.0/SKILL.md';

      await service.uploadFile(storageKey, buffer, 'text/markdown');

      expect(mockMinioClient.putObject).toHaveBeenCalledWith(
        'skillhub',
        storageKey,
        buffer,
        buffer.length,
        expect.objectContaining({ 'Content-Type': 'text/markdown' }),
      );
    });

    it('should generate correct storageKey format', () => {
      const key = StorageService.buildStorageKey('my-skill', '1.2.3', 'SKILL.md');
      expect(key).toBe('skills/my-skill/1.2.3/SKILL.md');
    });

    it('should handle nested file paths in storageKey', () => {
      const key = StorageService.buildStorageKey(
        'my-skill',
        '1.0.0',
        'scripts/setup.sh',
      );
      expect(key).toBe('skills/my-skill/1.0.0/scripts/setup.sh');
    });
  });

  // ==========================================================
  // Pre-signed URL
  // ==========================================================
  describe('getPresignedUrl', () => {
    it('should generate a pre-signed download URL (5 min expiry)', async () => {
      const mockUrl = 'https://minio.example.com/skillhub/skills/test/1.0.0/file?sig=xxx';
      mockMinioClient.presignedGetObject.mockResolvedValue(mockUrl);

      const result = await service.getPresignedUrl(
        'skills/test-skill/1.0.0/SKILL.md',
      );

      expect(result).toBe(mockUrl);
      expect(mockMinioClient.presignedGetObject).toHaveBeenCalledWith(
        'skillhub',
        'skills/test-skill/1.0.0/SKILL.md',
        300, // 5 minutes
      );
    });
  });

  // ==========================================================
  // ZIP Validation — Magic Bytes
  // ==========================================================
  describe('validateZip', () => {
    it('should reject non-ZIP files (invalid magic bytes)', () => {
      const notZip = Buffer.from('This is not a zip file');

      expect(() => service.validateZipMagicBytes(notZip)).toThrow(
        'Invalid file: not a ZIP archive',
      );
    });

    it('should accept valid ZIP magic bytes', () => {
      // PK\x03\x04
      const validZip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);

      expect(() => service.validateZipMagicBytes(validZip)).not.toThrow();
    });
  });

  // ==========================================================
  // ZIP Validation — Zip Bomb Protection
  // ==========================================================
  describe('validateZipEntries', () => {
    it('should reject ZIP with uncompressed size > 200MB', async () => {
      const oversizeEntries = [
        { entryName: 'big.txt', header: { size: 300 * 1024 * 1024 } },
      ];

      await expect(
        service.validateZipEntries(oversizeEntries as any),
      ).rejects.toThrow(/exceeds maximum.*200MB/i);
    });

    it('should reject ZIP with more than 1000 files', async () => {
      const manyEntries = Array.from({ length: 1001 }, (_, i) => ({
        entryName: `file-${i}.txt`,
        header: { size: 100 },
      }));

      await expect(
        service.validateZipEntries(manyEntries as any),
      ).rejects.toThrow(/exceeds maximum.*1000/i);
    });

    it('should reject Zip Slip paths (path traversal)', async () => {
      const traversalEntries = [
        { entryName: '../../../etc/passwd', header: { size: 100 } },
      ];

      await expect(
        service.validateZipEntries(traversalEntries as any),
      ).rejects.toThrow(/path traversal/i);
    });

    it('should reject entries with absolute paths', async () => {
      const absoluteEntries = [
        { entryName: '/etc/passwd', header: { size: 100 } },
      ];

      await expect(
        service.validateZipEntries(absoluteEntries as any),
      ).rejects.toThrow(/path traversal/i);
    });

    it('should accept valid ZIP entries', async () => {
      const validEntries = [
        { entryName: 'SKILL.md', header: { size: 1024 } },
        { entryName: 'scripts/setup.sh', header: { size: 512 } },
      ];

      await expect(
        service.validateZipEntries(validEntries as any),
      ).resolves.not.toThrow();
    });
  });

  // ==========================================================
  // SKILL.md validation
  // ==========================================================
  describe('validateSkillMd', () => {
    it('should require SKILL.md in ZIP root', async () => {
      const entriesWithoutSkillMd = [
        { entryName: 'README.md', header: { size: 100 } },
        { entryName: 'scripts/run.sh', header: { size: 200 } },
      ];

      expect(() =>
        service.validateSkillMdPresence(entriesWithoutSkillMd as any),
      ).toThrow(/SKILL\.md.*required/i);
    });

    it('should pass when SKILL.md exists in root', () => {
      const validEntries = [
        { entryName: 'SKILL.md', header: { size: 1024 } },
        { entryName: 'scripts/run.sh', header: { size: 200 } },
      ];

      expect(() =>
        service.validateSkillMdPresence(validEntries as any),
      ).not.toThrow();
    });
  });

  // ==========================================================
  // Bucket initialization
  // ==========================================================
  describe('ensureBucket', () => {
    it('should create bucket if it does not exist', async () => {
      mockMinioClient.bucketExists.mockResolvedValue(false);
      mockMinioClient.makeBucket.mockResolvedValue(undefined);

      await service.ensureBucket();

      expect(mockMinioClient.makeBucket).toHaveBeenCalledWith('skillhub');
    });

    it('should skip creation if bucket already exists', async () => {
      mockMinioClient.bucketExists.mockResolvedValue(true);

      await service.ensureBucket();

      expect(mockMinioClient.makeBucket).not.toHaveBeenCalled();
    });
  });

  // ==========================================================
  // Delete
  // ==========================================================
  describe('deleteFile', () => {
    it('should delete a file from MinIO', async () => {
      mockMinioClient.removeObject.mockResolvedValue(undefined);

      await service.deleteFile('skills/test-skill/1.0.0/SKILL.md');

      expect(mockMinioClient.removeObject).toHaveBeenCalledWith(
        'skillhub',
        'skills/test-skill/1.0.0/SKILL.md',
      );
    });
  });
});
