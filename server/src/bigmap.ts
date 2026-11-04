// ===== BIG MAP: juda katta, har o'yinda tasodifiy yaratiladigan dunyo =====
// 10 px = 1 metr. Dunyo - osmonda muallaq turgan OROLLAR zanjiri: orollar orasida pog'ona-toshlar yoyi (pastga botib, yana
// ko'tariladi), o'rmonda - lianalar. Yo'l ba'zan ikkiga bo'linadi: tepadan OSMON orollari, pastdan CHUQURLIK (qorong'i tosh
// orollar, maxfiy xonalar) - keyin yana qo'shiladi. Lokatsiyalar ketma-ket: Elf qirolligi, O'rmon, ... (keyingilari keyin).
// Har lokatsiyada: 6 xil dushman, 2 boss (+ maxfiy boss), qabila qishloqlari (NPC lar - klientda), dushman lagerlari
// (oldindan turadi, har qadamda emas), maxfiy sandiqlar. Har 250 m da checkpoint (hisobga saqlanadi).
// 30 metrdan baland joydan yiqilsa - jonning yarmi ketadi, 60 metrdan - o'lim (klient qo'nishda o'lchaydi). Dushmanlar o'yinchini tepaga/pastga quvadi,
// 15 m dan uzoqlashib ko'zdan yo'qolsa - izini yo'qotadi.
import { PlayerState, RoomState } from './types';
import { bossAI, updateAreas, updateShots, SETPIECE, CREATURE, bossPre } from './bigboss';

export const BIG_GEN = 10;
// VAQTINCHA YOPIQ LOKATSIYALAR (keyingi yangilanishda ochiladi): dunyo o'zgarmaydi (progress saqlanadi) - faqat kirish yopiladi:
// zinapoya-yo'llar uchida to'siq (W.gates), portal ishlamaydi, u yerdagi checkpointda turgan o'yinchi - boshlang'ich qishloqda tug'iladi
export const BIG_CLOSED: string[] = ['lava'];
export function bigLocAt(w: { locs: { id: string, x0: number, x1: number, y0: number, y1: number }[] }, x: number, y: number): string {
    const r = w.locs.find(l => x >= l.x0 && x < l.x1 && y >= l.y0 && y < l.y1);
    return r ? r.id : '';
}
export const bigCpClosed = (w: BigWorld, i: number): boolean => { const c = w.cps[i]; return !!c && BIG_CLOSED.includes(bigLocAt(w, c.x, c.y)); };
// QAYTA TIKLANISH: tozalangan lager - 20 daqiqada, o'ldirilgan boss - 50 daqiqada (test rejimida - tezroq); qaytgan boss uchun mukofot - 30%
// LOKATSIYA KUCHI (Elf -> O'rmon -> Qor -> Botqoq -> Yer osti): oddiy dushman joni [eng kam, eng ko'p] (kuchsizi - pastida, kuchlisi - tepasida),
// har zarbasi; asosiy boss joni (g'or / osmon / maxfiy bosslar - 1.5 barobar), boss zarbasi - kamida oddiynikidan +5
export const LOC_POWER: { [loc: string]: { hp: [number, number], dmg: number, boss: number } } = {
    elf: { hp: [150, 230], dmg: 25, boss: 1600 }, forest: { hp: [200, 260], dmg: 30, boss: 1800 }, snow: { hp: [250, 310], dmg: 35, boss: 2000 },
    swamp: { hp: [300, 360], dmg: 40, boss: 2200 }, lava: { hp: [350, 410], dmg: 45, boss: 2400 } };
export const SIDE_BOSS = 1.5;
// dushman paydo bo'lganda: joni va zarba koeffitsienti (dk) - lokatsiyasiga qarab (o'qlari / olovi / ildizlari ham shu koeffitsient bilan)
function powerUp(S: BigState, e: BigEnemy, d: EnemyDef): void {
    const z = S.w.zones.find(q => q.id === e.zone), P = z && LOC_POWER[z.loc];
    if (!P || e.k === 'zvfarm' || e.k === 'hgoal') return;   // ferma boshqaruvchisi - joni = qolgan zombilar soni; xokkey darvozasi - jonsiz (zarbani xokkeychiga o'tkazadi)
    if (d.boss) {
        const L = BIG_LOCS.find(l => l.id === z!.loc), main = !!L && L.bosses.includes(e.k) && !d.secret;
        e.hp = e.mx = Math.round(P.boss * (main ? 1 : SIDE_BOSS));
        e.dk = Math.max(1, (P.dmg + 5) / Math.max(1, d.dmg));
    } else {
        const t = Math.max(0, Math.min(1, (d.hp - 50) / 250));
        e.hp = e.mx = Math.round(P.hp[0] + (P.hp[1] - P.hp[0]) * t);
        e.dk = P.dmg / Math.max(1, d.shot && !d.reach ? d.shot.dmg : d.dmg);
    }
    S.dkm[e.id] = e.dk;
}
// QUTI O'LCHAMLARI: kichik, o'rta, katta, juda katta (joyiga qarab xesh bilan tanlanadi)
export const CRATE_SIZES = [24, 32, 40, 52];
function crateSize(x: number, k: number): number {
    let t = Math.imul((x | 0) ^ 0x9E3779B1, 0x85EBCA6B) ^ Math.imul(k + 0x632BE5AB, 0xC2B2AE35); t ^= t >>> 15; t = Math.imul(t, 0x27D4EB2F); t ^= t >>> 13;
    return CRATE_SIZES[(t >>> 0) % CRATE_SIZES.length];
}
// quti sinsa: shu ehtimol bilan tanga (1 dan 10 tagacha) - hammasidan chiqmaydi
export const CRATE_DROP = { chance: 0.6, min: 1, max: 10 };
export const RESPAWN = { camp: 20 * 60000, boss: 50 * 60000, campFast: 30000, bossFast: 60000, again: 0.3 };   // dunyo generatori versiyasi (o'zgartirilganda oshiriladi)
export const BIG = {
    M: 10,                    // px / metr
    cpEvery: 2000,            // checkpoint oralig'i (200 m)
    fallHurt: 300,            // shundan baland (30 m) yiqilish - jonning yarmi ketadi (o'lmaydi)
    fallDeath: 600,           // 60 m dan baland - o'lim
    loseDist: 150,            // 15 m: shundan uzoqlashib ko'zdan yo'qolsa - iz yo'qoladi
    sight: 520, sightY: 260,  // dushman ko'radigan masofa
    hi: -720, mid: -280, lo: 160,   // orollar tepasi: osmon yo'li, asosiy yo'l, chuqurlik yo'li
    skyY: -540, underY: 40,         // qavat chegaralari (HUD, dushman turi)
    top: -1800, abyss: 1000,        // dunyoning tepa / pastki chegarasi (pastga tushib ketgan - o'ldi)
    respawnTicks: 100,        // o'lgan qahramon ~3 s dan keyin checkpointda tiriladi
    // pog'onalar: yuqoriga <= stepUp (sakrash ~133 px), pastga <= stepDown, oraliq gapMin..gapMax (yugurib sakrab yetiladi)
    stepUp: 88, stepDown: 120, gapMin: 64, gapMax: 128,
    campGap: 800              // dushman lagerlari orasidagi eng kam masofa (yo'lda har qadamda chiqmasin)
};
// DUNYO TO'RI: qatorlar orasi (tepa / o'rta / past), qatlamlar orasi (Elf - Botqoq - Yer osti), birinchi qatlam o'rta qatori, dunyo tubi
export const NET = { rowGap: 560, bandGap: 2240, mid0: -280, bottom: 5600 };
// enemies tartibi - rollar: [yaqin jangchi, otuvchi, og'ir, uchuvchi, mayda, sehrgar]
// extra - real hayotda yo'q to'qima maxluqlar: [uchuvchi otuvchi, og'ir, sehrli]; season - season xaritalaridan mehmonlar, cave - g'or bossi
export const BIG_LOCS: { id: string, enemies: string[], extra: string[], bosses: string[], secretBoss: string, npcs: string[], season: string[], cave: string, skyBoss?: string, secretRoom?: string }[] = [
    // ELF QIROLLIGI: qishloqlarni o'g'ri-talonchilar (pichoqchi, kamonchi, kachok - qalqonli) va yovuz sehrgar elflar bosgan; mimik sandiqlar.
    // Bosslar: katta g'ordagi ROBOT ILON (teshigi oldida E - chiqadi), eski o'tloqdagi SEMIZ ELF (topshiriq), maxfiy - SAMBOCHI ELF
    { id: 'elf', enemies: ['tknife', 'tarcher', 'tbrute', 'darkelf', 'tknife', 'darkelf'], extra: ['darkelf', 'tbrute', 'tarcher'], bosses: ['fatelf'], secretBoss: 'sambo', season: ['tknife', 'tarcher', 'tbrute'], cave: 'rsnake',
        npcs: ['guard', 'merchant', 'smith', 'farmer', 'kid'] },
    // O'RMON: lagerlarda ovchilar (nayzachi, ikki pichoqli, qalqon-qilichli) va tirnoqli kaltakesaklar (til bilan tortadi, ko'rinmas bo'lib yaqinlashadi).
    // Bosslar: 1-maydonda BAHAYBAT DARAXT (qimirlamaydi; ildizlar, tikanli olmalar, butun yer ildiz - pog'onaga chiqib qutuladi), tepadagi tosh GROTODA - GORILA ROCK (S1 map-8 zali), g'orda - kaltakesak uyasi,
    // 2-maydonda FERMA (maxfiy: sabzi oldida E - 15 ta zombi sabzavot, hamma joyga quvadi); yer ostidagi maxfiy xonada - mimiklar
    { id: 'forest', enemies: ['hknives', 'hspear', 'hshield', 'lizard', 'lizard', 'hspear'], extra: ['hspear', 'hshield', 'lizard'], bosses: ['bigtree', 'zvfarm'], secretBoss: 'zvfarm', secretRoom: 'mimic', season: ['hknives', 'lizard', 'flower'], cave: '', skyBoss: 'gorilla',
        npcs: ['hunter', 'shaman', 'gatherer', 'elder', 'kid'] },
    // QOR BAZASI: muz orollar (sirpanchiq), qor bo'roni, qor to'plari (o'yinchi ham otadi). Oddiylar: QOR BOLA (muzli qor otadi), MUZ TARAN (bir qo'li ulkan -
    // gorilladek yuradi, o'yinchi ustiga sakraydi), qorli KULBA-MIMIK (yaqin kelsa - qisqichbaqa oyoqlari va ulkan muz qisqichlari chiqadi; doim yolg'iz,
    // atrofida boshqa dushman yo'q). Qorda har guruhda ko'pi bilan 3 ta dushman.
    // Bosslar: ALTER QOR BOBO (o'rtadagi archa oldida hamma E bosib sovg'a oladi - keyin jang), ROBOT BIGFUT (faqat yuziga o'q tegadi),
    // yer ostidagi maxfiy xonada - MUZ XOKKEYCHI (joni faqat darvozaga otilganda ketadi); g'orda boss yo'q - qor bola / muz taran uyasi
    { id: 'snow', enemies: ['iceram', 'snowkid', 'iceram', 'snowkid', 'snowkid', 'snowkid'], extra: ['snowkid', 'iceram', 'snowkid'], bosses: ['santa', 'bigfoot'], secretBoss: 'hockey', season: ['snowkid', 'iceram', 'snowkid'], cave: '',
        npcs: ['trapper', 'shaman', 'fisher', 'elder', 'kid'] },
    // YER OSTI OLAMI: qorong'i g'or-dunyo (faqat yorug'lik atrofi ko'rinadi), lava ko'llari (kuydiradi), olov favvoralari,
    // lava ko'lmagi bo'lib yotgan maxluq; g'orda - Magma qurti. Qishloqda konchilar bilan birga UnderWorld trollari va kubik maxluqlar (tinch aholi)
    { id: 'lava', enemies: ['emberling', 'bonearcher', 'magmabrute', 'firebat', 'emberbeetle', 'cultist'], extra: ['gazer', 'magmacrab', 'magmablob'], bosses: ['magmatitan', 'boneking'], secretBoss: 'hellhound', season: ['emberling', 'bonearcher', 'magmabrute'], cave: 'magmaworm',
        npcs: ['miner', 'smith', 'troll', 'shaman', 'blocky', 'elder', 'blockyo', 'kid'] },
    // BOTQOQ: yer ostidan PASTGA tushiladi (butun yo'l ~36 m pastda). Loy (sekinlashtiradi), zaharli gaz, tuman, lianalar.
    // Oddiylar: YOVVOYI QUL (katta og'zi bilan tishlaydi), QORA KAPISHON (faqat sariq ko'zlari; o'yinchi ostidan tomir chiqaradi), bo'sh joyda yolg'iz MIMIK TO'NKA.
    // Bosslar: BAHAYBAT GUL (balchiq ko'li o'rtasida, uch qator pog'ona; faqat BOSHIGA tegadi), BALOT MAGI (yengilgach - tinch qo'shni: suhbat, simpatiya,
    // quchoqlash, arg'imchoq), maxfiy - BALOT KRABI (xona polidagi balchiqda toshlar orasida SOXTA TOSH; faqat qobig'iga tegadi)
    { id: 'swamp', enemies: ['wildslave', 'hoodroot', 'wildslave', 'hoodroot', 'wildslave', 'hoodroot'], extra: ['hoodroot', 'wildslave', 'wildslave'], bosses: ['bigflower', 'swampmage'], secretBoss: 'bogcrab', season: ['zveg', 'flower', 'wildslave'], cave: '',   // g'or bossi yo'q (Elder Croc olib tashlangan) - g'orda dushmanlar uyasi
        npcs: ['fisher', 'herbalist', 'boatman', 'elder', 'kid'] }
];
// Lokatsiya uslubi: orol / tosh turlari, bezaklar, uylar, lager, boss maydoni, osmon va chuqurlik bezaklari, o'ziga xosliklar
interface LocStyle { ground: string, sky: string, deep: string, stone: string, ice?: string, slick?: string, decor: string[], houses: string[], shop: string, seller: string,
    tent: string, camp2: string, arena: string, skyProps: string[], deepProps: string[], vines?: boolean, snow?: boolean, castle?: boolean, lava?: boolean, cloud?: string,
    bog?: boolean, lake?: boolean, dy?: number, dyLo?: number, down?: boolean, vineTree?: string }   // dy - yo'l balandligi siljishi (botqoq pastda), lake - kraken ko'li
export const STYLE: { [loc: string]: LocStyle } = {
    elf: { ground: 'cobble', sky: 'skyrock', deep: 'deepbrick', stone: 'stone', decor: ['tree', 'lamp', 'banner', 'flowers', 'fence', 'well', 'cart', 'tree', 'bush'],
        houses: ['house', 'house2', 'stall', 'tower', 'well', 'statue', 'banner', 'lamp', 'house', 'stall'], shop: 'shopstall', seller: 'merchant', tent: 'gobtent', camp2: 'crates', arena: 'pillar',
        skyProps: ['flag', 'crystal', 'ruin'], deepProps: ['torch', 'pipe', 'bones', 'barrel', 'crystal'], castle: true },
    forest: { ground: 'grass', sky: 'skygrass', deep: 'deeproot', stone: 'mossstone', decor: ['bigtree', 'pine', 'bush', 'mushroom', 'log', 'rock', 'flowers', 'pine', 'fern'],
        houses: ['hut', 'hut2', 'totem', 'campfire', 'tent', 'drying', 'hut', 'pine', 'totem'], shop: 'shophut', seller: 'gatherer', tent: 'tent', camp2: 'log', arena: 'bones',
        skyProps: ['nest', 'mushroom', 'flowers'], deepProps: ['crystal', 'glowshroom', 'roots', 'bones'], vines: true },
    snow: { ground: 'snow', sky: 'skyice', deep: 'deepice', stone: 'snowstone', ice: 'ice', slick: 'icestone', decor: ['snowpine', 'snowpine', 'snowman', 'icecrystal', 'rock', 'icelamp', 'sled', 'snowpine'],
        houses: ['igloo', 'igloo', 'furtent', 'icelamp', 'snowman', 'sled', 'totem', 'fishhole', 'snowpine'], shop: 'shopigloo', seller: 'fisher', tent: 'furtent', camp2: 'sled', arena: 'icepillar',
        skyProps: ['icecrystal', 'flag', 'snowman'], deepProps: ['icecrystal', 'torch', 'bones', 'icecrystal'], snow: true },
    // osmon yo'li o'rniga - g'or shiftidagi muallaq qoyalar (bulut o'rniga ostidan lava tomib turgan toshlar)
    lava: { ground: 'basalt', sky: 'skybasalt', deep: 'deeplava', stone: 'basaltstone', cloud: 'emberstone', decor: ['stalagmite', 'glowshroom', 'lavarock', 'skull', 'crystal', 'stalagmite', 'lantern', 'lavapuddle'],
        houses: ['minehut', 'minehut', 'forge', 'lantern', 'minecart', 'mushhouse', 'stalagmite', 'lantern', 'mushhouse'], shop: 'shopcart', seller: 'trader', tent: 'skulltent', camp2: 'bones', arena: 'lavapillar',
        skyProps: ['crystal', 'lantern', 'stalagmite'], deepProps: ['crystal', 'torch', 'skull', 'glowshroom'], lava: true },
    swamp: { ground: 'mud', sky: 'skymoss', deep: 'deepbog', stone: 'bogstone', cloud: 'fogcloud', decor: ['deadtree', 'reeds', 'cattail', 'swamplog', 'lilyflower', 'bogrock', 'reeds', 'mushroom'],
        houses: ['stilthut', 'stilthut2', 'dock', 'fishnet', 'swamplamp', 'boat', 'reeds', 'stilthut', 'cattail'], shop: 'shopboat', seller: 'herbalist', tent: 'bogtent', camp2: 'swamplog', arena: 'bogtotem',
        skyProps: ['deadtree', 'swamplamp', 'mushroom'], deepProps: ['glowshroom', 'torch', 'bones', 'crystal'], vines: true, vineTree: 'deadtree', bog: true, lake: true, dy: 360, dyLo: 180, down: true }
};
// yuriladigan asosiy orol tepalari (checkpoint shularga qo'yiladi)
export const GROUND_K = ['cobble', 'grass', 'snow', 'ice', 'basalt', 'mud'];
// BOTQOQ: kraken ko'li suvi (chuqur - jon oladi), zaharli gaz (zarar + sekinlashadi)
export const SWAMP = { waterDmg: 6, waterMs: 600, gasDmg: 10, gasSlowMs: 1800 };
// YER OSTI: lava ko'lida turgan kuyadi (har 0.5 s), olov favvorasi - har ~4 s (oldin belgi)
export const LAVA = { dmg: 9, everyMs: 500, ventMs: 4200, ventDmg: 16 };
// BIG MAP DO'KONI (qishloqdagi rasta): sarguzasht uchun buyumlar - sotib olinganda darhol ishlaydi. ms - ta'sir davomiyligi
export const BIG_SHOP: { id: string, price: number, ms?: number }[] = [
    { id: 'potion', price: 40 },                     // jonning 50% i darhol tiklanadi
    { id: 'energy', price: 25 },                     // energiya (stamina) darhol to'ladi
    { id: 'battery', price: 90, ms: 30000 },         // 30 s energiya umuman tugamaydi
    { id: 'armor', price: 100 },                     // 150 birlik zirh: o'q / tosh zararini o'ziga oladi (yerdan chiqqan va tishlash - jondan)
    { id: 'strength', price: 140, ms: 120000 },      // 2 daqiqa zarba 40% kuchli
    { id: 'feather', price: 70, ms: 90000 },         // 90 s yiqilishdan zarar yo'q
    { id: 'phoenix', price: 250 }                    // keyingi o'limda shu joyning o'zida 50% jon bilan tiriladi (bir marta)
];
export const buffOn = (p: PlayerState, k: 'battery' | 'strength' | 'feather') => !!p.buffs && (p.buffs[k] || 0) > Date.now();
export const ARMOR = { add: 150, max: 300 };
// Dushmanlar: w/h - tana (klientdagi rasm o'lchamiga mos), spd - yurish, jump - sakrash tezligi, shot - otadi, fly - uchadi
export interface EnemyDef { hp: number; spd: number; dmg: number; w: number; h: number; jump: number; reach: number; atkMs: number; coins: number;
    shot?: { spd: number, cdMs: number, dmg: number, arc?: boolean }; fly?: boolean; armor?: number; boss?: boolean; secret?: boolean;
    lurk?: number; xp?: number; sway?: number; guard?: number[]; }   // guard - [ehtimol, ms, kutish ms]: otilsa / urilsa qalqon ko'taradi (oldidan kelganini to'sadi)   // sway - suvda u yoq-bu yoqqa chayqalish (kraken)   // lurk - yashirinib (sandiq / haykal bo'lib) turadi, shu masofaga kelsa uyg'onadi; xp - o'ldirganga tajriba
