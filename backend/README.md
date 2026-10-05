# Smart Home Backend

Phase 1–3 backend follows the contracts in `../docs`. The MQTT topic uses the persisted Home and Room UUIDs as the contract's logical `home_id` and `room_id`; `device_id` is `devices.device_id`.

## Run locally

1. Start PostgreSQL and EMQX: `docker compose -f ../docker/docker-compose.yml up -d`.
2. Copy `.env.example` to `.env` and set a strong `AUTH_SECRET`.
3. Run `npm install`, `npm run db:migrate -- --name init`, then `npm run db:seed`.
4. Run `npm run dev`.

The seed adds the three fixed capability-registry records and a default user: `user@example.com` / `ChangeMe123!`. Override `SEED_USER_EMAIL` and `SEED_USER_PASSWORD` before seeding outside a local demo.

## Verification

`npm run typecheck` and `npm run build` validate Prisma generation, TypeScript, and route compilation. Integration needs PostgreSQL/EMQX running plus a provisioned Home, Room, and Device.

Subscribe/publish MQTT with UUID topic values. Backend subscribes to telemetry (QoS 0), state, availability and capability (QoS 1); it publishes command with QoS 1 and no retain flag. A command becomes `SUCCESS` only when an incoming state contains the same `command_id` and the requested capability value.
