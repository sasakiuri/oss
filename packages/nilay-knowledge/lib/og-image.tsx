import { ImageResponse } from 'next/og';

import { siteConfig } from './config';

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

// Nilay brand colors
const COLORS = {
  background: '#5f7d8a', // Slate blue-gray from ogp.png
  accent: '#d97706', // Orange from logo
  text: '#ffffff',
  subtext: '#e2e8f0',
};

interface OgImageOptions {
  title: string;
  subtitle?: string;
}

export function createOgImage({ title, subtitle }: OgImageOptions): ImageResponse {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: COLORS.background,
        padding: '60px',
      }}
    >
      {/* Logo and site name */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          marginBottom: '40px',
        }}
      >
        {/* Target/crosshair icon */}
        <svg width="60" height="60" viewBox="0 0 100 100" style={{ marginRight: '16px' }}>
          <circle cx="50" cy="50" r="45" fill="#fef3c7" stroke={COLORS.accent} strokeWidth="6" />
          <circle cx="50" cy="50" r="8" fill={COLORS.accent} />
          <line x1="50" y1="5" x2="50" y2="30" stroke={COLORS.accent} strokeWidth="4" />
          <line x1="50" y1="70" x2="50" y2="95" stroke={COLORS.accent} strokeWidth="4" />
          <line x1="5" y1="50" x2="30" y2="50" stroke={COLORS.accent} strokeWidth="4" />
          <line x1="70" y1="50" x2="95" y2="50" stroke={COLORS.accent} strokeWidth="4" />
        </svg>
        <span
          style={{
            fontSize: '48px',
            fontWeight: 700,
            color: COLORS.text,
            fontFamily: 'serif',
            letterSpacing: '0.05em',
          }}
        >
          {siteConfig.title}
        </span>
      </div>

      {/* Title */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          maxWidth: '1000px',
        }}
      >
        <h1
          style={{
            fontSize: title.length > 30 ? '42px' : '52px',
            fontWeight: 700,
            color: COLORS.text,
            textAlign: 'center',
            lineHeight: 1.3,
            margin: 0,
            wordBreak: 'keep-all',
            overflowWrap: 'break-word',
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p
            style={{
              fontSize: '24px',
              color: COLORS.subtext,
              marginTop: '20px',
              textAlign: 'center',
            }}
          >
            {subtitle}
          </p>
        )}
      </div>
    </div>,
    {
      width: OG_WIDTH,
      height: OG_HEIGHT,
    },
  );
}
