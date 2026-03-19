#!/usr/bin/env node

import { Command } from 'commander';
import { loginCommand } from './commands/login';
import { searchCommand } from './commands/search';
import { installCommand } from './commands/install';
import { publishCommand } from './commands/publish';
import { whoamiCommand } from './commands/whoami';
import { logoutCommand } from './commands/logout';
import { initCommand } from './commands/init';
import {
  templateListCommand,
  templateSearchCommand,
  templateInfoCommand,
  templatePublishCommand,
} from './commands/template';
import { templateUpdateCommand } from './commands/template-update';
import { templateOutdatedCommand } from './commands/template-outdated';
import { namespaceCreateCommand } from './commands/namespace';

const program = new Command();

program
  .name('skillhub')
  .description('Enterprise SkillHub CLI — Manage internal AI skills and templates')
  .version('0.2.0');

// ============================================================
// Auth commands
// ============================================================

program
  .command('login')
  .description('Authenticate via LDAP and obtain JWT token')
  .action(loginCommand);

program
  .command('whoami')
  .description('Show current user information')
  .action(whoamiCommand);

program
  .command('logout')
  .description('Clear local authentication token')
  .action(logoutCommand);

// ============================================================
// Skill commands (existing)
// ============================================================

program
  .command('search')
  .description('Search for skills')
  .argument('<query>', 'Search query')
  .action(searchCommand);

program
  .command('install')
  .description('Download and install a skill locally')
  .argument('<slug>', 'Skill slug, optionally with @version (e.g. my-skill@1.2.0)')
  .action(installCommand);

program
  .command('publish')
  .description('Package and upload a skill directory for review')
  .argument('<dir>', 'Path to skill directory')
  .action(publishCommand);

// ============================================================
// Sprint 6: Template + Init commands
// ============================================================

program
  .command('init')
  .description('Initialize a project from a template')
  .requiredOption('--template <ref>', 'Template reference (e.g. @namespace/name)')
  .option('--ai <tool>', 'AI tool adapter (claude|cursor|codebuddy|windsurf)')
  .option('--dir <path>', 'Target directory (defaults to template name)')
  .option('--git <url>', 'Git repository URL (alternative to template registry)')
  .option('--ref <tag>', 'Git ref/tag/branch (for --git)')
  .action(initCommand);

// Template subcommands
const template = program
  .command('template')
  .description('Manage templates');

template
  .command('list')
  .description('List available templates')
  .option('--namespace <name>', 'Filter by namespace (e.g. @team)')
  .action(templateListCommand);

template
  .command('search')
  .description('Search templates')
  .argument('<query>', 'Search query')
  .action(templateSearchCommand);

template
  .command('info')
  .description('Show template details')
  .argument('<ref>', 'Template reference (e.g. @namespace/name)')
  .action(templateInfoCommand);

template
  .command('publish')
  .description('Publish current directory as a template')
  .action(templatePublishCommand);

template
  .command('update')
  .description('Update project from template')
  .option('--dry-run', 'Preview changes without modifying files')
  .action(templateUpdateCommand);

template
  .command('outdated')
  .description('Check for template and skill updates')
  .action(templateOutdatedCommand);

// Namespace subcommands
const namespace = program
  .command('namespace')
  .description('Manage namespaces');

namespace
  .command('create')
  .description('Create a new namespace')
  .argument('<name>', 'Namespace name (lowercase, 3-32 chars)')
  .action(namespaceCreateCommand);

program.parse(process.argv);
