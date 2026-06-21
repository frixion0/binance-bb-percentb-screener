// Bollinger Bands %B calculation utilities.
// Pure functions, no I/O. Shared by server scanning logic.

export const BB_PERIOD = 20;
export const BB_STDDEV = 2;
/** Default %B level a close must cross above to qualify as a crossover signal. */
export const CROSSOVER_TARGET = 0;

export interface BBResult {
  /** %B = (close - lowerBand) / (upperBand - lowerBand) */
  pctB: number;
  upperBand: number;
  middleBand: number;
  lowerBand: number;
}

/**
 * Compute Bollinger Bands and the %B value for `closePrice`.
 * `prices` should contain `period` closing values used for the SMA/stddev.
 * `period` and `stddev` are configurable.
 */
export function calculateBB(
  prices: number[],
  closePrice: number,
  period = BB_PERIOD,
  stddev = BB_STDDEV
): BBResult {
  const n = prices.length;
  if (n === 0) {
    return {
      pctB: 0,
      upperBand: closePrice,
      middleBand: closePrice,
      lowerBand: closePrice,
    };
  }
  const sum = prices.reduce((acc, p) => acc + p, 0);
  const mean = sum / n;
  const variance =
    prices.reduce((acc, p) => acc + (p - mean) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);

  const upperBand = mean + stddev * stdDev;
  const lowerBand = mean - stddev * stdDev;

  const denom = upperBand - lowerBand;
  const pctB =
    denom === 0 ? (closePrice - lowerBand) / 1e-8 : (closePrice - lowerBand) / denom;

  return { pctB, upperBand, middleBand: mean, lowerBand };
}
