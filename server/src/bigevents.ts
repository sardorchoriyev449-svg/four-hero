// THE WORLD: TASODIFIY DUNYO HODISALARI (butun xona uchun)
//  METEORIT YOMG'IRI: har 4-7 daqiqada - 4 s ogohlantirish, keyin 25 s davomida ochiq joydagi har o'yinchi atrofiga meteoritlar tushadi.
//  Meteorit tik tushadi va o'yinchi ustidagi BIRINCHI sirtga uriladi: g'orda, supacha / tom ostida turgan o'yinchiga tegmaydi (panoh).
//  Boss maydonidagi o'yinchilarga meteorit tushmaydi.
import * as BM from './bigmap';
import { area, SETPIECE } from './bigboss';
import { PlayerState, RoomState } from './types';

const T = (ms: number) => Math.round(ms / 30);
export const METEOR = { firstMin: 120000, firstMax: 240000, everyMin: 240000, everyMax: 420000, warnMs: 4000, ms: 25000, spawnMs: 450, spread: 480, lead: 0.35,
    dmgK: 1.3, warnFall: 1100, roof: 320 };   // meteoritdan tanga tushmaydi
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

// PUL O'G'RISI: kelish tezligi, o'g'irlash ulushi, uyada kutish, pichoq otish, tutun bilan chetga sakrash
export const THIEF = { pct: 0.2, min: 10, max: 500, minCoinsHint: 0, spawnDx: 650, stuckMs: 6000, fleeMs: 900, lairMs: 180000, knifeMs: 1400, knifeV: 620, blinkMs: 3000, keep: 260, hpK: 3, bonusK: 0.25 };
export interface BigEvent { k: string; st: 'idle' | 'warn' | 'on'; until: number; next: number; force?: string }
export interface BigDrop { id: string; x: number; y: number; v: number; at: number }

// BOSS JANGI ketyapti (biror boss maydoni faol) - shu payt dunyo hodisalari boshlanmaydi (meteorit, o'g'ri), keyinga suriladi
export function bossFight(S: BM.BigState): boolean {
    return S.w.zones.some(z => z.boss && S.zoneState[z.id] && S.zoneState[z.id].st === 'active' && S.enemies.some(e => e.zone === z.id));
}
function inArena(S: BM.BigState, p: PlayerState): boolean {
    return BM.bigArenas(S).some(a => p.x > a.x0 - 40 && p.x < a.x1 + 40 && p.y + 24 >= a.y0 + 100 && p.y + 24 <= a.y1 + 160);
}
// bitta meteorit: o'yinchi sathidan 320 px tepadan pastga qarab birinchi sirtga uriladi - yaqin TOM (g'or shifti, supa tagi) bo'lsa o'shanga
// (panoh); uzoq tepadagi orollar / supalar panoh hisoblanmaydi (aks holda o'yinchi doim tasodifan "yashiringan" bo'lib qolardi)
function meteorAt(S: BM.BigState, p: PlayerState, x: number, ctx: BM.BigCtx): void {
    const feet = p.y + 24, s = BM.surfaceBelow(S, x, feet - METEOR.roof, 1300);
    if (!s || s.k === 'scloud') return;
    const L = S.w.locs.find(l => x >= l.x0 && x < l.x1), P = (L && BM.LOC_POWER[L.id]) || BM.LOC_POWER.elf;
    area(S, { k: 'fall:meteor', x: x - 36, y: s.y - 70, w: 72, h: 70, warn: T(METEOR.warnFall), t: 3, dmg: Math.round(P.dmg * METEOR.dmgK), dk: 'shot', kb: [260, -260] });
}
export function bigEvents(S: BM.BigState, room: RoomState, alive: PlayerState[], ctx: BM.BigCtx): void {
    const now = S.tick, E = S.ev || (S.ev = { k: 'meteor', st: 'idle', until: 0, next: now + T(rnd(METEOR.firstMin, METEOR.firstMax)) });
    if (E.st === 'idle') {
        if (now < E.next || !alive.length) return;
        if (bossFight(S)) { E.next = now + T(20000); return; }   // boss bilan jang - ko'ngilsizlik yo'q: 20 s dan keyin qayta tekshiriladi
        // navbatdagi hodisa: meteorit yomg'iri yoki pul o'g'risi (o'g'irlashga munosib o'yinchi bo'lsa)
        if ((E.force === 'thief' || (!E.force && Math.random() < 0.5)) && thiefStart(S, alive, ctx)) { E.st = 'on'; E.k = 'thief'; E.force = undefined; return; }
        E.st = 'warn'; E.k = 'meteor'; E.force = undefined; E.until = now + T(METEOR.warnMs);
        ctx.emit('bigEvent', { k: E.k, st: 'warn', ms: METEOR.warnMs });
        return;
    }
    if (E.k === 'thief') { if (!S.thief) { E.st = 'idle'; E.next = now + T(rnd(METEOR.everyMin, METEOR.everyMax)); } return; }   // o'g'ri hikoyasi tugaguncha boshqa hodisa yo'q
    if (E.st === 'warn') {
        if (now >= E.until) { E.st = 'on'; E.until = now + T(METEOR.ms); ctx.emit('bigEvent', { k: E.k, st: 'on', ms: METEOR.ms }); }
        return;
    }
    if (now >= E.until || !alive.length) {
        E.st = 'idle'; E.next = now + T(rnd(METEOR.everyMin, METEOR.everyMax));
        ctx.emit('bigEvent', { k: E.k, st: 'end' });
        return;
    }
    if (now % T(METEOR.spawnMs) !== 0) return;
    alive.forEach((p) => {
        if (inArena(S, p)) return;
        const v = S.pv[p.id];
        const x = Math.random() < METEOR.lead ? p.x + Math.max(-300, Math.min(300, (v ? v.vx : 0) * 1.1)) : p.x + rnd(-METEOR.spread, METEOR.spread);
        meteorAt(S, p, Math.max(40, Math.min(S.w.width - 40, x)), ctx);
    });
}
// test / admin uchun: hodisani hoziroq boshlash
export function bigEventStart(S: BM.BigState, k = 'meteor'): void { S.ev = { k, st: 'idle', until: 0, next: S.tick, force: k }; }

