export interface PlayerState {
    id: string;
    x: number;
    y: number;
    characterType: string;
    color: number;
    hp: number;
    isInvisible: boolean;
    speedMultiplier: number;
    stamina: number;              // 0-100: hujum va qobiliyat uchun sarflanadigan energiya
    attackCooldown: number;       // Hujumlar orasidagi eng qisqa vaqt (spam qilishning oldini oladi)
    staminaRegenDelay: number;    // Ushlab turish tugagach, tiklanish boshlanguncha kutish (tikda)
    isHoldingAbility: boolean;    // Barcha personajlar uchun: SHIFT bosib turilganda true
    isHoldingAttack: boolean;     // Barcha personajlar uchun: ENTER/sichqoncha bosib turilganda true
    lastAttackAngle: number;      // ENTER ushlab turilganda avtomatik otish uchun saqlangan burchak
    userId: string | null;         // Ro'yxatdan o'tgan foydalanuvchining MongoDB'dagi ID'si (mehmon bo'lsa null)
    clientId: string | null;       // Brauzer oynasining doimiy ID'si - sahifa yangilansa, shu orqali o'z o'rnini qaytarib oladi
    apples?: number;               // Elf qishlog'i: savatchadagi olmalar soni
    appleImmunity?: number;        // Olma sochilgandan keyin qisqa vaqt (tik) qayta sochilmaydi
    introDone?: boolean;           // Elf bilan tanishuv dialogini oxirigacha o'qidimi
    snakeHitCd?: number;           // Robot-ilonga tegib zarar olgach, qayta zarar olguncha tiklar
    acidTicks?: number;            // Kislota tekkan: shuncha tik stamina tiklanmaydi
    lastNoStaminaAt?: number;      // "Zaryad yo'q" (bo'sh batareya) belgisi oxirgi marta yuborilgan vaqt (ms)
    nickname: string;             // Ekranda ko'rinadigan ism
    kills: number;                // G'alabani aniqlash uchun: nechta bot o'ldirgani
    skinId: string;               // Joriy personaj uchun kiyilgan skin
    equippedSkins: { [characterType: string]: string }; // Har personaj uchun kiyilgan skin keshi
    weaponColor: number;           // Joriy personaj uchun kiyilgan QUROL skinining rangi (tana skinidan alohida)
    equippedWeaponSkins: { [characterType: string]: string }; // Har personaj uchun kiyilgan qurol skin keshi
    equippedCosmetics?: { [characterType: string]: { [slot: string]: string } }; // Kiyilgan detallar keshi
    maxHp?: number;                // Maksimal jon (100 + "hp" kuchaytirishi) - perks.ts: maxHpOf
    look?: string;                 // Joriy personajning detallari qisqa satrda (cosmetics.ts: lookString)
    isDead: boolean;               // O'lgan bo'lsa true - "arvoh" holatida, harakat/hujum qila olmaydi
    respawnTimer: number;         // Qayta tug'ilishga qolgan tik (0 bo'lganda qayta tiriladi)
    isReady: boolean;             // Lobbida "Tayyor" tugmasini bosganmi
    damageLevel: number;          // Joriy personaj turi uchun "damage" yaxshilanish darajasi (0-5)
    staminaLevel: number;         // Joriy personaj turi uchun "stamina" yaxshilanish darajasi (0-5)
    accountUpgrades: { [characterType: string]: { damage: number, stamina: number, [weaponStat: string]: number } };
    unlockedLevel: number;         // HISOB progressi: ochilgan eng yuqori xarita (mehmonda - shu seans uchun)
    xp: number;                    // umumiy tajriba (hisob bo'yicha)
    charXp: { [characterType: string]: number }; // HAR PERSONAJ tajribasi - daraja va imkoniyatlar shundan
    level: number;                 // joriy personajning darajasi (charXp dan)
    maxStamina: number;            // 100 + daraja "stamina +5" lari
    weaponMode: 'main' | 'alt';    // Q: ikkinchi qurol (mage muz, knight drobovik, samurai kunai)
    specialTicks: number;          // R qobiliyati (mage davolash / knight uchish) qolgan vaqti
    specialCooldown: number;       // R qayta tayyor bo'lguncha
    invisLinger: number;           // archer: SHIFT qo'yib yuborilgach yana ko'rinmas qoladigan vaqt
    ammo?: number;                 // knight drobovigi: magazindagi o'qlar
    reloadTicks?: number;          // drobovik qayta o'qlanmoqda (qolgan tik)
    lastEmoteAt?: number;          // emotsiya spamiga qarshi (ms) // Hisobdagi BARCHA personajlar uchun yaxshilanishlar keshi (personaj almashtirilganda shu yerdan olinadi)
}

