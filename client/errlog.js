// O'YINCHI BRAUZERIDAGI XATOLAR -> server (admin panel "Xatolar" bo'limi). Sahifada birinchi yuklanadi.
// Faqat o'yinning o'z fayllaridagi xatolar; reklama / brauzer kengaytmasi / tashqi skriptlar e'tiborsiz.
// Bir xil xato bir marta yuboriladi, bir sahifada ko'pi bilan 15 ta
(function () {
    const sent = new Set();
    let n = 0;
    const own = (src) => !src || src.indexOf(location.origin) === 0 || src.charAt(0) === '/';
    const noise = /Script error|ResizeObserver|adsbygoogle|pagead|googlesyndication|extension:\/\/|chrome-extension|moz-extension|safari-extension|webkit-masked-url/i;
    function report(msg, src, line, col, stack) {
        try {
            msg = String(msg || '').slice(0, 300);
            src = String(src || '');
            if (!msg || noise.test(msg) || noise.test(src) || noise.test(String(stack || '')) || !own(src)) return;
            const key = msg + '|' + src + '|' + line;
            if (sent.has(key) || n >= 15) return;
            sent.add(key); n++;
            const u = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.nickname : '';
            const map = window.__game && window.__game.map ? String(window.__game.map.name || window.__game.map.mode || '') : 'menu';
            const body = JSON.stringify({ msg, src: src.replace(location.origin, ''), line: line || 0, col: col || 0, stack: String(stack || '').slice(0, 1500), user: u, map });
            if (navigator.sendBeacon) navigator.sendBeacon('/api/client-error', new Blob([body], { type: 'application/json' }));
            else fetch('/api/client-error', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => { });
        } catch (e) { }
    }
    window.addEventListener('error', (e) => {
        if (!e || !e.message) return;   // rasm / skript yuklanmadi - xato emas
        report(e.message, e.filename, e.lineno, e.colno, e.error && e.error.stack);
    });
    window.addEventListener('unhandledrejection', (e) => {
        const r = e && e.reason;
        if (!r || !(r instanceof Error)) return;   // undefined / matn - odatda tashqi kutubxonalar (reklama)
        const m = String(r.stack || '').match(/(https?:\/\/[^\s)]+):(\d+):(\d+)/);
        report('Unhandled: ' + r.message, m ? m[1] : '', m ? +m[2] : 0, m ? +m[3] : 0, r.stack);
    });
    window.reportClientError = report;
})();
