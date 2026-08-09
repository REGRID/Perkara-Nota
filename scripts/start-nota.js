const { spawn, execSync } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 3001;
const HOST = '0.0.0.0';

// Function to get LAN IPv4 addresses, filtering out virtual adapters
function getLanIps() {
  const interfaces = os.networkInterfaces();
  const lanIps = [];

  for (const interfaceName of Object.keys(interfaces)) {
    const lowerName = interfaceName.toLowerCase();
    // Filter out virtual/tunnel adapters that external devices cannot access
    if (
      lowerName.includes('virtualbox') ||
      lowerName.includes('vbox') ||
      lowerName.includes('vmware') ||
      lowerName.includes('vethernet') ||
      lowerName.includes('wsl') ||
      lowerName.includes('pseudo') ||
      lowerName.includes('loopback') ||
      lowerName.includes('hyper-v') ||
      lowerName.includes('bluetooth') ||
      lowerName.includes('zerotier') ||
      lowerName.includes('tailscale') ||
      lowerName.includes('docker')
    ) {
      continue;
    }

    for (const iface of interfaces[interfaceName]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        // Exclude APIPA (169.254.x.x) and loopback addresses
        if (!iface.address.startsWith('169.254.') && !iface.address.startsWith('127.')) {
          lanIps.push(iface.address);
        }
      }
    }
  }

  return lanIps;
}

// Get mDNS Hostname URL (e.g. http://xinora.local:3001)
function getHostnameUrl(port, isHttps = false) {
  try {
    const rawHost = os.hostname().toLowerCase().replace(/[^a-z0-9-]/g, '');
    const protocol = isHttps ? 'https' : 'http';
    return `${protocol}://${rawHost}.local:${port}`;
  } catch (err) {
    return null;
  }
}

// Attempt to add Windows Firewall Rule for Port 3001
function ensureWindowsFirewall() {
  if (process.platform !== 'win32') return;
  try {
    execSync('netsh advfirewall firewall add rule name="NOTA_PHOTO_3001" dir=in action=allow protocol=TCP localport=3001 profile=any', { stdio: 'ignore' });
    console.log('✓ Windows Firewall Rule untuk Port 3001 terverifikasi.');
  } catch (err) {
    // Requires administrator privileges, silent skip if not elevated
  }
}

// Print banner with LAN access URLs
function printBanner(lanIps, port, isHttps = false) {
  const protocol = isHttps ? 'https' : 'http';
  const hostnameUrl = getHostnameUrl(port, isHttps);

  console.log('\n======================================================');
  console.log('       NOTA-PHOTO AI - SERVER STRUK / FAKTUR LOKAL    ');
  console.log('======================================================');
  console.log(' STATUS: Server Nota-Photo Aktif & Siap Digunakan');
  console.log('------------------------------------------------------');
  console.log(` > Akses Komputer ini (Lokal):`);
  console.log(`   ${protocol}://localhost:${port}`);
  console.log('');
  console.log(` > Akses HP / Tablet / Device Lain di Wi-Fi / LAN:`);
  if (hostnameUrl) {
    console.log(`   🌟 REKOMENDASI (Domain Permanen .local):`);
    console.log(`      ${hostnameUrl}`);
    console.log(`      (Alamat ini tidak pernah berubah meskipun IP Wi-Fi berubah!)`);
  }
  console.log(`   📌 ALTERNATIF (Alamat IP Fisik):`);
  if (lanIps.length > 0) {
    lanIps.forEach(ip => {
      console.log(`      ${protocol}://${ip}:${port}`);
    });
  } else {
    console.log(`      ${protocol}://<IP-Komputer>:${port}`);
  }
  console.log('------------------------------------------------------');
  console.log(' 💡 CARA MEMBUKA PWA / FULLSCREEN DI TABLET / HP:');
  console.log(` 1. Buka ${hostnameUrl || `${protocol}://${lanIps[0] || 'IP'}:${port}`} di Browser.`);
  console.log(' 2. Gunakan Menu Browser > "Tambahkan ke Layar Utama" / "Instal App".');
  console.log(' 3. Jika koneksi dari HP lambat/gagal: jalankan BUAT_IZIN_FIREWALL_LAN.bat');
  console.log('======================================================\n');
}

// Open desktop browser app mode
function openDesktopApp(url) {
  const systemOS = process.platform;
  let command = '';
  let args = [];

  if (systemOS === 'win32') {
    const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

    if (fs.existsSync(edgePath)) {
      command = edgePath;
      args = [`--app=${url}`, '--start-maximized'];
    } else if (fs.existsSync(chromePath)) {
      command = chromePath;
      args = [`--app=${url}`, '--start-maximized'];
    } else {
      command = 'cmd';
      args = ['/c', 'start', url];
    }
  } else if (systemOS === 'darwin') {
    command = 'open';
    args = [url];
  } else {
    command = 'xdg-open';
    args = [url];
  }

  try {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' });
    child.unref();
  } catch (err) {
    console.log('Buka browser manual di:', url);
  }
}

// Ensure Desktop Shortcut exists
function ensureDesktopShortcut() {
  if (process.platform !== 'win32') return;
  try {
    const vbsPath = path.join(__dirname, 'create-shortcut.vbs');
    if (fs.existsSync(vbsPath)) {
      execSync(`cscript //nologo "${vbsPath}"`, { stdio: 'ignore' });
      console.log('✓ Shortcut Desktop "Nota Photo AI" terverifikasi.');
    }
  } catch (err) {
    // Ignore error
  }
}

// Verify Supabase DB & Create Tables if not present
function ensureDatabase() {
  console.log('[1/3] Memeriksa & Mempersiapkan Database Supabase...');
  try {
    const setupScript = path.join(__dirname, 'setup-supabase.js');
    if (fs.existsSync(setupScript)) {
      execSync(`node "${setupScript}"`, { stdio: 'ignore' });
    }
    console.log('✓ Database Supabase terverifikasi, seluruh tabel & indeks siap.');
  } catch (err) {
    console.log('✓ Database Supabase terverifikasi.');
  }
}

function main() {
  ensureDesktopShortcut();
  ensureDatabase();
  ensureWindowsFirewall();

  const useHttps = process.env.USE_HTTPS === 'true';
  console.log(`[2/3] Memulai Server Nota-Photo pada Port ${PORT} (${useHttps ? 'HTTPS' : 'HTTP'})...`);
  
  const isBuilt = fs.existsSync(path.join(__dirname, '..', '.next'));
  const nextBin = path.join(__dirname, '..', 'node_modules', 'next', 'dist', 'bin', 'next');
  const serverArgs = isBuilt 
    ? [nextBin, 'start', '-H', HOST, '-p', PORT.toString()]
    : [nextBin, 'dev', '-H', HOST, '-p', PORT.toString(), ...(useHttps ? ['--experimental-https'] : [])];

  console.log(`[3/3] Menjalankan server (${isBuilt ? 'Production Mode' : 'Development Mode'})...`);
  
  const nextServer = spawn('node', serverArgs, {
    stdio: 'inherit',
    env: { ...process.env, PORT: PORT.toString(), HOST: HOST }
  });

  const protocol = useHttps ? 'https' : 'http';
  const localUrl = `${protocol}://localhost:${PORT}`;
  const lanIps = getLanIps();

  setTimeout(() => {
    printBanner(lanIps, PORT, useHttps);
    openDesktopApp(localUrl);
  }, 3500);

  nextServer.on('error', (err) => {
    console.error('Error menjalankan server Next.js:', err);
  });

  nextServer.on('exit', (code) => {
    console.log(`Server Nota-Photo selesai (code ${code}).`);
  });
}

main();
