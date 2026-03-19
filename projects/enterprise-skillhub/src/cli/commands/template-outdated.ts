import { LockManager } from '../update/lock-manager';
import { loadConfig } from '../config';

/**
 * `skillhub template outdated`
 * Check if template or skill dependencies have newer versions available.
 */
export async function templateOutdatedCommand() {
  const projectDir = process.cwd();
  const lockManager = new LockManager(projectDir);

  if (!lockManager.exists()) {
    console.error('❌ No template.lock found. Run `skillhub init` first.');
    process.exit(1);
  }

  const lock = lockManager.read();
  console.log(`📋 Checking: ${lock.namespace}/${lock.templateName}@${lock.templateVersion}\n`);

  try {
    const config = loadConfig();
    const baseUrl = config.apiUrl || 'http://localhost:3000/api/v1';

    // Check template version
    const tplResponse = await fetch(
      `${baseUrl}/templates/resolve?namespace=${lock.namespace}&name=${lock.templateName}`,
      { headers: { Authorization: `Bearer ${config.token}` } },
    );

    if (tplResponse.ok) {
      const tplData = await tplResponse.json();
      const latestVersion = tplData.latestVersion;

      if (latestVersion && latestVersion !== lock.templateVersion) {
        console.log(`📦 Template: ${lock.templateVersion} → ${latestVersion} (update available)`);
      } else {
        console.log(`📦 Template: ${lock.templateVersion} ✅ up to date`);
      }
    }

    // Check skill dependencies
    const skillNames = Object.keys(lock.skills);
    if (skillNames.length === 0) {
      console.log('\n🔧 No skill dependencies.');
      return;
    }

    console.log('\n🔧 Skill Dependencies:');

    for (const [skillName, currentVersion] of Object.entries(lock.skills)) {
      try {
        const skillResponse = await fetch(
          `${baseUrl}/skills?name=${encodeURIComponent(skillName)}`,
          { headers: { Authorization: `Bearer ${config.token}` } },
        );

        if (skillResponse.ok) {
          const skillData = await skillResponse.json();
          const latestSkillVersion = skillData.latestVersion;

          if (latestSkillVersion && latestSkillVersion !== currentVersion) {
            console.log(`  ${skillName}: ${currentVersion} → ${latestSkillVersion}`);
          } else {
            console.log(`  ${skillName}: ${currentVersion} ✅`);
          }
        } else {
          console.log(`  ${skillName}: ${currentVersion} (unable to check)`);
        }
      } catch {
        console.log(`  ${skillName}: ${currentVersion} (unable to check)`);
      }
    }
  } catch (error) {
    console.error(`❌ Check failed: ${error.message}`);
    process.exit(1);
  }
}
