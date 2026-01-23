/**
 * FC26 SBC Solver - Popup Script
 * Handles the extension popup UI interactions
 */

// DOM elements
const playerCountEl = document.getElementById("playerCount");
const openWebAppBtn = document.getElementById("openWebApp");
const clearCacheBtn = document.getElementById("clearCache");
const debugToggle = document.getElementById("debugToggle");
const autoSolveToggle = document.getElementById("autoSolveToggle");

// Load player count
function updatePlayerCount() {
  chrome.storage.local.get(["playerClubCache"], (result) => {
    const count = result.playerClubCache?.length || 0;
    playerCountEl.textContent = count;
  });
}

// Load settings
function loadSettings() {
  chrome.storage.local.get(["settings"], (result) => {
    const settings = result.settings || {};

    if (settings.debugMode) {
      debugToggle.classList.add("active");
    }

    if (settings.autoSolve) {
      autoSolveToggle.classList.add("active");
    }
  });
}

// Save setting
function saveSetting(key, value) {
  chrome.storage.local.get(["settings"], (result) => {
    const settings = result.settings || {};
    settings[key] = value;

    chrome.storage.local.set({ settings }, () => {
      console.log("Setting saved:", key, value);
    });
  });
}

// Event Listeners
openWebAppBtn.addEventListener("click", () => {
  chrome.tabs.create({ url: "https://www.ea.com/fifa/ultimate-team/web-app/" });
});

clearCacheBtn.addEventListener("click", () => {
  chrome.storage.local.set({ playerClubCache: [] }, () => {
    updatePlayerCount();
    alert("Cache cleared successfully!");
  });
});

debugToggle.addEventListener("click", () => {
  debugToggle.classList.toggle("active");
  const isActive = debugToggle.classList.contains("active");
  saveSetting("debugMode", isActive);
});

autoSolveToggle.addEventListener("click", () => {
  autoSolveToggle.classList.toggle("active");
  const isActive = autoSolveToggle.classList.contains("active");
  saveSetting("autoSolve", isActive);
});

// Initialize
updatePlayerCount();
loadSettings();

// Update count every 2 seconds
setInterval(updatePlayerCount, 2000);
