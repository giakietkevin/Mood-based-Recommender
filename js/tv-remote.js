// TV remote control: arrow keys move a visible focus between controls, OK clicks, Back closes the
// open dialog. Only active on TV browsers (Samsung Tizen, LG webOS, Android TV) or with ?tv=1.
(function () {
    'use strict';
    const isTv = /Tizen|SMART-TV|Web0S|webOS|Android TV|AFT/i.test(navigator.userAgent) ||
        /[?&]tv=1\b/.test(location.search);
    if (!isTv) return;

    const KEY = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13, BACK: 10009, ESC: 27 };
    const FOCUSABLE = 'a[href], button, input, select, textarea, [onclick], [role="button"], [tabindex]:not([tabindex="-1"])';
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

    function candidates(root) {
        const list = root.querySelectorAll(FOCUSABLE);
        const out = [];
        for (let i = 0; i < list.length; i++) {
            const el = list[i];
            // a clickable wrapper around a single button: keep the button only
            if (el.matches('[onclick]') && el.querySelector('button, a[href]')) continue;
            if (visible(el)) out.push(el);
        }
        return out;
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

    function center(r) {
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }

    // Nearest control in the pressed direction; sideways distance counts double so moves stay in line.
    function move(dir) {
        const root = scope();
        const items = candidates(root);
        if (!items.length) return;
        if (!current || !root.contains(current) || !visible(current)) {
            focus(items[0]);
            return;
        }
        const from = center(current.getBoundingClientRect());
        let best = null;
        let bestScore = Infinity;
        items.forEach(function (el) {
            if (el === current) return;
            const to = center(el.getBoundingClientRect());
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            let main;
            let side;
            if (dir === KEY.RIGHT) { main = dx; side = dy; }
            else if (dir === KEY.LEFT) { main = -dx; side = dy; }
            else if (dir === KEY.DOWN) { main = dy; side = dx; }
            else { main = -dy; side = dx; }
            if (main <= 1) return;
            const score = main + Math.abs(side) * 2;
            if (score < bestScore) { bestScore = score; best = el; }
        });
        if (best) focus(best);
    }

    function closeDialog() {
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

    function typing(el) {
        return el && (el.tagName === 'TEXTAREA' || el.isContentEditable ||
            (el.tagName === 'INPUT' && !/^(button|submit|checkbox|radio|range)$/i.test(el.type)));
    }

    // Capture phase so the page's own arrow-key shortcuts (seeking) don't also fire.
    document.addEventListener('keydown', function (e) {
        const k = e.keyCode;
        if (k === KEY.LEFT || k === KEY.RIGHT || k === KEY.UP || k === KEY.DOWN) {
            // inside a text field left/right move the caret; up/down leave the field
            if (typing(document.activeElement) && (k === KEY.LEFT || k === KEY.RIGHT)) return;
            e.preventDefault();
            e.stopPropagation();
            move(k);
        } else if (k === KEY.ENTER) {
            const el = document.activeElement;
            if (!current || el !== current || typing(el)) return;
            if (el.tagName === 'BUTTON' || el.tagName === 'A') return; // native activation
            e.preventDefault();
            e.stopPropagation();
            el.click();
        } else if (k === KEY.BACK || (k === KEY.ESC && e.isTrusted)) {
            if (closeDialog()) {
                e.preventDefault();
                e.stopPropagation();
                current = null;
            }
        }
    }, true);

    // Tizen sends Back only when the app asks for it; media keys are optional extras.
    try {
        if (window.tizen && tizen.tvinputdevice) {
            ['MediaPlayPause', 'MediaPlay', 'MediaPause'].forEach(function (name) {
                try { tizen.tvinputdevice.registerKey(name); } catch (err) { /* key not on this remote */ }
            });
        }
    } catch (err) { /* not a packaged Tizen app */ }
})();
