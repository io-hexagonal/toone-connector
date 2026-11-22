---
name: toone-run
description: Start, pause, continue or cancel a Toone routine, answer one that is waiting for input, decide on a failed step, or install a routine from Toone Explore. Use when the person asks to run a routine now, to change a run, or to add a shared routine.
---

# Run or change a Toone routine

1. Find the routine with `toone_routines` (pass words from what the person said). If more than one matches, ask which.
2. Call `toone_start` with the routine id. Toone's routines can send or publish as the person, so the connector shows them a confirmation. If they decline, or the client cannot show the prompt, stop and say nothing was done. Never look for another way to start it.
3. After a start, call `toone_overview` once to report the state. Runs take minutes; do not poll in a loop. Offer to check again later.
4. `toone_control` pauses, continues or cancels a run by `runId`. `toone_answer` gives a waiting run its inputs; take the `executionId` from `toone_waiting`.
5. A failed step held for the person shows in `toone_waiting` with `choices`. Say why it failed, then let the person pick: retry (`toone_control` continue runs it again unchanged), fix (done in Toone, from the failure card on the run) or stop (`toone_control` cancel). Do not pick for them.
6. To add a shared routine or bundle, search with `toone_explore`, show the person the match, then call `toone_install` with its id. It asks them first and opens the listing in Toone; tell them to press "Use this routine" (or "Use this bundle") there to finish with Toone's setup. Installs go into the project open in Toone.

Say plainly what you asked Toone to do and what it answered.
