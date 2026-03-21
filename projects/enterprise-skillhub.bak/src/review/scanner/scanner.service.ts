import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// ============================================================
// Scanner Service: 4-stage automated scan pipeline
// ============================================================

export type ScanSeverity = 'INFO' | 'WARNING' | 'FATAL';

export interface ScanFinding {
  rule: string;
  severity: ScanSeverity;
  file: string;
  line?: number;
  message: string;
}

export interface ScanResult {
  passed: boolean;
  severity: ScanSeverity;
  details: string;
  findings: ScanFinding[];
}

export interface IntegrityResult {
  passed: boolean;
  severity: ScanSeverity;
  details: string;
  missingFiles: string[];
}

export interface SecurityResult {
  passed: boolean;
  findings: ScanFinding[];
}

export interface LicenseResult {
  passed: boolean;
  severity: ScanSeverity;
  licenseName: string | null;
}

export interface QualityResult {
  score: number;
  fileCount: number;
  totalSize: number;
  hasReadme: boolean;
  hasLicense: boolean;
  hasSkillMd: boolean;
  commentRatio: number;
}

export interface FullScanResult {
  integrity: IntegrityResult;
  security: SecurityResult;
  license: LicenseResult;
  quality: QualityResult;
  overallScore: number;
  passed: boolean;
}

// ---- Security scan patterns (GitHub Secret Scanning style) ----
const SECURITY_PATTERNS: Array<{ name: string; regex: RegExp; severity: ScanSeverity }> = [
  {
    name: 'aws-access-key',
    regex: /AKIA[0-9A-Z]{16}/g,
    severity: 'FATAL',
  },
  {
    name: 'private-key',
    regex: /-----BEGIN\s+(RSA|DSA|EC|OPENSSH|PGP)\s+PRIVATE KEY-----/g,
    severity: 'FATAL',
  },
  {
    name: 'password-assignment',
    regex: /(?:password|passwd|pwd)\s*[=:]\s*["'][^"']{4,}["']/gi,
    severity: 'FATAL',
  },
  {
    name: 'generic-api-token',
    regex: /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}/g,
    severity: 'FATAL',
  },
  {
    name: 'generic-secret',
    regex: /(?:secret|token|api[_-]?key)\s*[=:]\s*["'][A-Za-z0-9+/=]{20,}["']/gi,
    severity: 'WARNING',
  },
  {
    name: 'slack-webhook',
    regex: /https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]+/g,
    severity: 'FATAL',
  },
];

// ---- License detection patterns ----
const LICENSE_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: 'MIT', regex: /MIT License/i },
  { name: 'Apache-2.0', regex: /Apache License[\s\S]*Version 2\.0/i },
  { name: 'GPL-3.0', regex: /GNU GENERAL PUBLIC LICENSE[\s\S]*Version 3/i },
  { name: 'GPL-2.0', regex: /GNU GENERAL PUBLIC LICENSE[\s\S]*Version 2/i },
  { name: 'BSD-2-Clause', regex: /BSD 2-Clause/i },
  { name: 'BSD-3-Clause', regex: /BSD 3-Clause/i },
  { name: 'ISC', regex: /ISC License/i },
  { name: 'MPL-2.0', regex: /Mozilla Public License[\s\S]*Version 2\.0/i },
  { name: 'LGPL-3.0', regex: /GNU LESSER GENERAL PUBLIC LICENSE[\s\S]*Version 3/i },
  { name: 'Unlicense', regex: /This is free and unencumbered software/i },
];

@Injectable()
export class ScannerService {
  private readonly logger = new Logger(ScannerService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ==========================================================
  // Stage 1: File Integrity Check
  // ==========================================================
  checkIntegrity(
    files: Array<{ fileName: string; filePath?: string; fileSize: number }>,
    requiredFiles: string[],
  ): IntegrityResult {
    const fileNames = files.map((f) => f.fileName);
    const missingFiles = requiredFiles.filter(
      (rf) => !fileNames.includes(rf),
    );

    if (missingFiles.length > 0) {
      return {
        passed: false,
        severity: 'FATAL',
        details: `Missing required files: ${missingFiles.join(', ')}`,
        missingFiles,
      };
    }

    return {
      passed: true,
      severity: 'INFO',
      details: 'All required files present',
      missingFiles: [],
    };
  }

  // ==========================================================
  // Stage 2: Security Scan
  // ==========================================================
  scanSecurity(content: string, fileName: string): SecurityResult {
    // Skip env variable references
    if (/process\.env\./i.test(content) && !SECURITY_PATTERNS.some(p => p.regex.test(content))) {
      return { passed: true, findings: [] };
    }

    const findings: ScanFinding[] = [];

    for (const pattern of SECURITY_PATTERNS) {
      // Reset regex state
      pattern.regex.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = pattern.regex.exec(content)) !== null) {
        // Calculate line number
        const upToMatch = content.substring(0, match.index);
        const line = upToMatch.split('\n').length;

        findings.push({
          rule: pattern.name,
          severity: pattern.severity,
          file: fileName,
          line,
          message: `Potential ${pattern.name} found at line ${line}`,
        });
      }
    }

