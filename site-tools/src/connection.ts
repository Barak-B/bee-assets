/**
 * גודל חיבור וחיבור מתקן PV.
 * כללים: אמת מידה 35כ2 (הספק המתקן עד 0.9 מגודל החיבור), 35כ3(י) (מונה ייצור מעל 15 kW),
 * 35כ2(ט)(3) (מגבלת הזרמה מעל 100 kW), הנחיית חח"י (מדידה ישירה עד 3×100A, מעל — משני זרם).
 * מקור: docs/plan/research/02-regulation-tariffs.md, רמת אימות [משרד].
 */

export type Phases = 1 | 3;

export interface Connection {
  phases: Phases;
  amps: number;
}

const V_PHASE = 230;
const V_LINE = 400;

/** Connection rating in kVA. */
export function connectionKva({ phases, amps }: Connection): number {
  if (!(amps > 0)) throw new RangeError("amps must be positive");
  return phases === 1 ? (V_PHASE * amps) / 1000 : (Math.sqrt(3) * V_LINE * amps) / 1000;
}

/** Largest PV system the connection allows without an upgrade, inverter kW AC (panels may be larger, see sizing.ts). */
export function maxPvKw(conn: Connection): number {
  return 0.9 * connectionKva(conn);
}

/** Standard IEC low-voltage connection sizes, smallest first. */
export const STANDARD_CONNECTIONS: readonly Connection[] = [
  { phases: 1, amps: 25 },
  { phases: 1, amps: 40 },
  { phases: 3, amps: 25 },
  { phases: 3, amps: 40 },
  { phases: 3, amps: 63 },
  { phases: 3, amps: 80 },
  { phases: 3, amps: 100 },
  { phases: 3, amps: 125 },
  { phases: 3, amps: 160 },
  { phases: 3, amps: 200 },
  { phases: 3, amps: 250 },
  { phases: 3, amps: 400 },
  { phases: 3, amps: 630 },
];

export interface PvConnectionCheck {
  kva: number;
  maxPvKw: number;
  fits: boolean;
  /** Smallest standard connection that fits the requested PV, when the current one does not. */
  upgradeTo: Connection | null;
  productionMeterRequired: boolean;
  exportLimitApplies: boolean;
  metering: "direct" | "ct";
}

/** `pvKw` is the inverter's AC power: 35כ2 and the 15 kW production-meter rule both count AC. */
export function checkPvConnection(conn: Connection, pvKw: number): PvConnectionCheck {
  if (!(pvKw > 0)) throw new RangeError("pvKw must be positive");
  const kva = connectionKva(conn);
  const max = 0.9 * kva;
  const fits = pvKw <= max + 1e-9;
  const upgradeTo = fits ? null : STANDARD_CONNECTIONS.find((c) => maxPvKw(c) >= pvKw) ?? null;
  return {
    kva,
    maxPvKw: max,
    fits,
    upgradeTo,
    productionMeterRequired: pvKw > 15,
    exportLimitApplies: pvKw > 100,
    metering: conn.amps <= 100 ? "direct" : "ct",
  };
}
