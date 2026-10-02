const socket = io();

// HISOB TOKENI: server hisobga tegishli har so'rovni (/api/...) login paytida bergan token bilan
// tekshiradi. Token avtomatik qo'shiladi; 401 - sessiya tugagan (qayta kirish kerak)
const nativeFetch = window.fetch.bind(window);
window.fetch = async (url, opts = {}) => {
    if (typeof url === 'string' && url.startsWith('/api/') && currentUser && currentUser.token) {
        opts = { ...opts, headers: { ...(opts.headers || {}), 'X-Auth-Token': currentUser.token } };
    }
    const res = await nativeFetch(url, opts);
    if (res.status === 401 && typeof url === 'string' && url.startsWith('/api/')) onSessionExpired();
    return res;
};

// SAHIFA YUKLANISH EKRANI (#boot-loader): shriftlar, ikonalar, fayllar va birinchi ma'lumotlar
// (menyu, xonaga qaytish, ochiq turgan bo'lim) kelguncha - bo'sh sahifa ko'rinib, keyin
// elementlar birdan "paydo bo'lmasin". Ko'pi bilan 8 soniya kutiladi
const Boot = (() => {
    const el = document.getElementById('boot-loader');
    const fill = document.getElementById('boot-fill');
    let total = 0, settled = 0, started = false, finished = false;
    const finish = () => {
        if (finished) return;
        finished = true;
        if (!el) return;
        if (fill) fill.style.width = '100%';
        setTimeout(() => { el.classList.add('hide'); setTimeout(() => el.remove(), 450); }, 150);
    };
    const check = () => {
        if (started && settled >= total) setTimeout(() => { if (settled >= total) finish(); }, 80);
    };
    return {
        // Promise tugaguncha yuklanish ekrani turadi (ekran allaqachon yopilgan bo'lsa - hech narsa qilmaydi)
        wait(p) {
            if (finished || !p || typeof p.then !== 'function') return p;
            total++;
            const done = () => {
                settled++;
                if (fill) fill.style.width = Math.round(15 + 85 * settled / total) + '%';
                check();
            };
            p.then(done, done);
            return p;
        },
        start() { started = true; setTimeout(finish, 8000); check(); }
    };
})();
const bootFont = (spec) => (document.fonts && document.fonts.load) ? document.fonts.load(spec).catch(() => {}) : Promise.resolve();
// O'yin HUD'idagi piksel shrift canvas'ga chizilishidan oldin yuklangan bo'lsin
// (brauzer shriftni odatda faqat sahifada ishlatilganda yuklaydi)
Boot.wait(bootFont('10px "Press Start 2P"'));
Boot.wait(bootFont('900 16px "Font Awesome 6 Free"'));
Boot.wait(new Promise(r => { if (document.readyState === 'complete') r(); else window.addEventListener('load', r); }));
// Sahifa yangilanganda xonaga/o'yinga qaytish - javob kelguncha (aks holda avval bosh menyu ko'rinib, keyin almashardi)
if (sessionStorage.getItem('lastRoomId')) {
    Boot.wait(new Promise(r => {
        ['roomJoined', 'gameStarted', 'rejoinFailed', 'joinError', 'accountBanned', 'roomClosed', 'kickedFromRoom'].forEach(ev => socket.once(ev, r));
        setTimeout(r, 6000);
    }));
}

// Bo'lim ichidagi kichik yuklanish belgisi (ma'lumot serverdan kelguncha)
function loaderHtml() {
    return `<div class="inline-loader"><span class="px-dots"><i></i><i></i><i></i></span><span>${t('loading_short')}</span></div>`;
}
// Tugma so'rov tugaguncha "band" (qayta bosilmaydi)
async function withBusy(btn, fn) {
    if (!btn || btn.classList.contains('busy')) return;
    btn.classList.add('busy');
    try { return await fn(); } finally { btn.classList.remove('busy'); }
}

// SAHIFA YANGILANSA HAM JOYIDA QOLISH: har bir brauzer oynasining doimiy ID'si
// (sessionStorage - yangilashda saqlanadi, yangi oynada yangisi). Server shu
// orqali uzilgan o'yinchining o'rnini 15 soniya saqlab, qaytib kelsa qaytaradi
const newClientId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
let CLIENT_ID = sessionStorage.getItem('clientId') || newClientId();
sessionStorage.setItem('clientId', CLIENT_ID);
// NUSXALANGAN TAB: brauzer tabni nusxalaganda sessionStorage (va clientId) ham nusxalanadi - shunda
// ikkala tab bitta o'yinchi deb hisoblanib, biri ikkinchisini uzib qo'yardi. Ochilishda boshqa
// tablardan "bu identifikator siznikimi?" deb so'raymiz; ha desa - o'zimizga yangisini olamiz
(function dedupeTabClientId() {
    if (!window.BroadcastChannel) return;
    const nonce = Math.random().toString(36).slice(2);
    const ch = new BroadcastChannel('four-heroes-tabs');
    ch.onmessage = (e) => {
        const d = e.data || {};
        if (d.type === 'who' && d.id === CLIENT_ID && d.nonce !== nonce) ch.postMessage({ type: 'mine', id: d.id, nonce: d.nonce });
        if (d.type === 'mine' && d.nonce === nonce && d.id === CLIENT_ID) {
            CLIENT_ID = newClientId();
            sessionStorage.setItem('clientId', CLIENT_ID);
        }
    };
    ch.postMessage({ type: 'who', id: CLIENT_ID, nonce });
})();

// HTML Elementlarni yuklab olamiz
const authPanel = document.getElementById('auth-panel');
const mainMenuPanel = document.getElementById('main-menu-panel');
const playHubPanel = document.getElementById('play-hub-panel');
const connectPanel = document.getElementById('connect-panel');
const allLobbiesPanel = document.getElementById('all-lobbies-panel');
const createLobbyPanel = document.getElementById('create-lobby-panel');
const mySavedRoomPanel = document.getElementById('my-saved-room-panel');
const characterPanel = document.getElementById('character-panel');
const settingsPanel = document.getElementById('settings-panel');
const donatePanel = document.getElementById('donate-panel');
const lobbyPanel = document.getElementById('lobby-panel');
const gameoverPanel = document.getElementById('gameover-panel');
const gameWrapper = document.getElementById('game-wrapper');
const touchControls = document.getElementById('touch-controls');

const ALL_PANELS = [authPanel, mainMenuPanel, playHubPanel, connectPanel, allLobbiesPanel, createLobbyPanel,
    mySavedRoomPanel, characterPanel, settingsPanel, donatePanel, lobbyPanel, gameoverPanel];

// --- AUTH elementlari ---
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const loginNickname = document.getElementById('login-nickname');
const loginPassword = document.getElementById('login-password');
const loginBtn = document.getElementById('login-btn');
const loginError = document.getElementById('login-error');
const registerFullname = document.getElementById('register-fullname');
const registerNickname = document.getElementById('register-nickname');
const registerPassword = document.getElementById('register-password');
const registerBtn = document.getElementById('register-btn');
const registerError = document.getElementById('register-error');
const showRegisterLink = document.getElementById('show-register-link');
const showLoginLink = document.getElementById('show-login-link');

const welcomeNickname = document.getElementById('welcome-nickname');
const coinBalance = document.getElementById('coin-balance');
const playerLevelSpan = document.getElementById('player-level');
const logoutLink = document.getElementById('logout-link');
const controlPcBtn = document.getElementById('control-pc-btn');
const controlPhoneBtn = document.getElementById('control-phone-btn');

// --- HUB (bosh menyu) navigatsiyasi ---
const navPlayBtn = document.getElementById('nav-play-btn');
const navCharacterBtn = document.getElementById('nav-character-btn');
const navSettingsBtn = document.getElementById('nav-settings-btn');
const navDonateBtn = document.getElementById('nav-donate-btn');
const characterBackBtn = document.getElementById('character-back-btn');
const settingsBackBtn = document.getElementById('settings-back-btn');
const donateBackBtn = document.getElementById('donate-back-btn');

// --- PLAY HUB va uning 4 ta pastki ekrani ---
const playHubBackBtn = document.getElementById('play-hub-back-btn');
const navConnectBtn = document.getElementById('nav-connect-btn');
const navAllLobbiesBtn = document.getElementById('nav-all-lobbies-btn');
const navCreateLobbyBtn = document.getElementById('nav-create-lobby-btn');
const navMySavedRoomBtn = document.getElementById('nav-my-saved-room-btn');

const connectBackBtn = document.getElementById('connect-back-btn');
const joinCodeInput = document.getElementById('join-code-input');
const joinCodeBtn = document.getElementById('join-code-btn');

const allLobbiesBackBtn = document.getElementById('all-lobbies-back-btn');
const roomListDiv = document.getElementById('room-list');

const createLobbyBackBtn = document.getElementById('create-lobby-back-btn');
const roomNameInput = document.getElementById('room-name-input');
const createRoomBtn = document.getElementById('create-room-btn');
const visibilityPublicBtn = document.getElementById('visibility-public-btn');
const visibilityPrivateBtn = document.getElementById('visibility-private-btn');
const visibilityNote = document.getElementById('visibility-note');

const mySavedRoomBackBtn = document.getElementById('my-saved-room-back-btn');
const mySavedRoomContent = document.getElementById('my-saved-room-content');

// --- MENING PERSONAJIM (yaxshilash + skinlar + qurol skinlari) ---
const characterCoinBalance = document.getElementById('character-coin-balance');
const skillPointsValue = document.getElementById('skill-points-value');
const upgradesContent = document.getElementById('upgrades-content');
const shopContent = document.getElementById('shop-content');
const weaponShopContent = document.getElementById('weapon-shop-content');
const charTabsDiv = document.getElementById('char-tabs');
const charLockedNote = document.getElementById('char-locked-note');
const charDetailsDesc = document.getElementById('char-details-desc');

// --- SOZLAMALAR ---
const volumeSlider = document.getElementById('volume-slider');
const sfxSlider = document.getElementById('sfx-slider');
const langEnBtn = document.getElementById('lang-en-btn');
const langRuBtn = document.getElementById('lang-ru-btn');

// --- LOBBI ---
const currentRoomNameSpan = document.getElementById('current-room-name');
const leaveLobbyBtn = document.getElementById('leave-lobby-btn');
const toggleMapBtn = document.getElementById('toggle-map-btn');
const toggleChatBtn = document.getElementById('toggle-chat-btn');
const openMyCharacterBtn = document.getElementById('open-my-character-btn');
const lobbyChatSection = document.getElementById('lobby-chat-section');
const roomCodeBadge = document.getElementById('room-code-badge');
const roomCodeValue = document.getElementById('room-code-value');
const levelSelectSection = document.getElementById('level-select-section');
const levelListDiv = document.getElementById('level-list');
const myCharacterDisplay = document.getElementById('my-character-display');
const playerListUl = document.getElementById('player-list');
const playerCountSpan = document.getElementById('player-count');
const startGameBtn = document.getElementById('start-game-btn');
const waitingMsg = document.getElementById('waiting-msg');
const readyBtn = document.getElementById('ready-btn');
const startErrorMsg = document.getElementById('start-error-msg');
const chatBox = document.getElementById('chat-box');
const chatInput = document.getElementById('chat-input');
const chatSendBtn = document.getElementById('chat-send-btn');

const gameoverText = document.getElementById('gameover-text');
const gameoverTitle = document.getElementById('gameover-title');
const gameoverPanelEl = document.getElementById('gameover-panel');
const gameoverOkBtn = document.getElementById('gameover-ok-btn');

