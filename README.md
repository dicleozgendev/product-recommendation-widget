# TeknoMarket AI — Ürün Önerisi (Upsell) Widget

Canlı demo / tanıtım sayfası: **[fancy-queijadas-00050a.netlify.app](https://fancy-queijadas-00050a.netlify.app)**

E-ticaret mağazalarına eklenebilecek AI destekli ürün önerisi widget'ının kanıt-niteliğinde (proof-of-concept) demosu. Ziyaretçi bir ürüne baktığında, "sıkça birlikte alınanlar" (tamamlayıcı ürün / upsell) ve "benzer ürünler" önerir. Amaç: ortalama sepet tutarını artırmak.

> **Not:** Bu depodaki ürün verisi (`data/products.json`) tamamen kurgusal örnek veridir — "Aurora", "NovaBook", "TeknoMarket" gibi isimler demo amaçlı uydurulmuştur, gerçek bir marka veya mağazayla ilgisi yoktur.

## Neler var

- `public/demo.html` — Tek dosyalık, sunucu gerektirmeyen tam pazarlama sayfası + çalışan interaktif widget (TR/EN dil desteği).
- `data/products.json` — Örnek ürün kataloğu (30 ürün, elektronik/aksesuar nişi).
- `build/generate.js` — TF-IDF (bigram + hafif Türkçe ek ayrıştırma) metin vektörlerini SVD ile düşük boyutlu bir "latent semantic" uzaya indirger (LSA), bu uzayda kosinüs benzerliği + kategori kuralı ile "benzer ürün" ve "tamamlayıcı ürün" önerilerini hesaplar, `data/recommendations.json` üretir.
- `build/build-demo.js` — Ürün + öneri verisini HTML şablonuna gömüp nihai `public/demo.html` dosyasını üretir.
- `build/test-jsdom.js`, `build/test-all-products.js` — Demo'nun mantığını (sepete ekleme, dil geçişi, 30 ürünün tamamı) tarayıcı olmadan (jsdom ile) test eder.
- `server/index.js`, `server/admin.html` — Opsiyonel, kendi kendine yeten bir analiz arka ucu (bkz. aşağıda).

## Nasıl çalıştırılır

```bash
npm install
npm run build   # data/recommendations.json, data/vectors.json ve public/demo.html üretir
npm test        # mantık testlerini çalıştırır
```

`public/demo.html` üretildikten sonra çift tıklayarak doğrudan tarayıcıda açılabilir — hiçbir sunucu veya API anahtarı gerekmez, widget tamamen statik çalışır.

## Oturum bazlı kişiselleştirme

Ziyaretçi art arda birkaç ürüne baktığında, "Benzer Ürünler" ve "Sıkça Birlikte Alınanlar" sıralaması, sadece o anki üründen değil ziyaretçinin az önce baktığı ürünlerden de etkilenir (LSA vektörlerinin ağırlıklı ortalaması alınarak). Bu tamamen tarayıcıda, sayfa hafızasında çalışır — sayfa yenilendiğinde sıfırlanır, ekstra bir sunucu çağrısı gerektirmez. Kişiselleştirme devredeyken arayüzde küçük bir "Kişiselleştirildi" etiketi görünür.

## Opsiyonel analiz paneli (server/)

`public/demo.html` her zaman sunucusuz, tek dosya olarak çalışmaya devam eder. Ama istersen yanında küçük bir Node/Express arka ucu da çalıştırabilirsin:

```bash
npm run server   # http://localhost:4000/demo.html ve http://localhost:4000/admin
```

Bu arka uç çalışırken, demo'daki gerçek etkileşimler (ürün görüntüleme, öneri tıklaması, sepete ekleme — ana ürün mü AI önerisi mi olduğu ayrımıyla) `server/data/events.json` dosyasına loglanır ve `/admin` sayfası bu gerçek verilerden (oturum sayısı, AI kaynaklı sepet artış yüzdesi, en çok tıklanan öneriler gibi) canlı istatistikler hesaplar — hiçbir sayı sabit/uydurma değildir, demo'yu birkaç kez gezip sepete ürün ekleyince `/admin`'de değişir.

**Kapsam konusunda dürüst not:** Bu, tek mağaza/tek dosya (JSON) düzeyinde bir prototip — kimlik doğrulama yok, çoklu mağaza (multi-tenant) desteği yok. Gerçek bir üretim SaaS backend'i (CSV yükleme, script-tag entegrasyonu, faturalama) `sonraki-adimlar.md`'deki asıl yol haritası maddesi; ona ancak gerçek müşteri talebi doğrulanınca geçilecek. Bu analiz paneli, o adıma geçilmeden önce "bu widget'ın etkisini nasıl ölçeceğiz" sorusunu somut, çalışan bir örnekle cevaplıyor.

## Neden gerçek AI API'si (OpenAI/Claude) yerine TF-IDF + LSA kullanıldı

Bu demo aşamasında maliyet ve bağımlılık sıfır olsun diye öneriler yerel/ücretsiz bir yöntemle hesaplanıyor: TF-IDF vektörleri + SVD ile boyut indirgeme (Latent Semantic Analysis). Bu, ham anahtar kelime eşleşmesinden daha güçlü — ürünler birebir aynı kelimeleri paylaşmasa da anlamsal olarak yakın metinleri yakalayabiliyor — ama gerçek bir nöral embedding modeli (OpenAI/Claude) değil, klasik ve kanıtlanmış bir istatistiksel teknik. Nöral bir embedding modeline geçmeyi denedik; bunun için model ağırlıklarının Hugging Face'ten indirilmesi gerekiyor ve mevcut geliştirme ortamının ağ politikası bunu engelliyor. Gerçek bir mağazaya bağlanacak üretim sürümünde bu adım, daha iyi semantik kalite için embedding tabanlı bir yönteme (OpenAI/Claude embedding + vektör veritabanı) çevrilebilir — arayüz ve iş mantığı (kosinüs benzerliği + kategori kuralı) aynı kalıyor, sadece `embed()` fonksiyonu değişiyor.

## Yol haritası

1. **(Şu an)** Bu demoyu gerçek Türk e-ticaret sahiplerine göstererek talep doğrula.
2. İlgi gösteren mağazalar için, onların gerçek ürün CSV'siyle özelleştirilmiş demo hazırla.
3. İlk ödeyen müşteriler bulununca: CSV yükleme + script-tag entegrasyonu olan gerçek backend'i inşa et.
4. Türkiye'de birkaç ay çalıştıktan sonra Shopify App Store üzerinden global pazara aç.

Detaylı fiyatlandırma ve sonraki adımlar için `sonraki-adimlar.md` dosyasına bakın.
