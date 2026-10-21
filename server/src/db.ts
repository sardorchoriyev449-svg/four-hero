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
// Kuchaytirish chegarasi qahramon darajasiga qarab: 3-darajada 1 ta, 6-da 3 ta, 9-da 4 ta, 12-da 5 ta (max); undan pastda - yopiq
const UPGRADE_CAP_STEPS: [number, number][] = [[12, 5], [9, 4], [6, 3], [3, 1]];
export function upgradeCapFor(heroLevel: number): number {
    const st = UPGRADE_CAP_STEPS.find(([lv]) => heroLevel >= lv);
    return Math.min(MAX_UPGRADE_LEVEL, st ? st[1] : 0);
}
// Shu kuchaytirish darajasidan yana oshirish uchun kerakli qahramon darajasi
export function levelForUpgrade(current: number): number {
    const st = UPGRADE_CAP_STEPS.slice().reverse().find(([, cap]) => cap > current);
    return st ? st[0] : UPGRADE_CAP_STEPS[0][0];
}

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
    achievements: { type: [String], default: () => [] },   // bir martalik yutuqlar ("respect" va h.k.)
    // REKLAMA MUKOFOTI: oxirgi ko'rilgan vaqt va shu kun (UTC) nechta ko'rilgani
    adLastAt: { type: Number, default: 0 },
    adDay: { type: String, default: '' },
    adCount: { type: Number, default: 0 },
    equippedCosmetics: { type: Object, default: () => ({}) },
    // ADMIN (Telegram bot) bloklagan hisob: kira olmaydi, xonaga qo'shila olmaydi
    banned: { type: Boolean, required: true, default: false },
    banReason: { type: String, default: '' },
    // LA'NATLAR (do'kondan davo sotib olinmaguncha qoladi): kislota - jon o'zi tiklanmaydi; chaqmoq - stamina sekin to'ladi
    cursedAcid: { type: Boolean, default: false },
    cursedBolt: { type: Boolean, default: false },
    // ADMIN: chat taqiqi - shu vaqtgacha (ms) lobbi chatiga yoza olmaydi (0 - taqiq yo'q, -1 - doimiy)
    mutedUntil: { type: Number, default: 0 },
    // MY FARM: grядkalar ({ "0": { c: 'carrot', t: ms } | null, ... }) va yig'ilgan hosil ({ carrot: 3, ... })
    farmPlots: { type: Object, default: () => ({}) },
    farmBag: { type: Object, default: () => ({}) },
    farmZones: { type: Number, default: 0 },     // sotib olingan qo'shimcha maydonlar (0..5)
    farmDock: { type: Boolean, default: false }, // daryodagi baliq tutish platformasi
    fishRod: { type: Boolean, default: false },  // do'kondan: udochka
    fishNet: { type: Boolean, default: false },  // do'kondan: katta setka
    netAt: { type: Number, default: 0 },         // setka oxirgi marta tashlangan vaqt
    rodUses: { type: Number, default: 0 },       // udochka / setka necha marta ishlatilgan (toolUses da sinadi)
    netUses: { type: Number, default: 0 },
    fertN: { type: Number, default: 0 },         // o'g'it va "moviy suv" (do'kondan, sarflanadi)
    waterN: { type: Number, default: 0 },
    farmOrchard: { type: Object, default: () => ({}) },   // bog': { "0": { c: 'apple', t: ekilgan, h: oxirgi terim } }
    treeState: { type: String, default: 'none' },        // baxaybat daraxt: none | dry | grow | boss
    treeApples: { type: Number, default: 0 },            // shu davrada terilgan ko'k olmalar
    treeSpots: { type: Object, default: () => ({}) },    // har joydagi olma oxirgi terilgan vaqt
    lastVisit: { type: Number, default: 0 },             // host fermaga oxirgi kirgan vaqt (qo'ziqorinlar uchun)
    farmXp: { type: Number, default: 0 },                // FERMA DARAJASI tajribasi
    farmDecor: { type: Object, default: () => ({}) },    // sotib olingan bezaklar: { flowers: true, ... }
    farmDecorOff: { type: Object, default: () => ({}) }, // yashikka olingan (tashqarida ko'rinmaydigan) bezaklar
    farmHive: { type: Boolean, default: false },         // NOTA UYASI (o'sishni tezlatadi)
    farmMill: { type: Number, default: 0 },              // BAHAYBAT TEGIRMON bosqichi (0..4)
    farmSprinklers: { type: Number, default: 0 },        // avtomatik sug'orgichlar (har biri bitta maydonga)
    farmScarecrows: { type: Number, default: 0 },        // qo'rqinchoqlar (robot qarg'alar qo'nmaydi)
    farmGreenhouse: { type: Boolean, default: false },   // issiqxona (1-maydon)
    farmHome: { type: Object, default: () => ({}) },     // fermer uyi: { owned: { bed: true }, place: { f0: 'bed' } }
    farmChest: { type: Object, default: () => ({}) },    // uydagi yashik: { bag: { tomato: 5 }, fish: [{ u, f, kg, v }] }
    farmOrders: { type: Array, default: () => [] },      // elflarning buyurtmalari: [{ id, items: { tomato: 5, 'fish:pike': 2 }, coins, xp, until }]
    ordersNextAt: { type: Number, default: 0 },          // yangi buyurtma qachon paydo bo'ladi
    shroomsLeft: { type: Number, default: 0 },           // o'ldirilmagan qo'ziqorinlar
    // INVENTAR: tutilgan (sotilmagan) baliqlar - har biri alohida: u - noyob id, f - turi, kg, v - narxi
    fishBag: { type: [{ _id: false, u: String, f: String, kg: Number, v: Number }], default: () => [] },
    // Xarita o'tilgani uchun tanga - har xaritaga faqat BIR MARTA (qayta o'tilsa berilmaydi)
    coinMaps: { type: [Number], default: () => [] },
    // XP KUCHAYTIRISH darajasi - har personajga alohida: { knight: 2, ... }
    xpBoost: { type: Object, default: () => ({}) }
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
    cursedAcid: boolean;
    cursedBolt: boolean;
    mutedUntil: number;
    unlockedLevel: number;
    xp: number;
    charXp: { [character: string]: number };
    ownedCosmetics: string[];
    equippedCosmetics: { [character: string]: { [slot: string]: string } };
    banned: boolean;
    banReason: string;
    createdAt: Date | null;
    xpBoost: { [character: string]: number };
}

// TAJRIBA DARAJASI (eng yuqori - 100): 1-15 darajalar - har keyingisiga kerakli XP ikki baravar
// (0->1: 10, 1->2: 20, 2->3: 40, ...; 15-daraja - jami 327 670 XP). 16-darajadan: L-darajaga yana L x 100 XP
export const XP_PER_MAP = 10;
export const MAX_LEVEL = 100;
export function xpForLevel(level: number): number {
    const L = Math.max(0, Math.min(MAX_LEVEL, Math.floor(level)));
    if (L <= 15) return XP_PER_MAP * (2 ** L - 1);
    return XP_PER_MAP * (2 ** 15 - 1) + 100 * (L * (L + 1) / 2 - 120);
}
export function xpLevel(xp: number): number {
    const x = Math.max(0, xp || 0);
    let level = 0;
    while (level < MAX_LEVEL && x >= xpForLevel(level + 1)) level++;
    return level;
}
// XP KUCHAYTIRISH (My Character): har darajasi - har o'ldirish / boss / xarita uchun +15 XP; narxi 300, 500, 700 ...; eng ko'pi 10 daraja
export const XP_BOOST_PER_LEVEL = 15;
export const XP_BOOST_MAX = 10;
export function xpBoostCost(level: number): number { return 300 + 200 * Math.max(0, level); }
export const XP_BOOST_POINTS = 2;   // yoki har safar 2 ta ko'nikma balli (narxi oshmaydi)

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
        cursedAcid: !!doc.cursedAcid,
        cursedBolt: !!doc.cursedBolt,
        mutedUntil: doc.mutedUntil || 0,
        ...legacyProgress(doc, creditedLevels),
        ownedCosmetics: Array.isArray(doc.ownedCosmetics) ? [...doc.ownedCosmetics] : [],
        equippedCosmetics: doc.equippedCosmetics || {},
        banned: !!doc.banned,
        banReason: doc.banReason || '',
        createdAt: doc.createdAt || null,
        xpBoost: doc.xpBoost || {}
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
// Ro'yxatdan o'tish talablari: parol - kamida 8 belgi; nickname va ism - 3 dan ko'p (kamida 4)
export const PASSWORD_MIN = 8, NICKNAME_MIN = 4, FULLNAME_MIN = 4;

