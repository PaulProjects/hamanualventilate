/**
 * Forecast parsing and room-specific ventilation time window calculation.
 *
 * Subscribes to HA weather forecast via WebSocket and computes
 * when ventilation windows open/close for a specific room over the next 24 hours.
 */

import type { HomeAssistant } from 'custom-card-helpers';
import type { ForecastEntry, ForecastWindow, VentilationGoal, SensorReadings, VentilationWindowRange } from '../types';
import { calculateAbsoluteHumidity } from './humidity';
import { DEFAULT_AH_THRESHOLD, DEFAULT_BALANCED_MAX_TEMP, DEFAULT_MIN_HUMIDITY, DEFAULT_MAX_HUMIDITY } from '../const';

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

/* ── Room-specific forecast window calculation ─────────────────── */

export function formatWindowDate(d: Date, now: Date): string {
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();

  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow =
    d.getDate() === tomorrow.getDate() &&
    d.getMonth() === tomorrow.getMonth() &&
    d.getFullYear() === tomorrow.getFullYear();

  const hoursStr = `${d.getHours().toString().padStart(2, '0')}:00`;

  if (isToday) {
    return `Today ${hoursStr}`;
  }
  if (isTomorrow) {
    return `Tomorrow ${hoursStr}`;
  }
  const dayName = d.toLocaleDateString(undefined, { weekday: 'short' });
  return `${dayName} ${hoursStr}`;
}


export function buildWindowRange(start: Date, end: Date, isCurrent: boolean, now: Date): VentilationWindowRange {
  const durationMs = end.getTime() - start.getTime();
  const durationHours = Math.max(1, Math.round(durationMs / (3600 * 1000)));

  return {
    start,
    end,
    isCurrent,
    formattedStart: formatWindowDate(start, now),
    formattedEnd: formatWindowDate(end, now),
    durationHours,
  };
}

export function computeForecastWindowFromPrediction(
  series: Array<{ datetime: string; date: Date; predictedRoomTemp: number; outdoorTemp: number; canVentilate: boolean }>,
  limit: number = 3,
): ForecastWindow {
  if (!series || series.length === 0) {
    return {
      canVentilateNow: false,
      ventilateFrom: null,
      ventilateUntil: null,
      timeline: [],
      upcomingWindows: [],
    };
  }

  const now = new Date();
  const timeline: ForecastWindow['timeline'] = [];
  let ventilateFrom: string | null = null;
  let ventilateUntil: string | null = null;
  let foundFirstCanVentilate = false;
  let isCurrentlyVentilating = false;

  const isDaily =
    series.length >= 2 &&
    series[1].date.getTime() - series[0].date.getTime() >= 12 * 3600 * 1000;

  for (let i = 0; i < series.length; i++) {
    const point = series[i];
    const hour = point.date.getHours();
    const label = isDaily
      ? point.date.toLocaleDateString(undefined, { weekday: 'short' })
      : `${hour.toString().padStart(2, '0')}:00`;

    timeline.push({ hour, label, canVentilate: point.canVentilate });

    if (point.canVentilate && !foundFirstCanVentilate) {
      foundFirstCanVentilate = true;
      if (point.date <= now || i === 0) {
        isCurrentlyVentilating = true;
      } else {
        ventilateFrom = label;
      }
    }

    if (!point.canVentilate && foundFirstCanVentilate && ventilateUntil === null) {
      ventilateUntil = label;
    }
  }

  const upcomingWindows: VentilationWindowRange[] = [];
  let currentStart: Date | null = null;
  let currentIsActive = false;

  for (let i = 0; i < series.length; i++) {
    const item = series[i];
    const isLast = i === series.length - 1;

    if (item.canVentilate) {
      if (currentStart === null) {
        currentStart = item.date;
        if (i === 0 || item.date <= now) {
          currentIsActive = true;
        }
      }

      if (isLast) {
        const stepMs = i > 0 ? item.date.getTime() - series[i - 1].date.getTime() : 3600000;
        const end = new Date(item.date.getTime() + Math.max(3600000, stepMs));
        upcomingWindows.push(buildWindowRange(currentStart, end, currentIsActive, now));
      }
    } else {
      if (currentStart !== null) {
        const end = item.date;
        upcomingWindows.push(buildWindowRange(currentStart, end, currentIsActive, now));
        currentStart = null;
        currentIsActive = false;
      }
    }

    if (upcomingWindows.length >= limit) break;
  }

  return {
    canVentilateNow: series[0]?.canVentilate ?? false,
    ventilateFrom: series[0]?.canVentilate ? null : ventilateFrom,
    ventilateUntil,
    timeline,
    upcomingWindows,
  };
}

