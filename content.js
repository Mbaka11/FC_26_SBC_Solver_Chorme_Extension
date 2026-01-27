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

  // First check URL
  const urlIndicatesSBC =
    window.location.href.includes("/sbc") ||
    window.location.href.includes("/squad-building-challenge");

  // Then check DOM
  const sbcIndicators = [
    document.querySelector(".sbc-squad-builder"),
    document.querySelector('[class*="sbc"]'),
    document.querySelector('[class*="challenge"]'),
  ];

  const hasSBCElement = sbcIndicators.some((indicator) => indicator);

  const result = urlIndicatesSBC || hasSBCElement;

  return result;
}

/**
 * Find the best place to inject our button
 */
function findInjectionPoint() {
  // Try to find common UI containers in the EA Web App
  // AVOID temporary overlays like ut-click-shield
  const possibleContainers = [
    document.querySelector(".ut-squad-actions"),
    document.querySelector(".ut-actions"),
    document.querySelector(".sbc-actions"),
    document.querySelector(".challenge-actions"),
    document.querySelector(".ut-navigation-container-view"),
    document.querySelector('[class*="navigation"]'),
    document.querySelector('[class*="header"]:not(.sbc-output-header)'),
    document.querySelector("header"),
    // Last resort - but skip overlays
    Array.from(document.querySelectorAll("body > div")).find(
      (div) =>
        !div.classList.contains("ut-click-shield") &&
        !div.classList.contains("sbc-solver-backdrop") &&
        div.offsetParent !== null, // visible
    ),
  ];

  const result = possibleContainers.find((container) => container !== null);

  if (result) {
    console.log(
      "[FC26 SBC Solver] Found injection point:",
      result.className || result.tagName,
    );
  }

  return result;
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
      // IMPORTANT: Look for "Exactly" keyword first, then check numbered requirements
      
      // Check for "Exactly Bronze/Silver/Gold" pattern FIRST
      const exactlyBronzeMatch = text.match(/Exactly\\s+Bronze/i);
      if (exactlyBronzeMatch && !text.includes('Pack') && !text.includes('Reward') && !requirements.minBronzePlayers) {
        requirements.minBronzePlayers = 1;
        console.log(
          "[FC26 SBC Solver] Found Exactly Bronze requirement:",
          requirements.minBronzePlayers,
        );
      }
      
      const exactlySilverMatch = text.match(/Exactly\\s+Silver/i);
      if (exactlySilverMatch && !text.includes('Pack') && !text.includes('Reward') && !requirements.minSilverPlayers) {
        requirements.minSilverPlayers = 1;
        console.log(
          "[FC26 SBC Solver] Found Exactly Silver requirement:",
          requirements.minSilverPlayers,
        );
      }
      
      const exactlyGoldMatch = text.match(/Exactly\\s+Gold/i);
      if (exactlyGoldMatch && !text.includes('Pack') && !text.includes('Reward') && !requirements.minGoldPlayers) {
        requirements.minGoldPlayers = 1;
        console.log(
          "[FC26 SBC Solver] Found Exactly Gold requirement:",
          requirements.minGoldPlayers,
        );
      }
      
      // Only check for numbered requirements if we haven't found an "Exactly" requirement yet
      // AND this text doesn't contain "Pack" or "Reward"
      if (!text.includes('Pack') && !text.includes('Reward') && !text.includes('For You')) {
        if (!requirements.minSilverPlayers) {
          const silverMatch =
            text.match(/Silver[:\\s]*(?:Minimum[:\\s]*)?(\\d+)\\s*Player/i) ||
            text.match(/(\\d+)\\s*Silver/i);
          if (silverMatch) {
            requirements.minSilverPlayers = parseInt(silverMatch[1]);
            console.log(
              "[FC26 SBC Solver] Found Silver requirement:",
              requirements.minSilverPlayers,
            );
          }
        }

        if (!requirements.minGoldPlayers) {
          const goldMatch =
            text.match(/Gold[:\\s]*(?:Minimum[:\\s]*)?(\\d+)\\s*Player/i) ||
            text.match(/(\\d+)\\s*Gold/i);
          if (goldMatch) {
            requirements.minGoldPlayers = parseInt(goldMatch[1]);
            console.log(
              "[FC26 SBC Solver] Found Gold requirement:",
              requirements.minGoldPlayers,
            );
          }
        }

        if (!requirements.minBronzePlayers) {
          const bronzeMatch =
            text.match(/Bronze[:\\s]*(?:Minimum[:\\s]*)?(\\d+)\\s*Player/i) ||
            text.match(/(\\d+)\\s*Bronze/i);
          if (bronzeMatch) {
            requirements.minBronzePlayers = parseInt(bronzeMatch[1]);
            console.log(
              "[FC26 SBC Solver] Found Bronze requirement:",
              requirements.minBronzePlayers,
            );
          }
        }
      }

      // Extract number of players in squad
      const playersMatch = text.match(
        /(?:Number of Players|Players in (?:the )?Squad)[:\s]*(\d+)/i,
      );
      if (playersMatch) {
        const num = parseInt(playersMatch[1]);
        // Always update if we find an explicit "Number of Players in the Squad" statement
        requirements.numberOfPlayers = num;
        console.log(
          "[FC26 SBC Solver] Found number of players:",
          requirements.numberOfPlayers,
        );
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
 * Automate player search and submission
 */
async function automatePlayerSubmission(requirements) {
  console.log(
    "[FC26 SBC Solver] Starting automation with requirements:",
    requirements,
  );

  try {
    displayOutput(
      '<div class="sbc-output-section-title">🔍 SEARCHING FOR PLAYERS</div>',
    );

    // Step 1: Find empty squad slots
    const emptySlots = findEmptySquadSlots();
    console.log("[FC26 SBC Solver] Found", emptySlots.length, "empty slots");

    if (emptySlots.length === 0) {
      displayOutput(
        '<div class="sbc-output-warning">⚠️ No empty slots found. Squad might be full!</div>',
      );
      return;
    }

    displayOutput(
      `<div class="sbc-output-info">📍 Found ${emptySlots.length} empty slot(s)</div>`,
    );

    // Step 2: For each empty slot, search for the lowest-rated player
    for (
      let i = 0;
      i < Math.min(emptySlots.length, requirements.numberOfPlayers);
      i++
    ) {
      const slot = emptySlots[i];

      displayOutput(
        `<div class="sbc-output-detail">Filling slot ${i + 1}/${requirements.numberOfPlayers}...</div>`,
      );

      await humanDelay();

      // === EXTENSIVE DEBUGGING FOR SLOT CLICK ===
      console.log("[FC26 SBC Solver] ========================================");
      console.log("[FC26 SBC Solver] ATTEMPTING TO CLICK SLOT", i + 1);
      console.log("[FC26 SBC Solver] ========================================");
      console.log("[FC26 SBC Solver] Slot element:", slot);
      console.log("[FC26 SBC Solver] Slot classes:", slot.className);
      console.log("[FC26 SBC Solver] Slot parent:", slot.parentElement?.className);
      console.log("[FC26 SBC Solver] Slot HTML:", slot.outerHTML.substring(0, 200));
      
      // Check if slot is actually clickable
      const slotStyle = window.getComputedStyle(slot);
      console.log("[FC26 SBC Solver] Slot visibility:", slotStyle.visibility);
      console.log("[FC26 SBC Solver] Slot display:", slotStyle.display);
      console.log("[FC26 SBC Solver] Slot pointer-events:", slotStyle.pointerEvents);
      
      // Look for all clickable children
      const clickableChildren = slot.querySelectorAll('button, [role="button"], a, [onclick]');
      console.log("[FC26 SBC Solver] Clickable children found:", clickableChildren.length);
      clickableChildren.forEach((child, idx) => {
        console.log(`[FC26 SBC Solver]   Child ${idx}:`, child.className, child.textContent.trim());
      });

      // Strategy 1: Try clicking the slot itself
      console.log("[FC26 SBC Solver] Strategy 1: Clicking slot directly...");
      slot.click();
      await humanDelay();
      
      // Strategy 2: Try clicking first clickable child
      if (clickableChildren.length > 0) {
        console.log("[FC26 SBC Solver] Strategy 2: Clicking first clickable child...");
        clickableChildren[0].click();
        await humanDelay();
      }
      
      // Strategy 3: Try dispatching mouse events
      console.log("[FC26 SBC Solver] Strategy 3: Dispatching mouse events...");
      slot.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      slot.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      slot.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await humanDelay();

      console.log("[FC26 SBC Solver] All click strategies executed, waiting for panel...");
      await humanDelay();
      await humanDelay(); // Extra wait for panel animation

      // === DEBUG: CHECK WHAT APPEARED AFTER CLICKING ===
      console.log("[FC26 SBC Solver] ========================================");
      console.log("[FC26 SBC Solver] CHECKING FOR PLAYER DETAILS PANEL");
      console.log("[FC26 SBC Solver] ========================================");
      
      // Look for any panels/modals/overlays that appeared
      const possiblePanels = document.querySelectorAll('[class*="panel"], [class*="modal"], [class*="dialog"], [class*="overlay"], [class*="details"]');
      console.log("[FC26 SBC Solver] Found", possiblePanels.length, "panel-like elements");
      possiblePanels.forEach((panel, idx) => {
        if (panel.offsetParent !== null) { // Only visible ones
          console.log(`[FC26 SBC Solver]   Panel ${idx}:`, panel.className);
          console.log(`[FC26 SBC Solver]   Panel text (first 100 chars):`, panel.textContent.substring(0, 100));
        }
      });

      // After clicking slot, Player Details panel appears with "Add Player" button
      // Look for "Add Player" button (could be button, div, or span)
      const addPlayerButtons = Array.from(
        document.querySelectorAll('button, div[role="button"], span[role="button"], .btn-standard, .call-to-action'),
      ).filter((el) => {
        const text = el.textContent.trim();
        return text === "Add Player" && el.offsetParent !== null;
      });

      console.log("[FC26 SBC Solver] Found", addPlayerButtons.length, '"Add Player" buttons');

      if (addPlayerButtons.length === 0) {
        console.log("[FC26 SBC Solver] ❌ Add Player button not found!");
        
        // Debug: show all visible button-like elements with their text
        const allButtons = Array.from(
          document.querySelectorAll('button, div[role="button"], .btn-standard, .call-to-action'),
        )
          .filter((btn) => btn.offsetParent !== null)
          .map((btn) => ({
            text: btn.textContent.trim(),
            class: btn.className,
            tag: btn.tagName
          }))
          .slice(0, 20);
        console.log("[FC26 SBC Solver] All visible button-like elements:");
        console.table(allButtons);
        
        displayOutput(
          '<div class="sbc-output-error">❌ Player Details panel did not open</div>',
        );
        displayOutput(
          '<div class="sbc-output-info">💡 Check console for detailed debugging info</div>',
        );
        continue;
      }

      console.log("[FC26 SBC Solver] ✅ Found Add Player button, clicking...");
      displayOutput(
        '<div class="sbc-output-detail">Clicking Add Player...</div>',
      );
      
      // Log the button we're about to click
      const addPlayerBtn = addPlayerButtons[0];
      console.log("[FC26 SBC Solver] Add Player button details:", addPlayerBtn);
      console.log("[FC26 SBC Solver] Add Player button class:", addPlayerBtn.className);
      console.log("[FC26 SBC Solver] Add Player button HTML:", addPlayerBtn.outerHTML);
      console.log("[FC26 SBC Solver] Add Player button parent:", addPlayerBtn.parentElement?.className);
      
      // Strategy 1: Click the button directly
      console.log("[FC26 SBC Solver] Strategy 1: Direct button click");
      addPlayerBtn.click();
      await humanDelay();
      
      // Strategy 2: Try clicking the parent element (sometimes the button is wrapped)
      if (addPlayerBtn.parentElement && addPlayerBtn.parentElement.tagName !== 'BODY') {
        console.log("[FC26 SBC Solver] Strategy 2: Clicking parent element");
        addPlayerBtn.parentElement.click();
        await humanDelay();
      }
      
      // Strategy 3: Dispatch mouse events on the button
      console.log("[FC26 SBC Solver] Strategy 3: Dispatching mouse events");
      addPlayerBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
      addPlayerBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
      addPlayerBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      await humanDelay();
      
      // Strategy 4: Try finding and clicking the .btn-text span inside
      const btnText = addPlayerBtn.querySelector('.btn-text');
      if (btnText) {
        console.log("[FC26 SBC Solver] Strategy 4: Clicking .btn-text span");
        btnText.click();
        await humanDelay();
      }
      
      console.log("[FC26 SBC Solver] All Add Player click strategies executed");
      
      console.log("[FC26 SBC Solver] Add Player clicked, waiting for Club Search...");
      await humanDelay();
      await humanDelay(); // Extra wait for Club Search to open

      // Now wait for Club Search panel to appear
      console.log("[FC26 SBC Solver] Waiting for Club Search modal...");
      const modal = await waitForSearchModal();

      if (!modal) {
        console.log("[FC26 SBC Solver] ❌ Club Search modal did not appear");
        console.log("[FC26 SBC Solver] Checking if we're still on Player Details panel...");
        
        // Check if "Add Player" button is still visible (means we didn't transition)
        const stillOnDetails = Array.from(
          document.querySelectorAll('button, div[role="button"]')
        ).some(el => el.textContent.trim() === "Add Player" && el.offsetParent !== null);
        
        if (stillOnDetails) {
          console.log("[FC26 SBC Solver] Still on Player Details panel - Add Player click didn't work");
          displayOutput(
            '<div class="sbc-output-error">❌ Add Player button clicked but Club Search didn\'t open</div>',
          );
        } else {
          displayOutput(
            '<div class="sbc-output-error">❌ Failed to open Club Search for slot ' +
              (i + 1) +
              "</div>",
          );
        }
        continue;
      }

      console.log("[FC26 SBC Solver] ✅ Club Search modal opened successfully");
      await humanDelay();

      // FIRST: Apply filters (Quality, Rarity, etc.)
      console.log("[FC26 SBC Solver] Applying filters before search...");
      await applySearchFilters(requirements, modal);
      await humanDelay();

      // SECOND: Click the Search button to load players with filters applied
      console.log("[FC26 SBC Solver] Filters applied, now clicking Search...");
      const searchClicked = await clickSearchButton(modal);

      if (!searchClicked) {
        console.log(
          "[FC26 SBC Solver] No search button found, trying to proceed anyway...",
        );
      }

      // Wait for player list to load after clicking Search
      await humanDelay();
      await humanDelay(); // Extra delay for loading

      // Select first player
      const selected = await selectFirstPlayer(modal);

      if (!selected) {
        displayOutput(
          '<div class="sbc-output-error">❌ Failed to select player for slot ' +
            (i + 1) +
            "</div>",
        );
        continue;
      }

      await humanDelay();

      displayOutput(
        `<div class="sbc-output-success">✅ Slot ${i + 1} filled!</div>`,
      );
    }

    displayOutput('<div class="sbc-output-divider"></div>');
    displayOutput(
      '<div class="sbc-output-success">🎉 All players submitted successfully!</div>',
    );

    if (CONFIG.requireConfirmation) {
      displayOutput(
        '<div class="sbc-output-warning">⚠️ Confirmation required before submitting SBC</div>',
      );
      displayOutput(
        '<div class="sbc-output-info">💡 Review the squad and click Submit manually</div>',
      );
    }
  } catch (error) {
    console.error("[FC26 SBC Solver] Automation error:", error);
    displayOutput(
      `<div class="sbc-output-error">❌ Error: ${error.message}</div>`,
    );
  }
}

/**
 * Find empty squad slots in the current SBC
 */
function findEmptySquadSlots() {
  // Use the actual selector from EA's squad builder - based on logs showing "ut-squad-slot-view"
  const possibleSelectors = [
    ".ut-squad-slot-view", // This is what EA actually uses
    ".ut-squad-slot-pedestal",
    ".sbc-squad-slot",
  ];

  for (const selector of possibleSelectors) {
    const slots = Array.from(document.querySelectorAll(selector));
    console.log(
      `[FC26 SBC Solver] Trying selector "${selector}": found ${slots.length} slots`,
    );

    if (slots.length > 0) {
      // Filter to only empty, unlocked slots
      const emptySlots = slots.filter((slot) => {
        // Skip locked slots
        const isLocked =
          slot.classList.contains("locked") ||
          slot.classList.contains("disabled") ||
          slot.hasAttribute("disabled");
        if (isLocked) return false;

        // Check if slot is empty (no player card inside)
        const hasPlayer = slot.querySelector(
          '.ut-player-item, .player-item, [class*="player-pick"]',
        );
        const isEmpty = !hasPlayer;

        return isEmpty;
      });

      console.log(
        `[FC26 SBC Solver] After filtering: ${emptySlots.length} empty slots`,
      );

      if (emptySlots.length > 0) {
        return emptySlots;
      }
    }
  }

  console.log("[FC26 SBC Solver] No empty slots found with standard selectors");
  return [];
}

/**
 * Wait for Player Details panel to appear after clicking empty slot
 */
async function waitForPlayerDetailsPanel() {
  console.log("[FC26 SBC Solver] Waiting for Player Details panel...");

  const maxAttempts = 10;
  const delayBetweenAttempts = 500;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Strategy 1: Look for button containing "Add Player"
    const addPlayerButtons = Array.from(
      document.querySelectorAll('button, a, [role="button"]'),
    ).filter((el) => {
      const text = el.textContent;
      return text && text.includes("Add Player") && el.offsetParent !== null;
    });

    if (addPlayerButtons.length > 0) {
      console.log(
        "[FC26 SBC Solver] Found Player Details panel via Add Player button",
      );
      displayOutput(
        '<div class="sbc-output-detail">Player Details panel opened</div>',
      );
      return document.body; // Return body since panel exists
    }

    // Strategy 2: Look for "Search on Transfer Market" button
    const transferButtons = Array.from(
      document.querySelectorAll("button, a"),
    ).filter((el) => {
      const text = el.textContent;
      return (
        text && text.includes("Transfer Market") && el.offsetParent !== null
      );
    });

    if (transferButtons.length > 0) {
      console.log(
        "[FC26 SBC Solver] Found Player Details panel via Transfer Market button",
      );
      displayOutput(
        '<div class="sbc-output-detail">Player Details panel opened</div>',
      );
      return document.body;
    }

    await new Promise((resolve) => setTimeout(resolve, delayBetweenAttempts));
  }

  console.log(
    "[FC26 SBC Solver] Player Details panel not found - logging all visible buttons:",
  );
  const allButtons = Array.from(document.querySelectorAll("button, a"))
    .filter((el) => el.offsetParent !== null)
    .map((el) => el.textContent.trim())
    .slice(0, 10);
  console.log("[FC26 SBC Solver] Visible buttons:", allButtons);

  return null;
}

/**
 * Click the "Add Player" button in Player Details panel
 */
async function clickAddPlayerButton() {
  console.log("[FC26 SBC Solver] Looking for Add Player button...");

  // Look for "Add Player" button
  const addPlayerButtons = Array.from(
    document.querySelectorAll('button, div[role="button"], a'),
  ).filter((btn) => {
    const text = btn.textContent;
    return text && text.trim() === "Add Player";
  });

  console.log(
    "[FC26 SBC Solver] Found",
    addPlayerButtons.length,
    "Add Player buttons",
  );

  if (addPlayerButtons.length > 0) {
    console.log("[FC26 SBC Solver] Clicking Add Player button");
    addPlayerButtons[0].click();
    displayOutput('<div class="sbc-output-detail">Clicked Add Player</div>');
    return true;
  }

  console.log("[FC26 SBC Solver] Could not find Add Player button");
  return false;
}

/**
 * Wait for player search interface to appear (opens automatically after clicking slot)
 */
async function waitForSearchModal() {
  console.log("[FC26 SBC Solver] ========================================");
  console.log("[FC26 SBC Solver] WAITING FOR CLUB SEARCH PANEL");
  console.log("[FC26 SBC Solver] ========================================");

  const maxAttempts = 20;
  const delayBetweenAttempts = 500;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Debug on specific attempts
    if (attempt === 0 || attempt === 5 || attempt === 10 || attempt === 15) {
      console.log(`[FC26 SBC Solver] --- Attempt ${attempt + 1}/${maxAttempts} ---`);
      
      // Log all visible text elements to see what's on screen
      const allVisibleText = Array.from(document.querySelectorAll("*"))
        .filter(el => el.offsetParent !== null && el.textContent.trim().length > 0 && el.textContent.trim().length < 50)
        .map(el => el.textContent.trim())
        .filter((text, index, self) => self.indexOf(text) === index) // unique
        .slice(0, 30);
      console.log(`[FC26 SBC Solver] Visible text elements:`, allVisibleText);
      
      // Check specifically for "Club Search" text
      const hasClubSearchText = allVisibleText.includes("Club Search");
      console.log(`[FC26 SBC Solver] "Club Search" text found:`, hasClubSearchText);
      
      // Log all visible panels/modals
      const visiblePanels = Array.from(
        document.querySelectorAll('[class*="panel"], [class*="modal"], [class*="dialog"], [class*="view"]')
      ).filter(el => el.offsetParent !== null)
        .map(el => el.className)
        .slice(0, 10);
      console.log(`[FC26 SBC Solver] Visible panel-like elements:`, visiblePanels);
    }
    
    // Look for "Club Search" text anywhere on the page
    const clubSearchText = Array.from(document.querySelectorAll("*")).find(el => {
      return el.offsetParent !== null && el.textContent.trim() === "Club Search";
    });
    
    if (clubSearchText) {
      console.log("[FC26 SBC Solver] ✅ Found 'Club Search' text on page!");
      console.log("[FC26 SBC Solver] Club Search element:", clubSearchText);
      console.log("[FC26 SBC Solver] Club Search parent:", clubSearchText.parentElement?.className);
      displayOutput('<div class="sbc-output-detail">Club Search opened</div>');
      return document.body;
    }
    
    // Alternative: Look for "My Club" dropdown which appears in Club Search
    const myClubDropdown = Array.from(document.querySelectorAll("*")).find(el => {
      return el.offsetParent !== null && el.textContent.trim() === "My Club";
    });
    
    if (myClubDropdown) {
      console.log("[FC26 SBC Solver] ✅ Found 'My Club' dropdown (Club Search indicator)");
      displayOutput('<div class="sbc-output-detail">Club Search opened</div>');
      return document.body;
    }
    
    // Alternative: Look for specific Club Search UI elements
    const clubSearchElements = document.querySelectorAll(
      '.ut-club-search-results-view, .ut-squad-pitch-view .ut-player-list-view, [class*="club-search"]'
    );
    if (clubSearchElements.length > 0) {
      console.log("[FC26 SBC Solver] ✅ Found Club Search via element selector");
      return document.body;
    }

    await new Promise((resolve) => setTimeout(resolve, delayBetweenAttempts));
  }

  console.log("[FC26 SBC Solver] ❌ Club Search panel not found after timeout");
  console.log("[FC26 SBC Solver] Final state check:");
  
  // Final debug: what's actually visible?
  const finalButtons = Array.from(document.querySelectorAll("button"))
    .filter(btn => btn.offsetParent !== null)
    .map(btn => btn.textContent.trim())
    .slice(0, 15);
  console.log("[FC26 SBC Solver] Final visible buttons:", finalButtons);
  
  displayOutput(
    '<div class="sbc-output-warning">⚠️ Club Search did not appear</div>',
  );
  return null;
}

