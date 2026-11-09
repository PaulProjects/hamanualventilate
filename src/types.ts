import { LovelaceCard, LovelaceCardConfig, LovelaceCardEditor } from 'custom-card-helpers';

declare global {
  interface HTMLElementTagNameMap {
    'ventilation-card': LovelaceCard;
    'ventilation-card-dev': LovelaceCard;
    'ventilation-card-editor': LovelaceCardEditor;
    'ventilation-card-dev-editor': LovelaceCardEditor;
  }
}

export interface RoomConfig {
  name: string;
  icon?: string;
  temperature: string; // entity_id — required
  humidity?: string; // entity_id
  window_sensor?: string; // binary_sensor entity_id
  target_temperature?: number; // °C, overrides the card-level target
}

export interface VentilationCardConfig extends LovelaceCardConfig {
  type: string;
  title?: string;
  weather_entity?: string; // weather.* entity for forecast
  outdoor_temperature?: string; // sensor.* entity
  outdoor_humidity?: string; // sensor.* entity
  target_temperature?: number; // °C desired room temperature (default 21)
  max_humidity?: number; // % relative humidity ceiling (default 60)
  history_hours?: number; // graph history (default 24)
  forecast_hours?: number; // graph + prediction horizon (default 24)
  rooms: RoomConfig[];
}

export interface ForecastEntry {
  datetime: string;
  temperature: number;
  humidity?: number;
}
