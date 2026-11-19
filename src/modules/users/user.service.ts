import { prisma } from '../../config/database.js';
import { publicUserSelect, type PublicUser } from './user.types.js';

export async function findUserById(id: string): Promise<PublicUser | null> {
  return prisma.user.findUnique({ where: { id }, select: publicUserSelect });
}

export async function findUserByEmail(email: string): Promise<PublicUser | null> {
  return prisma.user.findUnique({ where: { email }, select: publicUserSelect });
}
