import { z } from "zod";

export const contactFormSchema = z.object({
  requiresReply: z.boolean().default(false),
  email: z
    .string()
    .email("Ｅメールアドレスの形式が不正です。")
    .optional()
    .or(z.literal("")),
  title: z.string().min(1, "タイトルは必須です。"),
  message: z.string().min(1, "お問い合わせ内容は必須です。"),
});

export type ContactFormData = z.infer<typeof contactFormSchema>;

export const contactResponseSchema = z.object({
  hasError: z.boolean(),
  errorMessage: z.string(),
  uuid: z.string(),
});

export type ContactResponse = z.infer<typeof contactResponseSchema>;
