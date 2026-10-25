/* KietStation: Now Playing view.
   Opens when a person clicks a track. Shows the poster (music) or the show cover (podcast) large,
   with title, progress and controls. It only drives the existing player (toggleMainPlay,
   playNextTrack, playPreviousTrack, the shared <audio>), it never plays anything itself. */
(function () {
    const SPEEDS = [1, 1.25, 1.5, 2];
    let speedIdx = 0;
    let open = false;
    let coverReq = 0;

    const $ = (id) => document.getElementById(id);
    const audio = () => $('local-audio');

    function fmt(sec) {
        if (!isFinite(sec) || sec < 0) return '0:00';
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        if (m >= 60) {
            const h = Math.floor(m / 60);
            return h + ':' + String(m % 60).padStart(2, '0') + ':' + String(s).padStart(2, '0');
        }
        return m + ':' + String(s).padStart(2, '0');
    }

    function isPodcast(data) {
        if (data && (data.type === 'podcast' || data.__podcast)) return true;
        const btn = $('type-podcast');
        return !!(btn && btn.classList.contains('bg-primary'));
    }

    function posterUrl(url) {
        // YouTube serves a sharper poster at maxresdefault; fall back to the original if it 404s.
        const m = /^(https?:\/\/i\d?\.ytimg\.com\/vi\/[\w-]{11}\/)[a-z]+\.jpg/i.exec(url || '');
        return m ? m[1] + 'maxresdefault.jpg' : url;
    }

    function build() {
        if ($('np')) return;
        const el = document.createElement('section');
        el.id = 'np';
        el.className = 'np';
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-modal', 'true');
        el.setAttribute('aria-label', 'Đang phát');
        el.setAttribute('aria-hidden', 'true');
        el.tabIndex = -1;
        el.innerHTML = `
            <button type="button" class="np-close" id="np-close" aria-label="Thu nhỏ trình phát" title="Thu nhỏ (Esc)">
                <span class="material-symbols-outlined">keyboard_arrow_down</span>
            </button>
            <div class="np-stage">
                <figure class="np-cover" id="np-cover-wrap">
                    <img id="np-cover" alt="" decoding="async">
                </figure>
                <div class="np-info">
                    <p class="np-kind" id="np-kind">Đang phát</p>
                    <h2 class="np-title" id="np-title">Chọn bài hát</h2>
                    <p class="np-artist" id="np-artist"></p>
                    <div class="np-seek" id="np-seek" role="slider" tabindex="0" aria-label="Tua" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
                        <div class="np-seek-fill" id="np-fill"></div>
                    </div>
                    <div class="np-times"><span id="np-cur">0:00</span><span id="np-dur">0:00</span></div>
                    <div class="np-controls">
                        <button type="button" class="np-btn np-pod" id="np-back" aria-label="Lùi 10 giây" title="Lùi 10 giây">
                            <span class="material-symbols-outlined">replay_10</span>
                        </button>
                        <button type="button" class="np-btn" id="np-prev" aria-label="Bài trước"><span class="material-symbols-outlined">skip_previous</span></button>
                        <button type="button" class="np-btn np-play" id="np-play" aria-label="Phát hoặc tạm dừng"><span class="material-symbols-outlined" id="np-play-icon">play_arrow</span></button>
                        <button type="button" class="np-btn" id="np-next" aria-label="Bài tiếp"><span class="material-symbols-outlined">skip_next</span></button>
                        <button type="button" class="np-btn np-pod" id="np-fwd" aria-label="Tiến 30 giây" title="Tiến 30 giây">
                            <span class="material-symbols-outlined">forward_30</span>
                        </button>
                    </div>
                    <div class="np-extra">
                        <button type="button" class="np-chip np-pod" id="np-speed" aria-label="Tốc độ phát">1x</button>
                        <button type="button" class="np-chip" id="np-video" aria-label="Xem video" title="Xem video">
                            <span class="material-symbols-outlined">smart_display</span>
                        </button>
                        <button type="button" class="np-chip" id="np-heart" aria-label="Yêu thích">
                            <span class="material-symbols-outlined">favorite</span>
                        </button>
                    </div>
                    <div class="np-tabs" role="tablist" aria-label="Lời bài hát và hàng đợi">
                        <button type="button" role="tab" class="np-tab is-on" id="np-tab-lyrics" aria-selected="true" aria-controls="np-lyrics">Lời bài hát</button>
                        <button type="button" role="tab" class="np-tab" id="np-tab-queue" aria-selected="false" aria-controls="np-queue">Sắp tới <span class="np-count" id="np-queue-count" hidden>0</span></button>
                    </div>
                    <div class="np-panel" id="np-lyrics" role="tabpanel" aria-labelledby="np-tab-lyrics" aria-live="polite"></div>
                    <div class="np-panel" id="np-queue" role="tabpanel" aria-labelledby="np-tab-queue" hidden></div>
                </div>
            </div>`;
        document.body.appendChild(el);
        $('np-tab-lyrics').addEventListener('click', () => showTab('lyrics'));
        $('np-tab-queue').addEventListener('click', () => showTab('queue'));

        $('np-close').addEventListener('click', close);
        $('np-play').addEventListener('click', () => { if (window.toggleMainPlay) window.toggleMainPlay(); });
        $('np-prev').addEventListener('click', () => { if (window.playPreviousTrack) window.playPreviousTrack(); });
        $('np-next').addEventListener('click', () => { if (window.playNextTrack) window.playNextTrack(); });
        $('np-back').addEventListener('click', () => skip(-10));
        $('np-fwd').addEventListener('click', () => skip(30));
        $('np-speed').addEventListener('click', () => {
            speedIdx = (speedIdx + 1) % SPEEDS.length;
            applySpeed();
        });
        $('np-video').addEventListener('click', () => { if (window.toggleYtVideo) window.toggleYtVideo(); });
        $('np-heart').addEventListener('click', (e) => {
            if (window.toggleCurrentTrackHeart) window.toggleCurrentTrackHeart(e);
            setTimeout(syncHeart, 120);
        });
        const seek = $('np-seek');
        seek.addEventListener('click', (e) => {
            const a = audio();
            if (!a || !a.duration) return;
            const r = seek.getBoundingClientRect();
            a.currentTime = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * a.duration;
        });
        seek.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowRight') skip(5);
            if (e.key === 'ArrowLeft') skip(-5);
        });
        document.addEventListener('keydown', (e) => { if (open && e.key === 'Escape') close(); });
    }

    function skip(sec) {
        const a = audio();
        if (!a || !a.duration) return;
        a.currentTime = Math.min(a.duration, Math.max(0, a.currentTime + sec));
    }

    function applySpeed() {
        const a = audio();
        const v = SPEEDS[speedIdx];
        if (a) a.playbackRate = v;
        $('np-speed').textContent = v + 'x';
    }

    function syncHeart() {
        const src = document.getElementById('player-heart-btn');
        const on = !!(src && src.classList.contains('text-red-500'));
        const h = $('np-heart');
        if (h) h.classList.toggle('is-on', on);
    }

    function syncPlay() {
        const a = audio();
        const ic = $('np-play-icon');
        if (ic && a) ic.textContent = a.paused ? 'play_arrow' : 'pause';
    }

    function syncTime() {
        const a = audio();
        if (!a || !open) return;
        const pct = a.duration ? (a.currentTime / a.duration) * 100 : 0;
        $('np-fill').style.width = pct + '%';
        $('np-seek').setAttribute('aria-valuenow', String(Math.round(pct)));
        $('np-cur').textContent = fmt(a.currentTime);
        $('np-dur').textContent = fmt(a.duration);
        syncLyrics();
    }

    // The field takes the cover's dominant colour, darkened, as one flat tone.
    function tintFrom(url) {
        const root = $('np');
        const req = ++coverReq;
        root.style.setProperty('--np-field', '#111111');
        if (!window.ColorThief) return;
        const probe = new Image();
        probe.crossOrigin = 'anonymous';
        probe.onload = () => {
            if (req !== coverReq) return;
            try {
                const [r, g, b] = new window.ColorThief().getColor(probe);
                const k = 0.38;
                root.style.setProperty('--np-field', `rgb(${Math.round(r * k)}, ${Math.round(g * k)}, ${Math.round(b * k)})`);
            } catch (e) { /* tainted canvas: keep the neutral field */ }
        };
        probe.src = url;
    }


    // ---- tabs, lyrics ---------------------------------------------------
    let tab = 'lyrics';
    let lyr = { key: '', lines: [], active: -1, state: 'idle' };
    const lyrCache = new Map();

    function showTab(name) {
        tab = name;
        ['lyrics', 'queue'].forEach((n) => {
            const on = n === name;
            $('np-tab-' + n).classList.toggle('is-on', on);
            $('np-tab-' + n).setAttribute('aria-selected', String(on));
            $('np-' + n).hidden = !on;
        });
        if (name === 'queue' && window.KSQueue) window.KSQueue.render();
        if (name === 'lyrics') loadLyrics(window.currentTrackData);
    }

    function trackKey(d) { return d ? (d.link || d.file_url || d.title || '') : ''; }

    function lyricsMessage(text, retry) {
        const box = $('np-lyrics');
        box.innerHTML = '';
        const p = document.createElement('p');
        p.className = 'np-empty';
        p.textContent = text;
        box.appendChild(p);
        if (retry) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'np-chip';
            b.textContent = 'Thử lại';
            b.addEventListener('click', () => { lyrCache.delete(lyr.key); loadLyrics(window.currentTrackData, true); });
            box.appendChild(b);
        }
    }

    function renderLyrics(res) {
        const box = $('np-lyrics');
        box.innerHTML = '';
        lyr.active = -1;
        lyr.lines = [];
        if (res.instrumental) { lyricsMessage('Bài này không có lời (nhạc không lời).'); return; }
        if (res.synced && res.synced.length) {
            lyr.lines = res.synced;
            const wrap = document.createElement('div');
            wrap.className = 'np-lines';
            res.synced.forEach((l, i) => {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'np-line';
                b.dataset.i = String(i);
                b.textContent = l.text || '♪';
                b.addEventListener('click', () => { const a = audio(); if (a) a.currentTime = l.t; });
                wrap.appendChild(b);
            });
            box.appendChild(wrap);
            syncLyrics();
        } else if (res.plain) {
            const pre = document.createElement('div');
            pre.className = 'np-plain';
            pre.textContent = res.plain;
            box.appendChild(pre);
        } else {
            lyricsMessage('Chưa có lời cho bài này.');
            return;
        }
        const src = document.createElement('p');
        src.className = 'np-credit';
        src.textContent = res.source === 'youtube-subtitles' ? 'Phụ đề do chủ video đăng tải (không phải lời chính thức)' : 'Lời bài hát: lrclib.net';
        box.appendChild(src);
    }

    async function loadLyrics(data, force) {
        if (!data || tab !== 'lyrics') return;
        const key = trackKey(data);
        if (!force && key === lyr.key && lyr.state === 'done') return;
        lyr = { key, lines: [], active: -1, state: 'loading' };
        if (lyrCache.has(key)) { renderLyrics(lyrCache.get(key)); lyr.state = 'done'; return; }
        lyricsMessage('Đang tìm lời bài hát...');
        const a = audio();
        const q = new URLSearchParams({ title: data.title || '', artist: data.artist || '' });
        if (a && isFinite(a.duration) && a.duration > 0) q.set('duration', String(Math.round(a.duration)));
        const vidMatch = /(?:v=|youtu\.be\/)([\w-]{11})/.exec(data.link || '') || /^([\w-]{11})$/.exec(data.link || '');
        if (vidMatch) q.set('vid', vidMatch[1]);
        try {
            const r = await fetch('/api/lyrics?' + q.toString());
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const res = await r.json();
            if (trackKey(window.currentTrackData) !== key) return; // the track changed while we waited
            lyrCache.set(key, res);
            lyr.state = 'done';
            renderLyrics(res);
        } catch (e) {
            if (trackKey(window.currentTrackData) !== key) return;
            lyr.state = 'error';
            lyricsMessage('Không tải được lời bài hát.', true);
        }
    }

    function syncLyrics() {
        const a = audio();
        if (!a || !lyr.lines.length || tab !== 'lyrics') return;
        const t = a.currentTime + 0.25;
        let lo = 0, hi = lyr.lines.length - 1, idx = -1;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (lyr.lines[mid].t <= t) { idx = mid; lo = mid + 1; } else hi = mid - 1;
        }
        if (idx === lyr.active) return;
        lyr.active = idx;
        const box = $('np-lyrics');
        const prev = box.querySelector('.np-line.is-now');
        if (prev) prev.classList.remove('is-now');
        const cur = idx >= 0 ? box.querySelector('.np-line[data-i="' + idx + '"]') : null;
        if (cur) {
            cur.classList.add('is-now');
            box.scrollTo({ top: cur.offsetTop - box.clientHeight / 2 + cur.clientHeight / 2, behavior: 'smooth' });
        }
    }

    window.NowPlaying = { isOpen: () => open, showTab: showTab };

    function fill(data) {
        if (!data) return;
        const pod = isPodcast(data);
        const root = $('np');
        root.classList.toggle('is-podcast', pod);
        $('np-kind').textContent = pod ? 'Podcast' : 'Đang phát';
        $('np-title').textContent = data.title || '';
        $('np-artist').textContent = data.artist || (pod ? 'Podcast' : '');
        const img = $('np-cover');
        const raw = data.thumbnail || '';
        const hi = posterUrl(raw);
        img.onerror = () => { img.onerror = null; if (raw) img.src = raw; };
        img.onload = () => {
            // maxresdefault can return a 120px grey placeholder instead of a 404
            if (img.naturalWidth && img.naturalWidth <= 120 && raw && img.src !== raw) { img.src = raw; return; }
            // a landscape still keeps its own shape instead of losing its sides to a square crop
            $('np-cover-wrap').classList.toggle('is-wide', img.naturalWidth / (img.naturalHeight || 1) > 1.3);
        };
        img.src = hi || raw;
        tintFrom(raw || hi);
        speedIdx = 0;
        applySpeed();
        syncHeart();
        syncPlay();
        syncTime();
        lyr.state = 'idle';
        loadLyrics(data);
        if (window.KSQueue) window.KSQueue.render();
    }

    function openView() {
        build();
        const root = $('np');
        open = true;
        root.classList.add('is-open');
        root.setAttribute('aria-hidden', 'false');
        document.body.classList.add('np-lock');
        root.focus({ preventScroll: true });
    }

    function close() {
        const root = $('np');
        if (!root) return;
        open = false;
        root.classList.remove('is-open');
        root.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('np-lock');
    }

    window.openNowPlaying = function () {
        build();
        fill(window.currentTrackData);
        openView();
    };
    window.closeNowPlaying = close;

    function init() {
        build();
        const a = audio();
        if (a) {
            ['timeupdate', 'durationchange', 'loadedmetadata'].forEach((ev) => a.addEventListener(ev, syncTime));
            ['play', 'playing', 'pause', 'waiting'].forEach((ev) => a.addEventListener(ev, syncPlay));
            a.addEventListener('loadstart', () => { if (open) applySpeed(); });
        }
        // Clicking the mini player's cover or title opens the full view.
        ['player-thumb', 'player-title'].forEach((id) => {
            const el = $(id);
            if (el) { el.style.cursor = 'pointer'; el.addEventListener('click', () => { if (window.currentTrackData) window.openNowPlaying(); }); }
        });

        const orig = window.playTrack;
        if (typeof orig === 'function') {
            window.playTrack = function (data, mode) {
                const ev = window.event;
                const res = orig.apply(this, arguments);
                const t = window.currentTrackData;
                if (t && typeof t === 'object' && isPodcast(t)) t.__podcast = true;
                const fromRow = ev && ev.isTrusted && ev.type === 'click' && ev.target && ev.target.closest &&
                    !ev.target.closest('#player-bar') && !ev.target.closest('#np');
                if (open) fill(t);
                else if (fromRow) window.openNowPlaying();
                return res;
            };
        }
    }

    if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', () => setTimeout(init, 0));
    else setTimeout(init, 0);
})();
