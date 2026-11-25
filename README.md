# HeatDial

[Русский](README.ru.md)

HeatDial recommends when to adjust a manually operated boiler. It reads temperatures and the recorded dial position, then suggests holding, raising or lowering the dial.

## Installation

In Home Assistant, go to **Settings → Marketplace → Add from link**, enter `xatang/HeatDial`, and install the integration. Restart Home Assistant if prompted, then add **HeatDial** under **Settings → Devices & services**. Requires Home Assistant 2026.11 or later.

## Setup

- Select an existing numeric helper for the actual dial position. Update this helper when you turn the physical dial.
- Select a local outdoor thermometer and, if available, a weather entity with an hourly forecast.
- Add room sensors in the **Settings** tab. A weight of 1 gives the standard response, values below 1 need longer cooling, and values above 1 respond sooner. A weight of 0 displays the room and excludes it from decisions.
- Set the day and night comfort limits, reduction hours, and evening check hours. Each row in the dial scale adds a usable position. Water temperatures can be approximate or left blank. HeatDial recommends one physical step at a time.
- Leave **Shadow mode** enabled while comparing the advice with observed temperatures. The default is on.

Place room thermometers at comparable heights, away from radiators, direct sunlight, and drafts. Choose comfort limits and operating hours that suit your household.

## What a recommendation means

HeatDial watches for persistent room cooling and warming. A step has to remain indicated for 20 minutes before it appears as an adjustment. A sharp isolated room drop pauses advice to allow for ventilation. After a recorded dial change HeatDial waits three hours for the rooms to respond. During the evening check, outdoor cooling and sustained forecast conditions can trigger a recommendation ahead of overnight room cooling. HeatDial anchors near-term forecast temperatures to the outdoor thermometer and uses multiple hourly values to discount isolated spikes. Its overnight advice indicates risk and does not estimate the precise room temperature at dawn.

HeatDial reads up to five hours of existing Recorder history at setup, including for newly selected sensors. When less than 30 minutes of usable primary room readings are available, it collects the missing history first. If an important room sensor goes stale, HeatDial waits for fresh data. Missing forecast data still allows assessment from local readings. Reduction also needs fresh outdoor data. Pending conditions use continuous samples and start over after a data gap.

## HeatDial page

Open **HeatDial** from the Home Assistant sidebar or from **Settings → Devices & services → Integrations → HeatDial**. The page ships with the integration and uses your Home Assistant profile language (English or Russian).

- **Overview** shows the recorded dial position, the advice, the room temperatures and the weather outlook used in the decision.
- **History** charts room temperatures and dial positions for the last 24 hours or three days.
- **Settings** changes the comfort range, schedule, data sources, dial scale and shadow mode.

You can also add these entities to an existing dashboard:

- `sensor.heatdial_recommendation` holds the action and evidence. Room and outdoor values in its attributes are in Celsius.
- `sensor.heatdial_recommended_dial` displays the position to keep or move to.
- `sensor.heatdial_reason` exposes the translated reason for the current advice.

To send phone notifications, use the **Event received** trigger for `event.heatdial_adjustment` and add your mobile app notification action. The event attributes include `event_type`, `from_dial`, `to_dial`, `reason` and, when relevant, `room`. HeatDial publishes this event only after the recommendation persists for 20 minutes, within the configured notification hours. It allows at least three hours between events and eight hours before repeating the same unacknowledged suggestion. Disable Shadow mode to enable event delivery.

## Development

Run the policy regression tests with `python -B -m unittest discover -s tests -v`. They run without Home Assistant. The first release uses explicit comfort and trend rules. The limits and forecast handling are designed to be evaluated against observed room temperatures and manual adjustments.
