import * as semver from 'semver';

export interface VersionResolution {
  skillName: string;
  versionRange: string;
  currentVersion: string | null;
  newVersion: string | null;
  action: 'update' | 'no-change' | 'major-blocked' | 'no-match';
}

/**
 * Resolves SemVer version ranges and determines update actions.
 */
export class SemverResolver {
  /**
   * Check if a version satisfies a range (^, ~, exact).
   */
  static satisfies(version: string, range: string): boolean {
    return semver.satisfies(version, range);
  }

  /**
   * Find the highest version from a list that satisfies a range.
   */
  static maxSatisfying(versions: string[], range: string): string | null {
    return semver.maxSatisfying(versions, range);
  }

  /**
   * Check if a version is a major bump from another.
   */
  static isMajorBump(from: string, to: string): boolean {
    const fromParsed = semver.parse(from);
    const toParsed = semver.parse(to);
    if (!fromParsed || !toParsed) return false;
    return toParsed.major > fromParsed.major;
  }

  /**
   * Resolve the best version for a skill dependency.
   *
   * @param versionRange - e.g. "^1.2.0", "~1.2.0", "1.2.0"
   * @param availableVersions - sorted list of all published versions
   * @param currentResolved - current resolved version (from lock)
   * @returns Resolution result
   */
  static resolve(
    skillName: string,
    versionRange: string,
    availableVersions: string[],
    currentResolved: string | null,
  ): VersionResolution {
    // Validate the range
    if (!semver.validRange(versionRange)) {
      return {
        skillName,
        versionRange,
        currentVersion: currentResolved,
        newVersion: null,
        action: 'no-match',
      };
    }

    // Find the best matching version
    const bestVersion = SemverResolver.maxSatisfying(availableVersions, versionRange);

    if (!bestVersion) {
      return {
        skillName,
        versionRange,
        currentVersion: currentResolved,
        newVersion: null,
        action: 'no-match',
      };
    }

    if (!currentResolved) {
      // First resolution
      return {
        skillName,
        versionRange,
        currentVersion: null,
        newVersion: bestVersion,
        action: 'update',
      };
    }

    if (bestVersion === currentResolved) {
      return {
        skillName,
        versionRange,
        currentVersion: currentResolved,
        newVersion: bestVersion,
        action: 'no-change',
      };
    }

    // Check for major bump
    if (SemverResolver.isMajorBump(currentResolved, bestVersion)) {
      return {
        skillName,
        versionRange,
        currentVersion: currentResolved,
        newVersion: bestVersion,
        action: 'major-blocked',
      };
    }

    return {
      skillName,
      versionRange,
      currentVersion: currentResolved,
      newVersion: bestVersion,
      action: 'update',
    };
  }

  /**
   * Batch resolve multiple skill dependencies.
   */
  static resolveAll(
    dependencies: Array<{ skillName: string; versionRange: string; currentResolved: string | null }>,
    availableVersionsMap: Record<string, string[]>,
  ): VersionResolution[] {
    return dependencies.map((dep) =>
      SemverResolver.resolve(
        dep.skillName,
        dep.versionRange,
        availableVersionsMap[dep.skillName] || [],
        dep.currentResolved,
      ),
    );
  }
}
