// Reversible stand-in for the safeStorage cipher — used by CredentialStore tests.
// XORs each byte behind a marker, so ciphertext never contains the plain text and a blob it did
// not write fails to decrypt, as safeStorage's does.

import { SecretCipher } from '../../integrations/credentials';

const MARKER = Buffer.from('fake-cipher:');
const KEY = 0x5a;

export class FakeCipher implements SecretCipher {
  available = true;

  isAvailable(): boolean {
    return this.available;
  }

  encrypt(plain: string): Buffer {
    const bytes = Buffer.from(plain, 'utf8').map((byte) => byte ^ KEY);
    return Buffer.concat([MARKER, bytes]);
  }

  decrypt(cipher: Buffer): string {
    if (!cipher.subarray(0, MARKER.length).equals(MARKER)) {
      throw new Error('Error while decrypting the ciphertext provided to decrypt');
    }
    return Buffer.from(cipher.subarray(MARKER.length).map((byte) => byte ^ KEY)).toString('utf8');
  }
}
