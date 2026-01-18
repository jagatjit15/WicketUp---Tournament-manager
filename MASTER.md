# WicketUp - Cricket Tournament Scorer: Master Documentation

**Version**: 1.0  
**Last Updated**: January 2026  
**Status**: Production

---

## Table of Contents

1. [App Overview](#app-overview)
2. [Core Features Breakdown](#core-features-breakdown)
3. [Cricket Rules Engine](#cricket-rules-engine)
4. [Application Architecture](#application-architecture)
5. [UI/UX Flow](#uiux-flow)
6. [Data Models & State](#data-models--state)
7. [Persistence Layer](#persistence-layer)
8. [Known Constraints & Assumptions](#known-constraints--assumptions)
9. [Common Pitfalls & Gotchas](#common-pitfalls--gotchas)
10. [How to Extend Safely](#how-to-extend-safely)
11. [Glossary](#glossary)

---

## App Overview

### What is WicketUp?

**WicketUp** is a real-time cricket tournament scoring application designed for live match tracking and comprehensive tournament management. It enables scorers, tournament organizers, and enthusiasts to:

- Create and manage multi-team cricket tournaments
- Score matches ball-by-ball with real-time accuracy
- Track league standings with automatic Net Run Rate (NRR) calculation
- Generate playoff brackets (IPL-style or Standard format)
- Persist all data locally for offline recovery

### Purpose & Use Cases

**Primary Users:**

- Live cricket match scorers
- Tournament organizers and administrators
- Cricket enthusiasts running community tournaments
- Coaches tracking team performance

**Supported Platforms:**

- Web-based (responsive design)
- Mobile-friendly (tested on tablets and phones)
- Works offline via localStorage persistence
- No backend server required

### Key Differentiators

- **No internet required**: All data stored in browser
- **Ball-by-ball accuracy**: Handles complex cricket rules (wides, no-balls, compensation balls)
- **Automatic tournament flow**: League → Qualifying matches → Final
- **Real-time standings**: Updates instantly as matches complete
- **Visual match bracket**: Graphical representation of playoff progression

---

## Core Features Breakdown

### 1. Tournament Creation & Team Management

**What it does:**

- Create new tournaments with configurable parameters
- Add multiple teams to the tournament
- Select playoff format (IPL-style or Standard)
- Define overs per match

**Where it exists:**

- `renderHome()` - Tournament list view
- Modal overlay with team input form
- `createTournament()` - Tournament instantiation logic
- `generateSchedule()` - Round-robin league match generation
- `initKnockouts()` - Playoff bracket initialization

**Key Business Rules:**

- Minimum 2 teams required to create tournament
- Tournament name is mandatory
- Overs must be a positive number
- Playoff format is selected at creation time
- Two playoff styles supported:
  - **IPL-Style**: Q1 → Eliminator → Q2 → Final
  - **Standard**: SF1 → SF2 → Final

**Data Flow:**

```
User Input → Form Validation → generateSchedule()
→ Round-robin matches created → initKnockouts()
→ Playoff structure added → Store.addTournament()
→ localStorage persisted
```

### 2. Match Scheduling & League Phase

**What it does:**

- Auto-generates round-robin league matches
- Allows match reordering within league phase
- Customizable match labels
- Displays match progress with completion indicators

**Where it exists:**

- `generateSchedule()` - Creates all league matches
- `renderScheduleManager()` - UI for match list management
- `reorderSchedule()` - Drag-and-drop reordering
- `normalizeSchedule()` - Auto-renaming after reorder

**Key Business Rules:**

- Every team plays every other team once (round-robin)
- Match count = (n teams) × (n-1 teams) = n(n-1)
- Matches can be reordered before completion
- Match labels can be customized but revert to auto-format unless locked
- Completed league matches cannot be modified

**Data Structure (Match):**

```javascript
{
  id: unique_id,
  label: "Match 1",
  type: "League",           // League | Qualifier | Semi Final | Final
  t1: "Team A",            // Team 1 name
  t2: "Team B",            // Team 2 name
  t1s: "0",                // Team 1 score
  t1w: "0",                // Team 1 wickets
  t1o: "0.0",              // Team 1 overs (format: X.Y where X=overs, Y=balls)
  t2s: "0",
  t2w: "0",
  t2o: "0.0",
  battingFirst: "t1",      // Which team batted first
  inningsStatus: null,     // null | "1st" | "2nd" | "Innings Break" | "Completed"
  completed: false,
  resultMsg: null,         // Win/Loss/Tie message
  maxOvers: 20,            // Inherited from tournament
  maxWickets: 10           // Standard cricket: 10 wickets
}
```

### 3. Live Scoring Engine (Ball-by-Ball)

**What it does:**

- Real-time selection of runs, wickets, and extras per ball
- Handles all legal and illegal deliveries
- Maintains running score and over count
- Prevents invalid states (e.g., WD + NB on same ball)
- Disables runs input when match won or all out

**Where it exists:**

- `renderLiveScoringGrid()` - Scoring interface with ball options
- `updateGridScore()` - Processes ball selection changes
- `calculateScoringTotals()` - Computes runs, wickets, extras
- `calculateLegalBalls()` - Counts only legal deliveries
- `finishOver()` - Completes over and updates permanent stats

**Ball Options Available:**

- **Runs**: 0, 1, 2, 3, 4, 6
- **Wicket**: W (out)
- **Extras**: WD (Wide), NB (No Ball)

**Key Business Rules:**

- A ball can have multiple selections (e.g., [4, 'NB'] = 4 runs + no-ball notification)
- User cannot select runs if:
  - Match is won (target reached in 2nd innings)
  - All wickets are lost (10 wickets down)
- Extras (WD, NB) are always selectable (for proper scorekeeping)
- A delivery CANNOT be both WD and NB simultaneously

**Scoring State:**

```javascript
scoringState: {
  currentBalls: [null, null, null, null, null, null],  // Array of ball selections
  currentWickets: 0,       // Wickets lost this over
  currentRuns: 0,          // Total runs this over (including extras)
  currentWides: 0,         // Count of wides (for display)
  currentNoballs: 0        // Count of no-balls (for display)
}
```

**Data Flow (Ball Selection):**

```
User clicks ball option
→ updateGridScore(ballIndex, value, isChecked)
→ Validate mutual exclusivity (WD/NB)
→ Update currentBalls array
→ Adjust compensation balls if WD/NB
→ calculateScoringTotals()
→ renderLiveScoringGrid() to refresh UI
```

### 4. Over & Ball Handling Logic

**What it does:**

- Tracks balls within an over (0-6 legal balls)
- Manages compensation balls for extras (WD/NB)
- Converts balls to overs format (X.Y notation)
- Prevents completion of over until all balls selected

**Where it exists:**

- `calculateLegalBalls()` - Counts legal deliveries only
- `updateGridScore()` - Compensation ball insertion/removal
- `finishOver()` - Over completion and persistence
- `oversToBalls()` in Logic - Overs format conversion

**Key Business Rules:**

- An over = exactly 6 legal deliveries
- Wides (WD) and No-Balls (NB) do NOT count as legal deliveries
- Each WD/NB requires one compensation ball
- Example: 2 WDs + 4 legal balls = 8 total balls in array, but only 6 count as "the over"
- Overs display format: `X.Y` where X=complete overs, Y=extra balls (0-5)
- Current over display updates in real-time as balls are selected

**Compensation Ball Logic:**

```javascript
If user marks a delivery as WD:
  1. Check how many WD/NB already exist in this over
  2. Calculate expected array length = 6 + count_of_wd_nb
  3. If array is shorter, insert compensation null balls
  4. Compensation balls are inserted AFTER the delivery, pushing subsequent balls forward

If user deselects WD:
  1. Remove the WD from that delivery's array
  2. Count remaining WD/NB in over
  3. If array is now too long, remove trailing null compensation balls
```

### 5. Wide / No Ball / Compensation Rules

**What it does:**

- Enforces cricket rules for invalid deliveries
- Automatically adds compensation balls
- Prevents impossible delivery combinations
- Tracks extras for match statistics

**Where it exists:**

- `handleWideNoBallToggle()` - Smart mutual exclusivity
- `validateWideAndNoBallMutualExclusivity()` - Validation logic
- `sanitizeDeliveryData()` - Cleanup for legacy data
- `calculateScoringTotals()` - Includes 1 run per extra

**Cricket Rules Implemented:**

| Scenario                  | Behavior           | Runs         | Legal Ball Count   |
| ------------------------- | ------------------ | ------------ | ------------------ |
| Legal delivery (0-6 runs) | Counts toward over | Runs scored  | +1                 |
| Legal wicket (W)          | Counts toward over | 0            | +1                 |
| Wide (WD)                 | Extra not counted  | +1 (penalty) | 0; +1 compensation |
| No Ball (NB)              | Extra not counted  | +1 (penalty) | 0; +1 compensation |
| WD + another value?       | NOT possible       | Invalid      | Error              |

**Anti-Pattern Prevention:**

```javascript
// Cannot exist simultaneously:
["WD", "NB"][ // INVALID - auto-corrected to keep WD, remove NB
  // Valid combinations:
  "4"
]["W"]["WD"]["NB"][("4", "WD")][("0", "W")]; // 4 runs // Out // Wide (1 run, compensation ball added) // No Ball (1 run, compensation ball added) // This triggers warning; treated as 4 runs on WD // Dot on which batsman got out
```

### 6. Match Completion & Result Determination

**What it does:**

- Automatically detects match winners
- Handles both innings
- Implements tiebreaker logic
- Triggers playoff progression

**Where it exists:**

- `finishOver()` - Match completion check after each over
- `updatePlayoffFlow()` - Updates dependent playoff matches
- Result message generation in match object

**Match Completion Scenarios:**

**First Innings Completion:**

- All 10 wickets lost OR
- All overs completed (e.g., 20 overs)

**Second Innings Completion:**

- Batting team reaches target (target = 1st inns score + 1)
- All 10 wickets lost before reaching target
- All overs completed without reaching target

**Result Determination:**

```javascript
1st Innings: Team A: 150/8 (20 overs)
Target for 2nd innings = 151

2nd Innings Outcomes:
- Team B: 152/5 (19 overs) → Team B won
- Team B: 150/10 (19.5 overs) → Tie
- Team B: 145/10 (19.2 overs) → Team A won
```

### 7. Playoff Bracket Generation & Flow

**What it does:**

- Generates playoff structure based on league standings
- Updates qualifying matches dynamically
- Tracks qualified vs eliminated teams
- Renders graphical bracket representation

**Where it exists:**

- `initKnockouts()` - Creates playoff structure
- `generateKnockouts()` - Regenerates if format changed
- `updatePlayoffFlow()` - Updates qualified teams after each playoff match
- `renderBracket()` - Visual bracket display
- `isRankConfirmed()` and `isEliminated()` - Rank qualification logic

**Playoff Formats:**

**IPL Style:**

```
League Phase → Top 4 teams qualified
         ↓
    Qualifier 1
    (1st vs 2nd)
    ↙        ↘
  Winner → Final  Loser ↘
                      ↓
  Eliminator (3rd vs 4th) → Qualifier 2 → Winner → Final
```

**Standard Style:**

```
League Phase → Top 4 teams qualified
         ↓
    SF1: 1st vs 4th        SF2: 2nd vs 3rd
         ↓                      ↓
    Winners ————————→ Final
```

**Dynamic Rank Confirmation:**

- Qualification shown with badge if impossible for lower teams to overtake
- Eliminates teams if mathematically impossible to qualify
- Updates in real-time based on remaining matches

### 8. Points Table & Standings Calculation

**What it does:**

- Calculates league standings after each match
- Computes Net Run Rate (NRR)
- Determines qualification status
- Ranks teams by points then NRR

**Where it exists:**

- `calculateStandings()` in Logic module
- `isRankConfirmed()` and `isEliminated()` helper logic
- Display in dashboard view

**Calculation Formula:**

**Points System (League):**

- Win = 2 points
- Loss = 0 points
- Tie = 1 point each

**NRR Formula:**

```
NRR = (Total Runs Scored / Overs Faced) - (Total Runs Conceded / Overs Bowled)
```

**Ranking Logic:**

1. Sort by total points (descending)
2. If tied on points, sort by NRR (descending)
3. Qualification determined by final rank + remaining matches

**Run Rate Calculation:**

```javascript
runsFor = sum of all runs scored by team
ballsFor = sum of all legal balls faced
oversFor = ballsFor / 6

runsAgainst = sum of all runs conceded
ballsAgainst = sum of legal balls bowled against
oversAgainst = ballsAgainst / 6

NRR = (runsFor / oversFor) - (runsAgainst / oversAgainst)
```

---

## Cricket Rules Engine

This section documents how official cricket rules are implemented in the codebase.

### Legal vs Illegal Deliveries

**Legal Delivery** = Counts toward the over count

- All runs deliveries: 0, 1, 2, 3, 4, 6
- Wicket ball: W
- Gets bonus 6th ball if no-ball

**Illegal Deliveries** = Do NOT count toward over count but trigger compensation

- Wide (WD): Bowled too wide of stumps → +1 compensation ball
- No Ball (NB): Bowled too full/short or front foot over → +1 compensation ball
- Each illegal delivery requires exactly 1 extra delivery

**Code Reference:**

```javascript
calculateLegalBalls: () => {
  // Only counts deliveries that are NOT WD or NB
  const hasLegalDelivery = b.some((val) => val !== "WD" && val !== "NB");
  if (hasLegalDelivery) legalBallCount++;
};
```

### Over Completion & Advancement

**Standard Over:** 6 legal deliveries exactly

**Over with Extras Example:**

```
Selection: [1, WD, 0, 2, NB, 3, 1, 2, 0]
           ↑        ↑        ↑
      Legal balls:  Extra compensation balls

Legal count: 6 (positions 0,2,3,5,6,8)
Array length: 9 (1 standard 6 + 2 compensation balls)
Runs total: 1 + 1(WD) + 0 + 2 + 1(NB) + 3 + 1 + 2 + 0 = 11
```

### Overs Format (X.Y Notation)

Cricket displays overs as `X.Y` where:

- X = number of complete overs
- Y = balls within the over (0-5)

Examples:

- 5.3 = 5 overs and 3 balls
- 10.0 = exactly 10 overs
- 19.5 = 19 overs and 5 balls

**Code Conversion:**

```javascript
Logic.oversToBalls: (overs) => {
  if (!overs) return 0;
  const o = parseFloat(overs);  // e.g., 5.3
  const w = Math.floor(o);       // 5
  return (w * 6) + Math.round((o - w) * 10);  // 5*6 + 3 = 33 balls
}

// Reverse: balls to overs
completedOvers = Math.floor(totalBalls / 6);        // 33 / 6 = 5
remainingBalls = totalBalls % 6;                    // 33 % 6 = 3
oversFormat = completedOvers + (remainingBalls/10); // 5 + 0.3 = 5.3
```

### Free Hit After No-Ball

**Current Implementation:** Not explicitly coded as separate rule.

**Effect in System:**

- No-ball delivers 1 run automatically
- Batsman gets another legal ball (compensation)
- If next delivery is also no-ball, another compensation added

**Business Logic:** System doesn't distinguish "free hit" explicitly but honors the cricket principle that no-ball demands a free delivery.

### Wicket Handling

**When W is selected:**

- Counts as 1 legal delivery toward over count
- Increments wicket counter
- Can co-exist with runs (e.g., [4, 'W'] = caught off 4-run hit)
- Innings can end before over complete if 10th wicket falls

**Innings End Conditions:**

```javascript
endInnings = (wickets >= 10 || overs >= maxOvers)

In 2nd innings, also check:
targetReached = (currentScore >= targetScore)
```

### Edge Cases Handled

1. **Invalid WD + NB combination:**
   - Automatically corrected by removing NB, keeping WD
   - `sanitizeDeliveryData()` cleans legacy data

2. **Partial over when all-out:**
   - If 8th wicket falls on 5th ball of 6-ball over
   - Innings ends immediately without needing 6th ball

3. **Target on last ball:**
   - If target reached exactly on final legal ball
   - Match completes, no extra balls added

4. **Overs format precision:**
   - Stores as string with .1 decimal: "5.3"
   - Always 2-decimal display to prevent float precision issues

---

## Application Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  WicketUp Application                   │
├─────────────────────────────────────────────────────────┤
│  PRESENTATION LAYER (UI Module)                         │
│  ├─ renderHome()                                        │
│  ├─ renderTournamentView()                              │
│  ├─ renderLiveScoringGrid()                             │
│  ├─ renderBracket()                                     │
│  └─ [All render* functions]                             │
├─────────────────────────────────────────────────────────┤
│  STATE MANAGEMENT (App Module)                          │
│  ├─ currentTournamentId                                 │
│  ├─ selectedMatchId                                     │
│  ├─ activeView                                          │
│  ├─ scoringState (current over)                         │
│  └─ [Event handlers & navigation]                       │
├─────────────────────────────────────────────────────────┤
│  BUSINESS LOGIC (Logic Module)                          │
│  ├─ calculateStandings()                                │
│  ├─ oversToBalls()                                      │
│  ├─ isRankConfirmed()                                   │
│  └─ isEliminated()                                      │
├─────────────────────────────────────────────────────────┤
│  PERSISTENCE LAYER (Store Module)                       │
│  ├─ get()  [Read from localStorage]                     │
│  ├─ save() [Write to localStorage]                      │
│  ├─ addTournament()                                     │
│  ├─ updateTournament()                                  │
│  └─ deleteTournament()                                  │
├─────────────────────────────────────────────────────────┤
│  STORAGE MEDIUM                                          │
│  └─ Browser localStorage (key: 'cricket_scorer_v3')     │
└─────────────────────────────────────────────────────────┘
```

### Module Breakdown

#### **Store Module** (Persistence)

**Responsibility:** CRUD operations for tournament data

```javascript
Store = {
  get: () => JSON.parse(localStorage.getItem("cricket_scorer_v3") || "[]"),
  save: (data) =>
    localStorage.setItem("cricket_scorer_v3", JSON.stringify(data)),
  addTournament: (t) => {
    /* push and save */
  },
  updateTournament: (updated) => {
    /* find and update */
  },
  deleteTournament: (id) => {
    /* filter and save */
  },
};
```

**Key Points:**

- All tournaments stored as single JSON array
- No transaction support (atomic writes)
- No conflict resolution (last-write-wins)

#### **Logic Module** (Business Calculations)

**Responsibility:** Cricket rules, standings, rank calculations

**Key Functions:**

- `calculateStandings()` - League table computation
- `oversToBalls()` / `ballsToOvers()` - Format conversion
- `isRankConfirmed()` - Team qualification certainty
- `isEliminated()` - Mathematical elimination check

**Pure Functions:** All return new values, don't mutate input

#### **App Module** (State Management)

**Responsibility:** Application state, navigation, event handling

**State Variables:**

```javascript
{
  currentTournamentId: "1234567890",     // Currently open tournament
  selectedMatchId: 123,                  // Currently scoring match
  activeView: "calculator",              // dashboard | schedule | calculator
  scoringState: { /* current over */ },
  tempTeams: ["Team A", "Team B"],      // Temp storage during tournament creation
  deletePendingId: null                 // For delete confirmation
}
```

**Key Functions:**

- Navigation: `goHome()`, `goBack()`, `openTournament()`, `selectMatch()`
- Scoring: `updateGridScore()`, `finishOver()`
- Tournament: `createTournament()`, `generateSchedule()`

#### **UI Module** (Presentation)

**Responsibility:** DOM manipulation, rendering, modal management

**Naming Convention:** `render[ComponentName]()`

- `renderHome()` - Tournament list
- `renderTournamentView()` - Dashboard/Schedule/Scorer tabs
- `renderDashboardContent()` - League standings + brackets
- `renderLiveScoringGrid()` - Ball-by-ball scoring interface
- `renderBracket()` - Playoff visualization

**Modal Helpers:**

- `openModal()`, `closeModal()` - New tournament
- `openDeleteModal()`, `closeDeleteModal()` - Delete confirmation
- `openUnsavedModal()`, `closeUnsavedModal()` - Unsaved changes warning
- `showAlert()`, `closeAlert()` - Generic alerts

### Data Flow Architecture

**Example: User scores 4 runs on ball 1**

```
1. User clicks "4" checkbox on Ball 1
   ↓
2. HTML fires: onchange="app.updateGridScore(0, 4, true)"
   ↓
3. updateGridScore() validates input
   ├─ Converts value: 4 → 4 (number)
   ├─ Initializes currentBalls[0] as array if needed
   └─ Checks if 4 already in array (dedup)
   ↓
4. Add 4 to currentBalls[0]: [4]
   ↓
5. Call calculateScoringTotals()
   ├─ Iterate all currentBalls
   ├─ For [4], add 4 to runs total
   ├─ Update scoringState: { currentRuns: 4, ... }
   └─ Return
   ↓
6. Fetch current match from Store
   ↓
7. Call renderLiveScoringGrid(match) to re-render
   ├─ Recalculate legalBalls: 1 (4 is legal)
   ├─ Build ball option HTML with [4] marked as checked
   ├─ Display "+4" in "THIS OVER" section
   └─ Re-draw live score display
   ↓
8. UI Updated: User sees ball 1 now shows "4" selected
```

**Data Immutability:**

- `currentBalls` is mutated directly (array of arrays)
- `scoringState` object is replaced wholesale (not mutated properties)
- Tournament/match data written back to Store as full object

### State Mutation Patterns

**Direct Array Mutation (Allowed):**

```javascript
app.scoringState.currentBalls[i].push(4); // Modify ball's options
```

**Object Replacement (Preferred for scoringState):**

```javascript
app.scoringState = {
  currentBalls: [...],
  currentRuns: 4,
  // ...
}
```

**Store Update Pattern:**

```javascript
const tourney = Store.get().find(...);  // Get reference
tourney.matches[0].t1s = "145";          // Mutate
Store.updateTournament(tourney);         // Persist
```

---

## UI/UX Flow

### Navigation Hierarchy

```
Home (Tournament List)
  ↓
Tournament Dashboard (3 Tabs)
  ├─ Dashboard (Standings + Bracket)
  │   └─ Click "Match" → Live Scorer
  ├─ Schedule (Match list + Reorder)
  │   └─ Click "Match" → Live Scorer
  └─ Scorer (Live Ball-by-Ball)
      └─ Click "Back" → Dashboard

Global:
  - "Home" button always returns to tournament list
  - "Back" button returns to previous view
```

### Live Scoring Screen Flow

**Initial State (Before Match Starts):**

- Match setup dialog
  - Input max overs (pre-filled from tournament)
  - Input max wickets (default: 10)
  - Select batting team first
  - Click "Start Match"

**1st Innings:**

```
Display: "1st Innings: Team A"
Score display: T1 Score / T1 Wickets (T1 Overs)
Ball grid: 6 empty ball slots

User interaction:
  - Click ball options (0-6, W, WD, NB)
  - Watch live score update
  - See "THIS OVER: +4/1w" running total

When over complete (6 legal balls):
  - "NEXT OVER" button becomes enabled
  - Click → Completes over, saves to permanent stats
  - Resets scoringState
  - Shows 2nd innings setup OR innings break

If 10 wickets before 6 balls:
  - "NEXT OVER" → "INNINGS ENDED"
  - Auto-proceeds to innings break
```

**Innings Break:**

```
Display: "Innings Break"
Target: "1st Innings Score + 1"
  - Show target for 2nd innings
  - Show runs scored in 1st innings

Button: "Start 2nd Innings"
  - Click → Starts 2nd innings, same scorer interface
  - BUT: Adds target information to score display
```

**2nd Innings:**

```
Display: "2nd Innings: Team B"
        "Target: 152 | Need 145 runs in 120 balls"

Score display: T2 Score / T2 Wickets (T2 Overs)

Same ball-by-ball interface, BUT:
  - Additional target/requirement info
  - When score >= target → Match Won state
  - When 10 wickets before target → Match Lost state

Button: "NEXT OVER" → "MATCH WON" (if target reached)
                   → "ALL OUT" (if 10 wickets)
                   → "NEXT OVER" (if ongoing)
```

### Ball Selection UX

**Interactive Buttons:**

- Each option is a checkbox (hidden input)
- Label styled as button for click area
- Color-coded:
  - Green (0 runs)
  - Yellow (1 run)
  - Blue (2 runs)
  - Pink (3 runs)
  - Indigo (4 runs)
  - Magenta (6 runs)
  - Red (W = Wicket)
  - Orange (WD, NB = Extras)

**Disabled States:**

- When match won: Runs (0-6), W, WD, NB all disabled with reduced opacity
- When all out: Same disabled state
- Disabled buttons show tooltip: "Match already won or all wickets lost"

**Feedback & Validation:**

- Selected options show checkmark via CSS `:checked+label`
- Live score updates in real-time ("THIS OVER: +4")
- Ball dots at top change color when selected
- Conflict indicators show if WD/NB need replacement (faded but clickable)

### Navigation & Back Handling

**Unsaved Changes Protection:**

- When in calculator view with selections in current over
- User clicks "Back" → Check if any balls selected
- If yes → Show modal: "Selections will be RESET. Continue?"
  - "Keep Editing" → Close modal, stay in scorer
  - "Discard" → Reset scoringState, go back to dashboard

**Direct Back:**

- If no unsaved selections → Navigate immediately
- No modal shown

### Error Prevention

**Cannot-Do Scenarios:**

1. Create tournament with < 2 teams
   - "Setup Error: Missing tournament name or teams."
2. Start match while another is in progress
   - "Match In Progress: Please complete it first!"
3. Advance over without all 6 legal balls selected
   - "Incomplete Over: Please complete all legal deliveries. X ball(s) remaining."
4. Select both WD and NB on same delivery
   - Auto-corrected: Deselects one, keeps other

**Confirmations:**

- Delete tournament → Modal confirmation
- Unsaved changes → Modal warning
- Go back with selections → Modal prompt

---

## Data Models & State

### Tournament Object

```javascript
{
  id: "1705604523456",        // Timestamp-based unique ID
  name: "City Champions 2026",
  maxOvers: 20,               // Overs per match
  playoffStyle: "IPL",        // "IPL" or "Standard"
  teams: ["TeamA", "TeamB", "TeamC", "TeamD"],

  matches: [
    { /* Match objects */ }
  ]
}
```

### Match Object

```javascript
{
  id: 1,                       // Unique within tournament
  label: "Match 1",            // Display name (customizable)
  type: "League",              // "League" | "Qualifier" | "Semi Final" | "Final"

  // Teams
  t1: "Team A",                // Team 1 name
  t2: "Team B",                // Team 2 name

  // Team A Stats
  t1s: "145",                  // Team A runs scored
  t1w: "3",                    // Team A wickets lost
  t1o: "19.2",                 // Team A overs used (X.Y format)

  // Team B Stats
  t2s: "148",                  // Team B runs scored
  t2w: "5",                    // Team B wickets lost
  t2o: "18.4",                 // Team B overs used

  // Match State
  battingFirst: "t1",          // Which team batted first ("t1" or "t2")
  inningsStatus: "Completed",  // null | "1st" | "2nd" | "Innings Break" | "Completed"
  completed: true,
  resultMsg: "Team A won!",

  // Configuration
  maxOvers: 20,                // Inherited from tournament
  maxWickets: 10               // Always 10 in cricket
}
```

### Scoring State (Per Over)

```javascript
app.scoringState: {
  currentBalls: [
    [1],              // Ball 1: 1 run
    [4],              // Ball 2: 4 runs
    ["WD"],           // Ball 3: Wide (will trigger compensation)
    [2],              // Ball 4: 2 runs (compensation ball added after Ball 3)
    [0],              // Ball 5: Dot
    ["W"],            // Ball 6: Wicket out
    null              // Compensation ball added due to WD on Ball 3
  ],
  currentWickets: 1,   // 1 wicket lost this over
  currentRuns: 8,      // 1+4+1(WD)+2+0+0 = 8
  currentWides: 1,
  currentNoballs: 0
}
```

**currentBalls Mechanics:**

- Array length = 6 legal balls + compensation balls
- Each element = null (unfilled) or array of selections
- Null after position 5 = compensation balls
- When user marks as WD/NB, a null is inserted at position i+1

### Standings Table Entry

```javascript
{
  name: "Team A",
  p: 3,              // Played
  w: 2,              // Won
  l: 1,              // Lost
  d: 0,              // Draw (ties)
  pts: 4,            // Points: 2 per win, 1 per tie

  runsFor: 425,      // Total runs scored
  ballsFor: 115,     // Total legal balls faced
  runsAgainst: 398,  // Total runs conceded
  ballsAgainst: 112, // Total legal balls bowled

  nrr: 0.456         // Net Run Rate (calculated)
}
```

---

## Persistence Layer

### Storage Key & Format

**localStorage Key:** `'cricket_scorer_v3'`

**Data Format:** JSON string containing array of tournament objects

```javascript
localStorage.cricket_scorer_v3 = '[
  { id: "1705604523456", name: "Tournament 1", ... },
  { id: "1705604612345", name: "Tournament 2", ... }
]'
```

### Draft & Unsaved State Handling

**Current Over (Unsaved):**

- Stored in `app.scoringState` (in-memory only)
- NOT persisted to localStorage
- If user refreshes page → LOST
- If user navigates away → Warning shown

**Permanent Match Data:**

- Only saved when `finishOver()` completes
- At that point, called `Store.updateTournament()`
- Data immediately written to localStorage
- Survives refresh/browser close

### Recovery Behavior

**On Page Refresh:**

1. App initialization: `app.init()` → `ui.renderHome()`
2. Fetch tournaments from Store: `Store.get()`
3. Display all tournaments (fully recovered)
4. Current over data LOST if not saved
5. If match was mid-over:
   - Tournament shows match as in-progress
   - User can click match and resume
   - Scoring grid resets (empty, ready for next over)
   - Previous over's stats intact

**Resuming Mid-Match:**

```
Before refresh: Match at 2.3 overs, current over unsaved
After refresh:
  - Match loaded with state: 2 overs completed, 12 legal balls bowled total
  - Scoring grid shows empty (previous over data lost)
  - User can continue scoring the next over
```

### Back Navigation & Data Loss

**Back to Dashboard with Unsaved:**

- Triggers modal: "Selections will be RESET"
- If user confirms discard:
  ```javascript
  app.scoringState = {
    currentBalls: [null, null, ...],
    currentRuns: 0,
    currentWickets: 0,
    ...
  }
  ```
- Previous over completions (saved via Store) remain untouched
- Only current incomplete over is lost

---

## Known Constraints & Assumptions

### Intentionally NOT Supported

1. **Multiple Innings**: System assumes standard:
   - 1st innings: One team bats
   - 2nd innings: Other team bats
   - T20 formats with third innings = NOT supported

2. **Super Overs**: No support for:
   - Tie-breaking super overs
   - Eliminator super overs

3. **Free Hit Tracking**: Not explicitly tracked:
   - System delivers compensation ball after no-ball
   - Doesn't distinguish which ball is "free hit"
   - User still manually selects each ball

4. **Player-Level Stats**: No support for:
   - Individual batsmen/bowler statistics
   - Strike rates, bowling figures
   - Man of the Match

5. **Ball-by-Ball Commentary**: No support for:
   - Delivery descriptions
   - Camera angles
   - Commentary storage

6. **Live Updates**: No support for:
   - WebSocket/real-time sync across devices
   - Multi-user scoring

7. **Cloud Storage**: All data is:
   - Browser-local only
   - No cloud backup
   - No export functionality

### Assumptions Made

1. **Constant Number of Wickets:**
   - Assumes 10 wickets per team (standard cricket)
   - `maxWickets` hardcoded to 10 in most places

2. **Round-Robin League:**
   - Every team plays every other team exactly once
   - No byes, no double round-robins

3. **Single League Phase:**
   - League matches all played before playoffs
   - No concurrent league + playoff matches

4. **Deterministic Playoff Qualification:**
   - No wildcards or subjective selection
   - Automatically determined by standings

5. **Ball Selection Before Over Completion:**
   - Assumes 6 distinct ball selections needed
   - Cannot skip/leave empty balls

6. **Browser Storage Availability:**
   - Assumes localStorage is available and enabled
   - No graceful degradation if storage full

---

## Common Pitfalls & Gotchas

### 1. Wide/No-Ball Mutual Exclusivity

**Gotcha:** A delivery CANNOT be both WD and NB.

**Where bugs occur:**

- If user selects WD then NB without deselecting WD
- Legacy data loaded with both present

**Safe Code Pattern:**

```javascript
// ✅ Safe: Always sanitize before processing
app.sanitizeDeliveryData(ballArray);

// ❌ Unsafe: Assume data is valid
const wdCount = ballArray.filter((v) => v === "WD").length;
```

**Testing:** Always include test case: Select WD, then try to select NB

### 2. Compensation Ball Array Length

**Gotcha:** Array length = 6 legal balls + number of WD/NB

**Where bugs occur:**

- Assuming array.length always equals 6
- Not recalculating expected length after WD/NB toggle

**Example Bug:**

```javascript
// ❌ WRONG: Assumes 6 balls always
const legalBalls = scoringState.currentBalls.length;

// ✅ CORRECT: Count non-WD/NB selections
const legalBalls = app.calculateLegalBalls();
```

### 3. Overs Format Precision

**Gotcha:** Overs display as "X.Y" but Y represents balls (0-5), not decimals.

**Where bugs occur:**

- Arithmetic on overs strings
- Floating point precision issues

**Example Bug:**

```javascript
// ❌ WRONG: 5.3 is not 5.3, it's 5 overs + 3 balls
const overs = 5.3;
const nextOvers = overs + 0.1;  // Results in 5.4000000001

// ✅ CORRECT: Convert to balls, add, convert back
const balls = Logic.oversToBalls(5.3);     // 33
const nextBalls = balls + 1;               // 34
const nextOvers = (34 / 6) floor + (34 % 6) / 10;  // 5.4
```

### 4. Match Completion & Innings End Conditions

**Gotcha:** Match completion in 2nd innings has multiple conditions:

- Target reached
- All wickets lost
- All overs completed

**Where bugs occur:**

- Not checking all three conditions
- Checking them in wrong order
- Partial over completion when 10th wicket falls

**Safe Pattern:**

```javascript
// ✅ CORRECT: Check all conditions
let endInnings = wickets >= 10 || overs >= maxOvers;

if (inningsStatus === "2nd") {
  targetReached = currentScore >= targetScore;
  if (targetReached) {
    match.completed = true;
    match.winner = currentTeam;
  } else if (endInnings) {
    match.completed = true;
    match.winner = oppositeTeam;
  }
}
```

### 5. Playoffs Not Initializing Until League Complete

**Gotcha:** Playoff matches show "1st Place", "Winner", etc. until league complete, then populate with actual teams.

**Where bugs occur:**

- Assuming playoff matches have real team names before league ends
- Trying to sort playoff opponents before determined

**Bracket Display:**

```javascript
// ✅ CORRECT: Check if team name contains placeholder
const isUndetermined = ["Place", "Winner", "Loser"].some((p) =>
  m.t1.includes(p),
);

if (isUndetermined) {
  // Show placeholder, don't render score
} else {
  // Show actual team match
}
```

### 6. Current Over Data Not Persisted on Page Refresh

**Gotcha:** If user is mid-over when page refreshes, scoring selections are LOST.

**Where bugs occur:**

- Not warning user about unsaved data
- Not implementing auto-save

**User Experience Fix:**

```javascript
// ✅ CORRECT: Check for unsaved data on back/navigation
const hasUnsaved = app.scoringState.currentBalls.some(
  (ball) => Array.isArray(ball) && ball.length > 0,
);

if (hasUnsaved) {
  ui.openUnsavedModal(); // Warn before leaving
}
```

### 7. Rank Confirmation Changes Over Time

**Gotcha:** `isRankConfirmed()` returns different values as league matches progress.

**Where bugs occur:**

- Caching rank confirmation status
- Not recalculating after each match

**Safe Pattern:**

```javascript
// ✅ CORRECT: Recalculate every render
const standings = Logic.calculateStandings(tourney);
const isConfirmed = Logic.isRankConfirmed(standings, rankIndex, tourney);

// ❌ WRONG: Cache this value; it changes!
const cachedIsConfirmed = isRankConfirmed(...);  // Stale after new match
```

---

## How to Extend Safely

### Adding a New Match Format

**Goal:** Support "Test Match" format (max 5 days = unlimited overs)

**Steps:**

1. **Update Tournament Model:**

```javascript
// In createTournament():
const format = document.querySelector('input[name="new-tourney-format"]:checked').value;
// Add to <input> options: value="Test"

// Store format on tournament:
const newTourney = {
  ...,
  matchFormat: format
};
```

2. **Update Match Completion Logic:**

```javascript
// In finishOver():
const maxOvers = match.maxOvers;
let endInnings = wickets >= 10; // Only wickets end test inns, not overs

if (match.format === "Test") {
  endInnings = wickets >= 10; // Never end on overs
} else {
  endInnings = wickets >= 10 || overs >= maxOvers;
}
```

3. **Update UI:**

```javascript
// In renderCalculator():
if (match.format === "Test") {
  // Don't show overs limit in setup
  // Show "Days" interface instead
}
```

4. **Test Coverage:**

- Run 1st innings to completion (all 10 wickets)
- Run 2nd innings with unlimited overs
- Verify match completes correctly

### Adding New Scoring Options (Beyond 0-6, W, WD, NB)

**Goal:** Support "Leg Bye" (LB) and "Bye" (B)

**Steps:**

1. **Update Ball Options:**

```javascript
// In renderLiveScoringGrid():
const ballOptions = [0, 1, 2, 3, 4, 6, "W", "WD", "NB", "B", "LB"]; // Add B, LB
```

2. **Add CSS Classes:**

```css
/* In <style> */
.opt-B label {
  /* Bye color */
}
.opt-LB label {
  /* Leg Bye color */
}
```

3. **Update Calculation Logic:**

```javascript
// In calculateScoringTotals():
} else if (val === 'B' || val === 'LB') {
  // Byes/leg byes: legal delivery, 1 run, no bowler credit
  r += 1;
} else if (typeof val === 'number') {
  // Regular runs
  r += val;
}
```

4. **Validation:**

- Ensure B/LB don't conflict with runs (allow both)
- Ensure B/LB + W combinations work

### Adding a New Playoff Format

**Goal:** Support "Double Elimination" format

**Steps:**

1. **Create New Playoff Generator:**

```javascript
// In app.initKnockouts():
} else if (s === 'DoubleElim') {
  // Add winners bracket matches
  // Add losers bracket matches
  // Track winner/loser of each
}
```

2. **Update updatePlayoffFlow:**

```javascript
// Add logic to populate next round based on results
if (tourney.playoffStyle === "DoubleElim") {
  // Handle losers bracket progression
  // Determine next opponents
}
```

3. **Update Bracket Rendering:**

```javascript
// In renderBracket():
if (tourney.playoffStyle === "DoubleElim") {
  // Render 2 brackets (winners + losers)
}
```

### Modifying Scoring Rules Safely

**General Rules:**

1. **Always Recalculate:** If you change how runs/balls are counted:
   - All affected matches need recalculation
   - Consider adding data migration for existing tournaments

2. **Test Edge Cases:**
   - All wickets on last ball
   - Target reached on last ball
   - Multiple WD/NB in one over

3. **Don't Mutate Shared State:**

```javascript
// ❌ WRONG: Directly mutates tournament
tourney.matches[0].t1s += 5;

// ✅ CORRECT: Create new values for clarity
const match = { ...tourney.matches[0] };
match.t1s = (parseInt(match.t1s) + 5).toString();
tourney.matches[0] = match;
Store.updateTournament(tourney);
```

### Adding New UI Views

**Goal:** Add "Team Stats" view showing player performances

**Steps:**

1. **Add View State:**

```javascript
// In app module:
activeView: "dashboard | schedule | calculator | stats";
```

2. **Update Navigation:**

```javascript
// In renderTournamentView():
const tabs = `...
  <button onclick="app.openTournament('${id}', 'stats')">Stats</button>
  ...`;
```

3. **Create Renderer:**

```javascript
// Add to ui module:
renderTeamStats: (tourney) => {
  // Calculate individual player stats from match data
  // Display in table/chart format
};
```

4. **Wire to Main Render:**

```javascript
// In renderTournamentView():
if (app.activeView === "stats") ui.renderTeamStats(tourney);
```

---

## Glossary

### Cricket Terms (As Used in Code)

| Term                  | Definition                                           | Code Variable                        |
| --------------------- | ---------------------------------------------------- | ------------------------------------ |
| **Over**              | Exactly 6 legal deliveries                           | `overs` (X.Y format)                 |
| **Ball**              | Single delivery from bowler                          | `ball` (array of selections)         |
| **Legal Ball**        | Delivery that counts toward over (not WD/NB)         | Filtered in `calculateLegalBalls()`  |
| **Wide (WD)**         | Illegal delivery (too wide), 1 run + compensation    | `'WD'` in ball array                 |
| **No Ball (NB)**      | Illegal delivery (full/short), 1 run + compensation  | `'NB'` in ball array                 |
| **Wicket (W)**        | Batsman out, legal delivery                          | `'W'` in ball array                  |
| **Runs**              | Scored by batter: 0, 1, 2, 3, 4, 6                   | `[0-6]` in ball array                |
| **Compensation Ball** | Extra delivery after WD/NB                           | `null` after index 5 in currentBalls |
| **Inning**            | One team's turn to bat                               | `inningsStatus` = "1st" or "2nd"     |
| **Innings**           | All of a team's batting (may include multiple turns) | Full match batting period            |
| **All-Out**           | All 10 wickets lost (team must bat out)              | `wickets >= 10`                      |
| **Target**            | 1st innings score + 1                                | `parseInt(match.t1s) + 1`            |
| **NRR**               | Net Run Rate (see calculation section)               | `nrr` in standings                   |

### App-Specific Terms

| Term                  | Definition                                     | Location                            |
| --------------------- | ---------------------------------------------- | ----------------------------------- |
| **Tournament**        | Collection of matches (league + playoffs)      | `app.currentTournamentId`           |
| **Match**             | Single game between two teams                  | `app.selectedMatchId`               |
| **Scoring State**     | Current over's unsaved selections              | `app.scoringState`                  |
| **View**              | Current screen (dashboard/schedule/calculator) | `app.activeView`                    |
| **Batting First**     | Which team bat in 1st innings                  | `match.battingFirst` ("t1" or "t2") |
| **League Phase**      | Round-robin matches                            | `match.type === 'League'`           |
| **Playoff Phase**     | Qualifier/Semi-Final/Final matches             | `match.type !== 'League'`           |
| **Rank Confirmed**    | Team mathematically guaranteed top-4 finish    | `isRankConfirmed()` returns true    |
| **Eliminated**        | Team mathematically cannot reach top-4         | `isEliminated()` returns true       |
| **Compensation Ball** | Extra delivery added after WD/NB               | Array element > index 5             |

### Data Structure Prefixes

| Prefix | Meaning            | Example                |
| ------ | ------------------ | ---------------------- |
| `t1`   | Team 1 stats/info  | `t1s` = Team 1 score   |
| `t2`   | Team 2 stats/info  | `t2w` = Team 2 wickets |
| `s`    | Score (runs)       | `t1s`, `runsFor`       |
| `w`    | Wickets lost       | `t1w`, `ballsAgainst`  |
| `o`    | Overs (X.Y format) | `t1o`, `match.t1o`     |

---

## Document History

| Version | Date     | Changes                        |
| ------- | -------- | ------------------------------ |
| 1.0     | Jan 2026 | Initial complete documentation |

---

## Support & Contributions

For questions about this documentation or to report inaccuracies:

- Review the code against these docs
- Check the "Common Pitfalls" section first
- Test edge cases described in "Cricket Rules Engine"

This documentation represents the **actual implementation** as of the code timestamp. Any code changes should be reflected here to keep docs in sync.
