# AI Ürün Önerisi Widget — Sonraki Adımlar

## Bu demo ne gösteriyor

`demo.html` dosyası tek başına çalışan, sunucu gerektirmeyen bir kanıt-niteliğinde demo. Örnek bir elektronik/aksesuar mağazası (30 ürün) üzerinde şunu gösteriyor: bir ürüne tıklandığında AI, "sıkça birlikte alınanlar" (tamamlayıcı ürün — asıl upsell değeri burada) ve "benzer ürünler" önerir. Sepete ekledikçe sağdaki panel, AI önerilerinin sepet büyüklüğüne kattığı ek geliri canlı gösterir. TR/EN dil değişimi de var (sağ üstteki buton) — aynı demo hem Türk hem yabancı esnafa gösterilebilir.

Öneriler şu an TF-IDF (metin benzerliği) + kategori kuralı ile hesaplanıyor, dış API çağrısı yok, maliyeti sıfır. Gerçek mağazada bu, OpenAI/Claude embedding gibi daha güçlü bir yöntemle değiştirilebilir — arayüz ve iş mantığı aynı kalır.

## Gerçek bir mağazaya bağlamak için gereken adımlar

1. **Ürün verisini al**: Çoğu platform (Ticimax, İkas, T-Soft, WooCommerce, Shopify) ürün kataloğunu CSV olarak dışa aktarabiliyor. İlk versiyon: esnaf CSV yükler, biz embedding'leri hesaplayıp saklarız. Bu, her platform için ayrı API entegrasyonu yazmaktan çok daha hızlı.
2. **Script tag ver**: Esnaf, sitesine tek satır `<script>` ekler (Intercom/Hotjar gibi). Widget kendi ürün sayfasını algılar, önerileri gösterir.
3. **Basit bir backend**: CSV yükleme + embedding hesaplama + öneri API'si için küçük bir sunucu (Node/Express, ücretsiz/ucuz hosting: Railway, Render). Bütçene rahat sığar.

## Fiyatlandırma önerisi (başlangıç)

- Küçük mağaza (≤200 ürün): ~₺499-799/ay
- Orta ölçek (200-2000 ürün): ~₺1.499-2.499/ay
- Global (Shopify App Store, ileride): $19-49/ay bandı, Shopify'ın rekabet analizine göre ayarlanır

## Yol haritası

1. Bu demoyu 5-10 gerçek Türk e-ticaret sahibine göster (İkas/Ticimax kullanıcı toplulukları, esnaf grupları, doğrudan mesaj). Amaç: "böyle bir şeye ayda X TL öder misin" sorusuna gerçek cevap almak.
2. İlgi gösteren olursa, o mağazanın gerçek ürün CSV'siyle özelleştirilmiş bir demo hazırlanır (satışı kapatmaya en çok yardımcı olan adım budur).
3. İlk 2-3 ödeyen müşteri bulununca gerçek backend + script-tag entegrasyonu yapılır (bu noktaya kadar üretim altyapısına yatırım yapılmaz — talep doğrulanmadan inşa etmiyoruz).
4. Türkiye'de birkaç ay çalışıp geri bildirim toplandıktan sonra, aynı ürün Shopify App Store'a taşınarak global/Amerika pazarına açılır.

## Gerçekçi beklenti

İlk satış muhtemelen haftalar, "işe yarıyor" diyebileceğin gelir seviyesi (aylık birkaç bin TL) muhtemelen birkaç ay sürer. Hızlandıran tek şey: demoyu kaç kişiye gösterdiğin ve kaçının gerçek verisiyle özelleştirdiğin.
