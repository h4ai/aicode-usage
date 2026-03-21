import axios from 'axios';
import { loadConfig, isTokenValid } from '../config';

export async function whoamiCommand(): Promise<void> {
  const config = loadConfig();
  if (!config || !isTokenValid(config)) {
    console.error('✗ Not logged in. Run "skillhub login" first.');
    process.exit(1);
  }

  try {
    const response = await axios.get(`${config.apiUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${config.token}` },
    });

    const user = response.data;
    console.log(`Logged in as:`);
    console.log(`  Username:   ${user.username}`);
    console.log(`  Name:       ${user.displayName}`);
    console.log(`  Email:      ${user.email}`);
    console.log(`  Department: ${user.department || 'N/A'}`);
    console.log(`  Role:       ${user.role}`);
    console.log(`  API URL:    ${config.apiUrl}`);
    console.log(`  Token expires: ${new Date(config.tokenExpiry).toLocaleString()}`);
  } catch (error: any) {
    if (error.response?.status === 401) {
      console.error('✗ Token expired. Run "skillhub login" to re-authenticate.');
    } else {
      console.error(`✗ Failed: ${error.message}`);
    }
    process.exit(1);
  }
}
