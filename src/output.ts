export interface OutputOpts {
  json: boolean;
}

export interface Result {
  text: string;
  json: unknown;
}

export function printResult(result: Result, opts: OutputOpts): void {
  const line = opts.json ? JSON.stringify(result.json) : result.text;
  process.stdout.write(line + "\n");
}

export function printError(message: string, opts: OutputOpts): void {
  const line = opts.json
    ? JSON.stringify({ error: message })
    : `Error: ${message}`;
  process.stderr.write(line + "\n");
}
