// REKLAMA: chap va o'ng chetda uzunchoq (160x600) bannerlar + "Reklama ko'r -> +500 tanga".
// Reklama tarmog'i ID lari serverda (.env: ADS_CLIENT, ADS_SLOT_LEFT, ADS_SLOT_RIGHT). ID berilmagan
// bo'lsa - hech narsa yuklanmaydi va hech narsa ko'rinmaydi. Tanga faqat server orqali beriladi
// (oraliq 3 daqiqa, kuniga ko'pi bilan 10 marta) - klientda "aldab" tanga qo'shib bo'lmaydi
const Ads = (() => {
    let cfg = null, scriptLoaded = false, busy = false;
    const btn = document.getElementById('nav-ad-btn');
    const modal = document.getElementById('ad-modal');
    const modalText = document.getElementById('ad-modal-text');
    const watchBtn = document.getElementById('ad-watch-btn');
    const cancelBtn = document.getElementById('ad-cancel-btn');
    let pendingShow = null;

    function loadScript() {
        if (scriptLoaded) return;
        scriptLoaded = true;
        window.adsbygoogle = window.adsbygoogle || [];
        window.adBreak = window.adConfig = (o) => window.adsbygoogle.push(o);
        // index.html da AdSense skripti allaqachon bor bo'lsa - ikkinchi marta yuklanmaydi
        if (!document.querySelector('script[src*="adsbygoogle.js"]')) {
            const s = document.createElement('script');
            s.async = true;
            s.crossOrigin = 'anonymous';
            s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(cfg.client);
            s.setAttribute('data-ad-client', cfg.client);   // H5 o'yin reklamalari (adBreak) shu atributni talab qiladi
            s.setAttribute('data-ad-frequency-hint', '30s');
            if (cfg.test) s.setAttribute('data-adbreak-test', 'on');
            document.head.appendChild(s);
        }
        window.adConfig({ preloadAdBreaks: 'on', sound: 'on' });
    }

    function fillBanner(railId, slot) {
        const rail = document.getElementById(railId);
        if (!rail || !slot) return;
        rail.innerHTML = '';
        const ins = document.createElement('ins');
        ins.className = 'adsbygoogle';
        ins.style.cssText = 'display:inline-block;width:160px;height:600px';
        ins.setAttribute('data-ad-client', cfg.client);
        ins.setAttribute('data-ad-slot', slot);
        if (cfg.test) ins.setAttribute('data-adtest', 'on');
        rail.appendChild(ins);
        rail.classList.remove('hidden');
        try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) { }
    }

    function setCoins(coins) {
        if (!currentUser) return;
        currentUser.coins = coins;
        try { localStorage.setItem('gameUser', JSON.stringify(currentUser)); } catch (e) { }
        coinBalance.innerText = coins;
        characterCoinBalance.innerText = coins;
    }

    // Reklama paytida o'yin musiqasi o'chadi
    let savedVol = null;
    function muteGame() {
        try { savedVol = parseFloat(localStorage.getItem('gameVolume')); GameAudio.setVolume(0); } catch (e) { }
    }
    function unmuteGame() {
        try { if (savedVol !== null && !isNaN(savedVol)) GameAudio.setVolume(savedVol); } catch (e) { }
        savedVol = null;
    }

    function closeModal() { modal.classList.add('hidden'); pendingShow = null; }
    function done() { busy = false; btn.classList.remove('loading'); }

    async function claim(nonce) {
        try {
            const res = await fetch('/api/ads/' + currentUser.id + '/reward', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nonce })
            });
            const data = await res.json();
            if (data.success) {
                setCoins(data.coins);
                try { GameAudio.sfx('coin'); } catch (e) { }
                alert(t('ad_reward_got').replace('{0}', data.reward) + (data.left !== undefined ? ' (' + t('ad_left').replace('{0}', data.left) + ')' : ''));
            } else alert(tMsg(data.message));
        } catch (e) { alert(t('server_unreachable')); }
    }

    function watch() {
        if (!cfg || !cfg.enabled || !cfg.reward || !currentUser || busy) return;
        busy = true;
        btn.classList.add('loading');
        let nonce = null, viewed = false, answered = false;
        window.adBreak({
            type: 'reward',
            name: 'coins_' + cfg.rewardCoins,
            beforeAd: muteGame,
            afterAd: unmuteGame,
            // Reklama tayyor: o'yinchidan tasdiq so'raymiz (reklama faqat bosish orqali ochiladi)
            beforeReward: (showAdFn) => {
                answered = true;
                pendingShow = showAdFn;
                modalText.innerText = t('ad_offer').replace('{0}', cfg.rewardCoins);
                modal.classList.remove('hidden');
            },
            adDismissed: () => alert(t('ad_dismissed')),
            adViewed: () => { viewed = true; if (nonce) claim(nonce); },
            adBreakDone: (info) => {
                answered = true;
                done();
                closeModal();
                const st = info && info.breakStatus;
                if (!viewed && st !== 'dismissed' && st !== 'viewed' && st !== 'ignored') alert(t('ad_not_ready'));
            }
        });
        // Google javob bermasa (sayt hali tasdiqlanmagan / reklama yo'q / reklama bloklovchi) - tugma qotib
        // qolmasin va o'yinchi nima bo'lganini bilsin
        setTimeout(() => {
            if (answered || !busy || !modal.classList.contains('hidden') || savedVol !== null) return;
            done();
            alert(t('ad_not_ready'));
        }, 8000);

        watchBtn.onclick = async () => {
            const show = pendingShow;
            closeModal();
            if (!show) return;
            try {
                const r = await fetch('/api/ads/' + currentUser.id + '/start', { method: 'POST' });
                const d = await r.json();
                nonce = d.nonce || null;
            } catch (e) { }
            show();
        };
    }

    cancelBtn.onclick = () => { closeModal(); done(); };
    btn.onclick = watch;

    async function init() {
        try {
            const res = await fetch('/api/ads/config');
            cfg = await res.json();
        } catch (e) { cfg = null; }
        if (!cfg || !cfg.enabled) return;
        loadScript();
        // Bannerlar faqat hisobga kirgandan keyin (menyu/lobbi) yuklanadi: login ekranida mazmun yo'q -
        // Google qoidasi bo'yicha mazmunsiz ekranda reklama ko'rsatish mumkin emas
        const fillWhenIn = () => {
            if (!currentUser) { setTimeout(fillWhenIn, 1000); return; }
            fillBanner('ad-rail-left', cfg.slotLeft);
            fillBanner('ad-rail-right', cfg.slotRight);
        };
        fillWhenIn();
        if (cfg.reward) {
            btn.querySelector('.ad-amount').innerText = '+' + cfg.rewardCoins;
            btn.classList.remove('hidden');
        }
    }
    init();
    return { watch };
})();
