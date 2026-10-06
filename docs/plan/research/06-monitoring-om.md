# 06 — ניטור, API של ממירים ו-O&M (2025–2026)

**הקשר:** B.E.E — ברק הנדסת חשמל, ~184 אתרי PV, פלטפורמת TypeScript/Fastify/Postgres עם אדפטר SolarEdge V1 (circuit breaker על 503), אדפטר SolarEdge V2 "Fleet Access" עם credit ledger, אינטגרציית Sungrow ("not in account list"), והתראות על אתרים "חשוכים".
**מטרה:** תכנון שלב הפוסט-התקנה: commissioning → handover לניטור → חוזי תחזוקה → בדיקות תקופתיות.
**תאריך:** 2026-10-06.

> **הערת מתודולוגיה (חשוב לקריאה):**
> - תקציב חיפושי הרשת נגמר אחרי ~30 שאילתות, ורוב אתרי התיעוד הרשמיים חסומים ב-egress proxy של הסביבה (developer.solaredge.com, api-docs.solaredge.com, knowledge-center.solaredge.com, support.huawei.com, developer.sma.de, developer-v4.enphase.com, developer.soliscloud.com, support.tigoenergy.com, meteocontrol, solytic, pvoutput.org, אתרי .co.il, SII, iteh).
> - לכן רוב הפרטים הטכניים **אומתו מקוד קהילתי שהורד ישירות מ-GitHub** (clone של הריפוזיטוריז), לא מהתיעוד הרשמי. כל שם endpoint/שדה שמקורו בקוד קהילתי מסומן **[קוד קהילתי]**. מה שמקורו רק בתקציר חיפוש מסומן **[תקציר חיפוש]** ודורש אימות. דברים שלא הצלחתי לאמת כלל נמצאים בסעיף "לא אומת".
> - **לא המצאתי שמות endpoint.** איפה שלא מצאתי — כתוב במפורש.

---

## 1. טבלת API לפי יצרן (סיכום)

