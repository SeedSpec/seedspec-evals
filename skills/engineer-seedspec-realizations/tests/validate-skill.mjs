import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const skillRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const skill = await readFile(join(skillRoot, "SKILL.md"), "utf8");
const referencesRoot = join(skillRoot, "references");
const referenceNames = (await readdir(referencesRoot)).sort();

assert.deepEqual(referenceNames, [
  "operating-semantics.md",
  "planning-and-authority-gates.md",
  "state-and-surface-gates.md",
  "verification-and-readiness-gates.md",
]);

const allText = [
  skill,
  ...await Promise.all(
    referenceNames.map((name) => readFile(join(referencesRoot, name), "utf8")),
  ),
].join("\n");

assert.doesNotMatch(allText, /\bTODO\b|\[TODO/i);
assert.doesNotMatch(allText, /tool lending|neighborhood|hidden expectation/i);
assert.doesNotMatch(allText, /\b\d+\s*(?:points?|\/\s*10)\b/i);

for (const referenceName of referenceNames) {
  assert.match(skill, new RegExp(`references/${referenceName.replace(".", "\\.")}`));
}

for (let gate = 1; gate <= 7; gate += 1) {
  assert.match(allText, new RegExp(`## G${gate} — `));
}

for (const heading of [
  "### Control objective",
  "### Pass condition",
  "### Stop or qualify when",
  "### Record",
]) {
  const matches = allText.match(new RegExp(heading, "g")) ?? [];
  assert.equal(matches.length, 7, `${heading} must appear once for every gate`);
}

assert.match(allText, /A gate record proves only that the process was recorded/);
assert.match(allText, /independent evaluator/i);

process.stdout.write("engineer-seedspec-realizations structure is valid\n");
