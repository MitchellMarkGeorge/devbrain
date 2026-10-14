import type { SecretCipher } from '@main/core/integrations/credentials';

// Stands in for Electron's safeStorage in the seed script, which a plain Node process can't reach.
// It only encodes the credentials behind a marker, so it keeps them out of plain sight in the
// git-ignored dev folder and no more. The app's cipher reads its blobs in development and stores
// them again under safeStorage (see createSafeStorageCipher), so a seeded workspace stays connected.
const DEV_CIPHER_MARKER = Buffer.from('devbrain-dev-cipher:');

// whether the blob was written by the dev cipher
export function isDevCipherBlob(blob: Buffer): boolean {
  return blob.subarray(0, DEV_CIPHER_MARKER.length).equals(DEV_CIPHER_MARKER);
}

export const devCipher: SecretCipher = {
  isAvailable: async () => true,
  encrypt: async (plain) =>
    Buffer.concat([DEV_CIPHER_MARKER, Buffer.from(Buffer.from(plain).toString('base64'))]),
  decrypt: async (cipher) => {
    if (!isDevCipherBlob(cipher)) throw new Error('Not written by the dev cipher');
    const encoded = cipher.subarray(DEV_CIPHER_MARKER.length).toString();
    return { result: Buffer.from(encoded, 'base64').toString(), shouldReEncrypt: false };
  },
};
