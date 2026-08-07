const { spawn, execSync } = require('child_process');
const http = require('http');

console.log('======================================================');
console.log('    MEMULAI NGROK HTTPS TUNNEL UNTUK NOTA-PHOTO PWA   ');
console.log('======================================================');
console.log('[1/2] Menjalankan Ngrok Tunnel pada Port 3001...');

const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const domainArg = process.env.NGROK_DOMAIN ? ['--url', process.env.NGROK_DOMAIN] : [];
const ngrokProcess = spawn(cmd, ['--yes', 'ngrok', 'http', '3001', ...domainArg], {
  shell: true,
  stdio: 'ignore'
});

setTimeout(() => {
  console.log('[2/2] Memanggil status HTTPS URL dari Ngrok API...');
  
  const req = http.get('http://127.0.0.1:4040/api/tunnels', (res) => {
    let rawData = '';
    res.on('data', (chunk) => { rawData += chunk; });
    res.on('end', () => {
      try {
        const parsed = JSON.parse(rawData);
        const httpsTunnel = parsed.tunnels.find((t) => t.public_url.startsWith('https://'));
        
        if (httpsTunnel) {
          console.log('\n======================================================');
          console.log(' 🎉 BERHASIL! URL HTTPS PWA STANDALONE ANDA:');
          console.log('======================================================');
          console.log(` 🌐 HTTPS URL:  ${httpsTunnel.public_url}`);
          console.log('------------------------------------------------------');
          console.log(' 💡 CARA MENGINSTAL PWA STANDALONE DI TABLET REDMI:');
          console.log(` 1. Buka ${httpsTunnel.public_url} di Chrome Tablet.`);
          console.log(' 2. Tekan Titik 3 > "Instal aplikasi" / "Add to Home screen".');
          console.log(' 3. Aplikasi akan terinstal sebagai WebAPK FULLSCREEN murni');
          console.log('    TANPA CHROME & TANPA SEARCH BAR!');
          console.log('======================================================\n');
        } else {
          console.log('Ngrok berjalan. Buka http://127.0.0.1:4040 di browser untuk melihat URL.');
        }
      } catch (e) {
        console.log('Ngrok sedang inisialisasi. Periksa http://127.0.0.1:4040');
      }
    });
  });

  req.on('error', () => {
    console.log('Ngrok API belum siap. Pastikan server 3001 menyala.');
  });
}, 4000);
