const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
let locked=false, writes=0;
const cache=new Map(), properties={ADMIN_TELEGRAM_USER_ID:'1',MASTER_TELEGRAM_USER_ID:'2',TELEGRAM_WEBHOOK_SECRET:'secret',BOOKING_CLIENT_CHAT_b:'99',BOOKING_REMINDER_b:'sent'};
let rows=[];
const messages=[],alerts=[],notifications=[];
const ctx=vm.createContext({console,
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>properties[k],deleteProperty:k=>delete properties[k]})},
 CacheService:{getScriptCache:()=>({get:k=>cache.get(k),put:(k,v)=>cache.set(k,v),remove:k=>cache.delete(k)})},
 Utilities:{getUuid:()=>crypto.randomUUID()},
 LockService:{getScriptLock:()=>({waitLock(){assert.equal(locked,false);locked=true;},releaseLock(){locked=false;}})},
 SpreadsheetApp:{flush(){assert.equal(locked,true);}}
});
vm.runInContext(fs.readFileSync('Code.gs','utf8'),ctx);
ctx.findBookingById=id=>{const b=rows.find(b=>b.id===id);return b?{...b,rowNumber:rows.indexOf(b)+2}:null;};
ctx.getSheet=()=>({getRange:(row,col)=>({setValues(values){assert.equal(locked,true);writes++;rows[row-2].date=values[0][0];rows[row-2].time=values[0][1];},setValue(value){assert.equal(locked,true);writes++;rows[row-2].status=value;}})});
ctx.getBookings=()=>rows.map(b=>({...b}));
ctx.getDateAfterDays=days=>ctx.staffDateShift('2026-09-28',days);
ctx.isBookingDateAllowed=date=>ctx.isValidBookingDate(date)&&date>='2026-09-28'&&date<='2026-10-18';
ctx.isClosedDay=date=>date==='2026-09-30';
ctx.getScheduleTimes=()=>['10:00','12:00'];
ctx.isPastBookingTime=(date,time)=>date==='2026-09-28'&&time==='10:00';
ctx.sendStaffTelegramMessage=(chat,text,markup)=>messages.push({chat,text,markup});
ctx.answerTelegramCallback=(id,text)=>alerts.push(text);
ctx.editTelegramBookingMessages=()=>{};
ctx.sendClientBotMessage=(chat,text)=>notifications.push({chat,text});
function reset(){rows=[{id:'b',name:'Client',phone:'123',service:'Service',date:'2026-09-28',time:'12:00',status:'Активна'}];cache.clear();messages.length=alerts.length=notifications.length=0;writes=0;}
function press(data,id=1){return ctx.handleStaffTelegramCallback({id:'cb',from:{id},message:{chat:{id,type:'private'},message_id:1},data},{parameter:{telegramSecret:'secret'}});}
function callbacks(){return messages.flatMap(m=>m.markup?.inline_keyboard?.flat().map(b=>b.callback_data)||[]);}
reset();
assert.equal(press('admin_move:b',3).success,false);
assert.equal(cache.size,0);
assert.equal(press('admin_date:2026-09-28:0').success,true);
assert.ok(callbacks().includes('admin_move:b'));
assert.ok(callbacks().includes('admin_cancel:b'));
ctx.sendStaffCalendar('1','2026-09');
assert.ok(callbacks().includes('admin_date:2026-09-01:0'));
assert.ok(callbacks().includes('admin_cal:2026-10'));
assert.equal(press('admin_date:2026-02-30:0').success,false);
assert.equal(press('admin_move:b').success,true);
const dateButton=callbacks().find(c=>c.startsWith('admin_md:')&&c.endsWith(':2026-09-29'));
assert.ok(dateButton);
assert.equal(press(dateButton,2).success,false,'action belongs only to initiating chat');
assert.equal(press(dateButton).success,true);
const timeButton=callbacks().find(c=>c.startsWith('admin_mt:')&&c.endsWith(':1000'));
assert.equal(press(timeButton).success,true);
const confirmation=callbacks().find(c=>c.startsWith('admin_mok:'));
assert.equal(writes,0,'selection must not mutate booking');
assert.equal(press(confirmation).success,true);
assert.equal(rows[0].date,'2026-09-29');assert.equal(rows[0].time,'10:00');assert.equal(rows[0].status,'Активна');
assert.equal(properties.BOOKING_REMINDER_b,undefined);
assert.equal(notifications.length,1);assert.match(notifications[0].text,/Было: 28.09.2026/);
assert.equal(press(confirmation).success,false);assert.equal(writes,1);
// Cancellation always needs explicit second click, even for legacy notification buttons.
reset();
assert.equal(press('admin_cancel:b').success,true);assert.equal(writes,0);
const cancel=callbacks().find(c=>c.startsWith('admin_cok:'));
assert.equal(press(cancel).success,true);assert.equal(rows[0].status,'Отменена');assert.equal(notifications.length,1);
assert.equal(press(cancel).success,false);assert.equal(notifications.length,1);
reset();
const action=ctx.startStaffAction('1','b','cancel');
assert.equal(press('admin_abort:'+action.token).success,true);
assert.equal(ctx.applyStaffAction('1',action.token,'cancel').success,false);assert.equal(writes,0);
// Slot may become busy or closed after selection; revalidate while holding the lock.
for (const reason of ['busy','closed','past','stale','expired']) {
 reset();const action=ctx.startStaffAction('1','b','move');
 const state=ctx.staffActionState('1',action.token);
 state.date=reason==='closed'?'2026-09-30':reason==='past'?'2026-09-28':'2026-09-29';state.time='10:00';
 if(reason==='expired')state.expiresAt=Date.now()-1;
 ctx.saveStaffAction(action.token,state);
 if(reason==='busy')rows.push({id:'other',date:state.date,time:state.time,status:'Активна'});
 if(reason==='stale')rows[0].time='14:00';
 assert.equal(ctx.applyStaffAction('1',action.token,'move').success,false,reason);assert.equal(writes,0);assert.equal(locked,false);
}
// Independent confirmations cannot silently change each other's selected time.
reset();const root=ctx.startStaffAction('1','b','move');const state=ctx.staffActionState('1',root.token);
const first=ctx.cloneStaffAction(state,{date:'2026-09-29',time:'10:00'});
ctx.cloneStaffAction(state,{date:'2026-10-01',time:'12:00'});
assert.equal(ctx.applyStaffAction('1',first,'move').success,true);assert.equal(rows[0].date,'2026-09-29');
for(const value of callbacks())assert.ok(Buffer.byteLength(value)<=64,value);
console.log('Staff actions passed: calendar, move, confirmation, cancellation, ownership, conflicts, stale/repeated clicks, notifications.');
