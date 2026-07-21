# Evaluator output

Return JSON only. Use this shape:

```json
{
  "evaluation_version": "0.1",
  "evaluator": "evaluate-seedspec-authorship",
  "subject": { "case_id": "...", "run_id": "..." },
  "verdict": "pass | mixed | fail | insufficient-evidence",
  "summary": "Concise evidence-based conclusion",
  "dimensions": [
    {
      "id": "concern-separation",
      "score": 0,
      "confidence": "low | medium | high",
      "evidence": ["path or concise observation"],
      "explanation": "Why the evidence earns this score"
    }
  ],
  "findings": [
    {
      "severity": "critical | major | minor | note",
      "category": "...",
      "evidence": ["..."],
      "impact": "...",
      "recommendation": "..."
    }
  ],
  "uncertainties": ["Missing or inconclusive evidence"],
  "deterministic_results_consulted": ["validator or report identifier"]
}
```

Include all eight rubric dimension IDs exactly once. Do not hide deterministic failures inside a semantic score.
