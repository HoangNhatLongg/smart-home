import { NextResponse } from 'next/server'; import { logout } from '@/lib/auth/session'; export async function POST() { await logout(); return NextResponse.json({ success: true }); }
