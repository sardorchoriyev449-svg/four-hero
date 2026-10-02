import express from 'express';
import http from 'http';
import path from 'path';
import { Server } from 'socket.io';
import cors from 'cors';
import { RoomState } from './types';
import { RoomManager } from './managers/room.manager';
import { GameEngine } from './managers/game.engine';
import * as db from './db';
import { SKIN_CATALOG, getSkinPrice, WEAPON_SKIN_CATALOG, getWeaponSkinPrice, isKnownSkin } from './skins';
import { HEAD_ITEMS, FACE_ITEMS, WEAPON_ITEMS, findCosmetic, cosmeticKey } from './cosmetics';
import { MAPS } from './maps';
import { config } from 'dotenv';
import { startAdminBot } from './admin.bot';
import { signUser, verifyUser } from './auth';
config({quiet:true})

// Bitta kutilmagan xato (masalan, noto'g'ri formatdagi socket xabari) butun serverni - hamma
// o'yinchilarni - to'xtatib qo'ymasin: xato yoziladi, server ishlashda davom etadi
process.on('unhandledRejection', (err) => console.error('Kutilmagan xato (promise):', err));
process.on('uncaughtException', (err) => console.error('Kutilmagan xato:', err));

const app = express();
app.use(cors());
app.use(express.json({ limit: '20kb' }));

// Hisobga tegishli har so'rov (manzilida :userId / :id bor) - login paytida berilgan token bilan
// keladi (X-Auth-Token). Aks holda boshqa birovning ID sini bilgan har kim uning tangasini sarflardi
const requireAuth = (req: express.Request, res: express.Response, next: express.NextFunction, id: string) => {
    if (verifyUser(id, req.get('x-auth-token'))) return next();
    res.status(401).json({ success: false, message: 'err_session' });
};
app.param('userId', requireAuth);
app.param('id', requireAuth);

// Login/ro'yxatdan o'tish javobiga token qo'shiladi (klient uni saqlab, keyingi so'rovlarda yuboradi)
const withToken = (result: { success: boolean, user?: db.UserRecord }) =>
    result.success && result.user ? { ...result, user: { ...result.user, token: signUser(result.user.id) } } : result;

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
        res.json(withToken(result));
    } else {
        res.status(400).json(result);
    }
});

// TIZIMGA KIRISH: nickname va parol
app.post('/api/login', async (req, res) => {
    const { nickname, password } = req.body || {};
    const result = await db.loginUser(nickname, password);
    if (result.success) {
        res.json(withToken(result));
    } else {
        res.status(400).json(result);
    }
});

// FOYDALANUVCHI MA'LUMOTINI YANGILASH UCHUN (masalan, do'kon ochilganda)
app.get('/api/user/:id', async (req, res) => {
    const user = await db.getUserById(req.params.id);
    if (user) res.json({ success: true, user });
    else res.status(404).json({ success: false, message: 'err_not_found' });
});

// SKIN KATALOGINI OLISH (narxlar va ranglar)
app.get('/api/skins', (req, res) => {
    res.json({ success: true, catalog: SKIN_CATALOG });
});

