/**
 * DISCOVER VIEW LOGIC (TINDER-STYLE SWIPE)
 */

let discoverCards = [];
let currentCardIndex = 0;
let isDiscoverLoading = false;
let currentDiscoverPage = 1;

// CSS for discover cards dynamically added
const discoverStyles = document.createElement('style');
discoverStyles.textContent = `
    .discover-card {
        position: absolute;
        width: 100%;
        height: 100%;
        border-radius: 2rem;
        background-color: var(--surface-mid);
        border: 1px solid rgba(255,255,255,0.1);
        box-shadow: 0 20px 40px -10px rgba(0,0,0,0.5);
        overflow: hidden;
        transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s ease;
        will-change: transform, opacity;
        transform-origin: 50% 100%;
        z-index: 10;
        cursor: grab;
    }

    .discover-card:active {
        cursor: grabbing;
    }

    .discover-card-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    .discover-card-overlay {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 60%;
        background: linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.5) 40%, transparent 100%);
        padding: 24px;
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
        pointer-events: none;
    }

    .discover-tag {
        display: inline-block;
        padding: 4px 8px;
        background: rgba(255,255,255,0.2);
        backdrop-filter: blur(4px);
        border-radius: 6px;
        font-size: 10px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: white;
        margin-right: 6px;
        margin-bottom: 6px;
    }

    /* Swipe animations */
    .swipe-left {
        transform: translateX(-150%) rotate(-15deg) !important;
        opacity: 0 !important;
    }

    .swipe-right {
        transform: translateX(150%) rotate(15deg) !important;
        opacity: 0 !important;
    }

    /* Card stack effect */
    .discover-card[data-index="0"] { transform: scale(1) translateY(0); z-index: 50; }
    .discover-card[data-index="1"] { transform: scale(0.95) translateY(20px); z-index: 40; opacity: 0.8; }
    .discover-card[data-index="2"] { transform: scale(0.9) translateY(40px); z-index: 30; opacity: 0.5; }
    .discover-card[data-index="3"] { transform: scale(0.85) translateY(60px); z-index: 20; opacity: 0; }

    /* Stamp indicators */
    .swipe-stamp {
        position: absolute;
        top: 40px;
        padding: 8px 16px;
        border: 4px solid;
        border-radius: 12px;
        font-size: 32px;
        font-weight: 900;
        text-transform: uppercase;
        opacity: 0;
        transform: scale(0.5);
        transition: all 0.2s;
        pointer-events: none;
        z-index: 60;
    }

    .stamp-nope {
        right: 40px;
        color: #ef4444;
        border-color: #ef4444;
        transform: rotate(15deg);
    }

    
    .discover-mode-btn {
        background: rgba(255,255,255,0.05);
        border-color: rgba(255,255,255,0.1);
        color: var(--on-surface-variant);
    }
    .discover-mode-btn.active {
        background: rgba(233,255,185,0.15);
        border-color: var(--primary);
        color: var(--primary);
    }
    .discover-card-audio-visualizer {
        position: absolute;
        bottom: 24px;
        right: 24px;
        display: flex;
        align-items: flex-end;
        gap: 4px;
        height: 30px;
        z-index: 20;
    }
    .visualizer-bar {
        width: 4px;
        background: var(--primary);
        border-radius: 2px;
        animation: pulse-height 0.5s ease-in-out infinite alternate;
    }
    @keyframes pulse-height {
        0% { height: 4px; }
        100% { height: 100%; }
    }

    .stamp-like {
        left: 40px;
        color: var(--primary);
        border-color: var(--primary);
        transform: rotate(-15deg);
    }
`;
document.head.appendChild(discoverStyles);


let currentDiscoverMode = 'film'; // 'film' or 'music'
let audioPreview = new Audio();
let ytPlayerDiscover = null;

