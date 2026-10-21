import { Server, Socket } from 'socket.io';
import { RoomState, PlayerState } from '../types';
import { getCharacterLogic } from '../characters';
import { BaseCharacter } from '../characters/base.character';
import { getSkinColor, getWeaponSkinColor } from '../skins';
import { lookString } from '../cosmetics';
import { MAPS, getMapById, SEASON_MAP_COUNT, farmPlotX, farmZoneCenter, farmGrown, farmIsRaining, rollFish, FARM_PLOTS, FARM_ZONES, CROPS, FRUIT_TREES, ORCHARD_SLOTS, FISH, farmLevel, farmCapacity, dailyOffer, FARM_DECOR, currentFarmSeason, SEASON_GROWTH, orchardSlotsFor, HOME_ITEMS, HOME_SLOTS, CHEST_CAP } from '../maps';
import { GameEngine } from './game.engine';
import * as db from '../db';
import { isLocalTest } from '../testmode';
import { hasPerk, maxStaminaOf, maxHpOf, BASE_HP, ALT_WEAPON_PERK, SPECIAL_PERK, weaponModesOf, SPECIAL_TICKS, SPECIAL_COOLDOWN_TICKS, INVIS_LINGER_TICKS, shotgunMagOf, PERK_TABLE } from '../perks';

// Har bir personaj turi uchun aniq belgilangan rang
// (endi tasodifiy rang emas, har doim shu ranglar ishlatiladi - "default" skin rangi)
const CHARACTER_COLORS: { [key: string]: number } = {
    knight: 0x9e9e9e,   // Kulrang
    archer: 0x7b1fa2,   // Binafsha (siz chizgan sxemaga mos)
    mage: 0x1565c0,     // Ko'k
    samurai: 0xd32f2f   // Qizil
};

export class RoomManager {
    private io: Server;
    private activeRooms: { [key: string]: RoomState };
    private static readonly WIN_REWARD_COINS = 100; // G'alaba uchun beriladigan tanga
    private static readonly MAX_PLAYERS = 4;         // Bitta xonada maksimal necha kishi bo'lishi mumkin

    // Bitta hisobdan (userId) faqat bitta joyda (bitta socket'da) o'ynash mumkin bo'lishi uchun:
    // userId -> hozir shu hisob bilan ulangan socket.id
    private activeUserSockets: Map<string, string> = new Map();

    // Sahifa yangilansa, o'yinchining o'rni shuncha vaqt saqlanib turadi
    private static readonly RECONNECT_GRACE_MS = 15000;
    private static readonly CUTSCENE_ADVANCE_COOLDOWN_MS = 250;
    // socket.id -> uzilgandan keyin xonadan chiqarish taymeri
    private pendingLeaves: Map<string, NodeJS.Timeout> = new Map();
    private pendingJoins: Set<string> = new Set();
    private static readonly LOAD_WAIT_MS = 15000; // bazadan ma'lumot kutilayotgan qo'shilishlar (takror so'rovlarga qarshi)

    constructor(io: Server, activeRooms: { [key: string]: RoomState }) {
        this.io = io;
        this.activeRooms = activeRooms;
    }

    // Yangi o'yinchini xonaga (lobbiga) qo'shish
    // userId/nickname - agar foydalanuvchi ro'yxatdan o'tgan/tizimga kirgan bo'lsa yuboriladi
    public async joinPlayer(socket: Socket, roomId: string, userId: string | null = null, nickname: string = 'Guest', clientId: string | null = null): Promise<void> {
        const room = this.activeRooms[roomId];
        if (!room) return;

        // Xo'jayin bu o'yinchini xonadan chiqarib yuborgan - qayta kira olmaydi
        if (room.kicked && ((userId !== null && room.kicked.includes('u:' + userId)) || (clientId && room.kicked.includes('c:' + clientId)))) {
            socket.emit('joinError', 'err_kicked');
            return;
        }
        // Boshqa xonada qolib ketgan bo'lsa - avval o'sha yerdan chiqadi (aks holda eski xonada
        // "arvoh" o'yinchi qolib, u xona bo'shamasdi)
        if (!room.players[socket.id] && Object.keys(this.activeRooms).some(id => id !== roomId && this.activeRooms[id].players[socket.id])) {
            this.leavePlayer(socket);
            if (!this.activeRooms[roomId]) return;
        }
        // Shu socket allaqachon xonada (takroriy so'rov) - ikkinchi nusxa qo'shilmaydi
        if (room.players[socket.id]) {
            socket.emit('roomJoined', this.roomJoinedPayload(room, socket.id));
            this.updateLobby(roomId);
            return;
        }
        // Shu brauzer oynasi (clientId) xonada allaqachon bor - sahifa yangilangan: yangi o'yinchi
        // qo'shmasdan, eski o'rnini qaytarib beramiz (aks holda lobbida ikkita bo'lib qolardi)
        if (this.pendingJoins.has(socket.id)) return;
        if (clientId) {
            this.pendingJoins.add(socket.id);
            const r = await this.reclaimPlayer(socket, roomId, clientId);
            this.pendingJoins.delete(socket.id);
            if (r === 'reclaimed') return;
            if (r === 'conflict') {
                // Nusxalangan tab: alohida o'yinchi bo'ladi - o'z identifikatorini oladi
                clientId = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
                socket.emit('clientIdChanged', clientId);
            }
            if (!this.activeRooms[roomId] || room.players[socket.id]) return;
        }

        // O'YIN BOSHLANIB BO'LGAN - yangi o'yinchi kira olmaydi (aks holda xaritada to'satdan paydo bo'lardi).
        // Sahifani yangilagan / uzilib qolgan o'z o'yinchisi yuqorida (reclaimPlayer) o'rnini qaytarib oladi; admin - kuzatish uchun kiradi
        const isAdminSock = !!(socket.data && (socket.data as any).isAdmin);
        if ((room.isStarted || room.advancing) && !isAdminSock) {
            socket.emit('joinError', 'err_game_in_progress');
            return;
        }
        // XONA TO'LGANMI? Maksimal 4 kishi
        if (Object.keys(room.players).length >= RoomManager.MAX_PLAYERS) {
            socket.emit('joinError', 'err_room_full|' + RoomManager.MAX_PLAYERS);
            return;
        }

        // BITTA HISOBDAN FAQAT BITTA JOYDA O'YNASH MUMKIN
        // Agar shu userId bilan allaqachon boshqa (hali ulanib turgan) socket faol bo'lsa, rad etamiz
        if (userId !== null) {
            const existingSocketId = this.activeUserSockets.get(userId);
            if (existingSocketId && existingSocketId !== socket.id && this.io.sockets.sockets.get(existingSocketId)) {
                socket.emit('joinError', 'err_account_in_use');
                return;
            }
            this.activeUserSockets.set(userId, socket.id);
        }

        // Agar hisobi bo'lsa, uning kiygan skinlarini, qurol skinlarini, tanlagan
        // ("default") personajini va yaxshilash darajalarini bazadan olamiz
        let equippedSkins: { [key: string]: string } = { knight: 'default', samurai: 'default', archer: 'default', mage: 'default' };
        let equippedWeaponSkins: { [key: string]: string } = { knight: 'default', samurai: 'default', archer: 'default', mage: 'default' };
        let accountUpgrades: { [key: string]: { damage: number, stamina: number } } = {
            knight: { damage: 0, stamina: 0 }, archer: { damage: 0, stamina: 0 },
            mage: { damage: 0, stamina: 0 }, samurai: { damage: 0, stamina: 0 }
        };
        let equippedCosmetics: { [c: string]: { [slot: string]: string } } = {};
        let characterType = 'knight';
        this.pendingJoins.add(socket.id);
        let unlockedLevel = 0, xp = 0;
        let charXp: { [c: string]: number } = {};
        let acidCurse = false, boltCurse = false, mutedUntil = 0;
        let xpBoost: { [c: string]: number } = {};
        if (userId !== null) {
            const user = await db.getUserById(userId);
            // Admin bloklagan hisob - xonaga kira olmaydi
            if (user && user.banned) {
                this.pendingJoins.delete(socket.id);
                if (this.activeUserSockets.get(userId) === socket.id) this.activeUserSockets.delete(userId);
                socket.emit('accountBanned', { reason: user.banReason });
                return;
            }
            if (user) {
                unlockedLevel = user.unlockedLevel;   // hisob progressi (xona uchun applyHostProgress cheklaydi)
                xp = user.xp;
                charXp = user.charXp;
                equippedSkins = user.equippedSkins;
                equippedWeaponSkins = user.equippedWeaponSkins;
                equippedCosmetics = user.equippedCosmetics;
                accountUpgrades = user.upgrades;
                // MUHIM: "Mening personajim" ekranida tanlangan personaj bilan HAR QANDAY
                // xonada shu personaj sifatida o'ynaydi (endi lobbida alohida tanlanmaydi)
                characterType = user.defaultCharacter || 'knight';
                acidCurse = !!user.cursedAcid;
                boltCurse = !!user.cursedBolt;
                mutedUntil = user.mutedUntil || 0;
                xpBoost = user.xpBoost || {};
            }
        }
        this.pendingJoins.delete(socket.id);
        // Bazani kutayotganda sahifa yana yangilangan / xona yopilgan bo'lishi mumkin
        if (!this.activeRooms[roomId] || !this.io.sockets.sockets.get(socket.id)) return;
        // Bazani kutayotganda xo'jayin o'yinni boshlab yuborgan bo'lishi mumkin
        if ((room.isStarted || room.advancing) && !isAdminSock) {
            if (userId !== null && this.activeUserSockets.get(userId) === socket.id) this.activeUserSockets.delete(userId);
            socket.emit('joinError', 'err_game_in_progress');
            return;
        }

        room.players[socket.id] = {
            id: socket.id,
            x: 100 + Math.random() * 200,
            y: 500,
            characterType: characterType,
            color: getSkinColor(characterType, equippedSkins[characterType] || 'default'),
            hp: 100,
            isInvisible: false,
            speedMultiplier: 1,
            stamina: 100,
            attackCooldown: 0,
            staminaRegenDelay: 0,
            isHoldingAbility: false,
            isHoldingAttack: false,
            lastAttackAngle: 0,
            userId: userId,
            clientId: typeof clientId === 'string' ? clientId.slice(0, 64) : null,
            isAdmin: !!(socket.data && (socket.data as any).isAdmin),
            acidCurse, boltCurse, mutedUntil, xpBoost,
            nickname: nickname,
            kills: 0,
            skinId: equippedSkins[characterType] || 'default',
            equippedSkins: equippedSkins,
            weaponColor: getWeaponSkinColor(characterType, equippedWeaponSkins[characterType] || 'default'),
            equippedWeaponSkins: equippedWeaponSkins,
            equippedCosmetics: equippedCosmetics,
            look: lookString(equippedCosmetics[characterType], characterType),
            isDead: false,
            respawnTimer: 0,
            isReady: false,
            damageLevel: accountUpgrades[characterType]?.damage || 0,
            staminaLevel: accountUpgrades[characterType]?.stamina || 0,
            accountUpgrades: accountUpgrades,
            // Localhost test rejimi - hamma xaritalar ochiq (hisobli ham, mehmon ham)
            unlockedLevel: isLocalTest(socket.handshake?.address) ? SEASON_MAP_COUNT - 1 : unlockedLevel,
            xp: xp,
            charXp: charXp,
            level: 0,
            maxStamina: 100,
            weaponMode: 'main',
            specialTicks: 0,
            specialCooldown: 0,
            invisLinger: 0
        };
        RoomManager.refreshPerks(room.players[socket.id]);
        // Xonaning ochilgan xaritalari - xo'jayin hisobining progressi
        if (room.hostId === socket.id) this.applyHostProgress(room, true);
        // Pauzadagi xonaga kimdir kirsa - pauza yechiladi (yolg'iz o'yinchining menyusi ham yopiladi)
        if (room.paused) {
            room.paused = false;
            this.io.to(roomId).emit('forceResume');
        }

        socket.join(roomId);

        // Klientga xonaga muvaffaqiyatli kirganini xabar berish
        // (aks holda menyu paneli lobbi paneliga almashmaydi)
        socket.emit('roomJoined', this.roomJoinedPayload(room, socket.id));

        this.updateLobby(roomId);
        this.broadcastRoomList();
    }

    // Joriy personajning darajasi va undan kelib chiqadigan qiymatlar (personaj/tajriba o'zgarganda)
    public static refreshPerks(p: PlayerState): void {
        p.level = db.xpLevel((p.charXp && p.charXp[p.characterType]) || 0);
        p.maxStamina = maxStaminaOf(p.characterType, p.level);
        if (p.stamina > p.maxStamina) p.stamina = p.maxStamina;
        // Maksimal jon ("hp" kuchaytirishi): oshsa - qo'shilgan qismi joriy jonga ham qo'shiladi
        const oldMaxHp = p.maxHp || BASE_HP;
        p.maxHp = maxHpOf(p);
        if (p.hp > p.maxHp) p.hp = p.maxHp;
        else if (p.maxHp > oldMaxHp && !p.isDead) p.hp += p.maxHp - oldMaxHp;
        if (!weaponModesOf(p).includes(p.weaponMode || 'main')) p.weaponMode = 'main';
        // Magazin hajmi kuchaytirilgan bo'lishi mumkin
        if (p.ammo === undefined || p.ammo > shotgunMagOf(p)) p.ammo = shotgunMagOf(p);
    }

