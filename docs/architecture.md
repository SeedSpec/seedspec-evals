# Evaluation architecture

## Decision summary

The first release separates deterministic protocol work from model-driven work.

- The local packages define cases, run manifests, artifacts, scorecards, and reproducibility metadata without depending on Cloudflare.
- The Cloudflare harness extends Think instead of implementing a second agent loop.
- One Think Durable Object instance represents one run. Instance names are derived from run IDs, never from a shared mutable global.
- Cloudflare AI Gateway is the model routing boundary. A run records the exact model identifier and gateway name used.
- One-off turns use Think's durable submission ledger. Multi-step matrix orchestration will use Cloudflare Workflows after the single-run lifecycle is proven.
- The harness has no embedded model and is meant to be called by the CLI, another capable agent, or a future hosted authoring product.
- Run routes require a service bearer token and fail closed when it is not configured. This is an initial service boundary; multi-user hosting still requires caller identity and per-run authorization.
- Every execution request carries its content-addressed run manifest. The boundary verifies the manifest ID and binds the trusted instructions, untrusted source material, simulated author answers, model, gateway, and limits to it before Think receives a turn.

## Data flow

```text
case + runner + model + protocol/tool versions
                    |
                    v
             immutable run manifest
                    |
        +-----------+-----------+
        |                       |
        v                       v
 deterministic checks     Think run instance
                                |
                                v
                      isolated workspace + ledger
                                |
                                v
                        captured run artifacts
        |                       |
        +-----------+-----------+
                    v
            evaluator scorecards
                    |
                    v
          comparison / congruency report
```

## Execution boundaries

Think owns streaming, durable turn recovery, message persistence, file tools, and agent lifecycle hooks. SeedSpec owns the run contract, prompts, permitted tool surface, artifact contract, scoring rubrics, and comparisons.

The runner-facing case projection excludes hidden expectations and simulated author answers. The control plane supplies only an exact-match answer map to the `ask_author` tool, so clarification is reproducible without preloading answers into model context.

The manifest is an execution commitment, not descriptive metadata added after a run. Its ID covers the complete manifest body. Digests in that body cover every model-facing payload that is stored in the execution configuration. The CLI validates the binding when reading a plan, and the Worker validates it again at the service and Durable Object boundaries. A changed prompt, source document, simulated answer, model, gateway, or step limit is a different run and must receive a different manifest and run ID.

The initial Worker supports one-run submission and inspection. A later Workflow coordinator should fan out a matrix of cases, models, and repetitions, wait for terminal states, run evaluators, and persist the aggregate experiment record. This keeps orchestration deterministic while leaving reasoning to Think agents.

## Model routing

The Worker uses the `AI` binding and `workers-ai-provider` with a gateway ID. The model is a validated run configuration value such as `@cf/...`, `openai/...`, or `anthropic/...`. That provides a common AI SDK `LanguageModel` to Think while retaining AI Gateway logging and routing.

## Threat model for the first release

Evaluation inputs are untrusted. A case may contain prompt injection, links, fake instructions, path traversal, oversized content, malformed manifests, or contradictory success criteria.

Therefore the first release:

- disables workspace bash and network/browser/code-execution extensions;
- exposes only the file operations needed for producing artifacts;
- authenticates every run configuration, submission, inspection, and cancellation route;
- validates every API body and committed case before starting a run;
- rejects execution input that is not cryptographically bound to the addressed run manifest;
- separates trusted harness instructions from untrusted case material;
- records tool, model, harness, protocol, and case versions;
- never treats model-generated evaluation text as a deterministic pass;
- requires explicit operator action before cloud model execution.

The initial file-only profile is suitable for authorship and configured-artifact experiments. General application implementation requires a separately isolated code-execution profile with its own threat model; it must not be enabled for hostile authorship cases by broadening the default shell.

## Platform references

- [Cloudflare Think](https://developers.cloudflare.com/agents/harnesses/think/)
- [Think programmatic submissions](https://developers.cloudflare.com/agents/harnesses/think/programmatic-submissions/)
- [Think with Cloudflare Workflows](https://developers.cloudflare.com/agents/harnesses/think/workflows/)
- [Server-side Agent routing](https://developers.cloudflare.com/agents/runtime/communication/routing/)
- [Cloudflare AI Gateway with the Vercel AI SDK](https://developers.cloudflare.com/ai-gateway/integrations/vercel-ai-sdk/)
