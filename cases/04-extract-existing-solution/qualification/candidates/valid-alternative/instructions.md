# Provider-neutral release readiness

Represent a release and its owned checks through work-tracking, identity,
notification, business-calendar, and audit capabilities. Required checks block
approval until Ready. Only an authorized release manager may approve Go, and a
material required-check change returns the release to Review while retaining
the prior approval event.

For the assigned realization, use a GitHub Project item with linked or
structured check items and a Teams workflow for summaries. Preserve actor and
timestamp history natively. Configuration supplies check roles, calendar,
reminder timing, destinations, and provider mappings. No Airtable or Slack
schema, identifier, shim, or credential belongs in the realization.
