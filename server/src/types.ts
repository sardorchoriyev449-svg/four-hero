// LAGER TOPSHIRIG'I: killk - aniq dushmandan n ta, killn - lokatsiyada istalgan n ta dushman, item - o'rmondan n ta buyum (spots - qolgan joylar), fish - lokatsiya ko'lidan n ta baliq
export interface RandQuest { seed: number; loc: string; npc: number; t: 'killk' | 'killn' | 'item' | 'fish' | 'snow' | 'trophy' | 'gift'; boss?: string; k?: string; n: number; got: number; coins: number; xp: number; spots?: number[][]; fr?: number; }   // fr - katta o'rmon mevalari (joyi belgilanmaydi)
export interface PlayerState {
    mineCd?: number;               // ovchi: yopishqoq mina qayta tiklanishi (tik)
    ownedHeroes?: string[];        // sotib olingan (pullik) qahramonlar
    bigCp?: number;                // BIG MAP: saqlangan checkpoint
    bigMapItem?: boolean;
    bigQuests?: { [q: string]: number };
    bigRQ?: RandQuest | null;     // lager topshirig'i (tasodifiy): bitta faol
    bigKillAt?: { [z: string]: number };   // BIG MAP: boss o'ldirilgan vaqt (ms) - 50 daqiqada qaytadi
    localTest?: boolean;                   // test rejimi (localhost) - Big Map'da dushmanlar tezroq qaytadi   // BIG MAP topshiriqlari (0..3)   // BIG MAP xaritasi sotib olingan (butun umr)
    bigSeed?: number; bigVer?: number; bigDoneM?: number; bigCpV?: number; bigOpened?: number[]; bigKilled?: number[]; bigGot?: number[];   // BIG MAP: saqlangan dunyo, ochilgan sandiqlar, o'ldirilgan bosslar; bigCpV 2 - checkpoint raqami oraliq checkpointlar bilan
    // BIG MAP do'koni ta'sirlari: tugash vaqti (Date.now ms); phoenix - keyingi o'limda joyida tiriladi
    buffs?: { battery?: number, armorHp?: number, strength?: number, feather?: number, phoenix?: boolean };
    snowballs?: number; snowCd?: number;   // BIG MAP qor bazasi: qo'ldagi qor to'plari va otish kutishi (tik)
    petTrust?: number;             // Pushistik bilan do'stlik (0..10, akkauntda saqlanadi); 10 - doimiy hamroh
    pet?: import('./db').PetData;  // hamroh Pushistik (daraja, jon, kuchaytirishlar); petDirtyAt - bazaga yozish navbati
    petDirtyAt?: number;
    ride?: { x: number, y: number, out?: boolean };   // ajdarxoga mingan (out - kuchi tugab pastga tushmoqda)
    rideUsed?: number;       // uchilgan masofa (px), dam olganda kamayadi
    rideLockUntil?: number;  // kuchi tugagach qachongacha minib bo'lmaydi (ms)
    weaponFx?: string;             // qurol skini effekti (fire, ice, spark, shadow, star)
    skinFx?: string;               // afsonaviy skin effekti (aura, sparkle, flame, rainbow, ghost, crown)
    jetpack?: boolean;             // Season 2 map-9: ranets (faqat shu xaritada, sotib olingan yoki avtomatdan tushgan)
    vendBuying?: boolean;          // ranets to'lovi ketmoqda (ikki marta to'lanmasin)
    acidCurse?: boolean;           // semiz elf kislotasi: jon o'zi tiklanmaydi (do'kondagi Eliksir davolaydi)
    boltCurse?: boolean;           // robot chaqmog'i: stamina juda sekin to'ladi (do'kondagi Chip davolaydi)
    id: string;
    mutedUntil?: number;          // admin chat taqiqi (ms; -1 - doimiy)
    xpBoost?: { [character: string]: number };   // XP kuchaytirish darajalari (hisobdan)
    supporter?: boolean;          // "Supporter Pack" olgan - lobbida belgi
    isAdmin?: boolean;            // admin panel orqali kirgan - lobbida va o'yinda "ADMIN" belgisi
    x: number;
    y: number;
    mt?: number;                  // shu joy klientda qachon o'lchangan (klient vaqti, ms) - boshqalarda silliq ijro uchun
    characterType: string;
    color: number;
    hp: number;
    isInvisible: boolean;
    speedMultiplier: number;
    stamina: number;              // 0-100: hujum va qobiliyat uchun sarflanadigan energiya
    attackCooldown: number;       // Hujumlar orasidagi eng qisqa vaqt (spam qilishning oldini oladi)
    attackBuffered?: boolean;      // bosish cooldown tugashidan sal oldin keldi - tugashi bilan bir marta otiladi
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
    weaponMode: 'main' | 'alt' | 'alt2';   // alt2 - 16-darajadagi uchinchi qurol
    shieldCd?: number;            // knight: qalqon otishdan keyingi kutish (tik)    // Q: ikkinchi qurol (mage muz, knight drobovik, samurai kunai)
    tornadoCd?: number;            // sehrgar: tornado qayta tiklanmoqda (tik)
    ghostCd?: number;              // samuray: Shift sharpa zarbasi qayta tiklanmoqda (tik)
    specialTicks: number;          // R qobiliyati (mage davolash / knight uchish) qolgan vaqti
    specialCooldown: number;       // R qayta tayyor bo'lguncha
    flyEnergy?: number;            // ritsar: uchish energiyasi (0..100; yo'q - to'la)
    flyRegenDelay?: number;        // ritsar: tiklanish boshlanguncha (tik)
    flyTicks?: number;             // ritsar: shu uchish necha tikdan beri (juda tez to'xtatilmasin)
    invisLinger: number;           // archer: Shift bosilgach ko'rinmas qoladigan vaqt (tik)
    invisCd?: number;              // archer: ko'rinmaslik qayta tiklanmoqda (tik)
    ammo?: number;                 // knight drobovigi: magazindagi o'qlar
    reloadTicks?: number;          // drobovik qayta o'qlanmoqda (qolgan tik)
    lastEmoteAt?: number;          // emotsiya spamiga qarshi (ms) // Hisobdagi BARCHA personajlar uchun yaxshilanishlar keshi (personaj almashtirilganda shu yerdan olinadi)
}

