import express from 'express';
import http from 'http';
import path from 'path';
import { Server } from 'socket.io';
import cors from 'cors';
import { RoomState } from './types';
import { RoomManager } from './managers/room.manager';
import { GameEngine } from './managers/game.engine';
import * as db from './db';
import { SKIN_CATALOG, getSkinPrice, WEAPON_SKIN_CATALOG, getWeaponSkinPrice } from './skins';
import { MAPS } from './maps';
import { config } from 'dotenv';
import { startAdminBot } from './admin.bot';
config({quiet:true})

const app = express();
app.use(cors());
app.use(express.json());

// Client papkasidagi fayllarni (index.html, game.js, lobby.js) serve qilish
// no-cache: brauzer har safar fayl o'zgarganini tekshiradi (o'zgarmagan bo'lsa -
// tezkor 304 javob). Aks holda yangilangan game.js o'rniga eskisi keshdan olinardi
app.use(express.static(path.join(__dirname, '../../client'), {
    setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache')
}));

// ==================== HISOB QAYDNOMASI (AUTH) API ====================

// RO'YXATDAN O'TISH: ism, nickname va parol
app.post('/api/register', async (req, res) => {
    const { fullName, nickname, password } = req.body || {};
    const result = await db.registerUser(fullName, nickname, password);
    if (result.success) {
        res.json(result);
    } else {
        res.status(400).json(result);
    }
});

// TIZIMGA KIRISH: nickname va parol
app.post('/api/login', async (req, res) => {
    const { nickname, password } = req.body || {};
    const result = await db.loginUser(nickname, password);
    if (result.success) {
        res.json(result);
    } else {
        res.status(400).json(result);
    }
});

// FOYDALANUVCHI MA'LUMOTINI YANGILASH UCHUN (masalan, do'kon ochilganda)
app.get('/api/user/:id', async (req, res) => {
    const user = await db.getUserById(req.params.id);
    if (user) res.json({ success: true, user });
    else res.status(404).json({ success: false, message: 'Topilmadi' });
});

// SKIN KATALOGINI OLISH (narxlar va ranglar)
app.get('/api/skins', (req, res) => {
    res.json({ success: true, catalog: SKIN_CATALOG });
});

// XARITALAR RO'YXATINI OLISH (nom, tavsif, rang - lobbida ko'rsatish uchun)
app.get('/api/maps', (req, res) => {
    res.json({ success: true, maps: MAPS.map(m => ({ id: m.id, name: m.name, description: m.description, accentColor: m.accentColor })) });
});

// FOYDALANUVCHI SAQLAGAN ("MENING XONALARIM") XONALAR RO'YXATI
app.get('/api/my-rooms/:userId', async (req, res) => {
    try {
        const rooms = await db.getRoomsByHost(req.params.userId);
        res.json({ success: true, rooms });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Xonalarni yuklab bo\'lmadi' });
    }
});

// "MENING SAQLANGAN XONAM" - foydalanuvchi ENG OXIRGI yaratgan/xo'jayin bo'lgan bitta xona
app.get('/api/my-rooms/:userId/latest', async (req, res) => {
    try {
        const room = await db.getMostRecentRoomByHost(req.params.userId);
        res.json({ success: true, room });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Xonani yuklab bo\'lmadi' });
    }
});

// "MENING PERSONAJIM" - barcha personajlar uchun yaxshilash darajalari va ballar
app.get('/api/character/:userId', async (req, res) => {
    try {
        const user = await db.getUserById(req.params.userId);
        if (!user) {
            res.status(404).json({ success: false, message: 'Foydalanuvchi topilmadi' });
            return;
        }
        // "Daraja" - tajribadan (har o'tilgan xarita +10 XP, har daraja uchun kerakli XP x2)
        res.json({
            success: true,
            defaultCharacter: user.defaultCharacter,
            // Daraja - tanlangan (default) personajniki; har personajning tajribasi alohida
            level: db.xpLevel(user.charXp[user.defaultCharacter] || 0),
            xp: user.charXp[user.defaultCharacter] || 0,
            charXp: user.charXp,
            unlockedLevel: user.unlockedLevel,
            upgrades: user.upgrades,
            skillPoints: user.skillPoints,
            ownedSkins: user.ownedSkins,
            equippedSkins: user.equippedSkins,
            ownedWeaponSkins: user.ownedWeaponSkins,
            equippedWeaponSkins: user.equippedWeaponSkins
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Ma\'lumotni yuklab bo\'lmadi' });
    }
});

