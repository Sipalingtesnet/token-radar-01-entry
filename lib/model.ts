// Token Radar-01 Value Model & Board Generator (Custom Dark Terminal Edition)
// Calibrates base multiple from the snapshot's live tokens (trimmed mean mcap/tvl),
// computes implied value with growth and age factors, and generates concrete farm steps.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface ModelWorking {
  base_multiple: number;
  growth_pct: number;
  growth_factor: number;
  age_days: number | null;
  age_factor: number;
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: null;
  listed_at: string | null;
  gecko_id: null;
  symbol: null;
  is_watchlist: boolean;
  status: 'pre-token';
  age_days: number | null;
  growth_factor: number;
  age_factor: number;
  implied_value_usd: number;
  model_note: string;
  model: ModelWorking;
  farm_steps: string[];
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  change_7d: number | null;
  mcap_tvl_ratio: number;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  base_multiple: number;
  watchlist_size: number;
  board_size: number;
  live_size: number;
  rows: BoardRow[];
  live: LiveRow[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
export const MODEL_VERSION = 'radar-terminal-v1';
const REF_DATE = '2026-11-14';

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

/** Compute age in days from as_of and listed_at. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Calibrate base multiple from live tokens (mcap present, tvl > 0) via trimmed mean (drop top/bottom 10%), clamped to [0.05, 1.50]. */
export function calibrateBaseMultiple(protocols: SnapshotProtocol[]): number {
  const ratios: number[] = [];
  for (const p of protocols) {
    if (p.mcap_usd !== null && p.tvl_usd > 0) {
      ratios.push(p.mcap_usd / p.tvl_usd);
    }
  }
  if (ratios.length === 0) return 0.40;
  ratios.sort((a, b) => a - b);
  const trimCount = Math.floor(ratios.length * 0.10);
  const trimmed = ratios.length > 20 && trimCount > 0 
    ? ratios.slice(trimCount, ratios.length - trimCount) 
    : ratios;
  const sum = trimmed.reduce((acc, r) => acc + r, 0);
  const mean = sum / trimmed.length;
  return round4(clamp(mean, 0.05, 1.50));
}

/** Whether a protocol records no token (gecko_id AND symbol null). */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.gecko_id === null && p.symbol === null;
}

/** Compute implied value and working factors for a pre-token protocol. */
export function computeImpliedValue(p: SnapshotProtocol, asOf: string, baseMultiple: number): { implied: number; growthPct: number; growthFactor: number; ageDaysVal: number | null; ageFactor: number; note: string } {
  const rawGrowth = typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : 0;
  const growthPct = clamp(rawGrowth, -60, 150);
  const growthFactor = round4(1 + growthPct / 200);

  const days = ageDays(asOf, p.listed_at);
  const ageYears = (days ?? 365) / 365;
  const ageFactor = round4(0.85 + 0.30 * Math.min(ageYears, 4) / 4);

  const rawImplied = p.tvl_usd * baseMultiple * growthFactor * ageFactor;
  const implied = Math.min(20_000_000_000, Math.max(1, Math.round(rawImplied)));

  const note = `TVL $${p.tvl_usd.toLocaleString()} x Base ${baseMultiple}x x Growth ${growthFactor}x (${growthPct > 0 ? '+' : ''}${growthPct}%) x Age ${ageFactor}x (${days ?? 365}d)`;

  return { implied, growthPct, growthFactor, ageDaysVal: days, ageFactor, note };
}

