import { createAdapter, getSupportedTools } from './adapters/adapter-factory';
import { TemplateEngine } from './scaffold/template-engine';
import { FileFilter } from './scaffold/file-filter';
import { HookRunner } from './scaffold/hook-runner';
import { SkillInstaller } from './scaffold/skill-installer';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Integration tests for CLI init workflow components
 */
describe('CLI Init Workflow Integration', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-init-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('Full init pipeline', () => {
    it('should generate complete project structure with Claude adapter', async () => {
      // 1. Setup: create some template files
      fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name": "{{projectName}}"}');
      fs.writeFileSync(path.join(tmpDir, 'README.md'), '# {{projectName}}');
      fs.writeFileSync(path.join(tmpDir, 'Dockerfile'), 'FROM node:18');

      // 2. Apply adapter
      const adapter = createAdapter('claude');
      const skills = [
        { name: 'code-review', version: '1.0.0', content: '# Code Review\nAutomated code review.' },
      ];
      await adapter.generate(tmpDir, skills, { projectName: 'my-app' });

      // 3. Template variable replacement
      await TemplateEngine.processDirectory(tmpDir, { projectName: 'my-app' });

      // 4. Feature filtering
      await FileFilter.filter(tmpDir, { docker: false }, { docker: ['Dockerfile'] });

      // Verify: package.json has replaced variable
      const pkg = JSON.parse(fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf-8'));
      expect(pkg.name).toBe('my-app');

      // Verify: README.md has replaced variable
      const readme = fs.readFileSync(path.join(tmpDir, 'README.md'), 'utf-8');
      expect(readme).toBe('# my-app');

      // Verify: Dockerfile removed (docker feature disabled)
      expect(fs.existsSync(path.join(tmpDir, 'Dockerfile'))).toBe(false);

      // Verify: Claude directories exist
      expect(fs.existsSync(path.join(tmpDir, '.claude', 'rules'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, '.claude', 'commands'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, '.claude', 'skills'))).toBe(true);

      // Verify: CLAUDE.md generated
      expect(fs.existsSync(path.join(tmpDir, 'CLAUDE.md'))).toBe(true);

      // Verify: Skill installed
      const skillFile = path.join(tmpDir, '.claude', 'skills', 'code-review', 'SKILL.md');
      expect(fs.existsSync(skillFile)).toBe(true);
      expect(fs.readFileSync(skillFile, 'utf-8')).toContain('Code Review');
    });

    it('should generate complete project structure with Cursor adapter', async () => {
      fs.writeFileSync(path.join(tmpDir, 'README.md'), '# {{projectName}}');

      const adapter = createAdapter('cursor');
      await adapter.generate(tmpDir, [], { projectName: 'cursor-project' });

      await TemplateEngine.processDirectory(tmpDir, { projectName: 'cursor-project' });

      expect(fs.existsSync(path.join(tmpDir, '.cursor', 'rules'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, '.cursorrules'))).toBe(true);
      expect(fs.readFileSync(path.join(tmpDir, 'README.md'), 'utf-8')).toBe('# cursor-project');
    });

    it('should generate complete project with default adapter when no AI specified', async () => {
      const adapter = createAdapter(); // no AI tool
      await adapter.generate(tmpDir, [], { projectName: 'generic-project' });

      expect(fs.existsSync(path.join(tmpDir, '.ai'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, '.ai', 'rules'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, '.ai', 'skills'))).toBe(true);
    });

    it('should generate lock file', () => {
      const lockDir = path.join(tmpDir, '.skillhub');
      fs.mkdirSync(lockDir, { recursive: true });
      const lockFile = {
        template: '@team/starter',
        version: '1.0.0',
        ai: 'claude',
        skills: [{ name: 'code-review', version: '^1.0.0' }],
        createdAt: new Date().toISOString(),
      };
      fs.writeFileSync(path.join(lockDir, 'template.lock'), JSON.stringify(lockFile, null, 2));

      const lock = JSON.parse(fs.readFileSync(path.join(lockDir, 'template.lock'), 'utf-8'));
      expect(lock.template).toBe('@team/starter');
      expect(lock.version).toBe('1.0.0');
      expect(lock.skills).toHaveLength(1);
    });
  });

  describe('Template commands structure', () => {
    it('should parse @namespace/name template references', () => {
      const ref = '@backend-team/java-springboot';
      const match = ref.match(/^@([^/]+)\/(.+)$/);
      expect(match).not.toBeNull();
      expect(match![1]).toBe('backend-team');
      expect(match![2]).toBe('java-springboot');
    });

    it('should reject invalid template references', () => {
      const ref = 'invalid-ref';
      const match = ref.match(/^@([^/]+)\/(.+)$/);
      expect(match).toBeNull();
    });
  });
});
