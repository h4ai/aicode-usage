/**
 * Integrity Rule: Check that all required files are present in the skill package.
 * FATAL if required files are missing (e.g., SKILL.md).
 */

export interface IntegrityCheckResult {
  passed: boolean;
  severity: 'INFO' | 'WARNING' | 'FATAL';
  details: string;
  missingFiles: string[];
}

export function checkFileIntegrity(
  fileNames: string[],
  requiredFiles: string[],
): IntegrityCheckResult {
  const normalizedNames = fileNames.map((f) => f.replace(/^\.\//, ''));
  const missingFiles = requiredFiles.filter(
    (rf) => !normalizedNames.includes(rf),
  );

  if (missingFiles.length > 0) {
    return {
      passed: false,
      severity: 'FATAL',
      details: `Missing required files: ${missingFiles.join(', ')}`,
      missingFiles,
    };
  }

  return {
    passed: true,
    severity: 'INFO',
    details: 'All required files present',
    missingFiles: [],
  };
}