    // Q: ikkinchi qurolga o'tish va qaytish (shu daraja imkoniyati ochilgan bo'lsa)
    public toggleWeapon(socket: Socket, roomId: string): void {
        const p = this.activeRooms[roomId]?.players[socket.id];
        if (!p || p.isDead) return;
        // Q: asosiy -> 2-qurol -> 3-qurol (16-daraja) -> asosiy ...
        const modes = weaponModesOf(p);
        if (modes.length < 2) return;
        p.weaponMode = modes[(modes.indexOf(p.weaponMode || 'main') + 1) % modes.length];
    }

    // R: maxsus qobiliyat (mage - jamoaviy davolash, knight - uchuvchi etik), 2 soniya, keyin kutish
    public useSpecial(socket: Socket, roomId: string): void {
        const room = this.activeRooms[roomId];
        const p = room?.players[socket.id];
        if (!room || !room.isStarted || !p || p.isDead || this.isLoading(room) || RoomManager.frozen(room)) return;
        const perk = SPECIAL_PERK[p.characterType];
        if (!perk || !hasPerk(p, perk) || (p.specialCooldown || 0) > 0) return;
        p.specialTicks = SPECIAL_TICKS;
        p.specialCooldown = SPECIAL_COOLDOWN_TICKS;
    }

    // Xonaning ochilgan xaritalari = xo'jayin hisobining progressi. Xo'jayin yangi kirganda
    // (freshHost) xona uning eng so'nggi ochilgan xaritasidan davom etadi
    private applyHostProgress(room: RoomState, freshHost: boolean): void {
        const host = room.players[room.hostId];
        // Yangi xo'jayin qahramoni 5-darajadan past (yoki mehmon) - arena tanlangan bo'lsa, oddiy xaritaga qaytadi
        if (!room.isStarted && getMapById(room.selectedLevel).bonus && !RoomManager.alwaysOpen(getMapById(room.selectedLevel)) && !this.bonusUnlocked(room)) {
            room.selectedLevel = Math.min(room.unlockedLevel, SEASON_MAP_COUNT - 1);
            room.killsToWin = getMapById(room.selectedLevel).killsToWin;
        }
        if (!host || typeof host.unlockedLevel !== 'number') return;
        room.unlockedLevel = Math.min(host.unlockedLevel, SEASON_MAP_COUNT - 1);
        // O'yin ketayotganda xarita almashmaydi - faqat lobbida moslanadi
        if (room.isStarted) return;
        if (freshHost || (room.selectedLevel > room.unlockedLevel && !getMapById(room.selectedLevel).bonus)) room.selectedLevel = room.unlockedLevel;
        room.killsToWin = getMapById(room.selectedLevel).killsToWin;
    }

    private roomJoinedPayload(room: RoomState, socketId: string) {
        return {
            roomId: room.id,
            roomName: room.name,
            isHost: room.hostId === socketId,
            isPersistent: room.isPersistent,
            isPrivate: room.isPrivate,
            unlockedLevel: room.unlockedLevel,
            selectedLevel: room.selectedLevel,
            bonusUnlocked: this.bonusUnlocked(room),
            maps: MAPS.map(m => ({ id: m.id, name: m.name, description: m.description, accentColor: m.accentColor, bonus: !!m.bonus, shop: RoomManager.alwaysOpen(m), season: m.season || 1 }))
        };
    }

    // UZILISH (sahifa yangilandi / internet uzildi): o'yinchini darhol
    // chiqarmaymiz - RECONNECT_GRACE_MS davomida o'rni saqlanib turadi.
    // Shu vaqt ichida o'sha oyna (clientId) qaytsa - reclaimPlayer o'rnini qaytaradi
    public handleDisconnect(socketId: string): void {
        const inRoom = Object.values(this.activeRooms).some(r => r.players[socketId]);
        if (!inRoom) return;
        const timer = setTimeout(() => {
            this.pendingLeaves.delete(socketId);
            this.leavePlayerById(socketId);
        }, RoomManager.RECONNECT_GRACE_MS);
        this.pendingLeaves.set(socketId, timer);
    }

    // QAYTA ULANISH: shu oynaning (clientId) eski o'rni hali saqlanib turgan
    // bo'lsa - yangi socket'ga ko'chiramiz (xo'jayinlik, tayyor holati, o'yindagi
    // joyi, joni - hammasi saqlanadi). O'yin ketayotgan bo'lsa - darhol o'yinga qaytadi
    // Natija: 'reclaimed' - o'rni qaytarildi; 'none' - bu oynaning o'rni yo'q; 'conflict' - shu
    // clientId li BOSHQA tirik tab bor (brauzer tabni nusxalaganda sessionStorage ham nusxalanadi)
    public async reclaimPlayer(socket: Socket, roomId: string, clientId: string): Promise<'reclaimed' | 'none' | 'conflict'> {
        let room = this.activeRooms[roomId];
        if (!room) return 'none';
        let oldId = Object.keys(room.players).find(id => id !== socket.id && room.players[id].clientId === clientId);
        if (!oldId) return 'none';
        // Eski ulanish hali "tirik" ko'rinsa - haqiqatan javob berishini tekshiramiz: sahifa yangilangan
        // bo'lsa, eski sahifa yo'q - javob kelmaydi (o'rnini olamiz). Javob kelsa - bu boshqa ochiq tab
        // (nusxa): unga TEGMAYMIZ, yangisi alohida o'yinchi bo'ladi
        const staleSocket = this.io.sockets.sockets.get(oldId);
        if (staleSocket && await this.isSocketAlive(staleSocket)) return 'conflict';
        // Kutish paytida holat o'zgargan bo'lishi mumkin - qayta tekshiramiz
        room = this.activeRooms[roomId];
        if (!room || !room.players[oldId] || room.players[socket.id]) return 'none';

        const pending = this.pendingLeaves.get(oldId);
        if (pending) {
            clearTimeout(pending);
            this.pendingLeaves.delete(oldId);
        }

        const player = room.players[oldId];
        delete room.players[oldId];
        player.id = socket.id;
        if (socket.data && (socket.data as any).isAdmin) player.isAdmin = true;
        room.players[socket.id] = player;
        if (room.hostId === oldId) room.hostId = socket.id;
        if (player.userId !== null) this.activeUserSockets.set(player.userId, socket.id);
        // Eski ID'ga bog'langan narsalar: uchayotgan o'qlar, botlar nishoni, chekpoint ro'yxati
        room.bullets.forEach(b => { if (b.playerId === oldId) b.playerId = socket.id; });
        room.bots.forEach(b => { if (b.targetPlayerId === oldId) b.targetPlayerId = socket.id; });
        room.checkpointReached = room.checkpointReached.map(id => (id === oldId ? socket.id : id));
        if (room.loadingIds) room.loadingIds = room.loadingIds.map(id => (id === oldId ? socket.id : id));

        if (staleSocket) staleSocket.disconnect(true);

        socket.join(roomId);
        socket.emit('roomJoined', this.roomJoinedPayload(room, socket.id));
        this.updateLobby(roomId);
        this.broadcastRoomList();
        if (room.isStarted) {
            socket.emit('gameStarted', { map: this.mapPayload(room), continued: null, round: room.round || 0 });
        }
        return 'reclaimed';
    }

    // Ulanish haqiqatan tirikmi: klientdan javob so'raymiz (1.5s ichida kelmasa - eskirgan)
    private async isSocketAlive(sock: Socket): Promise<boolean> {
        if (!sock || typeof (sock as any).timeout !== 'function') return false;
        try {
            await sock.timeout(1500).emitWithAck('areYouThere');
            return true;
        } catch {
            return false;
        }
    }

    // Lobbida personaj turini o'zgartirish (Samurai, Mage, Archer, Knight)
    public selectCharacter(socket: Socket, roomId: string, characterType: string): void {
        const room = this.activeRooms[roomId];
        // Faqat mavjud personajlar va faqat lobbida (o'yin o'rtasida almashsa - holati buzilardi)
        if (!(characterType in CHARACTER_COLORS) || !room || room.isStarted) return;
        if (room.players[socket.id]) {
            const player = room.players[socket.id];
            player.characterType = characterType;
            const skinId = player.equippedSkins[characterType] || 'default';
            player.skinId = skinId;
            player.color = getSkinColor(characterType, skinId) ?? CHARACTER_COLORS[characterType];
            player.look = lookString((player.equippedCosmetics || {})[characterType], characterType);
            // MUHIM: yaxshilashlar HAR BIR PERSONAJGA ALOHIDA tegishli - shu personajga
            // almashganda, uning o'z damage/stamina darajasini keshdan olamiz
            const charUpgrades = player.accountUpgrades[characterType] || { damage: 0, stamina: 0 };
            player.damageLevel = charUpgrades.damage || 0;
            player.staminaLevel = charUpgrades.stamina || 0;
            RoomManager.refreshPerks(player);
            this.updateLobby(roomId);
            // Xo'jayin qahramonini almashtirsa - bonus xarita qulfi o'zgarishi mumkin
            if (room.hostId === socket.id) {
                if (getMapById(room.selectedLevel).bonus && !RoomManager.alwaysOpen(getMapById(room.selectedLevel)) && !this.bonusUnlocked(room)) room.selectedLevel = Math.min(room.unlockedLevel, SEASON_MAP_COUNT - 1);
                this.broadcastLevelInfo(roomId);
            }

            // Foydalanuvchi "Mening personajim" ekranida keyingi safar shu personaj
            // birinchi ko'rsatilishi uchun, tanlovni hisobida ham eslab qolamiz
            if (player.userId !== null) {
                db.setDefaultCharacter(player.userId, characterType).catch(() => {});
            }
        }
    }

    // "Mening personajim" ekranida (xonadan tashqarida yoki ichida) skin sotib olingan/kiyilgan
    // yoxud ko'nikma yaxshilangandan so'ng, agar o'yinchi hozir bir xonada bo'lsa, uning
    // jonli holatini (rang/damage/stamina) bazadan qayta yuklab, sinxronlaymiz
    public async refreshCharacterInRoom(playerId: string, roomId: string): Promise<void> {
        const room = this.activeRooms[roomId];
        if (!room || !room.players[playerId]) return;
        const player = room.players[playerId];
        if (player.userId === null) return;

        const user = await db.getUserById(player.userId);
        if (!user) return;

        player.equippedSkins = user.equippedSkins;
        player.equippedWeaponSkins = user.equippedWeaponSkins;
        player.accountUpgrades = user.upgrades;
        const skinId = user.equippedSkins[player.characterType] || 'default';
        player.skinId = skinId;
        player.color = getSkinColor(player.characterType, skinId) ?? CHARACTER_COLORS[player.characterType];
        const weaponSkinId = user.equippedWeaponSkins[player.characterType] || 'default';
        player.weaponColor = getWeaponSkinColor(player.characterType, weaponSkinId);
        player.equippedCosmetics = user.equippedCosmetics;
        player.look = lookString(user.equippedCosmetics[player.characterType], player.characterType);
        const charUpgrades = user.upgrades[player.characterType] || { damage: 0, stamina: 0 };
        player.damageLevel = charUpgrades.damage || 0;
        player.staminaLevel = charUpgrades.stamina || 0;
        player.charXp = user.charXp;
        player.xpBoost = user.xpBoost || {};
        RoomManager.refreshPerks(player);

        this.updateLobby(roomId);
    }

    // LOBBIDA XONA XO'JAYINI QAYSI XARITADA O'YNASHNI TANLAYDI
    // Faqat ochilgan (unlockedLevel dan katta bo'lmagan) xaritalarni tanlash mumkin
    public selectLevel(socket: Socket, roomId: string, levelIndex: number): void {
        const room = this.activeRooms[roomId];
        if (!room || room.isStarted) return;
        if (room.hostId !== socket.id) return; // Faqat xo'jayin tanlay oladi

        // Butun son bo'lishi shart (matn/NaN kelsa - tekshiruvlar o'tib ketib, START da xato berardi)
        // Bonus xaritalar doim ochiq; mavsum xaritalari - faqat ochilganlari
        if (!Number.isInteger(levelIndex) || levelIndex < 0 || levelIndex >= MAPS.length || (levelIndex > room.unlockedLevel && !MAPS[levelIndex].bonus)) return;
        // Bonus (arena) - xo'jayin qahramoni 5-darajaga yetganda ochiladi
        if (MAPS[levelIndex].bonus && !RoomManager.alwaysOpen(MAPS[levelIndex]) && !this.bonusUnlocked(room)) return;

        room.selectedLevel = levelIndex;
        // Tanlovni hammaga yuboramiz (avval o'yinchilar ro'yxati yuborilardi -
        // xarita tanlovi ekranda umuman o'zgarmas edi)
        this.broadcastLevelInfo(roomId);
    }

