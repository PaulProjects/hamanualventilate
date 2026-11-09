import { LitElement, html, svg, TemplateResult, PropertyValues, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { fireEvent, type HomeAssistant, type LovelaceCardEditor } from 'custom-card-helpers';

import type { VentilationCardConfig, RoomConfig, ForecastEntry } from './types';
import {
  CARD_VERSION,
  CARD_NAME,
  CARD_EDITOR_NAME,
  IS_DEV,
  DEFAULT_TARGET_TEMPERATURE,
  DEFAULT_MAX_HUMIDITY,
  DEFAULT_ROOM_ICON,
  DEFAULT_HISTORY_HOURS,
  DEFAULT_FORECAST_HOURS,
  DEFAULT_GRAPH,
  LEARN_DAYS,
} from './const';
import { cardStyles } from './styles';
import { localize } from './localize/localize';
import { calculateAbsoluteHumidity } from './utils/humidity';
import { subscribeForecast } from './utils/forecast';
import { fetchHistory, fetchHourlyMeans, toSeries, wasOn, combine, medianGap, Series } from './utils/history';
import { advise, learnModel, Advice, Model, Outdoor, DEFAULT_MODEL, TOLERANCE } from './utils/advice';

console.info(
  `%c  VENTILATION-CARD${IS_DEV ? ' (DEV)' : ''} \n%c  ${localize('common.version')} ${CARD_VERSION}    `,
  'color: orange; font-weight: bold; background: black',
  'color: white; font-weight: bold; background: dimgray',
);

const w = window as unknown as { customCards?: Array<{ type: string; name: string; description: string }> };
w.customCards = w.customCards || [];
w.customCards.push({
  type: CARD_NAME,
  name: IS_DEV ? 'Ventilation Card (Dev)' : 'Ventilation Card',
  description: 'Shows room climate and when to ventilate, heat or wait',
});

const HOUR = 3.6e6;
const MINUTE = 60 * 1000;
const REFRESH_MS = 10 * MINUTE;
const METRICS = ['t', 'rh', 'ah'] as const;
type Metric = (typeof METRICS)[number];
const UNIT: Record<Metric, string> = { t: '°C', rh: '%', ah: 'g/m³' };

/** Config names for the metrics that can be drawn in the room graph. */
const GRAPH_NAME: Record<Metric, string> = { t: 'temperature', rh: 'humidity', ah: 'absolute_humidity' };

interface Line {
  metric: Metric;
  pts: Series;
  outdoor?: boolean;
  dashed?: boolean;
}

const fmt = (v: number | null, digits = 1) => (v === null ? '–' : v.toFixed(digits));
const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
/** Compact duration: "<1 min", "12 min", "3 h". */
const duration = (ms: number) => (ms < MINUTE ? '<1 min' : ms < 90 * MINUTE ? `${Math.round(ms / MINUTE)} min` : `${Math.round(ms / HOUR)} h`);
const toNum = (v: unknown): number | null => {
  const n = parseFloat(String(v));
  return isNaN(n) ? null : n;
};

@customElement(CARD_NAME)
export class VentilationCard extends LitElement {
  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import('./editor');
    return document.createElement(CARD_EDITOR_NAME) as unknown as LovelaceCardEditor;
  }

  public static getStubConfig(): Record<string, unknown> {
    return { target_temperature: DEFAULT_TARGET_TEMPERATURE, rooms: [{ name: 'Living Room', temperature: '' }] };
  }

  @property({ attribute: false }) public hass!: HomeAssistant;
  @state() private config!: VentilationCardConfig;
  @state() private _forecast: ForecastEntry[] = [];
  @state() private _expanded = new Set<number>();
  @state() private _hist: Record<string, Series> = {};
  @state() private _models: Model[] = [];
  /** Learned typical update interval per sensor (ms). */
  @state() private _interval: Record<string, number | null> = {};

  private _unsub?: () => void;
  private _subscribed?: string;
  private _timer?: number;
  private _loaded = false;
  private _learnedAt = 0;

  static styles = cardStyles;

  public setConfig(config: VentilationCardConfig): void {
    if (!config?.rooms?.length) throw new Error(localize('common.invalid_configuration'));
    this.config = config;
    this._loaded = false;
    this._learnedAt = 0;
  }

  public getCardSize(): number {
    return 2 + (this.config?.rooms.length ?? 0);
  }

  public connectedCallback(): void {
    super.connectedCallback();
    // Tick every minute so "x min ago" stays current; reload history every 10th tick
    let ticks = 0;
    this._timer = window.setInterval(() => {
      this.requestUpdate();
      if (++ticks % (REFRESH_MS / MINUTE) === 0) this._load();
    }, MINUTE);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearInterval(this._timer);
    this._unsub?.();
    this._unsub = this._subscribed = undefined;
  }

  protected shouldUpdate(changed: PropertyValues): boolean {
    if (!this.config) return false;
    if (changed.size > 1 || !changed.has('hass')) return true;
    const old = changed.get('hass') as HomeAssistant | undefined;
    if (!old) return true;
    const c = this.config;
    return [
      c.weather_entity,
      c.outdoor_temperature,
      c.outdoor_humidity,
      ...c.rooms.flatMap((r) => [r.temperature, r.humidity, r.window_sensor]),
    ].some((id) => id && old.states[id] !== this.hass.states[id]);
  }

  protected updated(): void {
    if (!this.hass || !this.config) return;
    this._syncForecast();
    if (!this._loaded) {
      this._loaded = true;
      this._load();
    }
  }

  private _syncForecast(): void {
    const id = this.config.weather_entity;
    if (id === this._subscribed) return;
    this._unsub?.();
    this._unsub = undefined;
    this._subscribed = id;
    this._forecast = [];
    if (!id) return;
    subscribeForecast(this.hass, id, (f) => this._subscribed === id && (this._forecast = f))
      .then((unsub) => (this._subscribed === id ? (this._unsub = unsub) : unsub()))
      .catch(() => undefined);
  }

  /** Recent history for the graphs, plus (every few hours) the learned room models. */
  private async _load(): Promise<void> {
    const c = this.config;
    const hass = this.hass;
    if (!hass || !c) return;
    const temps = c.rooms.map((r) => r.temperature);
    const raw = await fetchHistory(
      hass,
      [c.outdoor_temperature, c.outdoor_humidity, ...temps, ...c.rooms.map((r) => r.humidity)],
      c.history_hours ?? DEFAULT_HISTORY_HOURS,
    );
    this._hist = Object.fromEntries(Object.entries(raw).map(([id, r]) => [id, toSeries(r)]));
    this._interval = Object.fromEntries(Object.entries(raw).map(([id, r]) => [id, medianGap(r)]));

    // ponytail: learning needs an outdoor temperature *sensor* with long-term statistics;
    // with only a weather entity the default model is used.
    if (!c.outdoor_temperature || Date.now() - this._learnedAt < 6 * HOUR) return;
    this._learnedAt = Date.now();
    const [means, windows] = await Promise.all([
      fetchHourlyMeans(hass, [c.outdoor_temperature, ...temps], LEARN_DAYS),
      fetchHistory(hass, c.rooms.map((r) => r.window_sensor), LEARN_DAYS * 24),
    ]);
    const outdoor = means[c.outdoor_temperature] ?? [];
    this._models = c.rooms.map((r) =>
      learnModel(means[r.temperature] ?? [], outdoor, wasOn(windows[r.window_sensor ?? ''])),
    );
  }

  private _read(entityId?: string): number | null {
    return entityId ? toNum(this.hass.states[entityId]?.state) : null;
  }

  private _toggle(idx: number): void {
    const next = new Set(this._expanded);
    if (!next.delete(idx)) next.add(idx);
    this._expanded = next;
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this.hass || !this.config) return nothing;
    const c = this.config;
    const now = Date.now();
    const horizon = now + (c.forecast_hours ?? DEFAULT_FORECAST_HOURS) * HOUR;
    const span: [number, number] = [now - (c.history_hours ?? DEFAULT_HISTORY_HOURS) * HOUR, horizon];

    const weather = this.hass.states[c.weather_entity ?? '']?.attributes;
    const tOut = this._read(c.outdoor_temperature) ?? toNum(weather?.temperature);
    const rhOut = this._read(c.outdoor_humidity) ?? toNum(weather?.humidity);
    const ahOut = tOut !== null && rhOut !== null ? calculateAbsoluteHumidity(tOut, rhOut) : null;

    const forecast: Outdoor[] = this._forecast
      .map((f) => ({ t: Date.parse(f.datetime), temp: f.temperature, rh: f.humidity }))
      .filter((f) => f.t > now && f.t <= horizon)
      .sort((a, b) => a.t - b.t);

    // Outdoor curves are shared by every room graph: history → now → forecast
    const histT = this._hist[c.outdoor_temperature ?? ''] ?? [];
    const histRh = this._hist[c.outdoor_humidity ?? ''] ?? [];
    const outT: Series = [...histT, ...(tOut !== null ? [[now, tOut] as [number, number]] : []), ...forecast.map((f): [number, number] => [f.t, f.temp])];
    const outAh: Series = [
      ...combine(histRh, histT, (rh, t) => calculateAbsoluteHumidity(t, rh)),
      ...(ahOut !== null ? [[now, ahOut] as [number, number]] : []),
      ...forecast.filter((f) => f.rh != null).map((f): [number, number] => [f.t, calculateAbsoluteHumidity(f.temp, f.rh!)]),
    ];

    return html`
      <ha-card>
        <div class="header"><span class="title">${c.title ?? localize('card.title_default')}</span></div>
        <div class="room outdoor">
          <div class="row">
            <div class="name"><ha-icon icon="mdi:weather-partly-cloudy"></ha-icon><span>${localize('card.outdoor')}</span></div>
            ${this._stat(tOut, 't', c.outdoor_temperature ?? c.weather_entity)}
            ${this._stat(rhOut, 'rh', c.outdoor_humidity ?? c.weather_entity, 0)}
            ${this._stat(ahOut, 'ah', c.outdoor_humidity ?? c.weather_entity)}
          </div>
        </div>
        ${c.rooms.map((room, i) => this._renderRoom(room, i, { now, tOut, rhOut, forecast, outT, outAh, span }))}
      </ha-card>
    `;
  }

  /** A value; clicking it opens the sensor's details instead of the room graph. */
  private _stat(v: number | null, m: Metric, entityId?: string, digits = 1, cls = ''): TemplateResult {
    const content = html`${fmt(v, digits)}<small>${UNIT[m]}</small>`;
    if (!entityId) return html`<div class="stat ${cls}">${content}</div>`;
    return html`
      <button
        class="stat ${cls}"
        aria-label="${localize(`metric.${m}`)}: ${localize('card.details')}"
        @click=${(e: Event) => {
          e.stopPropagation();
          fireEvent(this, 'hass-more-info', { entityId });
        }}
      >
        ${content}
      </button>
    `;
  }

  /** Time of the latest update of any of the given sensors. */
  private _updatedAt(...ids: (string | undefined)[]): number | null {
    const times = ids
      .map((id) => this.hass.states[id ?? ''] as { last_reported?: string; last_updated?: string } | undefined)
      .map((st) => Date.parse(st?.last_reported ?? st?.last_updated ?? ''))
      .filter((t) => !isNaN(t));
    return times.length ? Math.max(...times) : null;
  }

  private _renderRoom(
    room: RoomConfig,
    idx: number,
    ctx: { now: number; tOut: number | null; rhOut: number | null; forecast: Outdoor[]; outT: Series; outAh: Series; span: [number, number] },
  ): TemplateResult {
    const c = this.config;
    const target = room.target_temperature ?? c.target_temperature ?? DEFAULT_TARGET_TEMPERATURE;
    const maxRh = c.max_humidity ?? DEFAULT_MAX_HUMIDITY;
    const tIn = this._read(room.temperature);
    const rhIn = this._read(room.humidity);
    const ahIn = tIn !== null && rhIn !== null ? calculateAbsoluteHumidity(tIn, rhIn) : null;
    const windowState = room.window_sensor ? this.hass.states[room.window_sensor]?.state : undefined;
    const model = this._models[idx] ?? DEFAULT_MODEL;

    const a = advise({
      now: ctx.now, tIn, rhIn, tOut: ctx.tOut, rhOut: ctx.rhOut, target, maxRh,
      forecast: ctx.forecast, model, windowOpen: windowState === 'on',
    });

    let hint = localize(`hint.${a.action}${a.action === 'open' || (a.action === 'ok' && a.why) ? `_${a.why}` : ''}`);
    if (a.until && a.action === 'open') hint += ` · ${localize('hint.until', { time: clock(a.until) })}`;
    if (a.until && a.action === 'wait') hint = localize('hint.wait', { time: clock(a.until) });

    const tCls = tIn === null ? '' : tIn > target + TOLERANCE ? 'warm' : tIn < target - TOLERANCE ? 'cold' : '';
    const updated = this._updatedAt(room.temperature, room.humidity);
    const age = updated === null ? null : Math.max(0, ctx.now - updated);
    const every = this._interval[room.temperature] ?? this._interval[room.humidity ?? ''] ?? null;
    const late = age !== null && every !== null && age > 3 * every && age > 5 * MINUTE;
    const expanded = this._expanded.has(idx);
    const toggle = () => this._toggle(idx);

    return html`
      <div class="room ${a.action}">
        <div
          class="row"
          role="button"
          tabindex="0"
          aria-expanded=${expanded}
          @click=${toggle}
          @keydown=${(e: KeyboardEvent) => e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle())}
        >
          <div class="name">
            <ha-icon .icon=${room.icon || DEFAULT_ROOM_ICON}></ha-icon>
            <span>${room.name}</span>
            ${windowState === 'on' || windowState === 'off'
              ? html`<ha-icon
                  class="window"
                  .icon=${windowState === 'on' ? 'mdi:window-open-variant' : 'mdi:window-closed-variant'}
                  title=${localize(`window.${windowState}`)}
                ></ha-icon>`
              : nothing}
          </div>
          ${this._stat(tIn, 't', room.temperature, 1, tCls)}
          ${this._stat(rhIn, 'rh', room.humidity, 0, rhIn !== null && rhIn > maxRh ? 'humid' : '')}
          ${this._stat(ahIn, 'ah', room.humidity)}
          <div class="hint">
            <span class="dot"></span><span class="text">${hint}</span>
            ${age === null ? nothing : html`<span class="age ${late ? 'late' : ''}">${localize('card.ago', { time: duration(age) })}</span>`}
          </div>
        </div>
        ${expanded
          ? html`
              ${this._chart(room, a, { ...ctx, tIn, target, maxRh })}
              ${age === null || every === null
                ? nothing
                : html`<div class="note">
                    ${localize('card.updates_every', { time: duration(every) })} ·
                    ${age > every ? localize('card.overdue', { time: duration(age - every) }) : localize('card.next_in', { time: duration(every - age) })}
                  </div>`}
            `
          : nothing}
      </div>
    `;
  }

  /**
   * One graph per room: every metric keeps its own vertical scale (given in the legend),
   * room and outdoor share it. Left of "now" is history, right is the forecast — the
   * dashed room temperature assumes the advice is followed.
   */
  private _chart(
    room: RoomConfig,
    a: Advice,
    ctx: { now: number; tIn: number | null; target: number; maxRh: number; outT: Series; outAh: Series; span: [number, number] },
  ): TemplateResult {
    const W = 300;
    const H = 100;
    const { span, now } = ctx;
    const wanted = this.config.graph ?? DEFAULT_GRAPH;
    const roomT: Series = [...(this._hist[room.temperature] ?? []), ...(ctx.tIn !== null ? [[now, ctx.tIn] as [number, number]] : [])];
    const roomRh = this._hist[room.humidity ?? ''] ?? [];
    const ref: Partial<Record<Metric, number>> = { t: ctx.target, rh: ctx.maxRh };
    const lines: Line[] = [
      { metric: 't', pts: ctx.outT, outdoor: true },
      { metric: 't', pts: roomT },
      { metric: 't', pts: a.open, dashed: true },
      { metric: 'rh', pts: roomRh },
      { metric: 'ah', pts: ctx.outAh, outdoor: true },
      { metric: 'ah', pts: combine(roomRh, roomT, (rh, t) => calculateAbsoluteHumidity(t, rh)) },
    ];

    const x = (t: number) => ((t - span[0]) / (span[1] - span[0])) * W;
    const groups = METRICS.filter((m) => wanted.includes(GRAPH_NAME[m]))
      .map((m) => {
        const own = lines
          .filter((l) => l.metric === m)
          .map((l) => ({ ...l, pts: l.pts.filter((p) => p[0] >= span[0] && p[0] <= span[1]) }))
          .filter((l) => l.pts.length > 1);
        const values = own.flatMap((l) => l.pts.map((p) => p[1]));
        const lo = Math.min(...values, ref[m] ?? Infinity);
        const hi = Math.max(...values, ref[m] ?? -Infinity);
        const pad = Math.max((hi - lo) * 0.08, 0.5);
        const y = (v: number) => H - ((v - lo + pad) / (hi - lo + 2 * pad)) * H;
        return { m, own, lo, hi, y };
      })
      .filter((g) => g.own.length);
    if (!groups.length) return html`<div class="note">${localize('card.no_data')}</div>`;

    const stepH = span[1] - span[0] > 60 * HOUR ? 12 : 6;
    const first = new Date(span[0]);
    first.setHours(Math.ceil((first.getHours() + 1) / stepH) * stepH, 0, 0, 0);
    const ticks: number[] = [];
    for (let t = first.getTime(); t < span[1]; t += stepH * HOUR) ticks.push(t);

    return html`
      <div class="chart">
        <div class="legend">
          ${groups.map(
            (g) => html`<span class=${g.m}><i></i>${localize(`metric.${g.m}`)} ${fmt(g.lo, 0)}–${fmt(g.hi, 0)} ${UNIT[g.m]}</span>`,
          )}
          ${groups.some((g) => g.own.some((l) => l.outdoor)) ? html`<span><i class="thin"></i>${localize('card.outdoor')}</span>` : nothing}
        </div>
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label=${localize('card.graph', { room: room.name })}>
          ${ticks.map((t) => svg`<line class="grid" x1=${x(t)} x2=${x(t)} y1="0" y2=${H} />`)}
          <line class="now" x1=${x(now)} x2=${x(now)} y1="0" y2=${H} />
          ${groups.map(
            (g) => svg`
              ${ref[g.m] !== undefined ? svg`<line class="ref ${g.m}" x1="0" x2=${W} y1=${g.y(ref[g.m]!)} y2=${g.y(ref[g.m]!)} />` : nothing}
              ${g.own.map(
                (l) => svg`<polyline class="${g.m} ${l.outdoor ? 'thin' : ''} ${l.dashed ? 'dashed' : ''}"
                  points=${l.pts.map((p) => `${x(p[0]).toFixed(1)},${g.y(p[1]).toFixed(1)}`).join(' ')} />`,
              )}`,
          )}
        </svg>
        <div class="ticks">
          ${ticks
            .filter((t) => Math.abs(x(t) - x(now)) > W * 0.06) // keep clear of the "now" label
            .map((t) => html`<span style="left:${(x(t) / W) * 100}%">${clock(t)}</span>`)}
          <span class="now-label" style="left:${(x(now) / W) * 100}%">${localize('card.now')}</span>
        </div>
      </div>
    `;
  }
}
