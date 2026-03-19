-- CreateExtension: pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum "UserRole"
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'PUBLISHER', 'REVIEWER', 'USER');

-- CreateEnum "SkillCategory"
CREATE TYPE "SkillCategory" AS ENUM ('GENERAL', 'DEVELOPMENT', 'DEVOPS', 'DATA', 'SECURITY', 'OFFICE', 'MULTIMEDIA', 'SEARCH', 'BROWSER', 'COMMUNICATION', 'CUSTOM');

-- CreateEnum "SkillVisibility"
CREATE TYPE "SkillVisibility" AS ENUM ('PUBLIC', 'DEPARTMENT', 'PRIVATE');

-- CreateEnum "ModerationStatus"
CREATE TYPE "ModerationStatus" AS ENUM ('ACTIVE', 'HIDDEN', 'REMOVED');

-- CreateEnum "ReviewStatus"
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING_AUTO', 'AUTO_REJECTED', 'PENDING_MANUAL', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'REVISION_REQUESTED');

-- CreateTable "User"
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "department" TEXT,
    "adGroups" JSONB,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable "Skill"
CREATE TABLE "Skill" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "summary" TEXT,
    "category" "SkillCategory" NOT NULL DEFAULT 'GENERAL',
    "visibility" "SkillVisibility" NOT NULL DEFAULT 'PUBLIC',
    "moderationStatus" "ModerationStatus" NOT NULL DEFAULT 'ACTIVE',
    "ownerId" TEXT NOT NULL,
    "latestVersionId" TEXT,
    "publishedVersionId" TEXT,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "installCount" INTEGER NOT NULL DEFAULT 0,
    "starCount" INTEGER NOT NULL DEFAULT 0,
    "badges" JSONB,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable "SkillVersion"
CREATE TABLE "SkillVersion" (
    "id" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "major" INTEGER NOT NULL,
    "minor" INTEGER NOT NULL,
    "patch" INTEGER NOT NULL,
    "changelog" TEXT,
    "readme" TEXT,
    "parsedMeta" JSONB,
    "tag" TEXT,
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'PENDING_AUTO',
    "embedding" vector(1024),
    "createdById" TEXT NOT NULL,
    "softDeletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SkillVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable "SkillFile"
CREATE TABLE "SkillFile" (
    "id" TEXT NOT NULL,
    "skillVersionId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT,
    "sha256" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkillFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable "SkillReview"
CREATE TABLE "SkillReview" (
    "id" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "submitterId" TEXT NOT NULL,
    "reviewerId" TEXT,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING_AUTO',
    "decision" TEXT,
    "comment" TEXT,
    "scanResult" JSONB,
    "reviewScore" INTEGER,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "autoScannedAt" TIMESTAMP(3),
    "assignedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SkillReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable "ReviewPolicy"
CREATE TABLE "ReviewPolicy" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "SkillCategory",
    "department" TEXT,
    "autoApprove" BOOLEAN NOT NULL DEFAULT false,
    "requiredReviews" INTEGER NOT NULL DEFAULT 1,
    "timeoutHours" INTEGER NOT NULL DEFAULT 72,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable "Star"
CREATE TABLE "Star" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Star_pkey" PRIMARY KEY ("id")
);

-- CreateTable "Comment"
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable "AuditLog"
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resource" TEXT,
    "detail" JSONB,
    "userId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable "SystemConfig"
CREATE TABLE "SystemConfig" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_department_idx" ON "User"("department");
CREATE INDEX "User_role_idx" ON "User"("role");

CREATE UNIQUE INDEX "Skill_slug_key" ON "Skill"("slug");
CREATE INDEX "Skill_category_idx" ON "Skill"("category");
CREATE INDEX "Skill_visibility_idx" ON "Skill"("visibility");
CREATE INDEX "Skill_ownerId_idx" ON "Skill"("ownerId");
CREATE INDEX "Skill_moderationStatus_idx" ON "Skill"("moderationStatus");
CREATE INDEX "Skill_slug_idx" ON "Skill"("slug");

CREATE UNIQUE INDEX "SkillVersion_skillId_version_key" ON "SkillVersion"("skillId", "version");
CREATE INDEX "SkillVersion_skillId_idx" ON "SkillVersion"("skillId");
CREATE INDEX "SkillVersion_reviewStatus_idx" ON "SkillVersion"("reviewStatus");
CREATE INDEX "SkillVersion_createdById_idx" ON "SkillVersion"("createdById");
CREATE INDEX "SkillVersion_major_minor_patch_idx" ON "SkillVersion"("major", "minor", "patch");

CREATE INDEX "SkillFile_skillVersionId_idx" ON "SkillFile"("skillVersionId");

CREATE INDEX "SkillReview_skillId_idx" ON "SkillReview"("skillId");
CREATE INDEX "SkillReview_versionId_idx" ON "SkillReview"("versionId");
CREATE INDEX "SkillReview_reviewerId_idx" ON "SkillReview"("reviewerId");
CREATE INDEX "SkillReview_status_idx" ON "SkillReview"("status");

CREATE UNIQUE INDEX "Star_userId_skillId_key" ON "Star"("userId", "skillId");
CREATE INDEX "Star_skillId_idx" ON "Star"("skillId");

CREATE INDEX "Comment_skillId_idx" ON "Comment"("skillId");
CREATE INDEX "Comment_userId_idx" ON "Comment"("userId");

CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

CREATE UNIQUE INDEX "SystemConfig_key_key" ON "SystemConfig"("key");

-- AddForeignKeys
ALTER TABLE "Skill" ADD CONSTRAINT "Skill_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SkillVersion" ADD CONSTRAINT "SkillVersion_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SkillVersion" ADD CONSTRAINT "SkillVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SkillFile" ADD CONSTRAINT "SkillFile_skillVersionId_fkey" FOREIGN KEY ("skillVersionId") REFERENCES "SkillVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SkillReview" ADD CONSTRAINT "SkillReview_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SkillReview" ADD CONSTRAINT "SkillReview_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "SkillVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SkillReview" ADD CONSTRAINT "SkillReview_submitterId_fkey" FOREIGN KEY ("submitterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SkillReview" ADD CONSTRAINT "SkillReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Star" ADD CONSTRAINT "Star_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Star" ADD CONSTRAINT "Star_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Comment" ADD CONSTRAINT "Comment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Comment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Create HNSW index for pgvector similarity search
CREATE INDEX "SkillVersion_embedding_idx" ON "SkillVersion" USING hnsw (embedding vector_cosine_ops);
