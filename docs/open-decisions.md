# Open decisions

These choices should be answered with evidence from the first experiments rather than settled in the abstract.

1. Which authorship improvements can be scored deterministically, and which require a rubric evaluator shared fairly across evaluation variants?
2. What is the minimum useful repetition count for detecting model variance without wasting spend?
3. How should congruency distinguish required behavior from legitimate implementation freedom?
4. Which descriptive findings are repeatable enough to become author-facing diagnostics, and which must remain explicitly evaluator-dependent?
5. When should the orchestration layer graduate from one-off Think submissions to a Workflow-owned evaluation matrix?
6. Which tools, if any, can safely be enabled for hostile-input runs?
7. What retention, redaction, and jurisdiction controls are needed before accepting private customer material?
8. Which Cloudflare Access identity and per-run authorization model should replace the single service token for hosted, multi-tenant use?
9. Which protocol-default materiality classifications generalize across package kinds, and when should author declarations or evaluator judgment override them?
10. How accurately can independent evaluators reconstruct decision provenance from package evidence, observable traces, and final diffs without hidden reasoning?
11. Which adaptation challenges provide useful flexibility evidence without rewarding unnecessary abstraction or creating excessive evaluation cost?
