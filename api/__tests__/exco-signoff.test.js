/**
 * ExCo + Sign-off tests.
 *
 * Tests cover:
 * - GET /api/exco returns empty list initially
 * - POST /api/exco (admin-only, validates array, dedupes, filters admin email)
 * - POST /api/verticals/:key/signoff (ExCo-only, creates signed snapshot)
 * - GET /api/verticals/:key/signoff/latest (returns latest signed-off snapshot)
 * - Snapshot metadata includes signedOff field
 * - Delete guard: non-ExCo can't delete signed-off snapshot
 * - Delete guard: ExCo can delete signed-off snapshot
 * - Delete guard: admin can delete signed-off snapshot
 * - Non-ExCo cannot sign off
 */

const fs = require('fs');
const path = require('path');
const request = require('supertest');

// Set DATA_DIR before importing server
const TEST_DATA_DIR = path.join(__dirname, '..', 'data_test_exco');
process.env.DATA_DIR = TEST_DATA_DIR;

if (!fs.existsSync(TEST_DATA_DIR)) fs.mkdirSync(TEST_DATA_DIR, { recursive: true });

const { app, keepaliveInterval, EXCO_FILE, ADMIN_EMAIL, getSnapshotsFile, getStateFile, getProjectsFile } = require('../server');

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
    JSON.stringify([
      { email: 'test@novibet.com', verticals: ['all'] },
      { email: 'alice@novibet.com', verticals: ['all'] },
    ])
  );
});

// ═══════════════════════════════════════════════
// ExCo CRUD
// ═══════════════════════════════════════════════

describe('GET /api/exco', () => {
  test('returns empty list when no exco.json exists', async () => {
    const res = await request(app).get('/api/exco');
    expect(res.status).toBe(200);
    expect(res.body.exco).toEqual([]);
  });

  test('returns saved ExCo list', async () => {
    fs.writeFileSync(path.join(TEST_DATA_DIR, EXCO_FILE), JSON.stringify(['exco1@novibet.com', 'exco2@novibet.com']));
    const res = await request(app).get('/api/exco');
    expect(res.status).toBe(200);
    expect(res.body.exco).toEqual(['exco1@novibet.com', 'exco2@novibet.com']);
  });
});

describe('POST /api/exco', () => {
  test('admin can save ExCo list', async () => {
    const res = await request(app)
      .post('/api/exco')
      .set('x-user-email', ADMIN_EMAIL)
      .send({ exco: ['exco1@novibet.com', 'exco2@novibet.com'] });
    expect(res.status).toBe(200);
    expect(res.body.exco).toEqual(['exco1@novibet.com', 'exco2@novibet.com']);
  });

  test('non-admin cannot save ExCo list', async () => {
    const res = await request(app)
      .post('/api/exco')
      .set('x-user-email', 'test@novibet.com')
      .send({ exco: ['exco1@novibet.com'] });
    expect(res.status).toBe(403);
  });

  test('rejects non-array body', async () => {
    const res = await request(app)
      .post('/api/exco')
      .set('x-user-email', ADMIN_EMAIL)
      .send({ exco: 'not-an-array' });
    expect(res.status).toBe(400);
  });

  test('deduplicates and normalizes emails', async () => {
    const res = await request(app)
      .post('/api/exco')
      .set('x-user-email', ADMIN_EMAIL)
      .send({ exco: ['Exco1@Novibet.com', 'exco1@novibet.com', '  exco2@novibet.com  '] });
    expect(res.status).toBe(200);
    expect(res.body.exco).toEqual(['exco1@novibet.com', 'exco2@novibet.com']);
  });

  test('filters out admin email and non-novibet emails', async () => {
    const res = await request(app)
      .post('/api/exco')
      .set('x-user-email', ADMIN_EMAIL)
      .send({ exco: [ADMIN_EMAIL, 'external@gmail.com', 'valid@novibet.com'] });
    expect(res.status).toBe(200);
    expect(res.body.exco).toEqual(['valid@novibet.com']);
  });
});

// ═══════════════════════════════════════════════
// Sign-off
// ═══════════════════════════════════════════════