| יצרן / פלטפורמה | רשמי? | אימות | מגבלות / קרדיטים | Endpoints מרכזיים | איך אתר "משותף" לחשבון המתקין | סיכון יציבות |
|---|---|---|---|---|---|---|
| **SolarEdge Monitoring API v1** | רשמי (legacy, נתמך עדיין) | `api_key` ב-query; מפתח ברמת Site או ברמת Account | 300 בקשות/יום לכל account-token; 300/יום לכל siteId מאותו IP; עד 3 במקביל; bulk-call נספר פעם אחת לכל אתר שבו [api-evangelist profile של ה-PDF הרשמי] | `/sites/list`, `/site/{id}/details`, `/overview`, `/energy`, `/timeFrameEnergy`, `/energyDetails`, `/power`, `/powerDetails`, `/currentPowerFlow`, `/storageData`, `/inventory`, `/equipment/{id}/list`, `/site/{id}/inverter/{sn}/data`, `/site/{id}/meters`, `/accounts/list`, `/version/current` | מפתח Account-level מכסה את כל האתרים שה-account המתקין "בעלים"/משויך אליהם; מפתח Site נוצר ע"י בעל האתר/מנהל ב-Admin → Site Access → API Access | נמוך-בינוני: יציב שנים, אבל SolarEdge דוחפת ל-V2; מגבלת 300/יום היא החסם האמיתי |
| **SolarEdge Monitoring API V2 ("Fleet Access" / "Site Access")** | רשמי (פורטל developer.solaredge.com, self-serve) | Fleet Access: header `X-API-Key` עם "App API Key"; Site Access: OAuth2 ("SolarEdge Connect") `https://connect.solaredge.com/authorize`, token `https://monitoringapi.solaredge.com/v2/oauth2/token`, scopes `SITE_DATA DEVICE_DATA` [קוד קהילתי] | מודל **קרדיטים חודשיים + תקרת קריאות לדקה** לפי tier (Free / Business Starter / Growth / Pro / Enterprise) [תקציר חיפוש — המספרים לא אומתו]; בקוד קהילתי: **כל קריאה = 1 קרדיט**; 429 עם header `x-ratelimit-remaining-minute`≠0 ⇒ מכסת הקרדיטים החודשית נגמרה; 429 בלי זה ⇒ rate-limit לדקה עם `Retry-After` | `GET /v2/sites`, `/v2/sites/{id}`, `/overview`, `/power`, `/energy`, `/devices`, `/alerts`, `/inverters/telemetry`, `/meters/telemetry`, `/storage/telemetry`, `/inverters/{sn}/voltage`, `POST /v2/oauth2/revoke-token` (פירוט בסעיף 2.2) | Fleet Access = האתרים שה-account המתקין בעלים/משויך אליהם ("owned or associated"); Site Access = בעל המערכת מאשר OAuth לאפליקציה שלכם | בינוני: API חדש, פורטל ותמחור השתנו ב-2025–2026; הרזולוציה הדקה ביותר 15 דק' |
| **Huawei FusionSolar Northbound (OpenAPI)** | רשמי | `POST /thirdData/login` עם `userName`+`systemCode` → header `xsrf-token` בכל קריאה [קוד קהילתי] | מגבלת תדירות לדקה **לכל interface** (failCode 407 = "access frequency too high"); session login יחיד לחשבון; failCode 305 = token פג | `/thirdData/stations` (מחליף את `getStationList` שהוצא משימוש), `getStationRealKpi`, `getKpiStationHour/Day/Month/Year`, `getDevList`, `getDevRealKpi`, `getDevHistoryKpi`, `getAlarmList` | חשבון Northbound נוצר **ע"י חברת המתקין** ב-FusionSolar: System → Company Management → Northbound Management → Create; מסמנים את המפעלים/חברות; מפעילים "Basic APIs" + הרשאות Device Data לכל סוג ציוד. יש "Plant Migration" בין מתקינים | נמוך-בינוני: API ותיק; Huawei מוציאה endpoints (getStationList) ומחליפה; מגבלות תדירות קשוחות |
| **Sungrow iSolarCloud OpenAPI** | רשמי (developer-api.isolarcloud.com) | שני מסלולים [קוד קהילתי]: (א) **API-key**: `POST /openapi/login` עם `user_account`/`user_password`+`appkey` בגוף, header `x-access-key`=Secret; `token` בגוף הבקשות הבאות. (ב) **OAuth2**: authorize ב-`web3.isolarcloud.{region}`, `POST /openapi/apiManage/token` → Bearer; `refreshToken`. אופציונלי: הצפנת RSA (`x-random-secret-key`) | לא פורסמו מספרים שמצאתי; נתונים מתעדכנים כל **5 דקות**; אישור אפליקציה ידני ע"י Sungrow | API-key: `getPowerStationList`, `getPowerStationDetail`, `getDeviceList`, `getDeviceRealTimeData`, `getOpenPointInfo`, `getDevicePointMinuteDataList`; OAuth: `/openapi/platform/queryPowerStationList`, `getPowerStationDetail` (`ps_ids`), `getDeviceListByPsId`, `getPowerStationRealTimeData` (`ps_id_list`,`point_id_list`), `getPowerStationPointMinuteDataList` (`minute_interval` ≥1), `paramSetting` | **הבעלים** (חשבון לקוח) משתף: Plant → Share → "Add Sharing" → אימייל חשבון המתקין → הרשאת Administrators. ב-OAuth המשתמש בוחר אילו מפעלים לאשר ("Power Station Sharing"); ה-token מחזיר `authorizedPlantIds` | בינוני: "API לא בשל" (מחבר pysolarcloud); OAuth לא סטנדרטי; טקסט חוזר בסינית; gateway לפי אזור |
| **GoodWe SEMS / SEMS+** | **לא רשמי** (אין API ציבורי מתועד; swagger ישן ב-goodwe-power.com:82 [תקציר חיפוש]) | SEMS+ Web: `POST https://semsplus.goodwe.com/web/sems/sems-user/api/v1/auth/cross-login` → base אזורי `https://{region}-gateway.semsportal.com/web/sems`; header `Token` (JSON) + `X-Signature`; legacy: `https://www.semsportal.com/api/v3/Common/CrossLogin`, `https://eu.semsportal.com/api/v3/PowerStation/GetMonitorDetailByPowerstationId` [קוד קהילתי] | HTTP 429 / קוד `GY0429` = rate limit; הקוד הקהילתי עושה cooldown 60 ש' ×2 עד 300 ש' | `/sems-plant/api/portal/stations/page` (רשימת תחנות), `/stations/flow`, `/stations/device/all-status`, `/equipments/{sn}/telemetry`, `/equipments/{sn}/telecounting`, `/stations/statistics` | חשבון מתקין רואה את כל התחנות שתחתיו; חשבון "Visitor" לקריאה בלבד | **גבוה**: reverse-engineered, GoodWe שינתה endpoints (SEMS→SEMS+) |
| **SAJ eSolar / Elekeeper** | חצי-רשמי: "Elekeeper Open Platform" הוכרז, תיעוד תחת NDA [תקציר חיפוש]; בפועל קהילה משתמשת ב-API פרטי | Login `/dev-api/api/v2/sys/user/login` עם סיסמה מוצפנת AES-128-ECB + חתימת HMAC-SHA256 [תקציר חיפוש, לא אומת בקוד] | לא ידוע | לא תועדו paths מעבר ל-login | לא ידוע | **גבוה**: v1 הוצא משימוש ב-2025, אינטגרציות נשברו |
| **Deye Cloud** | רשמי (developer.deyecloud.com, App ID/Secret) [תקציר חיפוש] | Bearer token; base `https://eu1-developer.deyecloud.com/v1.0` [קוד קהילתי, README בלבד] | עדכון נתונים כל 3–5 דק' (1 דק' לפי בקשה למייל) [תקציר חיפוש] | שמות endpoints לא אומתו; בקוד קהילתי: device list עם `deviceSn`, latest-by-SN עם `dataList[{key,value,unit}]` | לא ידוע | בינוני: Deye העבירה נתונים מ-Solarman למרכזי נתונים משלה (EU/US) |
| **Solarman Business API** (Deye/Sofar/KStar ועוד, white-label) | רשמי, בגישה לפי בקשה במייל | `POST https://api.solarmanpv.com/account/v1.0/token?appId=` עם `appSecret` בגוף; token תקף חודשיים [תקציר חיפוש של ה-PDF הרשמי] | 300 בקשות/10 ש' לחשבון; 50/דקה לפקודות שליטה [תקציר חיפוש] | `station/v1.0/list`, `station/v1.0/realTime`, `station/v1.0/history`, `device/v1.0/currentData`, `device/v1.0/historical`, `device/v1.0/alertList` [תקציר חיפוש — לא אומת בקוד] | חשבון Business ב-pro.solarmanpv.com עם `orgId`; מבקשים APP ID/Secret במייל ל-Solarman עם שם המשתמש | בינוני |
| **Growatt OpenAPI V1** | רשמי (token) | header `token`; hosts `https://openapi.growatt.com/v1/` (EU/אחר), `-us`, `-cn` [קוד קהילתי] | לא פורסם רשמית; קהילה: error 10012 "frequently access", מרווח 2 ש' בין קריאות [תקציר חיפוש] | plant list/details/energy overview/energy history, device list, `{device}/energy`, `energy_history` (עד 7 ימים), read/write parameter [קוד קהילתי] | token מתקבל מ-Growatt (יש לפנות אליהם) | בינוני: ה-API ה"קלאסי" (ShinePhone, סיסמה) נשבר תכופות; V1 יציב יותר |
| **KStar** | **לא נמצא API ענן רשמי** | — | — | קהילה: פרוטוקול WiFi מקומי reverse-engineered (kstar.sharp, read-only); Modbus RTU protocol V3.5 ל-grid-tied (סדרת BluE, SN 23xxxxxxxx); לוגרים של Solarman בחלק מהדגמים | — | **גבוה** לענן; **נמוך** ל-Modbus מקומי → ממליץ Modbus/לוגר ל-KStar (רלוונטי: KStar ברשימת הממירים המועדפים ב-BEE) |
| **Fronius** | רשמי: Solar API v1 (מקומי, JSON) + Solar.web Query API (ענן) | מקומי: ללא אימות, `/solar_api/v1/` (ב-GEN24 יש להפעיל "Solar API" ב-UI של הממיר, FW ≥1.14.1); ענן: `AccessKeyId`/`AccessKeyValue` [קוד קהילתי/grawlinson] | לא נמצאו | מקומי: `GetInverterRealtimeData`, `GetPowerFlowRealtimeData`, `GetMeterRealtimeData`; Modbus SunSpec TCP/RTU | Solar.web: המתקין מנהל מערכות ב-Solar.web; API ענן דורש Solar.web Premium (מחיר לא אומת) | נמוך |
| **SMA (Sunny Portal / ennexOS)** | רשמי (developer.sma.de — Monitoring API, Sandbox) | OAuth2 (sandbox: `sandbox-auth.smaapis.de/oauth2/auth`, `/token`) [תקציר חיפוש] | ennexOS מעלה כל 5 דק'; מגבלות לא נמצאו | לא אומתו (האתר חסום) | לא אומת | נמוך-בינוני |
| **Enphase Enlighten API v4** | רשמי | OAuth2 authorization-code (ניטור) + `key` של אפליקציה; password grant ל-Commissioning API [api-evangelist profile] | Watt: חינם, 10/דקה, 1,000/חודש; Kilowatt $249/חודש, 50/דקה, 50k/חודש; Megawatt $999/חודש, 100/דקה, 300k/חודש; **Partner** (מתקינים רשומים ≥10 התקנות): 10,000 hits חינם ואז $0.005/hit, 300/דקה, 1.5M/חודש, $2 ל-activation, $0.10 ל-Live Status hit | `/api/v4/systems`, `/{id}/summary`, `/devices`, `/events`, `/alarms`, `/open_alarms`, `/production_meter_readings`, `/energy_lifetime`, `/telemetry/production_micro`, `/telemetry/production_meter`, `/devices/micros/{sn}/telemetry`, `/latest_telemetry`, `/live_data` | Partner plan נותן גישה למערכות שהמתקין התקין/מתחזק; אחרת בעל המערכת מאשר OAuth | נמוך (אבל לא רלוונטי הרבה בישראל) |
| **Tigo Energy Intelligence** | v3 רשמי (`api2.tigoenergy.com/api/v3`, דורש מנוי **EI Premium**); v4 "public alpha" [תקציר חיפוש] | v3: `POST /api/v3/users/login` (user/pass) → token; v4 (קהילתי, `mapi.tigoenergy.com` — ה-API של האפליקציה): `POST /api/v3/user/login?type=8` → Bearer [קוד קהילתי] | 100 בקשות/דקה לחשבון [תקציר חיפוש]; 429/503 עם `Retry-After` | v3: `/data/aggregate?system_id=&level=min&param=Pin`, `/data/combined`; v4-app: `/api/v3/systems/query`, `/systems/full/{id}`, `/systems/layout?id=`, `/api/v4/equipments?systemId=`, `/api/v4/equipment-status/latest`, `/api/v4/system/summary/summary` | מערכות משויכות לחשבון המתקין ב-EI portal | בינוני: v4 לא רשמי; הנתונים ברמת פאנל לא real-time (TAP→CCA sporadic) |
| **Solis — SolisCloud Platform API v2.0** | רשמי (PDF ציבורי; מפתח דרך service ticket ואז `soliscloud.com/#/apiManage`) | `Authorization: API {KeyId}:{Sign}`, `Sign = base64(HmacSHA1(KeySecret, VERB\nContent-MD5\nContent-Type\nDate\nCanonicalizedResource))`; base `https://www.soliscloud.com:13333` [קוד קהילתי] | **3 בקשות / 5 שניות לכל IP**; HTTP 408 אם השעון סוטה >15 דק' | `/v1/api/userStationList`, `stationDetail`, `stationDetailList`, `stationDay/Month/Year/All`, `inverterList`, `inverterDetail`, `inverterDay`, `alarmList`, `collectorList`, `epmList`, `weatherList`, `inverter/shelfTime` (אחריות) | מפתח ברמת חשבון (ארגון המתקין); "מפעלים תחת החשבון" | נמוך-בינוני; מגבלת ה-IP קשוחה ל-184 אתרים (צריך scheduler גלובלי) |

---

## 2. פירוט לפי יצרן

