# Evaluator output

Return JSON only:

```json
{
  "evaluation_version": "0.1",
  "evaluator": "evaluate-seedspec-implementation",
  "subject": { "case_id": "...", "run_id": "...", "realization_id": "..." },
  "verdict": "pass | mixed | fail | insufficient-evidence",
  "summary": "...",
  "criteria": [
    { "id": "...", "status": "met | partial | unmet | not-observable", "evidence": ["..."] }
  ],
  "dimensions": [
    { "id": "intent-satisfaction", "score": 0, "confidence": "low | medium | high", "evidence": ["..."], "explanation": "..." }
  ],
  "divergences": [
    { "classification": "violation | unsupported-assumption | legitimate-variation | profile-deviation | not-observable", "subject": "...", "evidence": ["..."], "impact": "..." }
  ],
  "findings": [],
  "uncertainties": []
}
```

Include all eight rubric dimension IDs exactly once. Treat absent evidence as `not-observable`, not automatically as success or failure.
