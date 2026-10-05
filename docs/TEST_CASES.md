# Test Cases v1.0

## 1. Authentication

  ID        Test                  Expected
  --------- --------------------- ---------------------
  AUTH-01   Valid login           Login success
  AUTH-02   Wrong password        401
  AUTH-03   Logout                Session invalidated
  AUTH-04   Access without auth   401

## 2. Home Authorization

  ID         Test                                                 Expected
  ---------- ---------------------------------------------------- ----------
  AUTHZ-01   User accesses owned Home                             Allowed
  AUTHZ-02   User accesses another user's Home                    403
  AUTHZ-03   User accesses device in owned Home                   Allowed
  AUTHZ-04   User attempts command to device outside owned Home   403

## 3. MQTT Connectivity

  ID        Test                             Expected
  --------- -------------------------------- ------------------------------
  MQTT-01   ESP32 connects                   Online
  MQTT-02   ESP32 disconnects normally       Offline/availability updated
  MQTT-03   ESP32 disconnects unexpectedly   LWT offline
  MQTT-04   Capability published             Backend updates capabilities

## 4. Telemetry

  ID       Test                           Expected
  -------- ------------------------------ --------------------------
  TEL-01   ESP32 publishes DHT11          Backend receives
  TEL-02   Telemetry stored               PostgreSQL row created
  TEL-03   Dashboard requests telemetry   Data displayed
  TEL-04   Interval default               Approximately 30 seconds

## 5. Device Control

  ID       Test                        Expected
  -------- --------------------------- -----------------------------
  CMD-01   Relay ON                    State ON received
  CMD-02   Relay OFF                   State OFF received
  CMD-03   Command sent but no State   Timeout/retry
  CMD-04   Device offline              No pointless retry
  CMD-05   Matching command_id         Command SUCCESS
  CMD-06   Wrong/missing command_id    Not treated as confirmation

## 6. State History

  ID         Test                      Expected
  ---------- ------------------------- -----------------------
  STATE-01   Relay state changes       Current state updated
  STATE-02   State changes             History row created
  STATE-03   State linked to command   command_id stored

## 7. Configuration

  -----------------------------------------------------------------------
  ID                      Test                    Expected
  ----------------------- ----------------------- -----------------------
  CFG-01                  Change telemetry        Desired config updated
                          interval                

  CFG-02                  ESP32 receives config   Applies config

  CFG-03                  ESP32 reports applied   Backend updates applied
                          config                  config

  CFG-04                  ESP32 restarts          Config remains via NVS
  -----------------------------------------------------------------------

## 8. Automation

  ID        Test                     Expected
  --------- ------------------------ ---------------------------
  AUTO-01   Create daily schedule    Rule stored
  AUTO-02   Scheduler reaches time   Command created
  AUTO-03   Device online            Command executed
  AUTO-04   State received           Automation success
  AUTO-05   Device offline           Automation failure/logged

## 9. OTA

  ID       Test                   Expected
  -------- ---------------------- --------------------
  OTA-01   Firmware list          Versions displayed
  OTA-02   User starts OTA        Job PENDING
  OTA-03   Device downloads       Job progresses
  OTA-04   Device reboots         MQTT reconnect
  OTA-05   New version reported   Job SUCCESS
  OTA-06   OTA failure            Job FAILED

## 10. Voice AI

  ID         Test                    Expected
  ---------- ----------------------- ---------------------------
  VOICE-01   "Bật đèn phòng khách"   CONTROL_DEVICE
  VOICE-02   Valid command           Backend command created
  VOICE-03   Device executes         State received
  VOICE-04   No State                AI does not claim success
  VOICE-05   Unauthorized Home       Command rejected

## 11. Minimum acceptance flow

The system is considered minimally integrated when this end-to-end flow
works:

``` text
DHT11
 -> ESP32
 -> MQTT
 -> Backend
 -> PostgreSQL
 -> Dashboard

Dashboard
 -> Backend
 -> MQTT
 -> ESP32
 -> Relay
 -> State
 -> Backend
 -> Dashboard
```

At least one automation scenario must also be demonstrated.

## 12. Testing rule

Do not mark PASS based on code inspection alone. PASS requires an actual
observed result.