// Old implementation kept as fallback
async function waitForSearchModal_OLD() {
  console.log("[FC26 SBC Solver] Waiting for search interface to appear...");

  // EA's interface selectors - trying panels, overlays, club search, etc.
  const interfaceSelectors = [
    ".ut-club-search-results-view", // Club search results
    ".ut-unassigned-items-view", // Unassigned items panel
    ".ut-squad-pitch-view .ut-player-list-view", // Player list in squad view
    ".sectioned-item-list", // Sectioned list (common in EA UI)
    ".ut-pinned-list", // Pinned list
    ".ut-item-search-results", // Item search results
    '[class*="club"][class*="search"]', // Any club search element
    '[class*="player"][class*="list"]', // Any player list element
    ".ut-player-search-modal",
    ".ea-dialog-view",
    '[class*="dialog"]',
  ];

  const maxAttempts_OLD = 20;
  const delayBetweenAttempts_OLD = 500;

  for (let attempt = 0; attempt < maxAttempts_OLD; attempt++) {
    for (const selector of interfaceSelectors) {
      const element = document.querySelector(selector);
      if (element && element.offsetParent !== null) {
        console.log("[FC26 SBC Solver] Found search interface:", selector);
        return element;
      }
    }
    await new Promise((resolve) =>
      setTimeout(resolve, delayBetweenAttempts_OLD),
    );
  }

  console.log("[FC26 SBC Solver] Search interface not found");
  return document.body;
}

