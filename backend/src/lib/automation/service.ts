import { prisma } from '@/lib/db/prisma';
import { createAndSendCommand } from '@/lib/commands/service';
import { readAction, readSchedule, type AutomationAction } from './model';

type Rule = {
  id: string;
  enabled: boolean;
  schedule: unknown;
  action: unknown;
};

const timezone = process.env.AUTOMATION_TIMEZONE ?? 'Asia/Ho_Chi_Minh';
const checkIntervalMs = 15_000;

function localTime(now: Date): string {
  const values = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const hour = values.find((part) => part.type === 'hour')?.value ?? '00';
  const minute = values.find((part) => part.type === 'minute')?.value ?? '00';
  return hour + ':' + minute;
}

function minuteStart(now: Date): Date {
  const start = new Date(now);
  start.setSeconds(0, 0);
  return start;
}

class AutomationService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.runDueSchedules(), checkIntervalMs);
    void this.runDueSchedules();
    console.info('Automation scheduler started', { timezone, checkIntervalMs });
  }

  async runDueSchedules(now = new Date()) {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const rules = await prisma.automationRule.findMany({ where: { enabled: true } });
      const time = localTime(now);
      const start = minuteStart(now);
      const end = new Date(start.valueOf() + 60_000);
      for (const rule of rules) {
        const schedule = readSchedule(rule.schedule);
        if (!schedule || schedule.type !== 'daily' || schedule.time !== time) continue;
        const existing = await prisma.automationLog.findFirst({
          where: { automationRuleId: rule.id, executedAt: { gte: start, lt: end } },
        });
        if (!existing) await this.execute(rule, 'SCHEDULE_ON');
      }
      for (const rule of rules) {
        const schedule = readSchedule(rule.schedule);
        const action = readAction(rule.action as never);
        if (!schedule || schedule.type !== 'daily' || !action?.offTime || action.offTime !== time) continue;
        const existing = await prisma.automationLog.findFirst({
          where: { automationRuleId: rule.id, executedAt: { gte: start, lt: end } },
        });
        if (!existing) await this.execute(rule, 'SCHEDULE_OFF', { ...action, params: { state: false }, offAfterMinutes: undefined, offTime: undefined });
      }
    } catch (cause) {
      console.error('Automation scheduler failure', cause);
    } finally {
      this.ticking = false;
    }
  }

  async handleTelemetry(deviceRecordId: string, data: Record<string, unknown>, recordedAt: Date) {
    const moisture = data.soil_moisture;
    if (typeof moisture !== 'number' || !Number.isFinite(moisture)) return;
    try {
      const sensor = await prisma.device.findUnique({ where: { id: deviceRecordId } });
      if (!sensor) return;
      const rules = await prisma.automationRule.findMany({ where: { enabled: true } });
      for (const rule of rules) {
        const schedule = readSchedule(rule.schedule);
        if (!schedule || schedule.type !== 'soil_moisture_below' || schedule.sensorDeviceId !== sensor.deviceId || moisture >= schedule.threshold) continue;
        const cooldownStart = new Date(recordedAt.valueOf() - schedule.cooldownMinutes * 60_000);
        const previous = await prisma.automationLog.findFirst({
          where: { automationRuleId: rule.id, executedAt: { gte: cooldownStart } },
          orderBy: { executedAt: 'desc' },
        });
        if (previous) continue;
        await this.execute(rule, 'SOIL_MOISTURE_BELOW ' + moisture + '%');
      }
    } catch (cause) {
      console.error('Automation telemetry evaluation failure', { deviceRecordId, cause });
    }
  }

  private async execute(rule: Rule, source: string, overrideAction?: AutomationAction) {
    const action = overrideAction ?? readAction(rule.action as never);
    if (!action) {
      await this.log(rule.id, null, 'FAILED', 'Invalid automation action');
      return;
    }
    try {
      const device = await prisma.device.findUnique({
        where: { deviceId: action.deviceId },
        include: { room: true, capabilities: { include: { capability: true } } },
      });
      if (!device) {
        await this.log(rule.id, null, 'FAILED', 'Target device no longer exists');
        return;
      }
      if (device.status !== 'online') {
        await this.log(rule.id, null, 'SKIPPED', 'Target device is offline');
        return;
      }
      if (!this.hasRelay(device.capabilities, action)) {
        await this.log(rule.id, null, 'FAILED', 'Target relay is unavailable');
        return;
      }
      const command = await createAndSendCommand(action.deviceId, action.command, {
        capability: action.capability,
        state: action.params.state,
      });
      const log = await this.log(rule.id, command.id, 'PENDING', source);
      void this.watchCommand(log.id, command.id, action, rule, source);
    } catch (cause) {
      console.error('Automation command failure', { automationId: rule.id, cause });
      await this.log(rule.id, null, 'FAILED', 'Could not create automation command');
    }
  }

  private hasRelay(capabilities: Array<{ instanceCode: string; capability: { code: string }; config: unknown }>, action: AutomationAction): boolean {
    return capabilities.some((item) => {
      if (item.instanceCode !== action.capability || item.capability.code !== 'relay') return false;
      const config = item.config && typeof item.config === 'object' && !Array.isArray(item.config) ? item.config as Record<string, unknown> : {};
      return config.configured !== false;
    });
  }

  private async log(automationRuleId: string, commandId: string | null, executionStatus: string, errorMessage: string | null) {
    return prisma.automationLog.create({ data: { automationRuleId, commandId, executionStatus, errorMessage } });
  }

  private async watchCommand(logId: string, commandId: string, action: AutomationAction, rule: Rule, source: string) {
    const timeout = Number(process.env.COMMAND_TIMEOUT_MS ?? 5000);
    const retries = Number(process.env.COMMAND_MAX_RETRIES ?? 2);
    const deadline = Date.now() + Math.max(10_000, timeout * (retries + 2) + 2_000);
    while (Date.now() < deadline) {
      await new Promise<void>((resolve) => setTimeout(resolve, 1_000));
      const command = await prisma.command.findUnique({ where: { id: commandId } });
      if (!command || !['SUCCESS', 'FAILED', 'TIMEOUT'].includes(command.status)) continue;
      await prisma.automationLog.update({
        where: { id: logId },
        data: { executionStatus: command.status, errorMessage: command.errorMessage },
      });
      if (command.status === 'SUCCESS' && action.params.state === true && action.offAfterMinutes) {
        const delayMs = action.offAfterMinutes * 60_000;
        console.info('Automation auto-off scheduled', { automationId: rule.id, delayMs, source });
        setTimeout(() => void this.execute(rule, 'AUTO_OFF_AFTER_' + action.offAfterMinutes + '_MINUTES', { ...action, params: { state: false }, offAfterMinutes: undefined, offTime: undefined }), delayMs);
      }
      return;
    }
    await prisma.automationLog.update({
      where: { id: logId },
      data: { executionStatus: 'TIMEOUT', errorMessage: 'Command confirmation wait expired' },
    });
  }
}

const globalAutomation = globalThis as unknown as { automationService?: AutomationService };
export const automationService = globalAutomation.automationService ?? new AutomationService();
if (process.env.NODE_ENV !== 'production') globalAutomation.automationService = automationService;
