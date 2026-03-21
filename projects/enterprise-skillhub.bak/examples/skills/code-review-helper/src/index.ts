/**
 * Code Review Helper — AI-powered code review assistant
 *
 * Analyzes code for common issues including:
 * - Style violations
 * - Security vulnerabilities
 * - Performance anti-patterns
 * - Best practice deviations
 */

export interface ReviewResult {
  file: string;
  line: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
  rule: string;
  suggestion?: string;
}

export interface ReviewConfig {
  language: string;
  strictMode?: boolean;
  ignorePaths?: string[];
  customRules?: string[];
}

const DEFAULT_RULES = [
  'no-hardcoded-secrets',
  'no-sql-injection',
  'no-eval',
  'prefer-const',
  'no-unused-vars',
  'max-complexity',
  'no-console-in-prod',
];

/**
 * Analyze code content and return review findings
 */
export function analyzeCode(
  content: string,
  config: ReviewConfig,
): ReviewResult[] {
  const results: ReviewResult[] = [];
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    // Check for hardcoded secrets
    if (/(?:password|secret|api_key|token)\s*=\s*['"][^'"]+['"]/i.test(line)) {
      results.push({
        file: 'input',
        line: index + 1,
        severity: 'error',
        message: 'Possible hardcoded secret detected',
        rule: 'no-hardcoded-secrets',
        suggestion: 'Use environment variables or a secrets manager',
      });
    }

    // Check for console.log in production code
    if (/console\.(log|debug|info)\(/.test(line)) {
      results.push({
        file: 'input',
        line: index + 1,
        severity: 'warning',
        message: 'Console logging detected — remove before production',
        rule: 'no-console-in-prod',
        suggestion: 'Use a structured logger (e.g., winston, pino)',
      });
    }

    // Check for eval usage
    if (/\beval\s*\(/.test(line)) {
      results.push({
        file: 'input',
        line: index + 1,
        severity: 'error',
        message: 'eval() usage detected — potential security risk',
        rule: 'no-eval',
        suggestion: 'Use safer alternatives like JSON.parse() or Function constructor',
      });
    }
  });

  return results;
}

/**
 * Generate a summary report from review results
 */
export function generateReport(results: ReviewResult[]): string {
  const errors = results.filter((r) => r.severity === 'error').length;
  const warnings = results.filter((r) => r.severity === 'warning').length;
  const infos = results.filter((r) => r.severity === 'info').length;

  return [
    `## Code Review Report`,
    `- Errors: ${errors}`,
    `- Warnings: ${warnings}`,
    `- Info: ${infos}`,
    `- Total Issues: ${results.length}`,
    '',
    ...results.map(
      (r) => `- [${r.severity.toUpperCase()}] Line ${r.line}: ${r.message} (${r.rule})`,
    ),
  ].join('\n');
}
