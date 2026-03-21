import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { loadConfig, isTokenValid } from '../config';

export async function publishCommand(dir: string): Promise<void> {
  const config = loadConfig();
  if (!config || !isTokenValid(config)) {
    console.error('✗ Not logged in. Run "skillhub login" first.');
    process.exit(1);
  }

  const skillDir = path.resolve(dir);
  if (!fs.existsSync(skillDir)) {
    console.error(`✗ Directory not found: ${skillDir}`);
    process.exit(1);
  }

  const skillMdPath = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(skillMdPath)) {
    console.error('✗ SKILL.md not found in the directory. Is this a valid skill?');
    process.exit(1);
  }

  try {
    // Pack the directory into a zip
    const zipName = `${path.basename(skillDir)}.zip`;
    const zipPath = path.join(process.cwd(), zipName);

    console.log(`Packaging ${skillDir}...`);
    execSync(`cd "${skillDir}" && zip -r "${zipPath}" . -x "node_modules/*" ".git/*"`, {
      stdio: 'pipe',
    });

    const fileBuffer = fs.readFileSync(zipPath);

    console.log('Uploading...');

    const formData = new FormData();
    formData.append('file', new Blob([fileBuffer]), zipName);

    const response = await axios.post(`${config.apiUrl}/skills/upload`, formData, {
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'multipart/form-data',
      },
      maxContentLength: 100 * 1024 * 1024, // 100MB
    });

    // Clean up zip
    fs.unlinkSync(zipPath);

    const { skillId, versionId, reviewId } = response.data;
    console.log(`✓ Published successfully!`);
    console.log(`  Skill ID: ${skillId}`);
    console.log(`  Version ID: ${versionId}`);
    console.log(`  Review ID: ${reviewId} (pending auto-scan)`);
  } catch (error: any) {
    if (error.response?.data?.message) {
      console.error(`✗ Publish failed: ${error.response.data.message}`);
    } else {
      console.error(`✗ Publish failed: ${error.message}`);
    }
    process.exit(1);
  }
}
