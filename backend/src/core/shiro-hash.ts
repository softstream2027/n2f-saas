import { createHash, randomBytes } from "crypto";

/**
 * Implémente l'algorithme Apache Shiro SimpleHash (utilisé par Axelor).
 */
export function shiroHashPassword(plainPassword: string): string {
  const salt = randomBytes(16);
  const iterations = 500000;
  const algorithm = "sha512";

  // 1. Premier hash : SHA512(salt + password)
  let hash = createHash(algorithm)
    .update(Buffer.concat([salt, Buffer.from(plainPassword, "utf8")]))
    .digest();

  // 2. Boucle : SHA512(hash) sur 500 000 itérations
  for (let i = 1; i < iterations; i++) {
    hash = createHash(algorithm).update(hash).digest();
  }

  return `$shiro1$SHA-512$${iterations}$${salt.toString("base64")}$${hash.toString("base64")}`;
}