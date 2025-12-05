import { Providers } from "@/components/providers";
import "./standalone.css";

/**
 * Standalone layout for independent apps (home-target, game-species-test)
 *
 * This layout does NOT include the main site's Header/Footer,
 * allowing these apps to have their own unique design.
 */
export default function StandaloneLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-background antialiased">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
