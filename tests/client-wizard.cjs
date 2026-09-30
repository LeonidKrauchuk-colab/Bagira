const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const props={},messages=[];let locked=false;
const c=vm.createContext({console,PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k],setProperty:(k,v)=>props[k]=v,deleteProperty:k=>delete props[k]})},Utilities:{getUuid:()=>crypto.randomUUID()},LockService:{getScriptLock:()=>({waitLock(){assert.equal(locked,false);locked=true;},releaseLock(){locked=false;}})},SpreadsheetApp:{flush(){}}});
vm.runInContext(fs.readFileSync('Code.gs','utf8'),c);
c.getDateAfterDays=n=>c.staffDateShift('2026-09-30',n);c.getScheduleSettings=()=>({bookingDays:20});c.getSheet=()=>({});c.getBookings=()=>[];c.staffFreeTimes=d=>d>='2026-09-30'&&d<='2026-10-20'?['10:00']:[];
c.sendClientBotMessage=(_,text,options)=>messages.push({text,options});c.clientBotMenu=()=>{};c.checkTelegramWebhookAccess=()=>true;c.isTelegramStaff=()=>false;c.answerTelegramCallback=()=>{};
const state=()=>c.getClientBotState('7');
const press=(action,value,override)=>c.handleClientTelegramCallback({id:'cb',from:{id:7},message:{chat:{id:7,type:'private'}},data:override||`client_w:${state().token}:${state().version}:${action}${value===undefined?'':':'+value}`},{});
const say=text=>c.handleClientTelegramMessage({chat:{id:7,type:'private'},from:{id:7},text},{});
c.startClientWizard('7');const old=`client_w:${state().token}:${state().version}:service:0`;
press('service','0');assert.equal(state().step,'date');assert.equal(press(null,null,old).success,false);
press('month','2026-10');press('date','2026-10-20');assert.equal(state().step,'time');press('time','1000');assert.equal(state().step,'name');
say('Анна');assert.equal(state().step,'phone');say('hello');assert.equal(state().step,'phone');say('+375291234567');assert.equal(state().step,'review');
press('back');assert.equal(state().step,'phone');say('+375299999999');assert.equal(state().phone,'+375299999999');
// Exercise production createBooking replay path, before availability/write checks.
c.findBookingById=id=>({id});let result=press('save');assert.equal(result.success,true);assert.equal(state().step,'saved');
result=press('save');assert.equal(result.success,true);say('Назад');assert.equal(state().step,'saved');
c.startClientWizard('7');press('cancel');assert.equal(state().token,undefined);
console.log('Client wizard passed: full date range, stale buttons, phone validation, preview/back, persisted-id replay, saved draft protection, cancellation.');
// Selecting a nearest slot retains date/time and skips calendar after service.
press(null,null,'client_slot:20261020:1000');assert.equal(state().date,'2026-10-20');assert.equal(state().time,'10:00');assert.equal(state().step,'service');
press('service','1');assert.equal(state().step,'name');say('Назад');assert.equal(state().step,'service');assert.equal(state().time,'10:00');
press('change');assert.equal(state().nearest,false);press('service','0');assert.equal(state().step,'date');
const original=c.staffFreeTimes;c.staffFreeTimes=()=>[];c.sendClientNearestSlots=()=>{};
const token=state().token;assert.equal(press(null,null,'client_slot:20261020:1000').success,false);assert.equal(state().token,token,'unavailable click must not replace draft');
c.staffFreeTimes=original;press(null,null,'client_slot:20261020:1000');c.staffFreeTimes=()=>[];press('service','0');assert.equal(state().step,'date','slot taken during service selection returns to calendar');
console.log('Nearest slots passed: retained selection, back/change, stale availability, draft preservation.');
