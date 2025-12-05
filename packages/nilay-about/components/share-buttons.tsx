"use client";

import { LuTwitter, LuFacebook } from "react-icons/lu";

interface ShareButtonsProps {
  title: string;
  url: string;
  twitter?: string;
  className?: string;
}

export function ShareButtons({
  title,
  url,
  twitter,
  className,
}: ShareButtonsProps) {
  const encodedTitle = encodeURIComponent(title);
  const encodedUrl = encodeURIComponent(url);

  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}${twitter ? `&via=${twitter}` : ""}`;
  const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;

  return (
    <div className={className}>
      <div className="flex justify-end gap-2">
        <a
          href={twitterUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Share on Twitter"
          className="inline-flex items-center justify-center rounded-md p-2 text-foreground hover:bg-secondary transition-colors"
        >
          <LuTwitter className="h-5 w-5" />
        </a>
        <a
          href={facebookUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Share on Facebook"
          className="inline-flex items-center justify-center rounded-md p-2 text-foreground hover:bg-secondary transition-colors"
        >
          <LuFacebook className="h-5 w-5" />
        </a>
      </div>
    </div>
  );
}
