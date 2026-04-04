
// --- SECURITY UTILITIES ---
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// --- DATA ENGINE ---
const Store = {
    get: () => { try { const d = JSON.parse(localStorage.getItem('cricket_scorer_v3') || '[]'); return Array.isArray(d) ? d : []; } catch (e) { console.error('Data corrupted:', e); return []; } },
    save: (data) => localStorage.setItem('cricket_scorer_v3', JSON.stringify(data)),
    addTournament: (t) => { const data = Store.get(); data.push(t); Store.save(data); },
    deleteTournament: (id) => { const data = Store.get().filter(t => t.id !== id); Store.save(data); app.goHome(); },
    updateTournament: (updated) => { const data = Store.get(); const idx = data.findIndex(t => t.id === updated.id); if (idx !== -1) { data[idx] = updated; Store.save(data); } }
};

// --- CALCULATION LOGIC ---
const Logic = {
    oversToBalls: (overs) => {
        if (!overs) return 0;
        const o = parseFloat(overs), w = Math.floor(o);
        return (w * 6) + Math.round((o - w) * 10);
    },
    isRankConfirmed: (standings, rankIndex, tourney) => {
        const team = standings[rankIndex]; if (!team) return false;
        const rem = tourney.matches.filter(m => m.type === 'League' && !m.completed);
        let maxPossibleBelow = -1;
        for (let i = rankIndex + 1; i < standings.length; i++) {
            const t = standings[i], games = rem.filter(m => m.t1 === t.name || m.t2 === t.name).length;
            const max = t.pts + (games * 2); if (max > maxPossibleBelow) maxPossibleBelow = max;
        }
        return team.pts > maxPossibleBelow;
    },
    isEliminated: (standings, teamIndex, tourney) => {
        const team = standings[teamIndex]; if (!team || standings.length <= 4) return false;
        if (teamIndex < 4) return false;
        const fourth = standings[3]; if (!fourth) return false;
        const rem = tourney.matches.filter(m => m.type === 'League' && !m.completed);
        const games = rem.filter(m => m.t1 === team.name || m.t2 === team.name).length;
        return (team.pts + (games * 2)) < fourth.pts;
    },
    calculateStandings: (tourney) => {
        let stats = {}; tourney.teams.forEach(t => { stats[t] = { name: t, p: 0, w: 0, l: 0, d: 0, pts: 0, runsFor: 0, ballsFor: 0, runsAgainst: 0, ballsAgainst: 0 }; });
        tourney.matches.forEach(m => {
            if (!m.completed || m.type !== 'League') return;
            const t1 = stats[m.t1], t2 = stats[m.t2]; if (!t1 || !t2) return;
            t1.p++; t2.p++;
            const r1 = parseInt(m.t1s || 0), w1 = parseInt(m.t1w || 0), o1 = parseFloat(m.t1o || 0), r2 = parseInt(m.t2s || 0), w2 = parseInt(m.t2w || 0), o2 = parseFloat(m.t2o || 0);
            let b1 = Logic.oversToBalls(o1); if (w1 >= 10) b1 = Logic.oversToBalls(tourney.maxOvers);
            let b2 = Logic.oversToBalls(o2); if (w2 >= 10) b2 = Logic.oversToBalls(tourney.maxOvers);
            t1.runsFor += r1; t1.ballsFor += b1; t1.runsAgainst += r2; t1.ballsAgainst += b2;
            t2.runsFor += r2; t2.ballsFor += b2; t2.runsAgainst += r1; t2.ballsAgainst += b1;
            if (r1 > r2) { t1.w++; t1.pts += 2; t2.l++; } else if (r2 > r1) { t2.w++; t2.pts += 2; t1.l++; } else { t1.d++; t1.pts += 1; t2.d++; t2.pts += 1; }
        });
        let ranking = Object.values(stats).map(t => { const oF = t.ballsFor / 6, oA = t.ballsAgainst / 6; t.nrr = (oF === 0 ? 0 : t.runsFor / oF) - (oA === 0 ? 0 : t.runsAgainst / oA); return t; });
        ranking.sort((a, b) => (b.pts - a.pts) || (b.nrr - a.nrr)); return ranking;
    }
};

