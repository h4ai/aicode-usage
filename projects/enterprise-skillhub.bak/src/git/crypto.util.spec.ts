import { encrypt, decrypt, deriveKey } from './crypto.util';

describe('CryptoUtil', () => {
  const ENCRYPTION_KEY = 'test-encryption-key-32-chars-long';

  describe('deriveKey', () => {
    it('should derive a 32-byte key from passphrase', () => {
      const { key, salt } = deriveKey('my-passphrase');
      expect(key).toBeInstanceOf(Buffer);
      expect(key.length).toBe(32);
      expect(salt).toBeInstanceOf(Buffer);
      expect(salt.length).toBe(16);
    });

    it('should produce same key with same salt', () => {
      const { key: key1, salt } = deriveKey('my-passphrase');
      const { key: key2 } = deriveKey('my-passphrase', salt);
      expect(key1.equals(key2)).toBe(true);
    });

    it('should produce different keys with different passphrases', () => {
      const { salt } = deriveKey('passphrase-1');
      const { key: key1 } = deriveKey('passphrase-1', salt);
      const { key: key2 } = deriveKey('passphrase-2', salt);
      expect(key1.equals(key2)).toBe(false);
    });
  });

  describe('encrypt', () => {
    it('should encrypt plaintext to base64 string', () => {
      const result = encrypt('my-secret-token', ENCRYPTION_KEY);
      expect(typeof result).toBe('string');
      // Base64 encoded: salt(16) + iv(12) + authTag(16) + ciphertext
      const decoded = Buffer.from(result, 'base64');
      expect(decoded.length).toBeGreaterThan(44); // 16+12+16 = 44 minimum overhead
    });

    it('should produce different ciphertexts for same plaintext (random IV)', () => {
      const result1 = encrypt('same-text', ENCRYPTION_KEY);
      const result2 = encrypt('same-text', ENCRYPTION_KEY);
      expect(result1).not.toBe(result2);
    });

    it('should throw on empty plaintext', () => {
      expect(() => encrypt('', ENCRYPTION_KEY)).toThrow('Plaintext cannot be empty');
    });

    it('should throw on empty key', () => {
      expect(() => encrypt('text', '')).toThrow('Encryption key cannot be empty');
    });
  });

  describe('decrypt', () => {
    it('should decrypt encrypted data back to original', () => {
      const original = 'ghp_abcdef1234567890TokenHere';
      const encrypted = encrypt(original, ENCRYPTION_KEY);
      const decrypted = decrypt(encrypted, ENCRYPTION_KEY);
      expect(decrypted).toBe(original);
    });

    it('should handle multi-byte characters (UTF-8)', () => {
      const original = '密码：这是中文凭证🔑';
      const encrypted = encrypt(original, ENCRYPTION_KEY);
      const decrypted = decrypt(encrypted, ENCRYPTION_KEY);
      expect(decrypted).toBe(original);
    });

    it('should handle long SSH keys', () => {
      const sshKey = `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAABlwAAAAdzc2gtcn
NhAAAAAwEAAQAAAYEA${'A'.repeat(500)}
-----END OPENSSH PRIVATE KEY-----`;
      const encrypted = encrypt(sshKey, ENCRYPTION_KEY);
      const decrypted = decrypt(encrypted, ENCRYPTION_KEY);
      expect(decrypted).toBe(sshKey);
    });

    it('should throw on wrong key', () => {
      const encrypted = encrypt('secret', ENCRYPTION_KEY);
      expect(() => decrypt(encrypted, 'wrong-key-entirely')).toThrow();
    });

    it('should throw on tampered ciphertext', () => {
      const encrypted = encrypt('secret', ENCRYPTION_KEY);
      const buf = Buffer.from(encrypted, 'base64');
      buf[buf.length - 1] ^= 0xff; // flip last byte
      const tampered = buf.toString('base64');
      expect(() => decrypt(tampered, ENCRYPTION_KEY)).toThrow();
    });

    it('should throw on empty encrypted data', () => {
      expect(() => decrypt('', ENCRYPTION_KEY)).toThrow('Encrypted data cannot be empty');
    });

    it('should throw on too short data', () => {
      const short = Buffer.alloc(10).toString('base64');
      expect(() => decrypt(short, ENCRYPTION_KEY)).toThrow('too short');
    });
  });

  describe('roundtrip', () => {
    const testCases = [
      'simple-token',
      'ghp_1234567890abcdef',
      'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQ...',
      'username:password',
      '{"token":"abc","refresh":"def"}',
    ];

    testCases.forEach((original) => {
      it(`should roundtrip: "${original.substring(0, 30)}..."`, () => {
        const encrypted = encrypt(original, ENCRYPTION_KEY);
        const decrypted = decrypt(encrypted, ENCRYPTION_KEY);
        expect(decrypted).toBe(original);
      });
    });
  });
});
