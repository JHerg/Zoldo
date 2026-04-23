const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// --- GRUNDLEGENDE SETTINGS & KONSTANTEN ---
const TILE_SIZE = 40;
const VIEW_WIDTH = 800;
const VIEW_HEIGHT = 600;

// Rätsel- & Spielstatus
const puzzles = { p1: false, p2: false, p3: false };
let gameWon = false;
let inDialog = false;
let switchSequence = []; // Für das Logik-Rätsel

// --- INPUT MANAGER ---
const keys = { w: false, a: false, s: false, d: false, space: false };
window.addEventListener("keydown", e => {
    if (["w", "ArrowUp"].includes(e.key.toLowerCase())) keys.w = true;
    if (["a", "ArrowLeft"].includes(e.key.toLowerCase())) keys.a = true;
    if (["s", "ArrowDown"].includes(e.key.toLowerCase())) keys.s = true;
    if (["d", "ArrowRight"].includes(e.key.toLowerCase())) keys.d = true;
    if (e.key === " ") {
        keys.space = true;
        if (inDialog) closeDialog();
        else interact();
    }
});
window.addEventListener("keyup", e => {
    if (["w", "ArrowUp"].includes(e.key.toLowerCase())) keys.w = false;
    if (["a", "ArrowLeft"].includes(e.key.toLowerCase())) keys.a = false;
    if (["s", "ArrowDown"].includes(e.key.toLowerCase())) keys.s = false;
    if (["d", "ArrowRight"].includes(e.key.toLowerCase())) keys.d = false;
    if (e.key === " ") keys.space = false;
});

// --- ENTITIES ---
const player = {
    x: 0, y: 0, w: 24, h: 24, speed: 4, vx: 0, vy: 0
};
let ball = { x: 0, y: 0, w: 20, h: 20, vx: 0, vy: 0, startX: 0, startY: 0 };
let statues = [];
let switches = [];
let npc = { x: 0, y: 0, w: 24, h: 24 };

// --- DIE WELT & MAP PARSING ---
/* 
Legende:
W = Baum/Wand, ' ' = Gras, P = Spieler-Start, N = Trainer NPC
O = Ball, 4 = Ball-Ziel, S = Stacheln
X = Statue, 2 = Statuen-Ziel
1 = Tor 1, 3 = Tor 2, 5 = Tor 3 (Finale)
R, G, B = Blumen (Rot, Grün, Blau) - Hinweis für Schalter
r, g, b = Schalter
* = Goldener Ball (Ziel)
*/
const levelMapStr = [
    "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWW",
    "WWWWWWWWWWWWWWWWWWWWWWWW 4WWWW",
    "WW   B   G   R       3    WWWW",
    "WW r WWWWWWWWWWWWWWWWWWWW SWWW",
    "WW g WWWWWWWWWWWWWWWWWWWW S WW",
    "WW b WWWWWWWWWWWWWWWWWWWW  SWW",
    "WW   WWWWWWWWWWWWWWWWWWWW S SW",
    "WWWWWWWWWWWWWWWWWWWWWWWWW  SWW",
    "WWWWWWWWWWWW * 5          S WW",
    "WWWWWWWWWWWWWWWWWWWWWWWWW S SW",
    "WWWWWWWWWWWWWWWWWWWWWWWWW  SWW",
    "WWWWWWWWWWWWWWWWWWWWWWWWW OWWW",
    "WWWWWWWWWWWWWWWWWWWWWWWWW1WWWW",
    "WWWWWWWWWWWWWWWWWWWWWWWWW WWWW",
    "WWWWWWWWWWWWWWWWWWWWWWWWW WWWW",
    "WWWWWWWWWWWWWWWWWWWWWWWWW2WWWW",
    "WWWWWWWWWWWWWWWWWWWWWWWWW WWWW",
    "WWWWWWWWWWWWWWWWWWWWWWWW2 2WWW",
    "WWWW   N       X X X WWWWWWWWW",
    "WWWW P         WWWWWWWWWWWWWWW",
    "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWW",
    "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWW"
];
let mapGrid = [];
let COLS = levelMapStr[0].length;
let ROWS = levelMapStr.length;