    // Lobbidagilarga joriy xarita tanlovi/ochilgan daraja haqida xabar berish
    public broadcastLevelInfo(roomId: string): void {
        const room = this.activeRooms[roomId];
        if (!room) return;
        this.io.to(roomId).emit('updateRoomLevel', {
            unlockedLevel: room.unlockedLevel,
            selectedLevel: room.selectedLevel,
            bonusUnlocked: this.bonusUnlocked(room)
        });
    }
    // Bonus (arena) - xo'jayin qahramoni 5-darajaga yetganda ochiladi
    public static readonly BONUS_UNLOCK_LEVEL = 5;
    // Tinch bonus xaritalar (do'kon, My Farm) - darajadan qat'i nazar doim ochiq
    public static alwaysOpen(m: { shop?: unknown, myFarm?: unknown }): boolean { return !!m.shop || !!m.myFarm; }
    private bonusUnlocked(room: RoomState): boolean {
        const host = room.players[room.hostId];
        return !!host && (host.level || 0) >= RoomManager.BONUS_UNLOCK_LEVEL;
    }
    // "TAYYOR": aniq holat (almashtirish emas - telefonda ikki marta bosilsa ham buzilmaydi).
    // Server o'yinchini tanimasa - klientga xabar: u xonaga qayta ulanib, yana yuboradi
    public setReady(socket: Socket, roomId: string, ready: boolean): void {
        const room = this.activeRooms[roomId];
        const player = room?.players[socket.id];
        if (!room || !player) { socket.emit('readyFailed'); return; }
        if (room.isStarted) return;
        player.isReady = !!ready;
        this.updateLobby(roomId);
    }
    // Klient eski xaritada qolib ketgan (o'tish xabarini o'tkazib yuborgan) - joriy xaritani qayta yuboramiz
    public resyncPlayer(socket: Socket, roomId: string): void {
        const room = this.activeRooms[roomId];
        if (!room || !room.players[socket.id] || !room.isStarted) return;
        socket.emit('gameStarted', { map: this.mapPayload(room), continued: null, round: room.round || 0 });
    }
    // PAUZA -> "LOBBIGA QAYTISH" (faqat xo'jayin): raund to'xtatiladi, hamma xona lobbisiga qaytadi
    public returnToLobby(socket: Socket, roomId: string): void {
        const room = this.activeRooms[roomId];
        if (!room || room.hostId !== socket.id || !room.isStarted) return;
        room.isOver = true;
        room.isStarted = false;
        room.paused = false;
        room.bots = [];
        room.bullets = [];
        Object.values(room.players).forEach((p) => {
            p.kills = 0;
            p.hp = p.maxHp || BASE_HP;
            p.isDead = false;
            p.respawnTimer = 0;
            p.isReady = false;
        });
        this.applyHostProgress(room, false);
        this.io.to(roomId).emit('returnedToLobby');
        this.updateLobby(roomId);
        this.broadcastLevelInfo(roomId);
        this.broadcastRoomList();
    }
    // Hisob nomi o'zgardi - onlayn bo'lsa, xonadagi ismi ham yangilanadi
    public renameOnline(userId: string, nickname: string): void {
        Object.values(this.activeRooms).forEach((room) => {
            const p = Object.values(room.players).find(pl => pl.userId === userId);
            if (!p) return;
            p.nickname = nickname;
            this.updateLobby(room.id);
        });
    }


    public toggleReady(socket: Socket, roomId: string): void {
        const room = this.activeRooms[roomId];
        if (room && room.players[socket.id] && !room.isStarted) {
            const player = room.players[socket.id];
            player.isReady = !player.isReady;
            this.updateLobby(roomId);
        }
    }

    // LOBBI CHATI: xabarni xonadagi hammaga tarqatish
    public sendChatMessage(socket: Socket, roomId: string, text: string): void {
        const room = this.activeRooms[roomId];
        const player = room?.players[socket.id];
        if (!room || !player) return;

        // Bo'sh yoki juda uzun xabarlarni rad etamiz (spam/xato oldini olish)
        const trimmed = (text || '').toString().trim().slice(0, 200);
        if (!trimmed) return;
        // Admin chat taqig'i qo'ygan - xabar tarqatilmaydi, faqat o'ziga ogohlantirish
        if (db.isMuted(player.mutedUntil)) { socket.emit('chatMuted', { until: player.mutedUntil }); return; }

        this.io.to(roomId).emit('lobbyChatMessage', {
            nickname: player.nickname,
            text: trimmed,
            timestamp: Date.now()
        });
    }

    // ENTER/SICHQONCHA BOSIB TURILGANDA: avtomatik-otish holatini yoqamiz
    public startAttack(socket: Socket, roomId: string, angle: number): void {
        const room = this.activeRooms[roomId];
        if (!room || !room.isStarted || this.isLoading(room) || RoomManager.frozen(room)) return;
        if (!Number.isFinite(angle)) return;

        const player = room.players[socket.id];
        if (!player || player.isDead) return; // O'lgan ("arvoh") o'yinchi hujum qila olmaydi

        player.isHoldingAttack = true;
        player.lastAttackAngle = angle;

        // Bosilgan zahoti, agar imkon bo'lsa, birinchi zarbani darrov beramiz
        this.tryFireAttack(player, room);
    }

    // ENTER/SICHQONCHA QO'YIB YUBORILGANDA: avtomatik-otishni to'xtatamiz
    public stopAttack(socket: Socket, roomId: string): void {
        const room = this.activeRooms[roomId];
        if (!room) return;
        const player = room.players[socket.id];
        if (!player) return;
        player.isHoldingAttack = false;
    }

    // Haqiqiy zarbani berish (stamina va cooldown yetarli bo'lsagina)
    // Bu funksiya ham darhol bosilganda, ham har tikda (auto-fire) chaqiriladi
    public tryFireAttack(player: PlayerState, room: RoomState): void {
        if (player.attackCooldown > 0) return;

        const charLogic = getCharacterLogic(player.characterType);
        if (!charLogic.canAttack(player)) return;
        if (player.stamina < BaseCharacter.staminaCost(player, charLogic.attackStaminaCost)) {
            const now = Date.now();
            if (now - (player.lastNoStaminaAt || 0) >= 800) {
                player.lastNoStaminaAt = now;
                this.io.to(player.id).emit('noStamina');
            }
            return;
        }

        BaseCharacter.spendStamina(player, charLogic.attackStaminaCost);
        player.attackCooldown = charLogic.attackCooldownTicks(player);

        charLogic.handleAttack(player, room, player.lastAttackAngle);
        room.flushNow = true;   // yangi o'q keyingi tikdayoq klientga ketsin (2 tik kutmasdan)
    }

    // SHIFT BOSIB TURILGANDA: barcha personajlar uchun umumiy - qobiliyat faollashadi
    // LEVEL UP: o'yin to'xtab turibdi - hujum/qobiliyat qabul qilinmaydi
    public static frozen(room: RoomState): boolean { return !!room.freezeUntil && Date.now() < room.freezeUntil; }
    public startAbility(socket: Socket, roomId: string): void {
        const room = this.activeRooms[roomId];
        if (!room || !room.isStarted || this.isLoading(room) || RoomManager.frozen(room)) return;

        const player = room.players[socket.id];
        if (!player || player.isDead) return; // O'lgan ("arvoh") o'yinchi qobiliyat ishlata olmaydi
        if (player.stamina <= 0) return; // Stamina tugagan bo'lsa yoqilmaydi
        if (!hasPerk(player, 'shift')) return; // SHIFT qobiliyati 1-darajada ochiladi

        player.isHoldingAbility = true;
    }

    // SHIFT QO'YIB YUBORILGANDA: qobiliyat effekti bekor qilinadi
    public stopAbility(socket: Socket, roomId: string): void {
        const room = this.activeRooms[roomId];
        if (!room) return;

        const player = room.players[socket.id];
        if (!player) return;

        player.isHoldingAbility = false;
        const charLogic = getCharacterLogic(player.characterType);
        charLogic.releaseHeldAbility(player, room);
        // Archer 10-daraja: qo'yib yuborilgach yana 2 soniya ko'rinmas
        if (player.characterType === 'archer' && hasPerk(player, 'invis2') && !player.isDead) {
            player.isInvisible = true;
            player.invisLinger = INVIS_LINGER_TICKS;
        }
    }

    // O'yinchi xonadan chiqib ketganda yoki uzilganda
    // "Lobbidan chiqish" tugmasi - darhol chiqaradi (uzilishdagi kutish yo'q)
    public leavePlayer(socket: Socket): void {
        Object.keys(this.activeRooms).forEach((roomId) => {
            if (this.activeRooms[roomId].players[socket.id]) socket.leave(roomId);
        });
        this.leavePlayerById(socket.id);
    }

    private leavePlayerById(socketId: string): void {
        const pending = this.pendingLeaves.get(socketId);
        if (pending) {
            clearTimeout(pending);
            this.pendingLeaves.delete(socketId);
        }
        Object.keys(this.activeRooms).forEach((roomId) => {
            const room = this.activeRooms[roomId];
            if (room.players[socketId]) {
                const player = room.players[socketId];

                // Faol sessiya xaritasidan ham o'chiramiz (aks holda hisob "band" bo'lib qolaveradi)
                if (player.userId !== null && this.activeUserSockets.get(player.userId) === socketId) {
                    this.activeUserSockets.delete(player.userId);
                }

                delete room.players[socketId];
                // Yuklanishini kutayotgan edik - endi kutilmaydi
                if (this.isLoading(room)) {
                    room.loadingIds = room.loadingIds!.filter(id => id !== socketId);
                    if (room.loadingIds.length === 0) this.finishLoading(roomId); else this.sendLoadingStatus(roomId);
                }

                // XONA EGASI chiqib ketsa - xo'jayinlik boshqaga O'TMAYDI: xona yopiladi,
                // qolganlar menyuga qaytadi (sahifani yangilasa - 15s ichida o'rni qaytadi)
                if (room.hostId === socketId) {
                    this.closeRoom(roomId);
                    return;
                }
                this.updateLobby(roomId);
                this.broadcastRoomList();
            }
        });
    }

    // PAUZA: faqat xonada YOLG'IZ o'yinchi bo'lsa (bir necha kishida o'yin to'xtamaydi)
    public setPaused(socket: Socket, roomId: string, paused: boolean): void {
        const room = this.activeRooms[roomId];
        if (!room || !room.isStarted || !room.players[socket.id]) return;
        if (paused && Object.keys(room.players).length !== 1) return;
        room.paused = paused;
    }

    // KICK: xona egasi boshqa o'yinchini xonadan chiqaradi (o'yin paytida ham). Chiqarilgan o'yinchi
    // (hisobi yoki brauzer oynasi bo'yicha) bu xonaga qayta kira olmaydi
    public kickPlayer(socket: Socket, roomId: string, targetId: string): void {
        const room = this.activeRooms[roomId];
        if (!room || room.hostId !== socket.id || typeof targetId !== 'string' || targetId === socket.id) return;
        const target = room.players[targetId];
        if (!target || target.isAdmin) return;   // adminni xonadan chiqarib bo'lmaydi
        room.kicked = room.kicked || [];
        if (target.userId !== null) room.kicked.push('u:' + target.userId);
        if (target.clientId) room.kicked.push('c:' + target.clientId);
        this.io.to(targetId).emit('kickedFromRoom', { roomName: room.name });
        this.io.sockets.sockets.get(targetId)?.leave(roomId);
        this.leavePlayerById(targetId);
        this.sendChatSystem(roomId, target.nickname);
    }
    private sendChatSystem(roomId: string, nickname: string): void {
        this.io.to(roomId).emit('playerKicked', { nickname });
    }

