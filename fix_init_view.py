with open('js/app.js', 'r', encoding='utf-8') as f:
    content = f.read()

old_code = """            } else if (initialView === 'film' || initialView === 'movie') {
                // Show VIP modal for direct film/movie access via URL
                const modal = document.getElementById('film-vip-modal');
                if (modal) modal.classList.remove('hidden');
                showView('dashboard');
            } else {"""

new_code = """            } else if (initialView === 'film' || initialView === 'movie') {
                // Show VIP modal for direct film/movie access via URL
                if (sessionStorage.getItem('filmVerified') === 'true') {
                    showView('film');
                } else {
                    showView('dashboard'); // Render dashboard background
                    const modal = document.getElementById('film-vip-modal');
                    if (modal) modal.classList.remove('hidden'); // Show modal AFTER dashboard is rendered
                }
            } else {"""

content = content.replace(old_code, new_code)
with open('js/app.js', 'w', encoding='utf-8') as f:
    f.write(content)
