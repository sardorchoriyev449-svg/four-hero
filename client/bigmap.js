// ===== BOSS JON PANELI (umumiy: The World, My Farm): jang boshlanganda animatsiya bilan ochiladi -
// avval ingichka ko'k vertikal chiziq paydo bo'ladi, keyin uch bosqichda kengayadi (kichik -> o'rta -> to'liq), oxirida ichida boss nomi chiqadi.
// st - har boss uchun holat ({ id, t0, ghost }), k - jon ulushi (0..1), o.y - panel markazi (ekran), o.col - jon rangi
window.bossBarFx = function (g, txt, st, now, k, o) {
    const FW = o.w || 460, H = o.h || 18, cx = o.x || 400, cy = o.y, el = now - st.t0;
    const back = (q) => { q = Math.max(0, Math.min(1, q)); const s = 1.6; return 1 + (s + 1) * Math.pow(q - 1, 3) + s * Math.pow(q - 1, 2); };   // biroz oshib qaytadi
    const L = 320, STEPS = [[440, 640, 0.26], [840, 1040, 0.6], [1240, 1480, 1]];   // chiziq L ms; [boshlanish ms, tugash ms, kenglik ulushi] - har bosqichdan keyin qisqa to'xtash
    let w = 6, h = H + 18;
    if (el < 440) h = (H + 18) * Math.min(1, el / L);   // 1) vertikal chiziq o'sadi (va biroz turadi)
    else {
        let prev = 6;
        for (const [a, b, f] of STEPS) { if (el < a) break; const to = FW * f; w = el >= b ? to : prev + (to - prev) * back((el - a) / (b - a)); prev = to; }
        h = H + 18 * Math.max(0, 1 - (el - 440) / 160);   // chiziq panel balandligiga tushadi
    }
    w = Math.max(6, Math.round(w)); h = Math.max(2, Math.round(h));
    st.ghost = st.ghost === undefined ? k : (st.ghost > k ? Math.max(k, st.ghost - 0.006) : k);   // olingan zarar - och iz bo'lib sekin kamayadi
    const x = Math.round(cx - w / 2), y = Math.round(cy - h / 2), B = 3;
    g.clear();
    g.fillStyle(0x000000, 0.85); g.fillRect(x - B - 2, y - B - 2, w + 2 * B + 4, h + 2 * B + 4);
    g.fillStyle(0x3d4fd8, 1); g.fillRect(x - B, y - B, w + 2 * B, h + 2 * B);   // ko'k ramka
    g.fillStyle(0x8c9eff, 1); g.fillRect(x - B, y - B, w + 2 * B, 1);
    g.fillStyle(0x2a0505, 1); g.fillRect(x, y, w, h);
    if (el >= 440) {
        g.fillStyle(0xffcdd2, 1); g.fillRect(x, y, Math.round(w * st.ghost), h);
        g.fillStyle(o.col || 0xe8202a, 1); g.fillRect(x, y, Math.round(w * k), h);
        g.fillStyle(0xff8a80, 0.55); g.fillRect(x, y, Math.round(w * k), Math.max(1, Math.round(h / 5)));
    }
    const na = el < 1500 ? 0 : Math.min(1, (el - 1500) / 250);   // nom - panel to'liq ochilgach
    txt.setPosition(cx, cy).setAlpha(na).setVisible(na > 0);
};
// ===== BIG MAP (klient): juda katta tasodifiy dunyo - server/src/bigmap.ts bilan birga, rasmlar - client/bigart.js =====
// Dunyo - osmonda muallaq orollar va ular orasidagi pog'ona-toshlar. Faqat kamera atrofidagisi chiziladi va fizikasi yaratiladi:
// orollar - alohida tekstura (zinapoyasimon tosh pastki qismi bilan), toshlar / bezaklar / sandiqlar - bo'laklab (CH px).
// Bu yerda: fon (shom osmoni, bulutlar, uzoqdagi orollar), qishloq NPC lari (gaplashadi), lianalar (chayqalish),
// 30 / 60 m dan baland yiqilish o'lchovi, dushmanlar va ularning o'qlari, checkpoint bayroqlari, maxfiy sandiqlar, HUD.
window.BigMap = (function () {
    const CH = 1024;                       // bo'lak kengligi
    const FALL_HURT = 300, FALL_DEATH = 600;   // 30 m - jonning yarmi, 60 m - o'lim (server hal qiladi)
    let W = null, O = null, X = null;      // W - dunyo (serverdan), O - Phaser obyektlari, X - tashqi bog'lanish (socket, qahramon...)
    const A = () => window.BigArt;
    const t = (k) => (typeof window.t === 'function' ? window.t(k) : k);
    const FONT = '"Press Start 2P", monospace';
    // LOKATSIYA (x, y) bo'yicha: dunyo to'ri - lokatsiyalar to'rtburchaklar (Elf markazda, O'rmon o'ngda, Qor chapda, Botqoq va Yer osti pastda);
    // hech biriga tushmasa - eng yaqini
    const locObj = (x, y) => {
        if (y === undefined) y = -280;
        let best = W.locs[0], bd = Infinity;
        for (const q of W.locs) {
            const dx = x < q.x0 ? q.x0 - x : x > q.x1 ? x - q.x1 : 0, dy = y < q.y0 ? q.y0 - y : y > q.y1 ? y - q.y1 : 0, d = dx * dx + dy * dy;
            if (d === 0) return q;
            if (d < bd) { bd = d; best = q; }
        }
        return best;
    };
    const locAt = (x, y) => locObj(x, y).id;
    const dyAt = (x, y) => locObj(x, y).my + 280;   // lokatsiya o'rta qatorining birinchi qatlamdan farqi (botqoq / yer osti - pastda)
    const layerAt = (y, x) => { const r = y - locObj(x, y).my; return r < -300 ? 'sky' : r > 300 ? 'under' : 'ground'; };
    const CHY = 1200;   // bo'lak balandligi (qatlamlar ustma-ust - faqat ko'rinadigani yuklanadi)

    // ===== PIKSEL GRAFIKA =====
    // Big Map dagi barcha chizmalar o'yinning piksel uslubida: doira / ellips / uchburchak / chiziq - silliq emas, B px kvadratlardan
    // (Phaser Graphics obyektining shu usullari almashtiriladi; to'rtburchaklar o'zgarmaydi)
    const PXB = 3;
    function pixelize(g, B = PXB) {
        const fr = g.fillRect.bind(g), fs = g.fillStyle.bind(g), ls = g.lineStyle.bind(g);
        const q = (v) => Math.floor(v / B) * B;
        let fc = 0xffffff, fa = 1, lw = 1, lc = 0xffffff, la = 1;
        g.fillStyle = (c, a = 1) => { fc = c; fa = a; return fs(c, a); };
        g.lineStyle = (w, c, a = 1) => { lw = w; lc = c; la = a; return ls(w, c, a); };
        const span = (y, x0, x1) => { const a0 = q(x0), a1 = q(x1 + B - 0.01); if (a1 > a0) fr(a0, y, a1 - a0, B); };
        const ell = (cx, cy, rx, ry, inner) => {
            if (rx <= 0 || ry <= 0) return;
            for (let y = q(cy - ry); y < cy + ry; y += B) {
                const dy = (y + B / 2 - cy) / ry; if (Math.abs(dy) >= 1) continue;
                const hw = rx * Math.sqrt(1 - dy * dy);
                if (!inner) { span(y, cx - hw, cx + hw); continue; }
                const iy = (y + B / 2 - cy) / inner.ry, iw = Math.abs(iy) < 1 ? inner.rx * Math.sqrt(1 - iy * iy) : -1;
                if (iw <= 0) span(y, cx - hw, cx + hw); else { span(y, cx - hw, cx - iw - 0.01); span(y, cx + iw, cx + hw); }
            }
        };
        const stroke = (fn) => { fs(lc, la); fn(); fs(fc, fa); return g; };
        g.fillEllipse = (cx, cy, w, h) => { ell(cx, cy, w / 2, h / 2); return g; };
        g.fillCircle = (cx, cy, r) => { ell(cx, cy, r, r); return g; };
        g.strokeEllipse = (cx, cy, w, h) => stroke(() => { const t = Math.max(B, lw); ell(cx, cy, w / 2 + t / 2, h / 2 + t / 2, { rx: w / 2 - t / 2, ry: h / 2 - t / 2 }); });
        g.strokeCircle = (cx, cy, r) => g.strokeEllipse(cx, cy, r * 2, r * 2);
        g.fillTriangle = (x0, y0, x1, y1, x2, y2) => {
            const P = [[x0, y0], [x1, y1], [x2, y2]];
            for (let y = q(Math.min(y0, y1, y2)); y <= Math.max(y0, y1, y2); y += B) {
                const yc = y + B / 2; let a = Infinity, b = -Infinity;
                for (let k = 0; k < 3; k++) { const [ax, ay] = P[k], [bx, by] = P[(k + 1) % 3]; if ((yc - ay) * (yc - by) > 0 || ay === by) continue; const x = ax + (bx - ax) * (yc - ay) / (by - ay); a = Math.min(a, x); b = Math.max(b, x); }
                if (b >= a) span(y, a, b);
            }
            return g;
        };
        g.lineBetween = (x0, y0, x1, y1) => stroke(() => {
            const t = Math.max(B, q(lw + B / 2)), n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) / B));
            let px = null, py = null;
            for (let i = 0; i <= n; i++) { const x = q(x0 + (x1 - x0) * i / n - t / 2), y = q(y0 + (y1 - y0) * i / n - t / 2); if (x !== px || y !== py) fr(x, y, t, t); px = x; py = y; }
        });
        return g;
    }
    // piksel disk / halqa teksturasi (oq - rangi tint bilan): silliq nur va doiralar o'rniga
    function pxDiscKey(scene, rx, ry, ring = 0, B = PXB) {
        rx = Math.max(B, Math.round(rx / B) * B); ry = Math.max(B, Math.round(ry / B) * B);
        const key = 'bm_pxd_' + rx + '_' + ry + '_' + ring + '_' + B;
        if (!scene.textures.exists(key)) {
            const g = pixelize(scene.make.graphics({ x: 0, y: 0, add: false }), B);
            g.fillStyle(0xffffff, 1);
            if (ring) { g.lineStyle(ring, 0xffffff, 1); g.strokeEllipse(rx + ring, ry + ring, rx * 2, ry * 2); }
            else g.fillEllipse(rx, ry, rx * 2, ry * 2);
            g.generateTexture(key, rx * 2 + ring * 2 + B, ry * 2 + ring * 2 + B); g.destroy();
        }
        return key;
    }
    const pxDisc = (scene, x, y, rx, ry, col, a = 1, ring = 0) => scene.add.image(x, y, pxDiscKey(scene, rx, ry, ring)).setTint(col).setAlpha(a);

    // ===== YARATISH =====
    function create(scene, world, ext) {
        destroy();
        W = world; X = ext;
        O = { scene, chunks: new Map(), chunkQ: new Set(), isleQ: new Set(), stUse: new Map(), bodies: new Map(), plCount: new Map(), isles: new Map(), npcs: new Map(), enemies: new Map(), shots: new Map(),
            chests: new Map(), cps: [], got: new Set(world.got || []), secrets: [], pshots: new Map(), mySnow: 0, vine: null, vineCd: 0, fall: { y: null, air: false }, locShown: '', opened: new Set(), handlers: [] };
        const cam = scene.cameras.main;
        scene.physics.world.setBounds(0, W.top, W.width, W.bottom - W.top);
        scene.physics.world.setBoundsCollision(true, true, true, false);
        cam.setBounds(0, W.top, W.width, W.bottom - W.top);
        A().buildSprites(scene);
        loadBossImages(scene);   // rasm fayllaridan bosslar (bahaybat daraxt) - yuklanguncha chizilgani ko'rinadi
        // GORILA ROCK grotosi (S1 map-8): pog'onalari - S1 dagi tosh plitalar
        O.gslab = new Map(); (W.zones || []).forEach(z => { if (z.boss === 'gorilla' && z.gp) z.gp.forEach(i => { if (W.plats[i]) O.gslab.set(i, Math.round(W.plats[i].w / 4) * 4); }); });
        if (X.seasonArt) X.seasonArt(scene, [...new Set(O.gslab.values())]);   // season raqiblari (game.js dagi asl rasmlar)
        A().buildBackground(scene);
        // FIZIKA uchun hamma qattiq jismlar: platformalar (ingichkalari - bir tomonlama) va orollarning pastki qismi
        O.solids = W.plats.map(p => ({ x: p.x, y: p.y, w: p.w, h: p.h, ow: p.h <= 22 || p.k === 'tv' }));   // televizor - faqat ustida turiladi
        W.isles.forEach(I => I.r.forEach(q => { if (!q[4]) O.solids.push({ x: q[0], y: q[1], w: q[2], h: q[3], ow: false }); }));
        // YOPIQ LOKATSIYA TO'SIQLARI (zinapoya-yo'l uchida): baland ko'rinmas devor + taxta to'siq va "Tez kunda" yozuvi
        (W.gates || []).forEach(gt => { O.solids.push({ x: gt.x - 12, y: gt.y - 760, w: 24, h: 820, ow: false }); drawGate(scene, gt); });
        // soxta pollar - o'z orolining rasmiga (yoriq chizig'i uchun)
        W.isles.forEach(I => { I.fakes = W.fakes.filter(f => f.y === I.y && f.x >= I.x && f.x < I.x + I.w); });
        // FON: ekranga yopishgan osmon (rang lokatsiya va balandlikka qarab), yulduzlar, bulutlar, uzoqdagi orollar (parallaks)
        O.sky = pixelize(scene.add.graphics()).setScrollFactor(0).setDepth(-20);
        O.skyKey = '';
        O.stars = scene.add.tileSprite(0, 0, 800, 240, 'bm_stars').setOrigin(0, 0).setScrollFactor(0).setDepth(-19.5);
        O.clouds = scene.add.tileSprite(0, 120, 800, 160, 'bm_clouds').setOrigin(0, 0).setScrollFactor(0).setDepth(-19).setAlpha(0.85);
        O.far = {};
        W.locs.forEach((l) => {
            if (O.far[l.id]) return;
            O.far[l.id] = [scene.add.tileSprite(0, 260, 800, 320, 'bm_bgfar_' + l.id).setOrigin(0, 0).setScrollFactor(0).setDepth(-18.5),
                scene.add.tileSprite(0, 320, 800, 320, 'bm_bgnear_' + l.id).setOrigin(0, 0).setScrollFactor(0).setDepth(-18)];
        });
        O.dark = scene.add.rectangle(0, 0, 800, 600, 0x05030a, 1).setOrigin(0, 0).setScrollFactor(0).setDepth(4.6).setAlpha(0);
        // QOR BAZASI: qutb shafag'i, yog'ayotgan qor (bo'ronda - kuchli va qiyshiq), bo'ron oqimi
        O.aurora = scene.add.tileSprite(0, -20, 800, 200, 'bm_aurora').setOrigin(0, 0).setScrollFactor(0).setDepth(-19.2).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
        O.flakes = Array.from({ length: 110 }, (_, i) => scene.add.rectangle(Math.random() * 800, Math.random() * 600, i % 3 ? 3 : 4, i % 3 ? 3 : 4, 0xffffff, 0.85).setScrollFactor(0).setDepth(4.7).setVisible(false));
        O.blizzard = { on: false, next: scene.time.now + 25000 + Math.random() * 20000, until: 0, wind: 0 };
        O.white = scene.add.rectangle(0, 0, 800, 600, 0xe8f4ff, 1).setOrigin(0, 0).setScrollFactor(0).setDepth(4.68).setAlpha(0);
        O.snowHud = { img: scene.add.image(26, 128, 'bm_i_snow').setScrollFactor(0).setDepth(1001).setScale(0.8).setVisible(false).setInteractive(),
            txt: scene.add.text(42, 122, '', { fontFamily: FONT, fontSize: '8px', color: '#ffffff', stroke: '#000', strokeThickness: 3 }).setScrollFactor(0).setDepth(1002).setVisible(false) };
        O.snowHud.img.on('pointerdown', (p, lx, ly, ev) => { if (ev) ev.stopPropagation(); throwSnow(); });   // telefon: ikonkaga bosib otish
        O.keyF = scene.input.keyboard.addKey('F');
        O.chillUntil = 0; O.prevVx = 0;
        O.lights = pixelize(scene.add.graphics(), 6).setDepth(4.65).setBlendMode(Phaser.BlendModes.ADD);
        // YER OSTI OLAMI: ekranni qoplaydigan zulmat - yorug'lik manbalari atrofi "o'chiriladi" (qahramon, lava, mash'ala, chiroq...)
        if (!scene.textures.exists('bm_lt')) {
            // piksel yorug'lik: 4 px kataklar, zinapoyasimon halqalar (chetida - shaxmat tartibida aralashadi)
            const ct = scene.textures.createCanvas('bm_lt', 256, 256), c = ct.getContext(), P = 4, BAY = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
            const STEP = [[0.45, 1], [0.62, 0.8], [0.78, 0.55], [0.9, 0.3], [1, 0.12]];
            for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
                const d = Math.hypot(x + 0.5 - 32, y + 0.5 - 32) / 32 + (BAY[y % 4][x % 4] / 16 - 0.5) * 0.05;
                const st = STEP.find(q => d < q[0]); if (!st) continue;
                c.fillStyle = 'rgba(255,255,255,' + st[1] + ')'; c.fillRect(x * P, y * P, P, P);
            }
            ct.refresh();
        }
        O.night = scene.add.renderTexture(0, 0, 800, 600).setOrigin(0, 0).setScrollFactor(0).setDepth(4.62).setVisible(false);
        O.lightImg = scene.make.image({ x: 0, y: 0, key: 'bm_lt', add: false }).setOrigin(0.5);
        O.nightA = 0; O.flares = []; O.pools = new Set();
        O.ceil = scene.add.tileSprite(0, 0, 800, 160, 'bm_ceil_lava').setOrigin(0, 0).setScrollFactor(0).setDepth(-18.8).setVisible(false);
        O.sea = scene.add.tileSprite(0, 0, 800, 200, 'bm_lavasea').setOrigin(0, 0).setScrollFactor(0).setDepth(-1.3).setVisible(false);
        O.seaTop = scene.add.rectangle(0, 0, 800, 4, 0xffc35a, 1).setOrigin(0, 0).setScrollFactor(0).setDepth(-1.29).setVisible(false);   // lava yuzasi - yorqin chiziq
        O.fog = [scene.add.tileSprite(0, 160, 800, 200, 'bm_fog').setOrigin(0, 0).setScrollFactor(0).setDepth(4.5).setAlpha(0),
            scene.add.tileSprite(0, 330, 800, 200, 'bm_fog').setOrigin(0, 0).setScrollFactor(0).setDepth(4.52).setAlpha(0)];
        O.waters = new Set();
        O.seaGlow = scene.add.rectangle(0, 0, 800, 120, 0xff5a1a, 0.1).setOrigin(0, 0).setScrollFactor(0).setDepth(-1.31).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
        // doimiy yorug'lik manbalari (bezaklar, lava ko'llari, favvoralar, checkpointlar, do'konlar) - faqat yer osti lokatsiyasida kerak
        const inLava = (x, y) => locAt(x, y) === 'lava';
        O.glowSrc = [];
        W.props.forEach(p => { if (GLOW_PROPS[p.k] && inLava(p.x, p.y)) O.glowSrc.push({ x: p.x, y: p.y - GLOW_PROPS[p.k], r: p.k === 'lavapillar' || p.k === 'forge' || p.k === 'campfire' ? 150 : 110 }); });
        (W.lavas || []).forEach(l => { for (let x = l.x + 20; x < l.x + l.w; x += 45) O.glowSrc.push({ x, y: l.y - 14, r: 95 }); });
        (W.vents || []).forEach(v => O.glowSrc.push({ x: v.x, y: v.y - 8, r: 60 }));
        W.cps.forEach(c => { if (inLava(c.x, c.y)) O.glowSrc.push({ x: c.x, y: c.y - 40, r: 80 }); });
        (W.shops || []).forEach(s => { if (inLava(s.x, s.y)) O.glowSrc.push({ x: s.x, y: s.y - 60, r: 170 }); });
        // yer osti ko'li (suvi nur sochadi) va razvedkachilar zulmatda ham ko'rinadi
        (W.ponds || []).forEach(l => { if (inLava(l.x, l.y)) for (let x = l.x + 30; x < l.x + l.w; x += 70) O.glowSrc.push({ x, y: l.y - 10, r: 90 }); });
        W.npcs.forEach(n => { if (n.rq && inLava(n.x, n.y)) O.glowSrc.push({ x: n.x, y: n.y - 30, r: 90 }); });
        // CHECKPOINT bayroqlari
        W.cps.forEach((c, i) => {
            const pole = scene.add.image(c.x, c.y + 1, O.got.has(i) ? 'bm_cp1' : 'bm_cp0').setOrigin(0.5, 1).setDepth(-0.3);
            O.cps.push(pole);
        });
        // HUD
        O.hudLoc = scene.add.text(400, 92, '', { fontFamily: FONT, fontSize: '18px', color: '#ffe082', stroke: '#000', strokeThickness: 6, align: 'center' }).setOrigin(0.5).setScrollFactor(0).setDepth(1001).setAlpha(0);
        O.hudDist = scene.add.text(455, 20, '', { fontFamily: FONT, fontSize: '8px', color: '#ffffff', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5).setScrollFactor(0).setDepth(1001);
        O.hudBar = pixelize(scene.add.graphics()).setScrollFactor(0).setDepth(1000);
        O.bossBar = pixelize(scene.add.graphics()).setScrollFactor(0).setDepth(1000).setVisible(false);
        O.bossName = scene.add.text(400, 548, '', { fontFamily: FONT, fontSize: '9px', color: '#ffffff', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setScrollFactor(0).setDepth(1001).setVisible(false);
        O.toast = scene.add.text(400, 130, '', { fontFamily: FONT, fontSize: '11px', color: '#b9f6ca', stroke: '#000', strokeThickness: 5, align: 'center' }).setOrigin(0.5).setScrollFactor(0).setDepth(1001).setAlpha(0);
        O.hint = scene.add.text(0, 0, '[E]', { fontFamily: FONT, fontSize: '9px', color: '#ffeb3b', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5).setDepth(6).setVisible(false);
        O.shotG = pixelize(scene.add.graphics()).setDepth(4.2);
        // BOSS MAYDONI DEVORLARI (S1/S2 dagidek - jang boshlansa ichkaridagilar chiqa olmaydi) va kraken cho'kishi
        O.arenas = []; O.locked = null; O.sinks = [];
        // PORTALLAR: har lokatsiya boshida - ochilgan lokatsiyalar orasida teleport
        buildPortals(scene);
        // XARITA: HUD tugmasi (M), nishon va yo'l ko'rsatkich
        buildMapHud(scene);
        // TOPSHIRIQLAR: chapda kuzatuv paneli, NPC ustida "!" / "?"; qafaslar
        O.qTxt = scene.add.text(16, 150, '', { fontFamily: FONT, fontSize: '7px', color: '#fff59d', stroke: '#000', strokeThickness: 3, lineSpacing: 4 }).setScrollFactor(0).setDepth(1002).setVisible(false);
        O.propGlows = []; O.platImg = new Map(); O.crush = new Map();
        O.qMarkG = pixelize(scene.add.graphics()).setDepth(3.6); O.qMarks = new Map(); O.cageImgs = []; O.held = null; O.talkZone = null;
        O.buffHud = ['battery', 'armor', 'strength', 'feather', 'phoenix'].map((k, i) => ({ k,
            img: scene.add.image(28 + i * 46, 98, 'bm_i_' + k).setScrollFactor(0).setDepth(1001).setScale(0.55).setVisible(false),
            txt: scene.add.text(42 + i * 46, 108, '', { fontFamily: FONT, fontSize: '7px', color: '#ffffff', stroke: '#000', strokeThickness: 3 }).setScrollFactor(0).setDepth(1002).setVisible(false) }));
        O.vineG = pixelize(scene.add.graphics()).setDepth(-0.2);
        // BOSS HUJUMLARI: yerdagi ogohlantirishlar (pastda), nur / nafas / bulut / dog'lar (qahramon ustida), boss holatlari
        O.areaLo = pixelize(scene.add.graphics()).setDepth(2.55); O.areaHi = pixelize(scene.add.graphics()).setDepth(3.3); O.fxG = pixelize(scene.add.graphics()).setDepth(2.75);
        O.areaMap = new Map(); O.rootUntil = 0; O.blindUntil = 0; O.pull = null;
        if (!scene.textures.exists('bm_ink')) {
            const ct = scene.textures.createCanvas('bm_ink', 800, 600), c = ct.getContext();
            for (let i = 0; i < 9; i++) { const x = A().hash(i, 1, 7) * 800, y = A().hash(i, 2, 7) * 600, r = 90 + A().hash(i, 3, 7) * 140; c.fillStyle = 'rgba(14,10,28,0.92)'; c.beginPath(); for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2, rr = r * (0.7 + 0.3 * A().hash(i, k, 9)); c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.fill(); }
            ct.refresh();
        }
        O.ink = scene.add.image(0, 0, 'bm_ink').setOrigin(0, 0).setScrollFactor(0).setDepth(4.95).setAlpha(0);
        O.cue = scene.add.text(400, 530, '', { fontFamily: FONT, fontSize: '11px', color: '#ffd180', stroke: '#000', strokeThickness: 5 }).setOrigin(0.5).setScrollFactor(0).setDepth(1001).setAlpha(0);
        // server hodisalari
        const on = (ev, fn) => { X.socket.on(ev, fn); O.handlers.push([ev, fn]); };
        on('bigAmbush', (d) => { if (!d) return; d.pts.forEach(([x, y]) => puff(x, y - 20, 0x6d4c41, 10)); X.sfxAt('roar', d.pts[0] ? d.pts[0][0] : 0, 0.4); });
        on('bigBoss', (d) => { if (!d) return; X.sfx('bossStart'); scene.cameras.main.shake(500, 0.008); banner(t(d.secret ? 'big_secret_boss' : 'big_boss_in') + '\n' + t('big_e_' + d.k), d.secret ? '#ea80fc' : '#ff8a80'); });
        on('bigKill', (d) => {
            if (!d) return;
            puff(d.x, d.y - 20, d.fade ? 0x9575cd : d.boss ? 0xffeb3b : 0xbdbdbd, d.boss ? 40 : 12); X.sfxAt(d.boss ? 'bossDown' : 'botDie', d.x, 0.8);
            // KRAKEN yengildi: S2 dagidek butun tanasi bilan suv ostiga cho'kib ketadi
            const o = O.enemies.get(d.id);
            if (o && o.kr) { O.sinks.push({ kr: o.kr, x: o.x, ey: o.y - 40, surf: o.surf, at: scene.time.now }); o.kr = null; o.extra = []; }
            // ROBOT ILON portladi: bo'g'inlari bo'ylab ketma-ket portlashlar
            // MR. WHO: hologramma piksellarga sochilib yo'qoladi
            if (d.k === 'mrwho' && TEX.mrwho) { const im = scene.add.image(d.x, d.y + 1 - 10, A().enemyKey(TEX.mrwho, 5)).setOrigin(0.5, 1).setDepth(2.6).setFlipX(!!(o && o.f < 0)).setAlpha(0.85);
                scene.tweens.add({ targets: im, alpha: 0, y: im.y - 40, duration: 1400, onComplete: () => im.destroy() }); }
            if (d.k === 'rsnake') { const dir = o && o.f < 0 ? -1 : 1; for (let k = 0; k < 10; k++) scene.time.delayedCall(k * 140, () => { if (!O) return; const x = d.x - dir * k * 70; puff(x, d.y - 80, 0xff7a1a, 16); puff(x, d.y - 80, 0x78909c, 10); X.sfxAt('boom', x, 0.7); scene.cameras.main.shake(160, 0.01); }); }
        });
        on('bigQuest', (d) => { if (d) onQuest(scene, d); });
        // LAGER TOPSHIRIQLARI: buyum rasmlari, topshiriq holati serverdan
        rqTextures(scene); fruitTextures(scene); O.fruits = new Map(); O.fruitOff = new Set(); O.rq = null; O.rqImgs = new Map(); O.fish = null; O.reel = null; O.fishG = scene.add.graphics().setDepth(3.5);
        on('bigRQ', (d) => { if (d) onRq(scene, d); });
        // KATTA O'RMON: meva yeyildi / terildi (hamma ko'radi); Yer osti: qizil tosh olindi
        on('bigFruit', (d) => {
            if (!d) return;
            if (d.err) { showToast(t(d.err)); return; }
            O.fruitOff.add(d.id); const f = O.fruits.get(d.id); if (f) f.berries.forEach(b => b.setVisible(false));
            puff(d.x, d.y - (d.k === 'redstone' ? 16 : 36), d.k === 'apple' ? 0xffd54f : d.k === 'redstone' ? 0xff3d3d : 0xba68c8, 12);
            if (d.by === X.socket.id) { X.sfx('coin', 0.6); if (d.ev === 'stone') showToast(t('big_stone_got').replace('{c}', d.c)); if (d.ev === 'eat') { showToast(t('big_fruit_eat_' + d.k)); const h = X.hero(); if (h) puff(h.x, h.y - 30, 0x81c784, 16, true); } }
        });
        // THE WORLD DO'KONI: qarmoq (sotuv natijasi Shop'dagidek keladi)
        O.rodResult = (d) => {   // tinglovchi bosilganda qo'yiladi (game.js shopResult tinglovchisini qayta o'rnatadi)
            const el = document.getElementById('shop-panel');
            if (!d || !['rod', 'elixir', 'chip'].includes(d.item) || !el || !el.classList.contains('bm-shop-panel')) return;
            const b = d.item === 'rod' ? el.querySelector('.shop-rod-buy') : null, msg = el.querySelector('#bm-shop-msg');
            if (d.success) { if (b) { b.disabled = true; b.textContent = t('shop_owned'); } if (msg) msg.textContent = ''; renderShopWallet(d.coins); const h = X.hero(); if (h) puff(h.x, h.y - 30, 0xffd54f, 14); }
            else { if (msg) msg.textContent = t(d.message || 'err_server'); if (b) { b.disabled = d.message === 'shop_not_needed'; if (d.message === 'shop_not_needed') b.textContent = t('shop_owned'); } }
        };
        on('bigFish', (d) => { if (d) onFish(scene, d); });
        X.socket.emit('bigAct', { roomId: X.roomId(), act: 'rqsync', arg: 0 });
        on('bigTalk', (d) => { if (d) onTalk(scene, d); });
        on('bigTalkEnd', (d) => { if (d && O.talkZone === d.zone && X.dialogOpen && X.dialogOpen() && X.closeDialog) { X.closeDialog(); O.talkZone = null; } });
        // SAMBOCHI USHLADI (ms - suplex davomiyligi); ms 0 - yerga urdi, qo'yib yubordi
        on('bigCrush', (d) => { if (!d || !W.plats[d.i]) return; const c = O.crush.get(d.i) || {}; if (d.st === 'idle') { O.crush.set(d.i, { st: 'idle', at: scene.time.now, ride: c.ride, sy0: c.sy0 }); return; } O.crush.set(d.i, { st: d.st, at: scene.time.now, ms: d.ms, v: d.v, ceil: d.ceil !== undefined ? d.ceil : c.ceil, y: c.y !== undefined ? c.y : W.plats[d.i].y, ride: c.ride, sy0: c.sy0 }); if (d.st === 'launch') X.sfx('rumble', 0.8); });
        on('bigHeld', (d) => {
            if (!d) return;
            if (!d.ms) { releaseHeld(); X.sfx('thud', 1); scene.cameras.main.shake(260, 0.014); return; }
            const h = X.hero(), e = O.enemies.get(d.id);
            O.held = { id: d.id, t0: scene.time.now, ms: d.ms, until: scene.time.now + d.ms + 400, face: h && e ? h.x < e.x : true }; X.sfx('thud', 0.6);   // qarash tomoni - sambochiga qarab, suplex oxirigacha qotadi
        });
        on('bigCageOpen', (d) => { if (d) { puff(d.x, d.y - 40, 0xffd54f, 20); X.sfx('coin'); } });
        on('bigPortalFx', (d) => {
            if (!d) return;
            puff(d.x0, d.y0 - 70, 0xb388ff, 24); puff(d.x1, d.y1 - 70, 0xb388ff, 30, d.id === X.socket.id); X.sfxAt('whoosh', d.x1, 0.9);
            if (d.id === X.socket.id) { const p = (W.portals || []).find(q => q.x === d.x1); showToast(t('big_portal_done').replace('{l}', p ? t('big_loc_' + p.loc) : '')); scene.cameras.main.flash(300, 180, 140, 255); }
        });
        // BALOT MAGI: simpatiya o'zgardi (suhbatdan keyin)
        on('bigMage', (d) => {
            if (!d) return;
            if (d.err) { showToast(t(d.err).replace('{s}', d.sym || 0).replace('{f}', d.f || 0)); if (d.err === 'mg_no_item' && window.HeldItem) HeldItem.set(null); return; }
            const was = pmSym(), wasReady = mageReady(); O.mageSym = d.sym; if (d.f !== undefined) O.mageF = d.f;
            if (d.home) {   // FERMAGA KO'CHDI
                O.mageHome = true; const pm = O.pm;
                if (pm) { puff(pm.x, (pm.img.y || 0) - 80, 0xff6fb0, 30); if (window.MageTalk) MageTalk.FX.hearts(O.scene, pm.x, pm.img.y - 140, 10, 3); }
                showToast(t('mg_moved')); X.sfx('win', 0.6); return;
            }
            if (d.gift) {   // SOVG'A: quvonadi, sovg'ani qo'lida ko'taradi
                if (window.HeldItem) HeldItem.used(d.left);
                if (O.pm && window.MageTalk) { MageTalk.FX.gift(O.pm, d.gift, O.scene.time.now); X.sfx('pop', 0.7); }
                if (window.MageTalk) showToast(t('big_e_swampmage') + ': "' + MageTalk.giftLine(d.gift) + '" (' + mageProg() + ')');
                if (mageReady() && !wasReady) setTimeout(() => { if (O) showToast(t('big_mage_ready')); }, 2600);
                return;
            }
            puff(X.hero() ? X.hero().x : 0, X.hero() ? X.hero().y - 30 : 0, 0xff6fb0, 8);
            if (mageReady() && !wasReady) { showToast(t('big_mage_ready')); return; }
            showToast(t(was < PM.SWING && d.sym >= PM.SWING ? 'big_mage_swing_on' : was < PM.HUG && d.sym >= PM.HUG ? 'big_mage_hug_on' : 'big_mage_sym').replace('{n}', d.sym) + ' (' + mageProg() + ')');
        });
        on('bigBossDown', (d) => {
            if (!d) return;
            // BALOT MAGI yengildi - jang o'rniga suhbat (maydon yaqinidagilarga)
            const mz = d.k === 'swampmage' && (W.zones || []).find(q => q.boss === 'swampmage'), h = X.hero();
            if (mz && h && h.x > mz.x0 - 300 && h.x < mz.x1 + 300 && Math.abs(h.y - (mz.y1 - 60)) < 600) scene.time.delayedCall(900, () => { if (O) X.dialog([{ who: 'elf', text: t('mg_win1') }, { who: 'elf', text: t('mg_win2') }, { who: 'elf', text: t('mg_win3') }], null, mageOpts()); });
        });
        on('bigBossDown', (d) => { if (!d) return; O.gifts = {}; banner(t('big_boss_down').replace('{c}', d.coins), '#ffe082'); scene.cameras.main.flash(400, 255, 240, 200); });
        on('bigCp', (d) => { if (!d) return; O.got.add(d.i); if (O.cps[d.i]) O.cps[d.i].setTexture('bm_cp1'); X.sfx('win'); showToast(t('big_cp')); puff(d.x, d.y - 60, 0x69f0ae, 20); });
        // boshqa o'yinchi tirilsa - uning joyidagi bo'laklar qurilmaydi (avval uzoqdagi do'st o'lsa, ikki joy orasidagi BUTUN dunyo
        // bir kadrda qurilib, hammada "qotish" bo'lardi). O'zimiz tirilsak - 'teleport' allaqachon yangi joyni quradi
        on('bigRespawn', (d) => { if (!d) return; if (d.id === X.socket.id) { stream(true, d.x, d.y); O.fall.y = null; O.vine = null; O.locked = null; clearStatus(); } puff(d.x, d.y, 0x80d8ff, 16, d.id === X.socket.id); });
        on('bigChest', (d) => { if (!d) return; O.opened.add(d.id); const c = O.chests.get(d.id); if (c) { c.setTexture('bm_chest1'); puff(c.x, c.y - 20, 0xffd54f, 20); } if (d.by === X.socket.id) showToast(t('big_chest_got').replace('{c}', d.coins)); X.sfx('coin'); });
        // portlash (bomba, fugu, raketa, to'p, olov shar) / suvga tushish
        on('bigBlast', (d) => {
            if (!d) return;
            // ekrandan uzoqdagi portlash (boshqa o'yinchi dunyoning narigi chetida) - ko'rinmaydi: effekt va silkinish shart emas
            { const mp = scene.cameras.main.midPoint; if (Math.abs(d.x - mp.x) > 1400 || Math.abs(d.y - mp.y) > 1100) return; }
            if (d.k === 'splash') { puff(d.x, d.y, 0x80deea, 14); X.sfxAt('splash', d.x, 0.4); return; }
            const col = d.k === 'fugu' ? 0xfff176 : d.k === 'gift' ? 0xff5252 : d.k === 'bigsnow' ? 0xe1f5fe : d.k === 'iceboulder' ? 0xb3e5fc : d.k === 'fire' ? 0xff7a1a : 0xffab40, r = d.r || 60;
            const g = pxDisc(scene, d.x, d.y, r, r, col, 0.55).setDepth(3.4).setBlendMode(Phaser.BlendModes.ADD).setScale(0.3);
            scene.tweens.add({ targets: g, scale: 1, alpha: 0, duration: 320, onComplete: () => g.destroy() });
            puff(d.x, d.y, col, 18); puff(d.x, d.y, 0x5d4037, 8); scene.cameras.main.shake(140, 0.006); X.sfxAt('boom', d.x, 0.8);
            if (O.flares) O.flares.push({ x: d.x, y: d.y, r: r * 2.2, until: scene.time.now + 300 });
        });
        // ROBOT BIGFUT: o'yinchi uning oldida bo'lsa - orqasiga (chapiga) o'tolmaydi; orqada tirilgan (chap checkpoint) - oldinga chiqib keta oladi
        O.bfFront = false;
        on('bigBlock', (d) => {
            if (!d) return; puff(d.x, d.y, 0x80d8ff, 6); X.sfxAt('block', d.x, 0.6);
            // qalqon to'sdi: o'yinchi ko'rsin - o'q "tegmay ketdi" deb o'ylamasin
            if (d.k !== 'hockey') { const bt = scene.add.text(d.x, d.y - 8, t('big_blocked'), { fontFamily: FONT, fontSize: '8px', color: '#80d8ff', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setDepth(5); scene.tweens.add({ targets: bt, y: d.y - 34, alpha: 0, duration: 550, onComplete: () => bt.destroy() }); }
            if (d.k === 'hockey' && scene.time.now > (O.hkToast || 0)) { O.hkToast = scene.time.now + 5000; showToast(t('big_hk_goal')); }   // klyushka qaytardi - darvozaga otish kerak
        });
        // ALTER QOR BOBO: kimdir archa oldida sovg'asini oldi (hamma olsa - jang)
        on('bigGift', (d) => {
            if (!d) return;
            puff(d.x, d.y - 20, 0xff5252, 8); puff(d.x, d.y - 20, 0xffd54f, 8); X.sfxAt('coin', d.x, 0.7);
            if (d.id === X.socket.id) (O.gifts || (O.gifts = {}))[d.z] = true;
            showToast(t(d.n < d.need ? 'big_gift_wait' : 'big_gift_go').replace('{n}', d.n).replace('{m}', d.need));
        });
        on('bigRoot', (d) => { if (!d) return; O.rootUntil = scene.time.now + (d.ms || 1000); X.sfx('thud', 0.5); });
        on('bigBlind', (d) => { if (!d) return; O.blindUntil = scene.time.now + (d.ms || 2500); showToast(t('big_blind')); });
        // ms: 0 - tortish TO'XTADI (boss o'ldi / maydon tiklandi); avval 0 "yo'q" deb 1500 ms olinib, qahramon x=0 tomonga sudralib ketardi
        on('bigPull', (d) => { if (!d) return; if (d.ms === 0) { O.pull = null; return; } O.pull = { x: d.x, until: scene.time.now + (d.ms || 1500), s: d.s || 180 }; });
        on('bigBossMove', (d) => {
            if (!d) return;
            // muhim hujumlar - nomi ekranda (boss chizig'i ustida)
            const cue = d.m && t('big_mv_' + String(d.m).replace(':', '_'));
            if (cue && cue.indexOf('big_mv_') !== 0) { O.cue.setText(cue).setAlpha(1); scene.tweens.killTweensOf(O.cue); scene.tweens.add({ targets: O.cue, alpha: 0, delay: 1300, duration: 500 }); }
            if (d.m === 'blinkout') puff(d.x, d.y - 40, d.k === 'icequeen' ? 0xb3e5fc : 0x7c4dff, 16);
            else if (d.m === 'burrow') { puff(d.x, d.y - 6, 0x6d4c41, 18); X.sfxAt('rumble', d.x, 0.8); }
            else if (d.m === 'emerge') { puff(d.x, d.y - 20, 0x8d6e63, 26); scene.cameras.main.shake(220, 0.01); X.sfxAt('roar', d.x, 0.9); }
            else if (d.m === 'climb') X.sfxAt('whoosh', d.x, 0.6);
            else if (d.m === 'dig') { puff(d.x, d.y - 4, 0x6d4c41, 14); X.sfxAt('rumble', d.x, 0.5); }   // ferma zombisi yer ostidan o'yinchi yonida chiqmoqda
            else if (d.m === 'lzhide') puff(d.x, d.y - 10, 0x6aa83a, 8);                                 // kaltakesak rangini o'zgartirdi
            else if (d.m === 'stampwarn') { puff(d.x, d.y - 4, 0xbcaaa4, 16); X.sfxAt('rumble', d.x, 1); }
            else if (d.m === 'dizzy') X.sfxAt('thud', d.x, 0.9);
            else if (d.m === 'rise') puff(d.x, d.y - 10, 0xd8d0bc, 16);
            else if (d.m === 'sleigh' || d.m === 'sarrive') sleighFly(scene, d);
            else if (d.m === 'goal') { banner(t('big_mv_goal'), '#ff5252'); puff(d.gx, d.gy - 30, 0xffffff, 18); scene.cameras.main.shake(300, 0.012); X.sfxAt('boom', d.gx, 0.7); }
            else if (d.m === 'bfrise') { scene.cameras.main.shake(1800, 0.008); X.sfxAt('roar', d.sx, 1); X.sfx('bossStart'); for (let k = 0; k < 6; k++) scene.time.delayedCall(k * 260, () => { if (O) puff(d.sx + Phaser.Math.Between(-170, 170), d.sy - 4, 0xffffff, 12); }); }
            else if (d.m === 'ramleap') X.sfxAt('whoosh', d.x, 0.7);
            else if (d.m === 'mwstart') { X.sfxAt('laser', d.x, 0.7); if (X.hero() && Math.abs(X.hero().x - d.x) < 1600) showToast(t('big_mw_tip')); }   // MR. WHO
            else if (d.m === 'mwpress') { X.sfxAt('pop', d.x, 0.7); puff(d.x, d.y + 40, 0x7ee8ff, 6); }
            else if (d.m === 'mwheart' || d.m === 'mwblink') { puff(d.x, d.y + (d.m === 'mwheart' ? 48 : -60), d.m === 'mwheart' ? 0xff4f7a : 0x7ee8ff, 10); X.sfxAt('whoosh', d.x, 0.5); }
            else if (d.m === 'mwaim') puff(d.x, d.y, 0xff3d3d, 4);
            else if (d.m === 'mwhit') puff(d.x, d.y, 0xff4f7a, 8);
            else if (d.m === 'botwarp') { puff(d.x, d.y - 48, 0x40e0ff, 12); X.sfxAt('whoosh', d.x, 0.5); }   // Skyland boti: yiqildi - uyiga qaytdi
            else if (d.m === 'botjump') puff(d.x, d.y - 4, 0xb0bec5, 5);
            else if (d.m === 'mhstart') { X.sfxAt('roar', d.x, 0.8); if (X.hero() && Math.abs(X.hero().x - d.x) < 1500) showToast(t('big_mh_tip')); }
            else if (d.m === 'mhdig' || d.m === 'mhup') { puff(d.x, d.y - 6, 0x6d4c41, 16); puff(d.x, d.y - 6, 0x8d6e63, 10); X.sfxAt('thud', d.x, 0.8); scene.cameras.main.shake(180, 0.008); }
            else if (d.m === 'mhpop') { puff(d.x, d.y - 10, 0x6d4c41, 22); puff(d.x, d.y - 30, 0xff7a1a, 8); X.sfxAt('boom', d.x, 0.9); scene.cameras.main.shake(260, 0.014); }
            else if (d.m === 'mhdrill') { puff(d.dx, d.dy - 6, 0x6d4c41, 12); X.sfxAt('whoosh', d.dx, 0.7); }
            else if (d.m === 'fhstart') { X.sfxAt('roar', d.x, 1); if (X.hero() && Math.abs(X.hero().x - d.x) < 1500) showToast(t('big_fh_tip')); }
            else if (d.m === 'fhstomp') { puff(d.x - 40, d.y - 6, 0xff7a1a, 16); puff(d.x + 40, d.y - 6, 0xff7a1a, 16); scene.cameras.main.shake(220, 0.012); X.sfxAt('boom', d.x, 0.9); }
            else if (d.m === 'fhcharge') { X.sfxAt('whoosh', d.x, 1); X.sfxAt('roar', d.x, 0.6); }
            else if (d.m === 'fhkick') { puff(d.x, d.y - 40, 0xffd23f, 12); X.sfxAt('thud', d.x, 1); scene.cameras.main.shake(160, 0.01); }
            else if (d.m === 'fhstop') { puff(d.x, d.y - 6, 0x6e6270, 14); X.sfxAt('thud', d.x, 0.7); }
            else if (d.m === 'bkrise') { scene.cameras.main.shake(1600, 0.008); X.sfxAt('rumble', d.x, 1); X.sfxAt('roar', d.x, 0.9); }
            else if (d.m === 'bkslam') { puff(d.x, d.y - 6, 0xff7a1a, 24); puff(d.x, d.y - 6, 0x6e6270, 18); scene.cameras.main.shake(320, 0.014); X.sfxAt('boom', d.x, 1); }
            else if (d.m === 'bkdrop') X.sfxAt('whoosh', d.x, 0.8);
            else if (d.m === 'bkland') { puff(d.x, d.y - 6, 0x6e6270, 18); puff(d.x, d.y - 6, 0xff7a1a, 10); scene.cameras.main.shake(240, 0.011); X.sfxAt('thud', d.x, 1); }
            else if (d.m === 'bkthrow') X.sfxAt('whoosh', d.x, 0.9);
            else if (d.m === 'rockland') { puff(d.x, d.y - 4, 0x6e6270, 14); puff(d.x, d.y - 4, 0xff7a1a, 8); scene.cameras.main.shake(160, 0.007); X.sfxAt('thud', d.x, 0.9); }
            else if (d.m === 'ramland') { puff(d.x, d.y - 4, 0xe1f5fe, 12); scene.cameras.main.shake(140, 0.006); X.sfxAt('thud', d.x, 0.8); }
            else if (d.m === 'hkhit') X.sfxAt('whip', d.x, 0.8);
            else if (d.m === 'flbite') O.flBite = { tx: d.tx, ty: d.ty, at: scene.time.now };   // gul shu nishon tomon egilib tishlaydi
            else if (d.m === 'flrise') { for (let k = 0; k < 5; k++) puff(d.sx + Phaser.Math.Between(-140, 140), d.sy - 4, 0x6d8f3a, 10); X.sfxAt('rumble', d.sx, 0.8); if (X.hero() && Math.abs(X.hero().x - d.sx) < 1500) showToast(t('big_fl_head')); }
            else if (d.m === 'crwake') { scene.cameras.main.shake(700, 0.012); for (let k = 0; k < 6; k++) puff(d.x + Phaser.Math.Between(-120, 120), d.y - 6, 0x6d5a3a, 12); X.sfxAt('roar', d.x, 1); X.sfx('bossStart'); showToast(t('big_crab_wake')); }
            else if (d.m === 'mgslam') X.sfxAt('thud', d.x, 0.8);
            else if (d.m === 'hkpuck' && d.px !== undefined) { puff(d.px, d.py - 4, 0xb3e5fc, 10); puff(d.px, d.py - 4, 0xffffff, 6); X.sfxAt('pop', d.px, 0.6); }   // muz shayba o'zi paydo bo'ldi
            else if (d.m === 'splash') { puff(d.sx, d.sy, 0x80deea, 18); puff(d.sx, d.sy - 10, 0xffffff, 10); X.sfxAt('splash', d.sx, 0.8); }
            else if (d.m === 'krise') { for (let k = 0; k < 6; k++) scene.time.delayedCall(k * 220, () => { if (O) puff(d.sx + Phaser.Math.Between(-160, 160), d.sy, 0x80deea, 14); }); scene.cameras.main.shake(1400, 0.008); X.sfxAt('rumble', d.sx, 1); X.sfx('bossStart'); }
            else if (d.m === 'shock') {
                const r = d.r || 300, ring = pxDisc(scene, d.x, d.y - 10, r, 30, 0xfff3e0, 0.9, 6).setDepth(3.35).setScale(0.06);
                scene.tweens.add({ targets: ring, scale: 1, alpha: 0, duration: 420, onComplete: () => ring.destroy() });   // zarba to'lqini kengayadi
                scene.cameras.main.shake(260, 0.009); X.sfxAt('roar', d.x, 0.9);
            }
            if (d.m === 'quake') { scene.cameras.main.shake(260, 0.012); puff(d.x, d.y, 0x8d6e63, 26); X.sfxAt('rumble', d.x, 1); }
            else if (d.m === 'blink') puff(d.x, d.y - 40, 0x7c4dff, 18);
            else if (d.m === 'summon') X.sfxAt('roar', d.x, 0.7);
            else if (d.m === 'mark') markHazard(d);
            else if (d.m === 'erupt') eruptHazard(d);
            else if (d.m === 'rage') { banner(t('big_boss_rage'), '#ff5252'); scene.cameras.main.shake(400, 0.01); X.sfxAt('roar', d.x, 1); }
            else if (d.m === 'leap' || d.m === 'pounce') X.sfxAt('whoosh', d.x, 0.8);
        });
        on('bigWake', (d) => { if (!d) return; puff(d.x, d.y - 20, d.k === 'gargoyle' ? 0x9e9e9e : d.k === 'magmablob' || d.k === 'mimicrock' ? 0xff7a1a : d.k === 'boglurker' ? 0x558b2f : d.k === 'hutmimic' ? 0xffffff : d.k === 'stumpmimic' ? 0x6d4c41 : 0x8d5a3a, 16); X.sfxAt('roar', d.x, 0.6); showToast(t(d.k === 'mimic' ? 'big_mimic' : 'big_wake_' + d.k)); });
        on('bigBurn', (d) => {
            if (!d) return;
            const now = scene.time.now;
            puff(d.x, d.y - 6, d.w ? 0x80cbc4 : d.p ? 0x9ccc65 : 0xff7a1a, 8); O.burnUntil = now + 260; O.burnCol = d.w ? 0x80deea : d.p ? 0xc5e1a5 : 0xff8a65; X.sfx('hit', 0.4);
            if (now > (O.burnToast || 0)) { showToast(t(d.w ? 'big_soak' : d.p ? 'big_poison' : 'big_burn')); O.burnToast = now + 4000; }
        });
        on('bigEnd', () => { banner(t('big_end'), '#b9f6ca'); X.sfx('win'); });
        on('bigWind', (d) => { const e = d && O.enemies.get(d.id); if (e) e.windAt = scene.time.now; });
        on('bigShoot', (d) => { const e = d && O.enemies.get(d.id); if (e) { e.windAt = scene.time.now; X.sfxAt(e.k === 'mimicrock' ? 'fireball' : 'arrow', e.x, 0.5); } });
        on('teleport', (d) => { O.fall.y = null; O.vine = null; O.locked = null; releaseHeld(); clearStatus(); if (d) stream(true, d.x, d.y); });
        on('bigSnowGot', (d) => { if (!d) return; X.sfx('pop'); showToast(t('big_snow_got').replace('{n}', d.n)); O.mySnow = d.n; });
        on('bigSnowHit', (d) => { if (!d) return; puff(d.x, d.y, 0xffffff, d.e ? 14 : 8); if (d.e) X.sfxAt('hit', d.x, 0.6); });
        on('bigThrow', (d) => { if (d) X.sfxAt('whoosh', d.x, 0.5); });
        on('bigChill', (d) => { if (!d) return; O.chillUntil = scene.time.now + (d.ms || 1400); O.chillCol = d.gas ? 0xc5e1a5 : 0xb3e5fc; const h = X.hero(); if (h) puff(h.x, h.y, d.gas ? 0x9ccc65 : 0xb3e5fc, 10); if (d.gas) showToast(t('big_gas')); });
        on('bigArmorHit', (d) => { if (!d) return; puff(d.x, d.y - 10, 0x90caf9, 8); X.sfx('block', 0.5); if (d.left <= 0) showToast(t('big_armor_broken')); });
        on('bigPhoenix', (d) => { if (!d) return; puff(d.x, d.y, 0xff7a1a, 30); puff(d.x, d.y - 30, 0xffc35a, 20); X.sfx('win'); if (d.id === X.socket.id) { O.fall.y = null; clearStatus(); showToast(t('big_phoenix_rise')); } });
        on('bigBossReset', (d) => { if (!d) return; O.gifts = {}; showToast(t('big_boss_reset').replace('{b}', t('big_e_' + d.k))); });
        on('bigBuyResult', (d) => {
            if (!d) return;
            const el = document.getElementById('shop-panel'), msg = el && el.querySelector('#bm-shop-msg');
            if (el) el.querySelectorAll('.shop-buy').forEach(b => { b.disabled = !!b.dataset.own; });
            if (d.success && d.item === 'bigmap') { const h = X.hero(); if (h) h.hasMap = true; X.sfx('win'); showToast(t('shop_bought_bigmap')); if (el) { closeShop(); openShop(); } return; }
            if (d.success) { X.sfx('coin'); showToast(t('bigshop_bought').replace('{d}', t('bigshop_' + d.item))); const h = X.hero(); if (h) puff(h.x, h.y - 30, 0xffd54f, 14); if (msg) msg.textContent = ''; renderShopWallet(d.coins); }
            else if (msg) msg.textContent = t(d.message || 'err_server');
        });
        { const c0 = W.cps[W.cp || 0] || W.cps[W.startCp || 0] || { x: 200, y: -280 }; stream(true, c0.x, c0.y); }
    }
    // tirilish / teleport: ildiz, siyoh, tortish, sovuq, kuyish rangi - qolib ketmasin
    function clearStatus() { if (!O) return; O.rootUntil = 0; O.blindUntil = 0; O.pull = null; O.chillUntil = 0; O.burnUntil = 0; }
    function destroy() {
        closePortalMenu(); closeMap();
        if (O && O.fruits) O.fruits.forEach((o) => { o.bush.destroy(); o.berries.forEach(b => { if (b !== o.bush) b.destroy(); }); });
        if (O && X) O.handlers.forEach(([ev, fn]) => X.socket.off(ev, fn));
        if (O && X && O.rodResult) X.socket.off('shopResult', O.rodResult);
        if (O && O.scene && O.scene.textures) O.isles.forEach((im) => {
            const k = im.texture && im.texture.key;
            (im.covers || []).forEach(c => { c.destroy(); if (O.scene.textures.exists(c.texKey)) O.scene.textures.remove(c.texKey); });
            im.destroy(); if (k && O.scene.textures.exists(k)) O.scene.textures.remove(k);
        });
        if (O && O.scene && O.scene.textures) O.chunks.forEach((ch) => ch.objs.forEach(o => { if (o.stKey && O.scene.textures.exists(o.stKey)) { o.destroy(); O.scene.textures.remove(o.stKey); } }));   // tosh teksturalari ham
        O = null; W = null;
    }
    // ===== BO'LAKLAR: kamera atrofida yaratiladi, uzoqdagilari o'chiriladi =====
    // atx - majburan shu x atrofida (teleport / tirilish: yangi joyda yer darhol bo'lsin, aks holda qahramon tushib ketadi)
    function stream(force, atx, aty) {
        const cam = O.scene.cameras.main, hero = X.hero();
        const cx = atx !== undefined ? atx : hero ? hero.x : cam.scrollX + 400, cy = aty !== undefined ? aty : hero ? hero.y : cam.scrollY + 300;
        // teleport / tirilish - faqat YANGI joy atrofi (eski kamera bilan oradagi butun yo'l emas: uzoq teleportda yuzlab bo'lak bir kadrda qurilardi)
        const kx = cam.scrollX + 400, ky = cam.scrollY + 300;
        const far = atx !== undefined || (!!hero && !!cam._follow && (Math.abs(cx - kx) > 900 || Math.abs(cy - ky) > 700));   // kamera hali eski joyda (shu kadrda sakraydi)
        const lo = far ? cx : Math.min(cx, kx), hi = far ? cx : Math.max(cx, kx), ylo = far ? cy : Math.min(cy, ky), yhi = far ? cy : Math.max(cy, ky);
        const c0 = Math.floor((lo - 1000) / CH), c1 = Math.floor((hi + 1000) / CH), r0 = Math.floor((ylo - 900) / CHY), r1 = Math.floor((yhi + 900) / CHY);
        // uzoq qurishdan (teleport) keyin - eski joy bo'laklari o'chirilmagan: keyingi oddiy chaqiruvda oraliq o'zgarmasa ham tozalanadi
        if (!force && !(O.needDrop && !far) && O.lastC0 === c0 && O.lastC1 === c1 && O.lastR0 === r0 && O.lastR1 === r1) return;
        if (far) O.needDrop = true;
        O.lastC0 = c0; O.lastC1 = c1; O.lastR0 = r0; O.lastR1 = r1;
        // oddiy yurishda yangi bo'laklar NAVBATGA (har kadrda ~4 ms dan quriladi - bir kadrda hammasi qurilib "qotish" bo'lmasin;
        // bo'lak qahramondan ~1000 px oldin so'raladi - yetib kelguncha tayyor). Teleport / tirilishda - darhol (yer bo'lsin)
        const now = force || far;
        // qahramon turgan joy (±300 px) - doim darhol (oyog'i ostidagi yer kechikmasin)
        const urgent = (c, r) => !!hero && c * CH < hero.x + 300 && (c + 1) * CH > hero.x - 300 && r * CHY < hero.y + 300 && (r + 1) * CHY > hero.y - 300;
        for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) if (c >= 0 && !O.chunks.has(c + ':' + r)) { if (now || urgent(c, r)) { O.chunkQ.delete(c + ':' + r); buildChunk(c, r); } else O.chunkQ.add(c + ':' + r); }
        if (!far) O.needDrop = false;
        if (!far) [...O.chunks.keys()].forEach((k) => { const [c, r] = k.split(':').map(Number); if (c < c0 - 1 || c > c1 + 1 || r < r0 - 1 || r > r1 + 1) dropChunk(k); });
        // OROLLAR: ko'rinish oralig'ida - rasm, uzoqlashsa - rasm va tekstura o'chiriladi
        const x0 = c0 * CH, x1 = (c1 + 1) * CH, y0 = r0 * CHY, y1 = (r1 + 1) * CHY;
        W.isles.forEach((I) => {
            const near = isleNear(I), im = O.isles.get(I.id);
            if (!near) O.isleQ.delete(I.id);
            // teleport / tirilishda ham faqat EKRANDAGI orollar darhol (qolganlari navbatda - bir kadrda o'nlab tekstura yuklanmasin)
            const bx = isleBox(I), onScreen = bx[0] < cx + 560 && bx[1] > cx - 560 && bx[2] < cy + 460 && bx[3] > cy - 460;
            if (near && !im) { if (now && onScreen) { O.isleQ.delete(I.id); makeIsle(I); } else O.isleQ.add(I.id); }
            else if (!near && im && (I.x + I.w < x0 - 1500 || I.x > x1 + 1500 || I.y < y0 - 1800 || I.y > y1 + 1500)) {
                const k = im.texture.key;
                (im.covers || []).forEach(c => { c.destroy(); if (O.scene.textures.exists(c.texKey)) O.scene.textures.remove(c.texKey); });
                im.destroy(); O.isles.delete(I.id); if (O.scene.textures.exists(k)) O.scene.textures.remove(k);
            }
        });
    }
    // orol rasmi egallaydigan quti [x0, x1, y0, y1] (ichki xonalari bilan) - bir marta hisoblanadi
    function isleBox(I) {
        if (!O.isleBoxes) O.isleBoxes = new Map();
        let b = O.isleBoxes.get(I.id);
        if (!b) { b = [I.x, I.x + I.w, I.y - 12, I.y + 40]; I.r.forEach(q => { b[0] = Math.min(b[0], q[0]); b[1] = Math.max(b[1], q[0] + q[2]); b[3] = Math.max(b[3], q[1] + q[3]); }); O.isleBoxes.set(I.id, b); }
        return b;
    }
    // orol ko'rinish oralig'idami (oxirgi stream oralig'i bo'yicha)
    function isleNear(I) {
        const x0 = O.lastC0 * CH, x1 = (O.lastC1 + 1) * CH, y0 = O.lastR0 * CHY, y1 = (O.lastR1 + 1) * CHY;
        return I.x + I.w > x0 - 200 && I.x < x1 + 200 && I.y > y0 - 500 && I.y < y1 + 200;
    }
    // NAVBATDAGI bo'lak va orollar: har kadrda vaqt byudjeti bilan (kamida bittadan) - avval bo'laklar (fizika), keyin orollar (rasm)
    function drainStream() {
        if (!O.chunkQ.size && !O.isleQ.size) return;
        const t0 = performance.now();
        for (const k of O.chunkQ) {
            O.chunkQ.delete(k);
            const [c, r] = k.split(':').map(Number);
            if (O.chunks.has(k) || c < O.lastC0 || c > O.lastC1 || r < O.lastR0 || r > O.lastR1) continue;
            buildChunk(c, r);
            if (performance.now() - t0 > 4) return;
        }
        if (!O.isleById) O.isleById = new Map(W.isles.map(I => [I.id, I]));
        for (const id of O.isleQ) {
            O.isleQ.delete(id);
            const I = O.isleById.get(id);
            if (!I || O.isles.has(id) || !isleNear(I)) continue;
            makeIsle(I);
            if (performance.now() - t0 > 4) return;
        }
    }
    function makeIsle(I) {
        const T = A().isleTex(O.scene, 'bm_isle_' + W.seed + '_' + I.id, I);
        const img = O.scene.add.image(T.x, T.y, T.key).setOrigin(0, 0).setDepth(-1.2);
        // maxfiy xonalar ustida qopqoq (qahramon ichiga kirsa - ochiladi)
        img.covers = I.r.filter(q => q[4]).map((q, n) => {
            const ck = A().coverTex(O.scene, 'bm_cov_' + W.seed + '_' + I.id + '_' + n, I, q);
            const c = O.scene.add.image(q[0], q[1], ck).setOrigin(0, 0).setDepth(3.7);
            c.rect = q; c.texKey = ck; c.cave = !!I.hole;
            return c;
        });
        if (I.sec) { img.secret = { x: I.x + I.w / 2, y: I.y, min: 0 }; img.setAlpha(0); O.secrets.push(img); }
        O.isles.set(I.id, img);
    }
    function inChunk(x, w, c) { return x < (c + 1) * CH && x + w > c * CH; }
    const DRAWN = { skyplate: 1, hoverpad: 1, plank: 1, stone: 1, mossstone: 1, snowstone: 1, icestone: 1, basaltstone: 1, emberstone: 1, bogstone: 1, rootplat: 1, fogcloud: 1, cloud: 1, scloud: 1, ledge: 1, branch: 1 };
    const ICE_K = { ice: 1, icestone: 1 };   // sirpanchiq sirtlar
    function buildChunk(c, r) {
        const scene = O.scene, x0 = c * CH, x1 = x0 + CH, y0 = r * CHY, y1 = y0 + CHY;
        const inRow = (y) => y >= y0 && y < y1;
        const ch = { objs: [], solids: [] };
        // 1) qattiq jismlar (fizika) - bitta jism bir nechta bo'lakda bo'lishi mumkin (hisoblagich bilan)
        O.solids.forEach((s, i) => { if (inChunk(s.x, s.w, c) && s.y < y1 && s.y + s.h > y0) { addBody(i, s); ch.solids.push(i); } });
        // 2) toshlar, bulutlar, taxtalar, shoxlar - boshlanishi shu bo'lakda bo'lganlari
        W.plats.forEach((p, i) => {
            if (p.k === 'tv') {   // MR. WHO maydoni: televizor + ekran rasmi (boss yoqadi)
                if (p.x < x0 || p.x >= x1 || !inRow(p.y)) return;
                const im = scene.add.image(p.x - 2, p.y - 2, 'bm_tv').setOrigin(0, 0).setDepth(-1.1), sc = scene.add.image(p.x + 8, p.y + 8, 'bm_tvs_1').setOrigin(0, 0).setDepth(-1.05).setVisible(false);
                (O.tvScr || (O.tvScr = new Map())).set(i, sc); ch.objs.push(im, sc);
                return;
            }
            if (!DRAWN[p.k] || p.x < x0 || p.x >= x1 || !inRow(p.y)) return;
            const slab = O.gslab.has(i) && scene.textures.exists('bm_gslab_' + O.gslab.get(i)) ? 'bm_gslab_' + O.gslab.get(i) : null;   // gorilla zali - doim turadigan tekstura (sanalmaydi)
            const key = slab || A().stoneTex(scene, p.k === 'scloud' ? ({ lava: 'emberstone', swamp: 'fogcloud', sky: 'hoverpad' }[locAt(p.x, p.y)] || 'cloud') : p.k, Math.round(p.w / 4) * 4, i % 5);
            const im = scene.add.image(p.x - 4, p.y - 4, key).setOrigin(0, 0).setDepth(p.k === 'cloud' || p.k === 'scloud' ? -1.05 : -1.1);
            if (!slab) { im.stKey = key; O.stUse.set(key, (O.stUse.get(key) || 0) + 1); }
            O.platImg.set(i, im);   // tosh teksturasi - kim ishlatayotgani sanaladi
            if (p.k === 'scloud') { im.secret = { x: p.x + p.w / 2, y: p.y, min: 0.07 }; im.setAlpha(0.07); O.secrets.push(im); }
            ch.objs.push(im);
        });
        // 3) bezaklar
        W.props.forEach((p) => {
            if (p.x < x0 || p.x >= x1 || !inRow(p.y)) return;
            const key = 'bm_p_' + p.k;
            if (!scene.textures.exists(key)) return;
            const front = FRONT_PROPS[p.k];
            const im = scene.add.image(p.x, p.y + 2, key).setOrigin(0.5, 1).setDepth(front ? 3.6 : p.k === 'castle' ? -0.9 : -0.6);
            if (p.k === 'kidcage') { const c = (W.cages || []).find(q => q.x === p.x && q.y === p.y); im.cageZone = c ? c.zone : -1; O.cageImgs = O.cageImgs.filter(q => q.active); O.cageImgs.push(im); }
            if (front) im.setAlpha(0.95);
            if (p.k === 'mimicrock') im.setDepth(-0.5);   // oddiy tosh boshqa bezaklar nuri ostida qolib, rangi o'zgarmasin (tirik mimikdan farq qilmasin)
            ch.objs.push(im);
            if (GLOW_PROPS[p.k] && p.k !== 'mimicrock') {   // oddiy tosh nurlanmaydi: yotgan mimikdan farq qilmasin
                const gl = pxDisc(scene, p.x, p.y - GLOW_PROPS[p.k], p.k === 'campfire' || p.k === 'lavapillar' ? 60 : 46, p.k === 'campfire' || p.k === 'lavapillar' ? 60 : 46, COLD_GLOW[p.k] ? (p.k === 'stalagmite' || p.k === 'mushhouse' ? 0x9a6aff : 0x7ee8ff) : p.k === 'vent' || p.k === 'lavarock' || p.k === 'lavapuddle' ? 0xff5a1a : 0xffc46b, 0.16).setDepth(-0.55).setBlendMode(Phaser.BlendModes.ADD);
                scene.tweens.add({ targets: gl, alpha: 0.24, duration: 700 + (p.x % 400), yoyo: true, repeat: -1 });
                ch.objs.push(gl); O.propGlows.push(gl);
            }
        });
        // 3b) lava ko'llari: oqib turgan lava (qahramon oyog'i botib ko'rinadi) va uning nuri
        (W.lavas || []).forEach((l) => {
            if (l.x < x0 || l.x >= x1 || !inRow(l.y)) return;
            const ts = scene.add.tileSprite(l.x, l.y - 14, l.w, 30, 'bm_lava').setOrigin(0, 0).setDepth(3.05).setAlpha(0.96);
            const gl = pxDisc(scene, l.x + l.w / 2, l.y - 12, (l.w + 90) / 2, 35, 0xff7a1a, 0.16).setDepth(-0.55).setBlendMode(Phaser.BlendModes.ADD);
            scene.tweens.add({ targets: gl, alpha: 0.26, duration: 900, yoyo: true, repeat: -1 });
            O.pools.add(ts); ch.objs.push(ts, gl);
        });
        // botqoq: loy ko'llari va kraken ko'li (qahramon / kraken suvga botib ko'rinadi)
        (W.bogs || []).forEach((l) => {
            if (l.x < x0 || l.x >= x1 || !inRow(l.y)) return;
            const ts = scene.add.tileSprite(l.x, l.y - (l.t ? 2 : 14), l.w, l.t ? 22 : 30, 'bm_bog').setOrigin(0, 0).setDepth(3.05).setAlpha(0.97);   // t - yo'l ustidagi balchiq: yer bilan bir tekis
            O.waters.add(ts); ch.objs.push(ts);
        });
        // ko'l keng (190 m) - har bo'lakda o'z qismi (qahramon ko'lning qaysi tomonidan kelmasin, suv doim chiziladi)
        (W.lakes || []).forEach((l) => {
            const sx = Math.max(l.x, x0), ex = Math.min(l.x + l.w, x1);
            if (ex <= sx || !inRow(l.y)) return;
            const ts = scene.add.tileSprite(sx, l.y - 6, ex - sx, 48, 'bm_lake').setOrigin(0, 0).setDepth(3.05).setAlpha(0.9);
            ts.baseX = sx - l.x;   // naqsh bo'laklar chegarasida uzilmasin
            const deep = scene.add.rectangle(sx, l.y + 42, ex - sx, 48, 0x0e2620, 0.96).setOrigin(0, 0).setDepth(3.05);
            O.waters.add(ts); ch.objs.push(ts, deep);
        });
        // BALIQ KO'LI: orol ustidagi sayoz suv (qahramon suv ustida turadi) va nomi
        (W.ponds || []).forEach((l) => {
            if (l.x < x0 || l.x >= x1 || !inRow(l.y)) return;
            const ts = l.big ? scene.add.tileSprite(l.x, l.y - 3, l.w, 32, 'bm_lake').setOrigin(0, 0).setDepth(3.05).setAlpha(0.85)   // KATTA DARYO: o'yilgan o'zan - qahramon suvga kirib turadi
                : scene.add.tileSprite(l.x, l.y - 3, l.w, 16, 'bm_lake').setOrigin(0, 0).setDepth(-0.4).setAlpha(0.95);
            ts.setTint(l.loc === 'snow' ? 0xcdeeff : l.loc === 'swamp' ? 0x8fbf8a : l.loc === 'lava' ? 0x4fe0d0 : 0x7fc8ff);
            ts.baseX = 0;
            const name = scene.add.text(l.x + l.w / 2, l.y - 62, t((l.big ? 'big_river_' : 'big_lake_') + l.loc), { fontFamily: FONT, fontSize: '8px', color: '#b3e5fc', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setDepth(-0.3);
            O.waters.add(ts); ch.objs.push(ts, name);
        });
        // O'RMON nomi
        (W.groves || []).forEach((l) => {
            if (l.x < x0 || l.x >= x1 || !inRow(l.y)) return;
            ch.objs.push(scene.add.text(l.x + l.w / 2, l.y - 120, t('big_grove_' + l.loc), { fontFamily: FONT, fontSize: '8px', color: '#c5e1a5', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setDepth(-0.3));
        });
        // KATTA O'RMON nomi va yo'l ko'rsatkichlar yozuvi
        (W.wilds || []).forEach((l) => {
            const cx = Math.round((l.fx0 + l.fx1) / 2);
            if (cx < x0 || cx >= x1 || !inRow(l.y)) return;
            ch.objs.push(scene.add.text(cx, l.y - 160, t('big_wood_' + l.loc), { fontFamily: FONT, fontSize: '10px', color: '#c5e1a5', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setDepth(-0.3));
        });
        (W.signs || []).forEach((l) => {
            if (l.x < x0 || l.x >= x1 || !inRow(l.y)) return;
            ch.objs.push(scene.add.text(l.x, l.y - 80, l.home ? t('big_trail_sign_back') : t('big_wood_' + l.loc), { fontFamily: FONT, fontSize: '7px', color: '#ffe0b2', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setDepth(-0.3));
        });
        // 4) sandiqlar
        W.chests.forEach((q) => {
            if (q.x < x0 || q.x >= x1 || !inRow(q.y)) return;
            const im = scene.add.image(q.x, q.y + 1, O.opened.has(q.id) ? 'bm_chest1' : 'bm_chest0').setOrigin(0.5, 1).setDepth(-0.2);
            if (q.sec) { im.secret = { x: q.x, y: q.y, min: 0 }; im.setAlpha(0); O.secrets.push(im); }
            O.chests.set(q.id, im); ch.objs.push(im); im.chestId = q.id;
        });
        O.chunks.set(c + ':' + r, ch);
    }
    function dropChunk(c) {
        const ch = O.chunks.get(c);
        if (!ch) return;
        ch.objs.forEach(o => {
            if (o.chestId) O.chests.delete(o.chestId); O.pools.delete(o); O.waters.delete(o); O.scene.tweens.killTweensOf(o);
            const k = o.stKey; o.destroy();
            // hech kim ishlatmay qolgan tosh teksturasi o'chiriladi (uzoq o'yinda xotira to'lib qolmasin)
            if (k) { const n = (O.stUse.get(k) || 1) - 1; if (n > 0) O.stUse.set(k, n); else { O.stUse.delete(k); if (O.scene.textures.exists(k)) O.scene.textures.remove(k); } }
        });
        ch.solids.forEach(i => removeBody(i));
        O.chunks.delete(c);
    }
    function addBody(i, s) {
        O.plCount.set(i, (O.plCount.get(i) || 0) + 1);
        if (O.bodies.has(i)) return;
        const r = O.scene.add.rectangle(s.x + s.w / 2, s.y + s.h / 2, s.w, s.h, 0, 0).setVisible(false);
        X.platforms.add(r);
        // ingichka platformalar - bir tomonlama (pastdan sakrab o'tib, ustiga qo'nadi)
        if (s.ow) { r.body.checkCollision.down = false; r.body.checkCollision.left = false; r.body.checkCollision.right = false; }
        O.bodies.set(i, r);
    }
    function removeBody(i) {
        const n = (O.plCount.get(i) || 1) - 1;
        if (n > 0) { O.plCount.set(i, n); return; }
        O.plCount.delete(i);
        const r = O.bodies.get(i);
        if (r) { X.platforms.remove(r, true, true); O.bodies.delete(i); }
    }
    const FRONT_PROPS = { bush: 1, fence: 1, fern: 1 };
    const GLOW_PROPS = { streetlamp: 92, billboard: 52, skyhouse: 60, skyhouse2: 46, skytower: 150, shopkiosk: 70, neonlamp: 42, heater: 52, antenna: 98, pylon: 112, icelamp: 80, icecrystal: 30, igloo: 22, shopigloo: 30, lamp: 82, torch: 48, campfire: 22, crystal: 30, glowshroom: 20, house: 62, house2: 62, hut: 50, tower: 110, castle: 150,
        lantern: 76, forge: 30, minehut: 60, mushhouse: 60, lavapillar: 118, vent: 8, lavarock: 12, shopcart: 80, lavapuddle: 6, mimicrock: 45, skulltent: 50, stalagmite: 40 };
    const COLD_GLOW = { streetlamp: 1, billboard: 1, skyhouse: 1, skyhouse2: 1, skytower: 1, shopkiosk: 1, neonlamp: 1, antenna: 1, pylon: 1, crystal: 1, glowshroom: 1, icecrystal: 1, icelamp: 1, mushhouse: 1, stalagmite: 1 };

    // ===== FON =====
    function drawSky(cam) {
        const cx = cam.scrollX + 400, cy = cam.scrollY + 300, loc = locAt(cx, cy);
        const key = loc + Math.round(cy / 60);
        if (key === O.skyKey) return;
        O.skyKey = key;
        const pal = A().SKY[loc] || A().SKY.elf;
        // balandga chiqqan sari tun qorong'iroq, pastga (chuqurlikka) tushgan sari - qizg'ish-qorong'i
        const ry = cy - dyAt(cx, cy), up = Math.max(0, Math.min(1, (-ry - 300) / 1100)), down = Math.max(0, Math.min(1, (ry + 80) / 380));
        O.sky.clear();
        for (let i = 0; i < 30; i++) {
            const k = i / 29, fi = Math.min(pal.length - 1.001, Math.max(0, k * (pal.length - 1) * (1 - up * 0.5)));
            let c = mix(pal[Math.floor(fi)], pal[Math.ceil(fi)], fi - Math.floor(fi));
            if (down > 0) c = mix(c, 0x0a0610, down * 0.75);
            O.sky.fillStyle(c, 1); O.sky.fillRect(0, i * 20, 800, 20);
        }
        const lava = loc === 'lava';   // yer ostida: yulduz / bulut yo'q, tepada - g'or shifti
        O.stars.setAlpha(lava ? 0 : 0.35 + up * 0.65 - down * 0.3);
        O.clouds.setVisible(!lava).setAlpha(loc === 'swamp' ? 0.4 : 0.85); O.ceil.setVisible(lava);
        O.aurora.setAlpha(loc === 'snow' ? Math.max(0, 0.26 - down * 0.3) : 0);
        if (loc === 'snow') O.clouds.setTint(0x9ab8d8); else if (loc === 'swamp') O.clouds.setTint(0x55645a); else if (loc === 'sky') O.clouds.setTint(0xe8f6ff); else O.clouds.clearTint();   // Skylandda - oppoq bulutlar   // botqoqda - xira kulrang-yashil   // qor bazasida bulutlar - muzday ko'k
        Object.keys(O.far).forEach((id) => O.far[id].forEach(ts => ts.setVisible(id === loc)));
    }
    // ZULMAT: qora parda, yorug'lik manbalari atrofi o'chiriladi (yumshoq doira)
    function drawNight(cam, now, hero, seaY) {
        O.flares = O.flares.filter(f => f.until > now);   // har doim (zulmat bo'lmagan joyda ham) - ro'yxat cheksiz o'smasin
        const N = O.night, a = O.nightA;
        N.setVisible(a > 0.02);
        if (a <= 0.02) return;
        N.clear(); N.fill(0x050206, a);
        const sx = cam.scrollX, sy = cam.scrollY, L = O.lightImg;
        // YORUG'LIKLAR BIR CHIZISHDA: N.erase har chaqiruvda butun 800x600 ni qayta chizadi (jangda kadriga 18 marta - o'yin qotardi); endi hammasi yig'ilib, bir marta "o'chiriladi"
        let open = false;
        const stamp = (x, y, scale) => { if (!open) { open = true; N.beginDraw(); } L.setScale(scale); N.batchDraw(L, x, y); };
        const lit = (wx, wy, r) => { const x = wx - sx, y = wy - sy; if (x < -r || x > 800 + r || y < -r || y > 600 + r) return; stamp(x, y, r / 128); };
        try {
        if (hero && !hero.isDead) lit(hero.x, hero.y - 10, 240);
        if (X.others) X.others().forEach(s => { if (s && s.active && s.visible && s.alpha > 0.2) lit(s.x, s.y - 10, 170); });
        O.glowSrc.forEach(g => lit(g.x, g.y, g.r));
        O.enemies.forEach(o => { if (o.boss || GLOWY[o.k]) lit(o.x, o.y - o.img.displayHeight / 2, o.boss ? (o.k === 'bullkan' ? 300 : 190) : o.k === 'mimicrock' ? 110 : 80); if (o.k === 'bullkan' && o.hand) o.hand.forEach(h => lit(h.x, h.y, 170)); if (LAMP[o.k]) { lit(o.x + o.f * 8, o.y - 48, 70); lit(o.x + o.f * 62, o.y - 38, 64); } });
        O.rqImgs.forEach(im => lit(im.x, im.y - 14, 56));
        (W.fruits || []).forEach((f) => { if (f.k === 'redstone' && !O.fruitOff.has(f.id)) lit(f.x, f.y - 16, 72); });   // qizil toshlar zulmatda ko'rinadi
        O.shots.forEach(im => lit(im.x, im.y, 70));
        O.pshots.forEach(im => lit(im.x, im.y, 50));
        O.areaMap.forEach((o) => { const sub = o.k.split(':')[1]; if (o.k === 'mark:mimic' || o.k === 'mark:mole') lit(o.x + o.w / 2, o.y + o.h - 10, 100); else if (o.k.startsWith('patch:fire') || o.k.startsWith('patch:magma')) lit(o.x + o.w / 2, o.y + o.h - 10, 110); else if (o.k.startsWith('beam') && !(o.wn > 0)) { lit(o.x, o.y, 110); lit((o.x + o.x2) / 2, (o.y + o.y2) / 2, 120); lit(o.x2, o.y2, 90); } else if (o.k.startsWith('breath:') && (sub === 'fire' || sub === 'greenfire')) lit(o.x + o.w / 2, o.y + o.h / 2, 150); });
        O.flares.forEach(f => lit(f.x, f.y, f.r));
        if (seaY < 640) for (let x = -40; x < 860; x += 130) stamp(x + ((sx * 0.5) % 130 + 130) % 130 - 65, seaY + 10, 1.3);
        } finally { if (open) N.endDraw(true); }
    }
    function mix(a, b, k) {
        const ar = a >> 16, ag = (a >> 8) & 255, ab = a & 255, br = b >> 16, bg = (b >> 8) & 255, bb = b & 255;
        return (Math.round(ar + (br - ar) * k) << 16) | (Math.round(ag + (bg - ag) * k) << 8) | Math.round(ab + (bb - ab) * k);
    }
    // ALTER QOR BOBO CHANASI: robot bug'ular maydon ustidan uchib o'tadi (ortidan uchqunlar); sovg'alar serverdan, chana o'tayotgan joyda tushadi
    function sleighFly(scene, d) {
        if (d.x0 === undefined) return;
        const sl = scene.add.image(d.x0, d.sy, 'bm_sleigh').setOrigin(0.5, 0.5).setDepth(3.3).setFlipX(d.x1 < d.x0);
        X.sfxAt('whoosh', (d.x0 + d.x1) / 2, 0.8);
        scene.tweens.add({ targets: sl, x: d.x1, duration: d.ms || 2600, ease: 'Linear',
            onUpdate: () => { sl.y = d.sy + Math.sin(scene.time.now / 160) * 6; if (O && Math.random() < 0.35) puff(sl.x - (d.x1 > d.x0 ? 90 : -90), sl.y + 10, Math.random() < 0.5 ? 0xffd54f : 0xffffff, 2); },
            onComplete: () => sl.destroy() });
    }
    function puff(x, y, col, n, always) {
        const scene = O && O.scene;
        if (!scene) return;
        const mp = scene.cameras.main.midPoint;
        if (!always && (Math.abs(x - mp.x) > 1100 || Math.abs(y - mp.y) > 900)) return;   // always - o'zimiz teleport bo'lgan joy (kamera hali yetib kelmagan)   // ekrandan uzoqda (boshqa o'yinchi yonida) - ko'rinmaydi
        for (let i = 0; i < n; i++) {
            const p = scene.add.rectangle(x + Phaser.Math.Between(-14, 14), y + Phaser.Math.Between(-10, 10), 4, 4, col).setDepth(4.3);
            scene.tweens.add({ targets: p, x: p.x + Phaser.Math.Between(-40, 40), y: p.y - Phaser.Math.Between(10, 50), alpha: 0, duration: Phaser.Math.Between(300, 700), onComplete: () => p.destroy() });
        }
    }
    // BOSS: yerdan otilib chiqishidan oldin qizil belgi (qochib ulgurish uchun), keyin tikan / ildiz
    function markHazard(d) {
        const sc = O.scene, g = pixelize(sc.add.graphics()).setDepth(2.5);
        const st = sc.time.now, ms = d.ms || 900;
        const draw = () => {
            if (!O || !g.active) return;
            const k = Math.min(1, (sc.time.now - st) / ms);
            const fire = d.k === 'fire' || d.k === 'gas' || d.k === 'geyser';   // favvora (olov / gaz / suv) - o'z rangida, ko'tarilayotgan zarralar
            const col = d.k === 'gas' ? [0x7cb342, 0xc5e1a5, 0xd8ff8a] : d.k === 'geyser' ? [0x0288d1, 0x81d4fa, 0xe1f5fe] : [0xff6d00, 0xffab40, 0xffc35a];
            g.clear(); g.fillStyle(fire ? col[0] : 0xff1744, 0.18 + 0.3 * k); g.fillEllipse(d.x, d.y, fire ? 80 : 100, 16);
            g.lineStyle(2, fire ? col[1] : 0xff5252, 0.9); g.strokeEllipse(d.x, d.y, (fire ? 80 : 100) * (0.4 + 0.6 * k), 16 * (0.4 + 0.6 * k));
            for (let i = 0; i < 3; i++) g.fillStyle(fire ? col[2] : 0x6d4c41, 1), g.fillRect(d.x - 30 + i * 26 + Math.sin(sc.time.now / 40 + i) * 2, d.y - 4 - (fire ? k * 14 * ((i % 2) + 1) : 0), fire ? 4 : 6, 4);
        };
        const ev = sc.time.addEvent({ delay: 30, loop: true, callback: draw });
        sc.time.delayedCall(ms + 60, () => { ev.remove(); g.destroy(); });
        if (d.k === 'fire' && O.flares) O.flares.push({ x: d.x, y: d.y - 10, r: 70, until: sc.time.now + ms });
    }
    function eruptHazard(d) {
        const HZ = { roots: 'bm_hz_roots', ice: 'bm_hz_ice', tentacle: 'bm_hz_tentacle', fire: 'bm_hz_fire', bones: 'bm_hz_bones', geyser: 'bm_hz_geyser', gas: 'bm_hz_gas' }, fire = d.k === 'fire' || d.k === 'gas' || d.k === 'geyser';
        const sc = O.scene, im = sc.add.image(d.x, d.y + 30, HZ[d.k] || 'bm_hz_spikes').setOrigin(0.5, 1).setDepth(2.55).setScale(1.4, 0.2);
        sc.tweens.add({ targets: im, scaleY: 1.4, y: d.y + 2, duration: 120, ease: 'Back.Out', onComplete: () => sc.tweens.add({ targets: im, alpha: 0, scaleY: 0.3, delay: fire ? 520 : 380, duration: 250, onComplete: () => im.destroy() }) });
        puff(d.x, d.y - 6, d.k === 'gas' ? 0x9ccc65 : d.k === 'geyser' ? 0xb3e5fc : fire ? 0xff7a1a : d.k === 'roots' ? 0x5d4037 : d.k === 'bones' ? 0xd8d0bc : 0x9e9e9e, 14); sc.cameras.main.shake(fire ? 90 : 140, fire ? 0.003 : 0.006); X.sfxAt('rumble', d.x, fire ? 0.4 : 0.7);
        if (d.k === 'fire' && O.flares) O.flares.push({ x: d.x, y: d.y - 50, r: 150, until: sc.time.now + 700 });
    }
    function showToast(msg) {
        O.toast.setText(msg).setAlpha(1);
        O.scene.tweens.killTweensOf(O.toast);
        O.scene.tweens.add({ targets: O.toast, alpha: 0, delay: 1800, duration: 600 });
    }
    function banner(msg, col) {
        O.hudLoc.setText(msg).setColor(col || '#ffe082').setAlpha(1).setScale(0.6);
        O.scene.tweens.killTweensOf(O.hudLoc);
        O.scene.tweens.add({ targets: O.hudLoc, scale: 1, duration: 300, ease: 'Back.Out' });
        O.scene.tweens.add({ targets: O.hudLoc, alpha: 0, delay: 2600, duration: 700 });
    }

    // ===== HAR KADR =====
    function update(scene, now) {
        if (!O || O.scene !== scene) return;
        const cam = scene.cameras.main, hero = X.hero();
        // kamera qahramonni biroz pastroqda ushlaydi - tepada (orollar, pog'onalar) ko'proq ko'rinsin
        if (!O.camSet && cam._follow) { cam.setFollowOffset(0, 60); O.camSet = true; }
        // TELEPORT / TIRILISH / O'YIN BOSHI: qahramon kameradan juda uzoq bo'lsa - kamera darhol yoniga (butun dunyo bo'ylab sekin suzib o'tmasin)
        if (hero && cam._follow) {
            const far = Math.abs(cam.midPoint.x - hero.x) > 900 || Math.abs(cam.midPoint.y - hero.y) > 700;
            if (far && !O.camSnap) { cam.setLerp(1, 1); O.camSnap = true; stream(true, hero.x, hero.y); }
            else if (!far && O.camSnap) { cam.setLerp(0.12, 0.12); O.camSnap = false; }
        }
        stream(false);
        drainStream();
        if (hero && now > (O.gateToastAt || 0) && nearGate(hero)) { O.gateToastAt = now + 7000; showToast(t('big_loc_closed')); }
        drawSky(cam);
        // parallaks: gorizontal va vertikal (balandga chiqsa - uzoqdagi orollar pastga tushadi)
        const vy = cam.scrollY;
        O.stars.tilePositionX = cam.scrollX * 0.02;
        O.clouds.tilePositionX = cam.scrollX * 0.08 + now * 0.004; O.clouds.y = 110 - vy * 0.05;
        O.aurora.tilePositionX = cam.scrollX * 0.03 + now * 0.006;
        const fLoc = locObj(cam.scrollX + 400, cam.scrollY + 300), vyF = fLoc.id === 'sky' ? vy - (fLoc.my + 280) : vy;   // Skyland - o'z qavatiga nisbatan
        Object.keys(O.far).forEach((id) => { const [a, b] = O.far[id]; a.tilePositionX = cam.scrollX * 0.12; b.tilePositionX = cam.scrollX * 0.28; a.y = 250 - vyF * 0.08; b.y = 330 - vyF * 0.16; });
        O.ceil.tilePositionX = cam.scrollX * 0.06;
        // YER OSTI: zulmat, lava dengizi (dunyo tubida), oqib turgan ko'llar
        const vLoc = locObj(cam.scrollX + 400, cam.scrollY + 300), lavaView = vLoc.id === 'lava';
        O.nightA = Phaser.Math.Linear(O.nightA, lavaView ? 0.76 : 0, 0.05);
        // lava dengizi - Yer osti tubida (botqoqdan pastga zinapoyalar o'tgani uchun botqoqda "dengiz" yo'q - faqat tuman)
        const swampView = vLoc.id === 'swamp', seaOn = lavaView;
        const seaY = (lavaView ? vLoc.y1 - 300 : 99999) - cam.scrollY;
        if (seaOn && O.seaKind !== (lavaView ? 'lava' : 'swamp')) { O.seaKind = lavaView ? 'lava' : 'swamp'; O.sea.setTexture(lavaView ? 'bm_lavasea' : 'bm_bogsea'); O.seaTop.setFillStyle(lavaView ? 0xffc35a : 0x4a6a54, 1); }
        O.sea.setVisible(seaOn && seaY < 620).setY(seaY); O.sea.tilePositionX = cam.scrollX + now * (lavaView ? 0.01 : 0.004);
        O.seaGlow.setVisible(lavaView && seaY < 720).setY(seaY - 110);
        O.seaTop.setVisible(seaOn && seaY < 604).setY(seaY - 2 + Math.round(Math.sin(now / 500) * 1.5));
        // BOTQOQ: sudralib yuradigan tuman, suv / loy asta oqadi
        O.fog.forEach((f, i) => { f.setAlpha(Phaser.Math.Linear(f.alpha, swampView ? (i ? 0.32 : 0.22) : 0, 0.03)); f.tilePositionX = cam.scrollX * (0.3 + i * 0.25) + now * (0.006 + i * 0.004); f.y = (i ? 330 : 160) + Math.sin(now / 4000 + i) * 12; });
        O.waters.forEach(ts => { ts.tilePositionX = (ts.baseX || 0) + now * 0.004; });
        O.pools.forEach(ts => { ts.tilePositionX = now * 0.012; ts.tilePositionY = Math.sin(now / 900) * 2; });
        drawNight(cam, now, hero, seaY);
        // chuqurlik: qorong'i, mash'ala va qahramon atrofida yorug'lik (yer ostida - o'z zulmati bor)
        const deep = Math.max(0, Math.min(1, (cam.scrollY - dyAt(cam.scrollX + 400, cam.scrollY + 300) + 300 + 40) / 300)) * (1 - O.nightA / 0.76);
        O.dark.setAlpha(Phaser.Math.Linear(O.dark.alpha, deep * 0.5, 0.08));
        O.lights.clear();
        if (O.dark.alpha > 0.05 && hero) { O.lights.fillStyle(0xffe0b2, 0.10 * O.dark.alpha * 2); O.lights.fillCircle(hero.x, hero.y, 160); O.lights.fillStyle(0xffe0b2, 0.08 * O.dark.alpha * 2); O.lights.fillCircle(hero.x, hero.y, 95); }
        // LOKATSIYA nomi - yangisiga kirganda katta yozuv
        if (hero) {
            const loc = locAt(hero.x, hero.y);
            if (loc !== O.locShown) { O.locShown = loc; const rec = W.locLvl && W.locLvl[loc], hl = (hero && hero.level) || 0, low = rec > hl;   // tavsiya darajasi: past bo'lsa - qizil
                banner(t('big_loc_' + loc) + (rec ? '\n' + t('big_loc_rec').replace('{n}', rec) : ''), low ? '#ff8a80' : ({ elf: '#ffe082', forest: '#b9f6ca', snow: '#b3e5fc', lava: '#ff9e80', swamp: '#c5e1a5', sky: '#80d8ff' }[loc] || '#ffe082')); if (loc === 'lava' || loc === 'swamp') showToast(t('big_' + loc + '_hint')); }
            // HUD: lokatsiya, butun dunyoning necha foizi o'rganilgan (checkpointlar + bosslar), qavat
            const ex = O.ex || 0;
            O.hudDist.setText(t('big_loc_' + loc) + ' · ' + t('big_explored').replace('{p}', ex) + ' · ' + t('big_layer_' + layerAt(hero.y, hero.x)));
            const g = O.hudBar, bx = 270, bw = 370, by = 34, col = { forest: 0x43a047, snow: 0x81d4fa, lava: 0xff5722, swamp: 0x7cb342, sky: 0x40c4ff }[loc] || 0xffb300;
            g.clear(); g.fillStyle(0x000000, 0.6); g.fillRect(bx - 2, by - 2, bw + 4, 8);
            g.fillStyle(0x263238, 1); g.fillRect(bx, by, bw, 4);
            g.fillStyle(col, 1); g.fillRect(bx, by, bw * Math.min(1, ex / 100), 4);
        }
        // MAXFIY yo'l (bulut pog'onalar, orolcha, sandiq): faqat yaqin kelganda asta ko'rinadi
        O.secrets = O.secrets.filter(o => o.active);
        O.secrets.forEach((o) => {
            const d = hero ? Math.hypot(hero.x - o.secret.x, hero.y - o.secret.y) : 1e9;
            o.setAlpha(Phaser.Math.Linear(o.alpha, Math.max(o.secret.min, Math.min(1, (300 - d) / 150)), 0.15));
        });
        // maxfiy xona qopqog'i: qahramon ichida bo'lsa - yo'qoladi; yopiq paytda ichidagi mash'ala nuri ham ko'rinmaydi (tosh ustiga chiqib, xonani fosh qilmasin)
        O.propGlows = O.propGlows.filter(g => g.active);
        O.isles.forEach((im) => (im.covers || []).forEach((c) => {
            const q = c.rect, inside = hero && hero.x > q[0] - 10 && hero.x < q[0] + q[2] + 10 && hero.y + 20 > q[1] && hero.y - 20 < q[1] + q[3] + 40;
            c.setAlpha(Phaser.Math.Linear(c.alpha, inside ? 0 : 1, 0.12));
            O.propGlows.forEach((g) => { if (g.x > q[0] && g.x < q[0] + q[2] && g.y > q[1] - 60 && g.y < q[1] + q[3] + 20) g.setVisible(c.alpha < 0.5); });
            if (inside && c.cave && !c.seen) { c.seen = true; const sn = W.zones.some(z => z.trig === 'e' && z.dx > q[0] && z.dx < q[0] + q[2] + 100 && Math.abs(z.dy - (q[1] + q[3])) < 120); banner(t(sn ? 'big_cave_snake' : 'big_cave'), sn ? '#ff8a80' : '#ffcc80'); }
        }));
        // do'kondan olingan faol ta'sirlar (qolgan soniya)
        let bx = 0;
        O.buffHud.forEach((b) => {
            const v = O.myBuffs ? O.myBuffs[b.k] : 0, on = v > 0;
            b.img.setVisible(on); b.txt.setVisible(on);
            if (!on) return;
            const pts = b.k === 'armor', low = pts ? v <= 30 : b.k !== 'phoenix' && v <= 5;
            b.img.setX(28 + bx * 46); b.txt.setX(42 + bx * 46).setText(b.k === 'phoenix' ? '1' : pts ? String(v) : v + 's').setColor(low ? '#ff8a80' : pts ? '#90caf9' : '#ffffff');
            b.img.setAlpha(low ? 0.5 + 0.5 * Math.abs(Math.sin(now / 150)) : 1);
            bx++;
        });
        updateFall(hero);
        drawVines(now);
        updateNpcs(scene, now, hero);
        drawEnemies(scene, now);
        updateSnow(scene, now, hero);
        drawPortals(now);
        drawGuide(scene, now, hero);
        // sandiq / do'kon / portal / qor uyumi yonida - [E]
        const ch = nearChest(hero), sh = !ch && nearShop(hero), po = !ch && !sh && nearPortal(hero), pl = !ch && !sh && !po && nearPile(hero);
        O.hint.setVisible(!!(ch || pl || (sh && !shopOpen()) || (po && !portalMenuOpen())));
        if (ch) O.hint.setText('[E]').setPosition(ch.x, ch.y - 44 + Math.sin(now / 200) * 3);
        else if (sh) O.hint.setText(t('big_shop_hint')).setPosition(sh.x, sh.y - 150 + Math.sin(now / 200) * 3);
        else if (po) O.hint.setText(t('big_portal_hint')).setPosition(po.x, po.y - 214 + Math.sin(now / 200) * 3);
        else if (pl) O.hint.setText(t('big_snow_hint')).setPosition(pl.x, pl.y - 44 + Math.sin(now / 200) * 3);
        const ea = !ch && !sh && !po && !pl && nearElfAct(hero);
        if (ea) O.hint.setVisible(true).setText(ea.hint).setPosition(ea.x, ea.y + Math.sin(now / 200) * 3);
        drawQuests(scene, now);
        drawFruits(scene);
        drawFishing(scene, now);
        if (shopOpen() && !sh) closeShop();
        if (portalMenuOpen() && !po) closePortalMenu();
    }
    // ===== BALANDDAN YIQILISH (o'z qahramonimiz - pozitsiyani klient boshqaradi): 30 m - yarim jon, 60 m - o'lim =====
    function updateFall(hero) {
        if (!hero || !hero.body) return;
        if (hero.isDead) { O.fall.y = null; return; }
        const feet = hero.y + 24, F = O.fall;
        if (hero.rideSafe) { F.y = feet; F.air = false; if (hero.body.blocked.down || hero.body.touching.down) hero.rideSafe = false; return; }   // ajdarxoda / undan tushgach yerga qo'nguncha - yiqilish yo'q
        if (O.vine) { F.y = feet; F.air = false; return; }   // liana - xavfsiz tayanch
        const grounded = hero.body.blocked.down || hero.body.touching.down;
        if (grounded) {
            const h = F.y !== null && F.air ? feet - F.y : 0;
            if (h > FALL_HURT) {
                X.socket.emit('bigFall', { roomId: X.roomId(), h: Math.round(h) });
                showToast(t(h > FALL_DEATH ? 'big_fall' : 'big_fall_hurt'));
                O.scene.cameras.main.shake(h > FALL_DEATH ? 260 : 180, h > FALL_DEATH ? 0.012 : 0.008);
                X.sfx('hit');
            }
            F.y = feet; F.air = false;
        } else {
            if (F.y === null) F.y = feet;
            F.air = true;
        }
    }
    // ===== LIANALAR: havoda tegsa - ushlaydi; ←/→ chayqatadi, ↑ (sakrash) - qo'yib yuborib uchadi =====
    function drawVines(now) {
        const g = O.vineG, cam = O.scene.cameras.main;
        g.clear();
        W.vines.forEach((v) => {
            if (v.x < cam.scrollX - 300 || v.x > cam.scrollX + 1100 || Math.abs(v.y - cam.scrollY - 300) > 900) return;
            const ang = O.vine && O.vine.v === v ? O.vine.a : Math.sin(now / 900 + v.id) * 0.06;
            const len = O.vine && O.vine.v === v ? O.vine.len : v.len;
            const n = Math.round(len / 6);
            for (let k = 0; k <= n; k++) {
                const q = k / n, x = v.x + Math.sin(ang) * len * q, y = v.y + Math.cos(ang) * len * q;
                g.fillStyle(0x0d0a14, 1); g.fillRect(Math.round(x) - 3, Math.round(y) - 1, 6, 8);
                g.fillStyle(k % 2 ? 0x2a5a2e : 0x3a7a3a, 1); g.fillRect(Math.round(x) - 2, Math.round(y), 4, 6);
                if (k % 4 === 2) { g.fillStyle(0x0d0a14, 1); g.fillRect(Math.round(x) + (k % 8 ? 2 : -8), Math.round(y) - 1, 8, 6); g.fillStyle(0x5ea64d, 1); g.fillRect(Math.round(x) + (k % 8 ? 3 : -7), Math.round(y), 6, 4); }
            }
        });
    }
    // game.js harakat kodidan oldin chaqiriladi: true - qahramon lianada (oddiy harakat o'tkazib yuboriladi)
    function vineControl(scene, keys, dt) {
        if (!O || !W) return false;
        const hero = X.hero();
        if (!hero || !hero.body || hero.isDead) { O.vine = null; return false; }
        const now = scene.time.now;
        if (!O.vine) {
            if (now < O.vineCd || hero.body.blocked.down || hero.body.touching.down) return false;
            for (const v of W.vines) {
                if (Math.abs(hero.x - v.x) > 60 || hero.y < v.y || hero.y > v.y + v.len + 20) continue;
                const ang = Math.sin(now / 900 + v.id) * 0.06, len = Math.max(60, Math.min(v.len, hero.y - v.y));
                const lx = v.x + Math.sin(ang) * len;
                if (Math.abs(hero.x - lx) > 26) continue;
                // tezlik chayqalishga aylanadi
                O.vine = { v, len, a: Math.asin(Math.max(-0.9, Math.min(0.9, (hero.x - v.x) / len))), w: (hero.body.velocity.x / len) * 0.9 };
                O.jumpWas = !!keys.jump;   // ushlagan paytdagi bosilgan sakrash - qo'yib yuborish hisoblanmaydi
                hero.body.setAllowGravity(false);
                X.sfx('whoosh', 0.5);
                break;
            }
            if (!O.vine) return false;
        }
        const V = O.vine;
        // mayatnik: burchak tezlanishi = -g/L sin(a) + tebratish
        const push = keys.left ? -1 : keys.right ? 1 : 0;
        V.w += (-(900 / V.len) * Math.sin(V.a) + push * 2.2) * dt;
        V.w *= 0.995;
        V.w = Math.max(-3.2, Math.min(3.2, V.w));
        V.a += V.w * dt;
        V.a = Math.max(-1.25, Math.min(1.25, V.a));
        const x = V.v.x + Math.sin(V.a) * V.len, y = V.v.y + Math.cos(V.a) * V.len;
        hero.setPosition(x, y);
        hero.setVelocity(0, 0);
        const jumpPressed = !!keys.jump && !O.jumpWas;
        O.jumpWas = !!keys.jump;
        if (jumpPressed) {
            // qo'yib yuborish: aylanma tezlik + biroz tepaga
            const sp = V.w * V.len;
            hero.body.setAllowGravity(true);
            hero.setVelocity(Math.cos(V.a) * sp * 1.15, -Math.sin(V.a) * sp * 0.6 - 260);
            O.vine = null; O.vineCd = now + 450;
            O.fall.y = V.v.y + 300;   // lianadan sakrash - jar qirg'og'i sathidan o'lchanadi (qirg'oqqa qo'nish xavfsiz)
            X.sfx('jump');
        }
        return true;
    }
    // ===== QISHLOQ NPC lari: sayr qiladi, juft-juft gaplashadi, yaqin kelgan qahramonga salom beradi =====
    function updateNpcs(scene, now, hero) {
        const cam = scene.cameras.main;
        W.npcs.forEach((n) => {
            const near = n.x > cam.scrollX - 500 && n.x < cam.scrollX + 1300 && Math.abs(n.y - (cam.scrollY + 300)) < 900;
            let o = O.npcs.get(n.id);
            if (!near) { if (o) { o.img.destroy(); if (o.bub) o.bub.destroy(); O.npcs.delete(n.id); } return; }
            const tk = 'bm_n_' + n.loc + '_' + n.t;
            if (!o) {
                const v = W.villages[n.v];
                o = { n, x: n.x, tx: n.x, f: 1, img: scene.add.image(n.x, n.y + 1, tk + '0').setOrigin(0.5, 1).setDepth(-0.25),
                    bub: null,   // gap pufagi - birinchi gapirganda yaratiladi (qishloqqa kirganda / tirilganda 10 ta matn bir kadrda yaratilib "qotmasin")
                    wait: now + Math.random() * 3000, talkUntil: 0, v, greetAt: 0 };
                O.npcs.set(n.id, o);
            }
            // gapda bo'lsa - turadi
            if (now < o.talkUntil) { o.img.setTexture(tk + '0'); }
            else {
                if (o.bub && o.bub.visible) o.bub.setVisible(false);
                if (n.fix) { o.tx = n.x; o.f = -1; }
                else if (now > o.wait && Math.abs(o.x - o.tx) < 2) { o.tx = Phaser.Math.Clamp(o.x + Phaser.Math.Between(-140, 140), o.v.x0 + 40, o.v.x1 - 40); o.wait = now + 2000 + Math.random() * 5000; }
                const d = o.tx - o.x;
                if (Math.abs(d) >= 2) { o.f = d > 0 ? 1 : -1; o.x += Math.sign(d) * Math.min(Math.abs(d), (n.t === 'kid' ? 55 : 32) * scene.game.loop.delta / 1000); }
                o.img.setTexture(tk + (Math.abs(d) >= 2 && Math.floor(now / 220) % 2 ? '1' : '0'));
            }
            o.img.setPosition(o.x, n.y + 1).setFlipX(o.f < 0);
            if (o.bub && o.bub.visible) o.bub.setPosition(o.x, n.y - o.img.displayHeight - 6);
            // qahramonga salom
            if (hero && !hero.isDead && Math.abs(hero.x - o.x) < 70 && Math.abs(hero.y + 24 - n.y) < 60 && now > o.greetAt && now > o.talkUntil) {
                o.greetAt = now + 15000; o.f = hero.x > o.x ? 1 : -1;
                say(o, line(n.rq ? 'big_rq_greet' : n.fix ? 'big_shop_greet' : 'big_greet_' + n.loc), now, 2600);
            }
        });
        // SUHBAT: yaqin turgan ikki NPC navbatma-navbat gapiradi
        if (!O.nextChat || now > O.nextChat) {
            O.nextChat = now + 2500;
            const list = [...O.npcs.values()].filter(o => now > o.talkUntil);
            for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
                const a = list[i], b = list[j];
                if (a.n.v !== b.n.v || a.n.fix || b.n.fix || Math.abs(a.x - b.x) > 130 || Math.random() > 0.35) continue;
                const pair = pairOf('big_chat_' + a.n.loc);
                a.tx = a.x; b.tx = b.x; a.f = b.x > a.x ? 1 : -1; b.f = -a.f;
                say(a, pair[0], now, 2600);
                O.scene.time.delayedCall(2700, () => { if (O && O.npcs.get(b.n.id) === b) say(b, pair[1], O.scene.time.now, 2600); if (O && O.npcs.get(a.n.id) === a) a.talkUntil = O.scene.time.now + 2700; });
                return;
            }
        }
    }
    function say(o, text, now, ms) {
        if (!o.bub) o.bub = O.scene.add.text(o.x, o.n.y - 60, '', { fontFamily: FONT, fontSize: '7px', color: '#1a1a1a', backgroundColor: '#fffde7', padding: { x: 4, y: 3 }, align: 'center', wordWrap: { width: 170 } }).setOrigin(0.5, 1).setDepth(3.5);
        o.bub.setText(text).setVisible(true).setPosition(o.x, o.n.y - o.img.displayHeight - 6);
        o.talkUntil = now + ms;
    }
    // i18n: qatorlar "|" bilan ajratilgan; suhbat - ketma-ket ikki qator
    function line(key) { const a = t(key).split('|'); return a[Math.floor(Math.random() * a.length)]; }
    function pairOf(key) { const a = t(key).split('|'), k = Math.floor(Math.random() * Math.floor(a.length / 2)) * 2; return [a[k], a[k + 1] || '...']; }
    // ===== DUSHMANLAR (server holatidan, silliq) =====
    function state(d) {
        if (!O || !d) return;
        O.cpNow = d.cp;
        if (d.ex !== undefined) O.ex = d.ex;
        if (d.gc) d.gc.forEach((i) => { if (!O.got.has(i)) { O.got.add(i); if (O.cps[i]) O.cps[i].setTexture('bm_cp1'); } });
        const seen = new Set();
        (d.en || []).forEach((e) => {
            seen.add(e.id);
            let o = O.enemies.get(e.id);
            if (!o) {
                o = { id: e.id, k: e.k, x: e.x, y: e.y, tx: e.x, ty: e.y, img: O.scene.add.image(e.x, e.y, A().enemyKey(e.k, 0)).setOrigin(0.5, 1).setDepth(2.6), bar: pixelize(O.scene.add.graphics()).setDepth(2.7), boss: BOSSES[e.k] };
                if (BIG_SCALE[e.k]) o.img.setScale(BIG_SCALE[e.k]);
                o.img.setAlpha(0); O.scene.tweens.add({ targets: o.img, alpha: 1, duration: 250 });
                O.enemies.set(e.id, o);
            }
            Object.assign(o, { ch: e.ch, tx: e.x, ty: e.y, f: e.f, hp: e.hp, mx: e.mx, a: e.a, fl: e.fl, m: e.m, l: e.l, r: e.r, s: e.s, pz: e.pz, b: e.b, u: e.u, sd: e.sd, v: e.v, sp: e.sp, pa: e.pa, lf: e.lf, j: e.j, bs: e.bs, hx: e.hx, iv: e.iv, bh: e.bh, tv: e.tv });
        });
        [...O.enemies.keys()].forEach((id) => { if (!seen.has(id)) { const o = O.enemies.get(id); o.img.destroy(); o.bar.destroy(); if (o.chute) o.chute.destroy(); (o.ghosts || []).forEach(g => g.destroy()); (o.extra || []).forEach(g => g.destroy()); O.enemies.delete(id); } });
        // HUJUM MAYDONLARI (ogohlantirish -> faol): ko'rinishi drawAreas() da
        const now = O.scene.time.now, aseen = new Set();
        (d.ar || []).forEach((a) => {
            aseen.add(a.id);
            let o = O.areaMap.get(a.id);
            if (!o) { o = { id: a.id, active: false, born: now }; O.areaMap.set(a.id, o); }
            Object.assign(o, { k: a.k, x: a.x, y: a.y, w: a.w, h: a.h, x2: a.x2, y2: a.y2, wn: a.wn, t: a.t, f: a.f, upd: now });
        });
        O.areaMap.forEach((o, id) => { if (!aseen.has(id)) { (o.imgs || []).forEach(im => im.destroy()); O.areaMap.delete(id); } });
        O.shotList = d.sh || []; O.shotAt = O.scene.time.now;   // o'q holati kelgan payt (oldinga surish uchun)
        O.fruitOff = new Set(d.fu || []);   // terilgan (hali qayta pishmagan) mevalar
        O.arenas = d.ba || [];
        if (d.pm !== undefined) O.portalMax = d.pm;
        if (d.pd) O.paidZones = d.pd;
        if (d.cg) O.cagesOpen = d.cg;
        O.myBuffs = (d.bf && X.socket && d.bf[X.socket.id]) || null;
        if (d.sb && X.socket) O.mySnow = d.sb[X.socket.id] || 0;
        // o'yinchilarning qor to'plari
        const pseen = new Set();
        (d.ps || []).forEach((s) => { pseen.add(s.id); let im = O.pshots.get(s.id); if (!im) { im = O.scene.add.image(s.x, s.y, 'bm_sh_snow').setDepth(4.25).setScale(1.3); O.pshots.set(s.id, im); } im.setPosition(s.x, s.y); im.rotation += 0.3; });
        O.pshots.forEach((im, id) => { if (!pseen.has(id)) { im.destroy(); O.pshots.delete(id); } });
        (d.ch || []).forEach((id) => { if (!O.opened.has(id)) { O.opened.add(id); const c = O.chests.get(id); if (c) c.setTexture('bm_chest1'); } });
    }
    const BOSSES = { mrwho: 1, mrhol: 1, fieryhooves: 1, bullkan: 1, warlord: 1, shadowknight: 1, golem: 1, alpha: 1, ancient: 1, spiderqueen: 1, yetiking: 1, icequeen: 1, mammoth: 1, fatelf: 1, gorilla: 1, kraken: 1, skyship: 1, magmatitan: 1, boneking: 1, hellhound: 1, magmaworm: 1, hydra: 1, toadking: 1, bigcroc: 1, rsnake: 1, sambo: 1, bigtree: 1, zvfarm: 1, santa: 1, bigfoot: 1, hockey: 1, bigflower: 1, swampmage: 1, bogcrab: 1 };
    const FLY = { bat: 1, hornet: 1, imp: 1, gargoyle: 1, wisp: 1, frostbat: 1, wraith: 1, skyship: 1, firebat: 1, gazer: 1, mosquito: 1, bogspirit: 1 };
    const LIFT = { kraken: 36, gorilla: -6, mrwho: 10 };   // gorilla - oyog'i biroz yerga botgan (muallaq ko'rinmasin)   // suvdagi kraken: rasm biroz ko'tarilgan (ko'zi suvdan chiqib tursin; serverdagi tana balandligi shunga mos)
    const LURKER = { mimicrock: 1, mimic: 1, snowman: 1, flower: 1, magmablob: 1, boglurker: 1, hutmimic: 1, stumpmimic: 1 };
    // zulmatda o'zi nur sochadiganlar (olovli maxluqlar)
    const LAMP = { miner: 1, minershot: 1 };   // kaskasidagi chiroq: boshi va oldi yoritiladi
    const GLOWY = { mimicrock: 1, emberling: 1, magmabrute: 1, firebat: 1, emberbeetle: 1, cultist: 1, magmacrab: 1, magmablob: 1, imp: 1, wisp: 1, bogspirit: 1 };
    // season rasmlari chapga qaragan - yo'nalish teskari
    const FACE_LEFT = { troll: 0, blocky: 0, zveg: 0, flower: 0, fatelf: 0, gorilla: 0, kraken: 0, skyship: 0 };
    // odamsimon oddiy dushmanlar qahramondan (48 px, bosh kiyimi bilan ~56) past ko'rinmasin; kichik maxluqlar - o'z o'lchamida
    const BIG_SCALE = { miner: 1.15, minershot: 1.15, lizard: 2, snowkid: 1.15, iceram: 1.4, hspear: 1.2, hknives: 1.2, hshield: 1.2, myconid: 1.12, snowballer: 1.1, bogwitch: 1.1, cultist: 1.1, frostmage: 1.1, darkmage: 1.1, bandit: 1.12, darkelf: 1.1, tarcher: 1.15, tknife: 1.15, icecrawler: 1.35, frostling: 1.2, rat: 1.35, spider: 1.25, frog: 1.35, slime: 1.2, mimic: 1.15, goblin: 1.2, gobarcher: 1.2, hornet: 1.2, wisp: 1.2, emberbeetle: 1.35, emberling: 1.2, bonearcher: 1.15, leech: 1.35, bogling: 1.2, mosquito: 1.2, spitter: 1.2,
        // BOSSLAR: bahaybatlari katta, chaqqonlari o'rtacha (serverdagi tana o'lchami shunga mos)
        warlord: 1.25, golem: 1.5, ancient: 1.5, mammoth: 1.5, magmatitan: 1.4, hydra: 1.45, toadking: 1.35, yetiking: 1.25, bigcroc: 1.2, magmaworm: 1.3 };
    // 1-kadri yurish emas (elf - hamla, gorilla - baqiriq, Qor Bobo - itarish): yurganda faqat chayqaladi
    const NOWALK = { fatelf: 1, gorilla: 1, santa: 1 };
    const TEX = { shade: 'shadowknight' };   // soya egizagi - qora ritsar rasmi (shaffof, binafsha)
    // RASMDAN BOSSLAR: varaqda kadrlar yonma-yon (w x h piksel), o'yinda S barobar - piksellar tiniq (silliqlashsiz)
    // QOR BAZASI bosslari (Gemini rasmlaridan, piksel to'riga keltirilgan; har birida 5 kadr): ox - tana o'rtasi (rasm enining ulushi; qop / klyushka bir chetda)
    //  santa: 0 turish, 1 qadam, 2 qo'li oldinga (itarish / otib bo'ldi), 3 qo'li tepada sovg'a bilan, 4 charchagan (cho'kkan, ko'zlari xira)
    //  hockey: 0 turish, 1 sirpanish qadami, 2 klyushka tepada, 3 urib bo'lgan, 4 cho'kkan (shayba chaqirish)
    //  bigfoot: 0 turish, 1 og'zi ochiq (muz), 2 mushtida qor, 3 qo'li cho'zilgan, 4 o'kirish; bffarm - cho'zilgan qo'l bilagi (takrorlanadi), bffist - musht
    const BOSS_IMG = { bigtree: { src: '/public/boss/bigtree/bigtree.png?v=2', w: 106, h: 119, n: 5, S: 3 },
        santa: { src: '/public/boss/santa/santa.png?v=2', w: 70, h: 62, n: 5, S: 2, ox: 0.45 }, hockey: { src: '/public/boss/hockey/hockey.png?v=2', w: 77, h: 60, n: 5, S: 2, ox: 0.28 },
        // FIERY HOOVES (Gemini rasmlari): 0 turish, 1/2 chopish, 3 orqa oyoqda ko'tarilish (tuyoq bilan urish), 4 shox bilan chopish, 5 boshini egish (chopishga tayyor / tepish),
        //  6 yonayotgan shoxlar (otish), 7 sakrash; fhantler - otiladigan shox (uchlari oldinda)
        fieryhooves: { src: '/public/boss/fieryhooves/fieryhooves.png?v=1', w: 100, h: 83, n: 8, S: 2, ox: 0.5 }, fhantler: { src: '/public/boss/fieryhooves/antler.png?v=1', w: 46, h: 31, n: 1, S: 1 },
        // BULLKAN: tanasi (0 turish, 1 og'zi ochiq), musht, ochiq qo'l, tosh ushlagan qo'l, otilgan tosh
        bullkan: { src: '/public/boss/bullkan/bullkan.png?v=2', w: 202, h: 121, n: 2, S: 2 }, bkfist: { src: '/public/boss/bullkan/bullkan_fist.png?v=2', w: 67, h: 69, n: 1, S: 2 },
        bkpalm: { src: '/public/boss/bullkan/bullkan_palm.png?v=2', w: 89, h: 53, n: 1, S: 2 }, bkthrow: { src: '/public/boss/bullkan/bullkan_throw.png?v=2', w: 96, h: 63, n: 1, S: 2 }, brock: { src: '/public/boss/bullkan/bullkan_rock.png?v=2', w: 51, h: 51, n: 1, S: 2 },
        bigfoot: { src: '/public/boss/bigfoot/bigfoot.png?v=3', w: 177, h: 109, n: 5, S: 3 }, bffist: { src: '/public/boss/bigfoot/bigfoot_fist.png?v=2', w: 36, h: 37, n: 1, S: 3 },
        bffarm: { src: '/public/boss/bigfoot/bigfoot_arm.png?v=1', w: 26, h: 26, n: 1, S: 3 },
        // BOTQOQ: gul (0 turish, 1 og'iz keng, 2 tishlarini qisgan, 3 barglari ko'tarilgan, 4 boshi orqada), Balot Magi (6 kadr) + suhbat portreti,
        // krab tanasi (0 turish, 1-2 qadam, 3 tosh, 4 jahli chiqqan), tosh qisqich (0 ochiq, 1 yopiq), qisqich qo'li
        bigflower: { src: '/public/boss/bigflowers/bigflower.png?v=1', w: 96, h: 211, n: 5, S: 2 }, // BALOT MAGI - bitta varaq (keng kataklar, o'yinda kadr = 10 + o'rni): 0-5 hujum, 6-8 quchoq, 9-11 suv quyish, 12-13 arg'imchoqda,
        // 14-17 turish/yurish, 18-21 raqs, 22-24 yeyish, 25-27 hidlash, 28-30 ko'tarish, 31-33 ekish, 34-36 qozon aralashtirish
        swampact: { src: '/public/boss/swampmage/swampmage_act.png?v=4', w: 150, h: 90, n: 37, S: 2 },
        swampface: { src: '/public/boss/swampmage/swampmage_face.png?v=1', w: 24, h: 24, n: 1, S: 4 }, bogcrab: { src: '/public/boss/bigcrab/bogcrab.png?v=2', w: 123, h: 136, n: 5, S: 2 },
        bogclaw: { src: '/public/boss/bigcrab/bogcrab_claw.png?v=1', w: 50, h: 38, n: 2, S: 2 }, bogarm: { src: '/public/boss/bigcrab/bogcrab_arm.png?v=1', w: 12, h: 12, n: 1, S: 2 },
        // MR. WHO (Gemini rasmi): 0/1 turish, 2 pultni bosish, 3 glitch (o'chib-yonish), 4 zarba olganda, 5 yo'qolish (o'lganda)
        mrwho: { src: '/public/boss/mrwho/mrwho.png?v=1', w: 59, h: 85, n: 6, S: 2 } };
    // BAHAYBAT DARAXT (rasmdan) JONLI - 3 xil animatsiya (kadrlar: 0 asl, 1 og'iz yarim, 2 og'iz keng, 3 og'izda olma, 4 og'iz cho'g'):
    //  JIM: shamolda kuchli tebranadi (ildiz qimirlamaydi, tepasi ko'proq), barglar "nafas oladi", og'iz sekin ochilib-yopiladi (chaynaydi)
    //  OLMA OTISH: orqaga tortilib, keskin oldinga "tupuradi" (og'iz keng, olma) - keyin asta qaytadi
    //  ILDIZ / G'AZAB: yerga cho'kib siqiladi, keyin cho'zilib uriladi; kuchli titraydi, og'iz cho'g', barglar ko'p to'kiladi
    // Daraxt 16 gorizontal bo'lak (har biri balandligiga qarab siljiydi), 3 px qadam - piksel uslubi
    const TREE_ANIM = { bands: 16, sway: 18, breath: 6, sink: 18, leafMs: 380 };
    function drawBigTree(scene, o, now) {
        const B = BOSS_IMG.bigtree, S = B.S, Hd = B.h * S, Wd = B.w * S, N = TREE_ANIM.bands, bh = Math.ceil(Hd / N / S) * S;
        if (o.bs !== o.pbs) { o.pbs = o.bs; o.bsAt = now; }
        const st = o.bs || '', t = now - (o.bsAt || now), dir = o.f < 0 ? -1 : 1, ease = (v) => v * v * (3 - 2 * v);
        // holatga qarab: kadr, tepa siljishi (lean), tik siqilish (squash: + pastga), titrash
        let fr, lean = 0, squash = 0, shake = 0;
        if (st === 'spit') {
            const k = Math.min(1, t / 500);
            fr = k < 0.6 ? 3 : 2;
            lean = k < 0.25 ? -dir * 26 * ease(k / 0.25) : dir * 30 * (1 - ease((k - 0.25) / 0.75));   // orqaga tortilib, oldinga tupuradi
        } else if (st === 'roots' || st === 'quake') {
            const k = st === 'roots' ? Math.min(1, t / 600) : (t % 700) / 700;
            squash = k < 0.35 ? 16 * ease(k / 0.35) : -14 * Math.sin(Math.min(1, (k - 0.35) / 0.65) * Math.PI);   // cho'kadi, keyin cho'ziladi
            shake = (st === 'quake' ? 7 : 4) * Math.sin(now / 38);
            fr = Math.floor(now / 110) % 2 ? 4 : 2;
        } else {
            const m = Math.floor(now / 240) % 6;   // chaynash: 0 1 2 1 0 0
            fr = [0, 1, 2, 1, 0, 0][m];
        }
        if (o.r && !st) shake = 2 * Math.sin(now / 50);   // g'azabda (kam jon) jim turganda ham titraydi
        const key = A().enemyKey('bigtreeimg', fr), tex = scene.textures.get(key);
        for (let i = 0; i < N; i++) if (!tex.has('b' + i)) { const top = i * bh; tex.add('b' + i, 0, 0, top, Wd, Math.min(bh + 4 * S, Hd - top)); }   // pastga 12 px ortiq - siqilganda oraliq ochilmasin
        if (!o.tb) { o.img.setVisible(false); o.tb = []; for (let i = 0; i < N; i++) o.tb.push(scene.add.image(o.x, o.y, key, 'b' + i).setOrigin(0.5, 0).setDepth(2.6 + (N - i) * 0.0001)); o.extra = (o.extra || []).concat(o.tb); }
        const q = (v) => Math.round(v / S) * S, sway = Math.sin(now / 1100 + o.id) + 0.35 * Math.sin(now / 470 + o.id * 2), breath = Math.sin(now / 1500);
        const flip = o.f < 0, tint = o.fl ? 'fill' : o.r && Math.floor(now / 200) % 2 ? 0xff8a80 : 0;
        o.tb.forEach((im, i) => {
            const top = i * bh, hf = Math.max(0, 1 - (top + bh / 2) / (Hd * 0.86)), k = Math.pow(hf, 1.6);   // 0 - ildiz, 1 - eng tepa
            const dx = q(sway * TREE_ANIM.sway * k + lean * k + shake * hf), dy = q(-breath * TREE_ANIM.breath * k + squash * hf);
            im.setTexture(key, 'b' + i).setPosition(o.x + dx, o.y + 1 + TREE_ANIM.sink - Hd + top + dy).setFlipX(flip);   // shamol va egilish - dunyo yo'nalishida
            if (tint === 'fill') im.setTintFill(0xffffff); else if (tint) im.setTint(tint); else im.clearTint();
        });
        // to'kilayotgan barglar: g'azab / ildizda - ko'p, tupurganda - bir to'da
        const burst = st === 'quake' || st === 'roots' ? 0.25 : st === 'spit' ? 0.5 : 1;
        if (!o.leafAt || now - o.leafAt > TREE_ANIM.leafMs * burst) {
            o.leafAt = now;
            for (let n = st ? 2 : 1; n > 0; n--) {
                const lx = o.x + (Math.random() - 0.5) * Wd * 0.85, ly = o.y + TREE_ANIM.sink - Hd + 24 + Math.random() * Hd * 0.35, col = [0x2e7d32, 0x43a047, 0x66bb6a, 0x8d6e3c][Math.floor(Math.random() * 4)];
                const lf = scene.add.rectangle(lx, ly, 6, 3, col).setDepth(2.65);
                scene.tweens.add({ targets: lf, y: o.y - 6, x: lx + (Math.random() - 0.5) * 140, angle: (Math.random() - 0.5) * 600, duration: 2000 + Math.random() * 1300, ease: 'Sine.easeIn', onComplete: () => lf.destroy() });
                scene.tweens.add({ targets: lf, alpha: 0, delay: 1700, duration: 900 });
            }
        }
    }
    function loadBossImages(scene) {
        Object.entries(BOSS_IMG).forEach(([k, B]) => {
            const base = k + 'img';
            if (scene.textures.exists(A().enemyKey(base, 0))) { TEX[k] = base; return; }
            const img = new Image();
            img.onload = () => {
                if (!O || !scene.sys || !scene.textures) return;
                for (let f = 0; f < B.n; f++) {
                    const key = A().enemyKey(base, f); if (scene.textures.exists(key)) continue;
                    const ct = scene.textures.createCanvas(key, B.w * B.S, B.h * B.S), c = ct.getContext();
                    c.imageSmoothingEnabled = false; c.drawImage(img, f * B.w, 0, B.w, B.h, 0, 0, B.w * B.S, B.h * B.S); ct.refresh();
                }
                TEX[k] = base;
            };
            img.src = B.src;
        });
    }
    function drawEnemies(scene, now) {
        let boss = null;
        const fx = O.fxG, cam = scene.cameras.main;
        fx.clear();
        if (O.tvScr) O.tvScr.forEach((sc) => { if (sc.active) sc.setVisible(false); });   // boss yo'q - ekranlar o'chiq
        O.enemies.forEach((o) => {
            const lk = o.k === 'fieryhooves' && o.bs === 'charge' ? 0.85 : 0.3;   // juda tez chopayotgan kiyik ekranda orqada qolmasin
            o.x = Phaser.Math.Linear(o.x, o.tx, lk); o.y = Phaser.Math.Linear(o.y, o.ty, 0.3);
            // LEGENDARY KRAKEN - S2 dagidek: suvdan chiqqan ulkan tana, qizil ko'z, suvga osilgan qo'llar
            if (o.k === 'kraken') { drawKraken(scene, o, now); o.bar.clear(); boss = o; return; }
            if (o.k === 'mwheart') { o.img.setVisible(false); o.bar.clear(); return; }   // Mr. Who yuragi - televizor ekranida chiziladi
            if (o.k === 'zvfarm') { o.img.setVisible(false); o.bar.clear(); boss = o; return; }   // ferma boshqaruvchisi - ko'rinmas, faqat chizig'i (qolgan zombilar)
            if (o.k === 'rsnake') { drawRSnake(scene, o, now); o.bar.clear(); boss = o; return; }
            if (o.k === 'bullkan') { drawBullkan(scene, o, now); o.bar.clear(); boss = o; return; }
            if (o.k === 'fieryhooves' && TEX.fieryhooves) { drawFiery(scene, o, now); o.bar.clear(); boss = o; return; }
            if (o.k === 'bigfoot') { drawBigfoot(scene, o, now); o.bar.clear(); boss = o; return; }
            if (o.k === 'bigflower') { drawFlower(scene, o, now); o.bar.clear(); boss = o; return; }
            if (o.k === 'swampmage' && TEX.swampact) { drawMage(scene, o, now); o.bar.clear(); boss = o; return; }
            if (o.k === 'bogcrab') { if (drawCrab(scene, o, now)) boss = o; o.bar.clear(); return; }   // tosh bo'lib yotganda - boss chizig'i yo'q (sir)
            if ((o.k === 'santa' || o.k === 'hockey') && TEX[o.k]) { drawImgBoss(scene, o, now); o.bar.clear(); boss = o; return; }
            const moving = Math.abs(o.tx - o.x) > 0.6;
            const wind = (o.windAt && now - o.windAt < 380) || o.a;
            let fr;
            fr = o.l ? 0 : wind ? 2 : LURKER[o.k] && !moving ? 1 : FLY[o.k] ? (o.k === 'gargoyle' ? 1 + Math.floor(now / 140) % 2 : Math.floor(now / 90) % 2) : moving && !NOWALK[o.k] ? Math.floor(now / 160) % 2 : 0;
            if (o.k === 'eggsac') fr = Math.floor(now / 300) % 2;
            if (o.k === 'gorilla') { fr = o.m === 'roar' ? 1 : o.m === 'slam' ? 2 : o.m === 'push' ? 3 : o.m === 'rest' ? 4 : 0; if (o.m !== o.pm) { gorillaFx(scene, o, o.m); o.pm = o.m; } }   // S1 dagidek: baqiradi, itaradi, uradi, charchab nafas oladi
            // O'G'RILAR: qalqon, sakrash, zarba / otish, ikki qadamli yurish
            if (THIEF[o.k]) fr = o.b ? 4 : o.j ? 3 : wind ? 2 : moving ? (Math.floor(now / 150) % 2 ? 1 : 5) : 0;
            if (o.k === 'darkelf') fr = wind ? 2 : Math.floor(now / 420) % 2;
            // KALTAKESAK: emaklash (2 kadr), til otish - og'zi ochiq, tik turib tirnash; DARAXT: og'zi ochiq (olma), g'azab (ildizlar)
            if (o.k === 'lizard') fr = o.bs === 'tongue' ? 2 : o.bs === 'stand' ? (wind ? 4 : 3) : moving ? Math.floor(now / 130) % 2 : 0;
            if (o.k === 'bigtree') fr = o.bs === 'spit' ? 1 : o.bs === 'quake' || o.bs === 'roots' ? 2 : 0;
            // QOR BAZASI: muz taran (cho'kish / sakrash / musht), kulba-mimik (yashiringanda - oddiy kulba), Qor Bobo, xokkeychi, darvoza
            if (o.k === 'iceram') fr = o.bs === 'crouch' ? 3 : o.bs === 'leap' || o.j ? 4 : wind ? 2 : moving ? Math.floor(now / 170) % 2 : 0;
            if (o.k === 'mimicrock') fr = o.l ? 0 : o.bs === 'crouch' ? 3 : o.bs === 'leap' || o.j ? 4 : o.bs === 'fire' ? 5 : moving ? 1 + Math.floor(now / 150) % 2 : 1;
            if (o.k === 'hutmimic') fr = o.l ? 0 : wind ? 2 : moving ? (Math.floor(now / 120) % 2 ? 1 : 3) : 1;
            if (o.k === 'santa') fr = o.bs === 'arrive' ? 4 : o.bs === 'rest' ? 3 : o.m === 'swind' || o.m === 'sroll' ? 1 : o.m === 'bwind' || o.m === 'sbag' ? 2 : 0;
            if (o.k === 'hockey') fr = o.bs === 'hwind' || o.bs === 'swind' ? 2 : o.bs === 'hit' || o.bs === 'slap' ? 3 : o.bs === 'drop' ? 4 : moving ? Math.floor(now / 240) % 2 : 0;
            if (o.k === 'hgoal') fr = 0;
            // SKYLAND: dron (mo'ljal -> lazer), straj bot (qalqon, otilish, qilich ko'tarib -> zarba)
            if (o.k === 'drone') fr = o.bs === 'aim' ? (now - (o.windAt || 0) < 700 ? 3 : 4) : moving ? 1 + Math.floor(now / 200) % 2 : 0;
            if (o.k === 'guardbot') {
                const wl = now - (o.windAt || -1e9); fr = o.b ? 5 : o.bs === 'lwind' ? 3 : o.bs === 'lunge' ? 4 : wl < 450 ? 3 : wl < 650 ? 4 : moving ? 1 + Math.floor(now / 170) % 2 : 0;
                // HOLOGRAMMA LAZER QILICH: egri energiya tig'i (rasm katakchalarida, rukoyatdan) - keng havorang nur, oppoq o'zak, yuguruvchi skan chiziqlari,
                // pushti "glitch" chizig'i (ba'zan siljiydi); zarbada / otilishda - yorqin yoy izi
                const f = o.f < 0 ? -1 : 1, G = (gx, gy) => [o.x + (gx + 0.5 - 18) * 3 * f, o.y + 1 - (33 - gy) * 3];
                const BL = { 3: [[25, 6], [24, 2], [21, -1], [17, -3], [12, -3], [8, -1]], 4: [[30, 16], [34, 14], [39, 15], [42, 18], [43, 22], [42, 26]],
                    5: [[11, 20], [8, 22], [6, 26], [6, 30]] }[fr] || [[27, 18], [31, 17], [35, 18], [38, 21], [40, 25], [40, 29]];
                const P = BL.map(([gx, gy]) => G(gx, gy)), seg = (fn) => { for (let i = 0; i < P.length - 1; i++) fn(P[i], P[i + 1], i); };
                if (o.img.alpha > 0.3) {
                    const fl = 0.85 + 0.15 * Math.sin(now / 45 + o.id), gl = Math.random() < 0.18 ? (Math.random() < 0.5 ? -3 : 3) : 0;
                    [[18, 0x40e0ff, 0.14], [10, 0x1fa8d0, 0.8], [6, 0x7ef0ff, 0.95], [3, 0xffffff, 1]].forEach(([w, c, al]) => { fx.lineStyle(w, c, al * fl); seg(([x0, y0], [x1, y1]) => fx.lineBetween(x0, y0, x1, y1)); });
                    fx.lineStyle(2, 0xff4fd8, 0.55 * fl); seg(([x0, y0], [x1, y1]) => fx.lineBetween(x0 + 3 * f + gl, y0 - 3, x1 + 3 * f + gl, y1 - 3));
                    // skan chiziqlari: tig' bo'ylab yuguradigan yorqin bo'laklar
                    let L = 0; const lens = []; seg(([x0, y0], [x1, y1]) => { const l = Math.hypot(x1 - x0, y1 - y0); lens.push(l); L += l; });
                    for (let k = 0; k < 3; k++) {
                        let d = ((now / 6 + k * L / 3) % L), i = 0; while (i < lens.length - 1 && d > lens[i]) { d -= lens[i]; i++; }
                        const [x0, y0] = P[i], [x1, y1] = P[i + 1], t = Math.min(1, d / (lens[i] || 1));
                        fx.fillStyle(0xffffff, 0.9); fx.fillRect(x0 + (x1 - x0) * t - 3, y0 + (y1 - y0) * t - 3, 6, 6);
                    }
                    const [tx, ty] = P[P.length - 1]; fx.fillStyle(0xd8fbff, 0.35 + 0.3 * Math.random()); fx.fillCircle(tx, ty, 6);
                }
                if (fr === 4) {
                    const [sx, sy] = G(23, 13), k = o.bs === 'lunge' ? 0.7 : Math.max(0, 1 - (wl - 450) / 220), a0 = -1.9, a1 = 1.0;
                    const arc = (r, wdt, col, al) => { fx.lineStyle(wdt, col, al * k); for (let i = 0; i < 14; i++) { const t0 = a0 + (a1 - a0) * i / 14, t1 = a0 + (a1 - a0) * (i + 1) / 14; fx.lineBetween(sx + Math.cos(t0) * r * f, sy + Math.sin(t0) * r, sx + Math.cos(t1) * r * f, sy + Math.sin(t1) * r); } };
                    arc(66, 16, 0x40e0ff, 0.22); arc(64, 7, 0x9ef3ff, 0.55); arc(62, 3, 0xffffff, 0.85); arc(70, 2, 0xff4fd8, 0.4);
                }
            }
            if (o.k === 'mrwho') {
                fr = o.fl && TEX.mrwho ? 4 : o.m === 'press' ? 2 : o.m === 'blink' ? 3 : Math.floor(now / 520) % 2;
                o.img.setScale(1);   // rasm kadrlari yuklashda S marta kattalashtirilgan
                // televizor ekranlari: server kodlari (0 bo'sh, 1 olov, 2 qo'l, 3 pritsel, 4 yurak) - televizorlar W.plats tartibida
                const idx = O.tvIdx || (O.tvIdx = W.plats.map((p, i) => p.k === 'tv' ? i : -1).filter(i => i >= 0)), code = o.tv || '';
                idx.forEach((pi, j) => { const sc = O.tvScr && O.tvScr.get(pi), c = code[j] || '0'; if (!sc || !sc.active || c === '0') return; sc.setTexture('bm_tvs_' + c).setVisible(true).setAlpha(c === '4' ? 0.8 + 0.2 * Math.sin(now / 140) : c === '3' ? 0.85 + 0.15 * Math.sin(now / 90) : 1); });
            }
            if (o.k === 'mrhol') fr = o.bs === 'aim' ? (now - (o.windAt || 0) < 160 ? 3 : 2) : o.bs === 'dig' ? 4 : o.bs === 'emerge' ? 5 : moving ? Math.floor(now / 160) % 2 : 0;
            if (o.k === 'fieryhooves') fr = o.bs === 'stomp' ? (o.m === 'stomp1' && Math.floor(now / 120) % 2 ? 0 : 3) : o.bs === 'cwind' || o.bs === 'charge' ? (o.bs === 'charge' && Math.floor(now / 90) % 2 ? 1 : 4) : o.bs === 'kick' ? 5 : o.bs === 'kwind' ? 3 : o.bs === 'swind' || o.bs === 'shoot' ? 6 : moving ? 1 + Math.floor(now / 110) % 2 : 0;
            // BOTQOQ: yovvoyi qul (tishlash), qora kapishon (sehr), mimik to'nka (yashiringanda - oddiy to'nka)
            if (o.k === 'wildslave') fr = wind ? 2 : moving ? Math.floor(now / 160) % 2 : 0;
            if (o.k === 'hoodroot') fr = wind ? 2 : moving ? Math.floor(now / 260) % 2 : 0;
            if (o.k === 'stumpmimic') fr = o.l ? 0 : wind ? 2 : moving ? (Math.floor(now / 140) % 2 ? 1 : 3) : 1;
            if (o.k === 'bigtree' && TEX.bigtree === 'bigtreeimg') { drawBigTree(scene, o, now); o.bar.clear(); boss = o; return; }   // rasmdagi daraxt - jonli (bo'laklab)
            if (o.k === 'sambo') {   // kadrlar: 0 turish, 1/2 qadam, 3 otilish, 4-6 suplex (ko'tarish -> egilish -> ko'prik), 7 sakrash, 8/9 tosh
                if (o.bs !== o.pbs) { o.pbs = o.bs; o.bsAt = now; }
                const el = now - (o.bsAt || now), SM = 1200;
                fr = o.bs === 'dash' ? 3 : o.bs === 'wind' ? (Math.floor(now / 100) % 2 ? 3 : 0) : o.bs === 'hold' ? (el < SM * 0.3 ? 4 : el < SM * 0.62 ? 5 : 6) : o.bs === 'throw' ? (el < 420 ? 6 : 5)
                    : o.bs === 'lift' ? 8 : o.bs === 'toss' ? 9 : o.j ? 7 : wind ? 9 : moving ? [1, 0, 2, 0][Math.floor(now / 130) % 4] : 0;   // wind - musht
            }
            const bob = moving && NOWALK[o.k] && !o.b ? -Math.abs(Math.sin(now / 95)) * 3 : 0;
            o.ang = o.sp ? (o.ang || 0) + o.f * 24 : o.m && /^(charge|pounce|stampede)/.test(o.m) ? o.f * 8 : 0;
            o.img.setTexture(o.k === 'fatelf' && o.bs === 'eat' ? 'bm_e_fatelf_eat' + (Math.floor(now / 320) % 2) : A().enemyKey(TEX[o.k] || o.k, fr)).setPosition(o.x, o.y + 1 - (LIFT[o.k] || 0) + bob).setFlipX((o.f < 0) !== !!FACE_LEFT[o.k]).setAngle(o.ang);
            if (o.k === 'gorilla') {   // S1: charchaganda ko'kragi ko'tarilib-tushadi (og'zidan bug'), baqirganda titraydi
                o.img.scaleY = (BIG_SCALE[o.k] || 1) * (o.m === 'rest' ? 0.97 + 0.03 * Math.sin(now / 90) : 1);
                if (o.m === 'roar') o.img.x += Phaser.Math.Between(-2, 2);
                if (o.m === 'rest' && Math.random() < 0.06) gDust(scene, o.x + (o.f < 0 ? -12 : 12), o.y - 100, 1, 0xe0e0e0);
            }
            // holatlar: yer ostida - ko'rinmaydi (faqat qum uyumi yuradi), g'oyib bo'lish, soya egizagi
            const vis = o.u === 1 ? 0 : o.u === 3 ? 0.12 : o.iv ? 0.07 : o.k === 'shade' ? 0.62 : o.k === 'mrwho' ? 0.7 + 0.14 * Math.sin(now / 130) + (Math.random() < 0.04 ? -0.3 : 0) : 1;   // Mr. Who - lipillaydigan hologramma   // ko'rinmas kaltakesak - zo'rg'a ilg'anadi
            if (o.img.alpha > 0.05 || vis > 0) o.img.setAlpha(Phaser.Math.Linear(o.img.alpha, vis, 0.25));
            if (o.fl) o.img.setTintFill(0xffffff); else if (o.k === 'shade') o.img.setTint(0x7e57c2); else if (o.sd) o.img.setTint(0xb0bec5); else if (o.s) o.img.setTint(0x90caf9); else if (o.pz) o.img.setTint(0xb2ff59);
            else if (o.v) o.img.setTint(0xfff59d); else if (o.m && o.boss && !OWN_TELL[o.k]) o.img.setTint(0xffcc80); else if (o.r && Math.floor(now / 200) % 2) o.img.setTint(0xff8a80); else o.img.clearTint();   // OWN_TELL - hujumi o'z animatsiyasida ko'rinadi (rangi bo'yalmasin)
            // ZOMBI SABZAVOT: yerda yashirinib turadi (faqat tuproq do'ngi), keyin sug'urilib chiqadi
            if (o.k === 'zveg') {
                if (o.l) { o.img.setAlpha(0); fx.fillStyle(0x3e2723, 0.9); fx.fillEllipse(o.x, o.y - 2, 40, 10); fx.fillStyle(0x558b2f, 1); fx.fillRect(o.x - 3, o.y - 12, 3, 8); fx.fillRect(o.x + 2, o.y - 10, 3, 6); }
                else if (o.m === 'emerge') {
                    o.emAt = o.emAt || now;
                    const k = Math.min(1, (now - o.emAt) / 1300), H = o.img.height;
                    o.img.setAlpha(1).setCrop(0, 0, o.img.width, H * k).setY(o.y + 1 + o.img.displayHeight * (1 - k));
                    fx.fillStyle(0x3e2723, 0.9); fx.fillEllipse(o.x, o.y - 2, 46, 10);
                    if (Math.random() < 0.3) puff(o.x + Phaser.Math.Between(-14, 14), o.y - 4, 0x6d4c41, 2);
                } else if (o.emAt) { o.img.setCrop(); o.emAt = 0; }
            }
            const h = o.img.displayHeight, w = o.img.displayWidth;
            if (o.k === 'darkelf') { o.img.setY(o.img.y + Math.sin(now / 300 + o.id) * 4); fx.fillStyle(0x6a1aa8, 0.18 + 0.08 * Math.sin(now / 200)); fx.fillEllipse(o.x, o.y + 2, 34, 8); }   // havoda muallaq, ostida qora tuman
            if (o.u === 1) {   // qum / tuproq uyumi va sachrayotgan bo'laklar
                fx.fillStyle(0x4e342e, 0.9); fx.fillEllipse(o.x, o.y - 4, 90, 16); fx.fillStyle(0x6d4c41, 1); fx.fillEllipse(o.x, o.y - 8, 54, 12);
                for (let k = 0; k < 5; k++) { const q = ((now / 260 + k / 5) % 1); fx.fillStyle(0x8d6e63, 1 - q); fx.fillRect(o.x - 30 + k * 14, o.y - 8 - Math.sin(q * Math.PI) * 26, 4, 4); }
            }
            if (o.u === 2) { fx.lineStyle(2, 0xe6e6f0, 0.85); fx.lineBetween(o.x, cam.scrollY - 20, o.x, o.y - h + 6); }   // shiftga ip
            if (o.sd) { fx.lineStyle(3, 0xcfd8dc, 0.6 + 0.3 * Math.sin(now / 120)); fx.strokeEllipse(o.x, o.y - h / 2, w * 1.25, h * 1.15); fx.fillStyle(0x90a4ae, 0.12); fx.fillEllipse(o.x, o.y - h / 2, w * 1.25, h * 1.15); }   // tosh qalqon
            if (o.v) for (let k = 0; k < 3; k++) { const a = now / 220 + k * 2.1; fx.fillStyle(0xffeb3b, 1); fx.fillCircle(o.x + Math.cos(a) * w * 0.35, o.y - h - 8 + Math.sin(a) * 6, 4); }   // gangib qolgan
            if (o.pa) { if (!o.chute) o.chute = scene.add.image(o.x, o.y, 'bm_parachute').setOrigin(0.5, 1).setDepth(2.59); o.chute.setPosition(o.x, o.y - h - 2).setVisible(true); } else if (o.chute) o.chute.setVisible(false);
            // alfa g'azabda: ortidan soyalar (oy jazavasi)
            if (o.k === 'alpha' && o.r) {
                if (!o.ghosts) o.ghosts = [0, 1].map(() => scene.add.image(o.x, o.y, o.img.texture.key).setOrigin(0.5, 1).setDepth(2.58).setAlpha(0.3).setTint(0xb3e5fc));
                o.trailPts = (o.trailPts || []).concat([[o.x, o.y]]).slice(-12);
                o.ghosts.forEach((g, k) => { const pt = o.trailPts[Math.max(0, o.trailPts.length - 1 - (k + 1) * 5)]; g.setTexture(o.img.texture.key).setPosition(pt[0], pt[1] + 1).setFlipX(o.img.flipX).setScale(o.img.scaleX); });
            }
            o.bar.clear();
            if (o.boss) { boss = o; return; }
            if (o.hp < o.mx && !o.l) {
                const bw = 30;
                o.bar.fillStyle(0x000000, 0.7); o.bar.fillRect(o.x - bw / 2 - 1, o.y - h - 9, bw + 2, 5);
                o.bar.fillStyle(0xff5252, 1); o.bar.fillRect(o.x - bw / 2, o.y - h - 8, Math.max(1, bw * o.hp / o.mx), 3);
            }
        });
        // ildiz / to'r: qahramon oyog'i bog'langan
        const hero = X.hero();
        if (hero && now < O.rootUntil) { for (let k = 0; k < 4; k++) { fx.lineStyle(3, k % 2 ? 0x6d4c41 : 0xd7ccc8, 0.9); fx.strokeEllipse(hero.x, hero.y + 14 - k * 6, 34 - k * 4, 10); } }
        O.ink.setAlpha(Phaser.Math.Linear(O.ink.alpha, now < O.blindUntil ? 0.9 : 0, 0.08));
        // BOSS chizig'i (ekran pastida)
        O.bossBar.setVisible(!!boss); if (!boss) { O.bossName.setVisible(false); O.bossIntro = null; }
        if (boss) {
            if (!O.bossIntro || O.bossIntro.id !== boss.id) { O.bossIntro = { id: boss.id, t0: now }; X.sfx('whoosh', 0.5); }   // yangi boss - panel animatsiya bilan ochiladi
            O.bossName.setText(t('big_e_' + boss.k));
            window.bossBarFx(O.bossBar, O.bossName, O.bossIntro, now, Math.max(0, Math.min(1, boss.hp / boss.mx)), { y: 562, col: boss.sd ? 0x90a4ae : boss.v ? 0xffeb3b : 0xe8202a });
        }
        drawShots(scene, now);
        drawAreas(scene, now);
        drawSinks(scene, now);
        drawGrotto(scene);
        drawCrush(now);
        crabTops();
        updatePeaceMage(scene, now);
    }
    // ===== LEGENDARY KRAKEN (S2 map-4 dagidek) =====
    const SQ = [0x3a0a1e, 0x5c1230, 0x7f1d3f, 0xa52a52];
    // kalmar qo'li: nuqtalar bo'ylab qalin (w0 -> w1) qizil qo'l, bir tomonida och so'rg'ichlar
    function tentacle(g, pts, w0, w1) {
        const n = pts.length;
        pts.forEach(([x, y], i) => { const w = w0 + (w1 - w0) * i / (n - 1); g.fillStyle(0x0a0a0a, 1); g.fillCircle(x, y, w / 2 + 2); });
        pts.forEach(([x, y], i) => {
            const w = w0 + (w1 - w0) * i / (n - 1);
            g.fillStyle(i % 2 ? SQ[2] : SQ[1], 1); g.fillCircle(x, y, w / 2);
            if (i % 3 === 1 && w > 10) { g.fillStyle(0xf8bbd0, 1); g.fillCircle(x + w * 0.22, y, Math.max(2, w * 0.14)); }
        });
    }
    const lakeAt = (x, y) => (W.lakes || []).find(l => x > l.x - 300 && x < l.x + l.w + 300 && Math.abs(l.y - y) < 700);   // qatlamlar ustma-ust - balandlik ham
    // ROBOT BIGFUT: maydonning chap chekkasida (orol orqasida), beligacha, o'ngga qaragan; server tanasi - YUZI (o.x - yuz o'rtasi, o.y - yuz osti,
    // yerdan BF_FACE px balandda - bigboss BIGFOOT.faceUp). Yuz rasm o'rtasidan BF_DX px o'ngda. Rasm tagi yerdan 30 px pastda (orol tepasi yopib turadi),
    // sekin nafas oladi; musht cho'zilganda - qo'li drawAreas da (oldingi yelkasidan) chiziladi
    // rasm (bigfoot.png, 177x109, S=3): yuz o'rtasi rasm o'rtasidan BF_DX px o'ngda, yuz osti yerdan BF_FACE px balandda; rasm tagi yerdan 24 px pastda
    const BF_FACE = 123, BF_DX = 78;
    function drawBigfoot(scene, o, now) {
        const g = o.y + BF_FACE;
        if (!TEX.bigfoot) { o.img.setVisible(false); return; }   // rasm yuklanguncha
        if (!o.bfOn) {
            o.bfOn = true; o.img.setDepth(-1.25).setVisible(true);
            if (X.hero() && Math.abs(X.hero().x - o.x) < 1500) showToast(t('big_bf_face'));
        }
        const fr = o.bs === 'spit' ? 1 : o.bs === 'throw' ? 2 : o.bs === 'fist' ? 3 : o.bs === 'rise' || o.u === 1 ? 4 : 0, breath = Math.round(Math.sin(now / 650) * 1.4) * 3;
        o.img.setTexture(A().enemyKey(TEX.bigfoot, fr)).setOrigin(0.5, 1).setScale(1).setPosition(Math.round((o.x - BF_DX) / 3) * 3, g + 24 + breath).setFlipX(false).setAngle(0).setAlpha(1);
        if (o.fl) o.img.setTintFill(0xffffff); else if (o.r && Math.floor(now / 200) % 2) o.img.setTint(0xff8a80); else o.img.clearTint();
        if (o.bs === 'spit' && Math.random() < 0.5) puff(o.x + 20, o.y - 10, 0xb3e5fc, 2);
        if (o.bs === 'throw' && Math.random() < 0.15) puff(o.x + 135, g - 105, 0xffffff, 2);   // mushtidagi qor to'kiladi
        if (o.u === 1 && Math.random() < 0.4) puff(o.x - BF_DX + Phaser.Math.Between(-150, 150), g - 6, 0xffffff, 3);   // qordan chiqib kelmoqda
    }
    // BULLKAN: tanasi orol ortidan chiqib turadi (joyidan qimirlamaydi), ikki qo'li - alohida rasmlar, joyini server beradi (o.bh)
    const BK_HAND = ['bkfist', 'bkpalm', 'bkthrow'];
    function drawBullkan(scene, o, now) {
        if (!TEX.bullkan) { o.img.setVisible(false); return; }   // rasm yuklanguncha
        if (o.bs !== o.pbs) { o.pbs = o.bs; o.bsAt = now; }
        const up = o.bs === 'rise' ? Math.min(1, (now - (o.bsAt || now)) / 1600) : 1, breath = Math.round(Math.sin(now / 480) * 1.4) * 2, BK_UP = 58;   // o.y - jag' osti (server tanasi - boshi), yerdan BK_UP px balandda
        const roar = o.bs && o.bs !== 'idle' && o.bs !== 'back' && o.bs !== 'rest';
        if (!o.bkOn) { o.bkOn = true; scene.tweens.killTweensOf(o.img); o.img.setAlpha(1); if (X.hero() && Math.abs(X.hero().x - o.x) < 1500) showToast(t('big_bk_head')); }
        o.img.setVisible(true).setDepth(-1.25).setTexture(A().enemyKey(TEX.bullkan, roar ? 1 : 0)).setOrigin(0.5, 1).setScale(1).setFlipX(false).setAngle(0).setPosition(Math.round(o.x / 2) * 2, o.y + BK_UP + 8 + breath + Math.round((1 - up) * 300));
        if (o.fl) o.img.setTintFill(0xffffff); else if (o.r && Math.floor(now / 200) % 2) o.img.setTint(0xff8a80); else o.img.clearTint();
        if (!o.hand && TEX.bkfist && TEX.bkpalm && TEX.bkthrow) { o.hand = [0, 1].map(() => scene.add.image(o.x, o.y, A().enemyKey(TEX.bkfist, 0)).setDepth(3.3)); o.extra = (o.extra || []).concat(o.hand); }
        if (o.hand && o.bh) o.hand.forEach((im, i) => {
            const k = o.bh[i * 4 + 2], f = o.bh[i * 4 + 3], idle = o.bs === 'idle' || o.bs === 'rise', bob = idle ? Math.round(Math.sin(now / 260 + i * 2) * 5) * 2 : 0;
            const tx = o.bh[i * 4], ty = o.bh[i * 4 + 1] + bob;
            if (im.px === undefined) { im.px = tx; im.py = ty; }
            im.px = Phaser.Math.Linear(im.px, tx, 0.7); im.py = Phaser.Math.Linear(im.py, ty, 0.7);
            im.setTexture(A().enemyKey(TEX[BK_HAND[k]] || TEX.bkfist, 0)).setFlipX(f < 0).setPosition(Math.round(im.px / 2) * 2, Math.round(im.py / 2) * 2).setAlpha(up);
            if (o.fl) im.setTintFill(0xffffff); else im.clearTint();
            if (Math.random() < 0.03) puff(im.x + Phaser.Math.Between(-40, 40), im.y + Phaser.Math.Between(-40, 40), 0xff7a1a, 2);
        });
        if (o.bs === 'rise' && Math.random() < 0.5) puff(o.x + Phaser.Math.Between(-190, 190), o.y + BK_UP - 6, 0x8d6e63, 3);
    }
    // ===== BOTQOQ BOSSLARI (rasmdan) =====
    // BAHAYBAT GUL: rasm tagi - ildiz (balchiq tubida); server tanasi - BOSHI (o.x - bosh o'rtasi, o.y - bosh osti, ildizdan FL_UP px balandda).
    // Rasm ikki qismga bo'linadi: BOSH (bo'yin atrofida aylanadi) va POYA (yupqa tasmalar - ildizdan tepaga qarab egiladi, to'lqin yuradi).
    // Shamolda chayqaladi, vaqti-vaqti bilan og'zini katta ochib shart yopadi, so'lagi tomadi; tishlashda - orqaga tortilib, nishon tomon cho'ziladi
    const FL_UP = 254, FL_DX = 11, FL_OX = 42.5 / 96;
    const FLW = 192, FLH = 422, FL_NX = 38, FL_NY = 152, FL_JX = 52, FL_JY = 184, FL_RX = 85, FL_RY = 400, FL_BH = 6, FL_N = Math.ceil((FLH - FL_NY) / FL_BH);   // rasm px (S=2): bo'yin, jag' chegarasi, ildiz, tasma balandligi
    function flTex(scene, part, fr) {
        const key = 'bm_fl_' + part + fr;
        if (scene.textures.exists(key)) return key;
        const src = scene.textures.get(A().enemyKey(TEX.bigflower, fr)).getSourceImage(), ct = scene.textures.createCanvas(key, FLW, FLH), c = ct.getContext();
        c.imageSmoothingEnabled = false; c.drawImage(src, 0, 0);
        // bosh: bo'yindan yuqorisi, jag' va bo'yin yonidagi pushti gulbarglar; poya - qolgani
        const id = c.getImageData(0, 0, FLW, FLH), px = id.data;
        for (let y = 0; y < FLH; y++) for (let x = 0; x < FLW; x++) {
            const i = (y * FLW + x) * 4, r = px[i], g = px[i + 1], b = px[i + 2];
            const pink = y < FL_JY + 24 && r > 110 && r > g * 1.6 && r > b * 1.1, head = y < FL_NY || (y < FL_JY && x >= FL_JX) || pink;
            if (head !== (part === 'h')) px[i + 3] = 0;
        }
        c.putImageData(id, 0, 0);
        if (part !== 'h') for (let i = 0; i < FL_N; i++) { const top = FL_NY + i * FL_BH; ct.add('s' + i, 0, 0, top, FLW, Math.min(FL_BH + 2, FLH - top)); }
        ct.refresh();
        return key;
    }
    function drawFlower(scene, o, now) {
        if (!TEX.bigflower) { o.img.setVisible(false); return; }
        const dir = o.f < 0 ? -1 : 1, bx = o.x - dir * FL_DX, by = o.y + FL_UP, st = o.bs || '';
        if (st !== o.pst) { o.pst = st; o.stAt = now; }
        const el = now - (o.stAt || now), dt = Math.min(0.05, scene.game.loop.delta / 1000), ease = (v) => v * v * (3 - 2 * v);
        if (!o.fp) {
            o.img.setVisible(false);
            o.fp = { B: 0, ang: 0, hy: 0, dripAt: now, strips: [], head: scene.add.image(0, 0, flTex(scene, 'h', 0)).setDepth(2.56) };
            for (let i = 0; i < FL_N; i++) o.fp.strips.push(scene.add.image(0, 0, flTex(scene, 's', 0), 's' + i).setDepth(2.55));
            o.extra = (o.extra || []).concat(o.fp.strips, [o.fp.head]);
        }
        const P = o.fp, rg = o.r ? 1.6 : 1;
        // nishon qiymatlar: B - poya uchining egilishi (dunyo px, + o'ngga), ang - boshning qo'shimcha qiyshayishi, hy - bosh pastga / tepaga (poya cho'ziladi)
        let B = 10 * Math.sin(now / 1400 * rg + o.id) + 4 * Math.sin(now / 530 * rg + o.id * 2), ang = 3 * Math.sin(now / 900 + o.id), hy = 3 * Math.sin(now / 760), rate = 4, sf = 0;
        const m = Math.floor(now / 260) % 18; let hf = m <= 1 ? 1 : m === 2 ? 2 : 0;   // og'zini katta ochib, shart yopadi
        if (st === 'spit') { hf = 1; if (el < 170) { B = -dir * 22; ang = -dir * 14; hy = -10; rate = 12; } else { B = dir * 20; ang = dir * 8; hy = 6; rate = 18; } }   // orqaga tortilib, oldinga tupuradi
        else if (st === 'roots') { sf = 3; hf = Math.floor(now / 140) % 2 ? 1 : 2; B = 3 * Math.sin(now / 45); ang = 5 * Math.sin(now / 60); hy = -6; rate = 12; }   // barglarini ko'tarib, titrab bo'kiradi
        else if (st === 'bitew') {
            const T = O.flBite && now - O.flBite.at < 2500 ? O.flBite : null, nx = bx + dir * (FL_NX - FL_RX), ny = by + 4 - FLH + FL_NY;
            const tdx = T ? T.tx - nx : dir * 200, tdy = T ? T.ty - ny : 0, sg = tdx < 0 ? -1 : 1;
            if (el < 750) { const k = ease(Math.min(1, el / 600)); B = -sg * 30 * k; ang = -sg * 12 * k; hy = -16 * k; hf = 1; rate = 6; }   // orqaga tortiladi, og'zi ochiq
            else { B = Math.max(-72, Math.min(72, tdx * 0.6)); ang = sg * 10; hy = Math.max(-20, Math.min(50, tdy * 0.4)); hf = el < 860 ? 1 : 2; rate = 20; }   // nishon tomon otiladi va tishlaydi
        }
        const a = Math.min(1, dt * rate); P.B += (B - P.B) * a; P.ang += (ang - P.ang) * a; P.hy += (hy - P.hy) * a;
        const sk = flTex(scene, 's', sf), hk = flTex(scene, 'h', hf), Wa = st ? 2 : 5, q = (v) => Math.round(v / 2) * 2, ox = dir < 0 ? 1 - FL_RX / FLW : FL_RX / FLW;
        const off = (u) => P.B * u * u + Wa * Math.sin(now / 650 * rg - u * 2.6 + o.id) * u;   // ildizda 0, tepaga qarab ko'payadi; to'lqin pastdan tepaga yuradi
        const tint = o.fl ? 'fill' : o.r && Math.floor(now / 200) % 2 ? 0xff8a80 : 0, paint = (im) => { if (tint === 'fill') im.setTintFill(0xffffff); else if (tint) im.setTint(tint); else im.clearTint(); };
        P.strips.forEach((im, i) => {
            const top = FL_NY + i * FL_BH, u = Math.max(0, Math.min(1, (FL_RY - top - FL_BH / 2) / (FL_RY - FL_NY)));
            im.setTexture(sk, 's' + i).setOrigin(ox, 0).setFlipX(dir < 0).setPosition(bx + q(off(u)), by + 4 - FLH + top + q(P.hy * u * u)); paint(im);
        });
        const tipA = Math.atan2(2 * P.B, FL_RY - FL_NY) * 57.3 + P.ang;
        P.head.setTexture(hk).setOrigin(dir < 0 ? 1 - FL_NX / FLW : FL_NX / FLW, FL_NY / FLH).setFlipX(dir < 0).setAngle(tipA)
            .setPosition(bx + dir * (FL_NX - FL_RX) + q(off(1)), by + 4 - FLH + FL_NY + q(P.hy)); paint(P.head);
        const mouth = (tx, ty) => { const r = tipA * Math.PI / 180, dx = dir * (tx - FL_NX), dy = ty - FL_NY; return [P.head.x + dx * Math.cos(r) - dy * Math.sin(r), P.head.y + dx * Math.sin(r) + dy * Math.cos(r)]; };
        if (st === 'spit' && el > 150 && el < 380 && Math.random() < 0.5) { const [mx, my] = mouth(160, 140); puff(mx, my, 0xd81b60, 3); }
        if (now - P.dripAt > 900 + Math.random() * 900) {   // og'zidan so'lak tomadi
            P.dripAt = now; const [mx, my] = mouth(126 + Math.random() * 34, 166), d = scene.add.rectangle(mx, my, 2, 4, 0xb2dfdb).setDepth(2.57);
            scene.tweens.add({ targets: d, y: my + 70 + Math.random() * 40, alpha: 0, duration: 700, ease: 'Quad.easeIn', onComplete: () => d.destroy() });
        }
    }
    // BALOT MAGI (jangda): kadrlar - 0 turish, 1 qadam, 2 hassa ko'tarilgan, 3 hassa yerga, 4 lekchi, 5 quchoq (qo'llar oldinga), 6 o'tirish (arg'imchoqda), 7 ko'tarish (qo'llar tepada)
    // 10+ - harakat varag'i (swampmage_act.png): 10-15 hujum, 16-18 quchoq, 19-21 suv quyish, 22-23 arg'imchoqda; yuklanmagan bo'lsa - eski kadr
    const MGA_OX = 78 / 150, MG_SEAT = () => 32;   // o'tirgan kadr: o'rindiqdan pastga (rasm osti)
    const MG_OLD = [24, 25, 28, 44, 19, 17, 22, 40, 36, 42];   // eski kadr raqamlari (0 turish, 1 qadam, 2 qo'l tepada, 3 hassa pastda, 4 suv, 5 quchoq, 6 o'tirish, 7 ko'tarish, 8 hidlash, 9 ekish)
    const MG_WALK = (now, k = 1) => [25, 26, 27, 26][Math.floor(now / (170 / k)) % 4];   // yurish: qadam - juft - qadam - juft
    function mageFrame(img, x, y, f, fr) {
        const flip = f < 0;
        if (fr < 10) fr = MG_OLD[fr] || 24;
        img.setVisible(true).setTexture(A().enemyKey(TEX.swampact, fr - 10)).setOrigin(flip ? 1 - MGA_OX : MGA_OX, 1).setPosition(x, y).setFlipX(flip).setScale(1).setAlpha(1);
    }
    function drawMage(scene, o, now) {
        if (!TEX.swampact) { o.img.setVisible(false); return; }
        const st = o.bs || '', moving = Math.abs(o.tx - o.x) > 0.6, dir = o.f < 0 ? -1 : 1;
        if (st !== o.mst) { o.mst = st; o.mAt = now; }
        const el = now - (o.mAt || now);
        // HUJUM: tayyorlanish - hassa oldinga, keyin boshi ustida; zarba - oldinga otilib (etak hilpiraydi), keyin hassa oldinda; shar otish - hassa oldinga
        const fr = st === 'slamw' ? (el < 260 ? 10 : 12) : st === 'slam' ? (el < 320 ? 13 : 14) : st === 'raise' ? 12 : st === 'cast' ? (el < 160 ? 13 : 14) : moving ? MG_WALK(now) : 24;
        mageFrame(o.img, o.x, o.y + 1 - (moving ? Math.abs(Math.sin(now / 220)) * 2 : 0), o.f, fr);
        o.img.setAngle(0).setDepth(2.6);
        if (o.fl) o.img.setTintFill(0xffffff); else if (o.v) o.img.setTint(0xfff59d); else if (o.r && Math.floor(now / 200) % 2) o.img.setTint(0xff8a80); else o.img.clearTint();
        if ((st === 'raise' || st === 'slamw') && Math.random() < 0.4) puff(o.x + dir * (TEX.swampact ? 30 : 40), o.y - (TEX.swampact ? 148 : 142), 0x9cff6e, 2);   // hassa uchida yashil nur
    }
    // BALOT KRABI: tana (rasm, qisqichsiz) + o'zim chizgan tosh qisqichlar (alohida, qimirlaydi). Server tanasi - QOBIG'I (jangda o.y - qobiq osti, yerdan CR_UP).
    // TOSH holatida - balchiqqa cho'kib yotgan tosh (pastki qismi kesiladi), qisqichlari yo'q; uyg'onganda balchiqdan ko'tariladi
    const CR_UP = 100, CR_DX = 24, CR_SINK = 64, CR_IMG = -25, CR_TOP = 56;   // CR_TOP - qobiq gumbazi (ustida turiladigan pog'ona) balchiqdan balandligi   // CR_IMG - rasm markazi qisqich bo'g'inlari hisobidan (bx) siljigan (yangi rasm qisqichsiz, torroq)
    function drawCrab(scene, o, now) {
        if (!TEX.bogcrab) {   // rasm yuklanmagan (masalan, serverda boss rasmlari yo'q) - soxta qobiqlar bilan bir xil oddiy tosh
            const stoneFb = o.bs === 'stone';
            o.img.setVisible(true).setTexture('bm_p_bogrock').setOrigin(0.5, 1).setFlipX(false).setAngle(0).setAlpha(1).setDepth(2.6).setPosition(o.x + 25, (stoneFb ? o.y : o.y + CR_UP) + 8).setDisplaySize(stoneFb ? 150 : 220, stoneFb ? 72 : 150);
            return !stoneFb;
        }
        const st = o.bs || '', stone = st === 'stone', dir = stone || o.f >= 0 ? 1 : -1;   // tosh holatida - soxta qobiqlar bilan bir xil (o'yinchiga burilmaydi)
        if (stone) o.floor = o.y; else if (o.floor === undefined) o.floor = o.y + CR_UP;
        const floor = o.floor, prog = stone ? 0 : Math.max(0, Math.min(1, (floor - o.y) / CR_UP)), sink = Math.round(CR_SINK * (1 - prog) / 2) * 2;
        if (st !== o.pst) { o.pst = st; o.stAt = now; }
        const el = now - (o.stAt || now), moving = Math.abs(o.tx - o.x) > 0.6;
        const fr = stone ? 3 : moving ? 1 + Math.floor(now / 160) % 2 : o.r ? 4 : 0, bx = o.x + dir * CR_DX;
        o.img.setVisible(true).setTexture(A().enemyKey(TEX.bogcrab, fr)).setOrigin(0.5, 1).setPosition(bx + dir * CR_IMG, floor + sink).setFlipX(dir < 0).setAngle(0).setScale(1).setAlpha(1).setDepth(2.6);
        o.img.setCrop(0, 0, o.img.width, o.img.height - sink);
        if (o.fl) o.img.setTintFill(0xffffff); else if (o.v) o.img.setTint(0xfff59d); else o.img.clearTint();
        // QISQICHLAR
        if (!o.cl && TEX.bogclaw && TEX.bogarm) {
            const ck = (f) => A().enemyKey(TEX.bogclaw, f), ak = A().enemyKey(TEX.bogarm, 0);
            o.cl = { aA: scene.add.tileSprite(0, 0, 10, 22, ak).setOrigin(0, 0.5).setDepth(2.585), A: scene.add.image(0, 0, ck(0)).setOrigin(0.08, 0.5).setDepth(2.59),
                aB: scene.add.tileSprite(0, 0, 10, 22, ak).setOrigin(0, 0.5).setDepth(2.615), B: scene.add.image(0, 0, ck(1)).setOrigin(0.08, 0.5).setDepth(2.62), hA: null, hB: null, rock: scene.add.image(0, 0, 'bm_sh_rock').setScale(2.6).setDepth(2.625).setVisible(false) };
            o.extra = (o.extra || []).concat([o.cl.aA, o.cl.A, o.cl.aB, o.cl.B, o.cl.rock]);
        }
        if (!o.cl) return !stone;
        const show = !stone && prog > 0.55;
        [o.cl.aA, o.cl.A, o.cl.aB, o.cl.B].forEach(g => g.setVisible(show));
        o.cl.rock.setVisible(false);
        if (!show) return !stone;
        const X0 = (dx) => bx + dir * dx, sA = [X0(60), floor - 104], sB = [X0(16), floor - 80];
        // nishonlar (qo'l uchi va burchagi - o'ngga qaragandagi; ko'zgu - pastda)
        let tA = [108, -170, -70, 0], tB = [58, -52, 8, 1];
        const pinch = [...O.areaMap.values()].find(a => a.k === 'pinch:crab');
        if (st === 'pinchw' || st === 'pinch') {
            const px = pinch ? pinch.x + pinch.w / 2 : bx + dir * 220, py = pinch ? pinch.y + pinch.h - 34 : floor - 40;
            const rx = (px - bx) * dir - 34, ry = py - floor;
            tB = [Math.max(60, rx), ry, Math.atan2(ry - (-80), Math.max(30, rx - 16)) * 57.3, st === 'pinch' ? 1 : 0];
        }
        if (st === 'lift') tA = el < 450 ? [150, -24, 70, 0] : [150, -30, 64, 1];
        if (st === 'throw') tA = [70, -232, -100, 1];
        if (!stone && st === 'idle') { const k = Math.sin(now / 600); tA[1] += k * 6; tA[2] += k * 6; if (Math.floor(now / 1300) % 3 === 0) tA[3] = 1; }
        const lerp = (h, t) => h ? { x: h.x + (t.x - h.x) * 0.3, y: h.y + (t.y - h.y) * 0.3, a: h.a + (t.a - h.a) * 0.3 } : t;
        const toW = (tt) => ({ x: X0(tt[0]), y: floor + tt[1], a: tt[2] });
        o.cl.hA = lerp(o.cl.hA, toW(tA)); o.cl.hB = lerp(o.cl.hB, toW(tB));
        const putClaw = (arm, img, s, h, fr) => {
            const ang = (dir < 0 ? 180 - h.a : h.a) * Math.PI / 180;
            arm.setPosition(s[0], s[1]).setSize(Math.max(6, Math.hypot(h.x - s[0], h.y - s[1])), 22).setRotation(Math.atan2(h.y - s[1], h.x - s[0]));
            img.setTexture(A().enemyKey(TEX.bogclaw, fr)).setPosition(h.x, h.y).setRotation(ang).setFlipY(dir < 0);
        };
        putClaw(o.cl.aA, o.cl.A, sA, o.cl.hA, tA[3]); putClaw(o.cl.aB, o.cl.B, sB, o.cl.hB, tB[3]);
        if (st === 'lift' && el > 450) { const a = (dir < 0 ? 180 - o.cl.hA.a : o.cl.hA.a) * Math.PI / 180; o.cl.rock.setVisible(true).setPosition(o.cl.hA.x + Math.cos(a) * 70, o.cl.hA.y + Math.sin(a) * 70); }
        return true;
    }
    // krab tosh bo'lib yotganda ustidagi ko'rinmas pog'ona (crabtop) - qattiq; uyg'ongach yo'qoladi.
    // TOSH-QOBIQLAR (crabshell) va krab hali yo'q paytdagi o'rni - krabning tosh holatidagi rasmi bilan aynan bir xil (qaysi biri krab - bilinmaydi)
    function shellImg(p) {
        if (!TEX.bogcrab) return O.scene.add.image(p.x + 65, p.y + CR_TOP + 8, 'bm_p_bogrock').setOrigin(0.5, 1).setDepth(2.6).setDisplaySize(150, 72);   // zaxira (rasm yo'q)
        const im = O.scene.add.image(p.x + 40 + CR_DX + CR_IMG, p.y + CR_TOP + CR_SINK, A().enemyKey(TEX.bogcrab, 3)).setOrigin(0.5, 1).setDepth(2.6);
        im.setCrop(0, 0, im.width, im.height - CR_SINK);
        return im;
    }
    function crabTops() {
        if (!O.crabTopIdx) O.crabTopIdx = W.plats.map((p, i) => p.k === 'crabtop' ? i : -1).filter(i => i >= 0);
        if (!O.crabTopIdx.length) return;
        const crab = enemyFind(e => e.k === 'bogcrab'), awake = !!crab && crab.bs !== 'stone';
        O.crabTopIdx.forEach((i) => { const b = O.bodies.get(i); if (b && b.body) b.body.enable = !awake; });
        // qobiqlar: krab rasmi yuklanguncha kutadi (4 s dan keyin ham yo'q bo'lsa - zaxira tosh; rasm keyin kelsa - almashtiriladi)
        const now = O.scene.time.now; if (!O.crabWaitAt) O.crabWaitAt = now;
        if (!TEX.bogcrab && now - O.crabWaitAt < 4000) return;
        if (O.shellImgs && O.shellFb && TEX.bogcrab) { [...O.shellImgs, ...O.crabStandIn].forEach(im => im.destroy()); O.shellImgs = O.crabStandIn = null; }
        if (!O.shellImgs) { O.shellFb = !TEX.bogcrab; O.shellImgs = W.plats.filter(p => p.k === 'crabshell').map(shellImg); O.crabStandIn = O.crabTopIdx.map(i => shellImg(W.plats[i])); }
        O.crabStandIn.forEach(im => im.setVisible(!crab));   // krab hali chiqmagan / o'ldirilgan - o'rnida ham tosh turadi
    }

    // ===== BALOT MAGI - TINCH QO'SHNI (yengilgandan keyin): gullariga suv quyadi, qozonda ichimlik qaynatadi, suhbat (simpatiya),
    // simpatiya 4+ - kelganda quchoqlab kutib oladi, 6+ - arg'imchoqqa o'tqazib uchirish mumkin. Klientda (har o'yinchi o'zinikini ko'radi)
    const PM = { HUG: 4, SWING: 6, walk: 55, rope: 96, INV_SYM: 20, INV_F: 10 };   // INV_* - fermaga taklif sharti (server MAGE.inviteSym / inviteFlowers bilan bir xil)
    // fermaga ko'chishga tayyorlik: do'stlik va berilgan gullar (xabarlarda ko'rsatiladi - o'yinchi nima yetishmayotganini bilsin)
    const mageReady = () => !!O && pmSym() >= PM.INV_SYM && pmFlowers() >= PM.INV_F;
    const mageProg = () => t('big_mage_prog').replace('{s}', Math.min(PM.INV_SYM, pmSym())).replace('{f}', Math.min(PM.INV_F, pmFlowers()));
    const pmSym = () => Math.max(O.mageSym || 0, (O.myBuffs && O.myBuffs.q && O.myBuffs.q.mage) || 0);
    // dushman qidirish - har kadr yangi massiv yaratmasdan (Map ustida to'g'ridan-to'g'ri)
    function enemyFind(fn) { if (!O) return undefined; for (const e of O.enemies.values()) if (fn(e)) return e; return undefined; }
    function peaceMageZone() { const z = mageZ(); return z && (O.paidZones || []).includes(z.id) && !enemyFind(e => e.k === 'swampmage') ? z : null; }
    const mageOpts = () => ({ elfName: t('big_e_swampmage'), elfFace: TEX.swampface ? A().enemyKey(TEX.swampface, 0) : undefined });
    const pmQ = () => (O.myBuffs && O.myBuffs.q) || {};
    const pmFlowers = () => Math.max(O.mageF || 0, pmQ().magef || 0);
    const pmHome = () => !!(O.mageHome || pmQ().magehome);
    // SUHBAT (magetalk.js): 4 variantli tugunlar; harakatlar - ko'tarish, arg'imchoq, quchoq, aylanish, raqs, sehr, fermaga taklif
    function mageTalk(z) {
        const sym = pmSym(), f = pmFlowers(), MT = window.MageTalk;
        if (!MT) return;
        O.pmTalk = true;
        MT.run(X, 'swamp', { sym, f, canInvite: sym >= PM.INV_SYM && f >= PM.INV_F && !pmHome(), name: t('big_e_swampmage'), face: mageOpts().elfFace,
            onAct: (act, done) => {
                const pm = O.pm, now = O.scene.time.now;
                if (!pm) { done(); return; }
                if (act === 'swing') { pm.go = 'swing'; showToast(t('mg_swing_yes')); done(); return; }
                if (act === 'invite') { X.socket.emit('bigAct', { roomId: X.roomId(), act: 'mageinvite', arg: z.id }); done(); return; }
                MT.FX.start(pm, act, now);
                if (act === 'hug') X.sfx('pop', 0.6);
                O.scene.time.delayedCall((MT.FX.MS[act] || 2000) + 150, () => { if (O) done(); });
            },
            onEnd: () => { O.pmTalk = false; X.socket.emit('bigAct', { roomId: X.roomId(), act: 'mage', arg: z.id }); } });
    }
    // botqoqdagi bog': gul to'shaklari yonida (birinchisidan chapda boshlanadi)
    // Balot Magi maydoni va uning bezaklari (arg'imchoq, gulzor, qozon) - o'zgarmaydi: bir marta topiladi (har kadr qidirilmasin)
    const mageZ = () => (O.mageZ !== undefined ? O.mageZ : (O.mageZ = (W.zones || []).find(q => q.boss === 'swampmage') || null));
    function mageProp(k) {
        const z = mageZ(); if (!z) return undefined;
        if (!O.mageProps) O.mageProps = {};
        if (!(k in O.mageProps)) { const g = z.y1 - 60; O.mageProps[k] = W.props.find(p => p.k === k && p.x > z.x0 - 250 && p.x < z.x1 + 250 && Math.abs(p.y - g) < 12); }
        return O.mageProps[k];
    }
    function pmGardenX(i) { const z = mageZ(), C = z ? (z.x0 + z.x1) / 2 : 0; return C - 650 + (i % 7) * 24 + (i >= 7 ? 12 : 0); }
    function updatePeaceMage(scene, now) {
        const z = peaceMageZone(), hero = X.hero();
        const far = !z || !hero || Math.abs(hero.x - (z.x0 + z.x1) / 2) > 1500 || Math.abs(hero.y - (z.y1 - 60)) > 800;
        const gone = pmHome();   // fermaga ko'chib ketgan
        if (O.pm && (far || !TEX.swampact || gone)) { O.pm.img.setVisible(false); O.pm.g.clear(); if (O.pm.item) O.pm.item.setVisible(false); if (window.MageTalk) MageTalk.FX.liftHero(hero, O.pm, now, 0, 0); if (!z || !hero || Math.abs(hero.x - (z.x0 + z.x1) / 2) > 2200) O.pm.hugged = false; }
        if (far || !TEX.swampact || gone) return;
        const g = z.y1 - 60, C = (z.x0 + z.x1) / 2, dt = Math.min(0.05, scene.game.loop.delta / 1000);
        if (!O.pm) O.pm = { x: C, f: 1, act: 'walk', task: 0, until: 0, img: scene.add.image(C, g, A().enemyKey(TEX.swampact, 14)).setDepth(2.6), g: pixelize(scene.add.graphics()).setDepth(2.58), sw: { ang: 0, vel: 0, seated: false, until: 0 }, hugged: false, go: null };
        const pm = O.pm, sw = pm.sw, swing = mageProp('swingframe'), bed = mageProp('flowerbed'), pot = mageProp('cauldron');
        // ARG'IMCHOQ: ustunlar - rasm (prop), o'rindiq va arqonlar - shu yerda (tebranadi)
        const top = swing ? { x: swing.x, y: g - 46 * 3 + 6 } : null;
        sw.vel += -Math.sin(sw.ang) * 7 * dt; sw.vel *= Math.pow(0.6, dt); sw.ang = Math.max(-1.1, Math.min(1.1, sw.ang + sw.vel * dt));
        const seat = top ? { x: top.x + Math.sin(sw.ang) * PM.rope, y: top.y + Math.cos(sw.ang) * PM.rope } : null;
        pm.g.clear();
        if (seat) { pm.g.lineStyle(2, 0x8d6e63, 1); pm.g.lineBetween(top.x - 22, top.y, seat.x - 22, seat.y); pm.g.lineBetween(top.x + 22, top.y, seat.x + 22, seat.y); pm.g.fillStyle(0x5d4037, 1); pm.g.fillRect(seat.x - 28, seat.y - 2, 56, 7); pm.g.fillStyle(0x8d6e63, 1); pm.g.fillRect(seat.x - 28, seat.y - 2, 56, 2); }
        const talking = O.pmTalk && X.dialogOpen && X.dialogOpen();
        if (O.pmTalk && !talking) O.pmTalk = false;
        const sym = pmSym(), hx = hero.x, feet = hero.y + 24;
        let fr = 24, x = pm.x, y = g + 1, ang = 0;
        const walkTo = (tx, k = 1) => { const d = tx - pm.x; if (Math.abs(d) < 4) return true; pm.f = d < 0 ? -1 : 1; pm.x += Math.sign(d) * Math.min(Math.abs(d), PM.walk * k * dt); fr = MG_WALK(now, k); return false; };
        if (sw.seated && seat) {
            x = seat.x; y = seat.y + MG_SEAT(); ang = sw.ang * 57.3 * 0.6; pm.x = seat.x; fr = sw.vel * (pm.f || 1) >= 0 ? 22 : 23;   // o'tirgan kadr: oldinga uchsa - oyoqlar pastda, orqaga - oyoqlar bukilgan
            if (now > sw.until || Math.abs(hx - top.x) > 700) { sw.seated = false; pm.x = top.x - 60; }
        } else if (window.MageTalk && MageTalk.FX.on(pm, now)) { if (pm.fx.k !== 'joy' && pm.fx.k !== 'plant') pm.f = hx < pm.x ? -1 : 1; }   // harakat paytida - joyida
        else if (pm.plant && window.MageTalk) {   // gulni hidlab bo'ldi - bog'dagi navbatdagi joyga borib ekadi
            if (walkTo(pmGardenX(Math.max(0, pmFlowers() - 1)) - 52, 1.6)) { pm.f = 1; pm.plant = false; MageTalk.FX.start(pm, 'plant', now, { item: 'flower' }); }
        }
        else if (talking) { pm.f = hx < pm.x ? -1 : 1; if (Math.abs(hx - pm.x) > 320) { X.closeDialog(); O.pmTalk = false; } }   // uzoqlashdi - suhbat tugadi
        else if (pm.act === 'hug' && now < pm.until) { const he = 2400 - (pm.until - now); fr = he < 320 ? 16 : Math.floor((he - 320) / 480) % 2 ? 18 : 17; pm.f = hx < pm.x ? -1 : 1; if (Math.random() < 0.25) puff(pm.x + Phaser.Math.Between(-30, 30), g - 100 - Math.random() * 40, 0xff6fb0, 2); }
        else if (!pm.hugged && sym >= PM.HUG && Math.abs(hx - pm.x) < 420 && Math.abs(feet - g) < 140 && !hero.isDead) {
            // QUCHOQLAB KUTIB OLADI
            if (walkTo(hx - (hx < pm.x ? -1 : 1) * 40)) { pm.hugged = true; pm.f = hx < pm.x ? -1 : 1; if (window.MageTalk) MageTalk.FX.start(pm, 'hug', now); else { pm.act = 'hug'; pm.until = now + 2400; } showToast(t('mg_hug')); X.sfx('pop', 0.6); puff(pm.x, g - 90, 0xff6fb0, 14); }   // ko'tarib bag'riga bosadi (magetalk.js liftHero)
        } else if (pm.go === 'swing' && top) {
            if (walkTo(top.x, 3)) { pm.go = null; sw.seated = true; sw.until = now + 25000; sw.vel = 0.4; }   // taklif qilinganda - xursand, yugurib keladi
        } else {
            // KUNDALIK ISHLAR: gullarga suv -> qozon -> bir oz dam
            const tasks = [{ x: bed ? bed.x + 60 : C - 300, act: 'water', ms: 6500 }, { x: pot ? pot.x - 46 : C + 150, act: 'stir', ms: 6500 }, { x: C, act: 'idle', ms: 3500 }];
            const task = tasks[pm.task % 3];
            if (pm.act === 'walk' || pm.act === 'hug') { pm.act = 'walk'; if (walkTo(task.x)) { pm.act = task.act; pm.until = now + task.ms; pm.f = task.act === 'water' ? -1 : 1; } }
            else if (now > pm.until) { pm.task++; pm.act = 'walk'; }
            if (pm.act === 'water') { const we = 6500 - (pm.until - now); fr = we < 350 ? 19 : Math.floor(we / 420) % 2 ? 21 : 20; if (fr !== 19 && Math.random() < 0.35) { const sx = pm.x + pm.f * 38, d = scene.add.rectangle(sx, g - 54, 3, 4, 0x81d4fa).setDepth(2.7); scene.tweens.add({ targets: d, y: g - 4, x: sx + pm.f * 10, alpha: 0.2, duration: 500, onComplete: () => d.destroy() }); } }
            else if (pm.act === 'stir') { fr = [44, 45, 46, 45][Math.floor(now / 260) % 4]; if (pot && Math.random() < 0.15) puff(pot.x + Phaser.Math.Between(-14, 14), g - 50, 0x9cff6e, 2); }
            x = pm.x;
        }
        if (!(sw.seated && seat)) x = pm.x;
        // HARAKAT / QUVONCH (sovg'a, aylanish, raqs, sehr, quchoq, ko'tarish) - oddiy kadrdan ustun
        let flip = pm.f;
        const MT = window.MageTalk, fxp = MT && !(sw.seated && seat) ? MT.FX.pose(scene, pm, now, pm.x, g - 158, 2.6) : null;
        if (fxp) { fr = fxp.fr; x = pm.x + fxp.dx; y = g + 1 + fxp.dy; ang = fxp.ang; if (fxp.flip) flip = -pm.f; if (pm.fx.k === 'lift' || pm.fx.k === 'hug') pm.f = hx < pm.x ? -1 : 1; }
        if (MT) MT.FX.liftHero(hero, pm, now, pm.x + pm.f * 6, g - 158);
        mageFrame(pm.img, x, y, flip, fr); pm.img.setAngle(ang).clearTint().setDepth(2.6);
        // sovg'a - qo'lida (hidlaydi / yeydi) yoki yerda (ekyapti)
        const ip = fxp && MT ? MT.FX.itemAt(pm, now, x, y, flip) : null, it = ip ? 'held_' + pm.fx.item : null;
        if (it && !scene.textures.exists(it) && window.FarmArt && !(scene.textures.__heldReq || {})[it]) { (scene.textures.__heldReq = scene.textures.__heldReq || {})[it] = 1; scene.textures.addBase64(it, FarmArt.cropIcon(pm.fx.item)); }
        if (it && scene.textures.exists(it)) { if (!pm.item) pm.item = scene.add.image(0, 0, it).setDepth(2.62); pm.item.setTexture(it).setVisible(true).setPosition(ip.x, ip.y).setScale(ip.sc).setAngle(ip.ang); }
        else if (pm.item) pm.item.setVisible(false);
        // BOG': magga berilgan gullar gul to'shaklari oldida o'sib turadi (ekilayotgani - hali yo'q)
        if (MT) { const nF = Math.min(14, pmFlowers() - (pm.plant || (pm.fx && (pm.fx.k === 'plant' || pm.fx.k === 'smell')) ? 1 : 0)); MT.FX.garden(scene, pm.garden || (pm.garden = {}), Math.max(0, nF), pmGardenX, g, 2.57); }
    }
    // ALTER QOR BOBO va MUZ XOKKEYCHI (rasmdan): holatga qarab egiladi / siltanadi / cho'kadi (oyoq ostidan aylanadi), yurganda chayqaladi
    function drawImgBoss(scene, o, now) {
        const B = BOSS_IMG[o.k], dir = o.f < 0 ? -1 : 1, moving = Math.abs(o.tx - o.x) > 0.6, st = o.k === 'santa' ? (o.m || o.bs || '') : (o.bs || '');
        if (st !== o.pst) { o.pst = st; o.stAt = now; }
        const el = now - (o.stAt || now), ease = (v) => v * v * (3 - 2 * v);
        let ang = 0, sx = 1, sy = 1, dy = 0, dx = 0, fr = 0;
        if (o.k === 'santa') {
            if (st === 'arrive') { fr = 3; ang = Math.sin(now / 90) * 5; }                                                                                          // chanadan sakrab tushmoqda: qo'li tepada
            else if (st === 'swind') { fr = 2; const k = ease(Math.min(1, el / 500)); ang = -dir * 6 * k; sy = 1 - 0.04 * k; }                                    // qor to'piga tayyorlanish: orqaga, qo'li oldinga
            else if (st === 'sroll') { fr = 2; const k = Math.min(1, el / 160); ang = dir * 8 * (1 - Math.max(0, (el - 300) / 600)) * k; dx = dir * 6 * k; }       // itaradi: oldinga
            else if (st === 'bwind') { fr = 3; const k = ease(Math.min(1, el / 600)); ang = -dir * 7 * k; }                                                       // xaltadan sovg'ani olib ko'taradi
            else if (st === 'sbag') { fr = el < 220 ? 3 : 2; ang = dir * 6 * Math.min(1, el / 140) * (1 - Math.min(1, Math.max(0, el - 250) / 500)); }           // otadi: qo'li tepadan oldinga
            else if (st === 'rest') { fr = 4; sy = 0.98 + 0.02 * Math.sin(now / 260); if (Math.random() < 0.05) puff(o.x + dir * 18, o.y - 104, 0xd8e0ea, 2); }   // charchagan: bug'
            else { sy = 1 + 0.015 * Math.sin(now / 420); if (moving) { fr = Math.floor(now / 170) % 2; dy = -Math.abs(Math.sin(now / 170 * Math.PI / 2)) * 2; } }
        } else {
            if (st === 'swind') { fr = 4; const k = ease(Math.min(1, el / 300)); ang = -dir * 4 * k; }                                                            // cho'kib, klyushka uchida shayba chaqiradi
            else if (st === 'hwind') { fr = 2; const k = ease(Math.min(1, el / 300)); ang = -dir * 6 * k; dx = -dir * 3 * k; }                                    // klyushka tepada
            else if (st === 'hit' || st === 'slap') { fr = 3; const k = Math.min(1, el / 90); ang = dir * 8 * k * (1 - Math.min(1, Math.max(0, el - 150) / 250)); dx = dir * 6 * k; }   // urib bo'ldi
            else if (moving) { fr = Math.floor(now / 220) % 2; ang = dir * 3; if (Math.random() < 0.25) puff(o.x - dir * 20, o.y - 2, 0xe1f5fe, 1); }             // sirpanish: qadam, muz changi
            else sy = 1 + 0.012 * Math.sin(now / 380);
        }
        o.ang2 = Phaser.Math.Linear(o.ang2 || 0, ang, 0.35);
        const flip = dir < 0, ox = flip ? 1 - B.ox : B.ox;
        o.img.setVisible(true).setTexture(A().enemyKey(TEX[o.k], fr)).setOrigin(ox, 1).setPosition(o.x + dx, o.y + 1 + dy).setFlipX(flip).setScale(sx, sy).setAngle(o.ang2);
        if (o.fl) o.img.setTintFill(0xffffff); else if (o.v) o.img.setTint(0xfff59d); else if (o.r && Math.floor(now / 200) % 2) o.img.setTint(0xff8a80); else o.img.clearTint();
        const vis = o.u === 3 ? 0.12 : 1; o.img.setAlpha(Phaser.Math.Linear(o.img.alpha, vis, 0.25));
    }
    // FIERY HOOVES: holatga qarab kadr; chopganda oldinga engashadi, tuyoq bilan urishda sakrab tushadi, atrofida uchqunlar
    function drawFiery(scene, o, now) {
        const dir = o.f < 0 ? -1 : 1, moving = Math.abs(o.tx - o.x) > 0.6, st = o.bs || '';
        if (st !== o.pst) { o.pst = st; o.stAt = now; }
        const el = now - (o.stAt || now);
        let fr = 0, ang = 0, sy = 1, dy = 0;
        if (st === 'stomp') { fr = 3; dy = -Math.round(Math.max(0, Math.sin(Math.min(1, (el % 600) / 420) * Math.PI)) * 6); }
        else if (st === 'cwind') { fr = 5; ang = dir * 2 * Math.min(1, el / 300); }
        else if (st === 'charge') { fr = Math.floor(now / 90) % 2 ? 4 : 7; ang = dir * 3; if (Math.random() < 0.5) puff(o.x - dir * 50, o.y - 4, 0x8d6e63, 2); }
        else if (st === 'kwind') fr = 5;
        else if (st === 'kick') { fr = 5; ang = -dir * 6 * (1 - Math.min(1, el / 340)); }
        else if (st === 'swind' || st === 'shoot') fr = 6;
        else if (st === 'rest') { sy = 0.98 + 0.02 * Math.sin(now / 200); }
        else if (moving) fr = 1 + Math.floor(now / 140) % 2;
        else sy = 1 + 0.012 * Math.sin(now / 380);
        o.ang2 = Phaser.Math.Linear(o.ang2 || 0, ang, 0.35);
        o.img.setVisible(true).setTexture(A().enemyKey(TEX.fieryhooves, fr)).setOrigin(0.5, 1).setPosition(o.x, o.y + 1 + dy).setFlipX(dir < 0).setScale(1, sy).setAngle(o.ang2);
        if (o.fl) o.img.setTintFill(0xffffff); else if (o.r && Math.floor(now / 200) % 2) o.img.setTint(0xff8a80); else o.img.clearTint();
        o.img.setAlpha(Phaser.Math.Linear(o.img.alpha, 1, 0.25));
        if (Math.random() < 0.18) puff(o.x - dir * 64 + (Math.random() - 0.5) * 20, o.y - 110, 0xff7a1a, 1);   // dumdan uchqun
    }
    function drawKraken(scene, o, now) {
        const L = lakeAt(o.x, o.y);
        o.surf = L ? L.y : o.y + 186;
        if (!o.kr) {
            o.img.setVisible(false);
            const kr = { tent: pixelize(scene.add.graphics()).setDepth(-1.14), body: scene.add.image(o.x, o.y, 'bm_kr_body').setOrigin(0.511, 0.808).setDepth(-1.15),
                glow: pxDisc(scene, o.x, o.y, 54, 54, 0xff1744, 0.35).setDepth(-1.13).setBlendMode(Phaser.BlendModes.ADD), eye: scene.add.image(o.x, o.y, 'bm_kr_eye').setDepth(-1.12) };
            scene.tweens.add({ targets: kr.glow, alpha: 0.6, scale: 1.2, duration: 700, yoyo: true, repeat: -1 });
            o.kr = kr; o.extra = [kr.tent, kr.body, kr.glow, kr.eye];
            if (X.hero() && Math.abs(X.hero().x - o.x) < 1500) showToast(t('big_kr_eye'));
        }
        krPose(o.kr, o.x, o.y - 40, o.surf, now, o.fl && Math.floor(now / 60) % 2, o.r);
    }
    // tana va ko'z (ko'z markazi - ex, ey); suv ostidagi qismi ko'rinmaydi; qo'llar tanadan suvga osilib chayqaladi
    function krPose(kr, ex, ey, surf, now, flash, rage) {
        const wl = surf + 4;
        kr.body.setPosition(ex, ey); kr.eye.setPosition(ex, ey); kr.glow.setPosition(ex, ey);
        const bTop = ey - 0.808 * kr.body.height, eTop = ey - kr.eye.height / 2;
        kr.body.setCrop(0, 0, kr.body.width, Math.max(0, Math.min(kr.body.height, wl - bTop)));
        kr.eye.setCrop(0, 0, kr.eye.width, Math.max(0, Math.min(kr.eye.height, wl - eTop)));
        kr.glow.setVisible(ey < surf - 20);
        if (flash) kr.eye.setTintFill(0xffffff); else kr.eye.clearTint();
        if (rage && Math.floor(now / 220) % 2) kr.body.setTint(0xff8a80); else kr.body.clearTint();
        kr.tent.clear();
        if (ey + 60 < surf) for (let k = 0; k < 6; k++) {
            const bx = ex - 90 + k * 36, pts = [], top = ey + 60;
            for (let i = 0; i <= 12; i++) { const y = top + i * ((surf + 14 - top) / 12); pts.push([bx + Math.sin(now / 380 + k * 1.3 + i * 0.5) * (6 + i * 1.6) + (k - 2.5) * i * 2.4, y]); }
            tentacle(kr.tent, pts, 34, 16);
        }
    }
    // yengilgan kraken: sekin cho'kadi, atrofida suv sachraydi
    function drawSinks(scene, now) {
        O.sinks = O.sinks.filter((s) => {
            const k = (now - s.at) / 2600;
            if (k >= 1) { [s.kr.tent, s.kr.body, s.kr.glow, s.kr.eye].forEach(g => g.destroy()); return false; }
            const ey = s.ey + (s.surf + 420 - s.ey) * k * k;
            krPose(s.kr, s.x, ey, s.surf, now, false, false);
            if (Math.random() < 0.3) puff(s.x + Phaser.Math.Between(-140, 140), s.surf, 0x80deea, 3);
            return true;
        });
    }
    // GROTO PLATFORMASI: titraydi (qizil), tepaga otiladi, shiftda turadi, asta qaytadi; rasm va jism birga (ustidagi qahramon ko'tariladi)
    // GORILA ROCK ZALI (S1 map-8 aynan): orqa devor (tosh kataklar, shift qirrasi, ko'kish nurli eshik), g'or poli, to'rtta lipillovchi mash'ala (S1 joylarida)
    function drawGrotto(scene) {
        const hero = X.hero(); if (!hero) return;
        (W.zones || []).forEach((z) => {
            if (z.boss !== 'gorilla' || !z.gp || (O.grotto || (O.grotto = new Set())).has(z.id)) return;
            if (Math.abs(hero.x - (z.x0 + z.x1) / 2) > 2600 || Math.abs(hero.y - z.y1) > 1800) return;
            O.grotto.add(z.id);
            const gx0 = z.x0 - 10, GW = z.x1 - z.x0 + 20, fl = z.y1 - 40, ceil = z.y0 - 10, H = fl - ceil, SX = GW / 800;
            scene.add.image(gx0, ceil, A().hallTex(scene, 'bm_ghall_' + GW + '_' + H, GW, H)).setOrigin(0, 0).setDepth(-1.16);
            if (scene.textures.exists('bm_gfloor')) scene.add.tileSprite(gx0, fl, GW, scene.textures.get('bm_gfloor').getSourceImage().height, 'bm_gfloor').setOrigin(0, 0).setDepth(-1.15);
            [[250, 150], [550, 150], [30, 300], [770, 300]].forEach(([sx, sy]) => {
                const x = gx0 + Math.round(sx * SX), y = fl - (570 - sy);
                const glow = pxDisc(scene, x, y, 26, 26, 0xff9100, 0.18).setDepth(-1.14);
                scene.tweens.add({ targets: glow, alpha: 0.06, scale: 1.2, duration: 220 + Math.random() * 200, yoyo: true, repeat: -1 });
                scene.add.rectangle(x, y + 14, 6, 18, 0x4e342e).setDepth(-1.14);
                const fl2 = scene.add.rectangle(x, y, 8, 12, 0xffca28).setDepth(-1.14);
                scene.tweens.add({ targets: fl2, scaleY: 1.4, duration: 150, yoyo: true, repeat: -1 });
            });
        });
    }
    // S1 gorilla effektlari: chang bo'laklari, shiftdan to'kiladigan toshchalar
    function gDust(scene, x, y, n, col = 0x9e9e9e) {
        for (let k = 0; k < n; k++) {
            const d = scene.add.rectangle(x + Phaser.Math.Between(-30, 30), y, 8, 8, col, 0.8).setDepth(3.4);
            scene.tweens.add({ targets: d, x: d.x + Phaser.Math.Between(-50, 50), y: y - Phaser.Math.Between(10, 60), alpha: 0, scale: 2, duration: Phaser.Math.Between(400, 800), onComplete: () => d.destroy() });
        }
    }
    function gPebbles(scene, x, y, n) {
        const z = (W.zones || []).find(q => q.boss === 'gorilla' && x > q.x0 - 40 && x < q.x1 + 40 && y > q.y0 - 60 && y < q.y1 + 80); if (!z) return;
        for (let k = 0; k < n; k++) {
            const pb = scene.add.rectangle(Phaser.Math.Between(z.x0 + 10, z.x1 - 10), z.y0 - 10, 4, 4, 0x72727a).setDepth(3.3);
            scene.tweens.add({ targets: pb, y: z.y1 - 40, duration: Phaser.Math.Between(700, 1200), delay: Phaser.Math.Between(0, 300), onComplete: () => pb.destroy() });
        }
    }
    // holat almashganda bir martalik: baqiriq - halqalar va toshchalar; itarish - ikki tomonga tezlik chiziqlari va chang; zarba - kuchli silkinish, chang
    function gorillaFx(scene, o, m) {
        const gx = o.x, fl = o.ty;
        if (m === 'roar') {
            X.sfxAt('roar', gx, 1); scene.cameras.main.shake(400, 0.006);
            for (let k = 0; k < 3; k++) { const ring = scene.add.circle(gx, fl - 100, 20, 0xffffff, 0).setStrokeStyle(4, 0xffe0b2, 0.9).setDepth(3.4); scene.tweens.add({ targets: ring, scale: 6, alpha: 0, delay: k * 140, duration: 500, onComplete: () => ring.destroy() }); }
            gPebbles(scene, gx, fl, 6);
        } else if (m === 'push') {
            X.sfxAt('whoosh', gx, 1); scene.cameras.main.shake(250, 0.01);
            [-1, 1].forEach((dir) => {
                for (let k = 0; k < 4; k++) { const ln = scene.add.rectangle(gx + dir * 70, fl - 70 + k * 18, 40, 4, 0xffffff, 0.8).setDepth(3.4); scene.tweens.add({ targets: ln, x: gx + dir * 300, alpha: 0, scaleX: 3, duration: 280, onComplete: () => ln.destroy() }); }
                gDust(scene, gx + dir * 90, fl - 4, 5);
            });
        } else if (m === 'slam') {
            X.sfxAt('explosion', gx, 0.7); scene.cameras.main.shake(450, 0.018);
            gDust(scene, gx - 60, fl - 4, 7); gDust(scene, gx + 60, fl - 4, 7);
            gPebbles(scene, gx, fl, 10);
        }
    }
    function drawCrush(now) {
        O.crush.forEach((c, i) => {
            const p = W.plats[i], base = p.y, t = (now - c.at) / 1000;
            let y = base, jx = 0;
            if (c.st === 'shake') { jx = Math.round(Math.sin(now / 25) * 3); }
            else if (c.st === 'launch') y = Math.max(c.ceil, (c.y0 !== undefined ? c.y0 : (c.y0 = base)) - c.v * t);
            else if (c.st === 'hold') y = c.ceil;
            else if (c.st === 'back') y = Math.min(base, c.ceil + c.v * t);
            if (c.st === 'idle' || t > 8) y = base;
            const im = O.platImg.get(i); if (im && im.active) { im.setPosition(p.x - 4 + jx, y - 4); if (c.st === 'shake' && Math.floor(now / 90) % 2) im.setTint(0xff8a65); else im.clearTint(); }
            const b = O.bodies.get(i); if (b && b.active) { b.setPosition(p.x + p.w / 2, y + p.h / 2); b.body.updateFromGameObject(); }
            O.solids[i].y = y;
            // S1 dagidek: otilish boshlanganda ustida turgan bo'lsam - platformaga "yopishaman", shiftga yetganda ezilaman (server o'ldiradi)
            const h = X.hero();
            if (h && h.body) {
                if (c.st === 'launch' && c.ride === undefined) c.ride = !h.isDead && h.x > p.x - 6 && h.x < p.x + p.w + 6 && Math.abs(h.y + 24 - base) < 16;
                if (c.ride && (c.st === 'launch' || c.st === 'hold') && !h.isDead) h.body.reset(h.x, y - 24 * h.scaleY);
                if (c.ride && c.st === 'hold' && c.sy0 === undefined) { c.sy0 = h.scaleY; h.scaleY = c.sy0 * 0.3; h.setTint(0xff5252); O.scene.cameras.main.flash(200, 255, 60, 60); }
                if (c.ride && (c.st === 'back' || c.st === 'idle' || t > 8)) { c.ride = false; if (c.sy0 !== undefined) { h.scaleY = c.sy0; h.clearTint(); } }
            }
            if (c.st === 'idle' || t > 8) O.crush.delete(i);
        });
    }
    // ===== PORTALLAR =====
    const PORTAL_COL = { elf: 0xffc35a, forest: 0x69f0ae, snow: 0x80d8ff, lava: 0xff7043, swamp: 0xb2ff59, sky: 0x40e0ff };
    function buildPortals(scene) {
        O.portals = [];
        if (!scene.textures.exists('bm_portal')) {
            // tosh ravoq (piksel): yarim doira tepa, ikki ustun, taglik; ustunlarda nur sochuvchi bitiklar
            const g = scene.add.graphics(), P = 4, CW = 32, CHh = 44;   // (piksel tekstura - o'zi to'r bo'yicha)
            for (let y = 0; y < CHh; y++) for (let x = 0; x < CW; x++) {
                const dx = x - 15.5, dy = y - 16, d = Math.hypot(dx, dy);
                const ring = y < 16 ? d <= 16 && d >= 11 : (x < 5 || x >= 27);
                const slab = y >= 41;
                if (!ring && !slab) continue;
                const n = A().hash(x, y, 17), edge = (y < 16 && (d > 15.2 || d < 11.8)) || x === 0 || x === CW - 1 || (y >= 16 && (x === 4 || x === 27)) || y === CHh - 1;
                g.fillStyle(edge ? 0x14121a : n > 0.66 ? 0x6e6a7c : n > 0.33 ? 0x58546a : 0x48445a, 1); g.fillRect(x * P, y * P, P, P);
                if (!slab && (y >= 16 && (x === 2 || x === 29) && y % 5 === 1)) { g.fillStyle(0xe1f5fe, 1); g.fillRect(x * P, y * P, P, P * 2); }
            }
            g.generateTexture('bm_portal', CW * P, CHh * P); g.destroy();
        }
        (W.portals || []).forEach((p) => {
            const key = 'bm_portal_in_' + p.loc, col = PORTAL_COL[p.loc] || 0xb388ff;
            if (!scene.textures.exists(key)) {
                const ct = scene.textures.createCanvas(key, 88, 136), c = ct.getContext(), P = 4, mix = (a, b, k) => { const ch = (sh) => Math.round(((a >> sh) & 255) * (1 - k) + ((b >> sh) & 255) * k); return (ch(16) << 16) | (ch(8) << 8) | ch(0); };
                for (let y = 0; y < 34; y++) for (let x = 0; x < 22; x++) {
                    const dx = (x + 0.5 - 11) / 11, dy = (y + 0.5 - 17) / 17, d = Math.hypot(dx, dy); if (d > 1) continue;
                    const a = Math.atan2(dy, dx), arm = (Math.sin(a * 3 - d * 9) + 1) / 2, dith = A().hash(x, y, 5) * 0.12;
                    let v = d < 0.18 ? 0xffffff : d < 0.55 ? mix(0xffffff, col, (d - 0.18) / 0.37) : mix(col, 0x28104a, (d - 0.55) / 0.45);
                    if (d > 0.2 && d < 0.92 && arm + dith > 0.82) v = mix(v, 0xffffff, 0.5);   // aylanma qo'llar
                    c.fillStyle = '#' + v.toString(16).padStart(6, '0'); c.globalAlpha = d > 0.9 ? 0.75 : 0.95; c.fillRect(x * P, y * P, P, P);
                }
                c.globalAlpha = 1; ct.refresh();
            }
            const inner = scene.add.image(p.x, p.y - 84, key).setDepth(-0.47).setBlendMode(Phaser.BlendModes.ADD);
            const frame = scene.add.image(p.x, p.y + 2, 'bm_portal').setOrigin(0.5, 1).setDepth(-0.46);
            const glow = pxDisc(scene, p.x, p.y - 84, 75, 95, col, 0.12).setDepth(-0.48).setBlendMode(Phaser.BlendModes.ADD);
            const label = scene.add.text(p.x, p.y - 196, t('big_loc_' + p.loc), { fontFamily: FONT, fontSize: '8px', color: '#ffffff', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5).setDepth(-0.45);
            O.portals.push({ p, inner, frame, glow, label, col });
        });
        O.portalG = pixelize(scene.add.graphics()).setDepth(-0.44);
    }
    const portalOpen = (p) => O.got.has(p.cp);
    function drawPortals(now) {
        const g = O.portalG, cam = O.scene.cameras.main; g.clear();
        O.portals.forEach((o) => {
            const vis = Math.abs(o.p.x - (cam.scrollX + 400)) < 900;
            [o.inner, o.frame, o.glow, o.label].forEach(im => im.setVisible(vis));
            if (!vis) return;
            const open = portalOpen(o.p);
            o.inner.setAlpha(open ? 0.75 + 0.2 * Math.sin(now / 300) : 0.25).setScale(1, 1 + 0.03 * Math.sin(now / 400)).setTint(open ? 0xffffff : 0x9e9e9e);
            o.glow.setAlpha(open ? 0.1 + 0.06 * Math.sin(now / 250) : 0.03);
            o.label.setColor(open ? '#ffffff' : '#9e9e9e');
            if (!open) return;
            // ichkariga aylanib kiradigan uchqunlar
            for (let k = 0; k < 16; k++) {
                const q = ((now / 1600 + k / 16) % 1), a = k * 2.4 + now / 500, r = 1 - q;
                g.fillStyle(k % 3 ? o.col : 0xffffff, 0.9 * (1 - q * 0.6)); g.fillRect(o.p.x + Math.cos(a) * 40 * r - 1.5, o.p.y - 84 + Math.sin(a) * 60 * r - 1.5, 3, 3);
            }
        });
    }
    // to'siq rasmi: ikki ustun, X shaklidagi taxtalar, ustida "Tez kunda" taxtachasi (doim turadi - bo'laklarga bog'liq emas)
    function drawGate(scene, gt) {
        const g = pixelize(scene.add.graphics()).setDepth(-0.3), x = Math.round(gt.x), y = Math.round(gt.y);
        g.fillStyle(0x2b1b10, 1); g.fillRect(x - 30, y - 150, 10, 150); g.fillRect(x + 20, y - 150, 10, 150);   // ustunlar
        g.fillStyle(0x5d4037, 1); g.fillRect(x - 28, y - 148, 6, 146); g.fillRect(x + 22, y - 148, 6, 146);
        for (let k = 0; k < 4; k++) { const yy = y - 136 + k * 34; g.fillStyle(0x4e342e, 1); g.fillRect(x - 30, yy, 60, 12); g.fillStyle(0x795548, 1); g.fillRect(x - 30, yy, 60, 4); }   // ko'ndalang taxtalar
        g.lineStyle(6, 0x3e2723, 1); g.lineBetween(x - 26, y - 140, x + 26, y - 8); g.lineBetween(x + 26, y - 140, x - 26, y - 8);   // X
        g.fillStyle(0x1a120b, 1); g.fillRect(x - 62, y - 196, 124, 38); g.fillStyle(0xa1887f, 1); g.fillRect(x - 58, y - 192, 116, 30);   // taxtacha
        g.fillStyle(0xff7043, 0.18); g.fillRect(x - 12, y - 760, 24, 610);   // yuqoriga - xira to'siq (sakrab o'tib bo'lmaydi)
        const tx = scene.add.text(x, y - 177, t('big_loc_soon'), { fontFamily: FONT, fontSize: '8px', color: '#2b1b10', align: 'center' }).setOrigin(0.5).setDepth(-0.29);
        O.gateObjs = (O.gateObjs || []).concat([g, tx]);
    }
    function nearGate(hero) { return !!hero && (W.gates || []).some(gt => Math.abs(hero.x - gt.x) < 140 && Math.abs(hero.y + 24 - gt.y) < 220); }
    function nearPortal(hero) {
        if (!hero || hero.isDead || !W.portals) return null;
        return W.portals.find(q => Math.abs(hero.x - q.x) < 100 && Math.abs(hero.y + 24 - q.y) < 100) || null;
    }
    const portalMenuOpen = () => !!document.getElementById('bm-portal');
    function closePortalMenu() { const el = document.getElementById('bm-portal'); if (el && el.parentNode) el.parentNode.remove(); }
    function openPortalMenu(here) {
        const host = document.getElementById('game-container');
        if (!host) return;
        closePortalMenu(); closeShop(); closeMap();
        const el = document.createElement('div');
        el.id = 'shop-panel'; el.classList.add('bm-shop-panel');
        const inner = document.createElement('div'); inner.id = 'bm-portal';
        const rgb = (v) => '#' + v.toString(16).padStart(6, '0');
        const cards = (W.portals || []).map((p) => {
            const shut = (W.closed || []).includes(p.loc), open = portalOpen(p) && !shut, me = p === here;
            const btn = shut ? `<button class="shop-buy" disabled>${t('big_loc_soon')}</button>` : me ? `<button class="shop-buy" disabled>${t('big_portal_here')}</button>` : open ? `<button class="shop-buy" data-loc="${p.loc}">${t('big_portal_go')}</button>` : `<button class="shop-buy" disabled>${t('big_portal_locked')}</button>`;
            return `<div class="shop-card shop-tool"${open ? '' : ' style="opacity:.5"'}>
                <div class="shop-icon"><div style="width:34px;height:48px;margin:auto;border-radius:50% 50% 8px 8px;border:4px solid #58546a;background:radial-gradient(#fff 0,${rgb(PORTAL_COL[p.loc] || 0xb388ff)} 45%,#28104a 100%)"></div></div>
                <div class="shop-name">${t('big_loc_' + p.loc)}</div>
                <div class="shop-desc">${Math.round(p.x / 10)} m</div>${btn}</div>`;
        }).join('');
        el.innerHTML = `<div class="shop-box"><div class="shop-title">${t('big_portal_title')}</div>
            <div class="shop-sec">${t('big_portal_sub')}</div><div class="shop-cards">${cards}</div>
            <button class="shop-close">${t('big_portal_close')}</button></div>`;
        el.appendChild(inner);
        el.onpointerdown = (e) => e.stopPropagation();
        el.querySelector('.shop-close').onclick = () => el.remove();
        el.querySelectorAll('.shop-buy[data-loc]').forEach((b) => { b.onclick = () => { X.socket.emit('bigPortal', { roomId: X.roomId(), loc: b.dataset.loc }); el.remove(); }; });
        host.appendChild(el);
        X.sfx('whoosh', 0.5);
    }
    // ===== XARITA (do'kondan bir marta sotib olinadi - butun umr): butun dunyo, bosslar joyi, bosib nishon qo'yish, yo'l ko'rsatkich =====
    const hasMap = () => { const h = X && X.hero(); return !!(h && h.hasMap); };
    let mapIconUrl = null;
    // piksel o'ram-xarita ikonkasi (do'kon kartochkasi va HUD tugmasi uchun) - Phaser kerak emas
    function paintMapIcon(g) {
        const P = 4, px = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x * P, y * P, w * P, h * P); };
        px(2, 3, 12, 10, '#1a1208'); px(3, 4, 10, 8, '#e8d5a0'); px(3, 4, 10, 1, '#f6e8bd'); px(3, 11, 10, 1, '#c9b27a');
        px(1, 3, 2, 10, '#8d5a2b'); px(13, 3, 2, 10, '#8d5a2b'); px(1, 3, 2, 1, '#b07a3a'); px(13, 3, 2, 1, '#b07a3a');
        px(4, 9, 2, 1, '#6d8f3a'); px(6, 8, 3, 1, '#6d8f3a'); px(9, 9, 3, 1, '#6d8f3a'); px(5, 6, 1, 1, '#5d4037'); px(7, 7, 1, 1, '#5d4037'); px(9, 6, 1, 1, '#5d4037');
        px(10, 5, 2, 2, '#d50000'); px(10, 5, 1, 1, '#ff5252');
    }
    function mapIcon() {
        if (mapIconUrl) return mapIconUrl;
        const c = document.createElement('canvas'); c.width = 64; c.height = 64; paintMapIcon(c.getContext('2d'));
        mapIconUrl = c.toDataURL(); return mapIconUrl;
    }
    const wpKey = () => 'bm_wp_' + (W && W.seed);
    function loadWp() { try { const v = JSON.parse(localStorage.getItem(wpKey()) || 'null'); if (v && Number.isFinite(v.x) && Number.isFinite(v.y)) return v; } catch (e) { } return null; }
    function saveWp() { try { if (O.wp) localStorage.setItem(wpKey(), JSON.stringify(O.wp)); else localStorage.removeItem(wpKey()); } catch (e) { } }
    function buildMapHud(scene) {
        O.wp = loadWp();
        O.mapBtn = scene.add.image(776, 150, '__WHITE').setScrollFactor(0).setDepth(1001).setDisplaySize(30, 30).setTint(0x1d1430).setInteractive({ useHandCursor: true });
        if (!scene.textures.exists('bm_i_map')) { const ct = scene.textures.createCanvas('bm_i_map', 64, 64); paintMapIcon(ct.getContext()); ct.refresh(); }
        O.mapIco = scene.add.image(776, 150, 'bm_i_map').setScrollFactor(0).setDepth(1002).setScale(0.42);
        O.mapBtnTxt = scene.add.text(776, 170, 'M', { fontFamily: FONT, fontSize: '7px', color: '#ffe082', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(1002);
        O.mapBtn.on('pointerdown', (p, lx, ly, ev) => { if (ev) ev.stopPropagation(); toggleMap(); });
        O.keyM = scene.input.keyboard.addKey('M');
        O.keyM.on('down', () => { if (document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return; toggleMap(); });
        O.guideG = pixelize(scene.add.graphics()).setScrollFactor(0).setDepth(1000);
        O.guideTxt = scene.add.text(0, 0, '', { fontFamily: FONT, fontSize: '9px', color: '#ffffff', stroke: '#000', strokeThickness: 4, align: 'center' }).setOrigin(0.5).setScrollFactor(0).setDepth(1001).setVisible(false);
        O.wpG = pixelize(scene.add.graphics()).setDepth(4.3);
    }
    const mapOpen = () => !!document.getElementById('bm-map');
    function closeMap() { const el = document.getElementById('bm-map'); if (el) el.remove(); }
    function toggleMap() {
        if (!O) return;
        if (mapOpen()) { closeMap(); return; }
        if (!hasMap()) { showToast(t('big_map_need')); X.sfx('block', 0.5); return; }
        openMap();
    }
    const LOC_BG = { elf: '#2a2238', forest: '#17301f', snow: '#1e3346', lava: '#2e1410', swamp: '#1f2b18', sky: '#122046' };
    const LOC_FG = { elf: '#a1887f', forest: '#66bb6a', snow: '#e3f2fd', lava: '#8d6e63', swamp: '#7cb342', sky: '#80d8ff' };
    function openMap() {
        const host = document.getElementById('game-container');
        if (!host) return;
        closeMap(); closeShop(); closePortalMenu();
        const hero = X.hero();
        const el = document.createElement('div');
        el.id = 'bm-map';
        el.style.cssText = 'position:absolute;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:rgba(5,3,10,.72);font-family:"Press Start 2P",monospace';
        el.innerHTML = `<div style="background:#1d1430;border:4px solid #58546a;box-shadow:0 0 0 4px #0a0a0a;padding:10px;max-width:96%;color:#fff">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px"><span style="color:#ffe082;font-size:13px">${t('big_map_title')}</span>
            <span style="display:flex;gap:6px"><button data-a="in" class="bmm-b">+</button><button data-a="out" class="bmm-b">-</button><button data-a="me" class="bmm-b">${t('big_map_me')}</button><button data-a="clear" class="bmm-b">${t('big_map_clear')}</button><button data-a="close" class="bmm-b">X</button></span></div>
            <canvas width="760" height="400" style="display:block;width:100%;max-width:760px;image-rendering:pixelated;cursor:crosshair;background:#0b0816;touch-action:none"></canvas>
            <div class="bmm-info" style="font-size:8px;color:#b3e5fc;margin-top:6px;min-height:12px">${t('big_map_hint')}</div></div>`;
        el.querySelectorAll('.bmm-b').forEach(b => { b.style.cssText = 'font-family:inherit;font-size:9px;padding:6px 8px;background:#3a2d55;color:#fff;border:2px solid #0a0a0a;cursor:pointer'; });
        host.appendChild(el);
        el.onpointerdown = (e) => e.stopPropagation();
        const cv = el.querySelector('canvas'), info = el.querySelector('.bmm-info');
        const V = O.mapView || (O.mapView = { s: 0.1, cx: hero ? hero.x : 0, cy: hero ? hero.y : 0 });
        // ko'rinish dunyo chegarasidan chiqmaydi
        const clampV = () => { const hw = 380 / V.s, hh = 200 / V.s; V.cx = W.width <= hw * 2 ? W.width / 2 : Math.max(hw, Math.min(W.width - hw, V.cx)); V.cy = W.bottom - W.top <= hh * 2 ? (W.top + W.bottom) / 2 : Math.max(W.top + hh, Math.min(W.bottom - hh, V.cy)); };
        if (hero) { V.cx = hero.x + 200 / V.s; V.cy = hero.y; }
        clampV();
        const toS = (x, y) => [(x - V.cx) * V.s + 380, (y - V.cy) * V.s + 200];
        const toW = (sx, sy) => [(sx - 380) / V.s + V.cx, (sy - 200) / V.s + V.cy];
        let hover = null;
        const bosses = () => (W.zones || []).filter(z => z.boss).map(z => ({ z, x: (z.x0 + z.x1) / 2, y: z.y1 - 60, dead: (O.paidZones || []).includes(z.id) }));
        const draw = () => {
            if (!cv.isConnected) return;
            const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
            g.fillStyle = '#0b0816'; g.fillRect(0, 0, 760, 400);
            const [vx0] = toW(0, 0), [vx1] = toW(760, 0);
            // lokatsiyalar foni va nomlari
            W.locs.forEach((l) => { const [a, ya] = toS(l.x0, l.y0), [b, yb] = toS(l.x1, l.y1); if (b < 0 || a > 760 || yb < 0 || ya > 400) return; g.fillStyle = LOC_BG[l.id] || '#222'; g.fillRect(a, ya, b - a, yb - ya);
                g.strokeStyle = 'rgba(255,255,255,.12)'; g.strokeRect(a, ya, b - a, yb - ya);
                g.fillStyle = 'rgba(255,255,255,.55)'; g.font = '8px "Press Start 2P",monospace'; g.fillText(t('big_loc_' + l.id), Math.max(a, 0) + 6, Math.max(ya, 0) + 14); });
            // orollar (pastki tosh qismi) va yuriladigan sirtlar
            W.isles.forEach((I) => { if (I.x + I.w < vx0 || I.x > vx1) return; g.fillStyle = (LOC_FG[locAt(I.x, I.y)] || '#aaa') + '55'; I.r.forEach(q => { const [x, y] = toS(q[0], q[1]); g.fillRect(x, y, Math.max(1, q[2] * V.s), Math.max(1, q[3] * V.s)); }); });
            W.plats.forEach((p) => { if (p.x + p.w < vx0 || p.x > vx1 || p.k === 'scloud') return; const [x, y] = toS(p.x, p.y); g.fillStyle = LOC_FG[locAt(p.x, p.y)] || '#aaa'; g.fillRect(x, y, Math.max(1, p.w * V.s), Math.max(2, Math.min(4, p.h * V.s))); });
            const pool = (list, col) => (list || []).forEach(l => { const [x, y] = toS(l.x, l.y); g.fillStyle = col; g.fillRect(x, y, Math.max(2, l.w * V.s), Math.max(3, 30 * V.s)); });
            pool(W.lakes, '#29b6f6'); pool(W.lavas, '#ff7a1a'); pool(W.bogs, '#6d8f3a'); pool(W.ponds, '#4fc3f7'); pool(W.groves, '#43a047');
            // qishloq do'konlari, checkpointlar, portallar
            (W.shops || []).forEach(s => { const [x, y] = toS(s.x, s.y); g.fillStyle = '#ffd54f'; g.fillRect(x - 3, y - 9, 6, 6); });
            W.cps.forEach((c, i) => { const [x, y] = toS(c.x, c.y); if (x < -10 || x > 770) return; const on = O.got.has(i); g.fillStyle = '#000'; g.fillRect(x - 1, y - 12, 2, 12); g.fillStyle = on ? '#69f0ae' : '#9e9e9e'; g.fillRect(x + 1, y - 12, 5, 4); });
            (W.portals || []).forEach(p => { const [x, y] = toS(p.x, p.y); const open = portalOpen(p); g.strokeStyle = open ? '#b388ff' : '#555'; g.lineWidth = 2; g.beginPath(); g.ellipse(x, y - 9, 5, 8, 0, 0, Math.PI * 2); g.stroke(); });
            // BOSSLAR: tirik - qizil bosh suyak, o'ldirilgan - kulrang belgi, maxfiy - binafsha "?"
            bosses().forEach((b) => {
                const [x, y] = toS(b.x, b.y); if (x < -20 || x > 780) return;
                const sec = b.z.secret && !b.dead, r = hover === b ? 9 : 7;
                // piksel nishon (2 px kataklardan doira)
                const disc = (rr, col) => { g.fillStyle = col; for (let yy = -rr; yy < rr; yy += 2) { const hw = Math.round(Math.sqrt(Math.max(0, rr * rr - (yy + 1) * (yy + 1))) / 2) * 2; g.fillRect(Math.round(x) - hw, Math.round(y - 10) + yy, hw * 2, 2); } };
                disc(r + 2, '#000'); disc(r, b.dead ? '#616161' : sec ? '#7c4dff' : '#d50000');
                g.fillStyle = '#fff'; g.font = '8px "Press Start 2P",monospace'; g.textAlign = 'center';
                if (b.dead) g.fillText('v', x, y - 6); else if (sec) g.fillText('?', x, y - 6); else { g.fillRect(x - 3, y - 13, 2, 2); g.fillRect(x + 1, y - 13, 2, 2); g.fillRect(x - 2, y - 9, 4, 1); }
                if (V.s >= 0.05 || hover === b) { g.fillStyle = b.dead ? '#9e9e9e' : '#ffcdd2'; g.font = '7px "Press Start 2P",monospace'; g.fillText(sec ? t('big_map_secret') : t('big_e_' + b.z.boss), x, y - 22); }
                g.textAlign = 'left';
            });
            // VAQTINCHA YOPIQ LOKATSIYA - qoraytiriladi, "Tez kunda"
            (W.closed || []).forEach((id) => W.locs.filter(l => l.id === id).forEach((l) => {
                const [a, ya] = toS(l.x0, l.y0), [b, yb] = toS(l.x1, l.y1); if (b < 0 || a > 760 || yb < 0 || ya > 400) return;
                g.fillStyle = 'rgba(8,6,14,.78)'; g.fillRect(a, ya, b - a, yb - ya);
                g.fillStyle = '#ffcc80'; g.font = '9px "Press Start 2P",monospace'; g.textAlign = 'center';
                g.fillText(t('big_loc_' + id) + ' - ' + t('big_loc_soon'), Math.max(a, 0) / 2 + Math.min(b, 760) / 2, Math.max(ya, 0) / 2 + Math.min(yb, 400) / 2);
                g.textAlign = 'left';
            }));
            // o'yinchilar
            const others = X.others ? X.others() : [];
            // boshqa o'yinchilar: qahramon rangidagi katta belgi (qora-oq hoshiya) va nomi; o'lik - kulrang
            others.forEach(o => {
                if (!o || !o.active || o.x === undefined) return;
                const [x, y] = toS(o.x, o.y); if (x < -30 || x > 790 || y < -30 || y > 430) return;
                const col = o.isDead ? '#9e9e9e' : '#' + (o.mapCol === undefined ? 0xffffff : o.mapCol).toString(16).padStart(6, '0');
                g.fillStyle = '#000'; g.fillRect(x - 6, y - 6, 12, 12); g.fillStyle = '#fff'; g.fillRect(x - 5, y - 5, 10, 10); g.fillStyle = col; g.fillRect(x - 3, y - 3, 6, 6);
                if (o.nick) { g.font = '7px "Press Start 2P",monospace'; g.textAlign = 'center'; g.fillStyle = '#000'; g.fillText(o.nick, x + 1, y - 9); g.fillStyle = '#e1f5fe'; g.fillText(o.nick, x, y - 10); g.textAlign = 'left'; }
            });
            const h = X.hero();
            if (h) { const [x, y] = toS(h.x, h.y); const on = Math.floor(Date.now() / 300) % 2; g.fillStyle = '#000'; g.fillRect(x - 5, y - 5, 10, 10); g.fillStyle = on ? '#ffeb3b' : '#ff9800'; g.fillRect(x - 4, y - 4, 8, 8); }
            // nishon
            if (O.wp) { const [x, y] = toS(O.wp.x, O.wp.y); g.fillStyle = '#000'; g.fillRect(x - 1, y - 22, 3, 22); g.fillStyle = '#ff1744'; g.beginPath(); g.moveTo(x + 1, y - 22); g.lineTo(x + 14, y - 17); g.lineTo(x + 1, y - 12); g.fill();
                if (h) { g.setLineDash([4, 4]); g.strokeStyle = 'rgba(255,82,82,.6)'; g.lineWidth = 1; g.beginPath(); const [hx, hy] = toS(h.x, h.y); g.moveTo(hx, hy); g.lineTo(x, y); g.stroke(); g.setLineDash([]); } }
            requestAnimationFrame(draw);
        };
        requestAnimationFrame(draw);
        // nishon qo'yish: bosilgan joyga eng yaqin yuriladigan sirt (yoki boss belgisi)
        const pick = (sx, sy) => {
            const b = bosses().find(q => { const [x, y] = toS(q.x, q.y); return Math.hypot(x - sx, y - 10 - sy) < 12; });
            if (b) return { x: b.x, y: b.y, label: b.z.secret && !b.dead ? t('big_map_secret') : t('big_e_' + b.z.boss) };
            const [wx, wy] = toW(sx, sy);
            let best = null, bd = 1e9;
            W.plats.forEach(p => { if (p.k === 'scloud' || p.k.endsWith('bed')) return; const cx = Math.max(p.x + 6, Math.min(p.x + p.w - 6, wx)), d = Math.abs(cx - wx) + Math.abs(p.y - wy) * 0.7; if (d < bd) { bd = d; best = { x: Math.round(cx), y: p.y }; } });
            return best && bd * V.s < 40 ? best : null;
        };
        let drag = null;
        cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, cx: V.cx, cy: V.cy, moved: false }; });
        cv.addEventListener('pointermove', (e) => {
            const r = cv.getBoundingClientRect(), k = 760 / r.width;
            if (drag) { const dx = (e.clientX - drag.x) * k, dy = (e.clientY - drag.y) * k; if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true; V.cx = drag.cx - dx / V.s; V.cy = drag.cy - dy / V.s; clampV(); }
            const sx = (e.clientX - r.left) * k, sy = (e.clientY - r.top) * k;
            hover = bosses().find(q => { const [x, y] = toS(q.x, q.y); return Math.hypot(x - sx, y - 10 - sy) < 12; }) || null;
        });
        cv.addEventListener('pointerup', (e) => {
            const r = cv.getBoundingClientRect(), k = 760 / r.width, d = drag; drag = null;
            if (!d || d.moved) return;
            const w = pick((e.clientX - r.left) * k, (e.clientY - r.top) * k);
            if (!w) { info.textContent = t('big_map_hint'); return; }
            O.wp = w; O.wpArrived = false; saveWp(); X.sfx('pop', 0.6);
            const h = X.hero(), m = h ? Math.round(Math.hypot(w.x - h.x, w.y - (h.y + 24)) / 10) : 0;
            info.textContent = t('big_wp_set').replace('{m}', m) + (w.label ? ' - ' + w.label : '');
        });
        cv.addEventListener('wheel', (e) => { e.preventDefault(); V.s = Math.max(0.015, Math.min(0.4, V.s * (e.deltaY < 0 ? 1.25 : 0.8))); clampV(); }, { passive: false });
        el.querySelectorAll('button[data-a]').forEach((b) => { b.onclick = () => {
            const a = b.dataset.a, h = X.hero();
            if (a === 'in') V.s = Math.min(0.4, V.s * 1.4); else if (a === 'out') V.s = Math.max(0.015, V.s / 1.4);
            else if (a === 'me' && h) { V.cx = h.x; V.cy = h.y; } if (a === 'in' || a === 'out' || a === 'me') clampV(); if (a === 'clear') { O.wp = null; saveWp(); info.textContent = t('big_map_hint'); } else if (a === 'close') closeMap();
        }; });
        X.sfx('whoosh', 0.4);
    }
    // YO'L KO'RSATKICH: nishon ekranda bo'lsa - ustida sakrab turgan belgi; bo'lmasa - ekran chetida o'q (tepada bo'lsa - tepada, pastda - pastda) va masofa
    function drawGuide(scene, now, hero) {
        const g = O.guideG, txt = O.guideTxt, wg = O.wpG;
        g.clear(); wg.clear();
        O.mapBtn.setAlpha(hasMap() ? 1 : 0.55); O.mapIco.setAlpha(hasMap() ? 1 : 0.45);
        if (!O.wp || !hero || !hasMap()) { txt.setVisible(false); return; }
        const cam = scene.cameras.main, tx = O.wp.x, ty = O.wp.y, feet = hero.y + 24;
        const dx = tx - hero.x, dy = ty - feet, m = Math.round(Math.hypot(dx, dy) / 10), up = Math.round(-dy / 10);
        if (m <= 6 && !hero.isDead) { O.wp = null; saveWp(); showToast(t('big_wp_arrived')); X.sfx('win', 0.5); txt.setVisible(false); return; }
        const sx = tx - cam.scrollX, sy = ty - cam.scrollY, bob = Math.sin(now / 160) * 4;
        const vert = Math.abs(up) >= 8 ? (up > 0 ? '▲ ' : '▼ ') + Math.abs(up) + ' m' : '';
        if (sx > 30 && sx < 770 && sy > 60 && sy < 560) {
            // ekranda: nishon ustida qizil bayroqcha va masofa
            wg.fillStyle(0x000000, 1); wg.fillRect(tx - 2, ty - 46, 4, 46);
            wg.fillStyle(0xff1744, 1); wg.fillTriangle(tx + 2, ty - 46, tx + 26, ty - 38, tx + 2, ty - 30);
            wg.lineStyle(3, 0xff5252, 0.5 + 0.4 * Math.sin(now / 150)); wg.strokeEllipse(tx, ty - 2, 44, 12);
            txt.setVisible(true).setText(m + ' m').setPosition(sx, sy - 62 + bob);
            return;
        }
        // ekran chetida: markazdan nishon tomonga chiziq chegaraga kesishgan joy
        const cx = 400, cy = 300, vx = sx - cx, vy = sy - cy, L = Math.hypot(vx, vy) || 1;
        const kx = vx !== 0 ? (vx > 0 ? 770 - cx : cx - 30) / Math.abs(vx) : 1e9, ky = vy !== 0 ? (vy > 0 ? 545 - cy : cy - 75) / Math.abs(vy) : 1e9, k = Math.min(kx, ky);
        const ax = cx + vx * k, ay = cy + vy * k, ux = vx / L, uy = vy / L, px2 = -uy, py2 = ux;
        const tipX = ax + ux * bob * 0.5, tipY = ay + uy * bob * 0.5;
        g.fillStyle(0x000000, 0.9); g.fillTriangle(tipX + ux * 16, tipY + uy * 16, tipX - ux * 10 + px2 * 13, tipY - uy * 10 + py2 * 13, tipX - ux * 10 - px2 * 13, tipY - uy * 10 - py2 * 13);
        g.fillStyle(0xff1744, 1); g.fillTriangle(tipX + ux * 12, tipY + uy * 12, tipX - ux * 7 + px2 * 9, tipY - uy * 7 + py2 * 9, tipX - ux * 7 - px2 * 9, tipY - uy * 7 - py2 * 9);
        const lx = Math.max(60, Math.min(740, ax - ux * 46)), ly = Math.max(84, Math.min(530, ay - uy * 34));
        txt.setVisible(true).setText(m + ' m' + (vert ? '\n' + vert : '')).setPosition(lx, ly).setColor(up >= 8 ? '#b9f6ca' : up <= -8 ? '#ffcc80' : '#ffffff');
    }
    // ===== ROBOT ILON (S1 bossi - g'orda): po'lat bo'g'inlar, ochiq jag'lar, qizil visor; inidan chiqib, boshi qaragan tomonga suriladi =====
    // ichki hisob S1 dagi kabi o'ngga qaragan (jag' oldi - headX, yer - 570), keyin yo'nalish (dir) va pol (base) ga ko'chiriladi
    function rsSegTex(scene, i, r) {
        const key = 'bm_rs_seg_' + i;
        if (scene.textures.exists(key)) return key;
        const g = scene.add.graphics(), cx = r + 4, cy = r + 28;   // (S1 ilon bo'g'ini teksturasi - o'zgarmaydi)
        g.fillStyle(0x37474f, 1); g.fillTriangle(cx - r * 0.3, cy - r * 0.8, cx + r * 0.3, cy - r * 0.8, cx, cy - r - 24);
        g.fillStyle(i % 2 ? 0x78909c : 0x607d8b, 1); g.fillCircle(cx, cy, r);
        g.lineStyle(4, 0x37474f, 1); g.strokeCircle(cx, cy, r);
        g.lineStyle(3, 0x90a4ae, 0.8); g.strokeCircle(cx, cy, r * 0.62);
        g.fillStyle(0xcfd8dc, 1);
        for (let a = 0; a < 6; a++) { const ang = (a / 6) * Math.PI * 2 + i; g.fillCircle(cx + Math.cos(ang) * r * 0.82, cy + Math.sin(ang) * r * 0.82, 3); }
        g.generateTexture(key, Math.ceil(2 * r + 8), Math.ceil(2 * r + 32));
        g.destroy();
        return key;
    }
    function drawRSnake(scene, o, now) {
        const dir = o.f < 0 ? -1 : 1, headX = 0, base = o.y, front = o.x + dir * 110, den = o.hx !== undefined ? o.hx : o.x - dir * 600;
        const X = (x) => front + dir * (x - headX), Y = (y) => y - 570 + base, PT = (p) => [X(p[0]), Y(p[1])];
        if (!o.rs) {
            o.img.setVisible(false);
            const g = pixelize(scene.add.graphics()).setDepth(2.64);
            o.rs = { g, segs: [] };
            for (let i = 1; i <= 26; i++) { const r = 80 - i * 1.4, img = scene.add.image(0, 0, rsSegTex(scene, i, r)).setOrigin((r + 4) / (2 * r + 8), (r + 28) / (2 * r + 32)).setDepth(2.63 - i * 0.0001), core = scene.add.circle(0, 0, r * 0.17, 0xff1744).setDepth(2.63 - i * 0.0001 + 0.00005); o.rs.segs[i] = { img, core, r }; }
            o.extra = [g, ...o.rs.segs.filter(Boolean).flatMap(s => [s.img, s.core])];
        }
        const g = o.rs.g; g.clear();
        const phase = now / 220, R = 80, spacing = 50, denIn = -Math.abs(den - front);   // ichki koordinatada in (teshik) joyi
        const vis = o.u === 1 ? 0.35 : 1;
        for (let i = 26; i >= 1; i--) {
            const sg = o.rs.segs[i], r = sg.r, x = headX - 200 - i * spacing, show = x - r * 0.2 > denIn;
            sg.img.setVisible(show); sg.core.setVisible(show);
            if (!show) continue;
            const y = 570 - R + Math.sin(phase - i * 0.5) * 14 + (R - r);
            sg.img.setPosition(X(x), Y(y)).setFlipX(dir < 0).setAlpha(vis);
            sg.core.setPosition(X(x), Y(y)).setAlpha((0.45 + 0.55 * (0.5 + 0.5 * Math.sin(now / 150 + i))) * vis);
            if (o.fl) sg.img.setTint(0xffffff); else sg.img.clearTint();
        }
        // olov holati: maydon ogohlantirishda - og'iz cho'g'lanadi, faol - jag'lar keng ochiladi
        let fire = 0; O.areaMap.forEach((a) => { if (a.k === 'flame:snake' && Math.abs(a.x + a.w / 2 - front - dir * a.w / 2) < 120) fire = a.wn > 0 ? Math.max(fire, 0.5) : 1; });
        const m = fire >= 1 ? 1 : 0;
        const hy = 470 + Math.sin(phase) * 8 * (1 - m) - 34 * m, open = (10 + Math.abs(Math.sin(now / 300)) * 14) * (1 - m) + 6 * m, jy = hy + 26 + open;
        const hx0 = headX - 236, hy0 = hy + 12, aU = -0.46 * m, aL = 0.2 * m;
        const rot = (x, y, a) => { const c = Math.cos(a), sn = Math.sin(a), dx = x - hx0, dy = y - hy0; return [hx0 + dx * c - dy * sn, hy0 + dx * sn + dy * c]; };
        const U = (x, y) => PT(rot(x, y, aU)), L = (x, y) => PT(rot(x, y, aL)), Q = (x, y) => PT([x, y]);
        const poly = (pts) => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]); g.closePath(); g.fillPath(); };
        const outline = (pts) => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]); g.closePath(); g.strokePath(); };
        const tri = (a, b, c) => g.fillTriangle(a[0], a[1], b[0], b[1], c[0], c[1]);
        g.setAlpha(vis);
        g.fillStyle(0x3e0000, 1); poly([Q(hx0 - 10, hy0), U(headX - 250, hy + 6), U(headX, hy - 6), L(headX - 8, jy + 8), L(headX - 240, jy)]);
        g.fillStyle(0xff3d00, 0.45 + 0.4 * m); poly([Q(hx0, hy0), U(headX - 190, hy + 6), U(headX - 30, hy), L(headX - 40, jy + 6), L(headX - 190, jy + 2)]);
        if (fire > 0) { const fl = 0.8 + 0.2 * Math.sin(now / 40); g.fillStyle(0xffd54f, 0.85 * fire * fl); poly([Q(hx0 + 10, hy0), U(headX - 150, hy + 8), U(headX - 70, hy + 6), L(headX - 80, jy + 4), L(headX - 150, jy + 2)]); const c0 = Q(hx0 + 40, hy0 + 2); g.fillStyle(0xfffde7, 0.9 * fire * fl); g.fillCircle(c0[0], c0[1], 14 + 6 * fl); }
        const lower = [L(headX - 240, jy), L(headX - 8, jy + 8), L(headX - 22, jy + 44), L(headX - 240, jy + 52)];
        g.fillStyle(o.fl ? 0xffffff : 0x455a64, 1); poly(lower); g.lineStyle(4, 0x263238, 1); outline(lower);
        const upper = [U(headX - 250, hy - 70), U(headX - 70, hy - 100), U(headX, hy - 40), U(headX, hy - 6), U(headX - 250, hy + 6)];
        g.fillStyle(o.fl ? 0xffffff : o.v ? 0x8d8f60 : 0x546e7a, 1); poly(upper); g.lineStyle(4, 0x263238, 1); outline(upper);
        g.fillStyle(0xeceff1, 1);
        for (let tx = headX - 200; tx < headX - 12; tx += 24) { tri(U(tx, hy - 5), U(tx + 14, hy - 5), U(tx + 7, hy + 16)); tri(L(tx + 6, jy + 4), L(tx + 20, jy + 4), L(tx + 13, jy - 16)); }
        g.lineStyle(3, 0x78909c, 1); const a1 = U(headX - 230, hy - 40), a2 = U(headX - 90, hy - 62); g.lineBetween(a1[0], a1[1], a2[0], a2[1]);
        g.fillStyle(0xcfd8dc, 1); for (let rx = headX - 230; rx < headX - 40; rx += 36) { const r = U(rx, hy - 20); g.fillCircle(r[0], r[1], 3.5); }
        const glow = 0.6 + 0.4 * Math.sin(now / 120), visor = (x, y, w, h) => poly([U(x, y), U(x + w, y), U(x + w, y + h), U(x, y + h)]);
        g.fillStyle(0xff1744, 0.25 * glow + 0.3 * m); visor(headX - 162, hy - 76, 94, 30);
        g.fillStyle(m > 0.5 || fire > 0 ? 0xffea00 : 0xff1744, 1); visor(headX - 150, hy - 68, 70, 14);
        g.fillStyle(0xffcdd2, 1); visor(headX - 118, hy - 65, 16, 5);
        g.lineStyle(4, 0x37474f, 1); const b1 = U(headX - 205, hy - 76), b2 = U(headX - 228, hy - 140); g.lineBetween(b1[0], b1[1], b2[0], b2[1]);
        g.fillStyle(Math.floor(now / 300) % 2 ? 0xff1744 : 0x5d0000, 1); g.fillCircle(b2[0], b2[1] - 2, 7);
        if (fire > 0 && fire < 1) {   // og'izda cho'g' yig'iladi
            const ut = U(headX, hy - 6), lt = L(headX - 8, jy + 8), mx = (ut[0] + lt[0]) / 2, my = (ut[1] + lt[1]) / 2, pulse = 0.5 + 0.5 * Math.sin(now / 60);
            g.fillStyle(0xff6d00, 0.3 + 0.3 * pulse); g.fillCircle(mx, my, 30 + pulse * 12); g.fillStyle(0xffd54f, 0.9); g.fillCircle(mx, my, 12 + pulse * 6);
            for (let k = 0; k < 10; k++) { const ph = ((now / 500 + k / 10) % 1), ang = k * 2.4, r = 90 * (1 - ph); g.fillStyle(k % 2 ? 0xffab40 : 0xffea00, ph); g.fillRect(Math.round(mx + Math.cos(ang) * r), Math.round(my + Math.sin(ang) * r * 0.7), 4, 4); }
        }
        if (o.v) for (let k = 0; k < 3; k++) { const a = now / 220 + k * 2.1, p = Q(headX - 130 + Math.cos(a) * 50, hy - 120 + Math.sin(a) * 8); g.fillStyle(0xffeb3b, 1); g.fillCircle(p[0], p[1], 5); }   // charchab to'xtadi
    }
    // ROBOT ILON OLOVI: og'izdan oldinga, yer bo'ylab (uzoqlashgan sari pasayadi) - S1 dagidek pikselli alanga
    function drawSnakeFlame(hi, o, now, warn) {
        if (warn) return;
        const f = o.f || 1, P = 6, x0 = f > 0 ? o.x : o.x + o.w, by = o.y + o.h;
        for (let d = 0; d < o.w; d += P) {
            const k = d / o.w, x = x0 + f * d, top = by - o.h * (0.55 + 0.45 * (1 - k)) * (d > o.w - 60 ? (o.w - d) / 60 : 1) - Math.random() * 26;
            const cols = [0xb71c1c, 0xff3d00, 0xff9100, 0xffd54f, 0xfffde7];
            for (let y = by; y > top; y -= P) { const q = (by - y) / Math.max(1, by - top); hi.fillStyle(cols[Math.min(4, Math.floor((1 - q) * 4.2 + (Math.random() < 0.2 ? 1 : 0)))], 0.92); hi.fillRect(Math.round(x / P) * P, Math.round(y / P) * P, P, P); }
        }
    }
    // ===== ELF QIROLLIGI: suhbatlar, topshiriqlar, qafas, ilon ini =====
    const OWN_TELL = { bullkan: 1, sambo: 1, gorilla: 1, bigtree: 1, santa: 1, bigfoot: 1, hockey: 1, bigflower: 1, swampmage: 1, bogcrab: 1 };   // hujum paytida to'q sariq rangga bo'yalmaydigan bosslar (sambochi terisi, tosh gorilla, daraxt)
    const THIEF = { tknife: 1, tarcher: 1, tbrute: 1, hspear: 1, hknives: 1, hshield: 1 };   // o'g'rilar va o'rmon ovchilari - bir xil kadr tartibi
    // ===== KATTA O'RMON: mevali buta (oltin olma / yovvoyi rezavor) =====
    const trailWild = (tr) => (W.wilds || []).some(w => w.loc === tr.loc && Math.abs(w.y - tr.y) < 2);   // orol tomondagi ko'rsatkich
    function fruitTextures(scene) {
        const mk = (key, Wd, H, draw) => {
            if (scene.textures.exists(key)) return;
            const g = scene.add.graphics(), R = (x, y, w, h, c) => { g.fillStyle(c, 1); g.fillRect(x * 3, y * 3, w * 3, h * 3); };
            draw(R); g.generateTexture(key, Wd * 3, H * 3); g.destroy();
        };
        mk('bm_fbush', 22, 15, (R) => {   // keng yashil buta
            R(2, 4, 18, 11, 0x0b2e10); R(0, 7, 22, 8, 0x0b2e10); R(5, 1, 12, 4, 0x0b2e10);
            R(1, 8, 20, 6, 0x1b5e20); R(3, 5, 16, 8, 0x2e7d32); R(6, 2, 10, 4, 0x2e7d32); R(7, 3, 6, 2, 0x43a047); R(4, 6, 5, 2, 0x43a047); R(14, 7, 4, 2, 0x388e3c);
            R(3, 14, 16, 1, 0x3e2723);
        });
        mk('bm_redstone', 16, 12, (R) => {   // qizil tosh (yer yuzasida bir nechta qirrali bo'lak)
            R(2, 5, 6, 7, 0x3a0606); R(6, 1, 7, 11, 0x3a0606); R(12, 6, 4, 6, 0x3a0606);
            R(3, 6, 4, 6, 0xb71c1c); R(7, 2, 5, 10, 0xe53935); R(13, 7, 2, 5, 0xc62828);
            R(8, 3, 2, 4, 0xff8a80); R(4, 7, 1, 2, 0xef5350); R(13, 8, 1, 1, 0xff8a80); R(9, 9, 2, 3, 0xb71c1c);
        });
        mk('bm_fr_apple', 5, 6, (R) => { R(0, 1, 5, 5, 0x5d4300); R(1, 2, 3, 3, 0xffd54f); R(1, 2, 1, 1, 0xfff59d); R(3, 3, 1, 2, 0xf9a825); R(2, 0, 1, 2, 0x4e342e); R(3, 0, 2, 1, 0x43a047); });
        mk('bm_fr_berry', 5, 5, (R) => { R(0, 1, 5, 4, 0x1a0026); R(1, 1, 3, 3, 0x6a1b9a); R(1, 1, 1, 1, 0xce93d8); R(3, 3, 1, 1, 0x4a0072); R(2, 0, 1, 1, 0x43a047); });
    }
    function drawFruits(scene) {
        (W.fruits || []).forEach((f) => {
            let o = O.fruits.get(f.id);
            if (!o && f.k === 'redstone') { const st = scene.add.image(f.x, f.y + 2, 'bm_redstone').setOrigin(0.5, 1).setDepth(-0.5); o = { bush: st, berries: [st] }; O.fruits.set(f.id, o); }
            if (!o) {
                const bush = scene.add.image(f.x, f.y + 2, 'bm_fbush').setOrigin(0.5, 1).setDepth(-0.56);
                const berries = [[-19, -30], [-4, -38], [12, -31], [22, -20], [-12, -18], [4, -22]].map(([dx, dy]) => scene.add.image(f.x + dx, f.y + dy, 'bm_fr_' + f.k).setDepth(-0.55));
                o = { bush, berries }; O.fruits.set(f.id, o);
            }
            const on = !O.fruitOff.has(f.id);
            if (o.on !== on) { o.on = on; o.berries.forEach(b => b.setVisible(on)); }
        });
    }
    // ===== LAGER TOPSHIRIQLARI (tasodifiy) =====
    function rqTextures(scene) {
        const mk = (key, W, H, draw) => {
            if (scene.textures.exists(key)) return;
            const g = scene.add.graphics(), R = (x, y, w, h, c) => { g.fillStyle(c, 1); g.fillRect(x * 3, y * 3, w * 3, h * 3); };
            draw(R); g.generateTexture(key, W * 3, H * 3); g.destroy();
        };
        mk('rq_apple', 9, 11, (R) => {   // sariq olma
            R(1, 4, 7, 6, 0x5d4300); R(0, 5, 9, 4, 0x5d4300); R(2, 10, 5, 1, 0x5d4300); R(2, 3, 2, 1, 0x5d4300); R(5, 3, 2, 1, 0x5d4300);
            R(1, 5, 7, 4, 0xffd54f); R(2, 4, 5, 6, 0xffd54f); R(5, 6, 3, 3, 0xf9a825); R(2, 5, 2, 2, 0xfff59d);
            R(4, 1, 1, 3, 0x4e342e); R(5, 0, 3, 2, 0x43a047);
        });
        mk('rq_fish', 20, 12, (R) => {   // ko'lmak va sakrayotgan baliq
            R(1, 8, 18, 4, 0x01315c); R(2, 8, 16, 3, 0x0288d1); R(4, 9, 6, 1, 0x4fc3f7); R(12, 10, 4, 1, 0x4fc3f7);
            R(7, 2, 7, 4, 0x000000); R(8, 3, 5, 2, 0xff8f00); R(6, 1, 2, 2, 0x000000); R(6, 5, 2, 2, 0x000000); R(7, 2, 1, 1, 0xffb300); R(7, 5, 1, 1, 0xffb300); R(12, 3, 1, 1, 0x000000);
            R(9, 6, 3, 2, 0x4fc3f7);
        });
        mk('rq_berry', 11, 10, (R) => {   // yovvoyi rezavor (buta)
            R(0, 3, 11, 7, 0x1b5e20); R(1, 2, 9, 7, 0x2e7d32); R(2, 1, 7, 2, 0x43a047);
            [[2, 4], [6, 3], [4, 6], [8, 6]].forEach(([x, y]) => { R(x, y, 2, 2, 0x4a0072); R(x, y, 1, 1, 0xce93d8); });
        });
        mk('rq_crystal', 9, 13, (R) => {   // muz kristali
            R(3, 0, 3, 1, 0x01579b); R(2, 1, 5, 2, 0x01579b); R(1, 3, 7, 6, 0x01579b); R(2, 9, 5, 2, 0x01579b); R(3, 11, 3, 2, 0x01579b);
            R(3, 1, 3, 2, 0x81d4fa); R(2, 3, 5, 6, 0x4fc3f7); R(3, 9, 3, 2, 0x29b6f6); R(3, 3, 2, 4, 0xe1f5fe);
        });
        mk('rq_lily', 13, 9, (R) => {   // botqoq nilufari
            R(0, 6, 13, 3, 0x1b5e20); R(1, 6, 11, 2, 0x43a047);
            R(5, 0, 3, 2, 0x880e4f); R(3, 2, 7, 4, 0x880e4f); R(6, 1, 1, 1, 0xf48fb1); R(4, 3, 5, 2, 0xf06292); R(5, 2, 3, 3, 0xf48fb1); R(6, 3, 1, 1, 0xfff59d);
        });
        mk('rq_shroom', 11, 12, (R) => {   // nurli qo'ziqorin (Yer osti)
            R(2, 0, 7, 1, 0x00695c); R(1, 1, 9, 1, 0x00695c); R(0, 2, 11, 4, 0x00695c); R(1, 6, 9, 1, 0x00695c); R(4, 7, 3, 5, 0x37474f); R(3, 11, 5, 1, 0x37474f);
            R(2, 1, 7, 1, 0x4dd0c4); R(1, 2, 9, 3, 0x26c6da); R(2, 5, 7, 1, 0x00acc1); R(3, 2, 2, 1, 0xe0f7fa); R(7, 3, 2, 1, 0xb2ebf2); R(5, 7, 1, 4, 0xb2dfdb);
        });
    }
    const rqGoal = (q) => q.t === 'killk' ? t('rq_g_killk').replace('{n}', q.n).replace('{k}', t('big_e_' + q.k))
        : q.t === 'killn' ? t('rq_g_killn').replace('{n}', q.n).replace('{l}', t('big_loc_' + q.loc))
        : q.t === 'fish' ? t(q.k === 'frozen' ? 'rq_g_frozen' : 'rq_g_lake').replace('{n}', q.n).replace('{l}', t(((W.ponds || []).some(p => p.loc === q.loc && !p.big) ? 'big_lake_' : 'big_river_') + q.loc))
        : t('rq_g_' + q.k).replace('{n}', q.n).replace('{l}', t((q.k === 'redstone' ? 'big_loc_' : q.fr ? 'big_wood_' : 'big_grove_') + q.loc));
    // nishon: bajarilgan bo'lsa - razvedkachi; buyum bo'lsa - eng yaqin joy
    function rqTarget(q) {
        const h = X.hero(), hx = h ? h.x : 0, hy = h ? h.y : 0, near = (a, f) => a.slice().sort((p, r) => Math.hypot(f(p)[0] - hx, f(p)[1] - hy) - Math.hypot(f(r)[0] - hx, f(r)[1] - hy))[0];
        if (q.got >= q.n) { const n = near(W.npcs.filter(o => o.rq && o.loc === q.loc), o => [o.x, o.y]); return n ? { x: n.x, y: n.y } : null; }
        if (q.t === 'item' && q.fr) {   // katta o'rmon mevalari / qizil toshlar: yo'l boshidan uzoqda bo'lsa - avval yo'l boshi
            const ripe = (W.fruits || []).filter(f => f.loc === q.loc && !O.fruitOff.has(f.id)), f = ripe.length ? near(ripe, o => [o.x, o.y]) : null;
            const wd = (W.wilds || []).find(w => w.loc === q.loc), sign = wd && (W.signs || []).find(o => o.loc === q.loc && !o.home);
            if (wd && sign) { const dIsle = (x, y) => Math.hypot(x - (wd.x + wd.w / 2), y - wd.y); if (Math.hypot(hx - sign.x, hy - sign.y) > 160 && dIsle(hx, hy) > dIsle(sign.x, sign.y)) return { x: sign.x, y: sign.y }; }
            return f ? { x: f.x, y: f.y } : wd ? { x: Math.round((wd.fx0 + wd.fx1) / 2), y: wd.y } : null;
        }
        if (q.t === 'snow') { const p = near(W.piles || [], o => [o.x, o.y]); return p ? { x: p.x, y: p.y } : null; }
        if (q.t === 'trophy' || q.t === 'gift') { const z = W.zones.find(o => o.boss === q.boss); return z ? { x: Math.round((z.x0 + z.x1) / 2), y: z.y1 - 60 } : null; }
        if (q.t === 'item' && q.spots && q.spots.length) { const s = near(q.spots, o => o); return { x: s[0], y: s[1] }; }
        if (q.t === 'fish') { const ls = (W.ponds || []).filter(o => o.loc === q.loc), l = ls.length ? near(ls, o => [o.x + o.w / 2, o.y]) : null; return l ? { x: l.x + l.w / 2, y: l.y } : null; }
        return null;
    }
    function rqTrack(q) {
        const done = q.got >= q.n, h = X.hero(), tg = rqTarget(q);
        let dir = '';
        if (tg && h) { const dx = tg.x - h.x, dy = tg.y - (h.y + 24), m = Math.round(Math.hypot(dx, dy) / 10); dir = '  ' + (Math.abs(dy) > Math.abs(dx) ? (dy < 0 ? '^' : 'v') : dx > 0 ? '>' : '<') + ' ' + m + t('rq_m'); }
        return (done ? '✔ ' + t('rq_track_done') : '• ' + rqGoal(q) + ' ' + q.got + '/' + q.n) + dir;
    }
    function rqRefresh(scene) {
        const q = O.rq, spots = q && q.t === 'item' && q.spots ? q.spots : [], want = new Set(spots.map(s => s[0] + ':' + s[1]));
        O.rqImgs.forEach((im, k) => { if (!want.has(k)) { if (q) puff(im.x, im.y - 14, 0xffd54f, 10); im.destroy(); O.rqImgs.delete(k); } });
        spots.forEach((s) => {
            const k = s[0] + ':' + s[1];
            if (O.rqImgs.has(k)) return;
            const im = scene.add.image(s[0], s[1] + 1, 'rq_' + q.k).setOrigin(0.5, 1).setDepth(3.4);
            if (q.k !== 'fish') scene.tweens.add({ targets: im, y: s[1] - 5, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
            O.rqImgs.set(k, im);
        });
    }
    function rqSetWp(q) {
        const tg = q && rqTarget(q);
        if (tg && hasMap()) { O.wp = { x: tg.x, y: tg.y, label: t('rq_title') }; O.wpArrived = false; saveWp(); }
    }
    // ===== KO'LDA BALIQ TUTISH: qarmoq tashlash -> kutish -> tishladi (yashilda E) =====
    function reelStop(send) {
        const r = O.reel; if (!r) return;
        O.reel = null;
        const z = r.zones.find(([a, b]) => r.pos >= a && r.pos <= b) || [0, 0, 'red'];
        [r.g, r.title, r.marker].forEach(o => o.destroy());
        if (send) X.socket.emit('bigAct', { roomId: X.roomId(), act: 'fishreel', arg: 0, item: z[2] });
    }
    function reelStart(scene, fish) {
        reelStop(false);
        const gold = fish.id === 'goldfish', green = gold ? 0.035 : Math.max(0.06, 0.13 - fish.kg * 0.006), yellow = gold ? 0.12 : 0.15;
        const zones = [[0, 0.5 - green - yellow, 'red'], [0.5 - green - yellow, 0.5 - green, 'yellow'], [0.5 - green, 0.5 + green, 'green'], [0.5 + green, 0.5 + green + yellow, 'yellow'], [0.5 + green + yellow, 1, 'red']];
        const g = scene.add.graphics().setScrollFactor(0).setDepth(1500), Bx = 240, By = 190, BW = 320, BH = 26;
        g.fillStyle(0x0a0a0a, 1); g.fillRect(Bx - 10, By - 40, BW + 20, BH + 62); g.fillStyle(0x1b1630, 1); g.fillRect(Bx - 6, By - 36, BW + 12, BH + 54); g.fillStyle(0x0a0a0a, 1); g.fillRect(Bx - 2, By - 2, BW + 4, BH + 4);
        const COL = { red: [0xc62828, 0xe53935], yellow: [0xf9a825, 0xfdd835], green: [0x2e7d32, 0x66bb6a] };
        zones.forEach(([a, b, k]) => { g.fillStyle(COL[k][0], 1); g.fillRect(Bx + Math.round(a * BW), By, Math.round((b - a) * BW), BH); g.fillStyle(COL[k][1], 1); g.fillRect(Bx + Math.round(a * BW), By, Math.round((b - a) * BW), 6); });
        const title = scene.add.text(400, By - 22, t(gold ? 'mf_reel_gold' : 'mf_reel_title'), { fontFamily: FONT, fontSize: '10px', color: gold ? '#ffd54f' : '#ffeb3b' }).setOrigin(0.5).setScrollFactor(0).setDepth(1501);
        const marker = scene.add.rectangle(Bx, By + BH / 2, 6, BH + 12, 0xffffff).setStrokeStyle(2, 0x000000).setScrollFactor(0).setDepth(1502);
        O.reel = { g, title, marker, zones, Bx, BW, pos: 0, dir: 1, speed: gold ? 2.1 : 0.75 + fish.kg * 0.09 };
        X.sfx('banner');
    }
    function onFish(scene, d) {
        if (d.st === 'wait') { O.fish = { pond: d.pond, bite: false }; X.sfx('whoosh', 0.6); showToast(t('big_fish_wait')); return; }
        if (d.st === 'bite') { if (O.fish) O.fish.bite = true; reelStart(scene, d.fish); return; }
        if (d.st === 'broken') { showToast(t('big_fish_broken')); return; }
        reelStop(false); O.fish = null;
        if (d.st === 'gone') showToast(t('mf_fish_escaped'));
        else if (d.st === 'caught') { X.sfx('coin'); showToast(t('big_fish_got').replace('{f}', t('fish_' + d.fish.id)).replace('{k}', d.fish.kg).replace('{v}', d.fish.value)); }
        else if (d.st === 'err') { X.sfx('block', 0.5); showToast(String(t(d.err)).replace('{c}', d.cap || '')); }
    }
    // har kadr: qarmoq chizig'i va tortish chizig'i
    function drawFishing(scene, now) {
        const g = O.fishG; g.clear();
        const h = X.hero(), f = O.fish, l = f && (W.ponds || []).find(o => o.id === f.pond);
        if (f && l && h) {
            const tx = Math.max(l.x + 12, Math.min(l.x + l.w - 12, h.x + (h.flipX ? -90 : 90))), ty = l.y + 2 + (f.bite ? Math.sin(now / 40) * 3 : Math.sin(now / 300) * 1.5);
            g.lineStyle(1, 0xffffff, 0.8); g.lineBetween(h.x + (h.flipX ? -14 : 14), h.y - 22, tx, ty);
            g.fillStyle(0x000000, 1); g.fillRect(tx - 3, ty - 4, 6, 8); g.fillStyle(0xff5252, 1); g.fillRect(tx - 2, ty - 3, 4, 3); g.fillStyle(0xffffff, 1); g.fillRect(tx - 2, ty, 4, 3);
        }
        const r = O.reel;
        if (r) {
            const dt = Math.min(0.05, scene.game.loop.delta / 1000);
            r.pos += r.dir * r.speed * dt;
            if (r.pos >= 1) { r.pos = 1; r.dir = -1; } else if (r.pos <= 0) { r.pos = 0; r.dir = 1; }
            r.marker.x = r.Bx + r.pos * r.BW;
        }
    }
    // MUSIQA: jang - dushman quvayapti (yaqinda), boss maydonida yoki yaqinda zarar oldi; boshqa payt sokin
    function inBattle() {
        if (!O || !O.enemies) return false;
        const h = X.hero();
        if (!h || h.isDead) return false;
        const now = O.scene.time.now;
        if (O.hpPrev !== undefined && h.hp < O.hpPrev) O.fightUntil = now + 6000;
        O.hpPrev = h.hp;
        if ((O.arenas || []).some(a => h.x > a.x0 - 100 && h.x < a.x1 + 100 && h.y > a.y0 - 200 && h.y < a.y1 + 100)) O.fightUntil = now + 4000;
        for (const e of O.enemies.values()) if (e.ch && Math.abs(e.x - h.x) < 560 && Math.abs(e.y - h.y) < 320) { O.fightUntil = now + 4000; break; }
        return now < (O.fightUntil || 0);
    }
    function onRq(scene, d) {
        O.rq = d.q || null;
        rqRefresh(scene);
        const talk = (lines) => { if (X.dialog) X.dialog(lines.map(text => ({ who: 'elf', text })), null, { elfName: t('rq_name'), elfFace: 'px_elf_face' }); };
        if (d.ev === 'accept') { talk([line('rq_intro_' + d.q.loc), rqGoal(d.q) + ' ' + t('rq_reward').replace('{c}', d.q.coins) + (d.q.t === 'fish' ? ' ' + t('rq_need_rod') : '')]); showToast(t('rq_toast_accept')); rqSetWp(d.q); }
        else if (d.ev === 'wait') { const q = d.q; talk([q.got >= q.n ? t('rq_other').replace('{l}', t('big_loc_' + q.loc)) : line('rq_wait') + ' ' + rqGoal(q) + ' ' + q.got + '/' + q.n + (d.skip ? ' ' + t('rq_skip_hint') : '')]); }
        else if (d.ev === 'got') { X.sfx('coin', 0.6); showToast(rqGoal(d.q) + ' ' + d.q.got + '/' + d.q.n); if (d.q.t === 'item') rqSetWp(d.q); }
        else if (d.ev === 'ready') { X.sfx('coin'); showToast(t('rq_toast_ready').replace('{l}', t('big_loc_' + d.q.loc))); rqSetWp(d.q); }
        else if (d.ev === 'done') { talk([line('rq_thanks')]); X.sfx('win'); showToast(t('rq_toast_done').replace('{c}', d.coins).replace('{x}', d.xp)); }
    }
    function questLines(q, ev) {
        const L = (keys, who = 'elf') => keys.map(k => ({ who, text: t(k) }));
        if (q === 'tooth') {
            if (ev === 'accept') return [...L(['bq_tooth_1', 'bq_tooth_2']), { who: 'player', text: t('bq_tooth_3') }, ...L(['bq_tooth_4'])];
            if (ev === 'have') return L(['bq_tooth_have']);
            if (ev === 'wait') return L(['bq_tooth_wait']);
            if (ev === 'got') return [{ who: 'narrator', text: t('bq_tooth_got') }];
            if (ev === 'done') return L(['bq_tooth_done1', 'bq_tooth_done2']);
            return L(['bq_tooth_thanks']);
        }
        if (ev === 'accept') return [...L(['bq_kids_1', 'bq_kids_2']), { who: 'player', text: t('bq_kids_3') }, ...L(['bq_kids_4'])];
        if (ev === 'wait') return L(['bq_kids_wait']);
        if (ev === 'locked') return [{ who: 'narrator', text: t('bq_kids_locked') }];
        if (ev === 'found') return [{ who: 'narrator', text: t('bq_kids_found1') }, { who: 'elf', text: t('bq_kids_found2') }];
        if (ev === 'done') return L(['bq_kids_done1', 'bq_kids_done2']);
        return L(['bq_kids_thanks']);
    }
    // topshiriq nishoni (xarita sotib olingan bo'lsa - yo'l ko'rsatkichi ham)
    function questTarget(q, st) {
        if (st === 2 || st === 3) { const n = W.npcs.find(o => o.q === q); return n && st === 2 ? { x: n.x, y: n.y } : null; }
        if (q === 'tooth') { const z = W.zones.find(o => o.boss === 'rsnake'); return z && { x: z.x0 + 200, y: z.y1 - 40 }; }
        const c = (W.cages || [])[0]; return c && { x: c.x, y: c.y };
    }
    function onQuest(scene, d) {
        const lines = questLines(d.q, d.ev), npcFace = d.q === 'tooth' ? 'questelf' : 'motherelf';
        if (X.dialog) X.dialog(lines, null, { elfName: t('bq_name_' + npcFace), elfFace: 'px_elf_face' });
        if (d.ev === 'accept' || d.ev === 'have' || d.ev === 'got' || d.ev === 'found') {
            const tg = questTarget(d.q, d.st);
            if (tg && hasMap()) { O.wp = { x: tg.x, y: tg.y, label: t('bq_title_' + d.q) }; O.wpArrived = false; saveWp(); }
            showToast(t('bq_toast_' + d.ev));
        }
        if (d.ev === 'done') { X.sfx('win'); showToast(t('bq_toast_done')); }
        if (d.ev === 'found') X.sfx('coin');
    }
    // fat elf suhbati (S1 map-9 dagi gaplar)
    function onTalk(scene, d) {
        const h = X.hero(), e = O.enemies.get(d.id);
        if (!h || !e || Math.abs(h.x - e.x) > 900 || Math.abs(h.y - e.y) > 500 || !X.dialog) { X.socket.emit('bigAct', { roomId: X.roomId(), act: 'talkdone', arg: d.zone }); return; }
        O.talkZone = d.zone;
        X.dialog([
            { who: 'elf', text: t('fe_d1') }, { who: 'player', text: t('fe_d2') }, { who: 'elf', text: t('fe_d3') }, { who: 'elf', text: t('fe_d4') },
            { who: 'elf', text: t('fe_d5') }, { who: 'elf', text: t('fe_d6'), fx: 'scream' }, { who: 'player', text: t('fe_d7') }
        ], () => { X.socket.emit('bigAct', { roomId: X.roomId(), act: 'talkdone', arg: d.zone }); O.talkZone = null; }, { elfName: t('fatelf_name'), voice: 'deep', elfFace: 'px_fatelf_face' });
    }
    // E bilan qilinadigan narsa (yaqinda): topshiriq beruvchi, qafas, ilon ini, ovqatlanayotgan semiz elf
    function nearElfAct(hero) {
        if (!hero || hero.isDead) return null;
        const feet = hero.y + 24;
        const n = W.npcs.find(o => (o.q || o.rq) && Math.abs(hero.x - o.x) < 90 && Math.abs(feet - o.y) < 70);
        if (n) return { act: n.rq ? 'rq' : 'quest', arg: n.id, x: n.x, y: n.y - 70, hint: t('bq_hint_talk') };
        // MEVA: topshiriq bo'lsa - teriladi, bo'lmasa - yeyiladi (jon to'ladi)
        const fr = (W.fruits || []).find(o => !O.fruitOff.has(o.id) && Math.abs(hero.x - o.x) < 50 && Math.abs(feet - o.y) < 70);
        if (fr) { const q = O.rq, forQ = q && q.t === 'item' && q.fr && q.loc === fr.loc && q.got < q.n; const stone = fr.k === 'redstone'; return { act: 'fruit', arg: fr.id, x: fr.x, y: fr.y - (stone ? 54 : 84), hint: t(stone ? (forQ ? 'big_stone_pick' : 'big_stone_take') : forQ ? 'big_fruit_pick' : 'big_fruit_eat') }; }
        // BALIQ KO'LI: E - qarmoq tashlash (qarmoq suvda bo'lsa - qayta tashlanmaydi)
        const pd = (W.ponds || []).find(o => hero.x > o.x - 70 && hero.x < o.x + o.w + 70 && Math.abs(feet - o.y) < 70);
        if (pd && !O.fish) return { act: 'fishcast', arg: pd.id, x: Math.max(pd.x, Math.min(pd.x + pd.w, hero.x)), y: pd.y - 90, hint: t('big_fish_hint') };
        const c = (W.cages || []).find(o => Math.abs(hero.x - o.x) < 100 && Math.abs(feet - o.y) < 80);
        if (c) return { act: 'cage', arg: 0, x: c.x, y: c.y - 104, hint: t('bq_hint_cage') };
        const z = W.zones.find(o => o.trig === 'e' && Math.abs(hero.x - o.dx) < 160 && Math.abs(feet - o.dy) < 110);
        const farmOn = z && z.boss === 'zvfarm' && !!enemyFind(e => e.k === 'zvfarm');   // ferma jangi ketyapti
        // BALOT MAGI (tinch): suhbat; simpatiya 6+ - arg'imchoqqa taklif / uchirish
        const pmz = O.pm && O.pm.img.visible ? peaceMageZone() : null;
        if (pmz && !O.pmTalk) {
            const pm = O.pm, g0 = pmz.y1 - 60, swp = mageProp('swingframe');
            const held = window.HeldItem && HeldItem.get();
            if (!pm.sw.seated && held && Math.abs(hero.x - pm.x) < 90 && Math.abs(feet - g0) < 90) return { act: 'magegive', arg: pmz.id, x: pm.x, y: g0 - 165, hint: t('big_mage_give').replace('{i}', t('crop_' + held)), local: () => X.socket.emit('bigAct', { roomId: X.roomId(), act: 'magegift', arg: pmz.id, item: held }) };
            if (!pm.sw.seated && Math.abs(hero.x - pm.x) < 90 && Math.abs(feet - g0) < 90) return { act: 'magetalk', arg: pmz.id, x: pm.x, y: g0 - 165, hint: t('big_mage_talk'), local: () => mageTalk(pmz) };
            if (swp && pmSym() >= PM.SWING && Math.abs(hero.x - swp.x) < 120 && Math.abs(feet - g0) < 90) return { act: 'mageswing', arg: 0, x: swp.x, y: g0 - 170, hint: t(pm.sw.seated ? 'big_mage_push' : 'big_mage_swing'),
                local: () => { if (pm.sw.seated) { pm.sw.vel += (hero.x < swp.x ? 1 : -1) * 0.9; pm.sw.until = Math.max(pm.sw.until, O.scene.time.now + 15000); X.sfx('whoosh', 0.5); } else if (pm.go !== 'swing') { pm.go = 'swing'; showToast(t('mg_swing_yes')); } } };
        }
        if (z && z.boss === 'santa') {   // ALTER QOR BOBO: archa oldida sovg'a olish (olgan bo'lsa - boshqalarni kutadi)
            if ((O.paidZones || []).includes(z.id) || O.arenas.some(a => a.id === z.id) || !!enemyFind(e => e.k === 'santa')) return null;
            return { act: 'trigger', arg: z.id, x: z.dx, y: z.dy - 200, hint: t(O.gifts && O.gifts[z.id] ? 'big_hint_gift_wait' : 'big_hint_gift') };
        }
        if (z && !farmOn && !(O.paidZones || []).includes(z.id) && !O.arenas.some(a => a.id === z.id)) return { act: 'trigger', arg: z.id, x: z.dx, y: z.dy - (z.boss === 'zvfarm' ? 120 : 170), hint: t(z.boss === 'zvfarm' ? 'big_hint_carrot' : 'bq_hint_den') };
        for (const e of O.enemies.values()) if (false && e.k === 'fatelf' && e.bs === 'eat' && Math.abs(hero.x - e.x) < 260 && Math.abs(feet - e.y) < 90) return { act: 'talk', arg: fatZone(e), x: e.x, y: e.y - 140, hint: t('bq_hint_fat') };
        return null;
    }
    const fatZone = (e) => { const z = W.zones.find(q => q.boss === 'fatelf' && e.x > q.x0 - 200 && e.x < q.x1 + 200 && Math.abs((q.y0 + q.y1) / 2 - e.y) < 600); return z ? z.id : 0; };
    // topshiriqlar paneli (chap tomonda, do'kon ta'sirlari ostida) va NPC ustidagi "!" / "?" belgilari
    function drawQuests(scene, now) {
        const qs = (O.myBuffs && O.myBuffs.q) || {}, lines = [];
        ['tooth', 'kids'].forEach((q) => { const st = qs[q] || 0; if (st === 1 || st === 2) lines.push((st === 2 ? '✔ ' : '• ') + t('bq_track_' + q + '_' + st)); });
        if (O.rq) lines.push(rqTrack(O.rq));
        O.qTxt.setText(lines.length ? t('bq_quests') + '\n' + lines.join('\n') : '').setVisible(lines.length > 0);
        const g = O.qMarkG; g.clear();
        W.npcs.forEach((n) => {
            if ((!n.q && !n.rq) || Math.abs(n.x - (scene.cameras.main.scrollX + 400)) > 700 || Math.abs(n.y - (scene.cameras.main.scrollY + 300)) > 500) return;
            // razvedkachi: topshiriq yo'q - "!", bajarilgan va shu lokatsiya - "?"
            const st = n.rq ? (!O.rq ? 0 : O.rq.got >= O.rq.n && O.rq.loc === n.loc ? 2 : 1) : (qs[n.q] || 0), mark = st === 0 ? '!' : st === 2 ? '?' : '';
            let im = O.qMarks.get(n.id);
            if (!im) { im = scene.add.text(n.x, n.y - 78, '', { fontFamily: FONT, fontSize: '16px', color: '#ffeb3b', stroke: '#000', strokeThickness: 5 }).setOrigin(0.5).setDepth(3.6); O.qMarks.set(n.id, im); }
            const o = O.npcs.get(n.id);
            im.setText(mark).setPosition(o ? o.x : n.x, n.y - 78 + Math.sin(now / 200) * 4).setColor(st === 2 ? '#69f0ae' : '#ffeb3b');
        });
        // qafas: boss yengilgach - ochiq
        O.cageImgs = (O.cageImgs || []).filter(im => im.active && im.scene);
        O.cageImgs.forEach((im) => { const open = (O.cagesOpen || []).includes(im.cageZone); if (open !== im.isOpen) { im.isOpen = open; im.setTexture(open ? 'bm_p_kidcage_open' : 'bm_p_kidcage'); } });
    }
    // ===== DUSHMAN O'QLARI: turiga qarab rasm (o'q - yo'nalishiga, tosh - aylanib, xarsang - dumalab, bomba / fugu - yerda pilik) =====
    const ROT_SHOTS = { drill: 1, antler: 1, ore: 1, spear: 1, thorn: 1, arrow: 1, fire: 1, fish: 1, sqfish: 1, crescent: 1, missile: 1, cannon: 0 };
    const GLOW_SHOTS = { antler: 0xff7a1a, ore: 0xffb04a, dark: 0x9a4aff, orb: 0xb388ff, fire: 0xff7a1a, lava: 0xff7a1a, spore: 0x9cff6e, acid: 0x9cff6e, skull: 0x9a6aff, crescent: 0x9a6aff, missile: 0xff9100, flame: 0xff7a1a, ink: 0x311b92 };
    // O'Q HAQIQIY JOYIDA: server holati ~60 ms da bir keladi va tarmoqda kechikadi - tez o'q ekranda orqada qolib, "tegmasa ham" urardi.
    // Tezligi bo'yicha kelgan paytidan beri (+ taxminiy kechikish) oldinga suriladi
    const SHOT_R = { antler: 20, hrock: 12, drill: 16 };   // tegish radiusi serverdagi bilan bir xil (oddiysi - 9)
    const NOHIDE_SHOTS = { shock: 1, flame: 1, mudwave: 1, boulder: 1, snowboulder: 1, gboulder: 1, brock: 1, gift: 1, mine: 1, fugu: 1, puck: 1 };   // to'lqinlar va katta toshlar - o'zgacha
    function leadShot(s, now) {
        if (s.st || !(s.vx || s.vy)) return s;
        const t = Math.max(0, Math.min(0.12, (now - (O.shotAt || now)) / 1000 + 0.01));   // kelganidan beri o'tgan vaqt (ortiqcha oldinga surilmasin)
        return Object.assign({}, s, { x: s.x + (s.vx || 0) * t, y: s.y + (s.vy || 0) * t + (s.a ? 300 * t * t : 0) });
    }
    function drawShots(scene, now) {
        const seen = new Set();
        (O.shotList || []).forEach((s0) => {
            const s = leadShot(s0, now);
            seen.add(s.id);
            let im = O.shots.get(s.id);
            // QAHRAMONGA TEGDI: kichik o'q ekranda shu zahoti yo'qoladi (server zarari biroz keyin keladi - o'q tana ichidan "o'tib ketgandek" ko'rinmasin)
            const hh = X.hero(), gone = O.shotGone || (O.shotGone = new Set());
            if (!gone.has(s.id) && !s0.st && (s0.vx || s0.vy) && !NOHIDE_SHOTS[s.k] && !(s.sc > 2) && hh && !hh.isDead && Math.abs(s.x - hh.x) < 9 + (SHOT_R[s.k] || 9) && Math.abs(s.y - hh.y) < 21 + (SHOT_R[s.k] || 9)) { gone.add(s.id); puff(s.x, s.y, GLOW_SHOTS[s.k] || 0xffe0b2, 6); }
            if (gone.has(s.id)) { if (im) { im.setVisible(false); if (im.glow) im.glow.setVisible(false); } return; }
            if (!im) {
                const key = s.k === 'brock' && TEX.brock ? A().enemyKey(TEX.brock, 0) : s.k === 'antler' && TEX.fhantler ? A().enemyKey(TEX.fhantler, 0) : scene.textures.exists('bm_sh_' + s.k) ? 'bm_sh_' + s.k : 'bm_sh_orb';
                im = scene.add.image(s.x, s.y, key).setDepth(4.25);
                im.k = s.k; im.px = s.x;
                if (GLOW_SHOTS[s.k] !== undefined) im.glow = pxDisc(scene, s.x, s.y, 14, 14, GLOW_SHOTS[s.k], 0.25).setDepth(4.2).setBlendMode(Phaser.BlendModes.ADD);
                O.shots.set(s.id, im);
            }
            im.setPosition(s.x, s.y);
            if (s.k === 'boulder' || s.k === 'snowboulder') { const r = (s.sc || 2) * 13; im.setScale(r * 2 / 54); im.rotation += (s.x - im.px) / Math.max(8, r); im.setY(s.y + 2); }
            else if (s.k === 'mine') { im.setRotation(0).setTexture(s.st && Math.floor(now / 180) % 2 ? 'bm_sh_mine_lit' : 'bm_sh_mine'); }
            else if (s.k === 'gift') {   // sovg'a: chana tepasida kutayotganda ko'rinmaydi; yerga tushgach - pilik (qizil-yashil lipillaydi)
                im.setVisible(!s.wt);
                if (s.st) { im.setTexture(Math.floor(now / 110) % 2 ? 'bm_sh_gift_lit' : 'bm_sh_gift').setRotation(0); const fx = O.fxG; fx.lineStyle(2, 0xff5252, 0.5 + 0.4 * Math.sin(now / 70)); fx.strokeEllipse(s.x, s.y + 6, 124, 22); }   // portlash doirasi
                else im.rotation += 0.15;
            }
            else if (s.k === 'puck') im.setRotation(0);
            else if (s.k === 'brock') im.rotation += 0.1;   // Bullkan toshi - o'z o'lchamida
            else if (s.st && (s.k === 'gbomb')) { im.setTexture(Math.floor(now / 110) % 2 ? 'bm_sh_gbomb_lit' : 'bm_sh_gbomb').setRotation(0); }
            else if (s.k === 'gboulder') {   // S1 xarsangi: shiftda kutayotganda ko'rinmaydi - faqat chang to'kiladi; tushayotganda aylanadi
                im.setScale(s.sc || 2).setVisible(!s.wt);
                if (!s.wt) im.angle += 6;
                else if (Math.random() < 0.3) { const pb = scene.add.rectangle(s.x + Phaser.Math.Between(-10, 10), s.y - 8, 4, 4, 0x8f8f96).setDepth(4.2); scene.tweens.add({ targets: pb, y: pb.y + 60, alpha: 0, duration: 400, onComplete: () => pb.destroy() }); }
            }
            else if (s.k === 'fugu') { if (s.st) im.setTexture('bm_sh_fugu_big').setRotation(0).setScale(1 + 0.12 * Math.sin(now / 60)).setTint(Math.floor(now / 120) % 2 ? 0xff8a80 : 0xffffff); else im.setRotation(s.d || 0).setScale(1.2); }
            else {
                if (ROT_SHOTS[s.k]) im.setRotation(s.d || 0);
                else if (s.k === 'rock' || s.k === 'web' || s.k === 'bomb' || s.k === 'cannon' || s.k === 'iceboulder' || s.k === 'gbomb' || s.k === 'bigsnow' || s.k === 'icesnow') im.rotation += 0.2;
                if (s.sc) im.setScale(s.sc);
            }
            if (s.k === 'shock' || s.k === 'flame' || s.k === 'mudwave') im.setOrigin(0.5, 1).setY(s.y + 12).setFlipX(Math.abs(s.d || 0) > 1.5);
            if (s.k === 'missile' && (!im.smokeAt || now - im.smokeAt > 70)) { im.smokeAt = now; const p = pxDisc(scene, s.x - Math.cos(s.d || 0) * 14, s.y - Math.sin(s.d || 0) * 14, 6, 6, 0x9e9e9e, 0.6).setDepth(4.15); scene.tweens.add({ targets: p, scale: 2, alpha: 0, duration: 500, onComplete: () => p.destroy() }); }
            if (s.k === 'skull') im.setAlpha(0.75 + 0.25 * Math.sin(now / 70 + s.id));
            im.px = s.x;
            if (im.glow) im.glow.setPosition(s.x, s.y).setScale(s.sc || 1);
        });
        if (O.shotGone && O.shotGone.size) O.shotGone.forEach((id) => { if (!seen.has(id)) O.shotGone.delete(id); });
        O.shots.forEach((im, id) => { if (!seen.has(id)) { if (im.k === 'gboulder' && im.visible) gDust(scene, im.x, im.y + 10, 5, 0x72727a); if (im.glow) im.glow.destroy(); im.destroy(); O.shots.delete(id); } });
    }
    // ===== HUJUM MAYDONLARI =====
    const AREA_COL = { void: 0x7c4dff, fire: 0xff6d00, ice: 0x4fc3f7, icespike: 0x4fc3f7, root: 0x8d6e63, roots: 0x8d6e63, rock: 0x9e9e9e, gspike: 0x9e9e9e, bones: 0xd7ccc8, bonewall: 0xd7ccc8, burst: 0x8d6e63, geyser: 0x29b6f6,
        crystal: 0x18ffff, frost: 0xb3e5fc, soul: 0xb388ff, greenfire: 0x76ff03, poison: 0x9ccc65, magma: 0xff5722, acid: 0x9ccc65, spore: 0xc0ca33, ink: 0x311b92, meteor: 0xff6d00, log: 0x8d6e63, icicle: 0x4fc3f7, snow: 0xe3f2fd, shadow: 0x000000,
        dark: 0x7c4dff, tail: 0x9ccc65, tentacle: 0xff4081, vortex: 0xb3e5fc, bone: 0xd7ccc8 };
    const PILLAR_TEX = { void: 'bm_hz_void', fire: 'bm_hz_fire', ice: 'bm_hz_ice', icespike: 'bm_hz_ice', root: 'bm_hz_roots', roots: 'bm_hz_roots', rock: 'bm_hz_spikes', gspike: 'bm_hz_gspike', bones: 'bm_hz_bones', bonewall: 'bm_hz_bonewall', burst: 'bm_hz_burst', geyser: 'bm_hz_geyser' };
    const FALL_TEX = { rock: 'bm_sh_boulder', log: 'bm_fall_log', icicle: 'bm_fall_icicle', meteor: 'bm_fall_meteor', acid: 'bm_fall_acid', snow: 'bm_fall_snow' };
    // piksel olov palitralari (tashqi, o'rta, o'zak, uchqun) - S1 dagidek
    const BREATH_PX = { greenfire: [0x1b5e20, 0x64dd17, 0xccff90, 0xf4ff81], fire: [0xb3261e, 0xff7a1a, 0xffc35a, 0xfff2b0] };
    function pxBreath(g, mx, my, f, len, hMax, now, P, drop = 0, kd = 1) {
        const B = 6, snap = (v) => Math.round(v / 2) * 2;
        for (let d = 0; d < len; d += B) {
            const k = d / len, n = 0.5 * Math.sin(now / 40 + d * 0.37) + 0.5 * Math.sin(now / 23 + d * 0.11);
            const h = (6 + k * (hMax - 6)) * (0.8 + 0.22 * n) * (k > 0.85 ? (1 - k) / 0.15 : 1);
            const x = Math.round((mx + f * d) / B) * B - (f < 0 ? B : 0), H = Math.max(2, snap(h)), h2 = Math.max(2, snap(H * 0.62)), h3 = Math.max(2, snap(H * 0.3)), y = snap(my + drop * Math.min(1, k / kd));
            g.fillStyle(P[0], 0.95); g.fillRect(x, y - H, B, H * 2);
            g.fillStyle(P[1], 1); g.fillRect(x, y - h2, B, h2 * 2);
            g.fillStyle(P[2], 1); g.fillRect(x, y - h3, B, h3 * 2);
            if (k > 0.45 && n > 0.55) { g.fillStyle(P[3], 1); g.fillRect(x, y - H - 6, 4, 4); }       // tepaga sachragan uchqun
            if (k > 0.3 && n < -0.7) { g.fillStyle(P[0], 0.7); g.fillRect(x + 1, y - H - 12 - (now / 8 + d) % 18, 4, 4); }   // tutun bo'lakchasi
        }
    }
    const BREATH_COL = { fire: [0xfff2b0, 0xffc35a, 0xff7a1a, 0xb3261e], greenfire: [0xf4ff81, 0xb2ff59, 0x76ff03, 0x33691e], poison: [0xdcedc8, 0x9ccc65, 0x689f38, 0x33691e], frost: [0xffffff, 0xe1f5fe, 0xb3e5fc, 0x4fc3f7] };
    function drawAreas(scene, now) {
        const lo = O.areaLo, hi = O.areaHi;
        lo.clear(); hi.clear();
        O.areaMap.forEach((o) => {
            const [type, sub] = o.k.split(':'), col = AREA_COL[sub] !== undefined ? AREA_COL[sub] : 0xff1744;
            const warnMs = Math.max(0, o.wn * 30 - (now - o.upd)), warn = warnMs > 0;
            if (o.w0 === undefined) o.w0 = Math.max(1, warnMs);
            const p = warn ? 1 - warnMs / o.w0 : 1;   // ogohlantirish qanchalik o'tdi (0..1)
            const cx = o.x + o.w / 2, by = o.y + o.h;
            o.imgs = o.imgs || [];
            if (!warn && !o.active) { o.active = true; o.actAt = now; onActivate(scene, o, type, sub, cx, by); }
            const pulse = 0.5 + 0.5 * Math.sin(now / 70);
            if (o.k === 'mark:mimic' || o.k === 'mark:mole') {   // MIMIK ROCK shu yerga tushadi / MR. HOL shu yerdan chiqadi: yerda doira va ogohlantirish uchburchagi "!"
                lo.fillStyle(0xff1744, 0.2 + 0.25 * pulse); lo.fillEllipse(cx, by - 2, o.w, 18);
                lo.lineStyle(3, 0xff1744, 0.6 + 0.4 * pulse); lo.strokeEllipse(cx, by - 2, o.w, 18);
                hi.fillStyle(0x000000, 1); hi.fillTriangle(cx - 21, by + 34, cx + 21, by + 34, cx, by - 3);
                hi.fillStyle(pulse > 0.5 ? 0xffd600 : 0xff9100, 1); hi.fillTriangle(cx - 15, by + 30, cx + 15, by + 30, cx, by + 4);
                hi.fillStyle(0x000000, 1); hi.fillRect(cx - 2, by + 13, 4, 9); hi.fillRect(cx - 2, by + 24, 4, 4);
                return;
            }
            if (type === 'fall') {
                lo.fillStyle(0x000000, 0.25 + 0.35 * p); lo.fillEllipse(cx, by, o.w * (0.45 + 0.55 * p), 16);
                if (sub !== 'shadow') { lo.lineStyle(3, col, 0.6 + 0.4 * pulse); lo.strokeEllipse(cx, by, o.w * 1.1, 20); }
                else { lo.lineStyle(3, 0xff1744, 0.5 + 0.4 * pulse); lo.strokeEllipse(cx, by, o.w * (0.45 + 0.55 * p), 20); }
                const tex = FALL_TEX[sub];
                if (tex && warn && warnMs < 520) {
                    if (!o.drop) { o.drop = scene.add.image(cx, by - 520, tex).setOrigin(0.5, 1).setDepth(3.2); if (sub === 'rock') o.drop.setScale(1.0); o.imgs.push(o.drop); }
                    const q = 1 - warnMs / 520; o.drop.setPosition(cx, by - 520 * (1 - q * q)); if (sub === 'rock' || sub === 'snow') o.drop.rotation += 0.15;
                }
            } else if (type === 'pillar' && sub === 'geyser') {
                // GEYZER (S2 dagidek): suv yuzasida pufakchalar, keyin ekranning tepasigacha suv ustuni
                const L = lakeAt(cx, by), wy = L ? L.y + 4 : by - 60;
                if (warn) {
                    lo.fillStyle(0x0a1a1f, 0.8); lo.fillEllipse(cx, wy, 64, 10);
                    for (let k = 0; k < 6; k++) { lo.fillStyle(0xb2ebf2, 0.9); lo.fillCircle(cx - 20 + k * 8, wy - ((now / 4 + k * 30) % 60), 3); }
                } else {
                    const top = Math.max(o.y, O.scene.cameras.main.scrollY - 20) + Math.sin(now / 50) * 6;
                    hi.fillStyle(0x0a0a0a, 0.6); hi.fillRect(cx - 28, top, 56, wy - top + 10);
                    hi.fillStyle(0x4fc3f7, 0.9); hi.fillRect(cx - 25, top, 50, wy - top + 10);
                    hi.fillStyle(0xb3e5fc, 1); hi.fillRect(cx - 14, top, 28, wy - top + 10);
                    hi.fillStyle(0xffffff, 1); hi.fillRect(cx - 5, top, 10, wy - top + 10);
                    for (let k = 0; k < 8; k++) { const a = now / 90 + k * 0.8, r = 20 + (k * 7) % 22; hi.fillStyle(0xe1f5fe, 0.9); hi.fillCircle(cx + Math.cos(a) * r, top + Math.sin(a) * 8 - 6, 5); }
                    for (let k = 0; k < 6; k++) { const a = now / 120 + k; hi.fillStyle(0xe1f5fe, 0.8); hi.fillCircle(cx + Math.cos(a) * 34, wy - 4 + Math.sin(a) * 4, 4); }
                }
            } else if (type === 'pillar') {
                if (warn && sub === 'gspike') {
                    // S1 dagidek: yer yoriladi, o'rtasida to'q sariq nur lipillaydi, chang ko'tariladi
                    const blink = Math.floor(now / 80) % 2;
                    lo.fillStyle(0x000000, 0.8); for (let k = -4; k <= 4; k++) lo.fillRect(cx + k * 8 + (k % 2) * 3, by - 4 - Math.abs(k % 3) * 2, 6, 4 + Math.abs(k % 3) * 2);
                    lo.fillStyle(0xff6d00, blink ? 0.9 : 0.4); lo.fillRect(cx - 3, by - 8, 6, 8);
                    if (Math.random() < 0.3) gDust(scene, cx, by - 4, 1);
                } else if (warn) {
                    // qayergacha urishi: shaffof ustun (balandligi bilan), yerda yorqin halqa
                    lo.fillStyle(col, 0.06 + 0.12 * p); lo.fillRect(o.x + o.w * 0.15, o.y, o.w * 0.7, o.h);
                    lo.fillStyle(col, 0.22 + 0.33 * p); lo.fillEllipse(cx, by - 2, o.w * 1.3, 20);
                    lo.lineStyle(3, col, 0.6 + 0.4 * pulse); lo.strokeEllipse(cx, by - 2, o.w * (0.5 + 0.8 * p), 20);
                    if (sub === 'geyser') for (let k = 0; k < 3; k++) { lo.fillStyle(0xe1f5fe, 0.8); lo.fillCircle(cx - 14 + k * 14, by - 6 - ((now / 6 + k * 13) % 26), 3); }
                    else if (sub === 'root' || sub === 'roots') {
                        // yer yoriladi: butun eni bo'ylab yoriq, tuproq bo'laklari sakraydi, uchlari chiqib turadi
                        lo.fillStyle(0x2a1a0e, 0.9); lo.fillRect(o.x, by - 3, o.w, 4);
                        for (let x = o.x + 3; x < o.x + o.w - 3; x += 9) { const j = Math.floor(now / 70 + x) % 3; lo.fillStyle(0x6d4c41, 1); lo.fillRect(x, by - 6 - j * 2 - p * 4, 4, 4); }
                        for (let x = o.x + 8; x < o.x + o.w - 6; x += 14) { lo.fillStyle(0x5c3e22, 1); lo.fillRect(x, by - 4 - p * 10, 3, p * 10); }
                    } else for (let k = 0; k < 3; k++) { lo.fillStyle(col, 1); lo.fillRect(cx - 18 + k * 16 + Math.sin(now / 40 + k) * 2, by - 5 - p * 6, 5, 5); }
                }
            } else if (type === 'beam') {
                const L = Math.hypot(o.x2 - o.x, o.y2 - o.y) || 1, ux = (o.x2 - o.x) / L, uy = (o.y2 - o.y) / L;
                if (warn) { lo.lineStyle(2, col, 0.35 + 0.5 * pulse); for (let d = 0; d < L; d += 26) lo.lineBetween(o.x + ux * d, o.y + uy * d, o.x + ux * Math.min(L, d + 14), o.y + uy * Math.min(L, d + 14)); hi.fillStyle(col, 0.5 + 0.4 * pulse); hi.fillCircle(o.x, o.y, 6 + p * 8); }
                else {
                    const j = (Math.random() - 0.5) * 4;
                    hi.lineStyle(o.w * 1.7, col, 0.28); hi.lineBetween(o.x, o.y + j, o.x2, o.y2 + j);
                    hi.lineStyle(o.w * 0.75, col, 0.75); hi.lineBetween(o.x, o.y, o.x2, o.y2);
                    hi.lineStyle(o.w * 0.3, 0xffffff, 0.95); hi.lineBetween(o.x, o.y, o.x2, o.y2);
                    hi.fillStyle(0xffffff, 0.9); hi.fillCircle(o.x, o.y, 10 + Math.random() * 4);
                    for (let k = 0; k < 4; k++) { const d = Math.random() * L; hi.fillStyle(col, 0.9); hi.fillRect(o.x + ux * d + (Math.random() - 0.5) * 20, o.y + uy * d + (Math.random() - 0.5) * 20, 3, 3); }
                }
            } else if (type === 'breath') {
                // PIKSEL OLOV (S1 dagi semiz elf olovidek): 6 px ustunlar, og'izdan uzoqlashgan sari kengayadi va lipillaydi
                const f = o.f || 1, mx = f > 0 ? o.x : o.x + o.w, mouthFire = sub === 'greenfire', my = mouthFire ? o.y + 44 : o.y + o.h / 2, B = 6;
                const pal = BREATH_PX[sub] || (BREATH_COL[sub] || BREATH_COL.fire).slice().reverse();
                if (warn) { for (let k = 0; k < 6; k++) { hi.fillStyle(k % 2 ? pal[2] : pal[1], 1); hi.fillRect(Math.round((mx + f * Math.random() * 30) / 4) * 4 - 2, Math.round((my + (Math.random() - 0.5) * 28) / 4) * 4 - 2, 4, 4); } }
                else if (mouthFire) pxBreath(hi, mx, my, f, o.w, 34, now, pal, 51, 0.4);   // og'izdan, pastga egilib (server FLAME bilan bir xil)
                else pxBreath(hi, mx, my, f, o.w, o.h / 2, now, pal);
            } else if (type === 'patch') {
                const a0 = warn ? 0.3 * p : 0.55;
                if (sub === 'magma') {
                    if (!warn && !o.lava) { o.lava = scene.add.tileSprite(o.x, by - 14, o.w, 14, 'bm_lava').setOrigin(0, 0).setDepth(3.06); o.imgs.push(o.lava); }
                    if (o.lava) o.lava.tilePositionX = now * 0.02;
                    lo.lineStyle(2, 0xff5722, warn ? 0.4 + 0.5 * pulse : 0.6); lo.strokeEllipse(cx, by - 6, o.w, 14);
                } else if (sub === 'fire') {
                    hi.fillStyle(0xff6d00, a0 * 0.5); hi.fillEllipse(cx, by - 4, o.w, 12);
                    if (!warn) for (let k = 0; k < Math.max(3, Math.round(o.w / 22)); k++) { const fx2 = o.x + 8 + k * (o.w - 16) / Math.max(1, Math.round(o.w / 22) - 1), fh = 14 + 10 * Math.abs(Math.sin(now / 80 + k * 1.7)); hi.fillStyle(0xff7a1a, 0.85); hi.fillTriangle(fx2 - 7, by - 2, fx2 + 7, by - 2, fx2, by - 2 - fh); hi.fillStyle(0xffd54f, 0.9); hi.fillTriangle(fx2 - 3, by - 2, fx2 + 3, by - 2, fx2, by - 2 - fh * 0.55); }
                } else if (sub === 'acid') {
                    hi.fillStyle(0x76ff03, a0 * 0.6); hi.fillEllipse(cx, by - 4, o.w, 12);
                    if (!warn) for (let k = 0; k < 4; k++) { const q = (now / 600 + k / 4) % 1; hi.lineStyle(2, 0xccff90, 1 - q); hi.strokeCircle(o.x + 12 + k * (o.w - 24) / 3, by - 6 - q * 8, 2 + q * 4); }
                } else if (sub === 'ice') {
                    hi.fillStyle(0xb3e5fc, a0 * 0.8); hi.fillEllipse(cx, by - 3, o.w, 10); hi.fillStyle(0xffffff, 0.8 * pulse); hi.fillRect(o.x + o.w * 0.3, by - 6, 6, 2); hi.fillRect(o.x + o.w * 0.65, by - 5, 4, 2);
                }
            } else if (type === 'cloud') {
                for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + now / 1400; hi.fillStyle(col, sub === 'ink' ? 0.55 : 0.32); hi.fillCircle(cx + Math.cos(a) * o.w * 0.28, o.y + o.h / 2 + Math.sin(a) * o.h * 0.22, o.h * 0.36 + Math.sin(now / 300 + k) * 4); }
                if (sub === 'spore') for (let k = 0; k < 5; k++) { hi.fillStyle(0xf0f4c3, 0.8); hi.fillCircle(o.x + ((k * 37 + now / 20) % o.w), o.y + ((k * 23 + now / 35) % o.h), 2); }
            } else if (type === 'ring') {
                const rcx = cx, rcy = by - 60, R = o.w / 2;
                if (warn) { lo.lineStyle(2, col, 0.3 + 0.4 * pulse); lo.strokeEllipse(rcx, rcy, R * 2 * p, R * 0.7 * p); }
                else for (let k = 0; k < 18; k++) { const a = now / 260 + k * 0.35, rr = R * (1 - (k / 18)), q = (now / 900 + k / 18) % 1; hi.fillStyle(k % 3 ? 0xe1f5fe : 0xffffff, 0.75); hi.fillCircle(rcx + Math.cos(a) * rr, rcy + Math.sin(a) * rr * 0.35, 2 + (1 - q) * 3); }
            } else if (type === 'slam') {
                // KRAKEN QO'LI (S2 dagidek): avval suvdan pog'ona yonida ko'tariladi (pog'onada qizil ogohlantirish), keyin pog'ona ustiga yotqiziladi
                const L = lakeAt(cx, by), wy = (L ? L.y : by + 60) + 14, side = o.f || (cx < (L ? L.x + L.w / 2 : cx) ? -1 : 1), sx0 = o.x, sx1 = o.x + o.w, pts = [];
                const bx = side < 0 ? sx0 - 30 : sx1 + 30;
                if (warn) {
                    if (Math.floor(now / 120) % 2) { hi.fillStyle(0xff1744, 0.32); hi.fillRect(sx0, by - 150, sx1 - sx0, 150); }
                    const top = by - 190 - 30 * p;
                    for (let i = 0; i <= 14; i++) { const q = i / 14; pts.push([bx + Math.sin(q * 3 + now / 150) * 10 - side * q * q * 60, wy - q * (wy - top)]); }
                    tentacle(hi, pts, 36, 16);
                } else {
                    const el = now - o.actAt, back = o.t * 30 < 120 ? 1 - (o.t * 30) / 120 : 0;
                    for (let i = 0; i <= 10; i++) { const q = i / 10; pts.push([bx, wy - q * (wy - (by - 14 - back * 160))]); }
                    const n = Math.ceil((sx1 - sx0 + 30) / 10) * Math.min(1, el / 90);
                    for (let i = 0; i <= n; i++) pts.push([bx - side * i * 10, by - 14 - back * 160 + Math.sin(i * 0.7 + now / 60) * 2]);
                    tentacle(hi, pts, 36, 14);
                }
            } else if (type === 'vine') {
                // GUL TOMIRI: poyasidan o'yinchiga - avval yashil uzuq chiziq, keyin tikanli tomir otilib, qaytib tortiladi
                if (warn) { lo.lineStyle(3, 0x7cb342, 0.3 + 0.5 * pulse); for (let d = 0; d < 1; d += 0.08) lo.lineBetween(o.x + (o.x2 - o.x) * d, o.y + (o.y2 - o.y) * d, o.x + (o.x2 - o.x) * (d + 0.04), o.y + (o.y2 - o.y) * (d + 0.04)); }
                else {
                    const el = now - o.actAt, q = el < 160 ? el / 160 : Math.max(0, 1 - Math.max(0, el - 260) / 140), tx2 = o.x + (o.x2 - o.x) * q, ty2 = o.y + (o.y2 - o.y) * q;
                    hi.lineStyle(16, 0x1b3a12, 1); hi.lineBetween(o.x, o.y, tx2, ty2); hi.lineStyle(10, 0x558b2f, 1); hi.lineBetween(o.x, o.y, tx2, ty2); hi.lineStyle(3, 0x8bc34a, 1); hi.lineBetween(o.x, o.y - 3, tx2, ty2 - 3);
                    const L = Math.hypot(tx2 - o.x, ty2 - o.y), ux = (tx2 - o.x) / (L || 1), uy = (ty2 - o.y) / (L || 1);
                    for (let d = 14; d < L; d += 22) { hi.fillStyle(0xe8e0c8, 1); hi.fillTriangle(o.x + ux * d - uy * 6, o.y + uy * d + ux * 6, o.x + ux * (d + 6) - uy * 6, o.y + uy * (d + 6) + ux * 6, o.x + ux * (d + 3) - uy * 12, o.y + uy * (d + 3) + ux * 12); }
                    hi.fillStyle(0x33691e, 1); hi.fillCircle(tx2, ty2, 9);
                }
            } else if (type === 'bite' || type === 'pinch') {
                // GUL TISHLASHI / KRAB QISQICHI: nishonda qizil (to'q sariq) halqa
                if (warn) { const c2 = type === 'bite' ? 0xff1744 : 0xff6d00; lo.fillStyle(c2, 0.1 + 0.15 * p); lo.fillEllipse(cx, by - o.h / 2, o.w * 1.2, o.h); lo.lineStyle(3, c2, 0.5 + 0.4 * pulse); lo.strokeEllipse(cx, by - o.h / 2, o.w * (0.7 + 0.5 * p), o.h); }
            } else if (type === 'mark') {
                // SOVG'A TUSHADIGAN JOY: yerda qizil doira (portlash radiusi) - sovg'a yaqinlashgan sari to'yinadi, ustida tushayotgan belgi
                lo.fillStyle(0xff1744, 0.08 + 0.2 * p); lo.fillEllipse(cx, by - 2, o.w, 16);
                lo.lineStyle(3, 0xff5252, 0.45 + 0.45 * pulse); lo.strokeEllipse(cx, by - 2, o.w * (0.55 + 0.45 * p), 16);
                lo.fillStyle(0xffd54f, 0.7 + 0.3 * pulse); lo.fillTriangle(cx - 7, by - 34 - 6 * pulse, cx + 7, by - 34 - 6 * pulse, cx, by - 22 - 6 * pulse);
            } else if (type === 'fist') {
                // BIGFUT MUSHTI: qo'li yelkasidan o'yinchi BOSHI USTIGA cho'ziladi (yerda soya kattalashadi), keyin pastga uradi
                const bf = enemyFind(e => e.k === 'bigfoot');
                const sx = bf ? bf.x - 60 : cx - 300, sy = bf ? bf.y + 10 : o.y - 200;   // oldingi yelkasi (boshi ortida)
                const el = warn ? 0 : now - o.actAt, fy = warn ? o.y - 24 + p * 14 : Math.min(by - 30, o.y - 10 + (by - 20 - o.y) * Math.min(1, el / 90));
                lo.fillStyle(0x000000, 0.2 + 0.4 * p); lo.fillEllipse(cx, by - 2, o.w * (0.5 + 0.5 * p), 14);
                if (warn) { lo.lineStyle(3, 0xff1744, 0.5 + 0.4 * pulse); lo.strokeEllipse(cx, by - 2, o.w * (0.5 + 0.5 * p), 18); }
                // QO'L BUKILMAYDI: yelkadan mushtgacha to'g'ri (rasmdagi junli bilak takrorlanadi); bigfutning ORQASIDAN chiqadi - yuzini yopmaydi, musht - oldinda
                const fang = Math.atan2(fy - sy, cx - sx), len = Math.hypot(cx - sx, fy - sy);
                if (TEX.bffarm) {
                    if (!o.armA) { o.armA = scene.add.tileSprite(sx, sy, 10, 72, A().enemyKey(TEX.bffarm, 0)).setOrigin(0, 0.5).setDepth(-1.26); o.imgs.push(o.armA); }
                    o.armA.setPosition(sx, sy).setSize(Math.max(10, len - 20), 72).setRotation(fang);
                } else for (const [wd, c] of [[34, 0x2a3a5a], [28, 0xb8d4ee], [16, 0xe8f4ff]]) { hi.lineStyle(wd, c, 1); hi.lineBetween(sx, sy, cx, fy); }
                if (!o.fist) { o.fist = scene.add.image(cx, fy, TEX.bffist ? A().enemyKey(TEX.bffist, 0) : 'bm_bf_fist').setOrigin(0.4, 0.5).setDepth(3.3); o.imgs.push(o.fist); }   // rasmdagi musht (bo'g'imlari - bilak yo'nalishida)
                o.fist.setPosition(cx, fy).setRotation(TEX.bffist ? fang : 0);
            } else if (type === 'tvfire') {
                // MR. WHO: televizor ustidan baland olov (ogohlantirish - ekrandagi olov rasmi)
                if (!warn) for (let k = 0; k < 7; k++) {
                    const fx2 = o.x + 6 + k * (o.w - 12) / 6, fh = o.h * (0.55 + 0.45 * Math.abs(Math.sin(now / 90 + k * 1.3)));
                    hi.fillStyle(0xd84300, 0.85); hi.fillRect(fx2 - 7, by - fh, 14, fh);
                    hi.fillStyle(0xff9a1a, 0.9); hi.fillRect(fx2 - 4, by - fh * 0.8, 8, fh * 0.8);
                    hi.fillStyle(0xffe27a, 0.95); hi.fillRect(fx2 - 2, by - fh * 0.45, 4, fh * 0.45);
                }
            } else if (type === 'tvfist') {
                // MR. WHO: televizor ichidan otilib chiqqan ko'k hologramma MUSHT
                if (!warn) {
                    const el = now - o.actAt, q = Math.min(1, el / 110), fy = by - q * (o.h - 30);
                    hi.fillStyle(0x1a66c8, 0.9); hi.fillRect(cx - 14, fy, 28, by - fy);
                    hi.fillStyle(0x3f9cff, 1); hi.fillRect(cx - 24, fy - 36, 48, 40);
                    hi.fillStyle(0xa8dcff, 1); for (let k = 0; k < 4; k++) hi.fillRect(cx - 22 + k * 12, fy - 36, 10, 9);
                    hi.fillStyle(0xffffff, 0.75); hi.fillRect(cx - 22, fy - 31, 44, 2);
                }
            } else if (type === 'flame') {
                drawSnakeFlame(hi, o, now, warn);
            } else if (type === 'tongue') {
                if (warn) { lo.lineStyle(2, 0xf48fb1, 0.3 + 0.5 * pulse); for (let d = 0; d < 1; d += 0.08) lo.lineBetween(o.x + (o.x2 - o.x) * d, o.y + (o.y2 - o.y) * d, o.x + (o.x2 - o.x) * (d + 0.04), o.y + (o.y2 - o.y) * (d + 0.04)); }
                else {
                    const el = now - o.actAt, q = el < 210 ? el / 210 : Math.max(0, 1 - Math.max(0, el - 300) / 120);
                    const tx2 = o.x + (o.x2 - o.x) * q, ty2 = o.y + (o.y2 - o.y) * q;
                    hi.lineStyle(10, 0xd81b60, 1); hi.lineBetween(o.x, o.y, tx2, ty2); hi.lineStyle(4, 0xf48fb1, 1); hi.lineBetween(o.x, o.y - 2, tx2, ty2 - 2);
                    hi.fillStyle(0xad1457, 1); hi.fillCircle(tx2, ty2, 10); hi.fillStyle(0xf8bbd0, 1); hi.fillCircle(tx2 - 3, ty2 - 3, 3);
                }
            } else if (type === 'rise') {
                if (warn) { lo.fillStyle(0x3e2723, 0.4 + 0.4 * p); lo.fillEllipse(cx, by, o.w * (0.6 + 0.4 * p), 10); for (let k = 0; k < 3; k++) { lo.fillStyle(0xd7ccc8, 1); lo.fillRect(cx - 14 + k * 12, by - 4 - p * 10 * ((k % 2) + 1), 3, 6); } }
            } else if (type === 'slash') {
                if (warn) { lo.lineStyle(3, col, 0.35 + 0.5 * pulse); lo.strokeEllipse(cx, by - o.h / 2, o.w, o.h * 0.9); }
            }
        });
    }
    // maydon faollashgan lahza: ustun otilib chiqadi, buyum yerga uriladi, iz chaqnaydi
    function onActivate(scene, o, type, sub, cx, by) {
        if (type === 'fall') {
            if (o.drop) o.drop.setVisible(false);
            if (sub !== 'shadow') { puff(cx, by - 8, AREA_COL[sub] || 0x9e9e9e, 14); scene.cameras.main.shake(90, 0.004); X.sfxAt('rumble', cx, 0.5); }
        } else if (type === 'pillar' && sub === 'geyser') { const L = lakeAt(cx, by); puff(cx, L ? L.y : by, 0x80deea, 16); scene.cameras.main.shake(160, 0.008); X.sfxAt('splash', cx, 0.8); }
        else if (type === 'pillar') {
            const key = PILLAR_TEX[sub] || 'bm_hz_spikes', im = scene.add.image(cx, by + 2, key).setOrigin(0.5, 1).setDepth(sub === 'geyser' ? 3.22 : 2.57);
            const isRoot = sub === 'root' || sub === 'roots', tw = scene.textures.get(key).getSourceImage(), sx = (o.w * (isRoot ? 1.3 : 1.15)) / tw.width, sy = o.h / tw.height;   // ildiz - zarar maydonidan kengroq chiziladi (tegmasa - zarar yo'q)
            im.setScale(sx, sy * 0.15); o.imgs.push(im);
            scene.tweens.add({ targets: im, scaleY: sy, duration: 110, ease: 'Back.Out' });
            const life = Math.max(isRoot ? 550 : 200, o.t * 30);
            scene.tweens.add({ targets: im, alpha: 0, delay: Math.max(0, life - 180), duration: 180 });
            puff(cx, by - 6, AREA_COL[sub] || 0x9e9e9e, sub === 'burst' ? 22 : 10);
            if (sub === 'burst' || sub === 'geyser') scene.cameras.main.shake(160, 0.008);
            if (sub === 'gspike') { scene.cameras.main.shake(200, 0.01); gDust(scene, cx, by - 4, 6); }
            X.sfxAt(sub === 'geyser' ? 'splash' : 'rumble', cx, 0.6);
            if ((sub === 'fire' || sub === 'void') && O.flares) O.flares.push({ x: cx, y: by - o.h / 2, r: 120, until: scene.time.now + life });
        } else if (type === 'vine') X.sfxAt('whip', cx, 0.8);
        else if (type === 'bite') { scene.cameras.main.shake(160, 0.008); puff(cx, by - o.h / 2, 0xd81b60, 10); X.sfxAt('whip', cx, 0.9); }
        else if (type === 'pinch') { scene.cameras.main.shake(160, 0.008); puff(cx, by - 30, 0x8d6e63, 10); X.sfxAt('thud', cx, 0.9); }
        else if (type === 'fist') { scene.time.delayedCall(90, () => { if (!O) return; scene.cameras.main.shake(260, 0.012); puff(cx, by - 6, 0xffffff, 18); puff(cx, by - 4, 0x90a4ae, 8); X.sfxAt('thud', cx, 1); }); }
        else if (type === 'slam') { X.sfxAt('whip', cx, 0.7); scene.time.delayedCall(90, () => { if (!O) return; scene.cameras.main.shake(250, 0.01); puff(cx, by - 6, 0xf48fb1, 16); puff(cx, by - 6, 0x80deea, 10); X.sfxAt('thud', cx, 1); }); }
        else if (type === 'slash') {
            const key = 'bm_slash_' + (sub || 'dark'), im = scene.add.image(cx, by - o.h / 2, scene.textures.exists(key) ? key : 'bm_slash_dark').setDepth(3.3);
            im.setDisplaySize(o.w * 1.1, o.h); o.imgs.push(im);
            scene.tweens.add({ targets: im, alpha: 0, duration: 260, onComplete: () => im.setVisible(false) });
            X.sfxAt('whoosh', cx, 0.7);
        } else if (type === 'beam') { X.sfxAt('laser', o.x, 0.7); scene.cameras.main.shake(120, 0.003); }
        else if (type === 'breath') X.sfxAt('whoosh', o.x, 0.6);
        else if (type === 'tongue') X.sfxAt('whoosh', o.x, 0.8);
    }
    // ===== SANDIQ =====
    function nearChest(hero) {
        if (!hero || hero.isDead) return null;
        for (const c of W.chests) if (!O.opened.has(c.id) && Math.abs(hero.x - c.x) < 60 && Math.abs(hero.y + 24 - c.y) < 60) return c;
        return null;
    }
    // ===== DO'KON OYNASI: sarguzasht buyumlari (sotib olinganda darhol ishlaydi) =====
    const shopOpen = () => !!document.getElementById('bm-shop');
    function closeShop() { const el = document.getElementById('bm-shop'); if (el) (el.parentNode || el).remove(); }
    function renderShopWallet(coins) {
        const w = document.querySelector('#shop-panel .mf-wallet b');
        const me = typeof currentUser !== 'undefined' && currentUser ? currentUser : null;
        if (w) w.textContent = coins !== undefined ? coins : me ? me.coins || 0 : 0;
    }
    function openShop() {
        const host = document.getElementById('game-container');
        if (!host || !W.bigShop) return;
        closeShop();
        const sc = O.scene, coin = window.FarmArt ? `<img class="px-coin" src="${window.FarmArt.icon('coin')}" alt="">` : '';
        const me = typeof currentUser !== 'undefined' && currentUser ? currentUser : null;
        const el = document.createElement('div');
        el.id = 'shop-panel'; el.classList.add('bm-shop-panel');
        const inner = document.createElement('div'); inner.id = 'bm-shop';
        const cards = W.bigShop.map(it => `<div class="shop-card shop-tool">
                <div class="shop-icon"><img class="shop-pxicon" src="${sc.textures.getBase64('bm_i_' + it.id)}" alt="" style="image-rendering:pixelated"></div>
                <div class="shop-name">${t('bigshop_' + it.id)}</div>
                <div class="shop-desc">${t('bigshop_' + it.id + '_desc')}</div>
                <button class="shop-buy" data-item="${it.id}">${coin} ${it.price}</button></div>`).join('')
            + `<div class="shop-card shop-tool"><div class="shop-icon">${window.FarmArt ? `<img class="shop-pxicon" src="${window.FarmArt.icon('rod')}" alt="">` : ''}</div>
                <div class="shop-name">${t('item_rod')}</div><div class="shop-desc">${t('bigshop_rod_desc')}</div>
                <button class="shop-rod">${coin} ${(W.shop && W.shop.prices && W.shop.prices.rod) || 100}</button></div>`
            + `<div class="shop-card shop-tool"><div class="shop-icon">${window.FarmArt ? `<img class="shop-pxicon" src="${window.FarmArt.icon('elixir')}" alt="">` : ''}</div>
                <div class="shop-name">${t('item_elixir')}</div><div class="shop-desc">${t('item_elixir_desc')}</div>
                <button class="shop-elixir">${coin} ${(W.shop && W.shop.prices && W.shop.prices.elixir) || 50}</button></div>`
            + `<div class="shop-card shop-tool"><div class="shop-icon">${window.FarmArt ? `<img class="shop-pxicon" src="${window.FarmArt.icon('chip')}" alt="">` : ''}</div>
                <div class="shop-name">${t('item_chip')}</div><div class="shop-desc">${t('item_chip_desc')}</div>
                <button class="shop-chip">${coin} ${(W.shop && W.shop.prices && W.shop.prices.chip) || 50}</button></div>`
            + `<div class="shop-card shop-tool"><div class="shop-icon"><img class="shop-pxicon" src="${mapIcon()}" alt="" style="image-rendering:pixelated"></div>
                <div class="shop-name">${t('item_bigmap')}</div><div class="shop-desc">${t('item_bigmap_desc')}</div>
                <button class="shop-buy" data-item="bigmap" ${hasMap() ? 'data-own="1"' : ''}>${hasMap() ? t('shop_owned') : coin + ' ' + ((W.shop && W.shop.prices && W.shop.prices.bigmap) || 600)}</button></div>`;
        el.innerHTML = `<div class="shop-box"><div class="shop-title">${t('bigshop_title')}</div>
            <div class="mf-wallet">${t('shop_have').replace('{n}', '')}${coin} <b>${me ? me.coins || 0 : 0}</b></div>
            <div class="shop-sec">${t('bigshop_sec')}</div><div class="shop-cards">${cards}</div>
            <div class="shop-msg" id="bm-shop-msg"></div><button class="shop-close">${t('shop_close')}</button></div>`;
        el.appendChild(inner);
        el.onpointerdown = (e) => e.stopPropagation();
        el.querySelector('.shop-close').onclick = () => el.remove();
        const rd = el.querySelector('.shop-rod'); if (rd) { rd.className = 'shop-buy shop-rod-buy'; rd.onclick = () => { rd.disabled = true; X.socket.off('shopResult', O.rodResult); X.socket.on('shopResult', O.rodResult); X.socket.emit('shopBuy', { roomId: X.roomId(), item: 'rod' }); }; }   // baliq ovi (ko'l va katta daryolarda)
        const cp = el.querySelector('.shop-chip'); if (cp) { cp.className = 'shop-buy'; cp.onclick = () => { X.socket.off('shopResult', O.rodResult); X.socket.on('shopResult', O.rodResult); X.socket.emit('shopBuy', { roomId: X.roomId(), item: 'chip' }); }; }
        const ex = el.querySelector('.shop-elixir'); if (ex) { ex.className = 'shop-buy'; ex.onclick = () => { X.socket.off('shopResult', O.rodResult); X.socket.on('shopResult', O.rodResult); X.socket.emit('shopBuy', { roomId: X.roomId(), item: 'elixir' }); }; }   // la'natni (jon tiklanmasligini) tuzatadi
        el.querySelectorAll('.shop-buy[data-item]').forEach((b) => { if (b.dataset.own) b.disabled = true; b.onclick = () => { el.querySelectorAll('.shop-buy').forEach(x => { x.disabled = true; }); X.socket.emit('bigBuy', { roomId: X.roomId(), item: b.dataset.item }); }; });
        host.appendChild(el);
        X.sfx('coin', 0.4);
    }
    function nearShop(hero) {
        if (!hero || hero.isDead || !W.shops) return null;
        return W.shops.find(s => Math.abs(hero.x - s.x) < 110 && Math.abs(hero.y + 24 - s.y) < 80) || null;
    }
    // ===== QOR BAZASI: qor uyumi, qor to'pi otish (F / ikonka), qor yog'ishi va bo'ron, muzda sirpanish, sovuq =====
    function nearPile(hero) {
        if (!hero || hero.isDead || !W.piles) return null;
        return W.piles.find(q => Math.abs(hero.x - q.x) < 70 && Math.abs(hero.y + 24 - q.y) < 60) || null;
    }
    // qor to'pi - qahramon qaragan tomonga to'g'ri (biroz tepaga, uzoqroq uchsin); kursor ishlatilmaydi
    function throwSnow() {
        const hero = X.hero();
        if (!O || !hero || hero.isDead || !(O.mySnow > 0)) return;
        const left = X.facing ? X.facing() === 'left' : !!hero.flipX;
        X.socket.emit('bigThrow', { roomId: X.roomId(), a: left ? Math.PI + 0.12 : -0.12 });
    }
    // G'OR / YER OSTI XONASI ichida (orolning ichki zali): bo'ron va qor yog'ishi yo'q - xavfsiz joy
    function sheltered(hero) {
        if (!hero) return false;
        const feet = hero.y + 24;
        if (!O.inRooms) O.inRooms = [].concat(...W.isles.map(I => I.r.filter(q => q[4])));   // ichki zallar - bir marta (har kadr 130 orolni aylanmasin)
        return O.inRooms.some(q => hero.x > q[0] && hero.x < q[0] + q[2] && feet > q[1] && feet <= q[1] + q[3] + 44);
    }
    function updateSnow(scene, now, hero) {
        const cam = scene.cameras.main, B = O.blizzard;
        O.shelter = sheltered(hero);
        const snowy = locAt(cam.scrollX + 400, cam.scrollY + 300) === 'snow' && !O.shelter;
        if (snowy && !B.on && now > B.next) { B.on = true; B.until = now + 7000; B.wind = (Math.random() < 0.5 ? -1 : 1) * 70; showToast(t('big_blizzard')); X.sfx('whoosh', 0.8); }
        if (B.on && now > B.until) { B.on = false; B.wind = 0; B.next = now + 30000 + Math.random() * 25000; }
        if (!snowy && B.on) { B.on = false; B.wind = 0; }
        const dt = Math.min(0.05, scene.game.loop.delta / 1000), n = B.on ? 110 : 55;
        // YER OSTIDA: zarrachalar - pastdan ko'tariladigan cho'g' uchqunlari
        const lv = locAt(cam.scrollX + 400, cam.scrollY + 300), embers = lv === 'lava', flies = lv === 'swamp', mode = embers ? 'lava' : flies ? 'swamp' : 'snow';
        if (O.flakeMode !== mode) { O.flakeMode = mode; O.flakes.forEach((f, i) => { f.setFillStyle(embers ? (i % 3 ? 0xff8a3a : 0xffc35a) : flies ? (i % 3 ? 0xd4ff6a : 0xfff59d) : 0xffffff, 0.85); if (!embers && !flies) f.setAlpha(1); }); }
        if (flies) {
            O.flakes.forEach((f, i) => {
                f.setVisible(i < 34);
                if (i >= 34) return;
                f.x += Math.sin(now / 1300 + i * 2.1) * 22 * dt; f.y += Math.cos(now / 1700 + i * 1.3) * 16 * dt; f.setAlpha(Math.max(0, Math.sin(now / 420 + i * 1.7)) * 0.9);
                if (f.x < -5) f.x = 805; if (f.x > 805) f.x = -5; if (f.y < 60) f.y = 580; if (f.y > 600) f.y = 80;
            });
        } else if (embers) {
            O.flakes.forEach((f, i) => {
                f.setVisible(i < 45);
                if (i >= 45) return;
                f.y -= (22 + (i % 5) * 11) * dt; f.x += Math.sin(now / 700 + i) * 16 * dt; f.setAlpha(0.5 + 0.4 * Math.sin(now / 160 + i));
                if (f.y < -5) { f.y = 605; f.x = Math.random() * 800; }
            });
        } else O.flakes.forEach((f, i) => {
            f.setVisible(snowy && i < n);
            if (!snowy || i >= n) return;
            f.y += (B.on ? 260 : 60 + (i % 5) * 12) * dt; f.x += ((B.on ? B.wind * 4 : Math.sin(now / 900 + i) * 12)) * dt;
            if (f.y > 605) { f.y = -5; f.x = Math.random() * 800; } if (f.x > 805) f.x = -5; if (f.x < -5) f.x = 805;
        });
        O.white.setAlpha(Phaser.Math.Linear(O.white.alpha, snowy && B.on ? 0.16 : 0, 0.05));
        const showSnow = snowy || O.mySnow > 0;
        O.snowHud.img.setVisible(showSnow); O.snowHud.txt.setVisible(showSnow).setText('x' + (O.mySnow || 0) + (O.mySnow > 0 ? '  [F]' : ''));
        const typing = document.activeElement && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);   // matn yozilayotganda F otmasin
        if (O.keyF && Phaser.Input.Keyboard.JustDown(O.keyF) && !typing) throwSnow();
        const burn = now < (O.burnUntil || 0);
        if (hero && burn) hero.setTint(O.burnCol || 0xff8a65); else if (hero && now < O.chillUntil) hero.setTint(O.chillCol || 0xb3e5fc); else if (hero && O.chillTinted) hero.clearTint();
        O.chillTinted = hero && (burn || now < O.chillUntil);
    }
    // ROBOT BIGFUT DEVORI (bir tomonlama): yuzidan biroz oldinda; oldiga chiqqan o'yinchi orqasiga qayta o'tolmaydi
    function bigfootWall(hero) {
        const bf = enemyFind(e => e.k === 'bigfoot');
        if (!bf || hero.isDead) { O.bfFront = false; return; }
        const wx = bf.x + 40, feet = hero.y + 24, g = bf.y + BF_FACE;
        if (Math.abs(hero.x - wx) > 1600 || feet < g - 700 || feet > g + 60) { O.bfFront = false; return; }
        if (hero.x >= wx) { O.bfFront = true; return; }
        if (O.bfFront) { hero.x = wx; if (hero.body.velocity.x < 0) hero.setVelocityX(0); }
    }
    // game.js harakatidan keyin: muzda sirpanish (tezlik asta o'zgaradi), sovuq (sekin), bo'ron shamoli
    function releaseHeld() {
        if (!O) return;
        O.held = null;
        const h = X.hero && X.hero(); if (h && h.angle) h.setAngle(0);
    }
    function adjustMove(scene, hero, dt) {
        if (!O || !hero || !hero.body) return;
        // SAMBOCHI USHLAB TURIBDI: qahramon uning qo'lida (o'zi qimirlay olmaydi), keyin orqaga tashlanadi (server)
        // "NA PROGIB": avval ko'kragiga bosib ko'taradi (30%), keyin boshi ustidan aylantirib, orqasidagi yerga boshi bilan uradi
        if (O.held) {
            const e = O.enemies.get(O.held.id);
            if (!e || hero.isDead || scene.time.now > O.held.until) releaseHeld();
            else {
                const k = Math.min(1, (scene.time.now - O.held.t0) / O.held.ms), f = e.f < 0 ? -1 : 1;
                const lift = Math.min(1, k / 0.3), s = Math.max(0, (k - 0.3) / 0.7), ss = s * s * (3 - 2 * s), th = ss * Math.PI;
                if (k < 0.3) { hero.x = e.x + f * 30; hero.y = e.y - 60 - lift * 15; }
                else { hero.x = e.x - f * 15 + f * 45 * Math.cos(th); hero.y = e.y - 75 + 51 * ss - Math.sin(th) * 72; }
                hero.setAngle(-f * ss * 180); hero.setVelocity(0, 0); return;
            }
        }
        let vx = hero.body.velocity.x;
        if (!hero.isDead && scene.time.now < O.chillUntil) vx *= 0.55;
        const feet = hero.y + 24, grounded = hero.body.blocked.down || hero.body.touching.down;
        if (!O.icePlats) O.icePlats = W.plats.filter(p => ICE_K[p.k]);   // muz sirtlari - bir marta (har kadr 2000+ platformani aylanmasin)
        const onIce = grounded && O.icePlats.some(p => hero.x >= p.x - 4 && hero.x <= p.x + p.w + 4 && Math.abs(p.y - feet) < 6);
        if (onIce) vx = O.prevVx + (vx - O.prevVx) * Math.min(1, dt * 2.4);
        const inMud = (W.bogs || []).some(l => hero.x > l.x && hero.x < l.x + l.w && Math.abs(feet - l.y) < 10), inLake = (W.lakes || []).some(l => hero.x > l.x && hero.x < l.x + l.w && feet > l.y + 14 && feet < l.y + 60);
        if (inMud) vx *= 0.42; else if (inLake) vx *= 0.6;
        if (O.blizzard.on && !O.shelter) vx += O.blizzard.wind * 0.6;   // g'or / xona ichida - shamol yo'q
        const now = scene.time.now;
        if (hero.isDead) { hero.setVelocityX(vx); O.prevVx = vx; O.locked = null; return; }
        if (O.pull && now < O.pull.until && Math.abs(O.pull.x - hero.x) > 40) vx += Math.sign(O.pull.x - hero.x) * O.pull.s;   // muz bo'roni o'ziga tortadi
        if (now < O.rootUntil) { vx = 0; if (grounded && hero.body.velocity.y < 0) hero.setVelocityY(0); }   // ildiz / to'r - oyoq bog'langan
        hero.setVelocityX(vx);
        O.prevVx = vx;
        bigfootWall(hero);
    }
    function interact(dry) {
        if (!O || !W) return false;
        if (O.reel) { if (!dry) reelStop(true); return true; }   // baliq tortish: E - to'xtatish
        const pl = nearPile(X.hero());
        if (pl && !nearChest(X.hero()) && !nearShop(X.hero()) && !nearPortal(X.hero())) { if (!dry) X.socket.emit('bigSnow', X.roomId()); return true; }
        const c = nearChest(X.hero());
        if (c) { if (!dry) X.socket.emit('bigChest', { roomId: X.roomId(), id: c.id }); return true; }
        const s = nearShop(X.hero());
        if (s) { if (!dry) { if (shopOpen()) closeShop(); else openShop(); } return true; }
        const po = nearPortal(X.hero());
        if (po) { if (!dry) { if (portalMenuOpen()) closePortalMenu(); else openPortalMenu(po); } return true; }
        const ea = nearElfAct(X.hero());
        if (ea) { if (!dry) { if (ea.local) ea.local(); else X.socket.emit('bigAct', { roomId: X.roomId(), act: ea.act, arg: ea.arg }); } return true; }
        return false;
    }
    function onVine() { return !!(O && O.vine); }
    // yiqilish o'lchovini qayta boshlash (qahramon boshqa yo'l bilan ko'chirilganda)
    function resetFall() { if (O) { O.fall.y = null; O.fall.air = false; } }
    return { mapIcon, debugReel: () => (O && O.reel ? O.reel.pos : undefined), debugArenas: () => (O ? O.arenas.map(a => a.k + ':' + (a.x0) + '-' + a.x1 + (O.locked === a.id ? ':locked' : '')) : []), debugEnemies: () => (O ? [...O.enemies.values()].filter(o => o.img && o.img.visible).map(o => o.k + ':' + Math.round(o.img.displayHeight) + 'x' + Math.round(o.img.displayWidth) + (o.img.texture ? '@' + o.img.texture.key : '')) : []), heldFace: () => (O && O.held ? O.held.face : null), debugMapView: () => O && O.mapView, debugShots: () => (O ? O.shotList : []), debugSetWp: (x, y) => { if (O) { O.wp = { x, y }; } }, debugGuide: () => (O && O.guideTxt && O.guideTxt.visible ? O.guideTxt.text + ' @' + Math.round(O.guideTxt.x) + ',' + Math.round(O.guideTxt.y) : ''), inBattle, create, update, state, interact, vineControl, onVine, destroy, resetFall, adjustMove, active: () => !!O, debugEnemies: () => (O ? O.enemies.values() : []) };
})();
