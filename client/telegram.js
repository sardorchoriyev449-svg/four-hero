// TELEGRAM MINI APP: o'yin Telegram ichida ochilganda - butun ekran, pastga tortganda yopilmaydi, tasodifan yopishdan oldin so'raydi,
// Telegram hisobi bilan avtomatik kirish (bog'langan bo'lsa) yoki bitta tugma bilan yangi hisob; Telegram ichida nik / parol bilan
// kirilgan eski hisob shu Telegramga bog'lanadi (keyingi safar - avtomatik). Telegramdan tashqarida hech narsa qilmaydi
(function () {
    const TG = window.Telegram && window.Telegram.WebApp;
    const inTg = !!(TG && TG.initData);
    const api = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()).catch(() => ({ success: false, message: 'server_unreachable' }));
    window.TGApp = { inTg, tg: TG || null };
    if (!inTg) return;
    document.documentElement.classList.add('in-tg');
    try {
        TG.ready(); TG.expand();
        if (TG.disableVerticalSwipes) TG.disableVerticalSwipes();          // o'yinda pastga surish - ilovani yopmasin
        if (TG.enableClosingConfirmation) TG.enableClosingConfirmation();  // tasodifan yopishdan oldin so'raydi
        if (TG.setHeaderColor) TG.setHeaderColor('#14101f');
        if (TG.setBackgroundColor) TG.setBackgroundColor('#14101f');
        if (TG.requestFullscreen && /^(android|ios)$/.test(TG.platform)) TG.requestFullscreen();   // telefonda - butun ekran
    } catch (e) { /* eski Telegram versiyasi */ }

    const box = () => document.getElementById('tg-auth');
    const err = (m) => { const e = document.getElementById('tg-auth-error'); if (e) e.innerText = m ? (typeof tMsg === 'function' ? tMsg(m) : m) : ''; };
    // bog'langan hisob bo'lsa - darhol o'yinga; bo'lmasa - "Telegram bilan o'ynash" tugmasi
    window.TGApp.autoLogin = async () => {
        const b = box(); if (b) b.classList.remove('hidden');
        const d = await api('/api/tg-login', { initData: TG.initData, create: false });
        if (d.success && d.user && typeof onAuthSuccess === 'function') onAuthSuccess(d.user);
        else if (d.message && d.message !== 'tg_new' && d.message !== 'tg_off') err(d.message);
        if (d.message === 'tg_off' && b) b.classList.add('hidden');   // serverda Telegram sozlanmagan - oddiy kirish
    };
    window.TGApp.play = async () => {
        err('');
        const d = await api('/api/tg-login', { initData: TG.initData, create: true });
        if (d.success && d.user && typeof onAuthSuccess === 'function') onAuthSuccess(d.user);
        else err(d.message || 'tg_bad');
    };
    // nik / parol bilan kirilgan hisob - shu Telegramga bog'lanadi (hisobda Telegram bo'lmasa)
    window.TGApp.link = (user) => { if (user && user.id && user.token) api('/api/tg-link', { initData: TG.initData, userId: user.id, token: user.token }); };
    document.addEventListener('DOMContentLoaded', () => {
        const btn = document.getElementById('tg-play-btn');
        if (btn) btn.onclick = () => { btn.disabled = true; window.TGApp.play().finally(() => { btn.disabled = false; }); };
    });
})();
