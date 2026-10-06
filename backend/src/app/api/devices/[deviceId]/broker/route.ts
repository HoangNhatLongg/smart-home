import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { ownedDevice, AuthError } from '@/lib/auth/authorize';
import { badRequest, error, json, serverError } from '@/lib/http';
import { validMqttUri } from '@/lib/provisioning';

export async function PUT(request: Request, { params }: { params: Promise<{ deviceId: string }> }) {
  try {
    const { deviceId } = await params;
    const device = await ownedDevice(deviceId);
    const body = await json(request);
    if (!validMqttUri(body?.mqttUri)) return badRequest('Invalid MQTT URI');
    const pairing = await prisma.devicePairing.findUnique({ where: { deviceRecordId: device.id } });
    if (!pairing) return error('Device was not paired through bootstrap', 409);
    await prisma.devicePairing.update({ where: { id: pairing.id }, data: { mqttUri: body.mqttUri } });
    return NextResponse.json({ deviceId, mqttUri: body.mqttUri });
  } catch (cause) { return cause instanceof AuthError ? error(cause.message, cause.status) : serverError(cause); }
}
