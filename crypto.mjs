export const ITERATIONS = 600000;
const encode = value => btoa(String.fromCharCode(...new Uint8Array(value)));
const decode = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));
export async function deriveKey(password, salt) {
  const raw = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2', hash:'SHA-256', salt:decode(salt), iterations:ITERATIONS}, raw, {name:'AES-GCM', length:256}, false, ['encrypt','decrypt']);
}
export async function encrypt(value, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({name:'AES-GCM',iv}, key, new TextEncoder().encode(JSON.stringify(value)));
  return {iv:encode(iv), ciphertext:encode(ciphertext)};
}
export async function decrypt(envelope, key) {
  return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(envelope.iv)}, key, decode(envelope.ciphertext))));
}
export const newSalt = () => encode(crypto.getRandomValues(new Uint8Array(16)));
