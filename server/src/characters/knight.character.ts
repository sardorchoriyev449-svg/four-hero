import { BaseCharacter } from './base.character';
import { PlayerState, RoomState } from '../types';
import { shotgunMagOf, SHOTGUN_RELOAD_TICKS } from '../perks';

export class KnightCharacter extends BaseCharacter {
    // Ritsar: zarba 20 ta HP oladi, lekin stamina sekin ketadi
    public attackStaminaCost = 8;

    // Drobovik: magazin bo'sh yoki qayta o'qlanayotgan bo'lsa - otmaydi
    canAttack(player: PlayerState): boolean {
        if (player.weaponMode !== 'alt') return true;
        return (player.reloadTicks || 0) <= 0 && (player.ammo ?? shotgunMagOf(player)) > 0;
    }

    handleAttack(player: PlayerState, room: RoomState, angle: number): void {
        // 3-daraja: Q bilan DROBOVIK - yaqin masofaga 5 ta sochma o'q (yelpig'ich); har otish -1 o'q,
        // magazin bo'shasa qayta o'qlanadi
        if (player.weaponMode === 'alt') {
            player.ammo = (player.ammo ?? shotgunMagOf(player)) - 1;
            if (player.ammo <= 0) player.reloadTicks = SHOTGUN_RELOAD_TICKS;
            for (let k = -2; k <= 2; k++) {
                const a = angle + k * 0.12;
                room.bulletIdCounter++;
                room.bullets.push({
                    id: 'bullet_' + room.bulletIdCounter,
                    playerId: player.id,
                    x: player.x + Math.cos(angle) * 22,
                    y: player.y - 2,
                    vx: Math.cos(a) * 700,
                    vy: Math.sin(a) * 700,
                    color: player.color,
                    lifetime: 10, // ~210px - faqat yaqinga
                    bulletType: 'pellet',
                    justSpawned: true
                });
            }
            return;
        }
        room.bulletIdCounter++;
        room.bullets.push({
            id: 'bullet_' + room.bulletIdCounter,
            playerId: player.id,
            x: player.x + (Math.cos(angle) * 15),
            y: player.y + 2, // Qo'l/qurol balandligi - tanaga mos (avval +10 edi, tana texturasi balandroq bo'lgach pastroq chiqib qolgandi)
            vx: Math.cos(angle) * 150, // Sekin va yaqin masofaga
            vy: Math.sin(angle) * 150,
            color: player.color,
            lifetime: 9, // Havoda biroz uzoqroq turadi - zarba izchil tegishi uchun
            bulletType: 'melee',
            justSpawned: true
        });
    }

    // Ritsar uchun SHIFT = qalqon. Qalqonning o'zi (zarardan himoya) va vizual
    // ko'rsatilishi to'g'ridan-to'g'ri player.isHoldingAbility maydoniga qarab
    // game.engine.ts ichida tekshiriladi, shuning uchun bu yerda qo'shimcha effekt kerak emas.
    applyHeldAbility(player: PlayerState, room: RoomState): void {
        // Bo'sh - qalqon holati faqat isHoldingAbility bayrog'i orqali boshqariladi
    }

    releaseHeldAbility(player: PlayerState, room: RoomState): void {
        // Bo'sh - qo'shimcha holatni bekor qilish shart emas
    }
}