    return {
      passed: findings.length === 0,
      findings,
    };
  }

  // ==========================================================
  // Stage 3: License Check
  // ==========================================================
  checkLicense(
    files: Array<{ fileName: string; filePath?: string; fileSize: number }>,
    licenseContent: string | null,
  ): LicenseResult {
    const hasLicenseFile = files.some(
      (f) => f.fileName.toUpperCase().startsWith('LICENSE'),
    );

    if (!hasLicenseFile || !licenseContent) {
      return {
        passed: false,
        severity: 'WARNING',
        licenseName: null,
      };
    }

    // Try to identify the license
    for (const lp of LICENSE_PATTERNS) {
      if (lp.regex.test(licenseContent)) {
        return {
          passed: true,
          severity: 'INFO',
          licenseName: lp.name,
        };
      }
    }

    return {
      passed: true, // has license file, just unrecognized
      severity: 'INFO',
      licenseName: 'UNKNOWN',
    };
  }

  // ==========================================================
  // Stage 4: Quality Assessment
  // ==========================================================
  assessQuality(
    files: Array<{ fileName: string; fileSize: number }>,
    codeContent: string,
  ): QualityResult {
    const fileCount = files.length;
    const totalSize = files.reduce((sum, f) => sum + f.fileSize, 0);

    const hasSkillMd = files.some((f) => f.fileName === 'SKILL.md');
    const hasReadme = files.some((f) => f.fileName.toUpperCase().startsWith('README'));
    const hasLicense = files.some((f) => f.fileName.toUpperCase().startsWith('LICENSE'));

    // Calculate comment ratio
    const lines = codeContent.split('\n');
    const totalLines = lines.length;
    const commentLines = lines.filter(
      (l) => l.trim().startsWith('//') || l.trim().startsWith('#') || l.trim().startsWith('*'),
    ).length;
    const commentRatio = totalLines > 0 ? commentLines / totalLines : 0;

    // Scoring: 0-100
    let score = 0;

    // File presence (up to 40 points)
    if (hasSkillMd) score += 20;
    if (hasReadme) score += 10;
    if (hasLicense) score += 10;

    // File count bonus (up to 20 points) — more files usually means more complete
    score += Math.min(fileCount * 3, 20);

    // Size bonus (up to 15 points) — reasonable size
    if (totalSize > 500) score += 5;
    if (totalSize > 2000) score += 5;
    if (totalSize > 5000) score += 5;

    // Comment ratio (up to 15 points)
    score += Math.min(Math.round(commentRatio * 50), 15);

    // Code content exists (up to 10 points)
    if (codeContent.length > 0) score += 5;
    if (codeContent.length > 100) score += 5;

    // Cap at 100
    score = Math.min(score, 100);

    return {
      score,
      fileCount,
      totalSize,
      hasReadme,
      hasLicense,
      hasSkillMd,
      commentRatio: Math.round(commentRatio * 100) / 100,
    };
  }

  // ==========================================================
  // Full scan pipeline
  // ==========================================================
  async runScan(reviewId: string, policy: any): Promise<FullScanResult> {
    // Load review to get versionId
    const review = await this.prisma.skillReview.findUnique({
      where: { id: reviewId },
    });

    // Load files for this version
    const files = await this.prisma.skillFile.findMany({
      where: { skillVersionId: review?.versionId || reviewId },
    });

    const requiredFiles = policy?.requiredFiles || ['SKILL.md'];

    // Stage 1: Integrity
    const integrity = this.checkIntegrity(files, requiredFiles);

    // Stage 2: Security (combine all file contents — mock with empty string for now)
    // In production, we would read file contents from MinIO
    const allContent = ''; // placeholder — actual impl reads from storage
    const security = this.scanSecurity(allContent, 'all-files');

    // Stage 3: License
    const license = this.checkLicense(files, null); // placeholder

    // Stage 4: Quality
    const quality = this.assessQuality(files, allContent);

    const overallScore = quality.score;

    // Determine final status
    let hasFatal = false;
    if (!integrity.passed && integrity.severity === 'FATAL') hasFatal = true;
    if (!security.passed && policy?.blockOnSecurityFail) hasFatal = true;
    if (!license.passed && policy?.blockOnLicenseFail && license.severity === 'FATAL') hasFatal = true;

    const scanResult: FullScanResult = {
      integrity,
      security,
      license,
      quality,
      overallScore,
      passed: !hasFatal,
    };

    let newStatus: string;
    if (hasFatal) {
      newStatus = 'AUTO_REJECTED';
    } else if (policy?.autoApprove && overallScore >= (policy?.autoApproveMinScore || 90)) {
      newStatus = 'APPROVED';
    } else {
      newStatus = 'PENDING_MANUAL';
    }

    // Update review
    await this.prisma.skillReview.update({
      where: { id: reviewId },
      data: {
        status: newStatus as any,
        scanResult: scanResult as any,
        autoScannedAt: new Date(),
        autoScanPassed: !hasFatal,
        ...(newStatus === 'APPROVED' ? { approvedAt: new Date() } : {}),
      },
    });

    // If auto-approved, also update SkillVersion + Skill
    if (newStatus === 'APPROVED' && review) {
      await this.prisma.skillVersion.update({
        where: { id: review.versionId },
        data: { reviewStatus: 'APPROVED' },
      });
      await this.prisma.skill.update({
        where: { id: review.skillId },
        data: { publishedVersionId: review.versionId },
      });
    }

    return scanResult;
  }
}
