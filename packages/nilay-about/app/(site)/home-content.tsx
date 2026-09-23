'use client';

import Image from 'next/image';
import Link from 'next/link';

import { useLanguage } from '@/store';

interface Service {
  title: string;
  href: string;
  description: { ja: string; en: string };
  external: boolean;
}

const services: Service[] = [
  {
    title: 'Knowledge',
    href: 'https://knowledge.nilay.jp/',
    description: {
      ja: '銃・射撃・狩猟に関する知識を収集・調査し紹介しています。申請や申込の方法についても記載しておりますので必要なときにご覧ください。',
      en: 'What we have gathered and looked into about guns, shooting and hunting, including how the applications and bookings are made.',
    },
    external: true,
  },
  {
    title: 'E-commerce',
    href: 'https://www.nilay.jp/',
    description: {
      ja: '射撃用品・狩猟用品・鳥獣被害対策用品を販売しています。幅広い種類の商品を取り揃えるようにしておりますのでぜひご利用ください。',
      en: 'Shooting and hunting supplies, and equipment for keeping wildlife off crops. We try to keep a wide range in stock.',
    },
    external: true,
  },
  {
    title: 'Gunman',
    href: 'https://gunman.nilay.jp/',
    description: {
      ja: '申請書・申込書・各種添付書類を作成することができます。この他に火薬類、銃、各種証明書の管理機能も現在試験的に運用中です。',
      en: 'Fills in the applications, the booking forms and the papers that go with them. Keeping track of powder, guns and certificates is being trialled there as well.',
    },
    external: true,
  },
  {
    title: 'Labs',
    href: '/labs',
    description: {
      ja: '試験的に作成したツールなどを公開しています。',
      en: 'Tools we have built as experiments, free to use in the browser.',
    },
    external: false,
  },
];

export function HomeContent() {
  const language = useLanguage();
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1>{t('ようこそ！！', 'Welcome!')}</h1>

      <p>
        {t(
          'Nilay では射撃・狩猟・有害鳥獣駆除に関するサービスを提供しています。少しでも使いやすいサービスにしていきたいと思っておりますのでよろしくお願いいたします。',
          'Nilay runs services for shooting, for hunting and for keeping wildlife off what it damages. We are trying to make them easier to use, and we are glad you are here.',
        )}
      </p>

      <div className="my-8">
        <a href="https://www.irasutoya.com/2015/03/blog-post_346.html" target="_blank" rel="noopener noreferrer">
          <Image src="/images/home-tanuki.png" alt={t('たぬき', 'A raccoon dog')} width={200} height={200} priority />
        </a>
        <p className="text-sm">{t('(イラスト: いらすとや)', '(Illustration: Irasutoya)')}</p>
      </div>

      <hr />

      <h2>{t('サービス (Services)', 'Services')}</h2>

      <p>{t('以下のサービスを提供しています:', 'We run the following:')}</p>

      <dl>
        {services.map((service) => {
          const LinkComponent = service.external ? 'a' : Link;
          const linkProps = service.external ? { target: '_blank', rel: 'noopener noreferrer' } : {};

          return (
            <div key={service.title} className="mb-4">
              <dt className="font-bold">
                <LinkComponent href={service.href} {...linkProps}>
                  {service.title}
                </LinkComponent>
              </dt>
              <dd className="ml-8">{service.description[language]}</dd>
            </div>
          );
        })}
      </dl>

      <hr />

      <p>
        {t('', 'Have a look at the ')}
        <Link href="/news">{t('最新のニュース', 'latest news')}</Link>
        {t('もご覧ください。ご質問・ご要望は', ' as well. Questions and requests are welcome through the ')}
        <Link href="/contact">{t('お問い合わせページ', 'contact page')}</Link>
        {t('からお送りください。', '.')}
      </p>
    </div>
  );
}
