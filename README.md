# Home Assistant Manual Ventilation Card (`custom:ventilation-card`)

A Home Assistant Lovelace card that shows the climate of each room next to the outdoor air and tells you, by colour, whether to **ventilate, air out briefly, wait, heat or close the window**.

There are no modes. You set a desired temperature (per card, optionally per room) and a humidity ceiling; the same rules then do the right thing in every season:

- **Winter** – keeps humidity in check with short airings.
- **Summer** – cools rooms when it is cooler outside, and tells you to wait when it is not yet.
- **Spring / autumn** – warms rooms with outdoor air when that is warmer than inside.

## What the card shows

Every row always shows **temperature, relative humidity and absolute humidity**; the first row is the outdoor air, so every room can be compared with it directly.

| Element | Meaning |
|---|---|
| Coloured left edge + dot | The advice (see below) |
| `→ 21°` under the temperature | The room's desired temperature. The value turns orange when too warm, blue when too cool |
| `air → 43%` under the humidity | The relative humidity the outdoor air would have once inside at room temperature — i.e. what airing gets you |
| Window icon | State of the window sensor, if configured |

| Colour | Hint | When |
|---|---|---|
| 🟢 green | **Air out briefly** | Room is above the humidity ceiling and outdoor air is drier. A few minutes are enough, so no duration is shown |
| 🟢 green | **Ventilate to cool / warm up · until about HH:MM** | Outdoor air moves the room towards its desired temperature. The end time is when the target is reached or outdoor air stops helping |
| 🟡 amber | **Wait — ventilate from about HH:MM** | Nothing to gain now, but the forecast says outdoor air will help within 12 hours |
| 🟠 orange | **Heat** | Room is too cool and outdoor air will not help |
| 🔴 red | **Close the window** | The window is open and is working against you |
| ⚪ none | **All good** / keep closed | In range, or off target with no help from outside |

### Graphs

Click a room to open its graphs; any number of rooms can be open at once. The **Temp / RH / AH** buttons in the header choose which graphs are shown, in any combination. All graphs share one time axis (history ← now → forecast):

- **Temperature** – room and outdoor, the desired temperature, and two predictions: *if closed* and *if ventilated*.
- **Relative humidity** – room vs. *outdoor air at room temperature*, and the humidity ceiling. Whenever the outdoor line is below the room line, airing dries the room.
- **Absolute humidity** – room vs. outdoor in g/m³.

### Learning

The predictions use a simple thermal model per room, `dT/dt = k·(T_out − T_in) + gain[hour]`:

- `k` is how fast the room follows the outdoor temperature (its insulation), learned separately for hours with the window closed and open (if a window sensor is configured).
- `gain` is one value per hour of the day and captures everything with a daily rhythm: sun on the windows, the heating schedule, people at home.

Both are fitted to the last 14 days of hourly recorder statistics by comparing the same hour of day across days, so a sunny south-facing room and a shaded one get different predictions. This needs an outdoor temperature **sensor** with long-term statistics; until enough data exists, a generic model is used. The line under the graphs says which one is active.

## Configuration

```yaml
type: custom:ventilation-card
title: Ventilation
weather_entity: weather.home
outdoor_temperature: sensor.outdoor_temperature
outdoor_humidity: sensor.outdoor_humidity
target_temperature: 21
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
    target_temperature: 18
```

| Option | Type | Default | Description |
|---|---|---|---|
| `title` | string | `Ventilation Guide` | Card title |
| `target_temperature` | number | `21` | Desired room temperature (°C) |
| `max_humidity` | number | `60` | Relative humidity ceiling (%) |
| `weather_entity` | string | – | `weather.*` entity; provides the forecast (needed for *wait*, end times and predictions) and is the fallback for outdoor values |
| `outdoor_temperature` | string | – | Outdoor temperature sensor |
| `outdoor_humidity` | string | – | Outdoor humidity sensor |
| `history_hours` | number | `24` | Hours of history in the graphs |
| `forecast_hours` | number | `24` | Hours of forecast in the graphs |
| `rooms` | list | **required** | Rooms, see below |

| Room option | Type | Description |
|---|---|---|
| `name` | string | **Required.** Room name |
| `temperature` | string | **Required.** Temperature sensor |
| `humidity` | string | Humidity sensor |
| `window_sensor` | string | `binary_sensor` that is `on` when the window is open |
| `target_temperature` | number | Desired temperature for this room |
| `icon` | string | Icon |

### Upgrading from 1.x

Modes are gone. `goal`, `goal_entity`, the `*_temperature` mode limits, `min_humidity`, `ah_threshold`, the `show_*` switches, `insulation_factor`, `ventilation_speed` and the per-room `*_override` options are ignored and can be deleted. Set `target_temperature` instead.

## Installation & Development

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

### Development Mode (Running Alongside Production)
When developing, the dev server compiles the card under a separate tag (`custom:ventilation-card-dev`) to prevent conflicts with the production/HACS version on the same Home Assistant instance:
1. Start the dev server with hot-reload:
   ```bash
   npm start
   ```
2. In Home Assistant, add a Lovelace resource pointing to your dev machine:
   * **URL:** `http://<YOUR_IP>:5005/ventilation-card.js`
   * **Type:** `JavaScript Module`
3. Add cards to your test dashboard using `type: custom:ventilation-card-dev` (or choose **Ventilation Card (Dev)** from the card picker).


