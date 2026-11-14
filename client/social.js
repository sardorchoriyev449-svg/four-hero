// ===== DO'STLAR VA YUTUQLAR =====
// Do'stlar: nik bo'yicha so'rov, qabul / rad, onlayn holati, xonaga taklif (taklif kelsa - "Qo'shilish").
// Yutuqlar: ro'yxat, jarayon, tanga mukofoti; unvonli yutuqlardan birini UNVON qilib tanlash (bosh menyu, xona lobbisi, do'stlar ro'yxati)
(function () {
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    const me = () => (typeof currentUser !== 'undefined' && currentUser) ? currentUser : null;
    const toast = (msg) => { if (typeof showTopToast === 'function') showTopToast(msg); };
    const msgOf = (m) => (typeof tMsg === 'function' ? tMsg(m) : t(m));
    const inGame = () => !!(window.__game && window.__game.hero);
    async function api(path, body) {
        const u = me(); if (!u) return null;
        try {
            const r = await fetch('/api/' + path.replace('{id}', u.id), body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
            return await r.json();
        } catch (e) { return null; }
    }
    const setCoins = (c) => { const u = me(); if (u && c !== null && c !== undefined) { u.coins = c; const b = document.getElementById('coin-balance'); if (b) b.innerText = c; } };

    // ===== UNVON =====
    const titleName = (id) => id ? t('ach_title_' + id) : '';
    window.titleName = titleName;
    function paintWelcome() {
        const nick = document.getElementById('welcome-nickname');
        if (!nick) return;
        let el = document.getElementById('welcome-title');
        if (!el) { el = document.createElement('span'); el.id = 'welcome-title'; el.className = 'title-tag'; nick.insertAdjacentElement('afterend', el); }
        const u = me(), tt = u && u.title ? titleName(u.title) : '';
        el.textContent = tt; el.style.display = tt ? '' : 'none';
    }
    window.paintWelcomeTitle = paintWelcome;

    // ===== ONLAYN (lobbida ham) =====
    let helloId = null;
    const hello = () => { const u = me(); helloId = u ? u.id : null; socket.emit('hello', u && u.token ? { userId: u.id, token: u.token } : {}); };
    socket.on('connect', hello);
    let lastUser = null;
    setInterval(() => {   // kirish / chiqish / hisob almashishi
        const u = me(), id = u ? u.id : null;
        if (id !== helloId) hello();
        if (u !== lastUser) { lastUser = u; paintWelcome(); if (u) silentAchCheck(); }
        if (window.Cosmetics && Cosmetics.setCustomOutfit) Cosmetics.setCustomOutfit(u && u.customOutfit ? u.customOutfit : '');
    }, 1000);
    // kirganda: hisobdan olinadigan yutuqlar (daraja, ajdarcha, dunyo...) - shu yerda ochiladi
    async function silentAchCheck() {
        const r = await api('achievements/{id}');
        if (r && r.success) { setCoins(r.coins); (r.unlocked || []).forEach(a => announce(a)); if (r.title !== undefined && me()) { me().title = r.title; paintWelcome(); } }
    }

    // ===== DO'STLAR OYNASI =====
    let fel = null, fTimer = null, fBusy = false;
    function closeF() { if (fel) { fel.remove(); fel = null; } clearInterval(fTimer); }
    function dot(on) { return `<span class="fr-dot ${on ? 'on' : ''}"></span>`; }
    async function loadF() {
        if (!fel || fBusy) return;
        fBusy = true;
        const d = await api('friends/{id}');
        fBusy = false;
        if (!fel) return;
        const list = fel.querySelector('.lb-list');
        if (!d || !d.success) { list.innerHTML = `<div class="lb-empty">${esc(t('server_unreachable'))}</div>`; return; }
        const inRoom = typeof currentRoomId !== 'undefined' && !!currentRoomId;
        let h = '';
        if (d.incoming.length) {
            h += `<div class="fr-sec">${t('fr_requests')} (${d.incoming.length})</div>`;
            h += d.incoming.map(f => `<div class="fr-row"><span class="fr-nick">${esc(f.nickname)}${f.title ? ` <span class="title-tag">${esc(titleName(f.title))}</span>` : ''}</span>
                <span class="fr-btns"><button class="fr-ok" data-acc="${f.id}"><i class="fa-solid fa-check"></i> ${t('fr_accept')}</button><button class="fr-no" data-dec="${f.id}"><i class="fa-solid fa-xmark"></i></button></span></div>`).join('');
        }
        h += `<div class="fr-sec">${t('fr_list')} (${d.friends.length})</div>`;
        const sorted = d.friends.slice().sort((a, b) => (b.online - a.online) || a.nickname.localeCompare(b.nickname));
        h += sorted.length ? sorted.map((f) => {
            const st = f.inRoom ? t('fr_st_room').replace('{r}', f.roomName) : f.online ? t('fr_st_online') : t('fr_st_offline');
            const inv = inRoom && f.online ? `<button class="fr-inv" data-inv="${f.id}"><i class="fa-solid fa-paper-plane"></i> ${t('fr_invite')}</button>` : '';
            return `<div class="fr-row${f.online ? '' : ' off'}">${dot(f.online)}<span class="fr-nick">${esc(f.nickname)}${f.title ? ` <span class="title-tag">${esc(titleName(f.title))}</span>` : ''}<span class="fr-st">${esc(st)}</span></span>
                <span class="fr-btns">${inv}<button class="fr-del" data-del="${f.id}" data-nick="${esc(f.nickname)}" title="${esc(t('fr_remove'))}"><i class="fa-solid fa-user-minus"></i></button></span></div>`;
        }).join('') : `<div class="lb-empty">${t('fr_empty')}</div>`;
        list.innerHTML = h;
        fel.querySelector('.lb-me').textContent = t(inRoom ? 'fr_hint_room' : 'fr_hint_menu');
        list.querySelectorAll('[data-acc]').forEach(b => b.onclick = async () => { const r = await api('friends/{id}/accept', { fromId: b.dataset.acc }); if (r && !r.success) toast(msgOf(r.message)); loadF(); });
        list.querySelectorAll('[data-dec]').forEach(b => b.onclick = async () => { await api('friends/{id}/decline', { fromId: b.dataset.dec }); loadF(); });
        list.querySelectorAll('[data-del]').forEach(b => b.onclick = () => pxConfirm(t('fr_remove_confirm').replace('{n}', b.dataset.nick), async () => { await api('friends/{id}/remove', { friendId: b.dataset.del }); loadF(); }, () => { }));
        list.querySelectorAll('[data-inv]').forEach(b => b.onclick = () => { const u = me(); if (!u) return; socket.emit('friendInvite', { userId: u.id, token: u.token, to: b.dataset.inv }); b.disabled = true; setTimeout(() => { b.disabled = false; }, 5000); });
        const badge = document.querySelector('#nav-friends-btn .fr-badge');
        if (badge) badge.classList.toggle('hidden', !d.incoming.length);
    }
    async function sendReq() {
        const inp = fel && fel.querySelector('.fr-input');
        const nick = inp ? inp.value.trim() : '';
        if (!nick) return;
        const r = await api('friends/{id}/request', { nickname: nick });
        if (!r) { toast(t('server_unreachable')); return; }
        if (r.success) { toast(t(r.accepted ? 'fr_now_friends' : 'fr_req_sent').replace('{n}', r.nickname || nick)); if (inp) inp.value = ''; }
        else toast(msgOf(r.message));
        loadF();
    }
    function openFriends() {
        if (!me()) { toast(t('fr_login_first')); return; }
        closeF(); closeA();
        fel = document.createElement('div');
        fel.className = 'pxp'; fel.id = 'fr-panel';
        fel.innerHTML = `<div class="lb-box">
            <div class="lb-head"><span class="lb-title"><i class="fa-solid fa-user-group"></i> ${t('fr_title')}</span><button class="lb-x"><i class="fa-solid fa-xmark"></i></button></div>
            <div class="fr-add"><input class="fr-input" maxlength="40" placeholder="${esc(t('fr_add_ph'))}"><button class="fr-send"><i class="fa-solid fa-user-plus"></i> ${t('fr_add_btn')}</button></div>
            <div class="lb-list"><div class="lb-empty">...</div></div>
            <div class="lb-me"></div>
        </div>`;
        fel.onclick = (e) => { if (e.target === fel) closeF(); };
        fel.onkeydown = (e) => e.stopPropagation();   // yozayotganda o'yin tugmalari ishlamasin
        fel.querySelector('.lb-x').onclick = closeF;
        fel.querySelector('.fr-send').onclick = sendReq;
        fel.querySelector('.fr-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendReq(); });
        document.body.appendChild(fel);
        loadF();
        fTimer = setInterval(loadF, 10000);
    }
    window.openFriends = openFriends;

    // xona ichida: taklif yuborildi / yuborilmadi
    socket.on('friendInviteSent', (d) => { if (d) toast(d.ok ? t('fr_invite_sent') : msgOf(d.message)); });
    socket.on('friendReq', (d) => {
        toast(t('fr_req_toast').replace('{n}', d && d.from ? d.from : '?'));
        const badge = document.querySelector('#nav-friends-btn .fr-badge'); if (badge) badge.classList.remove('hidden');
        if (fel) loadF();
    });
    socket.on('friendAccepted', (d) => { toast(t('fr_now_friends').replace('{n}', d && d.nickname ? d.nickname : '?')); if (fel) loadF(); });
    // TAKLIF KELDI: o'yinda bo'lsa - faqat xabar (kod bilan), aks holda - "Qo'shilasizmi?"
    function joinByCode(code) {
        const u = me(); if (!u) return;
        const go = () => socket.emit('joinRoomByCode', { roomCode: code, userId: u.id, token: u.token, nickname: u.nickname, clientId: typeof CLIENT_ID !== 'undefined' ? CLIENT_ID : '' });
        if (typeof currentRoomId !== 'undefined' && currentRoomId) {
            if (currentRoomId === code) return;
            const lb = document.getElementById('leave-lobby-btn');
            if (lb && typeof lb.onclick === 'function') lb.onclick(); else socket.emit('leaveRoom');
            setTimeout(go, 500);
        } else go();
        closeF();
    }
    socket.on('friendInvite', (d) => {
        if (!d || !d.code) return;
        if (inGame()) { toast(t('fr_invite_ingame').replace('{n}', d.from).replace('{c}', d.code)); return; }
        pxConfirm(t('fr_invite_ask').replace('{n}', d.from).replace('{r}', d.roomName || d.code), () => joinByCode(d.code), () => { });
    });

    // ===== YUTUQLAR OYNASI =====
    let ael = null;
    function closeA() { if (ael) { ael.remove(); ael = null; } }
    function announce(a) {
        toast(t('ach_unlocked').replace('{n}', t('ach_' + a.id)).replace('{c}', fmt(a.coins)));
        if (typeof sfx === 'function') { try { sfx('win'); } catch (e) { } }
        if (ael) loadA();
    }
    async function setTitle(id) {
        const r = await api('achievements/{id}/title', { id });
        if (r && r.success) { if (me()) me().title = r.title || ''; paintWelcome(); toast(t(id ? 'ach_title_set' : 'ach_title_cleared').replace('{t}', titleName(id))); loadA(); }
        else if (r) toast(msgOf(r.message));
    }
    async function loadA() {
        if (!ael) return;
        const d = await api('achievements/{id}');
        if (!ael) return;
        const list = ael.querySelector('.lb-list');
        if (!d || !d.success) { list.innerHTML = `<div class="lb-empty">${esc(t('server_unreachable'))}</div>`; return; }
        setCoins(d.coins); (d.unlocked || []).forEach(a => toast(t('ach_unlocked').replace('{n}', t('ach_' + a.id)).replace('{c}', fmt(a.coins))));
        if (me()) { me().title = d.title || ''; paintWelcome(); }
        const done = d.list.filter(a => a.done).length;
        ael.querySelector('.lb-me').innerHTML = `${t('ach_count').replace('{a}', done).replace('{b}', d.list.length)}${d.title ? ` &middot; ${t('ach_cur_title')}: <span class="title-tag">${esc(titleName(d.title))}</span> <button class="ach-clear">${t('ach_clear_title')}</button>` : ''}`;
        const clr = ael.querySelector('.ach-clear'); if (clr) clr.onclick = () => setTitle('');
        const order = d.list.slice().sort((a, b) => (b.done - a.done) || (b.have / b.need - a.have / a.need));
        list.innerHTML = `<div class="ach-grid">${order.map((a) => {
            const pct = Math.round(100 * Math.min(1, a.have / a.need));
            const tBtn = a.title ? (a.done ? (d.title === a.id ? `<span class="ach-cur">${t('ach_using')}</span>` : `<button class="ach-use" data-t="${a.id}">${t('ach_use_title')}</button>`) : `<span class="ach-tt">${t('ach_gives_title')}</span>`) : '';
            return `<div class="ach-card${a.done ? ' done' : ''}">
                <div class="ach-ico"><i class="fa-solid ${a.done ? 'fa-trophy' : 'fa-lock'}"></i></div>
                <div class="ach-body"><div class="ach-name">${esc(t('ach_' + a.id))}</div>
                <div class="ach-desc">${esc(t('ach_d_' + a.stat).replace('{n}', fmt(a.need)))}</div>
                ${a.done ? '' : `<div class="ach-bar"><span style="width:${pct}%"></span></div><div class="ach-prog">${fmt(a.have)} / ${fmt(a.need)}</div>`}
                <div class="ach-rew"><i class="fa-solid fa-coins"></i> ${fmt(a.coins)}${a.title ? ` &middot; <span class="title-tag">${esc(titleName(a.id))}</span>` : ''} ${tBtn}</div></div></div>`;
        }).join('')}</div>`;
        list.querySelectorAll('.ach-use').forEach(b => b.onclick = () => setTitle(b.dataset.t));
    }
    function openAch() {
        if (!me()) { toast(t('fr_login_first')); return; }
        closeA(); closeF();
        ael = document.createElement('div');
        ael.className = 'pxp'; ael.id = 'ach-panel';
        ael.innerHTML = `<div class="lb-box">
            <div class="lb-head"><span class="lb-title"><i class="fa-solid fa-medal"></i> ${t('ach_title')}</span><button class="lb-x"><i class="fa-solid fa-xmark"></i></button></div>
            <div class="lb-note" style="color:#9e98c4; font-size:7px; margin-bottom:8px; line-height:1.6;">${t('ach_note')}</div>
            <div class="lb-list"><div class="lb-empty">...</div></div>
            <div class="lb-me"></div>
        </div>`;
        ael.onclick = (e) => { if (e.target === ael) closeA(); };
        ael.querySelector('.lb-x').onclick = closeA;
        document.body.appendChild(ael);
        loadA();
    }
    window.openAchievements = openAch;
    socket.on('achUnlocked', (d) => { if (d && Array.isArray(d.list)) d.list.forEach(announce); });

    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && (fel || ael)) { e.stopPropagation(); closeF(); closeA(); } }, true);
    const fb = document.getElementById('nav-friends-btn'); if (fb) fb.onclick = openFriends;
    const ab = document.getElementById('nav-ach-btn'); if (ab) ab.onclick = openAch;
    const lfb = document.getElementById('lobby-friends-btn'); if (lfb) lfb.onclick = openFriends;
})();
