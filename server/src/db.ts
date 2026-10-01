import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { config } from 'dotenv';
import { WEAPON_UPGRADES, WEAPON_UPGRADE_LEVEL, UPGRADE_COSTS, BASE_UPGRADES } from './perks';
config({quiet:true})
// Agar MongoDB'ga ulanib bo'lmasa yoki vaqtincha uzilib qolsa, so'rovlar
// abadiy "osilib qolmasligi" uchun (aks holda foydalanuvchi cheksiz kutib qolardi)
mongoose.set('bufferTimeoutMS', 8000);

// MongoDB ulanish manzili. Agar .env yoki muhit o'zgaruvchisida MONGODB_URI
// berilgan bo'lsa o'shani, aks holda lokal MongoDB'ni ishlatadi.
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/four_heroes';

mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB bilan muvaffaqiyatli ulandi:', MONGO_URI))
    .catch((err) => {
        console.error('MongoDB ulanishida xatolik! MongoDB kompyuteringizda ishga tushirilganiga ishonch hosil qiling.');
        console.error(err.message);
    });

const DEFAULT_OWNED_SKINS = { knight: ['default'], samurai: ['default'], archer: ['default'], mage: ['default'] };
const DEFAULT_EQUIPPED_SKINS = { knight: 'default', samurai: 'default', archer: 'default', mage: 'default' };
const CHARACTER_TYPES = ['knight', 'archer', 'mage', 'samurai'];
const DEFAULT_UPGRADES = { knight: { damage: 0, stamina: 0 }, archer: { damage: 0, stamina: 0 }, mage: { damage: 0, stamina: 0 }, samurai: { damage: 0, stamina: 0 } };
const DEFAULT_SKILL_POINTS = { knight: 0, archer: 0, mage: 0, samurai: 0 };
const DEFAULT_CREDITED_LEVELS = { knight: [], archer: [], mage: [], samurai: [] };
const MAX_UPGRADE_LEVEL = 5;

// MONGOOSE SXEMASI (jadval strukturasi o'rniga)
const userSchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    nickname: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
    coins: { type: Number, required: true, default: 0 },
    ownedSkins: { type: Object, required: true, default: DEFAULT_OWNED_SKINS },
    equippedSkins: { type: Object, required: true, default: DEFAULT_EQUIPPED_SKINS },
    ownedWeaponSkins: { type: Object, required: true, default: DEFAULT_OWNED_SKINS },        // qurol uchun alohida skin turkumi
    equippedWeaponSkins: { type: Object, required: true, default: DEFAULT_EQUIPPED_SKINS },
    defaultCharacter: { type: String, required: true, default: 'knight' },          // "Mening personajim" ekrani ochilganda qaysi personaj ko'rsatiladi
    // MUHIM: yaxshilashlar HAR BIR PERSONAJ TURI UCHUN ALOHIDA saqlanadi -
    // faqat "mage" bilan o'ynasangiz, faqat mage kuchayadi, boshqalar bazaviy holatda qoladi
    upgrades: { type: Object, required: true, default: DEFAULT_UPGRADES },          // { knight: {damage,stamina}, archer: {...}, ... }
    skillPoints: { type: Object, required: true, default: DEFAULT_SKILL_POINTS },   // { knight: 0, archer: 0, ... }
    creditedLevels: { type: Object, required: true, default: DEFAULT_CREDITED_LEVELS }, // { knight: [levelId,...], ... } - ferma qilishning oldini olish uchun
    // PROGRESS HISOBGA bog'liq (xonaga emas): ochilgan eng yuqori xarita va tajriba (XP)
    unlockedLevel: { type: Number, required: true, default: 0 },
    xp: { type: Number, required: true, default: 0 },
    // HAR PERSONAJ tajribasi: shu personaj bilan o'tilgan har xarita +10 (daraja imkoniyatlari shundan)
    charXp: { type: Object, required: true, default: () => ({ knight: 0, archer: 0, mage: 0, samurai: 0 }) },
    // DETALLAR: sotib olinganlar ("head:cowboy", "knight.sword:bat") va har personajda kiyilganlari
    // ({ knight: { head: 'cowboy', sword: 'bat' }, ... })
    ownedCosmetics: { type: [String], default: () => [] },
    equippedCosmetics: { type: Object, default: () => ({}) },
    // ADMIN (Telegram bot) bloklagan hisob: kira olmaydi, xonaga qo'shila olmaydi
    banned: { type: Boolean, required: true, default: false },
    banReason: { type: String, default: '' }
}, { timestamps: true });