let currentRoomId = null;
let currentUser = null; // { id, fullName, nickname, coins, ownedSkins, equippedSkins, defaultCharacter }
let skinCatalog = null;
let weaponSkinCatalog = null;
let cosCatalog = null;          // detallar katalogi: { head: [...], face: [...], weapons: { knight: { sword: [...] } } }
let selectedCosSlot = 'head';   // "Detallar" bo'limida ochiq turgan tab
let isRoomHost = false;
let roomMaps = [];        // { id, name, description, accentColor }[] - joriy xonada mavjud xaritalar
let unlockedLevel = 0;    // xonada ochilgan eng yuqori xarita
let selectedLevel = 0;    // hozir tanlangan (keyingi o'ynaladigan) xarita
let latestPlayerListData = null; // oxirgi kelgan o'yinchilar ro'yxati (til almashganda qayta chizish uchun)
let latestGameOverData = null;   // til almashganda o'yin tugadi ekranini qayta chizish uchun
let characterReturnPanel = null; // "Mening personajim" dan "Orqaga" bosilganda qaysi panelga qaytish kerak
let characterLocked = false;     // true bo'lsa (lobbidan ochilgan bo'lsa), personaj tabi almashtirilmaydi
let selectedCharTab = 'knight';  // hozir "Mening personajim" ekranida ko'rsatilayotgan personaj turi
let createRoomIsPrivate = false; // "Create Lobby" ekranida tanlangan ko'rinish (Public/Private)

function showPanel(panel) {
    ALL_PANELS.forEach(p => p.classList.add('hidden'));
    panel.classList.remove('hidden');
    // Bosh menyuga qaytilganda (o'yindan, lobbidan, sozlamalardan) - daraja va tangalar yangilanadi
    if (panel === mainMenuPanel && currentUser && typeof refreshMenuStats === 'function') refreshMenuStats();
    sessionStorage.setItem('lastPanel', panel.id);
}

// Til almashganda, hozir ekranda turgan dinamik (JS orqali chizilgan) matnlarni yangilash
// (i18n.js dagi setLang() shu funksiyani avtomatik chaqiradi)
function onLanguageChanged() {
    if (roomMaps.length > 0) renderLevelList();
    if (latestPlayerListData) renderPlayerList(latestPlayerListData);
    if (latestGameOverData) renderGameOver(latestGameOverData);
    if (currentUser) renderMyCharacterDisplay();
    if (!characterPanel.classList.contains('hidden')) {
        renderCharTabs();
        renderUpgrades();
        renderShop();
        renderWeaponShop();
        charDetailsDesc.innerText = t('char_' + selectedCharTab + '_desc');
    }
}

// --- 0. HISOB QAYDNOMASI (LOGIN / RO'YXATDAN O'TISH) ---

showRegisterLink.onclick = () => {
    loginForm.classList.add('hidden');
    registerForm.classList.remove('hidden');
};
showLoginLink.onclick = () => {
    registerForm.classList.add('hidden');
    loginForm.classList.remove('hidden');
};

loginBtn.onclick = () => withBusy(loginBtn, async () => {
    loginError.innerText = '';
    const nickname = loginNickname.value.trim();
    const password = loginPassword.value;
    if (!nickname || !password) {
        loginError.innerText = t('fill_nickname_password');
        return;
    }
    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nickname, password })
        });
        const data = await res.json();
        if (data.success) {
            onAuthSuccess(data.user);
        } else {
            loginError.innerText = tMsg(data.message);
        }
    } catch (e) {
        loginError.innerText = t('server_unreachable');
    }
});

registerBtn.onclick = () => withBusy(registerBtn, async () => {
    registerError.innerText = '';
    const fullName = registerFullname.value.trim();
    const nickname = registerNickname.value.trim();
    const password = registerPassword.value;
    if (!fullName || !nickname || !password) {
        registerError.innerText = t('fill_all_fields');
        return;
    }
    try {
        const res = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fullName, nickname, password })
        });
        const data = await res.json();
        if (data.success) {
            onAuthSuccess(data.user);
        } else {
            registerError.innerText = tMsg(data.message);
        }
    } catch (e) {
        registerError.innerText = t('server_unreachable');
    }
});

function onAuthSuccess(user) {
    currentUser = user;
    sessionExpiredShown = false;
    localStorage.setItem('gameUser', JSON.stringify(user));
    enterMainMenu();
}

logoutLink.onclick = () => {
    localStorage.removeItem('gameUser');
    sessionStorage.removeItem('lastRoomId');
    sessionStorage.removeItem('lastPanel');
    currentUser = null;
    loginNickname.value = '';
    loginPassword.value = '';
    showPanel(authPanel);
};

// Har o'yin boshida (login qilingandan keyin) BOSH MENYUGA (hub) o'tiladi -
// aynan shu yerdan "Play"/"My Character"/"Settings"/"Donate" ga tarqaladi
async function enterMainMenu() {
    welcomeNickname.innerText = currentUser.nickname;
    coinBalance.innerText = currentUser.coins;
    showPanel(mainMenuPanel);
    updateControlSchemeButtons();
    await refreshMenuStats();
}

// BOSH MENYUDAGI DARAJA, XP va TANGA: har safar bosh menyu ochilganda serverdan yangilanadi (ilgari faqat
// kirishda olinardi - o'yindan qaytgach eski daraja ko'rinib qolardi). Daraja - tanlangan personajniki
// (har personajning tajribasi alohida), shuning uchun yonida personaj nomi ham yoziladi
let menuStatsPromise = null;
function refreshMenuStats() {
    if (!currentUser) return Promise.resolve();
    // Bir vaqtda ikki marta chaqirilsa (menyu ochilishi + kirish) - bitta so'rov
    if (!menuStatsPromise) menuStatsPromise = loadMenuStats().finally(() => { menuStatsPromise = null; });
    return menuStatsPromise;
}
async function loadMenuStats() {
    try {
        const res = await fetch('/api/character/' + currentUser.id);
        const data = await res.json();
        if (!data.success || !currentUser) return;
        currentUser.defaultCharacter = data.defaultCharacter;
        currentUser.charXp = data.charXp || currentUser.charXp;
        if (typeof data.coins === 'number') {
            currentUser.coins = data.coins;
            coinBalance.innerText = data.coins;
        }
        playerLevelSpan.innerText = data.level;
        const heroEl = document.getElementById('player-level-hero');
        if (heroEl) heroEl.innerText = tCharName(data.defaultCharacter).toUpperCase();
        renderXpBar(data.xp || 0);
    } catch (e) { /* internetsiz bo'lsa ham menyu ochilaversin */ }
}

// Sahifa yuklanganda, agar avval kirilgan bo'lsa, avtomatik kiritamiz
(function tryAutoLogin() {
    const saved = localStorage.getItem('gameUser');
    // enterMainMenu() o'zi 'lastPanel'ni qayta yozadi - shuning uchun avval o'qib olamiz
    const lastPanel = sessionStorage.getItem('lastPanel');
    if (saved) {
        try {
            currentUser = JSON.parse(saved);
            Boot.wait(enterMainMenu());
            // Xonada bo'lmagan bo'lsa - yangilashdan oldingi sahifasiga qaytaramiz
            // (xonada bo'lgan bo'lsa - socket ulanganda xonaga qaytadi, pastda)
            // setTimeout: tugmalar ishlovchilari fayl oxirroqda ulanadi - avval ular tayyor bo'lsin
            setTimeout(() => {
                if (!sessionStorage.getItem('lastRoomId') && PANEL_RESTORERS[lastPanel]) {
                    PANEL_RESTORERS[lastPanel]();
                }
            }, 0);
        } catch (e) {
            showPanel(authPanel);
        }
    } else {
        showPanel(authPanel);
    }

    // Saqlangan ovoz balandligini yuklab olamiz
    const savedVolume = localStorage.getItem('gameVolume');
    if (savedVolume !== null) volumeSlider.value = savedVolume;
    // O'yindan tashqarida - menyu musiqasi (brauzer birinchi bosishdan keyin chaladi)
    const savedSfx = localStorage.getItem('sfxVolume');
    if (savedSfx !== null && sfxSlider) sfxSlider.value = savedSfx;
    if (window.GameAudio) { GameAudio.setVolume(volumeSlider.value / 100); if (sfxSlider) GameAudio.setSfxVolume(sfxSlider.value / 100); GameAudio.setMode('menu'); }
})();

// --- BOSHQARUV TURI: PC (klaviatura) yoki PHONE (ekrandagi virtual boshqaruv) ---

// Sensorli ekran (telefon/planshet)
const isTouchDevice = () => window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
const storeGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const storeSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* xotira yopiq - shu sessiya uchun */ } };

function getControlScheme() {
    const saved = storeGet('controlScheme');
    if (saved === 'phone' || saved === 'pc') return saved;
    // Tanlanmagan bo'lsa: telefonda - ekrandagi tugmalar, kompyuterda - klaviatura
    return isTouchDevice() ? 'phone' : 'pc';
}
function updateControlSchemeButtons() {
    const scheme = getControlScheme();
    controlPcBtn.classList.toggle('active', scheme === 'pc');
    controlPhoneBtn.classList.toggle('active', scheme === 'phone');
}
controlPcBtn.onclick = () => { storeSet('controlScheme', 'pc'); updateControlSchemeButtons(); };
controlPhoneBtn.onclick = () => { storeSet('controlScheme', 'phone'); updateControlSchemeButtons(); };

// --- EKRAN O'LCHAMI: Standart (o'yin oynasi 800px gacha) yoki To'liq ekran (butun oyna) ---
// Tanlanmagan bo'lsa: telefonda - to'liq ekran, kompyuterda - standart
function getScreenMode() {
    const saved = storeGet('screenMode');
    if (saved === 'full' || saved === 'standard') return saved;
    return isTouchDevice() ? 'full' : 'standard';
}
function applyScreenMode() {
    const mode = getScreenMode();
    document.body.classList.toggle('screen-full', mode === 'full');
    document.querySelectorAll('[data-screen-btn]').forEach(b => b.classList.toggle('active', b.dataset.screenBtn === mode));
    // O'yin ketayotgan bo'lsa - Phaser yangi quti o'lchamiga moslashadi
    requestAnimationFrame(() => {
        if (typeof phaserGame !== 'undefined' && phaserGame && phaserGame.scale) phaserGame.scale.refresh();
    });
}
// Tugma bosilganda (foydalanuvchi harakati - brauzer haqiqiy to'liq ekranga faqat shunda ruxsat beradi)
window.setScreenMode = (mode) => {
    storeSet('screenMode', mode);
    try {
        if (mode === 'full' && !document.fullscreenElement && document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(() => {});
        } else if (mode === 'standard' && document.fullscreenElement && document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
        }
    } catch (e) { /* brauzer to'liq ekranni qo'llamaydi - oyna ichida kattalashadi */ }
    applyScreenMode();
};
document.getElementById('screen-standard-btn').dataset.screenBtn = 'standard';
document.getElementById('screen-full-btn').dataset.screenBtn = 'full';
document.getElementById('screen-standard-btn').onclick = () => window.setScreenMode('standard');
document.getElementById('screen-full-btn').onclick = () => window.setScreenMode('full');
// TELEFONDA: o'yin paytidagi birinchi teginishda - haqiqiy to'liq ekran (brauzer manzil satri yashirinadi)
// va iloji bo'lsa ekran yotiq holatga qotiriladi (Android). Brauzer buni faqat teginishda ruxsat beradi
document.addEventListener('pointerdown', () => {
    if (!isTouchDevice() || getScreenMode() !== 'full' || document.fullscreenElement) return;
    if (gameWrapper.classList.contains('hidden') || !document.documentElement.requestFullscreen) return;
    document.documentElement.requestFullscreen().then(() => {
        if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
    }).catch(() => {});
}, true);
document.addEventListener('fullscreenchange', () => {
    requestAnimationFrame(() => { if (typeof phaserGame !== 'undefined' && phaserGame && phaserGame.scale) phaserGame.scale.refresh(); });
});
applyScreenMode();

// --- HUB NAVIGATSIYASI ---

