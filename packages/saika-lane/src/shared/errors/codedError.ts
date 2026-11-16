// SPDX-License-Identifier: MIT

/**
 * An Error that carries a wire-visible `code` outside the error catalog. MQTT
 * acknowledgements report the code and the message as given.
 */
export function codedError(code: string, message: string): Error & { code: string } {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
}
