/**
 * PRO TABLE TENNIS - Career Edition
 */

// --- 1. AUDIO SYSTEM (Web Audio API) ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    if (type === 'hit') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(900, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.7, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        osc.start(); osc.stop(audioCtx.currentTime + 0.1);
    } else if (type === 'bounce') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(450, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(200, audioCtx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.5, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
        osc.start(); osc.stop(audioCtx.currentTime + 0.15);
    }
}

// --- 2. KONSTANTEN & ZUSTAND (Offizielle ITTF-Maße in Metern) ---
const TABLE_WIDTH  = 1.525;
const TABLE_LENGTH = 2.74;
const TABLE_HEIGHT = 0.76;
const NET_HEIGHT   = 0.1525;
const BALL_RADIUS  = 0.02;
const PADDLE_RADIUS = 0.08;
const PADDLE_Z     = TABLE_LENGTH / 2 + 0.3;

const gameState = {
    playerScore: 0,
    aiScore: 0,
    serving: true,
    server: 'player',
    pointsPlayed: 0,
    turn: 'player',
    bouncesPlayerSide: 0,
    bouncesAiSide: 0,
    hitCount: 0,
    isActive: false,
};

const ballState = {
    pos: new THREE.Vector3(0, TABLE_HEIGHT + 0.5, PADDLE_Z - 0.2),
    vel: new THREE.Vector3(0, 0, 0),
    spin: 0,
    gravity: 9.81,
};

let appMode = 'menu';
let currentMatchType = 'exhibition';

// --- 3. THREE.JS SETUP ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f172a);
scene.fog = new THREE.FogExp2(0x0f172a, 0.05);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, TABLE_HEIGHT + 0.5, PADDLE_Z + 0.8);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.getElementById('game-container').appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 0.4));
const dirLight = new THREE.SpotLight(0xffffff, 1.2);
dirLight.position.set(0, 5, 0);
dirLight.angle = Math.PI / 3;
dirLight.penumbra = 0.5;
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
scene.add(dirLight);

const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 20),
    new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// --- 4. SPIELOBJEKTE ---
const table = new THREE.Mesh(
    new THREE.BoxGeometry(TABLE_WIDTH, TABLE_HEIGHT, TABLE_LENGTH),
    new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.2, metalness: 0.1 })
);
table.position.y = TABLE_HEIGHT / 2;
table.receiveShadow = true;
table.castShadow = true;
scene.add(table);

const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
function createLine(w, d, x, z) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(w, 0.001, d), lineMat);
    line.position.set(x, TABLE_HEIGHT + 0.001, z);
    scene.add(line);
}
createLine(TABLE_WIDTH, 0.015, 0, 0);
createLine(0.015, TABLE_LENGTH, 0, 0);
createLine(TABLE_WIDTH, 0.015, 0,  TABLE_LENGTH / 2);
createLine(TABLE_WIDTH, 0.015, 0, -TABLE_LENGTH / 2);
createLine(0.015, TABLE_LENGTH,  TABLE_WIDTH / 2, 0);
createLine(0.015, TABLE_LENGTH, -TABLE_WIDTH / 2, 0);

const net = new THREE.Mesh(
    new THREE.PlaneGeometry(TABLE_WIDTH, NET_HEIGHT),
    new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.2, wireframe: true })
);
net.position.set(0, TABLE_HEIGHT + NET_HEIGHT / 2, 0);
scene.add(net);
createLine(TABLE_WIDTH, 0.01, 0, 0);
scene.children[scene.children.length - 1].position.y = TABLE_HEIGHT + NET_HEIGHT;

function createPaddle() {
    const group = new THREE.Group();
    const blade = new THREE.Mesh(
        new THREE.CylinderGeometry(PADDLE_RADIUS, PADDLE_RADIUS, 0.01, 32),
        new THREE.MeshStandardMaterial({ color: 0x8b5a2b })
    );
    blade.rotation.x = Math.PI / 2;
    group.add(blade);
    const rubber = new THREE.Mesh(
        new THREE.CylinderGeometry(PADDLE_RADIUS - 0.002, PADDLE_RADIUS - 0.002, 0.012, 32),
        new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.8 })
    );
    rubber.rotation.x = Math.PI / 2;
    group.add(rubber);
    const handle = new THREE.Mesh(
        new THREE.BoxGeometry(0.03, 0.1, 0.02),
        new THREE.MeshStandardMaterial({ color: 0x8b5a2b })
    );
    handle.position.set(0, -PADDLE_RADIUS - 0.04, 0);
    group.add(handle);
    group.castShadow = true;
    return group;
}

const playerPaddle = createPaddle();
scene.add(playerPaddle);
const aiPaddle = createPaddle();
aiPaddle.rotation.y = Math.PI;
scene.add(aiPaddle);

const ball = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_RADIUS, 32, 32),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1 })
);
ball.castShadow = true;
ball.receiveShadow = true;
scene.add(ball);

const trailLength = 15;
const trailPoints = new Float32Array(trailLength * 3);
const trailGeo = new THREE.BufferGeometry();
trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPoints, 3));
const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }));
scene.add(trail);

// --- 5. KARRIERE ENGINE ---

// Fiktive, anonymisierte Spielernamen
const AI_NAMES = [
    "Viktor Novak",    "Chen Jianlong",   "Marco Ferretti",  "Andrei Volkov",
    "Kenji Watanabe",  "Luis Vega",       "Erik Lindström",  "Yusuf Demir",
    "Pierre Leblanc",  "Arjun Mehta",     "Dmitri Orlov",    "Carlos Ruiz",
    "Hiroshi Nakamura","Felix Brauer",    "Sven Thorsen",    "Omar Hassan",
];

let currentAI = null;
let aiTargetPos = new THREE.Vector3(0, TABLE_HEIGHT + 0.2, -PADDLE_Z);
let aiReactionTimer = 0;

function generateAIProfile(skill) {
    return {
        speed:           1.0 + skill * 3.5,
        error:           0.5 - skill * 0.48,
        reactionDelay:   0.4 - skill * 0.35,
        returnSpeed:     2.5 + skill * 5.5,
        basePlayerSpeed: 2.5 + skill * 2.0,
        maxPlayerSpeed:  5.0 + skill * 9.0,
    };
}