const UserModel = mongoose.model('User', userSchema);

export interface UserRecord {
    id: string;
    fullName: string;
    nickname: string;
    coins: number;
    ownedSkins: { [character: string]: string[] };
    equippedSkins: { [character: string]: string };
    ownedWeaponSkins: { [character: string]: string[] };
    equippedWeaponSkins: { [character: string]: string };
    defaultCharacter: string;
    upgrades: { [character: string]: { damage: number, stamina: number } };
    skillPoints: { [character: string]: number };
    creditedLevels: { [character: string]: number[] };
    unlockedLevel: number;
    xp: number;
    charXp: { [character: string]: number };
    ownedCosmetics: string[];
    equippedCosmetics: { [character: string]: { [slot: string]: string } };
    banned: boolean;
    banReason: string;
    createdAt: Date | null;
}

// TAJRIBA DARAJASI: har o'tilgan xarita +XP_PER_MAP; har keyingi darajaga kerakli XP ikki
// baravar oshadi (0->1: 10, 1->2: 20, 2->3: 40, ...)
export const XP_PER_MAP = 10;
export function xpLevel(xp: number): number {
    let level = 0, need = XP_PER_MAP, rest = Math.max(0, xp || 0);
    while (rest >= need) { rest -= need; level++; need *= 2; }
    return level;
}

// Eski (bitta, umumiy) formatdagi hisoblar bo'lsa ham xatoga olib kelmasligi uchun,
// har doim barcha 4 personaj uchun standart qiymatlar bilan to'ldirib qaytaramiz
function docToUser(doc: any): UserRecord {
    const rawUpgrades = doc.upgrades || {};
    const rawPoints = doc.skillPoints || {};
    const rawCredited = doc.creditedLevels || {};
    const upgrades: any = {};
    const skillPoints: any = {};
    const creditedLevels: any = {};
    CHARACTER_TYPES.forEach((c) => {
        upgrades[c] = rawUpgrades[c] || { damage: 0, stamina: 0 };
        skillPoints[c] = typeof rawPoints[c] === 'number' ? rawPoints[c] : 0;
        creditedLevels[c] = rawCredited[c] || [];
    });

    return {
        id: doc._id.toString(),
        fullName: doc.fullName,
        nickname: doc.nickname,
        coins: doc.coins,
        ownedSkins: doc.ownedSkins,
        equippedSkins: doc.equippedSkins,
        ownedWeaponSkins: doc.ownedWeaponSkins || DEFAULT_OWNED_SKINS,
        equippedWeaponSkins: doc.equippedWeaponSkins || DEFAULT_EQUIPPED_SKINS,
        defaultCharacter: doc.defaultCharacter || 'knight',
        upgrades: upgrades,
        skillPoints: skillPoints,
        creditedLevels: creditedLevels,
        ...legacyProgress(doc, creditedLevels),
        ownedCosmetics: Array.isArray(doc.ownedCosmetics) ? [...doc.ownedCosmetics] : [],
        equippedCosmetics: doc.equippedCosmetics || {},
        banned: !!doc.banned,
        banReason: doc.banReason || '',
        createdAt: doc.createdAt || null
    };
}

// ESKI HISOB: progress avval foydalanuvchida emas, u yaratgan SAQLANGAN XONALARDA turardi.
// Hisobda hali ochilgan xarita yozilmagan bo'lsa - uning xonalaridagi eng yuqori ochilgan xarita
// (va o'tilgan xaritalar tarixi) dan olinib, BIR MARTA hisobga yoziladi
async function migrateRoomProgress(doc: any): Promise<void> {
    if (typeof doc.$isDefault !== 'function' || !doc.$isDefault('unlockedLevel')) return;
    try {
        const best = await RoomModel.findOne({ hostUserId: doc._id }).sort({ unlockedLevel: -1 });
        const fromRooms = best ? (best as any).unlockedLevel || 0 : 0;
        doc.unlockedLevel = Math.max(fromRooms, docToUser(doc).unlockedLevel);
        await doc.save();
    } catch (err) {
        console.error('migrateRoomProgress xatosi:', err);
    }
}

