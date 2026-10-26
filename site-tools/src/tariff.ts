/**
 * "שעון 2026": כמה עולה לחכות עם מערכת סולארית ביתית לשנת 2027.
 *
 * כל הערכים כאן הם נתונים, לא קוד, ולכל אחד יש מקור ומצב. האתר חייב להציג את המצב
 * (בתוקף / טיוטה) ליד כל מספר, ולהציג את התוצאה כ"הדמיה".
 */

export type TariffStatus = "in-force" | "draft";

export interface TariffSource {
  title: string;
  url: string;
  date: string;
}

export interface TariffTrack {
  id: string;
  label: string;
  /** NIS per kWh, before any urban premium. */
  rate: number;
  /** NIS per kWh added in qualifying cities; 0 when abolished. */
  urbanPremium: number;
  years: number;
  status: TariffStatus;
  conditions: string;
  sources: TariffSource[];
}

const GLOBES_EN: TariffSource = {
  title: "Globes: Rooftop solar panel electricity rates to fall sharply",
  url: "https://en.globes.co.il/en/article-rooftop-solar-panel-electricity-rates-to-fall-sharply-1001560248",
  date: "2026-10-20",
};
const GLOBES_HE: TariffSource = {
  title: "גלובס: רשות החשמל הכריעה: התשלום על חשמל מגגות סולאריים יפחת דרמטית",
  url: "https://www.globes.co.il/news/article.aspx?did=1001560082",
  date: "2026-10-19",
};

/** Small rooftops (inverter up to 15 kW AC; panels may go to 30 kWp DC). Checked 25.10.2026; the 2027 track is a draft open for comments until 10.11.2026. */
export const ROOFTOP_TRACKS: { current: TariffTrack; draft2027: TariffTrack } = {
  current: {
    id: "2026",
    label: "בקשת חיבור עד 31.12.2026",
    rate: 0.48,
    urbanPremium: 0.06,
    years: 25,
    status: "in-force",
    conditions: "בקשת החיבור מוגשת עד סוף 2026 והמערכת מותקנת תוך שנה",
    sources: [GLOBES_EN, GLOBES_HE],
  },
  draft2027: {
    id: "2027",
    label: "בקשת חיבור ב-2027 (טיוטה)",
    rate: round(0.48 * 0.95, 4),
    urbanPremium: 0,
    years: 20,
    status: "draft",
    conditions:
      "טיוטת החלטה: הפחתה של 5% בשנה ב-2027–2030, התעריף מובטח עד 2047 בלבד, תוספת עירונית צפויה להתבטל. לא כולל את רכיב שער החליפין",
    sources: [GLOBES_EN, GLOBES_HE],
  },
};

export interface RevenueInput {
  /** Panel power, kWp DC. The tariff tier is set by the inverter's AC power (see sizing.ts). */
  kWp: number;
  /** Annual specific yield, kWh per kWp (PVGIS; e.g. Tel Aviv about 1,718 at 30° south). */
  specificYield: number;
  urban?: boolean;
  /** Annual module degradation, as a fraction. */
  degradation?: number;
  /**
   * Share of annual DC yield lost to inverter clipping at high DC/AC ratios. The site's hourly
   * engine computes it from the hourly profile; this module takes it as an input (default 0).
   */
  clippingLoss?: number;
}

/** Total guaranteed-tariff income over the track's term, NIS, nominal. */
export function trackRevenue(track: TariffTrack, input: RevenueInput): number {
  const { kWp, specificYield } = input;
  if (!(kWp > 0) || !(specificYield > 0)) throw new RangeError("kWp and specificYield must be positive");
  const deg = input.degradation ?? 0.004;
  const clip = input.clippingLoss ?? 0;
  if (!(clip >= 0 && clip < 1)) throw new RangeError("clippingLoss must be in [0, 1)");
  const rate = track.rate + (input.urban ? track.urbanPremium : 0);
  const firstYear = kWp * specificYield * (1 - clip);
  let total = 0;
  for (let y = 0; y < track.years; y++) total += firstYear * (1 - deg) ** y * rate;
  return total;
}

export interface WaitCost {
  revenue2026: number;
  revenue2027: number;
  /** How much less a 2027 application earns over its term. */
  costOfWaiting: number;
  firstYearKWh: number;
}

export function costOfWaiting(input: RevenueInput): WaitCost {
  const revenue2026 = trackRevenue(ROOFTOP_TRACKS.current, input);
  const revenue2027 = trackRevenue(ROOFTOP_TRACKS.draft2027, input);
  return {
    revenue2026,
    revenue2027,
    costOfWaiting: revenue2026 - revenue2027,
    firstYearKWh: input.kWp * input.specificYield * (1 - (input.clippingLoss ?? 0)),
  };
}

function round(x: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}
