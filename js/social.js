/* ============================================================
   PATCH: Social Interactions v2 — Like & Comment
   Inject cuối <body>: fix hasLiked, animation, realtime DOM
============================================================ */
(function () {
    /* 1. CSS ANIMATIONS */
    const style = document.createElement('style');
    style.textContent = `
        @keyframes heartPop {
            0%   { transform: scale(1); }
            30%  { transform: scale(1.45); }
            60%  { transform: scale(0.88); }
            100% { transform: scale(1); }
        }
        @keyframes floatHeart {
            0%   { opacity: 1; transform: translateY(0) scale(1); }
            100% { opacity: 0; transform: translateY(-52px) scale(1.5); }
        }
        @keyframes commentSlideIn {
            from { opacity: 0; transform: translateY(8px); }
            to   { opacity: 1; transform: translateY(0); }
        }
        .heart-pop { animation: heartPop 0.35s cubic-bezier(.36,.07,.19,.97) forwards; }
        .comment-slide-in { animation: commentSlideIn 0.25s ease forwards; }
    `;
    document.head.appendChild(style);

    /* 2. Spawn floating heart particle */
    function spawnFloatingHeart(btn) {
        const heart = document.createElement('span');
        heart.textContent = '❤';
        heart.style.cssText = `
            position:fixed; font-size:18px; pointer-events:none; z-index:9999;
            animation: floatHeart 0.65s ease forwards;
        `;
        const rect = btn.getBoundingClientRect();
        heart.style.left = (rect.left + rect.width / 2 - 9) + 'px';
        heart.style.top  = (rect.top - 4) + 'px';
        document.body.appendChild(heart);
        heart.addEventListener('animationend', () => heart.remove());
    }

    /* 3. OVERRIDE likePost — optimistic + animation + DB sync */
    window.likePost = async function (id) {
        if (!window.currentUserUid) return alert('Vui lòng đăng nhập để tương tác!');
        const post = (typeof findFeedPost === 'function') ? findFeedPost(id) : null;
        if (!post) return;

        const wasLiked = post.hasLiked;
        post.hasLiked  = !wasLiked;
        post.likes     = post.hasLiked ? (post.likes || 0) + 1 : Math.max(0, (post.likes || 0) - 1);
        post.liked_by  = post.liked_by || [];
        if (post.hasLiked) {
            if (!post.liked_by.includes(window.currentUserUid)) post.liked_by.push(window.currentUserUid);
        } else {
            post.liked_by = post.liked_by.filter(u => u !== window.currentUserUid);
        }

        const likeBtn   = document.getElementById(`like-btn-${id}`);
        const likeCount = document.getElementById(`like-count-${id}`);
        const icon      = likeBtn?.querySelector('.material-icons-round');

        if (icon) {
            icon.textContent = post.hasLiked ? 'favorite' : 'favorite_border';
            icon.classList.remove('heart-pop');
            void icon.offsetWidth;
            icon.classList.add('heart-pop');
            icon.addEventListener('animationend', () => icon.classList.remove('heart-pop'), { once: true });
        }
        if (likeBtn) likeBtn.style.color = post.hasLiked ? '#f87171' : '#94a3b8';
        if (likeCount) likeCount.textContent = post.likes;
        if (post.hasLiked && likeBtn) spawnFloatingHeart(likeBtn);

        try {
            const { error } = await window.supabaseClient
                .from('posts')
                .update({ likes: post.likes, liked_by: post.liked_by })
                .eq('id', id);
            if (error) {
                await window.supabaseClient.from('posts').update({ likes: post.likes }).eq('id', id);
            }
        } catch (e) {
            // Rollback
            post.hasLiked = wasLiked;
            post.likes    = wasLiked ? (post.likes || 0) + 1 : Math.max(0, (post.likes || 0) - 1);
            if (icon) icon.textContent = wasLiked ? 'favorite' : 'favorite_border';
            if (likeBtn) likeBtn.style.color = wasLiked ? '#f87171' : '#94a3b8';
            if (likeCount) likeCount.textContent = post.likes;
            console.error('Like error (rolled back):', e);
        }
        if (typeof trackActivity === 'function') trackActivity('likes_given');
    };

    /* 4. OVERRIDE submitComment — insert 1 item, không re-render list */
    window.submitComment = async function (id) {
        if (!window.currentUserUid) return alert('Vui lòng đăng nhập!');
        const input = document.getElementById(`comment-input-${id}`);
        const text  = input?.value.trim();
        if (!text) return;

        const userName   = document.querySelector('#user-display')?.textContent || 'Bạn';
        const userAvatar = (typeof window.currentUserAvatarUrl === 'string' && window.currentUserAvatarUrl)
            ? window.currentUserAvatarUrl
            : (document.querySelector('#user-avatar')?.src || 'https://i.pravatar.cc/150?img=1');

        const newComment = {
            post_id: id, user_id: window.currentUserUid, content: text,
            author_name: userName, author_avatar: userAvatar,
            created_at: new Date().toISOString()
        };

        if (!window.postCommentsMap)       window.postCommentsMap = {};
        if (!window.postCommentsMap[id])   window.postCommentsMap[id] = [];
        window.postCommentsMap[id].push(newComment);
        if (input) input.value = '';

        const commentsList = document.getElementById(`comments-list-${id}`);
        if (commentsList) {
            const div = document.createElement('div');
            div.className = 'flex gap-2 items-start comment-slide-in';
            div.innerHTML = `
                <img src="${userAvatar}" class="w-7 h-7 rounded-full border border-white/10 flex-shrink-0"
                     onerror="this.src='https://i.pravatar.cc/150?img=1'">
                <div class="bg-white/5 rounded-xl px-3 py-2 flex-1">
                    <p class="text-[10px] font-bold text-primary">${userName}</p>
                    <p class="text-[11px] text-slate-300">${text}</p>
                </div>`;
            commentsList.appendChild(div);
            commentsList.scrollTop = commentsList.scrollHeight;
        }

        const cnt = window.postCommentsMap[id].length;
        const post = (typeof findFeedPost === 'function') ? findFeedPost(id) : null;
        if (post) post.commentsCount = cnt;
        const cc  = document.getElementById(`comment-count-${id}`);
        const cbc = document.getElementById(`comment-btn-count-${id}`);
        if (cc)  cc.textContent  = `${cnt} bình luận`;
        if (cbc) cbc.textContent = String(cnt);

        try {
            await window.supabaseClient.from('post_comments').insert([newComment]);
        } catch (e) {
            console.warn('Save comment failed:', e?.message || e);
        }
    };

    /* 5. PATCH REALTIME: cập nhật DOM trực tiếp, không reload feed */
    function patchRealtimeLikeCount() {
        if (!window.supabaseClient) return;
        window.supabaseClient
            .channel('patch-social-v2')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'posts' }, payload => {
                const row = payload.new;
                if (!row) return;
                const el = document.getElementById(`like-count-${row.id}`);
                if (el) el.textContent = row.likes || 0;
                const sc  = document.getElementById(`share-count-${row.id}`);
                const sbc = document.getElementById(`share-btn-count-${row.id}`);
                if (sc)  sc.textContent  = `${row.shares || 0} chia sẻ`;
                if (sbc) sbc.textContent = String(row.shares || 0);
                // Sync memory
                if (typeof findFeedPost === 'function') {
                    const p = findFeedPost(row.id);
                    if (p) {
                        p.likes = row.likes || 0;
                        const likedBy = row.liked_by || [];
                        p.liked_by = likedBy;
                        if (window.currentUserUid) p.hasLiked = likedBy.includes(window.currentUserUid);
                    }
                }
            })
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'post_comments' }, payload => {
                const row = payload.new;
                if (!row || !row.post_id) return;
                if (row.user_id === window.currentUserUid) return; // đã insert optimistic rồi
                const pid = row.post_id;
                if (!window.postCommentsMap)      window.postCommentsMap = {};
                if (!window.postCommentsMap[pid]) window.postCommentsMap[pid] = [];
                const dup = window.postCommentsMap[pid].some(c => c.content === row.content && c.user_id === row.user_id);
                if (!dup) window.postCommentsMap[pid].push(row);

                const list    = document.getElementById(`comments-list-${pid}`);
                const section = document.getElementById(`comment-section-${pid}`);
                if (list && section && !section.classList.contains('hidden')) {
                    const div = document.createElement('div');
                    div.className = 'flex gap-2 items-start comment-slide-in';
                    div.innerHTML = `
                        <img src="${row.author_avatar || 'https://i.pravatar.cc/150?img=1'}"
                             class="w-7 h-7 rounded-full border border-white/10 flex-shrink-0"
                             onerror="this.src='https://i.pravatar.cc/150?img=1'">
                        <div class="bg-white/5 rounded-xl px-3 py-2 flex-1">
                            <p class="text-[10px] font-bold text-primary">${row.author_name || 'User'}</p>
                            <p class="text-[11px] text-slate-300">${row.content || ''}</p>
                        </div>`;
                    list.appendChild(div);
                    list.scrollTop = list.scrollHeight;
                }
                const cnt = window.postCommentsMap[pid].length;
                const cc  = document.getElementById(`comment-count-${pid}`);
                const cbc = document.getElementById(`comment-btn-count-${pid}`);
                if (cc)  cc.textContent  = `${cnt} bình luận`;
                if (cbc) cbc.textContent = String(cnt);
            })
            .subscribe();
    }

    /* 6. PATCH renderHomeNewsfeed — sync màu like button sau render */
    const _origRender = window.renderHomeNewsfeed;
    if (typeof _origRender === 'function') {
        window.renderHomeNewsfeed = function () {
            _origRender.apply(this, arguments);
            requestAnimationFrame(() => {
                const posts = [...(window.homePosts || []), ...(window.profileFeedPosts || [])];
                posts.forEach(post => {
                    const btn  = document.getElementById(`like-btn-${post.id}`);
                    const icon = btn?.querySelector('.material-icons-round');
                    if (!btn) return;
                    btn.style.color = post.hasLiked ? '#f87171' : '#94a3b8';
                    if (icon) icon.textContent = post.hasLiked ? 'favorite' : 'favorite_border';
                });
            });
        };
    }

    /* 7. INIT */
    function waitForSupabase(cb, tries = 0) {
        if (window.supabaseClient) return cb();
        if (tries > 30) return console.warn('[Patch] supabaseClient timeout');
        setTimeout(() => waitForSupabase(cb, tries + 1), 300);
    }
    waitForSupabase(patchRealtimeLikeCount);
    console.log('[Patch Social v2] loaded ✓');
})();
