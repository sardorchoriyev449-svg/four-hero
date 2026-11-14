import { SKINS_OFF } from './skins';
// DETALLAR (kosmetika): bosh kiyimi, yuz buyumi va qurol ko'rinishlari. Faqat tashqi ko'rinish -
// o'yin kuchiga ta'sir qilmaydi. Bosh va yuz buyumlari HAMMA personajga umumiy (bir marta sotib
// olinadi, har personajga alohida kiydiriladi); qurol ko'rinishlari - o'sha personajning qurol turiga.
// Rasmlar klientda (client/cosmetics.js) - id lar bir xil bo'lishi shart

export interface CosmeticItem {
    id: string;
    name: string;
    price: number;
    secret?: boolean;   // do'konda sotilmaydi - o'yinda topiladi (masalan, Shohning qora toji)
}

// Narxlar: har ro'yxatda arzonidan qimmatiga qarab o'sib boradi (do'konda ham shu tartibda)

export const HEAD_ITEMS: CosmeticItem[] = [
    { id: 'bucket', name: 'Bucket', price: 250 },
    { id: 'chef', name: 'Chef Hat', price: 400 },
    { id: 'bow', name: 'Big Bow', price: 450 },
    { id: 'backcap', name: 'Backwards Cap', price: 450 },
    { id: 'cowboy', name: 'Cowboy Hat', price: 550 },
    { id: 'kasa', name: 'Japanese Hat', price: 700 },
    { id: 'bunny', name: 'Bunny Ears', price: 900 },
    { id: 'flowercrown', name: 'Flower Crown', price: 1000 },
    { id: 'headphones', name: 'Gamer Headphones', price: 1000 },
    { id: 'safari', name: 'Robinson Hat', price: 1100 },
    { id: 'cat', name: 'Cat Ears', price: 1400 },
    { id: 'pirate', name: 'Pirate Hat', price: 1700 },
    { id: 'crown', name: 'Royal Crown', price: 2100 },
    { id: 'tiara', name: 'Princess Tiara', price: 2400 },
    { id: 'spiky', name: 'Spiky Hair', price: 2400 },
    { id: 'punk', name: 'Punk Hair', price: 2600 },
    { id: 'viking', name: 'Viking Helmet', price: 3200 },
    { id: 'wizard', name: 'Wizard Hat', price: 3900 },
    { id: 'blackcrown', name: 'Black Crown', price: 0, secret: true }   // Skyland: shaxmat zalidagi Shohdan olinadi
];

export const FACE_ITEMS: CosmeticItem[] = [
    { id: 'clown', name: 'Clown Nose', price: 250 },
    { id: 'glasses', name: 'Glasses', price: 400 },
    { id: 'blush', name: 'Rosy Cheeks', price: 500 },
    { id: 'bandana', name: 'Bandit Bandana', price: 500 },
    { id: 'mustache', name: 'Mustache', price: 550 },
    { id: 'hockey', name: 'Hockey Mask', price: 700 },
    { id: 'goggles', name: 'Ski Goggles', price: 900 },
    { id: 'eyepatch', name: 'Eye Patch', price: 1100 },
    { id: 'shades', name: 'Sunglasses', price: 1400 },
    { id: 'butterfly', name: 'Butterfly Mask', price: 1500 },
    { id: 'heromask', name: 'Hero Mask', price: 1500 },
    { id: 'heart', name: 'Heart Glasses', price: 1700 },
    { id: 'cyber', name: 'Cyber Glasses', price: 2100 },
    { id: 'ninja', name: 'Ninja Mask', price: 2600 }
];

// KIYIM (tana ustidan): hamma personajga umumiy (bosh / yuz kabi). Rasmi - client/cosmetics.js (CLOTHES)
export const BODY_ITEMS: CosmeticItem[] = [
    { id: 'pinkdress', name: 'Pink Dress', price: 600 },
    { id: 'hoodie', name: 'Blue Hoodie', price: 600 },
    { id: 'school', name: 'School Uniform', price: 700 },
    { id: 'pinktee', name: 'Pink Tee & Jeans', price: 700 },
    { id: 'tracksuit', name: 'Tracksuit', price: 800 },
    { id: 'plaid', name: 'Plaid Shirt & Jeans', price: 900 },
    { id: 'flowerdress', name: 'Flower Dress', price: 1000 },
    { id: 'football', name: 'Football Kit', price: 1000 },
    { id: 'sweater', name: 'Mint Sweater & Skirt', price: 1400 },
    { id: 'leather', name: 'Leather Jacket', price: 1400 },
    { id: 'suit', name: 'Business Suit', price: 1800 },
    { id: 'tutu', name: 'Ballerina Tutu', price: 1900 },
    { id: 'camo', name: 'Camo Suit', price: 1900 },
    { id: 'custom', name: 'Outfit Maker', price: 2000 },   // KIYIM KONSTRUKTORI: bir marta ochiladi, o'yinchi o'z kiyimini yig'adi (hisobda customOutfit kodi)
    { id: 'gown', name: 'Princess Gown', price: 3000 },
    { id: 'tuxedo', name: 'Tuxedo', price: 3000 }
];

