# Project Structure v1.0

This structure is optimized for parallel AI development.

``` text
smart-home-iot/
├── docs/
│   ├── SYSTEM_SPEC.md
│   ├── DATABASE_SPEC.md
│   ├── API_SPEC.md
│   ├── MQTT_SPEC.md
│   ├── PROJECT_STRUCTURE.md
│   └── TEST_CASES.md
│
├── backend/
│   ├── src/
│   │   ├── app/
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   ├── homes/
│   │   │   ├── rooms/
│   │   │   ├── devices/
│   │   │   ├── capabilities/
│   │   │   ├── telemetry/
│   │   │   ├── states/
│   │   │   ├── commands/
│   │   │   ├── configurations/
│   │   │   ├── automation/
│   │   │   ├── ota/
│   │   │   └── voice/
│   │   ├── lib/
│   │   │   ├── db/
│   │   │   ├── mqtt/
│   │   │   ├── auth/
│   │   │   └── scheduler/
│   │   └── ...
│   ├── prisma/
│   └── ...
│
├── frontend/
│   ├── app/
│   ├── components/
│   │   ├── dashboard/
│   │   ├── devices/
│   │   ├── rooms/
│   │   ├── automation/
│   │   ├── ota/
│   │   └── voice/
│   ├── lib/
│   │   └── api/
│   └── ...
│
├── firmware/
│   └── esp32-generic-node/
│       ├── main/
│       │   ├── mqtt/
│       │   ├── device/
│       │   ├── capability/
│       │   ├── telemetry/
│       │   ├── state/
│       │   ├── command/
│       │   ├── configuration/
│       │   ├── availability/
│       │   └── ota/
│       └── ...
│
├── docker/
│   └── docker-compose.yml
│
└── README.md
```

## Parallel ownership

### Backend Agent

Owns:

``` text
backend/
docker/
DATABASE_SPEC implementation
API implementation
MQTT service
```

### Frontend Agent

Owns:

``` text
frontend/
```

Reads:

``` text
SYSTEM_SPEC.md
API_SPEC.md
```

Must not modify backend contracts without agreement.

### Firmware Agent

Owns:

``` text
firmware/
```

Reads:

``` text
SYSTEM_SPEC.md
MQTT_SPEC.md
```

Must not change topic or payload formats independently.

### User + Assistant

Own:

``` text
docs/
report/
```

## Shared contract files

The following are API contracts and must be treated as read-only during
feature implementation unless intentionally updated:

``` text
SYSTEM_SPEC.md
DATABASE_SPEC.md
API_SPEC.md
MQTT_SPEC.md
```

Any contract change must be reflected in all affected agents before
integration.

## MVP principle

Prefer a simple working implementation over an abstract enterprise
architecture.

Do not add microservices, Redis, Kafka, Kubernetes, GraphQL, or
additional infrastructure unless a concrete MVP requirement requires it.
