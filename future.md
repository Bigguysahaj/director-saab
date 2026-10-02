# Future ideas

Loose ideas parked for later. Nothing here is committed work.

## Mine movie end credits for how films actually get made

**Origin:** noticed while watching the end credits of *Drishyam 3* — the
sheer length of the roll, and how many roles I'd never thought about.

**Idea:** sit down with the end credits of a few films (start with Drishyam 3)
and read them as a data source on what a production really takes:

- **Team sizes** — how many people per department (direction, camera,
  art, costume, sound, VFX, post, production, unit, etc.) and in total.
- **Manpower for a "regular" movie** — what a typical film needs, and how
  that scales between a small drama, a thriller like Drishyam, and a big
  VFX-heavy production.
- **Sets, ideas and craft roles** — set dressing, props, locations, stunt,
  continuity, and the other behind-the-scenes jobs that don't get talked about.
- **Surprising modern roles** — e.g. junior data wranglers / data engineers
  on set or in post (DIT, media management, pipeline). This is what caught my
  eye, though I don't remember exactly which titles. Re-find it and note down
  the other unexpected ones too.

**How:** get the credits as text (pause/screenshot frames, or find a
transcript/IMDb full-credits page), then have an AI pass over it to:

1. Parse every credit into `{role, department, person}`.
2. Group and count by department and role; flag unusual or unfamiliar titles.
3. Summarise what each unfamiliar role does and why it exists.
4. Compare across films once there's more than one.

**Why it might matter for this project:** gives a grounded picture of the
roles and team structure a film needs — useful reference for the studio/stage
tool (who a director coordinates with, what a set involves) and for any
"crew" or production-planning features later.

**Open questions:**
- Which films to include besides Drishyam 3?
- Credits are inconsistent in naming across industries — normalise roles by
  hand or let the AI do it?
- Copyright: keep to role/department counts and notes, not reproducing
  the credit roll itself.
