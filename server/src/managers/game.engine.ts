import * as db from '../db';
import { Server } from 'socket.io';
import { RoomState, PlayerState, BotState } from '../types'
import { BaseCharacter } from '../characters/base.character';
import { getCharacterLogic } from '../characters';
import { RoomManager } from './room.manager';
import { TORNADO, bonusDamageOf, shotgunMagOf, weaponUpgradeLevel, regenPerSecondOf, BASE_HP, SHOTGUN_DMG_PER_LEVEL, KUNAI_DMG_PER_LEVEL } from '../perks';
import { getMapById, generateBotSpawns, MapDef, CRATE_SIZE, CRATE_HP, CRATE_COINS, MINE_DAMAGE, STALL_ROOF_Y, STALL_ROOF_HALF_W, RED_BOX_SIZE, farmPlotX, farmGrown } from '../maps';

// Xarita bo'yicha bot "tura oladigan" bitta sirt (yer yoki bitta platforma) -
// X oralig'i va bot markazi o'sha sirtda turganda ega bo'lishi kerak bo'lgan Y
interface Surface {
    xStart: number;
    xEnd: number;
    standY: number;
    // Platforma QATTIQ jism: bot markazi shu X oralig'ida bo'lib, Y'i
    // (standY, underY) orasida bo'lsa - platformaning ichida degani. Pastdan
    // boshi urilib to'xtaydi, yonidan kira olmaydi (o'yinchidek). Yer uchun bo'sh
    underY: number;
    // Ingichka (<= 14px) platforma - daraxt shoxi/taxta: ITLAR uchun bir tomonlama
    // (ostidan sakrab o'tib, ustiga qo'nadi), robotlar uchun odatdagidek qattiq
    thin?: boolean;
}

export class GameEngine {
    private io: Server;
    private activeRooms: { [key: string]: RoomState };
    private roomManager: RoomManager;
    private loopInterval: NodeJS.Timeout | null = null;
    // Server faqat o'yinchi POZITSIYASINI oladi - tezligini (qaysi tomonga,
    // qanchalik tez sakrayapti) tiklar orasidagi farqdan o'zimiz hisoblaymiz
    private playerMotion = new Map<string, { x: number, y: number, vx: number, vy: number }>();

    // DIQQAT: bot texturasi (client) markazdan pastga cho'zilgan (~40px balandlik),
    // shuning uchun bot markazi yer sathidan (570px) yarim balandlik (20px) yuqorida
    // turishi kerak - aks holda bot vizual ravishda yerga "botib" ko'rinadi
    private readonly GROUND_Y = 550;
    private readonly TICK_SECONDS = 0.03;
    // Fizika o'yinchinikiga mos: klientdagi Phaser gravitatsiyasi 600 px/s²
    private readonly GRAVITY = 600;
    private readonly MAX_JUMP_V = 460;                 // Eng kuchli sakrash (px/s) - ~176px balandlik
    private readonly JUMP_MARGIN = 18;                 // Platformadan shuncha yuqoriroq sakraydi (chetiga ilinib qolmasligi uchun)
    private readonly MAX_JUMP_GAP_X = 150;             // Ikki platforma orasidagi shu masofagacha sakrab o'ta oladi
    // O'yinchi 200 px/s (=6 px/tik) yuradi - bot ~83%: sal sekinroq, lekin qochib qutulish oson emas
    private readonly BOT_SPEED = 5;
    public static readonly BOT_MAX_HP = 220;         // Avvalgi 100'dan sezilarli ko'proq - botlar endi chidamliroq
    private readonly BOT_BLOCK_DURATION_TICKS = 60;  // Qalqon taxminan 1.8s davom etadi
    private readonly BOT_REACTIVE_BLOCK_CHANCE = 0.4; // O'yinchi hujum qilgan zahoti qalqon ko'tarish EHTIMOLI (har doim emas)
    private readonly BOT_REACT_RANGE = 350;           // Shu gorizontal masofadan uzoqdagi bot hujumga qalqon bilan javob bermaydi
    private readonly BOT_INTERCEPT_CHANCE = 0.3;      // O'yinchi ustidan sakrab o'tayotganda, bot ham sakrab yo'lini to'sish EHTIMOLI
    // ZARBA: tegish endi jon olmaydi - bot qilichini ko'taradi (windup), keyin
    // uradi. O'yinchi shu fursatda uzoqlashsa (yoki ritsar qalqon tutsa) zarar yo'q
    private readonly BOT_ATTACK_REACH_X = 46;         // Markazdan-markazgacha (tanalar 32px - bir-biriga tegib tursa ~32)
    private readonly BOT_ATTACK_REACH_Y = 40;
    private readonly BOT_WINDUP_TICKS = 9;            // ~0.27s - qilich ko'tarilishi
    private readonly BOT_ATTACK_COOLDOWN_TICKS = 36;  // ~1.1s - zarbalar orasidagi vaqt
    private readonly BOT_ATTACK_DAMAGE = 25;          // Har zarbada -25 HP (4 zarbada o'ladi)
    private readonly BOT_ATTACK_ANIM_TICKS = 8;       // Zarba tushgandan keyin animatsiya shuncha davom etadi
    private readonly BOT_STRIKE_PAUSE_TICKS = 12;     // ~0.36s - zarbadan keyin bot joyida to'xtab turadi (qilich ko'tarilganda ham)
    private readonly TAKEOFF_OFFSET = 14;
    // ROBOT IT (o'rmon): robotdan tezroq (lekin qahramondan sal sekin), tez-tez va
    // kamroq tishlaydi, qalqoni yo'q, ko'k olov bilan uchmaydi - shoxma-shox sakraydi
    private readonly DOG_SPEED = 5.5;                  // ~183 px/s (qahramon 200)
    private readonly DOG_SLOW_SPEED = 1.8;             // tishlagandan keyin ~1s shunday sekin (~60 px/s)
    private readonly DOG_SLOW_TICKS = 33;              // ~1s
    private readonly DOG_WINDUP_TICKS = 1;             // yetib kelishi bilan DARHOL tishlaydi
    private readonly DOG_ATTACK_COOLDOWN_TICKS = 40;   // sekinlashuv tugagach yana tishlay oladi
    private readonly DOG_ATTACK_DAMAGE = 30;           // har tishlash - jonning 30%
    private readonly DOG_JUMP_V = 540;                 // it balandroq sakraydi (~225px) - yerdan o'rta shoxga
    private readonly DOG_STRIKE_PAUSE_TICKS = 0;       // to'xtamaydi - faqat sekinlashadi
    // It kattaroq (rasmi 80x60): hitbox 60x44, oyog'i odatdagidek y+20 da
    private readonly DOG_HALF_W = 30;
    private readonly DOG_HIT_H = 44;
    private readonly DOG_REACH_X = 60;             // Platformaga sakrashdan oldin uning chetidan shuncha tashqarida turadi
    // KO'K OLOV (JET): raqib bir sakrashda yetib bo'lmaydigan balandlikda bo'lsa,
    // bot pog'onama-pog'ona sakramasdan, tagidan olov chiqarib to'g'ri uchib chiqadi
    private readonly JET_SPEED = 260;                 // px/s - ko'tarilish tezligi
    private readonly JET_HOVER_ABOVE = 20;            // Platforma sathidan shuncha yuqorida to'xtab, ustiga suriladi
    private readonly JET_MAX_TICKS = 150;             // ~4.5s - biror sabab bilan tiqilib qolsa, uchish to'xtatiladi
    // OLMA UCHISHI: o'yinchi 200 px/s yuradi; olma "170 px/s + 0.9s reaksiya" hisobidan
    // uchadi - eng yaqin qahramon yugursa, olma yerga yetguncha ulguradi
    private readonly APPLE_CHASE_SPEED = 170;
    private readonly APPLE_REACTION_S = 0.9;
    private readonly APPLE_MIN_FLIGHT = 1.6;          // s - yaqin tushsa ham juda tez emas
    private readonly APPLE_MAX_FLIGHT = 3.6;          // s
    private readonly APPLE_ARC_RISE = 70;             // px - elfdan shuncha yuqoriga ko'tarilib, keyin tushadi
    private readonly APPLE_SPILL_IMMUNITY_TICKS = 45; // ~1.35s - sochilgandan keyin darhol yana sochilmaydi
    private readonly INTRO_MAX_TICKS = 2000;          // ~60s - dialogni kimdir o'qimasa ham olma otish boshlanadi
    private readonly BOSS_MAX_MINES = 10;             // Maydonda bir vaqtda ko'pi bilan shuncha ilon minasi
    private readonly BOSS_DEATH_TICKS = 100;
    // Gorilla suhbatlari: hamma o'qib bo'lguncha (lekin ko'pi bilan shuncha) kutiladi
    public static readonly GORILLA_TALK_MAX_MS = 45000;
    // Har xaritada bot o'ldirgan qahramonga beriladigan tajriba
    public static readonly KILL_XP = 5;
    // Semiz elf suhbati uzun (7 qator) - sekin o'qiydiganni dialog ochiq turganda urib qo'ymasin
    public static readonly FATELF_TALK_MAX_MS = 60000;          // ~3s - o'lim portlashlari ko'rinib ulgursin
    private readonly COIN_PICKUP_RANGE = 70;          // Tangani E bilan olish uchun shu masofagacha yaqin turish kerak
    // Yerda turgan qahramon markazi ~546; jarlikka tushgani (tubida ~576) - halok
    private readonly PIT_DEATH_Y = 560;

    // Bot/o'yinchi hitbox o'lchamlari - klientdagi vizual tekstura o'lchamiga mos
    // (bot: 32x40, o'yinchi: 32x48), MARKAZdan hisoblanadi - checkOverlap'ga
    // uzatilganda bu markazlar atrofida to'g'ri to'rtburchak quriladi
    private readonly BOT_HALF_W = 16;
    private readonly BOT_HALF_H = 20;
    private readonly PLAYER_HALF_W = 16;
    private readonly PLAYER_HALF_H = 24;

    constructor(io: Server, activeRooms: { [key: string]: RoomState }, roomManager: RoomManager) {
        this.io = io;
        this.activeRooms = activeRooms;
        this.roomManager = roomManager;
    }

    // O'yin siklini (Tick loop) ishga tushirish (30ms xuddi sizda bo'lganidek)
    public start(): void {
        if (this.loopInterval) return;
        
        this.loopInterval = setInterval(() => {
            this.update();
        }, 30);
    }

    // Holat har 2-tikda yuboriladi (~17 marta/s): o'yin mantig'i 33 marta/s hisoblanadi, lekin tarmoq trafigi
    // va telefondagi ishlov ikki baravar kam - mobil internetda "qotish" kamayadi (klient oraliqni silliqlaydi)
    private frame = 0;
    private readonly BROADCAST_EVERY = 2;
    private update(): void {
        this.frame++;
        const seenPlayers = new Set<string>();
        Object.keys(this.activeRooms).forEach(roomId => {
            const room = this.activeRooms[roomId];
            if (!room.isStarted) return;
            // Yolg'iz o'yinchi pauza qilgan - o'yin to'xtab turadi
            if (room.paused) return;
            // LEVEL UP: kimdir yangi darajaga chiqdi - o'yin hamma uchun bir necha soniya to'xtaydi (nur tushadi)
            if (room.freezeUntil && Date.now() < room.freezeUntil) return;
            // Hali kimdir xaritani yuklayapti - raund to'xtab turadi (kutish vaqti tugasa - boshlanadi)
            if (room.loadingIds && room.loadingIds.length > 0) {
                if (Date.now() < (room.loadDeadline || 0)) return;
                this.roomManager.finishLoading(roomId);
            }

            // 0. O'YINCHILAR TEZLIGINI HISOBLASH (botlar sakrashni oldindan ko'rishi uchun)
            Object.values(room.players).forEach(p => {
                seenPlayers.add(p.id);
                const m = this.playerMotion.get(p.id);
                if (m) {
                    // Silliqlash: tarmoq paketlari notekis keladi (bir tikda 0 ta,
                    // keyingisida 2 ta) - xom farq sakrab turadi, o'rtachasi barqaror
                    m.vx = 0.5 * m.vx + 0.5 * (p.x - m.x) / this.TICK_SECONDS;
                    m.vy = 0.5 * m.vy + 0.5 * (p.y - m.y) / this.TICK_SECONDS;
                    m.x = p.x;
                    m.y = p.y;
                } else {
                    this.playerMotion.set(p.id, { x: p.x, y: p.y, vx: 0, vy: 0 });
                }
            });

            // 1. O'YINCHILAR TAYMERLARINI YANGILASH + USHLAB TURILGAN AMALLAR
            Object.values(room.players).forEach((player) => {
                // O'LGAN ("ARVOH") O'YINCHI: avtomatik qayta tug'ilmaydi - butun raund
                // davomida arvoh bo'lib qoladi (yura oladi, lekin hujum/qobiliyat yo'q).
                // Tirilish imkoniyati keyinroq alohida qo'shiladi.
                // Kasr zarar (olov, zaharli va h.k.) jonni 0 va 1 orasida qoldirishi mumkin - ekranda
                // "0" ko'rinib, qahramon tirik qolardi. Joni 1 dan kam - halok
                if (!player.isDead && player.hp < 1) this.killPlayer(player);
                if (player.isDead) {
                    return;
                }

                const charLogic = getCharacterLogic(player.characterType);
                const wasHoldingAbility = player.isHoldingAbility;

                BaseCharacter.updateTimers(player);

                // DARAJA IMKONIYATLARI: R qobiliyati va archerning qo'shimcha ko'rinmasligi
                if ((player.specialCooldown || 0) > 0) player.specialCooldown--;
                if ((player.specialTicks || 0) > 0) {
                    player.specialTicks--;
                    // Mage: 2 soniya davomida xonadagi barcha tirik qahramonlar davolanadi (~40 HP)
                    if (player.characterType === 'mage') {
                        // PvP da ittifoqchi yo'q - faqat o'zini davolaydi
                        (room.pvp ? [player] : Object.values(room.players)).forEach(ally => {
                            if (!ally.isDead && !ally.acidCurse) ally.hp = Math.min(ally.maxHp || BASE_HP, ally.hp + 0.6);
                        });
                    }
                }
                // JON TIKLANISHI ("regen" kuchaytirishi): tirik qahramon asta-sekin o'zi davolanadi
                const regen = regenPerSecondOf(player);
                if (regen > 0 && !player.acidCurse && player.hp < (player.maxHp || BASE_HP)) {
                    player.hp = Math.min(player.maxHp || BASE_HP, player.hp + regen * this.TICK_SECONDS);
                }
                // Drobovik qayta o'qlanishi
                if ((player.reloadTicks || 0) > 0 && --player.reloadTicks! <= 0) player.ammo = shotgunMagOf(player);
                if ((player.invisLinger || 0) > 0) {
                    player.invisLinger--;
                    if (!player.isHoldingAbility) player.isInvisible = player.invisLinger > 0;
                }

                // Agar stamina tugab, updateTimers o'zi majburiy o'chirgan bo'lsa
                // (masalan, Samuray tezligini SHIFT qo'yib yubormasdan tugatgan bo'lsa),
                // personajning shaxsiy effektini ham darhol bekor qilishimiz kerak,
                // aks holda tezlik/ko'rinmaslik "yopishib qolib" davom etaveradi
                if (wasHoldingAbility && !player.isHoldingAbility) {
                    charLogic.releaseHeldAbility(player, room);
                }

                // SHIFT ushlab turilgan bo'lsa, har tikda personajning maxsus
                // effektini qo'llaymiz (ko'rinmaslik, tezlik, muzlatish va h.k.)
                if (player.isHoldingAbility && player.stamina > 0) {
                    charLogic.applyHeldAbility(player, room);
                }

                // ENTER/SICHQONCHA ushlab turilgan bo'lsa - avtomatik otish
                // (stamina va cooldown yetarli bo'lgandagina zarba beriladi)
                if (player.isHoldingAttack) {
                    if (player.attackCooldown <= 0 && charLogic.canAttack(player) && player.stamina >= BaseCharacter.staminaCost(player, charLogic.attackStaminaCost)) {
                        BaseCharacter.spendStamina(player, charLogic.attackStaminaCost);
                        player.attackCooldown = BaseCharacter.ATTACK_COOLDOWN_TICKS;
                        charLogic.handleAttack(player, room, player.lastAttackAngle);
                    } else if (player.attackCooldown <= 0 && charLogic.canAttack(player)) {
                        this.signalNoStamina(player);
                    }
                }
            });

            // 2. BOTLAR FIZIKASI VA SHeLLI AI
            this.updateBots(room);

            // 3. O'QLAR VA TO'QNASHUVLAR
            this.updateBullets(room);

            // 4. BOTLAR TUGASA RESPRAWN
            this.checkBotRespawn(room, roomId);

            // 4a. ILON QUVISHI (faqat 'chase' xaritada)
            this.updateSnake(room, roomId);

            // 4b. ELF QISHLOG'I - olma tutish (faqat 'apples' xaritada)
            this.updateApples(room, roomId);

            // 4c. ROBOT-ILON JANGI (faqat 'boss' xaritada)
            this.updateBoss(room, roomId);

            // 4d. O'RMON - robot itlar va qizil qutilar (faqat map-6)
            this.updateForest(room, roomId);

            // 4e. YURUVCHI TOSHLAR (faqat map-7)
            this.updateStones(room, roomId);

            // 4f. TOSH GORILLA (faqat map-8)
            this.updateGorilla(room, roomId);

            // 4g. SEMIZ ELF (faqat map-9)
            this.updateFatElf(room, roomId);

            // 4h. UNDERWORLD - og'zibor gul va trol (faqat map-10)
            this.updateUnderworld(room, roomId);

            // 4i. ARENA (bonus) - cheksiz botlar va bosslar
            this.updateArena(room);

            // 4j. GIGANT GUL (Season 2, map-1)
            this.updateGiantFlower(room, roomId);

            // 4k. LIFT (Season 2, map-2)
            this.updateLift(room, roomId);

            // 4l. FERMA (Season 2, map-3)
            this.updateFarm(room, roomId);

            // 4m. KALMAR (Season 2, map-4)
            this.updateSquid(room, roomId);

            // 4n. SARIQ ESHIK (Season 2, map-5)
            this.updateDoors(room, roomId);

            // 4o. HIS BACK (Season 2, map-6)
            this.updateBack(room, roomId);

            // 4p. INFINITY TNT (Season 2, map-7)
            this.updateTnt(room, roomId);

            // 4q. IRON GIANT (Season 2, map-8)
            this.updateRobot(room, roomId);

            // 4r. ROAD TO SKYLAND (Season 2, map-9): ranets avtomati, jarlik
            this.updateVend(room, roomId);

            // 4s. SKY BATTLE (Season 2, map-10): osmondagi jang
            this.updateSky(room, roomId);

            // 4t. NO MORE FRIENDS (bonus, PvP): qayta tug'ilish
            this.updatePvp(room, roomId);

            // 4v. SEHRGAR TORNADOLARI
            this.updateTornadoes(room);

            // 4u. MY FARM (bonus): o'yinchilar o'zgarsa (kirdi/chiqdi) - maydonlar qayta yuboriladi
            if (room.myFarm) {
                const mf = room.myFarm;
                mf.tick++;
                const sig = room.hostId + '|' + Object.keys(room.players).length;
                if (sig !== mf.sig || mf.tick % 150 === 0) this.roomManager.sendMyFarm(roomId);
                this.roomManager.tickFishing(roomId);
                if (mf.tick % 2000 === 0) this.roomManager.farmTouch(roomId);   // har minutda: host shu yerda (qo'ziqorinlar chiqmasin)
                this.updateMyFarmWorld(room, roomId);
            }

            // 4b. MAG'LUBIYAT SHARTI: agar xonadagi BARCHA o'yinchilar arvoh
            // (o'lik) bo'lib qolsa, o'yin "O'YIN TUGADI" bilan yakunlanadi
            if (!room.isOver) {
                const allPlayers = Object.values(room.players);
                const allDead = allPlayers.length > 0 && allPlayers.every(p => p.isDead) && !room.pvp && !room.myFarm;
                if (allDead) {
                    this.roomManager.declareGameOverLoss(roomId).catch(err => {
                        console.error('declareGameOverLoss xatosi:', err);
                    });
                }
            }

            // 5. HOLATNI LOBBIGA BROADCAST QILISh (har BROADCAST_EVERY tikda)
            if (this.frame % this.BROADCAST_EVERY !== 0 && !room.flushNow) return;
            room.flushNow = false;
            const players: { [id: string]: object } = {};
            Object.values(room.players).forEach(p => {
                players[p.id] = {
                    x: p.x, y: p.y, hp: p.hp, maxHp: p.maxHp || BASE_HP, stamina: p.stamina, kills: p.kills, isDead: p.isDead,
                    respawnTimer: p.respawnTimer, speedMultiplier: p.speedMultiplier, isInvisible: p.isInvisible,
                    isHoldingAbility: p.isHoldingAbility, characterType: p.characterType, color: p.color,
                    weaponColor: p.weaponColor, look: p.look || '', nickname: p.nickname, apples: p.apples,
                    level: p.level || 0, maxStamina: p.maxStamina || 100, weaponMode: p.weaponMode || 'main', shieldCd: Math.ceil((p.shieldCd || 0) * 0.03),
                    tornadoCd: Math.ceil((p.tornadoCd || 0) * 0.03),
                    special: (p.specialTicks || 0) > 0, specialCd: Math.ceil((p.specialCooldown || 0) * this.TICK_SECONDS),
                    ammo: p.ammo ?? 0, maxAmmo: shotgunMagOf(p), reloading: (p.reloadTicks || 0) > 0, reloadSec: Math.ceil((p.reloadTicks || 0) * this.TICK_SECONDS),
                    acid: (p.acidTicks || 0) > 0,
                    curseA: !!p.acidCurse, curseB: !!p.boltCurse, jet: !!p.jetpack,
                    isAdmin: !!p.isAdmin
                };
            });
            this.io.to(roomId).emit('gameStateUpdate', {
                round: room.round || 0,
                players,
                bots: room.bots,
                bullets: room.bullets,
                snake: room.snake,
                crates: room.crates,
                coins: room.coins,
                mines: room.mines,
                wallIds: room.walls.map(w => w.id),
                apples: room.apples,
                doorOpen: !!room.doorOpen,
                boss: room.boss || null,
                flyingMines: room.flyingMines || [],
                redBoxes: room.redBoxes || [],
                stones: room.stones || [],
                tornadoes: (room.tornadoes || []).map(tr => ({ id: tr.id, x: Math.round(tr.x), y: Math.round(tr.y), t: tr.t })),
                // Toshlar tebranishi uchun server vaqti: klient toshni o'zi har kadr silliq hisoblaydi
                stonesT: room.stones && room.stones.length ? (room.levelTicks || 0) * 30 : null,
                gorilla: room.gorilla || null,
                fatElf: room.fatElf || null,
                acid: room.acid || [],
                flowers: room.flowers || [],
                gflower: room.gflower ? { state: room.gflower.state, hp: room.gflower.hp, maxHp: room.gflower.maxHp, hx: Math.round(room.gflower.hx), hy: Math.round(room.gflower.hy),
                    side: room.gflower.side, hitFlash: room.gflower.hitFlash, bite: room.gflower.bite ? room.gflower.bite.phase : null,
                    whip: room.gflower.whip ? { plat: room.gflower.whip.plat, phase: room.gflower.whip.phase, x0: room.gflower.whip.x0, x1: room.gflower.whip.x1, y: room.gflower.whip.y } : null } : null,
                robot: room.robot ? { state: room.robot.state, hp: room.robot.hp, maxHp: room.robot.maxHp, hitFlash: room.robot.hitFlash,
                    fist: { x: Math.round(room.robot.fist.x), y: Math.round(room.robot.fist.y), phase: room.robot.fist.phase, tx: Math.round(room.robot.fist.tx), ty: Math.round(room.robot.fist.ty) },
                    laser: room.robot.laser ? { x1: Math.round(room.robot.laser.x1), y1: Math.round(room.robot.laser.y1), x2: Math.round(room.robot.laser.x2), y2: Math.round(room.robot.laser.y2), phase: room.robot.laser.phase } : null,
                    act: room.robot.act ? room.robot.act.kind : null,
                    bolts: room.robot.bolts.map(b => ({ id: b.id, x: Math.round(b.x), y: Math.round(b.y), vx: Math.round(b.vx), vy: Math.round(b.vy) })) } : null,
                tnt: room.tnt ? { state: room.tnt.state, hp: room.tnt.hp, maxHp: room.tnt.maxHp, hitFlash: room.tnt.hitFlash, fuse: room.tnt.state === 'fuse' ? Math.ceil(room.tnt.timer * 30 / 1000) : 0,
                    gor: { x: Math.round(room.tnt.gor.x), y: Math.round(room.tnt.gor.y), facing: room.tnt.gor.facing, act: room.tnt.gor.act },
                    bombs: room.tnt.bombs.map(b => ({ id: b.id, x: Math.round(b.x), y: Math.round(b.y), kind: b.kind })),
                    warns: room.tnt.warns } : null,
                pvp: room.pvp ? { shield: Object.keys(room.pvp.shieldUntil).filter(id => room.pvp!.shieldUntil[id] > room.pvp!.tick),
                    respawn: Object.fromEntries(Object.entries(room.pvp.respawnAt).map(([id, t]) => [id, Math.max(0, Math.ceil((t - room.pvp!.tick) * 30 / 1000))])), win: getMapById(room.selectedLevel).pvp!.killsToWin } : null,
                sky: room.sky ? { state: room.sky.state, wave: room.sky.wave,
                    enemies: room.sky.enemies.map(e => ({ id: e.id, x: Math.round(e.x), y: Math.round(e.y), hp: e.hp, maxHp: e.maxHp, f: e.facing, hf: e.hitFlash > 0 ? 1 : 0 })),
                    shots: room.sky.shots.map(s => ({ id: s.id, x: Math.round(s.x), y: Math.round(s.y), vx: Math.round(s.vx), vy: Math.round(s.vy) })),
                    strikes: room.sky.strikes.map(s => ({ id: s.id, x: Math.round(s.x), phase: s.phase })),
                    boss: room.sky.boss ? { x: Math.round(room.sky.boss.x), y: Math.round(room.sky.boss.y), hp: room.sky.boss.hp, maxHp: room.sky.boss.maxHp,
                        hf: room.sky.boss.hitFlash > 0 ? 1 : 0, f: room.sky.boss.facing, act: room.sky.boss.act } : null } : null,
                vend: room.vend ? { state: room.vend.state, hp: room.vend.hp, maxHp: room.vend.maxHp, x: Math.round(room.vend.x), y: Math.round(room.vend.y),
                    facing: room.vend.facing, hitFlash: room.vend.hitFlash, shield: room.vend.shieldFlash > 0, vuln: this.vendVulnerable(room.vend),
                    act: room.vend.act ? room.vend.act.kind : null, phase: room.vend.act ? room.vend.act.phase : null, legK: room.vend.legK === undefined ? 1 : Math.round(room.vend.legK * 100) / 100,
                    landX: room.vend.act && room.vend.act.landX !== null ? Math.round(room.vend.act.landX) : null, jets: room.vend.jets, flyId: room.vend.flyId } : null,
                back: room.back ? { state: room.back.state, barrels: room.back.barrels.map(b => ({ id: b.id, x: Math.round(b.x), y: Math.round(b.y), dir: b.dir })) } : null,
                doors: room.doors ? {
                    state: room.doors.state, choice: room.doors.choice, segment: room.doors.segment, sub: room.doors.sub,
                    wave: room.doors.wave ? { safes: room.doors.wave.safes, phase: room.doors.wave.phase,
                        rocks: room.doors.wave.phase === 'warn' ? room.doors.wave.rocks.map(r => ({ x: r.x, y: Math.round(r.y), r: r.r })) : [] } : null,
                    monster: room.doors.monster && room.doors.monster.pose !== 'hidden' ? { x: Math.round(room.doors.monster.x), y: Math.round(room.doors.monster.y),
                        pose: room.doors.monster.pose, facing: room.doors.monster.facing } : null,
                    floorOpen: room.doors.floorOpen,
                    hands: room.doors.hands.map(h => ({ id: h.id, x: Math.round(h.x), y: h.y, side: h.side, phase: h.phase })),
                    heads: room.doors.heads.map((h, i) => h.phase === 'idle' ? null : { i, phase: h.phase }).filter(Boolean),
                    swallowed: room.doors.swallowed.map(w => ({ id: w.id, i: w.hole })),
                    shrooms: room.doors.shrooms.map(m => ({ id: m.id, x: Math.round(m.x), y: Math.round(m.y), hp: m.hp, f: m.facing, air: m.air, fl: m.flash }))
                } : null,
                squid: room.squid ? { state: room.squid.state, hp: room.squid.hp, maxHp: room.squid.maxHp, x: Math.round(room.squid.x), eyeY: Math.round(room.squid.eyeY),
                    hitFlash: room.squid.hitFlash, slam: room.squid.slam ? { plat: room.squid.slam.plat, phase: room.squid.slam.phase, x0: room.squid.slam.x0, x1: room.squid.slam.x1, y: room.squid.slam.y } : null,
                    geysers: room.squid.geysers.map(g => ({ id: g.id, x: g.x, topY: g.topY, phase: g.phase })),
                    fish: room.squid.fish.map(f => ({ id: f.id, x: Math.round(f.x), y: Math.round(f.y), vx: Math.round(f.vx), vy: Math.round(f.vy) })),
                    splashX: room.squid.splashX } : null,
                farm: room.farm ? { state: room.farm.state, kills: room.farm.kills, target: room.farm.target,
                    rooted: Object.keys(room.farm.rooted).map(id => ({ id, x: Math.round(room.players[id]?.x ?? 0) })) } : null,
                lift: room.lift ? { state: room.lift.state, y: Math.round(room.lift.y), progress: this.liftProgress(room) } : null,
                gfThorns: room.gfThorns || [],
                gfRoots: (room.gfRoots || []).map(r => ({ id: r.id, x: r.x, y: r.y, phase: r.phase })),
                arena: room.arena ? { kills: room.arena.kills, sinceBoss: room.arena.sinceBoss, boss: room.arena.boss, bossesBeaten: room.arena.bossesBeaten } : null,
                uwTalk: room.uwTalk || null,
                gPlats: room.gPlats || [],
                gSpikes: room.gSpikes || [],
                gRocks: room.gRocks || [],
                arenaTriggered: !!room.arenaTriggered,
                botsKilled: room.botsKilled,
                checkpointReached: room.checkpointReached
            });
        });

        // Chiqib ketgan o'yinchilarning tezlik yozuvlarini tozalaymiz
        for (const id of this.playerMotion.keys()) {
            if (!seenPlayers.has(id)) this.playerMotion.delete(id);
        }
    }

    // O'YINCHI QAYERGA QO'NADI: hozirgi tezligi va gravitatsiya bo'yicha
    // traektoriyani oldinga "o'ynab" ko'ramiz - birinchi kesib o'tadigan
    // sirt (yuqoridan pastga tushayotganda) - qo'nish joyi
    private predictLanding(surfaces: Surface[], x: number, y: number, vx: number, vy: number): Surface {
        const mapWidth = surfaces[0].xEnd;
        for (let i = 0; i < 150; i++) {
            const prevY = y;
            vy += this.GRAVITY * this.TICK_SECONDS;
            x = Math.max(0, Math.min(mapWidth, x + vx * this.TICK_SECONDS));
            y += vy * this.TICK_SECONDS;
            if (vy > 0) {
                let land: Surface | null = null;
                for (const s of surfaces) {
                    if (x >= s.xStart && x <= s.xEnd && s.standY >= prevY && s.standY <= y &&
                        (!land || s.standY < land.standY)) land = s;
                }
                if (land) return land;
            }
        }
        return this.findLandingSurface(surfaces, x, y);
    }

    // Joriy xaritadagi barcha "tura oladigan" sirtlarni (yer + har bir
    // platforma) ro'yxat qilib beradi - botlar shu ro'yxat bo'yicha qaysi
    // platformaga chiqishi kerakligini aniqlaydi
    private getMapSurfaces(room: RoomState): Surface[] {
        const map = getMapById(room.selectedLevel);
        // Yerning "osti" yo'q (-Infinity) - aks holda yerdan sakragan bot
        // birinchi tikdayoq yerning "ostiga boshi urildi" deb qaytib tushardi
        const surfaces: Surface[] = [{ xStart: 0, xEnd: map.mapWidth, standY: this.GROUND_Y, underY: -Infinity }];
        map.platforms.forEach(p => {
            surfaces.push({
                xStart: p.x,
                xEnd: p.x + p.w,
                standY: p.y - this.BOT_HALF_H,
                underY: p.y + p.h + this.BOT_HALF_H,
                thin: p.h <= 14
            });
        });
        // Lift: platforma ham sirt; ko'tarilayotganda pastda yer yo'q - tushib ketgan bot yo'qoladi
        if (map.lift && room.lift && room.lift.state !== 'hidden' && room.lift.state !== 'emerge') {
            const L = map.lift;
            surfaces.push({ xStart: L.x, xEnd: L.x + L.w, standY: room.lift.y - this.BOT_HALF_H, underY: room.lift.y + 20 + this.BOT_HALF_H, thin: true });
            if (room.lift.state === 'rising' || room.lift.state === 'arrived' || room.lift.state === 'done') surfaces[0].standY = 5000;
        }
        // Arena: tosh platformalar gorilla platformalari (room.gPlats) - botlar ham ularga chiqadi.
        // Joriy balandligi olinadi; shiftga ko'tarilgan/qaytayotgan platforma hisobga olinmaydi
        if (map.arena && map.gorilla) {
            (room.gPlats || []).forEach((g, i) => {
                if (g.state !== 'idle') return;
                const h = map.gorilla!.platforms[i]?.h ?? 14;
                surfaces.push({ xStart: g.x, xEnd: g.x + g.w, standY: g.y - this.BOT_HALF_H, underY: g.y + h + this.BOT_HALF_H, thin: true });
            });
        }
        return surfaces;
    }

    // Bot yon tomonga X'ga o'tsa, platformaga uriladimi: yoki uning ICHIGA
    // tushadi, yoki pastidan sakrab ko'tarilayotgan bo'lsa - shu sakrashda
    // uning OSTIGA boshi urilardi. Ikkinchisi muhim: aks holda bot platforma
    // chetidan sakrab, hali yetarlicha ko'tarilmasdan ostiga kirib qolib,
    // boshini urib yiqilar va hech qachon ustiga chiqa olmas edi
    private blockedAt(surfaces: Surface[], x: number, bot: BotState): boolean {
        const apexY = bot.vy < 0 ? bot.y - (bot.vy * bot.vy) / (2 * this.GRAVITY) : bot.y;
        for (let i = 1; i < surfaces.length; i++) {
            const s = surfaces[i];
            if (x < s.xStart || x > s.xEnd) continue;
            if (s.thin && bot.kind === 'dog') continue;
            // Allaqachon shu platforma ostida/yonida (X oralig'ida) bo'lsa - undan
            // CHIQIB ketishiga to'sqinlik qilmaymiz, faqat tashqaridan KIRISHni to'samiz
            if (bot.x >= s.xStart && bot.x <= s.xEnd) continue;
            if (bot.y > s.standY && bot.y < s.underY) return true;
            if (bot.y >= s.underY && apexY < s.underY) return true;
        }
        return false;
    }

    // Bot AYNAN shu (x, y) da turgan sirt (oyog'i ostida) - havoda bo'lsa null
    private surfaceUnder(surfaces: Surface[], x: number, y: number): Surface | null {
        for (const s of surfaces) {
            if (s.standY === y && x >= s.xStart && x <= s.xEnd) return s;
        }
        return null;
    }

    private horizontalGap(a: Surface, b: Surface): number {
        return Math.max(0, b.xStart - a.xEnd, a.xStart - b.xEnd);
    }

    // YO'L TOPISH: joriy sirtdan raqib turgan sirtga qaysi platformalar orqali
    // borish kerak (BFS) - qaytaradi: KEYINGI qadamdagi sirt. Tepaga faqat bir
    // sakrashda yetsa, yonga - MAX_JUMP_GAP_X gacha sakrab o'tadi, pastga -
    // chetidan tushadi. Yetib bo'lmasa - null
    private nextStepSurface(surfaces: Surface[], from: Surface, to: Surface, jumpV: number = this.MAX_JUMP_V): Surface | null {
        if (from === to) return to;
        const maxRise = (jumpV * jumpV) / (2 * this.GRAVITY) - this.JUMP_MARGIN;
        const prev = new Map<Surface, Surface>();
        const seen = new Set<Surface>([from]);
        const queue: Surface[] = [from];
        while (queue.length > 0) {
            const cur = queue.shift()!;
            if (cur === to) break;
            for (const nxt of surfaces) {
                if (seen.has(nxt)) continue;
                const rise = cur.standY - nxt.standY;
                if (rise > maxRise || this.horizontalGap(cur, nxt) > this.MAX_JUMP_GAP_X) continue;
                seen.add(nxt);
                prev.set(nxt, cur);
                queue.push(nxt);
            }
        }
        if (!seen.has(to)) return null;
        let step = to;
        while (prev.get(step) !== from) step = prev.get(step)!;
        return step;
    }

    // KO'K OLOVNI YOQISH: maqsad platforma tepada va unga BIR oddiy sakrashda
    // yetib bo'lmasa (pog'onama-pog'ona sakrash kerak bo'lsa), bot platforma
    // CHETI YONIGA boradi va o'sha yerdan tik uchib chiqadi. Uchish yo'lida
    // boshqa platforma bo'lsa (boshi urilardi) - o'sha chetdan uchmaydi.
    // true qaytarsa - bu tikdagi harakatni shu funksiya o'zi bajardi
    private tryStartJet(bot: BotState, surfaces: Surface[], here: Surface, goal: Surface, towardX: number): boolean {
        if (bot.kind === 'dog') return false; // itda ko'k olov yo'q - faqat sakraydi
        if (goal.standY >= here.standY) return false;
        if (this.nextStepSurface(surfaces, here, goal) === goal) return false; // oddiy sakrash yetarli

        const hoverY = goal.standY - this.JET_HOVER_ABOVE;
        const mapWidth = surfaces[0].xEnd;
        const columnClear = (x: number) => !surfaces.some((s, i) =>
            i > 0 && s !== goal && x >= s.xStart && x <= s.xEnd && s.underY > hoverY && s.standY < here.standY);
        const takeoffs = [goal.xStart - this.TAKEOFF_OFFSET, goal.xEnd + this.TAKEOFF_OFFSET].filter(x =>
            x >= here.xStart && x <= here.xEnd &&
            x >= this.BOT_HALF_W && x <= mapWidth - this.BOT_HALF_W && columnClear(x));
        if (takeoffs.length === 0) return false;

        // Ikki chetdan qaysi biri: botga yaqinrog'i (teng bo'lsa - raqibga yaqinrog'i)
        const takeoffX = takeoffs.reduce((a, b) => {
            const da = Math.abs(a - bot.x), db = Math.abs(b - bot.x);
            if (Math.abs(da - db) > 1) return da < db ? a : b;
            return Math.abs(a - towardX) <= Math.abs(b - towardX) ? a : b;
        });
        if (Math.abs(bot.x - takeoffX) >= 1) {
            this.moveToward(bot, takeoffX, surfaces);
            return true;
        }
        bot.jetGoalY = hoverY;
        bot.isJetting = true;
        bot.jetTimer = 0;
        bot.vy = -1;
        bot.jumpTargetX = takeoffX < goal.xStart ? goal.xStart + 20 : goal.xEnd - 20;
        return true;
    }

    private stopJet(bot: BotState): void {
        bot.jetGoalY = null;
        bot.isJetting = false;
        bot.jetTimer = 0;
        bot.vy = 0; // tayanch yo'q - keyingi tikdan oddiy gravitatsiya bilan tushib, qo'nadi
    }

    private jump(bot: BotState, rise: number, targetX: number): void {
        const maxV = bot.kind === 'dog' ? this.DOG_JUMP_V : this.MAX_JUMP_V;
        bot.vy = -Math.min(maxV, Math.sqrt(2 * this.GRAVITY * Math.max(0, rise + this.JUMP_MARGIN)));
        bot.jumpTargetX = targetX;
    }

    // Yon tomonga yurish - platformaning YONIDAN ichiga kira olmaydi (sakrab
    // chiqayotganda avval platformadan balandroq ko'tarilishi kerak)
    private moveToward(bot: BotState, x: number, surfaces: Surface[]): void {
        const dx = x - bot.x;
        if (Math.abs(dx) < 1) return;
        const speed = bot.skin === 'zombie' ? 2.6 : bot.skin === 'sprout' ? ((bot.slowTicks || 0) > 0 ? this.DOG_SLOW_SPEED : 3.7)
            : bot.kind === 'dog' ? ((bot.slowTicks || 0) > 0 ? this.DOG_SLOW_SPEED : this.DOG_SPEED) : this.BOT_SPEED;
        const newX = bot.x + Math.sign(dx) * Math.min(speed, Math.abs(dx));
        if (!this.blockedAt(surfaces, newX, bot)) bot.x = newX;
    }

    // Berilgan (x, y) nuqtadan pastga tushilsa, qaysi sirtga "qo'nish"ni topadi:
    // shu X'ni qamrab oluvchi, y'dan pastda (yoki aynan shu y'da) turgan
    // sirtlardan ENG YUQORISI. Yer butun xarita bo'ylab cho'zilgani uchun
    // har doim kamida yer topiladi.
    private findLandingSurface(surfaces: Surface[], x: number, y: number): Surface {
        let best = surfaces[0];
        surfaces.forEach(s => {
            if (x >= s.xStart && x <= s.xEnd && s.standY >= y && s.standY < best.standY) best = s;
        });
        return best;
    }

    // Platformadan tushish uchun chiqish nuqtasi: chetdan biroz tashqarida,
    // raqibga yaqinroq tomonda. Xarita chegarasiga taqalgan chet tanlanmaydi
    // (u yerdan tushib bo'lmaydi - bot devorga tiqilib qolardi)
    private platformExitX(platform: Surface, towardX: number, mapWidth: number): number {
        const clampX = (x: number) => Math.max(this.BOT_HALF_W, Math.min(mapWidth - this.BOT_HALF_W, x));
        const exits = [clampX(platform.xStart - 12), clampX(platform.xEnd + 12)]
            .filter(x => x < platform.xStart || x > platform.xEnd);
        if (exits.length === 0) return towardX;
        return exits.reduce((a, b) => Math.abs(a - towardX) <= Math.abs(b - towardX) ? a : b);
    }

    private botRect(bot: BotState) {
        if (bot.kind === 'dog') {
            return { x: bot.x - this.DOG_HALF_W, y: bot.y + this.BOT_HALF_H - this.DOG_HIT_H, w: this.DOG_HALF_W * 2, h: this.DOG_HIT_H };
        }
        return { x: bot.x - this.BOT_HALF_W, y: bot.y - this.BOT_HALF_H, w: this.BOT_HALF_W * 2, h: this.BOT_HALF_H * 2 };
    }

    private updateBots(room: RoomState): void {
        const allSurfaces = this.getMapSurfaces(room);
        const groundOnly = [allSurfaces[0]];

        room.bots.forEach((bot) => {
            // Zombi platformalarni "bilmaydi" - faqat yerda yuradi, tepadagini pastda kutadi
            const surfaces = bot.skin === 'zombie' ? groundOnly : allSurfaces;
            // Qalqon holati taymerini kamaytirish (block tugasa avtomatik tushiriladi)
            if (bot.isBlocking) {
                bot.blockTimer--;
                if (bot.blockTimer <= 0) bot.isBlocking = false;
            }
            if (bot.isAttacking) {
                bot.attackAnimTimer--;
                if (bot.attackAnimTimer <= 0) bot.isAttacking = false;
            }
            if (bot.attackCooldown > 0) bot.attackCooldown--;
            if ((bot.slowTicks || 0) > 0) bot.slowTicks!--;
            if ((bot.emerge || 0) > 0) { bot.emerge!--; return; }
            if (bot.tongue) return;   // zombi-sabzavot igna-til sanchayapti - joyida turadi

            // FIZIKA: tayanch bo'lmasa - gravitatsiya bilan tushadi. Platformalar
            // "bir tomonlama": pastdan sakrab o'tib ketadi, faqat TUSHAYOTGANDA
            // (vy > 0) ustiga qo'nadi - o'yinchi sakrab chiqqandek
            const support = bot.vy === 0 ? this.surfaceUnder(surfaces, bot.x, bot.y) : null;
            if (bot.jetGoalY !== null) {
                // KO'K OLOV: gravitatsiyasiz, bir tekis tepaga ko'tariladi, maqsad
                // balandligida "osilib" turadi (platforma ustiga surilguncha)
                bot.jetTimer++;
                bot.y = Math.max(bot.jetGoalY, bot.y - this.JET_SPEED * this.TICK_SECONDS);
                bot.vy = -1; // havoda - "tayanchda turibdi" deb hisoblanmasin
                if (bot.jetTimer > this.JET_MAX_TICKS) this.stopJet(bot);
            } else if (!support) {
                const prevY = bot.y;
                bot.vy += this.GRAVITY * this.TICK_SECONDS;
                bot.y += bot.vy * this.TICK_SECONDS;
                if (bot.vy < 0) {
                    // Pastdan platformaga boshi urildi - o'tib ketmaydi, qaytib tushadi
                    for (const s of surfaces) {
                        if (s.thin && bot.kind === 'dog') continue;
                        if (bot.x >= s.xStart && bot.x <= s.xEnd && prevY >= s.underY && bot.y < s.underY) {
                            bot.y = s.underY;
                            bot.vy = 1; // 0 emas - aks holda "tayanchda turibdi" deb o'ylanardi
                        }
                    }
                } else if (bot.vy > 0) {
                    let land: Surface | null = null;
                    for (const s of surfaces) {
                        if (bot.x >= s.xStart && bot.x <= s.xEnd && s.standY >= prevY && s.standY <= bot.y &&
                            (!land || s.standY < land.standY)) land = s;
                    }
                    if (land) {
                        bot.y = land.standY;
                        bot.vy = 0;
                        bot.jumpTargetX = null;
                    }
                }
            }

            // Agar bot muzlagan bo'lsa qotib turadi (qalqon/hujum holati ham o'zgarmaydi)
            if (bot.freezeDuration > 0) {
                bot.freezeDuration--;
                if (bot.jetGoalY !== null) this.stopJet(bot); // muzlasa olov o'chadi, pastga tushadi
                return;
            }

            // AQLLI RAQIB TANLASH: har bir bot O'ZI uchun bitta raqib tanlab, uni
            // (o'lmaguncha yoki ko'rinmas bo'lmaguncha) izma-iz ta'qib qiladi - har
            // tikda tasodifiy almashtirib yubormaydi, shu bilan "qat'iyatli" ko'rinadi
            let target: PlayerState | null = bot.targetPlayerId ? (room.players[bot.targetPlayerId] || null) : null;
            if (target && (target.isInvisible || target.isDead)) target = null;

            // Raqib vaqti-vaqti bilan qayta tanlanadi (har ~2.5-3.4 s): masofa + shu o'yinchini allaqachon nechta bot
            // quvayotgani hisobga olinadi - botlar hammasi bitta o'yinchiga yopishib qolmay, o'yinchilar orasida
            // bo'linadi. Almashish faqat boshqasi sezilarli qulayroq bo'lsa (har tikda u yoqdan-bu yoqqa sakramasin)
            bot.retargetTimer = (bot.retargetTimer || 0) - 1;
            if (!target || bot.retargetTimer <= 0) {
                bot.retargetTimer = 85 + Math.floor(Math.random() * 30);
                const chasing: { [id: string]: number } = {};
                room.bots.forEach(b => { if (b !== bot && b.targetPlayerId) chasing[b.targetPlayerId] = (chasing[b.targetPlayerId] || 0) + 1; });
                const score = (pl: PlayerState) => Math.hypot(pl.x - bot.x, pl.y - bot.y) + 220 * (chasing[pl.id] || 0);
                let best: PlayerState | null = null, bestScore = Infinity;
                Object.values(room.players).forEach((pl) => {
                    if (pl.isInvisible || pl.isDead) return;
                    const sc = score(pl);
                    if (sc < bestScore) { bestScore = sc; best = pl; }
                });
                if (best && (!target || bestScore < score(target) - 120)) target = best;
                bot.targetPlayerId = target ? (target as PlayerState).id : null;
            }

            if (!target) {
                bot.windupTimer = 0;
                return;
            }
            const p = target as PlayerState;
            bot.facingLeft = bot.x > p.x;

            // O'yinchi markazi (yarim balandligi 24) ni bot markazi (20) ga
            // o'giramiz. Raqibning "sirti" - u turgan yoki sakrab QO'NADIGAN joy
            // (kichik zaxira bilan) - sakrash paytida bot rejasi o'zgarib turmasin
            const pAsBotY = p.y + this.PLAYER_HALF_H - this.BOT_HALF_H;
            const targetSurface = this.findLandingSurface(surfaces, p.x, pAsBotY - 6);
            const targetAirborne = pAsBotY < targetSurface.standY - 25;
            if (!targetAirborne) bot.jumpReacted = false;

            // OLDINDAN KO'RISH: o'yinchi sakragan bo'lsa (masalan, bir platformadan
            // boshqasiga), bot u hozir turgan joyga emas, QO'NADIGAN joyiga yo'l
            // oladi - uning ortidan darhol sakraydi, u qo'nguncha kutib turmaydi.
            // Joyida tik sakrasa - qo'nish joyi o'sha platforma, bot sakramaydi
            const motion = this.playerMotion.get(p.id);
            const playerInAir = pAsBotY < targetSurface.standY - 3;
            const goalSurface = playerInAir && motion
                ? this.predictLanding(surfaces, p.x, pAsBotY, motion.vx, motion.vy)
                : targetSurface;

            // HARAKAT. Qilich ko'tarilganda va zarbadan keyin biroz - joyida
            // to'xtab turadi (yugurib ketayotib urmaydi)
            const isDog = bot.kind === 'dog';
            const cooldownTicks = isDog ? this.DOG_ATTACK_COOLDOWN_TICKS : this.BOT_ATTACK_COOLDOWN_TICKS;
            const strikePause = (bot.windupTimer > 0 && !isDog) ||
                bot.attackCooldown > cooldownTicks - (isDog ? this.DOG_STRIKE_PAUSE_TICKS : this.BOT_STRIKE_PAUSE_TICKS);
            const here = bot.vy === 0 ? this.surfaceUnder(surfaces, bot.x, bot.y) : null;
            const mapWidth = surfaces[0].xEnd;
            if (bot.jetGoalY !== null) {
                // Uchmoqda: avval TIK ko'tariladi (yon tomonga surilmaydi - aks holda
                // platforma ostiga kirib qolardi), balandlikka yetgach ustiga suriladi
                // va olovni o'chiradi - qolgan 20px ni odatdagidek tushib, qo'nadi
                if (bot.y === bot.jetGoalY && bot.jumpTargetX !== null) {
                    this.moveToward(bot, bot.jumpTargetX, surfaces);
                    if (Math.abs(bot.x - bot.jumpTargetX) < 1) this.stopJet(bot);
                }
            } else if (!here) {
                // Havoda: sakrash paytida belgilangan tomonga siljiydi
                if (bot.jumpTargetX !== null) this.moveToward(bot, bot.jumpTargetX, surfaces);
            } else if (strikePause) {
                // Joyida turadi
            } else if (this.tryStartJet(bot, surfaces, here, goalSurface, p.x)) {
                // Ko'k olov yoqildi - keyingi tiklarda uchadi
            } else {
                const step = this.nextStepSurface(surfaces, here, goalSurface, isDog ? this.DOG_JUMP_V : this.MAX_JUMP_V);
                // IT: shox ingichka - chetiga aylanib o'tirmay, uning OSTIGA (turgan joyidan
                // yetib boriladigan qismiga) yugurib borib, tik sakraydi va raqib tomonga qo'nadi.
                // Turgan sirti shox bilan ustma-ust tushmasa - odatdagidek chetdan yonga sakraydi
                const underLo = step ? Math.max(step.xStart, here.xStart) + 12 : 0;
                const underHi = step ? Math.min(step.xEnd, here.xEnd) - 12 : -1;
                if (isDog && step && step !== here && step.thin && step.standY < here.standY && underLo <= underHi) {
                    const underX = Math.max(step.xStart + 12, Math.min(step.xEnd - 12, p.x));
                    const aimX = Math.max(underLo, Math.min(underHi, bot.x));
                    if (Math.abs(bot.x - aimX) <= this.DOG_SPEED) {
                        this.jump(bot, here.standY - step.standY, underX);
                    } else {
                        this.moveToward(bot, aimX, surfaces);
                    }
                } else if (step && step.standY > here.standY) {
                    // Raqib PASTDA: raqibga yaqinroq CHETDAN yurib tushadi
                    const towardX = Math.max(step.xStart, Math.min(step.xEnd, p.x));
                    this.moveToward(bot, this.platformExitX(here, towardX, mapWidth), surfaces);
                } else if (step && step !== here) {
                    // Raqib TEPADA (yoki yondagi platformada): SAKRAB chiqadi.
                    // Platformaning OSTIDAN emas (u qattiq - boshi uriladi), balki
                    // CHETI YONIDAN sakraydi, ustiga chiqqach chetiga yaqin qo'nadi
                    const rise = here.standY - step.standY;
                    const inMap = (x: number) => x >= this.BOT_HALF_W && x <= mapWidth - this.BOT_HALF_W;
                    const onHere = (x: number) => x >= here.xStart && x <= here.xEnd;
                    const overlapsHere = Math.max(here.xStart, step.xStart) <= Math.min(here.xEnd, step.xEnd);
                    if (overlapsHere) {
                        const takeoffs = [step.xStart - this.TAKEOFF_OFFSET, step.xEnd + this.TAKEOFF_OFFSET]
                            .filter(x => onHere(x) && inMap(x));
                        if (takeoffs.length > 0) {
                            const takeoffX = takeoffs.reduce((a, b) => Math.abs(a - bot.x) <= Math.abs(b - bot.x) ? a : b);
                            const landX = takeoffX < step.xStart ? step.xStart + 20 : step.xEnd - 20;
                            if (Math.abs(bot.x - takeoffX) < 1) this.jump(bot, rise, landX);
                            else this.moveToward(bot, takeoffX, surfaces);
                        }
                    } else {
                        // Orada bo'shliq: chetigacha borib, yonga sakrab o'tadi
                        const goingRight = step.xStart > here.xEnd;
                        const edgeX = goingRight ? here.xEnd - 6 : here.xStart + 6;
                        if (Math.abs(bot.x - edgeX) <= (isDog ? this.DOG_SPEED : this.BOT_SPEED)) {
                            bot.vy = -(isDog ? this.DOG_JUMP_V : this.MAX_JUMP_V);
                            bot.jumpTargetX = goingRight ? step.xStart + 20 : step.xEnd - 20;
                        } else {
                            this.moveToward(bot, edgeX, surfaces);
                        }
                    }
                } else {
                    // Raqib bilan BIR sirtda (yoki unga yo'l yo'q - pastda kutadi)
                    let desiredX: number;
                    const contactX = (isDog && bot.skin !== 'sprout' ? this.DOG_HALF_W : this.BOT_HALF_W) + this.PLAYER_HALF_W + 2;
                    if (Math.abs(p.x - bot.x) > 60 && here.standY === this.GROUND_Y) {
                        // FORMATSIYA: uzoqda har bot o'z "joyi"ga intiladi - bir X'ga
                        // to'planib, bir-biriga urilib tebranmasligi uchun
                        desiredX = p.x + this.botFormationOffset(bot.id);
                    } else {
                        // Yaqinda: raqibning SHU tomonida, tanasiga tegib to'xtaydi -
                        // ichiga kirib, uni itarib yubormaydi
                        const spread = room.arena ? (Math.abs(this.botFormationOffset(bot.id)) / 24) * 5 : 0;
                        desiredX = p.x + (bot.x <= p.x ? -(contactX + spread) : contactX + spread);
                    }
                    // Platformada - chetidan tasodifan yiqilib tushmasin
                    if (here.standY !== this.GROUND_Y) {
                        desiredX = Math.max(here.xStart + 10, Math.min(here.xEnd - 10, desiredX));
                    }
                    this.moveToward(bot, desiredX, surfaces);

                    // YO'LNI TO'SISH: o'yinchi bot USTIDAN sakrab o'tayotgan bo'lsa,
                    // bot ba'zan (har safar emas) o'zi ham sakrab, yo'lini to'sadi.
                    // Har bir sakrashga faqat bir marta "qaror qiladi"
                    const overhead = targetAirborne && pAsBotY < bot.y - 15 && Math.abs(p.x - bot.x) < 90;
                    if (overhead && !bot.jumpReacted && bot.skin !== 'zombie') {
                        bot.jumpReacted = true;
                        if (Math.random() < this.BOT_INTERCEPT_CHANCE) {
                            this.jump(bot, bot.y - pAsBotY, p.x);
                        }
                    }
                }
            }

            // ZARBA: tegish endi jon olmaydi. Bot yaqin bo'lsa avval qilichini
            // ko'taradi (windup), so'ng uradi - zarba tushgan PAYTDA o'yinchi hali
            // yetib boradigan joyda bo'lsagina jon oladi
            // Kichkina gul rasmi itdan ancha tor - faqat haqiqatan yonida turganda tishlaydi
            const inReach = Math.abs(p.x - bot.x) <= (bot.skin === 'sprout' ? 42 : isDog ? this.DOG_REACH_X : this.BOT_ATTACK_REACH_X) &&
                            Math.abs(pAsBotY - bot.y) <= this.BOT_ATTACK_REACH_Y;
            if (bot.windupTimer > 0) {
                bot.windupTimer--;
                if (bot.windupTimer === 0) {
                    bot.attackCooldown = cooldownTicks;
                    if (isDog) bot.slowTicks = this.DOG_SLOW_TICKS; // tishladi - endi ~1s sekin
                    const shielded = p.characterType === 'knight' && p.isHoldingAbility;
                    if (inReach && !shielded) {
                        p.hp -= bot.skin === 'sprout' ? (getMapById(room.selectedLevel).giantFlower?.sproutBiteDamage ?? 12)
                            : bot.skin === 'zombie' ? (getMapById(room.selectedLevel).farm?.zombieDamage ?? 12)
                            : isDog ? this.DOG_ATTACK_DAMAGE : this.BOT_ATTACK_DAMAGE;
                        // O'YINCHI O'LDI: butun raund davomida arvoh holatiga o'tadi
                        if (p.hp <= 0 && !p.isDead) {
                            p.hp = 0;
                            p.isDead = true;
                            p.respawnTimer = 0;
                            p.isInvisible = false;
                            p.speedMultiplier = 1;
                            p.isHoldingAbility = false;
                            p.isHoldingAttack = false;
                            bot.targetPlayerId = null;
                        }
                    }
                }
            } else if (inReach && bot.attackCooldown === 0 && !bot.isBlocking) {
                const windup = isDog ? this.DOG_WINDUP_TICKS : this.BOT_WINDUP_TICKS;
                bot.windupTimer = windup;
                bot.isAttacking = true;
                bot.attackAnimTimer = windup + this.BOT_ATTACK_ANIM_TICKS;
                // It qahramonga qarab kichik SAKRAB tashlanadi (tishlash)
                if (isDog && bot.vy === 0) this.jump(bot, 12, p.x);
            }

            // REAKTIV QALQON: o'yinchi AYNAN SHU TIKDA hujum boshlagan bo'lsa,
            // yaqin atrofdagi bot "oldindan sezgandek" MA'LUM EHTIMOLLIK bilan
            // qalqon ko'taradi - har safar emas. Uzoqdagi bot javob bermaydi
            const inThreatRange = Math.abs(p.x - bot.x) < this.BOT_REACT_RANGE;
            if (!isDog && !bot.isBlocking && inThreatRange && bot.skin !== 'zombie') {
                const justAttacked = room.bullets.some(b => b.playerId === p.id && b.justSpawned);
                if (justAttacked && Math.random() < this.BOT_REACTIVE_BLOCK_CHANCE) {
                    bot.isBlocking = true;
                    bot.blockTimer = this.BOT_BLOCK_DURATION_TICKS;
                }
            }
        });

        // BOTLAR BIR-BIRINING ICHIGA KIRIB KETMASLIGI UCHUN
        // (ular orasidagi to'qnashuvni tekshirib, kerak bo'lsa ajratib qo'yamiz)
        if (!room.arena && !room.farm) this.resolveBotCollisions(room);

        // Itarish natijasida bot xaritadan tashqariga chiqib ketmasin
        const mapWidth = allSurfaces[0].xEnd;
        room.bots.forEach(bot => {
            bot.x = Math.max(this.BOT_HALF_W, Math.min(mapWidth - this.BOT_HALF_W, bot.x));
        });
    }

    // Bot ID'siga qarab BARQAROR (har doim bir xil) formatsiya siljishini hisoblaydi,
    // shu bot doim shu "joy"ga intiladi - masalan -48, -24, 0, +24 yoki +48 piksel
    private botFormationOffset(botId: string): number {
        let hash = 0;
        for (let i = 0; i < botId.length; i++) hash = (hash * 31 + botId.charCodeAt(i)) % 997;
        return ((hash % 5) - 2) * 24;
    }

    // Har bir bot juftligini tekshirib, agar ustma-ust tushsa, bir-biridan itarib ajratamiz
    private resolveBotCollisions(room: RoomState): void {
        const BOT_WIDTH = 32;

        for (let i = 0; i < room.bots.length; i++) {
            for (let j = i + 1; j < room.bots.length; j++) {
                const a = room.bots[i];
                const b = room.bots[j];

                const width = (a.kind === 'dog' || b.kind === 'dog') ? 52 : BOT_WIDTH;
                if (this.checkOverlap(
                    { x: a.x, y: a.y, w: width, h: BOT_WIDTH },
                    { x: b.x, y: b.y, w: width, h: BOT_WIDTH }
                )) {
                    const overlap = width - Math.abs(a.x - b.x);
                    if (overlap > 0) {
                        const push = overlap / 2;
                        if (a.x < b.x) {
                            a.x -= push;
                            b.x += push;
                        } else if (a.x > b.x) {
                            a.x += push;
                            b.x -= push;
                        } else {
                            // Aynan bir xil x'da bo'lsa, tasodifiy tomonlarga itaramiz
                            a.x -= push;
                            b.x += push;
                        }
                    }
                }
            }
        }
    }

    private updateBullets(room: RoomState): void {
        for (let i = room.bullets.length - 1; i >= 0; i--) {
            const bullet = room.bullets[i];
            // O'q bosib o'tgan YO'LNING boshlanishi: tez o'q (kamon - tikiga 30px) birinchi tikda
            // tekshirilmagani uchun yonidagi botning ustidan "sakrab" o'tib ketardi
            if (bullet.sx === undefined) { bullet.sx = bullet.x; bullet.sy = bullet.y; }
            bullet.x += bullet.vx * 0.03;
            bullet.y += bullet.vy * 0.03;
            bullet.lifetime--;

            let bulletDestroyed = false;

            // MUHIM: o'q hali "birinchi tik"da bo'lsa (yangi yaratilgan bo'lsa), to'qnashuvni
            // tekshirmaymiz - aks holda bot juda yaqin turganda o'q/qilich mijozga (client)
            // hech qachon ko'rinmay, zarar allaqachon berilib, o'sha zahoti o'chirilib ketardi.
            // Bir tik kutib turish (~30ms) klientga o'qni ko'rsatish uchun fursat beradi.
            if (bullet.justSpawned) {
                bullet.justSpawned = false;
                continue;
            }

            // Qilich/katana zarbalari uchun ancha kattaroq hitbox ishlatamiz,
            // chunki vizual tasvirdagi tig' uzun va yoysimon harakat qiladi -
            // kichik nuqta shaklidagi hitbox ko'p hollarda tegmay o'tib ketardi.
            // MUHIM: hitbox endi HAR DOIM o'q markazidan hisoblanadi (avval
            // faqat melee uchun markazlashtirilar edi, o'q/olov esa yuqori-chap
            // burchagidan hisoblanardi - shu nomuvofiqlik ba'zan o'q botga tegib
            // ham zarar bermay o'tib ketishiga sabab bo'lardi)
            const isMelee = bullet.bulletType === 'melee';
            const isTornado = bullet.bulletType === 'tornado';
            const hitW = isMelee ? 54 : isTornado ? 40 : 10;
            const hitH = isMelee ? 44 : isTornado ? 60 : 10;
            // Oldingi tekshirilgan joydan hozirgi joygacha (supurib o'tgan yo'l) - hech narsa "sakrab" o'tilmaydi
            const fx = bullet.sx ?? bullet.x, fy = bullet.sy ?? bullet.y;
            const hitX = Math.min(fx, bullet.x) - hitW / 2;
            const hitY = Math.min(fy, bullet.y) - hitH / 2;
            const hitRect = { x: hitX, y: hitY, w: hitW + Math.abs(bullet.x - fx), h: hitH + Math.abs(bullet.y - fy) };
            bullet.sx = bullet.x; bullet.sy = bullet.y;

            // Har bir o'q turiga qarab shaxsiy zarar miqdori (yangi balans)
            // + otgan o'yinchining hisobidagi "damage" ko'nikma darajasi (har daraja +15%, max +75%)
            const owner = room.players[bullet.playerId];
            const damageMultiplier = 1 + Math.min(owner?.damageLevel || 0, 5) * 0.15;
            let baseDamage = 20;
            if (bullet.bulletType === 'fireball') baseDamage = 30;       // Sehrgar: kuchli, lekin stamina tez ketadi
            if (bullet.bulletType === 'tornado') baseDamage = TORNADO.damage;   // Sehrgar tornadosi (har 0.4 s)
            else if (bullet.bulletType === 'arrow') baseDamage = 10;     // Kamonchi: yengil zarba
            else if (bullet.bulletType === 'melee') baseDamage = 20;     // Ritsar/Samuray: o'rtacha, stamina sekin ketadi
            if (bullet.bulletType === 'ice') baseDamage = 40;            // Mage muz shari: olovlidan +10 kuchli va muzlatadi
            else if (bullet.bulletType === 'pellet') baseDamage = 9 + (owner ? weaponUpgradeLevel(owner, 'shotgunDamage') * SHOTGUN_DMG_PER_LEVEL : 0);   // drobovik (+kuchaytirish)
            else if (bullet.bulletType === 'kunai') baseDamage = 22 + (owner ? weaponUpgradeLevel(owner, 'kunaiDamage') * KUNAI_DMG_PER_LEVEL : 0);      // kunai (+kuchaytirish)
            else if (bullet.bulletType === 'lightning') baseDamage = 26;   // 16-daraja: zanjirli chaqmoq (sakragani - 60%)
            else if (bullet.bulletType === 'shield') baseDamage = 45;      // 16-daraja: otilgan qalqon (10 s da bir)
            else if (bullet.bulletType === 'shuriken') baseDamage = 14;    // 16-daraja: har bir shuriken
            // + daraja imkoniyati "DAMAGE +5"
            const damage = baseDamage * damageMultiplier + (owner ? bonusDamageOf(owner) : 0);

            const map = getMapById(room.selectedLevel);

            // Devorga tegsa o'q to'xtaydi (devor ortidagi qutini sindirib bo'lmaydi)
            if (room.walls.some(w => this.checkOverlap(hitRect, w))) {
                bulletDestroyed = true;
            }

            // ROBOT-ILON: boshidan orqaga (chapga) butun tanasi - o'q/zarba tegsa jonini oladi
            if (!bulletDestroyed && room.boss && !room.boss.dead && room.snake && room.boss.wallBroken &&
                hitRect.x < room.snake.x && hitRect.x + hitRect.w > room.snake.x - 1200 && hitRect.y + hitRect.h > 330) {
                bulletDestroyed = true;
                this.damageBoss(room.boss, damage, bullet.playerId);
            }

            // TOSH GORILLA: tanasiga tegsa - jonini oladi
            const gor = room.gorilla;
            const gdef = map.gorilla;
            const gorFighting = gor && gor.state !== 'intro' && gor.state !== 'defeat' && gor.state !== 'smash' && gor.state !== 'fall';
            if (!bulletDestroyed && gor && gdef && gorFighting &&
                this.checkOverlap(hitRect, { x: gor.x - gdef.halfW, y: 570 - gdef.height, w: gdef.halfW * 2, h: gdef.height })) {
                bulletDestroyed = true;
                gor.hp = Math.max(0, gor.hp - damage);
                gor.hitFlash = 4;
                gor.lastHitBy = bullet.playerId;
                if (gor.hp <= 0) this.gorillaDefeated(room, gor);
            }

            // NO MORE FRIENDS (PvP): o'q / zarba boshqa o'yinchiga tegadi (o'ziga emas; qayta tug'ilgan - qisqa himoyada)
            const pv = room.pvp, pvd = map.pvp;
            if (!bulletDestroyed && pv && pvd && !pv.done) {
                const shooter = room.players[bullet.playerId];
                const victim = Object.values(room.players).find(v => v.id !== bullet.playerId && !v.isDead &&
                    this.checkOverlap(hitRect, { x: v.x - this.PLAYER_HALF_W, y: v.y - this.PLAYER_HALF_H, w: this.PLAYER_HALF_W * 2, h: this.PLAYER_HALF_H * 2 }));
                if (victim) {
                    bulletDestroyed = true;
                    if ((pv.shieldUntil[victim.id] || 0) <= pv.tick) {
                        const blocked = victim.characterType === 'knight' && victim.isHoldingAbility;
                        const dmg = Math.round(damage * (blocked ? 1 - pvd.shieldBlock : 1));
                        this.hurtPlayer(victim, dmg);
                        this.knockback(victim, (bullet.vx < 0 ? -1 : 1) * (blocked ? 120 : 260), -160);
                        this.io.to(room.id).emit('pvpHit', { id: victim.id, x: Math.round(victim.x), y: Math.round(victim.y), blocked });
                        if (victim.isDead) {
                            pv.respawnAt[victim.id] = pv.tick + Math.round(pvd.respawnMs / 30);
                            if (shooter && shooter.id !== victim.id) shooter.kills++;
                            this.io.to(room.id).emit('pvpKill', { killer: shooter ? shooter.nickname : '', victim: victim.nickname, killerId: shooter ? shooter.id : null, victimId: victim.id });
                            if (shooter && shooter.kills >= pvd.killsToWin) {
                                pv.done = true;
                                this.roomManager.declareWinner(room.id, shooter.id).catch(err => console.error('declareWinner xatosi:', err));
                            }
                        }
                    }
                }
            }

            // SKY BATTLE: uchar mashinali botlar va boss (uchar kema)
            const sk = room.sky, skd = map.sky;
            if (!bulletDestroyed && sk && skd) {
                for (let k = sk.enemies.length - 1; k >= 0 && !bulletDestroyed; k--) {
                    const en = sk.enemies[k];
                    if (!this.checkOverlap(hitRect, { x: en.x - skd.enemyW / 2, y: en.y - skd.enemyH / 2, w: skd.enemyW, h: skd.enemyH })) continue;
                    bulletDestroyed = true;
                    en.hp = Math.max(0, en.hp - damage);
                    en.hitFlash = 4;
                    if (en.hp <= 0) this.skyEnemyDown(room, k, bullet.playerId);
                }
                const bs = sk.boss;
                if (!bulletDestroyed && bs && sk.state === 'boss' && this.checkOverlap(hitRect, { x: bs.x - skd.bossW / 2, y: bs.y - skd.bossH / 2, w: skd.bossW, h: skd.bossH })) {
                    bulletDestroyed = true;
                    bs.hp = Math.max(0, bs.hp - damage);
                    bs.hitFlash = 4;
                    if (bs.hp <= 0) {
                        sk.state = 'dying'; sk.timer = Math.round(skd.bossDyingMs / 30); sk.shots = []; sk.enemies = [];
                        this.io.to(room.id).emit('skyBossDown', { x: Math.round(bs.x), y: Math.round(bs.y) });
                    }
                }
            }

            // MY FARM: qo'ziqorinlar va baxaybat daraxtning og'zi (boss jangida)
            const mfw = room.myFarm, mfd = map.myFarm;
            if (!bulletDestroyed && mfw && mfd) {
                for (const sh of mfw.shrooms) {
                    if (!this.checkOverlap(hitRect, { x: sh.x - 22, y: 516, w: 44, h: 56 })) continue;
                    bulletDestroyed = true;
                    sh.hp = Math.max(0, sh.hp - damage);
                    sh.hitFlash = 4;
                    if (sh.hp <= 0) this.roomManager.shroomKilled(room.id, sh.id, bullet.playerId);
                    break;
                }
                if (!bulletDestroyed) for (const m of mfw.mobs) {
                    const hw = m.kind === 'slime' ? 54 : m.kind === 'slimelet' ? 22 : m.kind === 'crow' ? 22 : 20, h = m.kind === 'slime' ? 96 : m.kind === 'crow' ? 34 : 50;
                    const box = m.kind === 'crow' ? { x: m.x - hw, y: m.y - h / 2 - 6, w: hw * 2, h } : { x: m.x - hw, y: m.y - h, w: hw * 2, h };
                    if (!this.checkOverlap(hitRect, box)) continue;
                    bulletDestroyed = true;
                    m.hp = Math.max(0, m.hp - damage);
                    m.hitFlash = 4;
                    if (m.hp <= 0) this.roomManager.mobKilled(room.id, m.id, bullet.playerId);
                    break;
                }
                const tb = mfw.boss;
                if (!bulletDestroyed && tb && this.checkOverlap(hitRect, mfd.tree.mouth)) {
                    bulletDestroyed = true;
                    tb.hp = Math.max(0, tb.hp - damage);
                    tb.hitFlash = 4;
                    if (tb.hp <= 0) this.roomManager.treeBossDefeated(room.id);
                }
            }

            // RANETS AVTOMATI: tinch turganiga tegsa - jahli chiqadi; jangda qalqon to'sadi (olov sochayotganda
            // va sakrab tushgandan keyingina zarar oladi)
            const vn = room.vend, vnd = map.vend;
            if (!bulletDestroyed && vn && vnd && (vn.state === 'idle' || vn.state === 'transform' || vn.state === 'fight') && this.checkOverlap(hitRect, this.vendRect(vn, vnd))) {
                bulletDestroyed = true;
                if (vn.state === 'idle') this.vendProvoke(room);
                else if (vn.state === 'fight' && this.vendVulnerable(vn)) {
                    vn.hp = Math.max(0, vn.hp - damage);
                    vn.hitFlash = 4;
                    if (vn.hp <= 0) this.vendDefeated(room);
                } else {
                    if (vn.shieldFlash <= 0) this.io.to(room.id).emit('vendBlock', {});
                    vn.shieldFlash = 8;
                }
            }

            // IRON GIANT: faqat BOSHI zarar oladi (tanasi, qo'llari - yo'q)
            const rb = room.robot, rbd2 = map.robot;
            // Bot chiqargandan keyin (o'chiq) - atrofida GOLOGRAMMA QALQON: hech qanday zarba o'tmaydi
            // (faqat robotning o'ziga - boshi va tanasi; tagidagi bot turgan joy ochiq, aks holda botni o'ldirib bo'lmay qolardi)
            const holoHead = rbd2 ? { x: rbd2.head.x - 20, y: rbd2.head.y - 20, w: rbd2.head.w + 40, h: rbd2.head.h + 40 } : null;
            const holoBody = rbd2 ? { x: rbd2.arenaX + 684, y: rbd2.head.y - 20, w: 116, h: 300 } : null;
            if (!bulletDestroyed && rb && rbd2 && rb.state === 'off' && (this.checkOverlap(hitRect, holoHead!) || this.checkOverlap(hitRect, holoBody!))) {
                bulletDestroyed = true;
                if ((rb.holoCd || 0) <= rb.tick) { rb.holoCd = rb.tick + 6; this.io.to(room.id).emit('robotHoloHit', { x: Math.round(hitRect.x + hitRect.w / 2), y: Math.round(hitRect.y + hitRect.h / 2) }); }
            }
            if (!bulletDestroyed && rb && rbd2 && rb.state === 'on' && this.checkOverlap(hitRect, rbd2.head)) {
                bulletDestroyed = true;
                rb.hp = Math.max(0, rb.hp - damage);
                rb.hitFlash = 4;
                if (rb.hp <= 0) this.robotDefeated(room);
            }

            // INFINITY TNT: faqat bochkaning o'zi zarar oladi (Gorila Rock'ka o'q ta'sir qilmaydi)
            const tn = room.tnt, tnd = map.tnt;
            if (!bulletDestroyed && tn && tnd && tn.state === 'fight' && this.checkOverlap(hitRect, tnd.box)) {
                bulletDestroyed = true;
                tn.hp = Math.max(0, tn.hp - damage);
                tn.hitFlash = 4;
                if (tn.hp <= 0) this.tntFuse(room);
            }

            // HIS BACK: o'q tekkan bochka portlaydi (yo'lni tozalash mumkin)
            const bk = room.back, bkd = map.back;
            if (!bulletDestroyed && bk && bkd && bk.barrels.length) {
                const bi = bk.barrels.findIndex(b => this.checkOverlap(hitRect, { x: b.x - bkd.barrelR, y: b.y - bkd.barrelR, w: bkd.barrelR * 2, h: bkd.barrelR * 2 }));
                if (bi >= 0) {
                    bulletDestroyed = true;
                    const b = bk.barrels.splice(bi, 1)[0];
                    this.io.to(room.id).emit('barrelBoom', { x: Math.round(b.x), y: Math.round(b.y), id: null });
                }
            }

            // G'OR (map-5): OQ YUZga o'q/zarba umuman ta'sir qilmaydi - faqat qochish. Qo'ziqorinchalar esa o'ladi
            const drs = room.doors;
            if (!bulletDestroyed && drs && drs.state === 'room' && drs.sub === 'fight' && drs.shrooms.length) {
                const si = drs.shrooms.findIndex(m => this.checkOverlap(hitRect, { x: m.x - 22, y: m.y - 58, w: 44, h: 58 }));
                if (si >= 0) {
                    bulletDestroyed = true;
                    const m = drs.shrooms[si];
                    m.hp -= damage;
                    m.flash = 5;
                    if (m.hp <= 0) {
                        drs.shrooms.splice(si, 1);
                        drs.nextShroom = drs.tick + Math.round(map.doors!.shroomRespawnMs / 30);   // o'lgach - biroz o'tib yangisi
                        this.io.to(room.id).emit('shroomDie', { id: m.id, x: Math.round(m.x), y: Math.round(m.y) });
                    }
                }
            }

            // KALMAR: faqat QIZIL KO'ZI zarar oladi
            const sq = room.squid;
            const sqd = map.squid;
            if (!bulletDestroyed && sq && sqd && (sq.state === 'fight' || sq.state === 'rise') &&
                this.checkOverlap(hitRect, { x: sq.x - sqd.eyeR, y: sq.eyeY - sqd.eyeR, w: sqd.eyeR * 2, h: sqd.eyeR * 2 })) {
                bulletDestroyed = true;
                sq.hp = Math.max(0, sq.hp - damage);
                sq.hitFlash = 4;
                sq.lastHitBy = bullet.playerId;
                if (sq.hp <= 0) this.squidDefeated(room, sq);
            }

            // GIGANT GUL: faqat BOSHI zarar oladi
            const gfl = room.gflower;
            const gfd = map.giantFlower;
            if (!bulletDestroyed && gfl && gfd && (gfl.state === 'fight' || gfl.state === 'wake') &&
                this.checkOverlap(hitRect, { x: gfl.hx - 68, y: gfl.hy - 56, w: 136, h: 112 })) {
                bulletDestroyed = true;
                gfl.hp = Math.max(0, gfl.hp - damage);
                gfl.hitFlash = 4;
                gfl.lastHitBy = bullet.playerId;
                if (gfl.hp <= 0) this.giantFlowerDefeated(room, gfl);
            }

            // OG'ZIBOR GUL: oddiy zarba - o'ladi; muz shari - qotib qoladi (muzlagan gulni oddiy zarba o'ldiradi)
            const uwDef = map.underworld;
            if (!bulletDestroyed && uwDef && room.flowers) {
                const fl = room.flowers.find(f => f.state !== 'hidden' && f.state !== 'dead' &&
                    this.checkOverlap(hitRect, { x: f.x - 32, y: 570 - 150, w: 64, h: 150 }));
                if (fl) {
                    bulletDestroyed = true;
                    if (bullet.bulletType === 'ice') {
                        fl.state = 'frozen';
                        fl.timer = Math.round(uwDef.flowerFreezeMs / 30);
                    } else {
                        fl.state = 'dead';
                        fl.timer = 0;
                    }
                }
            }

            // SEMIZ ELF: jang paytida (suhbatdan keyin) tanasiga tegsa - jonini oladi
            const fe = room.fatElf;
            const fdef = map.fatElf;
            if (!bulletDestroyed && fe && fdef && (fe.state === 'idle' || fe.state === 'charge' || fe.state === 'spit' || fe.state === 'fcharge' || fe.state === 'flame') &&
                this.checkOverlap(hitRect, { x: fe.x - fdef.halfW, y: 570 - fdef.height, w: fdef.halfW * 2, h: fdef.height })) {
                bulletDestroyed = true;
                fe.hp = Math.max(0, fe.hp - damage);
                fe.hitFlash = 4;
                fe.lastHitBy = bullet.playerId;
                if (fe.hp <= 0) this.fatElfDefeated(room, fe);
            }

            for (let j = room.bots.length - 1; j >= 0 && !bulletDestroyed; j--) {
                const bot = room.bots[j];
                if (this.checkOverlap(hitRect, this.botRect(bot))) {

                    bulletDestroyed = true;

                    // QALQON FAOL BO'LSA: o'q/zarba botga tegib "so'nadi", lekin zarar bermaydi
                    if (bot.isBlocking) {
                        break;
                    }

                    bot.hp -= damage;
                    if (bullet.bulletType === 'ice') bot.freezeDuration = Math.max(bot.freezeDuration, 45); // ~1.3s muzlaydi
                    // ZANJIRLI CHAQMOQ: tekkan botdan yana 2 ta eng yaqin botga sakraydi (har biri - 60% zarar)
                    if (bullet.bulletType === 'lightning') {
                        const chain: BotState[] = [bot];
                        const points = [[Math.round(bot.x), Math.round(bot.y)]];
                        for (let hop = 0; hop < 2; hop++) {
                            const from = chain[chain.length - 1];
                            const next = room.bots.filter(b => !chain.includes(b) && b.hp > 0 && Math.hypot(b.x - from.x, b.y - from.y) <= 230)
                                .sort((a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y))[0];
                            if (!next) break;
                            chain.push(next);
                            points.push([Math.round(next.x), Math.round(next.y)]);
                            if (!next.isBlocking) next.hp -= damage * 0.6;
                        }
                        this.io.to(room.id).emit('chainBolt', { points });
                        // O'lganlar - indeksi kattasidan boshlab olib tashlanadi
                        chain.map(b => room.bots.indexOf(b)).filter(i => i >= 0 && room.bots[i].hp <= 0).sort((a, b) => b - a)
                            .forEach(i => this.killBot(room, i, bullet.playerId));
                        break;
                    }
                    if (bot.hp <= 0) this.killBot(room, j, bullet.playerId);
                    break;
                }
            }

            // QUTI: zarba/o'q tegsa joni kamayadi, sinsa o'rnida TANGA qoladi
            // (yoniga borib E bosgan qahramon oladi - handlePickupCoin)
            for (let c = room.crates.length - 1; c >= 0 && !bulletDestroyed; c--) {
                const crate = room.crates[c];
                const half = CRATE_SIZE / 2;
                if (this.checkOverlap(hitRect, { x: crate.x - half, y: crate.y - half, w: CRATE_SIZE, h: CRATE_SIZE })) {
                    bulletDestroyed = true;
                    crate.hp -= damage;
                    if (crate.hp <= 0) {
                        room.crates.splice(c, 1);
                        room.coins.push({ id: 'coin_' + crate.id, x: crate.x, y: crate.y });
                    }
                }
            }

            // QIZIL QUTI (o'rmon): o'q/zarba tegsa - PORTLAYDI
            const boxes = room.redBoxes || [];
            for (let r = boxes.length - 1; r >= 0 && !bulletDestroyed; r--) {
                const half = RED_BOX_SIZE / 2;
                if (this.checkOverlap(hitRect, { x: boxes[r].x - half, y: boxes[r].y - half, w: RED_BOX_SIZE, h: RED_BOX_SIZE })) {
                    bulletDestroyed = true;
                    this.explodeRedBox(room, boxes[r].id, bullet.playerId);
                }
            }

            const minBulletY = map.back ? map.back.topY - 600 : 0;
            if (bulletDestroyed || bullet.lifetime <= 0 || bullet.x < 0 || bullet.x > map.mapWidth || bullet.y < minBulletY || bullet.y > 600) {
                room.bullets.splice(i, 1);
            }
        }
    }

    // TO'LQINLAR: joriy to'lqin botlari o'lsa, keyingisi chiqadi (o'yinchilar
    // sonicha, lekin xaritaning umumiy botlar sonidan oshmasdan). Xaritadagi
    // BARCHA botlar chiqarilib, hammasi o'lganda - xarita o'tildi
    private checkBotRespawn(room: RoomState, roomId: string): void {
        const map = getMapById(room.selectedLevel);
        if (map.mode !== 'waves' || room.bots.length > 0 || room.isOver) return;
        // O'rmon: itlar daraxt yoniga yetilganda chiqadi, o'lganda esa xarita tugamaydi -
        // g'orga kirish kerak (ikkalasi ham updateForest'da)
        if (map.forest) return;

        if (room.botsSpawned >= room.killsToWin) {
            this.roomManager.declareWinner(roomId, this.topKillerId(room)).catch(err => {
                console.error('declareWinner xatosi:', err);
            });
            return;
        }
        GameEngine.spawnWave(room, map);
    }

    private static spawnWave(room: RoomState, map: MapDef): void {
        const playerCount = Math.max(1, Object.keys(room.players).length);
        const perPlayer = map.forest ? map.forest.botsPerPlayer : 1;
        const count = Math.min(playerCount * perPlayer, room.killsToWin - room.botsSpawned);
        room.bots = map.forest
            ? GameEngine.createBots(room.id, generateBotSpawns(map, count), 'dog', map.forest.dogHp)
            : GameEngine.createBots(room.id, generateBotSpawns(map, count));
        room.botsSpawned += count;
    }

    // Bot o'ldi: ro'yxatdan o'chiriladi, jamoa hisobi va o'ldirganning statistikasi
    private killBot(room: RoomState, index: number, killerId: string | null): void {
        const dead = room.bots[index];
        room.bots.splice(index, 1);
        // Jamoaviy hisob: xarita botlarning HAMMASI o'lganda o'tiladi
        // (checkBotRespawn'da tekshiriladi), shaxsiy kill - statistika uchun
        room.botsKilled++;
        const killer = killerId ? room.players[killerId] : null;
        if (killer && !room.isOver) killer.kills++;
        const ar = getMapById(room.selectedLevel).arena;
        // Har bot uchun o'ldirganga tajriba (arenada - tanga ham)
        if (killer && !room.isOver) {
            this.roomManager.awardReward(room.id, killer.id, ar ? ar.botCoins : 0, ar ? ar.botXp : GameEngine.KILL_XP, true)
                .catch(err => console.error('awardReward xatosi:', err));
        }
        if (dead.skin === 'zombie' && room.farm && room.farm.state === 'fight') {
            room.farm.kills++;
            if (room.farm.spawned < room.farm.target) room.farm.nextSpawnTick = room.farm.tick;   // yerdan yana bittasi
        }
        if (ar && room.arena && !room.isOver) {
            room.arena.kills++;
            if (!room.arena.boss) {
                room.arena.sinceBoss++;
                if (room.arena.sinceBoss >= ar.killsPerBoss) this.startArenaBoss(room);
            }
        }
    }

    // O'RMON: daraxt yoniga yetilganda itlar chiqadi; so'ng tepadan qizil qutilar
    // tushadi (yer yoki shox ustiga qo'nib, o'q tegguncha yotadi)
    private updateForest(room: RoomState, roomId: string): void {
        const map = getMapById(room.selectedLevel);
        const f = map.forest;
        if (!f || room.isOver) return;
        room.levelTicks = (room.levelTicks || 0) + 1;
        if (!room.arenaTriggered) {
            if (!Object.values(room.players).some(p => !p.isDead && p.x >= f.arenaTriggerX)) return;
            room.arenaTriggered = true;
            room.nextRedBoxTick = room.levelTicks + 90;
            GameEngine.spawnWave(room, map);
        }
        // ITLAR O'LDI: yo'l davom etadi - g'orga kirganlar "xavfsiz", hamma tirik kirsa - o'tildi
        if (room.bots.length === 0 && room.botsSpawned >= room.killsToWin) {
            Object.values(room.players).forEach(p => {
                if (!p.isDead && p.x >= f.caveX && !room.checkpointReached.includes(p.id)) room.checkpointReached.push(p.id);
            });
            const alive = Object.values(room.players).filter(p => !p.isDead);
            if (alive.length > 0 && alive.every(p => room.checkpointReached.includes(p.id))) {
                this.roomManager.declareWinner(roomId, this.topKillerId(room)).catch(err => {
                    console.error('declareWinner xatosi:', err);
                });
                return;
            }
        }
        const boxes = room.redBoxes || (room.redBoxes = []);
        const rb = f.redBox;
        if (room.levelTicks >= (room.nextRedBoxTick || 0) && room.bots.length > 0) {
            if (boxes.length < rb.maxBoxes) {
                boxes.push({
                    id: 'rbox_' + room.levelTicks,
                    x: Math.round(rb.minX + Math.random() * (rb.maxX - rb.minX)),
                    y: -RED_BOX_SIZE, vy: 0, landed: false
                });
            }
            room.nextRedBoxTick = room.levelTicks + Math.round(rb.intervalMs / 30);
        }
        const half = RED_BOX_SIZE / 2;
        boxes.forEach(b => {
            if (b.landed) return;
            const prevBottom = b.y + half;
            b.vy = Math.min(700, b.vy + this.GRAVITY * this.TICK_SECONDS);
            b.y += b.vy * this.TICK_SECONDS;
            const bottom = b.y + half;
            // Qo'nadigan sirt: yer (570) yoki ustidan tushib kelgan shox
            let land = 570;
            map.platforms.forEach(pl => {
                if (b.x >= pl.x && b.x <= pl.x + pl.w && pl.y >= prevBottom && pl.y <= bottom && pl.y < land) land = pl.y;
            });
            if (bottom >= land) {
                b.y = land - half;
                b.vy = 0;
                b.landed = true;
            }
        });
    }

    // YURUVCHI TOSHLAR: har tosh o'z davri bilan tepaga-pastga tebranadi. Tirik qahramon
    // ustiga tushsa - titraydi, fallDelayMs dan so'ng qulaydi, respawnMs dan so'ng joyiga
    // qaytadi. Chuqurlikka tushgan qahramon halok bo'ladi; oxirgi qirg'oqqa (goalX) yetganlar
    // "xavfsiz", hamma tirik qahramon yetsa - xarita o'tildi
    private updateStones(room: RoomState, roomId: string): void {
        const map = getMapById(room.selectedLevel);
        const cfg = map.stones;
        if (!cfg || room.isOver || !room.stones) return;
        room.levelTicks = (room.levelTicks || 0) + 1;
        const tMs = room.levelTicks * 30;
        const alive = Object.values(room.players).filter(p => !p.isDead);
        room.stones.forEach((st, i) => {
            const def = cfg.stones[i];
            const bobY = def.baseY + def.amp * Math.sin((2 * Math.PI * tMs) / def.periodMs + def.phase);
            if (st.state === 'idle' || st.state === 'shake') st.y = bobY;
            // Toshga qadam qo'yilganini klient aytadi (stepStone): u haqiqiy to'qnashuvni ko'radi. Server o'zi
            // taxmin qilganda tebranayotgan tosh va tarmoq kechikishi tufayli tegilmagan toshlar ham qulardi
            if (st.state === 'shake') {
                if (--st.timer <= 0) { st.state = 'fall'; st.vy = 0; }
            } else if (st.state === 'fall') {
                st.vy = Math.min(900, st.vy + 900 * this.TICK_SECONDS);
                st.y += st.vy * this.TICK_SECONDS;
                if (st.y > 700) { st.state = 'gone'; st.timer = Math.round(cfg.respawnMs / 30); }
            } else if (--st.timer <= 0) {
                st.state = 'idle';
                st.y = bobY;
            }
        });
        alive.forEach(p => {
            if (p.y > this.PIT_DEATH_Y) { this.killPlayer(p); return; }
            if (p.x >= cfg.goalX && !room.checkpointReached.includes(p.id)) room.checkpointReached.push(p.id);
        });
        const stillAlive = Object.values(room.players).filter(p => !p.isDead);
        if (stillAlive.length > 0 && stillAlive.every(p => room.checkpointReached.includes(p.id))) {
            this.roomManager.declareWinner(roomId, stillAlive[0].id).catch(err => {
                console.error('declareWinner xatosi:', err);
            });
        }
    }

    // Qahramon toshga ustidan qo'ndi (klient fizikasi): tosh titray boshlaydi. Server faqat qahramon
    // haqiqatan shu tosh yonida ekanini tekshiradi (tarmoq kechikishi uchun keng zaxira bilan)
    public stepStone(room: RoomState, playerId: string, i: number): void {
        const cfg = getMapById(room.selectedLevel).stones;
        const p = room.players[playerId];
        const st = room.stones && Number.isInteger(i) ? room.stones[i] : undefined;
        if (!cfg || !p || p.isDead || !st || st.state !== 'idle' || room.isOver) return;
        if (Math.abs(p.x - st.x) > st.w / 2 + 30 || Math.abs(p.y + this.PLAYER_HALF_H - st.y) > 70) return;
        st.state = 'shake';
        st.timer = Math.round(cfg.fallDelayMs / 30);
    }

    // ===== TOSH GORILLA (map-8) =====
    // Qahramon qayerda: 'plat' (platformada), 'near' (yerda, gorillaga yaqin), 'far' (yerda, uzoqda)
    private gorillaZone(room: RoomState, p: PlayerState, gd: NonNullable<MapDef['gorilla']>): 'near' | 'far' | 'plat' {
        const feet = p.y + this.PLAYER_HALF_H;
        if (feet < 540) return 'plat';
        return Math.abs(p.x - room.gorilla!.x) < gd.nearRange ? 'near' : 'far';
    }
    private platUnder(room: RoomState, p: PlayerState): number {
        const feet = p.y + this.PLAYER_HALF_H;
        return (room.gPlats || []).findIndex(pl => p.x >= pl.x - 10 && p.x <= pl.x + pl.w + 10 && Math.abs(feet - pl.y) <= 12);
    }
    private hurtPlayer(p: PlayerState, dmg: number): void {
        if (p.isDead) return;
        p.hp -= dmg;
        if (p.hp <= 0) this.killPlayer(p);
    }
    // Qahramonni itarib yuborish: pozitsiyani klient boshqaradi - unga tezlik buyrug'i yuboriladi
    private knockback(p: PlayerState, vx: number, vy: number): void {
        this.io.to(p.id).emit('knockback', { vx, vy });
    }

    // Gorilla yengildi: hujumlar to'xtaydi, xavflar yo'qoladi, so'nggi suhbat boshlanadi
    private gorillaDefeated(room: RoomState, g: NonNullable<RoomState['gorilla']>): void {
        if (room.arena) { this.arenaBossBeaten(room); return; }
        g.hp = 0;
        g.state = 'defeat';
        g.attack = null;
        g.timer = Math.round(GameEngine.GORILLA_TALK_MAX_MS / 30);
        room.gSpikes = [];
        room.gRocks = [];
        (room.gPlats || []).forEach(pl => { if (pl.state === 'shake') pl.state = 'idle'; else if (pl.state !== 'idle') pl.state = 'back'; });
        Object.values(room.players).forEach(p => { p.introDone = false; });
    }

    private updateGorilla(room: RoomState, roomId: string): void {
        const map = getMapById(room.selectedLevel);
        const gd = map.gorilla;
        const g = room.gorilla;
        if (!gd || !g || room.isOver) return;
        room.levelTicks = (room.levelTicks || 0) + 1;
        if (g.hitFlash > 0) g.hitFlash--;
        const T = (ms: number) => Math.round(ms / 30);
        const alive = Object.values(room.players).filter(p => !p.isDead);

        // --- Platformalar (crush) ---
        (room.gPlats || []).forEach((pl, i) => {
            const base = gd.platforms[i].y;
            if (pl.state === 'shake') {
                if (--pl.timer <= 0) {
                    // Titrash tugadi - hali ham ustida turganlar platforma bilan birga tepaga otiladi
                    pl.state = 'launch';
                    pl.riders = alive.filter(p => this.platUnder(room, p) === i).map(p => p.id);
                }
            } else if (pl.state === 'launch') {
                pl.y = Math.max(gd.ceilingY, pl.y - 900 * this.TICK_SECONDS);
                if (pl.y <= gd.ceilingY) {
                    // SHIFTGA URILDI: ustidagilar ezildi - 100% jon
                    pl.state = 'hold';
                    pl.timer = T(500);
                    pl.riders.forEach(id => { const p = room.players[id]; if (p && !p.isDead) this.killPlayer(p); });
                    pl.riders = [];
                }
            } else if (pl.state === 'hold') {
                if (--pl.timer <= 0) pl.state = 'back';
            } else if (pl.state === 'back') {
                pl.y = Math.min(base, pl.y + 220 * this.TICK_SECONDS);
                if (pl.y >= base) { pl.y = base; pl.state = 'idle'; }
            }
        });

        // --- Yerdan chiqadigan toshlar ---
        const spikes = room.gSpikes || (room.gSpikes = []);
        for (let i = spikes.length - 1; i >= 0; i--) {
            const sp = spikes[i];
            if (--sp.timer > 0) continue;
            if (sp.phase === 'warn') {
                sp.phase = 'up';
                sp.timer = T(600);
                alive.forEach(p => {
                    if (Math.abs(p.x - sp.x) < 42 && p.y + this.PLAYER_HALF_H > 540) {
                        this.hurtPlayer(p, gd.spikeDamage);
                        this.knockback(p, 0, -560);
                    }
                });
            } else {
                spikes.splice(i, 1);
            }
        }

        // --- Tepadan tushayotgan toshlar ---
        const rocks = room.gRocks || (room.gRocks = []);
        for (let i = rocks.length - 1; i >= 0; i--) {
            const r = rocks[i];
            if (r.delay > 0) { r.delay--; continue; }
            r.vy = Math.min(900, r.vy + 1200 * this.TICK_SECONDS);
            r.y += r.vy * this.TICK_SECONDS;
            const hit = alive.find(p => !p.isDead && this.checkOverlap(
                { x: r.x - 18, y: r.y - 18, w: 36, h: 36 },
                { x: p.x - this.PLAYER_HALF_W, y: p.y - this.PLAYER_HALF_H, w: this.PLAYER_HALF_W * 2, h: this.PLAYER_HALF_H * 2 }));
            if (hit) { this.hurtPlayer(hit, gd.rockDamage); rocks.splice(i, 1); continue; }
            // Platformalardan o'tib ketadi (platformadagilar qochib qutulolmaydi) - yerda sinadi
            if (r.y + 18 >= 570) rocks.splice(i, 1);
        }

        // --- Gorillaning o'zi ---
        const talkDone = () => alive.length > 0 && alive.every(p => p.introDone);
        // JANG OLDIDAN SUHBAT: hamma o'qib bo'lguncha gorilla hujum qilmaydi
        if (g.state === 'intro') {
            if (talkDone() || --g.timer <= 0) { g.state = 'idle'; g.timer = T(1000); }
            return;
        }
        // YUTQAZDI: so'nggi gapi -> yerni qattiq ura boshlaydi -> pol sinadi, hamma yer ostiga tushadi
        if (g.state === 'defeat') {
            if (talkDone() || --g.timer <= 0) { g.state = 'smash'; g.timer = T(2600); }
            return;
        }
        if (g.state === 'smash') {
            if (--g.timer <= 0) { g.state = 'fall'; g.timer = T(1800); }
            return;
        }
        if (g.state === 'fall') {
            if (--g.timer <= 0) {
                const winner = (g.lastHitBy && room.players[g.lastHitBy]) ? g.lastHitBy : (alive[0] || Object.values(room.players)[0])?.id;
                if (winner) this.roomManager.declareWinner(roomId, winner).catch(err => console.error('declareWinner xatosi:', err));
            }
            return;
        }
        if (alive.length === 0) return;
        // OLDIDAN O'TSA / TEGSA: qattiq otib yuboradi (charchab nafas olayotganda - tegmaydi)
        if (g.state !== 'rest') {
            alive.forEach(p => {
                if ((p.snakeHitCd || 0) > 0) { p.snakeHitCd!--; return; }
                const touching = Math.abs(p.x - g.x) < gd.halfW + this.PLAYER_HALF_W - 6 &&
                    p.y + this.PLAYER_HALF_H > 570 - gd.height + 10;
                if (!touching) return;
                const dir = p.x >= g.x ? 1 : -1;
                this.hurtPlayer(p, gd.contactDamage);
                this.knockback(p, dir * gd.contactSpeed, -380);
                p.snakeHitCd = 30; // ~1s - uchib ketayotganda qayta tegmasin
            });
        }
        // Ko'pchilik tomonga qaraydi
        const avgX = alive.reduce((a, p) => a + p.x, 0) / alive.length;
        g.facingLeft = avgX < g.x;

        if (g.state === 'idle') {
            // Hujumlar orasida yerdagi qahramonlar tomon sekin yuradi
            const ground = alive.filter(p => this.gorillaZone(room, p, gd) !== 'plat');
            const tx = ground.length ? ground.reduce((a, p) => a + p.x, 0) / ground.length : 400;
            const goal = Math.max(150, Math.min(650, tx));
            const step = gd.walkSpeed * this.TICK_SECONDS;
            if (Math.abs(goal - g.x) > gd.nearRange * 0.6) g.x += Math.sign(goal - g.x) * step;
            if (--g.timer > 0) return;
            // KO'PCHILIK qayerda - o'sha hujum (teng bo'lsa - tasodifan)
            const count = { near: 0, far: 0, plat: 0 };
            alive.forEach(p => { count[this.gorillaZone(room, p, gd)]++; });
            const best = Math.max(count.near, count.far, count.plat);
            const zones = (['near', 'far', 'plat'] as const).filter(z => count[z] === best);
            const zone = zones[Math.floor(Math.random() * zones.length)];
            g.state = 'roar';
            g.timer = T(gd.roarMs);
            g.crushPlat = -1;
            if (zone === 'near') g.attack = 'push';
            else if (zone === 'far') g.attack = 'spike';
            else {
                // Qaysi platformada ko'p odam - o'sha titraydi; yoki toshlar yog'iladi
                const onPlat: number[] = (room.gPlats || []).map(() => 0);
                alive.forEach(p => { const k = this.platUnder(room, p); if (k >= 0) onPlat[k]++; });
                const maxOn = Math.max(0, ...onPlat);
                const idle = room.gPlats!.every(pl => pl.state === 'idle');
                if (maxOn > 0 && idle && Math.random() < 0.5) {
                    g.attack = 'crush';
                    g.crushPlat = onPlat.indexOf(maxOn);
                    const pl = room.gPlats![g.crushPlat];
                    pl.state = 'shake';
                    pl.timer = T(gd.crushShakeMs);
                } else {
                    g.attack = 'rocks';
                }
            }
            return;
        }

        if (g.state === 'roar') {
            if (--g.timer > 0) return;
            if (g.attack === 'push') {
                // JUDA TEZ va QATTIQ itarish: yerdagi yaqin qahramonlar uchib ketadi
                alive.forEach(p => {
                    if (this.gorillaZone(room, p, gd) === 'plat' || Math.abs(p.x - g.x) > gd.nearRange + 40) return;
                    const dir = p.x >= g.x ? 1 : -1;
                    this.hurtPlayer(p, gd.pushDamage);
                    this.knockback(p, dir * gd.pushSpeed, -280);
                });
                g.state = 'push';
                g.timer = T(gd.attackAnimMs);
            } else {
                g.state = 'slam';
                g.timer = T(gd.attackAnimMs + 100);
                if (g.attack === 'spike') {
                    // Har bir yerdagi (uzoqdagi) qahramon turgan joydan tosh otilib chiqadi
                    alive.filter(p => this.gorillaZone(room, p, gd) === 'far').forEach((p, k) => {
                        spikes.push({ id: 'gs_' + room.levelTicks + '_' + k, x: p.x, phase: 'warn', timer: T(gd.spikeWarnMs) });
                    });
                } else if (g.attack === 'rocks') {
                    // Tepadan toshlar: platformadagilar ustiga va tasodifiy joylarga
                    const xs = alive.filter(p => this.gorillaZone(room, p, gd) === 'plat').map(p => p.x + (Math.random() - 0.5) * 60);
                    for (let k = 0; k < 4; k++) xs.push(60 + Math.random() * 680);
                    xs.forEach((x, k) => rocks.push({ id: 'gr_' + room.levelTicks + '_' + k, x: Math.max(30, Math.min(770, x)),
                        y: gd.ceilingY + 10, vy: 0, delay: T(350 + Math.random() * 500) }));
                }
                // crush: platforma allaqachon titrayapti - o'zi shiftga uriladi
            }
            return;
        }

        if (g.state === 'push' || g.state === 'slam') {
            if (--g.timer > 0) return;
            g.attack = null;
            // Ba'zan charchab qoladi - 1 soniya nafas oladi (hech kimga tegmaydi)
            if (Math.random() < gd.restChance) { g.state = 'rest'; g.timer = T(gd.restMs); }
            else { g.state = 'idle'; g.timer = T(gd.idleMs); }
            return;
        }

        if (g.state === 'rest' && --g.timer <= 0) {
            g.state = 'idle';
            g.timer = T(gd.idleMs);
        }
    }

    // QIZIL QUTI PORTLADI: radius ichidagi itlarga katta zarar (qalqon ham qutqarmaydi),
    // qahramonlarga ozgina; yaqindagi boshqa qutilar ham zanjir bo'lib portlaydi
    private explodeRedBox(room: RoomState, boxId: string, byPlayerId: string | null): void {
        const boxes = room.redBoxes || [];
        const idx = boxes.findIndex(b => b.id === boxId);
        if (idx < 0) return;
        const box = boxes[idx];
        boxes.splice(idx, 1);
        const rb = getMapById(room.selectedLevel).forest?.redBox;
        if (!rb) return;
        for (let j = room.bots.length - 1; j >= 0; j--) {
            const bot = room.bots[j];
            if (Math.hypot(bot.x - box.x, bot.y - box.y) > rb.blastRadius) continue;
            bot.hp -= rb.blastBotDamage;
            if (bot.hp <= 0) this.killBot(room, j, byPlayerId);
        }
        Object.values(room.players).forEach(p => {
            if (p.isDead || Math.hypot(p.x - box.x, p.y - box.y) > rb.blastRadius) return;
            p.hp -= rb.blastPlayerDamage;
            if (p.hp <= 0) this.killPlayer(p);
        });
        boxes.filter(b => Math.hypot(b.x - box.x, b.y - box.y) <= rb.blastRadius)
            .forEach(b => this.explodeRedBox(room, b.id, byPlayerId));
    }

    // Jamoa g'alabasida "g'olib" deb eng ko'p bot o'ldirgan ko'rsatiladi
    private topKillerId(room: RoomState): string {
        const players = Object.values(room.players);
        return players.reduce((best, p) => (p.kills > best.kills ? p : best), players[0]).id;
    }

    // RAUND BOSHLANISHI: xarita turiga qarab botlar yoki ilon + qutilar
    public static startRound(room: RoomState, map: MapDef): void {
        room.killsToWin = map.killsToWin > 0 ? map.killsToWin
            : Math.max(1, Object.keys(room.players).length) * (map.forest ? map.forest.botsPerPlayer : 1);
        room.botsSpawned = 0;
        room.botsKilled = 0;
        room.bots = [];
        room.bullets = [];
        room.tornadoes = [];   // oldingi xaritadagi sehrgar tornadolari yangi xaritaga o'tmasin
        room.checkpointReached = [];
        const stamp = Date.now();
        room.crates = (map.crates || []).map((c, i) => ({ id: 'crate_' + i + '_' + stamp, x: c.x, y: c.y, hp: CRATE_HP }));
        room.coins = [];
        // AYRI YO'LLAR: har birida tasodifan tepa YOKI past yo'l yopiladi
        room.walls = [
            ...(map.walls || []),
            ...(map.forks || []).map(f => (Math.random() < 0.5 ? f.blockTop : f.blockBottom))
        ].map((w, i) => ({ id: 'wall_' + i + '_' + stamp, x: w.x, y: w.y, w: w.w, h: w.h }));
        room.mines = [
            ...(map.mines || []).map((m, i) => ({ id: 'mine_' + i + '_' + stamp, x: m.x, y: m.y, wallId: null })),
            // HAR DEVOR TAGIDA (oldingi tomonida) MINA: bosilsa jon ketadi, lekin
            // devor ham portlab, yo'l ochiladi - oshib o'tish yoki jon evaziga yorib o'tish
            ...room.walls.map(w => ({ id: 'wmine_' + w.id, x: w.x - 14, y: w.y + w.h - 6, wallId: w.id }))
        ];
        room.snake = map.chase ? { x: map.chase.snakeStartX, speed: map.chase.snakeStartSpeed }
            : map.boss ? { x: map.boss.startX, speed: map.boss.advanceSpeed } : null;
        room.flyingMines = [];
        room.boss = map.boss ? {
            hp: map.boss.baseHp + map.boss.hpPerExtraPlayer * Math.max(0, Object.keys(room.players).length - 1),
            maxHp: map.boss.baseHp + map.boss.hpPerExtraPlayer * Math.max(0, Object.keys(room.players).length - 1),
            nextMineTick: 0, stallsSmashed: 0, fire: 'idle', fireTicks: 0, nextFireTick: 0, wallBroken: false,
            dead: false, deathTicks: 0, hitFlash: 0, lastHitBy: null
        } : null;
        room.apples = [];
        room.levelTicks = 0;
        room.nextAppleTick = 0;
        room.applesStarted = false;
        room.doorOpen = false;
        room.cutscene = null;
        Object.values(room.players).forEach(p => { p.apples = 0; p.appleImmunity = 0; p.introDone = false; });
        room.redBoxes = [];
        room.stones = (map.stones?.stones || []).map((st, i) => ({
            id: 'stone_' + i, x: st.x, y: st.baseY, w: st.w, state: 'idle' as const, timer: 0, vy: 0
        }));
        room.arenaTriggered = false;
        room.nextRedBoxTick = 0;
        const gd = map.gorilla;
        const gHp = gd ? gd.baseHp + gd.hpPerExtraPlayer * Math.max(0, Object.keys(room.players).length - 1) : 0;
        room.gorilla = gd ? {
            hp: gHp, maxHp: gHp, x: gd.startX, facingLeft: true, state: 'intro', timer: Math.round(GameEngine.GORILLA_TALK_MAX_MS / 30),
            attack: null, crushPlat: -1, hitFlash: 0, lastHitBy: null
        } : null;
        room.gPlats = (gd?.platforms || []).map((pl, i) => ({ id: 'gp_' + i, x: pl.x, y: pl.y, w: pl.w, state: 'idle' as const, timer: 0, riders: [] as string[] }));
        room.gSpikes = [];
        room.gRocks = [];
        const fd = map.fatElf;
        const fHp = fd ? fd.baseHp + fd.hpPerExtraPlayer * Math.max(0, Object.keys(room.players).length - 1) : 0;
        room.fatElf = fd ? {
            hp: fHp, maxHp: fHp, x: fd.x, facingLeft: true, state: 'eating', timer: 0, targetId: null, hitFlash: 0, lastHitBy: null
        } : null;
        room.acid = [];
        room.acidCounter = 0;
        const uw = map.underworld;
        room.flowers = (uw?.flowers || []).map((f, i) => ({ id: 'flower_' + i, x: f.x, state: 'hidden' as const, timer: 0, cooldown: 0, bitten: false }));
        room.uwTalk = uw ? { state: 'idle', timer: 0, by: null } : null;
        const gfd = map.giantFlower;
        const gfHp = gfd ? gfd.hpPerPlayer * Math.max(1, Object.keys(room.players).length) : 0;
        room.gflower = gfd ? {
            state: 'sleep', hp: gfHp, maxHp: gfHp, timer: 0, tick: 0, hx: gfd.stemX - 75, hy: gfd.headY, side: -1,
            hitFlash: 0, lastHitBy: null, bite: null, whip: null, nextWhip: 0, nextThorn: 0, nextRoot: 0, nextBite: 0, nextSprout: 0
        } : null;
        room.gfThorns = [];
        room.gfRoots = [];
        room.gfCounter = 0;
        const sqd = map.squid;
        const sqHp = sqd ? sqd.hpPerPlayer * Math.max(1, Object.keys(room.players).length) : 0;
        room.squid = sqd ? { state: 'sleep', hp: sqHp, maxHp: sqHp, timer: 0, tick: 0, x: sqd.baseX, eyeY: 700, hitFlash: 0, lastHitBy: null,
            slam: null, geysers: [], fish: [], splashX: null, nextSlam: 0, nextGeyser: 0, nextFish: 0, counter: 0 } : null;
        room.doors = map.doors ? { state: 'walk', choice: null, timer: 0, tick: 0, segment: 0, wave: null, lastSafe: [], nextWave: 0, lastPlat: {},
            sub: null, monster: null, lastHitBy: null, floorOpen: false, hands: [], holeCd: map.doors.floorHoles.map(() => 0), nextHand: 0,
            heads: map.doors.wallHoles.map(() => ({ phase: 'idle' as const, t: 0, cd: 0 })), nextHead: 0, swallowed: [], grabImmune: {},
            shrooms: [], nextShroom: 0, counter: 0 } : null;
        room.farm = map.farm ? { state: 'idle', timer: 0, tick: 0, kills: 0, target: map.farm.killsPerPlayer * Math.max(1, Object.keys(room.players).length),
            spawned: 0, nextSpawnTick: 0, lastDogTick: -100000, rooted: {}, rootCd: {} } : null;
        room.lift = map.lift ? { state: 'hidden', y: 600, t: 0, spawned: 0, nextBotTick: 0 } : null;
        room.freezeUntil = 0;
        room.back = map.back ? { state: 'walk', timer: 0, tick: 0, nextBarrel: 0, counter: 0, barrels: [] } : null;
        const rbd = map.robot;
        const rbHp = rbd ? rbd.hpPerPlayer * Math.max(1, Object.keys(room.players).length) : 0;
        room.robot = rbd ? { state: 'walk', hp: rbHp, maxHp: rbHp, tick: 0, timer: 0, step: 0, hitFlash: 0, nextAct: 0, act: null,
            fist: { x: rbd.fistRest.x, y: rbd.fistRest.y, phase: 'rest', t: 0, tx: 0, ty: 0, warn: 0, dmg: 0, hit: [] }, laser: null, bolts: [], counter: 0 } : null;
        room.pvp = map.pvp ? { respawnAt: {}, shieldUntil: {}, tick: 0, done: false } : null;
        room.myFarm = map.myFarm ? { owner: null, farm: null, loading: false, sig: '', tick: 0, fishing: null, respawnAt: {}, worldOn: false, seq: 0, shrooms: [], mobs: [], safeUntil: {}, nextRaidAt: 0, raidKind: null, boss: null } : null;
        if (map.pvp) Object.values(room.players).forEach(p => { p.kills = 0; });
        const skd0 = map.sky;
        room.sky = skd0 ? { state: 'intro', tick: 0, timer: Math.round(skd0.introMs / 30), wave: 0, counter: 0, nextStrike: Math.round((skd0.introMs + 4000) / 30),
            enemies: [], shots: [], strikes: [], boss: null } : null;
        const vd = map.vend;
        room.vend = vd ? { state: 'idle', hp: vd.hp, maxHp: vd.hp, tick: 0, timer: 0, x: vd.machineX, y: 570, facing: -1,
            hitFlash: 0, shieldFlash: 0, vuln: 0, step: 0, nextAct: 0, act: null, contactCd: {}, jets: [], flyId: null } : null;
        const td = map.tnt;
        // INFINITY TNT joni: 1 kishi - 1600, har qo'shimcha o'yinchiga +800 (2 - 2400, 3 - 3200, 4 - 4000)
        const tntHp = td ? td.hp + td.hpPerExtraPlayer * Math.max(0, Object.keys(room.players).length - 1) : 0;
        room.tnt = td ? { state: 'intro', hp: tntHp, maxHp: tntHp, tick: 0, timer: Math.round(td.introMs / 30), hitFlash: 0, counter: 0,
            gor: { x: td.gorStartX, y: map.platforms[td.floor].y, surf: td.floor, facing: -1, act: 'idle', t: 0, x0: 0, y0: 0, x1: 0, y1: 0, peak: 0, dur: 0, target: null, plan: null, thrown: 0 },
            bombs: [], warns: [], nextAct: 0, step: 0, contactCd: {} } : null;
        if (map.arena) {
            room.gorilla = null;
            room.fatElf = null;
            room.arena = { kills: 0, sinceBoss: 0, boss: null, lastBoss: null, bossesBeaten: 0, tick: 0, nextSpawnTick: 30 };
        } else {
            room.arena = null;
        }
        Object.values(room.players).forEach(p => { p.acidTicks = 0; p.jetpack = !!map.sky; });   // ranets - faqat shu xaritada (osmondagi jangda - hammada)
        // O'rmonda itlar darhol emas - daraxt yoniga yetilganda chiqadi
        if (map.mode === 'waves' && !map.forest) GameEngine.spawnWave(room, map);
    }

    // ELF QISHLOG'I: elf olma otadi (faol qahramonlardan biriga qarab, tarqoqlik
    // bilan), olma yoy bo'ylab uchadi. Savatchaga (qahramon tepa qismi) tushsa -
    // +1, yerga tushsa - yo'qoladi. Faol qahramonlar bir-biriga tegsa - ikkalasining
    // ham olmasi sochiladi (0 ga tushadi). N ta tutgan chekpointga borib kutadi;
    // hamma tirik qahramon chekpointda bo'lsa - xarita o'tildi
    private updateApples(room: RoomState, roomId: string): void {
        const map = getMapById(room.selectedLevel);
        const cfg = map.apples;
        if (!cfg || room.isOver || !room.apples) return;
        room.levelTicks = (room.levelTicks || 0) + 1;
        const target = cfg.applesToCollect;
        const players = Object.values(room.players).filter(p => !p.isDead);
        const active = players.filter(p => (p.apples || 0) < target);

        // Elf hamma dialogni o'qib bo'lgach otishni boshlaydi (kimdir AFK bo'lsa -
        // baribir INTRO_MAX_TICKS dan keyin boshlanadi, hammani kutib qolmasin)
        if (!room.applesStarted && (players.every(p => p.introDone) || room.levelTicks > this.INTRO_MAX_TICKS)) {
            room.applesStarted = true;
            room.nextAppleTick = room.levelTicks + 30;
        }

        // Otish
        if (room.applesStarted && room.levelTicks >= (room.nextAppleTick || 0) && active.length > 0) {
            // TASODIFIY JOYGA: butun maydon bo'ylab (o'yinchi yoniga emas)
            const tx = cfg.targetMinX + Math.random() * (cfg.targetMaxX - cfg.targetMinX);
            const ty = 505; // savatcha balandligi - shu nuqtada tutiladi
            // ADOLATLI UCHISH VAQTI: eng yaqin qahramon qancha uzoqda bo'lsa, olma
            // shuncha uzoq (sekin) uchadi - yugurib yetib olishga doim vaqt yetadi
            const nearest = Math.min(...active.map(p => Math.abs(p.x - tx)));
            const T = Math.max(this.APPLE_MIN_FLIGHT, Math.min(this.APPLE_MAX_FLIGHT,
                this.APPLE_REACTION_S + nearest / this.APPLE_CHASE_SPEED));
            // Yoy balandligi doim bir xil (elfdan APPLE_ARC_RISE yuqoriga) - uzoq uchgan
            // olma ekrandan chiqib ketmaydi; shunga mos gravitatsiya har olma uchun alohida
            const rise = this.APPLE_ARC_RISE, fall = ty - (cfg.elfY - rise);
            const g = Math.pow((Math.sqrt(2 * rise) + Math.sqrt(2 * fall)) / T, 2);
            room.apples.push({
                id: 'apple_' + room.levelTicks + '_' + Math.floor(Math.random() * 1e6),
                x: cfg.elfX, y: cfg.elfY,
                vx: (tx - cfg.elfX) / T,
                vy: -Math.sqrt(2 * g * rise),
                g,
                tx
            });
            const intervalMs = Math.max(350, cfg.throwIntervalMs / active.length);
            room.nextAppleTick = room.levelTicks + Math.round(intervalMs / 30);
        }

        // Uchish va tutish
        for (let i = room.apples.length - 1; i >= 0; i--) {
            const a = room.apples[i];
            a.vy += a.g * this.TICK_SECONDS;
            a.x += a.vx * this.TICK_SECONDS;
            a.y += a.vy * this.TICK_SECONDS;
            const catcher = active.find(p => (p.apples || 0) < target &&
                Math.abs(a.x - p.x) <= 26 && a.y >= p.y - this.PLAYER_HALF_H - 20 && a.y <= p.y - 4);
            if (catcher) {
                catcher.apples = (catcher.apples || 0) + 1;
                room.apples.splice(i, 1);
            } else if (a.y >= 560) {
                room.apples.splice(i, 1);
            }
        }

        // Bir-biriga tegish - olmalar sochiladi
        players.forEach(p => { if ((p.appleImmunity || 0) > 0) p.appleImmunity!--; });
        for (let i = 0; i < active.length; i++) {
            for (let j = i + 1; j < active.length; j++) {
                const a = active[i], b = active[j];
                if ((a.appleImmunity || 0) > 0 || (b.appleImmunity || 0) > 0) continue;
                if (Math.abs(a.x - b.x) < 28 && Math.abs(a.y - b.y) < 44) {
                    a.apples = 0; b.apples = 0;
                    a.appleImmunity = this.APPLE_SPILL_IMMUNITY_TICKS;
                    b.appleImmunity = this.APPLE_SPILL_IMMUNITY_TICKS;
                }
            }
        }

        // KATTA ESHIK: ochilgan bo'lsa, to'la savatchali (kalitli) qahramon devorga
        // (eshikka) yetib borsa - ichkariga kirdi
        players.forEach(p => {
            if (!room.doorOpen || (p.apples || 0) < target || room.checkpointReached.includes(p.id)) return;
            if (this.atBigDoor(cfg, p)) room.checkpointReached.push(p.id);
        });
        if (players.length > 0 && players.every(p => room.checkpointReached.includes(p.id))) {
            const winnerId = room.checkpointReached.find(id => room.players[id] && !room.players[id].isDead) || players[0].id;
            this.roomManager.declareWinner(roomId, winnerId).catch(err => {
                console.error('declareWinner xatosi:', err);
            });
        }
    }

    // Qahramon katta devordagi eshik oldida (yerda, devorga tegib) turibdimi
    private atBigDoor(cfg: { bigWall: { x: number } }, p: PlayerState): boolean {
        return p.x >= cfg.bigWall.x - 40 && p.y + this.PLAYER_HALF_H > 540;
    }

    // Elf dialogini oxirigacha o'qidi (hamma o'qib bo'lsa - olma otish boshlanadi)
    // "ZARYAD YO'Q": hujum bosilgan, lekin stamina yetmaydi - o'sha qahramonga bo'sh batareya
    // belgisi ko'rsatiladi (bosib turilsa ham ko'pi bilan ~0.8s da bir marta)
    public signalNoStamina(p: PlayerState): void {
        const now = Date.now();
        if (now - (p.lastNoStaminaAt || 0) < 800) return;
        p.lastNoStaminaAt = now;
        this.io.to(p.id).emit('noStamina');
    }

    // ===== SEMIZ ELF (map-9) =====
    // E bosildi: yaqinda bo'lsa - suhbat boshlanadi (hamma ko'radi)
    public talkFatElf(room: RoomState, playerId: string): void {
        const def = getMapById(room.selectedLevel).fatElf;
        const fe = room.fatElf;
        const p = room.players[playerId];
        if (!def || !fe || !p || p.isDead || fe.state !== 'eating') return;
        if (Math.abs(p.x - fe.x) <= def.talkRange) this.startFatElfTalk(room, fe);
    }
    private startFatElfTalk(room: RoomState, fe: NonNullable<RoomState['fatElf']>): void {
        fe.state = 'talk';
        fe.timer = Math.round(GameEngine.FATELF_TALK_MAX_MS / 30);
        Object.values(room.players).forEach(p => { p.introDone = false; });
    }
    private fatElfDefeated(room: RoomState, fe: NonNullable<RoomState['fatElf']>): void {
        if (room.arena) { this.arenaBossBeaten(room); return; }
        fe.hp = 0;
        fe.state = 'down';
        fe.timer = 0;
        room.acid = [];
        room.doorOpen = true;   // o'ngdagi eshik ochiladi
    }
    // Kislota tegdi: maksimal jonning 30% i, 2 soniya stamina tiklanmaydi va LA'NAT - jon o'zi tiklanmaydi
    // (do'kondan Eliksir sotib olinmaguncha, hisobda saqlanadi)
    private acidHit(p: PlayerState, def: NonNullable<MapDef['fatElf']>): void {
        this.hurtPlayer(p, Math.round((p.maxHp || 100) * def.acidDamagePct));
        p.acidTicks = Math.round(def.acidStaminaLockMs / 30);
        this.curse(p, 'acid');
    }
    private curse(p: PlayerState, kind: 'acid' | 'bolt'): void {
        const had = kind === 'acid' ? p.acidCurse : p.boltCurse;
        if (kind === 'acid') p.acidCurse = true; else p.boltCurse = true;
        if (had) return;
        if (p.userId !== null) db.setCurse(p.userId, kind, true);
        this.io.to(p.id).emit('cursed', { kind });
    }

    private updateFatElf(room: RoomState, roomId: string): void {
        const def = getMapById(room.selectedLevel).fatElf;
        const fe = room.fatElf;
        if (!def || !fe || room.isOver) return;
        const T = (ms: number) => Math.round(ms / 30);
        if (fe.hitFlash > 0) fe.hitFlash--;
        const alive = Object.values(room.players).filter(p => !p.isDead);
        // Elf old tomondan chizilgan - og'zi tanasining o'rtasida
        const mouthX = () => fe.x;
        const mouthY = 570 - def.height + 40;

        // --- Kislota tomchilari: yoy bo'ylab uchadi ---
        const acid = room.acid || (room.acid = []);
        for (let i = acid.length - 1; i >= 0; i--) {
            const a = acid[i];
            const prevY = a.y;
            a.vy += 900 * this.TICK_SECONDS;
            a.x += a.vx * this.TICK_SECONDS;
            a.y += a.vy * this.TICK_SECONDS;
            const hit = alive.find(p => this.checkOverlap({ x: a.x - 9, y: a.y - 9, w: 18, h: 18 },
                { x: p.x - this.PLAYER_HALF_W, y: p.y - this.PLAYER_HALF_H, w: this.PLAYER_HALF_W * 2, h: this.PLAYER_HALF_H * 2 }));
            if (hit) { this.acidHit(hit, def); acid.splice(i, 1); continue; }
            // Yerga yoki tosh tokcha ustiga tushdi - sachrab yo'qoladi
            const onLedge = a.vy > 0 && getMapById(room.selectedLevel).platforms.some(pl => pl.h <= 14 &&
                a.x >= pl.x && a.x <= pl.x + pl.w && prevY <= pl.y && a.y >= pl.y);
            if (a.y >= 566 || onLedge || a.x < 0 || a.x > getMapById(room.selectedLevel).mapWidth) acid.splice(i, 1);
        }

        // --- Ovqatlanyapti: yaqin kelgan yoki yonidan o'tib ketgan qahramon bo'lsa - suhbat o'zi boshlanadi ---
        if (fe.state === 'eating') {
            if (alive.some(p => Math.abs(p.x - fe.x) < 70 || p.x > fe.x + 60)) this.startFatElfTalk(room, fe);
            return;
        }
        // --- Suhbat: hamma o'qib bo'lguncha (ko'pi bilan 20s) hujum yo'q ---
        if (fe.state === 'talk') {
            if ((alive.length > 0 && alive.every(p => p.introDone)) || --fe.timer <= 0) {
                fe.state = 'idle';
                fe.timer = T(2200);
                // Jang boshida 1.5s tanaffus: yonida turgan qahramon darhol urilmasin - biroz nari itariladi
                fe.grace = T(1500);
                alive.forEach(p => {
                    if (Math.abs(p.x - fe.x) < def.halfW + 60) this.knockback(p, (p.x >= fe.x ? 1 : -1) * 420, -220);
                });
            }
            return;
        }
        // --- Yengildi: tirik qahramonlarning hammasi eshikka yetsa - xarita o'tildi ("UnderWorld") ---
        if (fe.state === 'down') {
            if (alive.length > 0 && alive.every(p => p.x >= def.doorX)) {
                const winner = (fe.lastHitBy && room.players[fe.lastHitBy]) ? fe.lastHitBy : alive[0].id;
                this.roomManager.declareWinner(roomId, winner).catch(err => console.error('declareWinner xatosi:', err));
            }
            return;
        }
        if (alive.length === 0) return;
        if ((fe.grace || 0) > 0) { fe.grace!--; return; }

        // Tegsa - zarar va itarib yuboradi
        alive.forEach(p => {
            if ((p.snakeHitCd || 0) > 0) { p.snakeHitCd!--; return; }
            const touching = Math.abs(p.x - fe.x) < def.halfW + this.PLAYER_HALF_W - 6 && p.y + this.PLAYER_HALF_H > 570 - def.height + 10;
            if (!touching) return;
            const dir = p.x >= fe.x ? 1 : -1;
            this.hurtPlayer(p, def.contactDamage);
            this.knockback(p, dir * def.contactSpeed, -320);
            p.snakeHitCd = 30;
        });
        const nearest = alive.reduce((a, p) => Math.abs(p.x - fe.x) < Math.abs(a.x - fe.x) ? p : a, alive[0]);

        if (fe.state === 'idle') {
            fe.facingLeft = nearest.x < fe.x;
            if (Math.abs(nearest.x - fe.x) > def.halfW + 30) {
                fe.x += Math.sign(nearest.x - fe.x) * def.walkSpeed * this.TICK_SECONDS;
                fe.x = Math.max(200, Math.min(def.doorX - 120, fe.x));
            }
            if (--fe.timer <= 0) {
                // Navbat: yaqinda (olov yetadigan masofada) qahramon bo'lsa - har ikkinchi hujum YASHIL OLOV, aks holda kislota
                fe.step = (fe.step || 0) + 1;
                const inFlame = alive.filter(p => Math.abs(p.x - fe.x) <= def.flameRange && p.y > 570 - def.height - 60);
                if (inFlame.length && fe.step % 2 === 0) {
                    const target = inFlame.reduce((a, p) => Math.abs(p.x - fe.x) < Math.abs(a.x - fe.x) ? p : a, inFlame[0]);
                    fe.targetId = target.id;
                    fe.facingLeft = target.x < fe.x;
                    fe.state = 'fcharge';
                    fe.timer = T(def.flameWarnMs);
                    this.io.to(roomId).emit('feFlameWarn', { x: Math.round(fe.x) });
                } else {
                    // Tasodifiy qahramonga mo'ljal oladi
                    const target = alive[Math.floor(Math.random() * alive.length)];
                    fe.targetId = target.id;
                    fe.facingLeft = target.x < fe.x;
                    fe.state = 'charge';
                    fe.timer = T(def.spitChargeMs);
                }
            }
        } else if (fe.state === 'charge') {
            const target = fe.targetId ? room.players[fe.targetId] : null;
            if (target && !target.isDead) fe.facingLeft = target.x < fe.x;
            if (--fe.timer <= 0) {
                // KISLOTA: juda ANIQ - nishon yugurayotgan bo'lsa, yetib boradigan joyiga (oldindan) otadi; uzoqqa ham tez
                // uchadi. O'rtadagi tomchi - aynan nishonga, qolganlari zich (qochish uchun yon tomonga sakrash kerak)
                const t = target && !target.isDead ? target : nearest;
                const sx = mouthX(), sy = mouthY;
                const mo = this.playerMotion.get(t.id);
                for (let k = 0; k < def.acidPerSpit; k++) {
                    const off = (k - (def.acidPerSpit - 1) / 2) * 28;
                    const flight = Math.max(0.45, Math.min(1.05, Math.abs(t.x - sx) / 760)) + Math.abs(off) / 900;
                    const lead = mo ? Math.max(-240, Math.min(240, mo.vx * flight * 0.9)) : 0;
                    const tx = t.x + lead + off;
                    const vx = (tx - sx) / flight;
                    const vy = (t.y - sy - 0.5 * 900 * flight * flight) / flight;
                    room.acidCounter = (room.acidCounter || 0) + 1;
                    acid.push({ id: 'acid_' + room.acidCounter, x: sx, y: sy, vx, vy });
                }
                fe.state = 'spit';
                fe.timer = T(450);
            }
        } else if (fe.state === 'fcharge') {
            // Og'zida yashil olov yig'adi - nishon tomonga buriladi, so'ng yo'nalish QOTADI (qochishga ulgurish mumkin)
            const target = fe.targetId ? room.players[fe.targetId] : null;
            if (target && !target.isDead && fe.timer > T(250)) fe.facingLeft = target.x < fe.x;
            if (--fe.timer <= 0) { fe.state = 'flame'; fe.timer = T(def.flameMs); fe.flameHit = 0; this.io.to(roomId).emit('feFlame', { x: Math.round(fe.x) }); }
        } else if (fe.state === 'flame') {
            // YASHIL OLOV: og'zidan oldinga, pastga qiyalab - yerda va past tokchada turganlarni kuydiradi
            if ((fe.flameHit || 0) <= 0) {
                fe.flameHit = T(def.flameEveryMs);
                const dir = fe.facingLeft ? -1 : 1;
                const x0 = fe.x + dir * 30, zone = { x: dir > 0 ? x0 : x0 - def.flameLen, y: 570 - def.height + 20, w: def.flameLen, h: def.height - 20 };
                alive.forEach(p => {
                    if (!this.checkOverlap({ x: p.x - this.PLAYER_HALF_W, y: p.y - this.PLAYER_HALF_H, w: this.PLAYER_HALF_W * 2, h: this.PLAYER_HALF_H * 2 }, zone)) return;
                    this.hurtPlayer(p, def.flameDamage);
                    this.knockback(p, dir * 120, -80);
                });
            } else fe.flameHit!--;
            if (--fe.timer <= 0) { fe.state = 'idle'; fe.timer = T(def.spitIntervalMs * (fe.hp < fe.maxHp / 2 ? 0.7 : 1)); }
        } else if (fe.state === 'spit') {
            if (--fe.timer <= 0) {
                fe.state = 'idle';
                // Joni kam qolganda tezroq sepadi
                fe.timer = T(def.spitIntervalMs * (fe.hp < fe.maxHp / 2 ? 0.7 : 1));
            }
        }
    }

    // ===== UNDERWORLD (map-10) =====
    // E: trol yonida - suhbat boshlanadi (hamma ko'radi)
    public talkTroll(room: RoomState, playerId: string): void {
        const def = getMapById(room.selectedLevel).underworld;
        const t = room.uwTalk;
        const p = room.players[playerId];
        if (!def || !t || !p || p.isDead || t.state !== 'idle') return;
        if (Math.abs(p.x - def.trollX) > def.talkRange) return;
        t.state = 'talk';
        t.timer = Math.round(GameEngine.FATELF_TALK_MAX_MS / 30);
        t.by = playerId;
        Object.values(room.players).forEach(pl => { pl.introDone = false; });
    }

    private updateUnderworld(room: RoomState, roomId: string): void {
        const def = getMapById(room.selectedLevel).underworld;
        if (!def || room.isOver) return;
        const T = (ms: number) => Math.round(ms / 30);
        const alive = Object.values(room.players).filter(p => !p.isDead);
        // Og'zibor gullar
        (room.flowers || []).forEach((f) => {
            if (f.cooldown > 0) f.cooldown--;
            const near = (r: number) => alive.filter(p => Math.abs(p.x - f.x) < r && p.y + this.PLAYER_HALF_H > 570 - 160);
            if (f.state === 'hidden') {
                if (near(def.flowerWakeRange).length) { f.state = 'emerge'; f.timer = T(700); }
            } else if (f.state === 'emerge') {
                if (--f.timer <= 0) { f.state = 'idle'; f.cooldown = T(400); }
            } else if (f.state === 'idle') {
                if (f.cooldown <= 0 && near(def.flowerBiteRange).length) { f.state = 'bite'; f.timer = T(450); f.bitten = false; }
            } else if (f.state === 'bite') {
                f.timer--;
                // Og'iz yopiladigan payt - yaqindagilar tishlanadi va nari otiladi
                if (!f.bitten && f.timer <= T(220)) {
                    f.bitten = true;
                    near(def.flowerBiteRange + 15).forEach(p => {
                        this.hurtPlayer(p, def.flowerBiteDamage);
                        this.knockback(p, (p.x >= f.x ? 1 : -1) * 520, -260);
                    });
                }
                if (f.timer <= 0) { f.state = 'idle'; f.cooldown = T(900); }
            } else if (f.state === 'frozen') {
                if (--f.timer <= 0) { f.state = 'idle'; f.cooldown = T(600); }
            }
        });
        // Trol bilan suhbat: hamma o'qib bo'lgach (ko'pi bilan 60s) - xarita o'tildi
        const t = room.uwTalk;
        if (t && t.state === 'talk') {
            if ((alive.length > 0 && alive.every(p => p.introDone)) || --t.timer <= 0) {
                t.state = 'done';
                const winner = (t.by && room.players[t.by]) ? t.by : (alive[0] || Object.values(room.players)[0])?.id;
                if (winner) this.roomManager.declareWinner(roomId, winner).catch(err => console.error('declareWinner xatosi:', err));
            }
        }
    }

    // ===== ARENA (bonus) =====
    private updateArena(room: RoomState): void {
        const map = getMapById(room.selectedLevel);
        const ar = map.arena, A = room.arena;
        if (!ar || !A || room.isOver) return;
        A.tick++;
        const players = Math.max(1, Object.values(room.players).filter(p => !p.isDead).length);
        // Robot otryadi: kuchli robotlar qolmasa - boss yengildi
        if (A.boss === 'squad' && !room.bots.some(b => b.elite)) { this.arenaBossBeaten(room); return; }
        if (A.boss) return;   // boss paytida yangi oddiy botlar chiqmaydi
        // Oddiy botlar: navbat bilan tepadan tushadi; har boss yengilgach - kuchliroq
        const want = Math.min(ar.maxBots, players);
        if (room.bots.length < want && A.tick >= A.nextSpawnTick) {
            const z = map.botSpawnZone;
            const hp = Math.round(GameEngine.BOT_MAX_HP * (1 + 0.2 * A.bossesBeaten));
            const bot = GameEngine.createBots(room.id, [{ x: z.xStart + Math.random() * (z.xEnd - z.xStart), y: z.y }], 'robot', hp)[0];
            bot.id += '_' + A.tick;
            room.bots.push(bot);
            A.nextSpawnTick = A.tick + Math.round(ar.spawnIntervalMs / 30);
        }
    }

    // ===== SARIQ ESHIK =====
    public doorChoice(room: RoomState, playerId: string, choice: 'enter' | 'no'): void {
        const dr = room.doors, d = getMapById(room.selectedLevel).doors;
        if (!dr || !d || dr.state !== 'choose' || room.isOver || d.doorLocked) return;
        dr.choice = choice;
        dr.state = 'free';
        this.io.to(room.id).emit('doorsChosen', { choice, by: room.players[playerId]?.nickname || '' });
        // "Respect": kirishni tanlaganda - har kimga (akkauntga bir marta) +200 XP
        if (choice === 'enter') Object.values(room.players).forEach(p => {
            this.roomManager.grantAchievement(room.id, p.id, 'respect', d.respectXp).catch(err => console.error('grantAchievement xatosi:', err));
        });
    }
    // E: sariq eshik oldida - ichkariga (hamma birga); ichkarida richag oldida - tortadi
    public doorsInteract(room: RoomState, playerId: string): void {
        const dr = room.doors, d = getMapById(room.selectedLevel).doors;
        const p = room.players[playerId];
        if (!dr || !d || !p || p.isDead || room.isOver) return;
        if (dr.state === 'free' && dr.choice === 'enter' && Math.abs(p.x - d.yellowX) <= 50 && p.y + this.PLAYER_HALF_H >= 560) {
            dr.state = 'room';
            dr.sub = 'elf';
            dr.timer = Math.round(40000 / 30);
            let slot = 0;
            Object.values(room.players).forEach(pl => {
                pl.introDone = false;
                pl.x = d.roomEntryX + (slot++) * 32; pl.y = d.floorY - this.PLAYER_HALF_H;
                this.io.to(pl.id).emit('teleport', { x: pl.x, y: pl.y });
            });
            this.io.to(room.id).emit('doorsEnter');
            return;
        }
        if (dr.state === 'room' && dr.sub === 'lever' && Math.abs(p.x - d.leverX) <= 50) {
            dr.sub = 'drop';
            dr.monster = { x: d.elfX, y: -160, vy: 0, pose: 'drop', facing: 1 };
            this.io.to(room.id).emit('leverPulled');
        }
    }
    private updateDoors(room: RoomState, roomId: string): void {
        const map = getMapById(room.selectedLevel);
        const d = map.doors, dr = room.doors;
        if (!d || !dr || room.isOver) return;
        const T = (ms: number) => Math.round(ms / 30);
        dr.tick++;
        const alive = Object.values(room.players).filter(p => !p.isDead);
        const allRead = () => alive.every(p => p.introDone);
        if (dr.state === 'walk') {
            if (!alive.some(p => p.x >= d.triggerX)) return;
            dr.state = 'talk';
            dr.timer = T(40000);
            Object.values(room.players).forEach(p => { p.introDone = false; });
            this.io.to(roomId).emit('doorsAppear');
            return;
        }
        if (dr.state === 'talk') {
            if (--dr.timer <= 0 || allRead()) {
                // Eshik yopiq bo'lsa - tanlov yo'q: darhol tog'ga chiqish yo'li
                if (d.doorLocked) { dr.state = 'free'; dr.choice = 'no'; this.io.to(roomId).emit('doorsLocked'); }
                else { dr.state = 'choose'; dr.timer = T(30000); this.io.to(roomId).emit('doorsChoose'); }
            }
            return;
        }
        if (dr.state === 'choose') {
            if (--dr.timer <= 0) this.doorChoice(room, Object.keys(room.players)[0], 'no');
            return;
        }
        if (dr.state === 'free') {
            // "Yo'q" tanlanganda - faqat tepaga chiqish: tog' etagiga yetganda boshlanadi
            if (dr.choice === 'no' && alive.some(p => p.x >= d.climbX0 + 20)) {
                dr.state = 'climb';
                dr.segment = 0;
                dr.nextWave = dr.tick + T(800);
                this.io.to(roomId).emit('climbStart');
            }
            return;
        }
        if (dr.state === 'climb') { this.updateClimb(room, roomId, map, d, dr, alive); return; }
        if (dr.state === 'room') this.updateRoom(room, roomId, map, d, dr, alive);
    }
    private platOfPlayer(map: MapDef, idxs: number[], p: PlayerState): number {
        const feet = p.y + this.PLAYER_HALF_H;
        for (const i of idxs) {
            const pl = map.platforms[i];
            if (p.x >= pl.x - 6 && p.x <= pl.x + pl.w + 6 && Math.abs(feet - pl.y) <= 10) return i;
        }
        return -1;
    }
    private updateClimb(room: RoomState, roomId: string, map: MapDef, d: NonNullable<MapDef['doors']>, dr: NonNullable<RoomState['doors']>, alive: PlayerState[]): void {
        const T = (ms: number) => Math.round(ms / 30);
        const per = d.climbPlats.length / d.segments;
        const goal = d.climbPlats[d.climbPlats.length - 1];
        // Eng tepadagi platformaga yetgan - kutadi; HAMMA tirik qahramon yetganda butun tog' (10 qavat) o'tiladi
        // (bu musobaqa emas - birgalikda o'ynaladi)
        alive.forEach(p => { if (this.platOfPlayer(map, [goal], p) === goal && !room.checkpointReached.includes(p.id)) room.checkpointReached.push(p.id); });
        if (alive.length && alive.every(p => room.checkpointReached.includes(p.id))) {
            dr.state = 'done';
            dr.wave = null;
            this.roomManager.declareWinner(roomId, room.checkpointReached.find(id => alive.some(p => p.id === id)) || alive[0].id)
                .catch(err => console.error('declareWinner xatosi:', err));
            return;
        }
        // Qahramon qaysi qavatda (oyog'i balandligi bo'yicha)
        const stageOf = (p: PlayerState) => Math.max(0, Math.min(d.segments - 1, Math.floor((490 - (p.y + this.PLAYER_HALF_H)) / d.stageStep)));
        // Qaysi qatorda: o'rtadagi platformadan pastda - 0 (pastki), o'rtadagi platformada va undan yuqorida - 1 (yuqori).
        // Qavatning eng tepadagi platformasida turgan - hech qaysi (-1): u keyingi qavatga o'tish joyi
        // O'rtadagi yakka platforma: qatorlarga kirmagan va eng tepadagisi bo'lmagan yagona platforma
        const midJ = Array.from({ length: per - 1 }, (_, j) => j).find(j => !d.stageRows.some(r => r.includes(j)))!;
        // Qavat va qator: o'rtadagi platformadan pastda - 0 (pastki), o'rtadagida va undan yuqorida - 1 (yuqori).
        // Qavatning eng tepadagi platformasida turgan - keyingi qavatning pastki qatoriga o'tadi (oxirgisi - maqsad)
        const placeOf = (p: PlayerState): { k: number, r: number } | null => {
            const k = stageOf(p), feet = p.y + this.PLAYER_HALF_H;
            // Tog' etagidagi yer - toshlar unga yetmaydi (bu yerda kutish mumkin)
            if (k === 0 && feet > map.platforms[d.climbPlats[0]].y + 40) return null;
            const top = d.climbPlats[k * per + per - 1];
            if (this.platOfPlayer(map, [top], p) === top) return k + 1 < d.segments ? { k: k + 1, r: 0 } : null;
            return { k, r: feet > map.platforms[d.climbPlats[k * per + midJ]].y + 10 ? 0 : 1 };
        };
        dr.segment = alive.reduce((m, p) => Math.max(m, stageOf(p)), 0);
        // Toshlar to'xtovsiz yog'adi: qahramon turgan 4 talik qatorga 3 ta katta tosh (bitta platforma xavfsiz - unga
        // tosh tushmaydi), o'rtadagi va eng tepadagi platformaga ham. Pastda bo'lsa - pastki qatorga, o'rtadan yuqoriga
        // chiqqach - yuqori qatorga. Zarar FAQAT toshga tekkanda va HAR QANDAY holatda: qayerda turgan bo'lsa ham
        let landed = false;
        alive.forEach(p => {
            const i = this.platOfPlayer(map, d.climbPlats, p);
            if (i >= 0 && dr.lastPlat[p.id] !== i) landed = true;
            if (i >= 0) dr.lastPlat[p.id] = i;
        });
        if (!dr.wave && (dr.tick >= dr.nextWave || (landed && dr.tick >= dr.nextWave - T(1500)))) {
            const safes: (number[] | null)[] = new Array(d.segments).fill(null);
            alive.forEach(p => {
                const pl = placeOf(p);
                if (!pl) return;
                const { k, r } = pl;
                if (!safes[k]) safes[k] = d.stageRows.map(() => -1);
                if (safes[k]![r] >= 0) return;
                const row = d.stageRows[r];
                let j = Math.floor(Math.random() * row.length);
                // Ketma-ket bir xil joy xavfsiz bo'lmasin
                if (row[j] === dr.lastSafe[k * 2 + r]) j = (j + 1 + Math.floor(Math.random() * (row.length - 1))) % row.length;
                safes[k]![r] = row[j];
                dr.lastSafe[k * 2 + r] = row[j];
            });
            const rocks: { x: number, y: number, y0: number, ty: number, r: number, hit: string[] }[] = [];
            safes.forEach((sf, k) => {
                if (!sf) return;
                // Qahramon turgan qatorning xavfsizidan boshqa 3 tasi + har doim o'rtadagi va eng tepadagi yakka
                // platformalar: yuqoriga yo'l faqat ular orqali - toshlar orasidan o'tib bo'lmaydi
                const js = new Set<number>([midJ, per - 1]);
                d.stageRows.forEach((row, ri) => { if (sf[ri] >= 0) row.forEach(j => { if (j !== sf[ri]) js.add(j); }); });
                js.forEach(j => {
                    const pl = map.platforms[d.climbPlats[k * per + j]];
                    const r = Math.max(30, Math.round(pl.w / 2) - 4), x = pl.x + pl.w / 2;   // platformadan sal tor - qo'shni platformadagiga tegmasin
                    rocks.push({ x, y: pl.y - 560, y0: pl.y - 560, ty: pl.y - r, r, hit: [] });
                });
            });
            dr.wave = { safes, phase: 'warn', t: T(d.rockWarnMs), n: 0, rocks };
            this.io.to(roomId).emit('climbQuake', { safes, ms: d.rockWarnMs });
        }
        if (dr.wave) {
            const w = dr.wave;
            if (w.phase === 'warn') {
                // Toshlar tezlashib tushadi va ogohlantirish oxirida (2 s) aynan platformaga qo'nadi
                w.n++;
                const total = T(d.rockWarnMs), f = Math.min(1, w.n / total);
                w.rocks.forEach(rk => {
                    rk.y = rk.y0 + (rk.ty - rk.y0) * f * f;
                    alive.forEach(p => {
                        if (rk.hit.includes(p.id)) return;
                        // Tosh (doira) qahramon (to'rtburchak) ga tegdimi. +3 px zaxira: qahramon joyi serverga tarmoq
                        // kechikishi bilan keladi - ekranda tekkandek ko'ringan tosh haqiqatan ham jon olsin
                        const cx = Math.max(p.x - this.PLAYER_HALF_W, Math.min(rk.x, p.x + this.PLAYER_HALF_W));
                        const cy = Math.max(p.y - this.PLAYER_HALF_H, Math.min(rk.y, p.y + this.PLAYER_HALF_H));
                        if (Math.hypot(rk.x - cx, rk.y - cy) > rk.r + 3) return;
                        rk.hit.push(p.id);
                        this.hurtPlayer(p, Math.round((p.maxHp || 100) * d.rockDamagePct));
                        this.knockback(p, (p.x < rk.x ? -1 : 1) * 160, 200);
                        this.io.to(roomId).emit('rockHit', { id: p.id, x: Math.round(p.x), y: Math.round(p.y) });
                    });
                });
                if (w.n >= total) {
                    w.phase = 'fall';
                    w.t = T(350);
                    this.io.to(roomId).emit('climbRocks', { safes: w.safes });
                }
                return;
            }
            if (--w.t <= 0) {
                dr.wave = null;
                dr.nextWave = dr.tick + T(d.rockEveryMs);
            }
        }
    }
    // Tupurib chiqarish / qo'yib yuborish joyi: bo'shliq ustida emas - ustun ustida
    private caveSafeX(d: NonNullable<MapDef['doors']>, x: number): number {
        const h = d.floorHoles.find(q => x >= q.x - 24 && x <= q.x + q.w + 24);
        if (h) x = h.x - 40;
        return Math.max(d.roomX0 + 80, Math.min(d.exitX - 40, x));
    }
    private updateRoom(room: RoomState, roomId: string, map: MapDef, d: NonNullable<MapDef['doors']>, dr: NonNullable<RoomState['doors']>, alive: PlayerState[]): void {
        const T = (ms: number) => Math.round(ms / 30);
        // Malikani qoldirib (richagni tortmasdan) 200 m ketsa - OQ YUZ oldindagi qorong'idan yugurib keladi
        if ((dr.sub === 'elf' || dr.sub === 'lever') && alive.some(p => p.x >= d.leverX + d.huntMeters * 50)) {
            const runner = alive.reduce((a, b) => (b.x > a.x ? b : a));
            dr.sub = 'hunt';
            dr.monster = { x: Math.min(d.roomX1 - 40, runner.x + 700), y: d.floorY, vy: 0, pose: 'crawl', facing: -1 };
            this.io.to(roomId).emit('oqHunt', { x: Math.round(dr.monster.x) });
            return;
        }
        if (dr.sub === 'elf') {
            if (--dr.timer <= 0 || alive.every(p => p.introDone)) dr.sub = 'lever';
            return;
        }
        const mo = dr.monster;
        if (dr.sub === 'hunt' && mo) {
            const target = alive.slice().sort((a, b) => Math.abs(a.x - mo.x) - Math.abs(b.x - mo.x))[0];
            if (!target) return;
            const dir: 1 | -1 = target.x >= mo.x ? 1 : -1;
            mo.facing = dir;
            mo.x += dir * d.huntSpeed * this.TICK_SECONDS;
            if (Math.abs(target.x - mo.x) <= 46) {
                // Ushladi: skrimer, baqiriq - va o'yin tugaydi
                dr.sub = 'caught';
                dr.timer = T(2300);
                mo.x = target.x - dir * 30;
                Object.values(room.players).forEach(p => this.io.to(p.id).emit('grabbed', { ms: 3000 }));
                this.io.to(roomId).emit('oqCaught', { id: target.id, x: Math.round(target.x) });
            }
            return;
        }
        if (dr.sub === 'caught') {
            if (--dr.timer <= 0) {
                dr.state = 'done';
                this.roomManager.declareGameOverLoss(roomId).catch(err => console.error('declareGameOverLoss xatosi:', err));
            }
            return;
        }
        if (dr.sub === 'drop' && mo) {
            // Tepadan tushadi: malikani bosib (qon), keyin yo'lga - g'or silkinib, ustunlar orasi ochiladi
            const before = mo.y;
            mo.vy = Math.min(900, mo.vy + 900 * this.TICK_SECONDS);
            mo.y += mo.vy * this.TICK_SECONDS;
            if (before < d.elfY + 60 && mo.y >= d.elfY + 60) this.io.to(roomId).emit('elfCrushed', { x: d.elfX, y: d.elfY });
            if (mo.y >= d.floorY) {
                mo.y = d.floorY; mo.vy = 0; mo.pose = 'crawl'; mo.facing = 1;
                dr.sub = 'take';
                dr.floorOpen = true;
                this.io.to(roomId).emit('monsterLanded');
                this.io.to(roomId).emit('floorOpen');
            }
            return;
        }
        if (dr.sub === 'take' && mo) {
            // Malikani sudrab birinchi bo'shliqqa olib kirib ketadi
            const hole = d.floorHoles.find(h => h.x + h.w / 2 > mo.x) || d.floorHoles[0];
            const hx = hole.x + hole.w / 2;
            mo.x = Math.min(hx, mo.x + 7);
            if (mo.x >= hx) {
                mo.pose = 'hidden';
                dr.sub = 'shock';
                dr.timer = T(7000);
                Object.values(room.players).forEach(p => { p.introDone = false; });
                this.io.to(roomId).emit('monsterDive', { x: Math.round(hx) });
            }
            return;
        }
        if (dr.sub === 'shock') {
            if (--dr.timer <= 0 || alive.every(p => p.introDone)) {
                dr.sub = 'fight';
                dr.nextHead = dr.tick + T(1500);
                dr.nextHand = dr.tick + T(1000);
            }
            return;
        }
        if (dr.sub === 'buried') {
            if (--dr.timer <= 0) {
                dr.state = 'done';
                const winner = (dr.lastHitBy && room.players[dr.lastHitBy]) ? dr.lastHitBy : (alive[0] || Object.values(room.players)[0])?.id;
                if (winner) this.roomManager.declareWinner(roomId, winner).catch(err => console.error('declareWinner xatosi:', err));
            }
            return;
        }
        // JARLIK: ustunlar orasiga tushib ketgan qahramon halok bo'ladi
        if (dr.floorOpen) alive.forEach(p => {
            if (p.y <= this.PIT_DEATH_Y || dr.swallowed.some(w => w.id === p.id)) return;
            if (!d.floorHoles.some(g => p.x >= g.x - 20 && p.x <= g.x + g.w + 20)) return;
            this.killPlayer(p);
            this.io.to(roomId).emit('pitFall', { id: p.id, x: Math.round(p.x) });
        });
        if (dr.sub !== 'fight') return;
        dr.swallowed = dr.swallowed.filter(w => room.players[w.id] && !room.players[w.id].isDead);
        const inTunnel = new Set(dr.swallowed.map(w => w.id));
        const free = alive.filter(p => !inTunnel.has(p.id));
        const onTop = (p: PlayerState) => Math.abs(p.y + this.PLAYER_HALF_H - d.floorY) <= 12;

        // QOCHISH: yorug'likka yetganlar kutadi; HAMMA tirik qahramon yetganda - orqada g'or qulaydi
        free.forEach(p => { if (p.x >= d.exitX && !room.checkpointReached.includes(p.id)) room.checkpointReached.push(p.id); });
        const out = alive.length && alive.every(p => room.checkpointReached.includes(p.id)) ? free.find(p => p.x >= d.exitX) : undefined;
        if (out) {
            dr.swallowed.forEach(w => {
                const p = room.players[w.id], h = d.wallHoles[w.hole];
                p.x = this.caveSafeX(d, h.x); p.y = d.floorY - 30;
                this.io.to(p.id).emit('teleport', { x: p.x, y: p.y });
                this.io.to(roomId).emit('spitOut', { id: p.id, i: w.hole });
            });
            dr.swallowed = [];
            dr.hands = [];
            dr.shrooms = [];
            dr.heads.forEach(h => { h.phase = 'idle'; });
            dr.lastHitBy = out.id;
            dr.sub = 'buried';
            dr.timer = T(3600);
            this.io.to(roomId).emit('monsterBuried', { x: Math.round(out.x - 320), y: 570, sunX: d.exitX });
            return;
        }

        // 1) BO'SHLIQLARDAN QO'LLAR: avval qizil ogohlantirish, keyin jarlikdan qo'l chiqib, oldidagi ustun ustiga
        // egilib ushlashga urinadi va yana kirib ketadi. Faqat egilgan qo'l haqiqatan tekkan joydagi qahramon ushlanadi
        if (dr.tick >= dr.nextHand) {
            dr.nextHand = dr.tick + T(d.holeHandEveryMs);
            free.forEach(p => {
                if (!onTop(p)) return;
                let best = -1, bestD = 1e9, side: -1 | 1 = -1;
                d.floorHoles.forEach((g, k) => {
                    const dist = p.x < g.x ? g.x - p.x : p.x > g.x + g.w ? p.x - (g.x + g.w) : 0;
                    if (dist < bestD) { bestD = dist; best = k; side = p.x < g.x + g.w / 2 ? -1 : 1; }
                });
                if (best < 0 || bestD > d.holeHandReach + 70 || dr.tick < dr.holeCd[best] || dr.hands.some(hd => hd.hole === best)) return;
                const g = d.floorHoles[best];
                dr.hands.push({ id: 'hand_' + (++dr.counter), x: side < 0 ? g.x + 12 : g.x + g.w - 12, y: d.floorY, side, hole: best,
                    phase: 'warn', t: T(d.holeHandWarnMs), hit: false });
                dr.holeCd[best] = dr.tick + T(d.holeHandCdMs);
            });
        }
        for (let k = dr.hands.length - 1; k >= 0; k--) {
            const h = dr.hands[k];
            if (h.phase === 'warn') {
                if (--h.t > 0) continue;
                h.phase = 'up';
                h.t = T(d.holeHandUpMs);
                continue;
            }
            // Qo'l chiqib, ustun ustiga egilib bo'lgan lahza: barmoqlar tushgan joyda turgan bo'lsa - ushlaydi.
            // Kechikish uchun qahramonning hozirgi harakati hisobga olinadi (u allaqachon qochib ketgan bo'lsa - tegmaydi)
            if (!h.hit && h.t === T(d.holeHandUpMs) - T(d.holeHandGrabAtMs)) {
                h.hit = true;
                const g = d.floorHoles[h.hole];
                const edge = h.side < 0 ? g.x : g.x + g.w;
                const x0 = h.side < 0 ? edge - d.holeHandReach : edge - 6;
                const x1 = h.side < 0 ? edge + 6 : edge + d.holeHandReach;
                const p = free.find(q => {
                    if (!onTop(q)) return false;
                    const vx = this.playerMotion.get(q.id)?.vx || 0;
                    const qx = q.x + Math.max(-40, Math.min(40, vx * 0.12));
                    return q.x >= x0 && q.x <= x1 && qx >= x0 && qx <= x1;
                });
                if (p) {
                    this.hurtPlayer(p, d.holeDamage);
                    this.io.to(p.id).emit('grabbed', { ms: d.grabMs });
                    this.io.to(roomId).emit('handGrab', { x: Math.round(h.x), id: p.id });
                }
            }
            if (--h.t <= 0) dr.hands.splice(k, 1);
        }

        // 2) TUNNEL: tortilgan qahramon ichkarida; keyin boshqa (qo'shni) teshikdan tupurib chiqariladi - jonining yarmi
        for (let k = dr.swallowed.length - 1; k >= 0; k--) {
            const w = dr.swallowed[k], p = room.players[w.id], h = d.wallHoles[w.hole];
            p.x = h.x; p.y = h.y;
            if (--w.t > 0) continue;
            const options = [w.hole - 1, w.hole + 1].filter(q => q >= 0 && q < d.wallHoles.length);
            const ei = options.length ? options[Math.floor(Math.random() * options.length)] : w.hole;
            const eh = d.wallHoles[ei];
            p.x = this.caveSafeX(d, eh.x); p.y = Math.min(d.floorY - 30, eh.y + 10);
            dr.swallowed.splice(k, 1);
            this.io.to(p.id).emit('teleport', { x: p.x, y: p.y });
            this.io.to(roomId).emit('spitOut', { id: p.id, i: ei, x: Math.round(p.x), y: Math.round(p.y) });
            this.hurtPlayer(p, Math.round((p.maxHp || 100) * d.swallowDamagePct));
            // Tupurib chiqarilgan qahramonni darhol yana ushlamasin: bir muddat hech qaysi bosh hujum qilmaydi
            dr.grabImmune[p.id] = dr.tick + T(d.grabImmuneMs);
            dr.heads[ei].cd = Math.max(dr.heads[ei].cd, dr.tick + T(d.headCdMs));
        }

        // 3) DEVORDAGI TESHIKLAR: ko'zlar yonadi -> bosh otilib chiqadi -> yaqindagini tunnelga tortadi
        dr.heads.forEach((h, k) => {
            if (h.phase === 'idle') return;
            if (--h.t > 0) return;
            if (h.phase === 'warn') {
                h.phase = 'lunge';
                h.t = T(d.headLungeMs);
                const w = d.wallHoles[k];
                const busy = new Set(dr.swallowed.map(q => q.id));
                // Masofa - qahramon tanasining eng yaqin nuqtasigacha (baland teshikdan ham boshiga yetadi)
                const reachOf = (p: PlayerState) => Math.hypot(w.x - Math.max(p.x - this.PLAYER_HALF_W, Math.min(w.x, p.x + this.PLAYER_HALF_W)),
                    w.y - Math.max(p.y - this.PLAYER_HALF_H, Math.min(w.y, p.y + this.PLAYER_HALF_H)));
                const victim = free.filter(p => !busy.has(p.id) && !((dr.grabImmune[p.id] || 0) > dr.tick) && reachOf(p) <= w.r + d.headReach)
                    .sort((a, b) => reachOf(a) - reachOf(b))[0];
                this.io.to(roomId).emit('headLunge', { i: k, hit: victim ? victim.id : null });
                if (victim) {
                    dr.swallowed.push({ id: victim.id, hole: k, t: T(d.swallowMs) });
                    this.io.to(victim.id).emit('grabbed', { ms: d.swallowMs + 300 });
                    this.io.to(roomId).emit('swallowed', { id: victim.id, i: k });
                }
            } else if (h.phase === 'lunge') { h.phase = 'back'; h.t = T(d.headBackMs); }
            else h.phase = 'idle';
        });
        const active = dr.heads.filter(h => h.phase !== 'idle').length;
        const maxActive = Math.min(3, 1 + Math.floor(alive.length / 2));
        if (dr.tick >= dr.nextHead && active < maxActive) {
            const cands: number[] = [];
            d.wallHoles.forEach((w, k) => {
                const h = dr.heads[k];
                if (h.phase !== 'idle' || dr.tick < h.cd) return;
                if (free.some(p => !((dr.grabImmune[p.id] || 0) > dr.tick) && Math.abs(p.x - w.x) <= d.headTrigger && p.y > w.y - 60)) cands.push(k);
            });
            if (cands.length) {
                const k = cands[Math.floor(Math.random() * cands.length)];
                const h = dr.heads[k];
                h.phase = 'warn';
                h.t = T(d.headWarnMs);
                h.cd = dr.tick + T(d.headCdMs);
                dr.nextHead = dr.tick + T(d.headGlobalMs);
                this.io.to(roomId).emit('headWarn', { i: k });
            }
        }

        // 4) QO'ZIQORINCHALAR
        this.updateShrooms(room, roomId, map, d, dr, free);
    }

    // G'OR QO'ZIQORINCHASI (bir vaqtda bittasi; o'lgach - yangisi): oldinda (ba'zan orqada) qorong'idan chiqadi, eng yaqin qahramonga yuguradi,
    // bo'shliqqa yetganda sakrab o'tadi, o'q kelayotganini ko'rsa - sakrab qochadi, yaqinlashganda ustiga
    // otiladi; tegsa -20 va itarib yuboradi (jarlikka ham). Jarlikka tushsa - o'ladi
    private updateShrooms(room: RoomState, roomId: string, map: MapDef, d: NonNullable<MapDef['doors']>,
        dr: NonNullable<RoomState['doors']>, free: PlayerState[]): void {
        const T = (ms: number) => Math.round(ms / 30), dt = this.TICK_SECONDS, G = 1000;
        const blocks = map.platforms.slice(d.climbPlats.length);
        const onPillar = (x: number) => blocks.some(b => x >= b.x - 2 && x <= b.x + b.w + 2);
        // Paydo bo'lish
        const maxN = d.shroomMax;
        if (free.length && dr.tick >= dr.nextShroom && dr.shrooms.length < maxN) {
            dr.nextShroom = dr.tick + T(d.shroomEveryMs);
            const lead = free.reduce((a, b) => (b.x > a.x ? b : a));
            const side = Math.random() < 0.7 ? 1 : -1;
            const want = Math.max(d.elfX + 400, Math.min(d.exitX - 250, lead.x + side * (420 + Math.random() * 160)));
            const b = blocks.filter(q => q.w >= 60 && q.x > d.elfX + 300 && q.x + q.w < d.exitX - 150)
                .sort((p1, p2) => Math.abs(p1.x + p1.w / 2 - want) - Math.abs(p2.x + p2.w / 2 - want))[0];
            if (b) dr.shrooms.push({ id: 'shroom_' + (++dr.counter), x: b.x + b.w / 2, y: d.floorY, vx: 0, vy: 0, hp: d.shroomHp, air: false,
                facing: -1, atkCd: 0, jumpCd: T(400), flash: 0 });
        }
        for (let i = dr.shrooms.length - 1; i >= 0; i--) {
            const m = dr.shrooms[i];
            if (m.flash > 0) m.flash--;
            if (m.atkCd > 0) m.atkCd--;
            if (m.jumpCd > 0) m.jumpCd--;
            const target = free.slice().sort((a, b) => Math.abs(a.x - m.x) - Math.abs(b.x - m.x))[0];
            if (!m.air && target) {
                const dx = target.x - m.x, dir: 1 | -1 = dx >= 0 ? 1 : -1;
                m.facing = dir;
                // O'q kelyapti - sakrab qochadi
                const threat = room.bullets.some(b => Math.abs(b.y - (m.y - 29)) < 50 && Math.abs(b.x - m.x) < 160 && b.vx !== 0 && Math.sign(m.x - b.x) === Math.sign(b.vx));
                if (threat && m.jumpCd <= 0) { m.vy = -400; m.vx = dir * 90; m.air = true; m.jumpCd = T(900); }
                // Yaqin - ustiga otiladi
                else if (Math.abs(dx) < 80 && Math.abs(target.y + this.PLAYER_HALF_H - m.y) < 70 && m.atkCd <= 0 && m.jumpCd <= 0) {
                    m.vy = -300; m.vx = dir * 250; m.air = true; m.jumpCd = T(1200);
                } else if (Math.abs(dx) > 26) {
                    // Oldinda bo'shliq - sakrab o'tadi (yetarli tezlik bilan), aks holda yuradi
                    if (!onPillar(m.x + dir * 26)) { if (m.jumpCd <= 0) { m.vy = -420; m.vx = dir * 265; m.air = true; m.jumpCd = T(500); } }
                    else m.x += dir * d.shroomSpeed * dt;
                }
            }
            if (!m.air && !onPillar(m.x)) m.air = true;   // itarib yuborildi / ustun cheti
            if (m.air) {
                m.vy += G * dt;
                m.x += m.vx * dt;
                const ny = m.y + m.vy * dt;
                if (m.vy > 0 && m.y <= d.floorY + 1 && ny >= d.floorY && onPillar(m.x)) { m.y = d.floorY; m.vy = 0; m.vx = 0; m.air = false; }
                else m.y = ny;
                if (m.y > 700) {
                    dr.shrooms.splice(i, 1);
                    dr.nextShroom = dr.tick + T(d.shroomRespawnMs);
                    this.io.to(roomId).emit('shroomDie', { id: m.id, x: Math.round(m.x), y: 600, fall: true });
                    continue;
                }
            }
            m.x = Math.max(d.roomX0 + 60, Math.min(d.exitX - 40, m.x));
            // Tegsa: -20 va itarib yuboradi
            if (m.atkCd <= 0) {
                const hit = free.find(p => Math.abs(p.x - m.x) < this.PLAYER_HALF_W + 20 && Math.abs(p.y - (m.y - 29)) < this.PLAYER_HALF_H + 29);
                if (hit) {
                    this.hurtPlayer(hit, d.shroomDamage);
                    this.knockback(hit, (hit.x >= m.x ? 1 : -1) * 260, -220);
                    m.atkCd = T(1100);
                    this.io.to(roomId).emit('shroomBite', { id: hit.id, x: Math.round(m.x), y: Math.round(m.y) });
                }
            }
        }
    }

    // ===== KALMAR =====
    private updateSquid(room: RoomState, roomId: string): void {
        const map = getMapById(room.selectedLevel);
        const d = map.squid, sq = room.squid;
        if (!d || !sq || room.isOver) return;
        const T = (ms: number) => Math.round(ms / 30);
        const alive = Object.values(room.players).filter(p => !p.isDead);
        sq.tick++;
        if (sq.hitFlash > 0) sq.hitFlash--;
        // Suvga tushgan qahramon cho'kadi
        alive.forEach(p => { if (p.y > this.PIT_DEATH_Y) this.killPlayer(p); });
        if (sq.state === 'sleep') {
            if (!alive.some(p => p.x >= d.triggerX)) return;
            sq.state = 'rise';
            sq.timer = T(2200);
            Object.values(room.players).forEach(p => {
                if (p.x >= d.arenaX + 30 && p.x <= d.arenaX + d.arenaW - 30) return;
                p.x = d.entryX; p.y = d.entryY;
                this.io.to(p.id).emit('teleport', { x: p.x, y: p.y });
            });
            this.io.to(roomId).emit('squidRise');
            return;
        }
        if (sq.state === 'dying') {
            // Kraken butunlay suv ostiga cho'kib ketadi (tanasi ko'zdan ~240px tepada) - shundan keyin xarita o'tiladi
            if (sq.eyeY < 850) { sq.eyeY += 5; return; }
            if (--sq.timer === 0) {
                const winner = (sq.lastHitBy && room.players[sq.lastHitBy]) ? sq.lastHitBy : (alive[0] || Object.values(room.players)[0])?.id;
                if (winner) this.roomManager.declareWinner(roomId, winner).catch(err => console.error('declareWinner xatosi:', err));
            }
            return;
        }
        // Harakat: ko'z sekin tepaga-pastga va chapga-o'ngga suzadi
        const ph = sq.tick * 2 * Math.PI;
        const targetEyeY = d.eyeBaseY + d.eyeAmpY * Math.sin(ph / T(7000));
        sq.x = d.baseX + d.xAmp * Math.sin(ph / T(11000));
        if (sq.state === 'rise') {
            sq.eyeY = Math.max(targetEyeY, sq.eyeY - 6);   // suvdan ko'tarilib chiqadi
            if (--sq.timer <= 0) {
                sq.state = 'fight';
                sq.nextSlam = sq.tick + T(1500);
                sq.nextGeyser = sq.tick + T(3500);
                sq.nextFish = sq.tick + T(5500);
            }
            return;
        }
        sq.eyeY = targetEyeY;
        if (sq.splashX !== null && sq.tick % T(400) === 0) sq.splashX = null;
        const nextId = (k: string) => 'sq' + k + '_' + (++sq.counter);
        const platOf = (p: PlayerState): number => {
            const feet = p.y + this.PLAYER_HALF_H;
            let best = -1, bestY = 1e9;
            d.arenaPlats.forEach(i => {
                const pl = map.platforms[i];
                if (p.x >= pl.x - 8 && p.x <= pl.x + pl.w + 8 && pl.y >= feet - 12 && pl.y < bestY) { best = i; bestY = pl.y; }
            });
            return best;
        };

        // 1) QO'L BILAN URISH: qahramon turgan (yoki tushadigan) platformaga tepadan
        if (!sq.slam && sq.tick >= sq.nextSlam) {
            const cands = alive.map(p => platOf(p)).filter(i => i >= 0);
            if (cands.length) {
                const i = cands[Math.floor(Math.random() * cands.length)];
                const pl = map.platforms[i];
                sq.slam = { plat: i, phase: 'raise', t: T(d.slamRaiseMs), x0: pl.x - 10, x1: pl.x + pl.w + 10, y: pl.y, hit: [] };
            } else sq.nextSlam = sq.tick + T(500);
        }
        if (sq.slam) {
            const sl = sq.slam;
            if (--sl.t <= 0 && sl.phase === 'raise') {
                sl.phase = 'slam'; sl.t = T(450);
                this.io.to(roomId).emit('squidSlam', { x: Math.round((sl.x0 + sl.x1) / 2), y: sl.y });
            } else if (sl.phase === 'slam') {
                // Platforma ustida (va uning tepasida havoda) turganlarga tegadi
                alive.forEach(p => {
                    if (sl.hit.includes(p.id) || p.x < sl.x0 || p.x > sl.x1) return;
                    const feet = p.y + this.PLAYER_HALF_H;
                    if (feet > sl.y + 6 || feet < sl.y - 150) return;
                    sl.hit.push(p.id);
                    this.hurtPlayer(p, d.slamDamage);
                    this.knockback(p, (p.x < (sl.x0 + sl.x1) / 2 ? -1 : 1) * 300, -200);
                });
                if (sl.t <= 0) { sq.slam = null; sq.nextSlam = sq.tick + T(d.slamEveryMs); }
            }
        }

        // 2) GEYZERLAR: ikkitasi (biri qahramon ostidan) - suv oqimi ekranning eng tepasigacha otiladi
        if (sq.tick >= sq.nextGeyser) {
            const target = alive[Math.floor(Math.random() * alive.length)];
            if (target) {
                const x1 = Math.max(d.arenaX + 60, Math.min(d.arenaX + d.arenaW - 60, target.x));
                let x2 = d.arenaX + 80 + Math.random() * (d.arenaW - 160);
                if (Math.abs(x2 - x1) < 120) x2 = x1 + (x1 < d.arenaX + d.arenaW / 2 ? 260 : -260);
                sq.geysers.push({ id: nextId('g'), x: Math.round(x1), topY: 0, phase: 'warn', t: T(d.geyserWarnMs), hit: [] });
                sq.geysers.push({ id: nextId('g'), x: Math.round(x2), topY: 0, phase: 'warn', t: T(d.geyserWarnMs), hit: [] });
            }
            sq.nextGeyser = sq.tick + T(d.geyserEveryMs);
        }
        for (let i = sq.geysers.length - 1; i >= 0; i--) {
            const g = sq.geysers[i];
            if (--g.t <= 0 && g.phase === 'warn') { g.phase = 'up'; g.t = T(d.geyserUpMs); continue; }
            if (g.phase === 'up') {
                alive.forEach(p => {
                    if (g.hit.includes(p.id) || Math.abs(p.x - g.x) > 30 || p.y + this.PLAYER_HALF_H < g.topY) return;
                    g.hit.push(p.id);
                    this.hurtPlayer(p, d.geyserDamage);
                    this.knockback(p, 0, -520);
                });
                if (g.t <= 0) sq.geysers.splice(i, 1);
            }
        }

        // 3) SUVNI URADI: tikanli baliqlar sakrab chiqadi, qahramonga tegsa yoki platformaga/suvga tushsa portlaydi
        if (sq.tick >= sq.nextFish && alive.length) {
            const sx = sq.x + (Math.random() < 0.5 ? -1 : 1) * (120 + Math.random() * 100);
            sq.splashX = Math.round(sx);
            for (let k = 0; k < d.fishCount; k++) {
                const p = alive[k % alive.length];
                const Tt = 1.1 + Math.random() * 0.3;
                const vx = (p.x + (Math.random() - 0.5) * 80 - sx) / Tt;
                const vy = (p.y - 566 - 0.5 * 800 * Tt * Tt) / Tt;
                sq.fish.push({ id: nextId('f'), x: sx + (k - 1) * 20, y: 566, vx, vy });
            }
            this.io.to(roomId).emit('squidSplash', { x: Math.round(sx) });
            sq.nextFish = sq.tick + T(d.fishEveryMs);
        }
        for (let i = sq.fish.length - 1; i >= 0; i--) {
            const f = sq.fish[i];
            const prevY = f.y;
            f.vy += 800 * this.TICK_SECONDS;
            f.x += f.vx * this.TICK_SECONDS;
            f.y += f.vy * this.TICK_SECONDS;
            const touch = alive.some(p => Math.abs(p.x - f.x) <= 26 && Math.abs(p.y - f.y) <= 30);
            const onPlat = f.vy > 0 && map.platforms.some(pl => f.x >= pl.x && f.x <= pl.x + pl.w && prevY <= pl.y && f.y >= pl.y);
            const inWater = f.vy > 0 && f.y >= 568;
            if (!touch && !onPlat && !inWater) continue;
            sq.fish.splice(i, 1);
            if (inWater && !touch) { this.io.to(roomId).emit('squidFishBoom', { x: Math.round(f.x), y: 566, water: true }); continue; }
            alive.forEach(p => { if (Math.hypot(p.x - f.x, p.y - f.y) <= d.fishRadius) this.hurtPlayer(p, d.fishDamage); });
            this.io.to(roomId).emit('squidFishBoom', { x: Math.round(f.x), y: Math.round(f.y) });
        }
    }
    private squidDefeated(room: RoomState, sq: NonNullable<RoomState['squid']>): void {
        if (sq.state === 'dying') return;
        sq.state = 'dying';
        sq.timer = Math.round(800 / 30);   // cho'kib bo'lgach - biroz kutib, xarita o'tiladi
        sq.slam = null;
        sq.geysers = [];
        sq.fish = [];
        this.io.to(room.id).emit('squidDown');
    }

    // ===== NO MORE FRIENDS (bonus, PvP) =====
    private updatePvp(room: RoomState, roomId: string): void {
        const map = getMapById(room.selectedLevel);
        const d = map.pvp, pv = room.pvp;
        if (!d || !pv || room.isOver) return;
        pv.tick++;
        // O'lgan qahramon bir oz o'tib qayta tug'iladi - boshqalardan eng uzoq boshlang'ich joyda, qisqa himoya bilan
        Object.values(room.players).forEach((p) => {
            if (!p.isDead) return;
            if (pv.respawnAt[p.id] === undefined) pv.respawnAt[p.id] = pv.tick + Math.round(d.respawnMs / 30);
            if (pv.tick < pv.respawnAt[p.id] || pv.done) return;
            delete pv.respawnAt[p.id];
            const others = Object.values(room.players).filter(o => o.id !== p.id && !o.isDead);
            const spot = map.playerSpawns.slice().sort((a, b) => {
                const da = others.length ? Math.min(...others.map(o => Math.abs(o.x - a.x) + Math.abs(o.y - a.y))) : 0;
                const db2 = others.length ? Math.min(...others.map(o => Math.abs(o.x - b.x) + Math.abs(o.y - b.y))) : 0;
                return db2 - da;
            })[0];
            p.isDead = false;
            p.hp = p.maxHp || 100;
            p.stamina = p.maxStamina || 100;
            p.x = spot.x; p.y = spot.y;
            pv.shieldUntil[p.id] = pv.tick + Math.round(d.spawnShieldMs / 30);
            this.io.to(p.id).emit('teleport', { x: p.x, y: p.y });
            this.io.to(roomId).emit('pvpRespawn', { id: p.id });
        });
    }

    // ===== SEHRGAR TORNADOSI: qaragan tomonga yuradi; har pulseTicks da yo'lidagi HAR BIR dushmanga zarar (o'q tizimi orqali -
    // botlar, bosslar, ferma maxluqlari, qutilar - hammasi bir xil ishlaydi); botlarni markazga tortadi =====
    private updateTornadoes(room: RoomState): void {
        if (!room.tornadoes || !room.tornadoes.length) return;
        const W = getMapById(room.selectedLevel).mapWidth;
        room.tornadoes = room.tornadoes.filter((tr) => {
            if (--tr.t <= 0 || !room.players[tr.owner]) return false;
            tr.x = Math.max(20, Math.min(W - 20, tr.x + tr.dir * TORNADO.speed * this.TICK_SECONDS));
            const inside = (x: number, y: number) => Math.abs(x - tr.x) <= TORNADO.halfW && y <= tr.y + 10 && y >= tr.y - TORNADO.height;
            room.bots.forEach(b => { if (inside(b.x, b.y)) b.x += Math.sign(tr.x - b.x) * Math.min(TORNADO.pull, Math.abs(tr.x - b.x)); });
            if (--tr.pulse > 0) return true;
            tr.pulse = TORNADO.pulseTicks;
            const shot = (x: number, y: number) => {
                room.bulletIdCounter++;
                room.bullets.push({ id: 'bullet_' + room.bulletIdCounter, playerId: tr.owner, x, y, vx: 0, vy: 0, color: 0, lifetime: 2, bulletType: 'tornado', justSpawned: false });
            };
            const hit = room.bots.filter(b => inside(b.x, b.y));
            hit.forEach(b => shot(b.x, b.y));
            // Botlar bo'lmasa (boss, ferma maxluqi, quti) - tornado ichida ikki balandlikda
            if (!hit.length) { shot(tr.x, tr.y - 40); shot(tr.x, tr.y - 120); }
            return true;
        });
    }

    // ===== MY FARM: qayta tug'ilish, qo'ziqorinlar (sporalar, ekinni yeyish), baxaybat daraxt BOSS hujumlari =====
    private updateMyFarmWorld(room: RoomState, roomId: string): void {
        const mf = room.myFarm, map = getMapById(room.selectedLevel), F = map.myFarm;
        if (!mf || !F || room.isOver) return;
        const now = Date.now(), dt = this.TICK_SECONDS;
        // O'lgan qahramon 5 soniyadan keyin ferma uyida qayta tug'iladi (tinch xarita - mag'lubiyat yo'q)
        Object.values(room.players).forEach((p) => {
            if (!p.isDead) { delete mf.respawnAt[p.id]; return; }
            if (mf.respawnAt[p.id] === undefined) {
                mf.respawnAt[p.id] = now + 5000;
                if (p.id === room.hostId) this.roomManager.farmOwnerDied(roomId);   // ferma egasi o'ldi - ekinlar yo'qoladi
                return;
            }
            if (now < mf.respawnAt[p.id]) return;
            delete mf.respawnAt[p.id];
            mf.safeUntil[p.id] = now + 2500;   // qayta tug'ilgach 2.5 s maxluqlar tegmaydi (uy oldida poylab turmasin)
            const sp = map.playerSpawns[0];
            p.isDead = false; p.hp = p.maxHp || 100; p.stamina = p.maxStamina || 100; p.x = sp.x; p.y = sp.y;
            this.io.to(p.id).emit('teleport', { x: p.x, y: p.y });
        });
        const alive = Object.values(room.players).filter(p => !p.isDead);
        const SD = F.shrooms;
        mf.shrooms.forEach((sh) => {
            if (sh.hitFlash > 0) sh.hitFlash--;
            if (now >= sh.nextPuff) {
                const near = alive.filter(p => Math.abs(p.x - sh.x) <= SD.sporeRange && p.y > 420);
                if (near.length) {
                    sh.nextPuff = now + SD.sporeEveryMs;
                    near.forEach(p => this.hurtPlayer(p, SD.sporeDamage));
                    this.io.to(roomId).emit('mfSpore', { x: sh.x });
                }
            }
            if (!sh.ate && now - sh.born >= SD.eatMs) { sh.ate = true; this.roomManager.shroomEat(roomId, sh.k); }
            // UZOQDAN: eng yaqin qahramonga yoy bo'ylab spora shari (yugurayotgan bo'lsa - oldindan mo'ljal)
            if (sh.nextShot === undefined) sh.nextShot = now + 800 + Math.random() * 1200;
            if (now >= sh.nextShot) {
                const tg = alive.filter(p => Math.abs(p.x - sh.x) <= SD.shotRange && Math.abs(p.x - sh.x) > SD.sporeRange * 0.6)
                    .sort((a, b) => Math.abs(a.x - sh.x) - Math.abs(b.x - sh.x))[0];
                if (tg) {
                    sh.nextShot = now + SD.shotEveryMs + Math.random() * 600;
                    const sx = sh.x, sy = 530, mo = this.playerMotion.get(tg.id);
                    const ft = Math.max(0.55, Math.min(1.1, Math.abs(tg.x - sx) / 420));
                    const tx = tg.x + (mo ? Math.max(-160, Math.min(160, mo.vx * ft * 0.8)) : 0);
                    mf.spores = mf.spores || [];
                    mf.spores.push({ id: ++mf.seq, x: sx, y: sy, vx: (tx - sx) / ft, vy: (tg.y - sy - 0.5 * 900 * ft * ft) / ft });
                    this.io.to(roomId).emit('mfSporeShot', { x: sx });
                } else sh.nextShot = now + 500;
            }
        });
        // Spora sharlari: yoy bo'ylab uchadi, qahramonga tegsa - zarar, yerga tushsa - yashil bulut
        if (mf.spores && mf.spores.length) {
            mf.spores = mf.spores.filter((s) => {
                s.vy += 900 * dt; s.x += s.vx * dt; s.y += s.vy * dt;
                const hit = alive.find(p => Math.abs(p.x - s.x) <= this.PLAYER_HALF_W + 10 && Math.abs(p.y - s.y) <= this.PLAYER_HALF_H + 10 && now >= (mf.safeUntil[p.id] || 0));
                if (hit) { this.hurtPlayer(hit, SD.shotDamage); this.knockback(hit, s.vx > 0 ? 160 : -160, -160); this.io.to(roomId).emit('mfSporeHit', { x: Math.round(s.x), y: Math.round(s.y) }); return false; }
                if (s.y >= 566) { this.io.to(roomId).emit('mfSporeHit', { x: Math.round(s.x), y: 566 }); return false; }
                return s.x > -50 && s.x < F.riverX0 + 400;
            });
        }
        // MAXLUQLAR HUJUMI: vaqti kelsa (boss jangi va boshqa hujum bo'lmasa) - yangisi; yo'qsa keyingi navbat
        const RD = F.raids;
        if (mf.farm && mf.nextRaidAt && now >= mf.nextRaidAt) {
            if (!mf.boss && !mf.mobs.some(m => m.kind !== 'crow') && !mf.shrooms.length && alive.length) this.roomManager.startRaid(roomId);
            mf.nextRaidAt = now + RD.everyMs + Math.round((Math.random() * 2 - 1) * RD.jitterMs);
            this.roomManager.sendMyFarm(roomId);
        }
        // ROBOT QARG'ALAR: vaqti-vaqti bilan uchib kelib, qo'rqinchog'i yo'q maydondagi pishgan ekinga qo'nadi
        const CR = RD.crows;
        if (mf.farm && mf.nextCrowAt && now >= mf.nextCrowAt) {
            mf.nextCrowAt = now + CR.minMs + Math.random() * (CR.maxMs - CR.minMs);
            const f = mf.farm, taken = new Set(mf.mobs.filter(m => m.kind === 'crow').map(m => m.plot));
            const ripe: number[] = [];
            f.plots.forEach((pl, k) => {
                if (!pl || taken.has(k) || Math.floor(k / 6) < f.scarecrows || Math.floor(k / 6) > f.zones) return;
                const c = F.crops.find(x => x.id === pl.c);
                if (c && farmGrown(F, pl.t, now, c.growMs, RoomManager.plotWatered(f, k, pl), RoomManager.cropSpeed(f, k))) ripe.push(k);
            });
            ripe.sort(() => Math.random() - 0.5).slice(0, CR.max).forEach((k, i) => {
                const x = farmPlotX(F, k), from = x + (Math.random() < 0.5 ? -1 : 1) * (380 + i * 60);
                mf.mobs.push({ id: 'cr' + (++mf.seq), kind: 'crow', x: from, y: 120 + i * 30, hp: CR.hp, maxHp: CR.hp, hitFlash: 0, face: x > from ? 1 : -1, v: i % 3,
                    hopFrom: 0, hopTo: 0, hopAt: 0, hopEnd: 0, hitCd: 0, plot: k, phase: 'in', eatAt: 0 });
            });
            if (ripe.length) this.io.to(roomId).emit('mfCrows', { n: Math.min(ripe.length, CR.max) });
        }
        mf.mobs = mf.mobs.filter((m) => {
            if (m.kind !== 'crow') return true;
            if (m.hitFlash > 0) m.hitFlash--;
            const tx = farmPlotX(F, m.plot!), ty = 548;
            if (m.phase === 'in') {
                const dx = tx - m.x, dy = ty - m.y, d = Math.hypot(dx, dy);
                if (d < 8) { m.phase = 'eat'; m.eatAt = now + CR.eatMs; m.x = tx; m.y = ty; }
                else { m.x += dx / d * CR.speed * dt; m.y += dy / d * CR.speed * dt; m.face = dx > 0 ? 1 : -1; }
            } else if (m.phase === 'eat') {
                // Ekin hali o'sha joyda bo'lmasa (terib olindi) - uchib ketadi; vaqt tugasa - yeb ketadi
                if (!mf.farm || !mf.farm.plots[m.plot!]) m.phase = 'out';
                else if (now >= m.eatAt!) { this.roomManager.crowEat(roomId, m.plot!); m.phase = 'out'; }
            } else {
                m.y -= CR.speed * dt; m.x += m.face * CR.speed * 0.6 * dt;
                if (m.y < -60) return false;
            }
            return true;
        });
        // YURISH SIRTLARI: yer (daryogacha; platforma qurilgan bo'lsa - uning uchigacha) va daraxt shoxlari.
        // Maxluqlar shoxlarga sakrab chiqadi (zinapoyadek) va chetidan yiqilib tushadi - tepadagi qahramonni ham quvadi
        const GROUND = 570, groundX1 = (mf.farm && mf.farm.dock ? F.dockX1 : F.riverX0) - 30;
        const surfs = [{ x0: 60, x1: groundX1, y: GROUND }, ...map.platforms.map(pl => ({ x0: pl.x, x1: pl.x + pl.w, y: pl.y }))];
        const surfAt = (x: number, y: number) => surfs.find(s => x >= s.x0 - 2 && x <= s.x1 + 2 && Math.abs(s.y - y) <= 3);
        // Nishon yuqorida bo'lsa - yetib boriladigan (balandligi <= 150, oralig'i <= 230) eng qulay sirt va qo'nish nuqtasi
        const climbTo = (m: { x: number, y: number }, tgX: number, tgFeet: number) => {
            let best: { x: number, y: number } | null = null, bestScore = Infinity;
            surfs.forEach((s) => {
                if (s.y >= m.y - 10 || m.y - s.y > 150) return;
                const lx = Math.max(s.x0 + 14, Math.min(s.x1 - 14, tgX));
                const near = Math.max(s.x0 + 14, Math.min(s.x1 - 14, m.x));
                const x = Math.abs(lx - m.x) <= 230 ? lx : near;
                if (Math.abs(x - m.x) > 230) return;
                const score = Math.abs(x - tgX) + Math.abs(s.y - tgFeet) * 1.5;
                if (score < bestScore) { bestScore = score; best = { x, y: s.y }; }
            });
            return best as { x: number, y: number } | null;
        };
        // Havodagi (sakragan / yiqilayotgan) maxluq: tortishish, sirtga qo'nish
        const fallStep = (m: { x: number, y: number, vx?: number, vy?: number, air?: boolean }) => {
            m.vy = (m.vy || 0) + 900 * dt;
            const ny = m.y + m.vy * dt;
            m.x = Math.max(60, Math.min(groundX1, m.x + (m.vx || 0) * dt));
            const land = m.vy > 0 ? surfs.filter(s => m.x >= s.x0 - 2 && m.x <= s.x1 + 2 && m.y <= s.y + 1 && ny >= s.y).sort((a, c) => a.y - c.y)[0] : undefined;
            if (land) { m.y = land.y; m.air = false; m.vx = 0; m.vy = 0; } else m.y = Math.min(GROUND, ny);
            if (m.y >= GROUND) { m.y = GROUND; m.air = false; m.vx = 0; m.vy = 0; }
        };
        mf.mobs.forEach((m) => {
            if (m.kind === 'crow') return;
            if (m.hitFlash > 0) m.hitFlash--;
            if (m.hitCd > 0) m.hitCd--;
            // Nishon: eng yaqin tirik qahramon (tepada - daraxt shoxida bo'lsa ham)
            const tg = alive.slice().sort((a, c) => Math.hypot(a.x - m.x, a.y - m.y) - Math.hypot(c.x - m.x, c.y - m.y))[0];
            const tgFeet = tg ? tg.y + this.PLAYER_HALF_H : GROUND;
            if (m.kind === 'zveg') {
                const Z = RD.zveg, mouthX = m.x + m.face * 8, mouthY = m.y - 44;
                // IGNA-TIL (S2 "Farm" dagidek): mo'ljal oladi (qizil nuqtalar) -> sanchadi; shu payt joyida turadi
                if (m.tongue) {
                    const t2 = m.tongue;
                    if (--t2.t <= 0) {
                        if (t2.phase === 'aim') {
                            t2.phase = 'stab'; t2.t = Math.round(260 / 30);
                            const dx = t2.tx - mouthX, dy = t2.ty - mouthY, len = Math.hypot(dx, dy) || 1, kk = Math.min(1, Z.tongueRange / len);
                            t2.tx = mouthX + dx * kk; t2.ty = mouthY + dy * kk;
                            alive.forEach(p => {
                                const ex = t2.tx - mouthX, ey = t2.ty - mouthY, L2 = ex * ex + ey * ey || 1;
                                const u = Math.max(0, Math.min(1, ((p.x - mouthX) * ex + (p.y - mouthY) * ey) / L2));
                                if (Math.hypot(p.x - (mouthX + ex * u), p.y - (mouthY + ey * u)) > 24 || now < (mf.safeUntil[p.id] || 0)) return;
                                this.hurtPlayer(p, Z.tongueDamage);
                                this.knockback(p, (p.x < m.x ? -1 : 1) * 160, -260);
                            });
                        } else { m.tongue = null; m.tongueCd = Math.round(Z.tongueCdMs / 30); }
                    }
                } else if (m.air) {
                    fallStep(m);
                } else {
                    if ((m.tongueCd || 0) > 0) m.tongueCd!--;
                    if ((m.jumpCd || 0) > 0) m.jumpCd!--;
                    const d = tg ? Math.hypot(tg.x - mouthX, tg.y - mouthY) : 1e9;
                    if (tg && !(m.tongueCd || 0) && d <= Z.tongueRange && (Math.abs(tg.x - m.x) > 40 || tgFeet < m.y - 40)) {
                        m.face = tg.x > m.x ? 1 : -1;
                        m.tongue = { phase: 'aim', t: Math.round(Z.tongueAimMs / 30), tx: tg.x, ty: tg.y };
                    } else if (tg) {
                        const higher = tgFeet < m.y - 30;
                        const up = higher ? climbTo(m, tg.x, tgFeet) : null;
                        if (up && !(m.jumpCd || 0)) {
                            // SAKRASH: yuqoridagi shoxga (yoy bo'ylab ~0.7 s)
                            const T2 = 0.7;
                            m.face = up.x > m.x ? 1 : up.x < m.x ? -1 : m.face;
                            m.vx = (up.x - m.x) / T2; m.vy = (up.y - m.y - 0.5 * 900 * T2 * T2) / T2; m.air = true; m.jumpCd = 12;
                        } else if (!up && Math.abs(tg.x - m.x) > 18) {
                            // Zombi sabzavot: eng yaqin qahramon tomon yuradi. Nishon tepada bo'lsa - shox chetidan yiqilmaydi
                            // (keyingi sakrashni kutadi), pastda bo'lsa - chetidan tushib ketadi
                            const nx = Math.max(60, Math.min(groundX1, m.x + (tg.x > m.x ? 1 : -1) * Z.speed * (1 + m.v * 0.12) * dt));
                            m.face = tg.x > m.x ? 1 : -1;
                            if (surfAt(nx, m.y) || !higher) {
                                m.x = nx;
                                if (!surfAt(m.x, m.y)) { m.air = true; m.vx = m.face * 40; m.vy = 0; }
                            }
                        }
                    }
                }
            } else {
                // Shilimshiq: sakrab yuradi (yoy bo'ylab), qo'nganda yer silkinadi
                const S = m.kind === 'slime' ? RD.slime : RD.slimelet;
                if (m.air) fallStep(m);
                else if (m.hopEnd && now < m.hopEnd) {
                    const q = 1 - (m.hopEnd - now) / S.hopMs, y0 = m.hopFromY ?? GROUND, y1 = m.hopToY ?? GROUND;
                    m.x = m.hopFrom + (m.hopTo - m.hopFrom) * q;
                    m.y = y0 + (y1 - y0) * q - Math.sin(q * Math.PI) * (m.hopH || S.hopH);
                } else {
                    if (m.hopEnd) {
                        m.hopEnd = 0; m.x = m.hopTo; m.y = m.hopToY ?? GROUND;
                        if (!surfAt(m.x, m.y)) { m.air = true; m.vx = 0; m.vy = 0; }   // sirt yo'q joyga tushdi - yiqiladi
                        else if (m.kind === 'slime') this.io.to(roomId).emit('mfSlimeLand', { x: Math.round(m.x) });
                    }
                    if (tg && now >= m.hopAt && !m.air) {
                        m.face = tg.x > m.x ? 1 : -1;
                        m.hopFrom = m.x; m.hopFromY = m.y;
                        // Nishon tepada - yuqoridagi shoxga sakraydi; pastda yoki bir xil balandlikda - shu sirt bo'ylab (chetdan yiqiladi)
                        const up = tgFeet < m.y - 30 ? climbTo(m, tg.x, tgFeet) : null;
                        if (up) { m.hopTo = up.x; m.hopToY = up.y; m.hopH = Math.max(S.hopH, m.y - up.y + 50); }
                        else {
                            m.hopTo = Math.max(60, Math.min(groundX1, m.x + m.face * Math.min(S.hopDist, Math.abs(tg.x - m.x) + 20)));
                            // Nishon tepada (lekin hozir yetib bo'lmaydi) - turgan shoxidan tushib ketmasin: chetigacha
                            const cur = surfAt(m.x, m.y);
                            if (cur && tgFeet < m.y - 30) m.hopTo = Math.max(cur.x0 + 10, Math.min(cur.x1 - 10, m.hopTo));
                            m.hopToY = m.y; m.hopH = S.hopH;
                        }
                        m.hopEnd = now + S.hopMs;
                        m.hopAt = m.hopEnd + (m.kind === 'slime' ? 500 : 250) + Math.random() * 300;
                    }
                }
            }
            // Tegib ketsa - zarar va itarib yuborish
            const halfW = m.kind === 'slime' ? 52 : m.kind === 'slimelet' ? 22 : 20, h = m.kind === 'slime' ? 90 : 46;
            if (m.hitCd <= 0) {
                const hit = alive.find(p => now >= (mf.safeUntil[p.id] || 0) && Math.abs(p.x - m.x) <= halfW + 12 && p.y + 24 > m.y - h && p.y - 24 < m.y);
                if (hit) {
                    const dmg = m.kind === 'slime' ? RD.slime.dmg : m.kind === 'slimelet' ? RD.slimelet.dmg : RD.zveg.dmg;
                    this.hurtPlayer(hit, dmg);
                    this.knockback(hit, hit.x < m.x ? -380 : 380, -260);
                    m.hitCd = m.kind === 'zveg' ? 40 : 30;
                }
            }
        });
        const b = mf.boss, T = F.tree;
        if (b) {
            if (b.hitFlash > 0) b.hitFlash--;
            const G = 900;
            // Tikonli olmalar (ballistik)
            b.queue = b.queue.filter((q) => { if (now < q.at) return true; b.apples.push({ id: ++mf.seq, x: q.x, y: q.y, vx: q.vx, vy: q.vy }); return false; });
            b.apples = b.apples.filter((a) => {
                a.vy += G * dt; a.x += a.vx * dt; a.y += a.vy * dt;
                const hit = alive.find(p => Math.abs(p.x - a.x) <= 24 && Math.abs(p.y - a.y) <= 34);
                if (hit) { this.hurtPlayer(hit, T.appleDamage); this.knockback(hit, a.vx > 0 ? 240 : -240, -180); return false; }
                return a.y < 600 && a.x > T.arenaX0 - 400 && a.x < T.arenaX1 + 400;
            });
            // Yerdan chiqadigan tomirlar (ogohlantirish -> otilib chiqadi)
            b.roots = b.roots.filter((r) => {
                if (r.phase === 'warn' && now >= r.at) {
                    r.phase = 'up'; r.at = now + 650;
                    alive.filter(p => Math.abs(p.x - r.x) <= 36 && p.y > 470).forEach((p) => { this.hurtPlayer(p, T.rootDamage); this.knockback(p, 0, -520); });
                    return true;
                }
                return !(r.phase === 'up' && now >= r.at);
            });
            // Tepagacha otilib chiqadigan uzun tomirlar
            b.pillars = b.pillars.filter((pl) => {
                if (pl.phase === 'warn' && now >= pl.at) { pl.phase = 'up'; pl.at = now + 1200; }
                if (pl.phase === 'up') {
                    alive.forEach((p) => {
                        if (pl.hit.includes(p.id) || Math.abs(p.x - pl.x) > 28) return;
                        pl.hit.push(p.id);
                        this.hurtPlayer(p, T.pillarDamage);
                        this.knockback(p, p.x < pl.x ? -320 : 320, -220);
                    });
                    if (now >= pl.at) return false;
                }
                return true;
            });
            // Navbatdagi hujum: joni kamaygan sari tezroq
            if (now >= b.nextAt) {
                const inArena = alive.filter(p => p.x >= T.arenaX0 - 250 && p.x <= T.arenaX1 + 250);
                if (!inArena.length) b.nextAt = now + 1000;
                else {
                    const ground = inArena.filter(p => p.y > 500);
                    let kinds = ['roots', 'apples', 'pillars'].filter(k => k !== b.last);
                    if (!ground.length) kinds = kinds.filter(k => k !== 'roots');
                    const kind = kinds[Math.floor(Math.random() * kinds.length)];
                    b.last = kind;
                    const mx = T.mouth.x + T.mouth.w / 2, my = T.mouth.y + 20;
                    if (kind === 'roots') ground.forEach(p => b.roots.push({ x: p.x, phase: 'warn', at: now + 800 }));
                    else if (kind === 'apples') {
                        const tg = inArena[Math.floor(Math.random() * inArena.length)];
                        for (let i = 0; i < 5; i++) {
                            const fly = 0.85 + i * 0.05, tx = tg.x + (i - 2) * 40, ty = tg.y;
                            b.queue.push({ at: now + 400 + i * 260, x: mx, y: my, vx: (tx - mx) / fly, vy: (ty - my) / fly - 0.5 * G * fly });
                        }
                    } else {
                        const xs = [inArena[Math.floor(Math.random() * inArena.length)].x];
                        while (xs.length < 3) { const x = T.arenaX0 + 40 + Math.random() * (T.arenaX1 - T.arenaX0 - 80); if (xs.every(o => Math.abs(o - x) > 120)) xs.push(x); }
                        xs.forEach(x => b.pillars.push({ x, phase: 'warn', at: now + 1000, hit: [] }));
                    }
                    b.nextAt = now + 2800 - Math.round(1000 * (1 - b.hp / b.maxHp));
                    this.io.to(roomId).emit('treeAttack', { kind });
                }
            }
        }
        // Dunyo holati (faqat kerak bo'lganda): qo'ziqorinlar va boss
        const on = mf.shrooms.length > 0 || mf.mobs.length > 0 || !!(mf.spores && mf.spores.length) || !!b;
        if ((on || mf.worldOn) && this.frame % this.BROADCAST_EVERY === 0) {
            mf.worldOn = on;
            this.io.to(roomId).emit('mfWorld', {
                spores: (mf.spores || []).map(s => ({ id: s.id, x: Math.round(s.x), y: Math.round(s.y), vx: Math.round(s.vx), vy: Math.round(s.vy) })),
                shrooms: mf.shrooms.map(sh => ({ id: sh.id, x: sh.x, k: sh.k, hp: Math.ceil(sh.hp), maxHp: sh.maxHp, f: sh.hitFlash > 0, eatIn: Math.max(0, Math.ceil((sh.born + SD.eatMs - now) / 1000)) })),
                mobs: mf.mobs.map(m => ({ id: m.id, k: m.kind, x: Math.round(m.x), y: Math.round(m.y), hp: Math.ceil(m.hp), maxHp: m.maxHp, f: m.hitFlash > 0, face: m.face, v: m.v, air: !!m.hopEnd || !!m.air,
                    tg: m.tongue ? { p: m.tongue.phase, x: Math.round(m.tongue.tx), y: Math.round(m.tongue.ty) } : null, ph: m.phase || null })),
                boss: b ? { hp: Math.ceil(b.hp), maxHp: b.maxHp, f: b.hitFlash > 0,
                    apples: b.apples.map(a => ({ id: a.id, x: Math.round(a.x), y: Math.round(a.y) })),
                    roots: b.roots.map(r => ({ x: Math.round(r.x), p: r.phase })),
                    pillars: b.pillars.map(p => ({ x: Math.round(p.x), p: p.phase })) } : null
            });
        }
    }

    // ===== SKY BATTLE (Season 2, map-10): osmondagi jang =====
    private skyEnemyDown(room: RoomState, index: number, killerId: string | null): void {
        const sk = room.sky!;
        const en = sk.enemies.splice(index, 1)[0];
        this.io.to(room.id).emit('skyEnemyDown', { x: Math.round(en.x), y: Math.round(en.y) });
        const killer = killerId ? room.players[killerId] : null;
        if (killer && !room.isOver) {
            killer.kills++;
            this.roomManager.awardReward(room.id, killer.id, 0, GameEngine.KILL_XP, true).catch(err => console.error('awardReward xatosi:', err));
        }
    }
    private skySpawnWave(room: RoomState, d: NonNullable<MapDef['sky']>, W: number): void {
        const sk = room.sky!;
        sk.wave++;
        sk.state = 'wave';
        const alive = Object.values(room.players).filter(p => !p.isDead);
        const n = Math.max(1, Math.min(4, Object.keys(room.players).length));
        const hp = d.enemyHp + (sk.wave - 1) * d.enemyHpPerWave;
        for (let i = 0; i < n; i++) {
            const tg = alive.length ? alive[i % alive.length] : null;
            const side = (i % 2 === 0 ? 1 : -1);
            const x = Math.max(40, Math.min(W - 40, (tg ? tg.x : 400) + side * (520 + Math.random() * 160)));
            sk.enemies.push({ id: 'se' + (++sk.counter), x, y: d.top + 40 + Math.random() * (d.bottom - d.top - 80), hp, maxHp: hp, target: tg ? tg.id : null,
                ox: Math.random() * 60, oy: -70 + Math.random() * 140, nextShot: sk.tick + Math.round((900 + Math.random() * 900) / 30), hitFlash: 0, facing: -side });
        }
        this.io.to(room.id).emit('skyWave', { wave: sk.wave, waves: d.waves });
    }
    // Kema nishonni OLDINDAN oladi: o'yinchi tezligi (playerMotion) bo'yicha o'q yetib boradigan paytdagi joyiga
    private skyLead(p: PlayerState, sx: number, sy: number, speed: number, d: NonNullable<MapDef['sky']>, W: number): { x: number, y: number } {
        const m = this.playerMotion.get(p.id);
        let tx = p.x, ty = p.y;
        for (let k = 0; k < 2; k++) {   // ikki marta aniqlashtiriladi (masofa o'zgaradi)
            const tt = Math.min(1.4, Math.hypot(tx - sx, ty - sy) / Math.max(1, speed));
            tx = Math.max(30, Math.min(W - 30, p.x + (m ? m.vx : 0) * tt));
            ty = Math.max(d.top, Math.min(d.bottom, p.y + (m ? m.vy : 0) * tt));
        }
        return { x: tx, y: ty };
    }
    private skyShoot(sk: NonNullable<RoomState['sky']>, x: number, y: number, tx: number, ty: number, speed: number, dmg: number, spread = 0): void {
        const a = Math.atan2(ty - y, tx - x) + spread;
        sk.shots.push({ id: 'ss' + (++sk.counter), x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, t: 0, dmg });
    }
    // Qilich bilan uradigan qahramon (ritsar/samuray asosiy qurolda) - dushman unga yaqin keladi, aks holda
    // qilich hech qachon yetmasdi; kamonchi/sehrgar/o'qotar qurol - uzoqroqda suzadi
    private skyIsMelee(p: PlayerState): boolean {
        return (p.characterType === 'knight' || p.characterType === 'samurai') && (p.weaponMode || 'main') === 'main';
    }
    private updateSky(room: RoomState, roomId: string): void {
        const map = getMapById(room.selectedLevel);
        const d = map.sky, sk = room.sky;
        if (!d || !sk || room.isOver) return;
        const ms = (v: number) => Math.round(v / 30), dt = this.TICK_SECONDS, W = map.mapWidth;
        sk.tick++;
        const alive = Object.values(room.players).filter(p => !p.isDead);
        // O'yinchilar bulutlardan o'ta olmaydi (klient ham cheklaydi - bu ehtiyot uchun)
        alive.forEach(p => { p.y = Math.max(d.top - 10, Math.min(d.bottom + 10, p.y)); });
        if (sk.state === 'done') return;
        if (sk.state === 'dying') {
            if (--sk.timer <= 0) {
                sk.state = 'done';
                this.roomManager.declareWinner(roomId, this.topKillerId(room)).catch(err => console.error('declareWinner xatosi:', err));
            }
            return;
        }
        if (sk.state === 'intro') { if (--sk.timer <= 0) this.skySpawnWave(room, d, W); return; }
        const pRect = (p: PlayerState) => ({ x: p.x - this.PLAYER_HALF_W, y: p.y - this.PLAYER_HALF_H, w: this.PLAYER_HALF_W * 2, h: this.PLAYER_HALF_H * 2 });
        // UCHAR MASHINALAR: o'z o'yinchisining yonida suzadi, unga nishonlab o'q otadi
        sk.enemies.forEach((en, i) => {
            if (en.hitFlash > 0) en.hitFlash--;
            let tg = en.target ? room.players[en.target] : null;
            if (!tg || tg.isDead) { tg = alive.length ? alive[i % alive.length] : null; en.target = tg ? tg.id : null; }
            if (!tg) return;
            const side = en.x < tg.x ? -1 : 1;
            const gx = tg.x + side * ((this.skyIsMelee(tg) ? 64 : 220) + en.ox), gy = Math.max(d.top + 20, Math.min(d.bottom - 20, tg.y + en.oy + Math.sin((sk.tick + i * 40) / 25) * 30));
            const dx = gx - en.x, dy = gy - en.y, dist = Math.hypot(dx, dy);
            const step = Math.min(dist, d.enemySpeed * dt);
            if (dist > 1) { en.x += dx / dist * step; en.y += dy / dist * step; }
            en.x = Math.max(30, Math.min(W - 30, en.x));
            en.facing = tg.x < en.x ? -1 : 1;
            if (sk.tick >= en.nextShot && Math.abs(tg.x - en.x) < 760) {
                en.nextShot = sk.tick + ms(d.enemyShotEveryMs * (0.8 + Math.random() * 0.5));
                this.skyShoot(sk, en.x + en.facing * 30, en.y + 6, tg.x, tg.y, d.enemyShotSpeed, d.enemyShotDamage, (Math.random() - 0.5) * 0.12);
                this.io.to(roomId).emit('skyShot', {});
            }
        });
        // O'QLAR
        for (let i = sk.shots.length - 1; i >= 0; i--) {
            const s = sk.shots[i];
            s.x += s.vx * dt; s.y += s.vy * dt; s.t++;
            const hit = alive.find(p => this.checkOverlap(pRect(p), { x: s.x - 6, y: s.y - 6, w: 12, h: 12 }));
            if (hit) {
                sk.shots.splice(i, 1);
                this.hurtPlayer(hit, s.dmg);
                this.knockback(hit, Math.sign(s.vx || 1) * 200, Math.sign(s.vy) * 80);
                this.io.to(roomId).emit('skyShotHit', { id: hit.id, x: Math.round(s.x), y: Math.round(s.y) });
                continue;
            }
            if (s.t > ms(3500) || s.x < -50 || s.x > W + 50 || s.y < 0 || s.y > 620) sk.shots.splice(i, 1);
        }
        // CHAQMOQ: avval belgi (1 s), so'ng ustun bo'ylab urib o'tadi
        if (sk.tick >= sk.nextStrike && alive.length) {
            sk.nextStrike = sk.tick + ms(d.strikeEveryMs * (0.7 + Math.random() * 0.6));
            const tg = alive[Math.floor(Math.random() * alive.length)];
            sk.strikes.push({ id: 'sl' + (++sk.counter), x: Math.max(30, Math.min(W - 30, tg.x + (Math.random() - 0.5) * 120)), t: 0, phase: 'warn', hit: [] });
            this.io.to(roomId).emit('skyStrikeWarn', {});
        }
        for (let i = sk.strikes.length - 1; i >= 0; i--) {
            const st = sk.strikes[i];
            st.t++;
            if (st.phase === 'warn' && st.t >= ms(d.strikeWarnMs)) { st.phase = 'hit'; st.t = 0; this.io.to(roomId).emit('skyStrike', { x: Math.round(st.x) }); }
            if (st.phase === 'hit') {
                alive.forEach(p => {
                    if (st.hit.includes(p.id) || Math.abs(p.x - st.x) > d.strikeW / 2 + this.PLAYER_HALF_W) return;
                    st.hit.push(p.id);
                    this.hurtPlayer(p, d.strikeDamage);
                    this.knockback(p, (p.x < st.x ? -1 : 1) * 320, 0);
                });
                if (st.t >= ms(d.strikeMs)) sk.strikes.splice(i, 1);
            }
        }
        // TO'LQINLAR
        if (sk.state === 'wave' && sk.enemies.length === 0) { sk.state = 'gap'; sk.timer = ms(d.waveGapMs); }
        if (sk.state === 'gap' && --sk.timer <= 0) {
            if (sk.wave < d.waves) this.skySpawnWave(room, d, W);
            else {
                // BOSS: uchar kema o'ng tomondan kirib keladi
                const n = Math.max(1, Object.keys(room.players).length);
                const ax = alive.length ? alive.reduce((a, p) => a + p.x, 0) / alive.length : 400;
                const hp = d.bossHpPerPlayer * n;
                sk.boss = { x: Math.min(W - d.bossW / 2, ax + 700), y: (d.top + d.bottom) / 2 - 60, hp, maxHp: hp, hitFlash: 0, facing: -1, act: null, actT: 0, actN: 0, nextAct: sk.tick + ms(2200), step: 0, phase: 0 };
                sk.state = 'boss';
                this.io.to(roomId).emit('skyBoss', {});
            }
        }
        // BOSS
        const b = sk.boss;
        if (sk.state === 'boss' && b) {
            if (b.hitFlash > 0) b.hitFlash--;
            b.phase++;
            const near = alive.slice().sort((p1, p2) => Math.abs(p1.x - b.x) - Math.abs(p2.x - b.x))[0];
            if (near) {
                // Eng yaqin o'yinchidan ~330 px narida, yuqoriroqda suzadi
                const side = b.x >= near.x ? 1 : -1;
                const gx = Math.max(d.bossW / 2, Math.min(W - d.bossW / 2, near.x + side * (this.skyIsMelee(near) ? d.bossW / 2 + 40 : 330)));
                const gy = Math.max(d.top + d.bossH / 2 - 10, Math.min(d.bottom - d.bossH / 2, near.y - 40 + Math.sin(b.phase / 40) * 50));
                const dx = gx - b.x, dy = gy - b.y, dist = Math.hypot(dx, dy), step = Math.min(dist, d.bossSpeed * dt);
                if (dist > 1) { b.x += dx / dist * step; b.y += dy / dist * step; }
                b.facing = near.x < b.x ? -1 : 1;
            }
            const gunX = b.x + b.facing * (d.bossW / 2 - 2), gunY = b.y + 26;   // rasmdagi old to'p uchi
            if (!b.act && sk.tick >= b.nextAct && alive.length) {
                const order: ('volley' | 'fan' | 'volley' | 'drop')[] = ['volley', 'fan', 'volley', 'drop'];
                b.act = order[b.step++ % order.length]; b.actT = 0; b.actN = 0;
                this.io.to(roomId).emit('skyBossAct', { act: b.act });
            }
            if (b.act) {
                b.actT++;
                if (b.act === 'volley') {
                    // 3 ta nishonli o'q (har biri - tasodifiy o'yinchiga)
                    if (b.actT % ms(240) === 0 && b.actN < 3) {
                        const tg = alive[Math.floor(Math.random() * alive.length)];
                        if (tg) { const a = this.skyLead(tg, gunX, gunY, d.bossShotSpeed, d, W); this.skyShoot(sk, gunX, gunY, a.x, a.y, d.bossShotSpeed, d.bossShotDamage); }
                        b.actN++;
                    }
                    if (b.actN >= 3) { b.act = null; b.nextAct = sk.tick + ms(d.bossRestMs); }
                } else if (b.act === 'fan') {
                    // 7 ta o'q yelpig'ichi - eng yaqin o'yinchi tomonga
                    if (b.actT === ms(450)) {
                        const tg = near || alive[0];
                        if (tg) { const a = this.skyLead(tg, gunX, gunY, d.bossShotSpeed * 0.85, d, W); for (let k = -3; k <= 3; k++) this.skyShoot(sk, gunX, gunY, a.x, a.y, d.bossShotSpeed * 0.85, d.bossShotDamage, k * 0.16); }
                    }
                    if (b.actT >= ms(800)) { b.act = null; b.nextAct = sk.tick + ms(d.bossRestMs); }
                } else {
                    // Yordamchi uchar mashina chiqaradi (o'yinchilar sonidan ko'p bo'lmaydi)
                    if (b.actT === ms(400) && sk.enemies.length < Math.max(1, alive.length)) {
                        const tg = alive[Math.floor(Math.random() * alive.length)];
                        const hp = d.enemyHp;
                        sk.enemies.push({ id: 'se' + (++sk.counter), x: b.x, y: b.y + d.bossH / 2, hp, maxHp: hp, target: tg ? tg.id : null, ox: Math.random() * 60, oy: -40 + Math.random() * 80,
                            nextShot: sk.tick + ms(1500), hitFlash: 0, facing: b.facing, minion: true });
                        this.io.to(roomId).emit('skyBossDrop', {});
                    }
                    if (b.actT >= ms(700)) { b.act = null; b.nextAct = sk.tick + ms(d.bossRestMs); }
                }
            }
        }
    }

    // ===== ROAD TO SKYLAND (Season 2, map-9): ranets avtomati =====
    // Tanasi (shkaf): jangda oyoqlari ko'taradi, sakraganda havoda
    private vendRect(v: NonNullable<RoomState['vend']>, d: NonNullable<MapDef['vend']>) {
        const lift = v.state === 'idle' ? 0 : d.legH * (v.legK === undefined ? 1 : v.legK);   // o'tirganda - oyoqlari yig'iladi
        return { x: v.x - d.w / 2, y: v.y - lift - d.h, w: d.w, h: d.h };
    }
    // Qalqonsiz payt: olov sochayotganda yoki sakrab tushgandan keyin
    private vendVulnerable(v: NonNullable<RoomState['vend']>): boolean {
        return v.state === 'fight' && (v.vuln > 0 || (!!v.act && ((v.act.kind === 'flame' && v.act.phase === 'fire') || (v.act.kind === 'sit' && v.act.phase === 'hold'))));
    }
    private vendProvoke(room: RoomState): void {
        const v = room.vend, d = getMapById(room.selectedLevel).vend;
        if (!v || !d || v.state !== 'idle') return;
        v.state = 'transform';
        v.timer = Math.round(d.transformMs / 30);
        this.io.to(room.id).emit('vendAngry', {});
    }
    private vendDefeated(room: RoomState): void {
        const v = room.vend, d = getMapById(room.selectedLevel).vend;
        if (!v || !d || v.state === 'dying' || v.state === 'broken') return;
        v.state = 'dying';
        v.act = null; v.vuln = 0;
        v.timer = Math.round(d.dyingMs / 30);
        this.io.to(room.id).emit('vendDown', {});
    }
    private updateVend(room: RoomState, roomId: string): void {
        const map = getMapById(room.selectedLevel);
        const d = map.vend, v = room.vend;
        if (!d || !v || room.isOver) return;
        const ms = (x: number) => Math.round(x / 30), dt = this.TICK_SECONDS;
        const floorY = this.GROUND_Y + this.PLAYER_HALF_H - 4;   // oyoq tagi (yer, 570)
        v.tick++;
        if (v.hitFlash > 0) v.hitFlash--;
        if (v.shieldFlash > 0) v.shieldFlash--;
        if (v.vuln > 0) v.vuln--;
        const alive = Object.values(room.players).filter(p => !p.isDead);
        // JARLIK: ranetsi bor qahramon chetiga yetsa - uchib ketadi (xarita o'tildi)
        if (v.state === 'fly') {
            if (--v.timer <= 0) {
                v.state = 'done';
                this.roomManager.declareWinner(roomId, v.flyId || this.topKillerId(room)).catch(err => console.error('declareWinner xatosi:', err));
            }
            return;
        }
        if (v.state === 'done') return;
        const flyer = alive.find(p => p.jetpack && p.x >= d.edgeX - 45);
        if (flyer) {
            v.flyId = flyer.id;
            v.state = 'fly';
            v.act = null;
            v.timer = ms(d.flyMs);
            this.io.to(roomId).emit('vendFly', { id: flyer.id });
            return;
        }
        if (v.state === 'idle' || v.state === 'broken') return;
        if (v.state === 'transform') {
            if (--v.timer <= 0) { v.state = 'fight'; v.nextAct = v.tick + ms(500); }
            return;
        }
        if (v.state === 'dying') {
            if (--v.timer <= 0) {
                // Sindi: har o'yinchiga bittadan ranets tushadi
                v.state = 'broken';
                v.y = floorY;
                const n = Math.max(1, Object.keys(room.players).length);
                v.jets = [];
                for (let k = 0; k < n; k++) v.jets.push({ id: 'jet' + k, x: Math.round(Math.max(d.x0, Math.min(d.x1, v.x + (k - (n - 1) / 2) * 46))), y: floorY - 2 });
                this.io.to(roomId).emit('vendBroken', { jets: v.jets });
            }
            return;
        }
        // ===== JANG =====
        // Avtomat TAGIDA (oyoqlari orasida, yerda) turgan qahramonlar: qancha vaqtdan beri - o'tirish hujumi uchun
        v.under = v.under || {};
        const onGround = v.y >= floorY - 1;
        alive.forEach(p => {
            const under = onGround && Math.abs(p.x - v.x) < d.w / 2 - 4 && p.y + this.PLAYER_HALF_H >= floorY - 14;
            if (under) { if (v.under![p.id] === undefined) v.under![p.id] = v.tick; } else delete v.under![p.id];
        });
        Object.keys(v.under).forEach(id => { if (!room.players[id] || room.players[id].isDead) delete v.under![id]; });
        const body = this.vendRect(v, d);
        const near = (p: PlayerState) => Math.abs(p.x - v.x);
        const target = alive.slice().sort((a, b) => near(a) - near(b))[0];
        // Tanasiga tegsa - zarba va itarib yuboradi
        alive.forEach(p => {
            if ((v.contactCd[p.id] || 0) > v.tick) return;
            if (!this.checkOverlap({ x: p.x - this.PLAYER_HALF_W, y: p.y - this.PLAYER_HALF_H, w: this.PLAYER_HALF_W * 2, h: this.PLAYER_HALF_H * 2 }, body)) return;
            v.contactCd[p.id] = v.tick + ms(700);
            this.hurtPlayer(p, d.contactDamage);
            this.knockback(p, (p.x < v.x ? -1 : 1) * d.contactSpeed, -320);
        });
        const a = v.act;
        // Tagida 1 s dan ko'p turgan bor - boshqa ishni kutmasdan (olov ogohlantirishini ham bekor qilib) o'tiradi
        const camper = Object.keys(v.under).find(id => v.tick - v.under![id] >= ms(d.sitAfterMs));
        if (camper && onGround && (!a || (a.kind === 'flame' && a.phase === 'warn'))) {
            v.act = { kind: 'sit', t: 0, phase: 'warn', x0: v.x, target: camper, hit: [], nextHit: 0, landX: null };
            v.under = {};
            this.io.to(roomId).emit('vendSitWarn', { x: Math.round(v.x) });
            return;
        }
        if (!a) {
            if (!target) return;
            v.facing = target.x < v.x ? -1 : 1;
            // Tanaffusda nishon tomon yuradi (juda yaqinlashmaydi)
            if (Math.abs(target.x - v.x) > 170) v.x = Math.max(d.x0, Math.min(d.x1, v.x + v.facing * d.walkSpeed * dt));
            if (v.tick < v.nextAct) return;
            // Navbat: olov / sakrash. Nishon olov yetmaydigan joyda (uzoq yoki baland platformada) - sakraydi
            // Olov qo'ldan pastga - yerda turganlar balandligida sochiladi (platformadagilarga - sakraydi)
            const flameY = v.y - 45;
            const canFlame = Math.abs(target.x - v.x) < d.w / 2 + d.flameLen - 30 && Math.abs(target.y - flameY) < d.flameH / 2 + 20;
            const kind = v.step % 2 === 0 && canFlame ? 'flame' : 'jump';
            v.step++;
            v.act = { kind, t: 0, phase: kind === 'flame' ? 'warn' : 'air', x0: v.x, target: target.id, hit: [], nextHit: 0, landX: null };
            this.io.to(roomId).emit(kind === 'flame' ? 'vendFlameWarn' : 'vendJump', { x: Math.round(v.x) });
            return;
        }
        a.t++;
        if (a.kind === 'sit') {
            // O'TIRISH: titraydi va biroz ko'tariladi -> oyoqlarini yig'ib zarb bilan o'tiradi (tagidagilar ezilib otiladi)
            // -> bir oz o'tirib turadi (QALQONSIZ - javob qaytarish payti) -> turadi
            if (a.phase === 'warn') {
                v.legK = 1 + 0.18 * Math.min(1, a.t / ms(d.sitWarnMs));
                if (a.t >= ms(d.sitWarnMs)) { a.phase = 'down'; a.t = 0; }
            } else if (a.phase === 'down') {
                v.legK = Math.max(0, 1.18 * (1 - a.t / Math.max(1, ms(d.sitDownMs))));
                const box = this.vendRect(v, d);
                box.h += d.legH * (v.legK || 0) + 6;
                alive.forEach(p => {
                    if (a.hit.includes(p.id)) return;
                    if (!this.checkOverlap({ x: p.x - this.PLAYER_HALF_W, y: p.y - this.PLAYER_HALF_H, w: this.PLAYER_HALF_W * 2, h: this.PLAYER_HALF_H * 2 }, box)) return;
                    a.hit.push(p.id);
                    v.contactCd[p.id] = v.tick + ms(900);   // shu zarbada tanaga tegish zarari qo'shilmasin
                    this.hurtPlayer(p, d.sitDamage);
                    this.knockback(p, (p.x < v.x ? -1 : 1) * d.sitSpeed, -380);
                });
                if (a.t >= ms(d.sitDownMs)) {
                    v.legK = 0; a.phase = 'hold'; a.t = 0;
                    this.io.to(roomId).emit('vendSit', { x: Math.round(v.x) });
                }
            } else {
                v.legK = Math.min(1, Math.max(0, (a.t - ms(d.sitHoldMs)) / ms(300)));
                if (a.t >= ms(d.sitHoldMs + 300)) { v.legK = 1; v.act = null; v.under = {}; v.nextAct = v.tick + ms(d.restMs); }   // tagidagilarga yana to'liq 1 s
            }
            return;
        }
        if (a.kind === 'flame') {
            // Qo'lidan olov: avval uchqun (ogohlantirish), so'ng oldinga olov sochadi - shu payt QALQONSIZ
            if (a.phase === 'warn' && a.t >= ms(d.flameWarnMs)) { a.phase = 'fire'; a.t = 0; this.io.to(roomId).emit('vendFlame', {}); }
            if (a.phase === 'fire') {
                if (a.t >= a.nextHit) {
                    a.nextHit = a.t + ms(d.flameEveryMs);
                    const zone = { x: v.facing > 0 ? v.x + d.w / 2 : v.x - d.w / 2 - d.flameLen, y: v.y - 45 - d.flameH / 2, w: d.flameLen, h: d.flameH };
                    alive.forEach(p => {
                        if (!this.checkOverlap({ x: p.x - this.PLAYER_HALF_W, y: p.y - this.PLAYER_HALF_H, w: this.PLAYER_HALF_W * 2, h: this.PLAYER_HALF_H * 2 }, zone)) return;
                        this.hurtPlayer(p, d.flameDamage);
                        this.knockback(p, v.facing * 90, -60);   // sekin itaradi - olov ichida qolsa yana kuyadi
                    });
                }
                if (a.t >= ms(d.flameMs)) { v.act = null; v.nextAct = v.tick + ms(d.restMs); }
            }
        } else {
            // SAKRASH: ko'tarilayotganda nishonni quvadi; jumpLockAt dan keyin tushadigan joy QOTADI
            // (yerda qizil belgi) - shu paytda qochgan qahramonni endi quvmaydi
            const T = ms(d.jumpMs), k = Math.min(1, a.t / T);
            const tg = a.target ? room.players[a.target] : null;
            if (a.landX === null && k >= d.jumpLockAt) a.landX = Math.max(d.x0, Math.min(d.x1, tg && !tg.isDead ? tg.x : v.x));
            const aimX = a.landX !== null ? a.landX : (tg && !tg.isDead ? tg.x : v.x);
            const dx = aimX - v.x;
            if (Math.abs(dx) > 1) v.facing = dx < 0 ? -1 : 1;
            v.x = Math.max(d.x0, Math.min(d.x1, v.x + Math.sign(dx) * Math.min(Math.abs(dx), d.jumpTrackSpeed * dt)));
            v.y = floorY - d.jumpPeak * 4 * k * (1 - k);
            // Tushayotganda tanasi ostida qolganlar - ezilib otilib ketadi
            if (k > 0.5) {
                const box = this.vendRect(v, d);
                box.h += d.legH;   // oyoqlari ham
                alive.forEach(p => {
                    if (a.hit.includes(p.id)) return;
                    if (!this.checkOverlap({ x: p.x - this.PLAYER_HALF_W, y: p.y - this.PLAYER_HALF_H, w: this.PLAYER_HALF_W * 2, h: this.PLAYER_HALF_H * 2 }, box)) return;
                    a.hit.push(p.id);
                    this.hurtPlayer(p, d.landDamage);
                    this.knockback(p, (p.x < v.x ? -1 : 1) * d.landSpeed, -420);
                });
            }
            if (k >= 1) {
                v.y = floorY;
                // Yerga qo'ndi: yonidagilar ham zarba oladi; so'ng bir oz QALQONSIZ turadi
                alive.forEach(p => {
                    if (a.hit.includes(p.id)) return;
                    if (Math.abs(p.x - v.x) > d.w / 2 + 40 || p.y + this.PLAYER_HALF_H < floorY - 30) return;
                    this.hurtPlayer(p, Math.round(d.landDamage / 2));
                    this.knockback(p, (p.x < v.x ? -1 : 1) * d.landSpeed, -360);
                });
                this.io.to(roomId).emit('vendLand', { x: Math.round(v.x) });
                v.vuln = ms(d.vulnMs);
                v.act = null;
                v.nextAct = v.tick + ms(d.vulnMs + d.restMs);
            }
        }
    }

    // ===== IRON GIANT (Season 2, map-8) =====
    private robotDefeated(room: RoomState): void {
        const r = room.robot, R = getMapById(room.selectedLevel).robot;
        if (!r || !R || r.state === 'dying' || r.state === 'done') return;
        r.state = 'dying';
        r.timer = Math.round(R.dyingMs / 30);
        r.act = null; r.laser = null; r.bolts = [];
        r.fist.phase = 'back';
        room.bots = [];
        this.io.to(room.id).emit('robotDown', {});
    }
    // Zarba tushadigan joy: x dagi eng yuqori sirt (platforma yoki yer), nishon oyog'idan pastda
    private robotLandY(map: MapDef, x: number, feet: number): number {
        let y = this.GROUND_Y + this.PLAYER_HALF_H - 4;   // yer (570)
        [0, 1, 2, 4].map(i => map.platforms[i]).forEach(pl => { if (x >= pl.x - 6 && x <= pl.x + pl.w + 6 && pl.y >= feet - 10 && pl.y < y) y = pl.y; });
        return y;
    }
    // Ko'zdan nishon tomonga lazer chizig'i: maydon chetigacha (yoki yergacha) cho'ziladi
    private robotLaserLine(R: NonNullable<MapDef['robot']>, tg: PlayerState) {
        const x1 = R.head.x + 2, y1 = R.eyeY;   // chap ko'z (bosh chetidan chiqib turadi)
        let dx = tg.x - x1, dy = tg.y - y1;
        if (dx > -40) dx = -40;                      // doim chapga (maydon tomonga)
        const d = Math.hypot(dx, dy); dx /= d; dy /= d;
        let k = (R.arenaX - x1) / dx;                // chap chetgacha
        if (dy > 0) k = Math.min(k, (this.GROUND_Y + this.PLAYER_HALF_H - y1) / dy);
        if (dy < 0) k = Math.min(k, (0 - y1) / dy);
        return { x1, y1, x2: x1 + dx * k, y2: y1 + dy * k, phase: 'warn' as const, t: 0, hit: [] as string[] };
    }
    private updateRobot(room: RoomState, roomId: string): void {
        const map = getMapById(room.selectedLevel);
        const R = map.robot, r = room.robot;
        if (!R || !r || room.isOver) return;
        const ms = (v: number) => Math.round(v / 30), dt = this.TICK_SECONDS;
        r.tick++;
        if (r.hitFlash > 0) r.hitFlash--;
        const alive = Object.values(room.players).filter(p => !p.isDead);
        if (r.state === 'walk') {
            if (alive.some(p => p.x >= R.triggerX)) {
                r.state = 'intro'; r.timer = ms(R.introMs);
                this.io.to(roomId).emit('robotWake', { arenaX: R.arenaX });
            }
            return;
        }
        if (r.state === 'intro') { if (--r.timer <= 0) { r.state = 'on'; r.nextAct = r.tick + ms(600); } return; }
        if (r.state === 'dying') {
            if (--r.timer <= 0) {
                r.state = 'done';
                this.roomManager.declareWinner(roomId, this.topKillerId(room)).catch(err => console.error('declareWinner xatosi:', err));
            }
            return;
        }
        if (r.state === 'done') return;
        const inArena = alive.filter(p => p.x >= R.arenaX);
        const f = r.fist;
        const feet = (p: PlayerState) => p.y + this.PLAYER_HALF_H;
        // QO'L: nishon tepasiga boradi (qizil soya), tushib uradi, biroz turadi, joyiga qaytadi
        const aimAt = (warnMs: number, dmg: number) => {
            const tg = inArena[Math.floor(Math.random() * inArena.length)];
            if (!tg) return false;
            f.tx = Math.max(R.arenaX + 40, Math.min(R.head.x - 30, tg.x));
            f.ty = this.robotLandY(map, f.tx, feet(tg));
            f.phase = 'aim'; f.t = 0; f.warn = ms(warnMs); f.dmg = dmg; f.hit = [];
            this.io.to(roomId).emit('robotAim', { x: Math.round(f.tx), y: Math.round(f.ty) });
            return true;
        };
        if (f.phase === 'aim') {
            // Nishon ustiga (tepadan) siljiydi
            f.t++;
            f.x += (f.tx - f.x) * 0.25; f.y += ((f.ty - 230) - f.y) * 0.25;
            if (f.t >= f.warn) { f.phase = 'down'; f.t = 0; }
        } else if (f.phase === 'down') {
            f.x = f.tx;
            f.y = Math.min(f.ty, f.y + 1700 * dt);
            // Qo'l ostida qolganlar (tushish yo'lida) - uriladi va otib yuboriladi
            alive.forEach(p => {
                if (f.hit.includes(p.id)) return;
                if (Math.abs(p.x - f.x) > R.smashW / 2 + this.PLAYER_HALF_W) return;
                if (p.y - this.PLAYER_HALF_H > f.y || feet(p) < f.y - 60) return;
                f.hit.push(p.id);
                this.hurtPlayer(p, f.dmg);
                this.knockback(p, (p.x < f.x ? -1 : 1) * 560, -380);
            });
            if (f.y >= f.ty) { f.phase = 'hold'; f.t = 0; this.io.to(roomId).emit('robotSmash', { x: Math.round(f.x), y: Math.round(f.ty) }); }
        } else if (f.phase === 'hold') {
            if (++f.t >= ms(320)) { f.phase = 'back'; f.t = 0; }
        } else if (f.phase === 'back') {
            f.x += (R.fistRest.x - f.x) * 0.2; f.y += (R.fistRest.y - f.y) * 0.2;
            if (Math.hypot(f.x - R.fistRest.x, f.y - R.fistRest.y) < 6) { f.phase = 'rest'; f.x = R.fistRest.x; f.y = R.fistRest.y; }
        }
        // LAZER: ko'zlar qizarib yonadi (ingichka chiziq - qayerga otishi), so'ng KO'ZDAN shu chiziq bo'ylab otiladi
        if (r.laser) {
            const L = r.laser;
            L.t++;
            if (L.phase === 'warn' && L.t >= ms(R.laserWarnMs)) { L.phase = 'fire'; L.t = 0; this.io.to(roomId).emit('robotLaser', {}); }
            if (L.phase === 'fire') {
                const lx = L.x2 - L.x1, ly = L.y2 - L.y1, ll = Math.max(1, lx * lx + ly * ly);
                alive.forEach(p => {
                    if (L.hit.includes(p.id)) return;
                    const k = Math.max(0, Math.min(1, ((p.x - L.x1) * lx + (p.y - L.y1) * ly) / ll));
                    if (Math.hypot(p.x - (L.x1 + lx * k), p.y - (L.y1 + ly * k)) > this.PLAYER_HALF_W + 14) return;
                    L.hit.push(p.id);
                    this.hurtPlayer(p, R.laserDamage);
                    this.knockback(p, -420, -260);
                });
                if (L.t >= ms(R.laserFireMs)) r.laser = null;
            }
        }
        // CHAQMOQLAR: to'g'ri chiziqda tez uchadi; tekkan qahramon - zarar va LA'NAT (stamina sekin to'ladi)
        for (let i = r.bolts.length - 1; i >= 0; i--) {
            const b = r.bolts[i];
            b.x += b.vx * dt; b.y += b.vy * dt; b.t++;
            const hit = alive.find(p => Math.abs(p.x - b.x) <= this.PLAYER_HALF_W + 10 && Math.abs(p.y - b.y) <= this.PLAYER_HALF_H + 10);
            if (hit) {
                r.bolts.splice(i, 1);
                this.hurtPlayer(hit, R.boltDamage);
                this.knockback(hit, (b.vx < 0 ? -1 : 1) * 260, -200);
                this.curse(hit, 'bolt');
                this.io.to(roomId).emit('robotBoltHit', { id: hit.id, x: Math.round(b.x), y: Math.round(b.y) });
                continue;
            }
            if (b.t > ms(1600) || b.x < R.arenaX - 40 || b.y > 600 || b.y < -40) r.bolts.splice(i, 1);
        }
        if (r.state === 'off') {
            // Dam olmoqda: tashlangan bot(lar) yengilgach - yana yonadi
            if (!room.bots.length && --r.timer <= 0) { r.state = 'on'; r.nextAct = r.tick + ms(900); this.io.to(roomId).emit('robotOn', {}); }
            return;
        }
        // ON: hujumlar ketma-ketligi
        const a = r.act;
        if (!a) {
            if (r.tick < r.nextAct || f.phase !== 'rest' || !inArena.length) return;
            const order: ('smash' | 'combo' | 'bolts' | 'throw')[] = ['smash', 'bolts', 'combo', 'smash', 'bolts', 'throw'];
            r.act = { kind: order[r.step++ % order.length], t: 0, n: 0 };
            return;
        }
        a.t++;
        if (a.kind === 'smash') {
            // Avval qo'l bilan tepadan uradi; qo'l yerga tekkach - ko'zidan lazer (o'sha paytdagi nishonga)
            if (a.n === 0) { aimAt(R.smashWarnMs, R.smashDamage); a.n = 1; }
            else if (a.n === 1 && (f.phase === 'hold' || f.phase === 'back' || f.phase === 'rest')) {
                const lt = inArena[Math.floor(Math.random() * inArena.length)];
                if (lt) r.laser = this.robotLaserLine(R, lt);
                a.n = 2;
            }
            if (a.n === 2 && f.phase === 'rest' && !r.laser) { r.act = null; r.nextAct = r.tick + ms(R.restMs); }
        } else if (a.kind === 'combo') {
            // Ketma-ket 4 marta tepadan
            if (f.phase === 'rest' || (f.phase === 'back' && a.n > 0)) {
                if (a.n < 4) { if (aimAt(R.comboWarnMs, R.comboDamage)) a.n++; else a.n = 4; }
                else if (f.phase === 'rest') { r.act = null; r.nextAct = r.tick + ms(R.restMs); }
            }
        } else if (a.kind === 'bolts') {
            // Qo'lidan qurol chiqaradi va ketma-ket 5 ta chaqmoq otadi (har biri - o'sha paytdagi nishonga)
            if (a.t === 1) this.io.to(roomId).emit('robotGun', {});
            const start = ms(450), every = ms(R.boltEveryMs);
            if (a.t >= start && a.n < R.boltCount && (a.t - start) % every === 0) {
                const tg = inArena[Math.floor(Math.random() * inArena.length)];
                if (tg) {
                    const sx = R.fistRest.x - 76, sy = R.fistRest.y + 6;   // qurol uchidan
                    const d = Math.max(1, Math.hypot(tg.x - sx, tg.y - sy));
                    r.bolts.push({ id: 'bt' + (++r.counter), x: sx, y: sy, vx: (tg.x - sx) / d * R.boltSpeed, vy: (tg.y - sy) / d * R.boltSpeed, t: 0 });
                    this.io.to(roomId).emit('robotBolt', {});
                }
                a.n++;
            }
            if (a.n >= R.boltCount && a.t >= start + every * R.boltCount + ms(500)) { r.act = null; r.nextAct = r.tick + ms(R.restMs); }
        } else if (a.kind === 'throw') {
            // Tanasidagi lyuk ochiladi, ichidan robot bot chiqadi, so'ng gigant tutab o'chadi
            if (a.t === 1) this.io.to(roomId).emit('robotHatch', {});
            if (a.t === ms(800)) {
                const hx = R.arenaX + 660, hy = 500;   // tana tagidagi lyuk oldida
                const bot = GameEngine.createBots(room.id, [{ x: hx, y: hy }], 'robot', R.botHp * Math.max(1, Object.keys(room.players).length))[0];
                bot.id += '_rb' + r.tick;
                room.bots.push(bot);
                this.io.to(roomId).emit('robotThrow', { x: hx, y: hy });
            }
            if (a.t >= ms(1300)) {
                r.act = null; r.state = 'off'; r.timer = ms(800);
                this.io.to(roomId).emit('robotOff', {});
            }
        }
    }

    // ===== INFINITY TNT (Season 2, map-7) =====
    // Qahramon turgan (yoki ostidagi eng yaqin) gorilla yuzasi
    private tntSurfaceUnder(map: MapDef, x: number, feet: number): number {
        const T = map.tnt!;
        let best = T.floor, bestY = Infinity;
        T.surfaces.forEach(i => {
            const s = map.platforms[i];
            if (x >= s.x && x <= s.x + s.w && s.y >= feet - 8 && s.y < bestY) { best = i; bestY = s.y; }
        });
        return best;
    }
    private tntOnCliff(map: MapDef, p: PlayerState): boolean {
        const T = map.tnt!;
        return (p.x <= T.leftCliffX + 6 || p.x >= T.rightCliffX - 6) && p.y + this.PLAYER_HALF_H <= T.cliffY + 8;
    }
    private tntBlast(room: RoomState, x: number, y: number, radius: number, dmg: number, kind: string): void {
        Object.values(room.players).filter(p => !p.isDead).forEach(p => {
            const cx = Math.max(p.x - this.PLAYER_HALF_W, Math.min(x, p.x + this.PLAYER_HALF_W));
            const cy = Math.max(p.y - this.PLAYER_HALF_H, Math.min(y, p.y + this.PLAYER_HALF_H));
            if (Math.hypot(x - cx, y - cy) > radius) return;
            this.hurtPlayer(p, dmg);
            this.knockback(p, (p.x < x ? -1 : 1) * 200, -240);
        });
        this.io.to(room.id).emit('tntBlast', { x: Math.round(x), y: Math.round(y), kind });
    }
    // Bino ichida itarish: qahramon qoya devoriga qarab itarilsa va devorga yaqin bo'lsa - devorga emas, tepaga va
    // teskari tomonga (gorilla ustidan) otiladi. Aks holda gorilla bilan devor orasida qisilib "yopishib" qolardi
    private tntPush(map: MapDef, p: PlayerState, dir: number, speed: number, vy: number): void {
        const T = map.tnt!;
        const nearLeft = dir < 0 && p.x - T.leftCliffX < 150, nearRight = dir > 0 && T.rightCliffX - p.x < 150;
        if (nearLeft || nearRight) this.knockback(p, -dir * Math.min(speed, 520), Math.min(vy, -560));
        else this.knockback(p, dir * speed, vy);
    }
    // TNT 0 ga tushdi: hujumlar to'xtaydi, 3 soniya - qoyaga qochish
    private tntFuse(room: RoomState): void {
        const t = room.tnt, T = getMapById(room.selectedLevel).tnt;
        if (!t || !T || t.state !== 'fight') return;
        t.state = 'fuse';
        t.timer = Math.round(T.fuseMs / 30);
        t.bombs = []; t.warns = [];
        t.gor.act = 'panic';
        this.io.to(room.id).emit('tntFuse', { ms: T.fuseMs });
    }
    private updateTnt(room: RoomState, roomId: string): void {
        const map = getMapById(room.selectedLevel);
        const T = map.tnt, t = room.tnt;
        if (!T || !t || room.isOver) return;
        const dt = this.TICK_SECONDS, ms = (v: number) => Math.round(v / 30);
        t.tick++;
        if (t.hitFlash > 0) t.hitFlash--;
        const alive = Object.values(room.players).filter(p => !p.isDead);
        // Jarlikka yiqilgan (bino qulagach) - halok
        alive.forEach(p => { if (p.y > 640) this.killPlayer(p); });
        if (t.state === 'intro') { if (--t.timer <= 0) { t.state = 'fight'; t.nextAct = t.tick + ms(800); } return; }
        if (t.state === 'fuse') {
            if (--t.timer <= 0) {
                // BINO PORTLADI: qoyada turmaganlar jarlikka qulaydi
                t.state = 'boom';
                t.timer = ms(2600);
                Object.values(room.players).forEach(p => { if (!p.isDead && !this.tntOnCliff(map, p)) this.killPlayer(p); });
                this.io.to(roomId).emit('tntBoom', {});
            }
            return;
        }
        if (t.state === 'boom') {
            if (--t.timer <= 0) {
                t.state = 'done';
                const survivors = Object.values(room.players).filter(p => !p.isDead);
                if (survivors.length) this.roomManager.declareWinner(roomId, survivors[0].id).catch(err => console.error('declareWinner xatosi:', err));
            }
            return;
        }
        if (t.state !== 'fight') return;
        const g = t.gor;
        const fighters = alive.filter(p => !this.tntOnCliff(map, p));
        // Qoyada turganlar ham jangda: gorilla ularga sakramaydi (qoya - oxirgi portlashdan qochish joyi), lekin
        // bochka otadi va osmondan bomba yog'diradi (avval qoyaga chiqib olgan o'yinchiga hech narsa qilmasdi)
        const W = map.mapWidth, campers = alive.filter(p => this.tntOnCliff(map, p));
        const surf = (i: number) => map.platforms[i];
        // Polda - butun tanasi bino ichida (qoyaga kirib, qahramonni devorga qisib qo'ymasin); tor qavatlarda - deyarli chetigacha
        const margin = (i: number) => (i === T.floor ? T.gorHalfW + 6 : Math.min(T.gorHalfW * 0.6, surf(i).w / 2 - 8));
        const clampOn = (i: number, x: number) => Math.max(surf(i).x + margin(i), Math.min(surf(i).x + surf(i).w - margin(i), x));
        const boxCx = T.box.x + T.box.w / 2;
        const startLeap = (toSurf: number, toX: number) => {
            g.act = 'leap'; g.t = 0; g.x0 = g.x; g.y0 = g.y; g.x1 = clampOn(toSurf, toX); g.y1 = surf(toSurf).y; g.surf = toSurf;
            g.dur = ms(950); g.peak = Math.max(120, g.y0 - g.y1 + 110); g.facing = g.x1 >= g.x0 ? 1 : -1;
        };
        // Bochkalar (qo'ldan otilgan va osmondan tushayotgan)
        for (let i = t.bombs.length - 1; i >= 0; i--) {
            const b = t.bombs[i];
            const py = b.y;
            b.vy += (b.kind === 'sky' ? 1100 : 900) * dt;
            b.x += b.vx * dt; b.y += b.vy * dt;
            let boom = false;
            if (b.kind === 'sky') { if (b.y >= b.landY) { b.y = b.landY; boom = true; } }
            else {
                // Qahramonga tegdi yoki platformaga tushdi
                if (alive.some(p => Math.abs(p.x - b.x) <= this.PLAYER_HALF_W + 20 && Math.abs(p.y - b.y) <= this.PLAYER_HALF_H + 20)) boom = true;
                // Yo'ldagi platformalardan o'tib ketadi: faqat nishon turgan sirtga (landY) yetganda portlaydi
                if (!boom && b.vy > 0 && py <= b.landY && b.y >= b.landY) { b.y = b.landY; boom = true; }
                if (b.y > 660 || b.x < -50 || b.x > W + 50) { t.bombs.splice(i, 1); continue; }
            }
            if (boom) {
                t.bombs.splice(i, 1);
                if (b.kind === 'sky') { const w = t.warns.findIndex(w => w.id === b.id); if (w >= 0) t.warns.splice(w, 1); }
                this.tntBlast(room, b.x, b.y - 10, b.kind === 'sky' ? T.skyRadius : T.bombRadius, b.kind === 'sky' ? T.skyDamage : T.bombDamage, b.kind);
            }
        }
        // Gorillaga tegib ketgan qahramon - itarib yuboriladi
        Object.keys(t.contactCd).forEach(id => { if (--t.contactCd[id] <= 0) delete t.contactCd[id]; });
        if (g.act !== 'leap') alive.forEach(p => {
            if (t.contactCd[p.id]) return;
            if (Math.abs(p.x - g.x) <= T.gorHalfW + this.PLAYER_HALF_W - 6 && p.y + this.PLAYER_HALF_H > g.y - T.gorH && p.y - this.PLAYER_HALF_H < g.y) {
                t.contactCd[p.id] = ms(1000);
                this.hurtPlayer(p, T.contactDamage);
                this.tntPush(map, p, p.x < g.x ? -1 : 1, T.contactSpeed, -380);
                this.io.to(roomId).emit('tntPush', { id: p.id });
            }
        });
        // Harakat
        if (g.act === 'leap') {
            g.t++;
            const f = Math.min(1, g.t / g.dur);
            g.x = g.x0 + (g.x1 - g.x0) * f;
            g.y = g.y0 + (g.y1 - g.y0) * f - g.peak * 4 * f * (1 - f);
            if (f >= 1) {
                // Qo'ndi - zarba: shu yuzada yaqin turganlar uchib ketadi
                g.act = 'idle'; g.y = g.y1;
                const top = surf(g.surf).y;
                alive.forEach(p => {
                    if (Math.abs(p.x - g.x) > T.slamRange || Math.abs(p.y + this.PLAYER_HALF_H - top) > 16) return;
                    this.hurtPlayer(p, T.slamDamage);
                    this.tntPush(map, p, p.x < g.x ? -1 : 1, 320, -280);
                });
                this.io.to(roomId).emit('tntSlam', { x: Math.round(g.x), y: Math.round(top) });
                if (g.plan === 'leap') { g.plan = null; t.nextAct = t.tick + ms(T.restMs); }
                else if (g.plan === 'throw') { g.act = 'throw'; g.t = 0; g.thrown = 0; }
            }
            return;
        }
        if (g.act === 'grab') {
            if (++g.t >= ms(700)) {
                if (g.plan === 'throw') {
                    // Bochkalar qo'lida - nishon o'yinchining ustiga sakraydi (qo'nishda zarba), so'ng yaqindan otadi
                    // Qoyadagini birinchi navbatda nishonga oladi (u yerga sakramaydi - poldan otadi)
                    const pool = campers.length && (Math.random() < 0.6 || !fighters.length) ? campers : fighters;
                    const tg = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
                    g.target = tg ? tg.id : null;
                    if (tg && !this.tntOnCliff(map, tg)) startLeap(this.tntSurfaceUnder(map, tg.x, tg.y + this.PLAYER_HALF_H), tg.x);
                    else { g.act = 'throw'; g.t = 0; g.thrown = 0; }
                }
                else { g.act = 'sky'; g.t = 0; this.io.to(roomId).emit('tntSkyThrow', { x: Math.round(g.x), y: Math.round(g.y) }); }
            }
            return;
        }
        if (g.act === 'throw') {
            g.t++;
            // Ikki bochka ketma-ket: nishon - ustiga sakragan o'yinchi (tirik bo'lsa), aks holda tasodifiy jangchi
            if ((g.thrown === 0 && g.t >= ms(250)) || (g.thrown === 1 && g.t >= ms(650))) {
                const tg = alive.find(p => p.id === g.target) || alive[Math.floor(Math.random() * alive.length)];
                if (tg) {
                    const sx = g.x + g.facing * 40, sy = g.y - T.gorH + 16;
                    const ft = Math.max(0.45, Math.min(0.9, Math.hypot(tg.x - sx, tg.y - sy) / 650));
                    // 1-bochka: qahramon yugurayotgan tomonga oldindan (yetib borgan paytdagi joyi); 2-bochka: hozirgi joyiga -
                    // to'xtasa yoki orqaga burilsa ham qochib qutulish qiyin
                    const m = this.playerMotion.get(tg.id);
                    const lead = m && g.thrown === 0 ? Math.max(-150, Math.min(150, m.vx * ft * 0.85)) : 0;
                    const tx = Math.max(16, Math.min(W - 16, tg.x + lead)), ty = tg.y + 8;
                    // Nishon turgan sirt (yoki undan pastdagi eng yaqini) - bochka shu yerga tushib portlaydi
                    const feet = tg.y + this.PLAYER_HALF_H;
                    let landY = 700;
                    [...T.building, 1, 2].forEach(pi => { const s = surf(pi); if (tx >= s.x - 10 && tx <= s.x + s.w + 10 && s.y >= feet - 10 && s.y < landY) landY = s.y; });
                    t.bombs.push({ id: 'tb' + (++t.counter), x: sx, y: sy, vx: (tx - sx) / ft, vy: (ty - sy - 0.5 * 900 * ft * ft) / ft, kind: 'throw', landY });
                    g.facing = tx >= g.x ? 1 : -1;
                }
                g.thrown++;
            }
            if (g.thrown >= 2 && g.t >= ms(1100)) { g.act = 'idle'; g.plan = null; g.target = null; t.nextAct = t.tick + ms(T.restMs); }
            return;
        }
        if (g.act === 'clap') {
            // QARSAK: qo'llarini ko'taradi (ogohlantirish), so'ng qattiq urishadi - zarba to'lqini faqat shu
            // balandlik bo'ylab: gorilla bilan bir xil yuzada turganlar uchib ketadi, tepada/pastdagilarga ta'sir yo'q
            g.t++;
            if (g.t === ms(T.clapWarnMs)) {
                const top = surf(g.surf).y;
                alive.forEach(p => {
                    if (this.tntOnCliff(map, p) || Math.abs(p.y + this.PLAYER_HALF_H - top) > 16) return;
                    this.hurtPlayer(p, T.clapDamage);
                    this.tntPush(map, p, p.x < g.x ? -1 : 1, T.clapSpeed, -420);
                });
                this.io.to(roomId).emit('tntClap', { x: Math.round(g.x), y: Math.round(top) });
            }
            if (g.t >= ms(T.clapWarnMs + 500)) { g.act = 'idle'; g.plan = null; t.nextAct = t.tick + ms(T.restMs); }
            return;
        }
        if (g.act === 'sky') {
            g.t++;
            if (g.t === ms(500)) {
                // Osmonga otilgan 5 bochka qayerga tushishi - qizil belgi (jangchilar ustiga va tasodifiy joylarga)
                // Qoyadagilar ustiga ham (bitta qahramonga bir nechta - qochish uchun joy qoladi)
                const xs: number[] = alive.map(p => p.x + (Math.random() - 0.5) * 40);
                campers.forEach(p => xs.push(p.x + (p.x < W / 2 ? 45 : -45)));
                while (xs.length < T.skyBombs) xs.push(T.leftCliffX + 30 + Math.random() * (T.rightCliffX - T.leftCliffX - 60));
                xs.slice(0, Math.max(T.skyBombs, Math.min(8, xs.length))).forEach((x0, k) => {
                    const x = Math.max(14, Math.min(W - 14, x0));
                    // Eng birinchi (eng yuqoridagi) yuzaga tushadi - tom ostida turgan qahramon himoyalangan
                    let landY = 700;
                    [...T.building, 1, 2].forEach(pi => { const s = surf(pi); if (x >= s.x && x <= s.x + s.w && s.y < landY) landY = s.y; });
                    const id = 'sk' + (++t.counter);
                    t.warns.push({ id, x: Math.round(x), y: landY });
                    // Ekran tepasidan ancha yuqoridan tushadi: belgi chiqqach ~1 s o'tib yetib keladi (har biri biroz kechikib)
                    t.bombs.push({ id, x, y: -340 - k * 70, vx: 0, vy: 0, kind: 'sky', landY });
                });
            }
            if (g.t >= ms(1500)) { g.act = 'idle'; g.plan = null; t.nextAct = t.tick + ms(T.restMs + 600); }
            return;
        }
        // IDLE / WALK: rejadagi hujumga tayyorlanadi
        const target = fighters.length ? fighters.reduce((a, b) => (Math.abs(a.x - g.x) < Math.abs(b.x - g.x) ? a : b)) : null;
        if (!g.plan && t.tick >= t.nextAct && alive.length) {
            const order: ('throw' | 'leap' | 'sky' | 'clap')[] = ['throw', 'clap', 'leap', 'throw', 'sky', 'leap', 'clap'];
            g.plan = order[t.step++ % order.length];
            // Hamma qoyada - yaqin hujumlar (sakrash, qarsak) o'rniga bochka / osmon bombalari
            if (!fighters.length && (g.plan === 'leap' || g.plan === 'clap')) g.plan = t.step % 2 ? 'sky' : 'throw';
        }
        if (g.plan === 'clap') {
            g.act = 'clap'; g.t = 0;
            this.io.to(roomId).emit('tntClapWarn', { x: Math.round(g.x), y: Math.round(surf(g.surf).y) });
            return;
        }
        if (g.plan === 'leap' && target) {
            const ts = this.tntSurfaceUnder(map, target.x, target.y + this.PLAYER_HALF_H);
            startLeap(ts, target.x);
            return;
        }
        if (g.plan === 'throw' || g.plan === 'sky') {
            // Bochka olish uchun - TNT yoniga (poldan); tepada bo'lsa - pastga sakraydi
            if (g.surf !== T.floor) { startLeap(T.floor, boxCx + (g.x < boxCx ? -70 : 70)); return; }
            const want = boxCx + (g.x < boxCx ? -62 : 62);
            if (Math.abs(g.x - want) > 6) { g.act = 'walk'; g.facing = want > g.x ? 1 : -1; g.x += g.facing * T.gorSpeed * dt; return; }
            g.act = 'grab'; g.t = 0; g.facing = boxCx > g.x ? 1 : -1;
            return;
        }
        // Tanaffus: eng yaqin jangchi tomonga sekin yuradi (o'z yuzasida)
        if (target && g.surf === T.floor && Math.abs(target.x - g.x) > 80) {
            g.act = 'walk'; g.facing = target.x > g.x ? 1 : -1;
            g.x = clampOn(g.surf, g.x + g.facing * T.gorSpeed * 0.6 * dt);
        } else g.act = 'idle';
    }

    // ===== HIS BACK (Season 2, map-6) =====
    // Qiyalik yuzasi (y) berilgan x da; x qiyalik oralig'idan tashqarida bo'lsa - null
    private rampSurfaceY(r: { lowX: number, lowY: number, highX: number, highY: number }, x: number): number | null {
        const a = Math.min(r.lowX, r.highX), b = Math.max(r.lowX, r.highX);
        if (x < a || x > b) return null;
        return r.lowY + (r.highY - r.lowY) * ((x - r.lowX) / (r.highX - r.lowX));
    }
    // Qahramon qaysi balandlikdagi qiyalikda (taxminan): bochka qayerda paydo bo'lishini tanlash uchun
    private backRampIndex(B: NonNullable<MapDef['back']>, p: PlayerState): number {
        const step = B.ramps.length > 1 ? B.ramps[0].lowY - B.ramps[1].lowY : 210;
        return Math.max(0, Math.min(B.ramps.length - 1, Math.floor((B.groundY - (p.y + this.PLAYER_HALF_H)) / step)));
    }
    private updateBack(room: RoomState, roomId: string): void {
        const map = getMapById(room.selectedLevel);
        const B = map.back, bk = room.back;
        if (!B || !bk || room.isOver) return;
        const T = (ms: number) => Math.round(ms / 30);
        const dt = this.TICK_SECONDS;
        bk.tick++;
        const alive = Object.values(room.players).filter(p => !p.isDead);
        if (bk.state === 'walk') {
            // Minoraga (yo'lning 100-metriga) yetildi - tepadan Gorila Rock gapiradi
            if (alive.some(p => p.x >= B.towerX0 + 20)) {
                bk.state = 'talk1';
                bk.timer = T(30000);
                Object.values(room.players).forEach(p => { p.introDone = false; });
            }
            return;
        }
        if (bk.state === 'talk1') {
            if (--bk.timer <= 0 || alive.every(p => p.introDone)) {
                bk.state = 'climb';
                bk.nextBarrel = bk.tick + T(900);
            }
            return;
        }
        if (bk.state === 'talk2') {
            if (--bk.timer <= 0 || alive.every(p => p.introDone)) {
                bk.state = 'done';
                this.roomManager.declareWinner(roomId, this.topKillerId(room)).catch(err => console.error('declareWinner xatosi:', err));
            }
            return;
        }
        if (bk.state !== 'climb') return;
        // Hamma tirik qahramon eng tepadagi maydonchada - so'nggi suhbat
        const atTop = (p: PlayerState) => p.y + this.PLAYER_HALF_H <= B.topY + 10 && p.x >= B.towerX0 && p.x <= B.towerX1;
        if (alive.length > 0 && alive.every(atTop)) {
            bk.barrels.forEach(b => this.io.to(roomId).emit('barrelBoom', { x: Math.round(b.x), y: Math.round(b.y), id: null }));
            bk.barrels = [];
            bk.state = 'talk2';
            bk.timer = T(30000);
            Object.values(room.players).forEach(p => { p.introDone = false; });
            return;
        }
        // Yangi bochka: tasodifiy tirik qahramondan barrelAhead qiyalik yuqorida (eng tepadan oshmaydi), qiyalikning baland uchida
        const climbers = alive.filter(p => !atTop(p) && p.x >= B.towerX0 - 40);
        if (bk.tick >= bk.nextBarrel && bk.barrels.length < B.barrelMax && climbers.length) {
            const target = climbers[Math.floor(Math.random() * climbers.length)];
            const ri = Math.min(B.ramps.length - 1, this.backRampIndex(B, target) + B.barrelAhead);
            const r = B.ramps[ri];
            bk.barrels.push({ id: 'brl' + (++bk.counter), ramp: ri, x: r.highX + Math.sign(r.lowX - r.highX), y: r.highY - B.barrelR, dir: Math.sign(r.lowX - r.highX), phase: 'roll', vy: 0 });
            bk.nextBarrel = bk.tick + T(B.barrelEveryMs * (0.75 + Math.random() * 0.5));
        }
        const lowest = climbers.length ? Math.min(...climbers.map(p => this.backRampIndex(B, p))) : 0;
        for (let i = bk.barrels.length - 1; i >= 0; i--) {
            const b = bk.barrels[i];
            b.x += b.dir * B.barrelSpeed * dt;
            if (b.phase === 'ledge') {
                // Burchakdan devorgacha maydonchada: devorga urilib portlaydi (maydonchada turgan qahramonga tegishi mumkin)
                const L = B.ledges[b.ramp];
                b.y = L.y - B.barrelR;
                if (b.dir < 0 ? b.x <= L.x0 + B.barrelR : b.x >= L.x1 - B.barrelR) {
                    bk.barrels.splice(i, 1);
                    this.io.to(roomId).emit('barrelBoom', { x: Math.round(b.x), y: Math.round(b.y), id: null });
                    continue;
                }
            } else if (b.ramp < 0) {
                // Eng pastki qiyalikdan yerga tushdi - yo'l bo'ylab dumalab, minoradan chiqib ketadi
                b.y = B.groundY - B.barrelR;
                if (b.x < B.towerX0 - 500 || b.x > B.towerX1) { bk.barrels.splice(i, 1); continue; }
            } else {
                const r = B.ramps[b.ramp];
                const sy = this.rampSurfaceY(r, b.x);
                if (sy === null) {
                    // Past burchakka yetdi: yo maydonchaga burilib devorga qarab ketadi, yo pastki qiyalikda davom etadi
                    const k = b.ramp;
                    b.x = r.lowX;
                    if (k === 0) { b.ramp = -1; b.dir = -1; b.y = B.groundY - B.barrelR; }
                    else if (Math.random() < B.ledgeChance) {
                        b.phase = 'ledge';
                        b.dir = B.ledges[k].x0 < r.lowX - 1 ? -1 : 1;
                        b.y = B.ledges[k].y - B.barrelR;
                    } else {
                        b.ramp = k - 1;
                        b.dir = Math.sign(B.ramps[k - 1].lowX - B.ramps[k - 1].highX);
                        b.y = r.lowY - B.barrelR;
                    }
                } else b.y = sy - B.barrelR;
            }
            // Hech kim yo'q joyga tushib ketgan bochkalar o'chadi
            if (b.ramp >= 0 && b.ramp < lowest - 3) { bk.barrels.splice(i, 1); continue; }
            // Qahramonga tegdi - portlaydi
            const hit = alive.find(p => {
                const cx = Math.max(p.x - this.PLAYER_HALF_W, Math.min(b.x, p.x + this.PLAYER_HALF_W));
                const cy = Math.max(p.y - this.PLAYER_HALF_H, Math.min(b.y, p.y + this.PLAYER_HALF_H));
                return Math.hypot(b.x - cx, b.y - cy) <= B.barrelR;
            });
            if (hit) {
                bk.barrels.splice(i, 1);
                this.hurtPlayer(hit, B.barrelDamage);
                this.knockback(hit, (b.dir || 1) * 220, -260);
                this.io.to(roomId).emit('barrelBoom', { x: Math.round(b.x), y: Math.round(b.y), id: hit.id });
            }
        }
    }

    // ===== FERMA =====
    // E: sabzi yonida - suhbat (hammaga), o'qib bo'lingach sabzi sug'uriladi va zombilar chiqa boshlaydi
    public pullCarrot(room: RoomState, playerId: string): void {
        const F = getMapById(room.selectedLevel).farm;
        const p = room.players[playerId];
        if (!F || !room.farm || room.farm.state !== 'idle' || !p || p.isDead || room.isOver) return;
        if (Math.abs(p.x - F.carrotX) > F.talkRange) return;
        room.farm.state = 'talk';
        room.farm.timer = Math.round(15000 / 30);
        Object.values(room.players).forEach(x => { x.introDone = false; });
    }
    private spawnZombie(room: RoomState, F: NonNullable<MapDef['farm']>): void {
        const alive = Object.values(room.players).filter(p => !p.isDead);
        const near = alive[Math.floor(Math.random() * alive.length)];
        let x = F.carrotX;
        for (let tries = 0; tries < 20; tries++) {
            const base = near ? near.x : F.carrotX;
            x = base + (Math.random() < 0.5 ? -1 : 1) * (160 + Math.random() * 280);
            if (x < F.fieldX0 || x > F.fieldX1) continue;
            if (F.noSpawn.some(([a, b]) => x >= a && x <= b)) continue;
            if (alive.every(p => Math.abs(p.x - x) > 120)) break;
        }
        x = Math.max(F.fieldX0, Math.min(F.fieldX1, x));
        const bot = GameEngine.createBots(room.id, [{ x, y: this.GROUND_Y }], 'robot', 1)[0];
        bot.id += '_z' + room.farm!.spawned;
        bot.skin = 'zombie';
        bot.emerge = Math.round(F.zombieEmergeMs / 30);
        room.bots.push(bot);
        room.farm!.spawned++;
    }
    private updateZombieTongues(room: RoomState, F: NonNullable<MapDef['farm']>): void {
        const T = (ms: number) => Math.round(ms / 30);
        const alive = Object.values(room.players).filter(p => !p.isDead);
        room.bots.forEach(b => {
            if (b.skin !== 'zombie' || (b.emerge || 0) > 0) return;
            if (b.freezeDuration > 0) { b.tongue = null; return; }
            const mouthX = b.x + (b.facingLeft ? -8 : 8), mouthY = b.y - 26;
            if (b.tongue) {
                const tg = b.tongue;
                if (--tg.t > 0) return;
                if (tg.phase === 'aim') {
                    tg.phase = 'stab';
                    tg.t = T(260);
                    // Til nishon nuqtagacha (ko'pi bilan tongueRange) chiziq bo'ylab sanchadi
                    const dx = tg.tx - mouthX, dy = tg.ty - mouthY, len = Math.hypot(dx, dy) || 1;
                    const k = Math.min(1, F.tongueRange / len);
                    tg.tx = mouthX + dx * k; tg.ty = mouthY + dy * k;
                    alive.forEach(p => {
                        const ex = tg.tx - mouthX, ey = tg.ty - mouthY, L2 = ex * ex + ey * ey || 1;
                        const u = Math.max(0, Math.min(1, ((p.x - mouthX) * ex + (p.y - mouthY) * ey) / L2));
                        const d = Math.hypot(p.x - (mouthX + ex * u), p.y - (mouthY + ey * u));
                        if (d > 22) return;
                        this.hurtPlayer(p, F.tongueDamage);
                        this.knockback(p, (p.x < b.x ? -1 : 1) * 160, -260);
                    });
                } else {
                    b.tongue = null;
                    b.tongueCd = T(2600);
                }
                return;
            }
            if ((b.tongueCd || 0) > 0) { b.tongueCd!--; return; }
            // Nishon: yetadigan masofadagi qahramon - tepada (tom, soyabon, quduq) ham, pastda (yerda) ham.
            // Juda yaqin turgani (qo'li yetadigan) - oddiy hujum bilan uriladi, til otilmaydi
            const target = alive.find(p => {
                const d = Math.hypot(p.x - mouthX, p.y - mouthY);
                return d <= F.tongueRange + 20 && (Math.abs(p.x - b.x) > 60 || p.y + this.PLAYER_HALF_H < b.y + this.BOT_HALF_H - 40);
            });
            if (!target) return;
            b.facingLeft = target.x < b.x;
            b.tongue = { phase: 'aim', t: T(650), tx: target.x, ty: target.y };
        });
    }
    private updateFarm(room: RoomState, roomId: string): void {
        const map = getMapById(room.selectedLevel);
        const F = map.farm, farm = room.farm;
        if (!F || !farm || room.isOver) return;
        const T = (ms: number) => Math.round(ms / 30);
        farm.tick++;
        const alive = Object.values(room.players).filter(p => !p.isDead);
        // Itxona tomiga chiqqanga robot it hujum qiladi (oldingi itlardan qattiqroq)
        const roof = map.platforms[F.kennelRoof];
        const onRoof = alive.some(p => p.x >= roof.x - 6 && p.x <= roof.x + roof.w + 6 && Math.abs(p.y + this.PLAYER_HALF_H - roof.y) <= 10);
        const passing = alive.some(p => Math.abs(p.x - F.kennelX) <= F.kennelRange);
        if ((onRoof || passing) && !room.bots.some(b => b.kind === 'dog') && farm.tick - farm.lastDogTick >= T(F.dogCooldownMs) && farm.state !== 'done') {
            const dog = GameEngine.createBots(room.id, [{ x: F.kennelX - 50, y: this.GROUND_Y }], 'dog', F.dogHp)[0];
            dog.id += '_dog' + farm.tick;
            room.bots.push(dog);
            farm.lastDogTick = farm.tick;
            this.io.to(roomId).emit('farmDog');
        }
        // E bosmay sabzidan 5 m o'tib ketsa (YERDA yurib): yerdan ildizlar chiqib yerdagi qahramonlarni
        // oyog'idan 2 s ushlab turadi va polizlar uyg'onadi - zombi-sabzavotlar chiqa boshlaydi.
        // Tom/soyabon/quduq ustida turgan qahramonni ildiz ushlamaydi
        Object.keys(farm.rooted).forEach(id => { if (--farm.rooted[id] <= 0 || !room.players[id] || room.players[id].isDead) delete farm.rooted[id]; });
        Object.keys(farm.rootCd).forEach(id => { if (--farm.rootCd[id] <= 0) delete farm.rootCd[id]; });
        const onGround = (p: PlayerState) => p.y + this.PLAYER_HALF_H >= 562;
        if (farm.state === 'idle' && alive.some(p => onGround(p) && p.x >= F.carrotX + F.rootPastCarrot)) {
            alive.forEach(p => {
                if (!onGround(p) || p.x < F.carrotX - 200) return;
                farm.rooted[p.id] = T(F.rootMs);
                this.io.to(roomId).emit('farmRoot', { id: p.id, x: Math.round(p.x) });
            });
            farm.state = 'fight';
            farm.nextSpawnTick = farm.tick + T(600);
            this.io.to(roomId).emit('carrotPulled', { woke: true });
        }
        // Zombi-sabzavotlar: tepada (tom/platformada) turgan qahramonga og'zidan o'tkir igna-til otadi
        this.updateZombieTongues(room, F);
        if (farm.state === 'talk') {
            if (--farm.timer <= 0 || alive.every(p => p.introDone)) {
                farm.state = 'fight';
                farm.nextSpawnTick = farm.tick + T(1200);
                this.io.to(roomId).emit('carrotPulled');
            }
            return;
        }
        if (farm.state === 'fight') {
            // Boshida 3 ta zombi asta-sekin (birin-ketin) chiqadi; keyin har o'ldirilganiga - bittadan
            const zombies = room.bots.filter(b => b.skin === 'zombie').length;
            if (farm.spawned < farm.target && zombies < F.aliveZombies && farm.tick >= farm.nextSpawnTick) {
                this.spawnZombie(room, F);
                farm.nextSpawnTick = farm.tick + T(900);
            }
            if (farm.kills >= farm.target) {
                farm.state = 'done';
                farm.timer = T(1500);
                room.bots = room.bots.filter(b => b.skin !== 'zombie');
            }
            return;
        }
        if (farm.state === 'done' && farm.timer > 0 && --farm.timer <= 0) {
            room.bots = [];
            this.roomManager.declareWinner(roomId, this.topKillerId(room)).catch(err => console.error('declareWinner xatosi:', err));
        }
    }

    // ===== LIFT =====
    private liftProgress(room: RoomState): number {
        const L = getMapById(room.selectedLevel).lift;
        if (!L || !room.lift) return 0;
        if (room.lift.state === 'arrived' || room.lift.state === 'done') return 1;
        if (room.lift.state !== 'rising') return 0;
        return Math.min(1, room.lift.t / Math.round(L.riseMs / 30));
    }
    private onLift(L: NonNullable<MapDef['lift']>, liftY: number, p: PlayerState): boolean {
        return Math.abs(p.x - (L.x + L.w / 2)) <= L.w / 2 + 6 && Math.abs(p.y + this.PLAYER_HALF_H - liftY) <= 14;
    }
    // E: platformadagi qahramon bosadi - hamma tirik qahramon ustida bo'lsa, ko'tarilish boshlanadi
    public useLift(room: RoomState, playerId: string): void {
        const L = getMapById(room.selectedLevel).lift;
        const lift = room.lift;
        const p = room.players[playerId];
        if (!L || !lift || lift.state !== 'ready' || !p || p.isDead || room.isOver) return;
        if (!this.onLift(L, lift.y, p)) return;
        const alive = Object.values(room.players).filter(x => !x.isDead);
        const on = alive.filter(x => this.onLift(L, lift.y, x)).length;
        if (on < alive.length) {
            this.io.to(room.id).emit('liftWait', { on, total: alive.length });
            return;
        }
        lift.state = 'rising';
        lift.t = 0;
        lift.nextBotTick = 0;
        room.bots = [];
        this.io.to(room.id).emit('liftStart');
    }
    private updateLift(room: RoomState, roomId: string): void {
        const L = getMapById(room.selectedLevel).lift;
        const lift = room.lift;
        if (!L || !lift || room.isOver) return;
        const T = (ms: number) => Math.round(ms / 30);
        const alive = Object.values(room.players).filter(p => !p.isDead);
        lift.t++;
        if (lift.state === 'hidden') {
            if (alive.some(p => p.x >= L.triggerX)) { lift.state = 'emerge'; lift.t = 0; this.io.to(roomId).emit('liftEmerge'); }
            return;
        }
        if (lift.state === 'emerge') {
            const k = Math.min(1, lift.t / T(1500));
            lift.y = 600 - (600 - L.readyY) * k;
            if (k >= 1) { lift.state = 'ready'; lift.t = 0; }
            return;
        }
        if (lift.state === 'ready') return;
        // Ko'tarilish: avval platforma yerdan uzilib, ekranda biroz tepaga chiqadi; pastda - chuqur jarlik
        lift.y = L.readyY - (L.readyY - L.rideY) * Math.min(1, lift.t / T(L.liftOffMs));
        alive.forEach(p => { if (p.y > this.PIT_DEATH_Y) this.killPlayer(p); });
        for (let i = room.bots.length - 1; i >= 0; i--) if (room.bots[i].y > 700) room.bots.splice(i, 1);
        if (lift.state === 'rising') {
            // Qizil botlar: bittasi o'lsa (yoki jarlikka tushsa) - keyingisi tushadi, jami botsTotal ta
            if (room.bots.length === 0 && lift.spawned < L.botsTotal) {
                if (!lift.nextBotTick) lift.nextBotTick = lift.t + T(lift.spawned === 0 ? L.firstBotMs : L.nextBotMs);
                else if (lift.t >= lift.nextBotTick) {
                    const bx = L.x + 40 + Math.random() * (L.w - 80);
                    const bot = GameEngine.createBots(room.id, [{ x: bx, y: 60 }], 'robot', L.botHp)[0];
                    bot.id += '_l' + lift.spawned;
                    bot.elite = true;   // qizil
                    room.bots.push(bot);
                    lift.spawned++;
                    lift.nextBotTick = 0;
                }
            }
            if (lift.t >= T(L.riseMs)) {
                lift.state = 'arrived';
                lift.t = 0;
                this.io.to(roomId).emit('liftArrived');
            }
            return;
        }
        if (lift.state === 'arrived' && lift.t >= T(2200)) {
            lift.state = 'done';
            room.bots = [];
            const winner = this.topKillerId(room);
            this.roomManager.declareWinner(roomId, winner).catch(err => console.error('declareWinner xatosi:', err));
        }
    }

    // ===== GIGANT GUL =====
    // Qahramon qaysi sirtda turibdi: platforma indeksi, -1 = yer, null = havoda
    private gfSurfaceOf(map: MapDef, p: PlayerState): number | null {
        const feet = p.y + this.PLAYER_HALF_H;
        if (feet >= 562) return -1;
        const i = map.platforms.findIndex(pl => p.x >= pl.x - 8 && p.x <= pl.x + pl.w + 8 && Math.abs(feet - pl.y) <= 10);
        return i >= 0 ? i : null;
    }
    // Qahramon ostidagi eng yaqin sirt tepasi (havoda bo'lsa - qo'nadigan joyi)
    private gfSurfaceYUnder(map: MapDef, x: number, feet: number): number {
        let best = 570;
        map.platforms.forEach(pl => { if (x >= pl.x && x <= pl.x + pl.w && pl.y >= feet - 12 && pl.y < best) best = pl.y; });
        return best;
    }
    private updateGiantFlower(room: RoomState, roomId: string): void {
        const map = getMapById(room.selectedLevel);
        const d = map.giantFlower;
        const g = room.gflower;
        if (!d || !g || room.isOver) return;
        const T = (ms: number) => Math.round(ms / 30);
        const alive = Object.values(room.players).filter(p => !p.isDead);
        g.tick++;
        if (g.hitFlash > 0) g.hitFlash--;
        const thorns = room.gfThorns || (room.gfThorns = []);
        const roots = room.gfRoots || (room.gfRoots = []);
        const nextId = (k: string) => 'gf' + k + '_' + (room.gfCounter = (room.gfCounter || 0) + 1);

        if (g.state === 'sleep') {
            // Kimdir jang maydoniga yetdi - yo'llar tikon bilan yopiladi
            if (!alive.some(p => p.x >= d.triggerX)) return;
            g.state = 'wake';
            g.timer = T(1800);
            let slot = 0;
            Object.values(room.players).forEach(p => {
                if (p.x >= d.arenaX + 40 && p.x <= d.arenaX + d.arenaW - 40) return;
                p.x = d.arenaX + 70 + (slot++) * 34;
                p.y = 546;
                this.io.to(p.id).emit('teleport', { x: p.x, y: p.y });
            });
            this.io.to(roomId).emit('gflowerWake');
            return;
        }
        if (g.state === 'dying') {
            if (--g.timer <= 0) {
                const winner = (g.lastHitBy && room.players[g.lastHitBy]) ? g.lastHitBy : (alive[0] || Object.values(room.players)[0])?.id;
                if (winner) this.roomManager.declareWinner(roomId, winner).catch(err => console.error('declareWinner xatosi:', err));
                g.timer = 1e9;   // g'olib bir marta e'lon qilinadi
            }
            return;
        }
        if (g.state === 'wake') {
            if (--g.timer <= 0) {
                g.state = 'fight';
                g.nextWhip = g.tick + T(1600);
                g.nextRoot = g.tick + T(3000);
                g.nextThorn = g.tick + T(4200);
                g.nextBite = g.tick;
                g.nextSprout = g.tick + T(1500);
            }
            return;
        }

        // ---- JANG ----
        const surf = new Map<string, number | null>();
        alive.forEach(p => surf.set(p.id, this.gfSurfaceOf(map, p)));
        const topPlayers = alive.filter(p => d.topPlats.includes(surf.get(p.id) as number));
        const slow = topPlayers.length > 0 ? 1.6 : 1;   // tepada kimdir bo'lsa - boshqalarga hujum siyraklashadi
        const stemTopY = d.headY + 20;

        // BOSH: tishlamayotganda - eng yaqin qahramon tomonga o'tib turadi
        if (!g.bite) {
            const focus = alive.slice().sort((a, b) => Math.abs(a.x - d.stemX) - Math.abs(b.x - d.stemX))[0];
            if (focus) g.side = focus.x < d.stemX ? -1 : 1;
            const rx = d.stemX + g.side * 75, ry = d.headY;
            const dx = rx - g.hx, dy = ry - g.hy, dist = Math.hypot(dx, dy);
            const step = 3;   // bosh sekin o'tadi (o'yinchi ko'zlab ulgursin)
            if (dist <= step) { g.hx = rx; g.hy = ry; } else { g.hx += dx / dist * step; g.hy += dy / dist * step; }
        }

        // 1) TISHLASH: eng tepa platformada kimdir bor - bosh o'ziga eng yaqin qahramonga otiladi
        if (!g.bite && topPlayers.length && g.tick >= g.nextBite) {
            const reachable = alive.filter(p => Math.hypot(p.x - d.stemX, p.y - stemTopY) <= d.biteReach + 40);
            const target = reachable.sort((a, b) => Math.hypot(a.x - g.hx, a.y - g.hy) - Math.hypot(b.x - g.hx, b.y - g.hy))[0];
            if (target) {
                g.side = target.x < d.stemX ? -1 : 1;
                let tx = target.x - g.side * 20, ty = target.y - 6;
                const ddx = tx - d.stemX, ddy = ty - stemTopY, dd = Math.hypot(ddx, ddy);
                if (dd > d.biteReach) { tx = d.stemX + ddx / dd * d.biteReach; ty = stemTopY + ddy / dd * d.biteReach; }
                g.bite = { phase: 'wind', t: T(d.biteWindMs), tx, ty, fromX: g.hx, fromY: g.hy };
            }
        }
        if (g.bite) {
            const b = g.bite;
            b.t--;
            if (b.phase === 'wind') {
                // Orqaga tortilib, og'zini ochadi
                g.hx += (d.stemX - g.hx) * 0.04; g.hy -= 0.8;
                if (b.t <= 0) { b.phase = 'lunge'; b.t = T(260); b.fromX = g.hx; b.fromY = g.hy; }
            } else if (b.phase === 'lunge') {
                const k = 1 - b.t / T(260);
                g.hx = b.fromX + (b.tx - b.fromX) * k; g.hy = b.fromY + (b.ty - b.fromY) * k;
                if (b.t <= 0) {
                    g.hx = b.tx; g.hy = b.ty;
                    alive.forEach(p => {
                        if (Math.hypot(p.x - g.hx, p.y - g.hy) > d.biteRange) return;
                        this.hurtPlayer(p, d.biteDamage);
                        this.knockback(p, (p.x < d.stemX ? -1 : 1) * 260, -320);
                    });
                    this.io.to(roomId).emit('gflowerBite', { x: Math.round(g.hx), y: Math.round(g.hy) });
                    b.phase = 'back'; b.t = T(560);
                }
            } else if (b.t <= 0) {
                g.bite = null;
                g.nextBite = g.tick + T(d.biteEveryMs);
            }
        }

        // 2) NOVDA: qahramon turgan platformaga poyadan novda chiqib, urib uloqtiradi
        if (!g.whip && g.tick >= g.nextWhip) {
            const cands = alive.filter(p => surf.get(p.id) !== null && !(g.bite && topPlayers.includes(p)));
            const p = cands[Math.floor(Math.random() * cands.length)];
            if (p) {
                const plat = surf.get(p.id) as number;
                let x0: number, x1: number, y: number;
                if (plat >= 0) {
                    const pl = map.platforms[plat];
                    const side = pl.x + pl.w / 2 < d.stemX ? -1 : 1;
                    x0 = d.stemX + side * 16; x1 = side < 0 ? pl.x - 6 : pl.x + pl.w + 6; y = pl.y - 22;
                } else {
                    const side = p.x < d.stemX ? -1 : 1;
                    x0 = d.stemX + side * 18; x1 = d.stemX + side * 360; y = 570 - 22;
                }
                g.whip = { plat, phase: 'grow', t: T(d.whipGrowMs), x0, x1, y, hit: [] };
            } else {
                g.nextWhip = g.tick + T(500);
            }
        }
        if (g.whip) {
            const w = g.whip;
            w.t--;
            if (w.phase === 'grow') {
                if (w.t <= 0) { w.phase = 'lash'; w.t = T(380); }
            } else {
                // Novda chiziq bo'ylab o'tadi: shu sirtda, shu oraliqda turgan har kimga bir marta tegadi
                const lo = Math.min(w.x0, w.x1), hi = Math.max(w.x0, w.x1);
                alive.forEach(p => {
                    if (w.hit.includes(p.id) || p.x < lo - 10 || p.x > hi + 10) return;
                    if (Math.abs(p.y - (w.y - 2)) > 30) return;
                    w.hit.push(p.id);
                    this.hurtPlayer(p, d.whipDamage);
                    this.knockback(p, (w.x1 > w.x0 ? 1 : -1) * 430, -330);
                });
                if (w.t <= 0) { g.whip = null; g.nextWhip = g.tick + Math.round(T(d.whipEveryMs) * slow); }
            }
        }

        // 3) TIKANLAR: ba'zan - joyida turmagan (yugurayotgan/sakrayotgan) qahramonga 6 ta tikan sochadi
        if (g.tick >= g.nextThorn) {
            const moving = alive.filter(p => {
                const m = this.playerMotion.get(p.id);
                return m && (Math.abs(m.vx) > 40 || Math.abs(m.vy) > 60);
            });
            const p = moving[Math.floor(Math.random() * moving.length)];
            if (p && !g.bite) {
                const base = Math.atan2(p.y - g.hy, p.x - g.hx);
                [-25, -15, -5, 5, 15, 25].forEach(a => {
                    const ang = base + a * Math.PI / 180;
                    thorns.push({ id: nextId('t'), x: g.hx, y: g.hy, vx: Math.cos(ang) * d.thornSpeed, vy: Math.sin(ang) * d.thornSpeed });
                });
                this.io.to(roomId).emit('gflowerThorns');
                g.nextThorn = g.tick + Math.round(T(d.thornEveryMs) * slow);
            } else {
                g.nextThorn = g.tick + T(400);
            }
        }
        for (let i = thorns.length - 1; i >= 0; i--) {
            const th = thorns[i];
            th.x += th.vx * this.TICK_SECONDS; th.y += th.vy * this.TICK_SECONDS;
            // Tikan kichkina - faqat tanaga aniq tekkanda (tarmoq kechikishi uchun o'yinchi foydasiga zaxira)
            const victim = alive.find(p => Math.abs(p.x - th.x) <= this.PLAYER_HALF_W - 2 && Math.abs(p.y - th.y) <= this.PLAYER_HALF_H - 2);
            const blocked = th.y >= 570 || th.x < d.arenaX + 20 || th.x > d.arenaX + d.arenaW - 20 || th.y < 0 ||
                map.platforms.some(pl => th.x >= pl.x && th.x <= pl.x + pl.w && th.y >= pl.y && th.y <= pl.y + pl.h + 4);
            if (victim) this.hurtPlayer(victim, d.thornDamage);
            if (victim || blocked) thorns.splice(i, 1);
        }

        // 4) TOMIR: istalgan joydan (qahramon ostidan) yerdan chiqib sanchiladi
        if (g.tick >= g.nextRoot) {
            const pool = alive.slice().sort(() => Math.random() - 0.5);
            const n = Math.min(pool.length, g.hp < g.maxHp / 2 ? 2 : 1);
            for (let k = 0; k < n; k++) {
                const p = pool[k];
                const y = this.gfSurfaceYUnder(map, p.x, p.y + this.PLAYER_HALF_H);
                roots.push({ id: nextId('r'), x: Math.round(p.x), y, phase: 'warn', t: T(d.rootWarnMs), hit: [] });
            }
            g.nextRoot = g.tick + Math.round(T(d.rootEveryMs) * slow);
        }
        for (let i = roots.length - 1; i >= 0; i--) {
            const r = roots[i];
            r.t--;
            if (r.phase === 'warn') {
                if (r.t <= 0) { r.phase = 'up'; r.t = T(d.rootUpMs); }
                continue;
            }
            alive.forEach(p => {
                const feet = p.y + this.PLAYER_HALF_H;
                if (r.hit.includes(p.id) || Math.abs(p.x - r.x) > 20 || feet < r.y - 100 || feet > r.y + 6) return;
                // Tomir bilan qahramon orasida platforma bo'lsa - tomir unga yetmaydi (platforma ustida turgan tegmaydi)
                if (map.platforms.some(pl => r.x >= pl.x && r.x <= pl.x + pl.w && pl.y < r.y - 4 && pl.y >= feet - 4)) return;
                r.hit.push(p.id);
                this.hurtPlayer(p, d.rootDamage);
                this.knockback(p, 0, -380);
            });
            if (r.t <= 0) roots.splice(i, 1);
        }

        // 5) KICHKINA GULLAR: qahramon yerda bo'lsa - yerdan sug'urilib chiqib, uni quvlaydi
        const sprouts = room.bots.filter(b => b.skin === 'sprout').length;
        const onGround = alive.filter(p => surf.get(p.id) === -1);
        if (onGround.length && sprouts < Math.min(d.sproutMax, alive.length + 1) && g.tick >= g.nextSprout) {
            let x = 0;
            for (let tries = 0; tries < 12; tries++) {
                x = d.arenaX + 70 + Math.random() * (d.arenaW - 140);
                if (Math.abs(x - d.stemX) > 50 && onGround.every(p => Math.abs(p.x - x) > 110)) break;
            }
            const bot = GameEngine.createBots(room.id, [{ x, y: this.GROUND_Y }], 'dog', d.sproutHp)[0];
            bot.id += '_s' + g.tick;
            bot.skin = 'sprout';
            bot.emerge = T(900);
            room.bots.push(bot);
            g.nextSprout = g.tick + T(d.sproutEveryMs);
        }
    }
    private giantFlowerDefeated(room: RoomState, g: NonNullable<RoomState['gflower']>): void {
        if (g.state === 'dying') return;
        g.state = 'dying';
        g.timer = Math.round(2600 / 30);
        g.bite = null;
        g.whip = null;
        room.gfThorns = [];
        room.gfRoots = [];
        room.bots = room.bots.filter(b => b.skin !== 'sprout');   // kichkina gullar ham so'liydi
        this.io.to(room.id).emit('gflowerDown');
    }

    // Har 5 ta o'ldirishda: tasodifiy boss (oldingisi takrorlanmaydi); har yengilgan boss - keyingisi kuchliroq
    private startArenaBoss(room: RoomState): void {
        const map = getMapById(room.selectedLevel);
        const A = room.arena!;
        const options = (['gorilla', 'fatelf', 'squad', 'snake'] as const).filter(b => b !== A.lastBoss && (b !== 'snake' || !!map.arena?.snake));
        const boss = options[Math.floor(Math.random() * options.length)];
        const players = Math.max(1, Object.keys(room.players).length);
        const power = 1 + 0.25 * A.bossesBeaten;
        A.boss = boss;
        A.sinceBoss = 0;
        if (boss === 'gorilla' && map.gorilla) {
            const gd = map.gorilla;
            const hp = Math.round(gd.baseHp * 0.6 * players * power);
            room.gorilla = { hp, maxHp: hp, x: gd.startX, facingLeft: true, state: 'idle', timer: Math.round(1200 / 30), attack: null, crushPlat: -1, hitFlash: 0, lastHitBy: null };
            room.gPlats = gd.platforms.map((pl, i) => ({ id: 'gp_' + i, x: pl.x, y: pl.y, w: pl.w, state: 'idle' as const, timer: 0, riders: [] as string[] }));
            room.gSpikes = []; room.gRocks = [];
        } else if (boss === 'fatelf' && map.fatElf) {
            const fd = map.fatElf;
            const hp = Math.round(fd.baseHp * players * power);
            const alive = Object.values(room.players).filter(p => !p.isDead);
            const avgX = alive.length ? alive.reduce((a, p) => a + p.x, 0) / alive.length : 200;
            room.fatElf = { hp, maxHp: hp, x: avgX < 400 ? 620 : 180, facingLeft: true, state: 'idle', timer: Math.round(1500 / 30),
                targetId: null, hitFlash: 0, lastHitBy: null, grace: Math.round(1200 / 30) };
            room.acid = [];
        } else if (boss === 'snake' && map.arena?.snake) {
            // ROBOT ILON: boshi chap eshikdan chiqib keladi. Yo'lidagi qahramonlar o'ngga suriladi
            const sd = map.arena.snake;
            const hp = Math.round((sd.baseHp + sd.hpPerExtraPlayer * Math.max(0, players - 1)) * power);
            room.snake = { x: -120, speed: sd.advanceSpeed };
            room.boss = { hp, maxHp: hp, nextMineTick: 0, stallsSmashed: 0, fire: 'idle', fireTicks: 0, nextFireTick: 0, wallBroken: false,
                dead: false, deathTicks: 0, hitFlash: 0, lastHitBy: null };
            room.mines = [];
            room.flyingMines = [];
            room.levelTicks = room.levelTicks || 0;
            let slot = 0;
            Object.values(room.players).forEach(p => {
                if (p.isDead || p.x > sd.startX + 90) return;
                p.x = sd.startX + 120 + (slot++) * 40;
                p.snakeHitCd = 30;
            });
        } else {
            // ROBOT OTRYADI: bir nechta kuchli (4x jonli) robot bir vaqtda tushadi
            const count = 1 + players;
            const spawns = Array.from({ length: count }, (_, i) => ({ x: 200 + i * (480 / Math.max(1, count - 1)), y: 90 }));
            const elites = GameEngine.createBots(room.id, spawns, 'robot', Math.round(GameEngine.BOT_MAX_HP * 4 * power));
            elites.forEach((b, i) => { b.elite = true; b.id += '_e' + A.tick + '_' + i; });
            room.bots.push(...elites);
            A.boss = 'squad';
        }
        this.io.to(room.id).emit('arenaBoss', { boss: A.boss });
    }

    // Boss yengildi: tirik qahramonlarga +100 tanga, +50 XP; oddiy botlar yana chiqa boshlaydi
    private arenaBossBeaten(room: RoomState): void {
        const ar = getMapById(room.selectedLevel).arena;
        const A = room.arena;
        if (!ar || !A || !A.boss) return;
        const boss = A.boss;
        A.lastBoss = boss;
        A.boss = null;
        A.bossesBeaten++;
        A.sinceBoss = 0;
        A.nextSpawnTick = A.tick + Math.round(2500 / 30);
        room.gorilla = null;
        room.fatElf = null;
        room.acid = [];
        room.boss = null;
        room.snake = null;
        room.mines = [];
        room.flyingMines = [];
        room.gSpikes = []; room.gRocks = [];
        // Gorilla platformalari joyiga qaytadi (gorilla yo'q paytda ularni hech kim qaytarmaydi)
        const gd = getMapById(room.selectedLevel).gorilla;
        (room.gPlats || []).forEach((pl, i) => { pl.state = 'idle'; pl.timer = 0; pl.riders = []; if (gd) pl.y = gd.platforms[i].y; });
        // Boss - jamoaviy g'alaba: xonadagi HAMMAGA (o'sha payt o'lik/arvoh bo'lganlarga ham) tanga va XP
        Object.values(room.players).forEach(p => {
            this.roomManager.awardReward(room.id, p.id, ar.bossCoins, ar.bossXp, true).catch(err => console.error('awardReward xatosi:', err));
        });
        this.io.to(room.id).emit('arenaBossDown', { boss, coins: ar.bossCoins, xp: ar.bossXp });
    }

    public markIntroDone(room: RoomState, playerId: string): void {
        const p = room.players[playerId];
        if (p) p.introDone = true;
    }

    // ESHIKNI OCHISH (E): faqat kalitli (12 ta olma tutgan) qahramon, eshik oldida
    public useBigDoor(room: RoomState, playerId: string): void {
        const cfg = getMapById(room.selectedLevel).apples;
        const p = room.players[playerId];
        if (!cfg || !p || p.isDead || (p.apples || 0) < cfg.applesToCollect) return;
        if (this.atBigDoor(cfg, p)) room.doorOpen = true;
    }

    // TANGANI OLISH (E tugmasi): tirik qahramon tangaga yetarlicha yaqin bo'lsagina
    public handlePickupCoin(room: RoomState, playerId: string, coinId: string): void {
        const p = room.players[playerId];
        const idx = room.coins.findIndex(c => c.id === coinId);
        if (!p || p.isDead || idx < 0) return;
        const coin = room.coins[idx];
        if (Math.hypot(p.x - coin.x, p.y - coin.y) > this.COIN_PICKUP_RANGE) return;
        room.coins.splice(idx, 1);
        this.roomManager.awardCrateCoins(room.id, playerId, CRATE_COINS).catch(err => {
            console.error('awardCrateCoins xatosi:', err);
        });
    }

    // BAHAYBAT ILON: orqadan bir tekis (asta tezlashib) sudraladi. Boshiga
    // yetib olgan (orqada qolgan) qahramonni yutadi. Chekpointga yetganlar
    // qutulgan - ularga tegmaydi. Tirik qahramonlarning HAMMASI chekpointga
    // yetsa - xarita o'tildi
    private updateSnake(room: RoomState, roomId: string): void {
        const map = getMapById(room.selectedLevel);
        const chase = map.chase;
        if (!chase || !room.snake || room.isOver) return;

        const progress = Math.max(0, Math.min(1, room.snake.x / chase.snakeStopX));
        room.snake.speed = chase.snakeStartSpeed + (chase.snakeEndSpeed - chase.snakeStartSpeed) * progress;
        // Oxirgi jarlik oldida to'xtaydi - maydonchadagilarni ta'qib qilmaydi
        room.snake.x = Math.min(chase.snakeStopX, room.snake.x + room.snake.speed * this.TICK_SECONDS);

        const pad = chase.pad;
        Object.values(room.players).forEach(p => {
            if (p.isDead) return;
            const reached = room.checkpointReached.includes(p.id);

            // CHEKPOINT: faqat ko'k maydonchaning USTIDA turgan (unga aniq tushgan) qutuladi
            const feetY = p.y + this.PLAYER_HALF_H;
            if (!reached && p.x >= pad.x && p.x <= pad.x + pad.w && Math.abs(feetY - pad.y) < 6) {
                room.checkpointReached.push(p.id);
                return;
            }
            // JARLIK: yer sathidan pastga tushib ketgan qahramon halok bo'ladi
            if (p.y > this.PIT_DEATH_Y) {
                this.killPlayer(p);
                return;
            }
            // ILON: boshiga yetib olgan (orqada qolgan) qahramonni yutadi
            if (!reached && p.x - this.PLAYER_HALF_W < room.snake!.x) {
                this.killPlayer(p);
            }
        });

        this.processMines(room);

        const alive = Object.values(room.players).filter(p => !p.isDead);
        if (alive.length > 0 && alive.every(p => room.checkpointReached.includes(p.id))) {
            // G'olib - birinchi yetib kelgan (xonadan chiqib ketmagan, tirik) qahramon
            const winnerId = room.checkpointReached.find(id => room.players[id] && !room.players[id].isDead) || alive[0].id;
            this.roomManager.declareWinner(roomId, winnerId).catch(err => {
                console.error('declareWinner xatosi:', err);
            });
        }
    }

    // MINALAR: ustiga bosgan qahramon jonining 40% ini yo'qotadi, mina portlaydi
    // (klient uni ro'yxatdan yo'qolganini ko'rib, portlash + ekran silkinishini chizadi)
    private processMines(room: RoomState): void {
        for (let i = room.mines.length - 1; i >= 0; i--) {
            const m = room.mines[i];
            const mineRect = { x: m.x - 11, y: m.y - 6, w: 22, h: 12 };
            const victims = Object.values(room.players).filter(p => !p.isDead && this.checkOverlap(mineRect, {
                x: p.x - this.PLAYER_HALF_W, y: p.y - this.PLAYER_HALF_H, w: this.PLAYER_HALF_W * 2, h: this.PLAYER_HALF_H * 2
            }));
            if (victims.length === 0) continue;
            room.mines.splice(i, 1);
            victims.forEach(p => {
                p.hp -= MINE_DAMAGE;
                if (p.hp <= 0) this.killPlayer(p);
            });
            if (m.wallId) room.walls = room.walls.filter(w => w.id !== m.wallId);
        }
    }

    // ROBOT-ILON JANGI (boss) - quvish uslubida:
    //  - devor ortidan chiqib, uni buzadi va TO'XTAMAY oldinga (qahramonlar izidan) yuradi
    //  - yo'lidagi rastalarni ezadi (o'ziga ozgina zarar), oldinga mina otadi
    //    (o'z minasini bosib o'tsa - portlab, unga zarar)
    //  - har fireIntervalMs da: ogohlantirish (og'zi cho'g'lanadi), keyin oldinga OLOV
    //    purkaydi - yerdagi va rasta tomidagilarni kuydiradi, faqat TAXTAdagilar omon
    //  - boshiga tegib ketgan qahramonga zarar; boshining ORQASIDA (tanasi ostida) yerda
    //    qolib ketgan qahramonni yutadi. Taxtada (baland) turganlarga tegmaydi
    //  - joni tugasa: portlash animatsiyasi uchun biroz kutib, xarita o'tiladi
    private updateBoss(room: RoomState, roomId: string): void {
        const map = getMapById(room.selectedLevel);
        const inArena = !!room.arena && !!map.arena?.snake;
        const def = map.boss || (inArena ? map.arena!.snake : undefined);
        const boss = room.boss;
        if (!def || !boss || !room.snake || room.isOver) return;
        room.levelTicks = (room.levelTicks || 0) + 1;
        if (boss.hitFlash > 0) boss.hitFlash--;

        if (boss.dead) {
            boss.deathTicks--;
            if (boss.deathTicks <= 0 && inArena) { this.arenaBossBeaten(room); return; }
            if (boss.deathTicks <= 0) {
                const alive = Object.values(room.players).filter(p => !p.isDead);
                const winner = (boss.lastHitBy && room.players[boss.lastHitBy]) ? boss.lastHitBy : (alive[0] || Object.values(room.players)[0])?.id;
                if (winner) this.roomManager.declareWinner(roomId, winner).catch(err => console.error('declareWinner xatosi:', err));
            }
            return;
        }

        // Harakat: faqat oldinga, to'xtamay (xarita oxirida to'xtaydi)
        const snake = room.snake;
        snake.speed = def.advanceSpeed;
        snake.x = Math.min(inArena ? def.startX : map.mapWidth - 300, snake.x + snake.speed * this.TICK_SECONDS);
        if (!boss.wallBroken && snake.x >= 0) {
            boss.wallBroken = true;
            boss.nextFireTick = room.levelTicks + Math.round(def.fireIntervalMs / 30);
            boss.nextMineTick = room.levelTicks + 60;
        }

        // Rastalarni ezadi (x bo'yicha tartibda - sanog'i yetarli)
        const stalls = map.market?.stalls || [];
        while (boss.stallsSmashed < stalls.length && snake.x >= stalls[boss.stallsSmashed].x - 60) {
            const st = stalls[boss.stallsSmashed];
            boss.stallsSmashed++;
            this.damageBoss(boss, def.stallCrashDamage, null);
            // Tomidagi minalar rasta bilan birga portlaydi
            for (let i = room.mines.length - 1; i >= 0; i--) {
                const m = room.mines[i];
                if (m.y < STALL_ROOF_Y && m.y > STALL_ROOF_Y - 20 && Math.abs(m.x - st.x) <= STALL_ROOF_HALF_W) {
                    room.mines.splice(i, 1);
                    this.damageBoss(boss, def.ownMineDamage, null);
                }
            }
        }

        // O'z minasini bosib o'tsa - portlaydi va o'ziga zarar
        for (let i = room.mines.length - 1; i >= 0; i--) {
            if (room.mines[i].x <= snake.x) {
                room.mines.splice(i, 1);
                this.damageBoss(boss, def.ownMineDamage, null);
            }
        }

        // Oldinga mina otish - qahramonga MO'LJALLAB: u turgan sirtga (yer, rasta tomi
        // yoki taxta) va yugurayotgan bo'lsa - oldiroqqa. Joni yarmidan kam - ikkitadan
        const flying = room.flyingMines || (room.flyingMines = []);
        if (boss.wallBroken && room.levelTicks >= boss.nextMineTick) {
            const targets = Object.values(room.players)
                .filter(p => !p.isDead && p.x > snake.x + 80 && p.x < snake.x + 1100)
                .sort(() => Math.random() - 0.5);
            const count = inArena ? Math.max(targets.length, boss.hp < boss.maxHp / 2 ? 2 : 1) : (boss.hp < boss.maxHp / 2 ? 2 : 1);
            // Arenada maydonda yotgan eski minalar ko'payib ketmasin - eng eskisi o'chadi
            if (inArena) while (room.mines.length > 4) room.mines.shift();
            for (let k = 0; k < count && room.mines.length + flying.length < this.BOSS_MAX_MINES; k++) {
                const x0 = snake.x - 40, y0 = 440, g = 800;
                let tx: number, ty: number, T: number;
                const p = targets.length ? targets[k % targets.length] : null;
                if (p && inArena) {
                    // ANIQ MO'LJAL: qahramon hozir qayerga yugurayotganini hisoblab, u yetib boradigan joyga
                    // tez (0.55-0.9 s) tushadi; sakrab turgan bo'lsa - qo'nadigan sirtiga (yer yoki platforma)
                    const vx = this.playerMotion.get(p.id)?.vx || 0;
                    T = Math.max(0.55, Math.min(0.9, (p.x - x0) / 700));
                    tx = p.x + Math.max(-220, Math.min(220, vx * T)) + (k >= targets.length ? (Math.random() - 0.5) * 120 : 0);
                    tx = Math.max(snake.x + 70, Math.min(map.mapWidth - 20, tx));
                    ty = this.bossSurfaceUnder(map, tx, p.y + this.PLAYER_HALF_H, room) - 6;
                } else if (p) {
                    T = Math.max(0.7, Math.min(1.2, (p.x - x0) / 550));
                    // Oldinga yugurayotgan bo'lsa - qayerga yetib borishini taxminlaymiz (+ ikkinchi mina biroz tarqoq)
                    const lead = Math.max(-150, Math.min(260, (this.playerMotion.get(p.id)?.vx || 0) * T * 0.8));
                    tx = p.x + lead + (k > 0 ? (Math.random() - 0.5) * 160 : 0);
                    tx = Math.max(snake.x + 120, Math.min(map.mapWidth - 40, tx));
                    ty = this.bossSurfaceUnder(map, tx, p.y + this.PLAYER_HALF_H) - 6;
                } else {
                    T = 1.1;
                    tx = Math.min(map.mapWidth - 40, snake.x + 220 + Math.random() * 380);
                    ty = 564;
                }
                flying.push({
                    id: 'fmine_' + room.levelTicks + '_' + k,
                    x: x0, y: y0,
                    vx: (tx - x0) / T,
                    vy: (ty - y0 - 0.5 * g * T * T) / T,
                    ty
                });
            }
            boss.nextMineTick = room.levelTicks + Math.round(def.mineIntervalMs / 30);
        }
        for (let i = flying.length - 1; i >= 0; i--) {
            const f = flying[i];
            f.vy += 800 * this.TICK_SECONDS;
            f.x += f.vx * this.TICK_SECONDS;
            f.y += f.vy * this.TICK_SECONDS;
            // Havoda qahramonga urilsa - o'sha zahoti portlaydi
            const hit = Object.values(room.players).filter(p => !p.isDead && this.checkOverlap(
                { x: f.x - 12, y: f.y - 7, w: 24, h: 14 },
                { x: p.x - this.PLAYER_HALF_W, y: p.y - this.PLAYER_HALF_H, w: this.PLAYER_HALF_W * 2, h: this.PLAYER_HALF_H * 2 }));
            if (hit.length > 0) {
                flying.splice(i, 1);
                hit.forEach(p => {
                    p.hp -= MINE_DAMAGE;
                    if (p.hp <= 0) this.killPlayer(p);
                });
                continue;
            }
            // Pastga tushayotib nishon sirtiga yetdi - shu yerda (tom/taxta ustida ham) yotib qoladi
            if (f.vy > 0 && f.y >= f.ty) {
                flying.splice(i, 1);
                room.mines.push({ id: f.id, x: f.x, y: f.ty, wallId: null });
            }
        }

        // OLOV: idle -> (vaqti kelsa) charge -> fire -> idle
        if (boss.wallBroken) {
            if (boss.fire === 'idle' && room.levelTicks >= boss.nextFireTick) {
                boss.fire = 'charge';
                boss.fireTicks = Math.round(def.fireChargeMs / 30);
            } else if (boss.fire !== 'idle') {
                boss.fireTicks--;
                if (boss.fireTicks <= 0) {
                    if (boss.fire === 'charge') {
                        boss.fire = 'fire';
                        boss.fireTicks = Math.round(def.fireDurationMs / 30);
                    } else {
                        boss.fire = 'idle';
                        boss.nextFireTick = room.levelTicks + Math.round(def.fireIntervalMs / 30);
                    }
                }
            }
        }

        Object.values(room.players).forEach(p => {
            if (p.isDead) return;
            const low = p.y > def.fireSafeY; // yerda yoki rasta tomida (taxtada emas)
            // Olov zonasi: faqat qahramon tanasi ekrandagi alangaga haqiqatan TEGSA
            if (boss.fire === 'fire' && this.touchesBossFire(p, snake.x, def.fireRange)) {
                p.hp -= def.fireDps * this.TICK_SECONDS;
                if (p.hp <= 0) { this.killPlayer(p); return; }
            }
            // Boshining orqasida (tanasi ostida) qolib ketdi - yutildi
            if (low && p.x + this.PLAYER_HALF_W < snake.x - 30) {
                this.killPlayer(p);
                return;
            }
            // Boshiga tegib ketdi
            if ((p.snakeHitCd || 0) > 0) { p.snakeHitCd!--; return; }
            if (low && p.x - this.PLAYER_HALF_W < snake.x - 12) { // 12px - kechikish zaxirasi (klient qahramonni bosh oldida ushlab turadi)
                p.hp -= def.contactDamage;
                p.snakeHitCd = 33;
                if (p.hp <= 0) this.killPlayer(p);
            }
        });

        this.processMines(room);
    }

    // Boss xaritasida (x, feetY) nuqtadan PASTDAGI eng yaqin sirt tepasi: taxta, butun rasta tomi yoki yer
    private bossSurfaceUnder(map: MapDef, x: number, feetY: number, room?: RoomState): number {
        let best = 570;
        const consider = (top: number) => { if (top >= feetY - 20 && top < best) best = top; };
        if (room && room.arena) (room.gPlats || []).forEach(g => { if (g.state === 'idle' && x >= g.x && x <= g.x + g.w) consider(g.y); });
        (map.platforms || []).forEach(pl => { if (pl.h <= 12 && x >= pl.x && x <= pl.x + pl.w) consider(pl.y); });
        const stalls = map.market?.stalls || [];
        stalls.forEach(st => { if (Math.abs(x - st.x) <= STALL_ROOF_HALF_W) consider(STALL_ROOF_Y); });
        return best;
    }

    // Alanga shakli klientdagi drawBossFire bilan bir xil: boshidan uzoqlashgan sari pasayadi
    // (yer sathi 568, eng baland qirrasi 392). Klient chizganda tepasiga tasodifiy 0-30px
    // qo'shadi - server faqat asosiy balandlikni oladi, ya'ni tegmasdan kuyish bo'lmaydi.
    // Oxirgi 12px va 6px qalinlik - tarmoq kechikishi uchun o'yinchi foydasiga zaxira
    private touchesBossFire(p: PlayerState, headX: number, range: number): boolean {
        const left = p.x - this.PLAYER_HALF_W, right = p.x + this.PLAYER_HALF_W;
        if (right <= headX || left >= headX + range - 12) return false;
        const d = Math.max(0, Math.min(range, left - headX));
        const H = 568 - Math.max(568 - (110 + 70 * (1 - d / range)), 392);
        const taper = d > range - 60 ? Math.max(0, (range - d) / 60) : 1; // uchi torayadi
        const flameTop = 568 - H * taper;
        return p.y + this.PLAYER_HALF_H > flameTop + 6;
    }

    private damageBoss(boss: NonNullable<RoomState['boss']>, dmg: number, by: string | null): void {
        if (boss.dead) return;
        boss.hp = Math.max(0, boss.hp - dmg);
        boss.hitFlash = 4;
        if (by) boss.lastHitBy = by;
        if (boss.hp <= 0) {
            boss.dead = true;
            boss.deathTicks = this.BOSS_DEATH_TICKS;
        }
    }

    // O'YINCHI HALOK BO'LDI: butun raund davomida arvoh holatiga o'tadi
    private killPlayer(p: PlayerState): void {
        p.hp = 0;
        p.isDead = true;
        p.respawnTimer = 0;
        p.isInvisible = false;
        p.speedMultiplier = 1;
        p.isHoldingAbility = false;
        p.isHoldingAttack = false;
    }

    // Botlarni yaratishning YAGONA joyi (o'yin boshlanganda ham, qayta
    // tug'ilganda ham) - yangi maydon qo'shilsa ikki joyda unutilmasligi uchun
    public static createBots(roomId: string, spawns: { x: number, y: number }[], kind: 'robot' | 'dog' = 'robot', hp: number = GameEngine.BOT_MAX_HP): BotState[] {
        return spawns.map((spawn, i) => ({
            id: roomId + '_bot_' + (i + 1) + '_' + Date.now(),
            kind,
            x: spawn.x,
            y: spawn.y,
            color: 0x0f4c4c,
            hp,
            maxHp: hp,
            freezeDuration: 0,
            targetPlayerId: null,
            isBlocking: false,
            blockTimer: 0,
            isAttacking: false,
            attackAnimTimer: 0,
            facingLeft: false,
            vy: 0,
            attackCooldown: 0,
            windupTimer: 0,
            jumpTargetX: null,
            jumpReacted: false,
            isJetting: false,
            jetGoalY: null,
            jetTimer: 0
        }));
    }

    private checkOverlap(rect1: any, rect2: any): boolean {
        return rect1.x < rect2.x + rect2.w &&
               rect1.x + rect1.w > rect2.x &&
               rect1.y < rect2.y + rect2.h &&
               rect1.y + rect1.h > rect2.y;
    }
}