# Briganti Nomogramı (2017 & 2019)

Prostat kanserinde **lenf nodu invazyonu (LNİ)** riskini hesaplayan ücretsiz, üyeliksiz ve çevrimdışı
çalışan web uygulaması. Tüm hesaplama tarayıcıda yapılır — sunucu yok, hasta verisi hiçbir yere
gönderilmez.

## Dosyalar

| Dosya | İçerik |
| --- | --- |
| `index.html` | Tek sayfa uygulama: sekmeler, iki form, sonuç paneli |
| `styles.css` | Mobil öncelikli tasarım, açık + koyu tema |
| `app.js` | Model katsayıları, canlı hesaplama, doğrulama, PWA kancaları |
| `manifest.json` | "Ana ekrana ekle" için PWA tanımı |
| `sw.js` | Service worker — uygulama kabuğunu önbelleğe alır |
| `icons/` | 192 / 512 / maskable-512 PNG simgeler |
| `tools/reconstruct_nomogram.py` | Katsayıları yayınlanmış şekillerden yeniden türeten denetim betiği |
| `tests/index.html` | Tarayıcıda çalışan otomatik test paketi |

## Modellerin değişkenleri

Değişken listeleri ve geçerli aralıklar, birincil kaynaklardan ve modellerin resmî uygulaması olan
Evidencio model 1555'ten doğrulanmıştır.

