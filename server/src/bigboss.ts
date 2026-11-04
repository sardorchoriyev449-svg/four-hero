// ===== BIG MAP BOSSLARI: har bir bossning O'Z qobiliyatlari to'plami (KITS) =====
// Hujumlar "asboblar"dan quriladi, lekin har boss uchun o'z ko'rinishi, ritmi va xavfi bilan:
//  - MAYDONLAR (areas): ogohlantirish (warn) -> faol (t). Tepadan tushadiganlar, yerdan ustunlar, nur, nafas, yerda qoladigan
//    dog'lar (olov / kislota / muz), suzuvchi bulutlar, chodir zarbasi, til, qafas. Har biri klientda o'z rasmi bilan chiziladi
//  - O'QLAR: portlaydigan (blast), pilikli (yerga tushib turadi, keyin portlaydi), dumalaydigan (yer bo'ylab), qaytib keladigan,
//    bo'linadigan, yerga tushganda dog' qoldiradigan
//  - HOLATLAR: yer ostiga kirish, shiftga chiqish, tosh qalqon, hushdan ketish (zaif), aylanib dumalash, g'azab izlari
// Ta'sirlar o'yinchiga: sekinlashish, ildiz (qimirlay olmaydi), kuyish / zahar (asta jon oladi), ko'r bo'lish (siyoh), tortish, uloqtirish
import { PlayerState } from './types';
import * as BM from './bigmap';

const T = (ms: number) => Math.round(ms / 30);
type Ctx = { S: BM.BigState; e: BM.BigEnemy; d: BM.EnemyDef; p: PlayerState; alive: PlayerState[]; ctx: BM.BigCtx; z: BM.BigZone | undefined; rage: number; arg: string; dt: number };
interface MoveDef { ms: number; air?: boolean; start: (c: Ctx) => void; tick?: (c: Ctx) => number | undefined; }   // tick - shu kadrdagi yurish tezligi (undefined - odatdagidek)

// ===== HAR BOSSNING HUJUMLARI (navbat bilan; o'yinchi tepada bo'lsa - "havodagi"ga yetadiganlari tanlanadi) =====
export const KITS: { [k: string]: string[] } = {
    // ELF QIROLLIGI (robot ilon - set-piece, sambochi - pastda)
    fatelf: ['fspit', 'fflame', 'fspit', 'fflame'],   // S1 "Right on time" dagidek: aniq (oldindan mo'ljal) kislota va yaqinga yashil olov - navbat bilan
    // O'RMON
    alpha: ['pounce:3', 'howl', 'charge', 'pounce:3', 'leap'],
    ancient: ['line:root', 'cloud:spore', 'rain:log', 'summon', 'line:root', 'erupt:roots'],
    spiderqueen: ['web', 'ceiling', 'eggs', 'pounce', 'web', 'ceiling'],
    skyship: ['volley3', 'fan7', 'volley3', 'paratroopers'],   // S2 "Sky Battle" kemasi: 3 ta nishonli o'q, 7 ta yelpig'ich, desant
    // QOR BAZASI
    yetiking: ['boulder:snow', 'rain:icicle', 'stomp:ice', 'leap', 'summon', 'boulder:snow'],
    icequeen: ['beam:frost', 'vortex', 'shardring', 'blink', 'erupt:ice', 'summon'],
    mammoth: ['stampede', 'trumpet', 'iceboulder', 'slam', 'stampede'],
    // YER OSTI
    magmatitan: ['rain:meteor', 'eruption:magma', 'fist', 'summon', 'rain:meteor', 'slam'],
    boneking: ['skulls', 'cage', 'raise', 'blink', 'beam:soul', 'skulls'],
    hellhound: ['charge:fire', 'triplefire', 'inferno', 'pounce', 'charge:fire'],
    magmaworm: ['burrow', 'lavaspit', 'charge', 'burrow', 'summon'],
    // BOTQOQ
    hydra: ['volley', 'breath:poison', 'rain:acid', 'sweep', 'summon', 'volley'],
    toadking: ['tongue', 'bellyflop', 'tadpoles', 'tongue', 'wave'],
    bigcroc: ['ambush', 'charge:roll', 'tailwhip', 'summon', 'ambush']
};

// ===== YORDAMCHILAR =====
const feetOf = (p: PlayerState) => p.y + 24;
const zx = (c: Ctx, x: number, m = 0) => c.z ? Math.max(c.z.x0 + m, Math.min(c.z.x1 - m, x)) : x;
export function area(S: BM.BigState, o: Partial<BM.BigArea> & { k: string, x: number, y: number, w: number, h: number }): BM.BigArea {
    const a: BM.BigArea = { id: ++S.seq, warn: 0, t: 2, dmg: 0, every: 0, ...o } as BM.BigArea;
    S.areas.push(a);
    return a;
}
// boss hujumi maydoni - shu boss maydoniga va egasiga bog'lanadi
const ar = (c: Ctx, o: Partial<BM.BigArea> & { k: string, x: number, y: number, w: number, h: number }) => area(c.S, { zone: c.e.zone, owner: c.e.id, ...o });
// o'yinchi turgan (yoki ostidagi) sirt - maydon ichida
function floorUnder(c: Ctx, x: number, feet: number, drop = 500): BM.BigPlat | null {
    const s = BM.surfaceBelow(c.S, x, feet - 8, drop);
    if (!s || (c.z && (s.y < c.z.y0 - 40 || s.y > c.z.y1 + 80))) return null;
    return s;
}
function shotP(c: Ctx, o: Partial<BM.BigShot> & { x: number, y: number, vx: number, vy: number, k: string }): BM.BigShot {
    const s: BM.BigShot = { id: ++c.S.seq, dmg: Math.round(c.d.dmg * 0.5), t: 0, arc: false, owner: c.e.id, ...o } as BM.BigShot;
    if (c.e.nl) s.nl = true;
    c.S.shots.push(s);
    return s;
}
// yoy bilan (x0,y0) dan nishonga tushadigan tezlik
function lob(x0: number, y0: number, tx: number, ty: number, t: number) { return { vx: (tx - x0) / t, vy: (ty - y0 - 0.5 * 600 * t * t) / t }; }
const say = (c: Ctx, m: string, extra: object = {}) => c.ctx.emit('bigBossMove', { id: c.e.id, k: c.e.k, m, x: Math.round(c.e.x), y: Math.round(c.e.y), ...extra });
function minion(c: Ctx, k: string, x: number, y: number): BM.BigEnemy {
    const m = BM.spawnEnemy(c.S, k, x, y, c.e.zone); m.st = 'chase'; m.tgt = c.p.id; m.cd = T(700);
    return m;
}
const crowd = (c: Ctx) => c.S.enemies.filter(o => o.zone === c.e.zone && o !== c.e).length;
// og'iz / ko'z joyi (boss qaragan tomonda)
const mouth = (c: Ctx, fx = 0.5, fy = 0.62) => ({ x: c.e.x + c.e.f * c.d.w * fx, y: c.e.y - c.d.h * fy });

