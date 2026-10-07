// Reversible stand-in for the safeStorage cipher — used by CredentialStore tests.
// XORs each byte behind a marker, so ciphertext never contains the plain text and a blob it did
// not write fails to decrypt, as safeStorage's does. Each key version has its own marker, so a test
// can rotate the key and see old blobs flagged for re-encryption.

import { SecretCipher } from '../../integrations/credentials';

const KEY = 0x5a;

export class FakeCipher implements SecretCipher {
  available = true;
  keyVersion = 1;

  async isAvailable(): Promise<boolean> {
    return this.available;
  }

  async encrypt(plain: string): Promise<Buffer> {
    if (!this.available) throw new Error('Encryption is not available');
    const bytes = Buffer.from(plain, 'utf8').map((byte) => byte ^ KEY);
    return Buffer.concat([marker(this.keyVersion), bytes]);
  }

  async decrypt(cipher: Buffer): Promise<{ result: string; shouldReEncrypt: boolean }> {
    for (let version = 1; version <= this.keyVersion; version++) {
      const prefix = marker(version);
      if (!cipher.subarray(0, prefix.length).equals(prefix)) continue;
      const bytes = cipher.subarray(prefix.length).map((byte) => byte ^ KEY);
      return {
        result: Buffer.from(bytes).toString('utf8'),
        shouldReEncrypt: version !== this.keyVersion,
      };
    }
    throw new Error('Error while decrypting the ciphertext provided to decrypt');
  }
}

function marker(version: number): Buffer {
  return Buffer.from(`fake-cipher-v${version}:`);
}
