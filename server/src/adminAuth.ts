// ADMIN PANEL (veb) uchun kirish: .env dagi admin_login / admin_password (Telegram bot bilan bir xil).
// Kirgach - 2 soatlik imzolangan token (X-Admin-Token). 5 marta noto'g'ri parol - 10 daqiqa bloklanadi
import crypto from 'crypto';

const TTL_MS = 2 * 60 * 60 * 1000;
const MAX_FAILS = 5;
const LOCK_MS = 10 * 60 * 1000;
let fails = 0, lockedUntil = 0;
// SESSION_SECRET bo'lmasa - server ishga tushganda tasodifiy kalit (qayta ishga tushsa - qayta kirish kerak)
const fallbackKey = crypto.randomBytes(32).toString('hex');
const key = () => (process.env.SESSION_SECRET ? process.env.SESSION_SECRET + '|admin-panel' : fallbackKey);
const sign = (exp: number) => crypto.createHmac('sha256', key()).update('admin:' + exp).digest('hex');

// Vaqtga bog'liq bo'lmagan taqqoslash (parolni harfma-harf taxmin qilib bo'lmasin)
function safeEqual(a: string, b: string): boolean {
    const ha = crypto.createHash('sha256').update(a).digest();
    const hb = crypto.createHash('sha256').update(b).digest();
    return crypto.timingSafeEqual(ha, hb);
}

export function adminConfigured(): boolean {
    return !!((process.env.admin_login || '').trim() && (process.env.admin_password || '').trim());
}

export function adminLogin(login: unknown, password: unknown): { success: boolean, token?: string, message?: string } {
    if (!adminConfigured()) return { success: false, message: 'err_admin_off' };
    const now = Date.now();
    if (now < lockedUntil) return { success: false, message: 'err_admin_locked' };
    const l = typeof login === 'string' ? login.trim() : '';
    const p = typeof password === 'string' ? password : '';
    const okLogin = safeEqual(l, (process.env.admin_login || '').trim());
    const okPass = safeEqual(p, (process.env.admin_password || '').trim());
    if (!okLogin || !okPass) {
        if (++fails >= MAX_FAILS) { lockedUntil = now + LOCK_MS; fails = 0; }
        return { success: false, message: 'err_admin_wrong' };
    }
    fails = 0;
    const exp = now + TTL_MS;
    return { success: true, token: exp + '.' + sign(exp) };
}

export function verifyAdmin(token: unknown): boolean {
    if (typeof token !== 'string' || token.length > 200) return false;
    const [e, s] = token.split('.');
    const exp = Number(e);
    if (!exp || exp < Date.now() || !s) return false;
    const good = sign(exp);
    return s.length === good.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(good));
}
