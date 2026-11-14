// ===== GARDEROB: qahramon ko'rinishini sozlash uchun alohida oyna =====
// Chapda - katta jonli ko'rinish (doim ko'rinib turadi), o'ngda - turkumlar: tana skinlari, qurol rangi, bosh kiyimi,
// yuz buyumi va shu qahramonning qurol ko'rinishlari. Kartochkani bosish - KIYIB KO'RISH (sotib olishdan oldin ham),
// tugma - sotib olish / kiyish. Sotib olish va kiyish lobby.js dagi o'sha funksiyalar orqali (server bir xil)
(function () {
    let el = null, cat = 'skin', tryOn = null, busy = false;
    const hex = (c) => '#' + c.toString(16).padStart(6, '0');
    const skinPacked = (s) => '#' + (s.color + (s.accent || 0) * 0x1000000).toString(16).padStart(6, '0');
    const hero = () => selectedCharTab;
    const cats = () => ['skin', 'wskin', ...cosSlotsFor(hero())];
    const catLabel = (c) => c === 'skin' ? t('char_skins_title') : c === 'wskin' ? t('wd_cat_wskin') : t('slot_' + c);
    const catIcon = { skin: 'fa-shirt', wskin: 'fa-palette', head: 'fa-hat-cowboy', face: 'fa-glasses', body: 'fa-vest' };
    const coinsHtml = (n) => `<i class="fa-solid fa-coins"></i> ${n}`;
    // Sotib olishdan oldin tasdiq (narxlar 10 000 gacha - adashib bosilsa pul ketib qolmasin)
    const confirmBuy = (name, price) => new Promise(r => pxConfirm(t('cos_buy_confirm').replace('{name}', name).replace('{price}', price), () => r(true), () => r(false)));

    function equippedSkin(type) {
        const id = (currentUser.equippedSkins && currentUser.equippedSkins[type]) || 'default';
        const list = (skinCatalog && skinCatalog[type]) || [];
        return list.find(s => s.id === id) || list[0];
    }
    function equippedWSkin(type) {
        const id = (currentUser.equippedWeaponSkins && currentUser.equippedWeaponSkins[type]) || 'default';
        const list = (weaponSkinCatalog && weaponSkinCatalog[type]) || [];
        return list.find(s => s.id === id) || list[0];
    }
    // Ko'rinish: kiyilganlar + hozir kiyib ko'rilayotgan buyum
    function drawPreview() {
        const cv = el && el.querySelector('#wd-preview');
        if (!cv) return;
        const type = hero(), ctx = cv.getContext('2d');
        let body = equippedSkin(type), look = Object.assign({}, (currentUser.equippedCosmetics || {})[type] || {});
        if (tryOn && tryOn.cat === 'skin') body = (skinCatalog[type] || []).find(s => s.id === tryOn.id) || body;
        else if (tryOn && tryOn.cat !== 'wskin') { if (tryOn.id) look[tryOn.cat] = tryOn.id; else delete look[tryOn.cat]; }
        ctx.clearRect(0, 0, 64, 48);
        drawHero(ctx, type, body ? skinPacked(body) : '#1e88e5', look, 0, 0);
        // Qurol rangi: ko'rinish ostidagi chiziq va yozuv (kiyib ko'rilayotgan yoki kiyilgani)
        const ws = tryOn && tryOn.cat === 'wskin' ? (weaponSkinCatalog[type] || []).find(s => s.id === tryOn.id) : equippedWSkin(type);
        const bar = el.querySelector('.wd-wcolor');
        if (bar && ws) bar.innerHTML = `<span class="skin-swatch" style="background:${hex(ws.color)}"></span>${tSkinName('wskin', type, ws)}${ws.wfx ? ' <span class="skin-tag legendary">' + t('skin_rarity_unique') + '</span>' : ''}`;
        const note = el.querySelector('.wd-try');
        if (note) {
            const name = tryOn ? itemName(tryOn.cat, tryOn.id) : '';
            note.innerHTML = tryOn ? `<span>${t('wd_trying')}: <b>${name}</b></span><button class="wd-reset">${t('wd_reset')}</button>` : `<span>${t('wd_hint')}</span>`;
            const rb = note.querySelector('.wd-reset');
            if (rb) rb.onclick = () => { tryOn = null; render(); };
        }
    }
    function itemName(c, id) {
        const type = hero();
        if (c === 'skin') { const s = (skinCatalog[type] || []).find(x => x.id === id); return s ? tSkinName('skin', type, s) : id; }
        if (c === 'wskin') { const s = (weaponSkinCatalog[type] || []).find(x => x.id === id); return s ? tSkinName('wskin', type, s) : id; }
        if (!id) return t('wd_none');
        const it = cosItems(c).find(x => x.id === id);
        return it ? cosName(c, it) : id;
    }
    const cosItems = (c) => c === 'head' ? cosCatalog.head : c === 'face' ? cosCatalog.face : c === 'body' ? (cosCatalog.body || []) : ((cosCatalog.weapons[hero()] || {})[c] || []);

    // Bitta amal (sotib olish/kiyish): tugma "band", tugagach oyna yangilanadi
    async function act(btn, fn) {
        if (busy) return;
        busy = true;
        try { await withBusy(btn, fn); } finally { busy = false; tryOn = null; render(); }
    }
    function card(opts) {
        const c = document.createElement('div');
        c.className = 'wd-card' + (opts.equipped ? ' equipped' : '') + (opts.trying ? ' trying' : '') + (opts.owned ? ' owned' : '');
        c.appendChild(opts.icon);
        const nm = document.createElement('div');
        nm.className = 'cos-name';
        nm.innerHTML = opts.name + (opts.tag || '');
        if (opts.title) c.title = opts.title;
        c.appendChild(nm);
        const b = document.createElement('button');
        if (opts.equipped) { b.className = 'skin-equip-btn equipped'; b.innerHTML = opts.canRemove ? t('remove_btn') : `${t('equipped_label')} <i class="fa-solid fa-check"></i>`; if (opts.canRemove) b.onclick = (e) => { e.stopPropagation(); act(b, opts.remove); }; else b.disabled = true; }
        else if (opts.owned) { b.className = 'skin-equip-btn'; b.innerText = t('equip_btn'); b.onclick = (e) => { e.stopPropagation(); act(b, opts.equip); }; }
        else if (opts.locked) { b.className = 'skin-buy-btn'; b.innerHTML = `<i class="fa-solid fa-lock"></i> ${opts.locked}`; b.disabled = true; }
        else { b.className = 'skin-buy-btn'; b.innerHTML = coinsHtml(opts.price); b.onclick = (e) => { e.stopPropagation(); act(b, opts.buy); }; }
        c.appendChild(b);
        c.onclick = () => { tryOn = opts.tryKey; render(); };
        return c;
    }
    function renderGrid(grid) {
        const type = hero();
        grid.innerHTML = '';
        if (cat === 'skin') {
            const owned = (currentUser.ownedSkins && currentUser.ownedSkins[type]) || ['default'];
            const eq = equippedSkin(type);
            (skinCatalog[type] || []).forEach((s) => {
                const cv = document.createElement('canvas'); cv.width = 64; cv.height = 48; cv.className = 'wd-hero-icon';
                drawHero(cv.getContext('2d'), type, skinPacked(s), null, 0, 0);
                grid.appendChild(card({
                    icon: cv, name: tSkinName('skin', type, s), title: s.fx ? t('skinfx_' + s.fx) : '',
                    tag: s.rarity ? `<br><span class="skin-tag ${s.rarity}">${t('skin_rarity_' + s.rarity)}</span>` : '',
                    equipped: eq && eq.id === s.id, owned: owned.includes(s.id), price: s.price, locked: s.exclusive && !owned.includes(s.id) ? t('skin_day7') : '',
                    trying: tryOn && tryOn.cat === 'skin' && tryOn.id === s.id, tryKey: { cat: 'skin', id: s.id },
                    equip: () => equipSkin(type, s.id), buy: async () => { if (await confirmBuy(tSkinName('skin', type, s), s.price)) await buySkin(type, s.id); }
                }));
            });
            return;
        }
        if (cat === 'wskin') {
            const owned = (currentUser.ownedWeaponSkins && currentUser.ownedWeaponSkins[type]) || ['default'];
            const eq = equippedWSkin(type);
            (weaponSkinCatalog[type] || []).forEach((s) => {
                const sw = document.createElement('div'); sw.className = 'wd-swatch';
                sw.style.background = hex(s.color);
                if (s.wfx) sw.classList.add('fx-' + s.wfx);
                grid.appendChild(card({
                    icon: sw, name: tSkinName('wskin', type, s), title: s.wfx ? t('wfx_' + s.wfx) : '',
                    tag: s.wfx ? `<br><span class="skin-tag legendary">${t('skin_rarity_unique')}</span>` : '',
                    equipped: eq && eq.id === s.id, owned: owned.includes(s.id), price: s.price,
                    trying: tryOn && tryOn.cat === 'wskin' && tryOn.id === s.id, tryKey: { cat: 'wskin', id: s.id },
                    equip: () => equipWeaponSkin(type, s.id), buy: async () => { if (await confirmBuy(tSkinName('wskin', type, s), s.price)) await buyWeaponSkin(type, s.id); }
                }));
            });
            return;
        }
        const owned = currentUser.ownedCosmetics || [];
        const eqId = ((currentUser.equippedCosmetics || {})[type] || {})[cat];
        cosItems(cat).forEach((it) => {
            const cv = document.createElement('canvas'); cv.width = 44; cv.height = 36; cv.className = 'cos-icon';
            Cosmetics.drawIcon(cv, cat, it.id);
            const isMaker = cat === 'body' && it.id === 'custom', mine = owned.includes(cosKey(type, cat, it.id));
            const cEl = card({
                icon: cv, name: cosName(cat, it), equipped: eqId === it.id, canRemove: true, owned: owned.includes(cosKey(type, cat, it.id)), price: it.price,
                locked: it.secret && !owned.includes(cosKey(type, cat, it.id)) ? t('cos_secret_lock') : '',   // o'yinda topiladi (sotilmaydi)
                trying: tryOn && tryOn.cat === cat && tryOn.id === it.id, tryKey: { cat, id: it.id },
                equip: () => equipCosmetic(type, cat, it.id), remove: () => equipCosmetic(type, cat, null), buy: () => buyCosmetic(type, cat, it)
            });
            if (isMaker && mine) {   // KIYIM KONSTRUKTORI: o'z kiyimini yig'ish
                const eb = document.createElement('button'); eb.className = 'skin-equip-btn om-edit'; eb.innerHTML = '<i class="fa-solid fa-palette"></i> ' + t('om_edit');
                eb.onclick = (e) => { e.stopPropagation(); openMaker(); };
                cEl.appendChild(eb);
            }
            grid.appendChild(cEl);
        });
    }
    // ===== KIYIM KONSTRUKTORI =====
    function openMaker() {
        const OM = Cosmetics.OM, type = hero(), skin = equippedSkin(type), packed = parseInt((skin ? skinPacked(skin) : '#1e88e5').slice(1), 16);
        let d = (Cosmetics.omParse(currentUser.customOutfit) || Cosmetics.omParse(OM.def)).slice();
        const code = () => Cosmetics.omCode(d);
        const box = document.createElement('div'); box.id = 'om-panel';
        const sw = (k) => `<div class="om-sw" data-k="${k}">${OM.pal.map((c, i) => `<button class="om-c" data-v="${i}" style="background:#${c.toString(16).padStart(6, '0')}"></button>`).join('')}</div>`;
        const opts = (k, n, pre) => `<div class="om-opts" data-k="${k}">${Array.from({ length: n }, (_, i) => `<button class="om-o" data-v="${i}">${t(pre + i)}</button>`).join('')}</div>`;
        const sec = (label, html) => `<div class="om-l">${t(label)}</div>${html}`;
        box.innerHTML = `<div class="om-box">
            <div class="om-head"><span class="om-title"><i class="fa-solid fa-palette"></i> ${t('om_title')}</span><button class="om-x"><i class="fa-solid fa-xmark"></i></button></div>
            <div class="om-body"><div class="om-left"><canvas id="om-front" width="64" height="58"></canvas><canvas id="om-walk" width="64" height="58"></canvas></div>
            <div class="om-right">
                <div class="om-tabs"><button class="om-tab on" data-tab="top">${t('om_tab_top')}</button><button class="om-tab" data-tab="bottom">${t('om_tab_bottom')}</button><button class="om-tab" data-tab="extra">${t('om_tab_extra')}</button></div>
                <div class="om-page" data-page="top">${sec('om_top', sw(0))}${sec('om_pattern', opts(1, OM.patterns, 'om_pat_'))}${sec('om_pcolor', sw(2))}${sec('om_sleeves', opts(7, OM.sleeves, 'om_sl_'))}</div>
                <div class="om-page hidden" data-page="bottom">${sec('om_bottom', opts(3, OM.bottoms, 'om_bot_'))}${sec('om_bcolor', sw(4))}</div>
                <div class="om-page hidden" data-page="extra">${sec('om_neck', opts(6, OM.necks, 'om_neck_'))}${sec('om_ncolor', sw(10))}${sec('om_belt', opts(8, OM.belts, 'om_belt_'))}${sec('om_shoe_t', opts(9, OM.shoes, 'om_sh_'))}${sec('om_shoes', sw(5))}</div>
            </div></div>
            <div class="om-foot"><button class="om-rand"><i class="fa-solid fa-dice"></i> ${t('om_random')}</button><button class="om-cancel">${t('om_cancel')}</button><button class="om-save"><i class="fa-solid fa-check"></i> ${t('om_save')}</button></div>
        </div>`;
        document.body.appendChild(box);
        const cf = box.querySelector('#om-front').getContext('2d'), cw = box.querySelector('#om-walk').getContext('2d'), FR = [2, 3, 4, 5];
        let fi = 0;
        const draw = (ctx, f) => { ctx.clearRect(0, 0, 64, 58); ctx.imageSmoothingEnabled = false; ctx.drawImage(Cosmetics.heroCanvas(packed, f, code()), 0, 0); };
        const paint = () => { box.querySelectorAll('[data-k]').forEach((row) => { const k = +row.dataset.k; row.querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.v === d[k])); }); draw(cf, 0); };
        const tick = () => { if (!box.isConnected) return; draw(cw, FR[fi % FR.length]); fi++; };
        const timer = setInterval(tick, 200);
        box.querySelectorAll('[data-k] button').forEach(b => b.onclick = () => { d[+b.parentNode.dataset.k] = +b.dataset.v; paint(); tick(); });
        box.querySelectorAll('.om-tab').forEach(b => b.onclick = () => { box.querySelectorAll('.om-tab').forEach(x => x.classList.toggle('on', x === b)); box.querySelectorAll('.om-page').forEach(pg => pg.classList.toggle('hidden', pg.dataset.page !== b.dataset.tab)); });
        const closeM = () => { clearInterval(timer); box.remove(); };
        box.querySelector('.om-x').onclick = box.querySelector('.om-cancel').onclick = closeM;
        box.onclick = (e) => { if (e.target === box) closeM(); };
        box.querySelector('.om-rand').onclick = () => { const r = (n) => Math.floor(Math.random() * n); d = [r(32), r(OM.patterns), r(32), r(OM.bottoms), r(32), r(32), r(OM.necks), r(OM.sleeves), r(OM.belts), r(OM.shoes), r(32)]; paint(); tick(); };
        box.querySelector('.om-save').onclick = async () => {
            const btn = box.querySelector('.om-save'); btn.disabled = true;
            try {
                const r = await fetch('/api/outfit/' + currentUser.id, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code(), characterType: type }) }).then(x => x.json());
                if (r && r.success && r.user) {
                    Object.assign(currentUser, r.user);
                    Cosmetics.setCustomOutfit(currentUser.customOutfit);
                    try { localStorage.setItem('gameUser', JSON.stringify(currentUser)); } catch (e) { }
                    if (typeof showTopToast === 'function') showTopToast(t('om_saved'));
                    closeM(); tryOn = null; render();
                } else { btn.disabled = false; if (typeof pxAlert === 'function') pxAlert(tMsg(r && r.message ? r.message : 'generic_error')); }
            } catch (e) { btn.disabled = false; }
        };
        paint(); tick();
    }
    window.openOutfitMaker = openMaker;
    function render() {
        if (!el || !currentUser) return;
        Cosmetics.setCustomOutfit(currentUser.customOutfit || '');
        if (!skinCatalog || !weaponSkinCatalog || !cosCatalog) { el.querySelector('.wd-grid').innerHTML = loaderHtml(); return; }
        if (!cats().includes(cat)) cat = 'skin';
        el.querySelector('.wd-coins').innerText = currentUser.coins;
        // Qahramon tanlash (xonadan ochilganda - qulflangan: faqat o'sha qahramon)
        const ht = el.querySelector('.wd-heroes');
        ht.innerHTML = '';
        CHARACTER_TYPES.filter(heroOwned).forEach((type) => {
            const b = document.createElement('button');
            b.className = 'wd-hero-btn' + (type === hero() ? ' active' : '');
            b.innerText = tCharName(type);
            if (!heroOwned(type)) b.insertAdjacentHTML('afterbegin', '<i class="fa-solid fa-lock"></i> ');
            b.disabled = characterLocked && type !== hero();
            b.onclick = () => { if (type === hero() || characterLocked) return; tryOn = null; selectCharTab(type); render(); };
            ht.appendChild(b);
        });
        const ct = el.querySelector('.wd-cats');
        ct.innerHTML = '';
        cats().forEach((c) => {
            const b = document.createElement('button');
            b.className = 'cos-tab' + (c === cat ? ' active' : '');
            b.innerHTML = `<i class="fa-solid ${catIcon[c] || 'fa-khanda'}"></i> ${catLabel(c)}`;
            b.onclick = () => { if (cat === c) return; cat = c; tryOn = null; render(); };
            ct.appendChild(b);
        });
        const note = el.querySelector('.wd-cat-note');
        note.innerText = (cat === 'head' || cat === 'face' || cat === 'body') ? t('cos_note') : cat === 'wskin' ? t('wd_wskin_note') : '';
        renderGrid(el.querySelector('.wd-grid'));
        drawPreview();
    }
    function close() {
        if (!el) return;
        el.remove(); el = null; tryOn = null;
        // "Mening personajim" ochiq bo'lsa - u yerdagi ko'rinish ham yangilansin
        if (typeof drawCharPreview === 'function') drawCharPreview();
        if (typeof characterCoinBalance !== 'undefined' && currentUser) characterCoinBalance.innerText = currentUser.coins;
        if (typeof coinBalance !== 'undefined' && currentUser) coinBalance.innerText = currentUser.coins;
    }
    async function open(opts) {
        if (!currentUser) return;
        close();
        if (opts && opts.fromMenu) { characterLocked = false; selectedCharTab = currentUser.defaultCharacter || selectedCharTab || 'knight'; }
        el = document.createElement('div');
        el.id = 'wardrobe';
        el.innerHTML = `<div class="wd-box">
            <div class="wd-head"><span class="wd-title"><i class="fa-solid fa-shirt"></i> ${t('wd_title')}</span>
                <span class="coin-badge"><i class="fa-solid fa-coins icon"></i><span class="wd-coins">${currentUser.coins}</span></span>
                <button class="wd-x" title="Esc"><i class="fa-solid fa-xmark"></i></button></div>
            <div class="wd-body">
                <div class="wd-left">
                    <div class="char-stage wd-stage"><canvas id="wd-preview" width="64" height="48"></canvas></div>
                    <div class="wd-wcolor"></div>
                    <div class="wd-try"></div>
                    <div class="wd-heroes"></div>
                </div>
                <div class="wd-right">
                    <div class="wd-cats cos-tabs"></div>
                    <p class="settings-note wd-cat-note"></p>
                    <div class="wd-grid"></div>
                </div>
            </div></div>`;
        el.onclick = (e) => { if (e.target === el) close(); };
        el.querySelector('.wd-x').onclick = close;
        document.body.appendChild(el);
        render();
        // Kataloglar va hisob ma'lumoti (birinchi ochilishda yoki bosh menyudan) - kelgach qayta chiziladi
        if (!skinCatalog || !weaponSkinCatalog || !cosCatalog || (opts && opts.fromMenu)) { await loadCharacterScreen(); render(); }
    }
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && el) { const om = document.getElementById('om-panel'); e.stopPropagation(); if (om) { om.querySelector('.om-x').click(); return; } close(); } }, true);
    window.Wardrobe = { open, close, refresh: () => { if (el && !busy) render(); }, isOpen: () => !!el };
})();
