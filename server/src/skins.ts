// Har bir personaj uchun mavjud skinlar: narxi va rangi
// "default" skin har doim bepul va standart rangga ega

export interface SkinInfo {
    id: string;
    name: string;
    price: number;
    color: number;
    accent?: number;   // ikkinchi rang (visor va belbog'): rang kombinatsiyasi. Yo'q bo'lsa - standart to'q sariq visor
    fx?: 'aura' | 'sparkle' | 'flame' | 'rainbow' | 'ghost' | 'crown' | 'frost';   // AFSONAVIY skin effekti (o'yinda qahramon atrofida)
    rarity?: 'legendary' | 'exclusive';
    wfx?: 'fire' | 'ice' | 'spark' | 'shadow' | 'star';   // QUROL skini effekti: o'q/zarba ortidagi iz
    exclusive?: boolean;   // sotib olib bo'lmaydi - faqat kunlik kirish mukofotining 7-kuni (yoki admin sovg'asi)
}
// Kunlik kirishning 7-kuni beriladigan eksklyuziv skin (har qahramonda bitta)
export const DAILY_SKIN_ID = 'daybreak';

export const SKIN_CATALOG: { [characterType: string]: SkinInfo[] } = {
    // Har personajga 9 tadan; har biri o'z rang kombinatsiyasi (tana + visor/belbog')
    knight: [
        { id: 'default', name: 'Standard', price: 0, color: 0x9e9e9e },
        { id: 'gold', name: 'Golden Knight', price: 250, color: 0xffd700 },
        { id: 'royal', name: 'Royal Knight', price: 400, color: 0x1e3a8a, accent: 0xffd54f },
        { id: 'crimson', name: 'Crimson Knight', price: 600, color: 0x8b1e1e, accent: 0xe0e0e0 },
        { id: 'shadow', name: 'Shadow Knight', price: 800, color: 0x2b2b2b },
        { id: 'emerald', name: 'Emerald Knight', price: 1000, color: 0x1b5e20, accent: 0xffd54f },
        { id: 'frost', name: 'Frost Knight', price: 1300, color: 0xb3e5fc, accent: 0x0d47a1 },
        { id: 'obsidian', name: 'Obsidian Knight', price: 1600, color: 0x212121, accent: 0xff1744 },
        { id: 'paladin', name: 'Paladin', price: 2000, color: 0xf5f5f5, accent: 0x1565c0 },
        { id: 'bronze', name: 'Bronze Knight', price: 2500, color: 0xcd7f32, accent: 0x3e2723 },
        { id: 'nightwatch', name: 'Night Watch', price: 3000, color: 0x263238, accent: 0x00e5ff },
        { id: 'templar', name: 'Templar', price: 3600, color: 0xeceff1, accent: 0xd32f2f },
        { id: 'inferno', name: 'Inferno Knight', price: 6000, color: 0x3e0000, accent: 0xff6d00, fx: 'flame', rarity: 'legendary' },
        { id: 'starlight', name: 'Starlight Knight', price: 8000, color: 0x1a237e, accent: 0xffeb3b, fx: 'sparkle', rarity: 'legendary' },
        { id: 'glacier', name: 'Glacier Knight', price: 10000, color: 0xe1f5fe, accent: 0x00b8d4, fx: 'frost', rarity: 'legendary' },
        { id: 'daybreak', name: 'Daybreak Knight', price: 0, color: 0xfff8e1, accent: 0xffab00, fx: 'crown', rarity: 'exclusive', exclusive: true }
    ],
    samurai: [
        { id: 'default', name: 'Standard', price: 0, color: 0xd32f2f },
        { id: 'snow', name: 'Snow Samurai', price: 250, color: 0xf5f5f5 },
        { id: 'sakura', name: 'Sakura Samurai', price: 400, color: 0xf8bbd0, accent: 0x880e4f },
        { id: 'jade', name: 'Jade Samurai', price: 600, color: 0x00695c, accent: 0xffd54f },
        { id: 'night', name: 'Night Samurai', price: 800, color: 0x1a1a1a },
        { id: 'ronin', name: 'Ronin', price: 1000, color: 0x4e342e, accent: 0xff7043 },
        { id: 'storm', name: 'Storm Samurai', price: 1300, color: 0x37474f, accent: 0x00e5ff },
        { id: 'oni', name: 'Oni Samurai', price: 1600, color: 0x1a1a1a, accent: 0xff1744 },
        { id: 'shogun', name: 'Shogun', price: 2000, color: 0xffd700, accent: 0xb71c1c },
        { id: 'bamboo', name: 'Bamboo Samurai', price: 2500, color: 0x689f38, accent: 0x33691e },
        { id: 'crimsonmoon', name: 'Crimson Moon', price: 3000, color: 0x4a0000, accent: 0xffd54f },
        { id: 'tide', name: 'Tide Samurai', price: 3600, color: 0x0277bd, accent: 0xe1f5fe },
        { id: 'phoenix', name: 'Phoenix Samurai', price: 6000, color: 0xbf360c, accent: 0xffd600, fx: 'flame', rarity: 'legendary' },
        { id: 'spirit', name: 'Spirit Samurai', price: 8000, color: 0xb2dfdb, accent: 0x00bfa5, fx: 'ghost', rarity: 'legendary' },
        { id: 'prism', name: 'Prism Samurai', price: 10000, color: 0xffffff, accent: 0xffffff, fx: 'rainbow', rarity: 'legendary' },
        { id: 'daybreak', name: 'Daybreak Samurai', price: 0, color: 0xfff8e1, accent: 0xffab00, fx: 'crown', rarity: 'exclusive', exclusive: true }
    ],
    archer: [
        { id: 'default', name: 'Standard', price: 0, color: 0x7b1fa2 },
        { id: 'forest', name: 'Forest Archer', price: 250, color: 0x2e7d32 },
        { id: 'hunter', name: 'Hunter', price: 400, color: 0x5d4037, accent: 0x8bc34a },
        { id: 'sunset', name: 'Sunset Archer', price: 600, color: 0xff7043, accent: 0x6a1b9a },
        { id: 'ice', name: 'Ice Archer', price: 800, color: 0x4fc3f7 },
        { id: 'ranger', name: 'Ranger', price: 1000, color: 0x33691e, accent: 0xffeb3b },
        { id: 'phantom', name: 'Phantom Archer', price: 1300, color: 0x263238, accent: 0xb388ff },
        { id: 'ruby', name: 'Ruby Archer', price: 1600, color: 0xb71c1c, accent: 0xffd54f },
        { id: 'celestial', name: 'Celestial Archer', price: 2000, color: 0xe8eaf6, accent: 0x7c4dff },
        { id: 'autumn', name: 'Autumn Archer', price: 2500, color: 0xe65100, accent: 0x4e342e },
        { id: 'midnight', name: 'Midnight Archer', price: 3000, color: 0x0d1b2a, accent: 0xffd54f },
        { id: 'coral', name: 'Coral Archer', price: 3600, color: 0xff8a80, accent: 0x006064 },
        { id: 'thunder', name: 'Thunder Archer', price: 6000, color: 0x283593, accent: 0x40c4ff, fx: 'aura', rarity: 'legendary' },
        { id: 'fairy', name: 'Fairy Archer', price: 8000, color: 0xf8bbd0, accent: 0xe040fb, fx: 'sparkle', rarity: 'legendary' },
        { id: 'prism', name: 'Prism Archer', price: 10000, color: 0xffffff, accent: 0xffffff, fx: 'rainbow', rarity: 'legendary' },
        { id: 'daybreak', name: 'Daybreak Archer', price: 0, color: 0xfff8e1, accent: 0xffab00, fx: 'crown', rarity: 'exclusive', exclusive: true }
    ],
    mage: [
        { id: 'default', name: 'Standard', price: 0, color: 0x1565c0 },
        { id: 'flame', name: 'Flame Mage', price: 250, color: 0xe64a19 },
        { id: 'arcane', name: 'Arcane Mage', price: 400, color: 0x4a148c, accent: 0x18ffff },
        { id: 'solar', name: 'Solar Mage', price: 600, color: 0xffb300, accent: 0xd50000 },
        { id: 'emerald', name: 'Emerald Mage', price: 800, color: 0x00695c },
        { id: 'abyss', name: 'Abyss Mage', price: 1000, color: 0x0d1b2a, accent: 0x00e676 },
        { id: 'crystal', name: 'Crystal Mage', price: 1300, color: 0xb2ebf2, accent: 0xec407a },
        { id: 'void', name: 'Void Mage', price: 1600, color: 0x111111, accent: 0xd500f9 },
        { id: 'archmage', name: 'Archmage', price: 2000, color: 0xfafafa, accent: 0xffd54f },
        { id: 'stormcaller', name: 'Storm Mage', price: 2500, color: 0x455a64, accent: 0xffeb3b },
        { id: 'ember', name: 'Ember Mage', price: 3000, color: 0x3e2723, accent: 0xff3d00 },
        { id: 'lunar', name: 'Lunar Mage', price: 3600, color: 0xcfd8dc, accent: 0x3949ab },
        { id: 'galaxy', name: 'Galaxy Mage', price: 6000, color: 0x1a0033, accent: 0xea80fc, fx: 'sparkle', rarity: 'legendary' },
        { id: 'wraith', name: 'Wraith Mage', price: 8000, color: 0x212121, accent: 0x76ff03, fx: 'ghost', rarity: 'legendary' },
        { id: 'prism', name: 'Prism Mage', price: 10000, color: 0xffffff, accent: 0xffffff, fx: 'rainbow', rarity: 'legendary' },
        { id: 'daybreak', name: 'Daybreak Mage', price: 0, color: 0xfff8e1, accent: 0xffab00, fx: 'crown', rarity: 'exclusive', exclusive: true }
    ]
};
// Afsonaviy / eksklyuziv skin effekti ('' - yo'q)
export function getSkinFx(characterType: string, skinId: string): string {
    const skin = (SKIN_CATALOG[characterType] || []).find(s => s.id === skinId);
    return (skin && skin.fx) || '';
}
export function isExclusiveSkin(characterType: string, skinId: string): boolean {
    const skin = (SKIN_CATALOG[characterType] || []).find(s => s.id === skinId);
    return !!(skin && skin.exclusive);
}

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
        { id: 'crimson', name: 'Crimson Blade', price: 300, color: 0xb71c1c },
        { id: 'azure', name: 'Azure Blade', price: 600, color: 0x1565c0 },
        { id: 'inferno', name: 'Inferno Blade', price: 1200, color: 0xff6d00, wfx: 'fire', rarity: 'legendary' },
        { id: 'frostbite', name: 'Frostbite Blade', price: 1800, color: 0x80d8ff, wfx: 'ice', rarity: 'legendary' },
        { id: 'voltage', name: 'Voltage Blade', price: 2500, color: 0xffea00, wfx: 'spark', rarity: 'legendary' },
        { id: 'shadow', name: 'Shadow Blade', price: 3500, color: 0x9c27b0, wfx: 'shadow', rarity: 'legendary' },
        { id: 'celestial', name: 'Celestial Blade', price: 5000, color: 0xfff59d, wfx: 'star', rarity: 'legendary' }
    ],
    samurai: [
        { id: 'default', name: 'Standard Katana', price: 0, color: 0xcccccc },
        { id: 'crimson', name: 'Crimson Katana', price: 300, color: 0xb71c1c },
        { id: 'azure', name: 'Azure Katana', price: 600, color: 0x1565c0 },
        { id: 'inferno', name: 'Inferno Katana', price: 1200, color: 0xff6d00, wfx: 'fire', rarity: 'legendary' },
        { id: 'frostbite', name: 'Frostbite Katana', price: 1800, color: 0x80d8ff, wfx: 'ice', rarity: 'legendary' },
        { id: 'voltage', name: 'Voltage Katana', price: 2500, color: 0xffea00, wfx: 'spark', rarity: 'legendary' },
        { id: 'shadow', name: 'Shadow Katana', price: 3500, color: 0x9c27b0, wfx: 'shadow', rarity: 'legendary' },
        { id: 'celestial', name: 'Celestial Katana', price: 5000, color: 0xfff59d, wfx: 'star', rarity: 'legendary' }
    ],
    archer: [
        { id: 'default', name: 'Standard Arrow', price: 0, color: 0x8d6e63 },
        { id: 'crimson', name: 'Crimson Arrow', price: 300, color: 0xb71c1c },
        { id: 'azure', name: 'Azure Arrow', price: 600, color: 0x1565c0 },
        { id: 'inferno', name: 'Inferno Arrow', price: 1200, color: 0xff6d00, wfx: 'fire', rarity: 'legendary' },
        { id: 'frostbite', name: 'Frostbite Arrow', price: 1800, color: 0x80d8ff, wfx: 'ice', rarity: 'legendary' },
        { id: 'voltage', name: 'Voltage Arrow', price: 2500, color: 0xffea00, wfx: 'spark', rarity: 'legendary' },
        { id: 'shadow', name: 'Shadow Arrow', price: 3500, color: 0x9c27b0, wfx: 'shadow', rarity: 'legendary' },
        { id: 'celestial', name: 'Celestial Arrow', price: 5000, color: 0xfff59d, wfx: 'star', rarity: 'legendary' }
    ],
    mage: [
        { id: 'default', name: 'Standard Fire', price: 0, color: 0xff7043 },
        { id: 'crimson', name: 'Crimson Fire', price: 300, color: 0xb71c1c },
        { id: 'azure', name: 'Azure Flame', price: 600, color: 0x1565c0 },
        { id: 'inferno', name: 'Inferno Flame', price: 1200, color: 0xff6d00, wfx: 'fire', rarity: 'legendary' },
        { id: 'frostbite', name: 'Frostbite Flame', price: 1800, color: 0x80d8ff, wfx: 'ice', rarity: 'legendary' },
        { id: 'voltage', name: 'Voltage Flame', price: 2500, color: 0xffea00, wfx: 'spark', rarity: 'legendary' },
        { id: 'shadow', name: 'Shadow Flame', price: 3500, color: 0x9c27b0, wfx: 'shadow', rarity: 'legendary' },
        { id: 'celestial', name: 'Celestial Flame', price: 5000, color: 0xfff59d, wfx: 'star', rarity: 'legendary' }
    ]
};

export function getWeaponSkinColor(characterType: string, skinId: string): number {
    const list = WEAPON_SKIN_CATALOG[characterType];
    if (!list) return 0xffffff;
    const skin = list.find(s => s.id === skinId) || list[0];
    return skin.color;
}

// Qurol skini effekti ('' - yo'q)
export function getWeaponSkinFx(characterType: string, skinId: string): string {
    const skin = (WEAPON_SKIN_CATALOG[characterType] || []).find(s => s.id === skinId);
    return (skin && skin.wfx) || '';
}
export function getWeaponSkinPrice(characterType: string, skinId: string): number {
    const list = WEAPON_SKIN_CATALOG[characterType];
    if (!list) return 0;
    const skin = list.find(s => s.id === skinId);
    return skin ? skin.price : 0;
}