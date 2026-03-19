import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as AdmZip from 'adm-zip';
import { loadConfig, isTokenValid } from '../config';
import { createAdapter } from '../adapters/adapter-factory';
import { TemplateEngine } from '../scaffold/template-engine';
import { FileFilter } from '../scaffold/file-filter';
import { HookRunner } from '../scaffold/hook-runner';
import { SkillInstaller } from '../scaffold/skill-installer';

/**
 * skillhub init --template @namespace/name [--ai claude|cursor|codebuddy|windsurf] [--dir path]
 */
export async function initCommand(options: {
  template: string;
  ai?: string;
  dir?: string;
}) {
  const config = loadConfig();
  if (!isTokenValid(config)) {
    console.error('Error: Not authenticated. Run "skillhub login" first.');
    process.exit(1);
  }

  // Parse template reference: @namespace/name
  const match = options.template.match(/^@([^/]+)\/(.+)$/);
  if (!match) {
    console.error('Error: Template must be in format @namespace/name');
    process.exit(1);
  }

  const [, namespace, templateName] = match;
  const targetDir = path.resolve(options.dir || templateName);

  console.log(`Initializing template @${namespace}/${templateName}...`);

  try {
    // 1. Resolve template from API
    const resolveUrl = `${config!.apiUrl}/api/v1/templates/resolve?namespace=${namespace}&name=${templateName}`;
    const { data: resolved } = await axios.get(resolveUrl, {
      headers: { Authorization: `Bearer ${config!.token}` },
    });

    // 2. Download template ZIP
    console.log(`Downloading template v${resolved.version}...`);
    const zipResponse = await axios.get(resolved.downloadUrl, {
      responseType: 'arraybuffer',
    });

    // 3. Extract ZIP to target directory
    fs.mkdirSync(targetDir, { recursive: true });
    const zip = new AdmZip(Buffer.from(zipResponse.data));
    zip.extractAllTo(targetDir, true);
    console.log(`Extracted to ${targetDir}`);

    // 4. Apply AI tool adapter
    const adapter = createAdapter(options.ai);
    console.log(`Applying ${adapter.name} adapter...`);

    const skills = resolved.skills || [];
    await adapter.generate(targetDir, skills, { projectName: templateName });

    // 5. Variable replacement
    if (resolved.manifest?.variables) {
      const variables: Record<string, any> = { projectName: templateName };
      // For non-interactive mode, use defaults
      for (const v of resolved.manifest.variables) {
        if (v.default && !variables[v.name]) {
          variables[v.name] = v.default;
        }
      }
      await TemplateEngine.processDirectory(targetDir, variables, resolved.manifest.filePatterns);
      console.log('Applied variable replacements');
    }

    // 6. Conditional file filtering
    if (resolved.manifest?.features && resolved.manifest?.featureMap) {
      await FileFilter.filter(targetDir, resolved.manifest.features, resolved.manifest.featureMap);
      console.log('Applied feature flags');
    }

    // 7. Install skill dependencies
    if (skills.length > 0) {
      await SkillInstaller.install(adapter, targetDir, skills);
      console.log(`Installed ${skills.length} skill(s)`);
    }

    // 8. Generate lock file
    const lockFile = {
      template: `@${namespace}/${templateName}`,
      version: resolved.version,
      ai: adapter.name,
      skills: skills.map((s: any) => ({ name: s.skillName || s.name, version: s.versionRange || s.version })),
      createdAt: new Date().toISOString(),
    };
    const lockDir = path.join(targetDir, '.skillhub');
    fs.mkdirSync(lockDir, { recursive: true });
    fs.writeFileSync(path.join(lockDir, 'template.lock'), JSON.stringify(lockFile, null, 2), 'utf-8');

    // 9. Run post-init hooks
    if (resolved.manifest?.postInit && resolved.manifest.postInit.length > 0) {
      console.log('Running post-init hooks...');
      const results = await HookRunner.run(targetDir, resolved.manifest.postInit, { silent: false });
      const failed = results.filter((r) => !r.success);
      if (failed.length > 0) {
        console.warn(`${failed.length} hook(s) failed`);
      }
    }

    console.log(`\n✅ Project initialized at ${targetDir}`);
    console.log(`   Template: @${namespace}/${templateName} v${resolved.version}`);
    console.log(`   AI Tool: ${adapter.name}`);
  } catch (error: any) {
    if (error.response?.status === 404) {
      console.error(`Error: Template "@${namespace}/${templateName}" not found`);
    } else {
      console.error(`Error: ${error.message}`);
    }
    process.exit(1);
  }
}
