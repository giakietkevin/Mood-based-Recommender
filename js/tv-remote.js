// TV remote control: arrow keys move a visible focus between controls, OK clicks, Back closes the
// open dialog. Only active on TV browsers (Samsung Tizen, LG webOS, Android TV) or with ?tv=1.
(function () {
    'use strict';
    const isTv = /Tizen|SMART-TV|Web0S|webOS|Android TV|AFT/i.test(navigator.userAgent) ||
        /[?&]tv=1\b/.test(location.search);
    if (!isTv || window.__tvRemote) return;
    window.__tvRemote = true;

    const KEY = {
        LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13, BACK: 10009, ESC: 27,
        PLAY_PAUSE: 10252, PLAY: 415, PAUSE: 19, FAST_FORWARD: 417, REWIND: 412,
    };
    const SEEK_SECONDS = 10;
    const FOCUSABLE = 'a[href], button, input, select, textarea, video, [onclick], [role="button"], .cursor-pointer, [tabindex]:not([tabindex="-1"])';
    const CLOSE_TEXT = /^(close|đóng|bỏ qua|huỷ|hủy|cancel|×|✕|x)$/i;

    const style = document.createElement('style');
    style.textContent =
        '.tv-focus{outline:4px solid #c6f24e !important;outline-offset:3px !important;box-shadow:0 0 0 8px rgba(198,242,78,.25) !important;}' +
        'html.tv-mode{cursor:none;}';
    document.head.appendChild(style);
    document.documentElement.classList.add('tv-mode');

    let current = null;

    function visible(el) {
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) return false;
        if (r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) {
            // off screen is fine for scrolling lists, but not for hidden drawers far outside the page
            if (r.right < -innerWidth || r.left > innerWidth * 2) return false;
        }
        for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
            const cs = getComputedStyle(n);
            if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0' || cs.pointerEvents === 'none') return false;
        }
        return !el.disabled;
    }

    // The open dialog: a fixed layer covering most of the screen on top of the page.
    function scope() {
        let el = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
        let layer = null;
        for (; el && el !== document.body; el = el.parentElement) {
            if (getComputedStyle(el).position !== 'fixed') continue;
            const r = el.getBoundingClientRect();
            if (r.width >= innerWidth * 0.8 && r.height >= innerHeight * 0.8) layer = el;
        }
        return layer || document.body;
    }

    function area(el) {
        const r = el.getBoundingClientRect();
        return r.width * r.height;
    }

    function candidates(root) {
        const list = root.querySelectorAll(FOCUSABLE);
        const shown = [];
        for (let i = 0; i < list.length; i++) {
            if (visible(list[i])) shown.push(list[i]);
        }
        // A clickable wrapper that is mostly one inner control (a styled button around a button):
        // keep the inner one. Cards with a small extra button inside (film cards) stay focusable.
        return shown.filter(function (el) {
            const own = area(el);
            return !shown.some(function (other) {
                return other !== el && el.contains(other) && area(other) >= own * 0.7;
            });
        });
    }

    function focus(el) {
        if (!el) return;
        if (current) current.classList.remove('tv-focus');
        current = el;
        el.classList.add('tv-focus');
        if (!el.matches('a[href], button, input, select, textarea, [tabindex]')) el.setAttribute('tabindex', '-1');
        el.focus({ preventScroll: true });
        el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }

    // Gap between two ranges on one axis; 0 when they overlap.
    function gap(a1, a2, b1, b2) {
        return Math.max(0, Math.max(a1, b1) - Math.min(a2, b2));
    }

    // Distance from `from` to `to` in the pressed direction, measured edge to edge, or null when `to`
    // isn't that way. `strict` requires `to` to sit entirely past the near edge, so moving right from a
    // wide button skips the small ones beside it in the same column.
    function distance(dir, from, to, strict) {
        let main;
        let side;
        if (dir === KEY.RIGHT || dir === KEY.LEFT) {
            main = dir === KEY.RIGHT ? to.left - from.right : from.left - to.right;
            if (!strict) main = dir === KEY.RIGHT ? to.left - from.left : from.right - to.right;
            side = gap(from.top, from.bottom, to.top, to.bottom);
        } else {
            main = dir === KEY.DOWN ? to.top - from.bottom : from.top - to.bottom;
            if (!strict) main = dir === KEY.DOWN ? to.top - from.top : from.bottom - to.bottom;
            side = gap(from.left, from.right, to.left, to.right);
        }
        if (strict ? main < -2 : main <= 1) return null;
        // controls in the same row/column win; sideways distance counts double
        return Math.max(0, main) + side * 2;
    }

    function move(dir) {
        const root = scope();
        const items = candidates(root);
        if (!items.length) return;
        if (!current || !root.contains(current) || !visible(current)) {
            focus(items[0]);
            return;
        }
        const from = current.getBoundingClientRect();
        const pick = function (strict) {
            let best = null;
            let bestScore = Infinity;
            items.forEach(function (el) {
                if (el === current || el.contains(current) || current.contains(el)) return;
                const score = distance(dir, from, el.getBoundingClientRect(), strict);
                if (score !== null && score < bestScore) { bestScore = score; best = el; }
            });
            return best;
        };
        const best = pick(true) || pick(false);
        if (best) focus(best);
    }

    // Native <select> popups don't open from a remote, so OK shows the options as a list instead.
    let picker = null;

    function openPicker(select) {
        picker = document.createElement('div');
        picker.className = 'tv-picker';
        picker.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;z-index:2147483646;' +
            'background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;';
        const panel = document.createElement('div');
        panel.style.cssText = 'background:#1a1a1a;border:1px solid #444;border-radius:16px;padding:16px;' +
            'min-width:360px;max-width:80%;max-height:80%;overflow:auto;';
        let selected = null;
        Array.prototype.forEach.call(select.options, function (opt, i) {
            if (opt.disabled || opt.hidden) return;
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = opt.textContent.trim() || opt.value;
            b.style.cssText = 'display:block;width:100%;text-align:left;padding:12px 16px;margin:4px 0;' +
                'font-size:20px;color:#fff;background:' + (i === select.selectedIndex ? '#333' : 'transparent') +
                ';border:0;border-radius:10px;';
            b.addEventListener('click', function () {
                select.selectedIndex = i;
                select.dispatchEvent(new Event('input', { bubbles: true }));
                select.dispatchEvent(new Event('change', { bubbles: true }));
                closePicker();
            });
            if (i === select.selectedIndex) selected = b;
            panel.appendChild(b);
        });
        picker.returnTo = select;
        picker.appendChild(panel);
        document.body.appendChild(picker);
        focus(selected || panel.querySelector('button'));
    }

    function closePicker() {
        const back = picker && picker.returnTo;
        if (picker) picker.remove();
        picker = null;
        if (back && visible(back)) focus(back);
    }

    function closeDialog() {
        if (picker) {
            closePicker();
            return true;
        }
        const auth = document.getElementById('auth-modal');
        if (auth && !auth.classList.contains('hidden') && window.hideAuthModal) {
            window.hideAuthModal();
            return true;
        }
        const root = scope();
        if (root === document.body) return false;
        const buttons = root.querySelectorAll('button, [onclick], [role="button"]');
        for (let i = 0; i < buttons.length; i++) {
            const b = buttons[i];
            const label = (b.getAttribute('aria-label') || b.textContent || '').trim();
            const handler = b.getAttribute('onclick') || '';
            if (visible(b) && (CLOSE_TEXT.test(label) || /close|hide|skip/i.test(handler))) {
                b.click();
                return true;
            }
        }
        // let the page's own Escape handlers close it
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
        return true;
    }

    // --- video: OK goes full screen, then OK plays/pauses and left/right seek ---

    function fullscreenElement() {
        return document.fullscreenElement || document.webkitFullscreenElement || null;
    }

    function enterFullscreen(video) {
        const req = video.requestFullscreen || video.webkitRequestFullscreen;
        if (req) req.call(video);
    }

    function exitFullscreen() {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        if (exit) exit.call(document);
    }

    function togglePlay(video) {
        if (video.paused) {
            const p = video.play();
            if (p && p.catch) p.catch(function () { /* blocked or no source */ });
        } else {
            video.pause();
        }
    }

    function seek(video, seconds) {
        if (!isFinite(video.duration)) return;
        video.currentTime = Math.max(0, Math.min(video.duration - 1, video.currentTime + seconds));
    }

    // The video the media keys act on: the full-screen one, the focused one, else one that is playing.
    function activeVideo() {
        const fs = fullscreenElement();
        if (fs && fs.tagName === 'VIDEO') return fs;
        if (current && current.tagName === 'VIDEO') return current;
        const vids = document.querySelectorAll('video');
        for (let i = 0; i < vids.length; i++) {
            if (!vids[i].paused && visible(vids[i])) return vids[i];
        }
        return null;
    }

    // When a large video starts (a film was picked), move the focus onto it.
    document.addEventListener('playing', function (e) {
        const v = e.target;
        if (v.tagName !== 'VIDEO' || v === current || v.muted) return;
        if (v.getBoundingClientRect().width < innerWidth * 0.3) return;
        focus(v);
        v.scrollIntoView({ block: 'center' });
    }, true);

    function videoKey(e, video) {
        const k = e.keyCode;
        const full = fullscreenElement() === video;
        if (k === KEY.PLAY_PAUSE || k === KEY.PLAY || k === KEY.PAUSE) {
            if (k === KEY.PLAY && !video.paused) return true;
            if (k === KEY.PAUSE && video.paused) return true;
            togglePlay(video);
            return true;
        }
        if (k === KEY.FAST_FORWARD) { seek(video, SEEK_SECONDS); return true; }
        if (k === KEY.REWIND) { seek(video, -SEEK_SECONDS); return true; }
        if (video !== current && !full) return false;
        if (k === KEY.ENTER) {
            if (full) togglePlay(video);
            else enterFullscreen(video);
            return true;
        }
        if (k === KEY.RIGHT) { seek(video, SEEK_SECONDS); return true; }
        if (k === KEY.LEFT) { seek(video, -SEEK_SECONDS); return true; }
        if (full && (k === KEY.UP || k === KEY.DOWN)) return true;
        if (full && (k === KEY.BACK || k === KEY.ESC)) { exitFullscreen(); return true; }
        return false;
    }

    function typing(el) {
        return el && (el.tagName === 'TEXTAREA' || el.isContentEditable ||
            (el.tagName === 'INPUT' && !/^(button|submit|checkbox|radio|range)$/i.test(el.type)));
    }

    function caretAtEdge(el, k) {
        let start = null;
        try { start = el.selectionStart; } catch (err) { /* email/number inputs have no caret API */ }
        if (start === null || start === undefined) return true;
        return k === KEY.LEFT ? el.selectionEnd === 0 : start === el.value.length;
    }

    // Capture phase so the page's own arrow-key shortcuts (seeking) don't also fire.
    document.addEventListener('keydown', function (e) {
        const k = e.keyCode;
        const video = activeVideo();
        if (video && videoKey(e, video)) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        if (k === KEY.LEFT || k === KEY.RIGHT || k === KEY.UP || k === KEY.DOWN) {
            // inside a text field left/right move the caret until it reaches the edge; up/down leave
            if (typing(document.activeElement) && (k === KEY.LEFT || k === KEY.RIGHT) && !caretAtEdge(document.activeElement, k)) return;
            e.preventDefault();
            e.stopPropagation();
            move(k);
        } else if (k === KEY.ENTER) {
            const el = document.activeElement;
            if (!current || el !== current || typing(el)) return;
            e.preventDefault();
            e.stopPropagation();
            if (el.tagName === 'SELECT') openPicker(el);
            else el.click();
        } else if (k === KEY.BACK || (k === KEY.ESC && e.isTrusted)) {
            if (closeDialog()) {
                e.preventDefault();
                e.stopPropagation();
            }
        }
    }, true);

    // Tizen sends Back only when the app asks for it; media keys are optional extras.
    try {
        if (window.tizen && tizen.tvinputdevice) {
            ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaFastForward', 'MediaRewind'].forEach(function (name) {
                try { tizen.tvinputdevice.registerKey(name); } catch (err) { /* key not on this remote */ }
            });
        }
    } catch (err) { /* not a packaged Tizen app */ }
})();
