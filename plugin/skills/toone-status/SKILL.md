---
name: toone-status
description: Report what the person's Toone routines are doing. Use when they ask what is running, what happened in a routine, what is waiting for them, or whether someone or something was already handled.
---

# Toone status

Toone runs repeatable routines on this Mac. Use the `toone` tools; they return short summaries.

1. Start with `toone_overview`. It gives running or paused runs, what is waiting for the person, and the last finished runs.
2. For one run, call `toone_run` with its `runId`. Each step has a one-line result. Quote those results; do not guess beyond them.
3. For "did we already contact X" or "what was posted", call `toone_record_books`, pick the book whose purpose fits, then `toone_handled` with `search`.

Report in plain sentences: what ran, when, what it did, and what needs the person. Lead with anything waiting for them. If a tool says Toone is not reachable, say the app has to be open on this Mac; do not retry in a loop.
