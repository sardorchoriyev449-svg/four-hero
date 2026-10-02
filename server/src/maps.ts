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

function buildStonesLayout(): { stones: StonesDef, width: number, pitX: number, pitW: number } {
    const widths = [120, 110, 100, 110, 96, 104, 92, 100, 96, 112];
    const bases = [482, 440, 470, 410, 446, 392, 432, 384, 440, 404];
    const gaps = [80, 88, 84, 96, 90, 100, 92, 96, 100, 84];
    const stones: StoneDef[] = [];
    let left = 250 + gaps[0];
    for (let i = 0; i < 10; i++) {
        stones.push({ x: left + widths[i] / 2, w: widths[i], baseY: bases[i], amp: 16, periodMs: 2400 + (i % 3) * 400, phase: i * 1.3 });
        left += widths[i] + (gaps[i + 1] || 90);
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
    mode: 'waves' | 'chase' | 'apples' | 'story' | 'boss' | 'stones' | 'gorilla' | 'fatelf' | 'underworld' | 'arena' | 'gflower' | 'lift' | 'farm' | 'squid';
    killsToWin: number;      // 'waves': xaritadagi botlarning umumiy soni (0 = o'yinchilar soni)
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
            doorX: 40
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
        xpReward: 40,
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
        xpReward: 40,
        accentColor: 0xffab40,
        groundColor: 0x3a3440,
        mapWidth: 800,
        platforms: [],            // platformalar - gorilla.platforms (harakatlanadi, server boshqaradi)
        gorilla: {
            baseHp: 1400,             // Har o'yinchiga 1400 jon: 1 kishi - 1400, 2 kishi - 2800, 4 kishi - 5600
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
    arena: { killsPerBoss: 5, botCoins: 10, botXp: 5, bossCoins: 100, bossXp: 50, spawnIntervalMs: 1400, maxBots: 4,
        // Robot ilon: boshi chap eshikdan chiqadi (startX - to'xtaydigan joyi), oldinga yurmaydi
        snake: { ...MAPS.find(m => m.boss)!.boss!, baseHp: 900, hpPerExtraPlayer: 600, startX: 150, advanceSpeed: 160,
            contactDamage: 20, mineIntervalMs: 2600, fireIntervalMs: 6500, fireRange: 460, fireSafeY: 400 } },
    playerSpawns: [
        { x: 50, y: 500 }, { x: 90, y: 500 }, { x: 130, y: 500 }, { x: 170, y: 500 }
    ],
    botSpawnZone: { xStart: 260, xEnd: 740, y: 90 }
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