navPlayBtn.onclick = () => {
    showPanel(playHubPanel);
};
navCharacterBtn.onclick = () => {
    openCharacterScreen({ locked: false, returnPanel: mainMenuPanel });
};
// Sozlamalar: bosh menyudan ham, xona (lobbi) ichidan ham ochiladi - "Orqaga" qayerdan ochilgan bo'lsa o'sha yerga qaytaradi
let settingsReturnPanel = null;
function openSettings(returnPanel) {
    settingsReturnPanel = returnPanel;
    updateLangButtons();
    showPanel(settingsPanel);
}
navSettingsBtn.onclick = () => openSettings(mainMenuPanel);
document.getElementById('lobby-settings-btn').onclick = () => { setLobbyPopup(null); openSettings(lobbyPanel); };
navDonateBtn.onclick = () => {
    showPanel(donatePanel);
};
settingsBackBtn.onclick = () => {
    // Xonadan ochilgan bo'lsa va hali o'sha xonada bo'lsak - lobbiga qaytamiz
    if (settingsReturnPanel === lobbyPanel && currentRoomId) { showPanel(lobbyPanel); return; }
    coinBalance.innerText = currentUser.coins;
    showPanel(mainMenuPanel);
};
donateBackBtn.onclick = () => {
    coinBalance.innerText = currentUser.coins;
    showPanel(mainMenuPanel);
};
characterBackBtn.onclick = () => {
    coinBalance.innerText = currentUser.coins;
    showPanel(characterReturnPanel);
};

// Sahifa yangilanganda qaytariladigan (xonadan tashqaridagi) sahifalar
const PANEL_RESTORERS = {
    'play-hub-panel': () => showPanel(playHubPanel),
    'connect-panel': () => navConnectBtn.onclick(),
    'all-lobbies-panel': () => navAllLobbiesBtn.onclick(),
    'create-lobby-panel': () => navCreateLobbyBtn.onclick(),
    'my-saved-room-panel': () => navMySavedRoomBtn.onclick(),
    'character-panel': () => navCharacterBtn.onclick(),
    'settings-panel': () => navSettingsBtn.onclick(),
    'donate-panel': () => navDonateBtn.onclick()
};

// Server "hali shu yerdamisan?" deb so'raydi (shu identifikatorli boshqa ulanish paydo bo'lganda)
socket.on('areYouThere', (ack) => { if (typeof ack === 'function') ack(true); });
// Server bu tabga yangi identifikator berdi (nusxalangan tab - alohida o'yinchi)
socket.on('clientIdChanged', (id) => {
    if (typeof id !== 'string') return;
    CLIENT_ID = id;
    sessionStorage.setItem('clientId', id);
});

// XONAGA QAYTISH: sahifa yangilansa (yoki internet uzilib, qayta ulansa) - oxirgi
// xonaga qaytamiz. O'rni saqlanib turgan bo'lsa (15s) - xuddi o'sha holatda
// (xo'jayinlik, tayyor, o'yin ketayotgan bo'lsa - o'yinning o'zi)
socket.on('connect', () => {
    const lastRoomId = sessionStorage.getItem('lastRoomId');
    if (!lastRoomId) return;
    socket.emit('rejoinRoom', {
        roomId: lastRoomId,
        clientId: CLIENT_ID,
        userId: currentUser ? currentUser.id : null,
        token: currentUser ? currentUser.token : null,
        nickname: currentUser ? currentUser.nickname : t('guest_name')
    });
});

// SESSIYA TUGADI: token yo'q/noto'g'ri (masalan, yangilanishdan oldin kirilgan) - qayta kirish kerak
let sessionExpiredShown = false;
function onSessionExpired() {
    if (!currentUser) return;
    sessionStorage.removeItem('lastRoomId');
    localStorage.removeItem('gameUser');
    currentRoomId = null;
    currentUser = null;
    if (typeof stopGame === 'function') stopGame();
    const lc = document.getElementById('level-complete');
    if (lc) lc.remove();
    gameWrapper.classList.add('hidden');
    touchControls.classList.add('hidden');
    showPanel(authPanel);
    if (!sessionExpiredShown) { sessionExpiredShown = true; alert(t('session_expired')); }
}
socket.on('sessionExpired', onSessionExpired);

// HISOB BLOKLANDI (admin): o'yindan chiqariladi, hisobdan chiqadi - kirish oynasiga
socket.on('accountBanned', (data) => {
    sessionStorage.removeItem('lastRoomId');
    localStorage.removeItem('gameUser');
    currentRoomId = null;
    currentUser = null;
    if (typeof stopGame === 'function') stopGame();
    const lc = document.getElementById('level-complete');
    if (lc) lc.remove();
    if (window.GameAudio) { GameAudio.release(); GameAudio.setMode('menu'); }
    gameWrapper.classList.add('hidden');
    touchControls.classList.add('hidden');
    showPanel(authPanel);
    alert(t('account_banned') + (data && data.reason ? ': ' + data.reason : ''));
});

// XONADAN CHIQARILDI (xo'jayin kick qildi) - o'yin to'xtaydi, bosh menyuga
socket.on('kickedFromRoom', () => {
    sessionStorage.removeItem('lastRoomId');
    currentRoomId = null;
    isRoomHost = false;
    latestPlayerListData = null;
    if (typeof stopGame === 'function') stopGame();
    const lc = document.getElementById('level-complete');
    if (lc) lc.remove();
    if (window.GameAudio) { GameAudio.release(); GameAudio.setMode('menu'); }
    gameWrapper.classList.add('hidden');
    touchControls.classList.add('hidden');
    showPanel(currentUser ? mainMenuPanel : authPanel);
    alert(t('kicked_msg'));
});
// Xonada qolganlarga: kim chiqarildi (chatda tizim xabari)
socket.on('playerKicked', (d) => {
    const line = document.createElement('div');
    line.className = 'chat-line';
    line.style.color = '#ff8a80';
    line.textContent = '⚠ ' + t('kicked_chat').replace('{name}', (d && d.nickname) || '');
    chatBox.appendChild(line);
    chatBox.scrollTop = chatBox.scrollHeight;
});

// XONA YOPILDI (egasi chiqib ketdi) - o'yin to'xtaydi, bosh menyuga qaytamiz
socket.on('roomClosed', () => {
    sessionStorage.removeItem('lastRoomId');
    currentRoomId = null;
    isRoomHost = false;
    latestPlayerListData = null;
    if (typeof stopGame === 'function') stopGame();
    const lc = document.getElementById('level-complete');
    if (lc) lc.remove();
    if (window.GameAudio) { GameAudio.release(); GameAudio.setMode('menu'); }
    gameWrapper.classList.add('hidden');
    touchControls.classList.add('hidden');
    showPanel(currentUser ? mainMenuPanel : authPanel);
    alert(t('host_left'));
});

// Xona endi yo'q (masalan, hamma chiqib ketgan) - bosh menyuga
socket.on('rejoinFailed', () => {
    sessionStorage.removeItem('lastRoomId');
    currentRoomId = null;
    if (typeof stopGame === 'function') stopGame();
    gameWrapper.classList.add('hidden');
    showPanel(currentUser ? mainMenuPanel : authPanel);
});

// --- PLAY HUB: Connect / All Lobbies / Create Lobby / My Saved Room ---

playHubBackBtn.onclick = () => showPanel(mainMenuPanel);

navConnectBtn.onclick = () => {
    joinCodeInput.value = '';
    showPanel(connectPanel);
};
connectBackBtn.onclick = () => showPanel(playHubPanel);

navAllLobbiesBtn.onclick = () => showPanel(allLobbiesPanel);
allLobbiesBackBtn.onclick = () => showPanel(playHubPanel);

navCreateLobbyBtn.onclick = () => {
    roomNameInput.value = '';
    setVisibility(false);
    showPanel(createLobbyPanel);
};
createLobbyBackBtn.onclick = () => showPanel(playHubPanel);

function setVisibility(isPrivate) {
    createRoomIsPrivate = isPrivate;
    visibilityPublicBtn.classList.toggle('active', !isPrivate);
    visibilityPrivateBtn.classList.toggle('active', isPrivate);
    visibilityNote.innerText = isPrivate ? t('visibility_private_note') : t('visibility_public_note');
}
visibilityPublicBtn.onclick = () => setVisibility(false);
visibilityPrivateBtn.onclick = () => setVisibility(true);

navMySavedRoomBtn.onclick = () => {
    showPanel(mySavedRoomPanel);
    loadMySavedRoom();
};
mySavedRoomBackBtn.onclick = () => showPanel(playHubPanel);

function loadMySavedRoom() {
    mySavedRoomContent.innerHTML = loaderHtml();
    return Boot.wait(fetchMySavedRoom());
}
async function fetchMySavedRoom() {
    try {
        const res = await fetch('/api/my-rooms/' + currentUser.id + '/latest');
        const data = await res.json();
        if (!data.success || !data.room) {
            mySavedRoomContent.innerHTML = `<p class="empty-note">${t('no_saved_room')}</p>`;
            return;
        }
        const r = data.room;
        const card = document.createElement('div');
        card.className = 'saved-room-card';
        card.innerHTML = `
            <h3><i class="fa-solid fa-door-open"></i> ${escapeHtml(r.name)}</h3>
            <p class="saved-room-meta">
                <span class="room-code-tag">[${r.roomCode}]</span> &middot;
                ${t('saved_room_map_progress')}: ${tMapName(roomMaps.length ? Math.min(r.unlockedLevel, roomMaps.length - 1) : r.unlockedLevel)}
                ${r.isPrivate ? ' &middot; <i class="fa-solid fa-lock"></i> ' + t('visibility_private') : ''}
            </p>
        `;
        const btn = document.createElement('button');
        btn.innerHTML = `<i class="fa-solid fa-play"></i> ${t('continue_btn')}`;
        btn.onclick = () => {
            socket.emit('joinRoomByCode', { roomCode: r.roomCode, userId: currentUser.id, token: currentUser.token, nickname: currentUser.nickname, clientId: CLIENT_ID });
        };
        card.appendChild(btn);
        mySavedRoomContent.innerHTML = '';
        mySavedRoomContent.appendChild(card);
    } catch (e) {
        mySavedRoomContent.innerHTML = `<p class="empty-note">${t('server_unreachable')}</p>`;
    }
}

// --- SOZLAMALAR: OVOZ VA TIL ---

// O'yin ovozlari (effektlar) balandligi - qo'yib yuborilganda namuna ovoz chiqadi
if (sfxSlider) {
    sfxSlider.addEventListener('input', () => {
        localStorage.setItem('sfxVolume', sfxSlider.value);
        if (window.GameAudio) GameAudio.setSfxVolume(sfxSlider.value / 100);
    });
    sfxSlider.addEventListener('change', () => { if (window.GameAudio) GameAudio.sfx('coin'); });
}
// Menyu va lobbidagi tugmalar - yengil "chiq" ovozi
document.addEventListener('click', (e) => {
    if (window.GameAudio && e.target && e.target.closest && e.target.closest('button, .level-item, .maps-tab')) GameAudio.sfx('click');
}, true);
volumeSlider.addEventListener('input', () => {
    localStorage.setItem('gameVolume', volumeSlider.value);
    if (window.GameAudio) GameAudio.setVolume(volumeSlider.value / 100);
    // DIQQAT: o'yinda hali musiqa fayllari yo'q - bu qiymat saqlanadi va
    // musiqa qo'shilgach avtomatik ishlatiladi.
});

function updateLangButtons() {
    const lang = getLang();
    langEnBtn.classList.toggle('active', lang === 'en');
    langRuBtn.classList.toggle('active', lang === 'ru');
}
langEnBtn.onclick = () => { setLang('en'); updateLangButtons(); };
langRuBtn.onclick = () => { setLang('ru'); updateLangButtons(); };

// --- 1. SEVREDAN RO'YXATLARNI OLISH ---

