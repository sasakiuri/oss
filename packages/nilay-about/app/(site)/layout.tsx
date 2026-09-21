import { RetroFooter } from '@/components/layout/retro-footer';
import { RetroHeader } from '@/components/layout/retro-header';
import { Providers } from '@/components/providers';

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <div className="site-shell min-h-screen">
        <RetroHeader />
        <main id="main-content" tabIndex={-1} aria-label="メインコンテンツ">
          {children}
        </main>
        <RetroFooter />
      </div>
    </Providers>
  );
}