function initMap() {
    for (let r = 0; r < ROWS; r++) {
        let rowArray = [];
        for (let c = 0; c < COLS; c++) {
            let char = levelMapStr[r][c];
            let px = c * TILE_SIZE;
            let py = r * TILE_SIZE;
            
            if (char === 'P') { player.x = px + 8; player.y = py + 8; char = ' '; }
            if (char === 'N') { npc = { x: px + 8, y: py + 8, w: 24, h: 24 }; char = ' '; }
            if (char === 'X') { statues.push({ x: px + 4, y: py + 4, w: 32, h: 32 }); char = ' '; }
            if (char === 'O') { 
                ball = { x: px + 10, y: py + 10, w: 20, h: 20, vx: 0, vy: 0, startX: px + 10, startY: py + 10 }; 
                char = ' '; 
            }
            if (char === 'r' || char === 'g' || char === 'b') { 
                switches.push({ x: px + 8, y: py + 8, w: 24, h: 24, color: char, pressed: false }); 
                char = ' '; 
            }
            rowArray.push(char);
        }
        mapGrid.push(rowArray);
    }
}

// --- KOLLISION & PHYSIK ---
function checkAABB(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function isSolid(rect) {
    let left = Math.floor(rect.x / TILE_SIZE);
    let right = Math.floor((rect.x + rect.w - 0.1) / TILE_SIZE);
    let top = Math.floor(rect.y / TILE_SIZE);
    let bottom = Math.floor((rect.y + rect.h - 0.1) / TILE_SIZE);

    for (let r = top; r <= bottom; r++) {
        for (let c = left; c <= right; c++) {
            if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return true;
            let tile = mapGrid[r][c];
            if (tile === 'W' || tile === '1' || tile === '3' || tile === '5') return true;
        }
    }
    return false;
}

// --- INTERAKTION & DIALOG ---
function showDialog(text) {
    document.getElementById("dialog-text").innerText = text;
    document.getElementById("dialog-box").classList.remove("hidden");
    inDialog = true;
}

function closeDialog() {
    document.getElementById("dialog-box").classList.add("hidden");
    inDialog = false;
}

function getDistance(obj1, obj2) {
    let cx1 = obj1.x + obj1.w/2; let cy1 = obj1.y + obj1.h/2;
    let cx2 = obj2.x + obj2.w/2; let cy2 = obj2.y + obj2.h/2;
    return Math.hypot(cx1 - cx2, cy1 - cy2);
}

function interact() {
    // 1. Schalter Logik (Rätsel 3)
    let swHit = false;
    for (let sw of switches) {
        if (getDistance(player, sw) < TILE_SIZE * 1.5 && !sw.pressed) {
            sw.pressed = true;
            switchSequence.push(sw.color);
            checkSwitchPuzzle();
            swHit = true;
            break;
        }
    }
    if (swHit) return;

    // 2. Trainer NPC Dialog
    if (getDistance(player, npc) < TILE_SIZE * 2) {
        showDialog("Trainer:\nHallo, junges Talent! Du suchst den Goldenen Ball der Weisheit?\nBeweise dich in 3 Prüfungen:\n\n1. Taktik (Osten): Schiebe die Statuen auf die gelben Platten (Sturm-Dreieck).\n2. Ballkontrolle (Norden): Dribble den Ball durch den Stachelpfad, ohne dass er die Stacheln berührt.\n3. Spielintelligenz (Westen): Drücke die Schalter anhand der Blumen.\n\nViel Erfolg!");
    }
}

function openDoor(doorChar) {
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (mapGrid[r][c] === doorChar) mapGrid[r][c] = ' ';
        }
    }
}

function updateHUD() {
    let count = (puzzles.p1 ? 1 : 0) + (puzzles.p2 ? 1 : 0) + (puzzles.p3 ? 1 : 0);
    document.getElementById("puzzle-display").innerText = `Rätsel gelöst: ${count}/3`;
}

