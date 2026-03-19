import {
  Injectable,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { GitCredentialService } from './git-credential.service';
import { StorageService } from '../storage/storage.service';
import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execSync } from 'child_process';

export interface CloneResult {
  fileKey: string;
  sha256: string;
  size: number;
  ref: string;
  subPath?: string;
}

@Injectable()
export class GitCloneService {
  private readonly logger = new Logger(GitCloneService.name);
  private readonly cloneTimeoutMs: number;
  private readonly maxRepoSizeMb: number;

  constructor(
    private readonly config: ConfigService,
    private readonly credentialService: GitCredentialService,
    private readonly storage: StorageService,
  ) {
    this.cloneTimeoutMs = this.config.gitCloneTimeoutMs;
    this.maxRepoSizeMb = this.config.gitMaxRepoSizeMb;
  }

  /**
   * Clone a Git repository, optionally extract a sub-path, create ZIP, upload to MinIO.
   */
  async cloneAndPackage(
    gitUrl: string,
    ref: string = 'HEAD',
    subPath?: string,
    credentialId?: string,
  ): Promise<CloneResult> {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skillhub-git-'));

    try {
      // Build clone command
      const cloneArgs = this.buildCloneArgs(gitUrl, ref, tmpDir, credentialId);

      // Execute shallow clone
      this.logger.log(`Cloning ${gitUrl} ref=${ref} to ${tmpDir}`);
      this.executeClone(cloneArgs, tmpDir);

      // Check repo size
      const repoSize = this.getDirectorySize(path.join(tmpDir, 'repo'));
      if (repoSize > this.maxRepoSizeMb * 1024 * 1024) {
        throw new BadRequestException(
          `Repository size ${Math.round(repoSize / 1024 / 1024)}MB exceeds limit of ${this.maxRepoSizeMb}MB`,
        );
      }

      // Determine source directory
      let sourceDir = path.join(tmpDir, 'repo');
      if (subPath) {
        sourceDir = path.join(sourceDir, subPath);
        if (!fs.existsSync(sourceDir)) {
          throw new BadRequestException(`Sub-path "${subPath}" does not exist in repository`);
        }
      }

      // Create ZIP
      const zipPath = path.join(tmpDir, 'package.zip');
      this.createZip(sourceDir, zipPath);

      // Calculate SHA256
      const zipBuffer = fs.readFileSync(zipPath);
      const sha256 = crypto.createHash('sha256').update(zipBuffer).digest('hex');

      // Upload to MinIO
      const fileKey = `git-packages/${sha256}.zip`;
      await this.storage.uploadFile(fileKey, zipBuffer, 'application/zip');

      return {
        fileKey,
        sha256,
        size: zipBuffer.length,
        ref,
        subPath,
      };
    } finally {
      // Cleanup temp dir
      this.cleanupDir(tmpDir);
    }
  }

  /**
   * Build clone command arguments.
   */
  private buildCloneArgs(
    gitUrl: string,
    ref: string,
    tmpDir: string,
    _credentialId?: string,
  ): string[] {
    const args = [
      'git', 'clone',
      '--depth', '1',
      '--single-branch',
    ];

    if (ref && ref !== 'HEAD') {
      args.push('--branch', ref);
    }

    args.push(gitUrl);
    args.push(path.join(tmpDir, 'repo'));

    return args;
  }

  /**
   * Execute git clone with timeout.
   */
  private executeClone(args: string[], _tmpDir: string): void {
    const command = args.join(' ');
    try {
      execSync(command, {
        timeout: this.cloneTimeoutMs,
        stdio: 'pipe',
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0', // Disable interactive prompts
        },
      });
    } catch (error) {
      if (error.killed) {
        throw new BadRequestException(`Clone timed out after ${this.cloneTimeoutMs / 1000}s`);
      }
      throw new BadRequestException(`Clone failed: ${error.message}`);
    }
  }

  /**
   * Create a ZIP file from a directory.
   */
  private createZip(sourceDir: string, outputPath: string): void {
    try {
      execSync(`cd "${sourceDir}" && zip -r "${outputPath}" . -x ".git/*"`, {
        stdio: 'pipe',
        timeout: 30000,
      });
    } catch (error) {
      throw new BadRequestException(`Failed to create ZIP package: ${error.message}`);
    }
  }

  /**
   * Get total size of a directory in bytes.
   */
  private getDirectorySize(dirPath: string): number {
    if (!fs.existsSync(dirPath)) return 0;

    let totalSize = 0;
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isFile()) {
        totalSize += fs.statSync(fullPath).size;
      } else if (entry.isDirectory()) {
        totalSize += this.getDirectorySize(fullPath);
      }
    }

    return totalSize;
  }

  /**
   * Safely cleanup a temp directory.
   */
  private cleanupDir(dirPath: string): void {
    try {
      fs.rmSync(dirPath, { recursive: true, force: true });
    } catch (error) {
      this.logger.warn(`Failed to cleanup temp dir ${dirPath}: ${error.message}`);
    }
  }
}
