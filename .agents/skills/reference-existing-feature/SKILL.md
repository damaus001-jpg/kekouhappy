---
name: reference-existing-feature
description: Use when a user asks to copy, adapt, or use an existing feature elsewhere in this repository as a reference, especially when they want to discuss the behavior before implementation.
---

# Reference an existing feature before changing code

When the user points to an existing feature as the model for new work, first establish what that feature actually does. Do not treat “use the same idea” or “like the other page” as authorization to choose unconfirmed details or begin implementation when the user wants to discuss the reference first.

Inspect the complete relevant path, not just the first matching symbol. Follow its data source and mapping, calculations and their reference points, date or locale behavior, rendering and placement, styles and exceptions, event handling, and meaningful tests. Read the surrounding code needed to understand those behaviors. Distinguish observed facts from assumptions; never fill gaps with a plausible guess.

Then report the discovered behavior in concrete terms and restate the proposed feature as a short set of observable requirements. Call out any unresolved choice that would materially affect the result. If the user asked to discuss or confirm the reference before coding, stop before editing and let them correct or approve the requirements. After the user confirms, implement only those requirements and reuse the established data and behavior where practical.

Do not modify the referenced implementation merely to make it reusable unless that refactor is part of the confirmed scope. Do not silently broaden the requested feature to adjacent platforms or workflows.