export const ENEMIES: { [k: string]: EnemyDef } = {
    // ELF QIROLLIGI (qirollikka bostirib kirganlar)
    goblin:    { hp: 70,  spd: 120, dmg: 10, w: 28, h: 44, jump: 520, reach: 36, atkMs: 900,  coins: 4 },
    gobarcher: { hp: 55,  spd: 90,  dmg: 8,  w: 28, h: 44, jump: 500, reach: 0,  atkMs: 0,    coins: 5, shot: { spd: 420, cdMs: 1900, dmg: 9 } },
    orc:       { hp: 220, spd: 70,  dmg: 22, w: 40, h: 62, jump: 440, reach: 48, atkMs: 1400, coins: 10, armor: 0.3 },
    bat:       { hp: 35,  spd: 170, dmg: 7,  w: 36, h: 24, jump: 0,   reach: 28, atkMs: 800,  coins: 3, fly: true },
    rat:       { hp: 28,  spd: 190, dmg: 6,  w: 40, h: 22, jump: 420, reach: 24, atkMs: 600,  coins: 2 },
    darkmage:  { hp: 90,  spd: 70,  dmg: 14, w: 28, h: 56, jump: 480, reach: 0,  atkMs: 0,    coins: 8, shot: { spd: 330, cdMs: 2300, dmg: 15 } },
    warlord:   { hp: 1700, spd: 110, dmg: 26, w: 88, h: 125, jump: 600, reach: 92, atkMs: 1200, coins: 120, boss: true, armor: 0.2 },
    shadowknight: { hp: 1900, spd: 150, dmg: 24, w: 50, h: 100, jump: 620, reach: 66, atkMs: 1000, coins: 150, boss: true, shot: { spd: 520, cdMs: 2600, dmg: 18 } },
    golem:     { hp: 2800, spd: 60,  dmg: 34, w: 126, h: 156, jump: 640,   reach: 120, atkMs: 1800, coins: 300, boss: true, secret: true, armor: 0.35 },
    // O'RMON
    wolf:      { hp: 80,  spd: 210, dmg: 12, w: 50, h: 34, jump: 560, reach: 36, atkMs: 800,  coins: 5 },
    spider:    { hp: 60,  spd: 140, dmg: 10, w: 48, h: 30, jump: 640, reach: 32, atkMs: 900,  coins: 5 },
    frog:      { hp: 50,  spd: 80,  dmg: 9,  w: 34, h: 28, jump: 600, reach: 0,  atkMs: 0,    coins: 4, shot: { spd: 380, cdMs: 2100, dmg: 10, arc: true } },
    treant:    { hp: 280, spd: 50,  dmg: 24, w: 40, h: 72, jump: 0,   reach: 54, atkMs: 1600, coins: 12, armor: 0.35 },
    hornet:    { hp: 30,  spd: 190, dmg: 8,  w: 30, h: 22, jump: 0,   reach: 26, atkMs: 700,  coins: 3, fly: true },
    bandit:    { hp: 75,  spd: 100, dmg: 9,  w: 28, h: 50, jump: 520, reach: 0,  atkMs: 0,    coins: 7, shot: { spd: 560, cdMs: 1800, dmg: 11 } },
    alpha:     { hp: 1700, spd: 230, dmg: 24, w: 90, h: 54, jump: 680, reach: 62, atkMs: 1000, coins: 130, boss: true },
    ancient:   { hp: 2600, spd: 40,  dmg: 30, w: 135, h: 190, jump: 0,  reach: 125, atkMs: 1700, coins: 170, boss: true, armor: 0.3, shot: { spd: 300, cdMs: 2000, dmg: 16, arc: true } },
    // ELF QIROLLIGI: O'G'RI-TALONCHILAR (kapishon, yuzi ko'rinmaydi - faqat oq ko'zlar; qilich / pichoq va qalqon) va YOVUZ SEHRGAR ELF
    // O'RMON: ovchilar va kaltakesak; bosslar - bahaybat daraxt, zombi-sabzavot fermasi (boshqaruvchi: ko'rinmas, joni = qolgan zombilar)
    hspear:    { hp: 80,  spd: 95,  dmg: 9,  w: 28, h: 48, jump: 520, reach: 0,  atkMs: 0,    coins: 7, shot: { spd: 560, cdMs: 2300, dmg: 14, arc: true } },   // nayzachi: uzoqdan nayza otadi
    hknives:   { hp: 95,  spd: 150, dmg: 8,  w: 28, h: 48, jump: 580, reach: 40, atkMs: 600,  coins: 7 },                                  // ikki pichoqli: tez-tez tilib uradi
    hshield:   { hp: 240, spd: 80,  dmg: 18, w: 34, h: 54, jump: 480, reach: 50, atkMs: 1200, coins: 12, armor: 0.2, guard: [0.5, 1500, 2400] },   // qalqon-qilichli
    lizard:    { hp: 130, spd: 140, dmg: 16, w: 84, h: 56, jump: 540, reach: 64, atkMs: 900,  coins: 9 },   // bahaybat: tik turganda o'yinchidan ikki barobar baland                                  // tirnoqli kaltakesak
    bigtree:   { hp: 4200, spd: 0,  dmg: 26, w: 170, h: 300, jump: 0, reach: 0, atkMs: 9999, coins: 260, boss: true, armor: 0.15 },
    zvfarm:    { hp: 15,  spd: 0,   dmg: 0,  w: 10, h: 10, jump: 0, reach: 0, atkMs: 9999, coins: 420, boss: true, secret: true },
    tknife:    { hp: 90,  spd: 135, dmg: 12, w: 28, h: 46, jump: 560, reach: 38, atkMs: 850,  coins: 6, guard: [0.35, 1200, 2400] },
    tarcher:   { hp: 75,  spd: 95,  dmg: 9,  w: 28, h: 46, jump: 520, reach: 0,  atkMs: 0,    coins: 7, shot: { spd: 460, cdMs: 1900, dmg: 11 }, guard: [0.35, 1200, 2400] },
    tbrute:    { hp: 300, spd: 75,  dmg: 24, w: 40, h: 58, jump: 470, reach: 54, atkMs: 1400, coins: 14, armor: 0.25, guard: [0.45, 1600, 2600] },
    darkelf:   { hp: 110, spd: 85,  dmg: 15, w: 30, h: 52, jump: 0,   reach: 0,  atkMs: 0,    coins: 10, fly: true, shot: { spd: 330, cdMs: 2200, dmg: 15 } },   // havoda muallaq turadi, to'g'ri uchadigan qora sehr
    rsnake:    { hp: 3200, spd: 0,  dmg: 30, w: 220, h: 190, jump: 0, reach: 0, atkMs: 0, coins: 300, boss: true },   // S1 ROBOT ILON (g'orda): tana - bosh (o'q faqat boshiga tegadi)
    sambo:     { hp: 3000, spd: 150, dmg: 30, w: 66, h: 108, jump: 720, reach: 70, atkMs: 1100, coins: 330, boss: true, secret: true, armor: 0.2 },   // SAMBOCHI ELF: ushlab "na progib" tashlaydi, ustiga sakraydi, tosh otadi
    // SEASON XARITALARIDAN MEHMONLAR (rasmlari o'sha xaritalardagi bilan bir xil)
    troll:     { hp: 320, spd: 60,  dmg: 26, w: 54, h: 104, jump: 420, reach: 62, atkMs: 1600, coins: 16, armor: 0.3 },      // S1: UnderWorld trolli
    blocky:    { hp: 50,  spd: 130, dmg: 8,  w: 44, h: 42, jump: 600, reach: 30, atkMs: 800,  coins: 4 },                    // S1: UnderWorld kubik maxluq
    zveg:      { hp: 75,  spd: 70,  dmg: 11, w: 36, h: 72, jump: 480, reach: 40, atkMs: 1000, coins: 6, lurk: 230 },        // S2 "Farm": zombi sabzavot - yerdan chiqadi, til otadi
    flower:    { hp: 170, spd: 0,   dmg: 22, w: 54, h: 120, jump: 0,  reach: 0, atkMs: 0, coins: 18, lurk: 260, xp: 15 },   // S1 "UnderWorld": odamxo'r gul - yaqin kelsa yerdan chiqadi, tishlab nari otadi
    fatelf:    { hp: 2200, spd: 70, dmg: 26, w: 80, h: 116, jump: 420, reach: 70, atkMs: 1300, coins: 200, boss: true, shot: { spd: 360, cdMs: 2400, dmg: 16, arc: true } },   // S1: Semiz elf
    gorilla:   { hp: 2500, spd: 120, dmg: 30, w: 120, h: 136, jump: 680, reach: 92, atkMs: 1200, coins: 220, boss: true, armor: 0.2 },   // S1: Gorila Rock
    kraken:    { hp: 2600, spd: 0,  dmg: 28, w: 80, h: 80, jump: 0,  reach: 0, atkMs: 0, coins: 300, boss: true },   // S2: Legendary Kraken - S2 dagidek: ko'ldan chiqadi, faqat QIZIL KO'ZI zarar oladi (w/h - ko'z, e.y - ko'z osti)
    skyship:   { hp: 2200, spd: 90, dmg: 20, w: 240, h: 120, jump: 0,  reach: 0,  atkMs: 0,    coins: 240, boss: true, fly: true, shot: { spd: 420, cdMs: 2000, dmg: 15 } },   // S2: Sky Battle kemasi
    // TO'QIMA MAXLUQLAR
    imp:       { hp: 45,  spd: 160, dmg: 8,  w: 30, h: 30, jump: 0,   reach: 0,  atkMs: 0,    coins: 5, fly: true, shot: { spd: 360, cdMs: 2200, dmg: 10 } },
    gargoyle:  { hp: 160, spd: 130, dmg: 16, w: 44, h: 40, jump: 0,   reach: 36, atkMs: 1100, coins: 14, fly: true, armor: 0.4, lurk: 170 },
    slime:     { hp: 90,  spd: 70,  dmg: 11, w: 40, h: 30, jump: 560, reach: 34, atkMs: 900,  coins: 6 },
    mimic:     { hp: 140, spd: 160, dmg: 18, w: 40, h: 34, jump: 560, reach: 42, atkMs: 900,  coins: 30, armor: 0.15, lurk: 110, xp: 15 },
    wisp:      { hp: 40,  spd: 140, dmg: 9,  w: 26, h: 26, jump: 0,   reach: 0,  atkMs: 0,    coins: 5, fly: true, shot: { spd: 300, cdMs: 2000, dmg: 9 } },
    thornback: { hp: 260, spd: 90,  dmg: 20, w: 56, h: 40, jump: 480, reach: 48, atkMs: 1300, coins: 14, armor: 0.3 },
    myconid:   { hp: 90,  spd: 60,  dmg: 12, w: 32, h: 46, jump: 400, reach: 0,  atkMs: 0,    coins: 8, shot: { spd: 300, cdMs: 2400, dmg: 12, arc: true } },
    // QOR BAZASI
    frostling: { hp: 70,  spd: 125, dmg: 10, w: 28, h: 44, jump: 520, reach: 38, atkMs: 900,  coins: 4 },
    snowballer: { hp: 95, spd: 80,  dmg: 9,  w: 34, h: 50, jump: 480, reach: 0,  atkMs: 0,    coins: 6, shot: { spd: 380, cdMs: 2000, dmg: 9, arc: true } },
    yeti:      { hp: 260, spd: 85,  dmg: 22, w: 46, h: 66, jump: 500, reach: 52, atkMs: 1400, coins: 12, armor: 0.25 },
    frostbat:  { hp: 35,  spd: 175, dmg: 7,  w: 36, h: 24, jump: 0,   reach: 28, atkMs: 800,  coins: 3, fly: true },
    icecrawler: { hp: 30, spd: 185, dmg: 6,  w: 40, h: 22, jump: 420, reach: 24, atkMs: 600,  coins: 3 },
    frostmage: { hp: 90,  spd: 70,  dmg: 14, w: 28, h: 56, jump: 480, reach: 0,  atkMs: 0,    coins: 8, shot: { spd: 340, cdMs: 2300, dmg: 14 } },
    wraith:    { hp: 50,  spd: 150, dmg: 9,  w: 30, h: 34, jump: 0,   reach: 0,  atkMs: 0,    coins: 6, fly: true, shot: { spd: 320, cdMs: 2100, dmg: 10 } },
    icegolem:  { hp: 320, spd: 55,  dmg: 26, w: 50, h: 64, jump: 400, reach: 54, atkMs: 1600, coins: 15, armor: 0.45 },
    snowman:   { hp: 110, spd: 90,  dmg: 12, w: 34, h: 48, jump: 460, reach: 0,  atkMs: 0,    coins: 20, lurk: 150, xp: 15, shot: { spd: 400, cdMs: 1700, dmg: 10, arc: true } },
    yetiking:  { hp: 2200, spd: 115, dmg: 28, w: 95, h: 130, jump: 640, reach: 95, atkMs: 1200, coins: 150, boss: true, armor: 0.2 },
    icequeen:  { hp: 1900, spd: 135, dmg: 22, w: 46, h: 100, jump: 620, reach: 60, atkMs: 1000, coins: 170, boss: true, shot: { spd: 480, cdMs: 2400, dmg: 16 } },
    mammoth:   { hp: 3200, spd: 95,  dmg: 34, w: 165, h: 135, jump: 540, reach: 125, atkMs: 1700, coins: 330, boss: true, secret: true, armor: 0.3 },
    spiderqueen: { hp: 2800, spd: 150, dmg: 28, w: 96, h: 54, jump: 700, reach: 72, atkMs: 1100, coins: 320, boss: true, secret: true, shot: { spd: 420, cdMs: 1700, dmg: 14 } },
    // YER OSTI OLAMI
    emberling: { hp: 70,  spd: 130, dmg: 10, w: 28, h: 44, jump: 520, reach: 36, atkMs: 900,  coins: 4 },
    bonearcher: { hp: 60, spd: 85,  dmg: 9,  w: 28, h: 50, jump: 500, reach: 0,  atkMs: 0,    coins: 6, shot: { spd: 440, cdMs: 1900, dmg: 10 } },
    magmabrute: { hp: 300, spd: 60, dmg: 24, w: 50, h: 64, jump: 420, reach: 54, atkMs: 1500, coins: 13, armor: 0.35 },
    firebat:   { hp: 35,  spd: 175, dmg: 8,  w: 36, h: 24, jump: 0,   reach: 28, atkMs: 800,  coins: 3, fly: true },
    emberbeetle: { hp: 30, spd: 190, dmg: 6, w: 40, h: 22, jump: 420, reach: 24, atkMs: 600,  coins: 3 },
    cultist:   { hp: 90,  spd: 70,  dmg: 14, w: 28, h: 56, jump: 480, reach: 0,  atkMs: 0,    coins: 8, shot: { spd: 340, cdMs: 2300, dmg: 15 } },
    gazer:     { hp: 55,  spd: 120, dmg: 10, w: 34, h: 34, jump: 0,   reach: 0,  atkMs: 0,    coins: 7, fly: true, shot: { spd: 380, cdMs: 2200, dmg: 11 } },
    magmacrab: { hp: 280, spd: 95,  dmg: 20, w: 56, h: 36, jump: 460, reach: 46, atkMs: 1200, coins: 14, armor: 0.4 },
    magmablob: { hp: 110, spd: 80,  dmg: 12, w: 40, h: 30, jump: 520, reach: 0,  atkMs: 0,    coins: 20, lurk: 140, xp: 15, shot: { spd: 380, cdMs: 1800, dmg: 11, arc: true } },   // lava ko'lmagi bo'lib yotadi
    magmatitan: { hp: 2500, spd: 95, dmg: 30, w: 112, h: 154, jump: 600, reach: 110, atkMs: 1400, coins: 170, boss: true, armor: 0.25 },
    boneking:  { hp: 2000, spd: 125, dmg: 24, w: 50, h: 104, jump: 620, reach: 64, atkMs: 1000, coins: 180, boss: true, shot: { spd: 460, cdMs: 2300, dmg: 16 } },
    hellhound: { hp: 3200, spd: 200, dmg: 30, w: 112, h: 64, jump: 700, reach: 74, atkMs: 1000, coins: 340, boss: true, secret: true },
    magmaworm: { hp: 2700, spd: 140, dmg: 28, w: 182, h: 94, jump: 0,   reach: 100, atkMs: 1300, coins: 270, boss: true, armor: 0.2 },    // yer osti g'ori: ulkan magma qurti
    // QOR BAZASI (yangi): qor bola, muz taran, kulba-mimik; bosslar - Alter Qor Bobo (2 o'yinchi bo'yi), Robot Bigfut (w/h - YUZI: o'q faqat unga tegadi),
    // Muz xokkeychi (o'qni klyushkasi bilan qaytaradi - joni faqat DARVOZAGA otilganda ketadi; darvoza - alohida jonsiz "dushman")
    snowkid:   { hp: 85,  spd: 100, dmg: 9,  w: 26, h: 40, jump: 520, reach: 0,  atkMs: 0,    coins: 6, shot: { spd: 400, cdMs: 2000, dmg: 11, arc: true } },
    iceram:    { hp: 240, spd: 80,  dmg: 20, w: 80, h: 84, jump: 560, reach: 66, atkMs: 1300, coins: 12, armor: 0.2 },   // o'yinchidan katta
    hutmimic:  { hp: 200, spd: 110, dmg: 18, w: 96, h: 90, jump: 440, reach: 84, atkMs: 1000, coins: 25, armor: 0.25, lurk: 180, xp: 15 },   // ikki o'yinchi bo'yi
    santa:     { hp: 2000, spd: 90, dmg: 30, w: 66, h: 96, jump: 0,   reach: 0,  atkMs: 9999, coins: 200, boss: true, armor: 0.15 },
    bigfoot:   { hp: 2600, spd: 55, dmg: 32, w: 72, h: 54, jump: 0,   reach: 0,  atkMs: 9999, coins: 240, boss: true },   // w/h - yuzi (bigfoot.png: ustun 103..125, qator 43..59)
    hockey:    { hp: 3000, spd: 230, dmg: 28, w: 60, h: 96, jump: 600, reach: 80, atkMs: 900, coins: 330, boss: true, secret: true },
    hgoal:     { hp: 1,   spd: 0,   dmg: 0,  w: 76, h: 70, jump: 0,   reach: 0,  atkMs: 9999, coins: 0 },
    // BOTQOQ
    bogling:   { hp: 75,  spd: 120, dmg: 11, w: 28, h: 46, jump: 520, reach: 38, atkMs: 900,  coins: 5 },
    spitter:   { hp: 65,  spd: 80,  dmg: 9,  w: 34, h: 40, jump: 560, reach: 0,  atkMs: 0,    coins: 6, shot: { spd: 380, cdMs: 2000, dmg: 10, arc: true } },
    mudgolem:  { hp: 320, spd: 55,  dmg: 24, w: 50, h: 64, jump: 400, reach: 54, atkMs: 1600, coins: 14, armor: 0.3 },
    mosquito:  { hp: 30,  spd: 185, dmg: 7,  w: 30, h: 24, jump: 0,   reach: 26, atkMs: 700,  coins: 3, fly: true },
    leech:     { hp: 30,  spd: 150, dmg: 6,  w: 40, h: 20, jump: 380, reach: 24, atkMs: 600,  coins: 3 },
    bogwitch:  { hp: 95,  spd: 70,  dmg: 14, w: 28, h: 56, jump: 480, reach: 0,  atkMs: 0,    coins: 9, shot: { spd: 340, cdMs: 2300, dmg: 15 } },
    bogspirit: { hp: 50,  spd: 140, dmg: 9,  w: 30, h: 34, jump: 0,   reach: 0,  atkMs: 0,    coins: 6, fly: true, shot: { spd: 320, cdMs: 2100, dmg: 10 } },
    snapper:   { hp: 300, spd: 70,  dmg: 22, w: 56, h: 36, jump: 440, reach: 48, atkMs: 1300, coins: 15, armor: 0.45 },
    boglurker: { hp: 130, spd: 150, dmg: 16, w: 60, h: 26, jump: 480, reach: 44, atkMs: 900,  coins: 22, lurk: 130, xp: 15 },   // xoda bo'lib yotgan timsoh
    hydra:     { hp: 2600, spd: 80,  dmg: 26, w: 160, h: 160, jump: 0, reach: 125, atkMs: 1200, coins: 200, boss: true, armor: 0.2, shot: { spd: 400, cdMs: 2200, dmg: 15 } },
    toadking:  { hp: 3300, spd: 110, dmg: 32, w: 148, h: 122, jump: 700, reach: 105, atkMs: 1300, coins: 340, boss: true, secret: true, shot: { spd: 380, cdMs: 2400, dmg: 15, arc: true } },
    // boss yordamchilari: soya egizagi (7 s yashaydi), o'rgimchak tuxumi (4 s da yorilib, o'rgimchaklar chiqadi)
    shade:     { hp: 120, spd: 190, dmg: 14, w: 50, h: 100, jump: 620, reach: 60, atkMs: 800,  coins: 0, xp: 2 },
    eggsac:    { hp: 50,  spd: 0,   dmg: 0,  w: 30, h: 30,  jump: 0,   reach: 0,  atkMs: 0,    coins: 2, xp: 2 },
    // BOTQOQ (yangi): yovvoyi qul, qora kapishon, mimik to'nka; bosslar - bahaybat gul (w/h - BOSHI), Balot Magi, Balot Krabi (w/h - QOBIG'I)
    wildslave: { hp: 160, spd: 120, dmg: 16, w: 32, h: 52, jump: 540, reach: 46, atkMs: 1000, coins: 8 },
    hoodroot:  { hp: 110, spd: 75,  dmg: 14, w: 28, h: 56, jump: 480, reach: 0,  atkMs: 0,    coins: 9 },
    stumpmimic: { hp: 220, spd: 100, dmg: 20, w: 60, h: 54, jump: 420, reach: 56, atkMs: 1100, coins: 25, armor: 0.25, lurk: 160, xp: 15 },
    bigflower: { hp: 2600, spd: 0,  dmg: 30, w: 160, h: 160, jump: 0, reach: 0, atkMs: 9999, coins: 220, boss: true },
    swampmage: { hp: 2200, spd: 95, dmg: 26, w: 50, h: 110, jump: 0, reach: 0, atkMs: 9999, coins: 240, boss: true },
    bogcrab:   { hp: 3300, spd: 75, dmg: 30, w: 200, h: 160, jump: 0, reach: 0, atkMs: 9999, coins: 340, boss: true, secret: true },
    bigcroc:   { hp: 2900, spd: 150, dmg: 30, w: 180, h: 65, jump: 560, reach: 105, atkMs: 1200, coins: 280, boss: true, armor: 0.25 }   // botqoq g'ori: qari timsoh
};

// ===== DUNYO =====
export interface BigPlat { x: number; y: number; w: number; h: number; k: string; rest?: number; }   // rest - dam olish oroli (checkpoint, lagersiz)        // k - ko'rinish (cobble, grass, skyrock, deep..., stone, cloud, branch, ledge)
export interface BigRect { x: number; y: number; w: number; h: number; k: string; }
// Orol: tepasi (plats ichida, h = 40) va pastki "tosh zinapoya" qismi - r: [x, y, w, h, faqatRasm(1)] (faqat klient: rasm va fizika)
export interface BigIsle { id: number; x: number; y: number; w: number; k: string; loc: string; band: string; r: number[][]; sec?: number; hole?: number[]; pool?: number[]; }   // pool - ko'llar [x, w, x2, w2...]   // hole - g'orga kirish [x, w]   // sec - maxfiy (yaqinda ko'rinadi)
export interface BigZone { id: number; x0: number; x1: number; y0: number; y1: number; loc: string; layer: string; kind: string; boss?: string; secret?: boolean; spawns: { x: number, y: number, k: string }[];
    trig?: string; dx?: number; dy?: number; cx0?: number; cx1?: number;   // cx0..cx1 - boss yuradigan oraliq (Balot Krabi: tekis balchiq yo'l)
    gp?: number[]; }   // gp - Gorila Rock grotosidagi platformalar (W.plats raqami): gorilla ularni shiftga uradi   // trig 'e' - boss o'zi chiqmaydi: (dx, dy) dagi teshik oldida E bosilsa chiqadi (robot ilon)
export interface BigWorld {
    seed: number; width: number; top: number; bottom: number; endX: number; startCp: number;
    locs: { id: string, x0: number, x1: number, y0: number, y1: number, my: number }[];   // lokatsiyalar - to'rtburchaklar (my - o'rta qator balandligi)
    plats: BigPlat[]; fills: BigRect[]; fakes: BigRect[]; isles: BigIsle[];
    props: { x: number, y: number, k: string }[];
    vines: { id: number, x: number, y: number, len: number }[];
    cps: { x: number, y: number, extra?: number }[];   // extra - oraliq checkpoint (eski saqlangan raqamlarni o'girish uchun)
    villages: { x0: number, x1: number, y: number, loc: string }[];
    npcs: { id: number, x: number, y: number, t: string, loc: string, v: number, fix?: number, q?: string }[];   // q - topshiriq beradi
    piles: { x: number, y: number }[];                       // qor uyumlari (qor bazasi): E - qor to'plari olinadi
    shops: { x: number, y: number, loc: string }[];          // qishloqdagi do'kon (Shop xaritasidagi narsalar sotiladi)
    crates: { x: number, y: number, s?: number }[];          // sindiriladigan qutilar (s - o'lchami; ba'zilaridan 1-10 tanga chiqadi)
    lavas: { x: number, y: number, w: number }[];            // lava ko'llari tubi (ichida turgan kuyadi)
    vents: { x: number, y: number, k?: string }[];           // olov favvoralari / zaharli gaz (botqoq) - navbat bilan otilib chiqadi
    bogs: { x: number, y: number, w: number, t?: number }[];           // loy ko'llari tubi (botqoq: ichida sekin yuriladi)
    lakes: { x: number, y: number, w: number }[];            // kraken ko'li (y - suv yuzasi; ichida jon ketadi)
    zones: BigZone[];
    chests: { id: number, x: number, y: number, coins: number, sec?: number }[];
    spans: { layer: string, x0: number, x1: number, loc: string }[];
    portals: { loc: string, x: number, y: number, cp: number }[];   // har lokatsiya boshidagi katta portal: ochilgan lokatsiyalar orasida teleport
    gates: { x: number, y: number, loc: string }[];   // yopiq lokatsiyaga olib boradigan zinapoya-yo'l uchidagi to'siq (y - yer sathi)
    closed: string[];   // vaqtincha yopiq lokatsiyalar (klient: portal, xarita)
    cages: { x: number, y: number, zone: number }[];               // semiz elf o'tlog'idagi qafas (ona elfning bolalari) - boss yengilgach ochiladi
}
// Tasodif (seed bilan - bitta o'yinda hamma uchun bir xil)
function rng(seed: number) {
    let a = seed >>> 0;
    const f = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    return { r: f, int: (a0: number, b0: number) => a0 + Math.floor(f() * (b0 - a0 + 1)), pick: <T>(arr: T[]) => arr[Math.floor(f() * arr.length)], chance: (p: number) => f() < p };
}
const TOPH = 40;   // orol tepasining qalinligi (to'liq to'qnashuv)