export interface BotState {
    elite?: boolean;               // Arena: "Robot otryadi" bossining kuchli roboti
    skin?: 'sprout' | 'zombie';    // 'sprout' - Gigant gul xaritasi (it AI'si); 'zombie' - ferma (sekin, faqat yerda, 1 zarbada o'ladi)
    emerge?: number;               // yerdan sug'urilib chiqish (tik) - shu vaqtda harakatlanmaydi
    tongue?: { phase: 'aim' | 'stab', t: number, tx: number, ty: number } | null; // zombi-sabzavot igna-tili
    tongueCd?: number;
    id: string;
    x: number;
    y: number;
    color: number;
    hp: number;
    maxHp: number;                 // HP satrini (progress bar) to'g'ri chizish uchun
    freezeDuration: number;
    targetPlayerId: string | null; // Bot "o'zi uchun" tanlagan raqib - shuni ta'qib qiladi
    retargetTimer?: number;        // shuncha tikdan keyin raqib qayta ko'rib chiqiladi (botlar o'yinchilar orasida bo'linsin)
    isBlocking: boolean;           // Vaqti-vaqti bilan qalqon ko'tarib himoyalanadi (shu payt zarar yemaydi)
    blockTimer: number;            // Qalqon holati necha tik davom etishini/yo'qligini boshqaradi
    blockCd?: number;              // qalqon tushgandan keyin qayta ko'tarilguncha qolgan tiklar
    poison?: { delay: number, t: number, owner: string } | null;   // ovchi drotigi zahari
    trapped?: number;              // ovchi qopqoniga tushgan (tik): qimirlamaydi, qalqon ko'tarolmaydi
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
    state: 'eating' | 'talk' | 'idle' | 'charge' | 'spit' | 'fcharge' | 'flame' | 'down';
    flameHit?: number;          // yashil olov: keyingi zarar tiki
    step?: number;              // hujumlar navbati (kislota / olov)
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
    bulletType: 'normal' | 'arrow' | 'fireball' | 'melee' | 'ice' | 'pellet' | 'kunai' | 'slash' | 'lightning' | 'shield' | 'tornado' | 'acid' | 'petbite' | 'knife' | 'dart' | 'blast' | 'cut';
    poison?: boolean;     // ovchining zaharli drotigi
    dmg?: number;         // qat'iy zarar (hamroh Pushistikning kislotasi / zarbasi) - egasining kuchaytirishlari qo'shilmaydi
    justSpawned: boolean; // Birinchi tikda to'qnashuv tekshirilmaydi - klient ko'rish uchun ulgurishi kerak
    sx?: number;          // oxirgi tekshirilgan joy - shu yerdan hozirgi joygacha butun yo'l tekshiriladi
    sy?: number;
    fire?: boolean;       // kamonchi 4-daraja: olovli o'q
    big?: boolean;        // samuray 15-daraja: katta katana ruhi
    long?: boolean;       // ritsar 17-daraja: uzun qilich zarbasi
    bounce?: number;      // ritsar 15-daraja: drobovik o'qi tekkanda sachraydi (necha marta)
}

