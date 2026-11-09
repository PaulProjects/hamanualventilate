/**
 * Mode-less ventilation advice.
 *
 * One rule set covers the whole year: each room has a target temperature and
 * a humidity ceiling, and the card says which single action moves the room
 * towards them — or that nothing outside will help right now.
 */
import { calculateAbsoluteHumidity, relativeHumidityAt } from './humidity';
import type { Series } from './history';

const HOUR = 3.6e6;
/** Dead band around the target (°C) so advice does not flap. */
export const TOLERANCE = 0.5;
/** Airing must lower relative humidity by at least this many points to be worth it. */
const MIN_DRYING = 5;
/** How far ahead "wait" looks for better outdoor air. */
const WAIT_HORIZON_H = 12;

/** Outdoor conditions at a point in time. */
export interface Outdoor {
  t: number;
  temp: number;
  rh?: number | null;
}

/**
 * First-order thermal model of a room: dT/dt = k·(T_out − T_in) + gain[hour].
 * k is per hour; gain (°C/h, one value per local hour of day) lumps everything
 * that follows a daily rhythm: sun on the windows, heating schedule, occupants.
 */
export interface Model {
  kClosed: number;
  kOpen: number;
  gain: number[];
  learned: boolean;
}

export const DEFAULT_MODEL: Model = { kClosed: 0.05, kOpen: 0.35, gain: Array(24).fill(0), learned: false };

/** Hour-of-day slot (0–23) nearest to a timestamp. */
const slot = (t: number) => new Date(t + HOUR / 2).getHours();

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);

/**
 * Fit the room model to hourly mean temperatures (as returned by recorder
 * statistics, timestamps on the hour). Hours with the window open are fitted
 * separately so the model knows how fast airing really changes this room.
 */
export function learnModel(indoor: Series, outdoor: Series, isOpen: (t: number) => boolean = () => false): Model {
  const out = new Map(outdoor);
  // [x = driving temperature difference, y = observed change per hour, hour-of-day slot]
  const closed: [number, number, number][] = [];
  const open: [number, number, number][] = [];
  for (let i = 0; i + 1 < indoor.length; i++) {
    const [t, v] = indoor[i];
    const [t2, v2] = indoor[i + 1];
    const o = out.get(t);
    if (o === undefined || t2 - t !== HOUR) continue;
    (isOpen(t2) ? open : closed).push([o - v, v2 - v, slot(t2)]);
  }
  if (closed.length < 48) return DEFAULT_MODEL;

  // Regression with one intercept per hour of day: comparing the same hour across
  // days separates insulation (k) from the daily sun/heating pattern (gain), which
  // would otherwise be mistaken for it because both follow the outdoor temperature.
  const n = Array(24).fill(0);
  const mx = Array(24).fill(0);
  const my = Array(24).fill(0);
  for (const [x, y, h] of closed) {
    n[h]++;
    mx[h] += x;
    my[h] += y;
  }
  for (let h = 0; h < 24; h++) {
    mx[h] /= n[h] || 1;
    my[h] /= n[h] || 1;
  }
  const sxx = sum(closed.map(([x, , h]) => (x - mx[h]) ** 2));
  if (sxx < 1) return DEFAULT_MODEL;
  const kClosed = clamp(sum(closed.map(([x, y, h]) => (x - mx[h]) * (y - my[h]))) / sxx, 0.005, 0.3);
  // Slots seen on fewer than 3 days stay neutral rather than trusting noise
  const gain = n.map((count, h) => (count >= 3 ? my[h] - kClosed * mx[h] : 0));

  let kOpen = Math.max(DEFAULT_MODEL.kOpen, kClosed * 3);
  const oxx = sum(open.map((p) => p[0] ** 2));
  if (open.length >= 6 && oxx > 1) {
    kOpen = clamp(sum(open.map(([x, y, h]) => x * (y - gain[h]))) / oxx, kClosed, 3);
  }
  return { kClosed, kOpen, gain, learned: true };
}

/**
 * Predict room temperature along `path` (path[0] is "now").
 * With `ventilate`, the window is open whenever outdoor air moves the room
 * towards the target and closed again once the target is reached.
 * series[i] is the room temperature at path[i].t.
 */
