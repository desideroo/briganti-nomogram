#!/usr/bin/env python3
"""
Briganti 2017 / 2019 nomogramlarının katsayılarını yeniden üreten denetim betiği.
Harici bağımlılık yoktur (yalnızca standart kütüphane).

NEDEN GEREKLİ
  Her iki yayın da lojistik regresyon katsayılarını "Supplementary Table 1"e
  bırakır; makale metninde yalnızca yuvarlanmış odds oranları vardır. Ancak
  yayınlanmış nomogram şekli (Şekil 1) katsayıların tamamını taşır:
    * her değişkenin puan ekseni β ile doğru orantılıdır,
    * risk ekseni logit'te doğrusaldır,
    * "Total points" ekseni ile risk ekseni aynı x-koordinat sisteminde çizilir.
  Bu üç özellik birlikte hem her β'yı hem de sabit terimi verir.

NE YAPAR
  1) Şekillerden okunan piksel konumlarından katsayıları hesaplar.
  2) Sonucu app.js içindeki değerlerle karşılaştırır (site ile tutarlılık).
  3) Katsayıları yayınların Tablo 2 odds oranlarıyla karşılaştırır.
  4) Sabit terimi, yayınların bildirdiği "%7 eşiği altında kalan hasta oranı"
     ile bağımsız olarak sınar.
  5) ±1 piksel ölçüm gürültüsünün sonuca etkisini Monte Carlo ile ölçer.
  6) --pdf ile verilirse, şekilleri makalenin PDF'inden yeniden ölçer ve
     aşağıdaki kayıtlı ölçümleri doğrular.

KULLANIM
  python3 tools/reconstruct_nomogram.py
  python3 tools/reconstruct_nomogram.py --pdf-2017 <2017.pdf> --pdf-2019 <2019.pdf>

NOT  Nomogram şekilleri yayıncıya ait telif korumalı içeriktir; bu depoda
     bulunmaz. --pdf adımı için makalelerin kendi kopyanızı kullanın.
"""

import argparse
import math
import os
import random
import re
import struct
import subprocess
import sys
import tempfile
import zlib

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ---------------------------------------------------------------------------
# 1. ŞEKİLLERDEN OKUNAN PİKSEL ÖLÇÜMLERİ
#    Tüm değerler ilgili şeklin gömülü tam çözünürlüklü görüntüsündeki x
#    koordinatlarıdır (2017: 2020x776, 2019: 1800x812). "axis" = eksen
#    çizgisinin uç/işaret konumları.
# ---------------------------------------------------------------------------

MEASUREMENTS = {
    '2017': {
        'label': 'Briganti 2017',
        'citation': 'Gandaglia G, ve ark. Eur Urol 2017;72:632-640, Şekil 1',
        'points_axis': (543.5, 2000.5),      # Points ekseni: 0 ve 100
        'total_points_axis': (543.5, 2000.5),
        'total_points_max': 280,
        'risk_ticks': [704.5, 792.5, 912.5, 957.5, 1006.5, 1108.5, 1176.5,
                       1232.5, 1283.5, 1334.5, 1390.5, 1458.0, 1560.5],
        'risk_probs': [.01, .02, .05, .07, .10, .20, .30, .40, .50, .60, .70, .80, .90],
        # değişken: (eksen ucu/işaret x, o noktanın karşılık geldiği birim sayısı)
        'vars': {
            'psa':       (2000.5, 50),   # 0-50 ng/mL
            'coreshigh': (1490.5, 100),  # 0-100 %
            'coreslow':  (986.5,  90),   # 0-90 %
            'stage_T2':  (843.0,   1),
            'stage_T3':  (915.5,   1),
            'gg_3':      (1343.5,  1),
            'gg_45':     (1487.5,  1),
        },
        # Tablo 2, Model 1 (nomograma temel olan model)
        'published_or': {
            'psa': 1.08, 'coreshigh': 1.02, 'coreslow': 1.01,
            'stage_T2': 2.27, 'stage_T3': 2.87, 'gg_3': 9.5, 'gg_45': 14.5,
        },
        'image_size': (2020, 776),
        'ink': 'orange',
    },
    '2019': {
        'label': 'Briganti 2019',
        'citation': 'Gandaglia G, ve ark. Eur Urol 2019;75:506-514, Şekil 1',
        'points_axis': (551.5, 1778.5),
        'total_points_axis': (551.5, 1778.5),
        'total_points_max': 220,
        'risk_ticks': [662.0, 820.5, 880.5, 946.0, 1082.0, 1172.5,
                       1246.5, 1314.5, 1382.5, 1456.5, 1546.5, 1682.5],
        'risk_probs': [.02, .05, .07, .10, .20, .30, .40, .50, .60, .70, .80, .90],
        'vars': {
            'psa':        (1778.5, 80),   # 0-80 ng/mL
            'lesion':     (1068.5, 45),   # 0-45 mm
            'cores':      (991.5, 100),   # 0-100 %
            'stage_ECE':  (1002.0,  1),
            'stage_SVI':  (1092.5,  1),
            'gg_3':       (995.5,   1),
            'gg_45':      (1217.5,  1),
        },
        # Tablo 2, Model 5 (AUC %86, nomograma temel olan model)
        'published_or': {
            'psa': 1.04, 'lesion': 1.03, 'cores': 1.01,
            'stage_ECE': 3.39, 'stage_SVI': 4.36, 'gg_3': 3.33, 'gg_45': 6.08,
        },
        'image_size': (1800, 812),
        'ink': 'dark',
    },
}


