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

    // ---- shared recommendation rows -------------------------------------
    function renderRecs(container, recs, fallbackLabel) {
        window.lastRecommendations = recs;
        container.innerHTML = recs.map((item, index) => {
            const safe = encodeURIComponent(JSON.stringify(item)).replace(/'/g, '%27');
            const title = String(item.title || '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
            const sub = String(item.artist || fallbackLabel || '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
            const why = String(item.match_reason || fallbackLabel || '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
            return `
            <div class="grid grid-cols-12 gap-2 items-center px-3.5 py-2 hover:bg-surface-container-low transition-colors group cursor-pointer border-b border-surface-container-high/40"
                 onclick="playTrack('${safe}', 'youtube')">
                <div class="col-span-1 text-center text-xs text-charcoal-black/50 group-hover:text-charcoal-black">${index + 1}</div>
                <div class="col-span-6 flex items-center gap-2.5 min-w-0">
                    <img src="${item.thumbnail || ''}" class="w-10 h-10 rounded-md object-cover bg-surface-container-low flex-shrink-0" alt="" loading="lazy" />
                    <div class="min-w-0 flex-1">
                        <h4 class="text-xs font-semibold text-charcoal-black truncate group-hover:text-accent-blue transition-colors">${title}</h4>
                        <p class="text-[11px] text-charcoal-black/60 truncate">${sub}</p>
                    </div>
                </div>
                <div class="col-span-3 hidden sm:flex items-center min-w-0">
                    <span class="inline-block text-[11px] px-2 py-0.5 rounded-md bg-pastel-lavender text-charcoal-black font-medium truncate max-w-full">${why}</span>
                </div>
                <div class="col-span-5 sm:col-span-2 flex items-center justify-end gap-1" onclick="event.stopPropagation()">
                    ${window.getActionButtonsHTML ? window.getActionButtonsHTML(item, 'youtube') : ''}
                </div>
            </div>`;
        }).join('');
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
