# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

Prostat kanserinde **lenf nodu invazyonu (LNİ)** riskini hesaplayan tek sayfalık web uygulaması:
Briganti 2017 (sistematik biyopsi) ve Briganti 2019 (mpMR-hedefli biyopsi) nomogramları. Üyeliksiz,
sunucusuz, çevrimdışı çalışır. Hedef kullanıcı, EAU'nun **%5 eşiğine** göre genişletilmiş pelvik lenf
nodu diseksiyonu (ePLND) kararı veren ürologtur.

Yayında: https://desideroo.github.io/briganti-nomogram/

## Dil kuralı

Kullanıcıya görünen her şey, kod yorumları, commit mesajları ve README **Türkçedir**. Kullanıcı
Türkçe çalışan bir ürologtur; ona da Türkçe yanıt verin.

## Komutlar

Derleme adımı, paket yöneticisi ve bağımlılık yoktur. Dosyalar doğrudan servis edilir.

```bash
python3 -m http.server 8123        # .claude/launch.json'daki "briganti" yapılandırması da aynısını yapar
```

| İş | Komut / adres |
| --- | --- |
| Testler | `http://localhost:8123/tests/` — 100 kontrol, tarayıcıda çalışır |
| Katsayı denetimi | `python3 tools/reconstruct_nomogram.py` — uyuşmazlıkta çıkış kodu 1 |
| Şekilleri PDF'ten yeniden ölç | `python3 tools/reconstruct_nomogram.py --pdf-2017 <yol> --pdf-2019 <yol>` |
| Sözdizimi kontrolü | `node --check app.js` |

Testler hakkında bilinmesi gerekenler:

- **Bir sunucu üzerinden açın.** `file://` ile iframe erişimi tarayıcı tarafından engellenir.
- Komut satırı koşucusu yoktur; `tests/index.html` gerçek `index.html`'i bir iframe'e yükleyip
  asıl arayüz üzerinden sınar. Tek bir testi çalıştırmanın yolu yok — paket bütün hâlinde koşar.
- Sayfa, yüklemeden önce service worker önbelleğini boşaltır. Buna rağmen eski dosya servis
  edildiğinden şüphelenirseniz önbelleği elle temizleyin; yanıltıcı kırmızı testlerin en sık nedeni budur.
- Nomogram şekilleri yayıncıya ait telif korumalı içeriktir ve depoda **bulunmaz**. `--pdf` adımı
  makalelerin kendi kopyanızı gerektirir; depodaki kayıtlı piksel ölçümleriyle çalışan varsayılan
  denetim buna ihtiyaç duymaz.

## Yayınlama

`main`'e push → GitHub Pages otomatik derler. Her yayında **iki yeri birden** artırın, yoksa
istemciler eski dosyalarda kalır:

- `sw.js` → `CACHE_VERSION`
- `index.html` → alt bilgideki sürüm damgası (`.ver`)

## Mimari

### Model tek bir yerde tanımlıdır

`app.js` içindeki `MODELS` nesnesi tek doğruluk kaynağıdır: katsayılar, sabit terim, geçerli
aralıklar, alan etiketleri, birimler, cT eşlemesi ve kapsam uyarıları. Arayüz doğrulaması, hata
mesajları ve "Özeti kopyala" çıktısı bu nesneden türetilir — bir alan eklemek/değiştirmek genelde
yalnızca burayı ve HTML'deki karşılığını düzenlemek demektir.

Akış: `readModel(key)` → doğrulama → `computeRisk(key, values)` → `showResult` / `showPending`.
Her `input` ve `change` olayında yeniden hesaplanır; "Hesapla" düğmesi yoktur.

`window.Briganti` yalnızca test paketinin çalışan gerçek uygulamaya karşı iddia kurabilmesi için
dışa açılır. Üretim kodu onu kullanmaz.

### Katsayılara elle dokunmayın — üçlü kilit