// ===== SKYLAND SAVDO AVTOMATI =====
// E - oyna ochiladi (do'kon buyumlari, 1.6x qimmat). Hech narsa olmasdan yopilsa - avtomat jahli chiqadi: uzun o'rgimchak oyoqlar, uzun qo'llar chiqadi,
// qo'lidan olov purkaydi yoki o'yinchi ustiga sakraydi. Yengilsa - mukofot, avtomat 90 s "buzuq" turadi, keyin joyiga qaytadi
export const VMOB = { hpK: 3, keep: 170, fireEvery: 4200, fireWind: 650, fireMs: 1000, fireLen: 380, fireDmg: 8, jumpEvery: 5200, jumpWind: 550, slamR: 130, offMs: 90000, calmMs: 20000, armY: 92, armX: 64 };
export function bigVendOpen(S: BM.BigState, p: PlayerState, i: number, ctx: BM.BigCtx): void {
    if (p.isDead || BM.bigVendNear(S, p) !== i) return;
    (S.vendS || (S.vendS = {}))[p.id] = { i, bought: false };
}
export function bigVendClose(S: BM.BigState, p: PlayerState, i: number, ctx: BM.BigCtx): void {
    const st = S.vendS && S.vendS[p.id];
    if (!st || st.i !== i) return;
    delete S.vendS![p.id];
    const v = BM.bigVends(S)[i];
    if (!v) return;
    if (st.bought) { ctx.emitTo(p.id, 'bigVend', { st: 'thanks', i }); return; }
    const mob = S.vendMob || (S.vendMob = {});
    if (mob[i] && S.enemies.some(e => e.id === mob[i])) return;
    // JAHLI CHIQDI: avtomat o'rnida maxluq
    const e = BM.spawnEnemy(S, 'vendmimic', v.x, v.y, -1), P = BM.LOC_POWER.sky;
    e.hp = e.mx = Math.round(P.hp[0] * VMOB.hpK); e.dk = P.dmg / 32; S.dkm[e.id] = e.dk;
    e.own = p.id; e.st = 'chase'; e.tgt = p.id; e.bst = 'rise'; e.ph = T(1300); e.f = p.x < v.x ? -1 : 1; e.hx = i; e.tA = S.tick + T(2500); e.tB = S.tick + T(3200); e.tC = S.tick;
    mob[i] = e.id;
    ctx.emit('bigVend', { st: 'angry', i, x: v.x, y: v.y, id: e.id, by: p.id });
}
function vendCalm(S: BM.BigState, e: BM.BigEnemy, ctx: BM.BigCtx, broken: boolean): void {
    const i = e.hx!;
    if (S.vendMob) delete S.vendMob[i];
    if (broken) (S.vendOff || (S.vendOff = {}))[i] = S.tick + T(VMOB.offMs);
    ctx.emit('bigVend', { st: broken ? 'broken' : 'calm', i, ms: broken ? VMOB.offMs : 0 });
}
export function bigVendDown(S: BM.BigState, e: BM.BigEnemy, ctx: BM.BigCtx): void { vendCalm(S, e, ctx, true); }
function vendAI(c: { S: BM.BigState, e: BM.BigEnemy, d: BM.EnemyDef, alive: PlayerState[], ctx: BM.BigCtx, dt: number }): void {
    const { S, e, d, ctx } = c, now = S.tick, v = BM.bigVends(S)[e.hx!];
    const say = (m: string, extra: object = {}) => ctx.emit('bigBossMove', { id: e.id, k: e.k, m, x: Math.round(e.x), y: Math.round(e.y), f: e.f, ...extra });
    const near = c.alive.filter(q => Math.abs(q.x - e.x) < 900 && Math.abs(q.y + 24 - e.y) < 400);
    if (near.length) e.tC = now;
    else if (now - (e.tC || now) > T(VMOB.calmMs)) {   // hech kim yo'q - tinchlanib joyiga qaytadi
        if (v) { e.x = v.x; e.y = v.y; }
        vendCalm(S, e, ctx, false); S.enemies = S.enemies.filter(o => o !== e); return;
    }
    if (e.bst === 'rise') { if (--e.ph! <= 0) { e.bst = 'run'; say('vroar'); } BM.moveEnemy(S, e, d, 0, null, c.dt); return; }
    if (!near.length) { BM.moveEnemy(S, e, d, 0, null, c.dt); return; }
    const q = near.find(o => o.id === e.own) || BM.nearest(near, e)!, dx = q.x - e.x, dist = Math.abs(dx);
    if (e.bst === 'fwind') {   // qo'lini o'yinchiga cho'zadi - olov (ko'k-qizil chiziq ogohlantirish)
        if (--e.ph! <= 0) { e.bst = 'rest'; e.ph = T(VMOB.fireMs + 250); }
        BM.moveEnemy(S, e, d, 0, null, c.dt); return;
    }
    if (e.bst === 'jwind') { if (--e.ph! <= 0) { const s = BM.surfaceBelow(S, q.x, q.y + 24 - 8, 300); if (s && BM.leapTo(e, q.x, s.y, 1500)) { e.bst = 'jump'; say('vjump'); } else { e.bst = 'run'; } } BM.moveEnemy(S, e, d, 0, null, c.dt); return; }
    if (e.bst === 'jump') {
        BM.moveEnemy(S, e, d, 0, null, c.dt);
        if (e.ground) {   // QO'NDI - atrofga zarba
            c.alive.forEach(o => { const ox = o.x - e.x; if (Math.abs(ox) < VMOB.slamR && Math.abs(o.y + 24 - e.y) < 90) { BM.hurtBig(o, d.dmg, ctx, 'hit'); ctx.knock(o, Math.sign(ox || 1) * 380, -360); } });
            say('vslam'); e.bst = 'rest'; e.ph = T(800); e.lvx = undefined;
        }
        return;
    }
    if (e.bst === 'rest') { if (--e.ph! <= 0) e.bst = 'run'; BM.moveEnemy(S, e, d, 0, null, c.dt); return; }
    e.f = dx < 0 ? -1 : 1;
    if (now >= e.tA! && dist < VMOB.fireLen + 40 && Math.abs(q.y + 24 - e.y) < 200) {   // OLOV PURKASH (qo'lidan, o'yinchi tomon)
        const mx = e.x + e.f * VMOB.armX, my = e.y - VMOB.armY, a = Math.atan2(q.y - my, (q.x - mx)), x2 = mx + Math.cos(a) * VMOB.fireLen, y2 = my + Math.sin(a) * VMOB.fireLen;
        area(S, { k: 'flame:vend', x: mx, y: my, x2, y2, w: 40, h: 40, warn: T(VMOB.fireWind), t: T(VMOB.fireMs), dmg: VMOB.fireDmg, every: T(200), dk: 'hit', owner: e.id, kb: [220, -160] });
        e.bst = 'fwind'; e.ph = T(VMOB.fireWind + VMOB.fireMs); e.tA = now + T(VMOB.fireEvery); say('vfire'); BM.moveEnemy(S, e, d, 0, null, c.dt); return;
    }
    if (now >= e.tB! && e.ground && dist < 520) { e.bst = 'jwind'; e.ph = T(VMOB.jumpWind); e.tB = now + T(VMOB.jumpEvery); say('vjwind'); BM.moveEnemy(S, e, d, 0, null, c.dt); return; }   // SAKRASH: o'yinchi ustiga
    BM.moveEnemy(S, e, d, dist > VMOB.keep ? e.f * d.spd : dist < VMOB.keep - 80 ? -e.f * d.spd * 0.6 : 0, q, c.dt);
}
SETPIECE.vendmimic = vendAI as any;

