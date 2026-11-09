// Self-check for the advice rules: `npm test`
import { advise, learnModel, simulate, DEFAULT_MODEL, type AdviceInput, type Outdoor } from './advice';
import type { Series } from './history';

const HOUR = 3.6e6;
const now = Date.UTC(2026, 0, 1, 12);
const check = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(`FAIL: ${msg}`);
};
const flat = (temp: number, rh = 50, hours = 24): Outdoor[] =>
  Array.from({ length: hours }, (_, h) => ({ t: now + (h + 1) * HOUR, temp, rh }));
const input = (o: Partial<AdviceInput>): AdviceInput => ({
  now, tIn: 21, rhIn: 50, tOut: 10, rhOut: 50, target: 21, maxRh: 60,
  forecast: flat(o.tOut ?? 10), model: DEFAULT_MODEL, windowOpen: false, ...o,
});

// Winter: humid room, cold dry air outside → short airing, no duration
let a = advise(input({ rhIn: 70, tOut: 2, rhOut: 80 }));
check(a.action === 'air' && a.until === undefined, 'winter humidity → air briefly');

// Humid inside but muggy outside → airing would not dry, nothing to do
a = advise(input({ tIn: 21, rhIn: 65, tOut: 22, rhOut: 90, forecast: flat(22, 90) }));
check(a.action === 'ok' && a.why === 'humid', 'muggy outside → keep closed');

// Summer evening: room hot, cooler outside → ventilate, with an end time
a = advise(input({ tIn: 26, tOut: 18, forecast: flat(18) }));
check(a.action === 'open' && a.why === 'warm' && a.until! > now, 'summer evening → open with end time');

// Summer noon: room hot, hotter outside now, cool at night → wait
const evening: Outdoor[] = flat(30).map((f, h) => (h >= 6 ? { ...f, temp: 17 } : f));
a = advise(input({ tIn: 26, tOut: 30, forecast: evening }));
check(a.action === 'wait' && a.until === now + 7 * HOUR, 'summer noon → wait until it cools');

// Spring: room cool, warm outside → ventilate to warm
a = advise(input({ tIn: 18, tOut: 23, forecast: flat(23) }));
check(a.action === 'open' && a.why === 'cold', 'spring → open to warm');

// Winter: room cool, cold outside all day → heat
a = advise(input({ tIn: 18, tOut: 2, forecast: flat(2) }));
check(a.action === 'heat', 'winter cold → heat');

// Window left open while it only cools a cold room → close
a = advise(input({ tIn: 19, tOut: 2, forecast: flat(2), windowOpen: true }));
check(a.action === 'close', 'open window in winter → close');

// Comfortable room → nothing to do; missing sensors → unknown
check(advise(input({})).action === 'ok', 'comfortable → ok');
check(advise(input({ tIn: null })).action === 'unknown', 'no data → unknown');

// Ventilated prediction stops at the target instead of overshooting
const sim = simulate(26, [{ t: now, temp: 15 }, ...flat(15)], DEFAULT_MODEL, 21, true);
check(sim.series[2][1] === 21, 'ventilated prediction stops at target');
check(Math.abs(sim.openUntil! - now - 1.73 * HOUR) < 0.01 * HOUR, 'target reached after ~1.7 h');

// Learning separates insulation from a daily gain pattern (sun at midday)
const k = 0.1;
const sunny = (t: number) => (new Date(t + HOUR / 2).getHours() >= 10 && new Date(t + HOUR / 2).getHours() < 16 ? 0.3 : 0);
const outdoor: Series = Array.from({ length: 240 }, (_, h) => [h * HOUR, 5 + 8 * Math.sin(h / 4)]);
const indoor: Series = [[0, 20]];
for (let h = 0; h + 1 < outdoor.length; h++) {
  const t2 = (h + 1) * HOUR;
  indoor.push([t2, indoor[h][1] + k * (outdoor[h][1] - indoor[h][1]) + sunny(t2)]);
}
const m = learnModel(indoor, outdoor);
check(m.learned && Math.abs(m.kClosed - k) < 0.01, `learned k≈${k}, got ${m.kClosed}`);
check(Math.max(...m.gain) < 0.35 && Math.abs(Math.min(...m.gain)) < 0.05, 'learned midday gain ≈ 0.3 °C/h, none at night');
check(m.gain.filter((g) => g > 0.25).length === 6, 'gain covers exactly the six sunny hours');
check(!learnModel([], outdoor).learned, 'no data → default model');

console.log('advice self-check passed');
