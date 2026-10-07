import { prisma } from '@/lib/db/prisma';
import { createAndSendCommand } from '@/lib/commands/service';
import { classifyWithOllama, type VoiceCatalog } from '@/lib/voice/ollama';

export type VoiceResult = { success: boolean; message: string; commandId: string | null };
const reply = (success: boolean, message: string, commandId: string | null = null): VoiceResult => ({ success, message, commandId });
const normalize = (value: string) => value.toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
const containsPhrase = (text: string, phrase: string) => !!phrase && (` ${text} `).includes(` ${phrase} `);
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const label = (value: string) => value.trim() || 'thiết bị';
const MAX_SAMPLE_AGE_MS = 5 * 60_000;

type Scope = { userId?: string; homeId?: string };

function roomMatches(text: string, name: string, category: string, floor: number | null) {
  const full = normalize(name);
  const floorMention = /\b(tang|lau)\s*(\d+)\b/.exec(text);
  const nameIncludesFloor = /\b(tang|lau)\s*\d+\b/.test(full);
  if (floorMention && floor !== Number(floorMention[2]) && !(nameIncludesFloor && containsPhrase(text, full))) return false;
  if (containsPhrase(text, full)) return true;
  const categoryNames: Record<string, string[]> = {
    living_room: ['phong khach'], bedroom: ['phong ngu'], kitchen: ['phong bep', 'bep'],
    bathroom: ['phong tam', 'nha tam'], office: ['phong lam viec'],
    dining_room: ['phong an'], garage: ['gara'], outdoor: ['ngoai troi'],
  };
  return (categoryNames[category] ?? []).some(alias => containsPhrase(text, alias));
}

async function environmentForRoom(room: { name: string; devices: { id: string }[] }, wanted: string[]): Promise<VoiceResult> {
  const deviceIds = room.devices.map(device => device.id);
  if (!deviceIds.length) return reply(false, `${room.name} chưa có thiết bị đo.`);
  const samples = await prisma.telemetry.findMany({ where: { deviceId: { in: deviceIds } }, orderBy: { recordedAt: 'desc' }, take: 100 });
  const measurements = wanted.map(key => {
    const sample = samples.find(item => typeof record(item.data)[key] === 'number' && Number.isFinite(record(item.data)[key]));
    return sample ? { key, value: record(sample.data)[key] as number, at: sample.recordedAt } : null;
  }).filter((value): value is { key: string; value: number; at: Date } => value !== null);
  if (!measurements.length) return reply(false, `Chưa có số đo ${wanted.join(' và ')} của ${room.name}.`);
  if (measurements.length !== wanted.length) return reply(false, `Chưa có đủ số đo nhiệt độ và độ ẩm của ${room.name}.`);
  const newest = Math.min(...measurements.map(item => item.at.valueOf()));
  if (Date.now() - newest > MAX_SAMPLE_AGE_MS || newest > Date.now() + 30_000) {
    return reply(false, `Số đo gần nhất của ${room.name} đã quá 5 phút; hiện chưa có dữ liệu mới để trả lời chính xác.`);
  }
  const values = measurements.map(item => item.key === 'temperature' ? `nhiệt độ ${item.value.toLocaleString('vi-VN')} độ C` : `độ ẩm ${item.value.toLocaleString('vi-VN')} phần trăm`);
  const measuredAt = new Date(newest).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' });
  return reply(true, `${room.name} có ${values.join(' và ')} (đo lúc ${measuredAt}).`);
}

async function environment(text: string, scope: Scope): Promise<VoiceResult> {
  const wantsTemperature = containsPhrase(text, 'nhiet do');
  const wantsHumidity = containsPhrase(text, 'do am') || containsPhrase(text, 'am do');
  const homes = await prisma.home.findMany({ where: scope.homeId ? { id: scope.homeId } : { ownerId: scope.userId }, include: { rooms: { include: { devices: true } } } });
  const rooms = homes.flatMap(home => home.rooms.map(room => ({ home, room })));
  const matches = rooms.filter(({ room }) => roomMatches(text, room.name, room.category, room.floor));
  if (!matches.length) return reply(false, 'Bạn muốn hỏi số đo ở phòng nào? Hãy nói rõ tên phòng.');
  // Prefer exact user-defined room names over broad category aliases.
  const exact = matches.filter(({ room }) => containsPhrase(text, normalize(room.name)));
  const selected = exact.length ? exact : matches;
  if (selected.length !== 1) return reply(false, 'Có nhiều phòng phù hợp. Hãy nói đầy đủ tên phòng hoặc tầng.');
  const { room } = selected[0];
  const wanted = [wantsTemperature && 'temperature', wantsHumidity && 'humidity'].filter((value): value is string => !!value);
  return environmentForRoom(room, wanted);
}

