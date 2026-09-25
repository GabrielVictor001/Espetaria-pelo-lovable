/* ============================================================
   Espetaria — dados, persistência e utilidades (loja + admin)
   Funciona 100% no navegador (localStorage). Sem build, sem servidor.
   ============================================================ */
(function (global) {
  'use strict';

  var KEY = 'espetaria_data_v1';
  var CART_KEY = 'espetaria_cart_v1';

  /* ---------- utilidades ---------- */

  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  }

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function money(v) {
    var n = Number(v);
    if (isNaN(n)) n = 0;
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  /** Converte texto digitado ("12,90" / "R$ 12.90") em número */
  function parsePrice(str) {
    if (typeof str === 'number') return str;
    if (!str) return 0;
    var s = String(str).replace(/[^\d.,]/g, '');
    if (!s) return 0;
    if (s.indexOf(',') > -1) {
      s = s.replace(/\./g, '').replace(',', '.');
    }
    var n = parseFloat(s);
    return isNaN(n) ? 0 : Math.round(n * 100) / 100;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** Hash simples (não-criptográfico) só para não deixar a senha em texto puro. */
  function hashPass(str) {
    var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    var s = 'espetaria::' + String(str == null ? '' : str);
    for (var i = 0; i < s.length; i++) {
      var ch = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(16) + (h1 >>> 0).toString(16);
  }

  function onlyDigits(s) {
    return String(s == null ? '' : s).replace(/\D/g, '');
  }

  /* ---------- dados iniciais ---------- */

  var GALLERY = [
    'assets/img/espeto-carne.jpg',
    'assets/img/espeto-frango.jpg',
    'assets/img/queijo-coalho.jpg',
    'assets/img/porcao.jpg',
    'assets/img/bebida.jpg',
    'assets/img/hero.jpg'
  ];

  function defaultData() {
    return {
      version: 1,
      store: {
        name: 'Minha Espetaria',
        tagline: 'Espetinhos na brasa, cerveja gelada e aquele atendimento de família.',
        whatsapp: '',
        address: 'Rua das Brasas, 123 — Centro',
        mapsUrl: '',
        instagram: '',
        deliveryFee: 5.0,
        freeDeliveryFrom: 0,
        deliveryTime: '30–50 min',
        pixKey: '',
        payments: ['Pix', 'Cartão na entrega', 'Dinheiro'],
        hoursOpen: '18:00',
        hoursClose: '23:00',
        daysOpen: [0, 1, 2, 3, 4, 5, 6],
        forceStatus: 'auto',
        logoEmoji: '🍢',
        heroImage: 'assets/img/hero.jpg'
      },
      categories: [
        { id: 'cat_esp', name: 'Espetinhos', emoji: '🍢', order: 1 },
        { id: 'cat_porc', name: 'Porções', emoji: '🍟', order: 2 },
        { id: 'cat_beb', name: 'Bebidas', emoji: '🍺', order: 3 },
        { id: 'cat_sob', name: 'Sobremesas', emoji: '🍨', order: 4 }
      ],
      items: [
        { id: 'item_carne', catId: 'cat_esp', name: 'Espetinho de Carne', desc: 'Contra-filé macio, temperado na casa e feito na brasa.', price: 12.9, img: 'assets/img/espeto-carne.jpg', emoji: '🥩', badge: 'Mais pedido', available: true, order: 1 },
        { id: 'item_frango', catId: 'cat_esp', name: 'Espetinho de Frango c/ Bacon', desc: 'Cubos de frango suculentos enrolados no bacon crocante.', price: 11.9, img: 'assets/img/espeto-frango.jpg', emoji: '🍗', badge: '', available: true, order: 2 },
        { id: 'item_queijo', catId: 'cat_esp', name: 'Queijo Coalho na Brasa', desc: 'Queijo coalho dourado com orégano e fio de mel.', price: 10.9, img: 'assets/img/queijo-coalho.jpg', emoji: '🧀', badge: '', available: true, order: 3 },
        { id: 'item_linguica', catId: 'cat_esp', name: 'Espetinho de Linguiça', desc: 'Linguiça toscana suculenta, direto da brasa.', price: 10.9, img: 'assets/img/espeto-carne.jpg', emoji: '🌭', badge: '', available: true, order: 4 },
        { id: 'item_coracao', catId: 'cat_esp', name: 'Espetinho de Coração', desc: 'Coração de frango bem temperado, o queridinho do bar.', price: 9.9, img: 'assets/img/espeto-frango.jpg', emoji: '🍗', badge: '', available: true, order: 5 },
        { id: 'item_misto', catId: 'cat_esp', name: 'Espetinho Misto da Casa', desc: 'Carne, frango, linguiça, pimentão e cebola no mesmo espeto.', price: 13.9, img: 'assets/img/espeto-carne.jpg', emoji: '🍢', badge: '', available: true, order: 6 },
        { id: 'item_batata', catId: 'cat_porc', name: 'Batata Frita c/ Cheddar e Bacon', desc: 'Porção generosa para dividir (serve 2–3 pessoas).', price: 29.9, img: 'assets/img/porcao.jpg', emoji: '🍟', badge: 'Para dividir', available: true, order: 1 },
        { id: 'item_mandioca', catId: 'cat_porc', name: 'Mandioca Frita', desc: 'Crocante por fora, macia por dentro, com manteiga da terra.', price: 22.9, img: 'assets/img/porcao.jpg', emoji: '🥔', badge: '', available: true, order: 2 },
        { id: 'item_torresmo', catId: 'cat_porc', name: 'Torresmo Crocante', desc: 'Pururuca sequinha com limão e pimenta biquinho.', price: 24.9, img: 'assets/img/porcao.jpg', emoji: '🥓', badge: '', available: true, order: 3 },
        { id: 'item_paoalho', catId: 'cat_porc', name: 'Pão de Alho (4 un)', desc: 'Pão de alho cremoso feito na churrasqueira.', price: 9.9, img: '', emoji: '🥖', badge: '', available: true, order: 4 },
        { id: 'item_cervejalata', catId: 'cat_beb', name: 'Cerveja Lata 350ml', desc: 'Skol, Brahma ou Itaipava — sempre estupidamente gelada.', price: 6.9, img: 'assets/img/bebida.jpg', emoji: '🍺', badge: '', available: true, order: 1 },
        { id: 'item_cerveja600', catId: 'cat_beb', name: 'Cerveja Garrafa 600ml', desc: 'Para dividir com a mesa. Consulte as marcas do dia.', price: 11.9, img: 'assets/img/bebida.jpg', emoji: '🍻', badge: '', available: true, order: 2 },
        { id: 'item_caipirinha', catId: 'cat_beb', name: 'Caipirinha de Limão', desc: 'Feita na hora com cachaça boa e muito gelo.', price: 14.9, img: 'assets/img/bebida.jpg', emoji: '🍋', badge: 'Feita na hora', available: true, order: 3 },
        { id: 'item_caipiroska', catId: 'cat_beb', name: 'Caipiroska de Morango', desc: 'Vodka, morango fresco e gelo triturado.', price: 16.9, img: 'assets/img/bebida.jpg', emoji: '🍓', badge: '', available: true, order: 4 },
        { id: 'item_refri', catId: 'cat_beb', name: 'Refrigerante Lata', desc: 'Coca, Guaraná, Fanta ou Sprite.', price: 5.5, img: '', emoji: '🥤', badge: '', available: true, order: 5 },
        { id: 'item_suco', catId: 'cat_beb', name: 'Suco Natural 500ml', desc: 'Maracujá, limonada, caju ou abacaxi com hortelã.', price: 8.9, img: '', emoji: '🧃', badge: '', available: true, order: 6 },
        { id: 'item_pudim', catId: 'cat_sob', name: 'Pudim de Leite Condensado', desc: 'Receita da vovó, com calda de caramelo.', price: 9.9, img: '', emoji: '🍮', badge: '', available: true, order: 1 },
        { id: 'item_churros', catId: 'cat_sob', name: 'Churros c/ Doce de Leite (6 un)', desc: 'Churros crocantes com muito doce de leite.', price: 12.9, img: '', emoji: '🍩', badge: '', available: true, order: 2 }
      ],
      admin: { passHash: hashPass('admin123') }
    };
  }

  /* ---------- persistência ---------- */

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) {
        var fresh = defaultData();
        save(fresh);
        return fresh;
      }
      var data = JSON.parse(raw);
      if (!data || data.version !== 1 || !data.store || !Array.isArray(data.items)) {
        var d2 = defaultData();
        save(d2);
        return d2;
      }
      // garante campos novos em dados antigos
      var base = defaultData();
      data.store = Object.assign(base.store, data.store || {});
      if (!Array.isArray(data.categories)) data.categories = base.categories;
      if (!data.admin || !data.admin.passHash) data.admin = base.admin;
      return data;
    } catch (e) {
      var d3 = defaultData();
      try { save(d3); } catch (e2) { /* sem armazenamento */ }
      return d3;
    }
  }

  function save(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
  }

  function reset() {
    var d = defaultData();
    save(d);
    return d;
  }

  function exportJSON(data) {
    return JSON.stringify(data || load(), null, 2);
  }

  function importJSON(text) {
    var data = JSON.parse(text);
    if (!data || data.version !== 1 || !data.store || !Array.isArray(data.items) || !Array.isArray(data.categories)) {
      throw new Error('Arquivo inválido');
    }
    save(data);
    return data;
  }

  /* ---------- sacola ---------- */

  function loadCart() {
    try {
      var raw = localStorage.getItem(CART_KEY);
      var cart = raw ? JSON.parse(raw) : [];
      return Array.isArray(cart) ? cart : [];
    } catch (e) { return []; }
  }

  function saveCart(cart) {
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) { /* ignora */ }
  }

  function clearCart() {
    try { localStorage.removeItem(CART_KEY); } catch (e) { /* ignora */ }
  }

  /* ---------- status aberto/fechado ---------- */

  function toMinutes(hhmm) {
    var parts = String(hhmm || '').split(':');
    var h = parseInt(parts[0], 10), m = parseInt(parts[1], 10);
    if (isNaN(h) || isNaN(m)) return null;
    return h * 60 + m;
  }

  function isOpen(store, nowDate) {
    var now = nowDate || new Date();
    if (store.forceStatus === 'open') return { open: true, label: 'Aberto agora' };
    if (store.forceStatus === 'closed') return { open: false, label: 'Fechado no momento' };
    var open = toMinutes(store.hoursOpen), close = toMinutes(store.hoursClose);
    if (open === null || close === null) return { open: true, label: 'Aberto agora' };
    var cur = now.getHours() * 60 + now.getMinutes();
    var isOvernight = close <= open;
    // de madrugada (ex: 00:30 com fechamento à 01:00), vale o dia anterior
    var dayToCheck = (isOvernight && cur < close) ? (now.getDay() + 6) % 7 : now.getDay();
    var days = store.daysOpen || [];
    if (days.indexOf(dayToCheck) === -1) return { open: false, label: 'Fechado hoje' };
    var openNow = isOvernight ? (cur >= open || cur < close) : (cur >= open && cur < close);
    return openNow ? { open: true, label: 'Aberto agora' } : { open: false, label: 'Fechado no momento' };
  }

  function hoursLabel(store) {
    var days = store.daysOpen || [];
    var all = days.length === 7;
    var dayNames = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
    var dayStr = all ? 'todos os dias' : days.slice().sort().map(function (d) { return dayNames[d]; }).join(', ');
    return 'Aberto ' + dayStr + ' • ' + (store.hoursOpen || '--:--') + '–' + (store.hoursClose || '--:--');
  }

  /* ---------- pedido → WhatsApp ---------- */

  function buildOrderMessage(data, cart, customer) {
    var store = data.store;
    var lines = [];
    lines.push('*' + String(store.name).toUpperCase() + ' — NOVO PEDIDO*');
    lines.push('--------------------------------');
    var subtotal = 0;
    cart.forEach(function (entry) {
      var item = null;
      for (var i = 0; i < data.items.length; i++) {
        if (data.items[i].id === entry.id) { item = data.items[i]; break; }
      }
      var name = item ? item.name : (entry.name || 'Item');
      var price = item ? Number(item.price) : Number(entry.price || 0);
      var qty = Number(entry.qty) || 1;
      var total = price * qty;
      subtotal += total;
      lines.push(qty + 'x ' + name + ' — ' + money(total));
      if (entry.obs) lines.push('   _Obs: ' + entry.obs + '_');
    });
    lines.push('--------------------------------');
    lines.push('Subtotal: ' + money(subtotal));
    var fee = 0;
    if (customer.type === 'entrega') {
      fee = Number(store.deliveryFee) || 0;
      if (store.freeDeliveryFrom > 0 && subtotal >= Number(store.freeDeliveryFrom)) fee = 0;
      lines.push('Taxa de entrega: ' + (fee === 0 ? 'Grátis 🎉' : money(fee)));
    }
    lines.push('*Total: ' + money(subtotal + fee) + '*');
    lines.push('--------------------------------');
    lines.push('*Nome:* ' + customer.name);
    if (customer.phone) lines.push('*Telefone:* ' + customer.phone);
    lines.push('*Tipo:* ' + (customer.type === 'entrega' ? '🛵 Entrega' : '🏃 Retirada'));
    if (customer.type === 'entrega' && customer.address) lines.push('*Endereço:* ' + customer.address);
    lines.push('*Pagamento:* ' + customer.payment);
    if (customer.changeFor) lines.push('*Troco para:* ' + customer.changeFor);
    if (customer.notes) lines.push('*Obs:* ' + customer.notes);
    return lines.join('\n');
  }

  function whatsappLink(data, message) {
    var num = onlyDigits(data.store.whatsapp);
    return 'https://wa.me/' + num + '?text=' + encodeURIComponent(message);
  }

  /* ---------- exporta ---------- */

  global.EspetariaDB = {
    load: load,
    save: save,
    reset: reset,
    exportJSON: exportJSON,
    importJSON: importJSON,
    loadCart: loadCart,
    saveCart: saveCart,
    clearCart: clearCart,
    isOpen: isOpen,
    hoursLabel: hoursLabel,
    buildOrderMessage: buildOrderMessage,
    whatsappLink: whatsappLink,
    money: money,
    parsePrice: parsePrice,
    escapeHtml: escapeHtml,
    hashPass: hashPass,
    onlyDigits: onlyDigits,
    uid: uid,
    clone: clone,
    GALLERY: GALLERY,
    defaultData: defaultData
  };
})(window);
