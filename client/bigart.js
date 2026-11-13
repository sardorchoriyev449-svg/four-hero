// ===== BIG MAP rasmlari (piksel-art, kod bilan) - o'yindagi boshqa xaritalar uslubida: katak (grid), Bayer "dither" soyalar,
// to'q kontur. Orollar (zinapoyasimon tosh pastki qismi), pog'ona-toshlar, bulutlar, bezaklar, dushmanlar, bosslar, NPC lar, fon.
window.BigArt = (function () {
    const OUT = 0x0d0a14;
    const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
    const shade = (v, x, y, pal) => {
        const d = v + (BAYER[((y % 4) + 4) % 4][((x % 4) + 4) % 4] / 16 - 0.5) * 0.28;
        return pal[Math.max(0, Math.min(pal.length - 1, Math.floor(d * pal.length)))];
    };
    const hash = (x, y, s) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
    function gNew(w, h) { return Array.from({ length: h }, () => Array(w).fill(null)); }
    function gOutline(g, c) {
        const h = g.length, w = g[0].length, out = gNew(w + 2, h + 2);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y + 1][x + 1] = g[y][x];
        const filled = (x, y) => y >= 0 && y < h + 2 && x >= 0 && x < w + 2 && out[y][x] !== null && out[y][x] !== c;
        for (let y = 0; y < h + 2; y++) for (let x = 0; x < w + 2; x++)
            if (out[y][x] === null && (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1))) out[y][x] = c;
        return out;
    }
    // Chizish yordamchilari: r - to'g'ri to'rtburchak, p - nuqta, s - soyali blok (yorug'lik chap-yuqoridan), e - soyali ellips
    function api(g) {
        const H = g.length, W = g[0].length;
        const set = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (y >= 0 && y < H && x >= 0 && x < W) g[y][x] = c; };
        return {
            g, W, H,
            p: set,
            r: (x, y, w, h, c) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) set(xx, yy, c); },
            s: (x, y, w, h, pal, l = 0) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) set(xx, yy, shade(0.92 + l - (yy - y) / Math.max(1, h) * 0.5 - (xx - x) / Math.max(1, w) * 0.32, xx, yy, pal)); },
            e: (cx, cy, rx, ry, pal, l = 0) => {
                for (let yy = Math.floor(cy - ry); yy <= Math.ceil(cy + ry); yy++) for (let xx = Math.floor(cx - rx); xx <= Math.ceil(cx + rx); xx++) {
                    const dx = (xx - cx) / rx, dy = (yy - cy) / ry;
                    if (dx * dx + dy * dy <= 1) set(xx, yy, shade(0.9 + l - (dx + 1) * 0.17 - (dy + 1) * 0.27, xx, yy, pal));
                }
            },
            // uchburchak tom (pastga kengayadi)
            roof: (cx, y, h, w0, w1, pal) => { for (let k = 0; k < h; k++) { const w = Math.round(w0 + (w1 - w0) * k / Math.max(1, h - 1)); for (let xx = Math.round(cx - w / 2); xx < Math.round(cx + w / 2); xx++) set(xx, y + k, shade(0.85 - k / h * 0.4 - (xx - cx + w / 2) / w * 0.3, xx, y + k, pal)); } },
            line: (x0, y0, x1, y1, c) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1); for (let i = 0; i <= n; i++) set(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, c); }
        };
    }
    function art(w, h, draw, outline = OUT) { const g = gNew(w, h); draw(api(g)); return outline ? gOutline(g, outline) : g; }
    // Grid -> Phaser kanvas teksturasi (bir xil rangli qatorlar bitta to'rtburchak bilan chiziladi)
    const HEX = new Map();
    const hex = (c) => { let s = HEX.get(c); if (!s) { s = '#' + c.toString(16).padStart(6, '0'); HEX.set(c, s); } return s; };
    // Phaser'ga - oddiy rasm sifatida (addImage): addCanvas / createCanvas har kanvasni qayta o'qiydi (getImageData) - sekin.
    // Dunyo orollari / qopqoqlari (kalitda seed bor - mazmuni o'zgarmaydi) - shu dunyo uchun eslab qolinadi (keyingi startda qayta chizilmaydi)
    const WCV = new Map(); let wSeed = null;
    function tex(scene, key, g, P) {
        if (scene.textures.exists(key)) return key;
        const h = g.length, w = g[0].length;
        const cv = document.createElement('canvas'); cv.width = w * P; cv.height = h * P;
        const ctx = cv.getContext('2d'), ct = { refresh() { } };
        for (let y = 0; y < h; y++) {
            let x = 0;
            while (x < w) {
                const c = g[y][x];
                if (c === null) { x++; continue; }
                let x1 = x + 1;
                while (x1 < w && g[y][x1] === c) x1++;
                ctx.fillStyle = hex(c); ctx.fillRect(x * P, y * P, (x1 - x) * P, P);
                x = x1;
            }
        }
        ct.refresh();
        if (scene === PRE) { CANV.set(key, cv); return key; }
        scene.textures.addImage(key, cv);
        const m = /^bm_(isle|cov)_([0-9]+)_/.exec(key);
        if (m) { if (wSeed !== m[2]) { WCV.clear(); wSeed = m[2]; } WCV.set(key, cv); }
        return key;
    }

    // ===== PALITRALAR =====
    const C = {
        goblin: [0x24461a, 0x3a6a25, 0x5a9433, 0x86c24c], orc: [0x22381d, 0x34552b, 0x4d7a3c, 0x6f9c55],
        tan: [0x6b3f2a, 0x925d3f, 0xbd8259, 0xe2ad82], elf: [0x2b6f9e, 0x4fa3d1, 0x81d4fa, 0xb8e6fb], pale: [0x4d5866, 0x6f7b8a, 0x95a1ae, 0xc4ccd4],
        leather: [0x2e1c12, 0x4a2f1d, 0x6b4529, 0x8f633c], iron: [0x2c3138, 0x4a535d, 0x76818c, 0xb9c3cc], gold: [0x6b4700, 0xa36f00, 0xd9a300, 0xffd54f],
        bark: [0x22150d, 0x3a2414, 0x553620, 0x74502f], wood: [0x33200f, 0x52351c, 0x75502d, 0x9a7044],
        leafE: [0x1b3526, 0x2a5236, 0x3a7242, 0x55984f, 0x83bf68], leafF: [0x0c2616, 0x163d22, 0x22592e, 0x347a3a, 0x5ea64d],
        stone: [0x2a2735, 0x423d55, 0x5d5875, 0x7f7998, 0xa7a2c0], wall: [0x7d7468, 0xa39886, 0xc6bba6, 0xe6dcc6],
        roofR: [0x4d1016, 0x7a1d22, 0xa73134, 0xd65650], roofB: [0x142454, 0x203a80, 0x3555ad, 0x5f7fd6], roofT: [0x5a3d12, 0x86601f, 0xb08633, 0xd8b055],
        purple: [0x2a1240, 0x43205f, 0x633285, 0x8a4fae], dark: [0x101014, 0x1c1c24, 0x2c2c38, 0x44445a], red: [0x5a0c10, 0x8e1a1e, 0xc62f2f, 0xef5f50],
        green: [0x15391c, 0x22592b, 0x33803c, 0x56a852], blue: [0x10285a, 0x1a428a, 0x2c64ba, 0x5289de], brown: [0x3a2418, 0x5b3a26, 0x7d5636, 0xa27a50],
        white: [0x8f96a3, 0xb6bcc6, 0xdde1e7, 0xffffff], grey: [0x3a3a44, 0x5a5a66, 0x80808c, 0xaaaab4], bone: [0x8c8270, 0xb4aa94, 0xd8d0bc, 0xf4efe2],
        web: [0x4a4a5a, 0x7a7a8a],
        // YER OSTI: magma (qizg'ish-to'q sariq), obsidian (qora-binafsha), lava (yorqin), bazalt (kulrang-qora)
        magma: [0x3a0a06, 0x7a1a0a, 0xc43a12, 0xff7a2a], obs: [0x0e0a10, 0x1c1620, 0x2c2432, 0x3e3448], lava: [0xb3261e, 0xff7a1a, 0xffc35a, 0xfff2b0],
        basalt: [0x1a1418, 0x2e262c, 0x463c44, 0x5e545c], soul: [0x2a0d55, 0x5a2aa0, 0x9a6aff, 0xd8c8ff],
        // BOTQOQ: mox (yashil), loy (jigarrang), botqoq teri (ko'kish-yashil), zahar (och yashil)
        moss: [0x1e3a1a, 0x2e5226, 0x3e6a30, 0x56843e, 0x7aa050], mud: [0x221a10, 0x3a2c1a, 0x54402a, 0x6e5838], bog: [0x1a3a2e, 0x2a5a46, 0x427a5e, 0x6aa47e],
        toxic: [0x2e5a10, 0x5a9a1a, 0x9ad83a, 0xd8ff8a], ice: [0x2a5a8a, 0x4a86b8, 0x7ab4e0, 0xc0e4fa]
    };
    const GLOW = 0xffd27a, GLOW2 = 0xfff2b0;

    // ===== OROLLAR =====
    // k bo'yicha: tepa qatlami, tuproq va tosh palitralari, osilib turgan ildiz/kristall
    const ISLE = {
        cobble: { top: 'cobble', soil: [0x241923, 0x372630, 0x4e3439, 0x6a4840], rock: [0x221e2b, 0x332d40, 0x4a4259, 0x655b77], grass: C.leafE, hang: 'roots' },
        grass: { top: 'grass', soil: [0x19130e, 0x2a2016, 0x3f2f20, 0x584330], rock: [0x161d1a, 0x24302a, 0x364839, 0x4e654f], grass: C.leafF, hang: 'vines' },
        skyrock: { top: 'skystone', soil: [0x3a3552, 0x524b6e, 0x6c6590, 0x8c86ad], rock: [0x332f4a, 0x4a4566, 0x655f85, 0x857fa6], grass: C.leafE, hang: 'crystal', cloud: true },
        skygrass: { top: 'grass', soil: [0x2e3a3a, 0x405252, 0x566e68, 0x718c80], rock: [0x2b3540, 0x3e4d5a, 0x546978, 0x6f8796], grass: C.leafF, hang: 'vines', cloud: true },
        deepbrick: { top: 'brick', soil: [0x1a1622, 0x262033, 0x342c45, 0x453b5a], rock: [0x141119, 0x1f1a28, 0x2b2437, 0x3a3149], grass: null, hang: 'crystal', cave: [0x0f0c14, 0x17131e, 0x201a2a] },
        snow: { top: 'snowtop', soil: [0x26314c, 0x35456a, 0x4a608a, 0x647ea8], rock: [0x161e34, 0x222e4a, 0x30406a, 0x44588a], grass: null, hang: 'icicle' },
        ice: { top: 'icetop', soil: [0x26314c, 0x35456a, 0x4a608a, 0x647ea8], rock: [0x161e34, 0x222e4a, 0x30406a, 0x44588a], grass: null, hang: 'icicle' },
        skyice: { top: 'snowtop', soil: [0x4a5a80, 0x6478a0, 0x8496c0, 0xa8b8dc], rock: [0x3a4870, 0x4e6090, 0x6a7eb0, 0x8a9ed0], grass: null, hang: 'icicle', cloud: true },
        deepice: { top: 'icetop', soil: [0x0e1830, 0x16244a, 0x203466, 0x2c4682], rock: [0x0a1226, 0x111c3a, 0x182850, 0x223868], grass: null, hang: 'crystal', cave: [0x060c1a, 0x0b1428, 0x101c36] },
        // YER OSTI: bazalt (yoriqlaridan lava ko'rinadi), shiftdagi binafsha kristalli qoyalar, chuqurlikdagi qizg'ish g'orlar
        basalt: { top: 'basalt', soil: [0x1a1418, 0x261c20, 0x34262a, 0x463236], rock: [0x120e12, 0x1c161a, 0x282024, 0x362a2e], grass: null, hang: 'drip', veins: true },
        skybasalt: { top: 'basalt', soil: [0x241a2e, 0x32243e, 0x443252, 0x5a4468], rock: [0x1a1424, 0x241c32, 0x322644, 0x443458], grass: null, hang: 'crystal' },
        deeplava: { top: 'basalt', soil: [0x140c0c, 0x1e1212, 0x2a1818, 0x3a2020], rock: [0x0e0808, 0x170e0e, 0x221414, 0x2e1a1a], grass: null, hang: 'drip', veins: true, cave: [0x0c0606, 0x140a0a, 0x1e0e0e] },
        // BOTQOQ: moxli loy (pastidan uzun mox osilib turadi), osmonda - moxli qoyalar, chuqurlikda - qop-qora botqoq g'orlar
        lakebed: { top: 'mud', soil: [0x14140e, 0x1e2016, 0x2a2e20, 0x383e2a], rock: [0x0e100c, 0x161a12, 0x20261a, 0x2a3222], grass: C.moss, hang: 'moss' },
        mud: { top: 'mud', soil: [0x1a160e, 0x262016, 0x342c1e, 0x463c28], rock: [0x121410, 0x1c201a, 0x262c22, 0x323a2c], grass: C.moss, hang: 'moss' },
        skymoss: { top: 'mud', soil: [0x26302a, 0x34423a, 0x46584c, 0x5c7262], rock: [0x1e2622, 0x2a3430, 0x3a4840, 0x4e6054], grass: C.moss, hang: 'moss' },
        deepbog: { top: 'mud', soil: [0x10120c, 0x181c12, 0x22281a, 0x2e3622], rock: [0x0a0c08, 0x12160e, 0x1a2014, 0x242c1c], grass: C.moss, hang: 'moss', cave: [0x080a06, 0x0e120a, 0x141a0e] },
        // SKYLAND: po'lat paluba (chetida neon chiziq), ichi - panellar (choklar, chiroqchalar), pastidan kabellar osilgan
        skydeck: { top: 'deck', soil: [0x2a3340, 0x3a4656, 0x4e5c6e, 0x667688], rock: [0x1c2430, 0x283242, 0x364256, 0x48566c], grass: null, hang: 'cables', panels: true },
        skydeck2: { top: 'deck', soil: [0x3a4a66, 0x4e6080, 0x66789a, 0x8294b4], rock: [0x2c3a56, 0x3c4c6c, 0x506286, 0x6a7ca0], grass: null, hang: 'cables', panels: true, cloud: true },
        deepdeck: { top: 'deck', soil: [0x141a24, 0x1c2432, 0x262f40, 0x323d52], rock: [0x0e121a, 0x151b26, 0x1d2532, 0x273142], grass: null, hang: 'cables', panels: true, cave: [0x0a0e16, 0x111722, 0x18202e] },
        deeproot: { top: 'roots', soil: [0x120d09, 0x1d150f, 0x2a1f16, 0x3a2b1e], rock: [0x0f1310, 0x182019, 0x222d24, 0x2f3d31], grass: null, hang: 'shroom', cave: [0x0b0907, 0x130f0b, 0x1c1610] }
    };
    // Orol teksturasi: tepasi (y..y+40) va pastki to'rtburchaklar birlashmasi; P=4 px katak
    const ISLE_POS = new Map();
    function isleTex(scene, key, I) {
        if (scene.textures.exists(key) && ISLE_POS.has(key)) return ISLE_POS.get(key);
        if (ISLE_POS.has(key) && WCV.has(key)) { scene.textures.addImage(key, WCV.get(key)); return ISLE_POS.get(key); }   // shu dunyoda oldin chizilgan
        const P = 4, S = ISLE[I.k] || ISLE.cobble;
        const rects = [[I.x, I.y, I.w, 40, 0], ...I.r.map(q => [q[0], q[1], q[2], q[3], q[4] || 0])];
        let minX = I.x, maxX = I.x + I.w, maxY = I.y + 40;
        rects.forEach(q => { minX = Math.min(minX, q[0]); maxX = Math.max(maxX, q[0] + q[2]); maxY = Math.max(maxY, q[1] + q[3]); });
        const ox = minX - 2 * P, oy = I.y - 3 * P;                     // 3 katak - o't uchlari va kontur uchun joy
        const cw = Math.ceil((maxX - ox) / P) + 3, chh = Math.ceil((maxY - oy) / P) + 4;
        const fill = Array.from({ length: chh }, () => new Uint8Array(cw));   // 0 - bo'sh, 1 - tosh, 2 - xona ichi (orqa devor)
        rects.forEach(q => {
            const x0 = Math.round((q[0] - ox) / P), x1 = Math.round((q[0] + q[2] - ox) / P), y0 = Math.round((q[1] - oy) / P), y1 = Math.round((q[1] + q[3] - oy) / P);
            for (let y = Math.max(0, y0); y < Math.min(chh, y1); y++) for (let x = Math.max(0, x0); x < Math.min(cw, x1); x++) if (fill[y][x] !== 1) fill[y][x] = q[4] ? 2 : 1;
        });
        // G'OR: tepadagi kirish teshigi - ichi qorong'i (orqa devor), atrofi ochiq
        if (I.hole) {
            const hx0 = Math.round((I.hole[0] - ox) / P), hx1 = Math.round((I.hole[0] + I.hole[1] - ox) / P);
            for (let y = 0; y < Math.min(chh, 3 + Math.round(48 / P)); y++) for (let x = hx0; x < hx1; x++) if (fill[y] && fill[y][x]) fill[y][x] = 2;
        }
        if (I.pool) for (let j = 0; j + 1 < I.pool.length; j += 2) {
            const px0 = Math.round((I.pool[j] - ox) / P), px1 = Math.round((I.pool[j] + I.pool[j + 1] - ox) / P);
            for (let y = 0; y < 3 + (I.poolD ? Math.round(I.poolD / P) : 6); y++) for (let x = px0; x < px1; x++) if (fill[y]) fill[y][x] = 0;   // poolD - chuqurroq (katta daryo)
        }
        const g = gNew(cw, chh), topRow = 3, depthRows = Math.max(1, Math.round((maxY - I.y) / P));
        const seed = I.id * 31 + 7;
        const solid = (x, y) => y >= 0 && y < chh && x >= 0 && x < cw && fill[y][x] > 0;
        for (let y = 0; y < chh; y++) for (let x = 0; x < cw; x++) {
            const f = fill[y][x];
            if (!f) continue;
            const d = y - topRow;                                         // tepadan chuqurlik (katak)
            if (f === 2) {                                                // maxfiy xona: qorong'i orqa devor (g'isht / tuproq naqshi)
                const pal = S.cave || [0x120e14, 0x1a1520, 0x231c2b];
                const mortar = S.top === 'brick' ? (y % 4 === 0 || (x + (Math.floor(y / 4) % 2) * 3) % 7 === 0) : hash(x, y, seed) < 0.08;
                g[y][x] = mortar ? pal[0] : shade(0.55 - d / 60, x, y, pal);
                continue;
            }
            // chetga yaqinlik - pastki qirg'oq qorong'iroq, chap-yuqori yorug'roq
            const below = solid(x, y + 1), left = solid(x - 1, y), right = solid(x + 1, y);
            if (d < 4) {                                                  // TEPA QATLAMI
                g[y][x] = surface(S, x, d, y, seed);
                continue;
            }
            const k = d / depthRows;
            let v = 0.78 - k * 0.55 + (left ? 0 : 0.12) - (right ? 0 : 0.1) - (below ? 0 : 0.18);
            const pal = k < 0.45 ? S.soil : S.rock;
            g[y][x] = shade(v, x, y, pal);
            // tuproq ichidagi toshchalar va qatlam chiziqlari
            const hh = hash(x >> 1, y >> 1, seed);
            if (hh < 0.05) g[y][x] = shade(v + 0.3, x, y, S.rock);
            if (!below && hash(x, y, seed + 3) < 0.5) g[y][x] = pal[0];
            // bazalt ichidagi lava tomirlari (qiyshiq yorqin chiziqchalar)
            // po'lat panellar: gorizontal / vertikal choklar, ba'zan neon yoki sariq chiroqcha
            if (S.panels && below) { const pr = d - 4; if (pr % 7 === 0) g[y][x] = S.soil[0]; else if ((x + Math.floor(pr / 7) * 5) % 12 === 0) g[y][x] = S.rock[0]; else if (hash(x, y, seed + 31) < 0.006) g[y][x] = hash(x, y, seed + 32) < 0.5 ? 0x40e0ff : 0xffd23f; }
            if (S.veins && below && left && right) { const vv = hash((x + (y >> 1)) >> 1, y >> 2, seed + 21); if (vv < 0.02) g[y][x] = vv < 0.007 ? 0xffc35a : 0xff5a1a; }
        }
        // pastki qirg'oqdan osilib turgan ildizlar / lianalar / kristallar / qo'ziqorinlar
        for (let x = 1; x < cw - 1; x++) for (let y = topRow + 3; y < chh - 1; y++) {
            if (fill[y][x] !== 1 || solid(x, y + 1)) continue;
            const hh = hash(x, y, seed + 11);
            if (S.hang === 'roots' && hh < 0.08) for (let k = 1; k <= 2 + Math.floor(hh * 40); k++) if (y + k < chh) g[y + k][x] = k % 3 ? 0x3a2418 : 0x2a1a10;
            if (S.hang === 'vines' && hh < 0.12) for (let k = 1; k <= 3 + Math.floor(hh * 50); k++) if (y + k < chh) g[y + k][x] = k % 4 === 3 ? S.grass[3] : S.grass[1];
            if (S.hang === 'crystal' && hh < 0.04) { if (y + 1 < chh) g[y + 1][x] = 0x7ee8ff; if (y + 2 < chh) g[y + 2][x] = 0x3fb6e0; }
            if (S.hang === 'shroom' && hh < 0.05) { if (y + 1 < chh) g[y + 1][x] = 0x9cff6e; }
            if (S.hang === 'moss' && hh < 0.13) { const n = 2 + Math.floor(hh * 55); for (let k = 1; k <= n; k++) if (y + k < chh) g[y + k][x] = k === n ? 0x7aa050 : k % 3 ? 0x3e6a30 : 0x2e5226; }
            if (S.hang === 'drip' && hh < 0.09) { const n = 1 + Math.floor(hh * 30); for (let k = 1; k <= n; k++) if (y + k < chh) g[y + k][x] = k === n ? (hh < 0.03 ? 0xffc35a : 0xff7a1a) : S.rock[1]; }
            if (S.hang === 'cables' && hh < 0.05) { const n = 3 + Math.floor(hh * 160); for (let k = 1; k <= n; k++) if (y + k < chh) g[y + k][x] = k === n ? (hh < 0.02 ? 0x40e0ff : 0xff3d3d) : 0x1a1f25; }
            if (S.hang === 'icicle' && hh < 0.16) { const n = 2 + Math.floor(hh * 30); for (let k = 1; k <= n; k++) if (y + k < chh) g[y + k][x] = k === n ? 0xd8f4ff : k > n - 2 ? 0x9ad8f0 : 0x5ab0d8; }
        }
        // o't uchlari (tepa qatlami ustida) va chetlardan osilgan o't
        // qor uyumchalari (tepa ustida) va chetdan osilgan qor
        if (S.top === 'snowtop') {
            for (let x = 0; x < cw; x++) {
                if (fill[topRow][x] !== 1) continue;
                const hh = hash(x >> 1, 1, seed + 5);
                if (hh < 0.6) g[topRow - 1][x] = hh < 0.3 ? 0xffffff : 0xe8f4ff;
                if (hh < 0.18) g[topRow - 2][x] = 0xffffff;
            }
        }
        if (S.top === 'grass' || S.top === 'cobble' || S.top === 'skystone' || S.top === 'mud') {
            const G = S.grass;
            for (let x = 0; x < cw; x++) {
                if (fill[topRow][x] !== 1) continue;
                const hh = hash(x, 1, seed + 5);
                if (S.top === 'grass' ? hh < 0.55 : hh < 0.18) { g[topRow - 1][x] = G[3]; if (hh < (S.top === 'grass' ? 0.2 : 0.05)) g[topRow - 2][x] = G[4] || G[3]; }
            }
        }
        // soxta pol (maxfiy xona) ustida juda sezilmas yoriq
        (I.fakes || []).forEach((f) => {
            const x0 = Math.round((f.x - ox) / P), x1 = Math.round((f.x + f.w - ox) / P);
            for (const xx of [x0, x1 - 1]) for (let y = topRow + 1; y < topRow + 6; y++) if (g[y] && g[y][xx] !== null && hash(xx, y, 9) < 0.6) g[y][xx] = S.soil[0];
        });
        // QOPQOQ manbasi: xona o'rnida - xuddi shu orol toshi (shu kataklar naqshi), atrofida 1 katak devor (chok yopiladi)
        I.r.filter(q => q[4]).forEach((q, n) => {
            const rockAt = (x, y) => {
                const d = y - topRow; if (d < 4) return surface(S, x, d, y, seed);
                const k = d / depthRows, v = 0.78 - k * 0.55, pal = k < 0.45 ? S.soil : S.rock;
                return hash(x >> 1, y >> 1, seed) < 0.05 ? shade(v + 0.3, x, y, S.rock) : shade(v, x, y, pal);
            };
            const rx0 = Math.round((q[0] - ox) / P), rx1 = Math.round((q[0] + q[2] - ox) / P), ry0 = Math.round((q[1] - oy) / P), ry1 = Math.round((q[1] + q[3] - oy) / P);
            const x0 = Math.max(0, rx0 - 1), x1 = Math.min(cw, rx1 + 1), y0 = Math.max(0, ry0 - 1), y1 = Math.min(chh, ry1 + 1), cg = gNew(x1 - x0, y1 - y0);
            for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
                const f = fill[y][x], inQ = x >= rx0 && x < rx1 && y >= ry0 && y < ry1;
                if (inQ && f) cg[y - y0][x - x0] = f === 2 ? rockAt(x, y) : g[y][x];
                else if (!inQ && f === 1) cg[y - y0][x - x0] = g[y][x];   // chetdagi devor katagi - o'zi (g'or kirish teshigi ochiq qoladi)
            }
            COVER_SRC.set(key + '#' + n, { g: cg, x: ox + x0 * P, y: oy + y0 * P });
        });
        const out = gOutline(g, OUT);
        if (scene.textures.exists(key)) scene.textures.remove(key);
        tex(scene, key, out, P);
        const pos = { key, x: ox - P, y: oy - P };
        ISLE_POS.set(key, pos);
        return pos;
    }
    // GORILA ROCK ZALI (S1 map-8 dagi zal aynan): to'q tosh devor (6 px katak), tepada tishli shift qirrasi, chap pastda ko'kish nurli eshik
    function hallTex(scene, key, w, h) {
        if (scene.textures.exists(key)) return key;
        const P = 6, cw = Math.ceil(w / P), ch = Math.ceil(h / P), g = gNew(cw, ch), ST = [0x3a3a40, 0x55555d, 0x72727a, 0x8f8f96];
        for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
            let v = 0.42 - y * P / 1800 + 0.08 * Math.sin(x * 0.45 + y * 0.3) * Math.sin(y * 0.21);
            if ((x * 7 + y * 13) % 29 === 0) v -= 0.2;
            g[y][x] = shade(v, x, y, [0x16141b, 0x1e1b24, 0x27232f, 0x302b3a]);
        }
        for (let x = 0; x < cw; x++) { g[0][x] = ST[2]; for (let y = 1; y <= (x * 7) % 3; y++) g[y][x] = ST[1]; }
        for (let y = ch - 17; y < ch; y++) for (let x = 1; x <= 12; x++) g[y][x] = y === ch - 17 || x === 1 || x === 12 ? ST[2] : x === 2 || x === 11 || y === ch - 16 ? 0x0b0b14 : 0x172e39;
        tex(scene, key, g, P);
        return key;
    }
    // MAXFIY XONA QOPQOG'I: orol toshi bilan bir xil (kontursiz) - qahramon ichiga kirguncha xonani yashiradi
    const COVER_SRC = new Map(), COVER_POS = new Map();
    const coverPos = (key) => COVER_POS.get(key);
    function coverTex(scene, key, I, q) {
        if (!scene.textures.exists(key) && WCV.has(key)) { scene.textures.addImage(key, WCV.get(key)); return key; }   // shu dunyoda oldin chizilgan
        // orol bilan bir xil naqshli manba bo'lsa - o'shandan (chok ko'rinmaydi)
        const m = /^bm_cov_(.+)_(\d+)$/.exec(key), src = m && COVER_SRC.get('bm_isle_' + m[1] + '#' + m[2]);
        if (src) { COVER_POS.set(key, { x: src.x, y: src.y }); return tex(scene, key, src.g, 4); }
        const P = 4, S = ISLE[I.k] || ISLE.cobble, cw = Math.ceil(q[2] / P), chh = Math.ceil(q[3] / P), seed = I.id * 31 + 7;
        const top = Math.round((q[1] - I.y) / P) - 3, depthRows = Math.max(1, Math.round((q[1] + q[3] - I.y) / P) + 10);
        const g = gNew(cw, chh);
        for (let y = 0; y < chh; y++) for (let x = 0; x < cw; x++) {
            const d = y + top + 3, k = d / depthRows, v = 0.78 - k * 0.55;
            g[y][x] = shade(v, x, y, k < 0.45 ? S.soil : S.rock);
            if (hash(x >> 1, (y + top) >> 1, seed) < 0.05) g[y][x] = shade(v + 0.3, x, y, S.rock);
        }
        return tex(scene, key, g, P);
    }
    // tepa qatlami katagi (d = 0..3)
    function surface(S, x, d, y, seed) {
        if (S.top === 'snowtop') {
            if (d === 0) return 0xffffff;
            if (d === 1) return hash(x, 1, seed) < 0.3 ? 0xd0e8fa : 0xe8f4ff;
            if (d === 2) return hash(x, 2, seed) < 0.5 ? 0xb8d8f0 : 0xd0e8fa;
            return hash(x, 3, seed) < 0.4 ? 0x9cc4e6 : S.soil[3];
        }
        if (S.top === 'deck') {
            // po'lat paluba: yorqin chet (ba'zan neon chiroq), ostida chok va ba'zan sariq-qora ogohlantirish chizig'i
            if (d === 0) return x % 4 === 1 && hash(x >> 2, 0, seed) < 0.12 ? 0x40e0ff : hash(x, 0, seed) < 0.2 ? 0xe8eef4 : 0xc9d3dc;
            if (d === 1) return x % 8 === 0 ? 0x5d6875 : 0x9aa6b4;
            if (d === 2) return hash(x >> 3, 2, seed) < 0.15 ? (((x >> 1) % 2) ? 0xffd23f : 0x1a1a1a) : 0x2a3038;
            return x % 8 === 4 ? 0x7b8896 : S.soil[3];
        }
        if (S.top === 'mud') {
            // moxli loy: tepasi mox, ostida ho'l loy (ba'zan yaltiragan ko'lmakcha)
            if (d === 0) return hash(x, 0, seed) < 0.35 ? S.grass[4] : S.grass[3];
            if (d === 1) return hash(x, 1, seed) < 0.45 ? S.grass[2] : 0x3a3020;
            if (d === 2) return hash(x >> 1, 2, seed) < 0.08 ? 0x5a7a6a : 0x2e2618;
            return hash(x, 3, seed) < 0.3 ? 0x2e2618 : S.soil[3];
        }
        if (S.top === 'basalt') {
            // bazalt: qora-kulrang, ba'zan cho'g' (lava uchqunlari) va yoriqlar
            if (d === 0) return hash(x, 0, seed) < 0.1 ? 0xff7a1a : hash(x, 0, seed + 1) < 0.3 ? 0x6a5e66 : 0x564a52;
            if ((x + d * 2) % 9 === 0 && d < 3) return 0x1a1418;
            if (d === 2 && hash(x, 2, seed) < 0.06) return 0xff5a1a;
            return shade(0.75 - d / 6, x, y, [0x2e262c, 0x3a3038, 0x463c44]);
        }
        if (S.top === 'icetop') {
            // muz: shishasimon, yaltiroq chiziqlar
            if (d === 0) return hash(x, 0, seed) < 0.25 ? 0xffffff : 0xc8f0ff;
            const gl = (x + d * 3) % 11 === 0;
            return gl ? 0xe8fbff : shade(0.8 - d / 7, x, y, [0x3a8ac0, 0x5ab0d8, 0x86d0ec]);
        }
        if (S.top === 'cobble') {
            if (d === 0) return hash(x, 0, seed) < 0.2 ? S.grass[3] : 0x9e97a8;
            const row = Math.floor((d - 1) / 3), mortar = (d - 1) % 3 === 2 || ((x + row * 3) % 6 === 5);
            return mortar ? 0x3a3444 : shade(0.8 - ((d - 1) % 3) / 5, x, y, [0x6d6578, 0x7f778a, 0x938ba0]);
        }
        if (S.top === 'brick') {
            if (d === 0) return 0x5d566e;
            const mortar = d === 2 || (x + (d > 2 ? 3 : 0)) % 7 === 0;
            return mortar ? 0x1a1622 : shade(0.7 - d / 8, x, y, [0x3a3349, 0x4a4260, 0x5b5275]);
        }
        if (S.top === 'roots') {
            if (d === 0) return hash(x, 0, seed) < 0.3 ? 0x5a4030 : 0x4a3424;
            return shade(0.7 - d / 6, x, y, [0x1d150f, 0x2e2318, 0x3f3022]);
        }
        if (S.top === 'skystone') {
            if (d === 0) return hash(x, 0, seed) < 0.35 ? S.grass[3] : 0xb7b2d1;
            return shade(0.85 - d / 6, x, y, [0x6c6590, 0x8c86ad, 0xaaa5c8]);
        }
        // o't
        const G = S.grass;
        if (d === 0) return hash(x, 0, seed) < 0.3 ? G[4] || G[3] : G[3];
        if (d === 1) return G[2];
        if (d === 2) return hash(x, 2, seed) < 0.5 ? G[1] : S.soil[3];
        return hash(x, 3, seed) < 0.25 ? G[1] : S.soil[3];
    }
    // POG'ONA-TOSH / bulut / taxta / shox (h 22 yoki 16)
    function stoneTex(scene, k, w, v) {
        const key = 'bm_st_' + k + '_' + w + '_' + v;
        if (scene.textures.exists(key)) return key;
        const P = 4, cw = Math.max(6, Math.round(w / P));
        let g;
        if (k === 'skyplate' || k === 'hoverpad') {
            // SKYLAND: uchib turgan po'lat plita (ostida havorang dvigatel nuri) / yumaloq uchuvchi maydoncha (maxfiy yo'l, osmon ko'priklari)
            const pad = k === 'hoverpad', ST = pad ? [0x9aa6b4, 0xc8d2dc, 0xe8eef4, 0xffffff] : [0x23292f, 0x46515d, 0x7b8896, 0xc9d3dc];
            g = art(cw, 7, (a) => {
                a.s(pad ? 1 : 0, 0, cw - (pad ? 2 : 0), 3, ST, 0.08); a.r(pad ? 1 : 0, 0, cw - (pad ? 2 : 0), 1, ST[3]);
                if (pad) { a.r(0, 1, cw, 1, ST[2]); a.r(2, 3, cw - 4, 1, 0x40e0ff); a.r(4, 4, cw - 8, 1, 0x1fa8d0); for (let x = 3; x < cw - 3; x += 5) a.p(x, 1, 0x40e0ff); }
                else { for (let x = 2; x < cw - 1; x += 6) a.p(x, 1, ST[1]); for (let x = 3; x + 3 < cw; x += 8) { a.r(x, 3, 3, 1, ST[1]); a.r(x, 4, 3, 1, 0x40e0ff); a.p(x + 1, 5, 0xd8fbff); } }
            });
        } else if (k === 'cloud' || k === 'fogcloud') {
            const fog = k === 'fogcloud';   // botqoq: kulrang-yashil tuman bo'lagi
            g = art(cw, 8, (a) => {
                const pal = fog ? [0x4a5a4e, 0x6a7a6c, 0x8a9a8a, 0xaabaa8] : [0xc98aa6, 0xe6b3c8, 0xf7d8e4, 0xffffff];
                for (let x = 0; x < cw; x += 3) a.e(x + 1.5, 3.5 - (hash(x, 0, v) * 1.6), 2.6, 2.4, pal, 0.1);
                a.r(1, 4, cw - 2, 3, pal[2]); a.r(1, 6, cw - 2, 1, pal[1]);
            }, fog ? 0x2a3a2e : 0xb07090);
        } else if (k === 'rootplat') {
            // kraken ko'lidagi pog'ona: chirmashgan ildizlardan to'qilgan sol, ostidan ildiz va mox osilgan
            g = art(cw, 7, (a) => {
                a.s(0, 0, cw, 3, C.bark, 0.08); for (let x = 2; x < cw; x += 4) a.line(x, 0, x + 2, 2, C.bark[0]);
                for (let x = 0; x < cw; x++) if (hash(x, v, 4) < 0.45) a.p(x, 0, C.moss[3]);
                for (let x = 2; x < cw - 1; x += 3 + (x % 2)) { const n = 1 + Math.floor(hash(x, v, 6) * 4); for (let y = 3; y < 3 + n; y++) a.p(x, y, y % 2 ? C.bark[1] : C.moss[2]); }
            });
        } else if (k === 'plank') {
            // TAXTA YO'L (robot ilon g'ori): mixlangan taxta, ostida arqon bog'ich
            g = art(cw, 5, (a) => {
                a.s(0, 0, cw, 3, C.wood, 0.1); for (let x = 5; x < cw; x += 6) a.r(x, 0, 1, 3, C.wood[0]);
                for (let x = 2; x < cw; x += 6) a.p(x, 1, C.iron[3]);
                a.r(1, 3, 1, 2, 0xc8a066); a.r(cw - 2, 3, 1, 2, 0xc8a066);
            });
        } else if (k === 'icestone') {
            g = art(cw, 7, (a) => {
                const pal = [0x2a6a9a, 0x4a9ac8, 0x7ac4e6, 0xc0ecff];
                for (let y = 0; y < 7; y++) { const half = cw / 2 * (1 - Math.max(0, y - 3) / 5); for (let x = Math.round(cw / 2 - half); x < Math.round(cw / 2 + half); x++) a.p(x, y, shade(0.9 - y / 9 - (x / cw) * 0.25, x, y, pal)); }
                for (let x = 0; x < cw; x++) a.p(x, 0, 0xe8fbff);
                for (let x = 2; x < cw - 2; x += 5) a.p(x, 2, 0xffffff);
                a.p(Math.floor(cw / 2), 7, 0x9ad8f0); a.p(Math.floor(cw / 3), 6, 0x9ad8f0);
            }, 0x0b2a44);
        } else if (k === 'ledge') {
            g = art(cw, 6, (a) => {
                a.s(0, 0, cw, 3, C.wood, 0.05); for (let x = 3; x < cw; x += 6) a.p(x, 1, C.wood[0]);
                a.r(1, 3, 1, 3, C.wood[1]); a.r(cw - 2, 3, 1, 3, C.wood[1]); a.line(1, 3, 3, 5, C.wood[0]); a.line(cw - 2, 3, cw - 4, 5, C.wood[0]);
            });
        } else if (k === 'branch') {
            g = art(cw, 7, (a) => {
                a.s(0, 2, cw, 4, C.bark, 0.1);
                for (let x = 2; x < cw - 2; x += 5) a.e(x + 2, 1.5, 2.6, 1.8, C.leafF, 0.1);
                for (let x = 7; x < cw - 2; x += 11) { a.p(x, 6, C.bark[1]); a.p(x, 7, C.bark[0]); }
            });
        } else {
            // muallaq tosh: tepasi tekis (yuriladigan), pasti uchli
            const moss = k === 'mossstone', snowy = k === 'snowstone', hot = k === 'basaltstone' || k === 'emberstone', ember = k === 'emberstone', bogs = k === 'bogstone', depth = 4 + Math.floor(hash(v, 1, 3) * 4);
            g = art(cw, 3 + depth, (a) => {
                const pal = moss ? [0x1e2722, 0x2f3d33, 0x45594a, 0x627c66] : snowy ? [0x1c2640, 0x2a3a5c, 0x3e527c, 0x5a72a0] : hot ? C.basalt : bogs ? [0x1a1e18, 0x283024, 0x3a4434, 0x4e5a46] : [0x2a2638, 0x3f3a54, 0x5a5476, 0x7e789a];
                for (let y = 0; y < 3 + depth; y++) {
                    const t = y < 2 ? 0 : (y - 2) / depth, half = (cw / 2) * (1 - Math.pow(t, 1.25)) - (y > 2 ? hash(y, v, 5) * 1.4 : 0);
                    for (let x = Math.round(cw / 2 - half); x < Math.round(cw / 2 + half); x++) a.p(x, y, shade(0.85 - t * 0.6 - (x / cw) * 0.3, x, y, pal));
                }
                if (bogs) { for (let x = 0; x < cw; x++) { a.p(x, 0, C.moss[3 + (x % 2)]); if (hash(x, v, 2) < 0.5) a.p(x, 1, C.moss[2]); } a.p(Math.floor(cw / 2), 3 + depth, 0x6a8a5a); return; }
                const top = moss ? C.leafF : snowy ? [0xb8d8f0, 0xe8f4ff, 0xffffff] : hot ? [0x564a52, 0x6a5e66, 0x7a6e76] : [0x8f88aa, 0xa49dbd, 0xbab4d1];
                // cho'g'li tosh: pastki uchi lavadan qizib turadi; bazalt - yoriqda cho'g'
                if (ember) for (let y = 3 + depth - 3; y < 3 + depth; y++) for (let x = 0; x < cw; x++) if (a.g[y][x] !== null) a.p(x, y, y === 3 + depth - 1 ? 0xffc35a : 0xff5a1a);
                if (hot && !ember) a.p(Math.floor(cw / 2) + (v % 3) - 1, 2 + Math.floor(depth / 2), 0xff7a1a);
                for (let x = 0; x < cw; x++) { a.p(x, 0, top[top.length - 1 - (x % 2)]); if ((moss || snowy) && hash(x, v, 2) < (snowy ? 0.8 : 0.4)) a.p(x, 1, top[snowy ? 1 : 2]); if (snowy && hash(x, v, 7) < 0.2) a.p(x, 2, 0xb8d8f0); }
            });
        }
        return tex(scene, key, g, P);
    }

    // ===== BEZAKLAR =====
    // har biri: [kenglik, balandlik, P, chizish]; o'rnatilishi - pastki markazdan
    // SKYLAND palitralari: po'lat, shisha, oq panel, to'q sariq urg'u, neon
    const STL = [0x23292f, 0x46515d, 0x7b8896, 0xc9d3dc], GLS = [0x0e3a5c, 0x1c6aa0, 0x40a8e0, 0xa8e8ff], WHT = [0x9aa6b4, 0xc8d2dc, 0xe8eef4, 0xffffff], ORG = [0x7a2e0c, 0xc0501c, 0xff7a2a, 0xffb07a];
    const NEON = 0x40e0ff, NPINK = 0xff4fd8, AMB = 0xffd23f, SCR = [0x0a0a1a, 0x14143a, 0x1e1e5a, 0x2a2a7a], LEAF = [0x1e4a1a, 0x2e6a26, 0x4a8c38, 0x7ab85a];
    const glass = (a, x, y, w, h, lit) => { a.s(x, y, w, h, GLS, 0.1); a.r(x, y, 1, h, GLS[3]); a.r(x, y, w, 1, GLS[2]); if (lit) a.r(x + 2, y + h - 3, Math.max(1, w - 4), 2, 0xffe9a8); };
    const PROPS = {
        // ===== SKYLAND =====
        skyhouse: [32, 36, 4, (a) => {
            a.s(2, 10, 28, 26, WHT, 0.05); a.r(0, 8, 32, 3, STL[2]); a.r(0, 8, 32, 1, STL[3]); a.r(2, 11, 28, 1, NEON);
            glass(a, 5, 15, 13, 10, true); a.r(11, 15, 1, 10, STL[1]);
            a.s(21, 22, 7, 14, STL, 0.1); a.r(26, 28, 1, 2, NEON); a.r(1, 35, 30, 1, STL[1]);
            a.s(4, 4, 7, 4, STL, 0.1); a.r(5, 5, 5, 1, STL[0]); a.r(26, 1, 1, 7, STL[2]); a.p(26, 0, 0xff3d3d);
        }],
        skyhouse2: [34, 30, 4, (a) => {
            a.s(1, 14, 22, 16, WHT, 0.05); a.s(10, 4, 23, 11, ORG, 0.05); a.r(10, 4, 23, 1, ORG[3]);
            glass(a, 13, 7, 17, 5, false); a.r(21, 7, 1, 5, ORG[0]);
            glass(a, 3, 18, 9, 8, true); a.s(15, 19, 6, 11, STL, 0.1); a.p(19, 24, NEON);
            a.r(10, 14, 23, 1, STL[3]); for (let x = 12; x < 33; x += 4) a.r(x, 15, 1, 3, STL[2]); a.r(24, 17, 9, 1, STL[3]);
            a.r(1, 14, 9, 1, NEON); a.r(0, 29, 34, 1, STL[1]);
        }],
        skytower: [16, 56, 4, (a) => {
            a.s(2, 6, 12, 50, GLS, 0.05); a.r(1, 5, 14, 2, STL[2]); a.r(7, 0, 2, 6, STL[2]); a.p(7, 0, 0xff3d3d);
            for (let y = 8; y < 55; y += 4) { a.r(2, y, 12, 1, STL[1]); for (let x = 3; x < 13; x += 3) if (hash(x, y, 5) < 0.35) a.r(x, y + 1, 2, 2, 0xffe9a8); }
            a.r(2, 20, 12, 1, NEON); a.r(2, 38, 12, 1, NPINK); a.r(2, 6, 1, 50, GLS[3]);
        }],
        streetlamp: [10, 34, 3, (a) => { a.s(4, 6, 2, 28, STL); a.r(2, 32, 6, 2, STL[1]); a.r(4, 4, 6, 2, STL[2]); a.r(6, 5, 4, 2, STL[1]); a.r(6, 7, 4, 1, NEON); a.p(7, 8, 0xd8fbff); a.p(8, 8, 0xd8fbff); }],
        billboard: [30, 26, 3, (a) => {
            a.s(5, 14, 2, 12, STL); a.s(23, 14, 2, 12, STL); a.s(1, 1, 28, 14, SCR, 0.05);
            [[1, 1, 28, 1], [1, 14, 28, 1], [1, 1, 1, 14], [28, 1, 1, 14]].forEach(([x, y, w, h]) => a.r(x, y, w, h, NPINK));
            a.r(5, 5, 9, 2, NEON); a.r(5, 9, 13, 2, AMB); a.e(22, 8, 3, 3, [0x7a5200, 0xc78a00, 0xffd23f, 0xfff2b0]);
        }],
        bench: [20, 9, 3, (a) => { a.r(1, 0, 18, 1, STL[2]); a.r(1, 1, 1, 2, STL[1]); a.r(18, 1, 1, 2, STL[1]); a.s(1, 3, 18, 2, STL, 0.15); a.r(1, 3, 18, 1, 0x26a69a); a.r(3, 5, 1, 4, STL[1]); a.r(16, 5, 1, 4, STL[1]); }],
        planter: [14, 14, 3, (a) => { a.s(1, 9, 12, 5, STL, 0.1); a.r(1, 9, 12, 1, STL[3]); a.r(6, 5, 2, 4, 0x5d4037); a.e(7, 5, 5, 4, LEAF, 0.1); a.p(5, 3, LEAF[3]); a.p(9, 4, LEAF[3]); }],
        antenna: [12, 34, 3, (a) => {
            a.line(2, 33, 6, 4, STL[2]); a.line(10, 33, 6, 4, STL[2]); a.line(3, 33, 6, 5, STL[1]); a.line(9, 33, 6, 5, STL[1]);
            for (let y = 9; y < 33; y += 5) { const k = (y - 4) / 29; a.line(Math.round(6 - k * 4), y, Math.round(6 + k * 4), y, STL[1]); }
            a.e(3, 13, 3, 2, WHT, 0.1); a.r(6, 0, 1, 5, STL[3]); a.p(6, 0, 0xff3d3d); a.p(6, 1, 0xff8080);
        }],
        vending: [12, 20, 3, (a) => {
            a.s(0, 1, 12, 19, [0x7a0a1a, 0xb0102a, 0xe0283c, 0xff7a8a], 0.05); a.r(1, 1, 10, 1, 0xfff2b0); a.s(2, 3, 6, 11, GLS, 0.1);
            for (let y = 5; y < 13; y += 3) for (let x = 3; x < 8; x += 2) a.p(x, y, [AMB, NEON, 0x7cff6a][(x + y) % 3]);
            a.r(9, 4, 2, 6, STL[3]); a.p(9, 5, NEON); a.r(2, 16, 6, 2, 0x0a0a0a);
        }],
        solar: [22, 12, 3, (a) => { a.r(10, 7, 2, 5, STL[1]); a.r(7, 11, 8, 1, STL[1]); a.s(1, 1, 20, 6, [0x0a1a3a, 0x12305e, 0x1e4a8a, 0x3a6ab8], 0.1); for (let x = 5; x < 21; x += 4) a.r(x, 1, 1, 6, 0x5a7ab8); a.r(1, 1, 20, 1, STL[3]); a.r(1, 4, 20, 1, 0x5a7ab8); a.r(1, 7, 20, 1, STL[1]); }],
        turbine: [20, 40, 3, (a) => {
            a.s(9, 10, 2, 30, WHT, 0.1); a.r(7, 38, 6, 2, STL[1]);
            [[10, 0], [2, 14], [18, 14]].forEach(([x, y]) => { a.line(10, 9, x, y, WHT[2]); a.line(10, 8, x + (x < 10 ? 1 : x > 10 ? -1 : 1), y, WHT[1]); });
            a.e(10, 9, 2, 2, WHT, 0.1); a.p(10, 9, STL[1]);
        }],
        shopkiosk: [34, 34, 4, (a) => {
            a.s(2, 12, 30, 22, WHT, 0.05); glass(a, 4, 16, 18, 10, true); a.r(3, 26, 20, 2, STL[2]); a.s(24, 18, 6, 16, STL, 0.1); a.p(28, 25, NEON);
            for (let x = 0; x < 34; x += 4) { a.r(x, 9, 2, 3, 0x00b8d4); a.r(x + 2, 9, 2, 3, WHT[3]); } a.r(0, 12, 34, 1, STL[1]);
            a.s(6, 1, 22, 7, SCR, 0.05); a.r(6, 1, 22, 1, NEON); a.r(6, 7, 22, 1, NEON); a.e(11, 4, 2, 2, [0x7a5200, 0xc78a00, 0xffd23f, 0xfff2b0]); a.r(15, 3, 10, 1, NEON); a.r(15, 5, 7, 1, NPINK);
            a.r(8, 8, 1, 1, STL[2]); a.r(25, 8, 1, 1, STL[2]); a.r(1, 33, 32, 1, STL[1]);
        }],
        cargo: [26, 16, 4, (a) => { a.s(0, 2, 26, 14, [0x0d3a5c, 0x13588a, 0x1f7ab8, 0x58a8e0], 0.05); for (let x = 2; x < 26; x += 3) a.r(x, 3, 1, 12, 0x0d3a5c); a.r(0, 2, 26, 1, 0x58a8e0); a.r(13, 3, 1, 13, 0x0a2a44); a.r(11, 7, 1, 5, STL[3]); a.r(15, 7, 1, 5, STL[3]); a.r(3, 5, 7, 2, AMB); a.r(0, 15, 26, 1, 0x0a2a44); }],
        barrier: [20, 10, 3, (a) => { a.r(2, 4, 2, 6, STL[1]); a.r(16, 4, 2, 6, STL[1]); a.r(1, 9, 4, 1, STL[0]); a.r(15, 9, 4, 1, STL[0]); for (let x = 0; x < 20; x++) a.r(x, 2, 1, 3, ((x >> 1) % 2) ? AMB : 0x1a1a1a); a.r(0, 2, 20, 1, 0xfff2b0); }],
        pylon: [10, 40, 3, (a) => { a.s(3, 8, 4, 32, STL, 0.1); a.r(2, 36, 6, 4, STL[1]); a.r(2, 10, 6, 1, NEON); a.r(2, 20, 6, 1, NEON); a.r(2, 30, 6, 1, NEON); a.e(5, 4, 3, 3, [0x0a6a8a, 0x10a8d0, 0x40e0ff, 0xd8fbff], 0.1); }],
        neonlamp: [8, 20, 3, (a) => { a.r(3, 7, 2, 12, STL[1]); a.r(1, 18, 6, 2, STL[1]); a.r(2, 0, 4, 7, NEON); a.r(3, 1, 2, 5, 0xd8fbff); }],
        server: [12, 22, 3, (a) => { a.s(0, 0, 12, 22, [0x0e1014, 0x181b22, 0x23272f, 0x2f343e], 0.05); for (let y = 2; y < 20; y += 3) { a.r(1, y, 10, 2, 0x0a0c10); a.p(2, y, (y % 2) ? 0x40ff80 : NEON); a.p(4, y, AMB); a.r(6, y + 1, 4, 1, 0x2f343e); } }],
        heater: [10, 22, 3, (a) => { a.s(4, 8, 2, 12, STL); a.e(5, 20, 4, 2, STL, 0.1); a.r(1, 2, 8, 2, STL[2]); a.r(1, 2, 8, 1, STL[3]); a.e(5, 6, 3, 2, [0x7a1a00, 0xd84300, 0xff8a00, 0xffd23f], 0.2); a.p(5, 5, 0xfff2b0); }],
        // ELF QIROLLIGI: semiz elf o'tlog'i (qon dog'i, uzilgan qo'l, yarim oyog'i qolgan elf), bolalar qafasi, robot ilon ini
        bloodpool: [30, 4, 3, (a) => { a.e(15, 2, 14.5, 1.8, [0x01315c, 0x01579b, 0x0277bd], 0.05); a.e(8, 2, 5, 1.2, [0x0277bd, 0x0288d1]); a.p(22, 1, 0x29b6f6); a.p(4, 3, 0x01579b); }, null],
        elfhand: [12, 6, 3, (a) => { a.e(6, 4.5, 6, 1.4, [0x01579b, 0x0277bd], 0.05); a.s(1, 2, 6, 2, [0x2b6f9e, 0x4fa3d1, 0x81d4fa]); a.r(7, 1, 3, 1, 0x81d4fa); a.r(7, 3, 3, 1, 0x4fa3d1); a.p(10, 1, 0x81d4fa); a.p(10, 3, 0x81d4fa); a.r(0, 2, 2, 2, 0x0288d1); a.p(0, 1, 0x29b6f6); }],
        elfhalf: [22, 14, 3, (a) => {
            a.e(11, 12, 11, 1.8, [0x01315c, 0x01579b, 0x0277bd]);
            a.s(3, 7, 10, 5, [0x1b5e20, 0x2e7d32, 0x43a047]); a.r(3, 7, 10, 1, 0x66bb6a);                       // tanasi (yashil kamzul)
            a.s(13, 6, 5, 5, [0x2b6f9e, 0x4fa3d1, 0x81d4fa]); a.r(14, 7, 1, 1, 0x0d1b3e); a.r(16, 7, 1, 1, 0x0d1b3e); a.p(15, 9, 0x01579b);   // boshi
            a.s(17, 3, 5, 4, [0x2e7d32, 0x388e3c, 0xffeb3b]); a.p(21, 3, 0xffeb3b);                           // qalpoq (tushib qolgan)
            a.s(0, 9, 4, 2, [0x4e342e, 0x5d4037]); a.r(0, 8, 2, 4, 0x0288d1); a.p(1, 7, 0x29b6f6);             // yarim oyoq - qonli
            [[5, 6], [9, 5], [6, 11], [12, 4]].forEach(([x, y]) => a.p(x, y, 0x0288d1));
        }],
        kidcage: [26, 30, 3, (a) => {
            a.s(1, 26, 24, 4, C.wood); a.s(1, 0, 24, 3, C.wood, 0.05); a.r(1, 3, 24, 1, C.iron[1]);
            // ichida ikki kichkina elf (qo'rqib o'tiribdi)
            [[6, 0x81d4fa, 0xc62828], [15, 0x9be0ff, 0x1565c0]].forEach(([x, sk, tu]) => { a.s(x, 18, 6, 8, [tu, tu, tu]); a.r(x + 1, 12, 5, 6, sk); a.p(x + 2, 14, 0x0d1b3e); a.p(x + 4, 14, 0x0d1b3e); a.p(x + 3, 16, 0x5d0000); a.r(x, 10, 7, 2, 0x2e7d32); a.p(x + 3, 9, 0xffeb3b); a.p(x - 1, 14, sk); a.p(x + 7, 14, sk); });
            for (let x = 2; x < 25; x += 3) a.r(x, 3, 1, 23, C.iron[2]);
            a.r(10, 14, 5, 3, C.iron[3]); a.p(12, 15, OUT);                                                    // qulf
        }],
        kidcage_open: [26, 30, 3, (a) => { a.s(1, 26, 24, 4, C.wood); a.s(1, 0, 24, 3, C.wood, 0.05); a.r(1, 3, 24, 1, C.iron[1]); for (let x = 2; x < 13; x += 3) a.r(x, 3, 1, 23, C.iron[2]); for (let k = 0; k < 5; k++) a.line(15 + k * 2, 4, 22 + k, 25, C.iron[1]); }],
        // SHAXMAT HAYKALLARI (Qora Ritsar zali): qora marmar, binafsha yaltirash; Shoh - qora toj bilan / tojsiz (toj olingach)
        chessqueen: [30, 58, 3, (a) => chessPiece(a, 'queen')],
        chessking: [30, 60, 3, (a) => chessPiece(a, 'king')],
        chessking0: [30, 60, 3, (a) => chessPiece(a, 'king0')],
        snakeden: [46, 52, 3, (a) => {
            a.e(23, 30, 22, 22, C.stone, -0.05); a.e(23, 31, 16, 18, [0x050406, 0x0c0a10, 0x16121c]);           // devordagi teshik
            for (let k = 0; k < 9; k++) { const an = Math.PI + k / 8 * Math.PI; a.e(23 + Math.cos(an) * 18, 31 + Math.sin(an) * 19, 2.4, 2.4, C.iron, 0.1); }   // temir ramka
            a.p(19, 30, 0xff1744); a.p(27, 30, 0xff1744);                                                       // ichida - qizil ko'zlar
            a.s(4, 48, 38, 4, C.stone, -0.1); for (let x = 8; x < 40; x += 6) { a.r(x, 47, 3, 1, 0xf2c640); a.r(x + 3, 47, 3, 1, OUT); }   // ogohlantirish chizig'i
            a.e(23, 7, 4, 3, C.bone, 0.1); a.p(22, 7, OUT); a.p(24, 7, OUT);
        }],
        tree: [22, 32, 3, (a) => { a.s(9, 19, 4, 13, C.bark); a.p(8, 31, C.bark[1]); a.p(13, 31, C.bark[1]); a.e(11, 11, 10, 8, C.leafE); a.e(6, 14, 5, 4, C.leafE, -0.05); a.e(16, 13, 6, 5, C.leafE, -0.08); a.e(9, 7, 5, 4, C.leafE, 0.1); [[5, 12], [15, 9], [12, 15]].forEach(([x, y]) => a.p(x, y, 0xd84a4a)); }],
        bigtree: [34, 56, 3, (a) => { a.s(14, 26, 7, 30, C.bark); a.s(11, 52, 13, 4, C.bark, -0.1); a.line(14, 40, 6, 30, C.bark[2]); a.line(21, 36, 28, 28, C.bark[1]); a.e(17, 16, 16, 12, C.leafF); a.e(8, 24, 8, 6, C.leafF, -0.05); a.e(27, 22, 7, 6, C.leafF, -0.08); a.e(15, 8, 9, 6, C.leafF, 0.1); for (let i = 0; i < 6; i++) a.p(4 + i * 5, 26 + (i % 2) * 3, C.leafF[1]); }],
        pine: [18, 38, 3, (a) => { a.s(8, 32, 3, 6, C.bark); for (let k = 0; k < 5; k++) a.roof(9, 2 + k * 6, 8, 2 + k, 6 + k * 2.4, C.leafF); a.p(9, 1, C.leafF[3]); }],
        lamp: [9, 32, 3, (a) => { a.s(3, 9, 3, 22, C.iron); a.r(2, 30, 5, 2, C.iron[1]); a.r(1, 3, 7, 1, C.iron[1]); a.r(2, 4, 5, 5, GLOW); a.r(3, 5, 3, 3, GLOW2); a.r(1, 9, 7, 1, C.iron[1]); a.r(3, 1, 3, 2, C.iron[1]); }],
        banner: [11, 32, 3, (a) => { a.s(1, 0, 2, 32, C.wood); a.p(1, 0, C.gold[3]); a.s(3, 3, 7, 16, C.blue); a.r(3, 19, 3, 3, C.blue[1]); a.r(7, 19, 3, 3, C.blue[1]); a.r(5, 8, 3, 3, C.gold[3]); a.p(6, 12, C.gold[2]); a.r(3, 3, 7, 1, C.gold[2]); }],
        flowers: [18, 7, 3, (a) => { [1, 5, 9, 13, 16].forEach((x, i) => { a.r(x, 3, 1, 4, C.leafE[2]); a.p(x + 1, 5, C.leafE[3]); a.r(x - 1, 1, 3, 2, [0xd84a4a, 0xf2c640, 0xb06ad0, 0x5fa8e8, 0xf5f5f5][i]); a.p(x, 1, 0xfff2b0); }); }, null],
        fern: [16, 10, 3, (a) => { for (let i = 0; i < 5; i++) { const x = 2 + i * 3; a.line(x, 9, x + (i - 2), 2 + (i % 2), C.leafF[2 + (i % 2)]); a.p(x - 1, 5, C.leafF[3]); a.p(x + 1, 4, C.leafF[3]); } }],
        // FERMA: ekin qatori (karam), katta sabzi (yerdan bandi va uchi chiqib turibdi), qo'rqinchoq
        crops: [34, 12, 3, (a) => { a.r(0, 10, 34, 2, C.mud[1]); [5, 17, 29].forEach((x) => { a.e(x, 7, 4.6, 3.6, [0x1e4a1a, 0x2e6a26, 0x4a8c38, 0x7ab85a], 0.1); a.line(x, 7, x - 3, 3, 0x2e6a26); a.line(x, 7, x + 3, 3, 0x4a8c38); a.p(x, 6, 0xa8d880); }); }],
        carrotbig: [30, 34, 3, (a) => {
            a.e(15, 31, 14, 3.4, C.mud, 0.05);
            a.e(15, 27, 6, 4, [0x8a3a06, 0xc85a10, 0xf07a1e, 0xffa54a], 0.15); for (let y = 25; y < 30; y += 2) a.r(11, y, 3, 1, 0x9a4808);
            [[-6, 2], [-3, 0], [0, -1], [3, 0], [6, 2]].forEach(([d, t], i) => { for (let k = 0; k < 18 - Math.abs(d); k++) { const x = 15 + Math.round(d * k / 10), y = 23 - k + t; a.p(x, y, i % 2 ? 0x2e7a26 : 0x4a9a38); if (k % 3 === 0) { a.p(x - 1, y, 0x3a8a2e); a.p(x + 1, y, 0x5ab248); } } });
        }],
        scarecrow: [22, 40, 3, (a) => {
            a.r(10, 8, 2, 32, C.wood[1]); a.r(1, 14, 20, 2, C.wood[2]);
            a.s(6, 15, 10, 11, [0x3a2a5a, 0x4a3a7a, 0x5e4e94], 0.05); a.r(6, 24, 10, 1, 0x2a1a0e);
            [[0, 15], [20, 15], [9, 26], [12, 26]].forEach(([x, y]) => { a.p(x, y, 0xe8c858); a.p(x, y + 1, 0xc8a040); });
            a.e(11, 10, 4, 4, [0xa08050, 0xc8a870, 0xe0c890], 0.1); a.p(9, 9, 0x201010); a.p(13, 9, 0x201010); a.line(9, 12, 13, 12, 0x201010);
            a.r(5, 5, 12, 2, [0xa08040][0]); a.r(7, 2, 8, 3, 0xc8a050); a.r(7, 4, 8, 1, 0x8a2a1a);
        }],
        fence: [26, 11, 3, (a) => { [0, 8, 16, 24].forEach(x => a.s(x, 0, 2, 11, C.wood)); a.r(0, 3, 26, 2, C.wood[2]); a.r(0, 7, 26, 2, C.wood[1]); }],
        well: [18, 22, 4, (a) => { a.s(1, 13, 16, 9, C.stone); for (let x = 1; x < 17; x += 4) a.p(x, 16, C.stone[0]); a.r(2, 13, 14, 2, C.stone[4]); a.s(2, 4, 2, 9, C.wood); a.s(14, 4, 2, 9, C.wood); a.roof(9, 0, 5, 6, 20, C.roofR); a.r(7, 6, 4, 4, C.wood[1]); a.r(8, 9, 2, 4, C.iron[2]); }],
        cart: [26, 16, 3, (a) => { a.s(1, 4, 21, 6, C.wood); a.r(1, 4, 21, 1, C.wood[3]); a.e(6, 3, 3, 2, [0xb8862b, 0xe0aa3c, 0xf6cf5a]); a.e(12, 2, 3, 2.4, C.green); a.e(17, 3, 3, 2, [0x8e1a1e, 0xc62f2f, 0xef5f50]); a.e(6, 12, 3.4, 3.4, C.wood, -0.1); a.e(17, 12, 3.4, 3.4, C.wood, -0.1); a.p(6, 12, C.iron[3]); a.p(17, 12, C.iron[3]); a.r(22, 7, 4, 1, C.wood[1]); }],
        bush: [20, 11, 3, (a) => { a.e(10, 6, 9, 5, C.leafE); a.e(5, 6, 4, 4, C.leafE, -0.05); a.e(15, 5, 5, 4, C.leafE, 0.05); [[5, 5], [12, 4], [15, 7]].forEach(([x, y]) => a.p(x, y, 0xd84a4a)); }],
        house: [34, 36, 4, (a) => house(a, C.roofR)], house2: [34, 36, 4, (a) => house(a, C.roofB)],
        stall: [26, 24, 4, (a) => { for (let x = 0; x < 26; x++) for (let y = 0; y < 6; y++) a.p(x, y, Math.floor(x / 4) % 2 ? 0xc62f2f : 0xf2ece0); for (let x = 1; x < 26; x += 4) { a.p(x, 6, 0xc62f2f); a.p(x + 1, 6, 0xc62f2f); } a.s(2, 7, 2, 17, C.wood); a.s(22, 7, 2, 17, C.wood); a.r(4, 8, 18, 9, 0x1e1620); a.s(1, 16, 24, 8, C.wood); a.r(1, 16, 24, 1, C.wood[3]); a.e(7, 14, 2, 2, [0xb8862b, 0xe0aa3c, 0xf6cf5a]); a.e(12, 14, 2, 2, C.green); a.e(17, 14, 2, 2, [0x8e1a1e, 0xc62f2f, 0xef5f50]); }],
        tower: [16, 48, 4, (a) => { a.s(3, 14, 10, 34, C.stone); for (let y = 16; y < 48; y += 4) for (let x = 3 + (y / 4 % 2) * 2; x < 13; x += 4) a.p(x, y, C.stone[0]); a.r(2, 12, 12, 3, C.stone[3]); for (let x = 2; x < 14; x += 3) a.r(x, 10, 2, 2, C.stone[3]); a.roof(8, 0, 10, 2, 12, C.roofB); a.r(7, 20, 2, 4, GLOW); a.r(7, 32, 2, 4, GLOW); a.p(8, 0, C.gold[3]); }],
        statue: [14, 30, 4, (a) => { a.s(1, 23, 12, 7, C.stone); a.r(1, 23, 12, 1, C.stone[4]); a.s(4, 6, 6, 9, C.white); a.s(4, 15, 2, 8, C.white); a.s(8, 15, 2, 8, C.white); a.e(7, 3, 2.5, 2.8, C.white); a.r(11, 1, 1, 14, C.iron[3]); a.r(10, 3, 3, 1, C.gold[3]); a.s(2, 7, 2, 6, C.white, -0.1); }],
        castle: [96, 74, 4, (a) => {
            a.s(8, 22, 80, 52, C.stone); for (let y = 24; y < 74; y += 4) for (let x = 8 + (y / 4 % 2) * 3; x < 88; x += 6) a.p(x, y, C.stone[1]);
            for (let x = 8; x < 88; x += 6) a.s(x, 17, 4, 5, C.stone, 0.1);
            [0, 78].forEach(x => { a.s(x, 8, 18, 66, C.stone, 0.05); for (let k = 0; k < 18; k += 5) a.s(x + k, 3, 3, 5, C.stone, 0.1); a.r(x + 7, 24, 4, 7, GLOW); a.r(x + 7, 44, 4, 7, GLOW); });
            a.s(36, 40, 24, 34, C.wood, -0.2); a.r(36, 40, 24, 2, C.stone[0]); for (let x = 38; x < 58; x += 4) a.r(x, 42, 1, 30, C.iron[1]); a.r(36, 52, 24, 1, C.iron[1]);
            a.r(22, 30, 6, 8, GLOW); a.r(68, 30, 6, 8, GLOW); a.s(44, 24, 8, 10, C.blue); a.r(46, 27, 4, 4, C.gold[3]);
            a.s(4, 22, 3, 14, C.blue); a.s(89, 22, 3, 14, C.blue);
        }],
        pillar: [12, 40, 3, (a) => { a.s(0, 0, 12, 3, C.stone, 0.1); a.s(2, 3, 8, 33, C.stone); for (let x = 3; x < 10; x += 2) a.r(x, 4, 1, 31, C.stone[1]); a.s(0, 36, 12, 4, C.stone); a.r(2, 14, 8, 2, C.red[2]); a.e(6, -1 + 2, 3, 2, [0xff8a3d, 0xffc35a, 0xfff2b0]); }],
        gobtent: [28, 22, 4, (a) => { a.roof(14, 2, 20, 2, 26, C.leather); for (let k = 4; k < 22; k += 5) a.line(14, 2, 2 + k * 0.1, 21, C.leather[0]); a.r(11, 12, 6, 10, 0x140d0a); a.r(13, 0, 2, 4, C.wood[2]); a.e(14, 7, 2.2, 2, C.bone); a.p(13, 7, OUT); a.p(15, 7, OUT); a.r(1, 19, 4, 3, C.bone[1]); }],
        tent: [24, 18, 4, (a) => { a.roof(12, 1, 17, 2, 23, [0x5a4632, 0x7d6448, 0xa38866, 0xc8ad88]); a.r(10, 9, 5, 9, 0x140d0a); a.r(11, 0, 2, 3, C.wood[2]); for (let x = 4; x < 22; x += 5) a.p(x, 14, 0x9c3a2a); }],
        campfire: [16, 14, 3, (a) => { a.s(1, 11, 14, 3, C.wood); a.line(2, 13, 13, 10, C.wood[1]); a.e(8, 7, 4, 5, [0xb3261e, 0xff7a1a, 0xffc35a, 0xfff2b0], 0.15); a.e(8, 8, 2, 3, [0xffc35a, 0xfff2b0], 0.2); [[3, 12], [13, 12]].forEach(([x, y]) => a.r(x - 1, y - 1, 3, 2, C.stone[2])); }],
        crates: [20, 18, 3, (a) => { a.s(0, 8, 10, 10, C.wood); a.s(10, 6, 10, 12, C.wood, -0.05); a.s(4, 0, 9, 8, C.wood, 0.05); [[0, 8, 10, 10], [10, 6, 10, 12], [4, 0, 9, 8]].forEach(([x, y, w, h]) => { a.line(x, y, x + w - 1, y + h - 1, C.wood[0]); a.r(x, y, w, 1, C.wood[3]); }); }],
        flag: [12, 26, 3, (a) => { a.s(1, 0, 2, 26, C.wood); a.p(1, 0, C.gold[3]); a.s(3, 2, 8, 7, C.red); a.r(3, 9, 5, 2, C.red[1]); a.p(6, 5, C.gold[3]); }],
        crystal: [12, 18, 3, (a) => { const pal = [0x1f6f8e, 0x3fb6e0, 0x7ee8ff, 0xd8fbff]; a.roof(6, 0, 18, 1, 5, pal); a.roof(2, 7, 11, 1, 3, pal); a.roof(10, 5, 13, 1, 3, pal); a.s(1, 16, 10, 2, C.stone); }],
        ruin: [18, 24, 3, (a) => { a.s(2, 6, 6, 18, C.stone); a.s(2, 3, 4, 3, C.stone, 0.1); a.s(10, 14, 7, 10, C.stone, -0.05); a.r(3, 8, 1, 14, C.stone[4]); a.e(13, 12, 3, 1.6, C.leafE); a.p(5, 6, C.leafE[3]); }],
        torch: [8, 18, 3, (a) => { a.s(3, 6, 2, 12, C.wood); a.r(2, 6, 4, 1, C.iron[2]); a.e(4, 3, 2.2, 3, [0xb3261e, 0xff7a1a, 0xffc35a, 0xfff2b0], 0.2); }],
        pipe: [12, 24, 3, (a) => { a.s(3, 0, 6, 24, C.iron); a.r(2, 6, 8, 2, C.iron[1]); a.r(2, 16, 8, 2, C.iron[1]); a.r(4, 22, 4, 2, 0x5d7a3a); a.p(5, 23, 0x8fc24c); }],
        bones: [16, 7, 3, (a) => { a.r(2, 3, 11, 1, C.bone[2]); a.e(1.5, 3, 1.5, 1.6, C.bone); a.e(13.5, 3, 1.5, 1.6, C.bone); a.e(10, 5, 2.4, 2, C.bone, 0.05); a.p(9, 5, OUT); a.p(11, 5, OUT); }],
        barrel: [11, 14, 3, (a) => { a.s(1, 0, 9, 14, C.wood); a.r(1, 2, 9, 1, C.iron[1]); a.r(1, 10, 9, 1, C.iron[1]); a.r(3, 0, 1, 14, C.wood[3]); }],
        signpost: [16, 22, 3, (a) => { a.s(7, 4, 2, 18, C.wood); a.s(1, 3, 14, 5, C.wood, 0.1); a.r(15, 4, 1, 3, C.wood[2]); a.r(3, 5, 9, 1, C.wood[0]); a.s(2, 10, 12, 4, C.wood, 0.05); a.r(1, 11, 1, 2, C.wood[2]); }],
        endgate: [44, 56, 4, (a) => { a.s(0, 8, 9, 48, C.stone); a.s(35, 8, 9, 48, C.stone); a.s(0, 0, 44, 9, C.stone, 0.1); a.r(19, 1, 6, 6, C.gold[3]); for (let y = 9; y < 56; y++) for (let x = 9; x < 35; x++) a.p(x, y, shade(0.5 + 0.35 * Math.sin((x + y) / 4), x, y, [0x2a0d55, 0x4a148c, 0x7c4dff, 0xb388ff])); }],
        mushroom: [11, 11, 3, (a) => { a.e(5.5, 3, 5, 3.2, [0x7a1018, 0xb3261e, 0xe04a3a], 0.1); a.p(3, 2, 0xffffff); a.p(7, 1, 0xffffff); a.p(8, 3, 0xffffff); a.s(4, 5, 3, 6, C.bone); }],
        glowshroom: [11, 13, 3, (a) => { a.e(5.5, 3, 5, 3, [0x2e8a3a, 0x5fd45a, 0x9cff6e, 0xd8ffc0], 0.15); a.s(4, 5, 3, 8, [0x7ab07a, 0xa8d8a0, 0xd0f0c8]); a.p(3, 2, 0xffffff); }],
        log: [24, 9, 3, (a) => { a.s(0, 1, 21, 8, C.bark); a.r(0, 1, 21, 1, C.bark[3]); a.e(21, 5, 3, 4, [0x8c6a48, 0xb8936a, 0xd8b88f]); a.p(21, 5, C.bark[1]); a.e(8, 0.5, 2, 1, C.leafF); }],
        rock: [16, 10, 3, (a) => { a.e(8, 6, 7.5, 4.5, C.stone); a.e(5, 4, 3, 2, C.stone, 0.15); a.p(11, 3, C.leafF[3]); a.p(12, 3, C.leafF[2]); }],
        hut: [30, 26, 4, (a) => { a.s(4, 12, 22, 14, [0x5a4632, 0x7d6448, 0xa38866]); for (let x = 5; x < 26; x += 3) a.r(x, 12, 1, 14, 0x4a3828); a.roof(15, 0, 13, 6, 30, [0x6b4c12, 0x9a7020, 0xc89a35, 0xe8c25a]); for (let x = 2; x < 28; x += 3) a.p(x, 12, 0x6b4c12); a.r(12, 17, 6, 9, 0x140d0a); a.r(6, 15, 4, 4, GLOW); }],
        hut2: [26, 34, 4, (a) => { a.s(3, 22, 2, 12, C.wood); a.s(21, 22, 2, 12, C.wood); a.line(3, 33, 21, 23, C.wood[1]); a.s(1, 12, 24, 10, C.wood); a.roof(13, 2, 10, 6, 28, C.leafF); a.r(10, 15, 5, 7, 0x140d0a); a.r(17, 15, 4, 4, GLOW); for (let y = 24; y < 34; y += 3) a.r(10, y, 5, 1, C.wood[2]); }],
        totem: [10, 34, 4, (a) => { a.s(1, 0, 8, 34, C.wood); a.s(1, 2, 8, 7, C.red); a.r(2, 4, 2, 2, OUT); a.r(6, 4, 2, 2, OUT); a.r(3, 7, 4, 1, 0xfff2b0); a.s(1, 12, 8, 7, C.blue); a.r(2, 14, 6, 1, 0xfff2b0); a.r(0, 21, 10, 2, C.green[2]); a.s(1, 25, 8, 5, C.gold); a.r(-1, 22, 2, 4, C.green[3]); a.r(9, 22, 2, 4, C.green[3]); }],
        drying: [22, 18, 3, (a) => { a.s(1, 2, 2, 16, C.wood); a.s(19, 2, 2, 16, C.wood); a.r(0, 2, 22, 1, C.wood[2]); a.s(4, 3, 5, 8, [0x8c6a48, 0xb8936a, 0xd8b88f]); a.s(12, 3, 5, 7, [0x6b4529, 0x8f633c, 0xb3845a]); a.r(9, 3, 3, 4, [0x5fa8e8]); }],
        nest: [16, 8, 3, (a) => { a.e(8, 5, 7.5, 2.5, C.bark, 0.2); a.e(5, 2.5, 1.6, 1.4, C.white); a.e(9, 2.2, 1.6, 1.4, [0x8fb8d8, 0xbcd8ef, 0xe3f0fa]); }],
        shopstall: [34, 34, 4, (a) => {
            for (let x = 0; x < 34; x++) for (let y = 6; y < 12; y++) a.p(x, y, Math.floor(x / 4) % 2 ? 0x7e57c2 : 0xfff59d);
            for (let x = 1; x < 34; x += 4) { a.p(x, 12, 0x7e57c2); a.p(x + 1, 12, 0x7e57c2); }
            a.s(9, 0, 16, 6, C.wood, 0.1); a.r(9, 0, 16, 1, C.gold[3]); a.e(13, 3, 2, 2, C.gold, 0.2); a.p(13, 3, C.gold[0]);
            a.r(17, 2, 1, 3, 0xfff2b0); a.r(19, 2, 2, 1, 0xfff2b0); a.r(19, 4, 2, 1, 0xfff2b0); a.r(22, 2, 1, 3, 0xfff2b0);
            a.s(2, 13, 2, 21, C.wood); a.s(30, 13, 2, 21, C.wood); a.r(4, 14, 26, 10, 0x1e1620);
            for (let k = 0; k < 4; k++) { const x = 6 + k * 6; a.s(x, 16, 3, 5, [[0x8e1a1e, 0xc62f2f, 0xef5f50], [0x1a428a, 0x2c64ba, 0x5289de], [0x22592b, 0x33803c, 0x56a852], [0x6b4700, 0xd9a300, 0xffd54f]][k], 0.1); a.p(x + 1, 15, 0xd8d0bc); }
            a.s(1, 23, 32, 11, C.wood); a.r(1, 23, 32, 1, C.wood[3]); for (let x = 5; x < 32; x += 8) a.r(x, 25, 1, 8, C.wood[0]);
        }],
        shophut: [32, 34, 4, (a) => {
            a.s(3, 14, 26, 20, [0x5a4632, 0x7d6448, 0xa38866]); for (let x = 4; x < 29; x += 3) a.r(x, 14, 1, 20, 0x4a3828);
            a.roof(16, 0, 15, 6, 34, [0x6b4c12, 0x9a7020, 0xc89a35, 0xe8c25a]);
            a.r(6, 18, 20, 9, 0x1e1620); a.s(4, 26, 24, 8, C.wood); a.r(4, 26, 24, 1, C.wood[3]);
            for (let k = 0; k < 3; k++) a.s(8 + k * 6, 21, 3, 5, [[0x8e1a1e, 0xc62f2f, 0xef5f50], [0x22592b, 0x33803c, 0x56a852], [0x6b4700, 0xd9a300, 0xffd54f]][k], 0.1);
            a.s(12, 8, 8, 5, C.wood, 0.1); a.e(16, 10.5, 1.8, 1.8, C.gold, 0.2); a.line(2, 14, 0, 18, 0xf4efe2); a.line(30, 14, 32, 18, 0xf4efe2);
        }],
        // QOR BAZASI
        snowpine: [18, 38, 3, (a) => { a.s(8, 32, 3, 6, C.bark); for (let k = 0; k < 5; k++) { a.roof(9, 2 + k * 6, 8, 2 + k, 6 + k * 2.4, [0x0c2a2a, 0x143c3a, 0x1e5450]); a.r(Math.round(9 - (3 + k * 1.2)), 2 + k * 6 + 6, Math.round(6 + k * 2.4), 1, 0xffffff); a.p(9, 3 + k * 6, 0xe8f4ff); } a.p(9, 1, 0xffffff); }],
        snowman: [14, 24, 3, (a) => snowmanDraw(a, 0)],
        igloo: [32, 20, 4, (a) => {
            const pal = [0x9cc4e6, 0xc0dcf2, 0xe0eefa, 0xffffff];
            a.e(16, 16, 15.5, 14, pal, 0.1); a.r(0, 16, 32, 4, pal[1]);
            for (let y = 6; y < 20; y += 4) for (let x = 2 + (y / 4 % 2) * 3; x < 31; x += 6) a.p(x, y, 0x8ab0d0);
            for (let y = 4; y < 20; y += 4) a.r(2, y, 28, 1, 0xb0cce4);
            a.e(26, 15, 5, 5, pal, 0.05); a.r(23, 14, 6, 6, 0x101828); a.r(24, 15, 4, 5, 0x1a2a44); a.r(25, 16, 2, 2, GLOW);
        }],
        icecrystal: [12, 20, 3, (a) => { const pal = [0x2a6a9a, 0x5ab0d8, 0x9ad8f0, 0xe8fbff]; a.roof(6, 0, 20, 1, 6, pal); a.roof(2, 8, 12, 1, 3, pal); a.roof(10, 6, 14, 1, 3, pal); a.s(1, 18, 10, 2, [0xb8d8f0, 0xe8f4ff, 0xffffff]); }],
        icelamp: [9, 32, 3, (a) => { a.s(3, 9, 3, 22, [0x5ab0d8, 0x86d0ec, 0xc8f0ff]); a.r(2, 30, 5, 2, 0x9ad8f0); a.e(4.5, 5, 3.6, 4, [0x3fb6e0, 0x7ee8ff, 0xd8fbff, 0xffffff], 0.2); a.r(1, 0, 7, 1, 0xffffff); }],
        sled: [26, 12, 3, (a) => { a.s(2, 3, 20, 4, C.wood); a.r(2, 3, 20, 1, C.wood[3]); a.r(4, 7, 1, 3, C.wood[1]); a.r(18, 7, 1, 3, C.wood[1]); a.r(0, 10, 25, 1, C.iron[2]); a.line(24, 10, 25, 7, C.iron[2]); a.s(5, 0, 7, 3, [0x6b4529, 0x8f633c, 0xb3845a]); a.s(13, 0, 6, 3, [0x8f96a3, 0xb6bcc6, 0xdde1e7]); }],
        furtent: [24, 20, 4, (a) => { a.roof(12, 1, 19, 2, 24, [0x5a4632, 0x7d6448, 0xa38866, 0xc8ad88]); for (let y = 4; y < 20; y += 5) a.r(12 - y * 0.6, y, y * 1.2, 1, 0xe8e0d0); a.r(10, 11, 5, 9, 0x140d0a); a.r(10, 0, 1, 4, C.wood[2]); a.r(13, 0, 1, 4, C.wood[2]); a.r(0, 18, 24, 2, 0xffffff); }],
        fishhole: [20, 6, 3, (a) => { a.e(10, 3, 9.5, 2.6, [0x9cc4e6, 0xd0e8fa, 0xffffff]); a.e(10, 3, 6, 1.6, [0x0a2a4a, 0x14406a]); a.r(15, 0, 1, 3, C.wood[2]); a.line(15, 0, 12, 2, 0xd8d8d8); }, null],
        // BALOT MAGI uyi: gul to'shagi (pushti-binafsha botqoq gullari), sehrli qozon (yashil ichimlik), arg'imchoq ustunlari (o'rindiq va arqonlari - klientda, harakatlanadi)
        flowerbed: [26, 14, 3, (a) => {
            a.e(13, 12, 12.5, 3, C.mud, 0.1); a.r(1, 12, 24, 2, C.mud[1]);
            [[4, 0x9a3aa0], [8, 0xd84a9a], [12, 0x7a4ad8], [16, 0xd84a9a], [20, 0x9a3aa0], [23, 0xff7ac8]].forEach(([x, col], i) => {
                const h = 5 + (i * 3) % 4; a.line(x, 11, x, 11 - h, 0x3e6a2a); a.p(x + 1, 11 - Math.floor(h / 2), 0x56843e);
                a.r(x - 1, 10 - h, 3, 2, col); a.p(x, 9 - h, col); a.p(x, 10 - h, 0xffe14a);
            });
        }],
        cauldron: [22, 20, 3, (a) => {
            a.r(5, 17, 12, 3, C.wood[1]); a.r(6, 16, 10, 1, 0xff7a1a); a.p(8, 15, 0xffc35a); a.p(13, 15, 0xffc35a);
            a.e(11, 10, 9, 6.5, [0x14141c, 0x24242e, 0x363644, 0x50505f], 0.15); a.r(2, 4, 18, 2, C.iron[1]); a.r(1, 4, 20, 1, C.iron[2]);
            a.e(11, 5, 7.5, 1.6, [0x2e7d32, 0x4caf50, 0x9cff6e, 0xd8ffc8], 0.25); a.p(8, 4, 0xd8ffc8); a.p(14, 5, 0xd8ffc8);
            a.r(4, 16, 2, 3, 0x14141c); a.r(16, 16, 2, 3, 0x14141c);
        }],
        swingframe: [40, 46, 3, (a) => {
            a.line(4, 45, 10, 2, C.wood[1]); a.line(5, 45, 11, 2, C.wood[2]); a.line(16, 45, 10, 2, C.wood[1]);
            a.line(36, 45, 30, 2, C.wood[2]); a.line(35, 45, 29, 2, C.wood[1]); a.line(24, 45, 30, 2, C.wood[1]);
            a.s(8, 0, 25, 3, C.wood, 0.1); a.p(10, 1, C.wood[3]); a.p(30, 1, C.wood[3]);
            [[6, 0x56843e], [20, 0x7aa050], [33, 0x56843e]].forEach(([x, col]) => { a.p(x, 3, col); a.p(x + 1, 4, col); });
        }],
        // ALTER QOR BOBO maydoni: o'rtadagi archa (girlyanda, o'yinchoqlar, yulduz, tagida sovg'alar) va sovg'alar uyumi
        xmastree: [44, 62, 3, (a) => {
            const cx = 22, leaf = [0x0c2a1a, 0x143c26, 0x1e5434, 0x2c6e44];
            a.s(cx - 3, 50, 6, 6, C.bark);
            for (let k = 0; k < 6; k++) { const y = 4 + k * 8, w0 = 4 + k * 4, w1 = 12 + k * 6; a.roof(cx, y, 10, w0, w1, leaf); a.r(Math.round(cx - w1 / 2), y + 9, w1, 1, 0xffffff); a.r(Math.round(cx - w1 / 2) + 2, y + 8, Math.max(1, w1 - 4), 1, 0xe0eefa); }
            const col = [0xff3a3a, 0xffd23a, 0x3ac8ff, 0xff7ae0, 0x7aff7a];
            for (let k = 0; k < 26; k++) { const y = 8 + Math.floor(k * 1.7), w = 4 + (y - 4) * 0.7; a.p(Math.round(cx + Math.sin(k * 2.3) * w * 0.42), y, col[k % 5]); }
            [[cx - 6, 20], [cx + 7, 28], [cx - 10, 36], [cx + 4, 42], [cx + 12, 46], [cx - 14, 47], [cx - 2, 31]].forEach(([x, y], i) => { a.e(x, y, 1.6, 1.6, [[0x8a1010, 0xd43434, 0xff8a80], [0x8a6a00, 0xffd23a, 0xfff2b0], [0x0a4a8a, 0x3ac8ff, 0xc0ecff]][i % 3], 0.3); a.p(x, y - 2, C.iron[2]); });
            a.roof(cx, 0, 3, 1, 5, [C.gold[1], C.gold[2], C.gold[3]]); a.r(cx - 3, 2, 7, 1, C.gold[3]); a.p(cx, 4, C.gold[2]);
            [[cx - 15, 53, 8, 7, C.red], [cx + 5, 54, 9, 6, C.blue], [cx - 6, 56, 7, 5, C.green], [cx + 13, 56, 6, 5, C.purple]].forEach(([x, y, w, h, pal]) => { a.s(x, y, w, h, pal, 0.1); a.r(x + Math.floor(w / 2), y, 1, h, C.gold[3]); a.r(x, y + 2, w, 1, C.gold[3]); });
            a.r(2, 60, 40, 2, 0xf0f8ff);
        }],
        giftpile: [24, 13, 3, (a) => { [[1, 6, 8, 7, C.red], [9, 3, 7, 10, C.green], [16, 7, 7, 6, C.blue], [6, 0, 6, 6, C.purple]].forEach(([x, y, w, h, pal]) => { a.s(x, y, w, h, pal, 0.1); a.r(x + Math.floor(w / 2), y, 1, h, C.gold[3]); a.r(x, y + 2, w, 1, C.gold[3]); }); }],
        snowpile: [22, 9, 3, (a) => { a.e(11, 6, 10.5, 4, [0xb8d8f0, 0xd8ecfa, 0xf0f8ff, 0xffffff], 0.15); a.e(6, 5, 2.6, 2.4, [0xd8ecfa, 0xffffff], 0.2); a.e(14, 4, 2.4, 2.2, [0xd8ecfa, 0xffffff], 0.2); a.e(10, 3, 2.2, 2, [0xd8ecfa, 0xffffff], 0.2); }],
        icepillar: [12, 40, 3, (a) => { const pal = [0x2a6a9a, 0x4a9ac8, 0x7ac4e6, 0xc0ecff]; a.s(0, 0, 12, 3, pal, 0.1); a.s(2, 3, 8, 33, pal); for (let x = 3; x < 10; x += 2) a.r(x, 4, 1, 31, pal[1]); a.s(0, 36, 12, 4, pal); a.e(6, 0, 3, 2, [0x7ee8ff, 0xd8fbff, 0xffffff]); }],
        shopigloo: [34, 30, 4, (a) => {
            const pal = [0x9cc4e6, 0xc0dcf2, 0xe0eefa, 0xffffff];
            a.e(17, 26, 16.5, 18, pal, 0.1); a.r(0, 26, 34, 4, pal[1]);
            for (let y = 12; y < 30; y += 4) a.r(2, y, 30, 1, 0xb0cce4);
            a.r(6, 16, 22, 10, 0x101828); a.s(4, 24, 26, 6, C.wood); a.r(4, 24, 26, 1, C.wood[3]);
            for (let k = 0; k < 3; k++) a.s(8 + k * 7, 19, 3, 5, [[0x8e1a1e, 0xc62f2f, 0xef5f50], [0x1a428a, 0x2c64ba, 0x5289de], [0x22592b, 0x33803c, 0x56a852]][k], 0.1);
            a.s(12, 2, 10, 6, C.wood, 0.1); a.e(17, 5, 2, 2, C.gold, 0.2); a.r(10, 1, 14, 1, 0xffffff);
        }],
        cavesign: [18, 22, 3, (a) => { a.s(8, 6, 2, 16, C.wood); a.s(1, 1, 16, 7, C.wood, 0.1); a.e(9, 4.5, 2.2, 2, C.bone, 0.1); a.p(8, 4, OUT); a.p(10, 4, OUT); a.line(3, 3, 5, 6, C.red[2]); a.line(15, 3, 13, 6, C.red[2]); }],
        roots: [16, 18, 3, (a) => { [1, 5, 9, 13].forEach((x, i) => { for (let y = 0; y < 8 + i * 2; y++) a.p(x + Math.round(Math.sin(y / 2 + i)), y, y % 3 ? C.bark[2] : C.bark[1]); }); }],
        // YER OSTI OLAMI
        stalagmite: [12, 26, 3, (a) => { a.roof(6, 0, 26, 1, 12, C.basalt); a.roof(2.5, 13, 13, 1, 5, C.basalt); a.roof(9.5, 16, 10, 1, 4, C.basalt); a.p(6, 5, 0x9a6aff); a.p(5, 10, 0x7c4dff); a.p(7, 15, 0x9a6aff); }],
        lavarock: [16, 11, 3, (a) => { a.e(8, 6.5, 7.5, 4.5, C.basalt); a.e(5, 4.5, 3, 2, C.basalt, 0.15); a.line(3, 7, 7, 5, 0xff5a1a); a.line(7, 5, 12, 8, 0xff7a1a); a.p(8, 5, 0xffc35a); a.p(11, 7, 0xffc35a); }],
        skull: [10, 8, 3, (a) => { a.e(5, 3.5, 4.4, 3.6, C.bone, 0.1); a.r(2, 6, 6, 2, C.bone[1]); a.r(2, 3, 2, 2, OUT); a.r(6, 3, 2, 2, OUT); a.p(5, 5, OUT); [3, 5, 7].forEach(x => a.p(x, 7, OUT)); }],
        mimicrock: [30, 30, 3, (a) => rockMimicDraw(a, 0)],   // oddiy tosh - mimik rock 0-kadri bilan AYNAN bir xil
        lavapuddle: [22, 12, 3, (a) => blobDraw(a, 0)],   // lava ko'lmagi - tirik maxluq (magmablob) 0-kadri bilan AYNAN bir xil
        lantern: [9, 30, 3, (a) => { a.s(3, 9, 3, 21, C.iron); a.r(2, 28, 5, 2, C.iron[1]); a.r(1, 3, 7, 6, C.iron[1]); a.r(2, 4, 5, 4, 0xff9a3a); a.r(3, 5, 3, 2, 0xffe0a0); a.r(3, 1, 3, 2, C.iron[2]); a.r(1, 9, 7, 1, C.iron[1]); }],
        minecart: [24, 16, 3, (a) => { a.s(1, 4, 22, 8, C.iron); a.r(1, 4, 22, 1, C.iron[3]); for (let x = 4; x < 22; x += 5) a.r(x, 5, 1, 7, C.iron[0]); a.e(7, 3, 4.4, 2.4, C.grey); a.e(15, 2.5, 3.4, 2, C.red); a.p(14, 2, 0xffd54f); a.e(18, 3, 2.4, 1.8, [0x1f6f8e, 0x3fb6e0, 0x7ee8ff]); a.e(6, 13, 2.6, 2.6, C.dark); a.e(18, 13, 2.6, 2.6, C.dark); a.r(0, 15, 24, 1, C.iron[1]); }],
        minehut: [34, 30, 4, (a) => {
            a.s(1, 8, 32, 22, C.basalt); a.e(17, 9, 16, 8, C.basalt, 0.05); a.e(6, 7, 5, 4, C.basalt, 0.1); a.e(27, 6, 6, 5, C.basalt, 0.08);
            for (let k = 0; k < 9; k++) a.p(3 + k * 3.4, 12 + (k % 3) * 5, C.basalt[0]);
            a.s(11, 15, 12, 2, C.wood); a.s(11, 17, 2, 13, C.wood); a.s(21, 17, 2, 13, C.wood); a.s(13, 17, 8, 13, C.wood, -0.25); a.p(19, 23, C.gold[3]);
            [[3, 15], [26, 15]].forEach(([x, y]) => { a.r(x, y, 5, 5, 0xffb04a); a.r(x + 1, y + 1, 3, 3, 0xffe0a0); a.r(x + 2, y, 1, 5, C.wood[1]); });
            a.s(24, 0, 4, 6, C.stone); a.p(25, 0, 0x8a8090);
        }],
        forge: [26, 22, 4, (a) => { a.s(1, 8, 16, 14, C.stone); a.r(4, 12, 10, 6, 0x1a0a06); a.e(9, 15.5, 4, 2.6, C.lava, 0.2); a.s(6, 0, 6, 8, C.stone); a.p(8, 0, 0x8a8090); a.s(18, 14, 7, 3, C.iron, 0.1); a.r(20, 17, 3, 4, C.iron[1]); a.r(18, 21, 7, 1, C.iron[0]); a.r(17, 13, 1, 1, C.iron[2]); }],
        mushhouse: [28, 34, 4, (a) => {
            a.s(8, 16, 12, 18, [0x8c8270, 0xb4aa94, 0xd8d0bc]); a.r(11, 24, 6, 10, 0x2a1a10); a.p(15, 29, C.gold[3]); a.r(9, 19, 3, 3, 0x9cff6e);
            a.e(14, 10, 13.5, 8.5, [0x3a1a5a, 0x5e2a8a, 0x8a4ab8, 0xb87ae0], 0.1); a.r(1, 15, 26, 2, 0x3a1a5a);
            [[5, 9], [12, 5], [20, 8], [16, 12], [8, 13]].forEach(([x, y]) => { a.r(x, y, 2, 2, 0xd8fbff); a.p(x, y, 0xffffff); });
        }],
        shopcart: [34, 32, 4, (a) => {
            for (let x = 1; x < 33; x++) for (let y = 4; y < 9; y++) a.p(x, y, Math.floor(x / 4) % 2 ? 0xd84315 : 0x2a1a20);
            for (let x = 2; x < 33; x += 4) { a.p(x, 9, 0xd84315); a.p(x + 1, 9, 0xd84315); }
            a.s(3, 10, 2, 13, C.wood); a.s(29, 10, 2, 13, C.wood); a.r(5, 11, 24, 8, 0x1a1016);
            for (let k = 0; k < 4; k++) { const x = 7 + k * 6; a.s(x, 13, 3, 5, [C.red, C.blue, C.green, C.gold][k], 0.1); a.p(x + 1, 12, 0xd8d0bc); }
            a.s(1, 19, 32, 8, C.iron); a.r(1, 19, 32, 1, C.iron[3]); for (let x = 5; x < 32; x += 7) a.r(x, 20, 1, 7, C.iron[0]);
            a.e(8, 28, 3.4, 3.4, C.dark); a.e(26, 28, 3.4, 3.4, C.dark); a.p(8, 28, C.iron[3]); a.p(26, 28, C.iron[3]);
            a.s(11, 0, 12, 4, C.wood, 0.1); a.e(15, 2, 1.8, 1.6, C.gold, 0.2); a.r(18, 1, 1, 3, 0xfff2b0); a.r(20, 1, 1, 3, 0xfff2b0);
        }],
        skulltent: [28, 22, 4, (a) => { a.roof(14, 2, 20, 2, 26, [0x2a0a0a, 0x4a1414, 0x6e2020, 0x8e3030]); for (let k = 4; k < 22; k += 5) a.line(14, 2, 2 + k * 0.1, 21, 0x2a0a0a); a.r(11, 12, 6, 10, 0x0a0406); a.r(13, 0, 2, 3, C.wood[2]); a.e(14, 6.5, 2.4, 2, C.bone); a.p(13, 6, OUT); a.p(15, 6, OUT); a.r(1, 19, 4, 3, C.bone[1]); a.r(23, 20, 3, 2, C.bone[2]); }],
        lavapillar: [12, 40, 3, (a) => { a.s(0, 0, 12, 3, C.obs, 0.15); a.s(2, 3, 8, 33, C.obs, 0.1); for (let y = 5; y < 35; y += 6) a.line(3, y, 8, y + 3, 0xff5a1a); a.s(0, 36, 12, 4, C.obs, 0.1); a.e(6, 0, 3.4, 2.6, C.lava, 0.2); a.p(6, -1 + 1, 0xfff2b0); }],
        // BOSS MAYDONLARI
        cobweb: [26, 24, 3, (a) => { const c = 0xe6e6f0; for (let k = 0; k < 7; k++) { const ang = Math.PI * (0.08 + k * 0.14); a.line(13, 0, 13 + Math.cos(ang) * 13, Math.sin(ang) * 23, k % 2 ? c : 0xc8c8d8); } for (let r = 5; r < 24; r += 5) for (let k = 0; k < 6; k++) { const a0 = Math.PI * (0.08 + k * 0.14), a1 = Math.PI * (0.08 + (k + 1) * 0.14); a.line(13 + Math.cos(a0) * r * 0.56, Math.sin(a0) * r, 13 + Math.cos(a1) * r * 0.56, Math.sin(a1) * r, 0xb0b0c0); } a.e(17, 15, 2.2, 1.8, [0x2a0d45, 0x45186e]); a.p(16, 14, 0x9cff6e); }, null],
        warbanner: [14, 40, 3, (a) => { a.s(2, 0, 2, 40, C.wood); a.p(2, 0, C.bone[3]); a.s(4, 2, 9, 18, [0x2a1810, 0x4a2a18, 0x6e3e22, 0x8e5430]); for (let x = 4; x < 13; x += 3) a.p(x, 20 + (x % 2), 0x4a2a18); a.e(8.5, 9, 2.6, 2.4, C.bone, 0.1); a.p(7, 9, OUT); a.p(10, 9, OUT); a.line(5, 14, 12, 14, C.red[2]); a.s(0, 37, 6, 3, C.stone); }],
        palisade: [26, 18, 3, (a) => { for (let x = 1; x < 26; x += 5) { a.s(x, 4, 3, 14, C.wood); a.roof(x + 1.5, 0, 4, 1, 3, C.wood); } a.r(0, 9, 26, 2, C.wood[0]); a.r(0, 14, 26, 1, C.wood[0]); }],
        darkobelisk: [14, 44, 3, (a) => { a.roof(7, 0, 8, 1, 6, C.obs); a.s(3, 8, 8, 32, C.obs, 0.1); a.s(1, 40, 12, 4, C.obs); for (let y = 12; y < 38; y += 7) a.r(6, y, 2, 3, 0x9a6aff); a.e(7, 2, 2.4, 2.4, C.soul, 0.2); }],
        moonrock: [16, 34, 3, (a) => { a.s(3, 2, 10, 30, C.stone, 0.05); a.e(8, 3, 5, 3, C.stone, 0.1); a.s(1, 31, 14, 3, C.stone); a.e(8, 13, 2.8, 2.8, [0x9ab8d8, 0xd8e8f8, 0xffffff], 0.2); a.p(7, 12, C.stone[1]); a.line(5, 20, 10, 25, C.stone[0]); a.p(11, 8, C.leafF[3]); }],
        bigroot: [44, 30, 3, (a) => { for (let k = 0; k < 4; k++) { const x0 = 2 + k * 11; for (let t = 0; t <= 20; t++) { const q = t / 20, x = x0 + q * 9 + Math.sin(q * 3 + k) * 2, y = 29 - Math.sin(q * Math.PI) * (16 + k * 3); a.e(x, y, 2.2 - q * 0.6, 2.2 - q * 0.6, C.bark, 0.1); } a.p(x0 + 5, 12 - k, C.leafF[3]); } a.r(0, 28, 44, 2, C.bark[0]); }],
        icespikes: [24, 26, 3, (a) => { const pal = [0x2a6a9a, 0x5ab0d8, 0x9ad8f0, 0xe8fbff]; a.roof(12, 0, 26, 1, 8, pal); a.roof(5, 8, 18, 1, 6, pal); a.roof(19, 10, 16, 1, 6, pal); a.s(0, 24, 24, 2, [0xb8d8f0, 0xe8f4ff, 0xffffff]); }],
        icethrone: [30, 40, 4, (a) => { const pal = [0x2a6a9a, 0x5ab0d8, 0x9ad8f0, 0xe8fbff]; a.s(4, 10, 22, 26, pal, 0.1); for (let k = 0; k < 5; k++) a.roof(5 + k * 5, 0 + (k % 2) * 4, 12 - (k % 2) * 4, 1, 4, pal); a.s(7, 20, 16, 6, [0x1a428a, 0x2c64ba, 0x5289de], 0.1); a.s(2, 34, 26, 6, pal); a.p(15, 14, 0xffffff); }],
        tombstone: [14, 18, 3, (a) => { a.s(2, 4, 10, 14, C.stone, 0.05); a.e(7, 4, 5, 3.4, C.stone, 0.1); a.r(6, 7, 2, 7, C.stone[0]); a.r(4, 9, 6, 2, C.stone[0]); a.p(3, 15, C.moss[3]); a.s(0, 16, 14, 2, [0x3a2c1a, 0x54402a]); }],
        soulbrazier: [12, 30, 3, (a) => { a.s(5, 10, 2, 18, C.iron); a.r(3, 27, 6, 3, C.iron[1]); a.s(1, 7, 10, 4, C.iron, 0.1); a.e(6, 4, 3.6, 4, C.soul, 0.2); a.p(6, 1, 0xffffff); }],
        // BOTQOQ
        deadtree: [24, 40, 3, (a) => {
            a.s(10, 12, 4, 28, C.bark); a.s(8, 37, 8, 3, C.bark, -0.1); a.line(8, 39, 5, 39, C.bark[1]); a.line(15, 39, 19, 39, C.bark[1]);
            a.line(11, 20, 3, 10, C.bark[2]); a.line(3, 10, 1, 4, C.bark[1]); a.line(13, 16, 21, 8, C.bark[2]); a.line(21, 8, 23, 3, C.bark[1]); a.line(12, 12, 12, 2, C.bark[2]); a.line(12, 2, 15, 0, C.bark[1]);
            [[4, 11, 7], [8, 15, 5], [18, 10, 8], [21, 9, 5], [12, 5, 4], [2, 6, 4]].forEach(([x, y, n]) => { for (let k = 0; k < n; k++) a.p(x, y + k, k % 2 ? C.moss[1] : C.moss[3]); });
            a.p(12, 24, OUT); a.p(11, 25, OUT);
        }],
        reeds: [14, 16, 3, (a) => { [1, 4, 6, 9, 12].forEach((x, i) => { a.line(x, 15, x + (i % 2 ? 1 : -1), 3 + (i % 3) * 2, C.moss[2 + (i % 2)]); a.p(x + (i % 2 ? 1 : -1), 2 + (i % 3) * 2, C.moss[4]); }); }],
        cattail: [10, 20, 3, (a) => { [2, 5, 8].forEach((x, i) => { a.line(x, 19, x, 4 + i * 2, C.moss[2]); a.r(x - 1 + (i % 2), 4 + i * 2, 2, 5, [0x4a2e16, 0x6a4422, 0x5a3a1c][i]); a.p(x, 3 + i * 2, C.moss[3]); }); a.line(3, 18, 0, 12, C.moss[3]); }],
        lilyflower: [18, 6, 3, (a) => { a.e(9, 4, 8.5, 2, C.moss, 0.1); a.line(9, 4, 13, 3, C.moss[0]); a.e(8, 2, 2.4, 2, [0xb04a8a, 0xe07ab8, 0xf8b8dc]); a.p(8, 1, 0xfff2b0); }],
        bogrock: [16, 10, 3, (a) => { a.e(8, 6, 7.5, 4.2, [0x1a1e18, 0x283024, 0x3a4434, 0x4e5a46]); a.e(6, 3, 4, 1.8, C.moss, 0.1); a.p(11, 2, C.moss[4]); a.p(3, 6, C.moss[3]); }],
        swamplog: [26, 9, 3, (a) => crocG(a, 26, 9, 0)],   // xoda - tirik timsoh (boglurker) 0-kadri bilan AYNAN bir xil
        stilthut: [32, 40, 4, (a) => stilt(a, [0x6b4c12, 0x9a7020, 0xc89a35, 0xe8c25a])],
        stilthut2: [32, 40, 4, (a) => stilt(a, C.moss)],
        dock: [30, 12, 3, (a) => { a.s(0, 2, 30, 3, C.wood, 0.05); for (let x = 1; x < 30; x += 4) a.r(x, 2, 1, 3, C.wood[0]); [2, 14, 26].forEach(x => a.s(x, 5, 2, 7, C.bark)); a.p(15, 1, C.iron[2]); }],
        fishnet: [20, 20, 3, (a) => { a.s(1, 0, 2, 20, C.wood); a.s(17, 0, 2, 20, C.wood); for (let y = 2; y < 14; y += 3) a.r(3, y, 14, 1, 0xb8b09a); for (let x = 4; x < 17; x += 3) a.line(x, 2, x + 1, 14, 0xa8a08a); a.e(9, 10, 1.6, 1, [0x5a8aa8, 0x8ab8d0]); }],
        swamplamp: [9, 30, 3, (a) => { a.s(3, 8, 3, 22, C.wood); a.r(2, 28, 5, 2, C.wood[1]); a.r(1, 1, 7, 1, C.wood[2]); a.s(1, 2, 7, 6, [0x5a7a4a, 0x8aaa6a, 0xb8d89a], 0.2); [[2, 3], [5, 4], [3, 6], [6, 6]].forEach(([x, y]) => a.p(x, y, 0xeaff7a)); }],
        boat: [28, 10, 3, (a) => { for (let y = 2; y < 9; y++) { const w = 26 - (y - 2) * 2; a.r(14 - Math.round(w / 2), y, w, 1, shade(0.85 - y / 12, 0, y, C.wood)); } a.r(1, 2, 26, 1, C.wood[3]); a.line(18, 0, 24, 6, C.wood[2]); a.r(23, 6, 3, 2, C.wood[1]); }],
        shopboat: [36, 30, 4, (a) => {
            for (let y = 20; y < 29; y++) { const w = 34 - (y - 20) * 2; a.r(18 - Math.round(w / 2), y, w, 1, shade(0.85 - (y - 20) / 12, 0, y, C.wood)); } a.r(1, 20, 34, 1, C.wood[3]);
            a.s(4, 7, 2, 13, C.wood); a.s(30, 7, 2, 13, C.wood); for (let x = 2; x < 34; x++) for (let y = 3; y < 8; y++) a.p(x, y, Math.floor(x / 4) % 2 ? 0x558b2f : 0xe8d8a8);
            a.r(6, 10, 24, 9, 0x141a10); for (let k = 0; k < 4; k++) { const x = 8 + k * 6; a.s(x, 12, 3, 5, [C.red, C.blue, C.toxic, C.gold][k], 0.1); a.p(x + 1, 11, 0xd8d0bc); }
            a.s(13, 0, 10, 4, C.wood, 0.1); a.e(18, 2, 1.8, 1.6, C.gold, 0.2); a.r(21, 1, 1, 2, 0xfff2b0);
        }],
        bogtent: [28, 22, 4, (a) => { a.e(14, 15, 13.5, 9, C.mud, 0.1); a.r(0, 15, 28, 7, C.mud[1]); for (let k = 0; k < 6; k++) a.p(3 + k * 4.4, 10 + (k % 2) * 3, C.moss[3]); a.r(11, 13, 6, 9, 0x0a0806); a.e(14, 7, 2.4, 2, C.bone); a.p(13, 7, OUT); a.p(15, 7, OUT); a.r(1, 19, 4, 3, C.bone[1]); }],
        bogtotem: [12, 40, 3, (a) => { a.s(2, 0, 8, 38, C.wood); a.s(1, 1, 10, 9, C.bark, 0.1); a.r(3, 4, 2, 2, 0x9cff6e); a.r(7, 4, 2, 2, 0x9cff6e); a.r(4, 7, 4, 1, OUT); a.s(1, 14, 10, 8, C.bark, 0.05); a.r(3, 16, 6, 1, 0xd8d0bc); a.r(2, 26, 8, 2, C.moss[3]); a.s(0, 37, 12, 3, C.mud); for (let y = 10; y < 36; y += 5) a.p(2 + (y % 3) * 3, y, C.moss[2]); }],
        gasvent: [20, 8, 3, (a) => { a.e(10, 5.5, 9.5, 2.8, C.mud); a.e(10, 4.6, 4, 1.5, C.toxic, 0.1); a.e(6, 2, 1.4, 1.4, [0x9ad83a, 0xd8ff8a]); a.e(13, 1, 1, 1, [0x9ad83a, 0xd8ff8a]); }],
        swampsign: [16, 24, 3, (a) => { a.s(7, 6, 2, 18, C.wood); a.s(1, 1, 14, 8, C.wood, 0.1); a.line(8, 2, 8, 7, 0x9cff6e); a.line(5, 5, 8, 8, 0x9cff6e); a.line(11, 5, 8, 8, 0x9cff6e); a.p(2, 9, C.moss[3]); a.p(13, 9, C.moss[2]); }],
        vent: [20, 8, 3, (a) => { a.e(10, 5.5, 9.5, 2.8, C.basalt); a.e(10, 4.6, 4, 1.5, [0x5a0c10, 0xb3261e, 0xff7a1a, 0xffc35a], 0.1); a.p(8, 1, 0x6a6070); a.p(11, 0, 0x5a5060); a.p(12, 2, 0x6a6070); }]
    };
    // TIMSOH / XODA: 0 - moxli xoda (bezak bilan bir xil!), 1 - timsoh (ko'zlari ochiq) yuradi, 2 - jag'i ochilgan. W x H katakda (katta timsoh ham)
    function crocG(a, W, H, f) {
        const by = H - 2;
        if (f === 0) {
            a.s(1, by - 5, W - 3, 5, C.bark, 0.05); a.e(W - 2.5, by - 2.5, 2, 2.4, [0x8c6a48, 0xb8936a, 0xd8b88f]); a.p(W - 3, by - 3, C.bark[1]);
            for (let x = 3; x < W - 4; x += 4) a.p(x, by - 4, C.bark[0]); for (let x = 2; x < W - 4; x += 3) if (hash(x, W, 3) < 0.6) a.p(x, by - 5, C.moss[3]);
            a.e(W * 0.35, by - 5, 2.4, 1, C.moss, 0.1); a.r(4, by, W - 8, 2, C.mud[1]);
            return;
        }
        const pal = [0x1e3a1a, 0x2e5226, 0x4a7034, 0x6a9048], jaw = f === 2 ? 2 : 0;
        (f === 1 ? [3, 8, W - 12, W - 7] : [4, 9, W - 13, W - 8]).forEach((x, i) => a.s(x, by - 1, 2, 3 - (i % 2 && f === 1 ? 1 : 0), pal, -0.2));
        a.s(1, by - 4, W - 8, 4, pal, 0.05); a.line(0, by - 2, 3, by - 3, pal[1]);
        for (let x = 4; x < W - 9; x += 3) a.p(x, by - 5, pal[0]);
        a.s(W - 8, by - 4 - jaw, 8, 2, pal, 0.1); a.s(W - 8, by - 1, 8, 1, pal, -0.1);
        if (jaw) { a.r(W - 7, by - 2, 7, 1, 0x7a1018); for (let x = W - 7; x < W; x += 2) { a.p(x, by - 2 - 0, 0xf4efe2); a.p(x + 1, by - 1, 0xf4efe2); } }
        a.p(W - 7, by - 5 - jaw, 0xffe14a); a.p(W - 6, by - 5 - jaw, OUT);
    }
    // ustunlar ustidagi botqoq kulbasi (tomi: somon yoki mox)
    function stilt(a, roof) {
        [3, 11, 21, 28].forEach(x => a.s(x, 26, 2, 14, C.bark)); a.line(5, 39, 11, 27, C.bark[1]); a.line(21, 27, 28, 39, C.bark[1]);
        a.s(0, 24, 32, 3, C.wood, 0.05); for (let x = 2; x < 32; x += 4) a.p(x, 25, C.wood[0]);
        a.s(4, 12, 24, 12, [0x5a4632, 0x7d6448, 0xa38866]); for (let x = 5; x < 28; x += 3) a.r(x, 12, 1, 12, 0x4a3828);
        a.roof(16, 0, 13, 6, 32, roof); a.r(13, 16, 6, 8, 0x140d0a); a.r(6, 15, 4, 4, 0xd8f07a); a.r(22, 15, 4, 4, 0xd8f07a);
        for (let y = 27; y < 39; y += 3) a.r(14, y, 4, 1, C.wood[2]); a.r(13, 27, 1, 12, C.wood[1]); a.r(18, 27, 1, 12, C.wood[1]);
    }
    // LAVA KO'LMAGI-MAXLUQ: 0 - yerdagi oddiy lava ko'lmagi (bezak bilan bir xil!), 1 - ko'tarilgan (ko'zlari ochilgan), 2 - lava tupurmoqda
    function blobDraw(a, f) {
        if (f === 0) { a.e(11, 10, 10.5, 2, [0xb3261e, 0xff5a1a, 0xff7a1a, 0xffc35a], 0.05); a.r(3, 9, 2, 1, 0xffc35a); a.r(14, 10, 3, 1, 0xfff2b0); a.r(1, 11, 20, 1, C.basalt[1]); return; }
        const up = f === 2 ? 1 : 0;
        a.e(11, 7 - up, 8, 5 + up, C.lava, 0.05); a.e(11, 10, 10.5, 2, [0xb3261e, 0xff5a1a, 0xff7a1a], 0.05);
        a.e(8, 5 - up, 1.6, 1.6, [0xfff2b0, 0xffffff]); a.e(14, 5 - up, 1.6, 1.6, [0xfff2b0, 0xffffff]); a.p(8, 5 - up, OUT); a.p(14, 5 - up, OUT);
        a.r(9, 8, 5, f === 2 ? 2 : 1, 0x5a0c10); a.p(6, 3 - up, 0xfff2b0); a.p(16, 2, 0xffc35a);
        if (f === 2) { a.p(11, 0, 0xffc35a); a.p(12, 1, 0xff7a1a); }
    }
    // MIMIK ROCK (kulba va to'nka mimiklar oilasidan: oddiy narsa + tishli og'iz + kalta oyoqlar): 0 - oddiy krater-tosh (bezak bilan bir xil!), 1-2 - qadam, 3 - sakrashga cho'kkan, 4 - havoda, 5 - boshidan olov
    const ROCKM = { rock: [0x2a2024, 0x463638, 0x6a5652, 0x8f7a6c, 0xb09a88], leg: [0x1e1618, 0x3a2c2e, 0x5a4844, 0x7a6658],
        rows: [[-6, 6], [-8, 7], [-9, 9], [-10, 10], [-11, 10], [-11, 11], [-12, 11], [-12, 12], [-12, 12], [-12, 12], [-12, 12], [-12, 12], [-11, 12], [-11, 11], [-10, 11], [-10, 10], [-8, 9], [-7, 8]] };
    function rockMimicDraw(a, f) {
        const awake = f > 0, crouch = f === 3, leap = f === 4, fire = f === 5, step = f === 2 ? 1 : 0, cx = 15, base = 29, K = ROCKM;
        const by = base - (!awake ? 0 : crouch ? 2 : leap ? 6 : 5), top = by - K.rows.length;
        if (awake) [-1, 1].forEach((d) => {
            const s = d > 0 ? step : 1 - step, kx = cx + d * (leap ? 14 : 13), ky = leap ? by - 2 : by - 5 - s - (crouch ? 1 : 0), fx = cx + d * (leap ? 12 : 14), fy = leap ? base - 1 : base;
            limb(a, cx + d * 9, by - 4, kx, ky, 2.2, 1.8, K.leg); limb(a, kx, ky, fx, fy, 1.8, 1.1, K.leg, -0.1); a.p(fx, fy, 0xff9a3a);   // tashqi oyoq
            const ix = cx + d * 7, iy = leap ? by + 3 : base - s;
            limb(a, cx + d * 5, by - 2, ix, iy, 1.8, 1.1, K.leg); a.p(ix, iy, 0xff9a3a);                                                     // ichki oyoq
        });
        K.rows.forEach((r, i) => { for (let x = cx + r[0]; x <= cx + r[1]; x++) a.p(x, top + i, shade(0.74 - (x - cx) * 0.02 - i * 0.024, x, top + i, K.rock)); });
        // qirralar: tosh yorilgandek
        a.line(cx - 12, top + 8, cx - 5, top + 3, K.rock[1]); a.line(cx + 4, top + 2, cx + 11, top + 7, K.rock[1]); a.line(cx - 9, top + 15, cx - 3, top + 17, K.rock[1]); a.line(cx + 12, top + 11, cx + 8, top + 16, K.rock[1]);
        [[cx - 8, top + 5], [cx - 4, top + 2], [cx + 3, top + 4], [cx - 10, top + 10]].forEach(([x, y]) => a.r(x, y, 2, 1, K.rock[4]));
        // krater
        a.r(cx - 7, top - 1, 15, 2, K.rock[3]); a.r(cx - 7, top + 1, 15, 1, K.rock[1]); a.r(cx - 5, top, 11, 1, !awake ? 0x7a1a0a : 0xff7a1a); a.r(cx - 3, top, 7, 1, !awake ? 0xa8300e : 0xffc35a);
        if (awake) {
            // yoriqlardan lava, g'azabli ko'zlar, tishli og'iz (kulba / to'nka mimiklardagidek)
            a.line(cx - 11, top + 7, cx - 8, top + 10, 0xff7a1a); a.line(cx + 9, top + 5, cx + 11, top + 9, 0xff7a1a);
            [-1, 1].forEach((d) => { a.r(cx + d * 4 - 1, top + 6, 3, 2, 0xffe14a); a.p(cx + d * 4, top + 7, 0x140406); a.line(cx + d * 2, top + 6, cx + d * 6, top + 4, K.rock[0]); });
            const op = crouch ? 2 : leap || fire ? 5 : 3, my = top + 10;
            a.r(cx - 8, my, 17, op, 0x140406); if (fire || leap) a.r(cx - 5, my + 1, 11, op - 2, 0xb3261e);
            for (let x = cx - 8; x <= cx + 8; x += 2) { a.p(x, my, 0xf4efe2); a.p(x + 1, my + op - 1, 0xf4efe2); }
        }
        if (fire) { a.e(cx, top - 3, 3.2, 3.6, C.lava, 0.2); a.p(cx, top - 4, 0xffffff); a.p(cx - 4, top - 2, 0xff7a1a); a.p(cx + 4, top - 3, 0xffc35a); }
    }
    // qorbobo: 0 - oddiy (bezak bilan bir xil!), 1 - jonlangan (qizil ko'z), 2 - qor to'pi otmoqda
    function snowmanDraw(a, f) {
        const pal = [0xa8c8e4, 0xcce2f4, 0xe8f4ff, 0xffffff];
        a.e(7, 19, 6.5, 4.6, pal); a.e(7, 11.5, 5, 4, pal, 0.05); a.e(7, 5, 3.8, 3.4, pal, 0.1);
        a.s(4, 0, 6, 2, C.dark, 0.1); a.r(3, 2, 8, 1, C.dark[1]);
        a.p(6, 5, f ? 0xff2a3a : OUT); a.p(8, 5, f ? 0xff2a3a : OUT); a.r(8, 6, 3, 1, 0xff8a3d);
        a.p(7, 10, OUT); a.p(7, 12, OUT); a.p(7, 14, OUT); a.r(4, 8, 6, 1, 0xc62f2f); a.r(9, 9, 1, 3, 0xc62f2f);
        if (f === 2) { a.line(11, 11, 13, 6, C.bark[2]); a.e(13, 5, 1.6, 1.6, [0xe8f4ff, 0xffffff]); } else a.line(11, 11, 13, 9 + (f ? 1 : 0), C.bark[2]);
        a.line(3, 11, 0, 9 - (f === 1 ? 1 : 0), C.bark[2]);
        if (f === 1) { a.p(5, 23, pal[0]); a.p(9, 23, pal[0]); }
    }
    function house(a, roof) {
        a.s(3, 16, 28, 20, C.wall); for (let y = 18; y < 36; y += 3) for (let x = 4; x < 31; x += 7) a.p(x, y, C.wall[0]);
        a.r(3, 16, 28, 1, C.wood[1]); a.s(3, 16, 2, 20, C.wood); a.s(29, 16, 2, 20, C.wood); a.r(3, 25, 28, 1, C.wood[1]);
        a.roof(17, 1, 15, 8, 34, roof); a.s(24, 0, 3, 7, C.stone);
        a.s(13, 24, 7, 12, C.wood, -0.15); a.p(18, 30, C.gold[3]);
        [[6, 19], [24, 19]].forEach(([x, y]) => { a.r(x, y, 5, 5, GLOW); a.r(x + 1, y + 1, 3, 3, GLOW2); a.r(x + 2, y, 1, 5, C.wood[1]); a.r(x, y + 2, 5, 1, C.wood[1]); });
        a.s(0, 34, 34, 2, C.stone);
    }

    // ===== DUSHMANLAR / BOSSLAR / NPC (3 kadr: 0 - turish, 1 - qadam, 2 - zarba) =====
    // IKKI OYOQLI: o - { W, H, skin, torso, legs, boots, headW, headH, torsoW, torsoH, legH, ears, eyes, hat, weapon, ... }
    // shaxmat figurasi: poydevor, torayib boruvchi tana, yoqa, bosh; Farzin - tishli toj, Shoh - xochli QORA TOJ (king0 - tojsiz)
    function chessPiece(a, kind) {
        const DK = [0x0e0e14, 0x1c1c26, 0x2e2e3c, 0x4a4a5e, 0x6e6e86], H = a.H, cx = 15, base = H - 1;
        a.s(2, base - 7, 26, 7, DK, 0.05); a.r(1, base - 8, 28, 2, DK[3]); a.r(2, base - 1, 26, 1, DK[0]);
        a.s(5, base - 12, 20, 5, DK, 0.05); a.r(5, base - 12, 20, 1, DK[4]);
        const t0 = base - 38, t1 = base - 12;
        for (let y = t0; y < t1; y++) { const w = Math.round(8 + (y - t0) * 0.42), x0 = Math.round(cx - w / 2); for (let x = x0; x < x0 + w; x++) a.p(x, y, shade(0.9 - (x - x0) / w * 0.65, x, y, DK)); }
        a.e(cx, t0 - 1, 7, 2.2, DK, 0.1); a.r(cx - 2, t0 - 6, 4, 5, DK[2]);
        const hy = t0 - 11; a.e(cx, hy, 5.5, 5.5, DK, 0.12);
        [[cx - 3, hy - 2], [cx - 2, t0 + 6], [cx - 3, t0 + 14]].forEach(([x, y]) => a.p(x, y, 0x9a8ac8));   // binafsha yaltirash
        if (kind === 'queen') {
            for (let k = -2; k <= 2; k++) a.roof(cx + k * 2.4, hy - 9, 4, 1, 2, DK);
            a.r(cx - 6, hy - 6, 12, 2, DK[3]); a.e(cx, hy - 10, 1.4, 1.4, DK, 0.2);
        } else if (kind === 'king') {
            const BL = [0x050508, 0x14141c, 0x2a2a38, 0x55556a];
            a.s(cx - 6, hy - 9, 12, 4, BL, 0.1);
            [cx - 5, cx, cx + 5].forEach((x, i) => a.roof(x, hy - 13 + (i === 1 ? -1 : 0), 4, 1, 3, BL));
            a.r(cx - 1, hy - 16, 2, 3, BL[2]); a.e(cx, hy - 18, 1.6, 1.6, [0x4a148c, 0x7e57c2, 0xb39ddb], 0.2);   // o'rtada - binafsha tosh (xochsiz)
            a.p(cx - 4, hy - 7, 0xb71c1c); a.p(cx, hy - 7, 0xe53935); a.p(cx + 4, hy - 7, 0xb71c1c);
        } else if (kind === 'king0') { a.r(cx - 5, hy - 6, 10, 2, DK[1]); }   // toj yo'q - tepasi tekis
    }
    function biped(o, f) {
        return art(o.W, o.H, (a) => {
            const W = o.W, H = o.H, cx = Math.floor(W / 2) - (o.shift || 0);
            const legH = o.legH, tH = o.torsoH, tW = o.torsoW, hW = o.headW, hH = o.headH;
            const bob = f === 1 ? 1 : 0, legTop = H - legH, tTop = legTop - tH + bob, hTop = tTop - hH + (o.neck || 1);
            const tx = cx - Math.floor(tW / 2);
            // plash (orqada)
            if (o.cape) a.s(tx - 1, tTop + 1, tW + 1, tH + legH - 2, o.cape, -0.1);
            // oyoqlar
            const lw = Math.max(2, Math.round(tW / 3)), lx = f === 1 ? [tx - 1, tx + tW - lw + 1] : [tx + 1, tx + tW - lw - 1];
            lx.forEach((x, i) => { a.s(x, legTop, lw, legH - 1, o.legs, i ? -0.1 : 0); a.r(x - (i ? 0 : 1), H - 2, lw + 1, 2, o.boots || C.leather[0]); });
            if (o.robe) a.s(tx - 1, legTop - 1, tW + 2, legH - 2, o.torso, -0.08);
            // tana
            a.s(tx, tTop, tW, tH, o.torso);
            if (o.belt !== false) a.r(tx, tTop + tH - 2, tW, 1, o.belt || C.leather[0]);
            if (o.armor) { a.s(tx + 1, tTop + 1, tW - 2, Math.max(2, tH - 4), o.armor, 0.1); a.r(tx, tTop, tW, 1, o.armor[3]); }
            if (o.chest) o.chest(a, tx, tTop, tW, tH);
            // qo'llar: orqa (chap) va old (o'ng - qurol ushlaydi); zarba kadrida old qo'l oldinga ko'tariladi
            const arm = o.arm || o.torso, skin = o.skin;
            a.s(tx - 2, tTop + 1, 2, tH - 2, arm, -0.15); a.r(tx - 2, tTop + tH - 1, 2, 1, skin[2]);
            const hx = f === 2 ? tx + tW + 2 : tx + tW, hy = f === 2 ? tTop + 1 : tTop + tH - 1;
            if (f === 2) { a.s(tx + tW, tTop + 1, 3, 2, arm); } else a.s(tx + tW, tTop + 1, 2, tH - 2, arm, 0.05);
            a.r(hx - (f === 2 ? 0 : 0), hy, 2, 1, skin[2]);
            // bosh
            const hx0 = cx - Math.floor(hW / 2);
            a.s(hx0, hTop + bob, hW, hH, skin);
            if (o.ears === 'goblin') { a.line(hx0 - 1, hTop + bob + 2, hx0 - 3, hTop + bob, skin[2]); a.p(hx0 - 2, hTop + bob + 2, skin[1]); a.line(hx0 + hW, hTop + bob + 2, hx0 + hW + 2, hTop + bob, skin[2]); a.p(hx0 + hW + 1, hTop + bob + 2, skin[1]); }
            if (o.ears === 'elf') { a.r(hx0 - 2, hTop + bob + 3, 2, 1, skin[2]); a.p(hx0 - 1, hTop + bob + 4, skin[1]); a.r(hx0 + hW, hTop + bob + 3, 2, 1, skin[2]); a.p(hx0 + hW, hTop + bob + 4, skin[1]); }
            const ey = hTop + bob + Math.floor(hH / 2) - (o.eyeUp || 0), ex = hx0 + Math.floor(hW / 2);
            if (o.eyes !== false) { a.p(ex - 2 + (o.look || 1), ey, o.eyes || OUT); a.p(ex + 1 + (o.look || 1), ey, o.eyes || OUT); if (o.brow) { a.p(ex - 2 + 1, ey - 1, o.brow); a.p(ex + 2, ey - 1, o.brow); } }
            if (o.mouth) a.r(ex - 1 + 1, ey + 2, 2, 1, o.mouth);
            if (o.tusk) { a.p(ex - 1, ey + 2, 0xf4efe2); a.p(ex + 2, ey + 2, 0xf4efe2); }
            if (o.beard) { a.s(hx0, ey + 2, hW, 3, o.beard); a.r(hx0 + 1, ey + 5, hW - 2, 1, o.beard[1]); }
            if (o.hat) o.hat(a, hx0, hTop + bob, hW, hH);
            // qurol
            if (o.weapon) o.weapon(a, hx, hy, f, tTop, legTop);
        });
    }
    // qurollar (old qo'lda): hx, hy - qo'l uchi
    const WPN = {
        dagger: (a, x, y, f) => { if (f === 2) { a.r(x + 1, y, 4, 1, C.iron[3]); a.p(x + 5, y, C.iron[2]); } else { a.r(x + 1, y - 3, 1, 4, C.iron[3]); a.p(x + 1, y + 1, C.wood[1]); } },
        bow: (a, x, y, f) => { const bx = x + (f === 2 ? 1 : 2), by = y - 6; for (let k = 0; k < 9; k++) a.p(bx + (k === 0 || k === 8 ? 0 : k < 2 || k > 6 ? 1 : 2), by + k, C.wood[2]); a.r(bx, by + 1, 1, 7, 0xe6e6e6); if (f === 2) a.r(bx - 4, by + 4, 5, 1, C.wood[3]); },
        axe: (a, x, y, f) => { if (f === 2) { a.r(x, y - 1, 6, 1, C.wood[2]); a.s(x + 5, y - 4, 3, 6, C.iron); } else { a.r(x + 1, y - 7, 1, 9, C.wood[2]); a.s(x + 2, y - 7, 3, 4, C.iron, 0.1); } },
        staff: (a, x, y, f, tTop, legTop) => { const sx = x + 1; a.r(sx, tTop - 4, 1, legTop - tTop + 8, C.wood[1]); a.e(sx, tTop - 6, 1.6, 1.6, f === 2 ? [0xd8a0ff, 0xf0d8ff, 0xffffff] : [0x7c3fc8, 0xb388ff, 0xe8d8ff]); },
        club: (a, x, y, f) => { if (f === 2) { a.s(x, y - 2, 8, 3, C.wood); a.p(x + 8, y - 2, C.bone[3]); } else { a.s(x + 1, y - 9, 3, 10, C.wood); a.p(x + 4, y - 8, C.bone[3]); a.p(x, y - 6, C.bone[3]); } },
        sword: (a, x, y, f) => { if (f === 2) { a.r(x + 1, y, 8, 1, C.iron[3]); a.r(x + 1, y + 1, 7, 1, C.iron[1]); a.r(x, y - 1, 1, 3, C.gold[2]); } else { a.r(x + 1, y - 9, 1, 9, C.iron[3]); a.r(x + 2, y - 8, 1, 8, C.iron[1]); a.r(x, y, 3, 1, C.gold[2]); } },
        spear: (a, x, y) => { a.r(x + 1, y - 14, 1, 18, C.wood[2]); a.roof(x + 1, y - 17, 3, 1, 3, C.iron); },
        hammer: (a, x, y) => { a.r(x + 1, y - 5, 1, 6, C.wood[2]); a.s(x - 1, y - 7, 5, 3, C.iron); },
        pitch: (a, x, y) => { a.r(x + 1, y - 13, 1, 17, C.wood[2]); a.r(x, y - 13, 3, 1, C.iron[2]); a.r(x, y - 15, 1, 2, C.iron[3]); a.r(x + 2, y - 15, 1, 2, C.iron[3]); a.p(x + 1, y - 15, C.iron[3]); },
        bag: (a, x, y) => { a.s(x, y - 1, 4, 4, C.brown); a.r(x, y - 1, 4, 1, C.gold[3]); },
        basket: (a, x, y) => { a.s(x - 1, y, 5, 3, [0x7a5a32, 0xa37d48, 0xc8a066]); a.p(x, y - 1, 0xd84a4a); a.p(x + 2, y - 1, C.green[3]); },
        cane: (a, x, y) => { a.r(x + 1, y - 2, 1, 11, C.wood[2]); a.r(x, y - 2, 2, 1, C.wood[2]); },
        blow: (a, x, y) => { a.r(x, y - 1, 6, 1, C.wood[2]); a.p(x + 6, y - 1, C.leafF[3]); },
        icicle: (a, x, y, f) => { if (f === 2) { a.r(x + 1, y, 5, 1, 0x9ad8f0); a.p(x + 6, y, 0xe8fbff); } else { a.r(x + 1, y - 4, 1, 5, 0x9ad8f0); a.p(x + 1, y - 5, 0xe8fbff); } },
        snowball: (a, x, y, f) => { const sx = f === 2 ? x + 1 : x, sy = f === 2 ? y - 4 : y - 1; a.e(sx + 1, sy, 2, 2, [0xb8d8f0, 0xe8f4ff, 0xffffff], 0.2); },
        icestaff: (a, x, y, f, tTop, legTop) => { const sx = x + 1; a.r(sx, tTop - 4, 1, legTop - tTop + 8, 0x86d0ec); a.roof(sx, tTop - 9, 4, 1, 3, [0x5ab0d8, 0x9ad8f0, f === 2 ? 0xffffff : 0xe8fbff]); },
        rod: (a, x, y) => { a.line(x + 1, y, x + 5, y - 10, C.wood[2]); a.line(x + 5, y - 10, x + 6, y + 2, 0xd8d8d8); a.p(x + 6, y + 3, 0x5fa8e8); },
        obsblade: (a, x, y, f) => { if (f === 2) { a.r(x + 1, y, 5, 1, C.obs[3]); a.p(x + 6, y, 0xff7a1a); } else { a.r(x + 1, y - 4, 1, 5, C.obs[3]); a.p(x + 1, y - 5, 0xff7a1a); } },
        firestaff: (a, x, y, f, tTop, legTop) => { const sx = x + 1; a.r(sx, tTop - 3, 1, legTop - tTop + 7, C.obs[3]); a.e(sx, tTop - 6, 1.8, 2.4, f === 2 ? [0xffc35a, 0xfff2b0, 0xffffff] : C.lava, 0.2); },
        soulstaff: (a, x, y, f, tTop, legTop) => { const sx = x + 1; a.r(sx, tTop - 4, 1, legTop - tTop + 8, C.bone[1]); a.e(sx, tTop - 6, 1.6, 1.6, C.bone, 0.1); a.e(sx, tTop - 9, 1.6, 2.2, f === 2 ? [0x9a6aff, 0xd8c8ff, 0xffffff] : C.soul, 0.2); },
        oar: (a, x, y) => { a.r(x + 1, y - 10, 1, 15, C.wood[2]); a.s(x, y + 4, 3, 5, C.wood); },
        // SHAXTYOR kirkasi: turganda - tepaga ko'tarilgan, zarbada - oldinga urilgan
        minepick: (a, x, y, f) => {
            const HI = 0xe4e8f0, MID = 0xa8b0c0;
            if (f === 2) { a.line(x, y + 1, x + 7, y + 2, C.wood[1]); a.line(x, y, x + 7, y + 1, C.wood[2]); a.line(x + 8, y - 4, x + 8, y + 5, MID); a.line(x + 9, y - 3, x + 9, y + 3, HI); a.p(x + 8, y + 6, HI); return; }
            a.line(x + 1, y + 1, x + 3, y - 10, C.wood[2]); a.line(x, y + 1, x + 2, y - 10, C.wood[1]);
            a.line(x - 3, y - 8, x + 1, y - 11, HI); a.r(x + 1, y - 12, 3, 2, MID); a.line(x + 4, y - 12, x + 8, y - 8, HI); a.line(x + 4, y - 11, x + 7, y - 8, MID);
        },
        // SHAXTYOR SHUTER quroli: temir barabanli quvur (eskizdagidek); otganda orqaga tepadi, og'zida olov
        oregun: (a, x, y, f) => {
            const o = f === 2 ? -1 : 0, by = f === 2 ? y : y - 5;
            a.s(x - 3 + o, by, 7, 6, [0x3a2a1a, 0x6a4a2a, 0x8a6236, 0xa87c46], 0.1); a.r(x - 1 + o, by, 1, 6, C.iron[1]); a.r(x + 1 + o, by, 1, 6, C.iron[1]);
            a.s(x + 4 + o, by + 1, 6, 4, C.iron, 0.1); a.r(x + 10 + o, by, 1, 6, C.iron[3]); a.r(x + 10 + o, by + 2, 1, 2, 0x141014);
            if (f === 2) a.e(x + 12, by + 3, 1.6, 2.2, [0xff7a1a, 0xffc35a, 0xfff2b0, 0xffffff], 0.2);
        },
        pick: (a, x, y) => { a.r(x + 1, y - 8, 1, 10, C.wood[2]); a.line(x - 2, y - 8, x + 1, y - 9, C.iron[3]); a.line(x + 1, y - 9, x + 5, y - 7, C.iron[2]); }
    };
    // bosh kiyimlari
    const HAT = {
        // shaxtyor kaskasi: chetli, oldida chiroq; goggles - ko'zoynak
        minerhat: (pal, goggles) => (a, x, y, w) => {
            a.s(x, y - 2, w, 3, pal, 0.15); a.r(x - 2, y + 1, w + 4, 1, pal[1]); a.r(x + w - 1, y - 1, 2, 2, 0xfff2b0); a.p(x + w + 1, y, 0xffffff);
            if (goggles) { a.r(x, y + 2, w, 1, 0x1a1420); a.p(x + 1, y + 2, 0xff5a3a); a.p(x + w - 2, y + 2, 0xff5a3a); }
        },
        hood: (pal) => (a, x, y, w, h) => { a.s(x - 1, y - 1, w + 2, 3, pal, 0.1); a.s(x - 1, y + 2, 1, h - 1, pal); a.s(x + w, y + 2, 1, h - 1, pal, -0.1); },
        helmet: (a, x, y, w) => { a.s(x - 1, y - 2, w + 2, 4, C.iron, 0.1); a.r(x - 1, y + 1, w + 2, 1, C.iron[1]); a.r(x + Math.floor(w / 2), y + 2, 1, 2, C.iron[2]); },
        hornhelm: (a, x, y, w) => { a.s(x - 1, y - 2, w + 2, 4, C.iron, 0.1); a.line(x - 1, y - 1, x - 3, y - 4, C.bone[2]); a.line(x + w, y - 1, x + w + 2, y - 4, C.bone[2]); },
        wizard: (pal) => (a, x, y, w) => { a.roof(x + w / 2, y - 7, 7, 1, w + 4, pal); a.r(x - 2, y - 1, w + 4, 1, pal[3]); a.p(x + w / 2 + 1, y - 7, C.gold[3]); },
        crown: (a, x, y, w) => { a.s(x, y - 3, w, 2, C.gold, 0.1); for (let k = 0; k < w; k += 2) a.p(x + k, y - 4, C.gold[3]); a.p(x + Math.floor(w / 2), y - 2, C.red[2]); },
        darkhelm: (a, x, y, w, h) => { a.s(x - 1, y - 2, w + 2, h + 2, C.dark, 0.1); a.r(x, y + Math.floor(h / 2), w, 1, 0x000000); a.p(x + 2, y + Math.floor(h / 2), 0xff2a3a); a.p(x + w - 3, y + Math.floor(h / 2), 0xff2a3a); a.r(x + Math.floor(w / 2) - 1, y - 5, 2, 3, C.red[2]); },
        band: (c) => (a, x, y, w) => { a.r(x - 1, y + 1, w + 2, 1, c); a.p(x + w, y + 2, c); },
        feather: (c) => (a, x, y, w) => { a.r(x - 1, y + 1, w + 2, 1, c); a.line(x + w - 1, y, x + w + 1, y - 5, 0xf4efe2); a.p(x + w + 1, y - 5, 0xd84a4a); },
        mask: (a, x, y, w, h) => { a.s(x, y, w, h - 1, C.bone, 0.1); a.p(x + 1, y + 3, C.red[2]); a.p(x + w - 2, y + 3, C.red[2]); a.r(x, y - 1, w, 1, C.red[2]); a.line(x - 1, y, x - 2, y - 4, C.green[3]); a.line(x + w, y, x + w + 1, y - 4, C.green[3]); a.line(x + Math.floor(w / 2), y - 1, x + Math.floor(w / 2), y - 5, 0xf2c640); },
        fur: (a, x, y, w) => { a.s(x - 1, y - 2, w + 2, 3, [0xa8b8cc, 0xccd8e6, 0xffffff], 0.1); a.line(x, y - 2, x - 2, y - 5, 0xe8eef6); a.line(x + w - 1, y - 2, x + w + 1, y - 5, 0xe8eef6); },
        icecrown: (a, x, y, w) => { a.s(x, y - 2, w, 2, [0x4a9ac8, 0x7ac4e6, 0xc0ecff], 0.1); for (let k = 0; k < w; k += 2) { a.p(x + k, y - 3, 0x9ad8f0); a.p(x + k, y - 4 - (k % 4 ? 0 : 2), 0xe8fbff); if (!(k % 4)) a.p(x + k, y - 5, 0xe8fbff); } },
        horns: (a, x, y, w) => { a.line(x, y + 1, x - 2, y - 2, C.obs[3]); a.p(x - 2, y - 3, 0xff7a1a); a.line(x + w - 1, y + 1, x + w + 1, y - 2, C.obs[3]); a.p(x + w + 1, y - 3, 0xff7a1a); },
        straw: (a, x, y, w) => { a.s(x - 3, y, w + 6, 1, [0xb08a2a, 0xd8b048, 0xf2d070]); a.s(x, y - 2, w, 2, [0xb08a2a, 0xd8b048, 0xf2d070]); }
    };
    // ELF (o'yindagi ko'k elflar bilan bir xil): uchli qalpoq, ko'k teri, kamzul; item - qo'lida
    function elfLike(st, f, item) {
        const g = gNew(20, 28), a = api(g);
        const skin = st.skin || 0x81d4fa, skinD = st.skinD || 0x4fa3d1;
        const tun = st.tunic, tunD = st.tunicD, hatD = st.hatD, hatL = st.hat, ox = 1, oy = 1;
        const R = (x, y, w, h, c) => a.r(x + ox, y + oy, w, h, c);
        const bob = f === 1 ? 1 : 0;
        if (st.hood !== false) {
            R(9, 0 + bob, 2, 1, st.pompom || 0xffeb3b);
            R(8, 1 + bob, 3, 1, hatD); R(7, 2 + bob, 5, 1, hatD); R(6, 3 + bob, 7, 1, hatD); R(5, 4 + bob, 8, 1, hatD);
            R(7, 2 + bob, 3, 1, hatL); R(6, 3 + bob, 4, 1, hatL); R(5, 4 + bob, 5, 1, hatL);
            R(4, 5 + bob, 10, 2, st.brim || 0xffe082); R(4, 6 + bob, 2, 1, st.brimD || 0xffca28);
        } else if (st.headgear) st.headgear((x, y, w, h, c) => R(x, y + bob, w, h, c));
        R(5, 6 + bob, 8, 6, skin); R(12, 7 + bob, 1, 5, skinD);
        if (st.ears === false) { R(4, 8 + bob, 1, 2, skin); R(13, 8 + bob, 1, 2, skinD); }   // odam qulog'i (Skyland)
        else { R(2, 7 + bob, 3, 1, skin); R(3, 8 + bob, 2, 1, skin); R(13, 7 + bob, 3, 1, skin); R(13, 8 + bob, 2, 1, skinD); }
        R(7, 8 + bob, 1, 2, 0x0d1b3e); R(10, 8 + bob, 1, 2, 0x0d1b3e); R(8, 10 + bob, 2, 1, st.mouth || 0xe57373);
        if (st.beard) { R(5, 10 + bob, 8, 2, st.beard); R(6, 12 + bob, 6, 2, st.beard); }
        if (st.paint) { R(5, 9 + bob, 2, 1, st.paint); R(11, 9 + bob, 2, 1, st.paint); }
        R(8, 12 + bob, 2, 1, skinD);
        R(5, 13, 8, 6, tun); R(11, 13, 2, 6, tunD); R(7, 13, 4, 1, st.collar || 0x66bb6a);
        if (st.apron) { R(6, 14, 5, 7, st.apron); R(6, 14, 5, 1, st.apronD || st.apron); }
        R(5, 17, 8, 1, st.belt || 0x6d4c41); R(8, 17, 2, 1, 0xffca28);
        R(4, 19, 10, 2, tun); R(11, 19, 3, 2, tunD);
        R(3, 13, 2, 5, tun); R(3, 18, 2, 1, skin);
        R(13, 13, 2, 5, tunD); R(13, 18, 2, 1, skin);
        if (f === 1) { R(5, 21, 2, 3, 0x5d4037); R(11, 21, 2, 3, 0x5d4037); R(4, 24, 3, 2, 0x3e2723); R(11, 24, 3, 2, 0x3e2723); }
        else { R(6, 21, 2, 3, 0x5d4037); R(10, 21, 2, 3, 0x5d4037); R(5, 24, 3, 2, 0x3e2723); R(10, 24, 3, 2, 0x3e2723); }
        if (item) WPN[item](a, 13 + ox, 18 + oy, 0, 13 + oy, 21 + oy);
        return gOutline(g, 0x0b1d33);
    }
    // TO'RT OYOQLI (bo'ri, kalamush, alfa): o'ngga qaragan
    function beast(o, f) {
        return art(o.W, o.H, (a) => {
            const W = o.W, H = o.H, by = H - o.legH;
            if (o.tail) a.line(1, by - o.bodyH + 2, 4, by - o.bodyH + 3 + (f === 1 ? 1 : 0), o.tail);
            if (o.tail) a.line(0, by - o.bodyH + 1, 1, by - o.bodyH + 2, o.tail);
            const legs = f === 1 ? [3, 7, W - 11, W - 7] : [4, 8, W - 12, W - 8];
            legs.forEach((x, i) => { a.s(x, by - 1, 2, o.legH + (f === 1 && i % 2 ? -1 : 0), o.pal, -0.2); a.r(x, H - 1, 3, 1, o.pal[0]); });
            a.e(W / 2 - 1, by - o.bodyH / 2, W / 2 - 4, o.bodyH / 2, o.pal);
            if (o.mane) a.e(W - 9, by - o.bodyH + 1, 4, o.bodyH / 2 + 1, o.mane);
            // bosh va tumshuq
            const hx = W - 6, hy = by - o.bodyH - 1;
            a.e(hx, hy + 2, 3.6, 3.2, o.pal, 0.1);
            a.s(hx + 2, hy + 2 + (f === 2 ? 1 : 0), 4, 3, o.pal, 0.05);
            a.p(hx + 5, hy + 2 + (f === 2 ? 1 : 0), OUT);
            if (f === 2) { a.r(hx + 2, hy + 5, 4, 1, 0x7a1018); a.p(hx + 3, hy + 5, 0xffffff); a.p(hx + 5, hy + 5, 0xffffff); }
            a.p(hx + 1, hy + 1, o.eye || 0xffe14a);
            a.line(hx - 2, hy, hx - 1, hy - 3, o.pal[1]); a.p(hx - 1, hy - 2, o.pal[3]);
            if (o.stripe) a.r(Math.round(W / 2) - 6, by - o.bodyH + 1, 9, 1, o.stripe);
        });
    }
    function spiderG(pal, eye, W, H, f, crown) {
        return art(W, H, (a) => {
            const cy = H - 5;
            for (let k = 0; k < 4; k++) {
                const lx = Math.round(W * 0.3 + k * W * 0.12), up = (f + k) % 2;
                a.line(lx, cy - 1, lx - 3 - k, cy - 4 - up, pal[1]); a.line(lx - 3 - k, cy - 4 - up, lx - 4 - k, H - 1, pal[1]);
                a.line(lx + 2, cy - 1, lx + 4 + k, cy - 4 - (1 - up), pal[0]); a.line(lx + 4 + k, cy - 4 - (1 - up), lx + 5 + k, H - 1, pal[0]);
            }
            a.e(W * 0.36, cy - 3, W * 0.22, 4.2, pal, 0.05);
            a.e(W * 0.36, cy - 4, W * 0.08, 1.6, [0x8e1a1e, 0xc62f2f]);
            a.e(W * 0.68, cy - 2, W * 0.13, 3, pal, 0.12);
            [[0.72, -3], [0.78, -2], [0.75, -1]].forEach(([fx, dy]) => a.p(W * fx, cy + dy, eye));
            if (f === 2) { a.p(W * 0.82, cy, C.bone[3]); a.p(W * 0.82, cy + 1, C.bone[3]); }
            if (crown) { a.r(W * 0.62, cy - 6, 5, 1, C.gold[3]); a.p(W * 0.62, cy - 7, C.gold[3]); a.p(W * 0.64 + 2, cy - 7, C.gold[3]); a.p(W * 0.62 + 4, cy - 7, C.gold[3]); }
        });
    }
    function treantG(W, H, f, eye, big) {
        return art(W, H, (a) => {
            const cx = W / 2, legTop = H - 5;
            a.s(cx - 2 - (f === 1 ? 2 : 0), legTop, 3, 5, C.bark, -0.1); a.s(cx + 1 + (f === 1 ? 2 : 0), legTop, 3, 5, C.bark, -0.15);
            a.s(cx - 5, Math.round(H * 0.36), 10, Math.round(H * 0.5), C.bark);
            for (let y = Math.round(H * 0.4); y < legTop; y += 3) a.p(cx - 3 + (y % 2) * 4, y, C.bark[0]);
            // qo'l-shoxlar
            const ay = Math.round(H * 0.45) + (f === 2 ? -4 : 0);
            a.line(cx - 5, ay + 2, cx - 10, ay - 2 + (f === 1 ? 2 : 0), C.bark[2]); a.line(cx - 10, ay - 2, cx - 11, ay - 5, C.bark[1]);
            a.line(cx + 5, ay + 2, cx + 10 + (f === 2 ? 2 : 0), ay - 2, C.bark[2]); a.line(cx + 10, ay - 2, cx + 12, ay - 5, C.bark[1]);
            a.e(cx, H * 0.2, W * 0.42, H * 0.2, C.leafF); a.e(cx - W * 0.25, H * 0.27, W * 0.18, H * 0.11, C.leafF, -0.05); a.e(cx + W * 0.25, H * 0.25, W * 0.2, H * 0.12, C.leafF, -0.08);
            const ey = Math.round(H * 0.5);
            a.r(cx - 3, ey, 2, 2, eye); a.r(cx + 1, ey, 2, 2, eye); a.r(cx - 2, ey + 4, 4, 1, OUT);
            if (big) { for (let k = 0; k < 6; k++) a.p(cx - 8 + k * 3, H * 0.12 + (k % 2), 0xe86ad0); a.r(cx - 1, ey + 5, 2, 1, OUT); }
        });
    }

    // ===== ELF QIROLLIGI: O'G'RI-TALONCHILAR =====
    // Eski zamon o'g'rilari: kapishonli plash (yuzi ko'rinmaydi - qorong'ida faqat oq ko'zlar), charm kamzul, belbog', etik; qalqon va pichoq / kamon / katta qilich.
    // Kadrlar: 0 - turish, 1 - qadam (oyoqlar keng), 2 - zarba / o'q otish, 3 - sakrash, 4 - qalqon ko'targan, 5 - qadam (oyoqlar yonma-yon)
    const TH = { cloak: [0x121018, 0x1e1b26, 0x2c2836, 0x3e3849], leath: [0x24170e, 0x3a2716, 0x56391f, 0x76522e], cloth: [0x17151b, 0x242129, 0x332f3a],
        boot: 0x120d0a, eye: 0xf4fbff, eyeG: 0x8fd6ff, steel: [0x4a525c, 0x7a8692, 0xb8c2cc, 0xeef2f6], strap: 0x1a1009, scarf: [0x3a1012, 0x5a181a, 0x7a2224] };
    function thief(o, f) {
        return art(o.W, o.H, (a) => {
            const big = o.kind === 'brute', W = o.W, H = o.H;
            const tw = big ? 10 : 7, th = big ? 10 : 8, hw = big ? 11 : 9, hh = big ? 8 : 7, legH = big ? 8 : 7, armW = big ? 3 : 2;
            const crouch = f === 4 ? 1 : 0, jump = f === 3, lunge = f === 2 && o.kind !== 'archer' ? 1 : 0;
            const cx = (big ? 12 : 9) + lunge, bob = f === 1 ? 1 : 0;
            const feet = H - 1, legTop = H - legH + crouch - (jump ? 3 : 0), tTop = legTop - th + bob, hTop = tTop - hh + 2;   // sakrashda butun gavda yuqorida, oyoqlar bukilgan
            const tx = cx - Math.floor(tw / 2), hx = cx - Math.floor(hw / 2);
            // PLASH (orqada): sakraganda yuqoriga hilpiraydi
            if (jump) { a.s(tx - 3, tTop - 1, 4, th + 2, TH.cloak, -0.1); a.line(tx - 3, tTop + th, tx - 6, tTop + th + 3, TH.cloak[1]); }
            else { a.s(tx - 2, tTop + 1, 3, th + legH - 3 - crouch, TH.cloak, -0.12); a.p(tx - 2, feet - 2 - crouch, TH.cloak[0]); a.p(tx - 1, feet - 1 - crouch, TH.cloak[1]); }
            // OYOQLAR
            const lw = big ? 3 : 2;
            const leg = (x, y0, len, back) => { a.s(x, y0, lw, len, TH.cloth, back ? -0.12 : 0); a.r(x - (back ? 1 : 0), y0 + len, lw + 1, 2, TH.boot); };
            if (jump) {   // tizzalar oldinga bukilgan
                a.s(tx, legTop - 2, lw + 2, lw, TH.cloth); a.s(tx + 2, legTop - 2 + lw, lw, 3, TH.cloth); a.r(tx + 1, legTop + lw + 1, lw + 1, 2, TH.boot);
                a.s(tx + tw - lw - 1, legTop - 3, lw + 2, lw, TH.cloth, -0.1); a.s(tx + tw, legTop - 3 + lw, lw, 3, TH.cloth, -0.1); a.r(tx + tw, legTop + lw, lw + 1, 2, TH.boot);
            } else {
                const sp = f === 1 ? [tx - 1, tx + tw - lw + 2] : f === 2 && lunge ? [tx - 2, tx + tw - lw + 3] : f === 5 ? [tx + 2, tx + tw - lw - 1] : [tx, tx + tw - lw];
                leg(sp[0], legTop, legH - 2 - crouch, true); leg(sp[1], legTop, legH - 2 - crouch, false);
            }
            // TANA: charm kamzul, qiyshiq tasma, belbog' va to'qa
            a.s(tx, tTop, tw, th, TH.leath);
            a.line(tx, tTop + 1, tx + tw - 1, tTop + th - 3, TH.strap);
            a.r(tx, tTop + th - 2, tw, 1, TH.strap); a.p(cx, tTop + th - 2, C.gold[2]);
            if (big) { a.s(tx + 1, tTop + 1, tw - 2, 3, C.iron, 0.05); a.r(tx + 2, tTop + 4, tw - 4, 1, C.iron[1]); }   // kachok - ko'krak temir plastinka
            // yelkadagi plash (mantiya)
            a.s(tx - 1, tTop - 1, tw + 2, 2, TH.cloak, 0.05);
            // ORQA QO'L (qalqon shu qo'lda; 4-kadrda qalqon oldinga o'tadi)
            const backArmX = tx - armW;
            a.s(backArmX, tTop + 1, armW, th - 3, TH.cloak, -0.15);
            // BOSH: kapishon, ichi zim-ziyo, faqat oq ko'zlar; yuz pastida sharf
            a.s(hx, hTop, hw, hh, TH.cloak, 0.05);
            a.r(hx + 1, hTop - 1, hw - 2, 1, TH.cloak[2]);
            a.p(hx - 1, hTop + 1, TH.cloak[1]); a.p(hx - 2, hTop + 2, TH.cloak[0]);            // kapishon uchi orqaga osilgan
            const fx0 = hx + 2, fw = hw - 3, fy0 = hTop + 2, fh = hh - 4;
            a.r(fx0, fy0, fw, fh, 0x050407);                                                      // yuz o'rni - qorong'i
            const ey = fy0 + Math.floor(fh / 2) - (f === 2 && o.kind === 'archer' ? 0 : 0);
            a.p(fx0 + fw - 4, ey, TH.eye); a.p(fx0 + fw - 1, ey, TH.eye);                          // ko'zlar (qaragan tomonda)
            if (big) { a.p(fx0 + fw - 5, ey, TH.eyeG); a.p(fx0 + fw - 2, ey, TH.eyeG); }
            a.s(hx + 1, hTop + hh - 2, hw - 2, 2, TH.scarf, 0.05);                                // sharf / niqob
            // OLD QO'L va QUROL
            const sh = (sx, sy, r) => { a.e(sx, sy, r, r + 0.4, C.wood, 0.1); for (let k = 0; k < 16; k++) { const an = k / 16 * Math.PI * 2; a.p(sx + Math.cos(an) * r, sy + Math.sin(an) * (r + 0.4), C.iron[2]); } a.p(Math.round(sx), Math.round(sy), C.iron[3]); };
            const bigShield = (sx, sy, w2, h2) => { a.s(sx, sy, w2, h2, C.wood, 0.05); for (let y = sy + 2; y < sy + h2 - 1; y += 3) a.r(sx, y, w2, 1, C.wood[0]); a.r(sx, sy, w2, 1, C.iron[2]); a.r(sx, sy + h2 - 1, w2, 1, C.iron[1]); a.r(sx, sy, 1, h2, C.iron[1]); a.r(sx + w2 - 1, sy, 1, h2, C.iron[2]); a.e(sx + w2 / 2 - 0.5, sy + h2 / 2, 1.4, 1.4, C.iron, 0.2); };
            const fArmX = tx + tw, hand = 0x2a2026;
            if (f === 4) {
                // QALQON KO'TARDI: oldida katta qalqon (o'q / zarba to'siladi)
                a.s(fArmX, tTop + 1, armW, 4, TH.cloak);
                if (big) bigShield(fArmX + 1, tTop - 2, 6, 13); else sh(fArmX + 3, tTop + 3, 3.4);
                return;
            }
            // qalqon orqa qo'lda
            if (big) bigShield(backArmX - 4, tTop + 1, 5, 11); else sh(backArmX - 1, tTop + th - 3, 2.4);
            if (o.kind === 'archer') {
                // KAMONCHI: orqada o'qdon (patli o'qlar), qo'lida kamon
                a.s(tx - 3, tTop - 1, 2, 6, C.brown, 0.05); a.p(tx - 3, tTop - 2, 0xd84a4a); a.p(tx - 2, tTop - 3, 0xf4efe2); a.p(tx - 4, tTop - 3, 0xf4efe2);
                if (f === 2) {
                    // O'Q OTMOQDA: kamon oldinga, ip ko'krakkacha tortilgan, o'q gorizontal
                    const by = tTop + 3;
                    a.s(fArmX, by, 5, armW, TH.cloak); a.p(fArmX + 5, by, hand);
                    for (let k = -5; k <= 5; k++) a.p(fArmX + 5 + Math.round(2.4 * Math.cos(k / 5 * Math.PI / 2)), by + k, C.wood[2 + (k === 0 ? 1 : 0)]);   // kamon - oldinga bukilgan
                    a.line(fArmX + 5, by - 5, cx, by, 0xe6e6e6); a.line(fArmX + 5, by + 5, cx, by, 0xe6e6e6);                                             // ip - orqaga tortilgan
                    a.r(cx + 1, by, 10, 1, C.wood[3]); a.p(cx + 11, by, TH.steel[3]); a.p(cx + 10, by - 1, TH.steel[2]); a.p(cx + 10, by + 1, TH.steel[2]); a.p(cx, by - 1, 0xd84a4a);
                } else {
                    a.s(fArmX, tTop + 1, armW, th - 3, TH.cloak, 0.05); a.p(fArmX, tTop + th - 2, hand);
                    const bx = fArmX + 2, by0 = tTop - 3;
                    for (let k = 0; k <= 11; k++) a.p(bx + (k < 2 || k > 9 ? 0 : 1), by0 + k, C.wood[2]);
                    a.r(bx - 1, by0 + 1, 1, 10, 0xd8d8d8);
                }
                return;
            }
            if (f === 2) {
                // ZARBA: qo'l oldinga, qurol gorizontal + zarba izi
                const ay = tTop + 3;
                a.s(fArmX, ay, big ? 5 : 4, armW, TH.cloak); a.p(fArmX + (big ? 5 : 4), ay, hand);
                const bx = fArmX + (big ? 6 : 5);
                if (big) { a.s(bx, ay - 2, 10, 3, TH.steel, 0.1); a.r(bx, ay + 1, 9, 1, TH.steel[1]); a.r(bx - 1, ay - 3, 1, 5, C.gold[2]); }   // katta qilich (yalpoq tig')
                else { a.r(bx, ay, 5, 1, TH.steel[3]); a.r(bx, ay + 1, 4, 1, TH.steel[1]); a.p(bx - 1, ay, C.gold[2]); a.p(bx - 1, ay + 1, C.gold[2]); }
                for (let k = 0; k < 7; k++) { const an = -1.1 + k * 0.36, r = big ? 9 : 7; a.p(bx + 2 + Math.cos(an) * r, ay + Math.sin(an) * r, k % 2 ? 0xdde6ee : 0xa8b4c0); }
                return;
            }
            // oddiy: qurol qo'lida
            a.s(fArmX, tTop + 1, armW, th - 3, TH.cloak, 0.05); a.p(fArmX + (big ? 1 : 0), tTop + th - 2, hand);
            const wx = fArmX + (big ? 2 : 1), wy = tTop + th - 2;
            if (big) { a.r(wx, wy + 1, 1, 2, C.wood[1]); a.r(wx - 1, wy, 3, 1, C.gold[2]); a.s(wx - 1, wy - 11, 3, 11, TH.steel, 0.1); a.p(wx, wy - 12, TH.steel[3]); }
            else { a.r(wx, wy - 4, 1, 4, TH.steel[3]); a.p(wx, wy - 5, 0xffffff); a.r(wx - 1, wy, 3, 1, C.gold[2]); a.p(wx, wy + 1, C.wood[1]); }
            if (jump) { a.p(cx, hTop - 2, TH.cloak[2]); }
        });
    }
    // YOVUZ SEHRGAR ELF: havoda muallaq (oyoq o'rnida yirtiq to'n etagi va qora tuman), kapishonli to'q binafsha to'n, uchli quloqlar,
    // oqish-kulrang teri, binafsha porlagan ko'zlar, bosh suyakli tayoq. 0/1 - suzish, 2 - sehr (tayoq oldinga, uchida yorqin olov)
    const DE = { robe: [0x12081e, 0x22103a, 0x351a55, 0x4c2a72], trim: 0x9a5ad8, skin: [0x6a6478, 0x8a849a, 0xaaa4bc, 0xc8c2d8], eye: 0xe6a8ff };
    function darkElf(f) {
        return art(20, 27, (a) => {
            const b = f === 1 ? 1 : 0;
            // tuman va yirtiq etak
            for (let k = 0; k < 6; k++) a.p(4 + k * 2 + ((f + k) % 2), 25 - (k % 2), 0x2a1a3a);
            for (let x = 4; x < 15; x++) { const h = 2 + ((x * 7 + f) % 3); a.r(x, 21 + b, 1, h, x % 2 ? DE.robe[1] : DE.robe[0]); }
            // to'n
            a.s(4, 11 + b, 11, 11, DE.robe, 0.05); a.r(9, 11 + b, 1, 11, DE.trim); a.r(4, 16 + b, 11, 1, DE.robe[3]);
            for (let y = 13; y < 22; y += 3) a.p(9, y + b, 0xd8b0ff);
            // qo'llar (yeng)
            a.s(2, 12 + b, 2, 6, DE.robe, -0.1); a.r(2, 18 + b, 2, 1, DE.skin[2]);
            // kapishon va yuz
            a.s(5, 2 + b, 9, 9, DE.robe, 0.1); a.r(6, 1 + b, 7, 1, DE.robe[2]); a.p(9, 0 + b, DE.robe[3]);
            a.s(7, 4 + b, 6, 6, DE.skin, 0.05);
            a.p(4, 5 + b, DE.skin[2]); a.p(3, 4 + b, DE.skin[3]); a.p(14, 5 + b, DE.skin[2]); a.p(15, 4 + b, DE.skin[3]);   // uchli quloqlar
            a.p(10, 6 + b, DE.eye); a.p(12, 6 + b, DE.eye); a.p(9, 6 + b, 0x4a1a6a);
            a.r(10, 8 + b, 3, 1, 0x2a1838); a.p(11, 9 + b, DE.skin[1]);
            // tayoq
            const cast = f === 2, sx = cast ? 17 : 15;
            if (cast) { a.r(13, 13 + b, 4, 2, DE.robe[2]); a.line(15, 4 + b, 19, 22 + b, C.bark[2]); }
            else { a.s(13, 12 + b, 2, 6, DE.robe, 0.05); a.r(sx, 3 + b, 1, 21, C.bark[2]); }
            const ox = cast ? 15 : sx, oy = cast ? 3 + b : 2 + b;
            a.e(ox, oy, 1.6, 1.6, C.bone, 0.1); a.p(ox - 1, oy, OUT); a.p(ox + 1, oy, OUT);
            a.e(ox, oy - 2, cast ? 2.2 : 1.4, cast ? 2.2 : 1.4, cast ? [0x9a4aff, 0xe0b0ff, 0xffffff] : [0x5a1a9a, 0x9a4aff, 0xd8a8ff], 0.2);
            if (cast) for (let k = 0; k < 5; k++) a.p(ox + Math.cos(k * 1.3) * 4, oy - 2 + Math.sin(k * 1.3) * 4, 0xd8a8ff);
        });
    }
    // SAMBOCHI ELF (maxfiy boss): bahaybat, mushakdor ko'k elf; qizil sambo kurtkasi (oq tikuv, yelkada "qanotchalar"), qora belbog',
    // qizil shortik, qizil-oq kurash poyabzali; kalta qora soch, uchli quloqlar, qalin qoshlar.
    // SKELET bo'yicha chiziladi (bo'g'inlar - poza jadvalida), shuning uchun barcha kadrlarda tana nisbati bir xil:
    // 0 - kurash turishi, 1 / 2 - qadamlar, 3 - ushlashga otilish, 4 - quchoqlab ko'tarish, 5 - orqaga egilish, 6 - "na progib" ko'prik
    // (boshi yerda), 7 - sakrash, 8 - tosh ko'targan, 9 - tosh otish
    const SB = { skin: [0x1f5f8a, 0x3a8bc0, 0x6cb8e4, 0xa8dcf6], kurt: [0x5a080c, 0x8e1418, 0xc0262a, 0xe85a50], belt: [0x0c0a0c, 0x1c181c, 0x2e282e],
        shorts: [0x3a0608, 0x5a0a0e, 0x7e1418], shoe: [0x6a0a0e, 0xa01a1e, 0xd03a3a], sole: 0xf0ece8, hair: [0x120c0a, 0x22180f, 0x342418], stitch: 0xf4e4e0 };
    // [son, tizza, oyoq] x2 (orqa, old), son (hip), tana qiyaligi (gradus; + oldinga, - orqaga), qo'llar: [tirsak, kaft] x2 (orqa, old); y - yer = 39
    const SBP = [
        { hip: [24, 24], a: 14, legs: [[20, 31, 18, 37], [29, 31, 31, 37]], arms: [[29, 19, 34, 17], [31, 19, 37, 16]] },                 // 0 turish
        { hip: [24, 23], a: 16, legs: [[21, 30, 17, 37], [29, 30, 32, 37]], arms: [[24, 18, 27, 23], [31, 17, 36, 14]] },                 // 1 qadam
        { hip: [24, 23], a: 16, legs: [[27, 30, 29, 37], [21, 30, 19, 37]], arms: [[30, 17, 35, 15], [26, 18, 28, 24]] },                 // 2 qadam
        { hip: [22, 25], a: 42, legs: [[16, 31, 10, 37], [29, 31, 33, 37]], arms: [[37, 18, 43, 17], [38, 19, 44, 19]], mouth: 1 },      // 3 otilish
        { hip: [24, 24], a: -10, legs: [[20, 31, 18, 37], [28, 31, 30, 37]], arms: [[27, 16, 30, 12], [28, 17, 31, 13]], mouth: 1 },     // 4 quchoqlab ko'tarish
        { hip: [27, 22], a: -62, legs: [[26, 30, 22, 37], [32, 29, 29, 37]], arms: [[13, 9, 9, 4], [14, 10, 11, 5]], mouth: 1, ht: 1, tw: 0.85 },          // 5 orqaga egilish
        { hip: [28, 19], a: -138, legs: [[31, 28, 26, 37], [35, 28, 32, 37]], arms: [[11, 27, 6, 31], [12, 28, 7, 33]], mouth: 1, ht: 1, tw: 0.72 },       // 6 ko'prik (boshi yerda)
        { hip: [24, 20], a: 8, legs: [[21, 26, 17, 31], [29, 25, 25, 31]], arms: [[17, 7, 12, 3], [33, 7, 38, 3]], mouth: 1, ht: 1 },         // 7 sakrash
        { hip: [24, 24], a: -4, legs: [[20, 31, 17, 37], [28, 31, 31, 37]], arms: [[18, 6, 20, -2], [29, 6, 27, -2]], rock: 1, ht: 1 },          // 8 tosh
        { hip: [23, 24], a: 26, legs: [[18, 31, 15, 37], [29, 31, 32, 37]], arms: [[30, 18, 34, 20], [35, 12, 40, 9]], mouth: 1 },        // 9 otish
    ];
    function sambo(f) {
        const H = 50, oy = H - 1 - 39, P = SBP[f] || SBP[0];
        return art(48, H, (a) => {
            const lit = (nx, ny, l = 0) => 0.9 + l - (nx + 1) * 0.17 - (ny + 1) * 0.27;
            // yumaloq bo'g'in (kapsula): har piksel - kesmagacha masofa bo'yicha, yorug'lik chap-yuqoridan
            const cap = (x0, y0, x1, y1, r0, r1, pal, l = 0) => {
                y0 += oy; y1 += oy;
                const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1, R = Math.max(r0, r1);
                for (let y = Math.floor(Math.min(y0, y1) - R); y <= Math.ceil(Math.max(y0, y1) + R); y++) for (let x = Math.floor(Math.min(x0, x1) - R); x <= Math.ceil(Math.max(x0, x1) + R); x++) {
                    const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / L2)), px = x - (x0 + dx * t), py = y - (y0 + dy * t), r = r0 + (r1 - r0) * t, d = Math.hypot(px, py);
                    if (d <= r) a.p(x, y, shade(lit(px / r, py / r, l), x, y, pal));
                }
            };
            const rad = P.a * Math.PI / 180, ux = Math.sin(rad), uy = -Math.cos(rad);     // tana yo'nalishi (sondan bo'yinga)
            const TL = 14, [hx, hy] = P.hip, nx = hx + ux * TL, ny = hy + uy * TL;                  // bo'yin
            const leg = (L) => { const [kx, ky, fx, fy] = L;
                cap(hx, hy, kx, ky, 3.6, 3.0, SB.skin); cap(kx, ky, fx, fy - 1, 3.0, 2.3, SB.skin);
                const fd = fy < 37 ? 0 : 1, tx = fx + 2.5;                                   // kurash poyabzali (oldinga qaragan), oq tagcharm
                cap(fx - 1, fy - 1.5, tx, fy - 1, 1.8, 1.6, SB.shoe); if (fd) { a.r(Math.round(fx - 2), fy + oy, 6, 1, SB.sole); } };
            const arm = (A, back) => { const [ex, ey, kx, ky] = A, sx = nx + (back ? -1.5 : 1.5) * Math.cos(rad), sy = ny + 2 + (back ? -1.5 : 1.5) * Math.sin(rad);
                cap(sx, sy, ex, ey, 3.6, 3.0, SB.kurt, back ? -0.15 : 0);                     // kurtka yengi
                cap(ex, ey, kx, ky, 2.9, 2.5, SB.skin, back ? -0.15 : 0);                     // bilak
                cap(kx, ky, kx, ky, 2.8, 2.8, SB.skin, back ? -0.1 : 0.05); };                 // musht
            // orqa qo'l va oyoq
            arm(P.arms[0], true); leg(P.legs[0]); leg(P.legs[1]);
            // SHORTIK: son boshlarini yopadi
            P.legs.forEach(([kx, ky]) => cap(hx, hy, hx + (kx - hx) * 0.42, hy + (ky - hy) * 0.42, 4.4, 3.9, SB.shorts));
            // KURTKA: keng yelka, toraygan bel (trapetsiya, tana yo'nalishi bo'ylab)
            const px = -uy, py = ux;                                                        // ko'ndalang yo'nalish
            for (let y = 0; y < H; y++) for (let x = 0; x < 48; x++) {
                const rx = x - hx, ry = y - oy - hy, v = (rx * ux + ry * uy) / TL, u = rx * px + ry * py;   // v: 0 - bel, 1 - yelka
                if (v < -0.2 || v > 1.06) continue;
                const half = ((5.6 + 4.2 * Math.max(0, Math.min(1, v * 1.25)) - (v > 0.82 ? (v - 0.82) * 14 : 0))) * (P.tw || 1);   // keng ko'krak, toraygan bel
                if (Math.abs(u) > half) continue;
                let c = shade(lit(u / half, -v * 0.8 + 0.2), x, y, SB.kurt);
                if (v > -0.02 && v < 0.12) c = shade(0.6 + (u / half) * -0.2, x, y, SB.belt);                         // belbog'
                else if (Math.abs(Math.abs(u) - half) < 0.8 && Math.round(v * 12) % 2 === 0) c = SB.stitch;  // chetidagi oq tikuv
                else if (v > 0.55 && Math.abs(u - (v - 0.55) * 4.5) < 0.7) c = SB.kurt[0];                  // yoqa chizig'i
                else if (v > 0.7 && u > (v - 0.55) * 4.5 && u < half - 1.2 && u > 0) c = shade(lit(0.2, 0.1), x, y, SB.skin);   // ochiq ko'krak
                a.p(x, y, c);
            }
            // belbog' tuguni (oldida) va osilgan uchlari
            const bx = hx + ux * 0.7 + px * 4.4, by = hy + uy * 0.7 + py * 4.4;
            cap(bx, by, bx, by, 1.4, 1.4, SB.belt); cap(bx, by, bx - uy * 0 + ux * -3 + px * 0.6, by - uy * -3 + py * 0.6, 0.8, 0.8, SB.belt);
            // yelkadagi "qanotcha" (sambo kurtkasi)
            cap(nx - ux * 1.5 - px * 6.5, ny - uy * 1.5 - py * 6.5, nx - ux * 1.5 + px * 6.5, ny - uy * 1.5 + py * 6.5, 1.5, 1.5, SB.kurt, 0.15);
            // BOSH: tana yo'nalishida, mahalliy koordinatada (yuz - oldinga): soch tepada, uchli quloq, qosh, ko'z, og'iz
            const hcx = nx + ux * 5.2, hcy = ny + uy * 5.2 + oy, fwdX = -uy, fwdY = ux;      // yuz yo'nalishi (tanaga tik)
            const head = () => { for (let y = Math.floor(hcy - 7); y <= Math.ceil(hcy + 7); y++) for (let x = Math.floor(hcx - 7); x <= Math.ceil(hcx + 7); x++) {
                const dx = x - hcx, dy = y - hcy, lu = dx * fwdX + dy * fwdY, lv = -(dx * ux + dy * uy);   // lu: yuz tomonga +, lv: pastga +
                const ear = lv > -1.5 && lv < 1.5 && lu < -1.5 && lu > -7 && Math.abs(lv + (lu + 1.5) * 0.35) < 1.1 - (-(lu + 1.5)) * 0.12;
                const inHead = (lu / 4.4) ** 2 + (lv / 4.9) ** 2 <= 1 || (lu > 2 && lu < 5 && lv > 1 && lv < 4.6);   // jag' (kvadrat)
                if (!inHead && !ear) continue;
                let c = shade(lit(-lu / 4.4 * 0.6, lv / 4.9 * 0.8), x, y, SB.skin);
                if (inHead && lv < -2.2 + Math.max(0, -lu) * 0.1 && lu < 4.2) c = shade(0.55 - lv * 0.05, x, y, SB.hair);   // kalta soch
                if (inHead && Math.abs(lv + 0.8) < 0.6 && lu > 0.6 && lu < 4) c = 0x0e1820;                                    // qalin qosh
                if (inHead && Math.abs(lv - 0.6) < 0.6 && lu > 1.6 && lu < 3.2) c = 0xffffff;                                  // ko'z
                if (inHead && Math.abs(lv - 0.6) < 0.6 && lu >= 2.6 && lu < 3.2) c = 0x101820;
                if (inHead && Math.abs(lv - 3.2) < 0.6 && lu > 2.2 && lu < 4.6) c = P.mouth ? 0x5a0a0e : 0x14243a;           // og'iz
                if (P.mouth && inHead && Math.abs(lv - 2.6) < 0.5 && lu > 2.8 && lu < 4.2) c = 0xffffff;                       // tishlar
                a.p(x, y, c);
            } };
            // old qo'l (odatda boshdan oldinda; egilish / sakrash / toshda - bosh ustda, yuz ko'rinsin)
            if (!P.ht) head();
            arm(P.arms[1], false);
            if (P.ht) head();
            // TOSH (boshi ustida)
            if (P.rock) { const rx = (P.arms[0][2] + P.arms[1][2]) / 2, ry = P.arms[0][3] - 3.5 + oy; a.e(rx, ry, 8, 5, C.stone, 0.1); a.p(Math.round(rx - 4), Math.round(ry - 3), C.stone[4]); a.line(rx - 5, ry + 1, rx + 2, ry - 2, C.stone[0]); a.line(rx + 1, ry + 2, rx + 5, ry, C.stone[1]); }
        });
    }
    // ===== O'RMON: OVCHILAR, KALTAKESAK, BAHAYBAT DARAXT =====
    // Ovchilar: yuzi ochiq (qoraygan teri), yashil kamzul, charm belbog', jigarrang shim, etik.
    // spear - yashil kapishon, orqada nayzalar, qo'lida uzun nayza; knives - qizil peshonabog', ikki qo'lida pichoq; shield - temir dubulg'a, soqol, dumaloq qalqon va qilich.
    // Kadrlar: 0 - turish, 1 - qadam, 2 - zarba / otish, 3 - sakrash, 4 - qalqon ko'targan, 5 - qadam (oyoqlar yonma-yon)
    const FH = { tunic: [0x18301a, 0x264a24, 0x386630, 0x50843e], leath: [0x2e1c12, 0x4a2f1d, 0x6b4529, 0x8f633c], pants: [0x2a2018, 0x3e3024, 0x564434], boot: 0x1a120c,
        hair: [0x22160c, 0x3a2614], band: [0x5a0e0e, 0x8e1a1a, 0xc23030], steel: [0x4a525c, 0x7a8692, 0xb8c2cc, 0xeef2f6], eye: 0x14100c };
    function hunter(kind, f) {
        const big = kind === 'shield', W = big ? 26 : 24, H = big ? 28 : 26;
        return art(W, H, (a) => {
            const jump = f === 3, guard = f === 4, atk = f === 2, bob = f === 1 ? 1 : 0;
            const cx = big ? 12 : 10, tw = big ? 9 : 7, th = big ? 9 : 8, legH = 7, feet = H - 1;
            const legTop = feet - legH + 1 - (jump ? 3 : 0) + (guard ? 1 : 0), tTop = legTop - th + bob, hh = 7, hw = 7, hTop = tTop - hh + 1;
            const tx = cx - Math.floor(tw / 2), hx = cx - 3;
            // orqadagi narsalar: nayzachi - nayzalar (o'qdon), qalqonchi - qalqon (orqa qo'lda)
            if (kind === 'spear') { [0, 2].forEach(k => { a.line(tx - 2 + k, tTop - 4, tx + k, tTop + th, C.wood[2]); a.p(tx - 2 + k, tTop - 5, FH.steel[3]); }); a.s(tx - 1, tTop + 1, 3, 6, FH.leath, 0.05); }
            // OYOQLAR
            const leg = (x, y0, len, back) => { a.s(x, y0, 3, len, FH.pants, back ? -0.14 : 0); a.r(x - (back ? 1 : 0), y0 + len, 4, 2, FH.boot); };
            if (jump) {
                a.s(tx, legTop, 5, 3, FH.pants, -0.1); a.s(tx + 2, legTop + 3, 3, 3, FH.pants, -0.1); a.r(tx + 1, legTop + 6, 4, 2, FH.boot);
                a.s(tx + tw - 3, legTop - 1, 5, 3, FH.pants); a.s(tx + tw, legTop + 2, 3, 3, FH.pants); a.r(tx + tw, legTop + 5, 4, 2, FH.boot);
            } else {
                const sp = f === 1 ? [tx - 1, tx + tw - 1] : f === 5 ? [tx + 1, tx + tw - 3] : atk ? [tx - 2, tx + tw] : [tx, tx + tw - 3];
                leg(sp[0], legTop, legH - 2, true); leg(sp[1], legTop, legH - 2, false);
            }
            // ORQA QO'L
            const backArm = () => a.s(tx - 2, tTop + 1, 2, th - 3, FH.tunic, -0.2);
            backArm();
            if (big && !guard) { a.e(tx - 2, tTop + 5, 4, 4.5, C.wood, 0.1); for (let k = 0; k < 14; k++) { const an = k / 14 * Math.PI * 2; a.p(tx - 2 + Math.cos(an) * 4, tTop + 5 + Math.sin(an) * 4.5, C.iron[2]); } a.p(tx - 2, tTop + 5, C.iron[3]); }
            // TANA: yashil kamzul, charm belbog', yelka tasmasi
            a.s(tx, tTop, tw, th, FH.tunic);
            a.r(tx, tTop + th - 2, tw, 2, FH.leath[1]); a.p(cx, tTop + th - 2, C.gold[2]);
            a.line(tx + 1, tTop, tx + tw - 2, tTop + th - 3, FH.leath[2]);
            if (big) { a.s(tx + 1, tTop + 1, tw - 2, 3, C.iron, 0.05); }
            // BOSH: yuz (qaragan tomonda ko'z), soch / kapishon / peshonabog' / dubulg'a
            a.s(hx, hTop, hw, hh, C.tan, 0.08);
            a.p(hx + hw - 2, hTop + 3, FH.eye); a.p(hx + hw - 1, hTop + 5, C.tan[0]);                     // ko'z, burun
            if (kind === 'spear') { a.s(hx - 1, hTop - 1, hw + 1, 3, FH.tunic, 0.05); a.s(hx - 1, hTop - 1, 3, hh + 1, FH.tunic, -0.05); a.p(hx - 2, hTop + 2, FH.tunic[0]); }   // yashil kapishon
            else if (kind === 'knives') { a.s(hx, hTop - 1, hw, 2, FH.hair); a.r(hx, hTop + 1, hw, 1, FH.band[2]); a.p(hx - 1, hTop + 2, FH.band[1]); a.p(hx - 2, hTop + 3, FH.band[0]); a.p(hx + 3, hTop + 4, 0xd88a7a); }   // peshonabog', chandiq
            else { a.s(hx - 1, hTop - 2, hw + 2, 3, C.iron, 0.1); a.r(hx + hw - 2, hTop + 1, 1, 3, C.iron[2]); a.s(hx + 1, hTop + hh - 2, hw - 1, 2, FH.hair); }   // dubulg'a (burun himoyasi), soqol
            // OLD QO'L va QUROL
            const fx = tx + tw, ay = tTop + 2, hand = C.tan[2];
            if (kind === 'spear') {
                if (atk) {   // NAYZA OTMOQDA: qo'l tepada-orqada, nayza gorizontal, uchi oldinga
                    a.r(fx - 3, ay - 4, 2, 5, FH.tunic[2]); a.p(fx - 3, ay - 5, hand);
                    a.r(fx - 10, ay - 6, 17, 1, C.wood[2]); a.r(fx + 7, ay - 7, 3, 3, FH.steel[2]); a.p(fx + 10, ay - 6, FH.steel[3]);
                } else {     // nayza tik, oldida
                    a.s(fx, ay, 2, 5, FH.tunic, 0.05); a.p(fx + 1, ay + 5, hand);
                    a.r(fx + 2, 1, 1, feet - 2, C.wood[2]); a.r(fx + 1, 0, 3, 3, FH.steel[2]); a.p(fx + 2, -0, FH.steel[3]);
                }
            } else if (kind === 'knives') {
                const knife = (x, y, dir) => { a.r(x, y, 4 * dir > 0 ? 4 : 4, 1, FH.steel[3]); a.p(dir > 0 ? x - 1 : x + 4, y, FH.leath[0]); };
                if (atk) {   // IKKALA PICHOQ OLDINGA + tilish izlari
                    a.r(fx, ay, 4, 2, FH.tunic[2]); a.p(fx + 4, ay, hand); knife(fx + 5, ay, 1);
                    a.r(fx - 1, ay + 3, 4, 2, FH.tunic[1]); a.p(fx + 3, ay + 3, hand); knife(fx + 4, ay + 3, 1);
                    for (let k = 0; k < 6; k++) { const an = -0.9 + k * 0.36; a.p(fx + 6 + Math.cos(an) * 6, ay + 2 + Math.sin(an) * 6, k % 2 ? 0xdde6ee : 0xa8b4c0); }
                } else {
                    a.s(fx, ay, 2, 5, FH.tunic, 0.05); a.p(fx + 1, ay + 5, hand); a.r(fx + 1, ay + 6, 1, 4, FH.steel[3]);
                    a.p(tx - 2, tTop + th - 2, hand); a.r(tx - 2, tTop + th - 1, 1, 4, FH.steel[2]);
                }
            } else {
                if (guard) {   // QALQON OLDINDA
                    a.s(fx, ay, 2, 4, FH.tunic); a.e(fx + 3, ay + 3, 3.4, 5, C.wood, 0.1);
                    for (let k = 0; k < 16; k++) { const an = k / 16 * Math.PI * 2; a.p(fx + 3 + Math.cos(an) * 3.4, ay + 3 + Math.sin(an) * 5, C.iron[2]); }
                    a.p(fx + 3, ay + 3, C.iron[3]);
                } else if (atk) {   // QILICH zarbasi
                    a.r(fx, ay, 4, 2, FH.tunic[2]); a.p(fx + 4, ay, hand); a.r(fx + 5, ay - 1, 1, 3, C.gold[2]);
                    a.s(fx + 6, ay, 9, 2, FH.steel, 0.1);
                    for (let k = 0; k < 7; k++) { const an = -1.1 + k * 0.36; a.p(fx + 8 + Math.cos(an) * 8, ay + 1 + Math.sin(an) * 8, k % 2 ? 0xdde6ee : 0xa8b4c0); }
                } else {
                    a.s(fx, ay, 2, 5, FH.tunic, 0.05); a.p(fx + 1, ay + 5, hand);
                    a.r(fx + 1, ay + 6, 1, 7, FH.steel[2]); a.r(fx, ay + 5, 3, 1, C.gold[2]);
                }
            }
        });
    }
    // TIRNOQLI KALTAKESAK: zaytun-yashil tangachalar, och sariq qorin, sariq ko'z (qora qorachiq), oq uzun tirnoqlar, uzun dum.
    // 0 / 1 - to'rt oyoqda emaklash, 2 - og'zi ochiq (til otmoqda), 3 - tik turgan, 4 - tik turib tirnamoqda
    const LZ = { sc: [0x1a3412, 0x2a521c, 0x3e7428, 0x5a9a36], belly: [0x9a8a4a, 0xc8b46a, 0xe8d890], claw: 0xf2f0e2, eye: 0xffd23a, mouth: 0x8a1e2a };
    function lizard(f) {
        return art(30, 24, (a) => {
            const claw = (x, y, dir) => { a.p(x, y, LZ.claw); a.p(x + dir, y + 1, LZ.claw); a.p(x + 2 * dir, y + 1, LZ.claw); };
            if (f <= 2) {
                // EMAKLASH: gavda gorizontal, bosh oldinda (o'ngda), dum orqada
                const st = f === 1 ? 1 : 0, gy = 23;
                for (let k = 0; k < 9; k++) a.r(k, gy - 4 - Math.round(k * 0.3), 1, 2, LZ.sc[1 + (k % 2)]);                // dum (ingichkalashadi)
                a.e(15, gy - 6, 8, 3.6, LZ.sc, 0.1); a.r(9, gy - 4, 13, 1, LZ.belly[1]);                                       // gavda, qorin
                for (let k = 9; k < 22; k += 3) a.p(k, gy - 9, LZ.sc[0]);                                                        // tikanli tizma
                const lg = (x, back) => { a.s(x, gy - 4, 2, 3, LZ.sc, back ? -0.15 : 0); claw(x + 1, gy - 1, 1); };
                lg(10 + st, true); lg(13 - st, false); lg(18 - st, true); lg(21 + st, false);
                // BOSH: uzun tumshuq, ko'z, jag'
                a.e(25, gy - 8, 4.2, 2.8, LZ.sc, 0.15); a.r(27, gy - 8, 3, 2, LZ.sc[3]);
                a.p(25, gy - 10, LZ.eye); a.p(26, gy - 10, 0x101010);
                if (f === 2) { a.r(25, gy - 6, 5, 2, LZ.mouth); a.p(29, gy - 7, LZ.claw); a.p(29, gy - 4, LZ.claw); a.r(24, gy - 5, 6, 1, LZ.mouth); }   // og'iz ochiq
                else a.r(25, gy - 7, 5, 1, LZ.sc[0]);
            } else {
                // TIK TURGAN: orqa oyoqlarda, dum yerga tiralgan, oldingi panjalar oldinda (uzun tirnoqlar)
                const gy = 23, sw = f === 4;
                for (let k = 0; k < 8; k++) a.r(3 + k, gy - 1 - Math.round(k * 0.5), 1, 2, LZ.sc[1 + (k % 2)]);            // dum
                a.s(11, gy - 5, 3, 5, LZ.sc, -0.12); a.s(15, gy - 5, 3, 5, LZ.sc); claw(11, gy - 1, -1); claw(17, gy - 1, 1);   // oyoqlar
                a.e(14, gy - 11, 4.4, 7, LZ.sc, 0.1); a.s(14, gy - 15, 3, 9, LZ.belly, 0.1);                                      // gavda, qorin
                for (let k = 0; k < 4; k++) a.p(10, gy - 15 + k * 3, LZ.sc[0]);                                                   // orqa tizma
                a.e(17, gy - 19, 4, 3, LZ.sc, 0.15); a.r(19, gy - 19, 3, 2, LZ.sc[3]); a.p(17, gy - 21, LZ.eye); a.p(18, gy - 21, 0x101010);   // bosh
                a.r(18, gy - 17, 4, 1, sw ? LZ.mouth : LZ.sc[0]);
                if (sw) {   // TIRNAMOQDA: panja oldinga-tepaga, uch tirnoq izi
                    a.line(16, gy - 13, 22, gy - 16, LZ.sc[2]); claw(22, gy - 17, 1); claw(22, gy - 15, 1);
                    for (let k = 0; k < 3; k++) a.line(24 + k, gy - 20 + k * 2, 28, gy - 14 + k * 2, k % 2 ? 0xdde6ee : 0xffffff);
                } else { a.line(16, gy - 12, 20, gy - 11, LZ.sc[2]); claw(20, gy - 12, 1); claw(20, gy - 10, 1); }
            }
        });
    }
    // BAHAYBAT DARAXT (boss): ko'zi yo'q, tanasida katta tishli og'iz; yo'g'on SHOXLAR barg to'dalarini ko'tarib turadi (orasidan ko'rinadi),
    // to'dalarda tikanli olmalar; pastda yerga yoyilgan egri ildizlar. 0 - jim, 1 - og'zi ochiq (olma otmoqda), 2 - g'azab (og'iz keng, ichi cho'g', shoxlar ko'tarilgan)
    const BT = { bark: [0x1a1008, 0x2a1a0c, 0x3e2814, 0x56381e, 0x6e4a28, 0x8a6036], leaf: [0x0c2010, 0x143418, 0x1e4a22, 0x2c6430, 0x3e803c, 0x5a9c4c], apple: [0x5a0a0e, 0x9a1a1e, 0xd03a32], tooth: 0xe8e0c8 };
    function bigTreeArt(f) {
        return art(84, 100, (a) => {
            const H = 100, cx = 42, up = f === 2 ? 4 : 0;
            // yumaloq bo'g'in (shox / ildiz): yorug'lik chap-yuqoridan
            const cap = (x0, y0, x1, y1, r0, r1, pal, l = 0) => {
                const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1, R = Math.max(r0, r1);
                for (let y = Math.floor(Math.min(y0, y1) - R); y <= Math.ceil(Math.max(y0, y1) + R); y++) for (let x = Math.floor(Math.min(x0, x1) - R); x <= Math.ceil(Math.max(x0, x1) + R); x++) {
                    const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / L2)), px = x - (x0 + dx * t), py = y - (y0 + dy * t), r = r0 + (r1 - r0) * t, d = Math.hypot(px, py);
                    if (d <= r) a.p(x, y, shade(0.9 + l - (px / r + 1) * 0.2 - (py / r + 1) * 0.22, x, y, pal));
                }
            };
            // ILDIZLAR: tanadan yerga egilib yoyiladi
            [[-1, 20, 3.4], [1, 22, 3.6], [-1, 34, 2.6], [1, 36, 2.6]].forEach(([d, len, r]) => { cap(cx + d * 10, H - 12, cx + d * (12 + len * 0.6), H - 5, r, r * 0.8, BT.bark); cap(cx + d * (12 + len * 0.6), H - 5, cx + d * (12 + len), H - 2, r * 0.8, 1, BT.bark); });
            // TANA: pastga kengayadi, po'stloq yoriqlari, chapda yorug' qirra
            for (let y = 40; y < H - 3; y++) {
                const k = (y - 40) / (H - 43), w = Math.round(12 + k * 7 + (k > 0.85 ? (k - 0.85) * 40 : 0)), x0 = cx - w;
                for (let x = x0; x < cx + w; x++) {
                    const u = (x - x0) / (2 * w), groove = (Math.round(x + Math.sin(y / 5) * 1.5) % 6 === 0), knot = A_hash(x >> 1, y >> 2) > 0.93;
                    a.p(x, y, groove || knot ? BT.bark[1] : u < 0.14 ? BT.bark[5] : shade(0.82 - u * 0.5 + A_hash(x, y) * 0.1, x, y, BT.bark));
                }
            }
            // SHOXLAR: tanadan chiqib to'dalarga boradi (yo'g'on -> ingichka), ikkinchi darajali novdalar
            const B = [[cx - 6, 44, 10, 24 - up, 4.2, 2.2], [cx + 6, 44, 74, 22 - up, 4.2, 2.2], [cx - 3, 42, 22, 9 - up, 3.4, 1.6], [cx + 3, 42, 62, 8 - up, 3.4, 1.6], [cx, 42, cx + 1, 2 - up, 3.2, 1.6]];
            B.forEach(([x0, y0, x1, y1, r0, r1]) => { cap(x0, y0, x1, y1, r0, r1, BT.bark, 0.05); const mx = (x0 + x1) / 2, my = (y0 + y1) / 2; cap(mx, my, mx + (x1 > x0 ? 6 : -6), my - 7, 1.4, 0.8, BT.bark); });
            // BARG TO'DALARI: shox uchlarida, orasidan shoxlar ko'rinadi; pastki qismi to'q, ust qismi yorug'
            const CL = [[10, 22, 11, 8], [74, 20, 11, 8], [22, 9, 12, 7], [62, 8, 12, 7], [42, 4, 13, 6], [30, 24, 8, 5], [55, 23, 8, 5]];
            CL.forEach(([x, y, rx, ry]) => {
                for (let yy = Math.floor(y - ry - up); yy <= y + ry - up; yy++) for (let xx = Math.floor(x - rx); xx <= x + rx; xx++) {
                    const dx = (xx - x) / rx, dy = (yy - y + up) / ry, d = dx * dx + dy * dy, edge = d > 0.78 && A_hash(xx, yy) > 0.55;
                    if (d > 1 || edge) continue;
                    const v = 0.95 - (dx + 1) * 0.16 - (dy + 1) * 0.26 + (A_hash(xx * 3, yy) > 0.8 ? 0.15 : 0);
                    a.p(xx, yy, shade(v, xx, yy, BT.leaf));
                }
            });
            [[12, 25], [21, 8], [44, 3], [63, 10], [73, 23], [31, 25], [56, 24], [6, 19], [50, 8]].forEach(([x, y]) => { a.e(x, y - up, 1.8, 1.8, BT.apple, 0.25); a.p(x - 2, y - up, 0xd8d0b0); a.p(x + 2, y - up, 0xd8d0b0); a.p(x, y - 3 - up, 0x2a541a); });
            // OG'IZ: ko'zsiz, faqat qiyshiq tishli og'iz (tananing pastroq qismida)
            const open = f === 0 ? 4 : f === 1 ? 8 : 11, my = 66, mw = f === 2 ? 14 : 11;
            for (let y = my - open; y <= my + open; y++) { const k = 1 - Math.abs(y - my) / (open + 1), w = Math.round(mw * Math.sqrt(k)); a.r(cx - w, y, w * 2, 1, f === 2 && Math.abs(y - my) < open * 0.5 ? (y % 2 ? 0xff6a1a : 0xc0300a) : 0x120806); }
            for (let x = cx - mw + 2; x < cx + mw - 1; x += 3) { const tl = 2 + (x % 2); a.r(x, my - open, 2, tl, BT.tooth); a.r(x + 1, my + open - tl + 1, 2, tl, BT.tooth); }
            a.line(cx - mw - 1, my - open - 1, cx + mw, my - open - 1, BT.bark[0]); a.line(cx - mw - 1, my + open + 1, cx + mw, my + open + 1, BT.bark[0]);
            a.line(cx - mw - 2, my - open + 1, cx - mw - 4, my - open - 2, BT.bark[1]); a.line(cx + mw + 1, my - open + 1, cx + mw + 3, my - open - 2, BT.bark[1]);   // og'iz chetidagi ajinlar
            if (f === 1) { a.e(cx, my, 3, 3, BT.apple, 0.2); a.p(cx - 1, my - 1, 0xffffff); }
        });
    }
    const A_hash = (x, y) => hash(x, y, 31);
    // ===== BOTQOQ (yangi): yovvoyi qul, qora kapishon, mimik to'nka =====
    // YOVVOYI QUL: bukchaygan, kulrang-yashil teri, yirtiq bel latta, bilaklarida uzilgan kishan-zanjir, to'zg'igan soch, ULKAN og'iz. 0 turish, 1 qadam, 2 tishlash (og'zi keng)
    function wildSlave(f) {
        return art(24, 27, (a) => {
            const SK = [0x3a4a3a, 0x566a52, 0x74886a, 0x96a888], step = f === 1 ? 1 : 0, bite = f === 2;
            limb(a, 9, 18, 8 - step, 24, 2, 1.8, SK, -0.1); limb(a, 13, 18, 14 + step, 24, 2, 1.8, SK);
            a.r(6 - step, 25, 4, 2, 0x2a2018); a.r(13 + step, 25, 4, 2, 0x2a2018);
            a.s(7, 16, 9, 4, C.leather, 0.05); a.p(8, 20, C.leather[1]); a.p(12, 20, C.leather[1]); a.p(15, 19, C.leather[1]);
            a.e(12, 13, 5.5, 5, SK, 0.05); a.p(10, 12, SK[0]); a.p(11, 14, SK[0]); a.p(13, 13, SK[0]);
            limb(a, 9, 11, 6, 17, 1.6, 1.4, SK, -0.2); a.r(5, 16, 3, 2, C.iron[1]); a.p(4, 18, C.iron[2]); a.p(4, 19, C.iron[1]); a.p(3, 20, C.iron[2]);
            const hx = bite ? 21 : 17, hy = bite ? 12 : 17;
            limb(a, 15, 11, hx, hy, 1.6, 1.4, SK); a.r(hx - 1, hy - 1, 3, 2, C.iron[2]); a.p(hx + 1, hy + 1, C.iron[1]); a.p(hx + 2, hy + 2, C.iron[2]);
            const X0 = 14, Y0 = 3 + (bite ? 1 : 0);
            a.e(X0 + 4, Y0 + 3, 4.5, 3.6, SK, 0.12);
            for (let k = 0; k < 7; k++) a.line(X0 - 1 + k, Y0, X0 - 2 + k, Y0 - 3 + (k % 2), 0x2a2218);
            a.p(X0 + 5, Y0 + 1, 0xffe14a); a.p(X0 + 6, Y0 + 1, 0x8a6a00);
            const open = bite ? 4 : 2;
            a.r(X0 + 1, Y0 + 4, 8, open + 1, 0x2a0a0a);
            for (let x = X0 + 1; x < X0 + 9; x += 2) { a.p(x, Y0 + 4, 0xf4efe2); a.p(x + 1, Y0 + 4 + open, 0xf4efe2); }
            a.r(X0 + 1, Y0 + 5 + open, 8, 1, SK[1]); a.r(X0 + 2, Y0 + 6 + open, 6, 1, SK[0]);
        });
    }
    // QORA KAPISHON: qop-qora yopinchiq, kapishon ichida faqat ikki SARIQ ko'z; sehrda qo'llarini ko'taradi - uchlaridan ildizlar. 0 turish, 1 qadam, 2 sehr
    function hoodRoot(f) {
        return art(20, 28, (a) => {
            const CL = [0x08080c, 0x13131a, 0x1e1e28, 0x2c2c3a], cast = f === 2, bob = f === 1 ? 1 : 0, RT = [0x3e2a18, 0x5d4037, 0x7a5a3a];
            a.roof(10, 7 + bob, 21 - bob, 6, 17, CL);
            for (let x = 2; x < 18; x += 3) a.r(x, 27, 1, 1, CL[2]);
            a.r(3, 26, 15, 1, 0x2a1e3a);
            a.e(10, 7 + bob, 5, 5, CL, 0.12); a.r(7, 6 + bob, 6, 4, 0x000000); a.p(9, 3 + bob, CL[3]); a.p(10, 2 + bob, CL[3]);
            a.p(8, 7 + bob, 0xffd23a); a.p(11, 7 + bob, 0xffd23a); a.p(8, 8 + bob, 0x8a6a00); a.p(11, 8 + bob, 0x8a6a00);
            if (cast) {
                limb(a, 6, 13, 2, 7, 1.4, 1.1, CL, 0.1); limb(a, 14, 13, 18, 7, 1.4, 1.1, CL, 0.1);
                [[2, 6, -1], [18, 6, 1]].forEach(([x, y, d]) => { a.line(x, y, x + d, y - 3, RT[1]); a.line(x, y, x - d, y - 4, RT[2]); a.p(x + d, y - 4, 0x9ccc65); a.p(x - d, y - 5, 0x9ccc65); });
                [[4, 0], [10, 1], [16, 0]].forEach(([x, o]) => { a.line(x, 27, x + o, 23, RT[1]); a.p(x + o, 22, 0x9ccc65); });
            } else { a.s(4, 12 + bob, 3, 8, CL, 0.05); a.s(13, 12 + bob, 3, 8, CL, 0.05); a.r(5, 19 + bob, 2, 1, CL[3]); a.r(13, 19 + bob, 2, 1, CL[3]); }
            a.line(6, 12 + bob, 6, 25, 0x2a1e3a); a.line(14, 12 + bob, 14, 25, 0x2a1e3a);
        });
    }
    // MIMIK TO'NKA: mox bosgan eski to'nka (tepasida yillik halqalar). Uyg'onganda: po'stlog'ida sariq ko'zlar, yog'och tishli og'iz, ildiz-oyoqlar, shox-qo'llar.
    // 0 - to'nka (yashiringan), 1/3 - yurish, 2 - hujum (og'zi keng, qo'llari oldinga)
    function stumpMimic(f) {
        return art(32, 28, (a) => {
            const awake = f > 0, lift = awake ? 3 : 0, step = f === 3 ? 1 : 0, atk = f === 2, RING = [0x6b4a2a, 0x8a6a40, 0xb08a58, 0xd8b880];
            if (awake) for (let k = 0; k < 3; k++) { const s = (k + step) % 2; a.line(9 + k * 2, 23, 4 + k * 2 - s, 27, C.bark[2]); a.line(22 - k * 2, 23, 27 - k * 2 + s, 27, C.bark[2]); }
            const y0 = 26 - lift;
            a.s(7, y0 - 16, 18, 16, C.bark, 0.05);
            for (let x = 9; x < 24; x += 3) a.r(x, y0 - 14, 1, 13, C.bark[0]);
            a.e(16, y0 - 16, 9, 2.6, RING, 0.15); a.e(16, y0 - 16, 5, 1.4, [0x8a6a40, 0xb08a58], 0.2); a.p(16, y0 - 16, RING[0]);
            [[8, y0 - 17], [10, y0 - 18], [21, y0 - 17], [23, y0 - 16], [12, y0 - 5], [8, y0 - 8]].forEach(([x, y]) => a.p(x, y, (x + y) % 2 ? 0x56843e : 0x7aa050));
            a.line(7, y0 - 2, 3, y0, C.bark[2]); a.line(24, y0 - 2, 29, y0, C.bark[2]); a.line(10, y0 - 1, 8, y0 + 1, C.bark[1]);
            if (awake) {
                a.r(10, y0 - 12, 3, 2, 0x1a0a00); a.p(11, y0 - 12, 0xffd23a); a.r(19, y0 - 12, 3, 2, 0x1a0a00); a.p(20, y0 - 12, 0xffd23a);
                const open = atk ? 4 : 2; a.r(10, y0 - 8, 12, open, 0x200a04);
                for (let x = 10; x < 22; x += 2) { a.p(x, y0 - 8, RING[3]); a.p(x + 1, y0 - 9 + open, RING[3]); }
                if (atk) { a.line(24, y0 - 10, 30, y0 - 13, C.bark[2]); a.line(30, y0 - 13, 31, y0 - 15, C.bark[3]); a.line(30, y0 - 13, 31, y0 - 11, C.bark[3]); }
                else { a.line(24, y0 - 9, 28, y0 - 6, C.bark[2]); a.p(29, y0 - 6, C.bark[3]); }
                a.line(7, y0 - 9, 3, y0 - 6, C.bark[2]); a.p(2, y0 - 6, C.bark[3]);
            }
        });
    }
    // ===== QOR BAZASI (yangi): qor bola, muz taran, kulba-mimik, Alter Qor Bobo, Robot Bigfut, Muz xokkeychi (+ darvoza) =====
    // yo'g'on bo'g'in (qo'l / oyoq): (x0,y0) dan (x1,y1) gacha, radius r0 -> r1, yorug'lik chap-yuqoridan
    function limb(a, x0, y0, x1, y1, r0, r1, pal, l = 0) {
        const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1, R = Math.max(r0, r1);
        for (let y = Math.floor(Math.min(y0, y1) - R); y <= Math.ceil(Math.max(y0, y1) + R); y++) for (let x = Math.floor(Math.min(x0, x1) - R); x <= Math.ceil(Math.max(x0, x1) + R); x++) {
            const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / L2)), px = x - (x0 + dx * t), py = y - (y0 + dy * t), r = r0 + (r1 - r0) * t, d = Math.hypot(px, py);
            if (d <= r) a.p(x, y, shade(0.9 + l - (px / r + 1) * 0.2 - (py / r + 1) * 0.22, x, y, pal));
        }
    }
    const SN = { snow: [0x9cc4e6, 0xc0dcf2, 0xe0eefa, 0xffffff], ice: [0x2a6a9a, 0x4a9ac8, 0x7ac4e6, 0xc0ecff], glow: 0x7ee8ff, coal: 0x1a1a24 };
    // QOR BOLA: qordan yasalgan bola - boshida muz tikanchalar, ko'k sharf, muz ko'zlar; qo'lida muzli qor to'pi. 0 turish, 1 qadam, 2 otish
    function snowKid(f) {
        return art(18, 22, (a) => {
            const bob = f === 1 ? 1 : 0, cx = 8;
            if (f === 1) { a.e(5, 20, 2.4, 1.8, SN.snow); a.e(11, 19.5, 2.4, 1.8, SN.snow); } else { a.e(6, 20, 2.6, 1.8, SN.snow); a.e(10.5, 20, 2.6, 1.8, SN.snow); }
            a.e(cx, 15, 5, 4.4, SN.snow, 0.05);
            a.r(cx - 4, 10 + bob, 9, 2, SN.ice[1]); a.r(cx - 4, 10 + bob, 9, 1, SN.ice[2]); a.r(cx + 2, 12 + bob, 2, 4, SN.ice[1]); a.p(cx + 2, 15 + bob, SN.ice[2]);
            a.p(cx, 14, SN.coal); a.p(cx, 16, SN.coal);
            a.e(cx, 6 + bob, 4.6, 4.2, SN.snow, 0.12);
            [[cx - 3, 2], [cx, 0], [cx + 3, 2]].forEach(([x, y]) => { a.p(x, y + bob, SN.ice[2]); a.p(x, y + 1 + bob, SN.ice[3]); });
            a.p(cx - 1, 6 + bob, SN.glow); a.p(cx + 2, 6 + bob, SN.glow);
            a.r(cx, 8 + bob, 3, 1, SN.coal);
            if (f === 2) { a.line(cx + 4, 12 + bob, cx + 7, 7, C.bark[2]); a.e(cx + 8, 5.5, 2.2, 2.2, SN.ice, 0.2); a.p(cx + 7, 5, 0xffffff); }
            else { a.line(cx + 4, 12 + bob, cx + 7, 14, C.bark[2]); a.e(cx + 8, 15, 1.8, 1.8, SN.ice, 0.2); }
            a.line(cx - 4, 12 + bob, cx - 7, 10 + bob, C.bark[2]);
        });
    }
    // MUZ TARAN: bukchaygan muz maxluq, orqasida kristallar, buralgan shoxlar; bir qo'li ULKAN (oldinda - gorilladek mushtiga tayanib yuradi), ikkinchisi kichkina,
    // oyoqlari kalta. 0 turish, 1 qadam, 2 musht (oldinga), 3 cho'kkan (sakrashga), 4 sakrash (musht tepada)
    const RAM = { ice: [0x1e4a72, 0x3a78a8, 0x62a8d4, 0x9cd4f0, 0xd8f4ff], horn: [0x6a6a7a, 0x9a9aaa, 0xcacad8, 0xf0f0fa], eye: 0x7ee8ff, dark: 0x0b2a44 };
    function iceRam(f) {
        return art(32, 30, (a) => {
            const crouch = f === 3, leap = f === 4, dy = crouch ? 3 : leap ? -2 : 0, step = f === 1 ? 1 : 0;
            if (!leap) { limb(a, 11, 22 + dy, 10 - step, 27, 2.2, 2, RAM.ice, -0.1); limb(a, 16, 22 + dy, 17 + step, 27, 2.2, 2, RAM.ice); a.r(8 - step, 28, 4, 1, RAM.ice[0]); a.r(16 + step, 28, 4, 1, RAM.ice[1]); }
            else { limb(a, 11, 21, 8, 25, 2.2, 2, RAM.ice, -0.1); limb(a, 16, 21, 14, 26, 2.2, 2, RAM.ice); }
            limb(a, 10, 15 + dy, 7, 21 + dy, 1.6, 1.2, RAM.ice, -0.2); a.p(6, 22 + dy, RAM.ice[4]); a.p(8, 22 + dy, RAM.ice[4]);   // kichkina qo'l
            a.e(14, 15 + dy, 8.5, 7.5, RAM.ice, 0.05);
            a.e(15, 18 + dy, 4.5, 3, [RAM.ice[2], RAM.ice[3], RAM.ice[4]], 0.1);
            [[7, 9], [10, 7], [13, 6], [16, 7]].forEach(([x, y], i) => a.roof(x, y + dy - 4, 5 + (i % 2), 1, 3, [RAM.ice[3], RAM.ice[4], 0xffffff]));
            const hx = 22, hy = 10 + dy;
            a.e(hx, hy, 4.2, 3.6, RAM.ice, 0.15);
            limb(a, hx - 2, hy - 3, hx - 5, hy - 5, 1.6, 1.2, RAM.horn); limb(a, hx - 5, hy - 5, hx - 6, hy - 1, 1.2, 1, RAM.horn); a.p(hx - 5, hy, RAM.horn[3]);
            a.r(hx + 1, hy - 1, 2, 1, RAM.eye); a.p(hx + 3, hy - 1, 0xffffff);
            a.r(hx + 1, hy + 2, 3, 1, RAM.dark);
            // ULKAN QO'L: yelkadan tirsakka, tirsakdan mushtga
            const sx = 20, sy = 14 + dy;
            const [fx, fy] = f === 2 ? [28, 15] : leap ? [22, 3] : crouch ? [25, 25] : [25 + step * 2, 25 - step * 2];
            const ex = (sx + fx) / 2 + (f === 2 ? 0 : 2), ey = (sy + fy) / 2 - (f === 2 ? 2 : 0);
            limb(a, sx, sy, ex, ey, 4, 3.4, RAM.ice, 0.08); limb(a, ex, ey, fx, fy, 3.4, 3, RAM.ice, 0.12);
            a.e(fx, fy, 4.2, 3.8, RAM.ice, 0.2);
            for (let k = -1; k <= 1; k++) a.p(fx + (f === 2 ? 3 : k * 2), fy + (f === 2 ? k * 2 : -3), RAM.ice[4]);
            a.roof(sx - 1, sy - 7, 4, 1, 3, [RAM.ice[3], RAM.ice[4], 0xffffff]);
        });
    }
    // KULBA-MIMIK (ikki o'yinchi bo'yi): qor bosgan yog'och kulba (tomidan muzlar osilgan, derazada chiroq). Uyg'onganda: derazalar - qizil ko'z,
    // eshik - muz tishli og'iz, tagidan qisqichbaqa oyoqlari, yonlaridan ULKAN MUZ QISQICHLAR (qisqichbaqa qisqichidek). 0 - kulba, 1/3 - yurish, 2 - qisqichlar ochilib ko'tarilgan
    const HUT = { snow: [0xb8d8f0, 0xd8ecfa, 0xf0f8ff, 0xffffff], ice: [0x1e5a86, 0x3a86b8, 0x7ac4e6, 0xc0ecff, 0xeefbff], eye: 0xff4a3a, leg: [0x2a4a6a, 0x4a7aa0, 0x8ab4d0] };
    // MUZ QISQICH (qisqichbaqanikidek): yelka (sx,sy) -> tirsak -> yo'g'on kaft (px,py); kaftdan ikki egri barmoq - ustki (qimirlaydigan) va pastki,
    // uchlari bir-biriga qaragan; d - yo'nalish, open - ochiqligi (0..1), k - kattaligi
    function iceClaw(a, sx, sy, px, py, d, open, k) {
        const ex = (sx + px) / 2 + d, ey = Math.max(sy, py) + 3;
        limb(a, sx, sy, ex, ey, 1.8 * k, 1.6 * k, HUT.leg); limb(a, ex, ey, px - d * 4 * k, py + 1, 1.7 * k, 2.2 * k, HUT.ice, -0.05);
        a.p(ex, ey - 1, HUT.ice[3]);
        const g = open * 3.2 * k;   // barmoqlar orasidagi ochiqlik
        const finger = (sg, r0) => {   // sg: -1 ustki, +1 pastki
            const b = [px + d * 3.5 * k, py + sg * 2 * k], m = [px + d * 8 * k, py + sg * (3 * k + g)], t = [px + d * 11.5 * k, py + sg * (0.6 * k + g * 0.35)];
            limb(a, b[0], b[1], m[0], m[1], r0 * k, r0 * 0.8 * k, HUT.ice, sg < 0 ? 0.12 : -0.02); limb(a, m[0], m[1], t[0], t[1], r0 * 0.8 * k, 0.5, HUT.ice, sg < 0 ? 0.15 : 0);
            for (let q = 0.3; q < 1; q += 0.35) a.p(m[0] + (t[0] - m[0]) * q - d * 0.5, m[1] + (t[1] - m[1]) * q - sg * (r0 * 0.6 * k), HUT.ice[4]);   // ichki muz tishchalar
            a.p(t[0], t[1], 0xffffff);
        };
        finger(-1, 2.2); finger(1, 1.9);
        a.e(px, py, 5.4 * k, 4.4 * k, HUT.ice, 0.14);   // yo'g'on kaft
        a.p(px - d * 2 * k, py - 2 * k, 0xffffff); a.p(px - d * k, py - 3 * k, HUT.ice[4]); a.p(px + d * 2 * k, py + 2 * k, HUT.ice[0]);
    }
    function hutMimic(f) {
        return art(60, 36, (a) => {
            const awake = f > 0, lift = awake ? 4 : 0, step = f === 3 ? 1 : 0, cx = 30, atk = f === 2;
            if (awake) for (let k = 0; k < 3; k++) {
                const s = (k + step) % 2;
                [[-1, cx - 6 + k * 2], [1, cx + 6 - k * 2]].forEach(([d, x0]) => { const kx = x0 + d * (6 + k), ky = 28 - s * 2; limb(a, x0, 30, kx, ky, 1, 1, HUT.leg); limb(a, kx, ky, kx + d * 3, 35, 1, 0.7, HUT.leg, -0.1); a.p(kx + d * 3, 35, HUT.ice[3]); });
            }
            const y0 = 32 - lift;
            a.s(cx - 10, y0 - 14, 20, 14, C.wood); for (let y = y0 - 13; y < y0; y += 3) a.r(cx - 10, y, 20, 1, C.wood[0]);
            a.roof(cx, y0 - 26, 12, 6, 32, HUT.snow);
            for (let x = cx - 14; x < cx + 15; x += 3) a.r(x, y0 - 14, 1, 1 + ((x * 7) % 3), HUT.ice[2]);
            a.e(cx, y0 - 26, 4, 1.6, HUT.snow, 0.2);
            [cx - 8, cx + 4].forEach(x => { a.r(x, y0 - 11, 4, 3, awake ? 0x1a0606 : GLOW); a.r(x + 1, y0 - 10, 2, 1, awake ? HUT.eye : GLOW2); });
            if (awake) { const op = atk ? 3 : 1; a.r(cx - 3, y0 - 9 - op, 7, 9 + op, 0x140406); for (let x = cx - 3; x < cx + 4; x += 2) { a.p(x, y0 - 9 - op, HUT.ice[3]); a.p(x + 1, y0 - 1, HUT.ice[3]); } }
            else { a.s(cx - 3, y0 - 9, 7, 9, C.wood, -0.2); a.p(cx + 2, y0 - 5, C.gold[3]); }
            a.r(cx - 11, y0, 22, 2, HUT.snow[2]);
            if (awake) {
                iceClaw(a, cx - 9, y0 - 6, cx - 16, atk ? y0 - 20 : y0 - 10, -1, atk ? 1 : 0.15, 0.95);   // orqa
                iceClaw(a, cx + 9, y0 - 6, cx + 16, atk ? y0 - 20 : y0 - 10, 1, atk ? 1 : 0.15, 1.1);      // old - kattarog'i
            }
        });
    }
    // ALTER QOR BOBO (ikki o'yinchi bo'yi): qizil to'n, oq mo'yna, katta qorin, yelkasida xalta; yuzi - TEMIR (robot): qizil chiroq ko'zlar,
    // soqoli ostida og'iz-panjara, qalpog'ida antenna. 0 turish, 1 qor to'pini itarish, 2 xaltadan otish, 3 charchagan (bug'), 4 chanadan tushish
    const SAN = { suit: [0x5a0a10, 0x8e1418, 0xc0262a, 0xe85a50], fur: [0xb6bcc6, 0xdde1e7, 0xf4f6fa, 0xffffff], metal: [0x2c3138, 0x4a535d, 0x76818c, 0xb9c3cc], eye: 0xff2a2a, belt: 0x16121a,
        bag: [0x3a2414, 0x5b3a26, 0x7d5636, 0xa27a50] };
    function santaArt(f) {
        return art(32, 34, (a) => {
            const cx = 15, tired = f === 3, fall = f === 4, push = f === 1, bag = f === 2, sink = tired ? 2 : push ? 1 : 0;
            a.s(cx - 6, 27, 5, 5, SAN.suit, -0.1); a.s(cx + 1, 27, 5, 5, SAN.suit); a.r(cx - 7, 31, 7, 3, SAN.belt); a.r(cx + 1, 31, 7, 3, SAN.belt); a.r(cx - 7, 31, 2, 1, 0x3a3440);
            if (bag) { a.e(cx - 7, 9, 7, 6, SAN.bag, 0.1); a.r(cx - 3, 12, 3, 2, C.gold[2]); a.p(cx - 9, 6, C.red[2]); a.p(cx - 5, 5, C.green[3]); }
            else a.e(cx - 9, 21 - sink, 5, 6, SAN.bag, -0.05);
            a.e(cx, 20 + sink, 9, 8, SAN.suit, 0.05);
            a.r(cx - 1, 12 + sink, 3, 16, SAN.fur[2]);
            a.r(cx - 9, 22 + sink, 19, 3, SAN.belt); a.s(cx - 2, 21 + sink, 5, 5, C.gold, 0.1); a.r(cx - 1, 22 + sink, 3, 3, SAN.belt);
            a.r(cx - 8, 27, 17, 1, SAN.fur[1]);
            const hand = (x, y) => a.e(x, y, 2, 2, SAN.metal, 0.1);   // temir qo'l
            if (fall) { limb(a, cx - 7, 14, cx - 11, 6, 2, 1.8, SAN.suit, -0.1); limb(a, cx + 7, 14, cx + 11, 6, 2, 1.8, SAN.suit); hand(cx - 11, 5); hand(cx + 11, 5); }
            else if (push) { limb(a, cx - 6, 15 + sink, cx + 8, 21 + sink, 2, 1.8, SAN.suit, -0.15); limb(a, cx + 6, 15 + sink, cx + 13, 19 + sink, 2.2, 2, SAN.suit); hand(cx + 14, 19 + sink); }
            else if (bag) { limb(a, cx - 4, 14, cx - 6, 8, 2, 1.8, SAN.suit, -0.1); limb(a, cx + 6, 15, cx + 13, 10, 2.2, 2, SAN.suit); hand(cx + 14, 9); }
            else if (tired) { limb(a, cx + 6, 16 + sink, cx + 9, 24 + sink, 2, 1.8, SAN.suit); hand(cx + 9, 25 + sink); limb(a, cx - 6, 16 + sink, cx - 9, 24 + sink, 2, 1.8, SAN.suit, -0.15); hand(cx - 9, 25 + sink); }
            else { limb(a, cx + 7, 15, cx + 10, 22, 2.2, 2, SAN.suit); hand(cx + 10, 23); limb(a, cx - 7, 15, cx - 10, 22, 2, 1.8, SAN.suit, -0.15); hand(cx - 10, 23); }
            const hy = 5 + sink;
            a.s(cx - 5, hy + 3, 11, 8, SAN.metal, 0.1);
            a.r(cx - 5, hy + 5, 11, 1, SAN.metal[0]); a.p(cx - 4, hy + 4, SAN.metal[3]); a.p(cx + 4, hy + 9, SAN.metal[0]);
            const eyeOn = tired ? 0x5a1010 : SAN.eye;
            a.r(cx - 3, hy + 6, 2, 2, eyeOn); a.r(cx + 2, hy + 6, 2, 2, eyeOn); if (!tired) { a.p(cx - 3, hy + 6, 0xffb0a0); a.p(cx + 2, hy + 6, 0xffb0a0); }
            a.e(cx + 0.5, hy + 13, 7, 5, SAN.fur, 0.1);
            a.r(cx - 3, hy + 10, 7, 2, SAN.fur[3]);
            a.r(cx - 1, hy + 11, 3, 1, push || bag ? 0x14080a : SAN.metal[1]);
            a.r(cx - 6, hy + 2, 13, 2, SAN.fur[2]);
            a.roof(cx + 1, hy - 4, 6, 4, 11, SAN.suit); a.line(cx + 3, hy - 4, cx + 7, hy - 1, SAN.suit[2]); a.e(cx + 8, hy - 1, 1.6, 1.6, SAN.fur, 0.2);
            a.line(cx - 3, hy - 1, cx - 5, hy - 4, SAN.metal[2]); a.p(cx - 5, hy - 5, SAN.eye);
            if (tired) { a.p(cx + 5, hy + 1, 0xd8e0ea); a.p(cx + 7, hy - 1, 0xd8e0ea); }
        });
    }
    // ROBOT BIGFUT (chizilgan sxema bo'yicha, yon tomondan, o'ngga qaragan): chapda - tik turgan orqa qo'l, baland tana, ko'krak-yelka bo'lagi o'ngga, tepada o'ngda
    // KATTA BOSH (ko'zlarini sochi yopgan, og'zi ko'rinadi - temir tishlar), pastda oldingi qo'li yerda gorizontal yotibdi, mushti tugilgan (temir bo'g'imlar).
    // Ko'kragida temir plita va cho'g' yadro, boshida bolt-antenna, tagida qor uyumi (beli orol ortida).
    // Yuz (server tanasi) - ustunlar 76..104, qatorlar 25..46 (P=3: yuz o'rtasi rasm o'rtasidan 112 px o'ngda, yuz osti yerdan 171 px balandda).
    // 0 turish, 1 muz tupurish, 2 qor otish (oldingi qo'l ko'tarilgan), 3 musht cho'zilgan (oldingi qo'l yo'q - klient chizadi)
    const BF = { fur: [0x6a7484, 0x9aa4b4, 0xc4ccd8, 0xe6ebf2, 0xffffff], metal: [0x22262e, 0x3a414c, 0x5e6876, 0x8e9aa8, 0xc8d2dc], skin: [0x2a2e3a, 0x40465a, 0x5a6278, 0x767e94], glow: 0xff3a2a };
    function furBlob(a, cx, cy, rx, ry, l = 0) {
        for (let y = Math.floor(cy - ry - 2); y <= Math.ceil(cy + ry + 2); y++) for (let x = Math.floor(cx - rx - 2); x <= Math.ceil(cx + rx + 2); x++) {
            const dx = (x - cx) / rx, dy = (y - cy) / ry, d = dx * dx + dy * dy;
            if (d > 1 + A_hash(x >> 1, y >> 1) * 0.28) continue;
            const strand = (x * 3 + Math.round(y * 0.6)) % 7 === 0 ? -0.14 : 0;
            a.p(x, y, shade(0.92 + l - (dx + 1) * 0.16 - (dy + 1) * 0.22 + strand, x, y, BF.fur));
        }
    }
    function bfFist(a, x, y, l = 0) {   // tugilgan musht: jun, oldida temir bo'g'im plitalari
        furBlob(a, x, y, 11, 8, l);
        for (let k = 0; k < 4; k++) { a.s(x - 9 + k * 5, y + 2, 4, 4, BF.metal, -0.4); a.r(x - 9 + k * 5, y + 2, 4, 1, BF.metal[3]); a.p(x - 8 + k * 5, y + 3, BF.metal[4]); }
    }
    function bfFistR(a, x, y, l = 0) {   // o'ngga qaragan tugilgan musht: jun, oldida (o'ngda) temir bo'g'im plitalari
        furBlob(a, x, y, 9, 9, l);
        for (let k = 0; k < 4; k++) { a.s(x + 5, y - 8 + k * 4, 4, 4, BF.metal, -0.4); a.r(x + 5, y - 8 + k * 4, 1, 4, BF.metal[3]); a.p(x + 6, y - 7 + k * 4, BF.metal[4]); }
    }
    // junli qo'l: (x0,y0) -> (x1,y1) bo'ylab ketma-ket junli bo'laklar
    function furLimb(a, x0, y0, x1, y1, r0, r1, l = 0) {
        const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 3));
        for (let i = 0; i <= n; i++) { const q = i / n, r = r0 + (r1 - r0) * q; furBlob(a, x0 + (x1 - x0) * q, y0 + (y1 - y0) * q, r, r * 0.92, l); }
    }
    function bigfootArt(f) {
        return art(106, 112, (a) => {
            // orqa qo'l (tik, chapda; to'qroq), mushti pastda
            furLimb(a, 14, 24, 8, 72, 7, 6, -0.22); bfFist(a, 9, 80, -0.25);
            // tana (baland) va ko'krak-yelka bo'lagi (o'ngga, boshga tutashadi)
            furBlob(a, 30, 64, 21, 48, -0.06);
            furBlob(a, 48, 36, 30, 20, 0);
            a.s(30, 60, 18, 16, BF.metal, 0.05); [[31, 61], [46, 61], [31, 74], [46, 74]].forEach(([x, y]) => a.p(x, y, BF.metal[4]));
            a.e(39, 68, 4.5, 4.5, [0x5a0a06, 0xc0260e, BF.glow, 0xffb07a], 0.3); a.r(30, 67, 4, 1, BF.metal[0]); a.r(44, 67, 4, 1, BF.metal[0]);
            a.r(22, 22, 8, 2, BF.metal[2]); a.r(52, 18, 8, 2, BF.metal[2]);   // yelka choklari
            // BOSH: katta, o'ngda; orqasida temir quloq-plita, tepasida bolt-antenna
            furBlob(a, 84, 33, 21, 30, 0.06);
            a.s(66, 28, 4, 10, BF.metal, 0.05);
            a.r(83, 0, 3, 6, BF.metal[2]); a.r(82, 0, 5, 2, BF.metal[3]); a.p(84, 0, BF.glow);
            // YUZ (o'ng tomonda): to'q teri, burun, og'iz (temir tishlar; tupurganda keng ochiq, ichida muz nuri)
            a.e(91, 36, 13, 11, BF.skin, 0.05);
            a.r(98, 33, 4, 3, BF.skin[0]); a.p(101, 34, 0x000000);
            const open = f === 1 ? 4 : 0, my0 = 40 - Math.floor(open / 2), mh = 5 + open;
            a.r(82, my0, 20, mh, 0x140608);
            if (open) for (let y = my0 + 2; y < my0 + mh - 1; y++) a.r(85, y, 15, 1, y % 2 ? 0x7ee8ff : 0xc0ecff);
            for (let x = 82; x < 102; x += 3) { a.r(x, my0, 2, 2, BF.metal[3]); a.r(x + 1, my0 + mh - 2, 2, 2, BF.metal[3]); }
            // SOCH: peshonadan ko'zlarni yopib osilib turadi
            for (let x = 72; x <= 104; x++) {
                const len = 11 + Math.round(3 * Math.sin(x * 0.9) + A_hash(x, 3) * 3) - Math.round(Math.abs(x - 90) * 0.15);
                for (let y = 14; y < 16 + len; y++) a.p(x, y, shade(0.82 - (y - 14) / 30 + ((x + y) % 5 === 0 ? -0.12 : 0), x, y, BF.fur));
            }
            // OLDINGI QO'L: 0/1 - yerda gorizontal yotibdi (mushti o'ngda); 2 - ko'tarilgan, qor bilan; 3 - yo'q (cho'zilgan)
            if (f === 2) { furLimb(a, 58, 50, 90, 68, 7, 6, 0.06); bfFistR(a, 96, 64, 0.1); a.e(97, 54, 8, 7, SN.snow, 0.15); }
            else if (f !== 3) { furLimb(a, 18, 96, 76, 96, 7, 7, 0.06); bfFistR(a, 84, 96, 0.08); }   // tana pastidan oldinga yotgan qo'l (sxemadagidek)
            else furBlob(a, 58, 50, 9, 8, 0.04);   // yelka (qo'l cho'zilgan)
            // tagidagi qor uyumi (beli shu yerdan ko'rinmaydi)
            [[12, 109, 14, 4], [38, 110, 16, 4], [62, 109, 16, 4], [90, 110, 16, 4]].forEach(([x, y, rx, ry]) => a.e(x, y, rx, ry, SN.snow, 0.1));
        });
    }
    // MUZ XOKKEYCHI (ikki o'yinchi bo'yi): dubulg'a va yuz to'ri (ostidan muz-ko'k yuz, yonib turgan ko'zlar), keng yelka himoyasi, ko'k futbolka,
    // qora shim, konki; qo'lida klyushka. 0/1 - sirpanish, 2 - klyushka ko'tarilgan, 3 - urilgan (oldinga-pastga), 4 - engashib shayba tashlash
    const HK = { jers: [0x0d2a5a, 0x1a4a8a, 0x3a7ac8, 0x7ab4f0], white: [0xb6bcc6, 0xdde1e7, 0xffffff], pants: [0x0a0a14, 0x1a1a28, 0x2a2a3e], skin: [0x2a6a9a, 0x5ab0d8, 0x9ad8f0],
        helm: [0x0a1a2a, 0x1a3a5a, 0x3a6a9a, 0x7ab4dc], stick: [0x3a2414, 0x7d5636, 0xa27a50], tape: 0xf0f0f0, blade: 0xe8fbff, eye: 0x7ee8ff };
    function hockeyArt(f) {
        return art(30, 34, (a) => {
            const cx = 13, wind = f === 2, slap = f === 3, drop = f === 4, lean = f === 1 ? 1 : 0, bend = drop || slap ? 2 : 0;
            (f === 1 ? [[cx - 5, 2], [cx + 2, -1]] : [[cx - 4, 0], [cx + 1, 0]]).forEach(([x, o], i) => {
                a.s(x, 23 + bend, 4, 7 - bend, HK.pants, i ? 0 : -0.1); a.s(x - 1, 30, 6, 2, HK.helm); a.r(x - 2 + o, 32, 8, 1, HK.blade); a.p(x + o + 6, 31, HK.blade);
            });
            a.s(cx - 6, 19 + bend, 13, 6, HK.pants, 0.05);
            a.s(cx - 7 + lean, 9 + bend, 15, 11, HK.jers, 0.08);
            a.r(cx - 7 + lean, 15 + bend, 15, 2, HK.white[1]);
            a.r(cx - 1 + lean, 11 + bend, 3, 1, HK.white[2]); a.r(cx + 1 + lean, 12 + bend, 1, 3, HK.white[2]);   // raqam
            a.e(cx - 6 + lean, 10 + bend, 3, 2.4, HK.jers, 0.15); a.e(cx + 7 + lean, 10 + bend, 3, 2.4, HK.jers, 0.15);
            const hx = cx + lean, hy = 2 + bend;
            a.s(hx - 4, hy, 9, 8, HK.helm, 0.1); a.r(hx - 4, hy, 9, 1, HK.helm[3]);
            a.s(hx - 2, hy + 3, 7, 5, HK.skin, 0.05);
            a.p(hx, hy + 4, HK.eye); a.p(hx + 3, hy + 4, HK.eye);
            for (let y = hy + 3; y < hy + 8; y += 2) a.r(hx - 2, y, 7, 1, HK.white[0]);
            for (let x = hx - 1; x < hx + 5; x += 2) a.r(x, hy + 3, 1, 5, HK.white[0]);
            const glove = (x, y) => { a.s(x - 1, y - 1, 3, 3, HK.jers, 0.1); a.p(x, y, HK.white[2]); };
            let g1, g2, bx, by;
            if (wind) { g1 = [hx - 3, 6 + bend]; g2 = [hx - 6, 4 + bend]; bx = 0; by = 0; }
            else if (slap) { g1 = [hx + 5, 17 + bend]; g2 = [hx + 8, 19 + bend]; bx = 25; by = 32; }
            else if (drop) { g1 = [hx + 4, 17 + bend]; g2 = [hx + 6, 20 + bend]; bx = 22; by = 32; }
            else { g1 = [hx + 4, 15]; g2 = [hx + 6, 18]; bx = 21 + lean; by = 32; }
            a.line(cx - 6 + lean, 12 + bend, g2[0], g2[1], HK.jers[1]); a.line(cx + 6 + lean, 12 + bend, g1[0], g1[1], HK.jers[2]);
            a.line(g2[0], g2[1], bx, by, HK.stick[1]); a.line(g2[0] + 1, g2[1], bx + 1, by, HK.stick[2]);
            if (by === 32) { a.r(bx, by - 1, 5, 2, HK.stick[1]); a.r(bx + 1, by - 1, 3, 1, HK.tape); }
            else { a.r(bx, by, 2, 4, HK.stick[1]); a.p(bx, by + 1, HK.tape); }
            glove(g1[0], g1[1]); glove(g2[0], g2[1]);
        });
    }
    // SKYLAND DRONI (o'ngga qaragan): yumaloq metall bosh (belbog'i, oldida qizil oyna), tanasi yo'q, ikki uzun egilgan sim oyoq.
    // Kadrlar: 0 turish, 1/2 yurish, 3 mo'ljal (oyna yonadi), 4 lazer (oyna oq-qizil chaqnaydi)
    function droneArt(f) {
        return art(30, 33, (a) => {
            const MET = [0x23292f, 0x46515d, 0x7b8896, 0xc9d3dc], RED = [0x4a0008, 0xa0101c, 0xff1a2e, 0xffa0a8], WIRE = 0x1a1f25, WHI = 0x5d6875;
            const bob = f === 1 || f === 2 ? 1 : 0, hx = 15, hy = 10 + bob;
            // oyoqlar: boshidan pastga tushib, uchlari tashqariga egiladi (yurganda qadam)
            const L = [[[12, 17], [10, 23], [7, 29], [3, 32]], [[18, 17], [20, 23], [23, 29], [27, 32]]];
            if (f === 1) { L[0] = [[12, 17], [9, 23], [5, 28], [1, 30]]; L[1] = [[18, 17], [19, 24], [20, 29], [23, 32]]; }
            if (f === 2) { L[0] = [[12, 17], [11, 24], [9, 29], [6, 32]]; L[1] = [[18, 17], [21, 23], [25, 28], [29, 30]]; }
            L.forEach((pts) => {
                for (let i = 0; i < pts.length - 1; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[i + 1]; a.line(x0, y0 + bob, x1, y1 + (i < 2 ? bob : 0), WIRE); a.line(x0 + 1, y0 + bob, x1 + 1, y1 + (i < 2 ? bob : 0), WHI); }
                const [fx, fy] = pts[pts.length - 1]; a.r(fx - 1, fy, 4, 1, MET[0]);
            });
            a.r(11, 16 + bob, 9, 3, MET[1]); a.r(12, 18 + bob, 7, 1, MET[0]);   // oyoq bo'g'imi
            // bosh: shar, belbog', tepasida bolt
            a.e(hx, hy, 9, 9, MET, 0.1);
            a.r(hx - 9, hy + 1, 18, 2, MET[0]); a.r(hx - 8, hy, 16, 1, MET[2]);
            a.r(hx - 1, hy - 10, 3, 2, MET[1]); a.p(hx, hy - 11, MET[3]);
            a.p(hx - 5, hy - 5, MET[3]); a.p(hx - 4, hy - 6, MET[3]);
            // qizil oyna (old tomonda)
            const lit = f === 3 || f === 4;
            a.r(hx + 2, hy - 4, 8, 6, MET[0]);
            a.r(hx + 3, hy - 3, 6, 4, lit ? RED[2] : RED[1]); a.r(hx + 3, hy - 3, 6, 1, lit ? RED[3] : RED[2]);
            if (f === 3) { a.p(hx + 10, hy - 2, RED[2]); a.p(hx + 10, hy, RED[2]); }
            if (f === 4) { a.r(hx + 4, hy - 2, 4, 2, 0xffffff); a.r(hx + 10, hy - 2, 3, 2, RED[3]); a.p(hx + 13, hy - 1, 0xffffff); a.p(hx + 11, hy - 4, RED[2]); a.p(hx + 11, hy + 1, RED[2]); }
        });
    }
    // SKYLAND STRAJ BOTI (o'ngga qaragan): ko'k bosh, sariq ko'zlar, malla (mis rang) panjarali tana, ingichka oyoqlar,
    // chap qo'lida yumaloq qalqon, o'ngida egri qilich. Kadrlar: 0 turish, 1/2 yurish, 3 qilich ko'tarilgan, 4 zarba, 5 qalqon oldinda
    function guardbotArt(f) {
        return art(36, 33, (a) => {
            const BLU = [0x0d2a5c, 0x1f4fa0, 0x3b82e0, 0x9cc8ff], COP = [0x4f2810, 0x8f4a20, 0xc8733a, 0xeaa26a], MET = [0x23292f, 0x46515d, 0x7b8896, 0xc9d3dc], YEL = 0xffd23f, BLADE = [0x8a96a3, 0xdfe7ee];
            const block = f === 5;
            // oyoqlar (ingichka)
            const st = f === 1 ? 2 : f === 2 ? -2 : 0;
            [[15 - st, 0], [20 + st, 1]].forEach(([x, i]) => { a.line(i ? 20 : 15, 22, x, 31, MET[1]); a.line(i ? 21 : 16, 22, x + 1, 31, MET[2]); a.r(x - 1, 31, 4, 2, MET[0]); });
            // qalqon - orqada (chap qo'l)
            const shield = (cx, cy, r) => { a.e(cx, cy, r, r, MET, 0.1); a.e(cx, cy, r - 2, r - 2, BLU, 0.1); a.line(cx - 2, cy + 2, cx, cy - 3, BLU[3]); a.line(cx, cy - 3, cx + 2, cy + 2, BLU[3]); a.p(cx, cy, MET[3]); };
            if (!block) { a.line(14, 13, 10, 16, MET[1]); shield(9, 17, 7); }
            // tana: malla, panjarali
            a.s(13, 11, 11, 11, COP, 0.1);
            for (let x = 15; x < 24; x += 3) a.line(x, 12, x, 21, COP[0]);
            for (let y = 13; y < 22; y += 3) a.line(13, y, 23, y, COP[0]);
            a.r(13, 11, 11, 1, COP[3]); a.r(16, 21, 5, 2, MET[1]);   // yelka chizig'i, bel
            // bosh: ko'k, sariq tik ko'zlar (old tomonda)
            a.r(17, 9, 3, 2, MET[1]);
            a.s(13, 1, 10, 9, BLU, 0.1); a.r(14, 1, 8, 1, BLU[3]);
            a.r(18, 3, 1, 4, YEL); a.r(21, 3, 1, 4, YEL);
            // qilich qo'li va HOLOGRAMMA LAZER QILICH rukoyati (nur chiqaruvchi) - tig'ning o'zi klientda chiziladi (nurlanadi, lipillaydi)
            const hilt = (x, y) => { a.r(x - 1, y - 1, 3, 3, MET[0]); a.r(x - 1, y - 1, 3, 1, MET[2]); a.p(x, y, NEON); };
            if (f === 3) { a.line(23, 12, 25, 7, MET[1]); hilt(25, 6); }
            else if (f === 4) { a.line(23, 13, 29, 16, MET[1]); hilt(30, 16); }
            else if (block) { a.line(14, 13, 12, 18, MET[1]); hilt(11, 20); }
            else { a.line(23, 13, 26, 17, MET[1]); hilt(27, 18); }
            if (block) { a.line(22, 13, 25, 15, MET[1]); shield(26, 15, 8); }   // qalqon - oldinda
        });
    }
    // MR. WHO (o'ngga qaragan): yuzsiz ko'k HOLOGRAMMA - shlyapa, uzun plash, qo'lida pult; skan chiziqlari. Kadrlar: 0/1 turish (muallaq),
    // 2 pultni bosish (qo'li oldinga, qizil tugma yonadi), 3 o'chib-yonish (qatorlar siljigan)
    // T-REX1000 (Skyland 2-boss): robot T-Rex - ko'zi, burni YO'Q, faqat katta og'iz (tishlar); belida va dumida qizil o'tkir nishlar.
    // Kadrlar: 0 turish, 1 yurish (yaqin oyoq oldinda), 6 o'tish, 2 yurish (uzoq oyoq oldinda), 7 o'tish, 3 dum zarbasi (dum ko'tarilgan),
    // 4 olov (og'iz ochiq, yonib turibdi), 5 nish otish (belidagi nishlar yonadi)
    function trexArt(f) {
        return art(90, 64, (a) => {
            const MET = [0x1a212c, 0x2f3a49, 0x4c5b70, 0x7b8da6, 0xb4c3d6], DK = [0x11161e, 0x1e2632, 0x2c3644, 0x3d4a5c];
            const RED = [0x5a0c08, 0xa81c10, 0xe8401c, 0xff9a5a], GLOW = [0x8a3a00, 0xff8a00, 0xffd54f, 0xfff4c0], MOUTH = 0x2a0606, TOOTH = 0xeef2f6;
            const open = f === 4, tailUp = f === 3, spk = f === 5, by = f === 1 || f === 2 ? 1 : 0;   // qadam tushganda tana biroz pastda
            // OYOQ: tos (39, 38) -> tizza -> to'piq; up - oyoq yerdan ko'tarilgan (oldinga o'tmoqda). [tizza x, to'piq x, ko'tarilish]
            const POSE = { 0: [[38, 37, 0], [43, 44, 0]], 1: [[48, 53, 0], [32, 26, 0]], 6: [[40, 39, 0], [43, 44, 8]], 2: [[32, 26, 0], [48, 53, 0]], 7: [[43, 44, 8], [40, 39, 0]] };
            const [nearP, farP] = POSE[f] || POSE[0];
            const leg = ([kx, ax, up], pal, thick) => {
                const hx = 39, hy = 37 + by, ky = 48 + by - Math.round(up / 2), ay = 58 - up;
                a.e((hx + kx) / 2, (hy + ky) / 2, thick, 8, pal, 0.06);   // son (qalin)
                for (let d = -2; d <= 2; d++) a.line(kx + d, ky, ax + d, ay, d < 0 ? pal[3] : d > 1 ? pal[1] : pal[2]);   // boldir
                a.e(kx, ky, 2.5, 2.5, [pal[1], pal[2], pal[3]]);   // tizza bo'g'imi
                a.r(ax - 4, ay, 12, 4, pal[1]); a.r(ax - 4, ay, 12, 1, pal[3]); a.r(ax + 7, ay + 1, 3, 2, pal[3]);   // panja va tirnog'i
            };
            leg(farP, DK, 5.5);   // uzoq oyoq (qorong'iroq) - tana orqasida
            // DUM: bo'g'imli, uchiga torayadi (dum zarbasida - tepaga ko'tarilgan)
            const tail = tailUp ? [[30, 31, 8, 6.5], [22, 26, 6.6, 5.2], [15, 20, 5.2, 4.2], [10, 14, 3.8, 3.2], [6, 9, 2.6, 2.2], [3, 5, 1.6, 1.4]]
                : [[30, 34, 8, 6.5], [22, 37, 6.6, 5.2], [15, 40, 5.2, 4.2], [9, 43, 3.8, 3.2], [4, 46, 2.6, 2.2], [1, 48, 1.6, 1.4]];
            tail.forEach(([x, y, rx, ry]) => a.e(x, y, rx, ry, MET, 0.04));
            tail.slice(1, 5).forEach(([x, y, , ry]) => a.roof(x, Math.round(y - ry - 3), 3, 1, 3, RED));
            if (tailUp) { a.line(1, 2, 0, 14, MET[4]); a.line(4, 0, 2, 12, MET[3]); }   // tez harakat chiziqlari
            // TANA
            a.e(42, 31 + by, 17, 13, MET, 0.06);
            a.e(47, 36 + by, 9, 7, [MET[2], MET[3], MET[4]], 0.05);   // ko'krak plastinkasi
            [[36, 27], [44, 25], [50, 29], [40, 35]].forEach(([x, y]) => a.p(x, y + by, MET[0]));   // parchinlar
            // BELIDAGI NISHLAR (nish otishda - yonib, cho'zilgan)
            [[27, 22], [32, 19], [38, 18], [44, 17], [50, 18]].forEach(([x, y], i) => a.roof(x, y + by - (spk ? 9 : 7), spk ? 9 : 7, 1, 5, spk ? GLOW : RED));
            // BO'YIN va BOSH (ko'z, burun yo'q - faqat og'iz)
            a.s(50, 15 + by, 9, 15, MET, 0.05);
            a.e(58, 9 + by, 6, 6, MET, 0.08);
            a.s(56, 3 + by, 24, 11, MET, 0.12);
            a.s(72, 6 + by, 12, 8, MET, 0.05);
            a.r(57, 4 + by, 20, 1, MET[4]); a.r(73, 7 + by, 9, 1, MET[3]);
            [[60, 7], [66, 6], [76, 9]].forEach(([x, y]) => a.p(x, y + by, MET[1]));
            if (open) {
                // OG'IZ OCHIQ: pastki jag' tushgan, ichida olov
                a.r(61, 14 + by, 23, 6, MOUTH);
                a.r(66, 15 + by, 18, 4, GLOW[1]); a.r(70, 16 + by, 14, 2, GLOW[2]); a.r(76, 16 + by, 8, 1, GLOW[3]);
                a.s(60, 20 + by, 21, 5, MET, -0.05);
                for (let x = 63; x < 84; x += 3) { a.p(x, 14 + by, TOOTH); a.p(x + 1, 19 + by, TOOTH); }
            } else {
                // og'iz yopiq: uzun jag' chizig'i, tishlar
                a.r(60, 14 + by, 25, 1, MOUTH);
                a.s(60, 15 + by, 22, 5, MET, -0.04);
                for (let x = 62; x < 84; x += 3) { a.p(x, 13 + by, TOOTH); a.p(x + 1, 15 + by, TOOTH); }
                a.r(60, 13 + by, 1, 3, MOUTH);
            }
            // KICHKINA QO'LLAR
            a.line(57, 29 + by, 62, 33 + by, MET[2]); a.line(58, 29 + by, 63, 33 + by, MET[3]); a.p(64, 34 + by, MET[4]); a.p(63, 35 + by, MET[4]);
            // yaqin oyoq (tana oldida)
            leg(nearP, MET, 6.5); a.e(39, 37 + by, 3, 3, [MET[1], MET[2], MET[3]]);   // tos bo'g'imi
        });
    }
    function mrwhoArt(f) {
        const g = art(28, 52, (a) => {
            const H = [0x0a3a7a, 0x1a66c8, 0x3f9cff, 0xa8dcff], L = 0x7ee8ff, by = f === 1 ? 1 : 0;
            // oyoqlar va poyabzal
            a.r(10, 45, 3, 6, H[1]); a.r(15, 45, 3, 6, H[1]); a.r(9, 50, 5, 2, H[0]); a.r(14, 50, 5, 2, H[0]);
            // plash (pastga kengayadi), yoqasi, tugmalari
            for (let y = 16; y < 47; y++) { const w = Math.round(12 + (y - 16) * 0.32); a.r(14 - Math.round(w / 2), y + by, w, 1, y % 2 ? H[2] : H[1]); }
            a.line(14, 17 + by, 11, 26 + by, H[3]); a.line(14, 17 + by, 17, 26 + by, H[3]); a.r(14, 27 + by, 1, 18, H[0]);
            [30, 35, 40].forEach(y => a.p(15, y + by, L));
            // chap qo'l (plash yonida)
            a.r(7, 19 + by, 3, 16, H[1]); a.r(7, 34 + by, 3, 2, H[3]);
            // o'ng qo'l va PULT
            if (f === 2) { a.r(18, 20 + by, 9, 3, H[1]); a.r(24, 19 + by, 4, 5, 0x1a1f25); a.p(25, 20 + by, 0xff3d3d); a.p(26, 20 + by, 0xff8080); a.p(25, 22 + by, 0x40e0ff); }
            else { a.r(18, 19 + by, 3, 14, H[1]); a.r(18, 32 + by, 4, 5, 0x1a1f25); a.p(19, 33 + by, 0xff3d3d); }
            // bosh - YUZSIZ (bo'sh tuxumsimon, yorug')
            a.e(14, 11 + by, 4.5, 5, [H[1], H[2], H[3], 0xd8f0ff], 0.15); a.r(13, 15 + by, 3, 2, H[1]);
            // SHLYAPA: keng hoshiya, tasma, toj
            a.r(5, 6 + by, 18, 2, H[0]); a.r(6, 6 + by, 16, 1, H[1]); a.s(9, 0 + by, 10, 6, [H[0], H[1], H[2], H[3]], 0.05); a.r(9, 4 + by, 10, 1, 0x061a3a); a.r(12, 0 + by, 4, 1, H[3]);
        }, 0x062250);
        // hologramma: skan chiziqlari, o'chib-yonishda - qatorlar siljiydi
        for (let y = 0; y < g.length; y++) {
            for (let x = 0; x < g[0].length; x++) if (g[y][x] !== null && y % 3 === 0) g[y][x] = 0x1a4a90;
            if (f === 3 && (y % 7 === 2 || y % 11 === 5)) { const row = g[y].slice(), dx = y % 2 ? 2 : -2; for (let x = 0; x < row.length; x++) g[y][x] = row[x - dx] === undefined ? null : row[x - dx]; }
        }
        return g;
    }
    // MR. WHO maydoni: TELEVIZOR (130x96) va ekran rasmlari (110x70): 1 olov, 2 qo'l, 3 pritsel, 4 yurak
    function tvArt() {
        return art(50, 36, (a) => {
            const B = [0x14161c, 0x23272f, 0x353b47, 0x4c5566];
            a.s(0, 0, 50, 36, B, 0.05); a.r(1, 0, 48, 1, 0x40e0ff); a.r(0, 35, 50, 1, B[0]);
            a.r(3, 3, 44, 30, 0x05080e); a.r(4, 4, 42, 28, 0x0b1622);
            for (let y = 4; y < 32; y++) for (let x = 4; x < 46; x++) { const h = hash(x, y, 77); if (h < 0.05) a.p(x, y, h < 0.02 ? 0x5a7a96 : 0x2a4258); if (y % 3 === 0 && h > 0.7) a.p(x, y, 0x101e2c); }
            a.r(3, 33, 44, 2, B[1]); a.p(44, 33, 0x40ff80); a.r(38, 33, 2, 1, B[3]); a.r(34, 33, 2, 1, B[3]);
        }, 0x05070c);
    }
    function tvScreen(k) {
        return art(42, 28, (a) => {
            if (k === 1) {   // olov
                a.r(0, 0, 42, 28, 0x2a0800);
                for (let i = 0; i < 5; i++) { const cx = 5 + i * 8, h = 11 + ((i * 7) % 5) * 2; a.roof(cx, 26 - h, h, 1, 7, [0x7a1a00, 0xd84300, 0xff8a00, 0xffb04a]); a.roof(cx, Math.round(26 - h * 0.6), Math.round(h * 0.6), 1, 3, [0xff9a1a, 0xffc35a, 0xffe27a, 0xfff2b0]); }
                a.r(0, 26, 42, 2, 0xd84300);
            } else if (k === 2) {   // qo'l
                a.r(0, 0, 42, 28, 0x0a2a5a);
                a.r(15, 12, 12, 11, 0xa8dcff); a.r(17, 23, 8, 5, 0x7ec0f0);
                [[15, 4], [18, 2], [21, 2], [24, 4]].forEach(([x, y]) => a.r(x, y, 2, 10, 0xd8f0ff));
                a.r(10, 13, 5, 2, 0xd8f0ff); a.r(9, 10, 2, 5, 0xd8f0ff);
                for (let y = 0; y < 28; y += 3) a.r(0, y, 42, 1, 0x0e3a7a);
            } else if (k === 3) {   // pritsel (nishon)
                a.r(0, 0, 42, 28, 0x0e0608);
                for (let t = 0; t < 56; t++) { const an = t / 56 * Math.PI * 2; a.p(Math.round(21 + Math.cos(an) * 10), Math.round(14 + Math.sin(an) * 10), 0xff3d3d); a.p(Math.round(21 + Math.cos(an) * 5), Math.round(14 + Math.sin(an) * 5), 0xff6d6d); }
                a.r(20, 1, 2, 26, 0xff3d3d); a.r(7, 13, 28, 2, 0xff3d3d); a.r(20, 13, 2, 2, 0xffffff);
            } else {   // yurak
                a.r(0, 0, 42, 28, 0x3a0a2a);
                a.e(16, 10, 5.5, 5, [0x8a0a2a, 0xd81b4a, 0xff4f7a, 0xffb0c8], 0.15); a.e(26, 10, 5.5, 5, [0x8a0a2a, 0xd81b4a, 0xff4f7a, 0xffb0c8], 0.15);
                a.roof(21, 12, 11, 20, 1, [0x8a0a2a, 0xd81b4a, 0xff4f7a, 0xffb0c8]); a.p(14, 7, 0xffffff); a.p(15, 6, 0xffffff);
            }
        }, null);
    }
    // MR. HOL: kaskasi ko'zini yopgan qizil-qora ko'r sichqon (o'ngga qaragan), qo'lida pushka, tumshug'i uchida mo'ylov.
    // Kadrlar: 0 turish, 1 qadam, 2 pushkani ko'tarib nishon olish, 3 otish (olov), 4 yerga sho'ng'ish (tuproq), 5 yerdan otilib chiqish
    function mrholArt(f) {
        return art(46, 40, (a) => {
            const FUR = [0x140303, 0x2e0707, 0x5c0f0f, 0x962020], BLK = [0x0a0606, 0x1a1212, 0x2e2424, 0x443838], YEL = [0x7a5200, 0xc78a00, 0xf2b705, 0xffe27a], PINK = [0x8a3b4a, 0xc95f73, 0xf08aa0, 0xffc2cf];
            const IRON = [0x22262b, 0x3d434b, 0x646c76, 0x9aa3ad], DIRT = [0x2b1a10, 0x4a2f1d, 0x6d4c41, 0x8d6e63], F = [0xb3261e, 0xff7a1a, 0xffc35a, 0xfff2b0];
            const dig = f === 4, pop = f === 5, lift = pop ? -4 : 0, sink = dig ? 12 : 0, by = 39;
            const oy = lift + sink;
            // oyoqlar (pushti tirnoqlar)
            if (!dig) { const st = f === 1 ? 2 : 0; a.s(12 - st, 33 + oy, 6, 5, FUR, -0.1); a.s(22 + st, 33 + oy, 6, 5, FUR, -0.1); [[11 - st, 37 + oy], [21 + st, 37 + oy]].forEach(([x, y]) => { a.r(x, y, 8, 2, PINK[1]); a.p(x + 7, y, PINK[3]); a.p(x + 5, y + 1, PINK[3]); }); }
            // tana: nok shakli, qizil-qora jun
            a.e(19, 25 + oy, 12, 12, FUR); a.e(14, 27 + oy, 7, 9, BLK, 0.05);
            for (let k = 0; k < 7; k++) a.line(10 + k * 3, 17 + oy + (k % 2), 8 + k * 3, 21 + oy + (k % 2), FUR[0]);   // jun chiziqlari
            // bosh
            const hx = 26, hy = 13 + oy;
            a.e(hx, hy, 8, 7, FUR, 0.05);
            // tumshuq (ko'r sichqonniki - uzun, pushti) va uchida mo'ylov
            a.s(hx + 5, hy + 1, 8, 4, PINK, 0.05); a.e(hx + 13, hy + 3, 2, 2, PINK, 0.15); a.p(hx + 14, hy + 2, PINK[3]);
            [[hx + 14, hy + 1, hx + 19, hy - 2], [hx + 15, hy + 3, hx + 20, hy + 3], [hx + 14, hy + 4, hx + 19, hy + 7]].forEach(([x0, y0, x1, y1]) => a.line(x0, y0, x1, y1, 0xe8e0d0));
            // kaska (ko'zini yopadi) va chiroqcha
            a.e(hx, hy - 4, 9, 6, YEL, 0.1); a.r(hx - 9, hy - 1, 19, 3, YEL[1]); a.r(hx - 9, hy + 1, 19, 1, YEL[0]); a.r(hx - 1, hy - 10, 3, 3, IRON[2]); a.p(hx, hy - 9, YEL[3]);
            // qo'l va pushka
            if (!dig) {
                const raise = f === 2 || f === 3 ? -3 : 0, recoil = f === 3 ? -2 : 0, cx = 22 + recoil, cy = 21 + oy + raise;
                a.s(cx, cy, 17, 6, IRON, 0.08); a.r(cx + 16, cy - 1, 3, 8, IRON[0]); a.r(cx, cy + 1, 17, 1, IRON[3]); a.r(cx + 3, cy + 6, 4, 3, IRON[1]);
                a.e(cx + 1, cy + 4, 3, 3, FUR, 0.1); a.r(cx - 1, cy + 5, 4, 2, PINK[1]);   // panja
                if (f === 3) { a.e(cx + 22, cy + 3, 4, 4, F, 0.2); a.p(cx + 25, cy + 1, F[3]); a.p(cx + 26, cy + 5, F[2]); }
            } else { a.r(30, 22 + oy, 5, 3, PINK[1]); a.r(6, 24 + oy, 5, 3, PINK[1]); }   // tirnoqlari bilan qazimoqda
            // tuproq (sho'ng'ish / chiqish)
            if (dig || pop) { a.e(20, by - 1, 19, 4, DIRT, 0.05); [[4, by - 6], [36, by - 8], [8, by - 10], [33, by - 3]].forEach(([x, y]) => a.r(x, y + (pop ? -4 : 0), 3, 3, DIRT[2])); }
        });
    }
    // FIERY HOOVES: olovli kiyik (o'ngga qaragan). Kadrlar: 0 turish, 1/2 chopish, 3 tuyoq bilan urish (old oyoqlar ko'tarilgan),
    // 4 shoxini tushirib chopish, 5 orqa oyoqlari bilan tepish, 6 shox otish (shoxlari yorqin yonadi)
    function fieryArt(f) {
        return art(52, 46, (a) => {
            const B = [0x140c0a, 0x24140f, 0x3a2219, 0x5a3626], F = [0x7a1a00, 0xd84300, 0xff8a00, 0xffd23f], AN = [0x8a2a00, 0xd84300, 0xff9a1a, 0xfff0a0], EMB = 0xff6a00, HF = 0xff5a1a, EYE = 0xfff0a0;
            const P = [
                { r: [18, 26], c: [30, 25], h: [42, 11], an: 'up', L: [[15, 30, 13, 38, 14, 45], [19, 30, 18, 38, 19, 45], [31, 30, 31, 38, 31, 45], [35, 30, 35, 38, 36, 45]] },
                { r: [18, 26], c: [30, 25], h: [43, 12], an: 'up', L: [[15, 30, 9, 37, 5, 44], [19, 30, 14, 38, 11, 45], [31, 30, 37, 36, 41, 43], [35, 30, 41, 35, 46, 40]] },
                { r: [18, 25], c: [30, 24], h: [42, 11], an: 'up', L: [[15, 29, 20, 37, 22, 44], [19, 29, 23, 36, 26, 43], [31, 29, 28, 37, 26, 44], [35, 29, 31, 37, 30, 45]] },
                { r: [18, 29], c: [29, 22], h: [41, 10], an: 'up', L: [[15, 33, 14, 39, 14, 45], [19, 33, 19, 39, 20, 45], [31, 26, 37, 28, 39, 34], [35, 25, 40, 27, 43, 32]] },
                { r: [18, 26], c: [30, 26], h: [44, 31], an: 'fwd', L: [[15, 30, 10, 37, 7, 44], [19, 30, 15, 38, 13, 45], [31, 31, 34, 38, 36, 45], [35, 31, 39, 37, 41, 44]] },
                { r: [18, 22], c: [30, 27], h: [42, 22], an: 'up', L: [[15, 25, 8, 24, 1, 21], [19, 26, 11, 28, 4, 30], [31, 32, 31, 39, 31, 45], [35, 32, 36, 39, 37, 45]] },
                { r: [18, 26], c: [30, 25], h: [41, 9], an: 'up', L: [[15, 30, 13, 38, 14, 45], [19, 30, 18, 38, 19, 45], [31, 30, 31, 38, 31, 45], [35, 30, 35, 38, 36, 45]] }
            ][f] || null;
            const p = P || { r: [18, 26], c: [30, 25], h: [42, 11], an: 'up', L: [] }, glow = f === 6, [hx, hy] = p.h;
            const thick = (x0, y0, x1, y1, col) => { a.line(x0, y0, x1, y1, col); a.line(x0 + 1, y0, x1 + 1, y1, col); };
            // dumi - olov
            const tx = p.r[0] - 9, ty = p.r[1] - 3;
            a.line(tx, ty, tx - 4, ty - 5 - (f % 2), F[1]); a.line(tx + 1, ty, tx - 2, ty - 6, F[2]); a.p(tx - 3, ty - 4, F[3]);
            // oyoqlar (orqadagi juftlik - to'qroq)
            p.L.forEach((l, i) => { const col = i % 2 ? B[2] : B[1]; thick(l[0], l[1], l[2], l[3], col); thick(l[2], l[3], l[4], l[5], col); a.r(l[4] - 1, l[5] - 1, 3, 2, HF); a.p(l[4], l[5] - 1, F[3]); });
            // tana: dumba va ko'krak
            a.e(p.r[0], p.r[1], 9, 6, B); a.e(p.c[0], p.c[1], 9, 7, B, 0.05); a.e((p.r[0] + p.c[0]) / 2, (p.r[1] + p.c[1]) / 2, 8, 6, B, 0.03);
            // tanadagi cho'g' yoriqlari
            a.line(p.r[0] - 4, p.r[1] - 2, p.r[0] + 1, p.r[1] + 1, EMB); a.line(p.r[0] + 3, p.r[1] - 4, p.c[0] - 3, p.c[1] - 1, EMB); a.line(p.c[0] - 1, p.c[1] + 2, p.c[0] + 4, p.c[1] - 1, F[2]);
            // bo'yin
            const nx0 = p.c[0] + 4, ny0 = p.c[1] - 3, nx1 = hx - 2, ny1 = hy + 2;
            for (let t = 0; t <= 1.0001; t += 0.1) a.e(nx0 + (nx1 - nx0) * t, ny0 + (ny1 - ny0) * t, 2.6, 2.6, B, 0.04);
            // yolli - olov tillari
            for (let k = 0; k < 4; k++) { const t = 0.15 + k * 0.22, mx = nx0 + (nx1 - nx0) * t - 2, my = ny0 + (ny1 - ny0) * t - 2, fl = (k + f) % 2; a.line(mx, my, mx - 3, my - 4 - fl, F[1]); a.line(mx + 1, my, mx - 1, my - 4, F[2]); a.p(mx - 1, my - 3, F[3]); }
            // bosh, tumshug', ko'z, quloq
            a.e(hx, hy, 4, 3, B, 0.08); a.s(hx + 2, hy - 1, 5, 3, B, 0.1); a.p(hx + 6, hy, F[3]); a.p(hx + 1, hy - 1, EYE); a.p(hx + 2, hy - 1, EYE); a.r(hx - 3, hy - 4, 2, 2, B[2]);
            // shoxlar
            const ac = glow ? AN[3] : AN[2], ab = glow ? AN[2] : AN[1];
            if (p.an === 'up') {
                [[hx - 1, hy - 3, hx - 5, hy - 12], [hx + 1, hy - 3, hx + 4, hy - 12]].forEach(([x0, y0, x1, y1]) => { a.line(x0, y0, x1, y1, ab); a.line(x0 + 1, y0, x1 + 1, y1, ac); });
                [[hx - 3, hy - 7, hx - 8, hy - 8], [hx - 4, hy - 9, hx - 2, hy - 14], [hx + 2, hy - 7, hx + 7, hy - 9], [hx + 3, hy - 10, hx + 7, hy - 13]].forEach(([x0, y0, x1, y1]) => a.line(x0, y0, x1, y1, ac));
                [[hx - 5, hy - 12], [hx + 4, hy - 12], [hx - 8, hy - 8], [hx + 7, hy - 9]].forEach(([x, y]) => a.p(x, y - 1, glow ? 0xffffff : F[3]));
            } else {
                [[hx + 1, hy - 2, hx + 7, hy - 8], [hx + 2, hy, hx + 8, hy - 3]].forEach(([x0, y0, x1, y1]) => { a.line(x0, y0, x1, y1, ab); a.line(x0, y0 - 1, x1, y1 - 1, ac); });
                [[hx + 4, hy - 5, hx + 6, hy - 11], [hx + 5, hy - 2, hx + 7, hy - 6]].forEach(([x0, y0, x1, y1]) => a.line(x0, y0, x1, y1, ac));
                [[hx + 7, hy - 9], [hx + 8, hy - 4], [hx + 6, hy - 12]].forEach(([x, y]) => a.p(x, y, F[3]));
            }
            if (glow) [[hx - 7, hy - 15], [hx + 6, hy - 15], [hx - 1, hy - 16]].forEach(([x, y]) => { a.p(x, y, F[3]); a.p(x, y + 1, F[2]); });
        });
    }
    // XOKKEY DARVOZASI (yon tomondan): qizil temir ustunlar, oq to'r; ochiq tomoni - o'ngda (klient o'yin maydoniga qaratadi)
    // XOKKEY DARVOZASI (138 x 126 px): old ustuni o'ngda (o'yinda aylantiriladi - og'zi chapga), orqasi devorga tegib turadi
    function goalArt() {
        return art(46, 42, (a) => {
            const red = [0x7a0a10, 0xb81a22, 0xe83a3a, 0xff8a80];
            for (let y = 4; y < 39; y++) for (let x = 3 + Math.round((39 - y) * 0.2); x < 41; x++) if ((x + y) % 4 === 0 || ((x - y) % 4 + 4) % 4 === 0) a.p(x, y, (x + y) % 2 ? 0xdde1e7 : 0xb6bcc6);
            a.s(40, 1, 4, 39, red, 0.1); a.s(3, 1, 41, 4, red, 0.1);
            a.line(3, 4, 11, 39, red[1]); a.line(4, 4, 12, 39, red[2]); a.r(3, 39, 41, 3, red[1]); a.r(3, 39, 41, 1, red[2]);
        });
    }
    // Barcha dushman rasmlari: [P, chizish(f), kadrlar soni (yo'q - 3)]
    const GOB = { skin: C.goblin, ears: 'goblin', eyes: 0xffe14a, mouth: 0x3a0a0a, boots: C.leather[0] };
    const ENEMY = {
        // ELF QIROLLIGI: o'g'rilar (6 kadr), yovuz sehrgar elf, sambochi (6 kadr)
        tknife: [2, (f) => thief({ W: 22, H: 24, kind: 'knife' }, f), 6],
        tarcher: [2, (f) => thief({ W: 24, H: 24, kind: 'archer' }, f), 6],
        tbrute: [2, (f) => thief({ W: 30, H: 30, kind: 'brute' }, f), 6],
        darkelf: [2, (f) => darkElf(f), 3],
        // O'RMON: ovchilar (6 kadr), kaltakesak (5), bahaybat daraxt (3)
        hspear: [2, (f) => hunter('spear', f), 6],
        hknives: [2, (f) => hunter('knives', f), 6],
        hshield: [2, (f) => hunter('shield', f), 6],
        lizard: [2, (f) => lizard(f), 5],
        bigtree: [4, (f) => bigTreeArt(f), 3],
        // QOR BAZASI: qor bola (3), muz taran (5), kulba-mimik (4), Alter Qor Bobo (5), Robot Bigfut (4), Muz xokkeychi (5), darvoza (1)
        snowkid: [2, (f) => snowKid(f), 3],
        iceram: [2, (f) => iceRam(f), 5],
        hutmimic: [3, (f) => hutMimic(f), 4],
        santa: [3, (f) => santaArt(f), 5],
        bigfoot: [3, (f) => bigfootArt(f), 4],
        hockey: [3, (f) => hockeyArt(f), 5],
        hgoal: [3, () => goalArt(), 1],
        // YER OSTI: olovli kiyik (7 kadr)
        fieryhooves: [3, (f) => fieryArt(f), 7],
        mrhol: [3, (f) => mrholArt(f), 6],
        mrwho: [3, (f) => mrwhoArt(f), 4],
        trex: [3, (f) => trexArt(f), 8],
        // QORA RITSAR (zaxira rasm; qilich - alohida, klient buradi): 0 turish, 1 qadam, 2 zarba
        blackknight: [5, (f) => biped({ skin: C.dark, eyes: false, W: 22, H: 30, headW: 8, headH: 8, torsoW: 11, torsoH: 11, legH: 10, torso: [0x0e0e14, 0x1c1c26, 0x2e2e3c, 0x4a4a5e], armor: [0x0e0e14, 0x1c1c26, 0x2e2e3c, 0x4a4a5e], legs: [0x0e0e14, 0x1c1c26, 0x2e2e3c, 0x4a4a5e], hat: HAT.darkhelm, cape: [0x3a0008, 0x6a0010, 0x9a1020, 0xc0303a], boots: 0x08080c }, f)],
        mwheart: [1, () => art(2, 2, () => {}, null), 1],
        drone: [3, (f) => droneArt(f), 5],
        guardbot: [3, (f) => guardbotArt(f), 6],
        // BOTQOQ: yovvoyi qul (3), qora kapishon (3), mimik to'nka (4)
        wildslave: [2, (f) => wildSlave(f), 3],
        hoodroot: [2, (f) => hoodRoot(f), 3],
        stumpmimic: [2, (f) => stumpMimic(f), 4],
        sambo: [3, (f) => sambo(f), 10],
        goblin: [3, (f) => biped({ ...GOB, W: 16, H: 15, headW: 6, headH: 5, torsoW: 6, torsoH: 5, legH: 4, torso: C.leather, legs: C.brown, weapon: WPN.dagger, tusk: true }, f)],
        gobarcher: [3, (f) => biped({ ...GOB, W: 16, H: 15, headW: 6, headH: 5, torsoW: 6, torsoH: 5, legH: 4, torso: C.green, legs: C.brown, hat: HAT.hood(C.green), weapon: WPN.bow }, f)],
        orc: [3, (f) => biped({ skin: C.orc, eyes: 0xff3a2a, mouth: 0x3a0a0a, tusk: true, W: 19, H: 21, headW: 7, headH: 6, torsoW: 9, torsoH: 7, legH: 6, torso: C.leather, armor: C.iron, legs: C.dark, hat: HAT.hornhelm, weapon: WPN.axe }, f)],
        darkmage: [3, (f) => biped({ skin: C.pale, eyes: 0xe080ff, W: 16, H: 19, headW: 6, headH: 5, torsoW: 6, torsoH: 6, legH: 6, torso: C.purple, legs: C.purple, robe: true, hat: HAT.wizard(C.purple), weapon: WPN.staff, belt: C.gold[2] }, f)],
        bandit: [3, (f) => biped({ skin: C.tan, eyes: OUT, W: 16, H: 18, headW: 6, headH: 5, torsoW: 6, torsoH: 6, legH: 5, torso: C.dark, legs: C.brown, hat: HAT.hood([0x2a2a1a, 0x3e3e26, 0x56563a, 0x707050]), weapon: WPN.bow, cape: [0x2a2a1a, 0x3e3e26, 0x56563a] }, f)],
        warlord: [4, (f) => biped({ ...GOB, skin: [0x1e3a14, 0x30581f, 0x4a7f2c, 0x6aa83a], eyes: 0xff3a2a, W: 24, H: 26, headW: 8, headH: 7, torsoW: 12, torsoH: 9, legH: 7, torso: C.leather, armor: C.gold, legs: C.dark, hat: HAT.crown, weapon: WPN.club, tusk: true, cape: C.red }, f)],
        shadowknight: [4, (f) => biped({ skin: C.dark, eyes: false, W: 20, H: 26, headW: 7, headH: 7, torsoW: 9, torsoH: 9, legH: 8, torso: C.dark, armor: [0x15151c, 0x24242e, 0x363644, 0x50505f], legs: C.dark, hat: HAT.darkhelm, weapon: WPN.sword, cape: C.red, boots: 0x101014 }, f)],
        golem: [4, (f) => art(24, 26, (a) => {
            const b = f === 1 ? 1 : 0;
            a.s(3 + (f === 1 ? -1 : 0), 19, 7, 7, C.stone, -0.1); a.s(14 + (f === 1 ? 1 : 0), 19, 7, 7, C.stone, -0.15);
            a.s(3, 7 + b, 18, 13, C.stone); a.r(9, 11 + b, 6, 4, 0x24d8ff); a.r(10, 12 + b, 4, 2, 0xc8faff);
            a.s(f === 2 ? 0 : 0, 8 + b, 4, 11, C.stone, -0.1); a.s(20, f === 2 ? 4 : 8 + b, 4, 11, C.stone, -0.05);
            a.s(7, 0 + b, 10, 8, C.stone, 0.1); a.r(9, 3 + b, 2, 1, 0x24d8ff); a.r(13, 3 + b, 2, 1, 0x24d8ff);
            for (let k = 0; k < 6; k++) a.p(5 + k * 3, 9 + b + (k % 2) * 6, C.leafE[3]);
        })],
        bat: [3, (f) => art(18, 10, (a) => {
            const pal = [0x1e0f33, 0x33195a, 0x4e2a82, 0x6e45aa];
            a.e(9, 5, 3, 3, pal, 0.1); a.p(8, 4, 0xff3a2a); a.p(10, 4, 0xff3a2a); a.p(7, 2, pal[3]); a.p(11, 2, pal[3]);
            if (f === 1) { a.s(0, 5, 6, 2, pal); a.s(12, 5, 6, 2, pal); a.p(0, 7, pal[1]); a.p(17, 7, pal[1]); }
            else { for (let k = 0; k < 6; k++) { a.r(k, 4 - Math.round(k / 2), 1, 2 + Math.round(k / 3), pal[k % 2 + 1]); a.r(17 - k, 4 - Math.round(k / 2), 1, 2 + Math.round(k / 3), pal[k % 2 + 1]); } }
            a.p(8, 8, 0xffffff); a.p(10, 8, 0xffffff);
        })],
        hornet: [3, (f) => art(15, 10, (a) => {
            a.e(5, 6, 4, 2.6, [0x8a6400, 0xd9a300, 0xffd54f], 0.1); a.r(3, 4, 1, 5, OUT); a.r(6, 4, 1, 5, OUT);
            a.p(0, 6, OUT); a.e(11, 5, 2.4, 2.2, C.dark, 0.2); a.p(12, 4, 0xff3a2a);
            a.e(7, f === 1 ? 1.5 : 2.5, 3, 1.5, [0xa8c8e0, 0xd8ecf8, 0xffffff], 0.2);
            a.line(13, 6, 14, 8, OUT);
        })],
        rat: [3, (f) => beast({ W: 20, H: 9, legH: 2, bodyH: 5, pal: [0x3a3a44, 0x5a5a66, 0x80808c, 0xaaaab4], tail: 0xd88aa0, eye: 0xff3a2a }, f)],
        wolf: [3, (f) => beast({ W: 24, H: 12, legH: 4, bodyH: 6, pal: [0x2c3540, 0x46525f, 0x66737f, 0x8c98a2], tail: 0x46525f, mane: [0x24303a, 0x3a4650, 0x56626c], eye: 0xffe14a }, f)],
        alpha: [4, (f) => beast({ W: 28, H: 14, legH: 4, bodyH: 8, pal: [0x8f96a3, 0xb6bcc6, 0xdde1e7, 0xffffff], tail: 0xdde1e7, mane: [0xb6bcc6, 0xdde1e7, 0xffffff], eye: 0xff3a2a, stripe: 0x8f96a3 }, f)],
        spider: [3, (f) => spiderG([0x15151c, 0x2a2a36, 0x40404f], 0xff3a2a, 22, 11, f)],
        spiderqueen: [4, (f) => spiderG([0x2a0d45, 0x45186e, 0x63289a], 0x9cff6e, 28, 14, f, true)],
        frog: [3, (f) => art(14, 10, (a) => {
            const pal = [0x1d4a1f, 0x2e7a30, 0x46a845, 0x7ad070], y0 = f === 1 ? -1 : 0;
            a.e(7, 6 + y0, 6, 3.4, pal); a.e(4, 3 + y0, 2, 2, pal, 0.1); a.e(10, 3 + y0, 2, 2, pal, 0.1);
            a.p(4, 3 + y0, OUT); a.p(10, 3 + y0, OUT); a.r(4, 7 + y0, 6, 1, f === 2 ? 0xd84a8a : 0xb8e098);
            a.r(1, 9, 3, 1, pal[1]); a.r(10, 9, 3, 1, pal[1]); [[6, 5], [8, 6]].forEach(([x, y]) => a.p(x, y + y0, 0xf2c640));
        })],
        treant: [3, (f) => treantG(20, 26, f, 0xffe14a, false)],
        // QOR BAZASI
        frostling: [3, (f) => biped({ skin: [0x1e4a6a, 0x2f6e96, 0x4f9cc8, 0x8ad0ee], ears: 'goblin', eyes: 0xe8fbff, mouth: 0x0a1a2a, W: 16, H: 15, headW: 6, headH: 5, torsoW: 6, torsoH: 5, legH: 4, torso: [0x5a4632, 0x7d6448, 0xa38866, 0xc8ad88], legs: C.brown, weapon: WPN.icicle, tusk: true }, f)],
        snowballer: [3, (f) => biped({ skin: [0x8a9ab0, 0xb6c4d6, 0xdde6f0, 0xffffff], eyes: 0xff3a2a, mouth: 0x3a1a2a, W: 19, H: 19, headW: 7, headH: 6, torsoW: 9, torsoH: 7, legH: 4, torso: [0x9aaac0, 0xc4d2e2, 0xe6eef6, 0xffffff], legs: [0x8a9ab0, 0xb6c4d6, 0xdde6f0], boots: 0x6a7a90, belt: false, weapon: WPN.snowball, brow: 0x6a7a90 }, f)],
        yeti: [3, (f) => biped({ skin: [0x3a5a8a, 0x5a7aaa, 0x7a9ac8, 0xa8c0e0], eyes: 0xffe14a, mouth: 0x1a0a14, tusk: true, W: 22, H: 23, headW: 8, headH: 7, torsoW: 12, torsoH: 9, legH: 5, torso: [0xa8b8cc, 0xccd8e6, 0xe8eef6, 0xffffff], arm: [0xa8b8cc, 0xccd8e6, 0xe8eef6, 0xffffff], legs: [0xa8b8cc, 0xccd8e6, 0xe8eef6], boots: 0x5a7aaa, belt: false, hat: HAT.fur }, f)],
        frostbat: [3, (f) => art(18, 10, (a) => {
            const pal = [0x0e3a5a, 0x1a5a8a, 0x3a86c0, 0x7ac4e6];
            a.e(9, 5, 3, 3, pal, 0.1); a.p(8, 4, 0xe8fbff); a.p(10, 4, 0xe8fbff); a.p(7, 2, pal[3]); a.p(11, 2, pal[3]);
            if (f === 1) { a.s(0, 5, 6, 2, pal); a.s(12, 5, 6, 2, pal); a.p(0, 7, 0xd8f4ff); a.p(17, 7, 0xd8f4ff); }
            else { for (let k = 0; k < 6; k++) { a.r(k, 4 - Math.round(k / 2), 1, 2 + Math.round(k / 3), pal[k % 2 + 1]); a.r(17 - k, 4 - Math.round(k / 2), 1, 2 + Math.round(k / 3), pal[k % 2 + 1]); } }
            a.p(8, 8, 0xffffff); a.p(10, 8, 0xffffff);
        })],
        icecrawler: [3, (f) => art(20, 10, (a) => {
            const pal = [0x1a4a7a, 0x2c6aa0, 0x4a92c8, 0x86c8ec];
            (f === 1 ? [3, 7, 11, 15] : [4, 8, 12, 16]).forEach(x => a.line(x, 7, x - 1, 9, pal[0]));
            a.e(9, 5, 8, 3.6, pal, 0.1); for (let k = 0; k < 5; k++) a.roof(4 + k * 3, 0 + (k % 2), 3, 1, 2, [0x9ad8f0, 0xe8fbff]);
            a.e(17, 6, 2.4, 2, pal, 0.15); a.p(18, 5, 0xff3a2a); if (f === 2) { a.r(19, 7, 1, 2, 0xe8fbff); }
        }, 0x08223a)],
        frostmage: [3, (f) => biped({ skin: [0x9ab8d0, 0xbcd4e6, 0xdaeaf6, 0xf4faff], eyes: 0x3fb6e0, W: 16, H: 19, headW: 6, headH: 5, torsoW: 6, torsoH: 6, legH: 6, torso: [0x0e3a6a, 0x1a5a9a, 0x3a86c8, 0x7ab8e8], legs: [0x0e3a6a, 0x1a5a9a, 0x3a86c8], robe: true, hat: HAT.wizard([0x0e3a6a, 0x1a5a9a, 0x3a86c8, 0x7ab8e8]), weapon: WPN.icestaff, belt: 0xe8fbff }, f)],
        wraith: [3, (f) => art(16, 18, (a) => {
            const pal = [0x1a3a6a, 0x3a6aa0, 0x7aaad8, 0xc8e4fa];
            for (let y = 4; y < 18; y++) { const w = Math.max(1, 6 - (y - 4) * 0.4 + Math.sin(y + f * 2) * 1.2); for (let x = Math.round(8 - w); x < Math.round(8 + w); x++) a.p(x, y, shade(0.85 - y / 24 - (x - 8 + w) / (w * 6), x, y, pal)); }
            a.e(8, 5, 4.6, 4.4, pal, 0.1); a.r(5, 3, 6, 1, pal[0]); a.p(6, 6, 0xe8fbff); a.p(10, 6, 0xe8fbff); a.r(6, 6, 1, 1, 0x7ee8ff);
            a.line(3, 9, 0, 8 - (f === 2 ? 3 : 0), pal[2]); a.line(13, 9, 16, 8 - (f === 2 ? 3 : 0), pal[2]);
        }, 0x0a1a3a)],
        icegolem: [3, (f) => art(22, 22, (a) => {
            const pal = [0x2a5a8a, 0x4a86b8, 0x7ab4e0, 0xc0e4fa], b = f === 1 ? 1 : 0;
            a.s(3 + (f === 1 ? -1 : 0), 16, 6, 6, pal, -0.1); a.s(13 + (f === 1 ? 1 : 0), 16, 6, 6, pal, -0.15);
            a.s(3, 6 + b, 16, 11, pal); a.roof(11, 8 + b, 5, 1, 4, [0x7ee8ff, 0xd8fbff]);
            a.s(0, 7 + b, 4, 10, pal, -0.1); a.s(18, f === 2 ? 3 : 7 + b, 4, 10, pal, -0.05);
            a.s(6, 0 + b, 10, 7, pal, 0.1); a.r(8, 3 + b, 2, 1, 0x7ee8ff); a.r(12, 3 + b, 2, 1, 0x7ee8ff);
            for (let k = 0; k < 5; k++) a.p(4 + k * 3, 6 + b, 0xffffff);
        }, 0x081a30)],
        snowman: [3, (f) => art(14, 24, (a) => snowmanDraw(a, f))],
        yetiking: [4, (f) => biped({ skin: [0x2a4a7a, 0x4a6a9a, 0x6a8aba, 0x98b4d8], eyes: 0xff3a2a, mouth: 0x1a0a14, tusk: true, W: 24, H: 26, headW: 8, headH: 7, torsoW: 13, torsoH: 10, legH: 6, torso: [0xa8b8cc, 0xccd8e6, 0xe8eef6, 0xffffff], arm: [0xa8b8cc, 0xccd8e6, 0xe8eef6, 0xffffff], legs: [0xa8b8cc, 0xccd8e6, 0xe8eef6], boots: 0x4a6a9a, belt: false, hat: HAT.icecrown, cape: [0x1a3a6a, 0x2a5a9a, 0x3a7ac0] }, f)],
        icequeen: [4, (f) => biped({ skin: [0x8ab0d0, 0xb0cce4, 0xd8e8f6, 0xf4faff], eyes: 0x3fb6e0, mouth: 0x5a86b8, W: 20, H: 26, headW: 6, headH: 6, torsoW: 7, torsoH: 9, legH: 8, torso: [0x2a6a9a, 0x4a9ac8, 0x7ac4e6, 0xc0ecff], legs: [0x2a6a9a, 0x4a9ac8, 0x7ac4e6], robe: true, hat: HAT.icecrown, weapon: WPN.icestaff, cape: [0xb0cce4, 0xd8e8f6, 0xf4faff], belt: 0xe8fbff }, f)],
        mammoth: [4, (f) => art(30, 22, (a) => {
            const pal = [0x3a2418, 0x5b3a26, 0x7d5636, 0xa27a50], b = f === 1 ? 1 : 0;
            (f === 1 ? [4, 9, 18, 23] : [5, 10, 17, 22]).forEach((x, i) => a.s(x, 15, 4, 7 - (i % 2 && b ? 1 : 0), pal, -0.2));
            a.e(13, 10, 12, 7, pal, 0.05); for (let x = 2; x < 25; x += 2) a.line(x, 12, x - 1, 16 + (x % 3), pal[1]);
            a.e(24, 8, 5, 5, pal, 0.1); a.line(28, 10, 29, 16 + (f === 2 ? -4 : 0), pal[2]); a.line(27, 10, 28, 16 + (f === 2 ? -4 : 0), pal[1]);
            a.line(25, 12, 29, 13, 0xf4efe2); a.line(29, 13, 28, 9, 0xf4efe2); a.p(25, 6, 0xffe14a);
            for (let x = 3; x < 22; x += 3) a.p(x, 3 + (x % 2), 0xffffff); a.e(20, 4, 3, 2, [0xd8e8f6, 0xffffff]);
        })],
        // olovli imp: qanotli, shoxli, dumli - olov shari otadi
        imp: [3, (f) => art(16, 14, (a) => {
            const pal = [0x5a0c10, 0x9a1f1a, 0xd8442a, 0xff7a4a], wing = [0x2a0a10, 0x4a1420, 0x6e2030];
            if (f === 1) { a.s(0, 3, 5, 3, wing); a.s(11, 3, 5, 3, wing); } else { a.line(1, 1, 5, 5, wing[1]); a.line(0, 3, 5, 6, wing[2]); a.line(14, 1, 10, 5, wing[1]); a.line(15, 3, 10, 6, wing[2]); }
            a.e(8, 8, 3.4, 3.6, pal, 0.1); a.e(8, 4, 2.6, 2.4, pal, 0.15); a.p(6, 1, 0xf4efe2); a.p(10, 1, 0xf4efe2); a.p(5, 2, 0xf4efe2); a.p(11, 2, 0xf4efe2);
            a.p(7, 4, 0xffe14a); a.p(9, 4, 0xffe14a); a.r(7, 6, 3, 1, OUT); a.line(8, 12, 12, 13, pal[1]); a.p(13, 12, pal[3]);
            if (f === 2) a.e(13, 8, 2, 2, [0xff7a1a, 0xffc35a, 0xfff2b0], 0.2);
        })],
        // gargulya: tosh qanotli maxluq - haykal bo'lib turadi (0-kadr), uyg'onsa uchadi
        gargoyle: [3, (f) => art(18, 16, (a) => {
            const pal = [0x2e2b38, 0x45405a, 0x5f5a78, 0x807a99];
            if (f === 0) { a.s(3, 13, 12, 3, C.stone); a.s(4, 5, 10, 8, pal); a.s(2, 3, 3, 9, pal, -0.1); a.s(13, 3, 3, 9, pal, -0.1); }
            else { a.line(0, 2 + (f === 1 ? 0 : 3), 6, 7, pal[2]); a.line(0, 4, 6, 8, pal[1]); a.line(17, 2 + (f === 1 ? 0 : 3), 11, 7, pal[2]); a.line(17, 4, 11, 8, pal[1]); a.s(5, 6, 8, 7, pal); a.r(5, 13, 2, 2, pal[1]); a.r(11, 13, 2, 2, pal[1]); }
            a.e(9, 4, 3, 2.6, pal, 0.1); a.p(7, 1, pal[3]); a.p(11, 1, pal[3]);
            a.p(8, 4, f === 0 ? pal[0] : 0xff3a2a); a.p(10, 4, f === 0 ? pal[0] : 0xff3a2a); a.r(8, 6, 3, 1, OUT);
            if (f === 2) { a.r(13, 10, 3, 1, C.bone[3]); a.r(2, 10, 3, 1, C.bone[3]); }
        })],
        // shilimshiq: yarim shaffof jele, ichida suyak
        slime: [3, (f) => art(16, 12, (a) => {
            const pal = [0x1d6a4a, 0x2fa36a, 0x5fd894, 0xb8ffd8], sq = f === 1 ? 1 : 0;
            a.e(8, 7 + sq, 7.5 + sq, 4.5 - sq, pal, 0.05); a.r(2, 11, 12, 1, pal[0]);
            a.p(5, 4 + sq, 0xffffff); a.p(6, 4 + sq, 0xffffff); a.r(5, 6 + sq, 2, 2, OUT); a.r(10, 6 + sq, 2, 2, OUT);
            a.r(7, 9, 3, 1, f === 2 ? 0x7a1018 : pal[0]); a.p(12, 9, C.bone[2]); a.p(13, 8, C.bone[3]);
        })],
        // mimik: sandiq bo'lib yotadi (0), uyg'onsa tishlari va tili bilan yuradi
        mimic: [3, (f) => art(18, 15, (a) => {
            if (f === 0) { a.s(0, 6, 18, 9, C.wood); a.s(0, 2, 18, 5, C.wood, 0.1); a.r(0, 6, 18, 1, C.wood[0]); a.r(1, 2, 1, 13, C.gold[2]); a.r(16, 2, 1, 13, C.gold[2]); a.s(7, 5, 4, 4, C.gold, 0.1); a.p(9, 7, 0xff3a2a); return; }
            const open = f === 2 ? 5 : 3;
            a.s(0, 6 + open - 3, 18, 7, C.wood); a.r(1, 6 + open - 3, 1, 7, C.gold[2]); a.r(16, 6 + open - 3, 1, 7, C.gold[2]);
            a.s(0, 0, 18, 4, C.wood, 0.1); a.r(1, 0, 1, 4, C.gold[2]); a.r(16, 0, 1, 4, C.gold[2]);
            a.r(1, 4, 16, open, 0x3a0a10); for (let x = 1; x < 17; x += 2) { a.p(x, 4, 0xf4efe2); a.p(x + 1, 3 + open, 0xf4efe2); }
            a.line(9, 5, 14, 4 + open, 0xd84a8a); a.p(5, 1, 0xffe14a); a.p(12, 1, 0xffe14a);
            a.r(3, 13, 2, 2, C.wood[0]); a.r(13, 13, 2, 2, C.wood[0]);
        })],
        // arvoh-chiroq (wisp): uchib yuradigan ko'kish olov
        wisp: [3, (f) => art(12, 14, (a) => {
            const pal = [0x1f6f8e, 0x3fb6e0, 0x7ee8ff, 0xd8fbff];
            a.e(6, 6, 4.5, 5, pal, 0.15); for (let k = 0; k < 3; k++) a.p(3 + k * 3, 11 + ((k + f) % 2), pal[1 + (k % 2)]);
            a.p(4, 5, OUT); a.p(8, 5, OUT); a.r(5, 8, 2, 1, f === 2 ? OUT : pal[1]); a.p(6, 0, pal[3]);
        }, 0x0b3a4e)],
        // tikanli maxluq (thornback): orqasi tikanli butalar, to'rt oyoqli
        thornback: [3, (f) => art(24, 14, (a) => {
            const pal = [0x2a1a10, 0x4a3020, 0x6b4a30, 0x8f6a45], b = f === 1 ? 1 : 0;
            (f === 1 ? [3, 7, 14, 18] : [4, 8, 13, 17]).forEach((x, i) => a.s(x, 10, 3, 4 - (i % 2 && b ? 1 : 0), pal, -0.2));
            a.e(11, 8, 9, 4, pal); for (let k = 0; k < 7; k++) { const x = 4 + k * 2.5; a.line(x, 5, x - 1, 1 + (k % 2), C.leafF[2]); a.p(x - 1, 1 + (k % 2), 0xd84a4a); }
            a.e(20, 8 + (f === 2 ? 1 : 0), 3.2, 3, pal, 0.1); a.p(21, 7, 0xffe14a); a.r(21, 10, 3, 1, f === 2 ? 0x7a1018 : OUT); a.p(23, 9, 0xf4efe2);
        })],
        // qo'ziqorin-odam (myconid): boshidan spora otadi
        myconid: [3, (f) => art(16, 18, (a) => {
            const cap = [0x3a1a5a, 0x5e2a8a, 0x8a4ab8, 0xb87ae0], stem = [0x8c8270, 0xb4aa94, 0xd8d0bc];
            a.e(8, 4, 7.5, 4 - (f === 2 ? 1 : 0), cap, 0.1); [[4, 3], [9, 2], [12, 5]].forEach(([x, y]) => a.p(x, y, 0xd8fbff));
            a.s(5, 7, 6, 7, stem); a.p(6, 9, OUT); a.p(9, 9, OUT); a.r(7, 11, 2, 1, 0x5a3a2a);
            a.s(f === 1 ? 4 : 5, 14, 2, 4, stem, -0.1); a.s(f === 1 ? 10 : 9, 14, 2, 4, stem, -0.15); a.r(3, 9, 2, 4, stem[1]); a.r(11, 9, 2, 4, stem[1]);
            if (f === 2) for (let k = 0; k < 4; k++) a.p(3 + k * 3, 0, 0x9cff6e);
        })],
        ancient: [4, (f) => treantG(26, 34, f, 0xff3a2a, true)],
        // o'rgimchak tuxumi: tirik pulsatsiya (2 - yorilish oldidan)
        eggsac: [3, (f) => art(12, 12, (a) => { const pal = [0xa8a090, 0xd0c8b0, 0xece4cc, 0xffffff]; a.e(6, 7, 5.4 + (f === 1 ? 0.4 : 0), 4.8 + (f === 1 ? 0.4 : 0), pal, 0.1); for (let k = 0; k < 6; k++) a.line(1 + k * 2, 2 + (k % 2), 6, 7, 0xe6e6f0); a.e(6, 7, 2, 1.6, [0x63289a, 0x9cff6e]); if (f === 2) { a.line(4, 3, 7, 9, OUT); a.line(7, 9, 9, 5, OUT); } })],
        // YER OSTI OLAMI
        emberling: [3, (f) => biped({ skin: C.magma, ears: 'goblin', eyes: 0xffe14a, mouth: 0x1a0606, W: 16, H: 15, headW: 6, headH: 5, torsoW: 6, torsoH: 5, legH: 4, torso: C.obs, legs: C.dark, boots: 0x0a0608, weapon: WPN.obsblade, tusk: true, hat: HAT.horns }, f)],
        // SHAXTYOR (kirka, sariq kaska) va SHAXTYOR SHUTER (barabanli qurol, zang rangli kaska va ko'zoynak): kir yuz, ko'k kombinezon
        miner: [3, (f) => biped({ skin: [0x6a4a36, 0x8a664c, 0xa88468, 0xc4a080], eyes: 0xff3a1a, mouth: 0x2a1a14, W: 30, H: 24, headW: 6, headH: 5, torsoW: 6, torsoH: 6, legH: 5,
            torso: [0x1a2838, 0x2a4058, 0x3e5a7a, 0x56789c], arm: [0x5a3216, 0x8a4e22, 0xb06a30, 0xcc8a48], legs: [0x1a2838, 0x2a4058, 0x3e5a7a], boots: 0x1a120c, belt: C.leather[1],
            chest: (a, tx, tTop, tW) => { a.r(tx, tTop, tW, 1, 0xb06a30); a.p(tx + 1, tTop + 1, 0xd8a818); a.p(tx + tW - 2, tTop + 1, 0xd8a818); }, hat: HAT.minerhat([0xa07a10, 0xd8a818, 0xf2c83a, 0xffe26a]), weapon: WPN.minepick }, f)],
        minershot: [3, (f) => biped({ skin: [0x6a4a36, 0x8a664c, 0xa88468, 0xc4a080], eyes: false, mouth: 0x2a1a14, W: 36, H: 24, headW: 6, headH: 5, torsoW: 6, torsoH: 6, legH: 5,
            torso: [0x1a2838, 0x2a4058, 0x3e5a7a, 0x56789c], arm: [0x3a3a3e, 0x56565c, 0x74747c, 0x94949c], legs: [0x1a2838, 0x2a4058, 0x3e5a7a], boots: 0x1a120c, belt: C.leather[1],
            chest: (a, tx, tTop, tW) => { for (let k = 0; k < tW; k++) a.p(tx + k, tTop + 3 - Math.floor(k / 2), 0xd8a818); }, hat: HAT.minerhat([0x6a2a10, 0xa8481c, 0xd0682c, 0xee8a48], true), weapon: WPN.oregun }, f)],
        bonearcher: [3, (f) => biped({ skin: C.bone, eyes: 0xff5a1a, mouth: OUT, W: 16, H: 18, headW: 6, headH: 5, torsoW: 6, torsoH: 6, legH: 5, torso: [0x5a5244, 0x8c8270, 0xb4aa94, 0xd8d0bc], legs: C.bone, boots: C.bone[0], belt: C.leather[1],
            chest: (a, tx, tTop, tW) => { for (let k = 1; k < 5; k += 2) a.r(tx + 1, tTop + k, tW - 2, 1, OUT); }, hat: HAT.hood([0x1a0a0a, 0x3a1414, 0x5a2020, 0x7a3030]), weapon: WPN.bow }, f)],
        magmabrute: [3, (f) => art(22, 22, (a) => {
            const b = f === 1 ? 1 : 0;
            a.s(3 + (f === 1 ? -1 : 0), 16, 6, 6, C.obs, -0.1); a.s(13 + (f === 1 ? 1 : 0), 16, 6, 6, C.obs, -0.15);
            a.s(3, 6 + b, 16, 11, C.obs); a.line(5, 8 + b, 9, 12 + b, 0xff5a1a); a.line(9, 12 + b, 15, 10 + b, 0xff7a1a); a.line(12, 14 + b, 16, 16 + b, 0xff5a1a); a.p(10, 12 + b, 0xffc35a);
            a.s(0, 7 + b, 4, 10, C.obs, -0.1); a.s(18, f === 2 ? 3 : 7 + b, 4, 10, C.obs, -0.05); a.r(0, 16 + b, 4, 1, 0xff5a1a); a.r(18, f === 2 ? 12 : 16 + b, 4, 1, 0xff5a1a);
            a.s(6, 0 + b, 10, 7, C.obs, 0.1); a.r(8, 3 + b, 2, 1, 0xffc35a); a.r(12, 3 + b, 2, 1, 0xffc35a); a.p(6, 0 + b, 0xff7a1a); a.p(15, 0 + b, 0xff7a1a);
        })],
        firebat: [3, (f) => art(18, 10, (a) => {
            const pal = C.magma;
            a.e(9, 5, 3, 3, pal, 0.1); a.p(8, 4, 0xfff2b0); a.p(10, 4, 0xfff2b0); a.p(7, 2, pal[3]); a.p(11, 2, pal[3]);
            if (f === 1) { a.s(0, 5, 6, 2, pal); a.s(12, 5, 6, 2, pal); a.p(0, 7, 0xffc35a); a.p(17, 7, 0xffc35a); }
            else { for (let k = 0; k < 6; k++) { a.r(k, 4 - Math.round(k / 2), 1, 2 + Math.round(k / 3), pal[k % 2 + 1]); a.r(17 - k, 4 - Math.round(k / 2), 1, 2 + Math.round(k / 3), pal[k % 2 + 1]); } }
            a.p(8, 8, 0xffffff); a.p(10, 8, 0xffffff); a.p(9, 9, 0xffc35a);
        })],
        emberbeetle: [3, (f) => art(20, 10, (a) => {
            (f === 1 ? [3, 7, 11, 15] : [4, 8, 12, 16]).forEach(x => a.line(x, 7, x - 1, 9, C.obs[0]));
            a.e(9, 5, 8, 3.6, C.obs, 0.1); a.r(9, 2, 1, 6, C.obs[0]); [[5, 4], [13, 4], [7, 6], [11, 6]].forEach(([x, y]) => a.p(x, y, 0xff7a1a)); a.p(6, 3, 0xffc35a);
            a.e(17, 6, 2.4, 2, C.obs, 0.15); a.p(18, 5, 0xffe14a); a.line(19, 5, 20, 3, C.obs[3]); if (f === 2) a.r(19, 7, 1, 2, 0xfff2b0);
        }, 0x050306)],
        cultist: [3, (f) => biped({ skin: [0x3a2a30, 0x5a4048, 0x7a5a62, 0x9a7a80], eyes: 0xff7a1a, W: 16, H: 19, headW: 6, headH: 5, torsoW: 6, torsoH: 6, legH: 6, torso: [0x3a0a10, 0x5a1018, 0x8a1a22, 0xb83030], legs: [0x3a0a10, 0x5a1018, 0x8a1a22], robe: true,
            hat: HAT.hood([0x2a0608, 0x4a0c12, 0x6e141c, 0x8e2028]), weapon: WPN.firestaff, belt: C.gold[2] }, f)],
        // ko'zli maxluq (gazer): uchib yuradigan katta ko'z, ostida paypaslagichlar - nur shar otadi
        gazer: [3, (f) => art(16, 18, (a) => {
            const pal = [0x3a0a2a, 0x6a1a4a, 0x9a3a6a, 0xc86a90];
            for (let k = 0; k < 4; k++) { const x0 = 4 + k * 2.6; for (let y = 11; y < 17; y++) a.p(x0 + Math.round(Math.sin(y / 1.6 + k + f) * 1.2), y, y % 2 ? pal[1] : pal[2]); }
            a.e(8, 7, 6.5, 6.5, pal, 0.1); a.e(8, 7, 4, 4, [0xd8d0bc, 0xf4efe2, 0xffffff], 0.1);
            a.e(8 + (f === 2 ? 0 : 1), 7, 2.2, 2.2, f === 2 ? [0xffc35a, 0xfff2b0] : [0x8e1a1e, 0xc62f2f, 0xef5f50]); a.r(8 + (f === 2 ? 0 : 1), 6, 1, 2, OUT);
            a.p(3, 2, pal[3]); a.p(12, 1, pal[3]); a.p(8, 0, pal[3]);
        })],
        magmacrab: [3, (f) => art(26, 14, (a) => {
            const b = f === 1 ? 1 : 0;
            (f === 1 ? [5, 9, 15, 19] : [6, 10, 14, 18]).forEach((x, i) => a.line(x, 9, x + (i < 2 ? -2 : 2), 13 - (i % 2 && b ? 1 : 0), C.magma[1]));
            a.e(12, 7, 9, 4.5, C.obs, 0.1); [[7, 5], [11, 4], [15, 5], [9, 8], [14, 8]].forEach(([x, y]) => { a.p(x, y, 0xff7a1a); a.p(x + 1, y, 0xff5a1a); }); a.p(11, 4, 0xffc35a);
            const cl = f === 2 ? -2 : 0;
            a.e(2.5, 6 + cl, 2.6, 2.2, C.magma, 0.1); a.e(22.5, 6 + cl, 2.6, 2.2, C.magma, 0.1); a.p(1, 4 + cl, OUT); a.p(24, 4 + cl, OUT); a.line(4, 7, 6, 8, C.magma[1]); a.line(21, 7, 19, 8, C.magma[1]);
            a.r(10, 2, 1, 2, C.magma[2]); a.r(14, 2, 1, 2, C.magma[2]); a.p(10, 1, 0xffe14a); a.p(14, 1, 0xffe14a);
        })],
        mimicrock: [3, (f) => art(30, 30, (a) => rockMimicDraw(a, f)), 6],
        bullkan: [3, () => art(2, 2, () => {}), 1],   // rasmi - bigmap.js BOSS_IMG (yuklanguncha ko'rinmaydi)
        magmablob: [3, (f) => art(22, 12, (a) => blobDraw(a, f))],
        // MAGMA TITANI: ulkan erigan tosh gavda, shoxli, ko'kragida yonib turgan yadro
        magmatitan: [4, (f) => art(26, 28, (a) => {
            const b = f === 1 ? 1 : 0;
            a.s(4 + (f === 1 ? -1 : 0), 20, 7, 8, C.obs, -0.1); a.s(15 + (f === 1 ? 1 : 0), 20, 7, 8, C.obs, -0.15); a.r(4, 27, 7, 1, 0xff5a1a); a.r(15, 27, 7, 1, 0xff5a1a);
            a.s(3, 8 + b, 20, 13, C.obs); a.e(13, 13 + b, 3.4, 3, C.lava, 0.2); a.p(13, 13 + b, 0xffffff);
            a.line(5, 10 + b, 9, 17 + b, 0xff5a1a); a.line(17, 10 + b, 21, 18 + b, 0xff5a1a); a.line(8, 19 + b, 18, 19 + b, 0xff7a1a);
            a.s(0, 9 + b, 4, 12, C.obs, -0.1); a.s(22, f === 2 ? 3 : 9 + b, 4, 12, C.obs, -0.05); a.e(2, 21 + b, 2.4, 2, C.lava); a.e(24, f === 2 ? 15 : 21 + b, 2.4, 2, C.lava);
            a.s(8, 1 + b, 10, 8, C.obs, 0.1); a.r(10, 4 + b, 2, 1, 0xffc35a); a.r(14, 4 + b, 2, 1, 0xffc35a); a.r(11, 7 + b, 4, 1, 0xff5a1a);
            a.line(8, 2 + b, 5, -1 + b + 1, C.obs[3]); a.p(5, b, 0xff7a1a); a.line(17, 2 + b, 20, -1 + b + 1, C.obs[3]); a.p(20, b, 0xff7a1a);
        })],
        // SUYAK QIROL: toj kiygan skelet, binafsha jon-olov tayoqchasi
        boneking: [4, (f) => biped({ skin: C.bone, eyes: 0x9a6aff, mouth: OUT, W: 20, H: 26, headW: 7, headH: 7, torsoW: 9, torsoH: 9, legH: 8, torso: [0x5a5244, 0x8c8270, 0xb4aa94, 0xd8d0bc], armor: [0x1a1028, 0x2a1a40, 0x3e2a5a, 0x5a3e7a], legs: C.bone, boots: C.bone[0],
            chest: (a, tx, tTop, tW) => { for (let k = 2; k < 8; k += 2) a.r(tx + 2, tTop + k, tW - 4, 1, OUT); }, hat: HAT.crown, weapon: WPN.soulstaff, cape: [0x2a0d45, 0x45186e, 0x63289a], belt: C.gold[2] }, f)],
        // DO'ZAX ITI (maxfiy boss): olovli yolli, cho'g' ko'zli ulkan it
        // G'OR BOSSLARI: magma qurti (yer osti), muz kolossi (qor bazasi)
        magmaworm: [4, (f) => art(36, 18, (a) => {
            for (let k = 0; k < 6; k++) { const x = 3 + k * 4.6, y = 11 + Math.round(Math.sin(k * 1.1 + (f === 1 ? 1.4 : 0)) * 2); a.e(x, y, 3.6, 4.4 - k * 0.1, C.obs, 0.1); a.r(Math.round(x) - 1, y - 4, 2, 1, 0xff5a1a); a.p(Math.round(x) + 2, y, 0xff7a1a); }
            const jaw = f === 2 ? 3 : 1;
            a.e(30, 9, 5.5, 5, C.obs, 0.12); a.s(30, 4 - jaw, 6, 3, C.obs, 0.1); a.s(30, 11 + jaw, 6, 3, C.obs, -0.05); a.r(31, 7 - jaw + 3, 5, jaw * 2, 0xb3261e);
            for (let x = 31; x < 36; x += 2) { a.p(x, 7, 0xf4efe2); a.p(x, 11 + jaw - 1, 0xf4efe2); } a.e(31, 9, 1.4, 1.4, C.lava, 0.2); a.p(28, 6, 0xffe14a); a.p(28, 7, 0xffc35a);
            a.line(26, 5, 24, 1, C.obs[3]); a.p(24, 0, 0xff7a1a);
        })],
        // BOTQOQ
        bogling: [3, (f) => biped({ skin: C.bog, ears: 'goblin', eyes: 0xffe14a, mouth: OUT, W: 16, H: 15, headW: 6, headH: 5, torsoW: 6, torsoH: 5, legH: 4, torso: [0x2a3a1a, 0x3e5226, 0x56703a, 0x7a9450], legs: C.mud, boots: C.mud[0], weapon: WPN.pitch, tusk: true }, f)],
        spitter: [3, (f) => art(16, 15, (a) => {
            const pal = [0x1d4a1f, 0x2e7a30, 0x46a845, 0x7ad070], y0 = f === 1 ? -1 : 0;
            a.s(f === 1 ? 2 : 3, 11, 3, 4, pal, -0.15); a.s(f === 1 ? 11 : 10, 11, 3, 4, pal, -0.2); a.r(1, 14, 4, 1, pal[1]); a.r(11, 14, 4, 1, pal[1]);
            a.e(8, 8 + y0, 6.5, 4.5, pal); a.e(8, 9 + y0, 3.6, 2.6, [0xb8e098, 0xd8f0b8]); a.e(5, 3 + y0, 2.2, 2.2, pal, 0.1); a.e(11, 3 + y0, 2.2, 2.2, pal, 0.1);
            a.p(5, 3 + y0, 0xffe14a); a.p(11, 3 + y0, 0xffe14a); a.r(5, 6 + y0, 7, f === 2 ? 2 : 1, f === 2 ? 0x2e5a10 : OUT); if (f === 2) a.e(13, 6, 1.6, 1.6, C.toxic, 0.2);
            [[3, 8], [12, 7], [7, 11]].forEach(([x, y]) => a.p(x, y + y0, 0x9a6a2a)); a.line(1, 9 + y0, 0, 12, pal[1]); a.line(15, 9 + y0, 15, 12, pal[1]);
        })],
        mudgolem: [3, (f) => art(22, 22, (a) => {
            const pal = C.mud, b = f === 1 ? 1 : 0;
            a.s(3 + (f === 1 ? -1 : 0), 16, 6, 6, pal, -0.1); a.s(13 + (f === 1 ? 1 : 0), 16, 6, 6, pal, -0.15);
            a.s(3, 6 + b, 16, 11, pal); for (let k = 0; k < 7; k++) a.p(4 + k * 2.2, 6 + b + (k % 3), C.moss[3]); a.e(14, 12 + b, 2, 1.4, C.moss, 0.1);
            a.s(0, 7 + b, 4, 10, pal, -0.1); a.s(18, f === 2 ? 3 : 7 + b, 4, 10, pal, -0.05); a.p(1, 17 + b, pal[0]); a.p(2, 18 + b, pal[1]);
            a.s(6, 0 + b, 10, 7, pal, 0.1); a.r(8, 3 + b, 2, 1, 0xd8ff8a); a.r(12, 3 + b, 2, 1, 0xd8ff8a); a.r(9, 5 + b, 4, 1, OUT); a.line(7, 0 + b, 9, 0 + b, C.moss[3]);
        })],
        mosquito: [3, (f) => art(18, 12, (a) => {
            a.e(7, 7, 4, 2.2, [0x3a2a1a, 0x5a4026, 0x7a5a36], 0.1); for (let x = 4; x < 10; x += 2) a.p(x, 7, 0x2a1a10);
            a.e(12, 6, 2.2, 2, C.dark, 0.2); a.p(13, 5, 0xff3a2a); a.line(14, 7, 17, 9, 0x2a1a10);
            a.e(8, f === 1 ? 2 : 3.5, 3.4, 1.6, [0xa8c8b0, 0xd0e8d8, 0xf0fff4], 0.2); a.e(5, f === 1 ? 3 : 4.5, 2.6, 1.3, [0xa8c8b0, 0xd0e8d8], 0.2);
            [[6, 9, 4, 11], [8, 9, 9, 12], [10, 8, 12, 11]].forEach(([x0, y0, x1, y1]) => a.line(x0, y0, x1, y1, 0x2a1a10));
        })],
        leech: [3, (f) => art(20, 8, (a) => {
            const pal = [0x2a0e0e, 0x4a1a1a, 0x6a2a24, 0x8a4036];
            for (let k = 0; k < 6; k++) a.e(3 + k * 2.8, 4.5 - (f === 1 && k % 2 ? 1 : 0), 2.4, 2.4 - k * 0.1, pal, 0.1);
            for (let k = 0; k < 6; k++) a.p(3 + k * 2.8, 3, pal[3]); a.e(18, 4, 1.6, 2, pal, 0.15); a.p(19, 4, f === 2 ? 0xd84a4a : OUT); a.p(19, 3, 0xf4efe2);
        })],
        bogwitch: [3, (f) => biped({ skin: [0x3a5a3a, 0x5a7a4a, 0x7a9a62, 0x9aba7e], eyes: 0x9cff6e, W: 16, H: 19, headW: 6, headH: 5, torsoW: 6, torsoH: 6, legH: 6, torso: [0x2a1e30, 0x3e2a46, 0x56385e, 0x704a7a], legs: [0x2a1e30, 0x3e2a46, 0x56385e], robe: true,
            hat: HAT.wizard([0x1a1a12, 0x2a2a1e, 0x3e3e2c, 0x56563c]), weapon: WPN.staff, belt: C.moss[3], beard: false }, f)],
        bogspirit: [3, (f) => art(12, 14, (a) => {
            const pal = [0x2e6a1a, 0x5aa83a, 0x9ae06a, 0xe0ffc8];
            a.e(6, 6, 4.5, 5, pal, 0.15); for (let k = 0; k < 3; k++) a.p(3 + k * 3, 11 + ((k + f) % 2), pal[1 + (k % 2)]);
            a.p(4, 5, OUT); a.p(8, 5, OUT); a.r(5, 8, 2, 1, f === 2 ? OUT : pal[1]); a.p(6, 0, pal[3]);
        }, 0x0e2a0a)],
        snapper: [3, (f) => art(26, 14, (a) => {
            const b = f === 1 ? 1 : 0, sk = [0x3a4a2a, 0x56683a, 0x728a4a, 0x90a862];
            (f === 1 ? [5, 9, 15, 19] : [6, 10, 14, 18]).forEach((x, i) => a.s(x, 10, 3, 4 - (i % 2 && b ? 1 : 0), sk, -0.2));
            a.e(12, 7, 10, 5, [0x2a2016, 0x3e3020, 0x56442c, 0x6e5838], 0.08); for (let x = 5; x < 20; x += 5) { a.line(x, 3, x + 2, 9, 0x2a2016); } for (let x = 4; x < 21; x += 3) if (hash(x, 7, 7) < 0.6) a.p(x, 2 + (x % 2), C.moss[3]);
            const hx = f === 2 ? 23 : 22; a.e(hx, 8, 3, 2.6, sk, 0.1); a.p(hx + 1, 7, 0xffe14a); a.line(hx + 2, 9, hx + 3, 10, 0xd8c87a); if (f === 2) a.r(hx + 1, 9, 2, 1, 0x7a1018);
        })],
        boglurker: [3, (f) => art(26, 9, (a) => crocG(a, 26, 9, f))],
        bigcroc: [4, (f) => art(38, 13, (a) => { crocG(a, 38, 13, f || 1); for (let x = 6; x < 28; x += 3) a.p(x, 5, 0x2e5226); if (f === 0) a.p(33, 4, 0xffe14a); })],
        // GIDRA: uch boshli botqoq ilon-maxluq
        hydra: [4, (f) => art(28, 30, (a) => {
            const pal = [0x1a3a2a, 0x2a5a3e, 0x3e7a52, 0x5aa06e], belly = [0x8a9a5a, 0xb0c07a, 0xd0dc9a];
            a.e(14, 24, 12.5, 6, pal, 0.05); a.e(14, 26, 7, 3, belly, 0.1); a.s(4, 27, 4, 3, pal, -0.2); a.s(20, 27, 4, 3, pal, -0.2);
            [[6, -1], [14, 0], [22, 1]].forEach(([nx, s], i) => {
                const sw = f === 1 ? (i - 1) * 1 : 0, hx = nx + s * 3 + sw, hy = 5 + (i === 1 ? -3 : 0) + (f === 2 ? 1 : 0);
                for (let k = 0; k < 14; k++) { const t = k / 13; a.e(nx + (hx - nx) * t, 22 - (22 - hy - 3) * t, 2, 1.8, pal, 0.1); }
                a.e(hx, hy, 3.2, 2.6, pal, 0.15); a.p(hx - 1, hy - 1, 0xffe14a); a.p(hx + 1, hy - 1, 0xffe14a);
                a.r(hx - 2, hy + 1, 5, f === 2 ? 2 : 1, f === 2 ? 0x7a1018 : OUT); if (f === 2) { a.p(hx - 2, hy + 1, 0xf4efe2); a.p(hx + 2, hy + 1, 0xf4efe2); }
                a.line(hx - 2, hy - 2, hx - 3, hy - 4, pal[3]); a.line(hx + 2, hy - 2, hx + 3, hy - 4, pal[3]);
            });
            for (let x = 4; x < 25; x += 3) a.p(x, 19 + (x % 2), pal[3]);
        })],
        // QURBAQA QIROL (maxfiy boss): tojli ulkan qurbaqa, so'galli teri
        toadking: [4, (f) => art(28, 22, (a) => {
            const pal = [0x3a4a1a, 0x5a6e26, 0x7a9236, 0x9ab84e], y0 = f === 1 ? 2 : 0;
            a.s(1, 18, 7, 4, pal, -0.2); a.s(20, 18, 7, 4, pal, -0.2);
            a.e(14, 13 + y0 / 2, 12.5, 8 - y0 / 2, pal); a.e(14, 16, 8, 4, [0xc8b87a, 0xe0d49a, 0xf0e8b8], 0.1);
            a.e(8, 5 + y0, 3.4, 3, pal, 0.15); a.e(20, 5 + y0, 3.4, 3, pal, 0.15); a.e(8, 5 + y0, 1.8, 1.8, [0xffc35a, 0xffe14a]); a.e(20, 5 + y0, 1.8, 1.8, [0xffc35a, 0xffe14a]); a.r(8, 4 + y0, 1, 3, OUT); a.r(20, 4 + y0, 1, 3, OUT);
            a.r(5, 11 + y0, 18, f === 2 ? 3 : 1, f === 2 ? 0x7a1018 : OUT); if (f === 2) a.line(14, 12, 27, 13, 0xe86a9a);
            [[4, 14], [9, 9], [21, 10], [24, 15], [12, 19], [17, 8]].forEach(([x, y]) => a.p(x, y + y0 / 2, pal[0]));
            a.s(10, 0 + y0, 8, 2, C.gold, 0.1); for (let x = 10; x < 18; x += 2) a.p(x, y0 - 1 + 0, C.gold[3]); a.p(14, 1 + y0, C.red[2]);
        })],
        hellhound: [4, (f) => beast({ W: 30, H: 16, legH: 4, bodyH: 9, pal: [0x1a0a0a, 0x3a1410, 0x5a2018, 0x7a3020], tail: 0xff7a1a, mane: [0xb3261e, 0xff7a1a, 0xffc35a], eye: 0xffe14a, stripe: 0xff5a1a }, f)]
    };
    // NPC lar: elflar (qirollik) va o'rmon qabilasi (qoramag'iz, yuzi bo'yalgan, pat taqqan)
    const TRIBE = { skin: 0xc98a5a, skinD: 0x9a6440, hood: false, mouth: 0x8a3a2a };
    // qor qabilasi: mo'ynali kapyushon (yuz atrofida oq mo'yna)
    const SNOWT = { skin: 0xe0b48a, skinD: 0xb8865a, hood: false, mouth: 0xb04a3a, headgear: (R) => { R(4, 2, 10, 4, 0x8c6a48); R(3, 4, 2, 6, 0xf4efe2); R(13, 4, 2, 6, 0xf4efe2); R(4, 3, 10, 2, 0xf4efe2); } };
    // yer osti konchilari: chiroqli kaska, soqol
    const MINER = { skin: 0xd09a74, skinD: 0xa87250, hood: false, mouth: 0x8a3a2a, headgear: (R) => { R(4, 3, 10, 3, 0xffb300); R(3, 5, 12, 1, 0xd08a00); R(8, 2, 2, 2, 0xfff2b0); } };
    const SWAMPF = { skin: 0xc8946a, skinD: 0x9a6a46, hood: false, mouth: 0x8a3a2a, headgear: (R) => { R(2, 5, 14, 1, 0xb08a4a); R(4, 4, 10, 1, 0xc8a060); R(6, 3, 6, 1, 0xd8b878); R(8, 2, 2, 1, 0xe8c890); } };
    // SKYLAND aholisi: zamonaviy kiyim (kombinezon, kurtka, oq xalat), naushnik / kepka / ko'zoynak
    const SKYF = { skin: 0xe8b48c, skinD: 0xc08860, hood: false, ears: false, mouth: 0xb04a3a };
    const NPC = {
        sky_engineer: [{ ...SKYF, tunic: 0xff8f00, tunicD: 0xe65100, collar: 0xffe0b2, belt: 0x37474f, headgear: (R) => { R(4, 3, 10, 3, 0x37474f); R(5, 5, 8, 1, 0x40e0ff); } }, 'hammer'],
        sky_pilot: [{ ...SKYF, tunic: 0x1565c0, tunicD: 0x0d47a1, collar: 0xffca28, headgear: (R) => { R(4, 3, 10, 3, 0x5d4037); R(3, 6, 2, 3, 0x212121); R(13, 6, 2, 3, 0x212121); R(4, 3, 10, 1, 0x8d6e63); } }, null],
        sky_scientist: [{ ...SKYF, tunic: 0xeceff1, tunicD: 0xb0bec5, collar: 0x40c4ff, belt: 0xb0bec5, paint: 0x263238, headgear: (R) => { R(4, 3, 10, 3, 0x4e342e); R(4, 5, 2, 2, 0x4e342e); } }, null],
        sky_courier: [{ ...SKYF, skin: 0xc8946a, skinD: 0x9a6a46, tunic: 0xd32f2f, tunicD: 0x9a0007, collar: 0xffffff, headgear: (R) => { R(4, 3, 10, 3, 0x212121); R(11, 5, 5, 1, 0x212121); } }, 'bag'],
        sky_kid: [{ ...SKYF, tunic: 0x7c4dff, tunicD: 0x5e35b1, collar: 0xb39ddb, headgear: (R) => { R(4, 3, 10, 3, 0xffb300); R(4, 5, 1, 2, 0xffb300); } }, null],
        sky_vendor: [{ ...SKYF, skin: 0xd8a47c, skinD: 0xb07c56, tunic: 0x00897b, tunicD: 0x00695c, collar: 0x80cbc4, apron: 0xeceff1, apronD: 0xb0bec5, headgear: (R) => { R(4, 3, 10, 2, 0x00695c); R(11, 5, 5, 1, 0x00695c); } }, 'bag'],
        swamp_fisher: [{ ...SWAMPF, tunic: 0x5d6b3a, tunicD: 0x3e4a26, collar: 0xc5e1a5 }, 'rod'],
        swamp_herbalist: [{ ...SWAMPF, tunic: 0x2e7d32, tunicD: 0x1b5e20, collar: 0xaed581, apron: 0xd7ccc8, apronD: 0xbcaaa4 }, 'basket'],
        swamp_boatman: [{ ...SWAMPF, tunic: 0x4e342e, tunicD: 0x3e2723, collar: 0x8d6e63, beard: 0x5d4037 }, 'oar'],
        swamp_elder: [{ ...SWAMPF, tunic: 0x546e7a, tunicD: 0x37474f, collar: 0xb0bec5, beard: 0xeeeeee }, 'cane'],
        swamp_kid: [{ ...SWAMPF, tunic: 0x9ccc65, tunicD: 0x689f38, collar: 0xf1f8e9 }, null],
        lava_miner: [{ ...MINER, tunic: 0x5d4037, tunicD: 0x3e2723, collar: 0xff7043, beard: 0x6d4c41 }, 'pick'],
        lava_smith: [{ ...MINER, tunic: 0x424242, tunicD: 0x212121, collar: 0xff7043, apron: 0x3e2723, apronD: 0x2a1a14, beard: 0xbf360c, headgear: (R) => { R(5, 3, 8, 3, 0x3e2723); R(4, 5, 10, 1, 0x2a1a14); } }, 'hammer'],
        lava_shaman: [{ ...MINER, skin: 0xb0889a, skinD: 0x8a6476, tunic: 0x4a148c, tunicD: 0x311b92, collar: 0x9a6aff, paint: 0x9a6aff, headgear: (R) => { R(4, 3, 10, 3, 0x311b92); R(3, 5, 2, 4, 0x311b92); R(13, 5, 2, 4, 0x311b92); R(8, 0, 2, 3, 0x9a6aff); } }, 'staff'],
        lava_elder: [{ ...MINER, tunic: 0x616161, tunicD: 0x424242, collar: 0xbdbdbd, beard: 0xeeeeee }, 'cane'],
        lava_kid: [{ ...MINER, tunic: 0xff7043, tunicD: 0xe64a19, collar: 0xffccbc }, null],
        lava_trader: [{ ...MINER, tunic: 0x00695c, tunicD: 0x004d40, collar: 0xffca28, apron: 0xd7ccc8, apronD: 0xbcaaa4, beard: 0x8d6e63 }, 'bag'],
        // TOPSHIRIQ BERUVCHILAR: keksa elf (oltin to'n, oq soqol, o'ram qog'oz) va ona elf (pushti ko'ylak, uzun sariq soch)
        elf_questelf: [{ hat: 0xffd54f, hatD: 0xc9a227, brim: 0xfff3c4, brimD: 0xe0c060, pompom: 0xff7043, tunic: 0x8d6e00, tunicD: 0x5d4800, collar: 0xfff59d, beard: 0xf5f5f5 }, 'cane'],
        elf_motherelf: [{ hood: false, headgear: (R) => { R(4, 3, 10, 3, 0xf2c640); R(3, 5, 2, 8, 0xf2c640); R(13, 5, 2, 8, 0xe0b030); R(5, 2, 8, 1, 0xf8d860); }, tunic: 0xe91e63, tunicD: 0xad1457, collar: 0xf8bbd0, apron: 0xfce4ec, apronD: 0xf8bbd0, mouth: 0xc2185b }, null],
        elf_guard: [{ hat: 0x90a4ae, hatD: 0x607d8b, brim: 0xb0bec5, brimD: 0x78909c, pompom: 0xc62828, tunic: 0x1565c0, tunicD: 0x0d47a1, collar: 0xffca28 }, 'spear'],
        elf_merchant: [{ hat: 0x6a1b9a, hatD: 0x4a148c, tunic: 0x7b1fa2, tunicD: 0x4a148c, collar: 0xffca28, apron: 0xd7ccc8, apronD: 0xbcaaa4 }, 'bag'],
        elf_smith: [{ hat: 0x4e342e, hatD: 0x3e2723, tunic: 0x5d4037, tunicD: 0x3e2723, collar: 0x8d6e63, apron: 0x3e2723, apronD: 0x2a1a14, beard: 0xd7ccc8 }, 'hammer'],
        elf_farmer: [{ hat: 0xf9a825, hatD: 0xf57f17, tunic: 0x558b2f, tunicD: 0x33691e, collar: 0xaed581 }, 'pitch'],
        elf_kid: [{ hat: 0xd84315, hatD: 0xbf360c, tunic: 0xff7043, tunicD: 0xe64a19, collar: 0xffccbc, pompom: 0xffffff }, null],
        forest_hunter: [{ ...TRIBE, tunic: 0x6d4c41, tunicD: 0x4e342e, collar: 0xa1887f, paint: 0xd84315, headgear: (R) => { R(4, 4, 10, 2, 0x3e2723); R(5, 3, 8, 1, 0x5d4037); R(12, 0, 1, 4, 0xf4efe2); R(12, 0, 1, 1, 0xd84a4a); } }, 'bow'],
        forest_shaman: [{ ...TRIBE, tunic: 0x8e1b1b, tunicD: 0x5e1010, collar: 0xffca28, paint: 0xffffff, headgear: (R) => { R(5, 2, 8, 4, 0xf4efe2); R(6, 4, 2, 1, 0xc62f2f); R(10, 4, 2, 1, 0xc62f2f); R(4, 0, 1, 4, 0x56a852); R(13, 0, 1, 4, 0x56a852); R(8, 0, 2, 2, 0xf2c640); } }, 'staff'],
        forest_gatherer: [{ ...TRIBE, tunic: 0x7cb342, tunicD: 0x558b2f, collar: 0xc5e1a5, headgear: (R) => { R(4, 4, 10, 2, 0x33691e); R(6, 3, 2, 1, 0x7cb342); R(10, 3, 2, 1, 0xd84a4a); } }, 'basket'],
        forest_elder: [{ ...TRIBE, skin: 0xb07a52, tunic: 0x757575, tunicD: 0x424242, collar: 0xbdbdbd, beard: 0xeeeeee, headgear: (R) => { R(5, 3, 8, 3, 0xeeeeee); R(4, 5, 2, 3, 0xeeeeee); R(12, 5, 2, 3, 0xeeeeee); } }, 'cane'],
        snow_trapper: [{ ...SNOWT, tunic: 0x6d4c41, tunicD: 0x4e342e, collar: 0xe8e0d0 }, 'spear'],
        snow_shaman: [{ ...SNOWT, tunic: 0x1a5a9a, tunicD: 0x0e3a6a, collar: 0x7ee8ff, paint: 0x3fb6e0, headgear: (R) => { R(4, 3, 10, 3, 0xe8e0d0); R(3, 5, 2, 4, 0xe8e0d0); R(13, 5, 2, 4, 0xe8e0d0); R(4, 0, 1, 3, 0x8c6a48); R(13, 0, 1, 3, 0x8c6a48); R(3, 0, 1, 1, 0x8c6a48); R(14, 0, 1, 1, 0x8c6a48); } }, 'staff'],
        snow_fisher: [{ ...SNOWT, tunic: 0xe65100, tunicD: 0xbf360c, collar: 0xffe0b2 }, 'rod'],
        snow_elder: [{ ...SNOWT, tunic: 0x757575, tunicD: 0x424242, collar: 0xe0e0e0, beard: 0xffffff }, 'cane'],
        snow_kid: [{ ...SNOWT, tunic: 0xc62828, tunicD: 0x8e0000, collar: 0xffcdd2 }, null],
        forest_kid: [{ ...TRIBE, tunic: 0xa1887f, tunicD: 0x6d4c41, collar: 0xd7ccc8, paint: 0x1e88e5, headgear: (R) => { R(5, 4, 8, 2, 0x3e2723); R(9, 2, 1, 2, 0x56a852); } }, null]
    };
    function enemyKey(k, f) { return 'bm_e_' + k + f; }
    // TAYYOR RASMLAR KESHI: dushman / NPC / bezak / o'q / fon rasmlari (o'zgarmas) sahifa davomida bir marta kanvasga chiziladi,
    // har o'yin boshida faqat Phaser'ga ulanadi; lobbida bo'sh vaqtda oldindan (bo'laklab) tayyorlanadi - START tez ishlaydi
    const CANV = new Map(), built = { sprites: false, bg: false };
    const PRE = { textures: { exists: (k) => CANV.has(k), createCanvas: (k, w, h) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; CANV.set(k, cv); const c = cv.getContext('2d'); return { getContext: () => c, refresh() { } }; } } };
    function attachCached(scene) { CANV.forEach((cv, k) => { if (!scene.textures.exists(k)) scene.textures.addImage(k, cv); }); }   // addImage - piksellarni qayta o'qimaydi (addCanvas sekin)
    function buildSprites(scene) { if (!built.sprites) { buildSpritesRaw(PRE); built.sprites = true; } attachCached(scene); }
    function buildBackground(scene) { if (!built.bg) { buildBackgroundRaw(PRE); built.bg = true; } attachCached(scene); }
    function prebuild() {
        if (built.sprites && built.bg) return;
        const jobs = [], E = PRE.textures.exists;
        Object.entries(ENEMY).forEach(([k, [P, draw, n]]) => { for (let f = 0; f < (n || 3); f++) jobs.push(() => { if (!E(enemyKey(k, f))) tex(PRE, enemyKey(k, f), draw(f), P); }); });
        Object.entries(NPC).forEach(([k, [st, item]]) => [0, 1].forEach(f => jobs.push(() => { if (!E('bm_n_' + k + f)) tex(PRE, 'bm_n_' + k + f, elfLike(st, f, item), k.endsWith('kid') ? 2 : 3); })));
        Object.entries(PROPS).forEach(([k, [w, h, P, draw, outline]]) => jobs.push(() => { if (!E('bm_p_' + k)) tex(PRE, 'bm_p_' + k, art(w, h, draw, outline === null ? null : OUT), P); }));
        jobs.push(() => { if (!built.sprites) { buildSpritesRaw(PRE); built.sprites = true; } });
        jobs.push(() => { if (!built.bg) { buildBackgroundRaw(PRE); built.bg = true; } });
        const run = () => { const t = performance.now(); while (jobs.length && performance.now() - t < 10) { try { jobs.shift()(); } catch (e) { jobs.length = 0; } } if (jobs.length) next(); };
        const next = () => (window.requestIdleCallback ? window.requestIdleCallback(run, { timeout: 600 }) : setTimeout(run, 40));
        next();
    }
    function buildSpritesRaw(scene) {
        tex(scene, 'bm_tv', tvArt(), 2); [1, 2, 3, 4].forEach(k => tex(scene, 'bm_tvs_' + k, tvScreen(k), 2));   // Mr. Who maydoni
        Object.entries(ENEMY).forEach(([k, [P, draw, n]]) => { for (let f = 0; f < (n || 3); f++) if (!scene.textures.exists(enemyKey(k, f))) tex(scene, enemyKey(k, f), draw(f), P); });
        Object.entries(NPC).forEach(([k, [st, item]]) => [0, 1].forEach(f => { if (!scene.textures.exists('bm_n_' + k + f)) tex(scene, 'bm_n_' + k + f, elfLike(st, f, item), k.endsWith('kid') ? 2 : 3); }));
        Object.entries(PROPS).forEach(([k, [w, h, P, draw, outline]]) => { if (!scene.textures.exists('bm_p_' + k)) tex(scene, 'bm_p_' + k, art(w, h, draw, outline === null ? null : OUT), P); });
        // dushman o'qlari (o'ngga qaragan - klient burchakka buradi) va yerdan otilib chiqadigan tikan / ildiz
        tex(scene, 'bm_sh_arrow', art(12, 3, (a) => { a.r(0, 1, 10, 1, C.wood[3]); a.roof(11, 0, 3, 1, 1, C.iron); a.r(10, 0, 2, 3, C.iron[3]); a.r(0, 0, 2, 1, 0xf4efe2); a.r(0, 2, 2, 1, 0xf4efe2); }), 2);
        // T-REX1000 OLOVI: piksel olov sharlari (nur bo'ylab oqib chiqadi) - markazi oq-sariq, chetiga qizil, Bayer bilan; konturisiz
        const FIRE = [0x5a0c08, 0xa81c10, 0xe8401c, 0xff8a00, 0xffd54f, 0xfff4c0];
        [[5, 0], [8, 1], [11, 2], [15, 3]].forEach(([s, id]) => [0, 1].forEach((vi) => tex(scene, 'bm_fx_rexfire' + id + (vi ? 'b' : 'a'), art(s, s, (a) => {
            const c = (s - 1) / 2;
            for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
                const r = Math.hypot((x - c) / (c + 0.5), (y - c) / (c + 0.5)) + (hash(x, y, s * 13 + vi * 7) - 0.5) * 0.45;
                if (r > 1) continue;
                a.p(x, y, shade(1.02 - r * 0.95, x + vi, y, FIRE));
            }
        }, null), 4)));
        // QORA RITSAR: katta qilich (dastasi chapda), SHARPA (binafsha arvoh-o'roq), shaxmat poli / devori, dialog portreti
        tex(scene, 'bm_bk_sword', art(50, 7, (a) => { a.r(0, 2, 6, 3, 0x2a1a10); a.r(0, 2, 6, 1, 0x4a3020); a.s(6, 0, 3, 7, [0x1c1c26, 0x3a3a48, 0x5a5a6e], 0.1); a.r(9, 2, 37, 3, 0x14141c); a.r(9, 2, 37, 1, 0x4a4a5e); a.r(9, 4, 37, 1, 0x8a0f14); a.roof(47, 2, 1, 1, 1, [0x14141c]); a.r(46, 3, 3, 1, 0x2e2e3c); a.p(48, 3, 0xb71c1c); a.p(2, 3, 0x9575cd); }), 3);
        tex(scene, 'bm_sh_bkghost', art(16, 20, (a) => { for (let y = 0; y < 20; y++) for (let x = 0; x < 16; x++) { const d1 = Math.hypot((x - 4) / 11, (y - 9.5) / 9.5), d2 = Math.hypot((x - 0.5) / 10, (y - 9.5) / 8.2); if (d1 > 1 || d2 <= 1) continue; a.p(x, y, shade(1.05 - (1 - d1) * 1.6, x, y, [0x2a0a4a, 0x6a1aa8, 0xb388ff, 0xf0e0ff])); } }), 3);
        tex(scene, 'bm_chessfloor', art(24, 7, (a) => { for (let x = 0; x < 24; x++) for (let y = 0; y < 7; y++) { const wht = x < 12, pal = wht ? [0x9a9aae, 0xc8c8d8, 0xe6e6f0, 0xffffff] : [0x08080c, 0x14141c, 0x24242e, 0x3a3a48]; a.p(x, y, shade(0.85 - y / 9 - (x % 12) / 40, x, y, pal)); } a.r(0, 0, 24, 1, 0x6e6e86); a.r(11, 0, 1, 7, 0x2e2e3c); a.r(23, 0, 1, 7, 0x2e2e3c); }, null), 4);
        tex(scene, 'bm_chesswall', art(24, 24, (a) => { for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) { const dark = (x < 12) !== (y < 12); a.p(x, y, shade(0.7 - (y % 12) / 30, x, y, dark ? [0x0e0c14, 0x16131e, 0x1e1a28] : [0x24203a, 0x2e2946, 0x383254])); } for (let k = 0; k < 24; k++) { a.p(k, 0, 0x0a0810); a.p(0, k, 0x0a0810); a.p(k, 12, 0x0a0810); a.p(12, k, 0x0a0810); } }, null), 4);
        tex(scene, 'bm_bk_face', art(18, 13, (a) => { a.s(2, 0, 14, 13, [0x0e0e14, 0x1c1c26, 0x2e2e3c, 0x4a4a5e], 0.12); a.r(4, 5, 10, 2, 0x050508); a.r(5, 5, 3, 1, 0xff1744); a.r(10, 5, 3, 1, 0xff1744); a.r(8, 8, 2, 4, 0x050508); a.roof(9, 0, 3, 1, 4, [0x6a0010, 0x9a1020, 0xc0303a]); }), 6);
        tex(scene, 'bm_sh_rspike', art(18, 5, (a) => { a.r(0, 1, 11, 3, 0x4c5b70); a.r(0, 1, 11, 1, 0x7b8da6); a.roof(14, 0, 1, 1, 1, [0xa81c10]); a.r(11, 1, 3, 3, 0xa81c10); a.r(14, 2, 3, 1, 0xff9a5a); a.p(17, 2, 0xfff4c0); a.r(0, 0, 2, 5, 0x2f3a49); }), 2);
        tex(scene, 'bm_sh_orb', art(8, 8, (a) => a.e(3.5, 3.5, 3.6, 3.6, [0x4a148c, 0x7c4dff, 0xb388ff, 0xf0e0ff], 0.25)), 2);
        tex(scene, 'bm_sh_dark', art(10, 10, (a) => { a.e(4.5, 4.5, 4.6, 4.6, [0x0a0414, 0x2a0a4a, 0x6a1aa8, 0xd8a8ff], 0.2); a.p(3, 3, 0xffffff); a.p(8, 1, 0x9a4aff); a.p(1, 8, 0x9a4aff); }), 2);
        // ROBOT ILON MINASI (S1 dagidek): temir disk, qizil chiroq (yerda yotganda lipillaydi)
        // O'RMON o'qlari: nayza (uzun, uchi temir), tikanli olma, tikan
        tex(scene, 'bm_sh_spear', art(24, 5, (a) => { a.r(0, 2, 19, 1, C.wood[2]); a.r(0, 3, 19, 1, C.wood[1]); a.r(19, 1, 3, 3, FH.steel[2]); a.p(22, 2, FH.steel[3]); a.p(23, 2, FH.steel[3]); a.p(1, 1, 0xd84a4a); a.p(1, 4, 0xd84a4a); }), 2);
        tex(scene, 'bm_sh_tapple', art(13, 13, (a) => { a.e(6, 7, 4.4, 4.2, BT.apple, 0.2); a.p(5, 5, 0xffb0a0); [[6, 1], [1, 7], [11, 7], [2, 3], [10, 3], [3, 11], [9, 11]].forEach(([x, y]) => a.p(x, y, 0xd8d0b0)); a.r(6, 1, 1, 2, 0x2a541a); a.p(7, 2, 0x4a8c38); }), 2);
        tex(scene, 'bm_sh_thorn', art(8, 3, (a) => { a.r(0, 1, 6, 1, 0x7a6a40); a.p(6, 1, 0xd8d0b0); a.p(7, 1, 0xf2ead0); a.p(2, 0, 0x5a4a2a); }), 2);
        tex(scene, 'bm_sh_mine', art(12, 7, (a) => { a.e(5.5, 4.5, 5.6, 2.6, C.iron, 0.1); a.r(1, 4, 10, 1, C.iron[1]); a.r(5, 0, 2, 2, C.iron[2]); a.p(5, 1, 0xff1744); a.p(6, 1, 0xff5252); }), 3);
        tex(scene, 'bm_sh_mine_lit', art(12, 7, (a) => { a.e(5.5, 4.5, 5.6, 2.6, C.iron, 0.1); a.r(1, 4, 10, 1, C.iron[1]); a.r(4, 0, 4, 2, 0xff5252); a.p(5, 0, 0xffffff); }), 3);
        tex(scene, 'bm_sh_fire', art(10, 8, (a) => { a.e(6, 4, 3.6, 3.4, [0xb3261e, 0xff7a1a, 0xffc35a, 0xfff2b0], 0.25); a.r(0, 3, 3, 2, 0xff7a1a); a.p(1, 2, 0xffc35a); }), 2);
        tex(scene, 'bm_sh_spore', art(8, 8, (a) => { a.e(3.5, 3.5, 3.4, 3.4, [0x2e6a1a, 0x5fd45a, 0x9cff6e, 0xe0ffd0], 0.2); a.p(2, 2, 0xffffff); }), 2);
        tex(scene, 'bm_sh_web', art(10, 10, (a) => { a.line(0, 0, 9, 9, 0xe6e6f0); a.line(9, 0, 0, 9, 0xe6e6f0); a.r(0, 4, 10, 1, 0xe6e6f0); a.r(4, 0, 1, 10, 0xe6e6f0); a.e(4.5, 4.5, 2.5, 2.5, [0xb0b0c0, 0xf4f4ff]); }, 0x3a3a4a), 2);
        tex(scene, 'bm_sh_rock', art(10, 9, (a) => { a.e(5, 4.5, 4.8, 4.2, C.stone, 0.1); a.p(3, 3, C.stone[4]); a.p(6, 6, C.stone[0]); }), 3);
        tex(scene, 'bm_sh_shock', art(14, 8, (a) => { for (let x = 0; x < 14; x++) { const h = Math.round(3 + 3 * Math.sin(x / 13 * Math.PI)); a.r(x, 8 - h, 1, h, x % 2 ? 0xffd54f : 0xffe9a0); } }), 3);
        tex(scene, 'bm_hz_spikes', art(20, 16, (a) => { for (let k = 0; k < 5; k++) a.roof(2 + k * 4, 2 + (k % 2) * 3, 14 - (k % 2) * 3, 1, 4, C.stone); }), 3);
        tex(scene, 'bm_sh_snow', art(8, 8, (a) => { a.e(3.5, 3.5, 3.6, 3.6, [0xa8c8e4, 0xd8ecfa, 0xffffff], 0.25); }), 2);
        // QOR BAZASI: muzli qor to'pi (qor bola), sovg'a qutisi (pilik yonganda - qizil), shayba, Bigfutning ulkan qor to'pi va mushti, Qor Boboning chanasi
        tex(scene, 'bm_sh_icesnow', art(9, 9, (a) => { a.e(4, 4, 4, 4, SN.snow, 0.2); a.p(2, 3, SN.ice[2]); a.p(5, 2, SN.ice[3]); a.p(6, 5, SN.ice[1]); a.p(3, 6, SN.ice[2]); }), 2);
        const giftG = (lit) => art(11, 11, (a) => { a.s(0, 3, 11, 8, lit ? C.red : [0x0f5a2a, 0x1a8a3a, 0x36b858, 0x7ae08a], 0.1); a.r(0, 2, 11, 2, lit ? C.red[3] : 0x36b858); a.r(5, 2, 2, 9, C.gold[3]); a.r(0, 6, 11, 1, C.gold[2]); a.line(5, 2, 2, 0, C.gold[3]); a.line(6, 2, 9, 0, C.gold[3]); if (lit) a.p(5, 0, 0xfff2b0); });
        tex(scene, 'bm_sh_gift', giftG(false), 3); tex(scene, 'bm_sh_gift_lit', giftG(true), 3);
        // MR. HOL: pushka toshi va yerdan otilgan parma (uchi o'ngga - uchish yo'nalishiga buriladi)
        tex(scene, 'bm_sh_hrock', art(9, 8, (a) => { a.e(4, 4, 4, 3.5, [0x2a2430, 0x4a4250, 0x6a6270, 0x8a8290], 0.2); a.p(3, 2, 0xb0a8b8); a.p(6, 5, 0x2a2430); }), 3);
        tex(scene, 'bm_sh_drill', art(18, 8, (a) => { a.s(0, 1, 9, 6, [0x3a2a1a, 0x6d4c41, 0x8d6e63, 0xbca08a], 0.1); for (let k = 0; k < 9; k++) { const w = Math.round(3 - k * 0.33); a.r(9 + k, 4 - w, 1, w * 2, [0x646c76, 0x9aa3ad, 0xcfd8dc][k % 3]); } a.line(10, 2, 16, 4, 0x3d434b); a.line(10, 5, 16, 4, 0x3d434b); a.p(17, 4, 0xffffff); }), 3);
        // FIERY HOOVES: olovli shox (aylanib uchadi)
        tex(scene, 'bm_sh_antler', art(14, 9, (a) => { a.line(0, 7, 12, 2, 0xd84300); a.line(1, 7, 13, 2, 0xff9a1a); a.line(5, 5, 6, 0, 0xff9a1a); a.line(9, 4, 11, 0, 0xff9a1a); a.p(6, 0, 0xfff0a0); a.p(11, 0, 0xfff0a0); a.p(13, 1, 0xfff0a0); a.p(2, 8, 0xffd23f); }), 3);
        tex(scene, 'bm_sh_puck', art(12, 5, (a) => { a.r(0, 1, 12, 4, 0x3a86b8); a.r(0, 0, 12, 2, 0x9ad8f0); a.r(1, 0, 10, 1, 0xe8fbff); a.r(1, 4, 10, 1, 0x1e5a86); a.p(3, 2, 0xffffff); a.p(8, 1, 0xffffff); }, 0x0b2a44), 2);   // MUZ SHAYBA
        // BALOT MAGINING YASHIL SFERASI: ildiz bilan o'ralgan yonib turgan shar
        tex(scene, 'bm_sh_greenorb', art(12, 12, (a) => { a.e(5.5, 5.5, 5.4, 5.4, [0x1b5e20, 0x43a047, 0x9cff6e, 0xe0ffd0], 0.25); a.line(1, 4, 10, 7, 0x5d4037); a.line(3, 10, 8, 1, 0x6d4c41); a.p(4, 3, 0xffffff); }, 0x0a2a0a), 3);
        // BIGFUT SO'LAGI: yopishqoq oq-havorang tomchi (orqasida ingichka iz), ichida pufakchalar
        tex(scene, 'bm_sh_bfspit', art(12, 9, (a) => { a.e(7.5, 4.5, 4.2, 3.6, [0x9ec4dc, 0xcfe6f4, 0xeef8ff, 0xffffff], 0.2); a.r(0, 4, 4, 1, 0xcfe6f4); a.r(2, 3, 2, 1, 0xeef8ff); a.p(1, 5, 0x9ec4dc); a.p(6, 3, 0xffffff); a.p(9, 5, 0x9ec4dc); a.p(8, 3, 0xffffff); }, 0x1a3048), 2);
        tex(scene, 'bm_sh_bigsnow', art(16, 16, (a) => { a.e(8, 8, 7.6, 7.6, SN.snow, 0.12); [[4, 10], [11, 5], [10, 12]].forEach(([x, y]) => a.e(x, y, 1.6, 1.3, [0x9ab8d8, 0xb8d0e8])); a.p(5, 4, SN.ice[3]); a.p(12, 9, SN.ice[2]); }), 3);
        tex(scene, 'bm_bf_fist', art(26, 20, (a) => { furBlob(a, 13, 9, 11, 8, 0.05); for (let k = 0; k < 4; k++) { a.s(3 + k * 5, 13, 4, 5, BF.metal, 0.1); a.p(4 + k * 5, 14, BF.metal[4]); } }), 3);
        tex(scene, 'bm_sleigh', art(64, 24, (a) => {
            a.s(2, 10, 22, 8, SAN.suit, 0.05); a.r(2, 10, 22, 1, C.gold[3]); a.r(2, 17, 22, 1, C.gold[2]); a.s(0, 6, 4, 12, SAN.suit, 0.1);
            a.line(1, 21, 24, 21, C.gold[2]); a.line(24, 21, 27, 18, C.gold[2]); a.r(5, 18, 1, 3, C.gold[1]); a.r(19, 18, 1, 3, C.gold[1]);
            [[7, 5, C.green], [13, 4, C.blue], [18, 6, C.purple]].forEach(([x, y, pal]) => { a.s(x, y, 5, 6, pal, 0.1); a.r(x + 2, y, 1, 6, C.gold[3]); a.r(x, y + 2, 5, 1, C.gold[3]); });
            a.line(24, 12, 40, 12, C.leather[2]);
            [[42, 0], [54, -1]].forEach(([x, o]) => {   // ROBOT BUG'ULAR: temir tana, oltin shoxlar, qizil burun
                a.e(x, 12 + o, 6, 3.2, SAN.metal, 0.1);
                a.line(x - 4, 14 + o, x - 7, 20, SAN.metal[1]); a.line(x - 2, 14 + o, x - 1, 20, SAN.metal[2]); a.line(x + 3, 14 + o, x + 6, 19, SAN.metal[1]); a.line(x + 5, 14 + o, x + 9, 18, SAN.metal[2]);
                a.line(x + 5, 11 + o, x + 7, 7 + o, SAN.metal[2]); a.e(x + 8, 6 + o, 2.4, 1.8, SAN.metal, 0.15); a.p(x + 10, 6 + o, 0xff2a2a);
                a.line(x + 7, 5 + o, x + 6, 1 + o, C.gold[2]); a.line(x + 6, 2 + o, x + 4, 1 + o, C.gold[2]); a.line(x + 8, 5 + o, x + 10, 1 + o, C.gold[2]); a.p(x + 8, 5 + o, SN.glow);
            });
        }), 3);
        tex(scene, 'bm_sh_ice', art(12, 4, (a) => { a.r(0, 1, 9, 2, 0x7ac4e6); a.roof(10.5, 0, 4, 1, 1, [0xe8fbff]); a.r(9, 1, 3, 2, 0xe8fbff); a.r(1, 1, 7, 1, 0xc0ecff); }, 0x0b2a44), 2);
        tex(scene, 'bm_hz_ice', art(20, 18, (a) => { const pal = [0x2a6a9a, 0x5ab0d8, 0x9ad8f0, 0xe8fbff]; for (let k = 0; k < 5; k++) a.roof(2 + k * 4, 1 + (k % 2) * 4, 17 - (k % 2) * 4, 1, 4, pal); }, 0x0b2a44), 3);
        tex(scene, 'bm_i_snow', art(12, 12, (a) => { a.e(5.5, 5.5, 5.4, 5.4, [0xa8c8e4, 0xd8ecfa, 0xf0f8ff, 0xffffff], 0.25); a.p(4, 3, 0xffffff); }), 3);
        tex(scene, 'bm_sh_acid', art(8, 8, (a) => { a.e(3.5, 3.5, 3.6, 3.4, [0x2e7d1a, 0x5fd42a, 0xb8ff5a, 0xeaffc8], 0.25); a.p(2, 2, 0xffffff); }), 2);
        tex(scene, 'bm_sh_ink', art(8, 8, (a) => { a.e(3.5, 3.5, 3.6, 3.6, [0x0a0a14, 0x1a1a2e, 0x2e2e4a, 0x4a4a6a], 0.2); a.p(2, 2, 0x8a8aaa); }), 2);
        tex(scene, 'bm_sh_bomb', art(10, 10, (a) => { a.e(4.5, 5.5, 4.4, 4.2, C.dark, 0.2); a.r(4, 0, 2, 2, C.wood[2]); a.p(5, 0, 0xff7a1a); a.p(3, 4, 0x8a8aaa); }), 3);
        tex(scene, 'bm_hz_tentacle', art(20, 24, (a) => { const pal = [0x4a1458, 0x7a2a8a, 0xa84ab8, 0xd88ae0]; for (let k = 0; k < 2; k++) { const x0 = 5 + k * 9; for (let y = 0; y < 24; y++) { const w = 2 + Math.round(y / 8); for (let x = 0; x < w; x++) a.p(x0 + x + Math.round(Math.sin(y / 3 + k) * 2), y, pal[1 + (x === 0 ? 1 : 0)]); if (y % 4 === 2) a.p(x0 + Math.round(Math.sin(y / 3 + k) * 2), y, pal[3]); } } }), 3);
        // BOSS O'QLARI
        tex(scene, 'bm_sh_boulder', art(16, 16, (a) => { a.e(8, 8, 7.6, 7.6, C.stone, 0.05); a.line(3, 6, 8, 9, C.stone[0]); a.line(8, 9, 12, 5, C.stone[0]); a.line(8, 9, 9, 14, C.stone[0]); a.e(5, 5, 1.6, 1.2, [C.stone[4]]); a.p(12, 11, C.moss[3]); }), 3);
        tex(scene, 'bm_sh_snowboulder', art(16, 16, (a) => { a.e(8, 8, 7.6, 7.6, [0xa8c8e4, 0xcce2f4, 0xe8f4ff, 0xffffff], 0.1); [[4, 10], [11, 4], [10, 12]].forEach(([x, y]) => a.e(x, y, 1.6, 1.3, [0x9ab8d8, 0xb8d0e8])); a.p(5, 4, C.wood[2]); a.p(12, 9, C.stone[2]); }), 3);
        tex(scene, 'bm_sh_gbomb', art(11, 12, (a) => { a.e(5, 7, 4.6, 4.6, C.dark, 0.25); a.r(4, 1, 2, 2, C.wood[2]); a.line(5, 1, 7, 0, C.wood[1]); a.p(8, 0, 0xffc35a); a.p(3, 5, 0x8a8aaa); a.e(5, 8, 1.6, 1.2, C.bone, 0.2); a.p(4, 8, OUT); a.p(6, 8, OUT); }), 3);
        tex(scene, 'bm_sh_gbomb_lit', art(11, 12, (a) => { a.e(5, 7, 4.6, 4.6, C.red, 0.25); a.r(4, 1, 2, 2, C.wood[2]); a.p(7, 0, 0xfff2b0); a.p(8, 0, 0xffc35a); a.e(5, 8, 1.6, 1.2, C.bone, 0.2); a.p(4, 8, OUT); a.p(6, 8, OUT); }), 3);
        tex(scene, 'bm_sh_crescent', art(12, 22, (a) => { for (let y = 0; y < 22; y++) { const t = (y - 10.5) / 10.5, x0 = Math.round(6 * (1 - Math.sqrt(1 - t * t)) + 1), w = Math.max(1, Math.round(5 * Math.sqrt(1 - t * t))); for (let x = x0; x < x0 + w; x++) a.p(x, y, x === x0 + w - 1 ? 0xf0d8ff : shade(0.85 - Math.abs(t) * 0.4, x, y, C.soul)); } }, 0x14062a), 3);
        tex(scene, 'bm_sh_skull', art(12, 12, (a) => { a.e(6, 6, 5.6, 5.6, C.soul, 0.1); a.e(6, 6, 3.6, 3.4, C.bone, 0.15); a.r(4, 5, 1, 2, OUT); a.r(7, 5, 1, 2, OUT); a.p(4, 5, 0x9a6aff); a.p(7, 5, 0x9a6aff); a.r(5, 8, 2, 1, OUT); }), 3);
        tex(scene, 'bm_sh_fugu', art(13, 11, (a) => { a.e(6, 5.5, 5, 4, [0x8a6a1a, 0xc8a02a, 0xf2d050, 0xfff0a0], 0.1); for (let k = 0; k < 6; k++) { const ang = k / 6 * Math.PI * 2; a.p(6 + Math.cos(ang) * 5.6, 5.5 + Math.sin(ang) * 4.6, 0x5a4a1a); } a.p(9, 4, OUT); a.r(0, 4, 2, 3, 0xc8a02a); a.p(11, 6, 0xd84a4a); }), 3);
        tex(scene, 'bm_sh_fugu_big', art(18, 18, (a) => { a.e(9, 9, 8, 8, [0x8a6a1a, 0xc8a02a, 0xf2d050, 0xfff0a0], 0.15); for (let k = 0; k < 12; k++) { const ang = k / 12 * Math.PI * 2; a.line(9 + Math.cos(ang) * 7, 9 + Math.sin(ang) * 7, 9 + Math.cos(ang) * 9, 9 + Math.sin(ang) * 9, 0x5a4a1a); } a.r(11, 6, 2, 2, OUT); a.r(5, 6, 2, 2, OUT); a.r(7, 12, 4, 1, 0xd84a4a); }), 3);
        tex(scene, 'bm_sh_missile', art(16, 6, (a) => { a.s(3, 1, 10, 4, C.iron, 0.1); a.roof(14, 1, 2, 4, 1, [0xc62f2f]); a.r(13, 2, 2, 2, C.red[2]); a.r(4, 0, 3, 1, C.iron[1]); a.r(4, 5, 3, 1, C.iron[1]); a.r(0, 2, 3, 2, 0xffc35a); a.p(0, 1, 0xff7a1a); }), 2);
        tex(scene, 'bm_sh_cannon', art(9, 9, (a) => { a.e(4, 4, 4, 4, [0x14141c, 0x2a2a36, 0x44445a, 0x6a6a80], 0.2); a.p(2, 2, 0x9a9ab0); }), 3);
        tex(scene, 'bm_sh_iceboulder', art(14, 13, (a) => { const pal = [0x2a6a9a, 0x4a9ac8, 0x7ac4e6, 0xc0ecff]; a.e(7, 7, 6.5, 5.6, pal, 0.1); a.line(3, 4, 7, 7, 0xe8fbff); a.line(7, 7, 10, 3, pal[0]); a.p(4, 3, 0xffffff); }), 3);
        tex(scene, 'bm_sh_flame', art(16, 14, (a) => { for (let x = 0; x < 16; x++) { const h = Math.round(5 + 8 * Math.sin(x / 15 * Math.PI) + (x % 3)); for (let y = 14 - h; y < 14; y++) a.p(x, y, y < 14 - h + 3 ? 0xffc35a : y < 14 - h / 2 ? 0xff7a1a : 0xb3261e); } }, 0x5a0c06), 3);
        tex(scene, 'bm_sh_mudwave', art(16, 9, (a) => { for (let x = 0; x < 16; x++) { const h = Math.round(3 + 5 * Math.sin(x / 15 * Math.PI)); for (let y = 9 - h; y < 9; y++) a.p(x, y, y === 9 - h ? 0x8a9a5a : shade(0.7 - (y - 9 + h) / 9, x, y, C.mud)); } }), 3);
        // TEPADAN TUSHADIGANLAR (maydon "fall:" - pastda soya, oxirida buyum tushadi)
        tex(scene, 'bm_fall_log', art(30, 9, (a) => { a.s(0, 1, 27, 8, C.bark); a.r(0, 1, 27, 1, C.bark[3]); a.e(27, 5, 3, 4, [0x8c6a48, 0xb8936a, 0xd8b88f]); a.p(27, 5, C.bark[1]); a.e(8, 0.5, 2.4, 1, C.leafF); }), 3);
        tex(scene, 'bm_fall_icicle', art(9, 24, (a) => { for (let y = 0; y < 24; y++) { const w = Math.max(1, Math.round(4 * (1 - y / 24))); for (let x = 4 - w; x <= 4 + w - (y > 18 ? 1 : 0); x++) a.p(x, y, x === 4 - w ? 0xe8fbff : y > 16 ? 0x9ad8f0 : 0x5ab0d8); } }, 0x0b2a44), 3);
        tex(scene, 'bm_fall_meteor', art(14, 22, (a) => { for (let y = 0; y < 12; y++) { const w = Math.round(y / 3); for (let x = 7 - w; x <= 7 + w; x++) a.p(x, y, y < 5 ? 0xffc35a : 0xff7a1a); } a.e(7, 15, 6, 6, C.basalt, 0.05); a.line(3, 15, 8, 12, 0xff5a1a); a.line(8, 12, 11, 17, 0xff7a1a); a.p(7, 14, 0xffc35a); }), 3);
        tex(scene, 'bm_fall_acid', art(9, 13, (a) => { for (let y = 0; y < 13; y++) { const w = y < 6 ? Math.round(y / 2) : Math.round(4 - Math.max(0, y - 9) * 1); for (let x = 4 - w; x <= 4 + w; x++) a.p(x, y, shade(0.8 - y / 20, x, y, C.toxic)); } a.p(3, 6, 0xffffff); }, 0x1a3a08), 3);
        tex(scene, 'bm_fall_snow', art(16, 11, (a) => { a.e(8, 6, 7.6, 4.6, [0xa8c8e4, 0xcce2f4, 0xe8f4ff, 0xffffff], 0.1); a.e(5, 4, 2, 1.6, [0xffffff]); a.p(11, 7, 0x9ab8d8); }), 3);
        // YERDAN USTUNLAR (maydon "pillar:")
        tex(scene, 'bm_hz_void', art(16, 34, (a) => { for (let y = 0; y < 34; y++) { const w = 3 + Math.round((y / 34) * 4 + Math.sin(y / 2.5) * 1.2); for (let x = 8 - w; x < 8 + w; x++) a.p(x, y, Math.abs(x - 7.5) < w * 0.35 ? (y < 8 ? 0xf0d8ff : 0x9a6aff) : y < 6 ? 0x9a6aff : 0x45186e); } a.r(1, 32, 14, 2, 0x1a0a30); }, 0x0a0418), 3);
        tex(scene, 'bm_hz_bonewall', art(10, 40, (a) => { a.s(3, 3, 4, 35, C.bone, 0.1); for (let y = 6; y < 38; y += 8) { a.r(2, y, 6, 2, C.bone[1]); a.p(1, y, C.bone[2]); a.p(8, y, C.bone[2]); } a.e(5, 2.5, 2.6, 2.4, C.bone, 0.15); a.p(4, 2, OUT); a.p(6, 2, OUT); }), 3);
        tex(scene, 'bm_hz_burst', art(30, 30, (a) => { for (let k = 0; k < 7; k++) { const x = 3 + k * 4, h = 10 + ((k * 7) % 5) * 4; a.roof(x, 30 - h, h, 1, 4 + (k % 2), k % 3 ? C.stone : C.mud); } for (let k = 0; k < 9; k++) a.e(4 + (k * 13) % 24, 6 + (k * 7) % 14, 1.6, 1.4, k % 2 ? C.mud : C.stone, 0.1); a.r(0, 28, 30, 2, C.mud[0]); }), 3);
        tex(scene, 'bm_tentacle', art(14, 62, (a) => { const pal = [0x5a1440, 0x8a2a66, 0xb84a8a, 0xe07ab0]; for (let y = 0; y < 62; y++) { const w = Math.max(1.5, 6 - (y / 62) * 4.2); const cx = 7 + Math.sin(y / 9) * 1.6; for (let x = Math.round(cx - w); x <= Math.round(cx + w); x++) a.p(x, y, shade(0.85 - (x - cx + w) / (w * 3), x, y, pal)); if (y % 6 === 3) a.p(Math.round(cx + w - 1), y, 0xf8c8dc); } }), 4);
        // ZARBA IZLARI (maydon "slash:")
        const slashG = (pal) => art(34, 14, (a) => { for (let x = 0; x < 34; x++) { const t = x / 33, y0 = Math.round(10 - Math.sin(t * Math.PI) * 9), th = Math.max(1, Math.round(Math.sin(t * Math.PI) * 4)); for (let y = y0; y < y0 + th; y++) a.p(x, y, y === y0 ? pal[3] : pal[1 + ((x + y) % 2)]); } }, null);
        tex(scene, 'bm_slash_dark', slashG([0x14062a, 0x45186e, 0x7c4dff, 0xe8d8ff]), 4);
        tex(scene, 'bm_slash_ice', slashG([0x0b2a44, 0x5ab0d8, 0x9ad8f0, 0xffffff]), 4);
        tex(scene, 'bm_slash_soul', slashG([0x2a0d55, 0x9a6aff, 0xd8c8ff, 0xffffff]), 4);
        tex(scene, 'bm_slash_rock', slashG([0x2a2622, 0x6d6458, 0xa89c8c, 0xf0e8d8]), 4);   // gorilla shapalog'i (tosh)
        tex(scene, 'bm_slash_tail', slashG([0x1e3a1a, 0x4a7034, 0x6a9048, 0xc5e1a5]), 4);
        // o'rgimchak tuxumi (yoriladi), parashyut, siyoh dog'i
        tex(scene, 'bm_parachute', art(26, 14, (a) => { for (let x = 0; x < 26; x++) { const h = Math.round(Math.sin(x / 25 * Math.PI) * 6); for (let y = 6 - h; y < 7; y++) a.p(x, y, Math.floor(x / 4) % 2 ? 0xd84315 : 0xf4efe2); } a.line(1, 7, 12, 13, 0x8a8a8a); a.line(24, 7, 14, 13, 0x8a8a8a); a.line(13, 7, 13, 13, 0x8a8a8a); }), 3);
        tex(scene, 'bm_sh_fish', art(11, 6, (a) => { a.e(5, 2.5, 4.4, 2.2, [0x2a5a7a, 0x4a86a8, 0x7ab4d0, 0xc0e0f0], 0.15); a.r(0, 1, 1, 3, 0x2a5a7a); a.p(1, 2, 0x4a86a8); a.p(8, 2, OUT); a.r(4, 0, 3, 1, 0x2a5a7a); }), 3);
        tex(scene, 'bm_hz_geyser', art(16, 30, (a) => { for (let y = 0; y < 30; y++) { const w = 2 + Math.round((y / 30) * 4 + Math.sin(y / 2) * 1); for (let x = 8 - w; x < 8 + w; x++) a.p(x, y, Math.abs(x - 7.5) < w * 0.4 ? 0xffffff : y < 6 ? 0xd8f4ff : 0x7ac8e8); } [[3, 2], [12, 4], [2, 9], [13, 12]].forEach(([x, y]) => a.p(x, y, 0xd8f4ff)); a.r(2, 28, 12, 2, 0x3a8ab0); }, 0x0e3a52), 3);
        tex(scene, 'bm_hz_gas', art(20, 26, (a) => { [[10, 20, 8, 5], [7, 14, 5, 4], [13, 11, 5, 4], [9, 6, 4, 3.4], [11, 2, 3, 2.2]].forEach(([x, y, rx, ry]) => a.e(x, y, rx, ry, C.toxic, 0.1)); [[6, 18], [13, 15], [9, 8]].forEach(([x, y]) => a.p(x, y, 0xffffff)); }, 0x1a3a08), 3);
        // botqoq: loy ko'li, kraken ko'li suvi, pastdagi botqoq "dengizi", tuman
        tex(scene, 'bm_bog', art(32, 8, (a) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 32; x++) a.p(x, y, y === 0 ? 0x6e7a3a : shade(0.55 + 0.25 * Math.sin((x + y * 2) / 4) - y * 0.05, x, y, [0x221a10, 0x3a2c1a, 0x4a3c22, 0x5a5028])); [[5, 3], [19, 5], [27, 2]].forEach(([x, y]) => a.e(x, y, 1.4, 1, [0x4a6a3a, 0x7a9a5a])); }, null), 4);
        tex(scene, 'bm_lake', art(32, 12, (a) => { for (let y = 0; y < 12; y++) for (let x = 0; x < 32; x++) a.p(x, y, y === 0 ? 0x8ab8a0 : y === 1 && (x + 3) % 8 < 4 ? 0x5a8a74 : shade(0.6 + 0.2 * Math.sin((x * 1.3 + y * 3) / 5) - y * 0.05, x, y, [0x0a1a16, 0x12302a, 0x1a443a, 0x2a5a4c])); [[6, 5], [22, 8]].forEach(([x, y]) => a.r(x, y, 5, 1, 0x3a6a5a)); }, null), 4);
        tex(scene, 'bm_bogsea', art(48, 24, (a) => { for (let y = 0; y < 24; y++) for (let x = 0; x < 48; x++) a.p(x, y, shade(0.5 + 0.22 * Math.sin((x + Math.sin(y / 3) * 4) / 5) + 0.15 * Math.sin((y * 2 + x) / 7) - y * 0.012, x, y, [0x060c08, 0x0c1a12, 0x14281c, 0x1e3a28, 0x2a4c34])); [[8, 6], [30, 15], [40, 4]].forEach(([x, y]) => a.e(x, y, 2.4, 1, [0x3a6a3a, 0x5a8a4a])); }, null), 4);
        if (!scene.textures.exists('bm_fog')) {
            const ct = scene.textures.createCanvas('bm_fog', 800, 200), c = ct.getContext();
            // piksel tuman: 4 px kataklar, bulutlar zichligi 3 pog'onada (chetlari shaxmat tartibida) - silliq gradient emas
            const blobs = []; for (let i = 0; i < 26; i++) blobs.push([hash(i, 1, 5) * 800, 40 + hash(i, 2, 5) * 120, 50 + hash(i, 3, 5) * 70]);
            for (let y = 0; y < 50; y++) for (let x = 0; x < 200; x++) {
                const px = x * 4 + 2, py = y * 4 + 2; let v = 0;
                blobs.forEach(([bx, by, r]) => [bx - 800, bx, bx + 800].forEach((xx) => { const d = Math.hypot(px - xx, py - by) / r; if (d < 1) v += 0.55 * (1 - d); }));
                v += (BAYER[y % 4][x % 4] / 16 - 0.5) * 0.12;
                const a = v > 0.42 ? 0.5 : v > 0.24 ? 0.32 : v > 0.1 ? 0.16 : 0; if (!a) continue;
                c.fillStyle = 'rgba(200,220,200,' + a + ')'; c.fillRect(x * 4, y * 4, 4, 4);
            }
            ct.refresh();
        }
        tex(scene, 'bm_sh_lava', art(9, 9, (a) => { a.e(4, 4.5, 4, 4, C.lava, 0.2); a.p(3, 3, 0xffffff); a.p(5, 8, 0xb3261e); }), 2);
        tex(scene, 'bm_sh_ore', art(15, 7, (a) => { a.r(0, 1, 4, 1, 0xffc35a); a.r(1, 3, 5, 1, 0xffe9b0); a.r(0, 5, 4, 1, 0xffc35a); a.e(10.5, 3.5, 3.4, 3.4, [0x2a2430, 0x4a4250, 0x6a6270, 0x8a8290], 0.2); a.p(9, 2, 0xffc35a); a.p(12, 4, 0xff7a1a); }), 2);   // shaxtyor shuter o'qi: ruda parchasi, orqasida tezlik chiziqlari
        tex(scene, 'bm_hz_fire', art(16, 30, (a) => { for (let y = 0; y < 30; y++) { const w = 2 + Math.round((y / 30) * 5 + Math.sin(y / 2) * 1.2); for (let x = 8 - w; x < 8 + w; x++) a.p(x, y, Math.abs(x - 7.5) < w * 0.4 ? (y < 10 ? 0xfff2b0 : 0xffc35a) : y < 6 ? 0xffc35a : 0xff7a1a); } a.r(2, 28, 12, 2, 0xb3261e); }, 0x5a0c06), 3);
        tex(scene, 'bm_hz_bones', art(20, 16, (a) => { for (let k = 0; k < 5; k++) a.roof(2 + k * 4, 2 + (k % 2) * 3, 14 - (k % 2) * 3, 1, 3, C.bone); a.e(10, 13, 2.4, 2, C.bone); a.p(9, 13, OUT); a.p(11, 13, OUT); }), 3);
        // lava (ko'l va dengiz): plitka - yorqin oqim chiziqlari, qorayib qolgan po'st
        // lava dengizi: katta to'lqinli naqsh (chiziqsiz - takrorlanishi sezilmaydi)
        tex(scene, 'bm_lavasea', art(48, 24, (a) => { for (let y = 0; y < 24; y++) for (let x = 0; x < 48; x++) { const v = 0.5 + 0.25 * Math.sin((x + Math.sin(y / 3) * 4) / 4.5) + 0.2 * Math.sin((y * 2 + x) / 6) - y * 0.008; a.p(x, y, shade(v, x, y, [0x5a1208, 0x8a1e0c, 0xb3261e, 0xe8481a, 0xff7a1a, 0xffb04a])); } [[6, 5], [30, 14], [18, 20], [40, 3]].forEach(([x, y]) => { a.r(x, y, 4, 1, 0x3a0a06); a.r(x + 1, y + 1, 2, 1, 0x3a0a06); }); }, null), 4);
        tex(scene, 'bm_lava', art(32, 8, (a) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 32; x++) { const v = 0.55 + 0.35 * Math.sin((x + y * 3) / 5) + 0.15 * Math.sin(x / 2.3); a.p(x, y, y === 0 ? 0xffc35a : shade(v - y * 0.04, x, y, [0x7a1a0a, 0xb3261e, 0xff5a1a, 0xff7a1a, 0xffc35a])); } [[4, 3], [17, 5], [26, 2]].forEach(([x, y]) => a.r(x, y, 3, 1, 0x3a0a06)); }, null), 4);
        tex(scene, 'bm_hz_roots', art(20, 24, (a) => {
            // zich ildizlar: 5 ta qalin (3 px) egri ildiz, uchi o'tkir, yon tikanlar; pastda tuproq
            for (let k = 0; k < 5; k++) { const x0 = 1 + k * 4, top = 1 + ((k * 7) % 3) * 2;
                for (let y = top; y < 22; y++) { const w = y < top + 3 ? 1 : y < top + 7 ? 2 : 3, x = x0 + Math.round(Math.sin(y / 3 + k * 1.7) * 1.2); a.r(x, y, w, 1, (x + y) % 4 ? C.bark[2] : C.bark[3]); if (w > 1) a.p(x, y, C.bark[1]); }
                a.p(x0, top - 1, C.bone[2]); if (k % 2) { a.p(x0 + 3, top + 6, C.bone[1]); a.p(x0 - 1, top + 10, C.bone[1]); } }
            a.r(0, 21, 20, 3, C.mud[1]); a.r(0, 21, 20, 1, C.mud[2]);
        }), 3);
        // BIG MAP DO'KONI buyumlari (ikonka)
        const flask = (a, pal, cork) => { a.s(5, 0, 4, 3, cork || C.wood); a.r(6, 3, 2, 2, 0xd8e0ea); a.e(7, 10, 6, 5.5, pal, 0.15); a.r(4, 7, 2, 2, 0xffffff); };
        tex(scene, 'bm_i_potion', art(14, 16, (a) => { flask(a, [0x7a1018, 0xc62f2f, 0xef5f50, 0xffa0a0]); a.r(6, 9, 2, 5, 0xffffff); a.r(5, 10, 4, 2, 0xffffff); }), 3);
        tex(scene, 'bm_i_energy', art(12, 16, (a) => { a.s(1, 1, 10, 15, [0x0d47a1, 0x1565c0, 0x42a5f5, 0x90caf9], 0.1); a.r(1, 1, 10, 1, C.iron[3]); a.r(1, 15, 10, 1, C.iron[2]); a.line(7, 3, 4, 9, 0xffeb3b); a.line(4, 9, 8, 9, 0xffeb3b); a.line(8, 9, 5, 14, 0xffeb3b); }), 3);
        tex(scene, 'bm_i_battery', art(16, 12, (a) => { a.s(0, 1, 13, 10, C.iron); a.r(13, 4, 2, 4, C.iron[2]); a.r(1, 2, 11, 8, 0x0a2a14); a.r(2, 3, 9, 6, 0x36d878); a.r(2, 3, 9, 1, 0x9cffc4); a.r(3, 5, 2, 2, 0x0a2a14); a.r(8, 5, 2, 2, 0x0a2a14); a.r(5, 6, 3, 1, 0x0a2a14); }), 3);
        tex(scene, 'bm_i_armor', art(16, 16, (a) => { a.s(2, 2, 12, 12, C.iron, 0.1); a.r(0, 2, 3, 5, C.iron[2]); a.r(13, 2, 3, 5, C.iron[2]); a.r(6, 0, 4, 3, 0x0d0a14); a.r(7, 4, 2, 9, C.iron[3]); a.r(2, 13, 12, 2, C.gold[2]); a.p(4, 6, C.gold[3]); a.p(11, 6, C.gold[3]); }), 3);
        tex(scene, 'bm_i_strength', art(14, 16, (a) => { flask(a, [0x8a3a00, 0xd86a10, 0xffa040, 0xffe0a0]); a.r(5, 8, 4, 4, 0x5a2a00); a.r(5, 7, 1, 2, 0x5a2a00); a.r(7, 7, 1, 2, 0x5a2a00); }), 3);
        tex(scene, 'bm_i_feather', art(12, 16, (a) => { a.line(2, 15, 9, 1, C.bone[1]); for (let k = 0; k < 10; k++) { a.line(9 - k * 0.7, 1 + k * 1.4, 11 - k * 0.5, 3 + k * 1.3, 0xf4f4ff); a.line(9 - k * 0.7, 1 + k * 1.4, 6 - k * 0.6, 3 + k * 1.3, 0xd8dcf0); } a.line(2, 15, 9, 1, C.bone[1]); }), 3);
        tex(scene, 'bm_i_phoenix', art(14, 16, (a) => { for (let k = 0; k < 11; k++) { a.line(10 - k * 0.7, 1 + k * 1.3, 13 - k * 0.5, 3 + k * 1.2, [0xffc35a, 0xff7a1a, 0xd8442a][k % 3]); a.line(10 - k * 0.7, 1 + k * 1.3, 6 - k * 0.5, 3 + k * 1.2, [0xff7a1a, 0xd8442a, 0xffc35a][k % 3]); } a.line(3, 15, 10, 1, 0xfff2b0); a.e(10, 2, 2, 2, [0xffc35a, 0xfff2b0], 0.2); }), 3);
        // checkpoint bayrog'i va sandiqlar
        tex(scene, 'bm_cp0', art(12, 30, (a) => { a.s(2, 0, 2, 30, C.wood); a.p(2, 0, C.gold[3]); a.s(4, 2, 7, 7, C.grey); a.r(4, 9, 4, 2, C.grey[1]); a.s(0, 27, 6, 3, C.stone); }), 3);
        tex(scene, 'bm_cp1', art(12, 30, (a) => { a.s(2, 0, 2, 30, C.wood); a.p(2, 0, C.gold[3]); a.s(4, 2, 7, 7, [0x0a6a3a, 0x10a050, 0x36d878, 0x9cffc4]); a.r(4, 9, 4, 2, 0x0a6a3a); a.r(6, 4, 3, 3, 0xfff2b0); a.s(0, 27, 6, 3, C.stone); }), 3);
        tex(scene, 'bm_chest0', art(18, 13, (a) => { a.s(0, 4, 18, 9, C.wood); a.s(0, 0, 18, 5, C.wood, 0.1); a.r(0, 4, 18, 1, C.wood[0]); a.r(1, 0, 1, 13, C.gold[2]); a.r(16, 0, 1, 13, C.gold[2]); a.s(7, 3, 4, 4, C.gold, 0.1); a.p(9, 5, OUT); }), 3);
        tex(scene, 'bm_chest1', art(18, 16, (a) => { a.s(0, 7, 18, 9, C.wood); a.s(1, 0, 16, 4, C.wood, 0.1); a.r(1, 5, 16, 2, C.gold[3]); for (let x = 2; x < 16; x += 3) a.p(x, 4 + (x % 2), 0xfff2b0); a.r(1, 7, 1, 9, C.gold[2]); a.r(16, 7, 1, 9, C.gold[2]); }), 3);
    }

    // ===== FON =====
    const SKY = {
        elf: [0x120d24, 0x1f1638, 0x33204e, 0x4d2a5e, 0x6f3866, 0x9a4a6a, 0xc8646c, 0xe88d72],
        forest: [0x08141d, 0x0e2129, 0x163235, 0x1f4540, 0x2c5a48, 0x44744e, 0x6a9058, 0x9cb066],
        snow: [0x040a1a, 0x081630, 0x0e2246, 0x16325e, 0x22486e, 0x3a6a8e, 0x6a98b8, 0xb0d4e8],
        lava: [0x040204, 0x080306, 0x0e0508, 0x16070a, 0x22090a, 0x340e0a, 0x4e160c, 0x6e220e],   // tepada - qop-qora g'or shifti, pastda - lava dengizining qizil nuri
        sky: [0x0a1030, 0x101a46, 0x18285e, 0x203c7a, 0x2c5896, 0x3c78b0, 0x5a9cc8, 0x9cd0e8],   // SKYLAND: tiniq moviy osmon
        swamp: [0x050a08, 0x0a140f, 0x10201a, 0x182c22, 0x22382a, 0x2e4632, 0x40583a, 0x5a6e44]       // botqoq: xira yashil shom
    };
    // uzoqdagi muallaq orollar siluetlari (2 qatlam) va pushti piksel bulutlar
    function buildBackgroundRaw(scene) {
        const mk = (key, W, H, P, draw) => { if (!scene.textures.exists(key)) tex(scene, key, art(W, H, draw, null), P); };
        const isl = (a, x, y, w, c, d) => { a.r(x, y, w, 2, c); for (let k = 0; k < d; k++) { const ww = Math.round(w * (1 - k / d)); a.r(x + Math.round((w - ww) / 2 + Math.sin(k + x) * 1.5), y + 2 + k, ww, 1, c); } };
        ['elf', 'forest'].forEach((loc) => {   // qor bazasi foni - pastda alohida
            const far = loc === 'elf' ? 0x2a1e44 : 0x10262a, near = loc === 'elf' ? 0x1d1530 : 0x0b1b1e;
            mk('bm_bgfar_' + loc, 200, 80, 4, (a) => {
                [[6, 46, 30, 9], [52, 30, 22, 7], [90, 52, 34, 10], [140, 26, 26, 8], [176, 44, 20, 6]].forEach(([x, y, w, d], i) => {
                    isl(a, x, y, w, far, d);
                    if (loc === 'elf') { if (i % 2 === 0) { a.r(x + 6, y - 10, 3, 10, far); a.roof(x + 7.5, y - 14, 4, 1, 5, [far]); a.r(x + 14, y - 6, 6, 6, far); } else a.r(x + 4, y - 3, w - 8, 3, far); }
                    else for (let t = x + 2; t < x + w - 2; t += 4) a.roof(t + 1.5, y - 6 - (t % 3), 6 + (t % 3), 1, 4, [far]);
                });
            });
            mk('bm_bgnear_' + loc, 200, 80, 4, (a) => {
                [[20, 52, 44, 12], [110, 38, 40, 11], [168, 60, 30, 8]].forEach(([x, y, w, d]) => {
                    isl(a, x, y, w, near, d);
                    if (loc === 'elf') { a.r(x + 8, y - 14, 4, 14, near); a.roof(x + 10, y - 19, 5, 1, 7, [near]); a.r(x + 22, y - 8, 10, 8, near); a.roof(x + 27, y - 12, 4, 2, 12, [near]); }
                    else for (let t = x + 1; t < x + w - 3; t += 5) a.roof(t + 2, y - 10 - (t % 4), 10 + (t % 4), 1, 6, [near]);
                });
            });
        });
        // QOR BAZASI: muz tog'lar va muz qal'a (uzoqda), qorli archali orollar (yaqinda), qutb shafag'i
        mk('bm_bgfar_snow', 200, 80, 4, (a) => {
            const c = 0x16284a, cs = 0x3a5a86;
            for (let x = 0; x < 200; x += 26) { const h = 30 + (x * 7) % 26; a.roof(x + 13, 80 - h, h, 1, 34, [c]); a.roof(x + 13, 80 - h, 6, 1, 7, [cs]); }
            a.r(120, 30, 4, 22, c); a.roof(122, 22, 8, 1, 5, [c]); a.r(130, 36, 10, 16, c); a.roof(135, 28, 8, 2, 12, [c]); a.r(146, 32, 4, 20, c); a.roof(148, 24, 8, 1, 5, [c]);
            a.r(126, 42, 2, 3, 0x7ee8ff); a.r(134, 44, 2, 3, 0x7ee8ff);
        });
        mk('bm_bgnear_snow', 200, 80, 4, (a) => {
            const c = 0x0c1a34;
            [[20, 52, 44, 12], [110, 38, 40, 11], [168, 60, 30, 8]].forEach(([x, y, w, d]) => {
                isl(a, x, y, w, c, d); for (let t = x + 1; t < x + w - 3; t += 5) { a.roof(t + 2, y - 10 - (t % 4), 10 + (t % 4), 1, 6, [c]); a.p(t + 2, y - 10 - (t % 4), 0x6a8ab0); }
                a.r(x, y, w, 1, 0x6a8ab0);
            });
        });
        // YER OSTI: uzoqda - stalagmit o'rmoni va lava ko'llari, yaqinda - qoyalar; tepada - shiftdan osilgan stalaktitlar
        mk('bm_bgfar_lava', 200, 80, 4, (a) => {
            const c = 0x1a0c10;
            for (let x = 0; x < 200; x += 9) { const h = 18 + Math.round(hash(x, 4, 9) * 34); a.roof(x + 4.5, 80 - h, h, 1, 7 + (x % 5), [c]); }
            // uzoqdagi lava ko'llari: stalagmitlar orasida gorizontal yaltirash (oldingi plandagi narsalar bilan adashmaydi)
            [[20, 30], [96, 22], [150, 36]].forEach(([x, w]) => { a.r(x, 77, w, 3, 0x4a160c); a.r(x + 2, 77, w - 4, 1, 0x7a2a10); for (let t = x + 3; t < x + w - 3; t += 5) a.p(t, 78, 0x8a3412); });
        });
        mk('bm_bgnear_lava', 200, 80, 4, (a) => {
            const c = 0x0e0608;
            [[20, 52, 44, 12], [110, 38, 40, 11], [168, 60, 30, 8]].forEach(([x, y, w, d]) => {
                isl(a, x, y, w, c, d); for (let t = x + 2; t < x + w - 3; t += 7) a.roof(t + 2, y - 8 - (t % 5), 8 + (t % 5), 1, 4, [c]);
                for (let t = x + 3; t < x + w - 3; t += 6) if (hash(t, y, 2) < 0.5) a.p(t, y, 0x8a2a10);
            });
        });
        mk('bm_ceil_lava', 200, 40, 4, (a) => {
            const c = 0x0a0507;
            a.r(0, 0, 200, 5, c);
            for (let x = 0; x < 200; x += 5) { const h = 4 + Math.round(hash(x, 7, 3) * 26); for (let k = 0; k < h; k++) { const w = Math.max(1, Math.round((1 - k / h) * 4)); a.r(x + 2 - Math.floor(w / 2), 5 + k, w, 1, c); } if (hash(x, 8, 3) < 0.25) a.p(x + 2, 5 + h, 0x6a3aa0); }
        });
        // BOTQOQ: uzoqda - qurigan daraxtlar va suv chizig'i, yaqinda - ildizli orolchalar va osilgan mox
        mk('bm_bgfar_swamp', 200, 80, 4, (a) => {
            const c = 0x16261c;
            a.r(0, 74, 200, 6, c); for (let x = 3; x < 200; x += 11) if (hash(x, 9, 4) < 0.5) a.r(x, 74, 5, 1, 0x2a4232);
            for (let x = 6; x < 200; x += 17 + (x % 5)) { const h = 22 + Math.round(hash(x, 5, 2) * 30); a.r(x, 74 - h, 2, h, c); a.line(x, 74 - h + 6, x - 5, 74 - h, c); a.line(x + 1, 74 - h + 10, x + 7, 74 - h + 3, c); a.line(x + 1, 74 - h + 2, x + 3, 74 - h - 3, c); }
        });
        mk('bm_bgnear_swamp', 200, 80, 4, (a) => {
            const c = 0x0c1610;
            [[20, 52, 44, 12], [110, 38, 40, 11], [168, 60, 30, 8]].forEach(([x, y, w, d]) => {
                isl(a, x, y, w, c, d); for (let t = x + 3; t < x + w - 3; t += 7) if (hash(t, y, 6) < 0.6) for (let k = 0; k < 2 + (t % 4); k++) a.p(t, y + Math.round(d * 0.6) + k, 0x1e3424);
                a.r(x + 8, y - 16, 2, 16, c); a.line(x + 9, y - 12, x + 15, y - 18, c); a.line(x + 8, y - 8, x + 3, y - 13, c); for (let t = x + 1; t < x + w; t += 3) a.p(t, y - 1, 0x1e3424);
            });
        });
        // SKYLAND: uzoqda - muallaq platformadagi zamonaviy shahar (yonib turgan derazalar), yaqinda - minorali, antennali orollar
        mk('bm_bgfar_sky', 200, 80, 4, (a) => {
            const c = 0x1a2a5a, w = [0x7ee8ff, 0xffe082, 0x9aa6ff];
            [[4, 58, 60, 8], [80, 50, 54, 9], [146, 62, 50, 7]].forEach(([x, y, pw, d]) => {
                isl(a, x, y, pw, c, d);
                for (let t = x + 2; t < x + pw - 4; t += 5 + (t % 3)) { const h = 10 + Math.round(hash(t, y, 7) * 24), tw = 3 + (t % 2); a.r(t, y - h, tw, h, c); if (hash(t, 1, 8) < 0.4) a.r(t + 1, y - h - 4, 1, 4, c);
                    for (let wy = y - h + 2; wy < y - 1; wy += 3) if (hash(t, wy, 9) < 0.35) a.p(t + 1, wy, w[(t + wy) % 3]); }
            });
        });
        mk('bm_bgnear_sky', 200, 80, 4, (a) => {
            const c = 0x101c3c;
            [[20, 52, 44, 12], [110, 38, 40, 11], [168, 60, 30, 8]].forEach(([x, y, pw, d], i) => {
                isl(a, x, y, pw, c, d);
                a.r(x + 6, y - 22, 5, 22, c); a.r(x + 8, y - 27, 1, 5, c); a.p(x + 8, y - 28, 0xff3d3d);
                a.r(x + 16, y - 12, 12, 12, c); a.r(x + 17, y - 9, 10, 1, 0x40e0ff);
                if (i !== 1) { a.line(x + pw - 8, y - 1, x + pw - 8, y - 18, c); a.line(x + pw - 8, y - 18, x + pw - 13, y - 22, c); a.line(x + pw - 8, y - 18, x + pw - 3, y - 22, c); a.line(x + pw - 8, y - 18, x + pw - 8, y - 24, c); }
                for (let t = x + 7; t < x + 11; t += 2) for (let wy = y - 19; wy < y - 2; wy += 4) if (hash(t, wy, 3) < 0.5) a.p(t, wy, 0xffe082);
                for (let t = x + 2; t < x + pw - 2; t += 6) a.p(t, y + 1, 0x40e0ff);
            });
        });
        mk('bm_aurora', 200, 50, 4, (a) => {
            for (let x = 0; x < 200; x++) {
                const y0 = 18 + Math.round(Math.sin(x / 13) * 7 + Math.sin(x / 5) * 2), h = 6 + Math.round(4 + 3 * Math.sin(x / 9));
                for (let k = 0; k < h; k++) a.p(x, y0 + k, k < 2 ? 0x9cffc4 : k < h - 2 ? (x % 3 ? 0x36d878 : 0x2ab0a0) : 0x7c4dff);
            }
        });
        mk('bm_clouds', 200, 40, 4, (a) => {
            const pal = [0xa85a80, 0xd87ea0, 0xf4b4c8];
            [[10, 20, 26], [70, 12, 18], [120, 26, 30], [170, 16, 20]].forEach(([x, y, w]) => { a.r(x, y, w, 3, pal[1]); a.r(x + 3, y - 2, w - 8, 2, pal[2]); a.r(x + 6, y - 4, w - 16, 2, pal[2]); a.r(x - 2, y + 3, w + 4, 1, pal[0]); });
        });
        mk('bm_stars', 200, 60, 2, (a) => { for (let i = 0; i < 70; i++) a.p(Math.floor(hash(i, 1, 3) * 200), Math.floor(hash(i, 2, 3) * 60), hash(i, 3, 3) < 0.3 ? 0xfff2b0 : 0xb8b0d8); });
    }

    // sahifa yuklangach (lobbi) - bo'sh vaqtda oldindan chizib qo'yiladi
    window.addEventListener('load', () => setTimeout(prebuild, 2500));
    return { tex, art, isleTex, coverTex, coverPos, hallTex, stoneTex, buildSprites, buildBackground, prebuild, SKY, hash, enemyKey, ENEMY, NPC, PROPS };
})();
