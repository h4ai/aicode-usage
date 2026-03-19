import { LockManager } from '../update/lock-manager';
import { UpdateEngine, RemoteTemplateInfo } from '../update/update-engine';
import { loadConfig } from '../config';

/**
 * `skillhub template update [--dry-run]`
 * Update project from template, handling conflicts.
 */
export async function templateUpdateCommand(options: { dryRun?: boolean } = {}) {
  const projectDir = process.cwd();
  const lockManager = new LockManager(projectDir);

  if (!lockManager.exists()) {
    console.error('❌ No template.lock found. Run `skillhub init` first.');
    process.exit(1);
  }

  const lock = lockManager.read();
  console.log(`📋 Current template: ${lock.namespace}/${lock.templateName}@${lock.templateVersion}`);

  try {
    const config = loadConfig();
    if (!config) {
      console.error('❌ Not logged in. Run `skillhub login` first.');
      process.exit(1);
    }
    const baseUrl = config.apiUrl || 'http://localhost:3000/api/v1';

    // Fetch latest template version from server
    const response = await fetch(
      `${baseUrl}/templates/resolve?namespace=${lock.namespace}&name=${lock.templateName}`,
      { headers: { Authorization: `Bearer ${config.token}` } },
    );

    if (!response.ok) {
      console.error('❌ Failed to fetch template info from server');
      process.exit(1);
    }

    const templateData = await response.json();
    const latestVersion = templateData.latestVersion;

    if (!latestVersion) {
      console.log('✅ Already up to date!');
      return;
    }

    if (latestVersion === lock.templateVersion) {
      console.log('✅ Already at latest version.');
      return;
    }

    console.log(`🔄 Updating to version ${latestVersion}...`);

    // In production, we'd fetch the actual file contents from the server
    // For now, create a mock remote with the version info
    const remote: RemoteTemplateInfo = {
      version: latestVersion,
      files: templateData.files || {},
      skills: templateData.skills || {},
    };

    const engine = new UpdateEngine(projectDir);
    const result = await engine.update(remote, options.dryRun || false);

    // Display results
    if (options.dryRun) {
      console.log('\n🔍 DRY RUN — No files were modified:\n');
    }

    if (result.updated.length > 0) {
      console.log(`  ✅ Updated (${result.updated.length}):`);
      result.updated.forEach((f) => console.log(`     ${f.path}`));
    }

    if (result.added.length > 0) {
      console.log(`  ➕ Added (${result.added.length}):`);
      result.added.forEach((f) => console.log(`     ${f.path}`));
    }

    if (result.conflicts.length > 0) {
      console.log(`  ⚠️  Conflicts (${result.conflicts.length}):`);
      result.conflicts.forEach((f) => console.log(`     ${f.path}`));
      console.log('\n  Conflict files saved to .skillhub/conflicts/');
      console.log('  Review and resolve manually, then run `skillhub template resolve`');
    }

    if (result.removed.length > 0) {
      console.log(`  🗑️  Removed in template (${result.removed.length}):`);
      result.removed.forEach((f) => console.log(`     ${f.path} (kept locally)`));
    }

    if (result.skipped.length > 0) {
      console.log(`  ⏭️  Skipped (${result.skipped.length} unchanged files)`);
    }

    console.log('\n✅ Update complete!');
  } catch (error) {
    console.error(`❌ Update failed: ${error.message}`);
    process.exit(1);
  }
}
