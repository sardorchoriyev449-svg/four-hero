// TELEGRAM MINI APP: o'yin Telegram ichida ochilganda Telegram yuborgan initData imzosini tekshirish.
// Imzo: secret = HMAC_SHA256(key = "WebAppData", bot_token); hash = HMAC_SHA256(secret, data_check_string) (hex).
// data_check_string - "hash" dan boshqa barcha maydonlar, alifbo tartibida, "kalit=qiymat" qatorlari (\n bilan).
// Bot tokeni - .env dagi TG_GAME_BOT_TOKEN (BotFather beradi). U bo'lmasa - Telegram orqali kirish o'chiq
import crypto from 'crypto';
import { config } from 'dotenv';
config({ quiet: true });

export interface TgUser { id: number; first_name?: string; last_name?: string; username?: string; language_code?: string }
export const TG_MAX_AGE_SEC = 24 * 3600;   // eski (24 soatdan oldingi) imzo qabul qilinmaydi

export function tgEnabled(): boolean { return !!process.env.TG_GAME_BOT_TOKEN; }

export function verifyTgInitData(initData: unknown, nowSec = Math.floor(Date.now() / 1000)): TgUser | null {
    const token = process.env.TG_GAME_BOT_TOKEN;
    if (!token || typeof initData !== 'string' || !initData || initData.length > 4096) return null;
    const params = new URLSearchParams(initData), hash = params.get('hash');
    if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return null;
    params.delete('hash');
    const dcs = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => k + '=' + v).join('\n');
    const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
    const calc = crypto.createHmac('sha256', secret).update(dcs).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(calc, 'hex'), Buffer.from(hash, 'hex'))) return null;
    const authDate = Number(params.get('auth_date'));
    if (!Number.isFinite(authDate) || nowSec - authDate > TG_MAX_AGE_SEC) return null;
    try {
        const u = JSON.parse(params.get('user') || 'null');
        return u && Number.isFinite(Number(u.id)) ? { ...u, id: Number(u.id) } : null;
    } catch { return null; }
}
