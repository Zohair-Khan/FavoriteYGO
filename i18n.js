// Shared i18n engine. LANGUAGES itself now lives in i18n_config.js (loaded
// before this file on every page) -- edit that one file to add/remove a
// language everywhere at once. Add new languages by (1) adding an entry to
// LANGUAGES in i18n_config.js, (2) creating an i18n_<code>.js file
// exporting window.I18N_<CODE>, and (3) loading that script tag on the
// page, alongside i18n.js.

const I18N_STORAGE_KEY = "ygo_language"; // shared across all pages, like ygo_session_id

function getStoredLanguage() {
  return localStorage.getItem(I18N_STORAGE_KEY) || "en";
}

function setStoredLanguage(code) {
  localStorage.setItem(I18N_STORAGE_KEY, code);
}

let currentLanguage = getStoredLanguage();

function getTranslationTable(code) {
  const tables = {
    en: window.I18N_EN,
    ja: window.I18N_JA,
    ko: window.I18N_KO,
    "zh-Hans": window.I18N_ZH_HANS,
  };
  return tables[code] || window.I18N_EN || {};
}

// Looks up a key in the active language, falling back to English if that
// language doesn't have this key translated yet (e.g. a UI string added
// before a translator has gotten to it) -- and as a last resort, shows the
// raw key itself so a missing translation is obvious rather than blank.
function t(key) {
  const table = getTranslationTable(currentLanguage);
  const value = table[key];
  if (value) return value;
  const enValue = (window.I18N_EN || {})[key];
  return enValue || key;
}

// Applies translations to every element with a data-i18n attribute --
// covers STATIC page text present at load time. Dynamic content built in
// JS (category tab labels, templated headings, etc.) should call t(key)
// directly wherever it's constructed, and re-run whenever the language
// changes (see the onChange callback in buildLanguageSwitcher below).
function applyTranslations() {
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.dataset.i18n;
    if (el.tagName === "INPUT" && el.hasAttribute("placeholder")) {
      el.setAttribute("placeholder", t(key));
    } else {
      el.textContent = t(key);
    }
  });
  // Elements that need a "title" tooltip translated too (in addition to,
  // or instead of, their visible text).
  document.querySelectorAll("[data-i18n-title]").forEach(el => {
    el.setAttribute("title", t(el.dataset.i18nTitle));
  });
}

// Builds the correct localized template filename for the current language,
// e.g. getTemplateFilename("template") -> "template_ja.png" when Japanese
// is active, or just "template.png" for English (or any language without
// its own localized templates yet).
function getTemplateFilename(baseName) {
  const lang = LANGUAGES.find(l => l.code === currentLanguage);
  const suffix = (lang && lang.templateSuffix) || "";
  return `${baseName}${suffix}.png`;
}

// Builds the language toggle row -- each button's own label is written in
// that language (e.g. "日本語", not "Japanese"). onChange fires after
// switching, so the calling page can refresh any dynamically-built text
// that data-i18n attributes alone don't cover.
function buildLanguageSwitcher(containerId, onChange) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = "";
  LANGUAGES.forEach(lang => {
    const btn = document.createElement("button");
    btn.textContent = lang.label;
    btn.dataset.lang = lang.code;
    if (lang.code === currentLanguage) btn.classList.add("active");
    btn.addEventListener("click", () => {
      if (lang.code === currentLanguage) return;
      currentLanguage = lang.code;
      setStoredLanguage(lang.code);
      container.querySelectorAll("button").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      applyTranslations();
      if (onChange) onChange();
    });
    container.appendChild(btn);
  });
}