describe('POST /api/verticals/:key/signoff', () => {
  beforeEach(() => {
    // Set up ExCo list
    fs.writeFileSync(path.join(TEST_DATA_DIR, EXCO_FILE), JSON.stringify(['exco1@novibet.com']));
    // Set up state and projects
    fs.writeFileSync(path.join(TEST_DATA_DIR, getStateFile('growth')), JSON.stringify({ capacity: { backend: 40 } }));
    fs.writeFileSync(path.join(TEST_DATA_DIR, getProjectsFile('growth')), JSON.stringify([{ id: 1, subTask: 'Test' }]));
  });

  test('ExCo member can sign off', async () => {
    const res = await request(app)
      .post('/api/verticals/growth/signoff')
      .set('x-user-email', 'exco1@novibet.com')
      .set('x-user-name', 'ExCo One')
      .send({ quarterlyBlocks: [{ projectId: 1, subTask: 'Test', leftPct: 10, widthPct: 30 }] });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.snapshot.signedOff).toBeDefined();
    expect(res.body.snapshot.signedOff.by).toBe('exco1@novibet.com');
    expect(res.body.snapshot.signedOff.name).toBe('ExCo One');
  });

  test('admin can sign off', async () => {
    const res = await request(app)
      .post('/api/verticals/growth/signoff')
      .set('x-user-email', ADMIN_EMAIL)
      .set('x-user-name', 'Admin')
      .send({ quarterlyBlocks: [] });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('non-ExCo member cannot sign off', async () => {
    const res = await request(app)
      .post('/api/verticals/growth/signoff')
      .set('x-user-email', 'test@novibet.com')
      .send({ quarterlyBlocks: [] });
    expect(res.status).toBe(403);
  });

  test('sign-off creates a snapshot with signedOff metadata', async () => {
    await request(app)
      .post('/api/verticals/growth/signoff')
      .set('x-user-email', 'exco1@novibet.com')
      .set('x-user-name', 'ExCo One')
      .send({ quarterlyBlocks: [{ projectId: 1 }] });

    // Check snapshot list includes signedOff metadata
    const listRes = await request(app).get('/api/verticals/growth/snapshots');
    expect(listRes.status).toBe(200);
    expect(listRes.body.snapshots.length).toBe(1);
    expect(listRes.body.snapshots[0].signedOff).toBeDefined();
    expect(listRes.body.snapshots[0].signedOff.by).toBe('exco1@novibet.com');
  });

  test('sign-off saves quarterlyBlocks in snapshot', async () => {
    const blocks = [{ projectId: 1, subTask: 'Test', leftPct: 10, widthPct: 30, lane: 0 }];
    await request(app)
      .post('/api/verticals/growth/signoff')
      .set('x-user-email', 'exco1@novibet.com')
      .send({ quarterlyBlocks: blocks });

    // Verify via signoff/latest endpoint
    const latestRes = await request(app).get('/api/verticals/growth/signoff/latest');
    expect(latestRes.status).toBe(200);
    expect(latestRes.body.quarterlyBlocks).toEqual(blocks);
  });
});

// ═══════════════════════════════════════════════
// Get latest sign-off
// ═══════════════════════════════════════════════

describe('GET /api/verticals/:key/signoff/latest', () => {
  test('returns null when no sign-off exists', async () => {
    const res = await request(app).get('/api/verticals/growth/signoff/latest');
    expect(res.status).toBe(200);
    expect(res.body.signedOff).toBeNull();
    expect(res.body.quarterlyBlocks).toEqual([]);
  });

  test('returns latest signed-off snapshot', async () => {
    fs.writeFileSync(path.join(TEST_DATA_DIR, EXCO_FILE), JSON.stringify(['exco1@novibet.com']));
    fs.writeFileSync(path.join(TEST_DATA_DIR, getStateFile('growth')), JSON.stringify({}));
    fs.writeFileSync(path.join(TEST_DATA_DIR, getProjectsFile('growth')), JSON.stringify([]));

    const blocks = [{ projectId: 1, subTask: 'Test' }];
    await request(app)
      .post('/api/verticals/growth/signoff')
      .set('x-user-email', 'exco1@novibet.com')
      .set('x-user-name', 'ExCo One')
      .send({ quarterlyBlocks: blocks });

    const res = await request(app).get('/api/verticals/growth/signoff/latest');
    expect(res.status).toBe(200);
    expect(res.body.signedOff.by).toBe('exco1@novibet.com');
    expect(res.body.signedOff.name).toBe('ExCo One');
    expect(res.body.quarterlyBlocks).toEqual(blocks);
  });
});

// ═══════════════════════════════════════════════
// Delete guard for signed-off snapshots
// ═══════════════════════════════════════════════

describe('DELETE signed-off snapshot guard', () => {
  let signedOffSnapshotId;

  beforeEach(async () => {
    fs.writeFileSync(path.join(TEST_DATA_DIR, EXCO_FILE), JSON.stringify(['exco1@novibet.com']));
    fs.writeFileSync(path.join(TEST_DATA_DIR, getStateFile('growth')), JSON.stringify({}));
    fs.writeFileSync(path.join(TEST_DATA_DIR, getProjectsFile('growth')), JSON.stringify([]));

    // Create a signed-off snapshot
    const signOffRes = await request(app)
      .post('/api/verticals/growth/signoff')
      .set('x-user-email', 'exco1@novibet.com')
      .set('x-user-name', 'ExCo One')
      .send({ quarterlyBlocks: [] });
    signedOffSnapshotId = signOffRes.body.snapshot.id;
  });

  test('non-ExCo editor cannot delete signed-off snapshot', async () => {
    const res = await request(app)
      .delete(`/api/verticals/growth/snapshots/${signedOffSnapshotId}`)
      .set('x-user-email', 'test@novibet.com');
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('ExCo');
  });

  test('ExCo member can delete signed-off snapshot', async () => {
    const res = await request(app)
      .delete(`/api/verticals/growth/snapshots/${signedOffSnapshotId}`)
      .set('x-user-email', 'exco1@novibet.com');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('admin can delete signed-off snapshot', async () => {
    const res = await request(app)
      .delete(`/api/verticals/growth/snapshots/${signedOffSnapshotId}`)
      .set('x-user-email', ADMIN_EMAIL);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('regular editor can still delete non-signed-off snapshots', async () => {
    // Create a regular snapshot
    const saveRes = await request(app)
      .post('/api/verticals/growth/snapshots')
      .set('x-user-email', 'test@novibet.com')
      .send({ name: 'Regular Snapshot' });
    expect(saveRes.status).toBe(200);

    const listRes = await request(app).get('/api/verticals/growth/snapshots');
    const regularSnap = listRes.body.snapshots.find(s => !s.signedOff);

    const res = await request(app)
      .delete(`/api/verticals/growth/snapshots/${regularSnap.id}`)
      .set('x-user-email', 'test@novibet.com');
    expect(res.status).toBe(200);
  });
});
