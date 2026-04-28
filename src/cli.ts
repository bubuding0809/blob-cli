#!/usr/bin/env node
import { Command } from "commander";

import { runInit } from "./commands/init.ts";
import { runUpload } from "./commands/upload.ts";
import { runList } from "./commands/list.ts";
import { runGet } from "./commands/get.ts";
import { runDelete } from "./commands/delete.ts";
import { printError } from "./output.ts";

let jsonMode = false;

const program = new Command();

program
  .name("blob")
  .description("Tiny CLI for publishing static files to Vercel Blob (BYOB).")
  .version("0.1.0");

program
  .command("init")
  .description("Set up your Vercel Blob token (one-time onboarding).")
  .option("--force", "overwrite existing config or env-set token")
  .action(async (opts) => runInit({ force: !!opts.force }));

program
  .command("upload <path>")
  .description("Upload a file and print its public URL.")
  .option("--name <name>", "override the blob filename")
  .option("--json", "machine-readable output")
  .action(async (path, opts) => {
    jsonMode = !!opts.json;
    return runUpload({ path, name: opts.name, json: jsonMode });
  });

program
  .command("list")
  .description("List blobs in the store.")
  .option("--prefix <prefix>", "filter by pathname prefix")
  .option("--limit <n>", "maximum results", (v) => parseInt(v, 10), 100)
  .option("--json", "machine-readable output")
  .action(async (opts) => {
    jsonMode = !!opts.json;
    return runList({ prefix: opts.prefix, limit: opts.limit, json: jsonMode });
  });

program
  .command("get <urlOrPath>")
  .description("Fetch a blob; streams to stdout or --out.")
  .option("--out <file>", "write to file instead of stdout")
  .option("--json", "machine-readable output (only relevant for errors)")
  .action(async (urlOrPath, opts) => {
    jsonMode = !!opts.json;
    return runGet({ urlOrPath, out: opts.out });
  });

program
  .command("delete <urlOrPath>")
  .description("Delete a blob.")
  .option("--json", "machine-readable output")
  .action(async (urlOrPath, opts) => {
    jsonMode = !!opts.json;
    return runDelete({ urlOrPath, json: jsonMode });
  });

program.parseAsync(process.argv).catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  printError(message, { json: jsonMode });
  process.exit(1);
});
