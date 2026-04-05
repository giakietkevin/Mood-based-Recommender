
/* ---- extracted from index.html L2660 ---- */

// ==========================================
        // 1. DATA CONFIGURATION (FULL LIST)
        // ==========================================
        const OPTS = {
            styles: [
                "Pop", "Rock", "Punk", "Electronic", "Rap", "Metal", "Hard Rock",
                "Alternative", "Funk", "Pop Rock", "Pop Punk", "Swing", "Dark Folk",
                "Lo-Fi", "Sad Rap", "Dubstep", "EDM", "Ballad", "R&B", "Jazz", "Blues",
                "Country", "Soul", "Reggae", "Latin", "House", "Techno", "Trance", "Indie"
            ],
            moods: [
                "Joy", "Sadness", "Anger", "Fear", "Surprise", "Anticipation",
                "Calmness", "Romantic", "Nostalgia", "Triumph"
            ],
            voices: [
                "Male - North", "Male - Central", "Male - South",
                "Female - North", "Female - Central", "Female - South",
                "Male Young", "Male Mature", "Female Young", "Female Mature",
                "Male", "Female"
            ],
            tempos: [
                "Fast", "Medium", "Slow"
            ]
        };

        // State Variables
        let genState = { style: 'Pop', mood: 'Joy', voice: 'Female', tempo: 'Medium' };
        let currentMode = 'local'; // 'local' | 'youtube'
        let currentType = 'music'; // 'music' | 'podcast'
        let ytPlayer;
        let isYtReady = false;
        let localAudio = document.getElementById('local-audio');
        let searchEnterBound = false;

        // Data states
        window.currentUserUid = null;
        let myFavorites = [];
        let myPlaylists = [];
        let songToPlaylist = null;

        // Film Station states
        let filmHistory = [];
        window.currentSubtitleUrl = null;

        // Camera States
        let cameraEnabled = true;
        let mainStream = null;

        window.toggleYtVideo = () => {
            const modal = document.getElementById('yt-video-modal');
            if (modal.classList.contains('opacity-0')) {
                modal.classList.remove('opacity-0', 'pointer-events-none');
                modal.classList.add('opacity-100', 'pointer-events-auto');
            } else {
                modal.classList.add('opacity-0', 'pointer-events-none');
                modal.classList.remove('opacity-100', 'pointer-events-auto');
            }
        };

        // ==========================================
        // 2. UI INITIALIZATION & CHIPS
        // ==========================================
        function initUI() {
            renderChips('style-options', OPTS.styles, 'style');
            renderChips('mood-options', OPTS.moods, 'mood');
            renderChips('voice-options', OPTS.voices, 'voice');
            renderChips('tempo-options', OPTS.tempos, 'tempo');

            loadMySongs(); // Library data
            initPBBackdrops(); // Initialize Photobooth backgrounds
            // (initCamera will be called by showView('dashboard'))

            const searchInput = document.getElementById('search-input');
            if (searchInput && !searchEnterBound) {
                searchEnterBound = true;
                searchInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') performSearch();
                });
            }

            const initialView = new URLSearchParams(window.location.search).get('view');
            if (initialView === 'studio' || initialView === 'guide' || initialView === 'home' || initialView === 'dashboard' || initialView === 'about') {
                showView(initialView);
            } else {
                showView('home');
            }
        }

        function renderChips(containerId, dataArray, key) {
            const container = document.getElementById(containerId);
            container.innerHTML = dataArray.map(item =>
                `<div onclick="selectChip('${key}', '${item}')" 
                  class="chip-option ${genState[key] === item ? 'active' : ''}" 
                  data-group="${key}" 
                  data-value="${item}">
                ${item}
            </div>`
            ).join('');
        }

        window.selectChip = (key, value) => {
            genState[key] = value;
            // Update UI classes
            document.querySelectorAll(`[data-group="${key}"]`).forEach(el => {
                if (el.dataset.value === value) el.classList.add('active');
                else el.classList.remove('active');
            });
        };

        window.resetChips = () => {
            genState = { style: 'Pop', mood: 'Joy', voice: 'Female', tempo: 'Medium' };
            initUI(); // Re-render
        };

        // Global helper for PiP Logic
        window.attemptSmartPiP = async (videoEl) => {
            if (!videoEl || videoEl.paused || !document.pictureInPictureEnabled) {
                if (videoEl && !videoEl.paused) videoEl.pause();
                return;
            }
            try {
                if (document.pictureInPictureElement !== videoEl) {
                    await videoEl.requestPictureInPicture();
                }
            } catch (e) {
                console.warn("PiP failed, pausing video as fallback", e);
                videoEl.pause();
            }
        };

        window.exitSmartPiP = async () => {
            if (document.pictureInPictureElement) {
                try { await document.exitPictureInPicture(); } catch (e) { }
            }
        };

        // Listen for Browser Tab Switching (External)
        document.addEventListener('visibilitychange', () => {
            const filmVideo = document.getElementById('film-video-player');
            const legacyVideo = document.getElementById('video-player');
            const activeVideo = (filmVideo && !filmVideo.paused) ? filmVideo : (legacyVideo && !legacyVideo.paused ? legacyVideo : null);

            if (document.visibilityState === 'hidden') {
                // User left the browser tab entirely
                if (activeVideo) window.attemptSmartPiP(activeVideo);
            } else {
                // User came back to the browser tab
                // If they are on the film view, exit PiP
                const currentView = Array.from(document.querySelectorAll('[id^="view-"]')).find(v => !v.classList.contains('hidden'))?.id;
                if (currentView === 'view-film') {
                    window.exitSmartPiP();
                }
            }
        });

        window.showView = (viewName) => {
            if (viewName === 'film' && !window.currentUserUid) {
                showAuthModal();
                showAuthError("Vui lòng đăng nhập để sử dụng tính năng Phim!");
                return;
            }
            const views = ['home', 'dashboard', 'studio', 'library', 'film', 'game', 'photobooth', 'guide', 'about'];
            views.forEach(v => {
                const el = document.getElementById(`view-${v}`);
                const nav = document.getElementById(`nav-${v}`);
                if (el) el.classList.add('hidden');
                if (nav) {
                    nav.classList.remove('bg-white/10', 'text-white', 'shadow-sm', 'shadow-primary/20');
                    nav.classList.add('text-slate-400');
                }
            });

            const activeView = document.getElementById(`view-${viewName}`);
            const activeNav = document.getElementById(`nav-${viewName}`);

            if (activeView) activeView.classList.remove('hidden');
            if (activeNav) {
                activeNav.classList.add('bg-white/10', 'text-white', 'shadow-sm');
                activeNav.classList.remove('text-slate-400');
            }

            // Smart PiP Management for Internal Navigation
            if (viewName !== 'film') {
                const filmVideo = document.getElementById('film-video-player');
                const legacyVideo = document.getElementById('video-player');
                if (filmVideo && !filmVideo.paused) window.attemptSmartPiP(filmVideo);
                else if (legacyVideo && !legacyVideo.paused) window.attemptSmartPiP(legacyVideo);
            } else {
                window.exitSmartPiP();
            }

            // Camera Management
            if (viewName === 'dashboard') {
                if (cameraEnabled) initCamera();
                stopPhotoboothCamera();
            } else if (viewName === 'photobooth') {
                // Layout selection first, don't start camera yet
                stopMainCamera();
                document.getElementById('pb-layout-zone').classList.remove('hidden');
                document.getElementById('pb-capture-zone').classList.add('hidden');
                document.getElementById('pb-design-zone').classList.add('hidden');
            } else {
                stopMainCamera();
                stopPhotoboothCamera();
            }

            // Game Cleanup
            if (viewName !== 'game' && typeof stopSnake === 'function') stopSnake();

            // Refresh Data
            if (viewName === 'studio') loadMySongs();
            if (viewName === 'library') {
                if (!window.currentUserUid) {
                    alert("Vui lòng LOGIN để xem Thư viện cá nhân nhé! ❤️");
                }
                loadFavorites();
                loadPlaylists();
            }
            if (viewName === 'film') {
                loadFilmHistory();
                // Auto-load film grid on first open
                const grid = document.getElementById('film-main-grid');
                if (grid && !grid.dataset.loaded) {
                    grid.dataset.loaded = '1';
                    loadFilmGrid(1);
                }
                // Restore pagination visibility
                const pagination = document.getElementById('film-pagination');
                if (pagination) pagination.classList.remove('hidden');
            }

            if (viewName === 'photobooth') {
                // Photobooth extra init if needed
            }

            // VIP Access Check
            if (viewName === 'film') {
                const checkVip = async () => {
                    const modal = document.getElementById('film-vip-modal');
                    if (!modal) return;
                    
                    if (window.currentUserUid && window.supabaseClient) {
                        const { data: profile } = await window.supabaseClient.from('profiles').select('type').eq('id', window.currentUserUid).single();
                        if (profile && profile.type === 'vip') {
                            modal.classList.add('hidden');
                            return;
                        }
                    }
                    modal.classList.remove('hidden');
                };
                checkVip();
            }

            // History Management
            try {
                const url = new URL(window.location.href);
                if (viewName === 'dashboard') url.searchParams.delete('view');
                else url.searchParams.set('view', viewName);
                history.replaceState({}, '', url);
            } catch (e) { }
        };

        // Camera Logic Dashboard
        window.toggleCamera = () => {
            cameraEnabled = !cameraEnabled;
            const btn = document.getElementById('camera-toggle-btn');
            const icon = document.getElementById('camera-toggle-icon');
            const text = document.getElementById('camera-toggle-text');
            const video = document.getElementById('video');

            if (cameraEnabled) {
                icon.innerText = 'videocam_off';
                text.innerText = 'HIDE CAMERA';
                btn.classList.add('bg-white/10');
                btn.classList.remove('bg-red-500/20', 'text-red-400');
                initCamera();
            } else {
                icon.innerText = 'videocam';
                text.innerText = 'SHOW CAMERA';
                btn.classList.remove('bg-white/10');
                btn.classList.add('bg-red-500/20', 'text-red-400');
                stopMainCamera();
                if (video) video.srcObject = null;
            }
        };

        function stopMainCamera() {
            if (mainStream) {
                mainStream.getTracks().forEach(track => track.stop());
                mainStream = null;
            }
        }

        window.switchType = (type) => {
            currentType = type;
            const musicBtn = document.getElementById('type-music');
            const podcastBtn = document.getElementById('type-podcast');

            if (type === 'music') {
                musicBtn.classList.add('bg-primary', 'text-white', 'shadow-lg');
                musicBtn.classList.remove('bg-white/5', 'text-slate-400');
                podcastBtn.classList.remove('bg-primary', 'text-white', 'shadow-lg');
                podcastBtn.classList.add('bg-white/5', 'text-slate-400');
            } else {
                podcastBtn.classList.add('bg-primary', 'text-white', 'shadow-lg');
                podcastBtn.classList.remove('bg-white/5', 'text-slate-400');
                musicBtn.classList.remove('bg-primary', 'text-white', 'shadow-lg');
                musicBtn.classList.add('bg-white/5', 'text-slate-400');
            }

            const query = document.getElementById('search-input').value.trim();
            if (query) performSearch();
        };

        // ==========================================
        // 3. MUSIC GENERATION LOGIC (UPGRADED)
        // ==========================================
        async function generateMusic() {
            const title = document.getElementById('gen-title').value;
            const lyrics = document.getElementById('gen-lyrics').value;
            const btn = document.getElementById('generate-btn');
            const status = document.getElementById('gen-status');
            const progressContainer = document.getElementById('gen-progress-container');
            const progressBar = document.getElementById('gen-progress-bar');
            const stepText = document.getElementById('gen-step-text');
            const timeText = document.getElementById('gen-time-text');

            if (!lyrics.trim()) {
                alert("⚠️ Vui lòng nhập lời bài hát (Lyrics)!");
                document.getElementById('gen-lyrics').focus();
                return;
            }

            // Estimate time based on lyrics length
            const lineCount = lyrics.split('\n').filter(l => l.trim()).length;
            const estimatedTime = Math.max(20, lineCount * 3); // ~3s per line

            // Loading State
            btn.disabled = true;
            btn.classList.add('opacity-70', 'cursor-not-allowed');
            btn.innerHTML = `<span class="material-icons-round animate-spin">autorenew</span> GENERATING...`;

            // Show progress
            progressContainer.style.opacity = '1';
            progressBar.style.width = '0%';

            // Simulate progress (since backend doesn't send real-time updates)
            const progressSteps = [
                { percent: 15, text: "🎤 Tạo giọng hát (TTS)...", time: 5 },
                { percent: 35, text: "🎵 Xử lý giai điệu (Pitch)...", time: 8 },
                { percent: 55, text: "🎹 Đồng bộ với beat...", time: 10 },
                { percent: 75, text: "🎚️ Thêm hiệu ứng audio...", time: 12 },
                { percent: 90, text: "🎼 Mixing & Mastering...", time: 15 },
            ];

            let currentStep = 0;
            const progressInterval = setInterval(() => {
                if (currentStep < progressSteps.length) {
                    const step = progressSteps[currentStep];
                    progressBar.style.width = `${step.percent}%`;
                    stepText.innerText = step.text;
                    timeText.innerText = `~${Math.max(0, estimatedTime - step.time)}s`;
                    currentStep++;
                }
            }, (estimatedTime * 1000) / progressSteps.length);

            const formData = new FormData();
            formData.append('title', title.trim() || "Untitled Song");
            formData.append('uid', window.currentUserUid || "guest");
            formData.append('lyrics', lyrics);
            formData.append('style', genState.style);
            formData.append('mood', genState.mood);
            formData.append('voice', genState.voice);
            formData.append('tempo', genState.tempo);

            try {
                const response = await fetch('/generate-music', {
                    method: 'POST',
                    body: formData
                });
                const data = await response.json();

                clearInterval(progressInterval);

                if (data.status === 'success') {
                    // Complete progress
                    progressBar.style.width = '100%';
                    stepText.innerText = "✅ Hoàn thành!";
                    timeText.innerText = "0s";

                    status.style.opacity = '1';
                    status.innerText = "🎉 Bài hát đã sẵn sàng!";
                    status.classList.add('text-green-500');

                    // Load and play
                    await loadMySongs();

                    // Track Stat
                    trackActivity('songs_generated');

                    // Auto-play after a short delay
                    setTimeout(() => {
                        playTrack(data.song, 'local');
                    }, 500);
                } else {
                    progressBar.style.width = '0%';
                    status.style.opacity = '1';
                    status.innerText = "❌ Lỗi: " + (data.message || "Không xác định");
                    status.classList.add('text-red-500');
                }
            } catch (error) {
                clearInterval(progressInterval);
                console.error(error);
                progressBar.style.width = '0%';
                status.style.opacity = '1';
                status.innerText = "❌ Lỗi kết nối đến Server.";
                status.classList.add('text-red-500');
            } finally {
                // Reset UI after delay
                setTimeout(() => {
                    btn.disabled = false;
                    btn.classList.remove('opacity-70', 'cursor-not-allowed');
                    btn.innerHTML = `<span class="material-icons-round">album</span> GENERATE TRACK`;
                    progressContainer.style.opacity = '0';
                    status.style.opacity = '0';
                    status.classList.remove('text-green-500', 'text-red-500');
                }, 3000);
            }
        }

        // ==========================================
        // 4. LIBRARY MANAGEMENT
        // ==========================================
        async function loadMySongs() {
            const grid = document.getElementById('my-songs-grid');
            const profileGrid = document.getElementById('profile-songs-grid');
            const countDisplay = document.getElementById('library-song-count');
            const profileCount = document.getElementById('profile-song-count');
            const profileStatSongs = document.getElementById('profile-stat-songs');

            if (!grid) return;
            grid.innerHTML = '<div class="col-span-full py-20 text-center animate-pulse"><p class="text-slate-500 font-bold uppercase tracking-widest text-xs">Đang tải giai điệu của bạn...</p></div>';

            try {
                // Pass UID to filter library
                const uid = window.currentUserUid || "guest";
                const response = await fetch(`/my-songs?uid=${uid}`);
                const songs = await response.json();

                mySongs = songs;
                const count = songs.length;
                if (countDisplay) countDisplay.textContent = `${count} Bài hát`;
                if (profileCount) profileCount.textContent = `${count} Bài hát`;
                if (profileStatSongs) profileStatSongs.textContent = count;

                if (count === 0) {
                    const emptyHtml = `
                        <div class="col-span-full py-20 px-10 glass-card rounded-[3rem] border border-dashed border-white/10 text-center space-y-6">
                            <span class="material-icons-round text-6xl text-white/10">music_off</span>
                            <div class="space-y-1">
                                <p class="text-white font-bold text-lg">Thư viện trống</p>
                                <p class="text-slate-500 text-xs">Bắt đầu tạo bài hát đầu tiên của riêng bạn tại Studio!</p>
                            </div>
                        </div>`;
                    grid.innerHTML = emptyHtml;
                    if (profileGrid) profileGrid.innerHTML = emptyHtml;
                    return;
                }

                const html = songs.map(s => `
                    <div class="glass-card p-5 rounded-[2.5rem] border border-white/10 active:scale-95 transition-all group relative overflow-hidden">
                        <div class="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <div class="flex items-center gap-4 relative z-10">
                            <div class="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10 text-primary">
                                <span class="material-icons-round text-xl">music_note</span>
                            </div>
                            <div class="flex-1 min-w-0 pr-10">
                                <h4 class="text-white font-bold text-sm truncate">${s.title}</h4>
                                <p class="text-slate-500 text-[10px] font-bold uppercase tracking-widest">${s.style} • ${s.mood}</p>
                            </div>
                            <div class="flex gap-2">
                                <button onclick="playLocalSong('${s.file_url}', '${s.title}', '${s.style}')" 
                                    class="w-10 h-10 bg-primary/10 rounded-xl text-primary flex items-center justify-center hover:bg-primary transition-all hover:text-white">
                                    <span class="material-icons-round text-sm">play_arrow</span>
                                </button>
                                <button onclick="deleteLocalSong('${s.file_url}')" 
                                    class="w-10 h-10 bg-red-400/10 rounded-xl text-red-500 flex items-center justify-center hover:bg-red-500 transition-all hover:text-white">
                                    <span class="material-icons-round text-sm">delete</span>
                                </button>
                            </div>
                        </div>
                    </div>
                `).join('');

                grid.innerHTML = html;
                if (profileGrid) profileGrid.innerHTML = html;
            } catch (error) {
                console.error("Error loading library:", error);
                grid.innerHTML = '<p class="text-red-400 text-center py-10 font-bold uppercase tracking-widest text-[10px]">Lỗi kết nối Thư viện!</p>';
            }
        }

        async function deleteLocalSong(url) {
            if (!confirm("Bạn có chắc chắn muốn xóa bài hát này?")) return;
            const uid = window.currentUserUid || "guest";
            try {
                const response = await fetch(`/my-songs/delete?url=${encodeURIComponent(url)}&uid=${uid}`, { method: 'DELETE' });
                const res = await response.json();
                if (res.status === 'success') {
                    loadMySongs();
                    if (window.currentSongUrl === url) {
                        const audio = document.getElementById('main-audio');
                        if (audio) audio.pause();
                        togglePlay(false);
                    }
                }
            } catch (e) {
                console.error("Delete failed:", e);
            }
        }

        // ==========================================
        // 5. PLAYER LOGIC (Unified Local + Youtube)
        // ==========================================
        window.currentTrackData = null;
        function playTrack(data, mode) {
            window.currentTrackData = data;
            if (typeof isPartyHost !== 'undefined' && isPartyHost && typeof activePartyChannel !== 'undefined' && activePartyChannel) {
                activePartyChannel.send({ type: 'broadcast', event: 'change_track', payload: { data, mode } });
            }
            const playerBar = document.getElementById('player-bar');
            const pTitle = document.getElementById('player-title');
            const pDesc = document.getElementById('player-desc');
            const pThumb = document.getElementById('player-thumb');
            const playIcon = document.getElementById('play-icon');
            const dlBtn = document.getElementById('download-btn');

            // Show player
            playerBar.classList.remove('hidden', 'translate-y-full');

            currentMode = mode;

            if (mode === 'local') {
                // STOP Youtube
                if (isYtReady && ytPlayer.stopVideo) ytPlayer.stopVideo();

                // Setup UI
                pTitle.innerText = data.title;
                pDesc.innerText = `AI Generated • ${data.style} • ${data.mood}`;
                pThumb.src = "https://cdn-icons-png.flaticon.com/512/12204/12204300.png"; // AI Icon
                dlBtn.href = data.file_url;
                dlBtn.classList.remove('hidden');
                document.getElementById('yt-video-btn').classList.add('hidden');

                // Play Audio
                localAudio.src = data.file_url;
                localAudio.play();
                playIcon.innerText = "pause";

            } else if (mode === 'youtube') {
                // STOP Local
                localAudio.pause();

                // Setup UI
                pTitle.innerText = data.title;
                pDesc.innerText = "Youtube Music";
                pThumb.src = data.thumbnail;
                dlBtn.classList.add('hidden');
                document.getElementById('yt-video-btn').classList.remove('hidden');

                // Play Youtube
                if (isYtReady) {
                    const videoId = extractVideoId(data.link);
                    ytPlayer.loadVideoById(videoId);
                    ytPlayer.playVideo();
                    playIcon.innerText = "pause";
                }
            }

            // Adaptive Vibe Update
            updateUITheme(pThumb.src);

            // Achievement Track: Watch/Listen
            trackActivity('consume_media');
        }

        const colorThief = new ColorThief();
        window.updateUITheme = async (imgUrl) => {
            if (!imgUrl || imgUrl.includes('placeholder')) return;

            const proxyUrl = `https://images.weserv.nl/?url=${encodeURIComponent(imgUrl)}&w=100`;
            const img = new Image();
            img.crossOrigin = "Anonymous";
            img.src = proxyUrl;

            img.onload = () => {
                try {
                    const color = colorThief.getColor(img);

                    // --- COLOR BOOST MAGIC ---
                    // Convert RGB to HSL, boost Saturation, then back to RGB
                    const rgbToHsl = (r, g, b) => {
                        r /= 255; g /= 255; b /= 255;
                        const max = Math.max(r, g, b), min = Math.min(r, g, b);
                        let h, s, l = (max + min) / 2;
                        if (max === min) h = s = 0;
                        else {
                            const d = max - min;
                            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
                            switch (max) {
                                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                                case g: h = (b - r) / d + 2; break;
                                case b: h = (r - g) / d + 4; break;
                            }
                            h /= 6;
                        }
                        return [h, s, l];
                    };
                    const hslToRgb = (h, s, l) => {
                        let r, g, b;
                        if (s === 0) r = g = b = l;
                        else {
                            const hue2rgb = (p, q, t) => {
                                if (t < 0) t += 1; if (t > 1) t -= 1;
                                if (t < 1 / 6) return p + (q - p) * 6 * t;
                                if (t < 1 / 2) return q;
                                if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
                                return p;
                            };
                            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
                            const p = 2 * l - q;
                            r = hue2rgb(p, q, h + 1 / 3);
                            g = hue2rgb(p, q, h);
                            b = hue2rgb(p, q, h - 1 / 3);
                        }
                        return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
                    };

                    const [h, s, l] = rgbToHsl(color[0], color[1], color[2]);
                    // Boost saturation and fix brightness for a deep cinematic look
                    const boostedS = Math.min(1, s * 2.2);
                    const cinematicL = 0.04; // Very dark for body bg
                    const glowL = 0.15; // Slightly brighter for the top glow

                    const [br, bg, bb] = hslToRgb(h, boostedS, 0.5); // Rich accent color
                    const [bgr, bgg, bgb] = hslToRgb(h, boostedS * 0.5, cinematicL); // Dark themed background
                    const [glr, glg, glb] = hslToRgb(h, boostedS, glowL); // Themed glow

                    const accentRgb = `rgb(${br}, ${bg}, ${bb})`;
                    const bgRgb = `rgb(${bgr}, ${bgg}, ${bgb})`;
                    const glowRgba = `rgba(${glr}, ${glg}, glb, 0.6)`;

                    document.documentElement.style.setProperty('--primary', accentRgb);

                    // Transformation: Change the WHOLE body background to match the theme
                    document.body.style.backgroundColor = bgRgb;
                    document.body.style.backgroundImage = `radial-gradient(circle at 50% -20%, ${glowRgba} 0%, transparent 75%)`;

                    // Update Glass Cards for extra immersion
                    const glassRgba = `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.05)`;
                    document.querySelectorAll('.glass-card').forEach(card => {
                        card.style.backgroundColor = glassRgba;
                        card.style.borderColor = `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.15)`;
                    });

                    const nav = document.querySelector('nav');
                    if (nav) {
                        nav.style.backgroundColor = `rgba(${bgr}, ${bgg}, ${bgb}, 0.8)`;
                        nav.style.boxShadow = `0 10px 60px -15px ${accentRgb}`;
                    }
                } catch (e) {
                    console.warn("Color extraction failed:", e);
                }
            };
        };

        function toggleMainPlay() {
            const playIcon = document.getElementById('play-icon');

            if (currentMode === 'local') {
                if (localAudio.paused) {
                    localAudio.play();
                    playIcon.innerText = "pause";
                } else {
                    localAudio.pause();
                    playIcon.innerText = "play_arrow";
                }
            } else {
                if (isYtReady) {
                    const state = ytPlayer.getPlayerState();
                    if (state === 1) { // Playing
                        ytPlayer.pauseVideo();
                        playIcon.innerText = "play_arrow";
                    } else {
                        ytPlayer.playVideo();
                        playIcon.innerText = "pause";
                    }
                }
            }
        }

        function onTrackUpdate() {
            if (currentMode === 'local' && localAudio.duration) {
                const pct = (localAudio.currentTime / localAudio.duration) * 100;
                document.getElementById('progress-fill').style.width = `${pct}%`;
            }
        }

        function onTrackEnded() {
            document.getElementById('play-icon').innerText = "play_arrow";
            document.getElementById('progress-fill').style.width = "0%";
        }

        function setVolume(val) {
            localAudio.volume = val / 100;
            if (isYtReady) ytPlayer.setVolume(val);
        }

        // Youtube Helpers
        function extractVideoId(url) {
            const match = url.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/);
            return (match && match[2].length == 11) ? match[2] : null;
        }

        // Load Youtube API
        var tag = document.createElement('script');
        tag.src = "https://www.youtube.com/iframe_api";
        var firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

        function onYouTubeIframeAPIReady() {
            ytPlayer = new YT.Player('yt-player', {
                height: '100%', width: '100%',
                playerVars: { 'autoplay': 0, 'controls': 1, 'rel': 0, 'showinfo': 0 },
                events: {
                    'onReady': () => { isYtReady = true; },
                    'onStateChange': (event) => {
                        const playIcon = document.getElementById('play-icon');
                        if (currentMode === 'youtube') {
                            if (event.data === YT.PlayerState.PLAYING) {
                                playIcon.innerText = "pause";
                                if (typeof isPartyHost !== 'undefined' && isPartyHost && typeof activePartyChannel !== 'undefined' && activePartyChannel) {
                                    activePartyChannel.send({ type: 'broadcast', event: 'sync_play', payload: { time: ytPlayer.getCurrentTime ? ytPlayer.getCurrentTime() : 0 } });
                                }
                            }
                            else {
                                playIcon.innerText = "play_arrow";
                                if (event.data === YT.PlayerState.PAUSED && typeof isPartyHost !== 'undefined' && isPartyHost && typeof activePartyChannel !== 'undefined' && activePartyChannel) {
                                    activePartyChannel.send({ type: 'broadcast', event: 'sync_pause', payload: { time: ytPlayer.getCurrentTime ? ytPlayer.getCurrentTime() : 0 }});
                                }
                            }
                        }
                    }
                }
            });
        }

        // ==========================================
        // 6. DASHBOARD LOGIC (SEARCH & CAMERA)
        // ==========================================
        async function performSearch() {
            const input = document.getElementById('search-input');
            const container = document.getElementById('recommendations-container');
            const query = input.value;

            if (!query.trim()) return;

            container.innerHTML = `<div class="text-center py-10 text-primary animate-pulse">Searching Youtube...</div>`;

            try {
                const res = await fetch(`/search?q=${encodeURIComponent(query)}&type=${encodeURIComponent(currentType)}`);
                const data = await res.json();

                if (!data.recommendations || data.recommendations.length === 0) {
                    container.innerHTML = `<div class="text-center py-10 text-slate-500">Không tìm thấy kết quả.</div>`;
                    return;
                }

                container.innerHTML = data.recommendations.map(item => `
                <div class="glass-card p-3 rounded-xl flex items-center gap-3 cursor-pointer hover:bg-white/5 transition-colors border border-transparent hover:border-white/10"
                     onclick='playTrack(${JSON.stringify(item).replace(/'/g, "&#39;")}, "youtube")'>
                    <img src="${item.thumbnail}" class="w-16 h-16 rounded-lg object-cover shadow-md">
                    <div class="min-w-0 flex-1">
                        <h4 class="font-bold text-sm text-white truncate leading-tight mb-1">${item.title}</h4>
                        <p class="text-[10px] text-slate-400 font-bold uppercase tracking-wider">${currentType === 'podcast' ? 'Podcast' : 'Youtube Music'}</p>
                    </div>
                    ${window.getActionButtonsHTML(item, 'youtube')}
                </div>
            `).join('');
            } catch (e) {
                container.innerHTML = `<div class="text-center py-10 text-red-400">Search Failed.</div>`;
            }
        }

        // Dashboard Camera Logic
        async function initCamera() {
            const video = document.getElementById('video');
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                try {
                    stopMainCamera();
                    const constraints = { 
                        video: selectedVideoDeviceId ? { deviceId: { exact: selectedVideoDeviceId } } : { facingMode: "user" }
                    };
                    mainStream = await navigator.mediaDevices.getUserMedia(constraints);
                    if (video) video.srcObject = mainStream;
                    // Refresh labels after permission granted
                    refreshCameraDevices();
                } catch (err) {
                    console.error("Dashboard Camera Error", err);
                    // Fallback to any camera if exact fails
                    if (selectedVideoDeviceId) {
                        mainStream = await navigator.mediaDevices.getUserMedia({ video: true });
                        if (video) video.srcObject = mainStream;
                    }
                }
            }
        }

        document.getElementById('analyze-btn').onclick = async () => {
            const video = document.getElementById('video');
            const canvas = document.getElementById('canvas');
            const btn = document.getElementById('analyze-btn');
            const moodDisplay = document.getElementById('mood-display');
            const recContainer = document.getElementById('recommendations-container');

            btn.disabled = true;
            btn.innerHTML = `<span class="material-icons-round animate-spin">sync</span> SCANNING...`;

            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            canvas.getContext('2d').drawImage(video, 0, 0);

            canvas.toBlob(async (blob) => {
                const fd = new FormData();
                fd.append('file', blob, 'mood.jpg');

                try {
                    const keyword = document.getElementById('search-input').value.trim();
                    const recommendUrl = `/recommend?type=${encodeURIComponent(currentType)}${keyword ? `&q=${encodeURIComponent(keyword)}` : ''}`;
                    const res = await fetch(recommendUrl, { method: 'POST', body: fd });
                    const data = await res.json();

                    moodDisplay.innerText = data.mood;
                    moodDisplay.classList.add('text-primary');

                    if (!data.recommendations || data.recommendations.length === 0) {
                        recContainer.innerHTML = `<div class="text-center py-10 text-slate-500">Không tìm thấy gợi ý phù hợp.</div>`;
                        return;
                    }

                    // Render Recommendations
                    recContainer.innerHTML = data.recommendations.map(item => `
                    <div class="glass-card p-3 rounded-xl flex items-center gap-3 cursor-pointer hover:bg-white/5 transition-colors border border-transparent hover:border-white/10"
                         onclick='playTrack(${JSON.stringify(item).replace(/'/g, "&#39;")}, "youtube")'>
                        <img src="${item.thumbnail}" class="w-16 h-16 rounded-lg object-cover shadow-md">
                        <div class="min-w-0 flex-1">
                            <h4 class="font-bold text-sm text-white truncate leading-tight mb-1">${item.title}</h4>
                            <p class="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Mood: ${data.mood}</p>
                        </div>
                        ${window.getActionButtonsHTML(item, 'youtube')}
                    </div>
                `).join('');

                } catch (e) {
                    console.error(e);
                    alert("Mood Analysis Failed");
                } finally {
                    btn.disabled = false;
                    btn.innerHTML = `<span class="material-icons-round">face_retouching_natural</span> ANALYZE MOOD`;
                }
            }, 'image/jpeg');
        };

        // ==========================================
        // 7. LIBRARY & PLAYLIST LOGIC
        // ==========================================
        window.getActionButtonsHTML = (song, mode) => {
            const songStr = encodeURIComponent(JSON.stringify(song));
            const songId = song.link || song.file_url;
            const isFav = myFavorites.some(f => (f.link || f.file_url) === songId);

            return `
            <div class="flex items-center gap-1">
                <button onclick="toggleFavorite(event, '${songStr}')" class="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white transition-colors" title="Yêu thích">
                    <span class="material-icons-round text-sm ${isFav ? 'text-red-500' : ''}" data-fav-id="${songId}">${isFav ? 'favorite' : 'favorite_border'}</span>
                </button>
                <button onclick="openPlaylistModal(event, '${songStr}')" class="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white transition-colors" title="Thêm vào Playlist">
                    <span class="material-icons-round text-sm">playlist_add</span>
                </button>
                <button class="w-8 h-8 rounded-full bg-primary/20 hover:bg-primary/40 flex items-center justify-center text-primary transition-colors">
                    <span class="material-icons-round text-sm">play_arrow</span>
                </button>
            </div>
            `;
        };

        window.loadFavorites = async () => {
            if (!window.currentUserUid) return;
            try {
                const res = await fetch(`/favorites?uid=${window.currentUserUid}`);
                myFavorites = await res.json();
                renderLibraryFavorites();
                updateAllFavIcons();
            } catch (e) { }
        };

        window.loadPlaylists = async () => {
            if (!window.currentUserUid) return;
            try {
                const res = await fetch(`/playlists?uid=${window.currentUserUid}`);
                myPlaylists = await res.json();
                renderLibraryPlaylists();
            } catch (e) { }
        };

        window.toggleFavorite = async (e, songStr) => {
            e.stopPropagation();
            if (!window.currentUserUid) {
                alert("Vui lòng đăng nhập để sử dụng tính năng Yêu thích!");
                return;
            }
            try {
                const formData = new FormData();
                formData.append('uid', window.currentUserUid);
                formData.append('song', decodeURIComponent(songStr));

                // Optimistic Update UI
                const song = JSON.parse(decodeURIComponent(songStr));
                const songId = song.link || song.file_url;
                const favIndex = myFavorites.findIndex(f => (f.link || f.file_url) === songId);
                if (favIndex >= 0) {
                    myFavorites.splice(favIndex, 1);
                } else {
                    myFavorites.unshift(song);
                }
                renderLibraryFavorites();
                updateAllFavIcons();

                await fetch('/favorites/toggle', { method: 'POST', body: formData });
            } catch (e) { }
        };

        window.updateAllFavIcons = () => {
            document.querySelectorAll('[data-fav-id]').forEach(el => {
                const id = el.getAttribute('data-fav-id');
                const isFav = myFavorites.some(f => (f.link || f.file_url) === id);
                el.innerText = isFav ? 'favorite' : 'favorite_border';
                el.classList.toggle('text-red-500', isFav);
            });
        };

        window.renderLibraryFavorites = () => {
            const container = document.getElementById('library-favorites-list');
            if (myFavorites.length === 0) {
                container.innerHTML = `
                    <div class="flex flex-col items-center justify-center h-40 opacity-50">
                        <span class="material-icons-round text-4xl mb-2">favorite_border</span>
                        <p class="text-xs">Chưa có bài hát yêu thích nào.</p>
                    </div>`;
                return;
            }
            container.innerHTML = myFavorites.map(song => buildSongCardHTML(song)).join('');
        };

        window.renderLibraryPlaylists = () => {
            const container = document.getElementById('library-playlists-list');
            if (myPlaylists.length === 0) {
                container.innerHTML = `
                    <div class="flex flex-col items-center justify-center h-40 opacity-50">
                        <span class="material-icons-round text-4xl mb-2">library_music</span>
                        <p class="text-xs">Chưa có playlist nào.</p>
                    </div>`;
                return;
            }
            container.innerHTML = myPlaylists.map(pl => `
                <div class="glass-card p-3 rounded-xl flex items-center justify-between cursor-pointer hover:bg-white/10 transition-colors" onclick="openPlaylistDetails('${pl.id}')">
                    <div class="flex items-center gap-3 min-w-0">
                        <div class="w-12 h-12 rounded-lg bg-black/30 flex items-center justify-center text-blue-400">
                            <span class="material-icons-round">queue_music</span>
                        </div>
                        <div class="min-w-0">
                            <h4 class="font-bold text-white text-sm truncate">${pl.name}</h4>
                            <p class="text-xs text-slate-400">${pl.songs.length} bài hát</p>
                        </div>
                    </div>
                </div>
            `).join('');
        };

        function buildSongCardHTML(item) {
            const mode = (item.type === 'youtube' || item.link) ? 'youtube' : 'local';
            const thumb = item.thumbnail || "https://cdn-icons-png.flaticon.com/512/12204/12204300.png";
            return `
            <div class="glass-card p-3 rounded-xl flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors border border-transparent hover:border-white/10"
                 onclick='playTrack(${JSON.stringify(item).replace(/'/g, "&#39;")}, "${mode}")'>
                <div class="flex items-center gap-3 min-w-0 flex-1 pr-2">
                    <img src="${thumb}" class="w-12 h-12 rounded-lg object-cover shadow-md bg-black/20">
                    <div class="min-w-0">
                        <h4 class="font-bold text-sm text-white truncate leading-tight mb-0.5">${item.title}</h4>
                        <p class="text-[10px] text-slate-400 font-bold uppercase tracking-wider">${mode === 'youtube' ? 'Youtube Music' : (item.style || 'Local Music')}</p>
                    </div>
                </div>
                ${window.getActionButtonsHTML(item, mode)}
            </div>`;
        }

        window.openPlaylistDetails = (playlistId) => {
            const pl = myPlaylists.find(p => p.id === playlistId);
            if (!pl) return;
            document.getElementById('playlist-details-title').innerText = pl.name;
            const container = document.getElementById('playlist-details-list');
            if (pl.songs.length === 0) {
                container.innerHTML = `<p class="text-center text-slate-500 text-[10px] py-4">Playlist rỗng.</p>`;
            } else {
                container.innerHTML = pl.songs.map(song => buildSongCardHTML(song)).join('');
            }
            document.getElementById('playlist-details-overlay').classList.remove('translate-x-full');
            updateAllFavIcons();
        };

        // Modal Logic
        window.openPlaylistModal = (e, songStr) => {
            e.stopPropagation();
            if (!window.currentUserUid) {
                alert("Vui lòng đăng nhập để thêm vào Playlist!");
                return;
            }
            songToPlaylist = decodeURIComponent(songStr);
            window.renderPlaylistModalList();
            document.getElementById('playlist-modal').classList.remove('opacity-0', 'pointer-events-none');
        };

        window.closePlaylistModal = () => {
            document.getElementById('playlist-modal').classList.add('opacity-0', 'pointer-events-none');
        };

        window.renderPlaylistModalList = () => {
            const container = document.getElementById('modal-playlists-list');
            if (myPlaylists.length === 0) {
                container.innerHTML = `<p class="text-slate-500 text-[10px] text-center italic py-2">Bạn chưa có playlist nào.</p>`;
                return;
            }
            container.innerHTML = myPlaylists.map(pl => {
                const songObj = JSON.parse(songToPlaylist);
                const songId = songObj.link || songObj.file_url;
                const isInPl = pl.songs.some(s => (s.link || s.file_url) === songId);
                return `
                <div class="flex items-center justify-between p-2 rounded-lg hover:bg-white/5 cursor-pointer" onclick="toggleSongInPlaylist('${pl.id}')">
                    <span class="text-xs text-white font-bold truncate pr-2">${pl.name}</span>
                    ${isInPl ? '<span class="material-icons-round text-sm text-green-400">check_circle</span>' : '<span class="material-icons-round text-sm text-slate-500 hover:text-white transition-colors">add_circle_outline</span>'}
                </div>
            `;
            }).join('');
        };

        window.createNewPlaylist = async (e) => {
            e.stopPropagation();
            const input = document.getElementById('new-playlist-name');
            const name = input.value.trim();
            if (!name) return;

            const formData = new FormData();
            formData.append('uid', window.currentUserUid);
            formData.append('name', name);

            try {
                const res = await fetch('/playlists', { method: 'POST', body: formData });
                const data = await res.json();
                if (data.status === 'success') {
                    myPlaylists.push(data.playlist);
                    input.value = '';
                    window.renderPlaylistModalList();
                    window.renderLibraryPlaylists();
                    // auto add current song to new playlist
                    if (songToPlaylist) {
                        await toggleSongInPlaylist(data.playlist.id);
                    }
                }
            } catch (err) { }
        };

        window.toggleSongInPlaylist = async (playlistId) => {
            if (!songToPlaylist) return;
            const formData = new FormData();
            formData.append('uid', window.currentUserUid);
            formData.append('playlist_id', playlistId);
            formData.append('song', songToPlaylist);

            try {
                // Optimistic UI update
                const pl = myPlaylists.find(p => p.id === playlistId);
                const songObj = JSON.parse(songToPlaylist);
                const songId = songObj.link || songObj.file_url;
                const idx = pl.songs.findIndex(s => (s.link || s.file_url) === songId);
                if (idx >= 0) pl.songs.splice(idx, 1);
                else pl.songs.push(songObj);
                window.renderPlaylistModalList();
                window.renderLibraryPlaylists();
                if (!document.getElementById('playlist-details-overlay').classList.contains('translate-x-full')) {
                    // refresh if details is open
                    openPlaylistDetails(playlistId);
                }

                await fetch('/playlists/song', { method: 'POST', body: formData });
            } catch (e) { }
        };


        // ==========================================
        // 8. FILM STATION LOGIC (OPHIM API)
        // ==========================================
        const FILM_PAGE_SIZE = 12; // 4 cols × 3 rows
        let filmCurrentCategory = 'all';
        let filmCurrentCategoryLabel = 'Phim Mới Cập Nhật';
        let filmCurrentPage = 1;
        let filmTotalPages = 1;
        let filmCurrentEndpoint = 'https://ophim1.com/v1/api/danh-sach/phim-moi-cap-nhat';
        let filmIsSearchMode = false;
        let filmCurrentYearFilter = null;
        window.filmAdvCriteria = null; // Stored as { genre, country, year }

        // Build a film card HTML snippet
        function buildFilmCard(m, imgDomain) {
            const thumbSrc = m.thumb_url
                ? (m.thumb_url.startsWith('http') ? m.thumb_url : `${imgDomain}/uploads/movies/${m.thumb_url}`)
                : 'https://via.placeholder.com/300x450/111/fff?text=No+Image';
            const typeBadge = m.type === 'series'
                ? '<span class="absolute top-1.5 left-1.5 bg-blue-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-wider">BỘ</span>'
                : m.type === 'hoathinh'
                    ? '<span class="absolute top-1.5 left-1.5 bg-purple-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-wider">HH</span>'
                    : '<span class="absolute top-1.5 left-1.5 bg-green-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-wider">LẺ</span>';
            
            // Thêm tag Trailer nếu chưa có bản full
            const isTrailer = (m.episode_current && m.episode_current.toLowerCase().includes('trailer')) || (m.status === 'trailer');
            const trailerBadge = isTrailer
                ? '<span class="absolute top-1.5 right-1.5 bg-red-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-wider z-10 shadow-lg shadow-red-600/50">TRAILER</span>'
                : '';

            const nameSafe = (m.name || '').replace(/'/g, "&#39;");
            return `
            <div class="glass-card rounded-xl overflow-hidden cursor-pointer hover:border-primary/50 border border-white/5 transition-all hover:scale-[1.02] shadow-sm group"
                 onclick="streamFilmOphim('${m.slug}', '${nameSafe}')">
                <div class="aspect-[2/3] relative bg-black/50">
                    <img src="${thumbSrc}" onerror="this.src='https://via.placeholder.com/300x450/111/333?text=Film'"
                        class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy">
                    <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
                    <div class="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <span class="material-icons-round text-white text-4xl drop-shadow-lg">${isTrailer ? 'videocam' : 'play_circle'}</span>
                    </div>
                    ${typeBadge}
                    ${trailerBadge}
                    ${m.year ? `<span class="absolute bottom-1.5 right-1.5 bg-black/60 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-md">${m.year}</span>` : ''}
                </div>
                <div class="p-2">
                    <p class="text-[10px] text-white font-bold truncate leading-tight">${m.name || ''}</p>
                    <p class="text-[9px] text-slate-500 truncate mt-0.5">${m.origin_name || ''}</p>
                </div>
            </div>`;
        }

        // Render film grid
        function renderFilmGrid(items, imgDomain) {
            const grid = document.getElementById('film-main-grid');
            if (!grid) return;
            if (!items || items.length === 0) {
                grid.innerHTML = `<div class="col-span-full text-center py-10 text-slate-500 text-sm">Không có phim nào trong danh mục này.</div>`;
                return;
            }
            grid.innerHTML = items.map(m => buildFilmCard(m, imgDomain)).join('');
        }

        // Update pagination UI
        function updateFilmPagination() {
            const prevBtn = document.getElementById('film-prev-btn');
            const nextBtn = document.getElementById('film-next-btn');
            const pageInfo = document.getElementById('film-page-info');
            const dots = document.getElementById('film-page-dots');

            if (prevBtn) prevBtn.disabled = filmCurrentPage <= 1;
            if (nextBtn) nextBtn.disabled = filmCurrentPage >= filmTotalPages;
            if (pageInfo) pageInfo.textContent = `Trang ${filmCurrentPage} / ${filmTotalPages}`;

            if (dots) {
                const maxDots = 5;
                let start = Math.max(1, filmCurrentPage - 2);
                let end = Math.min(filmTotalPages, start + maxDots - 1);
                start = Math.max(1, end - maxDots + 1);
                let html = '';
                for (let i = start; i <= end; i++) {
                    html += `<button onclick="filmGoToPage(${i})"
                        class="w-8 h-8 rounded-lg text-[10px] font-bold transition-all ${i === filmCurrentPage ? 'bg-primary text-[#0a0a0a]' : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'}">${i}</button>`;
                }
                dots.innerHTML = html;
            }
        }

        // Load film grid page
        async function loadFilmGrid(page = 1) {
            filmCurrentPage = page;
            filmIsSearchMode = false;
            const grid = document.getElementById('film-main-grid');
            const searchResults = document.getElementById('film-search-results');
            if (searchResults) searchResults.classList.add('hidden');
            if (grid) {
                grid.classList.remove('hidden');
                grid.innerHTML = `<div class="col-span-full text-center py-10 text-primary text-sm flex items-center justify-center gap-2"><span class="material-icons-round animate-spin">sync</span> Đang tải phim...</div>`;
            }

            // Pagination management
            const paginationEl = document.getElementById('film-pagination');
            const pageInfoEl = document.getElementById('film-page-info');

            try {
                let items = [];
                let imgDomain = 'https://img.ophim.live';
                let apiPagination = {};
                let attempts = 0;
                let currentApiPage = page;
                const MAX_ATTEMPTS = window.filmAdvCriteria ? 10 : 1;
                const API_LIMIT = window.filmAdvCriteria ? 72 : FILM_PAGE_SIZE;

                while (items.length < FILM_PAGE_SIZE && attempts < MAX_ATTEMPTS) {
                    if (window.filmAdvCriteria && grid) {
                        grid.innerHTML = `<div class="col-span-full text-center py-10 text-primary text-sm flex flex-col items-center gap-3">
                            <span class="material-icons-round animate-spin text-3xl">sync</span>
                            <div class="font-bold">Đang quét kho phim (Trang ${attempts + 1}/${MAX_ATTEMPTS})...</div>
                            <div class="text-[10px] text-slate-500 uppercase tracking-widest">Đã tìm thấy ${items.length} phim khớp</div>
                        </div>`;
                    }
                    
                    let url = `${filmCurrentEndpoint}?page=${currentApiPage}&limit=${API_LIMIT}`;
                    const res = await fetch(url);
                    const data = await res.json();
                    
                    imgDomain = data.data?.APP_DOMAIN_CDN_IMAGE || 'https://img.ophim.live';
                    let rawItems = data.data?.items || data.items || [];
                    apiPagination = data.data?.params?.pagination || {};

                    // Filtering
                    let filtered = [...rawItems];
                    if (window.filmAdvCriteria) {
                        const { genre, country, year } = window.filmAdvCriteria;
                        if (genre) filtered = filtered.filter(m => m.category && m.category.some(c => c.slug === genre));
                        if (country) filtered = filtered.filter(m => m.country && m.country.some(c => c.slug === country));
                        if (year) filtered = filtered.filter(m => m.year == year);
                    } else if (filmCurrentYearFilter) {
                        filtered = filtered.filter(m => m.year == filmCurrentYearFilter);
                    }

                    items = [...items, ...filtered];
                    attempts++;
                    currentApiPage++;
                    
                    // Stop if no more API pages
                    if (currentApiPage > (apiPagination.totalPages || 999)) break;
                }

                // Slice to exact page size for UI consistency
                const displayItems = items.slice(0, FILM_PAGE_SIZE);

                if (displayItems.length === 0) {
                    if (grid) grid.innerHTML = `
                        <div class="col-span-full text-center py-20 animate-fade-in">
                            <span class="material-icons-round text-6xl text-slate-700 mb-4">search_off</span>
                            <h3 class="text-white font-bold text-lg">Không tìm thấy phim</h3>
                            <p class="text-slate-500 text-sm mt-1">Thử thay đổi bộ lọc hoặc tiêu chí khác bạn nhé!</p>
                            <button onclick="switchFilmCategory('all')" class="mt-6 px-6 py-2 bg-primary/10 text-primary border border-primary/20 rounded-full text-xs font-black uppercase hover:bg-primary/20 transition-all">Xem Phim Mới</button>
                        </div>
                    `;
                    if (paginationEl) paginationEl.classList.add('hidden');
                } else {
                    renderFilmGrid(displayItems, imgDomain);
                    if (paginationEl) paginationEl.classList.remove('hidden');
                    
                    // Correct total pages for filtered mode is complex, using API total as reference
                    filmTotalPages = apiPagination.totalPages || 1;
                    updateFilmPagination();
                    
                    if (window.filmAdvCriteria && pageInfoEl) {
                        pageInfoEl.textContent = `Kết quả khớp: ${displayItems.length}+ (Trang ${page})`;
                        pageInfoEl.classList.add('text-primary');
                    }
                }
            } catch (err) {
                console.error("Load Grid Error:", err);
                if (grid) grid.innerHTML = `<div class="col-span-full text-center py-10 text-red-400 text-sm">Lỗi kết nối OPhim API. Vui lòng thử lại.</div>`;
            }
        }

        // Change page (delta = +1 or -1)
        window.filmChangePage = (delta) => {
            const newPage = filmCurrentPage + delta;
            if (newPage >= 1 && newPage <= filmTotalPages) loadFilmGrid(newPage);
        };

        // Go to specific page
        window.filmGoToPage = (page) => loadFilmGrid(page);

        // Switch main category tabs
        window.switchFilmCategory = (cat) => {
            filmCurrentCategory = cat;
            filmCurrentYearFilter = null;
            window.filmAdvCriteria = null;
            // Update tab styles
            document.querySelectorAll('.film-cat-tab').forEach(b => {
                b.classList.remove('bg-white/10', 'text-white', 'shadow-inner', 'border-white/20');
                b.classList.add('bg-transparent', 'text-slate-400', 'border-transparent');
            });
            const activeTab = document.getElementById(`film-tab-${cat}`);
            if (activeTab) {
                activeTab.classList.add('bg-white/10', 'text-white', 'shadow-inner', 'border-white/20');
                activeTab.classList.remove('bg-transparent', 'text-slate-400', 'border-transparent');
            }

            const catMap = {
                'all': { url: 'https://ophim1.com/v1/api/danh-sach/phim-moi-cap-nhat', label: 'Phim Mới Cập Nhật', sub: 'Tổng hợp phim mới nhất' },
                'phim-le': { url: 'https://ophim1.com/v1/api/danh-sach/phim-le', label: 'Phim Lẻ 🎥', sub: 'Phim chiếu rạp & phim lẻ' },
                'phim-bo': { url: 'https://ophim1.com/v1/api/danh-sach/phim-bo', label: 'Phim Bộ 📺', sub: 'Series phim nhiều tập' },
                'hoat-hinh': { url: 'https://ophim1.com/v1/api/danh-sach/hoat-hinh', label: 'Hoạt Hình 🎨', sub: 'Anime & phim hoạt hình' },
                'tv-shows': { url: 'https://ophim1.com/v1/api/danh-sach/tv-shows', label: 'TV Shows 📡', sub: 'Chương trình truyền hình' },
                'chieu-rap': { url: 'https://ophim1.com/v1/api/danh-sach/phim-sap-chieu', label: 'Chiếu Rạp 🎬', sub: 'Phim sắp chiếu & đang chiếu rạp' },
            };
            const info = catMap[cat] || catMap['all'];
            filmCurrentEndpoint = info.url;
            const titleEl = document.getElementById('film-grid-title');
            const subEl = document.getElementById('film-grid-subtitle');
            if (titleEl) titleEl.innerHTML = `<span class="material-icons-round text-primary text-lg">local_fire_department</span> ${info.label}`;
            if (subEl) subEl.textContent = info.sub;
            // Clear search
            const si = document.getElementById('film-search-input');
            if (si) si.value = '';
            loadFilmGrid(1);
        };

        // Switch subtitle filter (vietsub/thuyet-minh)
        window.switchFilmSubCat = (sub) => {
            document.querySelectorAll('.film-cat-tab').forEach(b => {
                b.classList.remove('bg-white/10', 'text-white', 'shadow-inner', 'border-white/20');
                b.classList.add('bg-transparent', 'text-slate-400', 'border-transparent');
            });
            const activeTab = document.getElementById(`film-tab-${sub}`);
            if (activeTab) {
                activeTab.classList.add('bg-white/10', 'text-white', 'shadow-inner', 'border-white/20');
                activeTab.classList.remove('bg-transparent', 'text-slate-400', 'border-transparent');
            }

            const subMap = {
                'vietsub': { url: 'https://ophim1.com/v1/api/danh-sach/phim-vietsub', label: 'Phim Vietsub 🇻🇳', sub: 'Phụ đề Tiếng Việt' },
                'thuyet-minh': { url: 'https://ophim1.com/v1/api/danh-sach/phim-thuyet-minh', label: 'Phim Thuyết Minh 🎙️', sub: 'Lồng tiếng Tiếng Việt' },
            };
            const info = subMap[sub] || subMap['vietsub'];
            filmCurrentEndpoint = info.url;
            filmCurrentYearFilter = null;
            window.filmAdvCriteria = null;
            const titleEl = document.getElementById('film-grid-title');
            const subEl = document.getElementById('film-grid-subtitle');
            if (titleEl) titleEl.innerHTML = `<span class="material-icons-round text-primary text-lg">subtitles</span> ${info.label}`;
            if (subEl) subEl.textContent = info.sub;
            const si = document.getElementById('film-search-input');
            if (si) si.value = '';
            loadFilmGrid(1);
        };

        // Genre List based on OPhim & User Screenshot
        const filmGenres = [
            { name: "Hành Động", slug: "hanh-dong", icon: "bolt" },
            { name: "Tình Cảm", slug: "tinh-cam", icon: "favorite" },
            { name: "Hài Hước", slug: "hai-huoc", icon: "sentiment_very_satisfied" },
            { name: "Cổ Trang", slug: "co-trang", icon: "temple_base" },
            { name: "Tâm Lý", slug: "tam-ly", icon: "psychology" },
            { name: "Hình Sự", slug: "hinh-su", icon: "local_police" },
            { name: "Chiến Tranh", slug: "chien-tranh", icon: "military_tech" },
            { name: "Thể Thao", slug: "the-thao", icon: "sports_soccer" },
            { name: "Võ Thuật", slug: "vo-thuat", icon: "sports_martial_arts" },
            { name: "Hoạt Hình", slug: "hoat-hinh", icon: "animation" },
            { name: "Viễn Tưởng", slug: "vien-tuong", icon: "rocket_launch" },
            { name: "Phiêu Lưu", slug: "phieu-luu", icon: "explore" },
            { name: "Khoa Học", slug: "khoa-hoc", icon: "science" },
            { name: "Kinh Dị", slug: "kinh-di", icon: "skull" },
            { name: "Âm Nhạc", slug: "am-nhac", icon: "music_note" },
            { name: "Thần Thoại", slug: "than-thoai", icon: "auto_stories" },
            { name: "Gia Đình", slug: "gia-dinh", icon: "family_restroom" },
            { name: "Học Đường", slug: "hoc-duong", icon: "school" },
            { name: "Tài Liệu", slug: "tai-lieu", icon: "description" },
            { name: "Lịch Sử", slug: "lich-su", icon: "history_edu" },
            { name: "Gây Cấn", slug: "gay-can", icon: "speed" },
            { name: "Kinh Điển", slug: "kinh-dien", icon: "star" },
            { name: "Phim Lẻ", slug: "phim-le", icon: "movie" },
            { name: "Phim Bộ", slug: "phim-bo", icon: "tv" },
            { name: "TV Shows", slug: "tv-shows", icon: "live_tv" }
        ];

        window.openGenreMenu = () => {
            if (!window.advFiltersInited) initAdvancedFilters();
            const m = document.getElementById('genre-modal');
            const grid = document.getElementById('genre-grid');
            if (m && grid) {
                grid.innerHTML = filmGenres.map(g => `
                    <button onclick="searchFilmByGenre('${g.slug}', '${g.name}')" 
                        class="bg-white/5 border border-white/5 hover:border-primary/50 hover:bg-primary/10 p-4 rounded-2xl flex flex-col items-center gap-3 transition-all group active:scale-95">
                        <div class="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                            <span class="material-icons-round text-slate-400 group-hover:text-primary transition-colors text-xl">${g.icon}</span>
                        </div>
                        <span class="text-[11px] font-bold text-slate-300 group-hover:text-white uppercase tracking-wider">${g.name}</span>
                    </button>
                `).join('');
                m.classList.remove('hidden');
                m.classList.add('flex');
            }
        };

        window.closeGenreMenu = () => {
            const m = document.getElementById('genre-modal');
            if (m) {
                m.classList.add('hidden');
                m.classList.remove('flex');
            }
        };

        // Quick genre filter
        window.searchFilmByGenre = async (genre, label = "") => {
            closeGenreMenu();
            const titleEl = document.getElementById('film-grid-title');
            const subEl = document.getElementById('film-grid-subtitle');
            const displayLabel = label || genre.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

            if (titleEl) titleEl.innerHTML = `<span class="material-icons-round text-primary text-lg">grid_view</span> Thể loại: ${displayLabel}`;
            if (subEl) subEl.textContent = `Khám phá các phim thuộc nhóm ${displayLabel}`;

            filmCurrentEndpoint = `https://ophim1.com/v1/api/the-loai/${genre}`;
            filmCurrentYearFilter = null;
            window.filmAdvCriteria = null;

            // Reset tab styles
            document.querySelectorAll('.film-cat-tab').forEach(b => {
                b.classList.remove('bg-white/10', 'text-white', 'shadow-inner', 'border-white/20');
                b.classList.add('bg-transparent', 'text-slate-400', 'border-transparent');
            });
            const genreTab = document.getElementById('film-tab-genre');
            if (genreTab) {
                genreTab.classList.add('bg-white/10', 'text-white', 'shadow-inner', 'border-white/20');
                genreTab.classList.remove('bg-transparent', 'text-slate-400', 'border-transparent');
            }

            loadFilmGrid(1);
        };

        // ===== COUNTRY FILTER =====
        const filmCountries = [
            { name: "Hàn Quốc", slug: "han-quoc", flag: "🇰🇷" },
            { name: "Trung Quốc", slug: "trung-quoc", flag: "🇨🇳" },
            { name: "Nhật Bản", slug: "nhat-ban", flag: "🇯🇵" },
            { name: "Thái Lan", slug: "thai-lan", flag: "🇹🇭" },
            { name: "Âu Mỹ", slug: "au-my", flag: "🇺🇸" },
            { name: "Đài Loan", slug: "dai-loan", flag: "🇹🇼" },
            { name: "Hồng Kông", slug: "hong-kong", flag: "🇭🇰" },
            { name: "Ấn Độ", slug: "an-do", flag: "🇮🇳" },
            { name: "Anh", slug: "anh", flag: "🇬🇧" },
            { name: "Pháp", slug: "phap", flag: "🇫🇷" },
            { name: "Đức", slug: "duc", flag: "🇩🇪" },
            { name: "Tây Ban Nha", slug: "tay-ban-nha", flag: "🇪🇸" },
            { name: "Việt Nam", slug: "viet-nam", flag: "🇻🇳" },
            { name: "Indonesia", slug: "indonesia", flag: "🇮🇩" },
            { name: "Philippines", slug: "philippines", flag: "🇵🇭" },
            { name: "Canada", slug: "canada", flag: "🇨🇦" },
            { name: "Nga", slug: "nga", flag: "🇷🇺" },
            { name: "Úc", slug: "uc", flag: "🇦🇺" },
            { name: "Brazil", slug: "brazil", flag: "🇧🇷" },
            { name: "Ý", slug: "y", flag: "🇮🇹" },
        ];

        window.openCountryMenu = () => {
            const m = document.getElementById('country-modal');
            const grid = document.getElementById('country-grid');
            if (m && grid) {
                grid.innerHTML = filmCountries.map(c => `
                    <button onclick="searchFilmByCountry('${c.slug}', '${c.name}')" 
                        class="bg-white/5 border border-white/5 hover:border-primary/50 hover:bg-primary/10 p-4 rounded-2xl flex flex-col items-center gap-3 transition-all group active:scale-95">
                        <div class="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center group-hover:bg-primary/20 transition-colors text-2xl">
                            ${c.flag}
                        </div>
                        <span class="text-[11px] font-bold text-slate-300 group-hover:text-white uppercase tracking-wider">${c.name}</span>
                    </button>
                `).join('');
                m.classList.remove('hidden');
                m.classList.add('flex');
            }
        };

        window.closeCountryMenu = () => {
            const m = document.getElementById('country-modal');
            if (m) {
                m.classList.add('hidden');
                m.classList.remove('flex');
            }
        };

        window.searchFilmByCountry = async (country, label = "") => {
            closeCountryMenu();
            const titleEl = document.getElementById('film-grid-title');
            const subEl = document.getElementById('film-grid-subtitle');
            const displayLabel = label || country.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

            if (titleEl) titleEl.innerHTML = `<span class="material-icons-round text-primary text-lg">public</span> Quốc gia: ${displayLabel}`;
            if (subEl) subEl.textContent = `Phim từ ${displayLabel}`;

            filmCurrentEndpoint = `https://ophim1.com/v1/api/quoc-gia/${country}`;
            filmCurrentYearFilter = null;
            window.filmAdvCriteria = null;

            document.querySelectorAll('.film-cat-tab').forEach(b => {
                b.classList.remove('bg-white/10', 'text-white', 'shadow-inner', 'border-white/20');
                b.classList.add('bg-transparent', 'text-slate-400', 'border-transparent');
            });
            const countryTab = document.getElementById('film-tab-country');
            if (countryTab) {
                countryTab.classList.add('bg-white/10', 'text-white', 'shadow-inner', 'border-white/20');
                countryTab.classList.remove('bg-transparent', 'text-slate-400', 'border-transparent');
            }

            loadFilmGrid(1);
        };

        // ===== YEAR FILTER =====
        window.openYearMenu = () => {
            const m = document.getElementById('year-modal');
            const grid = document.getElementById('year-grid');
            if (m && grid) {
                const currentYear = new Date().getFullYear();
                let html = '';
                for (let y = currentYear; y >= 2000; y--) {
                    html += `
                        <button onclick="searchFilmByYear(${y})" 
                            class="bg-white/5 border border-white/5 hover:border-amber-400/50 hover:bg-amber-400/10 p-3 rounded-xl flex items-center justify-center transition-all group active:scale-95">
                            <span class="text-sm font-bold text-slate-300 group-hover:text-amber-400 tracking-wider">${y}</span>
                        </button>`;
                }
                grid.innerHTML = html;
                m.classList.remove('hidden');
                m.classList.add('flex');
            }
        };

        window.closeYearMenu = () => {
            const m = document.getElementById('year-modal');
            if (m) {
                m.classList.add('hidden');
                m.classList.remove('flex');
            }
        };

        window.searchFilmByYear = async (year) => {
            closeYearMenu();
            const titleEl = document.getElementById('film-grid-title');
            const subEl = document.getElementById('film-grid-subtitle');

            if (titleEl) titleEl.innerHTML = `<span class="material-icons-round text-amber-400 text-lg">calendar_month</span> Năm: ${year}`;
            if (subEl) subEl.textContent = `Phim phát hành năm ${year}`;

            // OPhim supports year filter via query param
            filmCurrentEndpoint = `https://ophim1.com/v1/api/danh-sach/phim-moi-cap-nhat`;
            filmCurrentYearFilter = year;
            window.filmAdvCriteria = null;

            document.querySelectorAll('.film-cat-tab').forEach(b => {
                b.classList.remove('bg-white/10', 'text-white', 'shadow-inner', 'border-white/20');
                b.classList.add('bg-transparent', 'text-slate-400', 'border-transparent');
            });
            const yearTab = document.getElementById('film-tab-year');
            if (yearTab) {
                yearTab.classList.add('bg-white/10', 'text-white', 'shadow-inner', 'border-white/20');
                yearTab.classList.remove('bg-transparent', 'text-slate-400', 'border-transparent');
            }

            loadFilmGrid(1);
        };


        window.toggleGachaModal = () => {
            const m = document.getElementById('gacha-modal');
            if (m) {
                m.classList.toggle('hidden');
                if (!m.classList.contains('hidden')) m.classList.add('flex');
                else m.classList.remove('flex');
            }
        };

        window.rollFilmGacha = async (count) => {
            toggleGachaModal();
            filmIsSearchMode = true;
            const grid = document.getElementById('film-main-grid');
            const searchResults = document.getElementById('film-search-results');
            const titleEl = document.getElementById('film-grid-title');
            const subEl = document.getElementById('film-grid-subtitle');
            const pageInfo = document.getElementById('film-page-info');
            const pagination = document.getElementById('film-pagination');

            if (grid) grid.classList.add('hidden');
            if (searchResults) {
                searchResults.classList.remove('hidden');
                searchResults.innerHTML = `
                    <div class="col-span-full h-96 flex flex-col items-center justify-center text-center">
                        <div class="w-24 h-24 relative mb-6">
                            <div class="absolute inset-0 border-4 border-primary/20 rounded-full"></div>
                            <div class="absolute inset-0 border-4 border-primary rounded-full border-t-transparent animate-spin"></div>
                            <span class="material-icons-round text-primary text-4xl absolute inset-0 flex items-center justify-center animate-pulse">casino</span>
                        </div>
                        <h4 class="text-xl font-bold text-white mb-2">Đang gieo quẻ...</h4>
                        <p class="text-slate-500 text-sm">Vận may đang đến với bạn!</p>
                    </div>
                `;
            }
            if (titleEl) titleEl.innerHTML = `<span class="material-icons-round text-orange-500 text-lg">casino</span> Kết quả Gacha x${count}`;
            if (subEl) subEl.textContent = 'Phim ngẫu nhiên dành riêng cho bạn';
            if (pageInfo) pageInfo.textContent = '';
            if (pagination) pagination.classList.add('hidden');

            try {
                let rolledMovies = [];
                // Tăng độ phủ bằng cách lấy ngẫu nhiên trong 400 trang đầu (an toàn hơn 500)
                const fetchPromises = Array.from({ length: count }, () => {
                    const randomPage = Math.floor(Math.random() * 400) + 1;
                    return fetch(`https://ophim1.com/v1/api/danh-sach/phim-moi-cap-nhat?page=${randomPage}`).then(r => r.json());
                });

                const results = await Promise.all(fetchPromises);
                results.forEach(res => {
                    // Fix path data v1
                    const apiData = res.data || res;
                    const items = apiData.items || [];
                    if (items.length > 0) {
                        const randomIdx = Math.floor(Math.random() * items.length);
                        const imgDomain = apiData.APP_DOMAIN_CDN_IMAGE || apiData.pathImage || 'https://img.ophim.live';
                        rolledMovies.push({ ...items[randomIdx], imgDomain: imgDomain });
                    }
                });

                if (rolledMovies.length > 0) {
                    searchResults.innerHTML = '';
                    rolledMovies.forEach((m, idx) => {
                        const cardHtml = buildFilmCard(m, m.imgDomain);
                        const wrapper = document.createElement('div');
                        wrapper.className = 'gacha-item-reveal';
                        wrapper.style.animationDelay = `${idx * 0.15}s`;
                        wrapper.innerHTML = cardHtml;
                        searchResults.appendChild(wrapper);
                    });
                    // Scroll to results
                    titleEl.scrollIntoView({ behavior: 'smooth' });
                } else {
                    searchResults.innerHTML = '<div class="col-span-full text-center text-slate-500 py-20"><div class="text-4xl mb-4">🌪️</div><p>Ối, có chút trục trặc khi quay. Bạn thử quay lại phát nữa xem sao!</p><button onclick="toggleGachaModal()" class="mt-4 px-6 py-2 bg-primary text-[#0a0a0a] rounded-full font-bold">Thử Lại</button></div>';
                }
            } catch (err) {
                console.error("Gacha Error:", err);
                searchResults.innerHTML = '<div class="col-span-full text-center text-red-500 py-8 text-xs">Lỗi kết nối kho phim. Vui lòng thử lại sau!</div>';
            }
        };

        // Search (shows in main grid area)
        window.searchFilmOphim = async (e) => {
            if (e) e.preventDefault();
            const input = document.getElementById('film-search-input');
            const keyword = input.value.trim();
            if (!keyword) return;

            filmIsSearchMode = true;
            const grid = document.getElementById('film-main-grid');
            const searchResults = document.getElementById('film-search-results');
            const titleEl = document.getElementById('film-grid-title');
            const subEl = document.getElementById('film-grid-subtitle');
            const pageInfo = document.getElementById('film-page-info');

            // Hide main grid, show search results area
            if (grid) grid.classList.add('hidden');
            if (searchResults) {
                searchResults.classList.remove('hidden');
                searchResults.innerHTML = '<div class="col-span-full text-center text-primary py-6 flex items-center justify-center gap-2"><span class="material-icons-round animate-spin">sync</span> Đang tìm kiếm...</div>';
            }
            if (titleEl) titleEl.innerHTML = `<span class="material-icons-round text-primary text-lg">search</span> Kết quả tìm: "${keyword}"`;
            if (subEl) subEl.textContent = 'Danh sách phim tìm được';
            if (pageInfo) pageInfo.textContent = '';
            // Hide pagination in search mode
            const pagination = document.getElementById('film-pagination');
            if (pagination) pagination.classList.add('hidden');

            try {
                const res = await fetch(`https://ophim1.com/v1/api/tim-kiem?keyword=${encodeURIComponent(keyword)}&limit=12`);
                const data = await res.json();

                if (data.status === 'success' && data.data && data.data.items.length > 0) {
                    const imgDomain = data.data.APP_DOMAIN_CDN_IMAGE || 'https://img.ophim.live';
                    searchResults.innerHTML = data.data.items.map(m => buildFilmCard(m, imgDomain)).join('');
                } else {
                    searchResults.innerHTML = '<div class="col-span-full text-center text-slate-500 py-8 text-sm">Không tìm thấy phim. Hãy thử tên khác!</div>';
                }
            } catch (err) {
                searchResults.innerHTML = '<div class="col-span-full text-center text-red-500 py-8 text-xs">Lỗi kết nối API OPhim.</div>';
            }
        };

        // --- ADVANCED FILTER COMPONENT (NEW) ---
        window.advFiltersInited = false;
        window.initAdvancedFilters = () => {
            const genreSelect = document.getElementById('adv-filter-genre');
            const countrySelect = document.getElementById('adv-filter-country');
            const yearSelect = document.getElementById('adv-filter-year');

            if (!genreSelect || !countrySelect || !yearSelect) return;

            genreSelect.innerHTML = '<option value="">Tất cả thể loại</option>';
            countrySelect.innerHTML = '<option value="">Tất cả quốc gia</option>';
            yearSelect.innerHTML = '<option value="">Tất cả năm</option>';

            if (typeof filmGenres !== 'undefined') {
                genreSelect.innerHTML += filmGenres.map(g => `<option value="${g.slug}">${g.name}</option>`).join('');
            }
            if (typeof filmCountries !== 'undefined') {
                countrySelect.innerHTML += filmCountries.map(c => `<option value="${c.slug}">${c.name}</option>`).join('');
            }
            
            const currentYear = new Date().getFullYear();
            let yearHtml = '';
            for (let y = currentYear; y >= 2000; y--) {
                yearHtml += `<option value="${y}">${y}</option>`;
            }
            yearSelect.innerHTML += yearHtml;
            
            window.advFiltersInited = true;
        };

        window.applyAdvancedFilter = async () => {
            const typeSelect = document.getElementById('adv-filter-type');
            const genreSelect = document.getElementById('adv-filter-genre');
            const countrySelect = document.getElementById('adv-filter-country');
            const yearSelect = document.getElementById('adv-filter-year');

            if (!typeSelect) return;

            const type = typeSelect.value;
            const genre = genreSelect ? genreSelect.value : "";
            const country = countrySelect ? countrySelect.value : "";
            const year = yearSelect ? yearSelect.value : "";

            filmCurrentYearFilter = year || null;
            window.filmAdvCriteria = { genre, country, year };

            // Optimization: Start from the most specific endpoint
            // Usually Country or Genre are more specific than a general Category (Type)
            if (country) {
                filmCurrentEndpoint = `https://ophim1.com/v1/api/quoc-gia/${country}`;
            } else if (genre) {
                filmCurrentEndpoint = `https://ophim1.com/v1/api/the-loai/${genre}`;
            } else if (type !== 'all') {
                const catMap = {
                    'phim-le': 'https://ophim1.com/v1/api/danh-sach/phim-le',
                    'phim-bo': 'https://ophim1.com/v1/api/danh-sach/phim-bo',
                    'hoat-hinh': 'https://ophim1.com/v1/api/danh-sach/hoat-hinh',
                    'tv-shows': 'https://ophim1.com/v1/api/danh-sach/tv-shows',
                    'chieu-rap': 'https://ophim1.com/v1/api/danh-sach/phim-sap-chieu'
                };
                filmCurrentEndpoint = catMap[type] || 'https://ophim1.com/v1/api/danh-sach/phim-moi-cap-nhat';
            } else {
                filmCurrentEndpoint = 'https://ophim1.com/v1/api/danh-sach/phim-moi-cap-nhat';
            }

            const titleEl = document.getElementById('film-grid-title');
            const subEl = document.getElementById('film-grid-subtitle');
            if (titleEl) titleEl.innerHTML = `<span class="material-icons-round text-primary text-lg">filter_alt</span> Kết quả lọc phim`;
            if (subEl) subEl.textContent = 'Danh sách phim khớp với các tiêu chí đã chọn';

            // Reset tab styles
            document.querySelectorAll('.film-cat-tab').forEach(b => {
                b.classList.remove('bg-white/10', 'text-white', 'shadow-inner', 'border-white/20');
                b.classList.add('bg-transparent', 'text-slate-400', 'border-transparent');
            });

            loadFilmGrid(1);
        };

        // Initialize Advanced Filters
        setTimeout(() => { if (!window.advFiltersInited) window.initAdvancedFilters(); }, 1500);

        let currentFilmSlug = null;
        let currentFilmData = null;

        window.renderFilmQualities = (hls, levels) => {
            const controls = document.getElementById('film-player-controls');
            const qCont = document.getElementById('film-quality-container');
            const qList = document.getElementById('film-quality-list');

            if (levels && levels.length > 1) {
                controls.classList.remove('hidden');
                qCont.classList.remove('hidden');
                qCont.classList.add('flex');

                let html = `<button onclick="setFilmQuality(-1)" class="film-q-btn px-3 py-1.5 rounded-lg border border-white/10 text-xs font-bold bg-primary text-[#0a0a0a]" data-q="-1">Auto</button>`;

                levels.forEach((lvl, idx) => {
                    const height = lvl.height ? `${lvl.height}p` : `Lvl ${idx}`;
                    html += `<button onclick="setFilmQuality(${idx})" class="film-q-btn px-3 py-1.5 rounded-lg border border-white/10 text-xs font-bold bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition-colors" data-q="${idx}">${height}</button>`;
                });

                qList.innerHTML = html;
            } else {
                qCont.classList.add('hidden');
                qCont.classList.remove('flex');
            }

            if (document.getElementById('film-episodes-container').classList.contains('hidden') && qCont.classList.contains('hidden')) {
                controls.classList.add('hidden');
            }
        };

        window.setFilmQuality = (idx) => {
            if (window.currentHls) {
                window.currentHls.currentLevel = idx;
                document.querySelectorAll('.film-q-btn').forEach(b => {
                    if (parseInt(b.dataset.q) === idx) {
                        b.classList.add('bg-primary', 'text-[#0a0a0a]');
                        b.classList.remove('bg-white/5', 'text-slate-400');
                    } else {
                        b.classList.remove('bg-primary', 'text-[#0a0a0a]');
                        b.classList.add('bg-white/5', 'text-slate-400');
                    }
                });
            }
        };

        window.streamFilmOphim = async (slug, titleHint = "", epIndex = 0) => {
            const placeholder = document.getElementById('film-pl-placeholder');
            const output = document.getElementById('film-output');
            const controls = document.getElementById('film-player-controls');
            const epCont = document.getElementById('film-episodes-container');
            const epList = document.getElementById('film-episodes-list');
            const qCont = document.getElementById('film-quality-container');

            if (currentFilmSlug !== slug) {
                placeholder.innerHTML = `<span class="material-icons-round text-5xl mb-2 opacity-50 animate-spin text-primary">sync</span><p class="text-sm font-bold">Đang kết nối server phim...</p><p class="text-[10px] text-slate-400 mt-2">Server OPhim có thể phản hồi chậm, vui lòng đợi...</p>`;
                placeholder.classList.remove('hidden');
                output.classList.add('hidden');
                output.innerHTML = '';

                const filmView = document.getElementById('view-film');
                if (filmView) filmView.scrollIntoView({ behavior: 'smooth' });

                if (controls) controls.classList.add('hidden');
                const infoCont = document.getElementById('film-info-container');
                if (infoCont) infoCont.classList.add('hidden');
                const commentsCont = document.getElementById('film-comments-section');
                if (commentsCont) commentsCont.classList.add('hidden');

                if (window.currentHls) {
                    window.currentHls.destroy();
                    window.currentHls = null;
                }
            }

            try {
                let data;
                if (currentFilmSlug === slug && currentFilmData) {
                    data = currentFilmData;
                    // Keep output visible since we are just changing episode
                    output.innerHTML = '';
                } else {
                    const res = await fetch(`https://ophim1.com/phim/${slug}`);
                    data = await res.json();
                    currentFilmData = data;
                    currentFilmSlug = slug;
                }

                if (data.status === true && data.episodes && data.episodes.length > 0) {
                    const eps = data.episodes[0].server_data;
                    if (eps && eps.length > 0) {
                        const actualEpIndex = Math.min(Math.max(0, epIndex), eps.length - 1);
                        const m3u8Link = eps[actualEpIndex].link_m3u8;
                        const filmName = data.movie.name;

                        // Populate film info
                        const infoCont = document.getElementById('film-info-container');
                        if (infoCont && data.movie) {
                            const mov = data.movie;
                            document.getElementById('film-info-name').innerText = mov.name || '';
                            document.getElementById('film-info-origin').innerText = mov.origin_name || '';
                            document.getElementById('film-info-year').innerText = (mov.year || '') + '';
                            document.getElementById('film-info-time').innerText = mov.time || '';
                            document.getElementById('film-info-quality').innerText = mov.quality || '';
                            document.getElementById('film-info-lang').innerText = mov.lang || '';

                            let contentText = mov.content || '';
                            contentText = contentText.replace(/<[^>]*>?/gm, ''); // stripped safe text

                            const contentEl = document.getElementById('film-info-content');
                            contentEl.innerText = contentText;
                            contentEl.classList.add('line-clamp-3');
                            const btnXemThem = contentEl.nextElementSibling;
                            if (btnXemThem) btnXemThem.innerText = '[Xem thêm]';

                            infoCont.classList.remove('hidden');
                            infoCont.classList.add('flex');
                        }

                        // Show comments
                        const commentsCont = document.getElementById('film-comments-section');
                        if (commentsCont) {
                            commentsCont.classList.remove('hidden');
                            commentsCont.classList.add('flex');
                        }

                        // Display episode list if multiple episodes
                        if (eps.length > 1) {
                            controls.classList.remove('hidden');
                            epCont.classList.remove('hidden');
                            epCont.classList.add('flex');
                            epList.innerHTML = eps.map((ep, idx) => `
                                <button onclick="streamFilmOphim('${slug}', '', ${idx})" class="px-3 py-1.5 rounded-lg text-xs font-bold transition-all border border-white/10 ${idx === actualEpIndex ? 'bg-primary text-[#0a0a0a] border-primary' : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'}">
                                    ${ep.name}
                                </button>
                            `).join('');
                        } else {
                            epCont.classList.add('hidden');
                            epCont.classList.remove('flex');
                        }

                        // Sync Party
                        if (activePartyChannel && isPartyHost) {
                            activePartyChannel.send({
                                type: 'broadcast',
                                event: 'change_film',
                                payload: { slug, title: filmName, epIndex: actualEpIndex }
                            });
                        }

                        // Reset quality container text/visibility (will be updated when HLS parses manifest)
                        qCont.classList.add('hidden');
                        qCont.classList.remove('flex');

                        placeholder.classList.add('hidden');
                        output.classList.remove('hidden');

                        const videoElem = document.createElement('video');
                        videoElem.id = 'film-video-player';
                        videoElem.className = 'w-full h-full object-contain bg-black rounded-xl';
                        videoElem.controls = true;
                        videoElem.autoplay = true;
                        output.appendChild(videoElem);

                        if (Hls.isSupported()) {
                            const hls = new Hls({ maxMaxBufferLength: 60 });
                            window.currentHls = hls;
                            hls.loadSource(m3u8Link);
                            hls.attachMedia(videoElem);
                            hls.on(Hls.Events.MANIFEST_PARSED, function (event, parseData) {
                                videoElem.play();
                                renderFilmQualities(hls, parseData.levels);
                            });
                        } else if (videoElem.canPlayType('application/vnd.apple.mpegurl')) {
                            videoElem.src = m3u8Link;
                            videoElem.addEventListener('loadedmetadata', function () {
                                videoElem.play();
                            });
                        }

                        if (currentFilmSlug !== slug || actualEpIndex === 0) {
                            saveFilmHistory(slug, `${filmName} ${eps.length > 1 ? '- ' + eps[actualEpIndex].name : ''}`);
                        }

                        placeholder.innerHTML = `<span class="material-icons-round text-5xl mb-2 opacity-50">smart_display</span><p class="text-sm font-bold">Chưa có video nào đang phát</p><p class="text-xs mt-1">Tìm kiếm hoặc chọn phim đề cử bên dưới để xem.</p>`;
                    } else {
                        throw new Error("No server data");
                    }
                } else {
                    throw new Error("Phim lỗi hoặc không tồn tại.");
                }
            } catch (err) {
                console.error(err);
                placeholder.classList.remove('hidden');
                output.classList.add('hidden');
                placeholder.innerHTML = `<span class="material-icons-round text-5xl mb-2 opacity-50 text-red-400">error</span><p class="text-sm font-bold text-red-400">Không thể tải phim.</p><p class="text-xs mt-1 text-slate-400">Vui lòng chọn phim khác.</p>`;
            }
        };

        window.submitFilmComment = () => {
            const input = document.getElementById('film-comment-input');
            const nameEl = document.getElementById('film-comment-name');
            const spoilerEl = document.getElementById('film-comment-spoiler');
            const list = document.getElementById('film-comments-list');
            const countEl = document.getElementById('film-comment-count');

            const text = input.value.trim();
            let name = nameEl.value.trim();
            if (!text) return;
            if (!name) name = window.currentUserUid ? 'User' : 'Khách'; // Can fetch name later

            const dateStr = 'Vừa xong';
            const firstLetter = name.charAt(0).toUpperCase();
            const avColors = ['bg-primary/20 text-primary border-primary/30', 'bg-blue-500/20 text-blue-400 border-blue-500/30', 'bg-green-500/20 text-green-400 border-green-500/30', 'bg-purple-500/20 text-purple-400 border-purple-500/30', 'bg-pink-500/20 text-pink-400 border-pink-500/30'];
            const randColor = avColors[Math.floor(Math.random() * avColors.length)];

            const spoilerTag = spoilerEl.checked ? '<span class="bg-red-500/20 text-red-400 text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider border border-red-500/30 ml-2">Spoiler</span>' : '';
            const hideContentStyle = spoilerEl.checked ? 'filter: blur(4px); cursor: pointer;' : '';
            const hideContentClick = spoilerEl.checked ? 'onclick="this.style.filter=\\\'none\\\';"' : '';

            const html = `
                <div class="flex gap-2 sm:gap-3 animate-fade-in my-2">
                    <div class="w-7 h-7 sm:w-8 sm:h-8 rounded-full ${randColor} flex items-center justify-center font-bold text-xs sm:text-sm flex-shrink-0 border">${firstLetter}</div>
                    <div class="flex-1 bg-white/5 rounded-xl rounded-tl-none p-3 border border-white/5 shadow-sm">
                        <div class="flex items-center border-b border-white/5 pb-1 mb-1">
                            <span class="text-[10px] sm:text-xs font-bold text-white">${name}</span>
                            ${spoilerTag}
                            <span class="text-[9px] text-slate-500 ml-2">${dateStr}</span>
                        </div>
                        <p class="text-[11px] sm:text-xs text-slate-300 leading-relaxed transition-all" style="${hideContentStyle}" ${hideContentClick}>${text}</p>
                        <div class="flex items-center gap-4 mt-2.5 text-slate-500">
                            <button class="flex items-center gap-1 text-[10px] hover:text-primary transition-colors font-bold" onclick="const s = this.querySelector('span:last-child'); s.textContent = parseInt(s.textContent)+1"><span class="material-icons-round text-xs">thumb_up</span> <span>0</span></button>
                            <button class="flex items-center gap-1 text-[10px] hover:text-primary transition-colors font-bold"><span class="material-icons-round text-xs">thumb_down</span> 0</button>
                            <button class="flex items-center gap-1 text-[10px] hover:text-white transition-colors ml-2 font-bold"><span class="material-icons-round text-xs">reply</span> Trả lời</button>
                            <button class="flex items-center gap-1 text-[10px] hover:text-red-400 transition-colors ml-auto" onclick="this.closest('.flex.gap-2.sm\\\\:gap-3').remove(); document.getElementById('film-comment-count').innerText = parseInt(document.getElementById('film-comment-count').innerText)-1;"><span class="material-icons-round text-xs">delete</span></button>
                        </div>
                    </div>
                </div>
            `;
            list.insertAdjacentHTML('afterbegin', html);
            input.value = '';
            input.style.height = '';
            spoilerEl.checked = false;
            countEl.innerText = parseInt(countEl.innerText) + 1;
        };

        // --- Film History Logic ---
        window.loadFilmHistory = async () => {
            if (!window.currentUserUid) return;
            try {
                const res = await fetch(`/films?uid=${window.currentUserUid}`);
                filmHistory = await res.json();
                renderFilmHistory();
            } catch (e) { }
        };

        window.saveFilmHistory = async (slug, name) => {
            if (!window.currentUserUid) return;
            filmHistory = filmHistory.filter(f => !f.magnet);

            const existIndex = filmHistory.findIndex(f => f.slug === slug);
            if (existIndex >= 0) {
                if (name) filmHistory[existIndex].name = name;
                const item = filmHistory.splice(existIndex, 1)[0];
                filmHistory.unshift(item);
            } else {
                filmHistory.unshift({ slug, name: name || "Unknown Film" });
            }
            renderFilmHistory();

            const formData = new FormData();
            formData.append('uid', window.currentUserUid);
            formData.append('film', JSON.stringify({ slug, name }));
            fetch('/films', { method: 'POST', body: formData }).catch(console.error);
        };

        window.removeFilmHistory = (e, slug) => {
            e.stopPropagation();
            if (!window.currentUserUid) return;
            filmHistory = filmHistory.filter(f => f.slug !== slug);
            renderFilmHistory();
            fetch(`/films?uid=${window.currentUserUid}&slug=${encodeURIComponent(slug)}`, { method: 'DELETE' }).catch(console.error);
        };

        window.verifyFilmVipCode = () => {
            const input = document.getElementById('film-vip-code');
            const code = input.value.trim();
            if (code === '100705') {
                document.getElementById('film-vip-modal').classList.add('hidden');
            } else {
                alert('Mã truy cập không chính xác. Vui lòng kiểm tra lại!');
            }
        };

        window.requestVipAccess = async () => {
            if (!window.currentUserUid) {
                alert("Vui lòng đăng nhập trước!");
                return;
            }
            const userEmail = (await window.supabaseClient.auth.getUser()).data.user.email;
            try {
                const res = await fetch('/request-vip', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ uid: window.currentUserUid, email: userEmail })
                });
                const data = await res.json();
                if (data.status === 'success') {
                    alert('Đã gửi yêu cầu VIP thành công! Vui lòng chờ Admin phê duyệt qua Email.');
                }
            } catch (e) {
                alert('Gửi yêu cầu thất bại. Vui lòng thử lại sau!');
            }
        };

        window.renderFilmHistory = () => {
            const container = document.getElementById('film-history-list');
            const validHistory = filmHistory.filter(f => f.slug);

            if (!validHistory || validHistory.length === 0) {
                container.innerHTML = `<div class="text-center p-4 text-slate-500 text-xs italic">Chưa có lịch sử.</div>`;
                return;
            }
            container.innerHTML = validHistory.map(f => `
                <div class="glass-card p-3 rounded-xl flex items-center justify-between cursor-pointer hover:bg-white/10 transition-colors border border-transparent hover:border-white/10" onclick="streamFilmOphim('${f.slug}')">
                    <div class="flex items-center gap-2 min-w-0 flex-1 pr-2">
                        <span class="material-icons-round text-primary flex-shrink-0 text-lg">movie</span>
                        <span class="text-xs text-white truncate font-bold">${f.name}</span>
                    </div>
                    <button onclick="removeFilmHistory(event, '${f.slug}')" class="text-slate-500 hover:text-red-500 flex-shrink-0 ml-1 p-1">
                        <span class="material-icons-round text-sm">delete</span>
                    </button>
                </div>
            `).join('');
        };

        // ==========================================
        // 12. GAME STATION LOGIC
        // ==========================================
        let snakeInterval = null;
        let caroBoard = Array(225).fill(null);
        let caroTurn = 'X';
        let tetrisInterval = null;
        let flappyInterval = null;
        let poolInterval = null;

        window.switchGame = (gameId) => {
            const containers = {
                snake: document.getElementById('game-snake-container'),
                caro: document.getElementById('game-caro-container'),
                g2048: document.getElementById('game-g2048-container'),
                tetris: document.getElementById('game-tetris-container'),
                flappy: document.getElementById('game-flappy-container'),
                mines: document.getElementById('game-mines-container'),
                pool: document.getElementById('game-pool-container'),
                chess: document.getElementById('game-chess-container')
            };

            // Stop all active games
            stopSnake();
            stopTetris();
            stopFlappy();
            stopPool();

            // Hide all containers and reset card styles
            Object.keys(containers).forEach(key => {
                const c = containers[key];
                if (c) c.classList.add('hidden');

                const btn = document.getElementById(`btn-game-${key}`);
                if (btn) {
                    btn.classList.remove('active');
                }
            });

            // Show selected container and highlight card
            const activeCont = containers[gameId];
            if (activeCont) activeCont.classList.remove('hidden');

            const activeBtn = document.getElementById(`btn-game-${gameId}`);
            if (activeBtn) activeBtn.classList.add('active');

            // Initialize game if needed
            if (gameId === 'caro') initCaro();
            if (gameId === 'g2048') init2048();
            if (gameId === 'mines') initMines();
            if (gameId === 'pool') initPool();
        };

        const stopTetris = () => { if (tetrisInterval) { clearInterval(tetrisInterval); tetrisInterval = null; } };
        const stopFlappy = () => { if (flappyInterval) { cancelAnimationFrame(flappyInterval); flappyInterval = null; } };
        const stopPool = () => { if (poolInterval) { cancelAnimationFrame(poolInterval); poolInterval = null; } };

        // --- SNAKE GAME ---
        window.startSnake = () => {
            document.getElementById('snake-overlay').classList.add('hidden');
            const canvas = document.getElementById('snake-canvas');
            const ctx = canvas.getContext('2d');
            const box = 20;
            let score = 0;
            let snake = [{ x: 9 * box, y: 10 * box }];
            let food = { x: Math.floor(Math.random() * 19 + 1) * box, y: Math.floor(Math.random() * 19 + 1) * box };
            let d = "RIGHT";

            const directionHandler = (event) => {
                const key = event.key;
                if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "w", "a", "s", "d"].includes(key)) {
                    event.preventDefault();
                }
                if ((key === "ArrowLeft" || key === "a") && d != "RIGHT") d = "LEFT";
                else if ((key === "ArrowUp" || key === "w") && d != "DOWN") d = "UP";
                else if ((key === "ArrowRight" || key === "d") && d != "LEFT") d = "RIGHT";
                else if ((key === "ArrowDown" || key === "s") && d != "UP") d = "DOWN";
            };
            document.addEventListener("keydown", directionHandler);
            window.handleSnakeInput = (key) => directionHandler({ key });

            function collision(head, array) {
                for (let i = 0; i < array.length; i++) {
                    if (head.x == array[i].x && head.y == array[i].y) return true;
                }
                return false;
            }

            if (snakeInterval) clearInterval(snakeInterval);
            snakeInterval = setInterval(() => {
                ctx.fillStyle = "#000";
                ctx.fillRect(0, 0, 500, 500);

                // Grid
                ctx.strokeStyle = "rgba(255,255,255,0.05)";
                for (let i = 0; i < 500; i += box) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 500); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(500, i); ctx.stroke(); }

                for (let i = 0; i < snake.length; i++) {
                    ctx.fillStyle = (i == 0) ? "#3b82f6" : "rgba(255,255,255,0.8)";
                    ctx.fillRect(snake[i].x, snake[i].y, box, box);
                }

                ctx.fillStyle = "#ef4444";
                ctx.beginPath();
                ctx.arc(food.x + box / 2, food.y + box / 2, box / 2.5, 0, Math.PI * 2);
                ctx.fill();

                let snakeX = snake[0].x;
                let snakeY = snake[0].y;
                if (d == "LEFT") snakeX -= box;
                if (d == "UP") snakeY -= box;
                if (d == "RIGHT") snakeX += box;
                if (d == "DOWN") snakeY += box;

                if (snakeX == food.x && snakeY == food.y) {
                    score++;
                    document.getElementById('snake-score').innerText = score;
                    food = { x: Math.floor(Math.random() * 19 + 1) * box, y: Math.floor(Math.random() * 19 + 1) * box };
                } else snake.pop();

                let newHead = { x: snakeX, y: snakeY };
                if (snakeX < 0 || snakeX >= 500 || snakeY < 0 || snakeY >= 500 || collision(newHead, snake)) {
                    clearInterval(snakeInterval);
                    document.removeEventListener("keydown", directionHandler);
                    const high = parseInt(document.getElementById('snake-high').innerText);
                    if (score > high) document.getElementById('snake-high').innerText = score;
                    document.getElementById('snake-overlay').classList.remove('hidden');
                    document.getElementById('snake-overlay').querySelector('h3').innerText = "GAME OVER";
                    document.getElementById('snake-overlay').querySelector('p').innerText = `Điểm của bạn: ${score}`;
                    return;
                }
                snake.unshift(newHead);
            }, 100);
        };

        window.stopSnake = () => {
            if (snakeInterval) { clearInterval(snakeInterval); snakeInterval = null; }
            const overlay = document.getElementById('snake-overlay');
            if (overlay) {
                overlay.classList.remove('hidden');
                overlay.querySelector('h3').innerText = "Rắn Săn Mồi";
                overlay.querySelector('p').innerText = "Sử dụng các phím mũi tên hoặc WASD để di chuyển.";
            }
        };

        // --- CARO GAME ---
        window.initCaro = () => {
            const board = document.getElementById('caro-board');
            board.innerHTML = '';
            caroBoard = Array(225).fill(null);
            caroTurn = 'X';
            updateCaroTurnUI();
            for (let i = 0; i < 225; i++) {
                const cell = document.createElement('div');
                cell.className = 'w-8 h-8 sm:w-12 sm:h-12 border border-white/10 flex items-center justify-center text-xl font-bold transition-all hover:bg-white/10 select-none';
                cell.dataset.index = i;
                cell.onclick = () => handleCaroClick(i);
                board.appendChild(cell);
            }
        };

        function handleCaroClick(index) {
            if (caroBoard[index]) return;
            caroBoard[index] = caroTurn;
            const cell = document.querySelector(`[data-index="${index}"]`);
            cell.innerText = caroTurn;
            cell.classList.add(caroTurn === 'X' ? 'text-primary' : 'text-purple-400');
            if (checkCaroWin(index)) {
                alert(`🎉 CHÚC MỪNG! Người chơi ${caroTurn} đã thắng!`);
                initCaro();
                return;
            }
            caroTurn = (caroTurn === 'X') ? 'O' : 'X';
            updateCaroTurnUI();
        }

        function updateCaroTurnUI() {
            const tx = document.getElementById('caro-turn-x');
            const to = document.getElementById('caro-turn-o');
            if (caroTurn === 'X') {
                tx.classList.add('bg-primary', 'text-white'); tx.classList.remove('bg-white/5', 'text-slate-500');
                to.classList.remove('bg-purple-600', 'text-white'); to.classList.add('bg-white/5', 'text-slate-500');
            } else {
                to.classList.add('bg-purple-600', 'text-white'); to.classList.remove('bg-white/5', 'text-slate-500');
                tx.classList.remove('bg-primary', 'text-white'); tx.classList.add('bg-white/5', 'text-slate-500');
            }
        }

        function checkCaroWin(idx) {
            const r = Math.floor(idx / 15), c = idx % 15;
            const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
            for (let [dr, dc] of dirs) {
                let count = 1;
                for (let i = 1; i < 5; i++) {
                    const nr = r + dr * i, nc = c + dc * i;
                    if (nr >= 0 && nr < 15 && nc >= 0 && nc < 15 && caroBoard[nr * 15 + nc] === caroTurn) count++;
                    else break;
                }
                for (let i = 1; i < 5; i++) {
                    const nr = r - dr * i, nc = c - dc * i;
                    if (nr >= 0 && nr < 15 && nc >= 0 && nc < 15 && caroBoard[nr * 15 + nc] === caroTurn) count++;
                    else break;
                }
                if (count >= 5) return true;
            }
            return false;
        }

        window.resetCaro = () => initCaro();

        // --- 2048 GAME ---
        let g2048Board = [];
        let g2048Score = 0;
        window.init2048 = () => {
            g2048Board = Array(16).fill(0);
            g2048Score = 0;
            document.getElementById('g2048-score').innerText = '0';
            addRandom2048();
            addRandom2048();
            render2048();
            document.addEventListener('keydown', handle2048Input);
        };
        const addRandom2048 = () => {
            const empty = g2048Board.map((v, i) => v === 0 ? i : null).filter(v => v !== null);
            if (empty.length > 0) {
                const idx = empty[Math.floor(Math.random() * empty.length)];
                g2048Board[idx] = Math.random() < 0.9 ? 2 : 4;
            }
        };
        const render2048 = () => {
            const boardEl = document.getElementById('g2048-board');
            boardEl.innerHTML = g2048Board.map(v => {
                let colorClass = 'bg-white/5 text-slate-500';
                if (v === 2) colorClass = 'bg-slate-200 text-slate-800 scale-100';
                if (v === 4) colorClass = 'bg-slate-300 text-slate-800 scale-100';
                if (v === 8) colorClass = 'bg-orange-200 text-orange-900 shadow-[0_0_15px_rgba(254,215,170,0.5)]';
                if (v === 16) colorClass = 'bg-orange-300 text-orange-900 shadow-[0_0_15px_rgba(253,186,116,0.5)]';
                if (v === 32) colorClass = 'bg-orange-400 text-white shadow-[0_0_15px_rgba(251,146,60,0.5)]';
                if (v === 64) colorClass = 'bg-orange-500 text-white shadow-[0_0_15px_rgba(249,115,22,0.5)] font-black';
                if (v >= 128) colorClass = 'bg-primary text-[#0a0a0a] shadow-[0_0_20px_rgba(198,168,124,0.6)] font-black animate-pulse';

                return `<div class="w-20 h-20 sm:w-28 sm:h-28 rounded-xl flex items-center justify-center text-2xl sm:text-4xl font-black transition-all duration-200 ${colorClass}">${v || ''}</div>`;
            }).join('');
        };
        const handle2048Input = (e) => {
            if (document.getElementById('game-g2048-container').classList.contains('hidden')) return;
            if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
                e.preventDefault();
            }
            let moved = false;
            if (e.key === 'ArrowUp') moved = move2048('up');
            if (e.key === 'ArrowDown') moved = move2048('down');
            if (e.key === 'ArrowLeft') moved = move2048('left');
            if (e.key === 'ArrowRight') moved = move2048('right');
            if (moved) {
                addRandom2048();
                render2048();
                if (check2048GameOver()) alert('Game Over!');
            }
        };
        const move2048 = (dir) => {
            let moved = false;
            const size = 4;
            for (let i = 0; i < size; i++) {
                let row = [];
                for (let j = 0; j < size; j++) {
                    const idx = (dir === 'up' || dir === 'down') ? j * size + i : i * size + j;
                    row.push(g2048Board[idx]);
                }
                if (dir === 'down' || dir === 'right') row.reverse();

                const filtered = row.filter(v => v !== 0);
                for (let j = 0; j < filtered.length - 1; j++) {
                    if (filtered[j] === filtered[j + 1]) {
                        filtered[j] *= 2;
                        g2048Score += filtered[j];
                        filtered.splice(j + 1, 1);
                        moved = true;
                    }
                }
                while (filtered.length < size) filtered.push(0);
                if (dir === 'down' || dir === 'right') filtered.reverse();

                for (let j = 0; j < size; j++) {
                    const idx = (dir === 'up' || dir === 'down') ? j * size + i : i * size + j;
                    if (g2048Board[idx] !== filtered[j]) moved = true;
                    g2048Board[idx] = filtered[j];
                }
            }
            document.getElementById('g2048-score').innerText = g2048Score;
            return moved;
        };
        const check2048GameOver = () => !g2048Board.includes(0);

        // --- TETRIS GAME ---
        const tetrisCanvas = document.getElementById('tetris-canvas');
        const tetrisCtx = tetrisCanvas ? tetrisCanvas.getContext('2d') : null;
        let tetrisBoard = [];
        let tetrisScore = 0;
        let tetrisPiece = null;
        window.startTetris = () => {
            document.getElementById('tetris-overlay').classList.add('hidden');
            tetrisBoard = Array.from({ length: 20 }, () => Array(10).fill(0));
            tetrisScore = 0;
            document.getElementById('tetris-score').innerText = '0';
            tetrisPiece = createTetrisPiece();
            if (tetrisInterval) clearInterval(tetrisInterval);
            tetrisInterval = setInterval(updateTetris, 500);
            renderTetris();
            document.addEventListener('keydown', handleTetrisInput);
        };
        const tetrisPieces = 'ILJOTSZ';
        const tetrisColors = [null, '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#C6A87C'];
        const createTetrisPiece = () => {
            const type = tetrisPieces[Math.floor(Math.random() * tetrisPieces.length)];
            let matrix;
            if (type === 'I') matrix = [[0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0]];
            else if (type === 'L') matrix = [[0, 2, 0], [0, 2, 0], [0, 2, 2]];
            else if (type === 'J') matrix = [[0, 3, 0], [0, 3, 0], [3, 3, 0]];
            else if (type === 'O') matrix = [[4, 4], [4, 4]];
            else if (type === 'T') matrix = [[0, 0, 0], [5, 5, 5], [0, 5, 0]];
            else if (type === 'S') matrix = [[0, 6, 6], [6, 6, 0], [0, 0, 0]];
            else if (type === 'Z') matrix = [[7, 7, 0], [0, 7, 7], [0, 0, 0]];
            return { pos: { x: 3, y: 0 }, matrix, color: tetrisPieces.indexOf(type) + 1 };
        };
        const drawTetrisMatrix = (matrix, offset) => {
            matrix.forEach((row, y) => {
                row.forEach((value, x) => {
                    if (value !== 0) {
                        tetrisCtx.fillStyle = tetrisColors[value];
                        tetrisCtx.fillRect((x + offset.x) * 30, (y + offset.y) * 30, 29, 29);
                    }
                });
            });
        };
        const renderTetris = () => {
            tetrisCtx.fillStyle = '#000';
            tetrisCtx.fillRect(0, 0, tetrisCanvas.width, tetrisCanvas.height);
            drawTetrisMatrix(tetrisBoard, { x: 0, y: 0 });
            if (tetrisPiece) drawTetrisMatrix(tetrisPiece.matrix, tetrisPiece.pos);
        };
        const updateTetris = () => {
            tetrisPiece.pos.y++;
            if (collideTetris()) {
                tetrisPiece.pos.y--;
                mergeTetris();
                tetrisPiece = createTetrisPiece();
                if (collideTetris()) {
                    clearInterval(tetrisInterval);
                    document.getElementById('tetris-overlay').classList.remove('hidden');
                    document.getElementById('tetris-overlay').querySelector('h3').innerText = "GAME OVER";
                }
                clearTetrisLines();
            }
            renderTetris();
        };
        const collideTetris = () => {
            const [m, o] = [tetrisPiece.matrix, tetrisPiece.pos];
            for (let y = 0; y < m.length; ++y) {
                for (let x = 0; x < m[y].length; ++x) {
                    if (m[y][x] !== 0 && (tetrisBoard[y + o.y] && tetrisBoard[y + o.y][x + o.x]) !== 0) return true;
                }
            }
            return false;
        };
        const mergeTetris = () => {
            tetrisPiece.matrix.forEach((row, y) => {
                row.forEach((value, x) => {
                    if (value !== 0) tetrisBoard[y + tetrisPiece.pos.y][x + tetrisPiece.pos.x] = value;
                });
            });
        };
        const clearTetrisLines = () => {
            let rowCount = 1;
            outer: for (let y = tetrisBoard.length - 1; y > 0; --y) {
                for (let x = 0; x < tetrisBoard[y].length; ++x) { if (tetrisBoard[y][x] === 0) continue outer; }
                const row = tetrisBoard.splice(y, 1)[0].fill(0);
                tetrisBoard.unshift(row);
                ++y;
                tetrisScore += rowCount * 10;
                rowCount *= 2;
            }
            document.getElementById('tetris-score').innerText = tetrisScore;
        };
        const handleTetrisInput = (e) => {
            if (document.getElementById('game-tetris-container').classList.contains('hidden')) return;
            if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
                e.preventDefault();
            }
            if (e.key === 'ArrowLeft') { tetrisPiece.pos.x--; if (collideTetris()) tetrisPiece.pos.x++; }
            if (e.key === 'ArrowRight') { tetrisPiece.pos.x++; if (collideTetris()) tetrisPiece.pos.x--; }
            if (e.key === 'ArrowDown') { updateTetris(); }
            if (e.key === 'ArrowUp') {
                const rotated = tetrisPiece.matrix[0].map((_, i) => tetrisPiece.matrix.map(row => row[i]).reverse());
                const oldMatrix = tetrisPiece.matrix;
                tetrisPiece.matrix = rotated;
                if (collideTetris()) tetrisPiece.matrix = oldMatrix;
            }
            renderTetris();
        };

        // --- FLAPPY KIET GAME ---
        const flappyCanvas = document.getElementById('flappy-canvas');
        const flappyCtx = flappyCanvas ? flappyCanvas.getContext('2d') : null;
        let bird = { x: 50, y: 150, w: 25, h: 25, gravity: 0.4, lift: -7, velocity: 0 };
        let pipes = [];
        let flappyScore = 0;
        let isFlappyOver = false;

        window.startFlappy = () => {
            document.getElementById('flappy-overlay').classList.add('hidden');
            bird = { x: 50, y: 150, w: 25, h: 25, gravity: 0.4, lift: -7, velocity: 0 };
            pipes = [];
            flappyScore = 0;
            isFlappyOver = false;
            document.getElementById('flappy-score').innerText = '0';
            if (flappyInterval) cancelAnimationFrame(flappyInterval);
            loopFlappy();
        };

        const loopFlappy = () => {
            if (isFlappyOver) return;
            updateFlappy();
            renderFlappy();
            flappyInterval = requestAnimationFrame(loopFlappy);
        };

        const updateFlappy = () => {
            bird.velocity += bird.gravity;
            bird.y += bird.velocity;

            if (bird.y + bird.h > flappyCanvas.height) { bird.y = flappyCanvas.height - bird.h; bird.velocity = 0; gameOverFlappy(); }
            if (bird.y < 0) { bird.y = 0; bird.velocity = 0; }

            if (frameCount % 100 === 0) {
                let gap = 150;
                let topH = Math.random() * (flappyCanvas.height - gap - 100) + 50;
                pipes.push({ x: flappyCanvas.width, top: topH, bottom: flappyCanvas.height - topH - gap, w: 50 });
            }

            pipes.forEach((p, i) => {
                p.x -= 3;
                if (p.x + p.w < 0) { pipes.splice(i, 1); flappyScore++; document.getElementById('flappy-score').innerText = flappyScore; }

                if (bird.x + bird.w > p.x && bird.x < p.x + p.w) {
                    if (bird.y < p.top || bird.y + bird.h > flappyCanvas.height - p.bottom) gameOverFlappy();
                }
            });
        };

        const renderFlappy = () => {
            flappyCtx.fillStyle = '#70c5ce';
            flappyCtx.fillRect(0, 0, flappyCanvas.width, flappyCanvas.height);

            // Bird
            flappyCtx.fillStyle = '#C6A87C';
            flappyCtx.beginPath();
            flappyCtx.roundRect(bird.x, bird.y, bird.w, bird.h, 8);
            flappyCtx.fill();
            flappyCtx.fillStyle = '#fff';
            flappyCtx.fillRect(bird.x + 20, bird.y + 5, 5, 5);

            // Pipes
            flappyCtx.fillStyle = '#2d5a27';
            pipes.forEach(p => {
                flappyCtx.fillRect(p.x, 0, p.w, p.top);
                flappyCtx.fillRect(p.x, flappyCanvas.height - p.bottom, p.w, p.bottom);
            });
        };

        const gameOverFlappy = () => {
            isFlappyOver = true;
            document.getElementById('flappy-overlay').classList.remove('hidden');
            document.getElementById('flappy-overlay').querySelector('h3').innerText = "GAME OVER";
            document.getElementById('flappy-overlay').querySelector('p').innerText = `Điểm: ${flappyScore}`;
        };

        window.addEventListener('keydown', (e) => {
            const isFlappyVisible = !document.getElementById('game-flappy-container').classList.contains('hidden');
            if (e.code === 'Space' && isFlappyVisible) {
                e.preventDefault();
                bird.velocity = bird.lift;
            }
        });
        flappyCanvas?.addEventListener('mousedown', () => { bird.velocity = bird.lift; });

        let frameCount = 0;
        setInterval(() => frameCount++, 10);

        // --- MINESWEEPER GAME ---
        let minesBoard = [];
        let minesCols = 9, minesRows = 9, totalMines = 10;
        let minesRevealed = 0;
        let isMinesOver = false;

        window.initMines = () => {
            const container = document.getElementById('mines-board');
            container.innerHTML = '';
            minesBoard = [];
            minesRevealed = 0;
            isMinesOver = false;
            document.getElementById('mines-count').innerText = totalMines;
            document.getElementById('mines-reset-btn').innerText = '😊';

            for (let r = 0; r < minesRows; r++) {
                minesBoard[r] = [];
                for (let c = 0; c < minesCols; c++) {
                    minesBoard[r][c] = { r, c, mine: false, revealed: false, flagged: false, count: 0 };
                    const cell = document.createElement('div');
                    cell.className = 'w-10 h-10 sm:w-12 sm:h-12 bg-white/10 rounded border border-white/5 flex items-center justify-center font-bold text-sm cursor-pointer hover:bg-white/20 select-none';
                    cell.id = `mine-${r}-${c}`;
                    cell.onclick = () => revealMine(r, c);
                    cell.oncontextmenu = (e) => { e.preventDefault(); flagMine(r, c); };
                    container.appendChild(cell);
                }
            }

            // Place mines
            let mCount = 0;
            while (mCount < totalMines) {
                let r = Math.floor(Math.random() * minesRows);
                let c = Math.floor(Math.random() * minesCols);
                if (!minesBoard[r][c].mine) {
                    minesBoard[r][c].mine = true;
                    mCount++;
                }
            }

            // Calculate numbers
            for (let r = 0; r < minesRows; r++) {
                for (let c = 0; c < minesCols; c++) {
                    if (minesBoard[r][c].mine) continue;
                    let count = 0;
                    for (let dr = -1; dr <= 1; dr++) {
                        for (let dc = -1; dc <= 1; dc++) {
                            let nr = r + dr, nc = c + dc;
                            if (nr >= 0 && nr < minesRows && nc >= 0 && nc < minesCols && minesBoard[nr][nc].mine) count++;
                        }
                    }
                    minesBoard[r][c].count = count;
                }
            }
        };

        const revealMine = (r, c) => {
            if (isMinesOver || minesBoard[r][c].revealed || minesBoard[r][c].flagged) return;
            const b = minesBoard[r][c];
            b.revealed = true;
            const el = document.getElementById(`mine-${r}-${c}`);
            el.classList.remove('bg-white/10', 'hover:bg-white/20');
            el.classList.add('bg-white/5');

            if (b.mine) {
                el.innerText = '💣';
                el.classList.add('bg-red-500/20');
                gameOverMines(false);
                return;
            }

            if (b.count > 0) {
                el.innerText = b.count;
                const colors = ['', 'text-blue-400', 'text-green-400', 'text-red-400', 'text-purple-400', 'text-yellow-400', 'text-cyan-400', 'text-white', 'text-slate-300'];
                el.classList.add(colors[b.count]);
            } else {
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        let nr = r + dr, nc = c + dc;
                        if (nr >= 0 && nr < minesRows && nc >= 0 && nc < minesCols) revealMine(nr, nc);
                    }
                }
            }

            minesRevealed++;
            if (minesRevealed === (minesRows * minesCols) - totalMines) gameOverMines(true);
        };

        const flagMine = (r, c) => {
            if (isMinesOver || minesBoard[r][c].revealed) return;
            const b = minesBoard[r][c];
            b.flagged = !b.flagged;
            const el = document.getElementById(`mine-${r}-${c}`);
            el.innerText = b.flagged ? '🚩' : '';
            const countEl = document.getElementById('mines-count');
            countEl.innerText = parseInt(countEl.innerText) + (b.flagged ? -1 : 1);
        };

        const gameOverMines = (win) => {
            isMinesOver = true;
            document.getElementById('mines-reset-btn').innerText = win ? '😎' : '😵';
            if (!win) {
                minesBoard.forEach(row => row.forEach(b => {
                    if (b.mine && !b.revealed) document.getElementById(`mine-${b.r}-${b.c}`).innerText = '💣';
                }));
            }
        };

        // --- KIET-POOL (BIDA) GAME ---
        const poolCanvas = document.getElementById('pool-canvas');
        const poolCtx = poolCanvas ? poolCanvas.getContext('2d') : null;
        let poolBalls = [];
        let poolCueBall = null;
        let poolPower = 0;
        let isPowering = false;
        let poolMouse = { x: 0, y: 0 };
        const poolFriction = 0.985;
        const poolPockets = [
            { x: 0, y: 0 }, { x: 400, y: 0 }, { x: 800, y: 0 },
            { x: 0, y: 400 }, { x: 400, y: 400 }, { x: 800, y: 400 }
        ];

        let currentPoolType = 'practice';
        let currentPoolMode = 'full';
        let poolCurrentTurn = 1; // 1 or 2
        let isWaitingForStop = false;
        let aiThinkingTimer = 0;

        window.setPoolType = (type) => {
            currentPoolType = type;
            document.querySelectorAll('.pool-menu-btn').forEach(btn => {
                btn.classList.toggle('active', btn.id === `pool-type-${type}`);
            });
        };

        window.setPoolMode = (mode) => {
            currentPoolMode = mode;
            document.querySelectorAll('.pool-mode-btn').forEach(btn => {
                btn.classList.toggle('active', btn.id === `pool-mode-${mode}`);
            });
        };

        window.showPoolMenu = () => {
            document.getElementById('pool-menu-overlay').classList.remove('hidden');
            document.getElementById('pool-overlay').classList.add('hidden');
            if (poolInterval) cancelAnimationFrame(poolInterval);
        };

        window.startPoolGame = () => {
            document.getElementById('pool-menu-overlay').classList.add('hidden');
            initPool();
        };

        window.initPool = () => {
            poolBalls = [];
            poolCurrentTurn = 1;
            isWaitingForStop = false;
            document.getElementById('pool-overlay').classList.add('hidden');

            // Status Text
            updatePoolStatus();

            // Cue Ball (White)
            poolCueBall = { x: 200, y: 200, vx: 0, vy: 0, r: 8, color: '#fff', pocketed: false, id: 'cue' };
            poolBalls.push(poolCueBall);

            const r = 8;
            const colors = ['#fde047', '#3b82f6', '#ef4444', '#8b5cf6', '#f97316', '#22c55e', '#a855f7', '#111', '#fb7185', '#2dd4bf'];

            if (currentPoolMode === 'full') {
                const startX = 550, startY = 200;
                let count = 0;
                for (let i = 0; i < 5; i++) {
                    for (let j = 0; j <= i; j++) {
                        poolBalls.push({
                            x: startX + i * (r * 1.7),
                            y: startY - (i * r * 1.05) + (j * r * 2.1),
                            vx: 0, vy: 0, r: r, color: colors[count % colors.length], pocketed: false
                        });
                        count++;
                    }
                }
            } else if (currentPoolMode === '9ball') {
                const startX = 550, startY = 200;
                const diamond = [
                    [0, 0],
                    [1, -1], [1, 1],
                    [2, -2], [2, 0], [2, 2],
                    [3, -1], [3, 1],
                    [4, 0]
                ];
                diamond.forEach((pos, idx) => {
                    poolBalls.push({
                        x: startX + pos[0] * (r * 1.7),
                        y: startY + pos[1] * r * 1.05,
                        vx: 0, vy: 0, r: r, color: idx === 4 ? '#111' : colors[idx % colors.length], pocketed: false
                    });
                });
            } else if (currentPoolMode === '3c') {
                // 3-Cushion: White, Yellow, Red
                poolBalls.push({ x: 600, y: 200, vx: 0, vy: 0, r: r, color: '#fde047', pocketed: false, id: 'target1' }); // Yellow
                poolBalls.push({ x: 650, y: 200, vx: 0, vy: 0, r: r, color: '#ef4444', pocketed: false, id: 'target2' }); // Red
            }

            if (poolInterval) cancelAnimationFrame(poolInterval);
            loopPool();
        };

        const updatePoolStatus = () => {
            const status = document.getElementById('pool-status');
            if (currentPoolType === 'practice') {
                status.innerText = "Chế Độ Đấu Tập - Tự Do Ngắm Bắn";
            } else if (currentPoolType === 'pvp') {
                status.innerText = `Lượt Cơ Thủ ${poolCurrentTurn} - Sẵn Sàng!`;
            } else if (currentPoolType === 'ai') {
                status.innerText = poolCurrentTurn === 1 ? "Đến Lượt Bạn - Hãy Cẩn Thận!" : "Máy Đang Tính Toán...";
            }
        };

        const loopPool = () => {
            updatePool();
            renderPool();
            poolInterval = requestAnimationFrame(loopPool);
        };

        const updatePool = () => {
            let moving = false;
            poolBalls.forEach(b => {
                if (b.pocketed) return;
                b.x += b.vx;
                b.y += b.vy;
                b.vx *= poolFriction;
                b.vy *= poolFriction;
                if (Math.abs(b.vx) < 0.1) b.vx = 0;
                if (Math.abs(b.vy) < 0.1) b.vy = 0;
                if (b.vx !== 0 || b.vy !== 0) moving = true;

                // Wall collisions
                if (b.x - b.r < 0 || b.x + b.r > poolCanvas.width) { b.vx *= -0.8; b.x = b.x < b.r ? b.r : poolCanvas.width - b.r; }
                if (b.y - b.r < 0 || b.y + b.r > poolCanvas.height) { b.vy *= -0.8; b.y = b.y < b.r ? b.r : poolCanvas.height - b.r; }

                // Pockets (Disable for 3C)
                if (currentPoolMode !== '3c') {
                    poolPockets.forEach(p => {
                        const dist = Math.hypot(b.x - p.x, b.y - p.y);
                        if (dist < 22) {
                            b.pocketed = true;
                            b.vx = 0; b.vy = 0;
                            if (b.id === 'cue') { // Cue ball in pocket
                                setTimeout(() => { b.pocketed = false; b.x = 200; b.y = 200; }, 500);
                            }
                        }
                    });
                }
            });

            // Ball collisions
            for (let i = 0; i < poolBalls.length; i++) {
                for (let j = i + 1; j < poolBalls.length; j++) {
                    const b1 = poolBalls[i], b2 = poolBalls[j];
                    if (b1.pocketed || b2.pocketed) continue;
                    const dx = b2.x - b1.x, dy = b2.y - b1.y;
                    const dist = Math.hypot(dx, dy);
                    if (dist < b1.r + b2.r) {
                        const angle = Math.atan2(dy, dx);
                        const sin = Math.sin(angle), cos = Math.cos(angle);
                        const x2 = dx * cos + dy * sin;
                        const vx1 = b1.vx * cos + b1.vy * sin, vy1 = b1.vy * cos - b1.vx * sin;
                        const vx2 = b2.vx * cos + b2.vy * sin, vy2 = b2.vy * cos - b2.vx * sin;
                        const vx1Final = vx2, vx2Final = vx1;
                        const overlap = (b1.r + b2.r) - dist;
                        b1.x -= (overlap / 2) * cos; b1.y -= (overlap / 2) * sin;
                        b2.x += (overlap / 2) * cos; b2.y += (overlap / 2) * sin;
                        b1.vx = vx1Final * cos - vy1 * sin; b1.vy = vy1 * cos + vx1Final * sin;
                        b2.vx = vx2Final * cos - vy2 * sin; b2.vy = vy2 * cos + vx2Final * sin;
                    }
                }
            }

            // Turn Management
            if (!moving && isWaitingForStop) {
                isWaitingForStop = false;
                if (currentPoolType !== 'practice') {
                    poolCurrentTurn = poolCurrentTurn === 1 ? 2 : 1;
                    updatePoolStatus();
                    if (currentPoolType === 'ai' && poolCurrentTurn === 2) {
                        aiThinkingTimer = 60; // Wait a bit before AI shoots
                    }
                }
            }

            // AI Logic
            if (!moving && currentPoolType === 'ai' && poolCurrentTurn === 2 && aiThinkingTimer > 0) {
                aiThinkingTimer--;
                if (aiThinkingTimer === 0) {
                    const target = poolBalls.find(b => !b.pocketed && b.id !== 'cue');
                    if (target) {
                        const angle = Math.atan2(target.y - poolCueBall.y, target.x - poolCueBall.x);
                        // Add some randomness for "human" feel
                        const randomAngle = angle + (Math.random() * 0.05 - 0.025);
                        const force = 8 + Math.random() * 8;
                        poolCueBall.vx = Math.cos(randomAngle) * force;
                        poolCueBall.vy = Math.sin(randomAngle) * force;
                        isWaitingForStop = true;
                    }
                }
            }

            if (!moving && isPowering) {
                poolPower = Math.min(poolPower + 2, 100);
                document.getElementById('pool-power-bar').style.width = poolPower + '%';
            }

            // Win detection (all target balls pocketed)
            if (!moving && currentPoolMode !== '3c') {
                const targets = poolBalls.filter(b => b.id !== 'cue');
                if (targets.length > 0 && targets.every(b => b.pocketed)) {
                    document.getElementById('pool-overlay').classList.remove('hidden');
                }
            }
        };

        const renderPool = () => {
            poolCtx.fillStyle = '#1a4d2e';
            poolCtx.fillRect(0, 0, poolCanvas.width, poolCanvas.height);

            // Pockets
            if (currentPoolMode !== '3c') {
                poolCtx.fillStyle = '#000';
                poolPockets.forEach(p => { poolCtx.beginPath(); poolCtx.arc(p.x, p.y, 22, 0, Math.PI * 2); poolCtx.fill(); });
            }

            // Balls
            poolBalls.forEach(b => {
                if (b.pocketed) return;
                poolCtx.fillStyle = b.color;
                poolCtx.beginPath(); poolCtx.arc(b.x, b.y, b.r, 0, Math.PI * 2); poolCtx.fill();
                // Shine
                poolCtx.fillStyle = 'rgba(255,255,255,0.3)';
                poolCtx.beginPath(); poolCtx.arc(b.x - 2, b.y - 2, 2.5, 0, Math.PI * 2); poolCtx.fill();
            });

            // Cue
            const isMoving = poolBalls.some(b => Math.abs(b.vx) > 0 || Math.abs(b.vy) > 0);
            const isMyTurn = currentPoolType === 'practice' || (currentPoolType === 'pvp') || (currentPoolType === 'ai' && poolCurrentTurn === 1);

            if (!isMoving && !poolCueBall.pocketed && isMyTurn) {
                const angle = Math.atan2(poolMouse.y - poolCueBall.y, poolMouse.x - poolCueBall.x);
                // Aim Line
                poolCtx.strokeStyle = 'rgba(255,255,255,0.2)';
                poolCtx.setLineDash([5, 5]);
                poolCtx.beginPath();
                poolCtx.moveTo(poolCueBall.x, poolCueBall.y);
                poolCtx.lineTo(poolCueBall.x - Math.cos(angle) * 300, poolCueBall.y - Math.sin(angle) * 300);
                poolCtx.stroke();
                poolCtx.setLineDash([]);

                // Stick
                poolCtx.strokeStyle = '#3d2b1f';
                poolCtx.lineWidth = 5;
                poolCtx.beginPath();
                const stickDist = 20 + poolPower / 2;
                poolCtx.moveTo(poolCueBall.x + Math.cos(angle) * stickDist, poolCueBall.y + Math.sin(angle) * stickDist);
                poolCtx.lineTo(poolCueBall.x + Math.cos(angle) * (stickDist + 180), poolCueBall.y + Math.sin(angle) * (stickDist + 180));
                poolCtx.stroke();
            }
        };

        poolCanvas?.addEventListener('mousemove', (e) => {
            const rect = poolCanvas.getBoundingClientRect();
            poolMouse.x = e.clientX - rect.left;
            poolMouse.y = e.clientY - rect.top;
        });
        poolCanvas?.addEventListener('mousedown', () => {
            const isMoving = poolBalls.some(b => Math.abs(b.vx) > 0 || Math.abs(b.vy) > 0);
            const isMyTurn = currentPoolType === 'practice' || (currentPoolType === 'pvp') || (currentPoolType === 'ai' && poolCurrentTurn === 1);
            if (!isMoving && isMyTurn) {
                isPowering = true; poolPower = 0;
            }
        });
        poolCanvas?.addEventListener('mouseup', () => {
            if (isPowering) {
                const angle = Math.atan2(poolMouse.y - poolCueBall.y, poolMouse.x - poolCueBall.x);
                const force = poolPower / 5;
                poolCueBall.vx = -Math.cos(angle) * force;
                poolCueBall.vy = -Math.sin(angle) * force;
                isWaitingForStop = true;
            }
            isPowering = false; poolPower = 0;
            document.getElementById('pool-power-bar').style.width = '0%';
        });

        // --- PHOTOBOOTH STATE ---
        let pbSelectedLayout = 'v4';
        let pbCapturedPhotos = new Array(4).fill(null);
        let pbActiveStickers = [];
        let pbFrameColor = '#FFFFFF';
        let pbSelectedFilter = 'none';
        let pbVirtualBG = null; // Can be an Image object or null
        let pbVirtualBGSrc = null; // Store the src for UI active state
        let pbBgImagesCache = new Map(); // Cache for preloaded images
        const pbPresets = [
            { id: 'studio', url: 'https://images.unsplash.com/photo-1554048612-b6a482bc67e5?q=80&w=640&auto=format&fit=crop' },
            { id: 'neon', url: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=640&auto=format&fit=crop' },
            { id: 'forest', url: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?q=80&w=640&auto=format&fit=crop' },
            { id: 'minimal', url: 'https://images.unsplash.com/photo-1497366216548-37526070297c?q=80&w=640&auto=format&fit=crop' },
            { id: 'galaxy', url: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?q=80&w=640&auto=format&fit=crop' },
            { id: 'sunset', url: 'https://images.unsplash.com/photo-1472214103451-9374bd1c798e?q=80&w=640&auto=format&fit=crop' }
        ];
        let selfieSegmentation = null;
        let pbStream = null;
        let pbHeldSticker = null;

        const pbColors = ['#FFFFFF', '#000000', '#FFDBE9', '#FFB7B2', '#FFDAC1', '#E2F0CB', '#B5EAD7', '#C7CEEA', '#D4A5A5', '#97C1A9', '#55CBCD', '#ECC19C', '#F6EAC2', '#A0E7E5', '#B28DFF', '#6EB5FF', '#FFABAB', '#FFC3A0'];
        const pbStickers = ['✨', '⭐', '❤️', '💖', '🔥', '🌸', '🌈', '🎀', '🍭', '🍓', '🍑', '🦋', '🐱', '🐶', '🧸', '☁️', '🌙', '🍒', '🎈', '🎨', '🧩', '🧁', '🍩', '🥑'];

        async function initPhotoboothCamera() {
            const video = document.getElementById('pb-video');
            if (!video) return;
            try {
                const constraints = { 
                    video: selectedVideoDeviceId ? 
                        { deviceId: { exact: selectedVideoDeviceId }, width: 1280, height: 720 } : 
                        { width: 1280, height: 720 } 
                };
                pbStream = await navigator.mediaDevices.getUserMedia(constraints);
                video.srcObject = pbStream;
                initSelfieSegmentation();
                refreshCameraDevices();
            } catch (e) {
                console.error("PB Camera Error", e);
            }
        }

        function stopPhotoboothCamera() {
            if (pbStream) {
                pbStream.getTracks().forEach(t => t.stop());
                pbStream = null;
            }
        }

        function initSelfieSegmentation() {
            if (selfieSegmentation) return;
            selfieSegmentation = new SelfieSegmentation({
                locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`
            });
            selfieSegmentation.setOptions({ modelSelection: 1 });
            selfieSegmentation.onResults(onSegmentationResults);

            const video = document.getElementById('pb-video');
            const step = async () => {
                if (pbStream && pbVirtualBG) {
                    await selfieSegmentation.send({ image: video });
                }
                requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
        }

        function drawCoverImage(ctx, img, canvasW, canvasH, targetX = 0, targetY = 0) {
            const imgRatio = img.width / img.height;
            const canvasRatio = canvasW / canvasH;
            let drawW, drawH, drawX, drawY;

            if (imgRatio > canvasRatio) {
                // Image is wider than canvas -> fill height, crop sides
                drawH = canvasH;
                drawW = canvasH * imgRatio;
                drawX = targetX + (canvasW - drawW) / 2;
                drawY = targetY;
            } else {
                // Image is taller than canvas -> fill width, crop top/bottom
                drawW = canvasW;
                drawH = canvasW / imgRatio;
                drawX = targetX;
                drawY = targetY + (canvasH - drawH) / 2;
            }
            ctx.drawImage(img, drawX, drawY, drawW, drawH);
        }

        function onSegmentationResults(results) {
            const canvas = document.getElementById('pb-seg-canvas');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            canvas.width = results.image.width;
            canvas.height = results.image.height;

            ctx.save();
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(results.segmentationMask, 0, 0, canvas.width, canvas.height);

            ctx.globalCompositeOperation = 'source-out';
            if (pbVirtualBG && pbVirtualBG.complete) {
                drawCoverImage(ctx, pbVirtualBG, canvas.width, canvas.height);
            }

            ctx.globalCompositeOperation = 'destination-atop';
            ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
            ctx.restore();
        }

        window.initPBBackdrops = () => {
            const container = document.getElementById('pb-bg-options');
            if (!container) return;

            pbPresets.forEach(preset => {
                // Preload
                const img = new Image();
                img.crossOrigin = "anonymous";
                img.src = preset.url;
                pbBgImagesCache.set(preset.url, img);

                // Add to UI
                const btn = document.createElement('button');
                btn.className = "pb-bg-btn w-12 h-12 rounded-full border-2 border-white/10 flex-shrink-0 overflow-hidden hover:scale-110 transition-all shadow-lg";
                btn.dataset.background = preset.url;
                btn.onclick = () => setPBVirtualBG(preset.url);
                btn.innerHTML = `<img src="${preset.url}" class="w-full h-full object-cover">`;
                container.appendChild(btn);
            });
        };

        window.handlePBBgUpload = (input) => {
            const file = input.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                const src = e.target.result;
                const img = new Image();
                img.onload = () => {
                    pbBgImagesCache.set('custom', img);
                    setPBVirtualBG('custom');
                };
                img.src = src;
            };
            reader.readAsDataURL(file);
        };

        window.setPBVirtualBG = (src) => {
            pbVirtualBGSrc = src;
            if (!src) {
                pbVirtualBG = null;
            } else if (src === 'custom') {
                pbVirtualBG = pbBgImagesCache.get('custom');
            } else {
                pbVirtualBG = pbBgImagesCache.get(src);
            }

            const segCanvas = document.getElementById('pb-seg-canvas');
            if (segCanvas) {
                if (pbVirtualBG) segCanvas.classList.remove('hidden');
                else segCanvas.classList.add('hidden');
            }

            document.querySelectorAll('.pb-bg-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.background === (src || 'none'));
            });
        };

        window.setPBFilter = (filter) => {
            pbSelectedFilter = filter;
            document.querySelectorAll('.pb-filter-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.filter === filter);
            });
            if (document.getElementById('pb-design-zone').classList.contains('hidden') === false) {
                updateStripPreview();
            }
        };

        window.setPBLayout = (layout) => {
            pbSelectedLayout = layout;
            let count = 4;
            if (layout === 'h3') count = 3;
            if (layout === 'f1') count = 1;
            pbCapturedPhotos = new Array(count).fill(null);

            document.querySelectorAll('.pb-layout-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.layout === layout);
            });
            updatePBSlots();
        };

        window.goToCapture = () => {
            document.getElementById('pb-layout-zone').classList.add('hidden');
            document.getElementById('pb-capture-zone').classList.remove('hidden');
            initPhotoboothCamera();
        };

        window.startPhotoboothSequence = async () => {
            for (let i = 0; i < pbCapturedPhotos.length; i++) {
                await captureSlot(i);
            }
        };

        async function captureSlot(index) {
            const countdownEl = document.getElementById('pb-countdown');
            const countdownNum = document.getElementById('pb-countdown-num');
            const flash = document.getElementById('pb-flash');
            const video = document.getElementById('pb-video');
            const canvas = document.getElementById('pb-canvas');
            const segCanvas = document.getElementById('pb-seg-canvas');
            if (!video || !canvas) return;
            const ctx = canvas.getContext('2d');

            const statusContainer = document.getElementById('pb-capture-status');
            const statusText = document.getElementById('pb-capture-status-text');

            if (statusContainer && statusText) {
                statusContainer.classList.remove('hidden');
                statusText.innerText = `READY FOR SHOT ${index + 1}/${pbCapturedPhotos.length}`;
            }

            if (countdownEl && countdownNum) {
                countdownEl.classList.remove('hidden');
                for (let s = 3; s > 0; s--) {
                    countdownNum.innerText = s;
                    await new Promise(r => setTimeout(r, 700)); // Slightly faster countdown
                }
                countdownEl.classList.add('hidden');
            }

            if (statusContainer) statusContainer.classList.add('hidden');

            if (flash) flash.classList.add('animate-flash');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;

            // We capture original image, filter is applied in preview/export
            if (pbVirtualBG && segCanvas) {
                ctx.drawImage(segCanvas, 0, 0, canvas.width, canvas.height);
            } else {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            }

            pbCapturedPhotos[index] = canvas.toDataURL('image/png');
            await new Promise(r => setTimeout(r, 500));
            if (flash) flash.classList.remove('animate-flash');
            updatePBSlots();
        }

        function updatePBSlots() {
            const container = document.getElementById('pb-slots-container');
            if (!container) return;

            let gridCols = 'grid-cols-2';
            if (pbSelectedLayout === 'v4') gridCols = 'grid-cols-2';
            if (pbSelectedLayout === 'h3') gridCols = 'grid-cols-1';
            if (pbSelectedLayout === 'f1') gridCols = 'grid-cols-1';

            container.className = `grid ${gridCols} gap-4 flex-1`;
            container.innerHTML = pbCapturedPhotos.map((photo, i) => `
                <div class="relative aspect-[3/4] bg-white/5 rounded-[2rem] overflow-hidden border-2 ${photo ? 'border-primary/50 shadow-lg shadow-primary/10' : 'border-dashed border-white/10'} transition-all">
                    ${photo ? `
                        <img src="${photo}" class="w-full h-full object-cover">
                        <button onclick="captureSlot(${i})" class="absolute top-2 right-2 w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-all">
                            <span class="material-icons-round text-sm">refresh</span>
                        </button>
                    ` : `
                        <div class="w-full h-full flex flex-col items-center justify-center text-slate-700 opacity-20">
                             <span class="material-icons-round text-4xl">photo_camera</span>
                        </div>
                    `}
                </div>
            `).join('');

            const isComplete = pbCapturedPhotos.every(p => p !== null);
            const nextBtn = document.getElementById('pb-next-btn');
            const mainNextBtn = document.getElementById('pb-main-next-btn');

            if (nextBtn) {
                if (isComplete) nextBtn.classList.remove('hidden');
                else nextBtn.classList.add('hidden');
            }
            if (mainNextBtn) {
                if (isComplete) mainNextBtn.classList.remove('hidden');
                else mainNextBtn.classList.add('hidden');
            }
        }

        window.goToDesignStudio = () => {
            document.getElementById('pb-capture-zone').classList.add('hidden');
            document.getElementById('pb-design-zone').classList.remove('hidden');
            initPBStudioUI();
            updateStripPreview();
        };

        window.backToCapture = () => {
            document.getElementById('pb-design-zone').classList.add('hidden');
            document.getElementById('pb-capture-zone').classList.remove('hidden');
        };

        function initPBStudioUI() {
            const colorGrid = document.getElementById('pb-design-color-grid');
            if (colorGrid) colorGrid.innerHTML = pbColors.map(c => `<button onclick="setPBFrameColor('${c}')" class="w-10 h-10 rounded-full border-2 border-white/20 hover:scale-110 transition-all shadow-md" style="background: ${c};"></button>`).join('');
            const stickerGrid = document.getElementById('pb-sticker-grid');
            if (stickerGrid) stickerGrid.innerHTML = pbStickers.map(s => `<button onclick="addPBSticker('${s}')" class="w-full aspect-square bg-white/5 rounded-2xl flex items-center justify-center text-3xl hover:bg-white/10 hover:scale-110 transition-all border border-white/5">${s}</button>`).join('');
        }

        window.addPBSticker = (emoji) => {
            pbHeldSticker = emoji;
            const indicator = document.getElementById('pb-held-sticker-indicator');
            const emojiEl = document.getElementById('pb-held-sticker-emoji');
            if (indicator && emojiEl) {
                indicator.classList.remove('hidden');
                emojiEl.innerText = emoji;
            }
        };

        window.placeSticker = (e) => {
            if (!pbHeldSticker) return;
            const preview = document.getElementById('pb-strip-preview');
            const rect = preview.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;

            pbActiveStickers.push({
                emoji: pbHeldSticker,
                x: x,
                y: y,
                rotate: Math.random() * 40 - 20
            });
            updateStripPreview();
        };

        window.setPBFrameColor = (color) => { pbFrameColor = color; updateStripPreview(); };

        function updateStripPreview() {
            const preview = document.getElementById('pb-strip-preview');
            if (!preview) return;
            preview.style.backgroundColor = pbFrameColor;

            // Layout specific styles
            let gap = 'gap-5';
            let minH = 'min-h-[600px]';
            if (pbSelectedLayout === 'g4') { gap = 'gap-2'; minH = 'min-h-[400px]'; }
            if (pbSelectedLayout === 'f1') { minH = 'min-h-[300px]'; }

            preview.className = `w-full max-w-[340px] sm:max-w-[320px] lg:scale-110 ${minH} flex flex-col ${gap} p-6 pb-16 rounded-[3.5rem] relative transition-all cursor-crosshair ring-1 ring-white/10 shadow-2xl`;

            let photoHtml = '';
            if (pbSelectedLayout === 'g4') {
                photoHtml = `<div class="grid grid-cols-2 gap-2 w-full">` + pbCapturedPhotos.map(p => `<div class="aspect-square rounded-lg overflow-hidden"><img src="${p}" style="filter: ${getCanvasFilter(pbSelectedFilter)}" class="w-full h-full object-cover"></div>`).join('') + `</div>`;
            } else {
                photoHtml = pbCapturedPhotos.map((photo) => `<div class="relative w-full aspect-[4/3] rounded-2xl overflow-hidden shadow-sm"><img src="${photo}" style="filter: ${getCanvasFilter(pbSelectedFilter)}" class="w-full h-full object-cover"></div>`).join('');
            }

            let brandingHtml = `<div class="absolute bottom-6 left-0 right-0 text-center font-bold tracking-[0.4em] opacity-40 text-xs" style="color: ${(pbFrameColor === '#000000' || pbFrameColor === '#8B0000') ? '#FFFFFF' : '#000000'}">KIETSTATION</div>`;

            let stickerHtml = pbActiveStickers.map((s, idx) => `
                <div class="absolute text-5xl pointer-events-auto select-none z-10 cursor-pointer hover:scale-125 transition-transform" 
                     style="left: ${s.x}%; top: ${s.y}%; transform: translate(-50%, -50%) rotate(${s.rotate}deg);"
                     onclick="event.stopPropagation(); pbActiveStickers.splice(${idx},1); updateStripPreview();">
                     ${s.emoji}
                </div>
            `).join('');

            preview.innerHTML = photoHtml + brandingHtml + stickerHtml;
        }

        window.generateStripFinal = async () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            const photoWidth = 800; const photoHeight = 600; const padding = 80; const gap = 40; const footerHeight = 160;
            let finalWidth = photoWidth + (padding * 2);
            let finalHeight = (photoHeight * pbCapturedPhotos.length) + (gap * (pbCapturedPhotos.length - 1)) + (padding * 2) + footerHeight;

            if (pbSelectedLayout === 'g4') {
                finalHeight = photoWidth + gap + (padding * 2) + footerHeight;
            }

            canvas.width = finalWidth; canvas.height = finalHeight;
            ctx.fillStyle = pbFrameColor; ctx.fillRect(0, 0, finalWidth, finalHeight);

            // Photos
            ctx.filter = getCanvasFilter(pbSelectedFilter);
            for (let i = 0; i < pbCapturedPhotos.length; i++) {
                if (!pbCapturedPhotos[i]) continue;
                const img = new Image(); img.src = pbCapturedPhotos[i]; await new Promise(r => img.onload = r);

                if (pbSelectedLayout === 'g4') {
                    const gx = padding + (i % 2) * (photoWidth / 2 + gap / 2);
                    const gy = padding + Math.floor(i / 2) * (photoWidth / 2 + gap / 2);
                    const targetSize = photoWidth / 2;
                    drawCoverImage(ctx, img, targetSize, targetSize, gx, gy);
                } else {
                    const targetY = padding + (i * (photoHeight + gap));
                    drawCoverImage(ctx, img, photoWidth, photoHeight, padding, targetY);
                }
            }
            ctx.filter = 'none';

            // Stickers
            ctx.font = "120px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
            pbActiveStickers.forEach(s => {
                ctx.save();
                ctx.translate((s.x / 100) * finalWidth, (s.y / 100) * finalHeight);
                ctx.rotate(s.rotate * Math.PI / 180);
                ctx.fillText(s.emoji, 0, 0);
                ctx.restore();
            });

            // Branding
            ctx.fillStyle = (pbFrameColor === '#000000' || pbFrameColor === '#8B0000' || pbFrameColor === '#00008B') ? '#FFFFFF' : '#000000';
            ctx.font = 'bold 48px Arial'; ctx.textAlign = 'center';
            ctx.globalAlpha = 0.5;
            ctx.fillText('KIETSTATION', finalWidth / 2, finalHeight - 80);

            const dataUrl = canvas.toDataURL('image/png');
            addToGallery(dataUrl);
            const a = document.createElement('a'); a.href = dataUrl; a.download = `kietsound_pb_${Date.now()}.png`; a.click();

            // Reset to layout screen
            document.getElementById('pb-design-zone').classList.add('hidden');
            document.getElementById('pb-layout-zone').classList.remove('hidden');
            pbCapturedPhotos = new Array(4).fill(null);
            pbActiveStickers = [];
            pbHeldSticker = null;
            if (document.getElementById('pb-held-sticker-indicator')) document.getElementById('pb-held-sticker-indicator').classList.add('hidden');
        };

        function addToGallery(url) {
            const gallery = document.getElementById('pb-gallery');
            if (!gallery) return;
            const item = document.createElement('div');
            item.className = 'flex-shrink-0 relative group';
            item.innerHTML = `<img src="${url}" class="h-32 rounded-lg border-2 border-white/20 shadow-lg hover:scale-105 transition-all cursor-pointer" onclick="window.open('${url}')">`;
            gallery.prepend(item);
        }

        function getCanvasFilter(f) {
            if (f === 'bw') return 'grayscale(1)';
            if (f === 'vintage') return 'sepia(0.5) contrast(1.2) brightness(0.9)';
            if (f === 'bright') return 'saturate(1.4) contrast(1.1) brightness(1.1)';
            if (f === 'cold') return 'hue-rotate(180deg) saturate(0.8) brightness(1.1)';
            return 'none';
        }

        window.addEventListener('DOMContentLoaded', () => {
            initUI();
            showView('home');
        });

/* ---- extracted from index.html L5824 ---- */

// --- DROPDOWN & LOGOUT LOGIC ---
        const userDropdown = document.getElementById('user-dropdown');
        window.toggleUserDropdown = (e) => {
            if (e) e.stopPropagation();
            if (!userDropdown) return;
            const isOpen = !userDropdown.classList.contains('opacity-0');
            if (isOpen) {
                userDropdown.classList.add('opacity-0', 'pointer-events-none', 'translate-y-2');
            } else {
                userDropdown.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-2');
            }
        };

        document.addEventListener('click', () => {
            if (userDropdown) userDropdown.classList.add('opacity-0', 'pointer-events-none', 'translate-y-2');
        });

        window.handleLogout = async () => {
            try {
                window.currentUserUid = null;
                if (window.supabaseClient) await window.supabaseClient.auth.signOut();

                document.getElementById('user-display').textContent = "Guest";
                document.getElementById('login-btn').classList.remove('hidden');
                document.getElementById('user-profile').classList.add('hidden');

                toggleUserDropdown();
                window.location.reload();
            } catch (e) { console.error(e); }
        };

        window.handleLogin = () => {
            if (window.showAuthModal) window.showAuthModal();
        };

        const topLoginBtn = document.getElementById('login-btn');
        const topLogoutBtn = document.getElementById('logout-btn');
        if (topLoginBtn) topLoginBtn.addEventListener('click', handleLogin);
        if (topLogoutBtn) topLogoutBtn.addEventListener('click', handleLogout);

/* ---- extracted from index.html L5976 ---- */

let aiChatHistory = [];
        let activeFriendChat = null;
        let friendChatMessages = [];
        let friendChatRealtimeChannel = null;
        let friendChatProfileChannel = null;
        let friendChatDragState = { active: false, offsetX: 0, offsetY: 0 };
        let friendChatMinimized = false;
        let myPostIds = new Set();
        let appNotifications = JSON.parse(localStorage.getItem('app_notifications') || '[]');
        let unreadNotifications = Number(localStorage.getItem('app_notifications_unread') || 0);
        let globalRealtimeChannel = null;
        let friendUnreadCounts = JSON.parse(localStorage.getItem('friend_unread_counts') || '{}');
        let notifPollingInterval = null;
        let notifSeenEvents = JSON.parse(localStorage.getItem('notif_seen_events') || '[]');
        let notifLastMessageAt = localStorage.getItem('notif_last_message_at') || new Date(0).toISOString();
        let notifLastFriendReqAt = localStorage.getItem('notif_last_friendreq_at') || new Date(0).toISOString();
        let notifLastCommentAt = localStorage.getItem('notif_last_comment_at') || new Date(0).toISOString();

        function toggleAiChat(forceOpen = false) {
            const windowEl = document.getElementById('ai-chat-window');
            const fab = document.getElementById('ai-fab-btn');
            const notif = fab.querySelector('.bg-red-500');

            if (windowEl.classList.contains('hidden') || forceOpen) {
                // Open main menu
                windowEl.classList.remove('hidden');
                setTimeout(() => windowEl.classList.remove('scale-95', 'opacity-0'), 10);
                if (notif) notif.classList.add('hidden'); // Hide notif
                document.getElementById('ai-chat-input').focus();
            } else {
                // Close main menu
                windowEl.classList.add('scale-95', 'opacity-0');
                setTimeout(() => windowEl.classList.add('hidden'), 300);
            }
        }

        function renderFriendChatMessages(messages) {
            const box = document.getElementById('friend-chat-messages');
            if (!box) return;
            const rows = messages || [];
            const myAvatarFallback = avatarFromEmail(document.getElementById('user-email-display')?.textContent || window.currentUserUid);
            box.innerHTML = rows.map((m, idx) => {
                const mine = m.sender_id === window.currentUserUid;
                const myAvatar = (typeof window.currentUserAvatarUrl === 'string' && window.currentUserAvatarUrl)
                    ? window.currentUserAvatarUrl
                    : myAvatarFallback;
                const senderAvatar = mine
                    ? myAvatar
                    : (activeFriendChat?.avatar || avatarFromEmail(activeFriendChat?.id));
                const next = rows[idx + 1];
                const thisTs = m.created_at ? new Date(m.created_at) : null;
                const nextTs = next?.created_at ? new Date(next.created_at) : null;
                const minutesGap = (thisTs && nextTs) ? Math.abs((nextTs - thisTs) / 60000) : 0;
                const endOfGroup = !next || next.sender_id !== m.sender_id || minutesGap > 5;
                const timestamp = thisTs
                    ? thisTs.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : '';
                return `
                    <div class="space-y-1">
                        <div class="flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'}">
                            <img src="${senderAvatar}" class="w-6 h-6 rounded-full border border-white/10 object-cover ${mine ? 'order-2' : ''}">
                            <div class="${mine ? 'bg-primary text-[#0a0a0a] order-1' : 'bg-white/10 text-white'} max-w-[78%] rounded-2xl px-3 py-2 text-[12px] leading-relaxed border border-white/5">
                                ${m.content || ''}
                            </div>
                        </div>
                        ${endOfGroup ? `<p class="text-[10px] text-slate-500 ${mine ? 'text-right pr-8' : 'pl-8'}">${timestamp}</p>` : ''}
                    </div>
                `;
            }).join('');
            box.scrollTop = box.scrollHeight;
        }

        function renderNotifications() {
            const badge = document.getElementById('notif-badge');
            const list = document.getElementById('notif-list');
            if (badge) {
                badge.textContent = unreadNotifications > 99 ? '99+' : String(unreadNotifications);
                badge.classList.toggle('hidden', unreadNotifications <= 0);
            }
            if (!list) return;
            if (!appNotifications.length) {
                list.innerHTML = `<p class="text-xs text-slate-500 p-3 text-center">Chưa có thông báo nào.</p>`;
                return;
            }
            list.innerHTML = appNotifications.slice(0, 40).map(n => {
                const safeId = String(n.id).replace(/'/g, "\\'");
                if (n.type === 'friend_message') {
                    const name = n.friendName || 'Bạn bè';
                    const avatar = n.friendAvatar || avatarFromEmail(n.friendId || n.friendName);
                    const preview = n.preview || n.text || 'Bạn có tin nhắn mới.';
                    return `
                        <div
                            onclick="openNotification('${safeId}')"
                            role="button"
                            class="p-2.5 rounded-xl cursor-pointer select-none ${n.read ? 'bg-white/5' : 'bg-primary/10 border border-primary/20'} hover:bg-white/10 transition-colors flex gap-3 items-center"
                        >
                            <img src="${avatar}" class="w-10 h-10 rounded-2xl object-cover border border-white/10 flex-shrink-0">
                            <div class="min-w-0 flex-1">
                                <p class="text-[11px] font-black text-white truncate">${name}</p>
                                <p class="text-[11px] text-slate-300 truncate">${escapeHtml(preview)}</p>
                                <p class="text-[10px] text-slate-500 mt-0.5">${new Date(n.created_at).toLocaleString()}</p>
                            </div>
                            <span class="material-icons-round text-slate-400 text-[18px] flex-shrink-0">chat</span>
                        </div>
                    `;
                }
                return `
                    <div
                        onclick="openNotification('${safeId}')"
                        role="button"
                        class="p-2.5 rounded-xl cursor-pointer select-none ${n.read ? 'bg-white/5' : 'bg-primary/10 border border-primary/20'} hover:bg-white/10 transition-colors"
                    >
                        <p class="text-[11px] text-white leading-relaxed">${n.text}</p>
                        <p class="text-[10px] text-slate-500 mt-1">${new Date(n.created_at).toLocaleString()}</p>
                    </div>
                `;
            }).join('');
        }

        function persistNotifications() {
            localStorage.setItem('app_notifications', JSON.stringify(appNotifications.slice(0, 100)));
            localStorage.setItem('app_notifications_unread', String(unreadNotifications));
        }

        function persistFriendUnreadCounts() {
            localStorage.setItem('friend_unread_counts', JSON.stringify(friendUnreadCounts));
        }

        function persistNotifWatchState() {
            localStorage.setItem('notif_seen_events', JSON.stringify(notifSeenEvents.slice(-500)));
            localStorage.setItem('notif_last_message_at', notifLastMessageAt);
            localStorage.setItem('notif_last_friendreq_at', notifLastFriendReqAt);
            localStorage.setItem('notif_last_comment_at', notifLastCommentAt);
        }

        function updateFriendUnreadBadge(friendId) {
            const badge = document.getElementById(`friend-unread-${friendId}`);
            if (!badge) return;
            const count = Number(friendUnreadCounts[friendId] || 0);
            if (count <= 0) {
                badge.classList.add('hidden');
                badge.textContent = '0';
            } else {
                badge.classList.remove('hidden');
                badge.textContent = count > 9 ? '9+' : String(count);
            }
        }

        function pushNotification(payload) {
            const text = typeof payload === 'string' ? payload : payload?.text;
            if (!text) return;
            const eventKey = typeof payload === 'string' ? null : (payload?.eventKey || null);
            if (eventKey) {
                if (notifSeenEvents.includes(eventKey)) return;
                notifSeenEvents.push(eventKey);
                persistNotifWatchState();
            }
            const item = {
                id: `n_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                text,
                created_at: new Date().toISOString(),
                read: false,
                type: typeof payload === 'string' ? 'generic' : (payload?.type || 'generic'),
                friendId: typeof payload === 'string' ? null : (payload?.friendId || null),
                friendName: typeof payload === 'string' ? null : (payload?.friendName || null),
                friendAvatar: typeof payload === 'string' ? null : (payload?.friendAvatar || null),
                preview: typeof payload === 'string' ? null : (payload?.preview || null),
                postId: typeof payload === 'string' ? null : (payload?.postId || null),
                action: typeof payload === 'string' ? null : (payload?.action || null)
            };
            appNotifications.unshift(item);
            unreadNotifications += 1;
            persistNotifications();
            renderNotifications();
            if (item.type === 'friend_message') {
                showMessageToast(item);
            } else {
                showSuccessToast(text);
            }
        }

        function ensureMessageToastHost() {
            let host = document.getElementById('message-toast-host');
            if (host) return host;
            host = document.createElement('div');
            host.id = 'message-toast-host';
            host.className = 'fixed bottom-24 right-4 sm:right-6 z-[10001] flex flex-col gap-3 pointer-events-none';
            document.body.appendChild(host);
            return host;
        }

        const messageToastAgg = { byFriend: {} };

        function showMessageToast(notifItem) {
            const host = ensureMessageToastHost();
            const friendId = notifItem.friendId ? String(notifItem.friendId) : '';
            const name = notifItem.friendName || 'Tin nhắn';
            const avatar = notifItem.friendAvatar || avatarFromEmail(notifItem.friendId || notifItem.friendName);
            const preview = notifItem.preview || notifItem.text || 'Bạn có tin nhắn mới.';

            // Aggregate by friend within the toast lifetime
            if (friendId && messageToastAgg.byFriend[friendId]?.elId) {
                const state = messageToastAgg.byFriend[friendId];
                const el = document.getElementById(state.elId);
                if (el) {
                    state.count = Number(state.count || 1) + 1;
                    state.lastNotifId = notifItem.id;
                    const nameEl = el.querySelector('[data-toast-name]');
                    const previewEl = el.querySelector('[data-toast-preview]');
                    const avatarEl = el.querySelector('[data-toast-avatar]');
                    const badgeEl = el.querySelector('[data-toast-count]');
                    if (nameEl) nameEl.textContent = name;
                    if (previewEl) previewEl.textContent = preview;
                    if (avatarEl) avatarEl.src = avatar;
                    if (badgeEl) {
                        badgeEl.textContent = `x${state.count}`;
                        badgeEl.classList.remove('hidden');
                    }
                    // reset auto-close
                    if (state.timeout) clearTimeout(state.timeout);
                    state.timeout = setTimeout(() => {
                        const cur = document.getElementById(state.elId);
                        if (cur) {
                            cur.classList.add('opacity-0', 'translate-y-1');
                            setTimeout(() => cur.remove(), 250);
                        }
                        delete messageToastAgg.byFriend[friendId];
                    }, 4500);
                    // move to top
                    if (el.parentElement === host) host.prepend(el);
                    return;
                }
                delete messageToastAgg.byFriend[friendId];
            }

            const id = `msgtoast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
            const html = document.createElement('div');
            html.id = id;
            html.className = 'pointer-events-auto w-[320px] max-w-[calc(100vw-24px)] bg-white/10 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-fade-in';
            html.innerHTML = `
                <button class="w-full text-left p-3 flex items-center gap-3 hover:bg-white/5 transition-colors" onclick="openNotification('${notifItem.id}')">
                    <div class="relative flex-shrink-0">
                        <img data-toast-avatar src="${avatar}" class="w-11 h-11 rounded-2xl object-cover border border-white/10">
                        <span data-toast-count class="hidden absolute -top-1 -right-1 text-[9px] font-black bg-primary text-black rounded-full px-1.5 py-0.5 border border-black/30">x1</span>
                    </div>
                    <div class="min-w-0 flex-1">
                        <p data-toast-name class="text-xs font-black text-white truncate">${name}</p>
                        <p data-toast-preview class="text-[11px] text-slate-300 truncate">${escapeHtml(preview)}</p>
                    </div>
                    <span class="material-icons-round text-slate-300 text-[18px] flex-shrink-0">chat</span>
                </button>
            `;
            host.prepend(html);

            if (friendId) {
                messageToastAgg.byFriend[friendId] = { elId: id, count: 1, lastNotifId: notifItem.id, timeout: null };
                messageToastAgg.byFriend[friendId].timeout = setTimeout(() => {
                    const el = document.getElementById(id);
                    if (!el) return;
                    el.classList.add('opacity-0', 'translate-y-1');
                    setTimeout(() => el.remove(), 250);
                    delete messageToastAgg.byFriend[friendId];
                }, 4500);
            } else {
                setTimeout(() => {
                    const el = document.getElementById(id);
                    if (!el) return;
                    el.classList.add('opacity-0', 'translate-y-1');
                    setTimeout(() => el.remove(), 250);
                }, 4500);
            }
        }

        function escapeHtml(str) {
            return String(str || '')
                .replaceAll('&', '&amp;')
                .replaceAll('<', '&lt;')
                .replaceAll('>', '&gt;')
                .replaceAll('"', '&quot;')
                .replaceAll("'", '&#039;');
        }

        function avatarFromEmail(email, size = 128) {
            const seed = encodeURIComponent(String(email || '').trim().toLowerCase() || 'user');
            // Deterministic, non-human placeholder avatar (no fake faces)
            return `https://api.dicebear.com/7.x/identicon/svg?seed=${seed}&size=${Number(size) || 128}`;
        }

        const friendProfileCache = {};
        async function getFriendProfile(friendId) {
            const fid = String(friendId || '');
            if (!fid) return { name: 'Bạn bè', avatar: avatarFromEmail('friend') };
            if (friendProfileCache[fid]) return friendProfileCache[fid];

            // Try from current rendered buddy list (if any)
            try {
                const existing = (typeof homeFriends !== 'undefined' ? (homeFriends || []) : []);
                const match = existing.find(f => String(f.id) === fid);
                if (match) {
                    const prof = {
                        name: match.name || match.full_name || 'Bạn bè',
                        avatar: match.avatar || match.avatar_url || avatarFromEmail(match.email || fid)
                    };
                    friendProfileCache[fid] = prof;
                    return prof;
                }
            } catch (e) { /* ignore */ }

            // Fetch from Supabase profiles
            if (window.supabaseClient) {
                try {
                    const { data } = await window.supabaseClient
                        .from('profiles')
                        .select('id, full_name, avatar_url, email')
                        .eq('id', fid)
                        .maybeSingle();
                    const prof = {
                        name: data?.full_name || 'Bạn bè',
                        avatar: data?.avatar_url || avatarFromEmail(data?.email || fid)
                    };
                    friendProfileCache[fid] = prof;
                    return prof;
                } catch (e) { /* ignore */ }
            }

            const fallback = { name: 'Bạn bè', avatar: avatarFromEmail(fid) };
            friendProfileCache[fid] = fallback;
            return fallback;
        }

        // Realtime: keep avatars/names in sync across Home (feed + buddy + chat header)
        let profileRealtimeChannel = null;
        function startProfileRealtimeSync() {
            if (!window.supabaseClient || !window.currentUserUid) return;
            if (profileRealtimeChannel) {
                window.supabaseClient.removeChannel(profileRealtimeChannel);
                profileRealtimeChannel = null;
            }
            const me = window.currentUserUid;
            profileRealtimeChannel = window.supabaseClient
                .channel(`profiles-sync-${me}-${Date.now()}`)
                .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, payload => {
                    const row = payload.new;
                    if (!row || !row.id) return;
                    const id = String(row.id);
                    const nextName = row.full_name || null;
                    const nextAvatar = row.avatar_url || avatarFromEmail(row.email || id);

                    // Invalidate cache for this user
                    try { delete friendProfileCache[id]; } catch (e) { }

                    // Update any DOM images tied to this profile id (Buddy list, requests, etc.)
                    document.querySelectorAll(`img[data-profile-id="${id}"]`).forEach(img => {
                        if (img && img.src !== nextAvatar) img.src = nextAvatar;
                    });

                    // Update feed author avatar if present
                    document.querySelectorAll(`img[data-author-id="${id}"]`).forEach(img => {
                        if (img && img.src !== nextAvatar) img.src = nextAvatar;
                    });

                    // If it's me, also update top avatars
                    if (id === String(me)) {
                        window.currentUserAvatarUrl = nextAvatar;
                        document.querySelectorAll('#user-avatar, #home-create-avatar').forEach(img => {
                            if (img) img.src = nextAvatar;
                        });
                        const profileViewAvatar = document.getElementById('profile-view-avatar');
                        if (profileViewAvatar) profileViewAvatar.src = nextAvatar;
                    }

                    // If currently chatting with this user, update header too
                    if (activeFriendChat?.id && String(activeFriendChat.id) === id) {
                        if (nextName) activeFriendChat.name = nextName;
                        activeFriendChat.avatar = nextAvatar;
                        const nameEl = document.getElementById('friend-chat-name');
                        const avatarEl = document.getElementById('friend-chat-avatar');
                        if (nameEl && nextName) nameEl.textContent = nextName;
                        if (avatarEl) avatarEl.src = nextAvatar;
                        renderFriendChatMessages(friendChatMessages);
                    }

                    // Notifications list may display avatar/name
                    if (typeof renderNotifications === 'function') renderNotifications();
                })
                .subscribe();
        }

        async function pollNotificationsFallback() {
            if (!window.supabaseClient || !window.currentUserUid) return;
            const me = window.currentUserUid;
            await refreshMyPostIds();

            // New incoming messages
            const { data: msgRows } = await window.supabaseClient
                .from('friend_messages')
                .select('id, sender_id, receiver_id, content, created_at')
                .eq('receiver_id', me)
                .gt('created_at', notifLastMessageAt)
                .order('created_at', { ascending: true })
                .limit(30);
            for (const row of (msgRows || [])) {
                notifLastMessageAt = row.created_at || notifLastMessageAt;
                const isChatOpenNow = activeFriendChat?.id === row.sender_id && !document.getElementById('friend-chat-modal')?.classList.contains('hidden');
                if (isChatOpenNow) continue; // đang mở đúng đoạn chat => không popup/không badge

                friendUnreadCounts[row.sender_id] = Number(friendUnreadCounts[row.sender_id] || 0) + 1;
                updateFriendUnreadBadge(row.sender_id);

                const prof = await getFriendProfile(row.sender_id);
                pushNotification({
                    type: 'friend_message',
                    text: `${prof.name} đã nhắn bạn.`,
                    friendId: row.sender_id,
                    friendName: prof.name,
                    friendAvatar: prof.avatar,
                    preview: row.content ? String(row.content).slice(0, 120) : '',
                    eventKey: `msg_${row.id}`
                });
            }

            // New friend requests
            const { data: frRows } = await window.supabaseClient
                .from('friendships')
                .select('id, sender_id, receiver_id, status, created_at')
                .eq('receiver_id', me)
                .eq('status', 'pending')
                .gt('created_at', notifLastFriendReqAt)
                .order('created_at', { ascending: true })
                .limit(30);
            (frRows || []).forEach(row => {
                notifLastFriendReqAt = row.created_at || notifLastFriendReqAt;
                pushNotification({
                    type: 'friend_request',
                    text: 'Bạn có lời mời kết bạn mới.',
                    friendId: row.sender_id,
                    eventKey: `fr_${row.id}`
                });
            });

            // New comments on my posts
            const myIds = Array.from(myPostIds);
            if (myIds.length > 0) {
                const { data: cRows } = await window.supabaseClient
                    .from('post_comments')
                    .select('id, post_id, user_id, created_at')
                    .in('post_id', myIds)
                    .neq('user_id', me)
                    .gt('created_at', notifLastCommentAt)
                    .order('created_at', { ascending: true })
                    .limit(30);
                (cRows || []).forEach(row => {
                    notifLastCommentAt = row.created_at || notifLastCommentAt;
                    pushNotification({
                        type: 'post_comment',
                        text: 'Bài viết của bạn có bình luận mới.',
                        postId: row.post_id,
                        eventKey: `cmt_${row.id}`
                    });
                });
            }

            persistFriendUnreadCounts();
            persistNotifWatchState();
        }

        function startNotificationsEngine() {
            renderNotifications();
            if (!window.supabaseClient || !window.currentUserUid) return;
            refreshMyPostIds();
            setupGlobalRealtimeNotifications();
            if (notifPollingInterval) clearInterval(notifPollingInterval);
            notifPollingInterval = setInterval(() => {
                pollNotificationsFallback().catch(() => { });
            }, 5000);
            pollNotificationsFallback().catch(() => { });
        }

        async function openNotification(notificationId) {
            const notif = appNotifications.find(n => n.id === notificationId);
            if (!notif) return;

            // mark read
            if (!notif.read) {
                notif.read = true;
                unreadNotifications = Math.max(0, unreadNotifications - 1);
                persistNotifications();
                renderNotifications();
            }

            // route
            if (notif.type === 'friend_message') {
                if (!notif.friendId) return;
                // Fetch friend profile if thiếu
                if ((!notif.friendName || !notif.friendAvatar) && window.supabaseClient) {
                    try {
                        const { data } = await window.supabaseClient
                            .from('profiles')
                            .select('id, full_name, avatar_url, email')
                            .eq('id', notif.friendId)
                            .maybeSingle();
                        notif.friendName = data?.full_name || notif.friendName || 'Bạn bè';
                        notif.friendAvatar = data?.avatar_url || notif.friendAvatar || avatarFromEmail(data?.email || notif.friendId);
                    } catch (e) { /* ignore */ }
                }
                window.openFriendChat(notif.friendId, notif.friendName, notif.friendAvatar);
                return;
            }

            if (notif.type === 'friend_request') {
                // Show Buddy System and pending requests
                showView('home');
                setTimeout(() => renderBuddySystem(), 150);
                return;
            }

            if (notif.type === 'post_like' || notif.type === 'post_share' || notif.type === 'post_comment') {
                if (!notif.postId) return;
                showView('home');
                // Ensure feed rendered then scroll into view
                setTimeout(() => {
                    const el = document.getElementById(`post-${notif.postId}`);
                    if (el) {
                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        el.classList.add('border-primary/50');
                        setTimeout(() => el.classList.remove('border-primary/50'), 1500);
                    }
                    if (notif.type === 'post_comment') {
                        const section = document.getElementById(`comment-section-${notif.postId}`);
                        if (section && section.classList.contains('hidden') && typeof window.toggleComment === 'function') {
                            window.toggleComment(notif.postId);
                        }
                    }
                }, 350);
                return;
            }
        }

        window.toggleNotificationsDropdown = (event) => {
            if (event) event.stopPropagation();
            const dd = document.getElementById('notif-dropdown');
            if (!dd) return;
            const open = !dd.classList.contains('opacity-0');
            if (open) dd.classList.add('opacity-0', 'pointer-events-none', 'translate-y-2');
            else dd.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-2');
        };

        window.markAllNotificationsRead = () => {
            appNotifications = appNotifications.map(n => ({ ...n, read: true }));
            unreadNotifications = 0;
            persistNotifications();
            renderNotifications();
        };

        async function refreshMyPostIds() {
            if (!window.supabaseClient || !window.currentUserUid) return;
            const { data } = await window.supabaseClient.from('posts').select('id').eq('author_id', window.currentUserUid);
            myPostIds = new Set((data || []).map(p => p.id));
        }

        function setupGlobalRealtimeNotifications() {
            if (!window.supabaseClient || !window.currentUserUid) return;
            if (globalRealtimeChannel) {
                window.supabaseClient.removeChannel(globalRealtimeChannel);
                globalRealtimeChannel = null;
            }
            const me = window.currentUserUid;
            globalRealtimeChannel = window.supabaseClient
                .channel(`global-notifs-${me}-${Date.now()}`)
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'friend_messages' }, async payload => {
                    const row = payload.new;
                    if (!row || row.receiver_id !== me) return;
                    const isChatOpenNow = activeFriendChat?.id === row.sender_id && !document.getElementById('friend-chat-modal')?.classList.contains('hidden');
                    if (isChatOpenNow) {
                        const exists = friendChatMessages.some(m => m.id && row.id && m.id === row.id);
                        if (!exists) {
                            friendChatMessages.push(row);
                            renderFriendChatMessages(friendChatMessages);
                        }
                        return; // đang mở đúng chat => không thông báo popup/badge
                    } else {
                        friendUnreadCounts[row.sender_id] = Number(friendUnreadCounts[row.sender_id] || 0) + 1;
                        persistFriendUnreadCounts();
                        updateFriendUnreadBadge(row.sender_id);
                    }
                    const prof = await getFriendProfile(row.sender_id);
                    pushNotification({
                        type: 'friend_message',
                        text: `${prof.name} đã nhắn bạn.`,
                        friendId: row.sender_id,
                        friendName: prof.name,
                        friendAvatar: prof.avatar,
                        preview: row.content ? String(row.content).slice(0, 120) : '',
                        eventKey: row.id ? `msg_${row.id}` : null
                    });
                })
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'friendships' }, payload => {
                    const row = payload.new;
                    if (!row) return;
                    if (row.receiver_id === me && row.status === 'pending') pushNotification({
                        type: 'friend_request',
                        action: 'invite',
                        text: 'Bạn có lời mời kết bạn mới.',
                        friendId: row.sender_id
                    });
                })
                .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'posts' }, payload => {
                    const oldRow = payload.old;
                    const row = payload.new;
                    if (!row || !myPostIds.has(row.id) || row.author_id !== me) return;
                    if ((row.likes || 0) > (oldRow.likes || 0)) pushNotification({
                        type: 'post_like',
                        action: 'like',
                        text: 'Bài viết của bạn có lượt thích mới.',
                        postId: row.id
                    });
                    if ((row.shares || 0) > (oldRow.shares || 0)) pushNotification({
                        type: 'post_share',
                        action: 'share',
                        text: 'Bài viết của bạn vừa được chia sẻ.',
                        postId: row.id
                    });
                })
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'post_comments' }, payload => {
                    const row = payload.new;
                    if (!row) return;
                    if (myPostIds.has(row.post_id) && row.user_id !== me) pushNotification({
                        type: 'post_comment',
                        action: 'comment',
                        text: 'Bài viết của bạn có bình luận mới.',
                        postId: row.post_id
                    });
                })
                .subscribe();
        }

        function startFriendChatDrag(clientX, clientY) {
            const modal = document.getElementById('friend-chat-modal');
            if (!modal || modal.classList.contains('hidden')) return;
            const rect = modal.getBoundingClientRect();
            friendChatDragState.active = true;
            friendChatDragState.offsetX = clientX - rect.left;
            friendChatDragState.offsetY = clientY - rect.top;
        }

        function moveFriendChatDrag(clientX, clientY) {
            if (!friendChatDragState.active) return;
            const modal = document.getElementById('friend-chat-modal');
            if (!modal) return;
            const panelW = modal.offsetWidth || 360;
            const panelH = modal.offsetHeight || 560;
            const left = Math.max(8, Math.min(window.innerWidth - panelW - 8, clientX - friendChatDragState.offsetX));
            const top = Math.max(8, Math.min(window.innerHeight - panelH - 8, clientY - friendChatDragState.offsetY));
            modal.style.left = `${left}px`;
            modal.style.top = `${top}px`;
            modal.style.right = 'auto';
            modal.style.bottom = 'auto';
        }

        function stopFriendChatDrag() {
            friendChatDragState.active = false;
        }

        function snapFriendChatToDefault() {
            const modal = document.getElementById('friend-chat-modal');
            if (!modal) return;
            modal.style.left = 'auto';
            modal.style.top = 'auto';
            modal.style.right = '1rem';
            modal.style.bottom = '6rem';
        }

        window.toggleFriendChatMinimize = () => {
            const panel = document.getElementById('friend-chat-panel');
            const msgs = document.getElementById('friend-chat-messages');
            const form = document.getElementById('friend-chat-form');
            const btnIcon = document.querySelector('#friend-chat-min-btn .material-icons-round');
            if (!panel || !msgs || !form) return;

            friendChatMinimized = !friendChatMinimized;
            msgs.classList.toggle('hidden', friendChatMinimized);
            form.classList.toggle('hidden', friendChatMinimized);
            panel.classList.toggle('h-[560px]', !friendChatMinimized);
            panel.classList.toggle('h-[76px]', friendChatMinimized);
            panel.classList.toggle('max-h-[calc(100vh-120px)]', !friendChatMinimized);
            panel.classList.toggle('max-h-[76px]', friendChatMinimized);
            if (btnIcon) btnIcon.textContent = friendChatMinimized ? 'expand_more' : 'remove';
        };

        async function loadFriendMessages() {
            if (!window.supabaseClient || !window.currentUserUid || !activeFriendChat?.id) return;
            const me = window.currentUserUid;
            const fid = activeFriendChat.id;
            const box = document.getElementById('friend-chat-messages');
            if (box) box.innerHTML = `<p class="text-xs text-slate-400">Đang tải tin nhắn...</p>`;

            const { data, error } = await window.supabaseClient
                .from('friend_messages')
                .select('*')
                .or(`and(sender_id.eq.${me},receiver_id.eq.${fid}),and(sender_id.eq.${fid},receiver_id.eq.${me})`)
                .order('created_at', { ascending: true });

            if (error) {
                if (box) {
                    box.innerHTML = `<p class="text-xs text-red-400">Chưa có bảng chat realtime. Tạo bảng \`friend_messages\` trên Supabase để dùng chat 2 chiều realtime.</p>`;
                }
                console.warn('Friend chat load error:', error.message);
                return;
            }
            friendChatMessages = data || [];
            renderFriendChatMessages(friendChatMessages);
        }

        function setupFriendChatRealtime() {
            if (!window.supabaseClient || !window.currentUserUid) return;
            if (friendChatRealtimeChannel) {
                window.supabaseClient.removeChannel(friendChatRealtimeChannel);
                friendChatRealtimeChannel = null;
            }
            if (friendChatProfileChannel) {
                window.supabaseClient.removeChannel(friendChatProfileChannel);
                friendChatProfileChannel = null;
            }

            friendChatRealtimeChannel = window.supabaseClient
                .channel(`friend-chat-${window.currentUserUid}-${Date.now()}`)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'friend_messages' }, payload => {
                    if (!activeFriendChat || !window.currentUserUid) return;
                    const row = payload.new || payload.old;
                    if (!row) return;
                    const me = window.currentUserUid;
                    const fid = activeFriendChat.id;
                    const isThisConversation =
                        (row.sender_id === me && row.receiver_id === fid) ||
                        (row.sender_id === fid && row.receiver_id === me);
                    if (!isThisConversation) return;
                    if (payload.eventType === 'INSERT' && payload.new) {
                        const exists = friendChatMessages.some(m => m.id && payload.new.id && m.id === payload.new.id);
                        if (!exists) {
                            friendChatMessages.push(payload.new);
                            renderFriendChatMessages(friendChatMessages);
                        }
                    } else {
                        loadFriendMessages();
                    }
                })
                .subscribe();

            // Watch profile updates so avatar/name auto-refresh in chat UI
            const me = window.currentUserUid;
            const fid = activeFriendChat?.id;
            if (!fid) return;
            friendChatProfileChannel = window.supabaseClient
                .channel(`friend-chat-profiles-${me}-${fid}-${Date.now()}`)
                .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, payload => {
                    const row = payload.new;
                    if (!row) return;
                    if (row.id !== fid && row.id !== me) return;

                    if (row.id === fid && activeFriendChat) {
                        const nextName = row.full_name || activeFriendChat.name || 'Bạn bè';
                        const nextAvatar = row.avatar_url || avatarFromEmail(row.email || fid);
                        activeFriendChat.name = nextName;
                        activeFriendChat.avatar = nextAvatar;
                        const nameEl = document.getElementById('friend-chat-name');
                        const avatarEl = document.getElementById('friend-chat-avatar');
                        if (nameEl) nameEl.textContent = nextName;
                        if (avatarEl) avatarEl.src = nextAvatar;
                        try { delete friendProfileCache[String(fid)]; } catch (e) { }
                    }

                    if (row.id === me) {
                        const nextMyAvatar = row.avatar_url || avatarFromEmail(row.email || me);
                        window.currentUserAvatarUrl = nextMyAvatar;
                        // Update topbar + home create avatar immediately so my bubbles update too
                        document.querySelectorAll('#user-avatar, #home-create-avatar').forEach(img => {
                            if (img) img.src = nextMyAvatar;
                        });
                        const profileViewAvatar = document.getElementById('profile-view-avatar');
                        if (profileViewAvatar) profileViewAvatar.src = nextMyAvatar;
                        try { delete friendProfileCache[String(me)]; } catch (e) { }
                    }

                    // re-render bubbles (mine uses currentUserAvatarUrl; theirs uses activeFriendChat.avatar)
                    renderFriendChatMessages(friendChatMessages);
                })
                .subscribe();
        }

        window.openFriendChat = async (friendId, friendName, friendAvatar) => {
            if (!window.currentUserUid) return alert('Vui lòng đăng nhập để chat!');
            try { delete friendProfileCache[String(friendId)]; } catch (e) { }
            activeFriendChat = { id: friendId, name: friendName || 'Bạn bè', avatar: friendAvatar || avatarFromEmail(friendId) };

            const modal = document.getElementById('friend-chat-modal');
            const panel = document.getElementById('friend-chat-panel');
            const nameEl = document.getElementById('friend-chat-name');
            const avatarEl = document.getElementById('friend-chat-avatar');
            if (nameEl) nameEl.textContent = activeFriendChat.name;
            if (avatarEl) avatarEl.src = activeFriendChat.avatar;
            if (modal && modal.classList.contains('hidden')) {
                modal.classList.remove('hidden');
                if (!modal.style.left && !modal.style.top) snapFriendChatToDefault();
                setTimeout(() => {
                    if (panel) panel.classList.remove('opacity-0', 'scale-95', 'translate-y-2');
                }, 10);
            }
            if (friendChatMinimized) toggleFriendChatMinimize();
            friendUnreadCounts[friendId] = 0;
            persistFriendUnreadCounts();
            updateFriendUnreadBadge(friendId);

            setupFriendChatRealtime();
            // Pull latest profile once to avoid stale avatar/name
            try {
                const prof = await getFriendProfile(friendId);
                activeFriendChat.name = prof.name || activeFriendChat.name;
                activeFriendChat.avatar = prof.avatar || activeFriendChat.avatar;
                if (nameEl) nameEl.textContent = activeFriendChat.name;
                if (avatarEl) avatarEl.src = activeFriendChat.avatar;
            } catch (e) { /* ignore */ }
            await loadFriendMessages();
            const input = document.getElementById('friend-chat-input');
            if (input) input.focus();
        };

        window.closeFriendChat = () => {
            const modal = document.getElementById('friend-chat-modal');
            const panel = document.getElementById('friend-chat-panel');
            if (modal) {
                if (panel) panel.classList.add('opacity-0', 'scale-95', 'translate-y-2');
                setTimeout(() => modal.classList.add('hidden'), 200);
            }
            if (friendChatProfileChannel && window.supabaseClient) {
                window.supabaseClient.removeChannel(friendChatProfileChannel);
                friendChatProfileChannel = null;
            }
            activeFriendChat = null;
        };

        window.sendFriendMessage = async (event) => {
            if (event) event.preventDefault();
            if (!window.supabaseClient || !window.currentUserUid || !activeFriendChat?.id) return;
            const input = document.getElementById('friend-chat-input');
            const content = input?.value.trim();
            if (!content) return;

            const payload = {
                sender_id: window.currentUserUid,
                receiver_id: activeFriendChat.id,
                content
            };
            friendChatMessages.push({ ...payload, created_at: new Date().toISOString() });
            renderFriendChatMessages(friendChatMessages);
            if (input) input.value = '';
            const { error } = await window.supabaseClient.from('friend_messages').insert([payload]);
            if (error) {
                alert('Gửi tin nhắn thất bại. Kiểm tra bảng friend_messages trên Supabase.');
                console.warn('Friend chat send error:', error.message);
                await loadFriendMessages();
                return;
            }
        };

        document.addEventListener('DOMContentLoaded', () => {
            const dragHandle = document.getElementById('friend-chat-header');
            if (!dragHandle) return;

            dragHandle.addEventListener('mousedown', (e) => {
                if (e.target.closest('button')) return;
                startFriendChatDrag(e.clientX, e.clientY);
            });
            document.addEventListener('mousemove', (e) => moveFriendChatDrag(e.clientX, e.clientY));
            document.addEventListener('mouseup', stopFriendChatDrag);

            dragHandle.addEventListener('touchstart', (e) => {
                if (e.target.closest('button')) return;
                const t = e.touches[0];
                if (!t) return;
                startFriendChatDrag(t.clientX, t.clientY);
            }, { passive: true });
            document.addEventListener('touchmove', (e) => {
                const t = e.touches[0];
                if (!t) return;
                moveFriendChatDrag(t.clientX, t.clientY);
            }, { passive: true });
            document.addEventListener('touchend', stopFriendChatDrag);

            dragHandle.addEventListener('dblclick', (e) => {
                if (e.target.closest('button')) return;
                snapFriendChatToDefault();
            });

            renderNotifications();
            document.addEventListener('click', () => {
                const dd = document.getElementById('notif-dropdown');
                if (dd) dd.classList.add('opacity-0', 'pointer-events-none', 'translate-y-2');
            });
            if (typeof startNotificationsEngine !== 'undefined') startNotificationsEngine();
        });

        async function sendAiMessage(e) {
            e.preventDefault();
            const input = document.getElementById('ai-chat-input');
            const msgs = document.getElementById('ai-chat-messages');
            const submitBtn = document.getElementById('ai-chat-submit');
            const text = input.value.trim();
            if (!text) return;

            // Append User msg
            appendAiMessage(text, 'user');
            input.value = '';
            submitBtn.disabled = true;

            // Append target placeholder for typing
            const tid = 'msg-' + Date.now();
            msgs.insertAdjacentHTML('beforeend', `
                <div id="${tid}" class="flex items-start gap-2">
                    <div class="w-7 h-7 rounded-full bg-primary/20 flex-shrink-0 flex items-center justify-center border border-primary/30">
                        <span class="material-icons-round text-primary text-[12px]">smart_toy</span>
                    </div>
                    <div class="bg-white/10 rounded-2xl rounded-tl-none p-3 text-sm text-white border border-white/5 flex items-center gap-1 shadow-sm h-[42px]">
                        <span class="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                        <span class="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                        <span class="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"></span>
                    </div>
                </div>
            `);
            msgs.scrollTop = msgs.scrollHeight;

            // Push to history
            aiChatHistory.push({ role: 'user', content: text });

            try {
                const res = await fetch('/api/chat/film', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ messages: aiChatHistory.slice(-5) }) // Giới hạn 5 tin nhắn gần nhất để khỏi bị dài
                });
                const data = await res.json();

                const box = document.getElementById(tid);
                if (data.status === 'success') {
                    aiChatHistory.push({ role: 'assistant', content: data.reply });

                    let parsedHtml = data.reply.replace(/\n/g, '<br>');

                    let filmMatches = [];
                    // Pattern 1: [phim: Title] (The requested format)
                    parsedHtml = parsedHtml.replace(/\[phim:(.*?)\]/gi, (match, title) => {
                        const t = title.trim();
                        const id = 'filmcard-' + Math.random().toString(36).substr(2, 9);
                        filmMatches.push({ id, title: t });
                        return `<div id="${id}" class="my-3 p-3 bg-black/40 rounded-2xl border border-white/10 flex items-center gap-3 animate-pulse">
                                    <div class="w-14 h-20 bg-white/10 rounded-xl"></div>
                                    <div class="flex-1 space-y-2"><div class="h-4 w-3/4 bg-white/10 rounded"></div><div class="h-3 w-1/2 bg-white/10 rounded"></div></div>
                                </div>`;
                    });

                    // Pattern 2: Any emphasized title in a list (like "- *"Title"* (2024)" or "- **Title**")
                    // This catches combinations of *, **, _, and "
                    parsedHtml = parsedHtml.replace(/^(?:[-*•\d.]\s+)?([*_"]+)([^*_"]{2,50})\1(\s*\(?\d{4}\)?)?(?=\s*[:–-—]|\s*<br>|\s*$)/gim, (match, prefix, title, year) => {
                        const t = title.trim();
                        const id = 'filmcard-' + Math.random().toString(36).substr(2, 9);
                        filmMatches.push({ id, title: t });
                        return `<div id="${id}" class="my-3 p-3 bg-black/40 rounded-2xl border border-white/10 flex items-center gap-3 animate-pulse">
                                    <div class="w-14 h-20 bg-white/10 rounded-xl"></div>
                                    <div class="flex-1 space-y-2"><div class="h-4 w-3/4 bg-white/10 rounded"></div><div class="h-3 w-1/2 bg-white/10 rounded"></div></div>
                                </div>`;
                    });

                    // Finally, standard bold text fallback
                    parsedHtml = parsedHtml.replace(/\*\*(.*?)\*\*/g, '<strong class="text-primary">$1</strong>');

                    box.outerHTML = `
                        <div class="flex items-start gap-2 animate-fade-in w-[95%]">
                            <div class="w-7 h-7 rounded-full bg-primary/20 flex-shrink-0 flex items-center justify-center border border-primary/30">
                                <span class="material-icons-round text-primary text-[12px]">smart_toy</span>
                            </div>
                            <div class="bg-white/10 rounded-2xl rounded-tl-none p-3.5 text-[13px] text-zinc-200 w-full border border-white/5 shadow-sm leading-relaxed overflow-hidden">
                                ${parsedHtml}
                            </div>
                        </div>
                    `;

                    setTimeout(() => {
                        const msgs = document.getElementById('ai-chat-messages');
                        filmMatches.forEach(async (film) => {
                            const el = document.getElementById(film.id);
                            if (!el) return;
                            try {
                                const res = await fetch(`https://ophim1.com/v1/api/tim-kiem?keyword=${encodeURIComponent(film.title)}&limit=1`);
                                const oData = await res.json();
                                if (oData.status === 'success' && oData.data && oData.data.items && oData.data.items.length > 0) {
                                    const item = oData.data.items[0];
                                    const imgDomain = oData.data.APP_DOMAIN_CDN_IMAGE || 'https://img.ophim.live';
                                    
                                    const isTrailer = (item.episode_current && item.episode_current.toLowerCase().includes('trailer')) || (item.status === 'trailer');
                                    const trailerBadge = isTrailer 
                                        ? '<span class="absolute top-1.5 right-1.5 bg-red-600 text-white text-[7px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-wider z-10 shadow-lg shadow-red-600/50">TRAILER</span>'
                                        : '';

                                    el.className = 'my-3 p-3 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/10 flex items-center gap-4 cursor-pointer transition-all group relative overflow-hidden shadow-xl hover:shadow-primary/5 active:scale-[0.98]';
                                    el.onclick = () => { toggleAiChat(); showView('film'); streamFilmOphim(item.slug, item.name); };
                                    el.innerHTML = `
                                        <div class="w-18 h-24 rounded-xl bg-cover bg-center flex-shrink-0 relative overflow-hidden shadow-lg border border-white/10" style="background-image: url('${imgDomain}/${item.thumb_url}')">
                                            <div class="absolute inset-0 bg-black/50 group-hover:bg-primary/20 transition-all flex items-center justify-center">
                                                <div class="w-10 h-10 bg-primary/80 text-black rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all scale-75 group-hover:scale-100 shadow-xl">
                                                    <span class="material-icons-round text-2xl">${isTrailer ? 'videocam' : 'play_arrow'}</span>
                                                </div>
                                            </div>
                                            ${trailerBadge}
                                        </div>
                                        <div class="flex-1 min-w-0">
                                            <div class="font-bold text-white text-sm group-hover:text-primary transition-colors truncate mb-0.5" title="${item.name}">${item.name}</div>
                                            <div class="text-[10px] text-slate-500 truncate mb-2 leading-tight">${item.origin_name}</div>
                                            <div class="flex items-center justify-between">
                                                <div class="flex items-center gap-1.5">
                                                    <span class="text-[9px] font-black bg-white/10 text-slate-300 px-1.5 py-0.5 rounded uppercase tracking-tighter">${item.year}</span>
                                                    <span class="text-[9px] font-black bg-primary/20 text-primary px-1.5 py-0.5 rounded uppercase tracking-tighter">${isTrailer ? 'COMING' : 'HD'}</span>
                                                </div>
                                                <div class="flex items-center gap-1 text-primary animate-pulse group-hover:animate-none">
                                                    <span class="text-[10px] font-bold uppercase tracking-widest">Xem ngay</span>
                                                    <span class="material-icons-round text-xs">arrow_forward</span>
                                                </div>
                                            </div>
                                        </div>
                                    `;
                                } else {
                                    el.className = 'my-3 p-4 bg-white/5 rounded-2xl border border-dashed border-white/10 flex flex-col items-center text-center gap-2 group cursor-pointer hover:bg-white/10 transition-all';
                                    el.onclick = () => { toggleAiChat(); showView('film'); searchFilmOphimManual(film.title); };
                                    el.innerHTML = `
                                        <span class="material-icons-round text-slate-500 text-3xl mb-1">movie</span>
                                        <div class="text-xs font-bold text-white uppercase tracking-wider">${film.title}</div>
                                        <div class="text-[10px] text-slate-500 mb-2">Không tìm thấy poster nhưng bạn vẫn có thể xem</div>
                                        <div class="bg-primary text-[#0a0a0a] px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 group-hover:scale-105 transition-transform">
                                            Tìm & Xem Ngay <span class="material-icons-round text-xs">open_in_new</span>
                                        </div>
                                    `;
                                }
                            } catch (e) {
                                el.outerHTML = `<strong class="text-primary">${film.title}</strong>`;
                            }
                            msgs.scrollTop = msgs.scrollHeight;
                        });
                    }, 50);

                } else {
                    box.outerHTML = `
                        <div class="flex items-start gap-2 animate-fade-in">
                            <div class="w-7 h-7 rounded-full bg-red-500/20 flex-shrink-0 flex items-center justify-center border border-red-500/30">
                                <span class="material-icons-round text-red-500 text-[12px]">warning</span>
                            </div>
                            <div class="bg-white/10 rounded-2xl rounded-tl-none p-3 text-xs text-red-400 max-w-[85%] border border-red-500/20 shadow-sm leading-relaxed">
                                Lỗi: ${data.message}
                            </div>
                        </div>
                    `;
                }
            } catch (err) {
                document.getElementById(tid).outerHTML = '<div class="text-xs text-red-500 text-center w-full py-2">Mất kết nối tới KietFilm AI Server.</div>';
            }
            msgs.scrollTop = msgs.scrollHeight;
            submitBtn.disabled = false;
            input.focus();
        }

        function appendAiMessage(text, role) {
            const msgs = document.getElementById('ai-chat-messages');
            if (role === 'user') {
                msgs.insertAdjacentHTML('beforeend', `
                    <div class="flex items-end justify-end gap-2 animate-fade-in">
                        <div class="bg-primary text-[#0a0a0a] rounded-2xl rounded-tr-none p-3 text-[13px] font-medium max-w-[85%] shadow-md">
                            ${text.replace(/</g, '&lt;')}
                        </div>
                        <div class="w-7 h-7 rounded-full bg-white/10 flex-shrink-0 flex items-center justify-center border border-white/20">
                            <span class="material-icons-round text-slate-300 text-[12px]">person</span>
                        </div>
                    </div>
                `);
            }
            msgs.scrollTop = msgs.scrollHeight;
        }

