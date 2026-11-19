import { RegisterParamsSchema } from './auth.types.js';

// Reuse the route schemas so the bcrypt length rule cannot drift between files.
export { LoginParamsSchema as LoginSchema } from './auth.types.js';

export const RegisterSchema = RegisterParamsSchema.refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
});
