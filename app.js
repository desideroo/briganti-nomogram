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

     KAYNAKLAR
       Briganti 2017: Gandaglia G, ve ark. Eur Urol 2017;72:632-640, Tablo 2
         Model 1 (681 hasta, 79 LNİ) ve Şekil 1'deki nomogram.
       Briganti 2019: Gandaglia G, ve ark. Eur Urol 2019;75:506-514, Tablo 2
         Model 5 (428 hasta, 54 LNİ, AUC %86) ve Şekil 1'deki nomogram.

     KATSAYILAR NASIL ELDE EDİLDİ
     Her iki makale de beta katsayılarını "Supplementary Table 1"e bırakmıştır;
     ana metinde yalnızca yuvarlanmış odds oranları vardır. Katsayılar bu
     nedenle yayınlanmış nomogram şekillerinin (Şekil 1) geometrisinden geri
     hesaplanmıştır: puan eksenleri β ile doğru orantılı, risk ekseni ise
     logit'te doğrusaldır, dolayısıyla eksen konumları hem her β'yı hem de
     sabit terimi verir. Şekiller piksel düzeyinde ölçülmüştür.

     DOĞRULAMA — geri hesaplanan değerler yayınla karşılaştırıldı
       2017  değişken            OR (şekil)   OR (Tablo 2, Model 1)
             PSA                    1.086            1.08
             Klinik evre T2         2.337            2.27
             Klinik evre T3         2.869            2.87
             ISUP 3                 9.647            9.5
             ISUP 4-5              14.508           14.5
             En yüksek dereceli %   1.027            1.02
             Daha düşük dereceli %  1.014            1.01
       2019  PSA                    1.043            1.04
             mpMR EKY               3.392            3.39
             mpMR SVİ               4.336            4.36
             ISUP 3                 3.333            3.33
             ISUP 4-5               6.085            6.08
             Lezyon çapı (mm)       1.032            1.03
             csPCa kor %            1.012            1.01
     Sabit terim bağımsız olarak da doğrulandı: makalelerin bildirdiği "%7
     eşiğinin altında kalan hasta oranı" (2017: %69, 2019: %57) bu modellerle
     yeniden üretildiğinde %68 ve %57 çıkmaktadır.

     ÖNEMLİ — ISUP derece grubu her iki modelde de 1-2 / 3 / 4-5 olarak
     kategorize edilmiştir (yayınların kendi tercihi). Bu nedenle ISUP 1 ile 2
     aynı, ISUP 4 ile 5 aynı katsayıyı alır.

     Geçerli aralıklar yayınlanmış nomogram eksenlerinden alınmıştır.
     Kategorik değişkenlerde ilk seviye referanstır (β = 0).
     ---------------------------------------------------------------------- */

  var MODELS = {
    '2017': {
      label: 'Briganti 2017',
      source: 'Gandaglia G, ve ark. Eur Urol 2017;72:632-640 (Tablo 2 Model 1, Şekil 1)',
      official: 'https://www.evidencio.com/models/show/1555?v=3.0',
      intercept: -5.8703,
      continuous: {
        psa:       0.082563,   // ng/mL başına        (OR 1.086)
        coreshigh: 0.026832,   // % başına            (OR 1.027)
        coreslow:  0.013946    // % başına            (OR 1.014)
      },
      categorical: {
        // Klinik T evresi: T1 | T2 | T3
        stage:   [0, 0.848583, 1.053999],
        // Biyopsi ISUP derece grubu 1..5 — model 1-2 / 3 / 4-5 olarak gruplar
        gleason: [0, 0, 0, 2.266665, 2.674664, 2.674664]
      },
      // Arayüzdeki cT seçeneği -> stage katsayı dizisindeki indeks.
      // Model yalnızca T1/T2/T3 ayrımı yapar; cT3a, cT3b ve cT4 aynı katsayıyı alır.
      stageOptions: { cT1: 0, cT2: 1, cT3a: 2, cT3b: 2, cT4: 2 },
      stageNotes: {
        cT4: 'Modelin geliştirme kohortunda cT4 hasta yoktur (evre dağılımı T1/T2/T3). ' +
             'En yüksek evre katsayısı (T3) kullanılır; sonuç bu hastalarda ekstrapolasyondur.'
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
      source: 'Gandaglia G, ve ark. Eur Urol 2019;75:506-514 (Tablo 2 Model 5, Şekil 1)',
      official: 'https://www.evidencio.com/models/show/1555?v=4.0',
      intercept: -4.5504,
      continuous: {
        psa:    0.041586,   // ng/mL başına           (OR 1.043)
        lesion: 0.031151,   // mm başına              (OR 1.032)
        cores:  0.011930    // % başına               (OR 1.012)
      },
      categorical: {
        // mpMR'de klinik evre: organa sınırlı | ekstrakapsüler yayılım | seminal vezikül invazyonu
        stage:   [0, 1.221484, 1.466866],
        // MR-hedefli biyopside ISUP derece grubu 1..5 — model 1-2 / 3 / 4-5 olarak gruplar
        gleason: [0, 0, 0, 1.203860, 1.805790, 1.805790]
      },
      // Arayüzdeki cT seçeneği -> stage katsayı dizisindeki indeks.
      // Modelin evre değişkeni mpMR bulgusudur: cT1/cT2 = organa sınırlı, cT3a = EKY,
      // cT3b = SVİ. cT4 için modelde ayrı kategori yoktur, en yüksek kategori kullanılır.
      stageOptions: { cT1: 0, cT2: 0, cT3a: 1, cT3b: 2, cT4: 2 },
      stageNotes: {
        cT4: 'Modelde cT4 için ayrı kategori yoktur; en yüksek evre katsayısı (seminal vezikül ' +
             'invazyonu) kullanılır. Sonuç bu hastalarda ekstrapolasyondur.'
      },
      fields: {
        psa:    { label: 'PSA',                                 unit: 'ng/mL', min: 0, max: 80 },
        lesion: { label: 'mpMR maksimum lezyon çapı',           unit: 'mm',    min: 0, max: 45 },
        cores:  { label: 'Klinik anlamlı kanserli kor yüzdesi', unit: '%',     min: 0, max: 100 }
      },
      selects: { stage: 'Klinik T evresi (mpMR)', gleason: 'Hedefli biyopsi Gleason / ISUP' }
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

    // cT seçeneği modelin evre kategorisine eşlenir (birden fazla cT aynı katsayıyı paylaşır).
    values.stage = model.stageOptions[$('stage-' + key).value];
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

  /** Seçilen cT evresi model kapsamı dışındaysa uyarı gösterir. */
  function updateStageNote(key) {
    var el = $('stagenote-' + key);
    if (!el) { return; }
    var message = (MODELS[key].stageNotes || {})[$('stage-' + key).value] || '';
    el.textContent = message;
    el.classList.toggle('is-shown', message !== '');
  }

  function calculate() {
    var key = activeModel;
    var state = readModel(key);
    var errorNames = Object.keys(state.errors);

    updateStageNote(key);

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
