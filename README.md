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

## Modellerin değişkenleri

Değişken listeleri ve geçerli aralıklar, birincil kaynaklardan ve modellerin resmî uygulaması olan
Evidencio model 1555'ten doğrulanmıştır.

**Briganti 2017** — Gandaglia G, ve ark. *Eur Urol* 2017;72:632–640
([Evidencio v3.0](https://www.evidencio.com/models/show/1555?v=3.0))
1. Ameliyat öncesi PSA (0–50 ng/mL)
2. Klinik T evresi (T1 / T2 / T3)
3. Biyopsi ISUP derece grubu (1–5)
4. En yüksek dereceli kanser içeren kor yüzdesi (0–100 %)
5. Daha düşük dereceli kanser içeren kor yüzdesi (0–90 %)

**Briganti 2019** — Gandaglia G, ve ark. *Eur Urol* 2019;75:506–514
([Evidencio v4.0](https://www.evidencio.com/models/show/1555?v=4.0))
1. Ameliyat öncesi PSA (0–50 ng/mL)
2. mpMR'de klinik evre (organa sınırlı / ekstrakapsüler yayılım / seminal vezikül invazyonu)
3. mpMR'de maksimum indeks lezyon çapı (0–45 mm)
4. MR-hedefli biyopside ISUP derece grubu (1–5)
5. Sistematik biyopside klinik anlamlı kanser (ISUP ≥ 2) içeren kor yüzdesi (0–100 %)

> PI-RADS skoru ve hedefli biyopsideki maksimum tümör uzunluğu 2019 modelinin bağımsız değişkenleri
> **değildir**; bu nedenle forma alınmamıştır.

## ⚠️ Katsayı durumu

Model `app.js` içindeki tek bir `MODELS` nesnesinde tanımlıdır:

```
logit = sabit + Σ (β_i · x_i)
risk  = 1 / (1 + e^(-logit))
```

Briganti nomogramlarının **beta katsayıları ve sabit terimi açık literatürde yayımlanmamıştır**;
orijinal makaleler modeli puan tablosu (nomogram şekli) olarak sunar ve modellerin resmî uygulaması
olan Evidencio formülü paylaşmaz ("No Formula defined"). Bu depodaki β değerleri, yayınlanan risk
yapısını yeniden üreten **yaklaşık log-odds** değerleridir: değişkenler, aralıklar ve risk sıralaması
doğrudur, ancak mutlak yüzdeler resmî nomogramın birebir çıktısı değildir.

Orijinal makalelerin katsayı tablosuna (veya ek/supplementary materyaline) eriştiğinizde yalnızca
`MODELS` nesnesindeki `intercept`, `continuous` ve `categorical` değerlerini değiştirmeniz yeterlidir;
uygulamanın hiçbir yerinde model sabit kodlanmamıştır.

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