// ===== HUJUMLAR =====
export const MOVES: { [name: string]: MoveDef } = {
    // --- umumiylar (eski) ---
    leap: { ms: 1600, air: true, start: (c) => jumpAt(c, 2200) },
    pounce: { ms: 1300, air: true, start: (c) => { c.e.combo = Math.max(0, (Number(c.arg) || 1) - 1); jumpAt(c, 2200); c.ctx.emit('bigWind', { id: c.e.id }); } },
    slam: { ms: 1400, start: (c) => { if (c.e.ground) { c.e.vy = -Math.max(600, c.d.jump || 600); c.e.ground = false; c.e.lvx = 0; } } },
    charge: {
        ms: 1100, start: (c) => { c.ctx.emit('bigWind', { id: c.e.id }); c.e.trail = c.e.x; if (c.arg === 'roll') c.e.spin = true; c.e.ph = c.arg === 'roll' ? T(1500) : T(1100); },
        tick: (c) => {
            const { e, d } = c;
            if (overlap(c) && (e.ccd || 0) <= c.S.tick) { BM.hurtBig(c.p, d.dmg, c.ctx); knock(c, c.p, 420, -260); e.ccd = c.S.tick + T(600); }
            // olovli it: orqasida yonib turadigan iz
            if (c.arg === 'fire' && Math.abs(e.x - (e.trail || e.x)) > 60 && e.ground) { e.trail = e.x; ar(c, { k: 'patch:fire', x: e.x - 30, y: e.y - 30, w: 60, h: 32, t: T(2600), dmg: 6, every: T(400), fx: 'burn', dk: 'ground' }); }
            return e.f * d.spd * (c.arg === 'roll' ? 2.3 : 1.9);
        }
    },
    wave: { ms: 1100, air: true, start: (c) => { for (let k = -1 - c.rage; k <= 1 + c.rage; k++) BM.shoot(c.S, c.e, c.d, c.p, k * 0.16, 460, Math.round(c.d.dmg * 0.55)); } },
    summon: {
        ms: 700, air: true, start: (c) => {
            const k = BM.BOSS_MINION[c.e.k]; if (!k) return;
            const n = Math.min(2 + c.rage, 1 + c.alive.length);
            for (let i = 0; i < n; i++) minion(c, k, c.e.x + (i - 1) * 70, c.e.y - (BM.ENEMIES[k].fly ? 80 : 0));
        }
    },
    // yerdan otilib chiqadigan ustun - o'yinchi turgan joydan (ildiz bog'laydi, muz sekinlashtiradi)
    erupt: {
        ms: 1100, air: true, start: (c) => {
            const xs = c.rage ? [c.p.x, c.p.x - 140, c.p.x + 140] : [c.p.x];
            xs.forEach(x => { const s = floorUnder(c, x, feetOf(c.p), 80); if (s) ar(c, { k: 'pillar:' + c.arg, x: x - 36, y: s.y - 110, w: 72, h: 110, warn: T(900), t: T(250), dmg: Math.round(c.d.dmg * 0.8), fx: c.arg === 'roots' ? 'root' : c.arg === 'ice' ? 'slow' : undefined, kb: [0, -380], dk: 'ground' }); });
        }
    },
    // --- TEPADAN TUSHADIGANLAR: tosh (golem, gorilla), xoda (daraxt), muzsumalak (yeti), meteor (titan), kislota (gidra) ---
    rain: {
        ms: 1500, air: true, start: (c) => {
            const k = c.arg, n = 3 + c.rage * 2;
            const fx = k === 'icicle' ? 'slow' : undefined;
            const after = k === 'meteor' ? { k: 'patch:fire', t: T(3000), dmg: 7, every: T(400), fx: 'burn' } : k === 'acid' ? { k: 'patch:acid', t: T(3500), dmg: 6, every: T(450), fx: 'poison' } : undefined;
            c.alive.filter(q => inArena(c, q)).slice(0, 2).forEach((q, qi) => {
                for (let i = 0; i < n; i++) {
                    const x = q.x + (i - (n - 1) / 2) * 120 + (qi ? 60 : 0) + (Math.random() - 0.5) * 30;
                    const s = floorUnder(c, x, feetOf(q) - 200, 700); if (!s) continue;
                    ar(c, { k: 'fall:' + k, x: x - 32, y: s.y - 64, w: 64, h: 64, warn: T(1000 + i * 140), t: 3, dmg: Math.round(c.d.dmg * 0.7), dk: 'shot', fx, kb: [220, -200], after });
                }
            });
        }
    },
    // --- YER BO'YLAB YURADIGAN USTUNLAR: bossdan o'yinchi tomonga (qochish - sakrab o'tish yoki chetga) ---
    line: { ms: 1500, start: (c) => marchLine(c, c.e.f, c.arg) },
    line2: { ms: 1600, start: (c) => { marchLine(c, 1, c.arg); marchLine(c, -1, c.arg); } },
    // --- NUR: ko'zdan o'yinchi turgan joyga (ogohlantirish chizig'i -> kuydiruvchi nur) ---
    beam: {
        ms: 1900, air: true, start: (c) => {
            const o = mouth(c, 0.35, 0.7), tx = c.p.x, ty = c.p.y, a = Math.atan2(ty - o.y, tx - o.x), L = 1000;
            const fx = c.arg === 'frost' ? 'slow' : undefined;
            ar(c, { k: 'beam:' + c.arg, x: o.x, y: o.y, x2: o.x + Math.cos(a) * L, y2: o.y + Math.sin(a) * L, w: 26, h: 0, warn: T(950), t: T(650), dmg: Math.round(c.d.dmg * 0.32), every: T(150), fx, dk: 'hit', drain: c.arg === 'soul' ? 1 : 0, owner: c.e.id });
        },
        tick: () => 0
    },
    // --- NAFAS: og'izdan oldinga (olov / zahar / sovuq / yashil olov) - boss turib qoladi ---
    breath: {
        ms: 2500, start: (c) => {
            const o = mouth(c), L = 340, aimDy = Math.max(-60, Math.min(60, c.p.y - o.y));
            const fx = c.arg === 'fire' || c.arg === 'greenfire' ? 'burn' : c.arg === 'poison' ? 'poison' : 'slow';
            ar(c, { k: 'breath:' + c.arg, x: c.e.f > 0 ? o.x : o.x - L, y: o.y + aimDy - 45, w: L, h: 90, warn: T(750), t: T(1500), dmg: Math.round(c.d.dmg * 0.22), every: T(250), fx, dk: 'hit', att: c.e.id, ox: c.d.w * 0.5, oy: c.d.h * 0.62 - aimDy, f: c.e.f });
        },
        tick: () => 0
    },
    // --- LAVA OTILISHI: maydonning bir necha joyidan lava - yerda 5 s qoladi ---
    eruption: {
        ms: 1300, start: (c) => {
            const fl = c.e.fy ?? c.e.y, z = c.z; if (!z) return;
            const n = 4 + c.rage * 2;
            for (let i = 0; i < n; i++) {
                const x = i === 0 ? c.p.x : z.x0 + 80 + Math.random() * (z.x1 - z.x0 - 160);
                const s = floorUnder(c, x, fl, 60); if (!s) continue;
                ar(c, { k: 'patch:magma', x: x - 55, y: s.y - 28, w: 110, h: 30, warn: T(900), t: T(5000), dmg: 8, every: T(400), fx: 'burn', dk: 'ground' });
            }
        }
    },
    // --- suzib keladigan bulutlar (sporalar / zahar) ---
    cloud: {
        ms: 1100, air: true, start: (c) => {
            for (let i = 0; i < 2 + c.rage; i++) ar(c, { k: 'cloud:' + c.arg, x: c.e.x + (i ? 1 : -1) * (60 + i * 40) - 60, y: c.e.y - c.d.h * 0.8, w: 120, h: 90, t: T(6500), dmg: 5, every: T(400), fx: c.arg === 'ink' ? 'blind' : 'poison', dk: 'ground', seek: 55 });
        }
    },
    // --- DUMALOVCHI XARSANG (yer bo'ylab, bir marta maydon chetidan qaytadi): tosh (sardor), qor ko'chkisi (yeti - o'sib boradi) ---
    boulder: {
        ms: 1300, start: (c) => {
            const snow = c.arg === 'snow', n = c.rage && !snow ? 2 : 1;
            for (let i = 0; i < n; i++) shotP(c, { x: c.e.x + c.e.f * (c.d.w * 0.5 + 20), y: c.e.y - (snow ? 20 : 26), vx: c.e.f * (snow ? 300 : 360 + i * 120) * (c.rage ? 1.15 : 1), vy: 0, k: snow ? 'snowboulder' : 'boulder', roll: snow ? 18 : 26, rmax: snow ? 46 : 26, grow: snow ? 0.12 : 0, bounce: 1, pierce: true, hitIds: [], dmg: Math.round(c.d.dmg * 0.8), life: T(7000), kb: 1 });
        }
    },
    // --- GOBLIN BOMBALARI: yerga tushadi, pilik yonib turadi (qochish uchun 1.1 s), portlaydi ---
    bombs: {
        ms: 1100, air: true, start: (c) => {
            for (let i = 0; i < 2 + c.rage; i++) { const tx = c.p.x + (i - 1) * 110, v = lob(c.e.x, c.e.y - c.d.h, tx, feetOf(c.p) - 10, 0.9 + i * 0.1); shotP(c, { x: c.e.x, y: c.e.y - c.d.h, ...v, arc: true, k: 'gbomb', fuse: T(1100), blast: 85, dmg: Math.round(c.d.dmg * 0.9) }); }
        }
    },
    // --- sardorning shoxi: atrofdan goblinlar yugurib keladi ---
    horn: {
        ms: 1000, air: true, start: (c) => {
            if (!c.z || crowd(c) >= 5) return;
            [[c.z.x0 + 40, 'goblin'], [c.z.x1 - 40, 'goblin'], [c.z.x1 - 80, 'gobarcher']].slice(0, 2 + c.rage).forEach(([x, k]) => { const s = floorUnder(c, x as number, (c.e.fy ?? c.e.y), 80); if (s) minion(c, k as string, x as number, s.y); });
        }
    },
    // --- QORONG'I O'ROQ: katta yarim oy teshib o'tadi (o'yinchi balandligida); g'azabda - ikkita (pastdan va tepadan) ---
    crescent: {
        ms: 1000, air: true, start: (c) => {
            const ys = c.rage ? [c.p.y - 40, c.p.y + 20] : [c.p.y];
            ys.forEach(y => { const sx = c.e.x + c.e.f * 30; shotP(c, { x: sx, y: Math.max(c.e.y - c.d.h, Math.min(c.e.y - 20, y)), vx: c.e.f * 520, vy: 0, k: 'crescent', sc: 1.7, pierce: true, hitIds: [], dmg: Math.round(c.d.dmg * 0.75), life: T(2400) }); });
        }
    },
    // --- SOYA EGIZAKLARI: 7 s yashaydigan, tez hamla qiladigan nusxalar ---
    clones: {
        ms: 900, air: true, start: (c) => {
            if (crowd(c) >= 4) return;
            [-1, 1].forEach(s => { const m = minion(c, 'shade', zx(c, c.e.x + s * 110, 40), c.e.y); m.life = T(7000); m.f = -s; });
        }
    },
    // --- G'OYIB BO'LIB, O'YINCHI ORTIDAN CHIQISH (keyin qilich zarbasi - ogohlantirish bilan) ---
    blink: {
        ms: 1300, air: true, start: (c) => { say(c, 'blinkout'); c.e.hide = 'blink'; c.e.ph = T(450); },
        tick: (c) => {
            const e = c.e;
            if (e.hide === 'blink' && --e.ph! <= 0) {
                e.x = zx(c, c.p.x - Math.sign((c.p.x - e.x) || 1) * 90, 30);
                const s = floorUnder(c, e.x, feetOf(c.p), 80); if (s) { e.y = s.y; e.vy = 0; }
                e.hide = undefined; e.f = c.p.x < e.x ? -1 : 1;
                say(c, 'blink');
                ar(c, { k: 'slash:' + (e.k === 'icequeen' ? 'ice' : e.k === 'boneking' ? 'soul' : 'dark'), x: e.x - (e.f < 0 ? 140 : -10), y: e.y - 90, w: 150, h: 90, warn: T(380), t: 3, dmg: c.d.dmg, kb: [320, -220], dk: 'hit' });
            }
            return 0;
        }
    },
    // --- TOSH QALQON (golem): 4 s deyarli zarar o'tmaydi - qochib, kutish kerak ---
    shield: { ms: 900, air: true, start: (c) => { c.e.shield = c.S.tick + T(4000); } },
    // --- BAQIRIQ / ULISH / TOPTASH: yaqindagilarni uloqtiradi (alfa - bo'rilarni chaqiradi, yeti - muz dog'lari qoladi) ---
    howl: {
        ms: 1200, air: true, start: (c) => {
            push(c, 330, 520);
            if (c.z && crowd(c) < 4) [c.z.x0 + 40, c.z.x1 - 40].forEach(x => { const s = floorUnder(c, x, (c.e.fy ?? c.e.y), 80); if (s) minion(c, 'wolf', x, s.y); });
        }
    },
    roar: { ms: 1100, air: true, start: (c) => push(c, 360, 600) },
    stomp: {
        ms: 1200, start: (c) => {
            push(c, 300, 480);
            const fl = c.e.fy ?? c.e.y;
            [-1, 1].forEach(s => [1, 2].forEach(i => { const x = c.e.x + s * (80 + i * 110), g = floorUnder(c, x, fl, 60); if (g) ar(c, { k: 'patch:ice', x: x - 55, y: g.y - 12, w: 110, h: 16, warn: T(300), t: T(4500), dmg: 0, every: T(300), fx: 'slow', dk: 'ground' }); }));
        }
    },
    trumpet: {
        ms: 1500, air: true, start: (c) => { push(c, 380, 560); MOVES.rain.start({ ...c, arg: 'snow' }); }
    },
    // --- PODA HUJUMI (mamont): butun maydon bo'ylab to'xtamay yuguradi; devorga urilsa - gangib qoladi (zaif) ---
    stampede: {
        ms: 3600, start: (c) => { c.e.ph = T(750); c.e.f = c.p.x < c.e.x ? -1 : 1; say(c, 'stampwarn'); },
        tick: (c) => {
            const { e, d, z } = c;
            if (e.ph! > 0) { e.ph!--; return 0; }
            if (overlap(c) && (e.ccd || 0) <= c.S.tick) { BM.hurtBig(c.p, Math.round(d.dmg * 1.2), c.ctx); knock(c, c.p, 650, -380); e.ccd = c.S.tick + T(700); }
            if (z && ((e.f < 0 && e.x <= z.x0 + 20) || (e.f > 0 && e.x >= z.x1 - 20))) {
                e.daze = T(2200); e.vuln = c.S.tick + T(2200); e.mt = 0;
                say(c, 'dizzy'); c.ctx.emit('bigBossMove', { id: e.id, m: 'quake', x: Math.round(e.x), y: Math.round(e.y) });
                return 0;
            }
            return e.f * d.spd * 2.6;
        }
    },
    // --- MUZ XARSANG (mamont): yoy bilan, yerga tushib uchta parchaga bo'linadi ---
    iceboulder: {
        ms: 1100, air: true, start: (c) => { const v = lob(c.e.x, c.e.y - c.d.h, c.p.x, feetOf(c.p) - 10, 1.05); shotP(c, { x: c.e.x, y: c.e.y - c.d.h, ...v, arc: true, k: 'iceboulder', sc: 1.3, dmg: Math.round(c.d.dmg * 0.8), split: 3, blast: 60 }); }
    },
    shatter: {
        ms: 1100, air: true, start: (c) => { const n = 12 + c.rage * 4, cy = c.e.y - 40; for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2 + 0.13; shotP(c, { x: c.e.x, y: cy, vx: Math.cos(a) * 340, vy: Math.sin(a) * 340, k: 'ice', dmg: Math.round(c.d.dmg * 0.45), fx: 'slow' }); } }   // pastroqdan, to'liq halqa - yerdagilarga ham tegadi
    },
    // --- MUZ BO'RONI (malika): atrofidagilarni o'ziga tortadi, yaqinda turganlar muzlaydi ---
    vortex: {
        ms: 2300, air: true, start: (c) => {
            ar(c, { k: 'ring:vortex', x: c.e.x - 360, y: c.e.y - 300, w: 720, h: 340, warn: T(450), t: T(1800), dmg: 5, every: T(450), fx: 'slow', dk: 'ground', att: c.e.id, ox: 0, oy: 0, f: 1, cx: 1 });
            c.alive.filter(q => inArena(c, q) && Math.abs(q.x - c.e.x) < 700).forEach(q => c.ctx.emitTo(q.id, 'bigPull', { x: Math.round(c.e.x), ms: 2200, s: 190 }));
        },
        tick: () => 0
    },
    // --- MUZ PARCHALARI HALQASI: atrofga otiladi, keyin malikaga qaytadi (ikki marta xavf) ---
    shardring: {
        ms: 1600, air: true, start: (c) => { const n = 8 + c.rage * 4, cy = c.e.y - c.d.h * 0.55; for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; shotP(c, { x: c.e.x, y: cy, vx: Math.cos(a) * 280, vy: Math.sin(a) * 280, k: 'ice', dmg: Math.round(c.d.dmg * 0.4), ret: T(750), pierce: true, hitIds: [], life: T(2200), fx: 'slow' }); } }
    },
    // --- O'LIK RUHLAR (suyak qirol): sekin, nishonni quvadigan bosh suyaklar ---
    skulls: {
        ms: 1100, air: true, start: (c) => { for (let k = 0; k < 3 + c.rage; k++) { const a = -Math.PI / 2 + (k - 1) * 0.6; shotP(c, { x: c.e.x, y: c.e.y - c.d.h, vx: Math.cos(a) * 200, vy: Math.sin(a) * 200, k: 'skull', home: T(140), spd: 210, dmg: Math.round(c.d.dmg * 0.5), life: T(4200), sc: 1.3 }); } }
    },
    // --- SUYAK QAFAS: o'yinchining ikki yonida suyak devor, keyin o'rtadan - qafasdan sakrab chiqish kerak ---
    cage: {
        ms: 1800, air: true, start: (c) => {
            const q = c.p, s = floorUnder(c, q.x, feetOf(q), 80); if (!s) return;
            [-110, 110].forEach(dx => ar(c, { k: 'pillar:bonewall', x: q.x + dx - 16, y: s.y - 120, w: 32, h: 120, warn: T(550), t: T(1700), dmg: 10, every: T(400), dk: 'ground' }));
            ar(c, { k: 'pillar:bones', x: q.x - 80, y: s.y - 110, w: 160, h: 110, warn: T(1350), t: T(250), dmg: Math.round(c.d.dmg * 1.1), kb: [0, -420], dk: 'ground' });
        }
    },
    // --- O'LIKLARNI TURG'IZISH: yerdan suyak kamonchilar chiqadi ---
    raise: {
        ms: 1300, air: true, start: (c) => {
            if (crowd(c) >= 4) return;
            [-170, 170, 0].slice(0, 2 + c.rage).forEach(dx => { const x = zx(c, c.p.x + dx, 40), s = floorUnder(c, x, feetOf(c.p), 120); if (s) ar(c, { k: 'rise:bone', x: x - 30, y: s.y - 20, w: 60, h: 20, warn: T(1000), t: 1, spawn: 'bonearcher', owner: c.e.id }); });
        }
    },
    // --- TITAN MUSHTI: yerga uradi - ikki tomonga olov chizig'i ---
    fist: { ms: 1500, start: (c) => { marchLine(c, 1, 'fire'); marchLine(c, -1, 'fire'); push(c, 160, 300); } },
    // --- UCH BOSHDAN OLOV (do'zax iti): uchta katta, portlaydigan olov shar ---
    triplefire: {
        ms: 1100, air: true, start: (c) => {
            const o = mouth(c, 0.5, 0.6), a0 = Math.atan2(c.p.y - o.y, c.p.x - o.x);
            [-0.24, 0, 0.24].forEach(da => shotP(c, { x: o.x, y: o.y, vx: Math.cos(a0 + da) * 400, vy: Math.sin(a0 + da) * 400, k: 'fire', sc: 1.7, blast: 55, dmg: Math.round(c.d.dmg * 0.55) }));
        }
    },
    // --- DO'ZAX HALQASI: ikki tomonga yer bo'ylab olov to'lqini + oyog'i ostida olov ---
    inferno: {
        ms: 1400, start: (c) => {
            [-1, 1].forEach(s => shotP(c, { x: c.e.x + s * 40, y: c.e.y - 16, vx: s * (360 + c.rage * 80), vy: 0, k: 'flame', gnd: true, sc: 1.4, dmg: Math.round(c.d.dmg * 0.6), fx: 'burn' }));
            ar(c, { k: 'patch:fire', x: c.e.x - 80, y: c.e.y - 32, w: 160, h: 34, warn: T(400), t: T(3000), dmg: 7, every: T(400), fx: 'burn', dk: 'ground' });
        }
    },
    // --- YER OSTIGA KIRISH (qurt, timsoh): ko'rinmay o'yinchi tagiga suzadi, keyin yerni yorib chiqadi ---
    burrow: {
        ms: 4200, air: true, start: (c) => { c.e.hide = 'under'; c.e.ph = T(500); c.e.bst = 'sink'; say(c, 'burrow'); },
        tick: (c) => {
            const e = c.e;
            if (e.bst === 'sink') { if (--e.ph! <= 0) { e.bst = 'move'; e.ph = T(1600); } return 0; }
            if (e.bst === 'move') {
                const tx = zx(c, c.p.x, 30); e.ph!--;
                if (Math.abs(tx - e.x) < 20 || e.ph! <= 0) {
                    e.bst = 'warn'; e.ph = T(750);
                    ar(c, { k: 'pillar:burst', x: e.x - 70, y: e.y - 230, w: 140, h: 230, warn: T(750), t: T(250), dmg: Math.round(c.d.dmg * 0.9), kb: [260, -620], dk: 'ground' });
                    return 0;
                }
                e.x += Math.sign(tx - e.x) * Math.min(Math.abs(tx - e.x), 330 * c.dt);
                return 0;
            }
            if (e.bst === 'warn' && --e.ph! <= 0) { e.hide = undefined; e.bst = undefined; say(c, 'emerge'); e.mt = Math.min(e.mt!, T(600)); }
            return 0;
        }
    },
    // --- TIMSOH: botqoqdan to'satdan chiqish (burrow bilan bir xil, boshqa ko'rinish) ---
    ambush: { ms: 4200, air: true, start: (c) => MOVES.burrow.start(c), tick: (c) => MOVES.burrow.tick!(c) },
    // --- yoy bilan otiladigan lava / kislota - tushgan joyida dog' qoladi ---
    lavaspit: { ms: 1100, air: true, start: (c) => spit(c, 'lava', 'patch:fire', 'burn') },
    acidspit: { ms: 1100, air: true, start: (c) => spit(c, 'acid', 'patch:acid', 'poison') },
    // --- GIDRA BOSHLARI: uchta bosh navbat bilan kislota otadi ---
    volley: {
        ms: 1300, air: true, start: (c) => { c.e.ph = 0; },
        tick: (c) => {
            const e = c.e; e.ph = (e.ph || 0) + 1;
            const steps = [T(150), T(450), T(750)];
            const i = steps.indexOf(e.ph!);
            if (i >= 0) { const hx = e.x + (i - 1) * c.d.w * 0.32, hy = e.y - c.d.h * (i === 1 ? 0.98 : 0.85), q = c.alive[i % c.alive.length] || c.p, v = lob(hx, hy, q.x + (Math.random() - 0.5) * 60, feetOf(q) - 10, 0.9); shotP(c, { x: hx, y: hy, ...v, arc: true, k: 'acid', sc: 1.3, dmg: Math.round(c.d.dmg * 0.5), area: 'patch:acid' }); }
            return 0;
        }
    },
    // --- DUM ZARBASI: past to'lqinlar ikki tomonga (sakrab o'tiladi) ---
    sweep: { ms: 1100, start: (c) => [-1, 1].forEach(s => shotP(c, { x: c.e.x + s * 50, y: c.e.y - 12, vx: s * (400 + c.rage * 80), vy: 0, k: 'mudwave', gnd: true, sc: 1.3, dmg: Math.round(c.d.dmg * 0.6) })) },
    tailwhip: { ms: 1000, start: (c) => ar(c, { k: 'slash:tail', x: c.e.x - c.d.w * 0.5 - 90, y: c.e.y - 60, w: c.d.w + 180, h: 60, warn: T(500), t: 3, dmg: c.d.dmg, kb: [460, -280], dk: 'hit' }) },
    // --- QURBAQA TILI: o'yinchini tutib, o'ziga tortadi ---
    tongue: {
        ms: 1500, air: true, start: (c) => {
            const o = mouth(c, 0.45, 0.55), a = Math.atan2(c.p.y - o.y, c.p.x - o.x), L = Math.min(560, Math.hypot(c.p.x - o.x, c.p.y - o.y) + 60);
            ar(c, { k: 'tongue', x: o.x, y: o.y, x2: o.x + Math.cos(a) * L, y2: o.y + Math.sin(a) * L, w: 22, h: 0, warn: T(650), t: T(420), dmg: Math.round(c.d.dmg * 0.6), fx: 'pull', dk: 'hit', owner: c.e.id, grow: 1 });
        },
        tick: () => 0
    },
    // --- QORIN BILAN TUSHISH: baland sakrab, o'yinchi ustiga (soyasi oldindan ko'rinadi) ---
    bellyflop: {
        ms: 2200, air: true, start: (c) => {
            const s = floorUnder(c, c.p.x, feetOf(c.p), 300), tx = zx(c, c.p.x, 40);
            if (!c.e.ground || !s) return;
            BM.leapTo(c.e, tx, s.y, 3000); c.e.vy -= 260;   // balandroq
            ar(c, { k: 'fall:shadow', x: tx - 90, y: s.y - 16, w: 180, h: 16, warn: T(1300), t: 1 });
        }
    },
    tadpoles: { ms: 800, air: true, start: (c) => { if (crowd(c) < 4) [-1, 1].forEach(s => minion(c, 'spitter', zx(c, c.e.x + s * 90, 30), c.e.y)); } },
    // --- O'RGIMCHAK QIROLICHA: to'r (oyoqni bog'laydi), shiftdan tushish, tuxum qo'yish ---
    web: { ms: 1000, air: true, start: (c) => { for (let k = -1; k <= 1; k++) BM.shoot(c.S, c.e, c.d, c.p, k * 0.14, 460, Math.round(c.d.dmg * 0.4)); c.S.shots.slice(-3).forEach(s => { s.fx = 'root'; s.k = 'web'; }); } },
    ceiling: {
        ms: 3400, air: true, start: (c) => { c.e.hide = 'up'; c.e.bst = 'climb'; c.e.ph = T(900); say(c, 'climb'); },
        tick: (c) => {
            const e = c.e, top = (c.z ? c.z.y0 : e.y - 500) + 40;
            if (e.bst === 'climb') { e.y += (top - e.y) * 0.12; e.vy = 0; e.ground = false; if (--e.ph! <= 0) { e.bst = 'aim'; e.ph = T(1100); const s = floorUnder(c, c.p.x, feetOf(c.p), 300); e.aimX = zx(c, c.p.x, 40); ar(c, { k: 'fall:shadow', x: e.aimX - 80, y: (s ? s.y : feetOf(c.p)) - 16, w: 160, h: 16, warn: T(1100), t: 1 }); } return 0; }
            if (e.bst === 'aim') { e.x += ((e.aimX ?? e.x) - e.x) * 0.2; e.y = top; e.vy = 0; if (--e.ph! <= 0) { e.bst = 'drop'; e.vy = 900; e.hide = undefined; } return 0; }
            return undefined;   // drop - odatdagi fizika bilan tushadi (qo'nganda zarba)
        }
    },
    eggs: { ms: 900, air: true, start: (c) => { if (crowd(c) < 5) [-1, 1].forEach(s => { const m = BM.spawnEnemy(c.S, 'eggsac', zx(c, c.e.x + s * 70, 30), c.e.y, c.e.zone); m.life = T(4200); }); } },
    // --- KRAKEN (S2 dagidek): platformani tepadan chodir bilan bosadi, suv favvorasi, 3 ta tikanli baliq (fugu), siyoh ---
    tentacle: {
        ms: 1700, air: true, start: (c) => {
            const list = c.alive.filter(q => inArena(c, q)).slice(0, 1 + c.rage);
            list.forEach(q => {
                const s = floorUnder(c, q.x, feetOf(q), 300); if (!s) return;
                const x0 = s.k === 'lakebed' ? q.x - 80 : Math.max(s.x - 10, q.x - 110), x1 = s.k === 'lakebed' ? q.x + 80 : Math.min(s.x + s.w + 10, q.x + 110);
                ar(c, { k: 'slam:tentacle', x: x0, y: s.y - 150, w: x1 - x0, h: 150, warn: T(1150), t: T(350), dmg: 28, kb: [300, -220], dk: 'hit' });
            });
        }
    },
    geyser: {
        ms: 1400, air: true, start: (c) => {
            const z = c.z; if (!z) return;
            const xs = [c.p.x, z.x0 + 120 + Math.random() * (z.x1 - z.x0 - 240)];
            if (Math.abs(xs[1] - xs[0]) < 140) xs[1] = xs[0] + (xs[0] < (z.x0 + z.x1) / 2 ? 300 : -300);
            if (c.rage) xs.push(c.p.x + (Math.random() < 0.5 ? -200 : 200));
            xs.forEach(x => ar(c, { k: 'pillar:geyser', x: x - 28, y: z.y1 - 340, w: 56, h: 340, warn: T(900), t: T(850), dmg: 22, kb: [0, -620], dk: 'ground' }));
        }
    },
    fugu: {
        ms: 1500, air: true, start: (c) => {
            const z = c.z, sy = z ? z.y1 - 40 : c.e.y, sx = c.e.x + (Math.random() < 0.5 ? -1 : 1) * (120 + Math.random() * 80);
            say(c, 'splash', { sx: Math.round(sx), sy: Math.round(sy) });
            const tg = c.alive.filter(q => inArena(c, q)); if (!tg.length) return;
            for (let k = 0; k < 3; k++) { const q = tg[k % tg.length], t = 1.1 + Math.random() * 0.25, v = lob(sx + (k - 1) * 20, sy, q.x + (Math.random() - 0.5) * 80, q.y, t); shotP(c, { x: sx + (k - 1) * 20, y: sy, ...v, arc: true, k: 'fugu', blast: 62, fuse: T(900), dmg: 24, water: 1 }); }
        }
    },
    ink: { ms: 1100, air: true, start: (c) => { for (let k = -1; k <= 1; k++) shotP(c, { x: c.e.x, y: c.e.y - c.d.h * 0.7, vx: k * 120, vy: -160, k: 'ink', sc: 1.5, home: T(110), spd: 230, dmg: 10, fx: 'blind', life: T(4000) }); } },
    // --- HAVO KEMASI: gilam bombardimoni, to'p o'qlari, raketalar, desant (robot botlar parashyutda) ---
    carpet: {
        ms: 2800, air: true, start: (c) => { const z = c.z; c.e.goX = z ? (c.e.x < (z.x0 + z.x1) / 2 ? z.x1 - 120 : z.x0 + 120) : c.e.x; c.e.ph = 0; say(c, 'carpet'); },
        tick: (c) => {
            const e = c.e; e.ph = (e.ph || 0) + 1;
            if (e.ph % T(230) === 0) shotP(c, { x: e.x, y: e.y + 8, vx: e.vx * 0.2, vy: 80, arc: true, k: 'bomb', blast: 70, dmg: Math.round(c.d.dmg * 0.8) });
            if (Math.abs((e.goX ?? e.x) - e.x) < 30) e.mt = Math.min(e.mt!, 2);
            return undefined;
        }
    },
    broadside: { ms: 1300, air: true, start: (c) => { for (let k = 0; k < 5 + c.rage * 2; k++) { const tx = c.p.x + (k - 2) * 90, v = lob(c.e.x + (k - 2) * 30, c.e.y - 20, tx, feetOf(c.p) - 10, 0.8 + k * 0.07); shotP(c, { x: c.e.x + (k - 2) * 30, y: c.e.y - 20, ...v, arc: true, k: 'cannon', blast: 48, dmg: Math.round(c.d.dmg * 0.6) }); } } },
    missile: { ms: 1300, air: true, start: (c) => { [-1, 1].forEach(s => shotP(c, { x: c.e.x + s * 70, y: c.e.y - 10, vx: s * 160, vy: -200, k: 'missile', home: T(90), spd: 300, blast: 55, dmg: Math.round(c.d.dmg * 0.75), life: T(4000) })); } },
    paratroopers: { ms: 900, air: true, start: (c) => { if (crowd(c) < 4) [-1, 1].forEach(s => { const m = minion(c, 'tknife', c.e.x + s * 60, c.e.y + 10); m.para = true; m.ground = false; }); } },
    // --- SEMIZ ELF (S1 dagidek): og'zida kislota yig'adi (0.7 s), so'ng yugurayotgan nishonning YETIB BORADIGAN joyiga 3 ta tomchi (zich - yonga sakrab qochiladi) ---
    fspit: {
        ms: 1200, air: true, start: (c) => { c.e.ph = T(700); c.ctx.emit('bigWind', { id: c.e.id }); },
        tick: (c) => {
            const e = c.e;
            if (--e.ph! === 0) {
                const o = mouth(c, 0.1, 0.66), q = c.p, n = 3 + c.rage, v = c.S.pv[q.id];
                for (let k = 0; k < n; k++) {
                    const off = (k - (n - 1) / 2) * 28, fl = Math.max(0.45, Math.min(1.05, Math.abs(q.x - o.x) / 760)) + Math.abs(off) / 900;
                    const lead = v ? Math.max(-240, Math.min(240, v.vx * fl * 0.9)) : 0;
                    shotP(c, { x: o.x, y: o.y, ...lob(o.x, o.y - 30, q.x + lead + off, q.y, fl + 0.25), arc: true, k: 'acid', sc: 1.3, dmg: Math.round(c.d.dmg * 0.8), fx: 'curse' });   // tepaga tupuradi
                }
                c.ctx.emit('bigShoot', { id: e.id });
            }
            return 0;
        }
    },
    // --- YASHIL OLOV: og'zidan oldinga-pastga (yerdagi va past tokchadagilar kuyadi); ogohlantirish oxirida yo'nalish qotadi ---
    fflame: {
        ms: 2300, start: (c) => {
            const o = mouth(c, 0.3, 0.66), L = 330;
            ar(c, { k: 'breath:greenfire', x: c.e.f > 0 ? o.x : o.x - L, y: c.e.y - FLAME.h, w: L, h: FLAME.h, warn: T(600), t: T(1600), dmg: 9, every: T(300), fx: 'burn', dk: 'hit', att: c.e.id, ox: c.d.w * 0.3, oy: FLAME.h / 2, f: c.e.f });
        },
        tick: () => 0
    },
    // --- HAVO KEMASI (S2 dagidek): nishonni OLDINDAN oladigan 3 ta o'q (har biri - tasodifiy o'yinchiga) ---
    volley3: {
        ms: 1100, air: true, start: (c) => { c.e.ph = 0; },
        tick: (c) => {
            const e = c.e; e.ph = (e.ph || 0) + 1;
            if (e.ph % T(240) === 0 && e.ph <= T(720)) {
                const list = c.alive.filter(q => inArena(c, q)), q = list[Math.floor(Math.random() * list.length)] || c.p, g = gun(c), a = leadAt(c, q, g.x, g.y, 360);
                aimShot(c, g.x, g.y, a.x, a.y, 360, Math.round(c.d.dmg * 0.6), 0);
            }
            return undefined;
        }
    },
    // --- 7 ta o'q yelpig'ichi - eng yaqin o'yinchi tomonga ---
    fan7: {
        ms: 1000, air: true, start: (c) => { c.e.ph = 0; },
        tick: (c) => {
            const e = c.e; e.ph = (e.ph || 0) + 1;
            if (e.ph === T(450)) { const g = gun(c), a = leadAt(c, c.p, g.x, g.y, 306); for (let k = -3; k <= 3; k++) aimShot(c, g.x, g.y, a.x, a.y, 306, Math.round(c.d.dmg * 0.6), k * 0.16); }
            return undefined;
        }
    },
    // --- DAM OLISH (S1/S2 bosslaridagidek: gorilla nafas oladi, avtomat qalqonsiz turadi): hujum qilmaydi, zarar ko'proq o'tadi ---
    rest: { ms: 1300, air: true, start: (c) => { c.e.vuln = c.S.tick + T(1300); say(c, 'tired'); }, tick: () => 0 }
};
const gun = (c: Ctx) => ({ x: c.e.x + c.e.f * (c.d.w / 2 - 6), y: c.e.y + 20 });
function aimShot(c: Ctx, x: number, y: number, tx: number, ty: number, spd: number, dmg: number, spread: number): void {
    const a = Math.atan2(ty - y, tx - x) + spread;
    shotP(c, { x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, k: 'orb', sc: 1.2, dmg, life: T(3500) });
}
// OLDINDAN MO'LJAL (S1/S2 dagidek): o'yinchi tezligiga qarab o'q yetib boradigan paytdagi joyi
function leadAt(c: { S: BM.BigState }, q: PlayerState, sx: number, sy: number, spd: number): { x: number, y: number } {
    const v = c.S.pv[q.id]; let tx = q.x, ty = q.y;
    for (let k = 0; k < 2; k++) { const tt = Math.min(1.4, Math.hypot(tx - sx, ty - sy) / Math.max(1, spd)); tx = q.x + Math.max(-260, Math.min(260, (v ? v.vx : 0) * tt)); ty = q.y + Math.max(-120, Math.min(120, (v ? v.vy : 0) * tt * 0.5)); }
    return { x: tx, y: ty };
}
function jumpAt(c: Ctx, maxV: number): void {
    let s = BM.surfaceBelow(c.S, c.p.x, feetOf(c.p) - 8, 40);
    if (s && c.z && (s.y < c.z.y0 || s.y > c.z.y1 + 60)) s = null;
    const tx = zx(c, s ? Math.max(s.x + 20, Math.min(s.x + s.w - 20, c.p.x)) : c.p.x);
    if (!(c.e.ground && BM.leapTo(c.e, tx, s ? s.y : c.e.y, maxV))) { if (c.e.ground) { c.e.vy = -(c.d.jump || 600); c.e.ground = false; } }
}
function marchLine(c: Ctx, dir: number, k: string): void {
    const fl = BM.surfaceBelow(c.S, c.e.x, c.e.y - 8, 40); if (!fl) return;
    const n = 7 + c.rage * 2, fx = k === 'root' ? 'root' : k === 'icespike' ? 'slow' : k === 'fire' ? 'burn' : undefined;
    for (let i = 1; i <= n; i++) {
        const x = c.e.x + dir * (c.d.w * 0.4 + i * 92);
        if (x < fl.x + 10 || x > fl.x + fl.w - 10 || (c.z && (x < c.z.x0 - 40 || x > c.z.x1 + 40))) break;
        ar(c, { k: 'pillar:' + k, x: x - 36, y: fl.y - 105, w: 72, h: 105, warn: T(520) + i * T(115), t: T(260), dmg: Math.round(c.d.dmg * 0.7), fx, kb: [180, -360], dk: 'ground' });
    }
}
function spit(c: Ctx, k: string, patch: string, fx: string): void {
    for (let i = 0; i < 3 + c.rage; i++) { const q = c.alive[i % c.alive.length] || c.p, v = lob(c.e.x + c.e.f * c.d.w * 0.4, c.e.y - c.d.h * 0.6, q.x + (i - 1) * 90, feetOf(q) - 10, 0.85 + i * 0.1); shotP(c, { x: c.e.x + c.e.f * c.d.w * 0.4, y: c.e.y - c.d.h * 0.6, ...v, arc: true, k, sc: 1.2, dmg: Math.round(c.d.dmg * 0.5), area: patch, fx }); }
}
function inArena(c: Ctx, q: PlayerState): boolean { const z = c.z; return !z || (q.x > z.x0 - 80 && q.x < z.x1 + 80 && feetOf(q) >= z.y0 - 40 && feetOf(q) <= z.y1 + 80); }
const overlap = (c: Ctx) => BM.overlap(BM.eRect(c.e, c.d), BM.pRect(c.p));
function knock(c: Ctx, q: PlayerState, vx: number, vy: number): void { safeKnock(c.S, c.z, q, Math.sign((q.x - c.e.x) || 1) * vx, vy, c.ctx); }
// UZOQQA ULOQTIRISH: maydon chetida turgan o'yinchini jarga otib yubormaslik (chetdan tashqariga - kuchsiz)
export function safeKnock(S: BM.BigState, z: BM.BigZone | undefined, q: PlayerState, vx: number, vy: number, ctx: BM.BigCtx): void {
    if (z && ((vx < 0 && q.x - z.x0 < 220) || (vx > 0 && z.x1 - q.x < 220))) vx = Math.sign(vx) * Math.min(Math.abs(vx), 160);
    ctx.knock(q, vx, vy);
}
// atrofdagilarni uloqtiradi (zarar ozroq) - qochish: uzoqroqda yoki tepada turish
function push(c: Ctx, r: number, power: number): void {
    say(c, 'shock', { r });
    c.alive.forEach(q => { if (Math.abs(q.x - c.e.x) < r && Math.abs(feetOf(q) - c.e.y) < 90) { BM.hurtBig(q, Math.round(c.d.dmg * 0.4), c.ctx, 'ground'); knock(c, q, power, -300); } });
}

