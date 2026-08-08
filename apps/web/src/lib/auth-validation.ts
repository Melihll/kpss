import { z } from "zod";

export const loginSchema = z.object({
  email: z.email("Geçerli bir e-posta adresi girin."),
  password: z.string().min(6, "Şifre en az 6 karakter olmalıdır."),
});

export const registerSchema = loginSchema.extend({
  displayName: z
    .string()
    .trim()
    .min(2, "Görünen ad en az 2 karakter olmalıdır.")
    .max(80, "Görünen ad en fazla 80 karakter olabilir."),
});
