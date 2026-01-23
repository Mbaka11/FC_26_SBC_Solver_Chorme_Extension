/**
 * FC26 SBC Solver - Chemistry Calculator
 * Implements EA FC 26 chemistry calculation rules
 */

/**
 * Chemistry calculation based on EA FC 26 rules
 * In FC 26, chemistry is based on:
 * - Position matches
 * - Club links
 * - League links
 * - Nation links
 * - Icons/Heroes have special chemistry
 */

const CHEMISTRY_CONFIG = {
  MAX_PLAYER_CHEMISTRY: 3,
  MAX_TEAM_CHEMISTRY: 33, // 11 players * 3 points each

  // Link types
  LINK_STRONG: 2, // Same club + same nation
  LINK_MEDIUM: 1, // Same club OR same nation OR same league
  LINK_DEAD: 0, // No connection

  // Position change penalty
  WRONG_POSITION_PENALTY: 1,
  OUT_OF_POSITION_PENALTY: 3,
};

/**
 * Position compatibility map
 * Shows which positions can play in which other positions with chemistry
 */
const POSITION_COMPATIBILITY = {
  // Goalkeepers
  GK: ["GK"],

  // Defenders
  LWB: ["LWB", "LB", "LM"],
  LB: ["LB", "LWB", "CB"],
  CB: ["CB", "LB", "RB"],
  RB: ["RB", "RWB", "CB"],
  RWB: ["RWB", "RB", "RM"],

  // Midfielders
  LM: ["LM", "LW", "LWB", "CM"],
  CDM: ["CDM", "CM", "CB"],
  CM: ["CM", "CDM", "CAM", "LM", "RM"],
  CAM: ["CAM", "CM", "CF", "LW", "RW"],
  RM: ["RM", "RW", "RWB", "CM"],

  // Forwards
  LW: ["LW", "LM", "LF", "ST"],
  CF: ["CF", "CAM", "ST"],
  ST: ["ST", "CF", "LW", "RW"],
  RW: ["RW", "RM", "RF", "ST"],
  LF: ["LF", "LW", "ST"],
  RF: ["RF", "RW", "ST"],
};

/**
 * Get adjacent positions in formation
 */
function getAdjacentPositions(positionIndex, formation) {
  // This maps position indices to their neighbors
  // Will vary by formation - simplified example for 4-3-3
  const adjacencyMap = {
    0: [1], // GK -> CB
    1: [0, 2, 3, 4], // LB -> GK, CB, CB, LM
    2: [1, 3, 5], // CB -> LB, RB, CDM
    3: [2, 4, 5], // CB -> CB, RB, CDM
    4: [3, 1, 6], // RB -> CB, LB, RM
    5: [2, 3, 7, 8], // CDM -> CB, CB, LW, RW
    6: [4, 5, 9], // LM -> RB, CDM, LW
    7: [5, 8, 10], // CAM -> CDM, RM, ST
    8: [5, 7, 9], // RM -> CDM, CAM, RW
    9: [6, 7, 10], // LW -> LM, CAM, ST
    10: [7, 9, 8], // ST -> CAM, LW, RW
  };

  return adjacencyMap[positionIndex] || [];
}

/**
 * Calculate chemistry link between two players
 */
function calculateLink(player1, player2) {
  if (!player1 || !player2) return CHEMISTRY_CONFIG.LINK_DEAD;

  const sameClub =
    player1.club && player2.club && player1.club === player2.club;
  const sameNation =
    player1.nation && player2.nation && player1.nation === player2.nation;
  const sameLeague =
    player1.league && player2.league && player1.league === player2.league;

  // Strong link: Same club AND same nation
  if (sameClub && sameNation) {
    return CHEMISTRY_CONFIG.LINK_STRONG;
  }

  // Medium link: Same club OR same nation OR same league
  if (sameClub || sameNation || sameLeague) {
    return CHEMISTRY_CONFIG.LINK_MEDIUM;
  }

  // Dead link
  return CHEMISTRY_CONFIG.LINK_DEAD;
}

/**
 * Check if player is in correct position
 */
function isCorrectPosition(playerPosition, slotPosition) {
  if (playerPosition === slotPosition) return "perfect";

  const compatiblePositions = POSITION_COMPATIBILITY[slotPosition] || [];
  if (compatiblePositions.includes(playerPosition)) {
    return "compatible";
  }

  return "wrong";
}

/**
 * Calculate individual player chemistry
 */
