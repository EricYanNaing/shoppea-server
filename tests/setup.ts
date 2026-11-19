import { vi } from 'vitest';

// Test-only signing key. Never use this value outside isolated tests.
process.env.JWT_SECRET = 'test-only-jwt-secret-not-for-production-123456789';

// No live client is created: every test imports this replacement instead.
vi.mock('../src/config/database.js', () => ({
  prisma: {
    store: { findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn() },
    user: { findUnique: vi.fn(), create: vi.fn() },
    $transaction: vi.fn((queries: unknown[]) => Promise.all(queries)),
  },
}));
