/**
 * STATE OF THE ART - 3D Table Tennis Engine
 * Author: Senior WebGL Developer
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

// --- 2. KONSTANTEN & ZUSTAND (Offizielle ITTF Maße in Metern) ---
const TABLE_WIDTH = 1.525;
const TABLE_LENGTH = 2.74;
const TABLE_HEIGHT = 0.76;
const NET_HEIGHT = 0.1525;
const BALL_RADIUS = 0.02;
const PADDLE_RADIUS = 0.08;
const PADDLE_Z = TABLE_LENGTH / 2 + 0.3; // Spieler Position

const gameState = {
    playerScore: 0,
    aiScore: 0,
    serving: true,
    server: 'player', // 'player' oder 'ai'
    pointsPlayed: 0,
    turn: 'player', // Wer muss den Ball als nächstes spielen?
    bouncesPlayerSide: 0,
    bouncesAiSide: 0,
    hitCount: 0,
    isActive: false
};

const ballState = {
    pos: new THREE.Vector3(0, TABLE_HEIGHT + 0.5, PADDLE_Z - 0.2),
    vel: new THREE.Vector3(0, 0, 0),
    spin: 0, // Topspin
    gravity: 9.81
};

let appMode = 'menu'; // 'menu', 'exhibition', 'career'
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

// Raum & Beleuchtung
scene.add(new THREE.AmbientLight(0xffffff, 0.4));
const dirLight = new THREE.SpotLight(0xffffff, 1.2);
dirLight.position.set(0, 5, 0);
dirLight.angle = Math.PI / 3;
dirLight.penumbra = 0.5;
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
scene.add(dirLight);

// Raumumgebung (Halle)
const floorGeo = new THREE.PlaneGeometry(20, 20);
const floorMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 });
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// --- 4. SPIELOBJEKTE ---
// Tischplatte
const tableMat = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.2, metalness: 0.1 });
const table = new THREE.Mesh(new THREE.BoxGeometry(TABLE_WIDTH, TABLE_HEIGHT, TABLE_LENGTH), tableMat);
table.position.y = TABLE_HEIGHT / 2;
table.receiveShadow = true;
table.castShadow = true;
scene.add(table);

// Linien
const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
function createLine(w, d, x, z) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(w, 0.001, d), lineMat);
    line.position.set(x, TABLE_HEIGHT + 0.001, z);
    scene.add(line);
}
createLine(TABLE_WIDTH, 0.015, 0, 0); // Netz-Mittellinie
createLine(0.015, TABLE_LENGTH, 0, 0); // Längs-Mittellinie
createLine(TABLE_WIDTH, 0.015, 0, TABLE_LENGTH/2); // Spieler Grundlinie
createLine(TABLE_WIDTH, 0.015, 0, -TABLE_LENGTH/2); // AI Grundlinie
createLine(0.015, TABLE_LENGTH, TABLE_WIDTH/2, 0); // Seitenlinie rechts
createLine(0.015, TABLE_LENGTH, -TABLE_WIDTH/2, 0); // Seitenlinie links

// Netz
const netMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.2, wireframe: true });
const net = new THREE.Mesh(new THREE.PlaneGeometry(TABLE_WIDTH, NET_HEIGHT), netMat);
net.position.set(0, TABLE_HEIGHT + NET_HEIGHT / 2, 0);
scene.add(net);
// Netz-Oberkante
createLine(TABLE_WIDTH, 0.01, 0, 0);
scene.children[scene.children.length-1].position.y = TABLE_HEIGHT + NET_HEIGHT;

// Funktion zum Erstellen eines Schlägers (Holz + rote/schwarze Beläge)
function createPaddle() {
    const group = new THREE.Group();
    // Holz
    const blade = new THREE.Mesh(new THREE.CylinderGeometry(PADDLE_RADIUS, PADDLE_RADIUS, 0.01, 32), new THREE.MeshStandardMaterial({ color: 0x8b5a2b }));
    blade.rotation.x = Math.PI / 2;
    group.add(blade);
    // Roter Belag (Vorderseite)
    const redRubber = new THREE.Mesh(new THREE.CylinderGeometry(PADDLE_RADIUS - 0.002, PADDLE_RADIUS - 0.002, 0.012, 32), new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.8 }));
    redRubber.rotation.x = Math.PI / 2;
    group.add(redRubber);
    // Griff
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 0.02), new THREE.MeshStandardMaterial({ color: 0x8b5a2b }));
    handle.position.set(0, -PADDLE_RADIUS - 0.04, 0);
    group.add(handle);
    
    group.castShadow = true;
    return group;
}

const playerPaddle = createPaddle();
scene.add(playerPaddle);

const aiPaddle = createPaddle();
aiPaddle.rotation.y = Math.PI; // Schwarze Seite zeigen
scene.add(aiPaddle);

// Ball
const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_RADIUS, 32, 32), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1 }));
ball.castShadow = true;
ball.receiveShadow = true;
scene.add(ball);

// Ball-Trail (Schweif für Geschwindigkeitsgefühl)
const trailLength = 15;
const trailPoints = new Float32Array(trailLength * 3);
const trailGeo = new THREE.BufferGeometry();
trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPoints, 3));
const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }));
scene.add(trail);

// --- KARRIERE & TURNIER ENGINE ---
const AI_NAMES = ["Ma Long", "Fan Zhendong", "Timo Boll", "Dimitrij Ovtcharov", "Hugo Calderano", "Tomokazu Harimoto", "Lin Yun-Ju", "Truls Moregardh", "Mattias Falck", "Simon Gauzy", "Koki Niwa", "Liam Pitchford", "Anton Kallberg", "Quadri Aruna", "Darko Jorgic", "Jang Woojin"];

let currentAI = null; // Aktuelles KI-Profil für das laufende Match
let aiTargetPos = new THREE.Vector3(0, TABLE_HEIGHT + 0.2, -PADDLE_Z);
let aiReactionTimer = 0;

// Dynamisches KI-Profil basierend auf einem Skill-Wert (0.0 = extrem schlecht, 1.0 = Gott)
function generateAIProfile(skill) {
    return {
        speed: 1.0 + (skill * 3.5), // 1.0 bis 4.5
        error: 0.5 - (skill * 0.48), // 0.5 bis 0.02
        reactionDelay: 0.4 - (skill * 0.35), // 0.4 bis 0.05
        returnSpeed: 2.5 + (skill * 5.5), // 2.5 bis 8.0
        basePlayerSpeed: 2.5 + (skill * 2.0), // Maximale Power des Spielers
        maxPlayerSpeed: 5.0 + (skill * 9.0)
    };
}

// Hilfsfunktion für die Anzeige der Pokale
function getPlayerDisplayName(player) {
    if (!player) return "???";
    let name = player.name;
    if (player.trophies && player.trophies > 0) {
        name += ` <span style="color:#facc15; font-size: 0.8em;">🏆${player.trophies}</span>`;
    }
    return name;
}

const UI = {
    showScreen(id) {
        document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
        document.getElementById(id).classList.add('active');
        document.getElementById('menu-layer').classList.add('active');
        document.getElementById('ui-container').classList.add('hidden');
        document.getElementById('status-message').classList.add('hidden'); // Bugfix: Message-Overlay entfernen
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
    }
};

const Career = {
    players: [],
    tournaments: [
        { name: "Berlin Open", points: 250 },
        { name: "Tokyo Grand Smash", points: 500 },
        { name: "London Masters", points: 250 },
        { name: "China Elite", points: 500 },
        { name: "World Championship", points: 2000, top8Only: true }
    ],
    currentTournamentIndex: 0,
    bracket: [],
    playerObj: null,

    startNew() {
        const name = document.getElementById('input-player-name').value || "Spieler";
        const diffMult = parseFloat(document.getElementById('input-career-difficulty').value);
        this.playerObj = { name: name, points: 0, isPlayer: true, skill: 0, trophies: 0 };
        
        // Generiere 15 KI Gegner. Realistische Punkte, sodass Top 3 machbar ist.
        this.players = [this.playerObj];
        for(let i=0; i<15; i++) {
            let skill = (1.0 - (i * 0.06)) * diffMult;
            this.players.push({
                name: AI_NAMES[i],
                points: Math.floor(2800 * Math.pow(0.75, i)),
                isPlayer: false,
                skill: Math.max(0.1, Math.min(1.5, skill)),
                trophies: Math.floor(6 * Math.pow(0.7, i)) // Veterans haben bereits Pokale
            });
        }
        this.currentTournamentIndex = 0;
        this.updateRankings();
        this.updateHub();
        UI.showScreen('screen-hub');
    },

    updateRankings() {
        this.players.sort((a, b) => b.points - a.points);
    },

    updateHub() {
        this.updateRankings();
        const rank = this.players.indexOf(this.playerObj) + 1;
        document.getElementById('hub-title').innerHTML = getPlayerDisplayName(this.playerObj);
        document.getElementById('hub-rank').innerText = rank;
        document.getElementById('hub-points').innerText = this.playerObj.points;
        
        const nextT = this.tournaments[this.currentTournamentIndex];
        const btn = document.querySelector('.hub-buttons button:first-child');
        
        if (!nextT) {
            document.getElementById('hub-event').innerText = "Saison beendet!";
            btn.innerText = "Nächste Saison starten";
            btn.onclick = () => Career.startNextSeason();
            return;
        }
        let eventName = nextT.name;
        if (nextT.top8Only) eventName += rank <= 8 ? " (Qualifiziert!)" : " (Nicht qualifiziert)";
        document.getElementById('hub-event').innerText = eventName;
        btn.innerText = "Zum Turnier";
        btn.onclick = () => Career.enterTournament();
    },

    startNextSeason() {
        this.currentTournamentIndex = 0;
        this.players.forEach(p => p.points = Math.floor(p.points * 0.75)); // 25% Punkte-Verfall
        this.updateHub();
    },

    updateRankingsTable() {
        const table = document.getElementById('rankings-table');
        table.innerHTML = "<tr><th>Rang</th><th>Name</th><th>Punkte</th></tr>";
        this.players.forEach((p, index) => {
            const tr = document.createElement('tr');
            if (p.isPlayer) tr.classList.add('player-row');
            tr.innerHTML = `<td>${index + 1}</td><td>${getPlayerDisplayName(p)}</td><td>${p.points}</td>`;
            table.appendChild(tr);
        });
    },

    updateCalendarTable() {
        const table = document.getElementById('calendar-table');
        table.innerHTML = "<tr><th>Turnier</th><th>Punkte</th><th>Status</th></tr>";
        this.tournaments.forEach((t, index) => {
            const tr = document.createElement('tr');
            let status = "Geplant";
            if (index < this.currentTournamentIndex) status = "Abgeschlossen";
            else if (index === this.currentTournamentIndex) status = "Aktuell";
            
            tr.innerHTML = `<td>${t.name}</td><td>${t.points}</td><td>${status}</td>`;
            if (index === this.currentTournamentIndex) tr.style.color = "#facc15"; // Gold für aktuelles Turnier
            else if (index < this.currentTournamentIndex) tr.style.color = "#64748b"; // Grau für vergangene
            table.appendChild(tr);
        });
    },

    enterTournament() {
        const t = this.tournaments[this.currentTournamentIndex];
        if (!t) return;
        
        let participants = [...this.players];
        if (t.top8Only) {
            participants = participants.slice(0, 8); // Nur Top 8
            if (!participants.includes(this.playerObj)) {
                alert("Du bist nicht für die WM qualifiziert (Nicht in den Top 8). Saison beendet!");
                return;
            }
        } else {
            participants = participants.slice(0, 8); // Für kurze Turniere nehmen wir immer die Top 8 (inkl. Spieler)
            if (!participants.includes(this.playerObj)) participants[7] = this.playerObj; // Spieler erzwingen
        }

        // Mische Teilnehmer leicht, aber setze Player vs schwachen Gegner zu Beginn
        participants.sort(() => Math.random() - 0.5);
        
        this.bracket = [];
        for(let i=0; i<participants.length; i+=2) {
            this.bracket.push({ p1: participants[i], p2: participants[i+1], winner: null });
        }
        
        this.updateBracketUI();
        UI.showScreen('screen-bracket');
    },

    updateBracketUI() {
        const container = document.getElementById('bracket-view');
        container.innerHTML = "";
        let matchCount = 1;
        
        this.bracket.forEach(match => {
            const div = document.createElement('div');
            let p1Name = match.p1 ? getPlayerDisplayName(match.p1) : "???";
            let p2Name = match.p2 ? getPlayerDisplayName(match.p2) : "???";
            if (match.p1 && match.p1.isPlayer) p1Name = `<strong>${p1Name}</strong>`;
            if (match.p2 && match.p2.isPlayer) p2Name = `<strong>${p2Name}</strong>`;
            
            let result = match.winner ? ` (Sieger: ${getPlayerDisplayName(match.winner)})` : "";
            div.innerHTML = `Match ${matchCount}: ${p1Name} vs ${p2Name} <span style="color:#facc15">${result}</span>`;
            container.appendChild(div);
            matchCount++;
        });

        // Prüfen, ob der Spieler noch im Turnier ist
        let playerInTournament = this.bracket.some(m => !m.winner && (m.p1 === this.playerObj || m.p2 === this.playerObj));
        document.getElementById('btn-next-match').classList.toggle('hidden', !playerInTournament);
        document.getElementById('btn-leave-tournament').classList.toggle('hidden', playerInTournament);
        
        if (this.bracket.length === 1 && this.bracket[0].winner) {
            document.getElementById('bracket-title').innerText = `Turniersieger!`;
        } else {
            document.getElementById('bracket-title').innerText = `Viertelfinale`;
        }
    },

    playNextMatch() {
        currentMatchType = 'career';
        // Finde das Match des Spielers
        const match = this.bracket.find(m => !m.winner && (m.p1 === this.playerObj || m.p2 === this.playerObj));
        if (match) {
            const opponent = match.p1 === this.playerObj ? match.p2 : match.p1;
            start3DMatch(opponent);
        }
    },

    resolvePlayerMatch(playerWon) {
        const match = this.bracket.find(m => !m.winner && (m.p1 === this.playerObj || m.p2 === this.playerObj));
        match.winner = playerWon ? this.playerObj : (match.p1 === this.playerObj ? match.p2 : match.p1);
        
        // Simuliere den Rest der Runde
        this.bracket.forEach(m => {
            if (!m.winner) {
                // Stärkerer Skill gewinnt meistens
                let winChanceP1 = m.p1.skill / (m.p1.skill + m.p2.skill);
                m.winner = Math.random() < winChanceP1 ? m.p1 : m.p2;
            }
        });

        this.advanceBracket();
    },

    advanceBracket() {
        const winners = this.bracket.map(m => m.winner);
        const tournamentPoints = this.tournaments[this.currentTournamentIndex].points;

        if (winners.length === 1) {
            // Turnier zu Ende!
            winners[0].points += tournamentPoints; // Sieger bekommt volle Punkte
            winners[0].trophies += 1; // TURNIERSIEG! Pokal verleihen.
            
            let loser = this.bracket[0].p1 === winners[0] ? this.bracket[0].p2 : this.bracket[0].p1;
            loser.points += Math.floor(tournamentPoints * 0.6); // Verlierer Finale
            
            this.currentTournamentIndex++;
            this.updateHub();
        } else {
            // Verlierer der aktuellen Runde bekommen Punkte
            this.bracket.forEach(m => {
                let loser = m.winner === m.p1 ? m.p2 : m.p1;
                loser.points += Math.floor(tournamentPoints * (0.1 * winners.length)); 
            });

            // Neue Runde aufbauen
            this.bracket = [];
            for(let i=0; i<winners.length; i+=2) {
                this.bracket.push({ p1: winners[i], p2: winners[i+1], winner: null });
            }
        }
        
        this.updateBracketUI();
        UI.showScreen('screen-bracket');
    }
};

function startExhibition() {
    currentMatchType = 'exhibition';
    const selectEl = document.getElementById('exhibition-difficulty');
    let diff = parseFloat(selectEl.value);
    let diffName = selectEl.options[selectEl.selectedIndex].text;
    let randomOp = { name: `Bot (${diffName})`, skill: diff, trophies: 0 };
    start3DMatch(randomOp);
}

function start3DMatch(opponentObj) {
    currentAI = generateAIProfile(opponentObj.skill);
    document.getElementById('ai-name-display').innerHTML = getPlayerDisplayName(opponentObj);
    document.getElementById('player-name-display').innerHTML = Career.playerObj ? getPlayerDisplayName(Career.playerObj) : "DU";
    
    gameState.playerScore = 0;
    gameState.aiScore = 0;
    gameState.pointsPlayed = 0;
    gameState.server = 'player';
    document.getElementById('player-score').innerText = '0';
    document.getElementById('ai-score').innerText = '0';
    
    UI.hideMenu();
    gameState.serving = true;
    showMessage(`Match gegen ${opponentObj.name}<br><span style="font-size:0.5em; color:#fff; border:none;">Klicke, um aufzuschlagen</span>`, 0);
}

// --- 5. INPUT & STEUERUNG ---
const mouse = new THREE.Vector2();
let mouseVelY = 0; // Für Topspin Berechnung
let mouseVelX = 0; // Für das Zielen in die Ecken
let lastMouseY = 0;
let lastMouseX = 0;

window.addEventListener('mousemove', (e) => {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    
    mouseVelX = mouse.x - lastMouseX;
    mouseVelY = mouse.y - lastMouseY;
    lastMouseX = mouse.x;
    lastMouseY = mouse.y;
});

window.addEventListener('click', (e) => {
    if (appMode !== 'match') return;
    // Blockiert fehlerhaftes Auslösen durch UI-Buttons
    if (e.target.closest('.screen') || e.target.tagName === 'BUTTON') return;
    
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    if (gameState.serving) {
        if (gameState.server === 'player') {
            serveBall();
        }
    }
});

// --- 6. SPIEL-LOGIK & PHYSIK ---

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

    document.getElementById('player-score').innerText = gameState.playerScore;
    document.getElementById('ai-score').innerText = gameState.aiScore;

    // Aufschlagwechsel alle 2 Punkte
    if (gameState.pointsPlayed % 2 === 0) {
        gameState.server = gameState.server === 'player' ? 'ai' : 'player';
    }

    gameState.isActive = false;
    
    if (gameState.playerScore >= 11 || gameState.aiScore >= 11) {
        // Siegbedingung (vereinfacht ohne 2-Punkte-Abstand Regel)
        showMessage(`MATCH<br><span style="font-size:0.5em; color:#fff">${winner === 'player' ? 'Du gewinnst!' : 'KI gewinnt!'}</span>`, 0);
        setTimeout(() => {
            document.getElementById('status-message').classList.add('hidden');
            if (currentMatchType === 'career') {
                Career.resolvePlayerMatch(winner === 'player');
            } else {
                UI.showScreen('screen-main'); // Exhibition Ende
            }
        }, 3000);
    } else {
        let msg = winner === 'player' ? 'Punkt für Dich' : 'Punkt für KI';
        let subMsg = gameState.server === 'player' ? 'Dein Aufschlag (Klick)' : 'KI schlägt auf';
        showMessage(`${msg}<br><span style="font-size:0.4em; color:#fff; border:none;">${subMsg}</span>`, 0);
        
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
        gameState.turn = 'ai'; // Ball muss rüber
    } else {
        ballState.pos.copy(aiPaddle.position).setZ(-PADDLE_Z + 0.1);
        executeHit(aiPaddle.position, 1, currentAI.returnSpeed, true);
        gameState.turn = 'player';
    }
    playSound('hit');
}

// STATE OF THE ART: Assisted Physics Trajectory
// Berechnet die perfekte Flugkurve auf die gegnerische Tischhälfte
function executeHit(paddlePos, zDirection, speedZ, isServe) {
    if (isServe) {
        // Garantierter, sicherer Aufschlag
        let serveVx = (zDirection > 0) ? (Math.random() - 0.5) * 0.5 : mouseVelX * 25;
        serveVx = Math.max(-1.5, Math.min(1.5, serveVx));
        
        // Ball leicht erhöht und mit Abwärts-Wucht (wie beim echten Aufschlag)
        ballState.pos.y = TABLE_HEIGHT + 0.3;
        ballState.vel.set(serveVx, -1.5, 3.5 * zDirection);
        ballState.spin = 0;
        return;
    }

    // Zielpunkt auf der gegnerischen Seite (mit Fehler für KI)
    let targetZ = (TABLE_LENGTH / 4) * zDirection;
    
    let targetX = 0;
    if (zDirection > 0) {
        // KI zielt grob auf die gegenüberliegende Seite
        targetX = -paddlePos.x * 0.5 + (Math.random() - 0.5) * currentAI.error;
    } else {
        // AKTIVES ZIELEN SPIELER: Die Maus-Wischbewegung bestimmt den Winkel!
        let aimInfluence = mouseVelX * 60; // Erhöht: Wischen reißt den Ball stark mit
        targetX = -paddlePos.x * 0.3 + aimInfluence;
        targetX += (Math.random() - 0.5) * 0.05; // Minimale natürliche Streuung
    }
    
    // Ziel knapp an der Kante limitieren, damit man scharfe Winner spielen kann
    targetX = Math.max(-TABLE_WIDTH/2 + 0.02, Math.min(TABLE_WIDTH/2 - 0.02, targetX));
    
    // Flugzeit berechnen
    let distZ = targetZ - ballState.pos.z;
    let t = Math.abs(distZ / speedZ);
    
    // Benötigte Y-Geschwindigkeit, um den Zielpunkt zu erreichen
    // y = y0 + v0*t - 0.5*g*t^2 => v0 = (y - y0 + 0.5*g*t^2) / t
    let targetY = TABLE_HEIGHT;
    let requiredVy = (targetY - ballState.pos.y + 0.5 * ballState.gravity * Math.pow(t, 2)) / t;
    
    // Topspin (Magnus-Effekt Vorbereitung)
    let spin = 0;
    if (zDirection < 0) { // Spieler
        spin = Math.max(0, mouseVelY * 50); // Zieht Maus hoch = Topspin
        requiredVy += spin * 0.02; // Etwas höher zielen, da Spin den Ball runterzieht
    }
    
    ballState.vel.set((targetX - ballState.pos.x) / t, requiredVy, speedZ * zDirection);
    ballState.spin = spin;
}

function updatePhysics(dt) {
    if (gameState.serving) {
        // Ball schwebt beim Aufschläger
        if (gameState.server === 'player') {
            ballState.pos.set(playerPaddle.position.x, playerPaddle.position.y + 0.1, playerPaddle.position.z - 0.1);
        } else {
            ballState.pos.set(aiPaddle.position.x, aiPaddle.position.y - 0.1, aiPaddle.position.z + 0.1);
        }
        ball.position.copy(ballState.pos);
        return;
    }

    // Schwerkraft & Magnus-Effekt (Topspin drückt Ball nach unten)
    let magnusForce = ballState.spin * Math.abs(ballState.vel.z) * 0.015;
    ballState.vel.y -= (ballState.gravity + magnusForce) * dt;
    
    // Position updaten
    ballState.pos.addScaledVector(ballState.vel, dt);

    // BOUNCE LOGIK (Tischplatte)
    if (ballState.pos.y < TABLE_HEIGHT + BALL_RADIUS && ballState.vel.y < 0) {
        if (Math.abs(ballState.pos.x) < TABLE_WIDTH / 2 && Math.abs(ballState.pos.z) < TABLE_LENGTH / 2) {
            // Bounce!
            playSound('bounce');
            ballState.pos.y = TABLE_HEIGHT + BALL_RADIUS;
            ballState.vel.y *= -0.85; // Restitution
            ballState.vel.z += ballState.spin * 0.05; // Topspin beschleunigt den Ball beim Aufprall nach vorne!
            
            if (gameState.isActive) {
                const onPlayerSide = ballState.pos.z > 0;
                if (onPlayerSide) gameState.bouncesPlayerSide++;
                else gameState.bouncesAiSide++;

                const isServe = (gameState.hitCount === 1);
                
                // Korrekte Auswertung nach ITTF-Regeln
                if (gameState.turn === 'ai') { // Ball fliegt zur KI
                    if (isServe) {
                        if (gameState.bouncesPlayerSide > 1) updateScore('ai');
                        else if (gameState.bouncesAiSide > 0 && gameState.bouncesPlayerSide === 0) updateScore('ai');
                        else if (gameState.bouncesAiSide > 1) updateScore('player');
                    } else {
                        if (gameState.bouncesPlayerSide > 0) updateScore('ai');
                        else if (gameState.bouncesAiSide > 1) updateScore('player');
                    }
                } else { // Ball fliegt zum Spieler
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

    // Kollision mit Netz
    if (Math.abs(ballState.pos.z) < BALL_RADIUS && ballState.pos.y < TABLE_HEIGHT + NET_HEIGHT) {
        ballState.vel.z *= -0.2;
        ballState.vel.x *= 0.5;
        if (gameState.isActive) updateScore(gameState.turn === 'ai' ? 'ai' : 'player');
    }

    // KOLLISION: Spieler Schläger (Erweiterte Tiefenprüfung gegen Tunneling)
    if (ballState.pos.z > playerPaddle.position.z - 0.4 && ballState.pos.z < playerPaddle.position.z + 0.4 && ballState.vel.z > 0) {
        // Großzügigere Hitbox, damit man den Ball auch trifft!
        if (Math.abs(ballState.pos.x - playerPaddle.position.x) < 0.4 &&
            Math.abs(ballState.pos.y - playerPaddle.position.y) < 0.4) {
            
            playSound('hit');
            let totalMouseVel = Math.sqrt(mouseVelX*mouseVelX + mouseVelY*mouseVelY);
            let speed = currentAI.basePlayerSpeed + totalMouseVel * 20;
            speed = Math.min(speed, currentAI.maxPlayerSpeed); // Ballgeschwindigkeit wird durch KI-Level begrenzt
            executeHit(playerPaddle.position, -1, speed, false);
            
            if (gameState.isActive) {
                gameState.turn = 'ai';
                gameState.bouncesPlayerSide = 0;
                gameState.bouncesAiSide = 0;
                gameState.hitCount++;
            }
        }
    }

    // KOLLISION: KI Schläger (Strikte, winzige Hitbox für die KI!)
    if (ballState.pos.z < aiPaddle.position.z + 0.2 && ballState.pos.z > aiPaddle.position.z - 0.2 && ballState.vel.z < 0) {
        if (Math.abs(ballState.pos.x - aiPaddle.position.x) < 0.15) { // KI MUSS nun nah am Ball sein
            playSound('hit');
            
            // Straf-Fehler für die KI, wenn sie sich enorm strecken musste
            let distToCenter = Math.abs(ballState.pos.x - aiPaddle.position.x);
            let reachPenalty = distToCenter > 0.08 ? 0.4 : 0; // Wenn sie nur die Kante erwischt, spielt sie oft ins Aus
            let prevError = currentAI.error;
            currentAI.error += reachPenalty;
            executeHit(aiPaddle.position, 1, currentAI.returnSpeed, false);
            currentAI.error = prevError; // Reset
            
            if (gameState.isActive) {
                gameState.turn = 'player';
                gameState.bouncesPlayerSide = 0;
                gameState.bouncesAiSide = 0;
                gameState.hitCount++;
            }
        }
    }

    // Ball fällt auf den Boden (Aus)
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
        
        // Physik Bounce auf dem Boden, damit er nicht durch die Textur fällt
        ballState.pos.y = 0.1;
        ballState.vel.y *= -0.5;
        ballState.vel.x *= 0.8;
        ballState.vel.z *= 0.8;
    }

    ball.position.copy(ballState.pos);
}

function updateAI(dt) {
    if (!gameState.isActive || ballState.vel.z > 0) {
        // KI kehrt entspannt zur Mitte zurück
        aiTargetPos.set(0, TABLE_HEIGHT + 0.2, -PADDLE_Z);
        aiPaddle.position.lerp(aiTargetPos, 3 * dt);
        return;
    }

    aiReactionTimer -= dt;
    if (aiReactionTimer <= 0) {
        // KI berechnet den Schnittpunkt
        const t = Math.abs((aiPaddle.position.z - ballState.pos.z) / ballState.vel.z);
        let predX = ballState.pos.x + ballState.vel.x * t;
        let predY = ballState.pos.y + ballState.vel.y * t - 0.5 * ballState.gravity * t * t;
        
        // KI justiert ihre Position, um den Ball perfekt zurückzuschlagen (leicht erhöht)
        aiTargetPos.set(
            Math.max(-TABLE_WIDTH/2, Math.min(TABLE_WIDTH/2, predX)),
            Math.max(TABLE_HEIGHT + 0.1, predY),
            -PADDLE_Z
        );
        aiReactionTimer = currentAI.reactionDelay; // KI checkt nicht jeden Frame (simuliert Mensch)
    }

    // PHYSISCHES LIMIT FÜR DIE KI: Keine Teleportation mehr!
    let dx = aiTargetPos.x - aiPaddle.position.x;
    let dy = aiTargetPos.y - aiPaddle.position.y;
    let maxMove = currentAI.speed * dt;
    
    if (Math.abs(dx) > maxMove) aiPaddle.position.x += Math.sign(dx) * maxMove;
    else aiPaddle.position.x += dx;
    
    if (Math.abs(dy) > maxMove) aiPaddle.position.y += Math.sign(dy) * maxMove;
    else aiPaddle.position.y += dy;
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

// --- 7. MAIN LOOP ---
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    
    if (appMode !== 'match') {
        renderer.render(scene, camera); // Rendere im Menü nur den Hintergrund
        return; 
    }

    const dt = Math.min(clock.getDelta(), 0.05); // Cap bei Lags

    // Spieler-Steuerung (Mapping Maus auf Tischdimensionen)
    const targetX = mouse.x * (TABLE_WIDTH / 1.8);
    const targetY = Math.max(TABLE_HEIGHT - 0.1, TABLE_HEIGHT + (mouse.y + 0.5) * 1.2);
    
    // Direkte, aber minimal gedämpfte Schlägersteuerung
    playerPaddle.position.x += (targetX - playerPaddle.position.x) * 0.4;
    playerPaddle.position.y += (targetY - playerPaddle.position.y) * 0.4;
    playerPaddle.position.z = PADDLE_Z;
    
    // Leichtes Neigen des Schlägers basierend auf Position (für die Optik)
    playerPaddle.rotation.y = playerPaddle.position.x * -0.2;

    // Logik-Updates
    updatePhysics(dt);
    updateAI(dt);
    if (gameState.isActive || gameState.serving) updateTrail();

    // Kamera-Wackeln für Immersion
    camera.position.x = playerPaddle.position.x * 0.3;
    camera.lookAt(0, TABLE_HEIGHT, 0);

    renderer.render(scene, camera);
}

// --- 8. INITIALISIERUNG ---
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}, false);

animate();
UI.showScreen('screen-main'); // Starte direkt im Menü