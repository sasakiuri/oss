import { ContactForm } from '@/features/contact/components/contact-form';
import { ContactHeadings } from '@/features/contact/components/contact-headings';
import { ContactInfo } from '@/features/contact/components/contact-info';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  title: 'お問い合わせ',
  description: 'Nilay へのお問い合わせ。フォームのほか、メール・電話・SNS でも受け付けています。',
  path: '/contact',
});

export default function ContactPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <ContactHeadings part="intro" />

      <hr />

      <ContactHeadings part="form" />
      <ContactForm />

      <hr />

      <ContactHeadings part="other" />
      <ContactInfo />
    </div>
  );
}
