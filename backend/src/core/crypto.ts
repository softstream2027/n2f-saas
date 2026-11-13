import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { cfg } from "../config";

const key = (): Buffer => {
  const k = Buffer.from(cfg.secretKey, "base64");
  if (k.length !== 32) throw new Error("APP_SECRET_KEY doit contenir 32 octets encodés en base64.");
  return k;
};

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64")).join(".");
}

export function decrypt(payload: string): string {
  const [iv, tag, data] = payload.split(".").map((p) => Buffer.from(p, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
