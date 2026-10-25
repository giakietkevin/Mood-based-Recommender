/* KietStation: listening experience.
   - UIState: one place for loading / empty / error states in lists
   - History: "Nghe gần đây" (localStorage for everyone, merged with the account's history when signed in)
   - Mood picker: choose a mood by hand instead of scanning with the camera
   - Keyboard shortcuts for the player */
(function () {
    const $ = (id) => document.getElementById(id);
    const audio = () => $('local-audio');

    // ---- UIState ---------------------------------------------------------
    function el(tag, cls, text) {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text != null) n.textContent = text;
        return n;
    }

    const UIState = {
        /** kind: 'loading' | 'empty' | 'error' */
        render(container, kind, message, retry) {
            if (!container) return;
            container.innerHTML = '';
            if (kind === 'loading') {
                const wrap = el('div', 'ks-skel');
                wrap.setAttribute('role', 'status');
                wrap.setAttribute('aria-label', message || 'Đang tải');
                for (let i = 0; i < 4; i++) wrap.appendChild(el('div', 'ks-skel-row'));
                container.appendChild(wrap);
                return;
            }
            const box = el('div', 'ks-state ks-state-' + kind);
            box.setAttribute('role', kind === 'error' ? 'alert' : 'status');
            box.appendChild(el('p', 'ks-state-text', message || ''));
            if (retry) {
                const b = el('button', 'ks-btn', 'Thử lại');
                b.type = 'button';
                b.addEventListener('click', retry);
                box.appendChild(b);
            }
            container.appendChild(box);
        }
    };
    window.UIState = UIState;

    // ---- shared recommendation grid -------------------------------------
    const ESC = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' };
    const esc = (v) => String(v == null ? '' : v).replace(/[<>&"']/g, (c) => ESC[c]);

    // Ask the server to resolve the first few songs now, so a click starts playing right away.
    let lastPrefetch = '';
    function prefetchStreams(recs) {
        const ids = (recs || []).map((r) => {
            const m = /(?:v=|youtu\.be\/)([\w-]{11})/.exec(r && r.link || '');
            return m ? m[1] : '';
        }).filter(Boolean).slice(0, 3);
        const sig = ids.join(',');
        if (!ids.length || sig === lastPrefetch) return;
        lastPrefetch = sig;
        try {
            fetch('/api/yt-prefetch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids }),
                keepalive: true
            }).catch(() => {});
        } catch (e) { /* prefetch is only an optimisation */ }
    }
    window.ksPrefetch = prefetchStreams;

    function renderRecs(container, recs, fallbackLabel) {
        window.lastRecommendations = recs;
        prefetchStreams(recs);
        const head = $('recs-head');
        if (head) head.style.display = 'none';
        const cards = recs.map((item) => {
            const safe = encodeURIComponent(JSON.stringify(item)).replace(/'/g, '%27');
            const why = item.match_reason || fallbackLabel || '';
            return `
            <article class="ks-card" onclick="playTrack('${safe}', 'youtube')" tabindex="0" role="button"
                     aria-label="Phát ${esc(item.title)}" onkeydown="if(event.key==='Enter'){playTrack('${safe}', 'youtube')}">
                <div class="ks-card-cover">
                    <img src="${esc(item.thumbnail)}" alt="" loading="lazy" decoding="async">
                    <span class="ks-card-play" aria-hidden="true"><span class="material-symbols-outlined">play_arrow</span></span>
                </div>
                <h3 class="ks-card-title">${esc(item.title)}</h3>
                <p class="ks-card-artist">${esc(item.artist || why)}</p>
                <div class="ks-card-actions" onclick="event.stopPropagation()">
                    ${window.getActionButtonsHTML ? window.getActionButtonsHTML(item, 'youtube') : ''}
                </div>
            </article>`;
        }).join('');
        container.innerHTML = '<div class="ks-grid">' + cards + '</div>' + saveBar(recs);
    }
    window.KSRenderRecs = renderRecs;

    function saveBar(recs) {
        if (!recs || !recs.length) return '';
        return '<div class="ks-gridbar"><button type="button" class="ks-btn" onclick="saveRecsAsPlaylist()">Lưu thành playlist</button>' +
            '<button type="button" class="ks-btn ks-btn-ghost" onclick="queueAllRecs()">Thêm tất cả vào hàng đợi</button></div>';
    }

    // ---- history ---------------------------------------------------------
    const HKEY = 'ks-history-v1';
    const HMAX = 20;
    let history = [];
    try {
        const raw = JSON.parse(localStorage.getItem(HKEY) || '[]');
        if (Array.isArray(raw)) history = raw.filter((t) => t && (t.link || t.file_url)).slice(0, HMAX);
    } catch (e) { history = []; }

    const idOf = (t) => t.link || t.file_url;

    function saveHistory() {
        try { localStorage.setItem(HKEY, JSON.stringify(history)); } catch (e) { /* ignore */ }
    }

    function remember(track) {
        if (!track || !idOf(track)) return;
        const slim = {
            title: track.title || '', artist: track.artist || '', thumbnail: track.thumbnail || '',
            link: track.link || '', file_url: track.file_url || '', type: track.type || ''
        };
        history = [slim].concat(history.filter((t) => idOf(t) !== idOf(slim))).slice(0, HMAX);
        saveHistory();
        renderHistory();
    }

    function renderHistory() {
        const sec = $('recent-section');
        const row = $('recent-row');
        if (!sec || !row) return;
        sec.hidden = history.length === 0;
        row.innerHTML = '';
        history.slice(0, 12).forEach((t) => {
            const b = el('button', 'ks-recent');
            b.type = 'button';
            b.title = t.title;
            const img = el('img');
            img.alt = '';
            img.loading = 'lazy';
            img.src = t.thumbnail || '';
            const name = el('span', 'ks-recent-title', t.title || 'Không có tên');
            const artist = el('span', 'ks-recent-artist', t.artist || '');
            b.append(img, name, artist);
            b.addEventListener('click', () => {
                if (window.playTrack) window.playTrack(t, (t.type === 'youtube' || t.link) ? 'youtube' : 'local');
            });
            row.appendChild(b);
        });
    }

    async function mergeServerHistory() {
        if (!window.MongoAuth || typeof window.MongoAuth.getToken !== 'function' || !window.MongoAuth.getToken()) return;
        try {
            const res = await window.MongoAuth.authenticatedFetch('/api/history/recent?limit=20');
            if (!res.ok) return;
            const data = await res.json();
            if (!data.items || !data.items.length) return;
            const seen = new Set(history.map(idOf));
            const extra = data.items.filter((t) => t.link && !seen.has(t.link));
            history = history.concat(extra).slice(0, HMAX);
            saveHistory();
            renderHistory();
        } catch (e) { /* offline or signed out: the local list is enough */ }
    }

    // ---- manual mood -----------------------------------------------------
    const MOODS = [
        { key: 'happy', label: 'Vui vẻ' },
        { key: 'neutral', label: 'Bình thản' },
        { key: 'sad', label: 'Buồn' },
        { key: 'angry', label: 'Bực bội' },
        { key: 'fear', label: 'Lo lắng' },
        { key: 'surprise', label: 'Bất ngờ' },
        { key: 'disgust', label: 'Chán nản' }
    ];
    let moodSeq = 0;

    function currentType() {
        const p = $('type-podcast');
        return p && p.classList.contains('bg-primary') ? 'podcast' : 'music';
    }

    async function pickMood(key) {
        const container = $('recommendations-container');
        if (!container) return;
        const seq = ++moodSeq;
        document.querySelectorAll('#mood-chips .ks-mood').forEach((b) => {
            const on = b.dataset.mood === key;
            b.classList.toggle('is-on', on);
            b.setAttribute('aria-pressed', String(on));
        });
        UIState.render(container, 'loading', 'Đang chọn nhạc theo tâm trạng');
        const keyword = ($('search-input') && $('search-input').value.trim()) || '';
        const headers = { 'Content-Type': 'application/json' };
        const token = window.MongoAuth && typeof window.MongoAuth.getToken === 'function' ? window.MongoAuth.getToken() : null;
        if (token) headers.Authorization = 'Bearer ' + token;
        try {
            const res = await fetch('/recommend/mood', {
                method: 'POST', headers,
                body: JSON.stringify({ mood: key, type: currentType(), q: keyword })
            });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            if (seq !== moodSeq) return; // a newer pick superseded this one
            window._lastDetectedMood = data.mood || key;

            const disp = $('mood-display');
            if (disp) disp.textContent = String(data.mood_display || data.mood || key).toUpperCase();
            const v = $('telemetry-valence'), a = $('telemetry-arousal'), c = $('telemetry-confidence'), x = $('telemetry-context');
            if (v && typeof data.valence !== 'undefined') v.textContent = (data.valence >= 0 ? '+' : '') + Number(data.valence).toFixed(2);
            if (a && typeof data.arousal !== 'undefined') a.textContent = (data.arousal >= 0 ? '+' : '') + Number(data.arousal).toFixed(2);
            if (c) c.textContent = 'Bạn chọn';
            if (window.KSMoodLabels) window.KSMoodLabels(Number(data.valence), Number(data.arousal));
            if (x) x.textContent = (MOODS.find((m) => m.key === key) || {}).label || key;

            if (!data.recommendations || !data.recommendations.length) {
                UIState.render(container, 'empty', 'Chưa tìm thấy bài hát phù hợp. Thử chọn tâm trạng khác.');
                return;
            }
            renderRecs(container, data.recommendations, data.mood_display);
        } catch (e) {
            if (seq !== moodSeq) return;
            UIState.render(container, 'error', 'Không tải được gợi ý. Kiểm tra kết nối rồi thử lại.', () => pickMood(key));
        }
    }
    window.pickMood = pickMood;

    function buildMoodPicker() {
        const box = $('mood-chips');
        if (!box || box.children.length) return;
        MOODS.forEach((m) => {
            const b = el('button', 'ks-mood', m.label);
            b.type = 'button';
            b.dataset.mood = m.key;
            b.setAttribute('aria-pressed', 'false');
            b.addEventListener('click', () => pickMood(m.key));
            box.appendChild(b);
        });
    }


    // ---- "Thêm" navigation menu ------------------------------------------
    window.toggleNavMore = function (force) {
        const menu = $('nav-more-menu');
        const btn = $('nav-more');
        if (!menu || !btn) return;
        const open = typeof force === 'boolean' ? force : menu.hidden;
        menu.hidden = !open;
        btn.setAttribute('aria-expanded', String(open));
    };

    function initNavMore() {
        const btn = $('nav-more');
        if (!btn) return;
        btn.addEventListener('click', (e) => { e.stopPropagation(); window.toggleNavMore(); });
        document.addEventListener('click', (e) => {
            const wrap = $('nav-more-wrap');
            if (wrap && !wrap.contains(e.target)) window.toggleNavMore(false);
        });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.toggleNavMore(false); });
    }

    // ---- keyboard shortcuts ---------------------------------------------
    function typing(t) {
        if (!t) return false;
        const n = t.nodeName;
        return n === 'INPUT' || n === 'TEXTAREA' || n === 'SELECT' || t.isContentEditable;
    }

    function onKey(e) {
        if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
        const a = audio();
        if (!a) return;
        // while a modal asks for input, leave the keys alone
        const auth = $('auth-modal');
        if (auth && auth.offsetParent !== null && !auth.classList.contains('hidden')) return;
        switch (e.key) {
            case ' ':
            case 'k':
                if (!window.currentTrackData) return;
                e.preventDefault();
                if (window.toggleMainPlay) window.toggleMainPlay();
                break;
            case 'ArrowRight':
                if (e.shiftKey) { if (window.playNextTrack) window.playNextTrack(); }
                else if (a.duration) a.currentTime = Math.min(a.duration, a.currentTime + 5);
                else return;
                e.preventDefault();
                break;
            case 'ArrowLeft':
                if (e.shiftKey) { if (window.playPreviousTrack) window.playPreviousTrack(); }
                else a.currentTime = Math.max(0, a.currentTime - 5);
                e.preventDefault();
                break;
            case 'ArrowUp':
                if (!window.currentTrackData) return;
                a.volume = Math.min(1, +(a.volume + 0.05).toFixed(2));
                e.preventDefault();
                break;
            case 'ArrowDown':
                if (!window.currentTrackData) return;
                a.volume = Math.max(0, +(a.volume - 0.05).toFixed(2));
                e.preventDefault();
                break;
            case 'm':
                a.muted = !a.muted;
                break;
            case 'n':
                if (!window.currentTrackData) return;
                if (window.NowPlaying && window.NowPlaying.isOpen()) window.closeNowPlaying();
                else window.openNowPlaying();
                break;
            default:
                return;
        }
    }

    function init() {
        buildMoodPicker();
        initNavMore();
        renderHistory();
        mergeServerHistory();
        document.addEventListener('keydown', onKey);

        const orig = window.playTrack;
        if (typeof orig === 'function') {
            window.playTrack = function () {
                const r = orig.apply(this, arguments);
                if (window.currentTrackData) remember(window.currentTrackData);
                return r;
            };
        }
        // after sign-in the account history becomes available
        window.addEventListener('ks-auth-changed', mergeServerHistory);
    }

    if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', () => setTimeout(init, 0));
    else setTimeout(init, 0);
})();
