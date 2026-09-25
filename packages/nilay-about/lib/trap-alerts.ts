/**
 * Trap and fence alerts through a webhook: a device or service the person already has (a trap
 * sensor, a fence monitor, an automation service) calls a secret URL, and the registered devices
 * get a push notification. Nothing here talks to any particular product.
 */

export const HOOK_LABEL_MAX_LENGTH = 40;
export const HOOK_MESSAGE_MAX_LENGTH = 200;
export const HOOK_DEVICES_MAX = 10;
/** A hook that is neither called nor renewed for this long is deleted. */
export const HOOK_TTL_DAYS = 90;
/** Calls to one hook per minute; more are refused so a faulty device cannot flood the phones. */
export const HOOK_CALLS_PER_MINUTE = 6;
export const HOOK_BODY_MAX_BYTES = 4096;

/**
 * The message a call carries, from JSON (`message`, `text` or `value1`, the names common
 * automation services use), a form field of the same names, or plain text. Control characters are
 * removed and the text is cut to the limit. An empty string means no message.
 */
export function readHookMessage(contentType: string | null, body: string): string {
  const type = (contentType ?? '').split(';')[0]?.trim().toLowerCase();
  const names = ['message', 'text', 'value1'];
  let text = '';
  if (type === 'application/json') {
    try {
      const value: unknown = JSON.parse(body);
      if (typeof value === 'object' && value !== null) {
        const record = value as Record<string, unknown>;
        const found = names.map((name) => record[name]).find((item) => typeof item === 'string');
        text = typeof found === 'string' ? found : '';
      }
    } catch {
      text = '';
    }
  } else if (type === 'application/x-www-form-urlencoded') {
    const form = new URLSearchParams(body);
    text = names.map((name) => form.get(name)).find((item) => item !== null) ?? '';
  } else if (type === 'text/plain') {
    text = body;
  }
  const clean = text
    .replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return [...clean].slice(0, HOOK_MESSAGE_MAX_LENGTH).join('');
}

export interface HookCredentials {
  /** The public id of the hook (the hash of the trigger token). */
  hookId: string;
  /** Stays on the person's devices; adds devices and deletes the hook. */
  manageToken: string;
  /** In the URL devices call; can only raise an alert. */
  triggerToken: string;
}

/**
 * The link that lets another of the person's devices manage a hook. Everything is in the fragment,
 * which is not sent to a server. The trigger URL alone cannot be used to manage the hook.
 */
export const manageFragment = ({ hookId, manageToken, triggerToken }: HookCredentials) =>
  `#manage=${hookId}.${manageToken}.${triggerToken}`;

/** The credentials in a pasted manage link (or its fragment), or null. */
export function readManageFragment(value: string): HookCredentials | null {
  const match = /#manage=([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})$/.exec(value.trim());
  return match?.[1] && match[2] && match[3]
    ? { hookId: match[1], manageToken: match[2], triggerToken: match[3] }
    : null;
}

/** A `curl` line the person can paste into a device's settings or a terminal to test the hook. */
export function curlExample(url: string): string {
  return `curl -X POST -H "Content-Type: application/json" -d '{"message":"test"}' ${url}`;
}
