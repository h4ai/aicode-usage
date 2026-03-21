import { createAdapter, getSupportedTools } from './adapter-factory';
import { ClaudeAdapter } from './claude-adapter';
import { CursorAdapter } from './cursor-adapter';
import { CodebuddyAdapter } from './codebuddy-adapter';
import { WindsurfAdapter } from './windsurf-adapter';
import { DefaultAdapter } from './default-adapter';

describe('AdapterFactory', () => {
  describe('createAdapter', () => {
    it('should return ClaudeAdapter for "claude"', () => {
      const adapter = createAdapter('claude');
      expect(adapter).toBeInstanceOf(ClaudeAdapter);
    });

    it('should return CursorAdapter for "cursor"', () => {
      const adapter = createAdapter('cursor');
      expect(adapter).toBeInstanceOf(CursorAdapter);
    });

    it('should return CodebuddyAdapter for "codebuddy"', () => {
      const adapter = createAdapter('codebuddy');
      expect(adapter).toBeInstanceOf(CodebuddyAdapter);
    });

    it('should return WindsurfAdapter for "windsurf"', () => {
      const adapter = createAdapter('windsurf');
      expect(adapter).toBeInstanceOf(WindsurfAdapter);
    });

    it('should return DefaultAdapter when no AI tool is specified', () => {
      const adapter = createAdapter();
      expect(adapter).toBeInstanceOf(DefaultAdapter);
    });

    it('should return DefaultAdapter for unknown AI tool', () => {
      const adapter = createAdapter('unknown-tool');
      expect(adapter).toBeInstanceOf(DefaultAdapter);
    });

    it('should be case-insensitive', () => {
      const adapter = createAdapter('Claude');
      expect(adapter).toBeInstanceOf(ClaudeAdapter);
    });
  });

  describe('getSupportedTools', () => {
    it('should return list of supported tools', () => {
      const tools = getSupportedTools();
      expect(tools).toContain('claude');
      expect(tools).toContain('cursor');
      expect(tools).toContain('codebuddy');
      expect(tools).toContain('windsurf');
      expect(tools).toHaveLength(4);
    });
  });
});
