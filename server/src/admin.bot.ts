// ===== ADMIN TELEGRAM BOT (faqat o'yin egasi uchun) =====
// .env: TG_BOT_KAY - bot tokeni, admin_id - egasining Telegram ID si, admin_login / admin_password.
// Xavfsizlik:
//   - faqat admin_id dan kelgan xabarlarga javob beradi (boshqalarga - jim)
//   - har safar /login bilan kirish kerak; parolli xabar darhol o'chiriladi
//   - /logout - chiqish; 15 daqiqa hech narsa qilinmasa - avtomatik chiqadi
//   - 5 marta noto'g'ri parol - 10 daqiqa bloklanadi
// Buyruqlar: /stats, /find <login>, /ban <login> [sabab], /unban <login>, /coins <login> <son>
import crypto from 'crypto';
import * as db from './db';
import { RoomManager } from './managers/room.manager';

const SESSION_MS = 15 * 60 * 1000;
const MAX_FAILS = 5;
const LOCK_MS = 10 * 60 * 1000;
const MAX_COINS_CHANGE = 1_000_000;

const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Vaqtga bog'liq bo'lmagan taqqoslash (parolni harfma-harf taxmin qilib bo'lmasin)
function safeEqual(a: string, b: string): boolean {
    const ha = crypto.createHash('sha256').update(a).digest();
    const hb = crypto.createHash('sha256').update(b).digest();
    return crypto.timingSafeEqual(ha, hb);
}

export function startAdminBot(roomManager: RoomManager): void {
    const token = (process.env.TG_BOT_KAY || process.env.TG_BOT_KEY || '').trim();
    const adminId = (process.env.admin_id || '').trim();
    const adminLogin = (process.env.admin_login || '').trim();
    const adminPassword = (process.env.admin_password || '').trim();
    if (!token || !adminId || !adminLogin || !adminPassword) {
        console.log('Admin bot o\'chiq: .env da TG_BOT_KAY, admin_id, admin_login, admin_password to\'liq emas');
        return;
    }
    const API = 'https://api.telegram.org/bot' + token + '/';
    let sessionUntil = 0;
    let fails = 0, lockedUntil = 0;
    let offset = 0;

    async function call(method: string, body: object): Promise<any> {
        const res = await fetch(API + method, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        return res.json();
    }
    const send = (chatId: number, text: string) => call('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML' }).catch(() => {});

    const HELP = [
        '<b>4 Heroes - admin</b>',
        '/login &lt;login&gt; &lt;parol&gt; - kirish (xabar o\'chiriladi)',
        '/logout - chiqish (15 daqiqa jim tursa - o\'zi chiqadi)',
        '/stats - foydalanuvchilar va onlayn holat',
        '/find &lt;login&gt; - foydalanuvchini topish',
        '/ban &lt;login&gt; [sabab] - bloklash (onlayn bo\'lsa - chiqarib yuboriladi)',
        '/unban &lt;login&gt; - blokdan chiqarish',
        '/coins &lt;login&gt; &lt;son&gt; - tanga berish (manfiy - ayirish)'
    ].join('\n');

    function userCard(u: db.UserRecord): string {
        const online = roomManager.findOnline(u.id);
        const lv = (c: string) => db.xpLevel(u.charXp[c] || 0);
        return [
            `<b>${esc(u.nickname)}</b> (${esc(u.fullName)})`,
            `ID: <code>${u.id}</code>`,
            `Tanga: <b>${u.coins}</b>`,
            `Ochilgan xarita: ${u.unlockedLevel + 1}`,
            `Darajalar: knight ${lv('knight')}, archer ${lv('archer')}, mage ${lv('mage')}, samurai ${lv('samurai')}`,
            `Holat: ${u.banned ? '⛔ BLOKLANGAN' + (u.banReason ? ' (' + esc(u.banReason) + ')' : '') : '✅ faol'}`,
            `Onlayn: ${online ? '🟢 xonada "' + esc(online.roomName) + '"' : '⚪ yo\'q'}`,
            u.createdAt ? `Ro'yxatdan o'tgan: ${new Date(u.createdAt).toISOString().slice(0, 10)}` : ''
        ].filter(Boolean).join('\n');
    }

    async function findOne(chatId: number, login: string): Promise<db.UserRecord | null> {
        if (!login) { await send(chatId, 'Login yozilmadi. Masalan: /find sardor'); return null; }
        const r = await db.findUsersByNickname(login);
        if (r.exact) return r.exact;
        await send(chatId, r.similar.length
            ? `"${esc(login)}" topilmadi. O'xshashlari:\n` + r.similar.map(n => '• ' + esc(n)).join('\n')
            : `"${esc(login)}" topilmadi.`);
        return null;
    }

    async function handle(msg: any): Promise<void> {
        const chatId: number = msg.chat.id;
        const fromId = String(msg.from && msg.from.id);
        if (fromId !== adminId || msg.chat.type !== 'private') return; // begonalarga - jim
        const text: string = (msg.text || '').trim();
        const [cmdRaw, ...args] = text.split(/\s+/);
        const cmd = (cmdRaw || '').split('@')[0].toLowerCase();
        const now = Date.now();

        if (cmd === '/login') {
            // Parolli xabarni chatdan darhol o'chiramiz
            call('deleteMessage', { chat_id: chatId, message_id: msg.message_id }).catch(() => {});
            if (now < lockedUntil) { await send(chatId, `⛔ Juda ko'p xato urinish. ${Math.ceil((lockedUntil - now) / 60000)} daqiqadan keyin qayta urining.`); return; }
            if (args.length >= 2 && safeEqual(args[0], adminLogin) && safeEqual(args.slice(1).join(' '), adminPassword)) {
                sessionUntil = now + SESSION_MS;
                fails = 0;
                await send(chatId, '✅ Kirdingiz. 15 daqiqa jim tursangiz - o\'zi chiqadi.\n\n' + HELP);
            } else {
                fails++;
                if (fails >= MAX_FAILS) { lockedUntil = now + LOCK_MS; fails = 0; }
                await send(chatId, '❌ Login yoki parol noto\'g\'ri.');
            }
            return;
        }
        if (cmd === '/start' || cmd === '/help') {
            await send(chatId, HELP + (now < sessionUntil ? '' : '\n\n🔒 Avval /login qiling.'));
            return;
        }
        if (now >= sessionUntil) {
            await send(chatId, '🔒 Sessiya yopiq. /login &lt;login&gt; &lt;parol&gt;');
            return;
        }
        sessionUntil = now + SESSION_MS; // har buyruq sessiyani uzaytiradi

        if (cmd === '/logout') {
            sessionUntil = 0;
            await send(chatId, '👋 Chiqdingiz. Keyingi safar yana /login kerak.');
        } else if (cmd === '/stats') {
            const c = await db.countUsers();
            const o = roomManager.onlineStats();
            await send(chatId, [
                '<b>📊 Statistika</b>',
                `Foydalanuvchilar: <b>${c.total}</b> (bloklangan: ${c.banned})`,
                `Hozir xonalarda: <b>${o.players}</b> o'yinchi (hisobli: ${o.loggedIn})`,
                `Xonalar: ${o.rooms} (o'yin ketayotgan: ${o.playing})`
            ].join('\n'));
        } else if (cmd === '/find') {
            const u = await findOne(chatId, args[0]);
            if (u) await send(chatId, userCard(u));
        } else if (cmd === '/ban' || cmd === '/unban') {
            const u = await findOne(chatId, args[0]);
            if (!u) return;
            const ban = cmd === '/ban';
            const reason = args.slice(1).join(' ').slice(0, 200);
            const upd = await db.setBanned(u.id, ban, reason);
            const kicked = ban ? roomManager.kickUser(u.id, reason) : false;
            await send(chatId, (ban ? '⛔ Bloklandi' : '✅ Blokdan chiqarildi') + (kicked ? ' (o\'yindan chiqarib yuborildi)' : '') + '\n\n' + (upd ? userCard(upd) : ''));
        } else if (cmd === '/coins') {
            const amount = Number(args[1]);
            if (!args[0] || !Number.isInteger(amount) || amount === 0 || Math.abs(amount) > MAX_COINS_CHANGE) {
                await send(chatId, 'Masalan: /coins sardor 500  (ayirish: /coins sardor -100)');
                return;
            }
            const u = await findOne(chatId, args[0]);
            if (!u) return;
            const upd = await db.adjustCoins(u.id, amount);
            if (upd) roomManager.notifyCoins(u.id, upd.coins - u.coins, upd.coins);
            await send(chatId, `💰 ${amount > 0 ? '+' : ''}${amount} tanga. Yangi balans: <b>${upd ? upd.coins : '?'}</b>`);
        } else {
            await send(chatId, 'Noma\'lum buyruq.\n\n' + HELP);
        }
    }

    async function poll(): Promise<void> {
        try {
            const r = await fetch(API + 'getUpdates?timeout=30&offset=' + offset);
            const data: any = await r.json();
            if (data.ok) {
                for (const upd of data.result) {
                    offset = upd.update_id + 1;
                    if (upd.message) await handle(upd.message).catch(err => console.error('Admin bot xatosi:', err));
                }
            } else if (data.error_code === 401) {
                console.error('Admin bot: TG_BOT_KAY noto\'g\'ri - bot to\'xtatildi');
                return;
            }
        } catch (err) {
            await new Promise(res => setTimeout(res, 5000)); // internet uzilsa - biroz kutib qayta
        }
        setImmediate(poll);
    }

    call('deleteWebhook', {}).catch(() => {});
    call('setMyCommands', { commands: [
        { command: 'login', description: 'Kirish: /login login parol' },
        { command: 'logout', description: 'Chiqish' },
        { command: 'stats', description: 'Statistika' },
        { command: 'find', description: 'Foydalanuvchini topish' },
        { command: 'ban', description: 'Bloklash' },
        { command: 'unban', description: 'Blokdan chiqarish' },
        { command: 'coins', description: 'Tanga berish' }
    ] }).catch(() => {});
    console.log('Admin Telegram bot ishga tushdi');
    poll();
}