// Ochiq xonalar ro'yxati yangilanganda
socket.on('updateRoomList', (rooms) => {
    roomListDiv.innerHTML = '';
    if (rooms.length === 0) {
        roomListDiv.innerHTML = `<div style="color: #888; text-align: center;">${t('no_rooms_yet')}</div>`;
        return;
    }

    rooms.forEach(room => {
        const item = document.createElement('div');
        item.className = 'room-item';
        item.innerHTML = `<span><i class="fa-solid fa-door-open icon"></i>${escapeHtml(room.name)}</span> <span><i class="fa-solid fa-users icon"></i>${room.playerCount}/${room.maxPlayers || 4}</span>`;
        item.onclick = () => {
            if (!currentUser) return;
            socket.emit('joinRoom', { roomId: room.id, userId: currentUser.id, token: currentUser.token, nickname: currentUser.nickname, clientId: CLIENT_ID });
        };
        roomListDiv.appendChild(item);
    });
});

// --- 2. XONA YARATISH VA UNGA QO'SHILISH ---

createRoomBtn.onclick = () => {
    const roomName = roomNameInput.value.trim();
    if (!roomName) {
        alert(t('enter_room_name_alert'));
        return;
    }
    socket.emit('createRoom', { roomName, userId: currentUser.id, token: currentUser.token, nickname: currentUser.nickname, isPrivate: createRoomIsPrivate, clientId: CLIENT_ID });
};

// XONA KODI ORQALI QO'SHILISH (masalan "Mening xonalarim"dan tashqari, do'stdan olingan kod bilan)
joinCodeBtn.onclick = () => {
    const roomCode = joinCodeInput.value.trim().toUpperCase();
    if (!roomCode) {
        alert(t('enter_room_code_alert'));
        return;
    }
    socket.emit('joinRoomByCode', { roomCode, userId: currentUser ? currentUser.id : null, token: currentUser ? currentUser.token : null, nickname: currentUser ? currentUser.nickname : t('guest_name'), clientId: CLIENT_ID });
};
joinCodeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') joinCodeBtn.onclick();
});

// Xonaga kirishda xatolik (xona to'la yoki hisob boshqa joyda faol)
socket.on('joinError', (message) => {
    alert(tMsg(message));
});

// Lobbiga muvaffaqiyatli kirganda
socket.on('roomJoined', (data) => {
    const sameRoom = currentRoomId === data.roomId && latestPlayerListData;
    currentRoomId = data.roomId;
    sessionStorage.setItem('lastRoomId', data.roomId);
    currentRoomNameSpan.innerText = data.roomName;
    isRoomHost = !!data.isHost;
    roomMaps = data.maps || [];
    unlockedLevel = data.unlockedLevel || 0;
    selectedLevel = data.selectedLevel || 0;
    // Yangi xona: o'yinchilar ro'yxati kelguncha o'rinlarda yuklanish belgisi
    if (!sameRoom) {
        latestPlayerListData = null;
        const slots = document.getElementById('lobby-slots');
        if (slots) slots.innerHTML = loaderHtml();
    }

    // Yangi xonaga kirganda "Tayyor" holati, chat va panel ko'rinishini tozalab boshlaymiz
    readyBtn.classList.remove('is-ready');
    readyBtn.classList.add('not-ready');
    readyBtn.innerHTML = `<i class="fa-solid fa-check icon"></i>${t('ready_btn')}`;
    startErrorMsg.innerText = '';
    chatBox.innerHTML = '';
    levelSelectSection.classList.add('hidden');
    lobbyChatSection.classList.add('hidden');
    toggleMapBtn.classList.remove('active');
    toggleChatBtn.classList.remove('active');

    renderMyCharacterDisplay();

    // Xona kodini saqlanadigan YOKI yopiq (private) xonalarda ko'rsatamiz (ulashish uchun)
    if (data.isPersistent || data.isPrivate) {
        renderRoomCode();
        roomCodeBadge.classList.remove('hidden');
    } else {
        roomCodeBadge.classList.add('hidden');
    }

    renderLevelList();
    showPanel(lobbyPanel);

    toggleChatBtn.classList.remove('has-new');
    updateHostControls();
});

// Xo'jayin - katta START; qolganlar - READY (xo'jayin almashsa ham darhol yangilanadi)
function updateHostControls() {
    startGameBtn.classList.toggle('hidden', !isRoomHost);
    readyBtn.classList.toggle('hidden', isRoomHost);
    waitingMsg.classList.toggle('hidden', isRoomHost);
}

// Xarita/Chat ko'rsatish-yashirish tugmalari (lobbini toza ko'rinishda saqlash uchun)
// Xaritalar oynasi bo'limi: 'bonus' | 's1' | 's2'
let mapsTab = 's1';
function setLobbyPopup(which) {
    const mapOpen = which === 'map' && levelSelectSection.classList.contains('hidden');
    const chatOpen = which === 'chat' && lobbyChatSection.classList.contains('hidden');
    levelSelectSection.classList.toggle('hidden', !mapOpen);
    lobbyChatSection.classList.toggle('hidden', !chatOpen);
    toggleMapBtn.classList.toggle('active', mapOpen);
    toggleChatBtn.classList.toggle('active', chatOpen);
    // Xaritalar ochilganda - tanlangan xarita turgan bo'lim (mavsum) ko'rsatiladi
    if (mapOpen) {
        const cur = roomMaps.find(m => m.id === selectedLevel);
        if (cur) {
            mapsTab = mapSeasonOf(cur);
            document.querySelectorAll('.maps-tab').forEach(x => x.classList.toggle('active', x.dataset.tab === mapsTab));
            renderLevelList();
        }
    }
    if (chatOpen) {
        toggleChatBtn.classList.remove('has-new');
        chatBox.scrollTop = chatBox.scrollHeight;
        document.getElementById('chat-input').focus();
    }
}
toggleMapBtn.onclick = () => setLobbyPopup('map');
toggleChatBtn.onclick = () => setLobbyPopup('chat');
document.querySelectorAll('.popup-close').forEach((b) => { b.onclick = () => setLobbyPopup(null); });

// Xona kodi: ko'z tugmasi bilan yashirish/ko'rsatish (ekranni ulashganda)
let roomCodeHidden = false;
function renderRoomCode() {
    roomCodeValue.innerText = roomCodeHidden ? '\u2022'.repeat((currentRoomId || '').length || 6) : (currentRoomId || '');
    roomCodeValue.classList.toggle('code-hidden', roomCodeHidden);
    document.querySelector('#toggle-code-btn i').className = 'fa-solid ' + (roomCodeHidden ? 'fa-eye-slash' : 'fa-eye');
}
document.getElementById('toggle-code-btn').onclick = () => { roomCodeHidden = !roomCodeHidden; renderRoomCode(); };

// Xonada "Sizning personajingiz" - endi lobbida tanlanmaydi, "Mening Personajim"da
// (hisob darajasida) belgilangan personaj bilan avtomatik o'ynaysiz
function renderMyCharacterDisplay() {
    const type = currentUser.defaultCharacter || 'knight';
    myCharacterDisplay.innerHTML = `
        <span><i class="fa-solid fa-shield-halved" style="color:#00ffcc; margin-right:8px;"></i><b>${tCharName(type)}</b></span>
    `;
}

// LOBBIDAGI "Mening Personajim": faqat XONADA HOZIR TANLANGAN (hisob darajasidagi
// standart) personajga tegishli - boshqa personajlarni bu yerdan ko'rib/tanlab bo'lmaydi
openMyCharacterBtn.onclick = () => {
    openCharacterScreen({ locked: true, lockedType: currentUser.defaultCharacter || 'knight', returnPanel: lobbyPanel });
};

// Xarita tanlovi/ochilgan darajasi yangilanganda (masalan, raund yutilgach)
socket.on('updateRoomLevel', (data) => {
    unlockedLevel = data.unlockedLevel;
    selectedLevel = data.selectedLevel;
    renderLevelList();
});

// Xaritalar ro'yxatini (qulf holati bilan) chizish
// Xaritalar oynasi bo'limi: 's1' - 1-mavsum (hozirgi xaritalar), 'bonus' va 's2' - tez orada
document.querySelectorAll('.maps-tab').forEach((b) => {
    b.onclick = () => {
        mapsTab = b.dataset.tab;
        document.querySelectorAll('.maps-tab').forEach(x => x.classList.toggle('active', x === b));
        renderLevelList();
    };
});

// Xarita raqami o'z mavsumi ichida: S1 - 1..10, S2 - yana 1 dan; bonus - yulduzcha
function mapSeasonOf(m) { return m.bonus ? 'bonus' : (m.season || 1) === 2 ? 's2' : 's1'; }
function mapNumberLabel(id) {
    const m = roomMaps.find(x => x.id === id);
    if (!m) return (id + 1) + '. ';
    if (m.bonus) return '★ ';
    const tab = mapSeasonOf(m);
    return (roomMaps.filter(x => mapSeasonOf(x) === tab).findIndex(x => x.id === id) + 1) + '. ';
}

function renderLevelList() {
    const mapNameEl = document.getElementById('lobby-map-name');
    if (mapNameEl) mapNameEl.innerText = mapNumberLabel(selectedLevel) + tMapName(selectedLevel);
    levelListDiv.innerHTML = '';
    // BONUS - mashq xaritalari (doim ochiq); SEASON 1 - tugagan (10 ta); SEASON 2 - yangi xaritalar, oxirida "tez orada"
    const seasonMaps = roomMaps.filter(m => mapSeasonOf(m) === 's2');
    const shown = roomMaps.filter(m => mapSeasonOf(m) === mapsTab);
    if (!shown.length) {
        levelListDiv.innerHTML = `<div class="maps-soon"><i class="fa-solid fa-hourglass-half"></i>${t('coming_soon')}</div>`;
        return;
    }
    shown.forEach((m) => {
        const locked = !m.bonus && m.id > unlockedLevel;
        const isSelected = m.id === selectedLevel;
        const item = document.createElement('div');
        item.className = 'level-item' + (isSelected ? ' selected' : '') + (locked ? ' locked' : '') + (isRoomHost ? '' : ' readonly');
        const icon = locked ? '<i class="fa-solid fa-lock"></i>' : (isSelected ? '<i class="fa-solid fa-circle-check" style="color:#00ffcc;"></i>' : '<i class="fa-solid fa-circle"></i>');
        // Avval o'tilgan xarita: qayta o'ynasa bo'ladi, lekin ball berilmaydi
        const clearedTag = !m.bonus && m.id < unlockedLevel
            ? ` <span style="color:#aaa; font-size:12px;"><i class="fa-solid fa-flag-checkered"></i> ${t('level_cleared_tag')}</span>`
            : '';
        item.innerHTML = `<span>${icon} <span class="level-name">${m.bonus ? '<i class="fa-solid fa-star" style="color:#ffd54f;"></i> ' : mapNumberLabel(m.id)}${tMapName(m.id)}</span>${clearedTag}<span class="level-desc">${tMapDesc(m.id)}</span></span>`;
        if (isRoomHost && !locked) {
            item.onclick = () => {
                socket.emit('selectLevelInRoom', { roomId: currentRoomId, levelIndex: m.id });
                setLobbyPopup(null);
            };
        }
        levelListDiv.appendChild(item);
    });
    // Keyingi (hali chiqmagan) xarita - "TEZ ORADA": har yangilanishda o'zi bir raqam suriladi
    if (mapsTab === 's2' && seasonMaps.length) {
        const soon = document.createElement('div');
        soon.className = 'level-item locked readonly level-soon';
        soon.innerHTML = `<span><i class="fa-solid fa-hourglass-half"></i> <span class="level-name">${seasonMaps.length + 1}. ${t('coming_soon')}</span><span class="level-desc">${t('coming_soon_desc')}</span></span>`;
        levelListDiv.appendChild(soon);
    }
}

// Lobbidagi o'yinchilar ro'yxati yangilanganda
socket.on('updateLobbyPlayers', (data) => {
    latestPlayerListData = data;
    renderPlayerList(data);
});