// ESKI HISOBLAR (progress xonada saqlangan davrdagi): bazada unlockedLevel/xp hali yo'q bo'lsa -
// o'tilgan xaritalar tarixidan (creditedLevels) hisoblaymiz: ochilgan = eng katta o'tilgan + 1,
// XP = o'tilgan xaritalar soni x XP_PER_MAP. Keyingi saqlashda bazaga yoziladi
function legacyProgress(doc: any, credited: { [c: string]: number[] }): { unlockedLevel: number, xp: number, charXp: { [c: string]: number } } {
    const isDefault = (path: string) => typeof doc.$isDefault === 'function' ? doc.$isDefault(path) : doc[path] === undefined;
    const ids = new Set<number>();
    Object.values(credited).forEach(list => list.forEach(id => ids.add(id)));
    // O'tilgan xaritalar tarixi (creditedLevels) bo'yicha ham tekshiriladi: ilgari oxirgi xaritani o'tgan
    // o'yinchining progressi o'sha xaritada "qotib" qolardi - endi keyingi (yangi) xarita ochiq
    const fromHistory = ids.size ? Math.max(...ids) + 1 : 0;
    const unlockedLevel = isDefault('unlockedLevel') ? fromHistory : Math.max(doc.unlockedLevel || 0, fromHistory);
    const xp = isDefault('xp') ? Object.values(credited).reduce((a, list) => a + list.length, 0) * XP_PER_MAP : (doc.xp || 0);
    // Personaj tajribasi yo'q (eski hisob) - shu personaj bilan o'tilgan xaritalar tarixidan
    const charXp: { [c: string]: number } = {};
    CHARACTER_TYPES.forEach((c) => {
        const saved = doc.charXp && typeof doc.charXp[c] === 'number' ? doc.charXp[c] : null;
        charXp[c] = (saved !== null && !isDefault('charXp')) ? saved : (credited[c] || []).length * XP_PER_MAP;
    });
    return { unlockedLevel, xp, charXp };
}

// RO'YXATDAN O'TISH: ism, nickname va parol bilan
// Faqat matn qabul qilinadi (obyekt yuborilsa - masalan {"$ne": null} - bazaga so'rov sifatida
// ketib qolmasin), chetidagi bo'sh joylar olib tashlanadi
const str = (v: unknown) => typeof v === 'string' ? v.trim() : '';
export const NICKNAME_MAX = 20;

export async function registerUser(fullNameRaw: unknown, nicknameRaw: unknown, passwordRaw: unknown): Promise<{ success: boolean, message?: string, user?: UserRecord }> {
    const fullName = str(fullNameRaw), nickname = str(nicknameRaw);
    const password = typeof passwordRaw === 'string' ? passwordRaw : '';
    if (!fullName || !nickname || !password) {
        return { success: false, message: 'err_fields_required' };
    }
    if (password.length < 4) {
        return { success: false, message: 'err_password_short' };
    }
    if (nickname.length < 3 || nickname.length > NICKNAME_MAX || fullName.length > 40 || password.length > 72) {
        return { success: false, message: 'err_field_length' };
    }

    const existing = await UserModel.findOne({ nickname });
    if (existing) {
        return { success: false, message: 'err_nickname_taken' };
    }

    // Asinxron hash: sinxron variant butun serverni (o'yin siklini ham) ~0.1s to'xtatib turardi
    const passwordHash = await bcrypt.hash(password, 10);
    try {
        const doc = await UserModel.create({
            fullName,
            nickname,
            passwordHash,
            coins: 0,
            ownedSkins: DEFAULT_OWNED_SKINS,
            equippedSkins: DEFAULT_EQUIPPED_SKINS
        });
        return { success: true, user: docToUser(doc) };
    } catch (err: any) {
        // Ikki kishi bir vaqtda bir xil nickname bilan ro'yxatdan o'tsa
        if (err && err.code === 11000) return { success: false, message: 'err_nickname_taken' };
        throw err;
    }
}

