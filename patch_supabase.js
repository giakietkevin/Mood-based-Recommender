const fs = require('fs');
let code = fs.readFileSync('js/app.js', 'utf8');

// Thay thế đoạn window.supabaseClient = { ... } bằng window.supabaseClient = null;
const regex = /window\.supabaseClient = \{\s*auth: \{[\s\S]*?rpc: noopProxy\s*\};/g;
code = code.replace(regex, 'window.supabaseClient = null;');

fs.writeFileSync('js/app.js', code);
console.log("Patched!");
