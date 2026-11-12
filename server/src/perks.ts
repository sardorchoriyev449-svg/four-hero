// DARAJA IMKONIYATLARI (har personajning o'z darajasi bo'yicha ochiladi - readme "level up's")
// Daraja = shu personaj bilan yig'ilgan XP dan (db.xpLevel): har o'tilgan xarita +10 XP,
// har keyingi darajaga kerakli XP ikki baravar oshadi
import { PlayerState } from './types';

export type PerkId =
    'shift'     // SHIFT qobiliyati ochiladi
    | 'mine2'   // hunter: SHIFT - birdaniga 2 ta mina (ikki eng yaqin dushmanga)
    | 'stam5'   // maksimal stamina +5
    | 'dmg5'    // har zarba/o'q +5 zarar
    | 'ice'     // mage: muz sharlari (Q - olov/muz almashtirish)
    | 'heal'    // mage: R - 2 soniya jamoaviy davolash
    | 'fly'     // knight: R - 2 soniya uchuvchi etik
    | 'shotgun' // knight: Q - qilich/drobovik almashtirish
    | 'djump'   // samurai: havoda ikkinchi sakrash
    | 'kunai'   // samurai: Q - katana/kunai (otiladigan pichoq) almashtirish
    | 'invis2'  // archer: ko'rinmaslik 2 s o'rniga 4 s
    | 'firearrow' // archer: olovli o'qlar
    | 'lightning'   // mage 16: Q - zanjirli chaqmoq (3-qurol)
    | 'shieldthrow' // knight 16: Q - qalqon otish (3-qurol, 10 s qayta tiklanadi)
    | 'bigspirit'   // samurai 16: katana ruhi kattalashadi
    | 'triple'      // archer 16: Q - uchtalik o'q
    | 'blowpipe'    // hunter 3: Q - pichoq / puflama naycha (drotik)
    | 'poison'      // hunter 10: drotik zaharli (1 s dan keyin jon keta boshlaydi)
    | 'trap'        // hunter 16: R - yerga qopqon (tushgan raqib qimirlay olmaydi, qalqon yordam bermaydi)
    | 'shotgun2'    // knight 15: drobovik uzoqroq otadi, sochma o'qlar tekkanda sachrab chiqadi
    | 'longsword'   // knight 17: qilich kattaroq masofaga uradi
    | 'dash'        // archer 10: A/D ikki marta - sharpadek tez desh (2 s da bir)
    | 'arrowstorm'  // archer 17: R - havoda muallaq turib 2 s davomida atrofga (360) o'q yog'diradi
    | 'bigtornado'  // mage 17: tornado kattalashadi
    | 'cut';        // samurai 17: R - oldinga kesib o'tadi, yo'lidagi hamma raqibga zarba

export const PERK_TABLE: { [character: string]: { level: number, id: PerkId }[] } = {
    // SEHRGAR: 1 - tornado (raqiblarni quvadi), 3 - muz shari (1 s muzlatadi), 10 - R jamoaviy davolash, 15 - zanjirli chaqmoq, 17 - katta tornado
    mage: [{ level: 1, id: 'shift' }, { level: 2, id: 'stam5' }, { level: 3, id: 'ice' }, { level: 5, id: 'dmg5' }, { level: 10, id: 'heal' }, { level: 15, id: 'stam5' }, { level: 15, id: 'dmg5' }, { level: 15, id: 'lightning' }, { level: 17, id: 'bigtornado' }],
    // RITSAR: 1 - qalqon, 3 - drobovik (staminasiz), 10 - uchar etik (W/Space ikki marta), 15 - drobovik uzoqqa + sachrash, 17 - uzun qilich
    knight: [{ level: 1, id: 'shift' }, { level: 2, id: 'stam5' }, { level: 3, id: 'shotgun' }, { level: 5, id: 'dmg5' }, { level: 10, id: 'fly' }, { level: 15, id: 'stam5' }, { level: 15, id: 'dmg5' }, { level: 15, id: 'shotgun2' }, { level: 17, id: 'longsword' }],
    // SAMURAY: 1 - Shift ikki yonga sharpa zarba, 3 - katana ruhi, 10 - ikkitalik sakrash, 15 - katta ruh, 17 - R kesib o'tish
    samurai: [{ level: 1, id: 'shift' }, { level: 2, id: 'stam5' }, { level: 3, id: 'kunai' }, { level: 5, id: 'dmg5' }, { level: 10, id: 'djump' }, { level: 15, id: 'stam5' }, { level: 15, id: 'dmg5' }, { level: 15, id: 'bigspirit' }, { level: 17, id: 'cut' }],
    // KAMONCHI: 1 - ko'rinmaslik (2 s, 14 s kutish), 3 - olovli o'qlar, 10 - desh, 15 - uchtalik o'q, 17 - R o'q bo'roni
    archer: [{ level: 1, id: 'shift' }, { level: 2, id: 'stam5' }, { level: 3, id: 'firearrow' }, { level: 4, id: 'stam5' }, { level: 4, id: 'dmg5' }, { level: 5, id: 'dmg5' }, { level: 10, id: 'dash' }, { level: 15, id: 'stam5' }, { level: 15, id: 'dmg5' }, { level: 15, id: 'triple' }, { level: 17, id: 'arrowstorm' }],
    // OVCHI (pullik): 0 - uzun pichoq, 1 - SHIFT yopishqoq mina, 3 - puflama naycha, 10 - zaharli drotik, 16 - qopqon
    hunter: [{ level: 1, id: 'shift' }, { level: 2, id: 'stam5' }, { level: 3, id: 'blowpipe' }, { level: 4, id: 'mine2' }, { level: 5, id: 'dmg5' }, { level: 10, id: 'poison' }, { level: 15, id: 'stam5' }, { level: 15, id: 'dmg5' }, { level: 16, id: 'trap' }]
};

