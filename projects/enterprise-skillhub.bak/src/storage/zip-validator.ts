import * as path from 'path';

const MAX_UNCOMPRESSED_SIZE = 200 * 1024 * 1024; // 200MB
const MAX_FILE_COUNT = 1000;
const ZIP_MAGIC_BYTES = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

export interface ZipEntryInfo {
  entryName: string;
  header: { size: number };
}

/**
 * Validate ZIP magic bytes
 */
export function validateMagicBytes(buffer: Buffer): void {
  if (buffer.length < 4 || !buffer.subarray(0, 4).equals(ZIP_MAGIC_BYTES)) {
    throw new Error('Invalid file: not a ZIP archive (bad magic bytes)');
  }
}

/**
 * Validate ZIP entries against security constraints
 */
export function validateEntries(entries: ZipEntryInfo[]): void {
  if (entries.length > MAX_FILE_COUNT) {
    throw new Error(
      `ZIP file exceeds maximum of ${MAX_FILE_COUNT} files (found ${entries.length})`,
    );
  }

  let totalSize = 0;

  for (const entry of entries) {
    const normalized = path.normalize(entry.entryName);

    // Zip Slip: reject path traversal
    if (
      normalized.startsWith('..') ||
      path.isAbsolute(normalized) ||
      entry.entryName.includes('../')
    ) {
      throw new Error(`Zip Slip path traversal detected: "${entry.entryName}"`);
    }

    totalSize += entry.header.size;
  }

  if (totalSize > MAX_UNCOMPRESSED_SIZE) {
    throw new Error(
      `ZIP uncompressed size ${Math.round(totalSize / 1024 / 1024)}MB exceeds maximum of 200MB`,
    );
  }
}

/**
 * Check that SKILL.md is present at root level
 */
export function validateSkillMdPresent(entries: ZipEntryInfo[]): void {
  const found = entries.some(
    (e) => e.entryName === 'SKILL.md' || e.entryName === './SKILL.md',
  );
  if (!found) {
    throw new Error('SKILL.md is required in the root of the ZIP archive');
  }
}
