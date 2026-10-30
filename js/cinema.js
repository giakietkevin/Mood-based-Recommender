// Rạp KietStation: sảnh chọn rạp và phòng chiếu có sơ đồ ghế.
// Server quyết định ai ngồi ghế nào; máy này chỉ gửi yêu cầu và vẽ lại theo tin nhắn server gửi về.
(function () {
    'use strict';

    const ROW_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const LOBBY_REFRESH_MS = 5000;
    const WATCH_DELAY_MS = 700;   // ngồi xuống xong thì chuyển sang chế độ xem sau chừng này
    const ROOM_KEY = 'cinema_room';
    const GUEST_KEY = 'cinema_guest_id';
    const SYNC_EVERY_MS = 3000;
    const SEEK_DRIFT = 1.5;        // lệch hơn chừng này giây thì tua thẳng tới chỗ đúng
    const NUDGE_DRIFT = 0.25;      // lệch hơn chừng này thì phát nhanh/chậm 5% để bắt kịp êm
    const PING_EVERY_MS = 10000;
    const PHIM_API = 'https://phimapi.com';

    const state = {
        roomId: null,
        ws: null,
        closedByUs: false,
        retry: 0,
        retryTimer: null,
        lobbyTimer: null,
        layout: null,
        seats: {},            // mã ghế -> uid
        members: {},          // uid -> {uid, name, avatar, seat, away}
        host: null,
        media: null,
        playback: null,
        pending: null,        // ghế đang chờ server trả lời
        mode: 'picking',      // 'picking' | 'watching'
        serverOffset: 0,      // giây; server_time - giờ máy này
        seatEls: {},
        shown: false,
        clockSamples: [],     // [{rtt, offset}] từ ping/pong, dùng mẫu có rtt nhỏ nhất
        pingTimer: null,
    };

    // Trình phát của máy này. Nó chỉ làm theo trạng thái server gửi; nút của chủ phòng gửi lệnh lên server.
    const player = {
        key: null,          // nội dung đang nạp, để không nạp lại khi server gửi lại cùng nội dung
        el: null,           // <video> hoặc <audio>
        hls: null,
        ready: false,
        blocked: false,     // trình duyệt chặn tự phát có tiếng, đang chờ người dùng bấm
        syncTimer: null,
        uiTimer: null,
    };

    let root = null;

    // ---------- người dùng ----------

    function myUid() {
        if (window.currentUserUid) return String(window.currentUserUid).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
        let id = null;
        try { id = localStorage.getItem(GUEST_KEY); } catch (e) { /* trình duyệt chặn bộ nhớ */ }
        if (!id || !/^guest-[a-z0-9]{4,12}$/.test(id)) {
            id = 'guest-' + Math.random().toString(36).slice(2, 10);
            try { localStorage.setItem(GUEST_KEY, id); } catch (e) { /* bỏ qua */ }
        }
        return id;
    }

    function myName(uid) {
        const shown = document.getElementById('user-display');
        const text = shown && window.currentUserUid ? shown.textContent.trim() : '';
        return text || 'Khách ' + uid.slice(-4).toUpperCase();
    }

    function myAvatar() {
        return window.currentUserUid && typeof window.currentUserAvatarUrl === 'string' ? window.currentUserAvatarUrl : '';
    }

    // Mỗi người một màu riêng, cố định theo uid.
    function tintFor(uid) {
        let h = 0;
        for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) % 360;
        return 'hsl(' + h + ', 42%, 62%)';
    }

    function initialOf(name) {
        const n = String(name || '?').trim();
        return (n.charAt(0) || '?').toUpperCase();
    }

    // Ảnh đại diện tròn; không có ảnh hoặc ảnh lỗi thì hiện chữ cái đầu trên màu riêng.
    function fillAvatar(el, member) {
        el.textContent = '';
        el.style.background = tintFor(member.uid);
        if (member.avatar) {
            const img = document.createElement('img');
            img.alt = '';
            img.src = member.avatar;
            img.onerror = () => { img.remove(); el.textContent = initialOf(member.name); };
            el.appendChild(img);
        } else {
            el.textContent = initialOf(member.name);
        }
    }

    // ---------- tiện ích ----------

    function el(tag, cls, text) {
        const node = document.createElement(tag);
        if (cls) node.className = cls;
        if (text != null) node.textContent = text;
        return node;
    }

    function $(sel) { return root.querySelector(sel); }

    let toastTimer = null;
    function toast(text) {
        let box = document.getElementById('cine-toast');
        if (!box) {
            box = el('div', 'cine-toast');
            box.id = 'cine-toast';
            box.setAttribute('role', 'status');
            box.setAttribute('aria-live', 'polite');
            document.body.appendChild(box);
        }
        box.textContent = text;
        box.classList.add('is-on');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => box.classList.remove('is-on'), 2600);
    }

    function setConn(text) {
        const c = $('#cine-conn');
        if (c) c.textContent = text || '';
    }

    // ---------- sảnh ----------

    function showLobby() {
        state.roomId = null;
        try { sessionStorage.removeItem(ROOM_KEY); } catch (e) { /* bỏ qua */ }
        root.classList.remove('is-watching');
        $('#cine-lobby').hidden = false;
        $('#cine-room').hidden = true;
        loadLobby();
        clearInterval(state.lobbyTimer);
        state.lobbyTimer = setInterval(loadLobby, LOBBY_REFRESH_MS);
    }

    function miniMap(layout, occupied) {
        const box = el('span', 'cine-mini');
        box.setAttribute('aria-hidden', 'true');
        const cols = [];
        for (let c = 1; c <= layout.cols; c++) {
            cols.push('8px');
            if (layout.aisles.indexOf(c) !== -1 && c !== layout.cols) cols.push('4px');
        }
        box.style.gridTemplateColumns = cols.join(' ');
        const taken = {};
        occupied.forEach((s) => { taken[s] = true; });
        for (let r = 0; r < layout.rows; r++) {
            for (let c = 1; c <= layout.cols; c++) {
                box.appendChild(el('i', taken[ROW_LETTERS[r] + c] ? 'on' : ''));
                if (layout.aisles.indexOf(c) !== -1 && c !== layout.cols) box.appendChild(el('b'));
            }
        }
        return box;
    }

    function loadLobby() {
        if (!state.shown || state.roomId) return;
        fetch('/cinema/rooms', { cache: 'no-store' })
            .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
            .then(renderLobby)
            .catch(() => {
                const list = $('#cine-rooms');
                if (!list.children.length) {
                    list.textContent = '';
                    list.appendChild(el('li', 'cine-lobby-empty', 'Chưa kết nối được tới rạp. Đang thử lại...'));
                }
            });
    }

    function renderLobby(rooms) {
        const list = $('#cine-rooms');
        const focusedId = document.activeElement && document.activeElement.getAttribute('data-room');
        list.textContent = '';
        let watching = 0;
        rooms.forEach((room) => {
            watching += room.taken;
            const li = el('li');
            const btn = el('button', 'cine-room');
            btn.type = 'button';
            btn.setAttribute('data-room', room.id);
            btn.appendChild(miniMap(room.layout, room.occupied || []));

            const info = el('span');
            info.appendChild(el('span', 'cine-room__name', room.name));
            const now = room.media_title
                ? (room.media_kind === 'music' ? 'Nhạc: ' : 'Phim: ') + room.media_title
                : 'Chưa chọn nội dung chiếu';
            info.appendChild(el('span', 'cine-room__now', now));
            btn.appendChild(info);

            let status = 'Đang trống';
            if (room.media_title) status = room.playing ? 'Đang chiếu' : 'Tạm dừng';
            else if (room.taken) status = 'Đang chờ chiếu';
            btn.appendChild(el('span', 'cine-room__status' + (room.playing ? ' is-live' : ''), status));

            const seats = el('span', 'cine-room__seats tnum', String(room.taken));
            seats.appendChild(el('small', null, ' /' + room.total + ' ghế'));
            btn.appendChild(seats);

            btn.setAttribute('aria-label', room.name + ', ' + now + ', ' + room.taken + ' trên ' + room.total + ' ghế có người');
            btn.addEventListener('click', () => enterRoom(room.id));
            li.appendChild(btn);
            list.appendChild(li);
            if (focusedId === room.id) btn.focus();
        });
        $('#cine-lobby-sub').textContent = watching
            ? rooms.length + ' phòng chiếu · ' + watching + ' người đang ngồi trong rạp'
            : rooms.length + ' phòng chiếu · chưa có ai, bạn vào trước nhé';
    }

    // ---------- phòng ----------

    function enterRoom(roomId) {
        clearInterval(state.lobbyTimer);
        destroyPlayer();
        state.media = null;
        state.playback = null;
        state.roomId = roomId;
        try { sessionStorage.setItem(ROOM_KEY, roomId); } catch (e) { /* bỏ qua */ }
        state.layout = null;
        state.seats = {};
        state.members = {};
        state.pending = null;
        state.mode = 'picking';
        root.classList.remove('is-watching');
        $('#cine-lobby').hidden = true;
        $('#cine-room').hidden = false;
        $('#cine-room-name').textContent = 'Đang vào rạp...';
        $('#cine-room-meta').textContent = '';
        $('#cine-map').textContent = '';
        $('#cine-people').textContent = '';
        connect();
    }

    function leaveRoom() {
        if (state.ws && state.ws.readyState === 1) {
            try { state.ws.send(JSON.stringify({ type: 'leave' })); } catch (e) { /* bỏ qua */ }
        }
        disconnect();
        destroyPlayer();
        showLobby();
    }

    function connect() {
        disconnect();
        const uid = myUid();
        const proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
        const ws = new WebSocket(proto + location.host + '/ws/cinema/' + encodeURIComponent(state.roomId) + '/' + encodeURIComponent(uid));
        state.ws = ws;
        state.closedByUs = false;
        setConn('Đang kết nối...');

        ws.onopen = () => {
            state.retry = 0;
            setConn('');
            send({ type: 'hello', name: myName(uid), avatar: myAvatar() });
            ping();
            clearInterval(state.pingTimer);
            state.pingTimer = setInterval(ping, PING_EVERY_MS);
        };
        ws.onmessage = (ev) => {
            let msg;
            try { msg = JSON.parse(ev.data); } catch (e) { return; }
            onMessage(msg);
        };
        ws.onclose = (ev) => {
            if (state.ws !== ws) return;
            state.ws = null;
            if (state.closedByUs || !state.roomId) return;
            if (ev.code === 4001) {
                setConn('Bạn đang mở rạp ở một tab khác.');
                return;
            }
            if (ev.code === 4404) {
                toast('Rạp này không tồn tại.');
                showLobby();
                return;
            }
            // Mất mạng: thử lại, ghế vẫn được giữ 15 giây trên server.
            const wait = Math.min(8000, 1000 * Math.pow(2, state.retry++));
            setConn('Mất kết nối, đang nối lại...');
            clearTimeout(state.retryTimer);
            state.retryTimer = setTimeout(() => { if (state.roomId && state.shown) connect(); }, wait);
        };
    }

    function ping() {
        send({ type: 'ping', t: Date.now() });
    }

    // Giờ server tính theo đồng hồ máy này (giây).
    function serverNow() {
        return Date.now() / 1000 + state.serverOffset;
    }

    function disconnect() {
        clearTimeout(state.retryTimer);
        clearInterval(state.pingTimer);
        if (state.ws) {
            state.closedByUs = true;
            try { state.ws.close(); } catch (e) { /* bỏ qua */ }
            state.ws = null;
        }
    }

    function send(msg) {
        if (state.ws && state.ws.readyState === 1) {
            state.ws.send(JSON.stringify(msg));
            return true;
        }
        return false;
    }

    function onMessage(msg) {
        if (msg.type === 'pong' && typeof msg.t === 'number' && typeof msg.server_time === 'number') {
            // Server ghi giờ vào khoảng giữa lượt đi và lượt về.
            const now = Date.now();
            const rtt = now - msg.t;
            state.clockSamples.push({ rtt: rtt, offset: msg.server_time - (msg.t + now) / 2000 });
            if (state.clockSamples.length > 6) state.clockSamples.shift();
            const best = state.clockSamples.reduce((a, b) => (b.rtt < a.rtt ? b : a));
            state.serverOffset = best.offset;
        } else if (!state.clockSamples.length && typeof msg.server_time === 'number') {
            state.serverOffset = msg.server_time - Date.now() / 1000;
        }
        const me = myUid();
        switch (msg.type) {
            case 'state':
                state.layout = msg.room.layout;
                state.seats = msg.seats || {};
                state.members = {};
                (msg.members || []).forEach((m) => { state.members[m.uid] = m; });
                state.host = msg.host;
                state.media = msg.media;
                state.playback = msg.playback;
                state.pending = null;
                $('#cine-room-name').textContent = msg.room.name;
                buildMap();
                renderAll();
                syncPlayer(false);
                if (state.members[me] && state.members[me].seat && state.mode === 'picking' && !state.pending) {
                    setMode('watching');
                }
                break;
            case 'member_join':
            case 'member_update':
                state.members[msg.member.uid] = msg.member;
                if (msg.member.seat) renderSeat(msg.member.seat);
                renderPeople();
                break;
            case 'member_away':
                if (state.members[msg.uid]) {
                    state.members[msg.uid].away = true;
                    if (state.members[msg.uid].seat) renderSeat(state.members[msg.uid].seat);
                }
                renderPeople();
                break;
            case 'member_leave':
                delete state.members[msg.uid];
                renderPeople();
                break;
            case 'host_changed':
                state.host = msg.host;
                renderPeople();
                renderStage();
                if (msg.host === me) toast('Bạn đang là chủ phòng, bạn điều khiển màn chiếu');
                break;
            case 'seat_changed':
                onSeatChanged(msg.seat, msg.uid, me);
                break;
            case 'seat_denied':
                if (state.pending === msg.seat) state.pending = null;
                renderSeat(msg.seat);
                if (msg.reason === 'taken') toast('Ghế ' + msg.seat + ' vừa có người ngồi');
                else if (msg.reason === 'too_fast') toast('Bạn bấm nhanh quá, chờ một chút nhé');
                else toast('Không chọn được ghế ' + msg.seat);
                break;
            case 'media':
                state.media = msg.media;
                state.playback = msg.playback;
                renderStage();
                break;
            case 'playback':
                state.playback = msg.playback;
                syncPlayer(false);
                renderControls();
                break;
            case 'denied':
                if (msg.reason === 'not_host') toast('Chỉ chủ phòng mới điều khiển được màn chiếu');
                else if (msg.reason === 'no_media') toast('Chưa có nội dung chiếu');
                else toast('Không đổi được nội dung chiếu');
                break;
            case 'replaced':
                setConn('Bạn đang mở rạp ở một tab khác.');
                break;
        }
    }

    function onSeatChanged(seat, uid, me) {
        if (uid) {
            state.seats[seat] = uid;
            if (state.members[uid]) {
                const old = state.members[uid].seat;
                state.members[uid].seat = seat;
                if (old && old !== seat && state.seats[old] === uid) {
                    delete state.seats[old];
                    renderSeat(old);
                }
            }
        } else {
            const was = state.seats[seat];
            delete state.seats[seat];
            if (was && state.members[was] && state.members[was].seat === seat) state.members[was].seat = null;
        }
        const mineNow = uid === me && state.pending === seat;
        if (state.pending === seat) state.pending = null;
        renderSeat(seat);
        renderPeople();
        renderMeta();
        if (mineNow) setTimeout(() => { if (mySeat() === seat) setMode('watching'); }, WATCH_DELAY_MS);
    }

    function mySeat() {
        const m = state.members[myUid()];
        return m ? m.seat : null;
    }

    // ---------- sơ đồ ghế ----------

    function buildMap() {
        const map = $('#cine-map');
        map.textContent = '';
        state.seatEls = {};
        const L = state.layout;
        const cols = ['20px'];
        for (let c = 1; c <= L.cols; c++) {
            cols.push('calc(var(--seat-fs) * 4)');
            if (L.aisles.indexOf(c) !== -1 && c !== L.cols) cols.push('var(--aisle-w)');
        }
        cols.push('20px');
        map.style.gridTemplateColumns = cols.join(' ');

        for (let r = 0; r < L.rows; r++) {
            const letter = ROW_LETTERS[r];
            map.appendChild(el('span', 'cine-rowlabel', letter));
            for (let c = 1; c <= L.cols; c++) {
                const code = letter + c;
                const btn = el('button', 'cine-seat');
                btn.type = 'button';
                btn.setAttribute('data-seat', code);
                btn.addEventListener('click', () => onSeatClick(code));
                state.seatEls[code] = btn;
                map.appendChild(btn);
                if (L.aisles.indexOf(c) !== -1 && c !== L.cols) map.appendChild(el('span'));
            }
            map.appendChild(el('span', 'cine-rowlabel', letter));
        }
        Object.keys(state.seatEls).forEach(renderSeat);
        // Sơ đồ rộng hơn màn hình điện thoại thì cuộn ngang, bắt đầu ở giữa.
        const hall = map.parentNode.parentNode;
        hall.scrollLeft = Math.max(0, (hall.scrollWidth - hall.clientWidth) / 2);
    }

    function renderSeat(code) {
        const btn = state.seatEls[code];
        if (!btn) return;
        const me = myUid();
        const uid = state.seats[code];
        const member = uid ? (state.members[uid] || { uid: uid, name: '?', avatar: '' }) : null;
        const mine = uid === me;

        btn.className = 'cine-seat ' + (uid ? (mine ? 'is-taken is-mine' : 'is-taken') : 'is-free') +
            (member && member.away ? ' is-away' : '') + (state.pending === code ? ' is-pending' : '');
        btn.textContent = '';
        btn.appendChild(el('span', 's-back'));
        if (member) {
            const body = el('span', 'p-body');
            body.style.background = tintFor(member.uid);
            btn.appendChild(body);
            const head = el('span', 'p-head');
            fillAvatar(head, member);
            btn.appendChild(head);
        }
        btn.appendChild(el('span', 's-base'));
        if (mine) btn.appendChild(el('span', 's-you', 'Bạn'));

        let label;
        if (state.pending === code) label = code + ' · đang giữ chỗ...';
        else if (mine) label = code + ' · Ghế của bạn';
        else if (member) label = code + ' · ' + member.name + (member.away ? ' (mất kết nối)' : '');
        else label = code + ' · Trống';
        btn.title = label;
        btn.setAttribute('aria-label', label);
        btn.setAttribute('aria-disabled', uid && !mine ? 'true' : 'false');
    }

    function onSeatClick(code) {
        if (state.pending) return;
        const uid = state.seats[code];
        if (uid === myUid()) { setMode('watching'); return; }
        if (uid) {
            const m = state.members[uid];
            toast('Ghế ' + code + ' đã có ' + (m ? m.name : 'người') + ' ngồi');
            return;
        }
        if (!send({ type: 'seat_request', seat: code })) {
            toast('Đang nối lại với rạp, thử lại sau giây lát');
            return;
        }
        state.pending = code;
        renderSeat(code);
    }

    // ---------- người trong rạp, tiêu đề, màn chiếu ----------

    function renderAll() {
        renderMeta();
        renderPeople();
        renderStage();
    }

    function renderMeta() {
        if (!state.layout) return;
        const total = state.layout.rows * state.layout.cols;
        const taken = Object.keys(state.seats).length;
        const host = state.members[state.host];
        $('#cine-room-meta').textContent = taken + ' /' + total + ' ghế có người' +
            (host ? ' · Chủ phòng: ' + (state.host === myUid() ? 'bạn' : host.name) : '');
        const seat = mySeat();
        $('#cine-my-seat').textContent = seat || 'chưa chọn';
        $('#cine-to-stage').hidden = !seat;
    }

    function renderPeople() {
        const me = myUid();
        const list = $('#cine-people');
        const uids = Object.keys(state.members);
        list.textContent = '';
        uids.forEach((uid) => {
            const m = state.members[uid];
            const li = el('li', 'cine-person' + (m.away ? ' is-away' : ''));
            const av = el('span', 'cine-avatar');
            fillAvatar(av, m);
            li.appendChild(av);
            const name = el('span', 'cine-person__name', uid === me ? m.name + ' (bạn)' : m.name);
            if (uid === state.host) name.appendChild(el('span', 'cine-tag', 'Chủ phòng'));
            if (m.away) name.appendChild(el('small', null, 'Mất kết nối, đang giữ ghế'));
            li.appendChild(name);
            li.appendChild(el('span', 'cine-person__seat', m.seat || '–'));
            list.appendChild(li);
        });
        $('#cine-people-count').textContent = String(uids.length);

        // dải mặt người ở chế độ xem
        const faces = $('#cine-faces');
        faces.textContent = '';
        uids.slice(0, 8).forEach((uid) => {
            const av = el('span', 'cine-avatar');
            av.title = state.members[uid].name;
            fillAvatar(av, state.members[uid]);
            faces.appendChild(av);
        });
        faces.appendChild(el('span', 'cine-faces__count', uids.length + ' người trong rạp'));
        renderMeta();
    }

    function isHost() {
        return state.host === myUid();
    }

    function mediaTitle(m) {
        if (!m) return '';
        return m.kind === 'music' ? (m.track.title || 'Bài hát') : (m.title || 'Phim');
    }

    function mediaKey(m) {
        if (!m) return null;
        return m.kind === 'film' ? 'film:' + m.slug + ':' + m.ep : 'music:' + m.track.link;
    }

    function stageMessage(title, sub, showPick) {
        $('#cine-stage-msg').hidden = !title;
        $('#cine-stage-title').textContent = title || '';
        $('#cine-stage-sub').textContent = sub || '';
        $('#cine-pick-empty').hidden = !showPick;
    }

    function renderStage() {
        const m = state.media;
        const title = mediaTitle(m);
        $('#cine-arc-title').textContent = title ? 'Đang chiếu: ' + title : '';
        $('#cine-pick-open').hidden = !isHost();
        if (!m) {
            destroyPlayer();
            stageMessage('Chưa có nội dung chiếu',
                isHost() ? 'Bạn là chủ phòng, hãy chọn phim hoặc nhạc để cả rạp cùng xem.' : 'Chủ phòng sẽ chọn phim hoặc nhạc.',
                isHost());
        } else if (mediaKey(m) !== player.key) {
            loadMedia(m);
        }
        renderControls();
    }

    // ---------- trình phát ----------

    function destroyPlayer() {
        clearInterval(player.syncTimer);
        clearInterval(player.uiTimer);
        if (player.hls) { try { player.hls.destroy(); } catch (e) { /* bỏ qua */ } }
        if (player.el) {
            try { player.el.pause(); player.el.removeAttribute('src'); player.el.load(); } catch (e) { /* bỏ qua */ }
            if (player.el.parentNode) player.el.parentNode.removeChild(player.el);
        }
        player.key = null;
        player.el = null;
        player.hls = null;
        player.ready = false;
        player.blocked = false;
        if (root) {
            root.classList.remove('is-buffering');
            $('#cine-unlock').hidden = true;
            $('#cine-cover').hidden = true;
            $('#cine-controls').hidden = true;
        }
    }

    // Tạm dừng nhạc và phim đang phát ở các tab khác của app, để không chồng tiếng.
    function pauseAppPlayers() {
        ['local-audio', 'film-video-player'].forEach((id) => {
            const media = document.getElementById(id);
            if (media && !media.paused) { try { media.pause(); } catch (e) { /* bỏ qua */ } }
        });
        if (window.ytPlayer && window.ytPlayer.pauseVideo) { try { window.ytPlayer.pauseVideo(); } catch (e) { /* bỏ qua */ } }
    }

    function youtubeId(link) {
        if (!link) return null;
        if (/^[A-Za-z0-9_-]{11}$/.test(link)) return link;
        const m = String(link).match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/v\/)([A-Za-z0-9_-]{11})/);
        return m ? m[1] : null;
    }

    function loadMedia(m) {
        destroyPlayer();
        pauseAppPlayers();
        const key = mediaKey(m);
        player.key = key;
        const screen = $('#cine-screen');

        if (m.kind === 'music') {
            const id = youtubeId(m.track.link);
            $('#cine-cover').hidden = false;
            const img = $('#cine-cover-img');
            img.hidden = !m.track.thumbnail;
            if (m.track.thumbnail) img.src = m.track.thumbnail;
            $('#cine-cover-title').textContent = m.track.title || 'Bài hát';
            $('#cine-cover-artist').textContent = m.track.artist || '';
            if (!id) {
                stageMessage('Không phát được bài này', isHost() ? 'Hãy chọn một bài khác.' : 'Chờ chủ phòng chọn bài khác.', isHost());
                return;
            }
            stageMessage('', '', false);
            const audio = document.createElement('audio');
            audio.preload = 'auto';
            attachPlayer(audio, key, 'bài hát');
            audio.src = '/api/yt-stream/' + id;
            screen.appendChild(audio);
            return;
        }

        stageMessage('Đang tải phim...', 'Nguồn phim có thể phản hồi chậm, chờ một chút nhé.', false);
        fetch(PHIM_API + '/phim/' + encodeURIComponent(m.slug))
            .then((r) => r.json())
            .then((data) => {
                if (player.key !== key) return;  // trong lúc chờ, chủ phòng đã đổi nội dung
                const eps = data && data.status && data.episodes && data.episodes[0] ? data.episodes[0].server_data : null;
                if (!eps || !eps.length) throw new Error('no episodes');
                const ep = eps[Math.min(m.ep, eps.length - 1)];
                const video = document.createElement('video');
                video.playsInline = true;
                video.setAttribute('playsinline', '');
                video.preload = 'auto';
                attachPlayer(video, key, 'phim');
                screen.appendChild(video);
                if (window.Hls && window.Hls.isSupported()) {
                    const hls = new window.Hls({ maxMaxBufferLength: 60 });
                    player.hls = hls;
                    hls.loadSource(ep.link_m3u8);
                    hls.attachMedia(video);
                    hls.on(window.Hls.Events.ERROR, (ev, info) => {
                        if (info && info.fatal && player.key === key) loadFailed('phim');
                    });
                } else {
                    video.src = ep.link_m3u8;
                }
            })
            .catch(() => { if (player.key === key) loadFailed('phim'); });
    }

    function loadFailed(what) {
        $('#cine-controls').hidden = true;
        stageMessage('Không tải được ' + what,
            isHost() ? 'Nguồn đang lỗi hoặc chậm. Hãy chọn tập hoặc nội dung khác.' : 'Nguồn đang lỗi hoặc chậm. Chờ chủ phòng đổi nội dung.',
            isHost());
    }

    function attachPlayer(media, key, what) {
        player.el = media;
        media.addEventListener('loadedmetadata', () => {
            if (player.key !== key) return;
            player.ready = true;
            if (state.media && state.media.kind === 'film') stageMessage('', '', false);
            $('#cine-controls').hidden = false;
            syncPlayer(true);
            renderControls();
        });
        media.addEventListener('error', () => { if (player.key === key) loadFailed(what); });
        // Hết bài/phim: máy chủ phòng báo cả rạp dừng ở cuối, để thanh điều khiển không còn hiện "đang phát".
        media.addEventListener('ended', () => {
            if (player.key === key && isHost() && state.playback && state.playback.playing) {
                send({ type: 'pause', position: media.duration || media.currentTime });
            }
        });
        media.addEventListener('waiting', () => { if (player.key === key) root.classList.add('is-buffering'); });
        media.addEventListener('playing', () => { if (player.key === key) root.classList.remove('is-buffering'); });
        clearInterval(player.syncTimer);
        player.syncTimer = setInterval(() => syncPlayer(false), SYNC_EVERY_MS);
        clearInterval(player.uiTimer);
        player.uiTimer = setInterval(renderTime, 500);
    }

    // Giây đang chiếu theo server, tính tới thời điểm này.
    function targetPosition() {
        const pb = state.playback;
        if (!pb) return 0;
        if (!pb.playing) return pb.position;
        return pb.position + Math.max(0, serverNow() - pb.updated_at);
    }

    function syncPlayer(force) {
        const el = player.el;
        if (!el || !player.ready || !state.playback) return;
        const pb = state.playback;
        let target = targetPosition();
        const dur = isFinite(el.duration) && el.duration > 0 ? el.duration : 0;
        // Đã hết phim/bài theo giờ của rạp: đứng ở cuối, không phát lại từ đầu.
        if (dur && target >= dur - 0.3) {
            if (!el.paused) el.pause();
            if (Math.abs(el.currentTime - dur) > 1) { try { el.currentTime = Math.max(0, dur - 0.1); } catch (e) { /* bỏ qua */ } }
            el.playbackRate = 1;
            return;
        }
        const drift = el.currentTime - target;

        if (force || Math.abs(drift) > SEEK_DRIFT || (!pb.playing && Math.abs(drift) > 0.3)) {
            try { el.currentTime = Math.max(0, target); } catch (e) { /* chưa tua được, lần sau thử lại */ }
            el.playbackRate = 1;
        } else if (pb.playing && Math.abs(drift) > NUDGE_DRIFT) {
            el.playbackRate = drift > 0 ? 0.95 : 1.05;
        } else {
            el.playbackRate = 1;
        }

        if (pb.playing && el.paused && !player.blocked) {
            const p = el.play();
            if (p && p.catch) {
                p.catch((err) => {
                    if (err && err.name === 'NotAllowedError') {
                        player.blocked = true;
                        $('#cine-unlock').hidden = false;
                    }
                });
            }
        } else if (!pb.playing && !el.paused) {
            el.pause();
        }
    }

    function unlockPlayback() {
        player.blocked = false;
        $('#cine-unlock').hidden = true;
        if (player.el && player.ready && state.playback && state.playback.playing) {
            const p = player.el.play();
            if (p && p.then) p.then(() => syncPlayer(true)).catch(() => { /* để vòng đồng bộ thử lại */ });
        }
    }

    // ---------- thanh điều khiển ----------

    function fmtTime(sec) {
        if (!isFinite(sec) || sec < 0) sec = 0;
        sec = Math.floor(sec);
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = sec % 60;
        const mm = h && m < 10 ? '0' + m : String(m);
        return (h ? h + ':' : '') + mm + ':' + (s < 10 ? '0' + s : s);
    }

    let seeking = false;   // chủ phòng đang kéo thanh tua
    function renderTime() {
        if (!root) return;
        const pos = player.el && player.ready ? player.el.currentTime : targetPosition();
        const dur = player.el && isFinite(player.el.duration) ? player.el.duration : 0;
        const seek = $('#cine-seek');
        if (!seeking) {
            seek.max = String(Math.floor(dur));
            seek.value = String(Math.floor(pos));
            $('#cine-time').textContent = fmtTime(pos);
        }
        $('#cine-duration').textContent = fmtTime(dur);
    }

    function renderControls() {
        if (!root) return;
        const host = isHost();
        const playing = !!(state.playback && state.playback.playing);
        const play = $('#cine-play');
        play.hidden = !host;
        play.firstElementChild.textContent = playing ? 'pause' : 'play_arrow';
        play.setAttribute('aria-label', playing ? 'Tạm dừng' : 'Phát');
        $('#cine-guest-note').hidden = host;
        $('#cine-seek').disabled = !host;
        root.classList.toggle('is-host', host);
        renderTime();
    }

    function onPlayClick() {
        if (!isHost() || !state.media) return;
        const playing = state.playback && state.playback.playing;
        const pos = player.el && player.ready ? player.el.currentTime : targetPosition();
        player.blocked = false;          // cú bấm Phát cũng mở khoá phát có tiếng
        $('#cine-unlock').hidden = true;
        send({ type: playing ? 'pause' : 'play', position: Math.max(0, pos) });
    }

    function onSeekChange() {
        seeking = false;
        if (!isHost()) return;
        send({ type: 'seek', position: Number($('#cine-seek').value) || 0 });
    }

    function onMuteClick() {
        if (!player.el) return;
        player.el.muted = !player.el.muted;
        const btn = $('#cine-mute');
        btn.firstElementChild.textContent = player.el.muted ? 'volume_off' : 'volume_up';
        btn.setAttribute('aria-label', player.el.muted ? 'Bật tiếng' : 'Tắt tiếng');
    }

    function toggleFullscreen() {
        const stage = $('#cine-stage');
        const full = document.fullscreenElement || document.webkitFullscreenElement;
        if (full) {
            const exit = document.exitFullscreen || document.webkitExitFullscreen;
            if (exit) exit.call(document);
        } else {
            const req = stage.requestFullscreen || stage.webkitRequestFullscreen;
            if (req) req.call(stage);
        }
    }

    // ---------- bảng chọn nội dung (chủ phòng) ----------

    const picker = { tab: 'film', reqId: 0 };

    function openPicker() {
        if (!isHost()) return;
        $('#cine-picker').hidden = false;
        switchTab(picker.tab);
    }

    function closePicker() {
        $('#cine-picker').hidden = true;
        const back = $('#cine-pick-open');
        if (back && !back.hidden && root.classList.contains('is-watching')) back.focus();
    }

    function filmUnlocked() {
        try { return sessionStorage.getItem('filmVerified') === 'true'; } catch (e) { return false; }
    }

    function switchTab(tab) {
        picker.tab = tab;
        picker.reqId++;
        $('#cine-tab-film').setAttribute('aria-selected', String(tab === 'film'));
        $('#cine-tab-music').setAttribute('aria-selected', String(tab === 'music'));
        const locked = tab === 'film' && !filmUnlocked();
        $('#cine-pick-vip').hidden = !locked;
        $('#cine-pick-search').hidden = locked;
        $('#cine-pick-q').placeholder = tab === 'film' ? 'Tìm theo tên phim' : 'Tìm bài hát hoặc ca sĩ';
        $('#cine-pick-q').value = '';
        $('#cine-pick-list').textContent = '';
        pickNote('');
        if (locked) { $('#cine-vip-code').focus(); return; }
        if (tab === 'film') searchFilms('');
        else showMusicDefaults();
        $('#cine-pick-q').focus();
    }

    function pickNote(text) {
        $('#cine-pick-note').textContent = text;
    }

    function imageUrl(path, domain) {
        if (!path) return '';
        if (/^https?:\/\//.test(path)) return path;
        return (domain || 'https://phimimg.com') + (path.charAt(0) === '/' ? '' : '/') + path;
    }

    function pickRow(thumb, title, sub, onPick, square) {
        const li = el('li');
        const btn = el('button', 'cine-pick-item' + (square ? ' is-square' : ''));
        btn.type = 'button';
        const img = el('img', 'cine-pick-thumb');
        img.alt = '';
        if (thumb) img.src = thumb;
        img.onerror = () => { img.style.visibility = 'hidden'; };
        btn.appendChild(img);
        const text = el('span', 'cine-pick-text');
        text.appendChild(el('span', 'cine-pick-title', title));
        if (sub) text.appendChild(el('span', 'cine-pick-sub', sub));
        btn.appendChild(text);
        btn.addEventListener('click', onPick);
        li.appendChild(btn);
        return li;
    }

    function searchFilms(q) {
        const id = ++picker.reqId;
        const list = $('#cine-pick-list');
        list.textContent = '';
        pickNote(q ? 'Đang tìm "' + q + '"...' : 'Đang tải phim mới cập nhật...');
        const url = q
            ? PHIM_API + '/v1/api/tim-kiem?keyword=' + encodeURIComponent(q) + '&limit=24'
            : PHIM_API + '/v1/api/danh-sach/phim-moi-cap-nhat?page=1&limit=24';
        fetch(url)
            .then((r) => r.json())
            .then((data) => {
                if (id !== picker.reqId) return;
                const items = (data && data.data && data.data.items) || (data && data.items) || [];
                const domain = (data && data.data && data.data.APP_DOMAIN_CDN_IMAGE) || 'https://phimimg.com';
                pickNote(items.length ? (q ? items.length + ' phim tìm được' : 'Phim mới cập nhật') : 'Không tìm thấy phim. Thử tên khác nhé.');
                items.forEach((m) => {
                    const sub = [m.origin_name, m.year, m.episode_current].filter(Boolean).join(' · ');
                    list.appendChild(pickRow(imageUrl(m.poster_url || m.thumb_url, domain), m.name, sub,
                        () => chooseFilm(m.slug, m.name, imageUrl(m.thumb_url || m.poster_url, domain))));
                });
            })
            .catch(() => { if (id === picker.reqId) pickNote('Không kết nối được nguồn phim. Thử lại sau.'); });
    }

    function chooseFilm(slug, name, thumb) {
        const id = ++picker.reqId;
        pickNote('Đang lấy danh sách tập của ' + name + '...');
        fetch(PHIM_API + '/phim/' + encodeURIComponent(slug))
            .then((r) => r.json())
            .then((data) => {
                if (id !== picker.reqId) return;
                const eps = data && data.episodes && data.episodes[0] ? data.episodes[0].server_data : [];
                if (!eps || !eps.length) { pickNote(name + ' chưa có tập nào xem được.'); return; }
                if (eps.length === 1) { setFilm(slug, 0, name, thumb); return; }
                const list = $('#cine-pick-list');
                list.textContent = '';
                pickNote(name + ': chọn tập để chiếu (' + eps.length + ' tập)');
                const back = el('li', 'cine-pick-back');
                const backBtn = el('button', 'cine-btn', 'Quay lại kết quả');
                backBtn.type = 'button';
                backBtn.addEventListener('click', () => searchFilms($('#cine-pick-q').value.trim()));
                back.appendChild(backBtn);
                list.appendChild(back);
                const grid = el('li', 'cine-eps');
                eps.forEach((ep, i) => {
                    const label = ep.name || 'Tập ' + (i + 1);
                    const b = el('button', 'cine-ep', label);
                    b.type = 'button';
                    b.addEventListener('click', () => setFilm(slug, i, name + ' · ' + label, thumb));
                    grid.appendChild(b);
                });
                list.appendChild(grid);
                const first = grid.querySelector('button');
                if (first) first.focus();
            })
            .catch(() => { if (id === picker.reqId) pickNote('Không lấy được thông tin phim. Thử phim khác.'); });
    }

    // Đổi nội dung rồi phát luôn; cú bấm chọn cũng là cú bấm cho phép phát có tiếng trên máy chủ phòng.
    function startMedia(msg) {
        send(msg);
        send({ type: 'play' });
        player.blocked = false;
        closePicker();
        setMode('watching');
    }

    function setFilm(slug, ep, title, thumb) {
        startMedia({ type: 'media_set', kind: 'film', slug: slug, ep: ep, title: title, thumb: thumb });
    }

    function trackRow(t, label) {
        const id = youtubeId(t.link);
        if (!id) return null;
        return pickRow(t.thumbnail || '', t.title || 'Bài hát', [label, t.artist].filter(Boolean).join(' · '), () => {
            startMedia({
                type: 'media_set',
                kind: 'music',
                track: {
                    title: t.title || '',
                    artist: t.artist || '',
                    thumbnail: t.thumbnail || '',
                    link: 'https://www.youtube.com/watch?v=' + id,
                },
            });
        }, true);
    }

    function showMusicDefaults() {
        const list = $('#cine-pick-list');
        list.textContent = '';
        const seen = {};
        const rows = [];
        const cur = window.currentTrackData;
        if (cur && cur.link) { rows.push(trackRow(cur, 'Đang phát trong app')); seen[cur.link] = true; }
        (window.lastRecommendations || []).forEach((t) => {
            if (t && t.link && !seen[t.link]) { seen[t.link] = true; rows.push(trackRow(t, '')); }
        });
        const ok = rows.filter(Boolean);
        ok.forEach((r) => list.appendChild(r));
        pickNote(ok.length ? 'Bài bạn vừa nghe trong app, hoặc tìm bài khác ở trên' : 'Tìm một bài để cả rạp cùng nghe');
    }

    function searchMusic(q) {
        if (!q) { showMusicDefaults(); return; }
        const id = ++picker.reqId;
        const list = $('#cine-pick-list');
        list.textContent = '';
        pickNote('Đang tìm "' + q + '"...');
        fetch('/search?q=' + encodeURIComponent(q) + '&type=music')
            .then((r) => r.json())
            .then((data) => {
                if (id !== picker.reqId) return;
                const rows = (data.recommendations || []).map((t) => trackRow(t, '')).filter(Boolean);
                rows.forEach((r) => list.appendChild(r));
                pickNote(rows.length ? rows.length + ' bài tìm được' : (data.blocked ? 'Máy chủ đang bị YouTube chặn, thử lại sau ít phút.' : 'Không tìm thấy bài nào. Thử từ khoá khác.'));
            })
            .catch(() => { if (id === picker.reqId) pickNote('Tìm nhạc không thành công. Thử lại sau.'); });
    }

    function setMode(mode) {
        state.mode = mode;
        root.classList.toggle('is-watching', mode === 'watching');
        const target = mode === 'watching' ? $('#cine-change-seat') : (state.seatEls[mySeat()] || $('#cine-back'));
        if (target && document.documentElement.classList.contains('tv-mode')) target.focus();
    }

    // ---------- vào / ra view ----------

    function onShow() {
        root = root || document.getElementById('view-cinema');
        if (!root) return;
        state.shown = true;
        document.body.classList.add('cinema-on');
        let saved = null;
        try { saved = sessionStorage.getItem(ROOM_KEY); } catch (e) { /* bỏ qua */ }
        if (saved) enterRoom(saved);
        else showLobby();
    }

    // Rời view: đóng kết nối nhưng không trả ghế ngay; quay lại trong 15 giây vẫn ngồi chỗ cũ.
    function onHide() {
        if (!state.shown) return;
        state.shown = false;
        document.body.classList.remove('cinema-on');
        clearInterval(state.lobbyTimer);
        disconnect();
        destroyPlayer();
        $('#cine-picker').hidden = true;
    }

    function init() {
        root = document.getElementById('view-cinema');
        if (!root) return;
        $('#cine-back').addEventListener('click', leaveRoom);
        $('#cine-to-stage').addEventListener('click', () => setMode('watching'));
        $('#cine-change-seat').addEventListener('click', () => setMode('picking'));

        $('#cine-unlock').addEventListener('click', unlockPlayback);
        $('#cine-play').addEventListener('click', onPlayClick);
        const seek = $('#cine-seek');
        seek.addEventListener('input', () => { seeking = true; $('#cine-time').textContent = fmtTime(Number(seek.value)); });
        seek.addEventListener('change', onSeekChange);
        $('#cine-mute').addEventListener('click', onMuteClick);
        $('#cine-full').addEventListener('click', toggleFullscreen);

        $('#cine-pick-open').addEventListener('click', openPicker);
        $('#cine-pick-empty').addEventListener('click', openPicker);
        $('#cine-picker-close').addEventListener('click', closePicker);
        $('#cine-picker').addEventListener('click', (e) => { if (e.target === e.currentTarget) closePicker(); });
        document.addEventListener('keydown', (e) => {
            if ((e.key === 'Escape' || e.keyCode === 27) && !$('#cine-picker').hidden) closePicker();
        });
        $('#cine-tab-film').addEventListener('click', () => switchTab('film'));
        $('#cine-tab-music').addEventListener('click', () => switchTab('music'));
        $('#cine-pick-search').addEventListener('submit', (e) => {
            e.preventDefault();
            const q = $('#cine-pick-q').value.trim();
            if (picker.tab === 'film') searchFilms(q);
            else searchMusic(q);
        });
        $('#cine-pick-vip').addEventListener('submit', (e) => {
            e.preventDefault();
            const input = $('#cine-vip-code');
            const ok = window.checkFilmVipCode && window.checkFilmVipCode(input.value);
            input.value = '';
            if (ok) {
                switchTab('film');
            } else {
                pickNote('Sai mật khẩu, thử lại nhé.');
                input.focus();
            }
        });
    }

    window.Cinema = { onShow: onShow, onHide: onHide, enter: enterRoom, leave: leaveRoom };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
