import { Server, Socket } from 'socket.io';
import { RoomState, PlayerState } from '../types';
import { getCharacterLogic } from '../characters';
import { BaseCharacter } from '../characters/base.character';
import { getSkinColor, getWeaponSkinColor } from '../skins';
import { lookString } from '../cosmetics';
import { MAPS, getMapById } from '../maps';
import { GameEngine } from './game.engine';
import * as db from '../db';
import { hasPerk, maxStaminaOf, maxHpOf, BASE_HP, ALT_WEAPON_PERK, SPECIAL_PERK, SPECIAL_TICKS, SPECIAL_COOLDOWN_TICKS, INVIS_LINGER_TICKS, shotgunMagOf } from '../perks';

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
                unlockedLevel = Math.min(user.unlockedLevel, MAPS.length - 1);
                xp = user.xp;
                charXp = user.charXp;
                equippedSkins = user.equippedSkins;
                equippedWeaponSkins = user.equippedWeaponSkins;
                equippedCosmetics = user.equippedCosmetics;
                accountUpgrades = user.upgrades;
                // MUHIM: "Mening personajim" ekranida tanlangan personaj bilan HAR QANDAY
                // xonada shu personaj sifatida o'ynaydi (endi lobbida alohida tanlanmaydi)
                characterType = user.defaultCharacter || 'knight';
            }
        }
        this.pendingJoins.delete(socket.id);
        // Bazani kutayotganda sahifa yana yangilangan / xona yopilgan bo'lishi mumkin
        if (!this.activeRooms[roomId] || !this.io.sockets.sockets.get(socket.id)) return;

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
            unlockedLevel: unlockedLevel,
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
        if (p.weaponMode === 'alt' && !(ALT_WEAPON_PERK[p.characterType] && hasPerk(p, ALT_WEAPON_PERK[p.characterType]))) p.weaponMode = 'main';
        // Magazin hajmi kuchaytirilgan bo'lishi mumkin
        if (p.ammo === undefined || p.ammo > shotgunMagOf(p)) p.ammo = shotgunMagOf(p);
    }

    // Q: ikkinchi qurolga o'tish va qaytish (shu daraja imkoniyati ochilgan bo'lsa)
    public toggleWeapon(socket: Socket, roomId: string): void {
        const p = this.activeRooms[roomId]?.players[socket.id];
        if (!p || p.isDead) return;
        const perk = ALT_WEAPON_PERK[p.characterType];
        if (!perk || !hasPerk(p, perk)) return;
        p.weaponMode = p.weaponMode === 'alt' ? 'main' : 'alt';
    }

    // R: maxsus qobiliyat (mage - jamoaviy davolash, knight - uchuvchi etik), 2 soniya, keyin kutish
    public useSpecial(socket: Socket, roomId: string): void {
        const room = this.activeRooms[roomId];
        const p = room?.players[socket.id];
        if (!room || !room.isStarted || !p || p.isDead || this.isLoading(room)) return;
        const perk = SPECIAL_PERK[p.characterType];
        if (!perk || !hasPerk(p, perk) || (p.specialCooldown || 0) > 0) return;
        p.specialTicks = SPECIAL_TICKS;
        p.specialCooldown = SPECIAL_COOLDOWN_TICKS;
    }

    // Xonaning ochilgan xaritalari = xo'jayin hisobining progressi. Xo'jayin yangi kirganda
    // (freshHost) xona uning eng so'nggi ochilgan xaritasidan davom etadi
    private applyHostProgress(room: RoomState, freshHost: boolean): void {
        const host = room.players[room.hostId];
        if (!host || typeof host.unlockedLevel !== 'number') return;
        room.unlockedLevel = Math.min(host.unlockedLevel, MAPS.length - 1);
        // O'yin ketayotganda xarita almashmaydi - faqat lobbida moslanadi
        if (room.isStarted) return;
        if (freshHost || room.selectedLevel > room.unlockedLevel) room.selectedLevel = room.unlockedLevel;
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
            maps: MAPS.map(m => ({ id: m.id, name: m.name, description: m.description, accentColor: m.accentColor }))
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
            socket.emit('gameStarted', { map: this.mapPayload(room), continued: null });
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
        if (!Number.isInteger(levelIndex) || levelIndex < 0 || levelIndex >= MAPS.length || levelIndex > room.unlockedLevel) return;

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
            selectedLevel: room.selectedLevel
        });
    }


    public toggleReady(socket: Socket, roomId: string): void {
        const room = this.activeRooms[roomId];
        if (room && room.players[socket.id]) {
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

        this.io.to(roomId).emit('lobbyChatMessage', {
            nickname: player.nickname,
            text: trimmed,
            timestamp: Date.now()
        });
    }

    // ENTER/SICHQONCHA BOSIB TURILGANDA: avtomatik-otish holatini yoqamiz
    public startAttack(socket: Socket, roomId: string, angle: number): void {
        const room = this.activeRooms[roomId];
        if (!room || !room.isStarted || this.isLoading(room)) return;
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
        player.attackCooldown = BaseCharacter.ATTACK_COOLDOWN_TICKS;

        charLogic.handleAttack(player, room, player.lastAttackAngle);
    }

    // SHIFT BOSIB TURILGANDA: barcha personajlar uchun umumiy - qobiliyat faollashadi
    public startAbility(socket: Socket, roomId: string): void {
        const room = this.activeRooms[roomId];
        if (!room || !room.isStarted || this.isLoading(room)) return;

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
        if (!target) return;
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
    // Admin tanga bergan bo'lsa - o'yinchi onlayn bo'lsa, balansi darhol yangilanadi
    public notifyCoins(userId: string, amount: number, totalCoins: number): void {
        const where = this.findOnline(userId);
        if (where) this.io.to(where.socketId).emit('coinsUpdated', { amount, totalCoins });
    }

    // XONANI YOPISH (egasi chiqib ketdi): qolganlarga xabar, ular xonadan chiqariladi
    private closeRoom(roomId: string): void {
        const room = this.activeRooms[roomId];
        if (!room) return;
        this.io.to(roomId).emit('roomClosed', { reason: 'host_left' });
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
    public startLevel(roomId: string, continued: { fromLevel: number, winnerNickname: string, coinsAwarded: number } | null = null): void {
        const room = this.activeRooms[roomId];
        if (!room) return;
        const map = getMapById(room.selectedLevel);
        room.isStarted = true;
        room.isOver = false;

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

        this.io.to(roomId).emit('gameStarted', { map: this.mapPayload(room), continued });
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

        room.isOver = true;
        room.isStarted = false;

        let updatedCoins: number | null = null;
        if (winner.userId !== null) {
            const updated = await db.addCoins(winner.userId, RoomManager.WIN_REWARD_COINS);
            if (updated) updatedCoins = updated.coins;
        }

        // PROGRESS - HAR KIMNING O'Z HISOBIDA: xonadagi har o'yinchiga +10 XP; aynan o'zining
        // "chegara" xaritasini o'tgan bo'lsa - keyingi xarita ochiladi. Xotirada darhol (keyingi
        // xaritaga o'tish shunga tayanadi), bazada - hisobli o'yinchilar uchun
        const clearedId = room.selectedLevel;
        const maxLevel = MAPS.length - 1;
        let levelCleared = false;
        Object.values(room.players).forEach((p) => {
            p.xp = (p.xp || 0) + db.XP_PER_MAP;
            p.charXp = { ...(p.charXp || {}) };
            p.charXp[p.characterType] = (p.charXp[p.characterType] || 0) + db.XP_PER_MAP;
            RoomManager.refreshPerks(p);
            if (p.unlockedLevel === clearedId && p.unlockedLevel < maxLevel) {
                p.unlockedLevel++;
                if (p.id === room.hostId) levelCleared = true;
            }
            if (p.userId !== null) {
                db.recordMapClear(p.userId, clearedId, maxLevel, p.characterType).catch(err => console.error('recordMapClear xatosi:', err));
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
        const coinsAwarded = winner.userId !== null ? RoomManager.WIN_REWARD_COINS : 0;
        if (room.selectedLevel + 1 < MAPS.length) {
            const fromLevel = room.selectedLevel;
            room.selectedLevel++;
            if (updatedCoins !== null) {
                this.io.to(winnerId).emit('coinsUpdated', { amount: coinsAwarded, totalCoins: updatedCoins });
            }
            this.broadcastLevelInfo(roomId);
            this.startLevel(roomId, { fromLevel, winnerNickname: winner.nickname, coinsAwarded });
            return;
        }

        this.io.to(roomId).emit('gameOver', {
            isLoss: false,
            fromLevel: room.selectedLevel,   // hozirgina yutilgan xarita (klientda "o'tildi" tantanasi)
            winnerId: winnerId,
            winnerNickname: winner.nickname,
            coinsAwarded: winner.userId !== null ? RoomManager.WIN_REWARD_COINS : 0,
            totalCoins: updatedCoins,
            levelCleared: levelCleared,
            unlockedLevel: room.unlockedLevel
        });

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

    // MAG'LUBIYAT: xonadagi BARCHA o'yinchilar o'lganda (arvoh bo'lganda) chaqiriladi.
    // G'olib yo'q, tanga berilmaydi - hammaga "O'YIN TUGADI" ko'rsatiladi va
    // hammani o'sha avvalgi lobbiga qaytaramiz.
    public async declareGameOverLoss(roomId: string): Promise<void> {
        const room = this.activeRooms[roomId];
        if (!room || room.isOver) return;

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
            level: p.level || 0
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