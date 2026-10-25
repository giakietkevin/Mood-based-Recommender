/* When the server cannot fetch a song's audio (YouTube blocks or times out the host), the song plays through
   YouTube's embedded player instead. The player's controls, progress bar, lyrics and sleep timer all talk to the
   hidden <audio id="local-audio"> element, so while the embed is the source this file makes that element speak for
   the iframe: paused / currentTime / duration / volume / playbackRate / play() / pause() are forwarded with
   YouTube's postMessage API and the usual media events are dispatched back. Nothing else needs to know. */
(function () {
    'use strict';

    const $ = (id) => document.getElementById(id);
    const audio = () => $('local-audio');
    const ORIGIN = 'https://www.youtube-nocookie.com';
    const S = { on: false, frame: null, state: -1, time: 0, dur: 0, rate: 1, vol: 1, muted: false, ready: false, timer: null, tries: 0 };
    const OVERRIDDEN = ['paused', 'currentTime', 'duration', 'playbackRate', 'volume', 'muted', 'play', 'pause'];

    const post = (msg) => {
        try { if (S.frame && S.frame.contentWindow) S.frame.contentWindow.postMessage(JSON.stringify(msg), ORIGIN); } catch (e) { /* frame gone */ }
    };
    const cmd = (func, args) => post({ event: 'command', func, args: args || [] });
    const emit = (name) => { const a = audio(); if (a) a.dispatchEvent(new Event(name)); };

    function setState(n) {
        if (n === S.state) return;
        S.state = n;
        if (n === 1) { emit('playing'); emit('play'); }
        else if (n === 2) emit('pause');
        else if (n === 3) emit('waiting');
        else if (n === 0) emit('ended');
    }

    function handshake() {
        // the embed only reports time and state after it has been told we are listening
        post({ event: 'listening', id: 1, channel: 'widget' });
        if (S.ready || ++S.tries > 40) { clearInterval(S.timer); S.timer = null; }
    }

    function attach(frame) {
        const a = audio();
        if (!a || !frame) return;
        release(false);
        // stop the server stream that is still loading, otherwise it keeps a request open and can fire errors
        const vol0 = a.volume, muted0 = a.muted;
        try { a.pause(); a.removeAttribute('src'); a.load(); } catch (e) { /* ignore */ }
        clearTimeout(window.__ksSlowTimer);

        Object.assign(S, { on: true, frame, state: -1, time: 0, dur: 0, rate: 1, vol: vol0, muted: muted0, ready: false, tries: 0 });
        const def = (k, d) => Object.defineProperty(a, k, Object.assign({ configurable: true }, d));
        def('paused', { get: () => !(S.state === 1 || S.state === 3) });
        def('currentTime', { get: () => S.time, set: (v) => { S.time = Number(v) || 0; cmd('seekTo', [S.time, true]); emit('timeupdate'); } });
        def('duration', { get: () => S.dur || NaN });
        def('playbackRate', { get: () => S.rate, set: (v) => { S.rate = Number(v) || 1; cmd('setPlaybackRate', [S.rate]); } });
        def('volume', { get: () => S.vol, set: (v) => { S.vol = Math.min(1, Math.max(0, Number(v) || 0)); cmd('setVolume', [Math.round(S.vol * 100)]); } });
        def('muted', { get: () => S.muted, set: (v) => { S.muted = !!v; cmd(S.muted ? 'mute' : 'unMute'); } });
        a.play = () => { cmd('playVideo'); setState(1); return Promise.resolve(); };
        a.pause = () => { cmd('pauseVideo'); setState(2); };

        frame.addEventListener('load', () => { S.tries = 0; if (!S.timer) S.timer = setInterval(handshake, 500); });
        S.timer = setInterval(handshake, 500);
        handshake();
    }

    function release(clearFrame) {
        const a = audio();
        clearInterval(S.timer); S.timer = null;
        if (!S.on) return;
        S.on = false;
        if (a) {
            OVERRIDDEN.forEach((k) => { try { delete a[k]; } catch (e) { /* ignore */ } });
            try { a.volume = S.vol; a.muted = S.muted; } catch (e) { /* ignore */ }
        }
        if (clearFrame) {
            const host = $('yt-player'), modal = $('yt-video-modal');
            if (host) { host.innerHTML = ''; delete host.dataset.keep; }
            if (modal) {
                modal.classList.add('opacity-0', 'pointer-events-none');
                modal.classList.remove('opacity-100', 'pointer-events-auto');
            }
        }
        S.frame = null;
    }

    window.addEventListener('message', (e) => {
        if (!S.on || e.origin !== ORIGIN || !S.frame || e.source !== S.frame.contentWindow) return;
        let d = e.data;
        if (typeof d === 'string') { try { d = JSON.parse(d); } catch (err) { return; } }
        if (!d || typeof d !== 'object') return;
        S.ready = true;
        if (d.event === 'onStateChange' && typeof d.info === 'number') setState(d.info);
        else if (d.event === 'onError') {
            // embedding switched off for this video: nothing more to try, move on like any failed song
            release(true);
            if (typeof showToast === 'function') showToast('Bài này không phát được. Đang chuyển bài tiếp...', 'error');
            setTimeout(() => { if (typeof playNextTrack === 'function') playNextTrack(); }, 1500);
        } else if (d.event === 'infoDelivery' && d.info) {
            const i = d.info;
            if (typeof i.playerState === 'number') setState(i.playerState);
            if (typeof i.duration === 'number' && i.duration > 0 && i.duration !== S.dur) {
                S.dur = i.duration; emit('durationchange'); emit('loadedmetadata');
            }
            if (typeof i.currentTime === 'number') { S.time = i.currentTime; emit('timeupdate'); }
        }
    });

    // The play/pause buttons: with the embed as the source the <audio> element has no src, which the other
    // wrappers read as "nothing loaded yet" and restart the song. Pause must just pause.
    const origToggle = window.toggleMainPlay;
    if (typeof origToggle === 'function') {
        window.toggleMainPlay = function () {
            if (!S.on) return origToggle.apply(this, arguments);
            const a = audio();
            const wasPlaying = !a.paused;
            if (wasPlaying) {
                window.dispatchEvent(new Event('ks-user-paused'));
                a.pause();
            } else {
                a.play();
            }
            const icon = $('play-icon');
            if (icon) icon.innerText = wasPlaying ? 'play_arrow' : 'pause';
        };
    }

    // A new song takes over: drop the old embed first so two videos never play together.
    const origPlay = window.playTrack;
    if (typeof origPlay === 'function') {
        window.playTrack = function () {
            if (S.on) release(true);
            return origPlay.apply(this, arguments);
        };
    }

    window.KSEmbed = { attach, release: () => release(true), active: () => S.on };
})();
