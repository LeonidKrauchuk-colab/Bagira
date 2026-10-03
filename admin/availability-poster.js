/* A local PNG export: no customer data is included. */
(() => {
  const trigger = document.getElementById('availabilityPosterButton');
  const status = document.getElementById('availabilityPosterStatus');
  function loadLogo() {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Не удалось загрузить логотип. Обновите страницу.'));
      img.src = '../images/logo_images/logo.png';
    });
  }
  async function drawPoster(slots, logo) {
    const canvas = document.createElement('canvas');
    canvas.width = 1080; canvas.height = 1920;
    const c = canvas.getContext('2d');
    c.fillStyle = '#faf5ef'; c.fillRect(0, 0, 1080, 1920);
    for (const [x,y] of [[0,0],[1080,1920]]) {
      const g = c.createRadialGradient(x,y,0,x,y,850);
      g.addColorStop(0,'#d9b6b0');g.addColorStop(1,'#faf5ef00');
      c.fillStyle=g;c.fillRect(0,0,1080,1920);
    }
    c.drawImage(logo,390,75,300,300);
    function text(value,y,size,serif=false) {
      c.fillStyle='#81565d'; c.textAlign='center';
      c.font=`${size}px ${serif ? 'Georgia, serif' : 'Arial, sans-serif'}`;
      c.fillText(value,540,y,960);
    }
    function box(x,y,w,h,r) {
      c.beginPath();c.roundRect(x,y,w,h,r);c.fill();c.stroke();
    }
    text('М А С Т Е Р С К А Я',414,25);
    text('БАГИРА',520,96,true);
    text('Свободные окошки',638,83,true);
    text('Найдите время для себя',704,32);
    slots.forEach((slot,i) => {
      const x=70+(i%2)*485,y=775+Math.floor(i/2)*275;
      c.fillStyle='#fffaf5';c.strokeStyle='#cda6a3';c.lineWidth=2;
      box(x,y,455,245,30);
      c.fillStyle='#81565d';c.textAlign='center';c.font='40px Georgia, serif';
      const date=new Date(slot.date+'T12:00:00');
      c.fillText(date.toLocaleDateString('ru-RU',{day:'numeric',month:'long'}),x+227.5,y+69,415);
      c.font='94px Georgia, serif';c.fillText(slot.time,x+227.5,y+181);
    });
    c.fillStyle='#81565d';c.strokeStyle='#81565d';box(100,1640,880,175,70);
    c.fillStyle='white';c.textAlign='center';c.font='36px Arial';c.fillText('Запишитесь в Telegram',540,1705);
    c.font='48px Georgia';c.fillText('@BagiraMasterBot',540,1770);
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
      const blob=await drawPoster(slots,await loadLogo());
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
