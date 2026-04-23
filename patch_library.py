import re

with open('C:/Mood-based-Recommender/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

library_html = """
        <div id="view-library" class="hidden animate-fade-in space-y-6">
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <!-- Cột 1: Nhạc yêu thích -->
                <div class="glass-card rounded-[2rem] p-6 h-[75vh] flex flex-col relative border border-white/5 hover:border-white/10 transition-colors">
                    <div class="flex items-center justify-between mb-4 border-b border-white/5 pb-4">
                        <h3 class="font-bold text-white flex items-center gap-2 text-xl">
                            <span class="material-icons-round text-red-500">favorite</span> Bài Hát Yêu Thích
                        </h3>
                    </div>
                    <div id="library-favorites-list" class="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                        <div class="flex flex-col items-center justify-center h-40 opacity-50">
                            <span class="material-icons-round text-4xl mb-2">favorite_border</span>
                            <p class="text-xs">Chưa có bài hát yêu thích nào.</p>
                        </div>
                    </div>
                </div>

                <!-- Cột 2: Playlist -->
                <div class="glass-card rounded-[2rem] p-6 h-[75vh] flex flex-col relative border border-white/5 hover:border-white/10 transition-colors">
                    <div class="flex items-center justify-between mb-4 border-b border-white/5 pb-4">
                        <h3 class="font-bold text-white flex items-center gap-2 text-xl">
                            <span class="material-icons-round text-blue-400">queue_music</span> Playlists
                        </h3>
                        <button onclick="document.getElementById('playlist-modal').classList.remove('opacity-0', 'pointer-events-none')" class="p-2 bg-primary/20 text-primary hover:bg-primary hover:text-[#0a0a0a] rounded-full transition-all">
                            <span class="material-icons-round text-sm">add</span>
                        </button>
                    </div>
                    <div id="library-playlists-list" class="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                        <div class="flex flex-col items-center justify-center h-40 opacity-50">
                            <span class="material-icons-round text-4xl mb-2">library_music</span>
                            <p class="text-xs">Chưa có playlist nào.</p>
                        </div>
                    </div>
                    <!-- Playlist overlay -->
                    <div id="playlist-details-overlay" class="absolute inset-0 z-10 bg-bg-dark rounded-[2rem] p-6 flex flex-col transition-transform transform translate-x-full duration-300">
                        <div class="flex items-center justify-between mb-4 border-b border-white/5 pb-4">
                            <button onclick="document.getElementById('playlist-details-overlay').classList.add('translate-x-full')" class="p-2 text-slate-400 hover:text-white rounded-full">
                                <span class="material-icons-round">arrow_back</span>
                            </button>
                            <h3 id="playlist-details-title" class="font-bold text-white text-lg truncate ml-2">Playlist</h3>
                        </div>
                        <div id="playlist-details-list" class="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar"></div>
                    </div>
                </div>

                <!-- Cột 3: Phim yêu thích (Watchlist) -->
                <div class="glass-card rounded-[2rem] p-6 h-[75vh] flex flex-col relative border border-white/5 hover:border-white/10 transition-colors">
                    <div class="flex items-center justify-between mb-4 border-b border-white/5 pb-4">
                        <h3 class="font-bold text-white flex items-center gap-2 text-xl">
                            <span class="material-icons-round text-primary">movie_filter</span> Phim Yêu Thích
                        </h3>
                        <span class="text-[10px] bg-white/10 text-white px-2 py-1 rounded font-bold uppercase tracking-widest">Watchlist</span>
                    </div>
                    <div id="library-watchlist-list" class="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar grid grid-cols-2 gap-3 pb-8">
                        <div class="col-span-2 flex flex-col items-center justify-center h-40 opacity-50">
                            <span class="material-icons-round text-4xl mb-2">movie</span>
                            <p class="text-xs">Chưa có phim nào trong Watchlist.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>"""

old_library = re.search(r'<div id="view-library".*?</div>\s*</div>\s*</div>', content, re.DOTALL)
if old_library:
    content = content.replace(old_library.group(0), library_html)

with open('C:/Mood-based-Recommender/index.html', 'w', encoding='utf-8') as f:
    f.write(content)
