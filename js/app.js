/* ============================================================
   Espetaria — Loja (cardápio, sacola, pedido via WhatsApp)
   ============================================================ */
(function () {
  'use strict';

  var DB = window.EspetariaDB;
  var esc = DB.escapeHtml;

  var data = DB.load();
  var cart = DB.loadCart(); // [{id, qty, obs}]
  var modalItemId = null;
  var modalQty = 1;
  var orderType = 'entrega';

  /* ---------- helpers ---------- */

  function $(id) { return document.getElementById(id); }

  function toast(msg, type) {
    var box = $('toasts');
    var el = document.createElement('div');
    el.className = 'toast ' + (type || '');
    el.innerHTML = (type === 'ok' ? '✅ ' : type === 'err' ? '⚠️ ' : 'ℹ️ ') + esc(msg);
    box.appendChild(el);
    setTimeout(function () {
      el.classList.add('out');
      setTimeout(function () { el.remove(); }, 350);
    }, 2800);
  }

  function openModal(id) { $(id).classList.add('show'); document.body.style.overflow = 'hidden'; }
  function closeModal(id) { $(id).classList.remove('show'); document.body.style.overflow = ''; }

  function findItem(id) {
    for (var i = 0; i < data.items.length; i++) if (data.items[i].id === id) return data.items[i];
    return null;
  }

  function sortedCats() {
    return data.categories.slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
  }

  function itemsOf(catId) {
    return data.items
      .filter(function (it) { return it.catId === catId; })
      .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
  }

  function photoHtml(item, cls) {
    if (item.img) {
      return '<img class="' + (cls || '') + '" src="' + esc(item.img) + '" alt="' + esc(item.name) + '" loading="lazy" onerror="this.outerHTML=\'<div class=&quot;fallback&quot;>' + esc(item.emoji || '🍢') + '</div>\'">';
    }
    return '<div class="fallback">' + esc(item.emoji || '🍢') + '</div>';
  }

  /* ---------- topo / capa / rodapé ---------- */

  function renderStore() {
    var s = data.store;
    document.title = s.name + ' — Cardápio Digital';
    $('logoEmoji').textContent = s.logoEmoji || '🍢';
    $('storeName').textContent = s.name;
    $('heroName').textContent = s.name;
    $('heroTagline').textContent = s.tagline || '';

    var hero = $('heroImg');
    hero.style.display = '';
    hero.src = s.heroImage || 'assets/img/hero.jpg';

    var st = DB.isOpen(s);
    var badge = $('storeStatus');
    badge.className = 'status ' + (st.open ? 'open' : 'closed');
    $('storeStatusText').textContent = st.label;

    var fee = Number(s.deliveryFee) || 0;
    var chips = [];
    chips.push('<span class="chip">🛵 ' + esc(s.deliveryTime || 'Consulte o prazo') + '</span>');
    if (fee === 0) chips.push('<span class="chip free">🎉 Entrega grátis</span>');
    else chips.push('<span class="chip">💰 Entrega ' + esc(DB.money(fee)) + '</span>');
    if (Number(s.freeDeliveryFrom) > 0 && fee > 0) {
      chips.push('<span class="chip free">🎉 Grátis acima de ' + esc(DB.money(s.freeDeliveryFrom)) + '</span>');
    }
    chips.push('<span class="chip">🕒 ' + esc((s.hoursOpen || '--:--') + '–' + (s.hoursClose || '--:--')) + '</span>');
    $('infoChips').innerHTML = chips.join('');

    var f = [];
    f.push('<h5>📍 ' + esc(s.name) + '</h5>');
    if (s.address) {
      if (s.mapsUrl) f.push('<p>📌 <a href="' + esc(s.mapsUrl) + '" target="_blank" rel="noopener">' + esc(s.address) + ' (ver no mapa)</a></p>');
      else f.push('<p>📌 ' + esc(s.address) + '</p>');
    }
    f.push('<p>🕒 ' + esc(DB.hoursLabel(s)) + '</p>');
    if (s.payments && s.payments.length) f.push('<p>💳 Aceitamos: ' + esc(s.payments.join(' • ')) + '</p>');
    if (s.instagram) {
      var ig = String(s.instagram).replace('@', '');
      f.push('<p>📸 <a href="https://instagram.com/' + esc(ig) + '" target="_blank" rel="noopener">@' + esc(ig) + '</a></p>');
    }
    f.push('<a class="admin-link" href="admin.html">⚙️ Área do dono</a>');
    $('storeFooter').innerHTML = f.join('');
  }

  /* ---------- cardápio ---------- */

  function renderMenu() {
    var q = $('searchInput').value.trim().toLowerCase();
    var cats = sortedCats();
    var nav = [];
    var html = [];

    cats.forEach(function (cat) {
      var items = itemsOf(cat.id);
      if (q) {
        items = items.filter(function (it) {
          return (it.name + ' ' + (it.desc || '')).toLowerCase().indexOf(q) > -1;
        });
      }
      if (!items.length) return;
      nav.push('<a href="#cat-' + cat.id + '" data-cat="' + cat.id + '">' + esc(cat.emoji || '') + ' ' + esc(cat.name) + '</a>');
      html.push('<section class="menu-section" id="cat-' + cat.id + '">');
      html.push('<h3>' + esc(cat.emoji || '') + ' ' + esc(cat.name) + ' <span class="count">' + items.length + '</span></h3>');
      html.push('<div class="items">');
      items.forEach(function (it) {
        var avail = it.available !== false;
        html.push(
          '<article class="item' + (avail ? '' : ' unavailable') + '" data-item="' + it.id + '">' +
            '<div class="item-info">' +
              '<h4>' + esc(it.name) + '</h4>' +
              (it.badge ? '<span class="badge">' + esc(it.badge) + '</span>' : '') +
              (it.desc ? '<p class="desc">' + esc(it.desc) + '</p>' : '') +
              '<p class="price">' + esc(DB.money(it.price)) + '</p>' +
            '</div>' +
            '<div class="item-photo">' + photoHtml(it) +
              (avail
                ? '<button class="add-btn" data-add="' + it.id + '" aria-label="Adicionar">+</button>'
                : '<span class="soldout">ESGOTADO</span>') +
            '</div>' +
          '</article>'
        );
      });
      html.push('</div></section>');
    });

    $('catNav').innerHTML = nav.join('');
    $('menu').innerHTML = html.length
      ? html.join('')
      : '<div class="empty-menu"><div class="big">🔍</div><p>Nenhum item encontrado.<br>Tente buscar por outra palavra.</p></div>';
    markActiveNav();
  }

  function markActiveNav() {
    var links = $('catNav').querySelectorAll('a');
    if (!links.length) return;
    var current = null;
    var sections = document.querySelectorAll('.menu-section');
    for (var i = 0; i < sections.length; i++) {
      var r = sections[i].getBoundingClientRect();
      if (r.top <= 160) current = sections[i].id;
    }
    for (var j = 0; j < links.length; j++) {
      var href = links[j].getAttribute('href');
      links[j].classList.toggle('active', href === '#' + current || (!current && j === 0));
    }
  }

  /* ---------- modal do item ---------- */

  function openItem(id) {
    var it = findItem(id);
    if (!it || it.available === false) return;
    modalItemId = id;
    modalQty = 1;
    $('itemQty').textContent = '1';
    $('itemModalBody').innerHTML =
      '<div class="item-modal-photo">' + photoHtml(it) + '</div>' +
      '<h4 class="item-modal-name">' + esc(it.name) + '</h4>' +
      (it.badge ? '<span class="badge">' + esc(it.badge) + '</span>' : '') +
      (it.desc ? '<p class="item-modal-desc">' + esc(it.desc) + '</p>' : '') +
      '<p class="item-modal-name" style="color:var(--gold);margin-top:10px">' + esc(DB.money(it.price)) + '</p>' +
      '<div class="field"><label for="itemObs">Alguma observação? (opcional)</label>' +
      '<textarea id="itemObs" placeholder="Ex: sem cebola, ponto bem passado, gelo e limão..."></textarea></div>';
    updateItemBtn();
    openModal('itemModal');
  }

  function updateItemBtn() {
    var it = findItem(modalItemId);
    if (!it) return;
    $('itemAddBtn').textContent = 'Adicionar • ' + DB.money(Number(it.price) * modalQty);
  }

  function addToCart(id, qty, obs) {
    var key = id + '||' + (obs || '');
    var found = null;
    for (var i = 0; i < cart.length; i++) {
      if ((cart[i].id + '||' + (cart[i].obs || '')) === key) { found = cart[i]; break; }
    }
    if (found) found.qty += qty;
    else cart.push({ id: id, qty: qty, obs: obs || '' });
    DB.saveCart(cart);
    renderCartBar();
  }

  /* ---------- sacola ---------- */

  function cartDetailed() {
    var out = [];
    cart.forEach(function (entry, idx) {
      var item = findItem(entry.id);
      if (!item) return;
      out.push({ idx: idx, item: item, qty: entry.qty, obs: entry.obs });
    });
    return out;
  }

  function cartTotals() {
    var sub = 0, count = 0;
    cartDetailed().forEach(function (l) {
      sub += Number(l.item.price) * l.qty;
      count += l.qty;
    });
    var fee = 0;
    if (orderType === 'entrega') {
      fee = Number(data.store.deliveryFee) || 0;
      if (Number(data.store.freeDeliveryFrom) > 0 && sub >= Number(data.store.freeDeliveryFrom)) fee = 0;
    }
    return { subtotal: sub, fee: fee, total: sub + fee, count: count };
  }

  function renderCartBar() {
    var t = cartTotals();
    $('cartBarQty').textContent = t.count;
    $('cartBarTotal').textContent = DB.money(t.total);
    $('cartBar').classList.toggle('show', t.count > 0);
  }

  function renderCartModal() {
    var lines = cartDetailed();
    var body = $('cartModalBody');

    if (!lines.length) {
      body.innerHTML = '<div class="empty-cart"><div class="big">🛒</div><p><b>Sua sacola está vazia</b></p><p>Que tal um espetinho na brasa agora? 🔥</p></div>';
      return;
    }

    var t = cartTotals();
    var s = data.store;
    var html = [];

    // itens
    lines.forEach(function (l) {
      html.push(
        '<div class="cart-line" data-idx="' + l.idx + '">' +
          '<div class="info"><b>' + l.qty + 'x ' + esc(l.item.name) + '</b>' +
          (l.obs ? '<small>Obs: ' + esc(l.obs) + '</small>' : '') +
          '<span class="unit">' + esc(DB.money(l.item.price)) + ' cada</span></div>' +
          '<div class="mini-stepper">' +
            '<button data-dec="' + l.idx + '">−</button><span>' + l.qty + '</span><button data-inc="' + l.idx + '">+</button>' +
          '</div>' +
          '<button class="remove-btn" data-del="' + l.idx + '" title="Remover">🗑️</button>' +
        '</div>'
      );
    });

    // totais
    html.push('<div class="totals">');
    html.push('<div><span>Subtotal</span><span>' + esc(DB.money(t.subtotal)) + '</span></div>');
    if (orderType === 'entrega') {
      html.push('<div><span>Taxa de entrega</span><span>' + (t.fee === 0 ? 'Grátis 🎉' : esc(DB.money(t.fee))) + '</span></div>');
    }
    html.push('<div class="grand"><span>Total</span><span>' + esc(DB.money(t.total)) + '</span></div>');
    html.push('</div>');

    // tipo
    html.push('<div class="field"><label>Como você quer receber?</label><div class="seg">' +
      '<button id="segEntrega" class="' + (orderType === 'entrega' ? 'on' : '') + '">🛵 Entrega</button>' +
      '<button id="segRetirada" class="' + (orderType === 'retirada' ? 'on' : '') + '">🏃 Retirada</button>' +
      '</div></div>');

    // dados
    html.push('<div class="field-row"><div class="field"><label for="cName">Seu nome *</label><input id="cName" placeholder="Ex: Maria Silva"></div></div>');
    html.push('<div class="field"><label for="cPhone">Seu telefone/WhatsApp</label><input id="cPhone" inputmode="tel" placeholder="Ex: (83) 99999-9999"></div>');
    html.push('<div id="addrBlock"' + (orderType === 'entrega' ? '' : ' class="hidden"') + '>');
    html.push('<div class="field"><label for="cAddr">Endereço de entrega *</label><input id="cAddr" placeholder="Rua, número, bairro"></div>');
    html.push('<div class="field"><label for="cRef">Ponto de referência</label><input id="cRef" placeholder="Ex: perto da praça, casa azul"></div>');
    html.push('</div>');

    // pagamento
    var pays = (s.payments && s.payments.length) ? s.payments : ['Pix'];
    html.push('<div class="field"><label for="cPay">Forma de pagamento *</label><select id="cPay">');
    pays.forEach(function (p) { html.push('<option>' + esc(p) + '</option>'); });
    html.push('</select></div>');
    html.push('<div class="field hidden" id="changeBlock"><label for="cChange">Troco para quanto?</label><input id="cChange" inputmode="decimal" placeholder="Ex: R$ 50,00"></div>');
    if (s.pixKey) html.push('<div class="notice ok" id="pixNotice">🔑 <span>Chave Pix da loja: <b>' + esc(s.pixKey) + '</b></span></div>');
    html.push('<div class="field"><label for="cNotes">Observações do pedido</label><textarea id="cNotes" placeholder="Ex: pode demorar, troco, sem gelo..."></textarea></div>');

    // avisos
    var st = DB.isOpen(s);
    if (!st.open) html.push('<div class="notice warn">⏰ <span><b>' + esc(st.label) + '.</b> Você pode enviar o pedido mesmo assim, mas a loja pode responder depois.</span></div>');
    if (!DB.onlyDigits(s.whatsapp)) {
      html.push('<div class="notice err">⚠️ <span>A loja ainda não configurou o WhatsApp para receber pedidos. Fale com o atendente.</span></div>');
    }

    html.push('<div class="checkout-actions">');
    html.push('<button class="btn btn-green" id="sendOrderBtn">📲 Enviar pedido no WhatsApp</button>');
    html.push('<button class="btn btn-ghost" id="copyOrderBtn">📋 Copiar texto do pedido</button>');
    html.push('</div>');

    body.innerHTML = html.join('');

    // eventos internos
    $('segEntrega').onclick = function () { orderType = 'entrega'; renderCartModal(); renderCartBar(); };
    $('segRetirada').onclick = function () { orderType = 'retirada'; renderCartModal(); renderCartBar(); };

    body.querySelectorAll('[data-inc]').forEach(function (b) {
      b.onclick = function () { cart[+b.getAttribute('data-inc')].qty++; DB.saveCart(cart); renderCartModal(); renderCartBar(); };
    });
    body.querySelectorAll('[data-dec]').forEach(function (b) {
      b.onclick = function () {
        var i = +b.getAttribute('data-dec');
        cart[i].qty--;
        if (cart[i].qty <= 0) cart.splice(i, 1);
        DB.saveCart(cart); renderCartModal(); renderCartBar();
      };
    });
    body.querySelectorAll('[data-del]').forEach(function (b) {
      b.onclick = function () {
        cart.splice(+b.getAttribute('data-del'), 1);
        DB.saveCart(cart); renderCartModal(); renderCartBar();
      };
    });

    var paySel = $('cPay');
    var toggleChange = function () {
      var v = paySel.value.toLowerCase();
      $('changeBlock').classList.toggle('hidden', v.indexOf('dinheiro') === -1);
      var pix = $('pixNotice');
      if (pix) pix.style.display = v.indexOf('pix') > -1 ? '' : 'none';
    };
    paySel.onchange = toggleChange;
    toggleChange();

    $('sendOrderBtn').onclick = sendOrder;
    $('copyOrderBtn').onclick = copyOrder;
  }

  function collectCustomer() {
    var name = ($('cName').value || '').trim();
    var phone = ($('cPhone').value || '').trim();
    var pay = $('cPay').value;
    var addr = '', ref = '';
    if (orderType === 'entrega') {
      addr = ($('cAddr').value || '').trim();
      ref = ($('cRef').value || '').trim();
    }
    var changeFor = '';
    if (pay.toLowerCase().indexOf('dinheiro') > -1) changeFor = ($('cChange').value || '').trim();
    var notes = ($('cNotes').value || '').trim();
    return {
      name: name, phone: phone, type: orderType, payment: pay,
      address: ref ? addr + ' (' + ref + ')' : addr,
      changeFor: changeFor, notes: notes
    };
  }

  function validateCustomer(c) {
    if (!c.name) { toast('Digite seu nome para enviar o pedido.', 'err'); $('cName').focus(); return false; }
    if (c.type === 'entrega' && !c.address) { toast('Digite o endereço de entrega.', 'err'); $('cAddr').focus(); return false; }
    return true;
  }

  function sendOrder() {
    if (!DB.onlyDigits(data.store.whatsapp)) {
      toast('A loja ainda não configurou o WhatsApp.', 'err');
      return;
    }
    var c = collectCustomer();
    if (!validateCustomer(c)) return;
    var msg = DB.buildOrderMessage(data, cart, c);
    window.open(DB.whatsappLink(data, msg), '_blank');
    toast('Pedido enviado! A loja vai te responder no WhatsApp. 😋', 'ok');
    cart = [];
    DB.clearCart();
    renderCartBar();
    renderCartModal();
  }

  function copyOrder() {
    var c = collectCustomer();
    if (!validateCustomer(c)) return;
    var msg = DB.buildOrderMessage(data, cart, c);
    var done = function () { toast('Pedido copiado! Cole no WhatsApp da loja. 📋', 'ok'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(msg).then(done, function () { fallbackCopy(msg); done(); });
    } else { fallbackCopy(msg); done(); }
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* ignora */ }
    ta.remove();
  }

  /* ---------- eventos globais ---------- */

  function bindEvents() {
    $('searchInput').addEventListener('input', renderMenu);
    window.addEventListener('scroll', markActiveNav, { passive: true });

    $('menu').addEventListener('click', function (e) {
      var addBtn = e.target.closest('[data-add]');
      if (addBtn) {
        e.stopPropagation();
        var it = findItem(addBtn.getAttribute('data-add'));
        if (it && it.available !== false) {
          addToCart(it.id, 1, '');
          toast('1x ' + it.name + ' na sacola! 🛒', 'ok');
        }
        return;
      }
      var card = e.target.closest('[data-item]');
      if (card) openItem(card.getAttribute('data-item'));
    });

    $('catNav').addEventListener('click', function (e) {
      var a = e.target.closest('a');
      if (!a) return;
      e.preventDefault();
      var target = document.querySelector(a.getAttribute('href'));
      if (target) target.scrollIntoView({ behavior: 'smooth' });
      var links = $('catNav').querySelectorAll('a');
      links.forEach(function (l) { l.classList.remove('active'); });
      a.classList.add('active');
    });

    $('itemMinus').onclick = function () { if (modalQty > 1) { modalQty--; $('itemQty').textContent = modalQty; updateItemBtn(); } };
    $('itemPlus').onclick = function () { if (modalQty < 50) { modalQty++; $('itemQty').textContent = modalQty; updateItemBtn(); } };
    $('itemAddBtn').onclick = function () {
      var obs = ($('itemObs').value || '').trim();
      addToCart(modalItemId, modalQty, obs);
      closeModal('itemModal');
      var it = findItem(modalItemId);
      toast(modalQty + 'x ' + (it ? it.name : 'item') + ' na sacola! 🛒', 'ok');
    };

    $('cartBarBtn').onclick = function () { renderCartModal(); openModal('cartModal'); };

    document.querySelectorAll('[data-close]').forEach(function (b) {
      b.onclick = function () { closeModal(b.getAttribute('data-close')); };
    });
    document.querySelectorAll('.overlay').forEach(function (ov) {
      ov.addEventListener('click', function (e) { if (e.target === ov) closeModal(ov.id); });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeModal('itemModal'); closeModal('cartModal'); }
    });

    // atualiza status de aberto/fechado a cada minuto e recarrega dados se mudarem em outra aba
    setInterval(function () { data = DB.load(); renderStore(); }, 60000);
    window.addEventListener('storage', function (e) {
      if (e.key === null || (e.key && e.key.indexOf('espetaria_') === 0)) {
        data = DB.load();
        cart = DB.loadCart();
        renderStore(); renderMenu(); renderCartBar();
      }
    });
  }

  /* ---------- init ---------- */

  renderStore();
  renderMenu();
  renderCartBar();
  bindEvents();
})();
