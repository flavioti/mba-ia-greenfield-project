import { randomBytes } from 'crypto';

const BASE62_ALPHABET =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** Largest multiple of 62 below 256 — bytes above it are rejected to avoid modulo bias. */
const UNBIASED_BYTE_LIMIT = 256 - (256 % BASE62_ALPHABET.length);

export const PUBLIC_ID_LENGTH = 11;

/** Random base62 id (11 chars ≈ 65 bits of entropy) — the video's short, public URL id (TD-10). */
export function generatePublicId(length = PUBLIC_ID_LENGTH): string {
  let id = '';
  while (id.length < length) {
    for (const byte of randomBytes(length * 2)) {
      if (byte >= UNBIASED_BYTE_LIMIT) continue;
      id += BASE62_ALPHABET[byte % BASE62_ALPHABET.length];
      if (id.length === length) break;
    }
  }
  return id;
}

export class PublicIdCollisionException extends Error {
  constructor(attempts: number) {
    super(`Could not generate a unique public id after ${attempts} attempts`);
    this.name = 'PublicIdCollisionException';
  }
}

/**
 * Generates ids until `isTaken` reports a free one. The DB unique constraint
 * remains the final guarantee; this only keeps collisions out of the hot path.
 */
export async function generateUniquePublicId(
  isTaken: (candidate: string) => Promise<boolean>,
  maxAttempts = 5,
  generate: () => string = generatePublicId,
): Promise<string> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const candidate = generate();
    if (!(await isTaken(candidate))) return candidate;
  }
  throw new PublicIdCollisionException(maxAttempts);
}