// ===== YER OSTI SHAXTASI =====
// stend yonida E - kirka; ruda toshi yonida E - zarba: har 2 zarbada +5 tanga; 100 tangada kirka sinadi va TOSH ODAM uyg'onadi.
// Yangi kirka: Tosh Odam yengilsa - darhol, aks holda 3 daqiqadan keyin
export const MINE = { coins: 5, every: 2, max: 100, hitMs: 280, standR: 90, oreR: 75, cdMs: 180000, golemHpK: 4, golemLifeMs: 150000 };
function pickOf(S: BM.BigState, pid: string) { const all = S.picks || (S.picks = {}); return all[pid] || (all[pid] = { have: false, found: 0, hits: 0, last: 0, cd: 0, golem: 0 }); }
// shaxta eshigi: 0 - qishloqdan zalga tushish, 1 - zaldan qishloqqa chiqish
export function bigMineDoor(S: BM.BigState, p: PlayerState, arg: number, ctx: BM.BigCtx): void {
    const m = S.w.mine; if (!m || p.isDead) return;
    const from = arg ? m.exit : m.door, to = arg ? m.door : m.exit;
    if (Math.abs(p.x - from.x) > 80 || Math.abs(p.y + 24 - from.y) > 80) return;
    p.x = to.x + (arg ? 0 : 70); p.y = to.y - 26;
    ctx.emitTo(p.id, 'teleport', { x: p.x, y: p.y });
    ctx.emit('bigMine', { st: 'door', by: p.id, x0: from.x, y0: from.y, x1: to.x, y1: to.y, inside: !arg });
}
export function bigPick(S: BM.BigState, p: PlayerState, ctx: BM.BigCtx): void {
    const m = S.w.mine; if (!m || p.isDead || Math.abs(p.x - m.stand) > MINE.standR || Math.abs(p.y + 24 - m.y) > 80) return;
    const st = pickOf(S, p.id);
    if (st.have) return;
    if (st.golem && S.enemies.some(e => e.id === st.golem)) { ctx.emitTo(p.id, 'bigMine', { st: 'golem' }); return; }
    if (st.cd > S.tick) { ctx.emitTo(p.id, 'bigMine', { st: 'wait', s: Math.ceil((st.cd - S.tick) * 0.03) }); return; }
    st.have = true; st.found = 0; st.hits = 0;
    ctx.emitTo(p.id, 'bigMine', { st: 'take', found: 0, max: MINE.max });
}
export function bigMineHit(S: BM.BigState, p: PlayerState, i: number, ctx: BM.BigCtx): void {
    const m = S.w.mine, x = m && m.ores[i], st = S.picks && S.picks[p.id];
    if (!m || x === undefined || !st || !st.have || p.isDead || Math.abs(p.x - x) > MINE.oreR || Math.abs(p.y + 24 - m.y) > 80) return;
    if (S.tick - st.last < T(MINE.hitMs)) return;
    st.last = S.tick; st.hits++;
    ctx.emit('bigMine', { st: 'hit', i, by: p.id });
    if (st.hits % MINE.every !== 0) return;
    st.found += MINE.coins;
    if (ctx.mineCoin) ctx.mineCoin(p, MINE.coins); else ctx.reward(p, MINE.coins);
    ctx.emitTo(p.id, 'bigMine', { st: 'coin', i, found: st.found, max: MINE.max });
    if (st.found < MINE.max) return;
    // KIRKA SINDI - TOSH ODAM uyg'onadi (toshlar orasidan, o'yinchi yonida)
    st.have = false; st.cd = S.tick + T(MINE.cdMs);
    const side = p.x < (m.x0 + m.x1) / 2 ? 1 : -1, gx = Math.max(m.x0 + 60, Math.min(m.x1 - 60, p.x + side * 170));
    const e = BM.spawnEnemy(S, 'stoneman', gx, m.y, -1), P = BM.LOC_POWER.lava;
    e.hp = e.mx = Math.round(P.hp[1] * MINE.golemHpK); e.dk = P.dmg / 30; S.dkm[e.id] = e.dk;
    e.own = p.id; e.st = 'chase'; e.tgt = p.id; e.f = -side; e.bst = 'rise'; e.ph = T(1200); e.life = undefined; e.tA = S.tick + T(MINE.golemLifeMs);
    st.golem = e.id;
    ctx.emit('bigMine', { st: 'break', by: p.id, x: Math.round(gx), y: m.y, gid: e.id });
}
// TOSH ODAM: sekin yuradi, tosh mushti bilan uradi (oldin qo'lini ko'taradi), har 3-zarbada ikki musht bilan yerga - atrofga to'lqin
function golemAI(c: { S: BM.BigState, e: BM.BigEnemy, d: BM.EnemyDef, alive: PlayerState[], ctx: BM.BigCtx, dt: number }): void {
    const { S, e, d, ctx } = c, now = S.tick;
    const say = (m: string, extra: object = {}) => ctx.emit('bigBossMove', { id: e.id, k: e.k, m, x: Math.round(e.x), y: Math.round(e.y), ...extra });
    if (now > (e.tA || 0)) { say('gcrumble'); S.enemies = S.enemies.filter(o => o !== e); return; }   // uzoq vaqt hech kim kelmadi - qayta toshga aylanadi
    if (e.bst === 'rise') { if (--e.ph! <= 0) { e.bst = 'run'; say('groar'); } BM.moveEnemy(S, e, d, 0, null, c.dt); return; }
    const near = c.alive.filter(q => Math.abs(q.x - e.x) < 1400 && Math.abs(q.y + 24 - e.y) < 400);
    if (!near.length) { BM.moveEnemy(S, e, d, 0, null, c.dt); return; }
    const q = near.find(o => o.id === e.own) || BM.nearest(near, e)!, dx = q.x - e.x;
    if (e.bst === 'pwind' || e.bst === 'swind') {
        if (--e.ph! <= 0) {
            if (e.bst === 'pwind') {   // MUSHT: oldidagi o'yinchilar
                c.alive.forEach(o => { const ox = o.x - e.x; if (ox * e.f > -10 && Math.abs(ox) < 110 && Math.abs(o.y + 24 - e.y) < 90) { BM.hurtBig(o, d.dmg, ctx, 'hit'); ctx.knock(o, e.f * 420, -260); } });
                say('gpunch', { f: e.f });
            } else {   // YERGA ZARBA: atrofdagi (yerdagi) o'yinchilarni silkitib uloqtiradi
                c.alive.forEach(o => { const ox = o.x - e.x; if (Math.abs(ox) < 210 && Math.abs(o.y + 24 - e.y) < 40) { BM.hurtBig(o, d.dmg * 0.8, ctx, 'ground'); ctx.knock(o, Math.sign(ox || 1) * 300, -420); } });
                say('gslam');
            }
            e.bst = 'rest'; e.ph = T(700); e.combo = (e.combo || 0) + 1;
        }
        BM.moveEnemy(S, e, d, 0, null, c.dt); return;
    }
    if (e.bst === 'rest') { if (--e.ph! <= 0) e.bst = 'run'; BM.moveEnemy(S, e, d, 0, null, c.dt); return; }
    e.f = dx < 0 ? -1 : 1;
    if (Math.abs(dx) < 105 && Math.abs(q.y + 24 - e.y) < 90) {
        const slam = (e.combo || 0) % 3 === 2;
        e.bst = slam ? 'swind' : 'pwind'; e.ph = T(slam ? 750 : 480); say(slam ? 'gswind' : 'gpwind', { f: e.f });
        BM.moveEnemy(S, e, d, 0, null, c.dt); return;
    }
    BM.moveEnemy(S, e, d, e.f * d.spd, q, c.dt);
}
SETPIECE.stoneman = golemAI as any;

