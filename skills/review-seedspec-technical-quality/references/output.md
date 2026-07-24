# Technical evaluation object

Return this object for the `technical` field of an evaluation profile:

```json
{
  "checks": [
    {
      "id": "placeholder-code",
      "dimension": "meaningfulness",
      "method": "structured-review",
      "outcome": "concern",
      "description": "Production paths do not rely on placeholder behavior.",
      "assessment": "A success response is returned before persistence completes.",
      "confidence": 0.9,
      "evidence": [
        {
          "path": "src/handler.ts",
          "lineStart": 40,
          "lineEnd": 45,
          "note": "The production handler returns a hard-coded success result."
        }
      ]
    }
  ],
  "quality": {
    "rubricVersion": "0.1.0",
    "dimensions": [
      {
        "dimension": "correctness",
        "status": "assessed",
        "level": 2,
        "confidence": 0.85,
        "assessment": "Core state transitions work, but one material authority edge remains weak.",
        "evidence": [
          {
            "path": "src/loans.ts",
            "lineStart": 40,
            "note": "Production transition guard"
          },
          {
            "path": "test/loans.test.ts",
            "lineStart": 70,
            "note": "Positive and negative transition cases"
          }
        ],
        "findingIds": ["borrower-can-confirm-return"]
      },
      {
        "dimension": "meaningfulness",
        "status": "assessed",
        "level": 3,
        "confidence": 0.8,
        "assessment": "Production paths contain substantive behavior without material placeholder code.",
        "evidence": [{ "path": "src/loans.ts", "lineStart": 1, "note": "Implemented production behavior" }],
        "findingIds": []
      },
      {
        "dimension": "maintainability",
        "status": "assessed",
        "level": 2,
        "confidence": 0.75,
        "assessment": "The small implementation is readable, with some policy coupled to handlers.",
        "evidence": [{ "path": "src/loans.ts", "lineStart": 1, "note": "Policy and handler ownership" }],
        "findingIds": []
      },
      {
        "dimension": "flexibility",
        "status": "unknown",
        "confidence": 0.9,
        "assessment": "No separately captured adaptation evidence establishes change cost.",
        "evidence": [],
        "findingIds": []
      },
      {
        "dimension": "security",
        "status": "assessed",
        "level": 2,
        "confidence": 0.8,
        "assessment": "The principal trust boundary is enforced, with bounded session-hardening gaps.",
        "evidence": [{ "path": "src/auth.ts", "lineStart": 1, "note": "Authentication and authorization boundary" }],
        "findingIds": []
      },
      {
        "dimension": "reliability",
        "status": "assessed",
        "level": 2,
        "confidence": 0.8,
        "assessment": "Core persistence works, but recovery evidence is limited.",
        "evidence": [{ "path": "test/persistence.test.ts", "lineStart": 1, "note": "Persistence behavior" }],
        "findingIds": []
      },
      {
        "dimension": "performance",
        "status": "not-applicable",
        "confidence": 0.9,
        "assessment": "The bounded local fixture has no declared or plausibly material performance requirement.",
        "evidence": [
          {
            "path": "spec.md",
            "lineStart": 1,
            "note": "Evaluated scope is a tiny single-building local application."
          }
        ],
        "findingIds": []
      },
      {
        "dimension": "accessibility",
        "status": "unknown",
        "confidence": 0.95,
        "assessment": "Accessibility matters for the phone-first interface, but the captured evidence does not exercise it sufficiently.",
        "evidence": [],
        "findingIds": []
      },
      {
        "dimension": "test-quality",
        "status": "assessed",
        "level": 2,
        "confidence": 0.85,
        "assessment": "Tests cover core positive and negative behavior but omit some adverse boundaries.",
        "evidence": [{ "path": "test/loans.test.ts", "lineStart": 1, "note": "Behavioral test suite" }],
        "findingIds": []
      },
      {
        "dimension": "evidence-quality",
        "status": "assessed",
        "level": 2,
        "confidence": 0.8,
        "assessment": "Executable evidence distinguishes most core behavior, while browser and adaptation evidence are absent.",
        "evidence": [{ "path": "implementation-verification.json", "note": "Captured command outcomes" }],
        "findingIds": []
      },
      {
        "dimension": "profile-conformance",
        "status": "not-applicable",
        "confidence": 0.95,
        "assessment": "The Markdown-only authored input did not select an implementation profile.",
        "evidence": [{ "path": "input/authored/spec.md", "lineStart": 1, "note": "Authored input identity" }],
        "findingIds": []
      }
    ],
    "findings": [
      {
        "id": "borrower-can-confirm-return",
        "dimension": "correctness",
        "severity": "material",
        "status": "open",
        "description": "The borrower can confirm a transition reserved to the lender.",
        "assessment": "This violates a material authority boundary but does not make all core behavior nonfunctional.",
        "evidence": [
          {
            "path": "src/loans.ts",
            "lineStart": 88,
            "lineEnd": 94,
            "note": "Either participant is accepted as the transition actor."
          }
        ]
      }
    ],
    "readiness": "indeterminate",
    "summary": "Several dimensions are serviceable or robust, but missing accessibility and adaptation evidence keeps overall readiness indeterminate.",
    "limitations": [
      "No separately captured browser or adaptation run was available."
    ]
  },
  "adaptationChallenges": [
    {
      "id": "second-notification-channel",
      "description": "Add a second notification channel without changing the core metric calculation.",
      "authorization": "declared-by-case",
      "outcome": "not-run",
      "assessment": "No disposable implementation copy was available.",
      "evidence": []
    }
  ],
  "summary": "Concise technical assessment, important unknowns, and the likely maintenance effect."
}
```

`quality.dimensions` must include exactly one entry for every supported
dimension: `correctness`, `meaningfulness`, `maintainability`, `flexibility`,
`security`, `reliability`, `performance`, `accessibility`, `test-quality`,
`evidence-quality`, and `profile-conformance`. An `assessed` dimension requires
an ordinal `level` and cited evidence. `unknown` and `not-applicable` dimensions
must omit `level`.

Readiness is derived from the evidence and cannot be chosen independently:

- any open critical finding or any assessed level 0: `blocked`;
- an open critical finding requires level 0 in its dimension; an open material
  finding caps its dimension at level 2; an unknown critical or material
  finding makes its dimension unknown;
- otherwise, any unknown dimension: `indeterminate`;
- otherwise, the lowest assessed level determines `high-risk` (1),
  `serviceable` (2), `robust` (3), or `exceptional` (4);
- no assessed dimensions: `indeterminate`.

Supported check methods are `deterministic`, `structured-review`, and
`adaptation-challenge`. Check outcomes remain `pass`, `fail`, `concern`,
`not-applicable`, or `unknown`; they are supporting observations rather than a
quality total.
