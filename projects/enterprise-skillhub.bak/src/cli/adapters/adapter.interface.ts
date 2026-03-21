/**
 * AI Tool Adapter Interface
 * Each adapter generates the appropriate directory structure for a specific AI tool.
 */
export interface AiToolAdapter {
  /** Unique identifier for this adapter */
  readonly name: string;

  /**
   * Generate the AI tool-specific directory structure
   * @param targetDir - The project root directory
   * @param skills - Array of skill entries to install
   * @param config - Optional configuration from manifest
   */
  generate(targetDir: string, skills: SkillEntry[], config?: Record<string, any>): Promise<GenerateResult>;

  /**
   * Get the skills directory path for this AI tool
   */
  getSkillsDir(targetDir: string): string;
}

export interface SkillEntry {
  name: string;
  version: string;
  content?: string;
}

export interface GenerateResult {
  filesCreated: string[];
  dirsCreated: string[];
}
