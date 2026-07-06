with open('js/app.js', 'r', encoding='utf-8') as f:
    content = f.read()

old_code = """            if (code === '101020') {
                sessionStorage.setItem('filmVerified', 'true');
                document.getElementById('film-vip-modal').classList.add('hidden');
                window.showView('film');
                const filmNav = document.getElementById('nav-film');
                if (filmNav) {
                    filmNav.classList.add('bg-white/10', 'text-white', 'shadow-sm');
                    filmNav.classList.remove('text-slate-400');
                }
                alert('Mở khóa thành công! Chào mừng bạn đến với KietFilm Station.');
            }"""

new_code = """            if (code === '101020') {
                sessionStorage.setItem('filmVerified', 'true');
                window.showView('film');
                alert('Mở khóa thành công! Chào mừng bạn đến với KietFilm Station.');
            }"""

content = content.replace(old_code, new_code)
with open('js/app.js', 'w', encoding='utf-8') as f:
    f.write(content)