// KO'RSATILADIGAN ("DEFAULT") PERSONAJNI O'ZGARTIRISH - shu personaj bilan endi
// istalgan xonaga kirganda avtomatik shu qahramon sifatida o'ynaydi
app.post('/api/character/:userId/default', async (req, res) => {
    const characterType = req.body?.characterType;
    try {
        const user = await db.setDefaultCharacter(req.params.userId, characterType);
        if (!user) {
            res.status(400).json({ success: false, message: 'Noto\'g\'ri personaj turi' });
            return;
        }
        res.json({ success: true, defaultCharacter: user.defaultCharacter });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Xatolik yuz berdi' });
    }
});

// KO'NIKMA BALLINI SARFLAB, TANLANGAN PERSONAJNING "damage" YOKI "stamina" NI OSHIRISH
// MUHIM: bu FAQAT lobbida/xonada, aynan o'sha personaj hozir tanlangan bo'lsa ishlaydi -
// "Mening Personajim" ekranini bosh menyudan ochib kuchaytirib bo'lmaydi (faqat ko'rish mumkin)
app.post('/api/character/:userId/upgrade', async (req, res) => {
    const { characterType, stat, roomId } = req.body || {};
    if (typeof stat !== 'string' || typeof characterType !== 'string') {
        res.status(400).json({ success: false, message: 'Noto\'g\'ri ko\'nikma turi' });
        return;
    }

    // Kuchaytirish hisobga bog'liq - bosh menyudan ham, lobbidan ham. Xonada bo'lsa -
    // o'sha xonadagi holati ham darhol yangilanadi
    const room = roomId ? activeRooms[roomId] : null;
    const playerInRoom = room ? Object.values(room.players).find(p => p.userId === req.params.userId) : null;

    try {
        const result = await db.upgradeStat(req.params.userId, characterType, stat);
        if (result.success && playerInRoom) {
            roomManager.refreshCharacterInRoom(playerInRoom.id, roomId);
        }
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, message: 'Yaxshilashda xatolik yuz berdi' });
    }
});

// TANA SKINI SOTIB OLISH / KIYISH: hisobga bog'liq - xonada bo'lish shart EMAS
// (ilgari bu faqat socket+xona orqali ishlar edi, shuning uchun "Mening personajim"
// ekranini bosh menyudan ochganda "ro'yxatdan o'tmagansiz" degan noto'g'ri xato chiqardi)
app.post('/api/skins/:userId/buy', async (req, res) => {
    const { characterType, skinId } = req.body || {};
    try {
        const price = getSkinPrice(characterType, skinId);
        const result = await db.buySkin(req.params.userId, characterType, skinId, price, 'body');
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, message: 'Xatolik yuz berdi' });
    }
});

app.post('/api/skins/:userId/equip', async (req, res) => {
    const { characterType, skinId } = req.body || {};
    try {
        const result = await db.equipSkin(req.params.userId, characterType, skinId, 'body');
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, message: 'Xatolik yuz berdi' });
    }
});

// QUROL SKINI KATALOGI
app.get('/api/weapon-skins', (req, res) => {
    res.json({ success: true, catalog: WEAPON_SKIN_CATALOG });
});

// QUROL SKINI SOTIB OLISH / KIYISH - tana skinidan ALOHIDA
app.post('/api/weapon-skins/:userId/buy', async (req, res) => {
    const { characterType, skinId } = req.body || {};
    try {
        const price = getWeaponSkinPrice(characterType, skinId);
        const result = await db.buySkin(req.params.userId, characterType, skinId, price, 'weapon');
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, message: 'Xatolik yuz berdi' });
    }
});

app.post('/api/weapon-skins/:userId/equip', async (req, res) => {
    const { characterType, skinId } = req.body || {};
    try {
        const result = await db.equipSkin(req.params.userId, characterType, skinId, 'weapon');
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, message: 'Xatolik yuz berdi' });
    }
});

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

// Barcha o'yin xonalari shu yerda saqlanadi
const activeRooms: { [key: string]: RoomState } = {};

// Menejerlarni xonalarni ulashgan holda yaratamiz
const roomManager = new RoomManager(io, activeRooms);
// Admin Telegram bot (faqat .env da sozlangan bo'lsa ishlaydi)
startAdminBot(roomManager);
const gameEngine = new GameEngine(io, activeRooms, roomManager);

// O'yin siklini (Tick loop) fonda ishga tushiramiz
gameEngine.start();

