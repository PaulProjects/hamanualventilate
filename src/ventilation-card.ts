import { LitElement, html, svg, TemplateResult, PropertyValues, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { HomeAssistant, LovelaceCardEditor } from 'custom-card-helpers';

import type { VentilationCardConfig, RoomConfig, RoomAdvice, ForecastEntry, SensorReadings, HealthIssue, ForecastWindow, VentilationWindowRange, PredictionPoint } from './types';
import { VentilationStatus } from './types';
import { CARD_VERSION, CARD_NAME, DEFAULT_AH_THRESHOLD, DEFAULT_BALANCED_MAX_TEMP, DEFAULT_SHOW_HISTORY, DEFAULT_HISTORY_HOURS, DEFAULT_FORECAST_HOURS } from './const';
import { cardStyles } from './styles';
import { localize } from './localize/localize';
import { getVentilationAdvice, getSensorReadings, readSensor } from './utils/ventilation-logic';
import { subscribeForecast, extractForecastItems } from './utils/forecast';
import { fetchHistoryFromHass, HistoryDataPoint } from './utils/history';

/* ── Console banner ─────────────────────────────────────────── */
console.info(
  `%c  VENTILATION-CARD \n%c  ${localize('common.version')} ${CARD_VERSION}    `,
  'color: orange; font-weight: bold; background: black',
  'color: white; font-weight: bold; background: dimgray',
);

/* ── Card picker registration ───────────────────────────────── */
interface WindowWithCustomCards extends Window {
  customCards: Array<{ type: string; name: string; description: string }>;
}

(window as unknown as WindowWithCustomCards).customCards =
  (window as unknown as WindowWithCustomCards).customCards || [];
(window as unknown as WindowWithCustomCards).customCards.push({
  type: CARD_NAME,
  name: 'Ventilation Card',
  description: 'Smart manual ventilation guidance based on indoor/outdoor climate data',
});

/* ── Main card element ──────────────────────────────────────── */

@customElement(CARD_NAME)
export class VentilationCard extends LitElement {
  public static async getConfigElement(): Promise<LovelaceCardEditor> {
    await import('./editor');
    return document.createElement('ventilation-card-editor') as unknown as LovelaceCardEditor;
  }

  public static getStubConfig(): Record<string, unknown> {
    return {
      goal: 'cooling',
      rooms: [{ name: 'Living Room', temperature: '' }],
    };
  }

  @property({ attribute: false }) public hass!: HomeAssistant;
  @state() private config!: VentilationCardConfig;
  @state() private forecast: ForecastEntry[] = [];
  @state() private _showHealthBanner = false;
  @state() private _expandedRoomIndex: number | null = null;
  @state() private _expandedOutdoor = false;
  @state() private _outdoorHoverIndex: number | null = null;
  @state() private _roomHoverIndices: Record<number, number | null> = {};
  @state() private _historyData: Record<string, HistoryDataPoint[]> = {};

  private _forecastUnsub?: () => void;
  private _subscribedEntity?: string;
  private _historyLastFetched = 0;

  static get styles() {
    return cardStyles;
  }

  public setConfig(config: VentilationCardConfig): void {
    if (!config) {
      throw new Error(localize('common.invalid_configuration'));
    }
    if (!config.rooms || config.rooms.length === 0) {
      throw new Error('You must configure at least one room.');
    }

    this.config = {
      ah_threshold: DEFAULT_AH_THRESHOLD,
      balanced_max_temperature: DEFAULT_BALANCED_MAX_TEMP,
      show_absolute_humidity: true,
      show_forecast: true,
      show_history: DEFAULT_SHOW_HISTORY,
      history_hours: DEFAULT_HISTORY_HOURS,
      forecast_hours: DEFAULT_FORECAST_HOURS,
      show_next_state_change: true,
      insulation_factor: 0.05,
      ventilation_speed: 0.35,
      ...config,
      goal: config.goal || 'cooling',
    };
  }

  public connectedCallback(): void {
    super.connectedCallback();
    this._subscribeForecast();
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unsubscribeForecast();
  }

  protected shouldUpdate(changedProps: PropertyValues): boolean {
    if (!this.config) return false;

    if (
      changedProps.has('config') ||
      changedProps.has('forecast') ||
      changedProps.has('_showHealthBanner') ||
      changedProps.has('_expandedRoomIndex') ||
      changedProps.has('_expandedOutdoor') ||
      changedProps.has('_outdoorHoverIndex') ||
      changedProps.has('_roomHoverIndices') ||
      changedProps.has('_historyData')
    ) {
      return true;
    }

    if (changedProps.has('hass') && changedProps.size === 1) {
      const oldHass = changedProps.get('hass') as HomeAssistant | undefined;
      if (!oldHass) return true;

      const trackedEntities = this._getTrackedEntities();
      return trackedEntities.some((id) => oldHass.states?.[id] !== this.hass?.states?.[id]);
    }

    return true;
  }

  protected updated(changedProps: PropertyValues): void {
    super.updated(changedProps);
    const targetEntity = this.config?.weather_entity;
    if (changedProps.has('config') || changedProps.has('hass')) {
      if (targetEntity !== this._subscribedEntity) {
        this._unsubscribeForecast();
        if (targetEntity && this.hass) {
          this._subscribeForecast();
        }
      } else if (!this._forecastUnsub && targetEntity && this.hass) {
        this._subscribeForecast();
      }
      if (this.config?.show_history !== false) {
        this._fetchHistoryData();
      }
    }
  }

  private async _fetchHistoryData(): Promise<void> {
    if (!this.hass || !this.config || this.config.show_history === false) {
      if (Object.keys(this._historyData).length > 0) {
        this._historyData = {};
      }
      return;
    }

    const historyHours = this.config.history_hours ?? DEFAULT_HISTORY_HOURS;
    const now = Date.now();
    if (now - this._historyLastFetched < 30000 && Object.keys(this._historyData).length > 0) {
      return;
    }
    this._historyLastFetched = now;

    const entities: string[] = [];
    if (this.config.outdoor_temperature) entities.push(this.config.outdoor_temperature);
    if (this.config.outdoor_humidity) entities.push(this.config.outdoor_humidity);

    for (const room of this.config.rooms || []) {
      if (room.temperature) entities.push(room.temperature);
      if (room.humidity) entities.push(room.humidity);
      if (room.outdoor_temperature_override) entities.push(room.outdoor_temperature_override);
      if (room.outdoor_humidity_override) entities.push(room.outdoor_humidity_override);
    }

    const fetched = await fetchHistoryFromHass(this.hass, entities, historyHours);
    this._historyData = fetched;
  }

  protected render(): TemplateResult | typeof nothing {
    try {
      if (!this.hass) {
        return this._renderSkeleton();
      }

      if (!this.config) {
        return html`<ha-card><div class="card-content">No configuration</div></ha-card>`;
      }

      // Check system health & diagnostics
      const healthIssues = this._getHealthIssues();

      // Compute outdoor readings (global) with weather entity fallback
      const effectiveOutdoor = getSensorReadings(
        this.hass,
        this.config.outdoor_temperature,
        this.config.outdoor_humidity,
        this.config.weather_entity,
      );

      // Compute effective forecast: use WS forecast or fallback to weather entity attributes
      const effectiveForecast = this._getEffectiveForecast();

      // Compute room-specific advice & forecast window
      const rooms = this.config.rooms || [];
      const advices: RoomAdvice[] = rooms.map((room) =>
        getVentilationAdvice(
          this.hass,
          room,
          this.config.outdoor_temperature,
          this.config.outdoor_humidity,
          this.config.goal,
          this.config.ah_threshold,
          this.config.balanced_max_temperature,
          this.config.min_humidity,
          this.config.max_humidity,
          effectiveForecast,
          this.config.weather_entity,
          this.config.insulation_factor,
          this.config.ventilation_speed,
          this.config.forecast_hours,
        ),
      );

      return html`
        <ha-card>
          <div class="card-header-row">
            <div class="card-header-title">
              <ha-icon icon="mdi:air-filter" class="header-icon"></ha-icon>
              <span>${this.config.title || localize('card.title_default')}</span>
            </div>
            ${this._renderGoalBadge()}
          </div>

          <div class="card-content">
            ${this._showHealthBanner && healthIssues.length > 0
          ? this._renderHealthBanner(healthIssues)
          : nothing}

            ${this._renderOutdoor(effectiveOutdoor)}

            <div class="rooms-container">
              ${advices.map((advice, idx) =>
            this._renderRoom(advice, rooms[idx], idx),
          )}
            </div>
          </div>
        </ha-card>
      `;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('VentilationCard render error:', err);
      return html`
        <ha-card style="padding: 16px;">
          <div style="color: var(--error-color, red); font-weight: bold; margin-bottom: 8px;">
            Ventilation Card Error
          </div>
          <div style="font-size: 12px; font-family: monospace; color: var(--primary-text-color);">
            ${errorMsg}
          </div>
        </ha-card>
      `;
    }
  }

  private _handleMoreInfo(entityId?: string): void {
    if (!entityId || !this.hass) return;
    const event = new CustomEvent('hass-more-info', {
      bubbles: true,
      composed: true,
      detail: { entityId },
    });
    this.dispatchEvent(event);
  }

  private _renderHealthBanner(issues: HealthIssue[]): TemplateResult {
    return html`
      <div class="health-banner">
        <div class="health-banner-title">
          <ha-icon icon="mdi:alert"></ha-icon>
          <span>System Diagnostics (${issues.length})</span>
        </div>
        <ul class="health-issue-list">
          ${issues.map(
      (issue) => html`
              <li class="health-issue-item severity-${issue.severity}">
                <ha-icon icon="${issue.severity === 'error' ? 'mdi:close-circle' : 'mdi:alert-circle'}"></ha-icon>
                <span>${issue.message}</span>
              </li>
            `,
    )}
        </ul>
      </div>
    `;
  }

  private _renderGoalBadge(): TemplateResult {
    const goal = this.config.goal || 'cooling';
    const goalLabel = localize(`goal.${goal}`);
    let goalIcon = 'mdi:snowflake';

    if (goal === 'warming') goalIcon = 'mdi:fire';
    if (goal === 'humidity') goalIcon = 'mdi:water-percent';
    if (goal === 'balanced') goalIcon = 'mdi:scale-balance';

    return html`
      <div class="goal-badge goal-${goal}">
        <ha-icon icon="${goalIcon}"></ha-icon>
        <span>${goalLabel}</span>
      </div>
    `;
  }

  private _findClosestPointIndex(e: MouseEvent, points: Array<{ x: number }>): number {
    const svg = e.currentTarget as SVGElement;
    const rect = svg.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    const targetX = ratio * 500;

    let closestIdx = 0;
    let minDiff = Infinity;
    for (let i = 0; i < points.length; i++) {
      const diff = Math.abs(points[i].x - targetX);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    }
    return closestIdx;
  }

  private _handleOutdoorMouseMove(e: MouseEvent, points: Array<{ x: number }>): void {
    if (!points || points.length === 0) return;
    const closestIdx = this._findClosestPointIndex(e, points);
    if (this._outdoorHoverIndex !== closestIdx) {
      this._outdoorHoverIndex = closestIdx;
    }
  }

  private _handleOutdoorMouseLeave(): void {
    if (this._outdoorHoverIndex !== null) {
      this._outdoorHoverIndex = null;
    }
  }

  private _handleRoomMouseMove(e: MouseEvent, roomIdx: number, points: Array<{ x: number }>): void {
    if (!points || points.length === 0) return;
    const closestIdx = this._findClosestPointIndex(e, points);
    if (this._roomHoverIndices[roomIdx] !== closestIdx) {
      this._roomHoverIndices = { ...this._roomHoverIndices, [roomIdx]: closestIdx };
    }
  }

  private _handleRoomMouseLeave(roomIdx: number): void {
    if (this._roomHoverIndices[roomIdx] !== null) {
      this._roomHoverIndices = { ...this._roomHoverIndices, [roomIdx]: null };
    }
  }

  private _renderOutdoor(outdoor: SensorReadings): TemplateResult {
    const tempEntity = this.config.outdoor_temperature || this.config.weather_entity;
    const humidityEntity = this.config.outdoor_humidity || this.config.weather_entity;
    const mainEntity = tempEntity || humidityEntity || this.config.weather_entity;

    let weatherStateText = '';
    if (this.config.weather_entity && this.hass?.states[this.config.weather_entity]) {
      const wState = this.hass.states[this.config.weather_entity];
      weatherStateText = wState.state ? wState.state.replace(/-/g, ' ') : '';
    }

    return html`
      <div class="outdoor-section ${this._expandedOutdoor ? 'is-expanded' : ''}">
        <div
          class="outdoor-header"
          @click=${(e: Event) => this._toggleOutdoorExpand(e)}
          title="${this._expandedOutdoor ? 'Collapse outdoor details' : 'Expand outdoor details & forecast'}"
        >
          <div class="outdoor-title-group">
            <div class="outdoor-icon-avatar">
              <ha-icon icon="mdi:home-export-outline"></ha-icon>
            </div>
            <span class="outdoor-name">${localize('card.outdoor')}</span>
          </div>

          <div class="outdoor-header-badges">
            ${outdoor.temperature !== null
        ? html`
                  <div
                    class="climate-pill-badge ${tempEntity ? 'clickable' : ''}"
                    @click=${(e: Event) => {
            if (tempEntity) {
              e.stopPropagation();
              this._handleMoreInfo(tempEntity);
            }
          }}
                    title="Outdoor climate summary"
                  >
                    <ha-icon icon="mdi:thermometer"></ha-icon>
                    <span>${outdoor.temperature.toFixed(1)}°C</span>
                    ${outdoor.humidity !== null
            ? html`
                          <ha-icon icon="mdi:water-percent" class="pill-humidity-icon"></ha-icon>
                          <span>${outdoor.humidity.toFixed(0)}%</span>
                        `
            : nothing}
                  </div>
                `
        : nothing}

            ${weatherStateText
        ? html`
                  <div
                    class="outdoor-weather-badge ${this.config.weather_entity ? 'clickable' : ''}"
                    @click=${(e: Event) => {
            if (this.config.weather_entity) {
              e.stopPropagation();
              this._handleMoreInfo(this.config.weather_entity);
            }
          }}
                    title="${this.config.weather_entity ? `View weather for ${this.config.weather_entity}` : ''}"
                  >
                    <ha-icon icon="mdi:weather-partly-cloudy"></ha-icon>
                    <span>${weatherStateText}</span>
                  </div>
                `
        : nothing}

            <div
              class="outdoor-details-trigger ${this._expandedOutdoor ? 'expanded' : ''}"
              @click=${(e: Event) => this._toggleOutdoorExpand(e)}
              title="${this._expandedOutdoor ? 'Collapse outdoor details' : 'Expand outdoor details & forecast'}"
            >
              <ha-icon icon="${this._expandedOutdoor ? 'mdi:chevron-up' : 'mdi:chevron-down'}"></ha-icon>
            </div>
          </div>
        </div>

        ${this._expandedOutdoor
        ? html`
              <div class="outdoor-expanded-panel" @click=${(e: Event) => e.stopPropagation()}>
                ${this._renderOutdoorForecastGraph(outdoor)}
              </div>
            `
        : nothing}
      </div>
    `;
  }

  private _renderOutdoorForecastGraph(outdoor: SensorReadings): TemplateResult {
    const forecastHours = this.config.forecast_hours ?? DEFAULT_FORECAST_HOURS;
    const historyHours = this.config.history_hours ?? DEFAULT_HISTORY_HOURS;
    const showHistory = this.config.show_history ?? DEFAULT_SHOW_HISTORY;

    const forecast = this._getEffectiveForecast().slice(0, forecastHours);

    interface GraphItem {
      datetime: string;
      date: Date;
      dateMs: number;
      temperature: number;
      humidity?: number;
      isHistory?: boolean;
    }

    const items: GraphItem[] = [];
    const now = new Date();
    const nowMs = now.getTime();
    const historyStartMs = nowMs - historyHours * 3600 * 1000;

    const outdoorTempEntity = this.config.outdoor_temperature;
    const outdoorHumEntity = this.config.outdoor_humidity;

    if (showHistory && outdoorTempEntity && this._historyData[outdoorTempEntity]) {
      const tempHist = this._historyData[outdoorTempEntity] || [];
      const humHist = outdoorHumEntity ? (this._historyData[outdoorHumEntity] || []) : [];

      for (const hp of tempHist) {
        const hpDate = toDate(hp.date || hp.datetime);
        const hpMs = hpDate.getTime();
        if (!isNaN(hpMs) && hpMs >= historyStartMs && hpMs <= nowMs) {
          let humVal: number | undefined = undefined;
          if (humHist.length > 0) {
            let minHDiff = Infinity;
            for (const hhp of humHist) {
              const hhpMs = toDate(hhp.date || hhp.datetime).getTime();
              const hDiff = Math.abs(hhpMs - hpMs);
              if (hDiff < minHDiff) {
                minHDiff = hDiff;
                humVal = hhp.state;
              }
            }
          }
          items.push({
            datetime: hp.datetime,
            date: hpDate,
            dateMs: hpMs,
            temperature: hp.state,
            humidity: humVal,
            isHistory: true,
          });
        }
      }
    }

    // Add current outdoor reading if available
    if (outdoor.temperature !== null) {
      items.push({
        datetime: now.toISOString(),
        date: now,
        dateMs: nowMs,
        temperature: outdoor.temperature,
        humidity: outdoor.humidity ?? undefined,
        isHistory: false,
      });
    }

    // Add forecast entries
    for (const f of forecast) {
      const fDate = toDate(f.datetime);
      const fMs = fDate.getTime();
      if (!isNaN(fMs) && (!showHistory || fMs >= historyStartMs)) {
        items.push({
          datetime: f.datetime,
          date: fDate,
          dateMs: fMs,
          temperature: f.temperature,
          humidity: f.humidity,
          isHistory: false,
        });
      }
    }

    items.sort((a, b) => a.dateMs - b.dateMs);

    if (items.length === 0) {
      return html`
        <div class="outdoor-forecast-empty">
          <ha-icon icon="mdi:chart-line-variant"></ha-icon>
          <span>No weather temperature data available</span>
        </div>
      `;
    }

    const temps = items.map((f) => f.temperature);
    const rawMin = Math.min(...temps);
    const rawMax = Math.max(...temps);
    const pad = Math.max(1, (rawMax - rawMin) * 0.15);
    const minTemp = Math.floor(rawMin - pad);
    const maxTemp = Math.ceil(rawMax + pad);
    const tempRange = maxTemp - minTemp || 1;

    const width = 500;
    const height = 90;
    const marginTop = 10;
    const marginBottom = 10;
    const usableHeight = height - marginTop - marginBottom;

    const tMin = items[0].dateMs;
    const tMax = items[items.length - 1].dateMs;
    const tRange = tMax - tMin || 1;

    const points = items.map((item) => {
      const x = (item.dateMs - tMin) / tRange * width;
      const norm = (item.temperature - minTemp) / tempRange;
      const y = height - marginBottom - norm * usableHeight;
      return { x, y, dateMs: item.dateMs, item };
    });

    const nowX = (nowMs - tMin) / tRange * width;
    const hasHistoryPoints = items.some((i) => i.isHistory);

    const { pastPts, futurePts } = splitPointsByTime(points, nowMs);

    const pastPath = buildSplinePath(pastPts);
    const futurePath = buildSplinePath(futurePts);
    const fullLinePath = buildSplinePath(points);
    const fillPath = `${fullLinePath} L ${points[points.length - 1].x.toFixed(1)},${height} L ${points[0].x.toFixed(1)},${height} Z`;

    const step = Math.max(1, Math.floor(points.length / 4));
    const timeLabels = points
      .filter((_, idx) => idx % step === 0 || idx === points.length - 1)
      .map((p) => p.item.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

    const hoverPoint = this._outdoorHoverIndex !== null && points[this._outdoorHoverIndex]
      ? points[this._outdoorHoverIndex]
      : null;

    const displayTemp = hoverPoint ? hoverPoint.item.temperature : outdoor.temperature;
    const displayHum = hoverPoint
      ? (hoverPoint.item.humidity ?? outdoor.humidity)
      : outdoor.humidity;

    const rangeLabel = hasHistoryPoints
      ? `History ${historyHours}h · Forecast ${forecastHours}h (${rawMin.toFixed(1)}° – ${rawMax.toFixed(1)}°)`
      : `Forecast ${rawMin.toFixed(1)}° – ${rawMax.toFixed(1)}° (${forecastHours}h)`;

    return html`
      <div class="integrated-graph-card">
        <div class="graph-floating-header">
          <div class="graph-current-stats">
            ${displayTemp !== null
        ? html`
                  <div class="weighty-stat">
                    <ha-icon icon="mdi:thermometer" class="stat-icon temp"></ha-icon>
                    <span class="weighty-value">${displayTemp.toFixed(1)}</span>
                    <span class="weighty-unit">°C</span>
                  </div>
                `
        : nothing}
            ${displayHum !== null
        ? html`
                  <div class="weighty-stat">
                    <ha-icon icon="mdi:water-percent" class="stat-icon hum"></ha-icon>
                    <span class="weighty-value">${displayHum.toFixed(0)}</span>
                    <span class="weighty-unit">%</span>
                  </div>
                `
        : nothing}
            ${hoverPoint
        ? html`<span class="hover-time-tag">${hoverPoint.item.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}${hoverPoint.item.isHistory ? ' (Hist)' : ''}</span>`
        : nothing}
          </div>
          <div class="graph-range-pill">
            <span>${rangeLabel}</span>
          </div>
        </div>

        <div class="graph-svg-wrapper">
          <svg
            viewBox="0 0 ${width} ${height}"
            preserveAspectRatio="none"
            class="forecast-svg-chart"
            @mousemove=${(e: MouseEvent) => this._handleOutdoorMouseMove(e, points)}
            @mouseleave=${() => this._handleOutdoorMouseLeave()}
            @touchmove=${(e: TouchEvent) => {
        if (e.touches.length > 0) {
          const touch = e.touches[0];
          this._handleOutdoorMouseMove({ clientX: touch.clientX, currentTarget: e.currentTarget } as any, points);
        }
      }}
            @touchend=${() => this._handleOutdoorMouseLeave()}
          >
            <defs>
              <linearGradient id="outdoorTempGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="var(--primary-color, #2196f3)" stop-opacity="0.32" />
                <stop offset="100%" stop-color="var(--primary-color, #2196f3)" stop-opacity="0.0" />
              </linearGradient>
            </defs>
            ${fillPath ? svg`<path d="${fillPath}" fill="url(#outdoorTempGradient)" />` : nothing}

            ${pastPath
        ? svg`
                  <path
                    d="${pastPath}"
                    fill="none"
                    stroke="var(--primary-color, #2196f3)"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                `
        : nothing}

            ${futurePath
        ? svg`
                  <path
                    d="${futurePath}"
                    fill="none"
                    stroke="var(--primary-color, #2196f3)"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-dasharray="4 3"
                  />
                `
        : nothing}

            ${!pastPath && !futurePath && fullLinePath
        ? svg`
                  <path
                    d="${fullLinePath}"
                    fill="none"
                    stroke="var(--primary-color, #2196f3)"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-dasharray="4 3"
                  />
                `
        : nothing}

            ${hasHistoryPoints && nowX > 0 && nowX < width
        ? svg`
                  <line
                    x1="${nowX.toFixed(1)}"
                    y1="0"
                    x2="${nowX.toFixed(1)}"
                    y2="${height}"
                    class="now-divider-line"
                  />
                  
                `
        : nothing}

            ${points.map(
          (p, idx) => svg`
                <circle
                  cx="${p.x.toFixed(1)}"
                  cy="${p.y.toFixed(1)}"
                  r="${idx === this._outdoorHoverIndex ? '4.5' : '2.5'}"
                  fill="var(--ha-card-background, var(--card-background-color, #1c1c1e))"
                  stroke="var(--primary-color, #2196f3)"
                  stroke-width="${idx === this._outdoorHoverIndex ? '2.5' : '1.8'}"
                />
              `,
        )}

            ${hoverPoint
        ? svg`
                  <line
                    x1="${hoverPoint.x.toFixed(1)}"
                    y1="0"
                    x2="${hoverPoint.x.toFixed(1)}"
                    y2="${height}"
                    class="hover-crosshair"
                  />
                `
        : nothing}
          </svg>
        </div>

        <div class="graph-time-axis">
          ${timeLabels.map((lbl) => html`<span>${lbl}</span>`)}
        </div>
      </div>
    `;
  }

  private _renderRoom(
    advice: RoomAdvice,
    room?: RoomConfig,
    _index?: number,
  ): TemplateResult {
    const tempEntity = room?.temperature;
    const roomIdx = _index ?? 0;
    const isExpanded = this._expandedRoomIndex === roomIdx;

    return html`
      <div
        class="room-row status-${advice.status} ${isExpanded ? 'is-expanded' : ''}"
        @click=${(e: Event) => this._toggleRoomExpand(roomIdx, e)}       
      >
        <div class="room-header">
          <div class="room-title-group">
            <div class="room-icon-avatar status-${advice.status}">
              <ha-icon icon="${advice.roomIcon}"></ha-icon>
            </div>
            <span class="room-name">${advice.roomName}</span>
          </div>

          <div class="room-header-badges">
            ${advice.indoor.temperature !== null
        ? html`
                  <div
                    class="climate-pill-badge ${tempEntity ? 'clickable' : ''}"
                    @click=${(e: Event) => {
            if (tempEntity) {
              e.stopPropagation();
              this._handleMoreInfo(tempEntity);
            }
          }}
                    title="${tempEntity ? `View history graph for ${tempEntity}` : ''}"
                  >
                    <ha-icon icon="mdi:thermometer"></ha-icon>
                    <span>${advice.indoor.temperature.toFixed(1)}°C</span>
                    ${advice.indoor.humidity !== null
            ? html`
                          <ha-icon icon="mdi:water-percent" class="pill-humidity-icon"></ha-icon>
                          <span>${advice.indoor.humidity.toFixed(0)}%</span>
                        `
            : nothing}
                  </div>
                `
        : nothing}

            ${advice.windowState !== null
        ? this._renderWindowBadge(advice, room)
        : nothing}

            ${this._renderSuggestionBadge(advice)}

            <div
              class="room-details-trigger ${isExpanded ? 'expanded' : ''}"
              @click=${(e: Event) => this._toggleRoomExpand(roomIdx, e)}
              title="${isExpanded ? 'Collapse details' : 'Expand details'}"
            >
              <ha-icon icon="${isExpanded ? 'mdi:chevron-up' : 'mdi:chevron-down'}"></ha-icon>
            </div>
          </div>
        </div>

        ${this.config.show_forecast !== false && advice.forecastWindow
        ? this._renderCompactNextWindow(advice.forecastWindow, roomIdx)
        : nothing}

        ${isExpanded
        ? this._renderExpandedRoomDetails(advice, room, roomIdx)
        : nothing}
      </div>
    `;
  }

  private _toggleOutdoorExpand(e?: Event): void {
    if (e) {
      e.stopPropagation();
    }
    this._expandedOutdoor = !this._expandedOutdoor;
    this.requestUpdate();
  }

  private _toggleRoomExpand(roomIndex: number, e?: Event): void {
    if (e) {
      e.stopPropagation();
    }
    this._expandedRoomIndex = this._expandedRoomIndex === roomIndex ? null : roomIndex;
    this.requestUpdate();
  }

  private _renderCompactNextWindow(forecastWindow: ForecastWindow, roomIndex: number): TemplateResult {
    const windows = forecastWindow.upcomingWindows || [];
    const activeWin = windows.find((w) => w.isCurrent);
    const nextWin = activeWin || windows[0];

    if (!nextWin) {
      return html`
        <div
          class="compact-next-window-chip"
          @click=${(e: Event) => this._toggleRoomExpand(roomIndex, e)}
          title="Click to toggle room climate details"
        >
          <ha-icon icon="mdi:clock-off-outline"></ha-icon>
          <span>${localize('forecast.no_upcoming')}</span>
        </div>
      `;
    }

    if (activeWin) {
      const activeText = localize('forecast.active_now', { time: activeWin.formattedEnd });
      return html`
        <div
          class="compact-next-window-chip is-active"
          @click=${(e: Event) => this._toggleRoomExpand(roomIndex, e)}
          title="Click to toggle room climate details"
        >
          <ha-icon icon="mdi:clock-check-outline"></ha-icon>
          <span>${activeText}</span>
        </div>
      `;
    }

    const nextText = localize('forecast.next_open', { start: nextWin.formattedStart, end: nextWin.formattedEnd });
    return html`
      <div
        class="compact-next-window-chip"
        @click=${(e: Event) => this._toggleRoomExpand(roomIndex, e)}
        title="Click to toggle room climate details"
      >
        <ha-icon icon="mdi:clock-outline"></ha-icon>
        <span>${nextText}</span>
      </div>
    `;
  }

  private _renderExpandedRoomDetails(advice: RoomAdvice, room?: RoomConfig, roomIdx?: number): TemplateResult {
    const showAbsHum = this.config.show_absolute_humidity !== false;

    const tempEntity = room?.temperature;
    const humidityEntity = room?.humidity || tempEntity;
    const customOutdoorTemp = room?.outdoor_temperature_override;
    const customOutdoorHum = room?.outdoor_humidity_override;
    const customOutdoorMain = customOutdoorTemp || customOutdoorHum;

    const predictionSeries = advice.predictionSeries || [];

    return html`
      <div class="room-expanded-panel" @click=${(e: Event) => e.stopPropagation()}>
        <div class="integrated-graph-card">
          <div class="graph-floating-header">
            <div class="graph-current-stats">
              ${advice.indoor.temperature !== null
        ? html`
                    <div
                      class="weighty-stat ${tempEntity ? 'clickable' : ''}"
                      @click=${(e: Event) => {
            if (tempEntity) {
              e.stopPropagation();
              this._handleMoreInfo(tempEntity);
            }
          }}
                      title="${tempEntity ? `View history graph for ${tempEntity}` : ''}"
                    >
                      <ha-icon icon="mdi:thermometer" class="stat-icon temp"></ha-icon>
                      <span class="weighty-value">${advice.indoor.temperature.toFixed(1)}</span>
                      <span class="weighty-unit">°C</span>
                    </div>
                  `
        : nothing}
              ${advice.indoor.humidity !== null
        ? html`
                    <div
                      class="weighty-stat ${humidityEntity ? 'clickable' : ''}"
                      @click=${(e: Event) => {
            if (humidityEntity) {
              e.stopPropagation();
              this._handleMoreInfo(humidityEntity);
            }
          }}
                      title="${humidityEntity ? `View history graph for ${humidityEntity}` : ''}"
                    >
                      <ha-icon icon="mdi:water-percent" class="stat-icon hum"></ha-icon>
                      <span class="weighty-value">${advice.indoor.humidity.toFixed(0)}</span>
                      <span class="weighty-unit">%</span>
                    </div>
                  `
        : nothing}
              ${showAbsHum && advice.indoor.absoluteHumidity !== null
        ? html`
                    <div
                      class="weighty-stat ${humidityEntity ? 'clickable' : ''}"
                      @click=${(e: Event) => {
            if (humidityEntity) {
              e.stopPropagation();
              this._handleMoreInfo(humidityEntity);
            }
          }}
                      title="${humidityEntity ? `View history graph for ${humidityEntity}` : ''}"
                    >
                      <ha-icon icon="mdi:water" class="stat-icon abs-hum"></ha-icon>
                      <span class="weighty-value">${advice.indoor.absoluteHumidity.toFixed(1)}</span>
                      <span class="weighty-unit">g/m³</span>
                    </div>
                  `
        : nothing}
            </div>

            ${advice.hasCustomOutdoor
        ? html`
                  <div
                    class="graph-range-pill ${customOutdoorMain ? 'clickable' : ''}"
                    @click=${(e: Event) => {
            if (customOutdoorMain) {
              e.stopPropagation();
              this._handleMoreInfo(customOutdoorMain);
            }
          }}
                    title="${customOutdoorMain ? `View details for ${customOutdoorMain}` : ''}"
                  >
                    <span>Outdoor: ${advice.outdoor.temperature?.toFixed(1)}°C · ${advice.outdoor.humidity?.toFixed(0)}%</span>
                  </div>
                `
        : nothing}
          </div>

          ${advice.reason
        ? html`
                <div class="expanded-reason-box">
                  <ha-icon icon="mdi:information-outline"></ha-icon>
                  <span>${advice.reason}</span>
                </div>
              `
        : nothing}

          ${predictionSeries.length > 0
        ? this._renderRoomPredictionGraph(predictionSeries, roomIdx ?? 0, advice.forecastWindow, room)
        : nothing}
          ${advice.forecastWindow
        ? this._renderUpcomingWindows(advice.forecastWindow)
        : nothing}
        </div>
      </div>
    `;
  }

  private _renderRoomPredictionGraph(
    series: PredictionPoint[],
    roomIdx: number,
    forecastWindow?: ForecastWindow | null,
    room?: RoomConfig,
  ): TemplateResult {
    if (!series || series.length === 0) return html``;

    const historyHours = this.config.history_hours ?? DEFAULT_HISTORY_HOURS;
    const showHistory = this.config.show_history ?? DEFAULT_SHOW_HISTORY;

    interface RoomGraphItem {
      datetime: string;
      date: Date;
      dateMs: number;
      predictedRoomTemp: number;
      outdoorTemp: number;
      canVentilate: boolean;
      isHistory?: boolean;
    }

    const items: RoomGraphItem[] = [];
    const now = new Date();
    const nowMs = now.getTime();
    const historyStartMs = nowMs - historyHours * 3600 * 1000;

    const roomEntity = room?.temperature;
    const outdoorEntity = room?.outdoor_temperature_override || this.config.outdoor_temperature;

    if (showHistory && roomEntity && this._historyData[roomEntity]) {
      const roomHist = this._historyData[roomEntity] || [];
      const outdoorHist = outdoorEntity ? (this._historyData[outdoorEntity] || []) : [];

      for (const rPt of roomHist) {
        const rDate = toDate(rPt.date || rPt.datetime);
        const rMs = rDate.getTime();
        if (!isNaN(rMs) && rMs >= historyStartMs && rMs <= nowMs) {
          let outTemp = outdoorHist[0]?.state ?? rPt.state;
          if (outdoorHist.length > 0) {
            let minDiff = Infinity;
            for (const oPt of outdoorHist) {
              const oMs = toDate(oPt.date || oPt.datetime).getTime();
              const diff = Math.abs(oMs - rMs);
              if (diff < minDiff) {
                minDiff = diff;
                outTemp = oPt.state;
              }
            }
          }
          items.push({
            datetime: rPt.datetime,
            date: rDate,
            dateMs: rMs,
            predictedRoomTemp: rPt.state,
            outdoorTemp: outTemp,
            canVentilate: false,
            isHistory: true,
          });
        }
      }
    }

    for (const s of series) {
      const sDate = toDate(s.date || s.datetime);
      const sMs = sDate.getTime();
      if (!isNaN(sMs) && (!showHistory || sMs >= historyStartMs)) {
        items.push({
          datetime: s.datetime,
          date: sDate,
          dateMs: sMs,
          predictedRoomTemp: s.predictedRoomTemp,
          outdoorTemp: s.outdoorTemp,
          canVentilate: s.canVentilate,
          isHistory: false,
        });
      }
    }

    items.sort((a, b) => a.dateMs - b.dateMs);

    if (items.length === 0) return html``;

    const roomTemps = items.map((s) => s.predictedRoomTemp);
    const outdoorTemps = items.map((s) => s.outdoorTemp);
    const allTemps = [...roomTemps, ...outdoorTemps];
    const rawMin = Math.min(...allTemps);
    const rawMax = Math.max(...allTemps);
    const pad = Math.max(1, (rawMax - rawMin) * 0.15);
    const minTemp = Math.floor(rawMin - pad);
    const maxTemp = Math.ceil(rawMax + pad);
    const tempRange = maxTemp - minTemp || 1;

    const width = 500;
    const height = 95;
    const marginTop = 10;
    const marginBottom = 10;
    const usableHeight = height - marginTop - marginBottom;

    const tMin = items[0].dateMs;
    const tMax = items[items.length - 1].dateMs;
    const tRange = tMax - tMin || 1;

    const points = items.map((item) => {
      const x = (item.dateMs - tMin) / tRange * width;
      const roomNorm = (item.predictedRoomTemp - minTemp) / tempRange;
      const roomY = height - marginBottom - roomNorm * usableHeight;
      const outdoorNorm = (item.outdoorTemp - minTemp) / tempRange;
      const outdoorY = height - marginBottom - outdoorNorm * usableHeight;
      return { x, roomY, outdoorY, dateMs: item.dateMs, item };
    });

    const nowX = (nowMs - tMin) / tRange * width;
    const hasHistoryPoints = items.some((i) => i.isHistory);

    const roomPts = points.map((p) => ({ x: p.x, y: p.roomY, dateMs: p.dateMs }));
    const outdoorPts = points.map((p) => ({ x: p.x, y: p.outdoorY, dateMs: p.dateMs }));

    const { pastPts: pastRoomPts, futurePts: futureRoomPts } = splitPointsByTime(roomPts, nowMs);
    const { pastPts: pastOutdoorPts, futurePts: futureOutdoorPts } = splitPointsByTime(outdoorPts, nowMs);

    const pastRoomPath = buildSplinePath(pastRoomPts);
    const futureRoomPath = buildSplinePath(futureRoomPts);
    const fullRoomPath = buildSplinePath(roomPts);

    const pastOutdoorPath = buildSplinePath(pastOutdoorPts);
    const futureOutdoorPath = buildSplinePath(futureOutdoorPts);
    const fullOutdoorPath = buildSplinePath(outdoorPts);

    const isPointInOpenZone = (p: { item: RoomGraphItem }) => {
      if (p.item.canVentilate) return true;
      if (p.item.outdoorTemp <= p.item.predictedRoomTemp + 0.1) return true;
      if (forecastWindow?.upcomingWindows?.length) {
        const t = p.item.dateMs;
        return forecastWindow.upcomingWindows.some((w) => {
          const wStart = toDate(w.start).getTime();
          const wEnd = toDate(w.end).getTime();
          return t >= wStart && t <= wEnd;
        });
      }
      return false;
    };

    const openBands: Array<{ startX: number; endX: number }> = [];
    let bandStartIdx: number | null = null;

    for (let i = 0; i < points.length; i++) {
      const isOpen = isPointInOpenZone(points[i]);
      if (isOpen) {
        if (bandStartIdx === null) bandStartIdx = i;
        if (i === points.length - 1 && bandStartIdx !== null) {
          const startX = points[bandStartIdx].x;
          const endX = points[i].x;
          openBands.push({ startX, endX });
        }
      } else {
        if (bandStartIdx !== null) {
          const startX = points[bandStartIdx].x;
          const endX = points[i].x;
          openBands.push({ startX, endX });
          bandStartIdx = null;
        }
      }
    }

    if (forecastWindow?.upcomingWindows?.length && points.length > 1) {
      const tStart = points[0].dateMs;
      const tEnd = points[points.length - 1].dateMs;
      const totalTime = tEnd - tStart;

      if (totalTime > 0) {
        for (const w of forecastWindow.upcomingWindows) {
          const wStartMs = toDate(w.start).getTime();
          const wEndMs = toDate(w.end).getTime();

          if (wEndMs > tStart && wStartMs < tEnd) {
            const startRatio = Math.max(0, (wStartMs - tStart) / totalTime);
            const endRatio = Math.min(1, (wEndMs - tStart) / totalTime);
            const startX = startRatio * width;
            const endX = endRatio * width;
            if (endX > startX) {
              openBands.push({ startX, endX });
            }
          }
        }
      }
    }

    const mergedBands: Array<{ startX: number; endX: number }> = [];
    openBands.sort((a, b) => a.startX - b.startX);

    for (const b of openBands) {
      if (mergedBands.length === 0) {
        mergedBands.push({ ...b });
      } else {
        const last = mergedBands[mergedBands.length - 1];
        if (b.startX <= last.endX + 5) {
          last.endX = Math.max(last.endX, b.endX);
        } else {
          mergedBands.push({ ...b });
        }
      }
    }

    const step = Math.max(1, Math.floor(points.length / 4));
    const timeLabels = points
      .filter((_, idx) => idx % step === 0 || idx === points.length - 1)
      .map((p) => p.item.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

    const hoverIdx = this._roomHoverIndices[roomIdx] ?? null;
    const hoveredPoint = hoverIdx !== null && points[hoverIdx] ? points[hoverIdx] : null;
    const activePoint = hoveredPoint;

    return html`
      <div class="prediction-graph-card">
        <div class="prediction-legend">
          <div class="legend-item">
            <span class="legend-color predicted-room"></span>
            <span>Room: ${hoveredPoint ? `${hoveredPoint.item.predictedRoomTemp.toFixed(1)}°C` : `${roomTemps[roomTemps.length - 1]?.toFixed(1)}°C`}</span>
          </div>
          <div class="legend-item">
            <span class="legend-color outdoor-reference"></span>
            <span>Outdoor: ${hoveredPoint ? `${hoveredPoint.item.outdoorTemp.toFixed(1)}°C` : `${outdoorTemps[outdoorTemps.length - 1]?.toFixed(1)}°C`}</span>
          </div>
          <div class="legend-item">
            <span class="legend-color openable-zone"></span>
            <span>Open Zone</span>
          </div>
          ${hoveredPoint
        ? html`<span class="hover-time-tag">${hoveredPoint.item.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}${hoveredPoint.item.isHistory ? ' (Hist)' : ''}</span>`
        : nothing}
        </div>

        <div class="graph-svg-wrapper">
          <svg
            viewBox="0 0 ${width} ${height}"
            preserveAspectRatio="none"
            class="prediction-svg-chart"
            @mousemove=${(e: MouseEvent) => this._handleRoomMouseMove(e, roomIdx, points)}
            @mouseleave=${() => this._handleRoomMouseLeave(roomIdx)}
            @touchmove=${(e: TouchEvent) => {
        if (e.touches.length > 0) {
          const touch = e.touches[0];
          this._handleRoomMouseMove({ clientX: touch.clientX, currentTarget: e.currentTarget } as any, roomIdx, points);
        }
      }}
            @touchend=${() => this._handleRoomMouseLeave(roomIdx)}
          >
            ${mergedBands.map(
        (b) => svg`
                <rect
                  x="${b.startX.toFixed(1)}"
                  y="0"
                  width="${Math.max(4, b.endX - b.startX).toFixed(1)}"
                  height="${height}"
                  class="openable-zone-band"
                  rx="3"
                  style="fill: rgba(16, 185, 129, 0.25); stroke: rgba(16, 185, 129, 0.6); stroke-width: 1.5px;"
                />
              `,
      )}

            ${pastOutdoorPath
        ? svg`
                  <path
                    d="${pastOutdoorPath}"
                    fill="none"
                    stroke="var(--primary-color, #2196f3)"
                    stroke-width="1.8"
                    opacity="0.85"
                  />
                `
        : nothing}

            ${futureOutdoorPath
        ? svg`
                  <path
                    d="${futureOutdoorPath}"
                    fill="none"
                    stroke="var(--primary-color, #2196f3)"
                    stroke-width="1.8"
                    stroke-dasharray="4 3"
                    opacity="0.7"
                  />
                `
        : nothing}

            ${!pastOutdoorPath && !futureOutdoorPath && fullOutdoorPath
        ? svg`
                  <path
                    d="${fullOutdoorPath}"
                    fill="none"
                    stroke="var(--primary-color, #2196f3)"
                    stroke-width="1.8"
                    stroke-dasharray="4 3"
                    opacity="0.7"
                  />
                `
        : nothing}

            ${pastRoomPath
        ? svg`
                  <path
                    d="${pastRoomPath}"
                    fill="none"
                    stroke="var(--vc-green, #10b981)"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                `
        : nothing}

            ${futureRoomPath
        ? svg`
                  <path
                    d="${futureRoomPath}"
                    fill="none"
                    stroke="var(--vc-green, #10b981)"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-dasharray="4 3"
                  />
                `
        : nothing}

            ${!pastRoomPath && !futureRoomPath && fullRoomPath
        ? svg`
                  <path
                    d="${fullRoomPath}"
                    fill="none"
                    stroke="var(--vc-green, #10b981)"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-dasharray="4 3"
                  />
                `
        : nothing}

            ${hasHistoryPoints && nowX > 0 && nowX < width
        ? svg`
                  <line
                    x1="${nowX.toFixed(1)}"
                    y1="0"
                    x2="${nowX.toFixed(1)}"
                    y2="${height}"
                    class="now-divider-line"
                  />
                `
        : nothing}

            ${activePoint
        ? svg`
                  <line
                    x1="${activePoint.x.toFixed(1)}"
                    y1="0"
                    x2="${activePoint.x.toFixed(1)}"
                    y2="${height}"
                    class="hover-crosshair"
                  />
                  <circle
                    cx="${activePoint.x.toFixed(1)}"
                    cy="${activePoint.roomY.toFixed(1)}"
                    r="4"
                    class="hover-marker"
                    stroke="var(--vc-green, #10b981)"
                  />
                  <circle
                    cx="${activePoint.x.toFixed(1)}"
                    cy="${activePoint.outdoorY.toFixed(1)}"
                    r="3.5"
                    class="hover-marker"
                    stroke="var(--primary-color, #2196f3)"
                  />
                `
        : nothing}
          </svg>
        </div>

        <div class="graph-time-axis">
          ${timeLabels.map((lbl) => html`<span>${lbl}</span>`)}
        </div>
      </div>
    `;
  }

  private _renderUpcomingWindows(forecastWindow: ForecastWindow): TemplateResult {
    const windows = forecastWindow.upcomingWindows || [];
    const weatherEntity = this.config?.weather_entity;

    if (windows.length === 0) {
      return html`
        <div
          class="forecast-windows-empty ${weatherEntity ? 'clickable' : ''}"
          @click=${() => this._handleMoreInfo(weatherEntity)}
          title="${weatherEntity ? `View weather forecast for ${weatherEntity}` : ''}"
        >
          <ha-icon icon="mdi:weather-sunny-off"></ha-icon>
          <span>No ventilation windows predicted in upcoming forecast</span>
        </div>
      `;
    }

    return html`
      <div
        class="forecast-windows-section ${weatherEntity ? 'clickable' : ''}"
        @click=${() => this._handleMoreInfo(weatherEntity)}
        title="${weatherEntity ? `View weather forecast for ${weatherEntity}` : ''}"
      >
        <div class="windows-list">
          ${windows.map(
      (win) => html`
              <div class="window-row ${win.isCurrent ? 'active-window' : ''}">
                <div class="window-time-range">
                  <span class="start-time">${win.formattedStart}</span>
                  <ha-icon icon="mdi:arrow-right-thin" class="arrow-icon"></ha-icon>
                  <span class="end-time">${win.formattedEnd}</span>
                </div>
                <div class="window-badge-meta">
                  ${win.isCurrent
          ? html`<span class="active-tag"><ha-icon icon="mdi:check-circle"></ha-icon> Active Now</span>`
          : html`<span class="duration-tag"><ha-icon icon="mdi:clock-outline"></ha-icon> ${win.durationHours}h</span>`}
                </div>
              </div>
            `,
    )}
        </div>
      </div>
    `;
  }

  private _renderWindowBadge(advice: RoomAdvice, room?: RoomConfig): TemplateResult {
    const isCorrect = advice.windowCorrect;
    const stateLabel = advice.windowState === 'open'
      ? localize('window.open')
      : localize('window.closed');
    const windowIcon = advice.windowState === 'open'
      ? 'mdi:window-open-variant'
      : 'mdi:window-closed-variant';

    const badgeClass = isCorrect === null
      ? ''
      : isCorrect
        ? 'window-correct'
        : 'window-incorrect';

    const windowEntity = room?.window_sensor;

    return html`
      <span
        class="window-badge ${badgeClass} ${windowEntity ? 'clickable' : ''}"
        @click=${(e: Event) => {
        if (windowEntity) {
          e.stopPropagation();
          this._handleMoreInfo(windowEntity);
        }
      }}
        title="${windowEntity ? `View history graph for ${windowEntity}` : ''}"
      >
        <ha-icon icon="${windowIcon}"></ha-icon>
        ${stateLabel}
        ${isCorrect === true ? html`<ha-icon icon="mdi:check"></ha-icon>` : nothing}
        ${isCorrect === false ? html`<ha-icon icon="mdi:alert"></ha-icon>` : nothing}
      </span>
    `;
  }

  private _renderSuggestionBadge(advice: RoomAdvice): TemplateResult {
    const showNextState = this.config.show_next_state_change !== false;
    const nextState = showNextState ? advice.nextStateChange : null;

    if (nextState) {
      const isOpen = nextState.targetState === 'open';
      const label = isOpen
        ? localize('forecast.next_state_open', { time: nextState.formattedTime })
        : localize('forecast.next_state_closed', { time: nextState.formattedTime });
      const icon = isOpen ? 'mdi:window-open-variant' : 'mdi:window-closed-variant';
      const badgeClass = isOpen ? 'to-open' : 'to-closed';

      return html`
        <div
          class="suggestion-badge ${badgeClass}"
          title="Time to next state change (${nextState.targetState})"
        >
          <ha-icon icon="${icon}"></ha-icon>
          <span class="suggestion-text">${label}</span>
        </div>
      `;
    }

    const icon = this._getStatusIcon(advice.status);
    const label = localize(`status.${advice.status}`);

    return html`
      <div class="suggestion-badge status-${advice.status}">
        <ha-icon icon="${icon}"></ha-icon>
        <span class="suggestion-text">${label}</span>
      </div>
    `;
  }

  private _renderSkeleton(): TemplateResult {
    return html`
      <ha-card>
        <div class="skeleton-content">
          <div class="skeleton skeleton-outdoor"></div>
          <div class="skeleton skeleton-room"></div>
          <div class="skeleton skeleton-room"></div>
        </div>
      </ha-card>
    `;
  }

  private _getEffectiveForecast(): ForecastEntry[] {
    let effectiveForecast: ForecastEntry[] = this.forecast;
    if ((!effectiveForecast || effectiveForecast.length === 0) && this.config?.weather_entity && this.hass) {
      const weatherState = this.hass.states[this.config.weather_entity];
      if (weatherState?.attributes?.forecast) {
        effectiveForecast = extractForecastItems(weatherState.attributes.forecast, this.config.weather_entity);
      }
    }
    return effectiveForecast;
  }

  /* ── System Diagnostics / Health Checks ─────────────────────── */

  private _getHealthIssues(): HealthIssue[] {
    const issues: HealthIssue[] = [];
    if (!this.hass || !this.config) return issues;

    // Outdoor temp sensor check
    if (this.config.outdoor_temperature) {
      const stateObj = this.hass.states[this.config.outdoor_temperature];
      if (!stateObj) {
        issues.push({
          type: 'missing_entity',
          severity: 'warning',
          entityId: this.config.outdoor_temperature,
          message: `Outdoor temp sensor non-existent: ${this.config.outdoor_temperature}`,
        });
      } else if (stateObj.state === 'unavailable' || stateObj.state === 'unknown') {
        issues.push({
          type: 'unavailable',
          severity: 'warning',
          entityId: this.config.outdoor_temperature,
          message: `Outdoor temp sensor is ${stateObj.state}: ${this.config.outdoor_temperature}`,
        });
      }
    }

    // Outdoor humidity sensor check
    if (this.config.outdoor_humidity) {
      const stateObj = this.hass.states[this.config.outdoor_humidity];
      if (!stateObj) {
        issues.push({
          type: 'missing_entity',
          severity: 'warning',
          entityId: this.config.outdoor_humidity,
          message: `Outdoor humidity sensor non-existent: ${this.config.outdoor_humidity}`,
        });
      } else if (stateObj.state === 'unavailable' || stateObj.state === 'unknown') {
        issues.push({
          type: 'unavailable',
          severity: 'warning',
          entityId: this.config.outdoor_humidity,
          message: `Outdoor humidity sensor is ${stateObj.state}: ${this.config.outdoor_humidity}`,
        });
      }
    }

    // Weather entity check
    if (this.config.weather_entity) {
      const stateObj = this.hass.states[this.config.weather_entity];
      if (!stateObj) {
        issues.push({
          type: 'missing_entity',
          severity: 'warning',
          entityId: this.config.weather_entity,
          message: `Weather entity non-existent: "${this.config.weather_entity}"`,
        });
      } else if (stateObj.state === 'unavailable' || stateObj.state === 'unknown') {
        issues.push({
          type: 'unavailable',
          severity: 'warning',
          entityId: this.config.weather_entity,
          message: `Weather entity "${this.config.weather_entity}" is ${stateObj.state}`,
        });
      } else {
        const effectiveForecast = this._getEffectiveForecast();
        if (effectiveForecast.length === 0 && !this._subscribingEntity) {
          issues.push({
            type: 'forecast_error',
            severity: 'warning',
            entityId: this.config.weather_entity,
            message: `Weather entity "${this.config.weather_entity}" has no forecast data available`,
          });
        }
      }
    } else {
      issues.push({
        type: 'invalid_config',
        severity: 'warning',
        message: 'No Weather Entity configured — forecast prediction timelines are disabled',
      });
    }

    // Room sensors checks
    const rooms = this.config.rooms || [];
    for (const room of rooms) {
      if (!room.temperature) {
        issues.push({
          type: 'invalid_config',
          severity: 'error',
          message: `Room "${room.name || 'Unnamed'}" has no temperature sensor configured`,
        });
      } else {
        const stateObj = this.hass.states[room.temperature];
        if (!stateObj) {
          issues.push({
            type: 'missing_entity',
            severity: 'warning',
            entityId: room.temperature,
            message: `Room "${room.name}": Temp sensor non-existent (${room.temperature})`,
          });
        } else if (stateObj.state === 'unavailable' || stateObj.state === 'unknown') {
          issues.push({
            type: 'unavailable',
            severity: 'warning',
            entityId: room.temperature,
            message: `Room "${room.name}": Temp sensor is ${stateObj.state} (${room.temperature})`,
          });
        }
      }

      if (room.humidity) {
        const stateObj = this.hass.states[room.humidity];
        if (!stateObj) {
          issues.push({
            type: 'missing_entity',
            severity: 'warning',
            entityId: room.humidity,
            message: `Room "${room.name}": Humidity sensor non-existent (${room.humidity})`,
          });
        } else if (stateObj.state === 'unavailable' || stateObj.state === 'unknown') {
          issues.push({
            type: 'unavailable',
            severity: 'warning',
            entityId: room.humidity,
            message: `Room "${room.name}": Humidity sensor is ${stateObj.state} (${room.humidity})`,
          });
        }
      }

      if (room.window_sensor) {
        const stateObj = this.hass.states[room.window_sensor];
        if (!stateObj) {
          issues.push({
            type: 'missing_entity',
            severity: 'warning',
            entityId: room.window_sensor,
            message: `Room "${room.name}": Window sensor non-existent (${room.window_sensor})`,
          });
        } else if (stateObj.state === 'unavailable' || stateObj.state === 'unknown') {
          issues.push({
            type: 'unavailable',
            severity: 'warning',
            entityId: room.window_sensor,
            message: `Room "${room.name}": Window sensor is ${stateObj.state} (${room.window_sensor})`,
          });
        }
      }
    }

    return issues;
  }

  /* ── Helpers ──────────────────────────────────────────────── */

  private _getStatusIcon(status: VentilationStatus): string {
    switch (status) {
      case VentilationStatus.VENTILATE_NOW:
        return 'mdi:window-open-variant';
      case VentilationStatus.DO_NOT_VENTILATE:
        return 'mdi:window-closed-variant';
      case VentilationStatus.CAUTION:
        return 'mdi:alert-outline';
      default:
        return 'mdi:help-circle-outline';
    }
  }

  private _getTrackedEntities(): string[] {
    const entities: string[] = [];

    if (this.config.outdoor_temperature) entities.push(this.config.outdoor_temperature);
    if (this.config.outdoor_humidity) entities.push(this.config.outdoor_humidity);
    if (this.config.weather_entity) entities.push(this.config.weather_entity);

    for (const room of this.config.rooms || []) {
      if (room.temperature) entities.push(room.temperature);
      if (room.humidity) entities.push(room.humidity);
      if (room.window_sensor) entities.push(room.window_sensor);
      if (room.outdoor_temperature_override) entities.push(room.outdoor_temperature_override);
      if (room.outdoor_humidity_override) entities.push(room.outdoor_humidity_override);
    }

    return entities.filter(Boolean);
  }

  private _subscribingEntity?: string;

  private async _subscribeForecast(): Promise<void> {
    const entityId = this.config?.weather_entity;
    if (!this.hass || !entityId) return;

    if (this._subscribedEntity === entityId || this._subscribingEntity === entityId) return;

    this._unsubscribeForecast();
    this._subscribingEntity = entityId;

    try {
      const unsub = await subscribeForecast(
        this.hass,
        entityId,
        (forecast) => {
          this.forecast = forecast;
          this.requestUpdate();
        },
      );

      if (this._subscribingEntity === entityId) {
        this._forecastUnsub = unsub;
        this._subscribedEntity = entityId;
      } else {
        try {
          unsub();
        } catch (e) {
          // ignore
        }
      }
    } catch (e) {
      console.warn('Ventilation Card: Could not subscribe to forecast:', e);
    } finally {
      if (this._subscribingEntity === entityId) {
        this._subscribingEntity = undefined;
      }
    }
  }

  private _unsubscribeForecast(): void {
    this._subscribingEntity = undefined;
    this._subscribedEntity = undefined;
    if (this._forecastUnsub) {
      try {
        this._forecastUnsub();
      } catch (e) {
        // ignore errors during unsub
      }
      this._forecastUnsub = undefined;
    }
  }

  public getCardSize(): number {
    return 2 + (this.config?.rooms?.length || 1) * 2;
  }

  public getGridOptions() {
    const rows = 2 + (this.config?.rooms?.length || 1) * 2;
    return { rows, columns: 6, min_rows: 3, max_rows: rows + 4 };
  }
}

function toDate(val: any): Date {
  if (val instanceof Date) return val;
  if (typeof val === 'number') return new Date(val);
  if (typeof val === 'string') return new Date(val);
  return new Date();
}

function buildSplinePath(pts: Array<{ x: number; y: number }>): string {
  if (!pts || pts.length < 2) return '';

  let path = `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    const cp1x = p0.x + (p1.x - p0.x) / 3;
    const cp1y = p0.y;
    const cp2x = p0.x + 2 * (p1.x - p0.x) / 3;
    const cp2y = p1.y;
    path += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p1.x.toFixed(1)},${p1.y.toFixed(1)}`;
  }
  return path;
}

function splitPointsByTime<T extends { x: number; y: number; dateMs: number }>(
  points: T[],
  nowMs: number,
): { pastPts: T[]; futurePts: T[] } {
  if (!points || points.length === 0) {
    return { pastPts: [], futurePts: [] };
  }

  const pastPts = points.filter((p) => p.dateMs <= nowMs);
  const futurePts = points.filter((p) => p.dateMs >= nowMs);

  if (pastPts.length === 0) {
    return { pastPts: [], futurePts: points };
  }

  if (futurePts.length === 0) {
    return { pastPts: points, futurePts: [] };
  }

  // If the last past point and first future point are the same (exactly at now), no interpolation needed
  if (pastPts[pastPts.length - 1] === futurePts[0]) {
    return { pastPts, futurePts };
  }

  // Interpolate a synthetic point at exactly nowMs so both paths meet at the NOW divider
  const lastPast = pastPts[pastPts.length - 1];
  const firstFuture = futurePts[0];
  const tRange = firstFuture.dateMs - lastPast.dateMs;

  if (tRange > 0) {
    const t = (nowMs - lastPast.dateMs) / tRange;
    const nowPoint = {
      ...lastPast,
      x: lastPast.x + (firstFuture.x - lastPast.x) * t,
      y: lastPast.y + (firstFuture.y - lastPast.y) * t,
      dateMs: nowMs,
    };
    pastPts.push(nowPoint);
    futurePts.unshift(nowPoint);
  } else {
    pastPts.push(futurePts[0]);
  }

  return { pastPts, futurePts };
}