export function generateWorld(seed: number, locCount = BIG_LOCS.length): BigWorld {
    const R = rng(seed), B = BIG;
    const W: BigWorld = { seed, width: 0, top: B.top, bottom: NET.bottom, endX: 0, startCp: 0,
        gates: [], closed: BIG_CLOSED.slice(), locs: [], plats: [], fills: [], fakes: [], isles: [], props: [], vines: [], cps: [], villages: [], npcs: [], zones: [], chests: [], spans: [], shops: [], crates: [], piles: [], lavas: [], vents: [], bogs: [], lakes: [], portals: [], cages: [] };
    let zid = 0, nid = 0, cid = 0, iid = 0;
    let crabRoom: { bog: BigWorld["bogs"][number], plats: BigPlat[], zone: BigZone, room: [number, number, number] } | null = null;   // Balot Krabi - oxirida yer yuzasidagi botqoq yo'lga ko'chiriladi
    const plat = (x: number, y: number, w: number, h: number, k: string) => { const p = { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), k }; W.plats.push(p); return p; };
    const prop = (x: number, y: number, k: string) => W.props.push({ x: Math.round(x), y: Math.round(y), k });
    const zone = (x0: number, x1: number, y0: number, y1: number, loc: string, layer: string, kind: string, extra: Partial<BigZone> = {}) => {
        const z: BigZone = { id: ++zid, x0: Math.round(x0), x1: Math.round(x1), y0: Math.round(y0), y1: Math.round(y1), loc, layer, kind, spawns: [], ...extra }; W.zones.push(z); return z;
    };
    // OROL PASTI: tepadan pastga torayib boradigan, chetlari zinapoyasimon tosh qatlamlari (+ osilib turgan bo'laklar)
    const under = (x0: number, x1: number, y0: number, depth: number, out: number[][]) => {
        let lx0 = x0, lx1 = x1, ly = y0, left = depth;
        while (left > 10 && lx1 - lx0 > 36) {
            const h = Math.min(left, R.int(18, 34));
            out.push([lx0, ly, lx1 - lx0, h]);
            for (let k = R.int(0, 2); k > 0; k--) {
                const bw = R.int(28, Math.max(34, Math.floor((lx1 - lx0) / 3)));
                out.push([R.int(lx0, Math.max(lx0, lx1 - bw)), ly + h, bw, R.int(10, 26)]);
            }
            ly += h; left -= h;
            const cut = Math.max(10, Math.floor((lx1 - lx0) * 0.2));
            lx0 += R.int(8, cut); lx1 -= R.int(8, cut);
        }
    };
    const isle = (x: number, y: number, w: number, k: string, loc: string, band: string, depth: number) => {
        x = Math.round(x); y = Math.round(y); w = Math.round(w);
        const top = plat(x, y, w, TOPH, k), r: number[][] = [];
        under(x + R.int(4, 20), x + w - R.int(4, 20), y + TOPH, depth, r);
        W.isles.push({ id: ++iid, x, y, w, k, loc, band, r });
        return top;
    };
    // POG'ONA-TOSHLAR YOYI: (ax, ay) - chiqish qirg'og'i, (bx, by) - qo'nish qirg'og'i; sag > 0 - pastga botadi, < 0 - do'nglik
    const bridge = (ax: number, ay: number, bx: number, by: number, sag: number, k: string) => {
        const D = bx - ax;
        if (D <= B.gapMax) return;
        // toshlar soni: oraliqlar gapMin..gapMax, balandlik farqi zinapoyaga sig'sin
        // to'r dunyoda har yo'l ikki tomonga yuriladi - pog'onalar farqi har tomonga ham sakrab chiqiladigan (stepUp)
        const need = Math.ceil(Math.abs(ay - by) / B.stepUp) - 1;
        let n = Math.max(1, need, Math.ceil((D - 110) / 190));
        let ws: number[] = [], g = 0;
        for (let tries = 0; tries < 8; tries++) {
            ws = Array.from({ length: n }, () => R.int(56, 96));
            g = (D - ws.reduce((a, b) => a + b, 0)) / (n + 1);
            if (g > B.gapMax) n++; else if (g < B.gapMin) { ws = ws.map(() => 48); g = (D - 48 * n) / (n + 1); break; } else break;
        }
        const xs: number[] = [], ys: number[] = [];
        let cx = ax;
        ws.forEach((w) => {
            cx += g + R.int(-6, 6);
            const t = (cx + w / 2 - ax) / D;
            xs.push(cx); ys.push(ay + (by - ay) * t + sag * Math.sin(Math.PI * t) + R.int(-12, 12));
            cx += w;
        });
        // yetib bo'lishi: oldinga va orqaga o'tib, qo'shni pog'onalar orasidagi farq cheklanadi
        const U = B.stepUp, fwd = () => { for (let i = 0; i < ys.length; i++) { const p = i ? ys[i - 1] : ay; ys[i] = Math.max(p - U, Math.min(p + U, ys[i])); } };
        fwd();
        for (let i = ys.length - 1; i >= 0; i--) { const nx = i < ys.length - 1 ? ys[i + 1] : by; ys[i] = Math.max(nx - U, Math.min(nx + U, ys[i])); }
        fwd();
        ws.forEach((w, i) => plat(xs[i], ys[i], w, 22, k));
    };
    // ===== DUNYO TO'RI =====
    // Elf Kingdom - markazda (boshlanish joyi). To'g'riga (o'ngga) - O'rmon, orqaga (chapga) - Qor bazasi, pastga - Botqoq, yana pastga - Yer osti.
    // Har lokatsiya - orollar to'ri (X shaklida): o'rta qatorda katta orollar (qishloq, lager, g'or, boss maydoni), ular orasida tepa (osmon)
    // va past (chuqurlik) qatordagi orollar. Har o'rta orol keyingi tepa / past orollar bilan qiya ko'priklar orqali ulanadi, ba'zan qo'shni
    // o'rta / tepa / past orollar to'g'ri ko'prik bilan ham. Qatlamlar (band) bir-biriga zinapoya-yo'llar bilan ulanadi: Qor / Elf / O'rmon
    // pastidan - Botqoqqa, Botqoq pastidan - Yer ostiga (har biri ikki tomonga ham yuriladi)
    const RG = NET.rowGap;
    const bandMid = (b: number) => NET.mid0 + b * NET.bandGap;
    // DAM OLISH JOYLARI (checkpoint): qishloq, boss maydoni chetlari, ko'l qirg'oqlari, zinapoya o'rtasi; boshqa orollarda - yaqinida (15 m) bo'lmasa
    const rests: { x: number, y: number }[] = [];
    const rest = (top: BigPlat, force = false, at?: number) => {
        const x = Math.round(at !== undefined ? at : top.x + 70);
        if (!force && rests.some(c => Math.hypot(c.x - x, c.y - top.y) < 1500)) return false;
        top.rest = 1; rests.push({ x, y: top.y });
        return true;
    };
    const camps: { x: number, y: number }[] = [];   // lagerlar bir-biriga juda yaqin bo'lmasin (har qadamda to'da emas)
    // ---- lokatsiya asboblari (uslubiga mos bezak, lager, quti, maxsus joylar) ----
    const kitOf: { [loc: string]: any } = {};
    const kit = (loc: string) => {
        if (kitOf[loc]) return kitOf[loc];
        const L = BIG_LOCS.find(l => l.id === loc)!, ST = STYLE[loc];
        const groundK = ST.ground, skyK = ST.sky, deepK = ST.deep, cloudK = ST.cloud || 'cloud', stoneK = ST.stone;
        const decor = (gx: number, gw: number, gy: number, dense: number, pool = ST.decor) => {
            for (let px = gx + R.int(40, 120); px < gx + gw - 40; px += R.int(150, 330) / dense) prop(px, gy, R.pick(pool));
        };
        // DUSHMAN LAGERI (oldindan turadi): boshqa lagerdan kamida campGap uzoqda
        const camp = (top: BigPlat, layer: string, p: number, kind = 'camp') => {
            if (top.rest) return null;
            const cxm = top.x + top.w / 2;
            if (camps.some(q => Math.hypot(q.x - cxm, q.y - top.y) < B.campGap) || !R.chance(p)) {
                if (kind === 'camp' && R.chance(0.45)) zone(top.x + 60, top.x + top.w - 40, top.y - 320, top.y + 120, loc, layer, 'lone');
                return null;
            }
            camps.push({ x: cxm, y: top.y });
            const z = zone(top.x + 40, top.x + top.w - 40, top.y - 320, top.y + 120, loc, layer, kind);
            if (kind === 'camp' && top.w > 380) {
                prop(top.x + top.w * 0.45, top.y, ST.tent); prop(top.x + top.w * 0.62, top.y, 'campfire'); prop(top.x + top.w * 0.3, top.y, ST.camp2);
                if (R.chance(0.7)) plat(top.x + top.w - 190, top.y - 110, 130, 16, 'ledge');
            }
            return z;
        };
        const crates = (top: { x: number, y: number, w: number }, p: number, layer: string) => {
            if (top.w < 200 || !R.chance(p)) return;
            const n = R.int(2, 4), bx = top.x + R.int(60, Math.max(61, top.w - 60 - n * 34));
            // har xil o'lchamli qutilar yonma-yon (o'lchami - alohida xesh: tasodif tartibi o'zgarmaydi, saqlangan dunyolar siljimaydi)
            const row: { x: number, s: number }[] = [];
            let cx = bx;
            for (let k = 0; k < n; k++) { const s = crateSize(bx, k); row.push({ x: cx + s / 2, s }); W.crates.push({ x: cx + s / 2, y: top.y - s / 2 + 2, s }); cx += s + 2; }
            if (n >= 3 && R.chance(0.6)) { const b = row[1 + R.int(0, 1)], s = Math.min(b.s, crateSize(bx, 9)); W.crates.push({ x: b.x, y: top.y + 2 - b.s - s / 2, s }); }   // ustma-ust: pastkisining ustida
            if (R.chance(0.3)) { const z = zone(bx - 60, bx + n * 34 + 100, top.y - 200, top.y + 40, loc, layer, 'lurk'); z.spawns = [{ x: bx + n * 34 + 40, y: top.y, k: 'mimic' }]; }
        };
        const pile = (top: { x: number, y: number, w: number }, p: number) => {
            if (!ST.snow || top.w < 160 || !R.chance(p)) return;
            const x = top.x + R.int(50, top.w - 50);
            W.piles.push({ x, y: top.y }); prop(x, top.y, 'snowpile');
        };
        const snowmanLurk = (top: { x: number, y: number, w: number }, p: number) => {
            if (!ST.snow || top.w < 300 || !R.chance(p)) return;
            const x = top.x + R.int(80, top.w - 80);
            const z = zone(x - 200, x + 200, top.y - 200, top.y + 40, loc, 'ground', 'lurk'); z.spawns = [{ x, y: top.y, k: 'hutmimic' }];   // qorli kulba bo'lib turgan mimik
        };
        const blobLurk = (top: { x: number, y: number, w: number }, p: number) => {
            const lk = ST.lava ? ['magmablob', 'lavapuddle'] : ST.bog ? ['stumpmimic', 'swamplog'] : null;   // botqoq: to'nka bo'lib turgan mimik
            if (!lk || top.w < 300 || !R.chance(p)) return;
            const x = top.x + R.int(80, top.w - 80);
            const z = zone(x - 200, x + 200, top.y - 200, top.y + 40, loc, 'ground', 'lurk'); z.spawns = [{ x, y: top.y, k: lk[0] }];
            const px = x + (R.chance(0.5) ? -1 : 1) * R.int(90, 150);
            prop(Math.max(top.x + 30, Math.min(top.x + top.w - 30, px)), top.y, lk[1]);
        };
        const vent = (top: BigPlat, p: number) => {
            if (!(ST.lava || ST.bog) || top.rest || top.w < 260 || !R.chance(p)) return;
            const x = top.x + R.int(90, top.w - 90);
            if (ST.bog) { W.vents.push({ x, y: top.y, k: 'gas' }); prop(x, top.y, 'gasvent'); } else { W.vents.push({ x, y: top.y }); prop(x, top.y, 'vent'); }
        };
        const lavaPool = (top: BigPlat) => {
            if (!(ST.lava || ST.bog) || top.rest || top.w < 480 || !R.chance(0.85)) return;
            const I = W.isles.find(q => q.x === top.x && q.y === top.y);
            if (!I) return;
            const pw = R.int(90, 130), px = Math.round(top.x + top.w * (0.38 + R.r() * 0.24) - pw / 2), x1 = top.x + top.w;
            plat(px + pw, top.y, x1 - px - pw, TOPH, top.k);
            top.w = px - top.x;
            plat(px, top.y + 24, pw, 16, ST.lava ? 'lavabed' : 'bogbed');
            I.pool = [px, pw];
            (ST.lava ? W.lavas : W.bogs).push({ x: px, y: top.y + 24, w: pw });
            const inPool = (x: number, m: number) => x > px - m && x < px + pw + m;
            W.props = W.props.filter(q => Math.abs(q.y - top.y) > 2 || !inPool(q.x, 26));
            W.crates = W.crates.filter(q => q.y < top.y - 80 || q.y > top.y || !inPool(q.x, 24));
            W.vents = W.vents.filter(q => q.y !== top.y || !inPool(q.x, 40));
            W.zones.forEach(z => { if (z.kind === 'lurk') z.spawns.forEach(s => { if (s.y === top.y && inPool(s.x, 30)) s.x = px - 40; }); });
        };
        const fixedPool = (y: number, px: number, pw: number, lava: boolean) => {
            const pl = W.plats.find(q => q.y === y && q.h === TOPH && px > q.x + 20 && px + pw < q.x + q.w - 20), I = pl && W.isles.find(q => q.y === y && px > q.x && px < q.x + q.w);
            if (!pl || !I) return;
            const x1 = pl.x + pl.w;
            plat(px + pw, y, x1 - px - pw, TOPH, pl.k); pl.w = px - pl.x;
            plat(px, y + 24, pw, 16, lava ? 'lavabed' : 'bogbed');
            I.pool = [...(I.pool || []), px, pw];
            (lava ? W.lavas : W.bogs).push({ x: px, y: y + 24, w: pw });
            W.props = W.props.filter(q => Math.abs(q.y - y) > 2 || q.x < px - 26 || q.x > px + pw + 26);
        };
        const dressArena = (k: string, x: number, w: number, g: number) => {
            const L2 = x + 380, R2 = x + w - 380, C = x + w / 2;
            const put = (list: [number, string][]) => list.forEach(([px, pk]) => prop(px, g, pk));
            if (k === 'warlord') put([[L2, 'warbanner'], [R2, 'warbanner'], [x + 160, 'palisade'], [x + w - 160, 'palisade']]);
            else if (k === 'shadowknight') put([[L2, 'darkobelisk'], [R2, 'darkobelisk'], [C + 200, 'darkobelisk']]);
            else if (k === 'alpha') put([[L2, 'moonrock'], [C + 190, 'moonrock'], [R2, 'moonrock']]);
            else if (k === 'ancient') put([[L2, 'bigroot'], [R2, 'bigroot'], [C + 190, 'glowshroom'], [C - 190, 'glowshroom']]);
            else if (k === 'yetiking') put([[L2, 'icespikes'], [R2, 'icespikes'], [C + 190, 'icecrystal']]);
            else if (k === 'icequeen') put([[C + 200, 'icethrone'], [L2, 'icespikes'], [R2, 'icecrystal']]);
            else if (k === 'santa') put([[C, 'xmastree'], [L2, 'giftpile'], [R2, 'giftpile'], [x + 200, 'snowman'], [x + w - 200, 'snowman']]);   // o'rtada archa (oldida E - sovg'a)
            else if (k === 'bigfoot') put([[x + w - 180, 'icespikes'], [x + w - 420, 'icecrystal'], [x + 560, 'bones']]);   // chap chekkasi - bigfutniki
            else if (k === 'magmatitan') { fixedPool(g, x + 150, 100, true); fixedPool(g, x + w - 250, 100, true); put([[L2, 'lavarock'], [R2, 'lavarock'], [C + 190, 'lavarock']]); }
            else if (k === 'boneking') put([[x + 330, 'tombstone'], [x + 440, 'tombstone'], [x + w - 440, 'tombstone'], [x + w - 330, 'tombstone'], [C - 200, 'soulbrazier'], [C + 200, 'soulbrazier']]);
            else if (k === 'swampmage') put([[C - 580, 'flowerbed'], [C - 490, 'flowerbed'], [C - 400, 'flowerbed'], [C + 190, 'cauldron'], [C + 640, 'swingframe']]);   // Balot Magining uyi: gullar, qozon, arg'imchoq
            else if (k === 'hydra') { fixedPool(g, x + 150, 110, false); fixedPool(g, x + w - 260, 110, false); put([[L2, 'deadtree'], [R2, 'deadtree'], [C + 190, 'cattail']]); }
        };
        const dressRoom = (k: string, x0: number, x1: number, fy: number, cy: number) => {
            const w = x1 - x0, at = (q: number) => Math.round(x0 + w * q);
            const P: { [b: string]: [number, string][] } = {
                golem: [[0.3, 'crystal'], [0.62, 'crystal'], [0.8, 'ruin']], spiderqueen: [[0.25, 'bones'], [0.7, 'skull']], mammoth: [[0.3, 'icespikes'], [0.75, 'icecrystal']],
                hellhound: [[0.28, 'lavapillar'], [0.72, 'lavapillar'], [0.5, 'skull']], toadking: [[0.3, 'lilyflower'], [0.55, 'cattail'], [0.78, 'reeds']],
                fatelf: [[0.35, 'bones'], [0.7, 'barrel']], gorilla: [[0.3, 'rock'], [0.7, 'rock']],
                bogcrab: [[0.12, 'reeds'], [0.9, 'cattail']], magmaworm: [[0.3, 'lavarock'], [0.7, 'lavarock']], bigcroc: [[0.3, 'reeds'], [0.7, 'cattail']], hockey: [[0.2, 'snowpile'], [0.5, 'icecrystal'], [0.72, 'snowpile']]
            };
            (P[k] || []).forEach(([q, pk]) => prop(at(q), fy, pk));
            if (k === 'spiderqueen') [0.15, 0.45, 0.85].forEach(q => prop(at(q), cy + 54, 'cobweb'));
        };
        kitOf[loc] = { L, ST, groundK, skyK, deepK, cloudK, stoneK, decor, camp, crates, pile, snowmanLurk, blobLurk, vent, lavaPool, dressArena, dressRoom };
        return kitOf[loc];
    };
    // ---- TUGUNLAR (orol yoki orollar guruhi): plan - kengligi oldindan (ustunlar joylashuvi uchun), build - (x, y) da quriladi ----
    // port: chap cheti (x0, yl) va o'ng cheti (x1, yr) - ko'priklar shu joylardan
    type Node = { kind: string, loc: string, band: number, row: number, w: number, p: number[], x0: number, x1: number, yl: number, yr: number, col: number };
    const planNode = (kind: string, loc: string, band: number, row: number, col: number): Node => {
        const ST = STYLE[loc], p: number[] = [];
        let w = 0;
        if (kind === 'hub') w = loc === 'elf' ? 1500 : 1200;
        else if (kind === 'village' || kind === 'village2') w = R.int(1100, 1300);
        else if (kind === 'plain') w = R.int(420, 800);
        else if (kind === 'plainlo') w = R.int(420, 700);
        else if (kind === 'extra') { if (ST.vines) { p.push(R.int(280, 340), R.int(520, 680), R.int(480, 700)); w = p[0] + p[1] + p[2]; } else w = R.int(480, 800); }
        else if (kind === 'cave') w = 1700;
        else if (kind === 'boss0' || kind === 'boss1') w = ST.lake && kind === 'boss0' ? 340 + 1900 + 460 : 1600;
        else if (kind === 'sky') w = R.int(320, 560);
        else if (kind === 'skyc') w = R.int(400, 560);
        else if (kind === 'skyboss') w = 1100;
        else if (kind === 'deep') w = R.int(760, 980);
        else if (kind === 'secret') w = R.int(1250, 1400);
        else if (kind === 'fatlair') w = 1500;
        else if (kind === 'snakecave') w = 1600;   // ixcham zal: olov butun yerni qoplaydi - faqat taxtalarda omon
        return { kind, loc, band, row, w, p, x0: 0, x1: 0, yl: 0, yr: 0, col };
    };
    const buildNode = (n: Node, x: number, y: number) => {
        const K = kit(n.loc), L = K.L, ST = K.ST, loc = n.loc;
        const layer = n.row < 0 ? 'sky' : n.row > 0 ? 'under' : 'ground', bandK = n.row < 0 ? 'hi' : n.row > 0 ? 'lo' : 'mid';
        const done = (x0: number, yl: number, x1: number, yr: number) => { n.x0 = x0; n.yl = yl; n.x1 = x1; n.yr = yr; };
        if (n.kind === 'hub' || n.kind === 'village' || n.kind === 'village2') {
            // QISHLOQ (qabila): uylar, do'kon, 7-10 NPC; markaziy (Elf) - qal'a bilan
            const w = n.w, top = isle(x, y, w, K.groundK, loc, 'mid', R.int(150, 210));
            rest(top, true);
            const g = top.y, vi = W.villages.length;
            W.villages.push({ x0: x, x1: x + w, y: g, loc });
            const castle = n.kind === 'hub' && !!ST.castle;
            if (castle) prop(x + 230, g, 'castle');
            const sx = Math.round(x + (castle ? 660 : w * 0.55));
            W.shops.push({ x: sx, y: g, loc }); prop(sx, g, ST.shop);
            W.npcs.push({ id: ++nid, x: sx + 40, y: g, t: ST.seller, loc, v: vi, fix: 1 });
            if (ST.snow) { W.piles.push({ x: x + 160, y: g }); prop(x + 160, g, 'snowpile'); }
            for (let px = x + (castle ? 520 : 90); px < x + w - 70; px += R.int(150, 240)) if (Math.abs(px - sx) > 140) prop(px, g, R.pick(ST.houses));
            const nn = R.int(7, 10);
            for (let k = 0; k < nn; k++) W.npcs.push({ id: ++nid, x: x + 120 + R.r() * (w - 240), y: g, t: L.npcs[k % L.npcs.length], loc, v: vi });
            // TOPSHIRIQ BERUVCHILAR (Elf qirolligi): markaziy qishloqda - keksa elf (robot ilon tishi), ikkinchisida - ona elf (bolalari)
            if (loc === 'elf' && n.kind === 'hub') W.npcs.push({ id: ++nid, x: x + 470, y: g, t: 'questelf', loc, v: vi, fix: 1, q: 'tooth' });
            if (loc === 'elf' && n.kind === 'village2') W.npcs.push({ id: ++nid, x: x + w - 160, y: g, t: 'motherelf', loc, v: vi, fix: 1, q: 'kids' });
            if (n.kind !== 'village2') hubs.push({ loc, top });
            done(x, g, x + w, g); return;
        }
        if (n.kind === 'plain' || n.kind === 'plainlo' || (n.kind === 'extra' && !ST.vines)) {
            const deep = n.kind === 'plainlo' || (n.kind === 'extra' && n.row > 0 && !ST.ice && !ST.lava && !ST.bog);
            const k = n.kind === 'extra' && ST.ice ? ST.ice : deep ? K.deepK : K.groundK;
            const top = isle(x, y, n.w, k, loc, bandK, R.int(90, n.row > 0 ? 150 : 170));
            K.decor(top.x, top.w, top.y, 1.1, deep ? ST.deepProps : ST.decor);
            K.camp(top, layer, 0.9);   // oddiy orol - lager (checkpoint - qishloq, boss maydoni, g'or, zinapoya, chuqurlik orollarida)
            K.crates(top, 0.5, layer);
            K.pile(top, 0.7); K.snowmanLurk(top, 0.35);
            K.blobLurk(top, 0.4); K.vent(top, 0.75); K.lavaPool(top);
            done(x, top.y, x + n.w, top.y); return;
        }
        if (n.kind === 'extra') {
            // O'RMON / BOTQOQ: keng jar - shoxga osilgan 2-3 liana (chayqalib o'tiladi), ostida tubsiz jar
            const [aw, D, bw] = n.p;
            const a = isle(x, y, aw, K.groundK, loc, bandK, R.int(90, 150));
            K.decor(a.x, a.w, a.y, 0.8); rest(a);
            const ax = x + aw;
            prop(ax - 40, y, ST.vineTree || 'bigtree');
            const nv = D > 540 ? 3 : 2;
            for (let k = 0; k < nv; k++) W.vines.push({ id: W.vines.length + 1, x: Math.round(ax + 110 + (D - 220) * k / (nv - 1)), y: y - 300, len: 220 });
            plat(ax - 40, y - 322, D + 80, 22, 'branch');
            const top = isle(ax + D, y, bw, K.groundK, loc, bandK, R.int(110, 170));
            K.decor(top.x, top.w, top.y, 1);
            if (!rest(top) && R.chance(0.5)) K.camp(top, layer, 0.7, 'ambush');
            if (ST.bog) { K.vent(top, 0.6); K.lavaPool(top); }
            done(x, y, ax + D + bw, y); return;
        }
        if (n.kind === 'cave') {
            // G'OR (season mehmonlari): keng orol, tepasida ochiq kirish teshigi (pastga pog'onalar), ichida katta zal; o'ng yarmida - g'or bossi
            const w = 1700, deep = 280, hx = x + 170, holeW = 120, left = x + 90, right = x + w - 90, r: number[][] = [];
            const caveTop = plat(x, y, hx - x, TOPH, K.groundK); plat(hx + holeW, y, x + w - hx - holeW, TOPH, K.groundK);
            rest(caveTop, true);
            r.push([x + 10, y + TOPH, left - x - 10, deep + 40]);
            r.push([right, y + TOPH, x + w - 10 - right, deep + 40]);
            r.push([left, y + TOPH, right - left, deep - TOPH, 1]);
            r.push([left, y + deep, right - left, 40]);
            under(x + 40, x + w - 40, y + deep + 40, R.int(60, 110), r);
            W.isles.push({ id: ++iid, x, y, w, k: K.groundK, loc, band: 'mid', r, hole: [hx, holeW] });
            plat(left, y + deep, right - left, 30, K.groundK + 'floor');
            for (let s = 1; s * 85 < deep; s++) plat(hx + (s % 2 ? 8 : 52), y + deep - s * 85, 60, 14, 'ledge');
            prop(hx - 50, y, 'cavesign'); prop(hx + holeW + 40, y, 'torch');
            for (let px = left + 40; px < right - 30; px += R.int(170, 260)) prop(px, y + deep, R.pick(['torch', 'crystal', 'bones', 'glowshroom', 'torch']));
            K.decor(x + 320, w - 420, y, 0.8);
            const mid = left + (right - left) * 0.42;
            zone(left + 40, mid, y + deep - 240, y + deep + 40, loc, 'under', 'cave');
            if (L.cave) zone(mid + 60, right - 40, y + TOPH + 10, y + deep + 40, loc, 'under', 'boss', { boss: L.cave });
            else {   // bossi yo'q g'or (O'rmon) - kaltakesak / ovchi uyasi (zal polida; tasodifsiz)
                const z = zone(mid + 60, right - 40, y + TOPH + 10, y + deep + 40, loc, 'under', 'ambush');
                z.spawns = [[0.25, 3], [0.6, 0], [0.85, 3]].map(([q, r]) => ({ x: Math.round(mid + 60 + (right - mid - 100) * q), y: y + deep, k: L.enemies[r] }));
            }
            K.dressRoom(L.cave, mid + 60, right - 40, y + deep, y + TOPH);
            done(x, y, x + w, y); return;
        }
        if ((n.kind === 'boss0' && ST.lake)) {
            // KRAKEN KO'LI (S2 "Legendary Kraken" dagidek, lekin ancha keng): qirg'oq - ko'l (uch qator pog'ona) - qirg'oq
            const k = L.bosses[0], shore = isle(x, y, 340, K.groundK, loc, 'mid', R.int(150, 200)), g = shore.y;
            prop(shore.x + 70, g, ST.arena); prop(shore.x + 200, g, 'reeds'); prop(shore.x + shore.w - 30, g, 'cattail');
            rest(shore, true);
            const LW = 1900, x0 = shore.x + shore.w, surf = g + 40;
            isle(x0, surf + 40, LW, 'lakebed', loc, 'mid', R.int(110, 160));
            // kraken - suv; BAHAYBAT GUL - balchiq (tushgan o'yinchi sekinlashadi; gul o'rtada, ildizi tubida)
            if (k === 'kraken') W.lakes.push({ x: x0, y: surf, w: LW }); else W.bogs.push({ x: x0, y: surf + 40, w: LW });
            const row = (nn: number, yy: number, w: number) => { for (let i = 0; i < nn; i++) plat(x0 + LW * (i + 0.5) / nn - w / 2, yy, w, 16, 'rootplat'); };
            row(8, g - 10, 120); row(6, g - 110, 130); row(4, g - 210, 140);
            zone(x0 - 40, x0 + LW + 40, g - 560, surf + 40, loc, 'ground', 'boss', { boss: k });
            const exit = isle(x0 + LW, g, 460, K.groundK, loc, 'mid', R.int(150, 200));
            prop(exit.x + 50, g, ST.arena); K.decor(exit.x + 120, exit.w - 140, g, 0.6);
            rest(exit, true, exit.x + exit.w - 80);
            done(x, g, x0 + LW + 460, g); return;
        }
        if (n.kind === 'boss0' || n.kind === 'boss1') {
            // BOSS MAYDONI: keng tekis orol (160 m), uch qavat pog'ona; ikki chetida dam olish (checkpoint - maydon devoridan tashqarida)
            const k = n.kind === 'boss0' ? L.bosses[0] : L.bosses[1], w = 1600;
            const top = isle(x, y, w, k === 'icequeen' && ST.ice ? ST.ice : K.groundK, loc, 'mid', R.int(190, 240)), g = top.y;
            if (k === 'zvfarm') {
                // FERMA (maxfiy boss): ekin qatorlari, qo'rqinchoq, to'siq; o'rtada katta SABZI - oldida E: zombi sabzavotlar yerdan chiqadi
                const C = Math.round(x + w / 2);
                [x + 40, x + w - 40].forEach(px => prop(px, g, 'fence'));
                for (let px = x + 340; px < x + w - 300; px += 120) if (Math.abs(px - C) > 120) prop(px, g, 'crops');
                prop(x + 400, g, 'scarecrow'); prop(x + w - 400, g, 'scarecrow'); prop(x + w - 150, g, 'cart'); prop(x + w - 250, g, 'well');
                prop(C, g, 'carrotbig');
                K.crates({ x: x + 40, y: g, w: 240 }, 1, 'ground');   // chap chetda (eni avvalgidek - tasodif tartibi o'zgarmaydi, saqlangan dunyolar siljimaydi)
                zone(x + 100, x + w - 100, g - 560, g + 60, loc, 'ground', 'boss', { boss: k, secret: true, trig: 'e', dx: C, dy: g });
                rest(top, true, x + 50); rest(top, true, x + w - 50);
                done(x, g, x + w, g); return;
            }
            prop(x + 30, g, ST.arena); prop(x + w - 30, g, ST.arena);
            prop(x + w / 2 - 300, g, ST.arena); prop(x + w / 2 + 300, g, ST.arena);
            if (ST.snow) { W.piles.push({ x: x + 140, y: g }); prop(x + 140, g, 'snowpile'); W.piles.push({ x: x + w - 140, y: g }); prop(x + w - 140, g, 'snowpile'); }
            K.dressArena(k, x, w, g);
            if (k === 'bigfoot') {
                // ROBOT BIGFUT MAYDONI (chizilgan sxema bo'yicha): bigfut chap chekkada, o'ng tomonda besh pog'ona - pastda ikkita, o'rtada bitta,
                // tepada ikkita (yuzi balandligida - to'g'ri otish uchun). Sxemadagidek bigfut va pog'onalar bitta ekranga sig'adi (sxema x 0..497 -> ~870 px),
                // balandliklar sakrab yetiladigan qilib
                const X = (q: number) => x + 160 + q * 1.75;   // mushtidan o'ngroqda
                [[248, 312, 105], [432, 484, 118], [332, 380, 187], [442, 492, 215], [255, 305, 229]].forEach(([a0, a1, h]) => plat(X(a0), g - h, (a1 - a0) * 2, 16, 'ledge'));
            } else {
                plat(x + 260, g - 90, 160, 16, 'ledge'); plat(x + w - 420, g - 90, 160, 16, 'ledge');
                plat(x + 470, g - 180, 140, 16, 'ledge'); plat(x + w - 610, g - 180, 140, 16, 'ledge');
                plat(x + w / 2 - 100, g - 270, 200, 16, 'ledge');
            }
            // ALTER QOR BOBO: o'rtada archa - qutilar chetroqda (eni avvalgidek - tasodif tartibi o'zgarmaydi); jang - archa oldida hamma E bosganda
            const santa = k === 'santa';
            K.crates({ x: santa ? x + 300 : x + w / 2 - 120, y: g, w: 240 }, 1, 'ground');
            zone(x + 100, x + w - 100, g - 560, g + 60, loc, 'ground', 'boss', santa ? { boss: k, trig: 'e', dx: Math.round(x + w / 2), dy: g } : { boss: k });
            rest(top, true, x + 50); rest(top, true, x + w - 50);
            done(x, g, x + w, g); return;
        }
        if (n.kind === 'sky' || n.kind === 'skyc' || n.kind === 'skyboss') {
            const grotto = n.kind === 'skyboss' && L.skyBoss === 'gorilla';
            const top = isle(x, y, n.w, grotto ? K.deepK : K.skyK, loc, 'hi', R.int(60, 120));
            if (grotto) {
                // GORILA ROCK GROTOSI (S1 map-8 zali aynan): 800 px keng tosh zal, shift 526 px balandda; chap pastda - kirish eshigi (o'ngda ham);
                // besh platforma (chapda ikki qavat, o'rtada bitta, o'ngda ikki qavat) - gorilla ularni shiftga uradi. (tasodif tartibi avvalgidek)
                const GW = 1000, SX = GW / 800, gx0 = x + Math.round((n.w - GW) / 2), gx1 = gx0 + GW, CEIL = 526, DOOR = 140, wall = gx0 - x;
                W.isles.push({ id: ++iid, x, y: y - CEIL - 74, w: n.w, k: K.deepK, loc, band: 'hi', r: [
                    [x, y - CEIL - 74, n.w, 74], [x, y - CEIL, wall, CEIL - DOOR], [gx1, y - CEIL, x + n.w - gx1, CEIL - DOOR], [gx0, y - CEIL, GW, CEIL, 1]] });
                const gp: number[] = [];
                [[84, 232, 138], [507, 226, 164], [293, 340, 163], [79, 452, 142], [541, 446, 171]].forEach(([px, py, pw]) => { plat(gx0 + Math.round(px * SX), y - (570 - py), Math.round(pw * SX), 14, 'ledge'); gp.push(W.plats.length - 1); });
                [[gx0 + 36, 'torch'], [gx1 - 36, 'torch'], [gx0 + 310, 'rock'], [gx1 - 290, 'rock'], [x + 25, 'cavesign']].forEach(([px, pk]) => prop(px as number, y, pk as string));
                zone(gx0 + 10, gx1 - 10, y - CEIL + 10, y + 40, loc, 'under', 'boss', { boss: L.skyBoss!, gp });
                rest(top, true, x + 40); rest(top, true, x + n.w - 40);
                done(x, y, x + n.w, y); return;
            }
            if (n.kind === 'skyboss') {
                zone(x + 80, x + n.w - 80, y - 520, y + 60, loc, 'sky', 'boss', { boss: L.skyBoss! });
                plat(x + 200, y - 110, 150, 16, 'ledge'); plat(x + n.w - 350, y - 110, 150, 16, 'ledge');
                rest(top, true, x + 40); rest(top, true, x + n.w - 40);
            } else {
                if (R.chance(0.6)) prop(x + n.w / 2, y, R.pick(ST.skyProps));
                K.camp(top, 'sky', 0.75);
                K.crates(top, 0.6, 'sky');
            }
            if (n.kind === 'skyc') {
                // maxfiy osmon sandig'i: oroldan bulut pog'onalar (har biri 85 px) bilan balandga
                let sx = x + n.w / 2, sy = y;
                const side = R.chance(0.5) ? 1 : -1;
                for (let k = 0; k < 4; k++) { sx += (k % 2 ? -110 : 140) * side; sy -= 85; plat(sx - 35, sy, 70, 16, 'scloud'); }
                const ch = isle(sx + (side > 0 ? 70 : -220), sy - 85, 150, K.skyK, loc, 'hi', 50);
                W.isles[W.isles.length - 1].sec = 1;
                W.chests.push({ id: ++cid, x: ch.x + 75, y: ch.y, coins: R.int(80, 140), sec: 1 });
            }
            done(x, y, x + n.w, y); return;
        }
        if (n.kind === 'fatlair') {
            // ESKI O'TLOQ (S1 "Right on time" dagidek): semiz elf o'tirib, elfni yeyapti - qon dog'lari, uzilgan qo'l, yarim oyog'i qolgan
            // qonli elf; chetida - ona elfning ikki bolasi qamalgan qafas. Yaqin kelsa - suhbat, keyin jang
            const w = n.w, top = isle(x, y, w, K.groundK, loc, 'mid', R.int(180, 230)), g = top.y, cx = Math.round(x + w / 2);
            [[x + 120, 'deadtree'], [x + 260, 'bush'], [x + w - 120, 'deadtree'], [x + w - 420, 'bush']].forEach(([px, pk]) => prop(px as number, g, pk as string));
            prop(cx + 120, g, 'bloodpool'); prop(cx + 290, g, 'elfvictim'); prop(cx + 420, g, 'elfhand'); prop(cx - 200, g, 'bloodpool'); prop(cx - 160, g, 'elfhalf');
            const z = zone(x + 100, x + w - 100, g - 560, g + 60, loc, 'ground', 'boss', { boss: L.bosses[0] });
            prop(x + w - 230, g, 'kidcage'); W.cages.push({ x: x + w - 230, y: g, zone: z.id });
            rest(top, true, x + 50); rest(top, true, x + w - 50);
            done(x, g, x + w, g); return;
        }
        if (n.kind === 'snakecave') {
            // ROBOT ILON G'ORI (pastki qatorda): tepadan teshik va pog'onalar bilan tushiladi; katta zal, o'ng devorda - ilon iniga teshik
            // (oldida E - ilon boshini chiqaradi). Zal bo'ylab TAXTA YO'L (olovdan qochish uchun - yerdan 21 m balandda), oraliq zinapoya-taxtalar
            const w = n.w, deep = 440, hx = x + 170, holeW = 130, left = x + 90, right = x + w - 90, r: number[][] = [];
            const top0 = plat(x, y, hx - x, TOPH, K.deepK); plat(hx + holeW, y, x + w - hx - holeW, TOPH, K.deepK);
            rest(top0, true);
            r.push([x + 10, y + TOPH, left - x - 10, deep + 40]);
            r.push([right, y + TOPH, x + w - 10 - right, deep + 40]);
            r.push([left, y + TOPH, right - left, deep - TOPH, 1]);
            r.push([left, y + deep, right - left, 40]);
            under(x + 40, x + w - 40, y + deep + 40, R.int(60, 100), r);
            W.isles.push({ id: ++iid, x, y, w, k: K.deepK, loc, band: 'lo', r, hole: [hx, holeW] });
            const fy = y + deep;
            plat(left, fy, right - left, 30, K.deepK + 'floor');
            for (let s2 = 1; s2 * 85 < deep; s2++) plat(hx + (s2 % 2 ? 8 : 62), fy - s2 * 85, 60, 14, 'ledge');
            prop(hx - 50, y, 'cavesign'); prop(hx + holeW + 40, y, 'torch');
            // taxta yo'l va unga chiqiladigan taxtachalar
            const p0 = hx + holeW + 150, p1 = right - 330;
            for (let px = p0; px < p1; px += 220) { plat(px, fy - 210, 160, 14, 'plank'); if (((px - p0) / 220) % 2 === 0) plat(px + 40, fy - 105, 90, 14, 'plank'); }
            for (let px = left + 60; px < right - 40; px += R.int(200, 300)) prop(px, fy, R.pick(['torch', 'bones', 'crystal', 'torch', 'barrel']));
            const dx = right - 30;
            prop(dx, fy, 'snakeden');
            zone(left + 40, right - 40, y + TOPH + 10, fy + 40, loc, 'under', 'boss', { boss: L.cave, trig: 'e', dx, dy: fy });
            done(x, y, x + w, y); return;
        }
        if (n.kind === 'deep' || n.kind === 'secret') {
            // CHUQURLIK: qalin tosh orol, ichida (maxfiy) xona - tepasida soxta (o'tib ketiladigan) bo'lak, tagida pog'onalar;
            // xonada - sandiq yoki MAXFIY BOSS
            const secretBoss = n.kind === 'secret', dw = n.w, roomW0 = secretBoss ? 900 : 520, deep = secretBoss ? 480 : 170;
            const hx = x + R.int(140, dw - roomW0 - 60), holeW = 110;
            // maxfiy boss xonasi - tugunning butun kengligida va baland (jang uchun pog'onalar bilan); teshik joyi va tasodif
            // chaqiruvlari avvalgidek - saqlangan dunyolarning qolgan qismi siljimaydi
            const left = secretBoss ? x + 80 : hx - 60, right = secretBoss ? x + dw - 120 : left + roomW0, roomW = right - left, r: number[][] = [];
            const t1 = plat(x, y, hx - x, TOPH, K.deepK); plat(hx + holeW, y, x + dw - hx - holeW, TOPH, K.deepK);
            W.fakes.push({ x: hx, y, w: holeW, h: TOPH, k: K.deepK });
            r.push([x + 10, y + TOPH, left - x - 10, deep + 40]);
            r.push([right, y + TOPH, x + dw - 10 - right, deep + 40]);
            r.push([left, y + TOPH, roomW, deep - TOPH, 1]);
            r.push([left, y + deep, roomW, 40]);
            under(x + 30, x + dw - 30, y + deep + 40, R.int(60, 110), r);
            W.isles.push({ id: ++iid, x, y, w: dw, k: K.deepK, loc, band: 'lo', r });
            plat(left, y + deep, roomW, 30, K.deepK + 'floor');
            for (let s = 1; s * 85 < deep; s++) plat(hx + (s % 2 ? 6 : 44), y + deep - s * 85, 60, 14, 'ledge');
            if (secretBoss) {
                // JANG POG'ONALARI (kirish zinapoyasidan o'ngda): ikki pastki, o'rtada balandroq, tepada ikkita - sakrab qochish, ustidan otish uchun
                const a0 = hx + holeW + 40, sp = right - 40 - a0, fy = y + deep, at = (q: number) => Math.round(a0 + sp * q);
                plat(at(0.1), fy - 125, 170, 16, 'ledge'); plat(at(0.7), fy - 125, 170, 16, 'ledge');
                plat(at(0.38), fy - 245, 210, 16, 'ledge');
                plat(at(0.06), fy - 360, 150, 16, 'ledge'); plat(at(0.74), fy - 360, 150, 16, 'ledge');
            }
            prop(left + 24, y + deep, 'torch'); prop(right - 24, y + deep, 'torch');
            if (secretBoss && L.secretRoom === 'mimic') {
                // xazina xonasi: sandiqlar orasida ikkita MIMIK (maxfiy boss - fermada)
                const fy = y + deep; [[left + 90, 'barrel'], [right - 90, 'crates'], [left + 200, 'bones']].forEach(([px, pk]) => prop(px as number, fy, pk as string));
                const z = zone(left + 40, right - 40, y + TOPH + 10, fy + 40, loc, 'under', 'lurk');
                z.spawns = [{ x: right - 170, y: fy, k: 'mimic' }, { x: Math.round((left + right) / 2) + 60, y: fy, k: 'mimic' }];
            } else if (secretBoss && L.secretBoss === 'bogcrab') {
                // BALOT KRABI: xona poli - balchiq, ustida tosh pog'onalar; ulardan biri o'rnida SOXTA TOSH (krab qobig'i - ustiga sakralsa uyg'onadi).
                // qobig'i ustidagi ko'rinmas pog'ona (crabtop) - krab tosh bo'lib yotganda ustiga chiqiladi (uyg'ongach klient o'chiradi)
                // (yer yuzasida mos tekis botqoq yo'l topilsa - krab o'sha yerga ko'chadi, bu xona esa xazina xonasi bo'lib qoladi - generateWorld oxirida)
                const fy = y + deep, a0 = hx + holeW + 60, a1 = right - 60, n = Math.max(4, Math.floor((a1 - a0) / 120)), fake = Math.floor(n * 0.6);
                const bog = { x: left, y: fy, w: roomW }; W.bogs.push(bog);
                let cx = 0; const ps: BigPlat[] = [];
                for (let i = 0; i < n; i++) { const sx = a0 + (a1 - a0) * (i + 0.5) / n; if (i === fake) { cx = Math.round(sx); ps.push(plat(cx - 40, fy - 56, 130, 18, 'crabtop')); } else ps.push(plat(sx - 30, fy - 34, 60, 40, 'bogstone')); }   // balchiqdan ~20px chiqib turadi
                K.dressRoom(L.secretBoss, left, right, fy, y + TOPH);
                const cz = zone(left + 40, right - 40, y + TOPH + 10, fy + 40, loc, 'under', 'boss', { boss: L.secretBoss, secret: true, dx: cx, dy: fy });
                crabRoom = { bog, plats: ps, zone: cz, room: [left, right, fy] };
            } else if (secretBoss) { K.dressRoom(L.secretBoss, left, right, y + deep, y + TOPH); zone(left + 40, right - 40, y + TOPH + 10, y + deep + 40, loc, 'under', 'boss', { boss: L.secretBoss, secret: true }); }
            else W.chests.push({ id: ++cid, x: right - 120, y: y + deep, coins: R.int(150, 260) });
            for (let px = x + 60; px < x + dw - 40; px += R.int(160, 300)) if (px < hx - 40 || px > hx + holeW + 40) prop(px, y, R.pick(ST.deepProps));
            const dtop: BigPlat = { x, y, w: dw, h: TOPH, k: K.deepK };
            if (rest(t1)) dtop.rest = 1;
            if (!secretBoss) K.camp(dtop, 'under', 0.8);
            K.crates({ x, y, w: Math.max(0, hx - x - 40) }, 0.7, 'under');
            if (ST.lava || ST.bog) K.vent({ x: hx + holeW + 40, y, w: Math.max(0, x + dw - hx - holeW - 80), h: TOPH, k: K.deepK }, 0.7);
            done(x, y, x + dw, y); return;
        }
    };
    const hubs: { loc: string, top: BigPlat }[] = [];
    // ---- USTUNLAR REJASI ----
    // tashqi lokatsiya (Qor, O'rmon): Elf dan uzoqlashgan sari: qishloq -> lager -> g'or -> 1-boss (+ maxfiy, + osmon bossi) -> 2-qishloq -> 2-boss
    const OUT = [['village', 'sky', 'deep'], ['plain', 'skyc', 'extra'], ['cave', 'sky', 'plainlo'], ['boss0', 'SKY', 'secret'], ['village2', 'sky', 'deep'], ['boss1', 'skyc', 'extra']];
    // markaziy lokatsiya (Elf, Botqoq, Yer osti): o'rtada qishloq, ikki tomonda - boshqalar
    const HUB = [['boss0', 'skyc', 'deep'], ['cave', 'sky', 'extra'], ['plain', 'sky', 'deep'], ['hub', 'sky', 'plainlo'], ['plain', 'skyc', 'deep'], ['village2', 'sky', 'secret'], ['boss1', 'sky', 'extra']];
    const EDGE = ['plain', 'sky', 'deep'];
    const bandCols: { [b: number]: { c: number, loc: string, spec: string[] }[] } = { 0: [], 1: [], 2: [] };
    const has = (id: string) => BIG_LOCS.slice(0, locCount).some(l => l.id === id);
    let col = 0;
    if (has('snow')) OUT.slice().reverse().forEach(s => bandCols[0].push({ c: col++, loc: 'snow', spec: s }));
    const hubCol = col + 3;
    // ELF QIROLLIGI: chapda - semiz elf o'tlog'i, uning yonida pastda - robot ilon g'ori; o'rtada qal'a qishlog'i (topshiriq), o'ngda - ona elf qishlog'i
    // va uning ostida sambochining maxfiy xonasi
    const ELFC = [['fatlair', 'skyc', 'deep'], ['plain', 'sky', 'snakecave'], ['plain', 'sky', 'deep'], ['hub', 'sky', 'plainlo'], ['plain', 'skyc', 'deep'], ['village2', 'sky', 'secret'], ['plain', 'sky', 'extra']];
    ELFC.forEach(s => bandCols[0].push({ c: col++, loc: 'elf', spec: s }));
    if (has('forest')) OUT.forEach(s => bandCols[0].push({ c: col++, loc: 'forest', spec: s }));
    const nCols = col;
    [['swamp', 1], ['lava', 2]].forEach(([id, b]) => {
        if (!has(id as string)) return;
        const c0 = hubCol - 4;
        [EDGE, ...HUB, EDGE].forEach((s, i) => bandCols[b as number].push({ c: c0 + i, loc: id as string, spec: s }));
    });
    // tugunlar rejasi (kengliklar) - har ustun uchun: o'rta, tepa, past
    const nodes: { [key: string]: Node } = {};
    const key = (b: number, c: number, row: number) => b + ':' + c + ':' + row;
    [0, 1, 2].forEach((b) => {
        const list = bandCols[b], last = list.length ? list[list.length - 1].c : -1;
        list.forEach(({ c, loc, spec }) => {
            nodes[key(b, c, 0)] = planNode(spec[0], loc, b, 0, c);
            if (c === last) return;   // qatlamning oxirgi ustuni - faqat o'rta orol (undan nariga yo'l yo'q)
            const L = BIG_LOCS.find(l => l.id === loc)!;
            nodes[key(b, c, -1)] = planNode(spec[1] === 'SKY' ? (L.skyBoss ? 'skyboss' : 'sky') : spec[1], loc, b, -1, c);
            nodes[key(b, c, 1)] = planNode(spec[2], loc, b, 1, c);
        });
    });
    // ustunlar x bo'yicha: o'rta orollar oralig'i (eng kengi bo'yicha) - qiya ko'prik - tepa / past orollar oralig'i - qiya ko'prik
    const midX: number[] = [], midW: number[] = [], slotX: number[] = [], slotW: number[] = [];
    let cur = 400;
    for (let c = 0; c < nCols; c++) {
        midW[c] = Math.max(...[0, 1, 2].map(b => (nodes[key(b, c, 0)] || { w: 0 }).w));
        midX[c] = cur; cur += midW[c] + R.int(820, 980);
        slotW[c] = Math.max(0, ...[0, 1, 2].flatMap(b => [-1, 1].map(r => (nodes[key(b, c, r)] || { w: 0 }).w)));
        slotX[c] = cur; if (slotW[c] > 0) cur += slotW[c] + R.int(820, 980);
    }
    // LOKATSIYALAR CHEGARASI (to'rtburchaklar): qatlam ichida qo'shni lokatsiyalar orasi - ustunlar orasidagi bo'shliq o'rtasida
    const regions: { id: string, x0: number, x1: number, y0: number, y1: number, my: number }[] = [];
    [0, 1, 2].forEach((b) => {
        const list = bandCols[b];
        const y0 = b === 0 ? B.top : bandMid(b) - RG * 2, y1 = b === 2 || (b === 1 && !has('lava')) ? NET.bottom : bandMid(b) + RG * 2;
        list.forEach(({ c, loc }, i) => {
            const prev = list[i - 1], next = list[i + 1];
            if (!prev || prev.loc !== loc) regions.push({ id: loc, x0: !prev ? (b === 0 ? 0 : Math.round(midX[c] - 500)) : Math.round(midX[c] - 450), x1: 0, y0, y1, my: bandMid(b) });
            if (!next || next.loc !== loc) regions[regions.length - 1].x1 = !next ? (b === 0 ? cur + 600 : Math.round(midX[c] + midW[c] + 500)) : Math.round(midX[next.c] - 450);
        });
    });
    // tugunlarni qurish: o'rta - o'z oralig'i o'rtasida, tepa / past - oraliq o'rtasida
    Object.values(nodes).forEach((n) => {
        const ym = bandMid(n.band) + R.int(-40, 40);
        const y = n.row === 0 ? ym : ym + n.row * RG + R.int(-30, 30);
        const x = n.row === 0 ? midX[n.col] + (midW[n.col] - n.w) / 2 : slotX[n.col] + (slotW[n.col] - n.w) / 2;
        buildNode(n, Math.round(x), Math.round(y));
    });
    // ---- KO'PRIKLAR ----
    const stoneOf = (loc: string) => { const ST = STYLE[loc]; return ST.slick && R.chance(0.35) ? ST.slick : ST.stone; };
    const link = (a: Node | undefined, b: Node | undefined, sag: number, air = false) => {
        if (!a || !b || b.x0 - a.x1 <= B.gapMax) return;
        bridge(a.x1, a.yr, b.x0, b.yl, sag, a.row < 0 && b.row < 0 ? (STYLE[a.loc].cloud || 'cloud') : stoneOf(a.loc));
        // uzun ko'prik ustida ba'zan uchuvchilar (sakrab o'tayotganda xalaqit beradi)
        const cxm = (a.x1 + b.x0) / 2, cym = (a.yr + b.yl) / 2;
        if (air && b.x0 - a.x1 > 700 && !camps.some(q => Math.hypot(q.x - cxm, q.y - cym) < B.campGap) && R.chance(0.3)) { camps.push({ x: cxm, y: cym }); zone(a.x1 + 60, b.x0 - 60, Math.min(a.yr, b.yl) - 320, Math.max(a.yr, b.yl) + 160, a.loc, 'air', 'camp'); }
    };
    // ZINAPOYA-YO'L (qatlamlar orasida): kichik orollar va toshlar; o'rtasida dam olish joyi
    const stairs: { b: number, c: number }[] = [];
    const stair = (a: Node | undefined, b: Node | undefined, down: boolean) => {
        if (!a || !b) return;
        const ax = a.x1, ay = a.yr, bx = b.x0, by = b.yl, H = bx - ax, hops = Math.max(2, Math.floor(H / 900));
        let px = ax, py = ay;
        for (let i = 1; i < hops; i++) {
            const w = R.int(170, 230), sx = Math.round(ax + H * i / hops - w / 2), sy = Math.round(ay + (by - ay) * i / hops + R.int(-20, 20));
            const lc = sy < (Math.min(ay, by) + Math.max(ay, by)) / 2 ? (ay < by ? a.loc : b.loc) : (ay < by ? b.loc : a.loc);
            bridge(px, py, sx, sy, 0, STYLE[lc].stone);
            const top = isle(sx, sy, w, STYLE[lc].ground, lc, 'mid', R.int(60, 100));
            if (i === 1) prop(sx + w / 2, sy, down ? 'swampsign' : 'signpost');
            if (i === Math.ceil((hops - 1) / 2)) rest(top, true, sx + w / 2);
            px = sx + w; py = sy;
        }
        bridge(px, py, bx, by, 0, STYLE[b.loc].stone);
    };
    // qatlam ichida: X shaklidagi qiya ko'priklar va ba'zan to'g'ri ko'priklar
    const STAIRS: { up: number, c: number, dir: 'dr' | 'dl' }[] = [];
    if (has('swamp')) STAIRS.push({ up: 0, c: hubCol - 5, dir: 'dr' }, { up: 0, c: hubCol - 1, dir: 'dr' }, { up: 0, c: hubCol + 3, dir: 'dl' });   // Qor -> Botqoq, Elf -> Botqoq, Botqoq -> O'rmon
    if (has('lava')) STAIRS.push({ up: 1, c: hubCol - 2, dir: 'dr' }, { up: 1, c: hubCol + 1, dir: 'dl' });
    const busy = (b: number, c: number, row: number) => STAIRS.some(s => s.c === c && ((s.up === b && row === 1) || (s.up + 1 === b && row === -1)));
    [0, 1, 2].forEach((b) => bandCols[b].forEach(({ c }) => {
        const m = nodes[key(b, c, 0)], u = nodes[key(b, c, -1)], d = nodes[key(b, c, 1)], m2 = nodes[key(b, c + 1, 0)];
        link(m, u, -R.int(20, 60)); link(m, d, R.int(20, 80));
        link(u, m2, R.int(20, 60)); link(d, m2, -R.int(0, 40));
        if (R.chance(0.55)) link(m, m2, R.int(60, 160), true);
        const u2 = nodes[key(b, c + 1, -1)], d2 = nodes[key(b, c + 1, 1)];
        if (!busy(b, c, -1) && R.chance(0.45)) link(u, u2, R.int(20, 80), true);
        if (!busy(b, c, 1) && R.chance(0.45)) link(d, d2, R.int(80, 160), true);
    }));
    STAIRS.forEach((s) => {
        const a = s.dir === 'dr' ? nodes[key(s.up, s.c, 1)] : nodes[key(s.up + 1, s.c, -1)], b = s.dir === 'dr' ? nodes[key(s.up + 1, s.c + 1, -1)] : nodes[key(s.up, s.c + 1, 1)];
        stair(a, b, s.dir === 'dr');
        // yopiq lokatsiyaga yo'l: ikkala uchida to'siq (dunyoning boshqa qismlari o'zgarmaydi - tasodif sarflanmaydi)
        if (a && b) { const lo = s.dir === 'dr' ? b.loc : a.loc; if (BIG_CLOSED.includes(lo)) W.gates.push({ x: a.x1 + 14, y: a.yr, loc: lo }, { x: b.x0 - 14, y: b.yl, loc: lo }); }
    });
    W.width = cur + 600; W.endX = W.width;
    W.top = B.top; W.bottom = NET.bottom;
    W.locs = regions.map(r => ({ id: r.id, x0: r.x0, x1: r.x1, y0: r.y0, y1: r.y1, my: r.my }));
    // CHECKPOINTLAR: dam olish joylarida; boshlanish - Elf qishlog'i (qal'a)
    rests.forEach((c) => { if (!W.cps.some(q => Math.hypot(q.x - c.x, q.y - c.y) < 300)) W.cps.push(c); });
    const elfHub = hubs.find(h => h.loc === 'elf') || hubs[0];
    W.startCp = Math.max(0, elfHub ? W.cps.findIndex(c => c.y === elfHub.top.y && c.x >= elfHub.top.x && c.x <= elfHub.top.x + elfHub.top.w) : 0);
    // DUSHMANLAR joylashuvi: lager oroli va uning ustidagi pog'onalarda (otuvchilar - balandroqda, uchuvchilar - havoda)
    W.zones.forEach((z) => {
        // har zonaning o'z tasodifi: keyin yangi lokatsiya qo'shilsa ham oldingi joylardagi dushmanlar (va ularga bog'liq oraliq checkpointlar) siljimaydi
        const R = rng((seed ^ Math.imul(z.id, 0x9E3779B1)) >>> 0);
        if (z.boss) { z.spawns = [{ x: z.boss === 'bogcrab' && z.dx !== undefined ? z.dx : (z.x0 + z.x1) / 2 + 200, y: z.y1 - 60, k: z.boss }]; return; }   // krab - soxta tosh joyida
        if (z.kind === 'lurk') return;   // mimik - joyi qutilar yonida tayin
        if (z.kind === 'cave') {
            // g'or zali: season maxluqlari zal poli ustida
            const L1 = BIG_LOCS.find(l => l.id === z.loc)!, fl = W.plats.find(p => p.k.endsWith('floor') && p.x <= z.x0 && p.x + p.w >= z.x1 && p.y >= z.y0 && p.y <= z.y1 + 40);
            if (fl) for (let k = Math.min(R.int(3, 5), z.loc === 'snow' ? 3 : 9); k > 0; k--) z.spawns.push({ x: z.x0 + 30 + R.r() * (z.x1 - z.x0 - 60), y: fl.y, k: R.pick(L1.season) });
            return;
        }
        const L = BIG_LOCS.find(l => l.id === z.loc)!;
        if (z.layer === 'air') {
            const L0 = BIG_LOCS.find(l => l.id === z.loc)!;
            // uchmaydigan (o'rmon, qor bazasida uchuvchi yo'q) - havoda emas, oraliqdagi eng yaqin pog'ona-toshda turadi (aks holda jarlikka qulab tushardi)
            const steps = W.plats.filter(p => p.y >= z.y0 && p.y <= z.y1 + 40 && p.x + p.w > z.x0 && p.x < z.x1 && p.w >= 40);
            for (let k = R.int(2, 3); k > 0; k--) {
                const sp = { x: z.x0 + R.r() * (z.x1 - z.x0), y: z.y0 + R.int(160, 240), k: R.chance(0.5) ? L0.extra[0] : L0.enemies[3] };
                if (!ENEMIES[sp.k].fly) {
                    const st = steps.slice().sort((a, b) => Math.abs(a.x + a.w / 2 - sp.x) - Math.abs(b.x + b.w / 2 - sp.x))[0];
                    if (!st) continue;
                    sp.x = st.x + st.w / 2; sp.y = st.y;
                }
                z.spawns.push(sp);
            }
            return;
        }
        const tops = W.plats.filter(p => !p.k.endsWith('floor') && p.k !== 'lavabed' && p.k !== 'bogbed' && p.k !== 'lakebed' && p.w >= 80 && p.y >= z.y0 && p.y <= z.y1 + 40 && p.x + p.w > z.x0 && p.x < z.x1);
        if (!tops.length) return;
        const n = Math.min(z.kind === 'lone' ? 1 : z.kind === 'ambush' ? R.int(2, 3) : R.int(2, z.x1 - z.x0 > 500 ? 4 : 3), z.loc === 'snow' ? 3 : 9);   // qorda - ko'pi bilan 3 ta
        const E = (...ix: number[]) => ix.map(i => i >= 20 ? L.season[i - 20] : i >= 10 ? L.extra[i - 10] : L.enemies[i]);
        const pool = z.layer === 'air' ? E(3, 10) : z.layer === 'sky' ? E(3, 1, 5, 10, 10) : z.layer === 'under' ? E(4, 0, 2, 3, 5, 11, 12, 12) : z.kind === 'ambush' ? E(0, 4, 0, 12) : E(0, 1, 2, 5, 0, 4, 11, 12, 10);
        for (let k = 0; k < n; k++) {
            const kind = R.pick(pool), d = ENEMIES[kind];
            const cand = d.shot ? tops.slice().sort((a, b) => a.y - b.y).slice(0, 2) : tops;
            const p = R.pick(cand);
            // lager: dushmanlar o'yinchi keladigan tomondan nariroqda (o'ng yarmida) turadi
            const fx = z.kind === 'camp' ? 0.35 + R.r() * 0.6 : R.r();
            z.spawns.push({ x: p.x + 20 + fx * Math.max(1, p.w - 40), y: d.fly && !d.lurk ? p.y - R.int(90, 170) : p.y, k: kind });
        }
    });
    // KULBA-MIMIK yolg'iz turadi: atrofida (70 m) boshqa dushman bo'lmaydi - o'sha joydagi lager / qo'riqchilar olib tashlanadi (tasodifsiz)
    W.zones.forEach((hz) => {
        const h = hz.kind === 'lurk' ? hz.spawns.find(sp => sp.k === 'hutmimic' || sp.k === 'stumpmimic') : undefined;   // kulba / to'nka - yolg'iz
        if (h) W.zones.forEach((z) => { if (z !== hz && !z.boss) z.spawns = z.spawns.filter(sp => Math.abs(sp.x - h.x) > 700 || Math.abs(sp.y - h.y) > 300); });
    });
    // PORTALLAR: har lokatsiyaning bosh qishlog'ida (checkpoint yonida, o'sha orol ustida). Tasodif yo'q
    hubs.forEach((h) => {
        const ci = W.cps.findIndex(c => c.y === h.top.y && c.x >= h.top.x && c.x <= h.top.x + h.top.w), c = W.cps[ci];
        if (!c) return;
        const free = (x: number) => x - 55 >= h.top.x && x + 55 <= h.top.x + h.top.w && !W.shops.some(q => Math.abs(q.x - x) < 120 && Math.abs(q.y - c.y) < 10);
        const x = [130, -130, 190, -190, 80, -80, 250].map(d => c.x + d).find(free);
        if (x !== undefined) W.portals.push({ loc: h.loc, x, y: c.y, cp: ci });
    });
    W.portals.sort((p, q) => BIG_LOCS.findIndex(l => l.id === p.loc) - BIG_LOCS.findIndex(l => l.id === q.loc));
    // BALOT KRABI - yer yuzasida, oddiy botqoq yo'l ustida: keng tekis loy bo'lagi (qishloq, lager, checkpoint yo'q) balchiqqa aylanadi,
    // ustida krab qobig'iga o'xshash tosh-qobiqlar (crabshell) - sakrab o'tiladi; ulardan biri - haqiqiy krab (crabtop). Zona raqami / tartibi o'zgarmaydi. Tasodifsiz
    if (crabRoom) {
        const CR = crabRoom as { bog: BigWorld["bogs"][number], plats: BigPlat[], zone: BigZone, room: [number, number, number] }, z = CR.zone;
        const near = (q: { x: number, y: number }, s: BigPlat) => q.x > s.x - 120 && q.x < s.x + s.w + 120 && Math.abs(q.y - s.y) < 260;
        const segs = W.plats.filter(s => s.k === 'mud' && s.w >= 1000 && s.x > z.x0 - 30000 && s.x < z.x1 + 30000
            && !W.shops.some(q => near(q, s)) && !W.npcs.some(q => near(q, s)) && !W.cps.some(c => c.x > s.x + 60 && c.x < s.x + s.w - 60 && Math.abs(c.y - s.y) < 10)
            && !W.zones.some(q => q !== z && q.layer === 'ground' && q.x1 > s.x && q.x0 < s.x + s.w && q.y1 > s.y - 300 && q.y0 < s.y + 30)
            && !W.lakes.some(l => l.x < s.x + s.w && l.x + l.w > s.x) && !W.bogs.some(b => b !== CR.bog && b.x < s.x + s.w && b.x + b.w > s.x && Math.abs(b.y - s.y) < 60));
        const s = segs.sort((a, b) => b.w - a.w || a.x - b.x)[0];
        if (s) {
            W.bogs.splice(W.bogs.indexOf(CR.bog), 1);
            W.plats = W.plats.filter(p => !CR.plats.includes(p));
            const [rl, rr, rfy] = CR.room; W.chests.push({ id: ++cid, x: rr - 120, y: rfy, coins: 240 });   // bo'shagan maxfiy xona - xazina
            const fy = s.y, a0 = s.x + 200, a1 = s.x + s.w - 200, n = Math.max(4, Math.floor((a1 - a0) / 200)), fake = Math.floor(n * 0.6);
            W.bogs.push({ x: s.x + 120, y: fy, w: s.w - 240, t: 1 });   // t - yo'l ustidagi balchiq (yer bilan bir tekis chiziladi)
            let cx = 0;
            for (let i = 0; i < n; i++) { const sx = Math.round(a0 + (a1 - a0) * (i + 0.5) / n); if (i === fake) { cx = sx; plat(cx - 40, fy - 56, 130, 18, 'crabtop'); } else plat(sx - 40, fy - 56, 130, 18, 'crabshell'); }
            W.props = W.props.filter(p => !(p.x > a0 - 100 && p.x < a1 + 100 && Math.abs(p.y - fy) < 4 && p.k !== 'reeds' && p.k !== 'cattail'));   // yo'l ustida - faqat qamish
            // JANG POG'ONALARI: pastki qator (qobiqlardan sakrab chiqiladi - krab qisadi), tepada ikki qator (krab tosh otadi)
            const at = (q: number, w: number) => Math.round(a0 + (a1 - a0) * q - w / 2);
            [0.1, 0.5, 0.9].forEach(q => plat(at(q, 150), fy - 130, 150, 16, 'ledge'));
            [0.3, 0.7].forEach(q => plat(at(q, 160), fy - 250, 160, 16, 'ledge'));
            plat(at(0.5, 190), fy - 370, 190, 16, 'ledge');
            // maydon: krab faqat tekis yo'l ustida (cx0..cx1) yuradi, jang chegarasi - kengroq (o'yinchi qochib aylanishi mumkin)
            Object.assign(z, { x0: s.x - 220, x1: s.x + s.w + 220, y0: fy - 440, y1: fy + 30, layer: 'ground', dx: cx, dy: fy, cx0: s.x + 40, cx1: s.x + s.w - 40 });
        }
    }
    // uchuvchi dushman tosh ichida paydo bo'lmasin - bo'sh havogacha tepaga suriladi (tasodifsiz, saqlangan dunyolar o'zgarmaydi)
    const solid = (x: number, y: number) => W.isles.some(is => is.r.some(r => !r[4] && x > r[0] - 16 && x < r[0] + r[2] + 16 && y > r[1] - 24 && y < r[1] + r[3] + 16));
    W.zones.forEach(z => z.spawns.forEach((sp) => { if (!ENEMIES[sp.k] || !ENEMIES[sp.k].fly) return; for (let k = 0; k < 20 && solid(sp.x, sp.y - 10); k++) sp.y -= 40; }));
    return W;
}

