import { LitElement, html, TemplateResult, css, nothing } from 'lit';
import { HomeAssistant, fireEvent, LovelaceCardEditor } from 'custom-card-helpers';
import { customElement, property, state } from 'lit/decorators.js';

import type { VentilationCardConfig, RoomConfig } from './types';
import { localize } from './localize/localize';
import { CARD_EDITOR_NAME, DEFAULT_GRAPH } from './const';

const sensor = { entity: { domain: 'sensor' } };
const degrees = { number: { min: 10, max: 30, step: 0.5, mode: 'box', unit_of_measurement: '°C' } };
const hours = { number: { min: 6, max: 72, step: 6, mode: 'box', unit_of_measurement: 'h' } };

const CARD_SCHEMA = [
  { name: 'title', selector: { text: {} } },
  { name: 'target_temperature', selector: degrees },
  { name: 'max_humidity', selector: { number: { min: 30, max: 80, step: 1, mode: 'box', unit_of_measurement: '%' } } },
  { name: 'weather_entity', selector: { entity: { domain: 'weather' } } },
  { name: 'outdoor_temperature', selector: sensor },
  { name: 'outdoor_humidity', selector: sensor },
  {
    name: 'graph',
    selector: {
      select: {
        multiple: true,
        options: ['temperature', 'humidity', 'absolute_humidity'].map((value) => ({ value, label: localize(`editor.graph_${value}`) })),
      },
    },
  },
  { name: 'history_hours', selector: hours },
  { name: 'forecast_hours', selector: hours },
];

const ROOM_SCHEMA = [
  { name: 'name', required: true, selector: { text: {} } },
  { name: 'icon', selector: { icon: {} } },
  { name: 'temperature', required: true, selector: sensor },
  { name: 'humidity', selector: sensor },
  { name: 'window_sensor', selector: { entity: { domain: 'binary_sensor' } } },
  { name: 'target_temperature', selector: degrees },
];

@customElement(CARD_EDITOR_NAME)
export class VentilationCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass!: HomeAssistant;
  @state() private _config?: VentilationCardConfig;

  public setConfig(config: VentilationCardConfig): void {
    this._config = config;
  }

  private _emit(config: VentilationCardConfig): void {
    fireEvent(this, 'config-changed', { config });
  }

  /** Replace room `idx`; omit `room` to remove it. */
  private _setRoom(idx: number, room?: RoomConfig): void {
    const rooms = [...(this._config!.rooms ?? [])];
    if (room) rooms[idx] = room;
    else rooms.splice(idx, 1);
    this._emit({ ...this._config!, rooms });
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this.hass || !this._config) return nothing;
    const rooms = this._config.rooms ?? [];
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${{ graph: DEFAULT_GRAPH, ...this._config }}
        .schema=${CARD_SCHEMA}
        .computeLabel=${(s: { name: string }) => localize(`editor.${s.name}`)}
        @value-changed=${(e: CustomEvent) => {
          e.stopPropagation();
          this._emit(e.detail.value);
        }}
      ></ha-form>
      <h3>${localize('editor.rooms')}</h3>
      ${rooms.map(
        (room, i) => html`
          <ha-expansion-panel outlined .header=${room.name || localize('editor.new_room')}>
            <ha-form
              .hass=${this.hass}
              .data=${room}
              .schema=${ROOM_SCHEMA}
              .computeLabel=${(s: { name: string }) =>
                localize(s.name === 'target_temperature' ? 'editor.room_target_temperature' : `editor.${s.name}`)}
              @value-changed=${(e: CustomEvent) => {
                e.stopPropagation();
                this._setRoom(i, e.detail.value);
              }}
            ></ha-form>
            <ha-button @click=${() => this._setRoom(i)}>${localize('editor.remove_room')}</ha-button>
          </ha-expansion-panel>
        `,
      )}
      <ha-button @click=${() => this._setRoom(rooms.length, { name: '', temperature: '' })}>
        ${localize('editor.add_room')}
      </ha-button>
    `;
  }

  static styles = css`
    ha-expansion-panel {
      margin-bottom: 8px;
    }
    ha-expansion-panel ha-form {
      display: block;
      padding: 8px 0;
    }
  `;
}
