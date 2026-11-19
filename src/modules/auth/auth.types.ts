import z from "zod";

// bcrypt uses only the first 72 UTF-8 bytes, not the first 72 characters.
const passwordSchema = z.string().min(6).refine(
    (value) => Buffer.byteLength(value, 'utf8') <= 72,
    { message: 'Password must be at most 72 UTF-8 bytes' },
);

export const RegisterParamsSchema = z.object({
    name: z.string().min(3),
    email: z.string().email(),
    password: passwordSchema,
    confirmPassword: passwordSchema,
});

export const LoginParamsSchema = z.object({
    email: z.string().email(),
    password: passwordSchema,
});
