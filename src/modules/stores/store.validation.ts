import { z } from 'zod';

const positiveInteger = (fallback: number, max: number) => z.string()
  .regex(/^[1-9]\d*$/, 'Must be a positive integer')
  .transform(Number)
  .pipe(z.number().int().min(1).max(max))
  .default(fallback);

export const storeListSchema = z.object({
  page: positiveInteger(1, Number.MAX_SAFE_INTEGER),
  limit: positiveInteger(10, 100),
  keyword: z.string().trim().max(191).optional(),
}).strict().refine(({ page, limit }) => Number.isSafeInteger((page - 1) * limit), {
  path: ['page'], message: 'Pagination offset is too large',
});

export const storeSlugSchema = z.object({
  slug: z.string().min(1).max(191).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single hyphens'),
});

export type StoreListQuery = z.infer<typeof storeListSchema>;
export type StoreSlugParams = z.infer<typeof storeSlugSchema>;