/**
 * Click the Search button in the Club Search panel to load players
 */
async function clickSearchButton(panel) {
  console.log(
    "[FC26 SBC Solver] Looking for Search button in Club Search panel...",
  );

  // Look for Search button - could be <button>, div, or span with button classes
  const searchButtons = Array.from(
    document.querySelectorAll(
      'button, div[role="button"], span[role="button"], .btn-standard, .call-to-action',
    ),
  ).filter((btn) => {
    const text = btn.textContent.trim();
    return text === "Search" && btn.offsetParent !== null;
  });

  console.log(
    "[FC26 SBC Solver] Found",
    searchButtons.length,
    'element(s) with text "Search"',
  );

  if (searchButtons.length > 0) {
    console.log("[FC26 SBC Solver] ✅ Found Search button");
    console.log("[FC26 SBC Solver] Search button class:", searchButtons[0].className);
    console.log("[FC26 SBC Solver] Clicking Search button...");
    searchButtons[0].click();
    displayOutput('<div class="sbc-output-detail">Searching players...</div>');
    await humanDelay();
    await humanDelay(); // Extra wait for search results to load
    console.log("[FC26 SBC Solver] ✅ Search button clicked, waiting for results...");
    return true;
  }

  console.log("[FC26 SBC Solver] Could not find Search button");
  // Log all visible button-like elements for debugging
  const allButtons = Array.from(
    document.querySelectorAll('button, div[role="button"], .btn-standard'),
  )
    .filter((btn) => btn.offsetParent !== null)
    .map((btn) => btn.textContent.trim())
    .slice(0, 15);
  console.log("[FC26 SBC Solver] Visible button-like elements:", allButtons);
  return false;
}

