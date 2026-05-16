import { pathToRoot } from "../util/path"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { classNames } from "../util/lang"
import { i18n } from "../i18n"

const PageTitle: QuartzComponent = ({ fileData, cfg, displayClass }: QuartzComponentProps) => {
  const title = cfg?.pageTitle ?? i18n(cfg.locale).propertyDefaults.title
  const baseDir = pathToRoot(fileData.slug!)
  return (
    <h2 class={classNames(displayClass, "page-title")}>
      <a href="https://championsguildrpg.com/main" class="logo-link">
        <img src="/static/logo.png" alt="Champions Guild Logo" class="site-logo" />
      </a>
      <a href={baseDir}>{title}</a>
    </h2>
  )
}

PageTitle.css = `
.page-title {
  font-size: 1.75rem;
  margin: 0;
  font-family: var(--titleFont);
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.site-logo {
  width: 40px;
  height: 40px;
  object-fit: contain;
}

.logo-link {
  display: flex;
  align-items: center;
}
`

export default (() => PageTitle) satisfies QuartzComponentConstructor