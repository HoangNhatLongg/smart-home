# REST API Specification v1.0

## 1. Rules

Base path:

``` text
/api
```

JSON request/response.

Authentication is required for all endpoints except login.

Frontend must use these contracts and must not access PostgreSQL
directly.

## 2. Authentication

### POST /api/auth/login

Request:

``` json
{
  "email": "user@example.com",
  "password": "..."
}
```

Response:

``` json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com"
  }
}
```

### POST /api/auth/logout

Response:

``` json
{
  "success": true
}
```

### GET /api/auth/me

Response:

``` json
{
  "id": "uuid",
  "email": "user@example.com"
}
```

## 3. Homes

### GET /api/homes

Response:

``` json
[
  {
    "id": "uuid",
    "name": "Nhà chính"
  }
]
```

### GET /api/homes/:homeId

Returns Home with basic rooms/devices summary.

### POST /api/homes

Request:

``` json
{
  "name": "Nhà chính"
}
```

### PUT /api/homes/:homeId

Request:

``` json
{
  "name": "Nhà chính"
}
```

### DELETE /api/homes/:homeId

Only if the implementation supports deletion.

## 4. Rooms

### GET /api/homes/:homeId/rooms

### POST /api/homes/:homeId/rooms

Request:

``` json
{
  "name": "Phòng khách"
}
```

### PUT /api/rooms/:roomId

### DELETE /api/rooms/:roomId

## 5. Devices

### GET /api/rooms/:roomId/devices

Response:

``` json
[
  {
    "id": "uuid",
    "deviceId": "esp32-c3-001",
    "name": "ESP32 phòng khách",
    "status": "online",
    "firmwareVersion": "1.0.0",
    "lastSeenAt": "2026-10-05T08:00:00Z",
    "capabilities": []
  }
]
```

### GET /api/devices/:deviceId

Returns complete device detail.

### PUT /api/devices/:deviceId

Editable fields may include:

``` json
{
  "name": "ESP32 phòng khách"
}
```

## 6. Capabilities

### GET /api/devices/:deviceId/capabilities

### GET /api/capabilities/registry

Returns Capability Registry.

### POST /api/devices/:deviceId/capabilities/sync

Used internally/admin-side to synchronize declared capabilities from
MQTT.

## 7. Telemetry

### GET /api/devices/:deviceId/telemetry

Query:

``` text
?from=ISO_DATE&to=ISO_DATE&limit=100
```

Response:

``` json
[
  {
    "data": {
      "temperature": 28.5,
      "humidity": 72
    },
    "recordedAt": "2026-10-05T08:00:00Z"
  }
]
```

## 8. State

### GET /api/devices/:deviceId/state

Returns current state.

### GET /api/devices/:deviceId/state-history

Query:

``` text
?from=ISO_DATE&to=ISO_DATE&limit=100
```

## 9. Commands

### POST /api/devices/:deviceId/commands

Request:

``` json
{
  "commandType": "set_relay",
  "payload": {
    "capability": "relay_1",
    "state": true
  }
}
```

Response immediately after command creation:

``` json
{
  "commandId": "cmd-uuid",
  "status": "PENDING"
}
```

Backend then checks availability, publishes MQTT, waits for State, and
updates command status.

### GET /api/commands/:commandId

Response:

``` json
{
  "commandId": "cmd-uuid",
  "status": "SUCCESS",
  "retryCount": 0,
  "completedAt": "2026-10-05T08:00:05Z"
}
```

## 10. Configuration

### GET /api/devices/:deviceId/configuration

### PUT /api/devices/:deviceId/configuration

Request example:

``` json
{
  "telemetry_interval": 30,
  "relay_1_name": "Đèn phòng khách"
}
```

Backend increments `config_version` and publishes configuration through
MQTT.

### GET /api/devices/:deviceId/configuration/status

Returns desired and applied configuration.

## 11. Automation

### GET /api/homes/:homeId/automations

### POST /api/homes/:homeId/automations

Request:

``` json
{
  "name": "Bật đèn phòng khách",
  "enabled": true,
  "schedule": {
    "type": "daily",
    "time": "18:00"
  },
  "action": {
    "deviceId": "esp32-c3-001",
    "capability": "relay_1",
    "command": "set_relay",
    "params": {
      "state": true
    }
  }
}
```

### PUT /api/automations/:id

### DELETE /api/automations/:id

### GET /api/automations/:id/logs

## 12. OTA

### GET /api/firmware

### GET /api/devices/:deviceId/ota

### POST /api/devices/:deviceId/ota

Request:

``` json
{
  "firmwareVersionId": "uuid"
}
```

Response:

``` json
{
  "otaJobId": "uuid",
  "status": "PENDING"
}
```

### GET /api/ota/:jobId

## 13. Voice AI

### POST /api/voice/command

Input after Speech-to-Text:

``` json
{
  "text": "Bật đèn phòng khách"
}
```

Expected internal result:

``` json
{
  "intent": "CONTROL_DEVICE",
  "parameters": {
    "target": "đèn phòng khách",
    "state": true
  }
}
```

Backend resolves target, validates Home authorization, executes normal
command flow, and returns:

``` json
{
  "success": true,
  "message": "Đã bật đèn phòng khách.",
  "commandId": "uuid"
}
```

AI must not publish MQTT directly.

## 14. HTTP errors

Use: - `400` invalid input - `401` unauthenticated - `403` Home
authorization failure - `404` resource not found - `409` conflict -
`422` validation error - `500` unexpected server error - `503` dependent
service unavailable

## 15. Contract rule

If an endpoint, request field, response field, or status changes, update
this file before changing Frontend code.
