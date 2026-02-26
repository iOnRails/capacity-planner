# Capacity Planner — Project Documentation

## Overview

A web-based capacity planning tool for managing engineering team workload across verticals (Growth, Sportsbook, Casino, Account, Payments). Projects are sized in T-shirt sizes, allocated to swimlane tracks (Core Bonus, Gateway, SEO & AFF), and visualized on a drag-and-drop roadmap with a timeline/Gantt view.

**Tech Stack**: Single-file React SPA (no build system) + Express.js API + JSON file storage
**Auth**: Google Sign-In restricted to @novibet.com
**Deployment**: Vercel (frontend), Railway (API + persistent volume at `/data`)

---

## Architecture

```
index.html          (4000+ lines) — Single-file React 18 app via CDN + Babel
audit.html          — Standalone audit log viewer
vercel.json         — SPA routing config
api/
  server.js         (895 lines) — Express.js API with WebSocket support
  package.json      — Dependencies: express, cors, ws; devDeps: jest, supertest
  __tests__/        — Test suite (119 tests across 4 files)
```

**CDN Dependencies** (loaded in index.html):
- React 18.2.0, ReactDOM 18.2.0, Babel 7.23.9
- XLSX 0.18.5 (SheetJS) for Excel import
- Google Sign-In API

**API URL**: `https://capacity-planner-production-1cf7.up.railway.app`
**GitHub**: `https://github.com/iOnRails/capacity-planner.git`

---

## Data Model

### Project Schema
```json
{
  "id": 1,
  "nvrd": "PGR-362",
  "masterEpic": "Marketplace",
  "subTask": "[Marketplace] CY Expansion",
  "pillar": "Expansion",
  "targetMarket": "CY",
  "targetKPI": "Revenue",
  "impact": "L",
  "backend": "S",
  "frontend": "XS",
  "natives": "S",
  "qa": "S",
  "inProgress": true
}
```

Valid sizes: `""`, `XS`, `S`, `M`, `L`, `XL`, `XXL`, `XXXL`
Valid pillars: Expansion, Acquisition, Core Platform, Comms, Gamification, Core Bonus
Valid KPIs: Revenue, Efficiency, Experience

### Vertical State (per vertical, stored as `state_{key}.json`)
```json
{
  "capacity": { "backend": 40, "frontend": 30, "natives": 25, "qa": 20 },
  "tracks": {
    "core-bonus": [1, 6, 7],
    "gateway": [13, 14],
    "seo-aff": [37, 38]
  },
  "trackCapacity": {
    "core-bonus": { "backend": 0, "frontend": 0, "natives": 0, "qa": 0 },
    "gateway": { "backend": 0, "frontend": 0, "natives": 0, "qa": 0 },
    "seo-aff": { "backend": 0, "frontend": 0, "natives": 0, "qa": 0 }
  },
  "splits": {
    "6": { "gateway": { "backend": "S", "frontend": "", "natives": "", "qa": "" } }
  },
  "timelineConfig": {
    "sprintStartDate": "2026-02-26",
    "sprintDurationWeeks": 2,
    "timeScale": "months"
  },
  "milestones": [{ "id": 1, "name": "Q1 Release", "date": "2026-03-31", "color": "#e84393" }],
  "timelineOverrides": {
    "core-bonus:6": { "startSprints": 2, "durationSprints": 5 }
  },
  "timelineLaneAssignments": { "core-bonus:6": 0 },
  "trackSubLaneCounts": { "core-bonus": 2 },
  "trackBlockOrder": {
    "core-bonus": ["1", "6", "ghost:7", "10"],
    "gateway": ["13", "14"]
  },
  "buffer": { "backend": 0, "frontend": 0, "natives": 0, "qa": 0 },
  "_fieldTs": { "tracks": 1708900000000, "trackBlockOrder": 1708900001000 },
  "updatedAt": "2026-02-26T10:00:00.000Z"
}
```

### Size Map (default, configurable per session)
| Size | Sprints |
|------|---------|
| XS   | 0.5     |
| S    | 1       |
| M    | 2       |
| L    | 3       |
| XL   | 5       |
| XXL  | 8       |
| XXXL | 13      |

---

## API Endpoints

### Projects
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/verticals/:key/projects` | Get all projects for a vertical |
| POST/PUT | `/api/verticals/:key/projects` | Save projects array (validates sizes) |

### State
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/verticals/:key/state` | Get full state with `_loadedAt` timestamp |
| POST/PUT | `/api/verticals/:key/state` | Save changed fields with conflict resolution |
| GET | `/api/verticals/:key/poll` | Lightweight check: returns `updatedAt` only |

### Snapshots
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/verticals/:key/snapshots` | List snapshot metadata for a vertical |
| POST | `/api/verticals/:key/snapshots` | Save named snapshot (state + projects) |
| POST | `/api/verticals/:key/snapshots/:id/restore` | Restore a snapshot |
| DELETE | `/api/verticals/:key/snapshots/:id` | Delete a snapshot |

### Other
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/verticals` | List verticals with project counts |
| GET | `/api/health` | Health check |
| GET | `/api/audit-log` | Query audit log (?user, ?vertical, ?days) |