    // ===== ADMIN (Telegram bot) uchun =====
    // Onlayn holat: xonalar, ulardagi o'yinchilar, o'yin ketayotgan xonalar
    public onlineStats(): { rooms: number, playing: number, players: number, loggedIn: number } {
        const rooms = Object.values(this.activeRooms);
        const players = rooms.reduce((a, r) => a + Object.keys(r.players).length, 0);
        const loggedIn = rooms.reduce((a, r) => a + Object.values(r.players).filter(p => p.userId !== null).length, 0);
        return { rooms: rooms.length, playing: rooms.filter(r => r.isStarted).length, players, loggedIn };
    }
    // ADMIN PANEL: hamma faol xonalar (yopiqlari ham) - kod, o'yinchilar, xarita
    public adminRooms() {
        return Object.values(this.activeRooms).map(r => ({
            code: r.id, name: r.name, isPrivate: !!r.isPrivate, isStarted: !!r.isStarted,
            mapIndex: r.selectedLevel, mapName: getMapById(r.selectedLevel).name,
            full: Object.keys(r.players).length >= RoomManager.MAX_PLAYERS,
            players: Object.values(r.players).map(p => ({ id: p.id, nickname: p.nickname, characterType: p.characterType, level: p.level || 0,
                isAdmin: !!p.isAdmin, isHost: p.id === r.hostId, registered: p.userId !== null }))
        }));
    }
    // Admin tokeni tasdiqlandi - shu socket xonada bo'lsa, "ADMIN" belgisi darhol chiqadi
    public markAdmin(socket: Socket): void {
        Object.values(this.activeRooms).forEach(room => {
            const p = room.players[socket.id];
            if (!p || p.isAdmin) return;
            p.isAdmin = true;
            this.updateLobby(room.id);
        });
    }
    // Shu hisob hozir qaysi xonada (onlayn bo'lsa)
    public findOnline(userId: string): { roomId: string, roomName: string, socketId: string } | null {
        for (const room of Object.values(this.activeRooms)) {
            const p = Object.values(room.players).find(pl => pl.userId === userId);
            if (p) return { roomId: room.id, roomName: room.name, socketId: p.id };
        }
        return null;
    }
    // Bloklangan hisobni o'yindan chiqarish (xo'jayin bo'lsa - xona yopiladi)
    public kickUser(userId: string, reason: string): boolean {
        const where = this.findOnline(userId);
        if (!where) return false;
        this.io.to(where.socketId).emit('accountBanned', { reason });
        this.io.sockets.sockets.get(where.socketId)?.leave(where.roomId);
        this.leavePlayerById(where.socketId);
        return true;
    }
    // ===== ADMIN PANEL: xonalarni boshqarish va onlayn o'yinchilarga ta'sir =====
    // Onlayn hisoblar (filtr "onlayn" uchun)
    public onlineUserIds(): string[] {
        const ids: string[] = [];
        Object.values(this.activeRooms).forEach(r => Object.values(r.players).forEach(p => { if (p.userId !== null) ids.push(p.userId); }));
        return ids;
    }
    // Admin o'yinchini xonadan chiqaradi (xo'jayin bo'lsa - xona yopiladi). Qayta kira oladi
    public adminKick(roomId: string, playerId: string): string | null {
        const room = this.activeRooms[roomId];
        const target = room && room.players[playerId];
        if (!room || !target) return null;
        this.io.to(playerId).emit('kickedFromRoom', { roomName: room.name, byAdmin: true });
        this.io.sockets.sockets.get(playerId)?.leave(roomId);
        this.leavePlayerById(playerId);
        if (this.activeRooms[roomId]) this.sendChatSystem(roomId, target.nickname);
        return target.nickname;
    }
    // Admin xonani yopadi - hamma bosh menyuga
    public adminCloseRoom(roomId: string): boolean {
        if (!this.activeRooms[roomId]) return false;
        this.closeRoom(roomId, 'admin');
        return true;
    }
    // Admin raundni to'xtatadi - hamma xona lobbisiga qaytadi (xona saqlanadi)
    public adminStopRound(roomId: string): boolean {
        const room = this.activeRooms[roomId];
        if (!room || !room.isStarted) return false;
        const host = this.io.sockets.sockets.get(room.hostId);
        if (!host) return false;
        this.returnToLobby(host, roomId);
        this.io.to(roomId).emit('roundStoppedByAdmin');
        return true;
    }
    // Chat taqig'i o'zgardi - onlayn bo'lsa darhol
    public notifyMute(userId: string, until: number): void {
        Object.values(this.activeRooms).forEach(room => Object.values(room.players).forEach(p => {
            if (p.userId === userId) { p.mutedUntil = until; this.io.to(p.id).emit('chatMuted', { until, changed: true }); }
        }));
    }
    // La'nat olib tashlandi - o'yindagi holat ham darhol (jon tiklanadi / stamina tez to'ladi)
    public notifyCurses(userId: string, kinds: ('acid' | 'bolt')[]): void {
        Object.values(this.activeRooms).forEach(room => Object.values(room.players).forEach(p => {
            if (p.userId !== userId) return;
            if (kinds.includes('acid')) p.acidCurse = false;
            if (kinds.includes('bolt')) p.boltCurse = false;
            this.io.to(p.id).emit('adminNotice', { key: 'admin_curse_removed' });
        }));
    }
    // Admin hisob nomini o'zgartirdi - xonada ham, o'yinchining o'z brauzerida ham
    public notifyRename(userId: string, nickname: string): void {
        this.renameOnline(userId, nickname);
        const where = this.findOnline(userId);
        if (where) this.io.to(where.socketId).emit('nicknameChanged', { nickname });
    }
    // Admin sovg'a berdi
    public notifyGift(userId: string): void {
        const where = this.findOnline(userId);
        if (where) this.io.to(where.socketId).emit('adminNotice', { key: 'admin_gift_received' });
    }
    // Admin darajani o'zgartirgan bo'lsa - o'yinchi onlayn bo'lsa, imkoniyatlari darhol yangilanadi
    public notifyLevel(userId: string, charXp: { [c: string]: number }): void {
        Object.values(this.activeRooms).forEach((room) => {
            const p = Object.values(room.players).find(pl => pl.userId === userId);
            if (!p) return;
            p.charXp = { ...charXp };
            RoomManager.refreshPerks(p);
            this.updateLobby(room.id);
            // Xo'jayin darajasi o'zgardi - arena qulfi darhol yangilanadi
            if (room.hostId === p.id && !room.isStarted) { this.applyHostProgress(room, false); this.broadcastLevelInfo(room.id); }
        });
    }
    // Admin xaritalarni ochib bergan bo'lsa - o'yinchi onlayn bo'lsa, lobbisi darhol yangilanadi
    public notifyUnlocked(userId: string, level: number): void {
        Object.values(this.activeRooms).forEach((room) => {
            const p = Object.values(room.players).find(pl => pl.userId === userId);
            if (!p) return;
            p.unlockedLevel = level;
            if (room.hostId === p.id) { this.applyHostProgress(room, false); this.broadcastLevelInfo(room.id); }
        });
    }
    // Admin tanga bergan bo'lsa - o'yinchi onlayn bo'lsa, balansi darhol yangilanadi
    public notifyCoins(userId: string, amount: number, totalCoins: number): void {
        const where = this.findOnline(userId);
        if (where) this.io.to(where.socketId).emit('coinsUpdated', { amount, totalCoins });
    }

    // XONANI YOPISH (egasi chiqib ketdi): qolganlarga xabar, ular xonadan chiqariladi
    private closeRoom(roomId: string, reason: 'host_left' | 'admin' = 'host_left'): void {
        const room = this.activeRooms[roomId];
        if (!room) return;
        this.io.to(roomId).emit('roomClosed', { reason });
        Object.values(room.players).forEach((p) => {
            const pending = this.pendingLeaves.get(p.id);
            if (pending) { clearTimeout(pending); this.pendingLeaves.delete(p.id); }
            if (p.userId !== null && this.activeUserSockets.get(p.userId) === p.id) this.activeUserSockets.delete(p.userId);
            this.io.sockets.sockets.get(p.id)?.leave(roomId);
        });
        delete this.activeRooms[roomId];
        this.broadcastRoomList();
    }

    // XARITANI BOSHLASH: lobbidan (xo'jayin "Start" bosganda) ham, oldingi xarita
    // o'tilgach AVTOMATIK davom etganda ham shu ishlatiladi. Davom etganda
    // qahramonlar o'sha joyida qoladi (xaritalar bir-biriga ulangan)
    public startLevel(roomId: string, continued: { fromLevel: number, winnerNickname: string, coinsAwarded: number, xpGained?: number } | null = null): void {
        const room = this.activeRooms[roomId];
        if (!room) return;
        const map = getMapById(room.selectedLevel);
        room.isStarted = true;
        room.isOver = false;
        room.advancing = false;
        db.bumpStat({ ['plays.' + room.selectedLevel]: 1 });   // admin statistikasi: qaysi xarita ko'p o'ynaladi

        Object.values(room.players).forEach((p, i) => {
            p.kills = 0;
            p.isDead = false;
            p.respawnTimer = 0;
            p.isInvisible = false;
            p.speedMultiplier = 1;
            p.isHoldingAbility = false;
            p.isHoldingAttack = false;
            RoomManager.refreshPerks(p);
            p.hp = p.maxHp || BASE_HP;
            p.stamina = p.maxStamina || 100;
            p.specialTicks = 0;
            p.specialCooldown = 0;
            p.invisLinger = 0;
            p.ammo = shotgunMagOf(p);
            p.reloadTicks = 0;
            // Har xaritada o'z boshlang'ich joyi: oldingi xaritadagi joy yangi xaritada devor, to'siq
            // yoki chuqurlik ichiga to'g'ri kelib, qahramon tiqilib qolardi
            const spawn = map.playerSpawns[i % map.playerSpawns.length];
            p.x = spawn.x;
            p.y = spawn.y;
        });

        // Botlar / ilon / qutilar / minalar - xarita turiga qarab
        GameEngine.startRound(room, map);
        room.paused = false;

        room.round = (room.round || 0) + 1;
        this.io.to(roomId).emit('gameStarted', { map: this.mapPayload(room), continued, round: room.round });
        // YUKLANISH: hamma o'yinchi xaritani yuklab bo'lguncha raund boshlanmaydi (ko'pi bilan 15s)
        room.loadingIds = Object.keys(room.players);
        room.loadDeadline = Date.now() + RoomManager.LOAD_WAIT_MS;
        this.sendLoadingStatus(roomId);
        this.broadcastRoomList();
    }

    // O'yinchining brauzeri xaritani yuklab bo'ldi
    public markLoaded(socket: Socket, roomId: string): void {
        const room = this.activeRooms[roomId];
        if (!room || !room.players[socket.id]) return;
        if (!room.loadingIds || room.loadingIds.length === 0) {
            socket.emit('roundGo'); // raund allaqachon ketyapti (masalan, qayta ulangan) - darhol o'ynaydi
            return;
        }
        room.loadingIds = room.loadingIds.filter(id => id !== socket.id);
        if (room.loadingIds.length === 0) this.finishLoading(roomId);
        else this.sendLoadingStatus(roomId);
    }
    private sendLoadingStatus(roomId: string): void {
        const room = this.activeRooms[roomId];
        if (!room) return;
        const total = Object.keys(room.players).length;
        this.io.to(roomId).emit('loadingStatus', { ready: total - (room.loadingIds || []).length, total });
    }
    // Hamma tayyor (yoki kutish vaqti tugadi) - raund boshlanadi
    public finishLoading(roomId: string): void {
        const room = this.activeRooms[roomId];
        if (!room) return;
        room.loadingIds = [];
        this.io.to(roomId).emit('roundGo');
    }
    public isLoading(room: RoomState): boolean {
        return !!room.loadingIds && room.loadingIds.length > 0;
    }

    // SUHBAT SAHNASI (bozor): sotuvchi oldidagi tirik qahramon E bossa boshlanadi va
    // xonadagi HAMMAGA bir vaqtda ko'rsatiladi
    public talkToSeller(socket: Socket, roomId: string): void {
        const room = this.activeRooms[roomId];
        const story = room && getMapById(room.selectedLevel).story;
        const p = room?.players[socket.id];
        if (!room || !story || !room.isStarted || room.isOver || room.cutscene || !p || p.isDead) return;
        if (Math.abs(p.x - story.sellerX) > story.talkRange) return;
        room.cutscene = { line: 0, starterId: socket.id, lastAdvanceAt: Date.now() };
        this.io.to(roomId).emit('cutscene', { line: 0 });
    }

    // Keyingi qator (xonadagi istalgan o'yinchi E bosadi). Bir necha kishi bir vaqtda
    // bossa - qator ikki marta o'tib ketmasligi uchun qisqa kutish. Oxirgi qatordan
    // keyin - xarita o'tildi (keyingi xaritaga avtomatik o'tiladi)
    public advanceCutscene(socket: Socket, roomId: string): void {
        const room = this.activeRooms[roomId];
        const story = room && getMapById(room.selectedLevel).story;
        if (!room || !story || !room.cutscene || !room.players[socket.id] || room.isOver) return;
        const now = Date.now();
        if (now - room.cutscene.lastAdvanceAt < RoomManager.CUTSCENE_ADVANCE_COOLDOWN_MS) return;
        room.cutscene.lastAdvanceAt = now;
        room.cutscene.line++;
        if (room.cutscene.line >= story.lineCount) {
            const starter = room.players[room.cutscene.starterId] ? room.cutscene.starterId : socket.id;
            this.declareWinner(roomId, starter).catch(err => console.error('declareWinner xatosi:', err));
            return;
        }
        this.io.to(roomId).emit('cutscene', { line: room.cutscene.line });
    }

    // Sahifani yangilagan (yoki qayta ulangan) o'yinchiga hozirgi suhbat qatori
    public sendCutsceneState(socket: Socket, roomId: string): void {
        const room = this.activeRooms[roomId];
        if (room && room.cutscene) socket.emit('cutscene', { line: room.cutscene.line });
    }

    // Klientga xaritani qurish uchun kerakli ma'lumot (shu raunddagi devorlar bilan)
    private mapPayload(room: RoomState) {
        const map = getMapById(room.selectedLevel);
        return {
            id: map.id,
            name: map.name,
            mode: map.mode,
            mapWidth: map.mapWidth,
            platforms: map.platforms,
            walls: room.walls,
            pits: map.pits || [],
            chase: map.chase || null,
            apples: map.apples || null,
            story: map.story || null,
            market: map.market || null,
            boss: map.boss || null,
            forest: map.forest || null,
            stones: map.stones || null,
            gorilla: map.gorilla || null,
            fatElf: map.fatElf || null,
            underworld: map.underworld || null,
            arena: map.arena || null,
            giantFlower: map.giantFlower || null,
            lift: map.lift || null,
            farm: map.farm || null,
            back: map.back || null,
            tnt: map.tnt || null,
            robot: map.robot || null,
            vend: map.vend || null,
            sky: map.sky || null,
            pvp: map.pvp || null,
            shop: map.shop || null,
            myFarm: map.myFarm || null,
            squid: map.squid || null,
            doors: map.doors || null,
            season: map.season || 1,
            groundColor: map.groundColor,
            accentColor: map.accentColor
        };
    }

