/**
 * FC26 SBC Solver - Content Script
 * This script runs on the EA FC Web App pages and injects the solver UI
 */

// Configuration
const CONFIG = {
  debugMode: true,
  buttonCheckInterval: 1000, // Check for SBC view every second
  humanDelayMin: 500, // Minimum delay between actions (ms)
  humanDelayMax: 1500, // Maximum delay between actions (ms)
};

// State management
let sbcSolverButton = null;
let isInjected = false;
let playerClubCache = [];

/**
 * Utility: Log with timestamp
 */
function log(...args) {
  if (CONFIG.debugMode) {
    console.log("[FC26 SBC Solver]", new Date().toISOString(), ...args);
  }
}

/**
 * Utility: Human-like delay
 */
function humanDelay() {
  const delay =
    Math.random() * (CONFIG.humanDelayMax - CONFIG.humanDelayMin) +
    CONFIG.humanDelayMin;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * Check if we're in the SBC view
 */
function isInSBCView() {
  // EA FC Web App typically has specific elements in the SBC view
  // These selectors may need to be updated based on actual DOM structure
  const sbcIndicators = [
    document.querySelector(".sbc-squad-builder"),
    document.querySelector('[class*="sbc"]'),
    document.querySelector('[class*="challenge"]'),
    // Check URL as well
    window.location.href.includes("/sbc") ||
      window.location.href.includes("/squad-building-challenge"),
  ];

  return sbcIndicators.some((indicator) => indicator);
}

/**
 * Find the best place to inject our button
 */
function findInjectionPoint() {
  // Try to find common UI containers in the EA Web App
  const possibleContainers = [
    document.querySelector(".ut-squad-actions"),
    document.querySelector(".ut-actions"),
    document.querySelector(".sbc-actions"),
    document.querySelector(".challenge-actions"),
    document.querySelector('[class*="action"]'),
    document.querySelector(".ut-navigation-container-view"),
    document.querySelector("header"),
    document.body,
  ];

  return possibleContainers.find((container) => container !== null);
}

/**
 * Create the SBC Solver button
 */
function createSolverButton() {
  const button = document.createElement("button");
  button.id = "sbc-solver-btn";
  button.className = "sbc-solver-button";
  button.innerHTML = `
    <span class="sbc-solver-icon">⚡</span>
    <span class="sbc-solver-text">Solve SBC</span>
  `;

  button.addEventListener("click", handleSolveClick);

  return button;
}

/**
 * Handle the solve button click
 */
async function handleSolveClick(event) {
  event.preventDefault();
  log("Solve button clicked!");

  const button = event.currentTarget;
  button.disabled = true;
  button.classList.add("solving");
  button.innerHTML = `
    <span class="sbc-solver-icon">⏳</span>
    <span class="sbc-solver-text">Solving...</span>
  `;

  try {
    // TODO: Implement the actual solving logic
    await humanDelay();
    log("Solve logic will be implemented here");

    // Show success message
    showNotification("Hello World! SBC Solver is working!", "success");
  } catch (error) {
    log("Error during solve:", error);
    showNotification("Error: " + error.message, "error");
  } finally {
    // Reset button
    await humanDelay();
    button.disabled = false;
    button.classList.remove("solving");
    button.innerHTML = `
      <span class="sbc-solver-icon">⚡</span>
      <span class="sbc-solver-text">Solve SBC</span>
    `;
  }
}

/**
 * Show notification to user
 */
function showNotification(message, type = "info") {
  const notification = document.createElement("div");
  notification.className = `sbc-solver-notification sbc-notification-${type}`;
  notification.textContent = message;

  document.body.appendChild(notification);

  // Auto-remove after 3 seconds
  setTimeout(() => {
    notification.classList.add("fade-out");
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

/**
 * Inject the solver button into the page
 */
function injectSolverButton() {
  if (isInjected || sbcSolverButton) {
    log("Button already injected, skipping...");
    return;
  }

  const injectionPoint = findInjectionPoint();

  if (!injectionPoint) {
    log("No suitable injection point found");
    return;
  }

  log("Injecting solver button at:", injectionPoint);

  sbcSolverButton = createSolverButton();
  injectionPoint.appendChild(sbcSolverButton);
  isInjected = true;

  log("SBC Solver button successfully injected!");
  showNotification("SBC Solver loaded! Click the button to test.", "success");
}

/**
 * Remove the button if we're not in SBC view anymore
 */
function cleanupButton() {
  if (sbcSolverButton && !isInSBCView()) {
    log("Leaving SBC view, removing button");
    sbcSolverButton.remove();
    sbcSolverButton = null;
    isInjected = false;
  }
}

/**
 * Monitor for SBC view and inject button when appropriate
 */
function monitorForSBCView() {
  setInterval(() => {
    if (isInSBCView() && !isInjected) {
      log("SBC view detected!");
      injectSolverButton();
    } else {
      cleanupButton();
    }
  }, CONFIG.buttonCheckInterval);
}

/**
 * Inject the network interceptor script
 * This will allow us to capture player data from API calls
 */
function injectNetworkInterceptor() {
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("interceptor.js");
  script.onload = function () {
    this.remove();
  };
  (document.head || document.documentElement).appendChild(script);
  log("Network interceptor injected");
}

/**
 * Listen for messages from the interceptor
 */
window.addEventListener("message", (event) => {
  if (event.source !== window) return;

  if (event.data.type === "FC26_PLAYER_DATA") {
    log("Received player data:", event.data.payload);
    playerClubCache = event.data.payload;

    // Store in chrome.storage for persistence
    chrome.storage.local.set({ playerClubCache: event.data.payload });
  }
});

/**
 * Initialize the extension
 */
function init() {
  log("FC26 SBC Solver initializing...");

  // Inject network interceptor
  injectNetworkInterceptor();

  // Start monitoring for SBC view
  monitorForSBCView();

  // Try immediate injection if we're already in SBC view
  if (isInSBCView()) {
    setTimeout(injectSolverButton, 1000);
  }

  log("FC26 SBC Solver initialized!");
}

// Start the extension when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
