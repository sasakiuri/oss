import 'server-only';

import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/** 32 random bytes, base64url: an identifier or a credential that cannot be guessed. */
export const createToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

/**
 * Credentials are stored only as hashes, so a copy of the database cannot be used to act on a
 * room, a plan or a hook. Tokens are random, so an unsalted SHA-256 is enough for them.
 */
export const hashToken = (token: string) => createHash('sha256').update(token).digest('base64url');

// scrypt's default cost (N = 2^14, r = 8, p = 1) keeps a check near 50 ms on a serverless function.
const KEY_LENGTH = 32;

function derive(passphrase: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(passphrase.normalize('NFC'), salt, KEY_LENGTH, (error, key) => (error ? reject(error) : resolve(key))),
  );
}

/** Passphrases chosen by people are guessable, so they are salted and stretched. */
export async function hashPassphrase(passphrase: string): Promise<string> {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('base64url')}$${(await derive(passphrase, salt)).toString('base64url')}`;
}

export async function verifyPassphrase(passphrase: string, stored: string): Promise<boolean> {
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const actual = await derive(passphrase, Buffer.from(salt, 'base64url'));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