function renderPlayerList(data) {
    playerListUl.innerHTML = '';
    playerCountSpan.innerText = data.players.length;
    // Xo'jayin almashgan bo'lishi mumkin (avvalgisi chiqib ketdi)
    const nowHost = data.hostId === socket.id;
    if (nowHost !== isRoomHost) { isRoomHost = nowHost; renderLevelList(); }
    updateHostControls();
    renderLobbySlots(data.players);

    data.players.forEach(p => {
        const li = document.createElement('li');
        li.style.color = p.id === socket.id ? '#00ffcc' : '#fff';
        const name = escapeHtml(p.nickname || t('guest_name'));
        const readyTick = p.isHost
            ? `<span style="color:#ffcc00;"><i class="fa-solid fa-crown"></i> ${t('host_tag')}</span>`
            : (p.isReady ? `<span class="ready-tick"><i class="fa-solid fa-check"></i> ${t('ready_tag')}</span>` : `<span class="ready-tick not-ready-tick"><i class="fa-solid fa-xmark"></i> ${t('not_ready_tag')}</span>`);
        const nameIcon = p.id === socket.id ? '<i class="fa-solid fa-star" style="color:#00ffcc;"></i>' : '<i class="fa-solid fa-user"></i>';
        li.innerHTML = `${nameIcon} ${name}${p.id === socket.id ? t('you_suffix') : ''} [${tCharName(p.characterType).toUpperCase()}] — ${readyTick}`;
        playerListUl.appendChild(li);

        // O'zimizning "Tayyor" tugmamiz ko'rinishini serverdagi haqiqiy holat bilan sinxronlaymiz
        if (p.id === socket.id) {
            if (p.isReady) {
                readyBtn.classList.add('is-ready');
                readyBtn.classList.remove('not-ready');
                readyBtn.innerHTML = `<i class="fa-solid fa-check icon"></i>${t('ready_confirmed_btn')}`;
            } else {
                readyBtn.classList.remove('is-ready');
                readyBtn.classList.add('not-ready');
                readyBtn.innerHTML = `<i class="fa-solid fa-check icon"></i>${t('ready_btn')}`;
            }
        }
    });
}


// LOBBI O'RINLARI: 4 ta - band o'rinda ism (xo'jayinda toj), qahramon (o'z skin ranglarida),
// daraja va tayyorlik; bo'sh o'rinda "+" (bosilsa - xona kodi nusxalanadi, do'st chaqirish uchun)
function renderLobbySlots(players) {
    const wrap = document.getElementById('lobby-slots');
    if (!wrap) return;
    wrap.innerHTML = '';
    const hex = (n, fb) => (typeof n === 'number' ? '#' + n.toString(16).padStart(6, '0') : fb);
    for (let i = 0; i < 4; i++) {
        const p = players[i];
        const slot = document.createElement('div');
        if (!p) {
            slot.className = 'slot empty';
            slot.innerHTML = `<div class="slot-name"></div><div class="slot-card"><span class="slot-plus">+</span></div>
                <div class="slot-pedestal"></div><div class="slot-hint">${t('slot_invite')}</div>`;
            slot.querySelector('.slot-card').onclick = () => {
                const hint = slot.querySelector('.slot-hint');
                const code = currentRoomId || '';
                const done = () => { hint.innerText = t('slot_copied'); setTimeout(() => { hint.innerText = t('slot_invite'); }, 1500); };
                if (navigator.clipboard) navigator.clipboard.writeText(code).then(done, done); else done();
            };
            wrap.appendChild(slot);
            continue;
        }
        const me = p.id === socket.id;
        slot.className = 'slot filled' + (me ? ' me' : '');
        const status = p.isHost ? ['host', t('host_tag')] : p.isReady ? ['ready', t('ready_tag')] : ['not-ready', t('not_ready_tag')];
        slot.innerHTML = `<div class="slot-name">${p.isHost ? '<i class="fa-solid fa-crown"></i>' : ''}</div>
            <div class="slot-card"><canvas class="slot-hero" width="32" height="40"></canvas></div>
            <div class="slot-pedestal"></div>
            <div class="slot-level">${t('slot_level')}: ${p.level || 0}</div>
            <div class="slot-status ${status[0]}">${status[1].toUpperCase()}</div>`;
        slot.querySelector('.slot-name').appendChild(document.createTextNode((p.nickname || t('guest_name')) + (me ? t('you_suffix') : '')));
        // Xo'jayinga: boshqa o'yinchini xonadan chiqarish (KICK)
        if (isRoomHost && !me) {
            const kick = document.createElement('button');
            kick.className = 'slot-kick';
            kick.title = t('kick_btn');
            kick.innerHTML = '<i class="fa-solid fa-xmark"></i>';
            kick.onclick = () => {
                if (confirm(t('kick_confirm').replace('{name}', p.nickname || t('guest_name')))) {
                    socket.emit('kickPlayer', { roomId: currentRoomId, targetId: p.id });
                }
            };
            slot.appendChild(kick);
        }
        slot.title = tCharName(p.characterType);
        drawHero(slot.querySelector('.slot-hero').getContext('2d'), p.characterType, hex(p.color, '#1e88e5'), p.look, -16, -8);
        wrap.appendChild(slot);
    }
}

// TAJRIBA: har o'tilgan xarita +10 XP, har keyingi darajaga kerakli XP ikki baravar
// (serverdagi xpLevel bilan bir xil hisob) - chiziq joriy darajadagi ulushni ko'rsatadi
// (xpProgress - perks.js da)
function renderXpBar(xp) {
    const pr = xpProgress(xp);
    const fill = document.getElementById('player-xp-fill');
    const bar = document.getElementById('player-xp-bar');
    if (fill) fill.style.width = Math.round(100 * pr.cur / pr.need) + '%';
    if (bar) bar.title = 'XP ' + pr.cur + ' / ' + pr.need;
}

// LOBBIDAN CHIQISH: xonani tark etib, bosh menyuga qaytamiz
leaveLobbyBtn.onclick = () => {
    socket.emit('leaveRoom');
    sessionStorage.removeItem('lastRoomId');
    currentRoomId = null;
    isRoomHost = false;
    latestPlayerListData = null;
    showPanel(mainMenuPanel);
    coinBalance.innerText = currentUser.coins;
};

// O'YINDAN CHIQISH (pauza menyusidan): o'yinni to'xtatib, xonadan chiqib, bosh menyuga
window.leaveGameToMenu = () => {
    if (typeof stopGame === 'function') stopGame();
    const lc = document.getElementById('level-complete');
    if (lc) lc.remove();
    gameWrapper.classList.add('hidden');
    touchControls.classList.add('hidden');
    if (window.GameAudio) { GameAudio.release(); GameAudio.setMode('menu'); }
    leaveLobbyBtn.onclick();
};
// Pauza menyusidagi ovoz - sozlamalardagi bilan bir xil
window.setGameVolume = (v) => {
    volumeSlider.value = v;
    localStorage.setItem('gameVolume', v);
    if (window.GameAudio) GameAudio.setVolume(v / 100);
};
window.setSfxVolume = (v) => {
    if (sfxSlider) sfxSlider.value = v;
    localStorage.setItem('sfxVolume', v);
    if (window.GameAudio) GameAudio.setSfxVolume(v / 100);
};

// "Tayyor" tugmasi bosilganda
readyBtn.onclick = () => {
    socket.emit('toggleReadyInRoom', currentRoomId);
};

// Host "Boshlash"ni bosganda, agar hamma tayyor bo'lmasa, server xato qaytaradi
socket.on('startError', (message) => {
    startErrorMsg.innerText = tMsg(message);
    setTimeout(() => { startErrorMsg.innerText = ''; }, 4000);
});

// --- 3. O'YINNI BOSHLASH ---

// O'yinni boshlash (Faqat Host bosa oladi)
startGameBtn.onclick = () => {
    socket.emit('requestStartGame', currentRoomId);
};


// ===== XARITA O'TILDI: O'YIN OYNASI ichida ko'k fon, o'rtada chekpoint nuriga o'xshash
// oq nur, "COMPLETED SUCCESSFULLY!", pastki o'ng burchakda yutuq (xarita nomi) chiqadi.
// Bosilsa yoki LEVEL_COMPLETE_MS dan so'ng yo'qoladi
const LEVEL_COMPLETE_MS = 3200;
let levelCompleteTimers = [];
// isLoss - mag'lubiyat varianti (to'q qizil, "GAME OVER", bosh suyagi)
// onBack berilsa (mag'lubiyat) - sahna o'zi yo'qolmaydi, "Lobbiga qaytish" tugmasini kutadi
function showLevelComplete(levelIndex, isLoss = false, onBack = null, xpGained = 0) {
    const host = document.getElementById('game-container');
    if (!host || typeof levelIndex !== 'number' || levelIndex < 0) return;
    if (window.GameAudio) GameAudio.sfx(isLoss ? 'lose' : 'win');
    const old = document.getElementById('level-complete');
    if (old) old.remove();
    levelCompleteTimers.forEach(clearTimeout);
    levelCompleteTimers = [];

    const el = document.createElement('div');
    el.id = 'level-complete';
    if (isLoss) el.classList.add('loss');
    el.innerHTML = `
        <div class="lc-beam"></div>
        <div class="lc-title"><span class="lc-map"></span><span class="lc-text"></span>${!isLoss && xpGained > 0 ? `<span class="lc-xp">+${xpGained} XP</span>` : ''}</div>
        <div class="lc-ach">
            <div class="lc-ach-icon"><i class="fa-solid ${isLoss ? 'fa-skull' : 'fa-trophy'}"></i></div>
            <div class="lc-ach-name"></div>
        </div>`;
    const name = tMapName(levelIndex);
    el.querySelector('.lc-map').textContent = name;
    el.querySelector('.lc-text').textContent = t(isLoss ? 'loss_title' : 'level_complete_sub');
    // Ba'zi xaritalarning yutug'i o'z nomiga ega (masalan map-9 - "UnderWorld")
    const achKey = 'map' + levelIndex + '_ach', ach = t(achKey);
    el.querySelector('.lc-ach-name').textContent = (!isLoss && ach !== achKey) ? ach : name;
    el.querySelector('.lc-ach').title = t(isLoss ? 'loss_sub1' : 'achievement_unlocked');
    // Nur ichida tepaga ko'tariluvchi yorug' zarrachalar (chekpointdagidek)
    for (let i = 0; i < 12; i++) {
        const m = document.createElement('div');
        m.className = 'lc-mote';
        m.style.left = (34 + Math.random() * 32) + '%';
        m.style.animationDuration = (1.4 + Math.random() * 1.4).toFixed(2) + 's';
        m.style.animationDelay = (Math.random() * 1.5).toFixed(2) + 's';
        el.appendChild(m);
    }
    host.appendChild(el);

    const hide = () => {
        levelCompleteTimers.forEach(clearTimeout);
        levelCompleteTimers = [];
        el.classList.remove('show');
        setTimeout(() => el.remove(), 300);
    };
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
    levelCompleteTimers.push(setTimeout(() => el.classList.add('ach-in'), 800));
    if (onBack) {
        const btn = document.createElement('button');
        btn.className = 'lc-back-btn';
        btn.innerHTML = '<i class="fa-solid fa-arrow-left"></i> ';
        btn.appendChild(document.createTextNode(t('back_to_lobby')));
        btn.onclick = (e) => {
            e.stopPropagation();
            btn.disabled = true;
            hide();
            onBack();
        };
        el.appendChild(btn);
        levelCompleteTimers.push(setTimeout(() => el.classList.add('btn-in'), 1100));
        return;
    }
    el.onclick = hide;
    levelCompleteTimers.push(setTimeout(hide, LEVEL_COMPLETE_MS));
}

