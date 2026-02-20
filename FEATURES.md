# Capacity Planner — Feature Documentation

A capacity planning tool for engineering teams to manage project prioritization, resource allocation, and timeline visualization across multiple product verticals.

**Live URLs:**
- Frontend: https://capacity-planner-amber.vercel.app
- API: https://capacity-planner-production-1cf7.up.railway.app
- Repository: https://github.com/iOnRails/capacity-planner

---

## Architecture

The app is a single-page React 18 application (`index.html`) with Babel standalone transpilation (no build step), backed by an Express.js API (`api/server.js`) with WebSocket real-time sync. Data is persisted as JSON files on the server.

| Layer | Technology | File(s) |
|-------|-----------|---------|
| Frontend | React 18 + Babel standalone (CDN) | `index.html` |
| Audit Log Viewer | React 18 + Babel standalone | `audit.html` |
| API | Express.js + WebSocket (ws) | `api/server.js` |
| Data Storage | JSON files on disk | `api/data/*.json` |
| Auth | Google OAuth (domain-restricted) | Embedded in `index.html` |
| Hosting | Vercel (frontend) + Railway (API) | `vercel.json` |

---

## Core Features

### 1. Multi-Vertical Support

The planner supports 5 independent product verticals, each with its own projects, state, and capacity settings: **Growth**, **Sportsbook**, **Casino**, **Account**, and **Payments**.

- Vertical selector in the header allows switching between verticals
- Each vertical has independent projects, state, and configuration
- Data files: `projects_{vertical}.json` and `state_{vertical}.json`
- API routes are namespaced: `/api/verticals/:key/...`

### 2. Project Management

Projects are the core data entity. Each project has metadata fields and size estimations per discipline.

**Project Fields:**
- `id` (required) — unique identifier
- `nvrd` — external reference ID (e.g., JIRA)
- `masterEpic` — parent epic grouping
- `subTask` — project name/description
- `pillar` — strategic pillar (Expansion, Acquisition, Comms, Core Platform, Gamification, Core Bonus)
- `targetMarket` — target market (GR, BR, CY, MX, Global)
- `targetKPI` — target metric (Revenue, Experience, Efficiency)
- `impact` — estimated impact size (XS to XXXL)
- `backend`, `frontend`, `natives`, `qa` — discipline size estimates (XS to XXXL)
- `inProgress` — whether work has started

**Validation:** Size fields accept only: empty, XS, S, M, L, XL, XXL, XXXL.

**Files:** `api/server.js` (saveProjectsHandler, lines 601-653), `index.html` (project editing components)

### 3. Capacity Management

Team capacity is configured per discipline (Backend, Frontend, Natives, QA) as story points. Capacity can be set at the global level and overridden per swimlane track.

- **Global capacity:** Total SP available per discipline per sprint
- **Track capacity:** Optional per-track overrides (e.g., Gateway Backend gets 15 SP)
- **Buffer:** Additional buffer SP per discipline to account for unplanned work
- **Size map:** Configurable mapping from t-shirt sizes to story points (e.g., M = 8 SP)

**State fields:** `capacity`, `trackCapacity`, `buffer`, `sizeMap`

### 4. Swimlane Tracks (Roadmap)

Projects are organized into 3 swimlane tracks for the roadmap view: **Core Bonus**, **Gateway**, and **SEO & Affiliates**.

- Projects can be dragged between tracks and within tracks to reorder
- Each track shows its assigned projects as blocks with color-coded discipline bars
- Track capacity bars show used vs. available capacity per discipline
- Unallocated and overflow indicators per track

**State fields:** `tracks` (project ID assignments), `trackBlockOrder` (display ordering)

### 5. Drag-and-Drop Ordering

Blocks within each swimlane track can be reordered via drag-and-drop.

- Supports dragging regular project blocks and ghost/split blocks
- Can drag to start, end, or between existing blocks
- Block order is persisted per track in `trackBlockOrder`
- Ghost blocks (split portions) use the `ghost:{projectId}` key format

**State field:** `trackBlockOrder`

### 6. Project Splits

