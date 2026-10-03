// TEST REJIMI: o'yin shu kompyuterda (localhost) ishga tushirilgan va shu kompyuterning o'zidan kirilgan
// bo'lsa - barcha xaritalar ochiq (sinab ko'rish uchun). Tekshiruv ulanishning haqiqiy manzili bo'yicha
// (Host sarlavhasi bo'yicha emas - uni soxtalashtirish mumkin). Render'da (RENDER o'zgaruvchisi bor) va
// TEST_MODE=off bo'lsa - hech qachon yoqilmaydi
export function isLocalTest(address: string | undefined): boolean {
    if (process.env.RENDER || (process.env.TEST_MODE || '').trim() === 'off') return false;
    const a = (address || '').replace(/^::ffff:/, '');
    return a === '127.0.0.1' || a === '::1';
}
