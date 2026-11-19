import 'dotenv/config';
import { z } from 'zod';

export const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url().refine((value) => {
    try {
      const url = new URL(value);
      const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
      const options = [...url.searchParams.entries()];
      const strictTls = options.length === 1
        && options[0]?.[0] === 'sslaccept' && options[0]?.[1] === 'strict';
      return url.protocol === 'mysql:' && Boolean(url.hostname && url.username && url.pathname.length > 1)
        && !url.hash && (strictTls || (local && options.length === 0));
    } catch { return false; }
  }, 'Use a MySQL URL; remote databases require ?sslaccept=strict (no other URL options are supported)'),
});

const result = envSchema.safeParse(process.env);
if (!result.success) {
  // Never print environment values, which may contain credentials.
  throw new Error(`Invalid environment configuration: ${result.error.issues.map((issue) => issue.path.join('.')).join(', ')}`);
}
export const env = result.data;
