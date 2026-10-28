#!/usr/bin/env node
// The Chronicle page builder (Champions Guild lore chronicle, slice 5).
//
// The Friday routine writes the words; this script lays them out. It takes one JSON file with the
// site's thread records (GET /api/lore/threads) and the chronicler's prose, and updates the vault:
//
//   content/3. History & Lore/The Chronicle/
//     Current Stories.md                    the front door, rebuilt every run
//     This Week in Eryndor (latest).md      a stable link to the newest digest
//     This Week in Eryndor/<date>.md        one digest per week
//     Threads/<Active|Quiet|Dormant|Resolved>/<Thread>.md
//
// Thread pages move between status folders; the old path becomes an alias, so Quartz's
// AliasRedirects keeps old links working. On a thread page the top block and the lists are
// rewritten each run, and timeline entries are only ever added (or replaced by a Lore Desk
// correction), so hand edits to the timeline stick. On NPC, faction and place pages only the
// marked "Guild Archive record" section is touched, never the hand-written text.
//
// Usage: node tools/chronicle/chronicle.mjs build <input.json> [--dry-run]
// Prints a JSON report of everything it did. Plain Node, no packages.

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")
const CONTENT = path.join(ROOT, "content")
const CHRONICLE_REL = "3. History & Lore/The Chronicle"
const CHRONICLE = path.join(CONTENT, CHRONICLE_REL)
const THREADS = path.join(CHRONICLE, "Threads")
const DIGESTS = path.join(CHRONICLE, "This Week in Eryndor")
const STATUS_FOLDERS = { Active: "Active", Quiet: "Quiet", Dormant: "Dormant", Resolved: "Resolved" }
const SCALE_ORDER = ["World", "Nation", "City", "Faction", "Personal"]
const CATEGORY = { CrisesAndWars: "Crises & Wars", IntrigueAndCrime: "Intrigue & Crime", MysteriesAndArcana: "Mysteries & Arcana" }
const DEFAULT_PAGE_FOLDERS = {
  npc: "5. People/NPCs/Unsorted",
  faction: "4. Factions & Organizations/Newly Recorded",
  place: "2. Nations/Newly Recorded Places",
}
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

// ------------------------------------------------------------------ small helpers

const report = { dryRun: false, created: [], updated: [], moved: [], removed: [], skipped: [], errors: [] }
let DRY = false

const rel = (abs) => path.relative(CONTENT, abs).split(path.sep).join("/")
const noExt = (p) => p.replace(/\.md$/i, "")
const read = (abs) => fs.readFileSync(abs, "utf8").replace(/\r\n/g, "\n")
function write(abs, text, kind) {
  const exists = fs.existsSync(abs)
  const next = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n"
  if (exists && read(abs) === next) return
  (exists ? report.updated : report.created).push(`${kind}: ${rel(abs)}`)
  if (DRY) return
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, next, "utf8")
}
function move(fromAbs, toAbs) {
  report.moved.push(`${rel(fromAbs)} -> ${rel(toAbs)}`)
  if (DRY) return
  fs.mkdirSync(path.dirname(toAbs), { recursive: true })
  fs.renameSync(fromAbs, toAbs)
}
function remove(abs, why) {
  report.removed.push(`${rel(abs)} (${why})`)
  if (!DRY) fs.unlinkSync(abs)
}
const safeName = (name) => String(name).replace(/[\\/:*?"<>|#^[\]]/g, "").replace(/\s+/g, " ").trim()
const yamlStr = (s) => JSON.stringify(String(s))

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (e.name.toLowerCase().endsWith(".md")) out.push(p)
  }
  return out
}

