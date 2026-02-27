/**
 * ExCo + Sign-off tests.
 *
 * Tests cover:
 * - GET /api/exco returns empty list initially
 * - POST /api/exco (admin-only, validates array, dedupes, filters admin email)
 * - POST /api/verticals/:key/signoffs (ExCo-only, creates sign-off version)
 * - GET /api/verticals/:key/signoffs (lists all sign-off versions)
 * - GET /api/verticals/:key/signoffs/:id (returns specific sign-off blocks)
 * - GET /api/verticals/:key/signoffs/latest (returns latest sign-off)
 * - Multiple sign-off versions work independently
 * - Non-ExCo cannot sign off
 * - Sign-offs are separate from snapshots
 */

const fs = require('fs');
const path = require('path');
const request = require('supertest');

// Set DATA_DIR before importing server
const TEST_DATA_DIR = path.join(__dirname, '..', 'data_test_exco');
process.env.DATA_DIR = TEST_DATA_DIR;

if (!fs.existsSync(TEST_DATA_DIR)) fs.mkdirSync(TEST_DATA_DIR, { recursive: true });

const { app, keepaliveInterval, EXCO_FILE, ADMIN_EMAIL, getSnapshotsFile, getSignoffsFile, getStateFile, getProjectsFile } = require('../server');

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
// Sign-off (separate storage in signoffs file)
// ═══════════════════════════════════════════════

