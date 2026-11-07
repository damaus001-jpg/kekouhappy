const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {parseTxt,exportTxt}=require('./data.cjs');
const {allowWhatsAppStorage}=require('./permissions.cjs');

test('WhatsApp durable storage is allowed without granting unrelated permissions',()=>{
 assert.equal(allowWhatsAppStorage('persistent-storage','https://web.whatsapp.com/'),true);
 assert.equal(allowWhatsAppStorage('persistent-storage','https://web.whatsapp.com/login/'),true);
 for(const origin of ['https://web.whatsapp.com.attacker.test/','http://web.whatsapp.com/','https://example.com/','invalid'])assert.equal(allowWhatsAppStorage('persistent-storage',origin),false);
 for(const permission of ['unknown','media','geolocation','fileSystem','notifications'])assert.equal(allowWhatsAppStorage(permission,'https://web.whatsapp.com/'),false);
});

test('TXT accepts BOM, international formats and CRLF, deduplicating normalized numbers',()=>{
 const result=parseTxt(Buffer.from('\uFEFF+1 (202) 555-0101\r\n0012025550101\r\n12025550102\r\n\r\ninvalid\r\n123\r\n'));
 assert.deepEqual(result.numbers,['12025550101','12025550102']);assert.equal(result.totalLines,5);assert.equal(result.duplicateLines,1);assert.equal(result.invalidCount,2);
});
test('UTF-16 files decode and malformed multi-number rows are rejected',()=>{
 const input=Buffer.concat([Buffer.from([255,254]),Buffer.from('+12025550101\n12025550102,12025550103\n','utf16le')]);
 const result=parseTxt(input);assert.equal(result.uniqueNumbers,1);assert.equal(result.invalidCount,1);
});
test('TXT exports separate classifications and an honest incomplete summary',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wnf-data-test-'));
 try{
 const report={entries:[{number:'12025550101',status:'registered'},{number:'12025550102',status:'not-registered'},{number:'12025550103',status:'unknown'}],uniqueNumbers:3,totalEntries:3,counts:{registered:1,'not-registered':1,unknown:1},registeredPercentage:100/3,complete:false};
 const output=exportTxt(report,dir,{fileName:'input.txt',totalLines:4,duplicateLines:1,invalidCount:0},new Date('2026-01-02T03:04:05Z'));
 assert.equal(output.files.length,4);assert.ok(output.files.every(f=>f.endsWith('.txt')));assert.equal(fs.readFileSync(output.files[0],'utf8'),'\uFEFF+12025550101\r\n');assert.equal(fs.readFileSync(output.files[2],'utf8'),'\uFEFF+12025550103\r\n');assert.match(fs.readFileSync(output.files[3],'utf8'),/33.33%/);assert.match(fs.readFileSync(output.files[3],'utf8'),/尚不完整/);
 }finally{if(!path.resolve(dir).startsWith(path.resolve(os.tmpdir(),'wnf-data-test-')))throw new Error('Unexpected cleanup path');fs.rmSync(dir,{recursive:true,force:true});}
});
