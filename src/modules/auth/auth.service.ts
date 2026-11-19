import { prisma } from '../../config/database.js';
import { AppError } from '../../utils/app-error.js';
import bcrypt from "bcrypt";
import { RegisterParamsSchema, LoginParamsSchema } from "./auth.types.js";
import { z } from "zod";
import { publicUserSelect } from '../users/user.types.js';
import { env } from '../../config/env.js';
import jwt from 'jsonwebtoken';


export const registerService = async (params: z.infer<typeof RegisterParamsSchema>) => {
  const { name, email, password, confirmPassword } = params;

  if (password !== confirmPassword) {
    throw new AppError(400,"INVALID_CREDENTIALS","Invalid credentials");
  }

  // [ ] check if email already exists
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    throw new AppError(400,"INVALID_CREDENTIALS","Invalid credentials");
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash: hashedPassword,
    },
    select: publicUserSelect,
  });

  return user;
};

export const loginService = async (params: z.infer<typeof LoginParamsSchema>) => {
  const { email, password } = params;

  const user = await prisma.user.findUnique({
    where: { email },
    select: { ...publicUserSelect, passwordHash: true },
  });

  if (!user) {
    throw new AppError(404,"USER_NOT_FOUND","User not found");
  }

  const { passwordHash, ...publicUser } = user;
  const isPasswordValid = await bcrypt.compare(password, passwordHash);

  if (!isPasswordValid) {
    throw new AppError(401,"INVALID_CREDENTIALS","Invalid credentials");
  }

  const jwtToken = jwt.sign({ id: user.id }, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '1h',
  });

  return { user: publicUser, jwtToken };
};
