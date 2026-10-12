(() => {
  const panel = document.getElementById('galleryEditor');
  const list = document.getElementById('galleryEditorList');
  const status = document.getElementById('galleryEditorStatus');
  const picker = document.getElementById('galleryFiles');
  const refresh = document.getElementById('galleryRefresh');
  let gallery = null;
  let busy = false;
  let uncertain = false;

  function setBusy(value) {
    busy = value;
    panel.querySelectorAll('button, input').forEach(control => { control.disabled = value; });
    picker.disabled = value || !gallery || uncertain || gallery.items.length >= 20;
    panel.setAttribute('aria-busy', String(value));
    if (!value && gallery) {
      list.querySelectorAll('[data-edge="true"]').forEach(button => { button.disabled = true; });
      if (uncertain) list.querySelectorAll('button, input').forEach(control => { control.disabled = true; });
    }
  }

  async function request(operation, extra = {}) {
    const token = ADMIN_SESSION_TOKEN;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, signal: controller.signal,
        body: JSON.stringify({ action: 'adminGallery', operation, sessionToken: token, revision: gallery?.revision, ...extra })
      });
      if (!response.ok) throw Error('Нет ответа сервера.');
      const result = await response.json();
      if (token !== ADMIN_SESSION_TOKEN) throw Error('Сессия изменилась. Войдите и обновите галерею.');
      if (result.code === 'AUTH_REQUIRED') closeAdminSession(result.error);
      if (!result.success) throw Error(result.error || 'Не удалось сохранить галерею.');
      if (!result.gallery || !Array.isArray(result.gallery.items)) throw Error('Обновите сервер галереи (Code.gs).');
      gallery = result.gallery;
      uncertain = false;
      render();
    } catch (error) {
      // A lost response may still mean a completed write: require a fresh read.
      uncertain = true;
      throw Error((error.name === 'AbortError' ? 'Сервер не ответил вовремя.' : error.message) + ' Нажмите «Обновить» перед следующим изменением.');
    } finally { clearTimeout(timeout); }
  }

  async function run(operation, extra) {
    if (busy) return;
    setBusy(true);
    status.textContent = operation === 'list' ? 'Загружаем галерею…' : 'Сохраняем…';
    try {
      await request(operation, extra);
      status.textContent = operation === 'list' ? `Фото: ${gallery.items.length} из 20.` : 'Сохранено. Изменение появится на сайте при следующем открытии страницы.';
    } catch (error) { status.textContent = error.message; }
    finally { setBusy(false); }
  }

  function button(text, action, edge = false) {
    const element = document.createElement('button');
    element.type = 'button'; element.textContent = text;
    element.dataset.edge = String(edge); element.disabled = edge;
    element.addEventListener('click', action);
    return element;
  }

  function render() {
    list.replaceChildren();
    gallery.items.forEach((item, index) => {
      const card = document.createElement('article'); card.className = 'gallery-editor-card';
      const img = document.createElement('img');
      img.src = item.src.startsWith('images/') ? '../' + item.src : item.src;
      img.alt = item.caption || 'Работа мастера'; img.loading = 'lazy';
      const label = document.createElement('label'); label.textContent = `Подпись к фото ${index + 1}`;
      const caption = document.createElement('input'); caption.type = 'text'; caption.maxLength = 160; caption.value = item.caption;
      label.append(caption);
      const controls = document.createElement('div'); controls.className = 'gallery-editor-actions';
      controls.append(
        button('Сохранить подпись', () => run('caption', { id: item.id, caption: caption.value })),
        button('← Раньше', () => run('move', { id: item.id, direction: -1 }), index === 0),
        button('Позже →', () => run('move', { id: item.id, direction: 1 }), index === gallery.items.length - 1),
        button('Удалить', () => { if (confirm(`Удалить фото ${index + 1} из галереи сайта?`)) run('remove', { id: item.id }); })
      );
      card.append(img, label, controls); list.append(card);
    });
    if (!gallery.items.length) list.textContent = 'Галерея пуста. Добавьте первую фотографию.';
  }

  async function compressPhoto(file) {
    if (file.size > 30 * 1024 * 1024) throw Error('Файл больше 30 МБ. Выберите фотографию меньшего размера.');
    if (!file.type.startsWith('image/')) throw Error('Выберите фотографию.');
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(Error('Не удалось открыть фото. Для HEIC сохраните копию в JPEG и повторите.')); img.src = url; });
      const canvas = document.createElement('canvas');
      let scale = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight));
      for (let attempt = 0; attempt < 8; attempt++) {
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const context = canvas.getContext('2d');
        context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(img, 0, 0, canvas.width, canvas.height);
        const src = canvas.toDataURL('image/jpeg', Math.max(0.55, 0.85 - attempt * 0.05));
        if (src.length <= 200000) return src;
        scale *= 0.8;
      }
      throw Error('Не удалось уменьшить фото. Выберите другой файл.');
    } finally { URL.revokeObjectURL(url); }
  }

  picker.addEventListener('change', async () => {
    const files = Array.from(picker.files || []); picker.value = '';
    if (busy || !gallery || uncertain || !files.length) return;
    if (files.length + gallery.items.length > 20) { status.textContent = `Можно добавить ещё ${20 - gallery.items.length} фото.`; return; }
    const uploadSession = ADMIN_SESSION_TOKEN;
    setBusy(true);
    let saved = 0;
    try {
      for (const file of files) {
        status.textContent = `Загружаем фото ${saved + 1} из ${files.length}…`;
        const src = await compressPhoto(file);
        if (!uploadSession || uploadSession !== ADMIN_SESSION_TOKEN) throw Error('Сессия изменилась. Войдите и обновите галерею.');
        await request('add', { src, caption: '' }); saved++;
      }
      status.textContent = `Добавлено фото: ${saved}. Они уже доступны на сайте.`;
    } catch (error) { status.textContent = `Добавлено: ${saved} из ${files.length}. ${error.message}`; }
    finally { setBusy(false); }
  });
  refresh.addEventListener('click', () => run('list'));
  panel.addEventListener('toggle', () => { if (panel.open && !busy) run('list'); });
  window.addEventListener('gallery-session-ended', () => {
    gallery = null; uncertain = true; panel.open = false;
    list.replaceChildren(); status.textContent = ''; setBusy(busy);
  });
  setBusy(false);
})();
