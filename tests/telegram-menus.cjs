const assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm');
const calls=[];
const properties={ADMIN_TELEGRAM_USER_ID:'1',MASTER_TELEGRAM_USER_ID:'2',TELEGRAM_WEBHOOK_SECRET:'secret'};
const ctx=vm.createContext({console,PropertiesService:{getScriptProperties:()=>({getProperty:k=>properties[k],getProperties:()=>properties,deleteProperty(){}})}});
vm.runInContext(fs.readFileSync('Code.gs','utf8'),ctx);
ctx.telegramApiCall=(method,payload,reply)=>{calls.push({method,payload,reply});return {};};
ctx.jsonResponse=x=>x;
ctx.telegramWebhookResponse=x=>x;
const event={parameter:{telegramSecret:'secret'}};
for(const id of [1,2,3]) {
 calls.length=0;
 const result=ctx.doPost({...event,postData:{contents:JSON.stringify({message:{text:'/start',from:{id},chat:{id,type:'private'}}})}});
 assert.equal(result.success,true);
 const sent=calls.find(x=>x.method==='sendMessage');
 assert.ok(sent);
 assert.equal(JSON.stringify(sent.payload.reply_markup).includes('Сегодня'),id!==3);
 assert.equal(JSON.stringify(sent.payload.reply_markup).includes('Записаться'),id===3);
 assert.ok(calls.some(x=>x.method==='deleteMyCommands' && x.payload.scope.chat_id===String(id)));
 assert.equal(calls.some(x=>x.method==='setMyCommands'),false);
}
assert.equal(ctx.isTelegramStaff({id:1},{id:3,type:'private'}),false);
assert.equal(ctx.isTelegramStaff({id:1},{id:1,type:'group'}),false);
assert.equal(ctx.handleStaffTelegramCallback({id:'cb',data:'admin_list:today:0',from:{id:3},message:{chat:{id:3,type:'private'}}},event).success,false);
calls.length=0;
ctx.configureTelegramMenus();
assert.equal(calls.some(x=>x.method==='sendMessage'),false);
assert.ok(calls.some(x=>x.method==='deleteMyCommands' && x.payload.scope.chat_id==='2'));
let selected;
ctx.sendStaffBookings=(id,mode)=>selected=mode;
ctx.handleStaffTelegramMessage({text:'/pending',from:{id:1},chat:{id:1,type:'private'}},event);
assert.equal(selected,'pending');
ctx.sendClientBookings=()=>selected='client';
ctx.handleClientTelegramMessage({text:'/bookings',from:{id:3},chat:{id:3,type:'private'}},event);
assert.equal(selected,'client');
console.log('Role menus passed: client/admin/master, commands, staff access, configuration without broadcast.');
// Execute real list and availability handlers, not just command routing.
vm.runInContext(fs.readFileSync('Code.gs','utf8'),vm.createContext({}));
const live=vm.createContext({console:{log(){},error(){}},PropertiesService:{getScriptProperties:()=>({getProperty:k=>properties[k],getProperties:()=>properties,deleteProperty(){}})}});
vm.runInContext(fs.readFileSync('Code.gs','utf8'),live);
live.jsonResponse=x=>x;
live.telegramWebhookResponse=x=>x;
live.getDateAfterDays=days=>days?'2026-09-29':'2026-09-28';
live.getSheet=()=>({});
live.getBookings=()=>[{id:'b',date:'2026-09-28',time:'10:00',name:'Client',phone:'123',service:'Service',status:'Ожидает подтверждения'}];
live.getNearestAvailability=()=>({slots:[{date:'2026-09-29',time:'10:00'}]});
const sent=[];
live.telegramApiCall=(method,payload)=>{sent.push({method,payload});return {};};
function press(id,text){return live.doPost({...event,postData:{contents:JSON.stringify({message:{text,from:{id},chat:{id,type:'private'}}})}});}
for(const id of [1,2]) for(const text of ['📅 Сегодня','📅 Завтра','⏳ Ожидают подтверждения','🕐 Свободные окна']) {
 sent.length=0;
 assert.equal(press(id,text).success,true);
 assert.ok(sent.some(x=>x.method==='sendMessage'));
}
live.getSheet=()=>{throw Error('sheet unavailable');};
sent.length=0;
assert.equal(press(1,'📅 Сегодня').success,false);
assert.ok(sent.some(x=>x.payload.text.includes('Не удалось выполнить команду')));
sent.length=0;
assert.equal(live.dispatchTelegramMessage({from:{id:1},chat:{id:1,type:'private'},text:'📅 Сегодня'},{parameter:{}}).success,false);
assert.equal(sent.length,0);
console.log('Actual staff buttons and visible failure responses passed.');
