// DETALLAR (kosmetika): bosh kiyimi, yuz buyumi va qurol ko'rinishlari. Faqat tashqi ko'rinish -
// o'yin kuchiga ta'sir qilmaydi. Bosh va yuz buyumlari HAMMA personajga umumiy (bir marta sotib
// olinadi, har personajga alohida kiydiriladi); qurol ko'rinishlari - o'sha personajning qurol turiga.
// Rasmlar klientda (client/cosmetics.js) - id lar bir xil bo'lishi shart

export interface CosmeticItem {
    id: string;
    name: string;
    price: number;
}

// Narx pog'onalari: oddiy / o'rtacha / noyob
const C = 200, U = 300, R = 650;

export const HEAD_ITEMS: CosmeticItem[] = [
    { id: 'cowboy', name: 'Cowboy Hat', price: U },
    { id: 'bucket', name: 'Bucket', price: C },
    { id: 'kasa', name: 'Japanese Hat', price: U },
    { id: 'bunny', name: 'Bunny Ears', price: U },
    { id: 'safari', name: 'Robinson Hat', price: U },
    { id: 'cat', name: 'Cat Ears', price: U },
    { id: 'crown', name: 'Royal Crown', price: R },
    { id: 'punk', name: 'Punk Hair', price: R }
];

export const FACE_ITEMS: CosmeticItem[] = [
    { id: 'hockey', name: 'Hockey Mask', price: U },
    { id: 'goggles', name: 'Ski Goggles', price: U },
    { id: 'clown', name: 'Clown Nose', price: C },
    { id: 'glasses', name: 'Glasses', price: C },
    { id: 'cyber', name: 'Cyber Glasses', price: R }
];

// Har personajning qurol turlari (slot) va ularning ko'rinishlari
export const WEAPON_ITEMS: { [characterType: string]: { [slot: string]: CosmeticItem[] } } = {
    knight: {
        sword: [
            { id: 'bat', name: 'Baseball Bat', price: C },
            { id: 'greatsword', name: 'Black Greatsword', price: U },
            { id: 'holo', name: 'Hologram Sword', price: R },
            { id: 'guitar', name: 'Guitar', price: U },
            { id: 'pink', name: 'Pink Sword', price: C }
        ],
        shield: [
            { id: 'door', name: 'House Door', price: U },
            { id: 'cardoor', name: 'Car Door', price: U },
            { id: 'triangle', name: 'Triangle Shield', price: C },
            { id: 'pink', name: 'Pink Shield', price: C }
        ],
        shotgun: [
            { id: 'toy', name: 'Toy Shotgun', price: C },
            { id: 'branch', name: 'Branch Shotgun', price: U },
            { id: 'dark', name: 'Dark Shotgun', price: R },
            { id: 'pink', name: 'Pink Shotgun', price: C }
        ]
    },
    mage: {
        staff: [
            { id: 'stop', name: 'Stop Sign Staff', price: U },
            { id: 'torch', name: 'Torch', price: U },
            { id: 'pink', name: 'Pink Staff', price: C },
            { id: 'candy', name: 'Cotton Candy', price: R }
        ]
    },
    archer: {
        bow: [
            { id: 'pistol', name: 'Pistol', price: U },
            { id: 'cyber', name: 'Cyber Crossbow', price: R },
            { id: 'elf', name: 'Elven Bow', price: U },
            { id: 'pinkpistol', name: 'Pink Pistol', price: C }
        ]
    },
    samurai: {
        katana: [
            { id: 'holo', name: 'Hologram Katana', price: R },
            { id: 'red', name: 'Red Katana', price: U },
            { id: 'shinai', name: 'Shinai', price: C },
            { id: 'pink', name: 'Pink Katana', price: C },
            { id: 'dark', name: 'Dark Katana', price: R }
        ],
        kunai: [
            { id: 'cards', name: 'Playing Cards', price: U },
            { id: 'toothbrush', name: 'Toothbrush', price: C },
            { id: 'dart', name: 'Dart', price: C }
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