// Sindiriladigan quti: markaz (x, y), sindirilsa sindirgan o'yinchiga tanga beradi
export interface CrateState {
    id: string;
    x: number;
    y: number;
    hp: number;
    s?: number;   // o'lchami (Big Map: har xil), yo'q - CRATE_SIZE
}

// Quti sinsa chiqadigan tanga - yoniga borib E bosilsa olinadi
export interface CoinState {
    id: string;
    x: number;
    y: number;
    v?: number;   // necha tanga (Big Map qutisi: 1-10), yo'q - CRATE_COINS
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
    // OVCHI: yopishqoq minalar (uchadi -> raqibga yopishadi yoki yerga tushadi -> portlaydi) va qopqonlar
    hunterMines?: { id: number, owner: string, x: number, y: number, vx: number, vy: number, stuck: string | null, stuckBig?: number, ox: number, oy: number, fuse: number, ground: boolean }[];
    hunterTraps?: { id: number, owner: string, x: number, y: number, arm: number, life: number }[];
    hunterSeq?: number;
    big?: import('./bigmap').BigState | null;   // BIG MAP holati
    // Yoqimtoy maxluqcha (barcha xaritalarda): fly - uchib o'tish, in - qo'nish, sit - o'tiradi, eat - yeydi, out - uchib ketadi
    critter?: { phase: 'fly' | 'in' | 'sit' | 'eat' | 'out', x: number, y: number, face: number, t: number, dur: number,
        x0: number, y0: number, x1: number, y1: number, alarm: number, wish: string, scared: boolean,
        have: { [pid: string]: number }, fed: string[], hold: { [pid: string]: number }, seq: number } | null;   // have - so'ragan narsasi fermasida nechta
    critterNextAt?: number;
    // Jangdagi hamrohlar (egasi id si bo'yicha): follow - egasi yonida, dash - raqibga uchib boradi, back - qaytadi
    pets?: { [ownerId: string]: { x: number, y: number, face: number, st: 'follow' | 'dash' | 'back' | 'perch' | 'ride', tx: number, ty: number, spitAt: number, dashAt: number, hitFlash: number, idle?: number, spot?: 'head' | 'ground' } };
    tornadoes?: { id: string, owner: string, x: number, y: number, dir: number, t: number, pulse: number, k?: number }[];   // sehrgar tornadolari
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
    flushNow?: boolean;
    advancing?: boolean;          // xarita o'tildi, keyingisi boshlanmoqda (kirish yopiq)           // hujumdan keyin holat keyingi tikdayoq yuboriladi
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
    freezeUntil?: number;         // LEVEL UP: shu vaqtgacha (Date.now) o'yin hamma uchun to'xtab turadi
    kicked?: string[];             // Xo'jayin chiqarib yuborganlar (hisob ID yoki brauzer oynasi ID) - qayta kira olmaydi
    round?: number;               // har xarita boshlanganda +1: klient eski xaritada qolib ketsa - sezib, qayta so'raydi
    loadingIds?: string[];        // Xarita boshida hali YUKLANAYOTGAN o'yinchilar - hammasi tayyor bo'lguncha raund kutadi
    loadDeadline?: number;        // Ko'pi bilan shu vaqtgacha kutiladi (ms) - qotib qolgan o'yinchi hammani to'xtatmasin
    stones?: StoneState[];        // Yuruvchi toshlar (map-7)
    gorilla?: GorillaState | null;  // Tosh gorilla (map-8)
    fatElf?: FatElfState | null;    // Semiz elf (map-9)
    acid?: AcidState[];             // Semiz elf sepgan kislota tomchilari
    acidCounter?: number;
    flowers?: FlowerState[];        // UnderWorld: og'zibor gullar
    gflower?: GiantFlowerState | null; // Season 2 map-1: Gigant gul
    squid?: SquidState | null;
    doors?: DoorsState | null;
    // BONUS "NO MORE FRIENDS" (PvP): qayta tug'ilish vaqtlari, himoya, tugadimi
    // MY FARM: HOSTning fermasi (hisobdan yuklanadi) va baliq ovi holati
    myFarm?: { owner: string | null, farm: import('./db').FarmData | null, loading: boolean, sig: string, tick: number,
        fishing: { state: 'wait' | 'bite', biteAt: number, until: number, fish: { id: string, kg: number, value: number } } | null,
        respawnAt: { [pid: string]: number }, worldOn: boolean, seq: number, loadedFor?: string,
        // Qo'ziqorinlar (zararkunanda): k - qaysi grядkada, born - chiqqan vaqti (shundan eatMs o'tsa - ekinni yeydi)
        shrooms: { id: string, x: number, k: number, hp: number, maxHp: number, born: number, nextPuff: number, ate: boolean, hitFlash: number, nextShot?: number }[],
        spores?: { id: number, x: number, y: number, vx: number, vy: number }[],   // qo'ziqorinlar otgan spora sharlari
        // MAXLUQLAR HUJUMI (har ~5 daqiqada): shilimshiq (sakrab yuradi, o'lsa - kichiklarga bo'linadi), zombi sabzavotlar
        mobs: { id: string, kind: 'slime' | 'slimelet' | 'zveg' | 'crow', x: number, y: number, hp: number, maxHp: number, hitFlash: number,
            face: number, v: number, hopFrom: number, hopTo: number, hopAt: number, hopEnd: number, hitCd: number,
            tongue?: { phase: 'aim' | 'stab', t: number, tx: number, ty: number } | null, tongueCd?: number,
            plot?: number, phase?: 'in' | 'eat' | 'out', eatAt?: number,
            air?: boolean, vx?: number, vy?: number, jumpCd?: number, hopFromY?: number, hopToY?: number, hopH?: number }[],
        nextCrowAt?: number,
        // Ferma elflari: st - walk (ishga), harvest, hai, flee (uyga qochadi), inside (uyda: act - hide/read/sleep), cards, swim, mat, fetch, idle
        elves?: { x: number, face: number, st: string, act: string, tx: number, t: number, plot: number, busy: boolean, haiCd: number, calmAt: number, idx: number, task?: 'harvest' | 'plant' | 'water' }[],
        elfSkip?: { [k: number]: number },   // elf ishi bo'lmagan grядka (tanga yetmadi) - shu vaqtgacha tegmaydi
        elfThrowAt?: number,
        // Robot it (bezak sotib olingan bo'lsa): fermani himoya qiladi
        dog?: { x: number, y: number, face: number, vx: number, vy: number, air: boolean, biteAt: number, bite: number, jumpCd: number, hp: number, hurt: number } | null,   // biteAt - keyingi tishlashgacha tiklar
        nextRaidAt: number, raidKind: string | null, safeUntil: { [pid: string]: number },
        // Baxaybat daraxt BOSS jangi
        boss: { hp: number, maxHp: number, hitFlash: number, nextAt: number, last: string,
            apples: { id: number, x: number, y: number, vx: number, vy: number }[],
            queue: { at: number, x: number, y: number, vx: number, vy: number }[],
            roots: { x: number, phase: 'warn' | 'up', at: number }[],
            pillars: { x: number, phase: 'warn' | 'up', at: number, hit: string[] }[] } | null } | null;
    pvp?: { respawnAt: { [id: string]: number }, shieldUntil: { [id: string]: number }, tick: number, done: boolean } | null;
    // Season 2 map-10 "SKY BATTLE": uchar mashinali botlar to'lqinlari, chaqmoqlar, boss (uchar kema)
    sky?: { state: 'intro' | 'wave' | 'gap' | 'boss' | 'dying' | 'done', tick: number, timer: number, wave: number, counter: number, nextStrike: number,
        enemies: { id: string, x: number, y: number, hp: number, maxHp: number, target: string | null, ox: number, oy: number, nextShot: number, hitFlash: number, facing: number, minion?: boolean }[],
        shots: { id: string, x: number, y: number, vx: number, vy: number, t: number, dmg: number }[],
        strikes: { id: string, x: number, t: number, phase: 'warn' | 'hit', hit: string[] }[],
        boss: { x: number, y: number, hp: number, maxHp: number, hitFlash: number, facing: number, act: 'volley' | 'fan' | 'drop' | null, actT: number, actN: number, nextAct: number, step: number, phase: number } | null } | null;
    // Season 2 map-9 "ROAD TO SKYLAND": ranets avtomati (tinch -> jahli chiqsa jang) va jarlik
    vend?: { state: 'idle' | 'transform' | 'fight' | 'dying' | 'broken' | 'fly' | 'done', hp: number, maxHp: number, tick: number, timer: number,
        x: number, y: number, facing: number, hitFlash: number, shieldFlash: number, vuln: number, step: number, nextAct: number,
        act: { kind: 'flame' | 'jump' | 'sit', t: number, phase: 'warn' | 'fire' | 'air' | 'down' | 'hold', x0: number, target: string | null, hit: string[], nextHit: number, landX: number | null } | null,
        contactCd: { [id: string]: number }, jets: { id: string, x: number, y: number }[], flyId: string | null,
        legK?: number, under?: { [id: string]: number } } | null;
    // Season 2 map-8 "IRON GIANT": robot boss
    robot?: { state: 'walk' | 'intro' | 'on' | 'off' | 'dying' | 'done', hp: number, maxHp: number, tick: number, timer: number, step: number,
        hitFlash: number, nextAct: number,
        act: { kind: 'smash' | 'combo' | 'throw' | 'bolts', t: number, n: number } | null,
        fist: { x: number, y: number, phase: 'rest' | 'aim' | 'down' | 'hold' | 'back', t: number, tx: number, ty: number, warn: number, dmg: number, hit: string[] },
        laser: { x1: number, y1: number, x2: number, y2: number, phase: 'warn' | 'fire', t: number, hit: string[] } | null,
        bolts: { id: string, x: number, y: number, vx: number, vy: number, t: number }[], counter: number, holoCd?: number } | null;
    // Season 2 map-7 "INFINITY TNT": Gorila Rock (o'lmaydi) va cheksiz TNT bochka
    tnt?: { state: 'intro' | 'fight' | 'fuse' | 'boom' | 'done', hp: number, maxHp: number, tick: number, timer: number, hitFlash: number, counter: number,
        gor: { x: number, y: number, surf: number, facing: number, act: 'idle' | 'walk' | 'grab' | 'throw' | 'leap' | 'sky' | 'panic' | 'clap', t: number,
            x0: number, y0: number, x1: number, y1: number, peak: number, dur: number, target: string | null, plan: 'throw' | 'leap' | 'sky' | 'clap' | null, thrown: number },
        bombs: { id: string, x: number, y: number, vx: number, vy: number, kind: 'throw' | 'sky', landY: number }[],
        warns: { id: string, x: number, y: number }[], nextAct: number, step: number, contactCd: { [id: string]: number } } | null;
    // Season 2 map-6 "HIS BACK": yo'l -> Gorila Rock suhbati -> zigzag yo'lakda bochkalar orasidan tepaga -> so'nggi suhbat
    back?: { state: 'walk' | 'talk1' | 'climb' | 'talk2' | 'done', timer: number, tick: number, nextBarrel: number, counter: number,
        barrels: { id: string, ramp: number, x: number, y: number, dir: number, phase: 'roll' | 'ledge', vy: number }[] } | null;
    farm?: { state: 'idle' | 'talk' | 'fight' | 'done', timer: number, tick: number, kills: number, target: number, spawned: number, nextSpawnTick: number, lastDogTick: number,
        rooted: Record<string, number>, rootCd: Record<string, number> } | null;
    lift?: { state: 'hidden' | 'emerge' | 'ready' | 'rising' | 'arrived' | 'done', y: number, t: number, spawned: number, nextBotTick: number } | null;
    gfThorns?: { id: string, x: number, y: number, vx: number, vy: number }[];
    gfRoots?: { id: string, x: number, y: number, phase: 'warn' | 'up', t: number, hit: string[] }[];
    gfCounter?: number;
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

export interface SquidState {
    state: 'sleep' | 'rise' | 'fight' | 'dying';
    hp: number;
    maxHp: number;
    timer: number;
    tick: number;
    x: number;                 // ko'z markazi
    eyeY: number;
    hitFlash: number;
    lastHitBy: string | null;
    slam: { plat: number, phase: 'raise' | 'slam', t: number, x0: number, x1: number, y: number, hit: string[] } | null;
    geysers: { id: string, x: number, topY: number, phase: 'warn' | 'up', t: number, hit: string[] }[];
    fish: { id: string, x: number, y: number, vx: number, vy: number }[];
    splashX: number | null;    // suvni urgan joy (klient effekti uchun, bir necha tik)
    nextSlam: number;
    nextGeyser: number;
    nextFish: number;
    counter: number;
}

export interface DoorsState {
    state: 'walk' | 'talk' | 'choose' | 'free' | 'climb' | 'room' | 'done';
    choice: 'enter' | 'no' | null;
    timer: number;
    tick: number;
    // Tepaga chiqish
    segment: number;
    wave: { safes: (number[] | null)[], phase: 'warn' | 'fall', t: number, n: number,
        rocks: { x: number, y: number, y0: number, ty: number, r: number, hit: string[] }[] } | null;   // safes[qavat]: [pastki qatordagi, yuqori qatordagi xavfsiz] (-1 - bu qatorga tosh yo'q; null - qavatga yo'q)
    lastSafe: number[];
    nextWave: number;
    lastPlat: Record<string, number>;
    // Ichkari: elf -> richag -> maxluq tushadi (drop) -> malikani olib teshikka kiradi (take) -> qochish (fight)
    sub: 'elf' | 'lever' | 'drop' | 'take' | 'shock' | 'fight' | 'buried' | 'hunt' | 'caught' | null;
    monster: { x: number, y: number, vy: number, pose: 'drop' | 'crawl' | 'hidden', facing: 1 | -1 } | null;
    floorOpen: boolean;
    // Yo'ldagi teshiklardan qo'llar (side: qo'l qaysi tomondagi platformaga cho'ziladi)
    hands: { id: string, x: number, y: number, side: -1 | 1, hole: number, phase: 'warn' | 'up', t: number, hit: boolean }[];
    holeCd: number[];
    nextHand: number;
    // Devordagi teshiklardan bosh (har teshik uchun) va tunnelga tortilganlar
    heads: { phase: 'idle' | 'warn' | 'lunge' | 'back', t: number, cd: number }[];
    nextHead: number;
    swallowed: { id: string, hole: number, t: number }[];
    grabImmune: Record<string, number>;   // qahramon -> shu tikkacha bosh ushlamaydi
    shrooms: { id: string, x: number, y: number, vx: number, vy: number, hp: number, air: boolean, facing: 1 | -1,
        atkCd: number, jumpCd: number, flash: number }[];
    nextShroom: number;
    counter: number;
    lastHitBy: string | null;
}
