// ===== OVOZ VA MUSIQA =====
// Rejimlar:
//   'menu'   - o'yindan tashqari (menyu, lobbi): public/audios/menu.ogg (yo'q bo'lsa - .wav)
//   'action' - xaritada jang/harakat ketayotganda: TOQ raqamli xarita (map-1, 3, 5, 7) -> map-1.wav,
//              JUFT raqamli xarita (map-2, 4, 6, 8) -> "map 2.wav"
//   'calm'   - xaritada jang yo'q paytlar (suhbat, bozor, o'rmon yo'li...): sokin piksel ohang
//              (fayl emas - WebAudio bilan shu yerda yaratiladi)
// Brauzer ovozni faqat foydalanuvchi birinchi marta bosgandan/tugma bosgandan keyin ruxsat beradi -
// shungacha tanlangan rejim eslab qolinadi va birinchi bosishda boshlanadi.
(function () {
    const BASE = 'public/audios/';
    // Avval .ogg (kichik), topilmasa - .wav
    const FILES = { menu: 'menu', odd: 'map-1', even: 'map%202' };
    const MUSIC_LEVEL = 0.55;   // fayl musiqasi balandligi (sozlamadagi 100% da)
    const CALM_LEVEL = 0.5;     // sokin ohang balandligi
    const FADE_STEP = 0.04;     // har 50ms da - ~0.7s ichida silliq o'tish

    let volume = (() => {
        try { const v = parseFloat(localStorage.getItem('gameVolume')); return isNaN(v) ? 0.7 : v / 100; } catch (e) { return 0.7; }
    })();
    let unlocked = false;
    let currentKey = null;      // 'menu' | 'odd' | 'even' | 'calm' | null
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
        master.gain.value = volume;
        master.connect(ctx.destination);
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
        lp.connect(master);
        lp.connect(delay);
        delay.connect(fb);
        fb.connect(delay);
        delay.connect(master);
        sfxGain = ctx.createGain();
        sfxGain.gain.value = 1;
        sfxGain.connect(master);
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
        if (mode === 'action') return (mapId % 2 === 0) ? 'odd' : 'even';   // id 0 = map-1 (toq)
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
        setVolume(v) {
            volume = Math.max(0, Math.min(1, v));
            if (master) master.gain.value = volume;
        },
        // Dialog matni yozilayotganda "bip" - kim gapirayotganiga qarab ovoz balandligi farq qiladi
        blip(voice) {
            if (!unlocked || !ensureCtx() || volume <= 0) return;
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
