/**
 * Weather forecast fetching and subscription.
 */

import type { HomeAssistant } from 'custom-card-helpers';
import type { ForecastEntry } from '../types';

/* ── Forecast subscription & fetch ──────────────────────────────── */

/**
 * Parse a raw forecast entry into normalized ForecastEntry format.
 * Supports hourly, daily, twice_daily, native units, and high/low temp structures.
 */
export function parseForecastEntry(item: any): ForecastEntry | null {
  if (!item) return null;
  const datetime = item.datetime ?? item.date ?? item.time;
  if (!datetime) return null;

  const tempVal =
    item.temperature ??
    item.native_temperature ??
    item.temperature_max ??
    item.native_temperature_max ??
    item.high ??
    item.temp ??
    item.templow ??
    item.native_templow ??
    item.low;

  const humVal = item.humidity ?? item.native_humidity ?? item.hum;

  const temp = typeof tempVal === 'number' ? tempVal : parseFloat(String(tempVal ?? 'NaN'));
  const hum = typeof humVal === 'number' ? humVal : parseFloat(String(humVal ?? 'NaN'));

  if (isNaN(temp)) return null;

  return {
    datetime: String(datetime),
    temperature: temp,
    humidity: isNaN(hum) ? undefined : hum,
  };
}

/**
 * Helper to extract and parse forecast items from various WebSocket & service response envelopes.
 */
export function extractForecastItems(data: any, entityId?: string): ForecastEntry[] {
  if (!data) return [];
  let list: any[] = [];
  if (Array.isArray(data)) {
    list = data;
  } else if (Array.isArray(data.forecast)) {
    list = data.forecast;
  } else if (Array.isArray(data.event?.forecast)) {
    list = data.event.forecast;
  } else if (entityId && data.response && data.response[entityId] && Array.isArray(data.response[entityId].forecast)) {
    list = data.response[entityId].forecast;
  } else if (entityId && data[entityId] && Array.isArray(data[entityId].forecast)) {
    list = data[entityId].forecast;
  }

  return list
    .map(parseForecastEntry)
    .filter((entry): entry is ForecastEntry => entry !== null);
}

/**
 * Direct fetch helper attempting WS commands, service calls, and state attributes.
 */
export async function fetchForecastFromHass(
  hass: HomeAssistant,
  entityId: string,
): Promise<ForecastEntry[]> {
  if (!hass || !entityId) return [];

  const types: ('hourly' | 'daily' | 'twice_daily')[] = ['hourly', 'daily', 'twice_daily'];

  // 1. Try callWS weather/get_forecasts
  for (const fType of types) {
    try {
      const res = await hass.callWS<any>({
        type: 'weather/get_forecasts',
        entity_id: entityId,
        forecast_type: fType,
      });
      const parsed = extractForecastItems(res, entityId);
      if (parsed.length > 0) return parsed;
    } catch (e) {
      // ignore
    }
  }

  // 2. Try callWS call_service weather.get_forecasts with return_response
  for (const fType of types) {
    try {
      const res = await hass.callWS<any>({
        type: 'call_service',
        domain: 'weather',
        service: 'get_forecasts',
        target: { entity_id: entityId },
        service_data: { type: fType },
        return_response: true,
      });
      const parsed = extractForecastItems(res, entityId);
      if (parsed.length > 0) return parsed;
    } catch (e) {
      // ignore
    }
  }

  // 3. Fallback to state attributes forecast
  const stateObj = hass.states?.[entityId];
  if (stateObj?.attributes?.forecast) {
    const parsed = extractForecastItems(stateObj.attributes.forecast, entityId);
    if (parsed.length > 0) return parsed;
  }

  return [];
}

/**
 * Subscribe to weather forecast via WebSocket (hourly first, fallback to daily and twice_daily).
 * Triggers an immediate fetch and continuous live updates.
 * Returns an unsubscribe function.
 */
export function subscribeForecast(
  hass: HomeAssistant,
  entityId: string,
  callback: (forecast: ForecastEntry[]) => void,
): Promise<() => void> {
  const processMessage = (msg: any) => {
    const parsed = extractForecastItems(msg, entityId);
    if (parsed.length > 0) {
      callback(parsed);
    }
  };

  // Immediate fetch to avoid delay
  fetchForecastFromHass(hass, entityId)
    .then((fetched) => {
      if (fetched.length > 0) {
        callback(fetched);
      }
    })
    .catch(() => {});

  // Subscribe to live events (hourly -> daily -> twice_daily)
  return hass.connection
    .subscribeMessage<any>(processMessage, {
      type: 'weather/subscribe_forecast',
      entity_id: entityId,
      forecast_type: 'hourly',
    })
    .catch(() => {
      return hass.connection
        .subscribeMessage<any>(processMessage, {
          type: 'weather/subscribe_forecast',
          entity_id: entityId,
          forecast_type: 'daily',
        })
        .catch(() => {
          return hass.connection.subscribeMessage<any>(processMessage, {
            type: 'weather/subscribe_forecast',
            entity_id: entityId,
            forecast_type: 'twice_daily',
          });
        });
    });
}
