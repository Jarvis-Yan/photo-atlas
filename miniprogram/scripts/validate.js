#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
const errors = [];
const forbidden = /<\/?(?:html|head|body|main|header|footer|section|article|div|span|p|h[1-6]|small)(?:\s|>)/i;

function exists(relative) {
  if (!fs.existsSync(path.join(root, relative))) errors.push('Missing ' + relative);
}

for (const page of app.pages) {
  for (const ext of ['js', 'json', 'wxml', 'wxss']) exists(page + '.' + ext);
  const jsonPath = path.join(root, page + '.json');
  if (fs.existsSync(jsonPath)) {
    const config = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    for (const component of Object.values(config.usingComponents || {})) {
      const prefix = String(component).replace(/^\//, '');
      for (const ext of ['js', 'json', 'wxml', 'wxss']) exists(prefix + '.' + ext);
    }
  }
  const wxmlPath = path.join(root, page + '.wxml');
  if (fs.existsSync(wxmlPath)) {
    const wxml = fs.readFileSync(wxmlPath, 'utf8');
    if (forbidden.test(wxml)) errors.push('Unsupported HTML element in ' + page + '.wxml');
  }
}

const appid = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json'), 'utf8')).appid;
if (appid !== 'touristappid' && !/^wx[0-9a-f]{16}$/.test(appid)) errors.push('Invalid mini-program AppID');
const project = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json'), 'utf8'));
if (appid === 'touristappid' && project.setting.urlCheck !== false) errors.push('Tourist development must keep urlCheck=false');
for (const required of ['tests','scripts','README.md']) {
  if (!(project.packOptions.ignore || []).some((item) => item.value === required)) errors.push('Package should ignore ' + required);
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(JSON.stringify({pages:app.pages.length, tabPages:app.tabBar.list.length, appid, status:'ok'}));
