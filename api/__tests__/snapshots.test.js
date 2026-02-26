/**
 * Snapshot tests for scenario save/restore.
 *
 * Tests cover:
 * - List snapshots (empty initially)
 * - Save a snapshot
 * - List snapshots returns saved snapshot
 * - Save snapshot with no name (validation)
 * - Restore a snapshot
 * - Restore overwrites current state and projects
 * - Restore non-existent snapshot (404)
 * - Delete a snapshot
 * - Delete non-existent snapshot (404)
 * - Audit log entries for snapshot operations
 */

const fs = require('fs');
const path = require('path');
const request = require('supertest');

// Set DATA_DIR before importing server
const TEST_DATA_DIR = path.join(__dirname, '..', 'data_test_snapshots');
process.env.DATA_DIR = TEST_DATA_DIR;

if (!fs.existsSync(TEST_DATA_DIR)) fs.mkdirSync(TEST_DATA_DIR, { recursive: true });

const { app, keepaliveInterval, loadJSON, getSnapshotsFile, getStateFile, getProjectsFile } = require('../server');

// ── Setup / Teardown ──
afterAll(() => {
  clearInterval(keepaliveInterval);
  if (fs.existsSync(TEST_DATA_DIR)) {
    fs.readdirSync(TEST_DATA_DIR).forEach(f => fs.unlinkSync(path.join(TEST_DATA_DIR, f)));
    fs.rmdirSync(TEST_DATA_DIR);
  }
});

beforeEach(() => {
  // Clean all JSON files between tests
  fs.readdirSync(TEST_DATA_DIR).forEach(f => {
    if (f.endsWith('.json')) fs.unlinkSync(path.join(TEST_DATA_DIR, f));
  });
  // Write editors.json so test emails pass authorization middleware
  fs.writeFileSync(
    path.join(TEST_DATA_DIR, 'editors.json'),
    JSON.stringify(['test@novibet.com', 'alice@novibet.com', 'bob@novibet.com'])
  );
});

// ═══════════════════════════════════════════════
// List snapshots
// ═══════════════════════════════════════════════

