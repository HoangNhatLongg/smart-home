import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { AuthError, ownedHome } from '@/lib/auth/authorize';
import { badRequest, error, json, serverError } from '@/lib/http';
import { asJson, parseAutomationInput, validateAutomationForHome } from '@/lib/automation/model';

export async function GET(_: Request, { params }: { params: Promise<{ homeId: string }> }) {
  try {
    const { homeId } = await params;
    await ownedHome(homeId);
    const automations = await prisma.automationRule.findMany({
      where: { homeId },
      orderBy: [{ enabled: 'desc' }, { updatedAt: 'desc' }],
    });
    return NextResponse.json(automations);
  } catch (cause) {
    return cause instanceof AuthError ? error(cause.message, cause.status) : serverError(cause);
  }
}
export async function POST(request: Request, { params }: { params: Promise<{ homeId: string }> }) {
  try {
    const { homeId } = await params;
    await ownedHome(homeId);
    const input = parseAutomationInput(await json(request));
    if (!input) return badRequest('Invalid automation rule');
    const reason = await validateAutomationForHome(homeId, input);
    if (reason) return badRequest(reason);
    const rule = await prisma.automationRule.create({
      data: {
        homeId,
        name: input.name,
        enabled: input.enabled,
        schedule: asJson(input.schedule),
        action: asJson(input.action),
      },
    });
    return NextResponse.json(rule, { status: 201 });
  } catch (cause) {
    return cause instanceof AuthError ? error(cause.message, cause.status) : serverError(cause);
  }
}
