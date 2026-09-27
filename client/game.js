let currentCharacter;
let otherPlayers = {};
let enemyBots = {}; 
let bulletSprites = {}; 
let cursors;
let platforms;
let botGroup;
let lastDirection = 'right';
let phaserGame = null; // Joriy Phaser o'yin nusxasi (raundlar orasida tozalanadi)
let touchState = { left: false, right: false, jump: false }; // PHONE rejimidagi virtual tugmalar holati

// Raund tugaganda (g'alaba yoki mag'lubiyat) chaqiriladi: Phaser'ni butunlay
// o'chirib, keyingi raund uchun holatni tozalaydi. Shu bo'lmasa, har yangi
// raundda eski socket listenerlar/sprite'lar "yopishib" qolib, ikki barobar
// ishlab ketardi.
function stopGame() {
    if (phaserGame) {
        phaserGame.destroy(true);
        phaserGame = null;
    }
    currentCharacter = undefined;
    window.onCoinsGained = null;
    otherPlayers = {};
    enemyBots = {};
    bulletSprites = {};
    lastDirection = 'right';
    touchState = { left: false, right: false, jump: false };
}

// Bu funksiya lobby.js ichida xona egasi Start bosganda chaqiriladi
// mapData: server 'gameStarted' orqali yuborgan joriy xarita ma'lumoti (platformalar, ranglar)
function launchGame(socket, roomId, mapData, continued) {
    // Ehtiyot chorasi: agar oldingi o'yin biror sababdan hali tozalanmagan bo'lsa
    stopGame();

    const map = mapData || { platforms: [], groundColor: 0x333333, accentColor: 0x00ffcc, name: '' };
    const mapWidth = map.mapWidth || 800;
    const isChase = map.mode === 'chase' && !!map.chase;
    const isApples = map.mode === 'apples' && !!map.apples;
    const isStory = map.mode === 'story' && !!map.story;
    const isBoss = map.mode === 'boss' && !!map.boss;
    const isMarket = !!map.market; // bozor manzarasi (map-4 va map-5)
    const isForest = !!map.forest; // o'rmon: bahaybat daraxt, robot itlar, qizil qutilar (map-6)
    const isStones = !!map.stones; // g'or: chuqurlik ustida tebranib, qulaydigan toshlar (map-7)
    const isGorilla = !!map.gorilla; // tosh gorilla boss (map-8)

    // Shu raundga xos holat (har raundda launchGame qaytadan chaqiriladi)
    let crateGroup;
    let crateSprites = {};
    let snakeGfx = null;
    let snakeMouth = null;     // ilon og'zining oldi (olov shu yerdan chiqadi)
    let mouthOpen = 0;         // 0..1 - olov oldidan jag'lar silliq ochiladi
    let snakeServerX = null;   // Server yuborgan ilon boshi X'i
    let snakeDisplayX = null;  // Ekrandagi (silliqlangan) X - kamera ham shunga bog'langan
    let botsKilled = 0;
    let checkpointReached = [];
    let introWall = null;      // Ilon sindirib chiqadigan boshlang'ich devor
    let coinSprites = {};
    let mineSprites = {};
    let wallObjs = {};         // devor id -> { rect, gfx, w }
    let appleSprites = {};     // havodagi olmalar
    let elfSprite = null;      // piksel elf (otganda "otish" kadriga almashadi)
    let appleMarkerGfx = null; // olmalar tushadigan joy belgilari (yerda)
    let sellerSprite = null;   // bozordagi baliq sotuvchi elf
    let talkHint = null;       // sotuvchi tepasida "[E]" ko'rsatmasi
    let cutsceneStarted = false;
    let stallObjs = [];        // bozor rastalari: { back, front, elf, lanterns, x }
    let crowd = [];            // bozorda yurgan elflar (olomon)
    let marketWall = null;     // chapdagi katta devor + eshik (bossda ilon buzadi)
    let bossState = null;      // serverdan kelgan boss holati
    let bossFx = { wall: false, dead: false };
    let flyingMineSprites = {};
    let redBoxSprites = {};    // o'rmon: qizil qutilar (o'q tegsa portlaydi)
    let forestTriggered = false; // daraxt yoniga yetildi - itlar chiqdi
    let stoneGroup = null;     // yuruvchi toshlar (qattiq, bir tomonlama, server boshqaradi)
    let stoneSprites = {};
    let lastGroundedAt = -1e9; // toshlarda: tosh pastga ketayotganda ham sakrab ulgurish (coyote)
    let stunUntil = 0;         // gorilla itarib yuborganda - qisqa vaqt boshqaruv yo'q (uchib ketadi)
    let airJumpsLeft = 0;      // samurai 10-daraja: havoda ikkinchi sakrash
    let jumpWasDown = false;
    let wasFlying = false;     // knight 10-daraja: uchuvchi etik (R)
    let perkFxGfx = null;      // uchuvchi etik alangasi va davolash effektlari
    let gorillaState = null;   // serverdan: { hp, maxHp, x, facingLeft, state, attack, hitFlash }
    let gorillaSprite = null;
    let gPlatGroup = null;     // gorilla platformalari (shiftga uriladi) - kinematik
    let gPlatSprites = {};
    let gSpikeObjs = {};       // yerdan chiqadigan toshlar: { gfx, spike }
    let gRockSprites = {};
    let gCrackGfx = null;
    let gFloor = null;         // zal poli (oxirida sinib, pastga qulaydi)
    let gTalk = { intro: false, outro: false };
    let gPoundHit = false;     // yerni urish seriyasi: oxirgi kadr "urish" bo'lganmi
    let gCracks = [];          // urishlardan polda paydo bo'lgan yoriqlar
    let gRideId = null;        // shiftga otilayotgan platforma ustida qolgan bo'lsam - uning id si
    let bigDoor = null;        // katta devordagi eshik
    let doorIsOpen = false;
    let dialog = null;         // ochiq dialog oynasi (Undertale uslubida)
    let hudKey = null;         // HUD'dagi kalit belgisi
    let myApples = 0;
    let pickupHint = null;     // Yaqindagi tanga ustida "E" yozuvi
    let lastSentMove = { x: -1, y: -1, t: -1e9 }; // serverga oxirgi yuborilgan joy (tarmoqni tejash)
    let emotes = [];           // qahramonlar tepasidagi emotsiyalar: { img, playerId }
    let lastEmoteAt = -1e9;

    const config = {
        type: Phaser.AUTO,
        width: 800,
        height: 600,
        parent: 'game-container', // O'yin aynan index.html dagi shu div ichiga tushadi
        physics: {
            default: 'arcade',
            arcade: {
                gravity: { y: 600 },
                debug: false
            }
        },
        scene: { preload: preload, create: create, update: update }
    };

    phaserGame = new Phaser.Game(config);

    function preload() {
        // Emotsiya ("1" tugmasi) - qahramon tepasida ko'rinadi
        this.load.image('emote_1', 'public/emotions/emotion-1.png');
    }

    // Rangni oqartirish/qoraytirish (piksel soyalar uchun)
    function mixColor(c, t, k) {
        const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
        const tr = (t >> 16) & 255, tg = (t >> 8) & 255, tb = t & 255;
        return (Math.round(r + (tr - r) * k) << 16) | (Math.round(g + (tg - g) * k) << 8) | Math.round(b + (tb - b) * k);
    }

    // O'YINCHI QAHRAMON TANASI (chizma bo'yicha, piksel): skin rangidagi tik to'rtburchak
    // (chap qirrasi yorug', o'ng qirrasi soyada), o'ng tomonda - qora ramkali TO'Q SARIQ visor,
    // ichida ikkita oq tirqish. O'ngga qaragan; chapga qaraganda rasm ko'zgudek aylanadi. 32x48
    function createPlayerTexture(scene, key, color) {
        if (scene.textures.exists(key)) return;
        const W = 14, H = 22;
        const g = gridNew(W, H);
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                let c = color;
                if (x <= 1) c = mixColor(color, 0xffffff, 0.22);
                else if (x >= W - 2) c = mixColor(color, 0x000000, 0.25);
                if (y >= H - 2) c = mixColor(c, 0x000000, 0.18);
                g[y][x] = c;
            }
        }
        const INK = 0x141414, ORANGE = 0xd9822b, WHITE = 0xffffff;
        for (let x = 6; x < W; x++) { g[4][x] = INK; g[7][x] = INK; }
        g[5][6] = INK; g[6][6] = INK;
        for (let x = 7; x < W; x++) { g[5][x] = ORANGE; g[6][x] = ORANGE; }
        [8, 9, 11, 12].forEach((x) => { g[5][x] = WHITE; });
        gridToTexture(scene, key, gridOutline(g, 0x0d0d0d), 2);
    }


    // ROBOT BOT (chizma bo'yicha, piksel uslubda; o'ngga qaragan, 2px katak):
    //   idle   - kulrang bosh (2 ta ko'kish deraza), jigarrang tana, ko'kraqda ko'k uchburchak
    //            nishon (ichida chiziqlar), qo'lida pastga-oldinga qaragan qilich
    //   attack - nishon qizil (derazachali), oldida kulrang yarim oy - zarba izi
    //   block  - katta ko'k uchburchak QALQON butun oldini yopadi, qilich ko'rinib turadi
    function botGrid(pose) {
        const W = 40, H = 24;
        const g = gridNew(W, H);
        const rect = (x, y, w, h, c) => gridRect(g, x, y, w, h, c);
        const set = (x, y, c) => { if (y >= 0 && y < H && x >= 0 && x < W) g[y][x] = c; };
        const GREY = [0x8e8e96, 0xa9a9b0, 0xc4c4ca], BROWN = [0x8d5a3a, 0xa9714c, 0xc08660];
        const INK = 0x16303c, SKY = 0x81d4fa, SKY_D = 0x4fa3c7;
        // Tana
        for (let y = 9; y < 24; y++) for (let x = 14; x < 26; x++) g[y][x] = shade(0.75 - (x - 14) / 30 - (y - 9) / 60, x, y, BROWN);
        rect(12, 22, 5, 2, BROWN[0]); rect(23, 22, 5, 2, BROWN[0]);            // oyoq kaftlari
        // Bosh
        for (let y = 0; y < 10; y++) for (let x = 12; x < 28; x++) g[y][x] = shade(0.8 - (x - 12) / 40 - y / 30, x, y, GREY);
        [[15, 3], [22, 3]].forEach(([x, y]) => { rect(x - 1, y - 1, 5, 4, INK); rect(x, y, 3, 2, pose === 'attack' ? 0xff8a80 : SKY); });
        // Ko'krak nishoni (teskari uchburchak)
        const tri = (top, x0, x1, apexY, fill, border) => {
            for (let y = top; y <= apexY; y++) {
                const k = (y - top) / (apexY - top);
                const l = Math.round(x0 + (20 - x0) * k), r = Math.round(x1 - (x1 - 20) * k);
                for (let x = l; x <= r; x++) set(x, y, (x === l || x === r || y === top) ? border : fill(x, y));
            }
        };
        const sword = () => {
            for (let i = 0; i < 12; i++) { set(26 + i, 13 + Math.round(i * 0.5), 0x2b2b2b); set(26 + i, 14 + Math.round(i * 0.5), 0xdfe3e6); }
            set(38, 19, 0x2b2b2b); set(39, 20, 0x2b2b2b); set(38, 20, 0xdfe3e6);
            rect(25, 12, 2, 4, 0x3e2723);                                          // dasta
        };
        if (pose === 'block') {
            // Katta QALQON: bosh va tanani oldidan yopadi, 3 ta ko'k bo'lak
            tri(0, 7, 33, 23, (x) => ([13, 20, 27].includes(x) ? INK : (x < 13 || (x > 20 && x < 27)) ? SKY : SKY_D), INK);
            sword();
        } else if (pose === 'attack') {
            tri(9, 15, 25, 21, (x, y) => (y >= 11 && y <= 13 && x >= 17 && x <= 19) ? 0xffffff : 0x8b0000, 0x3b0000);
            // Zarba izi - oldida kulrang yarim oy
            for (let a = -1.2; a <= 1.2; a += 0.05) {
                const cx = 27, cy = 12;
                for (let r = 8; r <= 11; r++) {
                    const x = Math.round(cx + Math.cos(a) * r), y = Math.round(cy + Math.sin(a) * r * 1.05);
                    set(x, y, r === 11 || r === 8 ? 0x5f5f66 : 0x9e9ea6);
                }
            }
        } else {
            tri(9, 15, 25, 21, (x) => ([18, 20, 22].includes(x) ? SKY_D : SKY), INK);
            sword();
        }
        return gridOutline(g, 0x0d0d0d);
    }
    function ensureBotTextures(scene) {
        ['idle', 'attack', 'block'].forEach((pose) => {
            if (!scene.textures.exists('px_bot_' + pose)) gridToTexture(scene, 'px_bot_' + pose, botGrid(pose), 2);
        });
    }

    // BOTNING QILICHI / QALQONI: holatiga qarab (oddiy holatda qilich, "isBlocking"
    // bo'lsa katta qalqon, "isAttacking" bo'lsa qisqa zarba yoyi) chiziladi
    // Piksel robotda qilich/qalqon rasmning o'zida - bu yerda faqat uchish paytidagi ko'k olov chiziladi
    function updateBotWeaponVisuals(scene, bot) {
        if (!bot.weaponGfx) bot.weaponGfx = scene.add.graphics().setDepth(3);
        const g = bot.weaponGfx;
        g.clear();

        const bx = bot.x, by = bot.y;

        if (bot.isJetting) {
            // KO'K OLOV: bot tagidan (oyog'idan) pastga qarab lipillab turuvchi
            // alanga - uzunligi har kadrda tasodifiy o'zgaradi, tirikdek ko'rinadi
            const feetY = by + 20;
            const len = 16 + Math.random() * 14;
            const layers = [
                { w: 13, l: len, c: 0x1565c0, a: 0.85 },
                { w: 8, l: len * 0.75, c: 0x4fc3f7, a: 0.95 },
                { w: 3.5, l: len * 0.45, c: 0xffffff, a: 1 }
            ];
            layers.forEach(({ w, l, c, a }) => {
                g.fillStyle(c, a);
                g.fillTriangle(bx - w, feetY, bx + w, feetY, bx + (Math.random() - 0.5) * 3, feetY + l);
            });
        }
    }


    // TO'LDIRILGAN "QALIN CHIZIQ": ikki nuqta orasida ma'lum kenglikdagi,
    // qora chegarali to'ldirilgan to'rtburchak chizadi - qurollarni ingichka
    // chiziq emas, siz chizgandek "qalin, quyuq" shaklda ko'rsatish uchun
    function drawThickLine(g, x1, y1, x2, y2, width, fillColor, strokeColor) {
        const dx = x2 - x1, dy = y2 - y1;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len * (width / 2), ny = dx / len * (width / 2);

        g.fillStyle(fillColor, 1);
        g.lineStyle(1.5, strokeColor, 1);
        g.beginPath();
        g.moveTo(x1 + nx, y1 + ny);
        g.lineTo(x2 + nx, y2 + ny);
        g.lineTo(x2 - nx, y2 - ny);
        g.lineTo(x1 - nx, y1 - ny);
        g.closePath();
        g.fillPath();
        g.strokePath();
    }

    // QAHRAMONNING TINCH HOLATDAGI QUROLI: har bir sinf o'ziga xos qurolni
    // qo'lida ushlab turadi - siz bergan "default pose" sxemasiga mos (to'la
    // to'ldirilgan, qora chegarali shakllar, ingichka chiziqlar emas):
    // samuray - diagonal katana (pastda romb shaklidagi jigarrang dastasi),
    // ritsar - deyarli tik tig' + qora dastasi,
    // kamonchi - to'ldirilgan uchburchak yoy,
    // sehrgar - diagonal tayoqcha, dastasida to'p, uchida kichik xoch
    // QUROLLAR (chizma bo'yicha, piksel, o'ngga qaragan, dastasi chapda):
    //   knight - tepaga-oldinga ko'tarilgan katta qilich (qora gard); samurai - pastga-orqaga
    //   qaragan katana (jigarrang dasta, oq tig'); archer - uchburchak kamon + tayoq;
    //   mage - pastida sariq shar, tepasida sariq sharcha va halqa; Q bilan: drobovik, kunai
    function weaponGrid(kind) {
        const put = (g, x, y, c) => { if (g[y] && x >= 0 && x < g[0].length) g[y][x] = c; };
        if (kind === 'sword') {
            const g = gridNew(30, 7);
            for (let x = 0; x < 5; x++) for (let y = 2; y < 5; y++) g[y][x] = 0x2b1d14;
            for (let y = 0; y < 7; y++) { g[y][5] = 0x111111; g[y][6] = 0x111111; }
            for (let x = 7; x < 27; x++) { g[2][x] = 0xe0e6ea; g[3][x] = 0xb0bec5; g[4][x] = 0x78909c; }
            put(g, 27, 3, 0xb0bec5); put(g, 27, 2, 0xe0e6ea); put(g, 28, 3, 0x90a4ae); put(g, 29, 3, 0x78909c);
            return gridOutline(g, 0x111111);
        }
        if (kind === 'katana') {
            const g = gridNew(34, 5);
            for (let x = 0; x < 7; x++) for (let y = 1; y < 4; y++) g[y][x] = (x % 2) ? 0x6d4c41 : 0x3e2723;
            for (let y = 0; y < 5; y++) g[y][7] = 0xc9975b;
            for (let x = 8; x < 31; x++) { g[1][x] = 0x9e9e9e; g[2][x] = 0xf5f5f5; g[3][x] = 0xffffff; }
            put(g, 31, 2, 0xf5f5f5); put(g, 31, 3, 0xffffff); put(g, 32, 3, 0xffffff); put(g, 33, 3, 0xe0e0e0);
            return gridOutline(g, 0x111111);
        }
        if (kind === 'bow') {
            const g = gridNew(18, 14);
            for (let x = 0; x < 14; x++) { g[6][x] = 0x8d5a3a; g[7][x] = 0x6d4c41; }
            for (let y = 0; y < 14; y++) {
                const half = Math.abs(y - 6.5);
                const x0 = 8 + Math.round(half * 0.2), x1 = 17 - Math.round(half * 1.2);
                for (let x = x0; x <= x1; x++) g[y][x] = (x === x0 || x === x1 || y === 0 || y === 13) ? 0x5d3a22 : 0xb97a57;
            }
            for (let y = 0; y < 14; y++) put(g, 8, y, 0xf5f5f5);                          // ip
            return gridOutline(g, 0x111111);
        }
        if (kind === 'staff') {
            const g = gridNew(32, 8);
            for (let y = 1; y < 7; y++) for (let x = 0; x < 6; x++) if (Math.hypot(x - 2.5, y - 3.5) < 3) g[y][x] = (x + y < 5) ? 0xfff59d : 0xffd600;
            for (let x = 6; x < 27; x++) { g[3][x] = 0xa1673e; g[4][x] = 0x7b4a2a; }
            for (let y = 1; y < 7; y++) { g[y][21] = 0xffd600; g[y][22] = 0xffab00; }
            for (let y = 2; y < 6; y++) for (let x = 27; x < 31; x++) if (Math.hypot(x - 28.5, y - 3.5) < 2.1) g[y][x] = (x < 29 && y < 4) ? 0xfff59d : 0xffd600;
            return gridOutline(g, 0x111111);
        }
        if (kind === 'shotgun') {
            const g = gridNew(28, 7);
            for (let x = 0; x < 8; x++) for (let y = 2 + Math.floor(x / 4); y < 6; y++) g[y][x] = 0x6d4c41;
            for (let x = 8; x < 13; x++) for (let y = 1; y < 5; y++) g[y][x] = 0x37474f;
            for (let x = 13; x < 28; x++) { g[1][x] = 0x78909c; g[2][x] = 0x546e7a; g[3][x] = 0x455a64; }
            for (let x = 15; x < 21; x++) { g[4][x] = 0x8d5a3a; g[5][x] = 0x6d4c41; }       // pomp
            put(g, 10, 5, 0x263238); put(g, 10, 6, 0x263238);                                 // tepki
            return gridOutline(g, 0x111111);
        }
        if (kind === 'kunai') {
            const g = gridNew(16, 5);
            for (let y = 1; y < 4; y++) { g[y][0] = 0xc62828; g[y][2] = 0xc62828; }
            g[1][1] = 0xc62828; g[3][1] = 0xc62828;
            for (let x = 3; x < 7; x++) g[2][x] = 0x212121;
            for (let x = 7; x < 16; x++) { const hw = Math.max(0, Math.round((16 - x) / 4)); for (let y = 2 - hw; y <= 2 + hw; y++) put(g, x, y, y < 2 ? 0xeceff1 : 0xb0bec5); }
            return gridOutline(g, 0x111111);
        }
        if (kind === 'shield') {
            // Ritsar qalqoni: temir hoshiya, ko'k yuz, o'rtada oltin chiziq va belgi
            const g = gridNew(18, 26);
            for (let y = 0; y < 26; y++) {
                const hw = y < 14 ? 9 : Math.max(1, Math.round(9 * (1 - (y - 14) / 12)));
                for (let x = 9 - hw; x < 9 + hw; x++) {
                    const edge = x === 9 - hw || x === 9 + hw - 1 || y === 0 || y === 25;
                    g[y][x] = edge ? 0x455a64 : (x === 8 || x === 9) ? 0xffca28 : shade(0.8 - y / 40 - (x > 9 ? 0.15 : 0), x, y, [0x1565c0, 0x1e88e5, 0x42a5f5, 0x90caf9]);
                }
            }
            for (let y = 8; y < 13; y++) for (let x = 6; x < 12; x++) if (Math.abs(x - 8.5) + Math.abs(y - 10) < 3.2) g[y][x] = 0xffca28;
            return gridOutline(g, 0x111111);
        }
        if (kind === 'flash') {
            const g = gridNew(10, 10);
            for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) {
                const d = Math.abs(x - 4.5) + Math.abs(y - 4.5);
                if (d < 5 && (Math.abs(x - 4.5) < 1 || Math.abs(y - 4.5) < 1 || d < 3)) g[y][x] = d < 2 ? 0xffffff : d < 3.5 ? 0xffeb3b : 0xff9100;
            }
            return g;
        }
        return gridNew(1, 1);
    }
    function ensureWeaponTextures(scene) {
        ['sword', 'katana', 'bow', 'staff', 'shotgun', 'kunai', 'shield', 'flash'].forEach((k) => {
            if (!scene.textures.exists('w_' + k)) gridToTexture(scene, 'w_' + k, weaponGrid(k), 2);
        });
    }
    // Qurolning qo'ldagi joyi (tana markaziga nisbatan, o'ngga qaraganda), dasta nuqtasi va burchagi
    const WEAPON_POSE = {
        knight: { tex: 'w_sword', ox: 0.1, hand: [9, 8], angle: -58 },
        samurai: { tex: 'w_katana', ox: 0.12, hand: [9, 8], angle: 152 },
        archer: { tex: 'w_bow', ox: 0.2, hand: [8, 4], angle: 18 },
        mage: { tex: 'w_staff', ox: 0.6, hand: [9, 6], angle: -38 },
        shotgun: { tex: 'w_shotgun', ox: 0.3, hand: [9, 6], angle: 0 },
        kunai: { tex: 'w_kunai', ox: 0.25, hand: [11, 6], angle: 12 }
    };
    function weaponPoseKey(sprite, characterType) {
        if (sprite.weaponMode === 'alt' && characterType === 'knight') return 'shotgun';
        if (sprite.weaponMode === 'alt' && characterType === 'samurai') return 'kunai';
        return characterType in WEAPON_POSE ? characterType : 'knight';
    }

    // Har kadr: qurol qo'lda (zarba animatsiyasi siljishlari bilan), ritsar qalqoni (paydo bo'lish/
    // yo'qolish animatsiyasi), tana qarash tomoniga buriladi
    function updateHeroWeaponVisuals(scene, sprite, characterType, facingRight) {
        ensureWeaponTextures(scene);
        if (!sprite.weaponSpr) sprite.weaponSpr = scene.add.image(sprite.x, sprite.y, 'w_sword').setDepth(3.1);
        if (!sprite.shieldSpr) sprite.shieldSpr = scene.add.image(sprite.x, sprite.y, 'w_shield').setDepth(3.2).setScale(0).setVisible(false);
        if (!sprite.atk) sprite.atk = { angle: 0, dx: 0, dy: 0 };
        sprite.setFlipX(!facingRight);
        const dir = facingRight ? 1 : -1;
        const pose = WEAPON_POSE[weaponPoseKey(sprite, characterType)];
        const w = sprite.weaponSpr;
        const hidden = sprite.isDead || sprite.alpha <= 0.01;
        w.setVisible(!hidden);
        if (!hidden) {
            if (w.texture.key !== pose.tex) w.setTexture(pose.tex);
            const ang = pose.angle + sprite.atk.angle;
            w.setFlipX(!facingRight).setOrigin(facingRight ? pose.ox : 1 - pose.ox, 0.5);
            w.angle = facingRight ? ang : -ang;
            w.setPosition(sprite.x + dir * (pose.hand[0] + sprite.atk.dx), sprite.y + pose.hand[1] + sprite.atk.dy);
            w.setAlpha(sprite.alpha);
            if (characterType === 'mage' && sprite.weaponMode === 'alt') w.setTint(0x80d8ff); else w.clearTint();
        }
        // RITSAR QALQONI: bosilganda oldinga "chiqadi" (kattalashib), qo'yib yuborilganda yo'qoladi
        const sh = sprite.shieldSpr;
        const want = !!sprite.shieldActive && !sprite.isDead;
        if (want && !sprite.shieldOn) {
            sprite.shieldOn = true;
            scene.tweens.killTweensOf(sh);
            sh.setVisible(true).setScale(0.2).setAlpha(1);
            scene.tweens.add({ targets: sh, scale: 1, duration: 170, ease: 'Back.Out' });
            for (let k = 0; k < 6; k++) {
                const spark = scene.add.rectangle(sprite.x + dir * 16, sprite.y, 4, 4, 0x90caf9).setDepth(3.3);
                scene.tweens.add({ targets: spark, x: spark.x + dir * Phaser.Math.Between(6, 26), y: spark.y + Phaser.Math.Between(-24, 24),
                    alpha: 0, duration: 260, onComplete: () => spark.destroy() });
            }
        } else if (!want && sprite.shieldOn) {
            sprite.shieldOn = false;
            scene.tweens.killTweensOf(sh);
            scene.tweens.add({ targets: sh, scale: 0, alpha: 0, duration: 130, onComplete: () => sh.setVisible(false) });
        }
        if (sh.visible) {
            sh.setFlipX(!facingRight);
            sh.setPosition(sprite.x + dir * 15, sprite.y + 2 + Math.sin(scene.time.now / 180) * 1.5);
            if (sprite.shieldOn) sh.setAlpha(sprite.alpha);
        }
    }

    // ZARBA ANIMATSIYASI (o'q/zarba paydo bo'lganda egasining qurolida):
    //   qilich - tepadan pastga keng silkinish; katana - orqadan oldinga tez kesish; kamon - orqaga
    //   tepish; hassa - oldinga niqtash + sharcha chaqnashi; drobovik - tepish + og'izdan olov; kunai - otish
    function playHeroAttack(scene, sprite, bulletType) {
        if (!sprite || !sprite.active || scene.time.now - (sprite.lastAtkAt || 0) < 60) return;
        sprite.lastAtkAt = scene.time.now;
        if (!sprite.atk) sprite.atk = { angle: 0, dx: 0, dy: 0 };
        const a = sprite.atk;
        scene.tweens.killTweensOf(a);
        a.angle = 0; a.dx = 0; a.dy = 0;
        const swing = (to, inMs, outMs) => {
            scene.tweens.add({ targets: a, ...to, duration: inMs, ease: 'Quad.In', onComplete: () => {
                scene.tweens.add({ targets: a, angle: 0, dx: 0, dy: 0, duration: outMs, ease: 'Quad.Out' });
            } });
        };
        const facingRight = !sprite.flipX, dir = facingRight ? 1 : -1;
        if (bulletType === 'pellet') {
            swing({ dx: -7, angle: -14 }, 50, 170);
            const f = scene.add.image(sprite.x + dir * 50, sprite.y + 5, 'w_flash').setDepth(4).setScale(0.4).setFlipX(!facingRight);
            scene.tweens.add({ targets: f, scale: 1.3, alpha: 0, duration: 110, onComplete: () => f.destroy() });
            for (let k = 0; k < 4; k++) {
                const smoke = scene.add.rectangle(sprite.x + dir * 48, sprite.y + 4, 5, 5, 0xbdbdbd, 0.8).setDepth(4);
                scene.tweens.add({ targets: smoke, x: smoke.x + dir * Phaser.Math.Between(4, 16), y: smoke.y - Phaser.Math.Between(4, 18), alpha: 0, scale: 2,
                    duration: 360, onComplete: () => smoke.destroy() });
            }
            if (sprite === currentCharacter) scene.cameras.main.shake(70, 0.004);
        } else if (bulletType === 'kunai') {
            swing({ angle: -60, dx: 6 }, 60, 170);
        } else if (sprite.characterType === 'knight') {
            swing({ angle: 105, dy: 2 }, 80, 190);
        } else if (sprite.characterType === 'samurai') {
            swing({ angle: -170, dx: 3 }, 60, 200);
        } else if (sprite.characterType === 'archer') {
            swing({ dx: -5, angle: -4 }, 40, 140);
        } else if (sprite.characterType === 'mage') {
            swing({ dx: 7, angle: -6 }, 60, 160);
            const glow = scene.add.circle(sprite.x + dir * 30, sprite.y - 14, 6, bulletType === 'ice' ? 0x80d8ff : 0xffea00, 0.9).setDepth(4);
            scene.tweens.add({ targets: glow, scale: 2.2, alpha: 0, duration: 200, onComplete: () => glow.destroy() });
        }
    }

    // RETRO PIKSEL KALLA IKONKASI (emoji o'rniga) - "arvoh" holatida ko'rsatiladi
    function drawSkullIcon(scene, x, y) {
        const g = scene.add.graphics().setScrollFactor(0).setDepth(1002);
        g.fillStyle(0x66aaff, 1);
        g.fillRect(x, y, 24, 18);              // Bosh
        g.fillStyle(0x0a1a33, 1);
        g.fillRect(x + 4, y + 5, 6, 7);        // Chap ko'z chuqurchasi
        g.fillRect(x + 14, y + 5, 6, 7);       // O'ng ko'z chuqurchasi
        g.fillRect(x + 10, y + 13, 4, 4);      // Burun
        g.fillStyle(0x66aaff, 1);
        g.fillRect(x + 2, y + 18, 20, 5);      // Jag'
        g.fillStyle(0x0a1a33, 1);
        for (let i = 0; i < 4; i++) g.fillRect(x + 3 + i * 5, y + 20, 2, 3); // Tishlar
        return g;
    }

    // JON CHIZIG'INI CHIZISH FUNKSIYASI
    function drawHealthBar(scene, sprite, hp, maxHp) {
        if (!sprite.healthBar) {
            sprite.healthBar = scene.add.graphics().setDepth(4);
        }
        sprite.healthBar.clear();
        
        if (hp <= 0) return;

        // Rasmning haqiqiy tepa qirrasidan (origin hisobga olinadi) - aks holda baland yoki
        // pastga surilgan teksturalarda (katta it) chiziq boshning ustiga emas, ichiga tushardi
        const barY = Math.round(sprite.y - sprite.displayHeight * sprite.originY - 9);
        const x = Math.round(sprite.x - 16);

        // Piksel uslub: qora ramka, to'q fon, jon rangi (yashil -> sariq -> qizil), yuqorida yorug' qator
        const frac = Math.max(0, Math.min(1, hp / (maxHp || 100)));
        const pal = hpPalette(frac);
        const g = sprite.healthBar;
        g.fillStyle(0x000000, 1); g.fillRect(x - 1, barY - 1, 34, 6);
        g.fillStyle(pal.empty, 1); g.fillRect(x, barY, 32, 4);
        const fw = Math.round(frac * 32);
        g.fillStyle(pal.fill, 1); g.fillRect(x, barY, fw, 4);
        g.fillStyle(pal.light, 1); g.fillRect(x, barY, fw, 1);
    }

    // BAHAYBAT ROBOT-ILON: po'lat bo'g'imlardan iborat tana (har birida qizil
    // yonib-o'chuvchi yadro, parchinlar, tepasida tikan), to'lqinlanib sudraladi.
    // Boshi ~250x210: ochiq po'lat jag', tishlar, qizil ko'z-visor, antenna.
    // headX - jag'ning OLD qirrasi (server shu chiziqdan orqadagilarni yutadi)
    function drawSnake(g, headX, time, mouth) {
        g.clear();
        const phase = time / 220;
        const R = 80, segs = 22, spacing = 50;
        for (let i = segs; i >= 1; i--) {
            const r = R - i * 1.6;
            const x = headX - 200 - i * spacing;
            const y = 570 - R + Math.sin(phase - i * 0.5) * 14 + (R - r);
            g.fillStyle(0x37474f, 1);
            g.fillTriangle(x - r * 0.3, y - r * 0.8, x + r * 0.3, y - r * 0.8, x, y - r - 24);
            g.fillStyle(i % 2 ? 0x78909c : 0x607d8b, 1);
            g.fillCircle(x, y, r);
            g.lineStyle(4, 0x37474f, 1);
            g.strokeCircle(x, y, r);
            g.lineStyle(3, 0x90a4ae, 0.8);
            g.strokeCircle(x, y, r * 0.62);
            const pulse = 0.5 + 0.5 * Math.sin(time / 150 + i);
            g.fillStyle(0xff1744, 0.45 + 0.55 * pulse);
            g.fillCircle(x, y, r * 0.17);
            g.fillStyle(0xcfd8dc, 1);
            for (let a = 0; a < 6; a++) {
                const ang = (a / 6) * Math.PI * 2 + i;
                g.fillCircle(x + Math.cos(ang) * r * 0.82, y + Math.sin(ang) * r * 0.82, 3);
            }
        }

        // mouth: 0 - odatdagi (sekin chaynaydi), 1 - OLOV: bosh ko'tariladi, jag'lar keng ochiladi
        const m = mouth || 0;
        const hy = 470 + Math.sin(phase) * 8 * (1 - m) - 34 * m;   // bosh markazi
        const open = (10 + Math.abs(Math.sin(time / 300)) * 14) * (1 - m) + 6 * m;
        const jy = hy + 26 + open;
        // Jag'lar orqadagi "mentesha" atrofida aylanadi: yuqorisi tepaga, pastkisi pastga
        const hx0 = headX - 236, hy0 = hy + 12;
        const aU = -0.46 * m, aL = 0.2 * m;
        const rot = (x, y, a) => {
            const c = Math.cos(a), sn = Math.sin(a), dx = x - hx0, dy = y - hy0;
            return [hx0 + dx * c - dy * sn, hy0 + dx * sn + dy * c];
        };
        const U = (x, y) => rot(x, y, aU);
        const L = (x, y) => rot(x, y, aL);
        const poly = (pts) => {
            g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
            for (let k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]);
            g.closePath(); g.fillPath();
        };
        const outline = (pts) => {
            g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
            for (let k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]);
            g.closePath(); g.strokePath();
        };
        const tri = (a, b, c) => g.fillTriangle(a[0], a[1], b[0], b[1], c[0], c[1]);

        // Og'iz ichi: jag'lar orasidagi bo'shliq - to'q qizil, olovda tomoq oq-sariq cho'g'
        g.fillStyle(0x3e0000, 1);
        poly([[hx0 - 10, hy0], U(headX - 250, hy + 6), U(headX, hy - 6), L(headX - 8, jy + 8), L(headX - 240, jy)]);
        g.fillStyle(0xff3d00, 0.45 + 0.4 * m);
        poly([[hx0, hy0], U(headX - 190, hy + 6), U(headX - 30, hy), L(headX - 40, jy + 6), L(headX - 190, jy + 2)]);
        if (m > 0.05) {
            const fl = 0.8 + 0.2 * Math.sin(time / 40);
            g.fillStyle(0xffd54f, 0.85 * m * fl);
            poly([[hx0 + 10, hy0], U(headX - 150, hy + 8), U(headX - 70, hy + 6), L(headX - 80, jy + 4), L(headX - 150, jy + 2)]);
            g.fillStyle(0xfffde7, 0.9 * m * fl); g.fillCircle(hx0 + 40, hy0 + 2, 14 + 6 * fl);
        }

        // Pastki jag'
        const lower = [L(headX - 240, jy), L(headX - 8, jy + 8), L(headX - 22, jy + 44), L(headX - 240, jy + 52)];
        g.fillStyle(0x455a64, 1); poly(lower);
        g.lineStyle(4, 0x263238, 1); outline(lower);
        // Yuqori jag' (bosh suyagi)
        const upper = [U(headX - 250, hy - 70), U(headX - 70, hy - 100), U(headX, hy - 40), U(headX, hy - 6), U(headX - 250, hy + 6)];
        g.fillStyle(0x546e7a, 1); poly(upper);
        g.lineStyle(4, 0x263238, 1); outline(upper);
        // Tishlar (har biri o'z jag'i bilan)
        g.fillStyle(0xeceff1, 1);
        for (let tx = headX - 200; tx < headX - 12; tx += 24) {
            tri(U(tx, hy - 5), U(tx + 14, hy - 5), U(tx + 7, hy + 16));
            tri(L(tx + 6, jy + 4), L(tx + 20, jy + 4), L(tx + 13, jy - 16));
        }
        // Zirh chizig'i, parchinlar, ko'z-visor, antenna - yuqori jag' bilan birga
        g.lineStyle(3, 0x78909c, 1);
        const a1 = U(headX - 230, hy - 40), a2 = U(headX - 90, hy - 62);
        g.lineBetween(a1[0], a1[1], a2[0], a2[1]);
        g.fillStyle(0xcfd8dc, 1);
        for (let rx = headX - 230; rx < headX - 40; rx += 36) { const r = U(rx, hy - 20); g.fillCircle(r[0], r[1], 3.5); }
        const glow = 0.6 + 0.4 * Math.sin(time / 120);
        const visor = (x, y, w, h) => poly([U(x, y), U(x + w, y), U(x + w, y + h), U(x, y + h)]);
        g.fillStyle(0xff1744, 0.25 * glow + 0.3 * m); visor(headX - 162, hy - 76, 94, 30);
        g.fillStyle(m > 0.5 ? 0xffea00 : 0xff1744, 1); visor(headX - 150, hy - 68, 70, 14);
        g.fillStyle(0xffcdd2, 1); visor(headX - 118, hy - 65, 16, 5);
        g.lineStyle(4, 0x37474f, 1);
        const b1 = U(headX - 205, hy - 76), b2 = U(headX - 228, hy - 140);
        g.lineBetween(b1[0], b1[1], b2[0], b2[1]);
        g.fillStyle(Math.floor(time / 300) % 2 ? 0xff1744 : 0x5d0000, 1);
        g.fillCircle(b2[0], b2[1] - 2, 7);

        // Olov og'izning shu joyidan (jag'lar uchlari orasidan) chiqadi
        const ut = U(headX, hy - 6), lt = L(headX - 8, jy + 8);
        snakeMouth = { x: (ut[0] + lt[0]) / 2, y: (ut[1] + lt[1]) / 2, gap: Math.max(20, lt[1] - ut[1]) };
    }

    // MINA PORTLASHI: chaqnash, olov halqasi, parchalar, tutun; ekranda
    // ko'rinsa - ekran silkinadi; yaqin turgan o'z qahramonimiz tepaga otiladi
    function explodeMine(scene, x, y) {
        const cam = scene.cameras.main;
        const flash = scene.add.circle(x, y, 12, 0xffeb3b, 1).setDepth(7);
        scene.tweens.add({ targets: flash, scale: 6, alpha: 0, duration: 320, onComplete: () => flash.destroy() });
        const ring = scene.add.circle(x, y, 14, 0xff6d00, 0.9).setDepth(7);
        scene.tweens.add({ targets: ring, scale: 4.5, alpha: 0, duration: 480, onComplete: () => ring.destroy() });
        for (let k = 0; k < 10; k++) {
            const chip = scene.add.rectangle(x, y, 6, 6, k % 2 ? 0x263238 : 0xff9100).setDepth(7);
            scene.tweens.add({
                targets: chip, x: x + Phaser.Math.Between(-90, 90), y: y - Phaser.Math.Between(20, 140),
                angle: Phaser.Math.Between(-360, 360), alpha: 0, duration: 650, onComplete: () => chip.destroy()
            });
        }
        for (let k = 0; k < 4; k++) {
            const puff = scene.add.circle(x + Phaser.Math.Between(-20, 20), y - 10, 14, 0x616161, 0.6).setDepth(6);
            scene.tweens.add({ targets: puff, y: y - 90, scale: 2.2, alpha: 0, duration: 1100, onComplete: () => puff.destroy() });
        }
        if (x > cam.scrollX - 60 && x < cam.scrollX + 860) cam.shake(350, 0.012);
        if (currentCharacter && currentCharacter.active && Math.abs(currentCharacter.x - x) < 60 && Math.abs(currentCharacter.y - y) < 60) {
            currentCharacter.setVelocityY(-330);
        }
    }

    // CHEKPOINT: ko'k nurli maydoncha (nur lipillaydi, uchqunlar ko'tariladi)
    function drawCheckpointPad(scene, pad) {
        const beam = scene.add.graphics().setDepth(1);
        [70, 46, 22].forEach((w, i) => {
            beam.fillStyle(0x2979ff, 0.10 + i * 0.07);
            beam.fillRect(pad.x + pad.w / 2 - w, 0, w * 2, pad.y);
        });
        scene.tweens.add({ targets: beam, alpha: 0.45, duration: 700, yoyo: true, repeat: -1 });
        const padTop = scene.add.rectangle(pad.x + pad.w / 2, pad.y + 3, pad.w, 6, 0x40c4ff).setDepth(2);
        scene.tweens.add({ targets: padTop, alpha: 0.5, duration: 500, yoyo: true, repeat: -1 });
        scene.time.addEvent({
            delay: 120, loop: true, callback: () => {
                const spark = scene.add.rectangle(pad.x + Phaser.Math.Between(8, pad.w - 8), pad.y - 4, 4, 4, 0x80d8ff).setDepth(2);
                scene.tweens.add({ targets: spark, y: pad.y - Phaser.Math.Between(120, 260), alpha: 0, duration: 1400, onComplete: () => spark.destroy() });
            }
        });
    }

    // ESHIK: ochiq holati (qorong'i ichi, ko'kish nur, yon tomonga ochilgan tabaqa)
    // va yopiq holati (alpha 0 - kerak bo'lganda ko'rsatiladi)
    function makeDoor(scene, x, bottomY) {
        const open = scene.add.graphics().setDepth(1);
        open.fillStyle(0x4e342e, 1); open.fillRect(x - 4, bottomY - 84, 52, 84);
        open.fillStyle(0x120a05, 1); open.fillRect(x, bottomY - 80, 44, 80);
        open.fillStyle(0x80d8ff, 0.25); open.fillRect(x + 4, bottomY - 76, 36, 76);
        open.fillStyle(0x8d6e63, 1); open.fillRect(x - 14, bottomY - 80, 10, 80);
        const closed = scene.add.graphics().setDepth(1).setAlpha(0);
        closed.fillStyle(0x4e342e, 1); closed.fillRect(x - 4, bottomY - 84, 52, 84);
        closed.fillStyle(0x8d6e63, 1); closed.fillRect(x, bottomY - 80, 44, 80);
        closed.lineStyle(2, 0x6d4c41, 1);
        for (let px = x + 11; px < x + 44; px += 11) closed.lineBetween(px, bottomY - 78, px, bottomY - 2);
        closed.fillStyle(0xffca28, 1); closed.fillCircle(x + 36, bottomY - 40, 3);
        return { open, closed };
    }

    // ===== PIKSEL-ART YORDAMCHILARI =====
    // Rasm "katak"lar (grid) ko'rinishida quriladi, har katak = P x P piksel.
    // Oxirida avtomatik to'q kontur (outline) qo'shiladi - piksel-art ko'rinishi uchun
    function gridNew(w, h) {
        return Array.from({ length: h }, () => Array(w).fill(null));
    }
    function gridRect(grid, x, y, w, h, color) {
        for (let yy = y; yy < y + h; yy++) {
            for (let xx = x; xx < x + w; xx++) {
                if (grid[yy] && xx >= 0 && xx < grid[yy].length) grid[yy][xx] = color;
            }
        }
    }
    function gridOutline(grid, color) {
        const h = grid.length, w = grid[0].length;
        const out = gridNew(w + 2, h + 2);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y + 1][x + 1] = grid[y][x];
        const filled = (x, y) => y >= 0 && y < h + 2 && x >= 0 && x < w + 2 && out[y][x] !== null && out[y][x] !== color;
        for (let y = 0; y < h + 2; y++) {
            for (let x = 0; x < w + 2; x++) {
                if (out[y][x] === null && (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1))) out[y][x] = color;
            }
        }
        return out;
    }
    function gridToTexture(scene, key, grid, P) {
        const g = scene.add.graphics();
        grid.forEach((row, y) => row.forEach((c, x) => {
            if (c === null) return;
            g.fillStyle(c, 1);
            g.fillRect(x * P, y * P, P, P);
        }));
        g.generateTexture(key, grid[0].length * P, grid.length * P);
        g.destroy();
    }
    const BAYER4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
    // Soya pog'onalari: 0..1 qiymatni ranglar ro'yxatiga, Bayer "dither" bilan (piksel-art uslubi)
    const shade = (v, x, y, palette) => {
        const d = v + (BAYER4[y % 4][x % 4] / 16 - 0.5) * 0.28;
        return palette[Math.max(0, Math.min(palette.length - 1, Math.floor(d * palette.length)))];
    };

    // ELF: rasmi to'rtburchaklardan (katak birliklarida) yig'iladi; throw - qo'li ko'tarilgan
    // style: boshqa elflar uchun ranglar (qalpoq, kiyim, fartuk) - standart: yashil elf
    function elfGrid(throwing, headOnly, style = {}) {
        const g = gridNew(18, headOnly ? 13 : 26);
        const skin = 0x81d4fa, skinD = 0x4fa3d1;
        const green = style.tunic || 0x43a047, greenD = style.tunicD || 0x2e7d32;
        const hatD = style.hatD || 0x2e7d32, hatL = style.hat || 0x388e3c;
        gridRect(g, 9, 0, 2, 1, style.pompom || 0xffeb3b);
        gridRect(g, 8, 1, 3, 1, hatD); gridRect(g, 7, 2, 5, 1, hatD); gridRect(g, 6, 3, 7, 1, hatD); gridRect(g, 5, 4, 8, 1, hatD);
        gridRect(g, 7, 2, 3, 1, hatL); gridRect(g, 6, 3, 4, 1, hatL); gridRect(g, 5, 4, 5, 1, hatL);
        gridRect(g, 4, 5, 10, 2, 0xffe082); gridRect(g, 4, 6, 2, 1, 0xffca28);
        gridRect(g, 5, 6, 8, 6, skin); gridRect(g, 12, 7, 1, 5, skinD);
        gridRect(g, 2, 7, 3, 1, skin); gridRect(g, 3, 8, 2, 1, skin);
        gridRect(g, 13, 7, 3, 1, skin); gridRect(g, 13, 8, 2, 1, skinD);
        gridRect(g, 7, 8, 1, 2, 0x0d1b3e); gridRect(g, 10, 8, 1, 2, 0x0d1b3e);
        gridRect(g, 8, 10, 2, 1, 0xe57373);
        if (!headOnly) {
            gridRect(g, 8, 12, 2, 1, skinD);
            gridRect(g, 5, 13, 8, 6, green); gridRect(g, 11, 13, 2, 6, greenD); gridRect(g, 7, 13, 4, 1, style.collar || 0x66bb6a);
            if (style.apron) { gridRect(g, 6, 14, 5, 7, style.apron); gridRect(g, 6, 14, 5, 1, style.apronD || style.apron); }
            gridRect(g, 5, 17, 8, 1, 0x6d4c41); gridRect(g, 8, 17, 2, 1, 0xffca28);
            gridRect(g, 4, 19, 10, 2, green); gridRect(g, 11, 19, 3, 2, greenD);
            gridRect(g, 3, 13, 2, 5, green); gridRect(g, 3, 18, 2, 1, skin);
            if (throwing) {
                gridRect(g, 13, 11, 2, 2, greenD); gridRect(g, 14, 9, 2, 2, greenD); gridRect(g, 15, 7, 2, 2, greenD);
                gridRect(g, 16, 6, 2, 1, skin);
            } else {
                gridRect(g, 13, 13, 2, 5, greenD); gridRect(g, 13, 18, 2, 1, skin);
            }
            if (style.stride) {
                // Qadam tashlagan kadr: bir oyoq oldinda, biri orqada
                gridRect(g, 5, 21, 2, 3, 0x5d4037); gridRect(g, 11, 21, 2, 3, 0x5d4037);
                gridRect(g, 4, 24, 3, 2, 0x3e2723); gridRect(g, 11, 24, 3, 2, 0x3e2723);
            } else {
                gridRect(g, 6, 21, 2, 3, 0x5d4037); gridRect(g, 10, 21, 2, 3, 0x5d4037);
                gridRect(g, 5, 24, 3, 2, 0x3e2723); gridRect(g, 10, 24, 3, 2, 0x3e2723);
            }
        }
        return gridOutline(g, 0x0b1d33);
    }

    // BAHAYBAT DARAXT: tojni bir necha "barg to'dasi" (doira) tashkil qiladi, har
    // biri chapdan-yuqoridan yoritilgan va 4 pog'onali soya + dither bilan bo'yalgan;
    // tanada po'stloq chiziqlari, pastda ildizlar; tojda mega olmalar
    function treeGrid() {
        const W = 72, H = 105;
        const g = gridNew(W, H);
        const bark = [0x3b2416, 0x4a2f1f, 0x6b4630, 0x8f6443];
        for (let y = 40; y < H; y++) {
            const flare = y > H - 12 ? Math.floor((y - (H - 12)) * 0.9) : 0;
            const x0 = 30 - flare, x1 = 42 + flare;
            for (let x = x0; x < x1; x++) {
                const t = (x - x0) / (x1 - x0);
                let c = shade(0.95 - t, x, y, bark);
                if ((x * 7 + Math.floor(y / 2) * 3) % 13 === 0) c = bark[0];
                g[y][x] = c;
            }
        }
        for (let i = 0; i < 14; i++) {
            gridRect(g, 34 - i, 44 - i, 3, 2, bark[i % 2 ? 1 : 2]);
            gridRect(g, 37 + i, 45 - i, 3, 2, bark[i % 2 ? 1 : 2]);
        }
        const leaf = [0x1d4a27, 0x2a6e34, 0x3f9a45, 0x6fbf5e, 0x9bd97c];
        const blobs = [[12, 42, 11], [60, 42, 11], [22, 34, 15], [50, 34, 15], [36, 40, 17], [36, 24, 20], [26, 16, 12], [47, 17, 12]];
        blobs.forEach(([cx, cy, r]) => {
            for (let y = cy - r; y <= cy + r; y++) {
                for (let x = cx - r; x <= cx + r; x++) {
                    if (y < 0 || y >= H || x < 0 || x >= W) continue;
                    const jag = ((x * 31 + y * 17) % 5 === 0) ? 1 : 0;
                    if (Math.hypot(x - cx, y - cy) > r - jag) continue;
                    const nx = (x - cx) / r, ny = (y - cy) / r;
                    const v = 0.62 - 0.42 * (nx * 0.55 + ny * 0.85) - 0.18 * (nx * nx + ny * ny);
                    g[y][x] = shade(v, x, y, leaf);
                }
            }
        });
        [[18, 36], [30, 28], [44, 22], [54, 38], [40, 44], [24, 46], [50, 28], [12, 44], [62, 44], [34, 14], [58, 34], [20, 24]]
            .forEach(([x, y]) => {
                gridRect(g, x, y, 2, 2, 0xc62828);
                g[y][x] = 0xff8a80;
                g[y - 1] && (g[y - 1][x + 1] = 0x5d4037);
            });
        return gridOutline(g, 0x0f2412);
    }

    // UCHAR TOSH: tepasi o'tli (o'tlar chiqib turadi), pasti tishli-tishli tosh,
    // chetlaridan chirmovuq osilib turadi
    function rockGrid(wc) {
        const hc = Math.round(wc * 0.85);
        const g = gridNew(wc, hc);
        const stone = [0x3e3a4d, 0x5a5570, 0x7a7593, 0x9e99b8];
        const grass = [0x2e7d32, 0x4caf50, 0x81c784];
        for (let y = 3; y < hc; y++) {
            const f = (y - 3) / Math.max(1, hc - 4);
            const half = (wc / 2 - 1) * (1 - Math.pow(f, 1.4)) + (((y * 7) % 3) - 1) * 0.6;
            const x0 = Math.round(wc / 2 - half), x1 = Math.round(wc / 2 + half);
            for (let x = x0; x < x1; x++) {
                const t = (x - x0) / Math.max(1, x1 - x0);
                g[y][x] = shade(0.9 - t * 0.7 - f * 0.25, x, y, stone);
            }
        }
        for (let x = 1; x < wc - 1; x++) {
            g[2][x] = grass[1]; g[3][x] = grass[0];
            if (x % 3 === 1) g[1][x] = grass[2];
            if (x % 5 === 2) g[0][x] = grass[1];
        }
        [2, wc - 3].forEach((vx, i) => {
            for (let y = 4; y < 4 + 3 + i * 2; y++) if (g[y]) g[y][vx] = y % 2 ? grass[0] : grass[1];
        });
        return gridOutline(g, 0x23202e);
    }

    function tileGrid(kind) {
        if (kind === 'grass') {
            const g = gridNew(16, 15);
            for (let x = 0; x < 16; x++) {
                g[0][x] = x % 4 === 1 ? 0x9ccc65 : null;
                g[1][x] = x % 3 === 0 ? 0x8bc34a : 0x7cb342;
                g[2][x] = 0x558b2f; g[3][x] = x % 2 ? 0x33691e : 0x3e6b1f;
                for (let y = 4; y < 15; y++) g[y][x] = shade(0.7 - y / 20, x, y, [0x3e2723, 0x5d4037, 0x6d4c41, 0x795548]);
            }
            g[8][3] = 0x9e9e9e; g[11][10] = 0x9e9e9e; g[6][13] = 0x8d8d8d;
            return g;
        }
        if (kind === 'ledge') {
            const g = gridNew(16, 10);
            for (let x = 0; x < 16; x++) {
                g[0][x] = 0x8bc34a; g[1][x] = 0x558b2f;
                for (let y = 2; y < 10; y++) {
                    const mortar = y === 5 || (y < 5 ? x % 8 === 0 : (x + 4) % 8 === 0);
                    g[y][x] = mortar ? 0x3a3646 : shade(0.8 - y / 14, x, y, [0x4e4a5e, 0x6d6880, 0x8e89a3]);
                }
            }
            return g;
        }
        // brick: katta devor g'ishtlari
        const g = gridNew(16, 16);
        for (let y = 0; y < 16; y++) {
            for (let x = 0; x < 16; x++) {
                const row = Math.floor(y / 4);
                const mortar = y % 4 === 3 || ((x + (row % 2) * 4) % 8 === 7);
                if (mortar) { g[y][x] = 0x2e2b38; continue; }
                const bx = (x + (row % 2) * 4) % 8, by = y % 4;
                g[y][x] = bx === 0 || by === 0 ? 0x8a869c : shade(0.55 - bx / 20, x, y, [0x55516a, 0x6a6682, 0x7a7593]);
            }
        }
        return g;
    }

    // KATTA ESHIK: tosh ravoq, yog'och taxtalar, temir chambaraklar, oltin qulf.
    // Ochiq holatda - qorong'i yo'lak ichida sirli ko'k nur
    function doorGrid(open) {
        const DW = 20, DH = 34;
        const g = gridNew(DW, DH);
        gridRect(g, 0, 0, DW, DH, 0x4a4658);
        gridRect(g, 2, 3, DW - 4, DH - 3, 0x2e2b38);
        gridRect(g, 4, 1, DW - 8, 2, 0x4a4658);
        gridRect(g, 5, 0, DW - 10, 1, 0x5f5b70);
        if (open) {
            for (let y = 4; y < DH; y++) for (let x = 3; x < DW - 3; x++) g[y][x] = shade(0.2 + (y / DH) * 0.55, x, y, [0x0c0c14, 0x141633, 0x1f2a6b, 0x3949ab]);
            gridRect(g, 3, 4, 2, DH - 4, 0x6d4326);
        } else {
            for (let y = 4; y < DH; y++) {
                for (let x = 3; x < DW - 3; x++) {
                    g[y][x] = (x - 3) % 3 === 2 ? 0x5a3620 : shade(0.75 - (x - 3) / 18, x, y, [0x6d4326, 0x8d5a34, 0xa06a3e]);
                }
            }
            gridRect(g, 3, 10, DW - 6, 2, 0x37474f); gridRect(g, 3, 25, DW - 6, 2, 0x37474f);
            for (let x = 4; x < DW - 3; x += 3) { g[10][x] = 0x90a4ae; g[25][x] = 0x90a4ae; }
            gridRect(g, 12, 16, 4, 5, 0xffca28); gridRect(g, 13, 17, 2, 2, 0x000000); gridRect(g, 13, 19, 1, 1, 0x000000);
        }
        return gridOutline(g, 0x15131c);
    }

    function keyGrid() {
        const g = gridNew(10, 5);
        gridRect(g, 0, 0, 4, 5, 0xffca28); gridRect(g, 1, 1, 2, 3, null);
        gridRect(g, 4, 2, 6, 1, 0xffca28); gridRect(g, 7, 3, 1, 2, 0xffca28); gridRect(g, 9, 3, 1, 2, 0xffca28);
        gridRect(g, 0, 4, 4, 1, 0xc79100);
        return gridOutline(g, 0x3e2723);
    }

    function buildPixelTextures(scene) {
        const make = (key, grid, P) => { if (!scene.textures.exists(key)) gridToTexture(scene, key, grid, P); };
        make('px_tree', treeGrid(), 4);
        make('px_elf_idle', elfGrid(false, false), 3);
        make('px_elf_throw', elfGrid(true, false), 3);
        make('px_elf_face', elfGrid(false, true), 6);
        make('px_rock_big', rockGrid(22), 4);
        make('px_rock_mid', rockGrid(18), 4);
        make('px_rock_small', rockGrid(12), 4);
        make('px_rock_tiny', rockGrid(9), 4);
        make('px_grass', tileGrid('grass'), 2);
        make('px_ledge', tileGrid('ledge'), 2);
        make('px_brick', tileGrid('brick'), 2);
        make('px_door_closed', doorGrid(false), 4);
        make('px_door_open', doorGrid(true), 4);
        make('px_key', keyGrid(), 3);
    }

    // PIKSEL ORQA FON: pog'onali osmon (silliq emas), piksel bulutlar, uzoqdagi tog'lar
    // opts.sky - osmon pog'onalari ranglari, opts.cloud/cloudShade - bulut, opts.mountains === false - tog'siz
    function drawPixelBackdrop(scene, opts = {}) {
        const g = scene.add.graphics().setDepth(-4);
        (opts.sky || [0x4fb4f0, 0x62bff3, 0x78c9f5, 0x8fd3f7, 0xa7ddf9, 0xc0e8fb]).forEach((c, i) => {
            g.fillStyle(c, 1);
            g.fillRect(0, i * 95, opts.width || 800, 95);
        });
        const cloud = (cx, cy) => {
            g.fillStyle(opts.cloud || 0xffffff, 1);
            [[0, 2, 14, 3], [2, 0, 6, 2], [7, 1, 5, 1], [-2, 3, 18, 2]].forEach(([x, y, w, h]) => g.fillRect(cx + x * 6, cy + y * 6, w * 6, h * 6));
            g.fillStyle(opts.cloudShade || 0xd6ecfa, 1);
            g.fillRect(cx - 12, cy + 30, 108, 6);
        };
        if (opts.clouds !== false) { cloud(40, 40); cloud(520, 30); cloud(300, 330); }
        if (opts.mountains === false) return;
        const mountains = scene.add.graphics().setDepth(-3);
        [[0x9cc2dc, 400, 0.011, 70], [0x7fb0cf, 460, 0.017, 50]].forEach(([c, base, fr, amp]) => {
            mountains.fillStyle(c, 1);
            for (let x = 0; x < 800; x += 8) {
                const top = base - Math.round((Math.abs(Math.sin(x * fr)) * amp + Math.abs(Math.sin(x * fr * 2.3)) * amp * 0.4) / 8) * 8;
                mountains.fillRect(x, top, 8, 570 - top);
            }
        });
    }

    // ===== DIALOG (Undertale uslubida): pastda qora oyna, oq ramka, chapda gapirayotgan
    // kishining portreti, tepada ismi, matn harfma-harf yoziladi. E - matnni tugatish /
    // keyingi gap. Qator oddiy matn (elf gapiradi) yoki { who, text, fx } bo'lishi mumkin:
    //   who: 'elf' | 'player' | 'narrator';  fx: 'shake' | 'scream'
    // opts.remote bo'lsa (umumiy sahna) - E serverdan keyingi qatorni so'raydi
    function startDialog(scene, lines, onDone, opts = {}) {
        closeDialog();
        const box = scene.add.graphics().setScrollFactor(0).setDepth(2000);
        box.fillStyle(0x000000, 1); box.fillRect(30, 420, 740, 160);
        box.lineStyle(4, 0xffffff, 1); box.strokeRect(32, 422, 736, 156);
        const portrait = scene.add.image(100, 500, opts.elfFace || 'px_elf_face').setScrollFactor(0).setDepth(2001);
        const name = scene.add.text(180, 438, '', {
            fontFamily: PIXEL_FONT, fontSize: '10px', color: '#ffeb3b'
        }).setScrollFactor(0).setDepth(2001);
        const txt = scene.add.text(180, 458, '', {
            fontFamily: '"Courier New", monospace', fontSize: '21px', fontStyle: 'bold', color: '#ffffff',
            wordWrap: { width: 560 }, lineSpacing: 6
        }).setScrollFactor(0).setDepth(2001);
        const hint = scene.add.text(752, 566, '[E]', {
            fontFamily: '"Courier New", monospace', fontSize: '16px', fontStyle: 'bold', color: '#ffff00'
        }).setOrigin(1, 1).setScrollFactor(0).setDepth(2001).setVisible(false);
        scene.tweens.add({ targets: hint, alpha: 0.2, duration: 400, yoyo: true, repeat: -1 });
        const norm = lines.map(l => (typeof l === 'string' ? { who: 'elf', text: l } : l));
        dialog = { scene, lines: norm, idx: opts.startAt || 0, chars: 0, txt, name, hint, portrait,
            objs: [box, portrait, name, txt, hint], onDone, timer: null, opts };
        showDialogLine();
    }
    function showDialogLine() {
        const d = dialog;
        const line = d.lines[d.idx];
        const text = line.text;
        // Portret va ism - kim gapirayotganiga qarab
        if (line.who === 'player') {
            if (currentCharacter) d.portrait.setTexture(currentCharacter.texture.key).setScale(2).setVisible(true);
            else d.portrait.setVisible(false);
            d.name.setText((currentCharacter && currentCharacter.nickname) || '');
        } else if (line.who === 'narrator') {
            d.portrait.setVisible(false);
            d.name.setText('');
        } else {
            d.portrait.setTexture(d.opts.elfFace || 'px_elf_face').setScale(1).setVisible(true);
            d.name.setText(d.opts.elfName || '');
        }
        d.txt.setColor(line.who === 'narrator' ? '#b0b0b0' : '#ffffff');
        if (line.fx) dialogFx(d.scene, line.fx);
        d.chars = 0;
        d.txt.setText('');
        d.hint.setVisible(false);
        if (d.timer) d.timer.remove();
        d.timer = d.scene.time.addEvent({
            delay: 28, repeat: text.length - 1, callback: () => {
                d.chars++;
                d.txt.setText(text.slice(0, d.chars));
                const ch = text[d.chars - 1];
                if (window.GameAudio && d.chars % 2 === 1 && ch && ch.trim()) {
                    GameAudio.blip(line.who === 'player' ? 'player' : line.who === 'narrator' ? 'narrator' : (d.opts.voice || 'elf'));
                }
                if (d.chars >= text.length) d.hint.setVisible(true);
            }
        });
    }
    function advanceDialog() {
        const d = dialog;
        if (!d) return;
        const text = d.lines[d.idx].text;
        if (d.chars < text.length) {
            d.timer.remove();
            d.chars = text.length;
            d.txt.setText(text);
            d.hint.setVisible(true);
            return;
        }
        if (d.opts.remote) { d.opts.remote(); return; } // umumiy sahna - qatorni server o'tkazadi
        d.idx++;
        if (d.idx >= d.lines.length) {
            const cb = d.onDone;
            closeDialog();
            if (cb) cb();
            return;
        }
        showDialogLine();
    }
    // Server aytgan qatorga o'tish (umumiy sahna)
    function gotoDialogLine(i) {
        if (!dialog || i === dialog.idx || i >= dialog.lines.length) return;
        dialog.idx = i;
        showDialogLine();
    }
    function closeDialog() {
        if (!dialog) return;
        if (dialog.timer) dialog.timer.remove();
        dialog.scene.tweens.killTweensOf(dialog.hint);
        dialog.objs.forEach(o => o.destroy());
        dialog = null;
    }

    // SAHNA EFFEKTLARI: 'shake' - yer silkinadi, tepadan chang/tosh to'kiladi;
    // 'scream' - qattiq silkinish, ekran qizarib chaqnaydi, sotuvchi titraydi
    function dialogFx(scene, fx) {
        const cam = scene.cameras.main;
        if (fx === 'shake') {
            cam.shake(2200, 0.012);
            for (let k = 0; k < 40; k++) {
                const dust = scene.add.rectangle(Phaser.Math.Between(0, 800), Phaser.Math.Between(-60, 0), 4, 4,
                    k % 3 ? 0x8d8d8d : 0x5d5566).setScrollFactor(0).setDepth(1500);
                scene.tweens.add({ targets: dust, y: Phaser.Math.Between(300, 560), alpha: 0,
                    delay: Phaser.Math.Between(0, 1500), duration: Phaser.Math.Between(700, 1200), onComplete: () => dust.destroy() });
            }
        } else if (fx === 'scream') {
            cam.shake(1200, 0.03);
            const flash = scene.add.rectangle(400, 300, 800, 600, 0xd50000, 0.55).setScrollFactor(0).setDepth(1500);
            scene.tweens.add({ targets: flash, alpha: 0, duration: 900, onComplete: () => flash.destroy() });
            if (sellerSprite) {
                const x0 = sellerSprite.x;
                scene.tweens.add({ targets: sellerSprite, x: x0 + 3, duration: 40, yoyo: true, repeat: 14,
                    onComplete: () => { if (sellerSprite) sellerSprite.x = x0; } });
            }
        }
    }

    // ===== ELFLAR BOZORI (piksel) =====
    const SELLER_STYLE = { hat: 0x1e88e5, hatD: 0x1565c0, tunic: 0x546e7a, tunicD: 0x37474f, collar: 0x90a4ae,
        apron: 0xeceff1, apronD: 0xb0bec5, pompom: 0xffffff };
    const FRUIT_ELF_STYLE = { hat: 0xe53935, hatD: 0xb71c1c, tunic: 0xff8f00, tunicD: 0xe65100, collar: 0xffb74d, pompom: 0xffffff };
    const CLOTH_ELF_STYLE = { hat: 0x8e24aa, hatD: 0x6a1b9a, tunic: 0x5e35b1, tunicD: 0x4527a0, collar: 0x9575cd };

    // Rasta orqa qismi: yo'l-yo'l soyabon (pastki cheti to'lqinsimon), ustunlar,
    // ichkari soya; baliq rastasida soyabon ostida osilgan baliqlar
    function stallBackGrid(awnA, awnB, goods) {
        const W = 28, H = 32;
        const g = gridNew(W, H);
        for (let y = 0; y < 6; y++) for (let x = 0; x < W; x++) g[y][x] = Math.floor(x / 4) % 2 ? awnA : awnB;
        for (let x = 0; x < W; x++) if (x % 4 === 1 || x % 4 === 2) g[6][x] = Math.floor(x / 4) % 2 ? awnA : awnB;
        for (let x = 0; x < W; x++) g[0][x] = 0x3e2723;
        for (let y = 8; y < 25; y++) for (let x = 4; x < W - 4; x++) g[y][x] = shade(0.6 - y / 40, x, y, [0x1e1620, 0x2a1f2c, 0x352838]);
        for (let y = 7; y < H; y++) {
            g[y][2] = 0x8d6e63; g[y][3] = 0x6d4c41;
            g[y][W - 4] = 0x8d6e63; g[y][W - 3] = 0x6d4c41;
        }
        if (goods === 'fish') {
            [7, 13, 19].forEach((fx) => {
                g[7][fx] = 0xd7ccc8; g[8][fx] = 0xd7ccc8;
                gridRect(g, fx - 1, 9, 3, 4, 0x78909c); gridRect(g, fx - 1, 9, 1, 4, 0xb0bec5);
                g[10][fx + 1] = 0x000000;
                g[13][fx - 1] = 0x546e7a; g[13][fx + 1] = 0x546e7a;
            });
        }
        return gridOutline(g, 0x15101a);
    }

    // Rasta old qismi: yog'och peshtaxta va ustidagi mollar (baliq / meva / mato)
    function stallFrontGrid(goods) {
        const W = 28, H = 32;
        const g = gridNew(W, H);
        for (let x = 0; x < W; x++) {
            g[22][x] = 0xbcaaa4;
            for (let y = 23; y < H; y++) g[y][x] = (y - 23) % 3 === 2 ? 0x5d4037 : (x % 9 === 0 ? 0x6d4c41 : 0x8d6e63);
        }
        if (goods === 'fish') {
            [3, 10, 17].forEach((fx) => {
                gridRect(g, fx, 20, 5, 2, 0x78909c); gridRect(g, fx, 21, 5, 1, 0xcfd8dc);
                g[20][fx + 1] = 0x000000;
                g[19][fx + 5] = 0x546e7a; g[21][fx + 5] = 0x546e7a; g[20][fx + 5] = 0x607d8b;
            });
        } else if (goods === 'fruit') {
            const fr = [0xe53935, 0xffa726, 0xcddc39, 0xe53935, 0xffa726];
            for (let i = 0; i < 11; i++) gridRect(g, 2 + i * 2, 20, 2, 2, fr[i % fr.length]);
            for (let i = 0; i < 9; i++) gridRect(g, 3 + i * 2 + 1, 18, 2, 2, fr[(i + 2) % fr.length]);
        } else if (goods === 'cloth') {
            [[3, 0x8e24aa, 0xba68c8], [9, 0x00897b, 0x4db6ac], [15, 0xffb300, 0xffe082], [21, 0xc62828, 0xef5350]].forEach(([cx, c, cl]) => {
                gridRect(g, cx, 18, 5, 4, c); gridRect(g, cx, 18, 5, 1, cl); g[19][cx + 4] = 0x000000;
            });
        } else if (goods === 'bread') {
            // Non va batonlar
            [[2, 5], [9, 5], [16, 5]].forEach(([bx, bw]) => {
                gridRect(g, bx, 19, bw, 3, 0xa1662f); gridRect(g, bx + 1, 19, bw - 2, 1, 0xd7a86e);
                g[20][bx + 1] = 0x6d4c41; g[20][bx + 3] = 0x6d4c41;
            });
            gridRect(g, 22, 17, 2, 5, 0xc68642); gridRect(g, 24, 18, 2, 4, 0xc68642); g[17][22] = 0xe6b87a;
        } else if (goods === 'pots') {
            // Loy ko'zalar
            [[3, 0xb5651d], [9, 0x8d4e2a], [15, 0xc0703a], [21, 0x9c5a30]].forEach(([px, c]) => {
                gridRect(g, px, 17, 4, 1, 0x5d4037); gridRect(g, px + 1, 18, 2, 1, c);
                gridRect(g, px, 19, 4, 3, c); g[19][px] = 0xe0a070;
            });
        } else if (goods === 'potions') {
            // Rang-barang sehrli shishalar (probkali)
            [[3, 0xe040fb], [7, 0x00e5ff], [11, 0x76ff03], [15, 0xff1744], [19, 0xffea00], [23, 0x2979ff]].forEach(([px, c]) => {
                g[17][px] = 0x8d6e63; g[18][px] = 0xcfd8dc;
                gridRect(g, px - 1, 19, 3, 3, c); g[19][px - 1] = 0xffffff;
            });
        } else if (goods === 'berries') {
            // Rezavorlar uyumlari
            const bc = [0x6a1b9a, 0xd81b60, 0x283593, 0xc62828];
            for (let i = 0; i < 24; i++) gridRect(g, 2 + i, 21 - (i % 3 === 1 ? 1 : 0), 1, 1 + (i % 3 === 1 ? 1 : 0), bc[i % bc.length]);
            for (let i = 0; i < 12; i++) g[19][3 + i * 2] = bc[(i + 1) % bc.length];
        }
        return gridOutline(g, 0x15101a);
    }

    function cobbleGrid() {
        const g = gridNew(16, 15);
        for (let y = 0; y < 15; y++) {
            for (let x = 0; x < 16; x++) {
                const row = Math.floor(y / 4);
                const mortar = y % 4 === 3 || ((x + (row % 2) * 3) % 6 === 5);
                g[y][x] = mortar ? 0x3a3444 : shade(0.75 - (y % 4) / 6, x, y, [0x6d6578, 0x7f778a, 0x938ba0]);
            }
        }
        for (let x = 0; x < 16; x++) g[0][x] = 0x9e97a8;
        return g;
    }

    // Rasta turlari: soyabon ranglari va sotuvchi elfning kiyimi
    const STALL_KINDS = {
        fruit: { a: 0xe53935, b: 0xfafafa, style: FRUIT_ELF_STYLE },
        bread: { a: 0xff8f00, b: 0xfff3e0, style: { hat: 0xfafafa, hatD: 0xbdbdbd, tunic: 0x8d6e63, tunicD: 0x6d4c41, collar: 0xd7ccc8, apron: 0xfafafa, apronD: 0xe0e0e0, pompom: 0xffffff } },
        cloth: { a: 0x7e57c2, b: 0xfff59d, style: CLOTH_ELF_STYLE },
        pots: { a: 0x43a047, b: 0xf1f8e9, style: { hat: 0x6d4c41, hatD: 0x4e342e, tunic: 0x827717, tunicD: 0x5f5a10, collar: 0xc0ca33 } },
        potions: { a: 0x00897b, b: 0xe0f2f1, style: { hat: 0x283593, hatD: 0x1a237e, tunic: 0x3949ab, tunicD: 0x283593, collar: 0x7986cb } },
        berries: { a: 0xd81b60, b: 0xfce4ec, style: { hat: 0xad1457, hatD: 0x880e4f, tunic: 0x2e7d32, tunicD: 0x1b5e20, collar: 0xf48fb1 } },
        fish: { a: 0x1e88e5, b: 0xfafafa, style: SELLER_STYLE }
    };
    // Bozordagi olomon - har xil kiyimli elflar
    const CROWD_STYLES = [
        { hat: 0x00897b, hatD: 0x00695c, tunic: 0xef6c00, tunicD: 0xbf360c, collar: 0xffb74d },
        { hat: 0xc62828, hatD: 0x8e0000, tunic: 0x1565c0, tunicD: 0x0d47a1, collar: 0x64b5f6 },
        { hat: 0x6a1b9a, hatD: 0x4a148c, tunic: 0x558b2f, tunicD: 0x33691e, collar: 0xaed581 },
        { hat: 0xf9a825, hatD: 0xf57f17, tunic: 0x6d4c41, tunicD: 0x4e342e, collar: 0xbcaaa4 },
        { hat: 0x37474f, hatD: 0x263238, tunic: 0xad1457, tunicD: 0x880e4f, collar: 0xf48fb1 },
        { hat: 0x2e7d32, hatD: 0x1b5e20, tunic: 0x5e35b1, tunicD: 0x4527a0, collar: 0x9575cd, apron: 0xd7ccc8, apronD: 0xbcaaa4 }
    ];

    function buildMarketTextures(scene) {
        const make = (key, grid, P) => { if (!scene.textures.exists(key)) gridToTexture(scene, key, grid, P); };
        Object.entries(STALL_KINDS).forEach(([kind, K]) => {
            make('px_stall_back_' + kind, stallBackGrid(K.a, K.b, kind), 4);
            make('px_stall_front_' + kind, stallFrontGrid(kind), 4);
            make('px_elf_' + kind, elfGrid(false, false, K.style), 3);
        });
        CROWD_STYLES.forEach((st, i) => {
            make('px_npc_' + i + '_a', elfGrid(false, false, st), 3);
            make('px_npc_' + i + '_b', elfGrid(false, false, Object.assign({ stride: true }, st)), 3);
        });
        make('px_cobble', cobbleGrid(), 2);
        make('px_seller_face', elfGrid(false, true, SELLER_STYLE), 6);
        // Taxta: ikki qator yog'och, mixlar
        const plank = gridNew(16, 6);
        for (let x = 0; x < 16; x++) {
            plank[0][x] = 0xc49a6c; plank[1][x] = 0xa1774a; plank[2][x] = x % 8 === 7 ? 0x5d4037 : 0x8d6341;
            plank[3][x] = 0xa1774a; plank[4][x] = x % 8 === 3 ? 0x5d4037 : 0x8d6341; plank[5][x] = 0x4e342e;
        }
        plank[1][2] = 0x37474f; plank[1][13] = 0x37474f; plank[4][6] = 0x37474f;
        make('px_plank', plank, 2);
    }

    // QAL'A DEVORI (orqa fon): tishli (merlonli) tosh devor, oraliqlarda tomli
    // minoralar, minoralarda bayroqlar va shinak-derazalar
    // Takrorlanuvchi fon bo'lagi (1680px): minglab to'rtburchakni HAR KADRDA chizish o'rniga bir
    // marta teksturaga "pishirib", butun xarita kengligida tileSprite bilan takrorlaymiz
    const BG_TILE_W = 1680;
    function bakeTile(scene, key, h, oy, draw) {
        if (!scene.textures.exists(key)) {
            const g = scene.make.graphics({ x: 0, y: 0, add: false });
            g.translateCanvas(0, -oy);
            draw(g, BG_TILE_W);
            g.generateTexture(key, BG_TILE_W, h);
            g.destroy();
        }
    }
    function drawCastleWall(scene, width) {
        bakeTile(scene, 'bg_castle', 570 - 140, 140, (g, W) => drawCastleWallInto(g, W));
        scene.add.tileSprite(0, 140, width, 570 - 140, 'bg_castle').setOrigin(0, 0).setDepth(-3);
    }
    function drawCastleWallInto(g, width) {
        const top = 360;
        for (let y = top; y < 570; y += 8) {
            for (let x = 0; x < width + 16; x += 16) {
                const off = ((y - top) / 8) % 2 ? 8 : 0;
                g.fillStyle(((x + off) / 16 + (y - top) / 8) % 3 === 0 ? 0x524b68 : 0x5b5470, 1);
                g.fillRect(x - off, y, 16, 8);
                g.fillStyle(0x3b3550, 1);
                g.fillRect(x - off, y + 7, 16, 1); g.fillRect(x - off + 15, y, 1, 8);
            }
        }
        g.fillStyle(0x6c6584, 1); g.fillRect(0, top, width, 4);
        for (let x = 0; x < width; x += 48) {
            g.fillStyle(0x5b5470, 1); g.fillRect(x, top - 24, 24, 24);
            g.fillStyle(0x6c6584, 1); g.fillRect(x, top - 24, 24, 4);
        }
        for (let tx = 200; tx < width; tx += 420) {
            const tTop = 250;
            g.fillStyle(0x4f4865, 1); g.fillRect(tx, tTop, 80, 570 - tTop);
            g.fillStyle(0x3b3550, 1);
            for (let wy = tTop + 30; wy < 540; wy += 50) g.fillRect(tx + 36, wy, 8, 20);
            g.fillStyle(0x8e2f3a, 1);
            for (let s = 0; s < 6; s++) g.fillRect(tx - 8 + s * 8, tTop - 8 - s * 10, 96 - s * 16, 10);
            // Bayroq
            g.fillStyle(0x3e2723, 1); g.fillRect(tx + 38, tTop - 104, 4, 40);
            g.fillStyle(tx % 840 === 200 ? 0x1e88e5 : 0xe53935, 1);
            g.fillRect(tx + 42, tTop - 104, 26, 16); g.fillRect(tx + 42, tTop - 88, 20, 4);
            g.fillStyle(0xffca28, 1); g.fillRect(tx + 52, tTop - 100, 6, 6);
        }
    }

    // Bir tomonlama platforma: pastdan (va yonlardan) o'tib ketiladi, faqat ustiga qo'niladi
    function makeOneWay(obj) {
        if (!obj.body) return;
        obj.body.checkCollision.down = false;
        obj.body.checkCollision.left = false;
        obj.body.checkCollision.right = false;
    }

    // BOZOR SAHNASI (map-4 va map-5 uchun umumiy). Map-5 juda uzun (yuzlab rasta) -
    // rastalar RASMI faqat kamera yaqinida yaratiladi (updateStalls), tomlari (qattiq) esa
    // hammasi boshidan: ustiga chiqish mumkin
    const STALL_ROOF_Y = 450; // serverdagi STALL_ROOF_Y bilan bir xil
    let stallSmashed = [];
    let roofs = [];
    function buildMarketScene(scene) {
        const W = mapWidth;
        buildPixelTextures(scene);
        buildMarketTextures(scene);
        drawPixelBackdrop(scene, {
            sky: [0x2d2250, 0x4a2c63, 0x7a3b6e, 0xb24f6a, 0xe0735c, 0xf6a05a],
            cloud: 0xf8bbd0, cloudShade: 0xf48fb1, mountains: false, width: W
        });
        drawCastleWall(scene, W);
        drawBunting(scene, W);
        scene.add.tileSprite(0, 570, W, 30, 'px_cobble').setOrigin(0, 0).setDepth(1);
        // Chapda - map-3 dagi katta devorning orqa tomoni, eshigi ochiq turadi
        marketWall = {
            tile: scene.add.tileSprite(0, 0, 96, 570, 'px_brick').setOrigin(0, 0).setDepth(1),
            door: scene.add.image(4, 570, 'px_door_open').setOrigin(0, 1).setDepth(2)
        };
        const stalls = map.market.stalls;
        stallObjs = stalls.map(() => null);
        stallSmashed = stalls.map(() => false);
        // Rasta tomlari - qattiq (bir tomonlama), ko'rinmas: rasmi soyabonning o'zi
        roofs = stalls.map((st) => {
            const r = scene.add.rectangle(st.x, STALL_ROOF_Y + 4, 112, 8, 0x000000, 0);
            platforms.add(r);
            makeOneWay(r);
            return r;
        });
        // Osma TAXTA platformalar: arqonlarda (bayroqcha ipiga) osilib turadi
        const ropes = scene.add.graphics().setDepth(0);
        ropes.fillStyle(0x5d4037, 1);
        (map.market.planks || []).forEach((pl) => {
            scene.add.tileSprite(pl.x, pl.y, pl.w, pl.h, 'px_plank').setOrigin(0, 0).setDepth(1);
            ropes.fillRect(pl.x + 6, 160, 2, pl.y - 160);
            ropes.fillRect(pl.x + pl.w - 8, 160, 2, pl.y - 160);
        });
        // OLOMON: bozor bo'ylab (map-4) / kamera yaqinida (map-5) yurgan elflar
        const n = isBoss ? 14 : 16;
        for (let i = 0; i < n; i++) spawnCrowdElf(scene, 150 + Math.random() * (Math.min(W, 1600) - 220), 'walk');
    }


    // ===== O'RMON (map-6): qal'a darvozasidan chiqib o'rmonga kiriladi, oldinda BAHAYBAT
    // DARAXT (shoxlari - platformalar), undan ROBOT ITLAR sakrab tushadi, tepadan QIZIL
    // QUTILAR tushadi (o'q tegsa portlaydi) =====
    const LEAF = [0x173d22, 0x225c2f, 0x2f7d3a, 0x4ea24a, 0x86c965];
    const BARK = [0x2b1a10, 0x3e2717, 0x5a3a22, 0x7b5332];

    // ROBOT IT (o'ngga qaragan): 0/1 - yugurish kadrlari, 'bite' - og'zi katta ochiq
    function dogGrid(frame) {
        const g = gridNew(18, 13);
        const d = 0x37474f, m = 0x607d8b, l = 0x90a4ae, hi = 0xcfd8dc, foot = 0x212121;
        // Dum - antenna, uchida qizil chiroq
        gridRect(g, 1, 1, 1, 3, d); gridRect(g, 2, 3, 1, 2, d); g[0][1] = 0xff1744;
        // Tana: tepasi yorug', pasti to'q; umurtqa bo'ylab tikanlar; ko'krakda qizil chiroq
        gridRect(g, 3, 4, 10, 5, m); gridRect(g, 3, 4, 10, 1, l); gridRect(g, 4, 4, 3, 1, hi); gridRect(g, 3, 8, 10, 1, d);
        [4, 6, 8, 10].forEach(x => { g[3][x] = d; });
        gridRect(g, 9, 6, 2, 1, 0xff5252);
        // Bosh, o'tkir quloq, yovuz qizil ko'z
        gridRect(g, 12, 1, 4, 6, m); gridRect(g, 12, 1, 4, 1, l);
        g[0][13] = d; g[0][14] = d;
        g[3][14] = 0xff1744; g[3][15] = 0xffcdd2;
        if (frame === 'bite') {
            gridRect(g, 16, 2, 2, 2, m);          // yuqori jag'
            gridRect(g, 16, 4, 2, 2, 0x5d0000);   // og'iz ichi
            gridRect(g, 16, 6, 2, 2, d);          // pastki jag'
            g[4][16] = 0xffffff; g[4][17] = 0xffffff; g[5][17] = 0xffffff;
        } else {
            gridRect(g, 16, 4, 2, 3, m); gridRect(g, 16, 6, 2, 1, d); g[6][17] = 0xffffff;
        }
        // Oyoqlar
        if (frame === 1) {
            [[4, 9], [3, 10], [2, 11], [6, 9], [6, 10], [7, 11], [10, 9], [10, 10], [11, 11], [12, 9], [13, 10], [14, 11]]
                .forEach(([x, y]) => { g[y][x] = d; });
            [[1, 12], [2, 12], [7, 12], [8, 12], [11, 12], [12, 12], [14, 12], [15, 12]].forEach(([x, y]) => { g[y][x] = foot; });
        } else {
            [4, 6, 10, 12].forEach(x => { gridRect(g, x, 9, 1, 3, d); gridRect(g, x, 12, 2, 1, foot); });
        }
        return gridOutline(g, 0x0d0d0d);
    }

    function buildForestTextures(scene) {
        const make = (key, grid, P) => { if (!scene.textures.exists(key)) gridToTexture(scene, key, grid, P); };
        make('px_dog_0', dogGrid(0), 4);
        make('px_dog_1', dogGrid(1), 4);
        make('px_dog_bite', dogGrid('bite'), 4);
        if (!scene.textures.exists('redbox_tex')) {
            // QIZIL QUTI: qora ramka, sariq-qora ogohlantirish chizig'i, oq "!"
            const g = scene.add.graphics();
            g.fillStyle(0x111111, 1); g.fillRect(0, 0, 32, 32);
            g.fillStyle(0xd32f2f, 1); g.fillRect(2, 2, 28, 28);
            g.fillStyle(0xff5252, 1); g.fillRect(2, 2, 28, 4);
            g.fillStyle(0x8e0000, 1); g.fillRect(2, 26, 28, 4);
            g.fillStyle(0xffd600, 1); g.fillRect(2, 12, 28, 8);
            g.fillStyle(0x111111, 1);
            for (let x = 2; x < 30; x += 8) g.fillRect(x, 12, 4, 8);
            g.fillStyle(0xffffff, 1); g.fillRect(14, 4, 4, 6); g.fillRect(14, 22, 4, 3);
            g.generateTexture('redbox_tex', 32, 32);
            g.destroy();
        }
    }

    // Piksel "doira" (6px pog'onali) - daraxt tojlari silueti uchun
    function pxCrown(g, cx, cy, r, P = 6) {
        for (let dy = -r; dy <= r; dy += P) {
            const hw = Math.round(Math.sqrt(Math.max(0, r * r - dy * dy)) / P) * P;
            if (hw > 0) g.fillRect(cx - hw, cy + dy, hw * 2, P);
        }
    }
    // Uzoqdagi o'rmon (och, tumanli) - 1680px bo'lak, chegarada uzilmaydi
    function forestFarInto(g, W) {
        g.fillStyle(0x5b9a82, 1);
        for (let i = 0; i < 28; i++) {
            const cx = i * 60 + ((i * 37) % 23), cy = 330 + ((i * 53) % 50), r = 48 + ((i * 29) % 30);
            [cx - W, cx, cx + W].forEach(x => pxCrown(g, x, cy, r));
        }
        g.fillRect(0, 360, W, 210);
    }
    // Yaqinroq o'rmon: to'q archa daraxtlari va tanalari
    function forestMidInto(g, W) {
        for (let i = 0; i < 14; i++) {
            const cx = i * 120 + ((i * 41) % 50), h = 170 + ((i * 67) % 90), baseY = 520;
            [cx - W, cx, cx + W].forEach((x) => {
                g.fillStyle(0x2b1d14, 1); g.fillRect(x - 6, baseY - 40, 12, 60);
                for (let k = 0; k < 5; k++) {
                    const w = 30 + k * 14, y = baseY - h + k * (h / 6);
                    g.fillStyle(k % 2 ? 0x24503a : 0x2c5a41, 1);
                    for (let r = 0; r < 5; r++) g.fillRect(x - w * (r + 1) / 5, y + r * 8, w * 2 * (r + 1) / 5, 8);
                }
            });
        }
        g.fillStyle(0x264d38, 1); g.fillRect(0, 515, W, 55);
    }

    // BAHAYBAT DARAXT: toj (barg to'dalari, chapdan-yuqoridan yoritilgan), yo'g'on tana va
    // ildizlar, har bir platforma - shox (tanaga qiya "tirsak" bilan ulangan), shox
    // uchlarida barg to'dalari. Bir marta teksturaga pishiriladi
    function bigTreeGrid(treeX, branches) {
        const P = 6, X0 = treeX - 460, CW = 154, CH = 96;
        const g = gridNew(CW, CH);
        const cell = (wx, wy, c) => {
            const cx = Math.floor((wx - X0) / P), cy = Math.floor(wy / P);
            if (cy >= 0 && cy < CH && cx >= 0 && cx < CW) g[cy][cx] = c;
        };
        const blob = (wx, wy, r) => {
            for (let y = wy - r; y <= wy + r; y += P) {
                for (let x = wx - r; x <= wx + r; x += P) {
                    const cx = Math.floor((x - X0) / P), cy = Math.floor(y / P);
                    const jag = ((cx * 31 + cy * 17) % 5 === 0) ? P : 0;
                    if (Math.hypot(x - wx, y - wy) > r - jag) continue;
                    const nx = (x - wx) / r, ny = (y - wy) / r;
                    const v = 0.62 - 0.42 * (nx * 0.55 + ny * 0.85) - 0.18 * (nx * nx + ny * ny);
                    cell(x, y, shade(v, Math.abs(cx), Math.abs(cy), LEAF));
                }
            }
        };
        // Toj (pastki qirrasi ~230 - eng yuqori shoxlardan tepada)
        [[treeX - 330, 184, 46], [treeX + 330, 184, 46], [treeX - 210, 144, 86], [treeX + 210, 144, 86],
         [treeX - 100, 70, 90], [treeX + 110, 76, 90], [treeX, 104, 124]].forEach(([x, y, r]) => blob(x, y, r));
        // Tana va ildizlar
        for (let y = 200; y < 570; y += P) {
            const flare = y > 500 ? (y - 500) * 0.6 : 0;
            const x0 = treeX - 54 - flare, x1 = treeX + 54 + flare;
            for (let x = x0; x < x1; x += P) {
                const cx = Math.floor((x - X0) / P), cy = Math.floor(y / P);
                const t = (x - x0) / (x1 - x0);
                let c = shade(0.95 - t, cx, cy, BARK);
                if ((cx * 7 + Math.floor(cy / 2) * 3) % 11 === 0) c = BARK[0];
                cell(x, y, c);
            }
        }
        // Shoxlar
        const limb = (ax, ay, bx, by, thick) => {
            const n = Math.ceil(Math.hypot(bx - ax, by - ay) / 3);
            for (let i = 0; i <= n; i++) {
                const x = ax + (bx - ax) * i / n, y = ay + (by - ay) * i / n;
                for (let k = 0; k < thick; k += P) cell(x, y + k, k === 0 ? BARK[3] : k < thick - P ? BARK[2] : BARK[1]);
            }
        };
        branches.forEach((b) => {
            for (let x = b.x; x < b.x + b.w; x += P) {
                cell(x, b.y, BARK[3]); cell(x, b.y + P, BARK[2]); cell(x, b.y + 2 * P, BARK[1]);
            }
            const left = b.x + b.w < treeX;
            const right = b.x > treeX;
            const inner = left ? b.x + b.w : b.x;
            const edge = left ? treeX - 54 : treeX + 54;
            if ((left && inner < edge - 3) || (right && inner > edge + 3)) limb(edge, b.y + 70, inner, b.y + 4, 18);
            // Shox uchida barg to'dasi
            if (left || right) blob(left ? b.x - 6 : b.x + b.w + 6, b.y + 4, 22);
        });
        return gridOutline(g, 0x0b1a0e);
    }


    // G'OR (o'rmon oxiri): tik ko'tarilgan toshli tepalik (tepasida mox), pastida qorong'i
    // og'iz, og'iz tepasida tosh "tishlar". Tepalik qahramonlar ORTIDA (ular uning oldidan
    // yuradi, orqasiga "o'tib" ketmaydi); og'iz ichida ko'rinmas devor bor, kirgan qahramon
    // og'iz soyasida (qahramon OLDIDAGI yarim shaffof qatlam) xiralashadi
    const ROCK = [0x2a2830, 0x3f3d48, 0x57545f, 0x716d7a, 0x8f8a98];
    function caveGrid(caveX, X0, W) {
        const P = 6, CW = Math.ceil(W / P), CH = 62, Y0 = 200;
        const g = gridNew(CW, CH);
        const mcx = caveX + 50, mcy = 570, mrx = 78, mry = 128;
        const inMouth = (wx, wy) => ((wx - mcx) / mrx) ** 2 + ((wy - mcy) / mry) ** 2 < 1;
        for (let cx = 0; cx < CW; cx++) {
            const wx = X0 + cx * P, t = (wx - X0) / W;
            const top = 570 - (50 + 310 * Math.min(1, t * 2.4)) + Math.round(10 * Math.sin(cx * 0.7) + 7 * Math.sin(cx * 1.9));
            for (let cy = 0; cy < CH; cy++) {
                const wy = Y0 + cy * P;
                if (wy < top || wy >= 570) continue;
                if (inMouth(wx + P / 2, wy + P / 2)) continue;
                const depth = (wy - top) / 360;
                let c = shade(0.78 - depth - 0.2 * Math.abs(Math.sin(cx * 0.31)), cx, cy, ROCK);
                if ((cx * 13 + cy * 7) % 23 === 0) c = ROCK[0];                    // yoriqlar
                if (wy - top < P * 2) c = (wy - top < P) ? LEAF[3] : LEAF[2];      // mox
                // og'iz atrofi - to'qroq halqa
                if (inMouth(wx + P / 2 - P, wy + P / 2) || inMouth(wx + P / 2 + P, wy + P / 2) || inMouth(wx + P / 2, wy + P / 2 + P)) c = ROCK[0];
                g[cy][cx] = c;
            }
        }
        // Og'iz tepasidagi tosh tishlar (stalaktitlar)
        for (let k = -3; k <= 3; k++) {
            const wx = mcx + k * 20, topY = mcy - mry * Math.sqrt(Math.max(0, 1 - ((wx - mcx) / mrx) ** 2));
            const len = 2 + (k & 1);
            for (let i = 0; i < len; i++) {
                const cx = Math.floor((wx - X0) / P), cy = Math.floor((topY - Y0) / P) + i;
                if (cy >= 0 && cy < CH && cx >= 0 && cx < CW) g[cy][cx] = i === len - 1 ? ROCK[2] : ROCK[1];
            }
        }
        return gridOutline(g, 0x0d0d10);
    }
    // Faqat yuqori yarmi (yer sathidan tepasi) - g'or og'zi yer ostiga tushmaydi
    function pxEllipse(g, cx, cy, rx, ry, P = 6) {
        for (let dy = -ry; dy < 0; dy += P) {
            const hw = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy / ry) ** 2)) / P) * P;
            if (hw > 0) g.fillRect(cx - hw, cy + dy, hw * 2, P);
        }
    }
    function buildCave(scene) {
        const f = map.forest, X0 = f.caveX - 120, W = mapWidth - X0 + 6;
        const mcx = f.caveX + 50;
        // Og'iz ichi (qahramon ortida): qop-qora, ichkarisi ko'kimtir zulmat
        const back = scene.add.graphics().setDepth(-0.8);
        back.fillStyle(0x07070b, 1); pxEllipse(back, mcx, 570, 78, 128);
        back.fillStyle(0x10131f, 1); pxEllipse(back, mcx + 10, 570, 40, 80);
        if (!scene.textures.exists('px_cave')) gridToTexture(scene, 'px_cave', caveGrid(f.caveX, X0, W), 6);
        scene.add.image(X0 - 6, 200 - 6, 'px_cave').setOrigin(0, 0).setDepth(-0.7);
        // Og'iz soyasi (qahramon OLDIDA): kirgan qahramon xiralashadi
        const shadow = scene.add.graphics().setDepth(4);
        shadow.fillStyle(0x000000, 0.55); pxEllipse(shadow, mcx, 570, 72, 122);
        shadow.fillStyle(0x000000, 0.25); pxEllipse(shadow, mcx - 36, 570, 40, 110);
    }


    // ===== YURUVCHI TOSHLAR (map-7): g'or ichi - tepada stalaktitlar, orqada kristallar,
    // pastda tubsiz chuqurlik (binafsha tuman); toshlar tebranadi, ustiga tushilsa qulaydi =====
    function stoneGrid(wc) {
        const H = 10;
        const g = gridNew(wc, H);
        for (let y = 0; y < H; y++) {
            const inset = y < 7 ? (y === 0 ? 1 : 0) : (y - 6) * 2 - 1;
            for (let x = inset; x < wc - inset; x++) {
                if (y >= 7 && (x * 7 + y * 3) % 5 === 0) continue;      // tagi notekis
                let c = shade(0.85 - y / 11 - Math.abs(x / wc - 0.5) * 0.3, x, y, ROCK);
                if (y === 0) c = (x % 3 === 0) ? 0x4dd0e1 : 0x26a69a;     // tepasida yorug' mox
                if (y === 1 && x % 4 === 2) c = 0x26a69a;
                g[y][x] = c;
            }
        }
        // "Yuruvchi" toshlarning ko'zlari - yonib turgan runlar
        const mid = Math.floor(wc / 2);
        g[4][mid - 3] = 0x80deea; g[4][mid + 2] = 0x80deea;
        return gridOutline(g, 0x0d0d10);
    }
    function caveFloorGrid() {
        const g = gridNew(16, 15);
        for (let x = 0; x < 16; x++) {
            g[0][x] = x % 4 === 1 ? 0x4dd0e1 : 0x26a69a;
            for (let y = 1; y < 15; y++) g[y][x] = shade(0.8 - y / 16, x, y, ROCK);
        }
        return g;
    }
    // G'or orqa devori: shift - stalaktitlar, uzoq tosh ustunlari, yaltiroq kristallar
    function caveBackInto(g, W) {
        for (let i = 0; i < 12; i++) {
            const x = i * 140 + ((i * 53) % 60), w = 50 + ((i * 29) % 40);
            g.fillStyle(0x1b1b30, 1); g.fillRect(x, 60, w, 510);
            g.fillStyle(0x222240, 1); g.fillRect(x, 60, 8, 510);
        }
        g.fillStyle(0x0b0b16, 1); g.fillRect(0, 0, W, 54);
        for (let x = 0; x < W; x += 18) {
            const len = 18 + ((x * 37) % 70);
            for (let k = 0; k < len; k += 6) {
                const hw = Math.max(1, Math.round((9 * (1 - k / len)) / 3) * 3);
                g.fillRect(x + 9 - hw, 54 + k, hw * 2, 6);
            }
        }
        [[0x4dd0e1, 0x006064], [0xb388ff, 0x4527a0]].forEach(([c, dark], j) => {
            for (let i = 0; i < 9; i++) {
                const x = (i * 190 + j * 95 + ((i * 71) % 50)) % W, y = 200 + ((i * 97 + j * 60) % 260);
                g.fillStyle(c, 0.12); g.fillRect(x - 18, y - 18, 36, 36);
                g.fillStyle(dark, 1); g.fillRect(x - 3, y - 12, 6, 24); g.fillRect(x + 5, y - 6, 5, 16);
                g.fillStyle(c, 1); g.fillRect(x - 3, y - 12, 3, 18); g.fillRect(x + 5, y - 6, 2, 12);
            }
        });
    }
    function buildStonesScene(scene) {
        const W = mapWidth, cfg = map.stones;
        drawPixelBackdrop(scene, {
            sky: [0x07070d, 0x0a0a14, 0x0d0d1b, 0x101022, 0x14142a, 0x181833],
            clouds: false, mountains: false, width: W
        });
        bakeTile(scene, 'bg_cave', 570, 0, (g, w) => caveBackInto(g, w));
        scene.add.tileSprite(0, 0, W, 570, 'bg_cave').setOrigin(0, 0).setScrollFactor(0.6, 1).setDepth(-3);
        // Tubsiz chuqurlik: pastga qarab quyuqlashuvchi binafsha tuman
        const abyss = scene.add.graphics().setDepth(-0.8);
        [[470, 0.10], [510, 0.18], [540, 0.28], [566, 0.42], [584, 0.6]].forEach(([y, a]) => {
            abyss.fillStyle(0x4a148c, a); abyss.fillRect(0, y, W, 600 - y);
        });
        // Qirg'oqlar (chuqurlik boshida va oxirida)
        if (!scene.textures.exists('px_cavefloor')) gridToTexture(scene, 'px_cavefloor', caveFloorGrid(), 2);
        const pit = map.pits[0];
        scene.add.tileSprite(0, 570, pit.x, 30, 'px_cavefloor').setOrigin(0, 0).setDepth(1);
        scene.add.tileSprite(pit.x + pit.w, 570, W - pit.x - pit.w, 30, 'px_cavefloor').setOrigin(0, 0).setDepth(1);
        // Chiqish: g'or oxiridagi yorug' teshik (keyingi xarita - tashqarida)
        const ex = W - 150;
        const exit = scene.add.graphics().setDepth(-0.6);
        exit.fillStyle(0x0b0b16, 1); exit.fillRect(ex - 40, 0, W - ex + 40, 570);
        exit.fillStyle(0xfff3c4, 0.18); exit.fillRect(ex - 30, 360, 110, 210);
        exit.fillStyle(0xfff3c4, 0.35); exit.fillRect(ex - 10, 390, 80, 180);
        exit.fillStyle(0xfffde7, 0.9); exit.fillRect(ex + 6, 420, 48, 150);
        exit.fillStyle(0xfff3c4, 0.12); exit.fillRect(ex - 120, 560, 200, 10);
        // Toshlar
        stoneGroup = scene.physics.add.group({ allowGravity: false, immovable: true });
        cfg.stones.forEach((st, i) => {
            const key = 'px_stone_' + st.w;
            if (!scene.textures.exists(key)) gridToTexture(scene, key, stoneGrid(Math.round(st.w / 4)), 4);
            const sp = scene.physics.add.image(st.x, st.baseY, key).setOrigin(0.5, 4 / 48).setDepth(2);
            stoneGroup.add(sp);
            sp.body.setAllowGravity(false);
            sp.body.setImmovable(true);
            sp.body.moves = false;          // pozitsiyani server beradi (kinematik)
            sp.body.setSize(st.w, 20, false);
            sp.body.setOffset(4, 4);
            makeOneWay(sp);
            sp.baseX = st.x; sp.ty = st.baseY; sp.state = 'idle';
            stoneSprites['stone_' + i] = sp;
        });
    }
    function crumbleStone(scene, sp) {
        for (let k = 0; k < 10; k++) {
            const chip = scene.add.rectangle(sp.x + Phaser.Math.Between(-sp.width / 2, sp.width / 2), sp.y + 12, 6, 6,
                ROCK[Phaser.Math.Between(1, 3)]).setDepth(3);
            scene.tweens.add({ targets: chip, y: chip.y + Phaser.Math.Between(80, 200), angle: 180, alpha: 0,
                duration: Phaser.Math.Between(500, 900), onComplete: () => chip.destroy() });
        }
    }


    // ===== TOSH GORILLA (map-8): shiftli tosh zal, chap pastda eshik, 5 ta tosh platforma =====
    const STONE = [0x3a3a40, 0x55555d, 0x72727a, 0x8f8f96, 0xadadb3];
    // Gorilla (old tomondan): pose - 'idle' | 'roar' | 'slam' | 'push' | 'rest'
    function gorillaGrid(pose) {
        const W = 44, H = 36;
        const g = gridNew(W, H);
        const part = (x, y, w, h, light = 0) => {
            for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
                if (yy < 0 || yy >= H || xx < 0 || xx >= W) continue;
                const corner = (xx === x || xx === x + w - 1) && (yy === y || yy === y + h - 1);
                if (corner && w > 3 && h > 3) continue;
                g[yy][xx] = shade(0.78 + light - (yy - y) / (h * 2.4) - ((xx - x) / w) * 0.25, xx, yy, STONE);
            }
        };
        const limb = (ax, ay, bx, by, th) => {
            const n = Math.ceil(Math.hypot(bx - ax, by - ay) * 2);
            for (let i = 0; i <= n; i++) {
                const cx = ax + (bx - ax) * i / n, cy = ay + (by - ay) * i / n;
                for (let yy = Math.floor(cy - th / 2); yy <= cy + th / 2; yy++) for (let xx = Math.floor(cx - th / 2); xx <= cx + th / 2; xx++) {
                    if (yy < 0 || yy >= H || xx < 0 || xx >= W) continue;
                    g[yy][xx] = shade(0.7 - (xx - cx + th / 2) / (th * 3), xx, yy, STONE);
                }
            }
        };
        const set = (x, y, c) => { if (y >= 0 && y < H && x >= 0 && x < W) g[y][x] = c; };
        const hy = pose === 'rest' ? 5 : 2;
        // Oyoqlar va tana
        part(13, 29, 7, 7, -0.1); part(24, 29, 7, 7, -0.1);
        part(9, 12, 26, 19);
        part(14, 15, 7, 6, 0.15); part(23, 15, 7, 6, 0.1);
        part(17, 22, 10, 7, 0.06);
        // Qo'llar
        if (pose === 'roar') {
            limb(9, 15, 3, 3, 6); part(0, 0, 7, 6, 0.05);
            limb(34, 15, 40, 3, 6); part(37, 0, 7, 6, 0.05);
        } else if (pose === 'slam') {
            limb(11, 14, 11, 2, 6); part(7, 0, 9, 5, 0.1);
            limb(33, 14, 33, 2, 6); part(29, 0, 9, 5, 0.1);
        } else {
            part(3, 12, 7, 20); part(2, 30, 9, 6, 0.05);
            if (pose === 'push') { limb(34, 16, 41, 16, 6); part(38, 12, 6, 9, 0.12); }
            else { part(34, 12, 7, 20, -0.05); part(33, 30, 9, 6); }
        }
        part(6, 11, 6, 5, 0.1); part(32, 11, 6, 5);
        // Bosh
        part(15, hy, 14, 12, 0.05);
        for (let x = 16; x < 28; x++) set(x, hy + 4, STONE[0]);
        const eye = pose === 'rest' ? 0x8d4b00 : pose === 'roar' || pose === 'slam' ? 0xffea00 : 0xff9100;
        [18, 19, 24, 25].forEach(x => set(x, hy + 5, eye));
        part(18, hy + 7, 8, 4, 0.22);
        set(20, hy + 8, STONE[0]); set(23, hy + 8, STONE[0]);
        if (pose === 'roar' || pose === 'slam') {
            for (let y = hy + 9; y < hy + 13; y++) for (let x = 18; x < 26; x++) set(x, y, 0x2b0000);
            [18, 20, 23, 25].forEach(x => { set(x, hy + 9, 0xf5f5f5); set(x, hy + 12, 0xf5f5f5); });
            for (let x = 20; x < 24; x++) set(x, hy + 11, 0xc62828);
        } else if (pose === 'rest') {
            for (let x = 20; x < 24; x++) set(x, hy + 10, 0x2b0000);
        } else {
            for (let x = 19; x < 25; x++) set(x, hy + 10, STONE[0]);
        }
        // Mox va yoriqlar
        [[7, 11], [8, 11], [33, 11], [36, 11], [17, hy], [22, hy], [26, hy], [12, 12], [30, 12]].forEach(([x, y], i) => set(x, y, i % 2 ? 0x2f7d3a : 0x4ea24a));
        [[12, 17], [13, 18], [13, 19], [14, 20], [30, 24], [31, 25], [31, 26], [20, 26], [21, 27]].forEach(([x, y]) => set(x, y, STONE[0]));
        return gridOutline(g, 0x111114);
    }
    function slabGrid(wc) {
        const g = gridNew(wc, 5);
        for (let y = 0; y < 5; y++) for (let x = (y === 4 ? 1 : 0); x < wc - (y === 4 ? 1 : 0); x++) {
            g[y][x] = y === 0 ? (x % 5 === 2 ? 0x4ea24a : STONE[3]) : shade(0.8 - y / 5, x, y, STONE);
        }
        return gridOutline(g, 0x111114);
    }
    function spikeGrid() {
        const g = gridNew(14, 30);
        for (let y = 0; y < 30; y++) {
            const hw = Math.min(7, 1 + Math.floor(y / 4));
            for (let x = 7 - hw; x < 7 + hw; x++) g[y][x] = shade(0.85 - (x - 7 + hw) / (hw * 2.5) - y / 80, x, y, STONE);
        }
        return gridOutline(g, 0x111114);
    }
    function boulderGrid() {
        const g = gridNew(9, 9);
        for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
            if (Math.hypot(x - 4, y - 4) > 4.3) continue;
            g[y][x] = shade(0.8 - (x + y) / 20, x, y, STONE);
        }
        return gridOutline(g, 0x111114);
    }
    // Zal devori: to'q tosh, shift (pastki qirrasi notekis emas - platforma unga tekis uriladi),
    // mash'alalar, chap pastda - kelingan g'or eshigi (ko'kish nur)
    function hallInto(g) {
        for (let y = 0; y < 570; y += 6) for (let x = 0; x < 800; x += 6) {
            const cx = x / 6, cy = y / 6;
            let v = 0.42 - y / 1800 + 0.08 * Math.sin(cx * 0.45 + cy * 0.3) * Math.sin(cy * 0.21);
            if (((cx * 7 + cy * 13) % 29) === 0) v -= 0.2;
            g.fillStyle(shade(v, cx, cy, [0x16141b, 0x1e1b24, 0x27232f, 0x302b3a]), 1);
            g.fillRect(x, y, 6, 6);
        }
        // Shift
        const ceil = map.gorilla.ceilingY;
        for (let x = 0; x < 800; x += 6) {
            const top = ceil - 6 - ((x * 7) % 18);
            for (let y = 0; y < ceil; y += 6) {
                g.fillStyle(y > top ? STONE[1] : STONE[0], 1);
                g.fillRect(x, y, 6, 6);
            }
        }
        g.fillStyle(STONE[2], 1); g.fillRect(0, ceil - 6, 800, 6);
        // Eshik (chap pastda) - g'ordan kelingan joy
        g.fillStyle(0x0b0b14, 1); g.fillRect(14, 474, 62, 96);
        g.fillStyle(0x4dd0e1, 0.18); g.fillRect(20, 480, 50, 90);
        g.fillStyle(STONE[2], 1); g.fillRect(8, 468, 74, 8); g.fillRect(8, 468, 8, 102); g.fillRect(74, 468, 8, 102);
    }
    function buildGorillaScene(scene) {
        const gd = map.gorilla;
        const mk = (key, grid, P) => { if (!scene.textures.exists(key)) gridToTexture(scene, key, grid, P); };
        ['idle', 'roar', 'slam', 'push', 'rest'].forEach(pose => mk('px_gor_' + pose, gorillaGrid(pose), 4));
        // Dialog portreti - faqat bosh qismi (kattalashtirilgan)
        const head = (pose) => gorillaGrid(pose).slice(1, 18).map(row => row.slice(13, 33));
        mk('px_gor_face', head('roar'), 6);
        mk('px_gor_face_sad', head('rest'), 6);
        mk('px_gspike', spikeGrid(), 4);
        mk('px_boulder', boulderGrid(), 4);
        if (!scene.textures.exists('px_hall')) {
            const g = scene.add.graphics();
            hallInto(g);
            g.generateTexture('px_hall', 800, 570);
            g.destroy();
        }
        scene.add.image(0, 0, 'px_hall').setOrigin(0, 0).setDepth(-3);
        if (!scene.textures.exists('px_cavefloor')) gridToTexture(scene, 'px_cavefloor', caveFloorGrid(), 2);
        gFloor = scene.add.tileSprite(0, 570, 800, 30, 'px_cavefloor').setOrigin(0, 0).setDepth(1);
        // Mash'alalar (lipillaydi)
        [[250, 150], [550, 150], [30, 300], [770, 300]].forEach(([x, y]) => {
            const glow = scene.add.circle(x, y, 26, 0xff9100, 0.18).setDepth(-2);
            scene.tweens.add({ targets: glow, alpha: 0.06, scale: 1.2, duration: 220 + Math.random() * 200, yoyo: true, repeat: -1 });
            scene.add.rectangle(x, y + 14, 6, 18, 0x4e342e).setDepth(-2);
            const fl = scene.add.rectangle(x, y, 8, 12, 0xffca28).setDepth(-2);
            scene.tweens.add({ targets: fl, scaleY: 1.4, duration: 150, yoyo: true, repeat: -1 });
        });
        // Platformalar - kinematik (server joyini beradi), bir tomonlama
        gPlatGroup = scene.physics.add.group({ allowGravity: false, immovable: true });
        gd.platforms.forEach((pl, i) => {
            const key = 'px_slab_' + pl.w;
            mk(key, slabGrid(Math.round(pl.w / 4)), 4);
            const sp = scene.physics.add.image(pl.x + pl.w / 2, pl.y, key).setOrigin(0.5, 4 / 28).setDepth(2);
            gPlatGroup.add(sp);
            sp.body.setAllowGravity(false);
            sp.body.setImmovable(true);
            sp.body.moves = false;
            sp.body.setSize(pl.w, 14, false);
            sp.body.setOffset(4, 4);
            makeOneWay(sp);
            sp.baseX = pl.x + pl.w / 2; sp.ty = pl.y; sp.state = 'idle';
            gPlatSprites['gp_' + i] = sp;
        });
        gorillaSprite = scene.add.image(gd.startX, 574, 'px_gor_idle').setOrigin(0.5, 1).setDepth(2);
        gCrackGfx = scene.add.graphics().setDepth(1.5);
    }
    function gDust(scene, x, y, n, color = 0x9e9e9e) {
        for (let k = 0; k < n; k++) {
            const d = scene.add.rectangle(x + Phaser.Math.Between(-30, 30), y, 8, 8, color, 0.8).setDepth(5);
            scene.tweens.add({ targets: d, x: d.x + Phaser.Math.Between(-50, 50), y: y - Phaser.Math.Between(10, 60), alpha: 0, scale: 2,
                duration: Phaser.Math.Between(400, 800), onComplete: () => d.destroy() });
        }
    }
    function gCeilingPebbles(scene, n) {
        for (let k = 0; k < n; k++) {
            const pb = scene.add.rectangle(Phaser.Math.Between(20, 780), map.gorilla.ceilingY, 4, 4, STONE[2]).setDepth(4);
            scene.tweens.add({ targets: pb, y: 570, duration: Phaser.Math.Between(700, 1200), delay: Phaser.Math.Between(0, 300), onComplete: () => pb.destroy() });
        }
    }
    // Holat o'zgarganda - bir martalik effektlar
    function gorillaFx(scene, prev, cur) {
        const gx = cur.x;
        if (cur.state === 'roar') {
            scene.cameras.main.shake(400, 0.006);
            for (let k = 0; k < 3; k++) {
                const ring = scene.add.circle(gx, 470, 20, 0xffffff, 0).setStrokeStyle(4, 0xffe0b2, 0.9).setDepth(5);
                scene.tweens.add({ targets: ring, scale: 6, alpha: 0, delay: k * 140, duration: 500, onComplete: () => ring.destroy() });
            }
            gCeilingPebbles(scene, 6);
        } else if (cur.state === 'push') {
            scene.cameras.main.shake(250, 0.01);
            [-1, 1].forEach(dir => {
                for (let k = 0; k < 4; k++) {
                    const line = scene.add.rectangle(gx + dir * 70, 500 + k * 18, 40, 4, 0xffffff, 0.8).setDepth(5);
                    scene.tweens.add({ targets: line, x: gx + dir * 300, alpha: 0, scaleX: 3, duration: 280, onComplete: () => line.destroy() });
                }
                gDust(scene, gx + dir * 90, 566, 5);
            });
        } else if (cur.state === 'slam') {
            scene.cameras.main.shake(450, 0.018);
            gDust(scene, gx - 60, 566, 7); gDust(scene, gx + 60, 566, 7);
            gCeilingPebbles(scene, 10);
        } else if (cur.state === 'fall' && prev !== 'fall') {
            gorillaCollapse(scene, gx);
        }
    }
    // Yerni urish: har zarbada ekran silkinadi, chang ko'tariladi, polda yangi yoriq paydo bo'ladi
    function gorillaPound(scene, gx) {
        scene.cameras.main.shake(180, 0.022);
        gDust(scene, gx - 60, 566, 5); gDust(scene, gx + 60, 566, 5);
        gCeilingPebbles(scene, 4);
        const cr = scene.add.graphics().setDepth(1.6);
        cr.lineStyle(4, 0x000000, 1);
        let x = gx + Phaser.Math.Between(-380, 380), y = 570;
        cr.beginPath(); cr.moveTo(x, y);
        for (let j = 0; j < 5; j++) { x += Phaser.Math.Between(-26, 26); y += 6; cr.lineTo(x, y); }
        cr.strokePath();
        gCracks.push(cr);
    }
    // POL QULAYDI: pol, platformalar, gorilla va qahramonlar - hammasi yer ostiga (zulmatga) tushadi
    function gorillaCollapse(scene, gx) {
        scene.cameras.main.shake(1600, 0.03);
        for (let k = 0; k < 36; k++) {
            const chip = scene.add.rectangle(Phaser.Math.Between(0, 800), 572, Phaser.Math.Between(10, 24), Phaser.Math.Between(8, 16),
                STONE[Phaser.Math.Between(0, 4)]).setDepth(5);
            scene.tweens.add({ targets: chip, y: 700 + Phaser.Math.Between(0, 150), angle: Phaser.Math.Between(-180, 180),
                delay: Phaser.Math.Between(0, 400), duration: Phaser.Math.Between(700, 1200), ease: 'Quad.In', onComplete: () => chip.destroy() });
        }
        const falling = [gFloor, ...gCracks, gCrackGfx].filter(Boolean);
        scene.tweens.add({ targets: falling, y: '+=260', duration: 1000, ease: 'Quad.In' });
        if (gorillaSprite) scene.tweens.add({ targets: gorillaSprite, y: 900, angle: 25, duration: 1300, ease: 'Quad.In' });
        // Tayanchlar yo'qoladi - qahramonlar ham tushib ketadi
        platforms.getChildren().forEach(c => { if (c.body) c.body.enable = false; });
        Object.values(gPlatSprites).forEach((sp) => {
            sp.body.enable = false;
            sp.state = 'fallen';
            scene.tweens.add({ targets: sp, y: 900, angle: Phaser.Math.Between(-30, 30), delay: Phaser.Math.Between(100, 500), duration: 1200, ease: 'Quad.In' });
        });
        if (currentCharacter && currentCharacter.body) currentCharacter.setCollideWorldBounds(false);
        scene.time.delayedCall(900, () => scene.cameras.main.fadeOut(900, 0, 0, 0));
    }

    function buildForestScene(scene) {
        const W = mapWidth, f = map.forest;
        buildPixelTextures(scene);
        buildForestTextures(scene);
        drawPixelBackdrop(scene, {
            sky: [0x3a7ca5, 0x4f95b5, 0x6aaec2, 0x8cc7cf, 0xb2dccf, 0xd6ecc9],
            cloud: 0xffffff, cloudShade: 0xcfe8e0, mountains: false, width: W
        });
        bakeTile(scene, 'bg_forest_far', 570 - 240, 240, (g, w) => forestFarInto(g, w));
        bakeTile(scene, 'bg_forest_mid', 570 - 280, 280, (g, w) => forestMidInto(g, w));
        scene.add.tileSprite(0, 240, W, 330, 'bg_forest_far').setOrigin(0, 0).setScrollFactor(0.5, 1).setDepth(-3);
        scene.add.tileSprite(0, 280, W, 290, 'bg_forest_mid').setOrigin(0, 0).setScrollFactor(0.75, 1).setDepth(-2);
        // Chapda - map-5 dagi qal'aning oxiri: devor, minora va OCHIQ DARVOZA (shu yerdan chiqib kelishadi)
        bakeTile(scene, 'bg_castle', 570 - 140, 140, (g, w) => drawCastleWallInto(g, w));
        scene.add.tileSprite(0, 140, 280, 430, 'bg_castle').setOrigin(0, 0).setDepth(-1.5);
        const gate = scene.add.graphics().setDepth(-1.4);
        gate.fillStyle(0x3b3550, 1); gate.fillRect(56, 438, 108, 132);
        gate.fillStyle(0x120a05, 1); gate.fillRect(68, 450, 84, 120);
        gate.fillStyle(0x6c6584, 1); gate.fillRect(56, 432, 108, 8);
        gate.fillStyle(0x4e342e, 1);
        for (let x = 72; x < 150; x += 12) gate.fillRect(x, 450, 4, 20);   // ko'tarilgan panjara
        gate.fillStyle(0xffb74d, 1); gate.fillRect(44, 470, 6, 10); gate.fillRect(170, 470, 6, 10);  // mash'alalar
        // Yer: o't va tuproq
        scene.add.tileSprite(0, 570, W, 30, 'px_grass').setOrigin(0, 0).setDepth(1);
        // Bahaybat daraxt
        if (!scene.textures.exists('px_bigtree')) gridToTexture(scene, 'px_bigtree', bigTreeGrid(f.treeX, map.platforms.filter(p => p.h <= 14)), 6);
        scene.add.image(f.treeX - 460 - 6, -6, 'px_bigtree').setOrigin(0, 0).setDepth(-1);
        // Yo'l bo'yida butalar
        const bush = scene.add.graphics().setDepth(2);
        for (let x = 330; x < f.caveX - 160; x += 170 + ((x * 7) % 90)) {
            if (Math.abs(x - f.treeX) < 180) continue;
            bush.fillStyle(0x2f7d3a, 1); pxCrown(bush, x, 564, 18, 6);
            bush.fillStyle(0x4ea24a, 1); pxCrown(bush, x - 6, 558, 10, 6);
        }
        buildCave(scene);
    }

    // Itlar paydo bo'ldi: ekran silkinadi, daraxtdan barglar to'kiladi, katta yozuv
    function dogsAttackFx(scene) {
        scene.cameras.main.shake(500, 0.012);
        for (let i = 0; i < 26; i++) {
            const leaf = scene.add.rectangle(map.forest.treeX + Phaser.Math.Between(-340, 340), Phaser.Math.Between(60, 220), 6, 6,
                LEAF[Phaser.Math.Between(2, 4)]).setDepth(4);
            scene.tweens.add({ targets: leaf, y: 575, x: leaf.x + Phaser.Math.Between(-60, 60), angle: 360,
                duration: Phaser.Math.Between(1400, 2600), onComplete: () => leaf.destroy() });
        }
        const txt = scene.add.text(400, 200, t('forest_dogs'), {
            fontFamily: PIXEL_FONT, fontSize: '26px', color: '#ff1744', stroke: '#000000', strokeThickness: 6
        }).setOrigin(0.5).setScrollFactor(0).setDepth(1004).setScale(0.3);
        scene.tweens.add({ targets: txt, scale: 1, duration: 300, ease: 'Back.Out' });
        scene.tweens.add({ targets: txt, alpha: 0, delay: 1600, duration: 500, onComplete: () => txt.destroy() });
    }

    function spawnCrowdElf(scene, x, state) {
        const styleIdx = Math.floor(Math.random() * CROWD_STYLES.length);
        const sprite = scene.add.image(x, 571, 'px_npc_' + styleIdx + '_a').setOrigin(0.5, 1).setDepth(2);
        crowd.push({
            sprite, styleIdx, dir: state === 'flee' ? 1 : (Math.random() < 0.5 ? -1 : 1),
            // Qochganda ham sekin chopadi (ilondan sekinroq bo'lganlari ezilib qoladi)
            speed: state === 'flee' ? 45 + Math.random() * 60 : 25 + Math.random() * 35,
            frameT: 0, frame: 0, turnT: 2000 + Math.random() * 4000, state, fleeDelay: Math.random() * 1200
        });
    }

    // Rastalar rasmi faqat kamera yaqinida; bossda ilon yetib kelgan rastani ezadi
    function updateStalls(scene) {
        const camX = scene.cameras.main.scrollX;
        map.market.stalls.forEach((st, i) => {
            if (stallSmashed[i]) return;
            if (isBoss && bossFx.wall && snakeDisplayX !== null && snakeDisplayX >= st.x - 60) {
                stallSmashed[i] = true;
                roofs[i].destroy();
                if (stallObjs[i]) { smashStall(scene, stallObjs[i]); stallObjs[i] = null; }
                return;
            }
            const near = st.x > camX - 250 && st.x < camX + 1150;
            if (near && !stallObjs[i]) {
                const back = scene.add.image(st.x, 574, 'px_stall_back_' + st.kind).setOrigin(0.5, 1).setDepth(-1);
                // Peshtaxta ortida quti ustida turadi - boshi va yelkasi mollar ustidan ko'rinadi
                const elf = scene.add.image(st.x, 547, 'px_elf_' + st.kind).setOrigin(0.5, 1).setDepth(0);
                scene.tweens.add({ targets: elf, y: 545, duration: 700 + (i % 5) * 150, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
                if (isStory && st.x === map.story.sellerX) sellerSprite = elf;
                const front = scene.add.image(st.x, 574, 'px_stall_front_' + st.kind).setOrigin(0.5, 1).setDepth(1);
                const lanterns = [...drawLantern(scene, st.x - 50, 452), ...drawLantern(scene, st.x + 50, 452)];
                stallObjs[i] = { back, front, elf, lanterns, x: st.x, kind: st.kind };
            } else if (!near && stallObjs[i]) {
                const o = stallObjs[i];
                [o.back, o.front, o.elf, ...o.lanterns].forEach((g) => { if (g) { scene.tweens.killTweensOf(g); g.destroy(); } });
                stallObjs[i] = null;
            }
        });
    }

    // Olomon: map-4 da aylanib yuradi; bossda devor buzilgach o'ngga (sekin) qochadi -
    // ilon yetib olsa eziladi, olov yetsa kuyadi (ko'k qon). Map-5 da oldinda doim yangi
    // qochayotgan elflar paydo bo'ladi
    function updateCrowd(scene, dtMs) {
        const camX = scene.cameras.main.scrollX;
        crowd.forEach((n) => {
            if (n.state === 'dead') return;
            const s = n.sprite;
            if (isBoss && bossState && bossState.wallBroken && n.state === 'walk') {
                n.fleeDelay -= dtMs;
                if (n.fleeDelay <= 0) { n.state = 'flee'; n.dir = 1; n.speed = 45 + Math.random() * 60; }
            }
            s.x += n.dir * n.speed * dtMs / 1000;
            if (n.state === 'walk') {
                n.turnT -= dtMs;
                const maxX = Math.min(mapWidth, 1600) - 40;
                if (n.turnT <= 0 || s.x < 140 || s.x > maxX) {
                    n.dir = s.x < 140 ? 1 : s.x > maxX ? -1 : -n.dir;
                    n.turnT = 2000 + Math.random() * 4000;
                }
            }
            n.frameT += dtMs;
            if (n.frameT > (n.state === 'flee' ? 120 : 180)) {
                n.frameT = 0;
                n.frame = 1 - n.frame;
                s.setTexture('px_npc_' + n.styleIdx + (n.frame ? '_b' : '_a'));
            }
            s.setFlipX(n.dir < 0);
            if (isBoss && snakeDisplayX !== null && bossState && bossState.wallBroken) {
                const crushed = snakeDisplayX >= s.x - 6;
                const burned = bossState.fire === 'fire' && s.x >= snakeDisplayX - 20 && s.x <= snakeDisplayX + map.boss.fireRange;
                if (crushed || burned) {
                    blueBlood(scene, s.x, 548);
                    s.destroy();
                    n.state = 'dead';
                    return;
                }
            }
            if (isBoss && s.x < camX - 300) { s.destroy(); n.state = 'dead'; }
        });
        crowd = crowd.filter(n => n.state !== 'dead');
        // Map-5: oldinda (kamera o'ng chetidan tashqarida) yangi qochoqlar
        if (isBoss && bossState && bossState.wallBroken && crowd.length < 22) {
            spawnCrowdElf(scene, camX + 820 + Math.random() * 500, 'flee');
        }
    }

    // OLOV: ogohlantirishda og'zi cho'g'lanadi; purkaganda - boshidan oldinga yer
    // bo'ylab lipillovchi piksel alanga (yuqori qirrasi taxta sathidan pastda)
    let fireGfx = null;
    // Alanga konturi serverdagi touchesBossFire bilan BIR XIL (d - boshdan masofa):
    // uzoqlashgan sari pasayadi, oxirgi 60px da uchi torayadi
    function flameTopAt(d, range) {
        const H = 568 - Math.max(568 - (110 + 70 * (1 - d / range)), 392);
        const taper = d > range - 60 ? Math.max(0, (range - d) / 60) : 1;
        return 568 - H * taper;
    }
    function drawBossFire(scene) {
        if (!fireGfx) fireGfx = scene.add.graphics().setDepth(6);
        fireGfx.clear();
        if (!bossState || bossState.dead || snakeDisplayX === null) return;
        const g = fireGfx, t = scene.time.now, hx = snakeDisplayX;
        const M = snakeMouth || { x: hx - 4, y: 470, gap: 30 };
        if (bossState.fire === 'charge') {
            // Og'izda cho'g' to'planadi, atrofdan uchqunlar og'izga so'riladi
            const pulse = 0.5 + 0.5 * Math.sin(t / 60);
            g.fillStyle(0xff6d00, 0.3 + 0.3 * pulse); g.fillCircle(M.x, M.y, 30 + pulse * 12);
            g.fillStyle(0xffd54f, 0.9); g.fillCircle(M.x, M.y, 12 + pulse * 6);
            g.fillStyle(0xfffde7, 1); g.fillCircle(M.x, M.y, 5 + pulse * 3);
            for (let k = 0; k < 10; k++) {
                const ph = ((t / 500 + k / 10) % 1);
                const ang = k * 2.4;
                const r = 90 * (1 - ph);
                g.fillStyle(k % 2 ? 0xffab40 : 0xffea00, ph);
                g.fillRect(Math.round(M.x + Math.cos(ang) * r), Math.round(M.y + Math.sin(ang) * r * 0.7), 4, 4);
            }
            return;
        }
        if (bossState.fire !== 'fire') return;
        const range = map.boss.fireRange, P = 6;
        const q = (v) => Math.round(v / P) * P;
        const x0 = Math.floor(M.x - 6);
        const blendEnd = hx + 40;
        for (let x = x0; x < hx + range; x += P) {
            const d = Math.max(0, x - hx);
            let top = flameTopAt(d, range);
            let bottom = 568;
            // Og'iz yonida: jag'lar orasidan chiqib, keyin yerga yoyiladi
            if (x < blendEnd) {
                const k = Phaser.Math.Clamp((x - x0) / (blendEnd - x0), 0, 1);
                const e = k * k * (3 - 2 * k);
                top = Phaser.Math.Linear(M.y - M.gap * 0.45, top, e);
                bottom = Phaser.Math.Linear(M.y + M.gap * 0.45, 568, e);
            }
            if (bottom - top < 4) continue;
            const f = 1 - d / range;
            // Lipillash: ikki sinus to'lqini - tepasi "tillar" bo'lib o'ynaydi
            const w = Math.sin(x * 0.07 - t * 0.018) + Math.sin(x * 0.13 - t * 0.031) * 0.7;
            const tip = q(top - 4 - (w + 1.7) * 5 * (0.4 + f));
            const h = bottom - tip;
            let li = 0;
            const layer = (color, alpha, frac) => {
                // Ichki chegaralar ham to'lqinlanadi - alanga "tekis blok" bo'lib ko'rinmasin
                const y = q(tip + h * (frac + (frac > 0 ? 0.06 * Math.sin(x * 0.19 - t * 0.035 + (li++) * 1.7) : 0)));
                if (bottom - y > 0) { g.fillStyle(color, alpha); g.fillRect(x, y, P, bottom - y); }
            };
            layer(0x8e0000, 0.9, 0);
            layer(0xdd2c00, 0.95, 0.12);
            layer(0xff6d00, 1, 0.24);
            layer(0xffab00, 1, 0.38);
            layer(0xffd740, 1, 0.56 + 0.12 * (1 - f));
            // Oq-issiq yadro: faqat og'izga yaqin joyda, pastda
            if (f > 0.5) layer(0xfff8e1, 0.9, 1 - 0.6 * (f - 0.5));
            // Uzilib uchayotgan olov bo'laklari va tutun
            const col = Math.floor((x - x0) / P);
            const cyc = (t / 7 + col * 37) % 60;
            if (col % 4 === Math.floor(t / 90) % 4) {
                g.fillStyle(cyc < 30 ? 0xffab00 : 0xff6d00, 1 - cyc / 60);
                g.fillRect(x, q(tip - 8 - cyc * 0.8), P, P);
            }
            if (col % 9 === 0 && f < 0.8) {
                const sc = (t / 12 + col * 11) % 80;
                g.fillStyle(0x3e2723, 0.35 * (1 - sc / 80));
                g.fillRect(x - 3, tip - 20 - sc, 12, 12);
            }
        }
        // Yerga urilgan joy - yorug' chiziq
        g.fillStyle(0xfff8e1, 0.9); g.fillRect(Math.max(x0, hx), 564, range - 40, 4);
        if (Math.random() < 0.12) scene.cameras.main.shake(120, 0.005);
    }

    // KO'K QON: elf ezilganda sachraydi; yerda ko'k ko'lmak qoladi
    function blueBlood(scene, x, y) {
        const cols = [0x29b6f6, 0x0288d1, 0x01579b];
        for (let k = 0; k < 18; k++) {
            const d = scene.add.rectangle(x, y, Phaser.Math.Between(3, 5), Phaser.Math.Between(3, 5), cols[k % 3]).setDepth(4);
            scene.tweens.add({
                targets: d, x: x + Phaser.Math.Between(-70, 70), y: y - Phaser.Math.Between(10, 60), duration: 220, ease: 'Quad.Out',
                onComplete: () => scene.tweens.add({ targets: d, y: 566, duration: 300, ease: 'Quad.In',
                    onComplete: () => { d.setDepth(1.5); } })
            });
        }
        scene.add.rectangle(x, 567, 30, 4, 0x0277bd, 0.9).setDepth(1.5);
        scene.add.rectangle(x - 4, 565, 16, 2, 0x29b6f6, 0.9).setDepth(1.5);
    }

    // RASTA BUZILDI: yog'och va soyabon bo'laklari uchadi, sotuvchi elf eziladi
    function smashStall(scene, obj) {
        const K = STALL_KINDS[obj.kind];
        for (let k = 0; k < 22; k++) {
            const c = [0x8d6e63, 0x6d4c41, K.a, K.b][k % 4];
            const chunk = scene.add.rectangle(obj.x + Phaser.Math.Between(-50, 50), Phaser.Math.Between(450, 560),
                Phaser.Math.Between(6, 14), Phaser.Math.Between(4, 10), c).setDepth(4);
            scene.tweens.add({ targets: chunk, x: chunk.x + Phaser.Math.Between(40, 220), y: Math.min(566, chunk.y + Phaser.Math.Between(-90, 60)),
                angle: Phaser.Math.Between(-400, 400), alpha: 0, duration: Phaser.Math.Between(600, 1100), ease: 'Cubic.Out',
                onComplete: () => chunk.destroy() });
        }
        if (obj.elf) {
            blueBlood(scene, obj.x, 540);
            scene.tweens.killTweensOf(obj.elf);
            if (obj.elf === sellerSprite) sellerSprite = null;
            obj.elf.destroy();
            obj.elf = null;
        }
        [obj.back, obj.front, ...obj.lanterns].forEach((o) => { scene.tweens.killTweensOf(o); o.destroy(); });
        scene.cameras.main.shake(250, 0.012);
    }

    // ILON KATTA DEVORNI (eshigi bilan) BUZIB KIRDI
    function breakMarketWall(scene) {
        if (!marketWall) return;
        marketWall.tile.destroy();
        marketWall.door.destroy();
        marketWall = null;
        for (let k = 0; k < 40; k++) {
            const by = Phaser.Math.Between(20, 560);
            const chunk = scene.add.rectangle(48, by, Phaser.Math.Between(10, 24), Phaser.Math.Between(8, 18), k % 3 ? 0x6a6682 : 0x2e2b38).setDepth(6);
            scene.tweens.add({ targets: chunk, x: 48 + Phaser.Math.Between(80, 500), y: Math.min(566, by + Phaser.Math.Between(-60, 200)),
                angle: Phaser.Math.Between(-540, 540), alpha: 0, duration: Phaser.Math.Between(700, 1300), ease: 'Cubic.Out',
                onComplete: () => chunk.destroy() });
        }
        scene.cameras.main.shake(900, 0.03);
        const title = scene.add.text(400, 250, t('boss_name'), {
            fontFamily: PIXEL_FONT, fontSize: '28px', color: '#ff5252', stroke: '#000000', strokeThickness: 6
        }).setOrigin(0.5).setScrollFactor(0).setDepth(1500);
        scene.tweens.add({ targets: title, scale: 1.15, duration: 250, yoyo: true, repeat: 3,
            onComplete: () => scene.tweens.add({ targets: title, alpha: 0, duration: 600, onComplete: () => title.destroy() }) });
    }

    // BOSS JONI - ekranda katta chiziq (HUD panelidan pastda, o'rtada)
    function drawBossBar(scene, hp, maxHp, bossName = t('boss_name')) {
        if (!scene.bossBar) {
            scene.bossBar = {
                panel: scene.add.graphics().setScrollFactor(0).setDepth(998),
                bar: scene.add.graphics().setScrollFactor(0).setDepth(1000),
                name: scene.add.text(400, 124, bossName, {
                    fontFamily: PIXEL_FONT, fontSize: '12px', color: '#ff5252', stroke: '#000000', strokeThickness: 4
                }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(1001),
                last: null
            };
            drawHudPanel(scene.bossBar.panel, 90, 104, 620, 52);
        }
        const B = scene.bossBar;
        const key = hp + '/' + maxHp;
        if (B.last === key) return;
        B.last = key;
        B.bar.clear();
        drawPixelBar(B.bar, { x: 104, y: 130, w: 592, h: 16 }, hp / maxHp,
            { fill: 0xe53935, light: 0xff8a80, dark: 0x8e1b1b, empty: 0x2b0f14 }, 20);
    }

    // BOSS O'LDI: 3 soniya davomida tanasi bo'ylab ketma-ket portlashlar
    function bossDeathAnim(scene) {
        scene.time.addEvent({
            delay: 140, repeat: 20, callback: () => {
                const x = (snakeDisplayX || 0) - Phaser.Math.Between(0, 900);
                const y = Phaser.Math.Between(400, 560);
                const flash = scene.add.circle(x, y, 14, 0xffeb3b, 1).setDepth(7);
                scene.tweens.add({ targets: flash, scale: 5, alpha: 0, duration: 380, onComplete: () => flash.destroy() });
                const ring = scene.add.circle(x, y, 16, 0xff6d00, 0.9).setDepth(7);
                scene.tweens.add({ targets: ring, scale: 4, alpha: 0, duration: 520, onComplete: () => ring.destroy() });
                scene.cameras.main.shake(200, 0.015);
            }
        });
        if (snakeGfx) scene.tweens.add({ targets: snakeGfx, alpha: 0, delay: 1800, duration: 1200 });
        const txt = scene.add.text(400, 250, t('boss_defeated'), {
            fontFamily: PIXEL_FONT, fontSize: '22px', color: '#ffeb3b', stroke: '#000000', strokeThickness: 6
        }).setOrigin(0.5).setScrollFactor(0).setDepth(1500).setAlpha(0);
        scene.tweens.add({ targets: txt, alpha: 1, delay: 1200, duration: 500 });
    }

    // BAYROQCHALAR ipi (osilib turadi) va FONARLAR (lipillaydi)
    function drawBunting(scene, width = 800) {
        bakeTile(scene, 'bg_bunting', 40, 136, (g, W) => drawBuntingInto(g, W));
        scene.add.tileSprite(0, 136, width, 40, 'bg_bunting').setOrigin(0, 0).setDepth(0);
    }
    function drawBuntingInto(g, width) {
        const colors = [0xe53935, 0xffca28, 0x43a047, 0x1e88e5, 0x8e24aa];
        for (let x = 0; x < width; x += 4) {
            // 560px to'lqin - 1680 ga butun sig'adi (bo'lak chegarasida uzilmaydi)
            const y = 150 + Math.round(Math.sin((x / 560) * Math.PI * 2) * 14 / 2) * 2;
            g.fillStyle(0x3e2723, 1); g.fillRect(x, y, 4, 2);
            if (x % 28 === 0) {
                g.fillStyle(colors[(x / 28) % colors.length], 1);
                for (let r = 0; r < 6; r++) g.fillRect(x + r, y + 2 + r * 2, 12 - r * 2, 2);
            }
        }
    }
    function drawLantern(scene, x, y) {
        const glow = scene.add.rectangle(x, y, 26, 26, 0xffb74d, 0.22).setDepth(2);
        scene.tweens.add({ targets: glow, alpha: 0.08, duration: 300 + Math.random() * 300, yoyo: true, repeat: -1 });
        const g = scene.add.graphics().setDepth(2);
        g.fillStyle(0x3e2723, 1); g.fillRect(x - 1, y - 12, 2, 4); g.fillRect(x - 5, y - 8, 10, 2); g.fillRect(x - 5, y + 6, 10, 2);
        g.fillStyle(0xffb74d, 1); g.fillRect(x - 4, y - 6, 8, 12);
        g.fillStyle(0xfff3e0, 1); g.fillRect(x - 2, y - 4, 2, 6);
        return [glow, g];
    }

    const MARKET_SCRIPT = [
        ['elf', 1], ['elf', 2], ['elf', 3], ['player', 4], ['elf', 5], ['player', 6], ['elf', 7], ['elf', 8],
        ['player', 9], ['elf', 10], ['player', 11], ['elf', 12], ['elf', 13], ['player', 14], ['elf', 15],
        ['elf', 16], ['narrator', 17, 'shake'], ['elf', 18, 'scream'], ['player', 19]
    ];
    function marketScript() {
        return MARKET_SCRIPT.map(([who, n, fx]) => ({ who, text: t('story_' + n), fx }));
    }

    // KATTA ESHIK OCHILDI: rasm almashadi, ichidan ko'k nur taraladi, yer silkinadi
    function openBigDoorAnim(scene) {
        if (!bigDoor) return;
        bigDoor.setTexture('px_door_open');
        const glow = scene.add.rectangle(bigDoor.x + 46, 500, 76, 132, 0x5c6bc0, 0.35).setDepth(2);
        scene.tweens.add({ targets: glow, alpha: 0.08, duration: 700, yoyo: true, repeat: -1 });
        scene.cameras.main.shake(300, 0.008);
    }


    // SAVATCHA qahramon orqasida; ichida olmalar ko'rinadi (5 tagacha), boshqa
    // qahramonlar ustida - "7/12" hisob
    function drawBasket(scene, sprite, facingRight, count, target, showText) {
        if (!sprite.basketGfx) sprite.basketGfx = scene.add.graphics().setDepth(3);
        const g = sprite.basketGfx;
        g.clear();
        const dir = facingRight ? 1 : -1;
        const bx = sprite.x - dir * 17, by = sprite.y - 12;
        for (let i = 0; i < Math.min(5, count); i++) {
            g.fillStyle(0xe53935, 1);
            g.fillCircle(bx - 8 + i * 4, by - 9 - (i % 2) * 3, 4);
        }
        g.fillStyle(0xa1887f, 1); g.fillRect(bx - 10, by - 8, 20, 15);
        g.lineStyle(1, 0x6d4c41, 1);
        g.lineBetween(bx - 10, by - 3, bx + 10, by - 3); g.lineBetween(bx - 10, by + 2, bx + 10, by + 2);
        for (let vx = bx - 6; vx <= bx + 6; vx += 6) g.lineBetween(vx, by - 8, vx, by + 7);
        g.lineStyle(2, 0x5d4037, 1); g.lineBetween(bx + dir * 6, by - 8, sprite.x + dir * 2, sprite.y - 20);
        if (showText) {
            if (!sprite.appleText) {
                sprite.appleText = scene.add.text(0, 0, '', { font: 'bold 12px Arial', fill: '#ffffff', stroke: '#b71c1c', strokeThickness: 3 })
                    .setOrigin(0.5).setDepth(1001);
            }
            sprite.appleText.setText(count + '/' + target).setPosition(sprite.x, sprite.y - sprite.displayHeight / 2 - 20);
        }
    }

    // OLMA SOCHILDI (qahramonlar bir-biriga tegdi): olmalar savatchadan otilib, yerga sakraydi
    function spillApples(scene, x, y, count) {
        for (let k = 0; k < Math.min(10, Math.max(3, count)); k++) {
            const a = scene.add.image(x, y - 14, 'apple_tex').setDepth(4).setScale(0.8);
            scene.tweens.add({
                targets: a, x: x + Phaser.Math.Between(-90, 90), y: 560, angle: Phaser.Math.Between(-360, 360),
                duration: Phaser.Math.Between(450, 750), ease: 'Bounce.Out',
                onComplete: () => scene.tweens.add({ targets: a, alpha: 0, delay: 300, duration: 400, onComplete: () => a.destroy() })
            });
        }
    }

    // DEVOR PORTLADI: tosh bo'laklari har tomonga uchadi, ekran silkinadi
    function destroyWall(scene, obj) {
        const { w } = obj;
        obj.rect.destroy(); // statik jism ham o'chadi - yo'l ochiladi
        obj.gfx.destroy();
        const pieces = Math.min(30, Math.max(8, Math.round((w.w * w.h) / 500)));
        for (let k = 0; k < pieces; k++) {
            const cx = w.x + Phaser.Math.Between(0, w.w);
            const cy = w.y + Phaser.Math.Between(0, w.h);
            const chunk = scene.add.rectangle(cx, cy, Phaser.Math.Between(8, 18), Phaser.Math.Between(6, 14), k % 3 ? 0x6f6a62 : 0x3f3b35).setDepth(7);
            scene.tweens.add({
                targets: chunk, x: cx + Phaser.Math.Between(-160, 160), y: Math.min(566, cy + Phaser.Math.Between(-120, 120)),
                angle: Phaser.Math.Between(-540, 540), alpha: 0, duration: Phaser.Math.Between(600, 1100), ease: 'Cubic.Out',
                onComplete: () => chunk.destroy()
            });
        }
        const cam = scene.cameras.main;
        if (w.x + w.w > cam.scrollX - 60 && w.x < cam.scrollX + 860) cam.shake(500, 0.02);
    }

    // ILON DEVORNI SINDIRIB CHIQADI: devor parchalanib uchadi, ekran qattiq silkinadi
    function breakIntroWall(scene) {
        const wx = map.chase.introWallX;
        introWall.destroy();
        introWall = null;
        for (let k = 0; k < 26; k++) {
            const by = Phaser.Math.Between(40, 560);
            const chunk = scene.add.rectangle(wx + 20, by, Phaser.Math.Between(10, 22), Phaser.Math.Between(8, 16), k % 3 ? 0x4a4a4a : 0x2b2b2b).setDepth(7);
            scene.tweens.add({
                targets: chunk, x: wx + Phaser.Math.Between(80, 420), y: Math.min(566, by + Phaser.Math.Between(-80, 160)),
                angle: Phaser.Math.Between(-540, 540), alpha: 0, duration: Phaser.Math.Between(700, 1200), ease: 'Cubic.Out',
                onComplete: () => chunk.destroy()
            });
        }
        scene.cameras.main.shake(700, 0.025);
    }

    // O'z qahramonimizga eng yaqin (olish masofasidagi) tanga - server ham
    // shu masofani (70px) tekshiradi
    function findNearestCoin() {
        if (!currentCharacter || !currentCharacter.active || currentCharacter.isDead) return null;
        let best = null, bestD = 62; // serverdagidan (70) sal kam - tanga tebranadi
        Object.values(coinSprites).forEach((s) => {
            const d = Math.hypot(s.x - currentCharacter.x, s.y - currentCharacter.y);
            if (d <= bestD) { bestD = d; best = s; }
        });
        return best;
    }

    // ===== PIKSEL HUD =====
    const PIXEL_FONT = '"Press Start 2P", "Courier New", monospace';
    const HUD_X = 10, HUD_Y = 10;
    const HP_BAR = { x: HUD_X + 32, y: HUD_Y + 12, w: 160, h: 12 };
    const ST_BAR = { x: HUD_X + 32, y: HUD_Y + 36, w: 160, h: 8 };

    function gridFromRows(rows, palette) {
        return rows.map(r => r.split('').map(ch => (ch === '.' ? null : palette[ch])));
    }
    function buildHudTextures(scene) {
        const make = (key, rows, pal) => {
            if (!scene.textures.exists(key)) gridToTexture(scene, key, gridOutline(gridFromRows(rows, pal), 0x000000), 2);
        };
        make('hud_heart', ['.RR...RR.', 'RWRR.RRRR', 'RWRRRRRRR', 'RRRRRRRRR', '.RRRRRRD.', '..RRRRD..', '...RRD...', '....D....'],
            { R: 0xe53935, W: 0xffcdd2, D: 0x9a1b1b });
        make('hud_bolt', ['...YYY', '..YYY.', '.YYY..', 'YYYYYO', '...YO.', '..YO..', '.YO...', '.O....'],
            { Y: 0xffd54f, O: 0xf57f17 });
        make('hud_sword', ['.......SS', '......SWS', '.....SWS.', '....SWS..', '.G.SWS...', '..GWS....', '..BG.....', '.B..G....', 'B........'],
            { S: 0xb0bec5, W: 0xeceff1, G: 0xffca28, B: 0x6d4c41 });
        make('hud_apple', ['....BLL.', '...B.LL.', '.RRRRRR.', 'RWRRRRRR', 'RWRRRRRR', 'RRRRRRRD', '.RRRRRD.', '..RRDD..'],
            { R: 0xe53935, W: 0xffcdd2, D: 0x9a1b1b, B: 0x5d4037, L: 0x66bb6a });
        make('hud_flag', ['PFFFFF..', 'PFFFFFF.', 'PFFFFFFF', 'PFFFFF..', 'P.......', 'P.......', 'P.......', 'PP......'],
            { F: 0x40c4ff, P: 0xcfd8dc });
    }

    // Piksel panel: qora kontur, burchaklari "kesilgan", ichida to'q binafsha-ko'k fon
    function drawHudPanel(g, x, y, w, h) {
        g.clear();
        g.fillStyle(0x000000, 1); g.fillRect(x + 2, y, w - 4, h); g.fillRect(x, y + 2, w, h - 4);
        g.fillStyle(0x4b4870, 1); g.fillRect(x + 4, y + 2, w - 8, h - 4); g.fillRect(x + 2, y + 4, w - 4, h - 8);
        g.fillStyle(0x191827, 1); g.fillRect(x + 4, y + 4, w - 8, h - 8);
        g.fillStyle(0x2c2a44, 1); g.fillRect(x + 4, y + 4, w - 8, 2);
    }

    // Piksel chiziq: qora ramka, bo'sh qismi to'q, to'la qismi - yuqorida yorug',
    // pastda soya qatori, har 10% da bo'linma (segment)
    function drawPixelBar(g, bar, frac, pal, segments) {
        const { x, y, w, h } = bar;
        g.fillStyle(0x000000, 1); g.fillRect(x - 2, y - 2, w + 4, h + 4);
        g.fillStyle(pal.empty, 1); g.fillRect(x, y, w, h);
        const fw = Math.round((w * Math.max(0, Math.min(1, frac))) / 2) * 2;
        if (fw > 0) {
            g.fillStyle(pal.fill, 1); g.fillRect(x, y, fw, h);
            g.fillStyle(pal.light, 1); g.fillRect(x, y, fw, 2);
            g.fillStyle(pal.dark, 1); g.fillRect(x, y + h - 2, fw, 2);
        }
        g.fillStyle(0x000000, 0.45);
        for (let i = 1; i < segments; i++) g.fillRect(x + Math.round((w * i) / segments), y, 2, h);
    }
    const hpPalette = (frac) => frac > 0.6
        ? { fill: 0x43d15f, light: 0xa5f2b0, dark: 0x1f7a33, empty: 0x2b0f14 }
        : frac > 0.3
            ? { fill: 0xffb300, light: 0xffe082, dark: 0xb26a00, empty: 0x2b0f14 }
            : { fill: 0xe53935, light: 0xff8a80, dark: 0x8e1b1b, empty: 0x2b0f14 };
    const STAMINA_PALETTE = { fill: 0xffc93c, light: 0xfff1a8, dark: 0xb7791f, empty: 0x2b2410 };

    // O'ZINING HP, STAMINA VA MAQSAD HUD PANELI (piksel uslubda): ekran chetida, sobit joyda
    // HUD'ning 4-qatori: Q (joriy qurol) va R (maxsus qobiliyat, tayyor yoki qolgan soniya)
    function perkHudText() {
        const c = currentCharacter;
        if (!c) return '';
        const parts = [];
        const alt = ALT_WEAPON_PERK[c.characterType];
        if (alt && hasPerkClient(c.characterType, c.level, alt)) {
            const names = { ice: ['hud_q_fire', 'hud_q_ice'], shotgun: ['hud_q_sword', 'hud_q_shotgun'], kunai: ['hud_q_katana', 'hud_q_kunai'] }[alt];
            let q = '[Q] ' + t(names[c.weaponMode === 'alt' ? 1 : 0]);
            // Drobovik: magazindagi o'qlar yoki qayta o'qlanish
            if (alt === 'shotgun' && c.weaponMode === 'alt') q += ' ' + (c.reloading ? t('hud_reload') : c.ammo + '/' + c.maxAmmo);
            parts.push(q);
        }
        const sp = SPECIAL_PERK[c.characterType];
        if (sp && hasPerkClient(c.characterType, c.level, sp)) {
            parts.push('[R] ' + t('hud_r_' + sp) + ' ' + (c.special ? '!!' : c.specialCd > 0 ? c.specialCd + 's' : t('hud_r_ready')));
        }
        return parts.join('   ');
    }

    function drawHUD(scene, hp, stamina, progressText, perkText = '') {
        if (!scene.hud) {
            buildHudTextures(scene);
            const fixed = (o, d) => o.setScrollFactor(0).setDepth(d);
            const textStyle = (size, color) => ({ fontFamily: PIXEL_FONT, fontSize: size + 'px', color, stroke: '#000000', strokeThickness: 3 });
            scene.hud = {
                panel: fixed(scene.add.graphics(), 998),
                bars: fixed(scene.add.graphics(), 1000),
                heart: fixed(scene.add.image(HUD_X + 16, HUD_Y + 18, 'hud_heart'), 1001),
                bolt: fixed(scene.add.image(HUD_X + 16, HUD_Y + 40, 'hud_bolt'), 1001),
                objIcon: fixed(scene.add.image(HUD_X + 16, HUD_Y + 64, isApples ? 'hud_apple' : (isChase || isStory) ? 'hud_flag' : 'hud_sword'), 1001),
                hpText: fixed(scene.add.text(HP_BAR.x + HP_BAR.w + 10, HUD_Y + 18, '', textStyle(10, '#ffffff')).setOrigin(0, 0.5), 1001),
                objText: fixed(scene.add.text(HUD_X + 30, HUD_Y + 64, '', textStyle(8, '#7df9ff')).setOrigin(0, 0.5), 1001),
                perkText: fixed(scene.add.text(HUD_X + 12, HUD_Y + 86, '', textStyle(8, '#ffca28')).setOrigin(0, 0.5), 1001),
                panelW: 0, panelH: 0, lastHp: null, lastSt: null
            };
        }
        const H = scene.hud;
        const safeHp = Math.max(0, Math.min(100, hp));
        const safeSt = Math.max(0, Math.min(100, stamina === undefined ? 100 : stamina));

        if (H.objText.text !== progressText) H.objText.setText(progressText);
        if (H.perkText.text !== perkText) H.perkText.setText(perkText);
        // Yuqoriga yaxlitlanadi: tirik qahramonda hech qachon "0" ko'rinmaydi
        const hpLabel = String(Math.ceil(safeHp));
        if (H.hpText.text !== hpLabel) H.hpText.setText(hpLabel);

        // Panel eni matnga moslashadi (faqat o'zgarganda qayta chiziladi)
        const panelW = Math.max(240, 30 + H.objText.width + 16, 12 + H.perkText.width + 16, HP_BAR.x - HUD_X + HP_BAR.w + 16 + H.hpText.width);
        const panelH = perkText ? 100 : 82;
        if (panelW !== H.panelW || panelH !== H.panelH) {
            H.panelW = panelW;
            H.panelH = panelH;
            drawHudPanel(H.panel, HUD_X, HUD_Y, panelW, panelH);
        }

        if (safeHp !== H.lastHp || safeSt !== H.lastSt) {
            H.lastHp = safeHp; H.lastSt = safeSt;
            H.bars.clear();
            drawPixelBar(H.bars, HP_BAR, safeHp / 100, hpPalette(safeHp / 100), 10);
            drawPixelBar(H.bars, ST_BAR, safeSt / 100, STAMINA_PALETTE, 10);
        }

        // Jon kam qolganda yurakcha lipillaydi
        H.heart.setAlpha(safeHp > 0 && safeHp < 30 && Math.floor(scene.time.now / 250) % 2 ? 0.35 : 1);
        // Kalit (elf qishlog'ida) - panelning o'ng tomonida
        if (hudKey) hudKey.setPosition(HUD_X + panelW + 8, HUD_Y + 64);
    }

    function create() {
        // XARITA/KAMERA CHEGARALARI: agar xarita ekrandan kengroq bo'lsa (mapWidth > 800),
        // dunyo va kamera chegaralari shunga mos kengaytiriladi (kamera keyinroq,
        // o'yinchi yaratilganda uni kuzatib borishni boshlaydi)
        this.physics.world.setBounds(0, 0, mapWidth, 600);
        this.cameras.main.setBounds(0, 0, mapWidth, 600);

        // Xarita nomini/rangini ekranning yuqori o'ng burchagida ko'rsatamiz (joriy tilda)
        const mapDisplayName = (map.id !== undefined) ? tMapName(map.id) : map.name;
        if (mapDisplayName) {
            const nameText = this.add.text(778, 21, mapDisplayName, {
                fontFamily: PIXEL_FONT, fontSize: '10px',
                color: '#' + (map.accentColor || 0x00ffcc).toString(16).padStart(6, '0'),
                stroke: '#000000', strokeThickness: 3
            }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(1000);
            // HUD bilan bir xil piksel panel ichida
            const w = Math.round(nameText.width) + 20;
            drawHudPanel(this.add.graphics().setScrollFactor(0).setDepth(998), 790 - w, 8, w, 26);
        }

        // Klaviatura tugmalarini eshitish
        cursors = this.input.keyboard.createCursorKeys();

        // Yerni va joriy xaritaning qo'shimcha platformalarini chizish
        // BOTLAR ham jismoniy to'siq: o'yinchi ularning ichidan o'tib ketmaydi
        // (ustidan sakrab o'tishi kerak). Pozitsiyani server boshqaradi, shuning
        // uchun gravitatsiyasiz va "qo'zg'almas" - o'yinchini itarmaydi, faqat to'sadi
        botGroup = this.physics.add.group({ allowGravity: false, immovable: true });

        platforms = this.physics.add.staticGroup();
        // YER: jarliklar (pits) orasidagi bo'laklardan quriladi - jarlikka tushgan
        // qahramonni server halok qiladi
        const pits = (map.pits || []).slice().sort((a, b) => a.x - b.x);
        let segStart = 0;
        [...pits, { x: mapWidth, w: 0 }].forEach((pit) => {
            const segEnd = Math.min(pit.x, mapWidth);
            if (segEnd > segStart) {
                const seg = this.add.rectangle((segStart + segEnd) / 2, 585, segEnd - segStart, 30, map.groundColor || 0x333333);
                platforms.add(seg);
            }
            segStart = Math.max(segStart, pit.x + pit.w);
        });
        const pitGfx = this.add.graphics().setDepth(1);
        pits.forEach((pit) => {
            pitGfx.fillStyle(0x000000, 1);
            pitGfx.fillRect(pit.x, 570, pit.w, 30);
            pitGfx.fillStyle(0xff3d00, 0.35);
            for (let sx = pit.x + 4; sx < pit.x + pit.w - 4; sx += 14) {
                pitGfx.fillTriangle(sx, 600, sx + 7, 584, sx + 14, 600);
            }
        });

        (map.platforms || []).forEach((p) => {
            const plat = this.add.rectangle(p.x + p.w / 2, p.y + p.h / 2, p.w, p.h, map.groundColor || 0x333333);
            plat.setStrokeStyle(2, map.accentColor || 0x00ffcc, 0.6);
            platforms.add(plat);
            // Bozorda: devor/taxtalar o'z piksel rasmi bilan chiziladi; taxtalar bir tomonlama
            // (pastdan sakrab o'tib, ustiga qo'nish mumkin)
            if (isMarket || isForest) {
                plat.setVisible(false);
                if (p.h <= 14) makeOneWay(plat);
            }
        });

        // DEVORLAR (to'siqlar): platformadek qattiq, lekin tosh-g'isht ko'rinishida
        // Har devor alohida saqlanadi - tagidagi mina portlasa, devor ham portlab yo'qoladi
        (map.walls || []).forEach((w) => {
            const wallRect = this.add.rectangle(w.x + w.w / 2, w.y + w.h / 2, w.w, w.h, 0x6f6a62);
            wallRect.setStrokeStyle(3, 0x2f2c28, 1);
            platforms.add(wallRect);
            const wallGfx = this.add.graphics().setDepth(1);
            wallGfx.lineStyle(1, 0x3f3b35, 0.8);
            for (let by = w.y + 18; by < w.y + w.h; by += 18) {
                wallGfx.lineBetween(w.x + 2, by, w.x + w.w - 2, by);
                const off = ((by - w.y) / 18) % 2 === 0 ? w.w / 2 : w.w / 4;
                wallGfx.lineBetween(w.x + off, by - 18, w.x + off, by);
            }
            wallObjs[w.id] = { rect: wallRect, gfx: wallGfx, w };
        });

        // QUTILAR: qattiq (ustiga chiqish/ortida to'xtab qolish mumkin), zarba
        // bilan sindiriladi - ro'yxatini server yuboradi (gameStateUpdate)
        if (!this.textures.exists('crate_tex')) {
            const g = this.add.graphics();
            g.fillStyle(0xa9713a, 1);
            g.fillRect(0, 0, 36, 36);
            g.lineStyle(3, 0x5b3413, 1);
            g.strokeRect(1.5, 1.5, 33, 33);
            g.lineStyle(2, 0x7a4a1e, 1);
            g.lineBetween(4, 12, 32, 12);
            g.lineBetween(4, 24, 32, 24);
            g.lineStyle(3, 0x5b3413, 1);
            g.lineBetween(4, 4, 32, 32);
            g.generateTexture('crate_tex', 36, 36);
            g.destroy();
        }
        crateGroup = this.physics.add.staticGroup();

        // TANGA va MINA teksturalari
        if (!this.textures.exists('coin_tex')) {
            const g = this.add.graphics();
            g.fillStyle(0xb8860b, 1); g.fillCircle(10, 10, 10);
            g.fillStyle(0xffcc00, 1); g.fillCircle(10, 10, 8);
            g.fillStyle(0xfff176, 1); g.fillRect(8, 4, 4, 12);
            g.generateTexture('coin_tex', 20, 20);
            g.destroy();
        }
        if (!this.textures.exists('mine_tex')) {
            const g = this.add.graphics();
            g.fillStyle(0x263238, 1); g.fillEllipse(12, 10, 24, 14);
            g.fillStyle(0x455a64, 1); g.fillRect(2, 10, 20, 4);
            g.fillStyle(0x90a4ae, 1); g.fillRect(10, 0, 4, 5);
            g.generateTexture('mine_tex', 24, 14);
            g.destroy();
        }
        if (!this.textures.exists('apple_tex')) {
            // MEGA OLMA: katta qizil olma, yaltiroq dog', band va barg
            const g = this.add.graphics();
            g.fillStyle(0xc62828, 1); g.fillCircle(12, 15, 11);
            g.fillStyle(0xe53935, 1); g.fillCircle(11, 14, 9);
            g.fillStyle(0xffffff, 0.55); g.fillCircle(8, 11, 3);
            g.fillStyle(0x5d4037, 1); g.fillRect(11, 1, 2, 6);
            g.fillStyle(0x43a047, 1); g.fillEllipse(17, 4, 9, 5);
            g.generateTexture('apple_tex', 24, 26);
            g.destroy();
        }
        if (!this.textures.exists('mine_wall_tex')) {
            // Qizil dinamit tayoqchalari + qora bog'ich
            const g = this.add.graphics();
            g.fillStyle(0xd32f2f, 1);
            g.fillRect(1, 2, 6, 12); g.fillRect(9, 2, 6, 12); g.fillRect(17, 2, 6, 12);
            g.fillStyle(0x212121, 1); g.fillRect(0, 7, 24, 3);
            g.fillStyle(0xffeb3b, 1); g.fillRect(11, 0, 2, 3);
            g.generateTexture('mine_wall_tex', 24, 14);
            g.destroy();
        }

        // ILON QUVISHI: boshidagi devor (ilon uni sindirib chiqadi), CHEKPOINT -
        // ko'k yorug'likli maydoncha, va ilonni chizadigan qatlam
        if (isChase) {
            const wx = map.chase.introWallX;
            introWall = this.add.graphics().setDepth(6);
            introWall.fillStyle(0x4a4a4a, 1);
            introWall.fillRect(wx, 0, 40, 570);
            introWall.lineStyle(2, 0x222222, 1);
            for (let by = 20; by < 570; by += 20) {
                introWall.lineBetween(wx, by, wx + 40, by);
                introWall.lineBetween(wx + ((by / 20) % 2 ? 20 : 10), by - 20, wx + ((by / 20) % 2 ? 20 : 10), by);
            }

            const pad = map.chase.pad;
            drawCheckpointPad(this, pad);
            // Maydoncha ustidagi ESHIK - keyingi xarita (elf qishlog'i) shu eshikdan boshlanadi
            makeDoor(this, pad.x + pad.w - 34, pad.y);

            snakeGfx = this.add.graphics().setDepth(5);
        }

        // ELF QISHLOG'I (PIKSEL USLUBDA): pog'onali osmon, piksel bulutlar va tog'lar,
        // suzib yuruvchi uchar toshlar, bahaybat piksel daraxt, tepasida havorang elf,
        // o'ngda KATTA DEVOR va uning katta eshigi; chapda - kirish eshigi (yopilib yo'qoladi)
        if (isApples) {
            const A = map.apples;
            buildPixelTextures(this);
            drawPixelBackdrop(this);
            [[110, 130, 'px_rock_big'], [630, 95, 'px_rock_mid'], [600, 290, 'px_rock_small'], [80, 320, 'px_rock_small'], [175, 245, 'px_rock_tiny']]
                .forEach(([rx, ry, key], i) => {
                    const rock = this.add.image(rx, ry, key).setDepth(-2);
                    this.tweens.add({ targets: rock, y: ry - 7, duration: 1700 + i * 350, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
                });
            this.add.image(400, 574, 'px_tree').setOrigin(0.5, 1).setDepth(-1);
            elfSprite = this.add.image(400, 171, 'px_elf_idle').setOrigin(0.5, 1).setDepth(2);
            appleMarkerGfx = this.add.graphics().setDepth(2);

            // Piksel yer, supachalar va katta devor (fizika - oddiy platformalar, ustiga piksel naqsh)
            this.add.tileSprite(0, 570, 800, 30, 'px_grass').setOrigin(0, 0).setDepth(1);
            (map.platforms || []).forEach((p) => {
                const isWall = p.x === A.bigWall.x && p.w === A.bigWall.w;
                this.add.tileSprite(p.x, p.y, p.w, p.h, isWall ? 'px_brick' : 'px_ledge').setOrigin(0, 0).setDepth(1);
            });
            const W = A.bigWall;
            bigDoor = this.add.image(W.x + 2, 570, 'px_door_closed').setOrigin(0, 1).setDepth(2);

            // Kirish eshigi: qahramonlar undan chiqadi, keyin yopilib yo'qoladi
            const door = makeDoor(this, A.doorX, 570);
            this.time.delayedCall(1600, () => {
                this.tweens.add({ targets: door.closed, alpha: 1, duration: 350 });
                this.tweens.add({ targets: door.open, alpha: 0, duration: 350 });
                this.time.delayedCall(900, () => {
                    this.tweens.add({ targets: [door.closed, door.open], alpha: 0, duration: 700,
                        onComplete: () => { door.closed.destroy(); door.open.destroy(); } });
                });
            });

            // ELF BILAN TANISHUV (Undertale uslubidagi dialog, E - keyingi gap).
            // Hamma o'qib bo'lgach, server olma otishni boshlaydi
            this.time.delayedCall(900, () => {
                startDialog(this, [t('elf_d1'), t('elf_d2'), t('elf_d3'), t('elf_d4')], () => {
                    socket.emit('dialogDone', roomId);
                });
            });
        }

        // ELFLAR BOZORI (piksel): quyosh botishi, shahar silueti, bayroqchalar, uchta rasta
        // (meva, mato, baliq), rastalarda elflar; chapdagi eshikdan kirib kelishadi
        if (isMarket) {
            buildMarketScene(this);
            if (isBoss) snakeGfx = this.add.graphics().setDepth(5);
        }
        if (isForest) buildForestScene(this);
        if (isStones) buildStonesScene(this);
        if (isGorilla) buildGorillaScene(this);
        if (isStory) {
            talkHint = this.add.text(map.story.sellerX, 452, '[E]', {
                fontFamily: PIXEL_FONT, fontSize: '10px', color: '#ffeb3b', stroke: '#000000', strokeThickness: 3
            }).setOrigin(0.5, 1).setDepth(1003).setVisible(false);
            this.tweens.add({ targets: talkHint, y: 446, duration: 450, yoyo: true, repeat: -1 });
        }

        // --- BARCHA O'Q VA QILICH TEKSTURALARINI 1 MARTA YARATIB OLISh ---
        // 1. Ritsar qilich zarbasi: to'g'ri, kulrang tig' + sariq gard (tutqich)
        // Qilich/katana zarbasi izi: oldinga qaragan yarim oy (ritsarda keng, samurayda ingichka)
        const slashGrid = (w, h, thick) => {
            const g = gridNew(w, h);
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
                const nx = x / (w - 1), ny = (y - (h - 1) / 2) / ((h - 1) / 2);
                const outer = nx <= Math.sqrt(Math.max(0, 1 - ny * ny));
                const inner = nx <= Math.sqrt(Math.max(0, 1 - ny * ny)) - thick;
                if (outer && !inner) g[y][x] = nx > 0.75 ? 0xffffff : 0xe3f2fd;
            }
            return g;
        };
        if (!this.textures.exists('melee_knight')) gridToTexture(this, 'melee_knight', slashGrid(14, 26, 0.4), 2);
        if (!this.textures.exists('melee_samurai')) gridToTexture(this, 'melee_samurai', slashGrid(16, 22, 0.25), 2);
        // 3. Kamon o'qi: cho'zilgan strela - yog'och tanasi + metall uchi + pat (fletching)
        if (!this.textures.exists('projectile_arrow')) {
            let g = this.add.graphics();
            // Yog'ochsimon tanasi (jigarrang, cho'zilgan)
            g.fillStyle(0x8b5a2b, 1);
            g.fillRect(6, 7, 28, 3);
            // Old tomonidagi metall uchi (uchburchak)
            g.fillStyle(0xdddddd, 1);
            g.fillTriangle(32, 3.5, 32, 13.5, 42, 8.5);
            // Orqadagi patlar (fletching)
            g.fillStyle(0xdd3333, 1);
            g.fillTriangle(2, 8.5, 10, 2, 10, 8.5);
            g.fillTriangle(2, 8.5, 10, 15, 10, 8.5);
            g.generateTexture('projectile_arrow', 42, 17); g.destroy();
        }
        // 4. Sehrgar olovli shari: qatlamli doiralar bilan porlab turgan olov effekti
        if (!this.textures.exists('projectile_fireball')) {
            let g = this.add.graphics();
            const cx = 13, cy = 13;
            g.fillStyle(0xff6600, 0.35);
            g.fillCircle(cx, cy, 13); // Tashqi shaffof porlash
            g.fillStyle(0xff4500, 0.95);
            g.fillCircle(cx, cy, 8.5); // O'rta olov qatlami
            g.fillStyle(0xffcc00, 1);
            g.fillCircle(cx, cy, 4.5); // Ichki yorqin yadro
            g.generateTexture('projectile_fireball', 26, 26); g.destroy();
        }
        // 4b. Kunai (samurai 15-daraja): kulrang tig', qora dasta, qizil halqa
        if (!this.textures.exists('projectile_kunai')) {
            let g = this.add.graphics();
            g.fillStyle(0x1a1a1a, 1); g.fillRect(0, 4, 10, 4);
            g.fillStyle(0xc62828, 1); g.fillRect(0, 3, 3, 6);
            g.fillStyle(0xcfd8dc, 1); g.fillTriangle(10, 1, 26, 6, 10, 11);
            g.fillStyle(0xffffff, 1); g.fillRect(12, 5, 10, 1);
            g.generateTexture('projectile_kunai', 26, 12); g.destroy();
        }
        // 5. Standart o'q (Agar kerak bo'lib qolsa)
        if (!this.textures.exists('projectile_normal')) {
            let g = this.add.graphics();
            g.fillStyle(0xffffff, 1); g.fillRect(0, 0, 8, 8);
            g.generateTexture('projectile_normal', 8, 8); g.destroy();
        }
        // Serverdan javob kelganda qahramonni yaratish
        // DIQQAT: socket har raundda saqlanib qoladi, shuning uchun eski
        // listenerni birinchi tozalab, keyin qayta ro'yxatdan o'tkazamiz
        // (aks holda ikkinchi raunddan boshlab bir xabar 2 marta ishlab ketadi)
        socket.off('initPlayer');
        socket.on('initPlayer', (data) => {
            if (currentCharacter) return; // Agar allaqachon yaratilgan bo'lsa, qayta yaratma

            const textureKey = `char_${data.characterType}_${data.color}`;
            createPlayerTexture(this, textureKey, data.color, 32);

            currentCharacter = this.physics.add.sprite(data.x, data.y, textureKey).setDepth(3);
            currentCharacter.setCollideWorldBounds(true);
            this.physics.add.collider(currentCharacter, platforms);
            // Arvoh (o'lgan) o'yinchi botlar orasidan erkin o'tadi
            this.physics.add.collider(currentCharacter, botGroup, null, () => !currentCharacter.isDead);
            currentCharacter.hp = data.hp || 100;
            currentCharacter.characterType = data.characterType;
            currentCharacter.nickname = data.nickname;
            currentCharacter.kills = data.kills || 0;
            currentCharacter.killsToWin = data.killsToWin;

            this.physics.add.collider(currentCharacter, crateGroup);
            if (stoneGroup) this.physics.add.collider(currentCharacter, stoneGroup);
            if (gPlatGroup) this.physics.add.collider(currentCharacter, gPlatGroup);

            // XARITA EKRANDAN KENGROQ BO'LSA: kamera o'yinchini kuzatib boradi
            // (ilon quvishida esa kamerani ilon suradi - update() ichida)
            if (mapWidth > 800 && !isChase && !isBoss) {
                this.cameras.main.startFollow(currentCharacter, true, 0.12, 0.12);
            }

            console.log("Qahramon muvaffaqiyatli yaratildi va harakatga tayyor:", currentCharacter);
        });

        // E - yaqindagi tangani olish (server masofani qayta tekshiradi)
        this.input.keyboard.on('keydown-E', () => {
            // 1) Dialog ochiq bo'lsa - keyingi gap
            if (dialog) { advanceDialog(); return; }
            // 2) Katta eshik oldida: kalit (12 ta olma) bo'lsa - ochadi, bo'lmasa "qulflangan"
            if (isApples && currentCharacter && !currentCharacter.isDead &&
                currentCharacter.x >= map.apples.bigWall.x - 40) {
                if (myApples >= map.apples.applesToCollect) socket.emit('useBigDoor', roomId);
                else startDialog(this, [t('door_locked')]);
                return;
            }
            // 3) Bozorda sotuvchi yonida - suhbatni boshlash (hamma uchun umumiy sahna)
            if (isStory && !cutsceneStarted && currentCharacter && !currentCharacter.isDead &&
                Math.abs(currentCharacter.x - map.story.sellerX) <= map.story.talkRange) {
                socket.emit('talkToSeller', roomId);
                return;
            }
            // 4) Yaqindagi tanga
            const coin = findNearestCoin();
            if (coin) socket.emit('pickupCoin', { roomId: roomId, coinId: coin.coinId });
        });

        // XARITALAR ULANGAN: oldingi xarita o'tilib, shu xaritaga avtomatik
        // o'tilgan bo'lsa - ekran o'rtasida qisqa e'lon
        if (continued) {
            const banner = this.add.text(400, 170,
                continued.winnerNickname + (continued.coinsAwarded > 0 ? '  +' + continued.coinsAwarded : ''), {
                    font: 'bold 26px Arial', fill: '#00ffcc', align: 'center', stroke: '#000000', strokeThickness: 5
                }).setOrigin(0.5).setScrollFactor(0).setDepth(1004);
            banner.setAlpha(0);
            // To'liq ekranli "xarita o'tildi" tantanasi tugagach ko'rinadi
            this.tweens.add({ targets: banner, alpha: 1, delay: 3300, duration: 300 });
            this.tweens.add({ targets: banner, alpha: 0, delay: 5300, duration: 800, onComplete: () => banner.destroy() });
        }

        // QUTI SINDIRGANDA: qahramon tepasida "+10" tanga yozuvi suzib chiqadi
        window.onCoinsGained = (amount) => {
            if (!currentCharacter || !currentCharacter.active) return;
            const txt = this.add.text(currentCharacter.x, currentCharacter.y - 40, '+' + amount, {
                font: 'bold 18px Arial', fill: '#ffcc00', stroke: '#000000', strokeThickness: 4
            }).setOrigin(0.5).setDepth(1003);
            const coin = this.add.circle(txt.x - txt.width / 2 - 10, txt.y, 7, 0xffcc00).setStrokeStyle(2, 0xb8860b).setDepth(1003);
            this.tweens.add({
                targets: [txt, coin], y: '-=40', alpha: 0, duration: 1000,
                onComplete: () => { txt.destroy(); coin.destroy(); }
            });
        };

        // DIQQAT: Phaser to'liq yuklanib bo'ldi, endi serverdan o'yinchimizni so'raymiz!
        socket.emit('playerReadyInRoom', roomId);

        // SHIFT: barcha personajlar uchun umumiy - bosib turilgancha qobiliyat faol,
        // stamina ketaveradi; qo'yib yuborilsa effekt tugaydi va biroz kutib tiklanadi
        this.input.keyboard.on('keydown-SHIFT', () => {
            if (!currentCharacter) return;
            socket.emit('startAbilityInRoom', roomId);
        });
        this.input.keyboard.on('keyup-SHIFT', () => {
            if (!currentCharacter) return;
            socket.emit('stopAbilityInRoom', roomId);
        });
        // Xavfsizlik: brauzer tabidan chiqib ketilsa ham effekt "yopishib qolmasin"
        window.onblur = () => {
            if (currentCharacter) socket.emit('stopAbilityInRoom', roomId);
        };

        // ENTER: bosib turilgancha avtomatik hujum qiladi, stamina ketaveradi
        this.input.keyboard.on('keydown-ENTER', () => {
            if (!currentCharacter) return;
            let angle = (lastDirection === 'right') ? 0 : Math.PI;
            socket.emit('startAttackInRoom', { roomId: roomId, angle: angle });
        });
        this.input.keyboard.on('keyup-ENTER', () => {
            if (!currentCharacter) return;
            socket.emit('stopAttackInRoom', roomId);
        });

        // SICHQONCHA: bosib turilgancha avtomatik hujum qiladi
        this.input.on('pointerdown', () => {
            if (!currentCharacter) return;
            let angle = (lastDirection === 'right') ? 0 : Math.PI;
            socket.emit('startAttackInRoom', { roomId: roomId, angle: angle });
        });
        this.input.on('pointerup', () => {
            if (!currentCharacter) return;
            socket.emit('stopAttackInRoom', roomId);
        });

        // PHONE REJIMI: ekrandagi virtual tugmalar (chapga/o'ngga/sakrash/qobiliyat).
        // `on...` xossasiga to'g'ridan-to'g'ri yozish avvalgi ulanishni almashtiradi,
        // shuning uchun har raund `roomId`/`socket`ni "eskirib qolgan" holda ushlab
        // qolmaydi - har safar joriy yopishuv (closure) bilan qayta yoziladi.
        const bindTouchBtn = (id, onDown, onUp) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.onpointerdown = (e) => { e.preventDefault(); onDown(); };
            el.onpointerup = (e) => { e.preventDefault(); onUp(); };
            el.onpointercancel = (e) => { onUp(); };
            el.onpointerleave = (e) => { onUp(); };
        };
        bindTouchBtn('touch-left-btn', () => { touchState.left = true; }, () => { touchState.left = false; });
        bindTouchBtn('touch-right-btn', () => { touchState.right = true; }, () => { touchState.right = false; });
        bindTouchBtn('touch-jump-btn', () => { touchState.jump = true; }, () => { touchState.jump = false; });
        bindTouchBtn('touch-ability-btn',
            () => { if (currentCharacter) socket.emit('startAbilityInRoom', roomId); },
            () => { if (currentCharacter) socket.emit('stopAbilityInRoom', roomId); }
        );

        // DARAJA IMKONIYATLARI: Q - ikkinchi qurol (almashtirish/qaytarish), R - maxsus qobiliyat
        this.input.keyboard.on('keydown-Q', () => {
            if (!currentCharacter || dialog || currentCharacter.isDead) return;
            socket.emit('toggleWeapon', roomId);
        });
        this.input.keyboard.on('keydown-R', () => {
            if (!currentCharacter || dialog || currentCharacter.isDead) return;
            socket.emit('useSpecial', roomId);
        });

        // EMOTSIYA: "1" (yoki raqamli klaviaturadagi 1) - xonadagi hammaga ko'rinadi
        const sendEmote = () => {
            if (!currentCharacter || dialog || this.time.now - lastEmoteAt < 1500) return;
            lastEmoteAt = this.time.now;
            socket.emit('emote', { roomId: roomId, id: 1 });
        };
        this.input.keyboard.on('keydown-ONE', sendEmote);
        this.input.keyboard.on('keydown-NUMPAD_ONE', sendEmote);
        socket.off('emote');
        socket.on('emote', (d) => {
            if (!this.textures.exists('emote_' + d.id)) return;
            // Shu qahramonning oldingi emotsiyasi bo'lsa - almashtiriladi
            emotes.filter(e => e.playerId === d.playerId).forEach(e => e.img.destroy());
            emotes = emotes.filter(e => e.playerId !== d.playerId);
            // Darhol egasining boshi ustida paydo bo'ladi (keyin update() u bilan birga yurgizadi)
            const owner = d.playerId === socket.id ? currentCharacter : otherPlayers[d.playerId];
            const img = this.add.image(owner ? owner.x : 0, owner ? owner.y - 62 : 0, 'emote_' + d.id).setDepth(1005).setScale(0);
            const size = 56 / Math.max(img.width, img.height);
            const e = { img, playerId: d.playerId };
            emotes.push(e);
            this.tweens.add({ targets: img, scale: size, duration: 180, ease: 'Back.Out' });
            this.tweens.add({ targets: img, y: '-=0', alpha: 0, delay: 1900, duration: 300, onComplete: () => {
                img.destroy();
                emotes = emotes.filter(x => x !== e);
            } });
        });

        // GORILLA ITARDI / YERDAN TOSH OTILDI: qahramon shu tezlik bilan uchib ketadi
        socket.off('knockback');
        socket.on('knockback', (d) => {
            if (!currentCharacter || !currentCharacter.body) return;
            currentCharacter.setVelocity(d.vx, d.vy);
            stunUntil = this.time.now + 380;
        });

        // SUHBAT SAHNASI: server hozirgi qatorni yuboradi - hamma bir xil qatorni ko'radi
        socket.off('cutscene');
        socket.on('cutscene', (data) => {
            if (!isStory) return;
            cutsceneStarted = true;
            if (talkHint) talkHint.setVisible(false);
            if (!dialog) {
                startDialog(this, marketScript(), null, {
                    remote: () => socket.emit('cutsceneAdvance', roomId),
                    startAt: data.line,
                    elfFace: 'px_seller_face',
                    elfName: t('seller_name')
                });
            } else {
                gotoDialogLine(data.line);
            }
        });

        // SERVERDAN DUNYO YANGILANISHINI ESHITISH
        socket.off('gameStateUpdate');
        socket.on('gameStateUpdate', (data) => {
            const serverPlayers = data.players;
            const serverBots = data.bots || [];
            const serverBullets = data.bullets || [];

            if (data.snake) {
                snakeServerX = data.snake.x;
                if (snakeDisplayX === null) snakeDisplayX = snakeServerX;
            }
            botsKilled = data.botsKilled || 0;

            // ROBOT-ILON JANGI: devor buzilishi, rastalar ezilishi, o'lim - bir marta effekt
            if (isBoss && data.boss) {
                bossState = data.boss;
                if (bossState.wallBroken && !bossFx.wall) { bossFx.wall = true; breakMarketWall(this); }
                if (bossState.dead && !bossFx.dead) { bossFx.dead = true; bossDeathAnim(this); }
                const fl = data.flyingMines || [];
                const ids = new Set(fl.map(f => f.id));
                fl.forEach((f) => {
                    let sp = flyingMineSprites[f.id];
                    if (!sp) sp = flyingMineSprites[f.id] = this.add.image(f.x, f.y, 'mine_tex').setDepth(4);
                    sp.tx = f.x; sp.ty = f.y;
                });
                const landedIds = new Set((data.mines || []).map(m => m.id));
                Object.keys(flyingMineSprites).forEach((id) => {
                    if (ids.has(id)) return;
                    // Yerga/tomga qo'nmagan bo'lsa - havoda kimgadir urilib portladi
                    const fs = flyingMineSprites[id];
                    if (!landedIds.has(id)) explodeMine(this, fs.tx, fs.ty);
                    flyingMineSprites[id].destroy();
                    delete flyingMineSprites[id];
                });
            }
            checkpointReached = data.checkpointReached || [];

            // TOSH GORILLA: holat, platformalar, yerdan chiqadigan va tepadan tushadigan toshlar
            if (isGorilla && data.gorilla) {
                const prev = gorillaState ? gorillaState.state : null;
                gorillaState = data.gorilla;
                if (prev !== gorillaState.state) gorillaFx(this, prev, gorillaState);
                // JANG OLDIDAN SUHBAT va YENGILGANDAN KEYINGI so'nggi gap (o'qib bo'lgach - serverga xabar)
                const talkOpts = { elfName: t('gorilla_speaker'), voice: 'deep' };
                if (gorillaState.state === 'intro' && !gTalk.intro && currentCharacter) {
                    gTalk.intro = true;
                    startDialog(this, [
                        { who: 'elf', text: t('gor_intro_1'), fx: 'shake' },
                        { who: 'player', text: t('gor_intro_2') }
                    ], () => socket.emit('dialogDone', roomId), { ...talkOpts, elfFace: 'px_gor_face' });
                }
                if (gorillaState.state === 'defeat' && !gTalk.outro) {
                    gTalk.outro = true;
                    startDialog(this, [{ who: 'elf', text: t('gor_outro_1'), fx: 'shake' }],
                        () => socket.emit('dialogDone', roomId), { ...talkOpts, elfFace: 'px_gor_face_sad' });
                }
                (data.gPlats || []).forEach((st) => {
                    const sp = gPlatSprites[st.id];
                    if (!sp || sp.state === 'fallen') return;
                    if (st.state === 'hold' && sp.state !== 'hold') {
                        this.cameras.main.shake(300, 0.015);
                        gDust(this, sp.x, map.gorilla.ceilingY + 6, 8);
                        // Men ustida edim - shiftga ezildim
                        if (gRideId === st.id && currentCharacter) {
                            this.tweens.add({ targets: currentCharacter, scaleY: 0.3, duration: 80 });
                            currentCharacter.setTint(0xff5252);
                            this.cameras.main.flash(200, 255, 60, 60);
                        }
                    }
                    // Otilish boshlandi va server meni ustida qolganlar ro'yxatiga kiritdi - platformaga "yopishaman"
                    if (st.state === 'launch' && (st.riders || []).includes(socket.id)) gRideId = st.id;
                    if (gRideId === st.id && st.state === 'back') {
                        gRideId = null;
                        if (currentCharacter) currentCharacter.setScale(1);
                    }
                    sp.state = st.state;
                    sp.ty = st.y;
                });
                const spikes = data.gSpikes || [];
                const spIds = new Set(spikes.map(sp => sp.id));
                spikes.forEach((sp) => {
                    let o = gSpikeObjs[sp.id];
                    if (!o) o = gSpikeObjs[sp.id] = { x: sp.x, spike: null };
                    o.phase = sp.phase;
                    if (sp.phase === 'up' && !o.spike) {
                        o.spike = this.add.image(sp.x, 700, 'px_gspike').setOrigin(0.5, 1).setDepth(3);
                        this.tweens.add({ targets: o.spike, y: 576, duration: 110, ease: 'Back.Out' });
                        gDust(this, sp.x, 566, 6);
                        this.cameras.main.shake(200, 0.01);
                    }
                });
                Object.keys(gSpikeObjs).forEach((id) => {
                    if (spIds.has(id)) return;
                    const o = gSpikeObjs[id];
                    delete gSpikeObjs[id];
                    if (o.spike) this.tweens.add({ targets: o.spike, y: 700, duration: 300, onComplete: () => o.spike.destroy() });
                });
                const rocks = data.gRocks || [];
                const rIds = new Set(rocks.map(r => r.id));
                rocks.forEach((r) => {
                    let sp = gRockSprites[r.id];
                    if (!sp) sp = gRockSprites[r.id] = this.add.image(r.x, r.y, 'px_boulder').setDepth(4).setVisible(false);
                    sp.tx = r.x; sp.ty = r.y; sp.waiting = r.delay > 0;
                });
                Object.keys(gRockSprites).forEach((id) => {
                    if (rIds.has(id)) return;
                    const sp = gRockSprites[id];
                    delete gRockSprites[id];
                    gDust(this, sp.x, sp.y + 10, 5, STONE[2]);
                    sp.destroy();
                });
            }

            // YURUVCHI TOSHLAR: joyi va holati serverdan
            if (isStones) {
                (data.stones || []).forEach((st) => {
                    const sp = stoneSprites[st.id];
                    if (!sp) return;
                    if (st.state === 'fall' && sp.state !== 'fall') crumbleStone(this, sp);
                    if (st.state === 'idle' && sp.state === 'gone') {
                        sp.y = st.y;
                        sp.setAlpha(0);
                        this.tweens.add({ targets: sp, alpha: 1, duration: 400 });
                    }
                    sp.state = st.state;
                    sp.ty = st.y;
                    const solid = st.state !== 'gone';
                    sp.setVisible(solid);
                    sp.body.enable = solid;
                });
            }

            // O'RMON: qizil qutilar (yo'qolgani - o'q tegib portladi) va itlar chiqishi
            if (isForest) {
                if (data.arenaTriggered && !forestTriggered) dogsAttackFx(this);
                forestTriggered = !!data.arenaTriggered;
                const rbs = data.redBoxes || [];
                const rbIds = new Set(rbs.map(b => b.id));
                rbs.forEach((b) => {
                    let sp = redBoxSprites[b.id];
                    if (!sp) sp = redBoxSprites[b.id] = this.add.image(b.x, b.y, 'redbox_tex').setDepth(2);
                    sp.tx = b.x; sp.ty = b.y; sp.landed = b.landed;
                });
                Object.keys(redBoxSprites).forEach((id) => {
                    if (rbIds.has(id)) return;
                    const sp = redBoxSprites[id];
                    delete redBoxSprites[id];
                    explodeMine(this, sp.x, sp.y);
                    const ring = this.add.circle(sp.x, sp.y, 20, 0xff6d00, 0.5).setDepth(6);
                    this.tweens.add({ targets: ring, scale: map.forest.redBox.blastRadius / 20, alpha: 0, duration: 420, onComplete: () => ring.destroy() });
                    sp.destroy();
                });
            }

            // QUTILAR: yangilarini qo'shamiz, yo'qolganlarini (sindirilgan) parchalab o'chiramiz
            const serverCrates = data.crates || [];
            const crateIds = new Set(serverCrates.map(c => c.id));
            serverCrates.forEach((c) => {
                if (!crateSprites[c.id]) crateSprites[c.id] = crateGroup.create(c.x, c.y, 'crate_tex');
            });
            Object.keys(crateSprites).forEach((id) => {
                if (crateIds.has(id)) return;
                const s = crateSprites[id];
                delete crateSprites[id];
                for (let k = 0; k < 7; k++) {
                    const chip = this.add.rectangle(s.x, s.y, 8, 5, k % 2 ? 0xa9713a : 0x5b3413).setDepth(6);
                    this.tweens.add({
                        targets: chip,
                        x: s.x + Phaser.Math.Between(-50, 50),
                        y: s.y + Phaser.Math.Between(-60, 10),
                        angle: Phaser.Math.Between(-180, 180),
                        alpha: 0,
                        duration: 450,
                        onComplete: () => chip.destroy()
                    });
                }
                s.destroy();
            });

            // TANGALAR: aylanib (scaleX) va tebranib turadi; olinganlari o'chadi
            const serverCoins = data.coins || [];
            const coinIds = new Set(serverCoins.map(c => c.id));
            serverCoins.forEach((c) => {
                if (coinSprites[c.id]) return;
                const s = this.add.image(c.x, c.y, 'coin_tex').setDepth(3);
                s.coinId = c.id;
                this.tweens.add({ targets: s, scaleX: 0.15, duration: 380, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
                this.tweens.add({ targets: s, y: c.y - 6, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
                coinSprites[c.id] = s;
            });
            Object.keys(coinSprites).forEach((id) => {
                if (coinIds.has(id)) return;
                const s = coinSprites[id];
                delete coinSprites[id];
                this.tweens.add({ targets: s, y: s.y - 30, alpha: 0, duration: 250, onComplete: () => s.destroy() });
            });

            // MINALAR: ro'yxatdan yo'qolgan mina - portladi
            const serverMines = data.mines || [];
            const mineIds = new Set(serverMines.map(m => m.id));
            serverMines.forEach((m) => {
                if (mineSprites[m.id]) return;
                // Devor tagidagi mina - qizil dinamit (bosilsa devorni ham portlatadi)
                const s = this.add.image(m.x, m.y + 8, m.wallId ? 'mine_wall_tex' : 'mine_tex').setDepth(3).setScale(1, 0);
                s.baseY = m.y;
                s.popped = false;
                s.led = this.add.circle(m.x, m.y - 4, 2.5, 0xff1744).setDepth(4).setVisible(false);
                mineSprites[m.id] = s;
            });
            Object.keys(mineSprites).forEach((id) => {
                if (mineIds.has(id)) return;
                const s = mineSprites[id];
                delete mineSprites[id];
                explodeMine(this, s.x, s.baseY);
                s.led.destroy();
                s.destroy();
            });

            // OLMALAR (elf qishlog'i): yangisi paydo bo'lsa - elf qo'lini siltaydi;
            // yo'qolgani yerga yaqin bo'lsa - ezilib sachraydi, aks holda savatchaga tushgan
            if (isApples) {
                const serverApples = data.apples || [];
                const appleIds = new Set(serverApples.map(a => a.id));
                serverApples.forEach((a) => {
                    let s = appleSprites[a.id];
                    if (!s) {
                        s = appleSprites[a.id] = this.add.image(a.x, a.y, 'apple_tex').setDepth(4);
                        if (elfSprite) {
                            elfSprite.setTexture('px_elf_throw');
                            this.time.delayedCall(180, () => { if (elfSprite && elfSprite.active) elfSprite.setTexture('px_elf_idle'); });
                        }
                    }
                    s.tx = a.x; s.ty = a.y;
                    s.landX = a.tx; // tushish joyi - yerda belgi chiziladi
                });
                Object.keys(appleSprites).forEach((id) => {
                    if (appleIds.has(id)) return;
                    const s = appleSprites[id];
                    delete appleSprites[id];
                    if (s.y > 530) {
                        for (let k = 0; k < 6; k++) {
                            const drop = this.add.circle(s.x, 564, 3, 0xc62828).setDepth(4);
                            this.tweens.add({ targets: drop, x: s.x + Phaser.Math.Between(-30, 30), y: 564 - Phaser.Math.Between(4, 26),
                                alpha: 0, duration: 380, onComplete: () => drop.destroy() });
                        }
                    }
                    s.destroy();
                });

                // O'z savatcham: sochilgan bo'lsa - effekt
                const mine = serverPlayers[socket.id];
                if (mine) {
                    const n = mine.apples || 0;
                    const need = map.apples.applesToCollect;
                    if (n === 0 && myApples > 0 && currentCharacter) spillApples(this, currentCharacter.x, currentCharacter.y, myApples);
                    // 12 ta bo'ldi - elf KALIT beradi (dialog)
                    if (n >= need && myApples < need) {
                        startDialog(this, [t('elf_key1'), t('elf_key2'), t('elf_key3')]);
                    }
                    myApples = n;
                }

                // Katta eshik ochildi (kimdir kalit bilan ochdi)
                if (data.doorOpen && !doorIsOpen) {
                    doorIsOpen = true;
                    openBigDoorAnim(this);
                }

            }

            // DEVORLAR: ro'yxatdan yo'qolgani - tagidagi mina bilan portladi
            if (data.wallIds) {
                const alive = new Set(data.wallIds);
                Object.keys(wallObjs).forEach((id) => {
                    if (alive.has(id)) return;
                    const obj = wallObjs[id];
                    delete wallObjs[id];
                    destroyWall(this, obj);
                });
            }

            // 1. O'ZIMIZNING PERSONAJ HOLATI (Tezlik va effektlar)
            if (currentCharacter && serverPlayers[socket.id]) {
                const myData = serverPlayers[socket.id];
                currentCharacter.hp = myData.hp;
                currentCharacter.stamina = myData.stamina;
                currentCharacter.kills = myData.kills;
                currentCharacter.isDead = myData.isDead;
                currentCharacter.respawnTimer = myData.respawnTimer;

                currentCharacter.speedMultiplier = myData.speedMultiplier || 1;
                currentCharacter.level = myData.level || 0;
                currentCharacter.maxStamina = myData.maxStamina || 100;
                currentCharacter.weaponMode = myData.weaponMode || 'main';
                currentCharacter.special = !!myData.special;
                currentCharacter.specialCd = myData.specialCd || 0;
                currentCharacter.ammo = myData.ammo || 0;
                currentCharacter.maxAmmo = myData.maxAmmo || 7;
                currentCharacter.reloading = !!myData.reloading;

                if (myData.isDead) {
                    // O'LGAN ("ARVOH") HOLATI: yarim shaffof va ko'kimtir tus
                    currentCharacter.setAlpha(0.35);
                    currentCharacter.setTint(0x6699ff);
                } else if (myData.isInvisible) {
                    currentCharacter.setAlpha(0.4);
                    currentCharacter.clearTint();
                } else {
                    currentCharacter.setAlpha(1);
                }

                if (!myData.isDead && myData.characterType === 'knight' && myData.isHoldingAbility) {
                    currentCharacter.shieldActive = true;
                } else if (!myData.isDead) {
                    currentCharacter.clearTint();
                    currentCharacter.shieldActive = false;
                }

                if (myData.x === 100 && Math.abs(currentCharacter.x - 100) > 200) {
                    currentCharacter.x = myData.x; currentCharacter.y = myData.y;
                }
            }

            // [YANGI QO'SHILDI]: 2. BOSHQA O'YINCHILARNI YARATISH VA YANGILASH
            Object.keys(serverPlayers).forEach((id) => {
                if (id === socket.id) return; // O'zimizni tashlab o'tamiz
                
                const pData = serverPlayers[id];
                const textureKey = `char_${pData.characterType}_${pData.color}`;

                // Agar bu o'yinchi uchun tekstura yo'q bo'lsa, uning rangida yaratamiz
                createPlayerTexture(this, textureKey, pData.color, 32);

                if (!otherPlayers[id]) {
                    // Yangi o'yinchini ekranga qo'shish
                    let p = this.add.sprite(pData.x, pData.y, textureKey).setDepth(3);
                    p.targetX = pData.x;
                    p.targetY = pData.y;
                    p.hp = pData.hp;
                    p.characterType = pData.characterType;
                    otherPlayers[id] = p;
                } else {
                    // Mavjud o'yinchi ma'lumotlarini yangilash
                    if (otherPlayers[id].texture.key !== textureKey) {
                        otherPlayers[id].setTexture(textureKey);
                    }
                    otherPlayers[id].targetX = pData.x;
                    otherPlayers[id].targetY = pData.y;
                    otherPlayers[id].hp = pData.hp;
                    otherPlayers[id].characterType = pData.characterType;
                    otherPlayers[id].weaponMode = pData.weaponMode || 'main';
                    otherPlayers[id].special = !!pData.special;
                }

                otherPlayers[id].isDead = pData.isDead;
                otherPlayers[id].isInvisible = pData.isInvisible;
                if (isApples) {
                    const n = pData.apples || 0;
                    if (n === 0 && (otherPlayers[id].apples || 0) > 0) spillApples(this, otherPlayers[id].x, otherPlayers[id].y, otherPlayers[id].apples);
                    otherPlayers[id].apples = n;
                }

                // Archer ko'rinmas bo'lsa boshqalarga ko'rinmaydi; o'lik o'yinchi esa arvoh bo'lib ko'rinadi
                if (pData.isDead) {
                    otherPlayers[id].setAlpha(0.35);
                    otherPlayers[id].setTint(0x6699ff);
                } else if (pData.isInvisible) {
                    otherPlayers[id].setAlpha(0);
                    if (otherPlayers[id].healthBar) otherPlayers[id].healthBar.clear();
                } else {
                    otherPlayers[id].setAlpha(1);
                }

                // Knight qalqoni effekti
                if (!pData.isDead && pData.characterType === 'knight' && pData.isHoldingAbility) {
                    otherPlayers[id].shieldActive = true;
                } else if (!pData.isDead) {
                    if (!pData.isInvisible) otherPlayers[id].clearTint();
                    otherPlayers[id].shieldActive = false;
                }
            });

            // [YANGI QO'SHILDI]: XONADAN CHIQIB KETGAN O'YINCHILARNI TOZALASH
            Object.keys(otherPlayers).forEach((id) => {
                if (!serverPlayers[id]) {
                    if (otherPlayers[id].healthBar) otherPlayers[id].healthBar.destroy();
                    if (otherPlayers[id].shieldSpr) otherPlayers[id].shieldSpr.destroy();
                    if (otherPlayers[id].weaponSpr) otherPlayers[id].weaponSpr.destroy();
                    if (otherPlayers[id].basketGfx) otherPlayers[id].basketGfx.destroy();
                    if (otherPlayers[id].appleText) otherPlayers[id].appleText.destroy();
                    otherPlayers[id].destroy();
                    delete otherPlayers[id];
                }
            });

            // Elf qishlog'i: eshikdan kirib ketganlar xiralashadi (ichkarida kutishyapti).
            // O'yinchilar alfasi yuqorida yangilangandan KEYIN qo'yiladi - aks holda bekor bo'lardi
            if (isApples || isForest || isStones) {
                if (currentCharacter && checkpointReached.includes(socket.id)) currentCharacter.setAlpha(0.3);
                Object.keys(otherPlayers).forEach((id) => {
                    if (checkpointReached.includes(id)) otherPlayers[id].setAlpha(0.3);
                });
            }

            // 3. O'CHIB KETGAN BOTLARNI TOZALASH (BOT O'LGANDA ANIMATSIYA)
            Object.keys(enemyBots).forEach((id) => {
                const exists = serverBots.some(b => b.id === id);
                if (!exists) {
                    let deadBot = enemyBots[id];
                    if (deadBot.healthBar) deadBot.healthBar.destroy();
                    if (deadBot.weaponGfx) deadBot.weaponGfx.destroy();
                    // O'lim animatsiyasi paytida endi to'siq bo'lmasin
                    botGroup.remove(deadBot);
                    if (deadBot.body) deadBot.body.enable = false;

                    this.tweens.add({
                        targets: deadBot,
                        alpha: 0,
                        scale: 1.5,
                        duration: 200,
                        onComplete: () => {
                            deadBot.destroy();
                        }
                    });
                    
                    delete enemyBots[id];
                }
            });

            // Botlarni yangilash va zarar yeganda miltillatish
            serverBots.forEach((bot) => {
                if (!enemyBots[bot.id]) {
                    let b;
                    if (bot.kind === 'dog') {
                        // ROBOT IT: 80x60 rasm, oyog'i server hitboxi tagiga (y+20) to'g'ri keladi
                        b = this.physics.add.sprite(bot.x, bot.y, 'px_dog_0').setDepth(3).setOrigin(0.5, 40 / 60);
                        b.isDog = true;
                        b.animT = 0;
                        b.animFrame = 0;
                    } else {
                        // ROBOT: 84x52 rasm (tana markazda); oyog'i server hitboxi tagiga (y+20) to'g'ri keladi
                        ensureBotTextures(this);
                        b = this.physics.add.sprite(bot.x, bot.y, 'px_bot_idle').setDepth(3).setOrigin(0.5, 30 / 52);
                        b.isRobot = true;
                    }
                    botGroup.add(b);
                    b.body.setAllowGravity(false);
                    b.body.setImmovable(true);
                    // To'siq tanasi - serverdagi it hitboxi bilan bir xil (60x44, oyoqlari tagida)
                    if (b.isDog) { b.body.setSize(60, 44, false); b.body.setOffset(10, 16); }
                    if (b.isRobot) { b.body.setSize(32, 40, false); b.body.setOffset(26, 10); }
                    b.targetX = bot.x; b.targetY = bot.y; b.hp = bot.hp; b.maxHp = bot.maxHp;
                    b.isBlocking = bot.isBlocking; b.isAttacking = bot.isAttacking; b.facingLeft = bot.facingLeft;
                    b.isJetting = bot.isJetting;
                    enemyBots[bot.id] = b;
                } else {
                    if (enemyBots[bot.id].hp > bot.hp) {
                        enemyBots[bot.id].setTint(0xffffff);
                        this.time.delayedCall(100, () => {
                            if (enemyBots[bot.id]) {
                                if (bot.freezeDuration > 0) enemyBots[bot.id].setTint(0x00ffff);
                                else enemyBots[bot.id].clearTint();
                            }
                        });
                    }
                    enemyBots[bot.id].targetX = bot.x;
                    enemyBots[bot.id].targetY = bot.y;
                    enemyBots[bot.id].hp = bot.hp;
                    enemyBots[bot.id].maxHp = bot.maxHp;
                    enemyBots[bot.id].isBlocking = bot.isBlocking;
                    enemyBots[bot.id].isAttacking = bot.isAttacking;
                    enemyBots[bot.id].isJetting = bot.isJetting;
                    enemyBots[bot.id].facingLeft = bot.facingLeft;
                }
            });

            // 4. O'QLARNI YANGILASH
            Object.keys(bulletSprites).forEach((id) => {
                const exists = serverBullets.some(b => b.id === id);
                if (!exists) {
                    bulletSprites[id].destroy();
                    delete bulletSprites[id];
                }
            });

            // O'QLAR VA QILICH ZARBALARINI CHIZISH
            serverBullets.forEach((bData) => {
                const facingLeft = bData.vx < 0;
                const dir = facingLeft ? -1 : 1;

                // Qilich/katana zarbasi uchun egasining REAL sprite pozitsiyasiga
                // "yopishtiramiz" - shunda tig' xarakterdan uzoqlashib, qiyshiq
                // ko'rinmaydi, balki qo'lidan chiqayotgandek tabiiy tuyuladi
                let ownerSprite = null;
                if (bData.playerId === socket.id) ownerSprite = currentCharacter;
                else ownerSprite = otherPlayers[bData.playerId];

                const isMeleeType = (bData.bulletType === 'melee');
                const posX = (isMeleeType && ownerSprite) ? ownerSprite.x + dir * 26 : bData.x;
                const posY = (isMeleeType && ownerSprite) ? ownerSprite.y - 2 : bData.y;

                if (!bulletSprites[bData.id]) {
                    const shooter = serverPlayers[bData.playerId];
                    let currentTexture = 'projectile_normal';

                    if (bData.bulletType === 'ice') currentTexture = 'projectile_fireball';
                    else if (bData.bulletType === 'pellet') currentTexture = 'projectile_normal';
                    else if (bData.bulletType === 'kunai') currentTexture = 'projectile_kunai';
                    else if (shooter) {
                        if (shooter.characterType === 'knight') currentTexture = 'melee_knight';
                        else if (shooter.characterType === 'samurai') currentTexture = 'melee_samurai';
                        else if (shooter.characterType === 'archer') currentTexture = 'projectile_arrow';
                        else if (shooter.characterType === 'mage') currentTexture = 'projectile_fireball';
                    }

                    let bSprite = this.add.sprite(posX, posY, currentTexture).setDepth(4);
                    // Chapga qarab hujum qilinganda qurol tasvirini gorizontal aylantirish
                    if (facingLeft) bSprite.setFlipX(true);

                    // QUROL SKINI: egasi tanlagan qurol skinining rangini qo'llaymiz
                    // (alohida tekstura chizish o'rniga, tez va yengil "tint" usuli)
                    if (bData.bulletType === 'ice') bSprite.setTint(0x80d8ff);          // muz shari - ko'kish
                    else if (bData.bulletType === 'pellet') bSprite.setTint(0xffe082).setScale(0.7); // sochma o'q
                    else if (shooter && shooter.weaponColor) {
                        bSprite.setTint(shooter.weaponColor);
                    }

                    if (currentTexture === 'melee_knight' || currentTexture === 'melee_samurai') {
                        // ZARBA IZI: qurol silkinishi bilan birga oldinda yorug' yoy chaqnab, so'nadi
                        bSprite.setOrigin(facingLeft ? 0.7 : 0.3, 0.5).setAlpha(0.95).setScale(0.6);
                        this.tweens.add({ targets: bSprite, scale: 1.1, alpha: 0, duration: currentTexture === 'melee_knight' ? 220 : 160, ease: 'Quad.Out' });
                    }
                    // Egasining qurolida zarba animatsiyasi
                    playHeroAttack(this, ownerSprite, bData.bulletType);

                    bulletSprites[bData.id] = bSprite;
                } else {
                    bulletSprites[bData.id].x = posX;
                    bulletSprites[bData.id].y = posY;
                }
            });
        });
    }

    // MUSIQA: jang/harakat ketayotgan bo'lsa - xarita musiqasi (toq xarita - map-1.wav, juft - map 2.wav),
    // suhbat, bozor, o'rmon yo'li, g'or yo'li va gorilla yengilgandan keyin - sokin ohang
    function musicMode() {
        if (dialog || isStory) return 'calm';
        if (isForest) return (forestTriggered && botsKilled < (currentCharacter ? currentCharacter.killsToWin : 1)) ? 'action' : 'calm';
        if (isGorilla) {
            const st = gorillaState ? gorillaState.state : 'intro';
            return ['idle', 'roar', 'push', 'slam', 'rest'].includes(st) ? 'action' : 'calm';
        }
        return 'action';
    }

    function update() {
        if (window.GameAudio) GameAudio.setMode(musicMode(), map.id || 0);
        // DARAJA EFFEKTLARI: uchayotgan knight oyog'ida ko'k alanga; mage davolayotganda hamma ustida yashil "+"
        if (!perkFxGfx) perkFxGfx = this.add.graphics().setDepth(2.5);
        perkFxGfx.clear();
        const everyone = [currentCharacter, ...Object.values(otherPlayers)].filter(o => o && o.active);
        const healing = everyone.some(o => o.characterType === 'mage' && o.special);
        everyone.forEach((o) => {
            if (o.characterType === 'knight' && o.special) {
                const len = 10 + Math.random() * 10;
                [[-8], [8]].forEach(([dx]) => {
                    perkFxGfx.fillStyle(0x1565c0, 0.85); perkFxGfx.fillTriangle(o.x + dx - 5, o.y + 24, o.x + dx + 5, o.y + 24, o.x + dx, o.y + 24 + len);
                    perkFxGfx.fillStyle(0xffffff, 1); perkFxGfx.fillTriangle(o.x + dx - 2, o.y + 24, o.x + dx + 2, o.y + 24, o.x + dx, o.y + 24 + len * 0.5);
                });
            }
            if (healing && !o.isDead && Math.random() < 0.15) {
                const plus = this.add.text(o.x + Phaser.Math.Between(-14, 14), o.y - 10, '+', {
                    fontFamily: PIXEL_FONT, fontSize: '12px', color: '#69f0ae', stroke: '#000000', strokeThickness: 3
                }).setOrigin(0.5).setDepth(1004);
                this.tweens.add({ targets: plus, y: plus.y - 36, alpha: 0, duration: 700, onComplete: () => plus.destroy() });
            }
        });

        // Emotsiyalar egasining boshi tepasida yuradi (egasi chiqib ketgan bo'lsa - yo'qoladi)
        emotes.forEach((e) => {
            const owner = e.playerId === socket.id ? currentCharacter : otherPlayers[e.playerId];
            if (!owner || !owner.active) { e.img.setVisible(false); return; }
            e.img.setPosition(owner.x, owner.y - 62);
        });
        // ILON QUVISHI: ilon silliq siljiydi, KAMERA u bilan bir xil suriladi
        // (ilon ekranning chap chetida ko'rinib turadi)
        if ((isChase || isBoss) && snakeServerX !== null) {
            snakeDisplayX = Phaser.Math.Linear(snakeDisplayX, snakeServerX, 0.3);
            // Bahaybat bosh (~250px) to'liq ko'rinib tursin - kamera ilonni ko'zlaydi
            this.cameras.main.scrollX = Phaser.Math.Clamp(snakeDisplayX - 260, 0, mapWidth - 800);
            const mouthTarget = isBoss && bossState && !bossState.dead ? (bossState.fire === 'fire' ? 1 : bossState.fire === 'charge' ? 0.7 : 0) : 0;
            mouthOpen += (mouthTarget - mouthOpen) * 0.2;
            drawSnake(snakeGfx, snakeDisplayX, this.time.now, mouthOpen);
            if (isBoss) drawBossFire(this);
            // Zarba olganda ilon lipillaydi
            if (isBoss && bossState && !bossState.dead) snakeGfx.setAlpha(bossState.hitFlash > 0 && Math.floor(this.time.now / 60) % 2 ? 0.55 : 1);
            if (isChase && introWall && snakeDisplayX >= map.chase.introWallX + 10) breakIntroWall(this);
        }
        if (isMarket) {
            updateStalls(this);
            updateCrowd(this, this.game.loop.delta);
        }
        if (isBoss && bossState) drawBossBar(this, bossState.hp, bossState.maxHp);
        // TOSH GORILLA
        if (isGorilla && gorillaState && gorillaSprite) {
            const gs = gorillaState;
            gorillaSprite.x = Phaser.Math.Linear(gorillaSprite.x, gs.x, 0.3);
            if (gs.state === 'smash') {
                const up = Math.floor(this.time.now / 260) % 2 === 0;
                gorillaSprite.setTexture(up ? 'px_gor_slam' : 'px_gor_idle');
                if (!up && !gPoundHit) gorillaPound(this, gorillaSprite.x);
                gPoundHit = !up;
            } else if (gs.state !== 'fall') {
                const pose = gs.state === 'roar' ? 'roar' : gs.state === 'slam' ? 'slam' : gs.state === 'push' ? 'push'
                    : gs.state === 'rest' || gs.state === 'defeat' ? 'rest' : 'idle';
                gorillaSprite.setTexture('px_gor_' + pose).setFlipX(!!gs.facingLeft);
                // Nafas olish (charchagan) - ko'krak ko'tarilib-tushadi; baqirganda titraydi
                gorillaSprite.scaleY = gs.state === 'rest' ? 0.97 + 0.03 * Math.sin(this.time.now / 90) : 1;
                if (gs.state === 'roar') gorillaSprite.x += Phaser.Math.Between(-2, 2);
                if (gs.hitFlash > 0 && Math.floor(this.time.now / 60) % 2) gorillaSprite.setTint(0xffffff); else gorillaSprite.clearTint();
                if (gs.state === 'rest' && Math.random() < 0.06) gDust(this, gorillaSprite.x + (gs.facingLeft ? -12 : 12), 470, 1, 0xe0e0e0);
            }
            drawBossBar(this, gs.hp, gs.maxHp, t('gorilla_name'));
            Object.values(gPlatSprites).forEach((sp) => {
                if (sp.state === 'fallen') return;
                sp.y = sp.state === 'launch' ? sp.ty : Phaser.Math.Linear(sp.y, sp.ty, 0.5);
                // Ustida qolgan qahramon platforma bilan birga shiftgacha ko'tariladi
                const myRide = gRideId && gPlatSprites[gRideId] === sp;
                if (myRide && currentCharacter && currentCharacter.body && (sp.state === 'launch' || sp.state === 'hold')) {
                    currentCharacter.body.reset(currentCharacter.x, sp.y - 24 * currentCharacter.scaleY);
                }
                if (sp.state === 'shake') {
                    sp.x = sp.baseX + Phaser.Math.Between(-3, 3);
                    sp.setTint(Math.floor(this.time.now / 90) % 2 ? 0xff8a65 : 0xffffff);
                } else { sp.x = sp.baseX; sp.clearTint(); }
            });
            // Yer yorilishi (tosh chiqishidan oldin ogohlantirish)
            gCrackGfx.clear();
            Object.values(gSpikeObjs).forEach((o) => {
                if (o.phase !== 'warn') return;
                const blink = Math.floor(this.time.now / 80) % 2;
                gCrackGfx.fillStyle(0x000000, 0.8);
                for (let k = -4; k <= 4; k++) gCrackGfx.fillRect(o.x + k * 8 + (k % 2) * 3, 566 - Math.abs(k % 3) * 2, 6, 4 + Math.abs(k % 3) * 2);
                gCrackGfx.fillStyle(0xff6d00, blink ? 0.9 : 0.4); gCrackGfx.fillRect(o.x - 3, 562, 6, 8);
                if (Math.random() < 0.3) gDust(this, o.x, 566, 1);
            });
            // Tepadan toshlar: avval shiftdan chang to'kiladi, keyin tosh tushadi
            Object.values(gRockSprites).forEach((sp) => {
                if (sp.waiting) {
                    if (Math.random() < 0.3) {
                        const pb = this.add.rectangle(sp.tx + Phaser.Math.Between(-10, 10), map.gorilla.ceilingY, 4, 4, STONE[3]).setDepth(4);
                        this.tweens.add({ targets: pb, y: pb.y + 60, alpha: 0, duration: 400, onComplete: () => pb.destroy() });
                    }
                    return;
                }
                sp.setVisible(true);
                sp.x = sp.tx;
                sp.y = Phaser.Math.Linear(sp.y, sp.ty, 0.6);
                sp.angle += 6;
            });
        }
        // Toshlar: server joyiga silliq, titraganda - chayqaladi va qizaradi
        Object.values(stoneSprites).forEach((sp) => {
            if (sp.state === 'gone') return;
            sp.y = Phaser.Math.Linear(sp.y, sp.ty, 0.5);
            if (sp.state === 'shake') {
                sp.x = sp.baseX + Phaser.Math.Between(-2, 2);
                sp.setTint(Math.floor(this.time.now / 100) % 2 ? 0xffcc80 : 0xffffff);
            } else if (sp.state === 'fall') {
                sp.x = sp.baseX;
                sp.setTint(0xff8a65);
            } else {
                sp.x = sp.baseX;
                sp.clearTint();
            }
        });
        // Qizil qutilar: silliq tushadi, yerga qo'nganlari lipillab turadi
        const rbBlink = Math.floor(this.time.now / 350) % 2 === 0;
        Object.values(redBoxSprites).forEach((s) => {
            s.x = Phaser.Math.Linear(s.x, s.tx, 0.5);
            s.y = Phaser.Math.Linear(s.y, s.ty, 0.5);
            if (s.landed && rbBlink) s.setTint(0xffcdd2); else s.clearTint();
        });
        // Ilon otgan (havodagi) minalar
        Object.values(flyingMineSprites).forEach((s) => {
            s.x = Phaser.Math.Linear(s.x, s.tx, 0.5);
            s.y = Phaser.Math.Linear(s.y, s.ty, 0.5);
            s.angle += 12;
        });

        // OLMALAR silliq uchadi va aylanadi; yerda TUSHISH JOYI belgisi (piksel soya +
        // lipillovchi qizil nuqta) - olma yaqinlashgan sari soya kattalashib, quyuqlashadi
        if (appleMarkerGfx) appleMarkerGfx.clear();
        const blink = Math.floor(this.time.now / 200) % 2 === 0;
        Object.values(appleSprites).forEach((s) => {
            if (s.tx === undefined) return;
            s.x = Phaser.Math.Linear(s.x, s.tx, 0.5);
            s.y = Phaser.Math.Linear(s.y, s.ty, 0.5);
            s.angle += 4;
            if (appleMarkerGfx && s.landX !== undefined) {
                const k = Phaser.Math.Clamp((s.y - 100) / 400, 0, 1);
                const w = Math.round((8 + k * 18) / 2) * 2;
                const lx = Math.round(s.landX);
                appleMarkerGfx.fillStyle(0x000000, 0.25 + 0.4 * k);
                appleMarkerGfx.fillRect(lx - w / 2, 566, w, 4);
                appleMarkerGfx.fillRect(lx - w / 2 + 2, 564, w - 4, 2);
                if (blink) {
                    appleMarkerGfx.fillStyle(0xe53935, 1);
                    appleMarkerGfx.fillRect(lx - 2, 556, 4, 4);
                }
            }
        });

        // MINALAR ekranga kirganda yerdan "chiqib keladi", qizil chirog'i lipillaydi
        const camRight = this.cameras.main.scrollX + 820;
        Object.values(mineSprites).forEach((s) => {
            if (s.popped || s.x > camRight) return;
            s.popped = true;
            this.tweens.add({ targets: s, scaleY: 1, y: s.baseY, duration: 350, ease: 'Back.Out' });
            s.led.setVisible(true);
            this.tweens.add({ targets: s.led, alpha: 0.15, duration: 250, yoyo: true, repeat: -1 });
        });

        // TANGA yonida "E" ko'rsatmasi
        const nearCoin = findNearestCoin();
        if (nearCoin) {
            if (!pickupHint) {
                pickupHint = this.add.text(0, 0, 'E', {
                    font: 'bold 14px Arial', fill: '#000000', backgroundColor: '#ffcc00', padding: { x: 6, y: 2 }
                }).setOrigin(0.5).setDepth(1003);
            }
            pickupHint.setPosition(nearCoin.x, nearCoin.y - 26).setVisible(true);
        } else if (pickupHint) {
            pickupHint.setVisible(false);
        }

        // O'yinchilarni siljitish va joni
        Object.keys(otherPlayers).forEach((id) => {
            let p = otherPlayers[id];
            if (p && p.active && p.targetX !== undefined) {
                const movingRight = p.targetX >= p.x;
                p.x = Phaser.Math.Linear(p.x, p.targetX, 0.22);
                p.y = Phaser.Math.Linear(p.y, p.targetY, 0.4);
                drawHealthBar(this, p, p.hp);
                if (isApples && !p.isDead) {
                    drawBasket(this, p, movingRight, p.apples || 0, map.apples.applesToCollect, true);
                    p.basketGfx.setAlpha(p.alpha);
                    p.appleText.setAlpha(p.alpha);
                }

                // Qarash tomoni - faqat haqiqatan yurganda o'zgaradi (to'xtaganda oldingisi qoladi)
                if (Math.abs(p.targetX - p.x) > 0.6) p.facingRight = movingRight;
                if (p.facingRight === undefined) p.facingRight = true;
                updateHeroWeaponVisuals(this, p, p.characterType, p.facingRight);
            }
        });

        // Botlarni siljitish va joni
        Object.keys(enemyBots).forEach((id) => {
            let b = enemyBots[id];
            if (b && b.active && b.targetX !== undefined) {
                b.x = Phaser.Math.Linear(b.x, b.targetX, 0.22);
                b.y = Phaser.Math.Linear(b.y, b.targetY, 0.4);
                drawHealthBar(this, b, b.hp, b.maxHp);
                if (b.isDog) {
                    b.setFlipX(!!b.facingLeft);
                    const moving = Math.abs(b.targetX - b.x) > 0.6 || Math.abs(b.targetY - b.y) > 0.6;
                    b.animT += this.game.loop.delta;
                    if (b.animT > 110) { b.animT = 0; b.animFrame = 1 - b.animFrame; }
                    b.setTexture(b.isAttacking ? 'px_dog_bite' : moving ? 'px_dog_' + b.animFrame : 'px_dog_0');
                } else {
                    b.setTexture(b.isBlocking ? 'px_bot_block' : b.isAttacking ? 'px_bot_attack' : 'px_bot_idle');
                    b.setFlipX(!!b.facingLeft);
                    updateBotWeaponVisuals(this, b);
                }
            }
        });

        // O'zimizning qahramon joni: endi boshi ustida emas, ekran chetidagi HUD panelida
        if (currentCharacter && currentCharacter.active) {
            let progressText;
            if (isChase) {
                progressText = checkpointReached.includes(socket.id)
                    ? t('hud_safe')
                    : t('hud_checkpoint') + ': ' + Math.max(0, Math.ceil((map.chase.pad.x + map.chase.pad.w / 2 - currentCharacter.x) / 10)) + ' m';
            } else if (isBoss) {
                progressText = bossState && bossState.fire !== 'idle' ? t('hud_fire_warn') : t('hud_boss');
            } else if (isStory) {
                progressText = t('hud_talk_seller');
                // Sotuvchi yonida bo'lsa - uning tepasida "[E]"
                if (talkHint) {
                    talkHint.setVisible(!cutsceneStarted && !dialog && !currentCharacter.isDead &&
                        Math.abs(currentCharacter.x - map.story.sellerX) <= map.story.talkRange);
                }
            } else if (isApples) {
                const need = map.apples.applesToCollect;
                progressText = checkpointReached.includes(socket.id) ? t('hud_safe')
                    : myApples >= need ? (doorIsOpen ? t('hud_enter_door') : t('hud_open_door'))
                    : t('hud_apples') + ': ' + myApples + ' / ' + need;
                if (!currentCharacter.isDead) drawBasket(this, currentCharacter, lastDirection === 'right', myApples, need, false);
                // Kalit (elf bergan) - HUD'da ko'rinadi
                if (myApples >= need && !hudKey) {
                    hudKey = this.add.image(22, 134, 'px_key').setOrigin(0, 0.5).setScrollFactor(0).setDepth(1002);
                }
            } else if (isGorilla) {
                const gst = gorillaState ? gorillaState.state : 'idle';
                progressText = gst === 'rest' ? t('hud_gorilla_rest') : gst === 'roar' ? t('hud_gorilla_roar')
                    : (gst === 'defeat' || gst === 'smash' || gst === 'fall') ? t('hud_gorilla_down') : t('hud_gorilla');
            } else if (isStones) {
                const passed = map.stones.stones.filter(st => st.x + st.w / 2 < currentCharacter.x).length;
                progressText = checkpointReached.includes(socket.id) ? t('hud_safe')
                    : t('hud_stones') + ': ' + passed + ' / ' + map.stones.stones.length;
            } else if (isForest) {
                const dogsDead = forestTriggered && botsKilled >= currentCharacter.killsToWin;
                progressText = checkpointReached.includes(socket.id) ? t('hud_safe')
                    : dogsDead ? t('hud_cave')
                    : forestTriggered ? t('hud_dogs') + ': ' + botsKilled + ' / ' + currentCharacter.killsToWin
                    : t('hud_forest_go');
            } else {
                progressText = t('hud_bots') + ': ' + botsKilled + ' / ' + currentCharacter.killsToWin;
            }
            const stPct = 100 * (currentCharacter.stamina || 0) / (currentCharacter.maxStamina || 100);
            drawHUD(this, currentCharacter.hp, stPct, progressText, perkHudText());

            // Qurol, ritsar qalqoni va qarash tomoni (ko'rinmas kamonchida qurol ham xiralashadi)
            updateHeroWeaponVisuals(this, currentCharacter, currentCharacter.characterType, lastDirection === 'right');

            // ARVOH HOLATI: hozircha qayta tug'ilish yo'q - shunchaki arvoh ekanini bildiramiz
            if (!this.respawnText) {
                this.respawnText = this.add.text(400, 330, '', {
                    font: 'bold 20px Arial', fill: '#66aaff', align: 'center'
                }).setOrigin(0.5).setScrollFactor(0).setDepth(1002);
            }
            if (currentCharacter.isDead) {
                if (!this.ghostSkullIcon) {
                    this.ghostSkullIcon = drawSkullIcon(this, 388, 275);
                }
                this.respawnText.setText(t('ghost_line1') + '\n' + t('ghost_line2'));
            } else {
                this.respawnText.setText('');
                if (this.ghostSkullIcon) {
                    this.ghostSkullIcon.destroy();
                    this.ghostSkullIcon = null;
                }
            }
        }

        if (!currentCharacter || !currentCharacter.body) return;

        // O'LIK ("ARVOH") HOLATDA: yura oladi (chapga/o'ngga/sakrash), lekin
        // hujum va qobiliyat ishlamaydi (server bu holatda ularni allaqachon rad etadi)
        let currentMultiplier = currentCharacter.isDead ? 1 : (currentCharacter.speedMultiplier || 1);
        let speed = 200 * currentMultiplier;

        // Dialog paytida qahramon qimirlamaydi (Undertale'dagidek)
        if (dialog) {
            currentCharacter.setVelocityX(0);
        } else if (this.time.now < stunUntil) {
            // Gorilla itarib yubordi - uchib ketyapti
        } else if (cursors.left.isDown || this.input.keyboard.addKey('A').isDown || touchState.left) {
            currentCharacter.setVelocityX(-speed);
            lastDirection = 'left';
        } else if (cursors.right.isDown || this.input.keyboard.addKey('D').isDown || touchState.right) {
            currentCharacter.setVelocityX(speed);
            lastDirection = 'right';
        } else {
            currentCharacter.setVelocityX(0);
        }

        let isGrounded = currentCharacter.body.touching.down || currentCharacter.body.blocked.down;
        if (isStones) {
            if (isGrounded) lastGroundedAt = this.time.now;
            else if (this.time.now - lastGroundedAt < 120 && currentCharacter.body.velocity.y >= 0) isGrounded = true;
        }
        const jumpDown = !dialog && (cursors.up.isDown || this.input.keyboard.addKey('W').isDown || touchState.jump);
        const jumpPressed = jumpDown && !jumpWasDown;
        jumpWasDown = jumpDown;
        const c = currentCharacter;
        // KNIGHT 10-daraja: uchuvchi etik (R) - 2 soniya gravitatsiyasiz, W/S bilan tepaga-pastga
        const flying = c.characterType === 'knight' && c.special && !c.isDead;
        if (flying) {
            c.body.setAllowGravity(false);
            const down = cursors.down.isDown || this.input.keyboard.addKey('S').isDown;
            c.setVelocityY(jumpDown ? -230 : down ? 230 : 0);
        } else if (wasFlying) {
            c.body.setAllowGravity(true);
        }
        wasFlying = flying;
        if (!flying) {
            if (isGrounded) airJumpsLeft = (c.characterType === 'samurai' && hasPerkClient('samurai', c.level, 'djump')) ? 1 : 0;
            if (jumpDown && isGrounded) {
                c.setVelocityY(-400);
                lastGroundedAt = -1e9;
            } else if (jumpPressed && !isGrounded && airJumpsLeft > 0) {
                // SAMURAI 10-daraja: havoda ikkinchi sakrash (tugmani qayta bosganda)
                airJumpsLeft--;
                c.setVelocityY(-380);
                for (let k = 0; k < 6; k++) {
                    const puff = this.add.rectangle(c.x + Phaser.Math.Between(-10, 10), c.y + 24, 6, 6, 0xffffff, 0.8).setDepth(2);
                    this.tweens.add({ targets: puff, y: puff.y + 14, alpha: 0, scale: 2, duration: 300, onComplete: () => puff.destroy() });
                }
            }
        }

        // Harakat koordinatalarini faqat o'z xonamizga yuboramiz
        // Robot-ilon jangida: ilonning ichiga kirib bo'lmaydi (u to'siq)
        // (taxtada - baland turgan qahramon ilon ustidan o'tib keta oladi)
        if (isBoss && snakeDisplayX !== null && bossState && !bossState.dead && currentCharacter.y > 360 && currentCharacter.x < snakeDisplayX + 18) {
            currentCharacter.x = snakeDisplayX + 18;
            if (currentCharacter.body.velocity.x < 0) currentCharacter.setVelocityX(0);
        }

        // Ilon quvishida qahramon ekrandan chiqib keta olmaydi: oldinga - kamera
        // chetigacha, orqaga - ham (orqada ilon bor, u yerda baribir yutiladi)
        if (isChase || isBoss) {
            const minX = this.cameras.main.scrollX + 16;
            const maxX = this.cameras.main.scrollX + 800 - 16;
            if (currentCharacter.x > maxX) {
                currentCharacter.x = maxX;
                if (currentCharacter.body.velocity.x > 0) currentCharacter.setVelocityX(0);
            } else if (currentCharacter.x < minX) {
                currentCharacter.x = minX;
                if (currentCharacter.body.velocity.x < 0) currentCharacter.setVelocityX(0);
            }
        }

        const now = this.time.now;
        const moved = Math.abs(currentCharacter.x - lastSentMove.x) > 0.5 || Math.abs(currentCharacter.y - lastSentMove.y) > 0.5;
        if ((moved && now - lastSentMove.t >= 30) || now - lastSentMove.t >= 250) {
            lastSentMove = { x: currentCharacter.x, y: currentCharacter.y, t: now };
            socket.emit('playerMoveInRoom', { roomId: roomId, x: currentCharacter.x, y: currentCharacter.y });
        }
    }
}