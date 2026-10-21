// XARITALAR (LEVEL) TIZIMI
// Har bir xarita o'ziga xos platforma joylashuviga ega - qiyinlik botlar
// kuchidan emas, balki maydon tuzilishidan kelib chiqadi. Xaritalar
// ketma-ket ochiladi: N-xarita faqat (N-1)-xarita tugatilgandan keyin
// o'ynash uchun ochiladi (RoomState.unlockedLevel orqali nazorat qilinadi).

export interface PlatformDef {
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface PointDef {
    x: number;
    y: number;
}

export interface BotSpawnZone {
    xStart: number;
    xEnd: number;
    y: number; // Botlar shu balandlikdan "tushib" boshlanadi (tepadan)
}

export interface ChaseDef {
    snakeStartX: number;     // Ilon boshining boshlang'ich X'i (devor ortida, ekrandan chapda)
    snakeStartSpeed: number; // px/s - boshida
    snakeEndSpeed: number;   // px/s - oxirida (asta tezlashadi)
    snakeStopX: number;      // Ilon shu yerda to'xtaydi (oxirgi jarlik oldida)
    introWallX: number;      // Boshidagi devor - ilon uni sindirib chiqadi (klientda vizual)
    pad: PlatformDef;        // CHEKPOINT: ko'k yorug'likli maydoncha - AYNAN ustiga tushish kerak
}

// BOZOR RASTASI: markazi X va turi (klient rasmini shu turga qarab chizadi).
// Rastaning tomi (soyabon) - qattiq: ustiga chiqish mumkin
export interface StallDef {
    x: number;
    kind: 'fruit' | 'bread' | 'cloth' | 'pots' | 'potions' | 'berries' | 'fish';
}
export const STALL_ROOF_Y = 450;       // Tom sathi: yerdan 120px (sakrash ~133px) - yerdan sakrab chiqiladi
export const STALL_ROOF_HALF_W = 56;
export const PLANK_Y = 330;            // Taxta sathi: tomdan 120px - tomdan sakrab chiqiladi (yerdan emas)
const STALL_SPACING = 170;
const STALL_KIND_CYCLE: StallDef['kind'][] = ['fruit', 'bread', 'cloth', 'fish', 'pots', 'potions', 'berries'];

// BOZOR JOYLASHUVI: rastalar har 170px da (turlari navbat bilan), har ikkinchi
// rasta yonida - osma TAXTA platforma. Map-4 (1600px) va map-5 (juda uzun)
// bir xil formula bilan quriladi - map-5 ning boshi aynan map-4 ning o'zi.
// Baliq sotuvchi (4-rasta, x=810) - map-4 ning o'rtasida
export function buildMarketLayout(width: number): { stalls: StallDef[], planks: PlatformDef[] } {
    const stalls: StallDef[] = [];
    const planks: PlatformDef[] = [];
    for (let i = 0, x = 300; x <= width - 110; i++, x += STALL_SPACING) {
        stalls.push({ x, kind: STALL_KIND_CYCLE[i % STALL_KIND_CYCLE.length] });
        if (i % 2 === 0 && x + 140 <= width) planks.push({ x: x + 30, y: PLANK_Y, w: 110, h: 12 });
    }
    return { stalls, planks };
}
const MARKET_4 = buildMarketLayout(1600);
const MARKET_5 = buildMarketLayout(40000);

// BOSS: robot-ilon to'xtamay oldinga (qahramonlar izidan) bostirib boradi, rastalarni
// ezadi, oldinga mina otadi va vaqti-vaqti bilan OLOV purkaydi. Joni tugaguncha otiladi
export interface BossDef {
    baseHp: number;
    hpPerExtraPlayer: number;
    startX: number;
    advanceSpeed: number;
    contactDamage: number;
    mineIntervalMs: number;
    stallCrashDamage: number;
    ownMineDamage: number;
    fireIntervalMs: number;     // Olov purkashlar oralig'i
    fireChargeMs: number;       // Ogohlantirish (og'zi cho'g'lanadi) - shu vaqtda taxtaga chiqib olish kerak
    fireDurationMs: number;
    fireRange: number;          // Boshidan oldinga shuncha px
    fireSafeY: number;          // Qahramon markazi shundan YUQORIDA (taxtada) bo'lsa - olov yetmaydi
    fireDps: number;
}

// SUHBAT SAHNASI: NPC oldiga borib E bosiladi, suhbat HAMMAGA bir vaqtda
// ko'rsatiladi (server qatorni sinxronlaydi), oxirgi qatordan keyin xarita o'tiladi
export interface StoryDef {
    sellerX: number;
    talkRange: number;
    lineCount: number;
    doorX: number;
    // MY FARM hosilini sotib oluvchi elf (meva rastasi) - E bosilsa butun hosil sotiladi
    buyerX?: number;
    buyRange?: number;
}

// ===== MY FARM (BONUS): HOSTNING fermasi - faqat xona egasi ekadi, yig'adi, baliq tutadi; qolganlar kuzatadi.
// Ekinlar hisobda saqlanadi va REAL VAQTDA o'sadi (yomg'ir paytida 2x tez). Urug'lar host leveliga qarab ochiladi
export interface CropDef {
    id: string;
    level: number;     // host shu levelga yetganda urug' ochiladi
    seed: number;      // urug' narxi
    growMs: number;    // ekilgandan pishguncha (yomg'irsiz)
    sell: number;      // bozorda bitta hosil narxi
}
export const CROPS: CropDef[] = [
    { id: 'carrot', level: 0, seed: 5, growMs: 30000, sell: 13 },
    { id: 'tomato', level: 1, seed: 8, growMs: 50000, sell: 24 },
    { id: 'corn', level: 2, seed: 12, growMs: 75000, sell: 38 },
    { id: 'strawberry', level: 3, seed: 16, growMs: 100000, sell: 52 },
    { id: 'pumpkin', level: 4, seed: 22, growMs: 140000, sell: 74 },
    { id: 'watermelon', level: 5, seed: 30, growMs: 180000, sell: 102 },
    { id: 'pepper', level: 6, seed: 34, growMs: 190000, sell: 120 },
    { id: 'eggplant', level: 7, seed: 38, growMs: 200000, sell: 134 },
    { id: 'pineapple', level: 8, seed: 44, growMs: 210000, sell: 152 },
    { id: 'grapes', level: 9, seed: 50, growMs: 220000, sell: 170 }
];
// BALIQLAR: og'irligi tasodifiy (kg) - narxi og'irligiga yarasha. Katta baliq tortishda chiziq tezroq yuradi
export interface FishDef { id: string; chance: number; minKg: number; maxKg: number; base: number; perKg: number; net: boolean; golden?: boolean; }
export const FISH: FishDef[] = [
    { id: 'perch', chance: 0.4, minKg: 0.2, maxKg: 0.8, base: 6, perKg: 14, net: true },
    { id: 'carp', chance: 0.3, minKg: 0.8, maxKg: 2.5, base: 8, perKg: 10, net: true },
    { id: 'pike', chance: 0.2, minKg: 2, maxKg: 5, base: 10, perKg: 8, net: false },
    { id: 'catfish', chance: 0.1, minKg: 5, maxKg: 12, base: 12, perKg: 6, net: false },
    // OLTIN BALIQ: juda kam (faqat udochkada), yashil zona juda tor - tutilsa yutuq
    { id: 'goldfish', chance: 0.025, minKg: 0.4, maxKg: 1.2, base: 120, perKg: 100, net: false, golden: true }
];
export function rollFish(netOnly: boolean): { id: string, kg: number, value: number } {
    const pool = FISH.filter(f => !netOnly || f.net);
    let r = Math.random() * pool.reduce((a, f) => a + f.chance, 0);
    let f = pool[pool.length - 1];
    for (const x of pool) { if ((r -= x.chance) <= 0) { f = x; break; } }
    const kg = Math.round((f.minKg + Math.random() ** 1.6 * (f.maxKg - f.minKg)) * 10) / 10;
    return { id: f.id, kg, value: Math.round(f.base + f.perKg * kg) };
}
// MEVALI DARAXTLAR (bog'): bir marta ekiladi, ulg'aygach har cycleMs da yield ta meva beradi
export interface FruitTreeDef { id: string; level: number; price: number; matureMs: number; cycleMs: number; yield: number; sell: number; }
export const FRUIT_TREES: FruitTreeDef[] = [
    { id: 'apple', level: 1, price: 150, matureMs: 180000, cycleMs: 120000, yield: 3, sell: 28 },
    { id: 'pear', level: 3, price: 220, matureMs: 240000, cycleMs: 140000, yield: 3, sell: 36 },
    { id: 'cherry', level: 5, price: 300, matureMs: 300000, cycleMs: 160000, yield: 4, sell: 40 }
];
export const ORCHARD_SLOTS = 6;   // eng ko'p bog' joyi (ferma darajasi bilan ochiladi)
// Bog' joylari ferma darajasiga qarab: 0-darajada 3 ta, 3-, 6-, 9-darajalarda +1 (eng ko'pi 6)
export function orchardSlotsFor(level: number): number { return Math.min(ORCHARD_SLOTS, 3 + Math.floor(Math.max(0, level) / 3)); }
// FERMER UYI ichi: jihozlar (do'kondan, bir marta) va ularning joylari. Yashik - ombor (inventardagi narsalar)
export type HomeSlotType = 'floor' | 'wall' | 'ceil' | 'rug';
export const HOME_ITEMS: { id: string, slot: HomeSlotType, price: number }[] = [
    { id: 'chest', slot: 'floor', price: 150 },
    { id: 'table', slot: 'floor', price: 120 }, { id: 'chair', slot: 'floor', price: 60 },
    { id: 'bed', slot: 'floor', price: 200 }, { id: 'shelf', slot: 'floor', price: 150 },
    { id: 'fireplace', slot: 'floor', price: 250 },
    { id: 'pot', slot: 'floor', price: 50 }, { id: 'plant', slot: 'floor', price: 70 },
    { id: 'rug', slot: 'rug', price: 80 }, { id: 'painting', slot: 'wall', price: 100 }, { id: 'lamp', slot: 'ceil', price: 90 }
];
// Uy ichidagi joylar (ekran koordinatasi, 800 kenglik): pol - 6 ta, devor - 3, ship - 2, gilam - 1
export const HOME_SLOTS: { id: string, type: HomeSlotType, x: number }[] = [
    { id: 'f0', type: 'floor', x: 170 }, { id: 'f1', type: 'floor', x: 290 }, { id: 'f2', type: 'floor', x: 410 },
    { id: 'f3', type: 'floor', x: 530 }, { id: 'f4', type: 'floor', x: 650 }, { id: 'f5', type: 'floor', x: 745 },
    { id: 'w0', type: 'wall', x: 230 }, { id: 'w1', type: 'wall', x: 470 }, { id: 'w2', type: 'wall', x: 700 },
    { id: 'c0', type: 'ceil', x: 350 }, { id: 'c1', type: 'ceil', x: 590 },
    { id: 'r0', type: 'rug', x: 440 }
];
export const CHEST_CAP = 300;     // yashikka shuncha narsa sig'adi (hosil + baliq)
// BAXAYBAT DARAXT: 400 tangaga ochiladi, "moviy suv" quyilgach ko'k olmalar o'sadi (shoxlarda - platformalardan
// sakrab teriladi). 100 ta terilganda daraxt og'zini ochadi - BOSS jangi. Yengilgach yana quriydi (yana moviy suv kerak)
export interface GiantTreeDef {
    x: number; price: number; needApples: number; regrowMs: number; appleSell: number;
    spots: { x: number, y: number }[];          // olma o'sadigan joylar (shox ustida)
    mouth: { x: number, y: number, w: number, h: number };   // jangda - zarar oladigan joy
    arenaX0: number; arenaX1: number;
    bossHp: number; bossHpPerPlayer: number;
    rootDamage: number; appleDamage: number; pillarDamage: number;
    rewardCoins: number; rewardXp: number;
}
// QO'ZIQORINLAR (zararkunanda): host fermaga absentMs davomida kirmasa - count ta chiqadi, grядkadagi ekinni yeydi
export interface ShroomDef { absentMs: number; count: number; hp: number; eatMs: number; sporeRange: number; sporeDamage: number; sporeEveryMs: number; killCoins: number; }
// FERMA DARAJASI: hosil, meva, baliq, buyurtmalar XP beradi. Daraja oshsa - inventar sig'imi kattalashadi,
// uy, ombor va platforma kattaroq/chiroyliroq bo'ladi. L-darajaga jami 60 * L * (L+1) / 2 XP kerak (10 - eng yuqori)
export const FARM_MAX_LEVEL = 10;
export function farmLevel(xp: number): number {
    let l = 0;
    while (l < FARM_MAX_LEVEL && (xp || 0) >= 30 * (l + 1) * (l + 2)) l++;
    return l;
}
export function farmLevelXp(l: number): number { return 30 * l * (l + 1); }
export function farmCapacity(level: number): number { return 80 + 40 * level; }
// BUGUNGI TAKLIF: har kuni (UTC) 2 ta mahsulot ikki baravar qimmat sotiladi - hamma uchun bir xil
export function dailyOffer(now: number): string[] {
    const pool = [...CROPS.map(c => c.id), ...FRUIT_TREES.map(t => t.id), 'blueapple', ...FISH.filter(f => !f.golden).map(f => f.id)];
    const day = Math.floor(now / 86400000);
    const h = (n: number) => (Math.imul(n ^ 0x9e3779b9, 0x85ebca6b) >>> 5);
    const a = h(day) % pool.length;
    let b = h(day + 7777) % pool.length;
    if (b === a) b = (b + 1) % pool.length;
    return [pool[a], pool[b]];
}
export interface RaidDef {
    everyMs: number; jitterMs: number; firstMs: number;
    slime: { hp: number, hpPerPlayer: number, dmg: number, coins: number, hopMs: number, hopDist: number, hopH: number, splits: number };
    slimelet: { hp: number, dmg: number, coins: number, hopMs: number, hopDist: number, hopH: number };
    zveg: { n: number, hp: number, speed: number, dmg: number, coins: number };
    shrooms: number;
}
// BEZAKLAR (do'kondan, bir marta): fermada hammaga ko'rinadi
export const FARM_DECOR: { id: string, price: number }[] = [
    { id: 'flowers', price: 80 }, { id: 'lantern', price: 120 }, { id: 'paint', price: 150 }, { id: 'dog', price: 250 }
];
export const FARM_PLOTS = 6;       // bitta maydondagi grядkalar
export const FARM_ZONES = 6;       // 1-maydon ochiq, qolganlari - "Free plot" (sotib olinadi; oxirgi 2 tasi ferma darajasi bilan)
// FASLLAR (faqat My Farm): ko'rinish va ekinlarning o'sish tezligi. Admin paneldan tanlanadi ('auto' - kalendar bo'yicha)
export type FarmSeason = 'spring' | 'summer' | 'autumn' | 'winter';
export const FARM_SEASONS: FarmSeason[] = ['spring', 'summer', 'autumn', 'winter'];
export const SEASON_GROWTH: { [s in FarmSeason]: number } = { spring: 1.25, summer: 1.5, autumn: 1, winter: 0.6 };
let farmSeasonSetting: FarmSeason | 'auto' = 'auto';
export function setFarmSeasonSetting(v: unknown): boolean {
    if (v !== 'auto' && !FARM_SEASONS.includes(v as FarmSeason)) return false;
    farmSeasonSetting = v as FarmSeason | 'auto';
    return true;
}
export function getFarmSeasonSetting(): FarmSeason | 'auto' { return farmSeasonSetting; }
// 'auto': shimoliy yarimshar kalendari - mart-may bahor, iyun-avgust yoz, sentabr-noyabr kuz, dekabr-fevral qish
export function currentFarmSeason(now: number = Date.now()): FarmSeason {
    if (farmSeasonSetting !== 'auto') return farmSeasonSetting;
    const m = new Date(now).getUTCMonth();
    return m >= 2 && m <= 4 ? 'spring' : m >= 5 && m <= 7 ? 'summer' : m >= 8 && m <= 10 ? 'autumn' : 'winter';
}
export interface MyFarmDef {
    zoneX0: number; zoneW: number;  // maydonlar: chap cheti va kengligi
    plotX0: number; plotW: number; plotGap: number;
    range: number;                  // grядka markazidan shu masofada E ishlaydi
    zonePrice: number;              // "Free plot" maydoni narxi (eski - zonePrices[1])
    zonePrices: number[];           // har maydon narxi (0 - bepul)
    waterPrice: number;             // grядkani sug'orish narxi
    zoneLevels: number[];           // maydonni ochish uchun kerakli ferma darajasi
    riverX0: number;                // daryo qirg'og'i
    dockX1: number;                 // platforma (ko'prikcha) uchi
    dockPrice: number;
    netCooldownMs: number;
    boardX: number;                 // buyurtmalar taxtasi (uy yonida)
    decor: { id: string, price: number }[];
    maxLevel: number;
    toolUses: number;               // udochka / setka shuncha marta ishlatilgach sinadi
    waterBoost: number;             // sug'orilgan grядka shuncha ulush tezroq o'sadi (0.5 = 1.5x)
    goldenChance: number;           // o'g'itli hosil - ba'zan "oltin" (5 ta)
    orchardX: number[];             // mevali daraxt joylari (ferma darajasi bilan ochiladi - orchardSlotsFor)
    houseX: number;                 // fermer uyi (eshigi) - ichiga kiriladi
    // MAXLUQLAR HUJUMI: har everyMs (+- jitterMs) da tasodifiy biri - bahaybat shilimshiq, yovuz qo'ziqorinlar yoki zombi sabzavotlar
    raids: RaidDef;
    homeItems: { id: string, slot: HomeSlotType, price: number }[];
    homeSlots: { id: string, type: HomeSlotType, x: number }[];
    chestCap: number;
    fruitTrees: FruitTreeDef[];
    tree: GiantTreeDef;
    shrooms: ShroomDef;
    crops: CropDef[];
    fish: FishDef[];
    // YOMG'IR: har slotMs da (agar navbati kelsa) offsetMs dan boshlab durMs davomida - ekinlar 2x tez o'sadi
    rain: { slotMs: number, offsetMs: number, durMs: number, every: number };
}
// k-grядka (0..23) markazi: maydon = k/6
export function farmPlotX(F: MyFarmDef, k: number): number {
    const zone = Math.floor(k / FARM_PLOTS), i = k % FARM_PLOTS;
    return F.zoneX0 + zone * F.zoneW + F.plotX0 + i * (F.plotW + F.plotGap) + F.plotW / 2;
}
export function farmZoneCenter(F: MyFarmDef, zone: number): number { return F.zoneX0 + zone * F.zoneW + F.zoneW / 2; }
// Yomg'ir jadvali hamma uchun bir xil (vaqtdan hisoblanadi) - klientda ham aynan shu formula
export function farmRainSlot(n: number, every: number): boolean { return ((Math.imul(n ^ 0x5bd1e995, 0x27d4eb2d) >>> 7) % every) === 0; }
export function farmIsRaining(F: MyFarmDef, now: number): boolean {
    const R = F.rain, n = Math.floor(now / R.slotMs), off = now - n * R.slotMs;
    return farmRainSlot(n, R.every) && off >= R.offsetMs && off < R.offsetMs + R.durMs;
}
// Ekilgandan beri "samarali" o'sish vaqti: yomg'irli daqiqalar ikki marta hisoblanadi
export function farmGrown(F: MyFarmDef, t: number, now: number, growMs: number, w?: number): boolean {
    const season = currentFarmSeason(now), mult = SEASON_GROWTH[season];
    const el = (now - t + (w ? F.waterBoost * Math.max(0, now - w) : 0)) * mult;   // sug'orilgandan beri - tezroq; fasl tezligi
    if (el >= growMs) return true;
    if (el <= 0) return false;
    if (season === 'winter') return false;   // qishda qor yog'adi - yomg'ir kabi tezlatmaydi
    const R = F.rain;
    let extra = 0;
    for (let n = Math.floor(t / R.slotMs); n <= Math.floor(now / R.slotMs); n++) {
        if (!farmRainSlot(n, R.every)) continue;
        const a = Math.max(t, n * R.slotMs + R.offsetMs), b = Math.min(now, n * R.slotMs + R.offsetMs + R.durMs);
        if (b > a) extra += b - a;
    }
    return el + extra * mult >= growMs;
}

// ELF QISHLOG'I: elf bahaybat daraxt tepasida turib olma otadi, qahramonlar
// orqasidagi savatcha bilan tutadi. Bir-biriga tegsa - ikkalasining olmasi sochiladi
export interface ApplesDef {
    applesToCollect: number;    // Har bir qahramon shuncha olma tutishi kerak
    elfX: number;               // Olma otiladigan nuqta - elfning qo'li (daraxt tepasida)
    elfY: number;
    throwIntervalMs: number;    // Bitta faol qahramon uchun otish oralig'i (ko'p bo'lsa - tezroq)
    targetMinX: number;         // Olmalar shu oraliqqa tushadi (devorga emas)
    targetMaxX: number;
    doorX: number;              // Qahramonlar chiqadigan (kirish) eshik - klientda vizual
    // KATTA DEVOR va undagi KATTA ESHIK: 12 ta olma tutgan qahramonga elf kalit
    // beradi, kalit bilan eshik ochiladi, hamma eshikdan kirsa - xarita o'tildi
    bigWall: PlatformDef;
}

export interface PitDef {
    x: number;
    w: number;   // Yerdagi shu oraliq - jarlik: tushgan qahramon halok bo'ladi
}

// AYRI YO'L: ikki yo'l (tepa - uzun platforma, past - uning ostidagi tunnel).
// Har raundda TASODIFAN bittasi oxirida yopiladi - qaysi biri ochiq, oldindan
// ko'rinmaydi (omadga bog'liq)
export interface ForkDef {
    blockTop: PlatformDef;
    blockBottom: PlatformDef;
}

// O'RMON (map-6): qal'adan chiqib o'rmonga kiriladi; bahaybat daraxt yoniga yetganda
// (arenaTriggerX) daraxtdan ROBOT ITLAR sakrab tushadi - har qahramonga botsPerPlayer ta.
// Daraxt shoxlari - platformalar. Tepadan vaqti-vaqti bilan QIZIL QUTI tushadi:
// o'q/zarba tegsa portlaydi (yaqindagi itlarga katta zarar, qahramonlarga ham ozgina)
export interface RedBoxDef {
    intervalMs: number;
    maxBoxes: number;
    minX: number;
    maxX: number;
    blastRadius: number;
    blastBotDamage: number;
    blastPlayerDamage: number;
}
export interface ForestDef {
    treeX: number;           // Bahaybat daraxt tanasining markazi (klientda rasm)
    arenaTriggerX: number;   // Tirik qahramon shu X ga yetsa - itlar paydo bo'ladi
    caveX: number;           // Itlar o'lgach yo'l davom etadi: shu X dan o'tgan qahramon G'ORGA kirgan
                             // hisoblanadi; hamma tirik qahramon kirsa - xarita o'tildi
    botsPerPlayer: number;   // 1-4 qahramon -> 2-8 it
    dogHp: number;
    redBox: RedBoxDef;
}
export const RED_BOX_SIZE = 32;

// YURUVCHI TOSHLAR (map-7): chuqurlik ustida tepaga-pastga tebranib turgan toshlar.
// Qahramon tosh ustiga tushsa - tosh titraydi va fallDelayMs dan so'ng QULAYDI; undan
// oldin keyingisiga sakrab o'tish kerak. Qulagan tosh respawnMs dan so'ng qaytadi
// (orqadagi sheriklar ham o'ta olsin). Oxirgi qirg'oqqa (goalX) hamma yetsa - o'tildi
export interface StoneDef {
    x: number;        // markazi
    w: number;
    baseY: number;    // tepa qirrasining o'rtacha balandligi
    amp: number;      // tebranish amplitudasi (px)
    periodMs: number;
    phase: number;    // radian
}
export interface StonesDef {
    stones: StoneDef[];
    fallDelayMs: number;
    respawnMs: number;
    goalX: number;
}

// MAP-7: kichik toshlar ikki qatorda - pastki yo'l (14 ta) va ular ustida, oralarida yuqori toshlar (10 ta).
// Hammasi tez tepa-past tebranadi (taxminan 1 soniyada) - sakrash vaqtini topish kerak
function buildStonesLayout(): { stones: StonesDef, width: number, pitX: number, pitW: number } {
    const lowW = [76, 70, 64, 72, 66, 62, 70, 64, 68, 60, 66, 62, 70, 64];
    const lowY = [486, 470, 490, 462, 482, 458, 478, 452, 474, 450, 470, 456, 476, 460];
    const gaps = [86, 92, 88, 96, 92, 100, 94, 98, 96, 102, 96, 100, 94, 98];
    const stones: StoneDef[] = [];
    let left = 250 + gaps[0];
    const lows: { x: number, w: number, y: number }[] = [];
    for (let i = 0; i < lowW.length; i++) {
        const x = left + lowW[i] / 2;
        lows.push({ x, w: lowW[i], y: lowY[i] });
        stones.push({ x, w: lowW[i], baseY: lowY[i], amp: 32, periodMs: 950 + (i % 4) * 120, phase: i * 1.7 });
        left += lowW[i] + (gaps[i + 1] || 96);
    }
    // Yuqori toshlar: ikki pastki tosh oralig'i ustida, ~120 px balandroqda
    for (let i = 0; i < 10; i++) {
        const a = lows[i + 2], b = lows[i + 3];
        const x = (a.x + b.x) / 2, w = 56 + (i % 3) * 6;
        stones.push({ x, w, baseY: Math.min(a.y, b.y) - 118 - (i % 2) * 14, amp: 44, periodMs: 1050 + (i % 3) * 150, phase: i * 2.3 + 1 });
    }
    const goalLedge = left;
    return {
        stones: { stones, fallDelayMs: 1000, respawnMs: 3000, goalX: goalLedge + 40 },
        width: goalLedge + 420, pitX: 250, pitW: goalLedge - 250
    };
}
const STONES_7 = buildStonesLayout();

// TOSH GORILLA (map-8, boss): bitta ekranli tosh zal, shiftli. Gorilla o'rtada, yerda.
// Har hujumdan oldin baqiradi; hujumni qahramonlarning KO'PCHILIGI qayerdaligiga qarab tanlaydi:
//   yerda va yaqinda  -> juda tez va qattiq ITARADI (push)
//   yerda, uzoqda     -> yerni uradi, qahramon turgan joydan KATTA TOSH otilib chiqadi (spike)
//   platformalarda    -> yerni uradi: yo tepadan TOSHLAR yog'iladi (rocks), yoki ko'pchilik
//                        turgan platforma titrab, SHIFTGA uriladi - ustidagilar halok (crush)
// Ba'zan charchab, 1 soniya nafas oladi - shu payt hech kimga tegmaydi
export interface GorillaDef {
    baseHp: number;
    hpPerExtraPlayer: number;
    startX: number;
    halfW: number;           // tanasi (o'q tegadigan qism) - markazdan yarim kengligi
    height: number;
    walkSpeed: number;       // px/s - hujumlar orasida ko'pchilik tomon sekin yuradi
    nearRange: number;       // yerdagi qahramon shu masofada bo'lsa - "yaqin"
    idleMs: number;
    roarMs: number;
    restMs: number;
    restChance: number;
    pushDamage: number;
    pushSpeed: number;
    contactDamage: number;   // oldidan o'tsa/tegsa - qattiq otib yuboradi
    contactSpeed: number;
    attackAnimMs: number;    // itarish/urish harakati davomiyligi
    spikeDamage: number;
    spikeWarnMs: number;
    rockDamage: number;
    crushShakeMs: number;    // platforma titrashi (shu vaqtda sakrab qochish kerak)
    ceilingY: number;        // shiftning pastki qirrasi
    platforms: PlatformDef[];
}

// SEMIZ ELF (map-9, "Vaxtida kelding"): gorilla toshlari ostidan chiqqan qahramonlar oldida -
// boshqa elfni yeyayotgan semiz elf. Oldiga borib E bosilsa (yoki yonidan o'tib ketilsa) - suhbat,
// keyin oddiy jang (boss emas). Og'zidan KISLOTA sepadi: tekkan qahramon maksimal jonining 30% ini
// yo'qotadi va 2 soniya staminasi tiklanmaydi. Yengilgach o'ngdagi eshik ochiladi - hamma tirik
// qahramon eshikka yetsa, xarita o'tiladi ("UnderWorld" yutug'i)
export interface FatElfDef {
    x: number;               // ovqatlanayotgan joyi (boshlang'ich)
    victimX: number;         // yeyilayotgan elf (hushsiz yotibdi) - klientda rasm
    halfW: number;           // tanasi (o'q tegadigan qism) - markazdan yarim kengligi
    height: number;
    baseHp: number;
    hpPerExtraPlayer: number;
    talkRange: number;       // shu masofada E bosilsa - suhbat; undan yaqin kelsa yoki o'tib ketsa - o'zi boshlanadi
    walkSpeed: number;       // px/s - hujumlar orasida eng yaqin qahramon tomon
    contactDamage: number;
    contactSpeed: number;
    spitIntervalMs: number;  // kislota sepishlar oralig'i
    spitChargeMs: number;    // og'zi yashil cho'g'lanadi - ogohlantirish
    acidPerSpit: number;     // har sepishda nechta tomchi
    acidDamagePct: number;   // maksimal jonning shuncha ulushi
    acidStaminaLockMs: number;
    doorX: number;           // yengilgach: tirik qahramonlarning hammasi shu X dan o'tsa - xarita o'tildi
}

// UNDERWORLD (map-10): qahramonlar g'ordan chiqib, yer osti dunyosiga keladi. Yo'lda OG'ZIBOR GUL
// yerdan chiqib, yaqinlashganni tishlaydi (ko'zi yo'q, to'q qizil, bargi yashil). Oddiy zarba bilan
// o'ladi; muz shari tegsa - muzlab qotib qoladi. Undan keyin UnderWorld shahri: trol bilan [E] -
// suhbat; hamma o'qib bo'lgach xarita o'tiladi
export interface UnderworldDef {
    caveExitX: number;        // chapdagi g'or og'zi (klientda rasm)
    flowers: { x: number }[];
    flowerWakeRange: number;  // shu masofaga kelinsa gul yerdan chiqadi
    flowerBiteRange: number;
    flowerBiteDamage: number;
    flowerFreezeMs: number;
    cityX: number;            // shahar boshlanishi (klientda - daraxt uylar, mavjudotlar)
    trollX: number;           // gaplashadigan trol
    talkRange: number;
}

// GIGANT GUL (Season 2, map-1): UnderWorld'da yo'l oxirida jang maydoni. Qahramon triggerX ga yetganda
// ikki tomondagi yo'l uzun tikonli devorlar bilan yopiladi. Gulning faqat BOSHI zarar oladi (poyasi - yo'q).
// Hujumlari: platformadagi qahramonga poyadan chiqqan novda bilan urib, uloqtiradi; harakatlanayotgan
// qahramonga 6 ta tikan sochadi; istalgan joydan yerdan tomir chiqib sanchiladi; eng tepa platformada
// kimdir bo'lsa - boshi bilan o'ziga yaqin qahramonni tishlaydi (boshqalarga hujumlar siyraklashadi);
// qahramon yerda bo'lsa - yerdan kichkina gullar sug'urilib chiqib, uni quvlaydi
export interface GiantFlowerDef {
    arenaX: number;          // jang maydonining chap cheti (chap tikon devor)
    arenaW: number;
    triggerX: number;        // shu yerga yetilganda jang boshlanadi
    stemX: number;           // poya asosi
    headY: number;           // boshning odatdagi balandligi (markazi)
    headR: number;           // bosh hitboxi (radius)
    hpPerPlayer: number;     // joni = hpPerPlayer x o'yinchilar soni
    topPlats: number[];      // platforms indekslari - "eng tepa" platformalar (tishlash)
    whipDamage: number; whipEveryMs: number; whipGrowMs: number;
    thornDamage: number; thornEveryMs: number; thornSpeed: number;
    rootDamage: number; rootEveryMs: number; rootWarnMs: number; rootUpMs: number;
    biteDamage: number; biteEveryMs: number; biteWindMs: number; biteRange: number; biteReach: number;
    sproutEveryMs: number; sproutHp: number; sproutMax: number; sproutBiteDamage: number;
}

// LIFT (Season 2, map-2): yo'lda yerdan katta platforma chiqadi (6 kishilik). Hamma tirik qahramon
// ustiga chiqib E bossa - tog' tepasiga ko'tariladi (ostida chuqur jarlik). Ko'tarilayotganda qizil
// botlar birma-bir tushadi (jami botsTotal ta); tepaga yetilganda xarita o'tiladi
export interface LiftDef {
    x: number;            // platformaning chap cheti
    w: number;
    triggerX: number;     // shu yerga yetilganda platforma yerdan chiqadi
    readyY: number;       // tayyor turganda platforma tepasi
    rideY: number;        // ko'tarilayotganda (ekranda) platforma tepasi
    liftOffMs: number;    // readyY -> rideY
    riseMs: number;       // tepaga yetguncha
    botsTotal: number;
    botHp: number;
    firstBotMs: number;
    nextBotMs: number;
}

// FERMA (Season 2, map-3): zombi poliz. Qahramon polizlar ustidan yurib, sabzi oldida E bosadi -
// sabzini sug'urib oladi (og'zidan qon oqadi) va polizlardan asta-sekin zombilar chiqadi: avval 3 ta,
// har o'ldirilganiga yerdan yana bittasi - jami killsPerPlayer x o'yinchilar o'ldirilguncha.
// Zombi bitta zarbada o'ladi va tomlarga chiqa olmaydi. Itxona tomiga chiqqanga robot it hujum qiladi
export interface FarmDef {
    carrotX: number;
    talkRange: number;
    fieldX0: number;          // polizlar (zombilar shu oraliqdan chiqadi)
    fieldX1: number;
    killsPerPlayer: number;
    aliveZombies: number;     // bir vaqtda (boshida) shuncha zombi
    zombieDamage: number;
    zombieEmergeMs: number;
    kennelX: number;          // itxona (tomi - platforms[kennelRoof])
    kennelRoof: number;
    dogHp: number;
    dogCooldownMs: number;
    noSpawn: [number, number][]; // quduq, itxona - zombi chiqmaydigan joylar
    rootPastCarrot: number;   // E bosmay sabzidan shuncha o'tib ketsa - yerdan ildiz oyog'idan ushlaydi
    rootMs: number;
    kennelRange: number;      // itxona yonidan (shu masofada) o'tsa ham it chiqadi
    tongueRange: number;      // tepadagi qahramonga igna-til yetadigan masofa
    tongueDamage: number;
}

// KALMAR (Season 2, map-4): daryo/ko'l ustidagi platformalar, tuman. Jang maydoniga yetilganda ikki
// tomondan ulkan kalmar qo'llari chiqib yo'lni yopadi, kalmar suvdan chiqadi. Faqat QIZIL KO'ZI zarar oladi.
// Hujumlari: qahramon turgan platformaga tepadan qo'li bilan uradi; pastdan geyzerlar (pastki va eng tepa
// platformagacha) 1 s otiladi; suvni ursa - tikanli baliqlar sakrab chiqib portlaydi. Suvga tushgan halok bo'ladi
export interface SquidDef {
    arenaX: number;
    arenaW: number;
    triggerX: number;
    entryX: number; entryY: number;  // jang boshlanganda tashqarida qolgan qahramon shu joyga o'tkaziladi
    baseX: number;           // ko'z markazi (o'rtacha) va harakat amplitudalari
    xAmp: number;
    eyeBaseY: number;
    eyeAmpY: number;
    eyeR: number;
    hpPerPlayer: number;
    arenaPlats: number[];    // platforms indekslari (jang maydonidagilar)
    lowY: number;            // pastki platformalar balandligi (geyzer shu yergacha)
    topY: number;            // eng tepa platformalar (geyzer shu yergacha)
    slamDamage: number; slamEveryMs: number; slamRaiseMs: number;
    geyserDamage: number; geyserEveryMs: number; geyserWarnMs: number; geyserUpMs: number;
    fishEveryMs: number; fishCount: number; fishDamage: number; fishRadius: number;
}

// SARIQ ESHIK (Season 2, map-5): yo'lda sariq va qora eshik chiqadi, sariq eshik ortidan yordam so'ragan
// ovoz. Tanlov: KIRISH ("Respect" yutug'i, +200 XP - akkauntga bir marta) yoki "YO'Q" (keyin ham kirish mumkin).
// Ichkarida: bog'langan elf malika, richag -> tepadan "OQ YUZ" tushadi; uni faqat bombalar portlashi yaralaydi,
// joni ozgina qolganda yorug' chiqish ochiladi - chiqqan qahramon bilan xarita o'tiladi.
// Kirmasa: 100 m tepaga (4 platforma, har 25 m da yangi qism); yer silkinganda 4 tadan 3 tasiga tosh tushadi
export interface DoorsDef {
    triggerX: number;
    yellowX: number;
    blackX: number;
    // Tepaga chiqish
    climbX0: number;
    climbX1: number;
    climbPlats: number[];    // platforms indekslari (qavat-qavat, pastdan tepaga; oxirgisi - eng tepadagi maqsad)
    stageStep: number;       // bir qavat balandligi (px)
    stageRows: number[][];   // qavat ichidagi 4 talik qatorlar: qahramon turgan qatorga 3 ta tosh, bittasi xavfsiz
    climbStartX: number;
    segments: number;        // qavatlar soni
    segMeters: number;       // bir qavat - shuncha metr
    rockEveryMs: number;
    rockWarnMs: number;
    rockDamagePct: number;
    // Ichkari - ulkan qorong'i g'or: richag tortilgach maxluq malikani olib ketadi, 400 m qochish
    roomX0: number;
    roomX1: number;
    roomEntryX: number;
    elfX: number;
    elfY: number;
    leverX: number;
    exitX: number;            // g'or oxiridagi yorug'lik: shu yerga yetilsa - orqada g'or qulaydi, xarita o'tiladi
    runMeters: number;
    floorY: number;           // g'or yo'li (tosh ustunlar tepasi)
    floorHoles: { x: number, w: number }[];        // ustunlar orasidagi bo'shliqlar - richag tortilgach ochiladi
    wallHoles: { x: number, y: number, r: number }[]; // devordagi tunnel teshiklari - maxluq boshi chiqadi
    // Bo'shliqdan chiqadigan qo'l: oldidagi ustunda turgan (yoki bo'shliqqa tushgan) qahramonni ushlaydi
    holeHandEveryMs: number;
    holeHandWarnMs: number;
    holeHandUpMs: number;
    holeHandReach: number;    // egilgan qo'l ustun chetidan shuncha ichkariga yetadi
    holeHandGrabAtMs: number; // qo'l chiqib egilib bo'lgan payt - shundagina ushlaydi
    holeHandCdMs: number;
    holeDamage: number;       // qo'l ushlasa
    grabMs: number;           // qo'l ushlasa - shuncha vaqt yura olmaydi
    // Devordagi teshikdan bosh: avval ko'zlar yonadi, keyin otilib chiqib tunnelga tortadi
    headWarnMs: number;
    headLungeMs: number;
    headBackMs: number;
    headCdMs: number;         // bitta teshik qayta hujumi
    headGlobalMs: number;     // ikki hujum orasidagi eng kam vaqt
    headTrigger: number;      // qahramon teshikka shuncha yaqinlashsa - ko'zlar yonadi
    headReach: number;        // otilib chiqqanda ushlaydigan masofa (teshik radiusiga qo'shiladi)
    swallowMs: number;        // tunnel ichida
    swallowDamagePct: number; // boshqa teshikdan tupurib chiqarganda - maks. jonning ulushi
    grabImmuneMs: number;     // tunneldan chiqqandan keyin shuncha vaqt hech qaysi bosh ushlamaydi
    huntMeters: number;       // malikani qoldirib (richagni tortmasdan) shuncha metr ketsa - OQ YUZ yugurib kelib ushlaydi: o'yin tugaydi
    huntSpeed: number;        // o'shanda yugurish tezligi (px/s)
    // G'OR QO'ZIQORINCHALARI: aqlli kichik maxluqlar - bo'shliqdan sakrab o'tadi, o'qdan sakrab qochadi, xalaqit beradi
    shroomHp: number;
    shroomDamage: number;
    shroomSpeed: number;      // px/s
    shroomEveryMs: number;
    shroomMax: number;        // bir vaqtda nechta (1 - bittadan: o'lgach yangisi chiqadi)
    shroomRespawnMs: number;  // o'lgandan keyin yangisi shuncha vaqtdan so'ng chiqadi
    respectXp: number;
    doorLocked: boolean;      // VAQTINCHA: sariq eshik yopiq - tanlov yo'q, faqat tog'ga chiqiladi (eshik ortidan ovozlar). false - g'or qaytadi
}

// MAP-5 TEPAGA CHIQISH: rasmdagi qavat (pastda 4, o'rtada 1, tepada 4, eng tepada 1 platforma) bir joyda
// ustma-ust 10 marta - har qavatning eng tepasidan keyingi qavatning pastki qatoriga bir sakrash
const CLIMB_STAGE = [
    { x: 1043, y: 460, w: 143, h: 12 }, { x: 1270, y: 460, w: 100, h: 12 }, { x: 1434, y: 460, w: 92, h: 12 }, { x: 1579, y: 460, w: 119, h: 12 },
    { x: 1335, y: 355, w: 118, h: 12 },
    { x: 1047, y: 245, w: 122, h: 12 }, { x: 1220, y: 245, w: 110, h: 12 }, { x: 1411, y: 245, w: 118, h: 12 }, { x: 1593, y: 245, w: 120, h: 12 },
    { x: 1294, y: 135, w: 174, h: 12 }
];
const CLIMB_STAGES = 10, CLIMB_STEP = 435;
const CLIMB_TOWER = Array.from({ length: CLIMB_STAGES }, (_, k) => CLIMB_STAGE.map(pl => ({ ...pl, y: pl.y - k * CLIMB_STEP }))).flat();

// MAP-5 G'ORI: 400 m qochish yo'li - chuqur jarlik ustidagi tosh ustunlar (ular orasidagi bo'shliqlar richag
// tortilgach ochiladi, tushgan halok bo'ladi; bo'shliqdan qo'llar chiqadi) va devordagi tunnel teshiklari. Tasodifiy, lekin har safar
// bir xil (urug'li generator)
const CAVE_RUN = (() => {
    let seed = 5150;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const roomX0 = 2200, runFrom = 2260, runMeters = 300, exitX = runFrom + runMeters * 50, roomX1 = exitX + 200, floorY = 420;
    const blocks: { x: number, y: number, w: number, h: number }[] = [];
    const floorHoles: { x: number, w: number }[] = [];
    let x = 2760;
    const H = 600 - floorY;   // ustunlar jarlik tubigacha (pastda yer yo'q - tushgan halok bo'ladi)
    blocks.push({ x: roomX0, y: floorY, w: x - roomX0, h: H });       // eshik, richag va malika turgan joy - yaxlit
    while (x < exitX - 300) {
        const gw = 110 + Math.round(rnd() * 60);
        floorHoles.push({ x, w: gw });
        x += gw;
        const pw = 90 + Math.round(rnd() * 50);
        if (x + pw >= exitX - 300) break;
        blocks.push({ x, y: floorY, w: pw, h: H });
        x += pw;
    }
    blocks.push({ x, y: floorY, w: roomX1 - x, h: H });               // oxirgi yaxlit tosh - yorug'likka chiqish
    const wallHoles: { x: number, y: number, r: number }[] = [];
    for (let wx = 3350; wx < exitX - 600; wx += 520 + Math.round(rnd() * 340)) {
        const r = 44 + Math.round(rnd() * 22);
        // Teshik pastki cheti yo'ldan 50 px yuqorida; eng balandidan ham bosh yo'ldagi qahramonga yetadi
        wallHoles.push({ x: wx, y: 230 + Math.round(rnd() * (140 - r)), r });
    }
    return { runMeters, exitX, roomX1, floorY, blocks, floorHoles, wallHoles };
})();

// SEASON 2 MAP-6 "HIS BACK": map-5 dagi tog' tepasidan yo'l davom etadi (100 m), so'ng bahaybat YOG'OCH
// ZIGZAG YO'LAK tepaga (130 m) - rasmdagidek: ikki devor orasida uzluksiz zigzag (qiyaliklar burchakda tutashadi,
// sakrash shart emas), har burchakdan devorgacha tekis maydoncha. Tepada Gorila Rock portlovchi bochkalar dumalatadi:
// bochka qiyalikdan burchakka yetgach yo pastki qiyalikda davom etadi, yo maydonchaga burilib devorgacha boradi
export interface BackRamp { lowX: number, lowY: number, highX: number, highY: number }
export interface BackDef {
    towerX0: number;          // yo'lak minorasi (chap devor) - yo'lning 100-metri
    towerX1: number;
    groundY: number;
    topY: number;             // eng tepadagi maydoncha (Gorila Rock turgan joy)
    climbMeters: number;
    ramps: BackRamp[];        // pastdan tepaga; ramps[k].high === ramps[k+1].low (bitta burchak)
    ledges: { x0: number, x1: number, y: number }[];   // har burchakdan devorgacha tekis maydoncha (ledges[k] - ramps[k] ning past burchagi, k>=1)
    ledgeChance: number;      // bochka burchakda maydonchaga burilish ehtimoli
    gorillaX: number;
    barrelEveryMs: number;
    barrelSpeed: number;      // px/s (gorizontal)
    barrelR: number;
    barrelDamage: number;
    barrelMax: number;
    barrelAhead: number;      // bochka qahramondan shuncha qiyalik yuqorida paydo bo'ladi
}
const AX_ROBOT = 2100;   // Season 2 map-8: jang maydoni boshlanishi (40 m yo'ldan keyin)
const BACK_TOWER = (() => {
    // Burchaklar: chapdagisi devordan 130 px, o'ngdagisi 195 px ichkarida; har qiyalik 143 px ko'tariladi (~17°)
    const groundY = 570, X0 = 5100, X1 = 5900, VL = X0 + 130, VR = X0 + 605, RISE = 143, N = 46;
    const V = Array.from({ length: N + 1 }, (_, k) => ({ x: k % 2 === 0 ? VL : VR, y: groundY - k * RISE }));
    const ramps: BackRamp[] = Array.from({ length: N }, (_, k) => ({ lowX: V[k].x, lowY: V[k].y, highX: V[k + 1].x, highY: V[k + 1].y }));
    // ledges[k]: V[k] burchagidan devorgacha (0 - yer, N - eng tepa: alohida)
    const ledges = V.map((v, k) => (k === 0 || k === N) ? { x0: 0, x1: 0, y: v.y } : (v.x === VL ? { x0: X0, x1: VL, y: v.y } : { x0: VR, x1: X1, y: v.y }));
    return { X0, X1, groundY, ramps, ledges, topY: V[N].y };
})();

// SEASON 2 MAP-7 "INFINITY TNT": ikki qoya orasidagi yog'och bino (rasmdagidek). Gorila Rock endi o'lmaydi:
// bochka otadi, platformaga sakrab uradi, osmonga 5 ta bochka otib yomg'irdek tushiradi. Yengish yo'li - pastdagi
// cheksiz TNT bochkani (1600 HP) otib portlatish: 0 ga tushgach 3 soniya - bino portlab quladi, qoyaga chiqib ulgurmagan halok
export interface TntDef {
    floor: number;            // platforms indeksi: bino poli
    building: number[];       // portlaganda qulaydigan platformalar
    surfaces: number[];       // gorilla turadigan/sakraydigan platformalar
    cliffY: number;           // qoyalar usti (xavfsiz joy)
    leftCliffX: number;       // chap qoya o'ng cheti
    rightCliffX: number;      // o'ng qoya chap cheti
    box: { x: number, y: number, w: number, h: number };   // INFINITY TNT
    hp: number;               // 1 o'yinchi uchun
    hpPerExtraPlayer: number; // har qo'shimcha o'yinchiga (2 kishi - hp + 1 x shu, 4 kishi - hp + 3 x shu)
    fuseMs: number;
    introMs: number;
    gorHalfW: number;
    gorH: number;
    gorSpeed: number;
    gorStartX: number;
    bombDamage: number;       // qo'ldan otilgan bochka
    bombRadius: number;
    skyBombs: number;
    skyDamage: number;
    skyRadius: number;
    skyWarnMs: number;
    slamDamage: number;
    slamRange: number;
    contactDamage: number;    // tegsa (Season 1 dagi Gorila Rock'dan kuchliroq)
    contactSpeed: number;     // tegsa - qanchalik qattiq itaradi
    clapDamage: number;       // QARSAK: faqat gorilla bilan bir xil balandlikda turganlarga
    clapWarnMs: number;
    clapSpeed: number;
    restMs: number;           // hujumlar orasidagi tanaffus
}

// SEASON 2 MAP-8 "IRON GIANT": 40 m yo'l, so'ng jang maydoni (rasmdagidek): chapda 3 ta suzuvchi platforma,
// o'ngda ulkan robot. Joni faqat BOSHIGA tekkanda kamayadi (bosh baland - platformalardan otiladi).
// Hujumlar (navbat bilan): qo'l bilan tepadan uradi, ZARBADAN KEYIN ko'zidan lazer otadi; tepadan ketma-ket
// 4 marta uradi; qo'lidagi quroldan 5 ta chaqmoq; tanasidagi lyukdan robot bot chiqaradi va tutab o'chadi
// (dam oladi) - bot yengilgach yana yonadi
export interface RobotDef {
    arenaX: number;           // jang maydoni chap cheti (yo'lning 40-metri)
    triggerX: number;         // shu yerga yetilsa - robot uyg'onadi, maydon yopiladi
    head: { x: number, y: number, w: number, h: number };   // faqat shu joyga zarar
    eyeY: number;
    shoulder: { x: number, y: number };   // uradigan qo'l yelkasi
    fistRest: { x: number, y: number };   // qo'lning tinch turgan joyi
    hpPerPlayer: number;
    introMs: number;
    smashWarnMs: number; smashDamage: number; smashW: number;
    comboWarnMs: number; comboDamage: number;
    laserWarnMs: number; laserFireMs: number; laserDamage: number;
    botHp: number;            // tashlangan robot bot joni (har o'yinchiga)
    boltCount: number; boltEveryMs: number; boltSpeed: number; boltDamage: number;   // qo'lidagi quroldan chaqmoqlar
    restMs: number;
    dyingMs: number;
}

// SEASON 2 MAP-9 "ROAD TO SKYLAND": boshida do'kon (Eliksir, Chip), oldida RANETS AVTOMATI (1000 tanga).
// Yo'l oxirida jarlik - Skyland'ga faqat ranets bilan uchib o'tiladi (ranetsi bor qahramon jarlikka yetsa - o'tildi).
// Avtomatga o'q/zarba tegsa - qo'l-oyoqlari chiqib jang boshlanadi: hujumda qalqon ko'taradi (faqat olov
// sochayotganda va sakrab tushgandan keyin zarar oladi), qo'lidan olov sochadi, sakrab o'yinchini havoda
// quvib ustiga tushadi. Yengilsa - sinadi va har o'yinchiga ranets tushadi (E bilan olinadi)
export interface VendDef {
    machineX: number;         // avtomat markazi (tinch turgan joyi)
    w: number; h: number;     // tanasi (shkaf)
    legH: number;             // jangda oyoqlari tanani shuncha ko'taradi
    price: number;            // ranets narxi (shu o'yin uchun)
    buyRange: number;
    edgeX: number;            // jarlik cheti (shu yerga ranets bilan yetilsa - uchib ketadi)
    x0: number; x1: number;   // jangda yura oladigan oraliq
    hp: number;
    transformMs: number; dyingMs: number; flyMs: number;
    walkSpeed: number;
    contactDamage: number; contactSpeed: number;
    flameWarnMs: number; flameMs: number; flameLen: number; flameH: number; flameDamage: number; flameEveryMs: number;
    jumpMs: number; jumpPeak: number; jumpTrackSpeed: number; landDamage: number; landSpeed: number;
    jumpLockAt: number;       // sakrashning shu ulushidan keyin quvmaydi - tushadigan joy qotadi (qochib ulgurish mumkin)
    vulnMs: number;           // sakrab tushgandan keyin qalqonsiz turadi
    restMs: number;
}

// SEASON 2 MAP-10 "SKY BATTLE" (Osmondagi jang): o'yinchilar ranetsda uchadi (W/S - tepa/past, A/D - chap/o'ng).
// Tepada va pastda bulutlar - o'tib bo'lmaydi; yonlar keng, lekin chegaralangan. To'lqinlar: har birida o'yinchilar
// soncha (1-4) uchar mashinali bot - o'yinchiga nishonlab o'q otadi; vaqti-vaqti bilan osmondan chaqmoq (oldin belgi).
// To'lqinlardan keyin BOSS - uchar kema (Osmon qal'asi); yengilsa - xarita o'tildi
export interface SkyDef {
    top: number; bottom: number;            // uchish chegarasi (bulutlar)
    introMs: number; waves: number; waveGapMs: number;
    enemyHp: number; enemyHpPerWave: number; enemySpeed: number; enemyW: number; enemyH: number;
    enemyShotEveryMs: number; enemyShotSpeed: number; enemyShotDamage: number;
    strikeEveryMs: number; strikeWarnMs: number; strikeMs: number; strikeW: number; strikeDamage: number;
    bossHpPerPlayer: number; bossW: number; bossH: number; bossSpeed: number;
    bossRestMs: number; bossShotSpeed: number; bossShotDamage: number; bossDyingMs: number;
}

// BONUS "NO MORE FRIENDS" (Boshqa do'st emas): o'yinchilar bir-biriga qarshi (PvP). Har kim o'zi uchun:
// o'ldirilgan qahramon bir oz o'tib qayta tug'iladi; birinchi bo'lib killsToWin ta o'ldirgan - g'olib
export interface PvpDef {
    killsToWin: number;
    respawnMs: number;
    spawnShieldMs: number;     // qayta tug'ilgandan keyin shuncha vaqt zarar olmaydi
    shieldBlock: number;       // ritsar qalqoni ushlab turilsa - zararning shuncha ulushi to'siladi
}

// ARENA (BONUS xarita, mashq): botlar to'xtamay chiqadi; har o'ldirilgan bot uchun o'ldirganga
// +10 tanga va +5 XP. Har killsPerBoss ta o'ldirishda tasodifiy BOSS jangi (Gorila Rock, Semiz elf,
// Robot otryadi); boss yengilsa tirik qahramonlarga +100 tanga, +50 XP. Hamma o'lguncha davom etadi
export interface ArenaDef {
    killsPerBoss: number;
    botCoins: number;
    botXp: number;
    bossCoins: number;
    bossXp: number;
    spawnIntervalMs: number;
    maxBots: number;
    snake?: BossDef;           // Robot ilon arenada: chap eshikdan chiqib, joyida turib mina otadi va olov sochadi
}

export interface MapDef {
    id: number;              // 0-based ketma-ket indeks (ochilish tartibi)
    name: string;
    description: string;
    // 'waves' - botlar to'lqin-to'lqin chiqadi, HAMMASI o'lsa xarita o'tiladi;
    // 'chase' - botlar yo'q, orqadan ilon quvadi, chekpointga yetish kerak
    // 'apples' - botlar yo'q, elf daraxtdan olma otadi, har kim savatchaga N ta tutadi
    // 'story' - jang yo'q: NPC bilan suhbat (sahna), oxirida keyingi xaritaga o'tiladi
    // 'boss' - bahaybat robot-ilon bilan jang: joni tugaguncha otiladi
    mode: 'waves' | 'chase' | 'apples' | 'story' | 'boss' | 'stones' | 'gorilla' | 'fatelf' | 'underworld' | 'arena' | 'gflower' | 'lift' | 'farm' | 'squid' | 'doors' | 'back' | 'tnt' | 'robot' | 'shop' | 'vend' | 'sky' | 'pvp' | 'myfarm';
    killsToWin: number;      // 'waves': xaritadagi botlarning umumiy soni (0 = o'yinchilar soni)
    bossCoins?: number;      // Boss xaritasi: bossni o'ldirgan (oxirgi zarbani bergan) o'yinchiga shuncha tanga (yo'q bo'lsa - odatdagi 100)
    xpReward?: number;       // Xarita o'tilganda har o'yinchiga beriladigan tajriba (yo'q bo'lsa - XP_PER_MAP = 10). Bosslar - ko'proq
    accentColor: number;     // xaritaning o'ziga xos rangi (HUD/lobbida ko'rsatish uchun)
    groundColor: number;
    mapWidth: number;        // dunyoning to'liq kengligi (800 dan katta bo'lsa, kamera o'yinchini kuzatib suriladi)
    platforms: PlatformDef[]; // yerdan tashqari qo'shimcha platformalar
    playerSpawns: PointDef[]; // 4 ta o'yinchi uchun boshlang'ich joylar (tartib bo'yicha beriladi)
    botSpawnZone: BotSpawnZone; // botlar shu zonada, TEPADAN paydo bo'ladi - soni o'yinchilar soniga teng
    walls?: PlatformDef[];      // Qattiq to'siqlar (devorlar) - platformadek, lekin tosh ko'rinishida
    crates?: PointDef[];        // Sindiriladigan qutilar (markazi)
    chase?: ChaseDef;           // Faqat mode === 'chase' bo'lsa
    apples?: ApplesDef;         // Faqat mode === 'apples' bo'lsa
    story?: StoryDef;           // Faqat mode === 'story' bo'lsa
    boss?: BossDef;             // Faqat mode === 'boss' bo'lsa
    market?: { stalls: StallDef[], planks: PlatformDef[] }; // Bozor rastalari va taxtalar (map-4, map-5)
    forest?: ForestDef;         // Faqat o'rmon xaritasi (map-6)
    stones?: StonesDef;         // Faqat yuruvchi toshlar (map-7)
    gorilla?: GorillaDef;       // Faqat tosh gorilla (map-8)
    fatElf?: FatElfDef;         // Faqat semiz elf (map-9)
    underworld?: UnderworldDef; // Faqat UnderWorld (map-10)
    arena?: ArenaDef;           // Faqat Arena (bonus)
    giantFlower?: GiantFlowerDef; // Season 2, map-1
    lift?: LiftDef;             // Season 2, map-2
    farm?: FarmDef;             // Season 2, map-3
    squid?: SquidDef;           // Season 2, map-4
    doors?: DoorsDef;           // Season 2, map-5
    back?: BackDef;             // Season 2, map-6
    tnt?: TntDef;               // Season 2, map-7
    robot?: RobotDef;           // Season 2, map-8
    vend?: VendDef;             // Season 2, map-9 (ranets avtomati, jarlik)
    sky?: SkyDef;               // Season 2, map-10 (osmondagi jang)
    pvp?: PvpDef;               // BONUS: o'yinchilar bir-biriga qarshi
    shop?: { counterX: number, range: number, prices: { elixir: number, chip: number, [item: string]: number | undefined } };   // BONUS: do'kon
    myFarm?: MyFarmDef;         // BONUS: My Farm (o'z ekinlari)
    season?: number;            // 1 (yo'q bo'lsa) yoki 2 - lobbida qaysi bo'limda ko'rinadi
    bonus?: boolean;            // BONUS xarita: mavsum ketma-ketligiga kirmaydi, doim ochiq, "o'tilmaydi"
    pits?: PitDef[];
    mines?: PointDef[];         // Mina markazi
    forks?: ForkDef[];
}

export const MINE_DAMAGE = 40; // Jonning 40% i (maksimal jon - 100)
const mineOn = (x: number, surfaceTop: number): PointDef => ({ x, y: surfaceTop - 6 });

// Ayri yo'l: tepada - (x..x+len) uzunlikdagi yo'lak (tepasi 430), pastda -
// uning ostidagi tunnel. Yopuvchi devorlar yo'lak/tunnel oxirida
const WALKWAY_TOP = 430, WALKWAY_H = 24;
const walkway = (x: number, len: number): PlatformDef => ({ x, y: WALKWAY_TOP, w: len, h: WALKWAY_H });
const fork = (x: number, len: number): ForkDef => ({
    blockTop: { x: x + len - 60, y: 0, w: 40, h: WALKWAY_TOP },
    blockBottom: { x: x + len - 60, y: WALKWAY_TOP + WALKWAY_H, w: 40, h: 570 - WALKWAY_TOP - WALKWAY_H }
});

export const CRATE_SIZE = 36;
export const CRATE_HP = 20;
export const CRATE_COINS = 10;
export const GROUND_TOP = 570;
const crateOnGround = (x: number): PointDef => ({ x, y: GROUND_TOP - CRATE_SIZE / 2 });
const crateOn = (x: number, platformTop: number): PointDef => ({ x, y: platformTop - CRATE_SIZE / 2 });
// Yerda turgan devor: balandligi h (yuqori qirrasi = 570 - h)
const wall = (x: number, h: number, w = 36): PlatformDef => ({ x, y: GROUND_TOP - h, w, h });

export const GROUND_Y = 555;

export const MAPS: MapDef[] = [
    {
        id: 0,
        name: "The start",
        description: "A flat, open field — the simplest place for your first battle.",
        mode: 'waves',
        killsToWin: 0, // 0 = o'yinchilar soniga teng: har o'yinchiga bitta bot, bitta to'lqin
        accentColor: 0x00ffcc,
        groundColor: 0x333333,
        mapWidth: 1300, // Bitta ekrandan kengroq - kamera o'yinchi bilan birga suriladi
        // DIQQAT: sakrash balandligi ~133px (gravity 600, jump velocity -400).
        // Har bir qavat avvalgisidan ~110px past qilib qo'yilgan (zaxira bilan) -
        // aks holda (masalan avvalgi y=400 qavati yergacha 170px edi) o'yinchi
        // birinchi platformaga UMUMAN sakrab chiqa olmas edi
        platforms: [
            { x: 100, y: 240, w: 220, h: 20 },   // Chap-yuqori platforma
            { x: 680, y: 240, w: 240, h: 20 },   // Ekran chegarasidan o'tuvchi yuqori platforma
            { x: 380, y: 350, w: 180, h: 20 },   // O'rtadagi kichik platforma
            { x: 680, y: 460, w: 240, h: 20 },   // Ekran chegarasidan o'tuvchi pastki platforma (yerdan to'g'ridan-to'g'ri sakrab yetiladi)
            { x: 1080, y: 460, w: 200, h: 20 }   // Kengaytirilgan hududdagi platforma - endi yerdan to'g'ridan-to'g'ri yetiladi
        ],
        playerSpawns: [
            { x: 320, y: 500 }, { x: 400, y: 500 }, { x: 480, y: 500 }, { x: 560, y: 500 }
        ],
        botSpawnZone: { xStart: 120, xEnd: 900, y: 90 }
    },
    {
        id: 1,
        name: "Just run",
        description: "A giant robot snake breaks through the wall — dodge mines, pick the right path and land on the checkpoint!",
        mode: 'chase',
        killsToWin: 0,
        // Map-1 ning davomi: bir xil ranglar va boshidagi 1300px - aynan map-1
        // maydoni (qahramonlar o'sha joyda turibdi, ilon chapdagi devorni sindirib chiqadi)
        accentColor: 0x00ffcc,
        groundColor: 0x333333,
        mapWidth: 8000,
        // Qiyinlik bosqichma-bosqich oshadi: devor, mina, jarlik -> 1-ayri yo'l ->
        // 1-yopiq yo'l -> jarliklar ketma-ketligi -> 2-ayri yo'l -> 2-yopiq yo'l ->
        // oxirgi jarlik ustidan sakrab, CHEKPOINT maydonchasiga aniq tushish.
        // Sakrash ~133px: har pog'ona <= 100px, jarliklar <= 150px
        platforms: [
            // Map-1 maydoni (aynan o'sha platformalar)
            { x: 100, y: 240, w: 220, h: 20 },
            { x: 680, y: 240, w: 240, h: 20 },
            { x: 380, y: 350, w: 180, h: 20 },
            { x: 680, y: 460, w: 240, h: 20 },
            { x: 1080, y: 460, w: 200, h: 20 },
            // 1-ayri yo'l: pog'ona + tepa yo'lak (ostida - tunnel)
            { x: 2450, y: 470, w: 90, h: 20 },
            walkway(2560, 900),
            // 1-yopiq yo'l
            { x: 3600, y: 470, w: 100, h: 20 },
            { x: 3730, y: 380, w: 90, h: 20 },
            // 2-ayri yo'l
            { x: 5050, y: 470, w: 90, h: 20 },
            walkway(5160, 1000),
            // 2-yopiq yo'l (uch pog'ona)
            { x: 6300, y: 470, w: 90, h: 20 },
            { x: 6420, y: 380, w: 80, h: 20 },
            { x: 6530, y: 300, w: 80, h: 20 },
            // CHEKPOINT maydonchasi (oxirgi jarlik ustida)
            { x: 7570, y: 500, w: 160, h: 20 }
        ],
        walls: [
            wall(1600, 70),
            wall(1950, 100),
            { x: 3850, y: 300, w: 60, h: 270 },  // 1-yopiq yo'l devori (tepasi 300)
            wall(4660, 70),
            { x: 6640, y: 270, w: 60, h: 300 },  // 2-yopiq yo'l devori (tepasi 270)
            wall(6900, 90),
            wall(7250, 70)
        ],
        forks: [fork(2560, 900), fork(5160, 1000)],
        pits: [
            { x: 2100, w: 100 },
            { x: 4450, w: 100 },
            { x: 4800, w: 100 },
            { x: 7420, w: 580 }  // Oxirgi jarlik - chekpointgacha sakrash kerak, o'tib ketsa ham tushadi
        ],
        crates: [
            crateOnGround(1150), crateOnGround(1450), crateOnGround(1850),
            crateOnGround(2750), crateOn(2900, WALKWAY_TOP),
            crateOnGround(4150),
            crateOn(5400, WALKWAY_TOP), crateOnGround(5600),
            crateOnGround(7000)
        ],
        // Minalar bir-biridan >= ~80px uzoqda (ustidan sakrab o'tsa bo'ladi), jarlik,
        // ayri yo'l yopqichlari va devorga yopishgan tor joylarga qo'yilmagan
        mines: [
            mineOn(1400, GROUND_TOP), mineOn(1750, GROUND_TOP), mineOn(2040, GROUND_TOP),
            mineOn(2300, GROUND_TOP), mineOn(2380, GROUND_TOP),
            // 1-ayri yo'l: tunnelda ham, tepa yo'lakda ham
            mineOn(2650, GROUND_TOP), mineOn(3000, GROUND_TOP), mineOn(3250, GROUND_TOP),
            mineOn(2800, WALKWAY_TOP), mineOn(3150, WALKWAY_TOP), mineOn(3300, WALKWAY_TOP),
            mineOn(3540, GROUND_TOP), mineOn(4050, GROUND_TOP),
            mineOn(4300, GROUND_TOP), mineOn(4980, GROUND_TOP),
            // 2-ayri yo'l
            mineOn(5450, GROUND_TOP), mineOn(5700, GROUND_TOP), mineOn(5800, GROUND_TOP),
            mineOn(5550, WALKWAY_TOP), mineOn(5900, WALKWAY_TOP), mineOn(6000, WALKWAY_TOP),
            mineOn(6250, GROUND_TOP),
            mineOn(7100, GROUND_TOP), mineOn(7340, GROUND_TOP)
        ],
        chase: {
            // O'yinchi 200 px/s yuradi - ilon oxirida 185 gacha tezlashadi
            snakeStartX: -450, snakeStartSpeed: 140, snakeEndSpeed: 185,
            snakeStopX: 7270, introWallX: 0,
            pad: { x: 7570, y: 500, w: 160, h: 20 }
        },
        // Map-1 dagi bilan bir xil (lobbidan to'g'ridan-to'g'ri boshlanganda)
        playerSpawns: [
            { x: 320, y: 500 }, { x: 400, y: 500 }, { x: 480, y: 500 }, { x: 560, y: 500 }
        ],
        botSpawnZone: { xStart: 0, xEnd: 0, y: 90 } // ishlatilmaydi - bu xaritada bot yo'q
    },
    {
        id: 2,
        name: "Mini game",
        description: "A sky-blue elf throws mega apples from a giant tree — catch 12 in your basket and don't bump into each other!",
        mode: 'apples',
        killsToWin: 0,
        accentColor: 0x81d4fa,
        groundColor: 0x4e7a2c,
        mapWidth: 800,
        // Bitta ekran: chapda kirish eshigi (qahramonlar chiqadi), o'rtada bahaybat
        // daraxt (elf tepasida), ikki tomonda tosh supachalar, o'ngda KATTA DEVOR + eshik
        platforms: [
            { x: 170, y: 490, w: 90, h: 20 },   // Tosh supachalar - baland olmalarga yetish uchun
            { x: 520, y: 490, w: 90, h: 20 },
            { x: 704, y: 0, w: 96, h: 570 }     // KATTA DEVOR (qattiq) - eshigi klientda chiziladi
        ],
        apples: {
            applesToCollect: 12,
            elfX: 421, elfY: 108,   // elfning otuvchi qo'li (klientdagi piksel elf bilan mos)
            throwIntervalMs: 1300,  // 1 o'yinchiga - har 1.3s (ko'p o'yinchi bo'lsa bo'linadi)
            targetMinX: 90, targetMaxX: 640,
            doorX: 40,
            bigWall: { x: 704, y: 0, w: 96, h: 570 }
        },
        // Eshik oldida (chapda) paydo bo'ladi
        playerSpawns: [
            { x: 70, y: 500 }, { x: 100, y: 500 }, { x: 130, y: 500 }, { x: 160, y: 500 }
        ],
        botSpawnZone: { xStart: 0, xEnd: 0, y: 90 } // ishlatilmaydi - bu xaritada bot yo'q
    },
    {
        id: 3,
        name: "Why are we here?",
        description: "The city market. Talk to the fishmonger elf — he knows something...",
        mode: 'story',
        killsToWin: 0,
        accentColor: 0xffb74d,
        groundColor: 0x5d5566,
        mapWidth: 1600, // Ikki ekran - kamera qahramon bilan suriladi
        // Chapda - map-3 dagi KATTA DEVORning orqa tomoni (eshigi ochiq turadi)
        // + osma taxtalar (rasta tomlari - klientda, rastalardan quriladi)
        platforms: [{ x: 0, y: 0, w: 96, h: 570 }, ...MARKET_4.planks],
        market: MARKET_4,
        story: {
            sellerX: 810,     // Baliq sotuvchi elf - bozorning o'rtasida
            talkRange: 110,   // Shu masofada E bosilsa - suhbat boshlanadi
            lineCount: 19,    // Suhbat qatorlari soni (klientdagi skript bilan bir xil)
            doorX: 40,
            buyerX: 300,      // Birinchi meva rastasi (eshik yonida) - My Farm hosilini sotib oladi
            buyRange: 80
        },
        // Katta devordagi eshikdan chiqishadi
        playerSpawns: [
            { x: 130, y: 500 }, { x: 160, y: 500 }, { x: 190, y: 500 }, { x: 220, y: 500 }
        ],
        botSpawnZone: { xStart: 0, xEnd: 0, y: 90 } // ishlatilmaydi - bu xaritada bot yo'q
    },
    {
        id: 4,
        name: "Just run 2 or end",
        description: "The giant robot snake smashed into the market. Shoot it until it dies!",
        mode: 'boss',
        killsToWin: 0,
        xpReward: 80,          // Season 1 boss: hammaga 2x (avval 40)
        bossCoins: 200,        // hammaga (avval faqat bitta o'yinchiga 100)
        accentColor: 0xff5252,
        groundColor: 0x5d5566,
        // "Cheksiz" bozor: rastalar va taxtalar ilon o'lguncha davom etadi. Boshidagi
        // 1600px - aynan map-4 (devor ilon bilan birga buziladi, shuning uchun qattiq emas)
        mapWidth: 40000,
        platforms: MARKET_5.planks,
        market: MARKET_5,
        boss: {
            baseHp: 2200,          // Kattaroq jon - yugurib-otib, bir necha daqiqalik jang
            hpPerExtraPlayer: 900,
            startX: -300,          // Devor ortida
            advanceSpeed: 90,      // px/s - to'xtamay izingizdan (o'yinchi 200 px/s)
            contactDamage: 25,     // Boshiga tegib ketsa (sekundiga bir marta)
            mineIntervalMs: 5000,  // Oldinga mina otish oralig'i (joni yarmidan kam qolsa - 2 tadan)
            stallCrashDamage: 5,   // Rastani ezganda o'zi ham ozgina zarar oladi
            ownMineDamage: 10,     // O'zi otgan minani bosib o'tsa - portlab, unga zarar
            fireIntervalMs: 6000,
            fireChargeMs: 900,
            fireDurationMs: 1600,
            fireRange: 520,
            fireSafeY: 370,        // Taxtada turgan qahramon (markazi ~306) - xavfsiz; rasta tomida (~426) - yonadi
            fireDps: 60
        },
        // Lobbidan to'g'ridan-to'g'ri boshlansa - devor ko'rinib turadigan joyda
        playerSpawns: [
            { x: 500, y: 500 }, { x: 560, y: 500 }, { x: 620, y: 500 }, { x: 680, y: 500 }
        ],
        botSpawnZone: { xStart: 0, xEnd: 0, y: 90 } // ishlatilmaydi - bu xaritada bot yo'q
    },
    {
        id: 5,
        name: "Bad dogs",
        description: "You left the castle for the forest. Evil robot dogs wait by the giant tree — shoot the red boxes!",
        mode: 'waves',
        killsToWin: 0,             // 0 = qahramonlar soni x botsPerPlayer
        accentColor: 0x76ff03,
        groundColor: 0x3e2a1c,
        mapWidth: 3800,            // daraxtdan keyin yana o'rmon yo'li, oxirida - g'or
        // BAHAYBAT DARAXT SHOXLARI (bir tomonlama): zinapoyadek - har biriga pastdagisidan
        // sakrab chiqiladi (qahramon ~133px, it ~158px sakraydi)
        platforms: [
            { x: 1470, y: 462, w: 170, h: 14 },   // chap pastki shox
            { x: 1880, y: 462, w: 170, h: 14 },   // o'ng pastki shox
            { x: 1560, y: 352, w: 150, h: 14 },   // chap o'rta shox
            { x: 1810, y: 352, w: 150, h: 14 },   // o'ng o'rta shox
            { x: 1400, y: 250, w: 130, h: 14 },   // chap uzun shox uchi
            { x: 2040, y: 250, w: 130, h: 14 },   // o'ng uzun shox uchi
            { x: 1660, y: 244, w: 200, h: 14 },   // toj ostidagi keng shox (tana ustida)
            // G'OR og'zining orqa devori (ko'rinmas, qattiq): kirgan qahramon og'iz ichida
            // qoladi, tosh tepalik ortiga o'tib ketmaydi
            { x: 3600, y: 0, w: 200, h: 570 }
        ],
        forest: {
            treeX: 1760,
            arenaTriggerX: 1150,
            caveX: 3500,
            botsPerPlayer: 2,
            dogHp: 120,
            redBox: {
                intervalMs: 4500,
                maxBoxes: 3,
                minX: 1300,
                maxX: 2250,
                blastRadius: 130,
                blastBotDamage: 100,
                blastPlayerDamage: 20
            }
        },
        // Qal'a darvozasidan chiqib kelishadi
        playerSpawns: [
            { x: 150, y: 500 }, { x: 190, y: 500 }, { x: 230, y: 500 }, { x: 270, y: 500 }
        ],
        // Itlar daraxt tojidan sakrab tushadi
        botSpawnZone: { xStart: 1560, xEnd: 1960, y: 90 }
    },
    {
        id: 6,
        name: "Walking stones",
        description: "Swaying stones over a bottomless pit in the cave — a stone collapses 1 second after you land on it!",
        mode: 'stones',
        killsToWin: 0,
        accentColor: 0x40c4ff,
        groundColor: 0x2a2838,
        mapWidth: STONES_7.width,
        platforms: [],
        // Boshidagi va oxiridagi qirg'oq orasi - butunlay tubsiz chuqurlik
        pits: [{ x: STONES_7.pitX, w: STONES_7.pitW }],
        stones: STONES_7.stones,
        playerSpawns: [
            { x: 70, y: 500 }, { x: 110, y: 500 }, { x: 150, y: 500 }, { x: 190, y: 500 }
        ],
        botSpawnZone: { xStart: 0, xEnd: 0, y: 90 } // ishlatilmaydi - bu xaritada bot yo'q
    },
    {
        id: 7,
        name: "Gorila Rock",
        description: "The lair of a giant stone gorilla: it roars, shoves, bursts rocks from the ground and smashes platforms into the ceiling!",
        mode: 'gorilla',
        killsToWin: 0,
        xpReward: 80,          // Season 1 boss: hammaga 2x (avval 40)
        bossCoins: 200,        // hammaga (avval faqat bitta o'yinchiga 100)
        accentColor: 0xffab40,
        groundColor: 0x3a3440,
        mapWidth: 800,
        platforms: [],            // platformalar - gorilla.platforms (harakatlanadi, server boshqaradi)
        gorilla: {
            baseHp: 2400,             // 1 kishi - 2400, keyin har o'yinchiga +1400: 2 kishi - 3800, 4 kishi - 6600
            hpPerExtraPlayer: 1400,
            startX: 400,
            halfW: 70,
            height: 130,
            walkSpeed: 80,
            nearRange: 180,
            idleMs: 650,           // hujumlar orasi (avval 1200)
            roarMs: 400,           // baqirish - ogohlantirish (avval 600)
            restMs: 1000,
            restChance: 0.35,
            pushDamage: 25,
            pushSpeed: 950,
            contactDamage: 15,
            contactSpeed: 1150,
            attackAnimMs: 320,
            spikeDamage: 35,
            spikeWarnMs: 550,
            rockDamage: 25,
            crushShakeMs: 1000,
            ceilingY: 44,
            // Chizma bo'yicha (image.png): chapda ikki qavat, o'rtada bitta, o'ngda ikki qavat.
            // Balandliklar - har biriga pastdagisidan sakrab chiqiladi (qahramon ~133px)
            platforms: [
                { x: 84, y: 232, w: 138, h: 14 },    // chap tepa
                { x: 507, y: 226, w: 164, h: 14 },   // o'ng tepa
                { x: 293, y: 340, w: 163, h: 14 },   // o'rta
                { x: 79, y: 452, w: 142, h: 14 },    // chap past
                { x: 541, y: 446, w: 171, h: 14 }    // o'ng past
            ]
        },
        // Chap pastdagi eshikdan kirib kelishadi
        playerSpawns: [
            { x: 50, y: 500 }, { x: 90, y: 500 }, { x: 130, y: 500 }, { x: 170, y: 500 }
        ],
        botSpawnZone: { xStart: 0, xEnd: 0, y: 90 } // ishlatilmaydi - bu xaritada bot yo'q
    },
    {
        id: 8,
        name: "Right on time",
        description: "You fell under the Gorilla's rocks. A Fat Elf is having lunch down here... and you're next on the menu!",
        mode: 'fatelf',
        killsToWin: 0,
        accentColor: 0x76ff03,
        groundColor: 0x2a2838,
        mapWidth: 1700,
        platforms: [
            // Chapda - gorilla bilan birga qulagan toshlar uyumi (qattiq; ostida gorillaning qo'li)
            { x: 0, y: 380, w: 150, h: 190 },
            // Kislotadan qochish uchun tosh tokchalar (bir tomonlama)
            { x: 640, y: 450, w: 150, h: 14 },
            { x: 880, y: 340, w: 170, h: 14 },
            { x: 1150, y: 450, w: 150, h: 14 }
        ],
        fatElf: {
            x: 980,
            victimX: 1090,
            halfW: 48,
            height: 112,
            baseHp: 600,              // Har o'yinchiga 600 jon (oddiy jang - boss emas)
            hpPerExtraPlayer: 600,
            talkRange: 140,
            walkSpeed: 55,
            contactDamage: 12,
            contactSpeed: 700,
            spitIntervalMs: 2600,
            spitChargeMs: 700,
            acidPerSpit: 3,
            acidDamagePct: 0.3,
            acidStaminaLockMs: 2000,
            doorX: 1580
        },
        // Toshlar uyumining yonida (o'ngida) - tepadan qulab tushgan joy
        playerSpawns: [
            { x: 200, y: 500 }, { x: 240, y: 500 }, { x: 280, y: 500 }, { x: 320, y: 500 }
        ],
        botSpawnZone: { xStart: 0, xEnd: 0, y: 90 } // ishlatilmaydi - bu xaritada bot yo'q
    },
    {
        id: 9,
        name: "UnderWorld",
        description: "Out of the cave and into the UnderWorld: glowing nature, tree houses and strange creatures. Watch out for the man-eating flower!",
        mode: 'underworld',
        killsToWin: 0,
        accentColor: 0xb388ff,
        groundColor: 0x1b3a2a,
        mapWidth: 2600,
        platforms: [],
        underworld: {
            caveExitX: 150,
            flowers: [{ x: 760 }],
            flowerWakeRange: 260,
            flowerBiteRange: 95,
            flowerBiteDamage: 22,
            flowerFreezeMs: 3500,
            cityX: 1150,
            trollX: 2000,
            talkRange: 140
        },
        // G'or og'zidan chiqib kelishadi
        playerSpawns: [
            { x: 70, y: 500 }, { x: 105, y: 500 }, { x: 140, y: 500 }, { x: 175, y: 500 }
        ],
        botSpawnZone: { xStart: 0, xEnd: 0, y: 90 } // ishlatilmaydi - bu xaritada bot yo'q
    },
    // ===================== SEASON 2 =====================
    {
        id: 10,
        name: "Giant Flower",
        description: "Deep in the UnderWorld the road is blocked by thorns. A giant flower guards it - only its head can be hurt!",
        season: 2,
        mode: 'gflower',
        killsToWin: 0,
        xpReward: 70,          // Season 2 boss
        bossCoins: 250,
        accentColor: 0xff4081,
        groundColor: 0x1b3a2a,
        mapWidth: 3000,
        // Pushti qo'ziqorin platformalar (bir tomonlama). Chapda 2 ta, o'ngda 3 ta (zinapoya)
        platforms: [
            { x: 2265, y: 340, w: 160, h: 12 },   // 0 chap tepa
            { x: 2335, y: 455, w: 150, h: 12 },   // 1 chap o'rta
            { x: 2685, y: 270, w: 145, h: 12 },   // 2 o'ng tepa (eng baland)
            { x: 2630, y: 370, w: 145, h: 12 },   // 3 o'ng o'rta
            { x: 2575, y: 470, w: 170, h: 12 }    // 4 o'ng past
        ],
        giantFlower: {
            // Shahardan uzoqda: shahar (daraxt-uylar) tugagach, tikonli yo'l, so'ng jang maydoni
            arenaX: 2200, arenaW: 800, triggerX: 2290,
            stemX: 2540, headY: 225, headR: 58,
            hpPerPlayer: 1600,
            topPlats: [0, 2],
            whipDamage: 18, whipEveryMs: 4200, whipGrowMs: 1100,
            thornDamage: 8, thornEveryMs: 5600, thornSpeed: 290,
            rootDamage: 20, rootEveryMs: 5200, rootWarnMs: 1000, rootUpMs: 650,
            biteDamage: 25, biteEveryMs: 3000, biteWindMs: 800, biteRange: 72, biteReach: 270,
            sproutEveryMs: 4400, sproutHp: 40, sproutMax: 4, sproutBiteDamage: 12
        },
        playerSpawns: [
            { x: 60, y: 500 }, { x: 95, y: 500 }, { x: 130, y: 500 }, { x: 165, y: 500 }
        ],
        botSpawnZone: { xStart: 0, xEnd: 0, y: 90 } // botlar (kichik gullar) yerdan chiqadi
    },
    {
        id: 11,
        name: "Mountain Lift",
        description: "A huge platform rises out of the road. Get everyone on it and ride up the mountain - red bots will attack on the way!",
        season: 2,
        mode: 'lift',
        killsToWin: 0,
        xpReward: 25,          // Season 2 oddiy xarita
        accentColor: 0x40c4ff,
        groundColor: 0x1b3a2a,
        mapWidth: 1300,
        platforms: [],
        lift: {
            x: 860, w: 300, triggerX: 560,
            readyY: 520, rideY: 380, liftOffMs: 2500, riseMs: 50000,
            botsTotal: 3, botHp: 330, firstBotMs: 2500, nextBotMs: 2000
        },
        playerSpawns: [
            { x: 60, y: 500 }, { x: 95, y: 500 }, { x: 130, y: 500 }, { x: 165, y: 500 }
        ],
        botSpawnZone: { xStart: 0, xEnd: 0, y: 60 } // botlar platforma ustiga tushadi
    },
    {
        id: 12,
        name: "Farm",
        description: "A quiet farm with strange vegetable beds. Just one carrot... what could go wrong?",
        season: 2,
        mode: 'farm',
        killsToWin: 0,
        xpReward: 25,
        accentColor: 0x8bc34a,
        groundColor: 0x3e2a1c,
        mapWidth: 2800,
        // Bir tomonlama: fermaning soyaboni (zanaveska), quduq (tosh halqa va tomi), itxona tomi
        platforms: [
            { x: 330, y: 468, w: 170, h: 12 },    // 0 ferma soyaboni
            { x: 2115, y: 530, w: 70, h: 12 },    // 1 quduq tosh halqasi
            { x: 2095, y: 440, w: 110, h: 12 },   // 2 quduq tomi
            { x: 2355, y: 496, w: 90, h: 12 }     // 3 itxona tomi
        ],
        farm: {
            carrotX: 1600, talkRange: 80,
            fieldX0: 650, fieldX1: 2520,
            killsPerPlayer: 15, aliveZombies: 3, zombieDamage: 12, zombieEmergeMs: 1300,
            kennelX: 2400, kennelRoof: 3, dogHp: 200, dogCooldownMs: 6000,
            noSpawn: [[2060, 2240], [2330, 2470]],
            rootPastCarrot: 250, rootMs: 2000, kennelRange: 70, tongueRange: 240, tongueDamage: 14
        },
        playerSpawns: [
            { x: 60, y: 500 }, { x: 95, y: 500 }, { x: 130, y: 500 }, { x: 165, y: 500 }
        ],
        botSpawnZone: { xStart: 0, xEnd: 0, y: 90 } // zombilar polizdan chiqadi
    },
    {
        id: 13,
        name: "Legendary Kraken",
        description: "A misty river with stepping platforms. The Legendary Kraken sleeps in the deep water - hit its red eye!",
        season: 2,
        mode: 'squid',
        killsToWin: 0,
        xpReward: 50,          // Season 2 boss
        bossCoins: 250,
        accentColor: 0x26c6da,
        groundColor: 0x2e3b2a,
        mapWidth: 2600,
        // Suv (daryo/ko'l) - yer yo'q, tushgan halok bo'ladi
        pits: [{ x: 600, w: 1800 }],
        platforms: [
            // Daryo ustidagi yo'l (10 m yurilgach boshlanadi, ~20 m sakrab o'tiladi)
            { x: 640, y: 520, w: 100, h: 12 },
            { x: 820, y: 490, w: 85, h: 12 },
            { x: 985, y: 460, w: 90, h: 12 },
            { x: 1150, y: 500, w: 85, h: 12 },
            { x: 1310, y: 470, w: 95, h: 12 },
            { x: 1480, y: 480, w: 100, h: 12 },
            // Jang maydoni: pastki, o'rta va eng tepa qatorlar
            { x: 1640, y: 470, w: 120, h: 12 },   // 6
            { x: 1880, y: 470, w: 110, h: 12 },   // 7
            { x: 2240, y: 470, w: 120, h: 12 },   // 8
            { x: 1720, y: 370, w: 110, h: 12 },   // 9
            { x: 2130, y: 370, w: 110, h: 12 },   // 10
            { x: 1800, y: 270, w: 100, h: 12 },   // 11
            { x: 2040, y: 270, w: 100, h: 12 }    // 12
        ],
        squid: {
            arenaX: 1600, arenaW: 800, triggerX: 1650, entryX: 1690, entryY: 446,
            baseX: 2000, xAmp: 150, eyeBaseY: 340, eyeAmpY: 90, eyeR: 34,
            hpPerPlayer: 1600,
            arenaPlats: [6, 7, 8, 9, 10, 11, 12], lowY: 470, topY: 270,
            slamDamage: 32, slamEveryMs: 4600, slamRaiseMs: 1000,
            geyserDamage: 28, geyserEveryMs: 6200, geyserWarnMs: 900, geyserUpMs: 1000,
            fishEveryMs: 7000, fishCount: 3, fishDamage: 24, fishRadius: 50
        },
        playerSpawns: [
            { x: 60, y: 500 }, { x: 95, y: 500 }, { x: 130, y: 500 }, { x: 165, y: 500 }
        ],
        botSpawnZone: { xStart: 0, xEnd: 0, y: 90 } // bu xaritada bot yo'q
    },
    {
        id: 14,
        name: "Yellow Door",
        description: "A yellow and a black door rise out of the road. Someone is screaming for help behind the yellow one...",
        season: 2,
        mode: 'doors',
        killsToWin: 0,
        xpReward: 25,
        accentColor: 0xffd600,
        groundColor: 0x2b2733,
        mapWidth: CAVE_RUN.roomX1,
        platforms: [
            // Tepaga chiqish (0-99): rasmdagi 10 platformali qavat bir joyda ustma-ust 10 marta - tepa-tepaga chiqiladi
            ...CLIMB_TOWER,
            // G'or yo'li: tosh ustunlar (100-...)
            ...CAVE_RUN.blocks
        ],
        pits: CAVE_RUN.floorHoles,
        doors: {
            doorLocked: true,
            triggerX: 560, yellowX: 700, blackX: 840,
            climbX0: 1000, climbX1: 1820, climbPlats: CLIMB_TOWER.map((_, i) => i), climbStartX: 1340, segments: CLIMB_STAGES, segMeters: 10, stageStep: CLIMB_STEP, stageRows: [[0, 1, 2, 3], [5, 6, 7, 8]],
            rockEveryMs: 700, rockWarnMs: 2000, rockDamagePct: 0.6,
            roomX0: 2200, roomX1: CAVE_RUN.roomX1, roomEntryX: 2260, elfX: 2620, elfY: 200, leverX: 2380, exitX: CAVE_RUN.exitX,
            runMeters: CAVE_RUN.runMeters, floorY: CAVE_RUN.floorY, floorHoles: CAVE_RUN.floorHoles, wallHoles: CAVE_RUN.wallHoles,
            holeHandEveryMs: 700, holeHandWarnMs: 650, holeHandUpMs: 850, holeHandReach: 52, holeHandGrabAtMs: 300, holeHandCdMs: 3600, holeDamage: 30, grabMs: 900,
            headWarnMs: 1100, headLungeMs: 350, headBackMs: 550, headCdMs: 6500, headGlobalMs: 2200, headTrigger: 280, headReach: 115,
            swallowMs: 1500, swallowDamagePct: 0.5, grabImmuneMs: 6000, huntMeters: 200, huntSpeed: 620,
            shroomHp: 60, shroomDamage: 20, shroomSpeed: 115, shroomEveryMs: 5000, shroomMax: 1, shroomRespawnMs: 3000,
            respectXp: 200
        },
        playerSpawns: [
            { x: 60, y: 500 }, { x: 95, y: 500 }, { x: 130, y: 500 }, { x: 165, y: 500 }
        ],
        botSpawnZone: { xStart: 0, xEnd: 0, y: 90 } // bu xaritada bot yo'q
    },
    {
        id: 15,
        name: "His Back",
        description: "The road goes on from the mountain top to a giant wooden path climbing into the sky. Someone you know is waiting at the top...",
        season: 2,
        mode: 'back',
        killsToWin: 0,
        xpReward: 25,
        accentColor: 0xffab40,
        groundColor: 0x3b3046,
        mapWidth: BACK_TOWER.X1,
        platforms: [
            // 0: minoraning chap devori - pastda kirish joyi ochiq (yo'ldan kiriladi). Qiyalik/maydonchalar - klientda (qiya fizika)
            { x: BACK_TOWER.X0 - 30, y: BACK_TOWER.topY - 400, w: 30, h: (BACK_TOWER.groundY - 110) - (BACK_TOWER.topY - 400) }
        ],
        back: {
            towerX0: BACK_TOWER.X0, towerX1: BACK_TOWER.X1, groundY: BACK_TOWER.groundY, topY: BACK_TOWER.topY, climbMeters: 130,
            ramps: BACK_TOWER.ramps, ledges: BACK_TOWER.ledges, ledgeChance: 0.35, gorillaX: BACK_TOWER.X1 - 150,
            barrelEveryMs: 1500, barrelSpeed: 170, barrelR: 18, barrelDamage: 20, barrelMax: 8, barrelAhead: 2
        },
        playerSpawns: [
            { x: 60, y: 500 }, { x: 95, y: 500 }, { x: 130, y: 500 }, { x: 165, y: 500 }
        ],
        botSpawnZone: { xStart: 0, xEnd: 0, y: 90 } // bu xaritada bot yo'q
    },
    {
        id: 16,
        name: "Hot Potato",
        description: "A wooden house hanging between two cliffs. Gorila Rock can't be hurt anymore - blow up the INFINITY TNT and run to the cliffs!",
        season: 2,
        mode: 'tnt',
        killsToWin: 0,
        xpReward: 70,
        bossCoins: 250,
        accentColor: 0xff7043,
        groundColor: 0x3b3046,
        mapWidth: 1400,    // ekranga sig'maydi - kamera qahramon ortidan yuradi
        // Pastda yer yo'q - bino jarlik ustida osilib turibdi
        pits: [{ x: 0, w: 1400 }],
        platforms: [
            { x: 100, y: 530, w: 1200, h: 14 },  // 0: pol
            { x: 0, y: 330, w: 100, h: 270 },    // 1: chap qoya (xavfsiz)
            { x: 1300, y: 330, w: 100, h: 270 }, // 2: o'ng qoya (xavfsiz)
            { x: 104, y: 476, w: 40, h: 12 },    // 3: chap kursi
            { x: 1256, y: 476, w: 40, h: 12 },   // 4: o'ng kursi
            { x: 150, y: 430, w: 200, h: 12 },   // 5: chap minora - o'rta qavat (qoya tomonga keng - tez qochish)
            { x: 1050, y: 430, w: 200, h: 12 },  // 6: o'ng minora - o'rta qavat
            { x: 630, y: 340, w: 140, h: 12 },   // 7: markaziy ark
            { x: 180, y: 250, w: 140, h: 12 },   // 8: chap minora tomi
            { x: 1080, y: 250, w: 140, h: 12 },  // 9: o'ng minora tomi
            { x: 664, y: 458, w: 72, h: 72 },    // 10: INFINITY TNT (ustiga chiqish mumkin)
            { x: 430, y: 440, w: 150, h: 12 },   // 11: chap ayvon (o'rta qavat)
            { x: 820, y: 440, w: 150, h: 12 }    // 12: o'ng ayvon
        ],
        tnt: {
            floor: 0, building: [0, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], surfaces: [0, 5, 6, 7, 8, 9, 11, 12],
            cliffY: 330, leftCliffX: 100, rightCliffX: 1300, box: { x: 664, y: 458, w: 72, h: 72 },
            hp: 1600, hpPerExtraPlayer: 800, fuseMs: 5500, introMs: 2500,   // bino keng - qoyaga qochishga 5.5 s
            gorHalfW: 62, gorH: 130, gorSpeed: 150, gorStartX: 1000,
            bombDamage: 22, bombRadius: 70, skyBombs: 5, skyDamage: 25, skyRadius: 60, skyWarnMs: 1100,
            slamDamage: 25, slamRange: 110, contactDamage: 25, contactSpeed: 1150,
            clapDamage: 30, clapWarnMs: 650, clapSpeed: 650, restMs: 1200
        },
        playerSpawns: [
            { x: 170, y: 500 }, { x: 210, y: 500 }, { x: 250, y: 500 }, { x: 290, y: 500 }
        ],
        botSpawnZone: { xStart: 0, xEnd: 0, y: 90 } // bu xaritada bot yo'q
    },
    {
        id: 17,
        name: "Iron Giant",
        description: "A road through the meadow leads to a giant robot. Only its head can be hurt - jump on the floating platforms!",
        season: 2,
        mode: 'robot',
        killsToWin: 0,
        xpReward: 70,
        bossCoins: 250,
        accentColor: 0x4fc3f7,
        groundColor: 0x5d4037,
        mapWidth: AX_ROBOT + 800,
        platforms: [
            // Suzuvchi platformalar (rasmdagidek: chapda uchta)
            { x: AX_ROBOT + 80, y: 214, w: 120, h: 12 },    // 0: eng tepa
            { x: AX_ROBOT + 252, y: 338, w: 132, h: 12 },   // 1: o'rta
            { x: AX_ROBOT + 90, y: 448, w: 115, h: 12 },    // 2: pastki
            // 3: robot tanasi - devor (orqasiga o'tib bo'lmaydi)
            { x: AX_ROBOT + 684, y: 0, w: 116, h: 570 },
            // 4: robotning pastki qo'li - ustida turish mumkin (boshning yonida: qilichli qahramonlar ham yeta oladi)
            { x: AX_ROBOT + 628, y: 376, w: 126, h: 12 }
        ],
        robot: {
            arenaX: AX_ROBOT, triggerX: AX_ROBOT + 60,
            head: { x: AX_ROBOT + 580, y: 172, w: 84, h: 190 }, eyeY: 232,
            shoulder: { x: AX_ROBOT + 770, y: 459 }, fistRest: { x: AX_ROBOT + 620, y: 458 },
            hpPerPlayer: 1600, introMs: 2200,
            smashWarnMs: 800, smashDamage: 25, smashW: 80,
            comboWarnMs: 450, comboDamage: 20,
            laserWarnMs: 900, laserFireMs: 500, laserDamage: 30,
            botHp: 160, restMs: 1100, dyingMs: 3200,
            boltCount: 5, boltEveryMs: 380, boltSpeed: 650, boltDamage: 12
        },
        playerSpawns: [
            { x: 60, y: 500 }, { x: 95, y: 500 }, { x: 130, y: 500 }, { x: 165, y: 500 }
        ],
        botSpawnZone: { xStart: AX_ROBOT + 300, xEnd: AX_ROBOT + 500, y: 90 }
    },
    {
        id: 18,
        name: "Road to Skyland",
        description: "A shop and a jetpack vending machine stand before a deep chasm. Buy a jetpack and fly to Skyland - and don't hurt the machine!",
        season: 2,
        mode: 'vend',
        killsToWin: 0,
        xpReward: 70,
        accentColor: 0x80d8ff,
        groundColor: 0x5d4037,
        mapWidth: 2600,
        platforms: [
            // Suzuvchi platformalar (jangda qochish uchun)
            { x: 1240, y: 440, w: 140, h: 12 },
            { x: 1500, y: 340, w: 140, h: 12 },
            { x: 1770, y: 440, w: 140, h: 12 },
            { x: 1620, y: 220, w: 120, h: 12 },
            // Jarlik cheti - ranetssiz o'tib bo'lmaydi
            { x: 2200, y: 0, w: 30, h: 570 }
        ],
        pits: [{ x: 2230, w: 370 }],   // jarlik (yer yo'q - Skyland'gacha bo'shliq)
        shop: { counterX: 600, range: 110, prices: { elixir: 50, chip: 50 } },
        vend: {
            machineX: 960, w: 110, h: 170, legH: 64,
            price: 1000, buyRange: 95,
            edgeX: 2200, x0: 320, x1: 2140,
            hp: 1600,
            transformMs: 1600, dyingMs: 2200, flyMs: 1600,
            walkSpeed: 150,
            contactDamage: 20, contactSpeed: 600,
            flameWarnMs: 550, flameMs: 1400, flameLen: 270, flameH: 80, flameDamage: 14, flameEveryMs: 250,
            jumpMs: 1300, jumpPeak: 300, jumpTrackSpeed: 480, landDamage: 40, landSpeed: 700, jumpLockAt: 0.45,
            vulnMs: 1300, restMs: 700
        },
        playerSpawns: [
            { x: 60, y: 500 }, { x: 95, y: 500 }, { x: 130, y: 500 }, { x: 165, y: 500 }
        ],
        botSpawnZone: { xStart: 0, xEnd: 0, y: 90 }
    },
    {
        id: 19,
        name: "Sky Battle",
        description: "Fly with a jetpack above the clouds: dodge the shots of the flying bot cars and the lightning, shoot them down - and beat the Sky Fortress!",
        season: 2,
        mode: 'sky',
        killsToWin: 0,
        xpReward: 90,
        bossCoins: 250,
        accentColor: 0x4fc3f7,
        groundColor: 0x90caf9,
        mapWidth: 3200,
        platforms: [],
        pits: [{ x: 0, w: 3200 }],     // yer yo'q - osmon
        sky: {
            top: 80, bottom: 520,
            introMs: 2500, waves: 3, waveGapMs: 2200,
            enemyHp: 120, enemyHpPerWave: 40, enemySpeed: 170, enemyW: 76, enemyH: 44,
            enemyShotEveryMs: 1900, enemyShotSpeed: 380, enemyShotDamage: 25,
            strikeEveryMs: 5200, strikeWarnMs: 1000, strikeMs: 320, strikeW: 56, strikeDamage: 22,
            bossHpPerPlayer: 1500, bossW: 300, bossH: 140, bossSpeed: 120,
            bossRestMs: 900, bossShotSpeed: 360, bossShotDamage: 12, bossDyingMs: 2600
        },
        playerSpawns: [
            { x: 120, y: 260 }, { x: 160, y: 320 }, { x: 200, y: 260 }, { x: 240, y: 320 }
        ],
        botSpawnZone: { xStart: 0, xEnd: 0, y: 90 }
    }
];

// ARENA (BONUS): Gorila Rock zalida; bosslar - mavsum xaritalaridagi gorilla va semiz elf
// (ular arenada yer ostidan emas, chaqirilganda paydo bo'ladi)
MAPS.push({
    id: MAPS.length,
    name: "Arena",
    description: "Endless training: bots keep coming. Every kill gives coins and XP, every 5 kills a random boss appears!",
    mode: 'arena',
    bonus: true,
    killsToWin: 0,
    accentColor: 0xff5252,
    groundColor: 0x3a3440,
    mapWidth: 800,
    platforms: [],
    gorilla: MAPS.find(m => m.gorilla)!.gorilla,
    fatElf: { ...MAPS.find(m => m.fatElf)!.fatElf!, x: 600, doorX: 780 },
    arena: { killsPerBoss: 5, botCoins: 50, botXp: 15, bossCoins: 250, bossXp: 100, spawnIntervalMs: 1400, maxBots: 4,
        // Robot ilon: boshi chap eshikdan chiqadi (startX - to'xtaydigan joyi), oldinga yurmaydi
        snake: { ...MAPS.find(m => m.boss)!.boss!, baseHp: 900, hpPerExtraPlayer: 600, startX: 150, advanceSpeed: 160,
            contactDamage: 20, mineIntervalMs: 2600, fireIntervalMs: 6500, fireRange: 460, fireSafeY: 400 } },
    playerSpawns: [
        { x: 50, y: 500 }, { x: 90, y: 500 }, { x: 130, y: 500 }, { x: 170, y: 500 }
    ],
    botSpawnZone: { xStart: 260, xEnd: 740, y: 90 }
});

// DO'KON (BONUS): o'rtacha kattalikdagi do'kon - Eliksir (kislotadan keyin jon tiklanishini qaytaradi) va
// Chip (chaqmoqdan keyin stamina tez to'lishini qaytaradi). Jang yo'q, doim ochiq
MAPS.push({
    id: MAPS.length,
    name: "Shop",
    description: "A small shop. Buy an Elixir (brings back HP regeneration after acid) or a Chip (brings back fast stamina after lightning).",
    mode: 'shop',
    bonus: true,
    killsToWin: 0,
    accentColor: 0xffca28,
    groundColor: 0x5d4037,
    mapWidth: 800,
    platforms: [],
    shop: { counterX: 470, range: 110, prices: { elixir: 50, chip: 50, rod: 100, net: 300, fert: 25, water: 150,
        decor_flowers: 80, decor_lantern: 120, decor_paint: 150, decor_dog: 250,
        ...Object.fromEntries(HOME_ITEMS.map(h => ['home_' + h.id, h.price])) } },
    playerSpawns: [
        { x: 90, y: 500 }, { x: 130, y: 500 }, { x: 170, y: 500 }, { x: 210, y: 500 }
    ],
    botSpawnZone: { xStart: 0, xEnd: 0, y: 90 }
});

// BONUS "NO MORE FRIENDS": kichik maydon (qadimiy arena), simmetrik platformalar - PvP
MAPS.push({
    id: MAPS.length,
    name: "No More Friends",
    description: "Every hero for himself! Fight the other players - the first to 5 kills wins.",
    mode: 'pvp',
    bonus: true,
    killsToWin: 0,
    xpReward: 30,
    accentColor: 0xff5252,
    groundColor: 0x6d5a45,
    mapWidth: 1200,
    platforms: [
        { x: 140, y: 440, w: 190, h: 12 }, { x: 870, y: 440, w: 190, h: 12 },
        { x: 470, y: 350, w: 260, h: 12 },
        { x: 110, y: 255, w: 160, h: 12 }, { x: 930, y: 255, w: 160, h: 12 },
        { x: 520, y: 170, w: 160, h: 12 }
    ],
    pvp: { killsToWin: 5, respawnMs: 3000, spawnShieldMs: 1500, shieldBlock: 0.75 },
    playerSpawns: [
        { x: 90, y: 500 }, { x: 1110, y: 500 }, { x: 235, y: 380 }, { x: 965, y: 380 }
    ],
    botSpawnZone: { xStart: 0, xEnd: 0, y: 90 }
});

// Baxaybat daraxt shoxlari (x - chap cheti): chapdan va o'ngdan zinapoyadek, tepada - toj. Sakrash ~130px
const GIANT_TREE_PLATS: PlatformDef[] = (() => {
    const T = 4380, left = [[4010, 470, 130], [4180, 390, 120], [4020, 310, 120], [4180, 230, 120], [4040, 150, 120]];
    const out: PlatformDef[] = [];
    left.forEach(([x, y, w]) => { out.push({ x, y, w, h: 12 }); out.push({ x: T + (T - (x + w)), y, w, h: 12 }); });
    out.push({ x: T - 70, y: 100, w: 140, h: 12 });
    return out;
})();

// BONUS "MY FARM": tinch ferma - har o'yinchiga o'z maydoni (6 grядka). Jang yo'q, doim ochiq
MAPS.push({
    id: MAPS.length,
    name: "My Farm",
    description: "The host's farm! Plant crops, let them grow (rain makes them grow twice as fast), fish in the river and sell everything at the S1 city market.",
    mode: 'myfarm',
    bonus: true,
    killsToWin: 0,
    accentColor: 0x8bc34a,
    groundColor: 0x6d4c41,
    mapWidth: 5460,
    platforms: GIANT_TREE_PLATS,
    myFarm: { zoneX0: 630, zoneW: 460, plotX0: 30, plotW: 48, plotGap: 24, range: 32, zonePrice: 250,
        zonePrices: [0, 250, 250, 250, 400, 600], zoneLevels: [0, 0, 0, 0, 3, 6], waterPrice: 10,
        riverX0: 4860, dockX1: 5120, dockPrice: 200, netCooldownMs: 30000, toolUses: 20, waterBoost: 0.5, goldenChance: 0.15,
        orchardX: [3450, 3545, 3640, 3735, 3830, 3925], fruitTrees: FRUIT_TREES, houseX: 150, homeItems: HOME_ITEMS, homeSlots: HOME_SLOTS, chestCap: CHEST_CAP,
        raids: { everyMs: Number(process.env.FARM_RAID_MS) || 5 * 60000, jitterMs: process.env.FARM_RAID_MS ? 0 : 40000, firstMs: Number(process.env.FARM_RAID_MS) || 5 * 60000,
            slime: { hp: 420, hpPerPlayer: 160, dmg: 18, coins: 40, hopMs: 1150, hopDist: 140, hopH: 70, splits: 3 },
            slimelet: { hp: 55, dmg: 8, coins: 8, hopMs: 700, hopDist: 90, hopH: 40 },
            zveg: { n: 5, hp: 75, speed: 60, dmg: 8, coins: 10 }, shrooms: 4 },
        boardX: 575, decor: FARM_DECOR, maxLevel: FARM_MAX_LEVEL,
        tree: { x: 4380, price: 400, needApples: 100, regrowMs: 20000, appleSell: 20,
            spots: GIANT_TREE_PLATS.map(p => ({ x: p.x + p.w / 2, y: p.y - 22 })),
            mouth: { x: 4330, y: 405, w: 100, h: 90 }, arenaX0: 3980, arenaX1: 4780,
            bossHp: 2400, bossHpPerPlayer: 1200, rootDamage: 25, appleDamage: 15, pillarDamage: 30, rewardCoins: 250, rewardXp: 100 },
        shrooms: { absentMs: 15 * 3600000, count: 5, hp: 80, eatMs: 90000, sporeRange: 90, sporeDamage: 12, sporeEveryMs: 2500, killCoins: 15 },
        crops: CROPS, fish: FISH,
        rain: { slotMs: 8 * 60000, offsetMs: 60000, durMs: 150000, every: 2 } },
    playerSpawns: [
        { x: 160, y: 500 }, { x: 190, y: 500 }, { x: 220, y: 500 }, { x: 130, y: 500 }
    ],
    botSpawnZone: { xStart: 0, xEnd: 0, y: 90 }
});

// Mavsum xaritalari soni (bonus xaritalarsiz) - ochilish ketma-ketligi shular bo'yicha
export const SEASON_MAP_COUNT = MAPS.filter(m => !m.bonus).length;

export function getMapById(id: number): MapDef {
    return MAPS[id] || MAPS[0];
}

// Berilgan xaritada, o'yinchilar soniga teng miqdorda bot uchun boshlang'ich
// joylarni (zonaga tekis taqsimlab) generatsiya qiladi - TEPADAN "tushadilar"
export function generateBotSpawns(map: MapDef, botCount: number): PointDef[] {
    if (botCount <= 0) return [];
    const { xStart, xEnd, y } = map.botSpawnZone;
    if (botCount === 1) return [{ x: (xStart + xEnd) / 2, y }];

    const spawns: PointDef[] = [];
    const step = (xEnd - xStart) / (botCount - 1);
    for (let i = 0; i < botCount; i++) {
        spawns.push({ x: xStart + step * i, y });
    }
    return spawns;
}
