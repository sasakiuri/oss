'use client';

import { siteConfig } from '@/lib/config';

const services = [
  { href: 'https://knowledge.nilay.jp/', label: 'Knowledge' },
  { href: 'https://www.nilay.jp/', label: 'E-commerce' },
  { href: 'https://gunman.nilay.jp/', label: 'Gunman' },
];

/**
 * RetroFooter - 1990年代CERN Webサイト風のフッター
 *
 * Design principles:
 * - Simple address element (common in early web)
 * - Horizontal rule separator
 * - Plain text links
 * - No icons - text only
 */
export function RetroFooter() {
  return (
    <footer className="mt-8">
      <hr />
      <div className="max-w-3xl mx-auto px-4 py-4">
        <h2 className="text-lg font-bold">Other Services</h2>
        <ul className="mt-2">
          {services.map((service) => (
            <li key={service.href}>
              <a href={service.href} target="_blank" rel="noopener noreferrer">
                {service.label}
              </a>
            </li>
          ))}
        </ul>

        <hr className="my-4" />

        <address>
          <strong>Nilay</strong>
          <br />
          {siteConfig.location.prefecture}
          {siteConfig.location.city}
          {siteConfig.location.street}
          <br />
          Email: <a href={`mailto:${siteConfig.contact.email}`}>{siteConfig.contact.email}</a>
        </address>

        <p className="mt-4" suppressHydrationWarning>
          &copy; {new Date().getFullYear()} Nilay. All rights reserved.
        </p>

        <p className="mt-2 text-sm">
          Follow us:{' '}
          <a href={`https://twitter.com/${siteConfig.social.twitter}`} target="_blank" rel="noopener noreferrer">
            Twitter
          </a>
          {' | '}
          <a href={`https://www.facebook.com/${siteConfig.social.facebook}`} target="_blank" rel="noopener noreferrer">
            Facebook
          </a>
          {' | '}
          <a
            href={`https://www.instagram.com/${siteConfig.social.instagram}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Instagram
          </a>
          {' | '}
          <a href={`https://github.com/${siteConfig.social.github}`} target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
        </p>
      </div>
    </footer>
  );
}