### WebSocket
- Path: `/ws`
- Client sends: `{ "type": "subscribe", "vertical": "growth" }`
- Server broadcasts full state on save: `{ "type": "update", "vertical": "growth", "updatedAt": "...", "senderId": "abc123", "state": {...}, "projects": [...] }`
- Inline state avoids clients needing an HTTP fetch after WS notification (fixes background-tab throttling)
- Each client has unique `wsIdRef` sent as `X-WS-ID` header to skip own broadcasts
- **Keepalive pings**: Server sends `{ "type": "ping" }` every 25s to prevent proxy idle timeouts; clients respond with `pong`

---

## Conflict Resolution

The server uses **field-level timestamps** (`_fieldTs`) for optimistic concurrency:

1. Client sends `_loadedAt` (timestamp when it last fetched state) + only changed fields
2. For each field:
   - If `fieldTs[field] <= _loadedAt` → **Accept** (no conflict)
   - If conflict on **object field** (tracks, trackBlockOrder, etc.) → **Sub-key merge**: accept client's changed sub-keys, keep server's for the rest
   - If conflict on **primitive/array field** → **Reject**, keep server's version
3. Only bumps `fieldTs[field]` when value actually changes (prevents no-op false conflicts)
4. Returns `{ mergedState, conflicts: [rejected field names] }`

### Client-Side Deep Merge
Before sending, the client does sub-key level merging for object fields:
- Captures `serverSnapshotRef` at change time
- On save, compares local state against captured snapshot to find user-changed sub-keys
- Reads LATEST `serverSnapshotRef` as the merge base
- Overlays only user-changed sub-keys on top of latest server state
- This preserves other users' changes to different sub-keys within the same field

### Snapshot Consistency
The `serverSnapshotRef` stores **migrated/defaulted** values (matching what React state actually holds), not raw server responses. This prevents false "changed" detection from migration artifacts (e.g., `migrateTracks` adding missing track keys).

---

## Frontend Features

### Planner View (main view)
- **Roadmap Lane**: 3 swimlane tracks (Core Bonus, Gateway, SEO & AFF) with drag-and-drop project blocks
- **Backlog Lane**: Unallocated projects
- **Block sizing**: Width proportional to total sprints (min 100px, max 360px)
- **Overflow detection**: Red badge when a project pushes track capacity over allocation
- **Ghost blocks**: Dashed blocks showing split allocations from other tracks
- **Drag reordering**: Reorder blocks within a track (persisted as `trackBlockOrder`)
- **Drag between tracks**: Move projects between swimlanes or to/from backlog
- **Capacity bars**: Per-discipline utilization percentage per track