// Server o'yin boshlandi deb buyruq berganda Phaser'ni yoqamiz
socket.on('gameStarted', (data) => {
    // Oldingi mag'lubiyat sahnasi ("Lobbiga qaytish" kutayotgan) yangi o'yinni yopib qolmasin
    const staleOverlay = document.getElementById('level-complete');
    if (staleOverlay) staleOverlay.remove();
    // Yangi xarita - musiqani yana o'yin boshqaradi
    if (window.GameAudio) GameAudio.release();
    levelCompleteTimers.forEach(clearTimeout);
    levelCompleteTimers = [];
    lobbyPanel.classList.add('hidden');
    gameWrapper.classList.remove('hidden');
    // Faqat "PHONE" boshqaruv turi tanlangan bo'lsa, ekrandagi virtual tugmalarni ko'rsatamiz
    touchControls.classList.toggle('hidden', getControlScheme() !== 'phone');

    // game.js ichidagi Phadser o'yinini ishga tushirish funksiyasi
    if (typeof launchGame === 'function') {
        launchGame(socket, currentRoomId, data && data.map, data && data.continued);
    }
    // Oldingi xarita o'tilib, avtomatik keyingisiga o'tildi
    if (data && data.continued) showLevelComplete(data.continued.fromLevel, false, null, data.continued.xpGained || 0);
});

// --- 4. G'ALABA VA TANGA MUKOFOTI ---

// QUTI SINDIRILDI: hisobdagi tanga yangilanadi (mehmonda totalCoins = null -
// saqlanmaydi), o'yin ichida esa "+10" yozuvi chiqadi
socket.on('coinsUpdated', (data) => {
    if (data.totalCoins !== null && data.totalCoins !== undefined && currentUser) {
        currentUser.coins = data.totalCoins;
        coinBalance.innerText = currentUser.coins;
        characterCoinBalance.innerText = currentUser.coins;
    }
    if (typeof window.onCoinsGained === 'function') window.onCoinsGained(data.amount);
});

socket.on('gameOver', (data) => {
    // Natija ko'rsatilayotganda - sokin ohang (o'yin sikli uni o'zgartirmaydi)
    if (window.GameAudio) GameAudio.lock('calm');
    // G'alabada ham, mag'lubiyatda ham - avval o'yin oynasida sahna, keyin natija oynasi
    if (!gameWrapper.classList.contains('hidden')) {
        if (data.isLoss) {
            // Mag'lubiyat: sahnadagi tugma bilan to'g'ridan-to'g'ri lobbiga qaytiladi
            showLevelComplete(data.fromLevel, true, () => {
                finishGameOver(data);
                gameoverOkBtn.onclick();
            });
        } else {
            showLevelComplete(data.fromLevel, false, null, data.xpGained || 0);
            setTimeout(() => finishGameOver(data), LEVEL_COMPLETE_MS);
        }
        return;
    }
    finishGameOver(data);
});

function finishGameOver(data) {
    const lc = document.getElementById('level-complete');
    if (lc) lc.remove();
    if (window.GameAudio) { GameAudio.release(); GameAudio.setMode('menu'); }
    // O'yin tugagach Phaser'ni to'liq to'xtatamiz (eski socket listenerlar/sprite'lar qolib ketmasin)
    if (typeof stopGame === 'function') stopGame();

    if (data.totalCoins !== null && data.totalCoins !== undefined && currentUser) {
        currentUser.coins = data.totalCoins;
        localStorage.setItem('gameUser', JSON.stringify(currentUser));
    }

    latestGameOverData = data;
    renderGameOver(data);

    gameWrapper.classList.add('hidden');
    touchControls.classList.add('hidden');
    showPanel(gameoverPanel);
}

function renderGameOver(data) {
    if (data.isLoss) {
        gameoverPanelEl.classList.add('loss-panel');
        gameoverTitle.className = 'gameover-title-loss';
        gameoverTitle.innerHTML = `<i class="fa-solid fa-skull icon"></i>${t('loss_title')}`;
        gameoverText.innerHTML = `<span style="color:#ff8080;">${t('loss_sub1')}</span><br><span style="color:#aaa; font-size:13px;">${t('loss_sub2')}</span>`;
    } else {
        gameoverPanelEl.classList.remove('loss-panel');
        gameoverTitle.className = 'gameover-title-win';
        gameoverTitle.innerHTML = `<i class="fa-solid fa-trophy icon"></i>${t('win_title')}`;
        let text = `<i class="fa-solid fa-star" style="color:#ffcc00;"></i> ${escapeHtml(data.winnerNickname)} ${t('win_by')}`;
        if (data.coinsAwarded > 0) {
            text += `<br><i class="fa-solid fa-coins icon" style="color:#ffcc00;"></i>+${data.coinsAwarded} ${t('coins_earned')}`;
        } else {
            text += `<br><span style="color:#aaa; font-size:13px;">${t('coins_note')}</span>`;
        }
        if (data.levelCleared) {
            text += `<br><span style="color:#00ffcc; font-size:13px;"><i class="fa-solid fa-unlock"></i> ${t('level_unlocked')}</span>`;
        }
        gameoverText.innerHTML = text;
    }
}

gameoverOkBtn.onclick = () => {
    // Sahifani qayta yuklamasdan, xuddi o'sha avvalgi lobbiga qaytamiz
    // (updateLobbyPlayers orqali "Tayyor" holatlari allaqachon serverda tozalangan)
    gameoverPanelEl.classList.remove('loss-panel');
    latestGameOverData = null;
    if (currentRoomId) {
        showPanel(lobbyPanel);
    } else {
        showPanel(mainMenuPanel);
    }
};

// --- 5. MENING PERSONAJIM: YAXSHILASHLAR (damage/stamina) VA SKINLAR (personajga bog'liq) ---

const CHARACTER_TYPES = ['knight', 'archer', 'mage', 'samurai'];

// opts: { locked: bool, lockedType?: string, returnPanel: HTMLElement }
async function openCharacterScreen(opts) {
    characterLocked = !!opts.locked;
    characterReturnPanel = opts.returnPanel;
    showPanel(characterPanel);
    // Ma'lumot kelguncha - bo'limlarda yuklanish belgisi (eski/bo'sh ro'yxat ko'rinmasin)
    characterPanel.classList.add('is-loading');
    upgradesContent.innerHTML = loaderHtml();
    shopContent.innerHTML = loaderHtml();
    weaponShopContent.innerHTML = loaderHtml();
    await Boot.wait(loadCharacterScreen());
    characterPanel.classList.remove('is-loading');
    selectedCharTab = characterLocked ? opts.lockedType : (currentUser.defaultCharacter || 'knight');
    renderCharTabs();
    charDetailsDesc.innerText = t('char_' + selectedCharTab + '_desc');
    renderUpgrades();
    renderShop();
    renderWeaponShop();
}

async function loadCharacterScreen() {
    if (!currentUser) return;
    characterCoinBalance.innerText = currentUser.coins;

    try {
        // Uchala so'rov bir vaqtda (ketma-ket kutilmaydi)
        const [skins, weaponSkins, cos, data] = await Promise.all([
            skinCatalog ? null : fetch('/api/skins').then(r => r.json()),
            weaponSkinCatalog ? null : fetch('/api/weapon-skins').then(r => r.json()),
            cosCatalog ? null : fetch('/api/cosmetics').then(r => r.json()),
            fetch('/api/character/' + currentUser.id).then(r => r.json())
        ]);
        if (skins) skinCatalog = skins.catalog;
        if (weaponSkins) weaponSkinCatalog = weaponSkins.catalog;
        if (cos && cos.success) cosCatalog = cos;
        if (data.success) {
            currentUser.defaultCharacter = data.defaultCharacter;
            currentUser.charXp = data.charXp || {};
            currentUser.upgrades = data.upgrades;
            currentUser.skillPoints = data.skillPoints;
            currentUser.ownedSkins = data.ownedSkins;
            currentUser.equippedSkins = data.equippedSkins;
            currentUser.ownedWeaponSkins = data.ownedWeaponSkins;
            currentUser.equippedWeaponSkins = data.equippedWeaponSkins;
            currentUser.ownedCosmetics = data.ownedCosmetics || [];
            currentUser.equippedCosmetics = data.equippedCosmetics || {};
            localStorage.setItem('gameUser', JSON.stringify(currentUser));
        }
    } catch (e) { /* tarmoq xatosi bo'lsa, eski ma'lumot bilan ko'rsatamiz */ }
}

// Personaj tanlash tablari (faqat bosh menyudan ochilganda ko'rinadi va bosiladi)
function renderCharTabs() {
    if (characterLocked) {
        charTabsDiv.classList.add('hidden');
        charLockedNote.classList.remove('hidden');
        return;
    }
    charLockedNote.classList.add('hidden');
    charTabsDiv.classList.remove('hidden');
    charTabsDiv.innerHTML = '';
    CHARACTER_TYPES.forEach((type) => {
        const btn = document.createElement('button');
        btn.className = 'char-tab-btn' + (type === selectedCharTab ? ' active' : '');
        btn.innerText = tCharName(type);
        btn.onclick = () => {
            if (selectedCharTab === type) return;
            selectedCharTab = type;
            renderCharTabs();
            charDetailsDesc.innerText = t('char_' + selectedCharTab + '_desc');
            renderUpgrades();
            renderShop();
            renderWeaponShop();
            // Keyingi safar ekran ochilganda shu personaj birinchi ko'rsatilishi uchun eslab qolamiz
            currentUser.defaultCharacter = type;
            fetch('/api/character/' + currentUser.id + '/default', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ characterType: type })
            }).catch(() => {});
        };
        charTabsDiv.appendChild(btn);
    });
}

// Har qanday buy/upgrade/equip amalidan so'ng, agar hozir bir xonada bo'lsak,
// serverga xonadagi jonli holatni (rang/kuch) qayta yuklashni so'raymiz
function syncRoomIfNeeded() {
    if (currentRoomId) {
        socket.emit('refreshCharacterInRoom', currentRoomId);
    }
}

// Tanlangan personajning darajasi, XP chizig'i va darajalarda ochiladigan imkoniyatlar
function renderPerks() {
    const box = document.getElementById('perks-content');
    if (!box) return;
    const xp = (currentUser.charXp && currentUser.charXp[selectedCharTab]) || 0;
    const pr = xpProgress(xp);
    document.getElementById('char-level-label').innerText = t('slot_level') + ' ' + pr.level;
    document.getElementById('char-xp-fill').style.width = Math.round(100 * pr.cur / pr.need) + '%';
    document.getElementById('char-xp-text').innerText = 'XP ' + pr.cur + ' / ' + pr.need;
    box.innerHTML = '';
    (PERK_TABLE[selectedCharTab] || []).forEach((perk) => {
        const open = pr.level >= perk.level;
        const row = document.createElement('div');
        row.className = 'perk-row ' + (open ? 'unlocked' : 'locked');
        row.innerHTML = `<span class="perk-lv">${t('perk_level')} ${perk.level}</span>
            <span><b>${open ? '' : '<i class="fa-solid fa-lock"></i> '}${t('perk_' + perk.id)}</b><span class="perk-desc">${t('perk_' + perk.id + '_d')}</span></span>`;
        box.appendChild(row);
    });
}

// Kuchaytirish narxi - YO ball, YO tanga (indeks - hozirgi daraja): server/src/perks.ts dagi UPGRADE_COSTS bilan bir xil
const UPGRADE_COSTS = [
    { points: 1, coins: 300 }, { points: 1, coins: 600 }, { points: 1, coins: 1000 },
    { points: 2, coins: 1600 }, { points: 2, coins: 2400 }
];

