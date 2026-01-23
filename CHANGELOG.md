# Changelog

## [Unreleased] - 2026-01-23

### Added

- **Custom Output Panel UI** - Replaced console logging with a beautiful sliding panel
  - Displays on the right side of the screen
  - Shows player data, SBC requirements, and next steps
  - Can be closed with × button
  - Smooth animations and modern design
  - Auto-scrolls to bottom

- **Background Logging** - All debug logs now sent to background service worker
  - No longer pauses/interferes with the web app
  - View logs in: `chrome://extensions/` → "Service worker" inspector
  - Cleaner and safer than browser console logging

- **Enhanced Data Display**
  - Player count and rating breakdown
  - Detected SBC requirements in formatted view
  - Clear next steps roadmap
  - Color-coded output (success, warning, info, etc.)

### Changed

- Moved from `console.log()` to custom UI panel
- Updated notification message to reference "output panel" instead of "console"

### Technical Details

- Added `displayOutput()` function for panel rendering
- Added `clearOutput()` function to reset panel
- Added `getOutputPanel()` for panel management
- Updated `log()` to send messages via `chrome.runtime.sendMessage()`
- Background service worker now handles LOG message type
- Added comprehensive CSS styling for output panel

## Previous Version

### Features

- Button injection in SBC view
- Network interceptor for player data
- SBC requirement scraper
- Human-like delays
- Chrome storage integration
