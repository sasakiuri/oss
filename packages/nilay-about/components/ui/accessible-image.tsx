"use client";

import Image, { type ImageProps } from "next/image";
import { cn } from "@/lib/utils";

/**
 * AccessibleImage - Image component with enforced accessibility
 *
 * This wrapper ensures all images have proper alt text.
 * Use `decorative={true}` for purely decorative images.
 */
interface AccessibleImageProps extends Omit<ImageProps, "alt"> {
  alt: string;
  decorative?: boolean;
}

export function AccessibleImage({
  alt,
  decorative = false,
  className,
  ...props
}: AccessibleImageProps) {
  // For decorative images, use empty alt and aria-hidden
  if (decorative) {
    return (
      <Image
        alt=""
        aria-hidden="true"
        className={cn("select-none", className)}
        {...props}
      />
    );
  }

  // Ensure alt is not empty for non-decorative images
  if (!alt.trim()) {
    console.warn(
      "AccessibleImage: Non-decorative images must have meaningful alt text"
    );
  }

  return <Image alt={alt} className={className} {...props} />;
}

/**
 * Avatar image with accessibility defaults
 */
interface AvatarImageProps
  extends Omit<AccessibleImageProps, "width" | "height" | "alt"> {
  size?: number;
  name: string;
}

export function AvatarImage({
  name,
  size = 40,
  className,
  ...props
}: AvatarImageProps) {
  return (
    <AccessibleImage
      alt={`${name}のアバター`}
      width={size}
      height={size}
      className={cn("rounded-full", className)}
      {...props}
    />
  );
}

/**
 * Thumbnail image with lazy loading
 */
interface ThumbnailProps extends Omit<AccessibleImageProps, "loading" | "sizes"> {
  aspectRatio?: "square" | "video" | "wide";
}

const aspectRatioClasses = {
  square: "aspect-square",
  video: "aspect-video",
  wide: "aspect-[2/1]",
};

export function Thumbnail({
  aspectRatio = "video",
  className,
  ...props
}: ThumbnailProps) {
  return (
    <div className={cn("relative overflow-hidden", aspectRatioClasses[aspectRatio], className)}>
      <AccessibleImage
        loading="lazy"
        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
        fill
        className="object-cover"
        {...props}
      />
    </div>
  );
}
