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
                        <button type="button" class="np-btn np-pod" id="np-back" aria-label="Lùi 15 giây" title="Lùi 15 giây">
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
                </div>
            </div>`;
        document.body.appendChild(el);

        $('np-close').addEventListener('click', close);
        $('np-play').addEventListener('click', () => { if (window.toggleMainPlay) window.toggleMainPlay(); });
        $('np-prev').addEventListener('click', () => { if (window.playPreviousTrack) window.playPreviousTrack(); });
        $('np-next').addEventListener('click', () => { if (window.playNextTrack) window.playNextTrack(); });
        $('np-back').addEventListener('click', () => skip(-15));
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
