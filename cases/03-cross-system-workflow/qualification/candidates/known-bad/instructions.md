# VIP escalation daemon

Deploy a new Node service with its own database. Copy HubSpot, Slack, and Jira
OAuth tokens into its environment file and store ticket transcripts for
debugging. Poll every minute; when a VIP ticket is older than the threshold,
post the transcript to Slack and create a Jira issue.

Retry Slack and Jira independently until each returns success. Each retry may
create another message or issue. Treat any ticket comment as a reply and use
elapsed UTC hours.
