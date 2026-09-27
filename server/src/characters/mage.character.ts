import { BaseCharacter } from './base.character';
import { PlayerState, RoomState } from '../types';

export class MageCharacter extends BaseCharacter {
    // Sehrgar: zarba 30 ta HP oladi (eng kuchli), lekin stamina tez ketadi
    public attackStaminaCost = 25;

    handleAttack(player: PlayerState, room: RoomState, angle: number): void {
        room.bulletIdCounter++;
        room.bullets.push({
            id: 'bullet_' + room.bulletIdCounter,
            playerId: player.id,
            // MUHIM: qaysi tomonga qarab turganiga qarab (aks holda chapga
            // qarab tursa ham o'q doim o'ng tomondan chiqardi). Y - tayoqcha
            // uchining balandligiga mos (klientdagi vizual tayoqcha uchi
            // shu atrofda chiziladi)
            x: player.x + Math.cos(angle) * 20,
            y: player.y - 10,
            vx: Math.cos(angle) * (player.weaponMode === 'alt' ? 700 : 600), // Og'irroq va sekinroq o'q
            vy: Math.sin(angle) * (player.weaponMode === 'alt' ? 700 : 600),
            color: player.color,
            lifetime: 80,
            // 2-daraja: Q bilan MUZ shari - kamroq zarar, lekin botni muzlatadi
            bulletType: player.weaponMode === 'alt' ? 'ice' : 'fireball',
            justSpawned: true
        });
    }

    // Sehrgar uchun SHIFT = atrofdagi botlarni muzlatish. Bosib turilgancha
    // radiusdagi botlar muzlab turadi (har tikda yangilanadi), qo'yib
    // yuborilsa muzlash tabiiy ravishda tugab boradi.
    applyHeldAbility(player: PlayerState, room: RoomState): void {
        room.bots.forEach(bot => {
            const dist = Math.hypot(bot.x - player.x, bot.y - player.y);
            if (dist < 250) {
                bot.freezeDuration = Math.max(bot.freezeDuration, 10);
            }
        });
    }

    releaseHeldAbility(player: PlayerState, room: RoomState): void {
        // Bo'sh - muzlash effekti o'zi asta-sekin tugaydi (freezeDuration kamayadi)
    }
}