/**
 * Given weather forecast and a room's indoor readings,
 * compute when ventilation is beneficial for that room over the next 24 hours.
 */
export function computeForecastWindow(
  forecast: ForecastEntry[],
  indoorReadings: SensorReadings,
  goal: VentilationGoal,
  ahThreshold: number = DEFAULT_AH_THRESHOLD,
  balancedMaxTemp: number = DEFAULT_BALANCED_MAX_TEMP,
  minHumidity: number = DEFAULT_MIN_HUMIDITY,
  maxHumidity: number = DEFAULT_MAX_HUMIDITY,
): ForecastWindow {
  if (!forecast || forecast.length === 0 || indoorReadings.temperature === null) {
    return {
      canVentilateNow: false,
      ventilateFrom: null,
      ventilateUntil: null,
      timeline: [],
      upcomingWindows: [],
    };
  }

  const now = new Date();
  const timeline: ForecastWindow['timeline'] = [];
  let ventilateFrom: string | null = null;
  let ventilateUntil: string | null = null;
  let foundFirstCanVentilate = false;
  let isCurrentlyVentilating = false;

  const validEntries = forecast
    .map((e) => ({
      ...e,
      parsedDate: new Date(e.datetime),
    }))
    .filter((e) => !isNaN(e.parsedDate.getTime()) && !isNaN(e.temperature));

  if (validEntries.length === 0) {
    return {
      canVentilateNow: false,
      ventilateFrom: null,
      ventilateUntil: null,
      timeline: [],
      upcomingWindows: [],
    };
  }

  const isDaily =
    validEntries.length >= 2 &&
    validEntries[1].parsedDate.getTime() - validEntries[0].parsedDate.getTime() >= 12 * 3600 * 1000;

  const entries = validEntries.slice(0, 24);

  for (const entry of entries) {
    const entryDate = entry.parsedDate;
    const hour = entryDate.getHours();
    const label = isDaily
      ? entryDate.toLocaleDateString(undefined, { weekday: 'short' })
      : `${hour.toString().padStart(2, '0')}:00`;

    const canVentilate = evaluateForecastPoint(
      indoorReadings.temperature,
      indoorReadings.humidity,
      indoorReadings.absoluteHumidity,
      entry.temperature,
      entry.humidity ?? null,
      goal,
      ahThreshold,
      balancedMaxTemp,
      minHumidity,
      maxHumidity,
    );

    timeline.push({ hour, label, canVentilate });

    if (canVentilate && !foundFirstCanVentilate) {
      foundFirstCanVentilate = true;
      if (entryDate <= now) {
        isCurrentlyVentilating = true;
      } else {
        ventilateFrom = label;
      }
    }

    if (!canVentilate && foundFirstCanVentilate && ventilateUntil === null) {
      ventilateUntil = label;
    }
  }

  const upcomingWindows = computeUpcomingWindows(
    forecast,
    indoorReadings,
    goal,
    ahThreshold,
    balancedMaxTemp,
    minHumidity,
    maxHumidity,
  );

  return {
    canVentilateNow: isCurrentlyVentilating,
    ventilateFrom: isCurrentlyVentilating ? null : ventilateFrom,
    ventilateUntil,
    timeline,
    upcomingWindows,
  };
}

