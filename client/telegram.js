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
    } catch (e) { /* eski Telegram versiyasi */ }
    // TO'LIQ EKRAN (Telegram 8.0+): telefonda - doim; kompyuterda - sozlamada "Full screen" tanlangan bo'lsa.
    // Tepadagi Telegram tugmalari (yopish, menyu) o'yinni yopmasin - ular egallagan joy --tg-top ga yoziladi
    const canFull = !!(TG.requestFullscreen && TG.isVersionAtLeast && TG.isVersionAtLeast('8.0'));
    const mobile = /^(android|android_x|ios)$/.test(TG.platform);
    const refresh = () => requestAnimationFrame(() => { if (typeof phaserGame !== 'undefined' && phaserGame && phaserGame.scale) phaserGame.scale.refresh(); });
    const syncFull = () => { document.documentElement.classList.toggle('tg-full', !!TG.isFullscreen); refresh(); };
    window.TGApp.canFull = canFull;
    window.TGApp.setFull = (on) => { if (!canFull) return false; try { if (on && !TG.isFullscreen) TG.requestFullscreen(); else if (!on && TG.isFullscreen) TG.exitFullscreen(); } catch (e) { } return true; };
    if (canFull) {
        TG.onEvent('fullscreenChanged', syncFull);
        TG.onEvent('safeAreaChanged', refresh); TG.onEvent('contentSafeAreaChanged', refresh); TG.onEvent('viewportChanged', refresh);
        let saved = null; try { saved = localStorage.getItem('screenMode'); } catch (e) { }
        if (mobile ? saved !== 'standard' : saved === 'full') window.TGApp.setFull(true);
        syncFull();
    }

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