export interface BotState {
    elite?: boolean;               // Arena: "Robot otryadi" bossining kuchli roboti
    skin?: 'sprout';               // Gigant gul xaritasi: kichkina gul (it AI'si bilan, o'z rasmi)
    emerge?: number;               // yerdan sug'urilib chiqish (tik) - shu vaqtda harakatlanmaydi
    id: string;
    x: number;
    y: number;
    color: number;
    hp: number;
    maxHp: number;                 // HP satrini (progress bar) to'g'ri chizish uchun
    freezeDuration: number;
    targetPlayerId: string | null; // Bot "o'zi uchun" tanlagan raqib - shuni ta'qib qiladi
    isBlocking: boolean;           // Vaqti-vaqti bilan qalqon ko'tarib himoyalanadi (shu payt zarar yemaydi)
    blockTimer: number;            // Qalqon holati necha tik davom etishini/yo'qligini boshqaradi
    isAttacking: boolean;          // Klientga qilich zarbasi animatsiyasini ko'rsatish uchun (qisqa muddatli belgi)
    attackAnimTimer: number;
    facingLeft: boolean;           // Qaysi tomonga qarab turganini (qilich/qalqon yo'nalishi uchun)
    vy: number;                    // Vertikal tezlik (px/s) - sakrash va tushish uchun
    attackCooldown: number;        // Keyingi zarbagacha qolgan tik
    windupTimer: number;           // >0 bo'lsa - qilich ko'tarilgan, 0 ga yetganda zarba tushadi
    jumpTargetX: number | null;    // Havodayken qaysi X tomon harakatlanadi (sakrash paytida belgilanadi)
    jumpReacted: boolean;          // O'yinchining joriy sakrashiga allaqachon "javob" berganmi (bir sakrashga bir marta)
    isJetting: boolean;            // Tagidan ko'k olov chiqib, tepaga uchib ketayapti (klient olovni chizadi)
    jetGoalY: number | null;       // Uchish shu balandlikkacha (maqsad platformadan biroz yuqori)
    jetTimer: number;              // Uchish necha tik davom etdi (tiqilib qolsa to'xtatish uchun)
    kind?: 'robot' | 'dog';        // 'dog' - robot it (o'rmon): tezroq, qalqonsiz, uchmaydi, tishlaydi
    slowTicks?: number;            // It tishlagach shuncha tik sekin yuradi (qahramon unga tegib ulguradi)
}

// YURUVCHI TOSH: y - tepa qirrasi; idle (tebranadi) -> shake (ustiga tushildi) -> fall -> gone -> idle
export interface StoneState {
    id: string;
    x: number;
    y: number;
    w: number;
    state: 'idle' | 'shake' | 'fall' | 'gone';
    timer: number;
    vy: number;
}

// TOSH GORILLA holati (map-8)
export interface GorillaState {
    hp: number;
    maxHp: number;
    x: number;
    facingLeft: boolean;
    // intro - jang oldidan suhbat; defeat - yutqazdi (so'nggi gapi); smash - yerni urib sindiradi;
    // fall - pol qulab, hamma yer ostiga tushadi (keyin xarita o'tiladi)
    state: 'intro' | 'idle' | 'roar' | 'push' | 'slam' | 'rest' | 'defeat' | 'smash' | 'fall';
    timer: number;
    attack: 'push' | 'spike' | 'rocks' | 'crush' | null;
    crushPlat: number;          // crush: qaysi platforma (indeks), -1 - yo'q
    hitFlash: number;
    lastHitBy: string | null;
}
// SEMIZ ELF (map-9): eating - boshqa elfni yeyapti (qahramonlarni kutadi); talk - suhbat;
// idle - eng yaqin qahramon tomon yuradi; charge - og'zi yashil cho'g'lanadi; spit - kislota sepadi;
// down - yengildi (o'ngdagi eshik ochiladi)
export interface FatElfState {
    hp: number;
    maxHp: number;
    x: number;
    facingLeft: boolean;
    state: 'eating' | 'talk' | 'idle' | 'charge' | 'spit' | 'down';
    timer: number;
    targetId: string | null;    // kislota kimga qarab sepiladi
    grace?: number;             // suhbatdan keyin jang boshlanishidagi tanaffus (tik) - darhol urmasin
    hitFlash: number;
    lastHitBy: string | null;
}
// OG'ZIBOR GUL (map-10): hidden - yer ostida; emerge - chiqyapti; idle - chayqaladi; bite - tishlayapti;
// frozen - muz shari tekkan (qotib qolgan); dead - o'ldirildi
export interface FlowerState {
    id: string;
    x: number;
    state: 'hidden' | 'emerge' | 'idle' | 'bite' | 'frozen' | 'dead';
    timer: number;
    cooldown: number;
    bitten: boolean;
}
// Kislota tomchisi: yoy bo'ylab uchadi, qahramonga tegsa - jonining 30% i va 2s staminasiz
export interface AcidState {
    id: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
}
// Gorilla harakatlantiradigan platforma: idle -> shake -> launch (shiftga) -> hold -> back
export interface GPlatState {
    id: string;
    x: number;
    y: number;       // tepa qirrasi
    w: number;
    state: 'idle' | 'shake' | 'launch' | 'hold' | 'back';
    timer: number;
    riders: string[];   // shiftga otilganda ustida turganlar - shiftga URILGANDA ezilib halok bo'ladi
}
// Yerdan otilib chiqadigan tosh: warn (yer yoriladi) -> up (tosh chiqadi)
export interface GSpikeState {
    id: string;
    x: number;
    phase: 'warn' | 'up';
    timer: number;
}
// Tepadan tushadigan tosh (delay - shiftdan chang to'kiladi, keyin tushadi)
export interface GRockState {
    id: string;
    x: number;
    y: number;
    vy: number;
    delay: number;
}