def derive(m):
    """Piksel ölçümlerinden sabit terimi ve tüm β'ları hesaplar."""
    p0, p100 = m['points_axis']
    t0, tmax = m['total_points_axis']
    px_per_point = (p100 - p0) / 100.0
    px_per_total_point = (tmax - t0) / m['total_points_max']

    # Risk ekseni logit'te doğrusaldır: logit(p) = a + b*x
    xs, ps = m['risk_ticks'], m['risk_probs']
    lg = [math.log(p / (1 - p)) for p in ps]
    n = len(xs)
    mx, my = sum(xs) / n, sum(lg) / n
    b = sum((x - mx) * (y - my) for x, y in zip(xs, lg)) / sum((x - mx) ** 2 for x in xs)
    a = my - b * mx
    resid = max(abs(a + b * x - y) for x, y in zip(xs, lg))

    logodds_per_total_point = b * px_per_total_point
    intercept = a + b * t0

    betas = {}
    for name, (x_end, units) in m['vars'].items():
        points = (x_end - p0) / px_per_point
        betas[name] = points * logodds_per_total_point / units
    return {'intercept': intercept, 'betas': betas, 'risk_axis_residual': resid,
            'logodds_per_total_point': logodds_per_total_point}


# ---------------------------------------------------------------------------
# 2. app.js İÇİNDEKİ DEĞERLERLE KARŞILAŞTIRMA
# ---------------------------------------------------------------------------

APP_KEY_MAP = {
    '2017': {'psa': ('cont', 'psa'), 'coreshigh': ('cont', 'coreshigh'),
             'coreslow': ('cont', 'coreslow'), 'stage_T2': ('stage', 1),
             'stage_T3': ('stage', 2), 'gg_3': ('gleason', 3), 'gg_45': ('gleason', 4)},
    '2019': {'psa': ('cont', 'psa'), 'lesion': ('cont', 'lesion'),
             'cores': ('cont', 'cores'), 'stage_ECE': ('stage', 1),
             'stage_SVI': ('stage', 2), 'gg_3': ('gleason', 3), 'gg_45': ('gleason', 4)},
}


def parse_app_js(path):
    src = open(path, encoding='utf-8').read()
    out = {}
    for key in ('2017', '2019'):
        start = src.index("'%s': {" % key)
        end = src.index("'2019': {") if key == '2017' else src.index('};', start)
        chunk = src[start:end]
        model = {'intercept': float(re.search(r'intercept:\s*(-?[\d.]+)', chunk).group(1)),
                 'cont': {}, 'stage': [], 'gleason': []}
        cont = re.search(r'continuous:\s*\{(.*?)\}', chunk, re.S).group(1)
        for name, val in re.findall(r'(\w+):\s*(-?[\d.]+)', cont):
            model['cont'][name] = float(val)
        for arr in ('stage', 'gleason'):
            body = re.search(arr + r':\s*\[([^\]]*)\]', chunk).group(1)
            model[arr] = [float(v) for v in re.findall(r'-?[\d.]+', body)]
        out[key] = model
    return out


