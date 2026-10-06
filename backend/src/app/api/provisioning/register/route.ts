import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { badRequest, error, json, serverError } from '@/lib/http';
import { pairingHash, secretMatches, validDeviceId, validDeviceSecret, validPairingCode } from '@/lib/provisioning';

export async function POST(request: Request) {
  try {
    const body = await json(request);
    if (!validDeviceId(body?.deviceId) || !validPairingCode(body?.pairingCode) || !validDeviceSecret(body?.deviceSecret)) return badRequest('Invalid device registration');
    await prisma.devicePairing.deleteMany({ where: { status: 'pending', expiresAt: { lt: new Date() } } });
    const existingDevice = await prisma.device.findUnique({ where: { deviceId: body.deviceId } });
    if (existingDevice) return error('Device already paired', 409);
    const existing = await prisma.devicePairing.findUnique({ where: { deviceId: body.deviceId } });
    if (existing && !secretMatches(body.deviceSecret, existing.deviceSecretHash)) return error('Device secret mismatch', 403);
    if (existing?.status === 'paired') return error('Device already paired', 409);
    const expiresAt = new Date(Date.now() + 15 * 60_000);
    const pairing = await prisma.devicePairing.upsert({
      where: { deviceId: body.deviceId },
      create: { deviceId: body.deviceId, deviceSecretHash: pairingHash(body.deviceSecret), pairingCodeHash: pairingHash(body.pairingCode), status: 'pending', expiresAt },
      update: { pairingCodeHash: pairingHash(body.pairingCode), expiresAt },
    });
    return NextResponse.json({ status: pairing.status, expiresAt: pairing.expiresAt }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (cause) {
    if ((cause as { code?: string }).code === 'P2002') return error('Pairing code already in use', 409);
    return serverError(cause);
  }
}