// ===== O'YIN HOLATI (server) =====
export interface BigEnemy { id: number; k: string; x: number; y: number; vx: number; vy: number; hp: number; mx: number; f: number; st: string; t: number;
    tgt: string | null; lost: number; hx: number; hy: number; cd: number; atk: number; flash: number; zone: number; ground: boolean; move?: string; mt?: number;
    lvx?: number; jcd?: number; mi?: number; p2?: boolean; stun?: number; poison?: { delay: number, t: number, dps: number, owner: string };
    nl?: boolean;   // pog'onalardan o'tib ketadi (maxfiy xona bossi doim polda - pog'onalar o'yinchiga qochish joyi)
    af?: number;    // oddiy zarba yo'nalishi (tayyorlanganda o'yinchi qaysi tomonda edi)
    fz?: number; fk?: number; fs?: number;   // ferma: zombi qaysi ferma zonasidan (fz); boshqaruvchida - o'ldirilgan (fk) / chiqarilgan (fs)
    iv?: number; dig?: number;
    dk?: number;   // zarba koeffitsienti (lokatsiya kuchi): uning har zarbasi, o'qi, olovi shunga ko'paytiriladi              // kaltakesak ko'rinmas (tik); zombi yer ostidan o'yinchi yoniga chiqish kutishi
    // boss holatlari (bigboss.ts): hide - yer ostida / shiftda / g'oyib; shield, vuln - tik (qalqon / zaif); daze - gangib qolgan; ph, bst - hujum bosqichi
    hide?: string; shield?: number; vuln?: number; daze?: number; ph?: number; bst?: string; combo?: number; trail?: number; spin?: boolean; aimX?: number; goX?: number; fy?: number;
    life?: number; para?: boolean; block?: number; bcd?: number; ccd?: number;
    // set-piece bosslar (S1/S2 dagidek, bigboss.ts): ey - kraken ko'zi balandligi; tA/tB/tC - hujumlar navbati (tik); cc - o'yinchiga tegish kutishi; rn - dam olishgacha hujumlar
    ey?: number; tA?: number; tB?: number; tC?: number; cc?: { [pid: string]: number }; rn?: number; ak?: string; tk?: boolean;
    // muz xokkeychi: gx - darvoza joyi, pk - yerdagi shaybalar (o'q id), gl - darvoza tomon uchirilgan o'yinchi (shu tikkacha "gol" bo'lishi mumkin), sv - sirpanish tezligi, gHit - zarba darvozadan
    gx?: number; pk?: number[]; gl?: { [pid: string]: number }; sv?: number; gHit?: boolean; }   // tk - suhbat bo'lib o'tgan (semiz elf)   // ccd - to'qnashuv zarbasi kutishi (tik)   // life - yordamchining umri; para - parashyutda; block / bcd - robot bot qalqoni   // stun - ovchi qopqonida                    // lvx - sakrash (uchish) tezligi, jcd - sakrash kutishi, mi - boss hujum navbati
