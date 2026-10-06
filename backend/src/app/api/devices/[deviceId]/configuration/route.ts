import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { ownedDevice, AuthError } from '@/lib/auth/authorize';
import { prisma } from '@/lib/db/prisma';
import { badRequest, error, json, serverError } from '@/lib/http';
import { mqttService } from '@/lib/mqtt/service';
import { topic } from '@/lib/mqtt/topics';

const asResponse = (row: { deviceId: string; configVersion: number; desiredConfig: Prisma.JsonValue; appliedConfig: Prisma.JsonValue | null; appliedAt: Date | null; updatedAt: Date }) => ({ deviceId: row.deviceId, configVersion: row.configVersion, desiredConfig: row.desiredConfig, appliedConfig: row.appliedConfig, appliedAt: row.appliedAt, updatedAt: row.updatedAt });
const RELAY_KINDS = new Set(['light', 'pump', 'fan', 'socket', 'curtain', 'other']);

function relayMetadata(value: unknown): Array<{ instanceCode: string; name?: string; config: Prisma.InputJsonValue }> | null {
  if (value === undefined) return [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const result: Array<{ instanceCode: string; name?: string; config: Prisma.InputJsonValue }> = [];
  for (const [instanceCode, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!/^relay_[1-9]\d*$/.test(instanceCode) || !raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const item = raw as Record<string, unknown>;
    const name = item.name;
    const kind = item.kind;
    const description = item.description;
    if (name !== undefined && (typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 64)) return null;
    if (kind !== undefined && (typeof kind !== 'string' || !RELAY_KINDS.has(kind))) return null;
    if (description !== undefined && (typeof description !== 'string' || description.length > 160)) return null;
    result.push({ instanceCode, ...(typeof name === 'string' ? { name: name.trim() } : {}), config: { kind: typeof kind === 'string' ? kind : 'other', description: typeof description === 'string' ? description.trim() : '' } });
  }
  return result;
}

export async function GET(_: Request, { params }: { params: Promise<{ deviceId: string }> }) {
  try { const { deviceId } = await params; const device = await ownedDevice(deviceId); const row = await prisma.deviceConfiguration.findUnique({ where: { deviceId: device.id } }); return NextResponse.json(row ? asResponse(row) : { deviceId, configVersion: null, desiredConfig: {}, appliedConfig: null, appliedAt: null, updatedAt: null }); } catch (cause) { return cause instanceof AuthError ? error(cause.message, cause.status) : serverError(cause); }
}

export async function PUT(request: Request, { params }: { params: Promise<{ deviceId: string }> }) {
  try {
    const { deviceId } = await params; const device = await ownedDevice(deviceId); const body = await json(request);
    if (!body || Object.keys(body).length === 0 || JSON.stringify(body).length > 3500) return badRequest('Configuration must be a non-empty JSON object under 3500 bytes');
    const relayDetails = relayMetadata(body.relay_metadata);
    if (relayDetails === null) return badRequest('relay_metadata must contain relay_N entries with valid name, kind, and description');
    if (device.status !== 'online') return error('Device must be online to receive configuration', 409);
    const previous = await prisma.deviceConfiguration.findUnique({ where: { deviceId: device.id } });
    const previousDesired = previous?.desiredConfig && typeof previous.desiredConfig === 'object' && !Array.isArray(previous.desiredConfig) ? previous.desiredConfig as Record<string, unknown> : {};
    const desired = { ...previousDesired, ...body };
    const row = await prisma.deviceConfiguration.upsert({ where: { deviceId: device.id }, create: { deviceId: device.id, configVersion: 1, desiredConfig: desired as Prisma.InputJsonValue }, update: { configVersion: { increment: 1 }, desiredConfig: desired as Prisma.InputJsonValue, appliedConfig: Prisma.JsonNull, appliedAt: null } });
    await Promise.all(Object.entries(body).filter(([key, value]) => /^relay_\d+_name$/.test(key) && typeof value === 'string').map(([key, value]) => prisma.deviceCapability.updateMany({ where: { deviceId: device.id, instanceCode: key.replace(/_name$/, '') }, data: { name: value as string } })));
    await Promise.all(relayDetails.map((detail) => prisma.deviceCapability.updateMany({ where: { deviceId: device.id, instanceCode: detail.instanceCode }, data: { ...(detail.name === undefined ? {} : { name: detail.name }), config: detail.config } })));
    try { await mqttService.publish(topic(device.room.homeId, device.roomId, device.deviceId, 'config'), { config_version: row.configVersion, config: desired }, 1, true); } catch (cause) { console.error('Configuration publish failure', { deviceId, cause }); return error('MQTT broker unavailable; configuration was not sent', 503); }
    return NextResponse.json(asResponse(row));
  } catch (cause) { return cause instanceof AuthError ? error(cause.message, cause.status) : serverError(cause); }
}
