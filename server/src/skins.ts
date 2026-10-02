// Har bir personaj uchun mavjud skinlar: narxi va rangi
// "default" skin har doim bepul va standart rangga ega

export interface SkinInfo {
    id: string;
    name: string;
    price: number;
    color: number;
    accent?: number;   // ikkinchi rang (visor va belbog'): rang kombinatsiyasi. Yo'q bo'lsa - standart to'q sariq visor
}

export const SKIN_CATALOG: { [characterType: string]: SkinInfo[] } = {
    // Har personajga 9 tadan; har biri o'z rang kombinatsiyasi (tana + visor/belbog')
    knight: [
        { id: 'default', name: 'Standard', price: 0, color: 0x9e9e9e },
        { id: 'gold', name: 'Golden Knight', price: 150, color: 0xffd700 },
        { id: 'royal', name: 'Royal Knight', price: 200, color: 0x1e3a8a, accent: 0xffd54f },
        { id: 'crimson', name: 'Crimson Knight', price: 250, color: 0x8b1e1e, accent: 0xe0e0e0 },
        { id: 'shadow', name: 'Shadow Knight', price: 300, color: 0x2b2b2b },
        { id: 'emerald', name: 'Emerald Knight', price: 350, color: 0x1b5e20, accent: 0xffd54f },
        { id: 'frost', name: 'Frost Knight', price: 400, color: 0xb3e5fc, accent: 0x0d47a1 },
        { id: 'obsidian', name: 'Obsidian Knight', price: 500, color: 0x212121, accent: 0xff1744 },
        { id: 'paladin', name: 'Paladin', price: 650, color: 0xf5f5f5, accent: 0x1565c0 }
    ],
    samurai: [
        { id: 'default', name: 'Standard', price: 0, color: 0xd32f2f },
        { id: 'snow', name: 'Snow Samurai', price: 150, color: 0xf5f5f5 },
        { id: 'sakura', name: 'Sakura Samurai', price: 200, color: 0xf8bbd0, accent: 0x880e4f },
        { id: 'jade', name: 'Jade Samurai', price: 250, color: 0x00695c, accent: 0xffd54f },
        { id: 'night', name: 'Night Samurai', price: 300, color: 0x1a1a1a },
        { id: 'ronin', name: 'Ronin', price: 350, color: 0x4e342e, accent: 0xff7043 },
        { id: 'storm', name: 'Storm Samurai', price: 400, color: 0x37474f, accent: 0x00e5ff },
        { id: 'oni', name: 'Oni Samurai', price: 500, color: 0x1a1a1a, accent: 0xff1744 },
        { id: 'shogun', name: 'Shogun', price: 650, color: 0xffd700, accent: 0xb71c1c }
    ],
    archer: [
        { id: 'default', name: 'Standard', price: 0, color: 0x7b1fa2 },
        { id: 'forest', name: 'Forest Archer', price: 150, color: 0x2e7d32 },
        { id: 'hunter', name: 'Hunter', price: 200, color: 0x5d4037, accent: 0x8bc34a },
        { id: 'sunset', name: 'Sunset Archer', price: 250, color: 0xff7043, accent: 0x6a1b9a },
        { id: 'ice', name: 'Ice Archer', price: 300, color: 0x4fc3f7 },
        { id: 'ranger', name: 'Ranger', price: 350, color: 0x33691e, accent: 0xffeb3b },
        { id: 'phantom', name: 'Phantom Archer', price: 400, color: 0x263238, accent: 0xb388ff },
        { id: 'ruby', name: 'Ruby Archer', price: 500, color: 0xb71c1c, accent: 0xffd54f },
        { id: 'celestial', name: 'Celestial Archer', price: 650, color: 0xe8eaf6, accent: 0x7c4dff }
    ],
    mage: [
        { id: 'default', name: 'Standard', price: 0, color: 0x1565c0 },
        { id: 'flame', name: 'Flame Mage', price: 150, color: 0xe64a19 },
        { id: 'arcane', name: 'Arcane Mage', price: 200, color: 0x4a148c, accent: 0x18ffff },
        { id: 'solar', name: 'Solar Mage', price: 250, color: 0xffb300, accent: 0xd50000 },
        { id: 'emerald', name: 'Emerald Mage', price: 300, color: 0x00695c },
        { id: 'abyss', name: 'Abyss Mage', price: 350, color: 0x0d1b2a, accent: 0x00e676 },
        { id: 'crystal', name: 'Crystal Mage', price: 400, color: 0xb2ebf2, accent: 0xec407a },
        { id: 'void', name: 'Void Mage', price: 500, color: 0x111111, accent: 0xd500f9 },
        { id: 'archmage', name: 'Archmage', price: 650, color: 0xfafafa, accent: 0xffd54f }
    ]
};

