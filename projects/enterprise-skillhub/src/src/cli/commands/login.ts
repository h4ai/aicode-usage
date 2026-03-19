import axios from 'axios';
import * as readline from 'readline';
import { loadConfig, saveConfig, isTokenValid } from '../config';

function askQuestion(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

export async function loginCommand(): Promise<void> {
  const config = loadConfig();
  if (config && isTokenValid(config)) {
    console.log('Already logged in. Use "skillhub logout" first.');
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const apiUrl =
      (await askQuestion(rl, 'API URL [https://skillhub.corp.com/api/v1]: ')) ||
      'https://skillhub.corp.com/api/v1';
    const username = await askQuestion(rl, 'Username: ');
    const password = await askQuestion(rl, 'Password: ');

    console.log('Authenticating via LDAP...');

    const response = await axios.post(`${apiUrl}/auth/login`, {
      username,
      password,
    });

    const { access_token, expires_in } = response.data;
    const tokenExpiry = Date.now() + (expires_in || 43200) * 1000; // default 12h

    saveConfig({ apiUrl, token: access_token, tokenExpiry });

    console.log(`✓ Logged in as ${username}`);
    console.log(`  Token expires: ${new Date(tokenExpiry).toLocaleString()}`);
  } catch (error: any) {
    if (error.response?.status === 401) {
      console.error('✗ Authentication failed: Invalid credentials');
    } else {
      console.error(`✗ Login failed: ${error.message}`);
    }
    process.exit(1);
  } finally {
    rl.close();
  }
}
