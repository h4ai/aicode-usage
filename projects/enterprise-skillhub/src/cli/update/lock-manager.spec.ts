import { LockManager, TemplateLock } from './lock-manager';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

describe('LockManager', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lock-manager-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ==========================================================
  // EXISTS
  // ==========================================================
  describe('exists', () => {
    it('should return false when no lock file', () => {
      const manager = new LockManager(tmpDir);
      expect(manager.exists()).toBe(false);
    });

    it('should return true when lock file exists', () => {
      const lockDir = path.join(tmpDir, '.skillhub');
      fs.mkdirSync(lockDir, { recursive: true });
      fs.writeFileSync(path.join(lockDir, 'template.lock'), '{}');

      const manager = new LockManager(tmpDir);
      expect(manager.exists()).toBe(true);
    });
  });

  // ==========================================================
  // WRITE
  // ==========================================================
  describe('write', () => {
    it('should create .skillhub directory and write lock file', () => {
      const manager = new LockManager(tmpDir);
      const lock: TemplateLock = {
        templateName: 'java-springboot',
        templateVersion: '1.0.0',
        namespace: 'backend-team',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        skills: { 'code-review': '2.1.0' },
        files: { 'src/main.ts': 'abc123' },
      };

      manager.write(lock);

      expect(fs.existsSync(path.join(tmpDir, '.skillhub', 'template.lock'))).toBe(true);
      const content = JSON.parse(
        fs.readFileSync(path.join(tmpDir, '.skillhub', 'template.lock'), 'utf-8'),
      );
      expect(content.templateName).toBe('java-springboot');
      expect(content.skills['code-review']).toBe('2.1.0');
    });

    it('should overwrite existing lock file', () => {
      const manager = new LockManager(tmpDir);
      const lock1: TemplateLock = {
        templateName: 'test',
        templateVersion: '1.0.0',
        namespace: 'ns',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        skills: {},
        files: {},
      };

      manager.write(lock1);
      manager.write({ ...lock1, templateVersion: '2.0.0' });

      const content = JSON.parse(
        fs.readFileSync(path.join(tmpDir, '.skillhub', 'template.lock'), 'utf-8'),
      );
      expect(content.templateVersion).toBe('2.0.0');
    });
  });

  // ==========================================================
  // READ
  // ==========================================================
  describe('read', () => {
    it('should read and parse lock file', () => {
      const lockDir = path.join(tmpDir, '.skillhub');
      fs.mkdirSync(lockDir, { recursive: true });

      const lock: TemplateLock = {
        templateName: 'react-starter',
        templateVersion: '1.2.0',
        namespace: 'frontend',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        skills: { 'lint-check': '1.0.0', 'deploy-helper': '2.3.0' },
        files: { 'index.ts': 'hash1', 'package.json': 'hash2' },
      };
      fs.writeFileSync(path.join(lockDir, 'template.lock'), JSON.stringify(lock));

      const manager = new LockManager(tmpDir);
      const result = manager.read();

      expect(result.templateName).toBe('react-starter');
      expect(result.templateVersion).toBe('1.2.0');
      expect(Object.keys(result.skills)).toHaveLength(2);
      expect(Object.keys(result.files)).toHaveLength(2);
    });

    it('should throw when lock file does not exist', () => {
      const manager = new LockManager(tmpDir);
      expect(() => manager.read()).toThrow('Lock file not found');
    });

    it('should throw on invalid JSON', () => {
      const lockDir = path.join(tmpDir, '.skillhub');
      fs.mkdirSync(lockDir, { recursive: true });
      fs.writeFileSync(path.join(lockDir, 'template.lock'), 'not-json{');

      const manager = new LockManager(tmpDir);
      expect(() => manager.read()).toThrow('Invalid lock file format');
    });
  });

  // ==========================================================
  // CREATE INITIAL LOCK
  // ==========================================================
  describe('createInitialLock', () => {
    it('should create a lock with file hashes', () => {
      // Create some files in tmpDir
      fs.writeFileSync(path.join(tmpDir, 'main.ts'), 'console.log("hello")');
      fs.mkdirSync(path.join(tmpDir, 'src'));
      fs.writeFileSync(path.join(tmpDir, 'src', 'app.ts'), 'export class App {}');

      const lock = LockManager.createInitialLock(
        tmpDir,
        'test-template',
        '1.0.0',
        'my-ns',
        { 'skill-a': '1.0.0' },
      );

      expect(lock.templateName).toBe('test-template');
      expect(lock.templateVersion).toBe('1.0.0');
      expect(lock.namespace).toBe('my-ns');
      expect(lock.skills['skill-a']).toBe('1.0.0');
      expect(lock.files['main.ts']).toBeDefined();
      expect(lock.files['src/app.ts']).toBeDefined();
      expect(lock.files['main.ts'].length).toBe(64); // SHA256 hex length
    });

    it('should exclude .skillhub, node_modules, .git directories', () => {
      fs.writeFileSync(path.join(tmpDir, 'main.ts'), 'content');
      fs.mkdirSync(path.join(tmpDir, '.skillhub'));
      fs.writeFileSync(path.join(tmpDir, '.skillhub', 'lock'), 'lock');
      fs.mkdirSync(path.join(tmpDir, 'node_modules'));
      fs.writeFileSync(path.join(tmpDir, 'node_modules', 'pkg'), 'pkg');
      fs.mkdirSync(path.join(tmpDir, '.git'));
      fs.writeFileSync(path.join(tmpDir, '.git', 'HEAD'), 'ref');

      const lock = LockManager.createInitialLock(tmpDir, 'test', '1.0.0', 'ns', {});

      expect(Object.keys(lock.files)).toHaveLength(1); // only main.ts
      expect(lock.files['main.ts']).toBeDefined();
    });
  });

  // ==========================================================
  // HASH PROJECT FILES
  // ==========================================================
  describe('hashProjectFiles', () => {
    it('should hash all files recursively', () => {
      fs.mkdirSync(path.join(tmpDir, 'a', 'b'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, 'root.txt'), 'root');
      fs.writeFileSync(path.join(tmpDir, 'a', 'mid.txt'), 'mid');
      fs.writeFileSync(path.join(tmpDir, 'a', 'b', 'deep.txt'), 'deep');

      const hashes = LockManager.hashProjectFiles(tmpDir);

      expect(Object.keys(hashes)).toHaveLength(3);
      expect(hashes['root.txt']).toBeDefined();
      expect(hashes['a/mid.txt']).toBeDefined();
      expect(hashes['a/b/deep.txt']).toBeDefined();
    });

    it('should return empty for non-existent directory', () => {
      const hashes = LockManager.hashProjectFiles('/nonexistent-dir-xyz');
      expect(Object.keys(hashes)).toHaveLength(0);
    });

    it('should produce consistent hashes for same content', () => {
      fs.writeFileSync(path.join(tmpDir, 'file.txt'), 'same content');

      const hashes1 = LockManager.hashProjectFiles(tmpDir);
      const hashes2 = LockManager.hashProjectFiles(tmpDir);

      expect(hashes1['file.txt']).toBe(hashes2['file.txt']);
    });
  });

  // ==========================================================
  // HASH FILE
  // ==========================================================
  describe('hashFile', () => {
    it('should compute SHA256 of a file', () => {
      const filePath = path.join(tmpDir, 'test.txt');
      fs.writeFileSync(filePath, 'hello world');

      const expected = crypto.createHash('sha256').update('hello world').digest('hex');
      expect(LockManager.hashFile(filePath)).toBe(expected);
    });
  });
});
