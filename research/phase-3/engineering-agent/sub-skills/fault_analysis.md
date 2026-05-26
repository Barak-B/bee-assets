# sub-skill: fault_analysis

**Parent:** engineering-agent
**Purpose:** Diagnose a site fault from monitoring data + alert context. Rank causes, propose actions, list parts. Writes diagnosis back to BEE alert (Q78).

## Inputs

```json
{
  "alert_id": "alert_xyz",
  "site_id": "kfar-yuval",
  "alert_type": "low-production" | "inverter-fault" | "comm-loss" | "string-imbalance",
  "alert_message": "String 2 current 40% below String 1",
  "solaredge_data": {
    "last_7d_production": [...],
    "per_string_current": {...},
    "inverter_status_codes": [...],
    "expected_production_kwh": 280
  },
  "site_equipment": "<from bee.getSite>",
  "weather_last_7d": "<from alfred-weather>"
}
```

## Algorithm (diagnostic decision tree)

```
1. Rule out environmental first (cheapest):
   - Weather: was it cloudy? (check alfred-weather) → not a fault
   - Soiling: gradual decline + no rain recently → cleaning needed
   - Shading: time-of-day pattern (morning/evening dip) → new obstruction?

2. Electrical patterns:
   - One string low, others normal → string-level fault:
       • blown string fuse
       • disconnected MC4 connector
       • damaged module in string
       • optimizer failure (SolarEdge)
   - All strings low → system-level:
       • inverter derating (overtemp?)
       • grid voltage issue
       • inverter fault code
   - Zero production → 
       • comm loss (data only, system may be fine)
       • inverter tripped (check fault code)
       • AC breaker tripped
       • grid outage

3. Cross-reference inverter status codes:
   - Map SolarEdge/Sungrow/SMA error codes → known causes
   - (maintain a code→cause lookup table per brand)

4. Check warranty status (from KG :Equipment):
   - If component under warranty → claim, don't buy

5. Estimate urgency:
   - Total outage on tier_1 customer → critical (SLA)
   - Single string 40% → high (revenue loss but operational)
   - Comm loss only → low (data, not production)
```

## Output

```json
{
  "alert_id": "alert_xyz",
  "probable_causes": [
    {"cause": "Blown string fuse (String 2)", "confidence": 0.55,
     "evidence": "Single string zero current, others normal, no weather correlation"},
    {"cause": "Disconnected MC4 connector", "confidence": 0.30,
     "evidence": "Same pattern, common after thermal cycling"},
    {"cause": "Damaged module in string 2", "confidence": 0.15,
     "evidence": "Less likely — would show partial not zero"}
  ],
  "recommended_actions": [
    "Dispatch tech to check String 2 DC isolator + fuse holder",
    "Bring spare gPV 20A fuses + MC4 crimp kit",
    "If fuse OK, megger-test string for module fault"
  ],
  "parts_needed": [
    {"part": "gPV fuse 20A", "qty": 2, "in_stock": true},
    {"part": "MC4 connector pair", "qty": 4, "in_stock": true}
  ],
  "urgency": "high",
  "estimated_repair_hours": 1.5,
  "warranty_relevant": false,
  "recommended_tech": "ניר (closest + electrical-install skill)",
  "writes_to_bee": "bee.diagnoseAlert(alert_id, ...)",
  "notes_he": "סביר fuse שרוף ב-String 2. לשלוח טכנאי עם fuses + MC4."
}
```

## Writeback + dispatch chain

```
fault_analysis diagnoses
   → bee.diagnoseAlert (writeback)
   → if urgency high/critical + parts in stock:
       → field-dispatch-agent (Phase 4) creates :Job
       → assigns nearest skilled tech
       → notifies customer (SLA-aware) if tier_1
```

## Learning loop (Wave 8 integration)

After repair, tech reports actual cause. fault_analysis compares predicted
vs actual → refines the decision tree + confidence weights over time. Builds
a BEE-specific fault knowledge base (which faults are common on which
inverter brands at which site types).

## Tests
1. Single string zero → fuse/connector ranked top
2. All strings low + hot weather → inverter derating
3. Zero production + comm loss → distinguishes data vs real fault
4. Gradual decline + no rain → soiling/cleaning
5. Warranty check → flags if component covered
6. Writeback populates alert.diagnosis in BEE app
7. Critical tier_1 outage → urgency=critical + customer notify flag
