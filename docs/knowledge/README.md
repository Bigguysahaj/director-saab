# Director's knowledge

Reference material for the studio: pictures and cheat sheets, plus a simple
JSON version of each so prompts and the app can use them later. Nothing here
is wired into the app yet; how to use it is still to be planned.

## Layout

```
docs/knowledge/
  data/     one JSON per topic
  images/   the source pictures, named by what they show
    reference/   saved for reading only, no JSON, not used anywhere
```

## JSON shape

Every file is `{ source_image, note, items }` (`camera-basics.json` uses
`groups` instead of `items`, one list each for aperture / shutter_speed / iso).
Each item is:

```json
{ "id": "octabox", "name": "Octabox", "description": "...", "prompt": "..." }
```

- `description` says what it is and when you'd use it.
- `prompt` is a short phrase to drop into an image/video prompt.
- Some files add a few plain fields (`brand`, `use`, `focal_mm`, `sensor`, ...).

## What's here

| File | Source picture | Items |
| --- | --- | --- |
| `data/lighting.json` | `images/lighting-modifiers.jpg` | 13 light modifiers |
| `data/lenses.json` | `images/camera-lenses-by-brand-and-use.jpg` | 25 lenses |
| `data/cameras.json` | `images/camera-bodies-by-brand-and-use.jpg` | 19 camera bodies |
| `data/color-grading.json` | `images/histogram-how-to-read.jpg` | shadows / midtones / highlights and histogram shapes |
| `data/camera-basics.json` | `images/camera-basics-aperture-shutter-iso.jpg` | aperture, shutter speed, ISO |
| `data/camera-moves.json` | `images/camera-moves-cheat-sheet.jpg` | 12 moves |
| `data/camera-angles.json` | `images/camera-angles-20.jpg` | 18 angles (tilt up/down are moves, so left out) |
| `data/rule-of-thirds.json` | `images/rule-of-thirds-placements.jpg` | 6 placements |

Picture only, no JSON yet (see `future.md`): `music-production-cheat-sheet.jpg`,
`storyboard-template-example.jpg`, `film-production-flowchart.jpg`.

## Adding something

1. Save the picture in `images/` with a name that says what it shows
   (`kebab-case.jpg`).
2. Add `data/<topic>.json` in the shape above, or append to an existing file.
3. Add a row to the table above.
4. Mark anything you inferred rather than read off the picture in `note`.
