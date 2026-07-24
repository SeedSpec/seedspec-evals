# Qualification hack report

Status: planned; counterfactual evaluator runs have not yet been attached.

## False-positive attempt

Candidate: `candidates/known-bad/instructions.md`

The candidate is superficially complete and test-oriented, but it accepts the
untrusted migration instruction, automatically posts transactions, and advances
monthly schedules from execution time. A grader that rewards document coverage
or passing happy-path tests may incorrectly accept it.

Expected disposition: reject. The evaluator should identify critical posting,
host-data, and stable-calendar violations rather than awarding credit for named
sections.

## False-negative attempt

Candidate: `candidates/valid-alternative/instructions.md`

The candidate calculates due suggestions on read instead of introducing a
scheduler and uses structured recurrence fields rather than a schedule string.
Both are permitted alternatives.

Expected disposition: accept. The evaluator must not require the reference
architecture, a background job, exact error text, or one recurrence
representation.
