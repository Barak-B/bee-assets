/**
 * בחירת עמדת טעינה לרכב חשמלי לפי החיבור, הנסועה וזמן החניה.
 */
import { connectionKva, type Connection, type Phases } from "./connection";

export interface Charger {
  kw: number;
  phases: Phases;
  amps: number;
}

export const CHARGERS: readonly Charger[] = [
  { kw: 3.7, phases: 1, amps: 16 },
  { kw: 7.4, phases: 1, amps: 32 },
  { kw: 11, phases: 3, amps: 16 },
  { kw: 22, phases: 3, amps: 32 },
];

export interface EvInput {
  connection: Connection;
  dailyKm: number;
  /** Hours the car is parked and plugged in. */
  hoursAvailable: number;
  /** Vehicle consumption at the socket, kWh per 100 km (charging losses included, as in the site's home sim). */
  kWhPer100km?: number;
  /** Household load expected while charging, kW. */
  houseLoadKw?: number;
}

export interface EvResult {
  dailyKWh: number;
  requiredKw: number;
  availableKw: number;
  recommended: Charger | null;
  /** True when the recommended charger cannot cover the daily need in the time available. */
  shortfall: boolean;
  /** Charger and house load together exceed the connection. */
  loadManagementAdvised: boolean;
}

/** Keep a share of each phase's breaker free for the house. */
const PHASE_MARGIN = 0.8;

export function recommendCharger(input: EvInput): EvResult {
  const { connection, dailyKm, hoursAvailable } = input;
  const per100 = input.kWhPer100km ?? 18;
  const house = input.houseLoadKw ?? 3;
  if (!(dailyKm >= 0)) throw new RangeError("dailyKm must be non-negative");
  if (!(hoursAvailable > 0)) throw new RangeError("hoursAvailable must be positive");

  const dailyKWh = (dailyKm * per100) / 100;
  const requiredKw = dailyKWh / hoursAvailable;
  const kva = connectionKva(connection);
  const availableKw = Math.max(0, kva - house);

  const eligible = CHARGERS.filter(
    (c) =>
      (c.phases === 1 || connection.phases === 3) &&
      c.amps <= connection.amps * PHASE_MARGIN &&
      c.kw <= kva,
  );
  const covering = eligible.find((c) => c.kw >= requiredKw);
  const recommended = covering ?? eligible[eligible.length - 1] ?? null;
  const shortfall = recommended === null || recommended.kw < requiredKw;
  // Charger plus house load exceed the connection: a dynamic load-management unit keeps the main breaker from tripping.
  const loadManagementAdvised = recommended !== null && recommended.kw > availableKw;
  return { dailyKWh, requiredKw, availableKw, recommended, shortfall, loadManagementAdvised };
}
