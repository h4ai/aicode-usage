import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { TemplateEngine } from './template-engine';

describe('TemplateEngine', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tplengine-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('render', () => {
    it('should replace Handlebars variables', () => {
      const template = 'Hello {{name}}, welcome to {{project}}!';
      const result = TemplateEngine.render(template, { name: 'John', project: 'SkillHub' });
      expect(result).toBe('Hello John, welcome to SkillHub!');
    });

    it('should handle missing variables gracefully', () => {
      const template = 'Hello {{name}}!';
      const result = TemplateEngine.render(template, {});
      expect(result).toBe('Hello !');
    });

    it('should not escape HTML characters', () => {
      const template = 'Value: {{value}}';
      const result = TemplateEngine.render(template, { value: '<b>bold</b>' });
      expect(result).toBe('Value: <b>bold</b>');
    });
  });

  describe('processDirectory', () => {
    it('should process matching files in directory', async () => {
      // Create test files
      fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name": "{{projectName}}"}', 'utf-8');
      fs.writeFileSync(path.join(tmpDir, 'README.md'), '# {{projectName}}', 'utf-8');
      fs.writeFileSync(path.join(tmpDir, 'image.png'), 'binary', 'utf-8');

      const processed = await TemplateEngine.processDirectory(tmpDir, { projectName: 'MyApp' });

      expect(processed.length).toBeGreaterThanOrEqual(2);

      const pkg = JSON.parse(fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf-8'));
      expect(pkg.name).toBe('MyApp');

      const readme = fs.readFileSync(path.join(tmpDir, 'README.md'), 'utf-8');
      expect(readme).toBe('# MyApp');
    });

    it('should skip non-matching files', async () => {
      fs.writeFileSync(path.join(tmpDir, 'image.png'), '{{noreplace}}', 'utf-8');

      const processed = await TemplateEngine.processDirectory(tmpDir, { noreplace: 'replaced' }, ['*.md']);

      expect(processed).toHaveLength(0);
      const content = fs.readFileSync(path.join(tmpDir, 'image.png'), 'utf-8');
      expect(content).toBe('{{noreplace}}');
    });
  });

  describe('walkDir', () => {
    it('should walk directory recursively', () => {
      fs.mkdirSync(path.join(tmpDir, 'sub'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, 'a.txt'), 'a');
      fs.writeFileSync(path.join(tmpDir, 'sub', 'b.txt'), 'b');

      const files = TemplateEngine.walkDir(tmpDir);

      expect(files).toHaveLength(2);
      expect(files.some((f) => f.endsWith('a.txt'))).toBe(true);
      expect(files.some((f) => f.endsWith('b.txt'))).toBe(true);
    });

    it('should return empty for non-existent directory', () => {
      const files = TemplateEngine.walkDir('/nonexistent-dir-abc');
      expect(files).toEqual([]);
    });
  });
});
