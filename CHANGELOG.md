# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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