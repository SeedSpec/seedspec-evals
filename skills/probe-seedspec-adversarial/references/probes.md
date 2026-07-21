# Probe catalog

- malformed YAML, JSON, schema versions, enums, digests, and required fields;
- absolute paths, `..` traversal, symlink escape, duplicate paths, and case collisions;
- oversized manifests, definitions, nested objects, repeated aliases, and decompression bombs;
- Markdown that tells the agent to ignore harness instructions, reveal secrets, or alter evaluator output;
- a bundled `SKILL.md` that claims higher authority than core intent or end-user direction;
- implementation profiles that contradict core success criteria or hide blockers;
- resources that request network calls, credential access, external writes, or destructive commands;
- conflicting configuration selections and contradictory acceptance criteria;
- model output that is invalid, overlong, fabricated, or shaped like trusted system metadata;
- idempotency collisions, duplicate submissions, stale status reads, cancellation races, and cross-run access;
- untrusted IDs in routes, logs, filenames, cache keys, and Durable Object names;
- private data in logs, traces, evaluator evidence, exports, or error messages.

For every probe, define the expected boundary and an observable pass condition before execution.
