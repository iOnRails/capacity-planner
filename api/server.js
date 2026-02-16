const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// ── Config ──
const PORT = process.env.PORT || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ── JSON File Storage ──
function loadJSON(filename, defaultVal) {
  const fp = path.join(DATA_DIR, filename);
  try {
    if (fs.existsSync(fp)) return JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch (e) { console.error(`Error loading ${filename}:`, e.message); }
  return defaultVal;
}

function saveJSON(filename, data) {
  const fp = path.join(DATA_DIR, filename);
  fs.writeFileSync(fp, JSON.stringify(data, null, 2), 'utf8');
}

function getProjectsFile(key) { return `projects_${key}.json`; }
function getStateFile(key) { return `state_${key}.json`; }

const DEFAULT_CAPACITY = { backend: 40, frontend: 30, natives: 25, qa: 20 };
const DEFAULT_TRACKS = { 'core-bonus': [], 'gateway': [], 'seo-aff': [] };

// ── Seed Growth data if empty ──
if (!fs.existsSync(path.join(DATA_DIR, getProjectsFile('growth')))) {
  console.log('Seeding Growth vertical data...');
  const SEED = [
    {id:1,nvrd:"PGR-362",masterEpic:"Marketplace",subTask:"[Marketplace] CY Expansion",pillar:"Expansion",targetMarket:"CY",targetKPI:"Revenue",impact:"L",backend:"S",frontend:"XS",natives:"S",qa:"S",inProgress:true},
    {id:2,nvrd:"PGR-363",masterEpic:"Marketplace",subTask:"[Marketplace] MX Expansion",pillar:"Expansion",targetMarket:"MX",targetKPI:"Revenue",impact:"XL",backend:"XS",frontend:"XS",natives:"S",qa:"S",inProgress:false},
    {id:3,nvrd:"PGR-293",masterEpic:"Nova",subTask:"Nova Integration: New customers",pillar:"Acquisition",targetMarket:"GR",targetKPI:"Revenue",impact:"XS",backend:"M",frontend:"",natives:"",qa:"S",inProgress:false},
    {id:4,nvrd:"PGR-376",masterEpic:"Marketplace",subTask:"[Marketplace] CoinHunt Scalability",pillar:"Core Platform",targetMarket:"Global",targetKPI:"Efficiency",impact:"XL",backend:"L",frontend:"",natives:"",qa:"",inProgress:false},
    {id:5,nvrd:"PGR-199",masterEpic:"Comms",subTask:"In-app Notification Channel",pillar:"Comms",targetMarket:"Global",targetKPI:"Experience",impact:"L",backend:"S",frontend:"S",natives:"M",qa:"S",inProgress:false},
    {id:6,nvrd:"PGR-21",masterEpic:"Challenges",subTask:"[EPIC] Challenges Revamp (SB & CA)",pillar:"Comms",targetMarket:"Global",targetKPI:"Experience",impact:"L",backend:"XL",frontend:"L",natives:"XL",qa:"XL",inProgress:false},
    {id:7,nvrd:"PGR-359",masterEpic:"Reporting",subTask:"[EPIC] Internal Campaign Reporting & Rewards Progress",pillar:"Core Platform",targetMarket:"Global",targetKPI:"Efficiency",impact:"XXXL",backend:"L",frontend:"",natives:"",qa:"M",inProgress:false},
    {id:8,nvrd:"PGR-299",masterEpic:"Optimove",subTask:"[Optimove] Inbox Integration",pillar:"Comms",targetMarket:"Global",targetKPI:"Efficiency",impact:"M",backend:"M",frontend:"",natives:"",qa:"S",inProgress:false},
    {id:9,nvrd:"PGR-313",masterEpic:"Marketplace",subTask:"Update Casino Loyalty Config - Novibet Club",pillar:"Expansion",targetMarket:"BR",targetKPI:"Revenue",impact:"M",backend:"S",frontend:"",natives:"",qa:"S",inProgress:false},
    {id:10,nvrd:"PGR-149",masterEpic:"Offers",subTask:"Casino In-game Offers Widget",pillar:"Comms",targetMarket:"Global",targetKPI:"Experience",impact:"L",backend:"XL",frontend:"M",natives:"L",qa:"M",inProgress:false},
    {id:11,nvrd:"PGR-145",masterEpic:"Offers",subTask:"[EPIC] 1-click Offers Opt-in",pillar:"Comms",targetMarket:"Global",targetKPI:"Revenue",impact:"M",backend:"XL",frontend:"S",natives:"M",qa:"S",inProgress:false},
    {id:12,nvrd:"PGR-148",masterEpic:"Offers",subTask:"[EPIC] Offers Consolidation & Unification",pillar:"Core Platform",targetMarket:"Global",targetKPI:"Efficiency",impact:"XXL",backend:"XXXL",frontend:"XXXL",natives:"XXXL",qa:"XXXL",inProgress:false},
    {id:13,nvrd:"PGR-314",masterEpic:"Welcome Offer v2",subTask:"Welcome Offer Revamp v2",pillar:"Acquisition",targetMarket:"GR",targetKPI:"Revenue",impact:"XL",backend:"XXL",frontend:"L",natives:"L",qa:"L",inProgress:false},
    {id:14,nvrd:"PGR-315",masterEpic:"Welcome Offer v2",subTask:"[Welcome Offer v2] Casino WO",pillar:"Acquisition",targetMarket:"GR",targetKPI:"Revenue",impact:"L",backend:"XL",frontend:"M",natives:"M",qa:"L",inProgress:false},
    {id:15,nvrd:"PGR-316",masterEpic:"Marketplace",subTask:"Marketplace: In-play mini game (Predictor / Slot / Wheel)",pillar:"Gamification",targetMarket:"Global",targetKPI:"Experience",impact:"XL",backend:"XXL",frontend:"M",natives:"L",qa:"L",inProgress:false},
    {id:16,nvrd:"PGR-317",masterEpic:"Challenges",subTask:"[Challenges] Leader Board",pillar:"Gamification",targetMarket:"Global",targetKPI:"Experience",impact:"L",backend:"XL",frontend:"L",natives:"XL",qa:"L",inProgress:false},
    {id:17,nvrd:"PGR-318",masterEpic:"Challenges",subTask:"[Challenges] Teams/Guilds/Social",pillar:"Gamification",targetMarket:"Global",targetKPI:"Experience",impact:"L",backend:"XXL",frontend:"L",natives:"XL",qa:"L",inProgress:false},
    {id:18,nvrd:"PGR-319",masterEpic:"Offers",subTask:"[Offers] Deep-link Offers from External Channels (Email/Push)",pillar:"Comms",targetMarket:"Global",targetKPI:"Revenue",impact:"M",backend:"M",frontend:"S",natives:"M",qa:"S",inProgress:false},
    {id:19,nvrd:"PGR-320",masterEpic:"Comms",subTask:"[Comms] WhatsApp Channel Integration",pillar:"Comms",targetMarket:"BR",targetKPI:"Revenue",impact:"M",backend:"M",frontend:"",natives:"",qa:"S",inProgress:false},
    {id:20,nvrd:"PGR-321",masterEpic:"Comms",subTask:"[Comms] Telegram Channel Integration",pillar:"Comms",targetMarket:"Global",targetKPI:"Experience",impact:"S",backend:"M",frontend:"",natives:"",qa:"S",inProgress:false},
    {id:21,nvrd:"PGR-322",masterEpic:"Comms",subTask:"Onsite Notification Feed Panel",pillar:"Comms",targetMarket:"Global",targetKPI:"Experience",impact:"M",backend:"S",frontend:"M",natives:"M",qa:"S",inProgress:false},
    {id:22,nvrd:"PGR-323",masterEpic:"Optimove",subTask:"[Optimove] Triggered Campaign Support",pillar:"Comms",targetMarket:"Global",targetKPI:"Revenue",impact:"L",backend:"L",frontend:"",natives:"",qa:"S",inProgress:false},
    {id:23,nvrd:"PGR-324",masterEpic:"Optimove",subTask:"[Optimove] A/B Testing Integration",pillar:"Comms",targetMarket:"Global",targetKPI:"Efficiency",impact:"M",backend:"M",frontend:"",natives:"",qa:"S",inProgress:false},
    {id:24,nvrd:"PGR-325",masterEpic:"Offers",subTask:"[Offers] Automated Bonus Suggestions (AI/ML)",pillar:"Core Platform",targetMarket:"Global",targetKPI:"Revenue",impact:"XXL",backend:"XXL",frontend:"M",natives:"M",qa:"L",inProgress:false},
    {id:25,nvrd:"PGR-326",masterEpic:"Reporting",subTask:"[Reporting] Campaign ROI Dashboard",pillar:"Core Platform",targetMarket:"Global",targetKPI:"Efficiency",impact:"XL",backend:"L",frontend:"L",natives:"",qa:"M",inProgress:false},
    {id:26,nvrd:"PGR-327",masterEpic:"Reporting",subTask:"[Reporting] Player Lifecycle Analytics",pillar:"Core Platform",targetMarket:"Global",targetKPI:"Efficiency",impact:"L",backend:"L",frontend:"M",natives:"",qa:"S",inProgress:false},
    {id:27,nvrd:"PGR-328",masterEpic:"Budget Optimization",subTask:"[Budget] Dynamic Budget Allocation Engine",pillar:"Core Platform",targetMarket:"Global",targetKPI:"Revenue",impact:"XXL",backend:"XXL",frontend:"L",natives:"",qa:"L",inProgress:false},
    {id:28,nvrd:"PGR-329",masterEpic:"Budget Optimization",subTask:"[Budget] Spend vs Performance Tracker",pillar:"Core Platform",targetMarket:"Global",targetKPI:"Efficiency",impact:"L",backend:"L",frontend:"M",natives:"",qa:"S",inProgress:false},
    {id:29,nvrd:"PGR-330",masterEpic:"Marketplace",subTask:"[Marketplace] Reward Shop",pillar:"Gamification",targetMarket:"Global",targetKPI:"Experience",impact:"XL",backend:"XL",frontend:"L",natives:"L",qa:"L",inProgress:false},
    {id:30,nvrd:"PGR-331",masterEpic:"Marketplace",subTask:"[Marketplace] BR Expansion",pillar:"Expansion",targetMarket:"BR",targetKPI:"Revenue",impact:"XL",backend:"S",frontend:"XS",natives:"S",qa:"S",inProgress:false},
    {id:31,nvrd:"PGR-332",masterEpic:"Challenges",subTask:"[Challenges] Daily/Weekly Streaks",pillar:"Gamification",targetMarket:"Global",targetKPI:"Experience",impact:"M",backend:"L",frontend:"M",natives:"L",qa:"M",inProgress:false},
    {id:32,nvrd:"PGR-333",masterEpic:"Challenges",subTask:"[Challenges] Custom Challenge Builder (Internal Tool)",pillar:"Core Platform",targetMarket:"Global",targetKPI:"Efficiency",impact:"L",backend:"XL",frontend:"XL",natives:"",qa:"L",inProgress:false},
    {id:33,nvrd:"PGR-334",masterEpic:"Comms",subTask:"[Comms] Rich Push Notifications (Images/Actions)",pillar:"Comms",targetMarket:"Global",targetKPI:"Experience",impact:"S",backend:"S",frontend:"",natives:"M",qa:"S",inProgress:false},
    {id:34,nvrd:"PGR-335",masterEpic:"Comms",subTask:"[Comms] SMS Fallback for Critical Notifications",pillar:"Comms",targetMarket:"Global",targetKPI:"Experience",impact:"S",backend:"M",frontend:"",natives:"",qa:"S",inProgress:false},
    {id:35,nvrd:"PGR-336",masterEpic:"Nova",subTask:"[Nova] Existing Customer Re-engagement Campaigns",pillar:"Acquisition",targetMarket:"GR",targetKPI:"Revenue",impact:"M",backend:"M",frontend:"S",natives:"",qa:"S",inProgress:false},
    {id:36,nvrd:"PGR-337",masterEpic:"Nova",subTask:"[Nova] Attribution & Tracking Improvements",pillar:"Acquisition",targetMarket:"GR",targetKPI:"Efficiency",impact:"M",backend:"L",frontend:"S",natives:"XS",qa:"S",inProgress:false},
    {id:37,nvrd:"PGR-338",masterEpic:"SEO & Affiliates",subTask:"[SEO] Content Management & SEO Toolkit",pillar:"Acquisition",targetMarket:"Global",targetKPI:"Revenue",impact:"L",backend:"M",frontend:"L",natives:"",qa:"S",inProgress:false},
    {id:38,nvrd:"PGR-339",masterEpic:"SEO & Affiliates",subTask:"[Affiliates] Partner Dashboard & Tracking",pillar:"Acquisition",targetMarket:"Global",targetKPI:"Revenue",impact:"L",backend:"L",frontend:"L",natives:"",qa:"M",inProgress:false},
    {id:39,nvrd:"PGR-340",masterEpic:"Offers",subTask:"[Offers] Geo-targeted Promotions",pillar:"Expansion",targetMarket:"Global",targetKPI:"Revenue",impact:"M",backend:"M",frontend:"S",natives:"S",qa:"S",inProgress:false},
    {id:40,nvrd:"PGR-341",masterEpic:"Offers",subTask:"[Offers] Time-limited Flash Deals Engine",pillar:"Core Bonus",targetMarket:"Global",targetKPI:"Revenue",impact:"L",backend:"L",frontend:"M",natives:"M",qa:"M",inProgress:false},
    {id:41,nvrd:"PGR-342",masterEpic:"Offers",subTask:"[Offers] VIP Tier-based Rewards System",pillar:"Core Bonus",targetMarket:"Global",targetKPI:"Revenue",impact:"XL",backend:"XXL",frontend:"L",natives:"L",qa:"L",inProgress:false},
    {id:42,nvrd:"PGR-343",masterEpic:"Offers",subTask:"[Offers] Cross-product Bundle Offers",pillar:"Core Bonus",targetMarket:"Global",targetKPI:"Revenue",impact:"L",backend:"L",frontend:"M",natives:"M",qa:"M",inProgress:false},
    {id:43,nvrd:"PGR-344",masterEpic:"Predictor",subTask:"[Predictor] Free-to-Play Predictor Game",pillar:"Gamification",targetMarket:"Global",targetKPI:"Experience",impact:"XL",backend:"XXL",frontend:"L",natives:"L",qa:"L",inProgress:false},
    {id:44,nvrd:"PGR-345",masterEpic:"Predictor",subTask:"[Predictor] Social Sharing & Leaderboards",pillar:"Gamification",targetMarket:"Global",targetKPI:"Experience",impact:"M",backend:"L",frontend:"M",natives:"M",qa:"M",inProgress:false},
    {id:45,nvrd:"PGR-346",masterEpic:"Marketplace",subTask:"[Marketplace] Dynamic Pricing Engine",pillar:"Core Platform",targetMarket:"Global",targetKPI:"Revenue",impact:"XXL",backend:"XXL",frontend:"S",natives:"S",qa:"L",inProgress:false},
    {id:46,nvrd:"PGR-347",masterEpic:"Marketplace",subTask:"[Marketplace] Multi-currency Support Enhancement",pillar:"Expansion",targetMarket:"Global",targetKPI:"Efficiency",impact:"L",backend:"L",frontend:"S",natives:"S",qa:"M",inProgress:false},
    {id:47,nvrd:"PGR-348",masterEpic:"Reporting",subTask:"[Reporting] Real-time Engagement Metrics Dashboard",pillar:"Core Platform",targetMarket:"Global",targetKPI:"Efficiency",impact:"L",backend:"M",frontend:"L",natives:"",qa:"S",inProgress:false},
    {id:48,nvrd:"PGR-349",masterEpic:"Comms",subTask:"[Comms] Preference Center & Opt-in Management",pillar:"Comms",targetMarket:"Global",targetKPI:"Experience",impact:"M",backend:"M",frontend:"M",natives:"M",qa:"S",inProgress:false},
    {id:49,nvrd:"PGR-350",masterEpic:"Challenges",subTask:"[Challenges] Achievement Badges & Collectibles",pillar:"Gamification",targetMarket:"Global",targetKPI:"Experience",impact:"M",backend:"L",frontend:"M",natives:"L",qa:"M",inProgress:false},
    {id:50,nvrd:"PGR-351",masterEpic:"Welcome Offer v2",subTask:"[Welcome Offer v2] Personalized Onboarding Flow",pillar:"Acquisition",targetMarket:"Global",targetKPI:"Revenue",impact:"L",backend:"L",frontend:"L",natives:"L",qa:"L",inProgress:false},
    {id:51,nvrd:"PGR-352",masterEpic:"Optimove",subTask:"[Optimove] Predictive Churn Prevention",pillar:"Comms",targetMarket:"Global",targetKPI:"Revenue",impact:"XL",backend:"XL",frontend:"S",natives:"",qa:"M",inProgress:false},
    {id:52,nvrd:"PGR-353",masterEpic:"Budget Optimization",subTask:"[Budget] Channel Mix Optimizer",pillar:"Core Platform",targetMarket:"Global",targetKPI:"Revenue",impact:"L",backend:"L",frontend:"M",natives:"",qa:"S",inProgress:false},
    {id:53,nvrd:"PGR-354",masterEpic:"Offers",subTask:"[Offers] Cashback & Rebate System",pillar:"Core Bonus",targetMarket:"Global",targetKPI:"Revenue",impact:"L",backend:"XL",frontend:"M",natives:"M",qa:"L",inProgress:false},
    {id:54,nvrd:"PGR-355",masterEpic:"Marketplace",subTask:"[Marketplace] Vendor Onboarding Portal",pillar:"Core Platform",targetMarket:"Global",targetKPI:"Efficiency",impact:"M",backend:"L",frontend:"L",natives:"",qa:"M",inProgress:false},
    {id:55,nvrd:"PGR-356",masterEpic:"Comms",subTask:"[Comms] In-app Survey & Feedback Module",pillar:"Comms",targetMarket:"Global",targetKPI:"Experience",impact:"S",backend:"M",frontend:"M",natives:"M",qa:"S",inProgress:false},
    {id:56,nvrd:"PGR-357",masterEpic:"Nova",subTask:"[Nova] Referral Program 2.0",pillar:"Acquisition",targetMarket:"GR",targetKPI:"Revenue",impact:"L",backend:"L",frontend:"M",natives:"M",qa:"M",inProgress:false},
    {id:57,nvrd:"PGR-358",masterEpic:"Reporting",subTask:"[Reporting] Automated Weekly Stakeholder Reports",pillar:"Core Platform",targetMarket:"Global",targetKPI:"Efficiency",impact:"M",backend:"M",frontend:"S",natives:"",qa:"S",inProgress:false},
    {id:58,nvrd:"PGR-360",masterEpic:"Challenges",subTask:"[Challenges] Multi-sport Challenge Templates",pillar:"Gamification",targetMarket:"Global",targetKPI:"Experience",impact:"M",backend:"L",frontend:"M",natives:"L",qa:"M",inProgress:false},
    {id:59,nvrd:"PGR-361",masterEpic:"Offers",subTask:"[Offers] Loyalty Points Exchange System",pillar:"Core Bonus",targetMarket:"Global",targetKPI:"Revenue",impact:"L",backend:"XL",frontend:"L",natives:"L",qa:"L",inProgress:false},
    {id:60,nvrd:"PGR-364",masterEpic:"Marketplace",subTask:"[Marketplace] GR Enhancement Pack",pillar:"Expansion",targetMarket:"GR",targetKPI:"Revenue",impact:"M",backend:"S",frontend:"S",natives:"S",qa:"S",inProgress:false},
    {id:61,nvrd:"PGR-365",masterEpic:"Comms",subTask:"[Comms] Email Template Builder",pillar:"Comms",targetMarket:"Global",targetKPI:"Efficiency",impact:"M",backend:"S",frontend:"L",natives:"",qa:"S",inProgress:false},
    {id:62,nvrd:"PGR-366",masterEpic:"Predictor",subTask:"[Predictor] Integration with Live Events",pillar:"Gamification",targetMarket:"Global",targetKPI:"Experience",impact:"L",backend:"XL",frontend:"M",natives:"M",qa:"L",inProgress:false},
    {id:63,nvrd:"PGR-367",masterEpic:"SEO & Affiliates",subTask:"[SEO] Technical SEO Automation Suite",pillar:"Acquisition",targetMarket:"Global",targetKPI:"Efficiency",impact:"M",backend:"L",frontend:"M",natives:"",qa:"S",inProgress:false},
  ];
  saveJSON(getProjectsFile('growth'), SEED);

  const inProgressIds = SEED.filter(p => p.inProgress).map(p => p.id);
  saveJSON(getStateFile('growth'), {
    capacity: { ...DEFAULT_CAPACITY },
    tracks: { 'core-bonus': inProgressIds, 'gateway': [] },
  });
  console.log(`Seeded ${SEED.length} Growth projects`);
}

// ── Express App ──
const app = express();
app.use(cors({
  origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN.split(','),
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '5mb' }));

// ── Request logging (debug) ──
app.use((req, res, next) => {
  console.log(`>> ${req.method} ${req.url}`);
  next();
});

// ── Debug: test POST endpoint ──
app.post('/api/test-post', (req, res) => {
  res.json({ ok: true, method: req.method, path: req.path, bodyKeys: Object.keys(req.body || {}) });
});

// ── Health ──
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── List verticals ──
app.get('/api/verticals', (req, res) => {
  const verticals = ['growth', 'sportsbook', 'casino', 'account', 'payments'];
  const result = verticals.map(key => {
    const projects = loadJSON(getProjectsFile(key), []);
    return { key, projectCount: projects.length };
  });
  res.json(result);
});

// ── Get projects for a vertical ──
app.get('/api/verticals/:key/projects', (req, res) => {
  const projects = loadJSON(getProjectsFile(req.params.key), []);
  res.json({ projects, totalCount: projects.length });
});

// ── Get state for a vertical ──
app.get('/api/verticals/:key/state', (req, res) => {
  const state = loadJSON(getStateFile(req.params.key), {
    capacity: { ...DEFAULT_CAPACITY },
    tracks: { ...DEFAULT_TRACKS },
  });
  res.json(state);
});

// ── Save state for a vertical (POST + PUT) ──
function saveStateHandler(req, res) {
  const { capacity, tracks, trackCapacity, splits, timelineConfig, milestones, timelineOverrides, sizeMap, trackSubLaneCounts, timelineLaneAssignments, trackBlockOrder, buffer } = req.body;
  if (!capacity || !tracks) {
    return res.status(400).json({ error: 'Missing capacity or tracks in body' });
  }
  // Merge with existing state so we never lose fields
  const existing = loadJSON(getStateFile(req.params.key), {});
  const state = { ...existing, capacity, tracks, updatedAt: new Date().toISOString() };
  if (trackCapacity !== undefined) state.trackCapacity = trackCapacity;
  if (splits !== undefined) state.splits = splits;
  if (timelineConfig !== undefined) state.timelineConfig = timelineConfig;
  if (milestones !== undefined) state.milestones = milestones;
  if (timelineOverrides !== undefined) state.timelineOverrides = timelineOverrides;
  if (sizeMap !== undefined) state.sizeMap = sizeMap;
  if (trackSubLaneCounts !== undefined) state.trackSubLaneCounts = trackSubLaneCounts;
  if (timelineLaneAssignments !== undefined) state.timelineLaneAssignments = timelineLaneAssignments;
  if (trackBlockOrder !== undefined) state.trackBlockOrder = trackBlockOrder;
  if (buffer !== undefined) state.buffer = buffer;
  saveJSON(getStateFile(req.params.key), state);
  res.json({ success: true });
}
app.post('/api/verticals/:key/state', saveStateHandler);
app.put('/api/verticals/:key/state', saveStateHandler);

// ── Save projects for a vertical (POST + PUT for compatibility) ──
app.post('/api/verticals/:key/projects', saveProjectsHandler);
app.put('/api/verticals/:key/projects', saveProjectsHandler);

function saveProjectsHandler(req, res) {
  const { projects } = req.body;
  if (!Array.isArray(projects)) {
    return res.status(400).json({ error: 'Projects must be an array' });
  }

  const VALID_SIZES = new Set(['', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL']);

  for (let i = 0; i < projects.length; i++) {
    const p = projects[i];
    if (p.id == null) {
      return res.status(400).json({ error: `Project at index ${i} missing required field (id)` });
    }
    if (p.impact && !VALID_SIZES.has(p.impact)) {
      return res.status(400).json({ error: `Project ${p.id}: invalid impact "${p.impact}"` });
    }
    for (const f of ['backend', 'frontend', 'natives', 'qa']) {
      if (p[f] && !VALID_SIZES.has(p[f])) {
        return res.status(400).json({ error: `Project ${p.id}: invalid ${f} size "${p[f]}"` });
      }
    }
  }

  try {
    saveJSON(getProjectsFile(req.params.key), projects);

    // Clean up tracks: remove IDs that no longer exist
    const validIds = new Set(projects.map(p => p.id));
    const existingState = loadJSON(getStateFile(req.params.key), {
      capacity: { ...DEFAULT_CAPACITY },
      tracks: { ...DEFAULT_TRACKS },
    });
    const cleanedTracks = {};
    for (const [tk, ids] of Object.entries(existingState.tracks || {})) {
      cleanedTracks[tk] = (ids || []).filter(id => validIds.has(id));
    }
    saveJSON(getStateFile(req.params.key), {
      ...existingState,
      tracks: cleanedTracks,
      updatedAt: new Date().toISOString(),
    });

    res.json({ success: true, projectCount: projects.length });
  } catch (err) {
    console.error('Save projects error:', err);
    res.status(500).json({ error: 'Failed to save projects' });
  }
}

// ── Catch-all 404 (debug) ──
app.use((req, res) => {
  console.log(`!! 404: ${req.method} ${req.url}`);
  res.status(404).json({ error: 'Route not found', method: req.method, url: req.url });
});

// ── Start ──
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Capacity Planner API running on 0.0.0.0:${PORT}`);
  console.log(`CORS origin: ${CORS_ORIGIN}`);
  console.log(`Data dir: ${DATA_DIR}`);
});
