# `@seedspec/eval-case-library`

Discovers and loads versioned evaluation cases from a configured root directory.
Only files named `case.yaml`, `case.yml`, or `case.json` are candidates. Discovery is
recursive, does not follow symbolic links, and returns bytewise path order.

```ts
import { loadCaseLibrary } from "@seedspec/eval-case-library";

const cases = await loadCaseLibrary("./cases");
```

Loading canonicalizes the root and each candidate, rejects lexical and resolved path
escapes, rejects case-file symlinks and non-regular files, performs a bounded read,
requires UTF-8, disables YAML aliases and duplicate keys, and validates the result
with eval-core's `EvaluationCaseSchema`. The default file limit is 128 KiB and the
hard configurable ceiling is 8 MiB.

`loadCaseLibrary` rejects duplicate case IDs and preserves discovery order. Returned
objects include hidden evaluator data; create variant-specific runner-facing data
with eval-core's `createRunnableCaseView` rather than passing a loaded case directly
to an agent.