/** Splits "---\nyaml\n---\nbody" (only the bits this script needs: aliases, tags, ids). */
function splitFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/)
  return m ? { yaml: m[1], body: text.slice(m[0].length) } : { yaml: "", body: text }
}
function yamlList(yaml, key) {
  const lines = yaml.split("\n")
  const i = lines.findIndex((l) => l.replace(/\s+$/, "") === `${key}:` || l.startsWith(`${key}: `))
  if (i < 0) return []
  const inline = lines[i].slice(key.length + 1).trim()
  if (inline.startsWith("[")) return inline.slice(1, -1).split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean)
  if (inline) return [inline.replace(/^["']|["']$/g, "")]
  const out = []
  for (let j = i + 1; j < lines.length && /^\s+-\s/.test(lines[j]); j++) out.push(lines[j].replace(/^\s+-\s+/, "").replace(/^["']|["']$/g, ""))
  return out
}
function yamlValue(yaml, key) {
  const m = yaml.match(new RegExp(`^${key}:\\s*(.+)$`, "m"))
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : null
}

/** Site dates are UTC but arrive without a "Z"; a bare date is taken as midday UTC. */
function parseDate(iso) {
  const s = String(iso)
  if (s.length <= 10) return new Date(`${s}T12:00:00Z`)
  return new Date(/(Z|[+-]\d\d:?\d\d)$/.test(s) ? s : `${s}Z`)
}
function fmtDate(iso) {
  const d = parseDate(iso)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCFullYear()}`
}
function monthHeading(iso) {
  const d = parseDate(iso)
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}
const monthKey = (heading) => {
  const [m, y] = heading.split(" ")
  return Number(y) * 12 + MONTHS.indexOf(m)
}

/** Replaces the text between two markers, or returns null if the markers aren't there. */
function replaceBetween(text, start, end, inner) {
  const a = text.indexOf(start)
  const b = text.indexOf(end)
  if (a < 0 || b < 0 || b < a) return null
  return text.slice(0, a + start.length) + "\n" + inner.trim() + "\n" + text.slice(b)
}

// ------------------------------------------------------------------ the vault index

/** Every page's name (case-insensitive), so names are linked only when a page exists. */
function indexVault() {
  const names = new Map()
  for (const f of walk(CONTENT)) {
    // Thread pages are tracked by id, not name; the Chronicle's own pages are rebuilt each run.
    if (rel(f).startsWith("private/") || rel(f).startsWith(CHRONICLE_REL + "/")) continue
    const base = noExt(path.basename(f))
    if (!names.has(base.toLowerCase())) names.set(base.toLowerCase(), f)
    const { yaml } = splitFrontmatter(read(f))
    if (/^draft:\s*(true|"true")\s*$/m.test(yaml)) continue
    for (const a of yamlList(yaml, "aliases")) if (!a.includes("/")) names.set(a.toLowerCase(), names.get(a.toLowerCase()) ?? f)
  }
  return names
}

let NAMES = new Map()
let SITE = "https://championsguildrpg.com"
const link = (name) => (NAMES.has(String(name).toLowerCase()) ? `[[${name}]]` : String(name))
const questUrl = (id) => `${SITE}/questLogs/${id}`
const characterUrl = (id) => `${SITE}/characters/${id}/backstory`

// ------------------------------------------------------------------ threads

/** Existing thread pages, by the site's thread id in their frontmatter. */
function findThreadPages() {
  const byId = new Map()
  for (const f of walk(THREADS)) {
    const id = yamlValue(splitFrontmatter(read(f)).yaml, "chronicle-thread-id")
    if (id) byId.set(Number(id), f)
  }
  return byId
}

function statusOf(t) {
  return STATUS_FOLDERS[t.status] ? t.status : "Active"
}

function entryBlock(e) {
  const title = e.title ? `: ${e.title}` : ""
  const lines = [`<!-- quest:${e.questLogId} -->`, `**${fmtDate(e.date)}${title}**`, "", String(e.text ?? "").trim()]
  const members = (e.members ?? []).filter((m) => m && m.name)
  if (members.length)
    lines.push("", `*Guild members present:* ${members.map((m) => (m.characterId ? `[${m.name}](${characterUrl(m.characterId)})` : m.name)).join(" · ")}`)
  if (e.quote && e.quote.text) lines.push("", `*Featured dispatch:* “${String(e.quote.text).trim()}” (${e.quote.by})`)
  lines.push("", `[Read the full quest record →](${questUrl(e.questLogId)})`, `<!-- /quest:${e.questLogId} -->`)
  return lines.join("\n")
}

/** Adds entries under their month heading, oldest first. Existing entries are left alone. */
function addTimelineEntries(timeline, entries, corrections) {
  let text = timeline
  // A Lore Desk correction replaces an entry's words; its date, members, quote and link stay.
  for (const c of corrections ?? []) {
    const re = new RegExp(`<!-- quest:${c.questLogId} -->[\\s\\S]*?<!-- /quest:${c.questLogId} -->`)
    const old = text.match(re)
    if (!old) continue
    const lines = old[0].split("\n")
    const tail = lines.filter((l) => l.startsWith("*Guild members present:*") || l.startsWith("*Featured dispatch:*") || l.startsWith("[Read the full quest record"))
    const rebuilt = [...lines.slice(0, 2), "", String(c.text).trim(), ...tail.flatMap((l) => ["", l]), `<!-- /quest:${c.questLogId} -->`].join("\n")
    text = text.replace(old[0], rebuilt)
    report.updated.push(`timeline correction: quest ${c.questLogId}`)
  }

  const sorted = [...(entries ?? [])].sort((a, b) => String(a.date).localeCompare(String(b.date)))
  for (const e of sorted) {
    if (text.includes(`<!-- quest:${e.questLogId} -->`)) continue
    const heading = `### ${monthHeading(e.date)}`
    const block = entryBlock(e)
    const headings = [...text.matchAll(/^### ([A-Z][a-z]+ \d{4})$/gm)]
    const at = headings.find((h) => `### ${h[1]}` === heading)
    if (at) {
      // End of that month's section: the next month heading, or the end of the timeline.
      const next = headings.find((h) => h.index > at.index)
      const insertAt = next ? next.index : text.length
      text = text.slice(0, insertAt).trimEnd() + "\n\n" + block + "\n\n" + text.slice(insertAt)
    } else {
      const later = headings.find((h) => monthKey(h[1]) > monthKey(monthHeading(e.date)))
      const insertAt = later ? later.index : text.length
      text = text.slice(0, insertAt).trimEnd() + "\n\n" + heading + "\n\n" + block + "\n\n" + text.slice(insertAt)
    }
  }
  return text.trim()
}

function membersFrom(text) {
  const out = new Map()
  for (const m of text.matchAll(/\[([^\]]+)\]\(([^)]*\/characters\/(\d+)\/backstory)\)/g)) out.set(m[3], `[${m[1]}](${m[2]})`)
  return [...out.values()]
}

function buildThreads(threads, prose) {
  const pages = findThreadPages()
  const proseById = new Map((prose?.threads ?? []).map((p) => [Number(p.id), p]))
  const names = new Map()
  const published = []

  // Names first (so connected threads can link each other), refusing any that clash with a page:
  // page names must be unique, so a thread can't be called exactly what an NPC page is called.
  const clashes = new Set()
  for (const t of threads) {
    if (t.isHidden || !(pages.has(t.id) || proseById.has(t.id))) continue
    const name = safeName(t.name)
    const clash = NAMES.get(name.toLowerCase())
    if (clash && clash !== "thread") {
      report.errors.push(`Thread "${name}" has the same name as ${rel(clash)}. Rename the thread on the Lore Desk; its page was not written.`)
      clashes.add(t.id)
      continue
    }
    names.set(t.id, name)
    NAMES.set(name.toLowerCase(), "thread")
  }

  for (const t of threads) {
    const existing = pages.get(t.id)
    if (t.isHidden) {
      if (existing) remove(existing, "thread is hidden")
      continue
    }
    const p = proseById.get(t.id)
    if (!existing && !p) continue // nothing has been written about it yet
    if (clashes.has(t.id)) continue

    const name = safeName(t.name)

    const status = statusOf(t)
    const target = path.join(THREADS, STATUS_FOLDERS[status], `${name}.md`)
    let aliases = []
    let oldText = ""
    if (existing) {
      oldText = read(existing)
      aliases = yamlList(splitFrontmatter(oldText).yaml, "aliases")
      if (path.resolve(existing) !== path.resolve(target)) {
        const oldPath = noExt(rel(existing))
        if (!aliases.includes(oldPath)) aliases.push(oldPath)
        move(existing, target)
      }
    }
    const { body: oldBody } = splitFrontmatter(oldText)
    const oldTimeline = (oldBody.match(/<!-- chronicle:timeline:start -->([\s\S]*?)<!-- chronicle:timeline:end -->/) ?? [])[1] ?? ""
    const oldLatest = (oldBody.match(/\*\*Latest development:\*\* ([^\n]+)/) ?? [])[1]

    const timeline = addTimelineEntries(oldTimeline, p?.timeline, p?.timelineCorrections)
    const where = (p?.whereItStands ?? t.whereItStands ?? "").trim()
    const latest = (p?.latestDevelopment ?? oldLatest ?? "").trim()
    const questions = (t.unansweredQuestions ?? []).filter(Boolean)
    const lastMoved = t.lastMovedUtc ? fmtDate(t.lastMovedUtc) : null
    const category = t.category ? CATEGORY[t.category] ?? t.category : null

    const top = [
      `> [!info] **${statusLabel(t)}** · ${t.scale}${category ? ` · ${category}` : ""}${lastMoved ? ` · last moved ${lastMoved}` : ""}`,
      "",
      "## Where it stands",
      "",
      status === "Resolved" && (p?.closingParagraph ?? t.closingParagraph) ? (p?.closingParagraph ?? t.closingParagraph).trim() : where || "*How this stands is not yet known.*",
      latest ? `\n**Latest development:** ${latest}` : "",
      questions.length ? `\n## Unanswered questions\n\n${questions.map((q) => `- ${q}`).join("\n")}` : "",
    ].join("\n")

    const npcs = (t.npcs ?? []).map(link)
    const others = [...(t.factions ?? []), ...(t.places ?? [])].map(link)
    const members = membersFrom(timeline)
    const mine = new Set([...(t.npcs ?? []), ...(t.factions ?? [])].map((s) => s.toLowerCase()))
    const connected = threads
      .filter((o) => o.id !== t.id && !o.isHidden && names.has(o.id))
      .filter((o) => [...(o.npcs ?? []), ...(o.factions ?? [])].some((n) => mine.has(n.toLowerCase())))
      .map((o) => `[[${names.get(o.id)}]]`)
    const lists = [
      npcs.length ? `## Key figures\n\n${npcs.map((n) => `- ${n}`).join("\n")}` : "",
      others.length ? `## Factions and places\n\n${others.map((n) => `- ${n}`).join("\n")}` : "",
      members.length ? `## Guild members involved\n\n${members.map((n) => `- ${n}`).join("\n")}` : "",
      connected.length ? `## Connected threads\n\n${connected.map((n) => `- ${n}`).join("\n")}` : "",
    ].filter(Boolean).join("\n\n")

    const tags = ["chronicle", "thread", `status/${status.toLowerCase()}`, `scale/${String(t.scale).toLowerCase()}`]
    const front = [
      "---",
      `title: ${yamlStr(name)}`,
      ...(aliases.length ? ["aliases:", ...aliases.map((a) => `  - ${yamlStr(a)}`)] : []),
      "tags:",
      ...tags.map((x) => `  - ${x}`),
      `chronicle-thread-id: ${t.id}`,
      "---",
    ].join("\n")

    const page = [
      front,
      "",
      "<!-- chronicle:top:start -->",
      top,
      "<!-- chronicle:top:end -->",
      "",
      "## The chronicle",
      "",
      "<!-- chronicle:timeline:start -->",
      timeline || "*No entries yet.*",
      "<!-- chronicle:timeline:end -->",
      "",
      "<!-- chronicle:lists:start -->",
      lists,
      "<!-- chronicle:lists:end -->",
    ].join("\n")

    write(target, page, "thread")
    published.push({ t, name, status, where, latest })
  }
  return published
}

// ------------------------------------------------------------------ digest and front door

function digestBody(d, threadNames) {
  const threadLink = (id) => (threadNames.has(Number(id)) ? `[[${threadNames.get(Number(id))}]]` : null)
  const item = (x) => {
    const bits = [x.text?.trim()]
    const tl = x.threadId != null ? threadLink(x.threadId) : null
    if (tl) bits.push(`(${tl})`)
    if (x.questLogId) bits.push(`[Quest record](${questUrl(x.questLogId)})`)
    return `- ${bits.filter(Boolean).join(" ")}`
  }
  const section = (title, list) => (list?.length ? `## ${title}\n\n${list.map(item).join("\n")}` : "")
  return [
    `# ${d.headline ?? "This Week in Eryndor"}`,
    "",
    d.stateOfTheWorld?.trim() ?? "",
    section("Major developments", d.majorDevelopments),
    section("Escalations", d.escalations),
    section("Threads stirring", d.stirring),
    section("New threads", d.newThreads),
    d.featured?.length
      ? `## Featured dispatches\n\n${d.featured.map((f) => `> “${String(f.quote).trim()}”\n> — ${f.by}${f.questLogId ? ` ([quest record](${questUrl(f.questLogId)}))` : ""}`).join("\n\n")}`
      : "",
  ].filter((s) => s !== "").join("\n\n")
}

function buildDigest(weekOf, digest, threadNames) {
  if (!digest) return null
  const dateName = `This Week in Eryndor ${weekOf}`
  const pretty = fmtDate(weekOf)
  const body = digestBody(digest, threadNames)
  write(path.join(DIGESTS, `${dateName}.md`), [
    "---",
    `title: ${yamlStr(`This Week in Eryndor, ${pretty}`)}`,
    `date: ${weekOf}`,
    "tags:",
    "  - chronicle",
    "  - digest",
    "---",
    "",
    body,
  ].join("\n"), "digest")
  write(path.join(CHRONICLE, "This Week in Eryndor (latest).md"), [
    "---",
    'title: "This Week in Eryndor (latest)"',
    "tags:",
    "  - chronicle",
    "  - digest",
    "---",
    "",
    `> [!note] The newest weekly digest, for ${pretty}. Earlier weeks: [[Current Stories#Past digests|past digests]].`,
    "",
    body,
    "",
    `*Permanent link to this week: [[${dateName}]]*`,
  ].join("\n"), "digest-latest")
  return dateName
}

// Current Stories keeps the shape of the old hand-written page: three world sections, then the Guild's own.
const SECTIONS = [
  ["ActiveCrises", "Aftermath & Active Crises", "Recent victories changed the world. They did not settle it."],
  ["NationsInMotion", "Nations in Motion", "Governments, cultures, resources, and new technology are shifting the balance of power."],
  ["ThreatsAndMysteries", "Unresolved Threats & Mysteries", "Some dangers survived. Others are only beginning to reveal themselves."],
  ["GuildStories", "The Guild's Own Stories", "Debts, rescues, rivals and old wounds: the stories the Guild's members carry."],
]
const STATUS_ORDER = ["Active", "Quiet", "Dormant"]

/** The site sends each thread's section; older data falls back the same way the site does. */
function sectionOf(t) {
  if (SECTIONS.some(([k]) => k === t.section)) return t.section
  if (["Personal", "Faction", "City"].includes(t.scale)) return "GuildStories"
  return t.category === "CrisesAndWars" ? "ActiveCrises" : t.category === "IntrigueAndCrime" ? "NationsInMotion" : "ThreatsAndMysteries"
}
const statusLabel = (t) => (t.isOngoing && statusOf(t) !== "Resolved" ? "Ongoing" : statusOf(t))

function buildFrontDoor(threads, threadNames, published) {
  const shown = threads.filter((t) => !t.isHidden && threadNames.has(t.id))
  const info = new Map(published.map((p) => [p.t.id, p]))
  const firstSentence = (s) => (String(s ?? "").match(/^[\s\S]*?[.!?](\s|$)/) ?? [String(s ?? "")])[0].trim()
  const tag = (t) => (t.category ? ` · ${CATEGORY[t.category] ?? t.category}` : "")
  // Ongoing threads report as Active, so live stories and standing conditions mix, largest first.
  const order = (a, b) =>
    STATUS_ORDER.indexOf(statusOf(a)) - STATUS_ORDER.indexOf(statusOf(b)) ||
    SCALE_ORDER.indexOf(a.scale) - SCALE_ORDER.indexOf(b.scale) || String(a.name).localeCompare(String(b.name))
  const card = (t) => `### [[${threadNames.get(t.id)}]]\n*${statusLabel(t)} · ${t.scale}${tag(t)}*\n\n${(info.get(t.id)?.where ?? t.whereItStands ?? "").trim()}`
  const line = (t) => `- [[${threadNames.get(t.id)}]] (${statusLabel(t)}): ${firstSentence(info.get(t.id)?.latest || t.whereItStands)}`

  const sections = SECTIONS.map(([key, title, blurb]) => {
    const list = shown.filter((t) => statusOf(t) !== "Resolved" && sectionOf(t) === key).sort(order)
    if (!list.length) return ""
    // World sections read like the old page, one paragraph each. In the Guild's own stories only the live
    // ones get a paragraph; the quiet and dormant ones are a line each.
    const full = key === "GuildStories" ? list.filter((t) => t.isOngoing || statusOf(t) === "Active") : list
    const brief = list.filter((t) => !full.includes(t))
    return [`## ${title}`, `*${blurb}*`, ...full.map(card), brief.length ? `#### Quiet and lingering\n\n${brief.map(line).join("\n")}` : ""]
      .filter(Boolean).join("\n\n")
  })
  const resolved = shown.filter((t) => statusOf(t) === "Resolved").sort((a, b) => String(a.name).localeCompare(String(b.name)))
  const digests = walk(DIGESTS).map((f) => noExt(path.basename(f))).sort().reverse()

  const parts = [
    "---",
    'title: "Current Stories"',
    "aliases:",
    '  - "3. History & Lore/Current Stories"',
    "tags:",
    "  - chronicle",
    "---",
    "",
    "*The stories still shaping Eryndor. Rewritten every Friday.*",
    "",
    "> [!tip] This week: [[This Week in Eryndor (latest)|This Week in Eryndor]]",
    "",
    ...sections,
    resolved.length ? `## Concluded Stories\n\n${resolved.map((t) => `- [[${threadNames.get(t.id)}]]${t.resolvedUtc ? ` (${monthHeading(t.resolvedUtc)})` : ""}`).join("\n")}` : "",
    digests.length ? `## Past digests\n\n${digests.map((d) => `- [[${d}]]`).join("\n")}` : "",
  ]
  const [frontmatter, blocks] = [parts.slice(0, 7).join("\n"), parts.slice(7).filter((s) => s !== "")]
  write(path.join(CHRONICLE, "Current Stories.md"), frontmatter + "\n\n" + blocks.join("\n\n"), "front-door")
}

// ------------------------------------------------------------------ NPC, faction and place pages

const RECORD_START = "<!-- guild-archive-record:start -->"
const RECORD_END = "<!-- guild-archive-record:end -->"

function recordBlock(r, existingText) {
  const seen = new Map()
  for (const m of (existingText ?? "").matchAll(/^- (.+?\]\([^)]*\/questLogs\/(\d+)\))$/gm)) seen.set(m[2], m[1])
  for (const a of r.appearances ?? []) seen.set(String(a.questLogId), `${fmtDate(a.date)}: [${a.title}](${questUrl(a.questLogId)})`)
  const appearances = [...seen.entries()].sort((a, b) => Number(a[0]) - Number(b[0])).map(([, v]) => `- ${v}`)
  return [
    RECORD_START,
    "## Guild Archive record",
    "*Kept by the Guild Archive and updated automatically. The text above is hand-written.*",
    r.status ? `**Status:** ${r.status}` : "",
    r.threads?.length ? `**Threads:** ${r.threads.map(link).join(" · ")}` : "",
    appearances.length ? `**Quest appearances:**\n\n${appearances.join("\n")}` : "",
    RECORD_END,
  ].filter((s) => s !== "").join("\n\n")
}

function buildPages(pages) {
  for (const p of pages ?? []) {
    const name = safeName(p.name)
    if (!name) continue
    const existing = NAMES.get(name.toLowerCase())
    if (existing === "thread") {
      report.errors.push(`Page "${name}" has the same name as a thread. Skipped.`)
      continue
    }

    if (existing) {
      // Only the marked record section changes; the hand-written page is never touched.
      const text = read(existing)
      const old = (text.match(new RegExp(`${RECORD_START}[\\s\\S]*?${RECORD_END}`)) ?? [""])[0]
      const block = recordBlock(p.record ?? {}, old)
      const next = old ? text.replace(old, block) : text.trimEnd() + "\n\n" + block
      write(existing, next, `${p.kind ?? "page"}-record`)
      continue
    }

    if (p.action !== "create" || !p.body) {
      report.skipped.push(`"${name}": no page exists and no new page text was given`)
      continue
    }
    const folderRel = p.folder && fs.existsSync(path.join(CONTENT, p.folder)) ? p.folder : DEFAULT_PAGE_FOLDERS[p.kind] ?? DEFAULT_PAGE_FOLDERS.npc
    if (p.folder && folderRel !== p.folder) report.skipped.push(`"${name}": folder "${p.folder}" doesn't exist, used "${folderRel}"`)
    const target = path.join(CONTENT, folderRel, `${name}.md`)
    const body = String(p.body).trim()
    const text = [
      "---",
      `title: ${yamlStr(name)}`,
      "tags:",
      `  - ${p.kind ?? "npc"}`,
      "  - chronicle-created",
      "---",
      "",
      body,
      "",
      recordBlock(p.record ?? {}, ""),
    ].join("\n")
    write(target, text, `${p.kind ?? "page"}-new`)
    NAMES.set(name.toLowerCase(), target)
  }
}

// ------------------------------------------------------------------ main

function main() {
  const [cmd, inputPath, ...rest] = process.argv.slice(2)
  DRY = rest.includes("--dry-run")
  report.dryRun = DRY
  if (cmd !== "build" || !inputPath) {
    console.error("Usage: node tools/chronicle/chronicle.mjs build <input.json> [--dry-run]")
    process.exit(2)
  }
  const input = JSON.parse(fs.readFileSync(inputPath, "utf8"))
  SITE = String(input.siteBaseUrl ?? SITE).replace(/\/+$/, "")
  const weekOf = input.weekOf ?? new Date().toISOString().slice(0, 10)
  const threads = (input.threads ?? []).map((t) => ({ ...t, id: Number(t.id) }))

  NAMES = indexVault()
  // Thread names are reserved before any new page is written, so a page can't take one.
  for (const t of threads) if (!t.isHidden && !NAMES.has(safeName(t.name).toLowerCase())) NAMES.set(safeName(t.name).toLowerCase(), "thread")
  // New pages first, so thread pages can link to them.
  buildPages(input.prose?.pages)
  for (const [k, v] of [...NAMES]) if (v === "thread") NAMES.delete(k)
  const published = buildThreads(threads, input.prose)
  const threadNames = new Map()
  for (const f of walk(THREADS)) {
    const id = yamlValue(splitFrontmatter(read(f)).yaml, "chronicle-thread-id")
    if (id) threadNames.set(Number(id), noExt(path.basename(f)))
  }
  if (DRY) for (const p of published) threadNames.set(p.t.id, p.name)
  buildDigest(weekOf, input.prose?.digest, threadNames)
  buildFrontDoor(threads, threadNames, published)

  console.log(JSON.stringify(report, null, 2))
  if (report.errors.length) process.exitCode = 1
}

main()
