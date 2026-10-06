import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { mqttService } from '@/lib/mqtt/service';
import { topic } from '@/lib/mqtt/topics';
export async function createAndSendCommand(deviceId: string, commandType: string, payload: Record<string, unknown>) {
  const device = await prisma.device.findUnique({ where: { deviceId }, include: { room: { include: { home: true } } } });
  if (!device) throw new Error('Device not found');
  const command = await prisma.command.create({ data: { commandId: crypto.randomUUID(), deviceId: device.id, commandType, payload: payload as Prisma.InputJsonValue, status: 'PENDING' } });
  void send(command.id); return command;
}
async function send(id: string) {
  const command = await prisma.command.findUnique({ where: { id }, include: { device: { include: { room: { include: { home: true } } } } } });
  if (!command || command.status === 'SUCCESS') return;
  if (command.device.status !== 'online') { await prisma.command.update({ where: { id }, data: { status: 'FAILED', errorMessage: 'Device became offline', completedAt: new Date() } }); return; }
  const payload = command.payload as Record<string, unknown>;
  const capability = typeof payload.capability === 'string' ? payload.capability : '';
  const relayNumber = /^relay_(\d+)$/.exec(capability)?.[1];
  if (command.commandType !== 'set_relay' || !relayNumber || typeof payload.state !== 'boolean') { await prisma.command.update({ where: { id }, data: { status: 'FAILED', errorMessage: 'Unsupported command payload', completedAt: new Date() } }); return; }
  try {
    /* Mark SENT before publishing.  A local MQTT broker plus an ESP can return
       its State confirmation before the publish callback resolves; marking it
       afterwards loses that confirmation because the state handler only
       completes commands that are already SENT. */
    await prisma.command.update({ where: { id }, data: { status: 'SENT', sentAt: new Date() } });
    await mqttService.publish(topic(command.device.room.home.id, command.device.room.id, command.device.deviceId, 'command'), { command_id: command.commandId, timestamp: new Date().toISOString(), command: command.commandType, params: { relay: Number(relayNumber), state: payload.state } }, 1, false);
    scheduleTimeout(id);
  } catch (cause) { console.error('MQTT command publish failure', cause); await prisma.command.update({ where: { id }, data: { status: 'FAILED', errorMessage: 'MQTT publish failed', completedAt: new Date() } }); }
}
function scheduleTimeout(id: string) { const timeout = Number(process.env.COMMAND_TIMEOUT_MS ?? 5000); setTimeout(async () => { const command = await prisma.command.findUnique({ where: { id }, include: { device: true } }); if (!command || command.status !== 'SENT') return; const maximum = Number(process.env.COMMAND_MAX_RETRIES ?? 2); if (command.device.status !== 'online') { console.warn('Command stopped because device is offline', { commandId: command.commandId }); await prisma.command.update({ where: { id }, data: { status: 'FAILED', errorMessage: 'Device offline while waiting for state', completedAt: new Date() } }); return; } if (command.retryCount >= maximum) { console.warn('Command timeout', { commandId: command.commandId }); await prisma.command.update({ where: { id }, data: { status: 'TIMEOUT', errorMessage: 'State confirmation timeout', completedAt: new Date() } }); return; } console.warn('Command retry', { commandId: command.commandId, retry: command.retryCount + 1 }); await prisma.command.update({ where: { id }, data: { status: 'PENDING', retryCount: { increment: 1 } } }); void send(id); }, timeout); }
