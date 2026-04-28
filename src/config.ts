import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  chmodSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface Config {
  token: string;
}

export function configPath(): string {
  const home = process.env.HOME || homedir();
  return join(home, ".config", "blob-cli", "config.json");
}

export function readConfig(): Config | null {
  const p = configPath();
  if (!existsSync(p)) return null;
  try {
    const data = JSON.parse(readFileSync(p, "utf8"));
    if (typeof data?.token !== "string") return null;
    return { token: data.token };
  } catch {
    return null;
  }
}

export function writeConfig(token: string): void {
  const p = configPath();
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify({ token }, null, 2), { mode: 0o600 });
  chmodSync(p, 0o600); // ensure 0600 even if file pre-existed
}

export function resolveToken(): string {
  const fromEnv = process.env.BLOB_READ_WRITE_TOKEN;
  if (fromEnv) return fromEnv;
  const fromFile = readConfig();
  if (fromFile) return fromFile.token;
  throw new Error(
    "No Vercel Blob token found. Run `blob init` or set BLOB_READ_WRITE_TOKEN.",
  );
}
