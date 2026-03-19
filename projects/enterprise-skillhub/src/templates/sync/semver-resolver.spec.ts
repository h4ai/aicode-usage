import { SemverResolver } from './semver-resolver';

describe('SemverResolver', () => {
  // ==========================================================
  // SATISFIES
  // ==========================================================
  describe('satisfies', () => {
    it('should match caret range (^1.2.0)', () => {
      expect(SemverResolver.satisfies('1.2.0', '^1.2.0')).toBe(true);
      expect(SemverResolver.satisfies('1.3.0', '^1.2.0')).toBe(true);
      expect(SemverResolver.satisfies('1.9.9', '^1.2.0')).toBe(true);
      expect(SemverResolver.satisfies('2.0.0', '^1.2.0')).toBe(false);
      expect(SemverResolver.satisfies('1.1.0', '^1.2.0')).toBe(false);
    });

    it('should match tilde range (~1.2.0)', () => {
      expect(SemverResolver.satisfies('1.2.0', '~1.2.0')).toBe(true);
      expect(SemverResolver.satisfies('1.2.9', '~1.2.0')).toBe(true);
      expect(SemverResolver.satisfies('1.3.0', '~1.2.0')).toBe(false);
    });

    it('should match exact version', () => {
      expect(SemverResolver.satisfies('1.2.0', '1.2.0')).toBe(true);
      expect(SemverResolver.satisfies('1.2.1', '1.2.0')).toBe(false);
    });

    it('should match wildcard ranges', () => {
      expect(SemverResolver.satisfies('1.0.0', '>=1.0.0 <2.0.0')).toBe(true);
      expect(SemverResolver.satisfies('1.9.9', '>=1.0.0 <2.0.0')).toBe(true);
      expect(SemverResolver.satisfies('2.0.0', '>=1.0.0 <2.0.0')).toBe(false);
    });
  });

  // ==========================================================
  // MAX SATISFYING
  // ==========================================================
  describe('maxSatisfying', () => {
    const versions = ['1.0.0', '1.1.0', '1.2.0', '1.2.1', '1.3.0', '2.0.0', '2.1.0'];

    it('should find highest version matching caret range', () => {
      expect(SemverResolver.maxSatisfying(versions, '^1.2.0')).toBe('1.3.0');
    });

    it('should find highest version matching tilde range', () => {
      expect(SemverResolver.maxSatisfying(versions, '~1.2.0')).toBe('1.2.1');
    });

    it('should find exact version', () => {
      expect(SemverResolver.maxSatisfying(versions, '1.1.0')).toBe('1.1.0');
    });

    it('should return null when no match', () => {
      expect(SemverResolver.maxSatisfying(versions, '^3.0.0')).toBeNull();
    });
  });

  // ==========================================================
  // IS MAJOR BUMP
  // ==========================================================
  describe('isMajorBump', () => {
    it('should detect major version bump', () => {
      expect(SemverResolver.isMajorBump('1.0.0', '2.0.0')).toBe(true);
      expect(SemverResolver.isMajorBump('1.9.9', '2.0.0')).toBe(true);
    });

    it('should not flag minor/patch as major bump', () => {
      expect(SemverResolver.isMajorBump('1.0.0', '1.1.0')).toBe(false);
      expect(SemverResolver.isMajorBump('1.0.0', '1.0.1')).toBe(false);
    });

    it('should handle invalid versions', () => {
      expect(SemverResolver.isMajorBump('invalid', '2.0.0')).toBe(false);
    });
  });

  // ==========================================================
  // RESOLVE
  // ==========================================================
  describe('resolve', () => {
    const versions = ['1.0.0', '1.1.0', '1.2.0', '2.0.0'];

    it('should update when new version satisfies range', () => {
      const result = SemverResolver.resolve('skill-a', '^1.0.0', versions, '1.0.0');

      expect(result.action).toBe('update');
      expect(result.newVersion).toBe('1.2.0');
      expect(result.currentVersion).toBe('1.0.0');
    });

    it('should return no-change when already at best version', () => {
      const result = SemverResolver.resolve('skill-a', '^1.0.0', versions, '1.2.0');

      expect(result.action).toBe('no-change');
      expect(result.newVersion).toBe('1.2.0');
    });

    it('should block major bump even if range allows it', () => {
      // Range ^1.0.0 does NOT allow 2.0.0, so this tests with a broad range
      const result = SemverResolver.resolve('skill-a', '>=1.0.0', versions, '1.2.0');

      expect(result.action).toBe('major-blocked');
      expect(result.newVersion).toBe('2.0.0');
    });

    it('should return no-match when no versions satisfy range', () => {
      const result = SemverResolver.resolve('skill-a', '^3.0.0', versions, '1.0.0');

      expect(result.action).toBe('no-match');
      expect(result.newVersion).toBeNull();
    });

    it('should handle first resolution (no current version)', () => {
      const result = SemverResolver.resolve('skill-a', '^1.0.0', versions, null);

      expect(result.action).toBe('update');
      expect(result.newVersion).toBe('1.2.0');
      expect(result.currentVersion).toBeNull();
    });

    it('should handle invalid range', () => {
      const result = SemverResolver.resolve('skill-a', 'not-a-range', versions, '1.0.0');

      expect(result.action).toBe('no-match');
    });
  });

  // ==========================================================
  // RESOLVE ALL (batch)
  // ==========================================================
  describe('resolveAll', () => {
    it('should resolve multiple dependencies', () => {
      const deps = [
        { skillName: 'skill-a', versionRange: '^1.0.0', currentResolved: '1.0.0' },
        { skillName: 'skill-b', versionRange: '~2.0.0', currentResolved: '2.0.0' },
        { skillName: 'skill-c', versionRange: '^1.0.0', currentResolved: null },
      ];

      const available = {
        'skill-a': ['1.0.0', '1.1.0', '1.2.0'],
        'skill-b': ['2.0.0', '2.0.1'],
        'skill-c': ['1.0.0', '1.5.0', '2.0.0'],
      };

      const results = SemverResolver.resolveAll(deps, available);

      expect(results).toHaveLength(3);
      expect(results[0].action).toBe('update');
      expect(results[0].newVersion).toBe('1.2.0');
      expect(results[1].action).toBe('update');
      expect(results[1].newVersion).toBe('2.0.1');
      expect(results[2].action).toBe('update');
      expect(results[2].newVersion).toBe('1.5.0');
    });

    it('should handle missing skills in available versions', () => {
      const deps = [
        { skillName: 'nonexistent', versionRange: '^1.0.0', currentResolved: null },
      ];

      const results = SemverResolver.resolveAll(deps, {});

      expect(results[0].action).toBe('no-match');
    });
  });
});
