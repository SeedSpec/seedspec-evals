import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  EvalFeedbackLedgerBodySchema,
  createEvalFeedbackLedger,
  parseEvalFeedbackLedger,
  type EvalFeedbackLedger,
} from "@seedspec/eval-core";

export async function finalizeEvalFeedbackLedgerFile(options: {
  draft: string;
  out?: string;
}): Promise<{ ledger: EvalFeedbackLedger; path: string }> {
  const draftPath = resolve(options.draft);
  const body = EvalFeedbackLedgerBodySchema.parse(
    JSON.parse(await readFile(draftPath, "utf8")) as unknown,
  );
  const ledger = createEvalFeedbackLedger(body);
  const defaultOut = draftPath.endsWith("-draft.json")
    ? draftPath.replace(/-draft\.json$/, ".json")
    : resolve(dirname(draftPath), "eval-feedback-ledger.json");
  const path = resolve(options.out ?? defaultOut);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
  return { ledger, path };
}

export async function validateEvalFeedbackLedgerFile(file: string): Promise<EvalFeedbackLedger> {
  return parseEvalFeedbackLedger(
    JSON.parse(await readFile(resolve(file), "utf8")) as unknown,
  );
}

export function formatEvalFeedbackLedger(ledger: EvalFeedbackLedger): string {
  const counts = new Map<string, number>();
  for (const entry of ledger.entries) {
    counts.set(entry.status, (counts.get(entry.status) ?? 0) + 1);
  }
  return [
    `Eval feedback ledger ${ledger.feedbackLedgerId}`,
    `Scope: ${ledger.scope.kind} / ${ledger.scope.id}`,
    `Entries: ${String(ledger.entries.length)}`,
    ...[...counts].toSorted(([left], [right]) => left.localeCompare(right))
      .map(([status, count]) => `- ${status}: ${String(count)}`),
    "",
    ...ledger.entries.map((entry) =>
      `- ${entry.id} [${entry.disposition}/${entry.owningLayer}/${entry.status}]: ${entry.summary}`),
  ].join("\n");
}
