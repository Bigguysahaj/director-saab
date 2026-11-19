# Director: launch plan

Written 2026-11-16. Status: draft for the owner to decide on. Nothing here is committed work until its decision is answered and an issue exists.

How to use this file: answer the decisions in section 6 (edit the "Answer" column). Each issue in section 7 names the decisions it waits on. An agent may open an issue only when all of its decisions are answered.

## 1. What we are launching, and why

Two goals, and they pull in the same direction:

1. **A product 5–10 invited people can use**, then a slow rollout.
2. **A showcase** for companies with a high bar (ElevenLabs is the named example). A reviewer should see a live product, real evals, an agent that does something useful, and their own API used well.

It can be a hobby project. It must not look unfinished: every page that is public works, and anything unfinished is not linked.

## 2. Where Director stands in the market

Checked by web search on 2026-11-16. Most comparison pages are written by the vendors themselves, so prices and rankings below are rough. Re-check before quoting them publicly.

| Tool | What it does | Where it is strong | Gap Director can use |
|---|---|---|---|
| Intangible | Browser 3D scene, place a camera, render with a chosen model. About $35/month entry (unverified). | Closest competitor. Funded, ex-Pixar/Apple team. Full 3D scene data. | World and camera first. No sign of posed-figure blocking, a take log, or any measure of whether the model followed the blocking. |
| Higgsfield | 70+ camera presets, many models, Blender plugin, "SOUL ID" character lock. | Camera moves, character lock, UGC ad templates. | Presets, not your own blocking. Real 3D needs Blender. |
| LTX Studio | Script to scenes to storyboard, reusable characters. | Whole-film pipeline. | Camera control is prompt and keyframe based, not 3D. |
| Runway, Google Flow | Model front ends. | Model quality, free tiers. | No blocking layer. |
| Arcads, HeyGen, Creatify | UGC ads from avatars. Arcads about $11 per finished video. | Fast ad variants. | Stock actors and stock framing. No directing. |

**What Director already has that the others do not show:**

- **Posed-figure blocking.** Mannequins with 14 joints, a pose library, pose keyframes, a camera you fly, and a recorded proxy take sent to the model as a video reference with cast sheets.
- **Evals that measure the result.** `evals/` scores whether the output kept the blocking (positions, spacing, mirroring, missing people) and the cast's identity, against keypoints exported from the stage. They run in CI.
- **A take log.** Every take is kept as (stage spec, proxy clip, output, kept or not). That is training and eval data nobody else is collecting for their users.
- **Model-agnostic, at provider cost.** OpenRouter and ModelArk, with a live catalog.

**Honest weak points:** 3D blocking alone is not unique (Intangible does it with more money). The stage looks like a prototype. There is no audio story yet beyond the open ElevenLabs issues.

### The pitch (recommendation, see D1)

> **Direct it like a director. The model takes your direction as fact. The take comes back with proof.**
> Say or place what you want: the lens, the pose, where she stands, how far the voice is, which look, which brand rules. All of it travels with the take as one direction sheet, goes to the model as hard instructions, and is what the take is scored against.

The owner's ideas (2026-11-16) are not separate features. They are all entries on one object, the **direction sheet**:

| Idea | What it adds to the direction sheet | Status |
|---|---|---|
| Collected cameras, lenses, pose libraries, shot library | Named choices from real set vocabulary, not free text | Pose library and camera moves exist. Lens and shot libraries are not built. |
| Direct by voice or quick typing ("turn to her, chin down") | The fast way to fill the sheet. A small, fast model turns a spoken note into a pose or camera change on the stage. | Not built. ENG-004 (rig from plain language) is the first step. |
| Direction notes kept beside the take | The sheet itself, saved with the take and shown next to it in Dailies | The take log already saves the stage spec. Notes are not saved or shown. |
| Notes used in the prompt "as truth" | A switch per note: describe it loosely, or state it as a fixed fact the model must keep | Screen Test already writes prompts this way ("non-negotiable physical match"). Not yet driven by notes. |
| Voice distance from the camera | The stage already knows how far the speaker is, so the voice line is delivered to match | ENG-040 open. |
| One actor, many looks (future.md) | Identity stays locked, the look is a named variation | ENG-035 open. |
| Ad agency: brand identity | The same lock, one level up: a brand kit (product, colours, logo, tone, do-nots) that every take must respect | Not built. Same engine as cast identity. |