// --- RÄTSEL LOGIK ---
function checkPuzzles() {
    // Rätsel 1: Statuen-Formation
    if (!puzzles.p1) {
        let allOnPlates = true;
        for (let s of statues) {
            let cx = s.x + s.w/2;
            let cy = s.y + s.h/2;
            let c = Math.floor(cx / TILE_SIZE);
            let r = Math.floor(cy / TILE_SIZE);
            if (mapGrid[r] && mapGrid[r][c] !== '2') allOnPlates = false;
        }
        if (allOnPlates) {
            puzzles.p1 = true;
            openDoor('1');
            showDialog("Rätsel 1 gelöst!\n\nPerfekte Formation! Das erste Tor hat sich geöffnet.");
            updateHUD();
        }
    }

    // Rätsel 2: Dribbling (Zielplatte)
    if (!puzzles.p2) {
        let col = Math.floor((ball.x + ball.w/2) / TILE_SIZE);
        let row = Math.floor((ball.y + ball.h/2) / TILE_SIZE);
        if (mapGrid[row] && mapGrid[row][col] === '4') {
            puzzles.p2 = true;
            openDoor('3');
            showDialog("Rätsel 2 gelöst!\n\nWas für ein Weltklasse-Dribbling! Das zweite Tor ist offen.");
            updateHUD();
        }
    }

    // Sieg: Goldener Ball
    if (!gameWon) {
        let col = Math.floor((player.x + player.w/2) / TILE_SIZE);
        let row = Math.floor((player.y + player.h/2) / TILE_SIZE);
        if (mapGrid[row] && mapGrid[row][col] === '*') {
            gameWon = true;
            showDialog("Glückwunsch!\n\nDu hast den legendären Goldenen Ball der Weisheit gefunden. Du bist ein echter Fußball-Abenteurer!");
        }
    }
}

function checkSwitchPuzzle() {
    if (switchSequence.length === 3) {
        // Hinweis sind die Blumen: Blau (B), Grün (G), Rot (R)
        if (switchSequence[0] === 'b' && switchSequence[1] === 'g' && switchSequence[2] === 'r') {
            puzzles.p3 = true;
            openDoor('5');
            showDialog("Rätsel 3 gelöst!\n\nGeniale Spielintelligenz. Die letzte Tür zum Goldenen Ball öffnet sich!");
            updateHUD();
        } else {
            showDialog("Falsche Reihenfolge!\n\nSchau dir die farbigen Blumen genau an. Die Schalter wurden zurückgesetzt.");
            switches.forEach(s => s.pressed = false);
            switchSequence = [];
        }
    }
}

// --- GAME LOOP: UPDATE ---
function update() {
    if (inDialog) return;

    // 1. Spieler-Bewegung berechnen
    player.vx = 0; player.vy = 0;
    if (keys.w) player.vy = -player.speed;
    if (keys.s) player.vy = player.speed;
    if (keys.a) player.vx = -player.speed;
    if (keys.d) player.vx = player.speed;

    if (player.vx !== 0 && player.vy !== 0) {
        let mag = Math.sqrt(2);
        player.vx /= mag; player.vy /= mag;
    }

    // 2. Spieler X-Kollision und Objektschieben
    player.x += player.vx;
    if (isSolid(player)) player.x -= player.vx;
    else {
        // Statuen
        statues.forEach(s => {
            if (checkAABB(player, s)) {
                s.x += player.vx;
                if (isSolid(s) || statues.some(other => other !== s && checkAABB(s, other))) {
                    s.x -= player.vx; player.x -= player.vx; // Blockieren
                }
            }
        });
        // Ball (kick)
        if (checkAABB(player, ball)) {
            ball.vx = player.vx * 1.5;
            player.x -= player.vx; // Spieler stoppt leicht beim Kicken
        }
    }

    // 3. Spieler Y-Kollision
    player.y += player.vy;
    if (isSolid(player)) player.y -= player.vy;
    else {
        statues.forEach(s => {
            if (checkAABB(player, s)) {
                s.y += player.vy;
                if (isSolid(s) || statues.some(other => other !== s && checkAABB(s, other))) {
                    s.y -= player.vy; player.y -= player.vy;
                }
            }
        });
        if (checkAABB(player, ball)) {
            ball.vy = player.vy * 1.5;
            player.y -= player.vy;
        }
    }

    // 4. Ball Physik (Dribbling / Reibung)
    ball.x += ball.vx;
    if (isSolid(ball)) {
        ball.x -= ball.vx; ball.vx *= -0.5; // Abprallen
    }
    ball.y += ball.vy;
    if (isSolid(ball)) {
        ball.y -= ball.vy; ball.vy *= -0.5;
    }
    ball.vx *= 0.9; // Gras-Reibung
    ball.vy *= 0.9;
    if (Math.abs(ball.vx) < 0.1) ball.vx = 0;
    if (Math.abs(ball.vy) < 0.1) ball.vy = 0;

    // Ball auf Stacheln prüfen
    let bCol = Math.floor((ball.x + ball.w/2) / TILE_SIZE);
    let bRow = Math.floor((ball.y + ball.h/2) / TILE_SIZE);
    if (mapGrid[bRow] && mapGrid[bRow][bCol] === 'S') {
        ball.x = ball.startX; ball.y = ball.startY;
        ball.vx = 0; ball.vy = 0;
        showDialog("Der Ball ist in die Stacheln gerollt und geplatzt!\n\nEin neuer Ball liegt am Startpunkt.");
    }

    // 5. Spielzustand checken
    checkPuzzles();
}

