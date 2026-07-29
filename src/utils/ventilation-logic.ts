/**
 * Core ventilation recommendation engine.
 *
 * Determines for each room whether to ventilate based on the configured goal,
 * indoor/outdoor conditions, and optional per-room overrides.
 */

import type { VentilationGoal, SensorReadings, VentilationStatus, RoomAdvice, RoomConfig, ForecastEntry, NextStateChange, ForecastWindow } from '../types';
import { VentilationStatus as VS } from '../types';
import { calculateAbsoluteHumidity } from './humidity';
import { DEFAULT_AH_THRESHOLD, DEFAULT_BALANCED_MAX_TEMP, DEFAULT_MIN_HUMIDITY, DEFAULT_MAX_HUMIDITY, DEFAULT_ROOM_ICON } from '../const';
import { localize } from '../localize/localize';
import type { HomeAssistant } from 'custom-card-helpers';
import { computeForecastWindow } from './forecast';

/* ── Helpers ────────────────────────────────────────────────────── */

export function computeNextStateChange(
  status: VentilationStatus,
  forecastWindow: ForecastWindow | null,
): NextStateChange | null {
  if (!forecastWindow || status === VS.UNKNOWN) return null;

  const now = new Date();
  const windows = forecastWindow.upcomingWindows || [];

  if (status === VS.VENTILATE_NOW) {
    const activeWin = windows.find((w) => w.isCurrent) || windows[0];
    if (!activeWin) return null;

    const targetTime = activeWin.end;
    const diffMs = targetTime.getTime() - now.getTime();
    if (diffMs <= 0) return null;

    let formattedTime = '';
    if (diffMs >= 3600 * 1000) {
      formattedTime = `${Math.round(diffMs / (3600 * 1000))}h`;
    } else {
      formattedTime = `${Math.max(1, Math.round(diffMs / (60 * 1000)))}m`;
    }

    return {
      targetState: 'closed',
      timeRemainingMs: diffMs,
      formattedTime,
      targetTime,
    };
  } else if (status === VS.DO_NOT_VENTILATE || status === VS.CAUTION) {
    const nextWin = windows.find((w) => w.start > now) || windows.find((w) => !w.isCurrent);
    if (!nextWin) return null;

    const targetTime = nextWin.start;
    const diffMs = targetTime.getTime() - now.getTime();
    if (diffMs <= 0) return null;

    let formattedTime = '';
    if (diffMs >= 3600 * 1000) {
      formattedTime = `${Math.round(diffMs / (3600 * 1000))}h`;
    } else {
      formattedTime = `${Math.max(1, Math.round(diffMs / (60 * 1000)))}m`;
    }

    return {
      targetState: 'open',
      timeRemainingMs: diffMs,
      formattedTime,
      targetTime,
    };
  }

  return null;
}

export function readSensor(hass: HomeAssistant, entityId: string | undefined): number | null {
  if (!entityId) return null;
  const stateObj = hass.states[entityId];
  if (!stateObj || stateObj.state === 'unavailable' || stateObj.state === 'unknown') return null;
  const val = parseFloat(stateObj.state);
  return isNaN(val) ? null : val;
}

export function readBinarySensor(hass: HomeAssistant, entityId: string | undefined): 'open' | 'closed' | null {
  if (!entityId) return null;
  const stateObj = hass.states[entityId];
  if (!stateObj || stateObj.state === 'unavailable' || stateObj.state === 'unknown') return null;

  // Support both binary_sensor (on/off) and contact sensors (open/closed)
  const state = stateObj.state.toLowerCase();
  if (state === 'on' || state === 'open') return 'open';
  if (state === 'off' || state === 'closed') return 'closed';
  return null;
}

export function getSensorReadings(
  hass: HomeAssistant,
  tempEntity: string | undefined,
  humEntity: string | undefined,
  fallbackWeatherEntity?: string,
): SensorReadings {
  let temperature = readSensor(hass, tempEntity);
  let humidity = readSensor(hass, humEntity);

  if (temperature === null && fallbackWeatherEntity) {
    const weatherState = hass.states[fallbackWeatherEntity];
    if (weatherState?.attributes?.temperature != null) {
      const val = parseFloat(weatherState.attributes.temperature);
      if (!isNaN(val)) temperature = val;
    }
  }

  if (humidity === null && fallbackWeatherEntity) {
    const weatherState = hass.states[fallbackWeatherEntity];
    if (weatherState?.attributes?.humidity != null) {
      const val = parseFloat(weatherState.attributes.humidity);
      if (!isNaN(val)) humidity = val;
    }
  }

  const absoluteHumidity =
    temperature !== null && humidity !== null ? calculateAbsoluteHumidity(temperature, humidity) : null;

  return { temperature, humidity, absoluteHumidity };
}

