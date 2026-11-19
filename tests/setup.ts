import { vi } from 'vitest';

// No live client is created: every test imports this replacement instead.
vi.mock('../src/config/database.js', () => ({
  prisma: {
    store: { findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
    $transaction: vi.fn((queries: unknown[]) => Promise.all(queries)),
  },
}));
