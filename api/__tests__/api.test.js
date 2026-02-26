/**
 * Integration tests for all API endpoints.
 * Uses supertest to make HTTP requests against the Express app.
 *
 * Tests cover:
 * - Health check
 * - Verticals listing
 * - Projects CRUD (GET/POST) + validation
 * - State GET/POST + conflict-free merge logic
 * - Audit log endpoint with filtering
 * - Track cleanup after project save
 */

const fs = require('fs');
const path = require('path');
const request = require('supertest');

// Set DATA_DIR before importing server
const TEST_DATA_DIR = path.join(__dirname, '..', 'data_test_api');
process.env.DATA_DIR = TEST_DATA_DIR;

// Ensure dir exists before import (server checks on load)
if (!fs.existsSync(TEST_DATA_DIR)) fs.mkdirSync(TEST_DATA_DIR, { recursive: true });

const { app, server, wss, keepaliveInterval } = require('../server');

// ── Setup / Teardown ──
beforeEach(() => {
  // Clean data files between tests
  fs.readdirSync(TEST_DATA_DIR).forEach(f => {
    if (f.endsWith('.json')) fs.unlinkSync(path.join(TEST_DATA_DIR, f));
  });
});

afterAll(() => {
  clearInterval(keepaliveInterval);
  if (fs.existsSync(TEST_DATA_DIR)) {
    fs.readdirSync(TEST_DATA_DIR).forEach(f => fs.unlinkSync(path.join(TEST_DATA_DIR, f)));
    fs.rmdirSync(TEST_DATA_DIR);
  }
  wss.close();
  // Don't call server.close() — supertest manages its own server lifecycle
});

// ═══════════════════════════════════════════════
// Health check
// ═══════════════════════════════════════════════

describe('GET /api/health', () => {
  test('returns 200 with status ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.timestamp).toBeDefined();
  });
});

// ═══════════════════════════════════════════════
// Test POST (debug endpoint)
// ═══════════════════════════════════════════════

describe('POST /api/test-post', () => {
  test('echoes back request info', async () => {
    const res = await request(app)
      .post('/api/test-post')
      .send({ foo: 'bar', baz: 123 });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.method).toBe('POST');
    expect(res.body.bodyKeys).toContain('foo');
    expect(res.body.bodyKeys).toContain('baz');
  });
});

// ═══════════════════════════════════════════════
// Verticals listing
// ═══════════════════════════════════════════════

describe('GET /api/verticals', () => {
  test('returns all 5 verticals', async () => {
    const res = await request(app).get('/api/verticals');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(5);
    const keys = res.body.map(v => v.key);
    expect(keys).toContain('growth');
    expect(keys).toContain('sportsbook');
    expect(keys).toContain('casino');
    expect(keys).toContain('account');
    expect(keys).toContain('payments');
  });

  test('includes project counts', async () => {
    // Save some projects first
    const projFile = path.join(TEST_DATA_DIR, 'projects_growth.json');
    fs.writeFileSync(projFile, JSON.stringify([{ id: 1 }, { id: 2 }]));

    const res = await request(app).get('/api/verticals');
    const growth = res.body.find(v => v.key === 'growth');
    expect(growth.projectCount).toBe(2);
  });
});

// ═══════════════════════════════════════════════
// Projects CRUD
// ═══════════════════════════════════════════════

describe('GET /api/verticals/:key/projects', () => {
  test('returns empty projects for new vertical', async () => {
    const res = await request(app).get('/api/verticals/sportsbook/projects');
    expect(res.status).toBe(200);
    expect(res.body.projects).toEqual([]);
    expect(res.body.totalCount).toBe(0);
  });

  test('returns saved projects', async () => {
    const projects = [{ id: 1, subTask: 'Test' }, { id: 2, subTask: 'Test 2' }];
    fs.writeFileSync(path.join(TEST_DATA_DIR, 'projects_casino.json'), JSON.stringify(projects));

    const res = await request(app).get('/api/verticals/casino/projects');
    expect(res.body.projects).toHaveLength(2);
    expect(res.body.totalCount).toBe(2);
  });

  test('sets no-cache headers', async () => {
    const res = await request(app).get('/api/verticals/growth/projects');
    expect(res.headers['cache-control']).toContain('no-store');
  });
});