    // O'yin g'olibini e'lon qilish: tanga berish (agar hisobi bo'lsa) va xonani
    // yangi raund uchun tayyorlash
    public async declareWinner(roomId: string, winnerId: string): Promise<void> {
        const room = this.activeRooms[roomId];
        if (!room) return;

        const winner = room.players[winnerId];
        if (!winner) return;

        db.bumpStat({ ['wins.' + room.selectedLevel]: 1 });
        room.isOver = true;
        room.isStarted = false;
        // Keyingi xaritaga o'tilyapti (bazaga yozish kutilmoqda) - shu oraliqda begona o'yinchi kirib olmasin
        room.advancing = true;

        // Season 2 boss xaritalari (maps.ts: bossCoins): bossni yengishda QATNASHGAN HAR BIR o'yinchiga
        // shuncha tanga. Oddiy xaritalarda - faqat g'olibga odatdagi g'alaba tangasi
        const bossCoins = getMapById(room.selectedLevel).bossCoins;
        const winCoins = bossCoins ?? RoomManager.WIN_REWARD_COINS;
        let updatedCoins: number | null = null;
        // Xarita tangasi - har hisobga shu xarita uchun faqat BIR MARTA (qayta o'tilsa berilmaydi)
        let winnerPaid = 0;
        if (winner.userId !== null) {
            const updated = await db.claimMapCoins(winner.userId, room.selectedLevel, winCoins);
            if (updated) { updatedCoins = updated.coins; winnerPaid = winCoins; }
        }
        if (bossCoins) {
            for (const p of Object.values(room.players)) {
                if (p.id === winnerId || p.userId === null) continue;
                const updated = await db.claimMapCoins(p.userId, room.selectedLevel, bossCoins);
                if (updated) this.io.to(p.id).emit('coinsUpdated', { amount: bossCoins, totalCoins: updated.coins });
            }
        }

        // PROGRESS - HAR KIMNING O'Z HISOBIDA: xonadagi har o'yinchiga +10 XP; aynan o'zining
        // "chegara" xaritasini o'tgan bo'lsa - keyingi xarita ochiladi. Xotirada darhol (keyingi
        // xaritaga o'tish shunga tayanadi), bazada - hisobli o'yinchilar uchun
        const clearedId = room.selectedLevel;
        const maxLevel = SEASON_MAP_COUNT - 1;
        // Tajriba: oddiy xarita +10, boss xaritalari ko'proq (maps.ts: xpReward)
        // Season 2: har xarita 25 XP (boss - 50, xaritada ko'rsatilgan); Season 1 - XP_PER_MAP
        const clearedMap = getMapById(clearedId);
        const xpGain = clearedMap.xpReward ?? ((clearedMap.season || 1) >= 2 ? 25 : db.XP_PER_MAP);
        let levelCleared = false;
        Object.values(room.players).forEach((p) => {
            const levelBefore = p.level || 0;
            const pXp = xpGain + RoomManager.xpBoostOf(p);   // XP kuchaytirish bonusi
            p.xp = (p.xp || 0) + pXp;
            p.charXp = { ...(p.charXp || {}) };
            p.charXp[p.characterType] = (p.charXp[p.characterType] || 0) + pXp;
            RoomManager.refreshPerks(p);
            this.grantLevelUpCoins(p, levelBefore, room, false);
            if (!clearedMap.bonus && clearedId + 1 > p.unlockedLevel) {
                p.unlockedLevel = clearedId + 1;
                if (p.id === room.hostId && clearedId < maxLevel) levelCleared = true;
            }
            if (p.userId !== null && !clearedMap.bonus) {
                db.recordMapClear(p.userId, clearedId, p.characterType, pXp).catch(err => console.error('recordMapClear xatosi:', err));
                // KO'NIKMA BALLI: shu xaritani shu PERSONAJ bilan hisobda birinchi marta o'tganda +1
                // (qayta o'ynasa - ball yo'q; bazada personaj bo'yicha tekshiriladi)
                db.awardSkillPointIfNew(p.userId, clearedId, p.characterType).catch(err => {
                    console.error('awardSkillPointIfNew xatosi:', err);
                });
            }
        });
        this.applyHostProgress(room, false);
        this.updateLobby(roomId);

        // XARITALAR ULANGAN: keyingi xarita bo'lsa, lobbiga qaytmasdan darhol
        // o'sha joydan davom etiladi. Keyin hamma yutqazsa - lobbida aynan shu
        // (keyingi) xarita tanlangan bo'lib qoladi, ya'ni o'sha joydan qayta boshlanadi
        const coinsAwarded = winnerPaid;
        if (room.selectedLevel + 1 < SEASON_MAP_COUNT) {
            const fromLevel = room.selectedLevel;
            room.selectedLevel++;
            if (updatedCoins !== null) {
                this.io.to(winnerId).emit('coinsUpdated', { amount: coinsAwarded, totalCoins: updatedCoins });
            }
            this.broadcastLevelInfo(roomId);
            this.startLevel(roomId, { fromLevel, winnerNickname: winner.nickname, coinsAwarded, xpGained: xpGain });
            return;
        }

        this.io.to(roomId).emit('gameOver', {
            isLoss: false,
            fromLevel: room.selectedLevel,   // hozirgina yutilgan xarita (klientda "o'tildi" tantanasi)
            xpGained: xpGain,
            winnerId: winnerId,
            winnerNickname: winner.nickname,
            coinsAwarded: winnerPaid,
            totalCoins: updatedCoins,
            levelCleared: levelCleared,
            unlockedLevel: room.unlockedLevel
        });
        room.advancing = false;   // mavsum tugadi - lobbiga qaytildi, yana kirish mumkin

        // Barcha o'yinchilarni yangi raund uchun tozalab qo'yamiz
        Object.values(room.players).forEach((p) => {
            p.kills = 0;
            p.hp = p.maxHp || BASE_HP;
            p.isDead = false;
            p.respawnTimer = 0;
            p.isReady = false; // Keyingi raund uchun hamma qayta "Tayyor" bosishi kerak
        });

        // Xonadagilarni o'sha avvalgi lobbiga qaytarish uchun lobbi holatini yangilaymiz
        this.updateLobby(roomId);
        this.broadcastLevelInfo(roomId);
        this.broadcastRoomList();
    }

    // QUTI SINDIRILDI: sindirgan o'yinchiga tanga (hisobi bo'lsa bazaga yoziladi,
    // mehmonga - faqat ekranda ko'rsatiladi, saqlanmaydi)
    public async awardCrateCoins(roomId: string, playerId: string, amount: number): Promise<void> {
        const player = this.activeRooms[roomId]?.players[playerId];
        if (!player) return;

        let totalCoins: number | null = null;
        if (player.userId !== null) {
            const updated = await db.addCoins(player.userId, amount);
            if (updated) totalCoins = updated.coins;
        }
        this.io.to(playerId).emit('coinsUpdated', { amount, totalCoins });
    }

    // O'LDIRISH / BOSS MUKOFOTI: o'yinchiga tanga va XP (hisobi bo'lsa - bazaga ham)
    // Bir martalik yutuq: akkauntda (mehmon - shu o'yin davomida) birinchi marta bo'lsa - XP va yutuq oynasi
    public async grantAchievement(roomId: string, playerId: string, key: string, xp: number): Promise<void> {
        const player = this.activeRooms[roomId]?.players[playerId];
        if (!player) return;
        let fresh: boolean;
        if (player.userId !== null) fresh = await db.grantAchievement(player.userId, key);
        else {
            const got = (player as any).achievements || ((player as any).achievements = []);
            fresh = !got.includes(key);
            if (fresh) got.push(key);
        }
        if (!fresh) return;
        this.io.to(playerId).emit('achievement', { key, xp });
        await this.awardReward(roomId, playerId, 0, xp);
    }

    // ODDIY DARAJA MUKOFOTI: yangi imkoniyat ochilmaydigan darajaga chiqqanda (masalan 4, 6-9, 11-14) tanga.
    // 4-daraja - 200, 6 va undan yuqori - 100 x (daraja - 3): 6 -> 300, 7 -> 400, 8 -> 500, 9 -> 600, 11 -> 800 ...
    public static plainLevelCoins(characterType: string, level: number): number {
        if (level < 4 || (PERK_TABLE[characterType] || []).some(pk => pk.level === level)) return 0;
        if (level >= 16) return 100 + 10 * (level - 16);   // 16-darajadan - kamroq: 100, 110, ... 930
        return level === 4 ? 200 : 100 * (level - 3);
    }
    // Daraja oshdi: oraliqdagi har oddiy daraja uchun tanga (faqat hisobli o'yinchiga - mehmonda tanga saqlanmaydi)
    public static readonly LEVEL_UP_FREEZE_MS = 2500;
    // freeze: o'yin davomida (kill/arena) - nur tushadi va o'yin hamma uchun to'xtaydi; xarita o'tilganda - faqat xabar
    private grantLevelUpCoins(p: PlayerState, levelBefore: number, room?: RoomState, freeze = false): void {
        const after = p.level || 0;
        if (after <= levelBefore) return;
        if (room) {
            const ms = freeze ? RoomManager.LEVEL_UP_FREEZE_MS : 0;
            if (freeze) room.freezeUntil = Math.max(room.freezeUntil || 0, Date.now() + ms);
            this.io.to(room.id).emit('levelUp', { id: p.id, level: after, ms });
        }
        if (p.userId === null) return;
        let coins = 0;
        for (let L = levelBefore + 1; L <= after; L++) coins += RoomManager.plainLevelCoins(p.characterType, L);
        if (coins <= 0) return;
        db.addCoins(p.userId, coins).then((u) => {
            if (!u) return;
            this.io.to(p.id).emit('coinsUpdated', { amount: coins, totalCoins: u.coins });
            this.io.to(p.id).emit('levelReward', { level: after, coins });
        }).catch(err => console.error('levelReward xatosi:', err));
    }

    // RANETS AVTOMATI (S2 map-9): tinch turgan avtomatdan ranets sotib olish (shu xarita uchun)
    public async vendBuy(socket: Socket, roomId: string): Promise<void> {
        const room = this.activeRooms[roomId];
        const p = room?.players[socket.id];
        const map = room ? getMapById(room.selectedLevel) : null;
        const reply = (d: object) => socket.emit('vendResult', d);
        if (!room || !p || !map || !map.vend || !room.vend || !room.isStarted || p.isDead) return;
        if (room.vend.state !== 'idle') { reply({ success: false, message: 'vend_broken_msg' }); return; }
        if (p.jetpack) { reply({ success: false, message: 'vend_have' }); return; }
        if (Math.abs(p.x - map.vend.machineX) > map.vend.buyRange + 40) { reply({ success: false, message: 'shop_too_far' }); return; }
        if (p.userId === null) { reply({ success: false, message: 'shop_need_account' }); return; }
        // Bir vaqtda ikki so'rov (E tez-tez bosilsa) - ikki marta to'lanmasin
        if (p.vendBuying) return;
        p.vendBuying = true;
        const v = room.vend, price = map.vend.price, userId = p.userId;
        let u: db.UserRecord | null = null;
        try { u = await db.spendCoins(userId, price); } finally { p.vendBuying = false; }
        if (!u) { reply({ success: false, message: 'err_not_enough_coins' }); return; }
        // Shu orada xarita tugagan / qayta boshlangan yoki avtomatning jahli chiqqan bo'lsa - pul qaytariladi
        if (!this.activeRooms[roomId] || room.vend !== v || v.state !== 'idle' || p.jetpack || !room.players[p.id]) {
            const back = await db.addCoins(userId, price);
            reply({ success: false, message: 'vend_broken_msg' });
            if (back) socket.emit('coinsUpdated', { amount: 0, totalCoins: back.coins });
            return;
        }
        p.jetpack = true;
        reply({ success: true, coins: u.coins });
        socket.emit('coinsUpdated', { amount: -map.vend.price, totalCoins: u.coins });
    }
    // Singan avtomatdan tushgan ranetsni olish (E)
    public vendPick(socket: Socket, roomId: string): void {
        const room = this.activeRooms[roomId];
        const p = room?.players[socket.id];
        if (!room || !p || !room.vend || room.vend.state !== 'broken' || p.isDead || p.jetpack) return;
        const v = room.vend;
        let best = -1, bd = 70;
        v.jets.forEach((j, i) => { const dd = Math.abs(j.x - p.x); if (dd <= bd && Math.abs(j.y - (p.y + 24)) < 90) { bd = dd; best = i; } });
        if (best < 0) return;
        const jet = v.jets.splice(best, 1)[0];
        p.jetpack = true;
        this.io.to(roomId).emit('vendPicked', { id: p.id, jet: jet.id });
    }

    // DO'KON: Eliksir / Chip sotib olish (faqat do'kon xaritasida, peshtaxta yonida, hisobli o'yinchi)
    public async shopBuy(socket: Socket, roomId: string, item: unknown): Promise<void> {
        const room = this.activeRooms[roomId];
        const p = room?.players[socket.id];
        const map = room ? getMapById(room.selectedLevel) : null;
        const reply = (d: object) => socket.emit('shopResult', d);
        if (!room || !p || !map || !map.shop || !room.isStarted || !(['elixir', 'chip', 'rod', 'net', 'fert', 'water'].includes(item as string) || FARM_DECOR.some(d => 'decor_' + d.id === item) || HOME_ITEMS.some(h => 'home_' + h.id === item))) return;
        if (Math.abs(p.x - map.shop.counterX) > map.shop.range + 40) { reply({ success: false, item, message: 'shop_too_far' }); return; }
        if (p.userId === null) { reply({ success: false, item, message: 'shop_need_account' }); return; }
        // Fermer uyi jihozlari (bir marta): uyga kirib joylashtiriladi
        if (typeof item === 'string' && item.startsWith('home_')) {
            const h = HOME_ITEMS.find(x => 'home_' + x.id === item);
            if (!h) return;
            const t = await db.buyHomeItem(p.userId, h.id, h.price);
            if (!t.success) { reply({ success: false, item, message: t.message }); return; }
            reply({ success: true, item, coins: t.coins });
            socket.emit('coinsUpdated', { amount: -h.price, totalCoins: t.coins });
            this.farmChanged(p.userId);
            return;
        }
        if (typeof item === 'string' && item.startsWith('decor_')) {
            const d = FARM_DECOR.find(x => 'decor_' + x.id === item);
            if (!d) return;
            const t = await db.buyDecor(p.userId, d.id, d.price);
            if (!t.success) { reply({ success: false, item, message: t.message }); return; }
            reply({ success: true, item, coins: t.coins });
            socket.emit('coinsUpdated', { amount: -d.price, totalCoins: t.coins });
            this.farmChanged(p.userId);
            return;
        }
        if (item === 'fert' || item === 'water') {
            const price = map.shop.prices[item] || 0;
            const t = await db.buyConsumable(p.userId, item, price);
            if (!t.success) { reply({ success: false, item, message: t.message }); return; }
            reply({ success: true, item, coins: t.coins, count: item === 'fert' ? t.farm!.fert : t.farm!.water });
            socket.emit('coinsUpdated', { amount: -price, totalCoins: t.coins });
            return;
        }
        if (item === 'rod' || item === 'net') {
            const price = map.shop.prices[item] || 0;
            const t = await db.buyFishTool(p.userId, item, price);
            if (!t.success) { reply({ success: false, item, message: t.message }); return; }
            reply({ success: true, item, coins: t.coins });
            socket.emit('coinsUpdated', { amount: -price, totalCoins: t.coins });
            return;
        }
        const kind = item === 'elixir' ? 'acid' : 'bolt';
        const curePrice = map.shop.prices[item as 'elixir' | 'chip'];
        const r = await db.buyCure(p.userId, kind, curePrice);
        if (!r.success || !r.user) { reply({ success: false, item, message: r.message }); return; }
        if (kind === 'acid') p.acidCurse = false; else p.boltCurse = false;
        reply({ success: true, item, coins: r.user.coins });
        socket.emit('coinsUpdated', { amount: -curePrice, totalCoins: r.user.coins });
    }