// ===== BOSS MIYASI =====
export function bossAI(S: BM.BigState, e: BM.BigEnemy, d: BM.EnemyDef, p: PlayerState, alive: PlayerState[], ctx: BM.BigCtx, dt: number): void {
    const dx = p.x - e.x, dyFeet = feetOf(p) - e.y, kit = KITS[e.k] || ['charge'];
    const z = S.w.zones.find(q => q.id === e.zone);
    if (e.ground && e.fy === undefined) e.fy = e.y;
    // 2-BOSQICH: joni yarmidan kam - g'azablanadi (tezroq, ko'proq / qattiqroq hujumlar)
    if (!e.p2 && e.hp < e.mx * 0.5) { e.p2 = true; ctx.emit('bigBossMove', { id: e.id, m: 'rage', x: Math.round(e.x), y: Math.round(e.y) }); }
    const rage = e.p2 ? 1 : 0;
    const name = (e.move || 'walk').split(':')[0], arg = (e.move || '').split(':')[1] || '';
    const c: Ctx = { S, e, d, p, alive, ctx, z, rage, arg, dt };
    // GANGIB QOLGAN (mamont devorga urildi): turib qoladi, zarar ko'proq o'tadi
    if ((e.daze || 0) > 0) { e.daze!--; e.move = 'walk'; BM.moveEnemy(S, e, d, 0, p, dt); return; }
    if (!e.move) { e.move = 'walk'; e.mt = T(1500); e.mi = -1; }
    e.mt = (e.mt || 0) - 1;
    let vx = Math.abs(dx) > d.reach * 0.8 ? Math.sign(dx) * d.spd * (rage ? 0.95 : 0.72) : 0;   // sekinroq yuradi (qochib, otib ulgurish uchun)
    if (rage && e.k === 'alpha') vx *= 1.4;   // alfa: oy jazavasi - g'azabda ancha tez
    // oddiy zarba (yashiringan paytda emas)
    if (!e.hide && e.move === 'walk' && e.atk === 0 && e.cd <= 0 && Math.abs(dx) < d.reach + 14 && Math.abs(dyFeet) < d.h) { e.atk = T(420); e.cd = T(d.atkMs * (rage ? 0.75 : 1)); e.af = dx < 0 ? -1 : 1; ctx.emit('bigWind', { id: e.id }); }
    // zarba tushdi: faqat zarba tomonida (old) turganga tegadi - yonidan / orqasidan o'tib ketgan o'yinchiga tegmaydi
    if (e.atk > 0 && --e.atk === 0 && !e.hide && (p.x - e.x) * (e.af || e.f) > -d.w * 0.25 && Math.abs(p.x - e.x) < d.reach + 24 && Math.abs(feetOf(p) - e.y) < d.h + 10) BM.hurtBig(p, d.dmg, ctx);
    const inA = !z || (feetOf(p) >= z.y0 - 40 && feetOf(p) <= z.y1 + 60);
    if (!inA && e.move === 'walk') e.mt = Math.max(e.mt || 0, 1);   // o'yinchi maydon sathidan tashqarida - kutadi
    if (e.move === 'walk' && e.mt! <= 0) {
        // HUJUM TANLASH: navbat bilan; o'yinchi tepada (qo'l yetmaydi) bo'lsa - unga yetadiganini; chaqiriladiganlar ko'p bo'lsa - boshqasini
        const above = dyFeet < (d.sway ? -d.h : -70);
        let pick = '';
        // DAM OLISH: har 3 hujumdan keyin (g'azabda - 4) bir oz nafas oladi - javob qaytarish payti
        e.rn = (e.rn || 0) + 1;
        if (e.rn > (rage ? 4 : 3) && e.ground !== false) { e.rn = 0; pick = 'rest'; }
        for (let i = 1; i <= kit.length && !pick; i++) {
            const m = kit[((e.mi ?? -1) + i) % kit.length], def = MOVES[m.split(':')[0]];
            if (!def) continue;
            if (above && !def.air) continue;
            if (m === 'fflame' && !(Math.abs(dx) <= 420 && Math.abs(dyFeet) < 150)) continue;   // olov yetmaydi - kislota
            if ((m === 'summon' || m === 'tadpoles' || m === 'eggs' || m === 'clones' || m === 'horn' || m === 'raise' || m === 'paratroopers') && crowd(c) >= 4) continue;
            if ((m.startsWith('leap') || m.startsWith('pounce') || m === 'bellyflop' || m === 'slam') && !e.ground) continue;
            e.mi = ((e.mi ?? -1) + i) % kit.length; pick = m;
        }
        if (!pick) pick = 'wave';
        const nm = pick.split(':')[0], def = MOVES[nm];
        e.move = pick; e.mt = T(def.ms * (rage ? 0.9 : 1));
        ctx.emit('bigBossMove', { id: e.id, k: e.k, m: pick, x: Math.round(e.x), y: Math.round(e.y) });
        def.start({ ...c, arg: pick.split(':')[1] || '' });
    }
    let landed = false;
    if (e.move !== 'walk') {
        const def = MOVES[(e.move || '').split(':')[0]];
        const v = def && def.tick ? def.tick({ ...c, arg: (e.move || '').split(':')[1] || '' }) : undefined;
        if (v !== undefined) vx = v;
        if ((name === 'leap' || name === 'pounce' || name === 'bellyflop' || name === 'ceiling') && !e.ground && !e.hide && overlap(c) && (e.ccd || 0) <= S.tick) { BM.hurtBig(p, d.dmg, ctx); e.ccd = S.tick + T(600); }
        if (e.mt! <= 0) { e.move = 'walk'; e.spin = false; e.goX = undefined; e.hide = undefined; e.bst = undefined; e.mt = T((rage ? 1000 : 1550) + Math.random() * (rage ? 450 : 700)); }
    }
    // jang maydonidan chiqib ketmaydi
    if (z && ((e.x < z.x0 && vx < 0) || (e.x > z.x1 && vx > 0))) vx = 0;
    if (Math.abs(vx) > 0 && name !== 'stampede') e.f = vx < 0 ? -1 : 1;
    // HAVO KEMASI: eng yaqin o'yinchidan ~330 px narida suzadi (S2 dagidek)
    if (e.k === 'skyship') e.goX = zx(c, p.x + (e.x >= p.x ? 1 : -1) * 330, d.w / 2);
    // yer ostida / shiftda - fizika o'z hujumida
    if (e.hide === 'under' || (e.hide === 'up' && e.bst !== 'drop') || e.hide === 'blink') return;
    landed = BM.moveEnemy(S, e, d, vx, p, dt);
    if (z && e.lvx !== undefined && ((e.x <= z.x0 && e.lvx < 0) || (e.x >= z.x1 && e.lvx > 0))) e.lvx = 0;
    // YERGA URILISH (sakrashdan qo'nganda): atrofdagilarga zarba; slam / qorin bilan / shiftdan - ikki tomonga to'lqin
    if (landed && (name === 'slam' || name === 'leap' || name === 'pounce' || name === 'bellyflop' || name === 'ceiling')) {
        const big = name === 'slam' || name === 'bellyflop' || name === 'ceiling', r = name === 'bellyflop' ? 220 : big ? 230 : 130;
        alive.forEach(q => { if (Math.abs(q.x - e.x) < r && Math.abs(feetOf(q) - e.y) < 40) { BM.hurtBig(q, Math.round(d.dmg * (big ? 1 : 0.7)), ctx, 'ground'); if (big) knock(c, q, 380, -320); } });
        ctx.emit('bigBossMove', { id: e.id, m: 'quake', x: Math.round(e.x), y: Math.round(e.y), big: big ? 1 : 0 });
        if (big) [-1, 1].forEach(s => S.shots.push({ id: ++S.seq, owner: e.id, x: e.x + s * 30, y: e.y - 12, vx: s * (380 + rage * 80), vy: 0, dmg: Math.round(d.dmg * 0.6), t: 0, arc: false, k: e.k === 'toadking' ? 'mudwave' : 'shock', gnd: true }));
        if (name === 'ceiling') { e.bst = undefined; if (crowd(c) < 4) [-1, 1].forEach(s => minion(c, 'spider', e.x + s * 60, e.y)); }
        // o'rgimchak / alfa: ketma-ket sakrashlar
        if (name === 'pounce' && (e.combo || 0) > 0) { e.combo!--; e.mt = T(1100); jumpAt(c, 2200); ctx.emit('bigWind', { id: e.id }); return; }
        e.move = 'walk'; e.mt = T(rage ? 1000 : 1500);
    }
}

// ===== MAYDONLAR (har tik) =====
export function updateAreas(S: BM.BigState, alive: PlayerState[], ctx: BM.BigCtx, dt: number): void {
    for (let i = S.areas.length - 1; i >= 0; i--) {
        const a = S.areas[i];
        // bossga bog'langan (nafas, bo'ron): u bilan birga yuradi; boss o'lsa / yashirinsa - yo'qoladi
        if (a.att) {
            const o = S.enemies.find(q => q.id === a.att);
            if (!o || o.hide) { S.areas.splice(i, 1); continue; }
            if (a.cx) { a.x = o.x - a.w / 2; a.y = o.y - a.h + 40; }
            else { const mx = o.x + (a.f || 1) * (a.ox || 0); a.x = (a.f || 1) > 0 ? mx : mx - a.w; a.y = o.y - (a.oy || 0) - a.h / 2; }
        }
        // suzuvchi bulut: eng yaqin o'yinchiga sekin
        if (a.seek && a.warn <= 0) {
            const q = BM.nearest(alive, { x: a.x + a.w / 2, y: a.y + a.h / 2 });
            if (q) { const ddx = q.x - (a.x + a.w / 2), ddy = q.y - (a.y + a.h / 2), l = Math.hypot(ddx, ddy) || 1; a.x += ddx / l * a.seek * dt; a.y += ddy / l * a.seek * dt * 0.6; }
        }
        if (a.warn > 0) {
            a.warn--;
            if (a.warn === 0) {
                // faollashdi: tushdi / otilib chiqdi; yerdan chiqadigan maxluqlar
                if (a.spawn) { const m = BM.spawnEnemy(S, a.spawn, a.x + a.w / 2, a.y + a.h, a.zone ?? -1); m.st = 'chase'; m.cd = T(800); ctx.emit('bigBossMove', { m: 'rise', x: Math.round(a.x + a.w / 2), y: Math.round(a.y + a.h) }); }
                if (a.after) area(S, { ...a.after, k: a.after.k!, x: a.x - 20, y: a.y + a.h - 30, w: a.w + 40, h: 32, warn: 0, zone: a.zone, owner: a.owner } as any);
            }
            continue;
        }
        if (a.dmg > 0) {
            const hitNow = a.every ? ((a.next || 0) <= S.tick) : true;
            if (hitNow) {
                if (a.every) a.next = S.tick + a.every;
                const prog = a.grow ? Math.min(1, 1 - (a.t / (a.t0 || a.t))) * 2 : 1;   // til: asta cho'ziladi
                alive.forEach(q => {
                    if (!a.every && (a.hit || (a.hit = [])).includes(q.id)) return;
                    if (!touches(a, q, prog)) return;
                    if (!a.every) a.hit!.push(q.id);
                    BM.hurtBig(q, a.dmg * (S.dkm[a.owner!] || 1), ctx, a.dk || 'ground');
                    applyFx(S, a, q, ctx);
                    if (a.kb) safeKnock(S, S.w.zones.find(z => z.id === a.zone), q, (a.kx || Math.sign((q.x - (a.x + a.w / 2)) || 1)) * a.kb[0], a.kb[1], ctx);
                    if (a.drain) { const o = S.enemies.find(e => e.id === a.owner); if (o) o.hp = Math.min(o.mx, o.hp + a.dmg * a.drain); }
                });
            }
        }
        if (a.t0 === undefined) a.t0 = a.t;
        if (--a.t <= 0) S.areas.splice(i, 1);
    }
    // KUYISH / ZAHAR: asta jon oladi
    Object.entries(S.dots).forEach(([pid, dd]) => {
        if (dd.until <= S.tick) { delete S.dots[pid]; return; }
        if (dd.next > S.tick) return;
        dd.next = S.tick + T(500);
        const q = alive.find(p => p.id === pid); if (!q) return;
        BM.hurtBig(q, dd.dps * 0.5, ctx, 'ground');
        ctx.emitTo(pid, 'bigBurn', { x: Math.round(q.x), y: Math.round(q.y + 24), p: dd.k === 'poison' ? 1 : 0 });
    });
}
// semiz elf olovi (konus): maydon tepasidan og'izgacha mouth px; markaz kd (ulush) masofada drop px pastga egiladi, keyin tekis; qalinligi h0 -> h1 (yarmi)
export const FLAME = { h: 125, mouth: 44, drop: 51, kd: 0.4, h0: 6, h1: 34 };
function touches(a: BM.BigArea, q: PlayerState, prog: number): boolean {
    if (a.k === 'breath:greenfire') {
        const f = a.f || 1, sx = f > 0 ? a.x : a.x + a.w, d = (q.x - sx) * f;
        if (d < -12 || d > a.w + 12) return false;
        const k = Math.max(0, Math.min(1, d / a.w)), cy = a.y + FLAME.mouth + FLAME.drop * Math.min(1, k / FLAME.kd), hh = FLAME.h0 + (FLAME.h1 - FLAME.h0) * k;
        return q.y + 24 > cy - hh && q.y - 24 < cy + hh;
    }
    if (a.x2 !== undefined) {   // nur / til: kesmaga masofa
        const x2 = a.x + (a.x2 - a.x) * Math.min(1, prog), y2 = a.y + (a.y2! - a.y) * Math.min(1, prog);
        const vx = x2 - a.x, vy = y2 - a.y, l2 = vx * vx + vy * vy || 1, t = Math.max(0, Math.min(1, ((q.x - a.x) * vx + (q.y - a.y) * vy) / l2));
        return Math.hypot(q.x - (a.x + vx * t), q.y - (a.y + vy * t)) < a.w / 2 + 14;
    }
    return BM.overlap(BM.pRect(q), a);
}
function applyFx(S: BM.BigState, a: { fx?: string, owner?: number, x: number, w: number }, q: PlayerState, ctx: BM.BigCtx): void {
    const fx = a.fx; if (!fx) return;
    if (fx === 'slow') ctx.emitTo(q.id, 'bigChill', { ms: 1500 });
    else if (fx === 'root') ctx.emitTo(q.id, 'bigRoot', { ms: 1100 });
    else if (fx === 'blind') ctx.emitTo(q.id, 'bigBlind', { ms: 2600 });
    else if (fx === 'burn' || fx === 'poison') S.dots[q.id] = { until: S.tick + T(2500), dps: 8, next: S.tick + T(500), k: fx };
    else if (fx === 'curse') { S.dots[q.id] = { until: S.tick + T(2500), dps: 8, next: S.tick + T(500), k: 'poison' }; ctx.curse(q); }   // semiz elf so'lagi: jon tiklanmaydi
    else if (fx === 'pull') { const o = S.enemies.find(e => e.id === a.owner); if (o) { ctx.knock(q, Math.max(-780, Math.min(780, (o.x - q.x) * 2.4)), -240); ctx.emitTo(q.id, 'bigRoot', { ms: 500 }); } }
}