/* ── Main recommendation logic ──────────────────────────────────── */

export function getVentilationAdvice(
  hass: HomeAssistant,
  room: RoomConfig,
  globalOutdoorTemp: string | undefined,
  globalOutdoorHum: string | undefined,
  goal: VentilationGoal,
  ahThreshold: number = DEFAULT_AH_THRESHOLD,
  balancedMaxTemp: number = DEFAULT_BALANCED_MAX_TEMP,
  globalMinHumidity?: number,
  globalMaxHumidity?: number,
  forecastEntries: ForecastEntry[] = [],
  weatherEntity?: string,
): RoomAdvice {
  // Indoor readings
  const indoor = getSensorReadings(hass, room.temperature, room.humidity);

  // Outdoor readings — per-room override > global sensor > weather entity fallback
  const outdoorTempEntity = room.outdoor_temperature_override || globalOutdoorTemp;
  const outdoorHumEntity = room.outdoor_humidity_override || globalOutdoorHum;
  const outdoor = getSensorReadings(hass, outdoorTempEntity, outdoorHumEntity, weatherEntity);
  const hasCustomOutdoor = !!(room.outdoor_temperature_override || room.outdoor_humidity_override);

  // Window sensor
  const windowState = readBinarySensor(hass, room.window_sensor);

  // Effective thresholds (room overrides > global card config)
  const effectiveMaxTemp = room.max_temperature_override ?? balancedMaxTemp;
  const effectiveMinHumidity = room.min_humidity_override ?? globalMinHumidity ?? DEFAULT_MIN_HUMIDITY;
  const effectiveMaxHumidity = room.max_humidity_override ?? globalMaxHumidity ?? DEFAULT_MAX_HUMIDITY;

  // Calculate recommendation
  let status: VentilationStatus = VS.UNKNOWN;
  let reason = localize('reason.no_data');

  if (indoor.temperature === null) {
    status = VS.UNKNOWN;
    reason = localize('reason.no_data');
  } else {
    switch (goal) {
      case 'cooling':
        ({ status, reason } = evaluateCooling(indoor, outdoor, effectiveMaxTemp));
        break;
      case 'warming':
        ({ status, reason } = evaluateWarming(indoor, outdoor, ahThreshold, effectiveMaxHumidity));
        break;
      case 'humidity':
        ({ status, reason } = evaluateHumidity(
          indoor,
          outdoor,
          ahThreshold,
          effectiveMinHumidity,
          effectiveMaxHumidity,
        ));
        break;
      case 'balanced':
        ({ status, reason } = evaluateBalanced(
          indoor,
          outdoor,
          effectiveMaxTemp,
          ahThreshold,
          effectiveMinHumidity,
          effectiveMaxHumidity,
        ));
        break;
    }
  }

  // Room-specific forecast window
  const forecastWindow = forecastEntries.length > 0
    ? computeForecastWindow(
        forecastEntries,
        indoor,
        goal,
        ahThreshold,
        effectiveMaxTemp,
        effectiveMinHumidity,
        effectiveMaxHumidity,
      )
    : null;

  // Window correctness evaluation
  let windowCorrect: boolean | null = null;
  if (windowState !== null && status !== VS.UNKNOWN) {
    if (status === VS.VENTILATE_NOW) {
      windowCorrect = windowState === 'open';
    } else if (status === VS.DO_NOT_VENTILATE) {
      windowCorrect = windowState === 'closed';
    } else {
      windowCorrect = null; // Caution — either is acceptable
    }
  }

  let resolvedRoomName = room.name?.trim();
  if (!resolvedRoomName) {
    const st = room.temperature ? hass?.states?.[room.temperature] : undefined;
    if (st?.attributes?.friendly_name) {
      resolvedRoomName = String(st.attributes.friendly_name)
        .replace(/\s+(temperature|temp|sensor)$/i, '')
        .trim();
    }
  }
  if (!resolvedRoomName) {
    resolvedRoomName = 'Room';
  }

  const nextStateChange = computeNextStateChange(status, forecastWindow);

  return {
    roomName: resolvedRoomName,
    roomIcon: room.icon || DEFAULT_ROOM_ICON,
    status,
    reason,
    indoor,
    outdoor,
    hasCustomOutdoor,
    forecastWindow,
    windowState,
    windowCorrect,
    nextStateChange,
  };
}

