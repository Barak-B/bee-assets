# sub-skill: wire_sizing

**Parent:** engineering-agent
**Purpose:** Size DC + AC conductors per Israeli code + IEC 60364, keep voltage drop in limits.

## Inputs

```json
{
  "string_configuration": "<from pv_design_calc>",
  "distance_panel_to_inverter_m": 35,
  "distance_inverter_to_meter_m": 12,
  "distance_meter_to_grid_m": 8,
  "ambient_temp_max_c": 45,
  "install_method": "conduit" | "tray" | "buried" | "free-air"
}
```

## Algorithm

```
DC side (string → inverter):
1. I_string = module Isc * 1.25 (safety factor per IEC 62548)
2. For target voltage drop <= 2% (DC best practice):
     A_mm2 = (2 * L * I * rho_copper) / (Vdrop_allowed * V_string)
     where rho_copper = 0.0175 Ω·mm²/m
3. Round up to standard gauge: 4, 6, 10, 16, 25, 35 mm²
4. Derate for temperature + install method (IEC 60364-5-52 tables)
5. Verify ampacity >= I_string after derating

AC side (inverter → meter → grid):
1. I_ac = inverter_ac_kw * 1000 / (V * sqrt(3) for 3-phase, or V for 1-phase)
2. Target voltage drop <= 1% (AC, tighter)
3. Same gauge formula, 3-phase factor
4. Round + derate + verify ampacity

Grounding / earthing:
- PE conductor sized per IEC 60364-5-54
- Equipotential bonding for array frame
```

## Output

```json
{
  "dc_wiring": {
    "string_cable_mm2": 6,
    "voltage_drop_pct": 1.4,
    "total_dc_cable_m": 280,
    "cable_spec": "PV1-F 6mm² double-insulated UV-resistant"
  },
  "ac_wiring": {
    "inverter_to_meter_mm2": 16,
    "voltage_drop_pct": 0.7,
    "phases": 3,
    "cable_spec": "NYY 5x16mm²"
  },
  "grounding": {
    "pe_conductor_mm2": 16,
    "earth_electrode": "required, <10Ω"
  },
  "warnings": [],
  "code_refs": ["IEC 60364-5-52", "IEC 62548 §7.3", "תקנות החשמל פרק ז"]
}
```

## Edge cases
- Long DC runs (>50m) → upsize to keep <2% drop, or relocate inverter
- High ambient (Negev 45°C+) → aggressive derating
- Buried cable → different ampacity table
- Aluminum vs copper (cost tradeoff for long AC runs)

## Tests
1. 35m DC run, 50kWp → 6mm², <2% drop
2. 100m DC run → 10mm² (upsized)
3. 3-phase AC 50kW → 16mm²
4. Negev 48°C derating applied
5. Voltage drop exceeds limit → upsize recommendation
