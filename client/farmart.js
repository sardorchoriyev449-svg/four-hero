// MY FARM PIKSEL RASMLARI: ekinlar (3 bosqich), baliqlar, setka. O'yin (Phaser teksturasi) va
// inventar oynasi (DOM - canvas rasmi) birga ishlatadi. Katak = rang (null - bo'sh), qora kontur bilan
(function () {
    const gridNew = (w, h) => Array.from({ length: h }, () => Array(w).fill(null));
    function gridOutline(grid, color) {
        const h = grid.length, w = grid[0].length;
        const out = gridNew(w + 2, h + 2);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y + 1][x + 1] = grid[y][x];
        const filled = (x, y) => y >= 0 && y < h + 2 && x >= 0 && x < w + 2 && out[y][x] !== null && out[y][x] !== color;
        for (let y = 0; y < h + 2; y++) for (let x = 0; x < w + 2; x++)
            if (out[y][x] === null && (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1))) out[y][x] = color;
        return out;
    }
    const BAYER4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
    const shade = (v, x, y, palette) => {
        const d = v + (BAYER4[y % 4][x % 4] / 16 - 0.5) * 0.28;
        return palette[Math.max(0, Math.min(palette.length - 1, Math.floor(d * palette.length)))];
    };
    const MF_LEAF = [0x2e5d1a, 0x3f7f24, 0x5aa02f, 0x86c94a];
    // Ekin rasmi: 0 - nihol, 1 - o'sayapti, 2 - pishgan (14x18 katak, 3 px)
    function mfCropGrid(id, stage) {
        const W = 14, H = 18, g = gridNew(W, H);
        const set = (x, y, c) => { if (y >= 0 && y < H && x >= 0 && x < W) g[y][x] = c; };
        const ball = (cx, cy, rx, ry, fn) => {
            for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
                if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) set(x, y, fn(x, y));
        };
        const leaf = (x0, y0, dx, len) => { for (let k = 0; k < len; k++) { set(x0 + Math.round(k * dx), y0 - k, k % 2 ? MF_LEAF[2] : MF_LEAF[3]); set(x0 + Math.round(k * dx) + (dx > 0 ? -1 : 1), y0 - k, MF_LEAF[1]); } };
        const bush = (cy, ry) => ball(7, cy, 6, ry, (x, y) => (x * 3 + y * 5) % 7 === 0 ? MF_LEAF[3] : (x + y) % 3 ? MF_LEAF[1] : MF_LEAF[2]);
        if (stage === 0) {
            for (let y = 13; y < H; y++) set(7, y, MF_LEAF[1]);
            set(5, 13, MF_LEAF[3]); set(6, 13, MF_LEAF[2]); set(6, 14, MF_LEAF[2]); set(8, 13, MF_LEAF[2]); set(9, 13, MF_LEAF[3]); set(8, 14, MF_LEAF[2]);
            set(4, 12, MF_LEAF[3]); set(10, 12, MF_LEAF[3]);
            return gridOutline(g, 0x0a0a0a);
        }
        const HINT = { carrot: 0xffb74d, tomato: 0x9ccc65, corn: 0xc5e1a5, strawberry: 0xf8bbd0, pumpkin: 0xffcc80, watermelon: 0x81c784,
            pepper: 0xa5d6a7, eggplant: 0xce93d8, pineapple: 0xfff59d, grapes: 0xb39ddb };
        if (stage === 1) {
            for (let y = 8; y < H; y++) set(7, y, MF_LEAF[1]);
            leaf(6, 15, -0.9, 4); leaf(8, 15, 0.9, 4); leaf(6, 11, -0.7, 4); leaf(8, 11, 0.7, 4); set(7, 7, MF_LEAF[3]);
            const hint = HINT[id] || 0xffffff;
            if (id === 'pumpkin' || id === 'watermelon' || id === 'pineapple') ball(7, 15.5, 2.5, 1.8, () => hint);
            else if (id !== 'carrot') { set(4, 13, hint); set(10, 11, hint); set(4, 14, hint); }
            else { set(6, 17, hint); set(7, 17, hint); set(8, 17, hint); }
            return gridOutline(g, 0x0a0a0a);
        }
        // Daraxt mevalari (inventar belgisi): bitta-ikkita meva
        if (id === 'apple' || id === 'blueapple') {
            const P = id === 'apple' ? [0x8e1b1b, 0xc62828, 0xe53935, 0xff8a80] : [0x0d3c8c, 0x1565c0, 0x42a5f5, 0xb3e5fc];
            ball(7, 11.5, 5.2, 5, (x, y) => shade(0.95 - (x + y) / 30, x, y, P));
            set(7, 5, 0x5d4037); set(7, 6, 0x5d4037); set(8, 4, MF_LEAF[2]); set(9, 4, MF_LEAF[3]); set(9, 3, MF_LEAF[3]);
            set(5, 9, 0xffffff);
            return gridOutline(g, 0x0a0a0a);
        }
        if (id === 'pear') {
            ball(7, 13, 4.6, 4.2, (x, y) => shade(0.95 - (x + y) / 32, x, y, [0x827717, 0xafb42b, 0xd4e157, 0xf0f4c3]));
            ball(7, 8, 2.6, 2.8, (x, y) => shade(0.95 - (x + y) / 32, x, y, [0x827717, 0xafb42b, 0xd4e157, 0xf0f4c3]));
            set(7, 4, 0x5d4037); set(7, 5, 0x5d4037); set(8, 4, MF_LEAF[2]); set(9, 3, MF_LEAF[3]);
            return gridOutline(g, 0x0a0a0a);
        }
        if (id === 'cherry') {
            [[4.5, 13], [10, 14]].forEach(([cx, cy]) => ball(cx, cy, 2.6, 2.6, (x, y) => (x < cx && y < cy) ? 0xe57373 : 0xb71c1c));
            for (let k = 0; k < 7; k++) { set(5 + Math.round(k * 0.3), 10 - k, 0x558b2f); set(10 - Math.round(k * 0.3), 11 - k, 0x558b2f); }
            set(7, 3, MF_LEAF[3]); set(8, 3, MF_LEAF[2]);
            return gridOutline(g, 0x0a0a0a);
        }
        if (id === 'carrot') {
            [[4, 0.6], [6, 0.2], [8, -0.2], [10, -0.6]].forEach(([x, dx]) => leaf(x, 12, dx * 1.4, 9));
            ball(7, 15.5, 4, 2.6, (x, y) => y < 15 ? 0xffa726 : x < 7 ? 0xfb8c00 : 0xef6c00);
            set(5, 14, 0xffcc80); set(9, 16, 0xe65100);
        } else if (id === 'tomato') {
            for (let y = 1; y < H; y++) set(7, y, y % 3 ? 0x8d6e63 : 0x6d4c41);
            leaf(6, 16, -0.8, 4); leaf(8, 13, 0.8, 4); leaf(6, 9, -0.8, 4); leaf(8, 6, 0.6, 4);
            [[3.5, 12], [10.5, 9], [4, 5], [10, 15]].forEach(([cx, cy]) => ball(cx, cy, 1.7, 1.7, (x, y) => (x < cx && y < cy) ? 0xff8a80 : 0xe53935));
        } else if (id === 'corn') {
            for (let y = 0; y < H; y++) set(7, y, MF_LEAF[1]);
            leaf(6, 16, -1, 6); leaf(8, 14, 1, 6); leaf(6, 8, -0.8, 5); set(7, 0, 0xd4b106); set(6, 0, 0xd4b106);
            for (let y = 4; y < 11; y++) { set(9, y, (y % 2) ? 0xffeb3b : 0xfdd835); set(10, y, (y % 2) ? 0xfdd835 : 0xfbc02d); }
            set(8, 6, MF_LEAF[2]); set(8, 8, MF_LEAF[2]); set(11, 9, MF_LEAF[2]); set(11, 7, MF_LEAF[1]);
        } else if (id === 'strawberry') {
            bush(13.5, 3.6);
            [[3, 14], [7, 16], [10.5, 13], [5.5, 11]].forEach(([cx, cy]) => { ball(cx, cy, 1.4, 1.6, () => 0xe53935); set(Math.round(cx), Math.round(cy), 0xfff176); set(Math.round(cx), Math.round(cy) - 2, MF_LEAF[3]); });
        } else if (id === 'pumpkin') {
            set(7, 7, 0x33691e); set(7, 8, 0x33691e); set(8, 6, 0x558b2f); leaf(5, 10, -1, 3);
            ball(7, 13.5, 6.4, 4.2, (x, y) => (Math.abs(x - 7) === 3 || x === 7) ? 0xe65100 : y < 12 ? 0xffb74d : x < 7 ? 0xffa726 : 0xfb8c00);
        } else if (id === 'watermelon') {
            leaf(3, 12, -0.5, 3); set(7, 9, MF_LEAF[1]);
            ball(7, 14, 6.6, 3.8, (x, y) => (Math.floor((x + (y > 14 ? 1 : 0)) / 2) % 2) ? 0x1b5e20 : (y < 13 ? 0x66bb6a : 0x43a047));
        } else if (id === 'pepper') {
            bush(10, 5);
            for (let y = 13; y < H; y++) set(7, y, MF_LEAF[0]);
            [[3, 11], [10, 9], [6, 13]].forEach(([px, py]) => { for (let k = 0; k < 4; k++) { set(px, py + k, k < 3 ? 0xe53935 : 0xb71c1c); set(px + 1, py + k, k < 2 ? 0xff5252 : 0xc62828); } set(px, py - 1, MF_LEAF[0]); });
        } else if (id === 'eggplant') {
            bush(9, 4.5);
            for (let y = 12; y < H; y++) set(7, y, MF_LEAF[0]);
            [[3.5, 14], [10.5, 13]].forEach(([cx, cy]) => { ball(cx, cy, 1.8, 2.8, (x, y) => (x < cx && y < cy) ? 0xab47bc : 0x6a1b9a); set(Math.round(cx), Math.round(cy - 3), 0x33691e); });
        } else if (id === 'pineapple') {
            [[5, -0.6], [7, 0], [9, 0.6], [6, -0.2], [8, 0.2]].forEach(([x, dx]) => leaf(x, 9, dx, 7));
            ball(7, 13.5, 4, 4, (x, y) => ((x + y) % 3 === 0) ? 0xa1660f : ((x - y) % 3 === 0) ? 0xc77d12 : y < 12 ? 0xffd54f : 0xffb300);
        } else if (id === 'grapes') {
            for (let y = 1; y < H; y++) set(2, y, 0x6d4c41);
            for (let x = 2; x < 13; x++) set(x, 2, 0x795548);
            leaf(4, 5, 0.8, 3); leaf(10, 5, -0.6, 3); leaf(7, 4, 0.2, 2);
            [[5, 7], [10, 8]].forEach(([cx, cy]) => {
                for (let r = 0; r < 5; r++) for (let q = -2 + Math.ceil(r / 2); q <= 2 - Math.ceil(r / 2); q++) set(cx + q, cy + r, (q + r) % 2 ? 0x7b1fa2 : 0x9c27b0);
                set(cx - 1, cy, 0xce93d8);
            });
            leaf(6, 16, -0.6, 3); leaf(8, 16, 0.6, 3);
        }
        return gridOutline(g, 0x0a0a0a);
    }
    // Baliqlar (o'ngga qaragan): o'lchami turiga qarab
    function mfFishGrid(id) {
        const S = { perch: [14, 7, [0x9e9d24, 0xc0ca33, 0xd4e157, 0xf0f4c3], 0xff7043], carp: [16, 8, [0x4e3b16, 0x7a5f26, 0xa3843a, 0xcdb06a], 0x6d4c2a],
            pike: [20, 6, [0x33691e, 0x558b2f, 0x7cb342, 0xc5e1a5], 0x8bc34a], catfish: [20, 8, [0x37352f, 0x4e4a40, 0x6d665a, 0x9e968a], 0x5d5a52],
            goldfish: [13, 8, [0xb26a00, 0xffa000, 0xffca28, 0xfff59d], 0xff6f00] }[id];
        const [W, H, P, fin] = S, g = gridNew(W + 4, H);
        const cy = (H - 1) / 2;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const nx = (x - W * 0.45) / (W * 0.5), ny = (y - cy) / (H * 0.5);
            if (nx * nx + ny * ny * (1 + Math.max(0, nx) * 0.6) > 1) continue;
            g[y][x + 4] = shade(0.95 - y / (H * 1.4), x, y, P);
            if (id === 'perch' && x % 4 === 1 && y < H - 2) g[y][x + 4] = P[0];
            if (id === 'pike' && (x * 3 + y * 5) % 7 === 0) g[y][x + 4] = P[3];
            if (id === 'carp' && (x + y) % 3 === 0 && y > 0) g[y][x + 4] = P[1];
        }
        for (let y = 0; y < H; y++) { const d = Math.abs(y - cy); if (d <= cy) for (let x = 0; x < 4; x++) if (x >= Math.round(d * 0.7)) g[y][3 - x] = fin; }
        g[Math.floor(cy) - 1][W + 1] = 0x000000; g[Math.floor(cy) - 1][W] = 0xffffff;
        if (id === 'catfish') { g[Math.floor(cy) + 1][W + 3] = 0xbdbdbd; g[Math.floor(cy) + 2][W + 3] = 0xbdbdbd; }
        if (id === 'goldfish') { g[1][8] = 0xffffff; g[2][9] = 0xfffde7; g[5][6] = 0xffffff; }   // yaltiroq dog'lar
        return gridOutline(g, 0x0a0a0a);
    }
    function mfNetGrid() {
        const g = gridNew(16, 12);
        for (let y = 0; y < 12; y++) for (let x = 0; x < 16; x++) if (Math.abs(x - 7.5) <= 7.5 - y * 0.25 && ((x + y) % 3 === 0 || (x - y + 30) % 3 === 0)) g[y][x] = 0xd7ccc8;
        for (let x = 0; x < 16; x++) g[0][x] = 0x8d6e63;
        return gridOutline(g, 0x3e2723);
    }

    // Udochka: qiya tayoq, g'altak, ip va po'kak
    function rodGrid() {
        const g = gridNew(16, 16);
        for (let k = 0; k < 14; k++) { const x = 1 + k, y = 14 - k; g[y][x] = k < 4 ? 0x3e2723 : k % 2 ? 0x8d6e63 : 0xa1887f; }
        g[11][3] = 0x9e9e9e; g[11][4] = 0x757575; g[12][4] = 0x9e9e9e; g[12][3] = 0x616161;   // g'altak
        for (let y = 1; y < 12; y++) g[y][15] = 0xeeeeee;
        g[12][15] = 0xe53935; g[13][15] = 0xfafafa;
        return gridOutline(g, 0x0a0a0a);
    }
    // Katakli rasm -> PNG manzil (DOM uchun), keshlanadi
    const cache = {};
    function iconURL(key, grid, P) {
        if (cache[key]) return cache[key];
        const c = document.createElement('canvas');
        c.width = grid[0].length * P; c.height = grid.length * P;
        const ctx = c.getContext('2d');
        grid.forEach((row, y) => row.forEach((col, x) => {
            if (col === null) return;
            ctx.fillStyle = '#' + col.toString(16).padStart(6, '0');
            ctx.fillRect(x * P, y * P, P, P);
        }));
        return (cache[key] = c.toDataURL());
    }
    // O'g'it xaltasi va moviy suv shishasi (do'kon / inventar)
    function fertGrid() {
        const g = gridNew(14, 16);
        for (let y = 3; y < 16; y++) for (let x = 2; x < 12; x++) g[y][x] = shade(0.9 - (x + y) / 40, x, y, [0x5d4037, 0x795548, 0xa1887f, 0xd7ccc8]);
        for (let x = 3; x < 11; x++) { g[2][x] = 0x8d6e63; } g[1][5] = 0x6d4c41; g[1][8] = 0x6d4c41;
        for (let y = 7; y < 12; y++) for (let x = 4; x < 10; x++) g[y][x] = (x + y) % 2 ? 0x7cb342 : 0x558b2f;
        g[9][6] = 0xfff176; g[9][7] = 0xfff176;
        return gridOutline(g, 0x0a0a0a);
    }
    function waterGrid() {
        const g = gridNew(12, 16);
        for (let y = 0; y < 3; y++) for (let x = 4; x < 8; x++) g[y][x] = y === 0 ? 0x8d6e63 : 0xbbdefb;
        for (let y = 3; y < 16; y++) { const hw = y < 6 ? 2 + (y - 3) : 5; for (let x = 6 - hw; x < 6 + hw; x++) g[y][x] = y < 7 ? 0xe3f2fd : shade(0.95 - (x + y) / 30, x, y, [0x0d47a1, 0x1e88e5, 0x4fc3f7, 0xb3e5fc]); }
        g[9][3] = 0xffffff; g[10][3] = 0xffffff;
        return gridOutline(g, 0x0a0a0a);
    }
    // ===== DO'KON VA BEZAK BELGILARI (piksel) =====
    function mk(w, h, fn) { const g = gridNew(w, h); fn((x, y, c) => { if (y >= 0 && y < h && x >= 0 && x < w) g[y][x] = c; }, g); return gridOutline(g, 0x0a0a0a); }
    // Eliksir: qizil shisha, tiqin, yaltirash
    const elixirGrid = () => mk(12, 16, (set) => {
        for (let y = 0; y < 3; y++) for (let x = 4; x < 8; x++) set(x, y, y === 0 ? 0x8d6e63 : 0xd7ccc8);
        for (let y = 3; y < 6; y++) for (let x = 5; x < 7; x++) set(x, y, 0xe3f2fd);
        for (let y = 6; y < 16; y++) for (let x = 0; x < 12; x++) if (((x - 5.5) / 5.5) ** 2 + ((y - 11) / 5) ** 2 <= 1) set(x, y, y < 8 ? 0xe3f2fd : shade(0.95 - (x + y) / 30, x, y, [0x7f0000, 0xb71c1c, 0xe53935, 0xff8a80]));
        set(3, 10, 0xffffff); set(3, 11, 0xffffff); set(4, 9, 0xffcdd2);
    });
    // Chip: yashil plata, oltin oyoqchalar, markazda protsessor
    const chipGrid = () => mk(16, 16, (set) => {
        for (let y = 3; y < 13; y++) for (let x = 3; x < 13; x++) set(x, y, shade(0.85 - (x + y) / 40, x, y, [0x1b5e20, 0x2e7d32, 0x43a047, 0x66bb6a]));
        for (let y = 6; y < 10; y++) for (let x = 6; x < 10; x++) set(x, y, 0x212121);
        set(7, 7, 0x80cbc4); set(8, 8, 0x4db6ac);
        for (let k = 4; k < 12; k += 2) { set(k, 1, 0xffca28); set(k, 2, 0xffca28); set(k, 13, 0xffca28); set(k, 14, 0xffca28); set(1, k, 0xffca28); set(2, k, 0xffca28); set(13, k, 0xffca28); set(14, k, 0xffca28); }
    });
    // Tanga
    const coinGrid = () => mk(8, 8, (set) => {
        for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (((x - 3.5) / 3.6) ** 2 + ((y - 3.5) / 3.6) ** 2 <= 1) set(x, y, (x + y) < 6 ? 0xfff176 : x + y < 9 ? 0xffca28 : 0xf9a825);
        set(3, 2, 0xc77800); set(3, 3, 0xc77800); set(3, 4, 0xc77800); set(4, 5, 0xc77800);
    });
    // Gulzor: rang-barang gullar, barglar
    const flowersGrid = () => mk(24, 12, (set) => {
        for (let x = 0; x < 24; x++) { set(x, 10, 0x5d4037); set(x, 11, 0x4e342e); }
        [[2, 0xe53935], [6, 0xffeb3b], [10, 0xab47bc], [14, 0xff7043], [18, 0x42a5f5], [21, 0xec407a]].forEach(([x, c], i) => {
            const top = 3 + (i % 3);
            for (let y = top + 2; y < 10; y++) set(x, y, 0x558b2f);
            set(x - 1, top + 4, 0x7cb342); set(x + 1, top + 5, 0x7cb342);
            set(x, top, c); set(x - 1, top + 1, c); set(x + 1, top + 1, c); set(x, top + 2, c); set(x, top + 1, 0xfff59d);
        });
    });
    // Fonar: ustun va sariq chiroq
    const lanternGrid = () => mk(12, 34, (set) => {
        for (let y = 8; y < 34; y++) { set(5, y, 0x37474f); set(6, y, 0x455a64); }
        for (let x = 2; x < 10; x++) { set(x, 0, 0x263238); set(x, 7, 0x263238); }
        for (let y = 1; y < 7; y++) { set(2, y, 0x263238); set(9, y, 0x263238); for (let x = 3; x < 9; x++) set(x, y, y < 3 ? 0xfff59d : 0xffca28); }
        for (let x = 3; x < 9; x++) { set(x, 32, 0x37474f); set(x, 33, 0x263238); }
    });
    // ROBOT KUCHUK (o'tirgan): temir tana, ko'k ko'zoynak-ko'z, antenna (uchi miltillaydi), prujina dum (frame - dum va chiroq)
    const dogGrid = (frame) => mk(20, 17, (set) => {
        const M = [0x455a64, 0x607d8b, 0x90a4ae, 0xcfd8dc];
        // tana
        for (let y = 8; y < 14; y++) for (let x = 3; x < 13; x++) set(x, y, shade(0.95 - (y - 8) / 10 - x / 40, x, y, M));
        for (let x = 4; x < 12; x += 3) set(x, 10, 0x37474f);   // panel choklari
        set(6, 11, 0xffca28); set(9, 11, 0x00e5ff);              // chiroqchalar
        // bosh
        for (let y = 3; y < 9; y++) for (let x = 11; x < 18; x++) set(x, y, shade(0.98 - (y - 3) / 10, x, y, M));
        for (let x = 13; x < 18; x++) { set(x, 5, 0x0a2a33); set(x, 6, 0x0a2a33); }        // ko'zoynak
        set(15, 5, 0x00e5ff); set(16, 5, 0x84ffff); set(15, 6, 0x00b8d4);               // yonib turgan ko'z
        set(18, 7, 0x607d8b); set(18, 8, 0x37474f);                                     // tumshuq
        set(11, 2, 0x90a4ae); set(12, 2, 0x607d8b); set(11, 1, 0x607d8b);               // quloq
        // antenna
        for (let y = 0; y < 3; y++) set(15, y, 0x37474f);
        set(15, 0, frame ? 0xff1744 : 0xff8a80);
        // oyoqlar (g'ildirakli tovon)
        [4, 6, 10, 12].forEach(x => { for (let y = 14; y < 16; y++) set(x, y, 0x37474f); set(x, 16, 0x263238); });
        // prujina dum
        if (frame) { set(2, 7, 0x90a4ae); set(1, 6, 0x607d8b); set(1, 5, 0x90a4ae); set(0, 4, 0x00e5ff); }
        else { set(2, 9, 0x90a4ae); set(1, 9, 0x607d8b); set(0, 8, 0x90a4ae); set(0, 7, 0x00e5ff); }
    });
    // Bo'yoq chelagi (uyni bo'yash)
    const paintGrid = () => mk(14, 14, (set) => {
        for (let y = 4; y < 14; y++) for (let x = 2; x < 12; x++) set(x, y, shade(0.9 - x / 20, x, y, [0x546e7a, 0x78909c, 0x90a4ae, 0xb0bec5]));
        for (let x = 2; x < 12; x++) { set(x, 3, 0x1e88e5); set(x, 4, 0x42a5f5); }
        set(3, 5, 0x1e88e5); set(3, 6, 0x1e88e5); set(8, 5, 0x1e88e5);
        for (let k = 0; k < 6; k++) set(1 + Math.round(k * 0.2), 3 - Math.round(Math.sin(k / 5 * Math.PI) * 3), 0x37474f);
    });
    // ===== FERMER UYI JIHOZLARI (piksel, 3 px katak) =====
    const WOOD = [0x4e342e, 0x6d4c41, 0x8d6e63, 0xa1887f];
    const homeGrids = {
        // Yashik: yog'och taxtalar, temir burchaklar, qulf
        chest: () => mk(18, 14, (set) => {
            for (let y = 0; y < 14; y++) for (let x = 0; x < 18; x++) set(x, y, y < 5 ? shade(0.85 - y / 14, x, y, WOOD) : shade(0.7 - (y % 4 === 0 ? 0.25 : 0) - x / 60, x, y, WOOD));
            for (let x = 0; x < 18; x++) { set(x, 5, 0x3e2723); }
            [0, 17].forEach(x => { for (let y = 0; y < 14; y++) set(x, y, 0x78909c); });
            for (let x = 0; x < 18; x++) { set(x, 0, 0x78909c); set(x, 13, 0x546e7a); }
            set(8, 5, 0xffca28); set(9, 5, 0xffca28); set(8, 6, 0xffca28); set(9, 6, 0xf9a825); set(8, 7, 0x3e2723);
        }),
        // Stol: qopqoq va to'rt oyoq
        table: () => mk(24, 14, (set) => {
            for (let x = 0; x < 24; x++) { set(x, 0, 0xa1887f); set(x, 1, 0x8d6e63); set(x, 2, 0x6d4c41); }
            [2, 3, 20, 21].forEach(x => { for (let y = 3; y < 14; y++) set(x, y, x % 2 ? 0x5d4037 : 0x6d4c41); });
            for (let x = 4; x < 20; x++) set(x, 5, 0x5d4037);
            // ustida - piyola va non
            set(6, -1, 0xeceff1);
        }),
        // Stul: suyanchiq, o'rindiq, oyoqlar
        chair: () => mk(10, 18, (set) => {
            for (let y = 0; y < 9; y++) { set(1, y, 0x6d4c41); set(2, y, 0x8d6e63); }
            for (let y = 1; y < 8; y += 3) for (let x = 3; x < 9; x++) set(x, y, 0x8d6e63);
            for (let x = 1; x < 10; x++) { set(x, 9, 0xa1887f); set(x, 10, 0x6d4c41); }
            for (let y = 11; y < 18; y++) { set(1, y, 0x5d4037); set(8, y, 0x5d4037); }
        }),
        // Karavot: bosh taxtasi, qizil adyol, oq yostiq
        bed: () => mk(30, 14, (set) => {
            for (let y = 0; y < 14; y++) { set(0, y, 0x6d4c41); set(1, y, 0x8d6e63); }
            for (let y = 6; y < 14; y++) { set(28, y, 0x6d4c41); set(29, y, 0x8d6e63); }
            for (let y = 4; y < 8; y++) for (let x = 2; x < 9; x++) set(x, y, y === 4 ? 0xffffff : 0xeceff1);
            for (let y = 5; y < 11; y++) for (let x = 8; x < 28; x++) set(x, y, shade(0.9 - y / 16, x, y, [0x8e1b1b, 0xc62828, 0xe53935, 0xef9a9a]));
            for (let x = 8; x < 28; x += 4) set(x, 7, 0xffcdd2);
            for (let x = 2; x < 28; x++) { set(x, 11, 0x5d4037); set(x, 12, 0x4e342e); }
            set(2, 13, 0x4e342e); set(27, 13, 0x4e342e);
        }),
        // Kitob javoni: 3 tokcha, rang-barang kitoblar
        shelf: () => mk(18, 28, (set) => {
            for (let y = 0; y < 28; y++) for (let x = 0; x < 18; x++) set(x, y, (x === 0 || x === 17 || y === 0 || y === 27 || y === 9 || y === 18) ? 0x6d4c41 : 0x3e2723);
            const C = [0xe53935, 0x1e88e5, 0x43a047, 0xfdd835, 0x8e24aa, 0xff7043, 0x00897b];
            [1, 10, 19].forEach((y0, r) => { let x = 1; let i = r * 2; while (x < 17) { const w = 1 + (i % 2), h = 6 + (i % 3); for (let xx = x; xx < Math.min(17, x + w); xx++) for (let y = y0 + 8 - h; y < y0 + 8; y++) set(xx, y, C[i % C.length]); x += w + (i % 4 === 3 ? 1 : 0); i++; } });
        }),
        // Kamin: tosh, ichida olov (frame - alangalar)
        fireplace: () => mk(24, 26, (set) => {
            for (let y = 0; y < 26; y++) for (let x = 0; x < 24; x++) set(x, y, shade(0.75 - ((x + (y % 2) * 2) % 4 === 0 ? 0.2 : 0) - y / 80, x, y, [0x424242, 0x616161, 0x757575, 0x9e9e9e]));
            for (let x = 0; x < 24; x++) { set(x, 0, 0x8d6e63); set(x, 1, 0x6d4c41); set(x, 2, 0x5d4037); }
            for (let y = 10; y < 26; y++) for (let x = 5; x < 19; x++) set(x, y, 0x1a1a1a);
            for (let y = 15; y < 25; y++) for (let x = 6; x < 18; x++) { const d = Math.abs(x - 11.5) / 6 + (25 - y) / 12; if (d < 0.7) set(x, y, 0xffeb3b); else if (d < 1.0) set(x, y, 0xff9800); else if (d < 1.25 && (x + y) % 2) set(x, y, 0xe64a19); }
            for (let x = 6; x < 18; x++) set(x, 25, 0x6d4c41);
        }),
        // Tuvakdagi gul
        pot: () => mk(10, 14, (set) => {
            for (let y = 8; y < 14; y++) for (let x = 1 + (y > 11 ? 1 : 0); x < 9 - (y > 11 ? 1 : 0); x++) set(x, y, shade(0.9 - x / 14, x, y, [0x8d3a1a, 0xbf5a2a, 0xe07b45]));
            for (let x = 0; x < 10; x++) set(x, 8, 0xd2691e);
            for (let y = 3; y < 8; y++) set(4, y, 0x558b2f);
            set(3, 5, 0x7cb342); set(5, 6, 0x7cb342);
            [[4, 1], [3, 2], [5, 2], [4, 3]].forEach(([x, y]) => set(x, y, 0xec407a)); set(4, 2, 0xfff59d);
            [[6, 2], [7, 3], [6, 4]].forEach(([x, y]) => set(x, y, 0xab47bc));
        }),
        // Katta o'simlik (palma)
        plant: () => mk(14, 24, (set) => {
            for (let y = 16; y < 24; y++) for (let x = 3; x < 11; x++) set(x, y, shade(0.9 - x / 16, x, y, [0x37474f, 0x546e7a, 0x78909c]));
            for (let y = 6; y < 16; y++) set(7, y, 0x5d4037);
            [[-1, 0], [1, 0], [-1, 1], [1, 1], [0, -1]].forEach(([dx, dy], i) => { for (let k = 0; k < 6; k++) set(7 + dx * k, 6 + dy * 3 + Math.round(k * k / 8) - (dy < 0 ? k : 0), i % 2 ? 0x43a047 : 0x66bb6a); });
        }),
        // Gilam (polga yotadi)
        rug: () => mk(50, 5, (set) => {
            for (let y = 0; y < 5; y++) for (let x = 0; x < 50; x++) set(x, y, (y === 0 || y === 4) ? 0x8e1b1b : ((x + y * 2) % 6 < 3 ? 0xc62828 : 0xffb300));
            for (let x = 0; x < 50; x += 3) set(x, 2, 0x283593);
        }),
        // Devordagi rasm: oltin rom, ichida tog' va quyosh
        painting: () => mk(18, 14, (set) => {
            for (let y = 0; y < 14; y++) for (let x = 0; x < 18; x++) set(x, y, (x < 1 || x > 16 || y < 1 || y > 12) ? 0xc79100 : y < 8 ? 0x81d4fa : 0x7cb342);
            for (let y = 4; y < 9; y++) for (let x = 3; x < 15; x++) if (Math.abs(x - 8) < (y - 3) * 1.4) set(x, y, y < 6 ? 0xeceff1 : 0x607d8b);
            set(13, 3, 0xffeb3b); set(14, 3, 0xffeb3b); set(13, 4, 0xffeb3b); set(14, 4, 0xfdd835);
        }),
        // Osma chiroq: zanjir va sariq abajur
        lamp: () => mk(12, 20, (set) => {
            for (let y = 0; y < 10; y++) set(6, y, y % 2 ? 0x616161 : 0x9e9e9e);
            for (let y = 10; y < 16; y++) for (let x = 6 - (y - 9); x <= 5 + (y - 9); x++) set(x, y, y === 15 ? 0xf57f17 : 0xffca28);
            for (let x = 4; x < 8; x++) { set(x, 16, 0xfff59d); set(x, 17, 0xfffde7); }
        })
    };
    // AJDARCHA (o'yinchi chizgan rasm asosida): yon tomondan, to'rtburchak uslub - katta och ko'k bosh, qora ko'z yorig'i
    // (ichida oq chaqnash), og'iz chizig'i, boshdan orqaga ketgan to'q ko'k shox, uzun to'q ko'k tana va dum (orqasida
    // tikanchalar, uchida nayza), orqada yotgan uch qavat uzun och ko'k qanot, ikki qora oyoq. Rasm chapga qaragan holda
    // chiziladi va oxirida ko'zgudek aylantiriladi (o'yinda hamma narsa o'ngga qaragan). Pastki qator - oyoq tagi (yerga tegadi)
    // frame: sit/blink - qo'ngan; fly0/fly1 - qanot tepada/pastda (oyoqlar yig'ilgan); eat - og'zi ochiq; scared - ko'zi katta
    function critterGrid(frame) {
        const W = 49, H = 23, OY = 7, g = gridNew(W, H);
        const put = (x, y, c) => { y += OY; if (y >= 0 && y < H && x >= 0 && x < W) g[y][x] = c; };
        const rect = (x0, y0, x1, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, typeof c === 'function' ? c(x, y) : c); };
        const LB = [0x6fc3dc, 0x9ad8e8, 0xc4ecf5], DB = [0x2a32a0, 0x3d47c9, 0x5a64e0], INK = 0x000000, LEG = 0x14163a;
        const fly = frame === 'fly0' || frame === 'fly1' || frame === 'scared';
        // DUM va TANA (to'q ko'k): pastki uzun chiziq boshdan dum uchigacha, ustida yelka, orqada pog'onali dum
        rect(8, 12, 46, 12, (x) => x % 6 === 0 ? DB[0] : DB[1]);
        rect(14, 9, 30, 11, (x, y) => y === 9 ? DB[2] : (x + y) % 7 === 0 ? DB[0] : DB[1]);
        rect(30, 10, 41, 11, (x, y) => y === 10 ? DB[2] : DB[1]);
        rect(41, 11, 46, 11, DB[1]);
        // tikanchalar (orqa va dum ustida) va dum uchidagi nayza
        [31, 34, 37, 40].forEach(x => { put(x, 9, DB[0]); put(x + 1, 9, DB[0]); put(x, 8, DB[0]); });
        rect(47, 10, 48, 13, DB[0]); put(48, 9, DB[2]); put(48, 14, DB[2]); put(47, 11, LB[1]);
        // OYOQLAR: qo'nganda - tik turadi (pastki qator - yer); uchganda - orqaga yig'ilgan
        if (!fly) {
            rect(14, 10, 16, 15, LEG); rect(13, 14, 17, 15, LEG); put(13, 15, 0xcfd8dc); put(12, 15, 0xcfd8dc);
            rect(25, 10, 28, 14, LEG); rect(26, 14, 31, 15, LEG); put(25, 15, 0xcfd8dc); put(26, 15, 0xcfd8dc);
        } else {
            rect(15, 12, 17, 13, LEG); rect(17, 13, 20, 13, LEG);
            rect(26, 12, 28, 13, LEG); rect(28, 13, 31, 13, LEG);
        }
        // QANOTLAR: uch qavat uzun och ko'k "pat", orasida qora chiziq, ustkisida ingichka chiziq va dumaloq uchlar
        const strips = [{ x0: 17, x1: 37, y: 4, h: 2, line: true }, { x0: 18, x1: 35, y: 7, h: 1, line: false }, { x0: 23, x1: 34, y: 9, h: 1, line: true }];
        strips.forEach((st, i) => {
            for (let x = st.x0; x <= st.x1; x++) {
                const k = x - st.x0;
                // qanot qoqish: tepada - orqaga-yuqoriga ko'tarilgan, pastda - orqaga-pastga tushgan
                const dy = frame === 'fly0' || frame === 'scared' ? -Math.round(k * (0.42 - i * 0.08)) : frame === 'fly1' ? Math.round(k * (0.22 + i * 0.05)) : 0;
                const y = st.y + dy;
                put(x, y - 1, INK);
                for (let r = 0; r < st.h; r++) put(x, y + r, r === 0 ? (st.line && x > st.x0 + 1 && x < st.x1 - 2 && st.h > 1 ? LB[2] : LB[1]) : ((x + i) % 5 === 0 ? LB[0] : LB[1]));
                if (st.line && x === st.x1 - 3) put(x, y + st.h - 1, LB[0]);   // chiziq uchidagi dumaloq
                if (st.line && st.h === 1 && x > st.x0 && x < st.x1 - 3) put(x, y, x % 2 ? LB[2] : LB[1]);
                put(x, y + st.h, INK);
            }
            put(st.x1 + 1, st.y + (frame === 'fly0' || frame === 'scared' ? -Math.round((st.x1 - st.x0) * (0.42 - i * 0.08)) : frame === 'fly1' ? Math.round((st.x1 - st.x0) * (0.22 + i * 0.05)) : 0), INK);
        });
        // BOSH: katta och ko'k to'rtburchak, tepasi yorug', o'ng (bo'yin) tomoni qora chegara
        rect(3, 5, 13, 11, (x, y) => y === 5 ? LB[2] : x === 3 || y === 11 ? LB[0] : LB[1]);
        rect(14, 5, 14, 10, INK);
        // ko'z: qora yoriq, ichida oq chaqnashlar (qo'rqqanda - katta oq ko'z)
        if (frame === 'blink') rect(5, 7, 8, 7, INK);
        else if (frame === 'scared') { rect(4, 6, 9, 8, INK); rect(5, 6, 8, 7, 0xffffff); put(6, 7, INK); put(7, 7, INK); }
        else { rect(5, 6, 8, 7, INK); put(6, 6, 0xffffff); put(7, 7, 0xffffff); }
        // og'iz: chiziq (yeganda - ochiq, ichi qizil, tishchalar)
        if (frame === 'eat' || frame === 'scared') { rect(2, 9, 7, 10, INK); rect(3, 10, 6, 10, 0xc62828); put(3, 9, 0xffffff); put(5, 9, 0xffffff); }
        else rect(3, 9, 7, 9, INK);
        put(2, 9, INK); put(4, 6, LB[0]);   // burun
        // SHOX: boshdan orqaga-pastga ketgan to'q ko'k qiya to'sin (qora hoshiya bilan)
        for (let k = 0; k <= 6; k++) { const x = 9 + k, y = 4 + Math.round(k * 0.55); put(x, y - 1, INK); put(x, y, DB[2]); put(x, y + 1, DB[1]); put(x, y + 2, INK); }
        put(16, 7, INK); put(16, 8, INK);
        // chizilgani chapga qaragan - ko'zgudek aylantiramiz (o'ngga qaraydi)
        g.forEach(row => row.reverse());
        return gridOutline(g, 0x000000);
    }
    // PUSHISTIK UYCHASI: lavanda devorlar, pushti tom, dumaloq eshik, ustida yurakcha, yog'och poydevor (22x24)
    function pethouseGrid() {
        const W = 22, H = 24, g = gridNew(W, H), set = (x, y, c) => { if (y >= 0 && y < H && x >= 0 && x < W) g[y][x] = c; };
        const WALL = [0xb39ddb, 0xc5b3e6, 0xd1c4e9, 0xe8e0f5], ROOF = [0xad1457, 0xd81b60, 0xec407a, 0xf48fb1];
        // tom (uchburchak, ikki tomonga osilgan)
        for (let y = 0; y < 9; y++) { const hw = 2 + y * 1.25; for (let x = Math.round(11 - hw); x <= Math.round(10 + hw); x++) set(x, y, shade(0.95 - y / 12 - (x - 11 + hw) / (hw * 4), x, y, ROOF)); }
        for (let x = 0; x < W; x++) set(x, 9, ROOF[0]);
        // devor
        for (let y = 10; y < 21; y++) for (let x = 2; x < 20; x++) set(x, y, shade(0.9 - (x - 2) / 30 - (y - 10) / 40, x, y, WALL));
        // dumaloq eshik
        for (let y = 12; y < 21; y++) for (let x = 7; x < 15; x++) { const d = Math.hypot((x - 10.5) / 3.6, (y - 15.5) / 5); if (y >= 15 ? Math.abs(x - 10.5) <= 3.6 : d <= 1) set(x, y, y > 17 ? 0x2a1638 : 0x4a2c5a); }
        set(9, 14, 0x7e57c2); set(10, 13, 0x7e57c2);
        // yurakcha (tom ostida)
        [[9, 4], [10, 4], [12, 4], [13, 4], [9, 5], [10, 5], [11, 5], [12, 5], [13, 5], [10, 6], [11, 6], [12, 6], [11, 7]].forEach(([x, y]) => set(x - 0.5 | 0, y, 0xfff176));
        // derazalar
        [[3, 13], [16, 13]].forEach(([x, y]) => { for (let yy = y; yy < y + 3; yy++) for (let xx = x; xx < x + 3; xx++) set(xx, yy, yy === y ? 0xfff9c4 : 0xffe082); });
        // poydevor
        for (let x = 1; x < 21; x++) { set(x, 21, 0x8d6e63); set(x, 22, 0x6d4c41); set(x, 23, 0x4e342e); }
        return gridOutline(g, 0x2a1a30);
    }
    window.FarmArt = {
        homeGrid: (id) => homeGrids[id](),
        homeIcon: (id) => iconURL('home_' + id, homeGrids[id](), id === 'rug' ? 2 : 3),
        cropGrid: mfCropGrid, fishGrid: mfFishGrid, netGrid: mfNetGrid,
        cropIcon: (id) => iconURL('crop_' + id, mfCropGrid(id, 2), 3),
        fishIcon: (id) => iconURL('fish_' + id, mfFishGrid(id), 3),
        netIcon: () => iconURL('net', mfNetGrid(), 3),
        rodIcon: () => iconURL('rod', rodGrid(), 3),
        fertGrid, waterGrid,
        fertIcon: () => iconURL('fert', fertGrid(), 3),
        elixirGrid, chipGrid, coinGrid, flowersGrid, lanternGrid, dogGrid, paintGrid, pethouseGrid, critterGrid,
        critterIcon: (f) => iconURL('crit_' + f, critterGrid(f), 4),
        icon: (key) => iconURL('ic_' + key, { elixir: elixirGrid, chip: chipGrid, coin: coinGrid, flowers: flowersGrid, lantern: lanternGrid, dog: () => dogGrid(0), paint: paintGrid, pethouse: pethouseGrid,
            rod: rodGrid, net: mfNetGrid, fert: fertGrid, water: waterGrid }[key](), key === 'coin' ? 2 : 3),
        waterIcon: () => iconURL('water', waterGrid(), 3)
    };
})();
