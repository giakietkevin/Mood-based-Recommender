import re

with open('C:/Mood-based-Recommender/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

discover_html = """
        <!-- DISCOVER VIEW (Tinder-style Swipe) -->
        <div id="view-discover" class="hidden animate-fade-in relative">
            <div class="max-w-md mx-auto h-[75vh] flex flex-col relative pt-4 pb-20">
                
                <!-- Header -->
                <div class="flex justify-between items-center mb-6 px-4 shrink-0">
                    <div class="flex items-center gap-2">
                        <span class="material-icons-round text-primary text-2xl drop-shadow-[0_0_10px_rgba(var(--color-primary),0.5)]">local_fire_department</span>
                        <h2 class="text-xl font-display font-black text-white uppercase tracking-tight">Kiet<span class="text-primary">Match</span></h2>
                    </div>
                    <div class="bg-white/10 px-3 py-1.5 rounded-full flex items-center gap-2 border border-white/5">
                        <span class="material-icons-round text-primary text-[16px]">movie</span>
                        <span class="text-xs font-bold text-white">Khám Phá Phim</span>
                    </div>
                </div>

                <!-- Swipe Cards Container -->
                <div id="swipe-container" class="relative flex-1 w-full flex items-center justify-center perspective-1000 mt-2 z-10" style="touch-action: pan-y; -webkit-user-drag: none;">
                    <!-- Cards will be injected here via JS -->
                    <div id="swipe-loading" class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <div class="w-12 h-12 border-4 border-white/10 border-t-primary rounded-full animate-spin"></div>
                        <p class="text-slate-400 text-sm font-bold mt-4 animate-pulse">Đang tìm kiếm nội dung...</p>
                    </div>
                    
                    <div id="swipe-empty" class="absolute inset-0 flex flex-col items-center justify-center hidden bg-black/40 rounded-[2rem] border border-white/5 backdrop-blur-md z-10 pointer-events-auto">
                        <span class="material-icons-round text-6xl text-slate-600 mb-4">sentiment_dissatisfied</span>
                        <p class="text-slate-400 text-sm font-bold text-center px-8">Đã hết gợi ý!<br>Vui lòng thử tải lại.</p>
                        <button onclick="loadDiscoverContent(currentDiscoverPage + 1)" class="mt-6 px-6 py-2 bg-primary/20 text-primary font-bold rounded-xl border border-primary/30 hover:bg-primary/30 transition-all shadow-lg">Tải Mới</button>
                    </div>
                </div>

                <!-- Action Buttons -->
                <div class="flex justify-center items-center gap-6 mt-8 mb-4 shrink-0 z-20">
                    <button onclick="handleSwipeAction('left')" class="w-16 h-16 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center shadow-lg transform transition-transform active:scale-90 group pointer-events-auto">
                        <span class="material-icons-round text-red-500 text-3xl group-hover:scale-110 transition-transform">close</span>
                    </button>
                    
                    <button onclick="handleSwipeAction('up')" class="w-16 h-16 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center shadow-lg transform transition-transform active:scale-90 group pointer-events-auto">
                        <span class="material-icons-round text-blue-400 text-3xl group-hover:scale-110 transition-transform">info</span>
                    </button>
                    
                    <button onclick="handleSwipeAction('right')" class="w-20 h-20 rounded-full bg-primary/10 hover:bg-primary/20 border-2 border-primary/30 flex items-center justify-center shadow-[0_0_30px_rgba(var(--color-primary),0.2)] transform transition-transform active:scale-90 group pointer-events-auto">
                        <span class="material-icons-round text-primary text-4xl group-hover:scale-110 transition-transform">favorite</span>
                    </button>
                </div>
            </div>
            <div class="absolute -top-40 -left-40 w-96 h-96 bg-primary/10 blur-[100px] rounded-full pointer-events-none"></div>
            <div class="absolute top-40 -right-40 w-96 h-96 bg-secondary/10 blur-[100px] rounded-full pointer-events-none"></div>
        </div>

        <!-- PROFESSIONAL ABOUT SECTION (NEW) -->"""

content = content.replace('        <!-- PROFESSIONAL ABOUT SECTION (NEW) -->', discover_html)

# Add script at the end
script_tag = """    <script src="js/social.js"></script>
    <script src="js/discover.js"></script>
    <script src="js/app.js"></script>"""
content = content.replace('    <script src="js/social.js"></script>\n    <script src="js/app.js"></script>', script_tag)

with open('C:/Mood-based-Recommender/index.html', 'w', encoding='utf-8') as f:
    f.write(content)