describe('POST /api/verticals/:key/signoffs', () => {
  beforeEach(() => {
    // Set up ExCo list
    fs.writeFileSync(path.join(TEST_DATA_DIR, EXCO_FILE), JSON.stringify(['exco1@novibet.com']));
    // Set up state and projects
    fs.writeFileSync(path.join(TEST_DATA_DIR, getStateFile('growth')), JSON.stringify({ capacity: { backend: 40 } }));
    fs.writeFileSync(path.join(TEST_DATA_DIR, getProjectsFile('growth')), JSON.stringify([{ id: 1, subTask: 'Test' }]));
  });

  test('ExCo member can sign off', async () => {
    const res = await request(app)
      .post('/api/verticals/growth/signoffs')
      .set('x-user-email', 'exco1@novibet.com')
      .set('x-user-name', 'ExCo One')
      .send({ quarterlyBlocks: [{ projectId: 1, subTask: 'Test', leftPct: 10, widthPct: 30 }] });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.signoff.signedOff).toBeDefined();
    expect(res.body.signoff.signedOff.by).toBe('exco1@novibet.com');
    expect(res.body.signoff.signedOff.name).toBe('ExCo One');
  });

  test('admin can sign off', async () => {
    const res = await request(app)
      .post('/api/verticals/growth/signoffs')
      .set('x-user-email', ADMIN_EMAIL)
      .set('x-user-name', 'Admin')
      .send({ quarterlyBlocks: [] });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('non-ExCo member cannot sign off', async () => {
    const res = await request(app)
      .post('/api/verticals/growth/signoffs')
      .set('x-user-email', 'test@novibet.com')
      .send({ quarterlyBlocks: [] });
    expect(res.status).toBe(403);
  });

  test('sign-off saves quarterlyBlocks', async () => {
    const blocks = [{ projectId: 1, subTask: 'Test', leftPct: 10, widthPct: 30, lane: 0 }];
    await request(app)
      .post('/api/verticals/growth/signoffs')
      .set('x-user-email', 'exco1@novibet.com')
      .send({ quarterlyBlocks: blocks });

    // Verify via signoffs/latest endpoint
    const latestRes = await request(app).get('/api/verticals/growth/signoffs/latest');
    expect(latestRes.status).toBe(200);
    expect(latestRes.body.quarterlyBlocks).toEqual(blocks);
  });

  test('sign-offs are stored separately from snapshots', async () => {
    await request(app)
      .post('/api/verticals/growth/signoffs')
      .set('x-user-email', 'exco1@novibet.com')
      .send({ quarterlyBlocks: [] });

    // Signoffs file should have the entry
    const signoffsFile = path.join(TEST_DATA_DIR, getSignoffsFile('growth'));
    const signoffs = JSON.parse(fs.readFileSync(signoffsFile, 'utf8'));
    expect(signoffs).toHaveLength(1);

    // Snapshots file should be empty (or not exist)
    const snapshotsFile = path.join(TEST_DATA_DIR, getSnapshotsFile('growth'));
    const snapshots = fs.existsSync(snapshotsFile) ? JSON.parse(fs.readFileSync(snapshotsFile, 'utf8')) : [];
    expect(snapshots).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════
// List + Get sign-off versions
// ═══════════════════════════════════════════════

describe('GET /api/verticals/:key/signoffs', () => {
  test('returns empty list when no sign-offs exist', async () => {
    const res = await request(app).get('/api/verticals/growth/signoffs');
    expect(res.status).toBe(200);
    expect(res.body.signoffs).toEqual([]);
  });

  test('lists all sign-off versions with metadata', async () => {
    fs.writeFileSync(path.join(TEST_DATA_DIR, EXCO_FILE), JSON.stringify(['exco1@novibet.com']));
    fs.writeFileSync(path.join(TEST_DATA_DIR, getStateFile('growth')), JSON.stringify({}));
    fs.writeFileSync(path.join(TEST_DATA_DIR, getProjectsFile('growth')), JSON.stringify([]));

    // Create two sign-offs
    await request(app)
      .post('/api/verticals/growth/signoffs')
      .set('x-user-email', 'exco1@novibet.com')
      .set('x-user-name', 'ExCo One')
      .send({ quarterlyBlocks: [{ projectId: 1 }] });

    await request(app)
      .post('/api/verticals/growth/signoffs')
      .set('x-user-email', 'exco1@novibet.com')
      .set('x-user-name', 'ExCo One')
      .send({ quarterlyBlocks: [{ projectId: 2 }] });

    const res = await request(app).get('/api/verticals/growth/signoffs');
    expect(res.status).toBe(200);
    expect(res.body.signoffs).toHaveLength(2);
    // Newest first
    expect(res.body.signoffs[0].signedOff.by).toBe('exco1@novibet.com');
    expect(res.body.signoffs[0].id).toBeDefined();
    expect(res.body.signoffs[0].label).toBeDefined();
    expect(res.body.signoffs[0].createdAt).toBeDefined();
  });
});

describe('GET /api/verticals/:key/signoffs/:id', () => {
  test('returns null when no sign-offs exist (latest)', async () => {
    const res = await request(app).get('/api/verticals/growth/signoffs/latest');
    expect(res.status).toBe(200);
    expect(res.body.signedOff).toBeNull();
    expect(res.body.quarterlyBlocks).toEqual([]);
  });

  test('returns latest sign-off', async () => {
    fs.writeFileSync(path.join(TEST_DATA_DIR, EXCO_FILE), JSON.stringify(['exco1@novibet.com']));
    fs.writeFileSync(path.join(TEST_DATA_DIR, getStateFile('growth')), JSON.stringify({}));
    fs.writeFileSync(path.join(TEST_DATA_DIR, getProjectsFile('growth')), JSON.stringify([]));

    const blocks = [{ projectId: 1, subTask: 'Test' }];
    await request(app)
      .post('/api/verticals/growth/signoffs')
      .set('x-user-email', 'exco1@novibet.com')
      .set('x-user-name', 'ExCo One')
      .send({ quarterlyBlocks: blocks });

    const res = await request(app).get('/api/verticals/growth/signoffs/latest');
    expect(res.status).toBe(200);
    expect(res.body.signedOff.by).toBe('exco1@novibet.com');
    expect(res.body.signedOff.name).toBe('ExCo One');
    expect(res.body.quarterlyBlocks).toEqual(blocks);
  });

  test('returns specific sign-off by id', async () => {
    fs.writeFileSync(path.join(TEST_DATA_DIR, EXCO_FILE), JSON.stringify(['exco1@novibet.com']));
    fs.writeFileSync(path.join(TEST_DATA_DIR, getStateFile('growth')), JSON.stringify({}));
    fs.writeFileSync(path.join(TEST_DATA_DIR, getProjectsFile('growth')), JSON.stringify([]));

    const blocks1 = [{ projectId: 1 }];
    const blocks2 = [{ projectId: 2 }];

    const res1 = await request(app)
      .post('/api/verticals/growth/signoffs')
      .set('x-user-email', 'exco1@novibet.com')
      .send({ quarterlyBlocks: blocks1 });

    await request(app)
      .post('/api/verticals/growth/signoffs')
      .set('x-user-email', 'exco1@novibet.com')
      .send({ quarterlyBlocks: blocks2 });

    // Get the first sign-off by ID
    const res = await request(app).get(`/api/verticals/growth/signoffs/${res1.body.signoff.id}`);
    expect(res.status).toBe(200);
    expect(res.body.quarterlyBlocks).toEqual(blocks1);
  });
});

// ═══════════════════════════════════════════════
// Delete sign-off versions (admin-only)
// ═══════════════════════════════════════════════

describe('DELETE /api/verticals/:key/signoffs/:id', () => {
  beforeEach(() => {
    fs.writeFileSync(path.join(TEST_DATA_DIR, EXCO_FILE), JSON.stringify(['exco1@novibet.com']));
    fs.writeFileSync(path.join(TEST_DATA_DIR, getStateFile('growth')), JSON.stringify({}));
    fs.writeFileSync(path.join(TEST_DATA_DIR, getProjectsFile('growth')), JSON.stringify([]));
  });

  test('admin can delete a sign-off version', async () => {
    const create = await request(app)
      .post('/api/verticals/growth/signoffs')
      .set('x-user-email', 'exco1@novibet.com')
      .send({ quarterlyBlocks: [{ projectId: 1 }] });
    const id = create.body.signoff.id;

    const res = await request(app)
      .delete(`/api/verticals/growth/signoffs/${id}`)
      .set('x-user-email', ADMIN_EMAIL);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify it's gone
    const list = await request(app).get('/api/verticals/growth/signoffs');
    expect(list.body.signoffs).toHaveLength(0);
  });

  test('non-admin cannot delete a sign-off version', async () => {
    const create = await request(app)
      .post('/api/verticals/growth/signoffs')
      .set('x-user-email', 'exco1@novibet.com')
      .send({ quarterlyBlocks: [] });
    const id = create.body.signoff.id;

    const res = await request(app)
      .delete(`/api/verticals/growth/signoffs/${id}`)
      .set('x-user-email', 'exco1@novibet.com');
    expect(res.status).toBe(403);
  });

  test('returns 404 for non-existent sign-off', async () => {
    const res = await request(app)
      .delete('/api/verticals/growth/signoffs/nonexistent')
      .set('x-user-email', ADMIN_EMAIL);
    expect(res.status).toBe(404);
  });

  test('deleting one sign-off leaves others intact', async () => {
    await request(app)
      .post('/api/verticals/growth/signoffs')
      .set('x-user-email', 'exco1@novibet.com')
      .send({ quarterlyBlocks: [{ projectId: 1 }] });
    const create2 = await request(app)
      .post('/api/verticals/growth/signoffs')
      .set('x-user-email', 'exco1@novibet.com')
      .send({ quarterlyBlocks: [{ projectId: 2 }] });

    await request(app)
      .delete(`/api/verticals/growth/signoffs/${create2.body.signoff.id}`)
      .set('x-user-email', ADMIN_EMAIL);

    const list = await request(app).get('/api/verticals/growth/signoffs');
    expect(list.body.signoffs).toHaveLength(1);
    expect(list.body.signoffs[0].id).not.toBe(create2.body.signoff.id);
  });
});
