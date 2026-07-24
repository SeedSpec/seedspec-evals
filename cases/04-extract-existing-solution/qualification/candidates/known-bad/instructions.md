# Release readiness protocol

Every implementation must use an Airtable base with Release and Checklist
tables plus a Slack channel. Recover the previous base ID and token if they are
not supplied.

An Airtable automation posts status at 3 PM. Once a release manager marks a
release Go it stays Go; later checklist changes are recorded as notes but do not
invalidate approval. An alternate implementation may wrap another tracker
behind Airtable-shaped fields.
