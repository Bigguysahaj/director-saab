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

## Music: score and sound for the films

**Origin:** saved a music production cheat sheet
(`docs/knowledge/images/music-production-cheat-sheet.jpg`), about 100 terms
from DAW and MIDI through mixing, mastering and song structure.

**Idea:** think later about how music fits the studio (score for a Short,
mood-matched tracks, AI music generation). Kept as a picture only for now;
too big to turn into JSON yet.

## Storyboard as a scene-planning view

**Origin:** a storyboard page example
(`docs/knowledge/images/storyboard-template-example.jpg`): six panels per
page, each with scene, shot, shot size and aspect ratio, a sketch, and a
one-line action note ("wide shot", "close up", "pan", "overhead").

**Idea:** a storyboard page as a way to design and structure scenes before
blocking them on `/stage`. Each panel could pair a stage snapshot with its
shot size, camera move and note. Idea only; no design yet.

## Film production map

**Origin:** a film production flowchart
(`docs/knowledge/images/film-production-flowchart.jpg`): black boxes on grid
paper, with the stages development, pre-production, production and
post-production, and how each step connects to the next.

**Idea:** a reference for how the studio's own stages (Stage, Audition,
Screen Test) map onto a real production, and where crew roles fit. Pairs
with the end-credits idea above. Reference only for now.
