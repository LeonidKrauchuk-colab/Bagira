const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const events = [];
let status = 'Ожидает подтверждения', failLock = false;
const context = vm.createContext({
  console: {log(){},error(){}},
  PropertiesService: {getScriptProperties:()=>({getProperty:key=>({
    TELEGRAM_WEBHOOK_SECRET:'secret', ADMIN_TELEGRAM_USER_ID:'1', MASTER_TELEGRAM_USER_ID:'2'
  })[key]})},
  LockService:{getScriptLock:()=>({waitLock(){if(failLock) throw Error('busy');},releaseLock(){}})},
  SpreadsheetApp:{flush(){events.push('flush');}}
});
vm.runInContext(fs.readFileSync('Code.gs','utf8'),context);
context.findBookingById = ()=>({id:'booking',status,rowNumber:2});
context.getSheet = ()=>({getRange:()=>({setValue:value=>{status=value;events.push('save');}})});
context.answerTelegramCallback = (id,text)=>events.push('answer:' + text);
context.editTelegramBookingMessages = ()=>events.push('edit');
context.sendClientBookingStatus = ()=>events.push('client');
const callback = {id:'callback',data:'booking_confirm:booking',from:{id:1},message:{chat:{id:1},message_id:10}};
const event = {parameter:{telegramSecret:'secret'}};
assert.equal(context.handleTelegramBookingCallback(callback,event).success,true);
assert.equal(status,'Активна');
assert.deepEqual(events,['save','flush','answer:Заказ подтвержден','edit','client']);
events.length=0;
assert.equal(context.handleTelegramBookingCallback(callback,event).applied,false);
assert.equal(events.includes('save'),false);
assert.equal(events.includes('client'),false);
assert.equal(context.handleTelegramBookingCallback(callback,{parameter:{}}).success,false);
assert.equal(context.handleTelegramBookingCallback({...callback,from:{id:3}},event).success,false);
failLock=true;
events.length=0;
assert.equal(context.handleTelegramBookingCallback(callback,event).success,false);
assert.match(events[0],/^answer:Не удалось обработать запись/);
console.log('Telegram callback checks passed: confirmation, response order, repeat clicks, authorization, lock failure.');
