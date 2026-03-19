/**
 * Quality Rule: Assess code/documentation quality with a 0-100 score.
 * Based on file count, documentation presence, code size, and comment ratio.
 */

export interface QualityMetrics {
  score: number;
  fileCount: number;
  totalSize: number;
  totalCodeLines: number;
  commentLines: number;
  commentRatio: number;
  hasSkillMd: boolean;
  hasReadme: boolean;
  hasLicense: boolean;
}

export function assessQuality(
  files: Array<{ fileName: string; fileSize: number }>,
  codeContent: string,
): QualityMetrics {
  const fileCount = files.length;
  const totalSize = files.reduce((sum, f) => sum + f.fileSize, 0);

  const hasSkillMd = files.some((f) => f.fileName === 'SKILL.md');
  const hasReadme = files.some((f) => f.fileName.toUpperCase().startsWith('README'));
  const hasLicense = files.some((f) => f.fileName.toUpperCase().startsWith('LICENSE'));

  // Comment analysis
  const lines = codeContent.split('\n');
  const totalCodeLines = lines.filter((l) => l.trim().length > 0).length;
  const commentLines = lines.filter(
    (l) =>
      l.trim().startsWith('//') ||
      l.trim().startsWith('#') ||
      l.trim().startsWith('*') ||
      l.trim().startsWith('/*'),
  ).length;
  const commentRatio = totalCodeLines > 0 ? commentLines / totalCodeLines : 0;

  // Scoring algorithm (0-100)
  let score = 0;

  // Documentation (40 pts max)
  if (hasSkillMd) score += 20;
  if (hasReadme) score += 10;
  if (hasLicense) score += 10;

  // Completeness (20 pts max)
  score += Math.min(fileCount * 3, 20);

  // Size appropriateness (15 pts max)
  if (totalSize > 500) score += 5;
  if (totalSize > 2000) score += 5;
  if (totalSize > 5000) score += 5;

  // Comments (15 pts max)
  score += Math.min(Math.round(commentRatio * 50), 15);

  // Code exists (10 pts max)
  if (codeContent.length > 0) score += 5;
  if (codeContent.length > 100) score += 5;

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    fileCount,
    totalSize,
    totalCodeLines,
    commentLines,
    commentRatio: Math.round(commentRatio * 100) / 100,
    hasSkillMd,
    hasReadme,
    hasLicense,
  };
}
