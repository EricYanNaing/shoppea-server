import express from 'express';
import { storeRouter } from './modules/stores/store.routes.js';
import { errorHandler } from './middleware/error.middleware.js';
import { notFound } from './middleware/not-found.middleware.js';
import { apiResponse } from './utils/api-response.js';

export const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  const start = performance.now();
  res.on('finish', () => {
    // Do not log query strings, bodies or credentials.
    console.info(`${req.method} ${req.path} ${res.statusCode} ${Math.round(performance.now() - start)}ms`);
  });
  next();
});
app.use(express.json({ limit: '100kb' }));
app.get('/health', (_req, res) => {
  res.status(200).json(apiResponse('Server is running', { status: 'ok' }));
});
app.use('/api/v1/stores', storeRouter);
app.use(notFound);
app.use(errorHandler);
