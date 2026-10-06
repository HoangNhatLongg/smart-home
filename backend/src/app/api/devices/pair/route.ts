import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { ownedHome, AuthError } from '@/lib/auth/authorize';
import { badRequest, error, json, serverError } from '@/lib/http';
import { pairingHash, validMqttUri, validPairingCode } from '@/lib/provisioning';

export async function POST(request: Request) {
  try {
    const body = await json(request);
    if (!validPairingCode(body?.pairingCode) || typeof body?.homeId !== 'string' || typeof body.roomId !== 'string' || typeof body.name !== 'string' || !body.name.trim() || !validMqttUri(body.mqttUri)) return badRequest('Invalid pairing request');
    const { pairingCode, homeId, roomId, name, mqttUri } = body as { pairingCode: string; homeId: string; roomId: string; name: string; mqttUri: string };
    await ownedHome(homeId);
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room || room.homeId !== homeId) return error('Room does not belong to Home', 404);
    const result = await prisma.$transaction(async (tx) => {
      const pairing = await tx.devicePairing.findUnique({ where: { pairingCodeHash: pairingHash(pairingCode) } });
      if (!pairing || pairing.expiresAt < new Date()) return null;
      if (pairing.status !== 'pending') return 'paired' as const;
      const device = await tx.device.create({ data: { deviceId: pairing.deviceId, name: name.trim(), roomId: room.id, status: 'unknown' } });
      await tx.devicePairing.update({ where: { id: pairing.id }, data: { status: 'paired', deviceRecordId: device.id, mqttUri, pairedAt: new Date() } });
      return device;
    });
    if (!result) return error('Pairing code not found or expired', 404);
    if (result === 'paired') return error('Device already paired', 409);
    return NextResponse.json(result, { status: 201 });
  } catch (cause) {
    if (cause instanceof AuthError) return error(cause.message, cause.status);
    if ((cause as { code?: string }).code === 'P2002') return error('Device already paired', 409);
    return serverError(cause);
  }
}
