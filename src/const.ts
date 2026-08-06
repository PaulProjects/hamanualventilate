declare const __DEV__: boolean | undefined;
export const IS_DEV = typeof __DEV__ !== 'undefined' ? Boolean(__DEV__) : false;

export const CARD_VERSION = '1.1.0';
export const CARD_NAME = IS_DEV ? 'ventilation-card-dev' : 'ventilation-card';
export const CARD_EDITOR_NAME = IS_DEV ? 'ventilation-card-dev-editor' : 'ventilation-card-editor';

// Default absolute humidity threshold in g/m³
// Ventilation is recommended when indoor AH exceeds outdoor AH by this amount
export const DEFAULT_AH_THRESHOLD = 2;

// Default humidity limits (relative humidity %)
export const DEFAULT_MIN_HUMIDITY = 40;
export const DEFAULT_MAX_HUMIDITY = 60;

// Default mode temperature thresholds
export const DEFAULT_COOLING_MIN_TEMP = 18;
export const DEFAULT_WARMING_MAX_TEMP = 24;
export const DEFAULT_BALANCED_MAX_TEMP = 24;

// Default room icon
export const DEFAULT_ROOM_ICON = 'mdi:home-thermometer';

// Default graph history and prediction ranges
export const DEFAULT_SHOW_HISTORY = false;
export const DEFAULT_SHOW_HUMIDITY_SLOTS = false;
export const DEFAULT_HISTORY_HOURS = 24;
export const DEFAULT_FORECAST_HOURS = 24;


