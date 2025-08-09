#!/usr/bin/env node
/**
 * Simple lines-of-code counter for the repository.
 * Excludes node_modules, dist, and counts only selected extensions.
 */
const fs = require('fs');
const path = require('path');

const exts = new Set(['.ts', '.js', '.sh', '.ps1', '.mjs', '.cjs', '.json', '.yml', '.yaml', '.html', '.cfg']);
const root = process.cwd();

function walk(dir, fileList = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const d of entries) {
    if (d.name === 'node_modules' || d.name === 'dist' || d.name.startsWith('.git')) continue;
    const full = path.join(dir, d.name);
    if (d.isDirectory()) walk(full, fileList);
    else fileList.push(full);
  }
  return fileList;
}

function countLines(file) {
  try {
    const data = fs.readFileSync(file, 'utf8');
    if (!data) return 0;
    return data.split(/\r?\n/).length;
  } catch {
    return 0;
  }
}

const files = walk(root).filter(f => exts.has(path.extname(f)));
const records = [];
let total = 0;
for (const f of files) {
  const lines = countLines(f);
  total += lines;
  records.push({ file: path.relative(root, f), ext: path.extname(f), lines });
}

function aggregate(key) {
  const map = new Map();
  for (const r of records) {
    const k = key(r);
    map.set(k, (map.get(k) || 0) + r.lines);
  }
  return [...map.entries()].sort((a,b)=>b[1]-a[1]);
}

const byExt = aggregate(r => r.ext || '');
const byTopDir = aggregate(r => r.file.split(/[\\/]/)[0]);
const tsByTopDir = records.filter(r => r.ext === '.ts').reduce((acc,r)=>{ const k=r.file.split(/[\\/]/)[0]; acc[k]=(acc[k]||0)+r.lines; return acc;}, {});
const tsByTopDirArr = Object.entries(tsByTopDir).sort((a,b)=>b[1]-a[1]);

const output = { totalLines: total, fileCount: records.length, byExtension: byExt.map(([ext,lines])=>({ext, lines})), byTopLevelDirectory: byTopDir.map(([dir,lines])=>({dir, lines})), typeScriptByTopLevelDirectory: tsByTopDirArr.map(([dir, lines])=>({dir, lines})) };

console.log(JSON.stringify(output, null, 2));