A project can be "split" across two swimlane tracks. When split, a portion of its story points is allocated to a target track while the remainder stays in the original track.

- Split configuration: target track + SP allocation per discipline
- Creates a "ghost block" in the target track representing the split portion
- Ghost blocks appear in the ordering as `ghost:{projectId}`
- Split can be created, modified, or removed

**State field:** `splits` — `{ projectId: { targetTrack, backend, frontend, natives, qa } }`

### 7. Timeline View

A Gantt-style timeline showing project bars positioned across sprints/weeks.

- Configurable total weeks and sprint duration
- Project bars can be dragged to adjust start/end positions
- Timeline overrides allow manual positioning of bars
- Lane assignments control which row each project appears in
- Sub-lane counts allow multiple rows per track

**State fields:** `timelineConfig`, `timelineOverrides`, `timelineLaneAssignments`, `trackSubLaneCounts`

### 8. Milestones

Named markers on the timeline at specific week positions with configurable colors.

- Add/remove milestones with label, week number, and color
- Displayed as vertical lines on the timeline view

**State field:** `milestones` — `[{ label, week, color }]`

### 9. Google OAuth Authentication

Domain-restricted authentication via Google Sign-In.

- Allowed domain: `novibet.com`
- Admin email: `kmermigkas@novibet.com`
- Google Client ID: `487456084105-01l0m47e7up61qb40sf2v7gtjmrp6hqt.apps.googleusercontent.com`
- Auth stored in localStorage (`cp_google_auth`)
- User email and name sent to API via `X-User-Email` and `X-User-Name` headers

**File:** `index.html` (AuthGate component)

### 10. Real-Time WebSocket Sync

Multi-tab and multi-user real-time sync using WebSocket with full-state broadcasting.

- Clients subscribe to a vertical: `{ type: 'subscribe', vertical: '...' }`
- On state/project save, server broadcasts full state + projects to all subscribed clients
- Broadcast includes `senderId` (from `X-WS-ID` header) so the originating tab can skip its own update
- Keepalive pings every 25 seconds prevent Railway/proxy from closing idle connections
- Welcome message `{ type: 'connected' }` sent on connection

**Server:** `api/server.js` (WebSocketServer, broadcastUpdate, keepalive interval)
**Client:** `index.html` (WebSocket connection management, auto-reconnect)

### 11. Conflict-Free State Merge

The state save system uses a field-level timestamp-based merge strategy to handle concurrent edits.

**How it works:**
1. Client loads state and receives `_loadedAt` timestamp
2. Client sends changed fields with `_loadedAt` when saving
3. Server checks per-field timestamps (`_fieldTs`) against client's `_loadedAt`
4. If field wasn't modified since client loaded → accept client's value
5. If conflict on object field → sub-key merge (client deletions respected, unchanged server keys preserved)
6. If conflict on non-object field (array, primitive) → reject, keep server value
7. No-op saves (identical value) don't bump field timestamps, preventing false conflicts

**Returns:** `{ success, mergedState, conflicts: [...rejected field names] }`

**File:** `api/server.js` (saveStateHandler, lines 496-595)

### 12. Fallback Polling

When WebSocket is unavailable or as a backup, clients poll the server for changes.

- Polls `/api/verticals/:key/poll` every 30 seconds
- Lightweight endpoint returns only `updatedAt` timestamp and project count (no full state)
- Full state fetch only triggered if `updatedAt` has changed
- Disabled while dragging or saving to avoid conflicts

**File:** `index.html` (polling logic), `api/server.js` (poll endpoint)

### 13. Human-Readable Audit Log

Every state and project change is logged with narrative descriptions.

**Narrative format:** Each change produces `{ text, icon }` objects with natural language descriptions.

**Icon categories:**
| Icon | Symbol | Color | Meaning |
|------|--------|-------|---------|
| move | ↔ | Blue | Item moved/reordered |
| plus | + | Green | Item added |
| minus | − | Red | Item removed |
| pencil | ✎ | Yellow | Item modified |
| split | ⑂ | Purple | Project split created |
| arrow-up | ↑ | Green | Value increased |
| arrow-down | ↓ | Red | Value decreased |