function renderUpgrades() {
    renderPerks();
    const points = (currentUser.skillPoints && currentUser.skillPoints[selectedCharTab]) || 0;
    skillPointsValue.innerText = points;
    upgradesContent.innerHTML = '';

    const stats = [
        { key: 'hp', icon: 'fa-heart', nameKey: 'char_hp', descKey: 'char_hp_desc' },
        { key: 'regen', icon: 'fa-heart-pulse', nameKey: 'char_regen', descKey: 'char_regen_desc' },
        { key: 'damage', icon: 'fa-hand-fist', nameKey: 'char_damage', descKey: 'char_damage_desc' },
        { key: 'stamina', icon: 'fa-bolt', nameKey: 'char_stamina', descKey: 'char_stamina_desc' }
    ];
    // 3-darajadan: qurol kuchaytirishlari (knight - drobovik, samurai - kunai)
    const WEAPON_STATS = {
        knight: [{ key: 'shotgunDamage', icon: 'fa-burst', nameKey: 'up_shotgun_dmg', descKey: 'up_shotgun_dmg_d' },
                 { key: 'shotgunMag', icon: 'fa-box', nameKey: 'up_shotgun_mag', descKey: 'up_shotgun_mag_d' }],
        samurai: [{ key: 'kunaiDamage', icon: 'fa-khanda', nameKey: 'up_kunai_dmg', descKey: 'up_kunai_dmg_d' }]
    };
    const charLevel = xpProgress((currentUser.charXp && currentUser.charXp[selectedCharTab]) || 0).level;
    (WEAPON_STATS[selectedCharTab] || []).forEach(st => stats.push({ ...st, needLevel: 3, locked: charLevel < 3 }));

    const charUpgrades = (currentUser.upgrades && currentUser.upgrades[selectedCharTab]) || { damage: 0, stamina: 0 };

    stats.forEach((stat) => {
        const level = charUpgrades[stat.key] || 0;
        const row = document.createElement('div');
        row.className = 'upgrade-row';

        const dots = Array.from({ length: 5 }, (_, i) =>
            `<span class="upgrade-dot ${i < level ? 'filled' : ''}"></span>`
        ).join('');

        const info = document.createElement('div');
        info.className = 'upgrade-info';
        info.innerHTML = `
            <span class="upgrade-name"><i class="fa-solid ${stat.icon}" style="color:#00ffcc; margin-right:6px;"></i>${t(stat.nameKey)}</span>
            <span class="upgrade-desc">${t(stat.descKey)}</span>
            <div class="upgrade-dots">${dots}</div>
        `;
        row.appendChild(info);

        // Kuchaytirish hisobga bog'liq - bosh menyudan ham, lobbidan ham qilish mumkin
        if (stat.locked || level >= 5) {
            const btn = document.createElement('button');
            if (stat.locked) {
                row.classList.add('locked-upgrade');
                btn.innerHTML = `<i class="fa-solid fa-lock"></i> ${t('perk_level')} ${stat.needLevel}`;
            } else {
                btn.innerText = t('char_maxed');
            }
            btn.disabled = true;
            row.appendChild(btn);
        } else {
            // Narx: YO ball, YO tanga - o'yinchi tanlaydi (server/src/perks.ts dagi UPGRADE_COSTS bilan bir xil)
            const cost = UPGRADE_COSTS[level];
            const pay = document.createElement('div');
            pay.className = 'upgrade-pay';
            const byPoints = document.createElement('button');
            byPoints.className = 'upgrade-pay-points';
            byPoints.innerHTML = `<i class="fa-solid fa-star"></i> ${cost.points}`;
            byPoints.title = t('upgrade_pay_points').replace('{n}', cost.points);
            byPoints.disabled = points < cost.points;
            byPoints.onclick = () => withBusy(byPoints, () => upgradeStat(stat.key, 'points'));
            const byCoins = document.createElement('button');
            byCoins.className = 'upgrade-pay-coins';
            byCoins.innerHTML = `<i class="fa-solid fa-coins"></i> ${cost.coins}`;
            byCoins.title = t('upgrade_pay_coins').replace('{n}', cost.coins);
            byCoins.disabled = (currentUser.coins || 0) < cost.coins;
            byCoins.onclick = () => withBusy(byCoins, () => upgradeStat(stat.key, 'coins'));
            pay.appendChild(byPoints);
            pay.appendChild(byCoins);
            row.appendChild(pay);
        }

        upgradesContent.appendChild(row);
    });

    if (points <= 0) {
        const note = document.createElement('p');
        note.className = 'settings-note';
        note.style.textAlign = 'center';
        note.innerText = t('char_no_points');
        upgradesContent.appendChild(note);
    }
}

async function upgradeStat(stat, payWith = 'points') {
    try {
        const res = await fetch('/api/character/' + currentUser.id + '/upgrade', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ characterType: selectedCharTab, stat, roomId: currentRoomId, payWith })
        });
        const data = await res.json();
        if (data.success) {
            currentUser.upgrades = data.user.upgrades;
            currentUser.skillPoints = data.user.skillPoints;
            currentUser.coins = data.user.coins;
            localStorage.setItem('gameUser', JSON.stringify(currentUser));
            characterCoinBalance.innerText = currentUser.coins;
            coinBalance.innerText = currentUser.coins;
            renderUpgrades();
            renderShop();
            syncRoomIfNeeded();
        } else {
            alert(tMsg(data.message));
        }
    } catch (e) {
        alert(t('server_unreachable'));
    }
}

// Skinlar faqat hozir tanlangan personaj (tab) uchun ko'rsatiladi
function renderShop() {
    shopContent.innerHTML = '';
    drawCharPreview();
    if (!skinCatalog) return;

    const charType = selectedCharTab;
    const owned = (currentUser.ownedSkins && currentUser.ownedSkins[charType]) || ['default'];
    const equipped = (currentUser.equippedSkins && currentUser.equippedSkins[charType]) || 'default';

    (skinCatalog[charType] || []).forEach((skin) => {
        const row = document.createElement('div');
        row.className = 'skin-row';

        const isOwned = owned.includes(skin.id);
        const isEquipped = equipped === skin.id;
        const colorHex = '#' + skin.color.toString(16).padStart(6, '0');
        // Kombinatsiyali skin: namunada ikki rang (tana va visor/belbog')
        const swatchBg = skin.accent ? `linear-gradient(135deg, ${colorHex} 0 58%, #${skin.accent.toString(16).padStart(6, '0')} 58% 100%)` : colorHex;

        const left = document.createElement('span');
        left.innerHTML = `<span class="skin-swatch" style="background:${swatchBg}"></span>${tSkinName('skin', charType, skin)}${skin.price > 0 ? ' — <i class="fa-solid fa-coins" style="color:#ffcc00;"></i>' + skin.price : ' (' + t('free_label') + ')'}`;
        row.appendChild(left);

        const btn = document.createElement('button');
        if (isEquipped) {
            btn.innerHTML = `${t('equipped_label')} <i class="fa-solid fa-check"></i>`;
            btn.className = 'skin-equip-btn equipped';
        } else if (isOwned) {
            btn.innerText = t('equip_btn');
            btn.className = 'skin-equip-btn';
            btn.onclick = () => equipSkin(charType, skin.id);
        } else {
            btn.innerText = t('buy_btn');
            btn.className = 'skin-buy-btn';
            btn.onclick = () => buySkin(charType, skin.id);
        }
        row.appendChild(btn);
        shopContent.appendChild(row);
    });
    renderCosmetics();
}

// ===== DETALLAR: bosh kiyimi, yuz buyumi (hamma personajga umumiy), qurol ko'rinishlari (personajga) =====
const cosSlotsFor = (charType) => ['head', 'face', ...Object.keys((cosCatalog && cosCatalog.weapons[charType]) || {})];
const cosKey = (charType, slot, id) => (slot === 'head' || slot === 'face') ? slot + ':' + id : charType + '.' + slot + ':' + id;
function cosName(slot, item) {
    const k = 'cos_' + slot + '_' + item.id, v = t(k);
    return v === k ? item.name : v;
}
function renderCosmetics() {
    const tabs = document.getElementById('cos-tabs');
    const grid = document.getElementById('cos-grid');
    if (!tabs || !grid) return;
    tabs.innerHTML = '';
    grid.innerHTML = '';
    if (!cosCatalog) return;
    const charType = selectedCharTab;
    const slots = cosSlotsFor(charType);
    if (!slots.includes(selectedCosSlot)) selectedCosSlot = 'head';
    slots.forEach((slot) => {
        const b = document.createElement('button');
        b.className = 'cos-tab' + (slot === selectedCosSlot ? ' active' : '');
        b.innerText = t('slot_' + slot);
        b.onclick = () => { selectedCosSlot = slot; renderCosmetics(); };
        tabs.appendChild(b);
    });

    const items = selectedCosSlot === 'head' ? cosCatalog.head : selectedCosSlot === 'face' ? cosCatalog.face : cosCatalog.weapons[charType][selectedCosSlot];
    const owned = currentUser.ownedCosmetics || [];
    const equipped = ((currentUser.equippedCosmetics || {})[charType] || {})[selectedCosSlot];
    items.forEach((item) => {
        const isOwned = owned.includes(cosKey(charType, selectedCosSlot, item.id));
        const isEquipped = equipped === item.id;
        const card = document.createElement('div');
        card.className = 'cos-card' + (isEquipped ? ' equipped' : '');
        const icon = document.createElement('canvas');
        icon.width = 44; icon.height = 36;
        icon.className = 'cos-icon';
        Cosmetics.drawIcon(icon, selectedCosSlot, item.id);
        card.appendChild(icon);
        const name = document.createElement('div');
        name.className = 'cos-name';
        name.innerText = cosName(selectedCosSlot, item);
        card.appendChild(name);
        const btn = document.createElement('button');
        if (isEquipped) {
            btn.className = 'skin-equip-btn equipped';
            btn.innerText = t('remove_btn');
            btn.onclick = () => withBusy(btn, () => equipCosmetic(charType, selectedCosSlot, null));
        } else if (isOwned) {
            btn.className = 'skin-equip-btn';
            btn.innerText = t('equip_btn');
            btn.onclick = () => withBusy(btn, () => equipCosmetic(charType, selectedCosSlot, item.id));
        } else {
            btn.className = 'skin-buy-btn';
            btn.innerHTML = `<i class="fa-solid fa-coins"></i> ${item.price}`;
            btn.onclick = () => withBusy(btn, () => buyCosmetic(charType, selectedCosSlot, item));
        }
        card.appendChild(btn);
        grid.appendChild(card);
    });
}
async function cosRequest(action, body) {
    try {
        const res = await fetch('/api/cosmetics/' + currentUser.id + '/' + action, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (!data.success) { alert(tMsg(data.message)); return null; }
        currentUser.coins = data.user.coins;
        currentUser.ownedCosmetics = data.user.ownedCosmetics;
        currentUser.equippedCosmetics = data.user.equippedCosmetics;
        localStorage.setItem('gameUser', JSON.stringify(currentUser));
        characterCoinBalance.innerText = currentUser.coins;
        coinBalance.innerText = currentUser.coins;
        return data;
    } catch (e) {
        alert(t('server_unreachable'));
        return null;
    }
}
// Sotib olingach darhol kiydiriladi
async function buyCosmetic(charType, slot, item) {
    if (!confirm(t('cos_buy_confirm').replace('{name}', cosName(slot, item)).replace('{price}', item.price))) return;
    if (await cosRequest('buy', { characterType: charType, slot, itemId: item.id })) {
        await cosRequest('equip', { characterType: charType, slot, itemId: item.id });
    }
    drawCharPreview();
    renderCosmetics();
}
async function equipCosmetic(charType, slot, itemId) {
    await cosRequest('equip', { characterType: charType, slot, itemId });
    drawCharPreview();
    renderCosmetics();
}

// Skin sotib olish/kiyish endi hisobga (userId) bog'liq REST so'rovlar orqali ishlaydi -
// XONADA bo'lish-bo'lmasligidan qat'i nazar to'g'ri ishlaydi (ilgari faqat xonada
// bo'lganda ishlab, aks holda "ro'yxatdan o'tmagansiz" degan noto'g'ri xato berardi)
async function buySkin(characterType, skinId) {
    try {
        const res = await fetch('/api/skins/' + currentUser.id + '/buy', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ characterType, skinId })
        });
        const data = await res.json();
        if (data.success) {
            applyShopUpdate(data.user);
            syncRoomIfNeeded();
        } else {
            alert(tMsg(data.message));
        }
    } catch (e) {
        alert(t('server_unreachable'));
    }
}

async function equipSkin(characterType, skinId) {
    try {
        const res = await fetch('/api/skins/' + currentUser.id + '/equip', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ characterType, skinId })
        });
        const data = await res.json();
        if (data.success) {
            applyShopUpdate(data.user);
            syncRoomIfNeeded();
        } else {
            alert(tMsg(data.message));
        }
    } catch (e) {
        alert(t('server_unreachable'));
    }
}

