import { createHash, timingSafeEqual } from 'node:crypto';

export const pairingHash = (value: string) => createHash('sha256').update(value).digest('hex');
export const validDeviceId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{4,31}$/.test(value);
export const validPairingCode = (value: unknown): value is string => typeof value === 'string' && /^[A-Z0-9]{10}$/.test(value);
export const validDeviceSecret = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const validMqttUri = (value: unknown): value is string => typeof value === 'string' && /^mqtts?:\/\/[^\s/@]+(?::\d{1,5})?$/.test(value) && value.length < 128;
export function secretMatches(secret: string, expectedHash: string): boolean {
  return timingSafeEqual(Buffer.from(pairingHash(secret), 'hex'), Buffer.from(expectedHash, 'hex'));
}
