import axios from 'axios';
import { loadConfig, isTokenValid } from '../config';

/**
 * skillhub template list [--namespace @team]
 */
export async function templateListCommand(options: { namespace?: string }) {
  const config = loadConfig();
  if (!isTokenValid(config)) {
    console.error('Error: Not authenticated. Run "skillhub login" first.');
    process.exit(1);
  }

  try {
    const params: any = { limit: 20 };
    if (options.namespace) {
      params.namespace = options.namespace.replace(/^@/, '');
    }

    const { data } = await axios.get(`${config!.apiUrl}/api/v1/templates`, {
      headers: { Authorization: `Bearer ${config!.token}` },
      params,
    });

    if (data.data.length === 0) {
      console.log('No templates found.');
      return;
    }

    console.log(`\nTemplates (${data.total} total):\n`);
    for (const tpl of data.data) {
      const ns = tpl.namespace?.name || 'unknown';
      console.log(`  @${ns}/${tpl.name}`);
      if (tpl.description) console.log(`    ${tpl.description}`);
      console.log(`    Downloads: ${tpl.downloadCount}  Weekly: ${tpl.weeklyDownloads}`);
      console.log();
    }
  } catch (error: any) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

/**
 * skillhub template search <query>
 */
export async function templateSearchCommand(query: string) {
  const config = loadConfig();
  if (!isTokenValid(config)) {
    console.error('Error: Not authenticated. Run "skillhub login" first.');
    process.exit(1);
  }

  try {
    const { data } = await axios.get(`${config!.apiUrl}/api/v1/templates`, {
      headers: { Authorization: `Bearer ${config!.token}` },
      params: { search: query },
    });

    if (data.data.length === 0) {
      console.log(`No templates found for "${query}".`);
      return;
    }

    console.log(`\nSearch results for "${query}" (${data.total}):\n`);
    for (const tpl of data.data) {
      const ns = tpl.namespace?.name || 'unknown';
      console.log(`  @${ns}/${tpl.name} — ${tpl.description || 'No description'}`);
    }
  } catch (error: any) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

/**
 * skillhub template info @namespace/name
 */
export async function templateInfoCommand(ref: string) {
  const config = loadConfig();
  if (!isTokenValid(config)) {
    console.error('Error: Not authenticated. Run "skillhub login" first.');
    process.exit(1);
  }

  const match = ref.match(/^@([^/]+)\/(.+)$/);
  if (!match) {
    console.error('Error: Template reference must be in format @namespace/name');
    process.exit(1);
  }

  try {
    const { data } = await axios.get(`${config!.apiUrl}/api/v1/templates/resolve`, {
      headers: { Authorization: `Bearer ${config!.token}` },
      params: { namespace: match[1], name: match[2] },
    });

    console.log(`\nTemplate: ${data.template.fullName}`);
    console.log(`Latest version: ${data.version}`);
    if (data.extends) console.log(`Extends: ${data.extends}`);
    if (data.skills.length > 0) {
      console.log('\nSkill Dependencies:');
      for (const s of data.skills) {
        console.log(`  - ${s.skillName} ${s.versionRange}`);
      }
    }
  } catch (error: any) {
    if (error.response?.status === 404) {
      console.error(`Error: Template "${ref}" not found`);
    } else {
      console.error(`Error: ${error.message}`);
    }
    process.exit(1);
  }
}

/**
 * skillhub template publish
 */
export async function templatePublishCommand() {
  const config = loadConfig();
  if (!isTokenValid(config)) {
    console.error('Error: Not authenticated. Run "skillhub login" first.');
    process.exit(1);
  }

  console.log('Template publish: This command requires a template.json in the current directory.');
  console.log('Use the web interface or API for publishing templates.');
}
