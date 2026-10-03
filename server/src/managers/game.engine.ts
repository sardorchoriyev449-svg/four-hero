import { Server } from 'socket.io';
import { RoomState, PlayerState, BotState } from '../types'
import { BaseCharacter } from '../characters/base.character';
import { getCharacterLogic } from '../characters';
import { RoomManager } from './room.manager';
import { bonusDamageOf, shotgunMagOf, weaponUpgradeLevel, regenPerSecondOf, BASE_HP, SHOTGUN_DMG_PER_LEVEL, KUNAI_DMG_PER_LEVEL } from '../perks';
import { getMapById, generateBotSpawns, MapDef, CRATE_SIZE, CRATE_HP, CRATE_COINS, MINE_DAMAGE, STALL_ROOF_Y, STALL_ROOF_HALF_W, RED_BOX_SIZE } from '../maps';

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

    private update(): void {
        const seenPlayers = new Set<string>();
        Object.keys(this.activeRooms).forEach(roomId => {
            const room = this.activeRooms[roomId];
            if (!room.isStarted) return;
            // Yolg'iz o'yinchi pauza qilgan - o'yin to'xtab turadi
            if (room.paused) return;
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
                        Object.values(room.players).forEach(ally => {
                            if (!ally.isDead) ally.hp = Math.min(ally.maxHp || BASE_HP, ally.hp + 0.6);
                        });
                    }
                }
                // JON TIKLANISHI ("regen" kuchaytirishi): tirik qahramon asta-sekin o'zi davolanadi
                const regen = regenPerSecondOf(player);
                if (regen > 0 && player.hp < (player.maxHp || BASE_HP)) {
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

            // 4b. MAG'LUBIYAT SHARTI: agar xonadagi BARCHA o'yinchilar arvoh
            // (o'lik) bo'lib qolsa, o'yin "O'YIN TUGADI" bilan yakunlanadi
            if (!room.isOver) {
                const allPlayers = Object.values(room.players);
                const allDead = allPlayers.length > 0 && allPlayers.every(p => p.isDead);
                if (allDead) {
                    this.roomManager.declareGameOverLoss(roomId).catch(err => {
                        console.error('declareGameOverLoss xatosi:', err);
                    });
                }
            }

            // 5. HOLATNI LOBBIGA BROADCAST QILISh
            const players: { [id: string]: object } = {};
            Object.values(room.players).forEach(p => {
                players[p.id] = {
                    x: p.x, y: p.y, hp: p.hp, maxHp: p.maxHp || BASE_HP, stamina: p.stamina, kills: p.kills, isDead: p.isDead,
                    respawnTimer: p.respawnTimer, speedMultiplier: p.speedMultiplier, isInvisible: p.isInvisible,
                    isHoldingAbility: p.isHoldingAbility, characterType: p.characterType, color: p.color,
                    weaponColor: p.weaponColor, look: p.look || '', nickname: p.nickname, apples: p.apples,
                    level: p.level || 0, maxStamina: p.maxStamina || 100, weaponMode: p.weaponMode || 'main',
                    special: (p.specialTicks || 0) > 0, specialCd: Math.ceil((p.specialCooldown || 0) * this.TICK_SECONDS),
                    ammo: p.ammo ?? 0, maxAmmo: shotgunMagOf(p), reloading: (p.reloadTicks || 0) > 0,
                    acid: (p.acidTicks || 0) > 0
                };
            });
            this.io.to(roomId).emit('gameStateUpdate', {
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
                gorilla: room.gorilla || null,
                fatElf: room.fatElf || null,
                acid: room.acid || [],
                flowers: room.flowers || [],
                gflower: room.gflower ? { state: room.gflower.state, hp: room.gflower.hp, maxHp: room.gflower.maxHp, hx: Math.round(room.gflower.hx), hy: Math.round(room.gflower.hy),
                    side: room.gflower.side, hitFlash: room.gflower.hitFlash, bite: room.gflower.bite ? room.gflower.bite.phase : null,
                    whip: room.gflower.whip ? { plat: room.gflower.whip.plat, phase: room.gflower.whip.phase, x0: room.gflower.whip.x0, x1: room.gflower.whip.x1, y: room.gflower.whip.y } : null } : null,
                doors: room.doors ? {
                    state: room.doors.state, choice: room.doors.choice, segment: room.doors.segment, sub: room.doors.sub,
                    wave: room.doors.wave ? { safe: room.doors.wave.safe, phase: room.doors.wave.phase } : null,
                    monster: room.doors.monster && room.doors.monster.pose !== 'hidden' ? { x: Math.round(room.doors.monster.x), y: Math.round(room.doors.monster.y),
                        pose: room.doors.monster.pose, facing: room.doors.monster.facing } : null,
                    floorOpen: room.doors.floorOpen,
                    hands: room.doors.hands.map(h => ({ id: h.id, x: Math.round(h.x), y: h.y, side: h.side, phase: h.phase })),
                    heads: room.doors.heads.map((h, i) => h.phase === 'idle' ? null : { i, phase: h.phase }).filter(Boolean),
                    swallowed: room.doors.swallowed.map(w => ({ id: w.id, i: w.hole }))
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

            if (!target) {
                // Yangi raqib: o'ziga ENG YAQIN (tirik, ko'rinadigan) o'yinchini tanlaydi -
                // botlar xona bo'ylab tarqoq turgani uchun, bu tabiiy ravishda turli
                // botlarni turli o'yinchilarga yo'naltiradi
                let closest: PlayerState | null = null;
                let minDist = Infinity;
                Object.values(room.players).forEach((p) => {
                    if (p.isInvisible || p.isDead) return;
                    const d = Math.hypot(p.x - bot.x, p.y - bot.y);
                    if (d < minDist) { minDist = d; closest = p; }
                });
                target = closest;
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
            const hitW = isMelee ? 54 : 10;
            const hitH = isMelee ? 44 : 10;
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
            else if (bullet.bulletType === 'arrow') baseDamage = 10;     // Kamonchi: yengil zarba
            else if (bullet.bulletType === 'melee') baseDamage = 20;     // Ritsar/Samuray: o'rtacha, stamina sekin ketadi
            if (bullet.bulletType === 'ice') baseDamage = 40;            // Mage muz shari: olovlidan +10 kuchli va muzlatadi
            else if (bullet.bulletType === 'pellet') baseDamage = 9 + (owner ? weaponUpgradeLevel(owner, 'shotgunDamage') * SHOTGUN_DMG_PER_LEVEL : 0);   // drobovik (+kuchaytirish)
            else if (bullet.bulletType === 'kunai') baseDamage = 22 + (owner ? weaponUpgradeLevel(owner, 'kunaiDamage') * KUNAI_DMG_PER_LEVEL : 0);      // kunai (+kuchaytirish)
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

            // G'OR (map-5): OQ YUZga o'q/zarba umuman ta'sir qilmaydi - faqat qochish

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
            if (!bulletDestroyed && fe && fdef && (fe.state === 'idle' || fe.state === 'charge' || fe.state === 'spit') &&
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

            if (bulletDestroyed || bullet.lifetime <= 0 || bullet.x < 0 || bullet.x > map.mapWidth || bullet.y < 0 || bullet.y > 600) {
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
            this.roomManager.awardReward(room.id, killer.id, ar ? ar.botCoins : 0, ar ? ar.botXp : GameEngine.KILL_XP)
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
            if (st.state === 'idle') {
                const onIt = alive.some(p => Math.abs(p.x - st.x) <= st.w / 2 + 10 &&
                    Math.abs(p.y + this.PLAYER_HALF_H - st.y) <= 10);
                if (onIt) { st.state = 'shake'; st.timer = Math.round(cfg.fallDelayMs / 30); }
            } else if (st.state === 'shake') {
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
        room.doors = map.doors ? { state: 'walk', choice: null, timer: 0, tick: 0, segment: 0, wave: null, lastSafe: -1, nextWave: 0, lastPlat: {},
            sub: null, monster: null, lastHitBy: null, floorOpen: false, hands: [], holeCd: map.doors.floorHoles.map(() => 0), nextHand: 0,
            heads: map.doors.wallHoles.map(() => ({ phase: 'idle' as const, t: 0, cd: 0 })), nextHead: 0, swallowed: [], counter: 0 } : null;
        room.farm = map.farm ? { state: 'idle', timer: 0, tick: 0, kills: 0, target: map.farm.killsPerPlayer * Math.max(1, Object.keys(room.players).length),
            spawned: 0, nextSpawnTick: 0, lastDogTick: -100000, rooted: {}, rootCd: {} } : null;
        room.lift = map.lift ? { state: 'hidden', y: 600, t: 0, spawned: 0, nextBotTick: 0 } : null;
        if (map.arena) {
            room.gorilla = null;
            room.fatElf = null;
            room.arena = { kills: 0, sinceBoss: 0, boss: null, lastBoss: null, bossesBeaten: 0, tick: 0, nextSpawnTick: 30 };
        } else {
            room.arena = null;
        }
        Object.values(room.players).forEach(p => { p.acidTicks = 0; });
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
    // Kislota tegdi: maksimal jonning 30% i, 2 soniya stamina tiklanmaydi
    private acidHit(p: PlayerState, def: NonNullable<MapDef['fatElf']>): void {
        this.hurtPlayer(p, Math.round((p.maxHp || 100) * def.acidDamagePct));
        p.acidTicks = Math.round(def.acidStaminaLockMs / 30);
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
                // Tasodifiy qahramonga mo'ljal oladi
                const target = alive[Math.floor(Math.random() * alive.length)];
                fe.targetId = target.id;
                fe.facingLeft = target.x < fe.x;
                fe.state = 'charge';
                fe.timer = T(def.spitChargeMs);
            }
        } else if (fe.state === 'charge') {
            const target = fe.targetId ? room.players[fe.targetId] : null;
            if (target && !target.isDead) fe.facingLeft = target.x < fe.x;
            if (--fe.timer <= 0) {
                // KISLOTA: nishon tomon yoy bo'ylab (biroz tarqoq) bir nechta tomchi
                const t = target && !target.isDead ? target : nearest;
                const sx = mouthX(), sy = mouthY;
                for (let k = 0; k < def.acidPerSpit; k++) {
                    const tx = t.x + (k - (def.acidPerSpit - 1) / 2) * 46;
                    const flight = Math.max(0.55, Math.min(1.3, Math.abs(tx - sx) / 520)) + k * 0.06;
                    const vx = (tx - sx) / flight;
                    const vy = (t.y - sy - 0.5 * 900 * flight * flight) / flight;
                    room.acidCounter = (room.acidCounter || 0) + 1;
                    acid.push({ id: 'acid_' + room.acidCounter, x: sx, y: sy, vx, vy });
                }
                fe.state = 'spit';
                fe.timer = T(450);
            }
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
        if (!dr || !d || dr.state !== 'choose' || room.isOver) return;
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
            if (--dr.timer <= 0 || allRead()) { dr.state = 'choose'; dr.timer = T(30000); this.io.to(roomId).emit('doorsChoose'); }
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
        const top = d.climbPlats[d.climbPlats.length - 1];
        // Eng tepa platformaga yetildi - 25 m o'tildi
        const atTop = alive.find(p => this.platOfPlayer(map, [top], p) === top);
        if (atTop) {
            dr.segment++;
            dr.wave = null;
            dr.lastPlat = {};
            if (dr.segment >= d.segments) {
                dr.state = 'done';
                this.roomManager.declareWinner(roomId, atTop.id).catch(err => console.error('declareWinner xatosi:', err));
                return;
            }
            let slot = 0;
            Object.values(room.players).forEach(p => {
                p.x = d.climbStartX + (slot++) * 30; p.y = 546;
                this.io.to(p.id).emit('teleport', { x: p.x, y: p.y });
            });
            dr.nextWave = dr.tick + T(1200);
            this.io.to(roomId).emit('climbSegment', { segment: dr.segment });
            return;
        }
        // Yangi platformaga chiqqanda (yoki har 2 s da) - yer silkinadi, 4 tadan 3 tasiga tosh tushadi
        let landed = false;
        alive.forEach(p => {
            const i = this.platOfPlayer(map, d.climbPlats, p);
            if (i >= 0 && dr.lastPlat[p.id] !== i) landed = true;
            if (i >= 0) dr.lastPlat[p.id] = i;
        });
        if (!dr.wave && (dr.tick >= dr.nextWave || (landed && dr.tick >= dr.nextWave - T(1500)))) {
            const n = d.climbPlats.length - 1;   // eng tepadagi (maqsad) tosh ostida emas
            let safe = Math.floor(Math.random() * n);
            if (safe === dr.lastSafe) safe = (safe + 1 + Math.floor(Math.random() * (n - 1))) % n;
            dr.lastSafe = safe;
            dr.wave = { safe, phase: 'warn', t: T(d.rockWarnMs) };
            this.io.to(roomId).emit('climbQuake', { safe, ms: d.rockWarnMs });
        }
        if (dr.wave) {
            const w = dr.wave;
            if (--w.t > 0) return;
            if (w.phase === 'warn') {
                w.phase = 'fall';
                w.t = T(350);
                d.climbPlats.forEach((pi, k) => {
                    if (k === w.safe || k === d.climbPlats.length - 1) return;
                    const pl = map.platforms[pi];
                    alive.forEach(p => {
                        const feet = p.y + this.PLAYER_HALF_H;
                        // Shu platformada turgan (yoki undan sal sakragan) qahramon; yuqoridagi platformadagilarga tegmaydi
                        if (p.x < pl.x - 8 || p.x > pl.x + pl.w + 8 || feet > pl.y + 10 || feet < pl.y - 70) return;
                        this.hurtPlayer(p, Math.round((p.maxHp || 100) * d.rockDamagePct));
                        this.knockback(p, 0, 200);
                    });
                });
                this.io.to(roomId).emit('climbRocks', { safe: w.safe });
            } else {
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
        if (dr.sub === 'elf') {
            if (--dr.timer <= 0 || alive.every(p => p.introDone)) dr.sub = 'lever';
            return;
        }
        const mo = dr.monster;
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

        // QOCHISH: yorug'likka yetgan qahramon - orqada g'or qulaydi
        const out = free.find(p => p.x >= d.exitX);
        if (out) {
            dr.swallowed.forEach(w => {
                const p = room.players[w.id], h = d.wallHoles[w.hole];
                p.x = this.caveSafeX(d, h.x); p.y = d.floorY - 30;
                this.io.to(p.id).emit('teleport', { x: p.x, y: p.y });
                this.io.to(roomId).emit('spitOut', { id: p.id, i: w.hole });
            });
            dr.swallowed = [];
            dr.hands = [];
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
                const victim = free.filter(p => !busy.has(p.id) && Math.hypot(p.x - w.x, p.y - w.y) <= w.r + d.headReach)
                    .sort((a, b) => Math.hypot(a.x - w.x, a.y - w.y) - Math.hypot(b.x - w.x, b.y - w.y))[0];
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
                if (free.some(p => Math.abs(p.x - w.x) <= d.headTrigger && p.y > w.y - 60)) cands.push(k);
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
        Object.values(room.players).filter(p => !p.isDead).forEach(p => {
            this.roomManager.awardReward(room.id, p.id, ar.bossCoins, ar.bossXp).catch(err => console.error('awardReward xatosi:', err));
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