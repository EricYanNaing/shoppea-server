import { Router } from 'express';
import { RegisterParamsSchema, LoginParamsSchema } from './auth.types.js';
import { register, login } from './auth.controller.js';
import { validate } from '../../middleware/validate.middleware.js';

export const authRouter = Router();

authRouter.post('/register', validate(RegisterParamsSchema, 'body'), register);
authRouter.post('/login', validate(LoginParamsSchema, 'body'), login);