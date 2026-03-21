import { execSync } from 'child_process';

/**
 * Execute post-init hooks defined in the template manifest.
 */
export class HookRunner {
  /**
   * Run a list of shell commands in sequence in the given directory.
   * @param targetDir - Working directory for commands
   * @param hooks - Array of shell command strings
   * @param options - Optional settings
   * @returns Array of results per hook
   */
  static async run(
    targetDir: string,
    hooks: string[],
    options: { timeout?: number; silent?: boolean } = {},
  ): Promise<HookResult[]> {
    const results: HookResult[] = [];
    const timeout = options.timeout || 120000; // 2 minutes default

    for (const hook of hooks) {
      try {
        const output = execSync(hook, {
          cwd: targetDir,
          timeout,
          encoding: 'utf-8',
          stdio: options.silent ? 'pipe' : 'inherit',
        });
        results.push({ command: hook, success: true, output: output || '' });
      } catch (error: any) {
        results.push({
          command: hook,
          success: false,
          output: error.stderr || error.message || 'Unknown error',
        });
      }
    }

    return results;
  }
}

export interface HookResult {
  command: string;
  success: boolean;
  output: string;
}
