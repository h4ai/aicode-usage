import * as fs from 'fs';
import * as path from 'path';
import { LockManager, TemplateLock } from './lock-manager';
import { ConflictResolver } from './conflict-resolver';

export interface FileChange {
  path: string;
  action: 'update' | 'add' | 'remove' | 'conflict';
  reason?: string;
}

export interface UpdateResult {
  updated: FileChange[];
  conflicts: FileChange[];
  added: FileChange[];
  removed: FileChange[];
  skipped: FileChange[];
  dryRun: boolean;
}

export interface RemoteTemplateInfo {
  version: string;
  files: Record<string, { hash: string; content: string }>;
  skills: Record<string, string>;
}

/**
 * Engine that compares local project files against a new template version,
 * performing selective updates based on hash comparison.
 */
export class UpdateEngine {
  private readonly lockManager: LockManager;
  private readonly conflictResolver: ConflictResolver;

  constructor(private readonly projectDir: string) {
    this.lockManager = new LockManager(projectDir);
    this.conflictResolver = new ConflictResolver(projectDir);
  }

  /**
   * Perform an update (or dry-run) from local lock → remote template.
   */
  async update(remote: RemoteTemplateInfo, dryRun: boolean = false): Promise<UpdateResult> {
    if (!this.lockManager.exists()) {
      throw new Error('No template.lock found. Run `skillhub init` first.');
    }

    const lock = this.lockManager.read();
    const currentHashes = LockManager.hashProjectFiles(this.projectDir);

    const result: UpdateResult = {
      updated: [],
      conflicts: [],
      added: [],
      removed: [],
      skipped: [],
      dryRun,
    };

    // Process each file in the remote template
    for (const [filePath, fileInfo] of Object.entries(remote.files)) {
      const lockHash = lock.files[filePath];
      const currentHash = currentHashes[filePath];

      if (!lockHash) {
        // New file in remote template (not in original lock)
        result.added.push({ path: filePath, action: 'add' });
        if (!dryRun) {
          this.writeFile(filePath, fileInfo.content);
        }
      } else if (fileInfo.hash === lockHash) {
        // Remote file unchanged since last sync → skip
        result.skipped.push({ path: filePath, action: 'update', reason: 'unchanged in remote' });
      } else if (!currentHash) {
        // File was deleted locally → re-add from remote
        result.added.push({ path: filePath, action: 'add', reason: 'deleted locally, restored from remote' });
        if (!dryRun) {
          this.writeFile(filePath, fileInfo.content);
        }
      } else if (currentHash === lockHash) {
        // User hasn't modified the file → safe to update
        result.updated.push({ path: filePath, action: 'update' });
        if (!dryRun) {
          this.writeFile(filePath, fileInfo.content);
        }
      } else {
        // User has modified the file AND remote has changed → CONFLICT
        result.conflicts.push({ path: filePath, action: 'conflict' });
        if (!dryRun) {
          this.conflictResolver.createConflictFile(filePath, fileInfo.content);
        }
      }
    }

    // Check for files in lock that are removed in remote
    for (const filePath of Object.keys(lock.files)) {
      if (!remote.files[filePath]) {
        result.removed.push({ path: filePath, action: 'remove', reason: 'removed in remote template' });
        // Don't auto-delete user files; just notify
      }
    }

    // Update the lock file if not dry-run
    if (!dryRun) {
      const newLock: TemplateLock = {
        ...lock,
        templateVersion: remote.version,
        updatedAt: new Date().toISOString(),
        skills: remote.skills,
        files: {}, // Recompute
      };

      // Recompute file hashes for the new state
      for (const [filePath, fileInfo] of Object.entries(remote.files)) {
        newLock.files[filePath] = fileInfo.hash;
      }

      this.lockManager.write(newLock);
    }

    return result;
  }

  /**
   * Check what would change (dry-run wrapper).
   */
  async preview(remote: RemoteTemplateInfo): Promise<UpdateResult> {
    return this.update(remote, true);
  }

  /**
   * Write a file to the project directory, creating parent dirs if needed.
   */
  private writeFile(relativePath: string, content: string): void {
    const fullPath = path.join(this.projectDir, relativePath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(fullPath, content, 'utf-8');
  }
}
