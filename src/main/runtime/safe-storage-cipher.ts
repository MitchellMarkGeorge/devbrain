import type { SafeStorage } from 'electron';
import type { SecretCipher } from '@main/core/integrations/credentials';

// The part of Electron's safeStorage the cipher uses: the async API only, which never blocks the
// main process on the OS keychain. Taken as an argument, so this file imports no Electron at
// runtime and its test can hand it the real module from inside an Electron process.
export type AsyncSafeStorage = Pick<
  SafeStorage,
  'isAsyncEncryptionAvailable' | 'encryptStringAsync' | 'decryptStringAsync'
>;

/**
 * The SecretCipher the app passes to core, over safeStorage's async API. The key lives in the OS
 * keychain (on Linux, the secret service, or a fixed key when there is none), so a copied database
 * can't be read on another machine.
 *
 * `shouldReEncrypt` is passed through as safeStorage reports it: the key was rotated or a stronger
 * one became available. CredentialStore then encrypts the credentials again and stores them.
 */
export function createSafeStorageCipher(safeStorage: AsyncSafeStorage): SecretCipher {
  return {
    isAvailable: () => safeStorage.isAsyncEncryptionAvailable(),
    encrypt: (plain) => safeStorage.encryptStringAsync(plain),
    async decrypt(cipher) {
      const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(cipher);
      return { result, shouldReEncrypt };
    },
  };
}