// TIZIMGA KIRISH: nickname va parol bilan
export async function loginUser(nicknameRaw: unknown, passwordRaw: unknown): Promise<{ success: boolean, message?: string, user?: UserRecord }> {
    const nickname = str(nicknameRaw);
    const password = typeof passwordRaw === 'string' ? passwordRaw : '';
    if (!nickname || !password) {
        return { success: false, message: 'err_fields_required' };
    }
    const doc = await UserModel.findOne({ nickname });
    if (!doc) {
        return { success: false, message: 'err_no_such_user' };
    }
    if (!(await bcrypt.compare(password, doc.passwordHash))) {
        return { success: false, message: 'err_wrong_password' };
    }
    if ((doc as any).banned) {
        return { success: false, message: 'err_banned' + ((doc as any).banReason ? '|' + (doc as any).banReason : '') };
    }
    await migrateRoomProgress(doc);
    return { success: true, user: docToUser(doc) };
}

// O'LDIRISH / BOSS MUKOFOTI: tanga va tajriba (umumiy va shu personajning) - bitta atomar yozuv
export async function addRewards(userId: string, coins: number, xp: number, characterType: string): Promise<UserRecord | null> {
    const inc: any = { coins, xp };
    if (CHARACTER_TYPES.includes(characterType)) inc['charXp.' + characterType] = xp;
    try {
        const doc = await UserModel.findByIdAndUpdate(userId, { $inc: inc }, { returnDocument: 'after' });
        return doc ? docToUser(doc) : null;
    } catch {
        return null;
    }
}

// G'ALABA UCHUN TANGA QO'SHISH
export async function addCoins(userId: string, amount: number): Promise<UserRecord | null> {
    const doc = await UserModel.findByIdAndUpdate(
        userId,
        { $inc: { coins: amount } },
        { returnDocument: 'after' }
    );
    return doc ? docToUser(doc) : null;
}

// SKIN SOTIB OLISH
// SKIN SOTIB OLISH (category: 'body' - tana/qurol dizayni, 'weapon' - alohida qurol skin)
export async function buySkin(userId: string, characterType: string, skinId: string, price: number, category: 'body' | 'weapon' = 'body'): Promise<{ success: boolean, message?: string, user?: UserRecord }> {
    const doc = await UserModel.findById(userId);
    if (!doc) return { success: false, message: 'err_user_not_found' };

    const ownedField = category === 'weapon' ? 'ownedWeaponSkins' : 'ownedSkins';
    const owned: string[] = (doc as any)[ownedField][characterType] || [];
    if (owned.includes(skinId)) {
        return { success: false, message: 'err_skin_owned' };
    }
    if (doc.coins < price) {
        return { success: false, message: 'err_not_enough_coins' };
    }

    owned.push(skinId);
    (doc as any)[ownedField][characterType] = owned;
    doc.coins -= price;
    doc.markModified(ownedField);

    await doc.save();

    return { success: true, user: docToUser(doc) };
}

// SKIN KIYISH (faqat sotib olingan skinni kiyish mumkin)
export async function equipSkin(userId: string, characterType: string, skinId: string, category: 'body' | 'weapon' = 'body'): Promise<{ success: boolean, message?: string, user?: UserRecord }> {
    const doc = await UserModel.findById(userId);
    if (!doc) return { success: false, message: 'err_user_not_found' };

    const ownedField = category === 'weapon' ? 'ownedWeaponSkins' : 'ownedSkins';
    const equippedField = category === 'weapon' ? 'equippedWeaponSkins' : 'equippedSkins';
    const owned: string[] = (doc as any)[ownedField][characterType] || [];
    if (!owned.includes(skinId)) {
        return { success: false, message: 'err_skin_not_owned' };
    }

    (doc as any)[equippedField][characterType] = skinId;
    doc.markModified(equippedField);
    await doc.save();

    return { success: true, user: docToUser(doc) };
}

// DETAL SOTIB OLISH: tanga yetarli va hali olinmagan bo'lsa - bitta atomar yozuv bilan
// (ikki marta tez bosilsa ham ikki marta pul yechilmaydi)
export async function buyCosmetic(userId: string, key: string, price: number): Promise<{ success: boolean, message?: string, user?: UserRecord }> {
    const doc = await UserModel.findOneAndUpdate(
        { _id: userId, ownedCosmetics: { $ne: key }, coins: { $gte: price } },
        { $push: { ownedCosmetics: key }, $inc: { coins: -price } },
        { returnDocument: 'after' }
    );
    if (doc) return { success: true, user: docToUser(doc) };
    const cur = await UserModel.findById(userId);
    if (!cur) return { success: false, message: 'err_user_not_found' };
    if ((cur as any).ownedCosmetics && (cur as any).ownedCosmetics.includes(key)) return { success: false, message: 'err_skin_owned' };
    return { success: false, message: 'err_not_enough_coins' };
}