/* ── Per-goal evaluation ────────────────────────────────────────── */

function evaluateCooling(
  indoor: SensorReadings,
  outdoor: SensorReadings,
  maxTemp: number,
): { status: VentilationStatus; reason: string } {
  if (indoor.temperature === null || outdoor.temperature === null) {
    return { status: VS.UNKNOWN, reason: localize('reason.no_data') };
  }

  const delta = Math.round((indoor.temperature - outdoor.temperature) * 10) / 10;

  if (outdoor.temperature >= indoor.temperature) {
    return {
      status: VS.DO_NOT_VENTILATE,
      reason: localize('reason.cooling_no', { outdoor_temp: outdoor.temperature.toFixed(1) }),
    };
  }

  // Outdoor is cooler
  if (indoor.temperature > maxTemp) {
    return {
      status: VS.VENTILATE_NOW,
      reason: localize('reason.temp_max_exceeded', {
        indoor_temp: indoor.temperature.toFixed(1),
        max_temp: maxTemp.toFixed(1),
        delta: Math.abs(delta).toFixed(1),
      }),
    };
  } else if (delta > 1.5) {
    return {
      status: VS.VENTILATE_NOW,
      reason: localize('reason.cooling_ok', { delta: Math.abs(delta).toFixed(1) }),
    };
  } else {
    return {
      status: VS.CAUTION,
      reason: localize('reason.cooling_ok', { delta: Math.abs(delta).toFixed(1) }),
    };
  }
}

function evaluateWarming(
  indoor: SensorReadings,
  outdoor: SensorReadings,
  ahThreshold: number,
  maxHumidity: number,
): { status: VentilationStatus; reason: string } {
  if (indoor.temperature === null || outdoor.temperature === null) {
    return { status: VS.UNKNOWN, reason: localize('reason.no_data') };
  }

  const ahDelta =
    indoor.absoluteHumidity !== null && outdoor.absoluteHumidity !== null
      ? indoor.absoluteHumidity - outdoor.absoluteHumidity
      : null;

  if (outdoor.temperature >= indoor.temperature) {
    if (ahDelta !== null && ahDelta > ahThreshold) {
      return { status: VS.VENTILATE_NOW, reason: localize('reason.warming_ok') };
    }
    return {
      status: VS.VENTILATE_NOW,
      reason: localize('reason.cooling_no', { outdoor_temp: outdoor.temperature.toFixed(1) }),
    };
  } else {
    // Outdoor is colder
    if (indoor.humidity !== null && indoor.humidity > maxHumidity && ahDelta !== null && ahDelta > 0) {
      return {
        status: VS.CAUTION,
        reason: localize('reason.warming_humidity_caution', {
          indoor_rh: indoor.humidity.toFixed(0),
          max_rh: maxHumidity.toFixed(0),
        }),
      };
    }
    if (ahDelta !== null && ahDelta > ahThreshold) {
      return {
        status: VS.CAUTION,
        reason: localize('reason.humidity_ok', { delta: ahDelta.toFixed(1) }),
      };
    }
    return { status: VS.DO_NOT_VENTILATE, reason: localize('reason.warming_no') };
  }
}

