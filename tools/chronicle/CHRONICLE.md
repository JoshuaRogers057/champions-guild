# The Chronicle: instructions for the lore routines

Two Claude Code cloud routines keep the lore site's story pages current. They read this file first.

- **Daily question run** (06:00 Pacific): looks at quests that are ready and posts questions to the
  Lore Desk on the main site.
- **Friday writing run** (18:00 Pacific): writes the answered quests into the lore site and pushes to
  `v4`, so everything is live for Send It Saturday.

The routine's prompt gives you the API base URL and the key. Every call sends
`Authorization: Bearer <key>` and `Content-Type: application/json`. Dates from the API are UTC even
when they have no `Z`.

## Hard rules

1. **The DM's public summary is the source of truth.** Player reports add color and quotes. They never
   set facts like who died or where someone went. If they disagree with the summary, ask; don't choose.
2. **Never put out-of-game words in lore text.** That means XP, DM, rolls, dice, rewards, gold amounts,
   levels, ranks or "the server". Never use account names: the API never sends them, so never invent
   any. Character names are fine.
3. **Never write about anything the API didn't give you.** Hidden threads (`isHidden: true`) never
   appear in any text, link or digest. The page script removes their pages.
4. **Never edit hand-written text.** On NPC, faction and place pages, only the marked
   `Guild Archive record` section changes, and the script does that. Never edit files outside
   `content/3. History & Lore/The Chronicle/` yourself. Everything goes through
   `tools/chronicle/chronicle.mjs`.
5. **Ask, don't guess.** Only the lore master's answers on the Lore Desk become canon. A thread's
   `canonNotes` already hold earlier answers, so never ask the same thing twice.
6. **If publishing is paused** (`GET status` → `publishingPaused: true`), the Friday run writes and
   pushes nothing. The daily run still asks questions.

## Standing rulings

The head of the Guild settled these while the campaign's history was written in (October 2026). Don't
ask about them again.

- **The Last Howl** builds a new dungeon each time someone goes through its portal, and the dungeon vanishes
  once it's cleared. Last Howl runs are standalone: never link one to a thread.
- **Fragments** are a magical stone found across Eryndor. They turn up in many quests but never connect
  them, so never link quests or threads because they share fragments.
- **Spellings:** Mr. Cuttles, Duskwatch, Talvereth, Thalenmark, Kalamathet, Vathros, Smyles (Digdug's wife;
  the gang is the Smiles Gang), Calderis, Serrixa, Elkhara, Shedinn, Nesser.
