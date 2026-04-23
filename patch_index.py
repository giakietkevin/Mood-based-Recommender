import re

with open('C:/Mood-based-Recommender/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

nav_html = """
    <!-- Mobile Bottom Navigation -->
    <div class="mobile-bottom-nav sm:hidden">
        <button type="button" onclick="showView('home')" id="mob-nav-home" class="active">
            <span class="material-icons-round">home</span>
            <span class="label">Home</span>
        </button>
        <button type="button" onclick="showView('dashboard')" id="mob-nav-dashboard">
            <span class="material-icons-round">music_note</span>
            <span class="label">Music</span>
        </button>
        <button type="button" onclick="showView('film')" id="mob-nav-film">
            <span class="material-icons-round">movie</span>
            <span class="label">Film</span>
        </button>
        <button type="button" onclick="showView('game')" id="mob-nav-game">
            <span class="material-icons-round">sports_esports</span>
            <span class="label">Game</span>
        </button>
        <button type="button" onclick="showView('photobooth')" id="mob-nav-photobooth">
            <span class="material-icons-round">camera_alt</span>
            <span class="label">Photo</span>
        </button>
    </div>

    <script src="js/social.js"></script>"""

content = content.replace('    <script src="js/social.js"></script>', nav_html)

with open('C:/Mood-based-Recommender/index.html', 'w', encoding='utf-8') as f:
    f.write(content)
