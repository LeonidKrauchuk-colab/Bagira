/* A local PNG export: no customer data is included. */
(() => {
  const trigger = document.getElementById('availabilityPosterButton');
  const status = document.getElementById('availabilityPosterStatus');
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Не удалось загрузить логотип. Обновите страницу.'));
      img.src = src;
    });
  }
  async function drawPoster(slots, logo, background) {
    const font = new FontFace('BagiraPoster', 'url(poster-assets/CormorantGaramond.ttf)', {weight:'300 700'});
    await font.load(); document.fonts.add(font);
    const canvas = document.createElement('canvas');
    canvas.width = 1080; canvas.height = 1920;
    const c = canvas.getContext('2d');
    c.drawImage(background,0,0,1080,1920);
    const mark=document.createElement('canvas');mark.width=mark.height=320;
    const m=mark.getContext('2d');m.drawImage(logo,0,0,320,320);
    m.globalCompositeOperation='source-in';m.fillStyle='#89565b';m.fillRect(0,0,320,320);
    c.drawImage(mark,380,65,320,320);
    function text(value,y,size,serif=false) {
      c.fillStyle='#81565d'; c.textAlign='center';
      c.font=`${size}px ${serif ? 'BagiraPoster, serif' : 'Arial, sans-serif'}`;
      c.fillText(value,540,y,960);
    }
    function box(x,y,w,h,r) {
      c.beginPath();c.roundRect(x,y,w,h,r);c.fill();c.stroke();
    }
    text('М А С Т Е Р С К А Я',414,25);
    text('БАГИРА',532,126,true);
    text('Свободные окошки',665,108,true);
    text('Найдите время для себя',753,29);
    c.strokeStyle='#ba8a89';c.lineWidth=1.5;
    c.beginPath();c.moveTo(245,704);c.lineTo(505,704);c.moveTo(575,704);c.lineTo(835,704);c.stroke();
    c.beginPath();c.ellipse(540,704,20,8,-.5,0,Math.PI*2);c.stroke();
    slots.forEach((slot,i) => {
      const x=70+(i%2)*485,y=805+Math.floor(i/2)*280;
      c.fillStyle='#fffaf5e8';c.strokeStyle='#cda6a3';c.lineWidth=1.5;
      c.shadowColor='#78504525';c.shadowBlur=24;c.shadowOffsetY=14;
      box(x,y,455,255,30);
      c.shadowColor="transparent";c.shadowBlur=0;c.shadowOffsetY=0;
      c.fillStyle='#81565d';c.textAlign='center';c.font='500 48px BagiraPoster';
      const date=new Date(slot.date+'T12:00:00');
      c.fillText(date.toLocaleDateString('ru-RU',{day:'numeric',month:'long'}),x+227.5,y+69,415);
      c.font='500 122px BagiraPoster';c.fillText(slot.time,x+227.5,y+214);
    });
    c.fillStyle='#81565d';c.strokeStyle='#81565d';box(100,1660,880,170,70);
    c.fillStyle='white';c.textAlign='center';c.font='46px BagiraPoster';c.fillText('Запишитесь в Telegram',540,1723);
    c.font='58px BagiraPoster';c.fillText('@BagiraMasterBot',540,1786);
    text('Свободность времени уточняется при записи',1868,24);
    return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob ? resolve(blob) : reject(new Error('Не удалось создать изображение.')),'image/png'));
  }
  trigger.addEventListener('click', async () => {
    trigger.disabled=true;status.textContent='Проверяем свободные окна…';
    try {
      const response=await fetch(`${GOOGLE_SCRIPT_URL}?availability=1&t=${Date.now()}`,{cache:'no-store',signal:AbortSignal.timeout(30000)});
      if(!response.ok)throw new Error('Не удалось получить расписание. Попробуйте ещё раз.');
      const result=await response.json();
      if(!result.success || !Array.isArray(result.slots))throw new Error('Не удалось получить расписание.');
      const slots=result.slots.slice(0,6);
      if(!slots.length){status.textContent='В периоде записи свободных окон нет.';return;}
      if(slots.some(s=>!/^\d{4}-\d{2}-\d{2}$/.test(s.date)||!/^\d{2}:\d{2}$/.test(s.time)))throw new Error('Некорректное расписание. Обновите данные.');
      status.textContent='Создаём изображение…';
      const [logo,background]=await Promise.all([loadImage('../images/logo_images/logo.png'),loadImage('poster-assets/silk-background.png')]);
      const blob=await drawPoster(slots,logo,background);
      const url=URL.createObjectURL(blob),dialog=document.createElement('dialog');
      dialog.className='move-dialog';
      const title=document.createElement('h2');title.textContent='Свободные окошки';
      const preview=document.createElement('img');preview.src=url;preview.alt='Изображение со свободными датами и временем';preview.style.cssText='display:block;width:100%;height:auto;border-radius:12px';
      const note=document.createElement('p');note.textContent='PNG, 1080 × 1920. На телефоне файл обычно сохраняется в «Загрузки». Перед публикацией можно создать свежую картинку.';
      const actions=document.createElement('div');actions.className='card-actions';
      const name='bagira-free-slots-'+slots[0].date+'.png';
      const download=document.createElement('a');download.href=url;download.download=name;download.textContent='Скачать PNG';
      const close=document.createElement('button');close.type='button';close.textContent='Закрыть';close.onclick=()=>dialog.close();
      actions.append(download);
      const file=new File([blob],name,{type:'image/png'});
      if(navigator.canShare?.({files:[file]})) {
        const share=document.createElement('button');share.type='button';share.textContent='Поделиться';
        share.onclick=async()=>{try{await navigator.share({files:[file],title:'Багира — свободные окошки'});}catch(error){if(error.name!=='AbortError')note.textContent='Не удалось поделиться. Скачайте PNG и отправьте его из телефона.';}};
        actions.append(share);
      }
      actions.append(close);dialog.append(title,preview,note,actions);document.body.append(dialog);
      dialog.addEventListener('close',()=>{URL.revokeObjectURL(url);dialog.remove();},{once:true});
      dialog.showModal();status.textContent=`Готово: ${slots.length} свободных окон.`;
    } catch(error) {status.textContent=error.name==='TimeoutError' ? 'Сервер не ответил. Попробуйте ещё раз.' : error.message;}
    finally {trigger.disabled=false;}
  });
})();
