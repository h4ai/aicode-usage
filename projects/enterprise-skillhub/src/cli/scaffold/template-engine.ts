import * as Handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Template engine that performs Handlebars variable replacement
 * on files matching specified patterns.
 */
export class TemplateEngine {
  /**
   * Process all files in targetDir, replacing Handlebars variables
   * in files matching the given patterns.
   */
  static async processDirectory(
    targetDir: string,
    variables: Record<string, any>,
    patterns: string[] = ['*.md', '*.json', '*.xml', '*.yaml', '*.yml', '*.java', '*.ts', '*.js'],
  ): Promise<string[]> {
    const processedFiles: string[] = [];
    const allFiles = TemplateEngine.walkDir(targetDir);

    for (const filePath of allFiles) {
      const ext = path.extname(filePath);
      const basename = path.basename(filePath);

      // Check if file matches any pattern
      const shouldProcess = patterns.some((pattern) => {
        if (pattern.startsWith('*.')) {
          return ext === pattern.slice(1); // e.g. *.md → .md
        }
        return basename === pattern;
      });

      if (shouldProcess) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const processed = TemplateEngine.render(content, variables);
        if (processed !== content) {
          fs.writeFileSync(filePath, processed, 'utf-8');
          processedFiles.push(filePath);
        }
      }
    }

    return processedFiles;
  }

  /**
   * Render a template string with Handlebars
   */
  static render(template: string, variables: Record<string, any>): string {
    const compiled = Handlebars.compile(template, { noEscape: true });
    return compiled(variables);
  }

  /**
   * Walk directory recursively and return all file paths
   */
  static walkDir(dir: string): string[] {
    const results: string[] = [];
    if (!fs.existsSync(dir)) return results;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...TemplateEngine.walkDir(fullPath));
      } else {
        results.push(fullPath);
      }
    }
    return results;
  }
}
