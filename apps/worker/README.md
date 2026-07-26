# SeedSpec evaluation Worker

This Worker is the Cloudflare Think execution boundary for one evaluation run. A run ID names exactly one `SeedSpecEvalAgent` Durable Object. The agent persists its configuration with Think, accepts turns through Think's durable submission ledger, and uses the configured Workers AI model through the configured AI Gateway.

Every `/v1/runs/*` route requires `Authorization: Bearer <SEEDSPEC_EVAL_API_TOKEN>`. If the secret is missing or shorter than 32 characters, run routes fail closed. Configure it with `wrangler secret put SEEDSPEC_EVAL_API_TOKEN`; use `.dev.vars` only for local development. `/health` remains public and never returns run material.

## API

All mutation bodies use `Content-Type: application/json`. Validation errors return a stable `{ "ok": false, "error": { "code", "message", "requestId" } }` envelope without exposing schema internals.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Inspect the stateless Worker service and harness version. |
| `GET` | `/v1/runs/:runId/health` | Inspect run configuration/degradation state and active submissions. |
| `PUT` | `/v1/runs/:runId/config` | Idempotently initialize persisted run configuration. Conflicting reconfiguration returns `409`. |
| `GET` | `/v1/runs/:runId/config` | Inspect persisted run configuration. |
| `POST` | `/v1/runs/:runId/submissions` | Initialize the same configuration if needed and durably submit one Think turn. |
| `GET` | `/v1/runs/:runId/submissions?status=&limit=` | List submission ledger records. |
| `GET` | `/v1/runs/:runId/submissions/:submissionId` | Inspect one submission. |
| `DELETE` | `/v1/runs/:runId/submissions/:submissionId` | Idempotently cancel pending/running work and return its current inspection. |
| `GET` | `/v1/runs/:runId/trace` | Export the terminal run trace, workspace digest, and required-deliverable completion check. |

A submit body has this shape. The CLI generates the full content-addressed manifest; it is abbreviated here only for readability:

```json
{
  "manifest": {
    "runId": "run_<64 lowercase hex characters>",
    "case": { "id": "sparse-app", "version": "1.0.0", "digest": "sha256:<case digest>" },
    "target": { "stage": "authorship" },
    "variant": "seedspec-guided",
    "model": { "modelId": "@cf/meta/llama-4-scout-17b-16e-instruct" },
    "instructionsDigest": "sha256:<trusted instruction digest>",
    "configuration": {
      "gatewayId": "seedspec-evals",
      "maxSteps": 6,
      "untrustedMaterialDigest": "sha256:<source material digest>",
      "simulatedAuthorResponsesDigest": "sha256:<answer map digest>"
    }
  },
  "config": {
    "runId": "run_<64 lowercase hex characters>",
    "caseId": "sparse-app",
    "stage": "authorship",
    "variant": "seedspec-guided",
    "model": "@cf/meta/llama-4-scout-17b-16e-instruct",
    "gatewayId": "seedspec-evals",
    "maxSteps": 6,
    "trustedInstructions": ["Produce the requested SeedSpec artifacts."],
    "untrustedMaterial": "Case material is carried here as data.",
    "simulatedAuthorResponses": {
      "preferred_platform": "Use Cloudflare Workers."
    }
  },
  "idempotencyKey": "experiment-1-attempt-1",
  "metadata": {}
}
```

The actual `manifest` must satisfy the full `RunManifestSchema`; abbreviated manifests are rejected. Its content-addressed ID and payload digests must match the execution configuration. `trustedInstructions` are placed in the system prompt. `untrustedMaterial` is placed only in an explicitly untrusted user-data envelope. Simulated author responses stay outside that envelope and are available only through the exact-match `ask_author` tool; an unknown question ID returns no answer.

Think submission status and evaluation outcome are distinct. A `completed` submission means the model turn reached a terminal state. Trace export reports `succeeded` only when the workspace can also be represented by a portable digest and every required deliverable has an adapter-verifiable path that exists in the artifact inventory. The trace records this decision as `completion-check`. This is a delivery and integrity gate, not a semantic-quality judgment; rubric and hidden-expectation evaluators remain responsible for deciding whether delivered content is correct, safe, and useful.

## Safety and current scope

Every variant exposes only `read`, `write`, `edit`, `list`, `find`, `grep`, and `ask_author` as its base. Raw-source and general-Markdown variants receive no SeedSpec tools. The minimal SeedSpec variant adds package validation and digest tools. Guided and restructured authoring also add kind-aware lint and versioned audit guidance. Workspace Bash, generic fetch/network access, browser tools, code execution, extensions, MCP tools, and reasoning delivery remain disabled. Model steps and durable recovery are bounded.

This proves the isolated configuration, clarification, submission, inspection, cancellation, and artifact-workspace lifecycle. The current narrow tools support schema-aware package review without enabling a general shell. Scaffold creation is still performed through file tools in Think; exact `seedspec init` parity requires a future narrow initialization tool rather than broad command execution.

The bearer token is the initial service boundary, not a complete multi-tenant identity system. Put the Worker behind Cloudflare Access or add signed caller identity and per-run authorization before accepting material from multiple users or organizations.
