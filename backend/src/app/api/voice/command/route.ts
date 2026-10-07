import { NextResponse } from 'next/server';
import { requireUser, AuthError } from '@/lib/auth/authorize';
import { badRequest, error, json, serverError } from '@/lib/http';
import { processVoiceText } from '@/lib/voice/service';

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await json(request);
    if (typeof body?.text !== 'string' || !body.text.trim() || body.text.length > 250) return badRequest('text must be a non-empty string under 250 characters');
    return NextResponse.json(await processVoiceText(body.text, { userId: user.id }));
  } catch (cause) {
    return cause instanceof AuthError ? error(cause.message, cause.status) : serverError(cause);
  }
}
