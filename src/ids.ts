/**
 * IDs aleatorios no adivinables.
 * Alfabeto sin caracteres ambiguos (0/O, 1/l/I) para que el QR se lea bien
 * y se pueda dictar por teléfono si hace falta.
 * 12 caracteres sobre 56 símbolos ≈ 69 bits de entropía: imposible de adivinar
 * por fuerza bruta, y no hace falta auth para ver un mensaje individual.
 */
const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function randomId(length = 12): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let id = "";
  for (let i = 0; i < length; i++) {
    const byte = bytes[i];
    if (byte !== undefined) id += ALPHABET[byte % ALPHABET.length] ?? "a";
  }
  return id;
}
