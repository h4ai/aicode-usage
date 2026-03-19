import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CodebuddyAdapter } from './codebuddy-adapter';

describe('CodebuddyAdapter', () => {
  let adapter: CodebuddyAdapter;
  let tmpDir: string;

  beforeEach(() => {
    adapter = new CodebuddyAdapter();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codebuddy-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should have name "codebuddy"', () => {
    expect(adapter.name).toBe('codebuddy');
  });

  it('should create .codebuddy/ and .codebuddy/agents/ directories', async () => {
    await adapter.generate(tmpDir, []);

    expect(fs.existsSync(path.join(tmpDir, '.codebuddy'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.codebuddy', 'agents'))).toBe(true);
  });

  it('should generate rules.yaml', async () => {
    await adapter.generate(tmpDir, [], { projectName: 'MyApp' });

    const rulesPath = path.join(tmpDir, '.codebuddy', 'rules.yaml');
    expect(fs.existsSync(rulesPath)).toBe(true);
    const content = fs.readFileSync(rulesPath, 'utf-8');
    expect(content).toContain('MyApp');
  });

  it('should install skills as agents', async () => {
    const skills = [{ name: 'deploy-helper', version: '1.0.0', content: '# Deploy Skill' }];

    await adapter.generate(tmpDir, skills);

    const agentFile = path.join(tmpDir, '.codebuddy', 'agents', 'deploy-helper.md');
    expect(fs.existsSync(agentFile)).toBe(true);
  });

  it('should include skills in rules.yaml agents section', async () => {
    const skills = [{ name: 'security-scan', version: '3.0.0', content: '# Security' }];

    await adapter.generate(tmpDir, skills, { projectName: 'SecApp' });

    const rulesPath = path.join(tmpDir, '.codebuddy', 'rules.yaml');
    const content = fs.readFileSync(rulesPath, 'utf-8');
    expect(content).toContain('security-scan');
  });

  it('should return correct skills directory', () => {
    expect(adapter.getSkillsDir(tmpDir)).toBe(path.join(tmpDir, '.codebuddy', 'agents'));
  });
});
