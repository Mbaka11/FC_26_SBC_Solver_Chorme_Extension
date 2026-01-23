/**
 * FC26 SBC Solver - Background Service Worker
 * Handles extension lifecycle, storage, and communication
 */

// Listen for extension installation
chrome.runtime.onInstalled.addListener((details) => {
  console.log("[FC26 SBC Solver] Extension installed/updated", details);

  if (details.reason === "install") {
    // First time installation
    chrome.storage.local.set({
      playerClubCache: [],
      settings: {
        humanDelayMin: 500,
        humanDelayMax: 1500,
        debugMode: true,
        autoSolve: false,
      },
    });

    // Open welcome page or instructions
    console.log("[FC26 SBC Solver] Welcome! Extension is ready to use.");
  }
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("[FC26 SBC Solver] Message received:", request);

  if (request.type === "SAVE_PLAYER_DATA") {
    // Save player data to storage
    chrome.storage.local.set({ playerClubCache: request.data }, () => {
      console.log(
        "[FC26 SBC Solver] Player data saved:",
        request.data.length,
        "players",
      );
      sendResponse({ success: true });
    });
    return true; // Keep channel open for async response
  }

  if (request.type === "GET_PLAYER_DATA") {
    // Retrieve player data from storage
    chrome.storage.local.get(["playerClubCache"], (result) => {
      console.log(
        "[FC26 SBC Solver] Player data retrieved:",
        result.playerClubCache?.length || 0,
        "players",
      );
      sendResponse({ data: result.playerClubCache || [] });
    });
    return true; // Keep channel open for async response
  }

  if (request.type === "GET_SETTINGS") {
    // Retrieve settings
    chrome.storage.local.get(["settings"], (result) => {
      sendResponse({ settings: result.settings || {} });
    });
    return true;
  }

  if (request.type === "UPDATE_SETTINGS") {
    // Update settings
    chrome.storage.local.set({ settings: request.settings }, () => {
      console.log("[FC26 SBC Solver] Settings updated:", request.settings);
      sendResponse({ success: true });
    });
    return true;
  }
});

// Monitor for web requests (if needed for advanced features)
// Note: Manifest V3 has limitations on webRequest API
chrome.webRequest?.onBeforeRequest.addListener(
  (details) => {
    // We can monitor requests here if needed
    if (details.url.includes("fut.ea.com/ut/game/fc26")) {
      console.log("[FC26 SBC Solver] EA API Request detected:", details.url);
    }
  },
  { urls: ["*://*.ea.com/*", "*://*.fut.ea.com/*"] },
);

// Keep service worker alive (Manifest V3 limitation workaround)
let keepAliveInterval;

function keepAlive() {
  if (keepAliveInterval) clearInterval(keepAliveInterval);

  keepAliveInterval = setInterval(() => {
    chrome.storage.local.get(["playerClubCache"], () => {
      // Just accessing storage keeps the service worker alive
    });
  }, 20000); // Every 20 seconds
}

keepAlive();

console.log("[FC26 SBC Solver] Background service worker initialized");
