import * as fs from 'fs';
import * as path from 'path';
import { AiToolAdapter, SkillEntry } from '../adapters/adapter.interface';

/**
 * Install skill dependencies into the appropriate AI tool directory.
 */
export class SkillInstaller {
  /**
   * Install skills using the given adapter
   * @param adapter - AI tool adapter (determines directory structure)
   * @param targetDir - Project root directory
   * @param skills - Skills to install
   */
  static async install(
    adapter: AiToolAdapter,
    targetDir: string,
    skills: SkillEntry[],
  ): Promise<InstalledSkill[]> {
    const installed: InstalledSkill[] = [];
    const skillsDir = adapter.getSkillsDir(targetDir);

    // Ensure skills directory exists
    fs.mkdirSync(skillsDir, { recursive: true });

    for (const skill of skills) {
      const skillPath = path.join(skillsDir, skill.name);

      // For adapters that use flat file structure (cursor, windsurf)
      if (skillPath.endsWith('.md')) {
        if (skill.content) {
          fs.writeFileSync(skillPath, skill.content, 'utf-8');
        }
      } else {
        // For adapters that use directory structure (claude, default)
        fs.mkdirSync(skillPath, { recursive: true });
        if (skill.content) {
          fs.writeFileSync(path.join(skillPath, 'SKILL.md'), skill.content, 'utf-8');
        }
      }

      installed.push({
        name: skill.name,
        version: skill.version,
        path: skillPath,
      });
    }

    return installed;
  }
}

export interface InstalledSkill {
  name: string;
  version: string;
  path: string;
}