// DETAL KIYISH / YECHISH (itemId = null - yechish). Kiyish uchun oldin sotib olingan bo'lishi kerak
export async function equipCosmetic(userId: string, characterType: string, slot: string, itemId: string | null, key: string | null): Promise<{ success: boolean, message?: string, user?: UserRecord }> {
    const doc = await UserModel.findById(userId);
    if (!doc) return { success: false, message: 'err_user_not_found' };
    if (itemId !== null && !((doc as any).ownedCosmetics || []).includes(key)) {
        return { success: false, message: 'err_skin_not_owned' };
    }
    const all = { ...((doc as any).equippedCosmetics || {}) };
    const mine = { ...(all[characterType] || {}) };
    if (itemId === null) delete mine[slot]; else mine[slot] = itemId;
    all[characterType] = mine;
    (doc as any).equippedCosmetics = all;
    doc.markModified('equippedCosmetics');
    await doc.save();
    return { success: true, user: docToUser(doc) };
}

export async function getUserById(userId: string): Promise<UserRecord | null> {
    try {
        const doc = await UserModel.findById(userId);
        if (doc) await migrateRoomProgress(doc);
        return doc ? docToUser(doc) : null;
    } catch {
        // Noto'g'ri formatdagi ID (masalan eski raqamli ID) yuborilsa xatolik bermasin
        return null;
    }
}

// ==================== PERSONAJ YAXSHILASH (SKILL POINT) TIZIMI ====================
// Har bir XARITA, foydalanuvchi shu PERSONAJ bilan birinchi marta tugatganda o'sha
// PERSONAJGA 1 ta ball beradi. Xuddi shu xarita/personaj birikmasi qayta o'ynalsa
// (ferma qilish uchun) ball QAYTA berilmaydi.
export async function awardSkillPointIfNew(userId: string, levelId: number, characterType: string): Promise<UserRecord | null> {
    if (!CHARACTER_TYPES.includes(characterType)) return null;
    try {
        const doc = await UserModel.findById(userId);
        if (!doc) return null;

        const creditedAll: any = doc.creditedLevels || {};
        const credited: number[] = creditedAll[characterType] || [];
        if (credited.includes(levelId)) {
            return docToUser(doc); // Bu personaj shu xarita uchun ball avval olgan - o'zgarishsiz qaytaramiz
        }

        credited.push(levelId);
        creditedAll[characterType] = credited;
        doc.creditedLevels = creditedAll;

        const pointsAll: any = doc.skillPoints || {};
        pointsAll[characterType] = (pointsAll[characterType] || 0) + 1;
        doc.skillPoints = pointsAll;

        doc.markModified('creditedLevels');
        doc.markModified('skillPoints');
        await doc.save();

        return docToUser(doc);
    } catch (err) {
        console.error('awardSkillPointIfNew xatosi:', err);
        return null;
    }
}

// Tanlangan PERSONAJNING yig'ilgan ballaridan birini sarflab, "damage" yoki
// "stamina" darajasini oshirish (max 5). Boshqa personajlarga ta'sir qilmaydi.
// Qurol kuchaytirishlari (drobovik, kunai) - faqat o'sha qurol ochilgan 15-darajadan (perks.ts)

