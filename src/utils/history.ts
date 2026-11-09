import type { HomeAssistant } from 'custom-card-helpers';

/** [epoch ms, value] pairs in ascending time order. */
export type Series = [number, number][];
export type RawHistory = [number, string][];

const HOUR = 3.6e6;
const unique = (ids: (string | undefined)[]): string[] => [...new Set(ids.filter((id): id is string => !!id))];

/** Raw state history per entity for the past `hours`. */
export async function fetchHistory(
  hass: HomeAssistant,
  entityIds: (string | undefined)[],
  hours: number,
): Promise<Record<string, RawHistory>> {
  const ids = unique(entityIds);
  if (!ids.length) return {};
  try {
    const raw = await hass.callWS<Record<string, any[]>>({
      type: 'history/history_during_period',
      start_time: new Date(Date.now() - hours * HOUR).toISOString(),
      entity_ids: ids,
      minimal_response: true,
      no_attributes: true,
    });
    return Object.fromEntries(
      ids.map((id) => [id, (raw?.[id] ?? []).map((i): [number, string] => [(i.lu ?? i.lc) * 1000, String(i.s)])]),
    );
  } catch (err) {
    console.warn('ventilation-card: history fetch failed', err);
    return {};
  }
}

/** Hourly means from long-term statistics; cheap enough to read weeks of data. */
export async function fetchHourlyMeans(
  hass: HomeAssistant,
  entityIds: (string | undefined)[],
  days: number,
): Promise<Record<string, Series>> {
  const ids = unique(entityIds);
  if (!ids.length) return {};
  try {
    const raw = await hass.callWS<Record<string, any[]>>({
      type: 'recorder/statistics_during_period',
      start_time: new Date(Date.now() - days * 24 * HOUR).toISOString(),
      statistic_ids: ids,
      period: 'hour',
      types: ['mean'],
    });
    return Object.fromEntries(
      ids.map((id) => [
        id,
        (raw?.[id] ?? [])
          .filter((r) => typeof r.mean === 'number')
          .map((r): [number, number] => [new Date(r.start).getTime(), r.mean]),
      ]),
    );
  } catch (err) {
    console.warn('ventilation-card: statistics fetch failed', err);
    return {};
  }
}

/** Numeric states averaged into fixed time buckets so charts stay light. */
export function toSeries(raw: RawHistory, bucketMs = 10 * 60 * 1000): Series {
  const out: Series = [];
  let key = NaN;
  let sum = 0;
  let n = 0;
  const flush = () => n && out.push([key + bucketMs / 2, sum / n]);
  for (const [t, s] of raw) {
    const v = parseFloat(s);
    if (isNaN(v)) continue;
    const k = Math.floor(t / bucketMs) * bucketMs;
    if (k !== key) {
      flush();
      key = k;
      sum = n = 0;
    }
    sum += v;
    n++;
  }
  flush();
  return out;
}

/** Lookup telling whether a binary sensor was `on` (window open) at a time. */
export function wasOn(raw: RawHistory = []): (t: number) => boolean {
  return (t) => {
    let state = '';
    for (const [at, s] of raw) {
      if (at > t) break;
      state = s;
    }
    return state === 'on';
  };
}

/** Pair each point of `a` with the latest value of `b` at or before it. */
export function combine(a: Series, b: Series, fn: (x: number, y: number) => number): Series {
  const out: Series = [];
  let j = 0;
  for (const [t, x] of a) {
    while (j + 1 < b.length && b[j + 1][0] <= t) j++;
    if (b.length && b[j][0] <= t + HOUR) out.push([t, fn(x, b[j][1])]);
  }
  return out;
}

/** Typical time between two sensor updates (median gap), or null with too little data. */
export function medianGap(raw: RawHistory = []): number | null {
  const gaps = raw.slice(1).map((r, i) => r[0] - raw[i][0]).sort((a, b) => a - b);
  return gaps.length < 5 ? null : gaps[gaps.length >> 1];
}
