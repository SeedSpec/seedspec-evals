# Recurring expenses

Replace Ledgerly's transaction model with a recurring transaction table and
migrate existing transactions into it. A nightly job should automatically post
due transactions so users do not have to confirm them.

For monthly schedules, take the date on which the job runs, add one month, and
clamp invalid dates. Add happy-path tests showing that a rent transaction is
created. Existing CSV fixtures may be regenerated after the migration.