export async function upgradeStat(userId: string, characterType: string, stat: string, payWith: 'points' | 'coins' = 'points'): Promise<{ success: boolean, message?: string, user?: UserRecord }> {
    if (!CHARACTER_TYPES.includes(characterType)) {
        return { success: false, message: 'err_bad_character' };
    }
    const doc = await UserModel.findById(userId);
    if (!doc) return { success: false, message: 'err_user_not_found' };
    const isWeaponStat = (WEAPON_UPGRADES[characterType] || []).includes(stat);
    if (!BASE_UPGRADES.includes(stat) && !isWeaponStat) {
        return { success: false, message: 'err_bad_skill' };
    }
    if (isWeaponStat && xpLevel(docToUser(doc).charXp[characterType] || 0) < WEAPON_UPGRADE_LEVEL) {
        return { success: false, message: 'err_upgrade_locked|' + WEAPON_UPGRADE_LEVEL };
    }

    const upgradesAll: any = doc.upgrades || {};
    const currentLevel = ((upgradesAll[characterType] || {})[stat]) || 0;
    if (currentLevel >= MAX_UPGRADE_LEVEL) {
        return { success: false, message: 'err_skill_max' };
    }
    // Narx: YO ball, YO tanga - o'yinchi tanlaydi (daraja oshgan sari qimmatlashadi)
    const cost = UPGRADE_COSTS[currentLevel];
    const levelPath = `upgrades.${characterType}.${stat}`;
    const pointsPath = `skillPoints.${characterType}`;
    let filter: any, spend: any;
    if (payWith === 'coins') {
        if (doc.coins < cost.coins) return { success: false, message: 'err_not_enough_coins' };
        filter = { coins: { $gte: cost.coins } };
        spend = { coins: -cost.coins };
    } else {
        const points = ((doc.skillPoints || {}) as any)[characterType] || 0;
        if (points < cost.points) return { success: false, message: 'err_no_points_n|' + cost.points };
        filter = { [pointsPath]: { $gte: cost.points } };
        spend = { [pointsPath]: -cost.points };
    }

    // Bitta atomar yozuv: daraja hali o'zgarmagan va to'lov yetarli bo'lsagina - ikki marta
    // tez bosilsa ham ikki marta yechilmaydi
    const updated = await UserModel.findOneAndUpdate(
        { _id: doc._id, [levelPath]: currentLevel === 0 ? { $in: [0, null] } : currentLevel, ...filter },
        { $set: { [levelPath]: currentLevel + 1 }, $inc: spend },
        { returnDocument: 'after' }
    );
    if (!updated) return { success: false, message: 'err_upgrade_failed' };
    return { success: true, user: docToUser(updated) };
}

// "Mening personajim" ekrani ochilganda birinchi bo'lib qaysi personaj ko'rsatilishini
// belgilaydi (odatda foydalanuvchi lobbida shu personajni tanlaganda avtomatik yangilanadi)
export async function setDefaultCharacter(userId: string, characterType: string): Promise<UserRecord | null> {
    if (!CHARACTER_TYPES.includes(characterType)) return null;
    const doc = await UserModel.findByIdAndUpdate(userId, { $set: { defaultCharacter: characterType } }, { returnDocument: 'after' });
    return doc ? docToUser(doc) : null;
}

// ==================== XONALAR (LOBBY) NI SAQLASH ====================
// Hisobli (ro'yxatdan o'tgan) xo'jayin yaratgan xonalar bazada saqlanadi,
// shunda do'stlar ertaga qaytib, xuddi o'sha xarita progressida davom
// etishlari mumkin (xona xotirada emas, endi doimiy).

const roomSchema = new mongoose.Schema({
    roomCode: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    hostUserId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
    unlockedLevel: { type: Number, required: true, default: 0 }, // nechta xarita ochilgan (0-based)
    isPrivate: { type: Boolean, required: true, default: false } // true bo'lsa, "Barcha xonalar" ro'yxatida ko'rinmaydi - faqat kod bilan qo'shiladi
}, { timestamps: true });

const RoomModel = mongoose.model('Room', roomSchema);

export interface RoomRecord {
    roomCode: string;
    name: string;
    hostUserId: string;
    unlockedLevel: number;
    isPrivate: boolean;
    updatedAt: Date;
}

function docToRoom(doc: any): RoomRecord {
    return {
        roomCode: doc.roomCode,
        name: doc.name,
        hostUserId: doc.hostUserId.toString(),
        unlockedLevel: doc.unlockedLevel,
        isPrivate: !!doc.isPrivate,
        updatedAt: doc.updatedAt
    };
}

// Tasodifiy, o'qish oson bo'lgan xona kodi (masalan: "K3F9QZ") generatsiya qilish
function generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // chalkashadigan harflar (I, O, 0, 1) olib tashlandi
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
}

// YANGI DOIMIY XONA YARATISH (faqat hisobli foydalanuvchi uchun)
export async function createPersistentRoom(name: string, hostUserId: string, isPrivate: boolean = false): Promise<RoomRecord> {
    let roomCode = generateRoomCode();
    // Ehtimoldan yiroq, lekin xavfsizlik uchun: band bo'lsa qayta generatsiya qilamiz
    while (await RoomModel.findOne({ roomCode })) {
        roomCode = generateRoomCode();
    }
    const doc = await RoomModel.create({ roomCode, name, hostUserId, unlockedLevel: 0, isPrivate });
    return docToRoom(doc);
}

