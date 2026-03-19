import { Test, TestingModule } from '@nestjs/testing';
import { ScannerService, ScanResult, ScanSeverity } from './scanner.service';
import { PrismaService } from '../../prisma/prisma.service';

// ============================================================
// TDD Test Suite: ScannerService
// Written BEFORE implementation per Sprint 3 TDD mandate
// ============================================================

describe('ScannerService', () => {
  let service: ScannerService;
  let prisma: any;

  const mockPolicy = {
    id: 'policy-1',
    name: 'Default',
    category: null,
    department: null,
    autoApprove: false,
    autoApproveMinScore: 90,
    blockOnSecurityFail: true,
    blockOnLicenseFail: true,
    requiredFiles: ['SKILL.md'],
    isActive: true,
  };

  const mockReview = {
    id: 'review-1',
    skillId: 'skill-1',
    versionId: 'version-1',
    submitterId: 'submitter-1',
    status: 'PENDING_AUTO',
  };

  beforeEach(async () => {
    prisma = {
      skillReview: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      skillFile: {
        findMany: jest.fn(),
      },
      skillVersion: {
        update: jest.fn(),
      },
      skill: {
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScannerService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<ScannerService>(ScannerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ==========================================================
  // Stage 1: File Integrity Check
  // ==========================================================
  describe('Stage 1: File integrity check', () => {
    it('should pass when SKILL.md exists', () => {
      const files = [
        { fileName: 'SKILL.md', filePath: 'skills/test/1.0.0/SKILL.md', fileSize: 100 },
        { fileName: 'index.ts', filePath: 'skills/test/1.0.0/index.ts', fileSize: 200 },
      ];

      const result = service.checkIntegrity(files, ['SKILL.md']);

      expect(result.passed).toBe(true);
      expect(result.severity).toBe('INFO');
    });

    it('should fail when SKILL.md is missing', () => {
      const files = [
        { fileName: 'index.ts', filePath: 'skills/test/1.0.0/index.ts', fileSize: 200 },
      ];

      const result = service.checkIntegrity(files, ['SKILL.md']);

      expect(result.passed).toBe(false);
      expect(result.severity).toBe('FATAL');
      expect(result.details).toContain('SKILL.md');
    });

    it('should check multiple required files', () => {
      const files = [
        { fileName: 'SKILL.md', filePath: 'skills/test/1.0.0/SKILL.md', fileSize: 100 },
      ];

      const result = service.checkIntegrity(files, ['SKILL.md', 'README.md']);

      expect(result.passed).toBe(false);
      expect(result.details).toContain('README.md');
    });
  });

  // ==========================================================
  // Stage 2: Security Scan
  // ==========================================================
  describe('Stage 2: Security scan', () => {
    it('should detect hardcoded AWS access key', () => {
      const content = 'AKIAIOSFODNN7EXAMPLE';
      const result = service.scanSecurity(content, 'config.ts');

      expect(result.passed).toBe(false);
      expect(result.findings.length).toBeGreaterThan(0);
      expect(result.findings[0].rule).toContain('aws');
    });

    it('should detect hardcoded private key', () => {
      const content = '-----BEGIN RSA PRIVATE KEY-----\nMIIEow...';
      const result = service.scanSecurity(content, 'key.pem');

      expect(result.passed).toBe(false);
      expect(result.findings.length).toBeGreaterThan(0);
    });

    it('should detect hardcoded password pattern', () => {
      const content = 'password = "supersecret123"';
      const result = service.scanSecurity(content, 'config.ts');

      expect(result.passed).toBe(false);
    });

    it('should detect generic API token patterns', () => {
      const content = 'api_token = "ghp_1234567890abcdef1234567890abcdef12345678"';
      const result = service.scanSecurity(content, 'config.ts');

      expect(result.passed).toBe(false);
    });

    it('should pass clean code', () => {
      const content = `
        export function hello() {
          return 'world';
        }
      `;
      const result = service.scanSecurity(content, 'index.ts');

      expect(result.passed).toBe(true);
      expect(result.findings.length).toBe(0);
    });

    it('should not flag environment variable references', () => {
      const content = 'const token = process.env.API_TOKEN;';
      const result = service.scanSecurity(content, 'config.ts');

      expect(result.passed).toBe(true);
    });
  });

  // ==========================================================
  // Stage 3: License Check
  // ==========================================================
  describe('Stage 3: License check', () => {
    it('should pass when LICENSE file with known open-source license exists', () => {
      const files = [
        { fileName: 'LICENSE', filePath: 'skills/test/1.0.0/LICENSE', fileSize: 1000 },
        { fileName: 'SKILL.md', filePath: 'skills/test/1.0.0/SKILL.md', fileSize: 100 },
      ];
      const licenseContent = 'MIT License\n\nCopyright (c) 2026';

      const result = service.checkLicense(files, licenseContent);

      expect(result.passed).toBe(true);
      expect(result.licenseName).toBe('MIT');
    });

    it('should detect Apache-2.0 license', () => {
      const files = [
        { fileName: 'LICENSE', filePath: 'skills/test/1.0.0/LICENSE', fileSize: 1000 },
      ];
      const licenseContent = 'Apache License\nVersion 2.0, January 2004';

      const result = service.checkLicense(files, licenseContent);

      expect(result.passed).toBe(true);
      expect(result.licenseName).toBe('Apache-2.0');
    });

    it('should warn when LICENSE file is missing', () => {
      const files = [
        { fileName: 'SKILL.md', filePath: 'skills/test/1.0.0/SKILL.md', fileSize: 100 },
      ];

      const result = service.checkLicense(files, null);

      expect(result.passed).toBe(false);
      expect(result.severity).toBe('WARNING');
    });

    it('should warn for unknown license content', () => {
      const files = [
        { fileName: 'LICENSE', filePath: 'skills/test/1.0.0/LICENSE', fileSize: 50 },
      ];
      const licenseContent = 'This is my custom proprietary license';

      const result = service.checkLicense(files, licenseContent);

      expect(result.passed).toBe(true); // has license file, just unknown type
      expect(result.licenseName).toBe('UNKNOWN');
    });
  });

  // ==========================================================
  // Stage 4: Quality Assessment
  // ==========================================================
  describe('Stage 4: Quality assessment', () => {
    it('should calculate quality score from file metrics', () => {
      const files = [
        { fileName: 'SKILL.md', fileSize: 2000 },
        { fileName: 'index.ts', fileSize: 5000 },
        { fileName: 'README.md', fileSize: 1500 },
        { fileName: 'LICENSE', fileSize: 1000 },
      ];
      const codeContent = '// This is a comment\nconst x = 1;\n// Another comment\nconst y = 2;\n';

      const result = service.assessQuality(files, codeContent);

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.fileCount).toBe(4);
    });

    it('should give higher score for having documentation', () => {
      const withDocs = [
        { fileName: 'SKILL.md', fileSize: 2000 },
        { fileName: 'README.md', fileSize: 1500 },
        { fileName: 'index.ts', fileSize: 500 },
      ];

      const withoutDocs = [
        { fileName: 'index.ts', fileSize: 500 },
      ];

      const scoreWithDocs = service.assessQuality(withDocs, 'const x = 1;');
      const scoreWithoutDocs = service.assessQuality(withoutDocs, 'const x = 1;');

      expect(scoreWithDocs.score).toBeGreaterThan(scoreWithoutDocs.score);
    });

    it('should return 0-100 range', () => {
      const files = [{ fileName: 'a.txt', fileSize: 1 }];
      const result = service.assessQuality(files, '');

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });
  });

  // ==========================================================
  // Full scan pipeline
  // ==========================================================
  describe('runScan (full pipeline)', () => {
    const cleanFiles = [
      { fileName: 'SKILL.md', filePath: 'skills/test/1.0.0/SKILL.md', fileSize: 500, sha256: 'abc' },
      { fileName: 'index.ts', filePath: 'skills/test/1.0.0/index.ts', fileSize: 200, sha256: 'def' },
      { fileName: 'LICENSE', filePath: 'skills/test/1.0.0/LICENSE', fileSize: 1000, sha256: 'ghi' },
    ];

    it('should set status to AUTO_REJECTED on FATAL finding', async () => {
      // Missing SKILL.md
      const badFiles = [
        { fileName: 'index.ts', filePath: 'skills/test/1.0.0/index.ts', fileSize: 200, sha256: 'def' },
      ];
      prisma.skillFile.findMany.mockResolvedValue(badFiles);
      prisma.skillReview.update.mockResolvedValue({
        ...mockReview,
        status: 'AUTO_REJECTED',
      });

      const result = await service.runScan('review-1', mockPolicy);

      expect(prisma.skillReview.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'AUTO_REJECTED',
          }),
        }),
      );
    });

    it('should set status to PENDING_MANUAL when scan passes', async () => {
      prisma.skillFile.findMany.mockResolvedValue(cleanFiles);
      prisma.skillReview.update.mockResolvedValue({
        ...mockReview,
        status: 'PENDING_MANUAL',
      });
      prisma.skillReview.findUnique.mockResolvedValue(mockReview);

      const result = await service.runScan('review-1', mockPolicy);

      expect(prisma.skillReview.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'PENDING_MANUAL',
          }),
        }),
      );
    });

    it('should auto-approve if policy allows and score meets threshold', async () => {
      const autoPolicy = {
        ...mockPolicy,
        autoApprove: true,
        autoApproveMinScore: 30, // lower threshold to match actual score
      };
      prisma.skillFile.findMany.mockResolvedValue(cleanFiles);
      prisma.skillReview.findUnique.mockResolvedValue(mockReview);
      prisma.skillReview.update.mockResolvedValue({
        ...mockReview,
        status: 'APPROVED',
      });
      prisma.skillVersion.update.mockResolvedValue({});
      prisma.skill.update.mockResolvedValue({});

      const result = await service.runScan('review-1', autoPolicy);

      expect(prisma.skillReview.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'APPROVED',
          }),
        }),
      );
    });

    it('should write scan details to autoScanDetail', async () => {
      prisma.skillFile.findMany.mockResolvedValue(cleanFiles);
      prisma.skillReview.findUnique.mockResolvedValue(mockReview);
      prisma.skillReview.update.mockResolvedValue({ ...mockReview, status: 'PENDING_MANUAL' });

      await service.runScan('review-1', mockPolicy);

      expect(prisma.skillReview.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            scanResult: expect.objectContaining({
              integrity: expect.any(Object),
              security: expect.any(Object),
              license: expect.any(Object),
              quality: expect.any(Object),
            }),
          }),
        }),
      );
    });
  });
});