window.switchDiscoverMode = function(mode) {
    if (currentDiscoverMode === mode) return;
    currentDiscoverMode = mode;
    
    // Update UI
    document.getElementById('discover-mode-film').classList.remove('active');
    document.getElementById('discover-mode-music').classList.remove('active');
    document.getElementById(`discover-mode-${mode}`).classList.add('active');
    
    // Stop audio if playing
    if (audioPreview) audioPreview.pause();
    
    // Reload content
    loadDiscoverContent(1);
}

// Intercept fetch based on mode

async function loadDiscoverContent(page = 1) {
    if (isDiscoverLoading) return;
    isDiscoverLoading = true;

    const container = document.getElementById('swipe-container');
    const loading = document.getElementById('swipe-loading');
    const empty = document.getElementById('swipe-empty');

    if (page === 1) {
        // Clear existing cards
        Array.from(container.children).forEach(child => {
            if (child.id !== 'swipe-loading' && child.id !== 'swipe-empty') {
                child.remove();
            }
        });
        loading.classList.remove('hidden');
        empty.classList.add('hidden');
        discoverCards = [];
        currentCardIndex = 0;
    }

    try {
        let formattedCards = [];
        
        if (currentDiscoverMode === 'film') {
            const randomPage = page > 1 ? page : Math.floor(Math.random() * 20) + 1;
            const res = await fetch(`https://ophim1.com/v1/api/danh-sach/phim-moi-cap-nhat?page=${randomPage}`);
            const data = await res.json();

            if (data.status === 'success' && data.data.items.length > 0) {
                const imgDomain = data.data.APP_DOMAIN_CDN_IMAGE || data.pathImage || 'https://img.ophim.live';
                formattedCards = data.data.items.map(item => ({
                    id: item._id,
                    slug: item.slug,
                    title: item.name,
                    originalTitle: item.origin_name,
                    image: `${imgDomain}/uploads/movies/${item.poster_url}`,
                    thumb: `${imgDomain}/uploads/movies/${item.thumb_url}`,
                    year: item.year,
                    type: item.type === 'series' ? 'Phim Bộ' : 'Phim Lẻ',
                    quality: item.quality || 'HD',
                    lang: item.lang || 'Vietsub'
                }));
            }
                } else {
            // Music Discovery (Fetching from existing local backend /search)
            const searchTerms = ['lofi chill viet nam', 'vietnamese pop 2024 hit', 'tiktok viral vn', 'rap viet trending', 'indie vn chill', 'nhac acoustic hay', 'remix hot tiktok'];
            const randomTerm = searchTerms[Math.floor(Math.random() * searchTerms.length)];
            
            try {
                // Try backend YouTube search
                const res = await fetch(`/search?q=${encodeURIComponent(randomTerm)}&type=music`);
                const data = await res.json();
                
                if (data.recommendations && data.recommendations.length > 0) {
                    formattedCards = data.recommendations.map(item => {
                        const vidId = item.link.includes('v=') ? item.link.split('v=')[1].split('&')[0] : Math.random().toString(36).substr(2, 9);
                        return {
                            id: vidId + Math.random().toString(36).substr(2, 5), // Ensure unique
                            slug: item.link,
                            title: item.title.replace(' - YouTube', '').substring(0, 40),
                            originalTitle: randomTerm,
                            image: item.thumbnail || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=500',
                            thumb: item.thumbnail,
                            year: 'Audio',
                            type: 'Music',
                            quality: 'YT',
                            lang: 'Music'
                        };
                    });
                } else {
                    throw new Error("No recommendations from backend");
                }
            } catch(e) {
                console.warn("Backend search failed, using extensive fallback:", e);
                // Large fallback list to prevent "out of cards" when backend is down
                const fallbackDB = [
                    {title: 'Midnight City', artist: 'M83', img: 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=500'},
                    {title: 'Lofi Hip Hop Mix', artist: 'Chill Beats', img: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?q=80&w=500'},
                    {title: 'Blinding Lights', artist: 'The Weeknd', img: 'https://images.unsplash.com/photo-1493225457124-a1a2a5f5f929?q=80&w=500'},
                    {title: 'Sunset Lover', artist: 'Petit Biscuit', img: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?q=80&w=500'},
                    {title: 'Shape of You', artist: 'Ed Sheeran', img: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?q=80&w=500'},
                    {title: 'Bohemian Rhapsody', artist: 'Queen', img: 'https://images.unsplash.com/photo-1487180144351-b8472da7d491?q=80&w=500'},
                    {title: 'Imagine', artist: 'John Lennon', img: 'https://images.unsplash.com/photo-1511379938547-c1f69b13d835?q=80&w=500'},
                    {title: 'Nơi Này Có Anh', artist: 'Sơn Tùng', img: 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=500'}
                ];
                
                const shuffled = fallbackDB.sort(() => Math.random() - 0.5);
                formattedCards = shuffled.map(item => {
                    const seed = Math.random().toString(36).substr(2, 5);
                    return {
                        id: 'demo-' + seed, 
                        slug: 'demo', 
                        title: item.title, 
                        originalTitle: item.artist, 
                        image: item.img, 
                        thumb: item.img, 
                        year: 'Audio', 
                        type: 'Music', 
                        quality: 'HD', 
                        lang: 'Pop'
                    };
                });
            }
        }

        if (formattedCards.length > 0) {
            discoverCards = [...discoverCards, ...formattedCards];
            renderDiscoverCards();
        } else if (discoverCards.length === 0) {
            empty.classList.remove('hidden');
        }
    } catch (e) {
        console.error("Discover API Error:", e);
        if (discoverCards.length === 0) empty.classList.remove('hidden');
    } finally {
        isDiscoverLoading = false;
        loading.classList.add('hidden');
        currentDiscoverPage = page;
    }
}

function renderDiscoverCards() {
    const container = document.getElementById('swipe-container');

    // Only render top 4 cards
    for (let i = 0; i < 4; i++) {
        const cardIndex = currentCardIndex + i;
        if (cardIndex >= discoverCards.length) break;

        const cardData = discoverCards[cardIndex];

        // Skip if already exists
        if (document.getElementById(`dcard-${cardData.id}`)) {
            const cardEl = document.getElementById(`dcard-${cardData.id}`);
            cardEl.setAttribute('data-index', i);
            continue;
        }

        const cardHTML = `
            <div id="dcard-${cardData.id}" class="discover-card" data-index="${i}" data-slug="${cardData.slug}">
                <img src="${cardData.image}" onerror="this.src='${cardData.thumb}'" class="discover-card-img" alt="${cardData.title}" draggable="false">
                <div class="discover-card-overlay">
                    <div class="mb-2">
                        <span class="discover-tag">${cardData.type}</span>
                        <span class="discover-tag" style="background: rgba(233,255,185,0.2); color: var(--primary)">${cardData.year}</span>
                        <span class="discover-tag">${cardData.quality}</span>
                        <span class="discover-tag">${cardData.lang}</span>
                    </div>
                    <h3 class="text-2xl font-black text-white mb-1 leading-tight">${cardData.title}</h3>
                    <p class="text-slate-300 text-sm font-medium truncate">${cardData.originalTitle}</p>
                </div>

                <div class="swipe-stamp stamp-like">YÊU THÍCH</div>
                <div class="swipe-stamp stamp-nope">BỎ QUA</div>
            </div>
        `;

        container.insertAdjacentHTML('afterbegin', cardHTML);

        if (i === 0) setupCardInteraction(cardData.id);
    }

    if (discoverCards.length - currentCardIndex <= 3 && !isDiscoverLoading) {
        loadDiscoverContent(currentDiscoverPage + 1);
    }

    if (currentCardIndex >= discoverCards.length && !isDiscoverLoading) {
        document.getElementById('swipe-empty').classList.remove('hidden');
    }
}

function setupCardInteraction(cardId) {
    const card = document.getElementById(`dcard-${cardId}`);
    if (!card) return;

    let isDragging = false;
    let startX = 0;
    let currentX = 0;
    const threshold = 100;

    const likeStamp = card.querySelector('.stamp-like');
    const nopeStamp = card.querySelector('.stamp-nope');

    function onDragStart(e) {
        if (card.getAttribute('data-index') !== '0') return;
        isDragging = true;
        startX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
        card.style.transition = 'none';
    }

    function onDragMove(e) {
        if (!isDragging) return;
        const clientX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
        currentX = clientX - startX;

        const rotate = currentX * 0.05;
        card.style.transform = `translateX(${currentX}px) rotate(${rotate}deg)`;

        const opacity = Math.min(Math.abs(currentX) / 100, 1);
        if (currentX > 0) {
            likeStamp.style.opacity = opacity;
            likeStamp.style.transform = `scale(${0.5 + (opacity * 0.5)}) rotate(-15deg)`;
            nopeStamp.style.opacity = 0;
        } else {
            nopeStamp.style.opacity = opacity;
            nopeStamp.style.transform = `scale(${0.5 + (opacity * 0.5)}) rotate(15deg)`;
            likeStamp.style.opacity = 0;
        }
    }

    function onDragEnd() {
        if (!isDragging) return;
        isDragging = false;
        card.style.transition = 'transform 0.3s ease-out, opacity 0.3s ease-out';

        if (Math.abs(currentX) > threshold) {
            if (currentX > 0) {
                handleSwipeAction('right');
            } else {
                handleSwipeAction('left');
            }
        } else {
            card.style.transform = 'scale(1) translateX(0) rotate(0deg)';
            likeStamp.style.opacity = 0;
            nopeStamp.style.opacity = 0;
        }
        currentX = 0;
    }

    card.addEventListener('mousedown', onDragStart);
    window.addEventListener('mousemove', onDragMove);
    window.addEventListener('mouseup', onDragEnd);

    card.addEventListener('touchstart', onDragStart, {passive: true});
    window.addEventListener('touchmove', onDragMove, {passive: true});
    window.addEventListener('touchend', onDragEnd);
}

window.handleSwipeAction = function(action) {
    if (currentCardIndex >= discoverCards.length) return;

    const currentData = discoverCards[currentCardIndex];
    const cardEl = document.getElementById(`dcard-${currentData.id}`);

    if (cardEl) {
        if (action === 'right') {
            cardEl.classList.add('swipe-right');
            if (currentDiscoverMode === 'film') {
                saveToWatchlist(currentData);
                showToast('Đã thêm vào Watchlist! ❤️');
            } else {
                saveMusicFavorite(currentData);
                showToast('Đã thêm vào Nhạc Yêu Thích! 🎵');
            }
        } else if (action === 'left') {
            cardEl.classList.add('swipe-left');
        } else if (action === 'up') {
            if (currentDiscoverMode === 'film') {
                showView('film');
                if (window.streamFilmOphim) window.streamFilmOphim(currentData.slug, currentData.title);
            } else {
                // Play / search music on YouTube
                showView('dashboard');
                const searchInput = document.getElementById('search-input');
                if (searchInput) {
                    searchInput.value = currentData.title + ' ' + currentData.originalTitle;
                    if (window.performSearch) window.performSearch();
                }
            }
            return;
        }

        setTimeout(() => {
            if (cardEl && cardEl.parentNode) cardEl.remove();
        }, 300);
    }

    currentCardIndex++;

    if (audioPreview) {
        audioPreview.pause();
        audioPreview.currentTime = 0;
    }

    renderDiscoverCards();
};

function saveToWatchlist(filmData) {
    try {
        let watchlist = JSON.parse(localStorage.getItem('kiet_film_watchlist') || '[]');
        const exists = watchlist.find(h => h.slug === filmData.slug);
        if (!exists) {
            watchlist.unshift({
                slug: filmData.slug,
                name: filmData.title,
                originalTitle: filmData.originalTitle,
                image: filmData.image,
                thumb: filmData.thumb,
                year: filmData.year,
                type: filmData.type,
                quality: filmData.quality,
                lang: filmData.lang,
                date: new Date().toISOString()
            });
            if (watchlist.length > 100) watchlist = watchlist.slice(0, 100);
            localStorage.setItem('kiet_film_watchlist', JSON.stringify(watchlist));

            if (window.loadWatchlist) window.loadWatchlist();
        }
    } catch(e) {
        console.error("Watchlist save error:", e);
    }
}

function showToast(msg) {
    let t = document.getElementById('discover-toast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'discover-toast';
        t.className = 'fixed top-20 left-1/2 -translate-x-1/2 bg-white text-black px-6 py-3 rounded-full font-bold shadow-2xl z-[9999] transition-all transform duration-300 pointer-events-none';
        document.body.appendChild(t);
    }
    t.innerHTML = msg;
    t.style.opacity = '0';
    t.style.transform = 'translate(-50%, -20px)';

    setTimeout(() => {
        t.style.opacity = '1';
        t.style.transform = 'translate(-50%, 0)';
    }, 10);

    setTimeout(() => {
        t.style.opacity = '0';
        t.style.transform = 'translate(-50%, -20px)';
    }, 2000);
}

// Load Watchlist into Library view
window.loadWatchlist = function() {
    try {
        const watchlist = JSON.parse(localStorage.getItem('kiet_film_watchlist') || '[]');
        const container = document.getElementById('library-watchlist-list');

        if (!container) return;

        if (watchlist.length === 0) {
            container.innerHTML = `
                <div class="col-span-2 flex flex-col items-center justify-center h-40 opacity-50">
                    <span class="material-icons-round text-4xl mb-2">movie</span>
                    <p class="text-xs">Chưa có phim nào trong Watchlist.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = watchlist.map(film => `
            <div class="group cursor-pointer relative overflow-hidden rounded-lg border border-white/10 hover:border-primary/50 transition-all" onclick="showView('film'); window.streamFilmOphim && window.streamFilmOphim('${film.slug}', '${film.name}')">
                <div class="relative w-full aspect-[2/3] overflow-hidden bg-black/40">
                    <img src="${film.image}" onerror="this.src='${film.thumb}'" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" alt="${film.name}">
                    <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2">
                        <p class="text-[10px] font-bold text-white truncate">${film.name}</p>
                        <p class="text-[9px] text-slate-300">${film.year} • ${film.type}</p>
                    </div>
                </div>
                <button onclick="event.stopPropagation(); removeFromWatchlist('${film.slug}')" class="absolute top-1 right-1 w-6 h-6 bg-red-500/80 hover:bg-red-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs">
                    <span class="material-icons-round text-[14px]">close</span>
                </button>
            </div>
        `).join('');
    } catch(e) {
        console.error("Load watchlist error:", e);
    }
};

// Remove from watchlist
window.removeFromWatchlist = function(slug) {
    try {
        let watchlist = JSON.parse(localStorage.getItem('kiet_film_watchlist') || '[]');
        watchlist = watchlist.filter(f => f.slug !== slug);
        localStorage.setItem('kiet_film_watchlist', JSON.stringify(watchlist));
        window.loadWatchlist();
        showToast('Đã xóa khỏi Watchlist');
    } catch(e) {
        console.error("Remove watchlist error:", e);
    }
};

// Save music to favorites
function saveMusicFavorite(musicData) {
    try {
        let favorites = JSON.parse(localStorage.getItem('kiet_music_favorites') || '[]');
        const exists = favorites.find(f => f.slug === musicData.slug);
        if (!exists) {
            favorites.unshift({
                id: musicData.id,
                slug: musicData.slug,
                title: musicData.title,
                artist: musicData.originalTitle,
                image: musicData.image,
                date: new Date().toISOString()
            });
            if (favorites.length > 100) favorites = favorites.slice(0, 100);
            localStorage.setItem('kiet_music_favorites', JSON.stringify(favorites));

            // Reload favorites in library if function exists
            if (window.loadFavorites) window.loadFavorites();
        }
    } catch(e) {
        console.error("Music favorite save error:", e);
    }
}
