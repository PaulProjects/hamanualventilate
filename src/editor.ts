/* eslint-disable @typescript-eslint/no-explicit-any */
import { LitElement, html, TemplateResult, css, nothing } from 'lit';
import { HomeAssistant, fireEvent, LovelaceCardEditor } from 'custom-card-helpers';
import { customElement, property, state } from 'lit/decorators.js';

import type { VentilationCardConfig, RoomConfig } from './types';
import { localize } from './localize/localize';
import { DEFAULT_AH_THRESHOLD, DEFAULT_BALANCED_MAX_TEMP, DEFAULT_MIN_HUMIDITY, DEFAULT_MAX_HUMIDITY } from './const';

@customElement('ventilation-card-editor')
export class VentilationCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass!: HomeAssistant;
  @state() private _config?: VentilationCardConfig;
  @state() private _openSection = '';
  @state() private _expandedRoom: number | null = null;
  @state() private _expandedOverride: number | null = null;

  public setConfig(config: VentilationCardConfig): void {
    this._config = {
      ...structuredClone(config),
      goal: config.goal || 'cooling',
      rooms: config.rooms || [],
      ah_threshold: config.ah_threshold ?? DEFAULT_AH_THRESHOLD,
      balanced_max_temperature: config.balanced_max_temperature ?? DEFAULT_BALANCED_MAX_TEMP,
      min_humidity: config.min_humidity ?? DEFAULT_MIN_HUMIDITY,
      max_humidity: config.max_humidity ?? DEFAULT_MAX_HUMIDITY,
      show_values: config.show_values ?? true,
      show_absolute_humidity: config.show_absolute_humidity ?? true,
      show_forecast: config.show_forecast ?? true,
      show_inline_forecast: config.show_inline_forecast ?? false,
      forecast_hours: config.forecast_hours ?? 24,
      show_next_state_change: config.show_next_state_change ?? true,
      insulation_factor: config.insulation_factor ?? 0.05,
      ventilation_speed: config.ventilation_speed ?? 0.35,
    };
    this.requestUpdate();
  }

  protected shouldUpdate(): boolean {
    return true;
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this.hass || !this._config) {
      return html`<div>Loading...</div>`;
    }

    return html`
      <div class="top-level-settings">
        <ha-selector
          .hass=${this.hass}
          .selector=${{ text: {} }}
          .value=${this._config?.title || ''}
          label="${localize('editor.title')}"
          .configValue=${'title'}
          @value-changed=${this._selectorChanged}
        ></ha-selector>

        <ha-selector
          .hass=${this.hass}
          .selector=${{
            select: {
              options: [
                { value: 'cooling', label: localize('editor.goal_cooling') },
                { value: 'warming', label: localize('editor.goal_warming') },
                { value: 'humidity', label: localize('editor.goal_humidity') },
                { value: 'balanced', label: localize('editor.goal_balanced') },
              ],
              mode: 'dropdown',
            },
          }}
          .value=${this._config?.goal || 'cooling'}
          label="${localize('editor.goal')}"
          .configValue=${'goal'}
          @value-changed=${this._selectorChanged}
        ></ha-selector>

        ${this._config?.goal === 'balanced'
          ? html`
              <ha-selector
                .hass=${this.hass}
                .selector=${{ number: { min: 15, max: 35, step: 0.5, mode: 'box', unit_of_measurement: '°C' } }}
                .value=${this._config.balanced_max_temperature ?? DEFAULT_BALANCED_MAX_TEMP}
                label="${localize('editor.max_temperature')}"
                .configValue=${'balanced_max_temperature'}
                @value-changed=${this._selectorChanged}
              ></ha-selector>
            `
          : nothing}
      </div>

      ${this._renderSection(
        'visuals',
        localize('editor.visuals'),
        this._renderVisualsSection(),
      )}
      ${this._renderSection(
        'prediction',
        localize('editor.prediction'),
        this._renderPredictionSection(),
      )}
      ${this._renderSection(
        'thresholds',
        localize('editor.thresholds'),
        this._renderThresholdsSection(),
      )}
      ${this._renderSection(
        'outdoor',
        localize('editor.outdoor_sensors'),
        this._renderOutdoorSection(),
      )}
      ${this._renderSection(
        'rooms',
        `${localize('editor.rooms')} (${this._config.rooms.length})`,
        this._renderRoomsSection(),
      )}
    `;
  }

  /* ── Thresholds section ───────────────────────────────────── */

  private _renderThresholdsSection(): TemplateResult {
    return html`
      <ha-selector
        .hass=${this.hass}
        .selector=${{ number: { min: 0, max: 100, step: 5, mode: 'box', unit_of_measurement: '%' } }}
        .value=${this._config?.min_humidity ?? DEFAULT_MIN_HUMIDITY}
        label="${localize('editor.min_humidity')}"
        .configValue=${'min_humidity'}
        @value-changed=${this._selectorChanged}
      ></ha-selector>

      <ha-selector
        .hass=${this.hass}
        .selector=${{ number: { min: 0, max: 100, step: 5, mode: 'box', unit_of_measurement: '%' } }}
        .value=${this._config?.max_humidity ?? DEFAULT_MAX_HUMIDITY}
        label="${localize('editor.max_humidity')}"
        .configValue=${'max_humidity'}
        @value-changed=${this._selectorChanged}
      ></ha-selector>

      <ha-selector
        .hass=${this.hass}
        .selector=${{ number: { min: 0, max: 10, step: 0.5, mode: 'box', unit_of_measurement: 'g/m³' } }}
        .value=${this._config?.ah_threshold ?? DEFAULT_AH_THRESHOLD}
        label="${localize('editor.ah_threshold')}"
        .configValue=${'ah_threshold'}
        @value-changed=${this._selectorChanged}
      ></ha-selector>
    `;
  }

  /* ── Visuals section ──────────────────────────────────────── */

  private _renderVisualsSection(): TemplateResult {
    return html`
      <ha-selector
        .hass=${this.hass}
        .selector=${{ boolean: {} }}
        .value=${this._config?.show_absolute_humidity ?? true}
        label="${localize('editor.show_absolute_humidity')}"
        .configValue=${'show_absolute_humidity'}
        @value-changed=${this._selectorChanged}
      ></ha-selector>

      <ha-selector
        .hass=${this.hass}
        .selector=${{ boolean: {} }}
        .value=${this._config?.show_forecast ?? true}
        label="${localize('editor.show_forecast')}"
        .configValue=${'show_forecast'}
        @value-changed=${this._selectorChanged}
      ></ha-selector>

      <ha-selector
        .hass=${this.hass}
        .selector=${{ boolean: {} }}
        .value=${this._config?.show_next_state_change ?? true}
        label="${localize('editor.show_next_state_change')}"
        .configValue=${'show_next_state_change'}
        @value-changed=${this._selectorChanged}
      ></ha-selector>

      <ha-selector
        .hass=${this.hass}
        .selector=${{ number: { min: 6, max: 48, step: 6, mode: 'slider', unit_of_measurement: 'h' } }}
        .value=${this._config?.forecast_hours ?? 24}
        label="${localize('editor.forecast_hours')}"
        .configValue=${'forecast_hours'}
        @value-changed=${this._selectorChanged}
      ></ha-selector>
    `;
  }

  /* ── Prediction section ───────────────────────────────────── */

  private _renderPredictionSection(): TemplateResult {
    return html`
      <ha-selector
        .hass=${this.hass}
        .selector=${{ number: { min: 0.01, max: 0.20, step: 0.01, mode: 'box' } }}
        .value=${this._config?.insulation_factor ?? 0.05}
        label="${localize('editor.insulation_factor')}"
        .configValue=${'insulation_factor'}
        @value-changed=${this._selectorChanged}
      ></ha-selector>

      <ha-selector
        .hass=${this.hass}
        .selector=${{ number: { min: 0.10, max: 0.80, step: 0.05, mode: 'box' } }}
        .value=${this._config?.ventilation_speed ?? 0.35}
        label="${localize('editor.ventilation_speed')}"
        .configValue=${'ventilation_speed'}
        @value-changed=${this._selectorChanged}
      ></ha-selector>
    `;
  }

  /* ── Outdoor section ──────────────────────────────────────── */

  private _renderOutdoorSection(): TemplateResult {
    return html`
      <ha-selector
        .hass=${this.hass}
        .selector=${{ entity: { domain: 'weather' } }}
        .value=${this._config?.weather_entity || ''}
        label="${localize('editor.weather_entity')}"
        .configValue=${'weather_entity'}
        @value-changed=${this._selectorChanged}
      ></ha-selector>

      <ha-selector
        .hass=${this.hass}
        .selector=${{ entity: { domain: 'sensor', device_class: 'temperature' } }}
        .value=${this._config?.outdoor_temperature || ''}
        label="${localize('editor.outdoor_temperature')}"
        .configValue=${'outdoor_temperature'}
        @value-changed=${this._selectorChanged}
      ></ha-selector>

      <ha-selector
        .hass=${this.hass}
        .selector=${{ entity: { domain: 'sensor', device_class: 'humidity' } }}
        .value=${this._config?.outdoor_humidity || ''}
        label="${localize('editor.outdoor_humidity')}"
        .configValue=${'outdoor_humidity'}
        @value-changed=${this._selectorChanged}
      ></ha-selector>
    `;
  }

  /* ── Rooms section ────────────────────────────────────────── */

  private _renderRoomsSection(): TemplateResult {
    const rooms = this._config?.rooms || [];

    return html`
      ${rooms.map((room, index) => this._renderRoomEditor(room, index))}

      <button class="add-room-btn" @click=${this._addRoom}>
        <ha-icon icon="mdi:plus"></ha-icon>
        ${localize('editor.add_room')}
      </button>
    `;
  }

  private _renderRoomEditor(room: RoomConfig, index: number): TemplateResult {
    const isExpanded = this._expandedRoom === index;
    const overridesExpanded = this._expandedOverride === index;
    const roomState = room.temperature ? this.hass?.states?.[room.temperature] : undefined;
    const displayName =
      room.name ||
      (roomState?.attributes?.friendly_name
        ? String(roomState.attributes.friendly_name)
            .replace(/\s+(temperature|temp|sensor)$/i, '')
            .trim()
        : `Room ${index + 1}`);

    return html`
      <div class="room-editor ${isExpanded ? 'room-editor--open' : ''}">
        <div
          class="room-editor__header"
          @click=${() => this._toggleRoom(index)}
        >
          <span>
            <ha-icon icon="${room.icon || 'mdi:home-thermometer'}" style="--mdc-icon-size: 18px;"></ha-icon>
            ${displayName}
          </span>
          <div class="room-editor__actions">
            <ha-icon-button
              .label=${'Remove'}
              @click=${(ev: Event) => {
                ev.stopPropagation();
                this._removeRoom(index);
              }}
            >
              <ha-icon icon="mdi:delete-outline"></ha-icon>
            </ha-icon-button>
            <ha-icon icon=${isExpanded ? 'mdi:chevron-up' : 'mdi:chevron-down'}></ha-icon>
          </div>
        </div>

        ${isExpanded
          ? html`
              <div class="room-editor__body">
                <ha-selector
                  .hass=${this.hass}
                  .selector=${{ text: {} }}
                  .value=${room.name || ''}
                  label="${localize('editor.room_name')}"
                  @value-changed=${(ev: CustomEvent) =>
                    this._roomValueChanged(index, 'name', ev.detail.value)}
                ></ha-selector>

                <ha-icon-picker
                  .hass=${this.hass}
                  .value=${room.icon || ''}
                  label="${localize('editor.room_icon')}"
                  @value-changed=${(ev: CustomEvent) => this._roomValueChanged(index, 'icon', ev.detail.value)}
                ></ha-icon-picker>

                <ha-selector
                  .hass=${this.hass}
                  .selector=${{ entity: { domain: 'sensor', device_class: 'temperature' } }}
                  .value=${room.temperature || ''}
                  label="${localize('editor.room_temperature')}"
                  @value-changed=${(ev: CustomEvent) =>
                    this._roomValueChanged(index, 'temperature', ev.detail.value)}
                ></ha-selector>

                <ha-selector
                  .hass=${this.hass}
                  .selector=${{ entity: { domain: 'sensor', device_class: 'humidity' } }}
                  .value=${room.humidity || ''}
                  label="${localize('editor.room_humidity')}"
                  @value-changed=${(ev: CustomEvent) =>
                    this._roomValueChanged(index, 'humidity', ev.detail.value)}
                ></ha-selector>

                <ha-selector
                  .hass=${this.hass}
                  .selector=${{ entity: { domain: 'binary_sensor' } }}
                  .value=${room.window_sensor || ''}
                  label="${localize('editor.room_window')}"
                  @value-changed=${(ev: CustomEvent) =>
                    this._roomValueChanged(index, 'window_sensor', ev.detail.value)}
                ></ha-selector>

                <!-- Overrides sub-section -->
                <div class="overrides-section">
                  <button
                    type="button"
                    class="overrides-header"
                    @click=${() => this._toggleOverride(index)}
                  >
                    <span>${localize('editor.overrides')}</span>
                    <ha-icon icon=${overridesExpanded ? 'mdi:chevron-up' : 'mdi:chevron-down'}></ha-icon>
                  </button>

                  ${overridesExpanded
                    ? html`
                        <div class="overrides-body">
                          <ha-selector
                            .hass=${this.hass}
                            .selector=${{ entity: { domain: 'sensor', device_class: 'temperature' } }}
                            .value=${room.outdoor_temperature_override || ''}
                            label="${localize('editor.outdoor_temp_override')}"
                            @value-changed=${(ev: CustomEvent) =>
                              this._roomValueChanged(index, 'outdoor_temperature_override', ev.detail.value)}
                          ></ha-selector>

                          <ha-selector
                            .hass=${this.hass}
                            .selector=${{ entity: { domain: 'sensor', device_class: 'humidity' } }}
                            .value=${room.outdoor_humidity_override || ''}
                            label="${localize('editor.outdoor_humidity_override')}"
                            @value-changed=${(ev: CustomEvent) =>
                              this._roomValueChanged(index, 'outdoor_humidity_override', ev.detail.value)}
                          ></ha-selector>

                          <ha-selector
                            .hass=${this.hass}
                            .selector=${{ number: { min: 15, max: 35, step: 0.5, mode: 'box', unit_of_measurement: '°C' } }}
                            .value=${room.max_temperature_override ?? ''}
                            label="${localize('editor.max_temp_override')}"
                            @value-changed=${(ev: CustomEvent) =>
                              this._roomValueChanged(index, 'max_temperature_override', ev.detail.value)}
                          ></ha-selector>

                          <ha-selector
                            .hass=${this.hass}
                            .selector=${{ number: { min: 0, max: 100, step: 5, mode: 'box', unit_of_measurement: '%' } }}
                            .value=${room.max_humidity_override ?? ''}
                            label="${localize('editor.max_humidity_override')}"
                            @value-changed=${(ev: CustomEvent) =>
                              this._roomValueChanged(index, 'max_humidity_override', ev.detail.value)}
                          ></ha-selector>

                          <ha-selector
                            .hass=${this.hass}
                            .selector=${{ number: { min: 0, max: 100, step: 5, mode: 'box', unit_of_measurement: '%' } }}
                            .value=${room.min_humidity_override ?? ''}
                            label="${localize('editor.min_humidity_override')}"
                            @value-changed=${(ev: CustomEvent) =>
                              this._roomValueChanged(index, 'min_humidity_override', ev.detail.value)}
                          ></ha-selector>
                        </div>
                      `
                    : nothing}
                </div>
              </div>
            `
          : nothing}
      </div>
    `;
  }

  /* ── Section accordion ────────────────────────────────────── */

  private _renderSection(id: string, title: string, content: TemplateResult): TemplateResult {
    const isOpen = this._openSection === id;
    return html`
      <div class="accordion ${isOpen ? 'accordion--open' : ''}">
        <button
          type="button"
          class="accordion__header"
          @click=${(ev: Event) => {
            ev.stopPropagation();
            this._openSection = this._openSection === id ? '' : id;
            this.requestUpdate();
          }}
          aria-expanded=${isOpen}
        >
          <span>${title}</span>
          <ha-icon icon=${isOpen ? 'mdi:chevron-up' : 'mdi:chevron-down'}></ha-icon>
        </button>
        <div class="accordion__body">
          <div class="accordion__content">${content}</div>
        </div>
      </div>
    `;
  }

  /* ── Event handlers ───────────────────────────────────────── */

  private _valueChanged(ev: Event): void {
    if (!this._config || !this.hass) return;
    const target = ev.target as any;
    const configValue = target.configValue;
    if (!configValue) return;

    const newValue = target.checked !== undefined ? target.checked : target.value;
    if (this._config[configValue as keyof VentilationCardConfig] === newValue) return;

    if (newValue === '' || newValue === undefined) {
      const tmpConfig = { ...this._config };
      delete (tmpConfig as any)[configValue];
      this._config = tmpConfig;
    } else {
      this._config = { ...this._config, [configValue]: newValue };
    }

    fireEvent(this, 'config-changed', { config: this._config });
    this.requestUpdate();
  }

  private _selectorChanged(ev: CustomEvent): void {
    if (!this._config || !this.hass) return;
    const target = ev.target as any;
    const configValue = target.configValue as string;
    if (!configValue) return;

    const newValue = ev.detail.value;
    if (newValue === '' || newValue === undefined || newValue === null) {
      const tmpConfig = { ...this._config };
      delete (tmpConfig as any)[configValue];
      this._config = tmpConfig;
    } else {
      this._config = { ...this._config, [configValue]: newValue };
    }

    fireEvent(this, 'config-changed', { config: this._config });
    this.requestUpdate();
  }

  private _roomValueChanged(index: number, field: keyof RoomConfig, value: any): void {
    if (!this._config) return;

    const rooms = [...this._config.rooms];
    if (!rooms[index]) return;
    const room = { ...rooms[index] };

    if ((room as any)[field] === value) return;

    if (value === undefined || value === null) {
      delete (room as any)[field];
    } else if (field === 'name') {
      room.name = value;
    } else if (value === '') {
      delete (room as any)[field];
    } else {
      (room as any)[field] = value;
    }

    // Auto-suggest room name from temperature sensor if room name is empty or matches standard default 'Room N'
    if (field === 'temperature' && value && (!room.name || /^Room \d+$/i.test(room.name.trim()))) {
      const stateObj = this.hass?.states?.[value];
      if (stateObj?.attributes?.friendly_name) {
        const cleanName = stateObj.attributes.friendly_name
          .replace(/\s+(temperature|temp|sensor)$/i, '')
          .trim();
        if (cleanName) {
          room.name = cleanName;
        }
      }
    }

    rooms[index] = room;
    this._config = { ...this._config, rooms };

    fireEvent(this, 'config-changed', { config: this._config });
    this.requestUpdate();
  }

  private _addRoom(): void {
    if (!this._config) return;

    const rooms = [
      ...this._config.rooms,
      { name: `Room ${this._config.rooms.length + 1}`, temperature: '' } as RoomConfig,
    ];
    this._config = { ...this._config, rooms };
    this._expandedRoom = rooms.length - 1;

    fireEvent(this, 'config-changed', { config: this._config });
    this.requestUpdate();
  }

  private _removeRoom(index: number): void {
    if (!this._config) return;

    const rooms = this._config.rooms.filter((_, i) => i !== index);
    this._config = { ...this._config, rooms };
    this._expandedRoom = null;

    fireEvent(this, 'config-changed', { config: this._config });
    this.requestUpdate();
  }

  private _toggleRoom(index: number): void {
    this._expandedRoom = this._expandedRoom === index ? null : index;
    this.requestUpdate();
  }

  private _toggleOverride(index: number): void {
    this._expandedOverride = this._expandedOverride === index ? null : index;
    this.requestUpdate();
  }

  /* ── Styles ───────────────────────────────────────────────── */

  static get styles() {
    return [
      css`
        /* Controls */
        ha-selector,
        ha-textfield,
        ha-icon-picker {
          margin-bottom: 16px;
          display: block;
        }

        /* Accordion */
        .accordion {
          border: 1px solid var(--divider-color);
          border-radius: 8px;
          margin-bottom: 8px;
          overflow: hidden;
        }
        .accordion__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          padding: 12px 16px;
          background: var(--secondary-background-color);
          border: none;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          color: var(--primary-text-color);
          text-align: left;
          transition: background 0.15s ease;
        }
        .accordion__header:hover {
          background: var(--divider-color);
        }
        .accordion--open .accordion__header {
          border-bottom: 1px solid var(--divider-color);
        }
        .accordion__body {
          display: grid;
          grid-template-rows: 0fr;
          transition: grid-template-rows 0.25s ease;
        }
        .accordion--open .accordion__body {
          grid-template-rows: 1fr;
        }
        .accordion__content {
          overflow: hidden;
          padding: 0 16px;
        }
        .accordion--open .accordion__content {
          padding: 16px;
        }

        /* Room editor */
        .room-editor {
          border: 1px solid var(--divider-color);
          border-radius: 8px;
          margin-bottom: 8px;
          overflow: hidden;
        }
        .room-editor__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          padding: 10px 12px;
          background: var(--secondary-background-color);
          border: none;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
          color: var(--primary-text-color);
          text-align: left;
          transition: background 0.15s ease;
        }
        .room-editor__header:hover {
          background: var(--divider-color);
        }
        .room-editor__header span {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .room-editor__actions {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .room-editor--open .room-editor__header {
          border-bottom: 1px solid var(--divider-color);
        }
        .room-editor__body {
          padding: 16px 12px;
        }

        /* Overrides sub-section */
        .overrides-section {
          margin-top: 8px;
          border: 1px dashed var(--divider-color);
          border-radius: 6px;
          overflow: hidden;
        }
        .overrides-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          padding: 8px 12px;
          background: none;
          border: none;
          cursor: pointer;
          font-size: 12px;
          font-weight: 500;
          color: var(--secondary-text-color);
          text-align: left;
        }
        .overrides-header:hover {
          background: var(--secondary-background-color);
        }
        .overrides-body {
          padding: 12px;
          border-top: 1px dashed var(--divider-color);
        }

        /* Add room button */
        .add-room-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          padding: 10px;
          background: none;
          border: 2px dashed var(--divider-color);
          border-radius: 8px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
          color: var(--primary-color);
          transition: all 0.15s ease;
        }
        .add-room-btn:hover {
          border-color: var(--primary-color);
          background: var(--secondary-background-color);
        }
        .add-room-btn ha-icon {
          --mdc-icon-size: 18px;
        }

        /* Delete button in room header */
        ha-icon-button {
          --mdc-icon-size: 18px;
          color: var(--secondary-text-color);
        }
        ha-icon-button:hover {
          color: var(--error-color);
        }
      `,
    ];
  }
}

// Fallback registration
if (!customElements.get('ventilation-card-editor')) {
  customElements.define('ventilation-card-editor', VentilationCardEditor);
}
