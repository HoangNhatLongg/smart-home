export type VoiceCatalog = {
  rooms: { id: string; name: string; home: string; floor: number | null }[];
  relays: { id: string; name: string; kind: string; room: string; home: string }[];
};

export type VoiceIntent =
  | { intent: 'CONTROL_DEVICE'; relayId: string; state: boolean }
  | { intent: 'QUERY_ENVIRONMENT'; roomId: string; metric: 'temperature' | 'humidity' | 'both' }
  | { intent: 'CLARIFY'; relayId?: never; roomId?: never };

const format = {
  type: 'object',
  additionalProperties: false,
  properties: {
    intent: { type: 'string', enum: ['CONTROL_DEVICE', 'QUERY_ENVIRONMENT', 'CLARIFY'] },
    relayId: { type: ['string', 'null'] },
    roomId: { type: ['string', 'null'] },
    state: { type: ['boolean', 'null'] },
    metric: { type: ['string', 'null'], enum: ['temperature', 'humidity', 'both', null] },
  },
  required: ['intent', 'relayId', 'roomId', 'state', 'metric'],
} as const;

export function validateVoiceIntent(value: unknown, catalog: VoiceCatalog): VoiceIntent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.intent === 'CLARIFY') return { intent: 'CLARIFY' };
  if (candidate.intent === 'CONTROL_DEVICE' && typeof candidate.relayId === 'string'
    && typeof candidate.state === 'boolean' && catalog.relays.some(relay => relay.id === candidate.relayId)) {
    return { intent: 'CONTROL_DEVICE', relayId: candidate.relayId, state: candidate.state };
  }
  if (candidate.intent === 'QUERY_ENVIRONMENT' && typeof candidate.roomId === 'string'
    && ['temperature', 'humidity', 'both'].includes(String(candidate.metric))
    && catalog.rooms.some(room => room.id === candidate.roomId)) {
    return { intent: 'QUERY_ENVIRONMENT', roomId: candidate.roomId, metric: candidate.metric as 'temperature' | 'humidity' | 'both' };
  }
  return null;
}

export async function classifyWithOllama(text: string, catalog: VoiceCatalog): Promise<VoiceIntent> {
  const baseUrl = (process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '');
  const model = process.env.OLLAMA_MODEL || 'qwen2.5:1.5b-instruct';
  const configuredTimeout = Number(process.env.OLLAMA_TIMEOUT_MS || 45_000);
  const timeout = Number.isFinite(configuredTimeout) ? Math.min(60_000, Math.max(3_000, configuredTimeout)) : 45_000;
  const system = [
    'Bạn là bộ phân loại ý định Smart Home tiếng Việt. Chỉ trả JSON đúng schema, không giải thích.',
    'Chỉ có 3 ý định: CONTROL_DEVICE, QUERY_ENVIRONMENT, CLARIFY.',
    'Chỉ chọn relayId hoặc roomId nguyên văn từ danh sách được cung cấp. Không tự tạo ID.',
    'CONTROL_DEVICE chỉ khi người dùng yêu cầu bật/tắt rõ ràng. state=true là bật/mở/cho chạy/cho sáng; false là tắt/đóng/ngừng.',
    'Nếu câu phủ định, mơ hồ, thiếu trạng thái, không có mục tiêu hoặc có nhiều mục tiêu phù hợp, chọn CLARIFY.',
    'QUERY_ENVIRONMENT dùng metric temperature, humidity hoặc both; không tự bịa số đo.',
    'Không tạo lịch, sửa cấu hình, OTA hoặc làm việc ngoài hai ý định trên.',
    'Ví dụ: "cho đèn phòng khách sáng lên" => CONTROL_DEVICE, state=true.',
    'Ví dụ: "ngừng quạt phòng ngủ đi" => CONTROL_DEVICE, state=false.',
    'Ví dụ: "trong phòng khách nóng bao nhiêu độ" => QUERY_ENVIRONMENT, metric=temperature.',
    'Ví dụ: "đừng bật đèn" => CLARIFY.',
  ].join('\n');
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      format,
      options: { temperature: 0 },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify({ catalog, utterance: text }) },
      ],
    }),
    signal: AbortSignal.timeout(timeout),
  });
  if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
  const envelope: unknown = await response.json();
  const content = (envelope as { message?: { content?: unknown } })?.message?.content;
  if (typeof content !== 'string') throw new Error('Ollama returned no message');
  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch { throw new Error('Ollama returned invalid JSON'); }
  const intent = validateVoiceIntent(parsed, catalog);
  if (!intent) throw new Error('Ollama returned an invalid or unauthorized target');
  return intent;
}
