/**
 * דרישות רישוי לאגירה לפי קיבולת.
 * ספים: יועץ בטיחות מעל 20 kWh, רשות הכבאות מעל 100 kWh, היתר בנייה מעל 600 kWh
 * (מוסכמות האתר מסבב V2; לאמת מול מקור רשמי לפני פרסום). תקן בטיחות סוללות: ת"י 62619.
 * הנחיות מינהל החשמל לאגירה (24.03.2021): מפסק ראשי משולט, מפסק PCS בטווח ראייה עד 3 מ',
 * לחצן חירום משולט, מעבר חופשי של 0.6 מ' לפחות.
 */

export type StorageRequirement =
  | "electrical-design"
  | "battery-standard"
  | "safety-consultant"
  | "fire-authority"
  | "building-permit";

export interface StorageRequirementItem {
  id: StorageRequirement;
  label: string;
}

const ITEMS: Record<StorageRequirement, string> = {
  "electrical-design": "תכנון חשמלי לפי הנחיות מינהל החשמל לאגירה: מפסק ראשי משולט, מפסק PCS בטווח ראייה, לחצן חירום, מעבר חופשי",
  "battery-standard": "סוללות שעומדות בת״י 62619",
  "safety-consultant": "חוות דעת של יועץ בטיחות",
  "fire-authority": "אישור רשות הכבאות וההצלה",
  "building-permit": "היתר בנייה",
};

export const STORAGE_THRESHOLDS_KWH = {
  safetyConsultant: 20,
  fireAuthority: 100,
  buildingPermit: 600,
} as const;

export function storageRequirements(kWh: number): StorageRequirementItem[] {
  if (!(kWh > 0)) throw new RangeError("kWh must be positive");
  const ids: StorageRequirement[] = ["electrical-design", "battery-standard"];
  if (kWh > STORAGE_THRESHOLDS_KWH.safetyConsultant) ids.push("safety-consultant");
  if (kWh > STORAGE_THRESHOLDS_KWH.fireAuthority) ids.push("fire-authority");
  if (kWh > STORAGE_THRESHOLDS_KWH.buildingPermit) ids.push("building-permit");
  return ids.map((id) => ({ id, label: ITEMS[id] }));
}
