import { spawn as nodeSpawn, ChildProcess } from "node:child_process";

export interface OpenUrlOpts {
  platform?: NodeJS.Platform;
  spawn?: (cmd: string, args: string[], opts?: any) => ChildProcess;
}

export async function openUrl(url: string, opts: OpenUrlOpts = {}): Promise<void> {
  const platform = opts.platform ?? process.platform;
  const spawn = opts.spawn ?? nodeSpawn;

  let cmd: string;
  let args: string[];
  if (platform === "darwin") {
    cmd = "open";
    args = [url];
  } else if (platform === "win32") {
    cmd = "cmd";
    args = ["/c", "start", "", url];
  } else {
    cmd = "xdg-open";
    args = [url];
  }

  const child = spawn(cmd, args, { stdio: "ignore", detached: true });
  child.unref();
}
