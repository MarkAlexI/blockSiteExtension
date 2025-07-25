# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.6.20] - 2025-07-18

### Changed
- Updated translation for locale: Kannada (kn).

## [2.6.19] - 2025-07-16

### Changed
- Updated translation for locale: Lithuanian (lt).

## [2.6.18] - 2025-07-09

### Changed
- Updated translation for locale: Latvian (lv).

## [2.6.17] - 2025-07-04

### Changed
- Updated translation for locale: Marathi (mr).

## [2.6.16] - 2025-06-28

### Changed
- Updated translation for locale: Malay(ms).

## [2.6.15] - 2025-06-27

### Changed
- Updated translation for locale: Nederland (nl).

## [2.6.14] - 2025-06-26

### Changed
- Updated translation for locale: Norwegian (no).

## [2.6.13] - 2025-06-23

### Changed
- Updated translation for locale: Polish (pl).

## [2.6.12] - 2025-06-21

### Changed
- Updated translation for locale: Romanian (ro).

## [2.6.11] - 2025-06-20

### Changed
- Updated translation for locale: Russian (ru).

## [2.6.10] - 2025-06-19

### Changed
- Updated translation for locale: Slovakian (sk).

## [2.6.9] - 2025-06-18

### Changed
- Updated translation for locale: Slovenian (sl).

## [2.6.8] - 2025-06-16

### Changed
- Improve readability in popup.js by extracting locale messages retrieval into a separate function.

## [2.6.7] - 2025-06-15

### Changed
- Updated translation for locale: Serbian (sr).

## [2.6.6] - 2025-06-14

### Changed
- Updated translation for locale: Swedish (sv).

## [2.6.5] - 2025-06-13

### Changed
- Updated translation for locale: Swahili (sw).

## [2.6.4] - 2025-06-12

### Changed
- Updated translation for locale: Tamil (ta).

## [2.6.3] - 2025-06-10

### Changed
- Updated translation for locale: Telugu (te).

## [2.6.2] - 2025-06-09

### Changed
- Updated translations for locales: Thai (th), Turkish (tr), and Vietnamese (vi).

## [2.6.1] - 2025-06-08

### Changed
- Made `normalizeUrlFilter` function exportable; it is now imported as a module instead of being loaded via a `<script>` tag in HTML.
- Improved code modularity and maintainability.

## [2.6.0] - 2025-06-04
### Added
- New motivational quotes feature: displays motivational messages in the popup.
- Initial support for motivational quotes in 12 languages:
  - English (en)
  - Ukrainian (uk)
  - German (de)
  - Spanish (es)
  - French (fr)
  - Indonesian (id)
  - Japanese (ja)
  - Korean (ko)
  - Portuguese (Brazil) (pt_BR)
  - Portuguese (Portugal) (pt_PT)
  - Chinese (Simplified) (zh_CN)
  - Chinese (Traditional) (zh_TW)

## [2.5.1] - 2025-06-02
### Changed
- Fixed list of web accessible resources.
- Patch version update.

## [2.5.0] – 2025-06-02
### Added
- Custom "blocked" page shown when a website is blocked, instead of the browser's default error message.
- Improved user experience with a clean and neutral message when accessing a blocked site.

## [2.4.1] - 2025-06-01

### Changed
- Updated translations for locales: Lithuanian (lt).
- Patch version update.

## [2.4.0] - 2025-05-31
### Changed
- Added new utility function `closeMatchingTabs(blockURL)` to close all tabs matching the blocked URL.
- Replaced duplicated logic in rule creation and "Block This Site" button with a call to the new function.
- Improved modularity and consistency of tab-handling logic.

## [2.3.4] - 2025-05-30

### Changed
- Updated translations for locales: Indonesian (id), and Kannada (kn).
- Patch version update.

## [2.3.3] - 2025-05-28

### Changed
- Updated `normalizeUrlFilter` function: now only the hostname is stored as the blocking URL, excluding `www` and pathnames.

## [2.3.2] - 2025-05-27

### Fixed
- Refactored `makeInputReadOnly` function: input fields with rules are now selectable and copyable.
- Improved UX when interacting with readonly inputs.

## [2.3.1] - 2025-05-26

### Changed
- Updated translations for locales: Filipino (fil), Gujarati (gu), Hebrew (he), Hindi (hi), Croatian (hr), and Hungarian (hu).
- Patch version update.

## [2.3.0] - 2025-05-25

### Fixed
- Fixed an issue where, after reinstalling the extension with an existing list of blocked sites, declarative network request (DNR) rules were not recreated, causing the blocking to be inactive until the list was manually edited.
- DNR rules are now automatically created during installation (`onInstalled.reason === "install"`) if a `rules` list already exists in storage.

### Added
- Support for modular service workers (`type: "module"`) in Manifest V3

## [2.2.6] - 2025-05-26

### Changed
- Updated translations for locales: Czech (cs), Danish (da), Greek (el), Estonian (et), Persian (fa), and Finnish (fi).
- Patch version update.

## [2.2.5] - 2025-05-23

### Changed
- Updated translations for locales: Africaan (af), Amharic (am), Arabic (ar), Bulgarian (bg), Bengali (bn), and Catalonian (ca).
- Minor version update.

## [2.2.4] - 2025-05-22

### Changed
- Updated translations for locales: Spanish (es), French (fr), Italian (it), Japanese (ja), Korean (ko), and Turkish (tr).
- Minor version update.

## [2.2.3] - 2025-05-21

### Changed
- Refactored the creation of declarative rules into a separate asynchronous function to improve modularity and maintainability.

### Fixed
- Minor internal improvements and code cleanup.

## [2.2.2] - 2025-05-20

### Added
- Title attributes to the control buttons.

## [2.2.1] - 2025-05-18

### Changed
- Automatically includes browser and extension version info in the email subject and body.

## [2.2.0] - 2025-05-17

### Added
- Site favicon is now displayed next to the "Block this site" button
- `favIconUrl` parameter added to `createBlockThisSiteButton` for better visual integration

### Fixed
- Fixed potential errors when handling `favIconUrl` if it's missing from the tab

## [2.1.0] - 2025-05-15
### Added
- Added a "Send Feedback" button to the popup for easy email feedback submissions.

### Changed
- Updated popup styles to support the new button with an SVG icon that changes color on hover.

## [2.0.2] - 2025-05-14

### Changed
- Updated UI translations for the following locales: de, en_CA, en_GB, pt_BR, pt_PT, ru, uk, zh_CN, zh_TW

## [2.0.1] - 2025-05-14

### Fixed
- Resolved a critical bug where the "Block This Site" button could create an empty blocking rule (`""`), unintentionally blocking all websites on mobile when no active tab was available

## [2.0.0] - 2025-05-13

### Added
- "Block this site" button for quick rule creation
- Support for partial keyword-based URL blocking
- Fully responsive layout for popup UI

### Changed
- Major UI redesign for improved clarity and usability
- Smarter rule validation and feedback on save
- Popup layout adapts to browser width (horizontal/vertical input alignment)

### Fixed
- Rules no longer fail silently when invalid URLs are entered
- Fixed dynamic rules not applying in some edge cases
- Corrected fallback behaviors for invalid `tabs` access

### Removed
- Deprecated synchronous tab query logic in favor of async-safe alternatives

## [1.36.5] - 2025-04-xx

- Minor UI adjustments
- Fix for inconsistent rule loading in some browser versions