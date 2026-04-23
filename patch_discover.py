import re

with open('C:/Mood-based-Recommender/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

discover_html = """
        <!-- DISCOVER VIEW (Tinder-style Swipe) -->
        <div id="view-discover" class="hidden animate-fade-in">
            <div class="max-w-md mx-auto h-[70vh] flex flex-col relative pt-4">
                
                <!-- Header -->
                <div class="flex justify-between items-center mb-6 px-4">
                    <div class="flex items-center gap-2">
                        <span class="material-icons-round text-primary text-2xl">local_fire_department</span>
                        <h2 class="text-xl font-display font-black text-white uppercase tracking-tight">Kiet<span class="text-primary">Match</span></h2>
                    </div>
                    <div class="bg-white/10 px-3 py-1.5 rounded-full flex items-center gap-2">
                        <span class="material-icons-round text-white text-[16px]">movie</span>
                        <span class="text-xs font-bold text-white" id="discover-mode-label">Phim Mới</span>
                    </div>
                </div>

                <!-- Swipe Cards Container -->
                <div id="swipe-container" class="relative flex-1 w-full flex items-center justify-center perspective-1000">
                    <!-- Cards will be injected here via JS -->
                    <div id="swipe-loading" class="absolute inset-0 flex flex-col items-center justify-center">
                        <div class="w-12 h-12 border-4 border-white/10 border-t-primary rounded-full animate-spin"></div>
                        <p class="text-slate-400 text-sm font-bold mt-4">Đang tìm kiếm nội dung...</p>
                    </div>
                    
                    <div id="swipe-empty" class="absolute inset-0 flex flex-col items-center justify-center hidden bg-black/40 rounded-[2rem] border border-white/5 backdrop-blur-md z-10">
                        <span class="material-icons-round text-6xl text-slate-600 mb-4">sentiment_dissatisfied</span>
                        <p class="text-slate-400 text-sm font-bold text-center px-8">Hết nội dung gợi ý!<br>Vui lòng thử lại sau.</p>
                        <button onclick="loadDiscoverContent()" class="mt-6 px-6 py-2 bg-primary/20 text-primary font-bold rounded-xl border border-primary/30 hover:bg-primary/30 transition-all">Tải lại</button>
                    </div>
                </div>

                <!-- Action Buttons -->
                <div class="flex justify-center items-center gap-6 mt-8 mb-4">
                    <button onclick="handleSwipeAction('left')" class="w-16 h-16 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center shadow-lg transform transition-transform active:scale-90 group">
                        <span class="material-icons-round text-red-500 text-3xl group-hover:scale-110 transition-transform">close</span>
                    </button>
                    
                    <button onclick="handleSwipeAction('right')" class="w-20 h-20 rounded-full bg-primary/10 hover:bg-primary/20 border-2 border-primary/30 flex items-center justify-center shadow-[0_0_30px_rgba(var(--color-primary),0.2)] transform transition-transform active:scale-90 group">
                        <span class="material-icons-round text-primary text-4xl group-hover:scale-110 transition-transform">favorite</span>
                    </button>
                    
                    <button onclick="handleSwipeAction('up')" class="w-16 h-16 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center shadow-lg transform transition-transform active:scale-90 group">
                        <span class="material-icons-round text-blue-400 text-3xl group-hover:scale-110 transition-transform">info</span>
                    </button>
                </div>
                
                <!-- Tutorial Overlay (shows once) -->
                <div id="discover-tutorial" class="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm rounded-[2rem] p-8 text-center transition-opacity duration-500 cursor-pointer" onclick="this.classList.add('opacity-0', 'pointer-events-none')">
                    <div class="flex justify-between w-full max-w-[250px] mb-8">
                        <div class="flex flex-col items-center gap-2">
                            <span class="material-icons-round text-red-500 text-4xl animate-bounce">swipe_left</span>
                            <span class="text-xs font-bold text-white uppercase tracking-widest">Bỏ qua</span>
                        </div>
                        <div class="flex flex-col items-center gap-2">
                            <span class="material-icons-round text-primary text-4xl animate-bounce" style="animation-delay: 0.2s">swipe_right</span>
                            <span class="text-xs font-bold text-white uppercase tracking-widest">Yêu thích</span>
                        </div>
                    </div>
                    <p class="text-white font-bold text-sm bg-white/10 px-6 py-3 rounded-full border border-white/20">Chạm để bắt đầu trải nghiệm</p>
                </div>
            </div>
        </div>

        <!-- ABOUT VIEW -->"""

content = content.replace('        <!-- ABOUT VIEW -->', discover_html)

with open('C:/Mood-based-Recommender/index.html', 'w', encoding='utf-8') as f:
    f.write(content)
