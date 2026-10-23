# sub-skill: performance_forecast

**Parent:** engineering-agent
**Purpose:** Estimate annual + monthly production (kWh) + degradation + savings for a designed system.

## Inputs

```json
{
  "site_lat": 31.25,
  "site_lon": 34.79,
  "panel_count": 86,
  "panel_wattage_w": 580,
  "tilt_deg": 25,
  "azimuth_deg": 180,
  "shading_factor": 0.05,
  "system_losses_pct": 14,
  "electricity_tariff_nis_kwh": 0.62
}
```

## Algorithm

```
1. Irradiation data:
   - Pull GHI/DNI for lat/lon from Open-Meteo (alfred-weather.js already has this)
   - OR use PVGIS / Israeli TMY tables
   - Monthly POA (plane-of-array) irradiance via tilt+azimuth transposition

2. Production model (simplified PVWatts-style):
   for each month m:
     POA_m = GHI_m * transposition_factor(tilt, azimuth, latitude)
     dc_energy_m = capacity_kwp * POA_m * (1 - shading_factor)
     ac_energy_m = dc_energy_m * (1 - system_losses_pct/100)
   annual_kwh = sum(ac_energy_m)

3. Israeli specifics:
   - High summer irradiance (Negev ~2000 kWh/m²/yr GHI)
   - Optimal tilt ≈ latitude (25-32° for Israel)
   - Dust/soiling losses higher in Negev (add 3-5% to system_losses)

4. Degradation:
   - Year 1: -2% (initial LID)
   - Years 2-25: -0.5%/yr (premium) or -0.7%/yr (standard)
   - Production_year_N = annual_kwh * (1 - degradation_curve(N))

5. Savings calc:
   - annual_savings_nis = annual_kwh * tariff
   - account for net-metering vs feed-in tariff (PUA rules)
   - 25-year cumulative (with degradation + tariff escalation ~2%/yr)

6. Payback:
   - payback_years = quoted_price_nis / annual_savings_nis (simplified)
   - ROI %, IRR if requested
```

## Output

```json
{
  "annual_production_kwh": 81400,
  "monthly_kwh": [4200, 5100, 6800, 7900, 9200, 9800, 9600, 9100, 7700, 6300, 4800, 3900],
  "capacity_factor_pct": 18.6,
  "specific_yield_kwh_kwp": 1632,
  "year_1_kwh": 79772,
  "year_25_kwh": 68800,
  "degradation_rate_pct_yr": 0.5,
  "annual_savings_nis": 50468,
  "cumulative_savings_25yr_nis": 1480000,
  "payback_years": 6.2,
  "co2_offset_annual_kg": 38658,
  "notes_he": "תחזית ל-50kWp באתר נגב, tilt 25°, פונה דרום. ייצור שנתי ~81,400 kWh.",
  "confidence": "estimate — actual ±10% based on weather variation",
  "writes_to_bee": "bee.updateSite production_forecast"
}
```

## Used by

- **proposal-generator** — savings + payback are the customer's buying motivation
- **customer-success-agent** — actual vs forecast = health signal (underperformance flag)
- **fault_analysis** — if actual << forecast, triggers investigation

## Validation loop

Once a site is operational, customer-success-agent compares actual SolarEdge
production vs this forecast monthly. Deviations >15% → feedback to refine the
model (Wave 8 learning — the forecast model improves over installs).

## Tests
1. Negev 50kWp south-facing → ~1600 kWh/kWp specific yield
2. Coastal (Tel Aviv) → slightly lower (more humidity/clouds)
3. East-West split roof → lower than pure south
4. Heavy shading 0.20 → production drops proportionally
5. 25-year degradation curve → year 25 ~85% of year 1
6. Savings calc with net-metering vs feed-in tariff
