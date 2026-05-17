# Eryndor NPC Vault

This folder contains one markdown file per NPC (402 total), formatted for Obsidian.

## Structure

NPCs are organized into subfolders by their **primary affiliation** (first listed nation or faction). Each file contains:

- **YAML frontmatter** with `name`, `type: npc`, `location`, `affiliations`, `sources`, `occurrences`, and `tags`
- **Overview** section with wikilinks to the NPC's location/context and all affiliations
- **Role & Notes** — every distinct excerpt from the source material
- **Source Documents** — which .docx files mention them
- **Paragraph References** — exact ¶ locations for citation

## Links

All affiliations and locations are written as `[[wikilinks]]`. When you create pages like `[[Kastalshire]]`, `[[Drakmir Dominion]]`, or `[[Duchy of Rath]]`, every NPC in those places will automatically backlink to them.

## Affiliation normalization

The source spreadsheet mixed real nation names with source-document filenames in the Affiliation column. They've been normalized:

| Source value | Canonical link |
| --- | --- |
| Aasimar Final | Bastions of Solara |
| Dwarves Final | Halls of Kar Dromm |
| sylvandar full final | Sylvandar Republic |
| Kastalshire final | Kastalshire |
| Thundrakar final / Thundraka | Thundrakar |
| Ash Korrath Final | Ash-Korrath |
| City states of Eryndor final | City States of Eryndor |
| Korivar City State | Korivar Compact |
| Criminals and mercenaries | Mercenaries and Criminal Organizations |
| Forged Sands Final | Forged Sands |
| Nation of Lexovar (both variants) | Lexovar |
| Redmarch Coalition Final | Redmarch Coalition |
| Scar of Vaelor Final | Scar of Vaelor |

Source-only tokens (`Anthros and his endless tome`, `A brief history of Eryndor`, `Eryndor History`) were dropped from affiliations and kept only as `sources:`.

## Locations

Where the spreadsheet's "Location / Context" column had a clean place name (e.g. "Calyros Haven", "Duchy of Rath"), it became a `[[wikilink]]` in both the frontmatter and Overview section. About 213 NPCs got a usable location; the other ~189 had only narrative cruft in that field, so location was omitted — fall back to their affiliation instead.

## Name conflicts

Four NPCs flagged in the spreadsheet's "Likely Conflicts" sheet have a `review:` note in frontmatter:

- Arven Dallinar (Kastalshire) and Arven Drell (City States of Eryndor)
- Jareth Konn and Jareth Solvain

Likely shared first names rather than true duplicates, but flagged so you can confirm.

## Start here

Open [[_NPC Index]] for a full browsable index of every NPC grouped by nation.