async function waitForConfirmation(commandId: string): Promise<'SUCCESS' | 'FAILED' | 'TIMEOUT' | 'PENDING'> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const command = await prisma.command.findUnique({ where: { commandId }, select: { status: true } });
    if (command?.status === 'SUCCESS' || command?.status === 'FAILED' || command?.status === 'TIMEOUT') return command.status;
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  return 'PENDING';
}

async function executeControl(target: { device: { deviceId: string; status: string }; cap: { instanceCode: string }; name: string }, state: boolean): Promise<VoiceResult> {
  if (target.device.status !== 'online') return reply(false, `${target.name} hiện không kết nối.`);
  const command = await createAndSendCommand(target.device.deviceId, 'set_relay', { capability: target.cap.instanceCode, state });
  const status = await waitForConfirmation(command.commandId);
  if (status === 'SUCCESS') return reply(true, `Đã ${state ? 'bật' : 'tắt'} ${label(target.name)}.`, command.commandId);
  if (status === 'PENDING') return reply(false, `Đã gửi lệnh ${state ? 'bật' : 'tắt'} ${label(target.name)}, nhưng chưa có xác nhận từ thiết bị.`, command.commandId);
  return reply(false, `Không ${state ? 'bật' : 'tắt'} được ${label(target.name)}: thiết bị không xác nhận lệnh.`, command.commandId);
}

async function control(text: string, scope: Scope, state: boolean): Promise<VoiceResult> {
  const homes = await prisma.home.findMany({
    where: scope.homeId ? { id: scope.homeId } : { ownerId: scope.userId },
    include: {
      rooms: {
        include: {
          devices: {
            include: {
              capabilities: { include: { capability: true } },
            },
          },
        },
      },
    },
  });
  const namedRooms = homes.flatMap(home => home.rooms).filter(room => roomMatches(text, room.name, room.category, room.floor));
  const exactRooms = namedRooms.filter(room => containsPhrase(text, normalize(room.name)));
  const roomScope = exactRooms.length ? exactRooms : namedRooms;
  const matches = homes.flatMap(home => home.rooms.flatMap(room => room.devices.flatMap(device => device.capabilities
    .filter(cap => cap.capability.code === 'relay')
    .map(cap => ({ home, room, device, cap, name: cap.name?.trim() || device.name, kind: record(cap.config).kind })))))
    .filter(item => {
      if (roomScope.length && !roomScope.some(room => room.id === item.room.id)) return false;
      const name = normalize(item.name);
      const deviceName = normalize(item.device.name);
      const roomName = normalize(item.room.name);
      const objectName = item.kind === 'light' ? 'den' : item.kind === 'fan' ? 'quat' : item.kind === 'pump' ? 'bom' : '';
      const roomQualified = objectName && containsPhrase(text, `${objectName} ${roomName}`);
      return containsPhrase(text, name) || (roomQualified && item.room.devices.length > 0) || (item.device.capabilities.filter(cap => cap.capability.code === 'relay').length === 1 && containsPhrase(text, deviceName));
    });
  if (!matches.length) return reply(false, 'Không tìm thấy relay có tên phù hợp. Hãy đặt tên cho relay trong cấu hình thiết bị.');
  if (matches.length !== 1) return reply(false, 'Có nhiều relay phù hợp. Hãy nói rõ tên relay và phòng cần điều khiển.');
  return executeControl(matches[0], state);
}

