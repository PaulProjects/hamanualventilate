/**
 * Humidity calculation utilities.
 *
 * Absolute humidity (AH) is the correct metric for ventilation decisions
 * because relative humidity varies with temperature. Comparing AH values
 * tells us whether opening a window will actually move moisture in or out.
 */

/**
 * Calculate absolute humidity in g/m³ from temperature and relative humidity.
 *
 * Uses the Magnus-Tetens approximation for saturation vapor pressure.
 *
 * @param tempC — Temperature in degrees Celsius
 * @param relHumidity — Relative humidity in percent (0-100)
 * @returns Absolute humidity in g/m³
 */
export function calculateAbsoluteHumidity(tempC: number, relHumidity: number): number {
  // Magnus-Tetens coefficients
  const a = 17.67;
  const b = 243.5;

  // Saturation vapor pressure factor
  const satFactor = Math.exp((a * tempC) / (tempC + b));

  // AH = (6.112 × e^(17.67×T/(T+243.5)) × RH × 2.1674) / (273.15 + T)
  const ah = (6.112 * satFactor * relHumidity * 2.1674) / (273.15 + tempC);

  return Math.round(ah * 10) / 10; // Round to 1 decimal
}

/**
 * Calculate dew point temperature in °C.
 *
 * @param tempC — Temperature in degrees Celsius
 * @param relHumidity — Relative humidity in percent (0-100)
 * @returns Dew point in °C
 */
export function calculateDewPoint(tempC: number, relHumidity: number): number {
  const a = 17.67;
  const b = 243.5;

  const alpha = (a * tempC) / (b + tempC) + Math.log(relHumidity / 100);
  const dewPoint = (b * alpha) / (a - alpha);

  return Math.round(dewPoint * 10) / 10;
}