// ===== O'QLAR (har tik) =====
export function updateShots(S: BM.BigState, alive: PlayerState[], ctx: BM.BigCtx, dt: number): void {
    const boom = (s: BM.BigShot, x: number, y: number) => {
        ctx.emit('bigBlast', { x: Math.round(x), y: Math.round(y), r: s.blast, k: s.k });
        const oz = S.w.zones.find(z => z.id === S.enemies.find(e => e.id === s.owner)?.zone);
        alive.forEach(q => { if (Math.hypot(q.x - x, q.y - y) <= s.blast! + 12) { BM.hurtBig(q, s.dmg * (S.dkm[s.owner!] || 1), ctx, 'shot'); safeKnock(S, oz, q, Math.sign((q.x - x) || 1) * 300, -260, ctx); applyFx(S, { ...s, w: 0 }, q, ctx); } });
    };
    for (let i = S.shots.length - 1; i >= 0; i--) {
        const s = S.shots[i];
        s.t++;
        if (s.wait && s.t < s.wait) continue;   // gorilla xarsangi shiftda kutmoqda (S1: avval chang to'kiladi)
        if (s.idle) {                            // yerda yotgan shayba - xokkeychi kelib urguncha (u yo'q bo'lsa - maydon tiklangan: shayba ham yo'qoladi)
            if (S.enemies.some(e => e.id === s.owner)) s.t--; else S.shots.splice(i, 1);
            continue;
        }
        // YERDA TURGAN bomba / fugu: pilik yonadi - tugasa yoki kimdir tegsa portlaydi
        if (s.sit !== undefined) {
            const touch = alive.some(q => Math.abs(q.x - s.x) < 22 && Math.abs(q.y - s.y) < 34);
            if (--s.sit <= 0 || touch) { boom(s, s.x, s.y - 6); S.shots.splice(i, 1); }
            continue;
        }
        // sekin nishonga burilish (sehrli shar, bosh suyak, raketa, siyoh)
        if (s.home && s.t < s.home) {
            const q = BM.nearest(alive, s);
            if (q) { const a = Math.atan2(q.y - s.y, q.x - s.x), sp = s.spd || Math.hypot(s.vx, s.vy), cur = Math.atan2(s.vy, s.vx); let da = a - cur; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI; const n = cur + Math.max(-0.05, Math.min(0.05, da)); s.vx = Math.cos(n) * sp; s.vy = Math.sin(n) * sp; }
        }
        // qaytib keladigan muz parchalari
        if (s.ret && s.t === s.ret) { const o = S.enemies.find(e => e.id === s.owner); if (o) { const a = Math.atan2(o.y - ENEMIES_H(o) - s.y, o.x - s.x); s.vx = Math.cos(a) * 340; s.vy = Math.sin(a) * 340; s.hitIds = []; } }
        if (s.roll) {
            // DUMALOVCHI: yer bo'ylab; maydon chetidan bir marta qaytadi; qor - o'sib boradi
            const nx = s.x + s.vx * dt, g = BM.surfaceBelow(S, nx, s.y + s.roll - 30, 60);
            if (g) { s.x = nx; s.y = g.y - s.roll; s.vy = 0; }
            else { s.x = nx; s.vy = (s.vy || 0) + 900 * dt; s.y += s.vy * dt; }
            const o = S.enemies.find(e => e.id === s.owner), z = o && S.w.zones.find(q => q.id === o.zone);
            if (z && ((s.x < z.x0 && s.vx < 0) || (s.x > z.x1 && s.vx > 0))) { if ((s.bounce || 0) > 0) { s.bounce!--; s.vx = -s.vx; } else s.t = 1e9; }
            if (s.grow && s.rmax) s.roll = Math.min(s.rmax, s.roll + s.grow);
        } else {
            if (s.arc) s.vy += 600 * dt;
            s.x += s.vx * dt; s.y += s.vy * dt;
        }
        let gone = s.t > (s.life || 150);
        const r = s.roll || (s.sc ? 9 * s.sc : 9);
        const box = { x: s.x - r, y: s.y - r, w: r * 2, h: r * 2 };
        for (const p of alive) {
            if (!BM.overlap(box, BM.pRect(p))) continue;
            if (s.pierce) { if ((s.hitIds || (s.hitIds = [])).includes(p.id)) continue; s.hitIds.push(p.id); }
            if (s.blast) { boom(s, s.x, s.y); gone = true; break; }
            BM.hurtBig(p, s.dmg * (S.dkm[s.owner!] || 1), ctx, s.gnd || s.roll ? 'ground' : 'shot');
            if (BM.CHILL[s.k]) ctx.emitTo(p.id, 'bigChill', { ms: 1400 });
            applyFx(S, { ...s, w: 0 }, p, ctx);
            if (s.kb) safeKnock(S, S.w.zones.find(z => z.id === S.enemies.find(e => e.id === s.owner)?.zone), p, Math.sign(s.vx || 1) * 380, -280, ctx);
            if (!s.pierce) { gone = true; break; }
        }
        if (!gone && s.gnd) { if (!BM.surfaceBelow(S, s.x, s.y, 40)) gone = true; }
        else if (!gone && !s.roll && s.vy >= 0) {
            const g = BM.surfaceBelow(S, s.x, s.y - s.vy * dt, s.vy * dt + 2, s.nl);
            if (g && s.y >= g.y && (s.arc || g.h > 22)) {   // to'g'ri uchadigan o'q yupqa tokcha / pog'onadan o'tadi (yoy bilan tushadigani - ustiga tushadi)
                gone = true;
                const inWater = s.water && (g.k === 'lakebed' || S.w.lakes.some(l => s.x > l.x && s.x < l.x + l.w && g.y > l.y));
                if (inWater) ctx.emit('bigBlast', { x: Math.round(s.x), y: Math.round(g.y - 40), r: 0, k: 'splash' });
                else if (s.fuse) { s.sit = s.fuse; s.vx = s.vy = 0; s.y = g.y - 8; gone = false; }
                else if (s.blast) boom(s, s.x, g.y - 6);
                if (!inWater && s.area) area(S, { zone: S.enemies.find(e => e.id === s.owner)?.zone, k: s.area, x: s.x - 50, y: g.y - 28, w: 100, h: 30, t: T(3200), dmg: 6, every: T(400), fx: s.fx, dk: 'ground' });
                if (!inWater && s.split) for (let k = 0; k < s.split; k++) { const a = -Math.PI / 2 + (k - (s.split - 1) / 2) * 0.7; S.shots.push({ id: ++S.seq, owner: s.owner, x: s.x, y: g.y - 12, vx: Math.cos(a) * 300, vy: Math.sin(a) * 300, dmg: Math.round(s.dmg * 0.5), t: 0, arc: true, k: s.splitK || 'ice', fx: s.splitK ? undefined : 'slow' }); }
            }
        }
        if (gone) S.shots.splice(i, 1);
    }
}
const ENEMIES_H = (o: BM.BigEnemy) => (BM.ENEMIES[o.k] ? BM.ENEMIES[o.k].h * 0.55 : 40);

// ===== SET-PIECE BOSSLAR: S1 / S2 xaritalaridagi asl bosslar - o'sha miya, o'sha hujumlar (oddiy "yurib, navbat bilan" emas) =====
type SP = { S: BM.BigState; e: BM.BigEnemy; d: BM.EnemyDef; alive: PlayerState[]; ctx: BM.BigCtx; dt: number };
const zoneOf = (S: BM.BigState, e: BM.BigEnemy) => S.w.zones.find(q => q.id === e.zone);
const inZ = (z: BM.BigZone | undefined, q: PlayerState) => !z || (q.x > z.x0 - 20 && q.x < z.x1 + 20 && feetOf(q) >= z.y0 - 40 && feetOf(q) <= z.y1 + 80);
const spAr = (c: SP, o: Partial<BM.BigArea> & { k: string, x: number, y: number, w: number, h: number }) => area(c.S, { zone: c.e.zone, owner: c.e.id, ...o });
const spSay = (c: SP, m: string, extra: object = {}) => c.ctx.emit('bigBossMove', { id: c.e.id, k: c.e.k, m, x: Math.round(c.e.x), y: Math.round(c.e.y), ...extra });
function spRage(c: SP): number {
    if (!c.e.p2 && c.e.hp < c.e.mx * 0.5) { c.e.p2 = true; spSay(c, 'rage'); }
    return c.e.p2 ? 1 : 0;
}
const pickOne = <X>(a: X[]) => a[Math.floor(Math.random() * a.length)];

// LEGENDARY KRAKEN (S2 map-4): ko'l tubidan ko'tarilib chiqadi, ko'l o'rtasida suzib turadi (ko'zi tepaga-pastga, tanasi chapga-o'ngga).
// Faqat QIZIL KO'ZI zarar oladi. Hujumlari:
//  1) QO'L: o'yinchi turgan pog'onaga - avval suvdan qo'l ko'tariladi (pog'onada qizil ogohlantirish), keyin pog'ona ustiga yotqiziladi
//  2) GEYZERLAR: ikkitasi (biri o'yinchi ostidan) - suv ustuni ekranning eng tepasigacha otiladi
//  3) SUVNI URADI: 3 ta tikanli baliq sakrab chiqadi - o'yinchiga tegsa / pog'onaga tushsa portlaydi, suvga tushsa - so'nadi
export const KRAKEN = { slamDmg: 32, slamMs: 4600, slamRaiseMs: 1000, slamHitMs: 450, geyserDmg: 28, geyserMs: 6200, geyserWarnMs: 900, geyserUpMs: 1000,
    fishMs: 7000, fishN: 3, fishDmg: 24, fishR: 50, eyeUp: 226, eyeAmp: 90, xAmp: 340, riseMs: 2200 };
function krakenAI(c: SP): void {
    const { S, e } = c, K = KRAKEN, z = zoneOf(S, e);
    const L = S.w.lakes.find(l => z ? l.x < z.x1 && l.x + l.w > z.x0 && l.y >= z.y0 && l.y <= z.y1 + 60 : Math.abs(l.x + l.w / 2 - e.hx) < l.w && Math.abs(l.y - e.hy) < 800);
    if (!L) return;
    const surf = L.y;
    if (e.bst === undefined) {
        e.hx = L.x + L.w / 2; e.hy = surf; e.ey = surf + 260; e.bst = 'rise'; e.ph = T(K.riseMs); e.hide = 'under'; e.move = 'rise';
        spSay(c, 'krise', { sx: Math.round(e.hx), sy: Math.round(surf) });
    }
    const rage = spRage(c), k = rage ? 0.8 : 1;
    // HARAKAT: ko'z sekin tepaga-pastga va chapga-o'ngga suzadi
    const ph = S.tick * 2 * Math.PI, target = surf - K.eyeUp + K.eyeAmp * Math.sin(ph / T(7000));
    e.x = e.hx + Math.min(K.xAmp, L.w * 0.18) * Math.sin(ph / T(11000));
    if (e.bst === 'rise') {
        e.ey = Math.max(target, e.ey! - 6);   // suvdan ko'tarilib chiqadi
        if (e.ey! < surf - 30) e.hide = undefined;
        if (--e.ph! <= 0) { e.bst = 'fight'; e.move = ''; e.hide = undefined; e.tA = S.tick + T(1500); e.tB = S.tick + T(3500); e.tC = S.tick + T(5500); }
    } else e.ey = target;
    e.y = e.ey! + c.d.h / 2;   // tana to'rtburchagi - ko'z (o'q faqat unga tegadi)
    e.vx = e.vy = 0; e.ground = true;
    const inA = c.alive.filter(q => inZ(z, q));
    if (inA.length) e.f = BM.nearest(inA, e)!.x < e.x ? -1 : 1;
    if (e.bst !== 'fight') return;
    if (!inA.length) { e.tA = Math.max(e.tA!, S.tick + T(600)); e.tB = Math.max(e.tB!, S.tick + T(1500)); e.tC = Math.max(e.tC!, S.tick + T(2500)); return; }
    // 1) QO'L BILAN URISH: o'yinchi turgan pog'onaga (ko'l tubida - uning atrofiga)
    if (S.tick >= e.tA!) {
        const cand = inA.map(q => ({ q, s: BM.surfaceBelow(S, q.x, feetOf(q) - 8, 260) })).filter(o => o.s && o.s.y >= surf - 400 && o.s.y <= surf + 60).sort(() => Math.random() - 0.5);
        if (cand.length) {
            const used = new Set<BM.BigPlat>();
            cand.slice(0, 1 + rage).forEach(({ q, s }) => {
                if (used.has(s!)) return; used.add(s!);
                const wide = s!.w > 300, x0 = wide ? q.x - 90 : s!.x - 10, x1 = wide ? q.x + 90 : s!.x + s!.w + 10;
                spAr(c, { k: 'slam:tentacle', x: x0, y: s!.y - 150, w: x1 - x0, h: 150, warn: T(K.slamRaiseMs), t: T(K.slamHitMs), dmg: K.slamDmg, kb: [300, -200], dk: 'hit', f: (x0 + x1) / 2 < e.x ? -1 : 1 });
            });
            e.tA = S.tick + T(K.slamRaiseMs + K.slamHitMs + K.slamMs * k);
            spSay(c, 'tentacle');
        } else e.tA = S.tick + T(500);
    }
    // 2) GEYZERLAR: biri o'yinchi ostidan, ikkinchisi - nariroqda (g'azabda - uchinchisi ham)
    if (S.tick >= e.tB!) {
        const q = pickOne(inA), lo = L.x + 60, hi = L.x + L.w - 60;
        const x1 = Math.max(lo, Math.min(hi, q.x));
        let x2 = lo + Math.random() * (hi - lo); if (Math.abs(x2 - x1) < 120) x2 = x1 + (x1 < (lo + hi) / 2 ? 260 : -260);
        const xs = [x1, x2];
        if (rage) { const q2 = pickOne(inA); let x3 = Math.max(lo, Math.min(hi, q2.x + (Math.random() < 0.5 ? -200 : 200))); if (xs.some(x => Math.abs(x - x3) < 100)) x3 = Math.max(lo, Math.min(hi, x3 + 240)); xs.push(x3); }
        const top = (z ? z.y0 : surf - 600) - 200;
        xs.forEach(x => spAr(c, { k: 'pillar:geyser', x: x - 30, y: top, w: 60, h: surf + 60 - top, warn: T(K.geyserWarnMs), t: T(K.geyserUpMs), dmg: K.geyserDmg, kb: [0, -520], dk: 'ground' }));
        e.tB = S.tick + T(K.geyserMs * k);
        spSay(c, 'geyser');
    }
    // 3) SUVNI URADI: tikanli baliqlar o'yinchilarga yoy bo'ylab uchadi
    if (S.tick >= e.tC!) {
        const sx = Math.max(L.x + 40, Math.min(L.x + L.w - 40, e.x + (Math.random() < 0.5 ? -1 : 1) * (120 + Math.random() * 100)));
        spSay(c, 'splash', { sx: Math.round(sx), sy: Math.round(surf) });
        for (let i = 0; i < K.fishN + rage; i++) {
            const q = inA[i % inA.length], tt = 1.1 + Math.random() * 0.3, x0 = sx + (i - 1) * 20;
            S.shots.push({ id: ++S.seq, x: x0, y: surf, ...lob(x0, surf, q.x + (Math.random() - 0.5) * 80, q.y, tt), arc: true, k: 'sqfish', t: 0, dmg: K.fishDmg, blast: K.fishR, water: 1, owner: e.id, life: T(4000) });
        }
        e.tC = S.tick + T(K.fishMs * k);
    }
}

// GORILA ROCK (S1 map-8): hujumni o'yinchilar QAYERDA turganiga qarab tanlaydi (ko'pchilik qayerda - o'sha):
//  yaqinda (yerda) - baqirib, qattiq itarib yuboradi; uzoqda (yerda) - har birining oyog'i ostidan tosh otilib chiqadi;
//  tepada (tokcha / pog'ona) - shiftdan toshlar yog'iladi. Oldidan o'tsa / tegsa - otib yuboradi. Ba'zan charchab nafas oladi (tegmaydi)
export const GORILLA = { nearRange: 200, walk: 70, idleMs: 1150, roarMs: 700, restMs: 1300, restChance: 0.35, pushDmg: 25, pushSpeed: 950, contactDmg: 15, contactSpeed: 1150,
    animMs: 420, spikeDmg: 35, spikeWarnMs: 850, rockDmg: 25, crushShakeMs: 1400, launchV: 700, backV: 220 };
