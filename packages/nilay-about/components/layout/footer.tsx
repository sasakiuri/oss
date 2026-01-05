"use client";

import {
  LuTwitter,
  LuFacebook,
  LuYoutube,
  LuInstagram,
  LuGithub,
} from "react-icons/lu";

const services = [
  { href: "https://knowledge.nilay.jp/", label: "Knowledge" },
  { href: "https://www.nilay.jp/", label: "E-commerce" },
  { href: "https://gunman.nilay.jp/", label: "Gunman" },
];

const socialLinks = [
  {
    href: "https://twitter.com/NilayJP",
    label: "Twitter",
    icon: LuTwitter,
  },
  {
    href: "https://www.facebook.com/NilaySport/",
    label: "Facebook",
    icon: LuFacebook,
  },
  {
    href: "https://www.youtube.com/channel/UC03yJGn_rZV2MTpr-ZrMZrA",
    label: "YouTube",
    icon: LuYoutube,
  },
  {
    href: "https://www.instagram.com/NilayJP/",
    label: "Instagram",
    icon: LuInstagram,
  },
  {
    href: "https://github.com/nilay-jp",
    label: "GitHub",
    icon: LuGithub,
  },
];

export function Footer() {
  return (
    <footer className="mt-12 bg-secondary py-6">
      <div className="mx-auto max-w-6xl px-4">
        <div className="space-y-6">
          <div>
            <h3 className="mb-4 text-base font-bold text-foreground">
              Services
            </h3>
            <ul className="space-y-2">
              {services.map((service) => (
                <li key={service.href}>
                  <a
                    href={service.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-base text-foreground hover:text-primary transition-colors"
                  >
                    {service.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex gap-4">
            {socialLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={link.label}
                className="text-foreground hover:text-primary transition-colors"
              >
                <link.icon className="h-8 w-8" />
              </a>
            ))}
          </div>

          <div className="text-center text-sm text-foreground" suppressHydrationWarning>
            &copy; {new Date().getFullYear()} Nilay
          </div>
        </div>
      </div>
    </footer>
  );
}
