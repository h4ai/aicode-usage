import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CursorAdapter } from './cursor-adapter';

describe('CursorAdapter', () => {
  let adapter: CursorAdapter;
  let tmpDir: string;

  beforeEach(() => {
    adapter = new CursorAdapter();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should have name "cursor"', () => {
    expect(adapter.name).toBe('cursor');
  });

  it('should create .cursor/rules/ directory and .cursorrules file', async () => {
    await adapter.generate(tmpDir, []);

    expect(fs.existsSync(path.join(tmpDir, '.cursor', 'rules'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.cursorrules'))).toBe(true);
  });

  it('should generate .cursorrules with project name', async () => {
    await adapter.generate(tmpDir, [], { projectName: 'TestProject' });

    const content = fs.readFileSync(path.join(tmpDir, '.cursorrules'), 'utf-8');
    expect(content).toContain('TestProject');
  });

  it('should install skills into .cursor/rules/', async () => {
    const skills = [{ name: 'linting', version: '2.0.0', content: '# Linting Skill' }];

    await adapter.generate(tmpDir, skills);

    const skillFile = path.join(tmpDir, '.cursor', 'rules', 'linting.md');
    expect(fs.existsSync(skillFile)).toBe(true);
    expect(fs.readFileSync(skillFile, 'utf-8')).toContain('Linting Skill');
  });

  it('should return correct skills directory', () => {
    expect(adapter.getSkillsDir(tmpDir)).toBe(path.join(tmpDir, '.cursor', 'rules'));
  });
});
