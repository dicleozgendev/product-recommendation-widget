# TeknoMarket AI — Ürün Önerisi (Upsell) Widget

Canlı demo / tanıtım sayfası: **[fancy-queijadas-00050a.netlify.app](https://fancy-queijadas-00050a.netlify.app)**

E-ticaret mağazalarına eklenebilecek AI destekli ürün önerisi widget'ının kanıt-niteliğinde (proof-of-concept) demosu. Ziyaretçi bir ürüne baktığında, "sıkça birlikte alınanlar" (tamamlayıcı ürün / upsell) ve "benzer ürünler" önerir. Amaç: ortalama sepet tutarını artırmak.

> **Not:** Bu depodaki ürün verisi (`data/products.json`) tamamen kurgusal örnek veridir — "Aurora", "NovaBook", "TeknoMarket" gibi isimler demo amaçlı uydurulmuştur, gerçek bir marka veya mağazayla ilgisi yoktur.

## Neler var

- `public/demo.html` — Tek dosyalık, sunucu gerektirmeyen tam pazarlama sayfası + çalışan interaktif widget (TR/EN dil desteği).
- `data/products.json` — Örnek ürün kataloğu (30 ürün, elektronik/aksesuar nişi).
- `build/generate.js` — TF-IDF metin benzerliği + kategori kuralı ile "benzer ürün" ve "tamamlayıcı ürün" önerilerini hesaplar, `data/recommendations.json` üretir.
- `build/build-demo.js` — Ürün + öneri verisini HTML şablonuna gömüp nihai `public/demo.html` dosyasını üretir.
- `build/test-jsdom.js`, `build/test-all-products.js` — Demo'nun mantığını (sepete ekleme, dil geçişi, 30 ürünün tamamı) tarayıcı olmadan (jsdom ile) test eder.

## Nasıl çalıştırılır

```bash
npm install
npm run build   # data/recommendations.json ve public/demo.html üretir
npm test        # mantık testlerini çalıştırır
```

`public/demo.html` üretildikten sonra çift tıklayarak doğrudan tarayıcıda açılabilir — hiçbir sunucu veya API anahtarı gerekmez.

## Neden gerçek AI API'si (OpenAI/Claude) yerine TF-IDF kullanıldı

Bu demo aşamasında maliyet ve bağımlılık sıfır olsun diye öneriler yerel/ücretsiz bir metin benzerliği yöntemiyle (TF-IDF + kategori kuralı) hesaplanıyor. Gerçek bir mağazaya bağlanacak üretim sürümünde bu adım, daha iyi semantik kalite için embedding tabanlı bir yönteme (OpenAI/Claude embedding + vektör veritabanı) çevrilecek — arayüz ve iş mantığı aynı kalıyor.

## Yol haritası

1. **(Şu an)** Bu demoyu gerçek Türk e-ticaret sahiplerine göstererek talep doğrula.
2. İlgi gösteren mağazalar için, onların gerçek ürün CSV'siyle özelleştirilmiş demo hazırla.
3. İlk ödeyen müşteriler bulununca: CSV yükleme + script-tag entegrasyonu olan gerçek backend'i inşa et.
4. Türkiye'de birkaç ay çalıştıktan sonra Shopify App Store üzerinden global pazara aç.

Detaylı fiyatlandırma ve sonraki adımlar için `sonraki-adimlar.md` dosyasına bakın.
