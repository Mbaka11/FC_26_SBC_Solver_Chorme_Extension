# FC26 SBC Solver - Development Notes

## Architecture Overview

### File Responsibilities

1. **manifest.json** - Extension configuration
   - Defines permissions (storage, webRequest)
   - Declares content scripts and service worker
   - Sets up web accessible resources

2. **content.js** - Main logic running on EA FC pages
   - Detects SBC view
   - Injects UI button
   - Handles user interactions
   - Communicates with interceptor and background

3. **interceptor.js** - Network traffic interceptor
   - Runs in page context (not isolated)
   - Intercepts fetch/XHR to EA API
   - Extracts player data from responses
   - Posts messages to content script

4. **background.js** - Service worker
   - Manages extension lifecycle
   - Handles message passing
   - Manages persistent storage
   - Keeps service worker alive

5. **styles.css** - UI styling
   - Button and notification styles
   - Modal/panel styles (for future use)
   - Responsive design

6. **popup.html/js** - Extension popup
   - Display cached player count
   - Settings toggles
   - Quick actions

## Next Development Steps

### Phase 2: Solver Algorithm

#### 2.1 SBC Requirements Parser

Create `sbc-parser.js` to extract:

- Formation requirements
- Minimum team rating
- Minimum chemistry
- Player constraints (same league, same nation, same club, etc.)
- Max players from same club/league

Example requirements object:

```javascript
{
  formation: "4-3-3",
  minRating: 84,
  minChemistry: 65,
  constraints: {
    sameLeague: 5,
    sameNation: 3,
    maxFromSameClub: 3
  }
}
```

#### 2.2 Player Data Structure

Normalize player data from EA API:

```javascript
{
  id: 123456,
  name: "Player Name",
  rating: 85,
  position: "ST",
  alternativePositions: ["CF"],
  nation: "England",
  league: "Premier League",
  club: "Manchester United",
  chemistry: {
    links: {...}
  },
  cardType: "gold" // gold/silver/bronze
}
```

#### 2.3 Chemistry Calculator

Create `chemistry.js` to calculate:

- Individual player chemistry
- Team chemistry
- Link types (strong/weak/dead)

EA FC Chemistry rules:

- Strong link: Same club + same nation (3 points)
- Medium link: Same club OR same nation OR same league (1-2 points)
- Icon/Hero players have special chemistry

#### 2.4 Constraint Solver

Create `solver.js` with:

- Backtracking algorithm
- Constraint satisfaction
- Optimization for minimal card value

Pseudocode:

```javascript
function solve(requirements, playerPool) {
  // 1. Filter players by position and rating
  // 2. Try formations that match requirements
  // 3. Use backtracking to place players
  // 4. Calculate chemistry after each placement
  // 5. Prune branches that can't meet requirements
  // 6. Return best solution (lowest card value)
}
```

### Phase 3: DOM Manipulation

#### 3.1 Squad Slot Identification

- Find player slot elements in DOM
- Determine position for each slot
- Handle formation-specific slots

#### 3.2 Auto-Fill Mechanism

- Click on empty slot
- Search for player by ID
- Select player from club
- Implement delays between actions

Example:

```javascript
async function fillSlot(slotElement, playerId) {
  await humanDelay();
  slotElement.click();

  await humanDelay();
  searchPlayer(playerId);

  await humanDelay();
  selectPlayer(playerId);
}
```

### Phase 4: UI Improvements

#### 4.1 Progress Indicator

- Show solving status
- Display current attempt
- Show progress bar

#### 4.2 Solution Preview

- Preview solution before applying
- Show player positions
- Display expected chemistry

#### 4.3 Error Handling

- Handle "no solution found"
- Handle missing players
- Handle connection issues

## Testing Strategy

### Unit Tests

- Chemistry calculator
- Parser logic
- Constraint solver

### Integration Tests

- Test on real SBC challenges
- Verify player data extraction
- Test auto-fill mechanism

### Manual Testing Checklist

- [ ] Button appears in SBC view
- [ ] Button disappears outside SBC view
- [ ] Network interceptor captures player data
- [ ] Data is stored in chrome.storage
- [ ] Popup shows correct player count
- [ ] Settings persist across sessions
- [ ] Human delays work correctly

## EA Web App DOM Structure (To Research)

Need to identify:

- [ ] SBC view container class
- [ ] Squad builder container
- [ ] Player slot selectors
- [ ] Search input selector
- [ ] Player card selector in club
- [ ] Submit button selector

Tools to inspect:

- Chrome DevTools Elements tab
- Console logging
- MutationObserver to watch DOM changes

## Security Considerations

1. **Content Security Policy**
   - Use web_accessible_resources for interceptor
   - Don't inject inline scripts

2. **User Data**
   - Store only necessary data
   - Clear cache option
   - No external API calls

3. **EA Detection Prevention**
   - Random delays
   - Don't query too frequently
   - Mimic human behavior patterns

## Performance Optimization

1. **Solver Performance**
   - Prune impossible branches early
   - Cache chemistry calculations
   - Use efficient data structures (Map/Set)

2. **DOM Performance**
   - Use requestAnimationFrame for animations
   - Debounce button checks
   - Lazy load heavy computations

## Known Limitations

1. **Manifest V3 Constraints**
   - No blocking webRequest
   - Service worker lifecycle
   - Limited background execution

2. **EA Web App**
   - DOM structure may change
   - API endpoints may change
   - Rate limiting

3. **Algorithm Complexity**
   - NP-hard problem
   - May need heuristics for large squads
   - May not always find optimal solution

## Resources

- [Chrome Extension Docs](https://developer.chrome.com/docs/extensions/)
- [Manifest V3 Migration](https://developer.chrome.com/docs/extensions/mv3/intro/)
- [EA FC Chemistry Guide](https://www.ea.com/games/fifa/fifa-23/news/chemistry-fifa-23-ultimate-team)
- [Constraint Satisfaction Problems](https://en.wikipedia.org/wiki/Constraint_satisfaction_problem)

## Questions to Answer

1. How does EA calculate exact chemistry values?
2. What are the exact formation constraints?
3. How to handle substitutes vs starting 11?
4. Should we support "position change" cards?
5. How to handle loyalty bonuses?

---

Last updated: January 23, 2026