// 20, 30, ... 100-darajalarda bittadan, navbat bilan: 20, 40, 60, 80, 100 - +5 stamina; 30, 50, 70, 90 - +5 zarar
Object.keys(PERK_TABLE).forEach((c) => {
    for (let L = 20; L <= 100; L += 10) PERK_TABLE[c].push({ level: L, id: (L / 10) % 2 === 0 ? 'stam5' : 'dmg5' });
});

// Q bilan almashadigan ikkinchi qurol (personaj bo'yicha)
export const ALT_WEAPON_PERK: { [character: string]: PerkId } = { mage: 'ice', knight: 'shotgun', samurai: 'kunai', archer: 'triple', hunter: 'blowpipe' };
// Q bilan uchinchi qurol (16-daraja): mage - chaqmoq, knight - qalqon otish
export const THIRD_WEAPON_PERK: { [character: string]: PerkId } = { mage: 'lightning' };
// SAMURAY 16-daraja: katana ruhi tegish qutisi (oddiysi 40x78) va markazi (oddiysi - player.y - 2): pastki cheti o'sha joyda qoladi, tepaga o'sadi
export const BIG_SPIRIT = { hitW: 64, hitH: 124, dy: -25 };
export const SHIELD_THROW_COOLDOWN_TICKS = 333;   // ~10 s
// Q tartibi: shu o'yinchida hozir mavjud qurol rejimlari (knight qalqoni qayta tiklanayotganda - yo'q)
export function weaponModesOf(p: PlayerState): ('main' | 'alt' | 'alt2')[] {
    const modes: ('main' | 'alt' | 'alt2')[] = ['main'];
    const a = ALT_WEAPON_PERK[p.characterType], b = THIRD_WEAPON_PERK[p.characterType];
    if (a && hasPerk(p, a)) modes.push('alt');
    if (b && hasPerk(p, b) && !(p.characterType === 'knight' && (p.shieldCd || 0) > 0)) modes.push('alt2');
    return modes;
}
// R bilan ishlaydigan maxsus qobiliyat
// (knight 'fly' - R emas, W/Space ikki marta bosilganda klient yuboradi)
export const SPECIAL_PERK: { [character: string]: PerkId } = { mage: 'heal', knight: 'fly', hunter: 'trap', archer: 'arrowstorm', samurai: 'cut' };
// YANGI IMKONIYATLAR: o'lchamlar
export const SKILLS = {
    shotgun2Life: 18,          // drobovik 15-daraja: ~380 px (oddiysi 10 - ~210 px)
    splashDmgK: 0.6,           // sachragan o'q zarari (asosiysidan)
    longswordLife: 13, longswordW: 84, longswordH: 52,   // ritsar 17-daraja: qilich zarbasi qutisi (oddiysi 54x44, 9 tik)
    ghostCdTicks: 50, ghostStamina: 20,                  // samuray Shift: ikki yonga sharpa zarba (1.5 s da bir)
    cutRange: 300, cutDamage: 45, cutCdTicks: 200,       // samuray 17: kesib o'tish (6 s da bir)
    stormEvery: 2, stormArrows: 3, stormSpin: 0.45,      // kamonchi 17: har 2 tikda 3 ta o'q, aylanib
    fireArrowDamage: 20, fireArrowStamina: 16,           // olovli o'q: zarari ko'proq, stamina tezroq ketadi
    tornadoBig: 1.6, tornadoChase: 700,                  // sehrgar: 17-darajada 1.6 baravar katta; 700 px ichidagi raqibni quvadi
    freezeTicks: 33                                      // muz shari: ~1 s muzlatadi
};
// OVCHI: pichoq, drotik, zahar, yopishqoq mina (SHIFT), qopqon (R)
export const HUNTER = {
    knifeSpeed: 420, knifeLife: 6, knifeDamage: 28, knifeCdTicks: 17,          // pichoq ~120 px ga yetadi, ~0.5 s da bir
    dartSpeed: 950, dartLife: 30, dartDamage: 12, dartCdTicks: 15,             // drotik ~850 px
    poisonDelayTicks: 33, poisonTicks: 133, poisonDps: 7,                      // 1 s dan keyin 4 s davomida ~7 HP/s
    mineCdTicks: 200, mineStamina: 18, mineSpeed: 560, mineFuseTicks: 40, mineGroundFuseTicks: 70, mineRadius: 95, mineDamage: 60,
    trapDamage: 40, trapHoldTicks: 100, trapLifeTicks: 667, trapArmTicks: 15, trapMax: 2
};
// RITSAR UCHISHI ENERGIYASI (staminadan alohida): uchish - sarflaydi (to'la - ~3.3 s), uchmaganda sekin tiklanadi (1 s dan keyin, ~12 s da to'ladi)
export const KNIGHT_FLY = { max: 100, startMin: 15, drainPerSec: 30, regenPerSec: 8, regenDelayTicks: 33, minTicks: 8 };
export const SPECIAL_TICKS = 67;          // ~2s
// SEHRGAR SHIFT - TORNADO: qaragan tomonga 3 s yuradi, yo'lidagi dushmanlarga zarar; 20 s qayta tiklanadi
export const TORNADO = { cdTicks: 667, lifeTicks: 100, speed: 200, halfW: 60, height: 180, pulseTicks: 13, damage: 22, stamina: 20, pull: 2.5 };
export const SPECIAL_COOLDOWN_TICKS = 500; // ~15s
export const INVIS_LINGER_TICKS = 67;     // ~2s: archer Shift - shuncha ko'rinmas
export const INVIS_COOLDOWN_TICKS = 467;  // ~14s: ko'rinmaslik tugagach qayta ishlatish uchun kutish

