// ===== REYTING: kim nechinchi o'rinda - umumiy (hamma qahramonlar XP) yoki bitta qahramon bo'yicha (daraja, XP) =====
// Bosh menyudagi "Reyting" tugmasidan ochiladi. Top 50 va o'yinchining o'z o'rni
(function () {
    let el = null, tab = 'all', reqId = 0;
    const HEROES = ['knight', 'archer', 'mage', 'samurai'];
    const ICON = { knight: 'fa-shield-halved', archer: 'fa-bullseye', mage: 'fa-hat-wizard', samurai: 'fa-khanda' };
    const COLOR = { knight: '#b0bec5', archer: '#81c784', mage: '#ba68c8', samurai: '#ef5350' };
    const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    const me = () => (typeof currentUser !== 'undefined' && currentUser) ? currentUser : null;

    function heroTag(h) { return `<span class="lb-hero" style="color:${COLOR[h] || '#fff'}"><i class="fa-solid ${ICON[h] || 'fa-user'}"></i>${esc(t('char_' + h))}</span>`; }
    function rowHtml(r, mine) {
        const cls = r.rank <= 3 ? ' lb-r' + r.rank : '';
        return `<div class="lb-row${mine ? ' me' : ''}"><span class="lb-rank${cls}">${r.rank <= 3 ? '<i class="fa-solid fa-crown"></i> ' : ''}${r.rank}</span>
            <span class="lb-nick">${esc(r.nick)}</span>${heroTag(r.hero)}<span>${r.level}</span><span class="lb-xp">${fmt(r.xp)}</span></div>`;
    }
    async function load() {
        if (!el) return;
        const id = ++reqId, u = me();
        el.querySelectorAll('.lb-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
        el.querySelector('.lb-note').textContent = t(tab === 'all' ? 'lb_note_all' : 'lb_note_hero');
        const list = el.querySelector('.lb-list');
        list.innerHTML = `<div class="lb-empty">...</div>`;
        let d = null;
        try {
            d = await fetch('/api/leaderboard' + (u ? '/' + u.id : '') + '?hero=' + tab).then(r => r.json());
        } catch (e) { d = null; }
        if (!el || id !== reqId) return;   // boshqa tab tanlangan yoki oyna yopilgan
        if (!d || !d.success) { list.innerHTML = `<div class="lb-empty">${esc(t('server_unreachable'))}</div>`; return; }
        const hdr = `<div class="lb-row lb-hdr"><span>${t('lb_rank')}</span><span>${t('lb_player')}</span><span class="lb-hero">${t('lb_hero')}</span><span>${t('lb_level')}</span><span class="lb-xp">${t(tab === 'all' ? 'lb_total_xp' : 'lb_xp')}</span></div>`;
        const myId = u ? u.id : null;
        list.innerHTML = d.rows.length ? hdr + d.rows.map(r => rowHtml(r, r.id === myId)).join('') : `<div class="lb-empty">${t('lb_empty')}</div>`;
        const meBox = el.querySelector('.lb-me');
        if (!u) meBox.textContent = t('lb_guest');
        else if (d.me) meBox.textContent = t('lb_your_place').replace('{r}', d.me.rank).replace('{l}', d.me.level).replace('{x}', fmt(d.me.xp));
        else meBox.textContent = t('lb_not_ranked');
        const mineRow = list.querySelector('.lb-row.me');
        if (mineRow) mineRow.scrollIntoView({ block: 'nearest' });
    }
    function close() { if (el) { el.remove(); el = null; } }
    function open() {
        close();
        el = document.createElement('div');
        el.id = 'lb-panel';
        el.innerHTML = `<div class="lb-box">
            <div class="lb-head"><span class="lb-title"><i class="fa-solid fa-trophy"></i> ${t('lb_title')}</span><button class="lb-x"><i class="fa-solid fa-xmark"></i></button></div>
            <div class="lb-tabs">
                <button class="lb-tab" data-tab="all"><i class="fa-solid fa-globe"></i> ${t('lb_all')}</button>
                ${HEROES.map(h => `<button class="lb-tab" data-tab="${h}"><i class="fa-solid ${ICON[h]}" style="color:${COLOR[h]}"></i> ${esc(t('char_' + h))}</button>`).join('')}
            </div>
            <div class="lb-note" style="color:#9e98c4; font-size:7px; margin-bottom:8px; line-height:1.6;"></div>
            <div class="lb-list"></div>
            <div class="lb-me"></div>
        </div>`;
        el.onclick = (e) => { if (e.target === el) close(); };
        el.querySelector('.lb-x').onclick = close;
        el.querySelectorAll('.lb-tab').forEach(b => { b.onclick = () => { tab = b.dataset.tab; load(); }; });
        document.body.appendChild(el);
        load();
    }
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && el) { e.stopPropagation(); close(); } }, true);
    const btn = document.getElementById('nav-leaderboard-btn');
    if (btn) btn.onclick = open;
    window.openLeaderboard = open;
})();
