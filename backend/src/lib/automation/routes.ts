import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { AuthError, ownedHome } from '@/lib/auth/authorize';
import { badRequest, error, json, limit, serverError } from '@/lib/http';
import { asJson, parseAutomationInput, validateAutomationForHome } from '@/lib/automation/model';

async function ownedAutomation(id: string) {
  const rule = await prisma.automationRule.findUnique({ where: { id } });
  if (!rule) throw new AuthError(404, 'Automation not found');
  await ownedHome(rule.homeId);
  return rule;
}

export async function GET(_: Request, { params }: { params: Promise<{ automationId: string }> }) {
  try {
    const { automationId } = await params;
    return NextResponse.json(await ownedAutomation(automationId));
  } catch (cause) {
    return cause instanceof AuthError ? error(cause.message, cause.status) : serverError(cause);
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ automationId: string }> }) {
  try {
    const { automationId } = await params;
    const current = await ownedAutomation(automationId);
    const input = parseAutomationInput(await json(request));
    if (!input) return badRequest('Invalid automation rule');
    const reason = await validateAutomationForHome(current.homeId, input);
    if (reason) return badRequest(reason);
    const rule = await prisma.automationRule.update({
      where: { id: current.id },
      data: {
        name: input.name,
        enabled: input.enabled,
        schedule: asJson(input.schedule),
        action: asJson(input.action),
      },
    });
    return NextResponse.json(rule);
  } catch (cause) {
    return cause instanceof AuthError ? error(cause.message, cause.status) : serverError(cause);
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ automationId: string }> }) {
  try {
    const { automationId } = await params;
    const current = await ownedAutomation(automationId);
    await prisma.automationRule.delete({ where: { id: current.id } });
    return new NextResponse(null, { status: 204 });
  } catch (cause) {
    return cause instanceof AuthError ? error(cause.message, cause.status) : serverError(cause);
  }
}

export async function logs(_: Request, automationId: string, requestedLimit: string | null) {
  const current = await ownedAutomation(automationId);
  return prisma.automationLog.findMany({
    where: { automationRuleId: current.id },
    orderBy: { executedAt: 'desc' },
    take: limit(requestedLimit),
  });
}
