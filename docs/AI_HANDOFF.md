# AI Agent Handoff Rules v1.0

## 1. Purpose

This document is the operating contract for multiple AI coding agents
working in parallel.

## 2. Agents

### Backend Agent

Task: - Backend - PostgreSQL - REST API - MQTT integration - Scheduler -
OTA management - Voice command endpoint

Primary references: - SYSTEM_SPEC.md - DATABASE_SPEC.md - API_SPEC.md -
MQTT_SPEC.md

### Frontend Agent

Task: - Web Dashboard - Login - Home/Room/Device - Telemetry - Relay
control - Automation - OTA UI - Voice UI

Primary references: - SYSTEM_SPEC.md - API_SPEC.md

Frontend must use API contracts and may use mock data until Backend is
available.

### Firmware Agent

Task: - ESP32 Generic Node - MQTT - DHT11 - Relay - Capability - State -
Availability - Configuration - OTA

Primary references: - SYSTEM_SPEC.md - MQTT_SPEC.md

### Report

Report is NOT an AI agent task in this workflow. The user and assistant
will write the report based on actual implementation and test results.

## 3. Rules for all agents

1.  Do not invent requirements.
2.  Do not silently change contracts.
3.  Do not add infrastructure without necessity.
4.  Keep MVP simple.
5.  If an implementation decision conflicts with a contract, stop and
    report the conflict.
6.  Never claim a feature is implemented unless it has actually been
    implemented.
7.  Do not mark tests PASS without execution evidence.

## 4. Backend/Frontend parallel rule

Backend defines the API behavior.

Frontend consumes the API contract.

If Backend changes an endpoint: 1. Update API_SPEC.md. 2.
Notify/propagate change to Frontend. 3. Update Frontend client. 4. Test
integration.

## 5. Backend/Firmware parallel rule

MQTT_SPEC.md is the shared contract.

If topic/payload changes: 1. Update MQTT_SPEC.md. 2. Update Backend MQTT
service. 3. Update Firmware. 4. Test the full MQTT flow.

## 6. Git rule

Recommended branches:

``` text
main
feature/backend
feature/frontend
feature/firmware
```

Avoid having two agents modify the same files simultaneously.

## 7. Commit rule

Use focused commits:

``` text
feat(backend): add device API
feat(frontend): add device dashboard
feat(firmware): add DHT11 telemetry
fix(mqtt): handle state confirmation
```

## 8. Priority rule

When time is limited:

``` text
1. Core telemetry
2. Core device control
3. State confirmation
4. Authentication
5. Dashboard
6. Automation
7. Configuration
8. OTA
9. Voice AI
10. Cosmetic improvements
```

Never sacrifice core system stability for a non-essential feature.
