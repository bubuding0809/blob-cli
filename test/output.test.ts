import { describe, test, expect, mock } from "bun:test";
import { printResult, printError } from "../src/output.ts";

function captureStream(stream: NodeJS.WriteStream): {
  output: () => string;
  restore: () => void;
} {
  let captured = "";
  const original = stream.write.bind(stream);
  stream.write = ((chunk: any) => {
    captured += chunk.toString();
    return true;
  }) as any;
  return {
    output: () => captured,
    restore: () => {
      stream.write = original;
    },
  };
}

describe("printResult", () => {
  test("human mode prints text to stdout with newline", () => {
    const cap = captureStream(process.stdout);
    try {
      printResult({ text: "https://example.com/x", json: { url: "https://example.com/x" } }, { json: false });
      expect(cap.output()).toBe("https://example.com/x\n");
    } finally {
      cap.restore();
    }
  });

  test("JSON mode prints stringified json to stdout with newline", () => {
    const cap = captureStream(process.stdout);
    try {
      printResult({ text: "human", json: { url: "u" } }, { json: true });
      expect(cap.output()).toBe('{"url":"u"}\n');
    } finally {
      cap.restore();
    }
  });
});

describe("printError", () => {
  test("human mode writes 'Error: <msg>' to stderr", () => {
    const cap = captureStream(process.stderr);
    try {
      printError("boom", { json: false });
      expect(cap.output()).toBe("Error: boom\n");
    } finally {
      cap.restore();
    }
  });

  test("JSON mode writes error JSON to stderr", () => {
    const cap = captureStream(process.stderr);
    try {
      printError("boom", { json: true });
      expect(cap.output()).toBe('{"error":"boom"}\n');
    } finally {
      cap.restore();
    }
  });
});
