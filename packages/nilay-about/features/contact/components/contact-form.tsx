'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import { useLanguage } from '@/store';

import {
  contactFormSchema,
  TITLE_MAX_LENGTH,
  MESSAGE_MAX_LENGTH,
  type ContactFormData,
  type ContactFormInput,
} from '../schema';
import { useContactForm } from '../use-contact-form';

/**
 * What became of a submission, rather than the sentence that describes it.
 *
 * A sentence built when the form was sent would keep the language it was sent in, and the reader
 * can change that afterwards.
 */
type Outcome = { kind: 'sent'; uuid: string } | { kind: 'failed' };

/**
 * The schema words its answers in Japanese. They are named again in English here, keyed by the
 * Japanese sentence, so the reader sees the language the page is set to.
 */
const englishProblems: Record<string, string> = {
  'Ｅメールアドレスは254文字以内で入力してください。': 'An email address can be no longer than 254 characters.',
  'Ｅメールアドレスの形式が不正です。': 'That is not an email address.',
  'タイトルは必須です。': 'A title is needed.',
  [`タイトルは${TITLE_MAX_LENGTH}文字以内で入力してください。`]: `A title can be no longer than ${TITLE_MAX_LENGTH} characters.`,
  'お問い合わせ内容は必須です。': 'A message is needed.',
  [`お問い合わせ内容は${MESSAGE_MAX_LENGTH}文字以内で入力してください。`]: `A message can be no longer than ${MESSAGE_MAX_LENGTH} characters.`,
  '返信を希望する場合はＥメールアドレスが必要です。': 'An email address is needed if you would like a reply.',
};

export function ContactForm() {
  const mutation = useContactForm();
  const language = useLanguage();
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

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

  const problemText = (problem?: string) => {
    if (!problem) return '';
    return language === 'ja' ? problem : (englishProblems[problem] ?? problem);
  };

  const onSubmit = async (data: ContactFormData) => {
    setOutcome(null);
    try {
      const result = await mutation.mutateAsync(data);
      setOutcome({ kind: 'sent', uuid: result.uuid });
      reset();
    } catch {
      setOutcome({ kind: 'failed' });
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
        <label htmlFor="requiresReply">{t('返信を希望する', 'I would like a reply')}</label>
      </p>

      {requiresReply && (
        <p>
          <label htmlFor="email">{t('Ｅメールアドレス *', 'Email address *')}</label>
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
              {problemText(errors.email.message)}
            </span>
          )}
        </p>
      )}

      <p>
        <label htmlFor="title">{t('タイトル *', 'Title *')}</label>
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
            {problemText(errors.title.message)}
          </span>
        )}
      </p>

      <p>
        <label htmlFor="message">{t('お問い合わせ内容 *', 'Your message *')}</label>
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
            {problemText(errors.message.message)}
          </span>
        )}
      </p>

      <p>
        <button type="submit" disabled={isLoading}>
          {isLoading ? t('送信中...', 'Sending…') : t('送信', 'Send')}
        </button>
      </p>

      {outcome !== null && (
        <p role="status" className={outcome.kind === 'sent' ? 'text-foreground' : 'text-destructive'}>
          <strong>{outcome.kind === 'sent' ? t('送信完了', 'Sent') : t('送信エラー', 'Not sent')}</strong>:{' '}
          {outcome.kind === 'sent'
            ? t(
                `お問い合わせありがとうございます。— お問い合わせ番号：${outcome.uuid}`,
                `Thank you for writing. Your reference is ${outcome.uuid}.`,
              )
            : t(
                '何らかのエラーが発生しました。しばらく時間をおいてから送信するか、Ｅメールなどで直接お問い合わせください。',
                'Something went wrong. Please try again in a little while, or write to us by email instead.',
              )}{' '}
          <button type="button" onClick={() => setOutcome(null)}>
            {t('[閉じる]', '[close]')}
          </button>
        </p>
      )}
    </form>
  );
}
