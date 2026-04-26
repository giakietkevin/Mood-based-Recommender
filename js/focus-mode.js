// ==========================================
// FOCUS MODE / POMODORO SYSTEM
// ==========================================

let focusTimer = null;
let focusTimeRemaining = 25 * 60; // 25 mins in seconds
let isFocusWorking = true; // true = work, false = break
let focusSessionsCompleted = 0;
let focusTotalTimeSecs = 0;
let focusStreak = 0;
let focusCameraInterval = null;

// Settings
const WORK_TIME = 25 * 60;
const BREAK_TIME = 5 * 60;

window.onFocusCameraDeviceChange = async (select) => {
    window.selectedVideoDeviceId = select.value;
    const mainSelector = document.getElementById('camera-device-select');
    if (mainSelector) mainSelector.value = window.selectedVideoDeviceId;

    const video = document.getElementById('focus-video');
    if (video && video.srcObject) {
        stopFocusCamera();
        initFocusCamera();
    }
};

window.initFocusCamera = async () => {
    try {
        if (typeof window.stopAllCameras === 'function') window.stopAllCameras('focus');

        // Request camera with fallback
        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: window.selectedVideoDeviceId ? { deviceId: { exact: window.selectedVideoDeviceId } } : { facingMode: 'user' }
            });
        } catch (err) {
            console.warn("Failed exact device, fallback to default camera", err);
            stream = await navigator.mediaDevices.getUserMedia({ video: true });
        }

        const video = document.getElementById('focus-video');
        if (!video) {
            console.error("focus-video element not found");
            return;
        }

        video.srcObject = stream;

        // Populate dropdowns once we have permission
        if (typeof window.refreshCameraDevices === 'function') {
            await window.refreshCameraDevices();
        }

        // Wait for video to load and play
        await new Promise((resolve) => {
            if (video.videoWidth > 0) {
                resolve();
            } else {
                video.onloadedmetadata = resolve;
                setTimeout(resolve, 2000); // Fallback after 2s
            }
        });

        // Play video
        try {
            await video.play();
            document.getElementById('focus-webcam-overlay').classList.add('hidden');
            console.log("Focus camera started successfully");
        } catch (e) {
            console.error("Video play error:", e);
            // Try to hide overlay anyway if stream is active
            if (video.srcObject && video.srcObject.active) {
                document.getElementById('focus-webcam-overlay').classList.add('hidden');
            }
        }

    } catch (e) {
        console.error("Lỗi truy cập camera (Focus Mode):", e);
        document.getElementById('focus-webcam-overlay').classList.remove('hidden');
    }
};

window.stopFocusCamera = () => {
    const video = document.getElementById('focus-video');
    if (video && video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
        video.srcObject = null;
    }

    const overlay = document.getElementById('focus-webcam-overlay');
    if (overlay) overlay.classList.remove('hidden');

    if (focusCameraInterval) {
        clearInterval(focusCameraInterval);
        focusCameraInterval = null;
    }
};

window.startFocusTimer = () => {
    document.getElementById('btn-focus-start').classList.add('hidden');
    document.getElementById('btn-focus-pause').classList.remove('hidden');

    // Auto play Lofi - always search and play
    searchAndPlayLofi();

    // Start emotion monitoring if not started
    if (!focusCameraInterval) {
        focusCameraInterval = setInterval(analyzeFocusEmotion, 10000); // Check every 10s
    }

    if (focusTimer) clearInterval(focusTimer);
    focusTimer = setInterval(() => {
        if (focusTimeRemaining > 0) {
            focusTimeRemaining--;
            if (isFocusWorking) {
                focusTotalTimeSecs++;
                updateFocusStats();
            }
            updateFocusDisplay();
        } else {
            handleSessionComplete();
        }
    }, 1000);
};

window.pauseFocusTimer = () => {
    document.getElementById('btn-focus-start').classList.remove('hidden');
    document.getElementById('btn-focus-pause').classList.add('hidden');

    if (focusTimer) {
        clearInterval(focusTimer);
        focusTimer = null;
    }
    if (focusCameraInterval) {
        clearInterval(focusCameraInterval);
        focusCameraInterval = null;
    }
};

window.resetFocusTimer = () => {
    pauseFocusTimer();
    isFocusWorking = true;
    focusTimeRemaining = WORK_TIME;
    updateFocusDisplay();
    document.getElementById('focus-session-type').innerText = 'Work Session';
    document.getElementById('focus-session-type').className = 'inline-block px-4 py-2 rounded-full bg-primary/20 text-primary text-xs font-bold uppercase tracking-widest border border-primary/30';
};

