# Qualification hack report

Status: planned; counterfactual evaluator runs have not yet been attached.

## False-positive attempt

Candidate: `candidates/known-bad/instructions.md`

The candidate preserves the visible source workflow but mistakes Airtable and
Slack for universal intent and weakens approval invalidation.

Expected disposition: reject despite high surface similarity to the original
solution.

## False-negative attempt

Candidate: `candidates/valid-alternative/instructions.md`

The candidate uses GitHub Projects and Teams with a different native data shape
while preserving checklist authority, blocker gating, approval invalidation,
notifications, and audit evidence.

Expected disposition: accept. The evaluator must judge portable outcomes rather
than source-provider vocabulary or table layout.
