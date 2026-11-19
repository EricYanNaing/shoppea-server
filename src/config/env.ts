import 'dotenv/config';
import { z } from 'zod';

export const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url().refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'mysql:' && Boolean(url.hostname && url.username && url.pathname.length > 1)
        && !url.search && !url.hash;
    } catch { return false; }
  }, 'Use mysql://user:password@host:3306/database without query parameters'),
});

const result = envSchema.safeParse(process.env);
if (!result.success) {
  // Never print environment values, which may contain credentials.
  throw new Error(`Invalid environment configuration: ${result.error.issues.map((issue) => issue.path.join('.')).join(', ')}`);
}
export const env = result.data;
