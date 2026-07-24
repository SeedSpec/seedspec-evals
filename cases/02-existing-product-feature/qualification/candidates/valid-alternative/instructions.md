# Recurring expense templates

Add feature-owned templates and due occurrences without changing Ledgerly
accounts, categories, transactions, authorization, or CSV history. Calculate
due suggestions when an authorized account member views the account; no
background scheduler is required.

Represent cadence as structured fields with a stable local-date anchor and an
explicit end-of-month rule in the account time zone. Editing or deleting a
template affects future suggestions only. Creating a host transaction requires
an explicit authorized confirmation keyed idempotently to one due occurrence.

Test end-of-month advancement, missed dates, permissions, duplicate
confirmation, edits, deletion, existing Ledgerly behavior, and unchanged CSV
fixtures.
