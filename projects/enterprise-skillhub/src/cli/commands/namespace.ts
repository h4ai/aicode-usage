import axios from 'axios';
import { loadConfig, isTokenValid } from '../config';

/**
 * skillhub namespace create <name>
 */
export async function namespaceCreateCommand(name: string) {
  const config = loadConfig();
  if (!isTokenValid(config)) {
    console.error('Error: Not authenticated. Run "skillhub login" first.');
    process.exit(1);
  }

  try {
    const { data } = await axios.post(
      `${config!.apiUrl}/api/v1/namespaces`,
      { name },
      { headers: { Authorization: `Bearer ${config!.token}` } },
    );

    console.log(`\n✅ Namespace "@${data.name}" created successfully.`);
    console.log(`   ID: ${data.id}`);
    console.log(`   You are the ADMIN of this namespace.`);
  } catch (error: any) {
    if (error.response?.data?.message) {
      console.error(`Error: ${error.response.data.message}`);
    } else {
      console.error(`Error: ${error.message}`);
    }
    process.exit(1);
  }
}
