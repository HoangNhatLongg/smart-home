import { prisma } from '@/lib/db/prisma';
import { currentUser } from './session';
export async function requireUser() { const user = await currentUser(); if (!user) throw new AuthError(401, 'Unauthenticated'); return user; }
export async function ownedHome(homeId: string) { const user = await requireUser(); const home = await prisma.home.findUnique({ where: { id: homeId } }); if (!home) throw new AuthError(404, 'Home not found'); if (home.ownerId !== user.id) { console.warn('Authorization failure', { userId: user.id, homeId }); throw new AuthError(403, 'Forbidden'); } return home; }
export async function ownedDevice(deviceId: string) { const user = await requireUser(); const device = await prisma.device.findUnique({ where: { deviceId }, include: { room: { include: { home: true } } } }); if (!device) throw new AuthError(404, 'Device not found'); if (device.room.home.ownerId !== user.id) { console.warn('Authorization failure', { userId: user.id, deviceId }); throw new AuthError(403, 'Forbidden'); } return device; }
export class AuthError extends Error { constructor(public status: number, message: string) { super(message); } }
