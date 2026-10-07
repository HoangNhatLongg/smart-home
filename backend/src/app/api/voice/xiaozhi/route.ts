import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { badRequest, error, json, serverError } from '@/lib/http';
import { processVoiceText } from '@/lib/voice/service';

export async function POST(request: Request) {
  try {
    const expected = process.env.XIAOZHI_VOICE_TOKEN;
    const homeId = process.env.XIAOZHI_HOME_ID;
    if (!expected || expected.length < 32 || !homeId) return error('Xiaozhi voice integration is not configured', 503);
    const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
    const actualHash = crypto.createHash('sha256').update(supplied).digest();
    const expectedHash = crypto.createHash('sha256').update(expected).digest();
    if (!supplied || !crypto.timingSafeEqual(actualHash, expectedHash)) return error('Unauthorized robot', 401);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(homeId)) {
      return error('XIAOZHI_HOME_ID must be a Home UUID', 503);
    }
    const home = await prisma.home.findUnique({ where: { id: homeId }, select: { id: true } });
    if (!home) return error('Robot Home not found', 503);
    const body = await json(request);
    if (typeof body?.text !== 'string' || !body.text.trim() || body.text.length > 250) return badRequest('text must be a non-empty string under 250 characters');
    return NextResponse.json(await processVoiceText(body.text, { homeId: home.id }, 'robot'));
  } catch (cause) {
    return serverError(cause);
  }
}
