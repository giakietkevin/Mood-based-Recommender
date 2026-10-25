/* KietStation: VI/EN switch for the static interface.
   Pairs are [vi, en]. The page source may hold either language, so both directions are mapped.
   Strings written later by other scripts are translated only when they match a pair exactly. */
(function () {
    const PAIRS = [
        ['Tâm trạng', 'Mood Station'], ['Cộng đồng', 'Community & Feed'], ['Phim', 'Film'],
        ['Khám phá', 'Discover'], ['Thư viện', 'Library'],
        ['Đang xem chung', 'Watching together'], ['Xem chung', 'Watch together'],
        ['Thông báo', 'Notifications'], ['Đánh dấu đã đọc', 'Mark all read'],
        ['Đăng nhập', 'Sign in'], ['Đăng xuất', 'Sign out'], ['Trang cá nhân', 'Profile'],
        ['Cài đặt', 'Settings'], ['Đăng nhập với tư cách', 'Signed in as'],
        ['Tâm trạng hôm nay', 'Your mood today'], ['Máy quét cảm xúc · Online', 'Mood scanner · Online'],
        ['Camera nhận diện biểu cảm của bạn và chọn nhạc hợp với tâm trạng lúc này.', 'The camera reads your expression and picks music that fits how you feel right now.'],
        ['Quét tâm trạng', 'Scan my mood'], ['Quét lại', 'Rescan'], ['Tâm trạng nhận diện', 'Detected mood'],
        ['Gợi ý: nhạc ambient 432 Hz', 'Suggested: ambient 432 Hz'],
        ['Cảm xúc', 'Valence'], ['Năng lượng', 'Arousal'], ['Độ chắc chắn', 'Confidence'], ['Bối cảnh', 'Context'],
        ['Cân bằng', 'Balanced'], ['Nghỉ ngơi', 'Resting'], ['Ổn định', 'Stable'], ['Theo giờ trong ngày', 'By time of day'],
        ['Mức hòa hợp', 'Harmony level'], ['Nhạc dành cho bạn', 'Music for you'],
        ['Chọn theo tâm trạng vừa quét', 'Picked from your latest scan'],
        ['Bài hát', 'Track'], ['Độ hợp', 'Match'], ['Phát', 'Play'], ['Phát tất cả', 'Play all'],
        ['Chưa có gợi ý nào', 'No suggestions yet'],
        ['Quét tâm trạng bằng camera hoặc tìm theo từ khóa để nghe nhạc phù hợp.', 'Scan your mood with the camera or search by keyword to hear music that fits.'],
        ['Diễn biến tâm trạng', 'Mood over the day'], ['Tập trung được khoảng 48 phút', 'About 48 minutes of focus'],
        ['Gợi ý nhanh:', 'Quick picks:'], ['Tìm', 'Search'], ['Nhạc', 'Music'],
        ['Tìm bài hát, nghệ sĩ hoặc tâm trạng...', 'Search songs, artists or moods...'],
        ['Thư viện của bạn', 'Your library'],
        ['Bài hát yêu thích, playlist và phim đã lưu, đồng bộ trên mọi thiết bị.', 'Favourite songs, playlists and saved films, synced across your devices.'],
        ['Bài Hát Yêu Thích', 'Favourite songs'], ['Phim Yêu Thích', 'Favourite films'], ['Playlist', 'Playlists'],
        ['Chưa có bài hát yêu thích nào.', 'No favourite songs yet.'], ['Chưa có playlist nào.', 'No playlists yet.'],
        ['Chưa có phim nào trong Watchlist.', 'No films in your watchlist yet.'],
        ['Phim tuyển chọn, xem ngay trên KietStation', 'Curated films, streamed right here'],
        ['Tìm phim, đạo diễn, diễn viên...', 'Search films, directors, actors...'],
        ['Đã hết gợi ý hôm nay!', 'No more picks today!'], ['Tải Lại Gợi Ý', 'Reload picks'],
        ['Hệ thống đang tổng hợp thêm nội dung mới cho bạn.', 'We are preparing more picks for you.'],
        ['Xác Thực Danh Tính Người Dùng', 'Sign in to your account'], ['Địa chỉ Email', 'Email address'], ['Mật khẩu', 'Password'],
        ['ĐĂNG NHẬP', 'Sign in'], ['Chưa có tài khoản? Nhấn để Đăng ký ngay', 'No account yet? Sign up'],
        ['Trang chủ', 'Home'], ['Thêm', 'More'], ['Khám phá KietStation', 'Explore KietStation'],
        ['Đang phát', 'Now playing'], ['Chọn bài hát', 'Pick a track'], ['Hồ sơ cá nhân', 'My profile'], ['Giới thiệu', 'About'], ['Chế độ tập trung', 'Focus mode']
    ];
    // English strings that sit in the HTML today and map to Vietnamese by default
    const EN_ONLY = { 'Home': 'Trang chủ', 'Music': 'Nhạc', 'More': 'Thêm', 'Community': 'Cộng đồng', 'Film Station': 'Phim', 'Focus Mode': 'Chế độ tập trung', 'About / Bio': 'Giới thiệu' };

    const toEn = new Map();
    const toVi = new Map();
    PAIRS.forEach(function (p) { toEn.set(p[0], p[1]); toVi.set(p[1], p[0]); });
    Object.keys(EN_ONLY).forEach(function (k) { toVi.set(k, EN_ONLY[k]); });
    toEn.set('Khám phá Station', 'Explore KietStation');
    toVi.set('Khám phá Station', 'Khám phá KietStation');

    let lang = 'vi';
    try { lang = localStorage.getItem('ks-lang') || 'vi'; } catch (e) { /* storage blocked */ }

    const SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1 };
    const norm = function (t) { return t.replace(/\s+/g, ' ').trim(); };

    function lookup(text) {
        const k = norm(text);
        if (!k) return null;
        return (lang === 'en' ? toEn.get(k) : toVi.get(k)) || null;
    }

    function swapText(node) {
        const hit = lookup(node.nodeValue);
        if (!hit) return;
        const lead = node.nodeValue.match(/^\s*/)[0];
        const tail = node.nodeValue.match(/\s*$/)[0];
        node.nodeValue = lead + hit + tail;
    }

    function apply() {
        const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const nodes = [];
        while (w.nextNode()) {
            if (!SKIP[w.currentNode.parentNode.nodeName]) nodes.push(w.currentNode);
        }
        nodes.forEach(swapText);
        document.querySelectorAll('[placeholder],[title]').forEach(function (el) {
            ['placeholder', 'title'].forEach(function (a) {
                if (!el.hasAttribute(a)) return;
                const hit = lookup(el.getAttribute(a));
                if (hit) el.setAttribute(a, hit);
            });
        });
        document.documentElement.lang = lang;
        const btn = document.getElementById('lang-toggle');
        if (btn) btn.textContent = lang === 'vi' ? 'VI' : 'EN';
    }

    window.toggleLang = function () {
        // text already in the other language must be mapped back first: apply() looks up the new language
        // from whichever side the node currently holds, so switching twice returns the originals.
        const prev = lang;
        lang = prev === 'vi' ? 'en' : 'vi';
        try { localStorage.setItem('ks-lang', lang); } catch (e) { /* ignore */ }
        apply();
    };

    window.addEventListener('DOMContentLoaded', function () {
        apply();
        if (typeof window.showView === 'function') {
            const orig = window.showView;
            window.showView = function () {
                const r = orig.apply(this, arguments);
                setTimeout(apply, 60);
                return r;
            };
        }
    });
    window.addEventListener('load', function () { setTimeout(apply, 400); });
})();