/* ---- extracted from index.html L7119 ---- */

// Supabase Setup
        const SUPABASE_URL = 'https://kdvhawbcduqdidkysvcq.supabase.co';
        const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtkdmhhd2JjZHVxZGlka3lzdmNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwOTkyMDMsImV4cCI6MjA5MDY3NTIwM30.LdL-5L_z3Phs6rDtmCkPtIJMw1tp9U2ny0rsUm412cw';
        window.supabaseClient = null;
        let selectedVideoDeviceId = localStorage.getItem('kiet-camera-id') || null;
        let cameraDevices = [];

        async function refreshCameraDevices() {
            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                cameraDevices = devices.filter(d => d.kind === 'videoinput');
                
                // Auto-detect if selected camera was unplugged
                if (selectedVideoDeviceId && !cameraDevices.find(d => d.deviceId === selectedVideoDeviceId)) {
                    console.log("Selected camera unplugged, falling back...");
                    selectedVideoDeviceId = cameraDevices.length > 0 ? cameraDevices[0].deviceId : null;
                    if (selectedVideoDeviceId) handleCameraChange(selectedVideoDeviceId);
                }

                syncAllCameraSelectors();
            } catch (e) { console.error("Enumerate Error", e); }
        }
        
        // Auto-detect new cameras
        if (navigator.mediaDevices) {
            navigator.mediaDevices.ondevicechange = refreshCameraDevices;
        }

        function syncAllCameraSelectors() {
            const selectors = document.querySelectorAll('.camera-select-dropdown');
            selectors.forEach(select => {
                const currentVal = select.value || selectedVideoDeviceId;
                select.innerHTML = cameraDevices.map(d => `<option value="${d.deviceId}" ${d.deviceId === currentVal ? 'selected' : ''}>${d.label || 'Camera ' + (cameraDevices.indexOf(d)+1)}</option>`).join('');
                if (cameraDevices.length > 0 && !selectedVideoDeviceId) {
                    // Default to first if none saved
                    // selectedVideoDeviceId = cameraDevices[0].deviceId;
                }
            });
        }

        async function handleCameraChange(deviceId) {
            selectedVideoDeviceId = deviceId;
            localStorage.setItem('kiet-camera-id', deviceId);
            syncAllCameraSelectors();
            
            // Hot-switch if active
            if (activeView === 'home') initCamera();
            if (activeView === 'photobooth') initPhotoboothCamera();
            // Watch Party hot-switch
            if (activeView === 'film' && partyId) {
                // Re-init with same ID to refresh stream
                initPartyChannel(partyId);
            }
        }

        try {
            if (window.supabase) {
                window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            }
        } catch (e) {
            console.error("Supabase init failed", e);
        }

        // --- SUPABASE AUTHENTICATION LOGIC ---
        let isLoginMode = true;

        window.toggleAuthMode = () => {
            isLoginMode = !isLoginMode;
            const nameInput = document.getElementById('auth-fullname');
            const authBtn = document.getElementById('auth-btn');
            const toggleBtn = document.getElementById('auth-toggle-btn');
            document.getElementById('auth-error').classList.add('hidden');

            if (isLoginMode) {
                nameInput.classList.add('hidden');
                authBtn.innerHTML = '<span class="material-icons-round text-[18px]">login</span> ĐĂNG NHẬP';
                toggleBtn.innerText = 'Chưa có tài khoản? Nhấn để Đăng ký ngay';
            } else {
                nameInput.classList.remove('hidden');
                authBtn.innerHTML = '<span class="material-icons-round text-[18px]">person_add</span> TẠO TÀI KHOẢN MỚI';
                toggleBtn.innerText = 'Đã có tài khoản? Đăng nhập ngay';
            }
        };

        window.showAuthModal = () => {
            const modal = document.getElementById('auth-modal');
            const content = document.getElementById('auth-modal-content');
            if (modal) {
                modal.classList.remove('hidden', 'opacity-0', 'pointer-events-none');
                setTimeout(() => content.classList.remove('scale-95'), 10);
            }
        };

        window.hideAuthModal = () => {
            const modal = document.getElementById('auth-modal');
            const content = document.getElementById('auth-modal-content');
            if (modal && content) {
                content.classList.add('scale-95');
                setTimeout(() => modal.classList.add('opacity-0', 'pointer-events-none'), 10);
                setTimeout(() => modal.classList.add('hidden'), 300);
            }
        };

        window.skipAuthForNow = () => {
            hideAuthModal();
        };

        window.handleAuthAction = async () => {
            if (!window.supabaseClient) {
                return showAuthError("Mã API KEY không hợp lệ. Hãy kiểm tra lại SUPABASE_ANON_KEY.");
            }

            const emailEl = document.getElementById('auth-email');
            const passEl = document.getElementById('auth-password');
            const nameEl = document.getElementById('auth-fullname');

            const email = emailEl ? emailEl.value.trim() : '';
            const password = passEl ? passEl.value.trim() : '';
            const fullName = nameEl ? nameEl.value.trim() : '';
            const authBtn = document.getElementById('auth-btn');

            if (!email || !password) return showAuthError("Thiếu Email hoặc Mật khẩu!");
            if (!email.includes('@')) return showAuthError("Định dạng Email không hợp lệ!");

            const prevHtml = authBtn.innerHTML;
            authBtn.innerHTML = `<span class="material-icons-round animate-spin text-[18px]">autorenew</span> ĐANG XỬ LÝ...`;
            authBtn.disabled = true;

            try {
                if (isLoginMode) {
                    const { data, error } = await window.supabaseClient.auth.signInWithPassword({ email, password });
                    if (error) throw error;
                    handleLoginSuccess(data.user);
                } else {
                    if (!fullName) throw new Error("Vui lòng điền Họ và Tên của bạn!");
                    // Register
                    const { data, error } = await window.supabaseClient.auth.signUp({
                        email, password,
                        options: { data: { full_name: fullName } }
                    });
                    if (error) throw error;

                    // Automatically create profile on DB
                    if (data.user) {
                        const { error: profileErr } = await window.supabaseClient.from('profiles').insert([{
                            id: data.user.id,
                            username: email.split('@')[0] + Math.floor(Math.random() * 1000), // unique username
                            full_name: fullName,
                            email: email,
                            avatar_url: avatarFromEmail(email)
                        }]);
                        if (profileErr) console.warn("Profile creation warn:", profileErr);
                        handleLoginSuccess(data.user);
                    } else {
                        showAuthError("Đăng ký thành công! Hãy kiểm tra hòm thư Email để xác nhận.");
                    }
                }
            } catch (err) {
                let msg = err.message;
                if (msg.includes('Invalid login credentials')) msg = "Tài khoản hoặc Mật khẩu không đúng.";
                if (msg.includes('already registered')) msg = "Email này đã được đăng ký, vui lòng Đăng nhập.";
                showAuthError(msg);
            } finally {
                authBtn.innerHTML = prevHtml;
                authBtn.disabled = false;
            }
        };

        function showAuthError(msg) {
            const el = document.getElementById('auth-error');
            if (el) {
                el.innerText = msg;
                el.classList.remove('hidden');
            }
        }

        window.handleLoginSuccess = (user) => {
            window.currentUserUid = user.id;
            hideAuthModal();

            const dispName = user.user_metadata?.full_name || user.email.split('@')[0];
            const avatar = avatarFromEmail(user.email || user.id);

            // Sync UI Display globals
            document.querySelectorAll('#user-display').forEach(el => el.innerText = dispName);
            document.querySelectorAll('#user-avatar, #home-create-avatar').forEach(img => img.src = avatar);
            window.currentUserAvatarUrl = avatar;

            // Sync email to profiles table for searchability (UPSERT - create if missing)
            if (window.supabaseClient) {
                // Do not force avatar_url here: default avatar is derived from email.
                window.supabaseClient.from('profiles').upsert({
                    id: user.id,
                    email: user.email,
                    full_name: dispName,
                    username: user.email.split('@')[0] + Math.floor(Math.random() * 100)
                }, { onConflict: 'id' }).then(res => {
                    if (res.error) console.warn('Profile sync error:', res.error);
                    else console.log('Profile synced OK for:', user.email);
                });
            }

            // Update Auth Button State
            const loginBtn = document.getElementById('login-btn');
            const userProfile = document.getElementById('user-profile');
            if (loginBtn) loginBtn.classList.add('hidden');
            if (userProfile) userProfile.classList.remove('hidden');

            // Re-render Views
            if (typeof fetchHomePosts !== 'undefined') fetchHomePosts();
            if (typeof renderBuddySystem !== 'undefined') renderBuddySystem();
            if (typeof loadFavorites !== 'undefined') loadFavorites();
            if (typeof loadPlaylists !== 'undefined') loadPlaylists();

            // Setup Realtime after login
            if (typeof setupRealtimeNewsfeed !== 'undefined') setupRealtimeNewsfeed();
            if (typeof startNotificationsEngine !== 'undefined') startNotificationsEngine();
            if (typeof startProfileRealtimeSync !== 'undefined') startProfileRealtimeSync();

            // Hydrate Profile View
            if (typeof loadUserProfile !== 'undefined') loadUserProfile();

            const toast = document.createElement('div');
            toast.className = 'fixed top-10 right-4 z-[99999] bg-green-500/20 shadow-lg border border-green-500/40 text-green-400 font-bold px-6 py-3 rounded-xl animate-fade-in flex items-center gap-2';
            toast.innerHTML = `<span class="material-icons-round">check_circle</span> Xin chào ${dispName}! Đăng nhập thành công.`;
            document.body.appendChild(toast);
            setTimeout(() => { toast.classList.add('opacity-0'); setTimeout(() => toast.remove(), 300) }, 3000);
        };

        // --- PROFILE VIEW LOGIC ---
        window.loadUserProfile = async () => {
            const uid = window.currentUserUid;
            if (!uid || !window.supabaseClient) return;

            const { data: { user } } = await window.supabaseClient.auth.getUser();
            if (!user) return;

            let name = user.user_metadata?.full_name || user.email.split('@')[0];
            let email = user.email;
            let avatar = avatarFromEmail(email || user.id);
            let dob = "";

            try {
                const { data: profile } = await window.supabaseClient.from('profiles').select('*').eq('id', uid).single();
                if (profile) {
                    name = profile.full_name || name;
                    if (profile.avatar_url && profile.avatar_url !== "") avatar = profile.avatar_url;
                }
                // SYNC: Ensure email is in profiles for search
                if (email) {
                    await window.supabaseClient.from('profiles').update({ email: email }).eq('id', uid);
                }
            } catch (e) {
                console.warn("Profile sync error:", e);
            }

            // Check localStorage for offline data/overrides
            const savedData = JSON.parse(localStorage.getItem(`profile_${uid}`)) || {};
            if (savedData.dob) dob = savedData.dob;
            if (savedData.avatar) avatar = savedData.avatar;

            // Profile Card elements
            const nameEl = document.getElementById('profile-view-name');
            const emailEl = document.getElementById('profile-view-email');
            const avatarEl = document.getElementById('profile-view-avatar');

            // Setting Inputs
            const inName = document.getElementById('profile-input-name');
            const inEmail = document.getElementById('profile-input-email');
            const inDob = document.getElementById('profile-input-dob');

            if (nameEl) nameEl.textContent = name;
            if (emailEl) emailEl.textContent = email;
            if (avatarEl) avatarEl.src = avatar;

            if (inName) inName.value = name;
            if (inEmail) inEmail.value = email;
            if (inDob) inDob.value = dob;

            // Global UI Sync
            const userEmailDisp = document.getElementById('user-email-display');
            if (userEmailDisp) userEmailDisp.textContent = email;

            const userTopName = document.getElementById('user-display');
            if (userTopName) userTopName.textContent = name;

            const userTopAvatar = document.querySelectorAll('#user-avatar, #home-create-avatar');
            userTopAvatar.forEach(img => img.src = avatar);
            window.currentUserAvatarUrl = avatar;
        };

        window.saveUserProfile = async (event) => {
            const uid = window.currentUserUid;
            if (!uid || !window.supabaseClient) return;

            const btn = event ? event.currentTarget : null;
            const inName = document.getElementById('profile-input-name');
            const inDob = document.getElementById('profile-input-dob');
            const name = inName ? inName.value.trim() : '';
            const dob = inDob ? inDob.value : '';

            if (!name) return alert("Vui lòng nhập họ tên!");

            const origHtml = btn ? btn.innerHTML : "";
            if (btn) btn.innerHTML = '<span class="material-icons-round animate-spin">autorenew</span> Đang lưu...';

            try {
                const { error } = await window.supabaseClient.from('profiles')
                    .update({ full_name: name })
                    .eq('id', uid);

                const existingData = JSON.parse(localStorage.getItem(`profile_${uid}`)) || {};
                existingData.dob = dob;
                localStorage.setItem(`profile_${uid}`, JSON.stringify(existingData));

                if (error) throw error;

                alert("Đã lưu thông tin cá nhân! ✨");
                loadUserProfile();
            } catch (e) {
                alert("Lỗi khi lưu: " + e.message);
            } finally {
                if (btn) btn.innerHTML = origHtml;
            }
        };

        window.handleAvatarUpload = (event) => {
            const file = event.target.files[0];
            if (!file || !window.currentUserUid) return;

            const reader = new FileReader();
            reader.onload = async (e) => {
                const base64 = e.target.result;
                const uid = window.currentUserUid;

                const existingData = JSON.parse(localStorage.getItem(`profile_${uid}`)) || {};
                existingData.avatar = base64;
                localStorage.setItem(`profile_${uid}`, JSON.stringify(existingData));

                loadUserProfile();

                if (window.supabaseClient) {
                    await window.supabaseClient.from('profiles').update({ avatar_url: base64 }).eq('id', uid);
                }
            };
            reader.readAsDataURL(file);
        };

        document.addEventListener('DOMContentLoaded', async () => {
            if (window.supabaseClient) {
                const { data: { session } } = await window.supabaseClient.auth.getSession();
                if (session && session.user) {
                    handleLoginSuccess(session.user);
                } else {
                    setTimeout(showAuthModal, 1000);
                }
            } else {
                setTimeout(showAuthModal, 1000); // Wait for boot
            }
        });

        // Mock State Data
        let homePosts = [
            {
                id: 1,
                author: { name: 'Kiet AI System', avatar: 'https://cdn-icons-png.flaticon.com/512/12204/12204300.png' },
                content: 'Hệ thống Trạm Dừng Chân (KietStation) đã hoàn thiện bản Alpha. Chúc các bạn trải nghiệm vui vẻ! 🎉',
                media: null,
                privacy: 'public',
                likes: 42,
                time: '2 phút trước'
            },
            {
                id: 2,
                author: { name: 'Admin', avatar: 'https://i.pravatar.cc/150?img=11' },
                content: 'Vừa cày xong bộ phim hay tuyệt trên KietFilm! Đề xuất mọi người xem thử nhé.',
                media: 'https://img.ophim.live/uploads/movies/biet-doi-danh-thue-4-poster.jpg',
                privacy: 'public',
                likes: 12,
                time: '1 giờ trước'
            }
        ];

        let homeFriends = [
            { id: 101, name: 'Tú Linh', email: 'tulinh@gmail.com', avatar: 'https://i.pravatar.cc/150?img=5' },
            { id: 102, name: 'Hoàng Phong', email: 'phong.ng@gmail.com', avatar: 'https://i.pravatar.cc/150?img=8' }
        ];

        let homeFriendRequests = [
            { id: 201, name: 'Minh Anh', email: 'manh@station.com', avatar: 'https://i.pravatar.cc/150?img=9' }
        ];

        let homePostSelectedMedia = '';
        let homePostSelectedMediaList = [];
        let postCommentsMap = {};
        let commentsRealtimeSetup = false;
        window.profileFeedPosts = [];
        window.profileViewTargetUid = null;

        window.openUserProfile = (uid) => {
            if (!uid) return;
            if (!window.currentUserUid) {
                alert('Vui lòng đăng nhập để xem trang cá nhân.');
                return;
            }
            window.profileViewTargetUid = String(uid) === String(window.currentUserUid) ? null : uid;
            showView('guide');
        };

        function findFeedPost(postId) {
            const id = String(postId);
            const fromHome = homePosts.find(p => String(p.id) === id);
            if (fromHome) return fromHome;
            return (window.profileFeedPosts || []).find(p => String(p.id) === id);
        }

        window.handleHomePostImageUpload = (event) => {
            const files = Array.from(event?.target?.files || []).filter(Boolean);
            if (files.length === 0) return;

            const mediaInput = document.getElementById('home-post-media-url');
            const mediaContainer = document.getElementById('home-post-media-container');
            if (mediaInput) mediaInput.value = `[Đã chọn ${files.length} ảnh từ máy]`;
            if (mediaContainer) mediaContainer.classList.remove('hidden');

            // Reset & load previews
            homePostSelectedMediaList = [];
            homePostSelectedMedia = '';
            const readers = files.map(f => new Promise((resolve) => {
                const r = new FileReader();
                r.onload = () => resolve(String(r.result || ''));
                r.readAsDataURL(f);
            }));
            Promise.all(readers).then(urls => {
                homePostSelectedMediaList = (urls || []).filter(Boolean);
                renderHomePostMediaPreview();
            });
        };

        window.clearHomePostMedia = () => {
            const mediaContainer = document.getElementById('home-post-media-container');
            const mediaInput = document.getElementById('home-post-media-url');
            const fileInput = document.getElementById('home-post-media-file');
            homePostSelectedMedia = '';
            homePostSelectedMediaList = [];
            if (mediaInput) mediaInput.value = '';
            if (fileInput) fileInput.value = '';
            if (mediaContainer) mediaContainer.classList.add('hidden');
            renderHomePostMediaPreview();
        };

        function renderHomePostMediaPreview() {
            const box = document.getElementById('home-post-media-preview');
            const grid = document.getElementById('home-post-media-preview-grid');
            if (!box || !grid) return;
            const list = homePostSelectedMediaList || [];
            if (list.length === 0) {
                box.classList.add('hidden');
                grid.innerHTML = '';
                return;
            }
            box.classList.remove('hidden');
            grid.innerHTML = list.map((src, idx) => `
                <div class="relative group rounded-xl overflow-hidden border border-white/10 bg-black/40">
                    <img src="${src}" class="w-full h-20 object-cover">
                    <button type="button" onclick="removeHomePostSelectedImage(${idx})" class="absolute top-1 right-1 w-7 h-7 rounded-full bg-black/60 hover:bg-red-500/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                        <span class="material-icons-round text-[14px]">close</span>
                    </button>
                </div>
            `).join('');
        }

        window.removeHomePostSelectedImage = (idx) => {
            const i = Number(idx);
            if (Number.isNaN(i)) return;
            homePostSelectedMediaList = (homePostSelectedMediaList || []).filter((_, k) => k !== i);
            const mediaInput = document.getElementById('home-post-media-url');
            if (mediaInput) {
                mediaInput.value = homePostSelectedMediaList.length > 0
                    ? `[Đã chọn ${homePostSelectedMediaList.length} ảnh từ máy]`
                    : '';
            }
            if (homePostSelectedMediaList.length === 0) {
                const fileInput = document.getElementById('home-post-media-file');
                if (fileInput) fileInput.value = '';
                const mediaContainer = document.getElementById('home-post-media-container');
                if (mediaContainer) mediaContainer.classList.add('hidden');
            }
            renderHomePostMediaPreview();
        };

        function getLocalPostComments(postId) {
            return JSON.parse(localStorage.getItem(`post_comments_${postId}`) || '[]');
        }

        function saveLocalPostComments(postId, comments) {
            localStorage.setItem(`post_comments_${postId}`, JSON.stringify(comments || []));
        }

        function renderPostComments(postId) {
            const commentsList = document.getElementById(`comments-list-${postId}`);
            if (!commentsList) return;
            const comments = postCommentsMap[postId] || [];
            commentsList.innerHTML = comments.map(c => `
                <div class="flex gap-2 items-start animate-fade-in">
                    <img src="${c.author_avatar || 'https://i.pravatar.cc/150?img=1'}" class="w-7 h-7 rounded-full border border-white/10 flex-shrink-0">
                    <div class="bg-white/5 rounded-xl px-3 py-2 flex-1">
                        <p class="text-[10px] font-bold text-primary">${c.author_name || 'User'}</p>
                        <p class="text-[11px] text-slate-300">${c.content || ''}</p>
                    </div>
                </div>
            `).join('');
        }

        async function loadCommentsForPosts(postIds) {
            const ids = (postIds || []).filter(Boolean);
            if (ids.length === 0) return;

            try {
                const { data, error } = await window.supabaseClient
                    .from('post_comments')
                    .select('*')
                    .in('post_id', ids)
                    .order('created_at', { ascending: true });

                if (error) throw error;

                const byPost = {};
                (data || []).forEach(c => {
                    if (!byPost[c.post_id]) byPost[c.post_id] = [];
                    byPost[c.post_id].push(c);
                });
                ids.forEach(id => {
                    postCommentsMap[id] = byPost[id] || [];
                });
            } catch (e) {
                ids.forEach(id => {
                    postCommentsMap[id] = getLocalPostComments(id);
                });
            }

            homePosts = homePosts.map(p => ({
                ...p,
                commentsCount: (postCommentsMap[p.id] || []).length
            }));
            if (window.profileFeedPosts && window.profileFeedPosts.length) {
                window.profileFeedPosts = window.profileFeedPosts.map(p => ({
                    ...p,
                    commentsCount: (postCommentsMap[p.id] || []).length
                }));
            }
        }

        function syncLocalInteractionStates() {
            // Only sync shares from localStorage (likes are now fully DB-driven via liked_by)
            homePosts = homePosts.map(p => ({
                ...p,
                shares: Math.max(Number(p.shares || 0), Number(localStorage.getItem(`post_shares_${p.id}`) || 0)),
                commentsCount: (postCommentsMap[p.id] || []).length
            }));
            if (window.profileFeedPosts && window.profileFeedPosts.length) {
                window.profileFeedPosts = window.profileFeedPosts.map(p => ({
                    ...p,
                    shares: Math.max(Number(p.shares || 0), Number(localStorage.getItem(`post_shares_${p.id}`) || 0)),
                    commentsCount: (postCommentsMap[p.id] || []).length
                }));
            }
        }

        function buildPostMediaHtml(media, postId) {
            if (!media) return '';
            const raw = String(media);
            const mediaValue = raw.toLowerCase();
            if (raw.trim().startsWith('[')) {
                try {
                    const arr = JSON.parse(raw);
                    const imgs = Array.isArray(arr) ? arr.filter(Boolean) : [];
                    if (imgs.length === 1) {
                        return `
                            <div class="mt-3 border-t border-b border-white/5 bg-black/40 cursor-pointer hover:opacity-90 transition-opacity" onclick="openMediaViewer('${postId}',0)">
                                <img src="${imgs[0]}" class="w-full object-cover max-h-[520px]">
                            </div>
                        `;
                    }
                    if (imgs.length > 1) {
                        const dots = imgs.map((_, i) => `
                            <button type="button" onclick="postMediaGo('${postId}',${i})" class="w-2 h-2 rounded-full ${i === 0 ? 'bg-white' : 'bg-white/30'}" id="post-media-dot-${postId}-${i}"></button>
                        `).join('');
                        return `
                            <div class="mt-3 border-t border-b border-white/5 bg-black/40 relative">
                                <button type="button" onclick="postMediaPrev('${postId}')" class="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center transition-all">
                                    <span class="material-icons-round">chevron_left</span>
                                </button>
                                <button type="button" onclick="postMediaNext('${postId}')" class="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center transition-all">
                                    <span class="material-icons-round">chevron_right</span>
                                </button>
                                <div class="absolute top-2 right-2 z-10 text-[10px] font-black text-white bg-black/50 rounded-full px-2 py-1 border border-white/10">
                                    <span id="post-media-counter-${postId}">1/${imgs.length}</span>
                                </div>
                                <div id="post-media-strip-${postId}" class="w-full flex overflow-x-auto no-scrollbar snap-x snap-mandatory scroll-smooth cursor-pointer" onscroll="syncPostMediaDots('${postId}')">
                                    ${imgs.map((src, i) => `
                                        <div class="w-full flex-shrink-0 snap-center" onclick="openMediaViewer('${postId}',${i})">
                                            <div class="block w-full hover:opacity-90 transition-opacity">
                                                <img src="${src}" class="w-full max-h-[520px] object-cover">
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                                <div class="flex items-center justify-center gap-2 py-2">${dots}</div>
                            </div>
                        `;
                    }
                } catch (e) { /* fall through */ }
                return `<img onclick="openMediaViewer('${postId}',0)" src="${raw}" class="w-full mt-3 border-t border-b border-white/5 object-cover max-h-[500px] cursor-pointer hover:opacity-90 transition-opacity">`;
            }
            if (mediaValue.endsWith('.mp4') || mediaValue.endsWith('.webm')) {
                return `<video src="${raw}" controls class="w-full mt-3 border-t border-b border-white/5 bg-black/50 max-h-[500px]"></video>`;
            }
            return `<img onclick="openMediaViewer('${postId}',0)" src="${raw}" class="w-full mt-3 border-t border-b border-white/5 object-cover max-h-[500px] cursor-pointer hover:opacity-90 transition-opacity">`;
        }

        function homePostCardHtml(post) {
            let isSharedPost = false;
            let displayContent = String(post.content || '');
            let sharedHeaderHtml = '';

            if (displayContent.startsWith('🔁 Chia sẻ từ')) {
                isSharedPost = true;
                const lines = displayContent.split('\n\n');
                const headerLine = lines[0];
                const actualContent = lines.slice(1).join('\n\n');

                let authorHtml = `<span class="opacity-70">${headerLine.replace('🔁 Chia sẻ từ ', '')}</span>`;
                try {
                    const authorInfo = JSON.parse(headerLine.replace('🔁 Chia sẻ từ ', ''));
                    authorHtml = `
                        <div class="flex items-center gap-1.5 cursor-pointer hover:underline" onclick="openUserProfile('${authorInfo.uid}')">
                            <img src="${authorInfo.avatar}" class="w-4 h-4 rounded-full border border-white/10 object-cover">
                            <span>${authorInfo.name}</span>
                        </div>
                    `;
                } catch (e) {
                    // Fallback for old shared posts format
                    const rawNameWithColon = headerLine.replace('🔁 Chia sẻ từ ', '').replace(':', '');
                    authorHtml = `<span>${rawNameWithColon}</span>`;
                }

                sharedHeaderHtml = `<div class="mb-2 text-[12px] font-bold text-primary flex items-center gap-1.5"><span class="material-icons-round text-sm">share</span> ${authorHtml}</div>`;
                displayContent = actualContent;
            }

            const mediaHtml = buildPostMediaHtml(post.media, post.id);
            let privIcon = 'public';
            if (post.privacy === 'friends') privIcon = 'people';
            if (post.privacy === 'private') privIcon = 'lock';
            const authorClick = post.authorId ? `onclick="openUserProfile('${post.authorId}')" ` : '';
            const safeContent = displayContent.replace(/\n/g, '<br>');

            let postBodyHtml = `
                <div class="px-4 pb-3 text-[14px] text-slate-100 leading-relaxed">
                    ${safeContent}
                </div>
                ${mediaHtml}
            `;

            if (isSharedPost) {
                const parts = displayContent.split('\n\n');
                const userStatus = parts.length > 1 ? parts[0] : '';
                const originalContent = parts.length > 1 ? parts.slice(1).join('\n\n') : parts[0];

                postBodyHtml = `
                    <div class="px-4 pb-3 space-y-3">
                        ${userStatus ? `<div class="text-[14px] text-slate-100 leading-relaxed translate-y-1">${userStatus.replace(/\n/g, '<br>')}</div>` : ''}
                        <div class="p-4 border border-white/10 rounded-[1.5rem] bg-white/5 hover:border-white/20 transition-all space-y-3">
                            <div class="flex items-center justify-between border-b border-white/5 pb-2">
                                ${sharedHeaderHtml}
                                <span class="bg-primary/20 text-primary text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-tighter">Shared Content</span>
                            </div>
                            <div class="text-[13px] text-slate-200 leading-relaxed italic">
                                ${originalContent.replace(/\n/g, '<br>') || '<span class="opacity-40 italic">Không có nội dung văn bản</span>'}
                            </div>
                            <div class="mt-2 scale-95 origin-top-left">${mediaHtml}</div>
                        </div>
                    </div>
                `;
            }

            return `
                <div class="glass-card rounded-2xl border border-white/10 shadow-lg hover:border-white/20 transition-all overflow-hidden" id="post-${post.id}">
                    <div class="flex items-center gap-3 p-4 pb-2">
                        <img ${authorClick} data-author-id="${post.authorId || ''}" src="${post.author.avatar}" class="w-10 h-10 rounded-full border-2 border-white/10 object-cover flex-shrink-0 cursor-pointer hover:border-primary/50 transition-colors">
                        <div class="flex-1 min-w-0">
                            <h4 ${authorClick} class="text-[13px] font-bold text-white hover:underline cursor-pointer">${post.author.name}</h4>
                            <div class="flex items-center gap-1.5 text-[10px] text-slate-500 font-medium">
                                <span>${post.time}</span>
                                <span class="w-1 h-1 rounded-full bg-slate-600"></span>
                                <span class="material-icons-round text-[11px]">${privIcon}</span>
                            </div>
                        </div>
                        <div class="relative">
                        <button onclick="togglePostMenu('${post.id}')" class="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-slate-500 hover:text-white transition-all">
                            <span class="material-icons-round text-lg">more_horiz</span>
                        </button>
                        <div id="post-menu-${post.id}" class="hidden absolute right-0 mt-2 w-44 rounded-2xl border border-white/10 bg-black/80 backdrop-blur-xl shadow-2xl overflow-hidden z-50">
                            <button onclick="editPost('${post.id}')" class="w-full px-3 py-2.5 text-left text-xs font-bold text-slate-200 hover:bg-white/10 flex items-center gap-2 ${String(post.authorId) !== String(window.currentUserUid) ? 'hidden' : ''}">
                                <span class="material-icons-round text-sm text-primary">edit</span> Chỉnh sửa bài viết
                            </button>
                            <button onclick="deletePost('${post.id}')" class="w-full px-3 py-2.5 text-left text-xs font-bold text-red-300 hover:bg-red-500/10 flex items-center gap-2 ${String(post.authorId) !== String(window.currentUserUid) ? 'hidden' : ''}">
                                <span class="material-icons-round text-sm">delete</span> Xóa bài viết
                            </button>
                            <button onclick="copyPostLink('${post.id}')" class="w-full px-3 py-2.5 text-left text-xs font-bold text-slate-200 hover:bg-white/10 flex items-center gap-2">
                                <span class="material-icons-round text-sm text-slate-300">content_copy</span> Sao chép ID
                            </button>
                        </div>
                        </div>
                    </div>
                    ${postBodyHtml}
                    <div class="flex items-center justify-between px-4 py-2 text-[11px] text-slate-500">
                        <div class="flex items-center gap-1">
                            <span class="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center text-[10px]">❤</span>
                            <span id="like-count-${post.id}">${post.likes}</span>
                        </div>
                        <div class="flex items-center gap-3">
                            <span id="comment-count-${post.id}">${post.commentsCount || 0} bình luận</span>
                            <span id="share-count-${post.id}">${post.shares || 0} chia sẻ</span>
                        </div>
                    </div>
                    <div class="flex items-center border-t border-white/5 mx-4 mb-1">
                        <button onclick="likePost('${post.id}')" id="like-btn-${post.id}" class="flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold ${post.hasLiked ? 'text-red-400' : 'text-slate-400'} hover:bg-white/5 rounded-lg transition-all cursor-pointer group">
                            <span class="material-icons-round text-lg group-active:scale-125 transition-transform">${post.hasLiked ? 'favorite' : 'favorite_border'}</span> Yêu thích
                        </button>
                        <button onclick="toggleComment('${post.id}')" class="flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold text-slate-400 hover:bg-white/5 rounded-lg transition-all cursor-pointer">
                            <span class="material-icons-round text-lg">chat_bubble_outline</span> Bình luận (<span id="comment-btn-count-${post.id}">${post.commentsCount || 0}</span>)
                        </button>
                        <button onclick="sharePost('${post.id}')" class="flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold text-slate-400 hover:bg-white/5 rounded-lg transition-all cursor-pointer">
                            <span class="material-icons-round text-lg">share</span> Chia sẻ (<span id="share-btn-count-${post.id}">${post.shares || 0}</span>)
                        </button>
                    </div>
                    <div id="comment-section-${post.id}" class="hidden border-t border-white/5 p-4 space-y-3 bg-black/20">
                        <div id="comments-list-${post.id}" class="space-y-3 max-h-60 overflow-y-auto custom-scrollbar"></div>
                        <div class="flex gap-2 items-center">
                            <input type="text" id="comment-input-${post.id}" placeholder="Viết bình luận..."
                                class="flex-1 bg-white/5 border border-white/10 rounded-full px-4 py-2 text-xs text-white placeholder-slate-500 focus:border-primary/50 outline-none"
                                onkeydown="if(event.key==='Enter')submitComment('${post.id}')">
                            <button onclick="submitComment('${post.id}')" class="w-8 h-8 rounded-full bg-primary/20 text-primary hover:bg-primary hover:text-black flex items-center justify-center transition-all hover:scale-105 active:scale-95 flex-shrink-0">
                                <span class="material-icons-round text-sm">send</span>
                            </button>
                        </div>
                    </div>
                </div>
                `;
        }

        // RENDER LOGIC
        function renderHomeNewsfeed() {
            const feedContainer = document.getElementById('home-newsfeed');
            if (!feedContainer) return;

            if (homePosts.length === 0) {
                feedContainer.innerHTML = `
                    <div class="glass-card p-10 rounded-[2rem] border border-white/10 text-center opacity-50">
                        <span class="material-icons-round text-5xl mb-3 text-slate-400">hourglass_empty</span>
                        <p class="text-xs font-bold text-slate-400 uppercase tracking-widest">Bảng tin đang trống...</p>
                    </div>`;
                return;
            }

            feedContainer.innerHTML = homePosts.map(homePostCardHtml).join('');
        }

        async function renderBuddySystem() {
            if (!window.currentUserUid) return;

            const reqContainerBox = document.getElementById('home-friend-requests-container');
            const reqContainer = document.getElementById('home-friend-requests');
            const reqCount = document.getElementById('home-req-count');
            if (!reqContainerBox) return;

            try {
                // Fetch PENDING requests where current user is receiver
                const { data: requests, error } = await window.supabaseClient
                    .from('friendships')
                    .select('*')
                    .eq('receiver_id', window.currentUserUid)
                    .eq('status', 'pending');

                if (error) console.warn('Fetch requests error:', error);

                if (requests && requests.length > 0) {
                    // Fetch sender profiles separately
                    const senderIds = requests.map(r => r.sender_id);
                    const { data: senderProfiles } = await window.supabaseClient
                        .from('profiles')
                        .select('id, full_name, avatar_url, email')
                        .in('id', senderIds);

                    const profileMap = {};
                    (senderProfiles || []).forEach(p => profileMap[p.id] = p);

                    reqContainerBox.classList.remove('hidden');
                    reqCount.innerText = requests.length;
                    reqContainer.innerHTML = requests.map(req => {
                        const sender = profileMap[req.sender_id] || { full_name: 'User', email: String(req.sender_id || ''), avatar_url: '' };
                        const senderAvatar = sender.avatar_url || avatarFromEmail(sender.email || req.sender_id);
                        return `
                            <div class="flex items-center justify-between p-2 lg:p-2.5 bg-black/40 rounded-xl border border-white/5 group hover:border-white/10 transition-colors">
                                <div class="flex items-center gap-2 lg:gap-3 overflow-hidden pr-2">
                                    <img data-profile-id="${sender.id || req.sender_id}" onclick="openUserProfile('${sender.id || req.sender_id}')" src="${senderAvatar}" class="w-8 h-8 rounded-full bg-white/10 border border-white/5 flex-shrink-0 object-cover cursor-pointer hover:border-primary/40">
                                    <div class="min-w-0 flex-1">
                                        <p onclick="openUserProfile('${sender.id || req.sender_id}')" class="text-[11px] lg:text-[12px] text-white font-bold truncate cursor-pointer hover:underline">${sender.full_name}</p>
                                        <p class="text-[9px] text-slate-500 truncate">${sender.email}</p>
                                    </div>
                                </div>
                                <div class="flex gap-1 flex-shrink-0">
                                    <button onclick="acceptFriend('${req.id}')" class="w-7 h-7 flex items-center justify-center bg-primary text-[#0a0a0a] rounded hover:bg-white hover:scale-105 active:scale-95 transition-all tooltip" title="Chấp nhận"><span class="material-icons-round text-sm">check</span></button>
                                    <button onclick="rejectFriend('${req.id}')" class="w-7 h-7 flex items-center justify-center bg-white/5 text-slate-400 rounded hover:bg-red-500/20 hover:text-red-400 active:scale-95 transition-all tooltip" title="Từ chối"><span class="material-icons-round text-sm">close</span></button>
                                </div>
                            </div>
                        `;
                    }).join('');
                } else {
                    reqContainerBox.classList.add('hidden');
                }

                // Fetch ACCEPTED friends
                const { data: friendsData, error: fError } = await window.supabaseClient
                    .from('friendships')
                    .select('*')
                    .eq('status', 'accepted')
                    .or(`sender_id.eq.${window.currentUserUid},receiver_id.eq.${window.currentUserUid}`);

                if (fError) console.warn('Fetch friends error:', fError);

                // Get friend user IDs
                const friendUserIds = (friendsData || []).map(f =>
                    f.sender_id === window.currentUserUid ? f.receiver_id : f.sender_id
                );

                let friends = [];
                if (friendUserIds.length > 0) {
                    const { data: friendProfiles } = await window.supabaseClient
                        .from('profiles')
                        .select('id, full_name, avatar_url, email')
                        .in('id', friendUserIds);
                    friends = friendProfiles || [];
                }

                const friendList = document.getElementById('home-friends-list');
                document.getElementById('home-friend-count').innerText = friends.length;

                if (friends.length > 0) {
                    friendList.innerHTML = friends.map(f => `
                        <div onclick="openFriendChat('${f.id}','${(f.full_name || 'Bạn').replace(/'/g, "\\'")}','${(f.avatar_url || avatarFromEmail(f.email || f.id)).replace(/'/g, "\\'")}')" class="flex items-center gap-3 p-2.5 hover:bg-white/5 rounded-xl border border-transparent hover:border-white/5 transition-all cursor-pointer group">
                            <div class="relative flex-shrink-0">
                                <img data-profile-id="${f.id}" onclick="event.stopPropagation();openUserProfile('${f.id}')" src="${f.avatar_url || avatarFromEmail(f.email || f.id)}" class="w-10 h-10 rounded-full border border-white/5 object-cover cursor-pointer hover:border-primary/40">
                                <span class="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-bg-dark rounded-full shadow-sm"></span>
                            </div>
                            <div class="flex-1 min-w-0">
                                <p onclick="event.stopPropagation();openUserProfile('${f.id}')" class="text-[13px] text-white font-bold group-hover:text-primary transition-colors truncate cursor-pointer hover:underline">${f.full_name}</p>
                                <p class="text-[10px] text-slate-500 truncate font-medium">${f.email}</p>
                            </div>
                            <button onclick="event.stopPropagation(); openFriendChat('${f.id}','${(f.full_name || 'Bạn').replace(/'/g, "\\'")}','${(f.avatar_url || avatarFromEmail(f.email || f.id)).replace(/'/g, "\\'")}')" class="relative w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-slate-400 opacity-0 group-hover:opacity-100 transition-all hover:bg-primary hover:text-black flex-shrink-0">
                                <span class="material-icons-round text-[15px]">chat</span>
                                <span id="friend-unread-${f.id}" class="hidden absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[9px] font-black leading-none flex items-center justify-center">0</span>
                            </button>
                        </div>
                    `).join('');
                    friends.forEach(f => updateFriendUnreadBadge(f.id));
                } else {
                    friendList.innerHTML = `
                        <div class="py-8 text-center text-slate-500 opacity-60">
                            <span class="material-icons-round mb-2 text-3xl">sentiment_dissatisfied</span>
                            <p class="text-[10px] font-bold uppercase tracking-wider">Chưa có bạn bè nào.<br>Hãy tìm kiếm bằng Email nhé!</p>
                        </div>`;
                }
            } catch (e) {
                console.error("Buddy System Error:", e);
            }
        }

        // INIT HOME
        document.addEventListener('DOMContentLoaded', () => {
            const origShowView = window.showView;
            window.showView = (viewName) => {
                if (origShowView) origShowView(viewName);
                if (viewName === 'home') {
                    fetchHomePosts(); // Initial fetch
                    renderBuddySystem();
                }
                if (viewName === 'guide') {
                    if (typeof hydrateProfileView !== 'undefined') hydrateProfileView();
                }
            };

            // Setup Real-time listener if client exists
            if (window.supabaseClient) {
                setupRealtimeNewsfeed();
            }
        });

        async function fetchHomePosts() {
            if (!window.supabaseClient) return;
            try {
                const { data, error } = await window.supabaseClient
                    .from('posts')
                    .select('*')
                    .order('created_at', { ascending: false });

                if (error) throw error;
                if (!data || data.length === 0) { homePosts = []; renderHomeNewsfeed(); return; }

                const currentUid = window.currentUserUid;
                let acceptedFriendIds = new Set();
                if (currentUid) {
                    const { data: friendshipRows, error: friendshipError } = await window.supabaseClient
                        .from('friendships')
                        .select('sender_id, receiver_id')
                        .eq('status', 'accepted')
                        .or(`sender_id.eq.${currentUid},receiver_id.eq.${currentUid}`);
                    if (!friendshipError && friendshipRows) {
                        acceptedFriendIds = new Set(friendshipRows.map(f =>
                            f.sender_id === currentUid ? f.receiver_id : f.sender_id
                        ));
                    }
                }

                const filteredPosts = data.filter(p => {
                    const visibility = p.visibility || 'public';
                    if (visibility === 'public') return true;
                    if (!currentUid) return false;
                    if (p.author_id === currentUid) return true;
                    if (visibility === 'private') return false;
                    if (visibility === 'friends') return acceptedFriendIds.has(p.author_id);
                    return false;
                });
                if (filteredPosts.length === 0) { homePosts = []; renderHomeNewsfeed(); return; }

                // Fetch author profiles separately
                const authorIds = [...new Set(filteredPosts.map(p => p.author_id))];
                const { data: authors } = await window.supabaseClient
                    .from('profiles')
                    .select('id, full_name, avatar_url, email')
                    .in('id', authorIds);

                const authorMap = {};
                (authors || []).forEach(a => authorMap[a.id] = a);

                homePosts = filteredPosts.map(p => {
                    const likedBy = p.liked_by || [];
                    const hasLiked = likedBy.includes(window.currentUserUid);

                    return {
                        id: p.id,
                        authorId: p.author_id,
                        author: {
                            name: authorMap[p.author_id]?.full_name || 'User',
                            avatar: authorMap[p.author_id]?.avatar_url || avatarFromEmail(authorMap[p.author_id]?.email || p.author_id)
                        },
                        content: p.content,
                        media: p.media_url,
                        privacy: p.visibility,
                        likes: p.likes || 0,
                        shares: p.shares || 0,
                        liked_by: likedBy,
                        hasLiked: hasLiked,
                        time: new Date(p.created_at).toLocaleTimeString()
                    };
                });
                await loadCommentsForPosts(homePosts.map(p => p.id));
                syncLocalInteractionStates();
                renderHomeNewsfeed();
            } catch (e) {
                console.error("Error fetching posts:", e);
            }
        }

        let realtimeSetup = false;
        function setupRealtimeNewsfeed() {
            if (!window.supabaseClient || realtimeSetup) return;
            realtimeSetup = true;

            // Posts: smart patch — UPDATE only touches DOM directly, INSERT/DELETE refetch
            window.supabaseClient
                .channel('home-posts-changes')
                .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'posts' }, payload => {
                    const updated = payload.new;
                    if (!updated) return;
                    // Patch in-memory post
                    const post = findFeedPost(updated.id);
                    if (post) {
                        const likedBy = updated.liked_by || [];
                        post.likes = updated.likes || 0;
                        post.liked_by = likedBy;
                        post.hasLiked = likedBy.includes(window.currentUserUid);
                        // Patch DOM directly — no full re-render
                        const countEl = document.getElementById(`like-count-${updated.id}`);
                        if (countEl) countEl.textContent = post.likes;
                        const likeBtn = document.getElementById(`like-btn-${updated.id}`);
                        if (likeBtn) {
                            likeBtn.className = `flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold ${post.hasLiked ? 'text-red-400' : 'text-slate-400'} hover:bg-white/5 rounded-lg transition-all cursor-pointer group`;
                            likeBtn.querySelector('.material-icons-round').textContent = post.hasLiked ? 'favorite' : 'favorite_border';
                        }
                    }
                })
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, () => fetchHomePosts())
                .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'posts' }, () => fetchHomePosts())
                .subscribe();

            window.supabaseClient
                .channel('home-friends-changes')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => renderBuddySystem())
                .subscribe();

            if (!commentsRealtimeSetup) {
                commentsRealtimeSetup = true;
                window.supabaseClient
                    .channel('home-comments-changes')
                    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'post_comments' }, payload => {
                        const c = payload.new;
                        if (!c || !c.post_id) return;
                        // Optimistic insert into DOM without refetch
                        if (!postCommentsMap[c.post_id]) postCommentsMap[c.post_id] = [];
                        const alreadyExists = postCommentsMap[c.post_id].some(x => x.created_at === c.created_at && x.user_id === c.user_id);
                        if (!alreadyExists) {
                            postCommentsMap[c.post_id].push(c);
                            const commentsList = document.getElementById(`comments-list-${c.post_id}`);
                            if (commentsList) {
                                commentsList.insertAdjacentHTML('beforeend', `
                                    <div class="flex gap-2 items-start animate-fade-in">
                                        <img src="${c.author_avatar || 'https://i.pravatar.cc/150?img=1'}" class="w-7 h-7 rounded-full border border-white/10 flex-shrink-0">
                                        <div class="bg-white/5 rounded-xl px-3 py-2 flex-1">
                                            <p class="text-[10px] font-bold text-primary">${c.author_name || 'User'}</p>
                                            <p class="text-[11px] text-slate-300">${c.content || ''}</p>
                                        </div>
                                    </div>`);
                            }
                            const post = findFeedPost(c.post_id);
                            if (post) {
                                post.commentsCount = (postCommentsMap[c.post_id] || []).length;
                                const countEl = document.getElementById(`comment-count-${c.post_id}`);
                                if (countEl) countEl.textContent = `${post.commentsCount} bình luận`;
                                const btnCountEl = document.getElementById(`comment-btn-count-${c.post_id}`);
                                if (btnCountEl) btnCountEl.textContent = String(post.commentsCount);
                            }
                        }
                    })
                    .subscribe();
            }

            // Backup refresh every 30s (reduced from 15s)
            setInterval(() => {
                if (document.getElementById('view-home') && !document.getElementById('view-home').classList.contains('hidden')) {
                    fetchHomePosts();
                    renderBuddySystem();
                }
            }, 30000);
        }

        // ACTION HANDLERS
        window.createHomePost = async () => {
            if (!window.currentUserUid) return alert("Vui lòng đăng nhập để chia sẻ!");

            const contentInput = document.getElementById('home-post-content');
            const mediaInput = document.getElementById('home-post-media-url');
            const privacySelect = document.getElementById('home-post-privacy');

            const content = contentInput.value.trim();
            const media = mediaInput.value.trim();
            const finalMedia = (homePostSelectedMediaList && homePostSelectedMediaList.length > 0)
                ? JSON.stringify(homePostSelectedMediaList)
                : (homePostSelectedMedia || media);
            const privacy = privacySelect.value;

            if (!content && !finalMedia) {
                alert('Vui lòng nhập nội dung bài viết hoặc đính kèm Link hình ảnh/video!');
                return;
            }

            try {
                const { data, error } = await window.supabaseClient
                    .from('posts')
                    .insert([{
                        author_id: window.currentUserUid,
                        content: content,
                        media_url: finalMedia || null,
                        visibility: privacy
                    }]);

                if (error) throw error;

                // Clean UI
                contentInput.value = '';
                mediaInput.value = '';
                homePostSelectedMedia = '';
                homePostSelectedMediaList = [];
                const fileInput = document.getElementById('home-post-media-file');
                if (fileInput) fileInput.value = '';
                document.getElementById('home-post-media-container').classList.add('hidden');
                renderHomePostMediaPreview();

                // Track Stat
                trackActivity('posts_created');
                refreshMyPostIds();

                // Real-time listener will handle the update
            } catch (e) {
                alert("Lỗi khi đăng bài: " + e.message);
            }
        }

        window.likePost = async (id) => {
            if (!window.currentUserUid) return alert("Vui lòng đăng nhập để tương tác!");

            try {
                const post = findFeedPost(id);
                if (!post) return;

                // Optimistic update
                post.hasLiked = !post.hasLiked;
                post.likes = post.hasLiked ? (post.likes || 0) + 1 : Math.max(0, (post.likes || 0) - 1);
                post.liked_by = post.liked_by || [];
                if (post.hasLiked) {
                    if (!post.liked_by.includes(window.currentUserUid)) post.liked_by.push(window.currentUserUid);
                } else {
                    post.liked_by = post.liked_by.filter(uid => uid !== window.currentUserUid);
                }

                // Update UI with heartbeat animation
                const likeBtn = document.getElementById(`like-btn-${id}`);
                const likeCount = document.getElementById(`like-count-${id}`);
                if (likeBtn) {
                    likeBtn.className = `flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold ${post.hasLiked ? 'text-red-400' : 'text-slate-400'} hover:bg-white/5 rounded-lg transition-all cursor-pointer group`;
                    const icon = likeBtn.querySelector('.material-icons-round');
                    icon.textContent = post.hasLiked ? 'favorite' : 'favorite_border';
                    if (post.hasLiked) {
                        icon.style.transform = 'scale(1.5)';
                        icon.style.transition = 'transform 0.15s cubic-bezier(0.17,0.89,0.32,1.49)';
                        setTimeout(() => { icon.style.transform = 'scale(1)'; }, 200);
                    }
                }
                if (likeCount) likeCount.textContent = post.likes;

                // Save to DB — liked_by is the source of truth
                const { error } = await window.supabaseClient
                    .from('posts')
                    .update({ likes: post.likes, liked_by: post.liked_by })
                    .eq('id', id);

                if (error) {
                    // liked_by column may not exist — fallback to likes count only
                    await window.supabaseClient
                        .from('posts')
                        .update({ likes: post.likes })
                        .eq('id', id);
                }

                trackActivity('likes_given');
            } catch (e) {
                console.error("Like error:", e);
            }
        };

        window.toggleComment = (id) => {
            const section = document.getElementById(`comment-section-${id}`);
            if (section) {
                section.classList.toggle('hidden');
                if (!section.classList.contains('hidden')) renderPostComments(id);
            }
        };

        window.submitComment = async (id) => {
            if (!window.currentUserUid) return alert("Vui lòng đăng nhập!");
            const input = document.getElementById(`comment-input-${id}`);
            const text = input?.value.trim();
            if (!text) return;

            const userName = document.querySelector('#user-display')?.textContent || 'Bạn';
            const userAvatar = (typeof window.currentUserAvatarUrl === 'string' && window.currentUserAvatarUrl)
                ? window.currentUserAvatarUrl
                : (document.querySelector('#user-avatar')?.src || avatarFromEmail(document.getElementById('user-email-display')?.textContent || window.currentUserUid));
            const newComment = {
                post_id: id,
                user_id: window.currentUserUid,
                content: text,
                author_name: userName,
                author_avatar: userAvatar,
                created_at: new Date().toISOString()
            };
            if (!postCommentsMap[id]) postCommentsMap[id] = [];
            postCommentsMap[id].push(newComment);
            input.value = '';

            // Optimistic insert at bottom (no full re-render)
            const commentsList = document.getElementById(`comments-list-${id}`);
            if (commentsList) {
                commentsList.insertAdjacentHTML('beforeend', `
                    <div class="flex gap-2 items-start animate-fade-in">
                        <img src="${newComment.author_avatar}" class="w-7 h-7 rounded-full border border-white/10 flex-shrink-0">
                        <div class="bg-white/5 rounded-xl px-3 py-2 flex-1">
                            <p class="text-[10px] font-bold text-primary">${newComment.author_name}</p>
                            <p class="text-[11px] text-slate-300">${newComment.content}</p>
                        </div>
                    </div>`);
                commentsList.scrollTop = commentsList.scrollHeight;
            }

            const post = findFeedPost(id);
            if (post) post.commentsCount = (postCommentsMap[id] || []).length;
            const commentCountEl = document.getElementById(`comment-count-${id}`);
            if (commentCountEl) commentCountEl.textContent = `${post?.commentsCount || 0} bình luận`;
            const commentBtnCountEl = document.getElementById(`comment-btn-count-${id}`);
            if (commentBtnCountEl) commentBtnCountEl.textContent = String(post?.commentsCount || 0);

            try {
                await window.supabaseClient
                    .from('post_comments')
                    .insert([newComment]);
            } catch (e) {
                console.warn('Save comment failed:', e?.message || e);
            }
        };

        let targetSharePostId = null;

        window.sharePost = (id) => {
            if (!window.currentUserUid) return alert("Vui lòng đăng nhập để chia sẻ!");
            const post = findFeedPost(id);
            if (!post) return;

            targetSharePostId = id;
            const modal = document.getElementById('share-modal');
            const nameEl = document.getElementById('share-modal-user-name');
            const avatarEl = document.getElementById('share-modal-user-avatar');
            const statusInput = document.getElementById('share-status-input');
            const previewText = document.getElementById('share-preview-text');
            const submitBtn = document.getElementById('share-submit-btn');

            if (nameEl) nameEl.textContent = (window.currentUser && window.currentUser.user_metadata?.full_name) || 'User';
            if (avatarEl) avatarEl.src = (window.currentUser && window.currentUser.user_metadata?.avatar_url) || avatarFromEmail(window.currentUser?.email || 'guest');
            if (statusInput) statusInput.value = '';

            // Extract original content if it was a share
            let cleanPreview = post.content || '';
            if (cleanPreview.startsWith('🔁 Chia sẻ từ')) {
                const parts = cleanPreview.split('\n\n');
                cleanPreview = parts.slice(1).join('\n\n') || 'Bài viết hình ảnh/video';
            }
            if (previewText) previewText.textContent = `Nội dung chia sẻ: ${cleanPreview}`;

            if (submitBtn) {
                submitBtn.onclick = () => submitShare(id);
            }

            modal.classList.remove('hidden', 'pointer-events-none', 'opacity-0');
        };

        window.closeShareModal = () => {
            const modal = document.getElementById('share-modal');
            modal.classList.add('hidden', 'pointer-events-none', 'opacity-0');
            targetSharePostId = null;
        };

        window.submitShare = async (id) => {
            const post = findFeedPost(id);
            if (!post) return;

            const status = document.getElementById('share-status-input').value.trim();
            const privacy = document.getElementById('share-privacy-select').value;
            const btn = document.getElementById('share-submit-btn');

            btn.disabled = true;
            btn.innerHTML = '<span class="material-icons-round text-sm animate-spin">sync</span> ĐANG ĐĂNG...';

            // Author info for the "header line"
            const originalAuthorInfo = JSON.stringify({
                uid: post.authorId,
                name: post.author.name,
                avatar: post.author.avatar
            });
            const headerLine = `🔁 Chia sẻ từ ${originalAuthorInfo}`;

            // Final content: User Status (if any) + Shared Header + Original Content
            let finalContent = headerLine;
            if (post.content) finalContent += `\n\n${post.content}`;
            if (status) finalContent = `${status}\n\n${finalContent}`;

            const mediaToShare = post.media ? String(post.media) : null;

            try {
                const { error: insErr } = await window.supabaseClient
                    .from('posts')
                    .insert([{
                        author_id: window.currentUserUid,
                        content: finalContent,
                        media_url: mediaToShare,
                        visibility: privacy
                    }]);
                if (insErr) throw insErr;

                // Track shares locally
                post.shares = (post.shares || 0) + 1;
                localStorage.setItem(`post_shares_${id}`, String(post.shares));
                const shareCountEl = document.getElementById(`share-count-${id}`);
                if (shareCountEl) shareCountEl.textContent = `${post.shares} chia sẻ`;

                await window.supabaseClient
                    .from('posts')
                    .update({ shares: post.shares })
                    .eq('id', id);

                closeShareModal();
                if (typeof showSuccessToast === 'function') showSuccessToast('Đã chia sẻ bài viết thành công!');
                else alert('Đã chia sẻ bài viết thành công!');
                if (typeof fetchHomePosts === 'function') fetchHomePosts();
            } catch (e) {
                alert('Lỗi chia sẻ: ' + (e?.message || e));
            } finally {
                btn.disabled = false;
                btn.textContent = 'Chia sẻ ngay';
            }

            if (document.getElementById('view-guide') && !document.getElementById('view-guide').classList.contains('hidden') && typeof loadProfilePosts === 'function') {
                loadProfilePosts();
            }
        };

        window.togglePostMenu = (postId) => {
            const menu = document.getElementById(`post-menu-${postId}`);
            if (!menu) return;
            const isOpen = !menu.classList.contains('hidden');
            document.querySelectorAll('[id^="post-menu-"]').forEach(el => el.classList.add('hidden'));
            if (!isOpen) menu.classList.remove('hidden');
        };

        window.copyPostLink = async (postId) => {
            try {
                await navigator.clipboard.writeText(String(postId));
                showSuccessToast('Đã sao chép ID bài viết.');
            } catch (e) {
                alert('Không thể sao chép.');
            }
        };

        window.editPost = async (postId) => {
            const post = findFeedPost(postId);
            if (!post) return;
            if (String(post.authorId) !== String(window.currentUserUid)) return alert("Bạn không có quyền chỉnh sửa bài viết này!");
            const next = prompt('Chỉnh sửa nội dung bài viết:', post.content || '');
            if (next === null) return;
            const newContent = String(next).trim();
            try {
                post.content = newContent;
                renderHomeNewsfeed();
                if (window.profileFeedPosts && window.profileFeedPosts.some(p => String(p.id) === String(postId)) && typeof loadProfilePosts === 'function') loadProfilePosts();
                if (window.supabaseClient) {
                    const { error } = await window.supabaseClient.from('posts').update({ content: newContent }).eq('id', postId);
                    if (error) throw error;
                }
            } catch (e) {
                alert('Lỗi khi chỉnh sửa: ' + (e?.message || e));
            }
        };

        window.deletePost = async (postId) => {
            const post = findFeedPost(postId);
            if (!post) return;
            if (String(post.authorId) !== String(window.currentUserUid)) return alert("Bạn không có quyền xóa bài viết này!");
            if (!confirm('Xóa bài viết này? Hành động không thể hoàn tác.')) return;
            try {
                homePosts = homePosts.filter(p => String(p.id) !== String(postId));
                window.profileFeedPosts = (window.profileFeedPosts || []).filter(p => String(p.id) !== String(postId));
                renderHomeNewsfeed();
                if (typeof loadProfilePosts === 'function') loadProfilePosts();
                if (window.supabaseClient) {
                    const { error } = await window.supabaseClient.from('posts').delete().eq('id', postId);
                    if (error) throw error;
                }
            } catch (e) {
                alert('Lỗi khi xóa: ' + (e?.message || e));
            }
        };

        window.syncPostMediaDots = (postId) => {
            const strip = document.getElementById(`post-media-strip-${postId}`);
            if (!strip) return;
            const children = Array.from(strip.children || []);
            if (children.length <= 1) return;
            const idx = Math.round(strip.scrollLeft / Math.max(1, strip.clientWidth));
            children.forEach((_, i) => {
                const dot = document.getElementById(`post-media-dot-${postId}-${i}`);
                if (!dot) return;
                dot.className = `w-1.5 h-1.5 rounded-full ${i === idx ? 'bg-white' : 'bg-white/30'}`;
            });
        };

        document.addEventListener('click', (e) => {
            const t = e?.target;
            if (t && t.closest && t.closest('[id^="post-menu-"]')) return;
            if (t && t.closest && t.closest('button') && t.closest('button')?.getAttribute('onclick')?.includes('togglePostMenu')) return;
            document.querySelectorAll('[id^="post-menu-"]').forEach(el => el.classList.add('hidden'));
        });

        window.hydrateProfileView = async () => {
            if (!window.currentUserUid || !window.supabaseClient) return;

            const settingsBlock = document.getElementById('profile-account-settings-block');
            const avatarLabel = document.getElementById('profile-avatar-upload-label');
            const songsSection = document.getElementById('profile-songs-section');
            const titleEl = document.getElementById('profile-posts-section-heading');

            const target = window.profileViewTargetUid;
            if (!target || String(target) === String(window.currentUserUid)) {
                window.profileViewTargetUid = null;
                if (settingsBlock) settingsBlock.classList.remove('hidden');
                if (avatarLabel) avatarLabel.classList.remove('hidden');
                if (songsSection) songsSection.classList.remove('hidden');
                if (titleEl) {
                    titleEl.textContent = '';
                    titleEl.appendChild(document.createTextNode('Bài viết '));
                    const sp = document.createElement('span');
                    sp.className = 'text-primary';
                    sp.textContent = 'của tôi';
                    titleEl.appendChild(sp);
                }
                if (typeof loadUserProfile === 'function') await loadUserProfile();
            } else {
                if (settingsBlock) settingsBlock.classList.add('hidden');
                if (avatarLabel) avatarLabel.classList.add('hidden');
                if (songsSection) songsSection.classList.add('hidden');
                try {
                    const { data: profile } = await window.supabaseClient
                        .from('profiles')
                        .select('id, full_name, avatar_url, email')
                        .eq('id', target)
                        .maybeSingle();
                    const name = profile?.full_name || 'User';
                    const email = profile?.email || '';
                    const avatar = profile?.avatar_url || avatarFromEmail(email || target);
                    const nameEl = document.getElementById('profile-view-name');
                    const emailEl = document.getElementById('profile-view-email');
                    const avatarEl = document.getElementById('profile-view-avatar');
                    if (nameEl) nameEl.textContent = name;
                    if (emailEl) emailEl.textContent = email || 'Thành viên KietStation';
                    if (avatarEl) avatarEl.src = avatar;
                    if (titleEl) {
                        titleEl.textContent = '';
                        titleEl.appendChild(document.createTextNode('Bài viết '));
                        const sp = document.createElement('span');
                        sp.className = 'text-primary';
                        sp.textContent = `của ${name}`;
                        titleEl.appendChild(sp);
                    }
                } catch (e) {
                    console.warn('Load other profile error:', e);
                }
            }

            if (typeof loadProfilePosts === 'function') await loadProfilePosts();
        };

        window.loadProfilePosts = async () => {
            if (!window.supabaseClient) return;
            const viewerUid = window.currentUserUid;
            const targetUid = window.profileViewTargetUid || viewerUid;
            if (!targetUid) return;

            const container = document.getElementById('profile-my-posts');
            const countEl = document.getElementById('profile-post-count');
            if (!container) return;

            try {
                let acceptedFriendIds = new Set();
                if (viewerUid && String(targetUid) !== String(viewerUid)) {
                    const { data: friendshipRows } = await window.supabaseClient
                        .from('friendships')
                        .select('sender_id, receiver_id')
                        .eq('status', 'accepted')
                        .or(`sender_id.eq.${viewerUid},receiver_id.eq.${viewerUid}`);
                    (friendshipRows || []).forEach(f => {
                        acceptedFriendIds.add(f.sender_id === viewerUid ? f.receiver_id : f.sender_id);
                    });
                }

                const { data: rows, error } = await window.supabaseClient
                    .from('posts')
                    .select('*')
                    .eq('author_id', targetUid)
                    .order('created_at', { ascending: false });

                if (error) throw error;

                const filtered = (rows || []).filter(p => {
                    if (String(targetUid) === String(viewerUid)) return true;
                    if (!viewerUid) {
                        return (p.visibility || 'public') === 'public';
                    }
                    const visibility = p.visibility || 'public';
                    if (visibility === 'public') return true;
                    if (visibility === 'private') return false;
                    if (visibility === 'friends') return acceptedFriendIds.has(targetUid);
                    return false;
                });

                if (countEl) countEl.textContent = `${filtered.length} Bài`;

                if (filtered.length === 0) {
                    container.innerHTML = `
                        <div class="text-center py-8 text-slate-500 opacity-60">
                            <span class="material-icons-round text-3xl mb-2">article</span>
                            <p class="text-[10px] font-bold uppercase tracking-wider">Chưa có bài viết hiển thị.<br>Bài chỉ mình tôi / bạn bè chỉ người liên quan mới xem được.</p>
                        </div>`;
                    window.profileFeedPosts = [];
                    return;
                }

                const { data: authorProfile } = await window.supabaseClient
                    .from('profiles')
                    .select('id, full_name, avatar_url, email')
                    .eq('id', targetUid)
                    .maybeSingle();

                const author = {
                    name: authorProfile?.full_name || 'User',
                    avatar: authorProfile?.avatar_url || avatarFromEmail(authorProfile?.email || targetUid)
                };

                const localLikes = JSON.parse(localStorage.getItem(`local_likes_${viewerUid}`) || '{}');

                window.profileFeedPosts = filtered.map(p => {
                    const likedBy = p.liked_by || [];
                    const hasLikedDB = p.hasOwnProperty('liked_by') ? likedBy.includes(viewerUid) : !!localLikes[p.id];
                    return {
                        id: p.id,
                        authorId: p.author_id,
                        author,
                        content: p.content || '',
                        media: p.media_url,
                        privacy: p.visibility,
                        likes: p.likes || 0,
                        shares: p.shares || 0,
                        liked_by: likedBy,
                        hasLiked: hasLikedDB,
                        time: new Date(p.created_at).toLocaleTimeString()
                    };
                });

                // Get comment counts for these posts
                if (window.supabaseClient) {
                    const { data: counts } = await window.supabaseClient
                        .from('post_comments')
                        .select('post_id')
                        .in('post_id', window.profileFeedPosts.map(p => p.id));

                    const countMap = {};
                    (counts || []).forEach(c => {
                        countMap[c.post_id] = (countMap[c.post_id] || 0) + 1;
                    });

                    window.profileFeedPosts.forEach(p => {
                        p.commentsCount = countMap[p.id] || 0;
                    });
                }

                container.innerHTML = window.profileFeedPosts.map(p => homePostCardHtml(p)).join('');
            } catch (e) {
                console.error('Load profile posts error:', e);
            }
        };

        window.sendFriendRequest = async () => {
            if (!window.currentUserUid) return alert("Vui lòng đăng nhập để kết bạn!");

            const emailInput = document.getElementById('home-add-friend-email');
            const resultsContainer = document.getElementById('home-search-results');
            const searchValue = emailInput.value.trim();

            if (!searchValue) return alert('Vui lòng nhập Tên hoặc Email người cần tìm!');
            const myEmail = document.getElementById('user-email-display').innerText;

            try {
                resultsContainer.innerHTML = '<p class="text-[10px] text-slate-500 animate-pulse text-center py-2">Đang tìm kiếm...</p>';
                resultsContainer.classList.remove('hidden');

                const isEmail = searchValue.includes('@');
                let query = window.supabaseClient.from('profiles').select('id, email, full_name, avatar_url');

                if (isEmail) {
                    query = query.ilike('email', searchValue);
                } else {
                    query = query.ilike('full_name', `%${searchValue}%`);
                }

                const { data: targetUsers, error } = await query;
                if (error) throw error;

                if (!targetUsers || targetUsers.length === 0) {
                    resultsContainer.innerHTML = '<p class="text-[10px] text-red-400 text-center py-2 uppercase font-black tracking-widest">Không tìm thấy ai!</p>';
                    return;
                }

                resultsContainer.innerHTML = `
                    <div class="flex items-center justify-between mb-2">
                        <span class="text-[9px] text-primary font-black uppercase tracking-widest">Kết quả tìm kiếm</span>
                        <button onclick="document.getElementById('home-search-results').classList.add('hidden')" class="material-icons-round text-slate-500 text-sm hover:text-white">close</button>
                    </div>
                    ${targetUsers.map(u => {
                    const isMe = u.id === window.currentUserUid;
                    const avatar = u.avatar_url || avatarFromEmail(u.email || u.id);
                    return `
                            <div class="flex items-center justify-between p-2.5 bg-white/5 rounded-xl border border-white/5 hover:border-primary/30 transition-all group">
                                <div class="flex items-center gap-3 overflow-hidden pr-2">
                                    <img src="${avatar}" class="w-9 h-9 rounded-full border border-white/10 object-cover bg-black/20">
                                    <div class="min-w-0">
                                        <p class="text-[11px] text-white font-bold truncate">${u.full_name}${isMe ? ' (Bạn)' : ''}</p>
                                        <p class="text-[9px] text-slate-500 truncate">${u.email}</p>
                                    </div>
                                </div>
                                ${!isMe ? `
                                    <button onclick="requestFriendDirect('${u.id}', '${u.full_name}', '${u.email}')" 
                                        class="w-8 h-8 flex items-center justify-center bg-primary/20 text-primary rounded-lg hover:bg-primary hover:text-black transition-all active:scale-90"
                                        title="Thêm bạn">
                                        <span class="material-icons-round text-[18px]">person_add</span>
                                    </button>
                                ` : ''}
                            </div>
                        `;
                }).join('')}
                `;
            } catch (e) {
                resultsContainer.innerHTML = `<p class="text-[10px] text-red-500 py-1">Lỗi: ${e.message}</p>`;
            }
        };

        window.requestFriendDirect = async (targetId, targetName, targetEmail) => {
            try {
                // Check existing
                const { data: existing } = await window.supabaseClient
                    .from('friendships')
                    .select('*')
                    .or(`and(sender_id.eq.${window.currentUserUid},receiver_id.eq.${targetId}),and(sender_id.eq.${targetId},receiver_id.eq.${window.currentUserUid})`);

                if (existing && existing.length > 0) return alert('Đã là bạn bè hoặc đã gửi yêu cầu!');

                const { error } = await window.supabaseClient
                    .from('friendships')
                    .insert([{
                        sender_id: window.currentUserUid,
                        receiver_id: targetId,
                        status: 'pending'
                    }]);

                if (error) throw error;

                alert(`Đã gửi lời mời đến ${targetName} ✨`);
                document.getElementById('home-search-results').classList.add('hidden');
                document.getElementById('home-add-friend-email').value = '';
                renderBuddySystem();
            } catch (e) {
                alert("Lỗi: " + e.message);
            }
        };

        window.acceptFriend = async (id) => {
            try {
                await window.supabaseClient
                    .from('friendships')
                    .update({ status: 'accepted' })
                    .eq('id', id);
                renderBuddySystem();
            } catch (e) { }
        };

        window.rejectFriend = async (id) => {
            try {
                await window.supabaseClient
                    .from('friendships')
                    .delete()
                    .eq('id', id);
                renderBuddySystem();
            } catch (e) { }
        };



        window.shareCurrentMediaToHome = () => {
            const title = document.getElementById('player-title')?.innerText || '';
            if (title === 'Select a song' || !title) return alert('Chưa có nội dung nào đang phát!');

            let mediaUrl = null;
            if (typeof currentMode !== 'undefined') {
                if (currentMode === 'local') {
                    mediaUrl = document.getElementById('local-audio')?.src;
                } else if (currentMode === 'youtube') {
                    mediaUrl = document.getElementById('player-thumb')?.src;
                }
            } else {
                mediaUrl = document.getElementById('player-thumb')?.src;
            }

            if (window.showView) window.showView('home');

            const contentInput = document.getElementById('home-post-content');
            if (contentInput) contentInput.value = `Mình đang thưởng thức: ${title} 🎵\nCùng trải nghiệm nhé!`;

            const mediaInput = document.getElementById('home-post-media-url');
            if (mediaUrl && !mediaUrl.includes('placeholder')) {
                if (mediaInput) mediaInput.value = mediaUrl;
                document.getElementById('home-post-media-container')?.classList.remove('hidden');
            }

            if (contentInput) contentInput.focus();
        };
        // --- GAMIFICATION LOGIC (NEW) ---
        let userStats = {
            xp: 0,
            songs_generated: 0,
            consume_media: 0,
            posts_created: 0,
            likes_given: 0,
            photos_taken: 0,
            badges: []
        };

        const BADGE_DEFS = [
            { id: 'melody_master', name: 'Melody Master', icon: '🎵', desc: 'Sáng tác 5 bài hát', goal: 5, category: 'songs_generated' },
            { id: 'night_owl', name: 'Cú Đêm', icon: '🦉', desc: 'Thưởng thức 10 tác phẩm', goal: 10, category: 'consume_media' },
            { id: 'super_model', name: 'Super Model', icon: '📸', desc: 'Chụp 3 album ảnh', goal: 3, category: 'photos_taken' },
            { id: 'social_star', name: 'Ngôi Sao Phố', icon: '✨', desc: 'Đăng 3 bài viết', goal: 3, category: 'posts_created' },
            { id: 'heart_breaker', name: 'Người Lan Tỏa', icon: '❤️', desc: 'Thả 5 tim', goal: 5, category: 'likes_given' }
        ];

        window.trackActivity = (type, amount = 1) => {
            if (!userStats.hasOwnProperty(type)) userStats[type] = 0;
            userStats[type] += amount;
            const xpGain = (type === 'songs_generated') ? 50 : (type === 'photos_taken' ? 30 : 10);
            window.addXP(xpGain);
            window.checkAchievements();
        };

        window.addXP = (amount) => {
            userStats.xp += amount;
            window.renderUserLeveling();
        };

        window.renderUserLeveling = () => {
            const level = Math.floor(userStats.xp / 100) + 1;
            const currentLevelXP = userStats.xp % 100;

            const xpBar = document.getElementById('profile-xp-bar');
            const levelText = document.getElementById('profile-level');
            const currentXPText = document.getElementById('profile-xp-current');
            const nextXPText = document.getElementById('profile-xp-next');
            const totalXPText = document.getElementById('profile-stat-xp');

            if (xpBar) xpBar.style.width = `${currentLevelXP}%`;
            if (levelText) levelText.innerText = level;
            if (currentXPText) currentXPText.innerText = currentLevelXP;
            if (nextXPText) nextXPText.innerText = 100;
            if (totalXPText) totalXPText.innerText = userStats.xp;
        };

        window.checkAchievements = () => {
            let newlyUnlocked = false;
            BADGE_DEFS.forEach(b => {
                if (!userStats.badges.includes(b.id) && userStats[b.category] >= b.goal) {
                    userStats.badges.push(b.id);
                    newlyUnlocked = true;
                    window.showAchievementToast(b);
                }
            });
            if (newlyUnlocked) window.renderBadges();
        };

        window.showAchievementToast = (badge) => {
            const toast = document.createElement('div');
            toast.className = 'fixed top-24 left-1/2 -translate-x-1/2 z-[300] glass-card badge-glow border-primary/50 p-6 rounded-[3rem] animate-countdown flex items-center gap-6 shadow-2xl';
            toast.innerHTML = `
                <div class="text-5xl drop-shadow-lg">${badge.icon}</div>
                <div class="text-left">
                    <p class="text-[10px] font-black text-primary uppercase tracking-[0.3em] mb-1">Achievement Unlocked!</p>
                    <p class="text-white font-black text-xl uppercase italic tracking-tighter">${badge.name}</p>
                </div>
            `;
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 4000);
        };

        window.renderBadges = () => {
            const grid = document.getElementById('profile-badges-grid');
            if (!grid) return;

            grid.innerHTML = BADGE_DEFS.map(b => {
                const isLocked = !userStats.badges.includes(b.id);
                return `
                    <div class="badge-card ${isLocked ? 'locked' : 'badge-glow border-primary/30'}" title="${b.desc}">
                        <span class="badge-icon">${b.icon}</span>
                        <span class="text-[8px] font-bold text-white uppercase tracking-tighter text-center leading-tight">${b.name}</span>
                        ${!isLocked ? '<div class="absolute -top-1 -right-1 w-4 h-4 bg-primary rounded-full border-2 border-[#090A0C] flex items-center justify-center"><span class="material-icons-round text-[8px] text-black">check</span></div>' : ''}
                    </div>
                `;
            }).join('');
        };

        // --- WATCH PARTY REAL-TIME SYNC ---
        let activePartyChannel = null;
        let isPartyHost = false;
        let partyId = null;

        window.startWatchParty = () => {
            if (!window.currentUserUid) return alert("Vui lòng đăng nhập để bắt đầu Watch Party!");
            partyId = Math.random().toString(36).substring(2, 8).toUpperCase();
            isPartyHost = true;
            initPartyChannel(partyId);

            // Show Party UI
            showPartyOverlay(`Party Started! ID: ${partyId}`, true);
        };

        window.promptJoinParty = () => {
            const id = prompt("Nhập mã Party ID để tham gia:");
            if (id) {
                partyId = id.toUpperCase();
                isPartyHost = false;
                initPartyChannel(partyId);
                showPartyOverlay(`Joined Party: ${partyId}`, false);
            }
        };

        function showPartyOverlay(text, canCopy) {
            const overlay = document.createElement('div');
            overlay.id = 'party-status-overlay';
            overlay.className = 'fixed bottom-28 left-4 z-[200] glass-card p-4 rounded-2xl flex items-center gap-4 animate-fade-in border-primary/30';
            overlay.innerHTML = `
                <div class="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                    <span class="material-icons-round">groups</span>
                </div>
                <div>
                    <p class="text-[9px] font-black text-primary uppercase tracking-widest">Watch Party Active</p>
                    <p class="text-white font-bold text-xs">${text}</p>
                </div>
                ${canCopy ? `<button onclick="navigator.clipboard.writeText('${partyId}'); alert('Đã chép ID!')" class="p-2 bg-white/5 rounded-lg text-slate-400 hover:text-white" title="Copy ID"><span class="material-icons-round text-sm">content_copy</span></button>` : ''}
                <button id="camera-toggle-btn" onclick="togglePartyCamera()" class="p-2 bg-primary/10 rounded-lg text-primary hover:bg-primary/30" title="Bật/tắt Camera"><span class="material-icons-round text-sm">videocam</span></button>
                <button id="mic-toggle-btn" onclick="togglePartyMic()" class="p-2 bg-primary/10 rounded-lg text-primary hover:bg-primary/30" title="Bật/tắt Micro"><span class="material-icons-round text-sm">mic</span></button>
                <button onclick="leaveParty()" class="p-2 bg-red-500/10 rounded-lg text-red-400 hover:bg-red-500 hover:text-white" title="Leave Party"><span class="material-icons-round text-sm">close</span></button>
            `;
            document.getElementById('party-status-overlay')?.remove();
            document.body.appendChild(overlay);
        }

        window.leaveParty = () => {
            if (activePartyChannel) {
                activePartyChannel.unsubscribe();
                activePartyChannel = null;
            }
            // Cleanup WebRTC
            if (localStream) {
                localStream.getTracks().forEach(track => track.stop());
                localStream = null;
            }
            Object.values(peers).forEach(p => p.destroy());
            peers = {};
            ['party-mesh-grid', 'dashboard-party-mesh-grid'].forEach(gId => {
                const g = document.getElementById(gId);
                if (g) { g.innerHTML = ''; g.classList.add('hidden'); }
            });

            isPartyHost = false;
            partyId = null;
            document.getElementById('party-status-overlay')?.remove();
            alert("Đã rời phòng Party.");
        };

        window.togglePartyCamera = () => {
            if (localStream) {
                const videoTrack = localStream.getVideoTracks()[0];
                if (videoTrack) {
                    videoTrack.enabled = !videoTrack.enabled;
                    const btn = document.getElementById('camera-toggle-btn');
                    if (btn) {
                        if (videoTrack.enabled) {
                            btn.className = 'p-2 bg-primary/10 rounded-lg text-primary hover:bg-primary/30';
                            btn.innerHTML = '<span class="material-icons-round text-sm">videocam</span>';
                        } else {
                            btn.className = 'p-2 bg-red-500/10 rounded-lg text-red-400 hover:bg-red-500/30 hover:text-white';
                            btn.innerHTML = '<span class="material-icons-round text-sm">videocam_off</span>';
                        }
                    }
                    
                    ['party-mesh-grid', 'dashboard-party-mesh-grid'].forEach(gridId => {
                        const localVid = document.getElementById(`video-${gridId}-peer-local`);
                        if (localVid) {
                            localVid.style.opacity = videoTrack.enabled ? '1' : '0.2';
                            localVid.style.filter = videoTrack.enabled ? 'none' : 'grayscale(100%)';
                        }
                    });
                }
            }
        };

        window.togglePartyMic = () => {
            if (localStream) {
                const audioTrack = localStream.getAudioTracks()[0];
                if (audioTrack) {
                    audioTrack.enabled = !audioTrack.enabled;
                    const btn = document.getElementById('mic-toggle-btn');
                    if (btn) {
                        if (audioTrack.enabled) {
                            btn.className = 'p-2 bg-primary/10 rounded-lg text-primary hover:bg-primary/30';
                            btn.innerHTML = '<span class="material-icons-round text-sm">mic</span>';
                            btn.title = 'Tắt Micro';
                        } else {
                            btn.className = 'p-2 bg-red-500/10 rounded-lg text-red-400 hover:bg-red-500/30 hover:text-white';
                            btn.innerHTML = '<span class="material-icons-round text-sm">mic_off</span>';
                            btn.title = 'Bật Micro';
                        }
                    }
                }
            }
        };

        let peers = {}; // id -> Peer instance
        let localStream = null;

        async function initPartyChannel(id) {
            if (activePartyChannel) activePartyChannel.unsubscribe();

            const myUid = window.currentUserUid || 'guest-' + Math.random().toString(36).substring(2, 6);

            // Prepare Webcam for Party
            try {
                const constraints = { 
                    video: selectedVideoDeviceId ? { deviceId: { exact: selectedVideoDeviceId } } : true, 
                    audio: true 
                };
                localStream = await navigator.mediaDevices.getUserMedia(constraints);
                renderWebcam('local', localStream, 'Bạn (Tôi)', true);
                document.getElementById('party-mesh-grid')?.classList.remove('hidden');
                document.getElementById('dashboard-party-mesh-grid')?.classList.remove('hidden');
                document.getElementById('party-camera-selector')?.classList.remove('hidden');
                refreshCameraDevices();
            } catch (err) {
                console.error("Webcam Error:", err);
                alert("Không thể mở Webcam. Bạn vẫn có thể xem nhưng không hiện mặt.");
            }

            activePartyChannel = window.supabaseClient.channel(`party:${id}`, {
                config: { broadcast: { self: false }, presence: { key: myUid } }
            });

            activePartyChannel
                .on('presence', { event: 'sync' }, () => {
                    const state = activePartyChannel.presenceState();
                    Object.keys(state).forEach(uid => {
                        if (uid !== myUid && !peers[uid]) {
                            // As a new joiner, we initiate to everyone already there
                            createPeer(uid, true);
                        }
                    });
                })
                .on('broadcast', { event: 'webrtc-signal' }, (payload) => {
                    const { from, target, signal } = payload.payload;
                    if (target === myUid) {
                         if (!peers[from]) createPeer(from, false);
                         peers[from].signal(signal);
                    }
                })
                .on('broadcast', { event: 'peer-emotion' }, (payload) => {
                    const { from, emotion } = payload.payload;
                    showRemoteEmotion(from, emotion);
                })
                .on('broadcast', { event: 'sync_play' }, (payload) => {
                    if (isPartyHost) return;
                    syncPlayer('play', payload.payload);
                })
                .on('broadcast', { event: 'sync_pause' }, () => {
                    if (isPartyHost) return;
                    syncPlayer('pause');
                })
                .on('broadcast', { event: 'sync_seek' }, (payload) => {
                    if (isPartyHost) return;
                    syncPlayer('seek', payload.payload);
                })
                .on('broadcast', { event: 'change_film' }, (payload) => {
                    if (isPartyHost) return;
                    const { slug, epIndex } = payload.payload;
                    if (currentFilmSlug !== slug) {
                        if (window.streamFilmOphim) window.streamFilmOphim(slug, "", epIndex);
                    }
                })
                .on('broadcast', { event: 'request_sync' }, () => {
                    if (isPartyHost) {
                        const video = document.getElementById('film-video-player');
                        const audio = document.getElementById('local-audio');
                        const media = (video && !video.paused) ? video : ((audio && !audio.paused) ? audio : (video || audio));
                        
                        let yTime = 0, yPaused = true;
                        if (typeof isYtReady !== 'undefined' && isYtReady && typeof ytPlayer !== 'undefined' && typeof currentMode !== 'undefined' && currentMode === 'youtube') {
                            yTime = (typeof ytPlayer.getCurrentTime === 'function') ? ytPlayer.getCurrentTime() : 0;
                            yPaused = (typeof ytPlayer.getPlayerState === 'function') ? (ytPlayer.getPlayerState() !== YT.PlayerState.PLAYING) : true;
                        }

                        activePartyChannel.send({
                            type: 'broadcast',
                            event: 'respond_sync',
                            payload: {
                                slug: typeof currentFilmSlug !== 'undefined' ? currentFilmSlug : null,
                                epIndex: 0,
                                time: typeof currentMode !== 'undefined' && currentMode === 'youtube' ? yTime : (media ? media.currentTime : 0),
                                paused: typeof currentMode !== 'undefined' && currentMode === 'youtube' ? yPaused : (media ? media.paused : true),
                                audioSrc: audio ? audio.src : null,
                                currentMode: typeof currentMode !== 'undefined' ? currentMode : null,
                                trackData: typeof window.currentTrackData !== 'undefined' ? window.currentTrackData : null
                            }
                        });
                    }
                })
                .on('broadcast', { event: 'respond_sync' }, (payload) => {
                    if (isPartyHost) return;
                    const { slug, epIndex, time, paused, audioSrc, currentMode: cMode, trackData } = payload.payload;
                    if (slug && typeof currentFilmSlug !== 'undefined' && currentFilmSlug !== slug && typeof window.streamFilmOphim === 'function') {
                        window.streamFilmOphim(slug, "", epIndex).then(() => {
                            setTimeout(() => syncPlayer(paused ? 'pause' : 'play', { time }), 1000);
                        });
                    } else if (cMode && trackData && typeof playTrack === 'function') {
                        let shouldPlay = false;
                        if (typeof currentMode === 'undefined' || currentMode !== cMode) shouldPlay = true;
                        if (!window.currentTrackData || window.currentTrackData.link !== trackData.link) shouldPlay = true;
                        
                        if (shouldPlay) {
                            playTrack(trackData, cMode);
                        }
                        setTimeout(() => syncPlayer(paused ? 'pause' : 'play', { time }), 1500);
                    } else if (audioSrc && document.getElementById('local-audio') && (!document.getElementById('local-audio').src || !document.getElementById('local-audio').src.includes(audioSrc))) {
                        document.getElementById('local-audio').src = audioSrc;
                        document.getElementById('local-audio').load();
                        setTimeout(() => syncPlayer(paused ? 'pause' : 'play', { time }), 500);
                    } else {
                        syncPlayer(paused ? 'pause' : 'play', { time });
                    }
                })
                .on('broadcast', { event: 'change_track' }, (payload) => {
                    if (isPartyHost) return;
                    const { data, mode } = payload.payload;
                    if (typeof playTrack === 'function') {
                        playTrack(data, mode);
                    }
                })
                .subscribe(async (status) => {
                    if (status === 'SUBSCRIBED') {
                        await activePartyChannel.track({ online_at: new Date().toISOString(), user_id: window.currentUserUid });
                        if (!isPartyHost) {
                            activePartyChannel.send({ type: 'broadcast', event: 'request_sync' });
                        }
                        if (localStream) startEmotionTracking();
                    }
                });

            setupHostListeners();
        }

        function createPeer(targetUid, initiator) {
            const peer = new SimplePeer({
                initiator: initiator,
                trickle: false,
                stream: localStream
            });

            peer.on('signal', data => {
                activePartyChannel.send({
                    type: 'broadcast',
                    event: 'webrtc-signal',
                    payload: { from: window.currentUserUid || 'me', target: targetUid, signal: data }
                });
            });

            peer.on('stream', stream => {
                renderWebcam(targetUid, stream, `Bạn bè (${targetUid.substring(0,4)})`);
            });

            peer.on('close', () => {
                ['party-mesh-grid', 'dashboard-party-mesh-grid'].forEach(gridId => {
                    document.getElementById(`video-${gridId}-peer-${targetUid}`)?.parentElement?.remove();
                });
                delete peers[targetUid];
            });

            peers[targetUid] = peer;
            return peer;
        }

        function renderWebcam(id, stream, label, isLocal = false) {
            ['party-mesh-grid', 'dashboard-party-mesh-grid'].forEach(gridId => {
                const grid = document.getElementById(gridId);
                if (!grid) return;

                const contId = `${gridId}-peer-${id}`;
                let container = document.getElementById(contId);
                if (!container) {
                    container = document.createElement('div');
                    container.id = contId;
                    container.className = 'relative aspect-video bg-black/40 rounded-xl overflow-hidden border border-white/10 group';
                    container.innerHTML = `
                        <video id="video-${contId}" class="w-full h-full object-cover ${isLocal ? 'mirror-mode' : ''}" autoplay playsinline ${isLocal ? 'muted' : ''}></video>
                        <div class="absolute bottom-2 left-2 px-2 py-1 bg-black/60 backdrop-blur-md rounded-lg border border-white/10 flex items-center gap-2">
                            <div class="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                            <span class="text-[9px] font-bold text-white uppercase tracking-tight">${label}</span>
                        </div>
                        <div id="emotion-${contId}" class="absolute top-2 right-2 px-2 py-1 bg-primary/20 backdrop-blur-md rounded-lg border border-primary/40 opacity-0 transition-opacity">
                            <span class="text-lg">😊</span>
                        </div>
                    `;
                    grid.appendChild(container);
                }
                const video = document.getElementById(`video-${contId}`);
                video.srcObject = stream;
            });
        }

        function setupHostListeners() {
            ['film-video-player', 'local-audio'].forEach(id => {
                const media = document.getElementById(id);
                if (!media) return;

                media.onplay = () => {
                    if (isPartyHost && activePartyChannel) {
                        activePartyChannel.send({ type: 'broadcast', event: 'sync_play', payload: { time: media.currentTime } });
                    }
                };
                media.onpause = () => {
                    if (isPartyHost && activePartyChannel) {
                        activePartyChannel.send({ type: 'broadcast', event: 'sync_pause' });
                    }
                };
                media.onseeked = () => {
                    if (isPartyHost && activePartyChannel) {
                        activePartyChannel.send({ type: 'broadcast', event: 'sync_seek', payload: { time: media.currentTime } });
                    }
                };
            });
        }

        function syncPlayer(action, data) {
            ['film-video-player', 'local-audio'].forEach(id => {
                const media = document.getElementById(id);
                if (!media) return;

                const oldOnPlay = media.onplay;
                const oldOnPause = media.onpause;
                const oldOnSeek = media.onseeked;
                media.onplay = media.onpause = media.onseeked = null;

                if (action === 'play') {
                    if (data && Math.abs(media.currentTime - data.time) > 1.5) media.currentTime = data.time;
                    media.play().catch(() => {});
                } else if (action === 'pause') {
                    media.pause();
                    if (data) media.currentTime = data.time;
                } else if (action === 'seek') {
                    if (data) media.currentTime = data.time;
                }

                setTimeout(() => {
                    media.onplay = oldOnPlay;
                    media.onpause = oldOnPause;
                    media.onseeked = oldOnSeek;
                }, 500);
            });

            if (typeof currentMode !== 'undefined' && currentMode === 'youtube' && typeof isYtReady !== 'undefined' && isYtReady && typeof ytPlayer !== 'undefined' && ytPlayer.playVideo) {
                if (action === 'play') {
                    if (data && ytPlayer.getCurrentTime && Math.abs(ytPlayer.getCurrentTime() - data.time) > 1.5) ytPlayer.seekTo(data.time, true);
                    ytPlayer.playVideo();
                } else if (action === 'pause') {
                    ytPlayer.pauseVideo();
                    if (data && ytPlayer.seekTo) ytPlayer.seekTo(data.time, true);
                } else if (action === 'seek') {
                    if (data && ytPlayer.seekTo) ytPlayer.seekTo(data.time, true);
                }
            }
        }

        // --- EMOTION TRACKING ---
        let emotionInterval = null;
        const EMOTION_MAP = {
            'angry': '🔥', 'disgust': '🤢', 'fear': '😨', 'happy': '😂', 
            'sad': '😭', 'surprise': '😲', 'neutral': '😐'
        };

        function startEmotionTracking() {
            if (emotionInterval) clearInterval(emotionInterval);
            emotionInterval = setInterval(async () => {
                const video = document.getElementById('peer-video-local');
                if (!video || !activePartyChannel) return;

                const canvas = document.createElement('canvas');
                canvas.width = 160; canvas.height = 120;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                
                canvas.toBlob(async (blob) => {
                    const formData = new FormData();
                    formData.append('file', blob, 'emotion.jpg');
                    try {
                        const res = await fetch('/api/emotion', { method: 'POST', body: formData });
                        const data = await res.json();
                        if (data.status === 'success') {
                            const em = data.emotion;
                            showRemoteEmotion('local', em);
                            activePartyChannel.send({
                                type: 'broadcast',
                                event: 'peer-emotion',
                                payload: { from: window.currentUserUid || 'me', emotion: em }
                            });
                        }
                    } catch (e) {}
                }, 'image/jpeg', 0.5);
            }, 4000); // 4 seconds interval to be polite to server
        }

        function showRemoteEmotion(uid, emotion) {
            const emoji = EMOTION_MAP[emotion] || '😐';
            ['party-mesh-grid', 'dashboard-party-mesh-grid'].forEach(gridId => {
                const el = document.getElementById(`emotion-${gridId}-peer-${uid}`);
                if (el) {
                    el.querySelector('span').innerText = emoji;
                    el.style.opacity = '1';
                    el.classList.add('scale-125');
                    setTimeout(() => { 
                        el.style.opacity = '0';
                        el.classList.remove('scale-125');
                    }, 3000);
                }
            });
        }

        const observer = new MutationObserver(() => {
            if (isPartyHost) setupHostListeners();
        });
        observer.observe(document.body, { childList: true, subtree: true });

        // Initial render for Gamification
        document.addEventListener('DOMContentLoaded', () => {
            window.renderBadges();
            window.renderUserLeveling();
        });
        // --- Instagram-like Media Viewer (Full-screen) ---
        let mediaViewerState = { open: false, postId: null, index: 0, items: [] };

        function ensureMediaViewer() {
            let modal = document.getElementById('media-viewer-modal');
            if (modal) return modal;
            modal = document.createElement('div');
            modal.id = 'media-viewer-modal';
            modal.className = 'fixed inset-0 z-[10050] hidden';
            modal.innerHTML = `
                <div class="absolute inset-0 bg-black/80 backdrop-blur-sm" onclick="closeMediaViewer()"></div>
                <div class="absolute inset-0 flex items-center justify-center p-3 sm:p-6">
                    <div class="w-full max-w-4xl h-[80vh] sm:h-[86vh] bg-black/60 border border-white/10 rounded-3xl overflow-hidden shadow-2xl relative">
                        <button type="button" onclick="closeMediaViewer()" class="absolute top-3 right-3 z-20 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all">
                            <span class="material-icons-round">close</span>
                        </button>
                        <button type="button" onclick="mediaViewerPrev()" class="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all">
                            <span class="material-icons-round">chevron_left</span>
                        </button>
                        <button type="button" onclick="mediaViewerNext()" class="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all">
                            <span class="material-icons-round">chevron_right</span>
                        </button>
                        <div id="media-viewer-strip" class="w-full h-full flex overflow-x-auto no-scrollbar snap-x snap-mandatory scroll-smooth" onscroll="syncMediaViewerDots()"></div>
                        <div class="absolute bottom-3 left-0 right-0 flex items-center justify-center gap-2 z-20">
                            <div id="media-viewer-dots" class="flex items-center justify-center gap-1.5 bg-black/30 border border-white/10 rounded-full px-3 py-2"></div>
                        </div>
                        <div class="absolute top-3 left-3 z-20 text-[10px] font-black uppercase tracking-widest text-slate-200 bg-black/30 border border-white/10 rounded-full px-3 py-2">
                            <span id="media-viewer-counter">1/1</span>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            return modal;
        }

        function getPostMediaList(postId) {
            const post = findFeedPost(postId);
            if (!post || !post.media) return [];
            const raw = String(post.media);
            if (raw.trim().startsWith('[')) {
                try {
                    const arr = JSON.parse(raw);
                    return Array.isArray(arr) ? arr.filter(Boolean) : [];
                } catch (e) {
                    return [raw];
                }
            }
            return [raw];
        }

        window.openMediaViewer = (postId, startIndex = 0) => {
            const items = getPostMediaList(postId);
            if (!items || items.length === 0) return;
            ensureMediaViewer();

            mediaViewerState = { open: true, postId, index: Math.max(0, Math.min(items.length - 1, Number(startIndex) || 0)), items };
            const modal = document.getElementById('media-viewer-modal');
            const strip = document.getElementById('media-viewer-strip');
            const dots = document.getElementById('media-viewer-dots');
            const counter = document.getElementById('media-viewer-counter');
            if (!modal || !strip || !dots || !counter) return;

            strip.innerHTML = items.map(src => `
                <div class="w-full h-full flex-shrink-0 snap-center flex items-center justify-center bg-black">
                    <img src="${src}" class="w-full h-full object-contain select-none" draggable="false">
                </div>
            `).join('');
            dots.innerHTML = items.map((_, i) => `
                <button type="button" class="w-2 h-2 rounded-full ${i === mediaViewerState.index ? 'bg-white' : 'bg-white/30'}" onclick="mediaViewerGo(${i})"></button>
            `).join('');
            counter.textContent = `${mediaViewerState.index + 1}/${items.length}`;

            modal.classList.remove('hidden');
            // scroll to selected
            requestAnimationFrame(() => {
                strip.scrollLeft = strip.clientWidth * mediaViewerState.index;
                syncMediaViewerDots();
            });
            // lock page scroll
            document.documentElement.style.overflow = 'hidden';
        };

        window.closeMediaViewer = () => {
            const modal = document.getElementById('media-viewer-modal');
            if (modal) modal.classList.add('hidden');
            mediaViewerState = { open: false, postId: null, index: 0, items: [] };
            document.documentElement.style.overflow = '';
        };

        window.mediaViewerGo = (idx) => {
            const strip = document.getElementById('media-viewer-strip');
            if (!strip || !mediaViewerState.open) return;
            const i = Math.max(0, Math.min((mediaViewerState.items || []).length - 1, Number(idx) || 0));
            strip.scrollTo({ left: strip.clientWidth * i, behavior: 'smooth' });
        };

        window.mediaViewerPrev = () => {
            if (!mediaViewerState.open) return;
            mediaViewerGo((mediaViewerState.index || 0) - 1);
        };

        window.mediaViewerNext = () => {
            if (!mediaViewerState.open) return;
            mediaViewerGo((mediaViewerState.index || 0) + 1);
        };

        window.syncMediaViewerDots = () => {
            if (!mediaViewerState.open) return;
            const strip = document.getElementById('media-viewer-strip');
            const dots = document.getElementById('media-viewer-dots');
            const counter = document.getElementById('media-viewer-counter');
            if (!strip || !dots || !counter) return;
            const items = mediaViewerState.items || [];
            const idx = Math.round(strip.scrollLeft / Math.max(1, strip.clientWidth));
            mediaViewerState.index = Math.max(0, Math.min(items.length - 1, idx));
            Array.from(dots.children || []).forEach((el, i) => {
                el.className = `w-2 h-2 rounded-full ${i === mediaViewerState.index ? 'bg-white' : 'bg-white/30'}`;
            });
            counter.textContent = `${mediaViewerState.index + 1}/${items.length || 1}`;
        };

        // ESC / keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (!mediaViewerState.open) return;
            if (e.key === 'Escape') closeMediaViewer();
            if (e.key === 'ArrowLeft') mediaViewerPrev();
            if (e.key === 'ArrowRight') mediaViewerNext();
        });

        // Touch swipe for viewer (simple)
        document.addEventListener('touchstart', (e) => {
            if (!mediaViewerState.open) return;
            const strip = document.getElementById('media-viewer-strip');
            if (!strip || !e.target.closest('#media-viewer-strip')) return;
            strip._swipeX = e.touches[0]?.clientX || 0;
        }, { passive: true });
        document.addEventListener('touchend', (e) => {
            if (!mediaViewerState.open) return;
            const strip = document.getElementById('media-viewer-strip');
            if (!strip || strip._swipeX == null) return;
            const endX = e.changedTouches[0]?.clientX || 0;
            const dx = endX - strip._swipeX;
            strip._swipeX = null;
            if (Math.abs(dx) < 40) return;
            if (dx > 0) mediaViewerPrev();
            else mediaViewerNext();
        }, { passive: true });

        // Upgrade in-feed carousel controls + dot click + open viewer
        window.postMediaGo = (postId, idx) => {
            const strip = document.getElementById(`post-media-strip-${postId}`);
            if (!strip) return;
            const i = Math.max(0, Number(idx) || 0);
            strip.scrollTo({ left: strip.clientWidth * i, behavior: 'smooth' });
        };

        window.postMediaPrev = (postId) => {
            const strip = document.getElementById(`post-media-strip-${postId}`);
            if (!strip) return;
            const idx = Math.round(strip.scrollLeft / Math.max(1, strip.clientWidth));
            postMediaGo(postId, idx - 1);
        };

        window.postMediaNext = (postId) => {
            const strip = document.getElementById(`post-media-strip-${postId}`);
            if (!strip) return;
            const idx = Math.round(strip.scrollLeft / Math.max(1, strip.clientWidth));
            postMediaGo(postId, idx + 1);
        };

        // Patch existing dot sync to also allow click + open viewer from feed images.
        const _origSyncPostMediaDots = window.syncPostMediaDots;
        window.syncPostMediaDots = (postId) => {
            if (typeof _origSyncPostMediaDots === 'function') _origSyncPostMediaDots(postId);
            // also update counter if exists
            const strip = document.getElementById(`post-media-strip-${postId}`);
            const counter = document.getElementById(`post-media-counter-${postId}`);
            if (!strip || !counter) return;
            const idx = Math.round(strip.scrollLeft / Math.max(1, strip.clientWidth));
            const total = strip.children?.length || 1;
            counter.textContent = `${Math.max(1, Math.min(total, idx + 1))}/${total}`;
        };

        // Load About Section Images
        const loadAboutImages = () => {
            const profileB64 = "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";
            const qrB64 = "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";
            const profileImg = document.getElementById('about-profile-img');
            const qrImg = document.getElementById('about-qr-img');
            if (profileImg && profileB64) profileImg.src = profileB64.startsWith('data:') ? profileB64 : 'data:image/jpeg;base64,' + profileB64;
            if (qrImg && qrB64) qrImg.src = qrB64.startsWith('data:') ? qrB64 : 'data:image/jpeg;base64,' + qrB64;
        };
        loadAboutImages();
