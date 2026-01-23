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

  // URLs we're interested in (EA FC specific endpoints)
  const PLAYER_URLS = [
    "usermassinfo",
    "/ut/game/fc26/club",
    "/ut/game/fc26/clubsquads",
    "/ut/game/fc26/item",
    "/club",
    "/squad",
    "/transfermarket",
  ];

  /**
   * Check if URL contains player data
   */
  function isPlayerDataURL(url) {
    return PLAYER_URLS.some((pattern) => url.includes(pattern));
  }

  /**
   * Extract and sanitize player data from response
   */
  function extractPlayerData(data) {
    try {
      let rawPlayers = null;

      // EA FC Web App typically returns player data in these structures
      if (Array.isArray(data)) {
        rawPlayers = data;
      } else if (data.itemData) {
        rawPlayers = Array.isArray(data.itemData)
          ? data.itemData
          : [data.itemData];
      } else if (data.items) {
        rawPlayers = data.items;
      } else if (data.players) {
        rawPlayers = data.players;
      }

      if (!rawPlayers || rawPlayers.length === 0) {
        return null;
      }

      // Sanitize player data - extract only what we need
      const sanitizedPlayers = rawPlayers
        .map((player) => {
          return {
            id: player.id || player.itemId || player.resourceId,
            rating: player.rating || player.overallRating || 0,
            position: player.position || player.preferredPosition || "Unknown",
            playStyle: player.playStyle || player.playstyles || null,
            untradeable:
              player.untradeable === true || player.tradeable === false,
            // Additional useful data
            name: player.name || "",
            nation: player.nation || player.nationality || null,
            league: player.league || player.leagueId || null,
            club: player.club || player.teamId || null,
            rareType: player.rareflag || player.rareType || 0, // Used to identify card types
          };
        })
        .filter((p) => p.id && p.rating > 0); // Filter out invalid entries

      console.log(
        "[FC26 SBC Solver] Sanitized",
        sanitizedPlayers.length,
        "players",
      );
      return sanitizedPlayers;
    } catch (error) {
      console.error("[FC26 SBC Solver] Error extracting player data:", error);
      return null;
    }
  }

  /**
   * Send player data to content script
   */
  function notifyContentScript(playerData) {
    console.log(
      "[FC26 SBC Solver] Sending player data to content script:",
      playerData.length,
      "players",
    );
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
      const url = typeof args[0] === "string" ? args[0] : args[0]?.url || "";

      if (isPlayerDataURL(url)) {
        console.log("[FC26 SBC Solver] Intercepted fetch to:", url);

        // Clone response to avoid consuming it
        const clonedResponse = response.clone();
        const data = await clonedResponse.json();
        console.log("[FC26 SBC Solver] Response data:", data);

        const playerData = extractPlayerData(data);
        if (playerData && playerData.length > 0) {
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
