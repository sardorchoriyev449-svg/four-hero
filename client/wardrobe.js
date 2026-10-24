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
    const catIcon = { skin: 'fa-shirt', wskin: 'fa-palette', head: 'fa-hat-cowboy', face: 'fa-glasses' };
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
    const cosItems = (c) => c === 'head' ? cosCatalog.head : c === 'face' ? cosCatalog.face : ((cosCatalog.weapons[hero()] || {})[c] || []);

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
            grid.appendChild(card({
                icon: cv, name: cosName(cat, it), equipped: eqId === it.id, canRemove: true, owned: owned.includes(cosKey(type, cat, it.id)), price: it.price,
                trying: tryOn && tryOn.cat === cat && tryOn.id === it.id, tryKey: { cat, id: it.id },
                equip: () => equipCosmetic(type, cat, it.id), remove: () => equipCosmetic(type, cat, null), buy: () => buyCosmetic(type, cat, it)
            }));
        });
    }
    function render() {
        if (!el || !currentUser) return;
        if (!skinCatalog || !weaponSkinCatalog || !cosCatalog) { el.querySelector('.wd-grid').innerHTML = loaderHtml(); return; }
        if (!cats().includes(cat)) cat = 'skin';
        el.querySelector('.wd-coins').innerText = currentUser.coins;
        // Qahramon tanlash (xonadan ochilganda - qulflangan: faqat o'sha qahramon)
        const ht = el.querySelector('.wd-heroes');
        ht.innerHTML = '';
        CHARACTER_TYPES.forEach((type) => {
            const b = document.createElement('button');
            b.className = 'wd-hero-btn' + (type === hero() ? ' active' : '');
            b.innerText = tCharName(type);
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
        note.innerText = (cat === 'head' || cat === 'face') ? t('cos_note') : cat === 'wskin' ? t('wd_wskin_note') : '';
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
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && el) { e.stopPropagation(); close(); } }, true);
    window.Wardrobe = { open, close, refresh: () => { if (el && !busy) render(); }, isOpen: () => !!el };
})();
