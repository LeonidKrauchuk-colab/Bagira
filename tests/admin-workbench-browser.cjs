let chromium;try{({chromium}=require('playwright'));}catch(e){console.log('Admin browser check skipped: Playwright unavailable');process.exit(0);}
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
(async()=>{const browser=await chromium.launch({headless:true,channel:'chrome'});for(const width of [390,1440]){
const page=await browser.newPage({viewport:{width,height:900},serviceWorkers:'block'}),errors=[];page.on('pageerror',e=>errors.push(e.message));let accept=true;page.on('dialog',d=>accept?d.accept():d.dismiss());
const rows=[{id:'b',name:'Анна',phone:'+375291234567',service:'Маникюр',date:'2026-09-30',time:'10:00',status:'Ожидает подтверждения',source:'site',contactNeeded:true,deliveryFailures:[],revision:'r1',telegramConnected:false},{id:'c',name:'Ольга',phone:'+375291234568',service:'Педикюр',date:'2026-09-30',time:'14:00',status:'Отменена',source:'bot',contactNeeded:true,deliveryFailures:['cancel'],revision:'r2',telegramConnected:true}];
const settings={bookingDays:20,weeklySchedule:Array.from({length:7},(_,day)=>({day,slots:['10:00','14:00','18:00']}))};let closedSlots={},closedDays=[];
await page.route('**/*',async route=>{const url=new URL(route.request().url());if(url.hostname==='bagira.test'){const file=path.join(path.resolve(__dirname,'..'),url.pathname);return fs.existsSync(file)?route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.html')?'text/html':file.endsWith('.js')?'text/javascript':'text/css'}):route.fulfill({status:404,body:''});}
if(url.hostname==='script.google.com'){
if(route.request().method()==='GET')return route.fulfill({json:{success:true,botUsername:'BagiraMasterBot',closedDays,closedSlots,scheduleSettings:settings}});
const d=JSON.parse(route.request().postData());let result={success:true};
if(d.action==='telegramAdminLogin')result={success:true,sessionToken:'test-token',expiresAt:Date.now()+3600000};
if(d.action==='setClosedDays'){closedDays=d.dates;result.closedDays=closedDays;}
if(d.action==='getAdminBookings')result={success:true,bookings:rows,closedSlots,closedDays,scheduleSettings:settings,today:'2026-09-30',currentTime:'09:00'};
if(d.action==='adminWorkbench'){
assert.equal(d.sessionToken,'test-token');const b=rows.find(b=>b.id===d.id);
if(d.operation==='slots')result.times=['10:00','14:00'];
if(d.operation==='confirm'){b.status='Активна';b.contactNeeded=false;b.revision='r3';}
if(d.operation==='move'){b.date=d.date;b.time=d.time;b.revision='r4';}
if(d.operation==='resolved'){b.contactNeeded=false;b.deliveryFailures=[];}
if(d.operation==='slot')closedSlots[d.date]=d.closed?[d.time]:[];
}
return route.fulfill({json:result});}return route.abort();});
await page.goto('https://bagira.test/admin/admin.html');await page.evaluate(()=>window.handleTelegramCredential({id:1}));await page.evaluate(async()=>{selectedDate.value='2026-09-30';await loadBookings();});
await page.screenshot({path:'/tmp/bagira-admin-cards-'+width+'.png',fullPage:true});await page.getByRole('button',{name:/Ожидают подтверждения ·/}).click();await page.locator('#workbenchResults').getByRole('button',{name:'Подтвердить',exact:true}).click();assert.equal(rows[0].status,'Активна');
await page.getByRole('button',{name:'Расписание дня',exact:true}).click();await page.locator('#bookingsContainer').getByRole('button',{name:'Перенести',exact:true}).click();await page.locator('.move-dialog input').fill('2026-10-01');await page.locator('.move-dialog select').selectOption('14:00');await page.locator('.move-dialog').getByRole('button',{name:'Проверить и перенести'}).click();await page.locator('.move-dialog').waitFor({state:'detached'});assert.equal(rows[0].date,'2026-10-01');
await page.getByRole('button',{name:/Нужно связаться ·/}).click();await page.locator('#workbenchResults').getByRole('button',{name:'Клиент уведомлён по телефону'}).click();assert.equal(rows[1].contactNeeded,false);
await page.locator('#clientSearch').fill('1234567');await page.locator('#workbenchResults').getByRole('button',{name:'Записать снова'}).click();assert.equal(await page.locator('#bookingName').inputValue(),'Анна');await page.locator('#bookingName').fill('Анна новая');accept=false;await page.locator('#closeModalButton').click();assert.ok(await page.locator('#bookingModal').evaluate(el=>el.classList.contains('active')));accept=true;await page.locator('#closeModalButton').click();
await page.locator('#clientSearch').fill('');await page.getByRole('button',{name:'Расписание дня',exact:true}).click();await page.getByText('Календарь загрузки',{exact:true}).click();await page.getByText('Окна и выходной выбранного дня',{exact:true}).click();await page.locator('#daySlotControls').getByRole('button',{name:'18:00 — закрыть',exact:true}).click();await page.locator('#daySlotControls').getByRole('button',{name:'18:00 — открыть',exact:true}).waitFor();assert.deepEqual(closedSlots['2026-09-30'],['18:00']);await page.locator('#daySlotControls').getByRole('button',{name:/Сделать выходным/}).click();await page.locator('#daySlotControls').getByRole('button',{name:/Убрать выходной/}).waitFor();assert.deepEqual(closedDays,['2026-09-30']);await page.locator('#daySlotControls').getByRole('button',{name:/Убрать выходной/}).click();await page.locator('#daySlotControls').getByRole('button',{name:/Сделать выходным/}).waitFor();assert.deepEqual(closedDays,[]);
assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'/tmp/bagira-admin-'+width+'.png',fullPage:true});assert.deepEqual(errors,[]);await page.close();}
await browser.close();console.log('Admin browser passed: login, confirmation, move, contact queue, history/rebooking, unsaved changes, slot control, mobile/desktop.');})().catch(e=>{console.error(e);process.exit(1)});
