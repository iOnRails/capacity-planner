// ══════════════════════════════════════════════════════════
// Capacity Planner — Shared Pure Computation Functions
// Used by both frontend (index.html via <script>) and tests (require)
// ══════════════════════════════════════════════════════════

const DEFAULT_SIZE_MAP = { XS: 0.5, S: 1, M: 2, L: 3, XL: 5, XXL: 8, XXXL: 13 };
const TRACK_KEYS = ['core-bonus', 'gateway', 'seo-aff'];
const DISCIPLINES = ['backend', 'frontend', 'natives', 'qa'];
const ZERO_DISC = () => ({ backend: 0, frontend: 0, natives: 0, qa: 0 });
const IMPACT_ORDER = { XXXL: 7, XXL: 6, XL: 5, L: 4, M: 3, S: 2, XS: 1 };
const PILLAR_COLORS = {
  'Expansion': '#00b894', 'Acquisition': '#0984e3', 'Core Platform': '#6c5ce7',
  'Comms': '#e67e22', 'Gamification': '#e84393', 'Core Bonus': '#fdcb6e',
};

// ── Size & Sprint Conversions ──

function sizeToSprints(size, sizeMap) {
  if (!size || size === 'nan' || size === '' || size === 'NaN') return 0;
  const map = sizeMap || DEFAULT_SIZE_MAP;
  return map[size] || 0;
}

function computeProjectSprints(project, sizeMap) {
  const b = sizeToSprints(project.backend, sizeMap);
  const f = sizeToSprints(project.frontend, sizeMap);
  const n = sizeToSprints(project.natives, sizeMap);
  const q = sizeToSprints(project.qa, sizeMap);
  return { backend: b, frontend: f, natives: n, qa: q, total: b + f + n + q };
}

// ── Effective Sprints (after splits) ──

function computeEffectiveSprints(project, splits, sizeMap) {
  const full = computeProjectSprints(project, sizeMap);
  const projectSplits = splits && splits[project.id];
  if (!projectSplits || typeof projectSplits !== 'object') return full;
  const sub = ZERO_DISC();
  for (const sizing of Object.values(projectSplits)) {
    if (sizing && typeof sizing === 'object') {
      for (const d of DISCIPLINES) sub[d] += (sizing[d] || 0);
    }
  }
  return {
    backend: Math.max(0, full.backend - sub.backend),
    frontend: Math.max(0, full.frontend - sub.frontend),
    natives: Math.max(0, full.natives - sub.natives),
    qa: Math.max(0, full.qa - sub.qa),
    total: Math.max(0, full.total - sub.backend - sub.frontend - sub.natives - sub.qa),
  };
}

// ── Migration ──

function migrateTracks(tracks) {
  const result = { ...tracks };
  if ('gamification' in result && !('gateway' in result)) {
    result['gateway'] = result['gamification'];
    delete result['gamification'];
  }
  if (!result['core-bonus']) result['core-bonus'] = [];
  if (!result['gateway']) result['gateway'] = [];
  if (!result['seo-aff']) result['seo-aff'] = [];
  return result;
}

function migrateTrackCapacity(tc) {
  const result = tc ? JSON.parse(JSON.stringify(tc)) : {};
  const ZERO = ZERO_DISC();
  if (!result['core-bonus']) result['core-bonus'] = { ...ZERO };
  if (!result['gateway']) result['gateway'] = { ...ZERO };
  if (!result['seo-aff']) result['seo-aff'] = { ...ZERO };
  return result;
}

// ── Track Helpers ──

function removeFromTracks(tracks, id) {
  const n = {};
  for (const k of Object.keys(tracks)) n[k] = tracks[k].filter(x => x !== id);
  return n;
}

// ── Deep Merge (client-side conflict resolution) ──

function deepMergeObject(localValue, latestServer, capturedServer) {
  // Only deep-merge plain objects (not arrays, not primitives)
  if (typeof localValue !== 'object' || localValue === null || Array.isArray(localValue)) return localValue;
  if (!latestServer) return localValue;
  const captured = capturedServer || latestServer;
  // Start from USER's version (respects deletions), then incorporate
  // server-side changes the user didn't touch.
  const merged = { ...localValue };
  const overlaid = [];
  const deleted = [];
  for (const subKey of Object.keys(latestServer)) {
    if (!(subKey in captured)) {
      // Key is NEW on the server (added after client loaded) — include it
      merged[subKey] = latestServer[subKey];
      overlaid.push('+' + subKey);
    } else if (subKey in localValue) {
      // Key exists in both — if user didn't change it, use server's latest
      if (JSON.stringify(localValue[subKey]) === JSON.stringify(captured[subKey])) {
        merged[subKey] = latestServer[subKey];
      }
      // else: user changed it — keep their version (already in merged)
    }
    // If key is in latestServer + captured but NOT in localValue:
    // user DELETED it — don't add it back (respects deletion)
  }
  for (const subKey of Object.keys(captured)) {
    if (!(subKey in localValue)) deleted.push(subKey);
  }
  return { merged, overlaid, deleted };
}