function getPlayerDisplayName(player) {
    if (!player) return '???';
    let name = player.name;
    if (player.trophies > 0) {
        name += ` <span style="color:#facc15;font-size:0.8em">🏆${player.trophies}</span>`;
    }
    return name;
}

// Trainingspool
const TRAINING_POOL = [
    { id: 'speed',       label: '🏃 Schnelligkeitstraining', desc: 'Verbessert die Schlägerbewegung.',  attr: 'speed',               gain: 0.10 },
    { id: 'power',       label: '💪 Krafttraining',          desc: 'Erhöht die maximale Ballkraft.',    attr: 'power',               gain: 0.10 },
    { id: 'consistency', label: '🎯 Präzisionstraining',     desc: 'Verbessert die Schussgenauigkeit.', attr: 'consistency',         gain: 0.10 },
    { id: 'spin',        label: '🌀 Spintechnik',            desc: 'Verstärkt den Topspin-Effekt.',     attr: 'spin',                gain: 0.10 },
    { id: 'allround',    label: '⭐ Allround-Training',      desc: 'Alle Attribute gleichmäßig stärken.',attr: 'all',                gain: 0.04 },
    { id: 'serve',       label: '🏓 Aufschlagtraining',      desc: 'Kraft & Schnelligkeit verbessern.', attrs: ['power', 'speed'],   gain: 0.07 },
];

