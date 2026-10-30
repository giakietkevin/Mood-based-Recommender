// Rạp KietStation: sảnh chọn rạp và phòng chiếu có sơ đồ ghế.
// Server quyết định ai ngồi ghế nào; máy này chỉ gửi yêu cầu và vẽ lại theo tin nhắn server gửi về.
(function () {
    'use strict';

    const ROW_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const LOBBY_REFRESH_MS = 5000;
    const WATCH_DELAY_MS = 700;   // ngồi xuống xong thì chuyển sang chế độ xem sau chừng này
    const ROOM_KEY = 'cinema_room';
    const GUEST_KEY = 'cinema_guest_id';

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

    function disconnect() {
        clearTimeout(state.retryTimer);
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
        if (typeof msg.server_time === 'number') {
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

    function renderStage() {
        const m = state.media;
        const title = m ? (m.kind === 'music' ? m.track.title : m.title) : '';
        $('#cine-arc-title').textContent = title ? 'Đang chiếu: ' + title : '';
        const strong = $('#cine-stage-title');
        const sub = $('#cine-stage-sub');
        if (m) {
            strong.textContent = title || 'Nội dung chưa có tên';
            sub.textContent = 'Phần phát cùng nhau sẽ có ở giai đoạn sau.';
        } else {
            strong.textContent = 'Chưa có nội dung chiếu';
            sub.textContent = state.host === myUid()
                ? 'Bạn là chủ phòng. Nút chọn phim hoặc nhạc sẽ có ở giai đoạn sau.'
                : 'Chủ phòng sẽ chọn phim hoặc nhạc.';
        }
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
    }

    function init() {
        root = document.getElementById('view-cinema');
        if (!root) return;
        $('#cine-back').addEventListener('click', leaveRoom);
        $('#cine-to-stage').addEventListener('click', () => setMode('watching'));
        $('#cine-change-seat').addEventListener('click', () => setMode('picking'));
    }

    window.Cinema = { onShow: onShow, onHide: onHide, enter: enterRoom, leave: leaveRoom };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
