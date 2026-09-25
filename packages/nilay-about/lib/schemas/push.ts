import { z } from 'zod';

/** What `PushSubscription.toJSON()` gives, reduced to the parts a sender needs. */
export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(1024),
  keys: z.object({
    // 65-byte uncompressed P-256 point and 16-byte secret, base64url without padding.
    p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}$/),
    auth: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
  }),
});
export type PushSubscriptionData = z.infer<typeof pushSubscriptionSchema>;

export const languageSchema = z.enum(['ja', 'en']);

/** How long the server keeps a device's subscription after it was last registered or refreshed. */
export const PUSH_SUBSCRIPTION_TTL_DAYS = 90;

export const subscriptionRequestSchema = z.object({
  subscription: pushSubscriptionSchema,
  language: languageSchema,
});

export const vapidKeyResponseSchema = z.object({ publicKey: z.string().regex(/^[A-Za-z0-9_-]{87}$/) });

/** Latitude and longitude in decimal degrees (WGS 84, as the browser's Geolocation API gives). */
export const latitudeSchema = z.number().finite().min(-90).max(90);
export const longitudeSchema = z.number().finite().min(-180).max(180);