export function computeUpcomingWindows(
  forecast: ForecastEntry[],
  indoorReadings: SensorReadings,
  goal: VentilationGoal,
  ahThreshold: number = DEFAULT_AH_THRESHOLD,
  balancedMaxTemp: number = DEFAULT_BALANCED_MAX_TEMP,
  minHumidity: number = DEFAULT_MIN_HUMIDITY,
  maxHumidity: number = DEFAULT_MAX_HUMIDITY,
  limit: number = 3,
): VentilationWindowRange[] {
  if (!forecast || forecast.length === 0 || indoorReadings.temperature === null) {
    return [];
  }

  const now = new Date();
  const validEntries = forecast
    .map((e) => ({
      ...e,
      parsedDate: new Date(e.datetime),
    }))
    .filter((e) => !isNaN(e.parsedDate.getTime()) && !isNaN(e.temperature))
    .sort((a, b) => a.parsedDate.getTime() - b.parsedDate.getTime());

  if (validEntries.length === 0) return [];

  const evaluated = validEntries.map((entry) => {
    const canVentilate = evaluateForecastPoint(
      indoorReadings.temperature,
      indoorReadings.humidity,
      indoorReadings.absoluteHumidity,
      entry.temperature,
      entry.humidity ?? null,
      goal,
      ahThreshold,
      balancedMaxTemp,
      minHumidity,
      maxHumidity,
    );

    return {
      date: entry.parsedDate,
      canVentilate,
    };
  });

  const windows: VentilationWindowRange[] = [];
  let currentStart: Date | null = null;
  let currentIsActive = false;

  for (let i = 0; i < evaluated.length; i++) {
    const item = evaluated[i];
    const isLast = i === evaluated.length - 1;

    if (item.canVentilate) {
      if (currentStart === null) {
        currentStart = item.date;
        if (i === 0 || item.date <= now) {
          currentIsActive = true;
        }
      }

      if (isLast) {
        const stepMs = i > 0 ? item.date.getTime() - evaluated[i - 1].date.getTime() : 3600000;
        const end = new Date(item.date.getTime() + Math.max(3600000, stepMs));
        windows.push(buildWindowRange(currentStart, end, currentIsActive, now));
      }
    } else {
      if (currentStart !== null) {
        const end = item.date;
        windows.push(buildWindowRange(currentStart, end, currentIsActive, now));
        currentStart = null;
        currentIsActive = false;
      }
    }

    if (windows.length >= limit) break;
  }

  return windows;
}

/* ── Single forecast entry evaluation ───────────────────────────── */

export function evaluateForecastPoint(
  indoorTemp: number | null,
  indoorHum: number | null,
  indoorAbsHum: number | null,
  outdoorTemp: number | null,
  outdoorHum: number | null,
  goal: VentilationGoal,
  ahThreshold: number = DEFAULT_AH_THRESHOLD,
  balancedMaxTemp: number = DEFAULT_BALANCED_MAX_TEMP,
  minHumidity: number = DEFAULT_MIN_HUMIDITY,
  maxHumidity: number = DEFAULT_MAX_HUMIDITY,
): boolean {
  if (indoorTemp === null || outdoorTemp === null) return false;

  const outdoorAbsHum =
    outdoorHum !== null && !isNaN(outdoorHum)
      ? calculateAbsoluteHumidity(outdoorTemp, outdoorHum)
      : null;

  const ahDelta =
    indoorAbsHum !== null && outdoorAbsHum !== null
      ? indoorAbsHum - outdoorAbsHum
      : null;

  switch (goal) {
    case 'cooling':
      return outdoorTemp <= indoorTemp + 0.1;

    case 'warming': {
      if (outdoorTemp >= indoorTemp) return true;
      if (ahDelta !== null && ahDelta > ahThreshold) return true;
      return false;
    }

    case 'humidity': {
      if (ahDelta === null || ahDelta <= 0) return false;
      if (indoorHum !== null) {
        return indoorHum > maxHumidity;
      }
      return ahDelta >= ahThreshold;
    }

    case 'balanced': {
      // Priority 1: Cooling down if indoor exceeds target max
      if (indoorTemp > balancedMaxTemp && outdoorTemp < indoorTemp) {
        return true;
      }
      // Priority 2: Dehumidifying
      if (indoorHum !== null && indoorHum > maxHumidity && ahDelta !== null && ahDelta > 0) {
        return true;
      }
      // Priority 3: Air exchange when outdoor is cooler/equal
      if (outdoorTemp <= indoorTemp + 0.1 && indoorTemp >= 16) {
        return true;
      }
      if (
        (indoorHum === null || indoorHum >= minHumidity) &&
        ahDelta !== null &&
        ahDelta >= ahThreshold
      ) {
        return true;
      }
      return false;
    }

    default:
      return false;
  }
}
