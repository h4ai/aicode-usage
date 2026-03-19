import { UpdateEngine, RemoteTemplateInfo } from './update-engine';
import { LockManager, TemplateLock } from './lock-manager';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

describe('UpdateEngine', () => {
  let tmpDir: string;
  let engine: UpdateEngine;

  const createLock = (files: Record<string, string>, version = '1.0.0'): TemplateLock => ({
    templateName: 'test-template',
    templateVersion: version,
    namespace: 'test-ns',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    skills: { 'skill-a': '1.0.0' },
    files,
  });

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'update-engine-test-'));
    engine = new UpdateEngine(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeFile(relativePath: string, content: string): void {
    const fullPath = path.join(tmpDir, relativePath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf-8');
  }

  function writeLock(lock: TemplateLock): void {
    const lockDir = path.join(tmpDir, '.skillhub');
    if (!fs.existsSync(lockDir)) fs.mkdirSync(lockDir, { recursive: true });
    fs.writeFileSync(path.join(lockDir, 'template.lock'), JSON.stringify(lock));
  }

  // ==========================================================
  // UPDATE: UNMODIFIED FILES
  // ==========================================================
  describe('unmodified files', () => {
    it('should update files that user has not modified', async () => {
      const originalContent = 'original content';
      const originalHash = hashContent(originalContent);

      // Write original file
      writeFile('main.ts', originalContent);
      // Write lock with original hash
      writeLock(createLock({ 'main.ts': originalHash }));

      // Remote has new version
      const newContent = 'updated content';
      const remote: RemoteTemplateInfo = {
        version: '2.0.0',
        files: {
          'main.ts': { hash: hashContent(newContent), content: newContent },
        },
        skills: { 'skill-a': '1.0.0' },
      };

      const result = await engine.update(remote);

      expect(result.updated).toHaveLength(1);
      expect(result.updated[0].path).toBe('main.ts');
      expect(result.conflicts).toHaveLength(0);
      expect(fs.readFileSync(path.join(tmpDir, 'main.ts'), 'utf-8')).toBe(newContent);
    });
  });

  // ==========================================================
  // UPDATE: MODIFIED FILES → CONFLICT
  // ==========================================================
  describe('modified files (conflict)', () => {
    it('should create conflict file when user and remote both changed', async () => {
      const originalContent = 'original content';
      const originalHash = hashContent(originalContent);

      // Write modified file (user changed it)
      writeFile('main.ts', 'user modified content');
      // Write lock with original hash
      writeLock(createLock({ 'main.ts': originalHash }));

      // Remote also changed
      const remoteContent = 'remote new content';
      const remote: RemoteTemplateInfo = {
        version: '2.0.0',
        files: {
          'main.ts': { hash: hashContent(remoteContent), content: remoteContent },
        },
        skills: {},
      };

      const result = await engine.update(remote);

      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].path).toBe('main.ts');
      // Local file should be untouched
      expect(fs.readFileSync(path.join(tmpDir, 'main.ts'), 'utf-8')).toBe('user modified content');
      // Conflict file should exist
      expect(fs.existsSync(path.join(tmpDir, '.skillhub/conflicts/main.ts'))).toBe(true);
      expect(fs.readFileSync(path.join(tmpDir, '.skillhub/conflicts/main.ts'), 'utf-8')).toBe(remoteContent);
    });
  });

  // ==========================================================
  // UPDATE: NEW FILES
  // ==========================================================
  describe('new files', () => {
    it('should add files that are new in remote template', async () => {
      writeFile('existing.ts', 'existing');
      writeLock(createLock({ 'existing.ts': hashContent('existing') }));

      const remote: RemoteTemplateInfo = {
        version: '2.0.0',
        files: {
          'existing.ts': { hash: hashContent('existing'), content: 'existing' },
          'new-file.ts': { hash: hashContent('new content'), content: 'new content' },
        },
        skills: {},
      };

      const result = await engine.update(remote);

      expect(result.added).toHaveLength(1);
      expect(result.added[0].path).toBe('new-file.ts');
      expect(fs.existsSync(path.join(tmpDir, 'new-file.ts'))).toBe(true);
    });
  });

  // ==========================================================
  // UPDATE: REMOVED FILES
  // ==========================================================
  describe('removed files', () => {
    it('should detect files removed in remote template', async () => {
      writeFile('keep.ts', 'keep');
      writeFile('removed.ts', 'will be removed');
      writeLock(createLock({
        'keep.ts': hashContent('keep'),
        'removed.ts': hashContent('will be removed'),
      }));

      const remote: RemoteTemplateInfo = {
        version: '2.0.0',
        files: {
          'keep.ts': { hash: hashContent('keep'), content: 'keep' },
          // removed.ts is not in remote
        },
        skills: {},
      };

      const result = await engine.update(remote);

      expect(result.removed).toHaveLength(1);
      expect(result.removed[0].path).toBe('removed.ts');
      // File should NOT be auto-deleted
      expect(fs.existsSync(path.join(tmpDir, 'removed.ts'))).toBe(true);
    });
  });

  // ==========================================================
  // UPDATE: UNCHANGED REMOTE FILES
  // ==========================================================
  describe('unchanged remote files', () => {
    it('should skip files unchanged in remote', async () => {
      const content = 'original';
      const hash = hashContent(content);

      writeFile('main.ts', 'user changed this');
      writeLock(createLock({ 'main.ts': hash }));

      const remote: RemoteTemplateInfo = {
        version: '2.0.0',
        files: {
          'main.ts': { hash, content }, // same hash as lock
        },
        skills: {},
      };

      const result = await engine.update(remote);

      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].path).toBe('main.ts');
      // User's changes should be preserved
      expect(fs.readFileSync(path.join(tmpDir, 'main.ts'), 'utf-8')).toBe('user changed this');
    });
  });

  // ==========================================================
  // DRY RUN
  // ==========================================================
  describe('dry-run', () => {
    it('should not modify files in dry-run mode', async () => {
      const content = 'original';
      const hash = hashContent(content);

      writeFile('main.ts', content);
      writeLock(createLock({ 'main.ts': hash }));

      const newContent = 'updated';
      const remote: RemoteTemplateInfo = {
        version: '2.0.0',
        files: {
          'main.ts': { hash: hashContent(newContent), content: newContent },
          'new.ts': { hash: hashContent('new'), content: 'new' },
        },
        skills: {},
      };

      const result = await engine.update(remote, true);

      expect(result.dryRun).toBe(true);
      expect(result.updated).toHaveLength(1);
      expect(result.added).toHaveLength(1);
      // Files should NOT be modified
      expect(fs.readFileSync(path.join(tmpDir, 'main.ts'), 'utf-8')).toBe(content);
      expect(fs.existsSync(path.join(tmpDir, 'new.ts'))).toBe(false);
    });
  });

  // ==========================================================
  // PREVIEW
  // ==========================================================
  describe('preview', () => {
    it('should be equivalent to dry-run update', async () => {
      const content = 'original';
      writeFile('main.ts', content);
      writeLock(createLock({ 'main.ts': hashContent(content) }));

      const remote: RemoteTemplateInfo = {
        version: '2.0.0',
        files: {
          'main.ts': { hash: hashContent('new'), content: 'new' },
        },
        skills: {},
      };

      const result = await engine.preview(remote);

      expect(result.dryRun).toBe(true);
      expect(result.updated).toHaveLength(1);
    });
  });

  // ==========================================================
  // LOCK FILE UPDATE
  // ==========================================================
  describe('lock file update', () => {
    it('should update lock file after successful update', async () => {
      const content = 'original';
      writeFile('main.ts', content);
      writeLock(createLock({ 'main.ts': hashContent(content) }, '1.0.0'));

      const newContent = 'updated';
      const remote: RemoteTemplateInfo = {
        version: '2.0.0',
        files: {
          'main.ts': { hash: hashContent(newContent), content: newContent },
        },
        skills: { 'skill-a': '2.0.0' },
      };

      await engine.update(remote);

      const lockManager = new LockManager(tmpDir);
      const newLock = lockManager.read();
      expect(newLock.templateVersion).toBe('2.0.0');
      expect(newLock.skills['skill-a']).toBe('2.0.0');
    });

    it('should NOT update lock file in dry-run', async () => {
      const content = 'original';
      writeFile('main.ts', content);
      writeLock(createLock({ 'main.ts': hashContent(content) }, '1.0.0'));

      const remote: RemoteTemplateInfo = {
        version: '2.0.0',
        files: {
          'main.ts': { hash: hashContent('new'), content: 'new' },
        },
        skills: {},
      };

      await engine.update(remote, true);

      const lockManager = new LockManager(tmpDir);
      const lock = lockManager.read();
      expect(lock.templateVersion).toBe('1.0.0'); // unchanged
    });
  });

  // ==========================================================
  // ERROR CASES
  // ==========================================================
  describe('error handling', () => {
    it('should throw when no lock file exists', async () => {
      const remote: RemoteTemplateInfo = {
        version: '1.0.0',
        files: {},
        skills: {},
      };

      await expect(engine.update(remote)).rejects.toThrow('No template.lock found');
    });
  });
});