// Har personajning qurol turlari (slot) va ularning ko'rinishlari
export const WEAPON_ITEMS: { [characterType: string]: { [slot: string]: CosmeticItem[] } } = {
    knight: {
        sword: [
            { id: 'bat', name: 'Baseball Bat', price: 250 },
            { id: 'pink', name: 'Pink Sword', price: 400 },
            { id: 'candy', name: 'Candy Cane', price: 550 },
            { id: 'greatsword', name: 'Black Greatsword', price: 700 },
            { id: 'guitar', name: 'Guitar', price: 900 },
            { id: 'bone', name: 'Bone Club', price: 1100 },
            { id: 'fish', name: 'Fish Sword', price: 1400 },
            { id: 'holo', name: 'Hologram Sword', price: 1700 },
            { id: 'ice', name: 'Ice Sword', price: 2100 },
            { id: 'flame', name: 'Flame Sword', price: 2600 }
        ],
        shield: [
            { id: 'triangle', name: 'Triangle Shield', price: 250 },
            { id: 'pink', name: 'Pink Shield', price: 400 },
            { id: 'door', name: 'House Door', price: 550 },
            { id: 'cardoor', name: 'Car Door', price: 700 },
            { id: 'pan', name: 'Frying Pan', price: 900 },
            { id: 'pizza', name: 'Pizza Slice', price: 1100 },
            { id: 'turtle', name: 'Turtle Shell', price: 1400 },
            { id: 'ice', name: 'Ice Shield', price: 1700 },
            { id: 'golden', name: 'Golden Shield', price: 2100 }
        ],
        shotgun: [
            { id: 'toy', name: 'Toy Shotgun', price: 250 },
            { id: 'pink', name: 'Pink Shotgun', price: 400 },
            { id: 'water', name: 'Water Gun', price: 550 },
            { id: 'branch', name: 'Branch Shotgun', price: 700 },
            { id: 'pirate', name: 'Blunderbuss', price: 900 },
            { id: 'dark', name: 'Dark Shotgun', price: 1100 },
            { id: 'ice', name: 'Ice Shotgun', price: 1400 },
            { id: 'laser', name: 'Laser Shotgun', price: 1700 },
            { id: 'golden', name: 'Golden Shotgun', price: 2100 }
        ]
    },
    mage: {
        staff: [
            { id: 'pink', name: 'Pink Staff', price: 250 },
            { id: 'broom', name: 'Broom', price: 400 },
            { id: 'stop', name: 'Stop Sign Staff', price: 550 },
            { id: 'torch', name: 'Torch', price: 700 },
            { id: 'wand', name: 'Star Wand', price: 900 },
            { id: 'lolli', name: 'Lollipop', price: 1100 },
            { id: 'candy', name: 'Cotton Candy', price: 1400 },
            { id: 'crystal', name: 'Crystal Staff', price: 1700 },
            { id: 'skull', name: 'Skull Staff', price: 2100 }
        ]
    },
    archer: {
        bow: [
            { id: 'pinkpistol', name: 'Pink Pistol', price: 250 },
            { id: 'slingshot', name: 'Slingshot', price: 400 },
            { id: 'pistol', name: 'Pistol', price: 550 },
            { id: 'elf', name: 'Elven Bow', price: 700 },
            { id: 'bone', name: 'Bone Bow', price: 900 },
            { id: 'cyber', name: 'Cyber Crossbow', price: 1100 },
            { id: 'ice', name: 'Ice Bow', price: 1400 },
            { id: 'blaster', name: 'Blaster', price: 1700 },
            { id: 'golden', name: 'Golden Bow', price: 2100 }
        ]
    },
    hunter: {},
    samurai: {
        katana: [
            { id: 'shinai', name: 'Shinai', price: 250 },
            { id: 'pink', name: 'Pink Katana', price: 400 },
            { id: 'bamboo', name: 'Bamboo Stick', price: 550 },
            { id: 'red', name: 'Red Katana', price: 700 },
            { id: 'jade', name: 'Jade Katana', price: 900 },
            { id: 'holo', name: 'Hologram Katana', price: 1100 },
            { id: 'dark', name: 'Dark Katana', price: 1400 },
            { id: 'ice', name: 'Ice Katana', price: 1700 },
            { id: 'flame', name: 'Flame Katana', price: 2100 },
            { id: 'golden', name: 'Golden Katana', price: 2600 }
        ]
    }
};

