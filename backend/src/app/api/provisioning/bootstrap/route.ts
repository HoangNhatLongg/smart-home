import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { badRequest, error, json, serverError } from '@/lib/http';
import { secretMatches, validDeviceId, validDeviceSecret } from '@/lib/provisioning';

export async function POST(request: Request) {
  try {
    const body = await json(request);
    if (!validDeviceId(body?.deviceId) || !validDeviceSecret(body?.deviceSecret)) return badRequest('Invalid bootstrap request');
    const pairing = await prisma.devicePairing.findUnique({ where: { deviceId: body.deviceId }, include: { device: { include: { room: true } } } });
    if (!pairing || !secretMatches(body.deviceSecret, pairing.deviceSecretHash)) return error('Device not registered', 403);
    const headers = { 'Cache-Control': 'no-store' };
    if (pairing.status !== 'paired' || !pairing.device || !pairing.mqttUri) {
      if (pairing.expiresAt < new Date()) return error('Pairing expired', 410);
      return NextResponse.json({ status: 'pending' }, { headers });
    }
    return NextResponse.json({ status: 'paired', deviceId: pairing.deviceId, homeId: pairing.device.room.homeId, roomId: pairing.device.roomId, mqtt: { uri: pairing.mqttUri, username: process.env.MQTT_DEVICE_USERNAME ?? '', password: process.env.MQTT_DEVICE_PASSWORD ?? '' } }, { headers });
  } catch (cause) { return serverError(cause); }
}