const Career = {
    players: [],
    playerObj: null,
    difficultyMultiplier: 1.0,
    currentSeason: 1,
    currentTournamentIndex: 0,
    tournaments: [],
    bracket: [],
    hasTrainedThisTournament: false,

    // Lebenslange Karrieredaten
    careerStats: {
        seasonsPlayed: 0,
        totalTitles: 0,
        totalMatches: 0,
        totalWins: 0,
        bestRank: 999,
        peakPoints: 0,
    },

    // Saisondaten (pro Saison zurückgesetzt)
    seasonStats: {
        titles: 0,
        wins: 0,
        matches: 0,
        bestResult: '',
        startRank: 16,
        endRank: 16,
    },

    // Spielerattribute (1.0 = Basiswert, max 2.0)
    attributes: {
        speed:       { value: 1.0, label: 'Schnelligkeit', max: 2.0 },
        power:       { value: 1.0, label: 'Kraft',         max: 2.0 },
        consistency: { value: 1.0, label: 'Präzision',     max: 2.0 },
        spin:        { value: 1.0, label: 'Spin',          max: 2.0 },
    },

    // Letzte 5 Matchergebnisse für Formberechnung
    recentResults: [],

    SEASON_SCHEDULE: [
        { name: 'Frühjahrs Challenge', points: 100  },
        { name: 'Sommer Open',         points: 250  },
        { name: 'Herbst Masters',      points: 500  },
        { name: 'Grand Prix',          points: 750  },
        { name: 'Elite Trophy',        points: 1000, top6Only: true  },
        { name: 'Weltmeisterschaft',   points: 2000, top8Only: true  },
    ],

    startNew() {
        const name = document.getElementById('input-player-name').value.trim() || 'Spieler';
        this.difficultyMultiplier = parseFloat(document.getElementById('input-career-difficulty').value);

        this.playerObj = { name, points: 0, isPlayer: true, skill: 0, trophies: 0 };
        this.currentSeason = 1;
        this.currentTournamentIndex = 0;
        this.recentResults = [];
        this.hasTrainedThisTournament = false;

        Object.keys(this.attributes).forEach(k => { this.attributes[k].value = 1.0; });
        Object.assign(this.careerStats, {
            seasonsPlayed: 0, totalTitles: 0, totalMatches: 0,
            totalWins: 0, bestRank: 999, peakPoints: 0,
        });

        this.players = [this.playerObj];
        for (let i = 0; i < 15; i++) {
            const skill = Math.max(0.1, Math.min(1.5, (1.0 - i * 0.06) * this.difficultyMultiplier));
            this.players.push({
                name: AI_NAMES[i],
                points: Math.floor(2800 * Math.pow(0.75, i)),
                isPlayer: false,
                skill,
                trophies: Math.floor(6 * Math.pow(0.7, i)),
            });
        }

        this.tournaments = this.SEASON_SCHEDULE.map(t => ({ ...t }));
        this.updateRankings();
        this._resetSeasonStats();
        this.updateHub();
        UI.showScreen('screen-hub');
    },

    _resetSeasonStats() {
        this.seasonStats = {
            titles: 0,
            wins: 0,
            matches: 0,
            bestResult: '',
            startRank: this.getPlayerRank(),
            endRank: 16,
        };
    },

    getPlayerRank() {
        this.updateRankings();
        return this.players.indexOf(this.playerObj) + 1;
    },

    updateRankings() {
        this.players.sort((a, b) => b.points - a.points);
    },

    getForm() {
        if (this.recentResults.length < 3) return 'neutral';
        const last3 = this.recentResults.slice(-3);
        if (last3.every(r => r === 'W')) return 'hot';
        if (last3.every(r => r === 'L')) return 'cold';
        return 'neutral';
    },

    getFormMultiplier() {
        const f = this.getForm();
        return f === 'hot' ? 1.08 : f === 'cold' ? 0.93 : 1.0;
    },

    getFormDisplay() {
        const f = this.getForm();
        if (f === 'hot')  return '<span style="color:#f97316">🔥 Heiße Form</span>';
        if (f === 'cold') return '<span style="color:#60a5fa">❄️ Schwache Form</span>';
        return '<span style="color:#94a3b8">➡️ Gute Form</span>';
    },

    getRoundName() {
        if (this.bracket.length >= 4) return 'Viertelfinale';
        if (this.bracket.length === 2) return 'Halbfinale';
        if (this.bracket.length === 1) return 'Finale';
        return 'Turnier';
    },

    updateHub() {
        this.updateRankings();
        const rank = this.getPlayerRank();

        if (rank < this.careerStats.bestRank) this.careerStats.bestRank = rank;
        if (this.playerObj.points > this.careerStats.peakPoints) this.careerStats.peakPoints = this.playerObj.points;

        _setText('hub-title', getPlayerDisplayName(this.playerObj), true);
        _setText('hub-rank', `${rank} / 16`);
        _setText('hub-points', this.playerObj.points);
        _setText('hub-season', this.currentSeason);
        _setText('hub-form', this.getFormDisplay(), true);

        const trainBtn = document.getElementById('btn-train');
        if (trainBtn) {
            trainBtn.disabled = this.hasTrainedThisTournament;
            trainBtn.style.opacity = this.hasTrainedThisTournament ? '0.5' : '1';
        }

        const nextT = this.tournaments[this.currentTournamentIndex];
        const tournBtn = document.getElementById('btn-to-tournament');

        if (!nextT) {
            _setText('hub-event', 'Saison beendet!');
            if (tournBtn) {
                tournBtn.innerText = 'Saisonabschluss';
                tournBtn.onclick = () => Career.showSeasonSummary();
            }
        } else {
            let eventName = nextT.name;
            if (nextT.top8Only) eventName += rank <= 8 ? ' ✓ Qualifiziert' : ' (Top 8 nötig)';
            else if (nextT.top6Only) eventName += rank <= 6 ? ' ✓ Qualifiziert' : ' (Top 6 nötig)';
            _setText('hub-event', eventName);
            if (tournBtn) {
                tournBtn.innerText = 'Zum Turnier';
                tournBtn.onclick = () => Career.enterTournament();
            }
        }

        this._updateAttributeBars();
    },

    _updateAttributeBars() {
        Object.keys(this.attributes).forEach(key => {
            const a = this.attributes[key];
            const fill = document.getElementById(`attr-${key}-fill`);
            const val  = document.getElementById(`attr-${key}-val`);
            if (fill) fill.style.width = `${Math.min(100, ((a.value - 1.0) / (a.max - 1.0)) * 100)}%`;
            if (val)  val.innerText = a.value.toFixed(2);
        });
    },

    // --- TRAINING ---

    showTraining() {
        if (this.hasTrainedThisTournament) {
            alert('Du hast in diesem Turnierabschnitt bereits trainiert.');
            return;
        }
        const shuffled = [...TRAINING_POOL].sort(() => Math.random() - 0.5).slice(0, 3);
        const container = document.getElementById('training-options');
        container.innerHTML = '';

        shuffled.forEach(t => {
            const card = document.createElement('div');
            card.className = 'training-card';
            const attrKeys = t.attrs || (t.attr === 'all' ? Object.keys(this.attributes) : [t.attr]);
            const allMaxed = attrKeys.every(k => this.attributes[k] && this.attributes[k].value >= this.attributes[k].max);
            card.innerHTML = `
                <div class="training-card-title">${t.label}</div>
                <div class="training-card-desc">${t.desc}</div>
                <div class="training-card-gain">+${(t.gain * 100).toFixed(0)}%</div>
                ${allMaxed ? '<div class="training-card-maxed">Maximiert</div>' : ''}
            `;
            card.onclick = () => this.doTraining(t);
            if (allMaxed) card.style.opacity = '0.55';
            container.appendChild(card);
        });

        UI.showScreen('screen-training');
    },

    doTraining(training) {
        const attrKeys = training.attrs
            ? training.attrs
            : training.attr === 'all'
                ? Object.keys(this.attributes)
                : [training.attr];

        let improved = false;
        attrKeys.forEach(k => {
            if (this.attributes[k].value < this.attributes[k].max) {
                this.attributes[k].value = Math.min(this.attributes[k].max, this.attributes[k].value + training.gain);
                improved = true;
            }
        });

        this.hasTrainedThisTournament = true;
        this.updateHub();
        UI.showScreen('screen-hub');

        if (improved) {
            showMessage(`Training abgeschlossen!<br><span style="font-size:0.5em;color:#fff;border:none">${training.label.replace(/^\S+\s/, '')}</span>`, 2000);
        }
    },

    skipTraining() {
        UI.showScreen('screen-hub');
    },

    // --- SAISON-ABSCHLUSS ---

    showSeasonSummary() {
        this.seasonStats.endRank = this.getPlayerRank();
        this.careerStats.seasonsPlayed++;

        const rankChange = this.seasonStats.startRank - this.seasonStats.endRank;
        const rankChangeTxt = rankChange > 0
            ? `<span style="color:#4ade80">▲ ${rankChange} Plätze verbessert</span>`
            : rankChange < 0
                ? `<span style="color:#f87171">▼ ${Math.abs(rankChange)} Plätze verloren</span>`
                : `<span style="color:#94a3b8">Keine Platzierungsänderung</span>`;

        const winRate = this.seasonStats.matches > 0
            ? Math.round((this.seasonStats.wins / this.seasonStats.matches) * 100)
            : 0;

        _setText('summary-title', `Saison ${this.currentSeason} abgeschlossen`, true);

        const grades = [
            { rank: 1,  text: '🥇 WELTMEISTER! Absolute Spitzenleistung!', color: '#facc15' },
            { rank: 3,  text: '🥈 Top 3 – Du gehörst zur Weltklasse!',      color: '#e2e8f0' },
            { rank: 8,  text: '🥉 Top 8 – Starke Saison!',                  color: '#f97316' },
            { rank: 16, text: '📈 Noch Luft nach oben – weiter trainieren!', color: '#94a3b8' },
        ];
        const grade = grades.find(g => this.seasonStats.endRank <= g.rank) || grades[grades.length - 1];

        document.getElementById('summary-content').innerHTML = `
            <div class="summary-grade" style="color:${grade.color}">${grade.text}</div>
            <div class="summary-grid">
                <div class="summary-stat">
                    <div class="summary-stat-label">Endrang</div>
                    <div class="summary-stat-value">${this.seasonStats.endRank} / 16</div>
                    <div class="summary-stat-sub">${rankChangeTxt}</div>
                </div>
                <div class="summary-stat">
                    <div class="summary-stat-label">Titel</div>
                    <div class="summary-stat-value" style="color:#facc15">${this.seasonStats.titles} 🏆</div>
                </div>
                <div class="summary-stat">
                    <div class="summary-stat-label">Bilanz</div>
                    <div class="summary-stat-value">${this.seasonStats.wins}W / ${this.seasonStats.matches - this.seasonStats.wins}L</div>
                    <div class="summary-stat-sub">${winRate}% Siegquote</div>
                </div>
                <div class="summary-stat">
                    <div class="summary-stat-label">Bestes Ergebnis</div>
                    <div class="summary-stat-value">${this.seasonStats.bestResult || '—'}</div>
                </div>
            </div>
            <div class="summary-note">
                ℹ️ Nächste Saison: Alle Punkte werden um 25% reduziert. Bleib am Ball!
            </div>
        `;

        UI.showScreen('screen-season-summary');
    },

    startNextSeason() {
        this.currentSeason++;
        this.currentTournamentIndex = 0;
        this.hasTrainedThisTournament = false;
        this.players.forEach(p => { p.points = Math.floor(p.points * 0.75); });
        this.tournaments = this.SEASON_SCHEDULE.map(t => ({ ...t }));
        this._resetSeasonStats();
        this.updateHub();
        UI.showScreen('screen-hub');
        showMessage(`Saison ${this.currentSeason} beginnt!`, 2000);
    },

    // --- TABELLEN ---

    updateRankingsTable() {
        const tbl = document.getElementById('rankings-table');
        tbl.innerHTML = '<tr><th>Rang</th><th>Name</th><th>Punkte</th><th>Titel</th></tr>';
        this.players.forEach((p, i) => {
            const tr = document.createElement('tr');
            if (p.isPlayer) tr.classList.add('player-row');
            tr.innerHTML = `<td>${i + 1}</td><td>${getPlayerDisplayName(p)}</td><td>${p.points}</td><td>${p.trophies}</td>`;
            tbl.appendChild(tr);
        });
    },

    updateCalendarTable() {
        const tbl = document.getElementById('calendar-table');
        tbl.innerHTML = '<tr><th>Turnier</th><th>Punkte</th><th>Status</th></tr>';
        this.tournaments.forEach((t, i) => {
            const tr = document.createElement('tr');
            let status = 'Geplant', color = '';
            if (i < this.currentTournamentIndex) { status = 'Abgeschlossen'; color = '#64748b'; }
            else if (i === this.currentTournamentIndex) { status = 'Aktuell ▶'; color = '#facc15'; }
            tr.innerHTML = `<td>${t.name}</td><td>${t.points}</td><td>${status}</td>`;
            if (color) tr.style.color = color;
            tbl.appendChild(tr);
        });
    },

    // --- KARRIERE-ÜBERSICHT ---

    showCareerOverview() {
        const rank = this.getPlayerRank();
        const winRate = this.careerStats.totalMatches > 0
            ? Math.round((this.careerStats.totalWins / this.careerStats.totalMatches) * 100)
            : 0;

        document.getElementById('career-overview-content').innerHTML = `
            <div class="overview-stats">
                <div class="overview-stat-row"><span>Aktuelle Saison</span><strong>${this.currentSeason}</strong></div>
                <div class="overview-stat-row"><span>Aktuelle Platzierung</span><strong>${rank} / 16</strong></div>
                <div class="overview-stat-row"><span>Beste Platzierung ever</span><strong>${this.careerStats.bestRank === 999 ? '—' : this.careerStats.bestRank}</strong></div>
                <div class="overview-stat-row"><span>Rekordhoch Punkte</span><strong>${this.careerStats.peakPoints}</strong></div>
                <div class="overview-stat-row"><span>Karriere-Titel</span><strong style="color:#facc15">${this.careerStats.totalTitles} 🏆</strong></div>
                <div class="overview-stat-row"><span>Gespielte Matches</span><strong>${this.careerStats.totalMatches}</strong></div>
                <div class="overview-stat-row"><span>Karriere-Bilanz</span><strong>${this.careerStats.totalWins}W / ${this.careerStats.totalMatches - this.careerStats.totalWins}L (${winRate}%)</strong></div>
            </div>
            <div class="overview-attributes">
                <h3 style="margin:16px 0 10px;color:#38bdf8">Spielerattribute</h3>
                ${Object.entries(this.attributes).map(([k, a]) => `
                    <div class="attr-row">
                        <span class="attr-label">${a.label}</span>
                        <div class="attr-bar">
                            <div class="attr-fill" style="width:${Math.min(100, ((a.value - 1.0) / (a.max - 1.0)) * 100)}%"></div>
                        </div>
                        <span class="attr-val">${a.value.toFixed(2)}</span>
                    </div>
                `).join('')}
            </div>
        `;
        UI.showScreen('screen-career-overview');
    },

    // --- TURNIER ---

    enterTournament() {
        const t = this.tournaments[this.currentTournamentIndex];
        if (!t) return;

        const rank = this.getPlayerRank();
        if (t.top8Only && rank > 8) {
            if (confirm('Du bist nicht qualifiziert (Top 8 nötig). Turnier überspringen und simulieren?')) {
                this._simulateFullTournamentAsSpectator();
            }
            return;
        }
        if (t.top6Only && rank > 6) {
            if (confirm('Du bist nicht qualifiziert (Top 6 nötig). Turnier überspringen und simulieren?')) {
                this._simulateFullTournamentAsSpectator();
            }
            return;
        }

        let participants = [...this.players].slice(0, 8);
        if (!participants.includes(this.playerObj)) participants[7] = this.playerObj;
        participants.sort(() => Math.random() - 0.5);

        this.bracket = [];
        for (let i = 0; i < participants.length; i += 2) {
            this.bracket.push({ p1: participants[i], p2: participants[i + 1], winner: null });
        }

        this.updateBracketUI();
        UI.showScreen('screen-bracket');
    },

    playNextMatch() {
        currentMatchType = 'career';
        const match = this.bracket.find(m => !m.winner && (m.p1 === this.playerObj || m.p2 === this.playerObj));
        if (match) {
            const opponent = match.p1 === this.playerObj ? match.p2 : match.p1;
            start3DMatch(opponent);
        }
    },

    leaveTournament() {
        UI.showScreen('screen-hub');
    },

    resolvePlayerMatch(playerWon) {
        this.careerStats.totalMatches++;
        this.seasonStats.matches++;
        if (playerWon) { this.careerStats.totalWins++; this.seasonStats.wins++; }
        this.recentResults.push(playerWon ? 'W' : 'L');
        if (this.recentResults.length > 5) this.recentResults.shift();

        const match = this.bracket.find(m => !m.winner && (m.p1 === this.playerObj || m.p2 === this.playerObj));
        match.winner = playerWon
            ? this.playerObj
            : (match.p1 === this.playerObj ? match.p2 : match.p1);

        // Simuliere restliche Matches dieser Runde
        this.bracket.forEach(m => {
            if (!m.winner) {
                const p = m.p1.skill / (m.p1.skill + m.p2.skill);
                m.winner = Math.random() < p ? m.p1 : m.p2;
            }
        });

        this._updateBestResult(playerWon);

        if (!playerWon) {
            this._awardRoundPoints();
            this._simulateRemainingRounds();
            return;
        }
        this._advanceBracket();
    },

    _updateBestResult(playerWon) {
        const round = this.getRoundName();
        const priority = ['Viertelfinale', 'Halbfinale', 'Finalist', 'Turniersieg!'];
        let result;
        if (!playerWon) {
            result = round === 'Finale' ? 'Finalist' : round;
        } else {
            result = round === 'Finale' ? 'Turniersieg!' : round;
        }
        const cur = priority.indexOf(this.seasonStats.bestResult);
        const nxt = priority.indexOf(result);
        if (nxt > cur) this.seasonStats.bestResult = result;
    },

    _awardRoundPoints() {
        const pts = this.tournaments[this.currentTournamentIndex].points;
        this.bracket.forEach(m => {
            const loser = m.winner === m.p1 ? m.p2 : m.p1;
            const pct = this.bracket.length >= 4 ? 0.10 : this.bracket.length === 2 ? 0.25 : 0.60;
            loser.points += Math.floor(pts * pct);
        });
    },

    _advanceBracket() {
        this._awardRoundPoints();
        const winners = this.bracket.map(m => m.winner);

        if (winners.length === 1) {
            const pts = this.tournaments[this.currentTournamentIndex].points;
            winners[0].points += pts;
            winners[0].trophies += 1;
            if (winners[0] === this.playerObj) {
                this.careerStats.totalTitles++;
                this.seasonStats.titles++;
                showMessage('🏆 TURNIERSIEG!<br><span style="font-size:0.5em;color:#fff;border:none">Herzlichen Glückwunsch!</span>', 3000);
            }
            this.updateBracketUI();
            this.hasTrainedThisTournament = false;
            this.currentTournamentIndex++;
            setTimeout(() => { this.updateHub(); UI.showScreen('screen-hub'); }, winners[0] === this.playerObj ? 3000 : 500);
            return;
        }

        this.bracket = [];
        for (let i = 0; i < winners.length; i += 2) {
            this.bracket.push({ p1: winners[i], p2: winners[i + 1], winner: null });
        }
        this.updateBracketUI();
        UI.showScreen('screen-bracket');
    },

    _simulateRemainingRounds() {
        const pts = this.tournaments[this.currentTournamentIndex].points;
        let currentWinners = this.bracket.map(m => m.winner);

        while (currentWinners.length > 1) {
            const next = [];
            for (let i = 0; i < currentWinners.length; i += 2) {
                const p1 = currentWinners[i], p2 = currentWinners[i + 1];
                const winner = Math.random() < p1.skill / (p1.skill + p2.skill) ? p1 : p2;
                const loser  = winner === p1 ? p2 : p1;
                const pct = currentWinners.length === 4 ? 0.25 : 0.60;
                loser.points += Math.floor(pts * pct);
                next.push(winner);
            }
            currentWinners = next;
        }

        currentWinners[0].points += pts;
        currentWinners[0].trophies += 1;
        this.hasTrainedThisTournament = false;
        this.currentTournamentIndex++;
        this.updateHub();
        UI.showScreen('screen-hub');
    },

    _simulateFullTournamentAsSpectator() {
        const pts = this.tournaments[this.currentTournamentIndex].points;
        let participants = [...this.players].slice(0, 8);

        let currentWinners = participants;
        while (currentWinners.length > 1) {
            const next = [];
            for (let i = 0; i < currentWinners.length; i += 2) {
                const p1 = currentWinners[i], p2 = currentWinners[i + 1];
                const winner = Math.random() < p1.skill / (p1.skill + p2.skill) ? p1 : p2;
                const loser  = winner === p1 ? p2 : p1;
                const pct = currentWinners.length >= 8 ? 0.10 : currentWinners.length === 4 ? 0.25 : 0.60;
                loser.points += Math.floor(pts * pct);
                next.push(winner);
            }
            currentWinners = next;
        }
        currentWinners[0].points += pts;
        currentWinners[0].trophies += 1;
        this.hasTrainedThisTournament = false;
        this.currentTournamentIndex++;
        this.updateHub();
        UI.showScreen('screen-hub');
        showMessage(`Turnier beendet. Sieger: ${currentWinners[0].name}`, 2500);
    },

    updateBracketUI() {
        const container = document.getElementById('bracket-view');
        container.innerHTML = '';
        const titleEl = document.getElementById('bracket-title');
        if (titleEl) titleEl.innerText = this.getRoundName();

        let matchNum = 1;
        this.bracket.forEach(match => {
            const div = document.createElement('div');
            div.className = 'bracket-match';

            let p1Name = match.p1 ? getPlayerDisplayName(match.p1) : '???';
            let p2Name = match.p2 ? getPlayerDisplayName(match.p2) : '???';
            if (match.p1 && match.p1.isPlayer) p1Name = `<strong class="player-highlight">${p1Name}</strong>`;
            if (match.p2 && match.p2.isPlayer) p2Name = `<strong class="player-highlight">${p2Name}</strong>`;

            let winnerHtml = '';
            if (match.winner) {
                const cls = match.winner.isPlayer ? 'win-player' : 'win-ai';
                winnerHtml = `<div class="match-winner ${cls}">→ ${getPlayerDisplayName(match.winner)}</div>`;
            }

            div.innerHTML = `
                <div class="match-num">Match ${matchNum}</div>
                <div class="match-players">${p1Name} <span class="vs">vs</span> ${p2Name}</div>
                ${winnerHtml}
            `;
            container.appendChild(div);
            matchNum++;
        });

        const playerStillIn = this.bracket.some(m => !m.winner && (m.p1 === this.playerObj || m.p2 === this.playerObj));
        const nextBtn  = document.getElementById('btn-next-match');
        const leaveBtn = document.getElementById('btn-leave-tournament');
        if (nextBtn)  nextBtn.classList.toggle('hidden', !playerStillIn);
        if (leaveBtn) leaveBtn.classList.toggle('hidden', playerStillIn);
    },
};