**Briganti 2017** — Gandaglia G, ve ark. *Eur Urol* 2017;72:632–640
([Evidencio v3.0](https://www.evidencio.com/models/show/1555?v=3.0))
1. Ameliyat öncesi PSA (0–50 ng/mL)
2. Klinik T evresi — model T1 / T2 / T3 olarak kodlar (arayüzde cT1–cT4 seçilir)
3. Biyopsi ISUP derece grubu (1–5)
4. En yüksek dereceli kanser içeren kor yüzdesi (0–100 %)
5. Daha düşük dereceli kanser içeren kor yüzdesi (0–90 %)

**Briganti 2019** — Gandaglia G, ve ark. *Eur Urol* 2019;75:506–514
([Evidencio v4.0](https://www.evidencio.com/models/show/1555?v=4.0))
1. Ameliyat öncesi PSA (0–80 ng/mL)
2. mpMR'de klinik evre — model organa sınırlı / ekstrakapsüler yayılım / seminal vezikül
   invazyonu olarak kodlar (arayüzde cT1–cT4 seçilir)
3. mpMR'de maksimum indeks lezyon çapı (0–45 mm)
4. MR-hedefli biyopside ISUP derece grubu (1–5)
5. Sistematik biyopside klinik anlamlı kanser (ISUP ≥ 2) içeren kor yüzdesi (0–100 %)

> PI-RADS skoru ve hedefli biyopsideki maksimum tümör uzunluğu 2019 modelinin bağımsız değişkenleri
> **değildir**; bu nedenle forma alınmamıştır.

## Katsayılar

Model `app.js` içindeki tek bir `MODELS` nesnesinde tanımlıdır:

```
logit = sabit + Σ (β_i · x_i)
risk  = 1 / (1 + e^(-logit))
```

Her iki makale de beta katsayılarını "Supplementary Table 1"e bırakır; ana metinde yalnızca
yuvarlanmış odds oranları vardır. Katsayılar bu nedenle **yayınlanmış nomogram şekillerinin
(Şekil 1) geometrisinden geri hesaplanmıştır**: bir nomogramda puan eksenleri β ile doğru orantılı,
risk ekseni ise logit'te doğrusaldır; bu iki ilişki hem her β'yı hem de sabit terimi verir. Şekiller
piksel düzeyinde ölçüldü (risk ekseni doğrusal uyumu: maksimum sapma 0,003 logit).

Kullanılan değerler:

| | Sabit | PSA | Evre | ISUP 3 | ISUP 4-5 | Diğer |
| --- | --- | --- | --- | --- | --- | --- |
| **2017** | −5,8703 | 0,082563 /ng/mL | T2 0,848608 · T3 1,053999 | 2,266660 | 2,674664 | en yüksek dereceli kor 0,026832 /% · daha düşük dereceli kor 0,013946 /% |
| **2019** | −4,5504 | 0,041586 /ng/mL | EKY 1,221484 · SVİ 1,466866 | 1,203860 | 1,805790 | lezyon çapı 0,031151 /mm · csPCa kor 0,011930 /% |

### Doğrulama

1. **Odds oranları** — geri hesaplanan değerler makalelerin Tablo 2'siyle yuvarlama farkı içinde
   örtüşür (2017 Model 1: ISUP 4-5 14,508 vs 14,5; T3 2,869 vs 2,87 — 2019 Model 5: EKY 3,392 vs
   3,39; ISUP 3 3,333 vs 3,33; ISUP 4-5 6,085 vs 6,08).
2. **Sabit terim** — katsayılardan bağımsız olarak, makalelerin bildirdiği "%7 eşiğinin altında kalan
   hasta oranı" kohort dağılımlarıyla yeniden üretildi: 2017 için %68 (yayın: %69), 2019 için %57
   (yayın: %57).

> Not: modellerin resmî uygulaması olan Evidencio, Briganti algoritmalarını artık ücretli abonelik
> arkasında sunmaktadır ("This is a paid algorithm"), dolayısıyla resmî hesaplayıcıyla doğrudan
> karşılaştırma yapılamamıştır.

**ISUP gruplandırması** — her iki yayın da derece gruplarını 1-2 / 3 / 4-5 olarak kategorize eder;
bu nedenle ISUP 1 ile 2 ve ISUP 4 ile 5 aynı riski verir. Bu modelin kendi tercihidir.

**cT evresi eşlemesi** — arayüzde klinik evre cT1, cT2, cT3a, cT3b, cT4 olarak seçilir (alt evrelerin
tanımları formdaki açılır listede). Modellerin evre değişkeni ise yalnızca üç kategoriden oluşur,
dolayısıyla seçenekler şu şekilde eşlenir (`app.js` → `stageOptions`):

| Arayüz | 2017 modeli | 2019 modeli |
| --- | --- | --- |
| cT1 | T1 | organa sınırlı |
| cT2 | T2 | organa sınırlı |
| cT3a | T3 | ekstrakapsüler yayılım |
| cT3b | T3 | seminal vezikül invazyonu |
| cT4 | T3 | seminal vezikül invazyonu |

Her iki modelin geliştirme kohortunda cT4 hasta yoktur; bu seçenekte en yüksek evre katsayısı
kullanılır ve arayüzde ekstrapolasyon uyarısı gösterilir.

## Denetim — katsayıları kendiniz doğrulayın

Katsayıların doğruluğu kimsenin sözüne bağlı değildir; iki bağımsız yolla yeniden üretilebilir.

### 1. Yeniden türetme betiği

```bash
python3 tools/reconstruct_nomogram.py
```

Harici bağımlılık yoktur. Betik, şekillerden okunan piksel konumlarından katsayıları yeniden
hesaplar ve şunları raporlar: `app.js` ile birebir karşılaştırma, yayınların Tablo 2 odds
oranlarıyla karşılaştırma, sabit terimin "%7 eşiği altındaki hasta oranı" ile sınanması ve ±1 piksel
ölçüm belirsizliğinin sonuca etkisi. Bir uyuşmazlık varsa çıkış kodu 1 olur.

Makalelerin PDF'lerine sahipseniz şekilleri sıfırdan yeniden ölçtürebilirsiniz:

```bash
python3 tools/reconstruct_nomogram.py --pdf-2017 <2017.pdf> --pdf-2019 <2019.pdf>
```

Bu durumda betik nomogram görüntüsünü PDF'ten çıkarır, eksen çizgilerini kendisi bulur ve depodaki
kayıtlı ölçümlerle karşılaştırır. (Nomogram şekilleri yayıncıya ait telif korumalı içeriktir, bu
depoda bulunmaz; kendi kopyanızı kullanın. JPEG çözmek için Pillow, `sips` veya ImageMagick'ten biri
gerekir.)

### 2. Otomatik testler

```bash
python3 -m http.server 8123
```

Sonra `http://localhost:8123/tests/` adresini açın. Test sayfası gerçek uygulamayı bir iframe içinde
yükler ve 51 kontrol çalıştırır: katsayıların betiğin türettiği değerlerle birebir aynı olması,
yayınlanmış odds oranlarıyla tutarlılık, elle doğrulanmış referans senaryolar, ISUP gruplandırması,
%7 eşiği davranışı ve renk kodlaması, girdi aralıkları, kor yüzdesi hesaplayıcısı ve arayüz
davranışı. (`file://` ile açmayın — iframe erişimi engellenir.)

## Karar eşiği

EAU kılavuzlarına göre tahmini LNİ riski **%7 ve üzerindeyse** ePLND önerilir. Eşik, `app.js`
içindeki `EAU_THRESHOLD` sabitidir.

Yüksek riskli hastalıkla sınırlı kohortlarda nomogramların ayırt ediciliği düşüktür: 150 yüksek riskli
olguluk tek merkezli seride (LNİ %26) önerilen eşikte duyarlılık 0,97 (2017) ve 0,96 (2019), özgüllük
0,14 ve 0,18, AUC 0,56 ve 0,57 bulunmuştur — Di Pierro GB, ve ark. *Cancers* 2023;15:1683.

## Yerelde çalıştırma

Service worker yalnızca `http(s)` üzerinden kaydolur, bu yüzden `file://` yerine sunucu kullanın:

```bash
python3 -m http.server 8123
```

Ardından `http://localhost:8123` adresini açın.

## Yayınlama

Depo GitHub Pages ile yayınlanır: `main` dalına yapılan her push birkaç dakika içinde canlıya çıkar.
Yeni sürümde `sw.js` içindeki `CACHE_VERSION` değerini artırmayı unutmayın; aksi halde mevcut
kullanıcılar önbellekteki eski sürümde kalır.
