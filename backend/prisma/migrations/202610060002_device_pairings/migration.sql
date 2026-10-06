CREATE TABLE "device_pairings" (
    "id" UUID NOT NULL,
    "device_id" TEXT NOT NULL,
    "device_secret_hash" TEXT NOT NULL,
    "pairing_code_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "device_record_id" UUID,
    "mqtt_uri" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paired_at" TIMESTAMP(3),
    CONSTRAINT "device_pairings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "device_pairings_device_id_key" ON "device_pairings"("device_id");
CREATE UNIQUE INDEX "device_pairings_pairing_code_hash_key" ON "device_pairings"("pairing_code_hash");
CREATE UNIQUE INDEX "device_pairings_device_record_id_key" ON "device_pairings"("device_record_id");
ALTER TABLE "device_pairings" ADD CONSTRAINT "device_pairings_device_record_id_fkey" FOREIGN KEY ("device_record_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
