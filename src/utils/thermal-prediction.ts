/**
 * Thermal Prediction Engine for Room Temperature.
 *
 * Predicts indoor room temperature trends over the forecast window based on:
 * - Current indoor temperature
 * - Outdoor temperature forecast
 * - Window open/close ventilation recommendations
 * - Building thermal insulation and air exchange dynamics
 */

import type { ForecastEntry, ForecastWindow, PredictionPoint } from '../types';

export interface ThermalPredictionOptions {
  insulationFactor?: number; // k_closed: thermal loss coefficient when windows are closed (default: 0.05)
  ventilationSpeed?: number; // k_open: heat exchange rate when windows are open (default: 0.35)
  maxHours?: number;         // Forecast horizon hours (default: 24)
}

/**
 * Predict room temperature points over time using numerical differential stepping.
 */
export function predictRoomTemperatureSeries(
  initialRoomTemp: number | null,
  forecast: ForecastEntry[],
  forecastWindow: ForecastWindow | null,
  options: ThermalPredictionOptions = {},
): PredictionPoint[] {
  if (initialRoomTemp === null || !forecast || forecast.length === 0) {
    return [];
  }

  const insulationFactor = options.insulationFactor ?? 0.05;
  const ventilationSpeed = options.ventilationSpeed ?? 0.35;
  const maxHours = options.maxHours ?? 24;

  const validEntries = forecast
    .map((e) => ({
      datetime: e.datetime,
      date: new Date(e.datetime),
      temperature: e.temperature,
    }))
    .filter((e) => !isNaN(e.date.getTime()) && !isNaN(e.temperature))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  if (validEntries.length === 0) return [];

  // Limit to maxHours
  const startTime = validEntries[0].date.getTime();
  const endTime = startTime + maxHours * 3600 * 1000;
  const horizonEntries = validEntries.filter((e) => e.date.getTime() <= endTime + 3600 * 1000);

  // Map timeline canVentilate status by hour
  const timelineMap = new Map<number, boolean>();
  if (forecastWindow?.timeline) {
    for (const t of forecastWindow.timeline) {
      timelineMap.set(t.hour, t.canVentilate);
    }
  }

  // Helper to check if window is open/ventilating at a given timestamp
  const isVentilatingAt = (date: Date): boolean => {
    if (forecastWindow?.upcomingWindows && forecastWindow.upcomingWindows.length > 0) {
      return forecastWindow.upcomingWindows.some(
        (win) => date >= win.start && date <= win.end,
      );
    }
    const hr = date.getHours();
    return timelineMap.get(hr) ?? false;
  };

  const points: PredictionPoint[] = [];
  let currentTemp = initialRoomTemp;

  for (let i = 0; i < horizonEntries.length; i++) {
    const entry = horizonEntries[i];
    const prevEntry = i > 0 ? horizonEntries[i - 1] : null;

    if (prevEntry) {
      const dtHours = Math.max(0.1, (entry.date.getTime() - prevEntry.date.getTime()) / (3600 * 1000));
      const outdoorTemp = entry.temperature;
      const canVentilate = isVentilatingAt(entry.date);

      // Numerical sub-stepping (15 min steps) for accuracy
      const subSteps = Math.ceil(dtHours * 4);
      const stepDt = dtHours / subSteps;

      for (let s = 0; s < subSteps; s++) {
        const delta = currentTemp - outdoorTemp;
        let rate = 0;

        if (canVentilate) {
          // Window open: fast cooling when outdoor is cooler, slower warming when hotter outside
          if (outdoorTemp < currentTemp) {
            rate = ventilationSpeed; // rapid cooling
          } else {
            rate = ventilationSpeed * 0.4; // slower warming
          }
        } else {
          // Window closed: passive thermal conduction through walls/insulation
          if (outdoorTemp < currentTemp) {
            rate = insulationFactor;
          } else {
            rate = insulationFactor * 0.6; // insulation dampens solar/outdoor heat rise
          }
        }

        currentTemp -= rate * delta * stepDt;
      }
    }

    const canVentilate = isVentilatingAt(entry.date);
    points.push({
      datetime: entry.datetime,
      date: entry.date,
      predictedRoomTemp: Math.round(currentTemp * 10) / 10,
      outdoorTemp: entry.temperature,
      canVentilate,
    });
  }

  return points;
}
