/* KietStation: lock-screen and background playback support (Media Session API).
   Gives the system the track title, artist and cover, wires the lock-screen / Control Center buttons
   to the existing player, keeps the position bar in sync, and resumes after a system interruption
   (call, Siri, another app) when the person comes back and did not pause on purpose.
   Uses only the shared <audio> element: video views cannot play in the background on iOS. */
(function () {
    const ms = navigator.mediaSession;
    if (!ms || typeof MediaMetadata === 'undefined') return; // older browsers: nothing to add

    const audio = () => document.getElementById('local-audio');
    let userPaused = false;   // true when the person (or the sleep timer) stopped the music
    let lastPos = 0;

    function artworkFor(track) {
        const src = track && track.thumbnail;
        if (!src) return [];
        // YouTube serves several sizes of the same cover; offer them so the OS can pick one
        const m = /^(https?:\/\/i\d?\.ytimg\.com\/vi\/[\w-]{11}\/)[a-z]+\.jpg/i.exec(src);
        if (m) {
            return [
                { src: m[1] + 'mqdefault.jpg', sizes: '320x180', type: 'image/jpeg' },
                { src: m[1] + 'hqdefault.jpg', sizes: '480x360', type: 'image/jpeg' },
                { src: m[1] + 'maxresdefault.jpg', sizes: '1280x720', type: 'image/jpeg' }
            ];
        }
        return [{ src: src, sizes: '512x512' }];
    }

    function publishMetadata(track) {
        if (!track) return;
        try {
            ms.metadata = new MediaMetadata({
                title: track.title || 'KietStation',
                artist: track.artist || '',
                album: 'KietStation',
                artwork: artworkFor(track)
            });
        } catch (e) { /* a bad artwork URL must never stop playback */ }
    }

    function publishPosition() {
        const a = audio();
        if (!a || typeof ms.setPositionState !== 'function') return;
        const d = a.duration;
        if (!isFinite(d) || d <= 0) return;
        try {
            ms.setPositionState({
                duration: d,
                playbackRate: a.playbackRate || 1,
                position: Math.min(Math.max(0, a.currentTime || 0), d)
            });
        } catch (e) { /* some browsers reject odd values */ }
    }

    function setAction(name, fn) {
        try { ms.setActionHandler(name, fn); } catch (e) { /* action not supported here */ }
    }

    function init() {
        const a = audio();
        if (!a) return;

        // phones: keep the element inline and allow background audio
        a.setAttribute('playsinline', '');
        a.setAttribute('webkit-playsinline', '');
        a.preload = 'auto';

        setAction('play', () => {
            userPaused = false;
            a.play().catch(() => {});
        });
        setAction('pause', () => {
            userPaused = true;
            a.pause();
        });
        setAction('stop', () => {
            userPaused = true;
            a.pause();
        });
        setAction('previoustrack', () => { if (window.playPreviousTrack) window.playPreviousTrack(); });
        setAction('nexttrack', () => { if (window.playNextTrack) window.playNextTrack(); });
        setAction('seekbackward', (d) => { a.currentTime = Math.max(0, a.currentTime - ((d && d.seekOffset) || 10)); publishPosition(); });
        setAction('seekforward', (d) => {
            const to = a.currentTime + ((d && d.seekOffset) || 10);
            a.currentTime = isFinite(a.duration) ? Math.min(a.duration, to) : to;
            publishPosition();
        });
        setAction('seekto', (d) => {
            if (!d || typeof d.seekTime !== 'number') return;
            if (d.fastSeek && typeof a.fastSeek === 'function') a.fastSeek(d.seekTime);
            else a.currentTime = d.seekTime;
            publishPosition();
        });

        a.addEventListener('playing', () => { ms.playbackState = 'playing'; publishPosition(); });
        a.addEventListener('pause', () => { ms.playbackState = a.ended ? 'none' : 'paused'; publishPosition(); });
        a.addEventListener('ended', () => { ms.playbackState = 'none'; });
        a.addEventListener('durationchange', publishPosition);
        a.addEventListener('ratechange', publishPosition);
        a.addEventListener('seeked', publishPosition);
        a.addEventListener('timeupdate', () => {
            const now = Math.floor(a.currentTime);
            if (now !== lastPos && now % 5 === 0) { lastPos = now; publishPosition(); }
        });

        // a pause that the person asked for through the in-page buttons
        const origToggle = window.toggleMainPlay;
        if (typeof origToggle === 'function') {
            window.toggleMainPlay = function () {
                const wasPlaying = !a.paused;
                const r = origToggle.apply(this, arguments);
                userPaused = wasPlaying;
                return r;
            };
        }
        // a new track means the person wants sound again
        const origPlay = window.playTrack;
        if (typeof origPlay === 'function') {
            window.playTrack = function (data) {
                userPaused = false;
                const r = origPlay.apply(this, arguments);
                publishMetadata(window.currentTrackData);
                return r;
            };
        }
        // the sleep timer and other code can mark a deliberate stop
        window.addEventListener('ks-user-paused', () => { userPaused = true; });

        // coming back after a call / Siri / another app: pick the music up again if it was cut off
        function resumeIfCut() {
            if (document.visibilityState !== 'visible') return;
            if (userPaused || !a.getAttribute('src') || a.ended || !a.paused) return;
            if (!window.currentTrackData || a.currentTime <= 0) return;
            a.play().catch(() => { /* needs a tap: leave it paused */ });
        }
        document.addEventListener('visibilitychange', resumeIfCut);
        window.addEventListener('pageshow', resumeIfCut);
        window.addEventListener('focus', resumeIfCut);

        if (window.currentTrackData) publishMetadata(window.currentTrackData);
    }

    // load after the other player scripts so the wrappers stack in order
    if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', () => setTimeout(init, 100));
    else setTimeout(init, 100);
})();