function onPlat(S: BM.BigState, i: number, q: PlayerState): boolean { const p = S.w.plats[i]; return !q.isDead && q.x > p.x - 6 && q.x < p.x + p.w + 6 && Math.abs(feetOf(q) - p.y) < 12; }
// SHIFTGA URILADIGAN PLATFORMA (S1 map-8): titraydi -> ustidagilar bilan tepaga otiladi -> shiftga urilib ezadi (100%) -> asta joyiga qaytadi
function crushTick(c: SP, z: BM.BigZone): void {
    const { S } = c, G = GORILLA, cr = S.gcrush[z.id]; if (!cr) return;
    const p = S.w.plats[cr.i], ceil = z.y0 - 10 + 14;   // platforma tepasi shiftga tegadi
    if (cr.st === 'shake') { if (--cr.t <= 0) { cr.st = 'launch'; cr.riders = c.alive.filter(q => onPlat(S, cr.i, q)).map(q => q.id); c.ctx.emit('bigCrush', { i: cr.i, st: 'launch', v: G.launchV, ceil }); } }
    else if (cr.st === 'launch') {
        cr.y = Math.max(ceil, cr.y - G.launchV * c.dt);
        if (cr.y <= ceil) { cr.st = 'hold'; cr.t = T(500); cr.riders.forEach(id => { const q = c.alive.find(o => o.id === id); if (q) c.ctx.kill(q); }); c.ctx.emit('bigBossMove', { id: c.e.id, m: 'quake', x: Math.round(p.x + p.w / 2), y: Math.round(ceil), big: 1 }); }
    } else if (cr.st === 'hold') { if (--cr.t <= 0) { cr.st = 'back'; c.ctx.emit('bigCrush', { i: cr.i, st: 'back', v: G.backV, ceil }); } }
    else if (cr.st === 'back') { cr.y = Math.min(p.y, cr.y + G.backV * c.dt); if (cr.y >= p.y) { delete S.gcrush[z.id]; c.ctx.emit('bigCrush', { i: cr.i, st: 'idle' }); } }
}
function gorillaAI(c: SP): void {
    const { S, e, d } = c, G = GORILLA, z = zoneOf(S, e);
    if (z) crushTick(c, z);
    if (e.fy === undefined && e.ground) e.fy = e.y;
    const fl = e.fy ?? e.y, rage = spRage(c);
    if (!e.bst) { e.bst = 'idle'; e.ph = T(1000); e.move = ''; }
    const inA = c.alive.filter(q => inZ(z, q));
    const where = (q: PlayerState) => feetOf(q) < fl - 30 ? 'plat' : Math.abs(q.x - e.x) < G.nearRange ? 'near' : 'far';
    // TEGSA: qattiq otib yuboradi (nafas olayotganda - yo'q)
    if (e.bst !== 'rest') inA.forEach((q) => {
        const cc = e.cc || (e.cc = {});
        if ((cc[q.id] || 0) > S.tick) return;
        if (Math.abs(q.x - e.x) < d.w / 2 + 6 && feetOf(q) > e.y - d.h + 10 && q.y - 24 < e.y) {
            BM.hurtBig(q, G.contactDmg, c.ctx);
            safeKnock(S, z, q, Math.sign((q.x - e.x) || 1) * G.contactSpeed, -380, c.ctx);
            cc[q.id] = S.tick + T(1000);
        }
    });
    let vx = 0;
    if (!inA.length) { e.bst = 'idle'; e.ph = T(800); e.move = ''; BM.moveEnemy(S, e, d, 0, null, c.dt); return; }
    e.f = inA.reduce((a, q) => a + q.x, 0) / inA.length < e.x ? -1 : 1;   // ko'pchilik tomonga qaraydi
    if (e.bst === 'idle') {
        const ground = inA.filter(q => where(q) !== 'plat');
        const goal = ground.length ? ground.reduce((a, q) => a + q.x, 0) / ground.length : e.x;
        if (Math.abs(goal - e.x) > G.nearRange * 0.6) vx = Math.sign(goal - e.x) * G.walk * (rage ? 1.35 : 1);
        if (--e.ph! <= 0) {
            const n: { [k: string]: number } = { near: 0, far: 0, plat: 0 };
            inA.forEach(q => { n[where(q)]++; });
            const best = Math.max(n.near, n.far, n.plat), zn = pickOne(['near', 'far', 'plat'].filter(k => n[k] === best));
            e.ak = zn === 'near' ? 'push' : zn === 'far' ? 'spike' : 'rocks';
            // PLATFORMADAGILAR: grotoda - ko'p odam turgan platforma titraydi va shiftga uriladi (ustidagilar eziladi), aks holda - shiftdan toshlar
            if (e.ak === 'rocks' && z && z.gp && !S.gcrush[z.id] && Math.random() < 0.5) {
                const cnt = z.gp.map(i => inA.filter(q => onPlat(S, i, q)).length), best = Math.max(0, ...cnt);
                if (best > 0) { const i = z.gp[cnt.indexOf(best)]; e.ak = 'crush'; S.gcrush[z.id] = { i, st: 'shake', t: T(G.crushShakeMs), y: S.w.plats[i].y, riders: [] }; c.ctx.emit('bigCrush', { i, st: 'shake', ms: G.crushShakeMs }); }
            }
            e.bst = 'roar'; e.ph = T(G.roarMs * (rage ? 0.8 : 1)); e.move = 'roar';
            spSay(c, e.ak === 'push' ? 'roar' : e.ak === 'spike' ? 'gspike' : e.ak === 'crush' ? 'gcrush' : 'rain:rock');
        }
    } else if (e.bst === 'roar') {
        if (--e.ph! <= 0) {
            if (e.ak === 'push') {
                // S1 dagidek QATTIQ ITARISH: yerdagi yaqin o'yinchilar (ikki tomondagi ham) gorilladan nariga uchib ketadi; tepadagilarga tegmaydi
                inA.forEach(q => { if (where(q) === 'plat' || Math.abs(q.x - e.x) > G.nearRange + 40) return; BM.hurtBig(q, G.pushDmg, c.ctx); safeKnock(S, z, q, Math.sign((q.x - e.x) || 1) * G.pushSpeed, -280, c.ctx); });
            } else if (e.ak === 'spike') {
                // hujum tanlangandan keyin O'YINCHI QAYERGA O'TMASIN bajariladi (aks holda gorilla "ikkilanib" hech narsa qilmasdi):
                // har bir o'yinchi oyog'i ostidan (yer yoki pog'ona) tosh otilib chiqadi (g'azabda - yonidan ham)
                inA.forEach(q => (rage ? [0, 110] : [0]).forEach(dx => {
                    const x = q.x + dx * (q.x < e.x ? -1 : 1), s = BM.surfaceBelow(S, x, feetOf(q) - 8, 400); if (!s) return;
                    spAr(c, { k: 'pillar:gspike', x: x - 28, y: s.y - 110, w: 56, h: 110, warn: T(G.spikeWarnMs), t: T(400), dmg: G.spikeDmg, kb: [0, -560], dk: 'ground' });
                }));
            } else if (e.ak === 'crush') {
                // platforma allaqachon titrayapti - o'zi shiftga uriladi
            } else {
                // shiftdan toshlar: tepadagilar ustiga va maydonning tasodifiy joylariga
                const xs = inA.map(q => ({ x: q.x + (Math.random() - 0.5) * 60, f: feetOf(q) }));   // har bir o'yinchi ustiga (qayerga o'tgan bo'lsa ham)
                for (let i = 0; i < 3 + rage * 2; i++) xs.push({ x: (z ? z.x0 + 40 + Math.random() * (z.x1 - z.x0 - 80) : e.x + (Math.random() - 0.5) * 600), f: fl });
                // S1 dagidek: xarsang SHIFTDAN tushadi (avval shiftdan chang to'kiladi), pog'onalardan o'tib ketadi - yo'lidagi o'yinchiga uriladi, polda sinadi
                const top = z ? z.y0 + 6 : e.y - 500;
                xs.forEach((o) => S.shots.push({ id: ++S.seq, owner: e.id, x: z ? Math.max(z.x0 + 20, Math.min(z.x1 - 20, o.x)) : o.x, y: top, vx: 0, vy: 0, arc: true, nl: true, k: 'gboulder', t: 0,
                    dmg: G.rockDmg, sc: 2, wait: T(600 + Math.random() * 600), life: T(6000) }));
            }
            e.bst = 'anim'; e.ph = T(G.animMs + (e.ak === 'push' ? 0 : 100)); e.move = e.ak === 'push' ? 'push' : 'slam';
            if (e.ak !== 'push') c.ctx.emit('bigBossMove', { id: e.id, m: 'quake', x: Math.round(e.x), y: Math.round(e.y), big: 0 });
        }
    } else if (e.bst === 'anim') {
        if (--e.ph! <= 0) {
            if (Math.random() < G.restChance) { e.bst = 'rest'; e.ph = T(G.restMs); e.move = 'rest'; e.vuln = S.tick + T(G.restMs); spSay(c, 'tired'); }
            else { e.bst = 'idle'; e.ph = T(G.idleMs * (rage ? 0.75 : 1)); e.move = ''; }
        }
    } else if (e.bst === 'rest' && --e.ph! <= 0) { e.bst = 'idle'; e.ph = T(G.idleMs); e.move = ''; }
    BM.moveEnemy(S, e, d, vx, null, c.dt);
    if (z) e.x = Math.max(z.x0 + d.w / 2, Math.min(z.x1 - d.w / 2, e.x));
}
// BAHAYBAT DARAXT (O'rmon 1-boss): qimirlamaydi, ko'zi yo'q - katta og'zi bor. Hujumlari (navbat bilan, alohida taymerlar):
//  1) ILDIZLAR: har bir o'yinchi oyog'i ostidan (qayerda turmasin - yer yoki pog'ona) - oldin yer yoriladi (ogohlantirish)
//  2) TIKANLI OLMALAR: og'zidan yoy bilan o'yinchilarga - tushgan joyida tikanlarga sochiladi
//  3) BUTUN YER ILDIZ: uzoq ogohlantirish, keyin maydon polining hammasidan ildizlar - qutilish yo'li pog'onaga chiqib olish
export const BIGTREE = { rootEvery: 3400, rootWarn: 800, rootDmg: 24, appleEvery: 2900, appleDmg: 16, quakeEvery: 12500, quakeWarn: 1700, quakeDmg: 32, quakeH: 72 };
function treeAI(c: SP): void {
    const { S, e, d } = c, K = BIGTREE, z = zoneOf(S, e), rage = spRage(c);
    if (e.tA === undefined) { e.tA = S.tick + T(1600); e.tB = S.tick + T(2800); e.tC = S.tick + T(9000); }
    BM.moveEnemy(S, e, d, 0, null, c.dt);   // joyidan qimirlamaydi (faqat yerga tushadi)
    if (e.bst && --e.ph! <= 0) e.bst = undefined;
    const inA = c.alive.filter(q => inZ(z, q));
    if (!inA.length) return;
    e.f = inA.reduce((a, q) => a + q.x, 0) / inA.length < e.x ? -1 : 1;
    const k = rage ? 0.75 : 1;
    if (S.tick >= e.tA!) {
        inA.forEach((q) => { const s = BM.surfaceBelow(S, q.x, feetOf(q) - 8, 400); if (s) spAr(c, { k: 'pillar:root', x: q.x - 30, y: s.y - 96, w: 60, h: 96, warn: T(K.rootWarn), t: T(300), dmg: K.rootDmg, fx: 'root', kb: [0, -520], dk: 'ground' }); });
        e.tA = S.tick + T(K.rootEvery * k); e.bst = 'roots'; e.ph = T(600); spSay(c, 'troots');
    }
    if (S.tick >= e.tB!) {
        const mx = e.x + e.f * 15, my = e.y - 108;   // rasmdagi og'iz (oyoqdan 108 px balandda)
        inA.slice(0, 3).forEach((q, i) => {
            const v = lob(mx, my, q.x + (Math.random() - 0.5) * 70, feetOf(q) - 10, 0.95 + i * 0.15);
            S.shots.push({ id: ++S.seq, x: mx, y: my, ...v, arc: true, k: 'tapple', sc: 1.3, dmg: K.appleDmg, t: 0, owner: e.id, split: 4 + rage, splitK: 'thorn', life: T(4500) });
        });
        e.tB = S.tick + T(K.appleEvery * k); e.bst = 'spit'; e.ph = T(500); spSay(c, 'tapple');
    }
    if (S.tick >= e.tC! && z) {
        const fl = BM.surfaceBelow(S, e.x, e.y - 8, 40);
        if (fl) for (let x = Math.max(fl.x, z.x0 - 40); x < Math.min(fl.x + fl.w, z.x1 + 40) - 20; x += 76)
            spAr(c, { k: 'pillar:root', x, y: fl.y - K.quakeH, w: 76, h: K.quakeH, warn: T(K.quakeWarn), t: T(1000), dmg: K.quakeDmg, every: T(450), fx: 'root', kb: [0, -420], dk: 'ground' });
        e.tC = S.tick + T(K.quakeEvery * k); e.bst = 'quake'; e.ph = T(K.quakeWarn + 1000); spSay(c, 'tquake');
        e.tA = Math.max(e.tA!, S.tick + T(K.quakeWarn + 1500));   // butun yer ildizlanayotganda alohida ildiz yo'q
    }
}
// ZOMBI-SABZAVOT FERMASI (O'rmon maxfiy bossi): sabzi oldida E - ko'rinmas boshqaruvchi zombilarni yerdan birin-ketin chiqaradi:
// bir vaqtda 3 ta, biri o'lsa - yangisi, jami 15 ta. Chegara yo'q - zombilar o'yinchi qayerga qochmasin quvadi (uzoqlashsa - yer ostidan
// yonida chiqadi). 15 tasi o'ldirilsa - boshqaruvchi "o'ladi" (maxfiy boss mukofoti). Joni (chiziq) = qolgan zombilar
export const ZVFARM = { total: 15, alive: 3, gapMs: 700, farX: 700, farY: 300, digCdMs: 2600 };   // zombilar joni - O'rmon dushmanlaridek (LOC_POWER)
function farmAI(c: SP): void {
    const { S, e } = c, K = ZVFARM, z = zoneOf(S, e);
    if (!z) return;
    e.hide = 'blink'; e.vx = 0; e.vy = 0; e.x = z.dx!; e.y = z.dy!; e.ground = true;
    if (e.fk === undefined) { e.fk = 0; e.fs = 0; e.tA = S.tick + T(500); e.mx = K.total; spSay(c, 'zvrise'); }
    e.hp = K.total - e.fk!;
    if (e.fk! >= K.total) { e.hp = 0; return; }
    const mine = S.enemies.filter(o => o.fz === e.zone);
    if (mine.length < K.alive && e.fs! < K.total && S.tick >= e.tA! && c.alive.length) {
        // fermada - sabzi atrofida; o'yinchi uzoqqa qochgan bo'lsa - uning yonida yerdan chiqadi
        const side = e.fs! % 2 ? 1 : -1, q0 = BM.nearest(c.alive, { x: z.dx!, y: z.dy! }), away = q0 && Math.abs(q0.x - z.dx!) > 900;
        const x = away ? q0!.x + side * (150 + Math.random() * 120) : z.dx! + side * (80 + Math.random() * 220);
        const s = away ? (BM.surfaceBelow(S, x, feetOf(q0!) - 10, 300) || BM.surfaceBelow(S, q0!.x, feetOf(q0!) - 10, 300)) : BM.surfaceBelow(S, x, z.dy! - 20, 120);
        if (s) {
            const m = BM.spawnEnemy(S, 'zveg', Math.max(s.x + 20, Math.min(s.x + s.w - 20, x)), s.y, e.zone);
            m.fz = e.zone; m.st = 'chase'; m.bst = 'emerge'; m.move = 'emerge'; m.ph = T(1300); m.tgt = BM.nearest(c.alive, m)?.id || null; m.dig = S.tick + T(K.digCdMs);
            e.fs!++; e.tA = S.tick + T(K.gapMs);
        }
    }
    // hamma joyga quvadi: o'yinchi uzoqqa qochsa - yer ostidan uning yonida chiqadi
    mine.forEach((m) => {
        const q = c.alive.find(p => p.id === m.tgt) || BM.nearest(c.alive, m);
        if (!q) return;
        m.tgt = q.id; m.st = 'chase'; m.lost = 0;
        if (m.bst === 'emerge' || (m.dig || 0) > S.tick) return;
        if (Math.abs(q.x - m.x) > K.farX || Math.abs(feetOf(q) - m.y) > K.farY) {
            const tx = q.x + (q.x < m.x ? 1 : -1) * 170, s = BM.surfaceBelow(S, tx, feetOf(q) - 10, 300) || BM.surfaceBelow(S, q.x, feetOf(q) - 10, 300);
            if (!s) return;
            m.x = Math.max(s.x + 20, Math.min(s.x + s.w - 20, tx)); m.y = s.y; m.vx = 0; m.vy = 0; m.ground = true;
            m.bst = 'emerge'; m.move = 'emerge'; m.ph = T(1300); m.dig = S.tick + T(K.digCdMs);
            c.ctx.emit('bigBossMove', { id: m.id, k: m.k, m: 'dig', x: Math.round(m.x), y: Math.round(m.y) });
        }
    });
}
export const SETPIECE: { [k: string]: (c: SP) => void } = { kraken: krakenAI, gorilla: gorillaAI, bigtree: treeAI, zvfarm: farmAI };

// ===== SEASON MAXLUQLARI (asl xulqi bilan) =====
type CR = { S: BM.BigState; e: BM.BigEnemy; d: BM.EnemyDef; p: PlayerState; alive: PlayerState[]; ctx: BM.BigCtx; dt: number; bullets: { x: number, y: number, vx: number }[] };
// ODAMXO'R GUL (S1 "UnderWorld"): yaqin kelsa yerdan chiqadi; og'zini ochib (0.45 s), yopadigan payt yaqindagilarni tishlab nari otadi
function flowerAI(c: CR): void {
    const { S, e, d, alive } = c;
    if (e.atk > 0) {
        if (--e.atk === T(220)) alive.forEach(q => { if (Math.abs(q.x - e.x) < 110 && feetOf(q) > e.y - d.h - 40 && feetOf(q) < e.y + 30) { BM.hurtBig(q, d.dmg, c.ctx); c.ctx.knock(q, Math.sign((q.x - e.x) || 1) * 520, -260); } });
    } else if (e.cd <= 0 && Math.abs(c.p.x - e.x) < 95 && feetOf(c.p) > e.y - d.h - 40 && feetOf(c.p) < e.y + 30) { e.atk = T(450); e.cd = T(1350); c.ctx.emit('bigWind', { id: e.id }); }
    e.f = c.p.x < e.x ? -1 : 1;
    BM.moveEnemy(S, e, d, 0, null, c.dt);
}
// ZOMBI SABZAVOT (S2 "Farm"): yerdan sug'urilib chiqadi (1.3 s); yetadigan masofadagi o'yinchiga (tepada bo'lsa ham) TIL otadi -
// avval mo'ljal (0.65 s, qizil chiziq), keyin sanchiladi; yaqindagini qo'li bilan uradi
function zvegAI(c: CR): void {
    const { S, e, d, p } = c, dx = p.x - e.x;
    if (e.bst === 'emerge') { if (--e.ph! <= 0) { e.bst = undefined; e.move = ''; } BM.moveEnemy(S, e, d, 0, null, c.dt); return; }
    e.f = dx < 0 ? -1 : 1;
    let vx = 0;
    if ((e.ph || 0) > 0) e.ph!--;   // til otayotganda - joyida
    else {
        if (Math.abs(dx) > d.reach * 0.7) vx = e.f * d.spd;
        const mx = e.x + e.f * 8, my = e.y - 50, dist = Math.hypot(p.x - mx, p.y - my);
        if ((e.tA || 0) <= S.tick && dist <= 260 && (Math.abs(dx) > 60 || feetOf(p) < e.y - 40)) {
            const k = Math.min(1, 240 / (dist || 1));
            area(S, { k: 'tongue', x: mx, y: my, x2: mx + (p.x - mx) * k, y2: my + (p.y - my) * k, w: 16, h: 0, warn: T(650), t: T(260), dmg: 12, kb: [160, -260], dk: 'hit', owner: e.id, zone: e.zone, grow: 1 });
            e.ph = T(910); e.tA = S.tick + T(2600 + 910); vx = 0;
        }
        if (e.atk === 0 && e.cd <= 0 && Math.abs(dx) < d.reach + 12 && Math.abs(feetOf(p) - e.y) < 46) { e.atk = T(350); e.cd = T(d.atkMs); c.ctx.emit('bigWind', { id: e.id }); }
    }
    if (e.atk > 0 && --e.atk === 0 && Math.abs(p.x - e.x) < d.reach + 18 && Math.abs(feetOf(p) - e.y) < 50) BM.hurtBig(p, d.dmg, c.ctx);
    BM.moveEnemy(S, e, d, vx, p, c.dt);
}
// TIRNOQLI KALTAKESAK (O'rmon): to'rt oyoqda emaklaydi; yetadigan masofada TILINI otib o'yinchini o'ziga tortadi, keyin TIK TURIB tirnoqlari bilan
// tirnaydi. Ba'zan rangini o'zgartirib KO'RINMAS bo'ladi - yashirincha yaqinlashib, tik turib tirnaydi (tegsa - ko'rinib qoladi)
export const LIZARD = { tongueMin: 110, tongueMax: 290, tongueEvery: 3600, tongueWarn: 450, tongueDmg: 6, standMs: 1300, clawWind: 260, clawEvery: 480, invisEvery: 7500, invisMs: 3400 };
function lizardAI(c: CR): void {
    const { S, e, d, p } = c, K = LIZARD, dx = p.x - e.x, dist = Math.abs(dx), dy = feetOf(p) - e.y;
    if (e.tA === undefined) { e.tA = S.tick + T(1200 + Math.random() * 1500); e.tB = S.tick + T(2500 + Math.random() * 4000); }
    if (e.iv && e.iv <= S.tick) e.iv = 0;
    let vx = 0;
    if (e.bst === 'tongue') {
        if (--e.ph! <= 0) { e.bst = 'stand'; e.ph = T(K.standMs); e.cd = 0; }
    } else if (e.bst === 'stand') {
        e.f = dx < 0 ? -1 : 1;
        if (e.atk === 0 && e.cd <= 0 && dist < d.reach + 16 && Math.abs(dy) < 50) { e.atk = T(K.clawWind); e.cd = T(K.clawEvery); c.ctx.emit('bigWind', { id: e.id }); }
        if (--e.ph! <= 0 && e.atk === 0) e.bst = undefined;
        if (dist > d.reach) vx = e.f * d.spd * 0.45;
    } else {
        e.f = dx < 0 ? -1 : 1;
        // KO'RINMAS bo'ladi (uzoqroqda) - yashirincha emaklab keladi
        if (!e.iv && S.tick >= e.tB! && dist > 140) { e.iv = S.tick + T(K.invisMs); e.tB = S.tick + T(K.invisEvery + Math.random() * 3000); c.ctx.emit('bigBossMove', { id: e.id, k: e.k, m: 'lzhide', x: Math.round(e.x), y: Math.round(e.y) }); }
        if (dist > d.reach * 0.7) vx = e.f * d.spd * (e.iv ? 1.1 : 1);
        if (dist < d.reach + 10 && Math.abs(dy) < 50) { e.iv = 0; e.bst = 'stand'; e.ph = T(K.standMs); e.cd = 0; vx = 0; }   // yetib keldi - tik turadi
        else if (!e.iv && S.tick >= e.tA! && dist >= K.tongueMin && dist <= K.tongueMax && Math.abs(dy) < 70) {
            // TIL: og'izdan o'yinchiga - tegsa o'ziga tortadi
            const mx = e.x + e.f * (d.w / 2 - 2), my = e.y - 30, len = Math.hypot(p.x - mx, p.y - my), kk = Math.min(1, (K.tongueMax + 10) / (len || 1));
            area(S, { k: 'tongue', x: mx, y: my, x2: mx + (p.x - mx) * kk, y2: my + (p.y - my) * kk, w: 14, h: 0, warn: T(K.tongueWarn), t: T(250), dmg: K.tongueDmg, fx: 'pull', dk: 'hit', owner: e.id, zone: e.zone, grow: 1 });
            e.bst = 'tongue'; e.ph = T(K.tongueWarn + 380); e.tA = S.tick + T(K.tongueEvery + Math.random() * 1200); vx = 0;
        }
    }
    // tirnoq zarbasi: faqat oldidagiga
    if (e.atk > 0 && --e.atk === 0 && (p.x - e.x) * e.f > -10 && dist < d.reach + 22 && Math.abs(dy) < 54) BM.hurtBig(p, d.dmg, c.ctx);
    BM.moveEnemy(S, e, d, vx, p, c.dt);
}
export const CREATURE: { [k: string]: (c: CR) => void } = { flower: flowerAI, zveg: zvegAI, lizard: lizardAI };