// Hilfsfunktion für innere HTML-Zuweisung
function _setText(id, val, isHtml = false) {
    const el = document.getElementById(id);
    if (!el) return;
    if (isHtml) el.innerHTML = val;
    else el.innerText = val;
}

// --- UI OBJEKT ---
const UI = {
    showScreen(id) {
        document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
        document.getElementById(id).classList.add('active');
        document.getElementById('menu-layer').classList.add('active');
        document.getElementById('ui-container').classList.add('hidden');
        document.getElementById('status-message').classList.add('hidden');
        appMode = 'menu';
    },
    hideMenu() {
        document.getElementById('menu-layer').classList.remove('active');
        document.getElementById('ui-container').classList.remove('hidden');
        appMode = 'match';
    },
    showRankings() {
        Career.updateRankingsTable();
        this.showScreen('screen-rankings');
    },
    showCalendar() {
        Career.updateCalendarTable();
        this.showScreen('screen-calendar');
    },
};

// --- EXHIBITION ---
function startExhibition() {
    currentMatchType = 'exhibition';
    const selectEl = document.getElementById('exhibition-difficulty');
    const diff = parseFloat(selectEl.value);
    const diffName = selectEl.options[selectEl.selectedIndex].text;
    start3DMatch({ name: `Bot (${diffName})`, skill: diff, trophies: 0 });
}

