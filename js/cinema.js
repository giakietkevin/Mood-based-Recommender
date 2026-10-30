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
    const DEAD_AFTER_MS = 25000;   // không nhận được gì (kể cả pong) chừng này thì coi như mất kết nối
    const BUBBLE_MS = 6000;
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
        lastMsgAt: 0,         // lần cuối nhận được tin từ server, để phát hiện kết nối chết im
        bubbles: {},          // uid -> {text, until}: bong bóng chat đang hiện
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
        eps: null,          // tên các tập của phim đang chiếu
        endCard: false,     // màn chiếu đang hiện thẻ "Hết phim"
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

    const NAME_KEY = 'cinema_name';

    function savedName() {
        try { return (localStorage.getItem(NAME_KEY) || '').trim(); } catch (e) { return ''; }
    }

    function accountName() {
        const shown = document.getElementById('user-display');
        return shown && window.currentUserUid ? shown.textContent.trim() : '';
    }

    function myName(uid) {
        return savedName() || accountName() || 'Khách ' + uid.slice(-4).toUpperCase();
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

    function hashOf(uid) {
        let h = 0;
        for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) % 100003;
        return h;
    }

    const HAIR = ['#14100e', '#1f1712', '#2b1e16', '#3a291c', '#4b3523', '#5b4330', '#26201e', '#6a5440'];
    function hairFor(uid) { return HAIR[hashOf(uid) % HAIR.length]; }

    // màu áo: cùng sắc với màu nhận diện, nhưng tối và ít rực hơn, như quần áo dưới ánh màn chiếu
    function clothFor(uid) {
        let h = 0;
        for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) % 360;
        return 'hsl(' + h + ', 22%, ' + (26 + hashOf(uid) % 14) + '%)';
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
        }
        // Khi đang toàn màn hình chỉ phần tử phóng to được vẽ, nên thông báo phải nằm trong nó.
        const host = document.fullscreenElement || document.webkitFullscreenElement || document.body;
        if (box.parentNode !== host) host.appendChild(box);
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

    // Ảnh phòng chiếu thật cho rạp chưa chiếu gì (assets/cinema/CREDITS.md); đang chiếu thì là ảnh của phim/bài.
    const HALL_PHOTOS = { 'rap-1': '/assets/cinema/hall-1.jpg', 'rap-2': '/assets/cinema/hall-2.jpg', 'rap-3': '/assets/cinema/hall-3.jpg' };

    function renderLobby(rooms) {
        const list = $('#cine-rooms');
        const focusedId = document.activeElement && document.activeElement.getAttribute('data-room');
        list.textContent = '';
        let watching = 0;
        let showing = 0;
        rooms.forEach((room) => {
            const people = typeof room.people === 'number' ? room.people : room.taken;
            watching += people;
            if (room.media_title) showing++;
            const li = el('li');
            const btn = el('button', 'cine-room' + (room.playing ? ' is-live' : ''));
            btn.type = 'button';
            btn.setAttribute('data-room', room.id);

            // ảnh: phim/bài đang chiếu, hoặc ảnh phòng chiếu khi rạp trống
            const pic = el('span', 'cine-room__pic');
            const img = el('img');
            img.alt = '';
            const hallPhoto = hallPhotoFor(room.id);
            img.src = room.media_thumb || hallPhoto;
            img.onerror = () => { img.onerror = null; img.src = hallPhoto; };
            pic.appendChild(img);
            btn.appendChild(pic);

            const info = el('span', 'cine-room__info');
            info.appendChild(el('span', 'cine-room__name', room.name));
            let now;
            if (room.media_title) now = (room.media_kind === 'music' ? 'Đang phát: ' : 'Đang chiếu: ') + room.media_title;
            else now = people ? 'Chủ phòng sắp chọn phim' : 'Chưa chiếu gì · đèn rạp đang sáng';
            info.appendChild(el('span', 'cine-room__now', now));
            let status = 'Trống, bạn vào trước được';
            if (room.media_title) status = room.playing ? 'Đang chiếu' : 'Tạm dừng';
            else if (people) status = 'Đang chờ chiếu';
            if (room.host_name) status += ' · Chủ phòng: ' + room.host_name;
            info.appendChild(el('span', 'cine-room__status', status));
            btn.appendChild(info);

            const seats = el('span', 'cine-room__seats');
            seats.appendChild(miniMap(room.layout, room.occupied || []));
            const count = el('span', 'cine-room__count tnum', String(people));
            count.appendChild(el('small', null, ' người trong phòng'));
            seats.appendChild(count);
            seats.appendChild(el('span', 'cine-room__taken tnum', room.taken + ' /' + room.total + ' ghế đã có người'));
            btn.appendChild(seats);

            btn.appendChild(el('span', 'cine-room__go', 'Vào rạp'));
            btn.setAttribute('aria-label', room.name + ', ' + now + ', ' + room.taken + ' trên ' + room.total + ' ghế có người');
            btn.addEventListener('click', () => enterRoom(room.id));
            li.appendChild(btn);
            list.appendChild(li);
            if (focusedId === room.id) btn.focus();
        });
        $('#cine-lobby-sub').textContent = rooms.length + ' phòng chiếu · ' +
            (showing ? showing + ' phòng đang chiếu · ' : '') +
            (watching ? watching + ' người đang trong rạp' : 'chưa có ai, bạn vào trước nhé');
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
            state.lastMsgAt = Date.now();
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
            clearInterval(state.pingTimer);
            // Ghế đang chờ trả lời sẽ không bao giờ có trả lời trên kết nối này.
            if (state.pending) { const p = state.pending; state.pending = null; renderSeat(p); }
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
        // Wi-Fi rớt thường không đóng socket ngay: không nghe gì từ server quá lâu thì tự nối lại.
        if (state.ws && state.ws.readyState === 1 && state.lastMsgAt && Date.now() - state.lastMsgAt > DEAD_AFTER_MS) {
            setConn('Mất kết nối, đang nối lại...');
            connect();
            return;
        }
        send({ type: 'ping', t: Date.now() });
    }

    // Có mạng lại hoặc quay lại tab: nối lại ngay, không chờ hết thời gian chờ của lần thử trước.
    function reconnectNow() {
        if (!state.roomId || !state.shown) return;
        const ws = state.ws;
        if (ws && ws.readyState <= 1) {
            if (ws.readyState === 1) ping();
            return;
        }
        state.retry = 0;
        connect();
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
        state.lastMsgAt = Date.now();
        setConn('');   // nghe được server tức là đã có kết nối, bỏ dòng "mất mạng"
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
                askNameOnce();
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
                renderMyName();
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
                else if (msg.action === 'chat') toast('Bạn nhắn nhanh quá, chờ vài giây nhé');
                else toast('Không đổi được nội dung chiếu');
                break;
            case 'chat':
                showBubble(msg.uid, msg.text);
                break;
            case 'room_renamed':
                $('#cine-room-name').textContent = msg.name;
                toast('Phòng đổi tên thành "' + msg.name + '"');
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
        build3D();
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
        const said = uid && activeBubble(uid);
        if (said) btn.appendChild(bubbleEl(said));
        render3DSeat(code);
        if (mine && view.mode !== 'flat') applyView(true);   // đổi ghế: camera đi tới chỗ ngồi mới

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
        const title = mediaTitle(state.media);
        $('#cine-room-meta').textContent = (title ? 'Đang chiếu: ' + title + ' · ' : '') + taken + ' /' + total + ' ghế' +
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
        // Người vừa nhắn lên đầu dải, để bong bóng của họ luôn hiện.
        // Dải này hẹp: chỉ hiện bong bóng của người nhắn gần nhất để các bong bóng không chồng lên nhau.
        let latest = null;
        uids.forEach((uid) => {
            if (activeBubble(uid) && (!latest || state.bubbles[uid].until > state.bubbles[latest].until)) latest = uid;
        });
        const shown = uids.slice().sort((a, b) => (b === latest ? 1 : 0) - (a === latest ? 1 : 0)).slice(0, 8);
        shown.forEach((uid) => {
            const face = el('span', 'cine-face');
            const av = el('span', 'cine-avatar');
            av.title = state.members[uid].name;
            fillAvatar(av, state.members[uid]);
            face.appendChild(av);
            if (uid === latest) face.appendChild(bubbleEl(activeBubble(uid)));
            faces.appendChild(face);
        });
        faces.appendChild(el('span', 'cine-faces__count', uids.length + ' người trong rạp'));
        renderMeta();
    }

    // ---------- chat: bong bóng trên đầu người gửi ----------

    function activeBubble(uid) {
        const b = state.bubbles[uid];
        return b && b.until > Date.now() ? b.text : null;
    }

    function bubbleEl(text) {
        const b = el('span', 'cine-bubble', text);
        b.setAttribute('aria-hidden', 'true');
        return b;
    }

    function showBubble(uid, text) {
        const m = state.members[uid];
        if (!m) return;
        state.bubbles[uid] = { text: text, until: Date.now() + BUBBLE_MS };
        if (m.seat) renderSeat(m.seat);
        renderPeople();
        // Toàn màn hình thì chỉ màn chiếu được vẽ: hiện tin ở góc màn chiếu.
        const feed = $('#cine-chat-feed');
        const line = el('div', 'cine-feed-line');
        line.appendChild(el('b', null, (uid === myUid() ? 'Bạn' : m.name) + ': '));
        line.appendChild(document.createTextNode(text));
        feed.appendChild(line);
        while (feed.children.length > 4) feed.removeChild(feed.firstChild);
        setTimeout(() => {
            if (line.parentNode) line.parentNode.removeChild(line);
            if (!activeBubble(uid) && state.members[uid]) {
                if (state.members[uid].seat) renderSeat(state.members[uid].seat);
                renderPeople();
            }
        }, BUBBLE_MS + 50);
    }

    function sendChat(text) {
        text = String(text || '').trim();
        if (!text) return false;
        if (!send({ type: 'chat', text: text.slice(0, 300) })) {
            toast('Đang nối lại với rạp, chưa gửi được tin');
            return false;
        }
        return true;
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

    function stageMessage(title, sub, showPick, nextEp) {
        $('#cine-stage-msg').hidden = !title;
        $('#cine-stage-title').textContent = title || '';
        $('#cine-stage-sub').textContent = sub || '';
        $('#cine-pick-empty').hidden = !showPick;
        const next = $('#cine-next-ep');
        next.hidden = !nextEp;
        if (nextEp) next.textContent = 'Chiếu ' + nextEp;
        player.endCard = false;
    }

    // ---------- đèn rạp ----------
    // Như rạp thật: đèn sáng khi chưa chiếu, tắt dần khi phim bắt đầu, sáng một nửa khi tạm dừng,
    // và sáng dần lên khi hết phim. Chỉ đổi class; CSS đổi màu nền các bề mặt trong 3,5 giây.

    let lights = '';

    function isEnded() {
        const pb = state.playback;
        if (!state.media || !pb || !player.el || !player.ready) return false;
        const dur = player.el.duration;
        // Tính theo giờ của rạp, không theo cờ "đang phát": server có thể còn ghi đang phát khi đã qua cuối phim.
        return isFinite(dur) && dur > 0 && targetPosition() >= dur - (pb.playing ? 0.3 : 1.5);
    }

    function updateLights() {
        if (!root) return;
        const ended = isEnded();
        const pb = state.playback;
        const next = !state.media || ended ? 'on' : (!pb || !pb.playing ? 'half' : 'off');
        if (ended !== root.classList.contains('is-ended')) {
            root.classList.toggle('is-ended', ended);
            showEndCard(ended);
        }
        if (next === lights) return;
        lights = next;
        root.classList.toggle('lights-on', next === 'on');
        root.classList.toggle('lights-half', next === 'half');
        document.body.classList.toggle('cinema-lit', next === 'on');
    }

    // Thẻ "Hết phim" trên màn chiếu; chủ phòng có nút chiếu tập tiếp (nếu còn) hoặc chọn phim khác.
    function showEndCard(ended) {
        if (!ended) {
            if (player.endCard) stageMessage('', '', false);
            return;
        }
        const m = state.media;
        let nextEp = null;
        if (isHost() && m && m.kind === 'film' && player.eps && m.ep + 1 < player.eps.length) {
            nextEp = player.eps[m.ep + 1] || 'tập ' + (m.ep + 2);
            if (!/^tập/i.test(nextEp)) nextEp = 'tập ' + nextEp;
        }
        const what = m && m.kind === 'music' ? 'Hết bài' : 'Hết phim';
        stageMessage(what,
            isHost() ? 'Đèn rạp đã sáng. ' + (nextEp ? 'Chiếu tiếp hoặc chọn nội dung khác.' : 'Chọn nội dung tiếp theo cho cả rạp.') : 'Đèn rạp đã sáng. Chờ chủ phòng chọn nội dung tiếp theo.',
            isHost(), nextEp);
        player.endCard = true;
    }

    function playNextEpisode() {
        const m = state.media;
        if (!isHost() || !m || m.kind !== 'film' || !player.eps || m.ep + 1 >= player.eps.length) return;
        const base = (m.title || '').split(' · ')[0] || m.slug;
        const label = player.eps[m.ep + 1] || 'Tập ' + (m.ep + 2);
        setFilm(m.slug, m.ep + 1, base + ' · ' + label, m.thumb);
    }

    function renderStage() {
        const m = state.media;
        const title = mediaTitle(m);
        $('#cine-arc-title').textContent = title ? 'Đang chiếu: ' + title : 'Màn chiếu · chưa chiếu gì';
        // tấm màn chiếu ở đầu sơ đồ ghế hiện đúng thứ đang chiếu
        const thumb = m ? (m.kind === 'music' ? m.track.thumbnail : m.thumb) : '';
        const mini = $('#cine-mini-screen');
        mini.style.backgroundImage = thumb ? 'url("' + thumb.replace(/"/g, '%22') + '")' : '';
        mini.classList.toggle('has-picture', !!thumb);
        renderMeta();
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
        updateLights();
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
        player.eps = null;
        if (root) {
            root.classList.remove('is-buffering', 'is-ended');
            $('#cine-unlock').hidden = true;
            $('#cine-cover').hidden = true;
            root.classList.remove('has-media');
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
                player.eps = eps.map((e, i) => e.name || 'Tập ' + (i + 1));   // cho nút "chiếu tập tiếp" lúc hết phim
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
        root.classList.remove('has-media');
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
            root.classList.add('has-media');
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
            // Video dừng trước khi tự phát sự kiện "ended", nên máy chủ phòng báo cả rạp dừng ở cuối tại đây.
            if (pb.playing && isHost()) send({ type: 'pause', position: dur });
            updateLights();
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
        updateLights();
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
            // iPhone chỉ cho video tự phóng toàn màn hình
            else if (player.el && player.el.webkitEnterFullscreen) player.el.webkitEnterFullscreen();
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
        if (back && !back.hidden && root.classList.contains('is-watching')) tvFocus(back);
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
        if (tab === 'film' && !locked) searchFilms('');
        else if (tab === 'music') showMusicDefaults();
        // Trên TV đứng ở tab đang chọn: focus vào ô nhập sẽ bật bàn phím ảo che mất danh sách.
        if (isTv()) tvFocus($(tab === 'film' ? '#cine-tab-film' : '#cine-tab-music'));
        else $(locked ? '#cine-vip-code' : '#cine-pick-q').focus();
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

    // ---------- rạp 3D: xem từ ghế ngồi (ngôi thứ nhất) hoặc từ sau lưng (ngôi thứ ba) ----------
    // Dựng bằng CSS 3D, không dùng WebGL: TV Chrome 63 yếu, và video thật nằm thẳng trên mặt màn chiếu
    // nên không phải vẽ lại từng khung hình. Hàng ghế là một mặt phẳng, ghế là phần tử 2D bên trong nó,
    // để cả rạp chỉ khoảng 40 mặt phẳng 3D.

    const VIEWS = ['flat', 'seat', 'third'];
    const VIEW_LABEL = { flat: 'Màn chiếu', seat: 'Từ ghế', third: 'Ngôi thứ ba' };
    const VIEW_ICON = { flat: 'tv', seat: 'event_seat', third: 'person' };
    const VIEW_KEY = 'cinema_view';
    // Kích thước rạp, tính bằng px trong thế giới 3D. x sang phải, y xuống dưới, z về phía người xem.
    const HALL = {
        halfW: 700,          // nửa bề ngang rạp
        screenW: 1240,
        screenZ: -1900,
        screenBottom: -150,  // mép dưới màn chiếu cao hơn sàn trước hàng A
        rowAZ: -1100,        // lưng ghế hàng A
        rowGap: 110,         // khoảng cách giữa hai hàng
        step: 32,            // mỗi hàng cao hơn hàng trước (sàn bậc thang)
        seatGap: 80,
        aisle: 70,
        backZ: 80,           // tường sau
        ceilY: -1000,
        eye: 115,            // mắt người ngồi cao hơn sàn hàng đó
        backH: 80,           // lưng ghế
    };
    HALL.screenH = HALL.screenW * 9 / 16;
    HALL.screenCY = HALL.screenBottom - HALL.screenH / 2;
    const LOOK_RETURN_MS = 2500;   // remote: thôi bấm chừng này thì quay về nhìn màn chiếu
    const LOOK_STEP = 40;          // remote: mỗi lần bấm ← → quay đầu chừng này độ

    const view = { mode: 'flat', yaw: 0, pitch: 0, drag: null, returnTimer: null, rows: [], seats: {}, xs: {} };
    try { const v = localStorage.getItem(VIEW_KEY); if (VIEWS.indexOf(v) !== -1) view.mode = v; } catch (e) { /* bỏ qua */ }

    function rowZ(r) { return HALL.rowAZ + r * HALL.rowGap; }
    function rowFloor(r) { return -r * HALL.step; }

    function plane(cls, w, h, transform) {
        const p = el('div', 'cw3 ' + cls);
        p.style.width = w + 'px';
        p.style.height = h + 'px';
        p.style.marginLeft = (-w / 2) + 'px';
        p.style.marginTop = (-h / 2) + 'px';
        p.style.transform = transform;
        return p;
    }

    // Độ sáng phủ lên vải nhung của từng hàng, ở ba mức đèn: hàng gần màn chiếu sáng hơn
    // (ánh màn chiếu hắt xuống), hàng cuối tối hơn. Mỗi hàng một màu xám, nhân với ảnh vải.
    function rowTones(r, rows) {
        const t = rows > 1 ? r / (rows - 1) : 0;
        const grey = (a, b) => { const v = Math.round(a + (b - a) * t); return 'rgb(' + v + ',' + v + ',' + v + ')'; };
        return { dim: grey(118, 72), half: grey(170, 140), lit: grey(236, 214) };
    }

    function build3D() {
        const hall = $('#cine-hall3d');
        hall.textContent = '';
        view.rows = [];
        view.seats = {};
        const L = state.layout;
        if (!L) return;
        const H = HALL;

        // vị trí x của từng cột, có lối đi, căn giữa rạp
        let x = 0;
        const raw = {};
        const aisleXs = [];
        for (let c = 1; c <= L.cols; c++) {
            raw[c] = x;
            x += H.seatGap;
            if (L.aisles.indexOf(c) !== -1 && c !== L.cols) { aisleXs.push(x + H.aisle / 2 - H.seatGap / 2); x += H.aisle; }
        }
        const shift = raw[L.cols] / 2;
        view.xs = {};
        for (let c = 1; c <= L.cols; c++) view.xs[c] = raw[c] - shift;

        const depth = H.backZ - H.screenZ;
        const midZ = (H.backZ + H.screenZ) / 2;
        const wallH = -H.ceilY;
        const wide = H.halfW * 2;

        // tường hai bên, có các tấm tiêu âm và biển lối ra ở gần màn chiếu
        const left = plane('cw-wall', depth, wallH, 'translate3d(' + (-H.halfW) + 'px,' + (H.ceilY / 2) + 'px,' + midZ + 'px) rotateY(90deg)');
        const right = plane('cw-wall', depth, wallH, 'translate3d(' + H.halfW + 'px,' + (H.ceilY / 2) + 'px,' + midZ + 'px) rotateY(-90deg)');
        [left, right].forEach((wall, i) => {
            for (let k = 0; k < 9; k++) {
                const panel = el('span', 'cw-panel');
                panel.style.left = (60 + k * 210) + 'px';
                wall.appendChild(panel);
            }
            // đèn tường ở khoảng giữa các tấm tiêu âm
            for (let k = 0; k < 4; k++) {
                const sconce = el('span', 'cw-sconce');
                sconce.style.left = (427 + k * 420) + 'px';   // tâm khe hở 60px giữa hai tấm tiêu âm
                wall.appendChild(sconce);
            }
            const exit = el('span', 'cw-exit', 'LỐI RA');
            // tường trái: phía màn chiếu ở bên phải mặt phẳng; tường phải thì ngược lại
            exit.style[i === 0 ? 'right' : 'left'] = '180px';
            wall.appendChild(exit);
            hall.appendChild(wall);
        });
        const ceil = plane('cw-ceil', wide, depth, 'translate3d(0,' + H.ceilY + 'px,' + midZ + 'px) rotateX(-90deg)');
        for (let a = 0; a < 3; a++) {        // đèn trần: 3 dãy dọc rạp
            for (let b = 0; b < 6; b++) {
                const dl = el('span', 'cw-downlight');
                dl.style.left = (wide * (a + 1) / 4 - 17) + 'px';
                dl.style.top = (160 + b * 300) + 'px';
                ceil.appendChild(dl);
            }
        }
        hall.appendChild(ceil);
        // màn nhung hai bên màn chiếu
        [-1, 1].forEach((side) => {
            const w = 150;
            const curtain = plane('cw-curtain', w, H.screenH + 220,
                'translate3d(' + (side * (H.screenW / 2 + w / 2 + 10)) + 'px,' + (H.screenCY - 40) + 'px,' + (H.screenZ + 4) + 'px)');
            for (let k = 0; k * 22 < w; k++) {
                const pleat = el('span', 'cw-pleat' + (k % 2 ? ' is-deep' : ''));
                pleat.style.left = (k * 22) + 'px';
                curtain.appendChild(pleat);
            }
            hall.appendChild(curtain);
        });
        hall.appendChild(plane('cw-front', wide, wallH, 'translate3d(0,' + (H.ceilY / 2) + 'px,' + (H.screenZ - 6) + 'px)'));
        const back = plane('cw-back', wide, wallH, 'translate3d(0,' + (H.ceilY / 2) + 'px,' + H.backZ + 'px) rotateY(180deg)');
        back.appendChild(el('span', 'cw-booth'));   // ô kính phòng máy chiếu
        hall.appendChild(back);

        // sàn trước hàng A, rồi từng hàng: mặt bậc, thành bậc (có đèn lối đi) và hàng ghế
        const frontEnd = rowZ(0) - 95;
        const frontDepth = frontEnd - H.screenZ;
        hall.appendChild(plane('cw-floor', wide, frontDepth, 'translate3d(0,0,' + (H.screenZ + frontDepth / 2) + 'px) rotateX(90deg)'));
        for (let r = 0; r < L.rows; r++) {
            const y = rowFloor(r);
            const z = rowZ(r);
            hall.appendChild(plane('cw-tread', wide, H.rowGap, 'translate3d(0,' + y + 'px,' + (z - 40) + 'px) rotateX(90deg)'));
            const riser = plane('cw-riser', wide, H.step, 'translate3d(0,' + (y + H.step / 2) + 'px,' + (z - 95) + 'px)');
            // đèn ở các lối đi giữa và hai lối bên (toạ độ chưa căn giữa, nên trừ shift)
            aisleXs.concat([-60, raw[L.cols] + 60]).forEach((ax) => {
                const lamp = el('span', 'cw-lamp');
                lamp.style.left = (H.halfW + ax - shift - 4) + 'px';
                riser.appendChild(lamp);
            });
            if (r > 0) hall.appendChild(riser);
            const row = plane('cw-row', wide, H.backH, 'translate3d(0,' + (y - H.backH / 2) + 'px,' + z + 'px)');
            const tones = rowTones(r, L.rows);
            row.style.setProperty('--dim', tones.dim);
            row.style.setProperty('--half', tones.half);
            row.style.setProperty('--lit', tones.lit);
            for (let c = 1; c <= L.cols; c++) {
                const code = ROW_LETTERS[r] + c;
                const seat = el('span', 'cw-seat');
                seat.style.left = (H.halfW + view.xs[c] - 30) + 'px';
                row.appendChild(seat);
                view.seats[code] = seat;
            }
            view.rows.push(row);
            hall.appendChild(row);
        }
        Object.keys(view.seats).forEach(render3DSeat);
        applyView(false);
    }

    // Từ sau lưng chỉ thấy đầu và vai người ngồi; đầu là ảnh đại diện để biết ai ngồi đâu.
    function render3DSeat(code) {
        const seat = view.seats[code];
        if (!seat) return;
        const uid = state.seats[code];
        const member = uid ? (state.members[uid] || { uid: uid, name: '?', avatar: '' }) : null;
        seat.className = 'cw-seat' + (uid === myUid() ? ' is-mine' : '') + (member && member.away ? ' is-away' : '');
        seat.textContent = '';
        seat.appendChild(el('span', 'cw-num', code.slice(1)));   // biển số ghế trên lưng ghế
        if (!member) return;
        // Từ sau lưng thấy vai áo và gáy tóc, không thấy mặt: áo là màu riêng của người đó nhưng trầm hơn
        // (rạp tối), tóc là một màu tóc tự nhiên chọn theo uid. Ảnh đại diện vẫn ở sơ đồ ghế và danh sách.
        const body = el('span', 'cw-body');
        body.style.background = clothFor(member.uid);
        seat.appendChild(body);
        const head = el('span', 'cw-head');
        head.style.background = hairFor(member.uid);
        seat.appendChild(head);
        if (uid === myUid()) seat.appendChild(el('span', 'cw-you', 'Bạn'));
        const said = activeBubble(uid);
        if (said) seat.appendChild(el('span', 'cw-bubble', said));
    }

    function seatPlace(code) {
        const L = state.layout;
        const r = code ? ROW_LETTERS.indexOf(code.charAt(0)) : -1;
        if (r < 0) return { x: 0, floor: rowFloor(L.rows - 1), z: rowZ(L.rows - 1) };   // chưa có ghế: đứng cuối rạp
        return { x: view.xs[Number(code.slice(1))] || 0, floor: rowFloor(r), z: rowZ(r) };
    }

    function deg(rad) { return rad * 180 / Math.PI; }

    function applyView(animate) {
        if (!root) return;
        const stage = $('#cine-stage');
        const world = $('#cine-world');
        const screen = $('#cine-wscreen');
        const is3d = view.mode !== 'flat' && !!state.layout;
        root.classList.toggle('view-3d', is3d);
        root.classList.toggle('view-third', is3d && view.mode === 'third');
        const btn = $('#cine-view');
        btn.firstElementChild.textContent = VIEW_ICON[view.mode];
        $('#cine-view-label').textContent = VIEW_LABEL[view.mode];
        btn.setAttribute('aria-label', 'Đổi góc nhìn: đang xem ' + VIEW_LABEL[view.mode]);
        if (!is3d) {
            stage.style.perspective = '';
            world.style.transform = '';
            screen.style.transform = '';
            return;
        }
        const H = HALL;
        const me = seatPlace(mySeat());
        // góc ngẩng (độ, dương là nhìn lên) từ camera tới một điểm
        const elev = (c, pt) => deg(Math.atan2(c.y - pt.y, Math.sqrt((pt.x - c.x) * (pt.x - c.x) + (pt.z - c.z) * (pt.z - c.z))));
        // Tiêu cự theo cả chiều cao: khung màn chiếu thường dẹt, tính theo bề ngang thì góc nhìn dọc chỉ còn ±13°.
        let P = Math.round(Math.max(stage.clientHeight * 1.15, stage.clientWidth * 0.5));
        let cam;
        let yaw;
        let pitch;
        if (view.mode === 'seat') {
            cam = { x: me.x, y: me.floor - H.eye, z: me.z - 20 };
            const center = { x: 0, y: H.screenCY, z: H.screenZ };
            yaw = deg(Math.atan2(center.x - cam.x, cam.z - center.z));
            // mắt hơi chúc xuống so với tâm màn chiếu, để thấy hàng ghế và đầu người phía trước như ngồi rạp thật
            pitch = elev(cam, center) - 6;
        } else {
            // Sau lưng và cao hơn đầu mình. Chúc xuống vừa đủ để trong khung có cả đầu mình (dưới) và mép trên màn chiếu.
            cam = { x: me.x * 0.85, y: me.floor - H.eye - 150, z: Math.min(me.z + 450, H.backZ - 30) };
            const head = { x: me.x, y: me.floor - 10, z: me.z };   // tới chân ghế, để thấy trọn mình trên ghế
            const top = { x: 0, y: H.screenCY - H.screenH / 2, z: H.screenZ };
            yaw = deg(Math.atan2((head.x + top.x) / 2 - cam.x, cam.z - (head.z + top.z) / 2));
            const up = elev(cam, top);
            const down = elev(cam, head);
            pitch = (up + down) / 2;
            // nới góc nhìn nếu cần để cả hai điểm nằm trong khung, chừa 4 độ mỗi bên
            const half = (up - down) / 2 + 4;
            P = Math.min(P, Math.round(stage.clientHeight / 2 / Math.tan(half * Math.PI / 180)));
        }
        yaw += view.yaw;
        pitch += view.pitch;
        stage.style.perspective = P + 'px';
        world.classList.toggle('is-still', !animate);
        world.style.transform = 'translateZ(' + P + 'px) rotateX(' + pitch.toFixed(2) + 'deg) rotateY(' + yaw.toFixed(2) + 'deg) translate3d(' +
            (-cam.x).toFixed(1) + 'px,' + (-cam.y).toFixed(1) + 'px,' + (-cam.z).toFixed(1) + 'px)';
        screen.style.transform = 'translate3d(0,' + H.screenCY + 'px,' + H.screenZ + 'px)';
        // Ẩn hàng ghế đi xuyên qua chỗ camera (ngôi thứ nhất: hàng của mình) và các hàng chắn giữa camera với mình
        // (ngôi thứ ba). Hàng phía sau vẫn giữ, để quay đầu lại thấy người ngồi sau.
        view.rows.forEach((row, r) => {
            const z = rowZ(r);
            const hide = view.mode === 'seat' ? Math.abs(z - cam.z) < 60 : (z > me.z + 5 && z < cam.z + 60);
            row.style.visibility = hide ? 'hidden' : '';
            // hàng sau lưng camera được nhìn từ mặt sau: lật chữ và ảnh cho khỏi ngược
            row.classList.toggle('is-behind', z > cam.z);
        });
    }

    function setView(mode, quiet) {
        view.mode = mode;
        view.yaw = 0;
        view.pitch = 0;
        try { localStorage.setItem(VIEW_KEY, mode); } catch (e) { /* bỏ qua */ }
        applyView(true);
        if (!quiet) toast('Góc nhìn: ' + VIEW_LABEL[mode] + (mode !== 'flat' && !mySeat() ? ' (chọn ghế để xem từ chỗ ngồi)' : ''));
    }

    function cycleView() {
        setView(VIEWS[(VIEWS.indexOf(view.mode) + 1) % VIEWS.length]);
    }

    // Nhìn quanh: kéo chuột/vuốt, hoặc ← → trên remote; thả ra (hoặc thôi bấm) thì quay về màn chiếu.
    function lookBy(dYaw, dPitch) {
        view.yaw = Math.max(-170, Math.min(170, view.yaw + dYaw));
        view.pitch = Math.max(-35, Math.min(35, view.pitch + dPitch));
        applyView(true);
        clearTimeout(view.returnTimer);
        view.returnTimer = setTimeout(lookHome, LOOK_RETURN_MS);
    }

    function lookHome() {
        clearTimeout(view.returnTimer);
        if (!view.yaw && !view.pitch) return;
        view.yaw = 0;
        view.pitch = 0;
        applyView(true);
    }

    function bindLook() {
        const stage = $('#cine-stage');
        stage.addEventListener('pointerdown', (e) => {
            if (view.mode === 'flat' || e.button > 0 || (e.target.closest && e.target.closest('button'))) return;
            clearTimeout(view.returnTimer);
            view.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, yaw: view.yaw, pitch: view.pitch };
            $('#cine-world').classList.add('is-dragging');
        });
        stage.addEventListener('pointermove', (e) => {
            const d = view.drag;
            if (!d || d.id !== e.pointerId) return;
            // kéo sang phải như nắm cả rạp kéo đi, tức là quay đầu sang trái
            view.yaw = Math.max(-170, Math.min(170, d.yaw - (e.clientX - d.x) * 0.3));
            view.pitch = Math.max(-35, Math.min(35, d.pitch + (e.clientY - d.y) * 0.2));
            applyView(false);
        });
        const end = (e) => {
            if (!view.drag || view.drag.id !== e.pointerId) return;
            view.drag = null;
            $('#cine-world').classList.remove('is-dragging');
            lookHome();
        };
        stage.addEventListener('pointerup', end);
        stage.addEventListener('pointercancel', end);
        const refit = () => { if (view.mode !== 'flat') applyView(false); };
        window.addEventListener('resize', refit);
        document.addEventListener('fullscreenchange', refit);
        document.addEventListener('webkitfullscreenchange', refit);
    }

    // ---------- hộp hỏi một dòng chữ: tạo phòng, đổi tên phòng, tên của bạn ----------

    const ask = { onOk: null, back: null };

    function openAsk(opts) {
        ask.onOk = opts.onOk;
        ask.back = document.activeElement;
        $('#cine-ask-title').textContent = opts.title;
        $('#cine-ask-sub').textContent = opts.sub || '';
        $('#cine-ask-error').textContent = '';
        $('#cine-ask-ok').textContent = opts.ok;
        $('#cine-ask-ok').disabled = false;
        const input = $('#cine-ask-input');
        input.value = opts.value || '';
        input.placeholder = opts.placeholder || '';
        $('#cine-ask').hidden = false;
        // trên TV đứng ở nút xác nhận: focus vào ô nhập sẽ bật bàn phím ảo ngay
        if (isTv()) tvFocus(input.value ? $('#cine-ask-ok') : input);
        else { input.focus(); input.select(); }
    }

    function closeAsk() {
        $('#cine-ask').hidden = true;
        ask.onOk = null;
        if (ask.back && ask.back.focus) tvFocus(ask.back);
    }

    function askError(text) {
        $('#cine-ask-error').textContent = text;
        $('#cine-ask-ok').disabled = false;
    }

    function createRoom() {
        const me = myName(myUid());
        openAsk({
            title: 'Tạo phòng chiếu',
            sub: 'Đặt tên để bạn bè nhận ra phòng. Bạn vào trước nên là chủ phòng, chọn phim cho cả phòng.',
            value: /^Khách /.test(me) ? '' : 'Phòng của ' + me,
            placeholder: 'Ví dụ: Tối thứ sáu xem phim',
            ok: 'Tạo phòng',
            onOk: (name) => {
                $('#cine-ask-ok').disabled = true;
                fetch('/cinema/rooms', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: name }),
                })
                    .then((r) => r.json().then((body) => ({ ok: r.ok, body: body })))
                    .then((res) => {
                        if (!res.ok) { askError(res.body.detail || 'Không tạo được phòng, thử lại nhé.'); return; }
                        closeAsk();
                        enterRoom(res.body.id);
                    })
                    .catch(() => askError('Chưa kết nối được tới rạp, thử lại sau giây lát.'));
            },
        });
    }

    function renameRoom() {
        if (!isHost()) return;
        openAsk({
            title: 'Đổi tên phòng',
            sub: 'Mọi người trong phòng và ở sảnh sẽ thấy tên mới.',
            value: $('#cine-room-name').textContent,
            ok: 'Đổi tên',
            onOk: (name) => {
                if (!send({ type: 'rename', name: name })) { askError('Đang nối lại với rạp, thử lại sau giây lát.'); return; }
                closeAsk();
            },
        });
    }

    // Tên người xem: khách chưa đặt tên thì được hỏi một lần khi vào phòng; ai cũng đổi được bằng nút "Tên của bạn".
    function askMyName(firstTime) {
        openAsk({
            title: firstTime ? 'Bạn tên gì?' : 'Tên của bạn',
            sub: 'Mọi người trong phòng sẽ thấy tên này cạnh ghế bạn ngồi.',
            value: savedName() || accountName(),
            placeholder: 'Tên hiển thị',
            ok: firstTime ? 'Vào rạp' : 'Lưu tên',
            onOk: (name) => {
                try { localStorage.setItem(NAME_KEY, name.slice(0, 40)); } catch (e) { /* bỏ qua */ }
                send({ type: 'hello', name: myName(myUid()), avatar: myAvatar() });
                renderMyName();
                closeAsk();
            },
        });
    }

    let askedName = false;
    function askNameOnce() {
        renderMyName();
        if (askedName || savedName() || accountName()) return;
        askedName = true;
        askMyName(true);
    }

    function renderMyName() {
        $('#cine-me-name').textContent = myName(myUid());
        $('#cine-rename').hidden = !isHost();
    }

    // phòng tự tạo không có ảnh riêng: lấy một trong ba ảnh phòng chiếu theo id
    function hallPhotoFor(id) {
        if (HALL_PHOTOS[id]) return HALL_PHOTOS[id];
        let h = 0;
        for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 997;
        return HALL_PHOTOS['rap-' + (h % 3 + 1)];
    }

    function isTv() {
        return document.documentElement.classList.contains('tv-mode');
    }

    // Đặt khung focus của remote (tv-remote.js); ngoài TV thì chỉ focus bình thường.
    function tvFocus(target) {
        if (!target) return;
        if (window.tvFocus) window.tvFocus(target);
        else target.focus();
    }

    function setMode(mode) {
        state.mode = mode;
        root.classList.toggle('is-watching', mode === 'watching');
        if (mode === 'watching') setTimeout(() => applyView(false), 0);   // màn chiếu vừa hiện: tính lại theo cỡ thật
        if (!isTv()) return;
        // Trên TV: vào chế độ xem thì đứng ở màn chiếu (OK để phóng to); về sơ đồ thì đứng ở ghế của mình.
        const target = mode === 'watching' ? $('#cine-stage') : (state.seatEls[mySeat()] || state.seatEls.E5 || $('#cine-back'));
        setTimeout(() => tvFocus(target), 0);
    }

    // ---------- remote TV ----------

    const TV = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13, BACK: 10009, ESC: 27, PLAY_PAUSE: 10252, PLAY: 415, PAUSE: 19, FF: 417, RW: 412 };
    const TV_SEEK = 10;

    function hostSeekBy(seconds) {
        if (!state.media) return;
        if (!isHost()) { toast('Chủ phòng điều khiển màn chiếu'); return; }
        const pos = player.el && player.ready ? player.el.currentTime : targetPosition();
        send({ type: 'seek', position: Math.max(0, pos + seconds) });
    }

    function isFullscreen() {
        const full = document.fullscreenElement || document.webkitFullscreenElement;
        return !!full && (full === $('#cine-stage') || root.contains(full));
    }

    // tv-remote.js gọi hàm này trước khi tự xử lý phím; trả true nghĩa là rạp đã xử lý.
    function tvKey(e, focused) {
        // hộp chọn nội dung hoặc hộp hỏi tên đang mở: để tv-remote lo (Back sẽ bấm nút "Đóng")
        if (!state.shown || !state.roomId || !root || !$('#cine-picker').hidden || !$('#cine-ask').hidden) return false;
        const k = e.keyCode;
        const stage = $('#cine-stage');
        const watching = state.mode === 'watching';
        const playing = !!(state.playback && state.playback.playing);

        // phím phát/dừng/tua trên remote: chỉ chủ phòng, và đi qua server để cả rạp cùng theo
        if (k === TV.PLAY_PAUSE || k === TV.PLAY || k === TV.PAUSE) {
            if (!state.media) return true;
            if (!isHost()) { toast('Chủ phòng điều khiển màn chiếu'); return true; }
            if ((k === TV.PLAY && playing) || (k === TV.PAUSE && !playing)) return true;
            onPlayClick();
            return true;
        }
        if (k === TV.FF || k === TV.RW) { hostSeekBy(k === TV.FF ? TV_SEEK : -TV_SEEK); return true; }

        if (isFullscreen()) {
            if (k === TV.ENTER) {
                if (player.blocked) unlockPlayback();
                else if (isHost()) onPlayClick();
                else toast('Chủ phòng điều khiển màn chiếu');
                return true;
            }
            // ↑ đổi góc nhìn. ← → : ở rạp 3D thì quay đầu nhìn quanh, ở màn chiếu phẳng thì tua (chủ phòng)
            if (k === TV.UP) { cycleView(); return true; }
            if (k === TV.LEFT || k === TV.RIGHT) {
                if (view.mode !== 'flat') lookBy(k === TV.RIGHT ? LOOK_STEP : -LOOK_STEP, 0);
                else hostSeekBy(k === TV.RIGHT ? TV_SEEK : -TV_SEEK);
                return true;
            }
            if (k === TV.DOWN) return true;
            if (k === TV.BACK || k === TV.ESC) { toggleFullscreen(); return true; }
            return false;
        }

        if (watching && focused === stage && k === TV.ENTER) {
            if (player.blocked) unlockPlayback();   // cú bấm OK cũng cho phép phát có tiếng
            toggleFullscreen();
            return true;
        }
        if (watching && focused === stage && view.mode !== 'flat' && (k === TV.LEFT || k === TV.RIGHT)) {
            lookBy(k === TV.RIGHT ? LOOK_STEP : -LOOK_STEP, 0);
            return true;
        }
        if (focused === $('#cine-seek') && (k === TV.LEFT || k === TV.RIGHT) && isHost()) {
            hostSeekBy(k === TV.RIGHT ? TV_SEEK : -TV_SEEK);
            return true;
        }
        // ↑ từ hàng ghế đầu: lên màn chiếu
        if (!watching && k === TV.UP && focused && focused.getAttribute && /^A\d+$/.test(focused.getAttribute('data-seat') || '')) {
            if (mySeat()) { setMode('watching'); return true; }
            return false;
        }
        // Back: đang xem thì về sơ đồ ghế, đang ở sơ đồ ghế thì về sảnh
        if (k === TV.BACK || (k === TV.ESC && e.isTrusted)) {
            if (watching) { setMode('picking'); return true; }
            leaveRoom();
            setTimeout(() => tvFocus(root.querySelector('.cine-room')), 300);
            return true;
        }
        return false;
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
        $('#cine-create').addEventListener('click', createRoom);
        $('#cine-rename').addEventListener('click', renameRoom);
        $('#cine-me').addEventListener('click', () => askMyName(false));
        $('#cine-ask-cancel').addEventListener('click', closeAsk);
        $('#cine-ask').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeAsk(); });
        $('#cine-ask-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const value = $('#cine-ask-input').value.trim();
            if (!value) { $('#cine-ask-error').textContent = 'Nhập một cái tên nhé.'; return; }
            if (ask.onOk) ask.onOk(value);
        });
        document.addEventListener('keydown', (e) => {
            if ((e.key === 'Escape' || e.keyCode === 27) && !$('#cine-ask').hidden) closeAsk();
        });
        $('#cine-to-stage').addEventListener('click', () => setMode('watching'));
        $('#cine-change-seat').addEventListener('click', () => setMode('picking'));

        $('#cine-chat').addEventListener('submit', (e) => {
            e.preventDefault();
            const input = $('#cine-chat-input');
            if (sendChat(input.value)) input.value = '';
        });
        Array.prototype.forEach.call(root.querySelectorAll('.cine-chip'), (chip) => {
            chip.addEventListener('click', () => sendChat(chip.getAttribute('data-say')));
        });
        window.addEventListener('online', reconnectNow);
        window.addEventListener('offline', () => { if (state.roomId && state.shown) setConn('Mất mạng, sẽ tự nối lại khi có mạng...'); });
        document.addEventListener('visibilitychange', () => { if (!document.hidden) reconnectNow(); });

        $('#cine-unlock').addEventListener('click', unlockPlayback);
        $('#cine-play').addEventListener('click', onPlayClick);
        const seek = $('#cine-seek');
        seek.addEventListener('input', () => { seeking = true; $('#cine-time').textContent = fmtTime(Number(seek.value)); });
        seek.addEventListener('change', onSeekChange);
        $('#cine-mute').addEventListener('click', onMuteClick);
        $('#cine-full').addEventListener('click', toggleFullscreen);
        $('#cine-view').addEventListener('click', cycleView);
        bindLook();

        $('#cine-pick-open').addEventListener('click', openPicker);
        $('#cine-pick-empty').addEventListener('click', openPicker);
        $('#cine-next-ep').addEventListener('click', playNextEpisode);
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

    window.Cinema = { onShow: onShow, onHide: onHide, enter: enterRoom, leave: leaveRoom, tvKey: tvKey };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