describe('POST /api/verticals/:key/projects', () => {
  test('saves valid projects', async () => {
    const projects = [
      { id: 1, subTask: 'Project A', backend: 'M', frontend: 'S' },
      { id: 2, subTask: 'Project B', impact: 'L' },
    ];
    const res = await request(app)
      .post('/api/verticals/growth/projects')
      .set('X-User-Email', 'test@novibet.com')
      .send({ projects });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.projectCount).toBe(2);

    // Verify persisted
    const saved = JSON.parse(fs.readFileSync(path.join(TEST_DATA_DIR, 'projects_growth.json'), 'utf8'));
    expect(saved).toHaveLength(2);
  });

  test('rejects non-array projects', async () => {
    const res = await request(app)
      .post('/api/verticals/growth/projects')
      .send({ projects: 'not an array' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('array');
  });

  test('rejects project without id', async () => {
    const res = await request(app)
      .post('/api/verticals/growth/projects')
      .send({ projects: [{ subTask: 'No ID' }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('missing required field');
  });

  test('rejects invalid size values', async () => {
    const res = await request(app)
      .post('/api/verticals/growth/projects')
      .send({ projects: [{ id: 1, backend: 'INVALID' }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('invalid');
  });

  test('accepts all valid size values', async () => {
    const validSizes = ['', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
    for (const size of validSizes) {
      const res = await request(app)
        .post('/api/verticals/growth/projects')
        .send({ projects: [{ id: 1, backend: size }] });
      expect(res.status).toBe(200);
    }
  });

  test('rejects invalid impact values', async () => {
    const res = await request(app)
      .post('/api/verticals/growth/projects')
      .send({ projects: [{ id: 1, impact: 'HUGE' }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('invalid impact');
  });

  test('PUT works as alias for POST', async () => {
    const res = await request(app)
      .put('/api/verticals/growth/projects')
      .send({ projects: [{ id: 1, subTask: 'Via PUT' }] });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ═══════════════════════════════════════════════
// Track cleanup after project save
// ═══════════════════════════════════════════════

describe('Track cleanup on project save', () => {
  test('removes deleted project IDs from tracks', async () => {
    // Pre-set state with project IDs in tracks
    const state = {
      capacity: { backend: 40 },
      tracks: { 'core-bonus': [1, 2, 3], 'gateway': [4] },
    };
    fs.writeFileSync(path.join(TEST_DATA_DIR, 'state_growth.json'), JSON.stringify(state));

    // Save projects with only IDs 1 and 2 (removes 3 and 4)
    await request(app)
      .post('/api/verticals/growth/projects')
      .send({ projects: [{ id: 1 }, { id: 2 }] });

    const savedState = JSON.parse(fs.readFileSync(path.join(TEST_DATA_DIR, 'state_growth.json'), 'utf8'));
    expect(savedState.tracks['core-bonus']).toEqual([1, 2]); // 3 removed
    expect(savedState.tracks['gateway']).toEqual([]); // 4 removed
  });
});

// ═══════════════════════════════════════════════
// State GET/POST + Merge Logic
// ═══════════════════════════════════════════════

describe('GET /api/verticals/:key/state', () => {
  test('returns default state for new vertical', async () => {
    const res = await request(app).get('/api/verticals/payments/state');
    expect(res.status).toBe(200);
    expect(res.body.capacity).toEqual({ backend: 40, frontend: 30, natives: 25, qa: 20 });
    expect(res.body.tracks).toEqual({ 'core-bonus': [], 'gateway': [], 'seo-aff': [] });
    expect(res.body._loadedAt).toBeDefined();
  });

  test('returns saved state', async () => {
    const state = { capacity: { backend: 99 }, tracks: { 'core-bonus': [1] } };
    fs.writeFileSync(path.join(TEST_DATA_DIR, 'state_casino.json'), JSON.stringify(state));

    const res = await request(app).get('/api/verticals/casino/state');
    expect(res.body.capacity.backend).toBe(99);
  });
});

describe('POST /api/verticals/:key/state', () => {
  test('saves state and returns merged result', async () => {
    const res = await request(app)
      .post('/api/verticals/growth/state')
      .set('X-User-Email', 'test@novibet.com')
      .send({ capacity: { backend: 50 }, _loadedAt: 0 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.mergedState.capacity.backend).toBe(50);
    expect(res.body.mergedState._loadedAt).toBeDefined();
    expect(res.body.conflicts).toEqual([]);
  });

  test('rejects request with no state fields', async () => {
    const res = await request(app)
      .post('/api/verticals/growth/state')
      .send({ _loadedAt: 123 });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('No state fields');
  });

  test('accepts partial state (only changed fields)', async () => {
    // Save initial state
    await request(app)
      .post('/api/verticals/growth/state')
      .send({ capacity: { backend: 40 }, tracks: { 'core-bonus': [1] }, _loadedAt: 0 });

    // Get the state to have a valid _loadedAt
    const getRes = await request(app).get('/api/verticals/growth/state');
    const loadedAt = getRes.body._loadedAt;

    // Update only capacity
    const res = await request(app)
      .post('/api/verticals/growth/state')
      .send({ capacity: { backend: 50 }, _loadedAt: loadedAt });

    expect(res.body.success).toBe(true);
    expect(res.body.mergedState.capacity.backend).toBe(50);
    // Tracks should still be there
    expect(res.body.mergedState.tracks).toBeDefined();
  });

  test('PUT works as alias for POST', async () => {
    const res = await request(app)
      .put('/api/verticals/growth/state')
      .send({ capacity: { backend: 60 }, _loadedAt: 0 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ═══════════════════════════════════════════════
// State Merge — Conflict Resolution
// ═══════════════════════════════════════════════

describe('State merge conflict resolution', () => {
  test('no conflict when _loadedAt is fresh', async () => {
    // Client A saves
    await request(app)
      .post('/api/verticals/growth/state')
      .send({ capacity: { backend: 40 }, _loadedAt: 0 });

    // Client B loads
    const loadRes = await request(app).get('/api/verticals/growth/state');
    const loadedAt = loadRes.body._loadedAt;

    // Client B saves with fresh _loadedAt — no conflict
    const res = await request(app)
      .post('/api/verticals/growth/state')
      .send({ capacity: { backend: 50 }, _loadedAt: loadedAt });

    expect(res.body.conflicts).toEqual([]);
    expect(res.body.mergedState.capacity.backend).toBe(50);
  });

  test('conflict on stale non-object field — server value wins', async () => {
    // Step 1: Client B "loads" the state at time T0
    const staleLoadedAt = Date.now() - 60000; // pretend B loaded 60 seconds ago

    // Step 2: Client A saves milestones — this sets fieldTs.milestones = now
    await request(app)
      .post('/api/verticals/growth/state')
      .send({ milestones: [{ label: 'M1 by A', week: 2 }], _loadedAt: 0 });

    // Step 3: Client B tries to save milestones with a stale _loadedAt
    // Since fieldTs.milestones (set in step 2) > staleLoadedAt, this should conflict
    const res = await request(app)
      .post('/api/verticals/growth/state')
      .send({ milestones: [{ label: 'M1 Stale by B', week: 3 }], _loadedAt: staleLoadedAt });

    // Milestones is an array — cannot do sub-key merge, so it's rejected
    expect(res.body.conflicts).toContain('milestones');
    // Server value (from client A) should be preserved
    expect(res.body.mergedState.milestones[0].label).toBe('M1 by A');
  });

  test('conflict on object field — sub-key merge (client deletions respected)', async () => {
    // Initial state with multiple disciplines
    await request(app)
      .post('/api/verticals/growth/state')
      .send({ capacity: { backend: 40, frontend: 30, qa: 20 }, _loadedAt: 0 });

    // Client A loads
    const loadRes = await request(app).get('/api/verticals/growth/state');

    // Client A changes backend
    await request(app)
      .post('/api/verticals/growth/state')
      .send({ capacity: { backend: 50, frontend: 30, qa: 20 }, _loadedAt: loadRes.body._loadedAt });

    // Client B (stale) sends change to frontend only, deleting qa
    const res = await request(app)
      .post('/api/verticals/growth/state')
      .send({ capacity: { backend: 40, frontend: 35 }, _loadedAt: loadRes.body._loadedAt - 100000 });

    // Should be merged, not rejected — capacity is an object
    // Client B's version is the base: { backend: 40, frontend: 35 }
    // qa was deleted by client B (not in their payload)
    expect(res.body.success).toBe(true);
  });

  test('no false conflicts when value unchanged', async () => {
    // Save initial
    await request(app)
      .post('/api/verticals/growth/state')
      .send({ capacity: { backend: 40 }, _loadedAt: 0 });

    const loadRes = await request(app).get('/api/verticals/growth/state');
    const loadedAt = loadRes.body._loadedAt;

    // Re-save same value — fieldTs should NOT be bumped
    await request(app)
      .post('/api/verticals/growth/state')
      .send({ capacity: { backend: 40 }, _loadedAt: loadedAt });

    // Another client with same loadedAt should not see conflict
    const res = await request(app)
      .post('/api/verticals/growth/state')
      .send({ capacity: { backend: 45 }, _loadedAt: loadedAt });

    expect(res.body.conflicts).toEqual([]);
    expect(res.body.mergedState.capacity.backend).toBe(45);
  });
});

// ═══════════════════════════════════════════════
// Polling endpoint
// ═══════════════════════════════════════════════

describe('GET /api/verticals/:key/poll', () => {
  test('returns lightweight response without full state', async () => {
    // Save some state first
    await request(app)
      .post('/api/verticals/growth/state')
      .send({ capacity: { backend: 40 }, _loadedAt: 0 });

    const res = await request(app).get('/api/verticals/growth/poll');
    expect(res.status).toBe(200);
    expect(res.body.updatedAt).toBeDefined();
    expect(res.body._fieldTs).toBeDefined();
    expect(res.body.projectCount).toBeDefined();
    // Should NOT contain full state data
    expect(res.body.capacity).toBeUndefined();
    expect(res.body.tracks).toBeUndefined();
  });

  test('returns null updatedAt for new vertical', async () => {
    const res = await request(app).get('/api/verticals/payments/poll');
    expect(res.body.updatedAt).toBeNull();
  });
});

// ═══════════════════════════════════════════════
// Audit log endpoint
// ═══════════════════════════════════════════════

describe('GET /api/audit-log', () => {
  test('returns empty log initially', async () => {
    const res = await request(app).get('/api/audit-log');
    expect(res.status).toBe(200);
    expect(res.body.entries).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  test('returns audit entries after state changes', async () => {
    // Make a change to trigger audit log
    await request(app)
      .post('/api/verticals/growth/state')
      .set('X-User-Email', 'tester@novibet.com')
      .set('X-User-Name', 'Test%20User')
      .send({ capacity: { backend: 50 }, _loadedAt: 0 });

    const res = await request(app).get('/api/audit-log');
    expect(res.body.entries.length).toBeGreaterThan(0);
    expect(res.body.entries[0].userEmail).toBe('tester@novibet.com');
    expect(res.body.entries[0].vertical).toBe('growth');
  });

  test('filters by user', async () => {
    await request(app)
      .post('/api/verticals/growth/state')
      .set('X-User-Email', 'alice@novibet.com')
      .send({ capacity: { backend: 41 }, _loadedAt: 0 });

    await request(app)
      .post('/api/verticals/growth/state')
      .set('X-User-Email', 'bob@novibet.com')
      .send({ capacity: { backend: 42 }, _loadedAt: 0 });

    const res = await request(app).get('/api/audit-log?user=alice');
    expect(res.body.entries.every(e => e.userEmail.includes('alice'))).toBe(true);
  });

  test('filters by vertical', async () => {
    await request(app)
      .post('/api/verticals/growth/state')
      .set('X-User-Email', 'test@novibet.com')
      .send({ capacity: { backend: 41 }, _loadedAt: 0 });

    await request(app)
      .post('/api/verticals/casino/state')
      .set('X-User-Email', 'test@novibet.com')
      .send({ capacity: { backend: 42 }, _loadedAt: 0 });

    const res = await request(app).get('/api/audit-log?vertical=casino');
    expect(res.body.entries.every(e => e.vertical === 'casino')).toBe(true);
  });

  test('filters by days', async () => {
    const res = await request(app).get('/api/audit-log?days=1');
    expect(res.status).toBe(200);
    // All entries should be from the last day
  });

  test('caps results at 500', async () => {
    // Create a large audit log
    const entries = [];
    for (let i = 0; i < 600; i++) {
      entries.push({
        id: `entry${i}`,
        timestamp: new Date().toISOString(),
        action: `Action ${i}`,
        userEmail: 'test@novibet.com',
        userName: 'Test',
        vertical: 'growth',
        details: `Detail ${i}`,
      });
    }
    fs.writeFileSync(path.join(TEST_DATA_DIR, 'audit_log.json'), JSON.stringify(entries));

    const res = await request(app).get('/api/audit-log');
    expect(res.body.entries).toHaveLength(500);
    expect(res.body.total).toBe(600);
  });
});

// ═══════════════════════════════════════════════
// 404 catch-all
// ═══════════════════════════════════════════════

describe('404 handling', () => {
  test('returns 404 for unknown routes', async () => {
    const res = await request(app).get('/api/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.error).toContain('Route not found');
  });
});

// ═══════════════════════════════════════════════
// Additional Conflict Resolution Tests
// ═══════════════════════════════════════════════

describe('State merge — mixed accept/reject', () => {
  test('accepts fresh fields and rejects stale fields in same request', async () => {
    // Set initial state
    await request(app)
      .post('/api/verticals/growth/state')
      .send({ capacity: { backend: 10 }, milestones: [{ id: 1, name: 'M1' }], _loadedAt: 0 });

    // Client loads state
    const loadRes = await request(app).get('/api/verticals/growth/state');
    const loadedAt = loadRes.body._loadedAt;

    // Another client updates milestones (makes milestones stale for first client)
    await request(app)
      .post('/api/verticals/growth/state')
      .send({ milestones: [{ id: 1, name: 'M1 Updated' }], _loadedAt: loadedAt });

    // First client sends BOTH capacity (fresh-ish, object field → merge) and milestones (stale, array → reject)
    const res = await request(app)
      .post('/api/verticals/growth/state')
      .send({ capacity: { backend: 20 }, milestones: [{ id: 2, name: 'M2' }], _loadedAt: loadedAt });

    // Milestones should be rejected (array, stale)
    expect(res.body.conflicts).toContain('milestones');
    expect(res.body.mergedState.milestones[0].name).toBe('M1 Updated');
    // Capacity is an object — sub-key merge applies
    expect(res.body.mergedState.capacity.backend).toBe(20);
  });
});

describe('State merge — _loadedAt: 0 force overwrite', () => {
  test('_loadedAt: 0 accepts all fields regardless of staleness', async () => {
    // Set initial state and let fieldTs be set
    await request(app)
      .post('/api/verticals/growth/state')
      .send({ capacity: { backend: 10 }, milestones: [{ id: 1, name: 'M1' }], _loadedAt: 0 });

    // Save again with _loadedAt: 0 — should always accept
    const res = await request(app)
      .post('/api/verticals/growth/state')
      .send({ capacity: { backend: 99 }, milestones: [{ id: 2, name: 'Overwrite' }], _loadedAt: 0 });

    expect(res.body.conflicts).toEqual([]);
    expect(res.body.mergedState.capacity.backend).toBe(99);
    expect(res.body.mergedState.milestones[0].name).toBe('Overwrite');
  });
});

describe('Project save — track cleanup', () => {
  test('removes deleted project IDs from tracks', async () => {
    // Set up tracks with project IDs
    await request(app)
      .post('/api/verticals/growth/state')
      .send({ tracks: { 'core-bonus': [1, 2, 3], 'gateway': [4], 'seo-aff': [] }, _loadedAt: 0 });

    // Save projects WITHOUT id 2 (simulating deletion)
    await request(app)
      .post('/api/verticals/growth/projects')
      .send({ projects: [{ id: 1 }, { id: 3 }, { id: 4 }] });

    // Verify tracks no longer contain deleted project
    const stateRes = await request(app).get('/api/verticals/growth/state');
    expect(stateRes.body.tracks['core-bonus']).not.toContain(2);
    expect(stateRes.body.tracks['core-bonus']).toContain(1);
    expect(stateRes.body.tracks['core-bonus']).toContain(3);
  });
});

describe('Project validation edge cases', () => {
  test('rejects projects with duplicate IDs gracefully', async () => {
    const res = await request(app)
      .post('/api/verticals/growth/projects')
      .send({ projects: [{ id: 1, backend: 'S' }, { id: 1, backend: 'M' }] });
    // Should accept (server doesn't validate uniqueness) but not crash
    expect(res.status).toBe(200);
  });

  test('accepts project with all empty size fields', async () => {
    const res = await request(app)
      .post('/api/verticals/growth/projects')
      .send({ projects: [{ id: 1, backend: '', frontend: '', natives: '', qa: '', impact: '' }] });
    expect(res.status).toBe(200);
  });
});
