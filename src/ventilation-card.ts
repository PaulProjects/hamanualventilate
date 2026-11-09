import { LitElement, html, svg, TemplateResult, PropertyValues, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { HomeAssistant, LovelaceCardEditor } from 'custom-card-helpers';

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
  LEARN_DAYS,
} from './const';
import { cardStyles } from './styles';
import { localize } from './localize/localize';
import { calculateAbsoluteHumidity, relativeHumidityAt } from './utils/humidity';
import { subscribeForecast } from './utils/forecast';
import { fetchHistory, fetchHourlyMeans, toSeries, wasOn, combine, Series } from './utils/history';
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
const REFRESH_MS = 10 * 60 * 1000;
const METRICS = ['t', 'rh', 'ah'] as const;
type Metric = (typeof METRICS)[number];
const UNIT: Record<Metric, string> = { t: '°C', rh: '%', ah: 'g/m³' };

interface Line {
  pts: Series;
  cls: 'in' | 'out' | 'go';
  label: string;
  dashed?: boolean;
}

const fmt = (v: number | null, digits = 1) => (v === null ? '–' : v.toFixed(digits));
const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
  @state() private _metrics = new Set<Metric>(['t', 'rh']);
  @state() private _hist: Record<string, Series> = {};
  @state() private _models: Model[] = [];

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
    this._timer = window.setInterval(() => this._load(), REFRESH_MS);
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

  private _toggle<T>(key: '_expanded' | '_metrics', value: T): void {
    const next = new Set(this[key] as Set<T>);
    if (!next.delete(value)) next.add(value);
    (this[key] as Set<T>) = next;
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
        <div class="header">
          <span class="title">${c.title ?? localize('card.title_default')}</span>
          <div class="metrics" role="group" aria-label=${localize('card.graphs')}>
            ${METRICS.map(
              (m) => html`
                <button
                  class="chip ${this._metrics.has(m) ? 'on' : ''}"
                  aria-pressed=${this._metrics.has(m)}
                  @click=${() => this._toggle('_metrics', m)}
                >
                  ${localize(`metric.${m}`)}
                </button>
              `,
            )}
          </div>
        </div>
        <div class="room outdoor">
          <div class="row">
            <div class="name"><ha-icon icon="mdi:weather-partly-cloudy"></ha-icon><span>${localize('card.outdoor')}</span></div>
            ${this._stat(tOut, 't')} ${this._stat(rhOut, 'rh', 0)} ${this._stat(ahOut, 'ah')}
          </div>
        </div>
        ${c.rooms.map((room, i) => this._renderRoom(room, i, { now, tOut, rhOut, forecast, outT, outAh, span }))}
      </ha-card>
    `;
  }

  private _stat(v: number | null, m: Metric, digits = 1, cls = '', sub = ''): TemplateResult {
    return html`
      <div class="stat ${cls}">
        <span class="value">${fmt(v, digits)}<small>${UNIT[m]}</small></span>
        <span class="sub">${sub}</span>
      </div>
    `;
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
    const expanded = this._expanded.has(idx);
    const toggle = () => this._toggle('_expanded', idx);

    return html`
      <div class="room ${a.action}">
        <div
          class="row"
          role="button"
          tabindex="0"
          aria-expanded=${expanded}
          @click=${toggle}
          @keydown=${(e: KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle())}
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
          ${this._stat(tIn, 't', 1, tCls, `→ ${fmt(target, target % 1 ? 1 : 0)}°`)}
          ${this._stat(rhIn, 'rh', 0, rhIn !== null && rhIn > maxRh ? 'humid' : '', a.rhAfter !== null ? localize('card.after_airing', { rh: fmt(a.rhAfter, 0) }) : '')}
          ${this._stat(ahIn, 'ah')}
          <div class="hint"><span class="dot"></span>${hint}</div>
        </div>
        ${expanded ? this._renderGraphs(room, a, model, { ...ctx, tIn, target, maxRh }) : nothing}
      </div>
    `;
  }

  private _renderGraphs(
    room: RoomConfig,
    a: Advice,
    model: Model,
    ctx: { now: number; tIn: number | null; target: number; maxRh: number; outT: Series; outAh: Series; span: [number, number] },
  ): TemplateResult {
    const inLabel = room.name;
    const outLabel = localize('card.outdoor');
    const roomT: Series = [...(this._hist[room.temperature] ?? []), ...(ctx.tIn !== null ? [[ctx.now, ctx.tIn] as [number, number]] : [])];
    const roomRh = this._hist[room.humidity ?? ''] ?? [];
    const ventilationChangesIt = a.open.some((p, i) => p[1] !== a.closed[i][1]);

    const panels: Record<Metric, { lines: Line[]; ref?: number }> = {
      t: {
        ref: ctx.target,
        lines: [
          { pts: ctx.outT, cls: 'out', label: outLabel },
          { pts: roomT, cls: 'in', label: inLabel },
          { pts: a.closed, cls: 'in', label: localize('card.if_closed'), dashed: true },
          ...(ventilationChangesIt ? [{ pts: a.open, cls: 'go', label: localize('card.if_ventilated'), dashed: true } as Line] : []),
        ],
      },
      rh: {
        ref: ctx.maxRh,
        lines: [
          // ponytail: uses the current room temperature for the whole curve; switch to the
          // room temperature at each timestamp if rooms swing by many degrees.
          ...(ctx.tIn !== null
            ? [{ pts: ctx.outAh.map(([t, ah]): [number, number] => [t, relativeHumidityAt(ah, ctx.tIn!)]), cls: 'out', label: localize('card.outdoor_air_inside') } as Line]
            : []),
          { pts: roomRh, cls: 'in', label: inLabel },
        ],
      },
      ah: {
        lines: [
          { pts: ctx.outAh, cls: 'out', label: outLabel },
          { pts: combine(roomRh, roomT, (rh, t) => calculateAbsoluteHumidity(t, rh)), cls: 'in', label: inLabel },
        ],
      },
    };

    return html`
      <div class="graphs">
        ${METRICS.filter((m) => this._metrics.has(m)).map((m) => this._chart(m, panels[m].lines, ctx.span, ctx.now, panels[m].ref))}
        ${this._metrics.size ? nothing : html`<div class="note">${localize('card.no_metric')}</div>`}
        <div class="note">
          ${model.learned
            ? localize('card.model_learned', { days: String(LEARN_DAYS), closed: fmt(1 / model.kClosed, 0), open: fmt(1 / model.kOpen, 1), gain: (Math.max(...model.gain) > 0 ? '+' : '') + fmt(Math.max(...model.gain), 2) })
            : localize('card.model_default')}
        </div>
      </div>
    `;
  }

  /** One small-multiple panel: all panels share the same time axis so they can be read together. */
  private _chart(metric: Metric, lines: Line[], span: [number, number], now: number, ref?: number): TemplateResult {
    const W = 300;
    const H = 64;
    const title = localize(`metric.${metric}_long`);
    const visible = lines
      .map((l) => ({ ...l, pts: l.pts.filter((p) => p[0] >= span[0] && p[0] <= span[1]) }))
      .filter((l) => l.pts.length > 1);
    const values = visible.flatMap((l) => l.pts.map((p) => p[1]));
    if (!values.length) return html`<div class="note">${title}: ${localize('card.no_data')}</div>`;

    let lo = Math.min(...values, ref ?? Infinity);
    let hi = Math.max(...values, ref ?? -Infinity);
    const pad = Math.max((hi - lo) * 0.1, 0.5);
    lo -= pad;
    hi += pad;
    const x = (t: number) => ((t - span[0]) / (span[1] - span[0])) * W;
    const y = (v: number) => H - ((v - lo) / (hi - lo)) * H;

    const stepH = span[1] - span[0] > 60 * HOUR ? 12 : 6;
    const first = new Date(span[0]);
    first.setHours(Math.ceil((first.getHours() + 1) / stepH) * stepH, 0, 0, 0);
    const ticks: number[] = [];
    for (let t = first.getTime(); t < span[1]; t += stepH * HOUR) ticks.push(t);

    return html`
      <div class="chart">
        <div class="chart-head">
          <span>${title} <small>${UNIT[metric]}</small></span>
          <span class="legend">
            ${visible.map((l) => html`<span class="${l.cls}"><i class=${l.dashed ? 'dashed' : ''}></i>${l.label}</span>`)}
          </span>
        </div>
        <div class="plot">
          <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label=${title}>
            ${ticks.map((t) => svg`<line class="grid" x1=${x(t)} x2=${x(t)} y1="0" y2=${H} />`)}
            <line class="now" x1=${x(now)} x2=${x(now)} y1="0" y2=${H} />
            ${ref !== undefined ? svg`<line class="ref" x1="0" x2=${W} y1=${y(ref)} y2=${y(ref)} />` : nothing}
            ${visible.map(
              (l) => svg`<polyline class="${l.cls} ${l.dashed ? 'dashed' : ''}"
                points=${l.pts.map((p) => `${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' ')} />`,
            )}
          </svg>
          <span class="ymax">${fmt(hi, 0)}</span>
          <span class="ymin">${fmt(lo, 0)}</span>
          ${ref !== undefined ? html`<span class="yref" style="top:${(y(ref) / H) * 100}%">${fmt(ref, 0)}</span>` : nothing}
        </div>
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