// k - o'q turi (klient rasmi): arrow, orb, fire, spore, web, rock, shock; gnd - yer bo'ylab yuguradigan to'lqin; home - nishonga burilish (kadr)
export interface BigShot { id: number; x: number; y: number; vx: number; vy: number; dmg: number; t: number; arc: boolean; k: string; gnd?: boolean; home?: number;
    // blast - portlash radiusi; fuse/sit - yerga tushib, pilik; roll - dumalovchi (radius), rmax/grow - o'sadi, bounce - chetdan qaytish; pierce - teshib o'tadi;
    // ret - qaytish tiki; split - tushganda parchalar; area - tushgan joyda dog'; fx - ta'sir; water - suvga tushsa so'nadi; sc - rasm kattaligi
    wait?: number;  // shu tikkacha joyida turadi (ko'rinmaydi, tegmaydi) - gorilla xarsangi shiftda
    idle?: boolean; // yerda yotgan shayba (xokkeychi kelib uradi): qimirlamaydi, tegmaydi
    nl?: boolean;   // pog'onalardan o'tib ketadi (maxfiy xona bossining toshi - o'yinchiga yoki polga tushadi)
    splitK?: string;   // tushganda parchalar turi (yo'q - muz)
    blast?: number; fuse?: number; sit?: number; roll?: number; rmax?: number; grow?: number; bounce?: number; pierce?: boolean; hitIds?: string[]; ret?: number; owner?: number;
    fx?: string; sc?: number; area?: string; split?: number; life?: number; spd?: number; kb?: number; water?: number; }
// HUJUM MAYDONI (bigboss.ts): ogohlantirish (warn) -> faol (t); k - ko'rinish ('fall:rock', 'pillar:void', 'beam:frost', 'breath:fire', 'patch:acid', 'cloud:spore', 'slam:tentacle', 'tongue'...)
export interface BigArea { kx?: number; id: number; k: string; x: number; y: number; w: number; h: number; x2?: number; y2?: number; warn: number; t: number; t0?: number; dmg: number; every: number;
    dk?: 'shot' | 'hit' | 'ground'; fx?: string; kb?: number[]; seek?: number; att?: number; ox?: number; oy?: number; f?: number; cx?: number; hit?: string[]; next?: number;
    owner?: number; after?: Partial<BigArea>; drain?: number; spawn?: string; grow?: number; zone?: number; }   // zone - qaysi boss maydoniga tegishli (faqat o'shanisi tozalanadi)
