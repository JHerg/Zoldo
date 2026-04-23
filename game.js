const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// --- GRUNDLEGENDE SETTINGS ---
const TILE_SIZE = 40;
const COLS = canvas.width / TILE_SIZE; // 20
const ROWS = canvas.height / TILE_SIZE; // 15

// Steuerung
const keys = { w: false, a: false, s: false, d: false, space: false };
window.addEventListener("keydown", e => {
    if (e.key === "w" || e.key === "ArrowUp") keys.w = true;
    if (e.key === "a" || e.key === "ArrowLeft") keys.a = true;
    if (e.key === "s" || e.key === "ArrowDown") keys.s = true;
    if (e.key === "d" || e.key === "ArrowRight") keys.d = true;
    if (e.key === " ") {
        keys.space = true;
        schliesseDialog();
    }
});
window.addEventListener("keyup", e => {
    if (e.key === "w" || e.key === "ArrowUp") keys.w = false;
    if (e.key === "a" || e.key === "ArrowLeft") keys.a = false;
    if (e.key === "s" || e.key === "ArrowDown") keys.s = false;
    if (e.key === "d" || e.key === "ArrowRight") keys.d = false;
    if (e.key === " ") keys.space = false;
});

// --- DIE WELT (TILEMAP) ---
// 0 = Boden, 1 = Wand, 2 = Schlüssel, 3 = Verschlossene Tür
const map = [
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,0,0,0,1,0,0,0,0,0,1,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,1,0,0,0,0,0,1,0,0,2,0,0,0,0,0,1],
    [1,0,0,0,1,0,0,0,0,0,1,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,1,1,1,3,1,1,1,1,1,1,1,1,1,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,1],
    [1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,1,0,0,1],
    [1,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,1,0,0,1],
    [1,0,0,0,1,1,1,1,0,0,0,1,1,1,1,1,1,0,0,1],
    [1,0,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0,0,0,1],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
];

// --- SPIELER ---
const player = {
    x: 400, // Startposition X (Mitte)
    y: 400, // Startposition Y
    width: 24,
    height: 24,
    speed: 4,
    color: "#4CAF50", // Grün, typische Heldenfarbe
    inventory: []
};

// --- DIALOG SYSTEM ---
let inDialog = false;
const dialogBox = document.getElementById("dialog-box");
const dialogText = document.getElementById("dialog-text");

function zeigeDialog(text) {
    dialogText.innerText = text;
    dialogBox.classList.remove("hidden");
    inDialog = true;
}

function schliesseDialog() {
    if (inDialog) {
        dialogBox.classList.add("hidden");
        inDialog = false;
    }
}

// --- KOLLISION & INTERAKTION ---
// Prüft, ob ein Rechteck (Spieler) mit einer bestimmten Kachel-Art kollidiert
function checkCollision(newX, newY) {
    // Die 4 Ecken des Spielers berechnen
    let left = Math.floor(newX / TILE_SIZE);
    let right = Math.floor((newX + player.width - 1) / TILE_SIZE);
    let top = Math.floor(newY / TILE_SIZE);
    let bottom = Math.floor((newY + player.height - 1) / TILE_SIZE);

    // Kacheln an den Ecken prüfen
    let tiles = [
        map[top][left], map[top][right],
        map[bottom][left], map[bottom][right]
    ];

    // Kollision mit Wänden (1) oder verschlossenen Türen (3)
    if (tiles.includes(1) || tiles.includes(3)) {
        return true; 
    }
    return false;
}

function checkInteraction() {
    // Zentrum des Spielers für Items
    let centerX = Math.floor((player.x + player.width/2) / TILE_SIZE);
    let centerY = Math.floor((player.y + player.height/2) / TILE_SIZE);

    let currentTile = map[centerY][centerX];

    // 2 = Schlüssel aufgesammelt
    if (currentTile === 2) {
        player.inventory.push("Schlüssel");
        document.getElementById("inventory-display").innerText = "1x Schlüssel 🔑";
        map[centerY][centerX] = 0; // Schlüssel vom Boden entfernen
        zeigeDialog("Du hast den goldenen Schlüssel gefunden!");
    }

    // Vor der Tür stehen und versuchen sie zu öffnen (Tile 3 angrenzend)
    let frontTileY = Math.floor((player.y - 5) / TILE_SIZE);
    if (map[frontTileY][centerX] === 3 && keys.w) {
        if (player.inventory.includes("Schlüssel")) {
            map[frontTileY][centerX] = 0; // Tür wird zu Boden
            player.inventory.pop(); // Schlüssel verbraucht
            document.getElementById("inventory-display").innerText = "Leer";
            zeigeDialog("Die schwere Tür hat sich geöffnet!");
        } else {
            zeigeDialog("Die Tür ist fest verschlossen. Du brauchst einen Schlüssel.");
        }
    }
}

// --- GAME LOOP ---
function update() {
    if (inDialog) return; // Wenn Dialog offen, keine Bewegung

    let nextX = player.x;
    let nextY = player.y;

    if (keys.w) nextY -= player.speed;
    if (keys.s) nextY += player.speed;
    if (keys.a) nextX -= player.speed;
    if (keys.d) nextX += player.speed;

    // Nur auf der X-Achse bewegen, wenn keine Kollision
    if (!checkCollision(nextX, player.y)) {
        player.x = nextX;
    }
    // Nur auf der Y-Achse bewegen, wenn keine Kollision
    if (!checkCollision(player.x, nextY)) {
        player.y = nextY;
    }

    // Interaktionen prüfen (Items, Türen)
    checkInteraction();
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Tilemap zeichnen
    for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
            let tile = map[row][col];
            let x = col * TILE_SIZE;
            let y = row * TILE_SIZE;

            if (tile === 0) { // Boden
                ctx.fillStyle = "#3e2723"; // Dunkles Braun
                ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
            } else if (tile === 1) { // Wand
                ctx.fillStyle = "#607d8b"; // Graugrün
                ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
                ctx.strokeStyle = "#455a64"; // Wand-Kontur
                ctx.strokeRect(x, y, TILE_SIZE, TILE_SIZE);
            } else if (tile === 2) { // Schlüssel
                ctx.fillStyle = "#3e2723"; // Boden unter Schlüssel
                ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
                ctx.fillStyle = "gold";
                ctx.beginPath();
                ctx.arc(x + TILE_SIZE/2, y + TILE_SIZE/2, 8, 0, Math.PI*2);
                ctx.fill();
            } else if (tile === 3) { // Tür
                ctx.fillStyle = "#5d4037"; // Holztür
                ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
                ctx.fillStyle = "silver"; // Schlüsselloch
                ctx.fillRect(x + TILE_SIZE/2 - 2, y + TILE_SIZE/2 - 4, 4, 8);
            }
        }
    }

    // 2. Spieler zeichnen
    ctx.fillStyle = player.color;
    ctx.fillRect(player.x, player.y, player.width, player.height);
    // Kleines Gesicht/Augen für die Richtung (hier stark vereinfacht immer nach unten)
    ctx.fillStyle = "white";
    ctx.fillRect(player.x + 4, player.y + 4, 4, 4);
    ctx.fillRect(player.x + 16, player.y + 4, 4, 4);
}

function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
}

// Spiel starten mit einem Begrüßungs-Dialog
zeigeDialog("Willkommen im Verlies. Nutze W, A, S, D zur Bewegung. Finde einen Weg durch die Stahltür im Norden.");
loop();