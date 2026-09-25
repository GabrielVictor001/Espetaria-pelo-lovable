/* ============================================================
   Espetaria — Painel do Dono
   ============================================================ */
(function () {
  'use strict';

  var DB = window.EspetariaDB;
  var esc = DB.escapeHtml;
  var SESSION_KEY = 'espetaria_admin_ok';

  var data = DB.load();
  var editingCatId = null;
  var editingItemId = null;
  var itemPhotoValue = '';
  var heroPhotoValue = data.store.heroImage || '';

  var DAY_NAMES = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
  var DAY_FULL = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

  function $(id) { return document.getElementById(id); }

  function toast(msg, type) {
    var box = $('toasts');
    var el = document.createElement('div');
    el.className = 'toast ' + (type || '');
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(function () {
      el.classList.add('out');
      setTimeout(function () { el.remove(); }, 350);
    }, 2800);
  }

  function openModal(id) { $(id).classList.add('show'); }
  function closeModal(id) { $(id).classList.remove('show'); }

  function persist() {
    DB.save(data);
    document.title = 'Painel do Dono — ' + data.store.name;
    $('panelStoreName').textContent = data.store.name;
  }

  function inputPrice(v) {
    var n = Number(v) || 0;
    return n.toFixed(2).replace('.', ',');
  }

  function refreshAll() {
    renderHome();
    renderStoreForm();
    renderCats();
    renderItems();
  }

  /* ================= LOGIN ================= */

  function isLogged() {
    try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch (e) { return false; }
  }

  function doLogin() {
    var val = $('loginPass').value || '';
    if (DB.hashPass(val) === data.admin.passHash) {
      try { sessionStorage.setItem(SESSION_KEY, '1'); } catch (e) { /* ignora */ }
      showPanel();
      toast('Bem-vindo(a) ao painel! 👋', 'ok');
    } else {
      toast('Senha incorreta. Tente de novo.', 'err');
      $('loginPass').select();
    }
  }

  function showPanel() {
    $('loginScreen').classList.add('hidden');
    $('panel').classList.remove('hidden');
    persist();
    refreshAll();
  }

  /* ================= ABAS ================= */

  function switchTab(name) {
    var btns = $('tabs').querySelectorAll('button');
    btns.forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === name); });
    ['home', 'store', 'menu', 'backup'].forEach(function (t) {
      $('tab-' + t).classList.toggle('hidden', t !== name);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ================= INÍCIO ================= */

  function sortedCats() {
    return data.categories.slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
  }

  function itemsOf(catId) {
    return data.items
      .filter(function (it) { return it.catId === catId; })
      .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
  }

  function renderHome() {
    var s = data.store;
    var st = DB.isOpen(s);

    var missingWhatsapp = !DB.onlyDigits(s.whatsapp);
    $('setupAlert').innerHTML = missingWhatsapp
      ? '<div class="alert err">⚠️ <span><b>Falta 1 passo importante:</b> cadastre o WhatsApp da loja na aba <b>Loja</b> para começar a receber pedidos.</span></div>'
      : '<div class="alert ok">✅ <span>Tudo certo! Sua loja está pronta para receber pedidos no WhatsApp <b>' + esc(DB.onlyDigits(s.whatsapp)) + '</b>.</span></div>';

    var hs = $('homeStatus');
    hs.textContent = (st.open ? '🟢 ' : '🔴 ') + st.label;
    hs.className = 'big-status ' + (st.open ? 'open' : 'closed');
    $('homeHours').textContent = DB.hoursLabel(s) + (s.forceStatus !== 'auto' ? ' (forçado: ' + (s.forceStatus === 'open' ? 'aberta' : 'fechada') + ')' : '');

    var avail = data.items.filter(function (i) { return i.available !== false; }).length;
    $('homeStats').innerHTML =
      '<div class="stat"><b>' + data.items.length + '</b><span>itens no cardápio</span></div>' +
      '<div class="stat"><b>' + data.categories.length + '</b><span>categorias</span></div>' +
      '<div class="stat"><b>' + avail + '</b><span>disponíveis</span></div>';

    var steps = [];
    steps.push({ done: !missingWhatsapp, text: '<b>WhatsApp</b> da loja cadastrado' });
    steps.push({ done: data.store.name !== 'Minha Espetaria', text: '<b>Nome</b> da sua espetaria' });
    steps.push({ done: data.items.length > 0, text: 'Cardápio com <b>itens e preços</b> certos' });
    steps.push({ done: !!data.store.pixKey, text: 'Chave <b>Pix</b> cadastrada (opcional)' });
    steps.push({ done: data.admin.passHash !== DB.hashPass('admin123'), text: '<b>Senha</b> do painel trocada' });
    $('setupSteps').innerHTML = steps.map(function (s2) {
      return '<li class="' + (s2.done ? 'done' : '') + '">' + (s2.done ? '✅ ' : '⬜ ') + s2.text + '</li>';
    }).join('');
  }

  /* ================= LOJA ================= */

  function renderStoreForm() {
    var s = data.store;
    $('f_name').value = s.name || '';
    $('f_logoEmoji').value = s.logoEmoji || '';
    $('f_tagline').value = s.tagline || '';
    $('f_whatsapp').value = DB.onlyDigits(s.whatsapp) || '';
    $('f_instagram').value = s.instagram || '';
    $('f_address').value = s.address || '';
    $('f_mapsUrl').value = s.mapsUrl || '';
    $('f_deliveryFee').value = inputPrice(s.deliveryFee);
    $('f_freeDeliveryFrom').value = inputPrice(s.freeDeliveryFrom);
    $('f_deliveryTime').value = s.deliveryTime || '';
    $('f_pixKey').value = s.pixKey || '';
    $('f_payments').value = (s.payments || []).join('\n');
    $('f_hoursOpen').value = s.hoursOpen || '18:00';
    $('f_hoursClose').value = s.hoursClose || '23:00';

    var days = s.daysOpen || [];
    var dh = '';
    for (var d = 0; d < 7; d++) {
      // ordem seg..dom na tela
      var day = (d + 1) % 7;
      dh += '<label title="' + DAY_FULL[day] + '"><input type="checkbox" data-day="' + day + '"' + (days.indexOf(day) > -1 ? ' checked' : '') + '><span>' + DAY_NAMES[day] + '</span></label>';
    }
    $('f_days').innerHTML = dh;

    heroPhotoValue = s.heroImage || '';
    $('f_heroPreview').src = heroPhotoValue || 'assets/img/hero.jpg';
  }

  function saveStoreForm() {
    var s = data.store;
    var name = $('f_name').value.trim();
    if (!name) { toast('Dê um nome para sua espetaria.', 'err'); return; }
    s.name = name;
    s.logoEmoji = $('f_logoEmoji').value.trim() || '🍢';
    s.tagline = $('f_tagline').value.trim();
    s.whatsapp = DB.onlyDigits($('f_whatsapp').value);
    s.instagram = $('f_instagram').value.trim();
    s.address = $('f_address').value.trim();
    s.mapsUrl = $('f_mapsUrl').value.trim();
    s.deliveryFee = DB.parsePrice($('f_deliveryFee').value);
    s.freeDeliveryFrom = DB.parsePrice($('f_freeDeliveryFrom').value);
    s.deliveryTime = $('f_deliveryTime').value.trim();
    s.pixKey = $('f_pixKey').value.trim();
    s.payments = $('f_payments').value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
    if (!s.payments.length) s.payments = ['Pix'];
    s.hoursOpen = $('f_hoursOpen').value || '18:00';
    s.hoursClose = $('f_hoursClose').value || '23:00';
    s.daysOpen = Array.prototype.map.call(
      $('f_days').querySelectorAll('input:checked'),
      function (el) { return +el.getAttribute('data-day'); }
    );
    s.heroImage = heroPhotoValue || 'assets/img/hero.jpg';
    persist();
    renderHome();
    toast('Dados da loja salvos! ✅', 'ok');
  }

  /* ================= CATEGORIAS ================= */

  function renderCats() {
    var cats = sortedCats();
    var html = '';
    cats.forEach(function (cat, idx) {
      var n = itemsOf(cat.id).length;
      html += '<div class="cat-row">' +
        '<span class="nm">' + esc(cat.emoji || '📂') + ' ' + esc(cat.name) + ' <small>(' + n + ' ' + (n === 1 ? 'item' : 'itens') + ')</small></span>' +
        '<button class="mini-btn" data-cat-up="' + cat.id + '" title="Subir">⬆️</button>' +
        '<button class="mini-btn" data-cat-down="' + cat.id + '" title="Descer">⬇️</button>' +
        '<button class="mini-btn" data-cat-edit="' + cat.id + '">✏️</button>' +
        '<button class="mini-btn red" data-cat-del="' + cat.id + '">🗑️</button>' +
      '</div>';
    });
    $('catList').innerHTML = html || '<p class="muted">Nenhuma categoria. Crie a primeira! 👆</p>';

    $('catList').querySelectorAll('[data-cat-edit]').forEach(function (b) {
      b.onclick = function () { openCatModal(b.getAttribute('data-cat-edit')); };
    });
    $('catList').querySelectorAll('[data-cat-del]').forEach(function (b) {
      b.onclick = function () { deleteCat(b.getAttribute('data-cat-del')); };
    });
    $('catList').querySelectorAll('[data-cat-up]').forEach(function (b) {
      b.onclick = function () { moveCat(b.getAttribute('data-cat-up'), -1); };
    });
    $('catList').querySelectorAll('[data-cat-down]').forEach(function (b) {
      b.onclick = function () { moveCat(b.getAttribute('data-cat-down'), 1); };
    });
  }

  function moveCat(id, dir) {
    var cats = sortedCats();
    var i = -1;
    cats.forEach(function (c, idx) { if (c.id === id) i = idx; });
    var j = i + dir;
    if (i < 0 || j < 0 || j >= cats.length) return;
    var tmp = cats[i].order; cats[i].order = cats[j].order; cats[j].order = tmp;
    persist(); renderCats();
  }

  function openCatModal(id) {
    editingCatId = id || null;
    var cat = null;
    if (id) {
      for (var i = 0; i < data.categories.length; i++) {
        if (data.categories[i].id === id) { cat = data.categories[i]; break; }
      }
    }
    $('catModalTitle').textContent = cat ? 'Editar categoria' : 'Nova categoria';
    $('c_name').value = cat ? cat.name : '';
    $('c_emoji').value = cat ? (cat.emoji || '') : '';
    openModal('catModal');
  }

  function saveCat() {
    var name = $('c_name').value.trim();
    if (!name) { toast('Dê um nome para a categoria.', 'err'); return; }
    var emoji = $('c_emoji').value.trim();
    if (editingCatId) {
      data.categories.forEach(function (c) {
        if (c.id === editingCatId) { c.name = name; c.emoji = emoji; }
      });
    } else {
      var max = 0;
      data.categories.forEach(function (c) { if ((c.order || 0) > max) max = c.order; });
      data.categories.push({ id: DB.uid('cat'), name: name, emoji: emoji, order: max + 1 });
    }
    persist(); renderCats(); renderItems(); closeModal('catModal');
    toast('Categoria salva! ✅', 'ok');
  }

  function deleteCat(id) {
    var n = itemsOf(id).length;
    if (n > 0) { toast('Esta categoria tem ' + n + ' item(ns). Mova ou apague os itens antes.', 'err'); return; }
    var cat = null;
    data.categories.forEach(function (c) { if (c.id === id) cat = c; });
    if (!cat) return;
    if (!window.confirm('Apagar a categoria "' + cat.name + '"?')) return;
    data.categories = data.categories.filter(function (c) { return c.id !== id; });
    persist(); renderCats();
    toast('Categoria apagada.', 'ok');
  }

  /* ================= ITENS ================= */

  function thumbHtml(it) {
    if (it.img) {
      return '<img class="thumb" src="' + esc(it.img) + '" alt="" onerror="this.outerHTML=\'<span class=&quot;thumb-fallback&quot;>' + esc(it.emoji || '🍢') + '</span>\'">';
    }
    return '<span class="thumb-fallback">' + esc(it.emoji || '🍢') + '</span>';
  }

  function renderItems() {
    var q = ($('itemSearch').value || '').trim().toLowerCase();
    var cats = sortedCats();
    var html = '';
    cats.forEach(function (cat) {
      var items = itemsOf(cat.id);
      if (q) {
        items = items.filter(function (it) {
          return (it.name + ' ' + (it.desc || '')).toLowerCase().indexOf(q) > -1;
        });
      }
      if (!items.length) return;
      html += '<div class="item-group"><h4>' + esc(cat.emoji || '') + ' ' + esc(cat.name) + '</h4>';
      items.forEach(function (it) {
        var avail = it.available !== false;
        html += '<div class="item-row' + (avail ? '' : ' off') + '">' +
          thumbHtml(it) +
          '<div class="nm"><b>' + esc(it.name) + '</b><span>' + esc(DB.money(it.price)) + '</span>' +
          (avail ? '' : ' <small>• esgotado</small>') + '</div>' +
          '<button class="mini-btn" data-item-up="' + it.id + '" title="Subir">⬆️</button>' +
          '<button class="mini-btn" data-item-down="' + it.id + '" title="Descer">⬇️</button>' +
          '<button class="mini-btn ' + (avail ? 'green' : '') + '" data-item-toggle="' + it.id + '" title="Disponível/Esgotado">' + (avail ? '✅' : '🚫') + '</button>' +
          '<button class="mini-btn" data-item-edit="' + it.id + '">✏️</button>' +
          '<button class="mini-btn red" data-item-del="' + it.id + '">🗑️</button>' +
        '</div>';
      });
      html += '</div>';
    });
    $('itemList').innerHTML = html || '<p class="muted">Nenhum item encontrado.</p>';

    function bind(attr, fn) {
      $('itemList').querySelectorAll('[' + attr + ']').forEach(function (b) {
        b.onclick = function () { fn(b.getAttribute(attr)); };
      });
    }
    bind('data-item-edit', openItemModal);
    bind('data-item-del', deleteItem);
    bind('data-item-toggle', toggleItem);
    bind('data-item-up', function (id) { moveItem(id, -1); });
    bind('data-item-down', function (id) { moveItem(id, 1); });
  }

  function findItem(id) {
    for (var i = 0; i < data.items.length; i++) if (data.items[i].id === id) return data.items[i];
    return null;
  }

  function moveItem(id, dir) {
    var it = findItem(id);
    if (!it) return;
    var sibs = itemsOf(it.catId);
    var i = -1;
    sibs.forEach(function (s, idx) { if (s.id === id) i = idx; });
    var j = i + dir;
    if (i < 0 || j < 0 || j >= sibs.length) return;
    var tmp = sibs[i].order; sibs[i].order = sibs[j].order; sibs[j].order = tmp;
    persist(); renderItems();
  }

  function toggleItem(id) {
    var it = findItem(id);
    if (!it) return;
    it.available = !(it.available !== false);
    persist(); renderItems(); renderHome();
    toast(it.available ? '✅ ' + it.name + ' disponível!' : '🚫 ' + it.name + ' marcado como esgotado.', 'ok');
  }

  function deleteItem(id) {
    var it = findItem(id);
    if (!it) return;
    if (!window.confirm('Apagar "' + it.name + '" do cardápio?')) return;
    data.items = data.items.filter(function (x) { return x.id !== id; });
    persist(); renderItems(); renderCats(); renderHome();
    toast('Item apagado.', 'ok');
  }

  function openItemModal(id) {
    editingItemId = id || null;
    var it = id ? findItem(id) : null;
    $('itemModalTitle').textContent = it ? 'Editar item' : 'Novo item';

    var cats = sortedCats();
    var opts = cats.map(function (c) {
      var sel = it && it.catId === c.id ? ' selected' : '';
      return '<option value="' + c.id + '"' + sel + '>' + esc((c.emoji || '') + ' ' + c.name) + '</option>';
    }).join('');
    $('i_cat').innerHTML = opts || '<option value="">(crie uma categoria antes)</option>';

    $('i_name').value = it ? it.name : '';
    $('i_price').value = it ? inputPrice(it.price) : '';
    $('i_desc').value = it ? (it.desc || '') : '';
    $('i_badge').value = it ? (it.badge || '') : '';
    $('i_emoji').value = it ? (it.emoji || '') : '';
    $('i_available').value = it && it.available === false ? '0' : '1';
    $('i_url').value = it && it.img && it.img.indexOf('data:') !== 0 && it.img.indexOf('assets/') !== 0 ? it.img : '';
    $('i_file').value = '';
    $('i_gallery').classList.add('hidden');
    setItemPhoto(it ? (it.img || '') : '');
    openModal('itemModal');
  }

  function setItemPhoto(val) {
    itemPhotoValue = val || '';
    var img = $('i_preview');
    var emo = $('i_previewEmoji');
    if (itemPhotoValue) {
      img.src = itemPhotoValue;
      img.style.display = '';
      emo.style.display = 'none';
      img.onerror = function () { img.style.display = 'none'; emo.style.display = ''; };
    } else {
      img.style.display = 'none';
      emo.style.display = '';
    }
    emo.textContent = $('i_emoji').value.trim() || '🍢';
  }

  function saveItem() {
    var name = $('i_name').value.trim();
    var catId = $('i_cat').value;
    var price = DB.parsePrice($('i_price').value);
    if (!name) { toast('Dê um nome para o item.', 'err'); return; }
    if (!catId) { toast('Crie uma categoria antes de adicionar itens.', 'err'); return; }
    if (!(price > 0)) { toast('Digite um preço válido (ex: 12,90).', 'err'); return; }

    var url = $('i_url').value.trim();
    var photo = url || itemPhotoValue;

    if (editingItemId) {
      var it = findItem(editingItemId);
      if (it) {
        it.name = name; it.catId = catId; it.price = price;
        it.desc = $('i_desc').value.trim();
        it.badge = $('i_badge').value.trim();
        it.emoji = $('i_emoji').value.trim() || '🍢';
        it.available = $('i_available').value === '1';
        it.img = photo;
      }
    } else {
      var max = 0;
      itemsOf(catId).forEach(function (x) { if ((x.order || 0) > max) max = x.order; });
      data.items.push({
        id: DB.uid('item'), catId: catId, name: name, price: price,
        desc: $('i_desc').value.trim(),
        badge: $('i_badge').value.trim(),
        emoji: $('i_emoji').value.trim() || '🍢',
        available: $('i_available').value === '1',
        img: photo, order: max + 1
      });
    }
    persist(); renderItems(); renderCats(); renderHome(); closeModal('itemModal');
    toast('Item salvo! ✅', 'ok');
  }

  /* ---------- foto: upload com compressão ---------- */

  function fileToDataURL(file, maxSize, quality, cb) {
    if (!file || file.type.indexOf('image/') !== 0) { toast('Escolha um arquivo de imagem.', 'err'); return; }
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        try {
          var w = img.width, h = img.height;
          var scale = Math.min(1, (maxSize || 900) / Math.max(w, h));
          var cw = Math.round(w * scale), ch = Math.round(h * scale);
          var canvas = document.createElement('canvas');
          canvas.width = cw; canvas.height = ch;
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, cw, ch);
          cb(canvas.toDataURL('image/jpeg', quality || 0.75));
        } catch (e) {
          cb(reader.result);
        }
      };
      img.onerror = function () { toast('Não consegui ler essa imagem.', 'err'); };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function buildGallery(containerId, current, onPick) {
    var box = $(containerId);
    box.innerHTML = DB.GALLERY.map(function (g) {
      return '<img src="' + esc(g) + '" data-g="' + esc(g) + '" class="' + (g === current ? 'sel' : '') + '" alt="">';
    }).join('');
    box.querySelectorAll('img').forEach(function (im) {
      im.onclick = function () { onPick(im.getAttribute('data-g')); };
    });
  }

  /* ================= BACKUP / SENHA ================= */

  function download(filename, text) {
    var blob = new Blob([text], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function doExport() {
    var name = 'backup-' + (data.store.name || 'espetaria').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.json';
    download(name, DB.exportJSON(data));
    toast('Backup baixado! Guarde com carinho. 💾', 'ok');
  }

  function doImport(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        data = DB.importJSON(reader.result);
        persist(); refreshAll();
        toast('Backup restaurado com sucesso! ✅', 'ok');
      } catch (e) {
        toast('Arquivo inválido. Escolha um backup válido.', 'err');
      }
    };
    reader.readAsText(file);
  }

  function doReset() {
    if (!window.confirm('⚠️ ATENÇÃO: isso apaga TUDO e volta ao modelo inicial. Continuar?')) return;
    if (!window.confirm('Tem certeza absoluta? Essa ação não tem volta (a não ser que tenha backup).')) return;
    data = DB.reset();
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ignora */ }
    location.reload();
  }

  function changePassword() {
    var p1 = $('pw1').value || '', p2 = $('pw2').value || '';
    if (p1.length < 4) { toast('A senha precisa de pelo menos 4 caracteres.', 'err'); return; }
    if (p1 !== p2) { toast('As senhas não conferem.', 'err'); return; }
    data.admin.passHash = DB.hashPass(p1);
    persist();
    $('pw1').value = ''; $('pw2').value = '';
    toast('Senha trocada com sucesso! 🔑', 'ok');
  }

  /* ================= EVENTOS ================= */

  function bindEvents() {
    $('loginBtn').onclick = doLogin;
    $('loginPass').addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });
    $('logoutBtn').onclick = function () {
      try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ignora */ }
      location.reload();
    };

    $('tabs').querySelectorAll('button').forEach(function (b) {
      b.onclick = function () { switchTab(b.getAttribute('data-tab')); };
    });

    $('forceOpenBtn').onclick = function () { data.store.forceStatus = 'open'; persist(); renderHome(); toast('🟢 Loja aberta!', 'ok'); };
    $('forceCloseBtn').onclick = function () { data.store.forceStatus = 'closed'; persist(); renderHome(); toast('🔴 Loja fechada.', 'ok'); };
    $('forceAutoBtn').onclick = function () { data.store.forceStatus = 'auto'; persist(); renderHome(); toast('⏰ Modo automático ativado.', 'ok'); };
    $('goStoreBtn').onclick = function () { switchTab('store'); };
    $('goMenuBtn').onclick = function () { switchTab('menu'); openItemModal(null); };

    $('saveStoreBtn').onclick = saveStoreForm;

    $('f_heroFile').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      fileToDataURL(f, 1200, 0.78, function (url) {
        heroPhotoValue = url;
        $('f_heroPreview').src = url;
        toast('Foto da capa atualizada! Não esqueça de salvar. 📸', 'ok');
      });
    });
    $('f_heroGallery').onclick = function () {
      buildGallery('heroGallery', heroPhotoValue, function (g) {
        heroPhotoValue = g;
        $('f_heroPreview').src = g;
        closeModal('galleryModal');
      });
      openModal('galleryModal');
    };
    $('f_heroDefault').onclick = function () {
      heroPhotoValue = 'assets/img/hero.jpg';
      $('f_heroPreview').src = heroPhotoValue;
    };

    $('addCatBtn').onclick = function () { openCatModal(null); };
    $('saveCatBtn').onclick = saveCat;

    $('addItemBtn').onclick = function () { openItemModal(null); };
    $('saveItemBtn').onclick = saveItem;
    $('itemSearch').addEventListener('input', renderItems);

    $('i_file').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      fileToDataURL(f, 800, 0.75, function (url) {
        $('i_url').value = '';
        setItemPhoto(url);
        toast('Foto carregada! 📸', 'ok');
      });
    });
    $('i_url').addEventListener('input', function () {
      var v = $('i_url').value.trim();
      if (v) setItemPhoto(v);
    });
    $('i_emoji').addEventListener('input', function () { setItemPhoto(itemPhotoValue); });
    $('i_noPhotoBtn').onclick = function () { $('i_url').value = ''; $('i_file').value = ''; setItemPhoto(''); };
    $('i_galleryBtn').onclick = function () {
      var g = $('i_gallery');
      if (g.classList.contains('hidden')) {
        buildGallery('i_gallery', itemPhotoValue, function (src) {
          $('i_url').value = '';
          setItemPhoto(src);
          g.classList.add('hidden');
        });
        g.classList.remove('hidden');
      } else g.classList.add('hidden');
    };

    $('exportBtn').onclick = doExport;
    $('importFile').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (f) doImport(f);
      e.target.value = '';
    });
    $('resetBtn').onclick = doReset;
    $('changePwBtn').onclick = changePassword;

    document.querySelectorAll('[data-close]').forEach(function (b) {
      b.onclick = function () { closeModal(b.getAttribute('data-close')); };
    });
    document.querySelectorAll('.overlay').forEach(function (ov) {
      ov.addEventListener('click', function (e) { if (e.target === ov) closeModal(ov.id); });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        ['catModal', 'itemModal', 'galleryModal'].forEach(closeModal);
      }
    });

    window.addEventListener('storage', function () {
      if (isLogged()) { data = DB.load(); persist(); refreshAll(); }
    });
  }

  /* ================= INIT ================= */

  bindEvents();
  if (isLogged()) showPanel();
  else {
    setTimeout(function () { $('loginPass').focus(); }, 100);
    document.title = 'Painel do Dono — ' + data.store.name;
  }
})();
