// QAHRAMON VA DETALLAR RASMLARI (piksel-art) - o'yin (game.js) ham, lobbi/"My Character" oldindan
// ko'rinishi (lobby.js) ham shu yerdagi bir xil "katak" (grid) rasmlaridan foydalanadi.
// Grid: satrlar massivi, har katak - rang (0xRRGGBB) yoki null (shaffof). O'yinda 1 katak = 2px.
// Detallar: bosh kiyimi (head), yuz buyumi (face) va qurol ko'rinishlari (sword, shield, shotgun,
// staff, bow, katana, kunai). id lar server/src/cosmetics.ts dagi bilan bir xil
window.Cosmetics = (() => {
    const INK = 0x111111;
    const SLOTS = ['head', 'face', 'sword', 'shield', 'shotgun', 'staff', 'bow', 'katana', 'kunai', 'body'];   // body (kiyim) - oxirida

    // ===== YORDAMCHILAR =====
    const gridNew = (w, h) => Array.from({ length: h }, () => Array(w).fill(null));
    function painter(w, h) {
        const g = gridNew(w, h);
        const px = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (y >= 0 && y < h && x >= 0 && x < w) g[y][x] = c; };
        const rect = (x, y, rw, rh, c) => { for (let yy = y; yy < y + rh; yy++) for (let xx = x; xx < x + rw; xx++) px(xx, yy, typeof c === 'function' ? c(xx, yy) : c); };
        const line = (x0, y0, x1, y1, c, t = 1) => {
            const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1;
            for (let i = 0; i <= n; i++) rect(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), t, t, c);
        };
        const disc = (cx, cy, r, c) => {
            for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
                if (Math.hypot(x - cx, y - cy) <= r) px(x, y, typeof c === 'function' ? c(x, y) : c);
            }
        };
        return { g, w, h, px, rect, line, disc };
    }
    function outline(grid, color = INK) {
        const h = grid.length, w = grid[0].length;
        const out = gridNew(w + 2, h + 2);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y + 1][x + 1] = grid[y][x];
        const filled = (x, y) => y >= 0 && y < h + 2 && x >= 0 && x < w + 2 && out[y][x] !== null && out[y][x] !== color;
        for (let y = 0; y < h + 2; y++) for (let x = 0; x < w + 2; x++) {
            if (out[y][x] === null && (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1))) out[y][x] = color;
        }
        return out;
    }
    function mix(c, t, k) {
        const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
        const tr = (t >> 16) & 255, tg = (t >> 8) & 255, tb = t & 255;
        return (Math.round(r + (tr - r) * k) << 16) | (Math.round(g + (tg - g) * k) << 8) | Math.round(b + (tb - b) * k);
    }
    const BAYER4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
    const shade = (v, x, y, pal) => {
        const d = v + (BAYER4[((y % 4) + 4) % 4][((x % 4) + 4) % 4] / 16 - 0.5) * 0.28;
        return pal[Math.max(0, Math.min(pal.length - 1, Math.floor(d * pal.length)))];
    };

    // ===== QAHRAMON TANASI: skin rangidagi tik to'rtburchak, o'ngda to'q sariq visor (14x22) =====
    // color - tana rangi; 2^24 dan katta qismi - ikkinchi rang (visor va belbog'): skin kombinatsiyasi
    function bodyGrid(packed) {
        const color = packed % 0x1000000;
        const accent = Math.floor(packed / 0x1000000);
        const W = 14, H = 22, g = gridNew(W, H);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            let c = color;
            if (x <= 1) c = mix(color, 0xffffff, 0.22);
            else if (x >= W - 2) c = mix(color, 0x000000, 0.25);
            if (y >= H - 2) c = mix(c, 0x000000, 0.18);
            g[y][x] = c;
        }
        const ORANGE = accent || 0xd9822b, WHITE = 0xffffff, DARK = 0x141414;
        for (let x = 6; x < W; x++) { g[4][x] = DARK; g[7][x] = DARK; }
        g[5][6] = DARK; g[6][6] = DARK;
        for (let x = 7; x < W; x++) { g[5][x] = ORANGE; g[6][x] = ORANGE; }
        [8, 9, 11, 12].forEach((x) => { g[5][x] = WHITE; });
        // Kombinatsiyali skin: belbog' (ikkinchi rang) va o'rtasida to'qa
        if (accent) {
            for (let x = 0; x < W; x++) { g[14][x] = mix(accent, 0x000000, 0.15); g[15][x] = mix(accent, 0x000000, 0.35); }
            g[14][6] = 0xffe082; g[14][7] = 0xffe082; g[15][6] = 0xffb300; g[15][7] = 0xffb300;
        }
        return outline(g, 0x0d0d0d);
    }

    // ===== STANDART QUROLLAR (o'ngga qaragan, dastasi chapda) =====
    function defaultWeapon(kind) {
        const put = (g, x, y, c) => { if (g[y] && x >= 0 && x < g[0].length) g[y][x] = c; };
        if (kind === 'sword') {
            const g = gridNew(30, 7);
            for (let x = 0; x < 5; x++) for (let y = 2; y < 5; y++) g[y][x] = 0x2b1d14;
            for (let y = 0; y < 7; y++) { g[y][5] = 0x111111; g[y][6] = 0x111111; }
            for (let x = 7; x < 27; x++) { g[2][x] = 0xe0e6ea; g[3][x] = 0xb0bec5; g[4][x] = 0x78909c; }
            put(g, 27, 3, 0xb0bec5); put(g, 27, 2, 0xe0e6ea); put(g, 28, 3, 0x90a4ae); put(g, 29, 3, 0x78909c);
            return outline(g);
        }
        if (kind === 'katana') return outline(katanaShape({ hilt: [0x3e2723, 0x6d4c41], tsuba: 0xc9975b, blade: [0x9e9e9e, 0xf5f5f5, 0xffffff], tip: 0xe0e0e0 }));
        if (kind === 'bow') {
            const g = gridNew(18, 14);
            for (let x = 0; x < 14; x++) { g[6][x] = 0x8d5a3a; g[7][x] = 0x6d4c41; }
            for (let y = 0; y < 14; y++) {
                const half = Math.abs(y - 6.5);
                const x0 = 8 + Math.round(half * 0.2), x1 = 17 - Math.round(half * 1.2);
                for (let x = x0; x <= x1; x++) g[y][x] = (x === x0 || x === x1 || y === 0 || y === 13) ? 0x5d3a22 : 0xb97a57;
            }
            for (let y = 0; y < 14; y++) put(g, 8, y, 0xf5f5f5);
            return outline(g);
        }
        if (kind === 'staff') return outline(staffShape({ orb: [0xffd600, 0xfff59d], shaft: [0xa1673e, 0x7b4a2a], ring: [0xffd600, 0xffab00], tip: [0xffd600, 0xfff59d] }));
        if (kind === 'shotgun') return outline(shotgunShape({ stock: 0x6d4c41, body: 0x37474f, barrel: [0x78909c, 0x546e7a, 0x455a64], pump: [0x8d5a3a, 0x6d4c41], trig: 0x263238 }).g);
        if (kind === 'kunai') {
            const g = gridNew(16, 5);
            for (let y = 1; y < 4; y++) { g[y][0] = 0xc62828; g[y][2] = 0xc62828; }
            g[1][1] = 0xc62828; g[3][1] = 0xc62828;
            for (let x = 3; x < 7; x++) g[2][x] = 0x212121;
            for (let x = 7; x < 16; x++) { const hw = Math.max(0, Math.round((16 - x) / 4)); for (let y = 2 - hw; y <= 2 + hw; y++) put(g, x, y, y < 2 ? 0xeceff1 : 0xb0bec5); }
            return outline(g);
        }
        if (kind === 'hknife') {
            // OVCHI PICHOG'I: uzun, uchi qiyshiq kesilgan (clip point) tig', mis ko'ndalang, charm dasta
            const g = gridNew(26, 7);
            for (let x = 0; x < 7; x++) for (let y = 2; y < 5; y++) g[y][x] = (x % 2) ? 0x4e342e : 0x6d4c41;
            for (let y = 2; y < 5; y++) g[y][0] = 0x8d6e63;
            for (let y = 1; y < 6; y++) g[y][7] = 0xc9975b;
            for (let x = 8; x < 26; x++) {
                const top = x < 19 ? 2 : 2 + Math.round((x - 19) / 3.5), bot = x < 22 ? 4 : 4 - Math.round((x - 22) / 2);
                for (let y = top; y <= bot; y++) put(g, x, y, y === top ? 0x78909c : y === bot ? 0xeceff1 : 0xb0bec5);
            }
            for (let x = 9; x < 17; x++) g[3][x] = 0x90a4ae;
            return outline(g);
        }
        if (kind === 'blowpipe') {
            // PUFLAMA NAYCHA: uzun yog'och naycha, mis halqalar, og'iz tomoni qalinroq
            const g = gridNew(28, 4);
            for (let x = 0; x < 28; x++) { g[1][x] = 0x8d6e63; g[2][x] = 0x5d4037; }
            for (let y = 0; y < 4; y++) { g[y][0] = 0x3e2723; g[y][1] = 0x3e2723; }
            [6, 14, 22].forEach((x) => { g[1][x] = 0xffca28; g[2][x] = 0xc9975b; });
            g[1][27] = 0x212121; g[2][27] = 0x212121;
            return outline(g);
        }
        if (kind === 'shield') return outline(kiteShield([0x1565c0, 0x1e88e5, 0x42a5f5, 0x90caf9], 0x455a64, 0xffca28, 'diamond'));
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

    // Umumiy shakllar (standart va rangli variantlar uchun)
    function katanaShape(c) {
        const p = painter(34, 5);
        for (let x = 0; x < 7; x++) for (let y = 1; y < 4; y++) p.px(x, y, (x % 2) ? c.hilt[1] : c.hilt[0]);
        p.rect(7, 0, 1, 5, c.tsuba);
        for (let x = 8; x < 31; x++) { p.px(x, 1, c.blade[0]); p.px(x, 2, c.blade[1]); p.px(x, 3, c.blade[2]); }
        p.px(31, 2, c.blade[1]); p.px(31, 3, c.blade[2]); p.px(32, 3, c.blade[2]); p.px(33, 3, c.tip);
        return p.g;
    }
    function staffShape(c) {
        const p = painter(32, 8);
        p.rect(0, 1, 6, 6, (x, y) => Math.hypot(x - 2.5, y - 3.5) < 3 ? ((x + y < 5) ? c.orb[1] : c.orb[0]) : null);
        for (let x = 6; x < 27; x++) { p.px(x, 3, c.shaft[0]); p.px(x, 4, c.shaft[1]); }
        if (c.stripe) for (let x = 7; x < 27; x += 3) { p.px(x, 3, c.stripe); p.px(x + 1, 4, c.stripe); }
        for (let y = 1; y < 7; y++) { p.px(21, y, c.ring[0]); p.px(22, y, c.ring[1]); }
        p.rect(27, 2, 4, 4, (x, y) => Math.hypot(x - 28.5, y - 3.5) < 2.1 ? ((x < 29 && y < 4) ? c.tip[1] : c.tip[0]) : null);
        return p.g;
    }
    function shotgunShape(c) {
        const p = painter(28, 7);
        for (let x = 0; x < 8; x++) for (let y = 2 + Math.floor(x / 4); y < 6; y++) p.px(x, y, c.stock);
        p.rect(8, 1, 5, 4, c.body);
        for (let x = 13; x < 28; x++) { p.px(x, 1, c.barrel[0]); p.px(x, 2, c.barrel[1]); p.px(x, 3, c.barrel[2]); }
        for (let x = 15; x < 21; x++) { p.px(x, 4, c.pump[0]); p.px(x, 5, c.pump[1]); }
        p.px(10, 5, c.trig); p.px(10, 6, c.trig);
        return p;
    }
    // Uchli (pastga torayadigan) qalqon: hoshiya, yuz, o'rtada chiziq va belgi
    function kiteShield(pal, rim, stripe, emblem) {
        const p = painter(18, 26);
        for (let y = 0; y < 26; y++) {
            const hw = y < 14 ? 9 : Math.max(1, Math.round(9 * (1 - (y - 14) / 12)));
            for (let x = 9 - hw; x < 9 + hw; x++) {
                const edge = x === 9 - hw || x === 9 + hw - 1 || y === 0 || y === 25;
                p.px(x, y, edge ? rim : (stripe && (x === 8 || x === 9)) ? stripe : shade(0.8 - y / 40 - (x > 9 ? 0.15 : 0), x, y, pal));
            }
        }
        if (emblem === 'diamond') for (let y = 8; y < 13; y++) for (let x = 6; x < 12; x++) if (Math.abs(x - 8.5) + Math.abs(y - 10) < 3.2) p.px(x, y, stripe);
        if (emblem === 'heart') heart(p, 9, 8, 0xffffff);
        return p.g;
    }
    // Yurakcha: tepada ikki do'ng, pastga torayadi (7 katak eni, 5 katak bo'yi)
    function heart(p, cx, cy, c) {
        [-2, -1, 1, 2].forEach(dx => p.px(cx + dx, cy, c));
        for (let r = 1; r <= 4; r++) for (let x = -(4 - r); x <= 4 - r; x++) p.px(cx + x, cy + r, c);
    }
    function pistolShape(c) {
        const p = painter(16, 11);
        p.rect(2, 1, 14, 3, c.slide);
        p.rect(2, 1, 14, 1, c.light);
        p.px(14, 0, c.slide);
        p.rect(15, 2, 1, 1, 0x111111);
        for (let y = 4; y < 11; y++) p.rect(2 - Math.floor((y - 4) / 3), y, 4, 1, c.grip);
        p.px(3, 6, c.gripL); p.px(3, 8, c.gripL);
        p.px(6, 4, 0x212121); p.px(7, 5, 0x212121); p.px(8, 5, 0x212121); p.px(9, 4, 0x212121); p.px(7, 4, 0x424242);
        return p.g;
    }

    // Kunai (standart shakl, ranglari bilan)
    function kunaiShape(ring, grip, b1, b2) {
        const p = painter(16, 5);
        for (let y = 1; y < 4; y++) { p.px(0, y, ring); p.px(2, y, ring); }
        p.px(1, 1, ring); p.px(1, 3, ring);
        for (let x = 3; x < 7; x++) p.px(x, 2, grip);
        for (let x = 7; x < 16; x++) { const hw = Math.max(0, Math.round((16 - x) / 4)); for (let y = 2 - hw; y <= 2 + hw; y++) p.px(x, y, y < 2 ? b1 : b2); }
        return p;
    }

    // ===== BOSH KIYIMLARI (tana kataklariga nisbatan: ax/ay - chap yuqori burchak) =====
    const HEAD = {
        // ---- QIZLAR UCHUN ----
        bow() {   // KATTA BANT: boshning orqa-tepasida pushti lenta, ikki halqa va osilib turgan uchlari
            const p = painter(12, 9), M = [0xad1457, 0xec407a, 0xf48fb1, 0xf8bbd0];
            const loop = (cx) => p.disc(cx, 3.2, 2.7, (x, y) => shade(0.95 - Math.abs(x - cx) / 6 - (y - 1) / 9, x, y, M));
            loop(2.6); loop(8.9);
            p.px(1, 2, M[3]); p.px(8, 2, M[3]);
            p.rect(5, 2, 2, 3, M[0]); p.px(5, 2, M[1]);
            p.px(4, 6, M[1]); p.px(3, 7, M[1]); p.px(3, 8, M[0]); p.px(7, 6, M[1]); p.px(8, 7, M[1]); p.px(8, 8, M[0]);
            return { g: p.g, ax: -2, ay: -6 };
        },
        flowercrown() {   // GUL TOJI: yashil novda va rangli gullar (pushti, sariq, oq, binafsha)
            const p = painter(16, 5), GR = [0x2e7d32, 0x43a047, 0x66bb6a];
            p.rect(0, 3, 16, 2, (x, y) => y === 3 ? GR[1] : GR[0]);
            [1, 6, 11, 14].forEach((x) => p.px(x, 3, GR[2]));
            const fl = (cx, c, cc) => { p.px(cx, 0, c); p.px(cx - 1, 1, c); p.px(cx + 1, 1, c); p.px(cx, 2, c); p.px(cx, 1, cc); };
            fl(2, 0xf48fb1, 0xffeb3b); fl(5, 0xfff176, 0xff8f00); fl(8, 0xfafafa, 0xffca28); fl(11, 0xce93d8, 0xfff59d); fl(14, 0xff8a80, 0xffeb3b);
            return { g: p.g, ax: -1, ay: -3 };
        },
        tiara() {   // MALIKA TIARASI: kumush kamar, o'rtada baland cho'qqi va pushti tosh, yonlarida kichik ko'k toshlar
            const p = painter(14, 7), SV = [0x90a4ae, 0xcfd8dc, 0xeceff1];
            p.rect(0, 5, 14, 2, (x, y) => y === 5 ? SV[2] : shade(0.8 - x / 28, x, y, SV));
            const peak = (cx, top) => { for (let y = top; y < 5; y++) { const k = Math.floor((y - top) / 2); p.rect(cx - k, y, 2 + 2 * k, 1, (x) => x <= cx ? SV[2] : SV[1]); } };
            peak(6, 1); peak(2, 3); peak(10, 3);
            p.rect(6, 2, 2, 2, 0xec407a); p.px(6, 2, 0xf8bbd0);
            p.px(2, 4, 0x4fc3f7); p.px(11, 4, 0x4fc3f7);
            p.px(6, 0, 0xffffff); p.px(4, 6, 0xffffff); p.px(9, 6, 0xffffff);
            return { g: p.g, ax: 0, ay: -5 };
        },
        // ---- O'G'IL BOLALAR UCHUN ----
        backcap() {   // TESKARI KEPKA: qizil gumbaz, soyabon orqaga (chapga), oldida sozlash tasmasi
            const p = painter(18, 7), R = [0x8e0000, 0xc62828, 0xe53935, 0xef5350];
            p.disc(10, 7, 6.6, (x, y) => y > 5 ? null : shade(0.95 - (x - 4) / 16 - y / 14, x, y, R));
            p.rect(0, 4, 6, 2, (x, y) => y === 4 ? R[1] : R[0]);
            p.rect(4, 5, 13, 1, R[0]);
            p.rect(13, 3, 3, 2, (x, y) => (x + y) % 2 ? 0xfafafa : 0xe0e0e0);
            p.px(10, 0, R[3]);
            return { g: p.g, ax: -4, ay: -4 };
        },
        headphones() {   // GEYMER QULOQCHINI: qora yoy bosh ustidan, yonida katta quloqcha va yashil chiroq
            const p = painter(14, 11), K = [0x111111, 0x263238, 0x37474f];
            for (let x = 1; x <= 12; x++) { const y = Math.round(Math.pow((x - 6.5) / 5.5, 2) * 5); p.rect(x, y, 1, 2, y <= 1 ? K[2] : K[1]); }
            p.rect(1, 5, 6, 6, (x, y) => ((x === 1 || x === 6) && (y === 5 || y === 10)) ? null : shade(0.8 - (x - 1) / 12 - (y - 5) / 20, x, y, K));
            p.rect(2, 6, 4, 4, 0x1b1b1b); p.rect(3, 7, 2, 2, 0x00e676); p.px(3, 7, 0xb9f6ca);
            return { g: p.g, ax: 0, ay: -3 };
        },
        spiky() {   // TIKANAKLI SOCH (anime uslubi): orqaga (chapga) qayrilgan qora tikanlar, jigarrang yaltirash
            const p = painter(16, 9), H = [0x111111, 0x2b1d16, 0x4e342e, 0x8d6e63];
            p.rect(1, 6, 15, 3, (x, y) => shade(0.6 - y / 30, x, y, H));
            [[0, 0], [4, 1], [7, 0], [10, 2], [13, 3]].forEach(([ax, ay]) => {
                for (let y = ay; y < 7; y++) { const d = y - ay, x0 = ax + Math.floor(d * 0.5), w = 1 + Math.floor(d * 0.75); p.rect(x0, y, w, 1, (x) => (x === x0 && d > 0) ? H[3] : d < 2 ? H[2] : H[1]); }
            });
            p.rect(13, 8, 3, 1, H[1]); p.px(15, 7, H[2]);
            return { g: p.g, ax: -1, ay: -7 };
        },
        cowboy() {
            const p = painter(20, 8), B = [0x7a4a26, 0xa0673a, 0xc08457];
            p.rect(4, 1, 12, 5, (x, y) => shade(0.95 - (x - 4) / 14 - y / 20, x, y, B));
            p.rect(4, 0, 4, 1, B[1]); p.rect(12, 0, 4, 1, B[1]);
            p.rect(4, 5, 12, 1, 0x4e2a14); p.px(13, 5, 0xffca28);
            p.rect(0, 6, 20, 2, B[0]); p.rect(1, 6, 18, 1, B[1]);
            p.px(0, 5, B[0]); p.px(19, 5, B[0]);
            return { g: p.g, ax: -3, ay: -6 };
        },
        bucket() {
            const p = painter(16, 10), G = [0x616161, 0x8a8a8a, 0xb0b0b0, 0xd6d6d6];
            for (let y = 0; y < 9; y++) {
                const l = Math.round(3 - y * 3 / 8);
                for (let x = l; x <= 15 - l; x++) p.px(x, y, (y === 2 || y === 6) ? G[1] : shade(0.95 - (x - l) / (16 - 2 * l) * 0.9, x, y, G));
            }
            p.rect(0, 9, 16, 1, G[0]); p.rect(1, 8, 14, 1, G[2]);
            p.px(1, 3, 0x424242); p.px(0, 4, 0x424242); p.px(0, 5, 0x424242); p.px(1, 6, 0x424242);
            return { g: p.g, ax: -1, ay: -8 };
        },
        kasa() {
            const p = painter(22, 6), S = [0xb08a3e, 0xc9a24f, 0xe0c077, 0xf0d99a];
            for (let y = 0; y < 6; y++) {
                const half = 1 + y * 2;
                for (let x = 11 - half; x <= 10 + half; x++) p.px(x, y, ((x + y) % 4 === 0) ? S[0] : shade(0.9 - (x / 22) * 0.5 - y / 14, x, y, S));
            }
            p.rect(10, 0, 2, 1, 0x7a5a1e);
            p.rect(0, 5, 22, 1, S[1]);
            return { g: p.g, ax: -4, ay: -4 };
        },
        bunny() {
            const p = painter(14, 11), W = 0xfafafa, WD = 0xe0e0e0, PK = 0xf48fb1;
            p.rect(2, 1, 3, 9, W); p.px(3, 0, W); p.rect(3, 2, 1, 7, PK); p.rect(4, 1, 1, 9, WD);
            p.rect(8, 2, 3, 8, W); p.px(9, 1, W); p.rect(9, 3, 1, 6, PK); p.rect(10, 2, 1, 8, WD);
            p.rect(1, 10, 12, 1, 0xec407a);
            return { g: p.g, ax: 0, ay: -10 };
        },
        safari() {
            const p = painter(20, 8), K = [0xa68a4e, 0xc8b27a, 0xd8c38a, 0xeadba8];
            const rows = [[6, 13], [4, 15], [3, 16], [3, 16], [3, 16]];
            rows.forEach(([a, b], y) => { for (let x = a; x <= b; x++) p.px(x, y, shade(0.95 - (x - 3) / 16 - y / 16, x, y, K)); });
            p.rect(3, 5, 14, 1, 0x6d4c41);
            p.rect(0, 6, 20, 1, K[1]); p.rect(1, 7, 18, 1, K[0]);
            return { g: p.g, ax: -3, ay: -6 };
        },
        cat() {
            const p = painter(14, 5), C = 0x424242, CD = 0x2b2b2b, PK = 0xf48fb1;
            [[1, 1], [1, 2], [0, 3], [0, 4], [0, 5]].forEach(([x0, n], y) => p.rect(x0, y, n, 1, C));
            [[12, 1], [11, 2], [10, 4], [9, 5], [8, 6]].forEach(([x0, n], y) => p.rect(x0, y, n, 1, C));
            p.rect(1, 2, 2, 2, PK); p.rect(11, 2, 2, 2, PK);
            p.px(4, 4, CD); p.px(13, 4, CD);
            return { g: p.g, ax: 0, ay: -4 };
        },
        blackcrown() {   // QORA TOJ (Skyland: Qora Ritsarni yenggach): qora metall, to'q qizil toshlar, o'rtada baland tig' va binafsha tosh (xochsiz)
            const p = painter(16, 10), BL = [0x050508, 0x14141c, 0x2a2a38, 0x55556a];
            p.rect(0, 7, 16, 3, (x, y) => shade(0.85 - x / 30 - (y - 7) / 8, x, y, BL));
            const peak = (cx, top) => { for (let y = top; y < 7; y++) { const k = Math.floor((y - top) / 2); p.rect(cx - k, y, 1 + 2 * k, 1, BL[2]); } };
            peak(1, 3); peak(14, 3); peak(4, 5); peak(11, 5);
            for (let y = 2; y < 7; y++) { const k = Math.floor((y - 2) / 2); p.rect(7 - k, y, 2 + 2 * k, 1, BL[2]); p.px(7 - k, y, BL[3]); }   // o'rta tig'
            p.rect(7, 0, 2, 2, 0x7e57c2); p.px(7, 0, 0xb39ddb);   // binafsha tosh
            p.px(3, 8, 0xb71c1c); p.rect(7, 8, 2, 1, 0xe53935); p.px(12, 8, 0xb71c1c);
            p.rect(0, 7, 16, 1, BL[3]);
            return { g: p.g, ax: -1, ay: -8 };
        },
        crown() {
            const p = painter(16, 8), GO = [0xc79100, 0xffca28, 0xffe082];
            p.rect(0, 5, 16, 3, (x, y) => shade(0.85 - x / 30 - (y - 5) / 8, x, y, GO));
            const peak = (cx, top, w) => { for (let y = top; y < 5; y++) { const k = Math.floor((y - top) / 2); p.rect(cx - k, y, 1 + 2 * k + (w || 0), 1, GO[1]); } };
            peak(1, 1); peak(7, 0, 1); peak(14, 1); peak(4, 3); peak(11, 3);
            p.px(1, 0, 0xffffff); p.px(14, 0, 0xffffff);
            p.px(3, 6, 0xe53935); p.rect(7, 6, 2, 1, 0x1e88e5); p.px(12, 6, 0xe53935);
            p.rect(0, 5, 16, 1, GO[2]);
            return { g: p.g, ax: -1, ay: -6 };
        },
        punk() {
            const p = painter(13, 8), M = [0xad1457, 0xe91e63, 0xff4081, 0xff80ab];
            const tops = [6, 4, 2, 5, 1, 4, 0, 3, 1, 4, 2, 5, 6];
            tops.forEach((top, x) => { for (let y = top; y < 8; y++) p.px(x, y, y === top ? M[3] : y < top + 2 ? M[2] : y > 5 ? M[0] : M[1]); });
            return { g: p.g, ax: 1, ay: -7 };
        },
        viking() {
            // Viking dubulg'asi: kumush gumbaz, mis kamar, ikki yonda shoxlar
            const p = painter(22, 9), M = [0x546e7a, 0x90a4ae, 0xcfd8dc];
            p.disc(11, 9, 7.2, (x, y) => shade(0.95 - (x - 4) / 18 - y / 20, x, y, M));
            p.rect(3, 7, 16, 2, (x, y) => (y === 7 && x % 3 === 0) ? 0xffca28 : y === 7 ? 0xa1887f : 0x6d4c41);
            p.rect(10, 2, 2, 5, M[2]);
            const H = [0xfff8e1, 0xe0d6b8];
            [[4, 6], [3, 5], [2, 4], [1, 3], [1, 2], [0, 1], [0, 0]].forEach(([x, y], i) => { p.px(x, y, H[0]); p.px(x + 1, y, i < 4 ? H[1] : H[0]); p.px(21 - x, y, H[0]); p.px(20 - x, y, i < 4 ? H[1] : H[0]); });
            return { g: p.g, ax: -3, ay: -7 };
        },
        wizard() {
            // Sehrgar qalpog'i: binafsha konus, yulduzchalar, keng soyabon
            const p = painter(20, 14), V = [0x311b92, 0x4527a0, 0x5e35b1, 0x7e57c2];
            for (let y = 0; y < 12; y++) {
                const cx = 11 - Math.round(y * 0.15), half = Math.round(y * 0.55);
                for (let x = cx - half; x <= cx + half; x++) p.px(x, y, shade(0.95 - (x - cx + half) / (2 * half + 2) * 0.7 - y / 40, x, y, V));
            }
            p.px(12, 0, V[2]); p.px(13, 1, V[1]);
            p.rect(0, 12, 20, 2, (x, y) => y === 12 ? V[3] : V[1]);
            p.rect(5, 10, 11, 1, 0xffca28);
            [[9, 4], [11, 7], [7, 8]].forEach(([x, y]) => p.px(x, y, 0xffeb3b));
            p.px(12, 5, 0xfff59d);
            return { g: p.g, ax: -2, ay: -12 };
        },
        pirate() {
            // Qaroqchi shlyapasi: qora uchburchak, oltin hoshiya, bosh suyagi belgisi
            const p = painter(22, 8), K = 0x212121, KL = 0x37474f;
            p.rect(6, 0, 10, 5, (x, y) => y === 0 ? KL : K);
            p.rect(0, 4, 22, 3, K); p.rect(0, 2, 2, 2, K); p.rect(20, 2, 2, 2, K);
            p.rect(1, 6, 20, 1, 0xffca28); p.rect(2, 7, 18, 1, K);
            p.rect(10, 1, 3, 2, 0xfafafa); p.px(10, 2, K); p.px(12, 2, K); p.rect(10, 3, 3, 1, 0xfafafa); p.px(11, 3, K);
            return { g: p.g, ax: -3, ay: -6 };
        },
        chef() {
            // Oshpaz qalpog'i: oq "bulut" tepa va oq kamar
            const p = painter(16, 11), W = [0xd6d6d6, 0xeeeeee, 0xfafafa];
            const cl = (x, y) => shade(0.95 - x / 30 - y / 14, x, y, W);
            p.disc(4, 4, 3.6, cl); p.disc(8, 3, 4, cl); p.disc(12, 4, 3.6, cl);
            p.rect(2, 6, 12, 5, (x, y) => y === 6 ? W[1] : (x % 3 === 0 ? W[0] : W[2]));
            p.rect(2, 10, 12, 1, 0xbdbdbd);
            return { g: p.g, ax: 0, ay: -9 };
        }
    };

    // ===== YUZ BUYUMLARI (visor atrofida: visor 4-7 qatorlarda, x 6..13) =====
    const FACE = {
        // ---- QIZLAR UCHUN ----
        blush() {   // QIZIL YONOQLAR: visor ostida katta pushti yonoq, atrofida ikki yaltiroq yulduzcha
            const p = painter(11, 9), PK = [0xec407a, 0xf48fb1, 0xf8bbd0], ST = 0xfff59d;
            p.rect(4, 6, 4, 2, (x, y) => y === 6 ? PK[1] : PK[0]); p.px(4, 6, PK[2]); p.px(5, 6, PK[2]);
            const star = (x, y) => { p.px(x, y - 1, ST); p.px(x - 1, y, ST); p.px(x + 1, y, ST); p.px(x, y + 1, ST); p.px(x, y, 0xffffff); };
            star(1, 6); star(9, 1);
            return { g: p.g, ax: 5, ay: 2 };
        },
        butterfly() {   // KAPALAK NIQOB: visor ustida ikki juft qanot (tepadagisi katta), o'rtada qora tana va mo'ylovchalar
            const p = painter(13, 9), V = [0x6a1b9a, 0x9c27b0, 0xce93d8, 0xf3e5f5], PK = 0xf06292;
            for (let y = 1; y <= 4; y++) { const w = 6 - y; p.rect(6 - w - 1, y, w + 1, 1, (x) => x === 6 - w - 1 ? V[0] : y === 1 ? V[2] : V[1]); p.rect(7, y, w + 1, 1, (x) => x === 7 + w ? V[0] : y === 1 ? V[2] : V[1]); }
            p.px(3, 2, PK); p.px(9, 2, PK); p.px(2, 1, V[3]); p.px(10, 1, V[3]);
            p.rect(3, 5, 3, 2, (x, y) => y === 6 ? V[0] : V[1]); p.rect(7, 5, 3, 2, (x, y) => y === 6 ? V[0] : V[1]); p.px(4, 5, PK); p.px(8, 5, PK);
            p.rect(6, 1, 1, 7, 0x1a1a1a); p.px(5, 0, 0x1a1a1a); p.px(7, 0, 0x1a1a1a);
            return { g: p.g, ax: 4, ay: 1 };
        },
        // ---- O'G'IL BOLALAR UCHUN ----
        bandana() {   // BANDIT BANDANASI: yuzning pastini yopadigan qizil ro'mol, oq naqsh, oldida uchburchak uchi, orqada tugun
            const p = painter(17, 8), R = [0x8e0000, 0xb71c1c, 0xd32f2f];
            p.rect(2, 0, 15, 4, (x, y) => ((x + 2 * y) % 5 === 0) ? 0xfafafa : shade(0.9 - y / 7 - (x - 2) / 40, x, y, R));
            for (let y = 4; y < 8; y++) { const w = 7 - 2 * (y - 4); if (w > 0) p.rect(16 - w, y, w, 1, R[1]); }
            p.rect(2, 0, 15, 1, R[2]);
            p.line(1, 1, 0, 4, R[1]); p.line(1, 2, 0, 5, R[0]);
            return { g: p.g, ax: -1, ay: 8 };
        },
        heromask() {   // SUPERQAHRAMON NIQOBI: qora ko'z niqobi, ko'z teshigidan visor ko'rinadi, orqasida bog'ich
            const p = painter(16, 6), K = [0x111111, 0x212121, 0x424242];
            p.rect(0, 2, 6, 1, K[1]); p.px(0, 3, K[1]); p.px(1, 3, K[0]);
            p.rect(5, 0, 11, 6, (x, y) => ((x === 5 && (y === 0 || y === 5)) || (x === 15 && y === 5)) ? null : y === 0 ? K[2] : K[0]);
            p.rect(9, 2, 4, 2, null); p.px(14, 2, null);
            p.px(6, 1, 0x616161);
            return { g: p.g, ax: 0, ay: 3 };
        },
        hockey() {
            const p = painter(15, 12), W = [0xbdbdbd, 0xdcdcdc, 0xf5f5f5];
            p.rect(0, 3, 7, 1, 0x333333);
            p.rect(7, 0, 8, 12, (x, y) => ((x === 7 || x === 14) && (y === 0 || y === 11)) ? null : shade(0.95 - (x - 7) / 20 - y / 30, x, y, W));
            [[9, 4], [10, 4], [12, 4], [13, 4]].forEach(([x, y]) => p.px(x, y, 0x111111));
            [[9, 7], [11, 7], [13, 7], [10, 9], [12, 9]].forEach(([x, y]) => p.px(x, y, 0x616161));
            [[9, 1], [10, 2], [12, 2], [13, 1]].forEach(([x, y]) => p.px(x, y, 0xe53935));
            return { g: p.g, ax: 0, ay: 1 };
        },
        goggles() {
            const p = painter(15, 5);
            p.rect(0, 1, 7, 3, 0x263238); p.rect(0, 2, 7, 1, 0xff5722);
            p.rect(6, 0, 9, 5, 0x212121);
            p.rect(7, 1, 7, 1, 0xffeb3b); p.rect(7, 2, 7, 1, 0xff9800); p.rect(7, 3, 7, 1, 0xf4511e);
            p.px(8, 1, 0xffffff); p.px(9, 1, 0xffffff);
            return { g: p.g, ax: 0, ay: 3 };
        },
        clown() {
            // Masxarabozcha: katta qizil burun, qizil tabassum, ko'z ustida ko'k romb
            const p = painter(9, 11);
            p.disc(6, 5.5, 2.4, (x, y) => (x <= 5 && y <= 4) ? 0xff8a80 : 0xe53935);
            [[1, 8], [2, 9], [3, 10], [4, 10], [5, 10], [6, 9]].forEach(([x, y]) => p.px(x, y, 0xd32f2f));
            [[3, 0], [2, 1], [3, 1], [4, 1], [3, 2]].forEach(([x, y]) => p.px(x, y, 0x1e88e5));
            return { g: p.g, ax: 7, ay: 1 };
        },
        glasses() {
            const p = painter(15, 5), F = 0x212121, L = [0xb3e5fc, 0x81d4fa];
            p.rect(0, 2, 6, 1, 0x3e2723);
            p.rect(5, 0, 5, 5, F); p.rect(10, 0, 5, 5, F);
            p.rect(6, 1, 3, 3, (x, y) => y === 1 ? L[0] : L[1]); p.rect(11, 1, 3, 3, (x, y) => y === 1 ? L[0] : L[1]);
            p.px(6, 1, 0xffffff); p.px(11, 1, 0xffffff);
            return { g: p.g, ax: 0, ay: 3 };
        },
        cyber() {
            const p = painter(15, 4);
            p.rect(0, 1, 6, 2, 0x1a1a2e); p.px(1, 1, 0xff1744);
            p.rect(6, 0, 9, 1, 0x84ffff); p.rect(6, 1, 9, 1, 0x00e5ff); p.rect(6, 2, 9, 1, 0x00b8d4); p.rect(6, 3, 9, 1, 0x006064);
            for (let x = 7; x < 15; x += 2) p.px(x, 1, 0xff4081);
            return { g: p.g, ax: 0, ay: 4 };
        },
        mustache() {
            // Jingalak mo'ylov (visor ostida)
            const p = painter(11, 3), B = 0x3e2723;
            p.px(0, 0, B); p.px(10, 0, B);
            p.rect(1, 1, 4, 1, B); p.rect(6, 1, 4, 1, B);
            p.rect(3, 2, 5, 1, 0x5d4037);
            return { g: p.g, ax: 6, ay: 9 };
        },
        eyepatch() {
            // Qaroqchi ko'z bog'ichi: qiyshiq tasma va qora yamoq
            const p = painter(15, 9);
            p.line(0, 1, 8, 4, 0x3e2723); p.line(12, 4, 14, 2, 0x3e2723);
            p.rect(8, 3, 4, 5, (x, y) => ((x === 8 || x === 11) && (y === 3 || y === 7)) ? null : 0x111111);
            p.px(9, 4, 0x424242);
            return { g: p.g, ax: 0, ay: 1 };
        },
        shades() {
            // Qora ko'zoynak (aviator): to'q oyna, yaltirash
            const p = painter(15, 5), F = 0x111111;
            p.rect(0, 1, 6, 1, F);
            const lens = (x0) => p.rect(x0, 0, 5, 5, (x, y) => (y === 4 && (x === x0 || x === x0 + 4)) ? null : y === 0 ? F : y < 2 ? 0x37474f : 0x263238);
            lens(5); lens(10);
            p.px(6, 1, 0xffffff); p.px(11, 1, 0xffffff); p.px(7, 2, 0x90a4ae);
            return { g: p.g, ax: 0, ay: 4 };
        },
        ninja() {
            // Ninja niqobi: yuzning pastki qismini yopadi, chapda tugun uchlari
            const p = painter(17, 6), N = [0x1a237e, 0x283593, 0x303f9f];
            p.rect(2, 0, 15, 5, (x, y) => shade(0.9 - y / 8 - (x - 2) / 40, x, y, N));
            p.rect(2, 0, 15, 1, N[2]);
            p.line(1, 1, 0, 4, N[1]); p.line(1, 2, 0, 5, N[0]);
            return { g: p.g, ax: -1, ay: 9 };
        },
        heart() {
            // Yurakcha ko'zoynak
            const p = painter(18, 6);
            p.rect(0, 2, 6, 1, 0xad1457);
            heart(p, 9, 0, 0xff4081); heart(p, 14, 0, 0xff4081);
            p.px(8, 1, 0xffffff); p.px(13, 1, 0xffffff); p.px(9, 2, 0xff80ab); p.px(14, 2, 0xff80ab);
            return { g: p.g, ax: 0, ay: 3 };
        }
    };

    // ===== QUROL KO'RINISHLARI: { g, gx, gy } - gx/gy: qo'l ushlaydigan katak (o'ngga qaragan) =====
    const PINK = { d: 0xad1457, m: 0xec407a, l: 0xf48fb1, xl: 0xf8bbd0, w: 0xfce4ec };
    const WEAPONS = {
        sword: {
            bat() {
                const p = painter(30, 6), Wd = [0x9c6b3c, 0xc8925a, 0xe0b079];
                p.rect(0, 1, 2, 4, 0x6d4c41);
                p.rect(2, 2, 10, 2, (x, y) => x < 8 ? (x % 2 ? 0x333333 : 0x424242) : (y === 2 ? Wd[2] : Wd[1]));
                p.rect(12, 1, 7, 4, (x, y) => y === 1 ? Wd[2] : y === 4 ? Wd[0] : Wd[1]);
                p.rect(19, 0, 11, 6, (x, y) => (x === 29 && (y === 0 || y === 5)) ? null : y <= 1 ? Wd[2] : y >= 4 ? Wd[0] : Wd[1]);
                return { g: p.g, gx: 5, gy: 2.5 };
            },
            greatsword() {
                const p = painter(32, 9);
                p.rect(0, 3, 6, 3, (x) => x % 2 ? 0x8b0000 : 0x3e2723); p.rect(0, 3, 1, 3, 0xffca28);
                p.rect(6, 0, 2, 9, 0x212121); p.px(6, 0, 0x9e9e9e); p.px(6, 8, 0x9e9e9e);
                p.rect(8, 1, 21, 7, (x, y) => y === 1 || y === 7 ? 0xb71c1c : y === 4 ? 0x546e7a : y < 4 ? 0x37474f : 0x1c1c1c);
                p.rect(29, 2, 1, 5, 0x37474f); p.rect(30, 3, 1, 3, 0x37474f); p.px(31, 4, 0xb71c1c);
                return { g: p.g, gx: 3, gy: 4 };
            },
            holo() {
                const p = painter(30, 7);
                p.rect(0, 2, 6, 3, (x, y) => y === 2 ? 0xbdbdbd : 0x757575); p.px(3, 2, 0xff1744);
                p.rect(6, 1, 1, 5, 0x424242);
                p.rect(7, 1, 22, 5, (x, y) => y === 3 ? 0xe0ffff : (y === 2 || y === 4) ? ((x % 4 === 0) ? 0x4dd0e1 : 0x18ffff) : 0x00b8d4);
                p.rect(29, 2, 1, 3, 0x18ffff);
                return { g: p.g, gx: 3, gy: 3 };
            },
            guitar() {
                const p = painter(32, 13), R = [0x9a0007, 0xd32f2f, 0xef5350];
                p.disc(25, 6.5, 6.2, (x, y) => shade(0.85 - y / 16 - (x - 19) / 30, x, y, R));
                p.disc(18.5, 6.5, 4.6, (x, y) => shade(0.85 - y / 16, x, y, R));
                p.disc(20, 6.5, 1.6, 0x111111);
                p.rect(26, 5, 2, 3, 0x3e2723);
                p.rect(22, 9, 3, 1, 0xfafafa);
                p.rect(4, 5, 12, 3, 0x8d6e63);
                for (let x = 6; x < 16; x += 3) p.rect(x, 5, 1, 3, 0xbdbdbd);
                p.line(4, 6, 27, 6, 0xeeeeee);
                p.rect(0, 4, 4, 5, 0x4e342e);
                [[1, 3], [3, 3], [1, 9], [3, 9]].forEach(([x, y]) => p.px(x, y, 0xbdbdbd));
                return { g: p.g, gx: 10, gy: 6 };
            },
            pink() {
                const p = painter(30, 7);
                p.rect(0, 2, 5, 3, (x) => x % 2 ? PINK.d : PINK.m);
                p.rect(5, 0, 2, 7, 0xff80ab);
                for (let x = 7; x < 27; x++) { p.px(x, 2, PINK.w); p.px(x, 3, PINK.xl); p.px(x, 4, PINK.l); }
                p.px(27, 2, PINK.w); p.px(27, 3, PINK.xl); p.px(28, 3, PINK.l); p.px(29, 3, PINK.m);
                p.px(12, 2, 0xffffff); p.px(20, 2, 0xffffff);
                return { g: p.g, gx: 2, gy: 3 };
            },
            flame() {
                // Olov qilichi: tig' ustida olov tillari
                const p = painter(30, 9);
                p.rect(0, 3, 5, 3, (x) => x % 2 ? 0x212121 : 0x3e2723);
                p.rect(5, 1, 2, 7, 0xffab00); p.px(5, 1, 0xfff176);
                for (let x = 7; x < 28; x++) { p.px(x, 3, 0xffeb3b); p.px(x, 4, 0xff9800); p.px(x, 5, 0xe65100); }
                for (let x = 9; x < 27; x += 3) { p.px(x, 2, 0xff9800); p.px(x + 1, 1, 0xffeb3b); }
                p.px(28, 4, 0xff9800); p.px(29, 4, 0xffeb3b);
                return { g: p.g, gx: 2, gy: 4 };
            },
            ice() {
                // Muz qilichi: shaffof ko'k kristall tig'
                const p = painter(30, 9);
                p.rect(0, 3, 5, 3, (x) => x % 2 ? 0x455a64 : 0x78909c);
                for (let y = 1; y < 8; y++) for (let x = 5; x < 8; x++) if (Math.abs(x - 6) + Math.abs(y - 4) <= 3) p.px(x, y, y < 4 ? 0xe0f7fa : 0x4dd0e1);
                for (let x = 8; x < 27; x++) { p.px(x, 3, 0xe1f5fe); p.px(x, 4, 0x81d4fa); p.px(x, 5, 0x4fc3f7); }
                for (let x = 11; x < 22; x++) { p.px(x, 2, 0xb3e5fc); p.px(x, 6, 0x29b6f6); }
                p.px(27, 4, 0x81d4fa); p.px(28, 4, 0xb3e5fc); p.px(29, 4, 0xffffff);
                [10, 15, 20].forEach(x => p.px(x, 3, 0xffffff));
                return { g: p.g, gx: 2, gy: 4 };
            },
            bone() {
                // Suyak to'qmoq
                const p = painter(30, 8), B = [0xd7ccc8, 0xefebe9, 0xfafafa];
                p.rect(4, 3, 22, 2, (x, y) => y === 3 ? B[1] : B[0]);
                [[2, 2], [2, 5.5], [27, 2], [27, 5.5]].forEach(([x, y]) => p.disc(x, y, 1.9, (xx, yy) => yy < y ? B[2] : B[1]));
                return { g: p.g, gx: 7, gy: 3.5 };
            },
            fish() {
                // Baliq qilich: dumidan ushlanadi
                const p = painter(30, 11);
                for (let y = 0; y < 11; y++) for (let x = 6; x < 30; x++) {
                    const k = ((x - 18) / 11.5) ** 2 + ((y - 5) / 4.6) ** 2;
                    if (k <= 1) p.px(x, y, y < 4 ? 0x81d4fa : y < 7 ? 0x29b6f6 : 0xb3e5fc);
                }
                for (let x = 0; x < 7; x++) { const h = Math.round((7 - x) * 0.6); for (let y = 5 - h; y <= 5 + h; y++) p.px(x, y, 0x0288d1); }
                p.px(25, 4, 0xffffff); p.px(26, 4, 0x111111); p.rect(28, 6, 2, 1, 0x01579b);
                [12, 16, 20].forEach(x => p.px(x, 3, 0x0288d1));
                p.rect(15, 0, 3, 1, 0x0288d1);
                return { g: p.g, gx: 3, gy: 5 };
            },
            candy() {
                // Shirinlik tayoqcha (qizil-oq yo'l-yo'l, uchi qayrilgan)
                const p = painter(30, 8), st = (x, y) => ((x + y) % 4 < 2) ? 0xe53935 : 0xfafafa;
                p.rect(0, 5, 25, 2, st);
                p.line(24, 5, 26, 2, st, 2); p.line(26, 1, 28, 1, st, 2); p.line(28, 2, 28, 4, st, 2);
                return { g: p.g, gx: 4, gy: 5.5 };
            }
        },
        shield: {
            door() {
                const p = painter(14, 26);
                p.rect(0, 0, 14, 26, 0x5d4037);
                p.rect(1, 1, 12, 24, 0x8d6e63);
                p.rect(2, 2, 10, 9, 0x795548); p.rect(3, 3, 8, 7, 0xa1887f);
                p.rect(2, 13, 10, 10, 0x795548); p.rect(3, 14, 8, 8, 0xa1887f);
                p.px(11, 12, 0xffca28); p.px(11, 13, 0xc79100);
                return { g: p.g };
            },
            cardoor() {
                const p = painter(20, 22), RD = [0x8e0000, 0xc62828, 0xe53935];
                for (let y = 0; y < 9; y++) for (let x = Math.max(0, 7 - y); x < 20; x++) p.px(x, y, RD[1]);
                for (let y = 1; y < 8; y++) for (let x = Math.max(1, 8 - y) + 1; x < 19; x++) p.px(x, y, (x - y === 12 || x - y === 13) ? 0xe3f2fd : 0x90caf9);
                p.rect(0, 9, 20, 13, (x, y) => y === 9 ? RD[2] : y === 15 ? RD[0] : RD[1]);
                p.rect(3, 11, 4, 1, 0xe0e0e0); p.rect(3, 12, 4, 1, 0x757575);
                p.rect(0, 8, 2, 2, 0x212121);
                return { g: p.g };
            },
            triangle() {
                const p = painter(20, 22), S = [0x78909c, 0x90a4ae, 0xb0bec5, 0xcfd8dc];
                for (let y = 0; y < 22; y++) {
                    const half = Math.max(1, Math.round(10 * (1 - y / 22)));
                    for (let x = 10 - half; x < 10 + half; x++) p.px(x, y, (x === 10 - half || x === 9 + half || y === 0) ? 0xffca28 : shade(0.9 - y / 30 - (x > 10 ? 0.2 : 0), x, y, S));
                }
                p.rect(9, 3, 2, 9, 0xc62828); p.rect(6, 6, 8, 2, 0xc62828);
                return { g: p.g };
            },
            pink() { return { g: kiteShield([PINK.d, PINK.m, PINK.l, PINK.xl], 0x880e4f, 0xff80ab, 'heart') }; },
            pan() {
                // Tova: qora doira va pastga tutqich
                const p = painter(19, 27);
                p.disc(9, 9, 9, 0x212121); p.disc(9, 9, 7.6, (x, y) => (x + y < 14) ? 0x607d8b : 0x455a64);
                p.px(6, 5, 0x90a4ae); p.px(7, 5, 0x90a4ae); p.px(5, 6, 0x90a4ae);
                p.rect(8, 18, 3, 9, (x) => x === 8 ? 0x5d4037 : 0x3e2723);
                return { g: p.g };
            },
            pizza() {
                // Pitsa bo'lagi: tepada qobiq, pishloq, pepperoni
                const p = painter(20, 24);
                for (let y = 0; y < 24; y++) {
                    const half = Math.max(1, Math.round(10 * (1 - y / 24)));
                    for (let x = 10 - half; x < 10 + half; x++) p.px(x, y, y < 3 ? (y === 0 ? 0xe0b06a : 0xc8893c) : ((x * 7 + y * 3) % 11 === 0 ? 0xffe082 : 0xffc107));
                }
                [[6, 6], [13, 8], [9, 13], [11, 18]].forEach(([x, y]) => p.disc(x, y, 1.6, 0xd32f2f));
                p.px(5, 5, 0xef5350); p.px(12, 7, 0xef5350);
                [[8, 9], [14, 12], [10, 16]].forEach(([x, y]) => p.px(x, y, 0x388e3c));
                return { g: p.g };
            },
            turtle() {
                // Toshbaqa kosasi: yashil olti burchaklar, jigarrang hoshiya
                const p = painter(20, 24);
                for (let y = 0; y < 24; y++) for (let x = 0; x < 20; x++) {
                    const k = ((x - 9.5) / 10) ** 2 + ((y - 11.5) / 12) ** 2;
                    if (k > 1) continue;
                    if (k > 0.78) { p.px(x, y, 0x8d6e63); continue; }
                    const cx = Math.floor((x + (Math.floor(y / 6) % 2) * 3) / 6), cy = Math.floor(y / 6);
                    const edge = (x + (Math.floor(y / 6) % 2) * 3) % 6 === 0 || y % 6 === 0;
                    p.px(x, y, edge ? 0x1b5e20 : ((cx + cy) % 2 ? 0x43a047 : 0x388e3c));
                }
                p.px(7, 4, 0x81c784); p.px(8, 4, 0x81c784);
                return { g: p.g };
            },
            golden() { return { g: kiteShield([0xc79100, 0xffb300, 0xffca28, 0xffe082], 0x6d4c41, 0xfff8e1, 'diamond') }; },
            ice() { return { g: kiteShield([0x0288d1, 0x4fc3f7, 0x81d4fa, 0xe1f5fe], 0x01579b, 0xe0f7fa, 'diamond') }; }
        },
        shotgun: {
            toy() {
                const p = shotgunShape({ stock: 0xffeb3b, body: 0x43a047, barrel: [0x90caf9, 0x42a5f5, 0x1e88e5], pump: [0xff8a65, 0xff7043], trig: 0x2e7d32 });
                p.rect(26, 1, 2, 3, 0xff6d00);
                return { g: p.g, gx: 8, gy: 3 };
            },
            branch() {
                const p = painter(30, 10), B = 0x6d4c41, BL = 0x8d6e63, LF = [0x43a047, 0x66bb6a];
                p.line(0, 6, 29, 4, B, 2); p.line(0, 6, 29, 4, BL);
                p.line(10, 5, 12, 2, B); p.line(19, 4, 21, 1, B); p.line(14, 6, 16, 8, B);
                [[12, 1], [21, 0], [16, 8], [26, 3]].forEach(([x, y]) => { p.rect(x, y, 2, 2, LF[1]); p.px(x + 1, y + 1, LF[0]); });
                p.px(3, 6, 0x4e342e); p.px(24, 5, 0x4e342e);
                return { g: p.g, gx: 8, gy: 5.5 };
            },
            dark() {
                const p = shotgunShape({ stock: 0x212121, body: 0x311b92, barrel: [0x424242, 0x303030, 0x212121], pump: [0x4527a0, 0x311b92], trig: 0x111111 });
                for (let x = 14; x < 27; x += 2) p.px(x, 2, 0x7c4dff);
                p.rect(27, 1, 1, 3, 0xb388ff);
                return { g: p.g, gx: 8, gy: 3 };
            },
            pink() {
                const p = shotgunShape({ stock: 0xf06292, body: PINK.d, barrel: [PINK.xl, PINK.l, PINK.m], pump: [0xff80ab, 0xf06292], trig: 0x880e4f });
                p.px(4, 3, 0xffffff); p.px(6, 3, 0xffffff); p.px(5, 4, 0xffffff);
                return { g: p.g, gx: 8, gy: 3 };
            },
            golden() {
                const p = shotgunShape({ stock: 0x6d4c41, body: 0xc79100, barrel: [0xfff8e1, 0xffca28, 0xffb300], pump: [0x8d5a3a, 0x6d4c41], trig: 0x5d4037 });
                p.px(10, 2, 0xfff59d); p.px(18, 1, 0xffffff); p.px(24, 1, 0xffffff);
                return { g: p.g, gx: 8, gy: 3 };
            },
            water() {
                // Suv to'pponcha: rangli plastik, tepada suv idishi
                const p = shotgunShape({ stock: 0xff9800, body: 0x29b6f6, barrel: [0xb3e5fc, 0x4fc3f7, 0x0288d1], pump: [0xffeb3b, 0xfbc02d], trig: 0x01579b });
                p.rect(8, 0, 5, 1, 0x81d4fa); p.px(9, 0, 0xe1f5fe);
                p.rect(26, 1, 2, 3, 0xff5722);
                return { g: p.g, gx: 8, gy: 3 };
            },
            ice() {
                const p = shotgunShape({ stock: 0x4fc3f7, body: 0x0277bd, barrel: [0xe1f5fe, 0xb3e5fc, 0x81d4fa], pump: [0x80deea, 0x4dd0e1], trig: 0x01579b });
                [16, 19, 22, 25].forEach((x, i) => p.px(x, 4 + (i % 2), 0xe1f5fe));
                return { g: p.g, gx: 8, gy: 3 };
            },
            pirate() {
                // Qaroqchi miltig'i (blunderbuss): yog'och qo'ndoq, uchi kengaygan mis stvol
                const p = painter(30, 8);
                for (let x = 0; x < 10; x++) for (let y = 3 + Math.floor(x / 5); y < 7; y++) p.px(x, y, (x + y) % 5 === 0 ? 0x4e342e : 0x6d4c41);
                p.rect(9, 2, 4, 4, 0x5d4037); p.px(10, 6, 0x3e2723); p.px(11, 7, 0x3e2723);
                for (let x = 13; x < 26; x++) { p.px(x, 2, 0xe6c07b); p.px(x, 3, 0xc9a24f); p.px(x, 4, 0x9a7a2e); }
                for (let x = 26; x < 30; x++) for (let y = 4 - (x - 25); y <= 2 + (x - 25) + 2 && y < 8; y++) if (y >= 0) p.px(x, y, y < 3 ? 0xe6c07b : 0xb08d3e);
                [16, 22].forEach(x => p.rect(x, 2, 1, 3, 0x6d4c41));
                return { g: p.g, gx: 9, gy: 4 };
            },
            laser() {
                const p = shotgunShape({ stock: 0x212121, body: 0xeceff1, barrel: [0x84ffff, 0x18ffff, 0x00b8d4], pump: [0x424242, 0x212121], trig: 0x111111 });
                p.rect(27, 1, 1, 3, 0xff1744); p.px(9, 2, 0xff1744); p.px(11, 2, 0x00e676);
                return { g: p.g, gx: 8, gy: 3 };
            }
        },
        staff: {
            stop() {
                const p = painter(36, 13);
                p.rect(0, 6, 25, 2, (x, y) => y === 6 ? 0xbdbdbd : 0x9e9e9e);
                const oct = (x, y, r) => Math.abs(x - 30) <= r && Math.abs(y - 6) <= r && Math.abs(x - 30) + Math.abs(y - 6) <= r * 1.45;
                for (let y = 0; y < 13; y++) for (let x = 24; x < 36; x++) {
                    if (oct(x, y, 5.6)) p.px(x, y, oct(x, y, 4.4) ? 0xd32f2f : 0xfafafa);
                }
                p.rect(27, 6, 7, 1, 0xfafafa);
                return { g: p.g, gx: 16, gy: 6.5 };
            },
            torch() {
                const p = painter(32, 12);
                p.rect(0, 5, 20, 2, (x, y) => (x % 5 === 0) ? 0x4e342e : y === 5 ? 0x8d5a3a : 0x6d4c41);
                p.rect(20, 4, 3, 4, 0x616161); p.rect(20, 4, 3, 1, 0x9e9e9e);
                p.disc(26, 5.5, 3.6, 0xff9800); p.disc(29, 4, 2, 0xff5722); p.disc(30.5, 2.5, 1, 0xff5722);
                p.disc(25.5, 5.5, 2, 0xffeb3b); p.px(25, 5, 0xffffff);
                return { g: p.g, gx: 12, gy: 5.5 };
            },
            pink() { return { g: staffShape({ orb: [PINK.l, PINK.w], shaft: [0xfafafa, 0xe0e0e0], stripe: 0xff4081, ring: [0xff4081, PINK.d], tip: [PINK.m, PINK.w] }), gx: 19, gy: 3.5 }; },
            candy() {
                const p = painter(30, 14), P = [0xf06292, 0xf48fb1, 0xf8bbd0, 0xfce4ec];
                p.rect(0, 6, 18, 2, (x, y) => y === 6 ? 0xfafafa : 0xe0e0e0);
                const cloud = (x, y) => shade(0.95 - (y / 16) - ((x - 16) / 40), x, y, P);
                p.disc(22, 7, 5.5, cloud); p.disc(26, 5, 4, cloud); p.disc(25.5, 10, 3.5, cloud); p.disc(18.5, 5.5, 3, cloud);
                return { g: p.g, gx: 9, gy: 6.5 };
            },
            crystal() {
                const g = staffShape({ orb: [0x4fc3f7, 0xe1f5fe], shaft: [0xb0bec5, 0x78909c], ring: [0x80deea, 0x26c6da], tip: [0x4fc3f7, 0xe1f5fe] });
                [[2, 0], [0, 2], [5, 1], [2, 7]].forEach(([x, y]) => { g[y][x] = 0xb3e5fc; });
                return { g, gx: 19, gy: 3.5 };
            },
            skull() {
                // Bosh suyagi tayoq: qora tayoq, oq bosh suyagi, yashil ko'zlar
                const p = painter(32, 9);
                for (let x = 7; x < 30; x++) { p.px(x, 4, 0x37474f); p.px(x, 5, 0x212121); }
                p.rect(0, 1, 7, 6, (x, y) => ((x === 0 || x === 6) && (y === 1 || y === 6)) ? null : (x + y < 5 ? 0xffffff : 0xe0e0e0));
                p.rect(2, 7, 3, 2, 0xd6d6d6); p.px(3, 8, 0x424242);
                p.px(1, 3, 0x00e676); p.px(2, 3, 0x111111); p.px(4, 3, 0x111111); p.px(5, 3, 0x00e676); p.px(3, 5, 0x424242);
                p.rect(28, 3, 2, 4, 0x00e676);
                return { g: p.g, gx: 19, gy: 4.5 };
            },
            wand() {
                // Yulduzli sehrli tayoqcha
                const p = painter(30, 11), Y = 0xffeb3b;
                p.rect(0, 5, 20, 1, 0x212121); p.rect(0, 6, 20, 1, 0x424242); p.rect(0, 5, 3, 2, 0xfafafa);
                p.disc(24, 5.5, 2.4, Y);
                p.line(24, 0, 24, 10, Y); p.line(19, 4, 29, 4, Y); p.line(20, 9, 23, 6, Y); p.line(28, 9, 25, 6, Y);
                p.px(23, 4, 0xffffff); p.px(24, 5, 0xfff59d);
                [[20, 1], [28, 1]].forEach(([x, y]) => p.px(x, y, 0xfff59d));
                return { g: p.g, gx: 10, gy: 5.5 };
            },
            broom() {
                // Supurgi: jigarrang dasta, qizil bog'ich, somon cho'tka
                const p = painter(34, 11);
                p.rect(0, 5, 23, 2, (x, y) => y === 5 ? 0x8d5a3a : 0x6d4c41);
                for (let x = 23; x < 34; x++) { const h = 1 + Math.round((x - 23) * 0.4); for (let y = 5 - h; y <= 6 + h; y++) p.px(x, y, (y + x) % 3 === 0 ? 0xf9a825 : 0xffca28); }
                p.rect(23, 3, 2, 6, 0xc62828);
                return { g: p.g, gx: 11, gy: 5.5 };
            },
            lolli() {
                // Katta aylanma konfet (lollipop)
                const p = painter(32, 14);
                p.rect(0, 6, 20, 2, (x, y) => y === 6 ? 0xfafafa : 0xe0e0e0);
                p.disc(25, 7, 6.2, (x, y) => {
                    const dx = x - 25, dy = y - 7;
                    return (Math.floor(Math.atan2(dy, dx) / (Math.PI * 2) * 4 + Math.hypot(dx, dy) / 2.2 + 8) % 2) ? 0xff4081 : 0xfafafa;
                });
                p.px(22, 4, 0xffffff);
                return { g: p.g, gx: 10, gy: 6.5 };
            }
        },
        bow: {
            pistol() { return { g: pistolShape({ slide: 0x424242, light: 0x757575, grip: 0x5d4037, gripL: 0x8d6e63 }), gx: 4, gy: 5, angle: -4 }; },
            cyber() {
                const p = painter(20, 15);
                p.rect(0, 6, 14, 3, 0x263238); p.rect(2, 7, 11, 1, 0x00e5ff);
                p.rect(14, 6, 4, 3, 0x37474f);
                p.rect(14, 0, 2, 15, 0x212121); p.rect(15, 0, 1, 15, 0x18ffff);
                p.px(14, 0, 0xff4081); p.px(14, 14, 0xff4081);
                p.line(13, 0, 8, 7, 0xe0f7fa); p.line(8, 7, 13, 14, 0xe0f7fa);
                p.rect(8, 7, 11, 1, 0xff4081); p.px(19, 7, 0xffffff);
                return { g: p.g, gx: 4, gy: 7 };
            },
            elf() {
                const p = painter(18, 14);
                for (let x = 0; x < 14; x++) { p.px(x, 6, 0xd7b98e); p.px(x, 7, 0xb99060); }
                p.px(0, 5, 0x81c784); p.px(0, 8, 0x81c784);
                for (let y = 0; y < 14; y++) {
                    const k = (y - 6.5) / 6.5, xx = 11 + Math.round((1 - k * k) * 4);
                    p.px(xx, y, 0x2e7d32); p.px(xx + 1, y, 0x66bb6a);
                }
                p.px(11, 0, 0xffd54f); p.px(11, 13, 0xffd54f);
                p.px(15, 3, 0x81c784); p.px(16, 4, 0x81c784); p.px(15, 10, 0x81c784); p.px(16, 9, 0x81c784);
                for (let y = 1; y < 13; y++) p.px(10, y, 0xf1f8e9);
                return { g: p.g, gx: 3, gy: 7 };
            },
            pinkpistol() {
                const g = pistolShape({ slide: PINK.l, light: PINK.xl, grip: PINK.d, gripL: PINK.m });
                return { g, gx: 4, gy: 5, angle: -4 };
            },
            golden() {
                // Oltin qayrilma kamon: egilgan yelkalar, uchlari tashqariga buralgan, dastada yoqut, oltin uchli o'q
                const p = painter(20, 19), G = [0xc79100, 0xffca28, 0xfff59d];
                for (let y = 0; y < 19; y++) {
                    const k = (y - 9) / 9, x = 9 + Math.round(4.5 * (1 - k * k));
                    p.px(x, y, G[1]); p.px(x + 1, y, G[0]); if (y < 9) p.px(x - 1, y, G[2]);
                }
                p.px(10, 0, G[1]); p.px(11, 0, G[2]); p.px(10, 18, G[1]); p.px(11, 18, G[0]);
                p.line(9, 1, 9, 17, 0xfff8e1);
                p.rect(13, 7, 3, 5, 0x4e342e); p.px(14, 9, 0xe53935); p.px(14, 8, 0xff8a80);
                p.rect(0, 9, 17, 1, 0xd7b98e);
                p.px(0, 8, 0xe53935); p.px(1, 8, 0xe53935); p.px(0, 10, 0xe53935); p.px(1, 10, 0xe53935);
                p.rect(17, 8, 1, 3, G[1]); p.rect(18, 9, 2, 1, G[2]);
                return { g: p.g, gx: 4, gy: 9 };
            },
            bone() {
                // Suyak kamon: umurtqa bo'g'imlaridan yasalgan yelkalar, dastada kichik bosh suyagi, qizil pay ip, qora uchli suyak o'q
                const p = painter(20, 19), B = [0xbcaaa4, 0xd7ccc8, 0xfafafa];
                for (let y = 0; y < 19; y++) {
                    const k = (y - 9) / 9, x = 10 + Math.round(3.5 * (1 - k * k)), knob = y % 3 === 0;
                    p.px(x, y, knob ? B[2] : B[1]); p.px(x + 1, y, knob ? B[1] : B[0]); if (knob) { p.px(x - 1, y, B[2]); p.px(x + 2, y, B[0]); }
                }
                p.line(9, 1, 9, 17, 0x8d1c1c);
                p.rect(12, 7, 4, 4, B[2]); p.rect(13, 11, 2, 1, B[1]);
                p.px(12, 8, 0x111111); p.px(14, 8, 0x111111); p.px(13, 10, 0x424242);
                p.rect(0, 9, 17, 1, 0xefebe9); p.px(5, 9, B[0]); p.px(10, 9, B[0]);
                p.px(0, 8, 0x424242); p.px(0, 10, 0x424242);
                p.rect(17, 8, 1, 3, 0x212121); p.rect(18, 9, 2, 1, 0x424242);
                return { g: p.g, gx: 4, gy: 9 };
            },
            ice() {
                // Muz arbaleti: gorizontal kristall qo'ndoq, oldida qirrali muz yoy, oppoq muz o'q
                const p = painter(24, 15), I = [0x0288d1, 0x4fc3f7, 0x81d4fa, 0xe1f5fe];
                p.rect(0, 6, 16, 3, (x, y) => y === 6 ? I[2] : y === 7 ? I[1] : I[0]);
                p.rect(0, 5, 4, 1, I[1]); p.rect(0, 9, 3, 1, I[0]);
                p.px(6, 9, 0x01579b); p.px(6, 10, 0x01579b);
                for (let y = 0; y < 15; y++) {
                    const x = 16 - Math.round(Math.abs(y - 7) * 0.35);
                    p.px(x, y, I[3]); p.px(x + 1, y, (y % 3 === 0) ? I[3] : I[1]);
                    if (y % 4 === 1) p.px(x + 2, y, I[2]);
                }
                p.line(15, 0, 10, 7, 0xffffff); p.line(10, 7, 15, 14, 0xffffff);
                p.rect(10, 7, 11, 1, I[3]);
                p.px(21, 6, I[2]); p.px(21, 8, I[2]); p.px(21, 7, 0xffffff); p.px(22, 7, 0xffffff); p.px(23, 7, I[2]);
                [[3, 6], [9, 6], [13, 6]].forEach(([x, y]) => p.px(x, y, 0xffffff));
                return { g: p.g, gx: 4, gy: 7 };
            },
            slingshot() {
                // Rogatka: yog'och sopi, ayri va qizil rezina
                const p = painter(14, 14), Wd = 0x8d5a3a;
                p.rect(0, 6, 6, 2, (x, y) => y === 6 ? 0xa1673e : 0x6d4c41);
                p.line(6, 7, 11, 1, Wd, 2); p.line(6, 6, 11, 12, Wd, 2);
                p.line(11, 1, 8, 7, 0xe53935); p.line(8, 7, 11, 12, 0xe53935); p.rect(7, 6, 2, 2, 0x6d4c41);
                return { g: p.g, gx: 2, gy: 7 };
            },
            blaster() {
                const g = pistolShape({ slide: 0xeceff1, light: 0xffffff, grip: 0x263238, gripL: 0x00e5ff });
                for (let x = 4; x < 14; x += 3) g[2][x] = 0x00e5ff;
                g[2][15] = 0xff1744;
                return { g, gx: 4, gy: 5, angle: -4 };
            }
        },
        katana: {
            holo() {
                const g = katanaShape({ hilt: [0x616161, 0x9e9e9e], tsuba: 0x00e5ff, blade: [0x00b8d4, 0x18ffff, 0xe0ffff], tip: 0x84ffff });
                for (let x = 8; x < 31; x += 4) g[1][x] = 0x4dd0e1;
                return { g, gx: 3, gy: 2 };
            },
            red() { return { g: katanaShape({ hilt: [0x111111, 0xb71c1c], tsuba: 0xffca28, blade: [0xb71c1c, 0xe53935, 0xff8a80], tip: 0xff8a80 }), gx: 3, gy: 2 }; },
            shinai() {
                const p = painter(34, 5);
                p.rect(0, 1, 7, 3, (x) => x % 2 ? 0xe0e0e0 : 0xf5f5f5);
                p.rect(7, 0, 2, 5, 0x5d4037);
                p.rect(9, 1, 22, 3, (x, y) => ((x - 9) % 7 === 6) ? 0xa1887f : y === 1 ? 0xf0dcaa : 0xe6cf98);
                p.px(22, 2, 0x6d4c41);
                p.rect(31, 1, 3, 3, 0xefebe9);
                return { g: p.g, gx: 3, gy: 2 };
            },
            pink() { return { g: katanaShape({ hilt: [PINK.d, 0xf06292], tsuba: 0xff80ab, blade: [PINK.l, PINK.w, 0xffffff], tip: PINK.xl }), gx: 3, gy: 2 }; },
            dark() { return { g: katanaShape({ hilt: [0x212121, 0x4a148c], tsuba: 0x7c4dff, blade: [0x212121, 0x37474f, 0x7c4dff], tip: 0xb388ff }), gx: 3, gy: 2 }; },
            golden() { return { g: katanaShape({ hilt: [0x3e2723, 0xffca28], tsuba: 0xc79100, blade: [0xc79100, 0xffd54f, 0xfff8e1], tip: 0xfff59d }), gx: 3, gy: 2 }; },
            ice() { return { g: katanaShape({ hilt: [0x01579b, 0xe1f5fe], tsuba: 0x80deea, blade: [0x4fc3f7, 0xb3e5fc, 0xffffff], tip: 0xe1f5fe }), gx: 3, gy: 2 }; },
            flame() {
                const g = katanaShape({ hilt: [0x212121, 0xff6d00], tsuba: 0xffab00, blade: [0xe65100, 0xff9800, 0xffeb3b], tip: 0xfff176 });
                for (let x = 10; x < 30; x += 4) g[0][x] = 0xff9800;
                return { g, gx: 3, gy: 2 };
            },
            jade() { return { g: katanaShape({ hilt: [0x1b5e20, 0xffd54f], tsuba: 0xffd54f, blade: [0x2e7d32, 0x66bb6a, 0xc8e6c9], tip: 0xa5d6a7 }), gx: 3, gy: 2 }; },
            bamboo() {
                // Bambuk tayoq: bo'g'imli yashil novda
                const p = painter(34, 5);
                p.rect(0, 1, 33, 3, (x, y) => (x % 7 === 6) ? 0x33691e : y === 1 ? 0xaed581 : y === 2 ? 0x8bc34a : 0x689f38);
                p.px(33, 1, 0xaed581); p.px(10, 0, 0x7cb342); p.px(11, 0, 0x9ccc65);
                return { g: p.g, gx: 3, gy: 2 };
            }
        },
        kunai: {
            cards() {
                const p = painter(12, 11);
                const card = (x, y) => { p.rect(x, y, 5, 7, 0xfafafa); p.rect(x, y, 1, 7, 0xd6d6d6); };
                card(0, 4); card(3, 2); card(6, 0);
                p.px(2, 7, 0xe53935); p.px(5, 5, 0x212121); p.px(5, 4, 0x212121); p.px(8, 3, 0xe53935); p.px(9, 2, 0xe53935);
                return { g: p.g, gx: 2, gy: 7 };
            },
            toothbrush() {
                const p = painter(16, 4);
                p.rect(0, 2, 12, 2, (x, y) => y === 2 ? 0x90caf9 : 0x42a5f5);
                p.rect(12, 2, 4, 2, 0x1e88e5);
                p.rect(12, 0, 4, 2, (x) => x % 2 ? 0xffffff : 0x80deea);
                return { g: p.g, gx: 3, gy: 2.5 };
            },
            dart() {
                const p = painter(16, 7);
                p.rect(0, 0, 3, 3, (x, y) => (x + y >= 2) ? 0xe53935 : null);
                p.rect(0, 4, 3, 3, (x, y) => (x - (y - 4) >= 0) ? 0xffeb3b : null);
                p.rect(2, 3, 4, 1, 0x212121);
                p.rect(6, 2, 6, 3, (x) => x % 2 ? 0x78909c : 0xb0bec5);
                p.rect(12, 3, 4, 1, 0xeceff1); p.px(12, 2, 0xcfd8dc); p.px(12, 4, 0xcfd8dc);
                return { g: p.g, gx: 8, gy: 3 };
            },
            pencil() {
                // Qalam: o'chirg'ich, sariq tana, uchli grafit
                const p = painter(16, 4);
                p.rect(0, 0, 2, 4, 0xf48fb1); p.rect(2, 0, 1, 4, 0x9e9e9e);
                p.rect(3, 0, 10, 4, (x, y) => y === 0 ? 0xfff176 : y === 3 ? 0xf9a825 : 0xfbc02d);
                p.rect(13, 0, 1, 4, 0xe0b98a); p.rect(14, 1, 1, 2, 0xe0b98a); p.rect(15, 1, 1, 2, 0x424242);
                return { g: p.g, gx: 4, gy: 1.5 };
            },
            fork() {
                // Sanchqi
                const p = painter(16, 5), S = 0xcfd8dc;
                p.rect(0, 2, 9, 1, S); p.rect(0, 1, 4, 3, (x, y) => y === 1 ? 0xeceff1 : 0xb0bec5);
                p.rect(9, 1, 2, 3, S);
                [0, 2, 4].forEach(y => p.rect(11, y, 5, 1, y === 0 ? 0xeceff1 : S));
                return { g: p.g, gx: 2, gy: 2 };
            },
            feather() {
                // Pat: oq o'zak, to'q sariq yelpig'ich
                const p = painter(16, 5);
                p.rect(0, 2, 16, 1, 0xfafafa);
                p.rect(4, 1, 11, 1, 0xff7043); p.rect(4, 3, 11, 1, 0xf4511e);
                p.rect(7, 0, 7, 1, 0xffab91); p.rect(7, 4, 7, 1, 0xff8a65);
                p.px(9, 1, 0xfafafa); p.px(12, 3, 0xfafafa);
                return { g: p.g, gx: 3, gy: 2 };
            },
            golden() { const p = kunaiShape(0x6d4c41, 0x3e2723, 0xfff59d, 0xffca28); p.px(10, 2, 0xffffff); return { g: p.g, gx: 4, gy: 2 }; },
            icicle() {
                // Muz parchasi: uzun cho'zinchoq kristall
                const p = painter(16, 5);
                for (let x = 0; x < 16; x++) {
                    const hw = x < 6 ? Math.round(x / 3) : Math.round((15 - x) / 4.5);
                    for (let y = 2 - hw; y <= 2 + hw; y++) p.px(x, y, y < 2 ? 0xe1f5fe : y === 2 ? 0x81d4fa : 0x4fc3f7);
                }
                p.px(5, 1, 0xffffff); p.px(9, 1, 0xffffff);
                return { g: p.g, gx: 3, gy: 2 };
            }
        }
    };

    // Qurol qo'lda: tekstura, dasta nuqtasi (kenglik ulushi), qo'l joyi (px, o'yin masshtabida) va burchak
    const POSE = {
        knight: { kind: 'sword', slot: 'sword', ox: 0.1, hand: [9, 8], angle: -58 },
        samurai: { kind: 'katana', slot: 'katana', ox: 0.12, hand: [9, 8], angle: 152 },
        archer: { kind: 'bow', slot: 'bow', ox: 0.2, hand: [8, 4], angle: 18 },
        mage: { kind: 'staff', slot: 'staff', ox: 0.6, hand: [9, 6], angle: -38 },
        shotgun: { kind: 'shotgun', slot: 'shotgun', ox: 0.3, hand: [9, 6], angle: 0 },
        kunai: { kind: 'kunai', slot: 'kunai', ox: 0.25, hand: [11, 6], angle: 12 },
        hunter: { kind: 'hknife', slot: 'hknife', ox: 0.15, hand: [9, 8], angle: -40 },
        blowpipe: { kind: 'blowpipe', slot: 'blowpipe', ox: 0.3, hand: [8, -2], angle: -6 }
    };

    // Tayyor (kontur qo'shilgan) rasm: bosh/yuz - { grid, ax, ay }, qurol - { grid, ox, oy }, qalqon - { grid }
    const cache = {};
    function art(slot, id) {
        const key = slot + ':' + id;
        if (key in cache) return cache[key];
        let res = null;
        const src = slot === 'head' ? HEAD : slot === 'face' ? FACE : WEAPONS[slot];
        const fn = src && src[id];
        if (typeof fn === 'function') {
            const a = fn();
            const grid = outline(a.g);
            const W = grid[0].length, H = grid.length;
            if (slot === 'head' || slot === 'face') res = { grid, ax: a.ax, ay: a.ay };
            else if (slot === 'shield') res = { grid };
            else res = { grid, ox: (a.gx + 1.5) / W, oy: (a.gy + 1.5) / H, angle: a.angle };   // angle - o'z burchagi (bo'lmasa - personajniki)
        }
        cache[key] = res;
        return res;
    }
    const has = (slot, id) => !!(id && (slot === 'body' ? clothesOf(id) : art(slot, id)));

    // "cowboy|hockey|bat||..." -> { head: 'cowboy', face: 'hockey', sword: 'bat' } (obyekt bo'lsa o'zi)
    function parseLook(look) {
        if (look && typeof look === 'object') return look;
        const out = {};
        String(look || '').split('|').forEach((id, i) => { if (id && SLOTS[i]) out[SLOTS[i]] = id; });
        return out;
    }

    // ===== CANVAS (lobbi, "My Character", do'kon ikonkalari) =====
    const toHex = (c) => typeof c === 'number' ? '#' + c.toString(16).padStart(6, '0') : c;
    const toInt = (c) => typeof c === 'number' ? c : parseInt(String(c || '#1e88e5').replace('#', ''), 16);
    function paint(ctx, grid, x, y, s = 1) {
        grid.forEach((row, yy) => row.forEach((c, xx) => {
            if (c === null) return;
            ctx.fillStyle = toHex(c);
            ctx.fillRect(x + xx * s, y + yy * s, s, s);
        }));
    }
    const canvasCache = {};
    function gridCanvas(key, grid) {
        if (canvasCache[key]) return canvasCache[key];
        const cv = document.createElement('canvas');
        cv.width = grid[0].length; cv.height = grid.length;
        paint(cv.getContext('2d'), grid, 0, 0, 1);
        canvasCache[key] = cv;
        return cv;
    }

    // Qahramon (o'yindagi ko'rinishi, 1 katak = 1px): 64x48 lik sahnada markazi (30, 30).
    // (ox, oy) - siljish (lobbi o'rinlarida sahnaning bir qismi ko'rinadi)
    // ===== YANGI QAHRAMON (Gemini rasmi, /public/hero/hero.png): kulrang varaq, 11 kadr 42x55 - qahramon rangiga bo'yaladi =====
    // 0/1 turish, 2/3 yurish (yaqin / uzoq oyoq oldinda - navbat bilan), 4 sakrash, 5 tushish, 6 qo'l ko'tarish, 7 zarba. Yuklanmaguncha / yuklanmasa - eski tana (bodyGrid)
    // 0/1 turish, 2-5 yurish, 6 sakrash, 7 tushish, 8 qo'l ko'tarish, 9 zarba, 10 nishonga olish (arbalet / drobovik), 11 tepki, 12 yuqoriga nishon,
    // 13 ninja tayyor, 14 otilish, 15 zarbadan keyin (qo'llar orqada), 16 yuqoriga kesish, 17 cho'kib qo'nish, 18 o'tirish (ajdarda)
    // fistR2 - musht doirasi (radius^2): shu piksellar qurol ustidan qayta chiziladi
    // hands - har kadrda O'NG musht (qurol shu yerda; turish kadrida ekranning chap tomonidagi qo'l), lhands - chap musht (qalqon) (kadr kataklarida), wang - shu kadrlarda qurol burchagi (o'ngga qaraganda, gradus)
    const HERO = { src: '/public/hero/hero.png?v=4', w: 64, h: 58, n: 19, mid: 196, wpn: 0.6, fistR2: 10, hands: [[20,42],[20,43],[18,37],[22,40],[19,35],[21,37],[17,32],[13,33],[20,9],[45,31],[52,22],[49,18],[49,14],[19,31],[51,30],[6,29],[29,6],[21,44],[20,48]],
        lhands: [[41,41],[41,41],[38,36],[37,40],[40,37],[39,36],[40,32],[48,33],[47,36],[45,31],[52,22],[49,18],[49,14],[42,35],[51,30],[6,29],[43,5],[36,42],[41,47]],
        wang: { 10: 0, 11: -8, 12: -45, 13: -50, 14: 0, 15: 170, 16: -90, 17: 150 },
        // rest - qo'l tana yonida (0-7 kadrlar) qurol burchagi: qilich pastga-orqaga, tayoq tik, arbalet / drobovik pastga
        rest: { sword: 125, katana: 152, staff: -88, bow: 110, shotgun: 110, kunai: 120, hknife: 120, blowpipe: 60 } };
    // BOSH har kadrda: [markaz x, tepasi, visor qatori, kengligi, visor x0, x1, y0, y1] (kadr kataklarida)
    HERO.heads = [[31.5,5,16,20,29,40,15,17],[31.5,5,16,20,29,40,15,17],[32,6,14,15,31,38,13,15],[32,9,17,15,31,38,16,17],[32,5,13,15,30,38,12,14],[32,4,12,15,31,38,11,13],[31.5,3,13,18,30,39,12,14],[31.5,5,15,18,29,39,14,16],[35.5,5,16,20,33,44,14,17],[31.5,6,18,20,29,40,16,19],[32,6,14,15,30,38,13,15],[31.5,6,14,14,30,37,13,15],[28,6,14,15,26,34,13,15],[31.5,8,16,14,30,37,15,17],[32,14,23,15,31,38,22,23],[32,9,17,15,30,38,16,18],[34.5,7,15,20,30,38,14,15],[31.5,15,24,14,31,37,23,24],[31.5,11,22,20,29,40,21,23]];
    // eski tana (32x48 quti) uchun chizilgan bosh kiyimi / yuz buyumi -> shu kadrdagi boshga: masshtab k = bosh kengligi / 32,
    // bosh kiyimi - bosh tepasiga, yuz buyumi - visorga (eski visor markazi: tana tepasidan 14 px). Natija - kadr kataklarida markaz va k
    function heroHeadPlace(f, slot, dxOld, dyOld) {
        const h = HERO.heads[f] || HERO.heads[0], k = h[3] / 32;
        return { x: h[0] + 0.5 + k * dxOld, y: slot === 'face' ? h[2] + 0.5 + k * 0.75 * (dyOld + 10) : h[1] + k * (dyOld + 24), k };   // yuz pastki qismi qisqa - 0.75
    }
    const heroRest = (f, kind) => ((f < 8 || f === 18) && HERO.rest[kind] !== undefined ? HERO.rest[kind] : undefined);
    let heroImg = null, heroOk = false;
    const heroCache = new Map();

    // ===== KIYIM (body): qahramon tanasining o'z piksellari bo'yaladi - har kadrga o'zi moslashadi =====
    // Kadr geometriyasi (siluetdan): bo'yin (visordan pastdagi eng tor qator), oyoq osti, bel, tizza; qo'llar (mushtlar) - tana rangida qoladi
    const geomCache = new Map();
    function heroGeom(p, f) {
        if (geomCache.has(f)) return geomCache.get(f);
        const W = HERO.w, H = HERO.h, ext = [];
        let foot = 0;
        for (let y = 0; y < H; y++) { let a = -1, b = -1; for (let x = 0; x < W; x++) if (p[(y * W + x) * 4 + 3]) { if (a < 0) a = x; b = x; } ext.push([a, b]); if (a >= 0) foot = y; }
        const hd = HERO.heads[f] || HERO.heads[0], v = hd[2];
        let neck = v + 5, best = 1e9;
        for (let y = v + 3; y <= Math.min(foot - 12, v + 12); y++) { const e = ext[y]; if (e[0] < 0) continue; const w = e[1] - e[0]; if (w < best) { best = w; neck = y; } }
        neck = Math.max(neck, Math.round(hd[7] + hd[3] * 0.3 + 1));   // yon ko'rinishda iyak eng tor qatordan pastda - kiyim iyakka chiqmasin
        const L = foot - neck, g = { neck, foot, cx: hd[0], waist: Math.round(neck + L * 0.42), knee: Math.round(neck + L * 0.74), ext,
            hands: [HERO.hands[f] || [0, 0], HERO.lhands[f] || [0, 0]] };
        g.mid = Math.round(g.waist + (g.knee - g.waist) * 0.55); g.long = foot - 2;
        // TORSO MARKAZI: bo'yin va bel orasidagi qatorlarda bosh markaziga eng yaqin uzluksiz bo'lak (tor - qo'lsiz) markazlarining medianasi.
        // Galstuk, zamok, tugmalar, yubka shu tik chiziq bo'ylab - yon ko'rinishda ham qiyshaymaydi
        const run = (y, x0) => { const op = (x) => x >= 0 && x < W && p[(y * W + x) * 4 + 3]; let x = Math.round(x0); if (!op(x)) { let k = 1; while (k < 8 && !op(x - k) && !op(x + k)) k++; x = op(x - k) ? x - k : x + k; if (!op(x)) return null; } let a = x, b = x; while (op(a - 1)) a--; while (op(b + 1)) b++; return [a, b]; };
        const cs = [];
        for (let y = neck + 1; y < g.waist; y++) { const r = run(y, hd[0]); if (r && r[1] - r[0] <= 15) cs.push((r[0] + r[1]) / 2); }
        cs.sort((a, b) => a - b);
        g.tcx = cs.length ? cs[Math.floor(cs.length / 2)] : hd[0];
        // YON KADR (bosh tor - profil): detallar (galstuk, yoqa, zamok) ko'krakda - torsoning oldingi (o'ng) chetidan 2 px ichkarida
        g.side = hd[3] <= 16;
        const fr = {};
        for (let y = neck; y <= g.waist + 1; y++) { const r = run(y, cs.length ? cs[Math.floor(cs.length / 2)] : hd[0]); fr[y] = r && r[1] - r[0] <= 15 ? r[1] - 2 : null; }
        const frs = Object.values(fr).filter(v => v !== null).sort((a, b) => a - b), frMed = frs.length ? frs[Math.floor(frs.length / 2)] : g.tcx + 3;
        g.tc = () => g.side ? frMed : g.tcx;   // tekis tik chiziq (zinapoya bo'lmasin)
        g.elbow = Math.round(neck + (g.waist - neck) * 0.5);
        const wr = run(g.waist, g.tcx);
        g.wHalf = wr && wr[1] - wr[0] <= 15 ? Math.max(3.5, Math.min(6.5, (wr[1] - wr[0]) / 2)) : 5;
        geomCache.set(f, g);
        return g;
    }
    const hsh = (x, y) => ((Math.floor(x / 2) * 928371 + Math.floor(y / 2) * 123457 + 7) % 11);
    const CAMO = [0x556b2f, 0x6b8e23, 0x3e4a1f, 0x8d7b4a];
    // top / leg / shoe: rang yoki (x, y, g) => rang (null - tana rangi qoladi); skirt: { hem: 'knee' | 'mid' | 'long', flare, col }
    const CLOTHES = {
        // ---- QIZLAR UCHUN ----
        pinkdress: { top: (x, y, g) => y <= g.neck + 1 ? 0xfce4ec : 0xf06292, skirt: { hem: 'knee', flare: 3, col: (x, y, g, hem) => y >= hem ? 0xfce4ec : 0xec407a }, shoe: 0x880e4f },
        flowerdress: { top: (x, y, g) => y === g.waist - 1 ? 0x66bb6a : (x * 7 + y * 3) % 9 === 0 ? 0xf06292 : 0xfff8e1,
            skirt: { hem: 'knee', flare: 3, col: (x, y) => (x * 7 + y * 3) % 9 === 0 ? 0xf06292 : (x * 5 + y * 11) % 13 === 0 ? 0x42a5f5 : 0xfff8e1 }, shoe: 0xf06292 },
        sweater: { top: (x, y, g) => (y - g.neck) % 3 === 0 ? 0xffffff : 0x80cbc4, skirt: { hem: 'mid', flare: 2, col: (x) => x % 3 === 0 ? 0xc2185b : 0xec407a }, shoe: 0x5d4037 },
        tutu: { top: 0xce93d8, skirt: { hem: 'mid', flare: 5, col: (x, y) => (x + y) % 5 === 0 ? 0xffffff : y % 2 ? 0xf48fb1 : 0xf8bbd0 }, leg: 0xfce4ec, shoe: 0xec407a },
        gown: { top: (x, y, g) => y === g.waist - 1 ? 0xffca28 : 0x7e57c2, skirt: { hem: 'long', flare: 4, col: (x, y) => (x * 13 + y * 7) % 17 === 0 ? 0xfff59d : 0x673ab7 }, shoe: 0x4527a0 },
        pinktee: { top: (x, y, g) => (y >= g.neck + 3 && y <= g.neck + 4 && Math.abs(x - g.tc(y)) <= 1 && !(y === g.neck + 4 && Math.abs(x - g.tc(y)) === 1)) ? 0xfafafa : 0xf48fb1, leg: 0x64b5f6, shoe: 0xfafafa },
        // ---- O'G'IL BOLALAR UCHUN ----
        suit: { top: (x, y, g) => { const d = Math.abs(x - g.tc(y)); if (d < 0.6 && y > g.neck + 1) return 0x1e88e5; if (d <= 1.6 && y <= g.neck + 4) return 0xfafafa; return 0x283593; }, leg: 0x283593, shoe: 0x111111 },
        school: { top: (x, y, g) => (Math.abs(x - g.tc(y)) < 0.6 && y > g.neck + 1) ? 0x0d47a1 : 0xf5f5f5, leg: 0x212121, shoe: 0x111111 },
        tracksuit: { top: (x, y, g) => (x <= g.ext[y][0] + 1 || x >= g.ext[y][1] - 1) ? 0xfafafa : y <= g.neck + 1 ? 0x37474f : 0x212121, leg: (x, y, g) => (x <= g.ext[y][0] + 1 || x >= g.ext[y][1] - 1) ? 0xfafafa : 0x212121, shoe: 0xfafafa },
        plaid: { top: (x, y) => (x % 4 === 0 || y % 4 === 0) ? 0x212121 : (Math.floor(x / 2) + Math.floor(y / 2)) % 2 ? 0xc62828 : 0x8e0000, leg: 0x1565c0, shoe: 0xfafafa },
        hoodie: { top: (x, y, g) => (y === g.neck + 1 && Math.abs(x - g.tc(y)) === 1) ? 0xfafafa : (y >= g.waist - 3 && Math.abs(x - g.tc(y)) <= 2) ? 0x1565c0 : 0x1e88e5, leg: 0x37474f, shoe: 0xfafafa },
        football: { top: (x, y, g) => (y <= g.neck + 1 || Math.round(x - g.tc(y)) === 0) ? 0xfafafa : 0xd32f2f, leg: (x, y, g) => y <= g.mid ? 0xfafafa : y >= g.foot - 6 ? 0xd32f2f : null, shoe: 0x212121 },
        leather: { top: (x, y, g) => Math.round(x - g.tc(y)) === 0 ? 0xbdbdbd : y <= g.neck + 1 ? 0x3e2723 : 0x4e342e, leg: 0x1565c0, shoe: 0x3e2723 },
        camo: { top: (x, y) => CAMO[hsh(x, y) % 4], leg: (x, y, g) => y === g.waist ? 0x3e2723 : CAMO[hsh(x, y + 1) % 4], shoe: 0x212121 },
        tuxedo: { top: (x, y, g) => { const d = Math.abs(x - g.tc(y)); if (y >= g.neck + 1 && y <= g.neck + 2 && d <= 2) return 0xd32f2f; if (d <= 1) return 0xfafafa; return 0x212121; }, leg: 0x212121, shoe: 0x111111 }
    };
    // ===== KIYIM KONSTRUKTORI =====
    // Kod: "y" + 10 ta 36-lik raqam [ustki rang, naqsh, naqsh rangi, pasti, pastki rang, oyoq kiyim rangi, yoqa, yeng, kamar, oyoq kiyim turi]
    // (eski "x" + 7 ta 16-lik raqam ham o'qiladi). Server: cosmetics.ts validCustomOutfit
    const OM_PAL = [0xfafafa, 0x212121, 0x9e9e9e, 0xe53935, 0xf06292, 0xff9800, 0xfdd835, 0x43a047, 0x80cbc4, 0x1e88e5, 0x283593, 0x8e24aa, 0x6d4c41, 0xd7ccc8, 0x64b5f6, 0x556b2f,
        0xfce4ec, 0xce93d8, 0xb71c1c, 0xffd54f, 0x00897b, 0x1b5e20, 0xffccbc, 0x4fc3f7, 0xff7043, 0x3e2723, 0xc0ca33, 0x37474f, 0x880e4f, 0xfff8e1, 0x5c6bc0, 0xa1887f];
    const OM = { pal: OM_PAL, patterns: 10, bottoms: 7, necks: 6, sleeves: 2, belts: 4, shoes: 2, def: 'y9100a110003' };
    const customRe = /^(x[0-9a-f]{7}|y[0-9a-z]{10,11})$/, customCache = new Map();
    let myCustom = '';
    function omParse(code) {
        if (!customRe.test(code || '')) return null;
        if (code[0] === 'x') {   // eski format -> yangi
            const [t, p, a, b, c, s, n] = code.slice(1).split('').map(h => parseInt(h, 16));
            if (p > 4 || b > 3 || n > 3) return null;
            return [t, [0, 1, 3, 4, 9][p], a, [0, 1, 3, 4][b], c, s, n, 0, 0, 0, a];
        }
        const d = code.slice(1).split('').map(h => parseInt(h, 36));
        if (d.length === 10) d.push(d[2]);   // yoqa buyumi rangi yo'q - naqsh rangi
        const max = [32, OM.patterns, 32, OM.bottoms, 32, 32, OM.necks, OM.sleeves, OM.belts, OM.shoes, 32];
        return d.every((v, i) => v < max[i]) ? d : null;
    }
    const omCode = (d) => 'y' + d.map(v => v.toString(36)).join('');
    function customClothes(code) {
        if (customCache.has(code)) return customCache.get(code);
        const d = omParse(code);
        if (!d) { customCache.set(code, null); return null; }
        const [ti, pi, ai, bi, ci, si, ni, sli, bti, boi, nci] = d;
        const T = OM_PAL[ti], A = OM_PAL[ai], Bc = OM_PAL[ci], Sc = OM_PAL[si], N = OM_PAL[nci];
        const dark = (c) => mix(c, 0x000000, 0.4), acc = N === T ? dark(N) : N;
        const edge = mix(T, 0x000000, 0.55);   // galstuk / kapalak atrofidagi kontur - ko'ylakdan ajralib tursin
        // NAQSHLAR - yirik (2 px), o'yin o'lchamida aniq ko'rinsin; torso markazi va bo'yinga nisbatan (yurganda "suzmaydi")
        const md = (v, n) => ((v % n) + n) % n;
        const pat = (x, y, g, base) => {
            const tx = Math.round(g.tcx), ry = y - g.neck;
            switch (pi) {
                case 1: return md(ry, 4) >= 2 ? A : base;                                            // yo'l-yo'l (2 px)
                case 2: return md(x - tx, 4) < 2 ? A : base;                                         // tik chiziqlar (2 px)
                case 3: return (Math.floor((x - tx) / 2) + Math.floor(ry / 2)) % 2 ? A : base;      // katak (shaxmat, 2 px)
                case 4: { const row = Math.floor(ry / 4); return md(ry, 4) < 2 && md(x - tx + (row % 2) * 2, 4) < 2 && ry > 0 ? A : base; }   // no'xat (2x2)
                case 5: return md(x + y, 5) < 2 ? A : base;                                          // qiya chiziqlar
                case 6: return x < g.tcx ? A : base;                                                  // ikki rang
                case 7: { const k = Math.max(0, Math.min(1, ry / Math.max(1, g.waist - g.neck))); return mix(base, A, Math.round(k * 2) / 2); }   // o'tish (3 pog'ona)
                case 8: { const mx = md(x - tx, 7), my = md(ry, 7); return (mx === 3 && my >= 2 && my <= 4) || (my === 3 && mx >= 2 && mx <= 4) ? A : base; }   // yulduzchalar
                case 9: return [base, A, mix(base, 0x000000, 0.35), mix(A, 0xffffff, 0.2)][hsh(x, y) % 4];   // kamuflyaj
                default: return base;
            }
        };
        const BELT = [0, 0x111111, 0x5d4037, 0x111111][bti];
        const top = (x, y, g) => {
            const fx = g.tc(y), d0 = Math.abs(x - fx);
            const ry = y - g.neck, sd = g.side;
            if (bti && (y === g.waist - 1 || y === g.waist - 2)) return bti === 3 && d0 <= 1.5 ? 0xffd54f : bti === 2 && d0 <= 1.5 && y === g.waist - 1 ? 0xbdbdbd : BELT;   // kamar (2 px; oltin / kumush to'qa)
            if (bi === 6 && ry >= 2) {   // kombinezon: ikki bog'ich va ko'krakcha
                const strap = sd ? Math.abs(x - (fx - 3)) < 1 : Math.abs(d0 - 3) < 1;
                if (strap || (y >= g.waist - 4 && (sd ? x >= fx - 4 : d0 <= 3.5))) return Bc;
            }
            if (ni === 1 && ry >= 1 && ry <= 3) { const lo = sd ? 0 : [0, 1.5, 0.5, 0][ry], hi = sd ? 2.5 : [0, 4, 3, 1.5][ry]; if (d0 >= lo && d0 <= hi && !(sd && ry === 3)) return 0xfafafa; }   // oq V-yoqa
            if (ni === 2 || ni === 3) {   // galstuk / kapalak: oq yoqa uchlari bilan
                if (!sd && ry === 1 && d0 >= 2.5 && d0 <= 4.5) return 0xfafafa;
                if (sd && ry === 1 && x >= fx - 3 && x <= fx - 1) return 0xfafafa;
            }
            if (ni === 2) {   // GALSTUK: 3 px tugun, 3 px tanasi (o'rtasi yorug'), pastida uchli; atrofida to'q kontur
                const end = g.waist - 2, w = sd ? 1 : (ry <= 2 ? 1.5 : y >= end - 1 ? (y === end ? 0.5 : 1) : 1.5);
                if (ry >= 1 && y <= end) {
                    if (d0 <= w) return ry <= 2 ? mix(acc, 0x000000, 0.25) : d0 < 0.6 ? mix(acc, 0xffffff, 0.18) : acc;
                    if (d0 <= w + 1 && ry >= 3) return edge;
                }
            }
            if (ni === 3 && ry >= 2 && ry <= 4) {   // KAPALAK: ikki uchburchak qanot (9 px), o'rtada to'q tugun; atrofida kontur
                if (sd) { if (x >= fx - 2 && x <= fx + 1) return x >= fx - 0.5 && x <= fx + 0.5 ? mix(acc, 0x000000, 0.35) : acc; }
                else {
                    const wing = 4.5, inner = ry === 3 ? 0 : 1.5;
                    if (d0 < 1) return mix(acc, 0x000000, 0.35);
                    if (d0 >= inner && d0 <= wing) return acc;
                    if (d0 <= wing + 1) return edge;
                }
            }
            if (ni === 4 && (ry <= 2 || (ry <= 7 && (sd ? Math.abs(x - fx) < 1.5 : (x >= g.tcx - 3 && x <= g.tcx - 1))))) return ry === 2 || ry > 2 ? dark(N) : N;   // sharf (bo'yinda + osilgan uchi)
            if (ni === 5 && ry === 3 && d0 <= (sd ? 2 : 4)) return md(x, 2) ? 0xffd54f : 0xfff59d;   // oltin marjon
            return pat(x, y, g, T);
        };
        const shoeH = boi ? 7 : 4;
        let def;
        if (bi === 0 || bi === 6) def = { top, leg: Bc, shoe: Sc };                                                        // shim / kombinezon
        else if (bi === 1) def = { top, leg: (x, y, g) => y <= g.mid ? Bc : null, shoe: Sc };                            // shorti
        else def = { top, skirt: { hem: bi === 2 ? 'mini' : bi === 3 ? 'knee' : bi === 4 ? 'long' : 'mid', flare: bi === 5 ? 7 : bi === 4 ? 5 : 3, puffy: bi === 5,
            col: (x, y, g, hem) => bi === 5 ? ((y - g.waist) % 2 ? mix(Bc, 0xffffff, 0.35) : Bc) : Bc }, shoe: Sc };
        def.short = sli === 1; def.shoeH = shoeH; def.boots = !!boi; def.sneaker = !boi;
        customCache.set(code, def);
        return def;
    }
    // kiyim id -> chizish qoidasi: katalogdagi kiyim, o'yinchi kodi yoki "custom" (o'zimning kiyimim)
    function clothesOf(id) {
        if (!id) return null;
        if (id === 'custom') return clothesOf(myCustom || OM.def);
        if (CLOTHES[id]) return CLOTHES[id];
        return customRe.test(id) ? customClothes(id) : null;
    }
    const bodyKey = (id) => id === 'custom' ? (myCustom || OM.def) : id;
    // kiyim rangini tananing kulrang soyasi bilan bo'yaydi (konturlar qora qoladi)
    function clothPx(p, i, col, t) {
        const cr = (col >> 16) & 255, cg = (col >> 8) & 255, cb = col & 255, k = Math.min(1, t), hi = Math.max(0, Math.min(1, (t - 1) * 2.2)) * 0.4;
        p[i] = Math.round(cr * k + (255 - cr * k) * hi); p[i + 1] = Math.round(cg * k + (255 - cg * k) * hi); p[i + 2] = Math.round(cb * k + (255 - cb * k) * hi); p[i + 3] = 254;
    }
    function applyClothes(p, f, id) {
        const C = clothesOf(id); if (!C) return;
        const W = HERO.w, g = heroGeom(p, f), [h1, h2] = g.hands;
        const near = (x, y, h, r) => (x - h[0]) * (x - h[0]) + (y - h[1]) * (y - h[1]) <= r * r;
        const isHand = (x, y) => near(x, y, h1, 2.6) || near(x, y, h2, 2.6);
        const isArm = (x, y) => [h1, h2].some(h => Math.abs(x - h[0]) <= 3 && y >= h[1] - 12 && y <= h[1] + 2);
        const val = (c, x, y, ...a) => typeof c === 'function' ? c(x, y, g, ...a) : c;
        const grey = (i) => p[i] / HERO.mid;
        // YUBKA: torso markazi atrofida SIMMETRIK qo'ng'iroq (yoki balerina - tez kengayadi); oyoqlarni yopadigan kenglik (qo'llar hisobga olinmaydi)
        let sk = null;
        if (C.skirt) {
            const S = C.skirt, hemY = S.hem === 'long' ? g.long : S.hem === 'mini' ? Math.round(g.waist + (g.knee - g.waist) * 0.45) : S.hem === 'mid' ? g.mid : g.knee;
            const c0 = g.tcx, w0 = g.wHalf;
            let hl = 1e9, hr = -1;
            for (let x = Math.max(0, Math.round(c0 - 14)); x <= Math.min(W - 1, Math.round(c0 + 14)); x++) { const i = (hemY * W + x) * 4; if (p[i + 3] && !isHand(x, hemY) && !isArm(x, hemY)) { hl = Math.min(hl, x); hr = Math.max(hr, x); } }
            const need = hr < 0 ? w0 + S.flare : Math.max(c0 - hl + 1, hr - c0 + 1);
            const H = Math.max(w0 + 1, Math.min(w0 + S.flare + 3, Math.max(w0 + S.flare, need)));
            sk = { hemY, c0, rows: {} };
            for (let y = g.waist; y <= hemY; y++) {
                const t = (y - g.waist) / Math.max(1, hemY - g.waist), k = S.puffy ? Math.min(1, t * 1.8) : Math.pow(t, 0.85);
                const half = w0 + (H - w0) * k;
                let L = Math.round(c0 - half), R = Math.round(c0 + half);
                // yubka qatorida tananing (qo'llardan tashqari) HAMMA joyi yopiladi - yon ko'rinishda orqa tomon (dumba) ham
                for (let x = Math.max(0, Math.round(c0 - 14)); x <= Math.min(W - 1, Math.round(c0 + 14)); x++) { const i = (y * W + x) * 4; if (p[i + 3] && !isHand(x, y) && !isArm(x, y)) { if (x < L) L = x; if (x > R) R = x; } }
                sk.rows[y] = [L, R];
            }
            // kalta yubka (mini, balerina, tizzagacha bo'lmagan): ostida to'q shortik - oyoqlar ochilganda ham hech narsa ko'rinmaydi
            sk.under = hemY < g.knee ? Math.min(g.knee - 1, hemY + 3) : 0;
        }
        const shoeH = C.shoeH || 4;
        for (let y = g.neck; y <= g.foot; y++) for (let x = 0; x < W; x++) {
            const i = (y * W + x) * 4, a = p[i + 3];
            const r = sk && sk.rows[y];
            if (r && x >= r[0] && x <= r[1]) {
                if (a && isHand(x, y)) continue;
                if (a && isArm(x, y) && Math.abs(x - sk.c0) > g.wHalf - 1) { const c = val(C.top, x, y); if (c != null) clothPx(p, i, c, grey(i)); continue; }   // qo'l yubka OLDIDA (yeng)
                const edge = x === r[0] || x === r[1], hem = y === sk.hemY;
                const pleat = ((x - Math.round(sk.c0)) % 3 + 3) % 3 === 0 && y > g.waist + 1;
                const col = val(C.skirt.col, x, y, sk.hemY);
                const tv = edge ? 0.14 : hem ? 0.62 : pleat ? 0.78 : (a ? Math.max(0.8, Math.min(1.05, grey(i))) : 0.92);
                clothPx(p, i, col, tv);
                continue;
            }
            if (!a || a === 254 || isHand(x, y)) continue;
            let c;
            if (y < g.waist || isArm(x, y)) {
                if (C.short && y > g.elbow && (Math.abs(x - g.tcx) > g.wHalf + 0.5 || isArm(x, y))) continue;   // qisqa yeng: tirsakdan pasti - tana rangida (ikkala qo'lda bir xil)
                c = val(C.top, x, y);
            }
            else if (sk && y > sk.hemY && y <= sk.under && !isArm(x, y)) c = mix(val(C.skirt.col, x, sk.hemY, sk.hemY), 0x000000, 0.45);   // yubka ostidagi shortik
            else if (y > g.foot - shoeH && C.shoe !== undefined && !isArm(x, y)) {
                // OYOQ KIYIM: krossovka - oq tag, tepasida bog'ich chizig'i; etik - to'q tag, tepasida qaytarma. Kontur qora qoladi, ichi yorug'
                const sc = val(C.shoe, x, y), gv = grey(i), r0 = y - (g.foot - shoeH + 1);
                let sh = sc;
                if (y === g.foot) sh = C.boots ? 0x3e2723 : !C.sneaker ? mix(sc, 0x000000, 0.45) : (sc === 0xfafafa || sc === 0xfff8e1 ? 0x9e9e9e : 0xfafafa);   // oq tag - faqat konstruktor krossovkasida
                else if (r0 === 0) sh = C.boots ? mix(sc, 0xffffff, 0.35) : mix(sc, 0x000000, 0.3);
                if (sh !== null && sh !== undefined) clothPx(p, i, sh, gv < 0.32 ? gv : Math.max(0.85, Math.min(1.05, gv)));
                continue;
            }
            else c = C.leg !== undefined ? val(C.leg, x, y) : null;
            if (c !== null && c !== undefined) clothPx(p, i, c, grey(i));
        }
        if (sk) { const y = sk.hemY + 1, r = sk.rows[sk.hemY]; if (r && y < HERO.h) for (let x = r[0]; x <= r[1]; x++) { const i = (y * W + x) * 4; if (x >= 0 && x < W && !p[i + 3]) clothPx(p, i, 0x000000, 0); } }   // etak ostida kontur
    }
    function loadHero() {
        if (heroImg || typeof Image === 'undefined') return;
        heroImg = new Image();
        heroImg.onload = () => { heroOk = true; if (!HERO.hands.length) findHands(); try { if (typeof drawCharPreview === 'function') drawCharPreview(); } catch (e) { } };
        heroImg.src = HERO.src;
    }
    // O'NG MUSHT har kadrda (qurol shu yerda ushlanadi): qo'l balandligidagi (26-42 qator) eng o'ngdagi nuqta - mushtning o'rtasi
    function findHands() {
        const cv = document.createElement('canvas'); cv.width = HERO.w * HERO.n; cv.height = HERO.h;
        const c = cv.getContext('2d'); c.drawImage(heroImg, 0, 0);
        const p = c.getImageData(0, 0, cv.width, cv.height).data;
        HERO.hands = Array.from({ length: HERO.n }, (_, f) => {
            let bx = -1, by = 0, n = 0;
            for (let y = 26; y <= 42; y++) for (let x = HERO.w - 1; x >= 0; x--) {
                if (!p[(y * cv.width + f * HERO.w + x) * 4 + 3]) continue;
                if (x > bx) { bx = x; by = y; n = 1; } else if (x === bx) { by += y; n++; }
                break;
            }
            return bx < 0 ? [31, 38] : [bx - 2, Math.round(by / n)];
        });
    }
    // kadr kanvasi qahramon rangida: kulrang yorqinligi - rang ulushi (yorug' joylar oqqa yaqin, kontur - qora qoladi)
    function heroCanvas(packed, f, body) {
        body = body ? bodyKey(body) : body;
        const key = packed + ':' + f + (body && clothesOf(body) ? ':' + body : '');
        if (heroCache.has(key)) return heroCache.get(key);
        const col = toInt(packed) % 0x1000000, cr = (col >> 16) & 255, cg = (col >> 8) & 255, cb = col & 255;
        const cv = document.createElement('canvas'); cv.width = HERO.w; cv.height = HERO.h;
        const c = cv.getContext('2d'); c.imageSmoothingEnabled = false;
        c.drawImage(heroImg, f * HERO.w, 0, HERO.w, HERO.h, 0, 0, HERO.w, HERO.h);
        const id = c.getImageData(0, 0, HERO.w, HERO.h), p = id.data;
        if (body && clothesOf(body)) { heroGeom(p, f); applyClothes(p, f, body); }   // KIYIM (bo'yalgan piksellar - 254, tana rangi ularga tegmaydi)
        // ikkinchi rang (kombinatsiyali skin) - VISOR (ko'zoynak tasmasi) shu rangda, qorong'i joyi to'qroq
        const acc = Math.floor(toInt(packed) / 0x1000000), hv = acc && HERO.heads && HERO.heads[f];
        if (hv) {
            const ar = (acc >> 16) & 255, ag = (acc >> 8) & 255, ab = acc & 255;
            for (let y = hv[6]; y <= hv[7]; y++) for (let x = hv[4]; x <= hv[5]; x++) {
                const i = (y * HERO.w + x) * 4;
                if (!p[i + 3] || p[i] >= 0x60) continue;
                const k = 0.6 + 0.4 * (p[i] / 0x60) + (y === hv[6] ? 0.15 : 0);
                p[i] = Math.min(255, Math.round(ar * k)); p[i + 1] = Math.min(255, Math.round(ag * k)); p[i + 2] = Math.min(255, Math.round(ab * k)); p[i + 3] = 254;   // 254 - bo'yalgan (tana rangi tegmaydi)
            }
        }
        for (let i = 0; i < p.length; i += 4) {
            if (!p[i + 3] || p[i + 3] === 254) { if (p[i + 3] === 254) p[i + 3] = 255; continue; }
            const t = p[i] / HERO.mid, k = Math.min(1, t), hi = Math.max(0, Math.min(1, (t - 1) * 2.2)) * 0.55;
            p[i] = Math.round(cr * k + (255 - cr * k) * hi); p[i + 1] = Math.round(cg * k + (255 - cg * k) * hi); p[i + 2] = Math.round(cb * k + (255 - cb * k) * hi);
        }
        c.putImageData(id, 0, 0);
        heroCache.set(key, cv);
        return cv;
    }
    // MUSHT: shu kadrning faqat musht atrofidagi piksellari (qurol ustidan chiziladi - qo'l dastani ushlab turgani ko'rinadi)
    function heroFistCanvas(packed, f) {
        const key = 'fist:' + packed + ':' + f;
        if (heroCache.has(key)) return heroCache.get(key);
        const h = HERO.hands[f] || HERO.hands[0] || [0, 0];
        const cv = document.createElement('canvas'); cv.width = HERO.w; cv.height = HERO.h;
        const c = cv.getContext('2d'); c.drawImage(heroCanvas(packed, f), 0, 0);
        const id = c.getImageData(0, 0, HERO.w, HERO.h), p = id.data;
        for (let y = 0; y < HERO.h; y++) for (let x = 0; x < HERO.w; x++) {
            const dx = x - h[0], dy = y - h[1];
            if (dx * dx + dy * dy > HERO.fistR2) p[(y * HERO.w + x) * 4 + 3] = 0;
        }
        c.putImageData(id, 0, 0);
        heroCache.set(key, cv);
        return cv;
    }
    loadHero();
    function drawHero(ctx, type, color, look, ox = 0, oy = 0) {
        if (heroOk) {   // YANGI QAHRAMON: turish kadri, yarim o'lchamda (lobbi kanvasi - 1 katak = 2 piksel), oyog'i soya chizig'ida
            const L0 = parseLook(look), cx0 = 30 + ox, cy0 = 30 + oy;
            ctx.imageSmoothingEnabled = false;
            ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(cx0 - 12, cy0 + 13, 24, 3);
            const hx0 = cx0 - HERO.w / 4, hy0 = cy0 + 15 - HERO.h / 2;   // kadr yarim o'lchamda, oyog'i soya chizig'ida
            ctx.drawImage(heroCanvas(toInt(color), 0, L0.body), hx0, hy0, HERO.w / 2, HERO.h / 2);
            ['face', 'head'].forEach((slot) => {   // boshga moslangan (lobbi - yarim o'lcham: 1 katak = 1 px)
                const a = L0[slot] && art(slot, L0[slot]);
                if (!a) return;
                const cv = gridCanvas(slot + ':' + L0[slot], a.grid), w = cv.width, h = cv.height;
                const pl = heroHeadPlace(0, slot, -16 + 2 * a.ax + w, -24 + 2 * a.ay + h);
                ctx.drawImage(cv, hx0 + pl.x / 2 - pl.k * w / 2, hy0 + pl.y / 2 - pl.k * h / 2, pl.k * w, pl.k * h);
            });
            const pose0 = POSE[type] || POSE.knight, custom0 = L0[pose0.slot] && art(pose0.slot, L0[pose0.slot]);
            const cv0 = gridCanvas(custom0 ? pose0.slot + ':' + L0[pose0.slot] : 'def:' + pose0.kind, custom0 ? custom0.grid : defaultWeapon(pose0.kind));
            const hd = HERO.hands[0] || [31, 38];   // turish kadridagi o'ng musht (yarim o'lchamda)
            ctx.save(); ctx.translate(hx0 + hd[0] / 2, hy0 + hd[1] / 2); ctx.scale(HERO.wpn, HERO.wpn); ctx.rotate((heroRest(0, pose0.kind) !== undefined ? heroRest(0, pose0.kind) : (custom0 && custom0.angle !== undefined) ? custom0.angle : pose0.angle) * Math.PI / 180);
            ctx.drawImage(cv0, -(custom0 ? custom0.ox : pose0.ox) * cv0.width, -(custom0 ? custom0.oy : 0.5) * cv0.height); ctx.restore();
            ctx.drawImage(heroFistCanvas(toInt(color), 0), hx0, hy0, HERO.w / 2, HERO.h / 2);   // musht dasta ustida
            return;
        }
        const L = parseLook(look);
        const cx = 30 + ox, cy = 30 + oy;
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(cx - 12, cy + 13, 24, 3);
        const body = bodyGrid(toInt(color));
        paint(ctx, body, cx - 8, cy - 12);
        const overlay = (slot) => {
            const a = L[slot] && art(slot, L[slot]);
            if (a) paint(ctx, a.grid, cx - 8 + a.ax, cy - 12 + a.ay);
        };
        overlay('face');
        overlay('head');
        const pose = POSE[type] || POSE.knight;
        const custom = L[pose.slot] && art(pose.slot, L[pose.slot]);
        const grid = custom ? custom.grid : defaultWeapon(pose.kind);
        const cv = gridCanvas(custom ? pose.slot + ':' + L[pose.slot] : 'def:' + pose.kind, grid);
        const gx = (custom ? custom.ox : pose.ox) * cv.width, gy = (custom ? custom.oy : 0.5) * cv.height;
        ctx.save();
        ctx.translate(cx + pose.hand[0] / 2, cy + pose.hand[1] / 2);
        ctx.rotate(((custom && custom.angle !== undefined) ? custom.angle : pose.angle) * Math.PI / 180);
        ctx.drawImage(cv, -gx, -gy);
        ctx.restore();
    }

    // Do'kon ikonkasi: buyumning o'zi, kanvasga sig'adigan butun masshtabda, o'rtada
    function drawIcon(canvas, slot, id) {
        if (slot === 'body') {   // KIYIM: kulrang qahramon shu kiyimda (turish kadri, tananing o'rtasi)
            const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (!heroOk || !clothesOf(id)) return;
            const g = heroGeom(heroCanvas(0xbdbdbd, 0).getContext('2d').getImageData(0, 0, HERO.w, HERO.h).data, 0), y0 = Math.max(0, g.neck - 6), hh = HERO.h - y0;
            const s = Math.min((canvas.height - 2) / hh, (canvas.width - 2) / 34), w = 34 * s;
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(heroCanvas(0xbdbdbd, 0, id), Math.round(g.cx - 17), y0, 34, hh, Math.round((canvas.width - w) / 2), 1, w, hh * s);
            return;
        }
        const a = art(slot, id);
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (!a) return;
        const W = a.grid[0].length, H = a.grid.length;
        const s = Math.max(1, Math.floor(Math.min((canvas.width - 4) / W, (canvas.height - 4) / H)));
        paint(ctx, a.grid, Math.floor((canvas.width - W * s) / 2), Math.floor((canvas.height - H * s) / 2), s);
    }

    return { OM, omParse, omCode, setCustomOutfit: (code) => { myCustom = customRe.test(code || '') ? code : ''; }, getCustomOutfit: () => myCustom, SLOTS, POSE, bodyGrid, defaultWeapon, art, has, parseLook, drawHero, drawIcon, HERO, heroRest, heroHeadPlace, heroCanvas, heroFistCanvas, heroReady: () => heroOk };
})();
