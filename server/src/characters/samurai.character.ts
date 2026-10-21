import { BaseCharacter } from './base.character';
import { PlayerState, RoomState } from '../types';

export class SamuraiCharacter extends BaseCharacter {
    // Kunai va shuriken juda tez yog'ilardi (har 0.36 s) - endi kunai ~0.75 s, shuriken yelpig'ichi ~1 s da bir
    public attackCooldownTicks(player: PlayerState): number {
        return player.weaponMode === 'alt2' ? 33 : player.weaponMode === 'alt' ? 25 : BaseCharacter.ATTACK_COOLDOWN_TICKS;
    }
    // Samuray: zarba 20 ta HP oladi, ritsar kabi stamina sekin ketadi
    public attackStaminaCost = 8;

    handleAttack(player: PlayerState, room: RoomState, angle: number): void {
        // 16-daraja: SHURIKEN YELPIG'ICHI - bir yo'la 3 ta
        if (player.weaponMode === 'alt2') {
            for (let k = -1; k <= 1; k++) {
                const a = angle + k * 0.2;
                room.bulletIdCounter++;
                room.bullets.push({ id: 'bullet_' + room.bulletIdCounter, playerId: player.id, x: player.x + Math.cos(angle) * 18, y: player.y - 4,
                    vx: Math.cos(a) * 720, vy: Math.sin(a) * 720, color: player.color, lifetime: 28, bulletType: 'shuriken', justSpawned: true });
            }
            return;
        }
        // 3-daraja: Q bilan KUNAI - uzoqqa otiladigan pichoq
        if (player.weaponMode === 'alt') {
            room.bulletIdCounter++;
            room.bullets.push({
                id: 'bullet_' + room.bulletIdCounter,
                playerId: player.id,
                x: player.x + Math.cos(angle) * 18,
                y: player.y - 4,
                vx: Math.cos(angle) * 750,
                vy: Math.sin(angle) * 750,
                color: player.color,
                lifetime: 25, // ~560px
                bulletType: 'kunai',
                justSpawned: true
            });
            return;
        }
        room.bulletIdCounter++;
        room.bullets.push({
            id: 'bullet_' + room.bulletIdCounter,
            playerId: player.id,
            x: player.x + (Math.cos(angle) * 20),
            y: player.y + 2, // Qo'l/qurol balandligi - tanaga mos (avval +10 edi, tana texturasi balandroq bo'lgach pastroq chiqib qolgandi)
            vx: Math.cos(angle) * 220, // Katananing kesish tezligi
            vy: Math.sin(angle) * 220,
            color: player.color,
            lifetime: 8, // Juda qisqa emas endi - zarba izchil tegishi uchun
            bulletType: 'melee',
            justSpawned: true
        });
    }

    // Samuray uchun SHIFT = tezlik boost. Bosib turilgancha tez yuradi,
    // qo'yib yuborilsa yoki stamina tugasa oddiy tezlikka qaytadi.
    applyHeldAbility(player: PlayerState, room: RoomState): void {
        player.speedMultiplier = 1.8;
    }

    releaseHeldAbility(player: PlayerState, room: RoomState): void {
        player.speedMultiplier = 1;
    }
}