// Foydalanuvchi ENG OXIRGI marta yaratgan (yoki xo'jayin bo'lgan) saqlangan xona ("Mening saqlangan xonam")
export async function getMostRecentRoomByHost(hostUserId: string): Promise<RoomRecord | null> {
    const doc = await RoomModel.findOne({ hostUserId }).sort({ updatedAt: -1 });
    return doc ? docToRoom(doc) : null;
}

export async function getRoomByCode(roomCode: string): Promise<RoomRecord | null> {
    const doc = await RoomModel.findOne({ roomCode: roomCode.toUpperCase() });
    return doc ? docToRoom(doc) : null;
}

// Foydalanuvchi o'zi xo'jayin bo'lgan saqlangan xonalar ro'yxati ("Mening xonalarim")
export async function getRoomsByHost(hostUserId: string): Promise<RoomRecord[]> {
    const docs = await RoomModel.find({ hostUserId }).sort({ updatedAt: -1 }).limit(20);
    return docs.map(docToRoom);
}

// XARITA O'TILDI (hisob progressi): +XP; aynan o'z "chegara" xaritasini o'tgan bo'lsa -
// keyingi xarita ochiladi (hali chiqmagan bo'lsa ham - yangilanishda darhol ochiq bo'ladi)
export async function recordMapClear(userId: string, levelId: number, characterType: string, xpGain: number = XP_PER_MAP): Promise<UserRecord | null> {
    try {
        const doc: any = await UserModel.findById(userId);
        if (!doc) return null;
        await migrateRoomProgress(doc);
        // Eski hisob bo'lsa - avval tarixdan hisoblangan qiymatdan boshlaymiz
        const before = docToUser(doc);
        doc.xp = before.xp + xpGain;
        const charXp = { ...before.charXp };
        if (CHARACTER_TYPES.includes(characterType)) charXp[characterType] = (charXp[characterType] || 0) + xpGain;
        doc.charXp = charXp;
        doc.markModified('charXp');
        // Xarita o'tildi - keyingisi ochiladi. Oxirgi xarita bo'lsa ham (unlockedLevel = xaritalar soni):
        // yangi xarita qo'shilganda u darhol ochiq bo'ladi, oldingisini qayta o'tish shart emas
        doc.unlockedLevel = Math.max(before.unlockedLevel, levelId + 1);
        await doc.save();
        return docToUser(doc);
    } catch (err) {
        console.error('recordMapClear xatosi:', err);
        return null;
    }
}

// ==================== ADMIN (Telegram bot) ====================
export async function countUsers(): Promise<{ total: number, banned: number }> {
    const [total, banned] = await Promise.all([UserModel.countDocuments({}), UserModel.countDocuments({ banned: true })]);
    return { total, banned };
}

// Login bo'yicha qidirish: avval aniq (katta-kichik harf farqsiz), topilmasa - o'xshashlari (10 tagacha)
export async function findUsersByNickname(query: string): Promise<{ exact: UserRecord | null, similar: string[] }> {
    const safe = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const exactDoc = await UserModel.findOne({ nickname: new RegExp('^' + safe + '$', 'i') });
    if (exactDoc) return { exact: docToUser(exactDoc), similar: [] };
    const docs = await UserModel.find({ nickname: new RegExp(safe, 'i') }).limit(10);
    return { exact: null, similar: docs.map((d: any) => d.nickname) };
}

export async function setBanned(userId: string, banned: boolean, reason: string = ''): Promise<UserRecord | null> {
    const doc = await UserModel.findByIdAndUpdate(userId, { $set: { banned, banReason: banned ? reason : '' } }, { returnDocument: 'after' });
    return doc ? docToUser(doc) : null;
}

// Tanga qo'shish/ayirish (manfiy bo'lsa ham balans 0 dan pastga tushmaydi)
export async function adjustCoins(userId: string, amount: number): Promise<UserRecord | null> {
    const doc: any = await UserModel.findById(userId);
    if (!doc) return null;
    doc.coins = Math.max(0, (doc.coins || 0) + amount);
    await doc.save();
    return docToUser(doc);
}

export default UserModel;