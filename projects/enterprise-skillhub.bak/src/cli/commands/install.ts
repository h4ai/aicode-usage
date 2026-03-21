import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { loadConfig, isTokenValid } from '../config';

export async function installCommand(slugWithVersion: string): Promise<void> {
  const config = loadConfig();
  if (!config || !isTokenValid(config)) {
    console.error('✗ Not logged in. Run "skillhub login" first.');
    process.exit(1);
  }

  // Parse slug[@version]
  const atIdx = slugWithVersion.lastIndexOf('@');
  let slug: string;
  let version: string | undefined;

  if (atIdx > 0) {
    slug = slugWithVersion.slice(0, atIdx);
    version = slugWithVersion.slice(atIdx + 1);
  } else {
    slug = slugWithVersion;
  }

  try {
    console.log(`Downloading ${slug}${version ? `@${version}` : '@latest'}...`);

    const downloadUrl = version
      ? `${config.apiUrl}/skills/${slug}/versions/${version}/download`
      : `${config.apiUrl}/skills/${slug}/download`;

    const response = await axios.get(downloadUrl, {
      headers: { Authorization: `Bearer ${config.token}` },
      responseType: 'arraybuffer',
    });

    // Save and extract
    const installDir = path.join(process.cwd(), '.skills', slug);
    const zipPath = path.join(installDir, `${slug}.zip`);

    fs.mkdirSync(installDir, { recursive: true });
    fs.writeFileSync(zipPath, response.data);

    // Extract zip
    execSync(`unzip -o "${zipPath}" -d "${installDir}"`, { stdio: 'pipe' });
    fs.unlinkSync(zipPath);

    console.log(`✓ Installed ${slug} to ${installDir}`);
  } catch (error: any) {
    if (error.response?.status === 404) {
      console.error(`✗ Skill "${slug}" not found`);
    } else {
      console.error(`✗ Install failed: ${error.message}`);
    }
    process.exit(1);
  }
}
