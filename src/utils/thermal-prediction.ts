import type { ForecastEntry, PredictionPoint, SensorReadings, VentilationGoal } from '../types';
import { evaluateForecastPoint } from './forecast';
import { calculateAbsoluteHumidity } from './humidity';
import { DEFAULT_AH_THRESHOLD, DEFAULT_BALANCED_MAX_TEMP, DEFAULT_MIN_HUMIDITY, DEFAULT_MAX_HUMIDITY } from '../const';

export interface ThermalPredictionOptions {
  insulationFactor?: number; // k_closed: thermal loss coefficient when windows are closed (default: 0.05)
  ventilationSpeed?: number; // k_open: heat exchange rate when windows are open (default: 0.35)
  maxHours?: number;         // Forecast horizon hours (default: 24)
}

/**
 * Predict room temperature points over time using numerical differential stepping
 * and dynamic window open evaluation at each point.
 */
export function predictRoomTemperatureSeries(
  indoor: SensorReadings,
  forecast: ForecastEntry[],
  goal: VentilationGoal = 'cooling',
  options: ThermalPredictionOptions = {},
  ahThreshold: number = DEFAULT_AH_THRESHOLD,
  balancedMaxTemp: number = DEFAULT_BALANCED_MAX_TEMP,
  minHumidity: number = DEFAULT_MIN_HUMIDITY,
  maxHumidity: number = DEFAULT_MAX_HUMIDITY,
): PredictionPoint[] {
  if (indoor.temperature === null || !forecast || forecast.length === 0) {
    return [];
  }

  const insulationFactor = options.insulationFactor ?? 0.05;
  const ventilationSpeed = options.ventilationSpeed ?? 0.35;
  const maxHours = options.maxHours ?? 24;

  const now = new Date();
  const nowMs = now.getTime();
  const endTime = nowMs + maxHours * 3600 * 1000;

  const validEntries = forecast
    .map((e) => ({
      datetime: e.datetime,
      date: new Date(e.datetime),
      temperature: e.temperature,
      humidity: e.humidity ?? null,
    }))
    .filter((e) => !isNaN(e.date.getTime()) && !isNaN(e.temperature))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  if (validEntries.length === 0) return [];

  // Filter future entries up to maxHours from now (allowing entries starting near now)
  const horizonEntries = validEntries.filter(
    (e) => e.date.getTime() > nowMs - 30 * 60 * 1000 && e.date.getTime() <= endTime + 3600 * 1000,
  );

  if (horizonEntries.length === 0) return [];

  const points: PredictionPoint[] = [];
  let currentTemp = indoor.temperature;
  let currentHum = indoor.humidity;
  let lastTime = nowMs;

  for (let i = 0; i < horizonEntries.length; i++) {
    const entry = horizonEntries[i];
    const entryTime = entry.date.getTime();

    const currentAbsHum =
      currentTemp !== null && currentHum !== null
        ? calculateAbsoluteHumidity(currentTemp, currentHum)
        : null;

    // Evaluate window opening at this timestep based on predicted indoor climate
    const canVentilate = evaluateForecastPoint(
      currentTemp,
      currentHum,
      currentAbsHum,
      entry.temperature,
      entry.humidity,
      goal,
      ahThreshold,
      balancedMaxTemp,
      minHumidity,
      maxHumidity,
    );

    const dtHours = Math.max(0.1, (entryTime - lastTime) / (3600 * 1000));
    const outdoorTemp = entry.temperature;

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

    lastTime = entryTime;

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
