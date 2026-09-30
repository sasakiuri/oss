import { LabsOfflineSupport } from '@/components/labs/offline-support';
import { RecoveryNotice } from '@/components/labs/recovery-notice';
import { LabsStartupReady } from '@/components/labs/startup-ready';

/** Layout for the Labs tools, which use their own design rather than the site's. */
export default function StandaloneLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="standalone-app min-h-screen bg-background antialiased">
      <LabsStartupReady />
      <LabsOfflineSupport />
      <RecoveryNotice />
      <div data-labs-startup-failure hidden className="mx-auto max-w-xl space-y-4 p-6" role="alert">
        <p>画面の読み込みに失敗しました。保存済みのデータは変更していません。</p>
        <p lang="en">The tool could not load. Your saved data has not changed.</p>
        <button type="button" className="rounded bg-primary px-4 py-2 text-on-primary">
          再読み込み / Reload
        </button>
        <p>
          <a href="/labs" className="underline">
            Labs の一覧へ / Back to Labs
          </a>
        </p>
      </div>
      <div data-labs-startup-content>{children}</div>
    </div>
  );
}
