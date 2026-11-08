import { BaseCharacter } from './base.character';
import { PlayerState, RoomState } from '../types';
import { hasPerk, BIG_SPIRIT } from '../perks';

export class SamuraiCharacter extends BaseCharacter {
    // Ruhiy zarba ~0.75 s da bir (oddiy katana - tez)
    public attackCooldownTicks(player: PlayerState): number {
        return player.weaponMode === 'alt' ? 25 : BaseCharacter.ATTACK_COOLDOWN_TICKS;
    }
    // Samuray: katana zarbasi stamina sekin oladi; KATANA RUHI (havoni kesib uchadigan zarba) - o'rtacha
    public attackStaminaCost = 8;
    public static readonly SLASH_STAMINA = 24;   // kuchli zarba - stamina tez tugaydi (4 ta zarbadan keyin dam olish kerak)
    public attackStamina(player: PlayerState): number { return player.weaponMode === 'alt' ? SamuraiCharacter.SLASH_STAMINA : this.attackStaminaCost; }

    handleAttack(player: PlayerState, room: RoomState, angle: number): void {
        // 3-daraja: Q bilan KATANA RUHI - katana siltanganda tig'idan havoni kesib uchadigan ruhiy zarba (kunai o'rniga)
        if (player.weaponMode === 'alt') {
            const big = hasPerk(player, 'bigspirit');   // 16-daraja: katta ruh
            room.bulletIdCounter++;
            room.bullets.push({
                id: 'bullet_' + room.bulletIdCounter,
                playerId: player.id,
                x: player.x + Math.cos(angle) * 24,
                y: player.y + (big ? BIG_SPIRIT.dy : -2),
                vx: Math.cos(angle) * 640,
                vy: Math.sin(angle) * 640,
                color: player.color,
                lifetime: 22, // ~470px
                bulletType: 'slash',
                big,
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