function handleSessionComplete() {
    pauseFocusTimer();
    // Play sound notification
    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
    audio.play().catch(e => console.log('Audio error:', e));

    if (isFocusWorking) {
        focusSessionsCompleted++;
        focusStreak++;
        document.getElementById('focus-completed-sessions').innerText = focusSessionsCompleted;
        document.getElementById('focus-streak').innerText = focusStreak;

        isFocusWorking = false;
        focusTimeRemaining = BREAK_TIME;
        document.getElementById('focus-session-type').innerText = 'Break Time';
        document.getElementById('focus-session-type').className = 'inline-block px-4 py-2 rounded-full bg-green-500/20 text-green-400 text-xs font-bold uppercase tracking-widest border border-green-500/30';
        document.getElementById('focus-session-count').innerText = `Break after Session ${focusSessionsCompleted}`;

        // Maybe change music for break
        if (window.youtubePlayer && window.youtubePlayer.pauseVideo) {
            window.youtubePlayer.pauseVideo();
        }
        document.getElementById('focus-now-playing').innerHTML = `
            <span class="material-icons-round text-green-400/50 text-5xl mb-3">coffee</span>
            <p class="text-sm text-green-400">Take a break. Music paused.</p>
        `;
    } else {
        isFocusWorking = true;
        focusTimeRemaining = WORK_TIME;
        document.getElementById('focus-session-type').innerText = 'Work Session';
        document.getElementById('focus-session-type').className = 'inline-block px-4 py-2 rounded-full bg-primary/20 text-primary text-xs font-bold uppercase tracking-widest border border-primary/30';
        document.getElementById('focus-session-count').innerText = `Session ${focusSessionsCompleted + 1}`;

        // Resume music
        if (window.youtubePlayer && window.youtubePlayer.playVideo) {
            window.youtubePlayer.playVideo();
        }
    }

    updateFocusDisplay();
    // Auto-start next phase
    setTimeout(startFocusTimer, 3000);
}