// Kiyilgan detallarni bitta qisqa satrda yuborish tartibi (o'yin holati har 30ms da ketadi)
export const LOOK_SLOTS = ['head', 'face', 'sword', 'shield', 'shotgun', 'staff', 'bow', 'katana', 'kunai', 'body'];   // body - oxirida (eski satrlar buzilmaydi)

// Shu personaj uchun shu slotda bor buyum (yo'q bo'lsa - null)
export function findCosmetic(characterType: string, slot: string, itemId: string): CosmeticItem | null {
    if (typeof itemId !== 'string') return null;
    let list: CosmeticItem[] | undefined;
    if (slot === 'head') list = HEAD_ITEMS;
    else if (slot === 'face') list = FACE_ITEMS;
    else if (slot === 'body') list = BODY_ITEMS;
    else list = WEAPON_ITEMS[characterType] && WEAPON_ITEMS[characterType][slot];
    return (list && list.find(i => i.id === itemId)) || null;
}

// Egalik kaliti: bosh/yuz - umumiy ("head:cowboy"), qurol - personajga ("knight.sword:bat")
export function cosmeticKey(characterType: string, slot: string, itemId: string): string {
    return (slot === 'head' || slot === 'face' || slot === 'body') ? slot + ':' + itemId : characterType + '.' + slot + ':' + itemId;
}

// O'YINCHI YIGG'AN KIYIM KODI: "x" + 7 ta 16-lik raqam - ustki rang, naqsh (0-4), naqsh rangi, pasti (0-3: shim, shorti, yubka, uzun ko'ylak),
// pastki rang, oyoq kiyim rangi, yoqa (0-3: yo'q, yoqa, galstuk, kapalak). Ranglar - 16 ta palitradan (client/cosmetics.js OM_PAL)
// Yangi format: "y" + 10 ta 36-lik raqam - [ustki rang (32), naqsh (10), naqsh rangi, pasti (7), pastki rang, oyoq kiyim rangi, yoqa (6), yeng (2), kamar (4), oyoq kiyim turi (2)]
export function validCustomOutfit(code: unknown): code is string {
    if (typeof code !== 'string') return false;
    if (/^x[0-9a-f]{7}$/.test(code)) { const d = code.slice(1).split('').map(h => parseInt(h, 16)); return d[1] <= 4 && d[3] <= 3 && d[6] <= 3; }
    if (!/^y[0-9a-z]{10,11}$/.test(code)) return false;
    const d = code.slice(1).split('').map(h => parseInt(h, 36)), max = [32, 10, 32, 7, 32, 32, 6, 2, 4, 2, 32];   // 11-belgi - galstuk / sharf rangi
    return d.every((v, i) => v < max[i]);
}
// Personajning kiyilgan detallari -> "cowboy|hockey|bat|..." (LOOK_SLOTS tartibida, bo'shi - "").
// Kiyim "custom" (konstruktor) - o'yinchining o'z kodi bilan almashtiriladi (boshqalar ham shu kiyimni ko'radi)
// qahramonning kiyilgan buyumlari; KIYIM (body) shu qahramonda bo'lmasa - boshqa qahramonga kiyilgani (avval kiyim har qahramonga alohida kiyilardi)
export function heroEquip(all: { [ct: string]: { [slot: string]: string } } | undefined, ct: string): { [slot: string]: string } {
    const e = { ...((all || {})[ct] || {}) };
    if (!e.body) for (const k of Object.keys(all || {})) { const b = all![k] && all![k].body; if (b) { e.body = b; break; } }
    return e;
}
export function lookString(equipped: { [slot: string]: string } | undefined, characterType: string, custom: string = ''): string {
    const e = SKINS_OFF ? {} as { [slot: string]: string } : (equipped || {});   // skinlar o'chiq - detallarsiz
    return LOOK_SLOTS.map(slot => {
        if (!e[slot] || !findCosmetic(characterType, slot, e[slot])) return '';
        if (slot === 'body' && e[slot] === 'custom') return validCustomOutfit(custom) ? custom : '';
        return e[slot];
    }).join('|');
}