- **Conflicting records:** the DM's summary beats a report, and a later summary beats an earlier one.
- **Guild-only knowledge** (something the Guild knows but the world doesn't) may appear in public text when
  it's framed that way, for example "Known only within the Guild: …". Thread `secretNotes` never appear at all.

## Stories left to rest

The head of the Guild chose to leave these in the past. They have no thread and get none. Never propose a
`NewThread`, `ThreadPick`, `Revival` or `Page` for them, and leave them out of digests. If a DM deliberately
links a new quest to one (it then shows up in `GET threads`), follow the site.

| Story | You'll recognise it by |
|---|---|
| The Death Cult and the Fallen Celestial | The Echoes in the Sand pyramid, the corrupted celestial, the murder of Sune's High Priestess |
| Trouble on the Ciliren Docks | Tivon and Alfie's shipyard, Drekle and the Bronze Talons, Captain Brunsprout |
| The Temples of Mystra | Rinku winning back the Weave, Alaric's order to Mystra, Ecli the Librarian |
| The White Eye | The Savage Waters series, the merfolk, Osmund Pike |
| The Blue Drug | The Mamalii bakery and its blue hallucinogen |
| The Ashen Antler Fog | The fog in northern Drakmir, the worg siblings, the cursed doll |
| The Erased | The memory-wiping order, Diax's taint |
| The Asylum Reclamation | The asylum cleared floor by floor, now a plague hospital |
| Boddle and Wimbleton | The construct Wimbleton and his captive maker Boddle |
| Nephele's Feywild Bargain | The Seelie wedding, the Feywild gate at Morfaren |
| Murcon's Stolen Name | Thalion Starbough |
| The Broken Bargain | The forged treaty from Sylvandar's archives, the Nightbloom |
| The Mists of Barovia | The Curse of Strahd run: another plane, not part of Eryndor's chronicle |
| The Fragments | Not a story at all (see Standing rulings) |

## The voice: the Guild archivist

The archive is kept by a recently retired member of the Champions Guild, who now reads the members'
reports and records the Guild's deeds. Their identity is never revealed or hinted at: no "I", no
memories of their own adventures, no name.

- They know the Guild's ways and record what the Guild did. World events come in through what Guild
  members saw and did.
- Typical openings: "The Guild Archive records that…", "Members of the Guild report…".
- Tone: measured, a little dry, never breathless. Short sentences, concrete detail. No modern slang
  and no game mechanics.
- **Use the voice for**: the digest, "Where it stands", "Latest development", closing paragraphs, and
  timeline entries.
- **Keep plain**: badges, lists and page records. The script writes those.

A timeline entry is 2 to 4 sentences about what happened in that one quest, for example:

> The Guild Archive records that a company of five recovered the Gilded Wake's cargo from the reefs,
> only to be ambushed by the warlord Vorlag. He was driven off badly wounded and fled toward the Ashen
> Wastes.

## The daily question run

1. `POST runs` `{"kind":"daily"}`, and keep the `runId`.
2. `GET threads`: every thread (with `canonNotes`, NPC, faction and place lists, and its quests) plus
   the open hooks.
3. `GET ready`: quests waiting for your questions. Each has:
   - the public summary
   - the roster, as `{name, characterId}`
   - the published reports, with rating score
   - the DM's pick (`dmPick`)
   - the questions the site already asked (`questions`). Don't repeat those.
4. Also read:
   - the vault pages for names the summary mentions (search `content/`)
   - the old hand-written page
     `content/3. History & Lore/Current Stories (Summer 2026, manual).md`, for old entries this quest
     continues
5. For each ready quest, decide what to ask. Post with
   `POST batches/{questLogId}/questions` and a JSON array (empty `[]` means "nothing to ask"). Each
   item is `{kind, priority, prompt, suggestion, payload, defaultAccept, threadId}`.

   | kind | when | priority | payload | defaultAccept |
   |---|---|---|---|---|
   | `Contradiction` | the summary disagrees with a thread, its canon notes or a page; or an earlier timeline entry was wrong | `MustAnswer` | `{"questLogId": <earlier entry's quest, if correcting one>}` | false |
   | `Spoiler` | the summary seems to reveal something players shouldn't know yet | `MustAnswer` | `{}`; suggestion = a safer wording of the summary | false |
   | `Revival` | a dormant thread moves again (only if the site didn't already ask) | `MustAnswer` | `{"threadId": n}` | true |
   | `ThreadPick` | the quest clearly belongs to a thread but the DM didn't pick it (only if the site didn't already ask) | `NiceToKnow` | `{"threadId": n}` | false |
   | `NewThread` | a new ongoing story has clearly started, or the quest continues an entry on the old hand-written page | `NiceToKnow` | `{"name", "pitch", "scale"}` | false |
   | `NewHook` | a loose end worth keeping: someone got away, a debt owed | `NiceToKnow` | `{"title", "details", "scale"}` | true |
   | `Scale` | a thread has clearly grown (Personal → Faction → City → Nation → World) | `NiceToKnow` | `{"threadId", "scale"}` | false |
   | `Resolution` | a thread's story looks finished | `NiceToKnow` | `{"threadId", "closing"}`, where closing is the closing paragraph in the archivist's voice | false |
   | `Page` | an NPC, faction or place needs a page or an update. A new page only if the name appears in 2+ quests, or is a key figure in a thread | `NiceToKnow` | see below | true (pages go live unless unticked) |

   - Write `prompt` as a plain question to the lore master, for example "This summary says Vorlag
     died, but the thread says he fled in May. Which is true?"
   - `suggestion` is your best answer.
   - Set `threadId` whenever the question is about a thread, so the answer becomes a canon note there.
   - A **`Page` payload** is
     `{"kind":"npc|faction|place","name","action":"create|update","folder","body","record":{"status","threads":[],"appearances":[{"questLogId","title","date"}]}}`.
     - `body` is only for `create`, and follows the format of the existing pages around it (the infobox
       table, then prose).
     - `folder` is an existing folder under `content/`, matching where similar pages live.
     - `suggestion` is a one-line preview for the lore master, for example "New NPC: Sister Marra, a
       healer at the Spens shrine who sheltered the party; appears in 2 quests" or "Update Vorlag:
       wounded, last seen in the Ashen Wastes".
     - Catch spelling clashes: if "Talverith" in the summary is probably "Talvereth" in the vault,
       that's a `Contradiction`, not a new page.
6. `POST runs/{runId}/finish` `{"succeeded": true, "summary": "<n> quests, <m> questions"}`. On any
   failure, post `succeeded: false` with the error.

## The Friday writing run

1. `POST runs` `{"kind":"friday"}`. Then `GET status`: if `publishingPaused`, finish the run with
   summary "paused" and stop.
2. `POST defaults`: unanswered nice-to-know questions take their default.
3. `GET publishable` (the answered quests, with each question's `status` and `answer`) and
   `GET threads`.
4. **Read the answers.** For each question:
   - `Accepted` or `Defaulted`: the `suggestion` stands.
   - `Corrected`: the `answer` replaces it. On a `Page`, the answer is the edited text.
   - `Skipped`: ignore it. A skipped `Page` is not published.

   The site has already acted on the mechanical ones: thread links, new threads, hooks, scale and
   resolutions are in `GET threads`.
5. **Write the prose** as one JSON file, `/tmp/chronicle-input.json`:

   ```json
   {
     "weekOf": "YYYY-MM-DD (this Saturday, Pacific)",
     "siteBaseUrl": "https://championsguildrpg.com",
     "threads": [ ...exactly the "threads" array from GET threads... ],
     "prose": {
       "threads": [ { "id": 1, "whereItStands": "...", "latestDevelopment": "...", "closingParagraph": "(resolved threads only)",
                      "timeline": [ { "questLogId": 684, "date": "YYYY-MM-DD", "title": "quest name",
                                      "text": "2-4 sentences", "members": [ {"name": "...", "characterId": 12} ],
                                      "quote": { "text": "...", "by": "character name" } } ],
                      "timelineCorrections": [ { "questLogId": 650, "text": "corrected entry" } ] } ],
       "digest": { "headline": "...", "stateOfTheWorld": "two sentences",
                   "majorDevelopments": [ { "text": "...", "threadId": 1, "questLogId": 684 } ],
                   "escalations": [ ... ], "stirring": [ ... ], "newThreads": [ ... ],
                   "featured": [ { "quote": "...", "by": "character name", "questLogId": 684 } ] },
       "pages": [ ...the "payload" of each Page question that will be published, with corrections applied... ]
     }
   }
   ```

   - **Timeline:** one entry per publishable quest, in the thread the quest now belongs to (the
     thread's `quests` list in `GET threads`). Standalone quests get no entry, but they can appear in
     the digest.
   - **Members:** the quest's roster.
   - **Quote:** optional. At most 25 words from that quest's best-rated report, attributed to the
     character.
   - **`whereItStands`:** one paragraph, rewritten for every thread that moved.
   - **`latestDevelopment`:** one sentence about the newest entry.
   - **`timelineCorrections`:** comes from answered `Contradiction` questions whose payload names an
     earlier `questLogId`.
   - **Digest:** 3 to 6 major developments.
     - Escalations come from accepted `Scale` questions.
     - "Threads stirring" comes from `Revival` questions.
     - New threads are threads created this week.
     - Featured dispatches are 1 or 2 quotes from the week's top-rated reports (by `score`).
   - **Hidden threads** never appear anywhere.
6. Run `node tools/chronicle/chronicle.mjs build /tmp/chronicle-input.json`. It prints a report. Its
   `errors` (for example a thread named the same as an NPC page) skip only that page, so note them in
   the run summary and carry on.
7. For each thread you wrote, `PUT threads/{id}` with `{"whereItStands": "..."}`, so the site and the
   Story Board match the lore site.
8. Commit and push: `git add -A content && git commit -m "Chronicle: week of <weekOf>" && git push origin HEAD:v4`.
9. For each quest you published, `POST batches/{batchId}/published`.
10. `POST announcements` with:
    - `title`: "This Week in Eryndor"
    - `body`: two sentences in the archivist's voice
    - `ctaLabel`: "Read this week's digest"
    - `ctaUrl`: `https://lore.championsguildrpg.com/3.-History--and--Lore/The-Chronicle/This-Week-in-Eryndor-(latest)`
    (Quartz turns " & " into `--and--`.)
    - `publishAtUtc`: Saturday 09:00 Pacific
    - `expiresAtUtc`: the next Friday 18:00 Pacific
11. `POST runs/{runId}/finish` with a short summary: quests published, pages created and updated, any
    script errors.

If nothing is publishable, skip steps 5 to 10 and finish with summary "nothing to publish". Don't
commit an empty week.

## Layout (made by the script; don't hand-edit these)

| Path under `content/3. History & Lore/The Chronicle/` | What it is |
|---|---|
| `Current Stories.md` | The front door, rebuilt every run, in four sections: Aftermath & Active Crises, Nations in Motion, Unresolved Threats & Mysteries, and The Guild's Own Stories, then Concluded Stories. Each thread's `section` and `isOngoing` come from the site (the lore master sets them on the Lore Desk; never change them). It also redirects the old Current Stories address. |
| `This Week in Eryndor (latest).md` | A stable link to the newest digest. The lore homepage links here. |
| `This Week in Eryndor/This Week in Eryndor YYYY-MM-DD.md` | One digest per week. |
| `Threads/<Active\|Quiet\|Dormant\|Resolved>/<Thread>.md` | One page per thread, moved when its status changes. The old path stays as an alias, so old links redirect. |

On a thread page, the top block and the lists are rewritten each run. The timeline only ever gains
entries; a Lore Desk correction is the only way an entry changes, and hand edits to entries in Obsidian
stick.