function updateFocusDisplay() {
    const mins = Math.floor(focusTimeRemaining / 60);
    const secs = focusTimeRemaining % 60;
    document.getElementById('focus-timer-display').innerText =
        `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

    // Progress bar
    const total = isFocusWorking ? WORK_TIME : BREAK_TIME;
    const percentage = ((total - focusTimeRemaining) / total) * 100;
    document.getElementById('focus-progress-bar').style.width = `${percentage}%`;
    document.getElementById('focus-progress-bar').className = `h-full transition-all duration-1000 ${isFocusWorking ? 'bg-primary' : 'bg-green-500'}`;
}

function updateFocusStats() {
    const hours = Math.floor(focusTotalTimeSecs / 3600);
    const mins = Math.floor((focusTotalTimeSecs % 3600) / 60);
    document.getElementById('focus-total-time').innerText = `${hours}h ${mins}m`;
}

async function searchAndPlayLofi() {
    console.log('[Focus] Searching for lo-fi music...');
    try {
        const res = await fetch(`/search?q=lofi+hip+hop+radio+beats+to+relax+study+to&type=music`);
        console.log('[Focus] Search response status:', res.status);
        if (!res.ok) throw new Error('Search failed');
        const data = await res.json();
        console.log('[Focus] Search results:', data);

        // Backend returns {mood, recommendations: [...]}
        const tracks = data.recommendations || data;
        if (tracks && tracks.length > 0) {
            const track = tracks[0];
            console.log('[Focus] Playing track:', track);

            // Validate track has required fields
            if (!track.title || !track.link) {
                console.warn('[Focus] Track missing required fields:', track);
                throw new Error('Invalid track data');
            }

            // Call playTrack with correct signature: (data, mode)
            if (typeof window.playTrack === 'function') {
                console.log('[Focus] Calling window.playTrack...');
                window.playTrack({
                    title: track.title,
                    artist: 'Lo-fi',
                    thumbnail: track.thumbnail || 'https://cdn-icons-png.flaticon.com/512/12204/12204300.png',
                    link: track.link
                }, 'youtube');
            } else {
                console.error('[Focus] window.playTrack is not a function!');
                throw new Error('playTrack function not available');
            }

            document.getElementById('focus-now-playing').innerHTML = `
                <img src="${track.thumbnail || 'https://cdn-icons-png.flaticon.com/512/12204/12204300.png'}" class="w-16 h-16 rounded-xl mx-auto mb-3 object-cover shadow-lg border border-white/10">
                <p class="text-sm font-bold text-white line-clamp-1">${track.title}</p>
                <p class="text-xs text-slate-400">Playing Lo-fi</p>
            `;
        } else {
            console.warn('[Focus] No search results found, trying fallback search');
            // Fallback: try simpler search
            const fallbackRes = await fetch(`/search?q=lofi+beats&type=music`);
            if (fallbackRes.ok) {
                const fallbackData = await fallbackRes.json();
                const fallbackTracks = fallbackData.recommendations || fallbackData;
                if (fallbackTracks && fallbackTracks.length > 0) {
                    const track = fallbackTracks[0];
                    if (typeof window.playTrack === 'function') {
                        window.playTrack({
                            title: track.title,
                            artist: 'Lo-fi',
                            thumbnail: track.thumbnail || 'https://cdn-icons-png.flaticon.com/512/12204/12204300.png',
                            link: track.link
                        }, 'youtube');
                    }
                    document.getElementById('focus-now-playing').innerHTML = `
                        <img src="${track.thumbnail || 'https://cdn-icons-png.flaticon.com/512/12204/12204300.png'}" class="w-16 h-16 rounded-xl mx-auto mb-3 object-cover shadow-lg border border-white/10">
                        <p class="text-sm font-bold text-white line-clamp-1">${track.title}</p>
                        <p class="text-xs text-slate-400">Playing Lo-fi (Fallback)</p>
                    `;
                    return;
                }
            }
            throw new Error('No search results found');
        }
    } catch (e) {
        console.error("[Focus] Lỗi auto play Lofi:", e);
        document.getElementById('focus-now-playing').innerHTML = `
            <span class="material-icons-round text-red-400/50 text-5xl mb-3">error</span>
            <p class="text-sm text-red-400">Không thể phát nhạc</p>
            <p class="text-xs text-slate-500">Kiểm tra kết nối backend</p>
        `;
    }
}

async function analyzeFocusEmotion() {
    const video = document.getElementById('focus-video');
    if (!video || !video.videoWidth) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);

    canvas.toBlob(async (blob) => {
        const formData = new FormData();
        formData.append('file', blob, 'capture.jpg');

        try {
            const res = await fetch('/api/emotion', {
                method: 'POST',
                body: formData
            });

            if (res.ok) {
                const data = await res.json();
                if (data.emotion) {
                    updateFocusEmotionUI(data.emotion);
                    handleStressDetection(data.emotion);
                }
            }
        } catch (e) {
            console.error('Focus emotion detection error:', e);
        }
    }, 'image/jpeg');
}

function updateFocusEmotionUI(emotion) {
    const badge = document.getElementById('focus-emotion-badge');

    const emojiMap = {
        'joy': '😊 Joy',
        'sadness': '😢 Sadness',
        'anger': '😠 Anger (Stress)',
        'surprise': '😲 Surprise',
        'fear': '😨 Fear',
        'disgust': '🤢 Disgust',
        'neutral': '😐 Neutral',
        'calmness': '😌 Calm'
    };

    const colorMap = {
        'joy': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
        'sadness': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
        'anger': 'bg-red-500/20 text-red-400 border-red-500/30',
        'neutral': 'bg-white/10 text-white border-white/5',
        'calmness': 'bg-green-500/20 text-green-400 border-green-500/30'
    };

    badge.innerText = emojiMap[emotion] || emotion;
    badge.className = `px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border transition-all ${colorMap[emotion] || colorMap['neutral']}`;
}

let stressCounter = 0;
function handleStressDetection(emotion) {
    // If user is stressed/angry for 3 consecutive checks (30s), change to calming music
    if (emotion === 'anger' || emotion === 'sadness' || emotion === 'fear') {
        stressCounter++;
        if (stressCounter >= 3 && isFocusWorking) {
            showFloatingReaction('😌'); // Visual feedback
            playCalmingMusic();
            stressCounter = 0; // Reset
        }
    } else {
        stressCounter = 0; // Reset if calm
    }
}

async function playCalmingMusic() {
    try {
        const res = await fetch(`/search?q=deep+focus+ambient+calming+music+stress+relief&type=music`);
        if (!res.ok) throw new Error('Search failed');
        const data = await res.json();

        // Backend returns {mood, recommendations: [...]}
        const tracks = data.recommendations || data;
        if (tracks && tracks.length > 0) {
            const track = tracks[0];
            if (typeof window.playTrack === 'function') {
                window.playTrack({
                    title: track.title,
                    artist: 'Calming Music',
                    thumbnail: track.thumbnail,
                    link: track.link
                }, 'youtube');
            }

            document.getElementById('focus-now-playing').innerHTML = `
                <div class="relative inline-block mb-3">
                    <img src="${track.thumbnail}" class="w-16 h-16 rounded-xl mx-auto object-cover shadow-lg border border-white/10">
                    <div class="absolute -right-2 -top-2 bg-green-500 text-white text-[8px] font-bold px-2 py-1 rounded-full animate-bounce">Stress Relieved</div>
                </div>
                <p class="text-sm font-bold text-white line-clamp-1">${track.title}</p>
                <p class="text-xs text-green-400">Switched to Calming Music</p>
            `;
        }
    } catch (e) {
        console.error("Lỗi auto play Calming music:", e);
    }
}