function applyShopUpdate(user) {
    currentUser.coins = user.coins;
    currentUser.ownedSkins = user.ownedSkins;
    currentUser.equippedSkins = user.equippedSkins;
    currentUser.ownedWeaponSkins = user.ownedWeaponSkins;
    currentUser.equippedWeaponSkins = user.equippedWeaponSkins;
    localStorage.setItem('gameUser', JSON.stringify(currentUser));
    characterCoinBalance.innerText = currentUser.coins;
    renderShop();
    renderWeaponShop();
}

// QUROL SKINLARI - tana skinidan ALOHIDA turkum, faqat qurol/o'q rangini o'zgartiradi
function renderWeaponShop() {
    weaponShopContent.innerHTML = '';
    if (!weaponSkinCatalog) return;

    const charType = selectedCharTab;
    const owned = (currentUser.ownedWeaponSkins && currentUser.ownedWeaponSkins[charType]) || ['default'];
    const equipped = (currentUser.equippedWeaponSkins && currentUser.equippedWeaponSkins[charType]) || 'default';

    (weaponSkinCatalog[charType] || []).forEach((skin) => {
        const row = document.createElement('div');
        row.className = 'skin-row';

        const isOwned = owned.includes(skin.id);
        const isEquipped = equipped === skin.id;
        const colorHex = '#' + skin.color.toString(16).padStart(6, '0');
        // Kombinatsiyali skin: namunada ikki rang (tana va visor/belbog')
        const swatchBg = skin.accent ? `linear-gradient(135deg, ${colorHex} 0 58%, #${skin.accent.toString(16).padStart(6, '0')} 58% 100%)` : colorHex;

        const left = document.createElement('span');
        left.innerHTML = `<span class="skin-swatch" style="background:${swatchBg}"></span>${tSkinName('wskin', charType, skin)}${skin.price > 0 ? ' — <i class="fa-solid fa-coins" style="color:#ffcc00;"></i>' + skin.price : ' (' + t('free_label') + ')'}`;
        row.appendChild(left);

        const btn = document.createElement('button');
        if (isEquipped) {
            btn.innerHTML = `${t('equipped_label')} <i class="fa-solid fa-check"></i>`;
            btn.className = 'skin-equip-btn equipped';
        } else if (isOwned) {
            btn.innerText = t('equip_btn');
            btn.className = 'skin-equip-btn';
            btn.onclick = () => equipWeaponSkin(charType, skin.id);
        } else {
            btn.innerText = t('buy_btn');
            btn.className = 'skin-buy-btn';
            btn.onclick = () => buyWeaponSkin(charType, skin.id);
        }
        row.appendChild(btn);
        weaponShopContent.appendChild(row);
    });
}

async function buyWeaponSkin(characterType, skinId) {
    try {
        const res = await fetch('/api/weapon-skins/' + currentUser.id + '/buy', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ characterType, skinId })
        });
        const data = await res.json();
        if (data.success) {
            applyShopUpdate(data.user);
            syncRoomIfNeeded();
        } else {
            alert(tMsg(data.message));
        }
    } catch (e) {
        alert(t('server_unreachable'));
    }
}

async function equipWeaponSkin(characterType, skinId) {
    try {
        const res = await fetch('/api/weapon-skins/' + currentUser.id + '/equip', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ characterType, skinId })
        });
        const data = await res.json();
        if (data.success) {
            applyShopUpdate(data.user);
            syncRoomIfNeeded();
        } else {
            alert(tMsg(data.message));
        }
    } catch (e) {
        alert(t('server_unreachable'));
    }
}

// --- 6. LOBBI CHATI ---

function sendChat() {
    const text = chatInput.value.trim();
    if (!text || !currentRoomId) return;
    socket.emit('sendLobbyChat', { roomId: currentRoomId, text });
    chatInput.value = '';
}

chatSendBtn.onclick = sendChat;
chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendChat();
});

socket.on('lobbyChatMessage', (data) => {
    const line = document.createElement('div');
    line.className = 'chat-line';
    const time = new Date(data.timestamp).toLocaleTimeString().slice(0, 5);
    line.innerHTML = `<span class="chat-nick">${escapeHtml(data.nickname)}:</span> ${escapeHtml(data.text)} <span style="color:#666; font-size:11px;">${time}</span>`;
    chatBox.appendChild(line);
    chatBox.scrollTop = chatBox.scrollHeight;
    if (lobbyChatSection.classList.contains('hidden')) toggleChatBtn.classList.add('has-new');
});

// Chatga yozilgan matnni xavfsiz ko'rsatish uchun (HTML in'ektsiyasining oldini olish)
function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}


// ===== MENYU FONI: jonli piksel manzara (kechki osmon, yulduzlar, oy, bulutlar, tog'lar,
// derazalari yonib turgan qal'a, daraxtlar). Kichik o'lchamda chizilib, "pikselli" kattalashadi =====
(function initMenuBackground() {
    const cv = document.getElementById('menu-bg');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const W = 320;
    let H = 180;
    const stars = Array.from({ length: 70 }, (_, i) => ({ x: (i * 97) % W, y: (i * 53) % 90, p: i % 7 }));
    const clouds = [{ x: 30, y: 30, w: 46 }, { x: 170, y: 18, w: 60 }, { x: 260, y: 44, w: 38 }];
    // Tog'lar/tepaliklar - bir marta hisoblanadi (sinus yig'indisi, 2px qadam)
    const ridge = (base, amp, f1, f2) => Array.from({ length: W / 2 + 1 }, (_, i) =>
        Math.round(base - amp * (Math.abs(Math.sin(i * f1)) * 0.7 + Math.abs(Math.sin(i * f2 + 1)) * 0.3)));
    let far, mid;
    function resize() {
        H = Math.max(140, Math.round(W * window.innerHeight / Math.max(1, window.innerWidth)));
        cv.width = W; cv.height = H;
        far = ridge(H * 0.62, 34, 0.045, 0.13);
        mid = ridge(H * 0.76, 22, 0.07, 0.19);
    }
    function rect(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }
    function draw(tMs) {
        const t = tMs / 1000;
        // Osmon - pog'onali (silliq emas)
        const sky = ['#140f2b', '#1c1438', '#2a1a48', '#3d2156', '#5a2a5e', '#7b3662', '#a2485f'];
        const band = Math.ceil(H * 0.7 / sky.length);
        sky.forEach((c, i) => rect(0, i * band, W, band, c));
        rect(0, sky.length * band, W, H, sky[sky.length - 1]);
        // Yulduzlar (miltillaydi)
        stars.forEach((s, i) => {
            if (((Math.floor(t * 2) + s.p) % 7) === 0) return;
            rect(s.x, s.y, 1, 1, i % 5 === 0 ? '#ffe082' : '#e8e4ff');
        });
        // Oy
        rect(250, 22, 14, 14, '#fff3c4'); rect(248, 24, 18, 10, '#fff3c4'); rect(252, 20, 10, 18, '#fff3c4');
        rect(255, 26, 3, 3, '#e6d9a3'); rect(259, 31, 2, 2, '#e6d9a3');
        // Bulutlar (sekin suzadi)
        clouds.forEach((c, i) => {
            const x = ((c.x + t * (3 + i)) % (W + 80)) - 60;
            rect(x, c.y, c.w, 6, '#6b3f7a'); rect(x + 6, c.y - 4, c.w - 16, 4, '#6b3f7a'); rect(x + 4, c.y + 6, c.w - 8, 2, '#4d2d5e');
        });
        // Uzoq tog'lar
        far.forEach((y, i) => rect(i * 2, y, 2, H - y, '#2b1d45'));
        // Qal'a (o'yindagi kabi): devor, minoralar, bayroqlar, yonib turgan derazalar
        const cx = Math.round(W * 0.58), gy = Math.round(H * 0.7);
        rect(cx - 50, gy - 26, 100, 40, '#1e1535');
        for (let x = cx - 50; x < cx + 50; x += 8) rect(x, gy - 30, 4, 4, '#1e1535');
        [[cx - 58, 44], [cx - 10, 60], [cx + 42, 48]].forEach(([x, h], k) => {
            rect(x, gy - h, 16, h + 14, '#1e1535');
            rect(x - 2, gy - h - 4, 20, 4, '#1e1535');
            for (let s = 0; s < 4; s++) rect(x + s * 2, gy - h - 8 - s * 3, 16 - s * 4, 3, '#2a1c47');
            rect(x + 7, gy - h - 22, 1, 10, '#1e1535');
            rect(x + 8, gy - h - 22 + (Math.floor(t * 3 + k) % 2), 6, 4, k === 1 ? '#40c4ff' : '#ff5252');
            const lit = (Math.floor(t * 1.5 + k * 3) % 5) !== 0;
            rect(x + 6, gy - h + 10, 4, 6, lit ? '#ffca28' : '#6d4c00');
            rect(x + 6, gy - h + 24, 4, 6, '#ffb300');
        });
        // Yaqin tepaliklar va daraxtlar
        mid.forEach((y, i) => rect(i * 2, y, 2, H - y, '#1a1230'));
        for (let i = 0; i < 16; i++) {
            const x = (i * 23 + 7) % W, y = mid[Math.floor(x / 2)] + 2;
            rect(x - 1, y - 4, 3, 6, '#120c22');
            rect(x - 5, y - 10, 11, 6, '#150e28'); rect(x - 3, y - 15, 7, 5, '#150e28'); rect(x - 1, y - 18, 3, 3, '#150e28');
        }
        // O't-yer
        rect(0, H - 10, W, 10, '#0e0a1c');
        for (let x = 0; x < W; x += 4) rect(x, H - 11 - ((x * 7) % 3), 2, 2, '#1d3b2c');
        // O'qish oson bo'lsin - ustidan yengil qoraytirish
        rect(0, 0, W, H, 'rgba(8,6,18,0.28)');
    }
    let last = 0;
    function loop(ts) {
        // O'yin ketayotganda fon ko'rinmaydi - chizmaymiz (resurs tejash)
        const inGame = !document.getElementById('game-wrapper').classList.contains('hidden');
        if (!inGame && ts - last > 66) { last = ts; draw(ts); }
        requestAnimationFrame(loop);
    }
    resize();
    window.addEventListener('resize', resize);
    requestAnimationFrame(loop);
})();

// "MY CHARACTER": tanlangan personaj - o'yindagi ko'rinishida (tana skin rangi, visor, quroli)
function drawCharPreview() {
    const cv = document.getElementById('char-preview');
    if (!cv || !currentUser) return;
    const ctx = cv.getContext('2d');
    const type = selectedCharTab;
    const pick = (catalog, equippedMap) => {
        const id = (equippedMap && equippedMap[type]) || 'default';
        const list = (catalog && catalog[type]) || [];
        const skin = list.find(s => s.id === id) || list[0];
        return skin ? '#' + (skin.color + (skin.accent || 0) * 0x1000000).toString(16).padStart(6, '0') : null;
    };
    const body = pick(skinCatalog, currentUser.equippedSkins) || '#1e88e5';
    ctx.clearRect(0, 0, 64, 48);
    drawHero(ctx, type, body, (currentUser.equippedCosmetics || {})[type], 0, 0);
}

// Qahramon rasmi - o'yindagi bilan bir xil (cosmetics.js): tana skin rangi, visor, quroli va
// kiyilgan detallar (look: "cowboy|hockey|..." satri yoki { head, face, sword, ... } obyekti).
// (ox, oy) - siljish: 64x48 lik chizmaning qaysi qismi ko'rinishi
function drawHero(ctx, type, body, look, ox, oy) {
    Cosmetics.drawHero(ctx, type, body, look, ox, oy);
}

// Hamma yuklanish vazifalari ro'yxatga qo'shildi (saqlangan bo'limni tiklash ham - u ham setTimeout 0 da) - endi kutamiz
setTimeout(() => Boot.start(), 0);
