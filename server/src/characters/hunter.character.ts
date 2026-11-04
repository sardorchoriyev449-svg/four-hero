import { BaseCharacter } from './base.character';
import { PlayerState, RoomState } from '../types';
import { hasPerk, HUNTER } from '../perks';

// OVCHI (Hunter, pullik qahramon): uzun ov pichog'i - o'rtacha masofaga (ritsar qilichidan uzoqroq, sekinroq, kuchliroq).
// 3-daraja (Q): puflama naycha - uzoqqa uchadigan drotik; 10-daraja: drotik zaharli (1 s dan keyin jon keta boshlaydi).
// SHIFT (1-daraja) - yopishqoq mina, R (16-daraja) - qopqon: room.manager va game.engine da
export class HunterCharacter extends BaseCharacter {
    public attackStaminaCost = 9;

    public attackCooldownTicks(player: PlayerState): number {
        return player.weaponMode === 'alt' ? HUNTER.dartCdTicks : HUNTER.knifeCdTicks;
    }

    handleAttack(player: PlayerState, room: RoomState, angle: number): void {
        const dir = Math.cos(angle) < 0 ? -1 : 1;
        if (player.weaponMode === 'alt') {
            // DROTIK: tez va uzoqqa; 10-darajadan - zaharli
            room.bulletIdCounter++;
            room.bullets.push({ id: 'bullet_' + room.bulletIdCounter, playerId: player.id, x: player.x + dir * 18, y: player.y - 6,
                vx: Math.cos(angle) * HUNTER.dartSpeed, vy: Math.sin(angle) * HUNTER.dartSpeed, color: player.color, lifetime: HUNTER.dartLife,
                bulletType: 'dart', justSpawned: true, poison: hasPerk(player, 'poison') });
            return;
        }
        // UZUN PICHOQ: qahramon oldidan o'rtacha masofaga kesib o'tadi
        room.bulletIdCounter++;
        room.bullets.push({ id: 'bullet_' + room.bulletIdCounter, playerId: player.id, x: player.x + dir * 22, y: player.y + 2,
            vx: dir * HUNTER.knifeSpeed, vy: 0, color: player.color, lifetime: HUNTER.knifeLife, bulletType: 'knife', justSpawned: true });
    }

    // SHIFT bosib turiladigan emas - bir martalik mina (room.manager.startAbility)
    applyHeldAbility(_player: PlayerState, _room: RoomState): void { }
    releaseHeldAbility(_player: PlayerState, _room: RoomState): void { }
}
