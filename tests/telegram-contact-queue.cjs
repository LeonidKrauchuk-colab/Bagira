const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const props={},cards=[],messages=[];
const c=vm.createContext({console,PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]})}});
vm.runInContext(fs.readFileSync('Code.gs','utf8'),c);
for(const message of ['Нельзя выбрать числовой формат ячеек для столбца с заданным типом данных.','Cannot set number format in a typed column.']) {
 c.formatBookingCell({getRange:()=>({setNumberFormat(){throw Error(message);}})},2,3,'@');
}
assert.throws(()=>c.formatBookingCell({getRange:()=>({setNumberFormat(){throw Error('Permission denied');}})},2,3,'@'),/Permission denied/);
let rows=Array.from({length:7},(_,i)=>({id:String(i),date:'2026-10-01',time:'10:00',status:'Ожидает подтверждения'}));
rows.forEach(b=>props['BOOKING_SOURCE_'+b.id]='site');
c.getDateAfterDays=()=> '2026-09-30';c.getSheet=()=>({});c.getBookings=()=>rows;
c.sendStaffBookingCard=(_,b)=>cards.push(b.id);c.sendStaffTelegramMessage=(_,text,markup)=>messages.push({text,markup});
c.sendStaffContactQueue('1',0);assert.equal(cards.length,5);assert.ok(messages.at(-1).markup.inline_keyboard.flat().some(b=>b.callback_data==='admin_contact:5'));
cards.length=0;c.sendStaffContactQueue('1',5);assert.deepEqual(cards,['5','6']);
rows[0].status='Активна';rows[1].status='Отменена';props.BOOKING_CLIENT_CHAT_2='123';props.BOOKING_SOURCE_3='bot';rows[4].date='2026-09-29';delete props.BOOKING_SOURCE_5;
cards.length=0;c.sendStaffContactQueue('1',5);assert.deepEqual(cards,['5','6'],'legacy unlinked bookings also need phone contact');
console.log('Contact queue and typed-column handling passed.');