export interface BigHazard { x: number; y: number; t: number; r: number; dmg: number; k: string; }
export interface BigPShot { id: number; x: number; y: number; vx: number; vy: number; owner: string; t: number; }   // o'yinchi qor to'pi   // yerdan otilib chiqadigan tikan / ildiz (oldin belgi)
export interface BigState {
    sgrid: Map<number, number[][]>;   // orollarning qattiq tosh qismlari (devorlar)
    w: BigWorld; grid: Map<number, BigPlat[]>; enemies: BigEnemy[]; shots: BigShot[]; hazards: BigHazard[]; pshots: BigPShot[]; seq: number; tick: number;
    cp: number; zoneState: { [id: number]: { st: 'active' | 'done', at: number } }; chests: { [id: number]: boolean };
    dead: { [pid: string]: number }; ended: boolean;
    paid: { [zone: number]: boolean };   // boss birinchi marta o'ldirilgan (o'rganilgan foiz, topshiriqlar, qafaslar; to'liq mukofot bir marta)
    down: { [zone: number]: number };    // o'lik turgan bosslar: o'ldirilgan vaqt (ms) - RESPAWN.boss dan keyin qaytadi
    gcrush: { [zone: number]: { i: number, st: string, t: number, y: number, riders: string[] } };
    dkm: { [enemyId: number]: number };   // dushman zarba koeffitsienti (o'lganidan keyin ham - uchib ketayotgan o'qlari uchun)   // grotoda shiftga urilayotgan platforma
    fast?: boolean;                      // test rejimi (localhost): dushmanlar va bosslar tezroq qaytadi
    best: { [pid: string]: number };     // har o'yinchining shu o'yindagi eng uzoq x (reyting uchun)
    leash: { [zone: number]: number };   // boss maydonidan hamma uzoqlashgan vaqt (tik)
    fell: { [pid: string]: boolean };    // 60 m dan yiqilib o'ldi (feniks joyida tiriltirmaydi)
    burn: { [pid: string]: number };     // lavada keyingi kuyish vaqti (tik)
    areas: BigArea[];                    // boss hujum maydonlari
    dots: { [pid: string]: { until: number, dps: number, next: number, k: string } };   // kuyish / zahar
    pv: { [pid: string]: { x: number, y: number, vx: number, vy: number } };   // o'yinchi tezligi (bosslar oldindan mo'ljal oladi - S1/S2 dagidek)
    pcp: { [pid: string]: number };      // har o'yinchining tirilish joyi - oxirgi tekkan checkpointi (bo'lmasa - umumiy cp)
    got: { [cp: number]: boolean };
    trigOn: { [zone: number]: boolean };                 // E bilan chaqirilgan bosslar (robot ilon)
    gifts: { [zone: number]: { at: number, ids: { [pid: string]: boolean } } };   // Alter Qor Bobo: archa oldida sovg'a olganlar (hamma olsa - jang)
    talkReq: { [zone: number]: boolean };                // E bosildi - suhbat (semiz elf)
    talkDone: { [zone: number]: { [pid: string]: boolean } };   // suhbatni o'qib bo'lganlar      // ochilgan checkpointlar (dunyo egasida saqlanadi; portallar, xarita, foiz)
    gotN: number;
}
// Engine bilan bog'lanish: zarar, o'ldirish, mukofot, xabarlar
export interface BigCtx {
    emit(ev: string, data: object): void;
    emitTo(pid: string, ev: string, data: object): void;
    hurt(p: PlayerState, dmg: number): void;
    kill(p: PlayerState): void;
    reward(p: PlayerState, coins: number, xp?: number, boost?: boolean): void;   // boost - XP kuchaytirgich bonusi qo'shiladi
    knock(p: PlayerState, vx: number, vy: number): void;                         // o'yinchini uloqtirish / tortish (klient tezligi)
    saveCp(p: PlayerState, cp: number): void;      // o'yinchining oxirgi tekkan checkpointi (keyingi o'yin shu joydan)
    saveGot(cp: number): void;                     // dunyo egasiga: checkpoint ochildi
    saveQuest(p: PlayerState, q: string, st: number): void;   // topshiriq holati (hisobda)
    takeItem?(p: PlayerState, item: string, cb: (left: number) => void): void;   // sumkadan bitta narsa (-1 - yo'q)
    mageHome?(p: PlayerState): void;               // Balot Magi o'yinchining fermasiga ko'chadi
    curse(p: PlayerState): void;                   // semiz elf so'lagi: jon o'zi tiklanmaydi (do'kondagi Eliksir bilan tuzaladi)
    saveChest(id: number): void;          // dunyo egasiga: sandiq ochildi
    saveKill(zone: number): void;         // dunyo egasiga: boss o'ldirildi
    saveKillAt(zone: number, t: number): void;
    dmgK?: number;                        // hozir urayotgan dushmanning zarba koeffitsienti (hurtBig ko'paytiradi)   // dunyo egasiga: boss qachon o'ldirildi (qaytish vaqti uchun)
    worldDone(endM: number): void;        // dunyo oxiriga yetildi: shu masofa uchun mukofot olindi (dunyo saqlanib qoladi - yangi lokatsiya qo'shilsa davom etadi)
    progress(p: PlayerState, meters: number, pct: number): void;   // reyting: eng uzoq masofa va foiz
    bossKill(p: PlayerState): void;                                // reyting: o'ldirilgan bosslar soni
    daily?(p: PlayerState, kind: string, n: number): void;          // kundalik vazifalar (kills / bosses / maps)
}
const CELL = 400, GRAV = 1300;
const T = (ms: number) => Math.round(ms / 30);
// startCp - xo'jayin oxirgi tekkan checkpoint (yo'q / noto'g'ri bo'lsa - Elf qishlog'i), got - ochilgan checkpointlar
export function createBigState(seed: number, startCp: number, opened: number[] = [], killed: number[] = [], doneM = 0, got: number[] = [], killAt: { [z: string]: number } = {}): BigState {
    const w = generateWorld(seed);
    if (!(Number.isInteger(startCp) && startCp >= 0 && startCp < w.cps.length)) startCp = w.startCp;
    const grid = new Map<number, BigPlat[]>();
    w.plats.forEach((p) => {
        for (let c = Math.floor(p.x / CELL); c <= Math.floor((p.x + p.w) / CELL); c++) { if (!grid.has(c)) grid.set(c, []); grid.get(c)!.push(p); }
    });
    // DEVORLAR: klientda o'yinchi o'tolmaydigan qismlar - orollarning tosh bo'laklari (ichki xona orqa devori - q[4] - emas)
    // va qalin (22 px dan baland) platformalar, masalan, yer osti xonasining shifti - dushmanlar ham o'tolmasin
    const sgrid = new Map<number, number[][]>();
    const addSolid = (q: number[]) => { for (let c = Math.floor(q[0] / CELL); c <= Math.floor((q[0] + q[2]) / CELL); c++) { if (!sgrid.has(c)) sgrid.set(c, []); sgrid.get(c)!.push(q); } };
    w.isles.forEach(I => I.r.forEach((q) => { if (!q[4]) addSolid(q); }));
    w.plats.forEach((p) => { if (p.h > 22) addSolid([p.x, p.y, p.w, p.h]); });
    if (bigCpClosed(w, startCp)) startCp = w.startCp;   // yopiq lokatsiyada qolgan - boshlang'ich qishloqda tug'iladi
    const S: BigState = { w, grid, sgrid, enemies: [], shots: [], hazards: [], pshots: [], seq: 0, tick: 0, cp: Math.max(0, Math.min(w.cps.length - 1, startCp)), zoneState: {}, chests: {}, dead: {}, ended: false, paid: {}, down: {}, gcrush: {}, dkm: {}, best: {}, leash: {}, fell: {}, burn: {}, areas: [], dots: {}, pv: {}, pcp: {}, got: {}, gotN: 0, trigOn: {}, gifts: {}, talkReq: {}, talkDone: {} };
    [w.startCp, S.cp, ...got].forEach(i => { if (Number.isInteger(i) && w.cps[i] && !S.got[i]) { S.got[i] = true; S.gotN++; } });
    // OLDINGI O'YINDAN: ochilgan sandiqlar ochiq, o'ldirilgan bosslar o'lik qoladi (qayta mukofot yo'q)
    opened.forEach(id => { if (w.chests.some(c => c.id === id)) S.chests[id] = true; });
    killed.forEach(id => { const z = w.zones.find(q => q.id === id && q.boss); if (z) { S.paid[id] = true; S.zoneState[id] = { st: 'done', at: 0 }; S.down[id] = Number(killAt[id]) || 0; } });   // vaqti noma'lum (eski) - uzoq o'tgan
    // shu oxir uchun mukofot allaqachon olingan (dunyo keyin uzaytirilsa - yangi oxirida yana beriladi)
    if (doneM > 0) S.ended = true;   // butun dunyo o'rganilgani uchun mukofot olingan
    return S;
}
// O'RGANILGAN FOIZ: ochilgan checkpointlar va o'ldirilgan bosslar butun dunyodagisiga nisbatan
export function bigExplored(S: BigState): { n: number, pct: number } {
    const bosses = S.w.zones.filter(z => z.boss).length, paid = Object.keys(S.paid).length, n = S.gotN + paid;
    return { n, pct: Math.round(Math.min(100, n / Math.max(1, S.w.cps.length + bosses) * 100) * 10) / 10 };
}
export function bigSpawnPoint(S: BigState, i: number, pid?: string): { x: number, y: number } {
    const c = S.w.cps[pid !== undefined && S.pcp[pid] !== undefined ? S.pcp[pid] : S.cp] || { x: 200, y: 0 };
    return { x: c.x + (i % 4) * 26 - 39, y: c.y - 26 };
}
// (x, oyoq y) dan pastdagi eng yaqin sirt - maxDrop px gacha
export function surfaceBelow(S: BigState, x: number, y: number, maxDrop: number, noLedge = false): BigPlat | null {
    const cell = S.grid.get(Math.floor(x / CELL));
    let best: BigPlat | null = null;
    if (cell) for (const p of cell) if (x >= p.x && x <= p.x + p.w && p.y >= y - 6 && p.y <= y + maxDrop && (!best || p.y < best.y) && p.k !== 'spikes' && !(noLedge && p.k === 'ledge')) best = p;
    return best;
}
// qahramon turgan sirt (yovvoyi ajdarcha qo'nishi uchun): oyog'i ostidagi pog'ona / orol
export function bigSurfaceAt(S: BigState, x: number, feet: number): BigPlat | null {
    const p = surfaceBelow(S, x, feet - 6, 12);
    return p && p.k !== 'ledge' && p.k !== 'crabtop' && p.k !== 'crabshell' ? p : null;
}
// Tashqi tizimlar uchun (ovchi minasi / qopqoni): (x, y) dan pastdagi sirt balandligi, yo'q bo'lsa - null
export function bigSurfaceY(S: BigState, x: number, y: number, maxDrop = 4000): number | null {
    const p = surfaceBelow(S, x, y, maxDrop);
    return p ? p.y : null;
}
// do'kon yonidami (qishloqdagi rasta)
export function bigShopNear(S: BigState, p: PlayerState, range = 150): boolean {
    return S.w.shops.some(s => Math.abs(p.x - s.x) <= range && Math.abs(p.y + 24 - s.y) < 120);
}
// dushman tanasi (markaz x, oyoq y) tosh devorga kiradimi (oyoq / boshdagi 6 px - tepasida turish, shift ostida yurish uchun zaxira)
function inSolid(S: BigState, x: number, y: number, w: number, h: number): boolean {
    const x0 = x - w / 2, x1 = x + w / 2, y0 = y - h + 6, y1 = y - 6;
    for (let c = Math.floor(x0 / CELL); c <= Math.floor(x1 / CELL); c++) {
        const cell = S.sgrid.get(c);
        if (cell) for (const q of cell) if (x0 < q[0] + q[2] && x1 > q[0] && y0 < q[1] + q[3] && y1 > q[1]) return true;
    }
    return false;
}
// o'yinchi tanasi (markaz x, y; 24x48)
export const pRect = (p: PlayerState) => ({ x: p.x - 12, y: p.y - 24, w: 24, h: 48 });
export const eRect = (e: BigEnemy, d: EnemyDef) => ({ x: e.x - d.w / 2, y: e.y - d.h, w: d.w, h: d.h });
export const overlap = (a: { x: number, y: number, w: number, h: number }, b: { x: number, y: number, w: number, h: number }) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export function spawnEnemy(S: BigState, k: string, x: number, y: number, zone: number): BigEnemy {
    const d = ENEMIES[k];
    const e: BigEnemy = { id: ++S.seq, k, x, y, vx: 0, vy: 0, hp: d.hp, mx: d.hp, f: -1, st: d.lurk ? 'lurk' : 'idle', t: 0, tgt: null, lost: 0, hx: x, hy: y, cd: 30 + Math.floor(Math.random() * 40), atk: 0, flash: 0, zone, ground: !d.fly };
    if (d.boss && S.w.zones.some(z => z.id === zone && z.secret)) e.nl = true;
    powerUp(S, e, d);
    S.enemies.push(e);
    return e;
}
export const BOSS_MINION: { [k: string]: string } = { fatelf: 'zveg', kraken: 'mosquito', skyship: 'bat', yetiking: 'frostling', icequeen: 'wraith', mammoth: 'icecrawler', warlord: 'goblin', shadowknight: 'imp', golem: 'slime', alpha: 'wolf', ancient: 'myconid', spiderqueen: 'spider',
    magmatitan: 'emberling', boneking: 'bonearcher', hellhound: 'firebat', magmaworm: 'emberbeetle', hydra: 'leech', toadking: 'leech', bigcroc: 'leech' };
// o'q turlari (klientdagi rasm)
const SHOT_K: { [k: string]: string } = { hspear: 'spear', gobarcher: 'arrow', bandit: 'arrow', darkmage: 'orb', shadowknight: 'orb', wisp: 'orb', imp: 'fire', frog: 'spore', myconid: 'spore', ancient: 'spore', spiderqueen: 'web',
    snowballer: 'snow', snowman: 'snow', frostmage: 'ice', wraith: 'ice', icequeen: 'ice', fatelf: 'acid', kraken: 'ink', skyship: 'orb', darkelf: 'dark',
    bonearcher: 'fire', cultist: 'fire', gazer: 'orb', magmablob: 'lava', boneking: 'orb', hellhound: 'fire', magmaworm: 'fire',
    spitter: 'acid', bogwitch: 'spore', bogspirit: 'spore', hydra: 'acid', toadking: 'acid', snowkid: 'icesnow' };
export const CHILL = { snow: 1, ice: 1, icesnow: 1, snowboulder: 1, puck: 1, bfspit: 1, greenorb: 1 } as { [k: string]: number };   // tegsa - qahramon 1.4 s sekinlashadi (muzlaydi)
// O'ldirganga tajriba: maydalar 5, o'rtachalar 10, kuchlilar 15 (lurk/maxsuslar - xp bilan)
const killXp = (d: EnemyDef) => d.xp || (d.hp > 200 ? 15 : d.hp >= 80 ? 10 : 5);
// O'YINCHI QOR TO'PLARI: yoy bo'ylab uchadi, tekkan dushmanni muzlatadi (qisqa to'xtaydi)
export const SNOW = { max: 10, grab: 5, speed: 540, dmg: 14, freezeTicks: 28, cdTicks: 12 };
export function bigSnowGrab(S: BigState, p: PlayerState): boolean {
    if (p.isDead || !S.w.piles.some(q => Math.abs(q.x - p.x) < 80 && Math.abs(q.y - (p.y + 24)) < 70)) return false;
    p.snowballs = Math.min(SNOW.max, (p.snowballs || 0) + SNOW.grab);
    return true;
}
export function bigSnowThrow(S: BigState, p: PlayerState, angle: number): boolean {
    if (p.isDead || !(p.snowballs! > 0) || (p.snowCd || 0) > S.tick || !Number.isFinite(angle)) return false;
    p.snowballs!--; p.snowCd = S.tick + SNOW.cdTicks;
    S.pshots.push({ id: ++S.seq, x: p.x + Math.cos(angle) * 16, y: p.y - 10, vx: Math.cos(angle) * SNOW.speed, vy: Math.sin(angle) * SNOW.speed, owner: p.id, t: 0 });
    return true;
}

export function updateBig(room: RoomState, S: BigState, ctx: BigCtx, dt: number): void {
    S.tick++;
    const W = S.w, players = Object.values(room.players), alive = players.filter(p => !p.isDead);
    const now = S.tick;
    // O'LGANLAR: ~3 s dan keyin oxirgi checkpointda tiriladi
    players.forEach((p, i) => {
        if (p.isDead) delete S.dots[p.id];
        if (!p.isDead) { delete S.dead[p.id]; if (p.y > W.bottom) { S.fell[p.id] = true; ctx.kill(p); } else S.best[p.id] = Math.max(S.best[p.id] || 0, p.x); return; }
        // FENIKS PATI: o'lgan joyning o'zida (yiqilib o'lmagan bo'lsa) 0.6 s dan keyin 50% jon bilan tiriladi
        if (S.dead[p.id] === undefined && p.buffs && p.buffs.phoenix && !S.fell[p.id]) {
            p.buffs.phoenix = false;
            S.dead[p.id] = -1;
            p.isDead = false; p.hp = (p.maxHp || 100) * 0.5; p.stamina = p.maxStamina || 100;
            ctx.emit('bigPhoenix', { id: p.id, x: Math.round(p.x), y: Math.round(p.y) });
            return;
        }
        if (S.dead[p.id] === undefined) S.dead[p.id] = now + BIG.respawnTicks;
        if (now >= S.dead[p.id]) {
            delete S.fell[p.id];
            delete S.dead[p.id];
            const sp = bigSpawnPoint(S, i, p.id);
            p.isDead = false; p.hp = p.maxHp || 100; p.stamina = p.maxStamina || 100; p.x = sp.x; p.y = sp.y;
            ctx.emitTo(p.id, 'teleport', { x: p.x, y: p.y });
            ctx.emit('bigRespawn', { id: p.id, x: Math.round(p.x), y: Math.round(p.y) });
            resetAhead(S, alive);
        }
    });
    // O'YINCHI TEZLIGI (pozitsiyani klient yuboradi): bosslar yugurayotgan o'yinchiga oldindan mo'ljal oladi
    alive.forEach((p) => {
        const o = S.pv[p.id];
        if (!o || Math.abs(p.x - o.x) > 400 || Math.abs(p.y - o.y) > 400) { S.pv[p.id] = { x: p.x, y: p.y, vx: 0, vy: 0 }; return; }
        o.vx += ((p.x - o.x) / dt - o.vx) * 0.25; o.vy += ((p.y - o.y) / dt - o.vy) * 0.25; o.x = p.x; o.y = p.y;
    });
    Object.keys(S.pv).forEach(id => { if (!room.players[id]) delete S.pv[id]; });
    Object.keys(S.pcp).forEach((id) => { if (!room.players[id]) delete S.pcp[id]; });
    // LAVA: ko'l ichida turgan o'yinchi kuyadi (zirh yordam bermaydi); OLOV FAVVORALARI - o'yinchi yaqinida navbat bilan
    alive.forEach((p) => {
        const feet = p.y + 24;
        if ((S.burn[p.id] || 0) > now || !W.lavas.some(l => p.x > l.x + 2 && p.x < l.x + l.w - 2 && feet > l.y - 12 && feet < l.y + 14)) return;
        S.burn[p.id] = now + T(LAVA.everyMs);
        hurtBig(p, LAVA.dmg, ctx, 'ground');
        ctx.emitTo(p.id, 'bigBurn', { x: Math.round(p.x), y: Math.round(feet) });
    });
    // KRAKEN KO'LI: chuqur suvda turgan o'yinchi jon yo'qotadi (zirh yordam bermaydi)
    alive.forEach((p) => {
        const feet = p.y + 24;
        if ((S.burn[p.id] || 0) > now || !W.lakes.some(l => p.x > l.x + 4 && p.x < l.x + l.w - 4 && feet > l.y + 14 && feet < l.y + 60)) return;
        S.burn[p.id] = now + T(SWAMP.waterMs);
        hurtBig(p, SWAMP.waterDmg, ctx, 'ground');
        ctx.emitTo(p.id, 'bigBurn', { x: Math.round(p.x), y: Math.round(feet), w: 1 });
    });
    W.vents.forEach((v, i) => {
        if ((now + i * 37) % T(LAVA.ventMs) !== 0 || !alive.some(p => Math.abs(p.x - v.x) < 900 && Math.abs(p.y - v.y) < 500)) return;
        const hk = v.k || 'fire';
        S.hazards.push({ x: v.x, y: v.y, t: T(900), r: 40, dmg: hk === 'gas' ? SWAMP.gasDmg : LAVA.ventDmg, k: hk });
        ctx.emit('bigBossMove', { m: 'mark', k: hk, x: v.x, y: v.y, ms: 900 });
    });
    // YOPIQ LOKATSIYA: qandaydir yo'l bilan (masalan, "pat" tumori bilan botqoqdan sakrab) ichiga tushib qolgan - o'z checkpointiga qaytadi
    if (BIG_CLOSED.length && S.tick % 10 === 0) alive.forEach((p) => {
        const L = W.locs.find(l => BIG_CLOSED.includes(l.id) && p.x >= l.x0 && p.x < l.x1 && p.y + 24 >= l.y0 + 150 && p.y + 24 < l.y1);
        if (!L) return;
        if (S.pcp[p.id] !== undefined && bigCpClosed(W, S.pcp[p.id])) delete S.pcp[p.id];
        const sp = bigSpawnPoint(S, 0, p.id); p.x = sp.x; p.y = sp.y;
        delete S.dots[p.id];
        ctx.emitTo(p.id, 'teleport', { x: p.x, y: p.y }); ctx.emitTo(p.id, 'bigMage', { err: 'big_loc_closed' });
    });
    // CHECKPOINT: o'yinchi uning yoniga kelsa - ochiladi (hamma uchun) va shu o'yinchining tirilish joyi bo'ladi
    alive.forEach((p) => {
        const feet = p.y + 24;
        const i = W.cps.findIndex(c => Math.abs(c.x - p.x) < 70 && Math.abs(c.y - feet) < 50);
        if (i < 0) return;
        if (S.pcp[p.id] !== i) { S.pcp[p.id] = i; ctx.saveCp(p, i); ctx.emitTo(p.id, 'bigCpMine', { i }); }
        if (S.got[i]) return;
        S.got[i] = true; S.gotN++;
        ctx.emit('bigCp', { i, x: W.cps[i].x, y: W.cps[i].y });
        ctx.saveGot(i);
        if (ctx.daily) players.forEach(q => ctx.daily!(q, 'maps', 1));   // yangi checkpoint - kundalik "xarita" vazifasi
        bigProgressAll(S, players, ctx);
    });
    // LAGERLAR / PISTIRMALAR / BOSSLAR
    W.zones.forEach((z) => {
        const zs = S.zoneState[z.id];
        if (zs && zs.st === 'active') {
            if (!S.enemies.some(e => e.zone === z.id)) { S.zoneState[z.id] = { st: 'done', at: now }; if (z.boss) return; }
            if (z.boss) {
                // JANG MAYDONIDAN CHIQIB KETILSA (devor yo'q - chiqish mumkin): ~1.2 s dan keyin jang to'xtaydi, boss to'liq jon bilan joyiga qaytadi
                const near = alive.some(p => p.x > z.x0 - 80 && p.x < z.x1 + 80 && p.y + 24 >= z.y0 - 120 && p.y + 24 <= z.y1 + 140)
                    || (z.boss === 'zvfarm' && alive.length > 0);   // ferma: chegara yo'q - zombilar o'yinchi qayerda bo'lmasin quvadi (hamma o'lsa - qayta tiklanadi)
                S.leash[z.id] = near ? 0 : (S.leash[z.id] || 0) + 1;
                if (S.leash[z.id] > T(1200)) {
                    dropZoneShots(S, z.id);   // boss otgan minalar / sovg'alar / shaybalar ham (aks holda keyin kelganda portlardi)
                    S.enemies = S.enemies.filter(e => e.zone !== z.id);
                    S.areas = S.areas.filter(a => a.zone !== z.id); delete S.zoneState[z.id]; S.leash[z.id] = 0; delete S.trigOn[z.id]; delete S.gifts[z.id]; delete S.talkReq[z.id]; if (S.gcrush[z.id]) { ctx.emit('bigCrush', { i: S.gcrush[z.id].i, st: 'idle' }); delete S.gcrush[z.id]; }
                    stopPull(players, z, ctx);   // muz bo'roni tortishi to'xtaydi (faqat shu maydon atrofidagilarda)
                    ctx.emit('bigBossReset', { k: z.boss });
                }
            }
            return;
        }
        // tozalangan lager - 20 daqiqadan keyin, o'ldirilgan boss - 50 daqiqadan keyin (o'yinchilar uzoqda bo'lsa) o'z joyida qayta tiklanadi
        if (zs && zs.st === 'done') {
            const pad = z.boss ? 0 : 700;   // boss - maydonga kirib kelganda chiqadi (yonida kutib turgan bo'lsa ham qaytadi); lager - ko'z oldida paydo bo'lmasin
            if (alive.some(p => Math.abs(p.x - (z.x0 + z.x1) / 2) < (z.x1 - z.x0) / 2 + pad && Math.abs(p.y - (z.y0 + z.y1) / 2) < (z.y1 - z.y0) / 2 + (z.boss ? 0 : 500))) return;
            if (z.boss === 'swampmage' && S.paid[z.id]) return;   // Balot Magi: yengilgandan keyin - tinch (jang boshlanmaydi)
            if (z.boss) { if (Date.now() - (S.down[z.id] || 0) < (S.fast ? RESPAWN.bossFast : RESPAWN.boss)) return; delete S.down[z.id]; delete S.trigOn[z.id]; delete S.gifts[z.id]; }
            else if (now - zs.at < T(S.fast ? RESPAWN.campFast : RESPAWN.camp)) return;
            delete S.zoneState[z.id];
            return;   // keyingi kadrda - oddiy tartibda (o'yinchi yaqinlashganda) chiqadi
        }
        // LAGER (va yashirin mimik): dushmanlar o'yinchi ko'rmasdan oldin (ekrandan tashqarida) o'z joyida paydo bo'lib, qo'riqlab turadi.
        // PISTIRMA va BOSS: o'yinchi ichiga kirganda (to'satdan) chiqadi
        if (z.trig && !S.trigOn[z.id]) {   // robot ilon - teshik oldida E bosilganda chiqadi
            const gf = S.gifts[z.id];   // Alter Qor Bobo: kimdir sovg'a olgan, qolganlar 20 s ichida olmadi - endi kutmaydi
            if (!gf || now - gf.at < T(20000)) return;
            S.trigOn[z.id] = true;
        }
        const camp = z.kind === 'camp' || z.kind === 'lone' || z.kind === 'lurk' || z.kind === 'cave';
        const trigger = camp ? alive.some(p => p.x >= z.x0 - 900 && p.x <= z.x1 + 300 && Math.abs(p.y - (z.y0 + z.y1) / 2) < 700)
            // boss: o'yinchi maydon ICHIGA kirgandagina (chetidan 30 px ichkarida) - devorlar uning ORQASIDA ko'tariladi, oldini to'smaydi
            : alive.some(p => (z.boss ? p.x >= z.x0 + 30 && p.x <= z.x1 - 30 : p.x >= z.x0 - 60 && p.x <= z.x1 + 60) && p.y >= z.y0 + (z.boss && z.layer === 'ground' ? 220 : 0) && p.y <= z.y1 + 60);
        if (!trigger) return;
        S.zoneState[z.id] = { st: 'active', at: now };
        z.spawns.forEach(sp => {
            const e = spawnEnemy(S, sp.k, sp.x, sp.y, z.id);
            if (!camp) { e.st = 'chase'; e.tgt = nearest(alive, e)?.id || null; }
        });
        if (!camp && z.boss !== 'bogcrab') ctx.emit(z.boss ? 'bigBoss' : 'bigAmbush', { z: z.id, k: z.boss || '', secret: !!z.secret, pts: z.spawns.map(s => [Math.round(s.x), Math.round(s.y)]) });
    });
    // DUSHMANLAR
    for (let i = S.enemies.length - 1; i >= 0; i--) {
        const e = S.enemies[i], d = ENEMIES[e.k];
        if (e.flash > 0) e.flash--;
        if (e.cd > 0) e.cd--;
        if (e.jcd) e.jcd--;
        // hamma o'yinchidan juda uzoq - yo'qoladi (lager keyin qayta ishlashi mumkin)
        if (!d.boss && e.fz === undefined && !alive.some(p => Math.abs(p.x - e.x) < 2600 && Math.abs(p.y - e.y) < 1500)) {
            S.enemies.splice(i, 1);
            if (!S.enemies.some(o => o.zone === e.zone)) delete S.zoneState[e.zone];
            continue;
        }
        ctx.dmgK = e.dk || 1; try { enemyAI(S, e, d, alive, room, ctx, dt); } finally { ctx.dmgK = 1; }   // xato bo'lsa ham koeffitsient boshqa zarbalarga o'tib qolmasin
        if (e.y > W.bottom) S.enemies.splice(i, 1);
    }
    // ZAHAR (ovchi drotigi): kechikishdan keyin har 10 tikda
    for (const e of S.enemies.slice()) {
        const P = e.poison;
        if (!P) continue;
        if (P.delay > 0) { P.delay--; continue; }
        if (--P.t <= 0) { e.poison = undefined; continue; }
        if (P.t % 10 === 0) damageEnemy(S, room, e, P.dps / 3, room.players[P.owner], ctx);
    }
    // O'YINCHI QOR TO'PLARI
    for (let i = S.pshots.length - 1; i >= 0; i--) {
        const s = S.pshots[i];
        s.t++; s.vy += 600 * dt; s.x += s.vx * dt; s.y += s.vy * dt;
        let gone = s.t > 120;
        const e = !gone && bigFindEnemy(S, { x: s.x - 8, y: s.y - 8, w: 16, h: 16 });
        if (e) {
            if (!ENEMIES[e.k].boss) e.stun = Math.max(e.stun || 0, SNOW.freezeTicks);   // bosslar muzlamaydi
            damageEnemy(S, room, e, SNOW.dmg, room.players[s.owner], ctx);
            ctx.emit('bigSnowHit', { x: Math.round(s.x), y: Math.round(s.y), e: 1 });
            gone = true;
        } else if (!gone && s.vy >= 0) { const g = surfaceBelow(S, s.x, s.y - s.vy * dt, s.vy * dt + 2); if (g && s.y >= g.y) { ctx.emit('bigSnowHit', { x: Math.round(s.x), y: Math.round(g.y) }); gone = true; } }
        if (gone) S.pshots.splice(i, 1);
    }
    // YERDAN OTILIB CHIQADIGANLAR (boss): belgidan keyin - ustida turganlarga zarba
    for (let i = S.hazards.length - 1; i >= 0; i--) {
        const h = S.hazards[i];
        if (--h.t > 0) continue;
        alive.forEach(q => { if (Math.abs(q.x - h.x) < h.r && Math.abs(q.y + 24 - h.y) < 70) { hurtBig(q, h.dmg, ctx, 'ground'); if (h.k === 'ice') ctx.emitTo(q.id, 'bigChill', { ms: 1400 }); if (h.k === 'gas') ctx.emitTo(q.id, 'bigChill', { ms: SWAMP.gasSlowMs, gas: 1 }); } });
        ctx.emit('bigBossMove', { m: 'erupt', k: h.k, x: Math.round(h.x), y: Math.round(h.y) });
        S.hazards.splice(i, 1);
    }
    // DUSHMAN O'QLARI va BOSS HUJUM MAYDONLARI
    updateShots(S, alive, ctx, dt);
    updateAreas(S, alive, ctx, dt);
}
// O'RGANILGAN FOIZ (reyting) va hammasi o'rganilsa - mukofot (bir marta)
export function bigProgressAll(S: BigState, players: PlayerState[], ctx: BigCtx): void {
    const ex = bigExplored(S);
    players.forEach(p => ctx.progress(p, ex.n, ex.pct));
    if (!S.ended && ex.pct >= 100) {
        S.ended = true;
        ctx.emit('bigEnd', {});
        players.forEach(p => ctx.reward(p, 300, 150));
        ctx.worldDone(1);
    }
}
// O'LGANDAN KEYIN: hamma o'yinchidan uzoqdagi (15 m dan ko'p) lagerlar, pistirmalar va bosslar boshidan tiklanadi
// (o'ldirilgan maxluqlar yana o'z joyida). Tirik o'yinchi yaqinida jang ketayotgan joyga tegilmaydi
function resetAhead(S: BigState, alive: PlayerState[]): void {
    S.w.zones.forEach((z) => {
        const cxz = (z.x0 + z.x1) / 2, cyz = (z.y0 + z.y1) / 2;
        if ((S.zoneState[z.id] && S.zoneState[z.id].st === 'done') || alive.some(q => Math.abs(q.x - cxz) < (z.x1 - z.x0) / 2 + 1500 && Math.abs(q.y - cyz) < 1200)) return;
        if (S.enemies.some(e => e.zone === z.id) || S.zoneState[z.id]) {
            if (z.boss) dropZoneShots(S, z.id);
            S.enemies = S.enemies.filter(e => e.zone !== z.id);
            delete S.zoneState[z.id]; delete S.trigOn[z.id]; delete S.gifts[z.id]; delete S.gcrush[z.id];
            if (z.boss) S.areas = S.areas.filter(a => a.zone !== z.id);
        }
    });
}
// maydon tiklandi: shu maydon dushmanlari otgan o'qlar ham yo'qoladi
function dropZoneShots(S: BigState, zid: number): void {
    const ids = new Set(S.enemies.filter(e => e.zone === zid).map(e => e.id));
    if (ids.size) S.shots = S.shots.filter(s => !s.owner || !ids.has(s.owner));
}
// boss o'ldi / qayta tiklandi: uning muz bo'roni tortishi shu maydon atrofidagilarda to'xtaydi
function stopPull(list: PlayerState[], z: BigZone, ctx: BigCtx): void { list.forEach(q => { if (q.x > z.x0 - 900 && q.x < z.x1 + 900) ctx.emitTo(q.id, 'bigPull', { x: 0, ms: 0 }); }); }
export function nearest(list: PlayerState[], e: { x: number, y: number }): PlayerState | null {
    let best: PlayerState | null = null, bd = 1e9;
    list.forEach(p => { const d = Math.abs(p.x - e.x) + Math.abs(p.y - e.y) * 1.5; if (d < bd) { bd = d; best = p; } });
    return best;
}
// Ritsar qalqoni: zararning katta qismini to'sadi
// kind: 'shot' - o'q / otilgan narsa (zirh oladi), 'hit' - yaqin zarba, 'ground' - yerdan chiqqan / yer to'lqini (zirhga qaramaydi)
export function hurtBig(p: PlayerState, dmg: number, ctx: BigCtx, kind: 'shot' | 'hit' | 'ground' = 'hit'): void {
    const shield = p.characterType === 'knight' && p.isHoldingAbility;
    dmg *= ctx.dmgK || 1;   // lokatsiya kuchi: shu paytda urayotgan dushman koeffitsienti
    let d = shield ? dmg * 0.25 : dmg;
    const b = p.buffs;
    if (kind === 'shot' && b && (b.armorHp || 0) > 0) {
        const take = Math.min(b.armorHp!, d);
        b.armorHp! -= take; d -= take;
        ctx.emitTo(p.id, 'bigArmorHit', { left: Math.round(b.armorHp!), x: Math.round(p.x), y: Math.round(p.y) });
    }
    if (d > 0) ctx.hurt(p, d);
}
export function shoot(S: BigState, e: BigEnemy, d: EnemyDef, p: PlayerState, spread = 0, spd?: number, dmg?: number): void {
    const sh = d.shot || { spd: spd || 420, cdMs: 0, dmg: dmg || Math.round(d.dmg * 0.5) }, sx = e.x + e.f * d.w / 2, sy = e.y - d.h * 0.6;
    const dx = p.x - sx, dy = p.y - sy;
    let vx: number, vy: number;
    if (sh.arc) {
        const t = Math.max(0.5, Math.min(1.6, Math.abs(dx) / sh.spd));
        vx = dx / t; vy = (dy - 0.5 * 600 * t * t) / t;
    } else {
        const a = Math.atan2(dy, dx) + spread;
        vx = Math.cos(a) * (spd || sh.spd); vy = Math.sin(a) * (spd || sh.spd);
    }
    S.shots.push({ id: ++S.seq, x: sx, y: sy, vx, vy, dmg: dmg || sh.dmg, t: 0, arc: !!sh.arc, owner: e.id, k: SHOT_K[e.k] || 'orb', home: e.k === 'wisp' ? 50 : undefined, life: e.k === 'darkelf' ? 110 : undefined });
}
// Ballistik sakrash: (tx, ty - oyoq) nuqtaga qo'nadigan tezlik. maxV - sakrash kuchi chegarasi
export function leapTo(e: BigEnemy, tx: number, ty: number, maxV: number): boolean {
    const h = e.y - ty, apex = h > -10 ? Math.max(h, 0) + 70 : 26, vy0 = Math.sqrt(2 * GRAV * apex);   // pastga - past yoy bilan (tepaga otilib ketmaydi)
    if (vy0 > maxV) return false;
    const tt = vy0 / GRAV + Math.sqrt(2 * Math.max(0, apex - h) / GRAV);
    e.vy = -vy0; e.lvx = Math.max(-750, Math.min(750, (tx - e.x) / tt)); e.ground = false;
    return true;
}

