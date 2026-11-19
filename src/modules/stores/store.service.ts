import { prisma } from '../../config/database.js';
import { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../utils/app-error.js';
import type { StoreListQuery } from './store.validation.js';

// Public reads intentionally omit the owner relation and its private fields.
export const publicStoreSelect = {
  id: true, name: true, slug: true, description: true, logoUrl: true,
  bannerUrl: true, status: true, createdAt: true, updatedAt: true,
} satisfies Prisma.StoreSelect;

export async function listStores({ page, limit, keyword }: StoreListQuery) {
  // MySQL uses the column collation for case sensitivity (see migration/README).
  // Escape LIKE wildcards so a keyword is treated as literal text.
  const escapedKeyword = keyword?.replace(/[\\%_]/g, '\\$&');
  const where: Prisma.StoreWhereInput = {
    status: 'ACTIVE', ...(escapedKeyword ? { name: { contains: escapedKeyword } } : {}),
  };
  const [data, total] = await prisma.$transaction([
    prisma.store.findMany({
      where, select: publicStoreSelect, skip: (page - 1) * limit, take: limit,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }),
    prisma.store.count({ where }),
  ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export async function findStoreBySlug(slug: string) {
  const store = await prisma.store.findFirst({ where: { slug, status: 'ACTIVE' }, select: publicStoreSelect });
  if (!store) throw new AppError(404, 'STORE_NOT_FOUND', 'Store not found');
  return store;
}