// O'rmondagi QIZIL QUTI: tepadan tushadi, o'q/zarba tegsa portlaydi
export interface RedBoxState {
    id: string;
    x: number;
    y: number;       // markazi
    vy: number;
    landed: boolean;
}

export interface BulletState {
    id: string;
    playerId: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
    color: number;
    lifetime: number;
    bulletType: 'normal' | 'arrow' | 'fireball' | 'melee' | 'ice' | 'pellet' | 'kunai';
    justSpawned: boolean; // Birinchi tikda to'qnashuv tekshirilmaydi - klient ko'rish uchun ulgurishi kerak
    sx?: number;          // oxirgi tekshirilgan joy - shu yerdan hozirgi joygacha butun yo'l tekshiriladi
    sy?: number;
}

// Sindiriladigan quti: markaz (x, y), sindirilsa sindirgan o'yinchiga tanga beradi
export interface CrateState {
    id: string;
    x: number;
    y: number;
    hp: number;
}

// Quti sinsa chiqadigan tanga - yoniga borib E bosilsa olinadi
export interface CoinState {
    id: string;
    x: number;
    y: number;
}

// Yo'ldagi mina: ustidan o'tgan qahramonni portlab, jonining 20% ini oladi
export interface MineState {
    id: string;
    x: number;
    y: number;   // mina markazi (sirt ustida)
    wallId: string | null; // Devor tagidagi mina: portlasa shu devor ham portlab, yo'l ochiladi
}

export interface RectState {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
}

// Elf daraxt tepasidan otgan mega olma (havoda uchib, savatchaga tushadi yoki yerga)
export interface AppleState {
    id: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
    g: number;   // shu olmaning gravitatsiyasi (uzoq uchadigani - sekinroq tushadi)
    tx: number;  // tushish joyi (savatcha balandligida) - klient yerda belgi chizadi
}

// ROBOT-ILON (boss): joni, harakat yo'nalishi, buzilgan rastalar va h.k.
export interface BossState {
    hp: number;
    maxHp: number;
    nextMineTick: number;
    stallsSmashed: number;        // Ezilgan rastalar soni (ilon faqat oldinga yuradi - x bo'yicha tartibda)
    fire: 'idle' | 'charge' | 'fire'; // Olov purkash holati (charge - ogohlantirish)
    fireTicks: number;            // Joriy holat qancha davom etadi
    nextFireTick: number;
    wallBroken: boolean;          // Chapdagi katta devorni buzib kirdimi
    dead: boolean;
    deathTicks: number;           // O'lgach portlash animatsiyasi uchun kutish
    hitFlash: number;             // Zarba olganda qisqa oq chaqnash (klientda)
    lastHitBy: string | null;
}

export interface FlyingMineState {
    id: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
    ty: number;   // Qo'nadigan sirt balandligi (yer / rasta tomi / taxta) - mina markazi
}

// "Ilon quvishi" xaritasidagi bahaybat ilon: x - boshining OLD qirrasi
export interface SnakeState {
    x: number;
    speed: number;                 // px/s - joriy tezlik (xarita bo'ylab asta oshib boradi)
}

