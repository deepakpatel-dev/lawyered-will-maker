# Incident: AI "Forgets" Answers + 12-Second Response Time

**Scenario:** It's 11 PM. Users are reporting that the AI "forgot" information they gave earlier in the chat, and response times have slowed to 12 seconds.

---

## First 5 minutes: Understand the blast radius

I check the error rate on the interview endpoint (`POST /wills/:id/interview/message`) in our APM tool (e.g., Datadog or CloudWatch). If it's elevated, I set the alert threshold higher to stop noise while I investigate. I look at:

- P50/P95/P99 latency over the last 2 hours — is 12s the median, or just P99?
- Are all users affected, or is it a subset (e.g., users with >20 messages)?
- Did anything deploy in the last 4 hours?

If nothing deployed, this is either a database issue or an Anthropic API issue.

---

## Hypothesis 1: Anthropic API latency

The 12-second response maps directly to the AI call taking longer. Before diagnosing anything else, I check:

1. `https://status.anthropic.com` — if Anthropic is showing degraded performance, this is their incident, not mine.
2. The `extraction` call and the `conversation` call in `InterviewService` both run sequentially. If Anthropic is slow, both add up: 6s + 6s = 12s.

**Mitigation if confirmed:** Add a 10-second timeout on each Claude call. Return a cached "I'm having trouble, give me a moment" response while retrying in the background. The user's message is already saved to DB, so retrying is safe.

---

## Hypothesis 2: The "forgetting" issue — database context not loading

The "forgetting" symptom is more interesting. In `InterviewService.sendMessage()`:

1. We call `willsService.getWillFull(willId)` — this loads the full will from PostgreSQL including beneficiaries, assets, executor, etc.
2. We build `willSummary` from this data and embed it in the system prompt.

If the will summary is empty or stale, the AI doesn't know what was already collected. Two things can cause this:

**Cause A: The extraction call is silently failing.** `extractAndPersist()` wraps the Claude call in try/catch and logs but continues. If the Anthropic extraction call started throwing errors (e.g., rate limit, timeout), we'd swallow the error, skip persisting facts, but still generate a reply. The AI asks questions the user already answered because the summary never got updated.

To check: search logs for `[InterviewService] Extraction failed` — if these started appearing at the time of the incident, this is the cause.

**Fix:** Don't silently swallow extraction errors — surface them as a warning to the frontend. Also add a dead-letter queue: if extraction fails, enqueue a retry job. For now as a hotfix, reduce the extraction timeout and add a retry with exponential backoff.

**Cause B: The `willSummary` JSONB column is not being updated.** `updateWillSummary()` calls `willRepo.update()`. If the PostgreSQL connection pool is exhausted (all connections busy), writes queue up and the old summary is served on the next read.

To check: look at `pg_stat_activity` — how many idle connections? Is the pool size set appropriately? Default TypeORM pool is 10 connections, which is likely too small for concurrent users.

```sql
SELECT count(*), state FROM pg_stat_activity GROUP BY state;
```

**Fix:** Increase TypeORM pool size to 25–50. Add a connection wait timeout so queries fail fast instead of queueing indefinitely.

---

## Hypothesis 3: The context window calculation is working but the data is wrong

Less likely, but worth checking: the `buildContextMessages()` function uses `.slice(-14)` to get the last 14 messages. If there's a bug where messages are retrieved out of order (e.g., the `ORDER BY created_at ASC` was accidentally removed), the AI gets the wrong messages and appears to "forget" recent ones.

To check: query the DB directly for a specific user's chat messages and verify the order matches what the AI should be seeing.

---

## Resolution path

1. **If Anthropic is slow:** Add timeout + retry, communicate to users, wait it out.
2. **If extraction is silently failing:** Fix the error handling, add a retry queue, deploy.
3. **If DB pool exhausted:** Increase pool size, add a metrics alert for connection queue depth.

In parallel: post an internal status update every 20 minutes. Don't wait until you have a fix to communicate.

---

## Post-incident

After resolution, I would:

- Add a specific metric for extraction failure rate (separate from the overall error rate).
- Add a p95 latency alert for the interview endpoint at >5s — this incident took too long to detect.
- Add a test that runs a full multi-turn interview with a mocked Claude client and asserts that each turn's `willSummary` reflects what was said — this regression would have caught Cause A earlier.
- Write a post-mortem: what failed, what the timeline was, and what the three follow-up actions are.
