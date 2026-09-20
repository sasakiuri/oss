import { z } from 'zod';

/** タイトルの最大文字数 */
const TITLE_MAX_LENGTH = 200;
/** メッセージの最大文字数 */
const MESSAGE_MAX_LENGTH = 2000;

export const contactFormSchema = z
  .object({
    requiresReply: z.boolean().default(false),
    email: z.string().email('Ｅメールアドレスの形式が不正です。').optional().or(z.literal('')),
    title: z
      .string()
      .min(1, 'タイトルは必須です。')
      .max(TITLE_MAX_LENGTH, `タイトルは${TITLE_MAX_LENGTH}文字以内で入力してください。`),
    message: z
      .string()
      .min(1, 'お問い合わせ内容は必須です。')
      .max(MESSAGE_MAX_LENGTH, `お問い合わせ内容は${MESSAGE_MAX_LENGTH}文字以内で入力してください。`),
  })
  .refine(
    (data) => {
      // 返信希望の場合はメールアドレスが必須
      if (data.requiresReply) {
        return data.email && data.email.length > 0;
      }
      return true;
    },
    {
      message: '返信を希望する場合は、Ｅメールアドレスを入力してください。',
      path: ['email'],
    },
  );

export type ContactFormData = z.infer<typeof contactFormSchema>;

export const contactResponseSchema = z.object({
  hasError: z.boolean(),
  errorMessage: z.string(),
  uuid: z.string(),
});

export type ContactResponse = z.infer<typeof contactResponseSchema>;
