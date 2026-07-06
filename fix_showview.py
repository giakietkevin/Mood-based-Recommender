with open('js/app.js', 'r', encoding='utf-8') as f:
    content = f.read()

old_code = """            const vipModal = document.getElementById('film-vip-modal');
            if (vipModal && viewName !== 'film' && viewName !== 'movie') {
                vipModal.classList.add('hidden');
            }"""

new_code = """            const vipModal = document.getElementById('film-vip-modal');
            if (vipModal) {
                // Luôn ẩn modal nếu chuyển sang tab khác, hoặc nếu đã ở tab film mà ĐÃ XÁC THỰC
                if (viewName !== 'film' && viewName !== 'movie') {
                    vipModal.classList.add('hidden');
                } else if (sessionStorage.getItem('filmVerified') === 'true') {
                    vipModal.classList.add('hidden');
                }
            }"""

content = content.replace(old_code, new_code)
with open('js/app.js', 'w', encoding='utf-8') as f:
    f.write(content)
