// ===== OVOZ VA MUSIQA =====
// Rejimlar:
//   'menu'   - o'yindan tashqari (menyu, lobbi): public/audios/menu.ogg (yo'q bo'lsa - .wav)
//   'action' - xaritada jang/harakat ketayotganda (barcha xaritalarda): public/audios/fight-music.ogg
//   'calm'   - xaritada jang yo'q paytlar (suhbat, bozor, o'rmon yo'li...): sokin piksel ohang
//              (fayl emas - WebAudio bilan shu yerda yaratiladi)
// Brauzer ovozni faqat foydalanuvchi birinchi marta bosgandan/tugma bosgandan keyin ruxsat beradi -
// shungacha tanlangan rejim eslab qolinadi va birinchi bosishda boshlanadi.
(function () {
    const BASE = 'public/audios/';
    // Avval .ogg (kichik), topilmasa - .wav
    const FILES = { menu: 'menu', fight: 'fight-music' };
    const MUSIC_LEVEL = 0.55;   // fayl musiqasi balandligi (sozlamadagi 100% da)
    const CALM_LEVEL = 0.5;     // sokin ohang balandligi
    const FADE_STEP = 0.04;     // har 50ms da - ~0.7s ichida silliq o'tish

    // Ikki alohida balandlik: musiqa (fayl treklari + sokin ohang) va o'yin ovozlari (effektlar, dialog bipi)
    let volume = (() => {
        try { const v = parseFloat(localStorage.getItem('gameVolume')); return isNaN(v) ? 0.7 : v / 100; } catch (e) { return 0.7; }
    })();
    let sfxVolume = (() => {
        try { const v = parseFloat(localStorage.getItem('sfxVolume')); return isNaN(v) ? 0.8 : v / 100; } catch (e) { return 0.8; }
    })();
    let unlocked = false;
    let currentKey = null;      // 'menu' | 'fight' | 'calm' | null
    let locked = null;          // lock(): o'yin natijasi ko'rsatilayotganda o'yin sikli rejimni o'zgartira olmasin
    const tracks = {};

    function track(key) {
        if (!tracks[key]) {
            const a = new Audio(BASE + FILES[key] + '.ogg');
            a.addEventListener('error', () => {
                if (a.triedWav) return;
                a.triedWav = true;
                a.src = BASE + FILES[key] + '.wav';
                if (a.target > 0 && unlocked) a.play().catch(() => {});
            });
            a.loop = true;
            a.preload = 'auto';
            a.volume = 0;
            a.target = 0;
            tracks[key] = a;
        }
        return tracks[key];
    }

    // ---------- Sokin piksel ohang (WebAudio) ----------
    let musicBus = null, noiseBuf = null;
    let ctx = null, master = null, calmGain = null, sfxGain = null, calmTimer = null, nextNoteAt = 0, step = 0;
    const note = (n) => 440 * Math.pow(2, (n - 69) / 12);   // MIDI -> Hz
    // Am - F - C - G, har akkord 2 takt: sekin arpedjio (uchburchak to'lqin) + past bas + aks-sado
    const CHORDS = [[57, 60, 64, 69], [53, 57, 60, 65], [48, 52, 55, 60], [55, 59, 62, 67]];
    const ARP = [0, 1, 2, 3, 2, 1, 2, 3];
    const STEP_S = 0.42;

    function ensureCtx() {
        if (ctx) return ctx;
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 1;
        master.connect(ctx.destination);
        musicBus = ctx.createGain();
        musicBus.gain.value = volume;
        musicBus.connect(master);
        calmGain = ctx.createGain();
        calmGain.gain.value = 0;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 1800;
        const delay = ctx.createDelay();
        delay.delayTime.value = STEP_S * 1.5;
        const fb = ctx.createGain();
        fb.gain.value = 0.35;
        calmGain.connect(lp);
        lp.connect(musicBus);
        lp.connect(delay);
        delay.connect(fb);
        fb.connect(delay);
        delay.connect(musicBus);
        sfxGain = ctx.createGain();
        sfxGain.gain.value = sfxVolume;
        sfxGain.connect(master);
        // Shovqin (portlash, shitirlash, zarba uchun) - bir marta yaratiladi
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const nd = noiseBuf.getChannelData(0);
        for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
        return ctx;
    }

    function tone(freq, when, dur, type, level, dest) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = type;
        o.frequency.value = freq;
        g.gain.setValueAtTime(0, when);
        g.gain.linearRampToValueAtTime(level, when + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
        o.connect(g);
        g.connect(dest);
        o.start(when);
        o.stop(when + dur + 0.05);
    }

    // ---------- O'yin ovozlari (sintez - fayl kerak emas) ----------
    // Chastotasi vaqt bo'yicha o'zgaradigan ton (f0 -> f1)
    function sweep(f0, f1, when, dur, type, level, dest) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = type;
        o.frequency.setValueAtTime(f0, when);
        o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), when + dur);
        g.gain.setValueAtTime(0, when);
        g.gain.linearRampToValueAtTime(level, when + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
        o.connect(g); g.connect(dest);
        o.start(when); o.stop(when + dur + 0.05);
    }
    // Filtrlangan shovqin: ftype - 'lowpass' | 'highpass' | 'bandpass'; fq0 -> fq1 chastota siljiydi
    function noise(when, dur, level, ftype, fq0, fq1, dest) {
        const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
        src.buffer = noiseBuf;
        f.type = ftype;
        f.frequency.setValueAtTime(fq0, when);
        f.frequency.exponentialRampToValueAtTime(Math.max(30, fq1), when + dur);
        g.gain.setValueAtTime(level, when);
        g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
        src.connect(f); f.connect(g); g.connect(dest);
        src.start(when, Math.random() * 0.5); src.stop(when + dur + 0.05);
    }
    const SFX = {
        sword:     (t, v, o) => { noise(t, 0.16, 0.5 * v, 'bandpass', 3200, 700, o); sweep(1400, 900, t + 0.02, 0.08, 'triangle', 0.05 * v, o); },
        katana:    (t, v, o) => { noise(t, 0.12, 0.55 * v, 'highpass', 5000, 1800, o); sweep(2200, 1500, t, 0.07, 'sine', 0.05 * v, o); },
        fireball:  (t, v, o) => { noise(t, 0.35, 0.45 * v, 'lowpass', 1800, 300, o); sweep(180, 420, t, 0.25, 'sawtooth', 0.05 * v, o); },
        ice:       (t, v, o) => { [1568, 2093, 2637].forEach((f, i) => tone(f, t + i * 0.035, 0.18, 'triangle', 0.07 * v, o)); noise(t, 0.12, 0.15 * v, 'highpass', 6000, 3000, o); },
        arrow:     (t, v, o) => { sweep(700, 260, t, 0.09, 'triangle', 0.14 * v, o); noise(t, 0.08, 0.2 * v, 'highpass', 4000, 2000, o); },
        kunai:     (t, v, o) => { noise(t, 0.09, 0.35 * v, 'bandpass', 5000, 2500, o); sweep(1800, 1200, t, 0.05, 'sine', 0.05 * v, o); },
        shotgun:   (t, v, o) => { noise(t, 0.3, 0.8 * v, 'lowpass', 2500, 200, o); sweep(120, 40, t, 0.2, 'sine', 0.35 * v, o); },
        hit:       (t, v, o) => { sweep(260, 90, t, 0.1, 'square', 0.12 * v, o); noise(t, 0.06, 0.3 * v, 'lowpass', 2000, 400, o); },
        hurt:      (t, v, o) => { sweep(420, 140, t, 0.22, 'sawtooth', 0.12 * v, o); noise(t, 0.1, 0.3 * v, 'bandpass', 1200, 500, o); },
        death:     (t, v, o) => { [392, 330, 262, 196].forEach((f, i) => tone(f, t + i * 0.13, 0.22, 'square', 0.07 * v, o)); },
        botDie:    (t, v, o) => { noise(t, 0.35, 0.55 * v, 'lowpass', 3000, 150, o); sweep(300, 50, t, 0.3, 'square', 0.08 * v, o); },
        squish:    (t, v, o) => { noise(t, 0.2, 0.5 * v, 'lowpass', 900, 120, o); sweep(260, 70, t, 0.18, 'sine', 0.2 * v, o); },
        dogDie:    (t, v, o) => { sweep(900, 300, t, 0.18, 'square', 0.08 * v, o); noise(t + 0.05, 0.3, 0.4 * v, 'lowpass', 2500, 150, o); },
        bossHit:   (t, v, o) => { sweep(140, 50, t, 0.18, 'sine', 0.4 * v, o); noise(t, 0.1, 0.25 * v, 'lowpass', 1200, 200, o); },
        bossDown:  (t, v, o) => { [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.12, 0.3, 'square', 0.07 * v, o)); [523, 659, 784].forEach(f => tone(f, t + 0.55, 0.9, 'triangle', 0.08 * v, o)); },
        bossStart: (t, v, o) => { tone(110, t, 0.6, 'sawtooth', 0.1 * v, o); tone(104, t + 0.45, 0.8, 'sawtooth', 0.1 * v, o); noise(t, 0.9, 0.2 * v, 'lowpass', 400, 80, o); },
        roar:      (t, v, o) => { noise(t, 0.9, 0.6 * v, 'lowpass', 700, 120, o); sweep(90, 55, t, 0.8, 'sawtooth', 0.12 * v, o); },
        win:       (t, v, o) => { [523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.1, 0.22, 'square', 0.06 * v, o)); },
        lose:      (t, v, o) => { [392, 370, 349, 311].forEach((f, i) => tone(f, t + i * 0.22, 0.32, 'triangle', 0.1 * v, o)); },
        coin:      (t, v, o) => { tone(988, t, 0.08, 'square', 0.06 * v, o); tone(1319, t + 0.07, 0.22, 'square', 0.06 * v, o); },
        xp:        (t, v, o) => { [1047, 1319, 1568].forEach((f, i) => tone(f, t + i * 0.05, 0.14, 'triangle', 0.05 * v, o)); },
        jump:      (t, v, o) => { sweep(280, 560, t, 0.1, 'square', 0.04 * v, o); },
        explosion: (t, v, o) => { noise(t, 0.7, 0.9 * v, 'lowpass', 2200, 60, o); sweep(100, 30, t, 0.5, 'sine', 0.5 * v, o); },
        thud:      (t, v, o) => { sweep(160, 50, t, 0.15, 'sine', 0.35 * v, o); noise(t, 0.08, 0.2 * v, 'lowpass', 800, 150, o); },
        noStamina: (t, v, o) => { tone(110, t, 0.12, 'square', 0.06 * v, o); tone(98, t + 0.13, 0.16, 'square', 0.06 * v, o); },
        click:     (t, v, o) => { tone(1200, t, 0.04, 'square', 0.03 * v, o); },
        chomp:     (t, v, o) => { noise(t, 0.06, 0.6 * v, 'bandpass', 1500, 600, o); noise(t + 0.09, 0.07, 0.6 * v, 'bandpass', 1300, 500, o); },
        whoosh:    (t, v, o) => { noise(t, 0.35, 0.45 * v, 'bandpass', 600, 3000, o); },
        whip:      (t, v, o) => { noise(t, 0.12, 0.6 * v, 'highpass', 2000, 6000, o); sweep(800, 200, t + 0.08, 0.06, 'square', 0.06 * v, o); },
        stab:      (t, v, o) => { sweep(1800, 600, t, 0.08, 'sawtooth', 0.08 * v, o); noise(t, 0.06, 0.25 * v, 'highpass', 5000, 3000, o); },
        rumble:    (t, v, o) => { noise(t, 1.4, 0.55 * v, 'lowpass', 220, 60, o); sweep(55, 40, t, 1.3, 'sine', 0.25 * v, o); },
        pop:       (t, v, o) => { sweep(300, 900, t, 0.08, 'sine', 0.25 * v, o); noise(t, 0.12, 0.3 * v, 'lowpass', 1500, 300, o); },
        bark:      (t, v, o) => { [0, 0.22].forEach(d => { sweep(520, 260, t + d, 0.12, 'square', 0.08 * v, o); noise(t + d, 0.1, 0.25 * v, 'bandpass', 1400, 700, o); }); },
        spit:      (t, v, o) => { noise(t, 0.25, 0.45 * v, 'bandpass', 900, 2500, o); sweep(200, 500, t, 0.15, 'sine', 0.08 * v, o); },
        fire:      (t, v, o) => { noise(t, 1.4, 0.5 * v, 'lowpass', 1500, 400, o); },
        roots:     (t, v, o) => { noise(t, 0.4, 0.4 * v, 'lowpass', 600, 150, o); [0, 0.1, 0.2].forEach(d => sweep(240, 120, t + d, 0.08, 'square', 0.04 * v, o)); },
        banner:    (t, v, o) => { tone(392, t, 0.15, 'square', 0.06 * v, o); tone(523, t + 0.15, 0.3, 'square', 0.06 * v, o); },
        block:     (t, v, o) => { tone(1800, t, 0.12, 'triangle', 0.07 * v, o); tone(2400, t + 0.02, 0.1, 'triangle', 0.05 * v, o); }
    };
    const lastSfxAt = {};
    const SFX_GAP = { shotgun: 80, hit: 50, bossHit: 90, hurt: 150, coin: 60, xp: 80, click: 40, squish: 40, botDie: 60 };

    let calmOn = false;
    function scheduleCalm() {
        if (!ctx) return;
        if (!calmOn) { nextNoteAt = ctx.currentTime + 0.1; return; }
        while (nextNoteAt < ctx.currentTime + 0.4) {
            const chord = CHORDS[Math.floor(step / 16) % CHORDS.length];
            tone(note(chord[ARP[step % 8]] + 12), nextNoteAt, 0.9, 'triangle', 0.07, calmGain);
            if (step % 8 === 0) tone(note(chord[0] - 12), nextNoteAt, STEP_S * 7, 'sine', 0.09, calmGain);
            if (step % 16 === 12) tone(note(chord[3] + 24), nextNoteAt, 0.5, 'square', 0.015, calmGain); // yulduzcha
            nextNoteAt += STEP_S;
            step++;
        }
    }

    // Rejalashtiruvchi bitta va doim ishlaydi - o'chiq paytda nota qo'ymaydi, faqat ovozi pasayadi
    function setCalm(on) {
        if (!ensureCtx()) return;
        if (!calmTimer) calmTimer = setInterval(scheduleCalm, 100);
        calmOn = on;
        calmGain.gain.setTargetAtTime(on ? CALM_LEVEL : 0, ctx.currentTime, 0.4);
    }

    // ---------- Rejimni qo'llash ----------
    function apply(key) {
        currentKey = key;
        Object.keys(FILES).forEach((k) => {
            const a = track(k);
            a.target = (k === key) ? MUSIC_LEVEL : 0;
            if (k === key && unlocked && a.paused) a.play().catch(() => {});
        });
        if (unlocked) setCalm(key === 'calm');
    }

    // Silliq o'tish: har bir trek o'z maqsad balandligiga asta yaqinlashadi, jim bo'lgani to'xtaydi
    setInterval(() => {
        Object.values(tracks).forEach((a) => {
            const goal = a.target * volume;
            const d = goal - a.volume;
            if (Math.abs(d) > 0.001) a.volume = Math.max(0, Math.min(1, a.volume + Math.sign(d) * Math.min(Math.abs(d), FADE_STEP)));
            if (a.target === 0 && a.volume <= 0.001 && !a.paused) a.pause();
        });
    }, 50);

    function keyFor(mode, mapId) {
        if (mode === 'menu') return 'menu';
        if (mode === 'calm') return 'calm';
        if (mode === 'action') return 'fight';   // barcha xaritalarda bitta jang musiqasi
        return null;
    }

    window.GameAudio = {
        // O'yin sikli har kadrda chaqiradi - o'zgarmasa hech narsa qilmaydi
        setMode(mode, mapId = 0) {
            if (locked) return;
            const key = keyFor(mode, mapId);
            if (key !== currentKey) apply(key);
        },
        // O'yin natijasi (g'alaba/mag'lubiyat) paytida - shu rejimda qotib turadi
        lock(mode, mapId = 0) {
            locked = null;
            this.setMode(mode, mapId);
            locked = mode;
        },
        release() { locked = null; },
        // Holatni ko'rish (tekshirish uchun): qaysi rejim va qaysi treklar chalinmoqda
        state() {
            return { key: currentKey, unlocked, playing: Object.keys(tracks).filter(k => !tracks[k].paused), calm: calmOn };
        },
        // Musiqa balandligi (fayl treklari + sokin ohang)
        setVolume(v) {
            volume = Math.max(0, Math.min(1, v));
            if (musicBus) musicBus.gain.value = volume;
        },
        // O'yin ovozlari balandligi (effektlar, dialog bipi)
        setSfxVolume(v) {
            sfxVolume = Math.max(0, Math.min(1, v));
            if (sfxGain) sfxGain.gain.value = sfxVolume;
        },
        // Effekt: name - SFX ro'yxatidan; vol - 0..1 (masofa bo'yicha pasaytirish uchun)
        sfx(name, vol = 1) {
            if (!unlocked || sfxVolume <= 0 || vol <= 0.02 || !SFX[name] || !ensureCtx() || ctx.state !== 'running') return;
            const now = performance.now();
            if (now - (lastSfxAt[name] || 0) < (SFX_GAP[name] || 25)) return;
            lastSfxAt[name] = now;
            try { SFX[name](ctx.currentTime + 0.005, Math.min(1, vol), sfxGain); } catch (e) { /* ovoz ixtiyoriy */ }
        },
        // Dialog matni yozilayotganda "bip" - kim gapirayotganiga qarab ovoz balandligi farq qiladi
        blip(voice) {
            if (!unlocked || !ensureCtx() || sfxVolume <= 0) return;
            const base = voice === 'deep' ? 150 : voice === 'player' ? 520 : voice === 'narrator' ? 330 : 880;
            const f = base * (0.94 + Math.random() * 0.12);
            tone(f, ctx.currentTime, 0.05, 'square', 0.05, sfxGain);
        },
        // Foydalanuvchi harakatida (brauzer talabi) ovoz ochiladi. AudioContext faqat shu yerda
        // yaratiladi; to'xtatilgan bo'lsa - qayta uyg'otiladi, pauzadagi musiqa qayta chalinadi
        unlock() {
            unlocked = true;
            if (ensureCtx() && ctx.state !== 'running') ctx.resume().catch(() => {});
            apply(currentKey);
        },
        ready() { return !!ctx && ctx.state === 'running'; }
    };

    // Brauzer faqat HAQIQIY harakatni (sichqoncha/barmoq bosish, oddiy tugma) ruxsat deb hisoblaydi:
    // Shift/Ctrl/Alt kabi tugmalar hisobga kirmaydi - ular bilan AudioContext ochilmaydi va
    // "was not allowed to start" ogohlantirishi chiqadi. Shuning uchun ruxsat bo'lmasa - kutamiz,
    // ovoz haqiqatan ishga tushguncha har harakatda qayta urinamiz
    const EVENTS = ['pointerdown', 'mousedown', 'touchend', 'keydown'];
    const onGesture = () => {
        if (navigator.userActivation && !navigator.userActivation.isActive) return;
        window.GameAudio.unlock();
        setTimeout(() => {
            if (window.GameAudio.ready()) EVENTS.forEach(ev => window.removeEventListener(ev, onGesture, true));
        }, 0);
    };
    EVENTS.forEach(ev => window.addEventListener(ev, onGesture, true));
})();