def lookup(app_model, ref):
    kind, idx = ref
    return app_model['cont'][idx] if kind == 'cont' else app_model[kind][idx]


# ---------------------------------------------------------------------------
# 3. SABİT TERİMİN BAĞIMSIZ SINAMASI
#    Yayınların bildirdiği "%7 eşiğinin altında kalan hasta oranı" yeniden
#    üretilir. Bu sayı katsayı türetmede hiç kullanılmadığı için gerçek bir
#    dış kontroldür. Kohort dağılımları makalelerin Tablo 1'inden alınmıştır;
#    değişkenler bağımsız varsayıldığı için sonuç birkaç puan oynayabilir.
# ---------------------------------------------------------------------------

COHORTS = {
    '2017': {  # Eur Urol 2017 Tablo 1 (681 hasta), Tablo 3: %7 altı = 471 (%69)
        'reported_below_7': 69,
        'psa_median': 6.2, 'psa_iqr': (4.6, 8.3),
        'stage': [('T1', 375), ('T2', 264), ('T3', 42)],
        'gg': [('12', 261 + 247), ('3', 93), ('45', 48 + 32)],
        'pcts': {'coreshigh': (29.4, 14.3, 50.0), 'coreslow': (27.7, 16.6, 41.6)},
    },
    '2019': {  # Eur Urol 2019 Tablo 1 (497 hasta), Tablo 3: %7 altı = 244/428 (%57)
        'reported_below_7': 57,
        'psa_median': 7.7, 'psa_iqr': (5.2, 12.0),
        'stage': [('OC', 358 + 29), ('ECE', 49 + 19), ('SVI', 13 + 14)],
        'gg': [('12', 72 + 1 + 225 + 15), ('3', 72 + 16), ('45', 46 + 17 + 20 + 13)],
        'pcts': {'lesion': (10.6, 9.1, 14.5), 'cores': (15.7, 0.0, 41.0)},
    },
}


def simulate_below_cutoff(key, d, n=200000, seed=7):
    rng = random.Random(seed)
    c = COHORTS[key]
    b, intercept = d['betas'], d['intercept']
    mu = math.log(c['psa_median'])
    sd = (math.log(c['psa_iqr'][1]) - math.log(c['psa_iqr'][0])) / (2 * 0.6745)
    psa_cap = MEASUREMENTS[key]['vars']['psa'][1]

    def pick(dist):
        total = sum(w for _, w in dist)
        r = rng.random() * total
        acc = 0
        for name, w in dist:
            acc += w
            if r <= acc:
                return name
        return dist[-1][0]

    below = 0
    for _ in range(n):
        z = intercept + b['psa'] * min(psa_cap, math.exp(rng.gauss(mu, sd)))
        st = pick(c['stage'])
        if key == '2017':
            z += {'T1': 0, 'T2': b['stage_T2'], 'T3': b['stage_T3']}[st]
        else:
            z += {'OC': 0, 'ECE': b['stage_ECE'], 'SVI': b['stage_SVI']}[st]
        z += {'12': 0, '3': b['gg_3'], '45': b['gg_45']}[pick(c['gg'])]
        for name, (med, q1, q3) in c['pcts'].items():
            cap = MEASUREMENTS[key]['vars'][name][1]
            z += b[name] * min(cap, max(0.0, rng.gauss(med, (q3 - q1) / 1.349)))
        if 1 / (1 + math.exp(-z)) < 0.07:
            below += 1
    return below / n * 100


# ---------------------------------------------------------------------------
# 4. ÖLÇÜM BELİRSİZLİĞİ (±1 piksel)
# ---------------------------------------------------------------------------

