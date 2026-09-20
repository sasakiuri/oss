'use client';

import { siteConfig } from '@/lib/config';

export function ContactInfo() {
  return (
    <div className="mt-4">
      <ul>
        <li>
          Ｅメール: <a href={`mailto:${siteConfig.contact.email}`}>{siteConfig.contact.email}</a>
        </li>
        <li>電話: {siteConfig.contact.phone}</li>
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
