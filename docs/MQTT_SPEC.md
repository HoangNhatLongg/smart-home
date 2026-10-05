# MQTT Specification v1.0

## 1. Broker

Central MQTT Broker: - EMQX - ESP32 and Backend connect to the same
broker.

Architecture:

``` text
ESP32 <-> EMQX <-> Backend
```

## 2. Topic Namespace

Base:

``` text
smarthome/{home_id}/{room_id}/{device_id}/
```

Topics:

``` text
telemetry
state
command
availability
config
capability
ota
```

Full examples:

``` text
smarthome/home01/livingroom/esp32-c3-001/telemetry
smarthome/home01/livingroom/esp32-c3-001/state
smarthome/home01/livingroom/esp32-c3-001/command
smarthome/home01/livingroom/esp32-c3-001/availability
smarthome/home01/livingroom/esp32-c3-001/config
smarthome/home01/livingroom/esp32-c3-001/capability
smarthome/home01/livingroom/esp32-c3-001/ota
```

`home_id`, `room_id`, `device_id` in MQTT are logical identifiers. They
must correspond to the Backend resource model.

## 3. QoS

  Topic            QoS
  -------------- -----
  telemetry          0
  state              1
  command            1
  availability       1
  config             1
  capability         1
  ota                1

## 4. Retained

Retained: - state - availability - capability - config

Not retained: - telemetry - command

## 5. LWT

ESP32 sets Last Will on:

``` text
.../availability
```

LWT payload:

``` json
{
  "status": "offline"
}
```

When connected, ESP32 publishes retained:

``` json
{
  "status": "online",
  "timestamp": "2026-10-05T08:00:00Z"
}
```

## 6. Telemetry

ESP32 -\> Backend:

``` json
{
  "timestamp": "2026-10-05T08:00:00Z",
  "data": {
    "temperature": 28.5,
    "humidity": 72
  }
}
```

Default interval: 30 seconds.

## 7. State

ESP32 -\> Backend:

``` json
{
  "command_id": "cmd-001",
  "timestamp": "2026-10-05T08:00:05Z",
  "state": {
    "relay_1": true
  }
}
```

A state update may also be sent without `command_id` when caused by
local state changes:

``` json
{
  "timestamp": "2026-10-05T08:00:05Z",
  "state": {
    "relay_1": true
  }
}
```

## 8. Command

Backend -\> ESP32:

``` json
{
  "command_id": "cmd-001",
  "timestamp": "2026-10-05T08:00:00Z",
  "command": "set_relay",
  "params": {
    "relay": 1,
    "state": true
  }
}
```

ESP32 must respond with State containing the same `command_id` after
successful application.

## 9. Availability

Online:

``` json
{
  "status": "online",
  "timestamp": "2026-10-05T08:00:00Z"
}
```

Offline:

``` json
{
  "status": "offline"
}
```

## 10. Capability

ESP32 -\> Backend:

``` json
{
  "device_id": "esp32-c3-001",
  "firmware_version": "1.0.0",
  "capabilities": [
    {
      "capability_id": "temperature",
      "instance_code": "temperature"
    },
    {
      "capability_id": "humidity",
      "instance_code": "humidity"
    },
    {
      "capability_id": "relay",
      "instance_code": "relay_1"
    }
  ]
}
```

Backend validates `capability_id` against Capability Registry.

## 11. Configuration

Backend -\> ESP32:

``` json
{
  "config_version": 3,
  "config": {
    "telemetry_interval": 30,
    "relay_1_name": "Đèn phòng khách"
  }
}
```

ESP32 responds through the config topic:

``` json
{
  "config_version": 3,
  "status": "applied",
  "config": {
    "telemetry_interval": 30,
    "relay_1_name": "Đèn phòng khách"
  }
}
```

## 12. OTA

Backend -\> ESP32:

``` json
{
  "job_id": "ota-001",
  "firmware_version": "1.1.0",
  "firmware_url": "https://example/firmware.bin",
  "checksum": "..."
}
```

ESP32 publishes progress/status through the OTA topic.

## 13. Command processing

Backend: 1. Verify user/Home authorization. 2. Verify Device exists. 3.
Verify Device availability. 4. Create command record. 5. Publish MQTT
command. 6. Wait for matching State. 7. If State matches -\> SUCCESS. 8.
If no State -\> retry with limit when Device is online. 9. If offline
-\> stop current retry cycle. 10. If retry limit reached -\>
TIMEOUT/FAILED.

## 14. Topic contract rule

Never invent new topic formats inside an individual AI agent. Update
this file first.
