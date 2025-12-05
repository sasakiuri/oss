"use client";

import {
  LuTwitter,
  LuFacebook,
  LuYoutube,
  LuInstagram,
} from "react-icons/lu";
import { siteConfig } from "@/lib/config";

const socialLinks = [
  {
    href: `https://twitter.com/${siteConfig.social.twitter}`,
    label: "Twitter",
    icon: LuTwitter,
  },
  {
    href: `https://www.facebook.com/${siteConfig.social.facebook}/`,
    label: "Facebook",
    icon: LuFacebook,
  },
  {
    href: `https://www.youtube.com/channel/${siteConfig.social.youtube}`,
    label: "YouTube",
    icon: LuYoutube,
  },
  {
    href: `https://www.instagram.com/${siteConfig.social.instagram}/`,
    label: "Instagram",
    icon: LuInstagram,
  },
];

export function ContactInfo() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-foreground">
          Ｅメールアドレス：{siteConfig.contact.email}
        </p>
        <p className="text-foreground">電話番号：{siteConfig.contact.phone}</p>
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
    </div>
  );
}
