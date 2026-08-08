/* ==========================================================================
   Briganti Nomogramı — Lenf nodu invazyonu (LNİ) risk hesaplayıcı
   Bağımlılıksız Vanilla JS; tüm hesaplama istemci tarafında yapılır.
   ========================================================================== */
(function () {
  'use strict';

  /* ------------------------------------------------------------------------
     MODEL KATSAYILARI
     ------------------------------------------------------------------------
     Her iki nomogram da çok değişkenli lojistik regresyondur:

         logit = sabit + Σ (β_i · x_i)
         risk  = 1 / (1 + e^(-logit))

     DEĞİŞKENLER — birincil kaynaklarla doğrulanmıştır
       Briganti 2017 (Gandaglia G, ve ark. Eur Urol 2017;72:632-640):
         PSA, klinik T evresi (T1/T2/T3), biyopsi ISUP derece grubu,
         en yüksek dereceli kanser içeren kor %, daha düşük dereceli kanser
         içeren kor %.
       Briganti 2019 (Gandaglia G, ve ark. Eur Urol 2019;75:506-514):
         PSA, mpMR'de klinik evre (organa sınırlı / EKY / SVİ), mpMR'de
         maksimum indeks lezyon çapı, MR-hedefli biyopside ISUP derece grubu,
         sistematik biyopside klinik anlamlı kanser (ISUP >= 2) içeren kor %.
       Değişken adları ve geçerli aralıklar, modellerin resmî uygulaması olan
       Evidencio model 1555 (v3.0 = 2017, v4.0 = 2019) ile birebir aynıdır.

     KATSAYILAR — DİKKAT
     Orijinal yayınlar nomogramı puan tablosu olarak sunar; beta katsayıları
     ve sabit terim açık literatürde yayımlanmamıştır (resmî uygulama olan
     Evidencio da formülü paylaşmaz). Aşağıdaki β değerleri, yayınlanan risk
     yapısını yeniden üreten YAKLAŞIK log-odds değerleridir. Modelin biçimi,
     değişkenleri ve risk sıralaması doğrudur; mutlak yüzdeler resmî
     nomogramın birebir çıktısı DEĞİLDİR.

     Orijinal katsayı tablosuna eriştiğinizde yalnızca bu nesneyi güncelleyin;
     uygulamanın geri kalanı modeli hiçbir yerde sabit kodlamaz.

     Kategorik değişkenlerde ilk seviye referanstır (β = 0).
     ---------------------------------------------------------------------- */

  var MODELS = {
    '2017': {
      label: 'Briganti 2017',
      source: 'Gandaglia G, ve ark. Eur Urol 2017;72:632-640',
      official: 'https://www.evidencio.com/models/show/1555?v=3.0',
      intercept: -6.0,
      continuous: {
        psa:       0.0292,   // ng/mL başına
        coreshigh: 0.0296,   // en yüksek dereceli kanser içeren kor yüzdesi, % başına
        coreslow:  0.0100    // daha düşük dereceli kanser içeren kor yüzdesi, % başına
      },
      categorical: {
        // Klinik T evresi: T1 | T2 | T3
        stage:   [0, 0.5878, 1.2528],
        // Biyopsi ISUP derece grubu 1..5 (0. indeks kullanılmaz)
        gleason: [0, 0, 0.5878, 1.2528, 1.7047, 2.0794]
      },
      fields: {
        psa:       { label: 'PSA',                                   unit: 'ng/mL', min: 0, max: 50 },
        coreshigh: { label: 'En yüksek dereceli kanser içeren kor',  unit: '%',     min: 0, max: 100 },
        coreslow:  { label: 'Daha düşük dereceli kanser içeren kor', unit: '%',     min: 0, max: 90 }
      },
      selects: { stage: 'Klinik T evresi', gleason: 'Biyopsi Gleason / ISUP' }
    },

    '2019': {
      label: 'Briganti 2019',
      source: 'Gandaglia G, ve ark. Eur Urol 2019;75:506-514',
      official: 'https://www.evidencio.com/models/show/1555?v=4.0',
      intercept: -5.8,
      continuous: {
        psa:    0.0296,   // ng/mL başına
        lesion: 0.0296,   // mpMR indeks lezyon çapı, mm başına
        cores:  0.0198    // sistematik biyopside klinik anlamlı kanserli kor %, % başına
      },
      categorical: {
        // mpMR'de klinik evre: organa sınırlı | ekstrakapsüler yayılım | seminal vezikül invazyonu
        stage:   [0, 0.7419, 1.3863],
        // MR-hedefli biyopside ISUP derece grubu 1..5 (0. indeks kullanılmaz)
        gleason: [0, 0, 0.2624, 1.0986, 1.3863, 1.7918]
      },
      fields: {
        psa:    { label: 'PSA',                                unit: 'ng/mL', min: 0, max: 50 },
        lesion: { label: 'mpMR maksimum lezyon çapı',          unit: 'mm',    min: 0, max: 45 },
        cores:  { label: 'Klinik anlamlı kanserli kor yüzdesi', unit: '%',    min: 0, max: 100 }
      },
      selects: { stage: 'mpMR klinik evre', gleason: 'Hedefli biyopsi Gleason / ISUP' }
    }
  };

  var EAU_THRESHOLD = 7;              // %  — EAU kılavuzlarının ePLND eşiği
  var GAUGE_MAX = 50;                 // %  — gösterge çubuğunun tam genişliği

  var MESSAGES = {
    safe: 'Risk %7 eşiğinin altında. ePLND güvenle atlanabilir.',
    risk: 'Risk %7 veya üzerinde. Genişletilmiş pelvik lenf nodu diseksiyonu (ePLND) önerilir.'
  };

  /* ------------------------------- yardımcılar ---------------------------- */

  var $ = function (id) { return document.getElementById(id); };

  function logistic(z) {
    return 1 / (1 + Math.exp(-z));
  }

  /** Türkçe ondalık ayırıcı için: "8,4" -> 8.4 */
  function toNumber(raw) {
    return Number(raw.replace(',', '.'));
  }

  /** Sayıyı Türkçe biçimde gösterir: 8.6 -> "8,6" */
  function formatNumber(value, digits) {
    return value.toFixed(digits).replace('.', ',');
  }

  /** Bir modelin girdilerini okur ve doğrular. */
  function readModel(key) {
    var model = MODELS[key];
    var values = {};
    var errors = {};
    var missing = [];

    Object.keys(model.fields).forEach(function (name) {
      var spec = model.fields[name];
      var raw = $(name + '-' + key).value.trim();

      if (raw === '') {
        missing.push(spec.label);
        return;
      }
      var num = toNumber(raw);
      if (!isFinite(num)) {
        errors[name] = 'Geçerli bir sayı girin.';
        return;
      }
      if (num < spec.min || num > spec.max) {
        errors[name] = 'Model yalnızca ' + spec.min + '–' + spec.max + ' ' + spec.unit +
          ' aralığı için geçerlidir.';
        return;
      }
      values[name] = num;
    });

    values.stage = parseInt($('stage-' + key).value, 10);
    values.gleason = parseInt($('gleason-' + key).value, 10);

    return { values: values, errors: errors, missing: missing };
  }

  /** Doğrulanmış girdiler için LNİ riskini (%) hesaplar. */
  function computeRisk(key, values) {
    var model = MODELS[key];
    var z = model.intercept;

    Object.keys(model.continuous).forEach(function (name) {
      z += model.continuous[name] * values[name];
    });
    z += model.categorical.stage[values.stage];
    z += model.categorical.gleason[values.gleason];

    return logistic(z) * 100;
  }

  /* ------------------------------ sonuç alanı ----------------------------- */

  var resultEl = $('result');
  var emptyEl = $('resultEmpty');
  var bodyEl = $('resultBody');
  var missingListEl = $('missingList');
  var riskValueEl = $('riskValue');
  var verdictEl = $('verdict');
  var gaugeFillEl = $('gaugeFill');
  var gaugeEl = $('gauge');
  var resultModelEl = $('resultModel');

  var lastResult = null;

  function showPending(missing, hasErrors) {
    lastResult = null;
    resultEl.classList.remove('is-safe', 'is-risk');
    bodyEl.hidden = true;
    emptyEl.hidden = false;
    missingListEl.innerHTML = '';

    if (hasErrors) {
      var li = document.createElement('li');
      li.textContent = 'Yukarıda işaretlenen değerleri düzeltin.';
      missingListEl.appendChild(li);
      return;
    }
    missing.forEach(function (label) {
      var item = document.createElement('li');
      item.textContent = label;
      missingListEl.appendChild(item);
    });
  }

  function showResult(key, risk) {
    var isRisk = risk >= EAU_THRESHOLD;
    var shown = risk < 0.1 ? '<0,1' : formatNumber(risk, 1);

    emptyEl.hidden = true;
    bodyEl.hidden = false;
    resultModelEl.textContent = MODELS[key].label;
    riskValueEl.textContent = shown;
    verdictEl.textContent = isRisk ? MESSAGES.risk : MESSAGES.safe;

    resultEl.classList.toggle('is-risk', isRisk);
    resultEl.classList.toggle('is-safe', !isRisk);

    gaugeFillEl.style.width = Math.min(100, (risk / GAUGE_MAX) * 100) + '%';
    gaugeEl.setAttribute('aria-label',
      'Tahmini risk yüzde ' + shown + ', %7 EAU eşiğinin ' +
      (isRisk ? 'üzerinde veya eşiğinde' : 'altında') + '.');

    lastResult = { key: key, risk: risk, shown: shown, isRisk: isRisk };
  }

  /* -------------------------------- hesap --------------------------------- */

  var activeModel = '2017';

  function setFieldError(key, name, message) {
    var input = $(name + '-' + key);
    var errEl = document.querySelector('[data-error-for="' + name + '-' + key + '"]');
    if (!errEl) { return; }
    if (message) {
      errEl.textContent = message;
      errEl.classList.add('is-shown');
      input.classList.add('is-invalid');
    } else {
      errEl.textContent = '';
      errEl.classList.remove('is-shown');
      input.classList.remove('is-invalid');
    }
  }

  function calculate() {
    var key = activeModel;
    var state = readModel(key);
    var errorNames = Object.keys(state.errors);

    Object.keys(MODELS[key].fields).forEach(function (name) {
      setFieldError(key, name, state.errors[name] || '');
    });

    if (errorNames.length || state.missing.length) {
      showPending(state.missing, errorNames.length > 0);
      return;
    }
    showResult(key, computeRisk(key, state.values));
  }

  /* ------------------------------- sekmeler ------------------------------- */

  function selectModel(key) {
    activeModel = key;
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (tab) {
      var on = tab.dataset.model === key;
      tab.classList.toggle('is-active', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
      tab.tabIndex = on ? 0 : -1;
    });
    $('panel-2017').hidden = key !== '2017';
    $('panel-2019').hidden = key !== '2019';
    calculate();
  }

  Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (tab) {
    tab.addEventListener('click', function () { selectModel(tab.dataset.model); });
    tab.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') { return; }
      e.preventDefault();
      var next = activeModel === '2017' ? '2019' : '2017';
      selectModel(next);
      $('tab-' + next).focus();
    });
  });

  /* --------------------------- canlı hesaplama ---------------------------- */

  Array.prototype.forEach.call(document.querySelectorAll('.form'), function (form) {
    form.addEventListener('input', calculate);
    form.addEventListener('change', calculate);
    form.addEventListener('submit', function (e) { e.preventDefault(); });
  });

  /* --------------------- kor yüzdesi mini hesaplayıcı --------------------- */

  Array.prototype.forEach.call(document.querySelectorAll('[data-toggle-helper]'), function (btn) {
    btn.addEventListener('click', function () {
      var box = $(btn.dataset.toggleHelper);
      var open = box.hidden;
      box.hidden = !open;
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  });

  Array.prototype.forEach.call(document.querySelectorAll('.mini-calc'), function (box) {
    var pos = box.querySelector('[data-role="pos"]');
    var tot = box.querySelector('[data-role="tot"]');
    var target = $(box.dataset.target);

    function sync() {
      var p = toNumber(pos.value);
      var t = toNumber(tot.value);
      if (pos.value === '' || tot.value === '' || !(t > 0) || p < 0) { return; }
      target.value = String(Math.round(Math.min(100, (p / t) * 100) * 10) / 10);
      calculate();
    }
    pos.addEventListener('input', sync);
    tot.addEventListener('input', sync);
  });

  /* ------------------------------- temizle -------------------------------- */

  Array.prototype.forEach.call(document.querySelectorAll('[data-reset]'), function (btn) {
    btn.addEventListener('click', function () {
      var key = btn.dataset.reset;
      var form = $('form-' + key);
      Array.prototype.forEach.call(form.querySelectorAll('input'), function (input) {
        input.value = '';
      });
      Array.prototype.forEach.call(form.querySelectorAll('select'), function (select) {
        select.selectedIndex = 0;
      });
      Object.keys(MODELS[key].fields).forEach(function (name) {
        setFieldError(key, name, '');
      });
      calculate();
      form.querySelector('input').focus();
    });
  });

  /* ----------------------------- özeti kopyala ---------------------------- */

  var toastEl = $('toast');
  var toastTimer = null;

  function toast(message) {
    toastEl.textContent = message;
    toastEl.hidden = false;
    requestAnimationFrame(function () { toastEl.classList.add('is-visible'); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove('is-visible');
      setTimeout(function () { toastEl.hidden = true; }, 220);
    }, 2000);
  }

  function selectedText(id) {
    var select = $(id);
    return select.options[select.selectedIndex].textContent.trim();
  }

  function buildSummary() {
    if (!lastResult) { return ''; }
    var key = lastResult.key;
    var model = MODELS[key];
    var lines = [model.label + ' nomogramı — tahmini LNİ riski: %' + lastResult.shown];

    lines.push(lastResult.isRisk ? MESSAGES.risk : MESSAGES.safe);
    lines.push('');
    Object.keys(model.selects).forEach(function (name) {
      lines.push(model.selects[name] + ': ' + selectedText(name + '-' + key));
    });
    Object.keys(model.fields).forEach(function (name) {
      lines.push(model.fields[name].label + ': ' + $(name + '-' + key).value + ' ' + model.fields[name].unit);
    });
    lines.push('');
    lines.push('Not: Yaklaşık katsayılarla hesaplanmıştır, resmî nomogram çıktısı değildir.');
    lines.push(model.source);
    return lines.join('\n');
  }

  $('copyBtn').addEventListener('click', function () {
    var text = buildSummary();
    if (!text) { return; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () { toast('Özet kopyalandı'); },
        function () { fallbackCopy(text); }
      );
    } else {
      fallbackCopy(text);
    }
  });

  function fallbackCopy(text) {
    var area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    try {
      document.execCommand('copy');
      toast('Özet kopyalandı');
    } catch (err) {
      toast('Kopyalama desteklenmiyor');
    }
    document.body.removeChild(area);
  }

  /* --------------------------------- PWA ---------------------------------- */

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* çevrimdışı mod yok */ });
    });
  }

  var installBtn = $('installBtn');
  var deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.hidden = false;
  });

  installBtn.addEventListener('click', function () {
    if (!deferredPrompt) { return; }
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(function () {
      deferredPrompt = null;
      installBtn.hidden = true;
    });
  });

  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    installBtn.hidden = true;
  });

  /* -------------------------------- başlat -------------------------------- */

  calculate();

  // Konsoldan hızlı doğrulama / ileride birim testleri için.
  window.Briganti = { MODELS: MODELS, computeRisk: computeRisk, EAU_THRESHOLD: EAU_THRESHOLD };
})();
