import { describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/config/database.js';
import { findUserByEmail, findUserById } from '../src/modules/users/user.service.js';
import { publicUserSelect, type PublicUser } from '../src/modules/users/user.types.js';

// The replaced delegate returns plain promises rather than Prisma relation-aware promises.
const userLookup = vi.mocked(prisma.user.findUnique as unknown as (args: { where: { id: string } | { email: string }; select: typeof publicUserSelect }) => Promise<PublicUser | null>);

const user: PublicUser = { id: 'user-1', name: 'Ada', email: 'ada@example.com', role: 'CUSTOMER', createdAt: new Date(), updatedAt: new Date() };

describe('internal user lookups', () => {
  it('finds a user by ID using an explicit safe selection', async () => {
    userLookup.mockResolvedValueOnce(user);
    expect(await findUserById('user-1')).toEqual(user);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'user-1' }, select: publicUserSelect });
  });
  it('finds a user by email using an explicit safe selection', async () => {
    userLookup.mockResolvedValueOnce(user);
    expect(await findUserByEmail('ada@example.com')).toEqual(user);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'ada@example.com' }, select: publicUserSelect });
  });
  it('returns null when no user exists', async () => {
    userLookup.mockResolvedValue(null);
    expect(await findUserById('missing')).toBeNull();
    expect(await findUserByEmail('missing@example.com')).toBeNull();
  });
  it('never requests passwordHash or sensitive relations', async () => {
    // Model a database row with a secret, then honor Prisma select at the mock boundary.
    const databaseRow = { ...user, passwordHash: 'never-return-this' };
    userLookup.mockImplementation(async (args: unknown) => {
      const select = (args as { select: Record<string, boolean> }).select;
      return Object.fromEntries(Object.entries(databaseRow).filter(([key]) => select[key])) as PublicUser;
    });
    for (const result of [await findUserById(user.id), await findUserByEmail(user.email)]) {
      expect(result).toEqual(user);
      expect(result).not.toHaveProperty('passwordHash');
    }
    expect(publicUserSelect).toEqual({ id: true, name: true, email: true, role: true, createdAt: true, updatedAt: true });
  });
});
