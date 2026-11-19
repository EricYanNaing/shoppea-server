import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { AppError } from '../utils/app-error.js';

export function validate(schema: z.ZodType, source: 'body' | 'query' | 'params'): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return next(new AppError(400, 'VALIDATION_ERROR', 'Invalid request input',
        result.error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message }))));
    }
    // Express 5 query is a getter. Keep parsed values separate from raw input.
    res.locals[source] = result.data;
    next();
  };
}
