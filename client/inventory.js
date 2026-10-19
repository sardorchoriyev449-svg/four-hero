// ===== INVENTAR: yig'ilgan narsalar (My Farm hosili, tutilgan baliqlar, asboblar) =====
// Bosh menyudan ("Inventar") va o'yin ichidan (I tugmasi / o'ng yuqoridagi sumka) ochiladi.
// Keraksizini tanlab sotish mumkin - bozordagi narxda (ekin - meva elfi narxi, baliq - o'z narxi)
(function () {
    let el = null, inv = null, tab = 'all', selCrops = {}, selFish = new Set(), focusCrop = null, busy = false;
    const $ = (sel) => el && el.querySelector(sel);
    const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const art = () => window.FarmArt;

    // Bugungi taklif: shu mahsulotlar 2x narxda sotiladi
    const mul = (id) => (inv && (inv.offer || []).includes(id)) ? 2 : 1;
    const cropPrice = (id) => ((inv.prices || {})[id] || 0) * mul(id);
    function selTotal() {
        let n = 0, c = 0;
        Object.keys(selCrops).forEach((k) => { n += selCrops[k]; c += selCrops[k] * cropPrice(k); });
        inv.fish.forEach((f) => { if (selFish.has(f.u)) { n++; c += f.v * mul(f.f); } });
        return { n, c };
    }
    function slot(cls, icon, badge, sub, data, selected, title) {
        return `<button class="inv-slot ${cls} ${selected ? 'sel' : ''}" ${data} title="${esc(title)}">
            <img src="${icon}" alt="">${badge !== '' ? `<span class="inv-badge">${badge}</span>` : ''}${sub ? `<span class="inv-sub">${sub}</span>` : ''}</button>`;
    }
    function render() {
        if (!el) return;
        const body = $('.inv-body');
        if (!inv) { body.innerHTML = `<div class="inv-empty">...</div>`; return; }
        el.querySelectorAll('.inv-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
        $('.inv-coins').textContent = inv.coins;
        // Ferma darajasi, inventar sig'imi va bugungi taklif
        const used = Object.values(inv.crops).reduce((a, x) => a + x, 0) + inv.fish.length;
        const [x0, x1] = inv.levelXp || [0, 1], frac = x1 > x0 ? Math.min(1, (inv.farmXp - x0) / (x1 - x0)) : 1;
        const offerHtml = (inv.offer || []).map(id => `<img src="${['perch', 'carp', 'pike', 'catfish'].includes(id) ? art().fishIcon(id) : art().cropIcon(id)}" alt="">${t(['perch', 'carp', 'pike', 'catfish'].includes(id) ? 'fish_' + id : 'crop_' + id)}`).join(' ');
        $('.inv-farm').innerHTML = `<span class="inv-lv">${t('inv_farm_lv').replace('{l}', inv.farmLevel || 0)}</span><span class="inv-xpbar"><i style="width:${Math.round(frac * 100)}%"></i></span>
            <span class="${used >= inv.cap ? 'inv-full' : ''}">${t('inv_cap').replace('{u}', used).replace('{c}', inv.cap)}</span>
            <span class="inv-offer">${t('mf_offer')}: ${offerHtml} <b>x2</b></span>`;
        const A = art(), slots = [];
        if (tab === 'all' || tab === 'crops') Object.keys(inv.crops).forEach((id) => {
            const n = inv.crops[id];
            slots.push(slot('crop' + (mul(id) > 1 ? ' offer' : ''), A.cropIcon(id), n, (selCrops[id] ? '✓' + selCrops[id] : ''), `data-crop="${id}"`, !!selCrops[id] || focusCrop === id, t('crop_' + id)));
        });
        if (tab === 'all' || tab === 'fish') inv.fish.slice().sort((a, b) => b.v - a.v).forEach((f) => {
            slots.push(slot('fish' + (mul(f.f) > 1 ? ' offer' : ''), A.fishIcon(f.f), '', f.kg + 'kg', `data-fish="${esc(f.u)}"`, selFish.has(f.u), t('fish_' + f.f) + ' · ' + f.kg + ' kg · ' + f.v * mul(f.f)));
        });
        if (tab === 'all' || tab === 'tools') {
            const U = 20, dur = (n) => (U - (n || 0)) + '/' + U;   // udochka/setka 20 marta ishlatilgach sinadi
            if (inv.rod) slots.push(slot('tool', A.rodIcon(), '', dur(inv.rodUses), 'data-tool="rod"', false, t('item_rod') + ' · ' + dur(inv.rodUses)));
            if (inv.net) slots.push(slot('tool', A.netIcon(), '', dur(inv.netUses), 'data-tool="net"', false, t('item_net') + ' · ' + dur(inv.netUses)));
            if (inv.fert) slots.push(slot('tool', A.fertIcon(), inv.fert, '', 'data-tool="fert"', false, t('item_fert')));
            if (inv.water) slots.push(slot('tool', A.waterIcon(), inv.water, '', 'data-tool="water"', false, t('item_water')));
        }
        body.innerHTML = slots.length ? `<div class="inv-grid">${slots.join('')}</div>` : `<div class="inv-empty">${t('inv_empty')}</div>`;
        body.querySelectorAll('.inv-slot').forEach((b) => { b.onclick = () => onSlot(b); });
        renderInfo();
    }
    // Pastki qism: tanlangan narsa haqida (ekinda - nechta sotish), jami va tugmalar
    function renderInfo() {
        const info = $('.inv-info');
        let html = '';
        if (focusCrop && inv.crops[focusCrop]) {
            const have = inv.crops[focusCrop], n = selCrops[focusCrop] || 0, price = cropPrice(focusCrop);
            html = `<div class="inv-line"><img src="${art().cropIcon(focusCrop)}" alt=""><b>${t('crop_' + focusCrop)}</b> ×${have}
                <span class="inv-muted">${t('inv_each').replace('{c}', price)}</span>
                <span class="inv-qty"><button data-q="-1">-</button><b>${n}</b><button data-q="1">+</button><button data-q="all">${t('inv_all')}</button></span></div>`;
        }
        const tot = selTotal();
        $('.inv-detail').innerHTML = html;
        el.querySelectorAll('.inv-qty button').forEach((b) => { b.onclick = () => {
            const have = inv.crops[focusCrop], cur = selCrops[focusCrop] || 0;
            const n = b.dataset.q === 'all' ? (cur === have ? 0 : have) : Math.max(0, Math.min(have, cur + Number(b.dataset.q)));
            if (n) selCrops[focusCrop] = n; else delete selCrops[focusCrop];
            render();
        }; });
        info.textContent = tot.n ? t('inv_selected').replace('{n}', tot.n).replace('{c}', tot.c) : t('inv_hint');
        $('.inv-sell').disabled = !tot.n || busy;
        $('.inv-clear').disabled = !tot.n;
        const anything = Object.keys(inv.crops).length || inv.fish.length;
        $('.inv-sell-all').disabled = !anything || busy;
    }
    function onSlot(b) {
        if (b.dataset.tool) { if (typeof showTopToast === 'function') showTopToast(t('inv_not_for_sale')); return; }
        if (b.dataset.crop) {
            const id = b.dataset.crop;
            if (focusCrop !== id) { focusCrop = id; if (!selCrops[id]) selCrops[id] = inv.crops[id]; }
            else if (selCrops[id]) { delete selCrops[id]; focusCrop = null; }
            else selCrops[id] = inv.crops[id];
        } else if (b.dataset.fish) {
            const u = b.dataset.fish;
            if (selFish.has(u)) selFish.delete(u); else selFish.add(u);
        }
        if (window.GameAudio) GameAudio.sfx('click');
        render();
    }
    async function load() {
        if (!currentUser) return;
        try {
            const d = await fetch('/api/inventory/' + currentUser.id).then(r => r.json());
            if (!d.success) { close(); pxAlert(tMsg(d.message)); return; }
            inv = d;
            // Bazada endi yo'q narsalar tanlovdan chiqadi
            Object.keys(selCrops).forEach((k) => { if (!inv.crops[k]) delete selCrops[k]; else selCrops[k] = Math.min(selCrops[k], inv.crops[k]); });
            const have = new Set(inv.fish.map(f => f.u));
            [...selFish].forEach((u) => { if (!have.has(u)) selFish.delete(u); });
            if (focusCrop && !inv.crops[focusCrop]) focusCrop = null;
            render();
        } catch (e) { if (el) $('.inv-body').innerHTML = `<div class="inv-empty">${t('server_unreachable')}</div>`; }
    }
    function sell(all) {
        const tot = selTotal();
        let n = tot.n, c = tot.c;
        if (all) {
            n = Object.values(inv.crops).reduce((a, x) => a + x, 0) + inv.fish.length;
            c = Object.keys(inv.crops).reduce((a, k) => a + inv.crops[k] * cropPrice(k), 0) + inv.fish.reduce((a, f) => a + f.v * mul(f.f), 0);
        }
        if (!n || busy) return;
        pxConfirm(t('inv_sell_q').replace('{n}', n).replace('{c}', c), async () => {
            busy = true; renderInfo();
            const body = all ? { all: true } : { crops: selCrops, fish: [...selFish] };
            try {
                const d = await fetch('/api/inventory/' + currentUser.id + '/sell', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
                if (d.success) {
                    if (window.GameAudio) GameAudio.sfx('coin');
                    currentUser.coins = d.coins;
                    try { localStorage.setItem('gameUser', JSON.stringify(currentUser)); } catch (e) { }
                    ['coin-balance', 'character-coin-balance'].forEach((id) => { const x = document.getElementById(id); if (x) x.innerText = d.coins; });
                    if (typeof window.onCoinsGained === 'function') window.onCoinsGained(d.earned);
                    if (typeof showTopToast === 'function') showTopToast(t('inv_sold').replace('{c}', d.earned) + (d.xp ? '  +' + d.xp + ' XP' : ''));
                    // Menyuda bo'lsa - qahramon darajasi/XP chizig'i yangilansin
                    const gw = document.getElementById('game-wrapper');
                    if (d.xp && typeof loadMenuStats === 'function' && (!gw || gw.classList.contains('hidden'))) loadMenuStats();
                    selCrops = {}; selFish = new Set(); focusCrop = null;
                } else if (d.message === 'inv_changed' && typeof showTopToast === 'function') showTopToast(t('inv_changed'));   // boshqa joyda o'zgargan - yangilanadi
                else pxAlert(t(d.message) !== d.message ? t(d.message) : tMsg(d.message));
            } catch (e) { pxAlert(t('server_unreachable')); }
            busy = false;
            load();
        });
    }
    // Ochiq paytda klaviatura o'yinga (yurish, hujum) bormaydi; Esc / I - yopish
    function onKey(e) {
        if (document.getElementById('px-dialog')) return;
        e.stopImmediatePropagation();
        if (e.key === 'Escape' || e.key === 'i' || e.key === 'I') { e.preventDefault(); close(); }
    }
    function close() {
        if (!el) return;
        window.removeEventListener('keydown', onKey, true);
        el.remove(); el = null;
    }
    function open() {
        if (el) { close(); return; }
        if (!currentUser) { pxAlert(t('inv_need_login')); return; }
        el = document.createElement('div');
        el.id = 'inv-panel';
        el.innerHTML = `<div class="inv-box" role="dialog" aria-modal="true">
            <div class="inv-head"><span class="inv-title"><i class="fa-solid fa-bag-shopping"></i> ${t('inv_title')}</span>
                <span class="inv-coinbox"><i class="fa-solid fa-coins"></i> <span class="inv-coins">${currentUser.coins || 0}</span></span>
                <button class="inv-x" aria-label="close"><i class="fa-solid fa-xmark"></i></button></div>
            <div class="inv-farm"></div>
            <div class="inv-tabs">${['all', 'crops', 'fish', 'tools'].map(k => `<button class="inv-tab" data-tab="${k}">${t('inv_tab_' + k)}</button>`).join('')}</div>
            <div class="inv-body"></div>
            <div class="inv-detail"></div>
            <div class="inv-foot"><span class="inv-info"></span>
                <button class="inv-clear">${t('inv_clear')}</button>
                <button class="inv-sell-all">${t('inv_sell_all')}</button>
                <button class="inv-sell"><i class="fa-solid fa-coins"></i> ${t('inv_sell')}</button></div>
        </div>`;
        el.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (e.target === el) close(); });
        $('.inv-x').onclick = close;
        el.querySelectorAll('.inv-tab').forEach((b) => { b.onclick = () => { tab = b.dataset.tab; render(); }; });
        $('.inv-clear').onclick = () => { selCrops = {}; selFish = new Set(); focusCrop = null; render(); };
        $('.inv-sell').onclick = () => sell(false);
        $('.inv-sell-all').onclick = () => sell(true);
        document.body.appendChild(el);
        window.addEventListener('keydown', onKey, true);
        inv = null; selCrops = {}; selFish = new Set(); focusCrop = null;
        render();
        load();
    }
    window.openInventory = open;
    window.closeInventory = close;
    // O'yin ichida: I tugmasi (matn yozilayotganda yoki boshqa oyna ochiq bo'lsa - yo'q)
    window.addEventListener('keydown', (e) => {
        if (el || (e.key !== 'i' && e.key !== 'I') || e.repeat) return;
        const gw = document.getElementById('game-wrapper');
        if (!gw || gw.classList.contains('hidden')) return;
        const a = document.activeElement;
        if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) return;
        if (document.getElementById('px-dialog') || document.getElementById('shop-panel') || document.getElementById('pause-menu')) return;
        open();
    });
    // Bosh menyudagi tugma
    const btn = document.getElementById('nav-inventory-btn');
    if (btn) btn.onclick = open;
})();
