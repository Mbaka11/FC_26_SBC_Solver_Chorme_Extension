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
  testMode: true, // Safety mode - prevents using high-value players
  maxRatingForTesting: 85, // Never use players above this rating in test mode
  requireConfirmation: true, // Require confirmation before submitting SBC
};

// State management
let sbcSolverButton = null;
let isInjected = false;
let outputPanel = null;
let currentRequirements = null; // Store current SBC requirements

/**
 * Utility: Log with timestamp (sends to background instead of console)
 */
function log(...args) {
  if (!CONFIG.debugMode) return;

  // Send to background service worker for logging
  try {
    // Check if chrome API is available and valid
    if (
      typeof chrome === "undefined" ||
      !chrome ||
      !chrome.runtime ||
      !chrome.runtime.sendMessage
    ) {
      // Chrome API not available, skip logging
      return;
    }

    chrome.runtime
      .sendMessage({
        type: "LOG",
        message: args.join(" "),
        timestamp: new Date().toISOString(),
      })
      .catch(() => {}); // Silently fail if background is not ready
  } catch (e) {
    // Silently fail if chrome API is not available or invalidated
    // This can happen after extension reload
  }
}

/**
 * Create or get the output panel for displaying results
 */
function getOutputPanel() {
  if (outputPanel && document.body.contains(outputPanel)) {
    return outputPanel;
  }

  // Create backdrop
  const backdrop = document.createElement("div");
  backdrop.className = "sbc-solver-backdrop";
  backdrop.id = "sbc-solver-backdrop";
  backdrop.addEventListener("click", () => {
    hideOutputPanel();
  });
  document.body.appendChild(backdrop);

  // Create new panel
  outputPanel = document.createElement("div");
  outputPanel.className = "sbc-solver-output-panel";
  outputPanel.innerHTML = `
    <div class="sbc-output-header">
      <span class="sbc-output-title">⚡ SBC Solver Output</span>
      <button class="sbc-output-close" id="sbc-close-output">×</button>
    </div>
    <div class="sbc-output-body" id="sbc-output-content">
      <div class="sbc-output-placeholder">Click 'Solve SBC' to see results...</div>
    </div>
  `;

  document.body.appendChild(outputPanel);

  // Add close button handler
  document.getElementById("sbc-close-output").addEventListener("click", () => {
    hideOutputPanel();
  });

  return outputPanel;
}

/**
 * Show the output panel
 */
function showOutputPanel() {
  const panel = getOutputPanel();
  const backdrop = document.getElementById("sbc-solver-backdrop");

  if (panel) {
    panel.classList.add("show");
  }
  if (backdrop) {
    backdrop.classList.add("show");
  }
}

/**
 * Hide the output panel
 */
function hideOutputPanel() {
  if (outputPanel) {
    outputPanel.classList.remove("show");
  }
  const backdrop = document.getElementById("sbc-solver-backdrop");
  if (backdrop) {
    backdrop.classList.remove("show");
  }
}

/**
 * Display output in the custom panel
 */
function displayOutput(content) {
  getOutputPanel();
  const contentDiv = document.getElementById("sbc-output-content");

  if (typeof content === "string") {
    contentDiv.innerHTML += `<div class="sbc-output-line">${content}</div>`;
  } else {
    contentDiv.appendChild(content);
  }

  // Show panel with animation
  showOutputPanel();

  // Auto-scroll to bottom
  contentDiv.scrollTop = contentDiv.scrollHeight;
}

/**
 * Clear output panel
 */
