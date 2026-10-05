-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "homes" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" UUID NOT NULL,
    "home_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "device_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "firmware_version" TEXT,
    "status" TEXT NOT NULL,
    "last_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capability_registry" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "data_type" TEXT NOT NULL,
    "unit" TEXT,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "capability_registry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_capabilities" (
    "id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "capability_id" UUID NOT NULL,
    "instance_code" TEXT NOT NULL,
    "name" TEXT,
    "config" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_capabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_configurations" (
    "id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "config_version" INTEGER NOT NULL,
    "desired_config" JSONB NOT NULL,
    "applied_config" JSONB,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "applied_at" TIMESTAMP(3),

    CONSTRAINT "device_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telemetry" (
    "id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "capability_id" UUID,
    "data" JSONB NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telemetry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_states" (
    "id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "capability_id" UUID,
    "state" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "state_history" (
    "id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "capability_id" UUID,
    "command_id" UUID,
    "state" JSONB NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "state_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commands" (
    "id" UUID NOT NULL,
    "command_id" TEXT NOT NULL,
    "device_id" UUID NOT NULL,
    "command_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "error_message" TEXT,

    CONSTRAINT "commands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_rules" (
    "id" UUID NOT NULL,
    "home_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "schedule" JSONB NOT NULL,
    "action" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_logs" (
    "id" UUID NOT NULL,
    "automation_rule_id" UUID NOT NULL,
    "command_id" UUID,
    "execution_status" TEXT NOT NULL,
    "executed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "error_message" TEXT,

    CONSTRAINT "automation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "firmware_versions" (
    "id" UUID NOT NULL,
    "version" TEXT NOT NULL,
    "firmware_url" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "file_size" BIGINT,
    "release_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "firmware_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ota_jobs" (
    "id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "firmware_version_id" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ota_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "devices_device_id_key" ON "devices"("device_id");

-- CreateIndex
CREATE UNIQUE INDEX "capability_registry_code_key" ON "capability_registry"("code");

-- CreateIndex
CREATE UNIQUE INDEX "device_capabilities_device_id_instance_code_key" ON "device_capabilities"("device_id", "instance_code");

-- CreateIndex
CREATE UNIQUE INDEX "device_configurations_device_id_key" ON "device_configurations"("device_id");

-- CreateIndex
CREATE INDEX "telemetry_device_id_recorded_at_idx" ON "telemetry"("device_id", "recorded_at" DESC);

-- CreateIndex
CREATE INDEX "telemetry_recorded_at_idx" ON "telemetry"("recorded_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "device_states_device_id_capability_id_key" ON "device_states"("device_id", "capability_id");

-- CreateIndex
CREATE INDEX "state_history_device_id_recorded_at_idx" ON "state_history"("device_id", "recorded_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "commands_command_id_key" ON "commands"("command_id");

-- CreateIndex
CREATE UNIQUE INDEX "firmware_versions_version_key" ON "firmware_versions"("version");

-- AddForeignKey
ALTER TABLE "homes" ADD CONSTRAINT "homes_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_home_id_fkey" FOREIGN KEY ("home_id") REFERENCES "homes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_capabilities" ADD CONSTRAINT "device_capabilities_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_capabilities" ADD CONSTRAINT "device_capabilities_capability_id_fkey" FOREIGN KEY ("capability_id") REFERENCES "capability_registry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_configurations" ADD CONSTRAINT "device_configurations_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telemetry" ADD CONSTRAINT "telemetry_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telemetry" ADD CONSTRAINT "telemetry_capability_id_fkey" FOREIGN KEY ("capability_id") REFERENCES "device_capabilities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_states" ADD CONSTRAINT "device_states_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_states" ADD CONSTRAINT "device_states_capability_id_fkey" FOREIGN KEY ("capability_id") REFERENCES "device_capabilities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "state_history" ADD CONSTRAINT "state_history_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "state_history" ADD CONSTRAINT "state_history_capability_id_fkey" FOREIGN KEY ("capability_id") REFERENCES "device_capabilities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "state_history" ADD CONSTRAINT "state_history_command_id_fkey" FOREIGN KEY ("command_id") REFERENCES "commands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commands" ADD CONSTRAINT "commands_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_home_id_fkey" FOREIGN KEY ("home_id") REFERENCES "homes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_logs" ADD CONSTRAINT "automation_logs_automation_rule_id_fkey" FOREIGN KEY ("automation_rule_id") REFERENCES "automation_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ota_jobs" ADD CONSTRAINT "ota_jobs_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ota_jobs" ADD CONSTRAINT "ota_jobs_firmware_version_id_fkey" FOREIGN KEY ("firmware_version_id") REFERENCES "firmware_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
