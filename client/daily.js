// ===== KUNLIK MUKOFOTLAR: 7 kunlik kirish zanjiri (7-kuni - sotib olib bo'lmaydigan EKSKLYUZIV skin) va 3 ta kunlik vazifa =====
// Bosh menyudagi "Kunlik" tugmasi; kun davomida birinchi kirishda o'zi ochiladi. Vazifa bajarilganda o'yinda xabar chiqadi
(function () {
    let el = null, data = null, busy = false;
    const ICON = { kills: 'fa-skull', bosses: 'fa-dragon', maps: 'fa-map', harvest: 'fa-seedling', fish: 'fa-fish', coins: 'fa-coins' };
    const DAYBREAK = 0xfff8e1 + 0xffab00 * 0x1000000;   // eksklyuziv skin ranglari (server/src/skins.ts - 'daybreak')
    const me = () => (typeof currentUser !== 'undefined' && currentUser) ? currentUser : null;
    const today = () => new Date().toISOString().slice(0, 10);
    const hasWork = (d) => d && (!d.claimedToday || (d.quests || []).some(q => !q.claimed && q.have >= q.need));
    function setDot() {
        const dot = document.querySelector('#nav-daily-btn .daily-dot');
        if (dot) dot.classList.toggle('hidden', !hasWork(data));
    }
    async function refresh(autoOpen) {
        const u = me();
        if (!u) return;
        try { data = await fetch('/api/daily/' + u.id).then(r => r.json()); } catch (e) { data = null; }
        if (!data || !data.success) { data = null; return; }
        setDot();
        if (el) render();
        // Kunning birinchi kirishida - o'zi ochiladi (mukofot olinmagan bo'lsa)
        let shown = null; try { shown = localStorage.getItem('dailyShown'); } catch (e) { }
        if (autoOpen && !data.claimedToday && shown !== today() + u.id) { try { localStorage.setItem('dailyShown', today() + u.id); } catch (e) { } open(); }
    }
    function fmtLeft(ms) { const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000); return h + t('daily_h') + ' ' + m + t('daily_m'); }
    function render() {
        if (!el || !data) return;
        const d = data, claimedUpTo = d.claimedToday ? d.streak : d.nextDay - 1;
        const days = [1, 2, 3, 4, 5, 6, 7].map((n) => {
            const claimed = n <= claimedUpTo, isToday = !d.claimedToday && n === d.nextDay;
            const reward = n < 7 ? `<i class="fa-solid fa-coins"></i> ${d.loginCoins[n - 1]}` : `<canvas class="daily-skin" width="64" height="48"></canvas><b>${t('daily_skin')}</b>`;
            return `<div class="daily-day ${claimed ? 'done' : ''} ${isToday ? 'today' : ''} ${n === 7 ? 'big' : ''}"><span>${t('daily_day').replace('{n}', n)}</span>${reward}${claimed ? '<i class="fa-solid fa-check daily-ok"></i>' : ''}</div>`;
        }).join('');
        const quests = (d.quests || []).map((q, i) => {
            const done = q.have >= q.need, pct = Math.min(100, Math.round(100 * q.have / q.need));
            const btn = q.claimed ? `<span class="daily-claimed"><i class="fa-solid fa-check"></i></span>`
                : `<button class="daily-claim" data-q="${i}" ${done ? '' : 'disabled'}>${t('daily_claim')}</button>`;
            return `<div class="daily-quest ${q.claimed ? 'claimed' : ''}"><i class="fa-solid ${ICON[q.type] || 'fa-star'} dq-ic"></i>
                <div class="dq-body"><div class="dq-name">${t('dq_' + q.type).replace('{n}', q.need)}</div>
                <div class="dq-bar"><i style="width:${pct}%"></i><span>${Math.min(q.have, q.need)}/${q.need}</span></div></div>
                <div class="dq-rew"><i class="fa-solid fa-coins"></i> ${q.coins}<br>+${q.xp} XP</div>${btn}</div>`;
        }).join('');
        el.querySelector('.daily-body').innerHTML = `
            <div class="daily-sec">${t('daily_login_title')} <small>${t('daily_streak').replace('{n}', d.streak)}</small></div>
            <div class="daily-days">${days}</div>
            <div class="daily-row">${d.claimedToday ? `<span class="daily-next">${t('daily_come_back').replace('{t}', fmtLeft(d.msLeft))}</span>`
                : `<button class="daily-login-btn">${t('daily_claim_day').replace('{n}', d.nextDay)}</button>`}</div>
            <p class="daily-note">${t('daily_skin_note')}</p>
            <div class="daily-sec">${t('daily_quests_title')} <small>${t('daily_reset').replace('{t}', fmtLeft(d.msLeft))}</small></div>
            ${quests}`;
        const cv = el.querySelector('.daily-skin');
        if (cv && typeof drawHero === 'function') { const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, 64, 48); drawHero(ctx, (me() && me().defaultCharacter) || 'knight', '#' + DAYBREAK.toString(16).padStart(6, '0'), null, 0, 0); }
        const lb = el.querySelector('.daily-login-btn');
        if (lb) lb.onclick = () => claimLogin(lb);
        el.querySelectorAll('.daily-claim').forEach(b => { b.onclick = () => claimQuest(b, Number(b.dataset.q)); });
    }
    function applyUser(user) {
        if (!user) return;
        if (typeof applyShopUpdate === 'function') applyShopUpdate(user);
        else if (me()) { currentUser.coins = user.coins; }
        const cb = document.getElementById('coin-balance'); if (cb && me()) cb.innerText = currentUser.coins;
    }
    async function claimLogin(btn) {
        if (busy || !me()) return;
        busy = true; btn.disabled = true;
        try {
            const r = await fetch('/api/daily/' + me().id + '/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then(x => x.json());
            if (r.success) {
                applyUser(r.user);
                if (window.GameAudio) GameAudio.sfx('win');
                const msg = r.skin ? t('daily_got_skin').replace('{h}', t('char_' + r.skin.hero)) : t('daily_got_coins').replace('{n}', r.coins).replace('{d}', r.day);
                if (typeof showTopToast === 'function') showTopToast(msg); else pxAlert(msg);
            } else if (typeof pxAlert === 'function') pxAlert(tMsg(r.message || 'err_server'));
        } catch (e) { if (typeof pxAlert === 'function') pxAlert(t('server_unreachable')); }
        busy = false;
        await refresh(false);
    }
    async function claimQuest(btn, idx) {
        if (busy || !me()) return;
        busy = true; btn.disabled = true;
        try {
            const r = await fetch('/api/daily/' + me().id + '/quest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idx }) }).then(x => x.json());
            if (r.success) { applyUser(r.user); if (window.GameAudio) GameAudio.sfx('coin'); if (typeof showTopToast === 'function') showTopToast(t('daily_quest_paid').replace('{c}', r.coins).replace('{x}', r.xp)); }
            else if (typeof pxAlert === 'function') pxAlert(tMsg(r.message || 'err_server'));
        } catch (e) { if (typeof pxAlert === 'function') pxAlert(t('server_unreachable')); }
        busy = false;
        await refresh(false);
    }
    function close() { if (el) { el.remove(); el = null; } }
    function open() {
        close();
        el = document.createElement('div');
        el.id = 'daily-panel';
        el.innerHTML = `<div class="daily-box"><div class="daily-head"><span class="daily-title"><i class="fa-solid fa-calendar-check"></i> ${t('daily_title')}</span>
            <button class="daily-x"><i class="fa-solid fa-xmark"></i></button></div><div class="daily-body"><div class="daily-note">...</div></div></div>`;
        el.onclick = (e) => { if (e.target === el) close(); };
        el.querySelector('.daily-x').onclick = close;
        document.body.appendChild(el);
        if (data) render();
        refresh(false);
    }
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && el) { e.stopPropagation(); close(); } }, true);
    const btn = document.getElementById('nav-daily-btn');
    if (btn) btn.onclick = open;
    // O'yinda vazifa bajarildi - xabar (mukofot - "Kunlik" oynasida)
    if (typeof socket !== 'undefined') socket.on('dailyQuestDone', (d) => {
        if (!d) return;
        const msg = t('daily_quest_toast').replace('{q}', t('dq_' + d.type).replace('{n}', d.need));
        if (typeof showTopToast === 'function') showTopToast(msg);
        if (data) { (data.quests || []).forEach(q => { if (q.type === d.type) q.have = Math.max(q.have, q.need); }); setDot(); }
    });
    window.Daily = { open, refresh };
})();