// ── Capacity Computations ──

function computeBuffered(values, buffer) {
  const result = {};
  for (const d of DISCIPLINES) {
    result[d] = Math.round((values[d] || 0) * (1 + (buffer[d] || 0) / 100) * 10) / 10;
  }
  return result;
}

function computeUsedCapacity(projects, roadmapIds, sizeMap) {
  const acc = ZERO_DISC();
  for (const p of projects) {
    if (roadmapIds.has(p.id)) {
      const s = computeProjectSprints(p, sizeMap);
      for (const d of DISCIPLINES) acc[d] += s[d];
    }
  }
  return acc;
}

function computeTotalDemand(projects, sizeMap) {
  const acc = ZERO_DISC();
  for (const p of projects) {
    const s = computeProjectSprints(p, sizeMap);
    for (const d of DISCIPLINES) acc[d] += s[d];
  }
  return acc;
}

function computeUnallocated(capacity, trackCapacity) {
  const result = {};
  for (const d of DISCIPLINES) {
    const allocated = Object.values(trackCapacity).reduce((s, tc) => s + (tc[d] || 0), 0);
    result[d] = (capacity[d] || 0) - allocated;
  }
  return result;
}

// ── Ghost Blocks ──

function computeGhostsByTrack(splits, projectById, tracks, trackKeys) {
  const keys = trackKeys || TRACK_KEYS;
  const result = {};
  for (const k of keys) result[k] = [];
  if (!splits || typeof splits !== 'object' || Array.isArray(splits)) return result;

  for (const [pidStr, trackSplits] of Object.entries(splits)) {
    if (!trackSplits || typeof trackSplits !== 'object') continue;
    const pid = parseInt(pidStr);
    if (isNaN(pid)) continue;
    const p = projectById[pid];
    if (!p) continue;
    // Find home track
    let homeTrack = '';
    if (tracks) {
      for (const tk of keys) {
        if ((tracks[tk] || []).includes(pid)) { homeTrack = tk; break; }
      }
    }
    for (const [targetTrack, sizing] of Object.entries(trackSplits)) {
      if (result[targetTrack] && sizing && typeof sizing === 'object') {
        result[targetTrack].push({ project: p, sizing, homeTrack });
      }
    }
  }
  return result;
}

// ── Track Used Capacity ──

function computeTrackUsed(trackProjectsMap, ghostsByTrackMap, splits, sizeMap, trackKeys) {
  const keys = trackKeys || TRACK_KEYS;
  const result = {};
  for (const tk of keys) {
    const fromProjects = (trackProjectsMap[tk] || []).reduce((acc, p) => {
      const s = computeEffectiveSprints(p, splits, sizeMap);
      for (const d of DISCIPLINES) acc[d] += s[d];
      return acc;
    }, ZERO_DISC());
    const fromGhosts = (ghostsByTrackMap[tk] || []).reduce((acc, g) => {
      if (!g || !g.sizing) return acc;
      for (const d of DISCIPLINES) acc[d] += (g.sizing[d] || 0);
      return acc;
    }, ZERO_DISC());
    result[tk] = {};
    for (const d of DISCIPLINES) result[tk][d] = fromProjects[d] + fromGhosts[d];
  }
  return result;
}

// ── Track Overflow Detection ──

