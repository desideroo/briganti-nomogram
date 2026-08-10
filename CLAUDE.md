# Briganti Nomogram Calculator (2017 & 2019) - Project Specification

## Project Overview
This project is a free, web-based clinical decision support tool designed for urologists to calculate the risk of Lymph Node Invasion (LNI) in prostate cancer patients using the **Briganti 2017** and **Briganti 2019 (MRI-targeted)** nomograms.

The main goal is to provide an instant, frictionless, zero-login, and mobile-friendly alternative to paid platforms (like Evidencio), helping urologists decide whether to perform Extended Pelvic Lymph Node Dissection (ePLND) based on European Association of Urology (EAU) guidelines (7% risk threshold).

---

## Core Features & Requirements

### 1. General UI/UX Requirements
- **No Login / Immediate Access:** The application must be instantly usable upon page load with zero registration or paywalls.
- **Modern, Clean & Mobile-First Design:** Optimized for fast data entry in clinic or operating room settings.
- **Tabbed Interface:** Easy switching between **Briganti 2017** and **Briganti 2019** models.
- **Instant Client-Side Calculation:** Calculations happen automatically via JavaScript without backend requests.
- **Visual Risk Guidance (EAU Threshold):**
  - **Risk < 7%:** Highlighted in Green -> *"Risk is below the 7% threshold. ePLND can be safely spared."*
  - **Risk ≥ 7%:** Highlighted in Red -> *"Risk is 7% or higher. Extended Pelvic Lymph Node Dissection (ePLND) is recommended."*
- **PWA (Progressive Web App) Ready:** Must include a `manifest.json` and `service-worker.js` so urologists can click "Add to Home Screen" on iOS/Android and use it offline without internet access.

---

## Clinical Parameters & Input Specifications

### A. Briganti 2017 Nomogram
Calculates LNI risk based on standard systematic biopsy parameters:
1. **Serum PSA (ng/mL):** Decimal input field.
2. **Clinical T Stage:** Dropdown selector:
   - `T1c`
   - `T2a`
   - `T2b`
   - `T2c / T3a`
3. **Biopsy Gleason Score / Grade Group:** Dropdown explicitly showing Gleason scores:
   - `3 + 3 (ISUP Grade Group 1)`
   - `3 + 4 (ISUP Grade Group 2)`
   - `4 + 3 (ISUP Grade Group 3)`
   - `4 + 4 / 3 + 5 / 5 + 3 (ISUP Grade Group 4)`
   - `4 + 5 / 5 + 4 / 5 + 5 (ISUP Grade Group 5)`
4. **Percentage of Positive Biopsy Cores (%):** Percentage input (Positive cores / Total cores ratio).
5. **Maximum Tumor Length (mm):** Numerical input for cancer core length.

---

### B. Briganti 2019 Nomogram (MRI-Targeted)
Calculates LNI risk adapted for multiparametric MRI (mpMRI) and fusion biopsy:
1. **Serum PSA (ng/mL):** Decimal input field.
2. **Clinical T Stage:** Dropdown selector:
   - `T1 / T2a`
   - `T2b / T2c`
   - `≥ T3a`
3. **Biopsy Gleason Score / Grade Group:** Dropdown explicitly showing Gleason scores:
   - `3 + 3 (ISUP Grade Group 1)`
   - `3 + 4 (ISUP Grade Group 2)`
   - `4 + 3 (ISUP Grade Group 3)`
   - `4 + 4 / 3 + 5 / 5 + 3 (ISUP Grade Group 4)`
   - `4 + 5 / 5 + 4 / 5 + 5 (ISUP Grade Group 5)`
4. **mpMRI PI-RADS Score:** Dropdown selector:
   - `PI-RADS 3`
   - `PI-RADS 4`
   - `PI-RADS 5`
5. **mpMRI Lesion Diameter (mm):** Numerical input for maximum MRI lesion size.
6. **Percentage of Positive Cores in Systematic Biopsy (%):** Percentage input.
7. **Maximum Tumor Length in Targeted Biopsy (mm):** Numerical input for cancer length in MRI-targeted cores.

---

---

## ⚠️ Uygulama Notu (2026-08-08) — Değişken setleri düzeltildi

Yukarıdaki A ve B bölümlerindeki parametre listeleri, yayınlanmış Briganti modelleriyle **birebir
örtüşmüyordu**. Uygulama, birincil kaynaklara ve modellerin resmî uygulamasına (Evidencio model 1555)
göre düzeltilmiş değişken setleriyle geliştirildi:

- **2017**: `Maksimum tümör uzunluğu` modelde yoktur. Bunun yerine iki ayrı kor yüzdesi vardır:
  *en yüksek dereceli* ve *daha düşük dereceli* kanser içeren kor yüzdesi. Klinik evre T1/T2/T3'tür.
- **2019**: `PI-RADS skoru` ve `hedefli biyopside maksimum tümör uzunluğu` modelin bağımsız
  değişkenleri değildir. Klinik evre mpMR'ye göre organa sınırlı / ekstrakapsüler yayılım / seminal
  vezikül invazyonu olarak kodlanır; kor yüzdesi ise "klinik anlamlı kanser (ISUP ≥ 2) içeren kor
  yüzdesi"dir.
- Beta katsayıları makalelerin "Supplementary Table 1"indedir ve ana metinde yoktur. `app.js` içindeki
  değerler, yayınlanmış nomogram şekillerinin (Şekil 1) geometrisinden geri hesaplanmış; makalelerin
  Tablo 2 odds oranlarıyla ve bildirilen "%7 eşiği altındaki hasta oranı" ile doğrulanmıştır.
  Ayrıntı için `README.md`.
- Her iki model de ISUP derece grubunu 1-2 / 3 / 4-5 olarak kategorize eder.

---

## Technical Stack & Output Deliverables
- Single Page Web App using pure HTML5, CSS3, and JavaScript (Vanilla) or Tailwind CSS.
- Production-ready files: `index.html`, `styles.css`, `app.js`, `manifest.json`, `sw.js`.
- Responsive layout that fits nicely on both smartphone screens and desktop monitors.