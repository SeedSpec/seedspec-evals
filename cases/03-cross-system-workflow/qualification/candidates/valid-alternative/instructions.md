# Configured stale-VIP escalation

Use an approved existing automation capability with HubSpot, Slack, and Jira
connections referenced by secret identifier. Keep no separately operated
application or store.

Map VIP qualification, qualifying replies, the support business calendar,
threshold, destinations, and minimum disclosed fields through configuration.
Derive a stable escalation-episode key from the ticket and qualifying-reply
epoch. One episode produces at most one Slack alert and one Jira issue; partial
failure is replayable without duplicating the successful action.

Actions contain only ticket identifiers, owner, priority, age, VIP basis, and a
link. Replay fixtures cover duplicate events, paused business time, reply reset,
partial failure, and prohibited transcript or credential disclosure.
