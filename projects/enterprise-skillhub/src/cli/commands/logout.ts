import { clearConfig, loadConfig } from '../config';

export function logoutCommand(): void {
  const config = loadConfig();
  if (!config) {
    console.log('Not logged in.');
    return;
  }

  clearConfig();
  console.log('✓ Logged out. Token cleared.');
}
