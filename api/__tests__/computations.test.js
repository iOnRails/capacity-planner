const CP = require('../../shared/computations');

const SM = CP.DEFAULT_SIZE_MAP; // { XS:0.5, S:1, M:2, L:3, XL:5, XXL:8, XXXL:13 }

// ═══════════════════════════════════════════════════════════
// sizeToSprints
// ═══════════════════════════════════════════════════════════
describe('sizeToSprints', () => {
  test('converts valid sizes', () => {
    expect(CP.sizeToSprints('XS', SM)).toBe(0.5);
    expect(CP.sizeToSprints('S', SM)).toBe(1);
    expect(CP.sizeToSprints('M', SM)).toBe(2);
    expect(CP.sizeToSprints('L', SM)).toBe(3);
    expect(CP.sizeToSprints('XL', SM)).toBe(5);
    expect(CP.sizeToSprints('XXL', SM)).toBe(8);
    expect(CP.sizeToSprints('XXXL', SM)).toBe(13);
  });

  test('returns 0 for empty/invalid sizes', () => {
    expect(CP.sizeToSprints('', SM)).toBe(0);
    expect(CP.sizeToSprints(null, SM)).toBe(0);
    expect(CP.sizeToSprints(undefined, SM)).toBe(0);
    expect(CP.sizeToSprints('nan', SM)).toBe(0);
    expect(CP.sizeToSprints('NaN', SM)).toBe(0);
    expect(CP.sizeToSprints('INVALID', SM)).toBe(0);
  });

  test('uses custom size map', () => {
    const custom = { S: 2, M: 4, L: 6 };
    expect(CP.sizeToSprints('S', custom)).toBe(2);
    expect(CP.sizeToSprints('M', custom)).toBe(4);
    expect(CP.sizeToSprints('XS', custom)).toBe(0); // not in custom map
  });

  test('falls back to DEFAULT_SIZE_MAP when no sizeMap provided', () => {
    expect(CP.sizeToSprints('M')).toBe(2);
    expect(CP.sizeToSprints('XL')).toBe(5);
  });
});