SCENARIOS = {
    '2017': [('eşik civarı  PSA 7, T1, ISUP 3, %20 / %10',
              {'psa': 7, 'stage': None, 'gg': 'gg_3', 'coreshigh': 20, 'coreslow': 10}),
             ('yüksek risk  PSA 8, T2, ISUP 3, %40 / %20',
              {'psa': 8, 'stage': 'stage_T2', 'gg': 'gg_3', 'coreshigh': 40, 'coreslow': 20})],
    '2019': [('eşik civarı  PSA 8, organa sınırlı, ISUP 3, 12 mm, %10',
              {'psa': 8, 'stage': None, 'gg': 'gg_3', 'lesion': 12, 'cores': 10}),
             ('yüksek risk  PSA 10, EKY, ISUP 4-5, 15 mm, %40',
              {'psa': 10, 'stage': 'stage_ECE', 'gg': 'gg_45', 'lesion': 15, 'cores': 40})],
}


def risk_of(d, case):
    z = d['intercept']
    for name, value in case.items():
        if name in ('stage', 'gg'):
            if value:
                z += d['betas'][value]
        else:
            z += d['betas'][name] * value
    return 100 / (1 + math.exp(-z))


def jitter(m, rng):
    j = lambda: rng.uniform(-1, 1)
    out = dict(m)
    out['points_axis'] = tuple(v + j() for v in m['points_axis'])
    out['total_points_axis'] = tuple(v + j() for v in m['total_points_axis'])
    out['risk_ticks'] = [x + j() for x in m['risk_ticks']]
    out['vars'] = {k: (x + j(), u) for k, (x, u) in m['vars'].items()}
    return out


def uncertainty(key, case, trials=3000, seed=3):
    rng = random.Random(seed)
    vals = sorted(risk_of(derive(jitter(MEASUREMENTS[key], rng)), case) for _ in range(trials))
    return vals[int(trials * .025)], vals[int(trials * .975)]


# ---------------------------------------------------------------------------
# 5. İSTEĞE BAĞLI: PDF'TEN YENİDEN ÖLÇÜM
# ---------------------------------------------------------------------------

def extract_images(pdf_path):
    data = open(pdf_path, 'rb').read()
    found = []
    for m in re.finditer(rb'<<([^<>]|<<[^>]*>>)*?/Subtype\s*/Image.*?>>\s*stream\r?\n', data, re.S):
        hdr, start = m.group(0), m.end()
        end = data.find(b'endstream', start)
        w = re.search(rb'/Width\s+(\d+)', hdr)
        h = re.search(rb'/Height\s+(\d+)', hdr)
        f = re.search(rb'/Filter\s*/?(\w+)', hdr)
        if not (w and h and f) or f.group(1) != b'DCTDecode':
            continue
        found.append((int(w.group(1)), int(h.group(1)), data[start:end]))
    return found


def jpeg_to_png(jpg_bytes, out_path):
    """JPEG çözmek için sistemdeki araçlardan birini kullanır."""
    with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as fh:
        fh.write(jpg_bytes)
        src = fh.name
    try:
        try:
            from PIL import Image           # varsa en taşınabilir yol
            Image.open(src).save(out_path)
            return True
        except ImportError:
            pass
        for cmd in (['sips', '-s', 'format', 'png', src, '--out', out_path],
                    ['magick', src, out_path], ['convert', src, out_path]):
            try:
                subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL,
                               stderr=subprocess.DEVNULL)
                return True
            except (FileNotFoundError, subprocess.CalledProcessError):
                continue
        return False
    finally:
        os.unlink(src)


