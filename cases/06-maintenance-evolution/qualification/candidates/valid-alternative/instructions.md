# Caregiver-assisted intake evolution

Preserve the bilingual UI, local triage questions, configured Chicago quiet
hours, stable export codes, existing answers, and their attributable evidence.
Add an attributed caregiver draft to the current intake rather than replacing
the form schema.

The patient creates a 72-hour invitation scoped to permitted current-intake
fields. Protected actions recheck expiry and revocation. The caregiver cannot
view prior visits, answer consent or signature fields, invite another helper,
or approve submission. The patient reviews caregiver-attributed values and
alone submits the intake.

Use an additive migration with rollback evidence. Rerun caregiver, privacy,
migration, translation, reminder, and export checks affected by the change;
retain unrelated evidence with its original provenance.
