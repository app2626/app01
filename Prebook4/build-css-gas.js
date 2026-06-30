const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, 'src', 'style.css');
const htmlPath = path.join(__dirname, 'src', 'CSS.html');

try {
  const cssContent = fs.readFileSync(cssPath, 'utf8');
  const wrappedCss = `<style>\n${cssContent}\n</style>`;
  fs.writeFileSync(htmlPath, wrappedCss);
  console.log('Successfully updated src/CSS.html with compiled Tailwind CSS.');
} catch (error) {
  console.error('Error during CSS build for GAS:', error);
}
