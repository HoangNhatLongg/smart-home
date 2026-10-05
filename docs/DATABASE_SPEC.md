# Database Specification v1.0

## 1. Nguyên tắc

Database dùng PostgreSQL.

Tên bảng dùng `snake_case`. Primary key ưu tiên UUID. Timestamp lưu theo
UTC.

JSONB được sử dụng cho dữ liệu có tính mở rộng, đặc biệt telemetry,
command payload và configuration.

## 2. ERD logic

``` text
users
  1
  |
  N
homes
  1
  |
  N
rooms
  1
  |
  N
devices
  | 1
  +------ N device_capabilities N ------ 1 capability_registry
  |
  +------ 1 device_configurations
  |
  +------ 1 device_states
  |
  +------ N state_history
  |
  +------ N telemetry
  |
  +------ N commands
  |
  +------ N ota_jobs

homes
  |
  +------ N automation_rules
                 |
                 +------ N automation_logs

firmware_versions
  |
  +------ N ota_jobs
```

## 3. Tables

### users

``` text
id UUID PK
email VARCHAR UNIQUE NOT NULL
password_hash TEXT NOT NULL
created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
```

### homes

``` text
id UUID PK
owner_id UUID FK -> users.id
name VARCHAR NOT NULL
created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
```

### rooms

``` text
id UUID PK
home_id UUID FK -> homes.id
name VARCHAR NOT NULL
created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
```

### devices

``` text
id UUID PK
room_id UUID FK -> rooms.id
device_id VARCHAR UNIQUE NOT NULL
name VARCHAR NOT NULL
firmware_version VARCHAR
status VARCHAR NOT NULL
last_seen_at TIMESTAMPTZ
created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
```

Allowed status: - `online` - `offline` - `unknown`

### capability_registry

``` text
id UUID PK
code VARCHAR UNIQUE NOT NULL
name VARCHAR NOT NULL
type VARCHAR NOT NULL
data_type VARCHAR NOT NULL
unit VARCHAR NULL
description TEXT NULL
created_at TIMESTAMPTZ NOT NULL
```

Initial records: - `temperature`, `sensor`, `number`, `°C` - `humidity`,
`sensor`, `number`, `%` - `relay`, `actuator`, `boolean`, NULL

### device_capabilities

``` text
id UUID PK
device_id UUID FK -> devices.id
capability_id UUID FK -> capability_registry.id
instance_code VARCHAR NOT NULL
name VARCHAR NULL
config JSONB NULL
created_at TIMESTAMPTZ NOT NULL
```

Unique constraint:

``` text
(device_id, instance_code)
```

Examples: - `temperature` - `humidity` - `relay_1` - `relay_2`

### device_configurations

``` text
id UUID PK
device_id UUID UNIQUE FK -> devices.id
config_version INTEGER NOT NULL
desired_config JSONB NOT NULL
applied_config JSONB NULL
updated_at TIMESTAMPTZ NOT NULL
applied_at TIMESTAMPTZ NULL
```

### telemetry

``` text
id UUID PK
device_id UUID FK -> devices.id
capability_id UUID NULL FK -> device_capabilities.id
data JSONB NOT NULL
recorded_at TIMESTAMPTZ NOT NULL
```

Indexes: - `(device_id, recorded_at DESC)` - `(recorded_at DESC)`

Example data:

``` json
{
  "temperature": 28.5,
  "humidity": 72
}
```

### device_states

Current state only:

``` text
id UUID PK
device_id UUID FK -> devices.id
capability_id UUID NULL FK -> device_capabilities.id
state JSONB NOT NULL
updated_at TIMESTAMPTZ NOT NULL
```

Recommended unique key:

``` text
(device_id, capability_id)
```

### state_history

``` text
id UUID PK
device_id UUID FK -> devices.id
capability_id UUID NULL FK -> device_capabilities.id
command_id UUID NULL FK -> commands.id
state JSONB NOT NULL
recorded_at TIMESTAMPTZ NOT NULL
```

Index:

``` text
(device_id, recorded_at DESC)
```

### commands

``` text
id UUID PK
command_id VARCHAR UNIQUE NOT NULL
device_id UUID FK -> devices.id
command_type VARCHAR NOT NULL
payload JSONB NOT NULL
status VARCHAR NOT NULL
retry_count INTEGER NOT NULL DEFAULT 0
created_at TIMESTAMPTZ NOT NULL
sent_at TIMESTAMPTZ NULL
completed_at TIMESTAMPTZ NULL
error_message TEXT NULL
```

Allowed status: - `PENDING` - `SENT` - `SUCCESS` - `FAILED` - `TIMEOUT`

### automation_rules

``` text
id UUID PK
home_id UUID FK -> homes.id
name VARCHAR NOT NULL
enabled BOOLEAN NOT NULL DEFAULT true
schedule JSONB NOT NULL
action JSONB NOT NULL
created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
```

Example schedule:

``` json
{
  "type": "daily",
  "time": "18:00"
}
```

Example action:

``` json
{
  "device_id": "esp32-c3-001",
  "capability": "relay_1",
  "command": "set_relay",
  "params": {
    "state": true
  }
}
```

### automation_logs

``` text
id UUID PK
automation_rule_id UUID FK -> automation_rules.id
command_id UUID NULL FK -> commands.id
execution_status VARCHAR NOT NULL
executed_at TIMESTAMPTZ NOT NULL
error_message TEXT NULL
```

### firmware_versions

``` text
id UUID PK
version VARCHAR UNIQUE NOT NULL
firmware_url TEXT NOT NULL
checksum VARCHAR NOT NULL
file_size BIGINT NULL
release_note TEXT NULL
created_at TIMESTAMPTZ NOT NULL
```

### ota_jobs

``` text
id UUID PK
device_id UUID FK -> devices.id
firmware_version_id UUID FK -> firmware_versions.id
status VARCHAR NOT NULL
progress INTEGER NOT NULL DEFAULT 0
started_at TIMESTAMPTZ NULL
completed_at TIMESTAMPTZ NULL
error_message TEXT NULL
created_at TIMESTAMPTZ NOT NULL
```

Allowed status: - `PENDING` - `DOWNLOADING` - `INSTALLING` -
`REBOOTING` - `SUCCESS` - `FAILED`

## 4. Authorization

Every API query involving a Home must verify:

``` text
home.owner_id == current_user.id
```

Authorization is performed at Home level only.

## 5. MVP simplification

Do not create RBAC tables unless explicitly required later.

Do not create separate physical tables for each sensor type. Use
Capability Registry + JSONB.
