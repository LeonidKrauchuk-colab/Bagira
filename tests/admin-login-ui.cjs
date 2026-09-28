const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('admin/admin.html','utf8');
const elements=new Map();
function element(id){if(!elements.has(id)) elements.set(id,{style:{},textContent:'',children:[],hidden:false,replaceChildren(){this.children=[];},appendChild(child){this.children.push(child);},addEventListener(name,fn){this[name]=fn;}});return elements.get(id);}
let response={success:true,botUsername:'BagiraMasterBot'},loaded=0,requests=[];
const context=vm.createContext({
 window:{}, console, Date, Math,
 document:{getElementById:element,createElement:()=>({setAttribute(key,value){this[key]=value;}})},
 fetch:async(url,options)=>{requests.push({url,options});return {ok:true,json:async()=>response};},
 setTimeout:()=>1,clearTimeout(){},setToday(){},loadClosedDays:async()=>{},loadBookings:async()=>{loaded++;},closeBookingModal(){},bookingsContainer:element('bookings'),
});
vm.runInContext('let ADMIN_SESSION_TOKEN=""; let adminSessionTimer=null; const GOOGLE_SCRIPT_URL="mock";',context);
const begin=html.indexOf('    function showLoginError');
const end=html.indexOf('    initTelegramLogin();',begin);
vm.runInContext(html.slice(begin,end),context);
(async()=>{
 await context.initTelegramLogin();
 const widget=element('telegramLoginButton').children[0];
 assert.equal(widget['data-telegram-login'],'BagiraMasterBot');
 assert.equal(widget['data-onauth'],'handleTelegramCredential(user)');
 response={success:false,error:'Доступ запрещён'};
 await context.window.handleTelegramCredential({id:999});
 assert.equal(element('adminApp').style.display,'none');
 assert.equal(loaded,0);
 response={success:true,sessionToken:'session',expiresAt:Date.now()+60000};
 await context.window.handleTelegramCredential({id:101});
 assert.equal(element('adminApp').style.display,'block');
 assert.equal(vm.runInContext('ADMIN_SESSION_TOKEN',context),'session');
 assert.equal(loaded,1);
 await element('logoutButton').click();
 assert.equal(vm.runInContext('ADMIN_SESSION_TOKEN',context),'');
 assert.equal(element('adminApp').style.display,'none');
 assert.equal(JSON.parse(requests.at(-1).options.body).sessionToken,'session');
 assert.equal(html.includes('accounts.google.com/gsi'),false);
 assert.equal(html.includes('idToken:'),false);
 console.log('Admin login UI passed: widget setup, rejection, successful session, logout, Google removed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
