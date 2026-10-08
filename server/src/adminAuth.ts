// ADMIN PANEL (veb) uchun kirish: .env dagi admin_login / admin_password (Telegram bot bilan bir xil).
// Kirgach - 2 soatlik imzolangan token (X-Admin-Token). Bir IP dan 5 marta noto'g'ri parol - o'sha IP 10 daqiqa bloklanadi
// (hammaga emas: aks holda begona odam ataylab xato yozib, haqiqiy adminni doim chiqarib turishi mumkin edi)
import crypto from 'crypto';

const TTL_MS = 2 * 60 * 60 * 1000;
const MAX_FAILS = 5;
const LOCK_MS = 10 * 60 * 1000;
const fails = new Map<string, { n: number, until: number }>();
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

// Kiritilgan login - aynan admin logini (o'yin kirish oynasidan admin panelga o'tish uchun)
export function isAdminLoginName(login: unknown): boolean {
    const l = typeof login === 'string' ? login.trim() : '';
    return adminConfigured() && !!l && safeEqual(l, (process.env.admin_login || '').trim());
}

export function adminLogin(login: unknown, password: unknown, ip = '?'): { success: boolean, token?: string, message?: string } {
    if (!adminConfigured()) return { success: false, message: 'err_admin_off' };
    const now = Date.now();
    const f = fails.get(ip);
    if (f && now < f.until) return { success: false, message: 'err_admin_locked' };
    const l = typeof login === 'string' ? login.trim() : '';
    const p = typeof password === 'string' ? password : '';
    const okLogin = safeEqual(l, (process.env.admin_login || '').trim());
    const okPass = safeEqual(p, (process.env.admin_password || '').trim());
    if (!okLogin || !okPass) {
        const rec = f && !(f.until && now >= f.until) ? f : { n: 0, until: 0 };   // blok muddati o'tgan - qaytadan sanaladi
        if (++rec.n >= MAX_FAILS) { rec.until = now + LOCK_MS; rec.n = 0; }
        fails.set(ip, rec);
        if (fails.size > 5000) fails.forEach((v, k) => { if (now > v.until) fails.delete(k); });   // xotira to'lmasin
        return { success: false, message: 'err_admin_wrong' };
    }
    fails.delete(ip);
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