function unlocked(characterType: string, level: number): PerkId[] {
    return (PERK_TABLE[characterType] || []).filter(p => level >= p.level).map(p => p.id);
}
export function hasPerk(p: PlayerState, id: PerkId): boolean {
    return unlocked(p.characterType, p.level || 0).includes(id);
}
export function maxStaminaOf(characterType: string, level: number): number {
    return 100 + 5 * unlocked(characterType, level).filter(id => id === 'stam5').length;
}
// Har ochilgan "dmg5" uchun +5 (knight/samurai 5 va 15-darajada - jami +10)
export function bonusDamageOf(p: PlayerState): number {
    return 5 * unlocked(p.characterType, p.level || 0).filter(id => id === 'dmg5').length;
}

// QUROL KUCHAYTIRISHLARI (ball bilan, 5 darajagacha) - faqat shu qurol ochilgan (3-daraja) personajga:
//   knight: drobovik zarari (+2 har sochma o'qqa) va magazin (7 ta, har daraja +2)
//   samurai: kunai zarari (+4)
export const WEAPON_UPGRADES: { [character: string]: string[] } = {
    knight: ['shotgunDamage', 'shotgunMag'],
    samurai: ['kunaiDamage']
};
export const WEAPON_UPGRADE_LEVEL = 3;
export const SHOTGUN_BASE_MAG = 7;
export const SHOTGUN_MAG_PER_LEVEL = 2;
export const SHOTGUN_DMG_PER_LEVEL = 2;
export const KUNAI_DMG_PER_LEVEL = 4;
export const SHOTGUN_RELOAD_TICKS = 500; // 15 s - magazin bo'shasa qayta o'qlanadi
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

// KUCHAYTIRISH NARXI (hamma kuchaytirishlar uchun): har keyingi daraja - YO ball bilan, YO tanga
// bilan (o'yinchi o'zi tanlaydi). Indeks - hozirgi daraja (0 -> 1-darajaga o'tish narxi)
export const UPGRADE_COSTS: { points: number, coins: number }[] = [
    { points: 1, coins: 300 },
    { points: 1, coins: 600 },
    { points: 1, coins: 1000 },
    { points: 2, coins: 1600 },
    { points: 2, coins: 2400 }
];
export const BASE_UPGRADES = ['damage', 'stamina', 'hp', 'regen'];

export function weaponUpgradeLevel(p: PlayerState, key: string): number {
    const up = (p.accountUpgrades && p.accountUpgrades[p.characterType]) as any || {};
    return Math.min(5, up[key] || 0);
}
