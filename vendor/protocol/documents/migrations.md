# SeedSpec protocol migration contract

> **Normative evolution contract.** This document defines how exact SeedSpec
> protocol releases describe compatibility and how a future mechanical source
> migration must behave.

## Release relationships

Every exact `protocol-release.json` lists its known predecessor relationships:

- `compatible` means packages and resolved inputs may be used directly.
- `revalidate` means source rewriting is unnecessary, but packages and
  handoffs must be validated or regenerated under the new release.
- `migrate` means a package source transformation is required.
- `unsupported` means the release provides no safe automatic path.

Compatibility is declared between exact releases, not inferred from the
`protocol_version` family alone.

## Migration boundary

Migration applies only to protocol-owned package source structure. It does not
rewrite arbitrary artifacts, implementation output, external systems, or
package-authored prose merely to resemble a newer convention.

Resolved `.seedspec/` handoffs are regenerated from source packages and
recorded adopter inputs. They are not migrated as independent source artifacts.
Designated project memory, including implementation notes and verification
evidence, remains subject to the normal re-resolution preservation and
staleness rules.

## Required behavior

When a release declares a `migrate` relationship, the same release MUST provide:

1. a stable migration identifier and guide;
2. positive before-and-after fixtures;
3. negative or ambiguous fixtures that require author review;
4. a dry run that reports planned moves, rewrites, preserved content, and
   unresolved judgment;
5. an explicit write mode;
6. validation of the result against the target release; and
7. a migration report identifying the source release, target release, changes,
   and unresolved items.

A migrator MUST preserve content and provenance, prefer moves or precise field
rewrites over delete-and-recreate behavior, and refuse to guess when intent
cannot be inferred safely.

Protocol release `0.3.0` is a clean authoring cut. It declares earlier exact
releases unsupported. The required primary context module, unified module
inventory, explicit source forms, and nested bridge bindings require authors to
reauthor package structure against the `0.3` schemas. Resolved handoffs must be
regenerated.

The reference CLI recognizes retired package shapes and returns
`UNSUPPORTED_PROTOCOL_MIGRATION`. It does not rewrite them. This boundary is
intentional while SeedSpec has no external adopters.

Authoring workspaces are local process records rather than package content.
Historical authoring records remain readable under their own format rules, but
they do not make an old package valid under Protocol 0.3.
