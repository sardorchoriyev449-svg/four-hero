import { BaseCharacter } from './base.character';
import { PlayerState, RoomState } from '../types';
import { hasPerk } from '../perks';

export class ArcherCharacter extends BaseCharacter {
    // Kamonchi: zarba 10 ta HP oladi, stamina sal sekinroq ketadi (ritsardan tezroq, sehrgardan sekinroq)
    public attackStaminaCost = 12;

    handleAttack(player: PlayerState, room: RoomState, angle: number): void {
        room.bulletIdCounter++;
        room.bullets.push({
            id: 'bullet_' + room.bulletIdCounter,
            playerId: player.id,
            // MUHIM: qaysi tomonga qarab turganiga qarab (Math.cos(angle) orqali) -
            // aks holda o'yinchi chapga qarab tursa ham o'q doim o'ng tomondan
            // chiqardi. Y - yoy uchining balandligiga mos (klientdagi vizual
            // yoy tepasi taxminan shu balandlikda chiziladi - aks holda o'q
            // qurol tasviridan pastroqda, "havoda osilib qolgandek" ko'rinardi)
            x: player.x + Math.cos(angle) * 18,
            y: player.y - 8,
            vx: Math.cos(angle) * 1000, // Judayam tez uchadi
            vy: Math.sin(angle) * 1000,
            color: player.color,
            lifetime: 80,
            bulletType: 'arrow',
            fire: hasPerk(player, 'firearrow'),   // 4-daraja: olovli o'q (zarari +5 - "dmg5" imkoniyatidan)
            justSpawned: true
        });
    }

    // Kamonchi uchun SHIFT = ko'rinmaslik. Bosib turilgancha ko'rinmas,
    // qo'yib yuborilsa yoki stamina tugasa darrov ko'rinadigan bo'lib qoladi.
    applyHeldAbility(player: PlayerState, room: RoomState): void {
        player.isInvisible = true;
    }

    releaseHeldAbility(player: PlayerState, room: RoomState): void {
        player.isInvisible = false;
    }
}