import assert from 'node:assert/strict';
import test from 'node:test';
import { validateVoiceIntent, type VoiceCatalog } from '../src/lib/voice/ollama';

const catalog: VoiceCatalog = {
  rooms: [{ id: 'room-1', name: 'Phòng khách', home: 'Nhà chính', floor: 1 }],
  relays: [{ id: 'relay-1', name: 'Đèn phòng khách', kind: 'light', room: 'Phòng khách', home: 'Nhà chính' }],
};

test('accepts a control intent only for a catalogued relay and boolean state', () => {
  assert.deepEqual(validateVoiceIntent({ intent: 'CONTROL_DEVICE', relayId: 'relay-1', state: true }, catalog),
    { intent: 'CONTROL_DEVICE', relayId: 'relay-1', state: true });
  assert.equal(validateVoiceIntent({ intent: 'CONTROL_DEVICE', relayId: 'relay-other', state: true }, catalog), null);
  assert.equal(validateVoiceIntent({ intent: 'CONTROL_DEVICE', relayId: 'relay-1', state: 'true' }, catalog), null);
});

test('accepts only catalogued rooms and supported environment metrics', () => {
  assert.deepEqual(validateVoiceIntent({ intent: 'QUERY_ENVIRONMENT', roomId: 'room-1', metric: 'both' }, catalog),
    { intent: 'QUERY_ENVIRONMENT', roomId: 'room-1', metric: 'both' });
  assert.equal(validateVoiceIntent({ intent: 'QUERY_ENVIRONMENT', roomId: 'other', metric: 'temperature' }, catalog), null);
  assert.equal(validateVoiceIntent({ intent: 'QUERY_ENVIRONMENT', roomId: 'room-1', metric: 'soil_moisture' }, catalog), null);
});

test('clarification never carries an executable target', () => {
  assert.deepEqual(validateVoiceIntent({ intent: 'CLARIFY', relayId: 'relay-1', state: true }, catalog),
    { intent: 'CLARIFY' });
  assert.equal(validateVoiceIntent({ intent: 'DELETE_HOME', roomId: 'room-1' }, catalog), null);
});
