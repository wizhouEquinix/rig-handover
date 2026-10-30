import type { Night } from './types.js';

export type NightCounts = { ok: number; retry: number; fail: number };

export function countNight(n: Night): NightCounts {
  return {
    ok: n.rows.filter((r) => r.lastStatus === 'ok').length,
    retry: n.rows.reduce((sum, r) => sum + r.retries, 0),
    fail: n.rows.filter((r) => r.lastStatus === 'fail').length,
  };
}