/**
 * Apply quality filter (Bronze/Silver/Gold) in Club Search
 */
async function applyQualityFilter(quality) {
  console.log(`[FC26 SBC Solver] Applying quality filter: ${quality}`);
  
  // Step 1: Find the Quality filter button
  const qualityFilterControl = Array.from(
    document.querySelectorAll('.ut-search-filter-control')
  ).find(el => {
    const label = el.querySelector('.label');
    return label && label.textContent.trim() === 'Quality';
  });
  
  if (!qualityFilterControl) {
    console.log('[FC26 SBC Solver] ❌ Quality filter control not found');
    displayOutput('<div class="sbc-output-warning">⚠️ Quality filter not found</div>');
    return false;
  }
  
  console.log('[FC26 SBC Solver] ✅ Found Quality filter control');
  
  // Step 2: Click the button to open the dropdown
  const filterButton = qualityFilterControl.querySelector('button.ut-search-filter-control--row-button');
  
  if (!filterButton) {
    console.log('[FC26 SBC Solver] ❌ Quality filter button not found');
    return false;
  }
  
  console.log('[FC26 SBC Solver] Clicking Quality filter button...');
  filterButton.click();
  await humanDelay();
  await humanDelay(); // Extra wait for dropdown to appear
  
  // Step 3: Find and click the quality option (Bronze/Silver/Gold)
  // Quality options are <li> elements with class "with-icon" in an inline list
  const qualityText = quality.charAt(0).toUpperCase() + quality.slice(1); // Capitalize
  
  console.log(`[FC26 SBC Solver] Looking for quality option: ${qualityText}`);
  
  // Look for <li> elements in the inline list
  const qualityOption = Array.from(
    document.querySelectorAll('li.with-icon')
  ).find(el => {
    const text = el.textContent.trim();
    return el.offsetParent !== null && text === qualityText;
  });
  
  if (!qualityOption) {
    console.log(`[FC26 SBC Solver] ❌ Could not find ${qualityText} option in dropdown`);
    
    // Log all visible <li> options for debugging
    const allOptions = Array.from(
      document.querySelectorAll('li.with-icon')
    )
      .filter(el => el.offsetParent !== null)
      .map(el => el.textContent.trim())
      .slice(0, 10);
    console.log('[FC26 SBC Solver] Visible quality options:', allOptions);
    
    displayOutput(`<div class="sbc-output-warning">⚠️ ${qualityText} option not found</div>`);
    return false;
  }
  
  console.log(`[FC26 SBC Solver] ✅ Found ${qualityText} option, clicking...`);
  qualityOption.click();
  await humanDelay();
  
  console.log(`[FC26 SBC Solver] ✅ Quality filter applied: ${qualityText}`);
  return true;
}

