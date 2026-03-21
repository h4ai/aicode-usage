import { ConflictResolver } from './conflict-resolver';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('ConflictResolver', () => {
  let tmpDir: string;
  let resolver: ConflictResolver;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conflict-test-'));
    resolver = new ConflictResolver(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ==========================================================
  // CREATE CONFLICT FILE
  // ==========================================================
  describe('createConflictFile', () => {
    it('should create conflict file in .skillhub/conflicts/', () => {
      const conflictPath = resolver.createConflictFile('src/main.ts', 'remote content');

      expect(fs.existsSync(conflictPath)).toBe(true);
      expect(fs.readFileSync(conflictPath, 'utf-8')).toBe('remote content');
      expect(conflictPath).toContain('.skillhub/conflicts/src/main.ts');
    });

    it('should create nested directories for deep paths', () => {
      resolver.createConflictFile('a/b/c/deep.ts', 'content');

      const conflictPath = path.join(tmpDir, '.skillhub/conflicts/a/b/c/deep.ts');
      expect(fs.existsSync(conflictPath)).toBe(true);
    });

    it('should overwrite existing conflict file', () => {
      resolver.createConflictFile('file.ts', 'version 1');
      resolver.createConflictFile('file.ts', 'version 2');

      const conflictPath = path.join(tmpDir, '.skillhub/conflicts/file.ts');
      expect(fs.readFileSync(conflictPath, 'utf-8')).toBe('version 2');
    });
  });

  // ==========================================================
  // LIST CONFLICTS
  // ==========================================================
  describe('listConflicts', () => {
    it('should return empty array when no conflicts', () => {
      expect(resolver.listConflicts()).toEqual([]);
    });

    it('should list all conflict files', () => {
      resolver.createConflictFile('file1.ts', 'content1');
      resolver.createConflictFile('src/file2.ts', 'content2');
      resolver.createConflictFile('src/deep/file3.ts', 'content3');

      const conflicts = resolver.listConflicts();

      expect(conflicts).toHaveLength(3);
      expect(conflicts).toContain('file1.ts');
      expect(conflicts).toContain(path.join('src', 'file2.ts'));
      expect(conflicts).toContain(path.join('src', 'deep', 'file3.ts'));
    });
  });

  // ==========================================================
  // RESOLVE CONFLICT
  // ==========================================================
  describe('resolveConflict', () => {
    it('should keep local file when choosing "local"', () => {
      // Create local file
      fs.writeFileSync(path.join(tmpDir, 'file.ts'), 'local content');
      // Create conflict file
      resolver.createConflictFile('file.ts', 'remote content');

      resolver.resolveConflict('file.ts', 'local');

      // Local file should be unchanged
      expect(fs.readFileSync(path.join(tmpDir, 'file.ts'), 'utf-8')).toBe('local content');
      // Conflict file should be removed
      expect(fs.existsSync(path.join(tmpDir, '.skillhub/conflicts/file.ts'))).toBe(false);
    });

    it('should replace local file when choosing "remote"', () => {
      // Create local file
      fs.writeFileSync(path.join(tmpDir, 'file.ts'), 'local content');
      // Create conflict file
      resolver.createConflictFile('file.ts', 'remote content');

      resolver.resolveConflict('file.ts', 'remote');

      // Local file should be replaced with remote content
      expect(fs.readFileSync(path.join(tmpDir, 'file.ts'), 'utf-8')).toBe('remote content');
      // Conflict file should be removed
      expect(fs.existsSync(path.join(tmpDir, '.skillhub/conflicts/file.ts'))).toBe(false);
    });

    it('should throw when conflict file does not exist', () => {
      expect(() => resolver.resolveConflict('nonexistent.ts', 'local')).toThrow(
        'No conflict file found',
      );
    });

    it('should create parent directories when resolving remote for new path', () => {
      resolver.createConflictFile('new/path/file.ts', 'new content');

      resolver.resolveConflict('new/path/file.ts', 'remote');

      expect(fs.readFileSync(path.join(tmpDir, 'new/path/file.ts'), 'utf-8')).toBe('new content');
    });
  });

  // ==========================================================
  // CLEAR ALL
  // ==========================================================
  describe('clearAll', () => {
    it('should remove all conflict files', () => {
      resolver.createConflictFile('a.ts', 'a');
      resolver.createConflictFile('b/c.ts', 'bc');

      resolver.clearAll();

      expect(fs.existsSync(path.join(tmpDir, '.skillhub/conflicts'))).toBe(false);
    });

    it('should not throw when no conflicts exist', () => {
      expect(() => resolver.clearAll()).not.toThrow();
    });
  });
});