// ===== PUL O'G'RISI =====
const locOf = (S: BM.BigState, x: number) => S.w.locs.find(l => x >= l.x0 && x < l.x1);
// uyasi: shu lokatsiyadagi eng yaqin g'or zalining chap qismi (boss zonasidan uzoqda)
function thiefLair(S: BM.BigState, x: number): { x: number, y: number, x0: number, x1: number } | null {
    const L = locOf(S, x);
    let best: { x: number, y: number, x0: number, x1: number } | null = null, bd = 1e12;
    S.w.isles.forEach((I) => {
        if (!I.hole || (L && (I.x < L.x0 || I.x >= L.x1))) return;
        const fl = S.w.plats.find(p => p.k.endsWith('floor') && p.x >= I.x && p.x < I.x + I.w);
        if (!fl) return;
        const x0 = fl.x + 30, x1 = fl.x + Math.max(160, fl.w * 0.4), d = Math.abs(fl.x - x);
        if (S.w.zones.some(z => (z.boss || z.trig) && x0 < z.x1 + 60 && x1 > z.x0 - 60 && fl.y >= z.y0 - 60 && fl.y <= z.y1 + 100)) return;   // boss g'ori (robot ilon va h.k.) - uya emas
        if (d < bd) { bd = d; best = { x: Math.round((x0 + x1) / 2), y: fl.y, x0, x1 }; }
    });
    return best;
}
function thiefStart(S: BM.BigState, alive: PlayerState[], ctx: BM.BigCtx): boolean {
    if (S.thief || !ctx.takeCoins) return false;
    const cand = alive.filter(p => p.userId && !inArena(S, p) && !BM.BIG_CLOSED.includes((locOf(S, p.x) || { id: '' }).id) && thiefLair(S, p.x));
    if (!cand.length) return false;
    const p = cand[Math.floor(Math.random() * cand.length)], feet = p.y + 24;
    let pos: { x: number, y: number } | null = null;
    for (const side of Math.random() < 0.5 ? [1, -1] : [-1, 1]) for (const dx of [THIEF.spawnDx, 450, 300]) {
        if (pos) break;
        const x = p.x + side * dx, s = BM.surfaceBelow(S, x, feet - 160, 360);
        if (s && s.k !== 'scloud' && x > 40 && x < S.w.width - 40) pos = { x, y: s.y };
    }
    if (!pos) pos = { x: p.x + 260, y: feet };
    const e = BM.spawnEnemy(S, 'cointhief', pos.x, pos.y, -1), P = (locOf(S, p.x) && BM.LOC_POWER[locOf(S, p.x)!.id]) || BM.LOC_POWER.elf;
    e.hp = e.mx = Math.round(Math.min(300, P.hp[1]) * THIEF.hpK); e.dk = P.dmg / 10; S.dkm[e.id] = e.dk;   // joni va zarbasi - lokatsiya kuchiga qarab
    e.own = p.id; e.bst = 'come'; e.st = 'chase'; e.tgt = p.id; e.tA = S.tick;
    S.thief = { id: e.id, pid: p.id, loot: 0, lair: null, until: S.tick + T(60000), coins: [] };
    ctx.emitTo(p.id, 'bigThief', { st: 'come' });
    return true;
}
function thiefGone(S: BM.BigState, room: RoomState | undefined, ctx: BM.BigCtx, st: string): void {
    const t = S.thief; if (!t) return;
    const e = S.enemies.find(o => o.id === t.id);
    if (e) { ctx.emit('bigThief', { st: 'vanish', x: Math.round(e.x), y: Math.round(e.y) }); S.enemies = S.enemies.filter(o => o !== e); }
    if (room && t.coins.length) room.coins = room.coins.filter(c => !t.coins.includes(c.id));   // vaqt tugadi - sochilgan tangalar ham yo'qoladi
    if (st) ctx.emitTo(t.pid, 'bigThief', { st });
    S.thief = null;
}
function thiefAI(c: { S: BM.BigState, e: BM.BigEnemy, d: BM.EnemyDef, alive: PlayerState[], ctx: BM.BigCtx, dt: number, room?: RoomState }): void {
    const { S, e, d, ctx } = c, t = S.thief, now = S.tick;
    if (!t || t.id !== e.id) { S.enemies = S.enemies.filter(o => o !== e); return; }
    const say = (m: string, extra: object = {}) => ctx.emit('bigBossMove', { id: e.id, k: e.k, m, x: Math.round(e.x), y: Math.round(e.y), ...extra });
    const victim = c.alive.find(p => p.id === t.pid);
    if (e.bst === 'come') {   // o'yinchi orqasidan yugurib keladi
        if (now > t.until || !victim) { thiefGone(S, c.room, ctx, 'escaped'); return; }
        if (inArena(S, victim) || bossFight(S)) { thiefGone(S, c.room, ctx, 'scared'); return; }   // boss jangi boshlandi - o'g'ri hech narsa olmasdan qochadi
        const dx = victim.x - e.x, feet = victim.y + 24;
        e.f = dx < 0 ? -1 : 1;
        if (Math.abs(dx) < 34 && Math.abs(feet - e.y) < 60) {
            e.bst = 'steal'; e.ph = T(1500); t.loot = -1; say('tsteal');   // tanga olinguncha (baza javobi) - joyida turadi
            ctx.takeCoins!(victim, THIEF.pct, THIEF.min, THIEF.max, (taken) => {
                if (!S.thief || S.thief.id !== e.id) { if (taken > 0) ctx.reward(victim, taken); return; }   // o'g'ri allaqachon yo'q - tanga egasiga qaytadi
                t.loot = taken;
                if (taken <= 0) { ctx.emitTo(t.pid, 'bigThief', { st: 'nocoins' }); e.bst = 'laugh'; e.ph = T(1200); return; }
                t.lair = thiefLair(S, e.x);
                ctx.emitTo(t.pid, 'bigThief', { st: 'stole', amount: taken, lair: t.lair ? { x: t.lair.x, y: t.lair.y } : null });
                e.bst = 'flee'; e.ph = T(THIEF.fleeMs);
            });
            BM.moveEnemy(S, e, d, 0, null, c.dt); return;
        }
        if ((e.tA || 0) + T(THIEF.stuckMs) < now) {   // yo'l topolmay qoldi - tutun bilan o'yinchi orqasiga
            say('tpuff'); e.x = victim.x - (victim.x > e.x ? 120 : -120); e.y = feet; e.vy = 0; e.tA = now; e.ph = undefined; say('tpuff');
        }
        BM.moveEnemy(S, e, d, e.f * d.spd, victim, c.dt);
        const d2 = Math.abs(victim.x - e.x) + Math.abs(victim.y + 24 - e.y);
        if (e.ph === undefined || d2 < e.ph - 3) { e.ph = d2; e.tA = now; }   // yaqinlashyapti - qotib qolmagan
        return;
    }
    if (e.bst === 'steal' || e.bst === 'laugh') {   // tangalar xaltaga / tangasi yo'q - kulib qochadi
        if (t.loot === -1) { if (--e.ph! < -T(15000)) { t.loot = 0; thiefGone(S, c.room, ctx, ''); } BM.moveEnemy(S, e, d, 0, null, c.dt); return; }   // baza javobini kutadi
        if (--e.ph! <= 0) { if (e.bst === 'laugh' || !t.loot) { thiefGone(S, c.room, ctx, ''); return; } e.bst = 'flee'; e.ph = T(THIEF.fleeMs); }
        BM.moveEnemy(S, e, d, 0, null, c.dt); return;
    }
    if (e.bst === 'flee') {   // biroz qochadi, keyin tutun - uyasida paydo bo'ladi va tangalarni sochadi
        if (--e.ph! > 0) { const away = victim ? (victim.x < e.x ? 1 : -1) : e.f; e.f = away; BM.moveEnemy(S, e, d, away * d.spd, null, c.dt); return; }
        say('tpuff');
        const L = t.lair || thiefLair(S, e.x);
        if (!L) { thiefGone(S, c.room, ctx, 'escaped'); return; }
        t.lair = L; e.x = L.x; e.y = L.y; e.vx = e.vy = 0; e.ground = true; e.bst = 'lair'; t.until = now + T(THIEF.lairMs);
        say('tpuff');
        if (c.room) {   // o'g'irlangan tangalar uyada sochilib yotadi (kim yetib kelsa - oladi)
            const n = Math.max(3, Math.min(10, Math.round(t.loot / 15))), each = Math.floor(t.loot / n);
            for (let i = 0; i < n; i++) {
                const id = 'thf_' + (++S.seq), v = i === n - 1 ? t.loot - each * (n - 1) : each, x = Math.round(L.x0 + (L.x1 - L.x0) * (i + 0.5) / n);
                c.room.coins.push({ id, x, y: L.y - 18, v }); t.coins.push(id);
            }
        }
        return;
    }
    // ---- UYADA: kutadi; o'yinchi kelsa - pichoq otadi, yaqinlashsa tutun bilan chetga sakraydi ----
    if (now > t.until) { thiefGone(S, c.room, ctx, 'lost'); return; }
    const L = t.lair!, near = c.alive.filter(p => Math.abs(p.x - e.x) < 700 && Math.abs(p.y + 24 - e.y) < 260);
    let vx = 0;
    if (near.length) {
        const q = BM.nearest(near, e)!, dx = q.x - e.x, dist = Math.abs(dx);
        e.f = dx < 0 ? -1 : 1;
        if (dist < 80 && (e.cd || 0) <= 0) {   // TUTUN: o'yinchining orqasiga / chetga sakraydi
            say('tpuff'); const nx = Math.max(L.x0, Math.min(L.x1, e.x - e.f * 240)); e.x = nx === e.x ? Math.max(L.x0, Math.min(L.x1, q.x + e.f * 200)) : nx; e.cd = T(THIEF.blinkMs); say('tpuff');
        } else if (dist < 650 && Math.abs(q.y + 24 - e.y) < 60 && (e.tB || 0) <= now) {   // PICHOQ OTISH (qaragan tomonga)
            S.shots.push({ id: ++S.seq, owner: e.id, x: e.x + e.f * 16, y: e.y - 30, vx: e.f * THIEF.knifeV, vy: 0, arc: false, t: 0, k: 'p_knife', dmg: d.dmg, hr: 12, nl: true, life: T(1200) });
            e.tB = now + T(THIEF.knifeMs); say('tthrow');
        }
        if (dist < THIEF.keep - 60) vx = -e.f * d.spd * 0.6; else if (dist > THIEF.keep + 120) vx = e.f * d.spd * 0.5;
    }
    BM.moveEnemy(S, e, d, vx, null, c.dt);
    e.x = Math.max(L.x0, Math.min(L.x1, e.x));
}
SETPIECE.cointhief = thiefAI as any;