function start3DMatch(opponentObj) {
    currentAI = generateAIProfile(opponentObj.skill * (Career.playerObj ? Career.getFormMultiplier() : 1.0));
    _setText('ai-name-display', '', true);
    document.getElementById('ai-name-display').innerHTML = getPlayerDisplayName(opponentObj);
    document.getElementById('player-name-display').innerHTML = Career.playerObj
        ? getPlayerDisplayName(Career.playerObj) : 'DU';

    gameState.playerScore = 0;
    gameState.aiScore = 0;
    gameState.pointsPlayed = 0;
    gameState.server = 'player';
    _setText('player-score', '0');
    _setText('ai-score', '0');

    UI.hideMenu();
    gameState.serving = true;
    showMessage(`Match gegen ${opponentObj.name}<br><span style="font-size:0.5em;color:#fff;border:none">Klicken zum Aufschlagen</span>`, 0);
}

// --- 6. INPUT & STEUERUNG ---
const mouse = new THREE.Vector2();
let mouseVelX = 0, mouseVelY = 0, lastMouseX = 0, lastMouseY = 0;

window.addEventListener('mousemove', e => {
    mouse.x = (e.clientX / window.innerWidth)  *  2 - 1;
    mouse.y = (e.clientY / window.innerHeight) * -2 + 1;
    mouseVelX = mouse.x - lastMouseX;
    mouseVelY = mouse.y - lastMouseY;
    lastMouseX = mouse.x;
    lastMouseY = mouse.y;
});