io.on('connection', (socket) => {
    console.log(`Foydalanuvchi ulandi: ${socket.id}`);

    // Yangi ulanish bo'lganda mavjud xonalar ro'yxatini yuborish
    roomManager.broadcastRoomList();

    // 1. XONA YARATISH (endi userId/nickname bilan)
    // Hisobli (ro'yxatdan o'tgan) foydalanuvchi yaratsa, xona bazada SAQLANADI -
    // shunda do'stlar bilan ertaga qaytib, xuddi shu xarita progressida davom etish mumkin.
    // Mehmon (hisobsiz) yaratsa, xona eski-usulda vaqtinchalik bo'lib qoladi.
    socket.on('createRoom', async (data: { roomName: string, userId: string | null, nickname: string, isPrivate?: boolean, clientId?: string }) => {
        const roomName = (data.roomName || 'Xona').toString().slice(0, 40);
        const isPrivate = !!data.isPrivate;
        let roomId: string;
        let isPersistent = false;

        if (data.userId) {
            // Bloklangan hisob xona ocha olmaydi
            const owner = await db.getUserById(data.userId);
            if (owner && owner.banned) {
                socket.emit('accountBanned', { reason: owner.banReason });
                return;
            }
            try {
                const record = await db.createPersistentRoom(roomName, data.userId, isPrivate);
                roomId = record.roomCode;
                isPersistent = true;
            } catch (err) {
                console.error('createPersistentRoom xatosi:', err);
                socket.emit('joinError', 'Xonani saqlashda xatolik yuz berdi. Qayta urinib ko\'ring.');
                return;
            }
        } else {
            roomId = 'room_' + Math.random().toString(36).substring(2, 9);
        }

        activeRooms[roomId] = {
            id: roomId,
            name: roomName,
            hostId: socket.id,
            hostUserId: data.userId ?? null,
            players: {},
            bots: [],
            bullets: [],
            bulletIdCounter: 0,
            botsSpawned: 0,
            botsKilled: 0,
            snake: null,
            crates: [],
            coins: [],
            mines: [],
            walls: [],
            checkpointReached: [],
            isStarted: false,
            isOver: false,
            killsToWin: MAPS[0].killsToWin,
            unlockedLevel: 0,
            selectedLevel: 0,
            isPersistent: isPersistent,
            isPrivate: isPrivate
        };

        roomManager.joinPlayer(socket, roomId, data.userId ?? null, data.nickname || 'Mehmon', data.clientId ?? null);
    });

    // 2. XONAGA QO'SHILISH (ochiq xonalar ro'yxatidan bosib)
    socket.on('joinRoom', (data: { roomId: string, userId: string | null, nickname: string, clientId?: string }) => {
        if (activeRooms[data.roomId]) {
            roomManager.joinPlayer(socket, data.roomId, data.userId ?? null, data.nickname || 'Mehmon', data.clientId ?? null);
        } else {
            socket.emit('joinError', 'Xona topilmadi!');
        }
    });

    // 2b. XONA KODI ORQALI QO'SHILISH ("Mening xonalarim" yoki do'stdan olingan kod bilan)
    // Agar xona hozir xotirada faol bo'lmasa (masalan, server qayta ishga tushgan yoki
    // hammasi chiqib ketgan bo'lsa), bazadan progressni yuklab, xonani QAYTA TIKLAYMIZ -
    // lekin buni faqat o'sha xonaning asl xo'jayini (hostUserId mos kelsa) qila oladi.
    type JoinByCodeData = { roomCode: string, userId: string | null, nickname: string, clientId?: string };
    socket.on('joinRoomByCode', (data: JoinByCodeData) => joinByCode(data, false));

    // quiet = true: sahifa yangilangach avtomatik qayta kirish - muvaffaqiyatsiz
    // bo'lsa ogohlantirish (alert) emas, 'rejoinFailed' yuboriladi (klient menyuga qaytadi)
    async function joinByCode(data: JoinByCodeData, quiet: boolean): Promise<void> {
        const fail = (message: string) => socket.emit(quiet ? 'rejoinFailed' : 'joinError', message);
        const roomCode = (data.roomCode || '').toString().trim().toUpperCase();
        const clientId = typeof data.clientId === 'string' ? data.clientId : null;
        if (!roomCode) {
            fail('Xona kodini kiriting');
            return;
        }

        if (activeRooms[roomCode]) {
            roomManager.joinPlayer(socket, roomCode, data.userId ?? null, data.nickname || 'Mehmon', clientId);
            return;
        }

        // Xotirada yo'q - bazadan qidiramiz (saqlangan, lekin hozircha "yopiq" xona)
        try {
            const record = await db.getRoomByCode(roomCode);
            if (!record) {
                fail('Bunday kodli xona topilmadi');
                return;
            }
            if (!data.userId || data.userId !== record.hostUserId) {
                fail('Bu xona hali ochilmagan. Avval xona egasi shu kodni kiritib xonani ochishi kerak.');
                return;
            }

            // Xo'jayin o'zi qaytib kelganda, xonani saqlangan progress bilan qayta tiklaymiz
            activeRooms[roomCode] = {
                id: roomCode,
                name: record.name,
                hostId: socket.id,
                hostUserId: record.hostUserId,
                players: {},
                bots: [],
                bullets: [],
                bulletIdCounter: 0,
                botsSpawned: 0,
                botsKilled: 0,
                snake: null,
                crates: [],
                coins: [],
                mines: [],
                walls: [],
                checkpointReached: [],
                isStarted: false,
                isOver: false,
                // Ochilgan xaritalar - xo'jayin hisobidan (u kirganda qo'yiladi)
                killsToWin: MAPS[0].killsToWin,
                unlockedLevel: 0,
                selectedLevel: 0,
                isPersistent: true,
                isPrivate: record.isPrivate
            };
            roomManager.joinPlayer(socket, roomCode, data.userId, data.nickname || 'Mehmon', clientId);
        } catch (err) {
            console.error('joinRoomByCode xatosi:', err);
            fail('Xonaga ulanishda xatolik yuz berdi');
        }
    }

    // 2c. SAHIFA YANGILANGACH XONAGA QAYTISH: avval eski o'rnini (15s saqlanadi)
    // qaytarib olishga urinadi; bo'lmasa - oddiy qo'shilish (xona hali bor bo'lsa)
    socket.on('rejoinRoom', (data: { roomId: string, clientId: string, userId: string | null, nickname: string }) => {
        if (!data || typeof data.roomId !== 'string' || typeof data.clientId !== 'string') return;
        if (roomManager.reclaimPlayer(socket, data.roomId, data.clientId)) return;
        if (activeRooms[data.roomId]) {
            roomManager.joinPlayer(socket, data.roomId, data.userId ?? null, data.nickname || 'Mehmon', data.clientId);
            return;
        }
        joinByCode({ roomCode: data.roomId, userId: data.userId, nickname: data.nickname, clientId: data.clientId }, true);
    });

    // 3. LOBBIDA PERSONAJ TANLASH
    socket.on('selectCharacter', (data: { roomId: string, characterType: string }) => {
        if (!data) return;
        roomManager.selectCharacter(socket, data.roomId, data.characterType);
    });

    // 3b. LOBBIDA XARITA TANLASH (faqat xo'jayin, faqat ochilgan xaritalar orasidan)
    socket.on('selectLevelInRoom', (data: { roomId: string, levelIndex: number }) => {
        if (!data) return;
        roomManager.selectLevel(socket, data.roomId, data.levelIndex);
    });

    // 4. ADMIN O'YINNI BOSHLAGANDA
    socket.on('requestStartGame', (roomId: string) => {
        const room = activeRooms[roomId];
        if (room && room.hostId === socket.id) {
            // BARCHA (xo'jayindan tashqari) O'YINCHILAR "TAYYOR" BOSGANMI TEKSHIRAMIZ
            const otherPlayers = Object.values(room.players).filter(p => p.id !== room.hostId);
            const allReady = otherPlayers.every(p => p.isReady);
            if (!allReady) {
                socket.emit('startError', 'Barcha o\'yinchilar "Tayyor" tugmasini bosishi kerak!');
                return;
            }

            roomManager.startLevel(roomId);
        }
    });

    // 4b. ELF QISHLOG'I: tanishuv dialogi tugadi / katta eshikni kalit bilan ochish
    socket.on('dialogDone', (roomId: string) => {
        const room = activeRooms[roomId];
        if (room && room.isStarted) gameEngine.markIntroDone(room, socket.id);
    });
    socket.on('useBigDoor', (roomId: string) => {
        const room = activeRooms[roomId];
        if (room && room.isStarted) gameEngine.useBigDoor(room, socket.id);
    });

    // 4c. BOZOR: sotuvchi bilan suhbatni boshlash / keyingi qator
    socket.on('talkToSeller', (roomId: string) => roomManager.talkToSeller(socket, roomId));
    socket.on('cutsceneAdvance', (roomId: string) => roomManager.advanceCutscene(socket, roomId));

    // 4a. TANGANI OLISH (quti o'rnida qolgan tanga yonida E bosilganda)
    socket.on('pickupCoin', (data: { roomId: string, coinId: string }) => {
        const room = data && activeRooms[data.roomId];
        if (!room || !room.isStarted || typeof data.coinId !== 'string') return;
        gameEngine.handlePickupCoin(room, socket.id, data.coinId);
    });

    // 4b. LOBBIDA "TAYYOR" TUGMASINI BOSISH/QAYTARISH
    socket.on('toggleReadyInRoom', (roomId: string) => {
        roomManager.toggleReady(socket, roomId);
    });

    // 4c. LOBBI CHATI: xabar yuborish
    socket.on('sendLobbyChat', (data: { roomId: string, text: string }) => {
        if (!data || typeof data.text !== 'string') return;
        roomManager.sendChatMessage(socket, data.roomId, data.text);
    });

    // 5. PHASER YUKLANIB BO'LGACH O'YINCHINI ISHGA TUSHIRISH
    socket.on('playerReadyInRoom', (roomId: string) => {
        const room = activeRooms[roomId];
        if (room && room.players[socket.id]) {
            socket.emit('initPlayer', { ...room.players[socket.id], killsToWin: room.killsToWin });
            roomManager.sendCutsceneState(socket, roomId);
        }
    });

    // 6. HARAKAT KOORDINATALARINI SERVER BILAN SINXRONLASH
    socket.on('playerMoveInRoom', (data: { roomId: string, x: number, y: number }) => {
        // Klientdan kelgan son emas/NaN qiymat bot AI'ga tushsa, botlar
        // koordinatalari ham NaN bo'lib, butunlay "yo'qolib" qolardi
        if (!data || !Number.isFinite(data.x) || !Number.isFinite(data.y)) return;
        const room = activeRooms[data.roomId];
        if (room && room.players[socket.id]) {
            room.players[socket.id].x = data.x;
            room.players[socket.id].y = data.y;
        }
    });

    // 7. STANDART HUJUM (ENTER / SICHQONCHA) - endi bosib turish tizimi
    socket.on('startAttackInRoom', (data: { roomId: string, angle: number }) => {
        if (!data) return;
        roomManager.startAttack(socket, data.roomId, data.angle);
    });
    socket.on('stopAttackInRoom', (roomId: string) => {
        roomManager.stopAttack(socket, roomId);
    });

    // 8. MAXSUS QOBILIYAT (SHIFT) - barcha personajlar uchun bosib turish tizimi
    socket.on('startAbilityInRoom', (roomId: string) => {
        roomManager.startAbility(socket, roomId);
    });
    socket.on('stopAbilityInRoom', (roomId: string) => {
        roomManager.stopAbility(socket, roomId);
    });

    // 8b. "MENING PERSONAJIM" DAN SKIN SOTIB OLINGAN/KIYILGAN YOKI KO'NIKMA
    // YAXSHILANGANDAN SO'NG: agar xonada bo'lsa, jonli holatini (rang/kuch) sinxronlash
    socket.on('refreshCharacterInRoom', (roomId: string) => {
        roomManager.refreshCharacterInRoom(socket.id, roomId);
    });

    // 8a2. DARAJA IMKONIYATLARI: Q - ikkinchi qurol, R - maxsus qobiliyat
    socket.on('toggleWeapon', (roomId: string) => {
        if (typeof roomId === 'string') roomManager.toggleWeapon(socket, roomId);
    });
    socket.on('useSpecial', (roomId: string) => {
        if (typeof roomId === 'string') roomManager.useSpecial(socket, roomId);
    });

    // 8b2. EMOTSIYA (o'yinda "1" tugmasi): xonadagi hammaga - kim ko'rsatdi va qaysi emotsiya
    socket.on('emote', (data: { roomId: string, id: number }) => {
        if (!data || typeof data.roomId !== 'string' || data.id !== 1) return;
        const room = activeRooms[data.roomId];
        const p = room && room.players[socket.id];
        if (!p || !room.isStarted) return;
        const now = Date.now();
        if (now - (p.lastEmoteAt || 0) < 1500) return; // spamga qarshi
        p.lastEmoteAt = now;
        io.to(data.roomId).emit('emote', { playerId: socket.id, id: data.id });
    });

    // 8c. LOBBIDAN CHIQISH (o'yinchi o'zi bosh menyuga qaytmoqchi bo'lganda)
    socket.on('leaveRoom', () => {
        roomManager.leavePlayer(socket);
    });

    // 9. TARMOQDAN UZILISH
    socket.on('disconnect', () => {
        console.log(`Foydalanuvchi uzildi: ${socket.id}`);
        // Darhol chiqarmaymiz - sahifa yangilangan bo'lishi mumkin (o'rni 15s saqlanadi)
        roomManager.handleDisconnect(socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server professional modda ${PORT}-portda ishlamoqda.`);
});