/** Generate 5-6 concrete farm steps based on TVL tier, category, chains, and age. */
export function generateFarmSteps(p: SnapshotProtocol, age: number | null): string[] {
  const chains = p.chains.length > 0 ? p.chains : ['Ethereum'];
  const primaryChain = chains[0]!;
  const cat = (p.category ?? 'Other').toLowerCase();
  const name = p.name;

  // TVL tier determines capital tranche
  // Tier A (TVL >= $500M) -> $1,000; Tier B (>= $100M) -> $500; Tier C -> $250
  const capital = p.tvl_usd >= 500_000_000 ? 1000 : p.tvl_usd >= 100_000_000 ? 500 : 250;
  const weeks = age !== null && age < 180 ? 8 : 6;

  // Category specific verb
  let actionVerb = 'deposit funds and interact with';
  let categoryAction = `Deposit $${capital} in ${name} liquidity or vault pool on ${primaryChain}`;
  if (cat.includes('dex')) {
    actionVerb = 'swap tokens and provide liquidity';
    categoryAction = `Swap $${capital} of stablecoins for native assets and provide liquidity in ${name}'s main pool on ${primaryChain}`;
  } else if (cat.includes('lend') || cat.includes('cdp') || cat.includes('borrow')) {
    actionVerb = 'supply collateral and borrow';
    categoryAction = `Supply $${capital} equivalent of USDC/ETH as collateral on ${name} on ${primaryChain} and borrow a conservative amount`;
  } else if (cat.includes('yield') || cat.includes('vault') || cat.includes('curator')) {
    actionVerb = 'deposit into yield vault';
    categoryAction = `Deposit $${capital} into ${name}'s principal vault on ${primaryChain} and hold receipt tokens`;
  } else if (cat.includes('bridge')) {
    actionVerb = 'bridge assets';
    categoryAction = `Bridge $${capital} of assets through ${name} to ${chains[1] || primaryChain} (~$3-8 gas, 10 min)`;
  } else if (cat.includes('staking') || cat.includes('restak') || cat.includes('liquid staking')) {
    actionVerb = 'stake assets';
    categoryAction = `Stake $${capital} of native assets on ${name} to receive liquid staking receipts on ${primaryChain}`;
  }

  const steps: string[] = [
    `1) Bridge $${capital} to ${primaryChain} via canonical bridge or reliable route (~$2-6 gas, 10-15 min setup).`,
    `2) ${categoryAction} (~$2-6 gas, 15 min execution).`,
    `3) Maintain position and repeat weekly weekly check-ins for ${weeks} weeks (~$1 gas/week, 10 min/week).`,
    chains.length > 1 
      ? `4) Execute secondary interaction on ${chains[1]} branch of ${name} with an extra $${Math.round(capital/2)} allocation (~$3 gas, 15 min).`
      : `4) Add a secondary LP or staking position on ${name} with 50% extra capital to boost multi-action score (~$3 gas, 15 min).`,
    `5) Track eligibility: verify balance retention weekly, screenshot dashboard status prior to any snapshots (~5 min/week).`,
    `6) Exit plan: unwind position across 2 tranches once token issuance or snapshot is confirmed, retaining 10% for residual rewards (~$3-10 gas, 30 min).`
  ];

  return steps.map(s => s.length > 600 ? s.slice(0, 597) + '...' : s);
}