// ROBOT ILON (S1 "Just run 2 or end" bossi, endi g'orda): devordagi inidan faqat BOSHINI chiqaradi va joyida turadi (quvmaydi);
// og'zi cho'g'lanib (ogohlantirish) oldiga OLOV purkaydi - yerda turganlar kuyadi, TAXTA YO'LDA turganlar omon;
// o'yinchi turgan joyga (yer / taxta) MINA otadi - bosilsa portlaydi; boshiga tegsa uradi, boshi ortida qolganni oldinga itaradi.
// Vaqti-vaqti bilan boshini iniga tortib biroz to'xtaydi (zaif), keyin yana chiqadi. O'q faqat BOSHIGA tegadi
export const RSNAKE = { outMs: 9000, back: 260, fireEvery: 8000, fireWarn: 1500, fireMs: 1500, fireLen: 1100, fireH: 175, fireDmg: 10, mineEvery: 5200, mineDmg: 28, mineR: 58,
    contactDmg: 18, pauseMs: 1500, emergeMs: 1500 };
function rsnakeAI(c: SP): void {
    const { S, e, d } = c, K = RSNAKE, z = zoneOf(S, e);
    if (!z || z.dx === undefined) return;
    const dir = z.dx > (z.x0 + z.x1) / 2 ? -1 : 1, fy = z.dy!, half = d.w / 2;
    const homeX = z.dx + dir * (half - 40);   // inida: boshi teshik ichida
    const outX = homeX + dir * 260;           // boshi tashqarida turadigan joy
    if (e.bst === undefined) { e.bst = 'emerge'; e.x = homeX; e.y = fy; e.hx = z.dx; e.f = dir; e.hide = 'under'; spSay(c, 'rsrise'); }
    const rage = spRage(c), inA = c.alive.filter(q => inZ(z, q));
    e.y = fy; e.vx = 0; e.vy = 0; e.ground = true; e.f = dir;
    const front = () => e.x + dir * half;
    if (e.bst === 'emerge') {
        e.x += dir * 260 / Math.max(1, T(K.emergeMs));
        const out = (e.x - outX) * dir >= 0; if (out) e.x = outX;
        // inidan otilib chiqayotganda yo'lidagi (in yonida turgan) o'yinchilarni oldinga uloqtiradi - yutmaydi
        inA.forEach((q) => {
            if (feetOf(q) < fy - 70 || (q.x - front()) * dir > 30 || (q.x - z.dx!) * dir <= 0) return;
            const cc = e.cc || (e.cc = {}); if ((cc[q.id] || 0) > S.tick) return; cc[q.id] = S.tick + T(1200);
            BM.hurtBig(q, 10, c.ctx); c.ctx.knock(q, dir * 760, -560);
        });
        if (out) { e.bst = 'adv'; e.ph = T(K.outMs * (rage ? 1.3 : 1)); if (e.hide) { e.hide = undefined; e.tA = S.tick + T(2500); e.tB = S.tick + T(2200); } }
        return;
    }
    // 'adv' - boshi tashqarida, joyida biroz chayqaladi; vaqti kelsa boshini iniga tortadi va to'xtaydi, keyin yana chiqadi
    if (e.bst === 'adv') {
        e.x = outX + dir * Math.sin(S.tick / Math.max(1, T(700))) * 22;
        if (--e.ph! <= 0) { e.bst = 'back'; spSay(c, 'rsback'); }
    } else if (e.bst === 'back') {
        e.x -= dir * K.back * c.dt;
        if ((dir < 0 && e.x >= homeX + dir * 220) || (dir > 0 && e.x <= homeX + dir * 220)) { e.bst = 'pause'; e.ph = T(K.pauseMs); e.vuln = S.tick + T(K.pauseMs); spSay(c, 'tired'); }
    } else if (e.bst === 'pause' && --e.ph! <= 0) e.bst = 'emerge';
    if (!inA.length) return;
    // OLOV: og'iz cho'g'lanadi -> oldinga, yer bo'ylab (bosh bilan birga yuradi)
    if (S.tick >= e.tA! && e.bst === 'adv') {
        const wall = dir < 0 ? z.x0 - 40 : z.x1 + 40, L = Math.min(K.fireLen, Math.abs(wall - front()));   // devorgacha - yerda yashirinadigan joy yo'q
        area(S, { zone: e.zone, owner: e.id, k: 'flame:snake', x: dir > 0 ? front() : front() - L, y: fy - K.fireH, w: L, h: K.fireH, warn: T(K.fireWarn), t: T(K.fireMs), dmg: K.fireDmg, every: T(250), fx: 'burn', dk: 'ground',
            att: e.id, ox: half - 10, oy: K.fireH / 2, f: dir });
        e.tA = S.tick + T(K.fireEvery * (rage ? 0.85 : 1));
        spSay(c, 'rsfire');
    }
    // MINALAR: o'yinchi turgan sirtga (yugurayotgan bo'lsa - oldiroqqa); yerda yotadi, bosilsa portlaydi
    if (S.tick >= e.tB!) {
        const n = Math.min(rage ? 2 : 1, inA.length + 1), mouthX = front() - dir * 40, mouthY = fy - 120;
        const mines = S.shots.filter(s => s.k === 'mine' && s.owner === e.id).length;
        for (let i = 0; i < n && mines + i < 4; i++) {
            const q = inA[(S.tick + i) % inA.length], v = S.pv[q.id], tt = 1.3 + Math.random() * 0.3;
            const tx = Math.max(z.x0 + 40, Math.min(z.x1 - 40, q.x + (v ? Math.max(-200, Math.min(200, v.vx * tt)) : 0) + (i ? (Math.random() - 0.5) * 160 : 0)));
            const g = BM.surfaceBelow(S, tx, feetOf(q) - 8, 300), ty = g ? g.y - 8 : fy - 8;
            S.shots.push({ id: ++S.seq, x: mouthX, y: mouthY, ...lob(mouthX, mouthY, tx, ty, tt), arc: true, k: 'mine', t: 0, dmg: K.mineDmg, blast: K.mineR, fuse: T(12000), owner: e.id, life: T(15000) });
        }
        e.tB = S.tick + T(K.mineEvery * (rage ? 0.85 : 1));
    }
    // TEGISH: yerdagi o'yinchi - boshi oldida: uriladi va oldinga uloqtiriladi; boshi ortida (tanasi yonida) - boshi ustidan oldinga itariladi
    inA.forEach((q) => {
        const feet = feetOf(q);
        if (feet < fy - 70 || e.bst === 'emerge') return;   // taxtada / havoda - tegmaydi
        const rel = (q.x - front()) * dir;                    // > 0 - bosh oldida
        if (rel > 20 || (q.x - z.dx!) * dir > 0 === false) return;
        const cc = e.cc || (e.cc = {});
        if ((cc[q.id] || 0) > S.tick) return;
        cc[q.id] = S.tick + T(900);
        BM.hurtBig(q, K.contactDmg, c.ctx);
        if (rel < -60) c.ctx.knock(q, dir * 760, -560);   // boshi ustidan oshirib tashlaydi
        else safeKnock(S, z, q, dir * 620, -380, c.ctx);
    });
}
// SEMIZ ELF (S1 "Right on time"): o'tloqda elfni yeyapti; kimdir yaqin kelsa (yoki E bossa) - suhbat (hamma o'qib bo'lguncha, ko'pi bilan 25 s),
// keyin jang: yaqinga yashil olov, uzoqqa - tepaga 3 ta so'lak (tekkan o'yinchining joni o'zi tiklanmaydi - la'nat)
function fatelfPre(S: BM.BigState, e: BM.BigEnemy, alive: PlayerState[], ctx: BM.BigCtx): boolean {
    if (e.bst !== 'eat' && e.bst !== 'talk') return false;
    const z = zoneOf(S, e), near = alive.filter(q => inZ(z, q));
    if (e.bst === 'eat') {
        // yaqin kelsa (yoki urilsa) - suhbatsiz, darhol jang: o'ljasini tashlab o'rnidan turadi va yonidagini nari itaradi
        if (near.some(q => Math.abs(q.x - e.x) < 260 && Math.abs(feetOf(q) - e.y) < 120) || S.talkReq[e.zone] || e.hp < e.mx) {
            e.bst = undefined; e.move = 'walk'; e.mt = T(900); delete S.talkReq[e.zone];
            ctx.emit('bigBossMove', { id: e.id, k: e.k, m: 'fwake', x: Math.round(e.x), y: Math.round(e.y) });
            near.forEach(q => { if (Math.abs(q.x - e.x) < 200) safeKnock(S, z, q, Math.sign((q.x - e.x) || 1) * 420, -220, ctx); });
        }
        return true;
    }
    const done = S.talkDone[e.zone] || {};
    if (--e.ph! <= 0 || (near.length > 0 && near.every(q => done[q.id]))) {
        e.bst = undefined; e.move = 'walk'; e.mt = T(1500);
        delete S.talkReq[e.zone];
        ctx.emit('bigTalkEnd', { id: e.id, zone: e.zone });
        near.forEach(q => { if (Math.abs(q.x - e.x) < 200) safeKnock(S, z, q, Math.sign((q.x - e.x) || 1) * 420, -220, ctx); });   // jang boshida yonidagini nari itaradi
    }
    return true;
}
export function bossPre(S: BM.BigState, e: BM.BigEnemy, alive: PlayerState[], ctx: BM.BigCtx): boolean {
    if (e.k === 'fatelf') { if (e.bst === undefined && !e.tk) { e.bst = 'eat'; e.tk = true; } return fatelfPre(S, e, alive, ctx); }
    if (e.k === 'bogcrab') return crabPre(S, e, alive, ctx);   // balchiqda tosh bo'lib yotibdi
    return false;
}
// SAMBOCHI: USHLASH - o'yinchi tomon yugurib, tegsa quchoqlab ko'taradi va "NA PROGIB" (suplex): ko'prik bo'lib orqaga egiladi,
// o'yinchi uning boshi ustidan aylanib, ORQASIDAGI yerga boshi bilan uriladi (aylanish yo'li - klientda, shu vaqt ichida)
export const SUPLEX_MS = 1200;
MOVES.grab = {
    ms: 2200, start: (c) => { c.e.bst = 'dash'; c.e.ph = T(1300); c.e.aimX = undefined; say(c, 'grab'); },
    tick: (c) => {
        const e = c.e;
        if (e.bst === 'dash') {
            if (BM.overlap({ x: e.x - c.d.w / 2 - 14, y: e.y - c.d.h, w: c.d.w + 28, h: c.d.h }, BM.pRect(c.p)) && !c.p.isDead) {
                e.bst = 'hold'; e.ph = T(SUPLEX_MS); e.tgt = c.p.id; e.mt = Math.max(e.mt!, T(SUPLEX_MS + 900));   // harakat suplex o'rtasida tugab qolmasin
                c.ctx.emitTo(c.p.id, 'bigHeld', { id: e.id, ms: SUPLEX_MS });
                say(c, 'hold');
                return 0;
            }
            if (--e.ph! <= 0) { e.bst = undefined; e.mt = Math.min(e.mt!, T(300)); return 0; }
            return e.f * c.d.spd * 2.3;
        }
        if (e.bst === 'hold') {
            if (--e.ph! <= 0) {
                const q = c.S.enemies.includes(e) ? c.alive.find(o => o.id === e.tgt) : null;
                // yerga urildi: qo'yib yuboradi (klientda aylanish tugaydi), kuchli zarba, orqaga biroz sakrab ketadi
                if (q) { c.ctx.emitTo(q.id, 'bigHeld', { id: e.id, ms: 0 }); BM.hurtBig(q, Math.round(c.d.dmg * 1.4), c.ctx, 'ground'); c.ctx.knock(q, -e.f * 260, -320); }
                say(c, 'suplex'); c.ctx.emit('bigBossMove', { id: e.id, m: 'quake', x: Math.round(e.x - e.f * 60), y: Math.round(e.y), big: 1 });
                e.bst = 'throw'; e.ph = T(700);   // ko'prikdan turib olguncha (zaif)
                e.vuln = c.S.tick + T(700);
            }
            return 0;
        }
        if (e.bst === 'throw' && --e.ph! <= 0) { e.bst = undefined; e.mt = 1; }
        return 0;
    }
};
// TOSH OTISH: yerdan katta toshni ko'tarib (ogohlantirish), o'yinchiga yoy bilan otadi - tushgan joyida parchalanadi
MOVES.rockthrow = {
    ms: 1500, air: true, start: (c) => { c.e.bst = 'lift'; c.e.ph = T(650); say(c, 'lift'); },
    tick: (c) => {
        const e = c.e;
        if (e.bst === 'lift' && --e.ph! <= 0) {
            e.bst = 'toss';
            const sx = e.x + e.f * 10, sy = e.y - c.d.h - 20, a = leadAt(c, c.p, sx, sy, 500), tt = Math.max(0.6, Math.min(1.1, Math.abs(a.x - sx) / 520));
            shotP(c, { x: sx, y: sy, ...lob(sx, sy, a.x, feetOf(c.p) - 16, tt), arc: true, k: 'rock', sc: 2.4, blast: 70, dmg: Math.round(c.d.dmg * 0.9) });
        }
        return 0;
    }
};
KITS.sambo = ['grab', 'leap', 'rockthrow', 'grab', 'slam', 'rockthrow'];
SETPIECE.rsnake = rsnakeAI;

// ===== QOR BAZASI =====
// ALTER QOR BOBO (1-boss: ikki o'yinchi bo'yi, yuzi - robot): archa oldida hamma E bosib sovg'asini olgach CHANASIDA uchib keladi va maydonga sakrab tushadi.
// Hujumni o'yinchilar QAYERDA turganiga qarab tanlaydi (ko'pchilik qayerda - o'sha; tanlangach - kim qayerga o'tmasin bajariladi):
//  pastda (yerda) - ULKAN QOR TO'PINI dumalatadi (maydon bo'ylab o'sib boradi, chetdan bir marta qaytadi) - qutilish: pog'onaga chiqib olish;
//  tepada (pog'onada) - XALTASINI ochib SOVG'A QUTILARINI otadi: tushgan joyida pilik yonadi va portlaydi.
// Vaqti-vaqti bilan CHANASI maydon ustidan uchib o'tib, sovg'alar tashlaydi (tushgan joyida portlaydi). Ba'zan charchab nafas oladi (zaif)
// Hujumlar orasida bemalol nafas olinadi (oldingisi ko'rinib, keyingisi oldindan bilinadi); har sovg'a tushadigan joyda oldindan belgi (mark:gift)
export const SANTA = { dropH: 420, idleMs: 2600, windMs: 1000, animMs: 900, restMs: 1800, restChance: 0.3, walk: 55, keep: 260, contactDmg: 14,
    ballR: 24, ballMax: 40, ballGrow: 0.2, ballV: 300, ballDmg: 30, bagN: 3, giftDmg: 22, giftBlast: 62, giftFuse: 1300,
    sleighFirst: 8000, sleighEvery: 15000, sleighMs: 3000, sleighN: 5, sleighY: 380, sleighCalm: 2200 };
// sovg'a tushadigan joy: yerda qizil belgi (zararsiz) - sovg'a yetib kelguncha (ticks) turadi
function giftMark(c: SP, x: number, y: number, ticks: number): void {
    const s = BM.surfaceBelow(c.S, x, y, 900); if (!s) return;
    spAr(c, { k: 'mark:gift', x: x - SANTA.giftBlast, y: s.y - 30, w: SANTA.giftBlast * 2, h: 30, warn: Math.max(1, Math.round(ticks)), t: 2, dmg: 0 });
}   // to'p eng kattasi ham (80 px) pastki pog'onadagiga (90 px) yetmaydi
function santaSleigh(c: SP, z: BM.BigZone, fl: number, inA: PlayerState[], rage: number): void {
    const { S, e } = c, K = SANTA, dir = Math.random() < 0.5 ? 1 : -1;
    const x0 = dir > 0 ? z.x0 - 260 : z.x1 + 260, x1 = dir > 0 ? z.x1 + 260 : z.x0 - 260, y = fl - K.sleighY;
    spSay(c, 'sleigh', { x0: Math.round(x0), x1: Math.round(x1), sy: Math.round(y), ms: K.sleighMs });
    // maydon bo'ylab teng oraliqda va har bir o'yinchi ustiga: chana o'sha joy tepasidan o'tayotganda tushadi
    const xs: number[] = [];
    for (let i = 0, n = K.sleighN + rage * 2; i < n; i++) xs.push(z.x0 + 60 + (z.x1 - z.x0 - 120) * (i + 0.5) / n);
    inA.forEach(q => xs.push(Math.max(z.x0 + 30, Math.min(z.x1 - 30, q.x))));
    xs.forEach((x) => {
        const wait = T(K.sleighMs * (x - x0) / (x1 - x0)), g = BM.surfaceBelow(S, x, y + 30, 900), fall = g ? (-60 + Math.sqrt(3600 + 1200 * Math.max(0, g.y - y - 24))) / 600 : 1;   // yoy: vy0 = 60, g = 600
        S.shots.push({ id: ++S.seq, owner: e.id, x, y: y + 24, vx: dir * 40, vy: 60, arc: true, t: 0, k: 'gift', wait, fuse: T(K.giftFuse), blast: K.giftBlast, dmg: K.giftDmg, sc: 1, life: T(K.sleighMs + 6000) });
        giftMark(c, x + dir * 40 * fall, y + 30, wait + fall / 0.03);
    });
}
function santaAI(c: SP): void {
    const { S, e, d } = c, K = SANTA, z = zoneOf(S, e), rage = spRage(c);
    e.nl = true;   // pog'onalardan o'tib, doim maydon poliga tushadi (pog'onalar - o'yinchiga qochish joyi)
    if (e.bst === undefined) {
        // chanadan sakrab tushadi
        e.fy = e.y; e.y -= K.dropH; e.vy = 0; e.ground = false; e.bst = 'arrive'; e.move = 'arrive'; e.tC = S.tick + T(K.sleighFirst);
        spSay(c, 'sarrive', { x0: Math.round(e.x - 900), x1: Math.round(e.x + 900), sy: Math.round(e.fy - K.dropH - 30), ms: 1700 });
    }
    const fl = e.fy!, inA = c.alive.filter(q => inZ(z, q));
    if (e.bst === 'arrive') {
        BM.moveEnemy(S, e, d, 0, null, c.dt);
        if (e.ground) { e.fy = e.y; e.bst = 'idle'; e.ph = T(900); e.move = ''; c.ctx.emit('bigBossMove', { id: e.id, m: 'quake', x: Math.round(e.x), y: Math.round(e.y), big: 1 }); }
        return;
    }
    // TEGSA - nari itaradi (nafas olayotganda - yo'q)
    if (e.bst !== 'rest') inA.forEach((q) => {
        const cc = e.cc || (e.cc = {});
        if ((cc[q.id] || 0) > S.tick || Math.abs(q.x - e.x) > d.w / 2 + 4 || feetOf(q) < e.y - d.h + 10 || q.y - 24 > e.y) return;
        BM.hurtBig(q, K.contactDmg, c.ctx); safeKnock(S, z, q, Math.sign((q.x - e.x) || 1) * 700, -340, c.ctx); cc[q.id] = S.tick + T(900);
    });
    let vx = 0;
    if (!inA.length) { e.bst = 'idle'; e.ph = T(800); e.move = ''; BM.moveEnemy(S, e, d, 0, null, c.dt); return; }
    e.f = inA.reduce((a, q) => a + q.x, 0) / inA.length < e.x ? -1 : 1;
    const up = (q: PlayerState) => feetOf(q) < fl - 40;
    if (S.tick >= e.tC! && z && e.bst === 'idle') {
        santaSleigh(c, z, fl, inA, rage); e.tC = S.tick + T(K.sleighEvery * (rage ? 0.8 : 1));
        e.ph = Math.max(e.ph || 0, T(K.sleighMs + K.sleighCalm));   // chana o'tib, sovg'alar tushguncha o'zi hujum qilmaydi
    }
    if (e.bst === 'idle') {
        // eng yaqin o'yinchidan bir oz narida yuradi (otish uchun joy)
        const q = BM.nearest(inA, e)!, dx = q.x - e.x;
        if (Math.abs(dx) > K.keep + 80) vx = Math.sign(dx) * K.walk * (rage ? 1.4 : 1); else if (Math.abs(dx) < K.keep - 120) vx = -Math.sign(dx) * K.walk;
        if (--e.ph! <= 0) {
            const nUp = inA.filter(up).length, nDown = inA.length - nUp;
            e.ak = nUp > nDown ? 'bag' : nDown > nUp ? 'roll' : pickOne(['bag', 'roll']);
            e.bst = 'wind'; e.ph = T(K.windMs * (rage ? 0.85 : 1)); e.move = e.ak === 'roll' ? 'swind' : 'bwind';
            spSay(c, e.ak === 'roll' ? 'sroll' : 'sbag');
        }
    } else if (e.bst === 'wind') {
        if (--e.ph! <= 0) {
            if (e.ak === 'roll') {
                // ULKAN QOR TO'PI: ko'pchilik tomonga (g'azabda - ikki tomonga)
                (rage ? [-1, 1] : [e.f]).forEach(s => S.shots.push({ id: ++S.seq, owner: e.id, x: e.x + s * (d.w / 2 + K.ballR), y: fl - K.ballR, vx: s * K.ballV * (rage ? 1.15 : 1), vy: 0, arc: false, t: 0,
                    k: 'snowboulder', roll: K.ballR, rmax: K.ballMax, grow: K.ballGrow, bounce: 1, pierce: true, hitIds: [], dmg: K.ballDmg, kb: 1, life: T(9000) }));
            } else {
                // XALTADAN SOVG'ALAR: tepadagi har bir o'yinchiga (u yer-bu yeriga) - tepada hech kim bo'lmasa hammasiga
                const tg = inA.filter(up), list = tg.length ? tg : inA, mx = e.x + e.f * 24, my = e.y - d.h + 14, n = K.bagN + rage;
                list.forEach(q => { for (let i = 0; i < n; i++) {
                    const tx = q.x + (i - (n - 1) / 2) * 75 + (Math.random() - 0.5) * 30, tt = 0.9 + i * 0.15;
                    S.shots.push({ id: ++S.seq, owner: e.id, x: mx, y: my, ...lob(mx, my, tx, feetOf(q) - 6, tt), arc: true, t: 0, k: 'gift', fuse: T(K.giftFuse), blast: K.giftBlast, dmg: K.giftDmg, sc: 1, life: T(6000) });
                    giftMark(c, tx, feetOf(q) - 10, tt / 0.03);
                } });
            }
            e.bst = 'anim'; e.ph = T(K.animMs); e.move = e.ak === 'roll' ? 'sroll' : 'sbag';
        }
    } else if (e.bst === 'anim') {
        if (--e.ph! <= 0) {
            if (Math.random() < K.restChance) { e.bst = 'rest'; e.ph = T(K.restMs); e.move = 'rest'; e.vuln = S.tick + T(K.restMs); spSay(c, 'tired'); }
            else { e.bst = 'idle'; e.ph = T(K.idleMs * (rage ? 0.8 : 1)); e.move = ''; }
        }
    } else if (e.bst === 'rest' && --e.ph! <= 0) { e.bst = 'idle'; e.ph = T(K.idleMs); e.move = ''; }
    BM.moveEnemy(S, e, d, vx, null, c.dt);
    if (z) e.x = Math.max(z.x0 + d.w / 2, Math.min(z.x1 - d.w / 2, e.x));
}
// ROBOT BIGFUT (2-boss, chizilgan sxema bo'yicha): maydonning CHAP CHEKKASIDA orol ortidan beligacha ko'rinib turgan bahaybat oq junli robot-maxluq -
// boshi o'ngga (pog'onalar tomonga) qaragan, orqa qo'li tik, oldingi qo'li yerda yotibdi, mushti tugilgan; ko'zini sochi yopgan, og'zi ko'rinadi.
// O'q FAQAT YUZIGA tegadi (server tanasi - yuz to'rtburchagi: e.x - yuz o'rtasi, e.y - yuz osti, yerdan faceUp px balandda). Joyidan qimirlamaydi.
// Hujumlari (alohida taymerlar, bir-biriga to'qnashmaydi):
//  1) MUSHT TEPADAN: qo'lini cho'zib o'yinchi BOSHI USTIGA olib boradi (pastda soya, ogohlantirish) - keyin pastga uradi
//  2) KATTA QOR: qo'li bilan ulkan qor to'pini otadi - tushgan joyida portlaydi (sovuq qotiradi)
//  3) SO'LAK TUPURISH: og'zidan yopishqoq muzdek so'lak tomchilari yoy bo'ylab o'yinchi tomonga uchadi (tekkan sekinlashadi), tushgan joyida muz ko'lmak
// rasm (bigfoot.png) bo'yicha: yuz osti yerdan 123 px, yuz maydon chetidan 273 px
// sekin: har hujumdan keyin kamida gap ms tanaffus (oldingisi tugab, keyingisi oldindan bilinadi); musht oldidan uzoqroq ogohlantirish
export const BIGFOOT = { faceUp: 123, faceX: 273, riseMs: 2200, fistEvery: 7000, fistWarn: 1400, fistHit: 350, fistDmg: 34, fistW: 120,
    snowEvery: 8500, snowDmg: 26, snowBlast: 84, spitEvery: 9500, spitN: 4, spitDmg: 14, gap: 4500 };
