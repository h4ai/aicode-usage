import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface SkillHubConfig {
  apiUrl: string;
  token: string;
  tokenExpiry: number; // Unix timestamp in milliseconds
}

const CONFIG_FILENAME = '.skillhubrc';

export function getConfigPath(): string {
  return path.join(os.homedir(), CONFIG_FILENAME);
}

export function loadConfig(): SkillHubConfig | null {
  const configPath = getConfigPath();

  if (!fs.existsSync(configPath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(raw) as SkillHubConfig;
  } catch {
    return null;
  }
}

export function saveConfig(config: SkillHubConfig): void {
  const configPath = getConfigPath();
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), {
    mode: 0o600, // Owner read/write only
  });
}

export function clearConfig(): void {
  const configPath = getConfigPath();
  if (fs.existsSync(configPath)) {
    fs.unlinkSync(configPath);
  }
}

export function isTokenValid(config: SkillHubConfig | null): boolean {
  if (!config || !config.token || !config.tokenExpiry) {
    return false;
  }
  return config.tokenExpiry > Date.now();
}