export interface RoomState {
    id: string;
    name: string;
    hostId: string;
    hostUserId: string | null;    // Xonani yaratgan foydalanuvchining hisobi (mehmon bo'lsa null)
    players: { [key: string]: PlayerState };
    bots: BotState[];
    bullets: BulletState[];
    bulletIdCounter: number;
    isStarted: boolean;
    isOver: boolean;              // O'yin g'olib chiqqach true bo'ladi (yangi round kutiladi)
    killsToWin: number;           // Xaritadagi botlarning UMUMIY soni - hammasi o'lsa xarita o'tiladi
    botsSpawned: number;          // Shu raundda jami nechta bot chiqarildi (to'lqinlar bo'yicha)
    botsKilled: number;           // Shu raundda jami nechta bot o'ldirildi (butun jamoa bo'yicha)
    snake: SnakeState | null;     // Faqat "ilon quvishi" xaritasida
    crates: CrateState[];
    coins: CoinState[];
    mines: MineState[];
    walls: RectState[];           // Shu raund devorlari (xaritadagilar + "ayri yo'l"larning tasodifiy yopilgan tarmog'i)
    checkpointReached: string[];  // Chekpointga yetib kelgan o'yinchilar (id)
    redBoxes?: RedBoxState[];     // O'rmon: tushayotgan/yotgan qizil qutilar
    paused?: boolean;             // Yolg'iz o'yinchi pauza qilgan (bir necha o'yinchida pauza yo'q)
    kicked?: string[];             // Xo'jayin chiqarib yuborganlar (hisob ID yoki brauzer oynasi ID) - qayta kira olmaydi
    loadingIds?: string[];        // Xarita boshida hali YUKLANAYOTGAN o'yinchilar - hammasi tayyor bo'lguncha raund kutadi
    loadDeadline?: number;        // Ko'pi bilan shu vaqtgacha kutiladi (ms) - qotib qolgan o'yinchi hammani to'xtatmasin
    stones?: StoneState[];        // Yuruvchi toshlar (map-7)
    gorilla?: GorillaState | null;  // Tosh gorilla (map-8)
    fatElf?: FatElfState | null;    // Semiz elf (map-9)
    acid?: AcidState[];             // Semiz elf sepgan kislota tomchilari
    acidCounter?: number;
    flowers?: FlowerState[];        // UnderWorld: og'zibor gullar
    gflower?: GiantFlowerState | null; // Season 2 map-1: Gigant gul
    gfThorns?: { id: string, x: number, y: number, vx: number, vy: number }[];
    gfRoots?: { id: string, x: number, y: number, phase: 'warn' | 'up', t: number, hit: string[] }[];
    gfCounter?: number;
    arena?: {                       // Arena (bonus): hisob va joriy boss
        kills: number;
        sinceBoss: number;
        boss: 'gorilla' | 'fatelf' | 'squad' | 'snake' | null;
        lastBoss: string | null;
        bossesBeaten: number;
        tick: number;
        nextSpawnTick: number;
    } | null;
    uwTalk?: { state: 'idle' | 'talk' | 'done', timer: number, by: string | null } | null; // trol bilan suhbat
    gPlats?: GPlatState[];
    gSpikes?: GSpikeState[];
    gRocks?: GRockState[];
    arenaTriggered?: boolean;     // O'rmon: daraxt yoniga yetildi - itlar chiqdi
    nextRedBoxTick?: number;
    apples?: AppleState[];        // Elf qishlog'i: havodagi olmalar
    levelTicks?: number;          // Raund boshlanganidan beri o'tgan tiklar
    nextAppleTick?: number;       // Keyingi olma otiladigan tik
    applesStarted?: boolean;      // Hamma dialogni tugatib, elf olma otishni boshladimi
    doorOpen?: boolean;           // Katta devordagi eshik kalit bilan ochilganmi
    boss?: BossState | null;      // Robot-ilon jangi
    flyingMines?: FlyingMineState[]; // Ilon otgan, hali havoda uchayotgan minalar
    // Suhbat sahnasi (bozor): hozirgi qator, kim boshlagan, oxirgi o'tish vaqti (ms)
    cutscene?: { line: number, starterId: string, lastAdvanceAt: number } | null;
    unlockedLevel: number;        // Ochilgan eng yuqori xarita (0-based) = XO'JAYIN hisobining progressi
    selectedLevel: number;        // Host hozir tanlagan (keyingi o'ynaladigan) xarita
    isPersistent: boolean;        // true bo'lsa, bu xona bazada saqlanadi (hisobli host)
    isPrivate: boolean;           // true bo'lsa, "Barcha xonalar" ro'yxatida ko'rinmaydi - faqat kod bilan qo'shiladi
}
export interface GiantFlowerState {
    state: 'sleep' | 'wake' | 'fight' | 'dying';
    hp: number;
    maxHp: number;
    timer: number;
    tick: number;
    hx: number;               // boshning hozirgi joyi (markazi)
    hy: number;
    side: 1 | -1;             // bosh poyaning qaysi tomonida (-1 chap)
    hitFlash: number;
    lastHitBy: string | null;
    bite: { phase: 'wind' | 'lunge' | 'back', t: number, tx: number, ty: number, fromX: number, fromY: number } | null;
    whip: { plat: number, phase: 'grow' | 'lash', t: number, x0: number, x1: number, y: number, hit: string[] } | null;
    nextWhip: number;
    nextThorn: number;
    nextRoot: number;
    nextBite: number;
    nextSprout: number;
}