async function processOllamaVoiceText(rawText: string, scope: Scope): Promise<VoiceResult> {
  const homes = await prisma.home.findMany({
    where: scope.homeId ? { id: scope.homeId } : { ownerId: scope.userId },
    include: { rooms: { include: { devices: { include: { capabilities: { include: { capability: true } } } } } } },
  });
  const rooms = homes.flatMap(home => home.rooms.map(room => ({ home, room })));
  const relays = rooms.flatMap(({ home, room }) => room.devices.flatMap(device => device.capabilities
    .filter(cap => cap.capability.code === 'relay')
    .map(cap => ({ home, room, device, cap, name: cap.name?.trim() || device.name, kind: String(record(cap.config).kind || 'other') }))));
  const catalog: VoiceCatalog = {
    rooms: rooms.map(({ home, room }) => ({ id: room.id, name: room.name, home: home.name, floor: room.floor })),
    relays: relays.map(item => ({ id: item.cap.id, name: item.name, kind: item.kind, room: item.room.name, home: item.home.name })),
  };
  let intent;
  try {
    intent = await classifyWithOllama(rawText, catalog);
  } catch (cause) {
    console.error('Ollama voice classification failed:', cause instanceof Error ? cause.message : 'unknown error');
    return reply(false, 'AI cục bộ đang không phản hồi hoặc chưa được cấu hình. Chưa gửi lệnh tới thiết bị.');
  }
  if (intent.intent === 'CLARIFY') return reply(false, 'Mình chưa xác định chắc chắn yêu cầu. Hãy nói rõ phòng, tên thiết bị và bật hay tắt.');
  const text = normalize(rawText);
  if (intent.intent === 'QUERY_ENVIRONMENT') {
    const selected = rooms.find(({ room }) => room.id === intent.roomId);
    if (!selected) return reply(false, 'Không tìm thấy phòng phù hợp.');
    const matched = rooms.filter(({ room }) => roomMatches(text, room.name, room.category, room.floor));
    const exact = matched.filter(({ room }) => containsPhrase(text, normalize(room.name)));
    const mentioned = exact.length ? exact : matched;
    if (rooms.length > 1 && (mentioned.length !== 1 || mentioned[0].room.id !== selected.room.id)) {
      return reply(false, 'Hãy nói rõ tên phòng hoặc tầng để mình đọc đúng số đo.');
    }
    const wanted = intent.metric === 'both' ? ['temperature', 'humidity'] : [intent.metric];
    return environmentForRoom(selected.room, wanted);
  }
  if (/\b(khong|chua)\b/.test(text) || /đừng/iu.test(rawText)) return reply(false, 'Câu lệnh có từ phủ định; hãy nói rõ bật hoặc tắt thiết bị.');
  const explicitOn = /\b(bat|mo)\b/.test(text);
  const explicitOff = /\b(tat|dong|ngung|dung)\b/.test(text);
  const otherOn = /\b(sang|chay|khoi dong|kich hoat)\b/.test(text);
  const otherOff = /\b(ngat|nghi)\b/.test(text);
  if (!explicitOn && !explicitOff && !otherOn && !otherOff) {
    return reply(false, 'Hãy nói rõ hành động bật hoặc tắt thiết bị.');
  }
  if ((explicitOn && explicitOff)
    || (explicitOn && !intent.state) || (explicitOff && intent.state)
    || (!explicitOn && !explicitOff && ((otherOn && otherOff) || (otherOn && !intent.state) || (otherOff && intent.state)))) {
    return reply(false, 'Mình chưa chắc bạn muốn bật hay tắt. Hãy nói lại lệnh rõ hơn.');
  }
  const selected = relays.find(item => item.cap.id === intent.relayId);
  if (!selected) return reply(false, 'Không tìm thấy relay phù hợp.');
  const named = relays.filter(item => containsPhrase(text, normalize(item.name)));
  const kindAliases: Record<string, string[]> = { light: ['den'], fan: ['quat'], pump: ['bom', 'tuoi cay'], socket: ['o cam'] };
  const kind = relays.filter(item => (kindAliases[item.kind] ?? []).some(alias => containsPhrase(text, alias)));
  const matchedRooms = rooms.filter(item => roomMatches(text, item.room.name, item.room.category, item.room.floor));
  const exactRooms = matchedRooms.filter(item => containsPhrase(text, normalize(item.room.name)));
  const room = exactRooms.length ? exactRooms : matchedRooms;
  let candidates = named.length ? named : kind.length ? kind : relays;
  if (room.length) candidates = candidates.filter(item => room.some(match => match.room.id === item.room.id));
  if (candidates.length !== 1 || candidates[0].cap.id !== selected.cap.id) {
    return reply(false, 'Có nhiều thiết bị phù hợp. Hãy nói rõ tên relay và phòng cần điều khiển.');
  }
  return executeControl(selected, intent.state);
}

export async function processVoiceText(rawText: string, scope: Scope, source: 'web' | 'robot' = 'web'): Promise<VoiceResult> {
  const text = normalize(rawText);
  if (!text || text.length > 250) return reply(false, 'Câu nói trống hoặc quá dài.');
  if (source === 'web' && process.env.VOICE_PROVIDER === 'ollama') return processOllamaVoiceText(rawText, scope);
  const query = containsPhrase(text, 'nhiet do') || containsPhrase(text, 'do am') || containsPhrase(text, 'am do');
  if (query) return environment(text, scope);
  const on = /\b(bat|mo)\b/.test(text);
  const off = /\b(tat|dong)\b/.test(text);
  if (on === off) return reply(false, 'Hãy nói rõ bật hoặc tắt thiết bị, hoặc hỏi nhiệt độ và độ ẩm của một phòng.');
  return control(text, scope, on);
}
