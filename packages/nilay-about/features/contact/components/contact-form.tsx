'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import {
  contactFormSchema,
  TITLE_MAX_LENGTH,
  MESSAGE_MAX_LENGTH,
  type ContactFormData,
  type ContactFormInput,
} from '../schema';
import { useContactForm } from '../use-contact-form';

export function ContactForm() {
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; title: string; message: string } | null>(null);
  const mutation = useContactForm();

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<ContactFormInput, unknown, ContactFormData>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: {
      requiresReply: false,
      email: '',
      title: '',
      message: '',
    },
  });

  const requiresReply = useWatch({ control, name: 'requiresReply' });

  const onSubmit = async (data: ContactFormData) => {
    setAlert(null);
    try {
      const result = await mutation.mutateAsync(data);

      setAlert({
        type: 'success',
        title: '送信完了',
        message: `お問い合わせありがとうございます。— お問い合わせ番号：${result.uuid}`,
      });
      reset();
    } catch {
      setAlert({
        type: 'error',
        title: '送信エラー',
        message:
          '何らかのエラーが発生しました。しばらく時間をおいてから送信するか、Ｅメールなどで直接お問い合わせください。',
      });
    }
  };

  const isLoading = isSubmitting || mutation.isPending;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mt-4">
      <p>
        <input
          type="checkbox"
          id="requiresReply"
          disabled={isLoading}
          {...register('requiresReply', {
            onChange: (event) => {
              if (!event.target.checked) {
                setValue('email', '');
                clearErrors('email');
              }
            },
          })}
        />{' '}
        <label htmlFor="requiresReply">返信を希望する</label>
      </p>

      {requiresReply && (
        <p>
          <label htmlFor="email">Ｅメールアドレス *</label>
          <br />
          <input
            id="email"
            type="email"
            disabled={isLoading}
            className="w-full max-w-md"
            aria-describedby={errors.email ? 'email-error' : undefined}
            aria-invalid={errors.email ? 'true' : undefined}
            {...register('email')}
          />
          {errors.email && (
            <span id="email-error" role="alert" className="block text-destructive mt-1">
              {errors.email.message}
            </span>
          )}
        </p>
      )}

      <p>
        <label htmlFor="title">タイトル *</label>
        <br />
        <input
          id="title"
          type="text"
          disabled={isLoading}
          className="w-full max-w-md"
          aria-describedby={errors.title ? 'title-error' : undefined}
          aria-invalid={errors.title ? 'true' : undefined}
          aria-required="true"
          maxLength={TITLE_MAX_LENGTH}
          {...register('title')}
        />
        {errors.title && (
          <span id="title-error" role="alert" className="block text-destructive mt-1">
            {errors.title.message}
          </span>
        )}
      </p>

      <p>
        <label htmlFor="message">お問い合わせ内容 *</label>
        <br />
        <textarea
          id="message"
          rows={6}
          disabled={isLoading}
          className="w-full max-w-md"
          aria-describedby={errors.message ? 'message-error' : undefined}
          aria-invalid={errors.message ? 'true' : undefined}
          aria-required="true"
          maxLength={MESSAGE_MAX_LENGTH}
          {...register('message')}
        />
        {errors.message && (
          <span id="message-error" role="alert" className="block text-destructive mt-1">
            {errors.message.message}
          </span>
        )}
      </p>

      <p>
        <button type="submit" disabled={isLoading}>
          {isLoading ? '送信中...' : '送信'}
        </button>
      </p>

      {alert && (
        <p role="status" className={alert.type === 'success' ? 'text-foreground' : 'text-destructive'}>
          <strong>{alert.title}</strong>: {alert.message}{' '}
          <button type="button" onClick={() => setAlert(null)}>
            [閉じる]
          </button>
        </p>
      )}
    </form>
  );
}
