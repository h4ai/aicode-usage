import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SkillInstaller } from './skill-installer';
import { ClaudeAdapter } from '../adapters/claude-adapter';
import { DefaultAdapter } from '../adapters/default-adapter';

describe('SkillInstaller', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skillinstaller-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should install skills for Claude adapter', async () => {
    const adapter = new ClaudeAdapter();
    const skills = [
      { name: 'code-review', version: '1.0.0', content: '# Code Review' },
      { name: 'testing', version: '2.0.0', content: '# Testing' },
    ];

    const installed = await SkillInstaller.install(adapter, tmpDir, skills);

    expect(installed).toHaveLength(2);
    expect(installed[0].name).toBe('code-review');
    expect(installed[0].version).toBe('1.0.0');

    const skillDir = path.join(tmpDir, '.claude', 'skills', 'code-review');
    expect(fs.existsSync(skillDir)).toBe(true);
    expect(fs.existsSync(path.join(skillDir, 'SKILL.md'))).toBe(true);
  });

  it('should install skills for Default adapter', async () => {
    const adapter = new DefaultAdapter();
    const skills = [
      { name: 'helper', version: '1.0.0', content: '# Helper Skill' },
    ];

    const installed = await SkillInstaller.install(adapter, tmpDir, skills);

    expect(installed).toHaveLength(1);
    const skillFile = path.join(tmpDir, '.ai', 'skills', 'helper', 'SKILL.md');
    expect(fs.existsSync(skillFile)).toBe(true);
  });

  it('should handle skills without content', async () => {
    const adapter = new DefaultAdapter();
    const skills = [{ name: 'empty-skill', version: '1.0.0' }];

    const installed = await SkillInstaller.install(adapter, tmpDir, skills);

    expect(installed).toHaveLength(1);
    const skillDir = path.join(tmpDir, '.ai', 'skills', 'empty-skill');
    expect(fs.existsSync(skillDir)).toBe(true);
  });
});
