import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ClaudeAdapter } from './claude-adapter';

describe('ClaudeAdapter', () => {
  let adapter: ClaudeAdapter;
  let tmpDir: string;

  beforeEach(() => {
    adapter = new ClaudeAdapter();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should have name "claude"', () => {
    expect(adapter.name).toBe('claude');
  });

  it('should create .claude/rules/, .claude/commands/, .claude/skills/ directories', async () => {
    const result = await adapter.generate(tmpDir, []);

    expect(fs.existsSync(path.join(tmpDir, '.claude', 'rules'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'commands'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'skills'))).toBe(true);
    expect(result.dirsCreated.length).toBeGreaterThan(0);
  });

  it('should generate CLAUDE.md at project root', async () => {
    await adapter.generate(tmpDir, [], { projectName: 'MyProject' });

    const claudeMd = path.join(tmpDir, 'CLAUDE.md');
    expect(fs.existsSync(claudeMd)).toBe(true);
    const content = fs.readFileSync(claudeMd, 'utf-8');
    expect(content).toContain('MyProject');
  });

  it('should install skills into .claude/skills/', async () => {
    const skills = [
      { name: 'code-review', version: '1.0.0', content: '# Code Review Skill' },
    ];

    const result = await adapter.generate(tmpDir, skills);

    const skillFile = path.join(tmpDir, '.claude', 'skills', 'code-review', 'SKILL.md');
    expect(fs.existsSync(skillFile)).toBe(true);
    expect(fs.readFileSync(skillFile, 'utf-8')).toContain('Code Review Skill');
    expect(result.filesCreated).toContain(skillFile);
  });

  it('should return correct skills directory', () => {
    expect(adapter.getSkillsDir(tmpDir)).toBe(path.join(tmpDir, '.claude', 'skills'));
  });
});
