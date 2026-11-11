# Geri yükleme sonrası kullanıcı izolasyonu

[English](recovery-case-study.md) · [Örnek raporu aç](https://mehmetfatihdogan.com.tr/assets/demos/restorelab-tr)

Görev uygulamasındaki iki sentetik kullanıcı yalnız kendi görevlerini görebilmeli. Aynı görev kayıtlarından iki PostgreSQL arşivi üretildi. İkinci arşivde okuma politikası her iki kullanıcının da tüm görevleri okuyabileceği şekilde genişletildi.

Her arşiv yeni bir PostgreSQL ortamına geri yüklendi. RestoreLab, Bora adına görev listesini istedi ve dönen kimlikleri beklenen listeyle karşılaştırdı.

| Yedek | Geri yükleme | Bora’nın API yanıtı | Yetki testi |
| --- | --- | --- | --- |
| `restricted.dump` | Başarılı | HTTP 200 · `bora-task` | Geçti |
| `permissive.dump` | Başarılı | HTTP 200 · `ayse-task, bora-task` | Başarısız |

Yalnızca HTTP durum kodunu kontrol etseydik iki yedek de geçecekti. Dönen görevlerin tam listesini kontrol edince fazla yetkiyi yakaladık. Rapor, geri yükleme sonucu ile uygulama testlerinin sonucunu ayrı gösterir.

## Tekrar çalıştır

Depo kökünde Node.js 22+ ve Docker ile çalıştır.

```sh
demo_dir=$(mktemp -d)
RESTORELAB_STATE="$demo_dir/history" node restorelab.mjs demo "$demo_dir" --docker
```

Türkçe çıktı `index.html` dosyasına yazılır. Komut, biri geçen ve biri başarısız olan iki beklenen sonucu ürettiğinde başarılı çıkar. Kendi yedeğin için [SQL profilini](../README.tr.md#kendi-yedeğinde-iş-kurallarını-sına), uygulama rolleriyle giriş ve API kontrolleri için [TaskWork/Supabase tatbikatını](supabase-case-study.md) incele. TaskWork çalışması temel şemayı, yerel Auth ve REST akışlarını kapsar.