### 2.1 SolarEdge v1 (קיים אצלכם)
- מגבלות (מהתיעוד הרשמי כפי שמסוכם ב-profile): **300/יום לכל account token; 300/יום לכל siteId מאותו IP; 3 במקביל**. Bulk call ל-N אתרים נספר כקריאה אחת בכל אחד מהם — כלומר bulk לא חוסך במכסת ה-account אבל כן חוסך במכסות האתר. (https://github.com/api-evangelist/solar-edge — `rate-limits/solar-edge-rate-limits.yml`)
- Home Assistant הרשמי דוגם: overview / currentPowerFlow / energyDetails כל 15 דק', details+inventory כל 12 שעות, storage כל 4 שעות (https://github.com/home-assistant/core, `homeassistant/components/solaredge/const.py`).
- **חשבון של 184 אתרים עם account key**: 300/יום ל-token ⇒ ~1.6 קריאות/אתר/יום. לכן עם v1 חובה bulk endpoints (`/sites/list` ואז `/site/{a},{b},{c}/overview` וכד') או מפתח Site לכל אתר (אז 300/יום/אתר). ה-circuit breaker שלכם על 503 טוב; כדאי להוסיף טיפול ב-429 (זה הקוד הרשמי למגבלה).

### 2.2 SolarEdge V2 (Fleet Access / Site Access) — **שדות אמיתיים מקוד**
מקורות: https://github.com/trooperthorn/ha_int_solaredge (אינטגרציית HA ל-V2, 2026) ו-https://github.com/talbronfer/monitoring-v2-api-demo (demo רשמי-למחצה של SolarEdge מ-2022/23, stoplight). **כל מה שלהלן = [קוד קהילתי]**.

- Base: `https://monitoringapi.solaredge.com/v2`
- אימות:
  - **Fleet Access**: `X-API-Key: <App API Key>` (נוצר בפורטל developer.solaredge.com עבור "Fleet Access application"). ב-demo הישן (2022) היו שני headers: `X-Account-Key` + `X-API-Key` שסופקו ע"י account manager — כנראה המודל הישן לפני הפורטל ה-self-serve. **אמתו מול הפורטל איזה header נדרש היום** (אצלכם זה כבר עובד, אז אתם יודעים).
  - **Site Access (OAuth2 / SolarEdge Connect)**: authorize `https://connect.solaredge.com/authorize`, token `https://monitoringapi.solaredge.com/v2/oauth2/token`, scopes `SITE_DATA DEVICE_DATA`, פרמטר משך גישה (24 חודשים ב-HA), revoke `POST /v2/oauth2/revoke-token`. **`GET /sites` (רשימת אתרים) עובד רק עם Fleet Access; OAuth token נדחה** (הערה בקוד).
- Endpoints ופרמטרים:
  - `GET /sites?page=&sites-in-page=` → מעטפת `{ "sites": { "site": [ {siteId, name, peakPower, installationDate, location{address,city,state,zip,country,timezone?}, activationStatus, note} ] } }` (ב-demo 2022 חזר מערך חשוף — כנראה השתנה).
  - `GET /sites/{id}` → `siteId, name, peakPower (kW), installationDate, lastUpdateTime, activationStatus, location.timezone`.
  - `GET /sites/{id}/overview?from=&to=` → `{ siteId, production:{total, unit:"WH", toSelfConsumption, toStorage, toGrid}, consumption:{total, unit, fromPv, fromStorage, fromGrid}, performance:{specificYield, performanceRatio} }`.
  - `GET /sites/{id}/power?resolution=QUARTER_HOUR&unit=W&from=&to=` ו-`GET /sites/{id}/energy?resolution=YEAR&unit=WH&from=&to=` → `{ period:{from,to}, unit, resolution, values:[{timestamp, value}] }`.
  - `GET /sites/{id}/devices?types=INVERTER&types=METER&types=BATTERY` → `[ {type, serialNumber, name, manufacturer, model, partNumber, firmwareVersion, createdAt, connectedTo, active, communicationType} ]`.
  - `GET /sites/{id}/alerts?only-open=true&alerts-in-page=100` → פריטים עם `alertId, type, category, status, impact, title?, component{serialNumber}`.
  - `GET /sites/{id}/inverters/telemetry?resolution=HOUR&from=&to=`, `/meters/telemetry`, `/storage/telemetry` (מבנה: מילון לפי serial של `values`).
  - `GET /sites/{id}/inverters/{sn}/voltage?resolution=HOUR&from=&to=`.
  - פורמט `from`/`to`: ב-HA — זמן קיר מקומי של האתר **ללא offset** (`YYYY-MM-DDTHH:MM:SS`); ב-demo — ISO עם `Z`. ה-response מחזיר offset מקומי.
- **קרדיטים**: בקוד הקהילתי "every call costs one credit"; דגימה שעתית של overview+power + 6-שעתי של site/energy/alerts + 12-שעתי של devices = ~1,860 קרדיטים/חודש/אתר. ל-184 אתרים זה ~340k/חודש — צריך לבדוק איזה tier נותן זאת (המספרים לפי tier **לא אומתו**, הפורטל חסום).
- **זיהוי סוג 429**: `x-ratelimit-remaining-minute` קיים ו≠0 ⇒ **מכסה חודשית נגמרה** (לא לנסות שוב עד החודש הבא / עד הגדלת tier); אחרת ⇒ rate-limit לדקה, לכבד `Retry-After`. 403 = scope חסר (למשל DEVICE_DATA). מומלץ שה-credit ledger שלכם יפרש כך ויעצור polling אוטומטית.
- הרזולוציה הדקה ביותר: 15 דק'. אין טעם לדגום `power` יותר מפעם ב-15 דק'.

### 2.3 Huawei FusionSolar Northbound API [קוד קהילתי: https://github.com/tijsverkoyen/HomeAssistant-FusionSolar]
- Base לפי אזור: `https://{prefix}.fusionsolar.huawei.com/thirdData/` (ה-prefix של דף הלוגין שלכם, למשל `intl`, `eu5`).
- `POST /thirdData/login` body `{userName, systemCode}` → header תגובה `xsrf-token`; שולחים `xsrf-token` בכל בקשה.
- `POST /thirdData/stations` body `{pageNo}` → `data.list[{plantCode, plantName, plantAddress, capacity, contactPerson...}]` (מחליף `getStationList` שמחזיר failCode 401 באזורים מסוימים — הוצא משימוש לפי Northbound Interface Reference V6, 2023-01).
- `POST getStationRealKpi` `{stationCodes:"a,b,c"}`; `getKpiStationYear` `{stationCodes, collectTime(ms)}`; `getDevList` `{stationCodes}` → `devId, devName, stationCode, esnCode, devTypeId, invType, softwareVersion, latitude, longitude`; `getDevRealKpi` `{devIds:"1,2", devTypeId}`.
- failCode: `0` OK, `305` token פג (login מחדש), `401` אין גישה ל-interface, `407` תדירות גבוהה מדי. ההאינטגרציה דוגמת realtime כל 63 ש' לקבוצת סוג-ציוד (כי "1 קריאה/דקה לכל endpoint") ו-yields כל 10 דק'.
- **שיתוף/הקמת חשבון API**: ע"י חברת המתקין בפורטל: System → Company Management → Northbound Management → Create (username, password, associated account, deadline) → מסמנים חברות/מפעלים → Enable "Basic APIs" + Device Data לכל סוג (String Inverter, Residential Inverter, Battery, ESS, Power Sensor, Grid Meter, EMI). מומלץ **שני חשבונות זהים** (prod/dev) כי session יחיד. העברת מפעל בין מתקינים: Plants → Plant Migration (המתקין המוסר צריך שם חברה+קוד של המקבל).
- תיעוד רשמי: https://support.huawei.com/enterprise/en/doc/EDOC1100261860 (חסום בסביבה; יש שם מגבלות תדירות לכל interface — **לא אומת כאן**).

### 2.4 Sungrow iSolarCloud OpenAPI [קוד קהילתי: https://github.com/bugjam/pysolarcloud, https://github.com/Afrouper/sungrow-api-client]
- פורטל: https://developer-api.isolarcloud.com — יוצרים Application → App Key, Secret Key, App ID (ה-App ID מופיע כ-query param ב-Authorize URL). **ממתינים לאישור Sungrow.**
- Gateways: `https://gateway.isolarcloud.eu`, `https://gateway.isolarcloud.com.hk` (International), `https://gateway.isolarcloud.com` (China), `https://augateway.isolarcloud.com`, `https://gateway.isolarcloud.in`. **לא אומת איזה gateway משרת חשבונות ישראליים** (סביר International/HK או EU — לבדוק לפי ה-web3 שבו אתם מתחברים).
- מסלול API-key (Java client): `POST /openapi/login` body `{user_account, user_password, appkey}`, headers `x-access-key: <Secret Key>`, `sys_code` (ערך לא נבדק), אופציונלי `x-random-secret-key` להצפנת RSA; תגובה `{result_code, result_msg, result_data:{token,...}}`; אח"כ `token` בגוף. endpoints: `/openapi/getPowerStationList` `{curPage,size}`, `/openapi/getDeviceList` `{ps_id,curPage,size}`, `/openapi/getDeviceRealTimeData`, `/openapi/getOpenPointInfo` `{device_model_id,type:2}`, `/openapi/getPowerStationDetail` `{sn}`, `getDevicePointMinuteDataList` [InkyPi].
- מסלול OAuth2 (pysolarcloud): authorize ב-`https://web3.isolarcloud.{region}/...` (המשתמש **בוחר מפעלים** לאישור), `POST /openapi/apiManage/token` (header `x-access-key`) → `access_token, refresh_token, expires_in, authorizedPlantIds, authorizedUser`; בקשות עם `Authorization: Bearer` + `x-access-key`. endpoints: `/openapi/platform/queryPowerStationList`, `/openapi/platform/getPowerStationDetail` `{ps_ids:[...]}`, `/openapi/platform/getDeviceListByPsId` `{ps_id,page,size}`, `/openapi/platform/getPowerStationRealTimeData` `{ps_id_list, point_id_list, is_get_point_dict:"1"}`, `/openapi/platform/getPowerStationPointMinuteDataList` `{ps_id_list, minute_interval, ...}` (מינימום 1 דק'; נתונים מתעדכנים כל 5 דק'), `/openapi/platform/paramSetting` (שליטה, למשל `feed_in_limitation`, `active_power_limit_ratio` — point ids 10012/10008).
- **"not in account list" — פרשנות (השערה, לא אומת):** ב-API-key mode רואים רק מפעלים שמשויכים לחשבון ה-`user_account` שאיתו מתחברים; ב-OAuth רק `authorizedPlantIds`. מפעל שהלקוח לא שיתף לחשבון המתקין/לא אישר לאפליקציה יחזיר שגיאה כזו. תהליך השיתוף (מה-wiki של mkaiser ומ-FAQ של Sungrow AU): **בעל המפעל** (חשבון לקוח) → רשימת מפעלים → Share → "Add Sharing" → אימייל חשבון המתקין → רמת "Administrators". בחשבון מתקין: Plant → Options → Configuration → Plant → add Channel/Partner → Administrator [תקציר חיפוש]. כלומר: בשלב ה-handover חובה שהלקוח ישתף את המפעל לחשבון המתקין (או שהמפעל ייווצר מלכתחילה תחת חשבון המתקין, ואז הלקוח מקבל שיתוף).
- Quirks: OAuth מבקש אישור מחדש בכל פקיעת token (אין silent re-auth); `state` חייב להיות לפני `#` ב-URL; תגובות בסינית למרות `lang=en`; נקודות מדידה משתנות לפי דגם.
- שמות שדות מדגם (Java client, מפעל גרמני): `plantName, plantType, plantId, connectType, totalEnergy{unit,value}, currentPower, currentPowerUpdateTime, todayEnergy, totalCapcity, alarmCount, latitude, longitude`; פרטי מפעל: `plantPs_key, designCapacity, plantStatus (ONLINE), plantTypeName`; נקודות ממיר כוללות למשל "Total active power", "Daily PV yield", "Insulation impedance to ground", **"Ripple control state"**, "Feed-in power".
- Modbus מקומי: דרך LAN של הממיר (מועדף) או WiNet-S (port 502, איטי יותר ומוגבל), https://github.com/mkaiser/Sungrow-SHx-Inverter-Modbus-Home-Assistant.

### 2.5 GoodWe SEMS / SEMS+ — לא רשמי [קוד קהילתי: https://github.com/TimSoethout/goodwe-sems-home-assistant, `api_examples/openapi.yaml` — "Partial, evidence-based description ... not an official or complete GoodWe API contract"]
- Login SEMS+: `POST https://semsplus.goodwe.com/web/sems/sems-user/api/v1/auth/cross-login` → מחזיר region → base `https://{region}-gateway.semsportal.com/web/sems`; headers `Token: {"uid","timestamp","token","client":"semsPlusWeb","version","language"}` + `X-Signature`.
- Endpoints: `POST /sems-plant/api/portal/stations/page` (רשימה), `/sems-plant/api/stations/flow`, `/sems-plant/api/stations/device/all-status`, `/sems-plant/api/equipments/{serialNumber}/telemetry`, `/telecounting`, `/relatedDevices`, `/sems-plant/api/stations/statistics`; legacy `POST https://{region}.semsportal.com/api/v3/PowerStation/GetMonitorDetailByPowerstationId`.
- Rate limit: HTTP 429 או `code: "GY0429"`; הקוד מחכה 300 ש' ועושה backoff. חשבון מתקין עם הרבה תחנות — להגדיל מרווח.
- סיכון: גבוה. חלופה: Modbus/UDP מקומי (ספריית `goodwe` של mletenay).

### 2.6 SAJ — לא רשמי בפועל
- אינטגרציות HA: https://github.com/vegaquark/ha-esolar_2025 ("elekeeper new API"), https://github.com/lsoriamo/ha-esolar, https://github.com/elboletaire/ha-saj-esolar-cloud. "Keys are extracted from the portal; if SAJ changes them, an update may be required."
- "New Open API for SAJ power systems" (HA community, 2025) — SAJ הכריזה על Elekeeper Open Platform; תיעוד הועבר תחת NDA [תקציר חיפוש]. **לא אומת.**

### 2.7 Deye / Solarman
- Solarman OPEN API (PDF רשמי v1.1.x, 2019, מופץ בפורומים): `https://api.solarmanpv.com`, token: `POST /account/v1.0/token?appId=` + `appSecret` בגוף, תוקף חודשיים; מגבלות 300/10 ש' כללי, 50/דקה שליטה; גישה: מייל ל-Solarman עם שם המשתמש ב-pro.solarmanpv.com (מקבלים spec + Postman + APP ID/Secret) [תקציר חיפוש]. endpoints `station/v1.0/list`, `station/v1.0/realTime`, `device/v1.0/currentData`, `device/v1.0/historical`, `device/v1.0/alertList` [תקציר חיפוש — לא אומת בקוד].
- Deye Cloud: פורטל developer.deyecloud.com, App ID/Secret; base קהילתי `https://eu1-developer.deyecloud.com/v1.0`; תגובות עם `deviceSn`, `dataList[{key,value,unit}]`, `collectionTime`; Deye העבירה נתונים ממרכז Solarman International למרכזי Deye EU/US [תקציר חיפוש].
- מקומי: לוגר Solarman — port **8899**, פרוטוקול V5 (SN מתחיל 17/21/40), Modbus slave id 1 (https://github.com/StephanJoubert/home_assistant_solarman); **אזהרה**: קושחות לוגר חדשות (2024) עם TLS חוסמות ModbusTCP מקומי (https://github.com/Hypfer/deye-microinverter-cloud-free).

### 2.8 Growatt
- OpenAPI V1 רשמי: header `token`; `https://openapi.growatt.com/v1/` (ישראל כנראה תחת "other regions" — לא אומת); מתודות plant_list/plant_details/plant_energy_overview/plant_energy_history/device_list/{min,sph}_energy/energy_history (עד 7 ימים)/read/write parameter (https://github.com/indykoning/PyPi_GrowattServer, `docs/openapiv1.md`). תיעוד רשמי ב-showdoc: https://www.showdoc.com.cn/262556420217021/0 (לא נגיש). מגבלות: לא מפורסמות; קהילה מדווחת error 10012 + 2 ש' בין קריאות.

### 2.9 KStar
- לא נמצא API ענן רשמי. https://github.com/ppumkin/kstar.sharp — פרוטוקול WiFi מקומי reverse-engineered, read-only. Modbus RTU Protocol V3.5 לממירים grid-tied (BluE-6KT-M1, SN 23xxxxxxxx) — מפת רגיסטרים שונה מ-V2.5 (אגירה) (https://github.com/StephanJoubert/home_assistant_solarman/discussions/543). https://github.com/phb/kstar-solar-monitoring — תבנית ריקה (לא מימוש).
- **המלצה**: ל-KStar לתכנן לוגר/גייטוויי Modbus (או לוגר Solarman אם הדונגל הוא Solarman) ולא לסמוך על ענן.

### 2.10 Fronius / SMA / Enphase / Tigo / Solis — ראו טבלה. הערות:
- Fronius Solar API v1 (מקומי) מתועד ב-OpenAPI (solarApiv1.json) ב-https://github.com/grawlinson/fronius-docs (מראה של התיעוד שמאחורי login). Solar.web Query API עם AccessKeyId/AccessKeyValue — דורש Solar.web Premium (מחיר לא אומת).
- SMA: https://developer.sma.de/sma-apis, https://developer.sma.de/sma-sandbox-apis, https://developer.sma.de/api-access-control (חסומים; המודל: OAuth2, Monitoring API ל-Sunny Portal+ennexOS, sandbox עם נתונים מדומים).
- Enphase: מחירון מלא ב-https://github.com/api-evangelist/enphase (`plans/enphase-plans.yml`, נאסף 2026-07 מ-developer-v4.enphase.com).
- Tigo: v3 רשמי דורש מנוי EI Premium; v4 app-API לא רשמי (https://github.com/Bobsilvio/tigosolar-online).
- Solis: https://github.com/hultenvp/soliscloud_api (כל ה-endpoints של spec 2.0), PDF רשמי: https://oss.soliscloud.com/templet/SolisCloud%20Platform%20API%20Document%20V2.0.pdf (חסום כאן).

---

## 3. אגרגטורים (פלטפורמות רב-יצרניות)

| פלטפורמה | מה עושה | API החוצה? | עלות (מה שנמצא) | הערות |
|---|---|---|---|---|
| **Solytic** (DE) | ניטור ענן מעל 40+ יצרנים דרך ה-APIs שלהם, ללא חומרה | כן (developer.solytic.com, מודל "API Pricing and Consumption" — חסום, לא אומת) | €0.20/kWp/שנה, מינימום €60; עד 20 kWp €60/מערכת/שנה; setup €0.50/kWp [תקציר חיפוש של דפי Solytic] | רלוונטי כ-benchmark: 184 אתרים × ~€60–100 = €11–18k/שנה |
| **meteocontrol VCOM Cloud** | ניטור מקצועי + VCOM API; לוגר blue'Log XM/XC (Modbus TCP עד 100 מכשירים, port 502; רשימת תאימות 2025-12) | כן (VCOM API) | לפי kWp ותקופה, דרך resellers, אין מחירון ציבורי | חסום; יש help-center עם הוראות חיבור ל-Huawei/Sungrow API |
| **AlsoEnergy PowerTrack** | portfolio C&I, AI fault detection | כן | ~$500+/שנה לפורטפוליו קטן [תקציר חיפוש] | US-centric |
| **Solar Analytics** (AU) | מונה חומרה עצמאי + API ציבורי (OpenAPI: https://api-docs.solaranalytics.com/OpenAPI-Specs/sapublic-openapi.yaml); 1-דקה הספק, 5-דק' אנרגיה, "expected generation" | כן | מנוי; חינם עם CATCH Control | מודל מעניין ל"expected vs actual" |
| **PVOutput** | שיתוף/השוואה חינמי; API `addstatus`/`getstatus`/`getstatistic` | כן | חינם (מגבלות לשעה; donation מגדיל) [לא אומת — האתר חסום] | לא מתאים כ-backbone מסחרי, כן כ-benchmark ציבורי |
| **Home Assistant (קוד ייחוס)** | לא אגרגטור מסחרי, אבל ה-integrations מתעדים את ה-endpoints האמיתיים | — | חינם | ריפוזיטוריז שהורדו: `trooperthorn/ha_int_solaredge`, `tijsverkoyen/HomeAssistant-FusionSolar`, `bugjam/pysolarcloud`, `TimSoethout/goodwe-sems-home-assistant`, `Bobsilvio/tigosolar-online`, `hultenvp/soliscloud_api`, `indykoning/PyPi_GrowattServer`, `GuyKh/py-iec-api` |
| SolarFusion/SolarGraf, PowerHub, Enact, "Pecan", Open Energy Monitor | — | — | — | **לא נחקרו** (תקציב חיפוש נגמר) — ראו "לא אומת" |

**מסקנה לתכנון:** לבנות adapter-per-vendor משלכם (כבר יש SolarEdge v1/v2 + Sungrow) זה הכיוון הנכון ל-184 אתרים, בתנאי שמנהלים (א) scheduler גלובלי לפי מגבלות כל יצרן (SolarEdge 300/יום, Solis 3/5 ש' ל-IP, Huawei 1/דקה/endpoint), (ב) רשומת "site binding" לכל אתר (ראו סעיף 5), (ג) fallback ל-Modbus/לוגר במותגים ללא API יציב (KStar, GoodWe, SAJ).

---

## 4. טלמטריה מקומית (on-site)

- **SunSpec Modbus** (מודלים רשמיים, https://github.com/sunspec/models): `1` Common (יצרן/דגם/SN), `101/102/103` ממיר 1Φ/split/3Φ (int+SF), `111/113` גרסאות float, `120` Nameplate, `122` Measurements_Status, `123` Immediate Controls (הגבלת הספק/כיבוי), **`160` Multiple MPPT** — לכל MPPT: `DCA, DCV, DCW, DCWH, Tmp, DCSt (OFF/SLEEPING/STARTING/MPPT/THROTTLED/FAULT…), DCEvt` + `N` מספר מודולים ⇒ **ניטור ברמת string/MPPT**, `201–204` מונים (1Φ/split/wye/delta: import/export, PF), `802–804` סוללות.
- **SolarEdge**: Modbus TCP (port 1502 לפי תיעוד SolarEdge "SunSpec Logging Technical Note v3.2, June 2025" — הקובץ חסום, **המספר ממקור זיכרון/קהילה ולא אומת כאן**), RTU על RS485; בקוד קהילתי (tjko/sunspec-monitor) נקראים: AC/DC power, total production, AC/DC V/I, temperature, status, meter import/export.
- **Sungrow**: LAN port של הממיר (מועדף) / WiNet-S port 502 (איטי, מוגבל); פרמטר wait 5 ms LAN / 20+ ms WiNet-S.
- **Fronius**: Solar API v1 מקומי (JSON, ללא אימות) + SunSpec TCP/RTU. **Solarman loggers**: port 8899 V5 (Deye/Sofar/KStar/Solis בחלק מהדגמים), עם סיכון TLS בקושחות חדשות.
- **דאטה-לוגרים מסחריים**: Solar-Log (רישיונות Modbus TCP PM ל-direct marketing; Solar-Log Base לא צריך VPN router), meteocontrol blue'Log XM/XC (Modbus TCP/RTU, עד 100 מכשירים, רשימת תאימות 2025-12-17). נתבי LTE+VPN (Teltonika RUT) — **לא נחקר** (תקציב).
- **מתי מקומי עדיף על API ענן:**
  1. אתרים מסחריים >100 kWp שבהם צריך רזולוציה של שניות/דקה, נתוני string (מודל 160) ו-IV/אי-איזון — API ענן נותן 5–15 דק' ואגרגציה.
  2. יצרנים ללא API יציב (KStar, GoodWe, SAJ) או עם מגבלות קשוחות (Solis 3/5 ש').
  3. כשצריך **שליטה** (curtailment/active-power-limit) ולא רק קריאה — מודל 123 / `paramSetting`.
  4. גילוי "אתר חשוך" מהיר: ping ללוגר + heartbeat MQTT במקום לחכות ש-API הענן יציג "offline" (ב-FusionSolar kiosk cache 30 דק').
  5. אתר עם כמה יצרנים (ממיר + מונה + אגירה) — לוגר אחד מאחד.
  **מתי ענן עדיף:** בתים פרטיים (עלות חומרה/SIM/תחזוקה של לוגר לא מצדיקה), אתרים שבהם אין לכם שליטה ברשת הלקוח, ו-quick wins לכל 184 האתרים.

---

## 5. Commissioning & Handover

### 5.1 IEC 62446-1:2016 (+A1:2018) — "מערכות PV מחוברות רשת: דרישות מינימום לתיעוד מערכת, בדיקות commissioning ובחינה"
מה שאומת מתקצירי התקן (iteh/CSA/תקצירים): התקן מגדיר (א) **תיעוד שמועבר ללקוח** לאחר ההתקנה, (ב) **בחינה חזותית (inspection)**, (ג) **בדיקות (tests)** בשתי קטגוריות, (ד) **דוח verification**.

**קטגוריה 1 (חובה, בסיסית):**
1. בחינה חזותית (DC side, AC side, שילוט, הגנות, ניתוקים, חיווט, הארקה, מבנה).
2. רציפות הארקת הגנה ו-equipotential bonding.
3. פולריות של כל string.
4. **Voc** לכל string (השוואה בין strings ולערך מחושב בטמפ' מדודה).
5. **Isc** או זרם עבודה לכל string (השוואה בין strings).
6. בדיקות תפקוד (switchgear, הפעלת ממיר, anti-islanding/ניתוק).
7. **התנגדות בידוד DC** של כל string/מערך (מגר 500/1000 V; סף לפי התקן — **הערכים המדויקים לא אומתו כאן**).
8. (בתוספת/קטגוריה 1 מורחבת) בדיקת combiner boxes/מקטע.

**קטגוריה 2 (למערכות גדולות/מורכבות או לפי דרישת לקוח):**
- עקומות **I-V** לכל string (השוואה ל-STC-נורמליזציה).
- **צילום תרמי (IR)** של מודולים, מחברים, combiner, ממירים, לוחות — בעומס >~60% הספק (תנאי IR מקובלים; לא אומת מול הטקסט).
- מדידות נוספות (Riso רטוב, blocking diodes וכד').

**תיעוד handover לפי מבנה התקן (ידע מקצועי — לאמת מול הטקסט הרשמי, שלא היה נגיש):**
- נתוני מערכת: כתובת/בעלים, מתכנן, מתקין, תאריכי התקנה/חיבור, הספק DC (kWp) ו-AC (kVA), סוג חיבור (1Φ/3Φ, גודל חיבור).
- תרשים חד-קווי (as-made) כולל מערך, strings, combiner, DC/AC disconnects, הגנות, מונים, הארקה/SPD.
- נתוני strings: דגם מודול, מספר מודולים ב-string, מספר strings ל-MPPT, Voc/Isc/Vmp/Imp, אוריינטציה/טיית.
- דפי נתונים: מודולים, ממירים, אופטימייזרים, מבנה, כבלים, הגנות.
- תכנון מכני (עומסי רוח, עיגון, דוח קונסטרוקטור).
- מידע O&M: נהלי הפעלה/כיבוי, חירום, תחזוקה מומלצת, **אחריויות** (מודולים/ממיר/עבודה), פרטי קשר.
- **תוצאות הבדיקות** (טופס commissioning מלא לכל string), דוח בחינה, רשימת ליקויים.

### 5.2 פרקטיקה ישראלית (ממצאים חלקיים — אתרים חסומים, אומתו רק תקצירי חיפוש)
- **ת"י 579** — בדיקת מערכות סולאריות לפי תקן 579 במכון התקנים (https://www.sii.org.il/he/solar-testing) [תקציר חיפוש]. לבדוק אילו חלקים (ת"י 579 חלק ... = אימוץ IEC 62446-1?) — **לא אומת**.
- **בדיקת חשמלאי-בודק** (רישיון בודק מתאים לגודל המתקן) נדרשת לפני חיבור לרשת; לפי מדריך shoresh.org.il: "מתקן פוטו-וולטאי חייב להיבדק **לפחות אחת לחמש שנים** ע"י חשמלאי בודק מורשה... אי-ביצוע הבדיקה יגרור ביטול ההיתר" [תקציר חיפוש — **לאמת מול תקנות החשמל / אמות המידה של רשות החשמל**]. מדריך midrag: "חברת החשמל שומרת לעצמה את הזכות לדרוש בדיקות תקופתיות ע"י חשמלאי בודק" [תקציר חיפוש].
- תהליך: פתיחת תיק בחח"י → התקנה → בדיקת בודק → אישור חח"י → התקנת מונה ייצור/דו-כיווני → הפעלה.
- מסמכים שמקובל למסור (פרקטיקה ענפית, לא אומת מול מקור רשמי): תעודת בודק, אישור חח"י לחיבור, תיק מתקן (as-made, רשימת ציוד + מספרים סידוריים, אחריויות), הסבר על אפליקציית ניטור ופרטי גישה.

### 5.3 Checklist נתונים שה-CRM חייב לאסוף ב-handover (כדי "לזרוע" את הניטור)
**זהות אתר**
- מזהה פנימי BEE; שם לקוח; כתובת; קואורדינטות (לפחות 4 ספרות); timezone (Asia/Jerusalem); תאריך הפעלה (commissioning) ותאריך חיבור חח"י (תאריך תחילת ה-baseline).
- הספק DC (kWp) לפי strings; הספק AC (kW) לפי ממירים; **אוריינטציה/טיית לכל מערך** (נדרש ל-PVGIS/pvlib); הצללות ידועות; סוג חיבור (1Φ/3Φ, אמפר).

**קישור למוניטור של היצרן (site binding) — לכל יצרן באתר**
- `vendor` (solaredge_v1/solaredge_v2/huawei/sungrow/...), `vendor_site_id` (SolarEdge `siteId`; Huawei `plantCode`/`stationCode`; Sungrow `ps_id` + `ps_key`; Solis `stationId`/`id`; GoodWe `powerStationId`; Growatt `plant_id`; Enphase `system_id`; Tigo `system_id`), `region/gateway` (Sungrow eu/hk; Huawei prefix; Growatt host), `auth_mode` (fleet key / OAuth / per-site key), `credential_ref` (מפתח ב-vault, לא בטבלה), **`sharing_status`** (האם הלקוח שיתף/אישר לחשבון המתקין: SolarEdge — אתר תחת ה-account או OAuth consent; Sungrow — "Add Sharing"→Administrators / OAuth authorizedPlantIds; Huawei — המפעל מסומן בחשבון Northbound; Solis — מפעל תחת החשבון), תאריך אישור, מי אצל הלקוח מחזיק את חשבון הבעלים.
- `expected_data_latency` (SolarEdge 15 דק', Sungrow 5 דק', Huawei 5 דק'/kiosk 30 דק', Deye 3–5 דק', IEC 1–2 ימים) — לכיול ההתראה "אתר חשוך".

**מלאי ציוד**
- ממירים: יצרן, דגם, **SN**, firmware, communication type (ETHERNET/RS485/WiFi/LTE), כתובת Modbus/IP (אם מקומי), תאריך/משך אחריות.
- אופטימייזרים/מיקרו: SN ↔ מיקום במפה (SolarEdge layout; Tigo layout); מודולים: דגם, כמות, SN (אם נסרקו).
- **מפת strings**: לכל ממיר → MPPT → string: מספר מודולים, Voc/Isc נמדדים ב-commissioning + טמפ' + קרינה בזמן המדידה, Riso נמדד.
- מונים: מונה ייצור/צריכה (SolarEdge meter SN), **מונה חח"י**: `meterSerial`, `meterCode`, `contractNumber`, `bpNumber` (ראו סעיף 7).
- לוגר/תקשורת: דגם, SN, SIM/ICCID, IP סטטי, ספק.

**בדיקות ומסמכים**
- דוח commissioning IEC 62446-1 (PDF) + תוצאות מובנות (לפחות Voc/Isc/Riso per string) — זה ה-baseline להשוואות עתידיות ול-I-V/IR תקופתי.
- דוח בודק + תאריך → **תזכורת ל-5 שנים**; אישור חח"י; תיק מתקן as-made; אחריויות (תאריכי תפוגה → תזכורות).
- צילום תרמי baseline (אם בוצע) + תמונות אתר.

**ניטור ו-SLA**
- תפוקה צפויה חודשית (PVGIS/pvlib) לאתר → `expected_kwh[month]`; PR תכנוני; ספי התראה; tier חוזה תחזוקה; אנשי קשר להתראות (לקוח/טכנאי); חלונות "שקט" (ניקוי/עבודות).

---

## 6. חוזי תחזוקה ו-KPI

### 6.1 הגדרות KPI (לפי IEC 61724-1:2021 — נוסחאות ידועות; הטקסט הרשמי לא היה נגיש)
- **Specific yield** `Y_f = E_AC / P_STC` [kWh/kWp] (יום/חודש/שנה).
- **Reference yield** `Y_r = H_POA / G_STC` (H_POA = קרינה במישור המערך [kWh/m²], G_STC = 1 kW/m²).
- **Performance Ratio** `PR = Y_f / Y_r = E_AC / (P_STC × H_POA / G_STC)`. בלי פירנומטר באתר — H_POA מ-satellite (PVGIS-SARAH/Solargis/Solcast) או ממירים "עמיתים" בקרבת מקום (peer-PR).
- **PR מתוקן טמפרטורה** (IEC 61724-1 ed.2): המכנה מוכפל ב-`[1 + γ·(T_cell − 25)]` כשה-γ = מקדם טמפרטורה של ההספק; T_cell ממודל (pvlib: `faiman` עם ברירת מחדל u0=25, u1=6.84 — **כויל במדבר הנגב**, מתאים לישראל; `sapm_cell`, `pvsyst_cell`).
- **Energy Performance Index** `EPI = E_actual / E_expected(model)` — ה-expected ממודל (pvlib ModelChain על PVGIS hourly / TMY). זה ה-KPI הפרקטי ביותר לאתר בלי חיישנים: משווים לתפוקה מדומה באותו מזג אוויר (ERA5/SARAH3 עם lag ימים) או לממוצע חודשי PVGIS (לטווח ארוך).
- **Availability (זמן)** `A_t = (שעות אור − שעות downtime) / שעות אור`; **Availability (אנרגיה)** `A_e = 1 − E_lost / E_expected`. ב-184 אתרים — availability חודשי לכל אתר + משוקלל kWp.
- **Capacity factor** `CF = E / (P_AC × 8760)`.
- **Peer ratio**: `Y_f(site) / median(Y_f(neighbours within ~20 km, same tilt class))` — זול, חזק ל-184 אתרים בישראל (אקלים אחיד יחסית).
- KPI תפעוליים: MTTA (זמן לאישור התראה), MTTR, אחוז התראות false-positive, downtime לכל אתר/יצרן, soiling loss (ירידת Y_f מאז ניקוי אחרון), degradation (Y_f שנתי מנורמל).

### 6.2 טקסונומיית התראות (מוצע; מבוסס על מה שה-APIs נותנים)
| משפחה | מקור | כלל |
|---|---|---|
| Comms loss ("אתר חשוך") | כל vendor: `lastUpdateTime` / no data | אין נתונים > 2× latency צפוי בשעות אור; FusionSolar: `failCode` לא 0; SolarEdge V2: `activationStatus`/`lastUpdateTime` |
| Zero/low production בשעות אור | power series | P < 2% P_STC כש-sun elevation > 15° ל-> 60 דק' (לנרמל לעננות via peers) |
| Inverter fault / alarm | SolarEdge V2 `/alerts` (`category`, `impact`, `component.serialNumber`), Huawei `getAlarmList`, Solis `alarmList`, Solarman `alertList`, Enphase `open_alarms` | map ל-severity אחיד |
| Underperformance | EPI / peer ratio | יומי < 0.8 ל-3 ימים או חודשי < 0.9 |
| String/MPPT imbalance | SolarEdge inverter telemetry/optimizers; SunSpec 160; Sungrow MPPT points; Huawei `getDevRealKpi` pv1_u/pv1_i… | string נמוך > 15% מהממוצע באותו ממיר, בהספק > 30% |
| Insulation / Riso | Sungrow "Insulation impedance to ground", Huawei/SolarEdge fault codes | סף לפי יצרן |
| Grid / curtailment | Sungrow "Ripple control state", feed-in limitation points; SolarEdge power-control | אירועי הגבלה → לא לספור כ-underperformance |
| Meter mismatch | ייצור ממיר vs. `backStream` של חח"י (סעיף 7) | פער > 5% חודשי → בעיית מונה/חיווט/חיוב |
| Warranty/inspection due | CRM | 60/30 יום לפני פקיעת אחריות ממיר; 5 שנים מבדיקת בודק |

### 6.3 SLA / tiers ותמחור (ישראל) — **ממצאים חלקיים**
- ניקוי: מינימום 400–600 ₪ לקריאה; מסחרי 6–8 ₪/kW + מע"מ; 2–4 פעמים בשנה לפי אזור/אבק; חוזה שנתי מקנה 10–20% הנחה על ניקוי [תקצירי חיפוש: cleaning-solar.co.il, midrag]. בדיקה תרמית/IR מוצעת כתוספת.
- מבנה מוצע (פרקטיקה ענפית; לתמחר לפי עלויות BEE):
  - **Basic (ניטור)**: ניטור מרחוק + התראות, דוח חודשי, ביקור תקלה בתשלום. תמחור ₪/kWp/שנה (benchmark אירופי לניטור בלבד ≈ €0.2/kWp/שנה Solytic).
  - **Standard (תחזוקה שנתית)**: Basic + ביקור מונע שנתי (IEC 62446-1 קט' 1 חלקי: חזותי, הידוק, Riso, Voc, בדיקת הגנות/SPD, ניקוי מסננים/מאווררים), ניקוי ×1–2, זמן תגובה 2–3 ימי עבודה.
  - **Premium (מסחרי)**: Standard + IR תרמי שנתי, I-V לדגימת strings, ניקוי ×3–4, תגובה 24 ש' לתקלה קריטית (אתר חשוך), ערבות availability (למשל 97%) ו/או PR-floor עם פיצוי.
  - **רגולטורי**: ניהול בדיקת בודק כל 5 שנים (הזמנה, ליווי, תיוק).
- **לא נמצאו** נתוני מחיר ישראליים לחוזי O&M מלאים (₪/kWp/שנה) — ראו "לא אומת".

### 6.4 כלים פתוחים
- **pvlib** (`pvlib.iotools.get_pvgis_hourly(lat, lon, surface_tilt, surface_azimuth, pvcalculation=True, peakpower, loss)` → עמודות `P`, `G(i)`, `T2m`; `get_pvgis_tmy`, `get_pvgis_horizon`; base `https://re.jrc.ec.europa.eu/api/`), `pvlib.temperature.faiman`, ModelChain. ל-TypeScript: לקרוא ל-PVGIS ישירות (REST, JSON) ולחשב expected חודשי/שעתי; מגבלת קצב PVGIS **לא אומתה** (האתר חסום).
- **pvanalytics** (https://github.com/pvlib/pvanalytics): quality checks (gaps, stuck values, outliers, time shifts), clipping detection, clear-sky detection, זיהוי orientation/nameplate מהנתונים — שימושי לניקוי נתוני vendor לפני KPI.

---

## 7. נתוני חברת החשמל אחרי החיבור

**אין API רשמי/ציבורי של חח"י.** יש API לא-רשמי שה-"אזור האישי" והאפליקציה משתמשים בו, ממופה ב-https://github.com/GuyKh/py-iec-api [קוד קהילתי; כל הפרטים להלן משם]:
- Base: `https://iecapi.iec.co.il/api/`; headers `x-iec-idt: 1`, `x-iec-webview: 1`; אימות: `Authentication/{id}/1/-1` עם **ת"ז + OTP (SMS/אימייל, דרך Okta)** → JWT (id_token) + refresh. **המשמעות: גישה רק בזהות הלקוח** (או דרך "חשבון משותף" — ראו למטה). אין client-credentials לעסק.
- Endpoints רלוונטיים:
  - `GET customer`, `GET customer/contract/{bp_number}` → חוזים (`contractNumber`), `GET Device/{contract_id}` → מונים (`deviceNumber`, `deviceCode`, `isElectronic`, `connectionSize{size,phase,representativeConnectionSize:"3X20"}`), `GET Device/LastMeterReading/{contract}/{bp}`.
  - **`POST Consumption/RemoteReadingRange/{contract_id}`** body `{contractNumber, lastInvoiceDate, fromDate, resolution: 1|2|3 (DAILY/WEEKLY/MONTHLY), smartMetersList:[{meterKind:"Consumption", meterCode, meterSerial}]}` → `meterList[].periodConsumptions[{interval, consumption, backStream, status}]`, `totalImport`, **`totalExport`**, `totalBackStreamForPeriod`, `futureConsumptionInfo{futureConsumption, futureBackStream, multiplierFactor}`, `taozList[{interval, taoz}]` (תעו"ז). **`backStream` = זרימה חוזרת לרשת = ייצוא ה-PV** — זה הנתון שמאפשר reconcile ייצור מול חח"י ובדיקת חיוב (net metering / אסדרת ייצור מבוזר).
  - **`POST Consumption/SendConsumptionReportToMail/{contract_id}`** `{emailAddress, meterCode, meterSerial}` → שולח למייל קובץ Excel של צריכה **רבעי-שעה לשנה האחרונה** (לפי תיאור האזור האישי בתקציר חיפוש; ה-API עצמו מחזיר רק true). זה המסלול היחיד שנמצא ל-15 דק'; ה-REST מחזיר יומי/שבועי/חודשי בלבד (ו-israel-utility-exporter: "IEC's API has no hourly breakdown").
  - חשבוניות: `ElectricBillsDrawers/ElectricBills/{contract}/{bp}`, `BillingCollection/invoices/...`, `BillingCollection/pdf`; תעריפים: `content/he-IL/content/tariffs/...` (kWh, distribution, delivery, kVA); `calculator/touz/{contract}/{bp}/compatible` (התאמה לתעו"ז).
  - **שיתוף חוזה**: `masa-mainportalapi.iec.co.il/api/connectionbetweencontactandcontract/createconnectionrequest` + `contacts/{profile}/contract/{contract}` (ניהול "חשבונות משותפים"). **השערה**: הלקוח יכול להזמין איש קשר (למשל נציג BEE) לחוזה שלו, ואז BEE רואה את הנתונים בזהותו שלו — **לאמת בפורטל**.
  - תקלות/הפסקות: `outages/accounts`, `outages/transactions/{account}/2`, פורטל תקלות `masa-faultsportalapi.iec.co.il`.
- **מגבלות**: נתונים מתעדכנים באיחור **1–2 ימים** (לא עקבי); OTP ידני ⇒ אוטומציה דורשת שמירת refresh token לכל לקוח (הסכמה כתובה!); API לא רשמי — עלול להשתנות; מונה "טיפש" נותן רק קריאות/חשבוניות.
- **ייצוא/הגבלת ייצור (ripple control / curtailment) של חח"י**: לא נמצא מקור בתקציב הזמן. בצד הממיר קיים "Ripple control state" (Sungrow) ו-feed-in limitation points — אפשר לרשום אירועים משם.
- מונים חכמים: פריסה ארצית (Landis+Gyr, 2023 — כתבה חסומה); איתור מונה חכם לפי כתובת: chashmalink.com/findmone [תקציר חיפוש].

---

## 8. המלצות תכנון קצרות (גזירה מהממצאים)
1. **Scheduler גלובלי לפי vendor-budget**: טבלת `vendor_quota` (SolarEdge v1: 300/יום/token ו-300/יום/site; V2: credits/חודש + per-minute; Solis: 3/5 ש'/IP; Huawei: 1/דקה/endpoint; Sungrow: 5-דק' refresh). ה-credit ledger של V2 צריך להבחין 429-monthly (עצור עד חודש הבא) מול 429-minute (`Retry-After`).
2. **טבלת `site_vendor_binding`** עם `sharing_status` + תאריך; "not in account list" ב-Sungrow = binding לא הושלם → משימה ב-CRM ללקוח/טכנאי, לא רק שגיאת API.
3. **Handover = commissioning record מובנה** (Voc/Isc/Riso per string, SN per device, תאריך בודק) — זה ה-baseline ל-KPI ולתזכורת 5 השנים.
4. **Expected yield**: PVGIS hourly/TMY לכל אתר פעם אחת (cache) + Faiman cell-temp → EPI יומי; peer-ratio בין אתרים סמוכים כ-signal שני.
5. **KStar/GoodWe/SAJ**: לא לבנות על ענן; לתכנן לוגר Modbus (SunSpec 103+160) או לוגר Solarman 8899 עם קושחה ישנה.
6. **חח"י**: להוסיף ב-handover הסכמת לקוח + OTP flow חד-פעמי לשמירת refresh token (או שיתוף חוזה לאיש קשר BEE); להשתמש ב-`backStream` ל-reconcile חודשי ולבדיקת חשבון.

---

## 9. לא אומת / פערים (לחיפוש המשך)
- **SolarEdge V2**: המספרים המדויקים של ה-tiers (Free/Business Starter/Growth/Pro/Enterprise — קרדיטים לחודש, קריאות לדקה, מחיר); האם כל endpoint באמת 1 קרדיט; שמות השדות המלאים של `/alerts` ו-`/inverters/telemetry`; האם `X-Account-Key` עדיין נדרש; תיעוד migration v1→v2. (developer.solaredge.com / api-docs.solaredge.com חסומים.)
- **SolarEdge v1**: אימות ישיר של ה-PDF הרשמי (knowledge-center חסום); port Modbus TCP 1502 (ממקור זיכרון).
- **Huawei**: מגבלות תדירות לכל interface, מקסימום stations/devices לקריאה, תוקף token, רשימת `getAlarmList`/`getDevHistoryKpi` ופרמטריהם (support.huawei.com חסום).
- **Sungrow**: מגבלות קצב רשמיות; איזה gateway לישראל; הטקסט המדויק של שגיאת "not in account list" וסיבתה; ערך `sys_code`; תהליך השיתוף במסך ה-OpenAPI ("Power Station Sharing") — אומת רק מתקצירים.
- **Solarman/Deye**: paths של station/device endpoints — מתקציר של PDF, לא מקוד; Deye Cloud developer docs.
- **SAJ Elekeeper Open Platform**, **KStar Cloud/kSolar API**, **SMA Monitoring API** (מחיר, scopes, consent flow), **Fronius Solar.web Query API** (מחיר Premium), **Tigo EI Premium** (מחיר, מגבלות v4), **PVOutput** מגבלות.
- **אגרגטורים**: SolarFusion/SolarGraf, PowerHub, Enact, Pecan, Open Energy Monitor, AlsoEnergy מחירון, Solytic API pricing — לא נחקרו/חסומים.
- **טלמטריה מקומית**: Teltonika RUT (VPN/Modbus gateway/MQTT), Solar-Log ו-blue'Log מחירי רישיונות, השוואת עלות לוגר מול API (pv-magazine "cost trap") — חסומים.
- **IEC 62446-1**: ספי Riso, סבולות Voc/Isc, רשימת סעיף התיעוד המדויקת (iteh/CSA חסומים).
- **ישראל**: הנוסח המחייב של דרישת בדיקה תקופתית (תקנות החשמל / אמות מידה / רשות החשמל) — "אחת ל-5 שנים" מקורו במדריך אתר, לא ברגולציה; ת"י 579 חלקים רלוונטיים; דרישות מבטחים (IR תקופתי?); טפסי "טופס מסירה"/"תיק מתקן" סטנדרטיים; מחירי חוזי O&M ₪/kWp; תהליך curtailment/ripple-control של חח"י ואמות מידה לייצור מבוזר; מבנה חשבון חח"י עם ייצור (קיזוז/תעריף).
- **חח"י API**: האם `SendConsumptionReportToMail` באמת נותן 15 דק' (מתקציר); האם שיתוף חוזה לאיש קשר חיצוני נותן גישת API; מדיניות שימוש.

---

## 10. קישורים
**SolarEdge**: https://developer.solaredge.com/ · https://api-docs.solaredge.com/ · https://knowledge-center.solaredge.com/sites/kc/files/se_monitoring_api.pdf · https://github.com/trooperthorn/ha_int_solaredge · https://github.com/talbronfer/monitoring-v2-api-demo · https://github.com/api-evangelist/solar-edge · https://github.com/home-assistant/core/tree/dev/homeassistant/components/solaredge · https://knowledge-center.solaredge.com/sites/kc/files/sunspec-implementation-technical-note.pdf
**Huawei**: https://github.com/tijsverkoyen/HomeAssistant-FusionSolar · https://github.com/tijsverkoyen/HomeAssistant-FusionSolar/issues/68 · https://support.huawei.com/enterprise/en/doc/EDOC1100261860/d4ee355a/v6-interface-reference · https://solytic.com/knowledge/set-up-api-access-huawei-fusionsolar-api/
**Sungrow**: https://developer-api.isolarcloud.com/ · https://github.com/bugjam/pysolarcloud · https://github.com/Afrouper/sungrow-api-client · https://github.com/mkaiser/Sungrow-SHx-Inverter-Modbus-Home-Assistant/wiki/FAQ:-iSolarCloud-installer-account · https://service.sungrowpower.com.au/files/Web_Files/FAQ/GD_201910_Sharing%20Solar%20Plants%20on%20iSolarCloud_V1.0.pdf · https://github.com/jordauld1/InkyPi-iSolarCloud
**GoodWe**: https://github.com/TimSoethout/goodwe-sems-home-assistant (api_examples/openapi.yaml) · https://github.com/WestLabsAI/goodwe-sems-home-assistant
**SAJ**: https://github.com/vegaquark/ha-esolar_2025 · https://github.com/lsoriamo/ha-esolar · https://community.home-assistant.io/t/new-open-api-for-saj-power-systems/959311
**Deye/Solarman**: https://helpcenter.solarmanpv.com/portal/en/kb/articles/i-want-to-open-api-how-can-i-open-api · https://forum.iobroker.net/assets/uploads/files/1643107275278-solarmanopenapi-v1.1.7-en.pdf · https://github.com/Ahmad-Qadir/deye-cloud-api · https://github.com/Hypfer/deye-microinverter-cloud-free · https://github.com/StephanJoubert/home_assistant_solarman · https://www.deyeinverter.com/news/company-news/deye-cloud-account-transfer.html
**Growatt**: https://github.com/indykoning/PyPi_GrowattServer/blob/master/docs/openapiv1.md · https://www.showdoc.com.cn/262556420217021/0 · https://github.com/api-evangelist/growatt
**KStar**: https://github.com/ppumkin/kstar.sharp · https://github.com/StephanJoubert/home_assistant_solarman/discussions/543
**Fronius**: https://github.com/grawlinson/fronius-docs · https://www.fronius.com/en-au/australia/solar-energy/installers-partners/technical-data/all-products/system-monitoring/open-interfaces/fronius-solar-api-json-
**SMA**: https://developer.sma.de/sma-apis · https://developer.sma.de/sma-sandbox-apis · https://developer.sma.de/api-access-control
**Enphase**: https://developer-v4.enphase.com/developer-plans · https://github.com/api-evangelist/enphase · https://solytic.com/knowledge/set-up-api-access-enphase-enlighten-partner-api/
**Tigo**: https://support.tigoenergy.com/hc/en-us/articles/200863027-How-To-use-the-Tigo-Energy-API · https://github.com/Bobsilvio/tigosolar-online
**Solis**: https://github.com/hultenvp/soliscloud_api · https://oss.soliscloud.com/templet/SolisCloud%20Platform%20API%20Document%20V2.0.pdf · https://developer.soliscloud.com/guide/data-access-user.html
**אגרגטורים**: https://solytic.com/comparisons/pv-monitoring-software-comparison/ · https://developer.solytic.com/docs/getting-started/access-control/pricing · https://www.meteocontrol.com/en/photovoltaic-monitoring/products/vcom-cloud/vcom-api · https://meteocontrol.com/fileadmin/Daten/Dokumente/EN/1_Photovoltaik_Monitoring/1_Produkte/blue_Log_XM_XC/Other/Compatibility_list_blueLog_XM_XC.pdf · https://api-docs.solaranalytics.com/OpenAPI-Specs/sapublic-openapi.yaml · https://pvoutput.org/help/api_specification.html · https://www.solar-log.com/en/products-solutions/licenses
**SunSpec/מקומי**: https://github.com/sunspec/models · https://github.com/tjko/sunspec-monitor
**תקנים/KPI**: https://standards.iteh.ai/catalog/standards/iec/3f2bcff-b79d-40c8-b45f-c189131eb414/iec-62446-1-2016 · https://www.csagroup.org/store/product/iec_024057/ · https://kb.solargis.com/docs/pv-performance-indicators · https://github.com/pvlib/pvlib-python/blob/main/pvlib/iotools/pvgis.py · https://github.com/pvlib/pvanalytics
**ישראל**: https://www.sii.org.il/he/solar-testing · https://www.shoresh.org.il/spages/articles/a%20guide%20for%20solar%20system%20on%20the%20roof.htm · https://www.midrag.co.il/Content/Tip/17382 · https://cleaning-solar.co.il/%D7%9E%D7%97%D7%99%D7%A8-%D7%A0%D7%99%D7%A7%D7%95%D7%99-%D7%A4%D7%90%D7%A0%D7%9C%D7%99%D7%9D-%D7%A1%D7%95%D7%9C%D7%90%D7%A8%D7%99%D7%99%D7%9D/ · https://golansolar.co.il/ · https://kedmasolar.com/maintenance/
**חח"י**: https://github.com/GuyKh/py-iec-api · https://github.com/GuyKh/iec-custom-component · https://github.com/Aransh/israel-utility-exporter · https://www.chashmalink.com/findmone
