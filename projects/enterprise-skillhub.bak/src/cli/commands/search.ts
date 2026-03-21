import axios from 'axios';
import { loadConfig, isTokenValid } from '../config';

export async function searchCommand(query: string): Promise<void> {
  const config = loadConfig();
  if (!config || !isTokenValid(config)) {
    console.error('✗ Not logged in. Run "skillhub login" first.');
    process.exit(1);
  }

  try {
    const response = await axios.get(`${config.apiUrl}/search/skills`, {
      params: { q: query },
      headers: { Authorization: `Bearer ${config.token}` },
    });

    const { data } = response.data;
    if (!data || data.length === 0) {
      console.log(`No skills found for "${query}"`);
      return;
    }

    console.log(`Found ${data.length} skill(s):\n`);
    for (const skill of data) {
      console.log(`  ${skill.name} (${skill.slug})`);
      console.log(`    ${skill.summary || 'No description'}`);
      console.log(`    Category: ${skill.category} | Installs: ${skill.installCount || 0}`);
      console.log();
    }
  } catch (error: any) {
    console.error(`✗ Search failed: ${error.message}`);
    process.exit(1);
  }
}
