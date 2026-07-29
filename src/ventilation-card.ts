import { LitElement, html, TemplateResult, PropertyValues, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { HomeAssistant, LovelaceCardEditor } from 'custom-card-helpers';

import type { VentilationCardConfig, RoomConfig, RoomAdvice, ForecastEntry, SensorReadings, HealthIssue, ForecastWindow, VentilationWindowRange } from './types';
import { VentilationStatus } from './types';
import { CARD_VERSION, CARD_NAME, DEFAULT_AH_THRESHOLD, DEFAULT_BALANCED_MAX_TEMP } from './const';
import { cardStyles } from './styles';
import { localize } from './localize/localize';
import { getVentilationAdvice, getSensorReadings, readSensor } from './utils/ventilation-logic';
import { subscribeForecast, extractForecastItems } from './utils/forecast';

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

  private _forecastUnsub?: () => void;
  private _subscribedEntity?: string;

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
      show_values: true,
      show_absolute_humidity: true,
      show_forecast: true,
      show_inline_forecast: false,
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
      changedProps.has('_expandedRoomIndex')
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
    }
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
        ),
      );

      const goalLabel = localize(`goal.${this.config.goal}`);
      const title = this.config.title || localize('card.title_default');

      return html`
        <ha-card>
          <div class="card-header-row">
            <div class="card-header-title">
              <ha-icon icon="mdi:air-filter" class="header-icon"></ha-icon>
              <span>${this.config.title || localize('card.title')}</span>
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

  private _renderOutdoor(outdoor: SensorReadings): TemplateResult {
    const showAbsHum = this.config.show_absolute_humidity !== false;
    const tempEntity = this.config.outdoor_temperature || this.config.weather_entity;
    const humidityEntity = this.config.outdoor_humidity || this.config.weather_entity;
    const mainEntity = tempEntity || humidityEntity || this.config.weather_entity;

    let weatherStateText = '';
    if (this.config.weather_entity && this.hass?.states[this.config.weather_entity]) {
      const wState = this.hass.states[this.config.weather_entity];
      weatherStateText = wState.state ? wState.state.replace(/-/g, ' ') : '';
    }

    return html`
      <div class="outdoor-section">
        <div class="outdoor-header">
          <div
            class="outdoor-title-group ${mainEntity ? 'clickable' : ''}"
            @click=${() => mainEntity && this._handleMoreInfo(mainEntity)}
            title="${mainEntity ? `View details for ${mainEntity}` : ''}"
          >
            <div class="outdoor-icon-avatar">
              <ha-icon icon="mdi:home-export-outline"></ha-icon>
            </div>
            <span class="outdoor-name">${localize('card.outdoor')}</span>
          </div>

          <div class="outdoor-header-badges">
            ${weatherStateText
              ? html`
                  <div
                    class="outdoor-weather-badge ${this.config.weather_entity ? 'clickable' : ''}"
                    @click=${() => this._handleMoreInfo(this.config.weather_entity)}
                    title="${this.config.weather_entity ? `View weather for ${this.config.weather_entity}` : ''}"
                  >
                    <ha-icon icon="mdi:weather-partly-cloudy"></ha-icon>
                    <span>${weatherStateText}</span>
                  </div>
                `
              : nothing}

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
                    <span>${outdoor.temperature.toFixed(1)}°C${outdoor.humidity !== null ? ` · ${outdoor.humidity.toFixed(0)}%` : ''}</span>
                  </div>
                `
              : nothing}

            <div
              class="outdoor-details-trigger ${this._expandedOutdoor ? 'expanded' : ''}"
              @click=${(e: Event) => {
                e.stopPropagation();
                this._expandedOutdoor = !this._expandedOutdoor;
                this.requestUpdate();
              }}
              title="${this._expandedOutdoor ? 'Collapse outdoor details' : 'Expand outdoor details & forecast'}"
            >
              <ha-icon icon="${this._expandedOutdoor ? 'mdi:chevron-up' : 'mdi:chevron-down'}"></ha-icon>
            </div>
          </div>
        </div>

        ${this._expandedOutdoor
          ? html`
              <div class="outdoor-expanded-panel" @click=${(e: Event) => e.stopPropagation()}>
                <div class="room-values">
                  ${outdoor.temperature !== null
                    ? html`
                        <span
                          class="sensor-value ${tempEntity ? 'clickable' : ''}"
                          @click=${() => tempEntity && this._handleMoreInfo(tempEntity)}
                          title="${tempEntity ? `View graph for ${tempEntity}` : ''}"
                        >
                          <ha-icon icon="mdi:thermometer"></ha-icon>
                          <span class="value">${outdoor.temperature.toFixed(1)}</span>
                          <span class="unit">°C</span>
                        </span>
                      `
                    : nothing}
                  ${outdoor.humidity !== null
                    ? html`
                        <span
                          class="sensor-value ${humidityEntity ? 'clickable' : ''}"
                          @click=${() => humidityEntity && this._handleMoreInfo(humidityEntity)}
                          title="${humidityEntity ? `View graph for ${humidityEntity}` : ''}"
                        >
                          <ha-icon icon="mdi:water-percent"></ha-icon>
                          <span class="value">${outdoor.humidity.toFixed(0)}</span>
                          <span class="unit">%</span>
                        </span>
                      `
                    : nothing}
                  ${showAbsHum && outdoor.absoluteHumidity !== null
                    ? html`
                        <span
                          class="sensor-value ${mainEntity ? 'clickable' : ''}"
                          @click=${() => mainEntity && this._handleMoreInfo(mainEntity)}
                          title="${mainEntity ? `View graph for ${mainEntity}` : ''}"
                        >
                          <ha-icon icon="mdi:water"></ha-icon>
                          <span class="value">${outdoor.absoluteHumidity.toFixed(1)}</span>
                          <span class="unit">g/m³</span>
                        </span>
                      `
                    : nothing}
                </div>

                ${this._renderOutdoorForecastGraph()}
              </div>
            `
          : nothing}
      </div>
    `;
  }

  private _renderOutdoorForecastGraph(): TemplateResult {
    const forecast = this._getEffectiveForecast().slice(0, 12);
    if (!forecast || forecast.length === 0) {
      return html`
        <div class="outdoor-forecast-empty">
          <ha-icon icon="mdi:chart-line-variant"></ha-icon>
          <span>No weather forecast temperature data available</span>
        </div>
      `;
    }

    const temps = forecast.map((f) => f.temperature);
    const minTemp = Math.floor(Math.min(...temps) - 1);
    const maxTemp = Math.ceil(Math.max(...temps) + 1);
    const tempRange = maxTemp - minTemp || 1;

    return html`
      <div class="outdoor-forecast-graph-container">
        <div class="graph-header">
          <ha-icon icon="mdi:chart-timeline-variant"></ha-icon>
          <span>Temperature Forecast</span>
          <span class="graph-range">${minTemp.toFixed(0)}°C – ${maxTemp.toFixed(0)}°C</span>
        </div>

        <div class="forecast-bars-grid">
          ${forecast.map((item) => {
            const date = new Date(item.datetime);
            const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const pct = Math.max(12, Math.min(100, ((item.temperature - minTemp) / tempRange) * 100));

            return html`
              <div class="forecast-bar-col">
                <span class="bar-temp-val">${item.temperature.toFixed(1)}°</span>
                <div class="bar-track">
                  <div class="bar-fill" style="height: ${pct}%;"></div>
                </div>
                <span class="bar-time-lbl">${timeStr}</span>
              </div>
            `;
          })}
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
        title="Click to toggle room details"
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
                    <span>${advice.indoor.temperature.toFixed(1)}°C${advice.indoor.humidity !== null ? ` · ${advice.indoor.humidity.toFixed(0)}%` : ''}</span>
                  </div>
                `
              : nothing}

            ${advice.windowState !== null
              ? this._renderWindowBadge(advice, room)
              : nothing}

            <div class="suggestion-badge status-${advice.status}">
              <ha-icon icon="${this._getStatusIcon(advice.status)}"></ha-icon>
              <span class="suggestion-text">${localize(`status.${advice.status}`)}</span>
            </div>

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
          ? this._renderExpandedRoomDetails(advice, room)
          : nothing}
      </div>
    `;
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

  private _renderExpandedRoomDetails(advice: RoomAdvice, room?: RoomConfig): TemplateResult {
    const showAbsHum = this.config.show_absolute_humidity !== false;

    const tempEntity = room?.temperature;
    const humidityEntity = room?.humidity || tempEntity;
    const customOutdoorTemp = room?.outdoor_temperature_override;
    const customOutdoorHum = room?.outdoor_humidity_override;
    const customOutdoorMain = customOutdoorTemp || customOutdoorHum;

    return html`
      <div class="room-expanded-panel" @click=${(e: Event) => e.stopPropagation()}>
        ${advice.reason
          ? html`
              <div class="expanded-reason-box">
                <ha-icon icon="mdi:information-outline"></ha-icon>
                <span>${advice.reason}</span>
              </div>
            `
          : nothing}

        <div class="room-values">
          ${advice.indoor.temperature !== null
            ? html`
                <span
                  class="sensor-value ${tempEntity ? 'clickable' : ''}"
                  @click=${(e: Event) => {
                    if (tempEntity) {
                      e.stopPropagation();
                      this._handleMoreInfo(tempEntity);
                    }
                  }}
                  title="${tempEntity ? `View history graph for ${tempEntity}` : ''}"
                >
                  <ha-icon icon="mdi:thermometer"></ha-icon>
                  <span class="value">${advice.indoor.temperature.toFixed(1)}</span>
                  <span class="unit">°C</span>
                </span>
              `
            : nothing}
          ${advice.indoor.humidity !== null
            ? html`
                <span
                  class="sensor-value ${humidityEntity ? 'clickable' : ''}"
                  @click=${(e: Event) => {
                    if (humidityEntity) {
                      e.stopPropagation();
                      this._handleMoreInfo(humidityEntity);
                    }
                  }}
                  title="${humidityEntity ? `View history graph for ${humidityEntity}` : ''}"
                >
                  <ha-icon icon="mdi:water-percent"></ha-icon>
                  <span class="value">${advice.indoor.humidity.toFixed(0)}</span>
                  <span class="unit">%</span>
                </span>
              `
            : nothing}
          ${showAbsHum && advice.indoor.absoluteHumidity !== null
            ? html`
                <span
                  class="sensor-value ${humidityEntity ? 'clickable' : ''}"
                  @click=${(e: Event) => {
                    if (humidityEntity) {
                      e.stopPropagation();
                      this._handleMoreInfo(humidityEntity);
                    }
                  }}
                  title="${humidityEntity ? `View history graph for ${humidityEntity}` : ''}"
                >
                  <ha-icon icon="mdi:water"></ha-icon>
                  <span class="value">${advice.indoor.absoluteHumidity.toFixed(1)}</span>
                  <span class="unit">g/m³</span>
                </span>
              `
            : nothing}
        </div>

        ${advice.hasCustomOutdoor
          ? html`
              <div
                class="room-outdoor ${customOutdoorMain ? 'clickable' : ''}"
                @click=${(e: Event) => {
                  if (customOutdoorMain) {
                    e.stopPropagation();
                    this._handleMoreInfo(customOutdoorMain);
                  }
                }}
                title="${customOutdoorMain ? `View details for ${customOutdoorMain}` : ''}"
              >
                <ha-icon icon="mdi:home-export-outline"></ha-icon>
                ${advice.outdoor.temperature !== null
                  ? html`${advice.outdoor.temperature.toFixed(1)}°C`
                  : ''}
                ${advice.outdoor.humidity !== null
                  ? html`· ${advice.outdoor.humidity.toFixed(0)}%`
                  : ''}
                ${showAbsHum && advice.outdoor.absoluteHumidity !== null
                  ? html`· ${advice.outdoor.absoluteHumidity.toFixed(1)} g/m³`
                  : ''}
              </div>
            `
          : nothing}

        ${advice.forecastWindow
          ? this._renderUpcomingWindows(advice.forecastWindow)
          : nothing}
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
        <div class="windows-header">
          <ha-icon icon="mdi:calendar-clock"></ha-icon>
          <span>Upcoming Ventilation Windows</span>
        </div>
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

  private _getOutdoorTemperature(): number | null {
    if (this.config.outdoor_temperature) {
      return readSensor(this.hass, this.config.outdoor_temperature);
    }
    if (this.config.weather_entity) {
      const weatherState = this.hass.states[this.config.weather_entity];
      if (weatherState?.attributes?.temperature != null) {
        return parseFloat(weatherState.attributes.temperature);
      }
    }
    return null;
  }

  private _getOutdoorHumidity(): number | null {
    if (this.config.outdoor_humidity) {
      return readSensor(this.hass, this.config.outdoor_humidity);
    }
    if (this.config.weather_entity) {
      const weatherState = this.hass.states[this.config.weather_entity];
      if (weatherState?.attributes?.humidity != null) {
        return parseFloat(weatherState.attributes.humidity);
      }
    }
    return null;
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

// Fallback registration
if (!customElements.get('ventilation-card')) {
  customElements.define('ventilation-card', VentilationCard);
}
