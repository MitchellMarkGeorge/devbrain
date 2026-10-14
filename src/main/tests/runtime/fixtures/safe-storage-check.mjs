// Run by safe-storage-cipher.test.ts as an Electron main process, where safeStorage exists. It
// loads the cipher's TypeScript through tsx, exercises it over the real safeStorage, prints one
// RESULT line of JSON for the test to check, and quits.
import { app, safeStorage } from 'electron';
import { register } from 'tsx/esm/api';

register();
const { createSafeStorageCipher } = await import('../../../runtime/safe-storage-cipher.ts');
const { devCipher } = await import('../../../runtime/dev-cipher.ts');

const PLAIN = '{"type":"api_key","apiKey":"lin_api_round_trip"}';

// the outcome of a call, as JSON can carry it
async function settle(promise) {
  try {
    return { ok: true, value: await promise };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// Not a top-level await: Electron emits ready only once the main module has finished loading, so
// awaiting it here would wait forever.
app.whenReady().then(run);

async function run() {
  try {
    const cipher = createSafeStorageCipher(safeStorage);
    const devAware = createSafeStorageCipher(safeStorage, { readDevBlobs: true });
    const available = await cipher.isAvailable();
    const encrypted = await cipher.encrypt(PLAIN);
    const devBlob = await devCipher.encrypt(PLAIN);
    const result = {
      available,
      safeStorageAvailable: await safeStorage.isAsyncEncryptionAvailable(),
      encryptedIsBuffer: Buffer.isBuffer(encrypted),
      encryptedHoldsPlain: encrypted.includes(Buffer.from('lin_api_round_trip')),
      decrypted: await settle(cipher.decrypt(encrypted)),
      garbage: await settle(cipher.decrypt(Buffer.from('not a safeStorage blob'))),
      devBlob: await settle(devAware.decrypt(devBlob)),
      devBlobRefused: await settle(cipher.decrypt(devBlob)),
      devAwareDecrypted: await settle(devAware.decrypt(encrypted)),
    };
    console.log(`RESULT ${JSON.stringify(result)}`);
  } catch (error) {
    console.log(`RESULT ${JSON.stringify({ crashed: String(error?.stack ?? error) })}`);
  } finally {
    app.quit();
  }
}
