# sub-skill: pv_design_calc

**Parent:** engineering-agent
**Purpose:** Size a PV system + lay out strings for a given site + target capacity.

## Inputs

```json
{
  "site_id": "kfar-yuval",
  "site_dimensions": {
    "usable_area_m2": 320,
    "orientation_deg": 180,
    "tilt_deg": 25,
    "roof_type": "flat" | "pitched" | "ground-mount"
  },
  "target_capacity_kwp": 50,
  "module_brand": "Jinko" | "Trina" | "Longi" | "LG" | "...",
  "inverter_brand": "SolarEdge" | "Sungrow" | "SMA",
  "shading_obstacles": [{"type": "skylight", "area_m2": 4}]
}
```

## Algorithm

```
1. Module selection:
   - Pick module wattage from BEE pricebook (8 panel types)
   - panel_count = ceil(target_kwp * 1000 / panel_wattage)
   - Check area fit: panel_count * panel_area_m2 <= usable_area * 0.85
     (0.85 = walkway + setback factor)
   - If doesn't fit → reduce target OR suggest higher-wattage panel

2. Inverter selection:
   - DC/AC ratio target: 1.1 - 1.25 (oversizing for clipping economics)
   - inverter_ac_kw = target_kwp / 1.15
   - Pick inverter model from fleet brands (SolarEdge/Sungrow/SMA)
   - Single inverter if <= its max; else multiple

3. String configuration (CRITICAL — voltage limits):
   - Get inverter MPPT window: Vmpp_min, Vmpp_max, Voc_max
   - Get module temp coefficients
   - At coldest expected temp (Israel: ~0°C in negev winter nights):
       Voc_cold = Voc_stc * (1 + tempCoeff_Voc * (0 - 25))
   - max_modules_per_string = floor(Voc_max / Voc_cold)
   - At hottest (Israel: ~70°C cell temp summer):
       Vmpp_hot = Vmpp_stc * (1 + tempCoeff_Vmpp * (70 - 25))
   - min_modules_per_string = ceil(Vmpp_min / Vmpp_hot)
   - Choose modules_per_string in [min, max] that divides panel_count evenly
   - parallel_strings = panel_count / modules_per_string
   - Verify string current * parallel <= inverter max input current

4. SolarEdge special case:
   - Optimizers per panel → string voltage is fixed (not sum of panels)
   - Different sizing rules — max 5700W per string (SolarEdge spec)
```

## Output

```json
{
  "panel_model": "Jinko Tiger Neo 580W",
  "panel_wattage_w": 580,
  "panel_count": 86,
  "actual_capacity_kwp": 49.88,
  "area_used_m2": 271,
  "area_fit_ok": true,
  "inverter_model": "Sungrow SG50CX",
  "inverter_count": 1,
  "inverter_ac_kw": 50,
  "dc_ac_ratio": 1.0,
  "string_configuration": [
    {"mppt": 1, "modules_per_string": 22, "parallel_strings": 2},
    {"mppt": 2, "modules_per_string": 21, "parallel_strings": 2}
  ],
  "voltage_check": {
    "voc_cold_v": 642,
    "voc_max_limit_v": 1000,
    "vmpp_hot_v": 421,
    "vmpp_min_limit_v": 200,
    "passed": true
  },
  "warnings": [],
  "notes_he": "תכנון ל-50kWp עם 86 פאנלים Jinko 580W ו-inverter Sungrow יחיד."
}
```

## References

- IEC 62548 §7 (array configuration)
- Inverter datasheets (Vmpp/Voc/Isc limits) — store in BEE pricebook
- Israeli temperature extremes: TMY data from Open-Meteo (alfred-weather.js)

## Edge cases to handle

- Target capacity exceeds roof area → suggest reduced size or premium panels
- Mixed orientations (E + W roof) → separate MPPT trackers
- SolarEdge optimizer logic differs from string inverters
- Multiple inverters needed (>100kWp commercial) → distribute strings
- Ground-mount → no area constraint but row-spacing for self-shading

## Tests

1. 50kWp Sungrow flat roof → single inverter, 4 strings
2. 5kWp SolarEdge residential → optimizers, 1 string
3. 200kWp commercial → 4× SG50CX, distributed
4. Cold-climate voltage check (Negev winter) → Voc within 1000V
5. Hot-climate Vmpp check (summer) → stays above MPPT min
6. Area overflow → returns warning + reduced count