**Example narratives:**
- `Moved "SEO Cache Tool Enhancements" to position 2`
- `Changed Backend capacity from 32 to 46 SP`
- `Split "Casino Widget" to Gateway with 4 Backend, 2 Frontend`
- `Added milestone "Sprint Review" at week 4`
- `Changed Gateway sub-lanes from 1 to 3`

**Features:**
- 30-day retention with automatic pruning
- Filterable by user, vertical, and time range
- Expandable entries show detailed change narratives with color-coded icons
- Legacy format fallback for entries created before the narrative system
- Maximum 500 entries per query

**Files:** `api/server.js` (logAudit, describeStateChanges, buildNarratives, findMovedItem), `audit.html` (DiffDetails component)

### 14. Auto-Seeding

The Growth vertical is automatically seeded with 63 sample projects if no data exists, providing a realistic demo dataset.

**File:** `api/server.js` (seed section, lines 347-423)

---

## API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/health` | Health check |
| POST | `/api/test-post` | Debug endpoint |
| GET | `/api/verticals` | List all verticals with project counts |
| GET | `/api/verticals/:key/projects` | Get projects for a vertical |
| POST/PUT | `/api/verticals/:key/projects` | Save projects (with validation) |
| GET | `/api/verticals/:key/state` | Get full planner state |
| POST/PUT | `/api/verticals/:key/state` | Save state (with conflict-free merge) |
| GET | `/api/verticals/:key/poll` | Lightweight polling (updatedAt only) |
| GET | `/api/audit-log` | Query audit log (?user, ?vertical, ?days) |
| WS | `/ws` | WebSocket for real-time sync |

---

## State Fields Reference

| Field | Type | Description |
|-------|------|-------------|
| `capacity` | `{backend, frontend, natives, qa}` | Global team capacity (SP) |
| `tracks` | `{trackKey: [projectIds]}` | Swimlane track assignments |
| `trackCapacity` | `{trackKey: {discipline: SP}}` | Per-track capacity overrides |
| `splits` | `{projectId: {targetTrack, ...SP}}` | Project split configurations |
| `timelineConfig` | `{totalWeeks, sprintWeeks, ...}` | Timeline display settings |
| `milestones` | `[{label, week, color}]` | Timeline milestone markers |
| `timelineOverrides` | `{projectId: {startWeek, endWeek}}` | Manual bar positions |
| `sizeMap` | `{size: storyPoints}` | T-shirt size to SP mapping |
| `trackSubLaneCounts` | `{trackKey: count}` | Sub-lanes per track |
| `timelineLaneAssignments` | `{projectId: laneIndex}` | Lane assignments |
| `trackBlockOrder` | `{trackKey: [blockKeys]}` | Block display ordering |
| `buffer` | `{backend, frontend, natives, qa}` | Buffer capacity (SP) |

---

## Testing

Tests are located in `api/__tests__/` and run with Jest.

```bash
npm test                # Run all tests
npm run test:unit       # Unit tests only (helpers)
npm run test:integration # API integration tests only
npm run test:ws         # WebSocket tests only
npm run test:coverage   # Run with coverage report
```

**Test coverage:**
- **helpers.test.js** (59 tests) — Unit tests for buildNarratives (all 12 field types), findMovedItem, describeStateChanges, summarizeValue, loadJSON/saveJSON, logAudit
- **api.test.js** (34 tests) — Integration tests for all endpoints, project validation, track cleanup, state merge with conflict resolution, audit log filtering
- **websocket.test.js** (11 tests) — WebSocket connection, subscribe/unsubscribe, broadcast on state and project saves, sender exclusion, multi-client sync, disconnection cleanup, invalid message handling

---

## Deployment

- **Frontend (Vercel):** Auto-deploys from GitHub on push. Serves `index.html` and `audit.html`.
- **API (Railway):** Auto-deploy webhook is currently broken. Workaround: disconnect and reconnect the GitHub repo in Railway Settings to force a fresh deploy from the latest commit.

**Railway project:** https://railway.com/project/5fefb7ac-b24a-4cb5-899e-341b0de34f3f
