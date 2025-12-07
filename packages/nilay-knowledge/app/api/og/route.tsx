import { NextRequest } from 'next/server';
import { createOgImage } from '@/lib/og-image';
import { siteConfig } from '@/lib/config';

export const runtime = 'edge';

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const title = searchParams.get('title') || siteConfig.title;

    const response = createOgImage({ title });

    // Set cache headers
    response.headers.set(
      'Cache-Control',
      'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800'
    );

    return response;
  } catch (error) {
    console.error('OGP image generation failed:', error);

    // Return fallback image
    const fallbackResponse = createOgImage({ title: siteConfig.title });
    fallbackResponse.headers.set(
      'Cache-Control',
      'public, max-age=3600, s-maxage=86400'
    );

    return fallbackResponse;
  }
}
