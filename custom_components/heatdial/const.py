"""Home Assistant configuration for HeatDial."""

from datetime import timedelta

DOMAIN = "heatdial"
CONF_DIAL = "dial"
CONF_DIAL_SCALE = "dial_scale"
CONF_OUTDOOR = "outdoor"
CONF_WEATHER = "weather"
CONF_PRIMARY = "primary_rooms"
CONF_SECONDARY = "secondary_rooms"
CONF_ROOM_WEIGHTS = "room_weights"
CONF_SHADOW = "shadow_mode"

UPDATE_INTERVAL = timedelta(minutes=5)
FORECAST_INTERVAL = timedelta(minutes=30)
FORECAST_MAX_AGE = timedelta(minutes=90)
SENSOR_MAX_AGE = timedelta(minutes=90)
