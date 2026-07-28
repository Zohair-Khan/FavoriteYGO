// Central place to configure which languages are offered across the WHOLE
// site. Every page loads this one file, so adding/removing/reordering a
// language here updates the button row everywhere at once -- no need to
// touch individual pages.
//
// "templateSuffix" is how each page's localized template image is found:
// a page's own base template name (e.g. "template", "templateST", "hated")
// gets this suffix appended, so English uses "template.png" and Japanese
// uses "template_ja.png", etc. Leave templateSuffix empty ("") for a
// language that doesn't have its own localized template images yet -- it
// will just keep showing the English template.
const LANGUAGES = [
  { code: "en", label: "English", templateSuffix: "" },
  { code: "ja", label: "日本語", templateSuffix: "_ja" },
  { code: "ko", label: "한국어", templateSuffix: "_ko" },
  { code: "zh-Hans", label: "中文", templateSuffix: "_zh" },
];
