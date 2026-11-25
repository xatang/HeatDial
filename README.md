# HeatDial

HeatDial recommends when to adjust a manually operated boiler. It reads temperatures and the recorded dial position, then suggests holding, raising or lowering the dial. It runs independently of HeatCast and requires no boiler connection.

## Installation

In Home Assistant, go to **Settings → Marketplace → Add from link**, enter `xatang/HeatDial`, and install the integration. Restart Home Assistant if prompted, then add **HeatDial** under **Settings → Devices & services**. Requires Home Assistant 2026.11 or later.

## Setup

- Select an existing numeric helper for the actual dial position. Update this helper when you turn the physical dial.
- Select a local outdoor thermometer and, if available, a weather entity with an hourly forecast.
- Select the main rooms that should drive the heating advice. Additional rooms can call for heat after sustained cooling, provided the house still has room to warm up. Leave rooms with significant local heat gains out of both groups.
- Set the day and night comfort limits, reduction hours, and evening check hours. Start with only measured dial positions. HeatDial recommends one physical step at a time.
- Leave **Shadow mode** enabled while comparing the advice with observed temperatures. The default is on.

Place room thermometers at comparable heights, away from radiators, direct sunlight, and drafts. Choose comfort limits and operating hours that suit your household.

## What a recommendation means

HeatDial watches for persistent room cooling and warming. A step has to remain indicated for 20 minutes before it appears as an adjustment. A sharp isolated room drop pauses advice to allow for ventilation. After a recorded dial change HeatDial waits three hours for the rooms to respond. During the evening check, outdoor cooling and sustained forecast conditions can trigger a recommendation ahead of overnight room cooling. HeatDial anchors near-term forecast temperatures to the outdoor thermometer and uses multiple hourly values to discount isolated spikes. Its overnight advice indicates risk and does not estimate the precise room temperature at dawn.

If an important room sensor goes stale, HeatDial waits for fresh data. Missing forecast data still allows assessment from local readings. Reduction also needs fresh outdoor data. Pending conditions use continuous samples and start over after a data gap.

Add these entities to an existing dashboard:

- `sensor.heatdial_recommendation` holds the action and evidence. Room and outdoor values in its attributes are in Celsius.
- `sensor.heatdial_recommended_dial` displays the position to keep or move to.
- `sensor.heatdial_reason` exposes the translated reason for the current advice.

To send phone notifications, use the **Event received** trigger for `event.heatdial_adjustment` and add your mobile app notification action. The event attributes include `event_type`, `from_dial`, `to_dial`, `reason` and, when relevant, `room`. HeatDial publishes this event only after the recommendation persists for 20 minutes, within the configured notification hours. It allows at least three hours between events and eight hours before repeating the same unacknowledged suggestion. Disable Shadow mode to enable event delivery.

When migrating from HeatCast, start with HeatDial in Shadow mode and compare both displays. Once you're ready to cut over, connect the HeatDial event to your notification action and switch off the old HeatCast recommendation notifications.

## Development

Run the policy regression tests with `python -B -m unittest discover -s tests -v`. They run without Home Assistant. The first release uses explicit comfort and trend rules. The limits and forecast handling are designed to be evaluated against observed room temperatures and manual adjustments.
