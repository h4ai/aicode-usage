import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // 1. Create default Admin user
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      displayName: 'System Administrator',
      email: 'admin@enterprise.local',
      department: 'IT',
      role: 'ADMIN',
      isActive: true,
    },
  });
  console.log(`✅ Admin user created: ${admin.username} (${admin.id})`);

  // 2. Create sample Publisher user
  const publisher = await prisma.user.upsert({
    where: { username: 'publisher1' },
    update: {},
    create: {
      username: 'publisher1',
      displayName: 'Sample Publisher',
      email: 'publisher1@enterprise.local',
      department: 'Engineering',
      role: 'PUBLISHER',
      isActive: true,
    },
  });
  console.log(`✅ Publisher user created: ${publisher.username} (${publisher.id})`);

  // 3. Create sample Reviewer user
  const reviewer = await prisma.user.upsert({
    where: { username: 'reviewer1' },
    update: {},
    create: {
      username: 'reviewer1',
      displayName: 'Sample Reviewer',
      email: 'reviewer1@enterprise.local',
      department: 'Security',
      role: 'REVIEWER',
      isActive: true,
    },
  });
  console.log(`✅ Reviewer user created: ${reviewer.username} (${reviewer.id})`);

  // 4. Create sample Skills
  const sampleSkills = [
    {
      name: 'GitHub Operations',
      slug: 'github-ops',
      summary: 'Manage GitHub issues, PRs, CI runs, and code reviews via gh CLI',
      category: 'DEVELOPMENT' as const,
      visibility: 'PUBLIC' as const,
      tags: ['github', 'git', 'ci-cd', 'code-review'],
      ownerId: publisher.id,
    },
    {
      name: 'Docker Manager',
      slug: 'docker-manager',
      summary: 'Build, run, and manage Docker containers and compose stacks',
      category: 'DEVOPS' as const,
      visibility: 'PUBLIC' as const,
      tags: ['docker', 'containers', 'devops'],
      ownerId: publisher.id,
    },
    {
      name: 'SQL Query Helper',
      slug: 'sql-query-helper',
      summary: 'Generate and optimize SQL queries for PostgreSQL',
      category: 'DATA' as const,
      visibility: 'DEPARTMENT' as const,
      tags: ['sql', 'postgresql', 'database', 'query'],
      ownerId: publisher.id,
    },
    {
      name: 'Security Scanner',
      slug: 'security-scanner',
      summary: 'Automated security scanning for codebases and dependencies',
      category: 'SECURITY' as const,
      visibility: 'PRIVATE' as const,
      tags: ['security', 'scanning', 'cve', 'dependencies'],
      ownerId: admin.id,
    },
    {
      name: 'Web Search',
      slug: 'web-search',
      summary: 'Search the web using multiple search engines with structured results',
      category: 'SEARCH' as const,
      visibility: 'PUBLIC' as const,
      tags: ['search', 'web', 'google', 'bing'],
      ownerId: publisher.id,
    },
  ];

  for (const skillData of sampleSkills) {
    const skill = await prisma.skill.upsert({
      where: { slug: skillData.slug },
      update: {},
      create: skillData,
    });
    console.log(`✅ Skill created: ${skill.name} (${skill.slug})`);
  }

  // 5. Create default ReviewPolicy
  const defaultPolicy = await prisma.reviewPolicy.create({
    data: {
      name: 'Default Review Policy',
      autoApprove: false,
      requiredReviews: 1,
      timeoutHours: 72,
      isActive: true,
    },
  });
  console.log(`✅ Default ReviewPolicy created: ${defaultPolicy.name}`);

  // 6. Create auto-approve policy for GENERAL skills
  const generalAutoPolicy = await prisma.reviewPolicy.create({
    data: {
      name: 'Auto-Approve General Skills',
      category: 'GENERAL',
      autoApprove: true,
      requiredReviews: 0,
      timeoutHours: 24,
      isActive: true,
    },
  });
  console.log(`✅ General auto-approve policy created: ${generalAutoPolicy.name}`);

  // 7. Create security-focused review policy
  const securityPolicy = await prisma.reviewPolicy.create({
    data: {
      name: 'Security Skills Review',
      category: 'SECURITY',
      autoApprove: false,
      requiredReviews: 2,
      timeoutHours: 48,
      isActive: true,
    },
  });
  console.log(`✅ Security review policy created: ${securityPolicy.name}`);

  console.log('\n🎉 Seeding complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
