/**
 * License Rule: Check for LICENSE file presence and identify common open-source licenses.
 */

export interface LicenseCheckResult {
  passed: boolean;
  severity: 'INFO' | 'WARNING' | 'FATAL';
  licenseName: string | null;
  hasLicenseFile: boolean;
}

const LICENSE_IDENTIFIERS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'MIT', pattern: /MIT License/i },
  { name: 'Apache-2.0', pattern: /Apache License[\s\S]*Version 2\.0/i },
  { name: 'GPL-3.0', pattern: /GNU GENERAL PUBLIC LICENSE[\s\S]*Version 3/i },
  { name: 'GPL-2.0', pattern: /GNU GENERAL PUBLIC LICENSE[\s\S]*Version 2/i },
  { name: 'BSD-2-Clause', pattern: /BSD 2-Clause/i },
  { name: 'BSD-3-Clause', pattern: /BSD 3-Clause/i },
  { name: 'ISC', pattern: /ISC License/i },
  { name: 'MPL-2.0', pattern: /Mozilla Public License[\s\S]*Version 2\.0/i },
  { name: 'LGPL-3.0', pattern: /GNU LESSER GENERAL PUBLIC LICENSE[\s\S]*Version 3/i },
  { name: 'Unlicense', pattern: /This is free and unencumbered software/i },
];

export function identifyLicense(content: string): string {
  for (const id of LICENSE_IDENTIFIERS) {
    if (id.pattern.test(content)) {
      return id.name;
    }
  }
  return 'UNKNOWN';
}

export function checkLicense(
  fileNames: string[],
  licenseContent: string | null,
): LicenseCheckResult {
  const hasLicenseFile = fileNames.some(
    (f) => f.toUpperCase().startsWith('LICENSE'),
  );

  if (!hasLicenseFile) {
    return {
      passed: false,
      severity: 'WARNING',
      licenseName: null,
      hasLicenseFile: false,
    };
  }

  if (!licenseContent) {
    return {
      passed: true,
      severity: 'WARNING',
      licenseName: null,
      hasLicenseFile: true,
    };
  }

  const licenseName = identifyLicense(licenseContent);

  return {
    passed: true,
    severity: 'INFO',
    licenseName,
    hasLicenseFile: true,
  };
}