/** Build the ranked board and live comparables from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const baseMultiple = calibrateBaseMultiple(snapshot.protocols);
  const watchlistSet = new Set(snapshot.watchlist);

  // Collect all pre-token protocols with tvl_usd >= 5,000,000
  const candidateMap = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = snapshot.protocols.find(x => x.slug === slug);
    if (p) candidateMap.set(slug, p);
  }
  for (const p of snapshot.protocols) {
    if (isPreToken(p) && p.tvl_usd >= 5_000_000 && !candidateMap.has(p.slug)) {
      candidateMap.set(p.slug, p);
    }
  }

  const scored = [...candidateMap.values()].map(p => {
    const res = computeImpliedValue(p, snapshot.as_of, baseMultiple);
    return {
      p,
      implied: res.implied,
      growthPct: res.growthPct,
      growthFactor: res.growthFactor,
      ageDaysVal: res.ageDaysVal,
      ageFactor: res.ageFactor,
      note: res.note
    };
  });

  // Sort by implied value descending, then TVL descending, then slug ascending
  scored.sort((a, b) => b.implied - a.implied || b.p.tvl_usd - a.p.tvl_usd || a.p.slug.localeCompare(b.p.slug));

  // Cap at 300 rows, ensuring all watchlist slugs are included
  const finalScored: typeof scored = [];
  const includedWatchlist = new Set<string>();
  
  for (const item of scored) {
    if (watchlistSet.has(item.p.slug)) {
      finalScored.push(item);
      includedWatchlist.add(item.p.slug);
    }
  }
  // Add missing watchlist items if any (just in case)
  for (const slug of snapshot.watchlist) {
    if (!includedWatchlist.has(slug)) {
      const p = snapshot.protocols.find(x => x.slug === slug);
      if (p) {
        const res = computeImpliedValue(p, snapshot.as_of, baseMultiple);
        finalScored.push({ p, implied: res.implied, growthPct: res.growthPct, growthFactor: res.growthFactor, ageDaysVal: res.ageDaysVal, ageFactor: res.ageFactor, note: res.note });
      }
    }
  }

  // Fill up to 300 with non-watchlist highest implied value
  for (const item of scored) {
    if (!watchlistSet.has(item.p.slug) && finalScored.length < 300) {
      if (!finalScored.includes(item)) {
        finalScored.push(item);
      }
    }
  }

  // Re-sort final list by implied value descending
  finalScored.sort((a, b) => b.implied - a.implied || b.p.tvl_usd - a.p.tvl_usd || a.p.slug.localeCompare(b.p.slug));

  const board: BoardRow[] = finalScored.map((item, idx) => ({
    rank: idx + 1,
    slug: item.p.slug,
    name: item.p.name,
    category: item.p.category,
    chains: item.p.chains,
    tvl_usd: item.p.tvl_usd,
    change_7d: item.p.change_7d,
    mcap_usd: null,
    listed_at: item.p.listed_at,
    gecko_id: null,
    symbol: null,
    is_watchlist: watchlistSet.has(item.p.slug),
    status: 'pre-token',
    age_days: item.ageDaysVal,
    growth_factor: item.growthFactor,
    age_factor: item.ageFactor,
    implied_value_usd: item.implied,
    model_note: item.note,
    model: {
      base_multiple: baseMultiple,
      growth_pct: item.growthPct,
      growth_factor: item.growthFactor,
      age_days: item.ageDaysVal,
      age_factor: item.ageFactor,
    },
    farm_steps: generateFarmSteps(item.p, item.ageDaysVal),
  }));

  // Live rows: top 12 live-token protocols by mcap_usd
  const liveRowsRaw = snapshot.protocols
    .filter(p => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0 && !isPreToken(p))
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0))
    .slice(0, 12);

  const live: LiveRow[] = liveRowsRaw.map(p => ({
    slug: p.slug,
    name: p.name,
    category: p.category,
    chains: p.chains,
    tvl_usd: p.tvl_usd,
    mcap_usd: p.mcap_usd!,
    change_7d: p.change_7d,
    mcap_tvl_ratio: round4((p.mcap_usd!) / p.tvl_usd),
  }));

  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    base_multiple: baseMultiple,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    live_size: live.length,
    rows: board,
    live,
  };

  return { board, radar };
}

/** Validate board before writing. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100) return `board has only ${board.length} rows (minimum 100 required)`;
  const slugs = new Set(board.map(r => r.slug));
  const missing = snapshot.watchlist.filter(s => !slugs.has(s));
  if (missing.length > 0) return `board misses ${missing.length} watchlist slugs: ${missing.slice(0, 5).join(', ')}`;

  for (let i = 0; i < board.length; i++) {
    if (board[i]!.rank !== i + 1) return `row index ${i} has rank ${board[i]!.rank} (expected ${i + 1})`;
  }

  for (let i = 1; i < board.length; i++) {
    if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) {
      return `row ${i + 1} (${board[i]!.slug}, val $${board[i]!.implied_value_usd}) outranks row ${i} (${board[i - 1]!.slug}, val $${board[i - 1]!.implied_value_usd})`;
    }
  }

  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all rows have identical implied value $${board[0]!.implied_value_usd}`;
  }

  for (const r of board) {
    if (!Array.isArray(r.farm_steps) || r.farm_steps.length < 5 || r.farm_steps.length > 6) {
      return `${r.slug} has ${r.farm_steps?.length ?? 0} farm steps (expected 5-6)`;
    }
    for (const s of r.farm_steps) {
      if (typeof s !== 'string' || s.length < 20 || s.length > 600) {
        return `${r.slug} farm step invalid length: ${s?.length ?? 0}`;
      }
    }
  }

  return null;
}

export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not valid JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new SnapshotError('snapshot.json must be an object');
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string') throw new SnapshotError('snapshot.json missing as_of');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json missing source');
  if (typeof o.floor_usd !== 'number') throw new SnapshotError('snapshot.json missing floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json missing protocols array');
  if (!Array.isArray(o.watchlist)) throw new SnapshotError('snapshot.json missing watchlist array');

  const protocols: SnapshotProtocol[] = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      throw new SnapshotError(`protocol ${i} is not an object`);
    }
    const p = v as Record<string, unknown>;
    return {
      slug: String(p.slug ?? ''),
      name: String(p.name ?? ''),
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: typeof p.tvl_usd === 'number' ? p.tvl_usd : 0,
      change_7d: typeof p.change_7d === 'number' ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });

  return {
    as_of: String(o.as_of),
    source: String(o.source),
    floor_usd: Number(o.floor_usd),
    protocols,
    watchlist: o.watchlist.map(String),
  };
}

export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
