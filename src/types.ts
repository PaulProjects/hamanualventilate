import { LovelaceCard, LovelaceCardConfig, LovelaceCardEditor } from 'custom-card-helpers';

declare global {
  interface HTMLElementTagNameMap {
    'ventilation-card-editor': LovelaceCardEditor;
    'hui-error-card': LovelaceCard;
  }
}

/* ── Goal / Mode ──────────────────────────────────────────────── */

export type VentilationGoal = 'cooling' | 'warming' | 'humidity' | 'balanced';

/* ── Room configuration ───────────────────────────────────────── */

export interface RoomConfig {
  name: string;
  icon?: string;
  temperature: string;      // entity_id — required
  humidity?: string;         // entity_id — optional
  window_sensor?: string;    // entity_id — optional (binary_sensor)
  // Per-room overrides
  outdoor_temperature_override?: string;  // entity_id
  outdoor_humidity_override?: string;     // entity_id
  max_temperature_override?: number;
  max_humidity_override?: number;
  min_humidity_override?: number;
}

/* ── Card configuration ───────────────────────────────────────── */

export interface VentilationCardConfig extends LovelaceCardConfig {
  type: string;
  title?: string;
  weather_entity?: string;           // weather.* entity for forecast
  outdoor_temperature?: string;      // sensor.* entity
  outdoor_humidity?: string;         // sensor.* entity
  goal: VentilationGoal;
  balanced_max_temperature?: number; // only for goal=balanced
  min_humidity?: number;             // global min relative humidity %
  max_humidity?: number;             // global max relative humidity %
  ah_threshold?: number;             // absolute humidity threshold (g/m³), default 2
  rooms: RoomConfig[];
  // Visual options
  show_values?: boolean;             // display numerical sensor values (default: true)
  show_absolute_humidity?: boolean;  // display absolute humidity g/m³ (default: true)
  show_forecast?: boolean;           // display forecast window predictions (default: true)
  show_inline_forecast?: boolean;    // display full forecast expanded inline instead of modal (default: false)
  forecast_hours?: number;           // hours of forecast to display (default: 24)
  show_next_state_change?: boolean;  // show time to next open/closed state change (default: true)
  // Thermal prediction settings
  insulation_factor?: number;        // room thermal insulation coefficient (default: 0.05)
  ventilation_speed?: number;        // air exchange speed when windows open (default: 0.35)
}

/* ── System Diagnostics & Health Issues ───────────────────────── */

export interface HealthIssue {
  type: 'missing_entity' | 'unavailable' | 'invalid_config' | 'forecast_error';
  severity: 'warning' | 'error';
  entityId?: string;
  message: string;
}

/* ── Ventilation logic types ──────────────────────────────────── */

export enum VentilationStatus {
  VENTILATE_NOW = 'ventilate_now',
  DO_NOT_VENTILATE = 'do_not_ventilate',
  CAUTION = 'caution',
  UNKNOWN = 'unknown',
}

export interface SensorReadings {
  temperature: number | null;
  humidity: number | null;
  absoluteHumidity: number | null;
}

export interface NextStateChange {
  targetState: 'open' | 'closed';
  timeRemainingMs: number;
  formattedTime: string; // e.g. "3h" or "45m"
  targetTime: Date;
}

export interface RoomAdvice {
  roomName: string;
  roomIcon: string;
  status: VentilationStatus;
  reason: string;
  indoor: SensorReadings;
  outdoor: SensorReadings;
  hasCustomOutdoor: boolean;
  forecastWindow: ForecastWindow | null;
  predictionSeries: PredictionPoint[];
  windowState: 'open' | 'closed' | null;
  windowCorrect: boolean | null;   // null = no sensor
  nextStateChange?: NextStateChange | null;
}

/* ── Forecast types ───────────────────────────────────────────── */

export interface ForecastEntry {
  datetime: string;
  temperature: number;
  humidity?: number;
}

export interface VentilationWindowRange {
  start: Date;
  end: Date;
  isCurrent: boolean;
  formattedStart: string; // e.g. "Today 22:00"
  formattedEnd: string;   // e.g. "Tomorrow 06:00"
  durationHours: number;
}

export interface ForecastWindow {
  canVentilateNow: boolean;
  ventilateFrom: string | null;   // HH:MM
  ventilateUntil: string | null;  // HH:MM
  timeline: Array<{ hour: number; label: string; canVentilate: boolean }>;
  upcomingWindows: VentilationWindowRange[];
}

export interface PredictionPoint {
  datetime: string;
  date: Date;
  predictedRoomTemp: number;
  outdoorTemp: number;
  canVentilate: boolean;
}

