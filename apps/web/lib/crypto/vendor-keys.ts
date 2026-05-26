import sodium from "libsodium-wrappers";

// libsodium needs sodium.ready resolved before any primitive is used. We cache
// that one-time bootstrap so callers can `await` it lazily and concurrently
// without re-initialising the module.
type Sodium = typeof sodium;
let readyPromise: Promise<Sodium> | null = null;

function getSodium(): Promise<Sodium> {
  if (!readyPromise) {
    readyPromise = sodium.ready.then(() => sodium);
  }
  return readyPromise;
}

function loadKey(s: Sodium): Uint8Array {
  const hex = process.env.VENDOR_KEY_ENC_SECRET;
  if (!hex) {
    throw new Error(
      "VENDOR_KEY_ENC_SECRET is not set — required for vendor key encryption",
    );
  }
  let key: Uint8Array;
  try {
    key = s.from_hex(hex);
  } catch {
    throw new Error("VENDOR_KEY_ENC_SECRET is not valid hex");
  }
  if (key.length !== s.crypto_secretbox_KEYBYTES) {
    throw new Error(
      `VENDOR_KEY_ENC_SECRET must hex-decode to ${s.crypto_secretbox_KEYBYTES} bytes`,
    );
  }
  return key;
}

export async function encryptVendorKey(plaintext: string): Promise<string> {
  const s = await getSodium();
  const key = loadKey(s);
  const nonce = s.randombytes_buf(s.crypto_secretbox_NONCEBYTES);
  const ciphertext = s.crypto_secretbox_easy(
    s.from_string(plaintext),
    nonce,
    key,
  );
  const combined = new Uint8Array(nonce.length + ciphertext.length);
  combined.set(nonce, 0);
  combined.set(ciphertext, nonce.length);
  return s.to_base64(combined, s.base64_variants.URLSAFE_NO_PADDING);
}

export async function decryptVendorKey(ciphertext: string): Promise<string> {
  const s = await getSodium();
  const key = loadKey(s);
  let combined: Uint8Array;
  try {
    combined = s.from_base64(ciphertext, s.base64_variants.URLSAFE_NO_PADDING);
  } catch {
    throw new Error("Vendor key ciphertext is not valid URL-safe base64");
  }
  const nonceLen = s.crypto_secretbox_NONCEBYTES;
  if (combined.length <= nonceLen) {
    throw new Error("Vendor key ciphertext is too short");
  }
  const nonce = combined.subarray(0, nonceLen);
  const body = combined.subarray(nonceLen);
  let plaintext: Uint8Array;
  try {
    plaintext = s.crypto_secretbox_open_easy(body, nonce, key);
  } catch {
    throw new Error("Vendor key ciphertext failed authentication");
  }
  return s.to_string(plaintext);
}
