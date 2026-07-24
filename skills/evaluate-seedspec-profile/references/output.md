# Evaluation profile body

Write JSON only. Do not include `profileId`; the CLI calculates it during finalization.

```json
{
  "schemaVersion": 1,
  "subject": {
    "stage": "authorship",
    "runId": "run_<64 lowercase hex characters>",
    "variant": "evaluation variant when this is a run",
    "case": {
      "id": "evaluation-case-id",
      "version": "1.0.0",
      "digest": "sha256:<64 lowercase hex characters>"
    },
    "kind": "application",
    "package": {
      "id": "package-id",
      "version": "1.0.0",
      "digest": "sha256:<64 lowercase hex characters>",
      "path": "/absolute/path-is-allowed-only-here"
    }
  },
  "createdAt": "ISO-8601 timestamp with offset",
  "evaluator": {
    "id": "seedspec-profile-evaluator",
    "version": "0.1.0-alpha.2",
    "kind": "agent",
    "model": {
      "provider": "provider-id",
      "modelId": "exact model identifier",
      "parameters": {
        "additional": {
          "reasoningEffort": "exact effort requested by the evidence envelope"
        }
      }
    }
  },
  "decisions": [
    {
      "id": "membership-authority",
      "caseAxisId": "membership-authority-axis",
      "domain": "authorization",
      "title": "Who may add members",
      "description": "Select the authority allowed to add another member.",
      "materiality": {
        "level": "material",
        "basis": "author-declared",
        "rationale": "The choice changes access authority."
      },
      "expectedLatitude": "unresolved",
      "alternatives": ["Existing members", "Designated operators"],
      "provenance": {
        "proposedBy": [
          {
            "actor": "package-author",
            "basis": "The primary intent identifies both possible authorities.",
            "evidence": [{ "path": "definition/application.md", "lineStart": 20, "note": "Authority alternatives" }]
          }
        ],
        "selectedBy": [],
        "constrainedBy": [],
        "implementedBy": []
      },
      "disclosure": "explicit",
      "alignment": "not-observed",
      "confidence": 0.95,
      "assessment": "The package exposes the decision but does not select an answer.",
      "evidence": [{ "path": "definition/application.md", "lineStart": 20, "note": "Decision source" }]
    }
  ],
  "obligations": [
    {
      "id": "custody-confirmation",
      "caseAxisId": "custody-confirmation-axis",
      "kind": "behavior",
      "description": "A borrower confirms custody before an item becomes borrowed.",
      "importance": "critical",
      "source": [{ "path": "definition/application.md", "lineStart": 32, "note": "Required transition" }],
      "plannedEvidence": [{ "path": "acceptance/criteria.md", "lineStart": 10, "note": "Acceptance scenario" }],
      "observedEvidence": [],
      "coverage": "covered",
      "distinguishing": "yes",
      "assessment": "The negative and positive transition cases distinguish correct behavior.",
      "confidence": 0.9
    }
  ],
  "structure": [
    {
      "id": "instructions-duplicate-authority",
      "kind": "duplicated-authority",
      "severity": "review",
      "description": "Agent instructions repeat product obligations from the primary definition.",
      "canonicalOwner": "definition/application.md",
      "recommendation": "Replace repeated obligations with routing and authority guidance.",
      "confidence": 0.9,
      "evidence": [
        { "path": "instructions.md", "lineStart": 12, "note": "Repeated obligation" },
        { "path": "definition/application.md", "lineStart": 30, "note": "Canonical statement" }
      ]
    }
  ],
  "process": {
    "capture": {
      "turns": "reported",
      "tokens": "unavailable",
      "cache": "unavailable",
      "duration": "reconstructed"
    },
    "turns": { "total": 2, "user": 1, "agent": 1, "clarification": 0, "correction": 0 },
    "tokens": {},
    "toolCalls": 8,
    "durationMs": 90000,
    "notes": ["Provider token accounting was unavailable."]
  },
  "technical": {
    "checks": [],
    "adaptationChallenges": [],
    "summary": "No implementation was in scope for this authorship profile."
  },
  "summary": "Descriptive conclusion without a winner or normalized score.",
  "limitations": ["No implementation choices were observable at the authorship stage."]
}
```

Omit `runId`, `variant`, `case`, `package`, `process`, or `technical` only when they are genuinely outside the subject or unavailable. A run subject requires `runId`, `variant`, and its exact `case`; a standalone package subject may omit them. At least one of `subject.runId` and `subject.package` is required. Evidence must identify a relative path, artifact ID, or trace sequence and must include a relevance note.

Implementation profiles must include `technical.quality` with exactly one
dimension record for every dimension defined by the technical-review skill.
Authorship profiles may omit `technical` entirely; the abbreviated
authorship-only example above is not a valid implementation quality vector.

For an evidence-bound run, include every comparison axis exactly once. `caseAxisId` is the stable denominator across profiles. Records without it are useful subject-specific findings, but they remain outside direct cross-variant comparison. The finalizer rejects missing, duplicated, unknown, or semantically changed case axes.
