const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
let cells = [], exists = false, locked = false, serial = 0, writes = 0;
const sheet = {
  getLastRow: () => cells.length,
  getMaxRows: () => 1000,
  getRange: () => ({ getValues: () => cells.map(row => [...row]), setValues: rows => { assert.ok(locked); cells = rows.map(row => [...row]); writes++; } })
};
const book = { getSheetByName: name => { assert.equal(name, 'Галерея сайта'); return exists ? sheet : null; }, insertSheet: () => { exists = true; return sheet; } };
const c = vm.createContext({ console,
  SpreadsheetApp: { getActiveSpreadsheet: () => book, flush: () => assert.ok(locked) },
  LockService: { getScriptLock: () => ({ waitLock: () => { assert.equal(locked, false); locked = true; }, releaseLock: () => { locked = false; } }) },
  Utilities: { getUuid: () => 'id-' + (++serial), base64Decode: s => [...Buffer.from(s, 'base64')] }
});
vm.runInContext(fs.readFileSync('Code.gs', 'utf8'), c);
c.jsonResponse = v => v;
c.checkTelegramAdminAccess = token => token === 'allowed';
const post = data => c.doPost({postData:{contents:JSON.stringify({action:'adminGallery',sessionToken:'allowed',...data})}});
const gallery = () => c.doGet({parameter:{gallery:'1'}}).gallery;
const change = (operation, extra = {}) => post({operation, revision: gallery().revision, ...extra});
assert.equal(gallery().items.length, 7);
assert.equal(exists, false, 'Public read does not create a sheet');
assert.equal(post({sessionToken:'bad',operation:'list'}).code, 'AUTH_REQUIRED');
assert.equal(post({sessionToken:'bad',operation:'remove',id:'original-0'}).code, 'AUTH_REQUIRED');
assert.equal(writes, 0);
assert.equal(change('add',{src:'https://evil.example/a.svg',caption:''}).success,false);
assert.equal(change('add',{src:'data:image/jpeg;base64,YWJjZA==',caption:''}).success,false);
const jpeg = 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([255,216]),Buffer.alloc(70000,42),Buffer.from([255,217])]).toString('base64');
assert.equal(change('add',{src:jpeg,caption:'Маникюр 💅'}).success,true);
assert.equal(gallery().items.length,8);
const added=gallery().items[7];
assert.equal(added.src,jpeg,'Chunked storage preserves full photo');
assert.equal(added.caption,'Маникюр 💅');
assert.ok(cells.filter(row=>row[0]).every(row=>row[0].startsWith('"')),'Chunks cannot be interpreted as sheet formulas');
const old=gallery().revision;
assert.equal(change('move',{id:added.id,direction:-1}).success,true);
assert.equal(gallery().items[6].id,added.id);
assert.equal(post({operation:'remove',revision:old,id:added.id}).code,'CONFLICT');
assert.equal(change('caption',{id:added.id,caption:'=IMPORTXML("url") <script>alert(1)</script>'}).success,true);
assert.equal(gallery().items[6].caption,'=IMPORTXML("url") <script>alert(1)</script>');
assert.equal(change('caption',{id:added.id,caption:'x'.repeat(161)}).success,false);
assert.equal(change('move',{id:added.id,direction:4}).success,false);
assert.equal(change('remove',{id:added.id}).success,true);
assert.equal(gallery().items.length,7);
assert.ok(!cells.map(row=>row[0]).join('').includes(jpeg.slice(0,100)), 'Deleted image chunks cleared');
for (const item of gallery().items) assert.equal(change('remove',{id:item.id}).success,true);
assert.equal(gallery().items.length,0,'Empty gallery stays empty instead of restoring defaults');
const tiny='data:image/jpeg;base64,/9j/2Q==';
for(let i=0;i<20;i++) assert.equal(change('add',{src:tiny,caption:''}).success,true);
assert.equal(change('add',{src:tiny,caption:''}).success,false);
assert.equal(gallery().items.length,20);
assert.equal(locked,false);
console.log('Gallery passed: public reads, auth, upload validation, chunk round-trip, safe cells, revisions, captions, reorder, deletion, empty state, limits and locks.');
