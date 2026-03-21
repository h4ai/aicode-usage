import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { HookRunner } from './hook-runner';

describe('HookRunner', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hookrunner-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should execute a successful shell command', async () => {
    const results = await HookRunner.run(tmpDir, ['echo "hello"'], { silent: true });

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].command).toBe('echo "hello"');
    expect(results[0].output.trim()).toBe('hello');
  });

  it('should handle failed commands', async () => {
    const results = await HookRunner.run(tmpDir, ['exit 1'], { silent: true });

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
  });

  it('should run multiple hooks in sequence', async () => {
    fs.writeFileSync(path.join(tmpDir, 'test.txt'), 'initial');

    const results = await HookRunner.run(
      tmpDir,
      [
        'echo "first" >> test.txt',
        'echo "second" >> test.txt',
      ],
      { silent: true },
    );

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.success)).toBe(true);

    const content = fs.readFileSync(path.join(tmpDir, 'test.txt'), 'utf-8');
    expect(content).toContain('first');
    expect(content).toContain('second');
  });

  it('should continue on failure', async () => {
    const results = await HookRunner.run(
      tmpDir,
      ['exit 1', 'echo "after-fail"'],
      { silent: true },
    );

    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(false);
    expect(results[1].success).toBe(true);
  });
});
