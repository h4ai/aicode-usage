#!/usr/bin/env node

import { Command } from 'commander';
import { loginCommand } from './commands/login';
import { searchCommand } from './commands/search';
import { installCommand } from './commands/install';
import { publishCommand } from './commands/publish';
import { whoamiCommand } from './commands/whoami';
import { logoutCommand } from './commands/logout';

const program = new Command();

program
  .name('skillhub')
  .description('Enterprise SkillHub CLI — Manage internal AI skills')
  .version('0.1.0');

program
  .command('login')
  .description('Authenticate via LDAP and obtain JWT token')
  .action(loginCommand);

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

program
  .command('whoami')
  .description('Show current user information')
  .action(whoamiCommand);

program
  .command('logout')
  .description('Clear local authentication token')
  .action(logoutCommand);

program.parse(process.argv);
