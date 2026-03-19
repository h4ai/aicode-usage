/**
 * Security Rule: Detect hardcoded secrets, API keys, tokens, and passwords.
 * Based on GitHub Secret Scanning patterns.
 */

export interface SecurityFinding {
  rule: string;
  severity: 'INFO' | 'WARNING' | 'FATAL';
  file: string;
  line: number;
  message: string;
}

export interface SecurityScanResult {
  passed: boolean;
  findings: SecurityFinding[];
}

const PATTERNS: Array<{ name: string; regex: RegExp; severity: 'WARNING' | 'FATAL' }> = [
  // Cloud provider keys
  { name: 'aws-access-key-id', regex: /AKIA[0-9A-Z]{16}/g, severity: 'FATAL' },
  { name: 'aws-secret-key', regex: /(?:aws_secret_access_key|AWS_SECRET)\s*[=:]\s*["']?[A-Za-z0-9/+=]{40}["']?/gi, severity: 'FATAL' },

  // Private keys
  { name: 'private-key', regex: /-----BEGIN\s+(RSA|DSA|EC|OPENSSH|PGP)\s+PRIVATE KEY-----/g, severity: 'FATAL' },

  // Password assignments
  { name: 'password-literal', regex: /(?:password|passwd|pwd)\s*[=:]\s*["'][^"']{4,}["']/gi, severity: 'FATAL' },

  // GitHub tokens
  { name: 'github-token', regex: /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}/g, severity: 'FATAL' },

  // Generic API keys/tokens/secrets
  { name: 'generic-secret', regex: /(?:secret|token|api[_-]?key)\s*[=:]\s*["'][A-Za-z0-9+/=]{20,}["']/gi, severity: 'WARNING' },

  // Slack webhooks
  { name: 'slack-webhook', regex: /https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]+/g, severity: 'FATAL' },

  // JWT tokens (not always a secret, but worth flagging)
  { name: 'jwt-token', regex: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, severity: 'WARNING' },
];

export function scanForSecrets(content: string, fileName: string): SecurityScanResult {
  const findings: SecurityFinding[] = [];

  for (const pattern of PATTERNS) {
    pattern.regex.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.regex.exec(content)) !== null) {
      const upToMatch = content.substring(0, match.index);
      const line = upToMatch.split('\n').length;

      findings.push({
        rule: pattern.name,
        severity: pattern.severity,
        file: fileName,
        line,
        message: `Potential ${pattern.name} detected at line ${line} in ${fileName}`,
      });
    }
  }

  return {
    passed: findings.length === 0,
    findings,
  };
}
