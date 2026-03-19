import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface TemplateLock {
  templateName: string;
  templateVersion: string;
  namespace: string;
  createdAt: string;
  updatedAt: string;
  skills: Record<string, string>; // skillName -> resolvedVersion
  files: Record<string, string>;  // relativePath -> sha256 hash
}

const LOCK_DIR = '.skillhub';
const LOCK_FILE = 'template.lock';

/**
 * Manages reading/writing of .skillhub/template.lock files.
 */
export class LockManager {
  private readonly lockPath: string;

  constructor(private readonly projectDir: string) {
    this.lockPath = path.join(projectDir, LOCK_DIR, LOCK_FILE);
  }

  /**
   * Check if a lock file exists.
   */
  exists(): boolean {
    return fs.existsSync(this.lockPath);
  }

  /**
   * Read and parse the lock file.
   */
  read(): TemplateLock {
    if (!this.exists()) {
      throw new Error(`Lock file not found at ${this.lockPath}`);
    }

    const content = fs.readFileSync(this.lockPath, 'utf-8');
    try {
      return JSON.parse(content) as TemplateLock;
    } catch {
      throw new Error('Invalid lock file format: could not parse JSON');
    }
  }

  /**
   * Write a lock file to disk.
   */
  write(lock: TemplateLock): void {
    const dir = path.dirname(this.lockPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(this.lockPath, JSON.stringify(lock, null, 2), 'utf-8');
  }

  /**
   * Create an initial lock from a template initialization.
   */
  static createInitialLock(
    projectDir: string,
    templateName: string,
    templateVersion: string,
    namespace: string,
    skills: Record<string, string>,
  ): TemplateLock {
    const now = new Date().toISOString();
    const files = LockManager.hashProjectFiles(projectDir);

    return {
      templateName,
      templateVersion,
      namespace,
      createdAt: now,
      updatedAt: now,
      skills,
      files,
    };
  }

  /**
   * Hash all files in a project directory (excluding .skillhub/, node_modules/, .git/).
   */
  static hashProjectFiles(
    dir: string,
    basePath: string = '',
  ): Record<string, string> {
    const result: Record<string, string> = {};
    const excludeDirs = ['.skillhub', 'node_modules', '.git', 'dist'];

    if (!fs.existsSync(dir)) return result;

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        if (!excludeDirs.includes(entry.name)) {
          Object.assign(
            result,
            LockManager.hashProjectFiles(path.join(dir, entry.name), relativePath),
          );
        }
      } else if (entry.isFile()) {
        const fullPath = path.join(dir, entry.name);
        const content = fs.readFileSync(fullPath);
        const hash = crypto.createHash('sha256').update(content).digest('hex');
        result[relativePath] = hash;
      }
    }

    return result;
  }

  /**
   * Compute SHA256 hash of a single file.
   */
  static hashFile(filePath: string): string {
    const content = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  }
}