Why this is the pitch:

- **One idea explains everything.** A competitor has prompts and presets. Director has a direction sheet: built by voice, visible on the take, sent as fact, and scored. Each new library (lenses, shots, looks, brands) is just more rows on it.
- **The score closes the loop.** No competitor found shows the user whether the model followed the direction. Director can, because the sheet says exactly what was asked for.
- **It is the showcase in one screen.** Voice in (speech to a tool-calling agent), evals out (the score), and ElevenLabs on both ends: hearing the director and speaking the line at the right distance.
- **The data is the moat.** Every take is stored as (direction sheet, proxy clip, output, kept or not). That is the dataset for a later model that follows direction better.

Build order that keeps this honest: the sheet first (save and show what is already known about a take), then the score, then voice. Voice without the sheet is a demo; the sheet without voice is still a product.

Two user groups fit the same engine (see D2): UGC creators (one actor, many looks, product in hand) and small ad teams (brand kit locked across every take). The ad-agency version is the stronger business; the UGC version is the smaller first step.

Unverified lead worth an hour: Seedance 2.5 is reported to accept "white-model" blockout references directly. If true, Director's mannequin takes are the ideal input and this should be in the pitch. Test it before claiming it.

## 3. What a high-bar reviewer will look for

From ElevenLabs job posts (third-party copies, so indicative only): evaluation and monitoring frameworks, agents and workflow orchestration, Python plus TypeScript/React, "artifacts such as past projects", and "everything we do should match the quality of our models".

| They look for | What Director shows today | What is missing |
|---|---|---|
| A product that works end to end | Stage to take to Dailies works locally | A public URL, a 90-second demo video, an empty-state and error-state pass |
| Evals | Python evals over golden fixtures, in CI | Evals on live takes, a public eval report, a short write-up of what they caught |
| Agents | Nothing yet | One real agent: typed, then spoken, direction that changes the stage through tool calls (grows out of ENG-004), with its own eval set |
| Their API used well | PR #76 open (voice line) | ENG-039, ENG-040, ENG-045–047 finished to the same standard as the rest |
| Engineering judgement | Issue-first workflow, tests before code, small PRs | An architecture page, a decision log (this file), cost and error tracking |
| Safety | None | Auth, spend caps, a likeness and consent policy, delete-my-data |

## 4. The multi-user gap

Found in the 2026-11-16 audit. Today the app is a single-user local tool:

1. **No auth.** Anyone who can reach the server can spend the provider keys and delete projects.
2. **One active project for the whole server.** One person switching projects switches everyone.
3. **One shared data folder.** Cast, takes and screen tests are not owned by anyone. Screen test history is not even per project.
4. **Unlocked JSON files.** `roster.json`, `history.json` and `projects.json` are read, changed and written back. Two requests at once lose one change. Take numbers can collide.
5. **Media is public by URL** and is only removed when a project is deleted (ENG-051).
6. **Finished videos are held whole in memory** while being saved.
7. **No record of who spent what.**

The good news: every store hangs off `dataRoot()` and `projectDir()`. Giving each user their own root folder fixes 2 and 3 with a small change, and one server process means an in-process lock fixes 4. No database is needed for 5–10 users.

## 5. Phases and gates

Each phase ends at a gate. Do not start the next phase until the gate is met.

