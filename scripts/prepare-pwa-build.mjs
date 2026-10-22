import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
const directory=resolve(import.meta.dirname,'../dist');
const collect=folder=>readdirSync(folder,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?collect(resolve(folder,entry.name)):[resolve(folder,entry.name)]);
const files=collect(directory).filter(file=>file.endsWith('.html')||file.endsWith('.js')||file.endsWith('.webmanifest')||file.includes(`${sep}icons${sep}`)).sort();
const hash=createHash('sha256');
for(const file of files){hash.update(relative(directory,file));hash.update(readFileSync(file));}
const version=hash.digest('hex').slice(0,16);
const workerPath=resolve(directory,'sw.js');
const worker=readFileSync(workerPath,'utf8');
if(!worker.includes("const PWA_VERSION = 'v1';"))throw new Error('Unexpected PWA version marker; export fresh output first.');
writeFileSync(workerPath,worker.replace("const PWA_VERSION = 'v1';",`const PWA_VERSION = '${version}';`));
console.log(`PWA release fingerprint: ${version}`);