window.addEventListener('click', e => {
    if (appMode !== 'match') return;
    if (e.target.closest('.screen') || e.target.tagName === 'BUTTON') return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (gameState.serving && gameState.server === 'player') serveBall();
});

// --- 7. SPIEL-LOGIK & PHYSIK ---

function showMessage(text, timeout = 2000) {
    const el = document.getElementById('status-message');
    el.innerHTML = text;
    el.classList.remove('hidden');
    if (timeout) setTimeout(() => el.classList.add('hidden'), timeout);
}

function updateScore(winner) {
    if (winner === 'player') gameState.playerScore++;
    else gameState.aiScore++;
    gameState.pointsPlayed++;

    _setText('player-score', gameState.playerScore);
    _setText('ai-score', gameState.aiScore);

    // Aufschlagwechsel: im Einstand (Deuce) nach jedem Punkt, sonst alle 2 Punkte
    const minScore  = Math.min(gameState.playerScore, gameState.aiScore);
    const inDeuce   = minScore >= 10;
    if (inDeuce || gameState.pointsPlayed % 2 === 0) {
        gameState.server = gameState.server === 'player' ? 'ai' : 'player';
    }
    gameState.isActive = false;

    // Einstand-Regel: Sieg erst bei mind. 11 Punkten UND 2 Punkte Vorsprung
    const maxScore = Math.max(gameState.playerScore, gameState.aiScore);
    const diff     = Math.abs(gameState.playerScore - gameState.aiScore);

    if (maxScore >= 11 && diff >= 2) {
        const playerWon = gameState.playerScore > gameState.aiScore;
        showMessage(`MATCH<br><span style="font-size:0.5em;color:#fff">${playerWon ? 'Du gewinnst!' : 'KI gewinnt!'}</span>`, 0);
        setTimeout(() => {
            document.getElementById('status-message').classList.add('hidden');
            if (currentMatchType === 'career') {
                Career.resolvePlayerMatch(playerWon);
            } else {
                UI.showScreen('screen-main');
            }
        }, 3000);
    } else {
        let msg;
        if (inDeuce && diff === 0) {
            msg = '⚖️ Einstand!';
        } else if (inDeuce && diff === 1) {
            msg = winner === 'player' ? '✨ Vorteil Du' : '🎯 Vorteil KI';
        } else {
            msg = winner === 'player' ? 'Punkt für Dich' : 'Punkt für KI';
        }
        const subMsg = gameState.server === 'player' ? 'Dein Aufschlag (Klick)' : 'KI schlägt auf';
        showMessage(`${msg}<br><span style="font-size:0.4em;color:#fff;border:none">${subMsg}</span>`, 0);
        setTimeout(() => {
            gameState.serving = true;
            if (gameState.server === 'ai') setTimeout(serveBall, 1000);
        }, 1000);
    }
}