describe('GET /api/verticals/:key/snapshots', () => {
  test('returns empty list for new vertical', async () => {
    const res = await request(app).get('/api/verticals/growth/snapshots');
    expect(res.status).toBe(200);
    expect(res.body.snapshots).toEqual([]);
  });

  test('returns saved snapshots with metadata only', async () => {
    // First save state and projects
    await request(app).post('/api/verticals/growth/state')
      .set('X-User-Email', 'kmermigkas@novibet.com')
      .send({ capacity: { backend: 30 }, _loadedAt: 0 });
    await request(app).post('/api/verticals/growth/projects')
      .set('X-User-Email', 'kmermigkas@novibet.com')
      .send({ projects: [{ id: 1, subTask: 'Test Project' }] });

    // Save a snapshot
    await request(app).post('/api/verticals/growth/snapshots')
      .set('X-User-Email', 'test@novibet.com')
      .send({ name: 'Sprint 1 Plan', description: 'Initial plan' });

    // List snapshots
    const res = await request(app).get('/api/verticals/growth/snapshots');
    expect(res.status).toBe(200);
    expect(res.body.snapshots).toHaveLength(1);
    expect(res.body.snapshots[0].name).toBe('Sprint 1 Plan');
    expect(res.body.snapshots[0].description).toBe('Initial plan');
    expect(res.body.snapshots[0].projectCount).toBe(1);
    expect(res.body.snapshots[0].createdBy).toBe('test@novibet.com');
    // Should NOT include full state or projects
    expect(res.body.snapshots[0].state).toBeUndefined();
    expect(res.body.snapshots[0].projects).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════
// Save snapshot
// ═══════════════════════════════════════════════

describe('POST /api/verticals/:key/snapshots', () => {
  test('saves snapshot with current state and projects', async () => {
    // Set up state and projects
    await request(app).post('/api/verticals/growth/state')
      .set('X-User-Email', 'kmermigkas@novibet.com')
      .send({ capacity: { backend: 50, frontend: 40 }, _loadedAt: 0 });
    await request(app).post('/api/verticals/growth/projects')
      .set('X-User-Email', 'kmermigkas@novibet.com')
      .send({ projects: [{ id: 1, subTask: 'A' }, { id: 2, subTask: 'B' }] });

    const res = await request(app).post('/api/verticals/growth/snapshots')
      .set('X-User-Email', 'alice@novibet.com')
      .send({ name: 'My Snapshot' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.snapshot.name).toBe('My Snapshot');
    expect(res.body.snapshot.id).toBeDefined();
    expect(res.body.snapshot.createdAt).toBeDefined();

    // Verify it's stored correctly
    const snapshots = loadJSON(getSnapshotsFile('growth'), []);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].projects).toHaveLength(2);
    expect(snapshots[0].state.capacity.backend).toBe(50);
    expect(snapshots[0].createdBy).toBe('alice@novibet.com');
  });

  test('rejects snapshot without name', async () => {
    const res = await request(app).post('/api/verticals/growth/snapshots')
      .set('X-User-Email', 'kmermigkas@novibet.com')
      .send({ description: 'No name' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name/i);
  });

  test('rejects snapshot with empty name', async () => {
    const res = await request(app).post('/api/verticals/growth/snapshots')
      .set('X-User-Email', 'kmermigkas@novibet.com')
      .send({ name: '   ' });
    expect(res.status).toBe(400);
  });

  test('newest snapshot is first in list', async () => {
    await request(app).post('/api/verticals/growth/snapshots')
      .set('X-User-Email', 'kmermigkas@novibet.com')
      .send({ name: 'First' });
    await request(app).post('/api/verticals/growth/snapshots')
      .set('X-User-Email', 'kmermigkas@novibet.com')
      .send({ name: 'Second' });

    const snapshots = loadJSON(getSnapshotsFile('growth'), []);
    expect(snapshots[0].name).toBe('Second');
    expect(snapshots[1].name).toBe('First');
  });
});

// ═══════════════════════════════════════════════
// Restore snapshot
// ═══════════════════════════════════════════════

describe('POST /api/verticals/:key/snapshots/:id/restore', () => {
  test('restores snapshot state and projects', async () => {
    // Save initial state
    await request(app).post('/api/verticals/growth/state')
      .set('X-User-Email', 'kmermigkas@novibet.com')
      .send({ capacity: { backend: 100 }, _loadedAt: 0 });
    await request(app).post('/api/verticals/growth/projects')
      .set('X-User-Email', 'kmermigkas@novibet.com')
      .send({ projects: [{ id: 1, subTask: 'Original' }] });

    // Save snapshot
    const saveRes = await request(app).post('/api/verticals/growth/snapshots')
      .set('X-User-Email', 'kmermigkas@novibet.com')
      .send({ name: 'Before Changes' });
    const snapshotId = saveRes.body.snapshot.id;

    // Make changes
    await request(app).post('/api/verticals/growth/state')
      .set('X-User-Email', 'kmermigkas@novibet.com')
      .send({ capacity: { backend: 200 }, _loadedAt: 0 });
    await request(app).post('/api/verticals/growth/projects')
      .set('X-User-Email', 'kmermigkas@novibet.com')
      .send({ projects: [{ id: 1, subTask: 'Changed' }, { id: 2, subTask: 'New' }] });

    // Verify changed state
    let stateRes = await request(app).get('/api/verticals/growth/state');
    expect(stateRes.body.capacity.backend).toBe(200);

    // Restore snapshot
    const restoreRes = await request(app)
      .post(`/api/verticals/growth/snapshots/${snapshotId}/restore`)
      .set('X-User-Email', 'test@novibet.com');
    expect(restoreRes.status).toBe(200);
    expect(restoreRes.body.success).toBe(true);

    // Verify state was restored
    stateRes = await request(app).get('/api/verticals/growth/state');
    expect(stateRes.body.capacity.backend).toBe(100);

    // Verify projects were restored
    const projRes = await request(app).get('/api/verticals/growth/projects');
    expect(projRes.body.projects).toHaveLength(1);
    expect(projRes.body.projects[0].subTask).toBe('Original');
  });

  test('returns 404 for non-existent snapshot', async () => {
    const res = await request(app)
      .post('/api/verticals/growth/snapshots/nonexistent/restore')
      .set('X-User-Email', 'kmermigkas@novibet.com');
    expect(res.status).toBe(404);
  });

  test('returns full state and projects in response', async () => {
    await request(app).post('/api/verticals/growth/state')
      .set('X-User-Email', 'kmermigkas@novibet.com')
      .send({ capacity: { backend: 75 }, _loadedAt: 0 });
    await request(app).post('/api/verticals/growth/projects')
      .set('X-User-Email', 'kmermigkas@novibet.com')
      .send({ projects: [{ id: 1, subTask: 'Test' }] });

    const saveRes = await request(app).post('/api/verticals/growth/snapshots')
      .set('X-User-Email', 'kmermigkas@novibet.com')
      .send({ name: 'Check Response' });

    const restoreRes = await request(app)
      .post(`/api/verticals/growth/snapshots/${saveRes.body.snapshot.id}/restore`)
      .set('X-User-Email', 'kmermigkas@novibet.com');
    expect(restoreRes.body.state).toBeDefined();
    expect(restoreRes.body.projects).toBeDefined();
    expect(restoreRes.body.state.capacity.backend).toBe(75);
    expect(restoreRes.body.projects).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════
// Delete snapshot
// ═══════════════════════════════════════════════

describe('DELETE /api/verticals/:key/snapshots/:id', () => {
  test('deletes a snapshot', async () => {
    // Save two snapshots
    const res1 = await request(app).post('/api/verticals/growth/snapshots')
      .set('X-User-Email', 'kmermigkas@novibet.com')
      .send({ name: 'Keep' });
    const res2 = await request(app).post('/api/verticals/growth/snapshots')
      .set('X-User-Email', 'kmermigkas@novibet.com')
      .send({ name: 'Delete Me' });

    // Delete the second one
    const delRes = await request(app)
      .delete(`/api/verticals/growth/snapshots/${res2.body.snapshot.id}`)
      .set('X-User-Email', 'kmermigkas@novibet.com');
    expect(delRes.status).toBe(200);
    expect(delRes.body.success).toBe(true);

    // Verify only one remains
    const snapshots = loadJSON(getSnapshotsFile('growth'), []);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].name).toBe('Keep');
  });

  test('returns 404 for non-existent snapshot', async () => {
    const res = await request(app)
      .delete('/api/verticals/growth/snapshots/nonexistent')
      .set('X-User-Email', 'kmermigkas@novibet.com');
    expect(res.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════
// Audit log integration
// ═══════════════════════════════════════════════

describe('Snapshot audit log entries', () => {
  test('logs snapshot save, restore, and delete', async () => {
    // Save snapshot
    await request(app).post('/api/verticals/growth/snapshots')
      .set('X-User-Email', 'alice@novibet.com')
      .set('X-User-Name', 'Alice')
      .send({ name: 'Audit Test' });

    const saveRes = await request(app).post('/api/verticals/growth/snapshots')
      .set('X-User-Email', 'alice@novibet.com')
      .send({ name: 'To Delete' });

    // Restore snapshot
    const snapshots = loadJSON(getSnapshotsFile('growth'), []);
    await request(app)
      .post(`/api/verticals/growth/snapshots/${snapshots[0].id}/restore`)
      .set('X-User-Email', 'bob@novibet.com');

    // Delete snapshot
    await request(app)
      .delete(`/api/verticals/growth/snapshots/${snapshots[1].id}`)
      .set('X-User-Email', 'alice@novibet.com');

    // Check audit log
    const logRes = await request(app).get('/api/audit-log');
    const entries = logRes.body.entries;

    // Should have entries for: save, save, restore, delete (at minimum)
    const snapshotEntries = entries.filter(e =>
      e.action.includes('snapshot') || e.action.includes('Snapshot')
    );
    expect(snapshotEntries.length).toBeGreaterThanOrEqual(4);

    // Check restore entry
    const restoreEntry = snapshotEntries.find(e => e.action.includes('Restored'));
    expect(restoreEntry).toBeDefined();
    expect(restoreEntry.userEmail).toBe('bob@novibet.com');

    // Check delete entry
    const deleteEntry = snapshotEntries.find(e => e.action.includes('Deleted'));
    expect(deleteEntry).toBeDefined();
  });
});