// --- APP ENGINE ---
const app = {
    currentTournamentId: null, tempTeams: [], selectedMatchId: null, activeView: 'dashboard', deletePendingId: null,
    scoringState: { currentBalls: [null, null, null, null, null, null], currentWickets: 0, currentRuns: 0, currentWides: 0, currentNoballs: 0 },

    init: () => app.goHome(),
    goHome: () => { app.currentTournamentId = null; app.tempTeams = []; app.activeView = 'dashboard'; ui.renderHome(); },
    goBack: () => {
        if (app.activeView === 'dashboard') {
            app.goHome();
        } else if (app.activeView === 'calculator') {
            // CHECK: Are there unsaved selections in current over?
            const hasUnsavedSelections = app.scoringState.currentBalls.some(ball =>
                Array.isArray(ball) && ball.length > 0
            );

            if (hasUnsavedSelections) {
                // WARN: Show confirmation modal
                ui.openUnsavedModal();
            } else {
                // Safe to go back - no unsaved data
                app.confirmGoBack();
            }
        } else {
            app.activeView = 'dashboard';
            ui.renderTournamentView();
        }
    },
    confirmGoBack: () => {
        // CONFIRMED: Reset current over and go back
        ui.closeUnsavedModal();
        app.scoringState.currentBalls = [null, null, null, null, null, null];
        app.scoringState.currentWickets = 0;
        app.scoringState.currentRuns = 0;
        app.scoringState.currentWides = 0;
        app.scoringState.currentNoballs = 0;
        app.activeView = 'dashboard';
        ui.renderTournamentView();
    },
    promptDelete: (id) => { app.deletePendingId = id; ui.openDeleteModal(); },
    executeDelete: () => { if (app.deletePendingId) { Store.deleteTournament(app.deletePendingId); app.deletePendingId = null; ui.closeDeleteModal(); } },
    openCreateModal: () => { app.tempTeams = []; document.getElementById('new-tourney-name').value = ''; ui.openModal(); },

    createTournament: () => {
        const name = document.getElementById('new-tourney-name').value.trim().substring(0, 100);
        const overs = parseFloat(document.getElementById('new-tourney-overs').value);
        const format = document.querySelector('input[name="new-tourney-format"]:checked').value;
        if (!name || app.tempTeams.length < 2) return ui.showAlert("Setup Error", "Missing tournament name or teams.");
        const newTourney = { id: Date.now().toString(), name, maxOvers: overs, teams: app.tempTeams, matches: app.generateMatchGrid(app.tempTeams), playoffStyle: format };
        app.initKnockouts(newTourney, format); Store.addTournament(newTourney); app.openTournament(newTourney.id); ui.closeModal();
    },

    initKnockouts: (t, s) => {
        let id = 1000;
        if (s === 'IPL') {
            t.matches.push({ id: id++, label: "Qualifier 1", type: "Qualifier", t1: "1st Place", t2: "2nd Place", t1s: '', t1w: '', t1o: '', t2s: '', t2w: '', t2o: '', completed: false },
                { id: id++, label: "Eliminator", type: "Qualifier", t1: "3rd Place", t2: "4th Place", t1s: '', t1w: '', t1o: '', t2s: '', t2w: '', t2o: '', completed: false },
                { id: id++, label: "Qualifier 2", type: "Qualifier", t1: "Loser Q1", t2: "Winner Elim", t1s: '', t1w: '', t1o: '', t2s: '', t2w: '', t2o: '', completed: false },
                { id: id++, label: "Final", type: "Final", t1: "Winner Q1", t2: "Winner Q2", t1s: '', t1w: '', t1o: '', t2s: '', t2w: '', t2o: '', completed: false });
        } else {
            t.matches.push({ id: id++, label: "Semi Final 1", type: "Semi Final", t1: "1st Place", t2: "4th Place", t1s: '', t1w: '', t1o: '', t2s: '', t2w: '', t2o: '', completed: false },
                { id: id++, label: "Semi Final 2", type: "Semi Final", t1: "2nd Place", t2: "3rd Place", t1s: '', t1w: '', t1o: '', t2s: '', t2w: '', t2o: '', completed: false },
                { id: id++, label: "Final", type: "Final", t1: "Winner SF1", t2: "Winner SF2", t1s: '', t1w: '', t1o: '', t2s: '', t2w: '', t2o: '', completed: false });
        }
    },

    generateMatchGrid: (teams) => {
        let matches = [], id = 1;
        for (let i = 0; i < teams.length; i++) {
            for (let j = 0; j < teams.length; j++) {
                if (i !== j) {
                    matches.push({ id: id++, label: `Match ${id - 1}`, type: 'League', t1: teams[i], t2: teams[j], t1s: '', t1w: '', t1o: '', t2s: '', t2w: '', t2o: '', completed: false });
                }
            }
        }
        return matches;
    },

    generateKnockouts: (style) => {
        const tourney = Store.get().find(t => t.id === app.currentTournamentId);
        if (!tourney) return;
        tourney.matches = tourney.matches.filter(m => m.type === 'League');
        app.initKnockouts(tourney, style);
        tourney.playoffStyle = style;
        Store.updateTournament(tourney);
        ui.renderTournamentView();
    },

    exportToPDF: () => {
        const tourney = Store.get().find(t => t.id === app.currentTournamentId);
        if (!tourney) return;
        
        const { jsPDF } = window.jspdf;
        // Check if jsPDF loaded correctly
        if (!jsPDF) { alert("PDF library not loaded yet. Please refresh the page."); return; }
        
        const doc = new jsPDF('p', 'pt', 'a4'); 
        
        doc.setFont("helvetica", "bold");
        doc.setFontSize(22);
        doc.setTextColor(15, 23, 42); // Navy
        doc.text(`WicketUp - ${tourney.name}`, 40, 50);
        
        doc.setFont("helvetica", "normal");
        doc.setFontSize(16);
        doc.setTextColor(51, 65, 85);
        doc.text("Points Table", 40, 80);
        
        const standings = Logic.calculateStandings(tourney);
        const ptsBody = standings.map(t => [
            t.name, t.p, t.w, t.l, t.d, t.pts, `${t.nrr > 0 ? '+' : ''}${t.nrr.toFixed(3)}`
        ]);
        
        doc.autoTable({
            startY: 90,
            head: [['Team', 'Played', 'Won', 'Lost', 'Tied', 'Points', 'NRR']],
            body: ptsBody,
            headStyles: { fillColor: [37, 99, 235], fontSize: 11, fontStyle: 'bold' },
            bodyStyles: { fontSize: 10, textColor: [51, 65, 85] },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            margin: { left: 40, right: 40 },
            theme: 'grid'
        });
        
        const finalY = doc.lastAutoTable.finalY + 30;
        
        doc.setFontSize(16);
        doc.setTextColor(51, 65, 85);
        doc.text("Match Results", 40, finalY);
        
        const matchBody = tourney.matches.map(m => {
            const getOversDisplay = (balls) => `${Math.floor(balls / 6)}.${balls % 6}`;
            const t1Score = m.t1s !== '' ? `${m.t1s}/${m.t1w || 0}` : '-';
            const t2Score = m.t2s !== '' ? `${m.t2s}/${m.t2w || 0}` : '-';
            const t1Overs = m.t1o !== '' ? getOversDisplay(Logic.oversToBalls(m.t1o)) : '-';
            const t2Overs = m.t2o !== '' ? getOversDisplay(Logic.oversToBalls(m.t2o)) : '-';
            const status = m.completed ? 'Completed' : (m.inningsStatus ? 'Live' : 'Upcoming');
            const res = m.resultMsg ? m.resultMsg : '-';
            return [
                m.label, 
                status, 
                m.t1, 
                `${t1Score} (${t1Overs})`, 
                m.t2, 
                `${t2Score} (${t2Overs})`, 
                res
            ];
        });

        doc.autoTable({
            startY: finalY + 10,
            head: [['Match', 'Status', 'Team 1', 'Score/Overs', 'Team 2', 'Score/Overs', 'Result']],
            body: matchBody,
            headStyles: { fillColor: [15, 23, 42], fontSize: 11, fontStyle: 'bold' },
            bodyStyles: { fontSize: 10, textColor: [51, 65, 85] },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            margin: { left: 40, right: 40 },
            theme: 'grid'
        });
        
        doc.save(`WicketUp_${tourney.name.replace(/\\s+/g, '_')}_Report.pdf`);
    },

    exportToImage: () => {
        const tourney = Store.get().find(t => t.id === app.currentTournamentId);
        if (!tourney) return;
        
        // Hide the action buttons temporarily so they don't appear in the image
        const exportBtns = document.querySelectorAll('.export-action-btn');
        const originalDisplays = [];
        exportBtns.forEach(btn => {
            originalDisplays.push(btn.style.display);
            btn.style.display = 'none';
        });

        // Add a slight visual indicator that it's generating
        document.body.style.cursor = 'wait';

        const content = document.getElementById('view-content');
        
        // Use html2canvas to capture the element
        html2canvas(content, {
            backgroundColor: '#f8fafc',
            scale: 2, // High resolution
            useCORS: true
        }).then(canvas => {
            // Restore buttons and cursor
            exportBtns.forEach((btn, index) => {
                btn.style.display = originalDisplays[index];
            });
            document.body.style.cursor = 'default';

            // Convert to image and download
            const image = canvas.toDataURL("image/png");
            const link = document.createElement("a");
            link.href = image;
            link.download = `WicketUp_${tourney.name.replace(/\\s+/g, '_')}_Dashboard.png`;
            link.click();
        }).catch(err => {
            console.error('Failed to export image', err);
            exportBtns.forEach((btn, index) => {
                btn.style.display = originalDisplays[index];
            });
            document.body.style.cursor = 'default';
            alert('Could not export to image. Please try again.');
        });
    },

    openTournament: (id, view = 'dashboard') => { app.currentTournamentId = id; app.selectedMatchId = null; app.activeView = view; ui.renderTournamentView(); },

    setBattingFirst: (val, el) => {
        const teams = el.parentElement.querySelectorAll('.setup-team');
        teams.forEach(t => t.classList.remove('selected'));
        el.classList.add('selected');
        const radio = el.querySelector('input[type="radio"]');
        if (radio) radio.checked = true;
    },

    selectMatch: (id) => {
        const tourney = Store.get().find(x => x.id === app.currentTournamentId);
        if (!tourney) return;
        const match = tourney.matches.find(x => x.id === parseInt(id));
        if (!match) return;

        // Check if another match is already in progress
        const activeMatch = tourney.matches.find(m => m.inningsStatus && m.inningsStatus !== 'Completed' && m.id !== parseInt(id));
        if (activeMatch) {
            return ui.showAlert("Match In Progress", `${activeMatch.label} is still in progress. Please complete it first!`);
        }

        const posKeywords = ["Place", "Winner", "Loser", "Match"];
        if (match.type !== 'League' && posKeywords.some(p => match.t1.includes(p) || match.t2.includes(p))) {
            return ui.showAlert("Alert", "Teams positions yet to be finalised!");
        }

        // Reset scoring state when selecting a new match
        app.scoringState.currentBalls = [null, null, null, null, null, null];
        app.scoringState.currentWickets = 0;
        app.scoringState.currentRuns = 0;
        app.scoringState.currentWides = 0;
        app.scoringState.currentNoballs = 0;

        app.selectedMatchId = parseInt(id); app.activeView = 'calculator'; ui.renderTournamentView();
    },

    startMatchSetup: () => {
        const tourney = Store.get().find(x => x.id === app.currentTournamentId);
        const match = tourney.matches.find(x => x.id === app.selectedMatchId);
        if (!match) return;
        match.maxOvers = parseFloat(document.getElementById('setup-overs').value);
        match.maxWickets = parseInt(document.getElementById('setup-wickets').value);
        match.battingFirst = document.querySelector('input[name="setup-batting"]:checked').value;
        match.inningsStatus = '1st'; match.t1s = '0'; match.t1w = '0'; match.t1o = '0.0'; match.t2s = '0'; match.t2w = '0'; match.t2o = '0.0';
        Store.updateTournament(tourney); ui.renderCalculator(tourney);
    },

    startSecondInnings: () => {
        const tourney = Store.get().find(t => t.id === app.currentTournamentId);
        const match = tourney.matches.find(x => x.id === app.selectedMatchId);
        if (!match) return;
        match.inningsStatus = '2nd'; Store.updateTournament(tourney); ui.renderCalculator(tourney);
    },

    finishOver: () => {
        const tourney = Store.get().find(t => t.id === app.currentTournamentId);
        if (!tourney) return;
        const match = tourney.matches.find(x => x.id === app.selectedMatchId);
        if (!match) return;

        let teamKey = (match.inningsStatus === '1st') ? (match.battingFirst === 't1' ? 't1' : 't2') : (match.battingFirst === 't1' ? 't2' : 't1');

        // CHECK: Is current over complete with all 6 legal balls?
        const legalBallsCompleted = app.calculateLegalBalls();
        const maxWickets = match.maxWickets || 10;
        const totalWickets = parseInt(match[teamKey + 'w'] || 0) + app.scoringState.currentWickets;

        // CRICKET RULES: Check if innings should end early
        // 1. All wickets lost (all out)
        // 2. Target reached in 2nd innings
        const isAllOut = totalWickets >= maxWickets;
        const targetReached = match.inningsStatus === '2nd' ? (() => {
            const firstInnTeam = match.battingFirst === 't1' ? 't1' : 't2';
            const targetRuns = parseInt(match[firstInnTeam + 's']) + 1;
            const currentRuns = parseInt(match[teamKey + 's'] || 0) + app.scoringState.currentRuns;
            return currentRuns >= targetRuns;
        })() : false;

        // ALLOW: Proceed if over is complete OR innings ends early
        if (legalBallsCompleted < 6 && !isAllOut && !targetReached) {
            // NOT COMPLETE AND NO EARLY END: Show warning
            const ballsRemaining = 6 - legalBallsCompleted;
            ui.showAlert(
                "Incomplete Over",
                `Please complete all legal deliveries. ${ballsRemaining} ball(s) remaining.`
            );
            return;
        }

        // VALIDATION: Ensure all delivery data is valid before saving
        // Clean up any invalid WD+NB combinations in current balls
        app.scoringState.currentBalls.forEach((ballArray, idx) => {
            if (Array.isArray(ballArray)) {
                app.sanitizeDeliveryData(ballArray);
            }
        });

        match[teamKey + 's'] = (parseInt(match[teamKey + 's'] || 0) + app.scoringState.currentRuns).toString();
        match[teamKey + 'w'] = (parseInt(match[teamKey + 'w'] || 0) + app.scoringState.currentWickets).toString();

        // CRICKET RULES IMPLEMENTATION:
        // According to official cricket rules:
        // - Only LEGAL deliveries count toward ball count and overs
        // - Wides (WD) and No-Balls (NB) are EXTRAS and do NOT increment the ball count
        // - An over = 6 legal deliveries exactly
        // - Free hits after no-balls still count as legal unless they are wide/no-ball themselves
        // - A delivery CANNOT be both WD and NB simultaneously
        // - Innings ends early if all wickets lost or target reached

        const legalBallsThisOver = app.calculateLegalBalls();  // Only counts legal deliveries
        const currentOvers = parseFloat(match[teamKey + 'o'] || 0);
        const currentOversComplete = Math.floor(currentOvers);
        const currentBallsInOvers = Math.round((currentOvers - currentOversComplete) * 10);

        // Calculate total legal balls bowled so far
        const totalLegalBalls = currentOversComplete * 6 + currentBallsInOvers + legalBallsThisOver;

        // Convert back to overs format (overs.balls)
        const completedOvers = Math.floor(totalLegalBalls / 6);
        const remainingBalls = totalLegalBalls % 6;
        match[teamKey + 'o'] = (completedOvers + (remainingBalls / 10)).toFixed(1);

        const limitOvers = match.maxOvers || tourney.maxOvers, limitWkts = match.maxWickets || 10;
        let endInnings = (parseInt(match[teamKey + 'w']) >= limitWkts || parseFloat(match[teamKey + 'o']) >= limitOvers);

        if (match.inningsStatus === '2nd') {
            const firstInnKey = (match.battingFirst === 't1' ? 't1' : 't2');
            const target = parseInt(match[firstInnKey + 's']) + 1;
            if (parseInt(match[teamKey + 's']) >= target) {
                match.completed = true;
                match.resultMsg = `${match[teamKey]} won!`;
            } else if (endInnings) {
                match.completed = true;
                match.resultMsg = parseInt(match[teamKey + 's']) === target - 1 ? "Match Tied!" : `${match[firstInnKey]} won!`;
            }
        } else if (endInnings) {
            match.inningsStatus = 'Innings Break';
        }

        if (match.completed) {
            match.inningsStatus = 'Completed';
            app.updatePlayoffFlow(tourney, match);
        }
        Store.updateTournament(tourney);
        app.scoringState.currentBalls = [null, null, null, null, null, null];
        app.scoringState.currentRuns = 0;
        app.scoringState.currentWickets = 0;
        app.scoringState.currentWides = 0;
        app.scoringState.currentNoballs = 0;
        ui.renderCalculator(tourney);
    },

    updatePlayoffFlow: (t, m) => {
        const q1 = t.matches.find(x => x.label === "Qualifier 1"), elim = t.matches.find(x => x.label === "Eliminator"), q2 = t.matches.find(x => x.label === "Qualifier 2"), final = t.matches.find(x => x.label === "Final");
        const sf1 = t.matches.find(x => x.label === "Semi Final 1"), sf2 = t.matches.find(x => x.label === "Semi Final 2");

        if (t.playoffStyle === 'IPL') {
            if (q1 && q1.completed) { const w = parseInt(q1.t1s) > parseInt(q1.t2s) ? q1.t1 : q1.t2, l = parseInt(q1.t1s) > parseInt(q1.t2s) ? q1.t2 : q1.t1; if (final) final.t1 = w; if (q2) q2.t1 = l; }
            if (elim && elim.completed) { if (q2) q2.t2 = parseInt(elim.t1s) > parseInt(elim.t2s) ? elim.t1 : elim.t2; }
            if (q2 && q2.completed) { if (final) final.t2 = parseInt(q2.t1s) > parseInt(q2.t2s) ? q2.t1 : q2.t2; }
        } else {
            if (sf1 && sf1.completed) final.t1 = parseInt(sf1.t1s) > parseInt(sf1.t2s) ? sf1.t1 : sf1.t2;
            if (sf2 && sf2.completed) final.t2 = parseInt(sf2.t1s) > parseInt(sf2.t2s) ? sf2.t1 : sf2.t2;
        }
    },

    validateWideAndNoBallMutualExclusivity: (ballArray, newValue) => {
        // CRICKET RULES: A delivery MUST be EXACTLY ONE of:
        // 1. A legal delivery (0, 1, 2, 3, 4, 6, W)
        // 2. A Wide (WD)
        // 3. A No Ball (NB)
        // But NEVER both Wide AND No Ball

        if (newValue === 'WD') {
            // If adding WD, remove NB if present
            const nbIndex = ballArray.indexOf('NB');
            if (nbIndex > -1) {
                ballArray.splice(nbIndex, 1);
            }
        } else if (newValue === 'NB') {
            // If adding NB, remove WD if present
            const wdIndex = ballArray.indexOf('WD');
            if (wdIndex > -1) {
                ballArray.splice(wdIndex, 1);
            }
        }
        return ballArray;
    },

    handleWideNoBallToggle: (ballArray, newValue, isChecked) => {
        // IMPROVED UX: Smart mutual exclusivity without permanent disabling
        // 
        // Problem with old approach: Checkboxes became permanently disabled
        // Solution: Allow users to switch between WD/NB by auto-deselecting the other
        //
        // Logic:
        // - User selects WD → Check if NB is there → Auto-remove NB → Add WD
        // - User then wants NB instead → Deselect WD → NB becomes available
        // - User selects NB → Check if WD is there → Auto-remove WD → Add NB

        if (!isChecked) {
            // User is deselecting, just remove it (this re-enables the other option)
            const idx = ballArray.indexOf(newValue);
            if (idx > -1) {
                ballArray.splice(idx, 1);
            }
            return;
        }

        // User is trying to SELECT WD or NB
        // First, intelligently remove the conflicting option if present
        if (newValue === 'WD' && ballArray.includes('NB')) {
            // User wants WD, but NB is already selected
            // Auto-remove NB to make room for WD (smart swap)
            const nbIdx = ballArray.indexOf('NB');
            ballArray.splice(nbIdx, 1);
        } else if (newValue === 'NB' && ballArray.includes('WD')) {
            // User wants NB, but WD is already selected
            // Auto-remove WD to make room for NB (smart swap)
            const wdIdx = ballArray.indexOf('WD');
            ballArray.splice(wdIdx, 1);
        }

        // Now add the new value if not already present
        if (!ballArray.includes(newValue)) {
            ballArray.push(newValue);
        }
    },

    updateGridScore: (i, v, isChecked) => {
        const value = v === 'W' ? 'W' : (v === 'WD' ? 'WD' : (v === 'NB' ? 'NB' : parseInt(v)));

        // Initialize as array if not already
        if (!Array.isArray(app.scoringState.currentBalls[i])) {
            app.scoringState.currentBalls[i] = [];
        }

        const ballArray = app.scoringState.currentBalls[i];
        let needsGridRender = false;

        // CRICKET RULES: Wide (WD) and No-Ball (NB) are extras that:
        // 1. Don't count as legal deliveries
        // 2. EACH WD/NB requires ONE compensation ball (extra delivery in same over)
        // 3. Cannot both exist on same delivery (mutual exclusivity)
        // Example: 2 WDs = 2 compensation balls (8 total balls in array)

        if (value === 'WD' || value === 'NB') {
            // Use smart toggle logic to handle WD/NB mutual exclusivity
            app.handleWideNoBallToggle(ballArray, value, isChecked);

            // COUNT: How many WD/NB exist in this over (including this one after toggle)?
            const totalWDNBCount = app.scoringState.currentBalls.slice(0, i + 1).reduce((count, b) => {
                if (Array.isArray(b) && (b.includes('WD') || b.includes('NB'))) {
                    return count + 1;
                }
                return count;
            }, 0);

            // EXPECTED: Should have (6 + totalWDNBCount) items in array
            // 6 = base legal deliveries, + 1 for each WD/NB
            const expectedLength = 6 + totalWDNBCount;
            const currentLength = app.scoringState.currentBalls.length;

            // INSERT: Add compensation balls if array is shorter than expected
            // This handles adding multiple compensation balls for multiple WD/NB
            if (isChecked && currentLength < expectedLength) {
                const ballsToAdd = expectedLength - currentLength;
                for (let j = 0; j < ballsToAdd; j++) {
                    app.scoringState.currentBalls.splice(i + 1, 0, null);
                }
                needsGridRender = true;
            }

            // REMOVE: Remove compensation balls if array is longer than expected
            // This handles removing multiple compensation balls when WD/NB are deselected
            if (!isChecked && currentLength > expectedLength) {
                const ballsToRemove = currentLength - expectedLength;
                for (let j = 0; j < ballsToRemove; j++) {
                    // Find and remove null compensation balls from the end
                    if (i + 1 < app.scoringState.currentBalls.length) {
                        app.scoringState.currentBalls.splice(i + 1, 1);
                    }
                }
                needsGridRender = true;
            }
        } else {
            // Regular delivery (runs or wicket)
            if (isChecked) {
                if (!ballArray.includes(value)) {
                    ballArray.push(value);
                }
            } else {
                const idx = ballArray.indexOf(value);
                if (idx > -1) {
                    ballArray.splice(idx, 1);
                }
            }
        }

        // Recalculate totals - ensure all calculations are done correctly
        app.calculateScoringTotals();

        // Always re-render the grid to update dots and score display for ANY selection
        const tourney = Store.get().find(t => t.id === app.currentTournamentId);
        const match = tourney.matches.find(x => x.id === app.selectedMatchId);
        if (match) {
            ui.renderLiveScoringGrid(match);
        }
    },

    sanitizeDeliveryData: (ballArray) => {
        // SAFETY: Clean up legacy data that might have invalid WD+NB combination
        // This handles edge cases where data was loaded from older saved matches
        if (Array.isArray(ballArray)) {
            const hasWide = ballArray.includes('WD');
            const hasNoBall = ballArray.includes('NB');

            if (hasWide && hasNoBall) {
                // Invalid state: both WD and NB present
                // Keep WD (more common) and remove NB
                const nbIndex = ballArray.indexOf('NB');
                if (nbIndex > -1) {
                    ballArray.splice(nbIndex, 1);
                }
                console.warn('Sanitized invalid delivery state: removed NB when WD was present');
            }
        }
        return ballArray;
    },

    calculateLegalBalls: () => {
        // CRICKET RULES: Only legal deliveries count toward ball count and overs
        // Wides (WD) and No Balls (NB) are EXTRAS and do NOT count as legal balls
        // An over consists of exactly 6 legal balls only
        let legalBallCount = 0;
        app.scoringState.currentBalls.forEach(b => {
            if (Array.isArray(b) && b.length > 0) {
                // If the delivery array includes 'WD' or 'NB', the ENTIRE delivery is illegal
                // This means even if runs (like 6) are scored off a No Ball, it still doesn't count as a legal ball.
                const isIllegal = b.includes('WD') || b.includes('NB');
                if (!isIllegal) {
                    legalBallCount++;
                }
            }
        });
        return legalBallCount;
    },

    calculateDeliveries: () => {
        // Deprecated: Use calculateLegalBalls() instead
        // Kept for backwards compatibility
        return app.calculateLegalBalls();
    },

    calculateScoringTotals: () => {
        let r = 0, w = 0, wides = 0, noballs = 0;

        app.scoringState.currentBalls.forEach(b => {
            if (Array.isArray(b) && b.length > 0) {
                b.forEach(val => {
                    if (val === 'W') {
                        // Wicket: counts as a legal delivery, adds 0 runs
                        w++;
                    } else if (val === 'WD') {
                        // Wide: NOT a legal delivery, but adds 1 run (penalty)
                        // Does NOT increment ball count (see calculateLegalBalls)
                        wides++;
                        r += 1;
                    } else if (val === 'NB') {
                        // No Ball: NOT a legal delivery, but adds 1 run (penalty)
                        // Does NOT increment ball count (see calculateLegalBalls)
                        noballs++;
                        r += 1;
                    } else if (typeof val === 'number' && val !== null && val !== undefined) {
                        // Runs: legal delivery, adds specified runs
                        r += val;
                    }
                });
            }
        });

        app.scoringState.currentRuns = r;
        app.scoringState.currentWickets = w;
        app.scoringState.currentWides = wides;
        app.scoringState.currentNoballs = noballs;
    },
    reorderMatchGrid: (f, t) => {
        const tourney = Store.get().find(x => x.id === app.currentTournamentId);
        const leagueMatches = tourney.matches.filter(m => m.type === 'League');
        const otherMatches = tourney.matches.filter(m => m.type !== 'League');
        const [item] = leagueMatches.splice(f, 1);
        leagueMatches.splice(t, 0, item);
        tourney.matches = [...leagueMatches, ...otherMatches];
        Store.updateTournament(tourney);
        app.normalizeMatchGrid(tourney, null);
    },
    normalizeMatchGrid: (tourney, pId) => {
        let c = 1;
        tourney.matches.forEach(m => {
            if (m.type === 'League') {
                if (m.id !== pId && /^Match \d+$/.test(m.label)) m.label = `Match ${c}`;
                c++;
            }
        });
        Store.updateTournament(tourney);
        ui.renderGridManager(tourney);
    },
    renameMatch: (id, n) => {
        const tourney = Store.get().find(t => t.id === app.currentTournamentId);
        const m = tourney.matches.find(i => i.id === id);
        if (!m) return;
        const newLabel = String(n).substring(0, 50);
        // Check if the user typed a "Match N" pattern to reorder
        const reorderMatch = newLabel.match(/^Match\s+(\d+)$/i);
        if (reorderMatch && m.type === 'League') {
            const targetPos = parseInt(reorderMatch[1]) - 1; // 0-indexed
            const leagueMatches = tourney.matches.filter(x => x.type === 'League');
            const otherMatches = tourney.matches.filter(x => x.type !== 'League');
            const currentIdx = leagueMatches.findIndex(x => x.id === id);
            if (currentIdx !== -1 && targetPos >= 0 && targetPos < leagueMatches.length && currentIdx !== targetPos) {
                const [item] = leagueMatches.splice(currentIdx, 1);
                leagueMatches.splice(targetPos, 0, item);
                tourney.matches = [...leagueMatches, ...otherMatches];
            }
            // Re-normalize all labels to sequential "Match N"
            let c = 1;
            tourney.matches.forEach(x => { if (x.type === 'League') { x.label = `Match ${c}`; c++; } });
            Store.updateTournament(tourney);
            ui.renderGridManager(tourney);
        } else {
            m.label = newLabel;
            Store.updateTournament(tourney);
            app.normalizeMatchGrid(tourney, id);
        }
    }
};

