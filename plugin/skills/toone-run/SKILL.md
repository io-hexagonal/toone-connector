---
name: toone-run
description: Start, pause, continue or cancel a Toone routine, or answer one that is waiting for input. Use when the person asks to run a routine now or to change a run.
---

# Run or change a Toone routine

1. Find the routine with `toone_routines` (pass words from what the person said). If more than one matches, ask which.
2. Call `toone_start` with the routine id. Toone's routines can send or publish as the person, so the connector shows them a confirmation. If they decline, or the client cannot show the prompt, stop and say nothing was done. Never look for another way to start it.
3. After a start, call `toone_overview` once to report the state. Runs take minutes; do not poll in a loop. Offer to check again later.
4. `toone_control` pauses, continues or cancels a run by `runId`. `toone_answer` gives a waiting run its inputs; take the `executionId` from `toone_waiting`.

Say plainly what you asked Toone to do and what it answered.
