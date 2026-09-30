// HISOB TOKENI: login/ro'yxatdan o'tishda beriladi, keyin hisobga tegishli har so'rov (REST va
// socket) shu token bilan keladi. Tokensiz faqat userId ni bilgan har kim boshqa birovning
// tangasini sarflab, skin/kuchaytirish sotib ola olardi.
// Token = HMAC-SHA256(maxfiy kalit, userId). Kalit: .env dagi SESSION_SECRET (bo'lmasa - MongoDB
// manzilidan olinadi; u ham serverda maxfiy)
import crypto from 'crypto';
import { config } from 'dotenv';
config({ quiet: true });

const SECRET = process.env.SESSION_SECRET
    || crypto.createHash('sha256').update('4heroes-session:' + (process.env.MONGODB_URI || 'local')).digest('hex');

export function signUser(userId: string): string {
    return crypto.createHmac('sha256', SECRET).update(String(userId)).digest('base64url');
}

export function verifyUser(userId: unknown, token: unknown): boolean {
    if (typeof userId !== 'string' || typeof token !== 'string' || !userId || !token) return false;
    const expected = Buffer.from(signUser(userId));
    const given = Buffer.from(token);
    return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}
