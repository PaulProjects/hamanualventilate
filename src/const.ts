declare const __DEV__: boolean | undefined;
export const IS_DEV = typeof __DEV__ !== 'undefined' ? Boolean(__DEV__) : false;

export const CARD_VERSION = '0.1.1';
export const CARD_NAME = IS_DEV ? 'ventilation-card-dev' : 'ventilation-card';
export const CARD_EDITOR_NAME = IS_DEV ? 'ventilation-card-dev-editor' : 'ventilation-card-editor';

export const DEFAULT_TARGET_TEMPERATURE = 21;
export const DEFAULT_MAX_HUMIDITY = 60;
export const DEFAULT_ROOM_ICON = 'mdi:home-thermometer';
export const DEFAULT_HISTORY_HOURS = 24;
export const DEFAULT_FORECAST_HOURS = 24;
// Days of recorder statistics used to learn each room's thermal behaviour
export const LEARN_DAYS = 14;
// Metrics drawn in the room graph: temperature | humidity | absolute_humidity
export const DEFAULT_GRAPH = ['temperature', 'humidity'];