function calculatePlayerChemistry(player, positionIndex, squad, formation) {
  let chemistry = 0;

  // Check position match
  const positionMatch = isCorrectPosition(
    player.position,
    squad[positionIndex].position,
  );
  if (positionMatch === "wrong") {
    chemistry -= CHEMISTRY_CONFIG.OUT_OF_POSITION_PENALTY;
  } else if (positionMatch === "compatible") {
    chemistry -= CHEMISTRY_CONFIG.WRONG_POSITION_PENALTY;
  }

  // Get adjacent players
  const adjacentIndices = getAdjacentPositions(positionIndex, formation);

  // Calculate links with adjacent players
  let totalLinks = 0;
  adjacentIndices.forEach((adjIndex) => {
    if (squad[adjIndex] && squad[adjIndex].player) {
      const link = calculateLink(player, squad[adjIndex].player);
      totalLinks += link;
    }
  });

  chemistry += totalLinks;

  // Cap at max player chemistry
  return Math.min(
    Math.max(chemistry, 0),
    CHEMISTRY_CONFIG.MAX_PLAYER_CHEMISTRY,
  );
}

/**
 * Calculate total team chemistry
 */
function calculateTeamChemistry(squad, formation) {
  let totalChemistry = 0;

  squad.forEach((slot, index) => {
    if (slot.player) {
      const playerChem = calculatePlayerChemistry(
        slot.player,
        index,
        squad,
        formation,
      );
      totalChemistry += playerChem;
    }
  });

  return totalChemistry;
}

/**
 * Calculate average team rating
 */
function calculateTeamRating(squad) {
  const players = squad
    .filter((slot) => slot.player)
    .map((slot) => slot.player);
  if (players.length === 0) return 0;

  const totalRating = players.reduce(
    (sum, player) => sum + (player.rating || 0),
    0,
  );
  return Math.round(totalRating / players.length);
}

/**
 * Check if squad meets SBC requirements
 */
function meetsRequirements(squad, requirements) {
  const results = {
    valid: true,
    issues: [],
  };

  const players = squad
    .filter((slot) => slot.player)
    .map((slot) => slot.player);

  // Check team rating
  if (requirements.minRating) {
    const avgRating = calculateTeamRating(squad);
    if (avgRating < requirements.minRating) {
      results.valid = false;
      results.issues.push(
        `Team rating ${avgRating} is below minimum ${requirements.minRating}`,
      );
    }
  }

  // Check chemistry
  if (requirements.minChemistry) {
    const teamChem = calculateTeamChemistry(
      squad,
      requirements.formation || "4-3-3",
    );
    if (teamChem < requirements.minChemistry) {
      results.valid = false;
      results.issues.push(
        `Team chemistry ${teamChem} is below minimum ${requirements.minChemistry}`,
      );
    }
  }

  // Check max players from same league
  if (requirements.maxPlayersFromSameLeague) {
    const leagueCounts = {};
    players.forEach((p) => {
      if (p.league) {
        leagueCounts[p.league] = (leagueCounts[p.league] || 0) + 1;
      }
    });

    const maxLeague = Math.max(...Object.values(leagueCounts), 0);
    if (maxLeague > requirements.maxPlayersFromSameLeague) {
      results.valid = false;
      results.issues.push(
        `Too many players from same league: ${maxLeague} (max ${requirements.maxPlayersFromSameLeague})`,
      );
    }
  }

  // Check max players from same club
  if (requirements.maxPlayersFromSameClub) {
    const clubCounts = {};
    players.forEach((p) => {
      if (p.club) {
        clubCounts[p.club] = (clubCounts[p.club] || 0) + 1;
      }
    });

    const maxClub = Math.max(...Object.values(clubCounts), 0);
    if (maxClub > requirements.maxPlayersFromSameClub) {
      results.valid = false;
      results.issues.push(
        `Too many players from same club: ${maxClub} (max ${requirements.maxPlayersFromSameClub})`,
      );
    }
  }

  // Check max players from same nation
  if (requirements.maxPlayersFromSameNation) {
    const nationCounts = {};
    players.forEach((p) => {
      if (p.nation) {
        nationCounts[p.nation] = (nationCounts[p.nation] || 0) + 1;
      }
    });

    const maxNation = Math.max(...Object.values(nationCounts), 0);
    if (maxNation > requirements.maxPlayersFromSameNation) {
      results.valid = false;
      results.issues.push(
        `Too many players from same nation: ${maxNation} (max ${requirements.maxPlayersFromSameNation})`,
      );
    }
  }

  return results;
}

// Export for use in content script
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    calculateLink,
    calculatePlayerChemistry,
    calculateTeamChemistry,
    calculateTeamRating,
    meetsRequirements,
    CHEMISTRY_CONFIG,
  };
}
