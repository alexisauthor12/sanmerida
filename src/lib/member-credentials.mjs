/**
 * Credenciales de acceso de miembros.
 *
 * La clave `SAN-MEMBER-XXXXXX` funciona como contraseña del miembro: se guarda
 * hasheada (bcrypt) para el login y, además, cifrada de forma reversible para
 * que el administrador pueda consultarla desde el expediente.
 *
 * El cifrado usa Web Crypto (AES-256-GCM con clave derivada por HKDF-SHA256),
 * disponible tanto en Node como en Cloudflare Workers, sin dependencias
 * nativas.
 */

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

const HKDF_SALT = "sanmerida-member-credentials-v1";
const HKDF_INFO = "member-access-key";
const CIPHER_VERSION = "v1";
const KEY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const MEMBER_KEY_PATTERN = /^SAN-MEMBER-[A-Z0-9]{6}$/;

export function isMemberKey(value) {
  return MEMBER_KEY_PATTERN.test(String(value ?? "").trim().toUpperCase());
}

export function generateMemberKey() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes, (item) => KEY_ALPHABET[item % KEY_ALPHABET.length]).join("");
  return `SAN-MEMBER-${suffix}`;
}

export function maskMemberKey(plainKey) {
  const normalized = String(plainKey ?? "").trim().toUpperCase();

  if (!normalized) {
    return "No disponible";
  }

  return `SAN-MEMBER-••••${normalized.slice(-2)}`;
}

function bytesToBase64(bytes) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

async function deriveKey(secret) {
  const material = await crypto.subtle.importKey(
    "raw",
    TEXT_ENCODER.encode(String(secret)),
    "HKDF",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: TEXT_ENCODER.encode(HKDF_SALT),
      info: TEXT_ENCODER.encode(HKDF_INFO),
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptMemberKey(plainKey, secret) {
  const normalized = String(plainKey ?? "").trim().toUpperCase();

  if (!normalized || !secret) {
    return null;
  }

  try {
    const key = await deriveKey(secret);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      TEXT_ENCODER.encode(normalized),
    );

    return `${CIPHER_VERSION}:${bytesToBase64(iv)}:${bytesToBase64(new Uint8Array(cipher))}`;
  } catch {
    return null;
  }
}

export async function decryptMemberKey(cipherText, secret) {
  const raw = String(cipherText ?? "").trim();

  if (!raw || !secret) {
    return null;
  }

  const [version, ivPart, dataPart] = raw.split(":");

  if (version !== CIPHER_VERSION || !ivPart || !dataPart) {
    return null;
  }

  try {
    const key = await deriveKey(secret);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(ivPart) },
      key,
      base64ToBytes(dataPart),
    );

    return TEXT_DECODER.decode(plain);
  } catch {
    return null;
  }
}
