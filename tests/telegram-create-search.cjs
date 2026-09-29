const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const cache=new Map(), properties={ADMIN_TELEGRAM_USER_ID:'1',MASTER_TELEGRAM_USER_ID:'2',TELEGRAM_WEBHOOK_SECRET:'secret'};
const messages=[],alerts=[],allButtons=[];
let bookings=[],locked=false,messageId=0;
const ctx=vm.createContext({console,
 PropertiesService:{getScriptProperties:()=>({getProperty:key=>properties[key],setProperty:(key,value)=>properties[key]=value,deleteProperty:key=>delete properties[key]})},
 CacheService:{getScriptCache:()=>({get:key=>cache.get(key),put:(key,value)=>cache.set(key,value),remove:key=>cache.delete(key)})},
 LockService:{getScriptLock:()=>({waitLock(){assert.equal(locked,false);locked=true;},releaseLock(){locked=false;}})},
 SpreadsheetApp:{flush(){assert.equal(locked,true);}},Utilities:{getUuid:()=>crypto.randomUUID()}
});
vm.runInContext(fs.readFileSync('Code.gs','utf8'),ctx);
ctx.getBookings=()=>bookings.map(b=>({...b}));
ctx.findBookingById=id=>bookings.find(b=>b.id===id)||null;
ctx.getSheet=()=>({getLastRow:()=>bookings.length+1,getRange:()=>({setNumberFormat(){return this;},setValues(values){
 assert.equal(locked,true);const row=values[0];bookings.push({id:row[0],name:row[1],phone:row[2],service:row[4],date:row[5],time:row[6],comment:row[7],status:row[8]});
}})});
ctx.getDateAfterDays=days=>ctx.staffDateShift('2026-09-28',days);
ctx.isBookingDateAllowed=date=>ctx.isValidBookingDate(date)&&date>='2026-09-28'&&date<='2026-10-18';
ctx.isClosedDay=date=>date==='2026-09-30';
ctx.getScheduleTimes=()=>['10:00','12:00'];
ctx.isPastBookingTime=(date,time)=>date==='2026-09-28'&&time==='10:00';
ctx.sendStaffTelegramMessage=(chat,text,markup)=>{ messages.push({chat,text,markup}); allButtons.push(...(markup?.inline_keyboard?.flat().map(b=>b.callback_data)||[])); };
ctx.answerTelegramCallback=(id,text)=>alerts.push(text);
ctx.telegramApiCall=()=>({});
ctx.clearClientBotState=()=>{};ctx.refreshTelegramChatCommands=()=>{};
const event={parameter:{telegramSecret:'secret'}};
function send(text,id=1,number=++messageId){return ctx.handleStaffTelegramMessage({text,message_id:number,from:{id},chat:{id,type:'private'}},event);}
function press(data,id=1){return ctx.handleStaffTelegramCallback({id:'cb',from:{id},message:{chat:{id,type:'private'},message_id:1},data},event);}
function buttons(){return messages.flatMap(m=>m.markup?.inline_keyboard?.flat().map(b=>b.callback_data)||[]);}
function reset(){Object.keys(properties).filter(key=>key.startsWith("STAFF_DRAFT_")).forEach(key=>delete properties[key]);cache.clear();bookings=[];messages.length=alerts.length=0;}
function draft(){
 send('➕ Добавить запись');const dialog=ctx.staffDialog('1');assert.ok(dialog);
 press('admin_ns:'+dialog.token+':0');
 assert.ok(buttons().includes('admin_nd:'+dialog.token+':2026-09-29'));
 press('admin_nd:'+dialog.token+':2026-09-29');
 press('admin_nt:'+dialog.token+':2026-09-29:1000');
 return dialog.token;
}
function fill(){const token=draft();send('Анна');send('+375 (29) 123-45-67');return {token,confirmation:buttons().filter(x=>x.startsWith('admin_nok:')).at(-1)};}
reset();assert.equal(send('➕ Добавить запись',3).success,false);assert.equal(cache.size,0);
let token=draft();
assert.equal(press('admin_nstop:'+token,2).success,false);
assert.equal(press('admin_nok:'+token+':3').success,false,'cannot save incomplete draft');
assert.equal(press('admin_nd:'+token+':2026-10-01').success,false,'old date button after name step');
send('А');assert.equal(ctx.staffDialog('1').state.step,'name');
send('=IMPORTXML()');assert.equal(ctx.staffDialog('1').state.step,'name');
const id=++messageId;send('Анна',1,id);send('Анна',1,id);
assert.equal(ctx.staffDialog('1').state.step,'phone','duplicate name must not become a phone');
send('123');assert.equal(ctx.staffDialog('1').state.step,'phone');
send('+375 (29) 123-45-67');assert.equal(bookings.length,0);
const confirmation=buttons().filter(x=>x.startsWith('admin_nok:')).at(-1);
assert.equal(press(confirmation).success,true);
assert.equal(bookings.length,1);assert.equal(bookings[0].status,'Активна');assert.equal(bookings[0].phone,'+375291234567');
assert.equal(press(confirmation).success,true);assert.equal(bookings.length,1);assert.match(alerts.at(-1),/уже создана/);assert.equal(ctx.staffDialog('1'),null);
// Evict the entire cache at every step, including before final confirmation.
reset();send('➕ Добавить запись');token=ctx.staffDialog('1').token;cache.clear();
assert.equal(press('admin_ns:'+token+':0').success,true);cache.clear();
assert.equal(press('admin_nd:'+token+':2026-09-29').success,true);cache.clear();
assert.equal(press('admin_nt:'+token+':2026-09-29:1000').success,true);cache.clear();
send('Анна');cache.clear();send('+375291234567');cache.clear();
const durableConfirmation=buttons().filter(x=>x.startsWith('admin_nok:')).at(-1);
assert.equal(press(durableConfirmation).success,true);assert.equal(bookings.length,1);
cache.clear();assert.equal(press(durableConfirmation).success,true);assert.equal(bookings.length,1);
// Recover after the row was saved but saving the completion receipt failed.
reset();let interrupted=fill();const oldSave=ctx.saveStaffAction;
ctx.saveStaffAction=(token,state)=>{if(state.step==='saved')throw Error('property write failed');return oldSave(token,state);};
assert.equal(press(interrupted.confirmation).success,true);assert.equal(bookings.length,1);
ctx.saveStaffAction=oldSave;cache.clear();
assert.equal(press(interrupted.confirmation).success,true);assert.equal(bookings.length,1);
// Notification failures after commit are never reported as failed creation.
for (const failure of ['card','edit','all']) {
 reset();const filled=fill();const originalCard=ctx.sendStaffBookingCard, originalApi=ctx.telegramApiCall, originalMessage=ctx.sendStaffTelegramMessage;
 ctx.telegramApiCall=()=>{throw Error('Telegram edit unavailable');};
 if(failure==='card'||failure==='all')ctx.sendStaffBookingCard=()=>{throw Error('Telegram card unavailable');};
 if(failure==='all')ctx.sendStaffTelegramMessage=()=>{throw Error('Telegram send unavailable');};
 assert.equal(press(filled.confirmation).success,true);assert.equal(bookings.length,1);
 assert.ok(alerts.some(text=>text.includes('Запись создана')));
 assert.ok(!alerts.some(text=>text.includes('Не удалось выполнить действие')));
 assert.equal(press(filled.confirmation).success,true);assert.equal(bookings.length,1);
 ctx.sendStaffBookingCard=originalCard;ctx.telegramApiCall=originalApi;ctx.sendStaffTelegramMessage=originalMessage;
}
// An actual failure before writing must still fail and leave the table unchanged.
reset();let failed=fill();const originalInsert=ctx.addAdminBookingLocked;
ctx.addAdminBookingLocked=()=>{throw Error('write unavailable');};
assert.equal(press(failed.confirmation).success,false);assert.equal(bookings.length,0);
ctx.addAdminBookingLocked=originalInsert;
// Recover a confirmed row if the insert helper throws only after writing it.
reset();const afterWrite=fill();const insert=ctx.addAdminBookingLocked;
ctx.addAdminBookingLocked=(data,id)=>{insert(data,id);throw Error('formatting failed after write');};
assert.equal(press(afterWrite.confirmation).success,true);assert.equal(bookings.length,1);
ctx.addAdminBookingLocked=insert;
assert.equal(press(afterWrite.confirmation).success,true);assert.equal(bookings.length,1);
// Busy slot at final confirmation: preserve client details and allow a different time.
reset();let filled=fill();bookings.push({id:'other',name:'Other',date:'2026-09-29',time:'10:00',status:'Активна'});
assert.equal(press(filled.confirmation).success,false);assert.equal(bookings.length,1);
press('admin_nagain:'+filled.token+':'+ctx.staffDialog('1').state.version);
press('admin_nd:'+filled.token+':2026-10-01');
assert.equal(press('admin_nt:'+filled.token+':2026-09-29:1200').success,false,'time button must match its date');
press('admin_nt:'+filled.token+':2026-10-01:1200');
assert.equal(ctx.staffDialog('1').state.step,'confirm');assert.equal(ctx.staffDialog('1').state.name,'Анна');
assert.equal(press(filled.confirmation).success,false,'stale confirmation cannot save new choice');
assert.equal(press(buttons().filter(x=>x.startsWith('admin_nok:')).at(-1)).success,true);assert.equal(bookings.length,2);
// Navigation/cancellation and expiry invalidate the draft.
for(const command of ['Отмена','📅 Сегодня','🔎 Найти клиента']) {reset();filled=fill();send(command);assert.equal(press(filled.confirmation).success,false);assert.equal(bookings.length,0);}
reset();filled=fill();let state=ctx.staffActionState('1',filled.token);state.expiresAt=Date.now()-1;ctx.saveStaffAction(filled.token,state);assert.equal(press(filled.confirmation).success,false);
reset();token=draft();press('admin_nstop:'+token);assert.equal(ctx.staffDialog('1'),null);
// The master uses the same creation flow, independent from notification settings.
reset();send('➕ Добавить запись',2);token=ctx.staffDialog('2').token;
press('admin_ns:'+token+':1',2);press('admin_nd:'+token+':2026-09-29',2);press('admin_nt:'+token+':2026-09-29:1200',2);
send('Мария',2);send('+375331234567',2);
assert.equal(press(buttons().filter(x=>x.startsWith('admin_nok:')).at(-1),2).success,true);
assert.equal(bookings[0].service,'Педикюр');
// A closed date or elapsed slot discovered at confirmation must not create a row.
for(const check of ['isClosedDay','isPastBookingTime']) {
 reset();filled=fill();const original=ctx[check];ctx[check]=()=>true;
 assert.equal(press(filled.confirmation).success,false);assert.equal(bookings.length,0);ctx[check]=original;
}
// Search formatting, name variants, paging and access to result tokens.
reset();bookings=Array.from({length:7},(_,i)=>({id:'b'+i,name:'Алёна Иванова',phone:'+375 (29) 123-45-67',date:i===0?'2026-09-01':'2026-10-0'+i,time:'10:00',service:'Маникюр',status:i===6?'Отменена':'Активна'}));
send('🔎 Найти клиента');send('а');assert.match(messages.at(-1).text,/минимум/);
send('  АЛЕНА  ');assert.ok(messages.some(m=>m.text.includes('Найдено записей: 7')));
assert.ok(messages.find(m=>m.text.startsWith('📅 ')).text.includes('01.10.2026'));
const next=buttons().find(x=>x.startsWith('admin_search:'));assert.ok(next);
messages.length=0;press(next,2);assert.ok(messages.every(m=>!m.text.startsWith('📅 ')),'other staff cannot reuse private search token');
messages.length=0;press(next);assert.equal(messages.filter(m=>m.text.startsWith('📅 ')).length,2);
const cancelled=messages.find(m=>m.text.includes('Отменена'));assert.equal(cancelled.markup.inline_keyboard.length,0);
messages.length=0;send('8 (029) 123-45-67');assert.ok(messages.some(m=>m.text.includes('Найдено записей: 7')));
messages.length=0;send('4567');assert.ok(messages.some(m=>m.text.includes('Найдено записей: 7')));
messages.length=0;send('Никто');assert.ok(messages.some(m=>m.text.includes('Найдено записей: 0')));
for(const callback of allButtons)assert.ok(Buffer.byteLength(callback)<=64,callback);
assert.equal(locked,false);
console.log('Create/search passed: full wizard, validation, atomic save, conflicts, replay, cancellation, expiry, search and private pagination.');
