import type { Metadata } from 'next';

import { ContactForm } from '@/features/contact/components/contact-form';
import { ContactInfo } from '@/features/contact/components/contact-info';

export const metadata: Metadata = {
  title: 'お問い合わせ',
  description: 'お気軽にお問い合わせください。Email、電話、各種 SNS でもお問い合わせいただけます。',
};

export default function ContactPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1>お問い合わせ (Contact)</h1>
      <p>お気軽にお問い合わせください。Ｅメール、電話、各種 SNS でもお問い合わせいただけます。</p>

      <hr />

      <h2>お問い合わせフォーム</h2>
      <ContactForm />

      <hr />

      <h2>その他の連絡方法</h2>
      <ContactInfo />
    </div>
  );
}