// --- ZEICHNEN DER GRAFIKEN (Ohne externe Bilder) ---
function drawGrass(x, y) {
    ctx.fillStyle = "#4CAF50";
    ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
    ctx.fillStyle = "#388E3C";
    ctx.fillRect(x + 8, y + 10, 4, 4);
    ctx.fillRect(x + 24, y + 26, 4, 4);
}

function drawWall(x, y) {
    drawGrass(x, y);
    ctx.fillStyle = "#795548"; // Stamm
    ctx.fillRect(x + 16, y + 20, 8, 20);
    ctx.fillStyle = "#2e7d32"; // Blätterkrone
    ctx.beginPath();
    ctx.arc(x + 20, y + 15, 18, 0, Math.PI * 2);
    ctx.fill();
}

function drawSpikes(x, y) {
    ctx.fillStyle = "#B0BEC5";
    ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
    ctx.fillStyle = "#455A64";
    for(let i=0; i<2; i++) {
        for(let j=0; j<2; j++) {
            let sx = x + i*20 + 10;
            let sy = y + j*20 + 15;
            ctx.beginPath();
            ctx.moveTo(sx, sy - 10);
            ctx.lineTo(sx - 8, sy + 5);
            ctx.lineTo(sx + 8, sy + 5);
            ctx.fill();
        }
    }
}