function enemyAI(S: BigState, e: BigEnemy, d: EnemyDef, alive: PlayerState[], room: RoomState, ctx: BigCtx, dt: number): void {
    // UMRI TUGADI: soya egizagi tarqaladi, o'rgimchak tuxumi yorilib - ikki o'rgimchak
    if (e.life !== undefined && --e.life <= 0) {
        const i = S.enemies.indexOf(e); if (i >= 0) S.enemies.splice(i, 1);
        ctx.emit('bigKill', { id: e.id, k: e.k, x: Math.round(e.x), y: Math.round(e.y), boss: false, fade: 1 });
        if (e.k === 'eggsac') [-1, 1].forEach(s => { const m = spawnEnemy(S, 'spider', e.x + s * 16, e.y, e.zone); m.st = 'chase'; m.cd = T(600); });
        return;
    }
    // QALQON (o'g'rilar, qalqonli ovchi): guard[1] ms; tushgach guard[2] ms qayta ko'tarolmaydi
    if ((e.block || 0) > 0 && --e.block! === 0) e.bcd = S.tick + T(d.guard ? d.guard[2] : 2500);
    if (e.stun && e.stun > 0) { e.stun--; e.atk = 0; e.lvx = undefined; if (!d.fly) moveEnemy(S, e, d, 0, null, dt); return; }
    // YASHIRINGAN (mimik - quti/sandiq, gargulya - haykal): o'yinchi juda yaqin kelguncha qimirlamaydi
    // KO'RINMAS (kamonchi Shift) o'yinchini dushmanlar ko'rmaydi va quvishni to'xtatadi
    alive = alive.filter(q => !q.isInvisible);
    if (e.st === 'lurk') {
        const n = alive.find(q => Math.abs(q.x - e.x) < (d.lurk || 100) && Math.abs(q.y + 24 - e.y) < 120);
        if (!n) return;
        e.st = 'chase'; e.tgt = n.id; e.cd = T(300);
        if (e.k === 'zveg') { e.bst = 'emerge'; e.ph = T(1300); e.move = 'emerge'; }   // yerdan sug'urilib chiqadi
        ctx.emit('bigWake', { id: e.id, k: e.k, x: Math.round(e.x), y: Math.round(e.y) });
    }
    // suhbatdan oldingi holat (semiz elf ovqatlanyapti / gapiryapti) - hujum yo'q
    if (d.boss && bossPre(S, e, alive, ctx)) { const q = nearest(alive, e); if (q) e.f = q.x < e.x ? -1 : 1; moveEnemy(S, e, d, 0, null, dt); return; }
    // S1/S2 dagi asl bosslar (kraken, gorilla, robot ilon) - o'z miyasi bilan
    const sp = SETPIECE[e.k];
    if (sp) { sp({ S, e, d, alive, ctx, dt }); if (e.hp <= 0 && S.enemies.includes(e)) { e.hide = undefined; damageEnemy(S, room, e, 0, null, ctx); } return; }
    // NISHON: ko'rinish masofasida eng yaqin tirik o'yinchi
    let p = e.tgt ? room.players[e.tgt] : null;
    if (p && (p.isDead || p.isInvisible)) { p = null; e.tgt = null; }
    if (!p) {
        const n = nearest(alive, e);
        if (n && (e.fz !== undefined || (Math.abs(n.x - e.x) < BIG.sight && Math.abs(n.y - (e.y - d.h / 2)) < BIG.sightY))) { p = n; e.tgt = n.id; e.st = 'chase'; e.lost = 0; }
        else { e.tgt = null; if (e.st === 'chase') e.st = 'return'; }
    }
    let wantVx = 0;
    if (p) {
        const dx = p.x - e.x, dyFeet = (p.y + 24) - e.y, dist = Math.hypot(dx, dyFeet);
        // IZ YO'QOLADI: 15 m dan uzoqlashib, boshqa sathda (ko'rinmay) qolsa - 1.5 s dan keyin; 80 m dan uzoq - darhol
        const visible = Math.abs(dyFeet) < 120 || !!d.fly;
        e.lost = dist > BIG.loseDist && !visible ? e.lost + 1 : 0;
        if (!d.boss && e.fz === undefined && (e.lost > T(1500) || dist > 800)) { e.tgt = null; e.st = 'return'; p = null; }
        else {
            e.f = dx < 0 ? -1 : 1;
            if (d.boss) { bossAI(S, e, d, p, alive, ctx, dt); return; }
            const cr = CREATURE[e.k];
            if (cr) { cr({ S, e, d, p, alive, ctx, dt, bullets: room.bullets || [] }); return; }
            if (d.shot) {
                // otuvchi: masofani saqlaydi, ko'rinsa otadi
                if (Math.abs(dx) < 170) wantVx = -e.f * d.spd; else if (Math.abs(dx) > 380) wantVx = e.f * d.spd;
                if (e.cd <= 0 && !(e.block! > 0) && Math.abs(dx) < 560 && Math.abs(dyFeet) < 300) { shoot(S, e, d, p); e.cd = T(d.shot.cdMs) + Math.floor(Math.random() * 15); ctx.emit('bigShoot', { id: e.id }); }
            } else if (Math.abs(dx) > d.reach * 0.7) wantVx = e.f * d.spd;
            // yaqin zarba: tayyorlanish (0.35 s) - keyin hali yaqin bo'lsa tegadi
            if (d.reach > 0 && e.atk === 0 && e.cd <= 0 && !(e.block! > 0) && Math.abs(dx) < d.reach + 12 && Math.abs(dyFeet) < 46) { e.atk = T(350); e.cd = T(d.atkMs); ctx.emit('bigWind', { id: e.id }); }
            // TEPADAGI O'YINCHI: uning sirtiga hisoblab sakraydi; yetolmasa - oraliq pog'onaga (izidan tepaga chiqib boradi)
            // (o'yinchi shunchaki sakrayotgan bo'lsa - ostidagi sirti bot bilan bir sathda - tepaga chiqmaydi)
            const ps = surfaceBelow(S, p.x, p.y + 24 - 8, 600), dyGround = ps ? ps.y - e.y : dyFeet;
            if (!d.fly && e.ground && d.jump > 0 && dyFeet < (d.shot ? -110 : -50) && dyGround < (d.shot ? -110 : -50) && !e.jcd) {
                const maxV = d.jump * 1.6, s = surfaceBelow(S, p.x, p.y + 24 - 8, 30);
                let ok = !!s && Math.abs(dx) < 320 && leapTo(e, Math.max(s.x + 12, Math.min(s.x + s.w - 12, p.x)), s.y, maxV);
                if (!ok) { const st = climbStep(S, e, p.x, p.y + 24); ok = !!st && leapTo(e, st.x, st.y, maxV); }
                e.jcd = ok ? T(900) : T(450);
                if (ok) ctx.emit('bigWind', { id: e.id });
            }
        }
    }
    if (e.atk > 0 && --e.atk === 0 && p) {
        const dx = p.x - e.x, dyFeet = (p.y + 24) - e.y;
        if (Math.abs(dx) < d.reach + 18 && Math.abs(dyFeet) < 50) hurtBig(p, d.dmg, ctx);
    }
    if (!p) {
        // nishonsiz qolgan boss (hamma ko'rinmas / uzoqda): yer ostidan, shiftdan chiqadi - yashirin holatda qolib ketmasin
        if (d.boss && (e.hide || e.move !== 'walk')) { e.hide = undefined; e.bst = undefined; e.spin = false; e.goX = undefined; e.move = 'walk'; e.mt = T(800); }
        // QAYTISH / KUZATUV: uyi atrofida yurib turadi
        const dh = e.hx - e.x;
        if (e.st === 'return' && Math.abs(dh) < 20) e.st = 'idle';
        if (e.st === 'return') wantVx = Math.sign(dh) * d.spd * 0.7;
        else { e.t++; wantVx = Math.sin(e.t / 60 + e.id) > 0 ? d.spd * 0.3 : -d.spd * 0.3; if (Math.abs(e.x - e.hx) > 90) wantVx = Math.sign(e.hx - e.x) * d.spd * 0.3; }
        if (wantVx) e.f = wantVx < 0 ? -1 : 1;
    }
    moveEnemy(S, e, d, wantVx, p, dt);
}
// TEPAGA CHIQISH yo'li: dushmandan 20-200 px balanddagi, o'yinchi tomondagi (280 px gacha) eng qulay sirt
function climbStep(S: BigState, e: BigEnemy, tx: number, tyFeet: number): { x: number, y: number } | null {
    let best: { x: number, y: number } | null = null, bs = 1e9;
    for (let c = Math.floor((e.x - 300) / CELL); c <= Math.floor((e.x + 300) / CELL); c++) {
        for (const p of S.grid.get(c) || []) {
            if (p.k === 'spikes' || p.y > e.y - 20 || p.y < e.y - 200 || p.y < tyFeet - 10) continue;
            const x = Math.max(p.x + 10, Math.min(p.x + p.w - 10, tx));
            if (Math.abs(x - e.x) > 280) continue;
            if (Math.abs(tx - e.x) > 60 && (x - e.x) * Math.sign(tx - e.x) < -20) continue;   // o'yinchidan teskari tomondagi pog'onaga qaytmaydi
            const sc = Math.abs(tx - x) + (p.y - tyFeet) * 0.6;   // o'yinchiga yaqinroq va balandroq - yaxshiroq
            if (sc < bs) { bs = sc; best = { x, y: p.y }; }
        }
    }
    return best;
}
// harakat; true - shu kadrda havodan yerga qo'ndi
export function moveEnemy(S: BigState, e: BigEnemy, d: EnemyDef, wantVx: number, p: PlayerState | null, dt: number): boolean {
    if (d.fly) {
        // UCHUVCHI: nishon tepasidan sho'ng'iydi
        const hov = d.boss ? 150 : 30;   // uchar boss (dirijabl) - o'yinchidan biroz balandda
        let tx = e.goX !== undefined ? e.goX : p ? p.x : e.hx, ty = p ? p.y - hov + Math.sin(e.id + Date.now() / 300) * 40 : e.hy - 60 + Math.sin(Date.now() / 700 + e.id) * 20;
        // DIRIJABL chegarasi: pastki qismi orol sathidan 120-230 px balandda (eng tepa pog'onadan sakrab uriladi), maydondan chiqmaydi
        const z = d.boss ? S.w.zones.find(q => q.id === e.zone) : null;
        if (d.boss) { ty = Math.max(e.hy - 230, Math.min(e.hy - 120, ty)); if (z) tx = Math.max(z.x0 + d.w / 2, Math.min(z.x1 - d.w / 2, tx)); }
        const dx = tx - e.x, dy = ty - e.y, l = Math.hypot(dx, dy) || 1, sp = (p ? d.spd : d.spd * 0.4) * (e.goX !== undefined ? 1.8 : 1);
        e.vx += ((dx / l) * sp - e.vx) * 0.08; e.vy += ((dy / l) * sp - e.vy) * 0.08;
        e.x += e.vx * dt; e.y += e.vy * dt;
        if (d.boss) { e.y = Math.max(e.hy - 240, Math.min(e.hy - 110, e.y)); if (z) e.x = Math.max(z.x0, Math.min(z.x1, e.x)); }
        return false;
    }
    // YERDAGI: tik oldida yer bo'lmasa - to'xtaydi (quvayotgan bo'lsa va pastda yer bo'lsa - tushadi)
    let vx = wantVx;
    if (!e.ground && e.lvx !== undefined) vx = e.lvx;   // hisoblangan sakrash - havoda yo'nalish o'zgarmaydi
    else if (e.ground && vx !== 0) {
        const ahead = e.x + Math.sign(vx) * (d.w / 2 + 6);
        const under = surfaceBelow(S, ahead, e.y, 90);
        if (!under) {
            // o'yinchi pastda bo'lsa - uning sathigacha tushadi (chuqurroq bo'lsa ham); tepaga sakramaydi
            const below = !!p && (p.y + 24) > e.y + 40;
            const deep = surfaceBelow(S, ahead, e.y, below ? Math.max(420, Math.min(900, p!.y + 24 - e.y + 60)) : 420);
            const chaseDown = below && deep;
            if (!chaseDown) {
                // oldinda (pog'ona toshlar orasida) keyingi sirt bo'lsa - unga hisoblab sakraydi, aks holda to'xtaydi
                const nx = e.x + Math.sign(vx) * 150, jumpTo = d.jump > 0 && p ? surfaceBelow(S, nx, below ? e.y - 6 : e.y - 120, 230) : null;
                if (!(jumpTo && leapTo(e, nx, jumpTo.y, d.jump * 1.2))) vx = 0;
            }
        } else if (under.y < e.y - 10 && under.y > e.y - 130 && d.jump > 0) { e.vy = -d.jump; e.ground = false; }   // pog'ona - sakraydi
    }
    // DEVOR: tosh ichiga yurib kirmaydi (maxfiy xona devorlari va h.k.); allaqachon ichida bo'lsa (itarilgan) - chiqib ketishiga xalaqit bermaydi
    if (vx !== 0 && inSolid(S, e.x + vx * dt, e.y, d.w * 0.6, d.h) && !inSolid(S, e.x, e.y, d.w * 0.6, d.h)) vx = 0;
    e.vx = vx;
    e.x += vx * dt;
    e.vy = Math.min(e.para ? 140 : 900, e.vy + GRAV * dt);   // parashyutda - sekin
    let ny = e.y + e.vy * dt;
    // SHIFT: sakraganda tosh ichidan o'tib (masalan, yer ostidagi xonadan tepaga) chiqib ketmaydi
    if (e.vy < 0 && inSolid(S, e.x, ny, d.w * 0.6, d.h) && !inSolid(S, e.x, e.y, d.w * 0.6, d.h)) { e.vy = 0; ny = e.y; }
    if (e.vy >= 0) {
        const g = surfaceBelow(S, e.x, e.y, ny - e.y + 2, e.nl);
        if (g && ny >= g.y) { const was = !e.ground; e.y = g.y; e.vy = 0; e.ground = true; e.lvx = undefined; e.para = false; return was; }
    }
    e.y = ny; e.ground = false;
    return false;
}
// O'yinchi zarbasi uchun nishon: kichik jonzotlarga ham o'q / qilich bemalol tegsin - kamida 46x60 (yerdagilarga oyoq ostidan ham)
const hitRect = (e: BigEnemy, d: EnemyDef) => { const w = Math.max(d.w + 10, 46), h = Math.max(d.h + 8, 60); return { x: e.x - w / 2, y: e.y - h + (d.fly ? h / 2 - d.h / 2 : 6), w, h }; };
export function damageEnemy(S: BigState, room: RoomState, e: BigEnemy, damage: number, owner: PlayerState | undefined | null, ctx: BigCtx): void {
    const d = ENEMIES[e.k];
    // yashiringan mimik / haykalga tegsa - uyg'onadi
    if (e.st === 'lurk') { e.st = 'chase'; e.tgt = owner ? owner.id : null; ctx.emit('bigWake', { id: e.id, k: e.k, x: Math.round(e.x), y: Math.round(e.y) }); }
    if (e.hide) return;   // yer ostida / shiftda - tegmaydi
    if (e.iv) e.iv = 0;   // ko'rinmas kaltakesak - tegsa ko'rinib qoladi
    // MUZ XOKKEYCHI: o'zi (klyushkasi bilan) hamma zarbani qaytaradi - joni faqat DARVOZAGA tekkanda ketadi
    if (e.k === 'hgoal') {
        e.flash = 4;
        const b = S.enemies.find(o => o.k === 'hockey' && o.zone === e.zone);
        if (b && damage > 0) { b.gHit = true; try { damageEnemy(S, room, b, damage, owner, ctx); } finally { b.gHit = false; } }
        return;
    }
    if (e.k === 'hockey' && !e.gHit && damage > 0) { e.poison = undefined; ctx.emit('bigBlock', { id: e.id, x: Math.round(e.x + e.f * 30), y: Math.round(e.y - 50), k: 'hockey' }); return; }
    const mult = (e.shield && e.shield > S.tick ? 0.12 : 1) * (e.vuln && e.vuln > S.tick ? 1.6 : 1);
    e.hp -= damage * (1 - (d.armor || 0)) * mult * (owner && buffOn(owner, 'strength') ? 1.4 : 1);   // kuch iksiri - 40% kuchli
    e.flash = 4;
    if (e.hp > 0) return;
    const i = S.enemies.indexOf(e);
    if (i >= 0) S.enemies.splice(i, 1);
    ctx.emit('bigKill', { id: e.id, k: e.k, x: Math.round(e.x), y: Math.round(e.y), boss: !!d.boss });
    if (e.fz !== undefined) { const ct = S.enemies.find(o => o.k === 'zvfarm' && o.zone === e.fz); if (ct) ct.fk = (ct.fk || 0) + 1; }   // ferma: o'ldirilgan zombi
    if (d.boss) {
        // boss: hamma o'yinchiga mukofot (bir marta), uning yordamchilari va tikanlari ham yo'qoladi
        S.enemies = S.enemies.filter(o => o.zone !== e.zone);
        S.areas = S.areas.filter(a => a.zone !== e.zone); S.shots = S.shots.filter(s => !s.owner || s.owner !== e.id);
        const bz = S.w.zones.find(q => q.id === e.zone); if (bz) stopPull(Object.values(room.players), bz, ctx);
        if (S.gcrush[e.zone]) { ctx.emit('bigCrush', { i: S.gcrush[e.zone].i, st: 'idle' }); delete S.gcrush[e.zone]; }   // shiftga uchayotgan platforma joyiga qaytadi (qaytgan gorilla yana ura olsin)
        const first = !S.paid[e.zone], m = first ? 1 : RESPAWN.again;   // qaytgan boss - kamroq mukofot
        const coins = Math.round(d.coins * m), xp = Math.round((d.secret ? 200 : 120) * m);
        S.paid[e.zone] = true; S.down[e.zone] = Date.now(); ctx.saveKillAt(e.zone, S.down[e.zone]);
        ctx.emit('bigBossDown', { k: e.k, secret: !!d.secret, coins, again: !first });
        Object.values(room.players).forEach(q => { ctx.reward(q, coins, xp); if (first) ctx.bossKill(q); if (ctx.daily) ctx.daily(q, 'bosses', 1); });
        if (first) { ctx.saveKill(e.zone); bigProgressAll(S, Object.values(room.players), ctx); }
        bigQuestBoss(S, room, e.k, ctx);
    } else if (owner) { ctx.reward(owner, d.coins, killXp(d), true); if (ctx.daily) ctx.daily(owner, 'kills', 1); }
}
// O'yinchi o'qi dushmanga tegdimi (engine o'q tsiklidan): tegsa - true
// fx - o'q turi ta'siri: ice - muzlatadi, poison - zahar (asta jon oladi), chain - zanjirli chaqmoq (yana 2 ta dushmanga, 60%)
export interface BigHitFx { ice?: boolean; poison?: { delay: number, t: number, dps: number }; chain?: boolean; dir?: number; }   // dir - o'q qaysi tomonga uchyapti (+1 o'ngga)
export function bigBulletHit(S: BigState, room: RoomState, rect: { x: number, y: number, w: number, h: number }, damage: number, owner: PlayerState | undefined, ctx: BigCtx, fx?: BigHitFx): boolean {
    const e = bigFindEnemy(S, rect);
    if (!e) return false;
    const d = ENEMIES[e.k];
    // O'G'RILAR (va qalqonli ovchi): otilsa / urilsa ba'zan qalqon ko'taradi - OLDIDAN kelgan o'q so'nadi, orqadan / yondan kelgani tegadi
    const gd = d.guard;
    if (gd && !e.hide) {
        // o'q qaysi tomondan kelyapti: uchish yo'nalishi bo'yicha (qilich zarbasi - o'yinchi turgan tomondan), oddiy xaritalardagidek
        const ox = owner ? owner.x : rect.x + rect.w / 2, fromLeft = fx && fx.dir ? fx.dir > 0 : ox < e.x;
        if (!(e.block! > 0) && (e.bcd || 0) <= S.tick && e.st !== 'lurk' && Math.abs(ox - e.x) < 350 && Math.random() < gd[0]) { e.block = T(gd[1]); e.f = fromLeft ? -1 : 1; e.atk = 0; }
        if (e.block! > 0 && fromLeft === (e.f < 0)) { ctx.emit('bigBlock', { id: e.id, x: Math.round(e.x + e.f * 14), y: Math.round(e.y - 26) }); return true; }
    }
    if (fx && fx.ice && !d.boss) e.stun = Math.max(e.stun || 0, 45);   // ~1.3 s muzlaydi (bosslar muzlamaydi)
    if (fx && fx.poison && owner) e.poison = { ...fx.poison, owner: owner.id };
    const chain: BigEnemy[] = [e];
    if (fx && fx.chain) {
        for (let hop = 0; hop < 2; hop++) {
            const from = chain[chain.length - 1];
            const nx = S.enemies.filter(o => !chain.includes(o) && Math.hypot(o.x - from.x, o.y - from.y) <= 230).sort((a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y))[0];
            if (!nx) break;
            chain.push(nx);
        }
        if (chain.length > 1) ctx.emit('chainBolt', { points: chain.map(o => [Math.round(o.x), Math.round(o.y - ENEMIES[o.k].h / 2)]) });
    }
    damageEnemy(S, room, e, damage, owner, ctx);
    chain.slice(1).forEach(o => damageEnemy(S, room, o, damage * 0.6, owner, ctx));
    return true;
}
// tornado ichidagi dushmanlar (har pulsda - har biriga zarba)
export function bigInside(S: BigState, x: number, y: number, halfW: number, height: number): { x: number, y: number }[] {
    return S.enemies.filter(e => !e.hide && Math.abs(e.x - x) <= halfW + ENEMIES[e.k].w / 2 && e.y <= y + 30 && e.y - ENEMIES[e.k].h <= y + 10 && e.y >= y - height - ENEMIES[e.k].h)
        .map(e => ({ x: e.x, y: e.y - ENEMIES[e.k].h / 2 }));
}
// OVCHI va SEHRGAR qobiliyatlari uchun: nishonni topish, portlash (radius ichidagi hammaga), qopqon, tornado tortishi.
// Avval haqiqiy tanaga tekkani (boss yonidagi yordamchilar o'qni "o'g'irlamasin"), keyin kattalashtirilgan nishon (kichik jonzotlar)
export function bigFindEnemy(S: BigState, rect: { x: number, y: number, w: number, h: number }): BigEnemy | null {
    return S.enemies.find(e => !e.hide && overlap(rect, eRect(e, ENEMIES[e.k]))) || S.enemies.find(e => !e.hide && overlap(rect, hitRect(e, ENEMIES[e.k]))) || null;
}
export function bigEnemyById(S: BigState, id: number): BigEnemy | null { return S.enemies.find(e => e.id === id) || null; }
export function bigBlast(S: BigState, room: RoomState, x: number, y: number, r: number, damage: number, owner: PlayerState | null, ctx: BigCtx): void {
    S.enemies.filter(e => !e.hide && Math.hypot(e.x - x, (e.y - ENEMIES[e.k].h / 2) - y) <= r + ENEMIES[e.k].w / 2).forEach(e => damageEnemy(S, room, e, damage, owner, ctx));
}
export function bigTrap(S: BigState, room: RoomState, x: number, y: number, holdTicks: number, damage: number, owner: PlayerState | null, ctx: BigCtx): BigEnemy | null {
    const e = S.enemies.find(q => !q.hide && !ENEMIES[q.k].fly && !(q.stun && q.stun > 0) && Math.abs(q.x - x) <= 34 && Math.abs(q.y - y) <= 30);
    if (!e) return null;
    e.stun = ENEMIES[e.k].boss ? Math.round(holdTicks / 2) : holdTicks; e.x = x;
    damageEnemy(S, room, e, damage, owner, ctx);
    return e;
}
export function bigPull(S: BigState, x: number, y: number, halfW: number, height: number, pull: number): void {
    // bosslar ham (sekinroq) tortiladi - tornado ularni ham bir oz ushlab turadi; uchar va qimirlamaydiganlar - yo'q
    S.enemies.forEach(e => { const d = ENEMIES[e.k]; if (!e.hide && d.spd > 0 && Math.abs(e.x - x) <= halfW + d.w / 2 && e.y <= y + 30 && e.y >= y - height) e.x += Math.sign(x - e.x) * Math.min(d.boss ? pull * 0.4 : pull, Math.abs(x - e.x)); });
}
// O'yinchi amali: sandiq ochish (yaqinida bo'lsa, bir marta)
export function bigChest(S: BigState, p: PlayerState, id: number, ctx: BigCtx): void {
    const c = S.w.chests.find(q => q.id === id);
    if (!c || S.chests[id] || p.isDead || Math.abs(p.x - c.x) > 80 || Math.abs((p.y + 24) - c.y) > 70) return;
    S.chests[id] = true;
    ctx.saveChest(id);
    ctx.emit('bigChest', { id, by: p.id, coins: c.coins });
    ctx.reward(p, c.coins);
}
// PORTAL: o'yinchi portal yonida turib, ochilgan (yetib kelingan) lokatsiya portalini tanlaydi - o'sha joyga ko'chadi.
// Boss maydonida qamalgan / o'lik - yo'q. Tirilish joyi - o'sha portal checkpointi (oldinga o'tsa - yana umumiy)
export const PORTAL_R = 110;
export function bigPortalNear(S: BigState, p: PlayerState) { return S.w.portals.find(q => Math.abs(p.x - q.x) < PORTAL_R && Math.abs(p.y + 24 - q.y) < 110) || null; }
export function bigPortal(S: BigState, p: PlayerState, loc: string, ctx: BigCtx): boolean {
    const from = bigPortalNear(S, p), to = S.w.portals.find(q => q.loc === loc);
    if (p.isDead || !from || !to || to === from || !S.got[to.cp]) return false;
    if (BIG_CLOSED.includes(to.loc)) { ctx.emitTo(p.id, 'bigMage', { err: 'big_loc_closed' }); return false; }   // vaqtincha yopiq
    if (bigArenas(S).some(a => p.x > a.x0 && p.x < a.x1 && p.y + 24 >= a.y0 + 200 && p.y + 24 <= a.y1 + 120)) return false;
    p.x = to.x; p.y = to.y - 26;
    S.pcp[p.id] = to.cp; ctx.saveCp(p, to.cp); ctx.emitTo(p.id, 'bigCpMine', { i: to.cp });
    delete S.dots[p.id];
    ctx.emitTo(p.id, 'teleport', { x: p.x, y: p.y });
    ctx.emit('bigPortalFx', { id: p.id, x0: from.x, y0: from.y, x1: to.x, y1: to.y });
    return true;
}
// ===== TOPSHIRIQLAR (Elf qirolligi): keksa elf - robot ilonning tishi; ona elf - semiz elf o'tlog'idagi ikki bolasi =====
// holat: 0 - olinmagan, 1 - bajarilyapti, 2 - bajarildi (qaytib aytish kerak), 3 - mukofot olingan. Har o'yinchida (hisobda) alohida
export const QUESTS: { [q: string]: { coins: number, xp: number, boss: string } } = { tooth: { coins: 250, xp: 150, boss: 'rsnake' }, kids: { coins: 300, xp: 200, boss: 'fatelf' } };
const questPaid = (S: BigState, q: string) => S.w.zones.some(z => z.boss === QUESTS[q].boss && S.paid[z.id]);
export function bigQuestTalk(S: BigState, p: PlayerState, npcId: number, ctx: BigCtx): void {
    const n = S.w.npcs.find(o => o.id === npcId && o.q);
    if (!n || p.isDead || Math.abs(p.x - n.x) > 130 || Math.abs(p.y + 24 - n.y) > 90) return;
    const q = n.q!, qs = p.bigQuests || (p.bigQuests = {}), st = qs[q] || 0, Q = QUESTS[q];
    let ev = 'wait';
    if (st === 0) { qs[q] = q === 'tooth' && questPaid(S, q) ? 2 : 1; ev = qs[q] === 2 ? 'have' : 'accept'; ctx.saveQuest(p, q, qs[q]); }
    else if (st === 2) { qs[q] = 3; ev = 'done'; ctx.saveQuest(p, q, 3); ctx.reward(p, Q.coins, Q.xp); }
    else if (st === 3) ev = 'thanks';
    ctx.emitTo(p.id, 'bigQuest', { q, st: qs[q], ev, npc: n.id });
}
// robot ilon o'ldi: tishini olish topshirig'i bor hamma o'yinchida - tish olindi
export function bigQuestBoss(S: BigState, room: RoomState, k: string, ctx: BigCtx): void {
    Object.values(room.players).forEach((p) => {
        if (k !== QUESTS.tooth.boss || !p.bigQuests || p.bigQuests.tooth !== 1) return;
        p.bigQuests.tooth = 2; ctx.saveQuest(p, 'tooth', 2); ctx.emitTo(p.id, 'bigQuest', { q: 'tooth', st: 2, ev: 'got' });
    });
}
// QAFAS (semiz elf o'tlog'ida): boss yengilgach ochiladi - ichidagi bolalar topildi
export function bigCage(S: BigState, p: PlayerState, ctx: BigCtx): void {
    const c = S.w.cages.find(o => Math.abs(p.x - o.x) < 110 && Math.abs(p.y + 24 - o.y) < 90);
    if (!c || p.isDead) return;
    if (!S.paid[c.zone]) { ctx.emitTo(p.id, 'bigQuest', { q: 'kids', st: (p.bigQuests || {}).kids || 0, ev: 'locked' }); return; }
    const qs = p.bigQuests || (p.bigQuests = {});
    if ((qs.kids || 0) <= 1) { qs.kids = 2; ctx.saveQuest(p, 'kids', 2); ctx.emitTo(p.id, 'bigQuest', { q: 'kids', st: 2, ev: 'found' }); ctx.emit('bigCageOpen', { x: c.x, y: c.y }); }
}
// BALOT MAGI bilan suhbat (yengilgandan keyin - tinch qo'shni): har tugagan suhbat - shu o'yinchida simpatiya +1 (hisobga saqlanadi, 30 gacha)
export const MAGE_SYM_MAX = 30;
// sovg'a: gul - +2 simpatiya (va gullar hisobiga), boshqa hosil - +1; fermaga taklif - simpatiya va gullar yetarli bo'lsa
export const MAGE = { flowerSym: 2, giftSym: 1, giftMs: 1200, inviteSym: 20, inviteFlowers: 10 };
const mageTalkAt = new Map<string, number>(), mageGiftAt = new Map<string, number>();
const mageNear = (S: BigState, p: PlayerState, zid: number): boolean => {
    const z = S.w.zones.find(q => q.id === zid && q.boss === 'swampmage');
    return !!z && !!S.paid[z.id] && !p.isDead && p.x > z.x0 - 300 && p.x < z.x1 + 300 && Math.abs(p.y + 24 - (z.y1 - 60)) < 500 && !(p.bigQuests && p.bigQuests.magehome);
};
export function bigMageGift(S: BigState, p: PlayerState, zid: number, item: string, ctx: BigCtx): boolean {
    if (!mageNear(S, p, zid) || !/^[a-z]{2,16}$/.test(item) || !ctx.takeItem) return false;
    const now = Date.now(); if (now - (mageGiftAt.get(p.id) || 0) < MAGE.giftMs) return false;
    mageGiftAt.set(p.id, now);
    ctx.takeItem(p, item, (left) => {
        if (left < 0) { ctx.emitTo(p.id, 'bigMage', { err: 'mg_no_item', item }); return; }
        const qs = p.bigQuests || (p.bigQuests = {}), fl = item === 'flower';
        qs.mage = Math.min(MAGE_SYM_MAX, (qs.mage || 0) + (fl ? MAGE.flowerSym : MAGE.giftSym)); ctx.saveQuest(p, 'mage', qs.mage);
        if (fl) { qs.magef = Math.min(999, (qs.magef || 0) + 1); ctx.saveQuest(p, 'magef', qs.magef); }
        ctx.emitTo(p.id, 'bigMage', { sym: qs.mage, f: qs.magef || 0, gift: item, left });
    });
    return true;
}
export function bigMageInvite(S: BigState, p: PlayerState, zid: number, ctx: BigCtx): boolean {
    if (!mageNear(S, p, zid)) return false;
    if (!p.userId) { ctx.emitTo(p.id, 'bigMage', { err: 'farm_need_account' }); return false; }   // mehmon - fermasi yo'q
    const qs = p.bigQuests || (p.bigQuests = {});
    if ((qs.mage || 0) < MAGE.inviteSym || (qs.magef || 0) < MAGE.inviteFlowers) { ctx.emitTo(p.id, 'bigMage', { sym: qs.mage || 0, f: qs.magef || 0, err: 'mg_not_yet' }); return false; }
    qs.magehome = 1; if (ctx.mageHome) ctx.mageHome(p);
    ctx.emitTo(p.id, 'bigMage', { sym: qs.mage, f: qs.magef || 0, home: 1 });
    return true;
}
export function bigMageTalk(S: BigState, p: PlayerState, zid: number, ctx: BigCtx): boolean {
    if (!mageNear(S, p, zid)) return false;
    const now = Date.now(); if (now - (mageTalkAt.get(p.id) || 0) < 15000) return false;   // suhbatdan do'stlik - 15 s da bir marta (tez-tez yuborib oshirib bo'lmaydi)
    mageTalkAt.set(p.id, now);
    const qs = p.bigQuests || (p.bigQuests = {});
    qs.mage = Math.min(MAGE_SYM_MAX, (qs.mage || 0) + 1);
    ctx.saveQuest(p, 'mage', qs.mage); ctx.emitTo(p.id, 'bigMage', { sym: qs.mage });
    return true;
}
// TESHIK OLDIDA E: robot ilonni chaqirish (o'sha g'or maydonida). ARCHA OLDIDA E: Alter Qor Bobo - maydondagi HAR BIR o'yinchi sovg'asini olgach
// jang boshlanadi (kimdir olib, qolganlar 20 s ichida olmasa - baribir boshlanadi, updateBig da)
export function bigTrigger(S: BigState, p: PlayerState, room?: RoomState, ctx?: BigCtx): boolean {
    const z = S.w.zones.find(q => q.trig === 'e' && q.dx !== undefined && Math.abs(p.x - q.dx) < 170 && Math.abs(p.y + 24 - q.dy!) < 120);
    if (!z || p.isDead || S.down[z.id] !== undefined || S.trigOn[z.id]) return false;
    if (z.boss === 'santa' && room) {
        const gf = S.gifts[z.id] || (S.gifts[z.id] = { at: S.tick, ids: {} });
        if (gf.ids[p.id]) return false;
        gf.ids[p.id] = true;
        const inside = Object.values(room.players).filter(q => !q.isDead && q.x > z.x0 - 100 && q.x < z.x1 + 100 && q.y + 24 >= z.y0 && q.y + 24 <= z.y1 + 60);
        const n = inside.filter(q => gf.ids[q.id]).length, need = Math.max(1, inside.length);
        if (ctx) ctx.emit('bigGift', { z: z.id, id: p.id, n, need, x: Math.round(p.x), y: Math.round(p.y) });
        if (n < need) return true;
    }
    S.trigOn[z.id] = true;
    return true;
}
// FAOL BOSS MAYDONLARI (S1/S2 dagidek - jang boshlangach ichkaridagilar chiqa olmaydi: devor klientda, ichkaridagini ushlab turadi)
export function bigArenas(S: BigState): { id: number, k: string, x0: number, x1: number, y0: number, y1: number, g0: number, g1: number }[] {
    return S.w.zones.filter(z => z.boss && z.boss !== 'zvfarm' && S.zoneState[z.id] && S.zoneState[z.id].st === 'active' && S.enemies.some(e => e.zone === z.id && ENEMIES[e.k].boss)).map((z) => {   // ferma - chegarasiz
        const lake = S.w.lakes.find(l => l.x < z.x1 && l.x + l.w > z.x0 && l.y >= z.y0 && l.y <= z.y1 + 60);
        const fl = (x: number) => lake ? lake.y : (surfaceBelow(S, x, z.y1 - 200, 400) || { y: z.y1 - 60 }).y;
        return { id: z.id, k: z.boss!, x0: z.x0, x1: z.x1, y0: z.y0, y1: z.y1, g0: fl(z.x0 + 6), g1: fl(z.x1 - 6) };
    });
}
// Klientga yuboriladigan holat: faqat o'yinchilar yaqinidagi dushman va o'qlar
export function bigPayload(S: BigState, room: RoomState) {
    const ps = Object.values(room.players);
    const near = (x: number, y: number) => ps.some(p => Math.abs(p.x - x) < 1300 && Math.abs(p.y - y) < 900);
    return {
        cp: S.cp,
        en: S.enemies.filter(e => near(e.x, e.y)).map(e => ({ id: e.id, k: e.k, x: Math.round(e.x), y: Math.round(e.y), f: e.f, hp: Math.ceil(e.hp), mx: e.mx,
            a: e.atk > 0 ? 1 : 0, fl: e.flash > 0 ? 1 : 0, m: e.move && e.move !== 'walk' ? e.move : '', l: e.st === 'lurk' ? 1 : 0, r: e.p2 ? 1 : 0, s: e.stun && e.stun > 0 ? 1 : 0, pz: e.poison && e.poison.delay <= 0 ? 1 : 0,
            b: e.block && e.block > 0 ? 1 : 0, u: e.hide === 'under' ? 1 : e.hide === 'up' ? 2 : e.hide === 'blink' ? 3 : 0, sd: e.shield && e.shield > S.tick ? 1 : 0, v: (e.daze || 0) > 0 || (e.vuln || 0) > S.tick ? 1 : 0, sp: e.spin ? 1 : 0, pa: e.para ? 1 : 0, lf: e.life !== undefined ? 1 : 0, j: e.ground === false && !ENEMIES[e.k].fly ? 1 : 0, bs: ENEMIES[e.k].boss || e.k === 'lizard' || e.k === 'iceram' ? e.bst || '' : undefined, iv: e.iv && e.iv > S.tick ? 1 : undefined, hx: e.k === 'rsnake' ? Math.round(e.hx) : undefined })),
        sh: S.shots.filter(s => near(s.x, s.y)).map(s => ({ id: s.id, x: Math.round(s.x), y: Math.round(s.y), k: s.k, d: Math.round(Math.atan2(s.vy, s.vx) * 10) / 10, sc: s.roll ? Math.round(s.roll / 13 * 10) / 10 : s.sc || 0, st: s.sit !== undefined || s.idle ? 1 : 0, ...(s.wait && s.t < s.wait ? { wt: 1 } : {}) })),
        ar: S.areas.filter(a => near(a.x + a.w / 2, a.y + a.h / 2) || (a.x2 !== undefined && near(a.x2, a.y2!))).map(a => ({ id: a.id, k: a.k, x: Math.round(a.x), y: Math.round(a.y), w: Math.round(a.w), h: Math.round(a.h), x2: a.x2 !== undefined ? Math.round(a.x2) : undefined, y2: a.y2 !== undefined ? Math.round(a.y2) : undefined,
            wn: a.warn, t: a.t, f: a.f || 0 })),
        ch: Object.keys(S.chests).map(Number),
        ba: bigArenas(S).filter(a => ps.some(p => p.x > a.x0 - 1300 && p.x < a.x1 + 1300)),
        gc: S.tick % 15 === 0 ? Object.keys(S.got).map(Number) : undefined,   // ochilgan checkpointlar (vaqti-vaqti bilan)
        ex: bigExplored(S).pct,
        pd: Object.keys(S.down).map(Number),   // o'lik turgan bosslar (xaritada belgilanadi; qaytgach - yana tirik)
        ps: S.pshots.filter(s => near(s.x, s.y)).map(s => ({ id: s.id, x: Math.round(s.x), y: Math.round(s.y) })),
        sb: Object.fromEntries(ps.map(p => [p.id, p.snowballs || 0])),
        bf: Object.fromEntries(ps.map(p => { const b = p.buffs || {}, n = Date.now(), s = (v?: number) => Math.max(0, Math.ceil(((v || 0) - n) / 1000));
            return [p.id, { battery: s(b.battery), armor: Math.round(b.armorHp || 0), strength: s(b.strength), feather: s(b.feather), phoenix: b.phoenix ? 1 : 0, q: p.bigQuests || {} }]; })),
        cg: S.w.cages.filter(c => S.paid[c.zone]).map(c => c.zone)
    };
}
