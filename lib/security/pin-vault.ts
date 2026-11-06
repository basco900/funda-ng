import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { RechargePinItem } from "../test-engine/types";

// Recharge PINs are bearer value, so they are stored encrypted (AES-256-GCM)
// and only decrypted for the owning customer's own views.

function key() {
  const raw = process.env.FUNDA_PIN_ENCRYPTION_KEY?.trim();
  if (!raw) return null;
  const buffer = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (buffer.length !== 32) throw new Error("FUNDA_PIN_ENCRYPTION_KEY must be 32 bytes (64 hex chars or base64).");
  return buffer;
}

export function pinVaultConfigured() {
  return key() !== null;
}

export function encryptPins(pins: RechargePinItem[]) {
  const secret = key();
  if (!secret) throw new Error("FUNDA_PIN_ENCRYPTION_KEY is not configured.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secret, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(pins), "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64")}.${cipher.getAuthTag().toString("base64")}.${ciphertext.toString("base64")}`;
}

export function decryptPins(sealed: unknown): RechargePinItem[] | undefined {
  if (typeof sealed !== "string" || !sealed.startsWith("v1.")) return undefined;
  const secret = key();
  if (!secret) return undefined;
  try {
    const [, iv, tag, ciphertext] = sealed.split(".");
    const decipher = createDecipheriv("aes-256-gcm", secret, Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    const plain = Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]).toString("utf8");
    return JSON.parse(plain) as RechargePinItem[];
  } catch {
    return undefined;
  }
}