function evaluateHumidity(
  indoor: SensorReadings,
  outdoor: SensorReadings,
  ahThreshold: number,
  minHumidity: number,
  maxHumidity: number,
): { status: VentilationStatus; reason: string } {
  if (indoor.absoluteHumidity === null || outdoor.absoluteHumidity === null) {
    return { status: VS.UNKNOWN, reason: localize('reason.no_data') };
  }

  const ahDelta = Math.round((indoor.absoluteHumidity - outdoor.absoluteHumidity) * 10) / 10;

  if (ahDelta <= 0) {
    return { status: VS.DO_NOT_VENTILATE, reason: localize('reason.humidity_no') };
  }

  // Outdoor air is drier (ahDelta > 0)
  if (indoor.humidity !== null) {
    if (indoor.humidity > maxHumidity) {
      return {
        status: VS.VENTILATE_NOW,
        reason: localize('reason.humidity_max_exceeded', {
          indoor_rh: indoor.humidity.toFixed(0),
          max_rh: maxHumidity.toFixed(0),
          delta: ahDelta.toFixed(1),
        }),
      };
    }

    if (indoor.humidity < minHumidity) {
      return {
        status: VS.DO_NOT_VENTILATE,
        reason: localize('reason.humidity_min_reached', {
          indoor_rh: indoor.humidity.toFixed(0),
          min_rh: minHumidity.toFixed(0),
        }),
      };
    }

    return {
      status: VS.DO_NOT_VENTILATE,
      reason: localize('reason.humidity_within_range', {
        indoor_rh: indoor.humidity.toFixed(0),
        max_rh: maxHumidity.toFixed(0),
      }),
    };
  }

  if (ahDelta >= ahThreshold) {
    return {
      status: VS.VENTILATE_NOW,
      reason: localize('reason.humidity_ok', { delta: ahDelta.toFixed(1) }),
    };
  } else {
    return {
      status: VS.CAUTION,
      reason: localize('reason.humidity_ok', { delta: ahDelta.toFixed(1) }),
    };
  }
}

function evaluateBalanced(
  indoor: SensorReadings,
  outdoor: SensorReadings,
  maxTemp: number,
  ahThreshold: number,
  minHumidity: number,
  maxHumidity: number,
): { status: VentilationStatus; reason: string } {
  if (indoor.temperature === null || outdoor.temperature === null) {
    return { status: VS.UNKNOWN, reason: localize('reason.no_data') };
  }

  const ahDelta =
    indoor.absoluteHumidity !== null && outdoor.absoluteHumidity !== null
      ? Math.round((indoor.absoluteHumidity - outdoor.absoluteHumidity) * 10) / 10
      : null;

  // Priority 1: Temperature exceeds max limit -> Cool down if outdoor is cooler
  if (indoor.temperature > maxTemp && outdoor.temperature < indoor.temperature) {
    const delta = Math.round((indoor.temperature - outdoor.temperature) * 10) / 10;
    return {
      status: VS.VENTILATE_NOW,
      reason: localize('reason.temp_max_exceeded', {
        indoor_temp: indoor.temperature.toFixed(1),
        max_temp: maxTemp.toFixed(1),
        delta: delta.toFixed(1),
      }),
    };
  }

  // Priority 2: Humidity regulation (above max humidity or drier outside)
  if (indoor.humidity !== null && indoor.humidity > maxHumidity && ahDelta !== null && ahDelta > 0) {
    return {
      status: VS.VENTILATE_NOW,
      reason: localize('reason.humidity_max_exceeded', {
        indoor_rh: indoor.humidity.toFixed(0),
        max_rh: maxHumidity.toFixed(0),
        delta: ahDelta.toFixed(1),
      }),
    };
  }

  if (
    (indoor.humidity === null || indoor.humidity >= minHumidity) &&
    ahDelta !== null &&
    ahDelta >= ahThreshold
  ) {
    return { status: VS.VENTILATE_NOW, reason: localize('reason.balanced_humid') };
  }

  // Priority 3: Cooler outside but below max temp -> Caution
  if (outdoor.temperature < indoor.temperature - 1.5 && indoor.temperature > maxTemp - 2) {
    const delta = Math.round((indoor.temperature - outdoor.temperature) * 10) / 10;
    return {
      status: VS.CAUTION,
      reason: localize('reason.balanced_cool', { delta: delta.toFixed(1) }),
    };
  }

  // Priority 4: Warmer outside when indoor is cold
  if (outdoor.temperature > indoor.temperature && indoor.temperature < maxTemp) {
    return {
      status: VS.VENTILATE_NOW,
      reason: localize('reason.cooling_no', { outdoor_temp: outdoor.temperature.toFixed(1) }),
    };
  }

  return { status: VS.DO_NOT_VENTILATE, reason: localize('reason.balanced_no') };
}
