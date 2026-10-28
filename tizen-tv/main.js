// Opens the deployed Space. ES5: Tizen 5.0 TVs run a Chrome 63 engine.
var APP_URL = 'https://kietvohcb-moodbasedrecommender.hf.space/?view=dashboard';

function go() { window.location.replace(APP_URL); }

function check() {
  if (navigator.onLine === false) {
    document.getElementById('msg').textContent = 'Không có mạng. Đang thử lại...';
    setTimeout(check, 3000);
  } else {
    go();
  }
}

check();