// XARITALAR RO'YXATINI OLISH (nom, tavsif, rang - lobbida ko'rsatish uchun)
// ===== REKLAMA =====
// Reklama tarmog'i ID lari .env (Render -> Environment) dan olinadi. ADS_CLIENT bo'lmasa - reklama
// umuman ko'rinmaydi. ADS_CLIENT: "ca-pub-XXXXXXXXXXXXXXXX" (Google AdSense / H5 Games Ads),
// ADS_SLOT_LEFT / ADS_SLOT_RIGHT - uzunchoq (160x600) bannerlar slot ID si,
// ADS_REWARD=off - tanga uchun reklamani o'chirish, ADS_TEST=on - sinov rejimi (haqiqiy pul yo'q)
const AD_REWARD_COINS = 500;
const AD_COOLDOWN_MS = 3 * 60 * 1000;
const AD_DAILY_CAP = 10;
const AD_MIN_WATCH_MS = 5000;
const adClient = () => (process.env.ADS_CLIENT || '').trim();
// AdSense hisobi (ochiq ma'lumot) - ads.txt .env sozlanmagan bo'lsa ham shu bilan chiqadi
const AD_PUBLISHER = 'ca-pub-3350609734222055';
app.get('/api/ads/config', (_req, res) => {
    const client = adClient();
    res.json({
        enabled: /^ca-pub-\d+$/.test(client),
        client,
        slotLeft: (process.env.ADS_SLOT_LEFT || '').trim(),
        slotRight: (process.env.ADS_SLOT_RIGHT || '').trim(),
        reward: (process.env.ADS_REWARD || 'on').trim() !== 'off',
        test: (process.env.ADS_TEST || '').trim() === 'on',
        rewardCoins: AD_REWARD_COINS,
        dailyCap: AD_DAILY_CAP
    });
});
// AdSense talab qiladigan ads.txt - ADS_CLIENT dan avtomatik yasaladi
app.get('/ads.txt', (_req, res) => {
    const m = (adClient() || AD_PUBLISHER).match(/^ca-(pub-\d+)$/);
    if (!m) { res.status(404).end(); return; }
    res.type('text/plain').send(`google.com, ${m[1]}, DIRECT, f08c47fec0942fa0\n`);
});
// Reklama boshlanishi: bir martalik chipta (ko'rmasdan darrov "mukofot" so'ralmasin)
const adTickets = new Map<string, { nonce: string, at: number }>();
app.post('/api/ads/:userId/start', (req, res) => {
    if (!adClient()) { res.status(404).json({ success: false }); return; }
    const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
    adTickets.set(req.params.userId, { nonce, at: Date.now() });
    res.json({ success: true, nonce });
});
app.post('/api/ads/:userId/reward', async (req, res) => {
    try {
        if (!adClient()) { res.status(404).json({ success: false }); return; }
        const tk = adTickets.get(req.params.userId);
        const age = tk ? Date.now() - tk.at : 0;
        if (!tk || !req.body || req.body.nonce !== tk.nonce || age < AD_MIN_WATCH_MS || age > 10 * 60 * 1000) {
            res.json({ success: false, message: 'err_ad_invalid' });
            return;
        }
        adTickets.delete(req.params.userId);
        const r = await db.claimAdReward(req.params.userId, AD_REWARD_COINS, AD_COOLDOWN_MS, AD_DAILY_CAP);
        res.json(r.success ? { success: true, coins: r.user!.coins, left: r.left, reward: AD_REWARD_COINS } : r);
    } catch (e) {
        res.status(500).json({ success: false, message: 'err_server' });
    }
});

app.get('/api/maps', (req, res) => {
    res.json({ success: true, maps: MAPS.map(m => ({ id: m.id, name: m.name, description: m.description, accentColor: m.accentColor })) });
});

// FOYDALANUVCHI SAQLAGAN ("MENING XONALARIM") XONALAR RO'YXATI
app.get('/api/my-rooms/:userId', async (req, res) => {
    try {
        const rooms = await db.getRoomsByHost(req.params.userId);
        res.json({ success: true, rooms });
    } catch (err) {
        res.status(500).json({ success: false, message: 'err_load_rooms' });
    }
});

// "MENING SAQLANGAN XONAM" - foydalanuvchi ENG OXIRGI yaratgan/xo'jayin bo'lgan bitta xona
app.get('/api/my-rooms/:userId/latest', async (req, res) => {
    try {
        const room = await db.getMostRecentRoomByHost(req.params.userId);
        res.json({ success: true, room });
    } catch (err) {
        res.status(500).json({ success: false, message: 'err_load_room' });
    }
});

// "MENING PERSONAJIM" - barcha personajlar uchun yaxshilash darajalari va ballar
app.get('/api/character/:userId', async (req, res) => {
    try {
        const user = await db.getUserById(req.params.userId);
        if (!user) {
            res.status(404).json({ success: false, message: 'err_user_not_found' });
            return;
        }
        // "Daraja" - tajribadan (har o'tilgan xarita +10 XP, har daraja uchun kerakli XP x2)
        res.json({
            success: true,
            defaultCharacter: user.defaultCharacter,
            coins: user.coins,
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
            equippedWeaponSkins: user.equippedWeaponSkins,
            ownedCosmetics: user.ownedCosmetics,
            equippedCosmetics: user.equippedCosmetics
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'err_load_data' });
    }
});

