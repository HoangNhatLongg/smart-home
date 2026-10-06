import mqtt, { MqttClient } from 'mqtt';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { parseTopic, TopicKind } from './topics';
type Json = Record<string, unknown>;
const qos: Record<TopicKind, 0 | 1> = { telemetry: 0, state: 1, command: 1, availability: 1, config: 1, capability: 1, ota: 1 };
class MqttService {
  private client: MqttClient | null = null;
  private ready = false;
  start() { if (this.client || !process.env.MQTT_URL) return; this.client = mqtt.connect(process.env.MQTT_URL); this.client.on('connect', () => { console.info('MQTT connected'); this.ready = true; this.client?.subscribe('smarthome/+/+/+/telemetry', { qos: 0 }); this.client?.subscribe('smarthome/+/+/+/state', { qos: 1 }); this.client?.subscribe('smarthome/+/+/+/availability', { qos: 1 }); this.client?.subscribe('smarthome/+/+/+/capability', { qos: 1 }); this.client?.subscribe('smarthome/+/+/+/config', { qos: 1 }); }); this.client.on('error', err => console.error('MQTT connection error', err.message)); this.client.on('message', (t, p) => void this.receive(t, p)); }
  async publish(destination: string, payload: Json, quality: 0 | 1, retain: boolean) { this.start(); if (!this.client || !this.ready) throw new Error('MQTT broker unavailable'); await new Promise<void>((resolve, reject) => this.client!.publish(destination, JSON.stringify(payload), { qos: quality, retain }, error => error ? reject(error) : resolve())); }
  private async receive(rawTopic: string, rawPayload: Buffer) { const context = parseTopic(rawTopic); if (!context) return; let payload: Json; try { const parsed: unknown = JSON.parse(rawPayload.toString()); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object'); payload = parsed as Json; } catch (cause) { console.error('MQTT message parse error', { rawTopic, cause }); return; } const device = await prisma.device.findUnique({ where: { deviceId: context.deviceId }, include: { room: true } }); if (!device || device.room.homeId !== context.homeId || device.roomId !== context.roomId) { console.warn('MQTT message device/topic mismatch', { rawTopic }); return; } try { if (context.kind === 'availability') await this.availability(device.id, payload); if (context.kind === 'telemetry') await this.telemetry(device.id, payload); if (context.kind === 'capability') await this.capabilities(device.id, payload); if (context.kind === 'state') await this.state(device.id, payload); if (context.kind === 'config') await this.configuration(device.id, payload); } catch (cause) { console.error('MQTT database handling error', { rawTopic, cause }); } }
  private async availability(deviceId: string, payload: Json) { if (payload.status !== 'online' && payload.status !== 'offline') return; await prisma.device.update({ where: { id: deviceId }, data: payload.status === 'online' ? { status: 'online', lastSeenAt: new Date() } : { status: 'offline' } }); }
  private async telemetry(deviceId: string, payload: Json) { if (!payload.data || typeof payload.data !== 'object' || Array.isArray(payload.data)) return; const recordedAt = typeof payload.timestamp === 'string' && !Number.isNaN(new Date(payload.timestamp).valueOf()) ? new Date(payload.timestamp) : new Date(); await prisma.telemetry.create({ data: { deviceId, data: payload.data as Prisma.InputJsonValue, recordedAt } }); await prisma.device.update({ where: { id: deviceId }, data: { lastSeenAt: new Date() } }); }
  private async capabilities(deviceId: string, payload: Json) {
    if (!Array.isArray(payload.capabilities)) return;
    if (typeof payload.firmware_version === 'string') {
      await prisma.device.update({ where: { id: deviceId }, data: { firmwareVersion: payload.firmware_version } });
    }
    const configuration = await prisma.deviceConfiguration.findUnique({ where: { deviceId } });
    const desired = configuration?.desiredConfig && typeof configuration.desiredConfig === 'object' && !Array.isArray(configuration.desiredConfig)
      ? configuration.desiredConfig as Json
      : {};
    const advertisedRelays = new Set<string>();

    for (const item of payload.capabilities) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Json;
      if (typeof row.capability_id !== 'string' || typeof row.instance_code !== 'string') continue;
      const registry = await prisma.capabilityRegistry.findUnique({ where: { code: row.capability_id } });
      if (!registry) {
        console.warn('Capability rejected: not in registry', { capability: row.capability_id });
        continue;
      }
      const name = typeof desired[`${row.instance_code}_name`] === 'string' ? desired[`${row.instance_code}_name`] as string : undefined;
      const isRelay = row.capability_id === 'relay' && /^relay_[1-8]$/.test(row.instance_code);
      const existing = isRelay
        ? await prisma.deviceCapability.findUnique({ where: { deviceId_instanceCode: { deviceId, instanceCode: row.instance_code } } })
        : null;
      const oldConfig = existing?.config && typeof existing.config === 'object' && !Array.isArray(existing.config)
        ? existing.config as Record<string, unknown>
        : {};
      await prisma.deviceCapability.upsert({
        where: { deviceId_instanceCode: { deviceId, instanceCode: row.instance_code } },
        create: { deviceId, capabilityId: registry.id, instanceCode: row.instance_code, name, ...(isRelay ? { config: { configured: true } } : {}) },
        update: {
          capabilityId: registry.id,
          ...(name === undefined ? {} : { name }),
          ...(isRelay ? { config: { ...oldConfig, configured: true } } : {}),
        },
      });
      if (isRelay) advertisedRelays.add(row.instance_code);
    }

    // Keep historical capability rows (they may be referenced by state history),
    // but mark relays absent from the ESP's latest declaration as unconfigured.
    const existingRelays = await prisma.deviceCapability.findMany({
      where: { deviceId, capability: { code: 'relay' } },
    });
    for (const relay of existingRelays) {
      if (advertisedRelays.has(relay.instanceCode)) continue;
      const oldConfig = relay.config && typeof relay.config === 'object' && !Array.isArray(relay.config)
        ? relay.config as Record<string, unknown>
        : {};
      await prisma.deviceCapability.update({
        where: { id: relay.id },
        data: { config: { ...oldConfig, configured: false } },
      });
    }
  }
  private async state(deviceId: string, payload: Json) { if (!payload.state || typeof payload.state !== 'object' || Array.isArray(payload.state)) return; const state = payload.state as Json; const recordedAt = typeof payload.timestamp === 'string' && !Number.isNaN(new Date(payload.timestamp).valueOf()) ? new Date(payload.timestamp) : new Date(); const command = typeof payload.command_id === 'string' ? await prisma.command.findUnique({ where: { commandId: payload.command_id } }) : null; for (const [instanceCode, value] of Object.entries(state)) { const capability = await prisma.deviceCapability.findUnique({ where: { deviceId_instanceCode: { deviceId, instanceCode } } }); if (!capability) continue; const data = { [instanceCode]: value } as Prisma.InputJsonValue; await prisma.deviceState.upsert({ where: { deviceId_capabilityId: { deviceId, capabilityId: capability.id } }, create: { deviceId, capabilityId: capability.id, state: data }, update: { state: data } }); await prisma.stateHistory.create({ data: { deviceId, capabilityId: capability.id, commandId: command?.id, state: data, recordedAt } }); }
    if (command && command.deviceId === deviceId && command.status === 'SENT') { const wanted = command.payload as Json; const name = wanted.capability; if (typeof name === 'string' && state[name] === wanted.state) await prisma.command.update({ where: { id: command.id }, data: { status: 'SUCCESS', completedAt: new Date(), errorMessage: null } }); }
  }
  private async configuration(deviceId: string, payload: Json) { if (payload.status !== 'applied' || typeof payload.config_version !== 'number' || !payload.config || typeof payload.config !== 'object' || Array.isArray(payload.config)) return; const configuration = await prisma.deviceConfiguration.findUnique({ where: { deviceId } }); if (!configuration || configuration.configVersion !== payload.config_version) return; await prisma.deviceConfiguration.update({ where: { deviceId }, data: { appliedConfig: payload.config as Prisma.InputJsonValue, appliedAt: new Date() } }); }
}
const globalMqtt = globalThis as unknown as { mqttService?: MqttService };
export const mqttService = globalMqtt.mqttService ?? new MqttService();
if (process.env.NODE_ENV !== 'production') globalMqtt.mqttService = mqttService;
