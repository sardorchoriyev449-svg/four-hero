// ===== HAMROH PUSHISTIK OYNASI: daraja, jon, holat (jangda / fermada dam olyapti), kuchaytirishlar, ekin-meva bilan davolash =====
// Bosh menyudagi "Pushistik" tugmasi va fermada dam olayotgan hamroh yonida E. Hali o'rgatilmagan bo'lsa - do'stlik progressi
(function () {
    let el = null, data = null, busy = false, skinTab = 'c';
    const lookOf = (P, over) => { const L = Object.assign({ c: P.c, h: P.h, b: P.b }, over || {}); return (L.c === 'default' ? '' : L.c || '') + '|' + (L.h || '') + '|' + (L.b || ''); };
    const me = () => (typeof currentUser !== 'undefined' && currentUser) ? currentUser : null;
    const UPS = [{ k: 'dmg', icon: 'fa-burst' }, { k: 'hp', icon: 'fa-heart' }, { k: 'spd', icon: 'fa-bolt' }];
    const art = () => window.FarmArt;
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    async function load() {
        const u = me();
        if (!u) return;
        try { data = await fetch('/api/pet/' + u.id).then(r => r.json()); } catch (e) { data = null; }
        if (data && !data.success) data = null;
        render();
    }
    const bar = (v, max, cls) => `<div class="pp-bar ${cls}"><i style="width:${Math.max(0, Math.min(100, Math.round(100 * v / Math.max(1, max))))}%"></i><span>${Math.floor(v)}/${max}</span></div>`;
    function render() {
        if (!el) return;
        const body = el.querySelector('.pp-body');
        if (!data) { body.innerHTML = `<p class="pp-note">${t('server_unreachable')}</p>`; return; }
        const A = art(), d = data, P = d.pet, tamed = d.trust >= 10;
        const img = A ? `<img class="pp-art" src="${A.critterIcon(tamed && P.resting ? 'blink' : 'sit', tamed ? lookOf(P) : '')}" alt="">` : '';
        if (!tamed) {
            body.innerHTML = `<div class="pp-top">${img}<div class="pp-info"><b>${t('pet_name')}</b><p class="pp-note">${t('pet_wild_note')}</p>
                <div class="pp-lbl">${t('pet_trust')}</div>${bar(d.trust, 10, 'trust')}</div></div>`;
            return;
        }
        const status = (P.home ? `<span class="pp-st rest"><i class="fa-solid fa-house"></i> ${t('pet_at_home')}</span>`
            : P.resting ? `<span class="pp-st rest"><i class="fa-solid fa-bed"></i> ${t('pet_resting').replace('{p}', Math.round(d.returnPct * 100))}</span>`
            : `<span class="pp-st ok"><i class="fa-solid fa-shield-heart"></i> ${t('pet_ready')}</span>`)
            + `<button class="pp-home ${P.home ? 'pp-buy' : ''}">${P.home ? '<i class="fa-solid fa-person-walking"></i> ' + t('pet_take') : '<i class="fa-solid fa-moon"></i> ' + t('pet_leave')}</button>`;
        const ups = UPS.map(({ k, icon }) => {
            const n = P.up[k], max = d.upMax, locked = n >= d.cap && n < max, price = d.prices[n];
            const dots = Array.from({ length: max }, (_, i) => `<span class="pp-dot ${i < n ? 'on' : ''}"></span>`).join('');
            const btn = n >= max ? `<button disabled>${t('pet_up_max')}</button>`
                : locked ? `<button disabled><i class="fa-solid fa-lock"></i> Lv ${2 * (n + 1)}</button>`
                : `<button class="pp-buy" data-k="${k}"><i class="fa-solid fa-coins"></i> ${price}</button>`;
            return `<div class="pp-up"><i class="fa-solid ${icon} pp-ic"></i><div class="pp-upb"><b>${t('pet_up_' + k)}</b><small>${t('pet_up_' + k + '_d')}</small><div>${dots}</div></div>${btn}</div>`;
        }).join('');
        const full = P.hp >= d.maxHp;
        const bag = d.bag.length ? d.bag.map(it => `<button class="pp-food" data-i="${it.id}" ${full ? 'disabled' : ''} title="${t('crop_' + it.id)}">
                <img src="${A ? A.cropIcon(it.id) : ''}" alt=""><span>x${it.n}</span><em>+${it.heal}</em></button>`).join('')
            : `<p class="pp-note">${t('pet_no_food')}</p>`;
        body.innerHTML = `<div class="pp-top">${img}<div class="pp-info"><b>${esc(P.name || t('pet_name'))} <span class="pp-lv">Lv ${P.lvl}</span></b>
                <div class="pp-name"><input type="text" maxlength="14" placeholder="${t('pet_name_ph')}" value="${esc(P.name || '')}"><button class="pp-rename">${t('nickname_save')}</button></div>${status}
                <div class="pp-lbl">${t('pet_hp')}</div>${bar(P.hp, d.maxHp, 'hp')}
                <div class="pp-lbl">${t('pet_xp')}</div>${P.lvl >= d.maxLevel ? bar(1, 1, 'xp').replace('1/1', 'MAX') : bar(P.xp, d.need, 'xp')}
                <p class="pp-stats"><i class="fa-solid fa-droplet"></i> ${d.dmg} &nbsp; <i class="fa-solid fa-wind"></i> ${Math.round(d.dmg * 2.2)} &nbsp; <i class="fa-solid fa-stopwatch"></i> ${(d.spitMs / 1000).toFixed(1)}s</p></div></div>
            <div class="pp-sec">${t('pet_house')}</div><p class="pp-note">${d.house ? t('pet_house_yes') : t('pet_house_no')}</p>
            <div class="pp-sec">${t('pet_feed')} <small>${full ? t('pet_full') : t('pet_feed_note')}</small></div><div class="pp-bag">${bag}</div>
            <div class="pp-sec">${t('pet_upgrades')} <small>${t('pet_up_note')}</small></div>${ups}
            <div class="pp-sec">${t('pet_look')}</div>
            <div class="pp-tabs">${['c', 'h', 'b'].map(s => `<button class="pp-tab ${s === skinTab ? 'on' : ''}" data-s="${s}">${t('pet_look_' + s)}</button>`).join('')}</div>
            <div class="pp-skins">${skinCards(d, P)}</div>`;
        body.querySelectorAll('.pp-tab').forEach(b => { b.onclick = () => { skinTab = b.dataset.s; render(); }; });
        const hb = body.querySelector('.pp-home');
        if (hb) hb.onclick = () => act(hb, 'home', { home: !P.home });
        const rn = body.querySelector('.pp-rename');
        if (rn) rn.onclick = () => act(rn, 'name', { name: body.querySelector('.pp-name input').value });
        body.querySelectorAll('.pp-skin button').forEach(b => { b.onclick = () => skin(b, b.dataset.a, b.dataset.id); });
        body.querySelectorAll('.pp-up .pp-buy').forEach(b => { b.onclick = () => act(b, 'upgrade', { kind: b.dataset.k }); });
        body.querySelectorAll('.pp-food').forEach(b => { b.onclick = () => act(b, 'feed', { item: b.dataset.i }); });
    }
    // Skin kartochkalari: rasmi (o'sha buyum kiyilgan holda), nomi, narxi / kiyish / kiyilgan
    function skinCards(d, P) {
        const A = art(), slot = skinTab, cur = P[slot] || (slot === 'c' ? 'default' : '');
        const list = (slot === 'c' ? [] : [{ id: 'none', price: 0 }]).concat(d.skins[slot] || []);
        return list.map((s) => {
            const owned = s.price === 0 || P.own.includes(slot + ':' + s.id), on = s.id === cur || (s.id === 'none' && !cur);
            const look = lookOf(P, { [slot]: s.id === 'none' ? '' : s.id });
            const btn = on ? `<button disabled><i class="fa-solid fa-check"></i></button>`
                : owned ? `<button data-a="equip" data-id="${s.id}">${t('equip_btn')}</button>`
                : `<button class="pp-buy" data-a="buy" data-id="${s.id}"><i class="fa-solid fa-coins"></i> ${s.price}</button>`;
            return `<div class="pp-skin ${on ? 'on' : ''}"><img src="${A ? A.critterIcon('sit', look) : ''}" alt=""><span>${t('petskin_' + slot + '_' + s.id)}</span>${btn}</div>`;
        }).join('');
    }
    async function skin(btn, action, id) {
        if (busy || !me() || !data) return;
        if (action === 'buy') {
            const s = (data.skins[skinTab] || []).find(x => x.id === id);
            const ok = await new Promise(r => pxConfirm(t('cos_buy_confirm').replace('{name}', t('petskin_' + skinTab + '_' + id)).replace('{price}', s ? s.price : 0), () => r(true), () => r(false)));
            if (!ok) return;
        }
        await act(btn, 'skin', { action, slot: skinTab, id });
    }
    async function act(btn, what, body) {
        if (busy || !me()) return;
        if (what === 'upgrade') {
            const price = data.prices[data.pet.up[body.kind]];
            const ok = await new Promise(r => pxConfirm(t('pet_up_confirm').replace('{u}', t('pet_up_' + body.kind)).replace('{p}', price), () => r(true), () => r(false)));
            if (!ok) return;
        }
        busy = true; btn.disabled = true;
        try {
            const r = await fetch('/api/pet/' + me().id + '/' + what, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(x => x.json());
            if (!r.success) pxAlert(tMsg(r.message || 'err_server'));
            else {
                if (typeof r.coins === 'number') { currentUser.coins = r.coins; const cb = document.getElementById('coin-balance'); if (cb) cb.innerText = r.coins; }
                if (window.GameAudio) GameAudio.sfx(what === 'feed' ? 'chomp' : what === 'skin' ? 'coin' : what === 'name' ? 'pop' : what === 'home' ? 'chirp' : 'xp');
            }
        } catch (e) { pxAlert(t('server_unreachable')); }
        busy = false;
        await load();
    }
    function close() { if (el) { el.remove(); el = null; } }
    function open() {
        if (!me()) return;
        close();
        el = document.createElement('div');
        el.id = 'pet-panel';
        el.innerHTML = `<div class="pp-box"><div class="pp-head"><span class="pp-title"><i class="fa-solid fa-dragon"></i> ${t('pet_title')}</span>
            <button class="pp-x"><i class="fa-solid fa-xmark"></i></button></div><div class="pp-body"><p class="pp-note">...</p></div></div>`;
        el.onclick = (e) => { if (e.target === el) close(); };
        el.querySelector('.pp-x').onclick = close;
        document.body.appendChild(el);
        load();
    }
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && el) { e.stopPropagation(); close(); } }, true);
    const btn = document.getElementById('nav-pet-btn');
    if (btn) btn.onclick = open;
    window.PetPanel = { open, close };
})();
