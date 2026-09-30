// DARAJA IMKONIYATLARI (har personajning o'z darajasi bo'yicha ochiladi - readme "level up's")
// Daraja = shu personaj bilan yig'ilgan XP dan (db.xpLevel): har o'tilgan xarita +10 XP,
// har keyingi darajaga kerakli XP ikki baravar oshadi
import { PlayerState } from './types';

export type PerkId =
    'shift'     // SHIFT qobiliyati ochiladi
    | 'stam5'   // maksimal stamina +5
    | 'dmg5'    // har zarba/o'q +5 zarar
    | 'ice'     // mage: muz sharlari (Q - olov/muz almashtirish)
    | 'heal'    // mage: R - 2 soniya jamoaviy davolash
    | 'fly'     // knight: R - 2 soniya uchuvchi etik
    | 'shotgun' // knight: Q - qilich/drobovik almashtirish
    | 'djump'   // samurai: havoda ikkinchi sakrash
    | 'kunai'   // samurai: Q - katana/kunai (otiladigan pichoq) almashtirish
    | 'invis2'; // archer: SHIFT qo'yib yuborilgach yana 2 soniya ko'rinmas

export const PERK_TABLE: { [character: string]: { level: number, id: PerkId }[] } = {
    mage: [{ level: 1, id: 'shift' }, { level: 2, id: 'ice' }, { level: 3, id: 'stam5' }, { level: 5, id: 'dmg5' }, { level: 10, id: 'heal' }, { level: 15, id: 'stam5' }],
    knight: [{ level: 1, id: 'shift' }, { level: 2, id: 'stam5' }, { level: 3, id: 'stam5' }, { level: 5, id: 'dmg5' }, { level: 10, id: 'fly' }, { level: 15, id: 'shotgun' }],
    samurai: [{ level: 1, id: 'shift' }, { level: 2, id: 'stam5' }, { level: 3, id: 'stam5' }, { level: 5, id: 'dmg5' }, { level: 10, id: 'djump' }, { level: 15, id: 'kunai' }],
    archer: [{ level: 1, id: 'shift' }, { level: 2, id: 'stam5' }, { level: 3, id: 'stam5' }, { level: 5, id: 'dmg5' }, { level: 10, id: 'invis2' }, { level: 15, id: 'stam5' }]
};

// Q bilan almashadigan ikkinchi qurol (personaj bo'yicha)
export const ALT_WEAPON_PERK: { [character: string]: PerkId } = { mage: 'ice', knight: 'shotgun', samurai: 'kunai' };
// R bilan ishlaydigan maxsus qobiliyat
export const SPECIAL_PERK: { [character: string]: PerkId } = { mage: 'heal', knight: 'fly' };
export const SPECIAL_TICKS = 67;          // ~2s
export const SPECIAL_COOLDOWN_TICKS = 500; // ~15s
export const INVIS_LINGER_TICKS = 67;     // ~2s

function unlocked(characterType: string, level: number): PerkId[] {
    return (PERK_TABLE[characterType] || []).filter(p => level >= p.level).map(p => p.id);
}
export function hasPerk(p: PlayerState, id: PerkId): boolean {
    return unlocked(p.characterType, p.level || 0).includes(id);
}
export function maxStaminaOf(characterType: string, level: number): number {
    return 100 + 5 * unlocked(characterType, level).filter(id => id === 'stam5').length;
}
export function bonusDamageOf(p: PlayerState): number {
    return hasPerk(p, 'dmg5') ? 5 : 0;
}

// QUROL KUCHAYTIRISHLARI (ball bilan, 5 darajagacha) - faqat shu qurol ochilgan (15-daraja) personajga:
//   knight: drobovik zarari (+2 har sochma o'qqa) va magazin (7 ta, har daraja +2)
//   samurai: kunai zarari (+4)
export const WEAPON_UPGRADES: { [character: string]: string[] } = {
    knight: ['shotgunDamage', 'shotgunMag'],
    samurai: ['kunaiDamage']
};
export const WEAPON_UPGRADE_LEVEL = 15;
export const SHOTGUN_BASE_MAG = 7;
export const SHOTGUN_MAG_PER_LEVEL = 2;
export const SHOTGUN_DMG_PER_LEVEL = 2;
export const KUNAI_DMG_PER_LEVEL = 4;
export const SHOTGUN_RELOAD_TICKS = 50; // ~1.5s - magazin bo'shasa qayta o'qlanadi
export function shotgunMagOf(p: PlayerState): number {
    const up = (p.accountUpgrades && p.accountUpgrades.knight) as any || {};
    return SHOTGUN_BASE_MAG + SHOTGUN_MAG_PER_LEVEL * Math.min(5, up.shotgunMag || 0);
}

// JON VA JON TIKLANISHI (kuchaytirish, har personajga alohida, 5 darajagacha):
//   hp    - maksimal jon: 100 + 20 har darajaga (5-darajada 200)
//   regen - jang paytida sekundiga +0.5 HP o'zi tiklanadi (5-darajada 2.5 HP/s)
export const BASE_HP = 100;
export const HP_PER_LEVEL = 20;
export const REGEN_PER_LEVEL = 0.5;
function charUpgrade(p: PlayerState, key: string): number {
    const up = (p.accountUpgrades && p.accountUpgrades[p.characterType]) as any || {};
    return Math.max(0, Math.min(5, up[key] || 0));
}
export function maxHpOf(p: PlayerState): number {
    return BASE_HP + HP_PER_LEVEL * charUpgrade(p, 'hp');
}
export function regenPerSecondOf(p: PlayerState): number {
    return REGEN_PER_LEVEL * charUpgrade(p, 'regen');
}

// KUCHAYTIRISH NARXI (hamma kuchaytirishlar uchun): har keyingi daraja - ball + tanga.
// Indeks - hozirgi daraja (0 -> 1-darajaga o'tish narxi)
export const UPGRADE_COSTS: { points: number, coins: number }[] = [
    { points: 1, coins: 150 },
    { points: 1, coins: 300 },
    { points: 1, coins: 500 },
    { points: 2, coins: 800 },
    { points: 2, coins: 1200 }
];
export const BASE_UPGRADES = ['damage', 'stamina', 'hp', 'regen'];

export function weaponUpgradeLevel(p: PlayerState, key: string): number {
    const up = (p.accountUpgrades && p.accountUpgrades[p.characterType]) as any || {};
    return Math.min(5, up[key] || 0);
}