Briganti β katsayıları açık literatürde yayınlanmamıştır (her iki makale de "Supplementary Table
1"e bırakır; resmî uygulama Evidencio ücretli). Depodaki değerler, yayınlanmış nomogram
şekillerinin geometrisinden geri hesaplanmıştır. Üç dosya aynı sayıları bağımsız olarak taşır:

1. `app.js` → `MODELS` (uygulamanın kullandığı)
2. `tools/reconstruct_nomogram.py` → `MEASUREMENTS` (piksel ölçümlerinden yeniden türetir ve
   `app.js` ile karşılaştırır; ayrıca yayınların Tablo 2 odds oranlarına ve bildirdikleri "%7 eşiği
   altındaki hasta oranı"na karşı sınar)
3. `tests/index.html` → `EXPECTED` (arayüz üzerinden doğrular)

Bir katsayıyı yalnızca `app.js`'te değiştirmek denetimi ve testleri kırar — **doğru sıra**:
betikteki `MEASUREMENTS`'ı düzeltin, betiği çalıştırın, çıktısını `app.js` ve `tests/index.html`'e
taşıyın. Bu kilit projenin varlık nedenidir; zayıflatmayın.

### HTML ↔ test sözleşmesi

`tests/index.html` gerçek arayüzü ID, `data-*` özniteliği ve sınıf adıyla sürer. Yeniden
adlandırmak testleri kırar. Sarmalayıcı `div` eklemek serbesttir; şu çapaları korumak zorunludur:

- **ID kalıbı**: `<alan>-<model>` — ör. `psa-2017`, `stage-2019`, `coreshigh-2017`, `cores-2019`;
  ayrıca `tab-`, `panel-`, `stagecur-`, `stagenote-`, `helper-`, `pos-`, `tot-` önekleri.
- **Tekil ID'ler**: `result`, `resultBody`, `resultEmpty`, `riskValue`, `verdict`, `gaugeFill`,
  `resultModel`, `missingList`, `minibar`, `miniValue`, `miniNote`, `copyBtn`, `toast`.
- **Öznitelikler**: `data-error-for`, `data-reset`, `data-toggle-helper`, `data-target`,
  `data-role="pos|tot|def"`, `data-model`, `data-stage`.
- **Sınıflar**: `.ct-rung` / `.ct-node` / `.ct-sub` / `.ct-text`, gösterge parçaları
  `.gauge-track` / `.gauge-gate` / `.gauge-alt`, durum sınıfları
  `.is-active` / `.is-safe` / `.is-risk` / `.is-high` / `.is-shown` / `.is-tucked`.
- **Karar durumu iki sınıfla taşınır, üç değil.** `#result` ve `#minibar` üzerinde `.is-risk`
  "EAU eşiği aşıldı" demektir (yani karar: ePLND önerilir) ve %5'in üzerindeki **her** sonuçta
  bulunur; `.is-high` onu daraltır (%7 de aşıldı). Üçüncü bir dışlayıcı sınıf **eklemeyin** —
  `.is-risk`'i bandın dışına çıkarmak kararın ikili anlamını bozar ve testleri kırar.
- `#stagecur-<model>` **yalnızca tanım metnini** içermelidir: bir test onun tüm `textContent`'ini
  merdivendeki `.ct-text` ile karşılaştırır. İçine etiket eklemeyin (görsel önek gerekirse CSS
  `::before` kullanın).

### CSS ↔ JS bağlantıları

- `GAUGE_MAX` (`app.js`) ile göstergedeki iki işaretin CSS konumu birbirine bağlıdır:
  `.gauge-gate { left }` = `EAU_THRESHOLD / GAUGE_MAX` (5/20 = %25) ve
  `.gauge-alt { left }` = `ALT_THRESHOLD / GAUGE_MAX` (7/20 = %35). Tutarlılık test paketinde
  sınanır — biri diğerinden habersiz değişirse gösterge sessizce yanlış yer göstermek yerine test
  kırmızıya döner.
- `styles.css` başındaki genel `[hidden] { display: none !important; }` kuralı **gereklidir**.
  `.mini-calc` ve `.minibar` gibi bileşenler `display` atadığı için, bu kural olmadan yazar stili
  tarayıcının `hidden` davranışını ezer ve öğe gizlenmez. (Bu hata bir kez gerçekten oluştu: kor
  hesaplayıcı kutuları sitede sürekli açık duruyordu.)

## Klinik gerçekler — kolayca yanlış yapılanlar

Bu maddeler yayınlanmış modellerin kendi tercihleridir, uygulama kısıtı veya hata değildir.
Projenin ilk sürümünde yanlış değişken setleriyle başlanmıştı; birincil kaynaklara ve modellerin
resmî uygulamasına (Evidencio model 1555) göre düzeltildi.

**Briganti 2017** — değişkenler: PSA, klinik evre (T1/T2/T3), biyopsi ISUP derece grubu, *en yüksek
dereceli* kanser içeren kor yüzdesi, *daha düşük dereceli* kanser içeren kor yüzdesi.
`Maksimum tümör uzunluğu` bu modelde **yoktur**.

**Briganti 2019** — değişkenler: PSA, mpMR'de klinik evre (organa sınırlı / ekstrakapsüler yayılım /
seminal vezikül invazyonu), mpMR'de maksimum indeks lezyon çapı, hedefli biyopside ISUP derece
grubu, sistematik biyopside klinik anlamlı kanser (ISUP ≥ 2) içeren kor yüzdesi.
`PI-RADS skoru` ve `hedefli biyopside maksimum tümör uzunluğu` bu modelin bağımsız değişkenleri
**değildir**; bu yüzden forma alınmamıştır.

**Karar eşiği — %5 ile %7'yi karıştırmayın.** Projenin bir sürümünde tam olarak bu hata yapılmıştı:
%7 "EAU eşiği" diye sunuluyordu.

- **%5 = EAU eşiği.** EAU-EANM-ESTRO-ESUR-ISUP-SIOG Prostat Kanseri kılavuzu, tahmini LNİ riski
  %5'i aşan hastalarda ePLND önerir. **Kullanılan nomogram sürümünden (2012 / 2017 / 2019)
  bağımsızdır.** Uygulamanın kararı budur: `app.js` → `EAU_THRESHOLD`.
- **%7 = Gandaglia ve ark.'nın kesme noktası, EAU'nun değil.** Nomogramların dışsal doğrulama ve
  karar eğrisi (DCA) analizlerinde önerilen alternatiftir. `app.js` → `ALT_THRESHOLD`. **Kararı
  değiştirmez**, kararın ne kadar tartışmasız olduğunu söyler.
- **Sonuç üç banda ayrılır** (`app.js` → `riskState()`, `MESSAGES`, `SHORT`):

  | Bant | Aralık | Sınıf | Lamba | Karar |
  | --- | --- | --- | --- | --- |
  | `safe` | risk &lt; %5 | `.is-safe` | `--safe` nane | ePLND atlanabilir |
  | `band` | %5 ≤ risk &lt; %7 | `.is-risk` | `--risk` kehribar | ePLND önerilir — ama %7'nin altında, iki kaynağın ayrıştığı tartışmalı bant |
  | `high` | risk ≥ %7 | `.is-risk .is-high` | `--high` kırmızı | ePLND önerilir, her iki eşik de aşıldı |

  Her bandın kendi uyarı metni vardır; renk tek başına taşıyıcı değildir (bant ayrıca "sınırda"
  etiketi alır, `%7` işaretçisi `high` bandında yanar). Yeni bir bant eklemeyin — üç bant
  literatürdeki iki kesme noktasından türüyor, keyfi değil.
- `tools/reconstruct_nomogram.py` içindeki %7 referansları **kasıtlıdır ve değişmemelidir**:
  betik sabit terimi, yayınların kendi bildirdiği "%7 eşiği altında kalan hasta oranı"
  (2017: %69, 2019: %57) ile sınar. Bu, EAU eşiğiyle ilgili değil, yayınla tutarlılık sınamasıdır.

**ISUP gruplandırması** — her iki model de dereceleri 1-2 / 3 / 4-5 olarak kategorize eder. ISUP 1
ile 2 aynı, ISUP 4 ile 5 aynı riski verir.

**cT eşlemesi** — arayüz cT1, cT2, cT3a, cT3b, cT4 sunar; modellerin üç kategorisine `stageOptions`
ile eşlenir. 2017'de cT3a = cT3b = cT4; 2019'da cT1 = cT2. **cT4 hiçbir modelin geliştirme
kohortunda yoktur** — en yüksek evre katsayısı kullanılır ve arayüzde ekstrapolasyon uyarısı çıkar.

## Tasarım: neyi değiştirebilirsiniz, neyi değiştiremezsiniz

Görsel tasarım baştan yazılabilir. Aşağıdaki ilk liste tasarımdan bağımsız olarak geçerlidir;
ikinci liste yalnızca mevcut tasarımın tercihidir ve serbestçe atılabilir.

### Hangi tasarımda olursa olsun geçerli

- **`text-transform: uppercase` kullanmayın.** Tarayıcı Türkçe "i" harfini "I" yapar ve
  "TAHMINI LNI" gibi yanlış yazım üretir. Bu bir estetik tercih değil, yazım hatası.
- **Yüzde işareti sayının önüne yazılır** (%5 — `5%` değil).
- Açık ve koyu tema birlikte desteklenir (`prefers-color-scheme`); yeni renk eklerken ikisini de
  tanımlayın.
- Dokunma hedefleri en az ~44 px; girdilerde `font-size: 16px` (iOS odakta yakınlaştırmasın).
- Yukarıdaki **HTML ↔ test sözleşmesi** ve **CSS ↔ JS bağlantıları** bölümleri bağlayıcıdır.
  Görünüm tamamen değişse de o ID, öznitelik ve sınıflar yerinde kalmalı; aksi hâlde 86 testin
  büyük kısmı kırılır. Sarmalayıcı eklemek, sınıf eklemek, düzeni değiştirmek serbesttir.

### Yalnızca mevcut tasarımın tercihi (değiştirilebilir)

Mevcut kimlik **"ölçü aleti"**: sayfa iki malzemeden yapılıdır — *kâğıt* (kemik beyazı zemin, saç
teli çizgiler, oyma bölüm etiketleri) ve *panel* (`.result`, sayfanın tek koyu yüzeyi).

- **Sinyal tek yerde toplanır ama renkle değil, zemin/figür karşıtlığıyla.** Kâğıt tarafı baştan
  sona nötrdür; doygun renk (eşik altı nane, eşik üstü kehribar) yalnızca koyu panelin içinde —
  üst kenar şeridi, dev sayı, okuma çizgisi ve karar bloğunda — görünür. Koyu temada sayfa zaten
  koyu olduğu için kâğıt katmanları yukarı çekilir, panel neredeyse siyah kalıp `--slab-edge`
  kenarlığıyla çerçevelenir. Yeni bir tasarım sinyali başka yolla toplayabilir; topladığından
  emin olun.
- **Üç tipografik yüz, üç iş:** `--mono` ölçüm (sayılar, birimler, cT kodları, eksen etiketleri,
  ürün adı), `--sans` arayüz (etiketler, açıklamalar, düğmeler), `--serif` literatür (atıflar,
  kaynak şeridi, model ayrıntıları, feragat). Web fontu yoktur — uygulama çevrimdışı çalışır,
  yığınlar sistem fontlarıdır.
- **Okuma çizgisi imzası:** logodaki dikey çizgi (`.mark-read`), göstergedeki dolgunun ön kenarı
  (`.gauge-fill::after`) ve %5 kapısı aynı jesttir. Cetvel oyma taksimatlıdır (her 1 puanda ince,
  her 5 puanda belirgin çentik).
- **Giriş kuralı çatalı** (`.gate` / `.gate-fork`): %5 ve iki dalı, kural uygulanmadan önce
  gösterilir; yanındaki nane/kehribar kareler panelin renk kodunu önceden öğretir.
- Sayısal değerlerin tabular monospace ile dizilmesi (PSA, yüzdeler, cT kodları, risk).
- Yüzde alanlarında `%` girdinin **önünde** durur (`.affix.is-lead`); birim ekleri (ng/mL, mm)
  arkasında.
- Geniş ekranda sayfanın tamamı tek bir iki sütunlu ızgaradır (`main.shell`): solda giriş kuralı
  ve form, sağda kaynak şeridi ile onun altında yapışkan okuma paneli — ikisi de `--side` genişliğinde.
  Telefonda `main` bir flex sütuna döner ve kaynak şeridi `order` ile hesaplayıcının altına iner
  (ilk ekran forma ait olsun diye); sonuç alttaki mini şeritte kalır.
  *Tuzak:* yapışkanlık için sağ sütun satır yüksekliğine gerilmeli — `.layout`'a
  `align-items: start` eklemek sütunu içeriği kadar kısaltır ve kayacak alan bırakmaz.
- Karar ölçeğinin %0–20'de bitmesi. Değiştirirseniz `GAUGE_MAX` ile kapının CSS'teki konumunu
  **birlikte** güncelleyin (test ikisinin tutarlılığını sınar).
- cT evre rehberinin merdiven biçimi: omurga + basamak, etkin dalda omurga mürekkep mavisine döner.
  Yapıyı (`.ct-rung` / `.ct-node` / `.ct-sub` / `.ct-text`) koruyun, görünümü değiştirin.

### Yeniden tasarım yaparken doğrulama

Görsel çalışma bittiğinde üçü de yeşil olmalı:

```bash
node --check app.js
python3 tools/reconstruct_nomogram.py     # çıkış kodu 0
```

ve `http://localhost:8123/tests/` → 86/86. Ardından `sw.js` içindeki `CACHE_VERSION` ile alt
bilgideki sürüm damgasını artırın.

## Kapsam sınırı

Bu site CE işaretli bir tıbbi cihaz değildir ve öyleymiş gibi sunulmamalıdır. Sonuç sayfasındaki
feragat, kaynak şeridi ve "Model ayrıntıları" bölümündeki yüksek riskli hasta uyarısı (Di Pierro
GB, ve ark. *Cancers* 2023;15:1683) bilinçli olarak oradadır — kaldırmayın.
