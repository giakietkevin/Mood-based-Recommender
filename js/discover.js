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

    .stamp-like {
        left: 40px;
        color: var(--primary);
        border-color: var(--primary);
        transform: rotate(-15deg);
    }
`;
document.head.appendChild(discoverStyles);

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
        const randomPage = page > 1 ? page : Math.floor(Math.random() * 20) + 1;
        const res = await fetch(`https://ophim1.com/v1/api/danh-sach/phim-moi-cap-nhat?page=${randomPage}`);
        const data = await res.json();

        if (data.status === 'success' && data.data.items.length > 0) {
            const newItems = data.data.items;
            const imgDomain = data.data.APP_DOMAIN_CDN_IMAGE || data.pathImage || 'https://img.ophim.live';

            const formattedCards = newItems.map(item => ({
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
            saveToWatchlist(currentData);
            showToast('Đã thêm vào Watchlist! ❤️');
        } else if (action === 'left') {
            cardEl.classList.add('swipe-left');
        } else if (action === 'up') {
            // Xem phim ngay
            showView('film');
            if (window.streamFilmOphim) {
                window.streamFilmOphim(currentData.slug, currentData.title);
            }
            return;
        }

        setTimeout(() => {
            if (cardEl && cardEl.parentNode) cardEl.remove();
        }, 300);
    }

    currentCardIndex++;
    renderDiscoverCards();
};

function saveToWatchlist(filmData) {
    try {
        let history = JSON.parse(localStorage.getItem('kiet_film_history') || '[]');
        const exists = history.find(h => h.slug === filmData.slug);
        if (!exists) {
            history.unshift({
                slug: filmData.slug,
                name: filmData.title,
                time: 0,
                duration: 1,
                date: new Date().toISOString()
            });
            if (history.length > 50) history = history.slice(0, 50);
            localStorage.setItem('kiet_film_history', JSON.stringify(history));

            if (window.loadFilmHistory) window.loadFilmHistory();
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

// Intercept showView to load cards on first open
document.addEventListener('DOMContentLoaded', () => {
    const origShowView = window.showView;
    if (origShowView) {
        window.showView = (viewName) => {
            origShowView(viewName);
            if (viewName === 'discover') {
                if (discoverCards.length === 0) {
                    loadDiscoverContent(1);
                }
            }
        };
    }
});
