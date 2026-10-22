// Code-native roll/cutting icon; no third-party image or font dependencies.
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { resolve } from 'node:path';
const directory = resolve(import.meta.dirname, '../public/icons');
mkdirSync(directory, { recursive: true });
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let i=0;i<8;i++) crc=(crc>>>1)^((crc&1)?0xedb88320:0); }
  return (crc^0xffffffff)>>>0;
}
function chunk(type, bytes) {
  const name=Buffer.from(type), length=Buffer.alloc(4), crc=Buffer.alloc(4);
  length.writeUInt32BE(bytes.length); crc.writeUInt32BE(crc32(Buffer.concat([name,bytes])));
  return Buffer.concat([length,name,bytes,crc]);
}
for (const [name,size] of [['pwa-192',192],['pwa-512',512],['pwa-maskable-512',512],['apple-touch-icon',180]]) {
  const pixels=Buffer.alloc((size*4+1)*size);
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
    const u=x/size,v=y/size;
    let color=[37,99,235,255];
    // A roll, unfolded film sheet, vertical cut and two horizontal cuts.
    if(u>=.27&&u<=.73&&v>=.28&&v<=.75) color=[239,246,255,255];
    if(((u-.5)/.23)**2+((v-.29)/.09)**2<=1) color=[186,230,253,255];
    if(((u-.5)/.14)**2+((v-.29)/.035)**2<=1) color=[37,99,235,255];
    if(u>.49&&u<.51&&v>.4&&v<.71) color=[37,99,235,255];
    if(u>.29&&u<.71&&((v>.49&&v<.51)||(v>.64&&v<.66))) color=[37,99,235,255];
    if(u>.65&&u<.75&&v>.69&&v<.77) color=[20,184,166,255];
    const at=y*(size*4+1)+1+x*4; for(let c=0;c<4;c++) pixels[at+c]=color[c];
  }
  const header=Buffer.alloc(13);header.writeUInt32BE(size,0);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;
  writeFileSync(resolve(directory,name+'.png'),Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]));
}
console.log('Generated 192/512px PWA and 180px Apple icons.');