function bigfootAI(c: SP): void {
    const { S, e } = c, K = BIGFOOT, z = zoneOf(S, e);
    if (e.bst === undefined) {
        e.hx = z ? z.x0 + K.faceX : e.x; e.x = e.hx; e.hy = e.y; e.f = 1; e.bst = 'rise'; e.ph = T(K.riseMs); e.hide = 'under';
        e.tA = S.tick + T(K.riseMs + 2000); e.tB = S.tick + T(K.riseMs + 5000); e.tC = S.tick + T(K.riseMs + 8000);
        spSay(c, 'bfrise', { sx: Math.round(e.x), sy: Math.round(e.hy) });
    }
    const rage = spRage(c), k = rage ? 0.85 : 1, g = e.hy;
    e.vx = 0; e.vy = 0; e.ground = true;
    // yuz osti: ko'tarilayotganda maydon ortidan chiqib keladi
    const up = e.bst === 'rise' ? 1 - Math.max(0, e.ph!) / T(K.riseMs) : 1;
    e.y = g - K.faceUp + (1 - up) * 320;
    if (e.bst === 'rise') { if (up > 0.6) e.hide = undefined; if (--e.ph! <= 0) { e.bst = 'idle'; e.hide = undefined; } return; }
    if (e.bst !== 'idle' && --e.ph! <= 0) e.bst = 'idle';   // hujum ko'rinishi tugadi
    const inA = c.alive.filter(q => inZ(z, q));
    if (!inA.length) { e.tA = Math.max(e.tA!, S.tick + T(800)); e.tB = Math.max(e.tB!, S.tick + T(1600)); e.tC = Math.max(e.tC!, S.tick + T(2400)); return; }
    e.x = e.hx; e.f = 1;   // chap chekkada, o'ngga qaragan
    const later = (ms: number) => S.tick + T(ms);
    const busy = (dur: number) => { const t = later(dur + K.gap * (rage ? 0.8 : 1)); e.tA = Math.max(e.tA!, t); e.tB = Math.max(e.tB!, t); e.tC = Math.max(e.tC!, t); };   // tanaffus - hujum TUGAGANIDAN keyin
    // NAVBAT: musht -> qor -> so'lak -> musht ... (tayyorlaridan navbatdagisi; uchalasi ham keladi)
    const order = ['a', 'b', 'c'], tm: { [k: string]: number } = { a: e.tA!, b: e.tB!, c: e.tC! };
    let pick = '';
    for (let i = 1; i <= 3 && !pick; i++) { const k = order[((e.mi ?? -1) + i) % 3]; if (S.tick >= tm[k]) { pick = k; e.mi = order.indexOf(k); } }
    if (pick === 'a') {
        const list = rage && inA.length > 1 ? inA.slice().sort(() => Math.random() - 0.5).slice(0, 2) : [pickOne(inA)];
        list.forEach((q) => {
            const s = BM.surfaceBelow(S, q.x, feetOf(q) - 8, 400); if (!s) return;
            spAr(c, { k: 'fist:bigfoot', x: q.x - K.fistW / 2, y: s.y - 150, w: K.fistW, h: 150, warn: T(K.fistWarn * (rage ? 0.85 : 1)), t: T(K.fistHit), dmg: K.fistDmg, kb: [300, -260], dk: 'hit', f: q.x < e.x ? -1 : 1 });
        });
        busy(K.fistWarn + K.fistHit); e.tA = later(K.fistEvery * k); e.bst = 'fist'; e.ph = T(K.fistWarn + K.fistHit); spSay(c, 'bffist');
    } else if (pick === 'b') {
        const q = pickOne(inA), hx = e.x + 135, hy = g - 105;   // mushtidagi qor (rasm: 2-kadr)
        S.shots.push({ id: ++S.seq, owner: e.id, x: hx, y: hy, ...lob(hx, hy, q.x, feetOf(q) - 10, 1.05), arc: true, t: 0, k: 'bigsnow', sc: 2.6, blast: K.snowBlast, dmg: K.snowDmg, fx: 'slow', life: T(5000) });
        busy(1100); e.tB = later(K.snowEvery * k); e.bst = 'throw'; e.ph = T(700); spSay(c, 'bfsnow');
    } else if (pick === 'c') {
        const q = BM.nearest(inA, e)!, mx = e.x + 20, my = e.y - 10, n = K.spitN + rage * 2;
        for (let i = 0; i < n; i++) {
            const tx = q.x + (i - (n - 1) / 2) * 55 + (Math.random() - 0.5) * 20;
            S.shots.push({ id: ++S.seq, owner: e.id, x: mx, y: my, ...lob(mx, my, tx, feetOf(q) - 12, 0.75 + i * 0.06), arc: true, t: 0, k: 'bfspit', sc: 1.3, dmg: K.spitDmg, fx: 'slow', area: 'patch:ice', life: T(4000) });
        }
        busy(900); e.tC = later(K.spitEvery * k); e.bst = 'spit'; e.ph = T(600); spSay(c, 'bfspit');
    }
}
// MUZ XOKKEYCHI (maxfiy boss: qor bazasi yer ostidagi xonada - muz maydoni; o'yinchidan ikki barobar katta, qo'lida klyushka).
// Xonaning o'ng chetida DARVOZA turadi. Unga otilgan o'q / zarbani klyushkasi bilan qaytaradi - joni FAQAT DARVOZAGA tekkanda ketadi (bigmap damageEnemy). Hujumlari:
//  1) o'yinchi YERDA (uning sathida) bo'lsa - sirpanib borib, klyushka bilan urib, DARVOZA tomonga uchirib yuboradi (darvozaga tushsa - "GOL!": qo'shimcha zarba)
//  2) o'yinchi tepada (pog'onada) bo'lsa - klyushka uchida MUZ SHAYBA o'zi paydo bo'ladi va uni urib o'yinchiga otadi (tekkan muzlaydi)
export const HOCKEY = { accel: 0.09, hitWind: 380, hitDmg: 22, hitV: 980, hitVy: -360, goalMs: 1500, goalDmg: 18, goalW: 45, upDy: 50, shotFirst: 1200, shotEvery: 1700,
    slapWind: 450, puckV: 760, puckDmg: 20, contactDmg: 10 };
function hockeyAI(c: SP): void {
    const { S, e, d } = c, K = HOCKEY, z = zoneOf(S, e);
    if (!z) return;
    e.nl = true;
    if (e.gx === undefined) { e.gx = z.x1 - 50; e.tA = S.tick + T(K.shotFirst); e.pk = []; e.gl = {}; e.sv = 0; e.bst = 'skate'; spSay(c, 'hkstart'); }
    // DARVOZA (yo'q bo'lsa - qayta qo'yiladi)
    let goal = S.enemies.find(o => o.k === 'hgoal' && o.zone === e.zone);
    if (!goal) { const s = BM.surfaceBelow(S, e.gx, z.y1 - 120, 300, true); goal = BM.spawnEnemy(S, 'hgoal', e.gx, s ? s.y : e.y, e.zone); goal.st = 'idle'; }
    const gy = goal.y, rage = spRage(c), inA = c.alive.filter(q => inZ(z, q)), gl = e.gl!;
    // GOL: darvoza tomon uchirilgan o'yinchi darvozaga (devorgacha) tushdi
    inA.forEach((q) => {
        if (!((gl[q.id] || 0) > S.tick) || q.x < e.gx! - K.goalW || feetOf(q) < gy - 90 || feetOf(q) > gy + 6) return;
        delete gl[q.id]; BM.hurtBig(q, K.goalDmg, c.ctx, 'ground'); c.ctx.knock(q, -560, -400);
        spSay(c, 'goal', { gx: Math.round(e.gx!), gy: Math.round(gy) });
    });
    if (!inA.length) { e.sv = 0; e.bst = 'skate'; e.move = ''; BM.moveEnemy(S, e, d, 0, null, c.dt); return; }
    // sirpanib urilsa - biroz itaradi
    inA.forEach((q) => {
        const cc = e.cc || (e.cc = {});
        if ((cc[q.id] || 0) > S.tick || Math.abs(q.x - e.x) > d.w / 2 || feetOf(q) < e.y - d.h + 10 || q.y - 24 > e.y || Math.abs(e.sv || 0) < 120) return;
        BM.hurtBig(q, K.contactDmg, c.ctx); safeKnock(S, z, q, Math.sign(e.sv!) * 420, -260, c.ctx); cc[q.id] = S.tick + T(900);
    });
    const q = BM.nearest(inA, e)!, dx = q.x - e.x, dy = feetOf(q) - e.y;
    e.pk = e.pk!.filter(id => S.shots.some(s => s.id === id && s.idle));
    let want = 0;
    if (e.bst === 'hwind') {
        if (--e.ph! <= 0) {
            // KLYUSHKA ZARBASI: oldidagilar darvoza tomon uchib ketadi
            inA.forEach((o) => {
                if (Math.abs(o.x - e.x) > d.reach + 30 || (o.x - e.x) * e.f < -20 || Math.abs(feetOf(o) - e.y) > 70) return;
                BM.hurtBig(o, K.hitDmg, c.ctx); c.ctx.knock(o, (e.gx! >= o.x ? 1 : -1) * K.hitV, K.hitVy); gl[o.id] = S.tick + T(K.goalMs);
            });
            e.bst = 'hit'; e.ph = T(320); e.move = 'hit'; e.cd = T(d.atkMs * (rage ? 0.75 : 1)); spSay(c, 'hkhit');
        }
    } else if (e.bst === 'swind') {
        if (--e.ph! <= 0) {
            // SHAYBANI URADI: eng yaqin o'yinchiga to'g'ri uchadi
            const pk = S.shots.find(s => s.id === e.pk![0]); e.pk!.shift();
            if (pk) {
                const tq = BM.nearest(inA, pk)!, a = Math.atan2(tq.y + 8 - (pk.y - 6), tq.x - pk.x), v = K.puckV * (rage ? 1.15 : 1);
                pk.idle = false; pk.y -= 6; pk.t = 0; pk.vx = Math.cos(a) * v; pk.vy = Math.sin(a) * v; pk.life = T(2200);
                e.f = tq.x < e.x ? -1 : 1;
            }
            e.bst = 'slap'; e.ph = T(300); e.move = 'slap'; c.ctx.emit('bigShoot', { id: e.id });
        }
    } else if (e.bst !== 'skate') {
        if (--e.ph! <= 0) { e.bst = 'skate'; e.move = ''; }
    } else {
        e.f = dx < 0 ? -1 : 1;
        const grounded = inA.filter(o => feetOf(o) - e.y > -K.upDy), tq = grounded.length ? BM.nearest(grounded, e)! : q, tdx = tq.x - e.x;
        if (grounded.length) {
            // YERDAGI O'YINCHI: sirpanib borib klyushka bilan uradi
            e.f = tdx < 0 ? -1 : 1;
            if (Math.abs(tdx) < d.reach + 10 && e.cd <= 0) { e.bst = 'hwind'; e.ph = T(K.hitWind * (rage ? 0.8 : 1)); e.move = 'hwind'; e.sv = 0; c.ctx.emit('bigWind', { id: e.id }); }
            else if (Math.abs(tdx) > d.reach * 0.6) want = Math.sign(tdx) * d.spd * (rage ? 1 : 0.85);
        } else if (S.tick >= e.tA!) {
            // TEPADAGI O'YINCHI: klyushka uchida MUZ SHAYBA o'zi paydo bo'ladi (ogohlantirish), keyin urib otadi
            const s = BM.surfaceBelow(S, e.x + e.f * 44, e.y - 30, 120, true);
            const sh: BM.BigShot = { id: ++S.seq, owner: e.id, x: e.x + e.f * 44, y: (s ? s.y : e.y) - 5, vx: 0, vy: 0, arc: false, t: 0, k: 'puck', dmg: K.puckDmg, idle: true, life: T(2500) };
            S.shots.push(sh); e.pk = [sh.id];
            e.bst = 'swind'; e.ph = T(K.slapWind * (rage ? 0.8 : 1)); e.move = 'swind'; e.sv = 0;
            e.tA = S.tick + T(K.shotEvery * (rage ? 0.7 : 1));
            spSay(c, 'hkpuck', { px: Math.round(sh.x), py: Math.round(sh.y) });
        } else if (Math.abs(dx) > 180) want = Math.sign(dx) * d.spd * 0.5;   // tepadagining ostiga yaqinroq keladi (otish uchun)
    }
    // MUZDA SIRPANADI: tezlik asta o'zgaradi
    e.sv = (e.sv || 0) + (want - (e.sv || 0)) * K.accel;
    if (e.bst !== 'skate') e.sv *= 0.85;
    BM.moveEnemy(S, e, d, e.sv, null, c.dt);
    const lo = z.x0 + d.w / 2, hi = e.gx! - 70;
    if (e.x < lo || e.x > hi) { e.x = Math.max(lo, Math.min(hi, e.x)); e.sv = 0; }
}
// darvoza: joyidan qimirlamaydi (zarbasi xokkeychiga o'tadi - bigmap damageEnemy)
function goalAI(c: SP): void { c.e.f = -1; BM.moveEnemy(c.S, c.e, c.d, 0, null, c.dt); }
// MUZ TARAN (oddiy): bir qo'li ulkan va qalin, ikkinchisi kichkina, oyoqlari kalta - gorilladek katta qo'liga tayanib yuradi.
// Yaqinda - katta qo'li bilan uradi (nari otadi); o'rtacha masofada - cho'kib (ogohlantirish), o'yinchi USTIGA sakraydi: qo'nganda atrofga zarba
export const ICERAM = { leapMin: 130, leapMax: 360, leapEvery: 3200, crouchMs: 520, landK: 1.1, landR: 90 };
function iceramAI(c: CR): void {
    const { S, e, d, p } = c, K = ICERAM, dx = p.x - e.x, dist = Math.abs(dx), dy = feetOf(p) - e.y;
    if (e.tA === undefined) e.tA = S.tick + T(1500 + Math.random() * 1500);
    let vx = 0;
    if (e.bst === 'crouch') {
        if (--e.ph! <= 0) {
            const s = BM.surfaceBelow(S, p.x, feetOf(p) - 8, 200);
            const ok = !!s && BM.leapTo(e, Math.max(s.x + 10, Math.min(s.x + s.w - 10, p.x)), s.y, d.jump * 1.7);
            e.bst = ok ? 'leap' : undefined;
            if (ok) c.ctx.emit('bigBossMove', { id: e.id, k: e.k, m: 'ramleap', x: Math.round(e.x), y: Math.round(e.y) });
        }
    } else if (e.bst === 'leap') {
        if (e.ground) e.bst = undefined;   // (qo'nish zarbasi - pastda)
    } else {
        e.f = dx < 0 ? -1 : 1;
        if (dist > d.reach * 0.7) vx = e.f * d.spd;
        if (e.ground && e.atk === 0 && S.tick >= e.tA! && dist >= K.leapMin && dist <= K.leapMax && dy > -200 && dy < 120) {
            e.bst = 'crouch'; e.ph = T(K.crouchMs); e.tA = S.tick + T(K.leapEvery + Math.random() * 1500); vx = 0; c.ctx.emit('bigWind', { id: e.id });
        } else if (e.atk === 0 && e.cd <= 0 && dist < d.reach + 12 && Math.abs(dy) < 50) { e.atk = T(400); e.cd = T(d.atkMs); c.ctx.emit('bigWind', { id: e.id }); }
    }
    // katta qo'l zarbasi: faqat oldidagiga, nari otadi
    if (e.atk > 0 && --e.atk === 0 && (p.x - e.x) * e.f > -10 && dist < d.reach + 20 && Math.abs(dy) < 54) { BM.hurtBig(p, d.dmg, c.ctx); c.ctx.knock(p, e.f * 340, -240); }
    const landed = BM.moveEnemy(S, e, d, vx, p, c.dt);
    if (landed && e.bst === 'leap') {
        e.bst = undefined;
        c.alive.forEach((q) => { if (Math.abs(q.x - e.x) < K.landR && Math.abs(feetOf(q) - e.y) < 50) { BM.hurtBig(q, d.dmg * K.landK, c.ctx, 'ground'); c.ctx.knock(q, Math.sign((q.x - e.x) || 1) * 300, -300); } });
        c.ctx.emit('bigBossMove', { id: e.id, m: 'ramland', x: Math.round(e.x), y: Math.round(e.y) });
    }
}
Object.assign(SETPIECE, { santa: santaAI, bigfoot: bigfootAI, hockey: hockeyAI, hgoal: goalAI });
CREATURE.iceram = iceramAI;

