import { zh, zhMeta, zhTransfer, zhConfig, zhImport, zhAudit, zhConfirm, zhOverview, zhStatuses, tExprHelp as zhExprHelp } from "./zh"
import { en, enMeta, enTransfer, enConfig, enImport, enAudit, enConfirm, enOverview, enStatuses, enExprHelp } from "./en"

export type Lang = "zh" | "en"

export const LANGS: Lang[] = ["zh", "en"]

/** The label of each language, written in that language. */
export const LANG_NAMES: Record<Lang, string> = { zh: "中文", en: "English" }

const STORAGE_KEY = "nexus.lang"

const dictionaries = {
  zh: { t: zh, tMeta: zhMeta, tTransfer: zhTransfer, tConfig: zhConfig, tImport: zhImport,
        tAudit: zhAudit, tConfirm: zhConfirm, tOverview: zhOverview, tStatuses: zhStatuses,
        tExprHelp: zhExprHelp },
  en: { t: en, tMeta: enMeta, tTransfer: enTransfer, tConfig: enConfig, tImport: enImport,
        tAudit: enAudit, tConfirm: enConfirm, tOverview: enOverview, tStatuses: enStatuses,
        tExprHelp: enExprHelp },
}

/**
 * Follows the system unless the reader has said otherwise.
 *
 * Anything that is not clearly English gets Chinese: this is a
 * Chinese-speaking company's system, and an English speaker's browser says so
 * on every request without being asked.
 */
export function detectLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === "zh" || stored === "en") return stored
  } catch {
    // A private window has no storage; the system preference still applies.
  }
  const nav = typeof navigator === "undefined" ? "" : navigator.language ?? ""
  return nav.toLowerCase().startsWith("en") ? "en" : "zh"
}

let current: Lang = detectLang()

/** The language in force. Sent as Accept-Language so the server agrees. */
export function getLang(): Lang {
  return current
}

/**
 * The BCP 47 tag for date and number formatting.
 *
 * Separate from the dictionary because the two are different questions: the
 * copy is translated by hand, while dates and thousands separators are the
 * platform's job once it is told which convention to use.
 */
export function locale(): string {
  return current === "en" ? "en-GB" : "zh-CN"
}

/**
 * The dictionaries, rebound when the language changes.
 *
 * `let` plus a live binding rather than a hook: there are several hundred call
 * sites, and threading a hook through every one of them would be a lot of
 * churn for a value that changes at most a handful of times in a session.
 * Nothing here is reactive on its own, so LanguageProvider remounts the tree --
 * see the comment there for what that costs.
 */
export let t = dictionaries[current].t
export let tMeta = dictionaries[current].tMeta
export let tTransfer = dictionaries[current].tTransfer
export let tConfig = dictionaries[current].tConfig
export let tImport = dictionaries[current].tImport
export let tAudit = dictionaries[current].tAudit
export let tConfirm = dictionaries[current].tConfirm
export let tOverview = dictionaries[current].tOverview
export let tStatuses = dictionaries[current].tStatuses
export let tExprHelp = dictionaries[current].tExprHelp

/** Switches the language and remembers the choice. */
export function applyLang(lang: Lang) {
  current = lang
  const d = dictionaries[lang]
  t = d.t
  tMeta = d.tMeta
  tTransfer = d.tTransfer
  tConfig = d.tConfig
  tImport = d.tImport
  tAudit = d.tAudit
  tConfirm = d.tConfirm
  tOverview = d.tOverview
  tStatuses = d.tStatuses
  tExprHelp = d.tExprHelp

  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    // The choice simply will not survive a reload.
  }
  if (typeof document !== "undefined") {
    document.documentElement.lang = lang
  }
}

applyLang(current)
