import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db/prisma';
const COOKIE = 'smarthome_session';
const secret = () => process.env.AUTH_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'development-only-secret-change-me');
const sign = (value: string) => crypto.createHmac('sha256', secret()).update(value).digest('base64url');
export async function hashPassword(password: string) { const salt = crypto.randomBytes(16).toString('hex'); const hash = await new Promise<Buffer>((resolve, reject) => crypto.scrypt(password, salt, 64, (err, key) => err ? reject(err) : resolve(key))); return `${salt}:${hash.toString('hex')}`; }
export async function verifyPassword(password: string, stored: string) { const [salt, expected] = stored.split(':'); if (!salt || !expected) return false; const actual = await new Promise<Buffer>((resolve, reject) => crypto.scrypt(password, salt, 64, (err, key) => err ? reject(err) : resolve(key))); return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), actual); }
export async function login(userId: string) { if (!secret()) throw new Error('AUTH_SECRET must be configured'); const value = `${userId}.${sign(userId)}`; (await cookies()).set(COOKIE, value, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 7 }); }
export async function logout() { (await cookies()).delete(COOKIE); }
export async function currentUser() { const value = (await cookies()).get(COOKIE)?.value; if (!value) return null; const [id, signature] = value.split('.'); const expected = id ? sign(id) : ''; if (!id || !signature || signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null; return prisma.user.findUnique({ where: { id }, select: { id: true, email: true } }); }
