import { AiToolAdapter } from './adapter.interface';
import { ClaudeAdapter } from './claude-adapter';
import { CursorAdapter } from './cursor-adapter';
import { CodebuddyAdapter } from './codebuddy-adapter';
import { WindsurfAdapter } from './windsurf-adapter';
import { DefaultAdapter } from './default-adapter';

const adapters: Record<string, new () => AiToolAdapter> = {
  claude: ClaudeAdapter,
  cursor: CursorAdapter,
  codebuddy: CodebuddyAdapter,
  windsurf: WindsurfAdapter,
};

/**
 * Factory to create the appropriate AI tool adapter based on --ai argument
 */
export function createAdapter(aiTool?: string): AiToolAdapter {
  if (!aiTool) {
    return new DefaultAdapter();
  }

  const normalizedTool = aiTool.toLowerCase();
  const AdapterClass = adapters[normalizedTool];

  if (!AdapterClass) {
    return new DefaultAdapter();
  }

  return new AdapterClass();
}

/**
 * Get list of supported AI tools
 */
export function getSupportedTools(): string[] {
  return Object.keys(adapters);
}
