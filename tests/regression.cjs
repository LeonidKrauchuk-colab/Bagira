const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('Code.gs', 'utf8');
for (const file of ['Code.gs', 'script.js', 'service-worker.js', 'admin/service-worker.js']) {
  new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file });
}
for (const match of fs.readFileSync('admin/admin.html', 'utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
  new vm.Script(match[1]);
}
let locked = false, flushed = 0;
const context = vm.createContext({
  console,
  SpreadsheetApp: { flush() { flushed++; } },
  LockService: { getScriptLock() { return {
    waitLock() { assert.equal(locked, false); locked = true; },
    releaseLock() { assert.equal(locked, true); locked = false; }
  }; } }
});
vm.runInContext(source, context);
vm.runInContext(`
jsonResponse = value => value;
getScheduleSettings = () => ({weeklySchedule: Array.from({length:7}, (_,day) => ({day, slots:['10:00']}))});
checkTelegramWebhookAccess = event => event.parameter?.telegramSecret === 'valid';
getClientBotState = () => ({});
clearClientBotState = () => {};
clientBotMenu = () => {};
`, context);
function message(secret) {
  return context.doPost({parameter: {telegramSecret:secret}, postData: {contents:JSON.stringify({message:{text:'/start',from:{id:1},chat:{id:1,type:'private'}}})}});
}
assert.equal(message('valid').success, true);
assert.equal(message('invalid').success, false);
assert.equal(context.isBookingTimeAllowed('10:00', '2026-09-28'), true);
for (const time of ['10:00:59', '10:00junk', ' 10:00', '24:00']) {
  assert.equal(context.isBookingTimeAllowed(time, '2026-09-28'), false);
}
assert.equal(context.isBookingTimeAllowed('10:00', '2026-02-30'), false);
assert.equal(context.isValidBookingDate('2028-02-29'), true);
for (const [name,arg] of [['updateAdminBookingInternal',{}],['cancelAdminBooking','id'],['deleteAdminBooking','id'],['setScheduleSettings',{}]]) {
  context[name + 'Locked'] = () => { assert.equal(locked, true); return {success:true}; };
  assert.equal(context[name](arg).success, true);
  assert.equal(locked, false);
  context[name + 'Locked'] = () => { throw new Error('write failure'); };
  assert.throws(() => context[name](arg), /write failure/);
  assert.equal(locked, false);
}
assert.equal(flushed, 8);
// A failed or missing administrator recipient must not block the master.
const properties = {ADMIN_TELEGRAM_USER_ID:'admin', MASTER_TELEGRAM_USER_ID:'master'};
const notificationContext = vm.createContext({
  console,
  PropertiesService:{getScriptProperties:()=>({getProperty:key=>properties[key]})}
});
vm.runInContext(source, notificationContext);
let deliveries = [];
notificationContext.telegramApiCall = (method, payload) => {
  deliveries.push(payload.chat_id);
  if (payload.chat_id === 'admin') throw new Error('chat unavailable');
  return {message_id:1};
};
const notificationBooking = {id:'test',name:'Client',phone:'123',service:'Service',date:'2026-09-28',time:'10:00'};
assert.throws(()=>notificationContext.sendNewBookingTelegram(notificationBooking), /chat unavailable/);
assert.deepEqual(deliveries,['admin','master']);
delete properties.ADMIN_TELEGRAM_USER_ID;
deliveries = [];
notificationContext.sendNewBookingTelegram(notificationBooking);
assert.deepEqual(deliveries,['master']);

// Execute the actual submission code with mocked responses; only confirmed IDs pass.
const frontend = fs.readFileSync('script.js','utf8');
const begin = frontend.indexOf('        const response = await fetch(SCRIPT_URL,');
const end = frontend.indexOf('// ПОКАЗ УСПЕШНОГО СООБЩЕНИЯ', begin);
const submission = frontend.slice(begin, end);
async function submit(result) {
  return vm.runInNewContext('(async () => {' + submission + 'return true;})()', {
    fetch: async () => ({ok:true,json:async()=>result}), SCRIPT_URL:'mock', booking:{}
  });
}
(async () => {
  await assert.rejects(submit({success:false,error:'Это время уже занято'}), /Это время уже занято/);
  await assert.rejects(submit({success:true}), /не подтвердил/);
  assert.equal(await submit({success:true,id:'booking-id'}), true);
  for (const [file, current, obsolete] of [
    ['service-worker.js','bagira-static-v9','bagira-static-v8'],
    ['admin/service-worker.js','bagira-admin-v8','bagira-admin-v7']
  ]) {
    const events = {}, deleted = [];
    const other = current.startsWith('bagira-admin') ? 'bagira-static-v9' : 'bagira-admin-v8';
    vm.runInNewContext(fs.readFileSync(file,'utf8'), {
      self: {addEventListener:(name,fn)=>events[name]=fn, clients:{claim:async()=>{},matchAll:async()=>[]}},
      caches: {keys:async()=>[current,obsolete,other,'unrelated'],delete:async name=>deleted.push(name)}
    });
    let completion;
    events.activate({waitUntil(promise){completion=promise;}});
    await completion;
    assert.deepEqual(deleted,[obsolete]);
  }
  console.log('Regression checks passed: syntax, Telegram auth/start, date/time, locks, booking confirmation, cache isolation.');
})().catch(error => {console.error(error);process.exitCode=1;});