function clearOutput() {
  const contentDiv = document.getElementById("sbc-output-content");
  if (contentDiv) {
    contentDiv.innerHTML = "";
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
 * Scrape SBC requirements from the DOM
 */
function getSBCRequirements() {
  console.log("[FC26 SBC Solver] Scraping SBC requirements from DOM...");

  const requirements = {
    minRating: null,
    minChemistry: null,
    maxPlayersFromSameLeague: null,
    maxPlayersFromSameClub: null,
    maxPlayersFromSameNation: null,
    formation: null,
    numberOfPlayers: 11,
    exactLeague: null,
    exactNation: null,
    exactClub: null,
    minGoldPlayers: null,
    minSilverPlayers: null,
    minBronzePlayers: null,
    minRarePlayers: null,
  };

  try {
    // Strategy 1: Look for "Challenge Requirements" section specifically
    // But EXCLUDE our output panel!
    let challengeReqText = "";
    const challengeReqElements = Array.from(
      document.querySelectorAll("*"),
    ).filter((el) => {
      // Skip our output panel
      if (
        el.classList.contains("sbc-solver-output-panel") ||
        el.closest(".sbc-solver-output-panel") ||
        el.id === "sbc-output-content"
      ) {
        return false;
      }
      const text = el.textContent || "";
      return text.includes("Challenge Requirements") && text.length < 1000;
    });

    if (challengeReqElements.length > 0) {
      challengeReqText = challengeReqElements[0].textContent || "";
      console.log(
        "[FC26 SBC Solver] Found Challenge Requirements section:",
        challengeReqText,
      );
    }

    // Strategy 2: Get all requirement elements (excluding output panel)
    const requirementElements = Array.from(
      document.querySelectorAll(
        '[class*="requirement"], [class*="constraint"], [class*="criteria"], [class*="sbc"], [class*="challenge"]',
      ),
    ).filter((el) => {
      return (
        !el.classList.contains("sbc-solver-output-panel") &&
        !el.closest(".sbc-solver-output-panel")
      );
    });

    console.log(
      "[FC26 SBC Solver] Found",
      requirementElements.length,
      "requirement elements",
    );

    // Combine challenge requirements text with other elements
    const allTexts = [challengeReqText];

    requirementElements.forEach((el) => {
      const text = el.textContent || el.innerText || "";
      if (text && !allTexts.includes(text)) {
        allTexts.push(text);
      }
    });

    // Process all requirement texts
    allTexts.forEach((text) => {
      if (!text || text.length === 0) return;

      // Log each text for debugging
      if (text.length < 200) {
        console.log("[FC26 SBC Solver] Checking text:", text);
      }

      // Extract Min Team Rating
      const ratingMatch = text.match(
        /(?:Min\.?|Minimum)\s*(?:Team\s*)?Rating[:\s]*(\d+)/i,
      );
      if (ratingMatch) {
        requirements.minRating = parseInt(ratingMatch[1]);
        console.log(
          "[FC26 SBC Solver] Found Min Rating:",
          requirements.minRating,
        );
      }

      // Extract Min Chemistry
      const chemMatch = text.match(
        /(?:Min\.?|Minimum)\s*(?:Team\s*)?Chem(?:istry)?[:\s]*(\d+)/i,
      );
      if (chemMatch) {
        requirements.minChemistry = parseInt(chemMatch[1]);
        console.log(
          "[FC26 SBC Solver] Found Min Chemistry:",
          requirements.minChemistry,
        );
      }

      // Extract Silver/Gold/Bronze requirements (new patterns)
      const silverMatch =
        text.match(/Silver[:\s]*(?:Minimum[:\s]*)?(\d+)\s*Player/i) ||
        text.match(/(\d+)\s*Silver/i);
      if (silverMatch) {
        requirements.minSilverPlayers = parseInt(silverMatch[1]);
        console.log(
          "[FC26 SBC Solver] Found Silver requirement:",
          requirements.minSilverPlayers,
        );
      }

      const goldMatch =
        text.match(/Gold[:\s]*(?:Minimum[:\s]*)?(\d+)\s*Player/i) ||
        text.match(/(\d+)\s*Gold/i);
      if (goldMatch) {
        requirements.minGoldPlayers = parseInt(goldMatch[1]);
        console.log(
          "[FC26 SBC Solver] Found Gold requirement:",
          requirements.minGoldPlayers,
        );
      }

      const bronzeMatch =
        text.match(/Bronze[:\s]*(?:Minimum[:\s]*)?(\d+)\s*Player/i) ||
        text.match(/(\d+)\s*Bronze/i);
      if (bronzeMatch) {
        requirements.minBronzePlayers = parseInt(bronzeMatch[1]);
        console.log(
          "[FC26 SBC Solver] Found Bronze requirement:",
          requirements.minBronzePlayers,
        );
      }

      // Extract number of players in squad
      const playersMatch = text.match(
        /(?:Number of Players|Players in Squad)[:\s]*(\d+)/i,
      );
      if (playersMatch) {
        const num = parseInt(playersMatch[1]);
        // Only update if it's not the default 11 or if it's explicitly stated
        if (num !== 11 || text.toLowerCase().includes("number of players")) {
          requirements.numberOfPlayers = num;
          console.log(
            "[FC26 SBC Solver] Found number of players:",
            requirements.numberOfPlayers,
          );
        }
      }

      // Extract Max Players from Same League
      const leagueMaxMatch = text.match(
        /(?:Max\.?|Maximum)\s*(?:Players\s*)?(?:from\s*)?Same\s*League[:\s]*(\d+)/i,
      );
      if (leagueMaxMatch) {
        requirements.maxPlayersFromSameLeague = parseInt(leagueMaxMatch[1]);
        console.log(
          "Found Max Same League:",
          requirements.maxPlayersFromSameLeague,
        );
      }

      // Extract Max Players from Same Club
      const clubMaxMatch = text.match(
        /(?:Max\.?|Maximum)\s*(?:Players\s*)?(?:from\s*)?Same\s*(?:Club|Team)[:\s]*(\d+)/i,
      );
      if (clubMaxMatch) {
        requirements.maxPlayersFromSameClub = parseInt(clubMaxMatch[1]);
        console.log(
          "Found Max Same Club:",
          requirements.maxPlayersFromSameClub,
        );
      }

      // Extract Max Players from Same Nation
      const nationMaxMatch = text.match(
        /(?:Max\.?|Maximum)\s*(?:Players\s*)?(?:from\s*)?Same\s*(?:Nation|Country)[:\s]*(\d+)/i,
      );
      if (nationMaxMatch) {
        requirements.maxPlayersFromSameNation = parseInt(nationMaxMatch[1]);
        console.log(
          "[FC26 SBC Solver] Found Max Same Nation:",
          requirements.maxPlayersFromSameNation,
        );
      }

      // Extract formation (e.g., "4-3-3", "4-4-2")
      const formationMatch = text.match(/\b(\d{1}-\d{1}-\d{1}(?:-\d{1})?)\b/);
      if (formationMatch) {
        requirements.formation = formationMatch[1];
        console.log("Found Formation:", requirements.formation);
      }
    });

    console.log("[FC26 SBC Solver] Scraped SBC Requirements:");
    console.log(JSON.stringify(requirements, null, 2)); // Pretty print JSON
    console.table(requirements); // Show as table for easy viewing
    return requirements;
  } catch (error) {
    console.error("[FC26 SBC Solver] Error scraping SBC requirements:", error);
    log("Error scraping SBC requirements:", error);
    return requirements;
  }
}

/**
 * Handle the solve button click
 */
async function handleSolveClick(event) {
  event.preventDefault();
  log("Solve button clicked!");

  // If panel already has content and is hidden, just show it
  const contentDiv = document.getElementById("sbc-output-content");
  if (
    contentDiv &&
    contentDiv.children.length > 1 &&
    !outputPanel?.classList.contains("show")
  ) {
    showOutputPanel();
    return;
  }

  const button = event.currentTarget;
  button.disabled = true;
  button.classList.add("solving");
  button.innerHTML = `
    <span class="sbc-solver-icon">⏳</span>
    <span class="sbc-solver-text">Solving...</span>
  `;

  try {
    // Clear previous output
    clearOutput();

    await humanDelay();

    // Step 2: Scrape SBC requirements from the page
    displayOutput(
      '<div class="sbc-output-section-title">📋 SBC REQUIREMENTS DETECTED</div>',
    );
    displayOutput(
      '<div class="sbc-output-info">🤖 Bot will automatically search and build the squad for you!</div>',
    );

    const requirements = getSBCRequirements();
    currentRequirements = requirements; // Store for later use

    // Check what requirements were found
    const foundRequirements = Object.entries(requirements).filter(
      ([key, value]) => value !== null && value !== undefined,
    );

    if (foundRequirements.length > 0) {
      foundRequirements.forEach(([key, value]) => {
        // Format the key nicely
        const displayKey = key
          .replace(/([A-Z])/g, " $1")
          .replace(/^./, (str) => str.toUpperCase())
          .trim();

        // Format the value nicely
        let displayValue = value;
        if (typeof value === "object") {
          displayValue = JSON.stringify(value);
        }

        displayOutput(
          `<div class="sbc-output-requirement">• ${displayKey}: <strong>${displayValue}</strong></div>`,
        );
      });

      // Add chemistry calculation example
      displayOutput('<div class="sbc-output-divider"></div>');
      displayOutput(
        '<div class="sbc-output-info">⚗️ Chemistry Calculator is ready!</div>',
      );

      // Show test mode warning if enabled
      if (CONFIG.testMode) {
        displayOutput(
          `<div class="sbc-output-warning">🛡️ TEST MODE: Will only use players rated ${CONFIG.maxRatingForTesting} or below</div>`,
        );
      }
    } else {
      displayOutput(
        '<div class="sbc-output-warning">⚠️ No requirements detected. DOM structure may have changed.</div>',
      );
    }

    await humanDelay();

    // Show success notification
    showNotification(
      `Requirements detected: ${requirements.numberOfPlayers} player(s) needed`,
      "success",
    );

    // Log next steps
    displayOutput('<div class="sbc-output-section-title">🚀 STATUS</div>');
    displayOutput(
      '<div class="sbc-output-success">✅ Requirements detected!</div>',
    );
    displayOutput(
      `<div class="sbc-output-info">🔍 Bot will search for ${requirements.numberOfPlayers} player(s) matching requirements</div>`,
    );
    displayOutput('<div class="sbc-output-divider"></div>');
    displayOutput(
      '<div class="sbc-output-info">🤖 Next: DOM manipulation to search & submit players automatically</div>',
    );

    // Test chemistry calculator
    displayOutput(
      '<div class="sbc-output-section-title">⚗️ CHEMISTRY CALCULATOR TEST</div>',
    );
    if (typeof calculateTeamChemistry === "function") {
      displayOutput(
        '<div class="sbc-output-success">✅ Chemistry calculator loaded successfully!</div>',
      );
      displayOutput(
        '<div class="sbc-output-detail">Ready to calculate player links and team chemistry</div>',
      );
    } else {
      displayOutput(
        '<div class="sbc-output-warning">⚠️ Chemistry calculator not loaded</div>',
      );
    }

    displayOutput('<div class="sbc-output-divider"></div>');
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
    console.log("[FC26 SBC Solver] Button already injected, skipping...");
    log("Button already injected, skipping...");
    return;
  }

  const injectionPoint = findInjectionPoint();

  if (!injectionPoint) {
    console.log("[FC26 SBC Solver] No suitable injection point found");
    log("No suitable injection point found");
    return;
  }

  console.log("[FC26 SBC Solver] Injecting solver button at:", injectionPoint);
  log("Injecting solver button at:", injectionPoint);

  sbcSolverButton = createSolverButton();
  injectionPoint.appendChild(sbcSolverButton);
  isInjected = true;

  console.log("[FC26 SBC Solver] SBC Solver button successfully injected!");
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
  console.log("[FC26 SBC Solver] Starting to monitor for SBC view...");
  setInterval(() => {
    if (isInSBCView() && !isInjected) {
      console.log("[FC26 SBC Solver] SBC view detected!");
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
  try {
    if (
      typeof chrome !== "undefined" &&
      chrome.runtime &&
      chrome.runtime.getURL
    ) {
      const script = document.createElement("script");
      script.src = chrome.runtime.getURL("interceptor.js");
      script.onload = function () {
        console.log("[FC26 SBC Solver] Interceptor script loaded successfully");
        this.remove();
      };
      script.onerror = function (error) {
        console.error("[FC26 SBC Solver] Failed to load interceptor:", error);
      };
      (document.head || document.documentElement).appendChild(script);
      console.log("[FC26 SBC Solver] Injecting network interceptor...");
      log("Network interceptor injected");
    }
  } catch (e) {
    console.error("[FC26 SBC Solver] Could not inject interceptor:", e);
    log("Could not inject interceptor:", e.message);
  }
}

/**
 * Listen for messages from the interceptor
 */
window.addEventListener("message", (event) => {
  if (event.source !== window) return;

  // Check if event.data exists and has a type
  if (!event.data || !event.data.type) {
    return; // Ignore messages without proper structure
  }

  console.log("[FC26 SBC Solver] Message received:", event.data.type);

  if (event.data.type === "FC26_PLAYER_DATA") {
    console.log(
      "[FC26 SBC Solver] Player data received from interceptor:",
      event.data.payload?.length,
      "players",
    );
    log("Received player data:", event.data.payload?.length);
    // Note: We're not caching anymore - bot will search directly on EA's interface
  }
});

/**
 * Initialize the extension
 */
function init() {
  // Add global error handler for chrome API issues
  window.addEventListener("error", (e) => {
    if (e.message && e.message.includes("chrome")) {
      // Silently handle chrome API errors (usually after extension reload)
      e.preventDefault();
      return true;
    }
  });

  console.log("[FC26 SBC Solver] ========================================");
  console.log("[FC26 SBC Solver] Extension initializing...");
  console.log("[FC26 SBC Solver] Current URL:", window.location.href);
  console.log("[FC26 SBC Solver] ========================================");
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
