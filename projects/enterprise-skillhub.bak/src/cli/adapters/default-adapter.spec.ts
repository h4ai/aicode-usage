import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DefaultAdapter } from './default-adapter';

describe('DefaultAdapter', () => {
  let adapter: DefaultAdapter;
  let tmpDir: string;

  beforeEach(() => {
    adapter = new DefaultAdapter();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'default-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should have name "default"', () => {
    expect(adapter.name).toBe('default');
  });

  it('should create .ai/, .ai/rules/, .ai/skills/ directories', async () => {
    await adapter.generate(tmpDir, []);

    expect(fs.existsSync(path.join(tmpDir, '.ai'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.ai', 'rules'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.ai', 'skills'))).toBe(true);
  });

  it('should generate README.md in .ai/', async () => {
    await adapter.generate(tmpDir, [], { projectName: 'GenericProject' });

    const readme = path.join(tmpDir, '.ai', 'README.md');
    expect(fs.existsSync(readme)).toBe(true);
    const content = fs.readFileSync(readme, 'utf-8');
    expect(content).toContain('GenericProject');
  });

  it('should install skills into .ai/skills/', async () => {
    const skills = [{ name: 'helper', version: '1.0.0', content: '# Helper' }];

    await adapter.generate(tmpDir, skills);

    const skillFile = path.join(tmpDir, '.ai', 'skills', 'helper', 'SKILL.md');
    expect(fs.existsSync(skillFile)).toBe(true);
  });

  it('should return correct skills directory', () => {
    expect(adapter.getSkillsDir(tmpDir)).toBe(path.join(tmpDir, '.ai', 'skills'));
  });
});
