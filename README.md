# Home Assistant Manual Ventilation Card (`custom:ventilation-card`)

A modern, high-performance **Home Assistant Custom Lovelace Card** that guides users on when and how to manually ventilate their rooms to cool them down, keep heat in, or regulate humidity.

---

## 📋 Table of Contents
1. [Overview](#overview)
2. [Physics & Absolute Humidity Specification](#physics--absolute-humidity-specification)
3. [Ventilation Goals & Modes Specification](#ventilation-goals--modes-specification)
4. [Sensor Resolution & Fallback Hierarchy](#sensor-resolution--fallback-hierarchy)
5. [Window Sensor Matrix](#window-sensor-matrix)
6. [24-Hour Forecast & Time Window Algorithm](#24-hour-forecast--time-window-algorithm)
7. [Diagnostics & System Health Badge](#diagnostics--system-health-badge)
8. [YAML Configuration Reference](#yaml-configuration-reference)
9. [Visual Editor Specification](#visual-editor-specification)
10. [Installation & Development](#installation--development)

---

## 1. Overview

Proper manual window ventilation requires comparing indoor and outdoor atmospheric conditions. Simply looking at relative humidity (%) can be misleading because warm air holds exponentially more moisture than cold air.

This card automatically calculates **Absolute Humidity ($g/m^3$)**, evaluates real-time temperatures, subscribes to **hourly weather forecasts**, and provides room-by-room ventilation advice alongside a **24-hour timeline bar**.

---

## 2. Physics & Absolute Humidity Specification

The card uses the **Magnus-Tetens formula** to compute saturation vapor pressure $E_s(T)$ and absolute humidity $AH(T, RH)$:

### Saturation Vapor Pressure $E_s(T)$
$$E_s(T) = 6.112 \times \exp\left(\frac{17.67 \times T}{T + 243.5}\right) \quad [\text{hPa}]$$

### Absolute Humidity $AH(T, RH)$
$$AH(T, RH) = \frac{E_s(T) \times RH \times 2.1674}{273.15 + T} \quad [\text{g/m}^3]$$

Where:
- $T$ = Air temperature in °C
- $RH$ = Relative humidity in % (0–100)
- $AH$ = Absolute humidity in grams of water per cubic meter of air ($g/m^3$)

### Why Absolute Humidity is Essential
If indoor air is 22°C at 60% RH ($AH \approx 11.6 \text{ g/m}^3$) and outdoor air is 30°C at 50% RH ($AH \approx 15.2 \text{ g/m}^3$), opening the window will **increase** indoor moisture even though outdoor relative humidity (50%) appears lower than indoor (60%). The card prevents this error.

---

## 3. Ventilation Goals & Modes Specification

The card supports 4 distinct ventilation goals configured via `goal`:

### 1. `cooling` (Summer Mode)
- **Objective:** Cool room temperatures down using cooler outdoor air.
- **Logic:**
  - `T_indoor - T_outdoor > 1.5°C` $\rightarrow$ 🟢 **Open windows!** (*Draussen X.X°C kühler*)
  - `0 < T_indoor - T_outdoor <= 1.5°C` $\rightarrow$ 🟡 **Borderline** (*Geringer Temperaturunterschied*)
  - `T_outdoor >= T_indoor` $\rightarrow$ 🔴 **Keep closed** (*Draussen wärmer*)

### 2. `warming` (Winter Mode)
- **Objective:** Retain indoor heat while allowing brief ventilation to lower excessive humidity.
- **Logic:**
  - `AH_indoor - AH_outdoor > ah_threshold` AND `T_outdoor >= T_indoor` $\rightarrow$ 🟢 **Open windows!**
  - `AH_indoor - AH_outdoor > ah_threshold` AND `T_outdoor < T_indoor` $\rightarrow$ 🟡 **Borderline** (*Lüften entfeuchtet, kühlt aber den Raum ab*)
  - Otherwise $\rightarrow$ 🔴 **Keep closed** (*Würde den Raum auskühlen*)

### 3. `humidity` (Moisture Regulation)
- **Objective:** Reduce indoor humidity regardless of temperature.
- **Logic:**
  - `AH_indoor - AH_outdoor > ah_threshold` $\rightarrow$ 🟢 **Open windows!** (*Trockenere Luft draussen*)
  - `0 < AH_indoor - AH_outdoor <= ah_threshold` $\rightarrow$ 🟡 **Borderline**
  - `AH_outdoor >= AH_indoor` $\rightarrow$ 🔴 **Keep closed** (*Aussenluft ist feuchter*)

### 4. `balanced` (Combined Mode — Recommended)
- **Objective:** Primary temperature cooling when room exceeds `balanced_max_temperature`; secondary humidity regulation.
- **Logic:**
  - **Priority 1 (Overheating):** If `T_indoor > balanced_max_temperature` AND `T_outdoor < T_indoor` $\rightarrow$ 🟢 **Open windows!**
  - **Priority 2 (High Moisture):** If `AH_indoor - AH_outdoor > ah_threshold` $\rightarrow$ 🟢 **Open windows!**
  - **Priority 3 (Cooling Caution):** If `T_outdoor < T_indoor - 1.5°C` AND `T_indoor > balanced_max_temperature - 2°C` $\rightarrow$ 🟡 **Borderline**
  - **Otherwise:** $\rightarrow$ 🔴 **Keep closed**

---

## 4. Sensor Resolution & Fallback Hierarchy

To determine outdoor temperature and humidity for a given room, the card resolves data in the following strict order:

```
[1. Room Outdoor Override] (outdoor_temperature_override / outdoor_humidity_override)
         │ (if not specified)
         ▼
[2. Global Outdoor Sensor] (outdoor_temperature / outdoor_humidity)
         │ (if not specified)
         ▼
[3. Weather Entity State] (weather_entity.attributes.temperature / humidity)
```

---

## 5. Window Sensor Matrix

If a `window_sensor` (`binary_sensor` or contact sensor) is configured for a room, the card renders a status badge comparing window position to the current recommendation:

| Recommendation | Window State | Badge Display | Meaning |
|---|---|---|---|
| 🟢 **Open windows!** | Open (`on`) | 🟢 **Open ✓** | Correct position |
| 🟢 **Open windows!** | Closed (`off`) | 🔴 **Closed ✗** | **Action needed!** Open window now |
| 🔴 **Keep closed** | Open (`on`) | 🔴 **Open ✗** | **Action needed!** Close window now |
| 🔴 **Keep closed** | Closed (`off`) | 🟢 **Closed ✓** | Correct position |
| 🟡 **Borderline** | Open / Closed | ⚪ **Open / Closed** | Neutral |

If no window sensor is assigned to a room, no badge is rendered.

---

## 6. 24-Hour Forecast & Time Window Algorithm

The card subscribes to the weather entity's hourly forecast using `weather/subscribe_forecast` via WebSockets.

### Timeline & Window Calculation per Room:
1. Takes the upcoming 24 hourly forecast entries $(T_{fc}, RH_{fc})$.
2. Evaluates the room's indoor conditions against each hour's outdoor forecast.
3. Computes:
   - **`ventilateUntil`** (HH:MM): The approximate time when outdoor conditions will no longer be favorable.
   - **`ventilateFrom`** (HH:MM): The upcoming hour when outdoor conditions will become favorable (e.g. evening cool down at 21:00).
   - **24-Slot Visual Timeline Bar:** 24 green/red horizontal segments depicting the day's ventilation windows.

---

## 7. Diagnostics & System Health Badge

If any sensor is unavailable, unknown, or misconfigured, the card displays a **Top-Right Warning Badge** (`⚠️ N issues`) in the card header:

- Clicking the badge toggles the **Diagnostics Banner** listing all current issues:
  - Missing/unavailable outdoor sensors
  - Missing/unavailable room sensors
  - Weather entity forecast errors
- If any critical error occurs during rendering, an error boundary renders a clean Home Assistant error card showing the exact message instead of crashing.

---

## 8. YAML Configuration Reference

### Full Configuration Example

```yaml
type: custom:ventilation-card
title: Ventilation Assistant
weather_entity: weather.home
outdoor_temperature: sensor.outdoor_temperature
outdoor_humidity: sensor.outdoor_humidity
goal: balanced
balanced_max_temperature: 23.5
ah_threshold: 2.0
min_humidity: 40
max_humidity: 60
rooms:
  - name: Living Room
    icon: mdi:sofa
    temperature: sensor.living_room_temperature
    humidity: sensor.living_room_humidity
    window_sensor: binary_sensor.living_room_window
  - name: Bedroom
    icon: mdi:bed
    temperature: sensor.bedroom_temperature
    humidity: sensor.bedroom_humidity
    window_sensor: binary_sensor.bedroom_window
  - name: Kitchen (Balcony)
    icon: mdi:stove
    temperature: sensor.kitchen_temperature
    humidity: sensor.kitchen_humidity
    outdoor_temperature_override: sensor.balcony_temperature
    outdoor_humidity_override: sensor.balcony_humidity
    max_temperature_override: 22.0
```

### Options Reference

| Option | Type | Required | Default | Description |
|---|---|---|---|---|
| `type` | string | **Yes** | `custom:ventilation-card` | Card identifier |
| `title` | string | No | `Ventilation Guide` | Card header title |
| `goal` | string | No | `cooling` | `cooling`, `warming`, `humidity`, `balanced` |
| `weather_entity` | string | No | `undefined` | `weather.*` entity for 24h forecast |
| `outdoor_temperature` | string | No | `undefined` | Global outdoor temperature sensor |
| `outdoor_humidity` | string | No | `undefined` | Global outdoor humidity sensor |
| `balanced_max_temperature` | number | No | `24` | Target temperature threshold for `balanced` goal |
| `ah_threshold` | number | No | `2.0` | Absolute humidity threshold ($g/m^3$) |
| `show_absolute_humidity` | boolean | No | `true` | Display absolute humidity ($g/m^3$) |
| `show_forecast` | boolean | No | `true` | Display forecast summary chips |
| `show_history` | boolean | No | `false` | Display sensor history in graph |
| `show_humidity_slots` | boolean | No | `false` | Display upcoming humidity slot table in expanded details |
| `show_next_state_change` | boolean | No | `true` | Show time to next open/closed state change |
| `rooms` | array | **Yes** | `[]` | List of room configuration objects |

---

## 9. Visual Editor Specification

The card includes a custom visual editor (`ventilation-card-editor`) featuring:
- **General Accordion:** Title, Goal dropdown, Max Temperature slider, Humidity limits.
- **Outdoor Sensors Accordion:** Weather entity picker, Outdoor temp & humidity entity pickers.
- **Rooms Accordion:** Dynamic list with Add/Remove buttons, icon picker, entity pickers, and collapsible per-room override settings.

---

## 10. Installation & Development

### Method 1: Via HACS (Recommended)
1. In Home Assistant, navigate to **HACS** → **Frontend**.
2. Click the three dots (⋮) in the top-right corner and choose **Custom repositories**.
3. Add the repository URL, select **Dashboard** (or **Lovelace**) as category, and click **Add**.
4. Click **Download** on the card repository.
5. Add `type: custom:ventilation-card` to your dashboard.

### Method 2: Manual Installation
1. Build the production bundle:
   ```bash
   npm install
   npm run build
   ```
2. Copy `dist/ventilation-card.js` into your Home Assistant `config/www/` directory.
3. In Home Assistant, go to **Settings** → **Dashboards** → **Resources** (top-right menu).
4. Add `/local/ventilation-card.js` as a **JavaScript Module**.
5. Add the card to any dashboard using `type: custom:ventilation-card`.

### Development Mode
```bash
# Start dev server with hot-reload (port 5005)
npm start
```

