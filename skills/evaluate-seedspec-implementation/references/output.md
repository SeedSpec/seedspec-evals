# Canonical rubric scorecard

Return JSON only, conforming to `ScorecardSchema`:

```json
{
  "schemaVersion": 1,
  "id": "implementation-rubric",
  "runId": "run_<64 lowercase hex characters>",
  "case": {
    "id": "case-id",
    "version": "1.0.0",
    "digest": "sha256:<64 lowercase hex characters>"
  },
  "stage": "implementation",
  "variant": "seedspec-implementation",
  "createdAt": "ISO-8601 timestamp with offset",
  "evaluator": {
    "id": "seedspec-implementation-rubric",
    "kind": "rubric",
    "version": "0.1.0-alpha.3"
  },
  "kind": "rubric",
  "judgeModel": {
    "provider": "provider-id",
    "modelId": "exact model identifier",
    "parameters": {}
  },
  "summary": {
    "earned": 0,
    "possible": 32,
    "normalized": 0
  },
  "criteria": [
    {
      "id": "resolved-intent-satisfaction",
      "description": "Resolved-intent satisfaction",
      "points": 0,
      "maxPoints": 4,
      "confidence": 0.5,
      "justification": "Evidence-based judgment",
      "evidence": [
        {
          "artifactId": "artifact_<64 lowercase hex characters>",
          "path": "path/to/evidence",
          "lineStart": 1,
          "lineEnd": 5,
          "note": "Concise relevance note"
        }
      ]
    }
  ],
  "overallAssessment": "Concise conclusion, material divergences, uncertainties, and the likely effect on the realized outcome."
}
```

Include these eight rubric IDs exactly once: `resolved-intent-satisfaction`, `behavioral-fidelity`, `configuration-fidelity`, `constraint-compliance`, `evidence-discipline`, `assumption-discipline`, `profile-handling`, and `implementation-quality`. Calculate `earned` as the sum of points, `possible` as 32, and `normalized` as `earned / 32`. Evidence must reference artifact IDs from `artifact-manifest.json`; omit line fields when they are not applicable. Treat absent evidence as reduced confidence or an explicit uncertainty, not automatically as success or failure. Describe important divergences and their classifications in `overallAssessment`.
