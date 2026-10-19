// DARAJA IMKONIYATLARI - serverdagi server/src/perks.ts bilan bir xil jadval (readme "level up's").
// Har personajning o'z darajasi bor: shu personaj bilan o'tilgan har xarita +10 XP,
// har keyingi darajaga kerakli XP ikki baravar oshadi
const PERK_TABLE = {
    mage: [{ level: 1, id: 'shift' }, { level: 2, id: 'ice' }, { level: 3, id: 'stam5' }, { level: 5, id: 'dmg5' }, { level: 10, id: 'heal' }, { level: 15, id: 'stam5' }, { level: 15, id: 'dmg5' }],
    knight: [{ level: 1, id: 'shift' }, { level: 2, id: 'stam5' }, { level: 3, id: 'shotgun' }, { level: 5, id: 'dmg5' }, { level: 10, id: 'fly' }, { level: 15, id: 'stam5' }, { level: 15, id: 'dmg5' }],
    samurai: [{ level: 1, id: 'shift' }, { level: 2, id: 'stam5' }, { level: 3, id: 'kunai' }, { level: 5, id: 'dmg5' }, { level: 10, id: 'djump' }, { level: 15, id: 'stam5' }, { level: 15, id: 'dmg5' }],
    archer: [{ level: 1, id: 'shift' }, { level: 2, id: 'stam5' }, { level: 3, id: 'stam5' }, { level: 4, id: 'firearrow' }, { level: 4, id: 'dmg5' }, { level: 5, id: 'dmg5' }, { level: 10, id: 'invis2' }, { level: 15, id: 'stam5' }, { level: 15, id: 'dmg5' }]
};
// 20, 30, ... 100-darajalarda bittadan, navbat bilan (serverdagi bilan bir xil): 20, 40 ... - stamina; 30, 50 ... - zarar
Object.keys(PERK_TABLE).forEach((c) => {
    for (let L = 20; L <= 100; L += 10) PERK_TABLE[c].push({ level: L, id: (L / 10) % 2 === 0 ? 'stam5' : 'dmg5' });
});
const MAX_HERO_LEVEL = 100;
const ALT_WEAPON_PERK = { mage: 'ice', knight: 'shotgun', samurai: 'kunai' };
const SPECIAL_PERK = { mage: 'heal', knight: 'fly' };

function hasPerkClient(characterType, level, id) {
    return (PERK_TABLE[characterType] || []).some(p => p.id === id && (level || 0) >= p.level);
}

// Daraja boshlanishi uchun jami XP (serverdagi xpForLevel bilan bir xil): 1-15 - ikki baravar, 16-dan L x 100
function xpForLevel(L) {
    L = Math.max(0, Math.min(MAX_HERO_LEVEL, Math.floor(L)));
    return L <= 15 ? 10 * (2 ** L - 1) : 10 * (2 ** 15 - 1) + 100 * (L * (L + 1) / 2 - 120);
}
// Tajribadan daraja va joriy darajadagi ulush (serverdagi xpLevel bilan bir xil)
function xpProgress(xp) {
    const x = Math.max(0, xp || 0);
    let level = 0;
    while (level < MAX_HERO_LEVEL && x >= xpForLevel(level + 1)) level++;
    if (level >= MAX_HERO_LEVEL) return { level, cur: 1, need: 1, max: true };
    return { level, cur: x - xpForLevel(level), need: xpForLevel(level + 1) - xpForLevel(level) };
}
