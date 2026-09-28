const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const vm = require('node:vm');
const properties = { TELEGRAM_BOT_TOKEN: 'test-token', ADMIN_TELEGRAM_USER_ID: '101', MASTER_TELEGRAM_USER_ID: '202' };
const cache = new Map();
const signedBytes = buffer => Array.from(buffer, byte => byte > 127 ? byte - 256 : byte);
const context = vm.createContext({
  console,
  PropertiesService: { getScriptProperties: () => ({ getProperty: key => properties[key] }) },
  CacheService: { getScriptCache: () => ({get:key=>cache.get(key),put:(key,value)=>cache.set(key,value),remove:key=>cache.delete(key)}) },
  LockService: { getScriptLock: () => ({waitLock(){},releaseLock(){}}) },
  Utilities: {
    DigestAlgorithm:{SHA_256:'sha256'}, Charset:{UTF_8:'utf8'}, getUuid:()=>crypto.randomUUID(),
    computeDigest:(algorithm,text)=>signedBytes(crypto.createHash('sha256').update(text).digest()),
    newBlob:text=>({getBytes:()=>signedBytes(Buffer.from(text))}),
    computeHmacSha256Signature:(bytes,key)=>signedBytes(crypto.createHmac('sha256',Buffer.from(key)).update(Buffer.from(bytes)).digest())
  }
});
vm.runInContext(fs.readFileSync('Code.gs','utf8'),context);
context.jsonResponse=value=>value;
function auth(id=101,age=0){
 const data={id,first_name:'Тест',auth_date:Math.floor(Date.now()/1000)-age};
 const str=Object.keys(data).sort().map(key=>`${key}=${data[key]}`).join('\n');
 data.hash=crypto.createHmac('sha256',crypto.createHash('sha256').update(properties.TELEGRAM_BOT_TOKEN).digest()).update(str).digest('hex');
 return data;
}
const post=data=>context.doPost({postData:{contents:JSON.stringify(data)}});
assert.equal(context.loginTelegramAdmin(auth(999)).success,false);
assert.equal(context.loginTelegramAdmin(auth(101,301)).success,false);
assert.equal(context.loginTelegramAdmin(auth(101,-60)).success,false);
assert.equal(context.loginTelegramAdmin({...auth(),first_name:'Tampered'}).success,false);
assert.equal(context.loginTelegramAdmin({...auth(),id:202}).success,false);
assert.equal(context.loginTelegramAdmin({...auth(),hash:'0'.repeat(64)}).success,false);
assert.equal(context.loginTelegramAdmin({...auth(),extra:'injected'}).success,false);
const original=auth();
const result=post({action:'telegramAdminLogin',telegramAuth:original});
assert.equal(result.success,true);
assert.equal(context.checkTelegramAdminAccess(result.sessionToken),true);
assert.equal(context.checkTelegramAdminAccess(result.sessionToken.slice(0,-1)+'z'),false);
assert.equal(context.loginTelegramAdmin(original).success,false);
const master=context.loginTelegramAdmin(auth(202));
assert.equal(master.success,true);
assert.equal(context.checkTelegramAdminAccess(master.sessionToken),true);
delete properties.MASTER_TELEGRAM_USER_ID;
assert.equal(context.checkTelegramAdminAccess(master.sessionToken),false);
const record=JSON.parse(cache.get(context.telegramSessionKey(result.sessionToken)));
cache.set(context.telegramSessionKey(result.sessionToken),JSON.stringify({...record,expiresAt:Date.now()-1}));
assert.equal(context.checkTelegramAdminAccess(result.sessionToken),false);
cache.set(context.telegramSessionKey(result.sessionToken),JSON.stringify(record));
assert.equal(post({action:'checkAdminAccess',sessionToken:result.sessionToken}).success,true);
for(const action of ['getAdminBookings','addAdminBooking','updateAdminBooking','cancelAdminBooking','deleteAdminBooking','setClosedDays','setScheduleSettings']) {
 let called=false;
 const handler=action==='getAdminBookings'?'getSheet':action;
 context[handler]=()=>{called=true;return {success:true};};
 assert.equal(post({action,idToken:'old-google-token'}).success,false);
 assert.equal(called,false,action+' must not run without Telegram session');
}
post({action:'logoutAdmin',sessionToken:result.sessionToken});
assert.equal(context.checkTelegramAdminAccess(result.sessionToken),false);
console.log('Telegram admin auth passed: real HMAC, tampering, expiry, allowlist, replay, session revocation, all protected routes.');
