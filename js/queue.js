/* KietStation: play queue ("Sắp tới").
   Keeps an ordered list of tracks in localStorage, lets people add, remove and drag to reorder,
   and makes the player's Next button / end-of-track take from it before falling back to the
   old behaviour (recommendations, favourites). Rendering lives in the Now Playing "Sắp tới" tab. */
(function () {
    const KEY = 'ks-queue-v1';
    const MAX = 100;
    let items = [];

    try {
        const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
        if (Array.isArray(raw)) items = raw.filter((t) => t && (t.link || t.file_url)).slice(0, MAX);
    } catch (e) { items = []; }

    const idOf = (t) => t.link || t.file_url;
    const $ = (id) => document.getElementById(id);

    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) { /* storage full or blocked */ }
    }

    function toast(msg, kind) {
        if (typeof window.showToast === 'function') window.showToast(msg, kind);
    }

    function slim(t) {
        // keep only what the player needs, so the stored queue stays small
        return {
            title: t.title || '', artist: t.artist || '', thumbnail: t.thumbnail || '',
            link: t.link || '', file_url: t.file_url || '', type: t.type || '',
            style: t.style || '', mood: t.mood || ''
        };
    }

    function add(track, opts) {
        if (!track || !idOf(track)) return false;
        const id = idOf(track);
        const existing = items.findIndex((x) => idOf(x) === id);
        if (existing >= 0) items.splice(existing, 1); // re-adding moves it
        const next = opts && opts.next;
        if (next) items.unshift(slim(track)); else items.push(slim(track));
        if (items.length > MAX) items.length = MAX;
        save();
        render();
        return true;
    }

    function remove(i) {
        if (i < 0 || i >= items.length) return;
        items.splice(i, 1);
        save();
        render();
    }

    function move(from, to) {
        if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return;
        const [t] = items.splice(from, 1);
        items.splice(to, 0, t);
        save();
        render();
    }

    function clear() {
        items = [];
        save();
        render();
    }

    function shift() {
        const t = items.shift();
        save();
        render();
        return t || null;
    }

    function modeOf(t) {
        return (t.type === 'youtube' || t.link) ? 'youtube' : 'local';
    }

    function playAt(i) {
        const t = items[i];
        if (!t) return;
        items.splice(i, 1);
        save();
        render();
        if (window.playTrack) window.playTrack(t, modeOf(t));
    }

    // ---- rendering -------------------------------------------------------
    let dragFrom = -1;

    function render() {
        const count = $('np-queue-count');
        if (count) { count.textContent = String(items.length); count.hidden = items.length === 0; }
        const box = $('np-queue');
        if (!box) return;
        box.innerHTML = '';

        const head = document.createElement('div');
        head.className = 'np-qhead';
        const label = document.createElement('p');
        label.className = 'np-qlabel';
        label.textContent = items.length ? items.length + ' bài trong hàng đợi' : '';
        head.appendChild(label);
        if (items.length) {
            const c = document.createElement('button');
            c.type = 'button';
            c.className = 'np-chip';
            c.textContent = 'Xóa tất cả';
            c.addEventListener('click', clear);
            head.appendChild(c);
        }
        box.appendChild(head);

        if (!items.length) {
            const p = document.createElement('p');
            p.className = 'np-empty';
            p.textContent = 'Hàng đợi đang trống. Bấm nút thêm vào hàng đợi ở mỗi bài hát để nghe tiếp theo thứ tự bạn chọn.';
            box.appendChild(p);
            return;
        }

        const list = document.createElement('ol');
        list.className = 'np-qlist';
        items.forEach((t, i) => {
            const li = document.createElement('li');
            li.className = 'np-qitem';
            li.draggable = true;
            li.dataset.i = String(i);

            const grip = document.createElement('span');
            grip.className = 'material-symbols-outlined np-grip';
            grip.textContent = 'drag_indicator';
            grip.setAttribute('aria-hidden', 'true');

            const img = document.createElement('img');
            img.alt = '';
            img.loading = 'lazy';
            img.src = t.thumbnail || '';
            img.className = 'np-qthumb';

            const meta = document.createElement('button');
            meta.type = 'button';
            meta.className = 'np-qmeta';
            meta.title = 'Phát bài này ngay';
            const title = document.createElement('span');
            title.className = 'np-qtitle';
            title.textContent = t.title || 'Không có tên';
            const artist = document.createElement('span');
            artist.className = 'np-qartist';
            artist.textContent = t.artist || '';
            meta.append(title, artist);
            meta.addEventListener('click', () => playAt(i));

            const up = iconBtn('arrow_upward', 'Chuyển lên', () => move(i, i - 1));
            up.disabled = i === 0;
            const down = iconBtn('arrow_downward', 'Chuyển xuống', () => move(i, i + 1));
            down.disabled = i === items.length - 1;
            const del = iconBtn('close', 'Bỏ khỏi hàng đợi', () => remove(i));

            li.append(grip, img, meta, up, down, del);

            li.addEventListener('dragstart', (e) => {
                dragFrom = i;
                li.classList.add('is-drag');
                if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); }
            });
            li.addEventListener('dragend', () => {
                li.classList.remove('is-drag');
                list.querySelectorAll('.is-over').forEach((n) => n.classList.remove('is-over'));
                dragFrom = -1;
            });
            li.addEventListener('dragover', (e) => {
                if (dragFrom < 0) return;
                e.preventDefault();
                list.querySelectorAll('.is-over').forEach((n) => n.classList.remove('is-over'));
                li.classList.add('is-over');
            });
            li.addEventListener('drop', (e) => {
                e.preventDefault();
                const from = dragFrom;
                dragFrom = -1;
                if (from >= 0) move(from, i);
            });
            list.appendChild(li);
        });
        box.appendChild(list);
    }

    function iconBtn(icon, label, fn) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'np-qbtn';
        b.setAttribute('aria-label', label);
        b.title = label;
        const s = document.createElement('span');
        s.className = 'material-symbols-outlined';
        s.textContent = icon;
        b.appendChild(s);
        b.addEventListener('click', fn);
        return b;
    }

    window.KSQueue = {
        add, remove, move, clear, shift, render,
        get items() { return items.slice(); },
        get length() { return items.length; }
    };

    // Called from the "add to queue" button in every track row.
    window.queueAddFromButton = function (ev, encoded) {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        let t;
        try { t = JSON.parse(decodeURIComponent(encoded)); } catch (e) { return; }
        if (add(t)) toast('Đã thêm vào hàng đợi: ' + (t.title || '').slice(0, 40));
    };

    function init() {
        render();
        const origNext = window.playNextTrack;
        if (typeof origNext === 'function') {
            window.playNextTrack = function () {
                // DJ radio and watch-party hosts run their own queues; leave them alone.
                const own = (typeof djActive !== 'undefined' && djActive) ||
                    (typeof isPartyHost !== 'undefined' && isPartyHost);
                if (!own && items.length) {
                    const t = shift();
                    if (t && window.playTrack) { window.playTrack(t, modeOf(t)); return; }
                }
                return origNext.apply(this, arguments);
            };
        }
    }

    if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', () => setTimeout(init, 0));
    else setTimeout(init, 0);
})();