/**
 * Apply search filters based on requirements
 */
async function applySearchFilters(requirements, modal) {
  console.log("[FC26 SBC Solver] Applying filters:", requirements);
  displayOutput('<div class="sbc-output-detail">Applying filters...</div>');

  // Apply Bronze/Silver/Gold quality filter if specified
  if (requirements.minBronzePlayers || requirements.minSilverPlayers || requirements.minGoldPlayers) {
    let qualityFilter = null;
    
    if (requirements.minBronzePlayers && requirements.minBronzePlayers > 0) {
      qualityFilter = 'bronze';
      displayOutput('<div class="sbc-output-detail">Filter: Bronze players only</div>');
    } else if (requirements.minSilverPlayers && requirements.minSilverPlayers > 0) {
      qualityFilter = 'silver';
      displayOutput('<div class="sbc-output-detail">Filter: Silver players only</div>');
    } else if (requirements.minGoldPlayers && requirements.minGoldPlayers > 0) {
      qualityFilter = 'gold';
      displayOutput('<div class="sbc-output-detail">Filter: Gold players only</div>');
    }
    
    if (qualityFilter) {
      await applyQualityFilter(qualityFilter);
    }
  }

  // Look for sort button inside modal or on page
  const sortButton =
    (modal ? modal.querySelector('[class*="sort"]') : null) ||
    document.querySelector('[class*="sort"]');

  if (sortButton) {
    console.log("[FC26 SBC Solver] Found sort button, sorting by rating...");
    // Click multiple times to cycle to rating ascending
    for (let i = 0; i < 3; i++) {
      sortButton.click();
      await humanDelay();
    }
  } else {
    console.log("[FC26 SBC Solver] No sort button found");
  }

  // Apply rating filter if specified
  if (requirements.minRating) {
    displayOutput(
      `<div class="sbc-output-detail">Filter: Min Rating ${requirements.minRating}</div>`,
    );
  }

  // In test mode, filter by max rating
  if (CONFIG.testMode) {
    displayOutput(
      `<div class="sbc-output-detail">Test Mode: Max Rating ${CONFIG.maxRatingForTesting}</div>`,
    );
  }
}

