/* KietStation: extras around the player.
   - Save the current picks as a playlist, queue them all
   - Keep playing: when the queue and the list run out, pick more by the last mood
   - Sleep timer with a short fade-out
   - Share link (?track=...) that opens straight into Now Playing
   - "This week's moods" summary
   - Honest labels under the valence / arousal figures */
(function () {
    const $ = (id) => document.getElementById(id);
    const audio = () => $('local-audio');
    const toast = (m, k) => { if (typeof window.showToast === 'function') window.showToast(m, k); };

    const MOOD_LABEL = {
        happy: 'Vui vẻ', neutral: 'Bình thản', sad: 'Buồn', angry: 'Bực bội',
        fear: 'Lo lắng', surprise: 'Bất ngờ', disgust: 'Chán nản'
    };

    // ---- labels under the figures -----------------------------------------
    window.KSMoodLabels = function (valence, arousal) {
        const v = $('telemetry-valence');
        const a = $('telemetry-arousal');
        const set = (el, text) => { const n = el && el.nextElementSibling; if (n) n.textContent = text; };
        if (typeof valence === 'number') set(v, valence > 0.35 ? 'Tích cực' : valence < -0.35 ? 'Trầm' : 'Cân bằng');
        if (typeof arousal === 'number') set(a, arousal > 0.35 ? 'Sôi động' : arousal < -0.35 ? 'Nhẹ nhàng' : 'Vừa phải');
    };

    // ---- save / queue the current picks -----------------------------------
    window.queueAllRecs = function () {
        const recs = window.lastRecommendations || [];
        if (!recs.length || !window.KSQueue) return;
        recs.forEach((t) => window.KSQueue.add(t));
        toast('Đã thêm ' + recs.length + ' bài vào hàng đợi');
    };

    window.saveRecsAsPlaylist = async function () {
        const recs = (window.lastRecommendations || []).filter((t) => t && (t.link || t.file_url));
        if (!recs.length) return;
        const mood = MOOD_LABEL[window._lastDetectedMood] || 'Gợi ý';
        const d = new Date();
        const name = mood + ' · ' + d.getDate() + '/' + (d.getMonth() + 1);
        let saved = false;

        if (window.currentUserUid) {
            try {
                const fd = new FormData();
                fd.append('uid', window.currentUserUid);
                fd.append('name', name);
                const res = await fetch('/playlists', { method: 'POST', body: fd });
                const data = await res.json();
                if (data.status === 'success' && data.playlist) {
                    // the endpoint toggles a song in or out, so each track is sent once
                    for (const t of recs) {
                        const f = new FormData();
                        f.append('uid', window.currentUserUid);
                        f.append('playlist_id', data.playlist.id);
                        f.append('song', JSON.stringify(t));
                        await fetch('/playlists/song', { method: 'POST', body: f });
                    }
                    saved = true;
                }
            } catch (e) { /* fall back to a local playlist below */ }
        }
        if (!saved) {
            try {
                const list = JSON.parse(localStorage.getItem('kiet_guest_playlists') || '[]');
                list.push({ id: 'pl_' + Date.now(), name, songs: recs.map((t) => Object.assign({ type: 'youtube' }, t)) });
                localStorage.setItem('kiet_guest_playlists', JSON.stringify(list));
                saved = true;
            } catch (e) { /* storage blocked */ }
        }
        if (saved) {
            toast('Đã lưu playlist "' + name + '" (' + recs.length + ' bài)');
            if (typeof window.loadPlaylists === 'function') window.loadPlaylists();
        } else {
            toast('Không lưu được playlist', 'error');
        }
    };

    // ---- keep playing -----------------------------------------------------
    let continuing = false;
    const idOf = (t) => t && (t.link || t.file_url);

    function autoplayOn() {
        try { return localStorage.getItem('ks-autoplay') !== '0'; } catch (e) { return true; }
    }

    async function continueWithMore() {
        if (continuing || !autoplayOn()) return;
        continuing = true;
        try {
            const mood = window._lastDetectedMood && MOOD_LABEL[window._lastDetectedMood] ? window._lastDetectedMood : 'neutral';
            const res = await fetch('/recommend/mood', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mood: mood, type: 'music' })
            });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            const heard = new Set((window.lastRecommendations || []).map(idOf));
            heard.add(idOf(window.currentTrackData));
            const fresh = (data.recommendations || []).filter((t) => idOf(t) && !heard.has(idOf(t)));
            if (!fresh.length) return;
            window.lastRecommendations = (window.lastRecommendations || []).concat(fresh);
            window.playTrack(fresh[0], 'youtube');
            if (window.KSQueue) fresh.slice(1, 5).forEach((t) => window.KSQueue.add(t));
            toast('Đang phát tiếp theo tâm trạng của bạn');
        } catch (e) {
            console.warn('[autoplay] could not fetch more', e);
        } finally {
            continuing = false;
        }
    }

    // ---- sleep timer ------------------------------------------------------
    const STEPS = [0, 15, 30, 60, 90];
    let sleepIdx = 0;
    let sleepEnd = 0;
    let sleepTick = null;
    let fadeFrom = 1;

    function sleepLabel() {
        if (!sleepEnd) return 'Hẹn giờ tắt';
        const left = Math.max(0, Math.ceil((sleepEnd - Date.now()) / 60000));
        return 'Tắt sau ' + left + ' phút';
    }

    function paintSleep() {
        const b = $('np-sleep');
        if (b) { b.textContent = sleepLabel(); b.classList.toggle('is-on', !!sleepEnd); }
    }

    function stopSleep() {
        sleepEnd = 0;
        if (sleepTick) { clearInterval(sleepTick); sleepTick = null; }
        paintSleep();
    }

    function cycleSleep() {
        sleepIdx = (sleepIdx + 1) % STEPS.length;
        stopSleep();
        const mins = STEPS[sleepIdx];
        if (!mins) { toast('Đã tắt hẹn giờ'); return; }
        sleepEnd = Date.now() + mins * 60000;
        const a = audio();
        fadeFrom = a ? a.volume : 1;
        toast('Nhạc sẽ dừng sau ' + mins + ' phút');
        sleepTick = setInterval(() => {
            const left = sleepEnd - Date.now();
            const el = audio();
            if (left <= 10000 && el && !el.paused) {
                el.volume = Math.max(0, fadeFrom * (left / 10000)); // last 10 seconds fade out
            }
            if (left <= 0) {
                window.dispatchEvent(new Event('ks-user-paused')); // a deliberate stop: do not auto-resume
                if (el) { el.pause(); el.volume = fadeFrom; }
                stopSleep();
                sleepIdx = 0;
                toast('Đã dừng nhạc theo hẹn giờ');
            } else {
                paintSleep();
            }
        }, 1000);
        paintSleep();
    }

    // ---- share link -------------------------------------------------------
    function videoId(t) {
        const l = (t && t.link) || '';
        const m = /(?:v=|youtu\.be\/)([\w-]{11})/.exec(l) || /^([\w-]{11})$/.exec(l);
        return m ? m[1] : '';
    }

    async function shareCurrent() {
        const t = window.currentTrackData;
        const id = videoId(t);
        if (!id) { toast('Chỉ chia sẻ được bài từ YouTube', 'error'); return; }
        const q = new URLSearchParams({ track: id, t: (t.title || '').slice(0, 120), a: (t.artist || '').slice(0, 80) });
        const url = location.origin + '/?' + q.toString();
        try {
            if (navigator.share) { await navigator.share({ title: t.title || 'KietStation', url }); return; }
            await navigator.clipboard.writeText(url);
            toast('Đã chép liên kết bài hát');
        } catch (e) {
            if (e && e.name === 'AbortError') return; // the person closed the share sheet
            window.prompt('Sao chép liên kết:', url);
        }
    }

    function openSharedTrack() {
        const p = new URLSearchParams(location.search);
        const id = p.get('track');
        if (!id || !/^[\w-]{11}$/.test(id)) return;
        window.currentTrackData = {
            title: (p.get('t') || 'Bài hát được chia sẻ').slice(0, 120),
            artist: (p.get('a') || '').slice(0, 80),
            thumbnail: 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg',
            link: id
        };
        // browsers block autoplay before a tap, so open the view and let the person press play
        if (window.openNowPlaying) window.openNowPlaying();
        toast('Bấm phát để nghe bài được chia sẻ');
    }

    // ---- this week's moods ------------------------------------------------
    const LOGKEY = 'ks-mood-log-v1';
    function logMood() {
        const mood = window._lastDetectedMood;
        if (!mood || !MOOD_LABEL[mood]) return;
        try {
            const log = JSON.parse(localStorage.getItem(LOGKEY) || '[]');
            log.push({ d: new Date().toISOString().slice(0, 10), m: mood });
            localStorage.setItem(LOGKEY, JSON.stringify(log.slice(-500)));
        } catch (e) { /* ignore */ }
    }

    function localWeek() {
        const since = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
        const counts = {};
        try {
            JSON.parse(localStorage.getItem(LOGKEY) || '[]').forEach((r) => {
                if (r.d >= since && MOOD_LABEL[r.m]) counts[r.m] = (counts[r.m] || 0) + 1;
            });
        } catch (e) { /* ignore */ }
        return Object.keys(counts).map((m) => ({ mood: m, count: counts[m] })).sort((a, b) => b.count - a.count);
    }

    async function renderWeek() {
        const box = $('week-moods');
        const sec = $('week-section');
        if (!box || !sec) return;
        let rows = [];
        const token = window.MongoAuth && typeof window.MongoAuth.getToken === 'function' ? window.MongoAuth.getToken() : null;
        if (token) {
            try {
                const r = await window.MongoAuth.authenticatedFetch('/api/history/moods?days=7');
                if (r.ok) rows = (await r.json()).moods || [];
            } catch (e) { /* offline */ }
        }
        if (!rows.length) rows = localWeek();
        const total = rows.reduce((s, r) => s + r.count, 0);
        sec.hidden = total < 3;
        if (sec.hidden) return;
        const max = rows[0].count;
        box.innerHTML = '';
        rows.slice(0, 5).forEach((r) => {
            const row = document.createElement('div');
            row.className = 'ks-bar-row';
            const label = document.createElement('span');
            label.className = 'ks-bar-label';
            label.textContent = MOOD_LABEL[r.mood];
            const track = document.createElement('div');
            track.className = 'ks-bar-track';
            const fill = document.createElement('div');
            fill.className = 'ks-bar-fill';
            fill.style.width = Math.max(4, Math.round((r.count / max) * 100)) + '%';
            track.appendChild(fill);
            const n = document.createElement('span');
            n.className = 'ks-bar-n';
            n.textContent = r.count + ' bài';
            row.append(label, track, n);
            box.appendChild(row);
        });
    }

    // ---- Now Playing chips -----------------------------------------------
    function addChips() {
        const row = document.querySelector('#np .np-extra');
        if (!row || $('np-sleep')) return;
        const mk = (id, text, fn, title) => {
            const b = document.createElement('button');
            b.type = 'button'; b.id = id; b.className = 'np-chip'; b.textContent = text; if (title) b.title = title;
            b.addEventListener('click', fn);
            row.appendChild(b);
            return b;
        };
        mk('np-share', 'Chia sẻ', shareCurrent, 'Chép liên kết bài hát');
        mk('np-sleep', 'Hẹn giờ tắt', cycleSleep, 'Dừng nhạc sau 15, 30, 60 hoặc 90 phút');
        const ap = mk('np-auto', '', () => {
            try { localStorage.setItem('ks-autoplay', autoplayOn() ? '0' : '1'); } catch (e) { /* ignore */ }
            paintAuto();
        }, 'Tự phát bài gợi ý khi hết danh sách');
        function paintAuto() {
            ap.textContent = autoplayOn() ? 'Tự phát tiếp: Bật' : 'Tự phát tiếp: Tắt';
            ap.classList.toggle('is-on', autoplayOn());
        }
        paintAuto();
    }

    function init() {
        addChips();
        renderWeek();
        openSharedTrack();

        // the Now Playing view is built lazily by now-playing.js; add chips as soon as it exists
        const mo = new MutationObserver(() => { if ($('np') && !$('np-sleep')) addChips(); });
        mo.observe(document.body, { childList: true });

        const origNext = window.playNextTrack;
        if (typeof origNext === 'function') {
            window.playNextTrack = function () {
                const before = idOf(window.currentTrackData);
                const r = origNext.apply(this, arguments);
                // nothing advanced: the queue and the list are both finished
                if (idOf(window.currentTrackData) === before && !window.isRepeatActive) continueWithMore();
                return r;
            };
        }

        // a shared link has no audio source yet: first press of play starts the track
        const origToggle = window.toggleMainPlay;
        if (typeof origToggle === 'function') {
            window.toggleMainPlay = function () {
                const a = audio();
                if (a && !a.getAttribute('src') && window.currentTrackData) {
                    window.playTrack(window.currentTrackData, 'youtube');
                    return;
                }
                return origToggle.apply(this, arguments);
            };
        }

        const origPlay = window.playTrack;
        if (typeof origPlay === 'function') {
            window.playTrack = function () {
                const r = origPlay.apply(this, arguments);
                logMood();
                renderWeek();
                return r;
            };
        }
    }

    if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', () => setTimeout(init, 50));
    else setTimeout(init, 50);
})();
