import type { ErrorRequestHandler } from 'express';
import { AppError } from '../utils/app-error.js';

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (res.headersSent) return next(error);
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      success: false, message: error.message,
      error: { code: error.code, ...(error.details ? { details: error.details } : {}) },
    });
    return;
  }
  if (error instanceof SyntaxError && 'type' in error && error.type === 'entity.parse.failed') {
    res.status(400).json({ success: false, message: 'Invalid JSON body', error: { code: 'INVALID_JSON' } });
    return;
  }
  if (typeof error === 'object' && error !== null && 'type' in error && error.type === 'entity.too.large') {
    res.status(413).json({ success: false, message: 'Request body too large', error: { code: 'PAYLOAD_TOO_LARGE' } });
    return;
  }
  // Log a safe marker: database error messages may include connection secrets.
  console.error('Unexpected request failure');
  res.status(500).json({ success: false, message: 'Internal server error', error: { code: 'INTERNAL_SERVER_ERROR' } });
};