// KO'RSATILADIGAN ("DEFAULT") PERSONAJNI O'ZGARTIRISH - shu personaj bilan endi
// istalgan xonaga kirganda avtomatik shu qahramon sifatida o'ynaydi
app.post('/api/character/:userId/default', async (req, res) => {
    const characterType = req.body?.characterType;
    try {
        const user = await db.setDefaultCharacter(req.params.userId, characterType);
        if (!user) {
            res.status(400).json({ success: false, message: 'err_bad_character' });
            return;
        }
        res.json({ success: true, defaultCharacter: user.defaultCharacter });
    } catch (err) {
        res.status(500).json({ success: false, message: 'generic_error' });
    }
});

// KO'NIKMA BALLINI SARFLAB, TANLANGAN PERSONAJNING "damage" YOKI "stamina" NI OSHIRISH
// MUHIM: bu FAQAT lobbida/xonada, aynan o'sha personaj hozir tanlangan bo'lsa ishlaydi -
// "Mening Personajim" ekranini bosh menyudan ochib kuchaytirib bo'lmaydi (faqat ko'rish mumkin)
app.post('/api/character/:userId/upgrade', async (req, res) => {
    const { characterType, stat, roomId, payWith } = req.body || {};
    if (typeof stat !== 'string' || typeof characterType !== 'string') {
        res.status(400).json({ success: false, message: 'err_bad_skill' });
        return;
    }

    // Kuchaytirish hisobga bog'liq - bosh menyudan ham, lobbidan ham. Xonada bo'lsa -
    // o'sha xonadagi holati ham darhol yangilanadi
    const room = roomId ? activeRooms[roomId] : null;
    const playerInRoom = room ? Object.values(room.players).find(p => p.userId === req.params.userId) : null;

    try {
        const result = await db.upgradeStat(req.params.userId, characterType, stat, payWith === 'coins' ? 'coins' : 'points');
        if (result.success && playerInRoom) {
            roomManager.refreshCharacterInRoom(playerInRoom.id, roomId);
        }
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, message: 'err_upgrade_failed' });
    }
});

// TANA SKINI SOTIB OLISH / KIYISH: hisobga bog'liq - xonada bo'lish shart EMAS
// (ilgari bu faqat socket+xona orqali ishlar edi, shuning uchun "Mening personajim"
// ekranini bosh menyudan ochganda "ro'yxatdan o'tmagansiz" degan noto'g'ri xato chiqardi)
app.post('/api/skins/:userId/buy', async (req, res) => {
    const { characterType, skinId } = req.body || {};
    if (!isKnownSkin(characterType, skinId)) { res.status(400).json({ success: false, message: 'err_not_found' }); return; }
    try {
        const price = getSkinPrice(characterType, skinId);
        const result = await db.buySkin(req.params.userId, characterType, skinId, price, 'body');
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, message: 'generic_error' });
    }
});

app.post('/api/skins/:userId/equip', async (req, res) => {
    const { characterType, skinId } = req.body || {};
    if (!isKnownSkin(characterType, skinId)) { res.status(400).json({ success: false, message: 'err_not_found' }); return; }
    try {
        const result = await db.equipSkin(req.params.userId, characterType, skinId, 'body');
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, message: 'generic_error' });
    }
});

// QUROL SKINI KATALOGI
app.get('/api/weapon-skins', (req, res) => {
    res.json({ success: true, catalog: WEAPON_SKIN_CATALOG });
});

// QUROL SKINI SOTIB OLISH / KIYISH - tana skinidan ALOHIDA
app.post('/api/weapon-skins/:userId/buy', async (req, res) => {
    const { characterType, skinId } = req.body || {};
    if (!isKnownSkin(characterType, skinId, true)) { res.status(400).json({ success: false, message: 'err_not_found' }); return; }
    try {
        const price = getWeaponSkinPrice(characterType, skinId);
        const result = await db.buySkin(req.params.userId, characterType, skinId, price, 'weapon');
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, message: 'generic_error' });
    }
});

app.post('/api/weapon-skins/:userId/equip', async (req, res) => {
    const { characterType, skinId } = req.body || {};
    if (!isKnownSkin(characterType, skinId, true)) { res.status(400).json({ success: false, message: 'err_not_found' }); return; }
    try {
        const result = await db.equipSkin(req.params.userId, characterType, skinId, 'weapon');
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, message: 'generic_error' });
    }
});

// DETALLAR (bosh kiyimi, yuz buyumi, qurol ko'rinishlari): katalog, sotib olish, kiyish/yechish
app.get('/api/cosmetics', (req, res) => {
    res.json({ success: true, head: HEAD_ITEMS, face: FACE_ITEMS, weapons: WEAPON_ITEMS });
});