function serveBall() {
    gameState.serving = false;
    gameState.isActive = true;
    gameState.bouncesPlayerSide = 0;
    gameState.bouncesAiSide = 0;
    gameState.hitCount = 1;
    document.getElementById('status-message').classList.add('hidden');

    if (gameState.server === 'player') {
        ballState.pos.copy(playerPaddle.position).setZ(PADDLE_Z - 0.1);
        executeHit(playerPaddle.position, -1, currentAI.basePlayerSpeed, true);
        gameState.turn = 'ai';
    } else {
        ballState.pos.copy(aiPaddle.position).setZ(-PADDLE_Z + 0.1);
        executeHit(aiPaddle.position, 1, currentAI.returnSpeed, true);
        gameState.turn = 'player';
    }
    playSound('hit');
}

function executeHit(paddlePos, zDir, speedZ, isServe) {
    if (isServe) {
        const serveVx = zDir > 0 ? (Math.random() - 0.5) * 0.5 : Math.max(-1.5, Math.min(1.5, mouseVelX * 25));
        ballState.pos.y = TABLE_HEIGHT + 0.3;
        ballState.vel.set(serveVx, -1.5, 3.5 * zDir);
        ballState.spin = 0;
        return;
    }

    const attrSpeed = Career.playerObj ? Career.attributes.speed.value : 1.0;
    const attrPower = Career.playerObj ? Career.attributes.power.value : 1.0;
    const attrCons  = Career.playerObj ? Career.attributes.consistency.value : 1.0;
    const attrSpin  = Career.playerObj ? Career.attributes.spin.value : 1.0;

    let targetX = 0;
    if (zDir > 0) {
        targetX = -paddlePos.x * 0.5 + (Math.random() - 0.5) * currentAI.error;
    } else {
        targetX = -paddlePos.x * 0.3 + mouseVelX * 60;
        targetX += (Math.random() - 0.5) * (0.05 / attrCons);
    }
    targetX = Math.max(-TABLE_WIDTH / 2 + 0.02, Math.min(TABLE_WIDTH / 2 - 0.02, targetX));

    const targetZ = (TABLE_LENGTH / 4) * zDir;
    const distZ   = targetZ - ballState.pos.z;
    const t       = Math.abs(distZ / speedZ);
    const targetY = TABLE_HEIGHT;
    const requiredVy = (targetY - ballState.pos.y + 0.5 * ballState.gravity * t * t) / t;

    let spin = 0;
    if (zDir < 0) {
        spin = Math.max(0, mouseVelY * 50 * attrSpin);
    }

    const adjustedSpeedZ = zDir < 0 ? speedZ * attrPower * attrSpeed : speedZ;
    ballState.vel.set((targetX - ballState.pos.x) / t, requiredVy + spin * 0.02, adjustedSpeedZ * zDir);
    ballState.spin = spin;
}

