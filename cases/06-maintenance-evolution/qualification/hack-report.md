# Qualification hack report

Status: planned; counterfactual evaluator runs have not yet been attached.

## False-positive attempt

Candidate: `candidates/known-bad/instructions.md`

The candidate implements caregiver access but does so by resetting approved
local behavior, reviving stale evidence, and granting a broad reusable
caregiver role.

Expected disposition: reject. Feature presence cannot compensate for destructive
evolution or the authority and privacy failures.

## False-negative attempt

Candidate: `candidates/valid-alternative/instructions.md`

The candidate uses an attributed current-intake draft instead of a separate
caregiver form and preserves all local customizations.

Expected disposition: accept. Storage and screen composition may differ while
patient-granted scope, revocation, expiry, privacy, review, and approval remain
fixed.