    // Admin faslni almashtirdi - ochiq fermalarga darhol yangi holat
    public farmSeasonChanged(): void {
        Object.keys(this.activeRooms).forEach((id) => { const r = this.activeRooms[id]; if (r && r.myFarm && r.isStarted) this.sendMyFarm(id); });
    }
    // ===== MY FARM: HOSTning fermasi; faqat host ishlaydi, qolganlar kuzatadi =====
    private static hostLevel(p: PlayerState | undefined): number {
        if (!p) return 0;
        return Math.max(0, ...Object.values(p.charXp || {}).map(x => db.xpLevel(x || 0)));
    }
    public sendMyFarm(roomId: string): void {
        const room = this.activeRooms[roomId];
        if (!room || !room.myFarm || !getMapById(room.selectedLevel).myFarm) return;   // xarita ferma emas
        const mf = room.myFarm;
        const host = room.players[room.hostId];
        const owner = host && host.userId !== null ? host.userId : null;
        if (owner !== mf.owner) { mf.owner = owner; mf.farm = null; mf.fishing = null; mf.shrooms = []; mf.mobs = []; mf.nextRaidAt = 0; mf.boss = null; mf.loadedFor = undefined; }
        if (owner && !mf.farm && !mf.loading) {
            mf.loading = true;
            db.getFarm(owner).then((f) => {
                const cur = this.activeRooms[roomId]?.myFarm;
                if (!cur) return;
                cur.loading = false;
                if (f && cur.owner === owner) { const first = !cur.loadedFor || cur.loadedFor !== owner; cur.farm = f; cur.loadedFor = owner; if (first) this.onFarmLoaded(roomId); this.sendMyFarm(roomId); }
            }).catch((err) => { console.error('getFarm xatosi:', err); mf.loading = false; });
        }
        mf.sig = room.hostId + '|' + Object.keys(room.players).length;
        const F = getMapById(room.selectedLevel).myFarm!;
        const fi = mf.fishing;
        this.io.to(roomId).emit('myFarmState', {
            now: Date.now(), hostPid: room.hostId, hostNick: host ? host.nickname : '', hostGuest: !owner, hostLevel: RoomManager.hostLevel(host),
            farm: mf.farm, rain: farmIsRaining(F, Date.now()), boss: !!mf.boss, offer: dailyOffer(Date.now()),
            season: currentFarmSeason(), growth: SEASON_GROWTH[currentFarmSeason()],
            level: mf.farm ? farmLevel(mf.farm.xp) : 0, cap: mf.farm ? farmCapacity(farmLevel(mf.farm.xp)) : 0,
            fishing: fi ? { state: fi.state, until: fi.until, fish: fi.state === 'bite' ? fi.fish : null } : null
        });
    }
    private farmBusy = new Set<string>();
    // Host ekadi / yig'adi / maydon va platforma ochadi / baliq tutadi
    public async farmAct(socket: Socket, roomId: string, action: unknown, k: unknown, arg: unknown): Promise<void> {
        const room = this.activeRooms[roomId];
        const p = room?.players[socket.id];
        const map = room ? getMapById(room.selectedLevel) : null;
        const reply = (d: object) => socket.emit('myFarmResult', { action, ...d });
        if (!room || !p || !map || !map.myFarm || !room.isStarted || !room.myFarm) return;
        if (!['plant', 'harvest', 'zone', 'dock', 'cast', 'reel', 'water', 'fert', 'orchard', 'orchardCut', 'tree', 'pick', 'orders', 'deliver', 'home', 'chest', 'decorStore'].includes(action as string)) return;
        if (room.hostId !== socket.id) { reply({ success: false, message: 'mf_host_only' }); return; }
        if (p.userId === null) { reply({ success: false, message: 'farm_need_account' }); return; }
        const mf = room.myFarm, F = map.myFarm, uid = p.userId;
        if (!mf.farm || mf.owner !== uid) { reply({ success: false, message: 'err_server' }); return; }
        const near = (x: number, r: number) => Math.abs(p.x - x) <= r + 40;
        // Inventar sig'imi (ferma darajasiga qarab): to'lgan bo'lsa yangi hosil/baliq olinmaydi
        const fd = mf.farm, used = Object.values(fd.bag).reduce((a, n) => a + n, 0) + fd.fishN, cap = farmCapacity(farmLevel(fd.xp));
        const addsItems = action === 'harvest' || action === 'pick' || action === 'cast' || (action === 'orchard' && !!fd.orchard[k as number]);
        if (addsItems && used >= cap) { reply({ success: false, message: 'inv_full', cap }); return; }
        const lvlBefore = farmLevel(fd.xp);
        if (this.farmBusy.has(uid)) return;
        this.farmBusy.add(uid);
        try {
            let r: any = null;
            if (action === 'plant' || action === 'harvest') {
                if (!Number.isInteger(k) || (k as number) < 0 || (k as number) >= FARM_PLOTS * FARM_ZONES || !near(farmPlotX(F, k as number), F.range)) { reply({ success: false, message: 'farm_too_far' }); return; }
                if (action === 'plant') {
                    const crop = F.crops.find(c => c.id === arg);
                    if (!crop) { reply({ success: false, message: 'err_bad_item' }); return; }
                    if (crop.level > RoomManager.hostLevel(p)) { reply({ success: false, message: 'mf_seed_locked' }); return; }
                    r = await db.farmPlant(uid, k as number, crop.id, crop.seed);
                    if (r.success) socket.emit('coinsUpdated', { amount: -crop.seed, totalCoins: r.coins });
                    if (r.success) { reply({ success: true, crop: crop.id, k }); this.farmHeroXp(roomId, p.id, RoomManager.FARM_XP_PLANT); }
                } else {
                    r = await db.farmHarvest(uid, k as number, (pl) => { const c = CROPS.find(x => x.id === pl.c); return !!c && farmGrown(F, pl.t, Date.now(), c.growMs, pl.w); }, F.goldenChance);
                    if (r.success) { reply({ success: true, crop: r.crop, k, n: r.n, golden: r.golden }); this.farmHeroXp(roomId, p.id, r.n * RoomManager.FARM_XP_PER_ITEM); }
                }
            } else if (action === 'water' || action === 'fert') {
                if (!Number.isInteger(k) || (k as number) < 0 || (k as number) >= FARM_PLOTS * FARM_ZONES || !near(farmPlotX(F, k as number), F.range)) { reply({ success: false, message: 'farm_too_far' }); return; }
                r = action === 'water' ? await db.farmWater(uid, k as number) : await db.farmFertilize(uid, k as number);
                if (r.success) { reply({ success: true, k }); this.io.to(roomId).emit('mfPlotFx', { k, kind: action }); }
            } else if (action === 'orchardCut') {
                // Daraxtni kesish: joy bo'shaydi, eski daraxt yo'qoladi (yangisini ekish mumkin)
                if (!Number.isInteger(k) || (k as number) < 0 || (k as number) >= orchardSlotsFor(farmLevel(fd.xp)) || !near(F.orchardX[k as number], 50)) { reply({ success: false, message: 'farm_too_far' }); return; }
                r = await db.orchardCut(uid, k as number);
                if (r.success) { reply({ success: true, k, cut: true }); this.io.to(roomId).emit('mfPlotFx', { k, kind: 'cut' }); }
            } else if (action === 'home' || action === 'chest' || action === 'decorStore') {
                // FERMER UYI (ichida): jihoz qo'yish / olish, yashik bilan almashish, tashqi bezakni yashikka olish
                if (Math.abs(p.x - F.houseX) > 120) { reply({ success: false, message: 'farm_too_far' }); return; }
                const a: any = arg && typeof arg === 'object' ? arg : {};
                if (action === 'home') {
                    const slot = HOME_SLOTS.find(s => s.id === a.slot);
                    const item = a.item === null ? null : HOME_ITEMS.find(h => h.id === a.item);
                    if (!slot || item === undefined) { reply({ success: false, message: 'err_bad_item' }); return; }
                    r = await db.homePlace(uid, slot.id, item ? item.id : null, (id) => (HOME_ITEMS.find(h => h.id === id) || { slot: '' }).slot === slot.type);
                    if (r.success) reply({ success: true, slot: slot.id, item: item ? item.id : null });
                } else if (action === 'chest') {
                    const key = typeof a.key === 'string' ? a.key.slice(0, 30) : '', n = Number(a.n);
                    if ((a.dir !== 'put' && a.dir !== 'take') || !key || !Number.isInteger(n) || n < 1 || n > 10000) { reply({ success: false, message: 'err_bad_item' }); return; }
                    r = await db.chestMove(uid, a.dir, key, n, farmCapacity(farmLevel(fd.xp)), CHEST_CAP);
                    if (r.success) reply({ success: true, dir: a.dir, key, n: r.moved });
                } else {
                    const d = FARM_DECOR.find(x => x.id === a.id);
                    if (!d) { reply({ success: false, message: 'err_bad_item' }); return; }
                    r = await db.decorStore(uid, d.id, !!a.stored);
                    if (r.success) reply({ success: true, id: d.id, stored: !!a.stored });
                }
            } else if (action === 'orchard') {
                if (!Number.isInteger(k) || (k as number) < 0 || (k as number) >= orchardSlotsFor(farmLevel(fd.xp)) || !near(F.orchardX[k as number], 50)) { reply({ success: false, message: Number.isInteger(k) && (k as number) >= 0 && (k as number) < ORCHARD_SLOTS && (k as number) >= orchardSlotsFor(farmLevel(fd.xp)) ? 'mf_or_locked' : 'farm_too_far' }); return; }
                const cur = mf.farm.orchard[k as number];
                if (!cur) {
                    const tr = F.fruitTrees.find(x => x.id === arg);
                    if (!tr) { reply({ success: false, message: 'err_bad_item' }); return; }
                    if (tr.level > RoomManager.hostLevel(p)) { reply({ success: false, message: 'mf_seed_locked' }); return; }
                    r = await db.orchardPlant(uid, k as number, tr.id, tr.price);
                    if (r.success) { socket.emit('coinsUpdated', { amount: -tr.price, totalCoins: r.coins }); reply({ success: true, k, planted: tr.id }); }
                } else {
                    r = await db.orchardHarvest(uid, k as number, (t) => RoomManager.orchardReady(t, Date.now()), (c) => (FRUIT_TREES.find(x => x.id === c) || { yield: 0 }).yield);
                    if (r.success) { reply({ success: true, k, crop: r.crop, n: r.n }); this.farmHeroXp(roomId, p.id, r.n * RoomManager.FARM_XP_PER_ITEM); }
                }
            } else if (action === 'tree') {
                const T = F.tree;
                if (Math.abs(p.x - T.x) > 160) { reply({ success: false, message: 'farm_too_far' }); return; }
                const st = mf.farm.tree.state;
                if (st === 'none') {
                    r = await db.treeBuy(uid, T.price);
                    if (r.success) { socket.emit('coinsUpdated', { amount: -T.price, totalCoins: r.coins }); reply({ success: true, tree: 'bought' }); }
                } else if (st === 'dry') {
                    r = await db.treeWater(uid);
                    if (r.success) { reply({ success: true, tree: 'watered' }); this.io.to(roomId).emit('mfTreeWatered', {}); }
                } else { reply({ success: false, message: 'mf_tree_busy' }); return; }
            } else if (action === 'orders') {
                if (!near(F.boardX, 60)) { reply({ success: false, message: 'farm_too_far' }); return; }
                r = await this.refreshOrders(roomId, uid, p);
                if (r && r.success) reply({ success: true, orders: r.farm.orders });
            } else if (action === 'deliver') {
                if (!near(F.boardX, 60) || typeof arg !== 'string') { reply({ success: false, message: 'farm_too_far' }); return; }
                r = await db.farmDeliver(uid, arg, Date.now() + 60000);
                if (r.success) {
                    reply({ success: true, order: r.order, orders: r.farm.orders });
                    socket.emit('coinsUpdated', { amount: r.order.coins, totalCoins: r.coins });
                    this.awardReward(roomId, p.id, 0, r.order.xp).catch(err => console.error('order xp xatosi:', err));
                }
            } else if (action === 'pick') {
                const T = F.tree, sp = T.spots[k as number];
                if (!Number.isInteger(k) || !sp || Math.abs(p.x - sp.x) > 60 || Math.abs(p.y - sp.y) > 80) { reply({ success: false, message: 'farm_too_far' }); return; }
                r = await db.treePick(uid, k as number, T.regrowMs, T.needApples);
                if (r.success) {
                    reply({ success: true, k, boss: !!r.boss });
                    this.farmHeroXp(roomId, p.id, RoomManager.FARM_XP_PER_ITEM);
                    if (r.boss) { if (room.myFarm && room.myFarm.owner === uid) room.myFarm.farm = r.farm; this.treeBossStart(roomId); }
                }
            } else if (action === 'zone') {
                if (!Number.isInteger(k) || (k as number) < 1 || (k as number) >= FARM_ZONES || !near(farmZoneCenter(F, k as number), F.zoneW / 2)) { reply({ success: false, message: 'farm_too_far' }); return; }
                const zPrice = F.zonePrices[k as number], zLevel = F.zoneLevels[k as number] || 0;
                if (farmLevel(fd.xp) < zLevel) { reply({ success: false, message: 'mf_zone_level|' + zLevel }); return; }
                r = await db.farmBuyZone(uid, k as number, zPrice);
                if (r.success) { socket.emit('coinsUpdated', { amount: -zPrice, totalCoins: r.coins }); reply({ success: true, k }); }
            } else if (action === 'dock') {
                if (!near(F.riverX0, 60)) { reply({ success: false, message: 'farm_too_far' }); return; }
                r = await db.farmBuyDock(uid, F.dockPrice);
                if (r.success) { socket.emit('coinsUpdated', { amount: -F.dockPrice, totalCoins: r.coins }); reply({ success: true }); }
            } else if (action === 'cast') {
                if (!mf.farm.dock || !near(F.dockX1 - 30, 50)) { reply({ success: false, message: 'mf_go_dock' }); return; }
                if (arg === 'net') {
                    if (!mf.farm.net) { reply({ success: false, message: 'mf_need_net' }); return; }
                    if (!(await db.farmUseNet(uid, F.netCooldownMs))) { reply({ success: false, message: 'mf_net_wait' }); return; }
                    const n = 2 + Math.floor(Math.random() * 3);
                    const fish = Array.from({ length: n }, () => rollFish(true));
                    const use = await db.toolUse(uid, 'net', F.toolUses);
                    r = await db.farmAddFish(uid, fish, 2 * fish.length);
                    if (r.success) { reply({ success: true, tool: 'net', fish, left: use.left, broken: use.broken }); this.io.to(roomId).emit('myFarmNet', { fish }); }
                } else {
                    if (!mf.farm.rod) { reply({ success: false, message: 'mf_need_rod' }); return; }
                    if (mf.fishing) return;
                    const use = await db.toolUse(uid, 'rod', F.toolUses);
                    mf.fishing = { state: 'wait', biteAt: Date.now() + 2000 + Math.random() * 4000, until: 0, fish: rollFish(false) };
                    reply({ success: true, tool: 'rod', left: use.left, broken: use.broken });
                    if (use.broken && mf.farm) mf.farm.rod = false;
                    this.sendMyFarm(roomId);
                    return;
                }
            } else if (action === 'reel') {
                const fi = mf.fishing;
                if (!fi || fi.state !== 'bite') { mf.fishing = null; reply({ success: false, message: 'mf_fish_gone' }); this.sendMyFarm(roomId); return; }
                mf.fishing = null;
                const zone = arg === 'green' ? 1 : arg === 'yellow' ? 0.7 : 0;
                if (!zone) { reply({ success: true, tool: 'rod', escaped: true, fish: fi.fish }); this.sendMyFarm(roomId); return; }
                const value = Math.max(1, Math.round(fi.fish.value * zone));
                const golden = fi.fish.id === 'goldfish';
                r = await db.farmAddFish(uid, [{ ...fi.fish, value }], golden ? 15 : 3);
                if (r.success) {
                    reply({ success: true, tool: 'rod', fish: { ...fi.fish, value }, zone: arg });
                    if (golden) { this.io.to(roomId).emit('mfGoldfish', { nick: p.nickname }); this.grantAchievement(roomId, p.id, 'goldfish', 50).catch(err => console.error('goldfish ach xatosi:', err)); }
                }
            }
            if (r && !r.success) reply({ success: false, message: r.message });
            if (r && r.farm && room.myFarm && room.myFarm.owner === uid) room.myFarm.farm = r.farm;
            if (r && r.farm && farmLevel(r.farm.xp) > lvlBefore) this.io.to(roomId).emit('farmLevelUp', { level: farmLevel(r.farm.xp), cap: farmCapacity(farmLevel(r.farm.xp)) });
            this.sendMyFarm(roomId);
        } catch (err) {
            console.error('farmAct xatosi:', err);
            reply({ success: false, message: 'err_server' });
        } finally {
            this.farmBusy.delete(uid);
        }
    }
    // O'yin sikli: baliq ilindi / qochib ketdi
    public tickFishing(roomId: string): void {
        const mf = this.activeRooms[roomId]?.myFarm;
        const fi = mf && mf.fishing;
        if (!fi) return;
        const now = Date.now();
        if (fi.state === 'wait' && now >= fi.biteAt) {
            fi.state = 'bite';
            fi.until = now + 9000;   // shuncha vaqt ichida tortish kerak
            this.sendMyFarm(roomId);
        } else if (fi.state === 'bite' && now > fi.until + 1500) {
            mf!.fishing = null;
            const host = this.activeRooms[roomId].hostId;
            this.io.to(host).emit('myFarmResult', { action: 'reel', success: true, tool: 'rod', escaped: true, fish: fi.fish });
            this.sendMyFarm(roomId);
        }
    }
    // S1 BOZORI: meva elfi - ekinlar; baliqchi - baliqlar
    public async produceSell(socket: Socket, roomId: string, what: 'crops' | 'fish' = 'crops'): Promise<void> {
        const room = this.activeRooms[roomId];
        const p = room?.players[socket.id];
        const map = room ? getMapById(room.selectedLevel) : null;
        const reply = (d: object) => socket.emit('produceSold', { what, ...d });
        if (!room || !p || !map || !map.story || map.story.buyerX === undefined || !room.isStarted) return;
        const x = what === 'fish' ? map.story.sellerX : map.story.buyerX;
        if (Math.abs(p.x - x) > (what === 'fish' ? map.story.talkRange : (map.story.buyRange || 80)) + 40) { reply({ success: false, message: 'farm_too_far' }); return; }
        if (p.userId === null) { reply({ success: false, message: what === 'fish' ? 'mf_no_fish' : 'farm_need_account' }); return; }
        if (this.farmBusy.has(p.userId)) return;
        this.farmBusy.add(p.userId);
        try {
            const r = what === 'fish' ? await db.sellInventory(p.userId, {}, 'all', RoomManager.cropPrices(), dailyOffer(Date.now()))
                : await db.sellInventory(p.userId, 'all', [], RoomManager.cropPrices(), dailyOffer(Date.now()));
            if (!r.success) { reply({ success: false, message: r.message === 'inv_nothing' ? (what === 'fish' ? 'mf_no_fish' : 'farm_nothing_to_sell') : r.message }); return; }
            reply({ success: true, earned: r.earned, n: what === 'fish' ? r.nFish : r.nCrops, xp: RoomManager.saleXp(r.earned || 0) });
            this.farmHeroXp(roomId, p.id, RoomManager.saleXp(r.earned || 0));
            this.farmChanged(p.userId);
            socket.emit('coinsUpdated', { amount: r.earned, totalCoins: r.coins });
            db.bumpStat({ farmCoins: r.earned || 0 });
        } catch (err) {
            console.error('produceSell xatosi:', err);
            reply({ success: false, message: 'err_server' });
        } finally {
            this.farmBusy.delete(p.userId!);
        }
    }
    // QAHRAMON XP (fermada): ekish +1, har terilgan hosil/meva/olma +1, sotish - har 25 tangaga +1
    public static readonly FARM_XP_PLANT = 1;
    public static readonly FARM_XP_PER_ITEM = 1;
    public static saleXp(earned: number): number { return earned > 0 ? Math.max(1, Math.floor(earned / 25)) : 0; }
    private farmHeroXp(roomId: string, playerId: string, xp: number): void {
        if (xp > 0) this.awardReward(roomId, playerId, 0, xp).catch(err => console.error('farm xp xatosi:', err));
    }
    // Inventardan sotildi (menyu orqali ham bo'lishi mumkin): o'yinda bo'lsa - shu qahramonga, aks holda - asosiy qahramoniga
    public async saleHeroXp(userId: string, earned: number): Promise<number> {
        const xp = RoomManager.saleXp(earned);
        if (!xp) return 0;
        const where = this.findOnline(userId);
        if (where) { await this.awardReward(where.roomId, where.socketId, 0, xp); return xp; }
        const u = await db.getUserById(userId);
        if (u) await db.addRewards(userId, 0, xp, u.defaultCharacter || 'knight');
        return xp;
    }
    public static cropPrices(): { [c: string]: number } {
        const prices: { [c: string]: number } = {};
        CROPS.forEach(c => { prices[c.id] = c.sell; });
        FRUIT_TREES.forEach(c => { prices[c.id] = c.sell; });
        const F = MAPS.find(m => m.myFarm)!.myFarm!;
        prices.blueapple = F.tree.appleSell;
        return prices;
    }
    // Mevali daraxt: ulg'aygan (matureMs) va oxirgi terimdan cycleMs o'tgan bo'lsa - mevasi bor
    public static orchardReady(t: { c: string, t: number, h: number }, now: number): boolean {
        const d = FRUIT_TREES.find(x => x.id === t.c);
        if (!d || now - t.t < d.matureMs) return false;
        return now - Math.max(t.h, t.t + d.matureMs - d.cycleMs) >= d.cycleMs;
    }
    // BUYURTMALAR: muddati o'tganlar chiqadi, 3 tagacha yangisi qo'shiladi (topshirilgandan keyin - 1 daqiqada)
    private async refreshOrders(roomId: string, uid: string, host: PlayerState | undefined): Promise<{ success: boolean, farm?: db.FarmData } | null> {
        const f = await db.getFarm(uid);
        if (!f) return null;
        const now = Date.now();
        let orders = f.orders.filter(o => o.until > now);
        let nextAt = f.ordersNextAt;
        const changed = orders.length !== f.orders.length;
        let added = false;
        while (orders.length < 3 && now >= nextAt) {
            orders.push(this.makeOrder(f, RoomManager.hostLevel(host)));
            added = true;
            if (orders.length >= 3) break;
        }
        if (!changed && !added) return { success: true, farm: f };
        const r = await db.farmSetOrders(uid, orders, nextAt);
        const mf = this.activeRooms[roomId]?.myFarm;
        if (r.success && mf && mf.owner === uid) mf.farm = r.farm!;
        return { success: true, farm: r.farm };
    }
    // Elf buyurtmasi: 1-3 xil narsa (ochilgan ekinlar, bog' mevalari, baliqlar), bozor narxidan ~1.7x qimmat
    private makeOrder(f: db.FarmData, hostLevel: number): db.FarmOrder {
        const prices = RoomManager.cropPrices();
        const pool: { key: string, value: number, min: number, max: number }[] = [];
        CROPS.filter(c => c.level <= hostLevel).forEach(c => pool.push({ key: c.id, value: c.sell, min: 3, max: 8 }));
        f.orchard.forEach(t => { if (t && !pool.some(p => p.key === t.c)) pool.push({ key: t.c, value: prices[t.c], min: 2, max: 5 }); });
        if (f.tree.state !== 'none') pool.push({ key: 'blueapple', value: prices.blueapple, min: 3, max: 8 });
        if (f.rod || f.net) FISH.filter(x => !x.golden && (f.rod || x.net)).forEach(x => pool.push({ key: 'fish:' + x.id, value: x.base + x.perKg * (x.minKg + x.maxKg) / 2, min: 1, max: x.id === 'catfish' ? 1 : 3 }));
        const types = Math.min(pool.length, 1 + Math.floor(Math.random() * 3));
        const items: { [k: string]: number } = {};
        let worth = 0;
        pool.sort(() => Math.random() - 0.5).slice(0, types).forEach((it) => {
            const n = it.min + Math.floor(Math.random() * (it.max - it.min + 1));
            items[it.key] = n; worth += n * it.value;
        });
        return { id: 'o' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), items, coins: Math.round(worth * 1.7 / 5) * 5, xp: 10 + types * 8, until: Date.now() + 40 * 60000 };
    }
    // Ferma birinchi yuklanganda: 15 soat kirilmagan bo'lsa - qo'ziqorinlar; boss jangi to'xtagan joyidan
    private onFarmLoaded(roomId: string): void {
        const room = this.activeRooms[roomId];
        const mf = room?.myFarm, f = mf?.farm;
        if (!room || !mf || !f || !mf.owner) return;
        const F = getMapById(room.selectedLevel).myFarm!, SD = F.shrooms;
        let n = f.shroomsLeft;
        if (!n && f.lastVisit && Date.now() - f.lastVisit >= SD.absentMs) { n = SD.count; db.farmSetShrooms(mf.owner, n); }
        mf.shrooms = [];
        if (n > 0) { this.spawnShrooms(room, n); this.io.to(roomId).emit('mfShroomsCame', { n }); }
        db.farmTouch(mf.owner);
        mf.mobs = []; mf.raidKind = null;
        mf.nextRaidAt = Date.now() + getMapById(room.selectedLevel).myFarm!.raids.firstMs;
        if (f.tree.state === 'boss') this.treeBossStart(roomId);
        this.refreshOrders(roomId, mf.owner, room.players[room.hostId]).then(() => this.sendMyFarm(roomId)).catch(err => console.error('refreshOrders xatosi:', err));
    }
    private spawnShrooms(room: RoomState, n: number): void {
        const mf = room.myFarm!, f = mf.farm!, F = getMapById(room.selectedLevel).myFarm!, SD = F.shrooms;
        const open = Array.from({ length: FARM_PLOTS * (f.zones + 1) }, (_, k) => k);
        const planted = open.filter(k => f.plots[k]).sort(() => Math.random() - 0.5);
        const rest = open.filter(k => !f.plots[k]).sort(() => Math.random() - 0.5);
        const now = Date.now();
        [...planted, ...rest].slice(0, n).forEach((k, i) => {
            mf.shrooms.push({ id: 'sh' + (++mf.seq), x: farmPlotX(F, k), k, hp: SD.hp, maxHp: SD.hp, born: now, nextPuff: now + 1500 + i * 300, ate: false, hitFlash: 0 });
        });
    }
    // Qo'ziqorin o'ldirildi (o'yin siklidan): tanga, bazadagi qolgan soni
    public shroomKilled(roomId: string, id: string, killerId: string | null): void {
        const room = this.activeRooms[roomId], mf = room?.myFarm;
        if (!room || !mf) return;
        const i = mf.shrooms.findIndex(sh => sh.id === id);
        if (i < 0) return;
        const sh = mf.shrooms.splice(i, 1)[0];
        const F = getMapById(room.selectedLevel).myFarm!;
        this.io.to(roomId).emit('mfShroomDown', { x: sh.x, left: mf.shrooms.length });
        if (mf.owner) db.farmSetShrooms(mf.owner, mf.shrooms.length);
        if (killerId && room.players[killerId]) this.awardCrateCoins(roomId, killerId, F.shrooms.killCoins).catch(err => console.error('shroom coins xatosi:', err));
    }
    // MAXLUQLAR HUJUMI boshlanadi (o'yin siklidan): tasodifiy tur, hostning yonidan (ekrandan tashqaridan) keladi
    public startRaid(roomId: string): void {
        const room = this.activeRooms[roomId], mf = room?.myFarm;
        if (!room || !mf || !mf.farm || mf.boss) return;
        const F = getMapById(room.selectedLevel).myFarm!, RD = F.raids, now = Date.now();
        const alive = Object.values(room.players).filter(p => !p.isDead);
        const host = room.players[room.hostId] || alive[0];
        if (!host) return;
        const kinds = ['slime', 'shrooms', 'zveg'].filter(k => k !== mf.raidKind);   // ketma-ket bir xil bo'lmasin
        const kind = kinds[Math.floor(Math.random() * kinds.length)];
        mf.raidKind = kind;
        const clampX = (x: number) => Math.max(120, Math.min(F.riverX0 - 60, x));
        const side = () => { const s = Math.random() < 0.5 ? -1 : 1; const x = host.x + s * 480; return x < 120 || x > F.riverX0 - 60 ? -s : s; };
        const mob = (k: 'slime' | 'slimelet' | 'zveg', x: number, hp: number, v = 0) => ({ id: 'mb' + (++mf.seq), kind: k, x, y: 570, hp, maxHp: hp, hitFlash: 0,
            face: -1, v, hopFrom: x, hopTo: x, hopAt: now + 600 + Math.random() * 500, hopEnd: 0, hitCd: 0 });
        if (kind === 'slime') {
            const hp = RD.slime.hp + RD.slime.hpPerPlayer * Math.max(0, alive.length - 1);
            mf.mobs.push(mob('slime', clampX(host.x + side() * 480), hp));
        } else if (kind === 'zveg') {
            const s = side();
            for (let i = 0; i < RD.zveg.n; i++) mf.mobs.push(mob('zveg', clampX(host.x + s * (440 + i * 55)), RD.zveg.hp, i % 3));
        } else {
            this.spawnShrooms(room, RD.shrooms);
        }
        this.io.to(roomId).emit('mfRaid', { kind });
    }
    // Maxluq o'ldirildi: tanga; katta shilimshiq kichiklarga bo'linadi; hammasi tugasa - hujum qaytarildi
    public mobKilled(roomId: string, id: string, killerId: string | null): void {
        const room = this.activeRooms[roomId], mf = room?.myFarm;
        if (!room || !mf) return;
        const i = mf.mobs.findIndex(m => m.id === id);
        if (i < 0) return;
        const m = mf.mobs.splice(i, 1)[0];
        const RD = getMapById(room.selectedLevel).myFarm!.raids, now = Date.now();
        if (m.kind === 'slime') {
            for (let k = 0; k < RD.slime.splits; k++) {
                const x = m.x + (k - (RD.slime.splits - 1) / 2) * 50;
                mf.mobs.push({ id: 'mb' + (++mf.seq), kind: 'slimelet', x, y: 570, hp: RD.slimelet.hp, maxHp: RD.slimelet.hp, hitFlash: 0, face: k % 2 ? 1 : -1, v: k % 3,
                    hopFrom: x, hopTo: x, hopAt: now + 500 + k * 150, hopEnd: 0, hitCd: 15 });
            }
        }
        const coins = m.kind === 'slime' ? RD.slime.coins : m.kind === 'slimelet' ? RD.slimelet.coins : RD.zveg.coins;
        this.io.to(roomId).emit('mfMobDown', { x: Math.round(m.x), kind: m.kind, split: m.kind === 'slime' });
        if (killerId && room.players[killerId]) this.awardCrateCoins(roomId, killerId, coins).catch(err => console.error('mob coins xatosi:', err));
        if (!mf.mobs.length && !mf.shrooms.length) this.io.to(roomId).emit('mfRaidCleared', {});
    }
    // Qo'ziqorin grядkadagi ekinni yedi
    public shroomEat(roomId: string, k: number): void {
        const mf = this.activeRooms[roomId]?.myFarm;
        const p = mf && mf.farm && mf.farm.plots[k];
        if (!mf || !p || !mf.owner) return;
        const owner = mf.owner;
        db.farmSpoil(owner, k, p).then((r) => {
            const cur = this.activeRooms[roomId]?.myFarm;
            if (!r.success || !cur || cur.owner !== owner) return;
            cur.farm = r.farm!;
            this.io.to(roomId).emit('mfAte', { k, crop: p.c });
            this.sendMyFarm(roomId);
        }).catch(err => console.error('farmSpoil xatosi:', err));
    }
    // BAXAYBAT DARAXT: 100 ta olma terildi - og'zi ochiladi, jang boshlanadi (jon - o'yinchilar soniga qarab)
    public treeBossStart(roomId: string): void {
        const room = this.activeRooms[roomId], mf = room?.myFarm;
        if (!room || !mf || mf.boss) return;
        const T = getMapById(room.selectedLevel).myFarm!.tree;
        const hp = T.bossHp + T.bossHpPerPlayer * Math.max(0, Object.keys(room.players).length - 1);
        mf.boss = { hp, maxHp: hp, hitFlash: 0, nextAt: Date.now() + 3500, last: '', apples: [], queue: [], roots: [], pillars: [] };
        this.io.to(roomId).emit('treeBossStart', {});
        this.sendMyFarm(roomId);
    }
    public treeBossDefeated(roomId: string): void {
        const room = this.activeRooms[roomId], mf = room?.myFarm;
        if (!room || !mf || !mf.boss) return;
        mf.boss = null;
        const T = getMapById(room.selectedLevel).myFarm!.tree;
        this.io.to(roomId).emit('treeBossDown', { coins: T.rewardCoins, xp: T.rewardXp });
        Object.values(room.players).forEach(p => { this.awardReward(roomId, p.id, T.rewardCoins, T.rewardXp, true).catch(err => console.error('tree reward xatosi:', err)); });
        if (mf.owner) {
            const owner = mf.owner;
            db.treeBossDone(owner).then((r) => {
                const cur = this.activeRooms[roomId]?.myFarm;
                if (r.success && cur && cur.owner === owner) { cur.farm = r.farm!; this.sendMyFarm(roomId); }
            }).catch(err => console.error('treeBossDone xatosi:', err));
        }
    }
    public farmTouch(roomId: string): void {
        const mf = this.activeRooms[roomId]?.myFarm;
        if (mf && mf.owner && mf.farm) db.farmTouch(mf.owner);
    }
    // Inventardan sotildi (menyu yoki boshqa joydan) - shu hisob fermasi ochiq turgan xonada ma'lumot yangilansin
    public farmChanged(userId: string): void {
        Object.values(this.activeRooms).forEach((room) => {
            const mf = room.myFarm;
            if (mf && mf.owner === userId && !mf.loading) { mf.farm = null; this.sendMyFarm(room.id); }
        });
    }
    // Savatda nima bor (bozorda HUD va do'kondagi asboblar uchun)
    public async farmBag(socket: Socket): Promise<void> {
        const p = Object.values(this.activeRooms).map(r => r.players[socket.id]).find(Boolean);
        if (!p || p.userId === null) { socket.emit('farmBag', { crops: 0, fish: 0, rod: false, net: false }); return; }
        const f = await db.getFarm(p.userId).catch(() => null);
        if (!f) return;
        socket.emit('farmBag', { crops: Object.values(f.bag).reduce((a, n) => a + n, 0), fish: f.fishN, fishV: f.fishV, rod: f.rod, net: f.net, fert: f.fert, water: f.water, decor: f.decor, home: f.home.owned });
    }

    // XP KUCHAYTIRISH bonusi (hozirgi personajniki): har jang mukofotiga +50 x daraja
    public static xpBoostOf(p: PlayerState): number {
        return db.XP_BOOST_PER_LEVEL * Math.min(db.XP_BOOST_MAX, Math.max(0, (p.xpBoost || {})[p.characterType] || 0));   // eng ko'pi 10 daraja
    }
    // boost = true: o'ldirish, boss, xarita o'tish (jang) - kuchaytirish bonusi qo'shiladi; ferma va buyurtmalarda - yo'q
    public async awardReward(roomId: string, playerId: string, coins: number, xp: number, boost: boolean = false): Promise<void> {
        const player = this.activeRooms[roomId]?.players[playerId];
        if (!player) return;
        if (boost && xp > 0) xp += RoomManager.xpBoostOf(player);
        if (xp > 0) {
            const levelBefore = player.level || 0;
            player.xp = (player.xp || 0) + xp;
            player.charXp = { ...(player.charXp || {}) };
            player.charXp[player.characterType] = (player.charXp[player.characterType] || 0) + xp;
            RoomManager.refreshPerks(player);
            const rm = this.activeRooms[roomId];
            this.grantLevelUpCoins(player, levelBefore, rm, !!rm && rm.isStarted && !rm.isOver);
            this.io.to(playerId).emit('xpGained', { amount: xp });
        }
        let totalCoins: number | null = null;
        if (player.userId !== null) {
            const updated = await db.addRewards(player.userId, coins, xp, player.characterType);
            if (updated) totalCoins = updated.coins;
        }
        if (coins > 0) this.io.to(playerId).emit('coinsUpdated', { amount: coins, totalCoins });
    }

    // MAG'LUBIYAT: xonadagi BARCHA o'yinchilar o'lganda (arvoh bo'lganda) chaqiriladi.
    // G'olib yo'q, tanga berilmaydi - hammaga "O'YIN TUGADI" ko'rsatiladi va
    // hammani o'sha avvalgi lobbiga qaytaramiz.
    public async declareGameOverLoss(roomId: string): Promise<void> {
        const room = this.activeRooms[roomId];
        if (!room || room.isOver) return;

        db.bumpStat({ ['losses.' + room.selectedLevel]: 1 });   // admin statistikasi: qaysi xaritada ko'p yutqaziladi
        room.isOver = true;
        room.isStarted = false;

        // Lobbiga qaytishda - xo'jayin hisobining progressiga moslash (o'yinda xo'jayin almashgan bo'lishi mumkin)
        this.applyHostProgress(room, false);
        this.broadcastLevelInfo(roomId);

        this.io.to(roomId).emit('gameOver', {
            isLoss: true,
            fromLevel: room.selectedLevel   // qaysi xaritada yutqazildi (klientdagi sahna uchun)
        });

        // Barcha o'yinchilarni yangi raund uchun tozalab qo'yamiz
        Object.values(room.players).forEach((p) => {
            p.kills = 0;
            p.hp = p.maxHp || BASE_HP;
            p.isDead = false;
            p.respawnTimer = 0;
            p.isReady = false; // Keyingi raund uchun hamma qayta "Tayyor" bosishi kerak
        });

        this.updateLobby(roomId);
        this.broadcastRoomList();
    }

    // Lobbini yangilash xabari
    public updateLobby(roomId: string): void {
        const room = this.activeRooms[roomId];
        if (!room) return;

        const lobbyData = Object.values(room.players).map(p => ({
            id: p.id,
            characterType: p.characterType,
            nickname: p.nickname,
            isHost: p.id === room.hostId,
            isReady: p.isReady,
            // Lobbidagi o'rinlarda qahramon rasmi va darajasi uchun
            color: p.color,
            weaponColor: p.weaponColor,
            look: p.look || '',
            level: p.level || 0,
            isAdmin: !!p.isAdmin
        }));

        this.io.to(roomId).emit('updateLobbyPlayers', {
            players: lobbyData,
            hostId: room.hostId
        });
    }

    // Asosiy menyudagi hamma o'yinchilarga ochiq (PUBLIC) xonalar ro'yxatini tarqatish -
    // PRIVATE xonalar bu yerda ko'rinmaydi, faqat kod orqali qo'shilish mumkin
    public broadcastRoomList(): void {
        const list = Object.values(this.activeRooms)
            .filter(r => !r.isPrivate)
            .map(r => ({
                id: r.id,
                name: r.name,
                playerCount: Object.keys(r.players).length,
                maxPlayers: RoomManager.MAX_PLAYERS,
                isStarted: r.isStarted
            }));
        this.io.emit('updateRoomList', list);
    }
}