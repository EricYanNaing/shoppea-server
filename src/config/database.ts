import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../generated/prisma/client.js';
import { env } from './env.js';

const url = new URL(env.DATABASE_URL);
const adapter = new PrismaMariaDb({
  host: url.hostname,
  port: Number(url.port || 3306),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: decodeURIComponent(url.pathname.slice(1)),
  // Prisma CLI reads sslaccept from the URL; the runtime adapter needs explicit TLS options.
  ...(url.searchParams.get('sslaccept') === 'strict'
    ? { ssl: { rejectUnauthorized: true, minVersion: 'TLSv1.2' as const } }
    : {}),
  connectionLimit: 5,
  connectTimeout: 5000,
});

export const prisma = new PrismaClient({ adapter });
