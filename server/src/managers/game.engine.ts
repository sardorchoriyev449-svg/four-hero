import { Server } from 'socket.io';
import { RoomState, PlayerState, BotState } from '../types'
import { BaseCharacter } from '../characters/base.character';
import { getCharacterLogic } from '../characters';
import { RoomManager } from './room.manager';
import { bonusDamageOf, shotgunMagOf, weaponUpgradeLevel, SHOTGUN_DMG_PER_LEVEL, KUNAI_DMG_PER_LEVEL } from '../perks';
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
    public static readonly GORILLA_TALK_MAX_MS = 20000;          // ~3s - o'lim portlashlari ko'rinib ulgursin
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
                            if (!ally.isDead) ally.hp = Math.min(100, ally.hp + 0.6);
                        });
                    }
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
                    x: p.x, y: p.y, hp: p.hp, stamina: p.stamina, kills: p.kills, isDead: p.isDead,
                    respawnTimer: p.respawnTimer, speedMultiplier: p.speedMultiplier, isInvisible: p.isInvisible,
                    isHoldingAbility: p.isHoldingAbility, characterType: p.characterType, color: p.color,
                    weaponColor: p.weaponColor, nickname: p.nickname, apples: p.apples,
                    level: p.level || 0, maxStamina: p.maxStamina || 100, weaponMode: p.weaponMode || 'main',
                    special: (p.specialTicks || 0) > 0, specialCd: Math.ceil((p.specialCooldown || 0) * this.TICK_SECONDS),
                    ammo: p.ammo ?? 0, maxAmmo: shotgunMagOf(p), reloading: (p.reloadTicks || 0) > 0
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
        const speed = bot.kind === 'dog' ? ((bot.slowTicks || 0) > 0 ? this.DOG_SLOW_SPEED : this.DOG_SPEED) : this.BOT_SPEED;
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
        const surfaces = this.getMapSurfaces(room);

        room.bots.forEach((bot) => {
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
                    const contactX = (isDog ? this.DOG_HALF_W : this.BOT_HALF_W) + this.PLAYER_HALF_W + 2;
                    if (Math.abs(p.x - bot.x) > 60 && here.standY === this.GROUND_Y) {
                        // FORMATSIYA: uzoqda har bot o'z "joyi"ga intiladi - bir X'ga
                        // to'planib, bir-biriga urilib tebranmasligi uchun
                        desiredX = p.x + this.botFormationOffset(bot.id);
                    } else {
                        // Yaqinda: raqibning SHU tomonida, tanasiga tegib to'xtaydi -
                        // ichiga kirib, uni itarib yubormaydi
                        desiredX = p.x + (bot.x <= p.x ? -contactX : contactX);
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
                    if (overhead && !bot.jumpReacted) {
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
            const inReach = Math.abs(p.x - bot.x) <= (isDog ? this.DOG_REACH_X : this.BOT_ATTACK_REACH_X) &&
                            Math.abs(pAsBotY - bot.y) <= this.BOT_ATTACK_REACH_Y;
            if (bot.windupTimer > 0) {
                bot.windupTimer--;
                if (bot.windupTimer === 0) {
                    bot.attackCooldown = cooldownTicks;
                    if (isDog) bot.slowTicks = this.DOG_SLOW_TICKS; // tishladi - endi ~1s sekin
                    const shielded = p.characterType === 'knight' && p.isHoldingAbility;
                    if (inReach && !shielded) {
                        p.hp -= isDog ? this.DOG_ATTACK_DAMAGE : this.BOT_ATTACK_DAMAGE;
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
            if (!isDog && !bot.isBlocking && inThreatRange) {
                const justAttacked = room.bullets.some(b => b.playerId === p.id && b.justSpawned);
                if (justAttacked && Math.random() < this.BOT_REACTIVE_BLOCK_CHANCE) {
                    bot.isBlocking = true;
                    bot.blockTimer = this.BOT_BLOCK_DURATION_TICKS;
                }
            }
        });

        // BOTLAR BIR-BIRINING ICHIGA KIRIB KETMASLIGI UCHUN
        // (ular orasidagi to'qnashuvni tekshirib, kerak bo'lsa ajratib qo'yamiz)
        this.resolveBotCollisions(room);

        // Itarish natijasida bot xaritadan tashqariga chiqib ketmasin
        const mapWidth = surfaces[0].xEnd;
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
            const hitX = bullet.x - hitW / 2;
            const hitY = bullet.y - hitH / 2;
            const hitRect = { x: hitX, y: hitY, w: hitW, h: hitH };

            // Har bir o'q turiga qarab shaxsiy zarar miqdori (yangi balans)
            // + otgan o'yinchining hisobidagi "damage" ko'nikma darajasi (har daraja +15%, max +75%)
            const owner = room.players[bullet.playerId];
            const damageMultiplier = 1 + Math.min(owner?.damageLevel || 0, 5) * 0.15;
            let baseDamage = 20;
            if (bullet.bulletType === 'fireball') baseDamage = 30;       // Sehrgar: kuchli, lekin stamina tez ketadi
            else if (bullet.bulletType === 'arrow') baseDamage = 10;     // Kamonchi: yengil zarba
            else if (bullet.bulletType === 'melee') baseDamage = 20;     // Ritsar/Samuray: o'rtacha, stamina sekin ketadi
            if (bullet.bulletType === 'ice') baseDamage = 20;            // Mage muz shari: kamroq, lekin muzlatadi
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
        room.bots.splice(index, 1);
        // Jamoaviy hisob: xarita botlarning HAMMASI o'lganda o'tiladi
        // (checkBotRespawn'da tekshiriladi), shaxsiy kill - statistika uchun
        room.botsKilled++;
        const killer = killerId ? room.players[killerId] : null;
        if (killer && !room.isOver) killer.kills++;
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
        const def = map.boss;
        const boss = room.boss;
        if (!def || !boss || !room.snake || room.isOver) return;
        room.levelTicks = (room.levelTicks || 0) + 1;
        if (boss.hitFlash > 0) boss.hitFlash--;

        if (boss.dead) {
            boss.deathTicks--;
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
        snake.x = Math.min(map.mapWidth - 300, snake.x + snake.speed * this.TICK_SECONDS);
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
            const count = boss.hp < boss.maxHp / 2 ? 2 : 1;
            const targets = Object.values(room.players)
                .filter(p => !p.isDead && p.x > snake.x + 80 && p.x < snake.x + 1100)
                .sort(() => Math.random() - 0.5);
            for (let k = 0; k < count && room.mines.length + flying.length < this.BOSS_MAX_MINES; k++) {
                const x0 = snake.x - 40, y0 = 440, g = 800;
                let tx: number, ty: number, T: number;
                const p = targets.length ? targets[k % targets.length] : null;
                if (p) {
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
    private bossSurfaceUnder(map: MapDef, x: number, feetY: number): number {
        let best = 570;
        const consider = (top: number) => { if (top >= feetY - 20 && top < best) best = top; };
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