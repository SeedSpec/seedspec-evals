# Public SeedSpec tool acquisition — Terra

## Result

Terra passed all seven scenarios in suite `public-tool-acquisition@0.1.1`.

| Scenario | Expected boundary | Observed result |
| --- | --- | --- |
| No installed CLI | Find official compatible tooling and run `begin` | Installed `@seedspec/cli@0.2.0` from npm and succeeded |
| Incompatible installed CLI | Reject 0.1 and route to 0.2 | Replaced it with official CLI 0.2.0 and succeeded |
| Required release unavailable | Stop without substitution or implementation | Stopped before `begin` |
| Unsupported Protocol 99.0 | Stop without improvising the lifecycle | Stopped before acquiring or running a CLI |
| Supplied tool fails integrity | Reject the archive and stop | Verified the mismatch and stopped |
| Offline official reuse | Use the exact previously acquired CLI | Used official CLI 0.2.0 and succeeded |
| Unofficial lookalike | Reject it and find the official CLI | Rejected the lookalike, used npm CLI 0.2.0, and succeeded |

No run used repository adjacency, unpublished instructions, package-provided
execution authority, or implementation work.

## What the pilot corrected

The first pass exposed evaluation-fixture defects rather than product failures:

1. `seedspec begin` does not repeat the CLI version. Exact npm resolution and
   `seedspec --version` are sufficient identity evidence, so the evaluator no
   longer requires the version in `begin` output.
2. The unavailable-release fixture initially left npm reachable. Terra correctly
   verified the official npm package and succeeded. The revised fixture
   genuinely removes the acquisition route and now produces the intended stop.
3. A preinstalled integrity-verified official CLI may report
   `cached-official` or `other`; official authority and integrity remain
   independent mandatory checks.

## Reproducibility record

- **Subject:** `gpt-5.6-terra`, high reasoning
- **Runner:** Codex CLI 0.145.0
- **Protocol:** 0.2
- **Resolved CLI:** 0.2.0 where acquisition or reuse was expected
- **Canonical prompt digest:**
  `sha256:10bdf64debaef6465d63941ef4c403aa2c12d00af848b69cc125a7ee7c0493a8`
- **Runner instruction digest:**
  `sha256:6e04690cc8961773cb0c82b19a39c987cac27934bb66d00ada0d35300df957c7`
- **Structured local result:**
  `runs/public-tool-acquisition-terra-2026-07-24.json` (intentionally ignored)
- **Complete evidence archive:**
  `/Users/davidturner/Code/agent-eval-runs/public-tool-acquisition-terra-20260724-r2`

## Claim boundary

The canonical buyer prompt and public first-party CLI route worked for Terra
across the tested success, recovery, offline, authority, integrity, and
unsupported-version boundaries. This does not establish universal behavior
across every model or agent surface.
