import { getMapById } from '../maps';
import { PlayerState, RoomState } from '../types';

// YO'NALISH YORDAMI: hujumlar faqat o'ngga/chapga ketadi, Gigant gulning boshi esa tepada.
// Qahramon gul tomonga qarab tursa, o'q/zarba boshga qarab yo'naladi (gorizontaldan ko'pi bilan 75°)
export function aimAssist(room: RoomState, p: PlayerState, angle: number): number {
    const g = room.gflower;
    const d = getMapById(room.selectedLevel).giantFlower;
    if (!g || !d || (g.state !== 'fight' && g.state !== 'wake')) return angle;
    const dx = g.hx - p.x, dy = g.hy - p.y;
    const facing = Math.cos(angle) >= 0 ? 1 : -1;
    if (dx * facing < -20 || Math.hypot(dx, dy) > 650) return angle;
    const base = facing > 0 ? 0 : Math.PI;
    let rel = Math.atan2(dy, Math.abs(dx) < 1 ? facing : dx) - base;
    while (rel > Math.PI) rel -= 2 * Math.PI;
    while (rel < -Math.PI) rel += 2 * Math.PI;
    const max = 75 * Math.PI / 180;
    return base + Math.max(-max, Math.min(max, rel));
}