// ═══════════════════════════════════════════════════════════
// computeProjectSprints
// ═══════════════════════════════════════════════════════════
describe('computeProjectSprints', () => {
  test('computes per-discipline and total sprints', () => {
    const p = { backend: 'M', frontend: 'S', natives: 'XS', qa: 'L' };
    const result = CP.computeProjectSprints(p, SM);
    expect(result).toEqual({ backend: 2, frontend: 1, natives: 0.5, qa: 3, total: 6.5 });
  });

  test('handles project with no sizing', () => {
    const p = { backend: '', frontend: '', natives: '', qa: '' };
    const result = CP.computeProjectSprints(p, SM);
    expect(result).toEqual({ backend: 0, frontend: 0, natives: 0, qa: 0, total: 0 });
  });

  test('handles partial sizing', () => {
    const p = { backend: 'XL', frontend: '', natives: '', qa: 'S' };
    const result = CP.computeProjectSprints(p, SM);
    expect(result).toEqual({ backend: 5, frontend: 0, natives: 0, qa: 1, total: 6 });
  });

  test('handles undefined discipline fields', () => {
    const p = { backend: 'M' };
    const result = CP.computeProjectSprints(p, SM);
    expect(result.backend).toBe(2);
    expect(result.frontend).toBe(0);
    expect(result.total).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════
// computeEffectiveSprints
// ═══════════════════════════════════════════════════════════
describe('computeEffectiveSprints', () => {
  const project = { id: 1, backend: 'L', frontend: 'M', natives: 'S', qa: 'S' };
  // L=3, M=2, S=1, S=1, total=7

  test('returns full sprints when no splits', () => {
    const result = CP.computeEffectiveSprints(project, {}, SM);
    expect(result).toEqual({ backend: 3, frontend: 2, natives: 1, qa: 1, total: 7 });
  });

  test('returns full sprints when splits is null', () => {
    const result = CP.computeEffectiveSprints(project, null, SM);
    expect(result).toEqual({ backend: 3, frontend: 2, natives: 1, qa: 1, total: 7 });
  });

  test('subtracts single split correctly', () => {
    const splits = { 1: { 'gateway': { backend: 1, frontend: 0.5, natives: 0, qa: 0 } } };
    const result = CP.computeEffectiveSprints(project, splits, SM);
    expect(result).toEqual({ backend: 2, frontend: 1.5, natives: 1, qa: 1, total: 5.5 });
  });

  test('subtracts multiple splits across tracks', () => {
    const splits = {
      1: {
        'gateway': { backend: 1, frontend: 0, natives: 0, qa: 0 },
        'seo-aff': { backend: 0.5, frontend: 1, natives: 0, qa: 0.5 },
      }
    };
    const result = CP.computeEffectiveSprints(project, splits, SM);
    expect(result).toEqual({ backend: 1.5, frontend: 1, natives: 1, qa: 0.5, total: 4 });
  });

  test('clamps to zero when splits exceed project sizing', () => {
    const splits = { 1: { 'gateway': { backend: 10, frontend: 10, natives: 10, qa: 10 } } };
    const result = CP.computeEffectiveSprints(project, splits, SM);
    expect(result.backend).toBe(0);
    expect(result.frontend).toBe(0);
    expect(result.natives).toBe(0);
    expect(result.qa).toBe(0);
    expect(result.total).toBe(0);
  });

  test('ignores splits for other projects', () => {
    const splits = { 99: { 'gateway': { backend: 5, frontend: 5, natives: 5, qa: 5 } } };
    const result = CP.computeEffectiveSprints(project, splits, SM);
    expect(result.total).toBe(7);
  });

  test('handles malformed split data gracefully', () => {
    const splits = { 1: { 'gateway': null } };
    const result = CP.computeEffectiveSprints(project, splits, SM);
    expect(result.total).toBe(7); // null sizing is skipped
  });
});

// ═══════════════════════════════════════════════════════════
// migrateTracks
// ═══════════════════════════════════════════════════════════
describe('migrateTracks', () => {
  test('renames gamification to gateway', () => {
    const result = CP.migrateTracks({ gamification: [1, 2], 'core-bonus': [3] });
    expect(result.gateway).toEqual([1, 2]);
    expect(result.gamification).toBeUndefined();
    expect(result['core-bonus']).toEqual([3]);
    expect(result['seo-aff']).toEqual([]);
  });

  test('does not rename if gateway already exists', () => {
    const result = CP.migrateTracks({ gamification: [1], gateway: [2] });
    expect(result.gamification).toEqual([1]); // kept as-is
    expect(result.gateway).toEqual([2]);
  });

  test('adds missing track keys with empty arrays', () => {
    const result = CP.migrateTracks({});
    expect(result['core-bonus']).toEqual([]);
    expect(result['gateway']).toEqual([]);
    expect(result['seo-aff']).toEqual([]);
  });

  test('preserves existing data', () => {
    const input = { 'core-bonus': [1, 2], gateway: [3], 'seo-aff': [4, 5] };
    const result = CP.migrateTracks(input);
    expect(result).toEqual(input);
  });

  test('does not mutate input', () => {
    const input = { gamification: [1] };
    CP.migrateTracks(input);
    expect(input.gamification).toEqual([1]); // unchanged
  });
});

// ═══════════════════════════════════════════════════════════
// migrateTrackCapacity
// ═══════════════════════════════════════════════════════════
describe('migrateTrackCapacity', () => {
  const ZERO = { backend: 0, frontend: 0, natives: 0, qa: 0 };

  test('adds missing keys with zero defaults', () => {
    const result = CP.migrateTrackCapacity({});
    expect(result['core-bonus']).toEqual(ZERO);
    expect(result['gateway']).toEqual(ZERO);
    expect(result['seo-aff']).toEqual(ZERO);
  });

  test('preserves existing values', () => {
    const input = { 'core-bonus': { backend: 10, frontend: 5, natives: 0, qa: 3 } };
    const result = CP.migrateTrackCapacity(input);
    expect(result['core-bonus']).toEqual({ backend: 10, frontend: 5, natives: 0, qa: 3 });
    expect(result['gateway']).toEqual(ZERO);
  });

  test('handles null input', () => {
    const result = CP.migrateTrackCapacity(null);
    expect(result['core-bonus']).toEqual(ZERO);
  });

  test('handles undefined input', () => {
    const result = CP.migrateTrackCapacity(undefined);
    expect(result['core-bonus']).toEqual(ZERO);
  });

  test('deep clones input (no mutation)', () => {
    const input = { 'core-bonus': { backend: 10, frontend: 0, natives: 0, qa: 0 } };
    const result = CP.migrateTrackCapacity(input);
    result['core-bonus'].backend = 99;
    expect(input['core-bonus'].backend).toBe(10); // original unchanged
  });
});

// ═══════════════════════════════════════════════════════════
// generateTrackKey
// ═══════════════════════════════════════════════════════════
describe('generateTrackKey', () => {
  test('converts label to slug', () => {
    expect(CP.generateTrackKey('Core Bonus')).toBe('core-bonus');
    expect(CP.generateTrackKey('SEO & AFF')).toBe('seo-aff');
    expect(CP.generateTrackKey('My New Track')).toBe('my-new-track');
  });

  test('handles special characters', () => {
    expect(CP.generateTrackKey('Track #1!')).toBe('track-1');
  });

  test('trims leading/trailing hyphens', () => {
    expect(CP.generateTrackKey('---Test---')).toBe('test');
  });

  test('handles single word', () => {
    expect(CP.generateTrackKey('Gateway')).toBe('gateway');
  });

  test('collapses multiple separators', () => {
    expect(CP.generateTrackKey('A   &   B')).toBe('a-b');
  });
});

// ═══════════════════════════════════════════════════════════
// DEFAULT_TRACK_CONFIG
// ═══════════════════════════════════════════════════════════
describe('DEFAULT_TRACK_CONFIG', () => {
  test('has 3 default tracks', () => {
    expect(CP.DEFAULT_TRACK_CONFIG).toHaveLength(3);
    expect(CP.DEFAULT_TRACK_CONFIG.map(t => t.key)).toEqual(['core-bonus', 'gateway', 'seo-aff']);
  });

  test('each track has key, label, and color', () => {
    for (const t of CP.DEFAULT_TRACK_CONFIG) {
      expect(t).toHaveProperty('key');
      expect(t).toHaveProperty('label');
      expect(t).toHaveProperty('color');
      expect(t.color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

// ═══════════════════════════════════════════════════════════
// migrateTracks with custom trackConfig
// ═══════════════════════════════════════════════════════════
describe('migrateTracks with custom trackConfig', () => {
  test('ensures only configured track keys exist', () => {
    const config = [
      { key: 'alpha', label: 'Alpha', color: '#ff0000' },
      { key: 'beta', label: 'Beta', color: '#00ff00' },
    ];
    const result = CP.migrateTracks({}, config);
    expect(result.alpha).toEqual([]);
    expect(result.beta).toEqual([]);
    expect(result['core-bonus']).toBeUndefined();
    expect(result['gateway']).toBeUndefined();
    expect(result['seo-aff']).toBeUndefined();
  });

  test('preserves existing data for configured keys', () => {
    const config = [{ key: 'team-a', label: 'Team A', color: '#ff0000' }];
    const result = CP.migrateTracks({ 'team-a': [1, 2] }, config);
    expect(result['team-a']).toEqual([1, 2]);
  });

  test('still applies gamification migration', () => {
    const config = [
      { key: 'gateway', label: 'Gateway', color: '#e84393' },
    ];
    const result = CP.migrateTracks({ gamification: [5] }, config);
    expect(result.gateway).toEqual([5]);
    expect(result.gamification).toBeUndefined();
  });

  test('falls back to TRACK_KEYS when trackConfig is undefined', () => {
    const result = CP.migrateTracks({}, undefined);
    expect(result['core-bonus']).toEqual([]);
    expect(result['gateway']).toEqual([]);
    expect(result['seo-aff']).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════
// migrateTrackCapacity with custom trackConfig
// ═══════════════════════════════════════════════════════════
describe('migrateTrackCapacity with custom trackConfig', () => {
  const ZERO = { backend: 0, frontend: 0, natives: 0, qa: 0 };

  test('ensures only configured track keys exist', () => {
    const config = [
      { key: 'alpha', label: 'Alpha', color: '#ff0000' },
      { key: 'beta', label: 'Beta', color: '#00ff00' },
    ];
    const result = CP.migrateTrackCapacity({}, config);
    expect(result.alpha).toEqual(ZERO);
    expect(result.beta).toEqual(ZERO);
    expect(result['core-bonus']).toBeUndefined();
  });

  test('preserves existing capacity for configured keys', () => {
    const config = [{ key: 'team-a', label: 'Team A', color: '#ff0000' }];
    const result = CP.migrateTrackCapacity({ 'team-a': { backend: 10, frontend: 5, natives: 0, qa: 3 } }, config);
    expect(result['team-a']).toEqual({ backend: 10, frontend: 5, natives: 0, qa: 3 });
  });

  test('falls back to TRACK_KEYS when trackConfig is undefined', () => {
    const result = CP.migrateTrackCapacity({}, undefined);
    expect(result['core-bonus']).toEqual(ZERO);
    expect(result['gateway']).toEqual(ZERO);
    expect(result['seo-aff']).toEqual(ZERO);
  });
});

// ═══════════════════════════════════════════════════════════
// removeFromTracks
// ═══════════════════════════════════════════════════════════
describe('removeFromTracks', () => {
  test('removes id from all tracks', () => {
    const tracks = { 'core-bonus': [1, 2, 3], gateway: [2, 4], 'seo-aff': [5] };
    const result = CP.removeFromTracks(tracks, 2);
    expect(result['core-bonus']).toEqual([1, 3]);
    expect(result.gateway).toEqual([4]);
    expect(result['seo-aff']).toEqual([5]);
  });

  test('returns unchanged tracks when id not found', () => {
    const tracks = { 'core-bonus': [1], gateway: [2] };
    const result = CP.removeFromTracks(tracks, 99);
    expect(result).toEqual(tracks);
  });

  test('handles empty tracks', () => {
    const result = CP.removeFromTracks({ 'core-bonus': [], gateway: [] }, 1);
    expect(result).toEqual({ 'core-bonus': [], gateway: [] });
  });
});

// ═══════════════════════════════════════════════════════════
// deepMergeObject
// ═══════════════════════════════════════════════════════════
describe('deepMergeObject', () => {
  test('user changes one key, server changes another — both preserved', () => {
    const captured = { a: 1, b: 2 };
    const local = { a: 1, b: 99 }; // user changed b
    const server = { a: 10, b: 2 }; // server changed a
    const { merged } = CP.deepMergeObject(local, server, captured);
    expect(merged).toEqual({ a: 10, b: 99 }); // server a + user b
  });

  test('user deletes a key — deletion is respected', () => {
    const captured = { a: 1, b: 2, c: 3 };
    const local = { a: 1, b: 2 }; // user deleted c
    const server = { a: 1, b: 2, c: 3 };
    const { merged, deleted } = CP.deepMergeObject(local, server, captured);
    expect(merged.c).toBeUndefined();
    expect(deleted).toContain('c');
  });

  test('server adds new key after client loaded — key included', () => {
    const captured = { a: 1 };
    const local = { a: 1 };
    const server = { a: 1, newKey: 42 }; // server added newKey
    const { merged, overlaid } = CP.deepMergeObject(local, server, captured);
    expect(merged.newKey).toBe(42);
    expect(overlaid).toContain('+newKey');
  });

  test('both user and server change the same key — user wins', () => {
    const captured = { a: 1 };
    const local = { a: 'user-value' };
    const server = { a: 'server-value' };
    const { merged } = CP.deepMergeObject(local, server, captured);
    expect(merged.a).toBe('user-value');
  });

  test('user did not change a key but server updated it — server wins', () => {
    const captured = { a: 1, b: 2 };
    const local = { a: 1, b: 2 }; // user changed nothing
    const server = { a: 1, b: 99 }; // server changed b
    const { merged } = CP.deepMergeObject(local, server, captured);
    expect(merged.b).toBe(99);
  });

  test('returns localValue directly for arrays', () => {
    const result = CP.deepMergeObject([1, 2, 3], [4, 5], [1, 2]);
    expect(result).toEqual([1, 2, 3]); // no merge for arrays
  });

  test('returns localValue directly for primitives', () => {
    expect(CP.deepMergeObject(42, 99, 42)).toBe(42);
    expect(CP.deepMergeObject('hello', 'world', 'hello')).toBe('hello');
  });

  test('returns localValue when latestServer is null', () => {
    const local = { a: 1 };
    const result = CP.deepMergeObject(local, null, null);
    expect(result).toEqual({ a: 1 });
  });

  test('uses latestServer as capturedServer when capturedServer is null', () => {
    const local = { a: 99 }; // user changed a, and deleted b
    const server = { a: 1, b: 2 };
    const { merged, deleted } = CP.deepMergeObject(local, server, null);
    // capturedServer = latestServer, so user "changed" a from 1 to 99
    // b exists in capturedServer (=server) but NOT in local → user deleted it
    expect(merged.a).toBe(99);
    expect(merged.b).toBeUndefined(); // user deletion respected
    expect(deleted).toContain('b');
  });

  test('complex scenario: add, delete, change, and untouched keys', () => {
    const captured = { keep: 'old', change: 'old', remove: 'old', untouched: 'same' };
    const local = { keep: 'old', change: 'new', untouched: 'same' }; // removed 'remove', changed 'change'
    const server = { keep: 'old', change: 'old', remove: 'old', untouched: 'updated', added: 'new' };
    const { merged, overlaid, deleted } = CP.deepMergeObject(local, server, captured);
    expect(merged.keep).toBe('old');         // neither changed
    expect(merged.change).toBe('new');       // user wins
    expect(merged.untouched).toBe('updated');// server wins (user didn't touch)
    expect(merged.added).toBe('new');        // server added
    expect(merged.remove).toBeUndefined();   // user deleted
    expect(overlaid).toContain('+added');
    expect(deleted).toContain('remove');
  });

  test('nested object values use deep equality', () => {
    const captured = { track: { a: [1, 2], b: [3] } };
    const local = { track: { a: [1, 2], b: [3, 4] } }; // user changed b
    const server = { track: { a: [1, 2, 9], b: [3] } }; // server changed a
    // Note: this merges at the sub-key level of the top object
    // 'track' key — both changed it, so user wins for the whole 'track' sub-key
    // Actually, deepMergeObject operates on the TOP level keys only
    const { merged } = CP.deepMergeObject(local, server, captured);
    // local.track !== captured.track (user changed it), so user's version kept
    expect(merged.track).toEqual({ a: [1, 2], b: [3, 4] });
  });
});

// ═══════════════════════════════════════════════════════════
// computeBuffered
// ═══════════════════════════════════════════════════════════
describe('computeBuffered', () => {
  test('applies buffer percentage correctly', () => {
    const values = { backend: 10, frontend: 20, natives: 0, qa: 5 };
    const buffer = { backend: 10, frontend: 20, natives: 0, qa: 50 };
    const result = CP.computeBuffered(values, buffer);
    expect(result.backend).toBe(11);     // 10 * 1.10 = 11
    expect(result.frontend).toBe(24);    // 20 * 1.20 = 24
    expect(result.natives).toBe(0);      // 0 * 1.00 = 0
    expect(result.qa).toBe(7.5);         // 5 * 1.50 = 7.5
  });

  test('handles zero buffer', () => {
    const values = { backend: 10, frontend: 20, natives: 15, qa: 5 };
    const buffer = { backend: 0, frontend: 0, natives: 0, qa: 0 };
    const result = CP.computeBuffered(values, buffer);
    expect(result).toEqual(values);
  });

  test('rounds to 1 decimal place', () => {
    const values = { backend: 7, frontend: 0, natives: 0, qa: 0 };
    const buffer = { backend: 33, frontend: 0, natives: 0, qa: 0 };
    const result = CP.computeBuffered(values, buffer);
    expect(result.backend).toBe(9.3); // 7 * 1.33 = 9.31 → rounded to 9.3
  });

  test('handles missing buffer keys', () => {
    const values = { backend: 10, frontend: 20, natives: 0, qa: 0 };
    const buffer = {};
    const result = CP.computeBuffered(values, buffer);
    expect(result.backend).toBe(10); // no buffer = 0% = unchanged
  });
});

// ═══════════════════════════════════════════════════════════
// computeUsedCapacity
// ═══════════════════════════════════════════════════════════
describe('computeUsedCapacity', () => {
  const projects = [
    { id: 1, backend: 'M', frontend: 'S', natives: '', qa: '' },  // B:2 F:1
    { id: 2, backend: 'L', frontend: '', natives: 'S', qa: 'XS' },// B:3 N:1 Q:0.5
    { id: 3, backend: 'S', frontend: 'S', natives: 'S', qa: 'S' },// B:1 F:1 N:1 Q:1
  ];

  test('sums only roadmap projects', () => {
    const roadmapIds = new Set([1, 2]);
    const result = CP.computeUsedCapacity(projects, roadmapIds, SM);
    expect(result.backend).toBe(5);   // 2 + 3
    expect(result.frontend).toBe(1);  // 1 + 0
    expect(result.natives).toBe(1);   // 0 + 1
    expect(result.qa).toBe(0.5);      // 0 + 0.5
  });

  test('returns zeros when no roadmap projects', () => {
    const result = CP.computeUsedCapacity(projects, new Set(), SM);
    expect(result).toEqual({ backend: 0, frontend: 0, natives: 0, qa: 0 });
  });

  test('includes all projects when all are in roadmap', () => {
    const roadmapIds = new Set([1, 2, 3]);
    const result = CP.computeUsedCapacity(projects, roadmapIds, SM);
    expect(result.backend).toBe(6);   // 2 + 3 + 1
    expect(result.frontend).toBe(2);  // 1 + 0 + 1
  });
});

// ═══════════════════════════════════════════════════════════
// computeTotalDemand
// ═══════════════════════════════════════════════════════════
describe('computeTotalDemand', () => {
  test('sums all projects regardless of roadmap', () => {
    const projects = [
      { id: 1, backend: 'M', frontend: '', natives: '', qa: '' },
      { id: 2, backend: 'S', frontend: 'S', natives: '', qa: '' },
    ];
    const result = CP.computeTotalDemand(projects, SM);
    expect(result.backend).toBe(3);  // 2 + 1
    expect(result.frontend).toBe(1); // 0 + 1
  });

  test('returns zeros for empty projects', () => {
    expect(CP.computeTotalDemand([], SM)).toEqual({ backend: 0, frontend: 0, natives: 0, qa: 0 });
  });
});

// ═══════════════════════════════════════════════════════════
// computeUnallocated
// ═══════════════════════════════════════════════════════════
describe('computeUnallocated', () => {
  test('computes remaining capacity', () => {
    const capacity = { backend: 40, frontend: 30, natives: 25, qa: 20 };
    const trackCapacity = {
      'core-bonus': { backend: 15, frontend: 10, natives: 10, qa: 8 },
      'gateway': { backend: 10, frontend: 10, natives: 5, qa: 5 },
      'seo-aff': { backend: 5, frontend: 5, natives: 5, qa: 2 },
    };
    const result = CP.computeUnallocated(capacity, trackCapacity);
    expect(result.backend).toBe(10);    // 40 - 30
    expect(result.frontend).toBe(5);    // 30 - 25
    expect(result.natives).toBe(5);     // 25 - 20
    expect(result.qa).toBe(5);          // 20 - 15
  });

  test('returns negative when over-allocated', () => {
    const capacity = { backend: 10, frontend: 0, natives: 0, qa: 0 };
    const trackCapacity = {
      'core-bonus': { backend: 8, frontend: 0, natives: 0, qa: 0 },
      'gateway': { backend: 5, frontend: 0, natives: 0, qa: 0 },
    };
    const result = CP.computeUnallocated(capacity, trackCapacity);
    expect(result.backend).toBe(-3); // 10 - 13
  });

  test('handles empty track capacity', () => {
    const capacity = { backend: 40, frontend: 30, natives: 25, qa: 20 };
    const result = CP.computeUnallocated(capacity, {});
    expect(result).toEqual(capacity);
  });
});

// ═══════════════════════════════════════════════════════════
// computeGhostsByTrack
// ═══════════════════════════════════════════════════════════
describe('computeGhostsByTrack', () => {
  const projects = [
    { id: 1, subTask: 'Project A', backend: 'L', frontend: 'M', natives: 'S', qa: 'S' },
    { id: 2, subTask: 'Project B', backend: 'M', frontend: 'S', natives: '', qa: '' },
  ];
  const projectById = { 1: projects[0], 2: projects[1] };
  const tracks = { 'core-bonus': [1], gateway: [2], 'seo-aff': [] };

  test('creates ghost blocks from splits', () => {
    const splits = {
      1: { 'gateway': { backend: 1, frontend: 0, natives: 0, qa: 0 } },
    };
    const result = CP.computeGhostsByTrack(splits, projectById, tracks);
    expect(result['gateway']).toHaveLength(1);
    expect(result['gateway'][0].project.id).toBe(1);
    expect(result['gateway'][0].sizing.backend).toBe(1);
    expect(result['gateway'][0].homeTrack).toBe('core-bonus');
    expect(result['core-bonus']).toHaveLength(0);
  });

  test('handles multiple splits from different projects', () => {
    const splits = {
      1: { 'seo-aff': { backend: 1, frontend: 0, natives: 0, qa: 0 } },
      2: { 'seo-aff': { backend: 0, frontend: 1, natives: 0, qa: 0 } },
    };
    const result = CP.computeGhostsByTrack(splits, projectById, tracks);
    expect(result['seo-aff']).toHaveLength(2);
  });

  test('returns empty arrays for null/invalid splits', () => {
    expect(CP.computeGhostsByTrack(null, projectById, tracks)['core-bonus']).toEqual([]);
    expect(CP.computeGhostsByTrack([], projectById, tracks)['core-bonus']).toEqual([]);
    expect(CP.computeGhostsByTrack(undefined, projectById, tracks)['core-bonus']).toEqual([]);
  });

  test('skips splits for non-existent projects', () => {
    const splits = { 999: { 'gateway': { backend: 1, frontend: 0, natives: 0, qa: 0 } } };
    const result = CP.computeGhostsByTrack(splits, projectById, tracks);
    expect(result['gateway']).toHaveLength(0);
  });

  test('skips non-numeric project IDs', () => {
    const splits = { 'abc': { 'gateway': { backend: 1, frontend: 0, natives: 0, qa: 0 } } };
    const result = CP.computeGhostsByTrack(splits, projectById, tracks);
    expect(result['gateway']).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════
// computeTrackUsed
// ═══════════════════════════════════════════════════════════
describe('computeTrackUsed', () => {
  test('sums effective sprints for real projects', () => {
    const p1 = { id: 1, backend: 'M', frontend: 'S', natives: '', qa: '' }; // B:2 F:1
    const p2 = { id: 2, backend: 'S', frontend: '', natives: 'S', qa: '' }; // B:1 N:1
    const trackProjects = { 'core-bonus': [p1, p2], gateway: [], 'seo-aff': [] };
    const ghostsByTrack = { 'core-bonus': [], gateway: [], 'seo-aff': [] };
    const result = CP.computeTrackUsed(trackProjects, ghostsByTrack, {}, SM);
    expect(result['core-bonus'].backend).toBe(3);   // 2 + 1
    expect(result['core-bonus'].frontend).toBe(1);
    expect(result['core-bonus'].natives).toBe(1);
    expect(result['gateway'].backend).toBe(0);
  });

  test('includes ghost sizing in track used', () => {
    const trackProjects = { 'core-bonus': [], gateway: [], 'seo-aff': [] };
    const ghostsByTrack = {
      'core-bonus': [],
      gateway: [{ project: { id: 1 }, sizing: { backend: 2, frontend: 1, natives: 0, qa: 0 } }],
      'seo-aff': [],
    };
    const result = CP.computeTrackUsed(trackProjects, ghostsByTrack, {}, SM);
    expect(result['gateway'].backend).toBe(2);
    expect(result['gateway'].frontend).toBe(1);
  });

  test('combines real projects and ghosts', () => {
    const p1 = { id: 1, backend: 'M', frontend: '', natives: '', qa: '' }; // B:2
    const trackProjects = { 'core-bonus': [p1], gateway: [], 'seo-aff': [] };
    const ghostsByTrack = {
      'core-bonus': [{ project: { id: 2 }, sizing: { backend: 3, frontend: 0, natives: 0, qa: 0 } }],
      gateway: [],
      'seo-aff': [],
    };
    const result = CP.computeTrackUsed(trackProjects, ghostsByTrack, {}, SM);
    expect(result['core-bonus'].backend).toBe(5); // 2 real + 3 ghost
  });

  test('subtracts splits from real project effective sprints', () => {
    const p1 = { id: 1, backend: 'L', frontend: '', natives: '', qa: '' }; // B:3
    const trackProjects = { 'core-bonus': [p1], gateway: [], 'seo-aff': [] };
    const ghostsByTrack = { 'core-bonus': [], gateway: [], 'seo-aff': [] };
    const splits = { 1: { gateway: { backend: 1, frontend: 0, natives: 0, qa: 0 } } };
    const result = CP.computeTrackUsed(trackProjects, ghostsByTrack, splits, SM);
    expect(result['core-bonus'].backend).toBe(2); // 3 - 1 split
  });
});

// ═══════════════════════════════════════════════════════════
// computeTrackOverflow
// ═══════════════════════════════════════════════════════════
describe('computeTrackOverflow', () => {
  test('no overflow when within capacity', () => {
    const p1 = { id: 1, backend: 'S', frontend: '', natives: '', qa: '' }; // B:1
    const trackProjects = { 'core-bonus': [p1], gateway: [], 'seo-aff': [] };
    const trackCap = { 'core-bonus': { backend: 10, frontend: 0, natives: 0, qa: 0 }, gateway: { backend: 0, frontend: 0, natives: 0, qa: 0 }, 'seo-aff': { backend: 0, frontend: 0, natives: 0, qa: 0 } };
    const ghostsByTrack = { 'core-bonus': [], gateway: [], 'seo-aff': [] };
    const result = CP.computeTrackOverflow(trackProjects, trackCap, ghostsByTrack, {}, {}, SM);
    expect(result['core-bonus']).toEqual({});
  });

  test('detects overflow on specific discipline', () => {
    const p1 = { id: 1, backend: 'XL', frontend: '', natives: '', qa: '' }; // B:5
    const p2 = { id: 2, backend: 'XL', frontend: '', natives: '', qa: '' }; // B:5
    const trackProjects = { 'core-bonus': [p1, p2], gateway: [], 'seo-aff': [] };
    const trackCap = { 'core-bonus': { backend: 8, frontend: 0, natives: 0, qa: 0 }, gateway: { backend: 0, frontend: 0, natives: 0, qa: 0 }, 'seo-aff': { backend: 0, frontend: 0, natives: 0, qa: 0 } };
    const ghostsByTrack = { 'core-bonus': [], gateway: [], 'seo-aff': [] };
    const result = CP.computeTrackOverflow(trackProjects, trackCap, ghostsByTrack, {}, {}, SM);
    // p1 uses 5, p2 pushes to 10 which exceeds 8
    expect(result['core-bonus'][1]).toBeUndefined(); // p1 doesn't overflow
    expect(result['core-bonus'][2]).toEqual(['backend']); // p2 overflows
  });

  test('respects display order from trackBlockOrder', () => {
    const p1 = { id: 1, backend: 'XL', frontend: '', natives: '', qa: '' }; // B:5
    const p2 = { id: 2, backend: 'XL', frontend: '', natives: '', qa: '' }; // B:5
    const trackProjects = { 'core-bonus': [p1, p2], gateway: [], 'seo-aff': [] };
    const trackCap = { 'core-bonus': { backend: 8, frontend: 0, natives: 0, qa: 0 }, gateway: { backend: 0, frontend: 0, natives: 0, qa: 0 }, 'seo-aff': { backend: 0, frontend: 0, natives: 0, qa: 0 } };
    const ghostsByTrack = { 'core-bonus': [], gateway: [], 'seo-aff': [] };
    // Reverse order: p2 first, then p1
    const blockOrder = { 'core-bonus': ['2', '1'] };
    const result = CP.computeTrackOverflow(trackProjects, trackCap, ghostsByTrack, blockOrder, {}, SM);
    // Now p2 is first (5 ≤ 8, ok), p1 pushes to 10 > 8
    expect(result['core-bonus'][2]).toBeUndefined(); // p2 is first, fits
    expect(result['core-bonus'][1]).toEqual(['backend']); // p1 overflows
  });

  test('skips tracks with zero allocation', () => {
    const p1 = { id: 1, backend: 'XXXL', frontend: '', natives: '', qa: '' }; // B:13
    const trackProjects = { 'core-bonus': [p1], gateway: [], 'seo-aff': [] };
    const trackCap = { 'core-bonus': { backend: 0, frontend: 0, natives: 0, qa: 0 }, gateway: { backend: 0, frontend: 0, natives: 0, qa: 0 }, 'seo-aff': { backend: 0, frontend: 0, natives: 0, qa: 0 } };
    const ghostsByTrack = { 'core-bonus': [], gateway: [], 'seo-aff': [] };
    const result = CP.computeTrackOverflow(trackProjects, trackCap, ghostsByTrack, {}, {}, SM);
    expect(result['core-bonus']).toEqual({}); // no allocation = no overflow
  });

  test('ghost blocks contribute to overflow', () => {
    const trackProjects = { 'core-bonus': [], gateway: [], 'seo-aff': [] };
    const trackCap = { 'core-bonus': { backend: 5, frontend: 0, natives: 0, qa: 0 }, gateway: { backend: 0, frontend: 0, natives: 0, qa: 0 }, 'seo-aff': { backend: 0, frontend: 0, natives: 0, qa: 0 } };
    const ghostsByTrack = {
      'core-bonus': [{ project: { id: 10 }, sizing: { backend: 8, frontend: 0, natives: 0, qa: 0 } }],
      gateway: [],
      'seo-aff': [],
    };
    const result = CP.computeTrackOverflow(trackProjects, trackCap, ghostsByTrack, {}, {}, SM);
    expect(result['core-bonus']['ghost-10']).toEqual(['backend']);
  });

  test('overflow detected across multiple disciplines', () => {
    const p1 = { id: 1, backend: 'XL', frontend: 'XL', natives: '', qa: '' }; // B:5, F:5
    const trackProjects = { 'core-bonus': [p1], gateway: [], 'seo-aff': [] };
    const trackCap = { 'core-bonus': { backend: 3, frontend: 4, natives: 0, qa: 0 }, gateway: { backend: 0, frontend: 0, natives: 0, qa: 0 }, 'seo-aff': { backend: 0, frontend: 0, natives: 0, qa: 0 } };
    const ghostsByTrack = { 'core-bonus': [], gateway: [], 'seo-aff': [] };
    const result = CP.computeTrackOverflow(trackProjects, trackCap, ghostsByTrack, {}, {}, SM);
    expect(result['core-bonus'][1]).toEqual(['backend', 'frontend']);
  });
});

// ═══════════════════════════════════════════════════════════
// filterProjects
// ═══════════════════════════════════════════════════════════
describe('filterProjects', () => {
  const projects = [
    { id: 1, subTask: 'Marketplace CY', nvrd: 'PGR-100', masterEpic: 'Marketplace', pillar: 'Expansion', targetMarket: 'CY', targetKPI: 'Revenue', impact: 'L' },
    { id: 2, subTask: 'SEO Boost', nvrd: 'PGR-200', masterEpic: 'Growth', pillar: 'Acquisition', targetMarket: 'UK', targetKPI: 'Experience', impact: 'M' },
    { id: 3, subTask: 'Core Refactor', nvrd: 'PGR-300', masterEpic: 'Platform', pillar: 'Core Platform', targetMarket: 'GR', targetKPI: 'Efficiency', impact: 'XL' },
  ];
  const noFilters = { pillar: [], market: [], epic: [], kpi: [], impact: [] };

  test('returns all projects with no search or filters', () => {
    const result = CP.filterProjects(projects, '', noFilters);
    expect(result).toHaveLength(3);
  });

  test('filters by search on subTask', () => {
    const result = CP.filterProjects(projects, 'marketplace', noFilters);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  test('filters by search on nvrd', () => {
    const result = CP.filterProjects(projects, 'PGR-200', noFilters);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });

  test('filters by search on masterEpic', () => {
    const result = CP.filterProjects(projects, 'platform', noFilters);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(3);
  });

  test('search is case-insensitive', () => {
    expect(CP.filterProjects(projects, 'SEO', noFilters)).toHaveLength(1);
    expect(CP.filterProjects(projects, 'seo', noFilters)).toHaveLength(1);
  });

  test('filters by single pillar', () => {
    const result = CP.filterProjects(projects, '', { ...noFilters, pillar: ['Expansion'] });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  test('filters by multiple pillars (OR within same filter)', () => {
    const result = CP.filterProjects(projects, '', { ...noFilters, pillar: ['Expansion', 'Acquisition'] });
    expect(result).toHaveLength(2);
  });

  test('combines search and filters (AND)', () => {
    const result = CP.filterProjects(projects, 'marketplace', { ...noFilters, pillar: ['Expansion'] });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  test('returns empty when search + filter has no match', () => {
    const result = CP.filterProjects(projects, 'marketplace', { ...noFilters, pillar: ['Acquisition'] });
    expect(result).toHaveLength(0);
  });

  test('filters by market', () => {
    const result = CP.filterProjects(projects, '', { ...noFilters, market: ['UK'] });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });

  test('filters by impact', () => {
    const result = CP.filterProjects(projects, '', { ...noFilters, impact: ['L', 'XL'] });
    expect(result).toHaveLength(2);
  });

  test('multiple filter types are ANDed', () => {
    const result = CP.filterProjects(projects, '', { ...noFilters, pillar: ['Expansion'], market: ['UK'] });
    expect(result).toHaveLength(0); // Expansion is CY, not UK
  });
});

// ═══════════════════════════════════════════════════════════
// sortProjects
// ═══════════════════════════════════════════════════════════
describe('sortProjects', () => {
  const projects = [
    { id: 1, subTask: 'Zebra', masterEpic: 'Alpha', pillar: 'Expansion', impact: 'S', backend: 'M', frontend: '', natives: '', qa: '' },
    { id: 2, subTask: 'Apple', masterEpic: 'Charlie', pillar: 'Acquisition', impact: 'XL', backend: 'S', frontend: '', natives: '', qa: '' },
    { id: 3, subTask: 'Mango', masterEpic: 'Beta', pillar: 'Core Platform', impact: 'L', backend: 'XXL', frontend: '', natives: '', qa: '' },
  ];

  test('sorts by impact descending', () => {
    const result = CP.sortProjects(projects, 'impact', SM);
    expect(result.map(p => p.id)).toEqual([2, 3, 1]); // XL > L > S
  });

  test('sorts by effort descending', () => {
    const result = CP.sortProjects(projects, 'effort', SM);
    expect(result.map(p => p.id)).toEqual([3, 1, 2]); // XXL(8) > M(2) > S(1)
  });

  test('sorts by name ascending', () => {
    const result = CP.sortProjects(projects, 'name', SM);
    expect(result.map(p => p.id)).toEqual([2, 3, 1]); // Apple < Mango < Zebra
  });

  test('sorts by epic ascending', () => {
    const result = CP.sortProjects(projects, 'epic', SM);
    expect(result.map(p => p.id)).toEqual([1, 3, 2]); // Alpha < Beta < Charlie
  });

  test('sorts by pillar ascending', () => {
    const result = CP.sortProjects(projects, 'pillar', SM);
    expect(result.map(p => p.id)).toEqual([2, 3, 1]); // Acquisition < Core Platform < Expansion
  });

  test('unknown sort field returns original order', () => {
    const result = CP.sortProjects(projects, 'unknown', SM);
    expect(result.map(p => p.id)).toEqual([1, 2, 3]);
  });

  test('does not mutate original array', () => {
    const original = [...projects];
    CP.sortProjects(projects, 'impact', SM);
    expect(projects.map(p => p.id)).toEqual(original.map(p => p.id));
  });
});

// ═══════════════════════════════════════════════════════════
// getCapColor
// ═══════════════════════════════════════════════════════════
describe('getCapColor', () => {
  test('returns green for 0-70%', () => {
    expect(CP.getCapColor(0)).toBe('var(--green)');
    expect(CP.getCapColor(50)).toBe('var(--green)');
    expect(CP.getCapColor(70)).toBe('var(--green)');
  });

  test('returns yellow for 71-90%', () => {
    expect(CP.getCapColor(71)).toBe('var(--yellow)');
    expect(CP.getCapColor(80)).toBe('var(--yellow)');
    expect(CP.getCapColor(90)).toBe('var(--yellow)');
  });

  test('returns red for >90%', () => {
    expect(CP.getCapColor(91)).toBe('var(--red)');
    expect(CP.getCapColor(100)).toBe('var(--red)');
    expect(CP.getCapColor(150)).toBe('var(--red)');
  });
});

// ═══════════════════════════════════════════════════════════
// getBlockBg
// ═══════════════════════════════════════════════════════════
describe('getBlockBg', () => {
  test('returns gradient using pillarColorMap', () => {
    const map = { 'MyPillar': '#ff0000' };
    const result = CP.getBlockBg('MyPillar', map);
    expect(result).toContain('#ff0000');
    expect(result).toContain('linear-gradient');
  });

  test('falls back to palette first color for unknown pillar', () => {
    const result = CP.getBlockBg('Unknown', {});
    expect(result).toContain(CP.PILLAR_PALETTE[0]);
  });

  test('works without pillarColorMap (backward compat)', () => {
    const result = CP.getBlockBg('Anything');
    expect(result).toContain('linear-gradient');
  });
});

// ═══════════════════════════════════════════════════════════
// buildPillarColorMap
// ═══════════════════════════════════════════════════════════
describe('buildPillarColorMap', () => {
  test('returns empty map for empty projects', () => {
    expect(CP.buildPillarColorMap([])).toEqual({});
  });

  test('assigns colors alphabetically', () => {
    const projects = [
      { pillar: 'Zebra' },
      { pillar: 'Alpha' },
      { pillar: 'Middle' },
    ];
    const map = CP.buildPillarColorMap(projects);
    expect(Object.keys(map)).toEqual(['Alpha', 'Middle', 'Zebra']);
    expect(map['Alpha']).toBe(CP.PILLAR_PALETTE[0]);
    expect(map['Middle']).toBe(CP.PILLAR_PALETTE[1]);
    expect(map['Zebra']).toBe(CP.PILLAR_PALETTE[2]);
  });

  test('deduplicates pillar names', () => {
    const projects = [
      { pillar: 'Expansion' },
      { pillar: 'Expansion' },
      { pillar: 'Core' },
    ];
    const map = CP.buildPillarColorMap(projects);
    expect(Object.keys(map)).toHaveLength(2);
  });

  test('skips empty/null pillar values', () => {
    const projects = [
      { pillar: '' },
      { pillar: null },
      { pillar: 'Real' },
      {},
    ];
    const map = CP.buildPillarColorMap(projects);
    expect(Object.keys(map)).toEqual(['Real']);
  });

  test('wraps around palette for many pillars', () => {
    const projects = [];
    for (let i = 0; i < 20; i++) {
      projects.push({ pillar: `Pillar${String(i).padStart(2, '0')}` });
    }
    const map = CP.buildPillarColorMap(projects);
    expect(Object.keys(map)).toHaveLength(20);
    // Should wrap around the palette
    const paletteLen = CP.PILLAR_PALETTE.length;
    expect(map['Pillar00']).toBe(CP.PILLAR_PALETTE[0]);
    expect(map[`Pillar${String(paletteLen).padStart(2, '0')}`]).toBe(CP.PILLAR_PALETTE[0]);
  });

  test('stable ordering — same projects produce same map', () => {
    const projects = [
      { pillar: 'C' }, { pillar: 'A' }, { pillar: 'B' },
    ];
    const map1 = CP.buildPillarColorMap(projects);
    const map2 = CP.buildPillarColorMap([...projects].reverse());
    expect(map1).toEqual(map2);
  });
});

// ═══════════════════════════════════════════════════════════
// getProjectStatus
// ═══════════════════════════════════════════════════════════
describe('getProjectStatus', () => {
  test('returns status field when present', () => {
    expect(CP.getProjectStatus({ status: 'in_progress' })).toBe('in_progress');
    expect(CP.getProjectStatus({ status: 'paused' })).toBe('paused');
    expect(CP.getProjectStatus({ status: 'not_started' })).toBe('not_started');
  });

  test('falls back to inProgress boolean when no status field', () => {
    expect(CP.getProjectStatus({ inProgress: true })).toBe('in_progress');
    expect(CP.getProjectStatus({ inProgress: false })).toBe('not_started');
  });

  test('defaults to not_started for empty/missing fields', () => {
    expect(CP.getProjectStatus({})).toBe('not_started');
    expect(CP.getProjectStatus({ inProgress: undefined })).toBe('not_started');
  });

  test('status field takes precedence over inProgress boolean', () => {
    expect(CP.getProjectStatus({ status: 'paused', inProgress: true })).toBe('paused');
    expect(CP.getProjectStatus({ status: 'not_started', inProgress: true })).toBe('not_started');
  });

  test('handles null/undefined project gracefully', () => {
    expect(CP.getProjectStatus(null)).toBe('not_started');
    expect(CP.getProjectStatus(undefined)).toBe('not_started');
  });
});

// ═══════════════════════════════════════════════════════════
// getPercentComplete
// ═══════════════════════════════════════════════════════════
describe('getPercentComplete', () => {
  test('returns percentComplete when present', () => {
    expect(CP.getPercentComplete({ percentComplete: 75 })).toBe(75);
    expect(CP.getPercentComplete({ percentComplete: 0 })).toBe(0);
    expect(CP.getPercentComplete({ percentComplete: 100 })).toBe(100);
  });

  test('defaults to 0 when absent', () => {
    expect(CP.getPercentComplete({})).toBe(0);
    expect(CP.getPercentComplete({ percentComplete: undefined })).toBe(0);
  });

  test('defaults to 0 for non-number values', () => {
    expect(CP.getPercentComplete({ percentComplete: 'fifty' })).toBe(0);
    expect(CP.getPercentComplete({ percentComplete: null })).toBe(0);
  });

  test('handles null/undefined project gracefully', () => {
    expect(CP.getPercentComplete(null)).toBe(0);
    expect(CP.getPercentComplete(undefined)).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// getSplitStatus
// ═══════════════════════════════════════════════════════════
describe('getSplitStatus', () => {
  test('returns status when present', () => {
    const ss = { 1: { gateway: { status: 'in_progress', percentComplete: 50 } } };
    expect(CP.getSplitStatus(ss, 1, 'gateway')).toBe('in_progress');
  });

  test('returns not_started when splitStatuses is empty or missing', () => {
    expect(CP.getSplitStatus({}, 1, 'gateway')).toBe('not_started');
    expect(CP.getSplitStatus(null, 1, 'gateway')).toBe('not_started');
    expect(CP.getSplitStatus(undefined, 1, 'gateway')).toBe('not_started');
  });

  test('returns not_started when project has no split status', () => {
    const ss = { 2: { gateway: { status: 'paused', percentComplete: 30 } } };
    expect(CP.getSplitStatus(ss, 1, 'gateway')).toBe('not_started');
  });

  test('returns not_started when target track has no split status', () => {
    const ss = { 1: { 'core-bonus': { status: 'in_progress', percentComplete: 50 } } };
    expect(CP.getSplitStatus(ss, 1, 'gateway')).toBe('not_started');
  });

  test('returns not_started when status field is missing in entry', () => {
    const ss = { 1: { gateway: { percentComplete: 50 } } };
    expect(CP.getSplitStatus(ss, 1, 'gateway')).toBe('not_started');
  });
});

// ═══════════════════════════════════════════════════════════
// getSplitPercentComplete
// ═══════════════════════════════════════════════════════════
describe('getSplitPercentComplete', () => {
  test('returns percentComplete when present', () => {
    const ss = { 1: { gateway: { status: 'in_progress', percentComplete: 75 } } };
    expect(CP.getSplitPercentComplete(ss, 1, 'gateway')).toBe(75);
  });

  test('returns 0 when splitStatuses is empty or missing', () => {
    expect(CP.getSplitPercentComplete({}, 1, 'gateway')).toBe(0);
    expect(CP.getSplitPercentComplete(null, 1, 'gateway')).toBe(0);
    expect(CP.getSplitPercentComplete(undefined, 1, 'gateway')).toBe(0);
  });

  test('returns 0 when project has no split status', () => {
    expect(CP.getSplitPercentComplete({ 2: {} }, 1, 'gateway')).toBe(0);
  });

  test('returns 0 when percentComplete is not a number', () => {
    const ss = { 1: { gateway: { status: 'in_progress', percentComplete: 'fifty' } } };
    expect(CP.getSplitPercentComplete(ss, 1, 'gateway')).toBe(0);
  });

  test('returns 0 when percentComplete is missing', () => {
    const ss = { 1: { gateway: { status: 'in_progress' } } };
    expect(CP.getSplitPercentComplete(ss, 1, 'gateway')).toBe(0);
  });
});
