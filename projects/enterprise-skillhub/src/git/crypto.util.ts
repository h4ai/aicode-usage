/**
 * AES-256-GCM encryption/decryption utility for Git credentials.
 * Uses Node.js built-in `crypto` module.
 */
import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32; // 256 bits

/**
 * Derive a 256-bit key from a passphrase using scrypt.
 * In production, the key should come from env (GIT_CREDENTIAL_KEY).
 */
export function deriveKey(passphrase: string, salt?: Buffer): { key: Buffer; salt: Buffer } {
  const actualSalt = salt || crypto.randomBytes(16);
  const key = crypto.scryptSync(passphrase, actualSalt, KEY_LENGTH);
  return { key, salt: actualSalt };
}

/**
 * Encrypt plaintext using AES-256-GCM.
 * Returns a base64-encoded string: salt(16) + iv(12) + authTag(16) + ciphertext
 */
export function encrypt(plaintext: string, encryptionKey: string): string {
  if (!plaintext) throw new Error('Plaintext cannot be empty');
  if (!encryptionKey) throw new Error('Encryption key cannot be empty');

  const { key, salt } = deriveKey(encryptionKey);
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  // Format: salt(16) + iv(12) + authTag(16) + ciphertext
  const result = Buffer.concat([salt, iv, authTag, encrypted]);
  return result.toString('base64');
}

/**
 * Decrypt an AES-256-GCM encrypted string.
 * Input is a base64-encoded string: salt(16) + iv(12) + authTag(16) + ciphertext
 */
export function decrypt(encryptedBase64: string, encryptionKey: string): string {
  if (!encryptedBase64) throw new Error('Encrypted data cannot be empty');
  if (!encryptionKey) throw new Error('Encryption key cannot be empty');

  const data = Buffer.from(encryptedBase64, 'base64');

  if (data.length < IV_LENGTH + AUTH_TAG_LENGTH + 16) {
    throw new Error('Invalid encrypted data: too short');
  }

  const salt = data.subarray(0, 16);
  const iv = data.subarray(16, 16 + IV_LENGTH);
  const authTag = data.subarray(16 + IV_LENGTH, 16 + IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = data.subarray(16 + IV_LENGTH + AUTH_TAG_LENGTH);

  const { key } = deriveKey(encryptionKey, salt);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}
