# חיבור מתקן פוטו-וולטאי לרשת חח"י — PV Grid Connection

> Researched 2026-06-15 (cloud session). Confidence tags per `README.md`.
> **Direct relevance:** Barak does ALL commissioning + inspection + handover himself (audit Q2). This is the regulatory backbone of `engineering-agent` commissioning + handover doc generation. Note: Barak holds an engineer license + uses his mother's בודק license (she signs) until his own arrives ~2027.

## Inspection types

`[SECONDARY]` There are two inspection categories for generation-facility connection:
1. **בדיקה לקבלת "היתר סוג" / היתר הפעלה** — inspection for a type/operation permit.
2. **בדיקה לחיבור מסחרי והפעלה** — inspection for commercial connection + operation.
Distinction exists between **חח"י inspectors** and **external (private) inspectors** (בודק חשמל פרטי) — per רשות החשמל guidelines. Barak operates as the external inspector (via his mother's license).
Source: [אתר המעגל — בדיקות מתקן PV](https://iec-hamaagal.co.il/photovoltaic_installation_2), [היתר סוג](https://iec-hamaagal.co.il/examination_type_a_permit)

## What the בודק signs

`[SECONDARY]` A PV inspection form signed by an authorized בודק חשמל confirms the facility was inspected and found **fit for synchronization and connection** to the grid. Connection + synchronization inspection by an authorized בודק is a **prerequisite for operation**. Periodic re-inspection is required for safety per רשות החשמל.
A PV facility must be inspected **before first operation** and **after any fundamental change**, by a licensed בודק within the scope of their license.
Source: [נספח ג' טופס בדיקה PV (gov.il, 2019/2020)](https://www.gov.il/BlobFolder/legalinfo/hanhayapvmitkan2019/he/Files_Minhal_Hashmal_bdika_nixp_g_14012020.pdf)

## Key forms (Hebrew names)

`[SECONDARY]`
- **טופס בקשת שילוב מתקן ייצור פוטו-וולטאי לרשת חברת החשמל** — the grid-integration application form. ([IEC PDF, rev 22-8-22](https://ieccontent.iec.co.il/media/u4ndfafz/טופס-בקשת-שילוב-מתקן-22-8-22.pdf))
- **טופס הגשת מתקן לבדיקה** — facility-submission-for-inspection form. ([אתר המעגל](https://iec-hamaagal.co.il/pdf_bdikot_1))
- **נספח ג' — טופס בדיקה של מיתקן פוטו-וולטאי** — the inspection report form itself. ([gov.il](https://www.gov.il/BlobFolder/legalinfo/hanhayapvmitkan2019/he/Files_Minhal_Hashmal_bdika_nixp_g_14012020.pdf))

## `[OPEN]` — needs primary-doc verification

- Exact step sequence + SLAs (application → meter → inspection → connection) per current 2026 נוהל.
- Low-voltage (מתח נמוך) vs high-voltage (מתח גבוה) process split + the kWp tiers that change requirements (e.g. <15kW vs 15-50kW vs 50kW-630kW vs >630kW מונה-נטו tiers).
- Which form revisions are current in 2026 (the ones found are 2019-2022 dated).
- חברת חשמל הזמנת מונה דו-כיווני process.

## BEE action items

- `[OPEN]` Barak to drop the actual current forms (PDFs) he uses into the vault → I parse them into a checklist for `engineering-agent` handover-doc generation.
- `[OPEN]` Map the inspection form fields → `engineering-agent` so it can pre-fill from the BEE app site record.

## Sources
- [אתר המעגל — בדיקות מתקן PV](https://iec-hamaagal.co.il/photovoltaic_installation_2)
- [IEC — מערכות פוטו-וולטאיות](https://www.iec.co.il/pv/pages/photovoltaicinstallationssmallwindturbines.aspx) (403 to bots; Barak can open in browser)
- [gov.il — הנחיה לבדיקת מתקן PV + נספח ג'](https://www.gov.il/BlobFolder/legalinfo/hanhayapvmitkan2019/he/Files_Minhal_Hashmal_bdika_nixp_g_14012020.pdf)
- [SEEEI — בדיקת מתקן PV מתח נמוך (מאמר מהנדס בודק)](https://www.seeei.org.il/prdFiles/3836_405896_desc3.pdf)