### Phase 0: clean base (in progress)
- ENG-049, ENG-050, ENG-051 merged (PRs #107, #108, #109).
- **Gate:** `npm run check` and `npm run test:e2e` green on main.

### Phase 1: deployed for the owner only
- One VM with a persistent volume, R2 for media (the ENG-042 recommendation: Fly.io, about $7/month).
- One shared password in front of everything. Provider-side spend limits set on every key.
- Volume snapshots on. Error tracking on.
- **Gate:** the owner makes one full take on the public URL from a phone and a laptop, and restores the data folder from a backup once.

### Phase 2: 5–10 invited users
- Invite-only login. Each user gets their own data root and their own active project.
- A daily spend cap per user, enforced on the server before any paid call.
- In-process locks around the JSON files.
- Likeness policy and consent tick-box on cast upload. "Delete my data" works.
- Direction sheet saved and shown with each take (L14), and the fidelity score on each take (L8). Together they are the pitch.
- Feedback link on every page. A short onboarding: one sample project with a ready stage.
- **Gate:** 5 users each finish a take without help. No cross-user data seen in a test with two accounts. One week with no lost update and no spend over a cap.

### Phase 3: slow rollout (25, then 100)
- Waitlist with invite codes, released in batches.
- Move JSON files to SQLite on the same VM when lock waits or file sizes show it is needed, not before.
- Payment (see D4). Status page. Abuse reporting.
- Public eval report and the write-up.
- **Gate per batch:** error rate, cost per user and support load from the previous batch are within limits the owner sets at the Phase 2 gate.

## 6. Decisions for the owner

| # | Decision | Options | Recommendation | Answer |
|---|---|---|---|---|
| D1 | The pitch | (a) "Direct it like a director, the model takes it as fact, the take comes back with proof" (the direction sheet) (b) UGC: one actor, many looks and voices (c) general AI video studio | (a). It ties every idea into one object and no competitor shows the proof. (b) is the first use case inside it. | |
| D2 | First 5–10 users | (a) UGC creators (b) small ad teams with a brand to protect (c) indie filmmakers and previs people (d) engineers and recruiters | (a) first, since looks and cast are nearly built; (b) once the brand kit exists. Not (d): reviewers are convinced by real users. | |
| D3 | Host | Fly.io VM + volume + R2 / Hetzner / Vercel + database | Fly.io, as ENG-042 says. Works with no store rewrite. | |
| D4 | Who pays for generation | (a) owner's keys with a per-user daily cap (b) bring your own keys (ENG-043) (c) paid credits | (a) for Phase 2. At about $0.65 per 5 s take, 10 users at a $3/day cap is at most $30/day. (b) as the escape hatch. (c) only in Phase 3. | |
| D5 | Login | (a) Better Auth, self-hosted, SQLite file (b) Clerk, managed (c) magic link built by hand | (a). Data stays on the VM, no third party, invite-only is a small table. Auth.js is reported to be in maintenance mode. | |
| D6 | Spend cap numbers | Per-user daily cap, and a global monthly cap | $3 per user per day, $150 per month overall, both as env vars. | |
| D7 | Real people's faces | (a) allow with a consent tick-box and delete-on-request (b) only the uploader's own face (c) no real people | (a), plus a visible policy page. This is the biggest non-technical risk. | |
| D8 | Domain | Which domain or subdomain | Owner's call. Needed before Phase 1. | |
| D9 | Existing local data | Copy `.data/` up, or start fresh | Start fresh on the server. Keep local data local. | |
| D10 | The agent to showcase | (a) voice or typed direction that changes the stage through tool calls (grows out of ENG-004) (b) a "director's assistant" that reads the score and proposes the retry (c) both | (a) first: it is the thing people will remember from the demo. (b) once the score ships. | |
| D11 | What is public without login | (a) landing page + demo video + eval report (b) plus a read-only sample project | (b). A reviewer should be able to touch the stage without an invite. | |
| D13 | How spoken direction is heard and understood | (a) ElevenLabs speech-to-text, then a small fast model with tool calls (b) one speech-in model end to end (c) typed only for now | (a). It uses their product on the input side too, and each half can be tested alone. Start with (c) to prove the tool calls. | |
| D14 | Are direction notes sent to the model by default | (a) always as fixed facts (b) per note: loose or fixed (c) never, notes are only a record | (b). Fixed facts cost prompt space and can fight each other; the director chooses. | |
| D15 | When to build the brand kit | (a) before the first invites (b) after the first 5–10 users (c) Phase 3 | (b). It reuses the cast identity lock, but the first users should tell us what a brand needs. | |
| D12 | Phase 3 batch limits | Error rate, cost per user, support hours that pause the rollout | Set at the Phase 2 gate, from real numbers. | |

## 7. Issues to open, in order

L1–L13 are placeholders, not ticket numbers: ENG-052 to ENG-069 were taken by the audit on 2026-11-16. Each gets the next free ENG number when it is opened.

| Issue | What | Waits on |
|---|---|---|
| L1 | Deploy to one VM with a volume, R2 and a shared password | D3, D8, D9 |
| L2 | Provider spend limits, error tracking, volume backups and a restore drill | D3 |
| L3 | Invite-only login | D5 |
| L4 | Per-user data root and per-user active project | L3 |
| ENG-066 (open, #103) | JSON stores can lose concurrent updates | none |
| L6 | Per-user daily spend cap and a spend ledger | D4, D6, L3 |
| L7 | Consent on cast upload, policy page, delete my data | D7, L4 |
| L8 | Fidelity score on every take, shown in Dailies | D1 |
| L9 | Sample project, onboarding and feedback link | D2, D11 |
| L10 | Landing page, demo video, architecture page | D1, D8 |
| L11 | Public eval report from CI, and the write-up | L8 |
| L12 | The showcase agent, with its eval set | D10 |
| L13 | Waitlist and invite batches | D12 |
| L14 | Direction sheet: save the notes, camera, lens, poses and look with each take and show them beside it in Dailies | D1 |
| L15 | Send direction notes to the model, loose or fixed per note | D14, L14 |
| L16 | Lens and shot libraries on the stage | D1 |
| L17 | Typed direction changes the stage through tool calls, with an eval set | D10 |
| L18 | Spoken direction on top of L17 | D13, L17 |
| L19 | Brand kit as a locked identity for every take | D15 |

Already open and part of this: ENG-066 (lost updates), ENG-061 (screen test history per project), ENG-056 (stage layout per project), ENG-054 (serve saved take videos), ENG-062 (cast errors all 404), ENG-042 (host), ENG-043 (bring your own keys), ENG-027 (storage page), ENG-039/040/045–047 (ElevenLabs sound), ENG-004 (rig from plain language).

## 8. Risks

- **Cost.** One curious visitor can out-spend a month of hosting. Nothing paid goes public before L6.
- **Likeness and abuse.** Users upload photos of real people. Policy, consent and deletion come before the first invite.
- **Provider drift.** Catalogs, prices and region blocks change (Muse Image is blocked from India). The live catalog helps; the fallback lists go stale (ENG-041).
- **One VM.** No failover. Acceptable for Phase 2; backups and the restore drill are the mitigation.
- **Scope.** The stage, sound room and agent work can each eat a month. The gates exist so launch does not wait for all three.

## 9. Sources

- https://higgsfield.ai/blog/ai-previsualization-tools
- https://www.intangible.ai/blog/blender-higgsfield-vs-intangible
- https://www.intangible.ai/faq
- https://aisotools.com/pricing/intangible
- https://budgetpixel.com/learn/best-ai-previs-tools
- https://www.toolworthy.ai/blog/ltx-studio-alternatives
- https://aicameracontrol.com/
- https://www.atlabs.ai/blog/atlabs-ai-vs.-heygen-vs.-creatify-vs.-arcads-vs.-viralinn-which-ai-ugc-tool-is-actually-worth-paying-for-in-2026
- https://higgsfield.ai/blog/best-ai-ad-generators-2026
- https://dreamina.capcut.com/seedance/how-to-use-seedance-2-5-with-maya
- https://www.kapwing.com/resources/how-to-use-seedance-2-0-a-guide-for-ai-video-creators/
- https://www.workingnomads.com/jobs/engineering-internal-ai-transformation-elevenlabs-1837923
- https://elevenlabs.io/careers/d16a7ad6-ffbd-4655-8716-4872263f99ce/developer-experience-engineer
- https://startup.jobs/research-engineer-elevenlabs-8139949
- https://makerkit.dev/blog/tutorials/better-auth-vs-clerk
- ENG-042 (issue #78) for host prices and limits
