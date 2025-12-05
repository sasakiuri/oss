import "./standalone.css";

/**
 * Standalone layout for independent apps (home-target, game-species-test)
 *
 * This layout does NOT include the main site's Header/Footer,
 * allowing these apps to have their own unique design.
 *
 * Note: This is a Route Group layout, so it inherits <html> and <body>
 * from the root layout. We only apply standalone-specific CSS here.
 */
export default function StandaloneLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="standalone-app min-h-screen bg-background antialiased">
      {children}
    </div>
  );
}
