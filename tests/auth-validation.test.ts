import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { LoginParamsSchema, RegisterParamsSchema } from '../src/modules/auth/auth.types.js';
import { LoginSchema, RegisterSchema } from '../src/modules/auth/auth.validation.js';

const registration = (password: string) => ({
  name: 'Test Customer', email: 'customer@example.com', password, confirmPassword: password,
});

describe('bcrypt password byte boundary', () => {
  it.each(['a'.repeat(72), '😀'.repeat(18), '界'.repeat(24)])('accepts exactly 72 UTF-8 bytes: %s', (password) => {
    expect(Buffer.byteLength(password, 'utf8')).toBe(72);
    expect(RegisterParamsSchema.safeParse(registration(password)).success).toBe(true);
    expect(LoginParamsSchema.safeParse({ email: 'customer@example.com', password }).success).toBe(true);
    expect(RegisterSchema.safeParse(registration(password)).success).toBe(true);
    expect(LoginSchema.safeParse({ email: 'customer@example.com', password }).success).toBe(true);
  });

  it.each(['a'.repeat(73), '😀'.repeat(19), '界'.repeat(25), 'a'.repeat(69) + '😀'])('rejects passwords exceeding 72 UTF-8 bytes: %s', (password) => {
    expect(RegisterParamsSchema.safeParse(registration(password)).success).toBe(false);
    expect(LoginParamsSchema.safeParse({ email: 'customer@example.com', password }).success).toBe(false);
    expect(RegisterSchema.safeParse(registration(password)).success).toBe(false);
    expect(LoginSchema.safeParse({ email: 'customer@example.com', password }).success).toBe(false);
  });

  it('identifies an oversized confirmation field', () => {
    const result = RegisterParamsSchema.safeParse({ ...registration('valid-password'), confirmPassword: '😀'.repeat(19) });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.path).toEqual(['confirmPassword']);
  });

  it.each(['register', 'login'])('rejects oversized %s requests before database access', async (endpoint) => {
    const password = '😀'.repeat(19);
    const payload = endpoint === 'register' ? registration(password) : { email: 'customer@example.com', password };
    const response = await request(app).post(`/api/v1/auth/${endpoint}`).send(payload);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toContainEqual({ field: 'password', message: 'Password must be at most 72 UTF-8 bytes' });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});
