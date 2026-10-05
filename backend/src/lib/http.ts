import { NextResponse } from 'next/server';
export const error = (message: string, status: number) => NextResponse.json({ error: message }, { status });
export const badRequest = (message = 'Invalid input') => error(message, 400);
export const serverError = (cause: unknown) => { console.error('Backend error', cause); return error('Internal server error', 500); };
export async function json(request: Request): Promise<Record<string, unknown> | null> { try { const body: unknown = await request.json(); return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : null; } catch { return null; } }
export function date(value: string | null): Date | undefined { if (!value) return undefined; const parsed = new Date(value); return Number.isNaN(parsed.valueOf()) ? undefined : parsed; }
export function limit(value: string | null) { const parsed = Number(value ?? 100); return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 500) : 100; }
