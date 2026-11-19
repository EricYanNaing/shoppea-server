import bcrypt from 'bcrypt';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/config/database.js';
import { env, envSchema } from '../src/config/env.js';
import { loginService, registerService } from '../src/modules/auth/auth.service.js';
import { publicUserSelect } from '../src/modules/users/user.types.js';

const password = 'test-password';
const passwordHash = bcrypt.hashSync(password, 4);
const user = {
  id: 'auth-test-user', name: 'Test User', email: 'auth@example.com',
  role: 'CUSTOMER' as const, createdAt: new Date(), updatedAt: new Date(),
};
const loginSelect = { ...publicUserSelect, passwordHash: true } as const;
const userLookup = vi.mocked(prisma.user.findUnique<{
  where: { email: string }; select: typeof loginSelect;
}>);

beforeEach(() => { userLookup.mockResolvedValue({ ...user, passwordHash }); });

describe('login service', () => {
  it('omits passwordHash entirely and issues a verifiable one-hour JWT', async () => {
    const result = await loginService({ email: user.email, password });
    expect(result.user).toEqual(user);
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(result)).not.toContain(passwordHash);
    expect(JSON.stringify(result)).not.toContain('passwordHash');
    const payload = jwt.verify(result.jwtToken, env.JWT_SECRET, { algorithms: ['HS256'] }) as JwtPayload;
    expect(payload.id).toBe(user.id);
    expect(payload.exp! - payload.iat!).toBe(3600);
    expect(payload).not.toHaveProperty('passwordHash');
    expect(payload).not.toHaveProperty('password');
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: user.email }, select: loginSelect });
  });

  it('rejects an incorrect password', async () => {
    await expect(loginService({ email: user.email, password: 'incorrect-password' }))
      .rejects.toMatchObject({ statusCode: 401, code: 'INVALID_CREDENTIALS' });
  });

  it('preserves the existing missing-user behavior', async () => {
    userLookup.mockResolvedValueOnce(null);
    await expect(loginService({ email: user.email, password }))
      .rejects.toMatchObject({ statusCode: 404, code: 'USER_NOT_FOUND' });
  });
});

describe('registration safe result', () => {
  it('selects only public fields when creating a user', async () => {
    userLookup.mockResolvedValueOnce(null);
    vi.mocked(prisma.user.create<{
      data: { name: string; email: string; passwordHash: string }; select: typeof publicUserSelect;
    }>).mockResolvedValueOnce(user);
    const result = await registerService({ name: user.name, email: user.email, password, confirmPassword: password });
    expect(result).toEqual(user);
    expect(result).not.toHaveProperty('passwordHash');
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: { name: user.name, email: user.email, passwordHash: expect.any(String) },
      select: publicUserSelect,
    });
    const args = vi.mocked(prisma.user.create).mock.calls[0]?.[0];
    const hash = args?.data.passwordHash;
    expect(typeof hash).toBe('string');
    expect(await bcrypt.compare(password, hash as string)).toBe(true);
  });
});

describe('JWT configuration', () => {
  it('rejects an absent signing secret', () => {
    expect(envSchema.safeParse({ ...env, JWT_SECRET: undefined }).success).toBe(false);
  });
  it('rejects a short signing secret', () => {
    expect(envSchema.safeParse({ ...env, JWT_SECRET: 'short' }).success).toBe(false);
  });
});
