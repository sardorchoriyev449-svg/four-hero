// DETALLAR (kosmetika): bosh kiyimi, yuz buyumi va qurol ko'rinishlari. Faqat tashqi ko'rinish -
// o'yin kuchiga ta'sir qilmaydi. Bosh va yuz buyumlari HAMMA personajga umumiy (bir marta sotib
// olinadi, har personajga alohida kiydiriladi); qurol ko'rinishlari - o'sha personajning qurol turiga.
// Rasmlar klientda (client/cosmetics.js) - id lar bir xil bo'lishi shart

export interface CosmeticItem {
    id: string;
    name: string;
    price: number;
}

// Narxlar: har ro'yxatda arzonidan qimmatiga qarab o'sib boradi (do'konda ham shu tartibda)

export const HEAD_ITEMS: CosmeticItem[] = [
    { id: 'bucket', name: 'Bucket', price: 250 },
    { id: 'chef', name: 'Chef Hat', price: 400 },
    { id: 'cowboy', name: 'Cowboy Hat', price: 550 },
    { id: 'kasa', name: 'Japanese Hat', price: 700 },
    { id: 'bunny', name: 'Bunny Ears', price: 900 },
    { id: 'safari', name: 'Robinson Hat', price: 1100 },
    { id: 'cat', name: 'Cat Ears', price: 1400 },
    { id: 'pirate', name: 'Pirate Hat', price: 1700 },
    { id: 'crown', name: 'Royal Crown', price: 2100 },
    { id: 'punk', name: 'Punk Hair', price: 2600 },
    { id: 'viking', name: 'Viking Helmet', price: 3200 },
    { id: 'wizard', name: 'Wizard Hat', price: 3900 }
];

export const FACE_ITEMS: CosmeticItem[] = [
    { id: 'clown', name: 'Clown Nose', price: 250 },
    { id: 'glasses', name: 'Glasses', price: 400 },
    { id: 'mustache', name: 'Mustache', price: 550 },
    { id: 'hockey', name: 'Hockey Mask', price: 700 },
    { id: 'goggles', name: 'Ski Goggles', price: 900 },
    { id: 'eyepatch', name: 'Eye Patch', price: 1100 },
    { id: 'shades', name: 'Sunglasses', price: 1400 },
    { id: 'heart', name: 'Heart Glasses', price: 1700 },
    { id: 'cyber', name: 'Cyber Glasses', price: 2100 },
    { id: 'ninja', name: 'Ninja Mask', price: 2600 }
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
        ],
        kunai: [
            { id: 'toothbrush', name: 'Toothbrush', price: 250 },
            { id: 'dart', name: 'Dart', price: 400 },
            { id: 'pencil', name: 'Pencil', price: 550 },
            { id: 'fork', name: 'Fork', price: 700 },
            { id: 'cards', name: 'Playing Cards', price: 900 },
            { id: 'feather', name: 'Feather', price: 1100 },
            { id: 'icicle', name: 'Icicle', price: 1400 },
            { id: 'golden', name: 'Golden Kunai', price: 1700 }
        ]
    }
};

// Kiyilgan detallarni bitta qisqa satrda yuborish tartibi (o'yin holati har 30ms da ketadi)
export const LOOK_SLOTS = ['head', 'face', 'sword', 'shield', 'shotgun', 'staff', 'bow', 'katana', 'kunai'];

// Shu personaj uchun shu slotda bor buyum (yo'q bo'lsa - null)
export function findCosmetic(characterType: string, slot: string, itemId: string): CosmeticItem | null {
    if (typeof itemId !== 'string') return null;
    let list: CosmeticItem[] | undefined;
    if (slot === 'head') list = HEAD_ITEMS;
    else if (slot === 'face') list = FACE_ITEMS;
    else list = WEAPON_ITEMS[characterType] && WEAPON_ITEMS[characterType][slot];
    return (list && list.find(i => i.id === itemId)) || null;
}

// Egalik kaliti: bosh/yuz - umumiy ("head:cowboy"), qurol - personajga ("knight.sword:bat")
export function cosmeticKey(characterType: string, slot: string, itemId: string): string {
    return (slot === 'head' || slot === 'face') ? slot + ':' + itemId : characterType + '.' + slot + ':' + itemId;
}

// Personajning kiyilgan detallari -> "cowboy|hockey|bat|..." (LOOK_SLOTS tartibida, bo'shi - "")
export function lookString(equipped: { [slot: string]: string } | undefined, characterType: string): string {
    const e = equipped || {};
    return LOOK_SLOTS.map(slot => (e[slot] && findCosmetic(characterType, slot, e[slot])) ? e[slot] : '').join('|');
}
