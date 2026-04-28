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
  viewerUrl?: string;
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
    const out: Config = { token: data.token };
    if (typeof data.viewerUrl === "string") out.viewerUrl = data.viewerUrl;
    return out;
  } catch {
    return null;
  }
}

export function writeConfig(config: Config): void {
  const p = configPath();
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(config, null, 2), { mode: 0o600 });
  chmodSync(p, 0o600);
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

export function resolveViewerUrl(): string {
  const fromEnv = process.env.BLOB_VIEWER_URL;
  if (fromEnv) return fromEnv;
  const fromFile = readConfig();
  if (fromFile?.viewerUrl) return fromFile.viewerUrl;
  throw new Error("No viewer URL configured. Run `blob init` or set BLOB_VIEWER_URL.");
}
