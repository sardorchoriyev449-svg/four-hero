// OVOZLI CHAT: xonadagi o'yinchilar bir-birini eshitadi va gapira oladi (WebRTC - ovoz o'yinchilar o'rtasida
// to'g'ridan-to'g'ri, server faqat ulanish ma'lumotini uzatadi). Mikrofonga ruxsat berilmasa ham - eshitish mumkin.
// Gapirayotganlar: lobbida o'rni yonadi, o'yinda boshi tepasida tovush belgisi (window.voiceSpeaking)
const Voice = (() => {
    const ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }, { urls: 'stun:stun2.l.google.com:19302' }];
    let on = false, micOn = true, stream = null, roomId = null, actx = null, myAnalyser = null;
    const peers = {};          // socketId -> { pc, audio, analyser, pending: [] }
    let members = [];          // ovozli chatdagilar (server)
    window.voiceSpeaking = new Set();

    const lobbyBtn = document.getElementById('voice-btn');
    const micBtn = document.getElementById('voice-mic-btn');
    // O'yin ichidagi tugma (pauza tugmasi yonida)
    const gameBtn = document.createElement('button');
    gameBtn.id = 'voice-game-btn';
    gameBtn.onpointerdown = (e) => e.stopPropagation();
    gameBtn.onclick = (e) => { e.stopPropagation(); if (!on) start(); else toggleMic(); };
    const container = document.getElementById('game-container');
    if (container) container.appendChild(gameBtn);

    function ensureCtx() {
        if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; } }
        if (actx && actx.state === 'suspended') actx.resume().catch(() => {});
        return actx;
    }
    function makeAnalyser(ms) {
        const c = ensureCtx();
        if (!c || !ms) return null;
        try { const src = c.createMediaStreamSource(ms); const a = c.createAnalyser(); a.fftSize = 512; src.connect(a); return a; } catch (e) { return null; }
    }
    const level = (a) => {
        if (!a) return 0;
        const buf = new Uint8Array(a.fftSize); a.getByteTimeDomainData(buf);
        let sum = 0; for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
        return Math.sqrt(sum / buf.length);
    };

    function updateUI() {
        const icon = !on ? 'fa-headphones' : (stream && micOn ? 'fa-microphone' : 'fa-microphone-slash');
        if (lobbyBtn) {
            lobbyBtn.classList.toggle('voice-on', on);
            lobbyBtn.innerHTML = `<i class="fa-solid ${on ? 'fa-phone-slash' : 'fa-headphones'} icon"></i><span>${t(on ? 'voice_leave' : 'voice_join')}</span>`;
        }
        if (micBtn) {
            micBtn.classList.toggle('hidden', !on);
            micBtn.disabled = !stream;
            micBtn.classList.toggle('mic-off', !stream || !micOn);
            // Faqat ikonka (lobbi tugmalari telefonda sig'sin), matn - sichqoncha ustida
            micBtn.innerHTML = `<i class="fa-solid ${stream && micOn ? 'fa-microphone' : 'fa-microphone-slash'}"></i>`;
            micBtn.title = t(!stream ? 'voice_no_mic' : micOn ? 'voice_mic_on' : 'voice_mic_off');
        }
        gameBtn.innerHTML = `<i class="fa-solid ${icon}"></i>`;
        gameBtn.title = t(!on ? 'voice_join' : micOn ? 'voice_mic_on' : 'voice_mic_off');
        gameBtn.classList.toggle('voice-on', on && !!stream && micOn);
    }

    function closePeer(id) {
        const p = peers[id];
        if (!p) return;
        try { p.pc.close(); } catch (e) { }
        if (p.audio) { p.audio.srcObject = null; p.audio.remove(); }
        delete peers[id];
        window.voiceSpeaking.delete(id);
    }
    function makePeer(id, initiator) {
        closePeer(id);
        const pc = new RTCPeerConnection({ iceServers: ICE });
        const p = peers[id] = { pc, audio: null, analyser: null, pending: [] };
        if (stream) stream.getTracks().forEach(tr => pc.addTrack(tr, stream));
        else pc.addTransceiver('audio', { direction: 'recvonly' });   // mikrofonsiz - faqat eshitadi
        pc.onicecandidate = (e) => { if (e.candidate) socket.emit('voiceSignal', { to: id, data: { candidate: e.candidate } }); };
        pc.ontrack = (e) => {
            const ms = e.streams && e.streams[0] ? e.streams[0] : new MediaStream([e.track]);
            if (!p.audio) { p.audio = document.createElement('audio'); p.audio.autoplay = true; p.audio.playsInline = true; document.body.appendChild(p.audio); }
            p.audio.srcObject = ms;
            p.audio.volume = voiceVolume();
            p.audio.play().catch(() => {});
            p.analyser = makeAnalyser(ms);
        };
        pc.onconnectionstatechange = () => {
            // Ulanish uzilsa - qayta urinish (taklifni har doim kichik ID li tomon yuboradi - ikki tomon bir vaqtda emas)
            if (pc.connectionState === 'failed' && on && members.includes(id)) setTimeout(() => { if (on && peers[id] && peers[id].pc === pc) makePeer(id, socket.id < id); }, 1500);
        };
        if (initiator) {
            pc.createOffer().then(o => pc.setLocalDescription(o))
                .then(() => socket.emit('voiceSignal', { to: id, data: { sdp: pc.localDescription } })).catch(() => {});
        }
        return p;
    }
    const voiceVolume = () => { const v = parseFloat(localStorage.getItem('voiceVolume')); return isNaN(v) ? 1 : Math.max(0, Math.min(1, v / 100)); };

    async function start() {
        if (on || !currentRoomId) return;
        on = true;
        roomId = currentRoomId;
        ensureCtx();
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
            stream.getAudioTracks().forEach(tr => { tr.enabled = micOn; });
            myAnalyser = makeAnalyser(stream);
        } catch (e) {
            stream = null;   // ruxsat yo'q / mikrofon yo'q - faqat eshitamiz
        }
        if (!on) { stopStream(); return; }
        socket.emit('voiceJoin', roomId);
        updateUI();
    }
    function stopStream() { if (stream) stream.getTracks().forEach(tr => tr.stop()); stream = null; myAnalyser = null; }
    function stop() {
        if (!on) return;
        on = false;
        socket.emit('voiceLeave');
        Object.keys(peers).forEach(closePeer);
        stopStream();
        window.voiceSpeaking.clear();
        updateUI();
    }
    function toggleMic() {
        if (!stream) return;
        micOn = !micOn;
        stream.getAudioTracks().forEach(tr => { tr.enabled = micOn; });
        updateUI();
    }

    // Signallar
    socket.on('voicePeers', (ids) => { if (!on || !Array.isArray(ids)) return; ids.forEach(id => makePeer(id, true)); });
    socket.on('voiceMembers', (ids) => { members = Array.isArray(ids) ? ids : []; });
    socket.on('voicePeerLeft', (d) => { if (d && d.id) closePeer(d.id); });
    socket.on('voiceSignal', async ({ from, data }) => {
        if (!on || !from || !data) return;
        let p = peers[from];
        try {
            if (data.sdp) {
                if (data.sdp.type === 'offer') p = makePeer(from, false);
                if (!p) return;
                await p.pc.setRemoteDescription(data.sdp);
                for (const c of p.pending.splice(0)) await p.pc.addIceCandidate(c).catch(() => {});
                if (data.sdp.type === 'offer') {
                    const ans = await p.pc.createAnswer();
                    await p.pc.setLocalDescription(ans);
                    socket.emit('voiceSignal', { to: from, data: { sdp: p.pc.localDescription } });
                }
            } else if (data.candidate && p) {
                if (!p.pc.remoteDescription) p.pending.push(data.candidate);
                else await p.pc.addIceCandidate(data.candidate).catch(() => {});
            }
        } catch (e) { /* buzilgan signal - e'tiborsiz */ }
    });
    // Xonadan chiqdi / chiqarildi / xona yopildi - ovozli chat ham tugaydi
    ['kickedFromRoom', 'roomClosed', 'accountBanned'].forEach(ev => socket.on(ev, stop));
    // Xonadagilar o'zgardi: xonada yo'q o'yinchi bilan ulanish yopiladi
    socket.on('updateLobbyPlayers', (data) => {
        if (!on || !data || !Array.isArray(data.players)) return;
        const ids = new Set(data.players.map(p => p.id));
        Object.keys(peers).forEach(id => { if (!ids.has(id)) closePeer(id); });
    });
    // Qayta ulandi (yangi socket) - ovozli chatga qaytadan kiramiz
    socket.on('roomJoined', (d) => {
        if (!on || !d) return;
        if (d.roomId !== roomId) { stop(); return; }
        Object.keys(peers).forEach(closePeer);
        socket.emit('voiceJoin', roomId);
    });

    // Kim gapiryapti (har 120 ms): lobbi o'rni yonadi, o'yinda boshi tepasida belgi
    // So'zlar orasidagi qisqa pauzada belgi lipillamasin - oxirgi ovozdan keyin 400 ms yonib turadi
    const lastSpoke = {};
    setInterval(() => {
        const sp = window.voiceSpeaking, now = Date.now();
        if (on) {
            if (stream && micOn && level(myAnalyser) > 0.04) lastSpoke[socket.id] = now;
            Object.entries(peers).forEach(([id, p]) => { if (level(p.analyser) > 0.03) lastSpoke[id] = now; });
        }
        sp.clear();
        if (on) Object.entries(lastSpoke).forEach(([id, tt]) => { if (now - tt < 400 && (id === socket.id ? stream && micOn : peers[id])) sp.add(id); });
        document.querySelectorAll('#lobby-slots .slot[data-pid]').forEach((s) => {
            s.classList.toggle('in-voice', on && (members.includes(s.dataset.pid)));
            s.classList.toggle('speaking', sp.has(s.dataset.pid));
        });
    }, 120);

    if (lobbyBtn) lobbyBtn.onclick = () => { if (on) stop(); else start(); };
    if (micBtn) micBtn.onclick = toggleMic;
    updateUI();
    return { start, stop, toggleMic, isOn: () => on,
        levels: () => ({ ctx: actx ? actx.state : null, me: level(myAnalyser), peers: Object.fromEntries(Object.entries(peers).map(([id, p]) => [id, level(p.analyser)])) }),
        setVolume: () => Object.values(peers).forEach(p => { if (p.audio) p.audio.volume = voiceVolume(); }) };
})();
