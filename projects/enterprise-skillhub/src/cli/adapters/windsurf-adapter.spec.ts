import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { WindsurfAdapter } from './windsurf-adapter';

describe('WindsurfAdapter', () => {
  let adapter: WindsurfAdapter;
  let tmpDir: string;

  beforeEach(() => {
    adapter = new WindsurfAdapter();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'windsurf-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should have name "windsurf"', () => {
    expect(adapter.name).toBe('windsurf');
  });

  it('should create .windsurf/rules/ directory and .windsurfrules file', async () => {
    await adapter.generate(tmpDir, []);

    expect(fs.existsSync(path.join(tmpDir, '.windsurf', 'rules'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.windsurfrules'))).toBe(true);
  });

  it('should generate .windsurfrules with project name', async () => {
    await adapter.generate(tmpDir, [], { projectName: 'SurfProject' });

    const content = fs.readFileSync(path.join(tmpDir, '.windsurfrules'), 'utf-8');
    expect(content).toContain('SurfProject');
  });

  it('should install skills into .windsurf/rules/', async () => {
    const skills = [{ name: 'testing', version: '1.0.0', content: '# Testing Skill' }];

    await adapter.generate(tmpDir, skills);

    const skillFile = path.join(tmpDir, '.windsurf', 'rules', 'testing.md');
    expect(fs.existsSync(skillFile)).toBe(true);
  });

  it('should return correct skills directory', () => {
    expect(adapter.getSkillsDir(tmpDir)).toBe(path.join(tmpDir, '.windsurf', 'rules'));
  });
});
