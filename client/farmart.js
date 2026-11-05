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
            pepper: 0xa5d6a7, eggplant: 0xce93d8, pineapple: 0xfff59d, grapes: 0xb39ddb, flower: 0xf48fb1 };
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
        } else if (id === 'flower') {
            // GUL: uchta pushti gul (o'rtasi sariq), egilgan poyalar va barglar
            [[7, 2.5], [3.5, 6.5], [10.5, 5.5]].forEach(([cx, cy]) => {
                for (let y = Math.round(cy) + 2; y < H; y++) set(Math.round(7 + (cx - 7) * (H - y) / (H - cy)), y, MF_LEAF[1]);
                for (let a = 0; a < 6; a++) { const r = 2.1, px = cx + Math.cos(a / 6 * Math.PI * 2) * r, py = cy + Math.sin(a / 6 * Math.PI * 2) * r; ball(px, py, 1.15, 1.15, (x, y) => (x + y) % 3 ? 0xf06292 : 0xf8bbd0); }
                set(Math.round(cx), Math.round(cy), 0xffd54f); set(Math.round(cx) + 1, Math.round(cy), 0xffb300);
            });
            leaf(6, 15, -0.9, 3); leaf(8, 13, 0.9, 3);
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
    // ===== YAYLOV BEZAKLARI va GRABL =====
    const meadowGrids = {
        // Gulzor: tosh chetli dumaloq tuproq, ichida rang-barang gullar
        flowerbed: () => mk(30, 14, (set) => {
            for (let x = 1; x < 29; x++) { set(x, 10, (x % 4) < 2 ? 0x9e9e9e : 0xbdbdbd); set(x, 11, (x % 4) < 2 ? 0x757575 : 0x9e9e9e); }
            for (let x = 3; x < 27; x++) { set(x, 9, 0x5d4037); set(x, 12, 0x616161); }
            [[4, 0xe53935], [8, 0xfdd835], [12, 0xf06292], [16, 0x7e57c2], [20, 0xff8a65], [24, 0x4fc3f7]].forEach(([x, c], i) => {
                const top = 2 + (i % 2) * 2;
                for (let y = top + 2; y < 9; y++) set(x, y, 0x558b2f);
                set(x + 1, top + 4, 0x8bc34a); set(x - 1, top + 5, 0x8bc34a);
                set(x, top, c); set(x - 1, top + 1, c); set(x + 1, top + 1, c); set(x, top + 2, c); set(x, top + 1, 0xfff8e1);
            });
        }),
        // Skameyka: yog'och o'rindiq va suyanchiq, qora temir oyoqlar
        bench: () => mk(32, 20, (set) => {
            for (let x = 2; x < 30; x++) { set(x, 2, 0xa1887f); set(x, 3, 0x8d6e63); set(x, 6, 0xa1887f); set(x, 7, 0x8d6e63); }
            for (let x = 1; x < 31; x++) { set(x, 11, 0xbcaaa4); set(x, 12, 0x8d6e63); set(x, 13, 0x6d4c41); }
            [3, 28].forEach(x => { for (let y = 1; y < 20; y++) { set(x, y, 0x263238); set(x + 1, y, 0x37474f); } });
            for (let y = 14; y < 20; y++) { set(8, y, 0x263238); set(23, y, 0x263238); }
            set(2, 19, 0x263238); set(5, 19, 0x263238); set(27, 19, 0x263238); set(30, 19, 0x263238);
        }),
        // Ko'cha chirog'i: baland qora ustun, egilgan bosh, sariq shisha
        lamppost: () => mk(16, 48, (set) => {
            for (let y = 10; y < 46; y++) { set(7, y, 0x263238); set(8, y, 0x37474f); }
            for (let x = 4; x < 12; x++) { set(x, 46, 0x263238); set(x, 47, 0x37474f); }
            for (let x = 5; x < 11; x++) set(x, 30, 0x455a64);
            for (let x = 3; x < 13; x++) { set(x, 1, 0x263238); set(x, 9, 0x263238); }
            set(7, 0, 0x37474f); set(8, 0, 0x37474f);
            for (let y = 2; y < 9; y++) { set(3, y, 0x263238); set(12, y, 0x263238); for (let x = 4; x < 12; x++) set(x, y, y < 4 ? 0xfffde7 : y < 7 ? 0xffee58 : 0xffca28); }
            for (let y = 2; y < 9; y++) { set(7, y, 0x37474f); }
        }),
        // Bog' gnomi: qizil uchli qalpoq, oq soqol, ko'k kiyim, jigarrang etik
        gnome: () => mk(14, 22, (set) => {
            for (let y = 0; y < 8; y++) { const hw = Math.floor(y / 2); for (let x = 7 - hw; x <= 7 + hw; x++) set(x, y, y < 6 ? 0xe53935 : 0xc62828); }
            for (let x = 3; x < 12; x++) set(x, 8, 0xb71c1c);
            for (let y = 9; y < 11; y++) for (let x = 4; x < 11; x++) set(x, y, 0xffccbc);
            set(5, 9, 0x212121); set(9, 9, 0x212121); set(7, 10, 0xff8a80);
            for (let y = 11; y < 15; y++) { const hw = 4 - Math.floor((y - 11) / 2); for (let x = 7 - hw; x <= 7 + hw; x++) set(x, y, 0xfafafa); }
            for (let y = 13; y < 19; y++) for (let x = 3; x < 12; x++) if (!(y < 15 && x > 4 && x < 10)) set(x, y, 0x1e88e5);
            for (let x = 3; x < 12; x++) set(x, 17, 0x5d4037);
            for (let y = 19; y < 22; y++) { set(4, y, 0x4e342e); set(5, y, 0x4e342e); set(9, y, 0x4e342e); set(10, y, 0x4e342e); }
        }),
        // Arg'imchoq: yog'och A-ramka, arqonlar, o'rindiq
        swing: () => mk(38, 42, (set) => {
            for (let x = 1; x < 37; x++) { set(x, 1, 0x8d6e63); set(x, 2, 0x6d4c41); }
            for (let y = 2; y < 42; y++) {
                const d = Math.floor((y - 2) / 6);
                set(3 - Math.min(2, d), y, 0x795548); set(4 - Math.min(2, d), y, 0x6d4c41);
                set(33 + Math.min(2, d), y, 0x795548); set(34 + Math.min(2, d), y, 0x6d4c41);
            }
            for (let y = 3; y < 30; y++) { set(14, y, 0xd7ccc8); set(23, y, 0xd7ccc8); }
            for (let x = 12; x < 26; x++) { set(x, 30, 0xef5350); set(x, 31, 0xc62828); }
        }),
        // Favvora: tosh hovuz, o'rtada ustun, sachrayotgan suv
        fountain: () => mk(44, 30, (set) => {
            for (let x = 2; x < 42; x++) for (let y = 20; y < 30; y++) set(x, y, y === 20 ? 0xcfd8dc : (x + y) % 5 === 0 ? 0x90a4ae : 0xb0bec5);
            for (let x = 5; x < 39; x++) { set(x, 21, 0x4fc3f7); set(x, 22, 0x29b6f6); }
            for (let y = 8; y < 21; y++) for (let x = 19; x < 25; x++) set(x, y, x === 19 ? 0xeceff1 : 0xb0bec5);
            for (let x = 15; x < 29; x++) { set(x, 9, 0xcfd8dc); set(x, 10, 0x90a4ae); }
            for (let k = 0; k < 9; k++) { set(21 - k, 7 - Math.round(Math.sin(k / 3) * 4) + k, 0x81d4fa); set(22 + k, 7 - Math.round(Math.sin(k / 3) * 4) + k, 0x81d4fa); }
            for (let y = 1; y < 8; y++) { set(21, y, 0xb3e5fc); set(22, y, 0xe1f5fe); }
            set(10, 19, 0xe1f5fe); set(33, 19, 0xe1f5fe); set(14, 18, 0xb3e5fc); set(29, 18, 0xb3e5fc);
        }),
        // Grabl (do'kon belgisi): qiya dasta, temir tishli bosh
        rake: () => mk(16, 18, (set) => {
            for (let k = 0; k < 13; k++) { set(2 + k, 16 - k, k % 2 ? 0x8d6e63 : 0xa1887f); }
            for (let x = 9; x < 16; x++) set(x, 2, 0x78909c);
            for (let x = 9; x < 16; x += 2) { set(x, 3, 0x90a4ae); set(x, 4, 0x90a4ae); set(x, 5, 0x607d8b); }
            set(12, 1, 0x546e7a); set(13, 1, 0x546e7a);
        })
    };
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
    // Yorug'lik chap-yuqoridan: har sirt - soyali (Bayer), qirralari yorug' / soyali, yog'och - tolali. Qora kontur - mk() da
    const WOOD = [0x3e2418, 0x5a3622, 0x774a2e, 0x96613d, 0xb57d50, 0xd19a68];
    const DWOOD = [0x22140c, 0x33200f, 0x4a2e19, 0x5f3c22, 0x7a5030];
    const GOLD = [0x7a5200, 0xb07800, 0xd9a300, 0xffd54f, 0xfff3b0];
    const IRON = [0x263238, 0x37474f, 0x546e7a, 0x78909c, 0xb0bec5];
    const STONE = [0x3a3a40, 0x52525a, 0x6b6b74, 0x86868f, 0xa4a4ad];
    // soyali to'rtburchak: l - yorqinlik siljishi
    const box = (set, x0, y0, w, h, P, l = 0) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, shade(0.9 + l - (y - y0) / Math.max(1, h) * 0.45 - (x - x0) / Math.max(1, w) * 0.25, x, y, P)); };
    // yog'och taxta: gorizontal tolalar va chap-yuqori qirra yorug'
    const plank = (set, x0, y0, w, h, P, l = 0) => {
        box(set, x0, y0, w, h, P, l);
        for (let y = y0 + 1; y < y0 + h; y += 3) for (let x = x0 + ((y * 7) % 5); x < x0 + w - 1; x += 6) { set(x, y, P[1]); set(x + 1, y, P[1]); }
        for (let x = x0; x < x0 + w; x++) set(x, y0, P[P.length - 1]);
        for (let y = y0; y < y0 + h; y++) set(x0, y, P[P.length - 2]);
    };
    const knob = (set, x, y, c = GOLD) => { set(x, y, c[3]); set(x + 1, y, c[2]); set(x, y + 1, c[2]); set(x + 1, y + 1, c[1]); };
    const homeGrids = {
        // Yashik: dumaloq qopqoq, temir halqalar, oltin qulf
        chest: () => mk(20, 16, (set) => {
            for (let y = 0; y < 6; y++) { const cut = y === 0 ? 2 : y === 1 ? 1 : 0; for (let x = cut; x < 20 - cut; x++) set(x, y, shade(0.98 - y / 10 - x / 60, x, y, WOOD)); }
            plank(set, 0, 6, 20, 10, WOOD, -0.08);
            for (let x = 0; x < 20; x++) { set(x, 6, IRON[0]); set(x, 15, IRON[1]); }
            [2, 17].forEach(x => { for (let y = 0; y < 16; y++) { set(x, y, IRON[2]); set(x + 1, y, IRON[1]); } set(x, 3, IRON[4]); set(x, 10, IRON[4]); });
            for (let y = 5; y < 10; y++) for (let x = 8; x < 12; x++) set(x, y, shade(1 - (y - 5) / 6, x, y, GOLD));
            set(9, 7, 0x1a1208); set(10, 7, 0x1a1208); set(9, 8, 0x1a1208);
        }),
        // Stol: qalin qopqoq, o'yilgan oyoqlar; ustida - ko'zacha va kitob
        table: () => mk(26, 18, (set) => {
            for (let y = 0; y < 4; y++) for (let x = 3; x < 7; x++) set(x, y, shade(0.95 - x / 14, x, y, [0x1565c0, 0x1e88e5, 0x64b5f6, 0xbbdefb]));   // ko'zacha
            set(4, 0, 0x0d47a1); set(5, 0, 0x0d47a1);
            for (let x = 16; x < 23; x++) { set(x, 2, 0xc62828); set(x, 3, 0xeceff1); } for (let x = 17; x < 22; x++) set(x, 1, 0x8e1b1b);   // kitob
            plank(set, 0, 4, 26, 3, WOOD, 0.08);
            for (let x = 0; x < 26; x++) set(x, 7, WOOD[1]);
            box(set, 2, 7, 22, 2, DWOOD);
            [[2, 4], [20, 4]].forEach(([x0, w]) => { for (let y = 9; y < 18; y++) { const k = y > 15 ? 1 : 0; for (let x = x0 + (y > 11 && y < 15 ? 1 : 0) - k; x < x0 + w - (y > 11 && y < 15 ? 1 : 0) + k; x++) set(x, y, shade(0.85 - (x - x0) / 6, x, y, WOOD)); } });
        }),
        // Stul: o'yilgan suyanchiq, qizil yostiqcha
        chair: () => mk(12, 22, (set) => {
            for (let y = 0; y < 11; y++) { set(1, y, WOOD[3]); set(2, y, WOOD[2]); set(9, y, WOOD[3]); set(10, y, WOOD[2]); }
            for (let x = 1; x < 11; x++) { set(x, 0, WOOD[4]); set(x, 1, WOOD[3]); }
            [4, 7].forEach(y => { for (let x = 3; x < 9; x++) set(x, y, WOOD[3]); });
            for (let y = 3; y < 9; y++) { set(5, y, WOOD[2]); set(6, y, WOOD[3]); }
            for (let y = 11; y < 14; y++) for (let x = 0; x < 12; x++) set(x, y, shade(0.95 - (y - 11) / 4, x, y, [0x8e1b1b, 0xc62828, 0xe53935, 0xef9a9a]));
            for (let x = 0; x < 12; x++) set(x, 14, WOOD[1]);
            [1, 9].forEach(x => { for (let y = 15; y < 22; y++) { set(x, y, WOOD[3]); set(x + 1, y, WOOD[1]); } });
            for (let x = 2; x < 10; x++) set(x, 18, WOOD[2]);
        }),
        // Kreslo: yashil baxmal, tugmachali suyanchiq, dumaloq qo'ltiqlar (elf shunda kitob o'qiydi)
        armchair: () => mk(20, 22, (set) => {
            const C = [0x123f17, 0x1b5e20, 0x2e7d32, 0x43a047, 0x66bb6a, 0x9ccc65];
            for (let y = 0; y < 13; y++) { const cut = y === 0 ? 2 : y === 1 ? 1 : 0; for (let x = 3 + cut; x < 17 - cut; x++) set(x, y, shade(0.98 - y / 18 - x / 70, x, y, C)); }
            [[5, 3], [10, 3], [14, 3], [7, 7], [12, 7]].forEach(([x, y]) => { set(x, y, C[0]); set(x + 1, y + 1, C[4]); });
            for (let y = 7; y < 17; y++) { for (let x = 0; x < 4; x++) set(x, y, shade(0.92 - (y - 7) / 16 - x / 10, x, y, C)); for (let x = 16; x < 20; x++) set(x, y, shade(0.75 - (y - 7) / 16, x, y, C)); }
            for (let x = 0; x < 4; x++) set(x, 7, C[5]); for (let x = 16; x < 20; x++) set(x, 7, C[4]);
            for (let y = 13; y < 17; y++) for (let x = 4; x < 16; x++) set(x, y, y === 13 ? C[5] : shade(0.85 - (y - 13) / 6, x, y, C));
            for (let x = 1; x < 19; x++) set(x, 17, DWOOD[2]);
            [[1, 3], [16, 3]].forEach(([x0]) => { for (let y = 18; y < 22; y++) { set(x0, y, WOOD[3]); set(x0 + 1, y, WOOD[2]); set(x0 + 2, y, WOOD[1]); } });
        }),
        // Divan: ko'k baxmal, ikki yostiq, tugmalar, yog'och oyoqlar (elf kechasi shunda uxlaydi)
        sofa: () => mk(40, 19, (set) => {
            const C = [0x0a2f6e, 0x0d47a1, 0x1565c0, 0x1e88e5, 0x64b5f6, 0xbbdefb];
            for (let y = 0; y < 10; y++) { const cut = y === 0 ? 2 : y === 1 ? 1 : 0; for (let x = 3 + cut; x < 37 - cut; x++) set(x, y, shade(0.98 - y / 15 - x / 140, x, y, C)); }
            for (let x = 6; x < 36; x += 6) { set(x, 3, C[0]); set(x + 1, 4, C[4]); set(x - 3, 6, C[0]); set(x - 2, 7, C[4]); }
            for (let y = 5; y < 15; y++) { for (let x = 0; x < 4; x++) set(x, y, shade(0.92 - (y - 5) / 16 - x / 10, x, y, C)); for (let x = 36; x < 40; x++) set(x, y, shade(0.7 - (y - 5) / 16, x, y, C)); }
            for (let x = 0; x < 4; x++) set(x, 5, C[5]); for (let x = 36; x < 40; x++) set(x, 5, C[4]);
            for (let y = 10; y < 15; y++) for (let x = 4; x < 36; x++) set(x, y, y === 10 ? C[5] : x === 20 ? C[1] : shade(0.88 - (y - 10) / 7, x, y, C));
            const P = [0xc79100, 0xffca28, 0xffe082, 0xfff8e1];
            [[6, 2], [28, 2]].forEach(([x0, y0]) => { for (let y = y0; y < y0 + 7; y++) for (let x = x0; x < x0 + 6; x++) if (!((y === y0 || y === y0 + 6) && (x === x0 || x === x0 + 5))) set(x, y, shade(0.98 - (y - y0) / 9 - (x - x0) / 14, x, y, P)); });
            for (let x = 1; x < 39; x++) set(x, 15, C[0]);
            [[2, 3], [35, 3]].forEach(([x0]) => { for (let y = 16; y < 19; y++) { set(x0, y, WOOD[3]); set(x0 + 1, y, WOOD[2]); set(x0 + 2, y, WOOD[1]); } });
        }),
        // Karavot: baland bosh taxtasi, oq yostiq, yamoqli adyol
        bed: () => mk(32, 20, (set) => {
            for (let y = 0; y < 20; y++) for (let x = 0; x < 3; x++) set(x, y, shade(0.92 - x / 5 - y / 50, x, y, WOOD));
            for (let x = 0; x < 3; x++) { set(x, 0, WOOD[5]); } set(1, 1, WOOD[5]);
            for (let y = 8; y < 20; y++) for (let x = 29; x < 32; x++) set(x, y, shade(0.8 - (x - 29) / 5, x, y, WOOD));
            for (let x = 29; x < 32; x++) set(x, 8, WOOD[5]);
            for (let y = 6; y < 11; y++) for (let x = 3; x < 10; x++) if (!(y === 6 && (x === 3 || x === 9))) set(x, y, shade(1.02 - (y - 6) / 8 - (x - 3) / 20, x, y, [0xb0bec5, 0xcfd8dc, 0xeceff1, 0xffffff]));
            const Q = [[0x8e1b1b, 0xc62828, 0xe53935, 0xef9a9a], [0x1b5e20, 0x2e7d32, 0x43a047, 0xa5d6a7], [0x7a5200, 0xb07800, 0xd9a300, 0xffe082]];
            for (let y = 8; y < 15; y++) for (let x = 9; x < 29; x++) { const q = Q[(Math.floor((x - 9) / 5) + Math.floor((y - 8) / 4)) % 3]; set(x, y, (x - 9) % 5 === 0 || (y - 8) % 4 === 0 ? 0xfff3e0 : shade(0.95 - (y - 8) / 12, x, y, q)); }
            for (let x = 9; x < 29; x++) set(x, 8, 0xffffff);
            for (let y = 15; y < 18; y++) for (let x = 3; x < 29; x++) set(x, y, shade(0.7 - (y - 15) / 6, x, y, WOOD));
            for (let y = 18; y < 20; y++) { set(3, y, WOOD[1]); set(4, y, WOOD[2]); set(27, y, WOOD[1]); set(28, y, WOOD[2]); }
        }),
        // Kitob javoni: tepasi o'yma, 3 tokcha - rang-barang kitoblar, tuvakcha
        shelf: () => mk(20, 31, (set) => {
            for (let x = 0; x < 20; x++) { set(x, 0, WOOD[5]); set(x, 1, WOOD[3]); set(x, 2, WOOD[2]); }
            for (let y = 3; y < 31; y++) { set(0, y, WOOD[4]); set(1, y, WOOD[3]); set(18, y, WOOD[2]); set(19, y, WOOD[1]); for (let x = 2; x < 18; x++) set(x, y, shade(0.35 + (y % 9) / 60, x, y, DWOOD)); }
            [11, 20, 29].forEach(y => { for (let x = 1; x < 19; x++) { set(x, y, WOOD[4]); set(x, y + 1, WOOD[2]); } });
            const C = [[0xb71c1c, 0xe53935], [0x0d47a1, 0x1e88e5], [0x1b5e20, 0x43a047], [0xf9a825, 0xfdd835], [0x4a148c, 0x8e24aa], [0xbf360c, 0xff7043], [0x004d40, 0x00897b]];
            [3, 12, 21].forEach((y0, r) => {
                let x = 2, i = r * 3;
                while (x < 17) {
                    const w = 2, hgt = 6 + (i % 3), c = C[i % C.length], lean = r === 1 && i % 5 === 4;
                    if (r === 0 && x > 12) { for (let y = y0 + 4; y < y0 + 8; y++) for (let xx = 13; xx < 17; xx++) set(xx, y, shade(0.9 - (xx - 13) / 6, xx, y, [0x8d3a1a, 0xbf5a2a, 0xe07b45])); [[14, y0 + 1], [15, y0 + 2], [13, y0 + 2], [16, y0 + 3], [14, y0 + 3]].forEach(([px, py]) => set(px, py, 0x66bb6a)); break; }
                    for (let xx = x; xx < Math.min(17, x + w); xx++) for (let y = y0 + 8 - hgt + (lean ? 1 : 0); y < y0 + 8; y++) set(xx, y, xx === x ? c[1] : c[0]);
                    set(x, y0 + 8 - hgt + 2, 0xffe082);
                    x += w + (i % 4 === 3 ? 1 : 0); i++;
                }
            });
        }),
        // Kamin: tosh g'ishtlar, yog'och peshtaxta (ustida shamlar va soat), olov va o'tinlar
        fireplace: () => mk(28, 30, (set) => {
            for (let y = 6; y < 30; y++) for (let x = 0; x < 28; x++) { const row = Math.floor((y - 6) / 3), off = row % 2 ? 2 : 0, mortar = (y - 6) % 3 === 2 || (x + off) % 5 === 4; set(x, y, mortar ? STONE[0] : shade(0.85 - (y - 6) / 70 - ((x + off) % 5) / 30, x, y, STONE)); }
            plank(set, 0, 4, 28, 3, WOOD, 0.05);
            for (let x = 0; x < 28; x++) set(x, 7, WOOD[1]);
            [3, 24].forEach(x => { for (let y = 0; y < 4; y++) { set(x, y, 0xfff8e1); } set(x, -1, 0xffb300); });   // shamlar
            [[3, 0], [24, 0]].forEach(([x]) => set(x, 0, 0xffca28));
            for (let y = 0; y < 4; y++) for (let x = 11; x < 17; x++) set(x, y, shade(0.95 - y / 6, x, y, GOLD));   // soat
            set(13, 1, 0x3e2418); set(14, 2, 0x3e2418); set(14, 1, 0xfff8e1);
            for (let y = 12; y < 30; y++) for (let x = 6; x < 22; x++) { const r = Math.hypot((x - 13.5) / 8, (y - 13) / 4); if (y > 14 || r < 1) set(x, y, 0x120a08); }
            for (let y = 18; y < 28; y++) for (let x = 7; x < 21; x++) { const d = Math.abs(x - 13.5) / 6.5 + (27 - y) / 10; if (d < 0.6) set(x, y, 0xfff59d); else if (d < 0.9) set(x, y, 0xffb300); else if (d < 1.15 && (x + y) % 2) set(x, y, 0xe64a19); }
            for (let x = 7; x < 21; x++) { set(x, 28, (x % 4 < 2) ? WOOD[2] : WOOD[3]); set(x, 29, WOOD[1]); }
        }),
        // Tuvakdagi gullar
        pot: () => mk(12, 16, (set) => {
            for (let y = 9; y < 16; y++) { const k = y > 13 ? 1 : 0; for (let x = 2 + k; x < 10 - k; x++) set(x, y, shade(0.95 - (x - 2) / 10 - (y - 9) / 20, x, y, [0x6d2a10, 0x8d3a1a, 0xbf5a2a, 0xe07b45, 0xf4a26f])); }
            for (let x = 1; x < 11; x++) { set(x, 9, 0xe07b45); set(x, 10, 0xbf5a2a); }
            for (let y = 4; y < 9; y++) { set(5, y, 0x33691e); set(7, y + 1, 0x558b2f); }
            set(4, 6, 0x7cb342); set(8, 5, 0x7cb342); set(3, 7, 0x9ccc65);
            [[5, 1], [4, 2], [6, 2], [5, 3]].forEach(([x, y]) => set(x, y, 0xec407a)); set(5, 2, 0xfff59d);
            [[8, 2], [7, 3], [9, 3], [8, 4]].forEach(([x, y]) => set(x, y, 0xab47bc)); set(8, 3, 0xfff59d);
            [[2, 4], [3, 4], [2, 5]].forEach(([x, y]) => set(x, y, 0xffca28));
        }),
        // Katta o'simlik: oq sopol tuvakda keng bargli fikus
        plant: () => mk(18, 28, (set) => {
            for (let y = 19; y < 28; y++) { const k = y > 25 ? 1 : 0; for (let x = 4 + k; x < 14 - k; x++) set(x, y, shade(1 - (x - 4) / 12 - (y - 19) / 25, x, y, [0x90a4ae, 0xcfd8dc, 0xeceff1, 0xffffff])); }
            for (let x = 3; x < 15; x++) set(x, 19, 0xffffff);
            for (let x = 4; x < 14; x++) set(x, 22, 0x4fc3f7);
            for (let y = 8; y < 19; y++) set(8 + (y % 4 === 0 ? 1 : 0), y, 0x5d4037);
            const L = [0x1b5e20, 0x2e7d32, 0x43a047, 0x66bb6a, 0xa5d6a7];
            [[3, 9, -1], [13, 8, 1], [4, 3, -1], [12, 3, 1], [8, 0, 0], [2, 15, -1], [14, 14, 1]].forEach(([cx, cy]) => {
                for (let y = cy; y < cy + 5; y++) for (let x = cx - 2; x <= cx + 2; x++) if (Math.abs(x - cx) + Math.abs(y - cy - 2) <= 2.5) set(x, y, shade(0.95 - (y - cy) / 8 - (x - cx + 2) / 10, x, y, L));
                set(cx, cy + 2, L[1]);
            });
        }),
        // Gilam: naqshli, chetida popuklar
        rug: () => mk(52, 6, (set) => {
            for (let y = 0; y < 6; y++) for (let x = 0; x < 52; x++) {
                const edge = y === 0 || y === 5 || x < 2 || x > 49, inner = y === 1 || y === 4 || x === 2 || x === 49;
                set(x, y, edge ? 0x6d1414 : inner ? 0xffb300 : ((Math.abs(x - 26) + y * 3) % 8 < 4 ? 0xc62828 : (x % 6 < 3 ? 0x283593 : 0xe53935)));
            }
            for (let x = 0; x < 52; x += 2) { set(x, 5, 0xfff3e0); }
            for (let y = 2; y < 4; y++) for (let x = 24; x < 28; x++) set(x, y, 0xfff59d);
        }),
        // Devordagi rasm: o'yma oltin rom, tog'li manzara, ko'l, quyosh
        painting: () => mk(22, 18, (set) => {
            for (let y = 0; y < 18; y++) for (let x = 0; x < 22; x++) { const fr = x < 2 || x > 19 || y < 2 || y > 15; if (fr) set(x, y, shade(0.95 - (x + y) / 60 - ((x + y) % 3 === 0 ? 0.2 : 0), x, y, GOLD)); }
            for (let y = 2; y < 16; y++) for (let x = 2; x < 20; x++) set(x, y, y < 9 ? shade(1 - (y - 2) / 14, x, y, [0x4fc3f7, 0x81d4fa, 0xb3e5fc, 0xe1f5fe]) : y < 12 ? shade(0.9 - (y - 9) / 10, x, y, [0x2e7d32, 0x43a047, 0x7cb342]) : shade(0.8, x, y, [0x0277bd, 0x0288d1, 0x29b6f6]));
            // ikki tog' cho'qqisi (qorli uchlari bilan): har ustunda balandligi - cho'qqidan uzoqlashgan sari pasayadi
            for (let x = 2; x < 20; x++) {
                const top = Math.min(4 + Math.abs(x - 8) * 1.1, 6 + Math.abs(x - 15) * 1.2);
                for (let y = Math.ceil(top); y < 11; y++) set(x, y, y < top + 2 ? 0xffffff : shade(0.95 - (x < 8 || (x > 11 && x < 15) ? 0 : 0.25) - (y - top) / 14, x, y, [0x37474f, 0x546e7a, 0x78909c, 0x90a4ae]));
            }
            for (let y = 3; y < 6; y++) for (let x = 15; x < 18; x++) set(x, y, (x === 15 && y === 3) ? 0xfff59d : 0xffca28);
            for (let x = 4; x < 18; x += 3) set(x, 13, 0xe1f5fe);
        }),
        // Osma chiroq: zanjir, mis qopqoq, yonib turgan shisha qalpoq
        lamp: () => mk(14, 22, (set) => {
            for (let y = 0; y < 9; y++) set(7, y, y % 2 ? IRON[1] : IRON[3]);
            for (let x = 5; x < 9; x++) { set(x, 9, GOLD[2]); set(x, 10, GOLD[1]); }
            for (let y = 11; y < 18; y++) { const half = 2 + (y - 11); for (let x = 7 - half; x < 7 + half; x++) set(x, y, shade(1.05 - (y - 11) / 14 - Math.abs(x - 6.5) / 16, x, y, [0xf57f17, 0xffb300, 0xffd54f, 0xffecb3, 0xfffde7])); }
            for (let x = -1; x < 15; x++) set(x, 18, GOLD[1]);
            for (let x = 5; x < 9; x++) { set(x, 19, 0xfff59d); set(x, 20, 0xffffff); }
        }),
        // ===== YANGI JIHOZLAR =====
        // Shkaf: ikki eshikli, o'yma toj, oltin tutqichlar
        wardrobe: () => mk(24, 34, (set) => {
            for (let y = 0; y < 3; y++) for (let x = -1 + y; x < 25 - y; x++) set(x, y, y === 0 ? WOOD[5] : WOOD[3]);
            for (let y = 3; y < 31; y++) for (let x = 0; x < 24; x++) set(x, y, shade(0.88 - (y - 3) / 60 - x / 70, x, y, WOOD));
            [[2, 9], [13, 9]].forEach(([x0, w]) => {
                for (let y = 5; y < 29; y++) for (let x = x0; x < x0 + w; x++) { const b = x === x0 || x === x0 + w - 1 || y === 5 || y === 28; set(x, y, b ? WOOD[1] : shade(0.8 - (y - 5) / 50 - (x - x0) / 30, x, y, WOOD)); }
                for (let y = 7; y < 15; y++) for (let x = x0 + 2; x < x0 + w - 2; x++) set(x, y, (x === x0 + 2 || y === 7) ? WOOD[4] : WOOD[2]);
                for (let y = 17; y < 26; y++) for (let x = x0 + 2; x < x0 + w - 2; x++) set(x, y, (x === x0 + 2 || y === 17) ? WOOD[4] : WOOD[2]);
            });
            knob(set, 10, 16); knob(set, 13, 16);
            for (let y = 31; y < 34; y++) { set(1, y, WOOD[2]); set(2, y, WOOD[1]); set(21, y, WOOD[2]); set(22, y, WOOD[1]); }
        }),
        // Komod: uch tortma, oltin dastaklar; ustida shamdon va kichik ko'zgu
        dresser: () => mk(26, 20, (set) => {
            for (let y = 0; y < 5; y++) for (let x = 15; x < 21; x++) { const d = Math.hypot((x - 17.5) / 3, (y - 2.5) / 2.6); if (d < 1) set(x, y, d > 0.75 ? GOLD[2] : shade(1 - (x - 15) / 8, x, y, [0x90a4ae, 0xcfd8dc, 0xe1f5fe])); }
            for (let y = 1; y < 5; y++) set(5, y, 0xfff8e1); set(5, 0, 0xffb300); for (let x = 4; x < 7; x++) set(x, 5, GOLD[2]);
            plank(set, 0, 5, 26, 2, WOOD, 0.1);
            for (let y = 7; y < 18; y++) for (let x = 1; x < 25; x++) set(x, y, shade(0.75 - x / 80, x, y, WOOD));
            [8, 11, 14].forEach(y0 => { for (let x = 2; x < 24; x++) { set(x, y0 - 1, WOOD[1]); set(x, y0, WOOD[4]); } knob(set, 7, y0 + 1); knob(set, 17, y0 + 1); });
            for (let y = 18; y < 20; y++) { set(1, y, WOOD[2]); set(2, y, WOOD[1]); set(23, y, WOOD[2]); set(24, y, WOOD[1]); }
        }),
        // Katta soat: toj, siferblat, mayatnik oynasi
        clock: () => mk(14, 36, (set) => {
            for (let y = 0; y < 4; y++) for (let x = y < 2 ? 2 - y : 0; x < (y < 2 ? 12 + y : 14); x++) set(x, y, y === 0 ? WOOD[5] : WOOD[3]);
            for (let y = 4; y < 33; y++) for (let x = 1; x < 13; x++) set(x, y, shade(0.85 - (y - 4) / 80 - x / 40, x, y, DWOOD.concat([WOOD[3]])));
            for (let y = 5; y < 14; y++) for (let x = 2; x < 12; x++) { const d = Math.hypot(x - 6.5, y - 9); if (d < 4.6) set(x, y, d > 3.8 ? GOLD[2] : 0xfff8e1); }
            for (let k = 0; k < 12; k++) set(Math.round(6.5 + Math.cos(k * Math.PI / 6) * 3.2), Math.round(9 + Math.sin(k * Math.PI / 6) * 3.2), 0x3e2418);
            set(7, 7, 0x1a1208); set(7, 8, 0x1a1208); set(8, 9, 0x1a1208); set(9, 9, 0x1a1208);
            for (let y = 16; y < 29; y++) for (let x = 4; x < 10; x++) set(x, y, (x === 4 || x === 9 || y === 16 || y === 28) ? GOLD[1] : 0x20140c);
            for (let y = 17; y < 25; y++) set(7, y, GOLD[2]); for (let y = 24; y < 28; y++) for (let x = 6; x < 9; x++) set(x, y, Math.hypot(x - 7, y - 25.5) < 1.6 ? GOLD[3] : 0x20140c);
            for (let y = 33; y < 36; y++) for (let x = 0; x < 14; x++) set(x, y, shade(0.7 - (y - 33) / 6, x, y, WOOD));
        }),
        // Pianino: qora lak, oq-qora klavishlar, ustida shamdon va notalar
        piano: () => mk(32, 24, (set) => {
            const B = [0x0d0d12, 0x18181f, 0x24242d, 0x34343f, 0x4a4a57];
            for (let y = 0; y < 5; y++) for (let x = 17; x < 25; x++) set(x, y, x === 17 || x === 24 ? 0xd7ccc8 : 0xfff8e1);   // notalar varag'i: chiziqlar va notalar
            for (let x = 18; x < 24; x++) { set(x, 1, 0xbdbdbd); set(x, 3, 0xbdbdbd); }
            set(19, 2, 0x212121); set(21, 1, 0x212121); set(23, 3, 0x212121); set(20, 3, 0x212121);
            [4, 28].forEach(x => { for (let y = 1; y < 5; y++) set(x, y, 0xfff8e1); set(x, 0, 0xffb300); set(x - 1, 5, GOLD[2]); set(x, 5, GOLD[2]); set(x + 1, 5, GOLD[2]); });
            for (let y = 5; y < 13; y++) for (let x = 0; x < 32; x++) set(x, y, shade(0.75 - (y - 5) / 20 - x / 120, x, y, B));
            for (let x = 0; x < 32; x++) set(x, 5, B[4]);
            for (let x = 4; x < 28; x += 8) for (let y = 7; y < 11; y++) set(x + 2, y, GOLD[1]);
            for (let x = 0; x < 32; x++) { set(x, 13, B[2]); set(x, 14, 0xf5f5f5); set(x, 15, 0xffffff); set(x, 16, 0xe0e0e0); }
            for (let x = 1; x < 31; x++) if (x % 2) { set(x, 16, 0x9e9e9e); } for (let x = 2; x < 31; x++) if ([0, 1, 3, 4, 5].includes(x % 7)) { set(x, 14, 0x111111); set(x, 15, 0x111111); }
            for (let y = 17; y < 24; y++) for (let x = 1; x < 31; x++) set(x, y, shade(0.6 - (y - 17) / 14, x, y, B));
            [2, 28].forEach(x => { for (let y = 17; y < 24; y++) { set(x, y, B[3]); set(x + 1, y, B[1]); } });
        }),
        // Akvarium: yog'och tagkursi, shisha, suv, baliqlar, suv o'tlari, pufakchalar
        aquarium: () => mk(26, 24, (set) => {
            for (let y = 0; y < 14; y++) for (let x = 0; x < 26; x++) {
                const glass = x === 0 || x === 25 || y === 0 || y === 13;
                set(x, y, glass ? (y === 0 ? 0x546e7a : 0x90a4ae) : y < 2 ? 0xb3e5fc : shade(0.9 - y / 22, x, y, [0x01579b, 0x0277bd, 0x0288d1, 0x29b6f6, 0x81d4fa]));
            }
            for (let x = 1; x < 25; x++) { set(x, 12, (x % 3) ? 0xd7ccc8 : 0xbcaaa4); }
            [[4, 7], [9, 5], [20, 6]].forEach(([x0, h]) => { for (let k = 0; k < h; k++) set(x0 + (k % 2), 11 - k, k % 2 ? 0x43a047 : 0x66bb6a); });
            [[7, 4, 0xff7043], [15, 7, 0xffca28], [18, 3, 0xec407a]].forEach(([x, y, c]) => { set(x, y, c); set(x + 1, y, c); set(x + 2, y, c); set(x - 1, y - 1, c); set(x - 1, y + 1, c); set(x + 2, y - 1, 0x212121); });
            [[13, 2], [12, 4], [13, 6], [22, 9], [23, 4]].forEach(([x, y]) => set(x, y, 0xe1f5fe));
            for (let x = 1; x < 25; x++) set(x, 1, 0xe1f5fe);
            plank(set, 0, 14, 26, 2, WOOD, 0.1);
            for (let y = 16; y < 24; y++) for (let x = 1; x < 25; x++) set(x, y, shade(0.7 - (y - 16) / 20, x, y, WOOD));
            for (let y = 17; y < 23; y++) for (let x = 3; x < 23; x++) if (x === 3 || x === 22 || y === 17 || y === 22) set(x, y, WOOD[1]);
            knob(set, 12, 19);
        }),
        // Ritsar zirhi: dubulg'a (pat bilan), ko'krak sovuti, qalqon, tagkursi
        armor: () => mk(18, 34, (set) => {
            for (let y = 0; y < 3; y++) for (let x = 7; x < 11; x++) set(x, y, y === 0 ? 0xff8a80 : 0xe53935);   // pat
            for (let y = 3; y < 10; y++) for (let x = 5; x < 13; x++) { const r = Math.hypot((x - 8.5) / 4, (y - 7) / 4); if (r < 1) set(x, y, shade(1 - r * 0.4 - (x - 5) / 20, x, y, IRON)); }
            for (let x = 6; x < 12; x++) set(x, 7, 0x0d0d12); set(8, 8, 0x0d0d12); set(9, 8, 0x0d0d12);
            for (let y = 10; y < 22; y++) { const w = y < 12 ? 6 : y < 18 ? 5 : 4; for (let x = 9 - w; x < 9 + w; x++) set(x, y, shade(0.98 - (y - 10) / 24 - Math.abs(x - 8.5) / 14, x, y, IRON)); }
            for (let x = 3; x < 15; x++) set(x, 11, IRON[4]); for (let y = 12; y < 20; y++) set(8, y, IRON[1]);
            for (let x = 4; x < 14; x++) set(x, 19, 0x6d4c41);
            for (let y = 13; y < 23; y++) for (let x = 12; x < 18; x++) { const d = Math.abs(x - 15) + Math.max(0, y - 19) * 1.5; if (d < 3.2) set(x, y, (x === 15 || y === 16) ? 0xffca28 : shade(0.9 - (y - 13) / 14, x, y, [0x8e1b1b, 0xc62828, 0xe53935])); }
            for (let y = 22; y < 30; y++) { set(6, y, IRON[2]); set(7, y, IRON[3]); set(10, y, IRON[2]); set(11, y, IRON[1]); }
            for (let y = 30; y < 34; y++) for (let x = 2; x < 16; x++) set(x, y, shade(0.8 - (y - 30) / 6, x, y, WOOD));
        }),
        // Devor oynasi: oval, oltin rom, yaltirash
        mirror: () => mk(16, 22, (set) => {
            for (let y = 0; y < 22; y++) for (let x = 0; x < 16; x++) {
                const d = Math.hypot((x - 7.5) / 8, (y - 10.5) / 11);
                if (d < 1) set(x, y, d > 0.82 ? shade(1 - (x + y) / 50 - ((x + y) % 3 === 0 ? 0.25 : 0), x, y, GOLD) : shade(1 - (x + y) / 40, x, y, [0x78909c, 0xb0bec5, 0xcfd8dc, 0xe1f5fe]));
            }
            for (let k = 0; k < 5; k++) { set(5 + k, 4 + k, 0xffffff); set(6 + k, 4 + k, 0xffffff); }
            set(10, 13, 0xffffff); set(11, 14, 0xffffff);
            set(7, 0, GOLD[4]); set(8, 0, GOLD[3]);
        }),
        // Deraza: yog'och rom, osmon va bulut, ikki tomonda qizil parda
        window: () => mk(24, 22, (set) => {
            for (let y = 0; y < 2; y++) for (let x = 0; x < 24; x++) set(x, y, y === 0 ? WOOD[3] : WOOD[2]);
            for (let y = 2; y < 20; y++) for (let x = 4; x < 20; x++) {
                const fr = x === 4 || x === 19 || y === 2 || y === 19 || x === 11 || x === 12 || y === 10;
                set(x, y, fr ? (x === 4 || y === 2 ? WOOD[4] : WOOD[2]) : shade(1 - (y - 2) / 22, x, y, [0x4fc3f7, 0x81d4fa, 0xb3e5fc, 0xe1f5fe]));
            }
            [[7, 5], [8, 5], [9, 5], [8, 4], [15, 13], [16, 13], [17, 13], [16, 12]].forEach(([x, y]) => set(x, y, 0xffffff));
            for (let x = 4; x < 20; x++) { set(x, 20, WOOD[4]); set(x, 21, WOOD[2]); }
            const R = [0x6d1414, 0x8e1b1b, 0xc62828, 0xe53935, 0xef9a9a];
            for (let y = 1; y < 21; y++) { const w = y < 8 ? 5 : y < 14 ? 4 : 5; for (let x = 0; x < w; x++) set(x, y, shade(0.95 - x / 8 - ((x + 1) % 2) * 0.15, x, y, R)); for (let x = 24 - w; x < 24; x++) set(x, y, shade(0.75 - (23 - x) / 10 - (x % 2) * 0.15, x, y, R)); }
            set(4, 9, GOLD[3]); set(19, 9, GOLD[3]);
        }),
        // Qalqon va ikki qilich (devor bezagi)
        trophy: () => mk(24, 20, (set) => {
            for (let k = 0; k < 22; k++) { const x1 = 1 + k, y1 = 19 - Math.round(k * 0.85), x2 = 22 - k; set(x1, y1, k < 4 ? GOLD[2] : IRON[k % 2 ? 3 : 4]); set(x2, y1, k < 4 ? GOLD[2] : IRON[k % 2 ? 3 : 4]); }
            [[3, 16], [20, 16]].forEach(([x, y]) => { for (let k = -2; k <= 2; k++) set(x + k, y - k, GOLD[1]); });
            for (let y = 2; y < 18; y++) { const half = y < 11 ? 7 : Math.max(0, 7 - (y - 11)); for (let x = 12 - half; x < 12 + half; x++) set(x, y, (x === 11 || x === 12 || y === 7) ? GOLD[3] : shade(0.95 - (y - 2) / 22 - (x - 5) / 30, x, y, [0x0d2b6b, 0x0d47a1, 0x1565c0, 0x1e88e5])); }
            for (let x = 5; x < 19; x++) set(x, 2, GOLD[2]);
        }),
        // Qandil: zanjir, mis halqa, besh yonib turgan sham
        chandelier: () => mk(28, 18, (set) => {
            for (let y = 0; y < 6; y++) set(14, y, y % 2 ? IRON[1] : IRON[3]);
            for (let x = 12; x < 17; x++) set(x, 6, GOLD[3]);
            for (let k = 0; k < 6; k++) { set(14 - k * 2, 7 + Math.round(k * 0.7), GOLD[2]); set(13 - k * 2, 7 + Math.round(k * 0.7), GOLD[2]); set(14 + k * 2, 7 + Math.round(k * 0.7), GOLD[2]); set(15 + k * 2, 7 + Math.round(k * 0.7), GOLD[2]); }
            for (let x = 2; x < 27; x++) { set(x, 12, GOLD[1]); set(x, 13, GOLD[2]); }
            [3, 8, 14, 20, 25].forEach(x => { for (let y = 9; y < 12; y++) set(x, y, 0xfff8e1); set(x, 8, 0xffb300); set(x, 7, 0xfff59d); set(x - 1, 12, GOLD[3]); set(x + 1, 12, GOLD[3]); });
            for (let x = 12; x < 17; x++) { set(x, 14, GOLD[2]); set(x, 15, GOLD[1]); } set(14, 16, GOLD[3]); set(14, 17, 0xffe082);
        }),
        // Osma gul: arqon, to'qilgan savat, osilib tushgan pechak
        hangplant: () => mk(16, 24, (set) => {
            for (let y = 0; y < 8; y++) { set(8 - Math.round(y * 0.6), y, 0xd7ccc8); set(8 + Math.round(y * 0.6), y, 0xd7ccc8); }
            for (let y = 8; y < 13; y++) for (let x = 2 + (y - 8 > 2 ? 1 : 0); x < 14 - (y - 8 > 2 ? 1 : 0); x++) set(x, y, (x + y) % 2 ? 0xa1887f : 0x8d6e63);
            for (let x = 2; x < 14; x++) set(x, 8, 0xbcaaa4);
            const L = [0x2e7d32, 0x43a047, 0x66bb6a, 0x9ccc65];
            [3, 6, 10, 13].forEach((x0, i) => { const len = 6 + (i % 2) * 5; for (let k = 0; k < len; k++) { set(x0 + (k % 3 === 1 ? 1 : 0), 12 + k, L[k % 4]); if (k % 3 === 0) set(x0 - 1, 12 + k, L[3]); } });
            for (let x = 3; x < 13; x++) set(x, 7, L[(x % 3) + 1]); set(5, 6, L[2]); set(9, 5, L[3]); set(11, 6, L[2]);
        }),
        // Ko'k gilam: oval, oq-oltin naqsh
        rugblue: () => mk(48, 6, (set) => {
            for (let y = 0; y < 6; y++) for (let x = 0; x < 48; x++) {
                const d = Math.hypot((x - 23.5) / 24, (y - 2.5) / 3); if (d > 1) continue;
                set(x, y, d > 0.85 ? 0x0d2b6b : d > 0.72 ? 0xffd54f : (Math.abs(x - 23.5) + y * 2) % 7 < 3 ? 0x1e88e5 : 0x1565c0);
            }
            for (let x = 20; x < 28; x++) set(x, 2, 0xe1f5fe);
            set(23, 3, 0xffd54f); set(24, 3, 0xffd54f);
        })
    };
    // AJDARCHA (o'yinchi chizgan rasm asosida): yon tomondan, to'rtburchak uslub - katta och ko'k bosh, qora ko'z yorig'i
    // (ichida oq chaqnash), og'iz chizig'i, boshdan orqaga ketgan to'q ko'k shox, uzun to'q ko'k tana va dum (orqasida
    // tikanchalar, uchida nayza), orqada yotgan uch qavat uzun och ko'k qanot, ikki qora oyoq. Rasm chapga qaragan holda
    // chiziladi va oxirida ko'zgudek aylantiriladi (o'yinda hamma narsa o'ngga qaragan). Pastki qator - oyoq tagi (yerga tegadi)
    // frame: sit/blink - qo'ngan; fly0/fly1 - qanot tepada/pastda (oyoqlar yig'ilgan); eat - og'zi ochiq; scared - ko'zi katta
    // AJDARCHA SKINLARI: rang (bosh/qanot - och, tana/dum - to'q), bosh kiyimi va tana buyumi. id lar server/src/maps.ts (PET_SKINS) bilan bir xil
    const PET_PAL = {
        default: { L: [0x6fc3dc, 0x9ad8e8, 0xc4ecf5], D: [0x2a32a0, 0x3d47c9, 0x5a64e0] },
        mint: { L: [0x7fd6a8, 0xa8e8c4, 0xd4f7e3], D: [0x1e7a55, 0x2e9e6e, 0x48c08a] },
        rose: { L: [0xf2a7c3, 0xf8c8da, 0xfde6ef], D: [0xb0306a, 0xd24a86, 0xe874a4] },
        sunny: { L: [0xf7d774, 0xfbe7a1, 0xfff6d6], D: [0xc77d0a, 0xe89a1c, 0xf5b942] },
        lava: { L: [0xff8a50, 0xffb07a, 0xffd6b8], D: [0x7a1405, 0xa8230c, 0xd4381a], glow: 0xffd54f },
        frost: { L: [0xd6f3ff, 0xeefaff, 0xffffff], D: [0x3b7fb8, 0x5aa0d8, 0x86c3ef], glow: 0xffffff },
        shadow: { L: [0x5d5a70, 0x7a778f, 0x9d9ab2], D: [0x121018, 0x1f1b29, 0x302a40], eye: 0xff1744 },
        galaxy: { L: [0x8e7cc3, 0xb5a7e0, 0xdcd3f5], D: [0x1b1240, 0x2c1d63, 0x46308f], glow: 0xfff59d }
    };
    // look: "rang|bosh|tana" (masalan "rose|bow|scarf"); bo'sh - standart
    function critterGrid(frame, look) {
        const [lc, lh, lb] = String(look || '').split('|');
        const PAL = PET_PAL[lc] || PET_PAL.default;
        const W = 49, H = 23, OY = 7, g = gridNew(W, H);
        const put = (x, y, c) => { y += OY; if (y >= 0 && y < H && x >= 0 && x < W) g[y][x] = c; };
        const rect = (x0, y0, x1, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, typeof c === 'function' ? c(x, y) : c); };
        const LB = PAL.L, DB = PAL.D, INK = 0x000000, LEG = 0x14163a;
        const fly = frame === 'fly0' || frame === 'fly1' || frame === 'scared';
        // DUM va TANA (to'q ko'k): pastki uzun chiziq boshdan dum uchigacha, ustida yelka, orqada pog'onali dum
        rect(8, 12, 46, 12, (x) => x % 6 === 0 ? DB[0] : DB[1]);
        rect(14, 9, 30, 11, (x, y) => y === 9 ? DB[2] : (x + y) % 7 === 0 ? DB[0] : DB[1]);
        rect(30, 10, 41, 11, (x, y) => y === 10 ? DB[2] : DB[1]);
        rect(41, 11, 46, 11, DB[1]);
        // tikanchalar (orqa va dum ustida) va dum uchidagi nayza
        [31, 34, 37, 40].forEach(x => { put(x, 9, DB[0]); put(x + 1, 9, DB[0]); put(x, 8, DB[0]); });
        rect(47, 10, 48, 13, DB[0]); put(48, 9, DB[2]); put(48, 14, DB[2]); put(47, 11, LB[1]);
        // Rangga xos detal: lava - yorug' yoriqlar, muz - yaltirash, galaktika - yulduzchalar
        if (PAL.glow) [[18, 11], [23, 10], [27, 11], [33, 11], [38, 10], [44, 12]].forEach(([x, y], i) => { if (lc !== 'frost' || i % 2 === 0) put(x, y, PAL.glow); });
        // PLASH (tana buyumi) - qanotlar ostida, yelkadan dumga osilib turadi
        if (lb === 'cape') { for (let x = 16; x <= 32; x++) { const y0 = 8 + Math.floor((x - 16) / 5); for (let y = y0; y <= y0 + 2; y++) put(x, y, y === y0 ? 0xc62828 : (x + y) % 4 === 0 ? 0x7f0000 : 0x9a1010); } put(16, 8, 0xffca28); }
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
        // Ko'z rangi (soya rangida - qizil)
        if (PAL.eye && frame !== 'blink') { put(6, 6, PAL.eye); put(7, 7, PAL.eye); }
        // ===== BOSH KIYIMLARI (bosh: x 3..13, tepasi - 5-qator) =====
        const H2 = {
            bow: () => { [[5, 3], [5, 4], [6, 3], [6, 4], [8, 3], [8, 4], [9, 3], [9, 4]].forEach(([x, y]) => put(x, y, 0xff6f9e)); put(7, 4, 0xd81b60); put(7, 3, 0xd81b60); put(5, 3, 0xffb3cc); put(9, 3, 0xffb3cc); },
            flower: () => { put(6, 4, 0x43a047); [[5, 2], [7, 2], [6, 1], [6, 3]].forEach(([x, y]) => put(x, y, 0xffffff)); put(6, 2, 0xffb300); put(8, 3, 0xff80ab); put(9, 2, 0xff80ab); put(8, 4, 0x43a047); },
            cap: () => { rect(4, 3, 11, 4, (x, y) => y === 3 ? 0xef5350 : 0xc62828); rect(1, 4, 3, 4, 0x8e0000); put(8, 2, 0xffffff); put(7, 2, 0xc62828); put(9, 2, 0xc62828); },
            headphones: () => { rect(4, 2, 11, 2, 0x37474f); put(3, 3, 0x37474f); put(12, 3, 0x37474f); rect(2, 5, 3, 8, (x, y) => y === 5 || y === 8 ? 0x263238 : 0x00e5ff); rect(12, 5, 13, 8, (x, y) => y === 5 || y === 8 ? 0x263238 : 0x00e5ff); },
            horns: () => { [[5, 4], [5, 3], [6, 2], [6, 1], [7, 0]].forEach(([x, y]) => put(x, y, 0xfdf6e3)); [[9, 4], [10, 3], [10, 2], [11, 1], [12, 0]].forEach(([x, y]) => put(x, y, 0xd5c4a1)); put(5, 4, 0xa1887f); put(9, 4, 0xa1887f); },
            wizard: () => { for (let y = 4; y >= -3; y--) { const hw = Math.max(0, Math.round((y + 3) * 0.7)); for (let x = 8 - hw; x <= 8 + hw; x++) put(x + Math.round((4 - y) * 0.4), y, y === 4 ? 0x7e57c2 : 0x4527a0); } rect(3, 4, 13, 4, 0x5e35b1); put(9, 1, 0xffeb3b); put(7, 3, 0xfff59d); put(11, -2, 0xffeb3b); },
            crown: () => { rect(4, 3, 11, 4, (x, y) => y === 4 ? 0xc79100 : 0xffca28); [4, 7, 10].forEach(x => { put(x, 2, 0xffca28); put(x + 1, 2, 0xffca28); put(x, 1, 0xffe082); }); put(7, 3, 0xe53935); put(10, 4, 0x1e88e5); put(5, 4, 0x1e88e5); },
            helmet: () => { rect(3, 3, 13, 5, (x, y) => y === 3 ? 0xcfd8dc : y === 5 ? 0x546e7a : 0x90a4ae); rect(3, 6, 4, 8, 0x78909c); rect(8, 0, 9, 2, 0xe53935); put(10, 1, 0xff8a80); [5, 8, 11].forEach(x => put(x, 4, 0xeceff1)); }
        };
        // ===== TANA BUYUMLARI (tana: x 14..30, bo'yin - x 13..16) =====
        const B2 = {
            bell: () => { rect(15, 8, 16, 12, 0xd32f2f); rect(16, 13, 18, 14, 0xffca28); put(17, 15, 0xc79100); put(16, 13, 0xfff59d); },
            scarf: () => { rect(14, 8, 16, 12, (x, y) => (y % 2) ? 0xe53935 : 0xfafafa); rect(17, 8, 21, 8, (x) => x % 2 ? 0xe53935 : 0xfafafa); put(22, 9, 0xe53935); },
            bandana: () => { for (let y = 10; y <= 13; y++) for (let x = 14; x <= 17 - (y - 10); x++) put(x, y, (x + y) % 3 === 0 ? 0xffffff : 0x1e88e5); put(14, 9, 0x1565c0); put(16, 9, 0x1565c0); },
            saddle: () => { rect(19, 8, 25, 9, (x, y) => y === 8 ? 0xa1673e : 0x6d4c41); rect(21, 10, 22, 12, 0x4e342e); put(19, 7, 0x8d5a3a); put(25, 7, 0x8d5a3a); put(22, 9, 0xffca28); },
            cape: () => {},
            armor: () => { for (let x = 17; x <= 29; x++) for (let y = 9; y <= 12; y++) put(x, y, ((x - 17) % 4 === 0) ? 0x546e7a : y === 9 ? 0xcfd8dc : 0x90a4ae); [18, 22, 26].forEach(x => put(x, 11, 0xeceff1)); rect(14, 9, 16, 12, 0x78909c); },
            chain: () => { [[14, 10], [15, 11], [16, 12], [17, 12], [18, 11], [19, 10]].forEach(([x, y], i) => put(x, y, i % 2 ? 0xffe082 : 0xffb300)); rect(16, 13, 17, 14, 0xffca28); put(16, 13, 0xffffff); },
            jet: () => { rect(20, 5, 24, 8, (x, y) => x === 20 || y === 5 ? 0xb0bec5 : 0x607d8b); rect(21, 4, 22, 4, 0xe53935); const fl = frame === 'fly1' ? 2 : 1; rect(25, 6, 25 + fl, 7, 0xff9100); put(26 + fl, 6, 0xffea00); put(23, 6, 0x00e5ff); }
        };
        if (lb && B2[lb]) B2[lb]();
        if (lh && H2[lh]) H2[lh]();
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
        fertGrid, waterGrid, rodGrid,
        fertIcon: () => iconURL('fert', fertGrid(), 3),
        elixirGrid, chipGrid, coinGrid, flowersGrid, lanternGrid, dogGrid, paintGrid, pethouseGrid, critterGrid,
        critterIcon: (f, look) => iconURL('crit_' + f + '_' + (look || ''), critterGrid(f, look), 4),
        // noma'lum kalit (masalan, elflar istagi bilan qo'shilgan 'cards' / 'pool' bezaklari) - xato emas, bo'sh qaytadi (aks holda oyna ochilmay qolardi)
        icon: (key) => { const G = { elixir: elixirGrid, chip: chipGrid, coin: coinGrid, flowers: flowersGrid, lantern: lanternGrid, dog: () => dogGrid(0), paint: paintGrid, pethouse: pethouseGrid,
            rod: rodGrid, net: mfNetGrid, fert: fertGrid, water: waterGrid }[key]; return G ? iconURL('ic_' + key, G(), key === 'coin' ? 2 : 3) : ''; },
        waterIcon: () => iconURL('water', waterGrid(), 3),
        meadowGrid: (id) => meadowGrids[id](),
        meadowIcon: (id) => iconURL('md_' + id, meadowGrids[id](), id === 'swing' || id === 'fountain' ? 2 : 3)
    };
})();
