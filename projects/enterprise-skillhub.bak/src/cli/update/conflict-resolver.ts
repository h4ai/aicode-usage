import * as fs from 'fs';
import * as path from 'path';

const CONFLICT_DIR = '.skillhub/conflicts';

/**
 * Manages conflict files when template updates conflict with local changes.
 */
export class ConflictResolver {
  private readonly conflictDir: string;

  constructor(private readonly projectDir: string) {
    this.conflictDir = path.join(projectDir, CONFLICT_DIR);
  }

  /**
   * Create a conflict file in .skillhub/conflicts/
   * The user can then manually compare and merge.
   */
  createConflictFile(relativePath: string, remoteContent: string): string {
    const conflictPath = path.join(this.conflictDir, relativePath);
    const dir = path.dirname(conflictPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(conflictPath, remoteContent, 'utf-8');

    return conflictPath;
  }

  /**
   * List all conflict files.
   */
  listConflicts(dir?: string): string[] {
    const targetDir = dir || this.conflictDir;
    if (!fs.existsSync(targetDir)) return [];

    const conflicts: string[] = [];
    const entries = fs.readdirSync(targetDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(targetDir, entry.name);
      if (entry.isDirectory()) {
        conflicts.push(...this.listConflicts(fullPath));
      } else {
        // Return relative to conflict dir
        const relative = path.relative(this.conflictDir, fullPath);
        conflicts.push(relative);
      }
    }

    return conflicts;
  }

  /**
   * Resolve a conflict by accepting either "local" (keep current) or "remote" (use conflict file).
   */
  resolveConflict(relativePath: string, choice: 'local' | 'remote'): void {
    const conflictPath = path.join(this.conflictDir, relativePath);
    const localPath = path.join(this.projectDir, relativePath);

    if (!fs.existsSync(conflictPath)) {
      throw new Error(`No conflict file found for "${relativePath}"`);
    }

    if (choice === 'remote') {
      // Replace local file with remote version
      const dir = path.dirname(localPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const remoteContent = fs.readFileSync(conflictPath, 'utf-8');
      fs.writeFileSync(localPath, remoteContent, 'utf-8');
    }

    // Remove the conflict file
    fs.unlinkSync(conflictPath);

    // Clean up empty directories
    this.cleanEmptyDirs(path.dirname(conflictPath));
  }

  /**
   * Clear all conflict files.
   */
  clearAll(): void {
    if (fs.existsSync(this.conflictDir)) {
      fs.rmSync(this.conflictDir, { recursive: true, force: true });
    }
  }

  /**
   * Remove empty parent directories up to the conflict root.
   */
  private cleanEmptyDirs(dir: string): void {
    if (dir === this.conflictDir || !fs.existsSync(dir)) return;

    const entries = fs.readdirSync(dir);
    if (entries.length === 0) {
      fs.rmdirSync(dir);
      this.cleanEmptyDirs(path.dirname(dir));
    }
  }
}
