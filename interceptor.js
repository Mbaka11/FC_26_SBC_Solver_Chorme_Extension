/**
 * FC26 SBC Solver - Network Interceptor
 * This script runs in the page context to intercept fetch/XMLHttpRequest calls
 */

(function () {
  "use strict";

  console.log("[FC26 SBC Solver] Network interceptor active");

  // Store original fetch and XMLHttpRequest
  const originalFetch = window.fetch;
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;

  // URLs we're interested in
  const PLAYER_URLS = [
    "/ut/game/fc26/club",
    "/ut/game/fc26/clubsquads",
    "/ut/game/fc26/item",
    "/transfermarket",
    "/club/squad/all",
  ];

  /**
   * Check if URL contains player data
   */
  function isPlayerDataURL(url) {
    return PLAYER_URLS.some((pattern) => url.includes(pattern));
  }

  /**
   * Extract player data from response
   */
  function extractPlayerData(data) {
    try {
      // EA FC Web App typically returns player data in these structures
      if (Array.isArray(data)) {
        return data;
      }

      if (data.items) {
        return data.items;
      }

      if (data.itemData) {
        return Array.isArray(data.itemData) ? data.itemData : [data.itemData];
      }

      if (data.players) {
        return data.players;
      }

      return null;
    } catch (error) {
      console.error("[FC26 SBC Solver] Error extracting player data:", error);
      return null;
    }
  }

  /**
   * Send player data to content script
   */
  function notifyContentScript(playerData) {
    window.postMessage(
      {
        type: "FC26_PLAYER_DATA",
        payload: playerData,
        timestamp: Date.now(),
      },
      "*",
    );
  }

  /**
   * Intercept fetch requests
   */
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);

    try {
      const url = args[0];

      if (typeof url === "string" && isPlayerDataURL(url)) {
        console.log("[FC26 SBC Solver] Intercepted fetch to:", url);

        // Clone response to avoid consuming it
        const clonedResponse = response.clone();
        const data = await clonedResponse.json();

        const playerData = extractPlayerData(data);
        if (playerData) {
          console.log(
            "[FC26 SBC Solver] Found player data:",
            playerData.length,
            "items",
          );
          notifyContentScript(playerData);
        }
      }
    } catch (error) {
      console.error("[FC26 SBC Solver] Error intercepting fetch:", error);
    }

    return response;
  };

  /**
   * Intercept XMLHttpRequest
   */
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._url = url;
    return originalXHROpen.apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    const xhr = this;

    // Listen for response
    xhr.addEventListener("load", function () {
      try {
        if (xhr._url && isPlayerDataURL(xhr._url)) {
          console.log("[FC26 SBC Solver] Intercepted XHR to:", xhr._url);

          if (xhr.responseType === "" || xhr.responseType === "text") {
            const data = JSON.parse(xhr.responseText);
            const playerData = extractPlayerData(data);

            if (playerData) {
              console.log(
                "[FC26 SBC Solver] Found player data:",
                playerData.length,
                "items",
              );
              notifyContentScript(playerData);
            }
          } else if (xhr.responseType === "json") {
            const playerData = extractPlayerData(xhr.response);

            if (playerData) {
              console.log(
                "[FC26 SBC Solver] Found player data:",
                playerData.length,
                "items",
              );
              notifyContentScript(playerData);
            }
          }
        }
      } catch (error) {
        console.error("[FC26 SBC Solver] Error intercepting XHR:", error);
      }
    });

    return originalXHRSend.apply(xhr, args);
  };

  console.log("[FC26 SBC Solver] Network interception initialized");
})();