// Kiyilgan detal o'zgarsa - shu hisob hozir biror xonada bo'lsa, u yerdagi ko'rinishi ham darhol yangilanadi
function refreshUserInRooms(userId: string): void {
    Object.values(activeRooms).forEach(room => {
        const p = Object.values(room.players).find(pl => pl.userId === userId);
        if (p) roomManager.refreshCharacterInRoom(p.id, room.id).catch(() => {});
    });
}

app.post('/api/cosmetics/:userId/buy', async (req, res) => {
    const { characterType, slot, itemId } = req.body || {};
    const item = findCosmetic(characterType, slot, itemId);
    if (!item) {
        res.status(400).json({ success: false, message: 'err_not_found' });
        return;
    }
    try {
        res.json(await db.buyCosmetic(req.params.userId, cosmeticKey(characterType, slot, item.id), item.price));
    } catch (err) {
        res.status(500).json({ success: false, message: 'generic_error' });
    }
});

app.post('/api/cosmetics/:userId/equip', async (req, res) => {
    const { characterType, slot, itemId } = req.body || {};
    if (typeof characterType !== 'string' || !WEAPON_ITEMS[characterType]) {
        res.status(400).json({ success: false, message: 'err_bad_character' });
        return;
    }
    // itemId: null - yechish (slot shu personajga tegishli bo'lishi kerak)
    const validSlot = slot === 'head' || slot === 'face' || !!(WEAPON_ITEMS[characterType] && WEAPON_ITEMS[characterType][slot]);
    const item = itemId === null ? null : findCosmetic(characterType, slot, itemId);
    if (!validSlot || (itemId !== null && !item)) {
        res.status(400).json({ success: false, message: 'err_not_found' });
        return;
    }
    try {
        const result = await db.equipCosmetic(req.params.userId, characterType, slot, item ? item.id : null,
            item ? cosmeticKey(characterType, slot, item.id) : null);
        if (result.success) refreshUserInRooms(req.params.userId);
        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, message: 'generic_error' });
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

// O'yinchi ismi: matn, bo'sh joylarsiz, ko'pi bilan 20 belgi
const cleanNick = (n: unknown) => (typeof n === 'string' ? n.trim().slice(0, 20) : '') || 'Guest';

io.on('connection', (socket) => {
    console.log(`Foydalanuvchi ulandi: ${socket.id}`);

    // Hisob nomidan kelgan so'rov: userId bo'lsa, token to'g'ri bo'lishi shart.
    // null - mehmon; undefined - token noto'g'ri (klientga "sessiya tugadi" deyiladi, so'rov bajarilmaydi)
    const authedUserId = (data: any): string | null | undefined => {
        if (!data || !data.userId) return null;
        if (verifyUser(data.userId, data.token)) return data.userId;
        socket.emit('sessionExpired');
        return undefined;
    };

    // Yangi ulanish bo'lganda mavjud xonalar ro'yxatini yuborish
    roomManager.broadcastRoomList();

    // 1. XONA YARATISH (endi userId/nickname bilan)
    // Hisobli (ro'yxatdan o'tgan) foydalanuvchi yaratsa, xona bazada SAQLANADI -
    // shunda do'stlar bilan ertaga qaytib, xuddi shu xarita progressida davom etish mumkin.
    // Mehmon (hisobsiz) yaratsa, xona eski-usulda vaqtinchalik bo'lib qoladi.
    socket.on('createRoom', async (data: { roomName: string, userId: string | null, token?: string, nickname: string, isPrivate?: boolean, clientId?: string }) => {
        if (!data) return;
        const userId = authedUserId(data);
        if (userId === undefined) return;
        const roomName = (typeof data.roomName === 'string' && data.roomName.trim() ? data.roomName.trim() : 'Room').slice(0, 40);
        const isPrivate = !!data.isPrivate;
        let roomId: string;
        let isPersistent = false;

        if (userId) {
            // Bloklangan hisob xona ocha olmaydi
            const owner = await db.getUserById(userId);
            if (owner && owner.banned) {
                socket.emit('accountBanned', { reason: owner.banReason });
                return;
            }
            try {
                const record = await db.createPersistentRoom(roomName, userId, isPrivate);
                roomId = record.roomCode;
                isPersistent = true;
            } catch (err) {
                console.error('createPersistentRoom xatosi:', err);
                socket.emit('joinError', 'err_room_save');
                return;
            }
        } else {
            roomId = 'room_' + Math.random().toString(36).substring(2, 9);
        }

        activeRooms[roomId] = {
            id: roomId,
            name: roomName,
            hostId: socket.id,
            hostUserId: userId,
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

        await roomManager.joinPlayer(socket, roomId, userId, cleanNick(data.nickname), typeof data.clientId === 'string' ? data.clientId : null);
        // Kira olmagan bo'lsa (hisob boshqa joyda band va h.k.) - bo'sh xona ro'yxatda qolib ketmasin
        if (activeRooms[roomId] && Object.keys(activeRooms[roomId].players).length === 0) {
            delete activeRooms[roomId];
            roomManager.broadcastRoomList();
        }
    });

    // 2. XONAGA QO'SHILISH (ochiq xonalar ro'yxatidan bosib)
    socket.on('joinRoom', (data: { roomId: string, userId: string | null, token?: string, nickname: string, clientId?: string }) => {
        if (!data || typeof data.roomId !== 'string') return;
        const userId = authedUserId(data);
        if (userId === undefined) return;
        if (activeRooms[data.roomId]) {
            roomManager.joinPlayer(socket, data.roomId, userId, cleanNick(data.nickname), typeof data.clientId === 'string' ? data.clientId : null);
        } else {
            socket.emit('joinError', 'err_room_not_found');
        }
    });

    // 2b. XONA KODI ORQALI QO'SHILISH ("Mening xonalarim" yoki do'stdan olingan kod bilan)
    // Agar xona hozir xotirada faol bo'lmasa (masalan, server qayta ishga tushgan yoki
    // hammasi chiqib ketgan bo'lsa), bazadan progressni yuklab, xonani QAYTA TIKLAYMIZ -
    // lekin buni faqat o'sha xonaning asl xo'jayini (hostUserId mos kelsa) qila oladi.
    type JoinByCodeData = { roomCode: string, userId: string | null, token?: string, nickname: string, clientId?: string };
    socket.on('joinRoomByCode', (data: JoinByCodeData) => joinByCode(data, false));

    // quiet = true: sahifa yangilangach avtomatik qayta kirish - muvaffaqiyatsiz
    // bo'lsa ogohlantirish (alert) emas, 'rejoinFailed' yuboriladi (klient menyuga qaytadi)
    async function joinByCode(data: JoinByCodeData, quiet: boolean): Promise<void> {
        const fail = (message: string) => socket.emit(quiet ? 'rejoinFailed' : 'joinError', message);
        if (!data) return;
        const userId = authedUserId(data);
        if (userId === undefined) return;
        const nickname = cleanNick(data.nickname);
        const roomCode = (typeof data.roomCode === 'string' ? data.roomCode : '').trim().toUpperCase().slice(0, 40);
        const clientId = typeof data.clientId === 'string' ? data.clientId : null;
        if (!roomCode) {
            fail('err_enter_code');
            return;
        }

        if (activeRooms[roomCode]) {
            roomManager.joinPlayer(socket, roomCode, userId, nickname, clientId);
            return;
        }

        // Xotirada yo'q - bazadan qidiramiz (saqlangan, lekin hozircha "yopiq" xona)
        try {
            const record = await db.getRoomByCode(roomCode);
            if (!record) {
                fail('err_code_not_found');
                return;
            }
            if (!userId || userId !== record.hostUserId) {
                fail('err_room_not_open');
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
            roomManager.joinPlayer(socket, roomCode, userId, nickname, clientId);
        } catch (err) {
            console.error('joinRoomByCode xatosi:', err);
            fail('err_join_failed');
        }
    }

    // 2c. SAHIFA YANGILANGACH XONAGA QAYTISH: avval eski o'rnini (15s saqlanadi)
    // qaytarib olishga urinadi; bo'lmasa - oddiy qo'shilish (xona hali bor bo'lsa)
    socket.on('rejoinRoom', async (data: { roomId: string, clientId: string, userId: string | null, token?: string, nickname: string }) => {
        if (!data || typeof data.roomId !== 'string' || typeof data.clientId !== 'string') return;
        const userId = authedUserId(data);
        if (userId === undefined) return;
        if ((await roomManager.reclaimPlayer(socket, data.roomId, data.clientId)) === 'reclaimed') return;
        if (activeRooms[data.roomId]) {
            roomManager.joinPlayer(socket, data.roomId, userId, cleanNick(data.nickname), data.clientId);
            return;
        }
        joinByCode({ roomCode: data.roomId, userId: data.userId, token: data.token, nickname: data.nickname, clientId: data.clientId }, true);
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
        const room = typeof roomId === 'string' ? activeRooms[roomId] : undefined;
        if (room && room.hostId === socket.id && !room.isStarted) {
            // BARCHA (xo'jayindan tashqari) O'YINCHILAR "TAYYOR" BOSGANMI TEKSHIRAMIZ
            const otherPlayers = Object.values(room.players).filter(p => p.id !== room.hostId);
            const allReady = otherPlayers.every(p => p.isReady);
            if (!allReady) {
                socket.emit('startError', 'err_not_all_ready');
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
    socket.on('doorChoice', (data: { roomId: string, choice: string }) => {
        const room = data && typeof data.roomId === 'string' ? activeRooms[data.roomId] : undefined;
        if (room && room.isStarted && (data.choice === 'enter' || data.choice === 'no')) gameEngine.doorChoice(room, socket.id, data.choice);
    });
    socket.on('doorsInteract', (roomId: string) => {
        const room = typeof roomId === 'string' ? activeRooms[roomId] : undefined;
        if (room && room.isStarted) gameEngine.doorsInteract(room, socket.id);
    });
    socket.on('pullCarrot', (roomId: string) => {
        const room = typeof roomId === 'string' ? activeRooms[roomId] : undefined;
        if (room && room.isStarted) gameEngine.pullCarrot(room, socket.id);
    });
    socket.on('useLift', (roomId: string) => {
        const room = typeof roomId === 'string' ? activeRooms[roomId] : undefined;
        if (room && room.isStarted) gameEngine.useLift(room, socket.id);
    });
    socket.on('talkTroll', (roomId: string) => {
        const room = typeof roomId === 'string' ? activeRooms[roomId] : undefined;
        if (room && room.isStarted) gameEngine.talkTroll(room, socket.id);
    });
    socket.on('talkFatElf', (roomId: string) => {
        const room = typeof roomId === 'string' ? activeRooms[roomId] : undefined;
        if (room && room.isStarted) gameEngine.talkFatElf(room, socket.id);
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

    // 4b1. PAUZA (faqat yolg'iz o'yinchi)
    socket.on('setPaused', (data: { roomId: string, paused: boolean }) => {
        if (!data || typeof data.roomId !== 'string') return;
        roomManager.setPaused(socket, data.roomId, !!data.paused);
    });

    // 4b2. KICK: xona egasi o'yinchini xonadan chiqaradi
    socket.on('kickPlayer', (data: { roomId: string, targetId: string }) => {
        if (!data || typeof data.roomId !== 'string') return;
        roomManager.kickPlayer(socket, data.roomId, data.targetId);
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
            roomManager.markLoaded(socket, roomId); // xarita yuklandi - hamma tayyor bo'lsa raund boshlanadi
        }
    });

    // 6. HARAKAT KOORDINATALARINI SERVER BILAN SINXRONLASH
    socket.on('playerMoveInRoom', (data: { roomId: string, x: number, y: number }) => {
        // Klientdan kelgan son emas/NaN qiymat bot AI'ga tushsa, botlar
        // koordinatalari ham NaN bo'lib, butunlay "yo'qolib" qolardi
        if (!data || !Number.isFinite(data.x) || !Number.isFinite(data.y)) return;
        const room = activeRooms[data.roomId];
        // Yangi xaritani hali yuklayotgan o'yinchining harakati - eski xaritadan kechikib kelgan paket:
        // qabul qilinsa yangi xaritadagi boshlang'ich joy eski koordinataga (devor/fon ichiga) almashardi
        if (room && room.loadingIds && room.loadingIds.includes(socket.id)) return;
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
        if (!data || typeof data.roomId !== 'string' || (data.id !== 1 && data.id !== 2)) return;
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

// Render (va boshqa hostinglar) portni PORT orqali beradi; tashqaridan kirish uchun barcha tarmoq interfeyslarida tinglaymiz
const PORT = Number(process.env.PORT) || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server professional modda ${PORT}-portda ishlamoqda.`);
});