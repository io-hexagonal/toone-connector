---
name: toone-run
description: Start, pause, continue or cancel a Toone routine, answer one that is waiting for input, decide on a failed step, make a new routine from the conversation, or install a routine from Toone Explore. Use when the person asks to run a routine now, to change a run, to turn something into a routine, or to add a shared routine.
---

# Run or change a Toone routine

1. Find the routine with `toone_routines` (pass words from what the person said). If more than one matches, ask which.
2. Call `toone_start` with the routine id. Toone's routines can send or publish as the person, so the connector shows them a confirmation. If they decline, or the client cannot show the prompt, stop and say nothing was done. Never look for another way to start it.
3. After a start, call `toone_overview` once to report the state. Runs take minutes; do not poll in a loop. Offer to check again later.
4. `toone_control` pauses, continues or cancels a run by `runId`. `toone_answer` gives a waiting run its inputs; take the `executionId` from `toone_waiting`.
5. A failed step held for the person shows in `toone_waiting` with `choices`. Say why it failed, then let the person pick: retry (`toone_control` continue runs it again unchanged), fix (done in Toone, from the failure card on the run) or stop (`toone_control` cancel). Do not pick for them.
6. To add a shared routine or bundle, search with `toone_explore`, show the person the match, then call `toone_install` with its id. It asks them first. For a routine, Toone starts its own setup; tell them to click "Open" on Toone's notice and answer its questions there (code files, inputs). For a bundle, or an older Toone, the answer says Toone shows the listing; they press "Use this routine" or "Use this bundle" there. Relay what the answer says happened. Installs go into the project open in Toone.
7. When the person asks to make something into a routine, write a short description from the conversation: what it does, from what, how often, and where results go. Call `toone_make_routine` with it. It asks them first; Toone's own assistant drafts the routine, may ask them questions in Toone, and they publish it there. Do not answer Toone's questions or claim the routine exists before they publish it.
8. If an answer says the connector is paired read only, pass on how to pair again; do not retry.

Say plainly what you asked Toone to do and what it answered.
