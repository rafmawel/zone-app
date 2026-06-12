import type { QueueState } from './firestore';

/**
 * Canonical queue-item key format.
 *
 * Every sport encodes the programme block segment (`b{N}`) even when its
 * planning model doesn't cycle weeks — sports without programme-block
 * tracking pass `1` as a synthetic default. Keeping one shape across
 * every sport means **save and read always match** and the legacy
 * pre-block format (`{sport}_w{N}_s{M}`) can be detected and migrated
 * in one place.
 *
 * Format: `{sport}_b{block}_w{week}_s{sessionIndex}`
 * Example: `weightlifting_b1_w3_s1`.
 */
export type QueueSport = 'weightlifting' | 'running' | 'musculation' | 'hyrox';

export function queueKey(
  sport: QueueSport,
  block: number,
  week: number,
  sessionIndex: number,
): string {
  return `${sport}_b${block}_w${week}_s${sessionIndex}`;
}

const SPORT_PREFIXES = new Set<QueueSport>([
  'weightlifting',
  'running',
  'musculation',
  'hyrox',
]);

/** Pre-block legacy shape: `{sport}_w{N}_s{M}`. */
const LEGACY_KEY = /^([a-z]+)_w(\d+)_s(\d+)$/;

/**
 * Convert a legacy queue key (no block segment) to the canonical
 * block-prefixed format. Returns the input unchanged when it's already
 * canonical or when the prefix isn't a known sport.
 *
 * The legacy completions were always written while the athlete was on
 * block 1 (the previous queue builder did not encode block on save), so
 * the migration uses `b1` as the synthetic value. For sports that don't
 * actually cycle blocks (running / musculation / hyrox) `b1` is the
 * default the canonical generator also uses.
 */
export function migrateLegacyQueueKey(raw: string): string {
  const m = raw.match(LEGACY_KEY);
  if (!m) return raw;
  if (!SPORT_PREFIXES.has(m[1] as QueueSport)) return raw;
  return `${m[1]}_b1_w${m[2]}_s${m[3]}`;
}

/**
 * Apply `migrateLegacyQueueKey` to every key in `state`. When migration
 * touched at least one key, returns a fresh object; otherwise returns the
 * input reference unchanged so callers can shortcut "no migration needed"
 * with a strict equality check (`normalizeQueueState(s) === s`).
 *
 * Collisions — when both a legacy entry and its canonical counterpart
 * exist for the same session — resolve in favour of the canonical entry
 * (the more recent format wins), regardless of `Object.entries` order.
 */
export function normalizeQueueState(state: QueueState): QueueState {
  let touched = false;
  for (const k of Object.keys(state)) {
    if (migrateLegacyQueueKey(k) !== k) {
      touched = true;
      break;
    }
  }
  if (!touched) return state;
  const out: QueueState = {};
  // First pass: copy canonical entries verbatim.
  for (const [k, v] of Object.entries(state)) {
    if (migrateLegacyQueueKey(k) === k) out[k] = v;
  }
  // Second pass: fill in entries that exist only in legacy form.
  for (const [k, v] of Object.entries(state)) {
    const canonical = migrateLegacyQueueKey(k);
    if (canonical === k) continue;
    if (out[canonical] === undefined) out[canonical] = v;
  }
  return out;
}