/**
 * Select the first player from search results within the modal
 */
async function selectFirstPlayer(modal) {
  console.log("[FC26 SBC Solver] Selecting first player...");

  if (!modal) {
    console.log("[FC26 SBC Solver] No modal provided");
    displayOutput(
      '<div class="sbc-output-warning">⚠️ No search modal available</div>',
    );
    return false;
  }

  // Look for player items inside the container (or entire page if modal = body)
  const playerSelectors = [
    ".ut-player-item",
    ".player-item",
    ".listFUTItem",
    ".ut-item-view",
    '[class*="player"][class*="item"]',
    ".ut-club-item",
    ".itemList .listFUTItem",
  ];

  let playerCards = [];
  for (const selector of playerSelectors) {
    playerCards = Array.from(modal.querySelectorAll(selector));

    // If modal is body, filter out players that are in squad (not in search results)
    if (modal === document.body) {
      playerCards = playerCards.filter((card) => {
        // Exclude cards that are inside squad view
        const inSquad = card.closest(".ut-squad-pitch-view");
        return !inSquad;
      });
    }

    if (playerCards.length > 0) {
      console.log(
        `[FC26 SBC Solver] Found ${playerCards.length} players using: ${selector}`,
      );
      break;
    }
  }

  if (playerCards.length === 0) {
    console.log("[FC26 SBC Solver] No player cards found in search interface");
    console.log("[FC26 SBC Solver] Container classes:", modal.className);
    console.log("[FC26 SBC Solver] Container children:", modal.children.length);

    // Debug: log all visible elements with "item" or "player" in class
    const debugElements = Array.from(
      document.querySelectorAll('[class*="item"], [class*="player"]'),
    )
      .filter((el) => el.offsetParent !== null)
      .map((el) => el.className)
      .slice(0, 20);
    console.log(
      "[FC26 SBC Solver] Visible item/player elements:",
      debugElements,
    );

    displayOutput(
      '<div class="sbc-output-warning">⚠️ No players found in search results</div>',
    );
    return false;
  }

  console.log(
    "[FC26 SBC Solver] Clicking first player:",
    playerCards[0].className,
  );
  console.log(
    "[FC26 SBC Solver] Player card parent:",
    playerCards[0].parentElement?.className,
  );
  
  // Try to get player name from the card
  const playerNameElement = playerCards[0].querySelector('.name');
  const playerName = playerNameElement ? playerNameElement.textContent.trim() : 'Unknown';
  console.log("[FC26 SBC Solver] Player name:", playerName);
  
  // Click the player card - this directly adds them to the squad
  playerCards[0].click();

  console.log(`[FC26 SBC Solver] ✅ Player clicked: ${playerName} - waiting for player to be added to squad...`);
  displayOutput(`<div class="sbc-output-detail">Adding ${playerName} to squad...</div>`);
  
  // Wait for the player to be added to the squad
  await humanDelay();
  await humanDelay(); // Extra wait for UI to update
  
  console.log("[FC26 SBC Solver] Player selection complete");
  return true;
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
    displayOutput(
      '<div class="sbc-output-info">🤖 Starting automatic player search and submission...</div>',
    );

    // Start the automation
    await automatePlayerSubmission(requirements);
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
    console.log(
      "[FC26 SBC Solver] No suitable injection point found, using body",
    );
    log("No suitable injection point found");
    // Fallback to body if no injection point found
    document.body.appendChild((sbcSolverButton = createSolverButton()));
    isInjected = true;
    console.log(
      "[FC26 SBC Solver] SBC Solver button successfully injected to body!",
    );
    log("SBC Solver button successfully injected!");
    showNotification("SBC Solver loaded! Click the button to test.", "success");
    return;
  }

  console.log("[FC26 SBC Solver] Injecting solver button at:", injectionPoint);
  log("Injecting solver button at:", injectionPoint);

  sbcSolverButton = createSolverButton();

  // Always append to body with fixed positioning for stability
  document.body.appendChild(sbcSolverButton);
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
    console.log("[FC26 SBC Solver] Leaving SBC view, removing button");
    console.log("[FC26 SBC Solver] Current URL:", window.location.href);
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
    const inSBCView = isInSBCView();

    // Check if button exists in DOM (might have been removed by EA's app)
    const buttonStillInDOM =
      sbcSolverButton && document.body.contains(sbcSolverButton);

    if (inSBCView && !isInjected) {
      console.log("[FC26 SBC Solver] SBC view detected!");
      log("SBC view detected!");
      injectSolverButton();
    } else if (inSBCView && isInjected && !buttonStillInDOM) {
      // Button was removed from DOM, reset and re-inject
      console.log(
        "[FC26 SBC Solver] Button was removed from DOM, re-injecting...",
      );
      sbcSolverButton = null;
      isInjected = false;
      injectSolverButton();
    } else if (!inSBCView) {
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
