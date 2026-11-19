import { app } from './app.js';
import { env } from './config/env.js';
import { prisma } from './config/database.js';

let server: ReturnType<typeof app.listen> | undefined;
let shuttingDown = false;

async function shutdown(exitCode: number) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.info('Shutting down server');
  // Bound shutdown even if an HTTP request or database operation gets stuck.
  const deadline = setTimeout(() => {
    console.error('Shutdown deadline exceeded');
    server?.closeAllConnections();
    process.exit(1);
  }, 10_000);
  deadline.unref();
  try {
    if (server?.listening) {
      await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
    }
    await prisma.$disconnect();
    clearTimeout(deadline);
    process.exitCode = exitCode;
  } catch {
    console.error('Shutdown failed');
    process.exit(1);
  }
}

process.once('SIGINT', () => { void shutdown(0); });
process.once('SIGTERM', () => { void shutdown(0); });

async function start() {
  try {
    await prisma.$connect();
    if (shuttingDown) return;
    server = app.listen(env.PORT, () => console.info(`Shoppia listening on port ${env.PORT}`));
    server.on('error', () => {
      console.error('HTTP server failed');
      void shutdown(1);
    });
  } catch {
    console.error('Startup failed: check MySQL connectivity and configuration');
    await shutdown(1);
  }
}

void start();