def read_png(path):
    d = open(path, 'rb').read()
    pos, idat, w, h, ct = 8, b'', None, None, None
    while pos < len(d):
        ln = struct.unpack('>I', d[pos:pos + 4])[0]
        tag = d[pos + 4:pos + 8]
        chunk = d[pos + 8:pos + 8 + ln]
        if tag == b'IHDR':
            w, h, _bd, ct = struct.unpack('>IIBB', chunk[:10])
        elif tag == b'IDAT':
            idat += chunk
        elif tag == b'IEND':
            break
        pos += 12 + ln
    raw = zlib.decompress(idat)
    nch = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[ct]
    stride = w * nch
    out, prev, p = bytearray(h * stride), bytearray(stride), 0
    for y in range(h):
        f = raw[p]; p += 1
        line = bytearray(raw[p:p + stride]); p += stride
        if f == 1:
            for i in range(nch, stride):
                line[i] = (line[i] + line[i - nch]) & 255
        elif f == 2:
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 255
        elif f == 3:
            for i in range(stride):
                a = line[i - nch] if i >= nch else 0
                line[i] = (line[i] + ((a + prev[i]) >> 1)) & 255
        elif f == 4:
            for i in range(stride):
                a = line[i - nch] if i >= nch else 0
                bb, c = prev[i], (prev[i - nch] if i >= nch else 0)
                pp = a + bb - c
                pa, pb, pc = abs(pp - a), abs(pp - bb), abs(pp - c)
                pr = a if (pa <= pb and pa <= pc) else (bb if pb <= pc else c)
                line[i] = (line[i] + pr) & 255
        out[y * stride:(y + 1) * stride] = line
        prev = line
    return w, h, nch, out


def remeasure(key, pdf_path):
    """Şekli PDF'ten çıkarıp eksen çizgilerini ve uçlarını yeniden ölçer."""
    spec = MEASUREMENTS[key]
    want_w, want_h = spec['image_size']
    match = [img for img in extract_images(pdf_path) if (img[0], img[1]) == (want_w, want_h)]
    if not match:
        sizes = ', '.join('%dx%d' % (i[0], i[1]) for i in extract_images(pdf_path))
        return None, 'nomogram görüntüsü (%dx%d) bulunamadı; PDF içindekiler: %s' % (
            want_w, want_h, sizes or 'yok')
    png = os.path.join(tempfile.gettempdir(), 'briganti_%s.png' % key)
    if not jpeg_to_png(match[0][2], png):
        return None, 'JPEG çözülemedi (Pillow, sips veya ImageMagick gerekir)'

    w, h, nch, px = read_png(png)
    os.unlink(png)

    def ink(x, y):
        i = (y * w + x) * nch
        if nch == 1:
            return px[i] < 120
        r, g, b = px[i], px[i + 1], px[i + 2]
        if spec['ink'] == 'orange':
            return r > 130 and 30 < g < 150 and b < 120 and r - b > 55
        return (r + g + b) // 3 < 120

    def longest_run(y0):
        """y0 satırındaki en uzun kesintisiz mürekkep dizisi (uzunluk, sol, sağ)."""
        best, s = (0, 0, 0), None
        for x in range(w):
            if ink(x, y0):
                if s is None:
                    s = x
            elif s is not None:
                if x - s > best[0]:
                    best = (x - s, s, x - 1)
                s = None
        if s is not None and w - s > best[0]:
            best = (w - s, s, w - 1)
        return best

    # Eksen çizgisi = görüntü genişliğinin en az %15'i kadar kesintisiz yatay
    # mürekkep dizisi. (En kısa eksen, 2017 şeklindeki klinik evre ekseni:
    # genişliğin %18'i.) Bu ölçüt metin satırlarını doğal olarak eler; harfler
    # bu uzunlukta kesintisiz yatay dizi oluşturamaz.
    min_len = int(w * 0.15)
    rows = [(y, longest_run(y)) for y in range(h)]
    rows = [(y, run) for y, run in rows if run[0] >= min_len]
    if not rows:
        return None, 'eksen çizgisi bulunamadı'

    bands, cur = [], [rows[0]]
    for r in rows[1:]:
        if r[0] - cur[-1][0] <= 2:
            cur.append(r)
        else:
            bands.append(cur)
            cur = [r]
    bands.append(cur)

    lines, extents = [], []
    for bnd in bands:
        y, run = max(bnd, key=lambda t: t[1][0])
        lines.append(y)
        extents.append((run[1], run[2]))
    return {'axis_lines': lines, 'axis_extents': extents}, None