function updatePhysics(dt) {
    if (gameState.serving) {
        if (gameState.server === 'player') {
            ballState.pos.set(playerPaddle.position.x, playerPaddle.position.y + 0.1, playerPaddle.position.z - 0.1);
        } else {
            ballState.pos.set(aiPaddle.position.x, aiPaddle.position.y - 0.1, aiPaddle.position.z + 0.1);
        }
        ball.position.copy(ballState.pos);
        return;
    }

    const magnusForce = ballState.spin * Math.abs(ballState.vel.z) * 0.015;
    ballState.vel.y -= (ballState.gravity + magnusForce) * dt;
    ballState.pos.addScaledVector(ballState.vel, dt);

    // Tischaufprall
    if (ballState.pos.y < TABLE_HEIGHT + BALL_RADIUS && ballState.vel.y < 0) {
        if (Math.abs(ballState.pos.x) < TABLE_WIDTH / 2 && Math.abs(ballState.pos.z) < TABLE_LENGTH / 2) {
            playSound('bounce');
            ballState.pos.y = TABLE_HEIGHT + BALL_RADIUS;
            ballState.vel.y *= -0.85;
            ballState.vel.z += ballState.spin * 0.05;

            if (gameState.isActive) {
                const onPlayerSide = ballState.pos.z > 0;
                if (onPlayerSide) gameState.bouncesPlayerSide++;
                else gameState.bouncesAiSide++;

                const isServe = gameState.hitCount === 1;
                if (gameState.turn === 'ai') {
                    if (isServe) {
                        if (gameState.bouncesPlayerSide > 1) updateScore('ai');
                        else if (gameState.bouncesAiSide > 0 && gameState.bouncesPlayerSide === 0) updateScore('ai');
                        else if (gameState.bouncesAiSide > 1) updateScore('player');
                    } else {
                        if (gameState.bouncesPlayerSide > 0) updateScore('ai');
                        else if (gameState.bouncesAiSide > 1) updateScore('player');
                    }
                } else {
                    if (isServe) {
                        if (gameState.bouncesAiSide > 1) updateScore('player');
                        else if (gameState.bouncesPlayerSide > 0 && gameState.bouncesAiSide === 0) updateScore('player');
                        else if (gameState.bouncesPlayerSide > 1) updateScore('ai');
                    } else {
                        if (gameState.bouncesAiSide > 0) updateScore('player');
                        else if (gameState.bouncesPlayerSide > 1) updateScore('ai');
                    }
                }
            }
        }
    }

    // Netz-Kollision
    if (Math.abs(ballState.pos.z) < BALL_RADIUS && ballState.pos.y < TABLE_HEIGHT + NET_HEIGHT) {
        ballState.vel.z *= -0.2;
        ballState.vel.x *= 0.5;
        if (gameState.isActive) updateScore(gameState.turn === 'ai' ? 'ai' : 'player');
    }

    // Spieler-Schläger (großzügige Hitbox gegen Tunneling)
    if (ballState.pos.z > playerPaddle.position.z - 0.4 &&
        ballState.pos.z < playerPaddle.position.z + 0.4 &&
        ballState.vel.z > 0) {
        if (Math.abs(ballState.pos.x - playerPaddle.position.x) < 0.4 &&
            Math.abs(ballState.pos.y - playerPaddle.position.y) < 0.4) {

            playSound('hit');
            const attrPower = Career.playerObj ? Career.attributes.power.value : 1.0;
            const attrSpeed = Career.playerObj ? Career.attributes.speed.value : 1.0;
            const totalMV = Math.sqrt(mouseVelX * mouseVelX + mouseVelY * mouseVelY);
            let speed = currentAI.basePlayerSpeed * attrSpeed + totalMV * 20 * attrPower;
            speed = Math.min(speed, currentAI.maxPlayerSpeed * attrPower);
            executeHit(playerPaddle.position, -1, speed, false);

            if (gameState.isActive) {
                gameState.turn = 'ai';
                gameState.bouncesPlayerSide = 0;
                gameState.bouncesAiSide = 0;
                gameState.hitCount++;
            }
        }
    }

    // KI-Schläger (striktere Hitbox)
    if (ballState.pos.z < aiPaddle.position.z + 0.2 &&
        ballState.pos.z > aiPaddle.position.z - 0.2 &&
        ballState.vel.z < 0) {
        if (Math.abs(ballState.pos.x - aiPaddle.position.x) < 0.15) {
            playSound('hit');
            const distToCenter = Math.abs(ballState.pos.x - aiPaddle.position.x);
            const reachPenalty = distToCenter > 0.08 ? 0.4 : 0;
            const prevError = currentAI.error;
            currentAI.error += reachPenalty;
            executeHit(aiPaddle.position, 1, currentAI.returnSpeed, false);
            currentAI.error = prevError;

            if (gameState.isActive) {
                gameState.turn = 'player';
                gameState.bouncesPlayerSide = 0;
                gameState.bouncesAiSide = 0;
                gameState.hitCount++;
            }
        }
    }

    // Ball fällt (Aus)
    if (ballState.pos.y < 0.1) {
        if (gameState.isActive) {
            if (gameState.turn === 'ai') {
                if (gameState.hitCount === 1) {
                    if (gameState.bouncesPlayerSide === 1 && gameState.bouncesAiSide === 1) updateScore('player');
                    else updateScore('ai');
                } else {
                    if (gameState.bouncesAiSide === 1) updateScore('player');
                    else updateScore('ai');
                }
            } else {
                if (gameState.hitCount === 1) {
                    if (gameState.bouncesAiSide === 1 && gameState.bouncesPlayerSide === 1) updateScore('ai');
                    else updateScore('player');
                } else {
                    if (gameState.bouncesPlayerSide === 1) updateScore('ai');
                    else updateScore('player');
                }
            }
        }
        ballState.pos.y = 0.1;
        ballState.vel.y *= -0.5;
        ballState.vel.x *= 0.8;
        ballState.vel.z *= 0.8;
    }

    ball.position.copy(ballState.pos);
}

function updateAI(dt) {
    if (!gameState.isActive || ballState.vel.z > 0) {
        aiTargetPos.set(0, TABLE_HEIGHT + 0.2, -PADDLE_Z);
        aiPaddle.position.lerp(aiTargetPos, 3 * dt);
        return;
    }
    aiReactionTimer -= dt;
    if (aiReactionTimer <= 0) {
        const t = Math.abs((aiPaddle.position.z - ballState.pos.z) / ballState.vel.z);
        const predX = ballState.pos.x + ballState.vel.x * t;
        const predY = ballState.pos.y + ballState.vel.y * t - 0.5 * ballState.gravity * t * t;
        aiTargetPos.set(
            Math.max(-TABLE_WIDTH / 2, Math.min(TABLE_WIDTH / 2, predX)),
            Math.max(TABLE_HEIGHT + 0.1, predY),
            -PADDLE_Z
        );
        aiReactionTimer = currentAI.reactionDelay;
    }
    const dx = aiTargetPos.x - aiPaddle.position.x;
    const dy = aiTargetPos.y - aiPaddle.position.y;
    const maxMove = currentAI.speed * dt;
    aiPaddle.position.x += Math.abs(dx) > maxMove ? Math.sign(dx) * maxMove : dx;
    aiPaddle.position.y += Math.abs(dy) > maxMove ? Math.sign(dy) * maxMove : dy;
}

function updateTrail() {
    for (let i = trailPoints.length - 1; i >= 3; i--) {
        trailPoints[i] = trailPoints[i - 3];
    }
    trailPoints[0] = ball.position.x;
    trailPoints[1] = ball.position.y;
    trailPoints[2] = ball.position.z;
    trail.geometry.attributes.position.needsUpdate = true;
}

// --- 8. MAIN LOOP ---
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);

    if (appMode !== 'match') {
        renderer.render(scene, camera);
        return;
    }

    const dt = Math.min(clock.getDelta(), 0.05);

    const targetX = mouse.x * (TABLE_WIDTH / 1.8);
    const attrSpeed = Career.playerObj ? Career.attributes.speed.value : 1.0;
    const lerpFactor = Math.min(0.4 + (attrSpeed - 1.0) * 0.15, 0.8);
    const targetY = Math.max(TABLE_HEIGHT - 0.1, TABLE_HEIGHT + (mouse.y + 0.5) * 1.2);

    playerPaddle.position.x += (targetX - playerPaddle.position.x) * lerpFactor;
    playerPaddle.position.y += (targetY - playerPaddle.position.y) * lerpFactor;
    playerPaddle.position.z = PADDLE_Z;
    playerPaddle.rotation.y = playerPaddle.position.x * -0.2;

    updatePhysics(dt);
    updateAI(dt);
    if (gameState.isActive || gameState.serving) updateTrail();

    camera.position.x = playerPaddle.position.x * 0.3;
    camera.lookAt(0, TABLE_HEIGHT, 0);

    renderer.render(scene, camera);
}

// --- 9. INITIALISIERUNG ---
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
UI.showScreen('screen-main');