export function simulate(
  tIn: number,
  path: Outdoor[],
  m: Model,
  target: number,
  ventilate: boolean,
): { series: Series; openUntil?: number } {
  let T = tIn;
  let openUntil: number | undefined;
  const series: Series = [[path[0].t, T]];
  for (let i = 0; i + 1 < path.length; i++) {
    const p = path[i];
    const q = path[i + 1];
    // Sub-steps of at most an hour, so the hourly gain applies even to sparse (daily) forecasts
    const steps = Math.max(1, Math.ceil((q.t - p.t) / HOUR));
    const dt = (q.t - p.t) / steps / HOUR;
    for (let j = 0; j < steps; j++) {
      const mid = (j + 0.5) / steps;
      const start = p.t + (j / steps) * (q.t - p.t);
      const out = p.temp + (q.temp - p.temp) * mid;
      const helps = ventilate && ((T > target && out < T) || (T < target && out > T));
      const k = helps ? m.kOpen : m.kClosed;
      // Exact solution of the linear model: stable for any step size
      const eq = out + m.gain[slot(p.t + mid * (q.t - p.t))] / k;
      let next = eq + (T - eq) * Math.exp(-k * dt);
      if (helps && (T - target) * (next - target) < 0) {
        openUntil ??= start + (Math.log((T - eq) / (target - eq)) / k) * HOUR;
        next = target;
      } else if (ventilate && !helps) {
        openUntil ??= start;
      }
      T = next;
    }
    series.push([q.t, T]);
  }
  return { series, openUntil };
}

export type Action = 'air' | 'open' | 'wait' | 'heat' | 'close' | 'ok' | 'unknown';

export interface Advice {
  action: Action;
  /** What is off in the room, if anything. */
  why: 'warm' | 'cold' | 'humid' | null;
  /** open: ventilate until; wait: outdoor air helps from. */
  until?: number;
  /** Predicted room temperature with the window kept closed. */
  closed: Series;
  /** Predicted room temperature when ventilating whenever it helps. */
  open: Series;
  /** Relative humidity outdoor air would have at room temperature. */
  rhAfter: number | null;
}

export interface AdviceInput {
  now: number;
  tIn: number | null;
  rhIn: number | null;
  tOut: number | null;
  rhOut: number | null;
  target: number;
  maxRh: number;
  /** Future outdoor conditions, ascending. */
  forecast: Outdoor[];
  model: Model;
  windowOpen: boolean;
}

export function advise(i: AdviceInput): Advice {
  const { now, tIn, rhIn, tOut, rhOut, target, maxRh, model, windowOpen } = i;
  if (tIn === null || tOut === null) {
    return { action: 'unknown', why: null, closed: [], open: [], rhAfter: null };
  }
  const path: Outdoor[] = [{ t: now, temp: tOut, rh: rhOut }, ...i.forecast.filter((f) => f.t > now)];
  const closed = simulate(tIn, path, model, target, false).series;
  const open = simulate(tIn, path, model, target, true);

  const afterAiring = (temp: number, rh?: number | null) =>
    rh == null ? null : relativeHumidityAt(calculateAbsoluteHumidity(temp, rh), tIn);
  const rhAfter = afterAiring(tOut, rhOut);

  // Once the window is open, keep going until the target is actually reached
  const tol = windowOpen ? 0 : TOLERANCE;
  const warm = tIn > target + tol;
  const cold = tIn < target - tol;
  const humid = rhIn !== null && rhIn > maxRh;
  const dries = (rh: number | null) => humid && rh !== null && rh < rhIn! - MIN_DRYING;
  const why = warm ? 'warm' : cold ? 'cold' : humid ? 'humid' : null;
  const base = { why, closed, open: open.series, rhAfter } as const;

  // Long ventilation for temperature — unless it would make the room damp
  const tempHelps = (warm && tOut < tIn - tol) || (cold && tOut > tIn + tol);
  // Judged at the target temperature (where the room is heading), with 10 points of
  // slack: reaching a comfortable temperature outweighs slightly high humidity.
  const rhAtTarget = rhOut === null ? null : relativeHumidityAt(calculateAbsoluteHumidity(tOut, rhOut), target);
  const staysDry = rhAtTarget === null || rhAtTarget <= Math.max(maxRh + 10, rhIn ?? 0);
  if (tempHelps && staysDry) return { ...base, action: 'open', until: open.openUntil };

  // Humidity only needs a short airing, whatever the temperature outside
  if (dries(rhAfter)) return { ...base, action: 'air', why: 'humid' };

  if (windowOpen && why) return { ...base, action: 'close' };

  if (why) {
    for (let k = 1; k < path.length && path[k].t - now <= WAIT_HORIZON_H * HOUR; k++) {
      const f = path[k];
      const T = closed[k][1];
      if ((warm && f.temp < T - TOLERANCE) || (cold && f.temp > T + TOLERANCE) || dries(afterAiring(f.temp, f.rh))) {
        return { ...base, action: 'wait', until: f.t };
      }
    }
  }
  return { ...base, action: cold ? 'heat' : 'ok' };
}