export async function registerUser(fullNameRaw: unknown, nicknameRaw: unknown, passwordRaw: unknown): Promise<{ success: boolean, message?: string, user?: UserRecord }> {
    const fullName = str(fullNameRaw), nickname = str(nicknameRaw);
    const password = typeof passwordRaw === 'string' ? passwordRaw : '';
    if (!fullName || !nickname || !password) {
        return { success: false, message: 'err_fields_required' };
    }
    if (fullName.length < FULLNAME_MIN) return { success: false, message: 'err_fullname_short' };
    if (nickname.length < NICKNAME_MIN) return { success: false, message: 'err_nickname_short' };
    if (password.length < PASSWORD_MIN) {
        return { success: false, message: 'err_password_short' };
    }
    if (nickname.length > NICKNAME_MAX || fullName.length > 40 || password.length > 72) {
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
    const owned: string[] = ((doc as any)[ownedField] || {})[characterType] || [];
    if (owned.includes(skinId)) {
        return { success: false, message: 'err_skin_owned' };
    }
    if (doc.coins < price) {
        return { success: false, message: 'err_not_enough_coins' };
    }
    // Bitta atomar yozuv: hali olinmagan va tanga yetarli bo'lsagina (ikki marta tez bosilsa ham bir marta yechiladi)
    const path = ownedField + '.' + characterType;
    const updated = await UserModel.findOneAndUpdate(
        { _id: userId, [path]: { $ne: skinId }, coins: { $gte: price } },
        { $push: { [path]: skinId }, $inc: { coins: -price } },
        { returnDocument: 'after' }
    );
    if (!updated) return { success: false, message: 'err_not_enough_coins' };
    return { success: true, user: docToUser(updated) };
}

// SKIN KIYISH (faqat sotib olingan skinni kiyish mumkin)
export async function equipSkin(userId: string, characterType: string, skinId: string, category: 'body' | 'weapon' = 'body'): Promise<{ success: boolean, message?: string, user?: UserRecord }> {
    const doc = await UserModel.findById(userId);
    if (!doc) return { success: false, message: 'err_user_not_found' };

    const ownedField = category === 'weapon' ? 'ownedWeaponSkins' : 'ownedSkins';
    const equippedField = category === 'weapon' ? 'equippedWeaponSkins' : 'equippedSkins';
    const owned: string[] = ((doc as any)[ownedField] || {})[characterType] || [];
    if (!owned.includes(skinId)) {
        return { success: false, message: 'err_skin_not_owned' };
    }

    (doc as any)[equippedField] = { ...((doc as any)[equippedField] || {}), [characterType]: skinId };
    doc.markModified(equippedField);
    await doc.save();

    return { success: true, user: docToUser(doc) };
}

// REKLAMA KO'RGANI UCHUN TANGA: oraliq (cooldownMs) va kunlik chegara (dailyCap) bitta atomar
// yozuvda tekshiriladi - tez-tez bosib yoki parallel so'rov bilan ortiqcha tanga olib bo'lmaydi
export async function claimAdReward(userId: string, amount: number, cooldownMs: number, dailyCap: number): Promise<{ success: boolean, message?: string, user?: UserRecord, left?: number }> {
    const now = Date.now();
    const today = new Date(now).toISOString().slice(0, 10);
    const ready = { $or: [{ adLastAt: { $exists: false } }, { adLastAt: { $lte: now - cooldownMs } }] };
    // Bugun allaqachon ko'rgan - chegaradan oshmagan bo'lsa
    let doc = await UserModel.findOneAndUpdate(
        { _id: userId, adDay: today, adCount: { $lt: dailyCap }, ...ready },
        { $inc: { coins: amount, adCount: 1 }, $set: { adLastAt: now } },
        { returnDocument: 'after' }
    );
    // Bugun birinchi marta
    if (!doc) doc = await UserModel.findOneAndUpdate(
        { _id: userId, adDay: { $ne: today }, ...ready },
        { $inc: { coins: amount }, $set: { adLastAt: now, adDay: today, adCount: 1 } },
        { returnDocument: 'after' }
    );
    if (doc) return { success: true, user: docToUser(doc), left: Math.max(0, dailyCap - (doc.adCount || 0)) };
    const cur = await UserModel.findById(userId);
    if (!cur) return { success: false, message: 'err_user_not_found' };
    if (cur.adDay === today && (cur.adCount || 0) >= dailyCap) return { success: false, message: 'err_ad_daily_limit', left: 0 };
    return { success: false, message: 'err_ad_cooldown' };
}

// YUTUQ: akkauntga faqat BIR MARTA beriladi (atomar) - berilgan bo'lsa true
export async function grantAchievement(userId: string, key: string): Promise<boolean> {
    const r = await UserModel.updateOne({ _id: userId, achievements: { $ne: key } }, { $push: { achievements: key } });
    return r.modifiedCount === 1;
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
// Qurol kuchaytirishlari (drobovik, kunai) - faqat o'sha qurol ochilgan 3-darajadan (perks.ts)

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
    // Kuchaytirish chegarasi qahramon DARAJASIGA bog'liq (upgradeCapFor): 3 -> 1, 6 -> 3, 9 -> 4, 12 -> 5
    if (currentLevel >= upgradeCapFor(xpLevel(docToUser(doc).charXp[characterType] || 0))) {
        return { success: false, message: 'err_upgrade_locked|' + levelForUpgrade(currentLevel) };
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

// XARITA TANGASI - faqat birinchi o'tilganda: shu xarita uchun hali tanga olinmagan bo'lsa (eski hisoblarda -
// biror personaj bilan ham o'tilmagan bo'lsa) qo'shiladi. Natija: yangilangan hisob yoki null (allaqachon olingan)
export async function claimMapCoins(userId: string, mapId: number, amount: number): Promise<UserRecord | null> {
    try {
        const q: any = { _id: userId, coinMaps: { $ne: mapId } };
        CHARACTER_TYPES.forEach(c => { q['creditedLevels.' + c] = { $ne: mapId }; });
        const doc = await UserModel.findOneAndUpdate(q, { $inc: { coins: amount }, $addToSet: { coinMaps: mapId } }, { returnDocument: 'after' });
        return doc ? docToUser(doc) : null;
    } catch (err) {
        console.error('claimMapCoins xatosi:', err);
        return null;
    }
}
// Tanga sarflash (masalan ranets): yetsa - bitta atomik amalda ayiriladi; aks holda null
export async function spendCoins(userId: string, amount: number): Promise<UserRecord | null> {
    try {
        const doc = await UserModel.findOneAndUpdate({ _id: userId, coins: { $gte: amount } }, { $inc: { coins: -amount } }, { returnDocument: 'after' });
        return doc ? docToUser(doc) : null;
    } catch (err) {
        console.error('spendCoins xatosi:', err);
        return null;
    }
}
// La'nat tushdi (kislota / chaqmoq)
export async function setCurse(userId: string, kind: 'acid' | 'bolt', on: boolean): Promise<void> {
    try { await UserModel.updateOne({ _id: userId }, { $set: { [kind === 'acid' ? 'cursedAcid' : 'cursedBolt']: on } }); }
    catch (err) { console.error('setCurse xatosi:', err); }
}
// DO'KON: davo sotib olish (faqat la'nat bor bo'lsa va tanga yetsa) - bitta atomik amal
export async function buyCure(userId: string, kind: 'acid' | 'bolt', price: number): Promise<{ success: boolean, message?: string, user?: UserRecord }> {
    const field = kind === 'acid' ? 'cursedAcid' : 'cursedBolt';
    try {
        const doc = await UserModel.findOneAndUpdate({ _id: userId, [field]: true, coins: { $gte: price } },
            { $inc: { coins: -price }, $set: { [field]: false } }, { returnDocument: 'after' });
        if (doc) return { success: true, user: docToUser(doc) };
        const u: any = await UserModel.findById(userId);
        if (!u) return { success: false, message: 'err_user_not_found' };
        if (!u[field]) return { success: false, message: 'shop_not_needed' };
        return { success: false, message: 'err_not_enough_coins' };
    } catch (err) {
        console.error('buyCure xatosi:', err);
        return { success: false, message: 'err_server' };
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

// ADMIN PANEL: foydalanuvchilar ro'yxati, nickname bo'yicha qidiruv, saralash va filtr
// sort: new (yangilari birinchi) | old | coins | level (eng ko'p XP); only: all | banned | muted | cursed | online (onlineIds bilan)
export async function listUsers(query: string, skip: number, limit: number, sort: string = 'new', only: string = 'all', onlineIds: string[] = []): Promise<{ total: number, users: UserRecord[] }> {
    const q = (query || '').trim().slice(0, 40);
    const filter: any = q ? { nickname: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } } : {};
    if (only === 'banned') filter.banned = true;
    else if (only === 'muted') filter.$or = [{ mutedUntil: -1 }, { mutedUntil: { $gt: Date.now() } }];
    else if (only === 'cursed') filter.$or = [{ cursedAcid: true }, { cursedBolt: true }];
    else if (only === 'online') filter._id = { $in: onlineIds.filter(id => /^[a-f0-9]{24}$/i.test(id)) };
    const order: any = sort === 'old' ? { createdAt: 1 } : sort === 'coins' ? { coins: -1, createdAt: -1 }
        : sort === 'level' ? { xp: -1, createdAt: -1 } : { createdAt: -1 };
    const [total, docs] = await Promise.all([
        UserModel.countDocuments(filter),
        UserModel.find(filter).sort(order).skip(Math.max(0, skip)).limit(Math.min(100, Math.max(1, limit)))
    ]);
    return { total, users: docs.map(docToUser) };
}

// HISOB NOMINI (nickname) O'ZGARTIRISH: ro'yxatdan o'tishdagi qoidalar; band bo'lsa (katta-kichik harfidan
// qat'i nazar) - rad etiladi
export async function renameUser(userId: string, nicknameRaw: unknown): Promise<{ success: boolean, message?: string, user?: UserRecord }> {
    const nickname = str(nicknameRaw);
    if (!nickname) return { success: false, message: 'err_fields_required' };
    if (nickname.length < NICKNAME_MIN) return { success: false, message: 'err_nickname_short' };
    if (nickname.length > NICKNAME_MAX) return { success: false, message: 'err_field_length' };
    const esc = nickname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const taken = await UserModel.findOne({ nickname: { $regex: '^' + esc + '$', $options: 'i' }, _id: { $ne: userId } });
    if (taken) return { success: false, message: 'err_nickname_taken' };
    try {
        const doc = await UserModel.findByIdAndUpdate(userId, { $set: { nickname } }, { returnDocument: 'after' });
        return doc ? { success: true, user: docToUser(doc) } : { success: false, message: 'err_user_not_found' };
    } catch (err: any) {
        if (err && err.code === 11000) return { success: false, message: 'err_nickname_taken' };
        throw err;
    }
}

// REYTING: umumiy (hamma qahramonlar tajribasi yig'indisi) yoki bitta qahramon bo'yicha. Bloklanganlar va hali
// tajribasi yo'qlar ko'rinmaydi. Ro'yxat 30 s keshlanadi (bazani har ochilishda yuklamaslik uchun)
export type LbRow = { rank: number, id: string, nick: string, hero: string, level: number, xp: number };
const lbCache = new Map<string, { at: number, rows: LbRow[] }>();
const lbScore = (hero: string): any => hero === 'all'
    ? { $add: CHARACTER_TYPES.map(c => ({ $ifNull: ['$charXp.' + c, 0] })) }
    : { $ifNull: ['$charXp.' + hero, 0] };
export async function getLeaderboard(hero: string, userId: string | null): Promise<{ rows: LbRow[], me: LbRow | null } | null> {
    if (hero !== 'all' && !CHARACTER_TYPES.includes(hero)) return null;
    const toRow = (d: any, rank: number): LbRow => {
        const cx = d.charXp || {};
        // Umumiy reytingda - eng kuchli qahramoni va uning darajasi
        const best = hero === 'all' ? CHARACTER_TYPES.reduce((b, c) => ((cx[c] || 0) > (cx[b] || 0) ? c : b), CHARACTER_TYPES[0]) : hero;
        return { rank, id: String(d._id), nick: d.nickname, hero: best, level: xpLevel(cx[best] || 0), xp: Math.round(d.score || 0) };
    };
    let cached = lbCache.get(hero);
    if (!cached || Date.now() - cached.at > 30000) {
        const docs = await UserModel.aggregate([
            { $match: { banned: { $ne: true } } },
            { $project: { nickname: 1, charXp: 1, score: lbScore(hero) } },
            { $match: { score: { $gt: 0 } } },
            { $sort: { score: -1, _id: 1 } },
            { $limit: 50 }
        ]);
        cached = { at: Date.now(), rows: docs.map((d: any, i: number) => toRow(d, i + 1)) };
        lbCache.set(hero, cached);
    }
    let me: LbRow | null = null;
    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
        const mine: any = await UserModel.findById(userId, { nickname: 1, charXp: 1, banned: 1 }).lean();
        if (mine && !mine.banned) {
            const cx = mine.charXp || {};
            const score = hero === 'all' ? CHARACTER_TYPES.reduce((a, c) => a + (cx[c] || 0), 0) : (cx[hero] || 0);
            if (score > 0) {
                const above = await UserModel.aggregate([
                    { $match: { banned: { $ne: true } } },
                    { $project: { score: lbScore(hero) } },
                    { $match: { score: { $gt: score } } },
                    { $count: 'n' }
                ]);
                me = toRow({ ...mine, score }, ((above[0] && above[0].n) || 0) + 1);
            }
        }
    }
    return { rows: cached.rows, me };
}

// ADMIN: qahramon darajasini belgilash (0..MAX_LEVEL)
export const HERO_TYPES = CHARACTER_TYPES;
export async function setHeroLevel(userId: string, heroes: string[], level: number): Promise<UserRecord | null> {
    const set: any = {};
    heroes.forEach(c => { set['charXp.' + c] = xpForLevel(level); });
    const doc = await UserModel.findByIdAndUpdate(userId, { $set: set }, { returnDocument: 'after' });
    return doc ? docToUser(doc) : null;
}

// ADMIN: ochilgan xaritalarni aniq belgilash (0 - faqat birinchisi)
export async function setUnlockedLevel(userId: string, level: number): Promise<UserRecord | null> {
    const doc = await UserModel.findByIdAndUpdate(userId, { $set: { unlockedLevel: level } }, { returnDocument: 'after' });
    return doc ? docToUser(doc) : null;
}

export async function adjustCoins(userId: string, amount: number): Promise<UserRecord | null> {
    const doc: any = await UserModel.findById(userId);
    if (!doc) return null;
    doc.coins = Math.max(0, (doc.coins || 0) + amount);
    await doc.save();
    return docToUser(doc);
}

// XP KUCHAYTIRISH sotib olish: hozirgi daraja o'qilgan bo'lsa va tanga yetsa - bitta atomik yozuv
export const XP_BOOST_STEP = 3;
export function xpBoostCapFor(heroLevel: number): number { return Math.min(XP_BOOST_MAX, Math.floor(Math.max(0, heroLevel) / XP_BOOST_STEP)); }
export async function buyXpBoost(userId: string, characterType: string, payWith: 'coins' | 'points' = 'coins'): Promise<{ success: boolean, message?: string, user?: UserRecord }> {
    if (!CHARACTER_TYPES.includes(characterType)) return { success: false, message: 'err_bad_skill' };
    const pts = 'skillPoints.' + characterType;
    for (let attempt = 0; attempt < 3; attempt++) {
        const cur: any = await UserModel.findById(userId, { xpBoost: 1, coins: 1, skillPoints: 1, charXp: 1 }).lean();
        if (!cur) return { success: false, message: 'err_user_not_found' };
        const lvl = Math.max(0, (cur.xpBoost || {})[characterType] || 0), cost = xpBoostCost(lvl);
        if (lvl >= XP_BOOST_MAX) return { success: false, message: 'err_boost_max' };
        // Qahramon darajasiga qarab: har 3 darajada +1 (3 -> 1, 6 -> 2, ... 21 -> 7, 30 -> 10)
        if (lvl >= xpBoostCapFor(xpLevel(((cur.charXp || {})[characterType]) || 0))) return { success: false, message: 'err_upgrade_locked|' + XP_BOOST_STEP * (lvl + 1) };
        const field = 'xpBoost.' + characterType;
        const filter: any = { _id: userId, [field]: lvl ? lvl : { $in: [0, null] } }, inc: any = {};
        if (payWith === 'points') {
            if (((cur.skillPoints || {})[characterType] || 0) < XP_BOOST_POINTS) return { success: false, message: 'err_no_points_n|' + XP_BOOST_POINTS };
            filter[pts] = { $gte: XP_BOOST_POINTS }; inc[pts] = -XP_BOOST_POINTS;
        } else {
            if ((cur.coins || 0) < cost) return { success: false, message: 'err_not_enough_coins' };
            filter.coins = { $gte: cost }; inc.coins = -cost;
        }
        const doc = await UserModel.findOneAndUpdate(filter, { $inc: inc, $set: { [field]: lvl + 1 } }, { returnDocument: 'after' });
        if (doc) return { success: true, user: docToUser(doc) };
    }
    return { success: false, message: 'err_server' };
}

// ===== MY FARM =====
export type FarmPlot = { c: string, t: number, w?: number, f?: boolean } | null;
export type OrchardTree = { c: string, t: number, h: number } | null;
export interface FarmData {
    plots: FarmPlot[]; zones: number; dock: boolean; rod: boolean; net: boolean; netAt: number;
    bag: { [c: string]: number }; fishN: number; fishV: number;
    rodUses: number; netUses: number; fert: number; water: number; orchard: OrchardTree[];
    tree: { state: string, apples: number, spots: { [i: string]: number } }; lastVisit: number; shroomsLeft: number;
    xp: number; decor: { [id: string]: boolean }; orders: FarmOrder[]; ordersNextAt: number; fishKinds: { [kind: string]: number };
    decorOff: { [id: string]: boolean };
    hive: boolean; mill: number; sprinklers: number; scarecrows: number; greenhouse: boolean;
    home: { owned: { [id: string]: boolean }, place: { [slot: string]: string } };
    chest: { bag: { [c: string]: number }, fishKinds: { [kind: string]: number }, fishN: number, fishV: number, n: number };
}
export type FarmOrder = { id: string, items: { [key: string]: number }, coins: number, xp: number, until: number };
const FARM_N = 36;   // 6 maydon x 6 grядka
const plotsOf = (doc: any): FarmPlot[] => {
    const raw = (doc && doc.farmPlots) || {};
    const out: FarmPlot[] = [];
    for (let i = 0; i < FARM_N; i++) {
        const p = raw[i];
        out.push(p && typeof p.c === 'string' && Number.isFinite(p.t) ? { c: p.c, t: p.t, ...(p.w ? { w: p.w } : {}), ...(p.f ? { f: true } : {}) } : null);
    }
    return out;
};
const orchardOf = (doc: any): OrchardTree[] => {
    const raw = (doc && doc.farmOrchard) || {};
    return [0, 1, 2, 3, 4, 5].map(i => { const p = raw[i]; return p && typeof p.c === 'string' && Number.isFinite(p.t) ? { c: p.c, t: p.t, h: p.h || 0 } : null; });
};
const bagOf = (doc: any): { [c: string]: number } => {
    const raw = (doc && doc.farmBag) || {}, out: { [c: string]: number } = {};
    Object.keys(raw).forEach(k => { const n = Number(raw[k]); if (n > 0) out[k] = Math.floor(n); });
    return out;
};
export type FishItem = { u: string, f: string, kg: number, v: number };
const fishOf = (doc: any): FishItem[] => (Array.isArray(doc && doc.fishBag) ? doc.fishBag : [])
    .filter((x: any) => x && typeof x.u === 'string' && typeof x.f === 'string' && x.v > 0)
    .map((x: any) => ({ u: x.u, f: x.f, kg: Number(x.kg) || 0, v: Math.floor(x.v) }));
const farmOf = (doc: any): FarmData => ({
    plots: plotsOf(doc), zones: Math.max(0, Math.min(5, doc.farmZones || 0)), dock: !!doc.farmDock, rod: !!doc.fishRod, net: !!doc.fishNet,
    netAt: doc.netAt || 0, bag: bagOf(doc), fishN: fishOf(doc).length, fishV: fishOf(doc).reduce((a, f) => a + f.v, 0),
    rodUses: doc.rodUses || 0, netUses: doc.netUses || 0, fert: Math.max(0, doc.fertN || 0), water: Math.max(0, doc.waterN || 0),
    orchard: orchardOf(doc), tree: { state: doc.treeState || 'none', apples: doc.treeApples || 0, spots: doc.treeSpots || {} },
    lastVisit: doc.lastVisit || 0, shroomsLeft: Math.max(0, doc.shroomsLeft || 0),
    xp: Math.max(0, doc.farmXp || 0), decor: doc.farmDecor || {}, orders: Array.isArray(doc.farmOrders) ? doc.farmOrders : [], ordersNextAt: doc.ordersNextAt || 0,
    fishKinds: fishOf(doc).reduce((m: { [k: string]: number }, f) => { m[f.f] = (m[f.f] || 0) + 1; return m; }, {}),
    decorOff: doc.farmDecorOff || {},
    hive: !!doc.farmHive, mill: Math.max(0, Math.min(4, doc.farmMill || 0)),
    sprinklers: Math.max(0, Math.min(6, doc.farmSprinklers || 0)), scarecrows: Math.max(0, Math.min(6, doc.farmScarecrows || 0)), greenhouse: !!doc.farmGreenhouse,
    home: homeOf(doc),
    chest: chestOf(doc)
});
const homeOf = (doc: any) => {
    const h = (doc && doc.farmHome) || {}, owned: { [id: string]: boolean } = {}, place: { [slot: string]: string } = {};
    Object.keys(h.owned || {}).forEach(k => { if (h.owned[k] === true) owned[k] = true; });
    Object.keys(h.place || {}).forEach(k => { if (typeof h.place[k] === 'string' && owned[h.place[k]]) place[k] = h.place[k]; });
    return { owned, place };
};
const chestFishOf = (doc: any): FishItem[] => (Array.isArray(doc && doc.farmChest && doc.farmChest.fish) ? doc.farmChest.fish : [])
    .filter((x: any) => x && typeof x.u === 'string' && typeof x.f === 'string' && x.v > 0)
    .map((x: any) => ({ u: x.u, f: x.f, kg: Number(x.kg) || 0, v: Math.floor(x.v) }));
const chestOf = (doc: any) => {
    const raw = (doc && doc.farmChest && doc.farmChest.bag) || {}, bag: { [c: string]: number } = {};
    Object.keys(raw).forEach(k => { const n = Number(raw[k]); if (n > 0) bag[k] = Math.floor(n); });
    const fish = chestFishOf(doc);
    const fishKinds = fish.reduce((m: { [k: string]: number }, f) => { m[f.f] = (m[f.f] || 0) + 1; return m; }, {});
    const nBag = Object.values(bag).reduce((a, n) => a + n, 0);
    return { bag, fishKinds, fishN: fish.length, fishV: fish.reduce((a, f) => a + f.v, 0), n: nBag + fish.length };
};
const FARM_FIELDS = { farmPlots: 1, farmBag: 1, farmZones: 1, farmDock: 1, fishRod: 1, fishNet: 1, netAt: 1, fishBag: 1, coins: 1,
    rodUses: 1, netUses: 1, fertN: 1, waterN: 1, farmOrchard: 1, treeState: 1, treeApples: 1, treeSpots: 1, lastVisit: 1, shroomsLeft: 1,
    farmXp: 1, farmDecor: 1, farmOrders: 1, ordersNextAt: 1, farmDecorOff: 1, farmHome: 1, farmChest: 1, farmHive: 1, farmMill: 1, farmSprinklers: 1, farmScarecrows: 1, farmGreenhouse: 1 };
export async function getFarm(userId: string): Promise<FarmData | null> {
    const doc: any = await UserModel.findById(userId, FARM_FIELDS).lean();
    return doc ? farmOf(doc) : null;
}
// Bir atomik yozuv: shart (filter) bajarilsa - o'zgartirish; natijada yangi ferma va tanga
async function farmUpdate(userId: string, filter: any, update: any): Promise<{ farm: FarmData, coins: number } | null> {
    const doc: any = await UserModel.findOneAndUpdate({ _id: userId, ...filter }, update, { returnDocument: 'after', projection: FARM_FIELDS });
    return doc ? { farm: farmOf(doc), coins: doc.coins } : null;
}
const noMoney = async (userId: string) => {
    const cur: any = await UserModel.findById(userId, { coins: 1 }).lean();
    return cur ? 'err_not_enough_coins' : 'err_user_not_found';
};
type FarmResult = { success: boolean, message?: string, farm?: FarmData, coins?: number };
// EKISH: grядka bo'sh, maydoni ochilgan va tanga yetsa - urug' puli olinadi
export async function farmPlant(userId: string, i: number, crop: string, price: number): Promise<FarmResult> {
    const zone = Math.floor(i / 6);
    const filter: any = { coins: { $gte: price }, ['farmPlots.' + i]: null };
    if (zone > 0) filter.farmZones = { $gte: zone };
    const r = await farmUpdate(userId, filter, { $inc: { coins: -price }, $set: { ['farmPlots.' + i]: { c: crop, t: Date.now() } } });
    if (r) return { success: true, ...r };
    const cur = await getFarm(userId);
    if (!cur) return { success: false, message: 'err_user_not_found' };
    if (zone > cur.zones) return { success: false, message: 'mf_zone_locked' };
    if (cur.plots[i]) return { success: false, message: 'farm_plot_busy' };
    return { success: false, message: 'err_not_enough_coins' };
}
// YIG'ISH: faqat pishgan bo'lsa (server vaqti va yomg'ir jadvali bo'yicha) - hosil savatga
export async function farmHarvest(userId: string, i: number, ripe: (p: { c: string, t: number, w?: number }) => boolean, goldenChance: number):
    Promise<FarmResult & { crop?: string, n?: number, golden?: boolean }> {
    const cur = await getFarm(userId);
    if (!cur) return { success: false, message: 'err_user_not_found' };
    const p = cur.plots[i];
    if (!p) return { success: false, message: 'farm_plot_empty' };
    if (!ripe(p)) return { success: false, message: 'farm_not_ripe' };
    // O'g'itli: 2 ta hosil, ba'zan "oltin" - 5 ta
    const golden = !!p.f && Math.random() < goldenChance;
    const n = golden ? 5 : p.f ? 2 : 1;
    const r = await farmUpdate(userId, { ['farmPlots.' + i + '.c']: p.c, ['farmPlots.' + i + '.t']: p.t },
        { $set: { ['farmPlots.' + i]: null }, $inc: { ['farmBag.' + p.c]: n, farmXp: 2 * n } });
    return r ? { success: true, crop: p.c, n, golden, ...r } : { success: false, message: 'farm_plot_empty' };
}
// SUG'ORISH (bepul, har ekishga bir marta): shundan keyin grядka 1.5x tez o'sadi
export async function farmWater(userId: string, i: number, price: number): Promise<FarmResult> {
    const r = await farmUpdate(userId, { coins: { $gte: price }, ['farmPlots.' + i + '.c']: { $type: 'string' }, ['farmPlots.' + i + '.w']: { $exists: false } },
        { $inc: { coins: -price }, $set: { ['farmPlots.' + i + '.w']: Date.now() } });
    if (r) return { success: true, ...r };
    const cur = await getFarm(userId);
    if (cur && cur.plots[i] && cur.plots[i]!.w) return { success: false, message: 'mf_already_watered' };
    return { success: false, message: await noMoney(userId) };
}
// O'G'IT: hosil 2 barobar (ba'zan oltin)
export async function farmFertilize(userId: string, i: number): Promise<FarmResult> {
    const r = await farmUpdate(userId, { fertN: { $gte: 1 }, ['farmPlots.' + i + '.c']: { $type: 'string' }, ['farmPlots.' + i + '.f']: { $ne: true } },
        { $inc: { fertN: -1 }, $set: { ['farmPlots.' + i + '.f']: true } });
    if (r) return { success: true, ...r };
    const cur = await getFarm(userId);
    return { success: false, message: cur && cur.fert < 1 ? 'mf_no_fert' : 'mf_already_fert' };
}
// Qo'ziqorin ekinni yedi
export async function farmSpoil(userId: string, i: number, p: { c: string, t: number }): Promise<FarmResult> {
    const r = await farmUpdate(userId, { ['farmPlots.' + i + '.c']: p.c, ['farmPlots.' + i + '.t']: p.t }, { $set: { ['farmPlots.' + i]: null } });
    return r ? { success: true, ...r } : { success: false };
}
// DO'KON: o'g'it / moviy suv (sarflanadigan)
export async function buyConsumable(userId: string, kind: 'fert' | 'water', price: number): Promise<FarmResult> {
    const field = kind === 'fert' ? 'fertN' : 'waterN';
    const r = await farmUpdate(userId, { coins: { $gte: price } }, { $inc: { coins: -price, [field]: 1 } });
    return r ? { success: true, ...r } : { success: false, message: await noMoney(userId) };
}
// Udochka/setka bir marta ishlatildi: toolUses ga yetsa - sinadi (qaytadan sotib olish kerak)
export async function toolUse(userId: string, tool: 'rod' | 'net', max: number): Promise<{ broken: boolean, left: number }> {
    const uses = tool === 'rod' ? 'rodUses' : 'netUses', has = tool === 'rod' ? 'fishRod' : 'fishNet';
    const doc: any = await UserModel.findOneAndUpdate({ _id: userId, [has]: true }, { $inc: { [uses]: 1 } }, { returnDocument: 'after', projection: { [uses]: 1 } });
    if (!doc) return { broken: true, left: 0 };
    if ((doc[uses] || 0) >= max) {
        await UserModel.updateOne({ _id: userId }, { $set: { [has]: false, [uses]: 0 } });
        return { broken: true, left: 0 };
    }
    return { broken: false, left: max - (doc[uses] || 0) };
}
// BOG': mevali daraxt ekish / mevasini terish
export async function orchardPlant(userId: string, slot: number, tree: string, price: number): Promise<FarmResult> {
    const r = await farmUpdate(userId, { coins: { $gte: price }, ['farmOrchard.' + slot]: null },
        { $inc: { coins: -price }, $set: { ['farmOrchard.' + slot]: { c: tree, t: Date.now(), h: 0 } } });
    if (r) return { success: true, ...r };
    const cur = await getFarm(userId);
    if (cur && cur.orchard[slot]) return { success: false, message: 'farm_plot_busy' };
    return { success: false, message: await noMoney(userId) };
}
export async function orchardHarvest(userId: string, slot: number, ready: (t: { c: string, t: number, h: number }) => boolean, yieldOf: (c: string) => number):
    Promise<FarmResult & { crop?: string, n?: number }> {
    const cur = await getFarm(userId);
    const tr = cur && cur.orchard[slot];
    if (!tr) return { success: false, message: 'farm_plot_empty' };
    if (!ready(tr)) return { success: false, message: 'farm_not_ripe' };
    const n = yieldOf(tr.c);
    const r = await farmUpdate(userId, { ['farmOrchard.' + slot + '.c']: tr.c, ['farmOrchard.' + slot + '.h']: tr.h },
        { $set: { ['farmOrchard.' + slot + '.h']: Date.now() }, $inc: { ['farmBag.' + tr.c]: n, farmXp: 2 * n } });
    return r ? { success: true, crop: tr.c, n, ...r } : { success: false, message: 'farm_not_ripe' };
}
// BAXAYBAT DARAXT: sotib olish (400) / moviy suv quyish / ko'k olma terish / boss yengildi
export async function treeBuy(userId: string, price: number): Promise<FarmResult> {
    const r = await farmUpdate(userId, { coins: { $gte: price }, treeState: { $in: ['none', null] } }, { $inc: { coins: -price }, $set: { treeState: 'dry' } });
    if (r) return { success: true, ...r };
    const cur = await getFarm(userId);
    if (cur && cur.tree.state !== 'none') return { success: false, message: 'mf_already_open' };
    return { success: false, message: await noMoney(userId) };
}
export async function treeWater(userId: string): Promise<FarmResult> {
    const r = await farmUpdate(userId, { treeState: 'dry', waterN: { $gte: 1 } }, { $inc: { waterN: -1 }, $set: { treeState: 'grow', treeApples: 0, treeSpots: {} } });
    if (r) return { success: true, ...r };
    const cur = await getFarm(userId);
    return { success: false, message: cur && cur.tree.state === 'dry' ? 'mf_no_water' : 'mf_tree_not_dry' };
}
export async function treePick(userId: string, spot: number, regrowMs: number, need: number): Promise<FarmResult & { boss?: boolean }> {
    const cur = await getFarm(userId);
    if (!cur) return { success: false, message: 'err_user_not_found' };
    if (cur.tree.state !== 'grow') return { success: false, message: 'mf_tree_not_grow' };
    const last = cur.tree.spots[spot] || 0, now = Date.now();
    if (now - last < regrowMs) return { success: false, message: 'mf_apple_gone' };
    const boss = cur.tree.apples + 1 >= need;
    const r = await farmUpdate(userId, { treeState: 'grow', ['treeSpots.' + spot]: last ? last : { $exists: false } },
        { $set: { ['treeSpots.' + spot]: now, ...(boss ? { treeState: 'boss' } : {}) }, $inc: { treeApples: 1, 'farmBag.blueapple': 1, farmXp: 1 } });
    return r ? { success: true, boss, ...r } : { success: false, message: 'mf_apple_gone' };
}
export async function treeBossDone(userId: string): Promise<FarmResult> {
    const r = await farmUpdate(userId, { treeState: 'boss' }, { $set: { treeState: 'dry', treeApples: 0, treeSpots: {} }, $inc: { farmXp: 60 } });
    return r ? { success: true, ...r } : { success: false };
}
export async function farmTouch(userId: string): Promise<void> {
    try { await UserModel.updateOne({ _id: userId }, { $set: { lastVisit: Date.now() } }); } catch (err) { console.error('farmTouch xatosi:', err); }
}
// Ferma egasi halok bo'ldi - grядkalardagi barcha ekinlarni maxluqlar yeb ketdi (bog' daraxtlari qoladi)
export async function farmWipeCrops(userId: string): Promise<FarmResult & { n?: number }> {
    const cur = await getFarm(userId);
    if (!cur) return { success: false };
    const n = cur.plots.filter(Boolean).length;
    if (!n) return { success: true, n: 0, farm: cur };
    const r = await farmUpdate(userId, {}, { $set: { farmPlots: {} } });
    return r ? { success: true, n, ...r } : { success: false };
}
export async function farmSetShrooms(userId: string, n: number): Promise<void> {
    try { await UserModel.updateOne({ _id: userId }, { $set: { shroomsLeft: Math.max(0, n) } }); } catch (err) { console.error('farmSetShrooms xatosi:', err); }
}
// "FREE PLOT" maydonini sotib olish - faqat navbat bilan (1, 2, 3)
export async function farmBuyZone(userId: string, zone: number, price: number): Promise<FarmResult> {
    const r = await farmUpdate(userId, { coins: { $gte: price }, farmZones: zone === 1 ? { $in: [0, null] } : zone - 1 },
        { $inc: { coins: -price }, $set: { farmZones: zone } });
    if (r) return { success: true, ...r };
    const cur = await getFarm(userId);
    if (!cur) return { success: false, message: 'err_user_not_found' };
    if (cur.zones >= zone) return { success: false, message: 'mf_already_open' };
    if (cur.zones < zone - 1) return { success: false, message: 'mf_zone_order' };
    return { success: false, message: 'err_not_enough_coins' };
}
export async function farmBuyDock(userId: string, price: number): Promise<FarmResult> {
    const r = await farmUpdate(userId, { coins: { $gte: price }, farmDock: { $ne: true } }, { $inc: { coins: -price }, $set: { farmDock: true } });
    if (r) return { success: true, ...r };
    const cur = await getFarm(userId);
    if (cur && cur.dock) return { success: false, message: 'mf_already_open' };
    return { success: false, message: await noMoney(userId) };
}
// DO'KON: udochka / katta setka (bir marta sotib olinadi)
export async function buyFishTool(userId: string, tool: 'rod' | 'net', price: number): Promise<FarmResult> {
    const field = tool === 'rod' ? 'fishRod' : 'fishNet';
    const r = await farmUpdate(userId, { coins: { $gte: price }, [field]: { $ne: true } },
        { $inc: { coins: -price }, $set: { [field]: true, [tool === 'rod' ? 'rodUses' : 'netUses']: 0 } });
    if (r) return { success: true, ...r };
    const cur = await getFarm(userId);
    if (cur && cur[tool]) return { success: false, message: 'shop_not_needed' };
    return { success: false, message: await noMoney(userId) };
}
// Setka: oxirgi tashlashdan cooldown o'tgan bo'lsa - vaqt belgilanadi (baliqlarni chaqiruvchi qo'shadi)
export async function farmUseNet(userId: string, cooldownMs: number): Promise<boolean> {
    const now = Date.now();
    const r = await farmUpdate(userId, { fishNet: true, $or: [{ netAt: { $exists: false } }, { netAt: { $lte: now - cooldownMs } }] }, { $set: { netAt: now } });
    return !!r;
}
// Tutilgan baliqlar inventarga (eng ko'pi 500 ta - eskilari tushib qoladi)
export async function farmAddFish(userId: string, fish: { id: string, kg: number, value: number }[], xp: number = 0): Promise<FarmResult> {
    const items = fish.map(f => ({ u: Date.now().toString(36) + Math.random().toString(36).slice(2, 8), f: f.id, kg: f.kg, v: f.value }));
    const r = await farmUpdate(userId, {}, { $push: { fishBag: { $each: items, $slice: -500 } }, $inc: { farmXp: xp } });
    return r ? { success: true, ...r } : { success: false, message: 'err_user_not_found' };
}
// INVENTAR: hosil (turi bo'yicha soni), baliqlar (har biri), asboblar
export async function getInventory(userId: string): Promise<{ crops: { [c: string]: number }, fish: FishItem[], rod: boolean, net: boolean, coins: number,
    rodUses: number, netUses: number, fert: number, water: number, farmXp: number } | null> {
    const doc: any = await UserModel.findById(userId, { farmBag: 1, fishBag: 1, fishRod: 1, fishNet: 1, coins: 1, rodUses: 1, netUses: 1, fertN: 1, waterN: 1, farmXp: 1 }).lean();
    return doc ? { crops: bagOf(doc), fish: fishOf(doc), rod: !!doc.fishRod, net: !!doc.fishNet, coins: doc.coins || 0,
        rodUses: doc.rodUses || 0, netUses: doc.netUses || 0, fert: Math.max(0, doc.fertN || 0), water: Math.max(0, doc.waterN || 0), farmXp: doc.farmXp || 0 } : null;
}
// INVENTARDAN SOTISH: tanlangan hosil (soni bilan) va baliqlar (id bo'yicha). Bitta atomik yozuv: o'qilgan
// miqdorlar va baliqlar hali bazada bo'lsagina (parallel sotuvda ikki marta pul olinmaydi)
export async function sellInventory(userId: string, crops: { [c: string]: number } | 'all', fishU: string[] | 'all', prices: { [crop: string]: number }, bonus: string[] = []):
    Promise<{ success: boolean, message?: string, coins?: number, earned?: number, nCrops?: number, nFish?: number }> {
    for (let attempt = 0; attempt < 3; attempt++) {
        const inv = await getInventory(userId);
        if (!inv) return { success: false, message: 'err_user_not_found' };
        const want = crops === 'all' ? inv.crops : crops;
        const filter: any = { _id: userId }, inc: any = {};
        let earned = 0, nCrops = 0;
        for (const c of Object.keys(want)) {
            const n = Math.floor(Number(want[c]));
            if (!(n > 0)) continue;
            if (!(prices[c] > 0) || !((inv.crops[c] || 0) >= n)) return { success: false, message: 'inv_changed' };
            filter['farmBag.' + c] = { $gte: n }; inc['farmBag.' + c] = -n;
            earned += n * prices[c] * (bonus.includes(c) ? 2 : 1); nCrops += n;   // bugungi taklif - 2x
        }
        const pick = fishU === 'all' ? inv.fish : inv.fish.filter(f => fishU.includes(f.u));
        if (fishU !== 'all' && pick.length !== new Set(fishU).size) return { success: false, message: 'inv_changed' };
        pick.forEach(f => { earned += f.v * (bonus.includes(f.f) ? 2 : 1); });
        if (!earned) return { success: false, message: 'inv_nothing' };
        const update: any = { $inc: { ...inc, coins: earned } };
        if (pick.length) { filter['fishBag.u'] = { $all: pick.map(f => f.u) }; update.$pull = { fishBag: { u: { $in: pick.map(f => f.u) } } }; }
        const doc: any = await UserModel.findOneAndUpdate(filter, update, { returnDocument: 'after' });
        if (doc) return { success: true, coins: doc.coins, earned, nCrops, nFish: pick.length };
    }
    return { success: false, message: 'err_server' };
}

// BUYURTMALAR: ro'yxatni yangilash (muddati o'tganlar o'chadi, yangilari qo'shiladi)
export async function farmSetOrders(userId: string, orders: FarmOrder[], nextAt: number): Promise<FarmResult> {
    const r = await farmUpdate(userId, {}, { $set: { farmOrders: orders, ordersNextAt: nextAt } });
    return r ? { success: true, ...r } : { success: false, message: 'err_user_not_found' };
}
// Buyurtmani topshirish: kerakli hosil va baliqlar (har turdan eng arzonlari) bitta atomik yozuvda olinadi,
// tanga va ferma XP beriladi, buyurtma ro'yxatdan chiqadi
export async function farmDeliver(userId: string, orderId: string, nextAt: number): Promise<FarmResult & { order?: FarmOrder }> {
    for (let attempt = 0; attempt < 3; attempt++) {
        const doc: any = await UserModel.findById(userId, { farmBag: 1, fishBag: 1, farmOrders: 1 }).lean();
        if (!doc) return { success: false, message: 'err_user_not_found' };
        const order: FarmOrder | undefined = (doc.farmOrders || []).find((o: FarmOrder) => o.id === orderId);
        if (!order) return { success: false, message: 'mf_order_gone' };
        if (order.until < Date.now()) return { success: false, message: 'mf_order_gone' };
        const bag = bagOf(doc), fish = fishOf(doc);
        const filter: any = { _id: userId, 'farmOrders.id': orderId }, inc: any = { coins: order.coins, farmXp: order.xp };
        const pull: string[] = [];
        for (const key of Object.keys(order.items)) {
            const n = order.items[key];
            if (key.startsWith('fish:')) {
                const kind = key.slice(5), mine = fish.filter(f => f.f === kind).sort((a, b) => a.v - b.v);
                if (mine.length < n) return { success: false, message: 'mf_order_missing' };
                mine.slice(0, n).forEach(f => pull.push(f.u));
            } else {
                if ((bag[key] || 0) < n) return { success: false, message: 'mf_order_missing' };
                filter['farmBag.' + key] = { $gte: n }; inc['farmBag.' + key] = -n;
            }
        }
        const pullOps: any = { farmOrders: { id: orderId } };
        if (pull.length) { filter['fishBag.u'] = { $all: pull }; pullOps.fishBag = { u: { $in: pull } }; }
        const r = await farmUpdate(userId, filter, { $inc: inc, $pull: pullOps, $set: { ordersNextAt: nextAt } });
        if (r) return { success: true, order, ...r };
    }
    return { success: false, message: 'err_server' };
}
// BOG': daraxtni kesish - joy bo'shaydi (yangi ko'chat ekish mumkin), eski daraxt yo'qoladi
export async function orchardCut(userId: string, slot: number): Promise<FarmResult> {
    const r = await farmUpdate(userId, { ['farmOrchard.' + slot + '.c']: { $type: 'string' } }, { $set: { ['farmOrchard.' + slot]: null } });
    return r ? { success: true, ...r } : { success: false, message: 'farm_plot_empty' };
}
// FERMER UYI: jihoz sotib olish (bir marta) va joylashtirish / olib qo'yish
export async function buyHomeItem(userId: string, id: string, price: number): Promise<FarmResult> {
    const r = await farmUpdate(userId, { coins: { $gte: price }, ['farmHome.owned.' + id]: { $ne: true } },
        { $inc: { coins: -price }, $set: { ['farmHome.owned.' + id]: true } });
    if (r) return { success: true, ...r };
    const cur = await getFarm(userId);
    if (cur && cur.home.owned[id]) return { success: false, message: 'shop_not_needed' };
    return { success: false, message: await noMoney(userId) };
}
// item = null - joyni bo'shatish. Jihoz bitta joyda turadi (boshqa joyda bo'lsa - ko'chiriladi)
export async function homePlace(userId: string, slot: string, item: string | null, fits: (item: string) => boolean): Promise<FarmResult> {
    const cur = await getFarm(userId);
    if (!cur) return { success: false, message: 'err_server' };
    const now = cur.home.place[slot] || null;
    if (item === null) {
        if (!now) return { success: false, message: 'farm_plot_empty' };
        if (now === 'chest' && cur.chest.n > 0) return { success: false, message: 'home_chest_not_empty' };
        const r = await farmUpdate(userId, { ['farmHome.place.' + slot]: now }, { $unset: { ['farmHome.place.' + slot]: 1 } });
        return r ? { success: true, ...r } : { success: false, message: 'err_server' };
    }
    if (!cur.home.owned[item]) return { success: false, message: 'home_not_owned' };
    if (!fits(item)) return { success: false, message: 'home_wrong_slot' };
    if (now) return { success: false, message: 'farm_plot_busy' };
    const set: any = { ['farmHome.place.' + slot]: item }, unset: any = {};
    const old = Object.keys(cur.home.place).find(k => cur.home.place[k] === item);
    if (old) unset['farmHome.place.' + old] = 1;   // boshqa joydan ko'chiriladi
    const filter: any = { ['farmHome.place.' + slot]: { $exists: false } };
    if (old) filter['farmHome.place.' + old] = item;
    const r = await farmUpdate(userId, filter, Object.keys(unset).length ? { $set: set, $unset: unset } : { $set: set });
    return r ? { success: true, ...r } : { success: false, message: 'err_server' };
}
// YASHIK: inventardan solish (dir = 'put') yoki inventarga olish ('take'). key - ekin nomi yoki 'fish:<turi>'
export async function chestMove(userId: string, dir: 'put' | 'take', key: string, n: number, invCap: number, chestCap: number): Promise<FarmResult & { moved?: number }> {
    const doc: any = await UserModel.findById(userId, FARM_FIELDS).lean();
    if (!doc) return { success: false, message: 'err_server' };
    const f = farmOf(doc);
    if (!Object.values(f.home.place).includes('chest')) return { success: false, message: 'home_no_chest' };
    const invUsed = Object.values(f.bag).reduce((a, x) => a + x, 0) + f.fishN;
    const room = dir === 'put' ? chestCap - f.chest.n : invCap - invUsed;
    if (room <= 0) return { success: false, message: dir === 'put' ? 'home_chest_full' : 'inv_full' };
    if (key.startsWith('fish:')) {
        const kind = key.slice(5);
        const from = dir === 'put' ? fishOf(doc) : chestFishOf(doc);
        const pick = from.filter(x => x.f === kind).slice(0, Math.min(n, room));
        if (!pick.length) return { success: false, message: 'farm_plot_empty' };
        const us = pick.map(x => x.u);
        const srcPath = dir === 'put' ? 'fishBag' : 'farmChest.fish', dstPath = dir === 'put' ? 'farmChest.fish' : 'fishBag';
        const r = await farmUpdate(userId, { [srcPath + '.u']: { $all: us } },
            { $pull: { [srcPath]: { u: { $in: us } } }, $push: { [dstPath]: { $each: pick } } });
        return r ? { success: true, moved: pick.length, ...r } : { success: false, message: 'err_server' };
    }
    if (!/^[a-z]{2,20}$/.test(key)) return { success: false, message: 'err_bad_item' };
    const have = dir === 'put' ? (f.bag[key] || 0) : (f.chest.bag[key] || 0);
    const k = Math.min(n, have, room);
    if (k <= 0) return { success: false, message: 'farm_plot_empty' };
    const src = dir === 'put' ? 'farmBag.' + key : 'farmChest.bag.' + key, dst = dir === 'put' ? 'farmChest.bag.' + key : 'farmBag.' + key;
    const r = await farmUpdate(userId, { [src]: { $gte: k } }, { $inc: { [src]: -k, [dst]: k } });
    return r ? { success: true, moved: k, ...r } : { success: false, message: 'err_server' };
}
// Tashqi bezakni yashikka olish (ko'rinmaydi) yoki qaytarib qo'yish
export async function decorStore(userId: string, id: string, stored: boolean): Promise<FarmResult> {
    const r = await farmUpdate(userId, { ['farmDecor.' + id]: true },
        stored ? { $set: { ['farmDecorOff.' + id]: true } } : { $unset: { ['farmDecorOff.' + id]: 1 } });
    return r ? { success: true, ...r } : { success: false, message: 'home_not_owned' };
}
// O'SISH TEZLATGICHLARI: nota uyasi (bir marta) va tegirmon (keyingi bosqich, ketma-ket)
export async function buyFarmBooster(userId: string, what: 'hive' | 'mill' | 'greenhouse' | 'sprinkler' | 'scarecrow', price: number, curMill: number): Promise<FarmResult> {
    // Bir martalik (uya, issiqxona) yoki sanaladigan (tegirmon bosqichi, sug'orgich, qo'rqinchoq - joriy son o'zgarmagan bo'lsa +1)
    const flag: any = { hive: 'farmHive', greenhouse: 'farmGreenhouse' }, cnt: any = { mill: 'farmMill', sprinkler: 'farmSprinklers', scarecrow: 'farmScarecrows' };
    const filter: any = flag[what] ? { [flag[what]]: { $ne: true } } : { [cnt[what]]: curMill ? curMill : { $in: [0, null] } };
    const set: any = flag[what] ? { [flag[what]]: true } : { [cnt[what]]: curMill + 1 };
    const r = await farmUpdate(userId, { coins: { $gte: price }, ...filter }, { $inc: { coins: -price }, $set: set });
    if (r) return { success: true, ...r };
    const cur = await getFarm(userId);
    if (cur && ((what === 'hive' && cur.hive) || (what === 'greenhouse' && cur.greenhouse) || (what === 'mill' && cur.mill !== curMill)
        || (what === 'sprinkler' && cur.sprinklers !== curMill) || (what === 'scarecrow' && cur.scarecrows !== curMill))) return { success: false, message: 'shop_not_needed' };
    return { success: false, message: await noMoney(userId) };
}
// BEZAK sotib olish (bir marta)
export async function buyDecor(userId: string, id: string, price: number): Promise<FarmResult> {
    const r = await farmUpdate(userId, { coins: { $gte: price }, ['farmDecor.' + id]: { $ne: true } }, { $inc: { coins: -price }, $set: { ['farmDecor.' + id]: true } });
    if (r) return { success: true, ...r };
    const cur = await getFarm(userId);
    if (cur && cur.decor[id]) return { success: false, message: 'shop_not_needed' };
    return { success: false, message: await noMoney(userId) };
}

// ===== ADMIN PANEL: qo'shimcha amallar =====
// Parolni almashtirish (o'yinchi parolini unutgan bo'lsa) - ro'yxatdan o'tishdagi qoida: 8..72 belgi
export async function adminSetPassword(userId: string, passwordRaw: unknown): Promise<{ success: boolean, message?: string, user?: UserRecord }> {
    const password = typeof passwordRaw === 'string' ? passwordRaw : '';
    if (password.length < PASSWORD_MIN) return { success: false, message: 'err_password_short' };
    if (password.length > 72) return { success: false, message: 'err_field_length' };
    const passwordHash = await bcrypt.hash(password, 10);
    const doc = await UserModel.findByIdAndUpdate(userId, { $set: { passwordHash } }, { returnDocument: 'after' });
    return doc ? { success: true, user: docToUser(doc) } : { success: false, message: 'err_user_not_found' };
}
// La'natlarni olib tashlash (kislota / chaqmoq / ikkalasi)
export async function adminClearCurses(userId: string, kinds: ('acid' | 'bolt')[]): Promise<UserRecord | null> {
    const set: any = {};
    if (kinds.includes('acid')) set.cursedAcid = false;
    if (kinds.includes('bolt')) set.cursedBolt = false;
    const doc = await UserModel.findByIdAndUpdate(userId, { $set: set }, { returnDocument: 'after' });
    return doc ? docToUser(doc) : null;
}
// Sovg'a: detal (kosmetika kaliti - "head:crown", "knight.sword:holo") yoki personaj / qurol skini
export async function adminGiftCosmetic(userId: string, key: string): Promise<UserRecord | null> {
    const doc = await UserModel.findByIdAndUpdate(userId, { $addToSet: { ownedCosmetics: key } }, { returnDocument: 'after' });
    return doc ? docToUser(doc) : null;
}
export async function adminGiftSkin(userId: string, category: 'hero' | 'weapon', characterType: string, skinId: string): Promise<UserRecord | null> {
    const field = (category === 'weapon' ? 'ownedWeaponSkins.' : 'ownedSkins.') + characterType;
    const doc = await UserModel.findByIdAndUpdate(userId, { $addToSet: { [field]: skinId } }, { returnDocument: 'after' });
    return doc ? docToUser(doc) : null;
}
// Chat taqiqi: until - ms (0 - olib tashlash, -1 - doimiy)
export async function adminSetMute(userId: string, until: number): Promise<UserRecord | null> {
    const doc = await UserModel.findByIdAndUpdate(userId, { $set: { mutedUntil: until } }, { returnDocument: 'after' });
    return doc ? docToUser(doc) : null;
}
export function isMuted(mutedUntil: number | undefined): boolean {
    return mutedUntil === -1 || (!!mutedUntil && mutedUntil > Date.now());
}

// ADMIN AMALLARI JURNALI: kim (admin + IP), qachon, nima qildi, kimga
const adminLogSchema = new mongoose.Schema({
    at: { type: Date, default: () => new Date(), index: true },
    admin: { type: String, default: 'admin' },
    action: { type: String, required: true },
    target: { type: String, default: '' },
    detail: { type: String, default: '' }
});
const AdminLogModel = mongoose.model('AdminLog', adminLogSchema);
export async function addAdminLog(admin: string, action: string, target: string, detail: string): Promise<void> {
    try { await AdminLogModel.create({ admin: admin.slice(0, 60), action: action.slice(0, 40), target: target.slice(0, 60), detail: detail.slice(0, 300) }); }
    catch (err) { console.error('addAdminLog xatosi:', err); }
}
export async function listAdminLog(skip: number, limit: number): Promise<{ total: number, items: { at: Date, admin: string, action: string, target: string, detail: string }[] }> {
    const [total, docs] = await Promise.all([
        AdminLogModel.countDocuments({}),
        AdminLogModel.find({}).sort({ at: -1 }).skip(Math.max(0, skip)).limit(Math.min(100, Math.max(1, limit))).lean()
    ]);
    return { total, items: docs.map((d: any) => ({ at: d.at, admin: d.admin, action: d.action, target: d.target, detail: d.detail })) };
}

// KUNLIK STATISTIKA (UTC kun bo'yicha hisoblagichlar): xarita boshlandi / o'tildi / yutqazildi,
// reklama ko'rildi, reklamadan tanga, admin bergan tanga
const dayStatSchema = new mongoose.Schema({
    day: { type: String, required: true, unique: true },
    c: { type: Object, default: () => ({}) }
}, { minimize: false });
const DayStatModel = mongoose.model('DayStat', dayStatSchema);
const utcDay = () => new Date().toISOString().slice(0, 10);
export function bumpStat(fields: { [key: string]: number }): void {
    const inc: any = {};
    Object.keys(fields).forEach(k => { if (/^[a-zA-Z0-9_.]+$/.test(k) && Number.isFinite(fields[k])) inc['c.' + k] = fields[k]; });
    if (!Object.keys(inc).length) return;
    DayStatModel.updateOne({ day: utcDay() }, { $inc: inc }, { upsert: true }).catch(err => console.error('bumpStat xatosi:', err));
}
export async function getDayStats(days: number): Promise<{ day: string, c: any }[]> {
    const from = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);
    const docs = await DayStatModel.find({ day: { $gte: from } }).sort({ day: 1 }).lean();
    return docs.map((d: any) => ({ day: d.day, c: d.c || {} }));
}
// Kunlik ro'yxatdan o'tishlar (oxirgi N kun)
export async function registrationsByDay(days: number): Promise<{ day: string, n: number }[]> {
    const from = new Date(Date.now() - (days - 1) * 86400000);
    from.setUTCHours(0, 0, 0, 0);
    const rows = await UserModel.aggregate([
        { $match: { createdAt: { $gte: from } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, n: { $sum: 1 } } }
    ]);
    return rows.map((r: any) => ({ day: r._id, n: r.n }));
}

// SOZLAMALAR (texnik ishlar rejimi va h.k.) - server qayta ishga tushsa ham saqlanadi
const settingSchema = new mongoose.Schema({ key: { type: String, required: true, unique: true }, value: { type: Object } });
const SettingModel = mongoose.model('Setting', settingSchema);
export async function getSetting(key: string): Promise<any> {
    const d: any = await SettingModel.findOne({ key }).lean();
    return d ? d.value : null;
}
export async function setSetting(key: string, value: any): Promise<void> {
    await SettingModel.updateOne({ key }, { $set: { value } }, { upsert: true });
}

export default UserModel;