// ===== BOTQOQ =====
// BAHAYBAT GUL (1-boss): balchiq ko'lining o'rtasida o'sib turadi (qimirlamaydi), uzun ingichka poya, tepasida to'q pushti BOSH - katta tishli og'iz.
// O'q FAQAT BOSHIGA tegadi (server tanasi - bosh: e.x - bosh o'rtasi, e.y - bosh osti, ildizdan headUp px balandda) - eng baland pog'onadan otiladi.
// Ko'lga tushgan o'yinchi balchiqda sekinlashadi. Hujumlari (navbat bilan, oralarida tanaffus):
//  1) TOMIR: pog'onadagi o'yinchiga poyasidan uzun tomir otiladi (oldin chiziq - ogohlantirish), tekkan - bog'lanib qoladi
//  2) TIKANLAR: og'zidan 3 ta tikan tupuradi (g'azabda - 5)
//  3) TISHLASH: eng baland pog'onadagi o'yinchiga boshini tortib (ogohlantirish) - keyin tishlaydi
export const BIGFLOWER = { headUp: 254, headDx: 11, rootWarn: 850, rootHit: 350, rootDmg: 20, thornN: 3, thornV: 420, thornDmg: 14, biteWarn: 750, biteHit: 260, biteDmg: 32, biteRange: 320,
    gap: 1600, every: 3000 };   // hujumlar orasidagi tanaffus (ogohlantirishlar o'zgarmagan - qochsa bo'ladi)
function bigflowerAI(c: SP): void {
    const { S, e, d } = c, K = BIGFLOWER, z = zoneOf(S, e);
    if (e.bst === undefined) {
        const bog = z && S.w.bogs.find(b => b.x < z.x1 && b.x + b.w > z.x0 && b.y >= z.y0 && b.y <= z.y1 + 120);
        e.hx = bog ? bog.x + bog.w / 2 : e.x; e.hy = bog ? bog.y : e.y + 60; e.bst = 'idle'; e.ph = 0; e.mi = -1;
        e.tA = S.tick + T(1800); e.tB = S.tick + T(1800); e.tC = S.tick + T(1800);
        spSay(c, 'flrise', { sx: Math.round(e.hx), sy: Math.round(e.hy) });
    }
    const rage = spRage(c), k = rage ? 0.8 : 1, inA = c.alive.filter(q => inZ(z, q));
    e.vx = 0; e.vy = 0; e.ground = true;
    if (inA.length) e.f = BM.nearest(inA, { x: e.hx, y: e.hy - 250 })!.x < e.hx ? -1 : 1;
    e.x = e.hx + e.f * K.headDx; e.y = e.hy - K.headUp;
    if (e.bst !== 'idle' && --e.ph! <= 0) e.bst = 'idle';
    if (!inA.length) { e.tA = Math.max(e.tA!, S.tick + T(1000)); e.tB = Math.max(e.tB!, S.tick + T(1000)); e.tC = Math.max(e.tC!, S.tick + T(1000)); return; }
    if (e.bst !== 'idle') return;
    const later = (ms: number) => S.tick + T(ms), busy = (dur: number) => { const t = later(dur + K.gap * (rage ? 0.8 : 1)); e.tA = Math.max(e.tA!, t); e.tB = Math.max(e.tB!, t); e.tC = Math.max(e.tC!, t); };
    const top = (q: PlayerState) => feetOf(q) < e.hy - 250, onPlat = (q: PlayerState) => feetOf(q) < e.hy - 50;
    const biteQ = inA.find(q => top(q) && Math.abs(q.x - e.hx) < K.biteRange);
    // NAVBAT: tishlash (tepadagi yaqin bo'lsa) -> tomir (pog'onadagiga) -> tikan
    const order = ['c', 'a', 'b'], tm: { [k: string]: number } = { a: e.tA!, b: e.tB!, c: e.tC! };
    let pick = '';
    for (let i = 1; i <= 3 && !pick; i++) { const kk = order[((e.mi ?? -1) + i) % 3]; if (S.tick < tm[kk]) continue; if (kk === 'c' && !biteQ) continue; if (kk === 'a' && !inA.some(onPlat)) continue; pick = kk; e.mi = order.indexOf(kk); }
    if (pick === 'c' && biteQ) {
        spAr(c, { k: 'bite:flower', x: biteQ.x - 50, y: feetOf(biteQ) - 70, w: 100, h: 70, warn: T(K.biteWarn), t: T(K.biteHit), dmg: K.biteDmg, kb: [420, -300], dk: 'hit', f: biteQ.x < e.hx ? -1 : 1 });
        e.bst = 'bitew'; e.ph = T(K.biteWarn + K.biteHit); busy(K.biteWarn + K.biteHit); e.tC = later(K.every * k);
        spSay(c, 'flbite', { tx: Math.round(biteQ.x), ty: Math.round(feetOf(biteQ) - 40) });
    } else if (pick === 'a') {
        const list = inA.filter(onPlat), q = list[Math.floor(Math.random() * list.length)], sx = e.hx, sy = e.hy - 150, tx = q.x, ty = feetOf(q) - 20;
        area(S, { zone: e.zone, owner: e.id, k: 'vine:flower', x: sx, y: sy, x2: tx, y2: ty, w: 22, h: 0, warn: T(K.rootWarn), t: T(K.rootHit), dmg: K.rootDmg, fx: 'root', dk: 'hit', grow: 1 });
        e.bst = 'roots'; e.ph = T(K.rootWarn + K.rootHit); busy(K.rootWarn + K.rootHit); e.tA = later(K.every * k); spSay(c, 'flroots');
    } else if (pick === 'b') {
        const q = BM.nearest(inA, e)!, mx = e.x + e.f * 60, my = e.y - 40, a0 = Math.atan2(q.y - my, q.x - mx), n = K.thornN + rage * 2;
        for (let i = 0; i < n; i++) { const a = a0 + (i - (n - 1) / 2) * 0.14; S.shots.push({ id: ++S.seq, owner: e.id, x: mx, y: my, vx: Math.cos(a) * K.thornV, vy: Math.sin(a) * K.thornV, arc: false, t: 0, k: 'thorn', sc: 1.8, dmg: K.thornDmg, life: T(3000) }); }
        e.bst = 'spit'; e.ph = T(500); busy(500); e.tB = later(K.every * k); spSay(c, 'flthorn');
    }
}
// BALOT MAGI (2-boss): yuzi ko'rinmaydi - faqat pushti ko'zlari, qora mantiya, qo'lida hassa, bo'yi o'yinchidan ikki barobar.
//  1) HASSA BILAN YERNI URADI: undan o'yinchi tomon ketma-ket tomirlar yerdan otilib chiqadi (birin-ketin uzoqlashib)
//  2) HASSANI KO'TARADI: yashil sfera otadi (sekin nishonga buriladi, tekkan / yerga tushgan joyida portlaydi)
// Yengilgach - suhbat ("mayli, yutdinglar..."), keyin tinch qo'shni (bigmap: qayta jang yo'q; klientda - gullar, qozon, arg'imchoq, simpatiya)
export const SWAMPMAGE = { walk: 70, keep: 300, slamWind: 750, rootN: 6, rootGap: 95, rootStep: 170, rootWarn: 420, rootHit: 380, rootDmg: 22,
    orbWind: 650, orbV: 280, orbDmg: 24, orbBlast: 56, gap: 2000, every: 4200, restChance: 0.25, restMs: 1600 };
function swampmageAI(c: SP): void {
    const { S, e, d } = c, K = SWAMPMAGE, z = zoneOf(S, e), rage = spRage(c), k = rage ? 0.8 : 1;
    e.nl = true;
    if (e.bst === undefined) { e.bst = 'idle'; e.ph = 0; e.mi = -1; e.tA = S.tick + T(1500); e.tB = S.tick + T(1500); spSay(c, 'mgstart'); }
    const inA = c.alive.filter(q => inZ(z, q));
    let vx = 0;
    if (!inA.length) { e.bst = 'idle'; BM.moveEnemy(S, e, d, 0, null, c.dt); return; }
    const q = BM.nearest(inA, e)!, dx = q.x - e.x;
    if (e.bst === 'idle') {
        e.f = dx < 0 ? -1 : 1;
        if (Math.abs(dx) < K.keep - 80) vx = -Math.sign(dx) * K.walk; else if (Math.abs(dx) > K.keep + 140) vx = Math.sign(dx) * K.walk * (rage ? 1.3 : 1);
        const order = ['a', 'b'], tm: { [kk: string]: number } = { a: e.tA!, b: e.tB! };
        let pick = '';
        for (let i = 1; i <= 2 && !pick; i++) { const kk = order[((e.mi ?? -1) + i) % 2]; if (S.tick >= tm[kk]) { pick = kk; e.mi = order.indexOf(kk); } }
        const later = (ms: number) => S.tick + T(ms), busy = (dur: number) => { const t = later(dur + K.gap * (rage ? 0.8 : 1)); e.tA = Math.max(e.tA!, t); e.tB = Math.max(e.tB!, t); };
        if (pick === 'a') { e.bst = 'slamw'; e.ph = T(K.slamWind); e.ak = String(dx < 0 ? -1 : 1); busy(K.slamWind + K.rootN * K.rootStep); e.tA = later(K.every * k); spSay(c, 'mgslam'); }
        else if (pick === 'b') { e.bst = 'raise'; e.ph = T(K.orbWind); busy(K.orbWind); e.tB = later(K.every * k); spSay(c, 'mgorb'); }
    } else if (e.bst === 'slamw') {
        if (--e.ph! <= 0) {
            // HASSA YERGA: o'yinchi tomon ketma-ket tomirlar
            const dir = Number(e.ak) || e.f, n = K.rootN + rage * 2;
            for (let i = 0; i < n; i++) {
                const x = e.x + dir * (70 + i * K.rootGap); if (z && (x < z.x0 - 40 || x > z.x1 + 40)) break;
                const s = BM.surfaceBelow(S, x, e.y - 30, 160, true); if (!s) continue;
                spAr(c, { k: 'pillar:root', x: x - 34, y: s.y - 100, w: 68, h: 100, warn: T(K.rootWarn + i * K.rootStep), t: T(K.rootHit), dmg: K.rootDmg, fx: 'root', kb: [0, -420], dk: 'ground' });
            }
            e.bst = 'slam'; e.ph = T(600); c.ctx.emit('bigBossMove', { id: e.id, m: 'quake', x: Math.round(e.x + dir * 30), y: Math.round(e.y), big: 0 });
        }
    } else if (e.bst === 'raise') {
        if (--e.ph! <= 0) {
            // YASHIL SFERA: hassa uchidan
            const sx = e.x + e.f * 40, sy = e.y - 142, a = Math.atan2(q.y - sy, q.x - sx);   // hassa uchidagi shar (rasm)
            S.shots.push({ id: ++S.seq, owner: e.id, x: sx, y: sy, vx: Math.cos(a) * K.orbV, vy: Math.sin(a) * K.orbV, arc: false, t: 0, k: 'greenorb', sc: 2, dmg: K.orbDmg, blast: K.orbBlast, home: T(1000), spd: K.orbV, life: T(5000), fx: 'slow' });
            if (rage) S.shots.push({ id: ++S.seq, owner: e.id, x: sx, y: sy, vx: Math.cos(a - 0.4) * K.orbV, vy: Math.sin(a - 0.4) * K.orbV, arc: false, t: 0, k: 'greenorb', sc: 1.6, dmg: K.orbDmg, blast: K.orbBlast, home: T(700), spd: K.orbV, life: T(5000) });
            e.bst = 'cast'; e.ph = T(350);
        }
    } else if (e.bst === 'rest') { if (--e.ph! <= 0) e.bst = 'idle'; }
    else if (--e.ph! <= 0) {
        if (Math.random() < K.restChance) { e.bst = 'rest'; e.ph = T(K.restMs); e.vuln = S.tick + T(K.restMs); spSay(c, 'tired'); } else e.bst = 'idle';
    }
    e.move = e.bst === 'idle' ? '' : e.bst;
    BM.moveEnemy(S, e, d, vx, null, c.dt);
    if (z) e.x = Math.max(z.x0 + d.w / 2, Math.min(z.x1 - d.w / 2, e.x));
}
// BALOT KRABI (maxfiy boss): xona polidagi balchiqda toshlar orasida SOXTA TOSH bo'lib yotadi (bossPre: 'stone'); ustiga sakralsa (yoki otilsa) -
// o'yinchi bilan birga ko'tarilib uyg'onadi. Qobig'i - toshdan, tepasida kichik tosh, og'zi / yuzi yo'q, sariq yonib turgan ko'zlari, ULKAN qisqichlari.
// O'q FAQAT QOBIG'IGA tegadi (server tanasi - qobiq: e.y - qobiq osti, yerdan shellUp px balandda). Hujumlari:
//  1) o'yinchi pastda (balchiq / tosh pog'ona) - yaqiniga borib QISQICH bilan qisadi (oldin qisqich ochiladi - ogohlantirish)
//  2) o'yinchi tepadagi pog'onada - yerdan TOSH olib unga otadi (tushgan joyida parchalanadi)
export const BOGCRAB = { shellUp: 100, walk: 70, pinchRange: 300, pinchWind: 650, pinchHit: 300, pinchDmg: 30, liftMs: 900, throwDmg: 26, throwBlast: 64, every: 2400, riseMs: 900, lowDy: 150, graceMs: 2200 };   // lowDy: balchiq, qobiq-toshlar va pastki pog'onalar - QISADI; undan baland (tepa pog'onalar) - TOSH OTADI
function crabPre(S: BM.BigState, e: BM.BigEnemy, alive: PlayerState[], ctx: BM.BigCtx): boolean {
    const z = zoneOf(S, e);
    if (e.bst === undefined) { e.bst = 'stone'; e.fy = z && z.dy !== undefined ? z.dy : e.y; e.x = e.hx = z && z.dx !== undefined ? z.dx : e.x; e.y = e.fy; e.f = 1; }
    if (e.bst !== 'stone') return false;
    e.y = e.fy!; e.vx = 0; e.vy = 0; e.ground = true;
    // ustiga sakradi (qobig'i ustida / yonida yerda) yoki otildi - uyg'onadi, ustidagilar bilan birga ko'tariladi
    const on = alive.find(q => q.x > e.x - 55 && q.x < e.x + 110 && feetOf(q) >= e.fy! - 70 && feetOf(q) <= e.fy! + 10);
    if (on || e.hp < e.mx) {
        e.bst = 'rise'; e.ph = T(BOGCRAB.riseMs);
        alive.forEach(q => { if (q.x > e.x - 90 && q.x < e.x + 150 && feetOf(q) >= e.fy! - 130 && feetOf(q) <= e.fy! + 10) ctx.knock(q, Math.sign((q.x - e.x - 24) || 1) * 330, -620); });   // yon tomonga otib yuboradi (zarar yo'q)
        ctx.emit('bigBoss', { z: e.zone, k: e.k, secret: true, pts: [[Math.round(e.x), Math.round(e.fy!)]] });
        ctx.emit('bigBossMove', { id: e.id, k: e.k, m: 'crwake', x: Math.round(e.x), y: Math.round(e.fy!) });
    }
    return true;
}
function bogcrabAI(c: SP): void {
    const { S, e, d } = c, K = BOGCRAB, z = zoneOf(S, e), fy = e.fy!, rage = spRage(c);
    e.vx = 0; e.vy = 0; e.ground = true;
    if (e.bst === 'rise') { e.y = fy - K.shellUp * (1 - Math.max(0, e.ph!) / T(K.riseMs)); if (--e.ph! <= 0) { e.bst = 'idle'; e.tA = S.tick + T(K.graceMs); } return; }   // ko'tarilgach - o'yinchi o'ziga kelguncha hujum yo'q
    e.y = fy - K.shellUp;
    const inA = c.alive.filter(q => inZ(z, q));
    if (!inA.length) { e.bst = 'idle'; return; }
    const q = BM.nearest(inA, { x: e.x, y: fy })!, dx = q.x - e.x, low = feetOf(q) >= fy - K.lowDy;
    let vx = 0;
    if (e.bst === 'idle') {
        e.f = dx < 0 ? -1 : 1;
        if (Math.abs(dx) > 150) vx = Math.sign(dx) * K.walk * (rage ? 1.4 : 1);
        if (S.tick >= e.tA!) {
            if (low && Math.abs(dx) < K.pinchRange) {
                spAr(c, { k: 'pinch:crab', x: q.x - 55, y: feetOf(q) - 80, w: 110, h: 80, warn: T(K.pinchWind * (rage ? 0.85 : 1)), t: T(K.pinchHit), dmg: K.pinchDmg, kb: [380, -260], dk: 'hit', f: e.f });
                e.bst = 'pinchw'; e.ph = T(K.pinchWind * (rage ? 0.85 : 1)); e.tA = S.tick + T(K.every * (rage ? 0.75 : 1)); spSay(c, 'crpinch', { tx: Math.round(q.x), ty: Math.round(feetOf(q) - 40) });
            } else if (!low) {
                e.bst = 'lift'; e.ph = T(K.liftMs); e.tA = S.tick + T(K.every * (rage ? 0.75 : 1)); spSay(c, 'crlift');
            } else e.tA = S.tick + T(300);
        }
    } else if (e.bst === 'pinchw') { if (--e.ph! <= 0) { e.bst = 'pinch'; e.ph = T(K.pinchHit + 150); } }
    else if (e.bst === 'lift') {
        if (--e.ph! <= 0) {
            // yerdan olingan TOSH: ko'tarilgan qisqichdan o'yinchiga
            const sx = e.x + e.f * 110, sy = fy - 200, tt = Math.max(0.7, Math.min(1.2, Math.abs(q.x - sx) / 450));
            S.shots.push({ id: ++S.seq, owner: e.id, x: sx, y: sy, ...lob(sx, sy, q.x, feetOf(q) - 12, tt), arc: true, t: 0, k: 'rock', sc: 2.6, blast: K.throwBlast, dmg: K.throwDmg, life: T(5000) });
            e.bst = 'throw'; e.ph = T(450);
        }
    } else if (--e.ph! <= 0) e.bst = 'idle';
    e.x += vx * c.dt;
    const L0 = z && z.cx0 !== undefined ? z.cx0 : z ? z.x0 : -1e9, L1 = z && z.cx1 !== undefined ? z.cx1 : z ? z.x1 : 1e9;   // faqat tekis balchiq yo'l ustida yuradi
    e.x = Math.max(L0 + 110, Math.min(L1 - 110, e.x));
}
// QORA KAPISHON (oddiy): faqat sariq ko'zlari ko'rinadi; masofani saqlaydi va o'yinchi oyog'i ostidan TOMIR chiqaradi (oldin yer yoriladi)
export const HOODROOT = { keep: 260, castEvery: 3200, castWarn: 900, castHit: 300 };
function hoodrootAI(c: CR): void {
    const { S, e, d, p } = c, K = HOODROOT, dx = p.x - e.x, dist = Math.abs(dx);
    if (e.tA === undefined) e.tA = S.tick + T(1200 + Math.random() * 1500);
    e.f = dx < 0 ? -1 : 1;
    let vx = 0;
    if ((e.ph || 0) > 0) e.ph!--;
    else if (dist < K.keep - 60) vx = -e.f * d.spd; else if (dist > K.keep + 160) vx = e.f * d.spd;
    if (S.tick >= e.tA! && dist < 520 && Math.abs(feetOf(p) - e.y) < 320) {
        const s = BM.surfaceBelow(S, p.x, feetOf(p) - 8, 300);
        if (s) { area(S, { zone: e.zone, owner: e.id, k: 'pillar:root', x: p.x - 24, y: s.y - 90, w: 48, h: 90, warn: T(K.castWarn), t: T(K.castHit), dmg: d.dmg, fx: 'root', kb: [0, -380], dk: 'ground' }); e.ph = T(700); c.ctx.emit('bigWind', { id: e.id }); }
        e.tA = S.tick + T(K.castEvery + Math.random() * 1000);
    }
    BM.moveEnemy(S, e, d, vx, p, c.dt);
}
Object.assign(SETPIECE, { bigflower: bigflowerAI, swampmage: swampmageAI, bogcrab: bogcrabAI });
CREATURE.hoodroot = hoodrootAI;