// Tana rangi va ikkinchi rang bitta sonda: color + accent * 2^24 (klientdagi bodyGrid ajratib oladi)
export function packSkinColor(skin: SkinInfo): number {
    return skin.color + (skin.accent || 0) * 0x1000000;
}
// Katalogda bor-yo'qligi (noma'lum personaj/skin - "bepul sotib olish"ga yo'l qo'ymaslik uchun)
export function isKnownSkin(characterType: unknown, skinId: unknown, weapon = false): boolean {
    const cat = weapon ? WEAPON_SKIN_CATALOG : SKIN_CATALOG;
    if (typeof characterType !== 'string' || typeof skinId !== 'string') return false;
    if (!Object.prototype.hasOwnProperty.call(cat, characterType)) return false;
    return cat[characterType].some(s => s.id === skinId);
}

export function getSkinColor(characterType: string, skinId: string): number {
    const list = SKIN_CATALOG[characterType];
    if (!list) return 0xffffff;
    const skin = list.find(s => s.id === skinId) || list[0];
    return packSkinColor(skin);
}

export function getSkinPrice(characterType: string, skinId: string): number {
    const list = SKIN_CATALOG[characterType];
    if (!list) return 0;
    const skin = list.find(s => s.id === skinId);
    return skin ? skin.price : 0;
}

// QUROL SKINLARI - tana skinidan ALOHIDA, faqat qurol/o'q rangini o'zgartiradi
export const WEAPON_SKIN_CATALOG: { [characterType: string]: SkinInfo[] } = {
    knight: [
        { id: 'default', name: 'Standard Blade', price: 0, color: 0xcccccc },
        { id: 'crimson', name: 'Crimson Blade', price: 120, color: 0xb71c1c },
        { id: 'azure', name: 'Azure Blade', price: 250, color: 0x1565c0 }
    ],
    samurai: [
        { id: 'default', name: 'Standard Katana', price: 0, color: 0xcccccc },
        { id: 'crimson', name: 'Crimson Katana', price: 120, color: 0xb71c1c },
        { id: 'azure', name: 'Azure Katana', price: 250, color: 0x1565c0 }
    ],
    archer: [
        { id: 'default', name: 'Standard Arrow', price: 0, color: 0x8d6e63 },
        { id: 'crimson', name: 'Crimson Arrow', price: 120, color: 0xb71c1c },
        { id: 'azure', name: 'Azure Arrow', price: 250, color: 0x1565c0 }
    ],
    mage: [
        { id: 'default', name: 'Standard Fire', price: 0, color: 0xff7043 },
        { id: 'crimson', name: 'Crimson Fire', price: 120, color: 0xb71c1c },
        { id: 'azure', name: 'Azure Flame', price: 250, color: 0x1565c0 }
    ]
};

export function getWeaponSkinColor(characterType: string, skinId: string): number {
    const list = WEAPON_SKIN_CATALOG[characterType];
    if (!list) return 0xffffff;
    const skin = list.find(s => s.id === skinId) || list[0];
    return skin.color;
}

export function getWeaponSkinPrice(characterType: string, skinId: string): number {
    const list = WEAPON_SKIN_CATALOG[characterType];
    if (!list) return 0;
    const skin = list.find(s => s.id === skinId);
    return skin ? skin.price : 0;
}