// QAHRAMON VA DETALLAR RASMLARI (piksel-art) - o'yin (game.js) ham, lobbi/"My Character" oldindan
// ko'rinishi (lobby.js) ham shu yerdagi bir xil "katak" (grid) rasmlaridan foydalanadi.
// Grid: satrlar massivi, har katak - rang (0xRRGGBB) yoki null (shaffof). O'yinda 1 katak = 2px.
// Detallar: bosh kiyimi (head), yuz buyumi (face) va qurol ko'rinishlari (sword, shield, shotgun,
// staff, bow, katana, kunai). id lar server/src/cosmetics.ts dagi bilan bir xil
window.Cosmetics = (() => {
    const INK = 0x111111;
    const SLOTS = ['head', 'face', 'sword', 'shield', 'shotgun', 'staff', 'bow', 'katana', 'kunai'];

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
    function bodyGrid(color) {
        const W = 14, H = 22, g = gridNew(W, H);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            let c = color;
            if (x <= 1) c = mix(color, 0xffffff, 0.22);
            else if (x >= W - 2) c = mix(color, 0x000000, 0.25);
            if (y >= H - 2) c = mix(c, 0x000000, 0.18);
            g[y][x] = c;
        }
        const ORANGE = 0xd9822b, WHITE = 0xffffff, DARK = 0x141414;
        for (let x = 6; x < W; x++) { g[4][x] = DARK; g[7][x] = DARK; }
        g[5][6] = DARK; g[6][6] = DARK;
        for (let x = 7; x < W; x++) { g[5][x] = ORANGE; g[6][x] = ORANGE; }
        [8, 9, 11, 12].forEach((x) => { g[5][x] = WHITE; });
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

    // ===== BOSH KIYIMLARI (tana kataklariga nisbatan: ax/ay - chap yuqori burchak) =====
    const HEAD = {
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
        }
    };

    // ===== YUZ BUYUMLARI (visor atrofida: visor 4-7 qatorlarda, x 6..13) =====
    const FACE = {
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
            pink() { return { g: kiteShield([PINK.d, PINK.m, PINK.l, PINK.xl], 0x880e4f, 0xff80ab, 'heart') }; }
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
            dark() { return { g: katanaShape({ hilt: [0x212121, 0x4a148c], tsuba: 0x7c4dff, blade: [0x212121, 0x37474f, 0x7c4dff], tip: 0xb388ff }), gx: 3, gy: 2 }; }
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
        kunai: { kind: 'kunai', slot: 'kunai', ox: 0.25, hand: [11, 6], angle: 12 }
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
    const has = (slot, id) => !!(id && art(slot, id));

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
    function drawHero(ctx, type, color, look, ox = 0, oy = 0) {
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
        const a = art(slot, id);
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (!a) return;
        const W = a.grid[0].length, H = a.grid.length;
        const s = Math.max(1, Math.floor(Math.min((canvas.width - 4) / W, (canvas.height - 4) / H)));
        paint(ctx, a.grid, Math.floor((canvas.width - W * s) / 2), Math.floor((canvas.height - H * s) / 2), s);
    }

    return { SLOTS, POSE, bodyGrid, defaultWeapon, art, has, parseLook, drawHero, drawIcon };
})();
