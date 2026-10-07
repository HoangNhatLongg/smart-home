import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

export type DailySchedule = { type: 'daily'; time: string };
export type SoilSchedule = {
  type: 'soil_moisture_below';
  sensorDeviceId: string;
  capability: 'soil_moisture';
  threshold: number;
  cooldownMinutes: number;
};
export type AutomationSchedule = DailySchedule | SoilSchedule;
export type AutomationAction = {
  deviceId: string;
  capability: string;
  command: 'set_relay';
  params: { state: boolean };
  offAfterMinutes?: number;
  offTime?: string;
};
export type AutomationInput = {
  name: string;
  enabled: boolean;
  schedule: AutomationSchedule;
  action: AutomationAction;
};

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

export function parseAutomationInput(value: unknown): AutomationInput | null {
  const input = record(value);
  const schedule = record(input?.schedule);
  const action = record(input?.action);
  const params = record(action?.params);
  if (!input || typeof input.name !== 'string' || input.name.trim().length < 1 || input.name.trim().length > 100 || typeof input.enabled !== 'boolean' || !schedule || !action || !params || typeof action.deviceId !== 'string' || typeof action.capability !== 'string' || action.command !== 'set_relay' || typeof params.state !== 'boolean') return null;

  let parsedSchedule: AutomationSchedule | null = null;
  if (schedule.type === 'daily' && typeof schedule.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.time)) {
    parsedSchedule = { type: 'daily', time: schedule.time };
  }
  if (schedule.type === 'soil_moisture_below' && typeof schedule.sensorDeviceId === 'string' && schedule.capability === 'soil_moisture' && typeof schedule.threshold === 'number' && Number.isFinite(schedule.threshold) && schedule.threshold >= 0 && schedule.threshold <= 100 && typeof schedule.cooldownMinutes === 'number' && Number.isInteger(schedule.cooldownMinutes) && schedule.cooldownMinutes >= 1 && schedule.cooldownMinutes <= 1440) {
    parsedSchedule = { type: 'soil_moisture_below', sensorDeviceId: schedule.sensorDeviceId, capability: 'soil_moisture', threshold: schedule.threshold, cooldownMinutes: schedule.cooldownMinutes };
  }
  const offAfterMinutes = action.offAfterMinutes === undefined ? undefined : typeof action.offAfterMinutes === 'number' ? action.offAfterMinutes : null;
  const offTime = action.offTime === undefined ? undefined : typeof action.offTime === 'string' ? action.offTime : null;
  if (!parsedSchedule || !/^relay_[1-8]$/.test(action.capability)) return null;
  if (offAfterMinutes === null) return null;
  if (offAfterMinutes !== undefined && (!Number.isInteger(offAfterMinutes) || offAfterMinutes < 1 || offAfterMinutes > 1440)) return null;
  if (offTime === null || offTime !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(offTime)) return null;
  if (offAfterMinutes !== undefined && offTime !== undefined) return null;
  if ((offAfterMinutes !== undefined || offTime !== undefined) && params.state !== true) return null;
  if (offTime !== undefined && parsedSchedule.type !== 'daily') return null;
  return {
    name: input.name.trim(),
    enabled: input.enabled,
    schedule: parsedSchedule,
    action: { deviceId: action.deviceId, capability: action.capability, command: 'set_relay', params: { state: params.state }, ...(offAfterMinutes === undefined ? {} : { offAfterMinutes }), ...(offTime === undefined ? {} : { offTime }) },
  };
}

export function readSchedule(value: Prisma.JsonValue): AutomationSchedule | null {
  const source = record(value);
  return parseAutomationInput({ name: 'stored', enabled: true, schedule: source, action: { deviceId: 'device', capability: 'relay_1', command: 'set_relay', params: { state: true } } })?.schedule ?? null;
}

export function readAction(value: Prisma.JsonValue): AutomationAction | null {
  const source = record(value);
  return parseAutomationInput({ name: 'stored', enabled: true, schedule: { type: 'daily', time: '00:00' }, action: source })?.action ?? null;
}

export async function validateAutomationForHome(homeId: string, input: AutomationInput): Promise<string | null> {
  const target = await prisma.device.findUnique({
    where: { deviceId: input.action.deviceId },
    include: { room: true, capabilities: { include: { capability: true } } },
  });
  if (!target || target.room.homeId !== homeId) return 'Thiết bị điều khiển không thuộc Home đã chọn.';
  const relay = target.capabilities.find((item) => item.instanceCode === input.action.capability && item.capability.code === 'relay');
  if (!relay) return 'Relay được chọn không tồn tại trên thiết bị.';
  const relayConfig = relay.config && typeof relay.config === 'object' && !Array.isArray(relay.config) ? relay.config as Record<string, unknown> : {};
  if (relayConfig.configured === false) return 'Relay được chọn hiện chưa được cấu hình trên ESP.';

  if (input.schedule.type === 'soil_moisture_below') {
    const sensor = await prisma.device.findUnique({
      where: { deviceId: input.schedule.sensorDeviceId },
      include: { room: true, capabilities: { include: { capability: true } } },
    });
    if (!sensor || sensor.room.homeId !== homeId) return 'Thiết bị cảm biến không thuộc Home đã chọn.';
    if (!sensor.capabilities.some((item) => item.instanceCode === 'soil_moisture' && item.capability.code === 'soil_moisture')) return 'Thiết bị cảm biến chưa có capability độ ẩm đất.';
    const kind = relayConfig.kind;
    if (kind !== 'pump') return 'Rule độ ẩm đất chỉ được điều khiển relay có loại Bơm tưới (pump).';
    if (input.action.params.state !== true || input.action.offAfterMinutes === undefined) return 'Rule tưới theo độ ẩm đất phải bật bơm và có thời lượng tự tắt.';
  }
  return null;
}

export const asJson = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;
