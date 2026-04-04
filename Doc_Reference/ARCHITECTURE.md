# WicketUp - Cricket Tournament Scorer Infrastructure

## 🏗️ Technical Architecture

WicketUp is a client-side modern web application designed for high-performance cricket tournament management. It follows a **Single-File Power** philosophy, where the core engine, UI logic, and data persistence reside in specialized modules within a single JavaScript environment.

---

### 1. Data Layer (`Store`)
The storage engine uses a unified **JSON-in-LocalStorage** pattern. This ensures offline capability and instant data persistence without a backend.
- **Persistence Key**: `cricket_scorer_v3`
- **Crucial Operations**: Atomic updates for tournament metadata and match results to prevent data corruption.
- **Relational Mapping**: Tournaments own a flat collection of `matches`, which are dynamically updated as tournament state changes.

### 2. Logic Engine (`Logic`)
The heart of the application, handling all cricket-specific math and conditional logic.
- **Standings Algorithm**: Multi-factor sorting using Points → Net Run Rate (NRR) → Head-to-Head (implied).
- **NRR Calculation**: Implements the international standard formula: `(Runs For / Overs Faced) - (Runs Against / Overs Bowled)`.
- **Dynamic Playoff Qualifiers**: Predictive logic (`isRankConfirmed`) determines if a team has mathematically qualified for playoffs before the league ends.

### 3. Application Core (`app`)
A state-machine that manages the user's journey through the app.
- **State Registry**: Manages `currentTournamentId`, `activeView`, and `scoringState`.
- **Match Grid Manager**: Generates round-robin schedules and implements a custom 2D drag-and-drop reordering system.
- **Knockout Pipelines**: Automates "Winner of Match A vs Winner of Match B" flows for both standard Semi-Final and IPL-style (Qualifiers/Eliminator) formats.

### 4. Scoring Engine (Live Scorer)
The most complex part of the architecture, built on strict **ICC-Standard Cricket Rules**.
- **Legal Ball Validation**: A robust checker ensuring overs consist of exactly 6 legal deliveries.
- **Extra Management**: Smart toggle logic for Wides (WD) and No-Balls (NB) with mutual exclusivity protection.
- **Compensation Balls**: An elastic array system that dynamically expands/contracts based on extras bowled in an over.
- **Innings Transition Logic**: Automated handling of "All Out", "Target Reached (Chased Down)", and "Innings Break" states.

### 5. Export Systems
- **Visual Export**: Uses `html2canvas` for high-resolution PNG snapshots of the dashboard.
- **Document Export**: Utilizes `jsPDF` and `AutoTable` to generate professional tournament reports with branded headers and structured data tables.

---

## 🛠️ Technology Stack
- **Structure**: Semantic HTML5
- **Logic**: Vanilla JavaScript (ES6+)
- **Styling**: Tailwind CSS (Utility-first) + Custom CSS Variables
- **Icons**: FontAwesome 6.4.0
- **Fonts**: Inter (Google Fonts)
- **PDF Generation**: jsPDF + AutoTable
- **Image Capture**: html2canvas
