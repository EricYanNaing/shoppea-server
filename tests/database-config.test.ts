import { afterEach, describe, expect, it, vi } from 'vitest';

// Test real connection configuration, but never create a real driver or client.
vi.unmock('../src/config/database.js');
const constructors = vi.hoisted(() => ({
  adapter: vi.fn(function (_options: unknown) {}),
  client: vi.fn(function (_options: unknown) {}),
}));
vi.mock('@prisma/adapter-mariadb', () => ({ PrismaMariaDb: constructors.adapter }));
vi.mock('../src/generated/prisma/client.js', () => ({ PrismaClient: constructors.client }));

async function load(url: string) {
  vi.resetModules();
  vi.stubEnv('DATABASE_URL', url);
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('PORT', '3000');
  return import('../src/config/env.js');
}

afterEach(() => { vi.unstubAllEnvs(); });

describe('database connection security', () => {
  it('accepts a local connection without TLS', async () => {
    const { env } = await load('mysql://local:password@localhost:3306/shoppia');
    expect(env.DATABASE_URL).toContain('localhost');
    await import('../src/config/database.js');
    expect(constructors.adapter.mock.calls[0]?.[0]).not.toHaveProperty('ssl');
  });

  it('enables certificate verification for a TiDB Prisma URL', async () => {
    await load('mysql://tenant.root:some%40password@gateway.example.com:4000/test?sslaccept=strict');
    await import('../src/config/database.js');
    expect(constructors.adapter).toHaveBeenCalledWith(expect.objectContaining({
      host: 'gateway.example.com', port: 4000, user: 'tenant.root',
      password: 'some@password', database: 'test',
      ssl: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
    }));
    expect(constructors.client).toHaveBeenCalledWith({ adapter: expect.anything() });
  });

  it.each([
    'mysql://user:password@remote.example.com:4000/test',
    'mysql://user:password@remote.example.com:4000/test?sslaccept=accept_invalid_certs',
    'mysql://user:password@remote.example.com:4000/test?sslaccept=strict&sslaccept=strict',
    'mysql://user:password@remote.example.com:4000/test?sslaccept=strict&unknown=option',
    'mysql://user:password@localhost:3306/shoppia?ssl=false',
  ])('rejects an insecure or unsupported URL: %s', async (url) => {
    await expect(load(url)).rejects.toThrow('Invalid environment configuration: DATABASE_URL');
    expect(constructors.adapter).not.toHaveBeenCalled();
  });
});