### Configuration Panel (collapsible tabs)
- **Configuration**: Team capacity per discipline + T-shirt size mapping
- **Swimlane Allocation**: Per-track capacity allocation with validation (can't exceed total)
- **Demand & Buffer**: Total demand view + buffer percentage adjustments
- **Capacity Usage**: Visual bars for all disciplines + total

### Timeline / Gantt View (modal)
- **Ruler**: Weeks, months, or quarters scale
- **Project bars**: Positioned and sized based on sprints, draggable
- **Resize handles**: Left/right handles to adjust start/duration
- **Lane assignment**: Drag vertically to assign sub-lanes
- **Sub-lanes**: Add/remove parallel lanes per track
- **Milestones**: Vertical lines with flags, CRUD operations
- **Auto-layout**: Default positioning based on sprint count, overridable

### Split Allocation Modal
- Allocate partial project work to other tracks
- Per-discipline sizing with validation (can't over-split)
- Ghost blocks appear in target tracks

### Projects Table View
- **Editable grid**: Click to edit any cell inline
- **Bulk operations**: Multi-select + bulk field edit/delete
- **Excel import**: .xlsx/.xls/.csv with flexible column mapping (case-insensitive, matches by epic+subTask)
- **Search**: Filters by subTask, nvrd, masterEpic
- **Filter dropdowns**: Pillar, Epic, Market, KPI, Impact (multi-select)
- **Sorting**: Impact (desc), Effort (desc), Name, Epic, Pillar
- **Add/Delete**: Individual project management

### Undo/Redo
- **History stack**: `useRef`-based undo/redo stacks (max 50 entries)
- **Keyboard shortcuts**: `Ctrl+Z` (undo), `Ctrl+Shift+Z` / `Ctrl+Y` (redo)
- **Header buttons**: Undo/Redo buttons with disabled state when stack is empty
- **Skip capture**: `skipUndoRef` prevents capturing state during undo/redo operations
- **Auto-save**: Undo/redo triggers a debounced save to persist the restored state
- Wraps `setVerticalStates` via `setVerticalStatesWithUndo` to capture state before every mutation

### Dashboard View
- **Summary cards**: Total Projects, In Roadmap, In Progress, In Backlog counts
- **Capacity Utilization**: Per-discipline bars showing used vs available sprints
- **Demand vs Supply**: Side-by-side comparison with buffered values
- **Per-Track Breakdown**: Table with allocated/used/remaining per track per discipline
- **Projects by Pillar**: Horizontal bar chart
- **Projects by Impact Size**: Bar chart (XS through XXXL)
- **Size Map Reference**: Grid showing current T-shirt size → sprint mappings
- Accessible via "Dashboard" tab in the header

### Scenario Snapshots
- **Save**: Capture current state + projects as a named snapshot with optional description
- **Restore**: Load a previously saved snapshot, overwriting current state and projects
- **Delete**: Remove snapshots no longer needed
- **Modal UI**: Accessible via "Snapshots" button in the header
- Stored server-side as `snapshots_{vertical}.json`

### Auth
- Google Sign-In with @novibet.com domain restriction
- JWT decode (no server-side verification)
- Auto-refresh on expiration
- Audit log link visible only for specific admin email

### Real-time Sync
- **WebSocket**: Full-state broadcast — server sends state + projects inline with WS messages
- **Keepalive pings**: Server pings every 25s, client responds with pong (prevents proxy idle disconnect)
- **Deferred sync**: If a WS/poll notification arrives during an in-flight save, sync runs after save completes
- **Cancel pending save**: When server has newer data, pending local debounced saves are cancelled
- **Fallback poll**: 30-second interval lightweight poll endpoint
- **Visibility change**: Immediate sync when tab becomes visible
- **Debounced saves**: 800ms debounce, captures state at change time
- **Beacon API**: Flushes pending saves on page unload

---

## Verticals & Tracks

**5 Verticals**: Growth, Sportsbook, Casino, Account, Payments
**3 Tracks per vertical**: Core Bonus (yellow), Gateway (pink), SEO & AFF (green)
**4 Disciplines**: Backend, Frontend, Natives, QA

Each vertical has independent projects, state, and capacity configuration.

---

## Key Implementation Notes

### Single-File Architecture
The entire frontend is in `index.html` — no build system, no bundler. React and Babel are loaded from CDN. This means:
- All components are in one file (search by function name)
- State management is via React hooks (useState, useRef, useCallback, useMemo)
- No module imports — everything is in global scope or closure

### Data Persistence
- JSON files on Railway's persistent volume (`DATA_DIR=/data`)
- No database — reads/writes are synchronous `fs.readFileSync`/`fs.writeFileSync`
- File naming: `projects_{vertical}.json`, `state_{vertical}.json`, `snapshots_{vertical}.json`, `audit_log.json`

### Migration Functions
- `migrateTracks()`: Renames legacy 'gamification' → 'gateway', ensures all 3 track keys exist
- `migrateTrackCapacity()`: Ensures all 3 track keys exist with zero defaults

### Known Issues / In Progress
- **Multi-tab sync**: WebSocket notifications work but the underlying conflict resolution for simultaneous edits to the same object field (e.g., two users reordering different tracks within `trackBlockOrder`) can still lose changes in edge cases. The sub-key merge on both client and server handles most cases but rapid concurrent edits to the same field remain challenging.
- **Console logging**: Debug logs (`[ws]`, `[sync]`, `[save]`, `[deepMerge]`, `[merge]`) are still present for diagnostics

---

## Environment Variables (Railway)

| Variable | Value | Description |
|----------|-------|-------------|
| `PORT` | 3000 (default) | Server port |
| `CORS_ORIGIN` | `*` | Allowed origins |
| `DATA_DIR` | `/data` | Persistent volume path |

---

## Audit System

All state and project changes are logged to `audit_log.json` with:
- User email and name (from Google auth headers)
- **Rich narrative descriptions**: Human-readable diffs with project name resolution (e.g., "Moved [Marketplace] CY Expansion to Core Bonus", "Changed Backend capacity from 40 to 46 SP")
- **Structured diffs**: `{ summary, diffs[] }` format — summary has first 2 narratives + "and N more", diffs array has all individual change narratives
- Helper functions: `buildNarratives()` (per-field narrative generation), `findMovedItem()` (detects reorders in arrays), `summarizeValue()` (truncates long objects)
- Vertical, method, endpoint
- Auto-pruned after 30 days
- Queryable via `GET /api/audit-log?user=&vertical=&days=`
- Standalone viewer at `audit.html`

## Testing

- **119 tests** across 4 test files in `api/__tests__/`
- `helpers.test.js` — loadJSON, saveJSON, buildNarratives, findMovedItem, summarizeValue, describeStateChanges, logAudit
- `api.test.js` — All REST endpoints, validation, conflict resolution
- `websocket.test.js` — WS subscribe, broadcast, sender exclusion, multi-client, disconnect
- `snapshots.test.js` — Snapshot CRUD, restore, audit logging
- Run: `npm test` (or `npm run test:unit`, `test:integration`, `test:ws`, `test:snapshots`)
- `require.main === module` guard on server allows test imports without starting the listener
