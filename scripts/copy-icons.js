const fs = require('fs');
const path = require('path');

// Copy all SVG icons from nodes/** into the matching dist/** paths
function copyIcons(srcDir, distDir) {
  if (!fs.existsSync(srcDir)) return;
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const distPath = path.join(distDir, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(distPath, { recursive: true });
      copyIcons(srcPath, distPath);
    } else if (entry.name.endsWith('.svg') || entry.name.endsWith('.png')) {
      fs.copyFileSync(srcPath, distPath);
      console.log(`Copied icon: ${srcPath} → ${distPath}`);
    }
  }
}

copyIcons(
  path.join(__dirname, '..', 'nodes'),
  path.join(__dirname, '..', 'dist', 'nodes'),
);
