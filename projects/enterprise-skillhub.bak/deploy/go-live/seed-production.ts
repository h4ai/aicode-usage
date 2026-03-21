/**
 * Enterprise SkillHub — Production Seed Data
 *
 * Creates essential initial data for a fresh production deployment:
 * - Default admin user mapping
 * - Default review policy
 * - Default skill categories
 * - Default MinIO bucket
 *
 * Usage: npx ts-node deploy/go-live/seed-production.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Enterprise SkillHub — Production Seed');
  console.log('=========================================\n');

  // ==========================================
  // 1. Default Review Policy
  // ==========================================
  console.log('📋 Creating default review policy...');
  const reviewPolicy = await prisma.reviewPolicy.upsert({
    where: { name: 'default' },
    update: {},
    create: {
      name: 'default',
      description: 'Default review policy — requires 1 reviewer approval',
      minReviewers: 1,
      autoAssign: true,
      requireScan: true,
      scanRules: JSON.stringify([
        'security',
        'license',
        'quality',
        'integrity',
      ]),
      isActive: true,
    },
  });
  console.log(`   ✅ Review policy: ${reviewPolicy.name} (id: ${reviewPolicy.id})`);

  // ==========================================
  // 2. Default Skill Categories
  // ==========================================
  console.log('\n📂 Creating default categories...');
  const categories = [
    {
      name: 'Development Tools',
      slug: 'dev-tools',
      description: 'Development utilities, code generators, and IDE integrations',
      icon: '🛠️',
      sortOrder: 1,
    },
    {
      name: 'Data & Analytics',
      slug: 'data-analytics',
      description: 'Data processing, visualization, and analytics tools',
      icon: '📊',
      sortOrder: 2,
    },
    {
      name: 'DevOps & Infrastructure',
      slug: 'devops',
      description: 'CI/CD, deployment, monitoring, and infrastructure management',
      icon: '🚀',
      sortOrder: 3,
    },
    {
      name: 'Security',
      slug: 'security',
      description: 'Security scanning, vulnerability detection, and compliance',
      icon: '🔒',
      sortOrder: 4,
    },
    {
      name: 'Communication',
      slug: 'communication',
      description: 'Chat, email, notification, and messaging integrations',
      icon: '💬',
      sortOrder: 5,
    },
    {
      name: 'Productivity',
      slug: 'productivity',
      description: 'Task management, documentation, and workflow automation',
      icon: '⚡',
      sortOrder: 6,
    },
    {
      name: 'AI & Machine Learning',
      slug: 'ai-ml',
      description: 'AI models, LLM integrations, and ML pipelines',
      icon: '🤖',
      sortOrder: 7,
    },
    {
      name: 'Other',
      slug: 'other',
      description: 'Skills that don\'t fit into other categories',
      icon: '📦',
      sortOrder: 99,
    },
  ];

  for (const cat of categories) {
    const created = await prisma.category.upsert({
      where: { slug: cat.slug },
      update: {},
      create: cat,
    });
    console.log(`   ✅ Category: ${created.name} (${created.slug})`);
  }

  // ==========================================
  // 3. Default Tags
  // ==========================================
  console.log('\n🏷️  Creating default tags...');
  const tags = [
    'official',
    'community',
    'beta',
    'deprecated',
    'featured',
    'internal',
    'external',
    'python',
    'typescript',
    'go',
    'api',
    'cli',
    'web',
    'mobile',
  ];

  for (const tagName of tags) {
    const tag = await prisma.tag.upsert({
      where: { name: tagName },
      update: {},
      create: { name: tagName },
    });
    console.log(`   ✅ Tag: ${tag.name}`);
  }

  // ==========================================
  // 4. System Configuration
  // ==========================================
  console.log('\n⚙️  Creating system configuration...');
  const configs = [
    {
      key: 'max_upload_size_mb',
      value: '100',
      description: 'Maximum upload file size in MB',
    },
    {
      key: 'review_timeout_hours',
      value: '72',
      description: 'Auto-reassign review after N hours of inactivity',
    },
    {
      key: 'upstream_sync_enabled',
      value: 'true',
      description: 'Enable upstream skill synchronization',
    },
    {
      key: 'semantic_search_enabled',
      value: 'true',
      description: 'Enable BGE-M3 semantic search',
    },
    {
      key: 'maintenance_mode',
      value: 'false',
      description: 'Enable maintenance mode (read-only)',
    },
  ];

  for (const config of configs) {
    const created = await prisma.systemConfig.upsert({
      where: { key: config.key },
      update: {},
      create: config,
    });
    console.log(`   ✅ Config: ${created.key} = ${created.value}`);
  }

  // ==========================================
  // Summary
  // ==========================================
  console.log('\n=========================================');
  console.log('🎉 Production seed complete!');
  console.log(`   Review Policies: 1`);
  console.log(`   Categories: ${categories.length}`);
  console.log(`   Tags: ${tags.length}`);
  console.log(`   System Configs: ${configs.length}`);
  console.log('\n⚠️  Remember to:');
  console.log('   1. Verify LDAP group → role mapping in ConfigMap');
  console.log('   2. Create MinIO buckets: skillhub-packages, skillhub-backups');
  console.log('   3. Test login with an AD admin account');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
