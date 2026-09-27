// Har bir personaj uchun mavjud skinlar: narxi va rangi
// "default" skin har doim bepul va standart rangga ega

export interface SkinInfo {
    id: string;
    name: string;
    price: number;
    color: number;
}

export const SKIN_CATALOG: { [characterType: string]: SkinInfo[] } = {
    knight: [
        { id: 'default', name: 'Standart', price: 0, color: 0x9e9e9e },
        { id: 'gold', name: 'Oltin ritsar', price: 150, color: 0xffd700 },
        { id: 'shadow', name: 'Soya ritsar', price: 300, color: 0x2b2b2b }
    ],
    samurai: [
        { id: 'default', name: 'Standart', price: 0, color: 0xd32f2f },
        { id: 'snow', name: 'Qorli samuray', price: 150, color: 0xf5f5f5 },
        { id: 'night', name: 'Tungi samuray', price: 300, color: 0x1a1a1a }
    ],
    archer: [
        { id: 'default', name: 'Standart', price: 0, color: 0x7b1fa2 },
        { id: 'forest', name: "O'rmon kamonchisi", price: 150, color: 0x2e7d32 },
        { id: 'ice', name: 'Muz kamonchisi', price: 300, color: 0x4fc3f7 }
    ],
    mage: [
        { id: 'default', name: 'Standart', price: 0, color: 0x1565c0 },
        { id: 'flame', name: "Alanga sehrgari", price: 150, color: 0xe64a19 },
        { id: 'emerald', name: 'Zumrad sehrgari', price: 300, color: 0x00695c }
    ]
};

export function getSkinColor(characterType: string, skinId: string): number {
    const list = SKIN_CATALOG[characterType];
    if (!list) return 0xffffff;
    const skin = list.find(s => s.id === skinId) || list[0];
    return skin.color;
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
        { id: 'default', name: 'Standart pichoq', price: 0, color: 0xcccccc },
        { id: 'crimson', name: "Qip-qizil tig'", price: 120, color: 0xb71c1c },
        { id: 'azure', name: "Ko'k tig'", price: 250, color: 0x1565c0 }
    ],
    samurai: [
        { id: 'default', name: 'Standart katana', price: 0, color: 0xcccccc },
        { id: 'crimson', name: 'Qonrang katana', price: 120, color: 0xb71c1c },
        { id: 'azure', name: "Ko'k katana", price: 250, color: 0x1565c0 }
    ],
    archer: [
        { id: 'default', name: "Standart o'q", price: 0, color: 0x8d6e63 },
        { id: 'crimson', name: "Qizil o'q", price: 120, color: 0xb71c1c },
        { id: 'azure', name: "Ko'k o'q", price: 250, color: 0x1565c0 }
    ],
    mage: [
        { id: 'default', name: 'Standart olov', price: 0, color: 0xff7043 },
        { id: 'crimson', name: 'Qip-qizil olov', price: 120, color: 0xb71c1c },
        { id: 'azure', name: "Ko'k alanga", price: 250, color: 0x1565c0 }
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