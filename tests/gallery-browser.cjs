const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({headless:true, channel:'chrome'});
  try {
    for (const width of [390, 1440]) {
      const context = await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
      let gallery={revision:'r1',items:[{id:'original',src:'images/galery_images/2.jpg',caption:'Первая работа'}]}, serial=1, fail=false, deny=false, offline=false;
      const errors=[];
      const settings={bookingDays:20,weeklySchedule:Array.from({length:7},(_,day)=>({day,slots:['10:00','14:00']}))};
      await context.route('**/*', async route => {
        const request=route.request(), url=new URL(request.url());
        if(url.hostname==='bagira.test') {
          const file=path.join(path.resolve(__dirname,'..'),url.pathname==='/'?'index.html':url.pathname);
          const ext=path.extname(file);
          return fs.existsSync(file)?route.fulfill({body:fs.readFileSync(file),contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.png':'image/png','.avif':'image/avif'})[ext]||'application/octet-stream'}):route.fulfill({status:404,body:''});
        }
        if(url.hostname!=='script.google.com') return route.abort();
        if(request.method()==='GET') {
          if(url.searchParams.has('gallery')) return offline?route.abort():route.fulfill({json:{success:true,gallery}});
          return route.fulfill({json:{success:true,botUsername:'BagiraMasterBot',bookings:[],days:[],slots:[],closedDays:[],closedSlots:{},scheduleSettings:settings}});
        }
        const d=JSON.parse(request.postData());
        if(d.action==='telegramAdminLogin')return route.fulfill({json:{success:true,sessionToken:'test-token',expiresAt:Date.now()+3600000}});
        if(d.action==='adminGallery') {
          assert.equal(d.sessionToken,'test-token');
          if(deny) return route.fulfill({json:{success:false,code:'AUTH_REQUIRED',error:'Сессия истекла'}});
          if(fail) return route.abort();
          if(d.operation!=='list') {
            assert.equal(d.revision,gallery.revision);
            const i=gallery.items.findIndex(item=>item.id===d.id);
            if(d.operation==='add') { assert.ok(d.src.startsWith('data:image/jpeg;base64,'));assert.ok(d.src.length<=200000);gallery.items.push({id:'uploaded',src:d.src,caption:d.caption}); }
            if(d.operation==='caption') gallery.items[i].caption=d.caption;
            if(d.operation==='move') gallery.items.splice(i+d.direction,0,gallery.items.splice(i,1)[0]);
            if(d.operation==='remove') gallery.items.splice(i,1);
            gallery.revision='r'+(++serial);
          }
          return route.fulfill({json:{success:true,gallery}});
        }
        return route.fulfill({json:{success:true,bookings:[],closedDays:[],closedSlots:{},scheduleSettings:settings,today:'2026-10-12',currentTime:'09:00'}});
      });
      const admin=await context.newPage();admin.on('pageerror',e=>errors.push(e.message));admin.on('dialog',d=>d.accept());
      await admin.goto('https://bagira.test/admin/admin.html');
      await admin.evaluate(()=>window.handleTelegramCredential({id:1}));
      await admin.locator('#galleryEditor summary').click();
      await admin.locator('.gallery-editor-card').waitFor();
      await admin.locator('#galleryFiles').setInputFiles(path.resolve('images/galery_images/2.jpg'));
      await admin.getByText('Добавлено фото: 1. Они уже доступны на сайте.',{exact:true}).waitFor();
      assert.equal(await admin.locator('.gallery-editor-card').count(),2);
      const caption='<img src=x onerror="window.galleryXss=1"> Красивый маникюр';
      await admin.locator('.gallery-editor-card').nth(1).locator('input').fill(caption);
      await admin.locator('.gallery-editor-card').nth(1).getByRole('button',{name:'Сохранить подпись'}).click();
      await admin.waitForFunction(()=>document.getElementById('galleryEditorStatus').textContent.startsWith('Сохранено.'));
      await admin.locator('.gallery-editor-card').nth(1).getByRole('button',{name:'← Раньше'}).click();
      await admin.waitForFunction(()=>document.querySelector('.gallery-editor-card input').value.startsWith('<img'));
      assert.equal(gallery.items[0].id,'uploaded');
      assert.ok(await admin.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await admin.locator('#galleryEditor').screenshot({path:`/tmp/bagira-gallery-admin-${width}.png`});
      const site=await context.newPage();site.on('pageerror',e=>errors.push(e.message));
      await site.goto('https://bagira.test/');
      await site.locator('.gallery-caption').filter({hasText:caption}).waitFor();
      assert.equal(await site.evaluate(()=>window.galleryXss),undefined);
      assert.equal(await site.locator('.gallery-item').count(),2);
      await site.locator('.gallery-item img').first().click();
      await site.locator('.image-lightbox').waitFor();
      assert.equal(await site.locator('.lightbox-image').getAttribute('alt'),caption);
      await site.locator('.lightbox-close').click();
      await site.locator('#gallery').screenshot({path:`/tmp/bagira-gallery-public-${width}.png`});
      fail=true;
      await admin.locator('.gallery-editor-card').first().getByRole('button',{name:'Сохранить подпись'}).click();
      await admin.waitForFunction(()=>document.getElementById('galleryEditorStatus').textContent.includes('перед следующим изменением'));
      assert.equal(await admin.locator('#galleryFiles').isDisabled(),true);
      fail=false; await admin.locator('#galleryRefresh').click();
      await admin.waitForFunction(()=>!document.getElementById('galleryFiles').disabled);
      await admin.locator('.gallery-editor-card').first().getByRole('button',{name:'Удалить',exact:true}).click();
      await admin.waitForFunction(()=>document.querySelectorAll('.gallery-editor-card').length===1);
      await admin.locator('.gallery-editor-card').first().getByRole('button',{name:'Удалить',exact:true}).click();
      await admin.getByText('Галерея пуста. Добавьте первую фотографию.',{exact:true}).waitFor();
      await site.reload();await site.waitForFunction(()=>document.getElementById('gallery').hidden);
      offline=true;await site.reload();await site.waitForFunction(()=>document.querySelector('.gallery-prev').disabled);
      assert.equal(await site.locator('.gallery-item').count(),7);
      deny=true;await admin.locator('#galleryRefresh').click();
      await admin.waitForFunction(()=>document.getElementById('adminApp').style.display==='none');
      assert.equal(await admin.locator('.gallery-editor-card').count(),0);
      assert.deepEqual(errors,[]);
      await context.close();
    }
    console.log('Gallery browser passed: mobile/desktop, compression/upload, caption/XSS, reorder, lightbox, deletion, empty/offline states, network recovery, expired session.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
