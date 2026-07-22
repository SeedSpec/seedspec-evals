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

Supported dimensions are `correctness`, `meaningfulness`, `maintainability`, `flexibility`, `security`, `reliability`, `performance`, `accessibility`, `test-quality`, and `profile-conformance`. Supported methods are `deterministic`, `structured-review`, and `adaptation-challenge`.

