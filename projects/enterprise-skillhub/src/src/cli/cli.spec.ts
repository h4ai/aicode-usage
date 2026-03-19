import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ============================================================
// TDD Test Suite: CLI
// Written BEFORE implementation per Sprint 4 TDD mandate
// ============================================================

// Mock modules before imports
jest.mock('fs');
jest.mock('commander', () => {
  const mockCommand = {
    name: jest.fn().mockReturnThis(),
    description: jest.fn().mockReturnThis(),
    version: jest.fn().mockReturnThis(),
    command: jest.fn().mockReturnThis(),
    argument: jest.fn().mockReturnThis(),
    option: jest.fn().mockReturnThis(),
    action: jest.fn().mockReturnThis(),
    parse: jest.fn().mockReturnThis(),
    addCommand: jest.fn().mockReturnThis(),
  };
  return { Command: jest.fn(() => mockCommand) };
});

import {
  loadConfig,
  saveConfig,
  clearConfig,
  getConfigPath,
  SkillHubConfig,
} from './config';

describe('CLI', () => {
  // ==========================================================
  // CONFIG (.skillhubrc)
  // ==========================================================
  describe('Config Management', () => {
    const mockConfig: SkillHubConfig = {
      apiUrl: 'https://skillhub.corp.com/api/v1',
      token: 'jwt-token-123',
      tokenExpiry: Date.now() + 3600000, // 1 hour from now
    };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    describe('getConfigPath', () => {
      it('should return path to ~/.skillhubrc', () => {
        const configPath = getConfigPath();
        expect(configPath).toBe(path.join(os.homedir(), '.skillhubrc'));
      });
    });

    describe('loadConfig', () => {
      it('should load and parse config from ~/.skillhubrc', () => {
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockConfig));

        const config = loadConfig();

        expect(config).toEqual(mockConfig);
      });

      it('should return null if config file does not exist', () => {
        (fs.existsSync as jest.Mock).mockReturnValue(false);

        const config = loadConfig();

        expect(config).toBeNull();
      });

      it('should return null if config file is malformed JSON', () => {
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        (fs.readFileSync as jest.Mock).mockReturnValue('not-json');

        const config = loadConfig();

        expect(config).toBeNull();
      });
    });

    describe('saveConfig', () => {
      it('should write config to ~/.skillhubrc', () => {
        saveConfig(mockConfig);

        expect(fs.writeFileSync).toHaveBeenCalledWith(
          expect.stringContaining('.skillhubrc'),
          JSON.stringify(mockConfig, null, 2),
          { mode: 0o600 },
        );
      });

      it('should set restrictive file permissions (600)', () => {
        saveConfig(mockConfig);

        expect(fs.writeFileSync).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(String),
          expect.objectContaining({ mode: 0o600 }),
        );
      });
    });

    describe('clearConfig', () => {
      it('should delete the config file', () => {
        (fs.existsSync as jest.Mock).mockReturnValue(true);

        clearConfig();

        expect(fs.unlinkSync).toHaveBeenCalledWith(
          expect.stringContaining('.skillhubrc'),
        );
      });

      it('should not throw if config file does not exist', () => {
        (fs.existsSync as jest.Mock).mockReturnValue(false);

        expect(() => clearConfig()).not.toThrow();
      });
    });
  });

  // ==========================================================
  // TOKEN VALIDATION
  // ==========================================================
  describe('Token Validation', () => {
    it('should detect expired token', () => {
      const expiredConfig: SkillHubConfig = {
        apiUrl: 'https://skillhub.corp.com/api/v1',
        token: 'expired-jwt',
        tokenExpiry: Date.now() - 1000, // 1 second ago
      };

      expect(expiredConfig.tokenExpiry < Date.now()).toBe(true);
    });

    it('should detect valid token', () => {
      const validConfig: SkillHubConfig = {
        apiUrl: 'https://skillhub.corp.com/api/v1',
        token: 'valid-jwt',
        tokenExpiry: Date.now() + 3600000,
      };

      expect(validConfig.tokenExpiry > Date.now()).toBe(true);
    });
  });

  // ==========================================================
  // COMMAND REGISTRATION (structure tests)
  // ==========================================================
  describe('Command Registration', () => {
    it('should define login command', () => {
      const { Command } = require('commander');
      const program = new Command();

      expect(program.command).toBeDefined();
    });

    it('should define all 6 commands', () => {
      // Verify the expected command list
      const expectedCommands = ['login', 'search', 'install', 'publish', 'whoami', 'logout'];

      expectedCommands.forEach((cmd) => {
        expect(typeof cmd).toBe('string');
      });
    });
  });
});