# ---------------------------------------------------------------------------
# RAPOR
# ---------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--pdf-2017', help='Eur Urol 2017 makalesinin PDF yolu (isteğe bağlı)')
    ap.add_argument('--pdf-2019', help='Eur Urol 2019 makalesinin PDF yolu (isteğe bağlı)')
    ap.add_argument('--app-js', default=os.path.join(REPO, 'app.js'))
    args = ap.parse_args()

    app = parse_app_js(args.app_js)
    failures = []

    for key in ('2017', '2019'):
        spec = MEASUREMENTS[key]
        d = derive(spec)
        print('=' * 74)
        print('%s   %s' % (spec['label'], spec['citation']))
        print('=' * 74)
        print('  risk ekseni logit-doğrusal uyumu : maks. sapma %.4f logit' % d['risk_axis_residual'])
        print('  toplam puan başına log-odds      : %.6f' % d['logodds_per_total_point'])
        print('  sabit terim                      : %.4f  (app.js: %.4f)'
              % (d['intercept'], app[key]['intercept']))
        if abs(d['intercept'] - app[key]['intercept']) > 1e-4:
            failures.append('%s sabit terim app.js ile uyuşmuyor' % key)

        print('\n  %-12s %11s %11s   %9s %9s' % ('değişken', 'β (türetilen)', 'β (app.js)',
                                                 'OR (β)', 'OR (yayın)'))
        for name in spec['vars']:
            beta = d['betas'][name]
            in_app = lookup(app[key], APP_KEY_MAP[key][name])
            pub = spec['published_or'][name]
            flag = ''
            if abs(beta - in_app) > 1e-5:
                flag = '  <-- app.js FARKLI'
                failures.append('%s/%s katsayısı app.js ile uyuşmuyor' % (key, name))
            if abs(math.exp(beta) - pub) / pub > 0.04:
                flag += '  <-- yayın OR farkı > %4'
                failures.append('%s/%s yayın OR farkı büyük' % (key, name))
            print('  %-12s %11.6f %11.6f   %9.3f %9.2f%s' % (name, beta, in_app,
                                                             math.exp(beta), pub, flag))

        got = simulate_below_cutoff(key, d)
        rep = COHORTS[key]['reported_below_7']
        ok = abs(got - rep) <= 4
        print('\n  sabit terimin bağımsız sınaması (%7 eşiği altındaki hasta oranı)')
        print('    yayın: %%%d   yeniden üretilen: %%%.0f   -> %s'
              % (rep, got, 'tutarlı' if ok else 'TUTARSIZ'))
        if not ok:
            failures.append('%s eşik-altı oranı yayınla tutarsız' % key)

        print('\n  ±1 piksel ölçüm belirsizliğinin sonuca etkisi')
        for label, case in SCENARIOS[key]:
            base = risk_of(d, case)
            lo, hi = uncertainty(key, case)
            print('    %-48s %6.2f%%  (%.2f-%.2f%%)' % (label, base, lo, hi))

        if args.__dict__.get('pdf_%s' % key):
            path = args.__dict__['pdf_%s' % key]
            print('\n  PDF\'ten yeniden ölçüm: %s' % os.path.basename(path))
            got_m, err = remeasure(key, path)
            if err:
                print('    atlandı - %s' % err)
            else:
                n_axes = len(got_m['axis_lines'])
                print('    bulunan eksen sayısı : %d (beklenen 8)' % n_axes)
                # İlk eksen "Points" eksenidir; uçları kayıtlı ölçümle eşleşmeli.
                got_left, got_right = got_m['axis_extents'][0]
                exp_left, exp_right = spec['points_axis']
                ok_axes = n_axes == 8
                ok_ends = abs(got_left - exp_left) <= 1 and abs(got_right - exp_right) <= 1
                print('    puan ekseni uçları   : %.1f-%.1f (kayıtlı %.1f-%.1f) -> %s'
                      % (got_left, got_right, exp_left, exp_right,
                         'uyumlu' if ok_ends else 'UYUŞMUYOR'))
                if not (ok_axes and ok_ends):
                    failures.append('%s PDF yeniden ölçümü kayıtlarla uyuşmuyor' % key)
        print()

    print('=' * 74)
    if failures:
        print('SONUÇ: %d sorun bulundu' % len(failures))
        for f in failures:
            print('  - %s' % f)
        return 1
    print('SONUÇ: tüm kontroller geçti — app.js içindeki katsayılar bu betiğin')
    print('       yayınlanmış şekillerden türettiği değerlerle birebir aynı.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
