# FC26 SBC Solver Chrome Extension

A Chrome Extension for the EA FC 26 Web App that automatically solves Squad Building Challenges (SBCs) using a constraint solver algorithm.

## Features

- **Automatic Button Injection**: Detects when you are in the SBC view and injects a "Solve SBC" button.
- **Network Interception**: Captures player data from EA's API calls to build a local cache.
- **Human-like Delays**: Implements randomized delays between actions to reduce the risk of soft bans.
- **Modern UI**: A clean, modern gradient design with smooth animations.
- **Debug Mode**: A toggle for console logging during development.
- **Persistent Storage**: Caches player data across browser sessions.

## Project Structure

```
FC26_SBC_Solver/
├── manifest.json
├── content.js
├── interceptor.js
├── background.js
├── styles.css
├── popup.html
├── popup.js
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

## Installation

### For Development

1.  **Clone or download this repository.**

2.  **Add Extension Icons**
    You are required to create three icon files in the `icons/` folder:
    - `icon16.png` (16x16 pixels)
    - `icon48.png` (48x48 pixels)
    - `icon128.png` (128x128 pixels)
      You can use any FC26-related icon or logo.

3.  **Load the Extension in Chrome**
    - Open Chrome and navigate to `chrome://extensions/`.
    - Enable "Developer mode" in the top-right corner.
    - Click "Load unpacked" and select the `FC26_SBC_Solver` folder.
    - The extension will now appear in your extensions list.

4.  **Test the Extension**
    - Navigate to the [EA FC Web App](https://www.ea.com/fifa/ultimate-team/web-app/).
    - Log in and go to the SBC section.
    - A "Solve SBC" button should appear in the top-right corner.
    - Clicking it will test the initial "Hello World" functionality.

## Current Status

### Completed (Phase 1)

- Chrome Manifest V3 setup
- Content script injection
- Button overlay with modern UI
- Network interceptor for player data
- Human-like delay system
- Extension popup with settings
- Local storage for player cache
- Debug mode toggle

### Next Steps (Phase 2)

- **Solver Algorithm**: Implement the constraint-based solver.
  - Parse SBC requirements (rating, chemistry, formation).
  - Implement a backtracking algorithm with optimizations.
  - Minimize card value while meeting constraints.
- **Player Data Parser**: Extract and normalize player attributes.
- **Chemistry Calculator**: Calculate team chemistry based on EA's rules.
- **Auto-Fill Logic**: Programmatically fill squad slots.
- **Progress Tracking**: Show solving progress to the user.
- **Error Handling**: Implement robust error handling and recovery.

### Future Enhancements (Phase 3)

- Multiple solution suggestions
- Cost optimization (cheapest vs. cheapest with high rating)
- Duplicate player handling
- SBC completion history
- Analytics dashboard
- Export/import solutions

## Configuration

The extension can be configured in two ways:

1.  **Popup UI** (by clicking the extension icon)
    - Toggle Debug Mode
    - Toggle Auto Solve (future feature)
    - View cached player count
    - Clear cache

2.  **Code Configuration** (in `content.js`)
    ```javascript
    const CONFIG = {
      debugMode: true,
      buttonCheckInterval: 1000,
      humanDelayMin: 500,
      humanDelayMax: 1500,
    };
    ```

## Safety Features

To reduce the risk of soft bans from EA, the extension includes:

- **Random Delays**: 500-1500ms delays between actions.
- **Human-like Patterns**: Varying timing for different actions.
- **Non-intrusive**: Works alongside the Web App without modifying its core functionality.
- **User-Initiated Actions**: The solver will only run when the user clicks the button.

## How It Works

### 1. Network Interception

The `interceptor.js` script runs in the page context and intercepts `fetch()` and `XMLHttpRequest` calls to filter for EA FC player data endpoints. It then extracts player information like ID, rating, position, and chemistry.

### 2. Button Injection

The `content.js` script monitors the DOM for the SBC view. When the view is detected, it injects a styled button and handles click events, communicating with the background script for data storage.

### 3. Data Storage

Player data is cached in `chrome.storage.local`. An example of the data structure is:

```javascript
{
  "playerClubCache": [...], // Array of player objects
  "settings": {
    "debugMode": true,
    "humanDelayMin": 500,
    "humanDelayMax": 1500
  }
}
```

## Debugging

1.  Open Chrome DevTools (F12) on the EA FC Web App page.
2.  Look for console logs prefixed with `[FC26 SBC Solver]`.
3.  Enable "Debug Mode" in the extension popup for more verbose logging.
4.  Inspect the service worker for background script logs by navigating to `chrome://extensions/`, finding the "FC26 SBC Solver" extension, and clicking on the "Inspect views: service worker" link.

## Important Notes

- **Disclaimer**: This is an unofficial community tool and is not affiliated with EA.
- **Use at your own risk**: While safety features are implemented, you should review EA's terms of service.
- **Local Data**: All player data is stored locally in your browser and is not sent to any external servers.

## Contributing

This is a personal project, but suggestions and improvements are welcome.

## License

This project is licensed under the MIT License. You are free to modify and use the code as needed.

## Credits

Inspired by tools like Paletools, FUT Enhancer, and FUTBin SBC solutions.

---

**Developed for EA FC 26 Web App | Manifest V3 | Vanilla JavaScript**
