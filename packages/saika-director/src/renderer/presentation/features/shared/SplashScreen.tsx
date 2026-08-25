import { useEffect } from 'react';
import appIcon from '@/assets/images/appIcon.png';

interface SplashScreenProps {
  version: string;
  onComplete: () => void;
  className?: string;
}

export function SplashScreen({ version, onComplete, className = '' }: SplashScreenProps) {
  useEffect(() => {
    const timer = setTimeout(onComplete, 2000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className={`flex h-screen flex-col items-center justify-center bg-[#1e1e1e] ${className}`.trim()}>
      <div className="mb-8 flex flex-col items-center gap-6">
        <img src={appIcon} alt="Saika Director" className="h-32 w-32" />
        <h1 className="text-6xl font-bold text-[#007acc]">SAIKA DIRECTOR</h1>
        <p className="text-lg text-[#858585]">Multi-Lane Competition Control</p>
      </div>

      <div role="status" aria-live="polite" className="flex flex-col items-center gap-4">
        <div aria-hidden="true" className="flex gap-2">
          <div className="h-3 w-3 animate-pulse rounded-full bg-[#007acc]" />
          <div className="h-3 w-3 animate-pulse rounded-full bg-[#007acc]" style={{ animationDelay: '0.2s' }} />
          <div className="h-3 w-3 animate-pulse rounded-full bg-[#007acc]" style={{ animationDelay: '0.4s' }} />
        </div>
        <p className="text-sm text-[#858585]">Loading...</p>
      </div>

      <div className="absolute bottom-8">
        <p className="text-sm text-[#858585]">Version {version}</p>
      </div>
    </div>
  );
}
