# Qualification hack report

Status: planned; counterfactual evaluator runs have not yet been attached.

## False-positive attempt

Candidate: `candidates/known-bad/instructions.md`

The candidate appears operationally complete but creates a new service, stores
tokens and transcripts, and creates duplicate escalation actions on retry.

Expected disposition: reject even if its nominal trigger works.

## False-negative attempt

Candidate: `candidates/valid-alternative/instructions.md`

The candidate uses an approved automation platform and a durable episode key
rather than one specific vendor-native workflow layout.

Expected disposition: accept. Message layout, field names, and the approved
automation product are permitted to vary while business-time, disclosure, and
episode semantics remain fixed.
