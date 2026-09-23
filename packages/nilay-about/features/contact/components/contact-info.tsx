'use client';

import { siteConfig } from '@/lib/config';
import { useLanguage } from '@/store';

export function ContactInfo() {
  const language = useLanguage();
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);

  return (
    <div className="mt-4">
      <ul>
        <li>
          {t('Ｅメール: ', 'Email: ')}
          <a href={`mailto:${siteConfig.contact.email}`}>{siteConfig.contact.email}</a>
        </li>
        <li>
          {t('電話: ', 'Telephone: ')}
          {siteConfig.contact.phone}
        </li>
      </ul>

      <h3>SNS</h3>
      <ul>
        <li>
          <a href={`https://twitter.com/${siteConfig.social.twitter}`} target="_blank" rel="noopener noreferrer">
            Twitter (@{siteConfig.social.twitter})
          </a>
        </li>
        <li>
          <a href={`https://www.facebook.com/${siteConfig.social.facebook}/`} target="_blank" rel="noopener noreferrer">
            Facebook ({siteConfig.social.facebook})
          </a>
        </li>
        <li>
          <a
            href={`https://www.youtube.com/channel/${siteConfig.social.youtube}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            YouTube
          </a>
        </li>
        <li>
          <a
            href={`https://www.instagram.com/${siteConfig.social.instagram}/`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Instagram (@{siteConfig.social.instagram})
          </a>
        </li>
      </ul>
    </div>
  );
}
