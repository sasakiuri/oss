// SPDX-License-Identifier: MIT
/**
 * Masks the userinfo (username:password) portion of an MQTT broker URL.
 * Returns the URL with credentials replaced by `***`, or unchanged if no userinfo is present.
 */
export function sanitizeBrokerUrl(brokerUrl: string): string {
  // Use regex directly because 'mqtt'/'mqtts' are non-special URL schemes,
  // so the WHATWG URL parser may not extract username/password correctly.
  return brokerUrl.replace(/^(mqtts?:\/\/)[^@/]+@/, '$1***@');
}