function drawFlower(x, y, type) {
    drawGrass(x, y);
    let color = type === 'R' ? '#F44336' : (type === 'G' ? '#4CAF50' : '#2196F3');
    ctx.fillStyle = "#8BC34A"; // Stiel
    ctx.fillRect(x + 18, y + 20, 4, 15);
    ctx.fillStyle = color; // Blütenblätter
    ctx.beginPath();
    ctx.arc(x + 20, y + 16, 8, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = "#FFEB3B"; // Mitte
    ctx.beginPath();
    ctx.arc(x + 20, y + 16, 4, 0, Math.PI*2);
    ctx.fill();
}

function drawGoldenBall(x, y) {
    drawGrass(x, y);
    let glow = Math.abs(Math.sin(Date.now() / 200)) * 5;
    ctx.fillStyle = "rgba(255, 215, 0, 0.4)";
    ctx.beginPath();
    ctx.arc(x + 20, y + 20, 15 + glow, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = "gold";
    ctx.beginPath();
    ctx.arc(x + 20, y + 20, 10, 0, Math.PI*2);
    ctx.fill();
}

// --- GAME LOOP: DRAW ---
function draw() {
    // Kamera berechnen
    let camX = Math.max(0, Math.min(player.x - VIEW_WIDTH/2 + player.w/2, COLS * TILE_SIZE - VIEW_WIDTH));
    let camY = Math.max(0, Math.min(player.y - VIEW_HEIGHT/2 + player.h/2, ROWS * TILE_SIZE - VIEW_HEIGHT));

    ctx.save();
    ctx.translate(-camX, -camY);

    // 1. Map zeichnen
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            let tile = mapGrid[r][c];
            let px = c * TILE_SIZE;
            let py = r * TILE_SIZE;

            // Basis-Gras
            if ([' ', '2', '4', '1', '3', '5', 'R', 'G', 'B', 'S', '*'].includes(tile)) drawGrass(px, py);

            if (tile === 'W') drawWall(px, py);
            else if (tile === '2' || tile === '4') {
                ctx.strokeStyle = "#FFEB3B";
                ctx.lineWidth = 2;
                ctx.strokeRect(px + 2, py + 2, TILE_SIZE - 4, TILE_SIZE - 4);
                ctx.fillStyle = "rgba(255, 235, 59, 0.2)";
                ctx.fillRect(px + 2, py + 2, TILE_SIZE - 4, TILE_SIZE - 4);
            }
            else if (tile === '1' || tile === '3' || tile === '5') {
                ctx.fillStyle = "#5D4037"; // Holztür
                ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
                ctx.fillStyle = "#3E2723";
                ctx.fillRect(px + 10, py, 4, TILE_SIZE);
                ctx.fillRect(px + 26, py, 4, TILE_SIZE);
            }
            else if (tile === 'S') drawSpikes(px, py);
            else if (['R', 'G', 'B'].includes(tile)) drawFlower(px, py, tile);
            else if (tile === '*') drawGoldenBall(px, py);
        }
    }

    // 2. Schalter zeichnen
    let colorMap = { 'r': '#F44336', 'g': '#4CAF50', 'b': '#2196F3' };
    for (let sw of switches) {
        ctx.fillStyle = "#9e9e9e";
        ctx.fillRect(sw.x, sw.y, sw.w, sw.h);
        ctx.fillStyle = sw.pressed ? "#fff" : colorMap[sw.color];
        ctx.beginPath();
        ctx.arc(sw.x + sw.w/2, sw.y + sw.h/2, 8, 0, Math.PI * 2);
        ctx.fill();
    }

    // 3. Statuen zeichnen
    for (let s of statues) {
        ctx.fillStyle = "#757575";
        ctx.fillRect(s.x, s.y, s.w, s.h);
        ctx.fillStyle = "#9E9E9E";
        ctx.fillRect(s.x + 4, s.y + 4, s.w - 8, s.h - 8);
    }

    // 4. Ball zeichnen
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(ball.x + ball.w/2, ball.y + ball.h/2, ball.w/2, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = "#000"; // Fußball-Fünfecke Andeutung
    ctx.fillRect(ball.x + 8, ball.y + 8, 4, 4);
    ctx.fillRect(ball.x + 4, ball.y + 4, 3, 3);
    ctx.fillRect(ball.x + 12, ball.y + 14, 3, 3);

    // 5. NPC zeichnen
    ctx.fillStyle = "#F44336"; // Roter Trainingsanzug
    ctx.fillRect(npc.x, npc.y, npc.w, npc.h);
    ctx.fillStyle = "#FFC107"; // Kopf
    ctx.fillRect(npc.x + 4, npc.y - 8, 16, 16);
    ctx.fillStyle = "#fff"; // Weiße Haare
    ctx.fillRect(npc.x + 4, npc.y - 12, 16, 6);

    // 6. Spieler zeichnen
    ctx.fillStyle = "#2196F3"; // Blaues Trikot
    ctx.fillRect(player.x, player.y, player.w, player.h);
    ctx.fillStyle = "#FFC107"; // Kopf
    ctx.fillRect(player.x + 4, player.y - 8, 16, 16);
    ctx.fillStyle = "#fff"; // Trikotnummer
    ctx.font = "10px Arial";
    ctx.fillText("10", player.x + 6, player.y + 16);

    ctx.restore();
}

// --- INITIALISIERUNG ---
function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

initMap();
showDialog("Willkommen zum Großen Fußball-Abenteuer!\n\nNutze [W, A, S, D] zur Bewegung. Suche den Trainer für deinen ersten Auftrag! Sprich mit ihm durch Drücken der [Leertaste].");
gameLoop();