function computeTrackOverflow(trackProjectsMap, trackCapacity, ghostsByTrackMap, trackBlockOrder, splits, sizeMap, trackKeys) {
  const keys = trackKeys || TRACK_KEYS;
  const result = {};
  for (const tk of keys) {
    const tc = trackCapacity[tk] || ZERO_DISC();
    const hasAllocation = Object.values(tc).some(v => v > 0);
    if (!hasAllocation) { result[tk] = {}; continue; }

    const running = ZERO_DISC();
    const overflows = {};

    // Build combined list in display order
    const realItems = (trackProjectsMap[tk] || []).map(p => ({ type: 'real', project: p }));
    const ghostItems = (ghostsByTrackMap[tk] || []).filter(g => g && g.sizing).map(g => ({ type: 'ghost', project: g.project, sizing: g.sizing }));
    const combined = [...realItems, ...ghostItems];
    const order = trackBlockOrder && trackBlockOrder[tk];
    if (order && order.length > 0) {
      combined.sort((a, b) => {
        const aKey = a.type === 'ghost' ? `ghost:${a.project.id}` : String(a.project.id);
        const bKey = b.type === 'ghost' ? `ghost:${b.project.id}` : String(b.project.id);
        const aIdx = order.indexOf(aKey);
        const bIdx = order.indexOf(bKey);
        if (aIdx === -1 && bIdx === -1) return 0;
        if (aIdx === -1) return 1;
        if (bIdx === -1) return 1;
        return aIdx - bIdx;
      });
    }

    for (const item of combined) {
      if (item.type === 'real') {
        const s = computeEffectiveSprints(item.project, splits, sizeMap);
        for (const d of DISCIPLINES) running[d] += s[d];
        const exceeded = [];
        for (const d of DISCIPLINES) {
          if (tc[d] > 0 && running[d] > tc[d]) exceeded.push(d);
        }
        if (exceeded.length > 0) overflows[item.project.id] = exceeded;
      } else {
        for (const d of DISCIPLINES) running[d] += (item.sizing[d] || 0);
        const exceeded = [];
        for (const d of DISCIPLINES) {
          if (tc[d] > 0 && running[d] > tc[d]) exceeded.push(d);
        }
        if (exceeded.length > 0) overflows[`ghost-${item.project.id}`] = exceeded;
      }
    }
    result[tk] = overflows;
  }
  return result;
}

// ── Filter & Sort ──

function filterProjects(projects, search, filters) {
  return projects.filter(p => {
    if (search) {
      const q = search.toLowerCase();
      if (!(p.subTask || '').toLowerCase().includes(q) &&
          !(p.nvrd || '').toLowerCase().includes(q) &&
          !(p.masterEpic || '').toLowerCase().includes(q)) return false;
    }
    if (filters.pillar && filters.pillar.length && !filters.pillar.includes(p.pillar)) return false;
    if (filters.market && filters.market.length && !filters.market.includes(p.targetMarket)) return false;
    if (filters.epic && filters.epic.length && !filters.epic.includes(p.masterEpic)) return false;
    if (filters.kpi && filters.kpi.length && !filters.kpi.includes(p.targetKPI)) return false;
    if (filters.impact && filters.impact.length && !filters.impact.includes(p.impact)) return false;
    return true;
  });
}

function sortProjects(projects, sortBy, sizeMap) {
  return [...projects].sort((a, b) => {
    if (sortBy === 'impact') return (IMPACT_ORDER[b.impact] || 0) - (IMPACT_ORDER[a.impact] || 0);
    if (sortBy === 'effort') return computeProjectSprints(b, sizeMap).total - computeProjectSprints(a, sizeMap).total;
    if (sortBy === 'name') return (a.subTask || '').localeCompare(b.subTask || '');
    if (sortBy === 'epic') return (a.masterEpic || '').localeCompare(b.masterEpic || '');
    if (sortBy === 'pillar') return (a.pillar || '').localeCompare(b.pillar || '');
    return 0;
  });
}

// ── UI Helpers ──

function getCapColor(pct) {
  if (pct <= 70) return 'var(--green)';
  if (pct <= 90) return 'var(--yellow)';
  return 'var(--red)';
}

function getBlockBg(pillar) {
  const c = PILLAR_COLORS[pillar] || '#6c5ce7';
  return `linear-gradient(135deg, ${c}cc, ${c}88)`;
}

// ── Exports (Node.js) / Globals (browser) ──

var CP = {
  DEFAULT_SIZE_MAP, TRACK_KEYS, DISCIPLINES, ZERO_DISC, IMPACT_ORDER, PILLAR_COLORS,
  sizeToSprints, computeProjectSprints, computeEffectiveSprints,
  migrateTracks, migrateTrackCapacity,
  removeFromTracks, deepMergeObject,
  computeBuffered, computeUsedCapacity, computeTotalDemand, computeUnallocated,
  computeGhostsByTrack, computeTrackUsed, computeTrackOverflow,
  filterProjects, sortProjects,
  getCapColor, getBlockBg,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CP;
}
