# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

Prostat kanserinde **lenf nodu invazyonu (LNİ)** riskini hesaplayan tek sayfalık web uygulaması:
Briganti 2017 (sistematik biyopsi) ve Briganti 2019 (mpMR-hedefli biyopsi) nomogramları. Üyeliksiz,
sunucusuz, çevrimdışı çalışır. Hedef kullanıcı, EAU'nun **%7 eşiğine** göre genişletilmiş pelvik lenf
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
| Testler | `http://localhost:8123/tests/` — 86 kontrol, tarayıcıda çalışır |
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
- **Sınıflar**: `.ct-rung` / `.ct-node` / `.ct-sub` / `.ct-text`, durum sınıfları
  `.is-active` / `.is-safe` / `.is-risk` / `.is-shown` / `.is-tucked`.
- `#stagecur-<model>` **yalnızca tanım metnini** içermelidir: bir test onun tüm `textContent`'ini
  merdivendeki `.ct-text` ile karşılaştırır. İçine etiket eklemeyin (görsel önek gerekirse CSS
  `::before` kullanın).

### CSS ↔ JS bağlantıları

- `GAUGE_MAX` (`app.js`) ile `.gauge-gate { left }` (`styles.css`) birbirine bağlıdır: kapının
  konumu `EAU_THRESHOLD / GAUGE_MAX` olmalıdır. Tutarlılık test paketinde sınanır — biri diğerinden
  habersiz değişirse gösterge sessizce yanlış yer göstermek yerine test kırmızıya döner.
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
- **Yüzde işareti sayının önüne yazılır** (%7 — `7%` değil).
- Açık ve koyu tema birlikte desteklenir (`prefers-color-scheme`); yeni renk eklerken ikisini de
  tanımlayın.
- Dokunma hedefleri en az ~44 px; girdilerde `font-size: 16px` (iOS odakta yakınlaştırmasın).
- Yukarıdaki **HTML ↔ test sözleşmesi** ve **CSS ↔ JS bağlantıları** bölümleri bağlayıcıdır.
  Görünüm tamamen değişse de o ID, öznitelik ve sınıflar yerinde kalmalı; aksi hâlde 86 testin
  büyük kısmı kırılır. Sarmalayıcı eklemek, sınıf eklemek, düzeni değiştirmek serbesttir.

### Yalnızca mevcut tasarımın tercihi (değiştirilebilir)

- Doygun rengin yalnızca karara (eşik altı yeşil / eşik üstü kırmızı) ayrılması, arayüzün geri
  kalanının nötr çizilmesi. *Gerekçe:* kart, sekme ve başlık da renkliyken sonucun sinyali
  zayıflıyordu. Yeni tasarım bunu başka yolla çözebilir; çözdüğünden emin olun.
- Sayısal değerlerin tabular monospace ile dizilmesi (PSA, yüzdeler, cT kodları, risk).
- Geniş ekranda sağ sütunda yapışkan sonuç kartı + telefonda alttaki mini şerit.
  *Tuzak:* yapışkanlık için sağ sütun satır yüksekliğine gerilmeli — kapsayıcıya
  `align-items: start` eklemek sütunu içeriği kadar kısaltır ve kayacak alan bırakmaz.
- Karar ölçeğinin %0–20'de bitmesi. Değiştirirseniz `GAUGE_MAX` ile kapının CSS'teki konumunu
  **birlikte** güncelleyin (test ikisinin tutarlılığını sınar).
- cT evre rehberinin merdiven biçimi. Yapıyı (`.ct-rung` / `.ct-node` / `.ct-sub` / `.ct-text`)
  koruyun, görünümü değiştirin.

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
