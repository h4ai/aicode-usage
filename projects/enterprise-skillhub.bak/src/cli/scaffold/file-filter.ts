import * as fs from 'fs';
import * as path from 'path';

/**
 * File filter that conditionally includes/excludes files
 * based on feature flags from the manifest.
 */
export class FileFilter {
  /**
   * Filter files in targetDir based on feature flags.
   * Removes files that are gated behind disabled features.
   *
   * @param targetDir - Project root directory
   * @param features - Map of feature names to boolean (enabled/disabled)
   * @param featureMap - Map of feature names to glob patterns of files to include
   */
  static async filter(
    targetDir: string,
    features: Record<string, boolean>,
    featureMap: Record<string, string[]>,
  ): Promise<string[]> {
    const removedFiles: string[] = [];

    for (const [feature, patterns] of Object.entries(featureMap)) {
      // If feature is disabled, remove the associated files
      if (!features[feature]) {
        for (const pattern of patterns) {
          const filePath = path.join(targetDir, pattern);
          if (fs.existsSync(filePath)) {
            const stat = fs.statSync(filePath);
            if (stat.isDirectory()) {
              fs.rmSync(filePath, { recursive: true, force: true });
            } else {
              fs.unlinkSync(filePath);
            }
            removedFiles.push(filePath);
          }
        }
      }
    }

    return removedFiles;
  }
}
