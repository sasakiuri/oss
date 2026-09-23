'use client';

import { useLanguage } from '@/store';

/** The headings of the contact page, which the server cannot know the language of. */
export function ContactHeadings({ part }: { part: 'intro' | 'form' | 'other' }) {
  const language = useLanguage();
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);

  if (part === 'intro')
    return (
      <>
        <h1>{t('お問い合わせ (Contact)', 'Contact')}</h1>
        <p>
          {t(
            'お気軽にお問い合わせください。Ｅメール、電話、各種 SNS でもお問い合わせいただけます。',
            'Do write to us. Email, the telephone and the social accounts below all reach us as well.',
          )}
        </p>
      </>
    );
  if (part === 'form') return <h2>{t('お問い合わせフォーム', 'The form')}</h2>;
  return <h2>{t('その他の連絡方法', 'Other ways to reach us')}</h2>;
}