// --- UI ---
const ui = {
    main: document.getElementById('app'),
    openModal: () => document.getElementById('modal-overlay').classList.remove('hidden'),
    closeModal: () => document.getElementById('modal-overlay').classList.add('hidden'),
    openDeleteModal: () => document.getElementById('delete-confirm-modal').classList.remove('hidden'),
    closeDeleteModal: () => document.getElementById('delete-confirm-modal').classList.add('hidden'),
    openUnsavedModal: () => document.getElementById('unsaved-changes-modal').classList.remove('hidden'),
    closeUnsavedModal: () => document.getElementById('unsaved-changes-modal').classList.add('hidden'),
    showAlert: (t, m) => { document.getElementById('alert-title').innerText = t; document.getElementById('alert-message').innerText = m; document.getElementById('alert-modal').classList.remove('hidden'); },
    closeAlert: () => document.getElementById('alert-modal').classList.add('hidden'),
    addTeamToList: () => { const i = document.getElementById('team-input'), n = i.value.trim().substring(0, 50); if (n && !app.tempTeams.includes(n)) { app.tempTeams.push(n); ui.renderTempTeams(); i.value = ''; i.focus(); } },
    renderTempTeams: () => { const c = document.getElementById('team-list-display'); c.innerHTML = app.tempTeams.map((t, i) => `<span class="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full flex items-center gap-1">${esc(t)} <button onclick="app.tempTeams.splice(${i},1); ui.renderTempTeams()" class="text-red-500 font-bold">&times;</button></span>`).join('') || '<p class="text-gray-400 text-sm italic w-full text-center">No teams added yet</p>'; },

    renderHome: () => {
        const tourneys = Store.get();
        document.getElementById('back-btn').classList.add('hidden');

        let html = `
                    <div class="fade-in">
                        <!-- Hero Section -->
                        <div class="hero-banner">
                            <h2 class="hero-title">Welcome to your Cricket Tournament Hub</h2>
                            <p class="hero-subtitle">Welcome to your cricket hub dashboard for your tournament.</p>
                            <button onclick="app.openCreateModal()" class="btn-create">
                                <i class="fa-solid fa-trophy"></i>
                                Create Tournament
                            </button>
                        </div>

                        <!-- Section Header -->
                        <h2 class="section-header">Your Tournaments</h2>

                        <!-- Tournaments Grid -->
                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">`;

        tourneys.forEach(t => {
            const completed = t.matches.filter(m => m.completed).length;
            const total = t.matches.length;
            const progress = Math.round((completed / total) * 100);

            html += `
                        <div class="tournament-card group" onclick="app.openTournament('${t.id}')">
                            <div class="flex justify-between items-start mb-1">
                                <h3 class="font-bold text-xl text-gray-900 leading-tight">${esc(t.name)}</h3>
                                <div class="flex gap-3">
                                    <button onclick="event.stopPropagation()" class="card-menu-btn">
                                        <i class="fa-solid fa-bars-staggered"></i>
                                    </button>
                                    <button onclick="event.stopPropagation(); app.promptDelete('${t.id}')" class="card-delete-btn">
                                        <i class="fa-solid fa-trash-can"></i>
                                    </button>
                                </div>
                            </div>
                            <p class="text-sm font-medium text-gray-500 mb-6">${t.teams.length} Teams • ${t.maxOvers} Overs</p>

                            <div class="progress-label">${progress}% Done</div>
                            <div class="card-progress-outer">
                                <div class="card-progress-inner" style="width: ${progress}%"></div>
                            </div>

                            <div class="flex justify-between items-end mt-4">
                                <div class="card-footer-item">
                                    <span class="footer-val">${progress}%</span>
                                    <span class="footer-label">Stats</span>
                                </div>
                                <div class="card-footer-item text-right">
                                    <span class="footer-val">${completed}/${total}</span>
                                    <span class="footer-label">Matches Played</span>
                                </div>
                            </div>
                        </div>`;
        });

        ui.main.innerHTML = html + `</div></div>`;
    },

    renderTournamentView: () => {
        const tourney = Store.get().find(t => t.id === app.currentTournamentId);
        if (!tourney) return app.goHome();

        document.getElementById('back-btn').classList.remove('hidden');

        const tabs = `
                    <div class="flex bg-white border-b border-gray-200 mb-8 -mx-6">
                        <button onclick="app.openTournament('${tourney.id}', 'dashboard')" 
                            class="tab-btn ${app.activeView === 'dashboard' ? 'active' : ''}">
                            Dashboard
                        </button>
                        <button onclick="app.openTournament('${tourney.id}', 'match-grid')" 
                            class="tab-btn ${app.activeView === 'match-grid' ? 'active' : ''}">
                            Match Grid
                        </button>
                        <button onclick="app.openTournament('${tourney.id}', 'calculator')" 
                            class="tab-btn ${app.activeView === 'calculator' ? 'active' : ''}">
                            Scorer
                        </button>
                    </div>`;

        ui.main.innerHTML = `
                    <div class="fade-in">
                        ${tabs}
                        <div class="mb-8">
                            <h2 class="text-2xl font-black text-gray-900 leading-none">${esc(tourney.name)}</h2>
                            <p class="text-xs text-gray-400 mt-1 uppercase font-bold tracking-widest">Tournament ID: ${tourney.id.substr(-8)}</p>
                        </div>
                        <div id="view-content" class="space-y-8"></div>
                    </div>`;

        if (app.activeView === 'dashboard') ui.renderDashboardContent(tourney);
        else if (app.activeView === 'match-grid') ui.renderGridManager(tourney);
        else if (app.activeView === 'calculator') ui.renderCalculator(tourney);
    },

    renderDashboardContent: (tourney) => {
        const standings = Logic.calculateStandings(tourney);
        const leagueMatches = tourney.matches.filter(m => m.type === 'League');
        const allLeagueDone = leagueMatches.every(m => m.completed);
        const hasPlayoffs = tourney.matches.some(m => m.type !== 'League');

        if (hasPlayoffs) {
            const sf1 = tourney.matches.find(m => m.label === 'Qualifier 1' || m.label === 'Semi Final 1'), elim = tourney.matches.find(m => m.label === 'Eliminator' || m.label === 'Semi Final 2');
            if (allLeagueDone) {
                if (tourney.playoffStyle === 'IPL') { if (sf1 && !sf1.completed) { sf1.t1 = standings[0]?.name; sf1.t2 = standings[1]?.name; } if (elim && !elim.completed) { elim.t1 = standings[2]?.name; elim.t2 = standings[3]?.name; } }
                else { if (sf1 && !sf1.completed) { sf1.t1 = standings[0]?.name; sf1.t2 = standings[3]?.name; } if (elim && !elim.completed) { elim.t1 = standings[1]?.name; elim.t2 = standings[2]?.name; } }
            } else {
                if (tourney.playoffStyle === 'IPL') {
                    if (sf1 && !sf1.completed) { sf1.t1 = Logic.isRankConfirmed(standings, 0, tourney) ? standings[0].name : "1st Place"; sf1.t2 = Logic.isRankConfirmed(standings, 1, tourney) ? standings[1].name : "2nd Place"; }
                    if (elim && !elim.completed) { elim.t1 = Logic.isRankConfirmed(standings, 2, tourney) ? standings[2].name : "3rd Place"; elim.t2 = Logic.isRankConfirmed(standings, 3, tourney) ? standings[3].name : "4th Place"; }
                } else {
                    if (sf1 && !sf1.completed) { sf1.t1 = Logic.isRankConfirmed(standings, 0, tourney) ? standings[0].name : "1st Place"; sf1.t2 = Logic.isRankConfirmed(standings, 3, tourney) ? standings[3].name : "4th Place"; }
                    if (elim && !elim.completed) { elim.t1 = Logic.isRankConfirmed(standings, 1, tourney) ? standings[1].name : "2nd Place"; elim.t2 = Logic.isRankConfirmed(standings, 2, tourney) ? standings[2].name : "3rd Place"; }
                }
            }
        }

        document.getElementById('view-content').innerHTML = `
                    <!-- Points Table Card -->
                    <div class="dashboard-card mb-8">
                        <div class="dashboard-card-header flex justify-between items-center">
                            <span>Points Table</span>
                            <div class="flex items-center gap-4">
                                <button onclick="app.exportToImage()" class="export-action-btn text-[14px] text-purple-600 font-black uppercase hover:text-purple-800 transition-colors flex items-center gap-1">
                                    <i class="fa-solid fa-image"></i> Image
                                </button>
                                <button onclick="app.exportToPDF()" class="export-action-btn text-[14px] text-red-600 font-black uppercase hover:text-red-800 transition-colors flex items-center gap-1">
                                    <i class="fa-solid fa-file-pdf"></i> PDF
                                </button>
                                <button onclick="ui.showPlayoffFormatPicker()" class="export-action-btn text-[14px] text-blue-600 font-black uppercase hover:text-blue-800 transition-colors">
                                    ${!hasPlayoffs ? 'Set Playoffs' : 'Change Format'}
                                </button>
                            </div>
                        </div>
                        <div class="overflow-x-auto">
                            <table class="w-full points-table text-left">
                                <thead class="bg-gray-50">
                                    <tr>
                                        <th class="pl-6">Team</th>
                                        <th class="text-center">P</th>
                                        <th class="text-center text-green-600 uppercase">W</th>
                                        <th class="text-center text-red-500 uppercase">L</th>
                                        <th class="text-center text-orange-500 uppercase">D</th>
                                        <th class="text-center font-black text-blue-700 uppercase">PTS</th>
                                        <th class="text-right pr-6 uppercase">NRR</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${standings.map((t, i) => `
                                        <tr class="${i < 4 ? 'rank-q' : ''}">
                                            <td class="pl-6 font-bold text-gray-900 flex items-center gap-2">
                                                <span class="w-5 h-5 flex items-center justify-center rounded-full bg-gray-100 text-[10px] text-gray-400 font-bold">${i + 1}</span>
                                                ${esc(t.name)}
                                            </td>
                                            <td class="text-center">${t.p}</td>
                                            <td class="text-center val-win">${t.w}</td>
                                            <td class="text-center val-loss">${t.l}</td>
                                            <td class="text-center">${t.d}</td>
                                            <td class="text-center val-pts">${t.pts}</td>
                                            <td class="text-right pr-6 val-nrr ${t.nrr >= 0 ? 'text-blue-600' : 'text-red-500'}">
                                                ${t.nrr > 0 ? '+' : ''}${t.nrr.toFixed(3)}
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    ${hasPlayoffs ? ui.renderBracket(tourney) : ''}
                `;
    },

    showPlayoffFormatPicker: () => {
        const picker = document.createElement('div'); picker.id = 'format-picker-modal'; picker.className = "fixed inset-0 bg-black/70 z-[100] flex items-center justify-center p-4 backdrop-blur-sm";
        picker.innerHTML = `<div class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden fade-in"><div class="p-6 bg-blue-900 text-white flex justify-between items-center"><h3 class="text-xl font-bold">Select Playoffs Style</h3><button onclick="this.parentElement.parentElement.parentElement.remove()" class="text-white/50 hover:text-white"><i class="fa-solid fa-times"></i></button></div><div class="p-8 grid grid-cols-1 md:grid-cols-2 gap-8"><div onclick="app.generateKnockouts('Standard'); document.getElementById('format-picker-modal').remove();" class="cursor-pointer border-2 border-gray-100 rounded-2xl p-6 hover:border-blue-500 hover:bg-blue-50/30 transition-all group text-center"><h4 class="text-lg font-bold text-gray-800 mb-2 uppercase tracking-tighter">Standard</h4><div class="flex flex-col gap-2 items-center opacity-70 mt-4"><div class="flex gap-4"><div class="mini-bracket-box bg-blue-50 border-blue-200">SF 1</div><div class="mini-bracket-box bg-red-50 border-red-200">SF 2</div></div><i class="fa-solid fa-chevron-down text-gray-300"></i><div class="mini-bracket-box font-bold border-yellow-500 bg-yellow-50 text-yellow-700 text-[10px]">FINAL</div></div></div><div onclick="app.generateKnockouts('IPL'); document.getElementById('format-picker-modal').remove();" class="cursor-pointer border-2 border-gray-100 rounded-2xl p-6 hover:border-indigo-500 hover:bg-indigo-50/30 transition-all group text-center"><h4 class="text-lg font-bold text-gray-800 mb-2 uppercase tracking-tighter">IPL Style</h4><div class="flex flex-col gap-2 items-center opacity-70 mt-4"><div class="flex gap-4"><div class="mini-bracket-box bg-blue-50 border-blue-200">Qual 1</div><div class="mini-bracket-box bg-red-50 border-red-200">Elim</div></div><i class="fa-solid fa-chevron-down text-gray-300"></i><div class="mini-bracket-box bg-orange-50 border-orange-200">Qual 2</div><i class="fa-solid fa-chevron-down text-gray-300"></i><div class="mini-bracket-box font-bold border-yellow-500 bg-yellow-50 text-yellow-700 text-[10px]">FINAL</div></div></div></div></div>`;
        document.body.appendChild(picker);
    },

    renderBracket: (tourney) => {
        const matches = tourney.matches.filter(m => m.type !== 'League');
        const q1 = matches.find(m => m.label === "Qualifier 1"),
            elim = matches.find(m => m.label === "Eliminator"),
            sf2 = matches.find(m => m.label === "Semi Final 2"),
            q2 = matches.find(m => m.label === "Qualifier 2"),
            final = matches.find(m => m.label === "Final");

        const renderRoadmapCard = (m, type, colorClass, date) => {
            if (!m) return `<div class="roadmap-card opacity-50"><div class="roadmap-header ${colorClass}">${type}</div><div class="roadmap-body"><div class="text-gray-300 italic py-8">TBD</div></div></div>`;

            const t1win = m.completed && parseInt(m.t1s || 0) > parseInt(m.t2s || 0);
            const t2win = m.completed && parseInt(m.t2s || 0) > parseInt(m.t1s || 0);

            return `
                <div class="roadmap-card cursor-pointer" onclick="app.selectMatch(${m.id})">
                    <div class="roadmap-header ${colorClass}">${type}</div>
                    <div class="roadmap-body">
                        <div class="roadmap-team-info">
                            <div class="roadmap-logo">${m.t1.charAt(0)}</div>
                            <span class="roadmap-team-name ${t1win ? 'text-blue-600' : ''}">${esc(m.t1)}</span>
                        </div>
                        <div class="roadmap-vs">vs</div>
                        <div class="roadmap-team-info">
                            <div class="roadmap-logo">${m.t2.charAt(0)}</div>
                            <span class="roadmap-team-name ${t2win ? 'text-blue-600' : ''}">${esc(m.t2)}</span>
                        </div>
                        <div class="roadmap-date">${date}</div>
                    </div>
                </div>
            `;
        };

        if (tourney.playoffStyle === 'IPL') {
            return `
                <div class="dashboard-card mb-8 overflow-hidden">
                    <div class="dashboard-card-header">Playoffs Roadmap (IPL Style)</div>
                    <div class="roadmap-outer">
                        <div class="roadmap-container">
                            <!-- SVG Layer for Connectors -->
                            <svg class="roadmap-svg-layer" viewBox="0 0 1000 500" preserveAspectRatio="xMidYMid meet">
                                <defs>
                                    <marker id="arrowhead-blue" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                                        <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6" />
                                    </marker>
                                    <marker id="arrowhead-green" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                                        <polygon points="0 0, 10 3.5, 0 7" fill="#22c55e" />
                                    </marker>
                                </defs>
                                
                                <!-- Q1 to Final (Winner Q1) - High Arch -->
                                <path d="M 260,60 C 470,-30 680,-30 680,210" class="roadmap-path blue" marker-end="url(#arrowhead-blue)" stroke-dasharray="8,5" />
                                <text x="470" y="30" class="roadmap-path-label" text-anchor="middle">Winner Q1</text>
                                
                                <!-- Q1 to Q2 (Loser Q1) -->
                                <path d="M 260,110 Q 310,110 310,244 L 360,244" class="roadmap-path blue" marker-end="url(#arrowhead-blue)" />
                                <text x="315" y="165" class="roadmap-path-label" text-anchor="start">Loser Q1</text>
                                
                                <!-- Eliminator to Q2 (Winner Elim) -->
                                <path d="M 260,370 Q 310,370 310,244 L 360,244" class="roadmap-path blue" marker-end="url(#arrowhead-blue)" />
                                <text x="315" y="340" class="roadmap-path-label" text-anchor="start">Winner Elim</text>
                                
                                <!-- Q2 to Final (Winner Q2) -->
                                <path d="M 580,244 L 680,244" class="roadmap-path green" marker-end="url(#arrowhead-green)" />
                                <text x="630" y="235" class="roadmap-path-label" text-anchor="middle">Winner Q2</text>
                            </svg>

                            <!-- Column 1: Q1 and Elim -->
                            <div class="flex flex-col gap-32">
                                ${renderRoadmapCard(q1, 'Qualifier 1', 'blue', 'Oct 15, 2024')}
                                ${renderRoadmapCard(elim, 'Eliminator', 'orange', 'Oct 16, 2024')}
                            </div>

                            <!-- Column 2: Q2 (Vertically Centered) -->
                            <div class="flex flex-col" style="margin-top: 50px">
                                ${renderRoadmapCard(q2, 'Qualifier 2', 'green', 'Oct 18, 2024')}
                            </div>

                            <!-- Column 3: Final -->
                            <div class="flex flex-col" style="margin-top: 50px">
                                ${renderRoadmapCard(final, 'Final', 'gold', 'Oct 20, 2024')}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        // Standard / Fallback Style
        const sf1_match = matches.find(m => m.label.includes("Semi Final 1") || m.label === "Qualifier 1"),
            sf2_match = matches.find(m => m.label.includes("Semi Final 2") || m.label === "Eliminator" || m.label === "Qualifier 2"),
            final_match = matches.find(m => m.label === "Final");

        return `
            <div class="dashboard-card mb-8 overflow-hidden">
                <div class="dashboard-card-header">Playoffs Roadmap (Standard)</div>
                <div class="roadmap-outer">
                    <div class="roadmap-container" style="min-width: 700px;">
                        <!-- SVG Layer for Connectors -->
                        <svg class="roadmap-svg-layer" viewBox="0 0 700 500" preserveAspectRatio="xMidYMid meet">
                            <defs>
                                <marker id="arrowhead-blue" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                                    <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6" />
                                </marker>
                            </defs>
                            
                            <!-- SF1 winner to Final -->
                            <path d="M 260,110 Q 310,110 310,244 L 360,244" class="roadmap-path blue" marker-end="url(#arrowhead-blue)" />
                            <text x="315" y="165" class="roadmap-path-label" text-anchor="start">Winner SF1</text>
                            
                            <!-- SF2 winner to Final -->
                            <path d="M 260,370 Q 310,370 310,244 L 360,244" class="roadmap-path blue" marker-end="url(#arrowhead-blue)" />
                            <text x="315" y="340" class="roadmap-path-label" text-anchor="start">Winner SF2</text>
                        </svg>

                        <!-- Column 1: Semi Finals -->
                        <div class="flex flex-col gap-32">
                            ${renderRoadmapCard(sf1_match, 'Semi-Final 1', 'blue', 'Oct 15, 2024')}
                            ${renderRoadmapCard(sf2_match, 'Semi-Final 2', 'blue', 'Oct 16, 2024')}
                        </div>

                        <!-- Column 2: Final -->
                        <div class="flex flex-col" style="margin-top: 50px">
                            ${renderRoadmapCard(final_match, 'Grand Final', 'gold', 'Oct 20, 2024')}
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    renderMatchGrid: (tourney, mode = 'view') => {
        const shieldSvg = `<svg viewBox="0 0 50 56" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M25 0L50 10V30C50 44 38 54 25 56C12 54 0 44 0 30V10L25 0Z" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="1.5"/>
        </svg>`;

        const cards = tourney.matches.map((m, i) => {
            const isUpcoming = !m.completed && !m.inningsStatus;
            const isLive = !m.completed && m.inningsStatus && m.inningsStatus !== 'Completed';
            const isCompleted = m.completed;

            const statusText = isLive ? 'Live <span class="live-dot"></span>' : (isCompleted ? 'Completed' : 'Upcoming');
            const statusClass = isLive ? 'match-card__status--live' : (isCompleted ? 'match-card__status--completed' : 'match-card__status--upcoming');

            const scoreDisplay = isCompleted ? `<div class="match-card__score">${m.t1s || 0} - ${m.t2s || 0}</div>` : '';

            // Identify the winner
            let winner = null;
            if (isCompleted) {
                const s1 = parseInt(m.t1s || 0), s2 = parseInt(m.t2s || 0);
                if (s1 > s2) winner = 't1';
                else if (s2 > s1) winner = 't2';
            }

            return `
                <div class="match-card ${mode === 'manage' && !isCompleted ? 'draggable-item' : ''} ${isCompleted ? 'match-card--completed-green' : ''}" 
                     ${mode === 'manage' && !isCompleted ? `draggable="true" data-index="${i}"` : ''}>
                    
                    ${mode === 'manage' && !isCompleted ? `<i class="fa-solid fa-grip-vertical match-card__drag"></i>` : ''}

                    <div class="match-card__status ${statusClass}">
                        ${statusText}
                    </div>
                    
                    <div class="match-card__body">
                        <div class="match-card__team">
                            <div class="team-shield ${winner === 't1' ? 'team-shield--winner' : ''}">
                                ${shieldSvg}
                                <span class="team-shield__letter">${m.t1.charAt(0)}</span>
                            </div>
                            <span class="team-shield__name">${esc(m.t1)}</span>
                        </div>
                        
                        <div class="flex flex-col items-center gap-1">
                            <span class="match-card__vs">vs</span>
                            ${scoreDisplay}
                        </div>
                        
                        <div class="match-card__team">
                            <div class="team-shield ${winner === 't2' ? 'team-shield--winner' : ''}">
                                ${shieldSvg}
                                <span class="team-shield__letter">${m.t2.charAt(0)}</span>
                            </div>
                            <span class="team-shield__name">${esc(m.t2)}</span>
                        </div>
                    </div>

                    ${mode === 'manage' && !isCompleted ? `
                        <input type="text" value="${esc(m.label)}" 
                               onchange="app.renameMatch(${m.id}, this.value)" 
                               class="match-card__rename">
                    ` : `
                        <div class="match-card__footer">${esc(m.label)}</div>
                    `}
                </div>
            `;
        }).join('');

        return `<div id="schedule-list" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">${cards}</div>`;
    },


    renderGridManager: (tourney) => {
        ui.main.innerHTML = `<div class="p-6 bg-white rounded-xl shadow-sm border mb-8"><div class="flex justify-between items-center mb-6"><h3 class="font-bold text-xl text-gray-900 border-l-4 border-blue-600 pl-4 uppercase tracking-tighter">Manage Match Grid</h3><p class="text-xs text-gray-400 font-bold italic tracking-wider">Drag cards to reorder matches</p></div>${ui.renderMatchGrid(tourney, 'manage')}</div>`;
        ui.setupDragAndDrop();
    },
    setupDragAndDrop: () => {
        const list = document.getElementById('schedule-list'); if (!list) return;
        list.addEventListener('dragstart', (e) => { e.target.classList.add('dragging'); ui.dragStartIndex = Number(e.target.dataset.index); });
        list.addEventListener('dragend', (e) => { e.target.classList.remove('dragging'); });
        list.addEventListener('dragover', (e) => {
            e.preventDefault();
            const current = document.querySelector('.dragging');
            if (!current) return;
            const after = ui.getDragAfterElement(list, e.clientX, e.clientY);
            if (after == null) list.appendChild(current);
            else list.insertBefore(current, after);
        });
        list.addEventListener('drop', (e) => {
            e.preventDefault();
            const current = document.querySelector('.dragging');
            if (!current) return;
            const items = [...list.querySelectorAll('.draggable-item')];
            const newIdx = items.indexOf(current);
            if (ui.dragStartIndex !== null && newIdx !== -1 && ui.dragStartIndex !== newIdx) {
                app.reorderMatchGrid(ui.dragStartIndex, newIdx);
            }
        });
    },
    getDragAfterElement: (container, x, y) => {
        const draggableElements = [...container.querySelectorAll('.draggable-item:not(.dragging)')];
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const centerX = box.left + box.width / 2;
            const centerY = box.top + box.height / 2;
            const distance = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
            if (distance < closest.distance) return { distance, element: child };
            return closest;
        }, { distance: Number.POSITIVE_INFINITY }).element;
    },

    renderCalculator: (tourney) => {
        if (!tourney) tourney = Store.get().find(t => t.id === app.currentTournamentId);
        const posK = ["Place", "Winner", "Loser", "Match"];
        const availableMatches = tourney.matches.filter(m => !m.completed && !posK.some(p => m.t1.includes(p) || m.t2.includes(p)));
        const completedMatches = tourney.matches.filter(m => m.completed);

        const renderScorerCard = (m, isCompleted = false) => `
            <div class="scorer-card ${isCompleted ? 'scorer-card--completed' : ''}">
                <h4 class="scorer-card__title">${esc(m.t1)} vs ${esc(m.t2)}</h4>
                <p class="scorer-card__info">${esc(m.label)}${m.maxOvers ? ' | ' + m.maxOvers + ' Overs' : ''}</p>
                ${isCompleted ? `
                    <div class="scorer-card__result">${esc(m.resultMsg || 'Completed')}</div>
                ` : `
                    <button onclick="app.selectMatch(${m.id})" class="scorer-card__btn ${m.inningsStatus ? 'scorer-card__btn--continue' : ''}">
                        ${m.inningsStatus ? 'Continue Scoring' : 'Start Scoring'}
                    </button>
                `}
            </div>
        `;

        let html = `<div class="fade-in">`;

        // Active scoring area (if a match is selected)
        if (app.selectedMatchId) {
            html += `<div class="bg-white rounded-xl shadow-sm border p-6 mb-8">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="font-bold text-lg flex items-center gap-2">
                        <i class="fa-solid fa-cricket-bat-ball text-blue-600"></i> Live Scorer
                    </h3>
                    <button onclick="app.selectedMatchId = null; ui.renderCalculator()" 
                            class="text-xs font-bold text-gray-400 hover:text-gray-600 uppercase tracking-wider transition-colors">
                        <i class="fa-solid fa-arrow-left"></i> Back to Matches
                    </button>
                </div>
                <div id="calc-dynamic-content"></div>
            </div>`;
        }

        // Available matches grid
        if (availableMatches.length > 0) {
            html += `
                <div class="mb-8">
                    <h3 class="font-bold text-sm text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <i class="fa-solid fa-circle text-green-500 text-[8px]"></i> Available Matches
                    </h3>
                    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        ${availableMatches.map(m => renderScorerCard(m)).join('')}
                    </div>
                </div>`;
        }

        // Completed matches grid
        if (completedMatches.length > 0) {
            html += `
                <div>
                    <h3 class="font-bold text-sm text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <i class="fa-solid fa-check-circle text-gray-300 text-[8px]"></i> Completed Matches
                    </h3>
                    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        ${completedMatches.map(m => renderScorerCard(m, true)).join('')}
                    </div>
                </div>`;
        }

        html += `</div>`;
        ui.main.innerHTML = html;
        if (app.selectedMatchId) ui.updateCalculatorState(tourney, app.selectedMatchId);
    },

    updateCalculatorState: (tourney, id) => {
        const container = document.getElementById('calc-dynamic-content');
        if (!container) return;
        const match = tourney.matches.find(m => m.id == id); if (!match) return;

        if (!match.inningsStatus) {
            const shieldSvg = `<svg viewBox="0 0 50 56" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 opacity-40">
                <path d="M25 0L50 10V30C50 44 38 54 25 56C12 54 0 44 0 30V10L25 0Z" fill="#94a3b8" stroke="#cbd5e1" stroke-width="1.5"/>
            </svg>`;

            container.innerHTML = `
                <div class="setup-card fade-in">
                    <h3 class="setup-card__title">Setup Match</h3>
                    
                    <div class="setup-grid">
                        <div class="setup-field">
                            <label class="setup-field__label">Overs</label>
                            <input type="number" id="setup-overs" value="${tourney.maxOvers}" class="setup-field__input" placeholder="0">
                            <span class="setup-field__sub">Enter number</span>
                        </div>
                        <div class="setup-field">
                            <label class="setup-field__label">Wickets</label>
                            <input type="number" id="setup-wickets" value="10" class="setup-field__input" placeholder="0">
                            <span class="setup-field__sub">Enter number</span>
                        </div>
                    </div>

                    <div class="setup-section">
                        <label class="setup-field__label mb-3 block">Batting First</label>
                        <div class="setup-teams">
                            <div class="setup-team selected" onclick="app.setBattingFirst('t1', this)">
                                <div class="setup-team__badge">${shieldSvg}</div>
                                <span class="setup-team__name">${esc(match.t1)}</span>
                                <i class="fa-solid fa-circle-check setup-team__check"></i>
                                <input type="radio" name="setup-batting" value="t1" class="hidden" checked>
                            </div>
                            <div class="setup-team" onclick="app.setBattingFirst('t2', this)">
                                <div class="setup-team__badge">${shieldSvg}</div>
                                <span class="setup-team__name">${esc(match.t2)}</span>
                                <i class="fa-solid fa-circle-check setup-team__check"></i>
                                <input type="radio" name="setup-batting" value="t2" class="hidden">
                            </div>
                        </div>
                    </div>

                    <button onclick="app.startMatchSetup()" class="setup-card__btn">
                        Start Innings
                    </button>
                </div>
            `;
        }
        else if (match.inningsStatus === 'Innings Break') { const fk = match.battingFirst === 't1' ? 't1s' : 't2s'; container.innerHTML = `<div class="bg-orange-50 p-8 rounded-xl border text-center shadow-inner"><i class="fa-solid fa-mug-hot text-5xl text-orange-400 mb-4 block"></i><h3 class="text-2xl font-bold mb-2 text-orange-900">Innings Break</h3><p class="mb-6 text-orange-800">Target for 2nd Innings: <span class="text-2xl font-bold">${parseInt(match[fk]) + 1}</span></p><button onclick="app.startSecondInnings()" class="bg-orange-600 text-white font-bold py-3 px-12 rounded-xl transition-colors hover:bg-orange-700">Start Second Innings</button></div>`; }
        else if (match.inningsStatus === 'Completed') {
            const posK = ["Place", "Winner", "Loser"];
            const nextM = tourney.matches.find(m => !m.completed && m.id !== match.id && !posK.some(p => m.t1.includes(p) || m.t2.includes(p)));
            container.innerHTML = `<div class="bg-white rounded-2xl border-4 border-green-500 p-10 text-center shadow-2xl win-card-pop relative overflow-hidden"><i class="fa-solid fa-trophy text-7xl text-yellow-500 mb-6 animate-trophy drop-shadow-lg"></i><h3 class="text-3xl font-black text-green-700 uppercase tracking-tighter mb-2">Match Finished!</h3><div class="text-xl font-bold text-gray-700 mb-10 p-4 bg-green-50 rounded-xl border border-green-100">${esc(match.resultMsg)}</div><div class="grid grid-cols-1 gap-4 relative z-10">${nextM ? `<button onclick="app.selectMatch(${nextM.id})" class="w-full bg-blue-600 text-white font-black py-5 rounded-2xl shadow-xl hover:bg-blue-700 transition-all flex items-center justify-center gap-3 active:scale-95">START NEXT MATCH <i class="fa-solid fa-arrow-right"></i></button>` : ''}<button onclick="app.goBack()" class="w-full bg-gray-100 text-gray-700 font-black py-4 rounded-2xl hover:bg-gray-200 transition-all uppercase tracking-widest text-sm text-center">Go to Dashboard</button></div></div>`;
        } else ui.renderLiveScoringGrid(match);
    },
    renderLiveScoringGrid: (match) => {
        const container = document.getElementById('calc-dynamic-content');
        if (!container) return;
        let teamKey = match.inningsStatus === '1st' ? (match.battingFirst === 't1' ? 't1' : 't2') : (match.battingFirst === 't1' ? 't2' : 't1');
        let battingTeam = match[teamKey], targetDisplay = '';
        if (match.inningsStatus === '2nd') {
            let firstInnTeam = match.battingFirst === 't1' ? 't1' : 't2';
            let targetVal = parseInt(match[firstInnTeam + 's']) + 1;
            targetDisplay = `<div id="live-need-msg" class="text-[10px] font-bold text-yellow-300 mt-1 uppercase tracking-tighter">Target: ${targetVal} | Need ${targetVal - parseInt(match[teamKey + 's'])} runs in ${(match.maxOvers * 6) - Logic.oversToBalls(match[teamKey + 'o'])} balls</div>`;
        }
        const ballOptions = [0, 1, 2, 3, 4, 6, 'W', 'WD', 'NB'];
        // CHECK: Is current over complete OR innings ends early?
        const legalBallsCompleted = app.calculateLegalBalls();
        const maxWickets = match.maxWickets || 10;
        const totalWickets = parseInt(match[teamKey + 'w'] || 0) + app.scoringState.currentWickets;
        const isAllOut = totalWickets >= maxWickets;

        // Check if target reached in 2nd innings
        let targetReached = false;
        if (match.inningsStatus === '2nd') {
            const firstInnTeam = match.battingFirst === 't1' ? 't1' : 't2';
            const targetRuns = parseInt(match[firstInnTeam + 's']) + 1;
            const currentRuns = parseInt(match[teamKey + 's'] || 0) + app.scoringState.currentRuns;
            targetReached = currentRuns >= targetRuns;
        }

        // RESTRICTION: Disable run selection if match won or all wickets lost
        const shouldDisableRuns = isAllOut || targetReached;

        const totalBallCount = app.scoringState.currentBalls.length;
        let ballsHtml = '';
        for (let i = 0; i < totalBallCount; i++) {
            const currentValues = Array.isArray(app.scoringState.currentBalls[i]) ? app.scoringState.currentBalls[i] : [];

            // Sanitize data: fix invalid WD+NB combinations from legacy saved matches
            app.sanitizeDeliveryData(currentValues);

            const hasWide = currentValues.includes('WD');
            const hasNoBall = currentValues.includes('NB');

            // CREATE: Show a dot indicator if any option is selected for this ball
            const hasAnySelection = currentValues.length > 0;
            const dotIndicator = hasAnySelection ? '<span class="absolute -top-1 -right-1 w-2 h-2 bg-blue-600 rounded-full shadow-sm"></span>' : '';

            ballsHtml += `<div class="grid grid-cols-[50px_1fr] gap-2 items-center py-2 border-b last:border-0 border-gray-100 relative"><div class="text-[10px] font-bold text-gray-300 text-center relative">${dotIndicator}BALL ${i + 1}</div><div class="grid grid-cols-9 gap-1">${ballOptions.map(opt => {
                // IMPROVED UX: Don't disable checkboxes - let user correct mistakes
                // Visual feedback shows user that switching will auto-replace the other
                //
                // Indicators:
                // - Active (WD/NB selected): Normal styling
                // - Conflict (other option selected): Faded but STILL CLICKABLE
                // - Inactive: Normal styling
                // - Disabled for runs: When match won or all wickets lost

                let needsWarning = false;
                if (opt === 'NB' && hasWide) needsWarning = true;   // NB is faded when WD active
                if (opt === 'WD' && hasNoBall) needsWarning = true;  // WD is faded when NB active

                // RESTRICTION: Disable run buttons (0-6) and wickets/extras (W, WD, NB) if match won or all wickets lost
                const isRunOption = [0, 1, 2, 3, 4, 6].includes(opt);
                const isWicketOrExtra = ['W', 'WD', 'NB'].includes(opt);
                const isDisabled = shouldDisableRuns && (isRunOption || isWicketOrExtra);
                const disabledAttr = isDisabled ? 'disabled' : '';
                const disabledStyle = isDisabled
                    ? 'style="opacity: 0.4; cursor: not-allowed; pointer-events: none;"'
                    : '';

                const warningStyle = needsWarning
                    ? 'style="opacity: 0.5; cursor: pointer; text-decoration: line-through;"'
                    : '';
                const warningTitle = needsWarning
                    ? 'title="Click to switch - will replace the other option"'
                    : '';
                const disabledTitle = isDisabled
                    ? 'title="Match already won or all wickets lost"'
                    : '';

                return `<div class="ball-option opt-${opt}"><input type="checkbox" id="b${i}_${opt}" value="${opt}" onchange="app.updateGridScore(${i}, ${typeof opt === 'string' ? `'${opt}'` : opt}, this.checked)" ${currentValues.includes(opt) ? 'checked' : ''} ${disabledAttr}><label for="b${i}_${opt}" ${disabledStyle} ${disabledTitle} ${!isDisabled && warningStyle} ${!isDisabled && warningTitle}>${opt}</label></div>`;
            }).join('')}</div></div>`;
        }

        // CREATE: Linear dot indicator for all balls in current over
        const dotsHtml = app.scoringState.currentBalls.map((ball, idx) => {
            const hasSelection = Array.isArray(ball) && ball.length > 0;
            const isCompensationBall = ball === null && idx >= 6;
            return `<div class="flex flex-col items-center gap-1"><div class="w-2 h-2 rounded-full transition-all ${hasSelection ? 'bg-green-400 shadow-lg shadow-green-400/50' : 'bg-gray-400'}"></div><span class="text-[8px] font-bold text-gray-300">${idx + 1}${isCompensationBall ? '+' : ''}</span></div>`;
        }).join('');

        const isOverComplete = legalBallsCompleted >= 6;
        const canProceed = isOverComplete || isAllOut || targetReached;
        const ballsRemaining = Math.max(0, 6 - legalBallsCompleted);

        let buttonClass = 'w-full text-white font-bold py-5 rounded-2xl shadow-xl text-lg flex items-center justify-center gap-3 uppercase tracking-widest';
        let buttonTitle = '';
        let warningMessage = '';

        if (canProceed) {
            buttonClass += ' bg-blue-600 hover:bg-blue-700 transition-all';
            if (isAllOut) {
                buttonTitle = 'title="All wickets lost - Innings ended"';
            } else if (targetReached) {
                buttonTitle = 'title="Target reached - Match won!"';
            }
        } else {
            buttonClass += ' bg-gray-400 text-gray-600 cursor-not-allowed opacity-70';
            buttonTitle = `title="Complete all ${ballsRemaining} remaining ball(s) to proceed"`;
            warningMessage = `<div class="text-center text-sm font-semibold text-amber-600 bg-amber-50 p-3 rounded-lg">⚠️ Complete all 6 legal deliveries (${ballsRemaining} remaining)</div>`;
        }

        container.innerHTML = `<div class="space-y-6"><div class="sticky-score-header bg-blue-900 text-white p-5 rounded-2xl shadow-xl transition-all"><div class="flex justify-between items-start mb-4"><div><div class="text-[10px] text-blue-300 uppercase font-bold">${match.inningsStatus} Innings: ${esc(battingTeam)}</div><div class="text-5xl font-bold leading-none" id="live-main-score">${match[teamKey + 's']}/${match[teamKey + 'w']}</div><div class="text-[10px] opacity-80">${match[teamKey + 'o']} Overs</div>${targetDisplay}</div><div class="text-right">THIS OVER<div class="text-3xl font-mono text-yellow-400 font-bold bg-white/10 px-2 rounded mt-1 leading-none pt-1" id="live-this-over">+0</div></div></div><div class="flex gap-3 items-center justify-start overflow-x-auto pb-2">${dotsHtml}</div></div><div class="bg-gray-50 p-4 rounded-xl border"><div class="text-[10px] font-bold text-gray-500 uppercase mb-3 block">Click multiple options per ball</div><div class="space-y-3">${ballsHtml}</div></div><button id="btn-finish-over" onclick="app.finishOver()" class="${buttonClass}" ${buttonTitle} ${!canProceed ? 'disabled' : ''}>${isAllOut ? '🏁 INNINGS ENDED' : (targetReached ? '🎉 MATCH WON' : 'NEXT OVER')} <i class="fa-solid fa-arrow-right"></i></button>${warningMessage}</div>`;

        // Update the display with current totals after rendering
        ui.updateLiveScoreDisplay();
    },
    updateLiveScoreDisplay: () => {
        const hScore = document.getElementById('live-main-score'), hOver = document.getElementById('live-this-over'), btn = document.getElementById('btn-finish-over'), hNeed = document.getElementById('live-need-msg'); if (!hScore) return;
        const tourney = Store.get().find(t => t.id === app.currentTournamentId);
        const match = tourney.matches.find(x => x.id === app.selectedMatchId);
        let teamKey = (match.inningsStatus === '1st') ? (match.battingFirst === 't1' ? 't1' : 't2') : (match.battingFirst === 't1' ? 't2' : 't1');
        const totalRuns = parseInt(match[teamKey + 's'] || 0) + app.scoringState.currentRuns;
        const totalWickets = parseInt(match[teamKey + 'w'] || 0) + app.scoringState.currentWickets;
        const limitWickets = match.maxWickets || 10;

        hScore.innerText = `${totalRuns}/${totalWickets}`;
        let scoreDisplay = `+${app.scoringState.currentRuns}`;
        if (app.scoringState.currentWickets > 0) scoreDisplay += '/' + app.scoringState.currentWickets + 'w';
        if (app.scoringState.currentWides > 0) scoreDisplay += '/' + app.scoringState.currentWides + 'WD';
        if (app.scoringState.currentNoballs > 0) scoreDisplay += '/' + app.scoringState.currentNoballs + 'NB';
        hOver.innerText = scoreDisplay;

        // CRICKET RULES: Calculate balls remaining using only LEGAL deliveries
        // Wides and No-Balls do NOT count as legal deliveries
        const legalBallsInCurrentOver = app.calculateLegalBalls();
        const totalLegalBallsBowled = Logic.oversToBalls(match[teamKey + 'o']) + legalBallsInCurrentOver;
        const ballsRemaining = (match.maxOvers * 6) - totalLegalBallsBowled;

        if (match.inningsStatus === '2nd') {
            const targetTeamKey = (match.battingFirst === 't1') ? 't1' : 't2';
            const targetRuns = parseInt(match[targetTeamKey + 's']) + 1;
            const needed = targetRuns - totalRuns;
            if (hNeed) hNeed.innerText = `Target: ${targetRuns} | Need ${needed < 0 ? 0 : needed} runs in ${ballsRemaining < 0 ? 0 : ballsRemaining} balls`;

            if (totalRuns >= targetRuns && btn) {
                btn.innerHTML = `<span>FINISH MATCH (WON!)</span> <i class="fa-solid fa-trophy"></i>`;
                btn.className = "w-full bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-5 rounded-2xl shadow-xl text-lg flex items-center justify-center gap-3 transition-all";
            } else if (totalWickets >= limitWickets && btn) {
                btn.innerHTML = `<span>FINISH MATCH (ALL OUT)</span> <i class="fa-solid fa-circle-xmark"></i>`;
                btn.className = "w-full bg-red-600 hover:bg-red-700 text-white font-bold py-5 rounded-2xl shadow-xl text-lg flex items-center justify-center gap-3 transition-all";
            } else if (btn) {
                btn.innerHTML = `<span>NEXT OVER</span> <i class="fa-solid fa-arrow-right"></i>`;
                btn.className = "w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-5 rounded-2xl shadow-xl text-lg flex items-center justify-center gap-3 transition-all";
            }
        } else if (totalWickets >= limitWickets && btn) {
            btn.innerHTML = `<span>FINISH MATCH (ALL OUT)</span> <i class="fa-solid fa-circle-xmark"></i>`;
            btn.className = "w-full bg-red-600 hover:bg-red-700 text-white font-bold py-5 rounded-2xl shadow-xl text-lg flex items-center justify-center gap-3 transition-all";
        } else if (btn) {
            btn.innerHTML = `<span>NEXT OVER</span> <i class="fa-solid fa-arrow-right"></i>`;
            btn.className = "w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-5 rounded-2xl shadow-xl text-lg flex items-center justify-center gap-3 transition-all";
        }
    },
    closeAlert: () => document.getElementById('alert-modal').classList.add('hidden')
};

app.init();

// Expose to global window
window.esc = esc;
window.Store = Store;
window.Logic = Logic;
window.app = app;
window.ui = ui;
