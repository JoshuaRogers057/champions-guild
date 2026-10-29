import { GlobalConfiguration } from "../cfg"
import { ValidLocale } from "../i18n"
import { QuartzPluginData } from "../plugins/vfile"

interface Props {
  date: Date
  locale?: ValidLocale
  slug?: string
}

export type ValidDateType = keyof Required<QuartzPluginData>["dates"]

export function getDate(cfg: GlobalConfiguration, data: QuartzPluginData): Date | undefined {
  if (!cfg.defaultDateType) {
    throw new Error(
      `Field 'defaultDateType' was not set in the configuration object of quartz.config.ts. See https://quartz.jzhao.xyz/configuration#general-configuration for more details.`,
    )
  }
  return data.dates?.[cfg.defaultDateType]
}

export function formatDate(d: Date, locale: ValidLocale = "en-US"): string {
  return d.toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  })
}

// Eryndor's calendar is the real one less a thousand years (29 Oct 2026 is 29 Oct 1026). Lore pages show
// in-world dates; the out-of-game pages under 1. Meta Info keep real ones.
const IN_WORLD_OFFSET = 1000
export const isMetaPage = (slug?: string) => !!slug && slug.startsWith("1.-Meta-Info")

export function formatWorldDate(d: Date, locale: ValidLocale = "en-US"): string {
  const monthDay = d.toLocaleDateString(locale, { month: "short", day: "2-digit" })
  return `${monthDay}, ${d.getFullYear() - IN_WORLD_OFFSET}`
}

export function Date({ date, locale, slug }: Props) {
  const text = isMetaPage(slug) ? formatDate(date, locale) : formatWorldDate(date, locale)
  return <time datetime={date.toISOString()}>{text}</time>
}
