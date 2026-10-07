import { NextResponse } from 'next/server';
import { AuthError } from '@/lib/auth/authorize';
import { error, serverError } from '@/lib/http';
import { logs } from '@/lib/automation/routes';

export async function GET(request: Request, { params }: { params: Promise<{ automationId: string }> }) {
  try {
    const { automationId } = await params;
    const items = await logs(request, automationId, new URL(request.url).searchParams.get('limit'));
    return NextResponse.json(items);
  } catch (cause) {
    return cause instanceof AuthError ? error(cause.message, cause.status) : serverError(cause);
  }
}
