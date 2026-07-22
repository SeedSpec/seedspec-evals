# Canonical rubric scorecard

Return JSON only, conforming to `ScorecardSchema`. Use this shape:

```json
{
  "schemaVersion": 1,
  "id": "authorship-rubric",
  "runId": "run_<64 lowercase hex characters>",
  "case": {
    "id": "case-id",
    "version": "1.0.0",
    "digest": "sha256:<64 lowercase hex characters>"
  },
  "stage": "authorship",
  "variant": "source-only | seedspec-scaffold | seedspec-guided-authoring",
  "createdAt": "ISO-8601 timestamp with offset",
  "evaluator": {
    "id": "seedspec-authorship-rubric",
    "kind": "rubric",
    "version": "0.1.0-alpha.2"
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
      "id": "target-definition",
      "description": "Desired end state",
      "points": 0,
      "maxPoints": 4,
      "confidence": 0.5,
      "justification": "Evidence-based judgment",
      "evidence": [
        {
          "artifactId": "artifact_<64 lowercase hex characters>",
          "path": "definition/application.md",
          "lineStart": 1,
          "lineEnd": 5,
          "note": "Concise relevance note"
        }
      ]
    }
  ],
  "overallAssessment": "Concise conclusion, major findings, uncertainties, and the likely effect on an independent implementing agent."
}
```

Include all eight rubric IDs exactly once. Calculate `earned` as the sum of points, `possible` as 32, and `normalized` as `earned / 32`. Evidence must reference artifact IDs from `artifact-manifest.json`; omit line fields when they are not applicable. Do not hide deterministic failures inside semantic scores.
