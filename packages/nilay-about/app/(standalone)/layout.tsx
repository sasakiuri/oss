import { LabsOfflineSupport } from '@/components/labs/offline-support';
import { RecoveryNotice } from '@/components/labs/recovery-notice';

/** Layout for the Labs tools, which use their own design rather than the site's. */
export default function StandaloneLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="standalone-app min-h-screen bg-background antialiased">
      <LabsOfflineSupport />
      <RecoveryNotice />
      {children}
    </div>
  );
}
