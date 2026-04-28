import * as readline from "node:readline/promises";

export type PromptFn = (question: string) => Promise<string>;

export const prompt: PromptFn = async (question) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(question);
    return answer.trim();
  } finally {
    rl.close();
  }
};
