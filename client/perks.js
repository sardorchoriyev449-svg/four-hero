// DARAJA IMKONIYATLARI - serverdagi server/src/perks.ts bilan bir xil jadval (readme "level up's").
// Har personajning o'z darajasi bor: shu personaj bilan o'tilgan har xarita +10 XP,
// har keyingi darajaga kerakli XP ikki baravar oshadi
const PERK_TABLE = {
    mage: [{ level: 1, id: 'shift' }, { level: 2, id: 'ice' }, { level: 3, id: 'stam5' }, { level: 5, id: 'dmg5' }, { level: 10, id: 'heal' }, { level: 15, id: 'stam5' }, { level: 15, id: 'dmg5' }],
    knight: [{ level: 1, id: 'shift' }, { level: 2, id: 'stam5' }, { level: 3, id: 'shotgun' }, { level: 5, id: 'dmg5' }, { level: 10, id: 'fly' }, { level: 15, id: 'stam5' }, { level: 15, id: 'dmg5' }],
    samurai: [{ level: 1, id: 'shift' }, { level: 2, id: 'stam5' }, { level: 3, id: 'kunai' }, { level: 5, id: 'dmg5' }, { level: 10, id: 'djump' }, { level: 15, id: 'stam5' }, { level: 15, id: 'dmg5' }],
    archer: [{ level: 1, id: 'shift' }, { level: 2, id: 'stam5' }, { level: 3, id: 'stam5' }, { level: 4, id: 'firearrow' }, { level: 4, id: 'dmg5' }, { level: 5, id: 'dmg5' }, { level: 10, id: 'invis2' }, { level: 15, id: 'stam5' }, { level: 15, id: 'dmg5' }]
};
const ALT_WEAPON_PERK = { mage: 'ice', knight: 'shotgun', samurai: 'kunai' };
const SPECIAL_PERK = { mage: 'heal', knight: 'fly' };

function hasPerkClient(characterType, level, id) {
    return (PERK_TABLE[characterType] || []).some(p => p.id === id && (level || 0) >= p.level);
}

// Tajribadan daraja va joriy darajadagi ulush (serverdagi xpLevel bilan bir xil)
function xpProgress(xp) {
    let level = 0, need = 10, rest = Math.max(0, xp || 0);
    while (rest >= need) { rest -= need; level++; need *= 2; }
    return { level, cur: rest, need };
}
