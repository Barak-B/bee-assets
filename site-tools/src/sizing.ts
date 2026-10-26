/**
 * גודל מערכת: DC מול AC.
 * מדרגות התעריף, אמת מידה 35כ2 ומונה הייצור נמדדים בהספק ה-AC של הממיר. הספק הפאנלים (DC)
 * יכול להיות גדול יותר לפי ה-Oversize DC שהממיר מתיר, בדרך כלל 150% עד 200% מה-AC.
 * לכן בית עם ממיר של 15 קילוואט יכול לשאת עד 30 קילוואט פאנלים (ברק, 25.10.2026).
 */

/** Small-rooftop tariff tier ceiling, inverter AC kW. */
export const SMALL_ROOFTOP_AC_LIMIT_KW = 15;
/** Highest DC/AC ratio inverters typically allow. Check the datasheet of the chosen inverter. */
export const MAX_DC_AC_RATIO = 2;

export interface PvSize {
  /** Panel power, kWp DC. */
  dcKwp: number;
  /** Inverter rated power, kW AC. */
  acKw: number;
}

export interface SizeCheck {
  ratio: number;
  /** Ratio within what the inverter typically allows. */
  ratioOk: boolean;
  /** Fits the small-rooftop tier (AC up to 15 kW). */
  smallRooftop: boolean;
  /** Largest DC the inverter can carry at the maximum ratio. */
  maxDcKwp: number;
}

export function checkSize({ dcKwp, acKw }: PvSize, maxRatio = MAX_DC_AC_RATIO): SizeCheck {
  if (!(dcKwp > 0) || !(acKw > 0)) throw new RangeError("dcKwp and acKw must be positive");
  const ratio = dcKwp / acKw;
  return {
    ratio,
    ratioOk: ratio <= maxRatio + 1e-9,
    smallRooftop: acKw <= SMALL_ROOFTOP_AC_LIMIT_KW + 1e-9,
    maxDcKwp: acKw * maxRatio,
  };
}

/** Smallest standard inverter for a DC array: no bigger than needed, within the ratio and the 15 kW tier when possible. */
export const STANDARD_INVERTERS_KW: readonly number[] = [3, 4, 5, 6, 8, 10, 12, 15, 17, 20, 25, 30, 33, 40, 50, 60, 100];

export function suggestInverter(dcKwp: number, maxRatio = MAX_DC_AC_RATIO): number | null {
  if (!(dcKwp > 0)) throw new RangeError("dcKwp must be positive");
  return STANDARD_INVERTERS_KW.find((ac) => dcKwp / ac <= maxRatio + 1e-9) ?? null;
}
