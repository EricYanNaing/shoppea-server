import type { RequestHandler } from 'express';
import { registerService, loginService } from './auth.service.js';
import { RegisterParamsSchema, LoginParamsSchema } from './auth.types.js';
import { z } from 'zod';
import { apiResponse } from '../../utils/api-response.js';

export const register: RequestHandler = async (req, res) => {
  const result = await registerService(req.body as z.infer<typeof RegisterParamsSchema>);
  res.status(201).json(apiResponse('Register successfully',result));
}

export const login: RequestHandler = async (req, res) => {
  const result = await loginService(req.body as z.infer<typeof LoginParamsSchema>);
  res.status(200).json(apiResponse('Login successfully',result));
}