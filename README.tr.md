# RestoreLab

[English](README.md) · [Örnek raporu aç](https://mehmetfatihdogan.com.tr/assets/demos/restorelab-tr)

Bir PostgreSQL yedeğini geri yüklediğinde uygulamanın hangi işlevleri çalışacak? RestoreLab, kendi makinen veya CI ortamında geri yükleme tatbikatı çalıştırır. Geri yükleme ile uygulama testlerini ayrı kaydeder ve uygulama ile test paketi sürümü başına testleri geçen en yeni yedeği gösterir.

<picture>
  <source media="(prefers-color-scheme: light)" srcset="docs/images/report-tr-light.webp">
  <img src="docs/images/report-tr.webp" alt="İki yedek de açılıyor; yalnızca geniş erişimli yedek Bora’ya Ayşe’nin görevini gösteriyor">
</picture>

## Örnek tatbikat

macOS veya Linux üzerinde **Node.js 22+ ve çalışan bir Docker motoru** gerekir. Docker erişimi olan normal bir kullanıcıyla çalıştır.

```sh
git clone https://github.com/fatihdogann/restorelab.git
cd restorelab
report_dir=$(mktemp -d)
export RESTORELAB_STATE="$report_dir/history"
node restorelab.mjs demo "$report_dir" --docker
node restorelab.mjs serve examples/demo-panel.mjs
```

Türkçe rapor için `index.html` dosyasını veya terminaldeki yerel panel adresini aç. İki sentetik yedek de geri yüklenir ve görev API’si HTTP 200 döner. Erişim politikası fazla geniş olan yedekte bir kullanıcı diğerinin görevini de görür ve yetki testi başarısız olur. Yalnız HTML ve JSON raporu için yerel PostgreSQL 16 araçlarıyla demoyu `--docker` olmadan çalıştırabilirsin.

## Kendi yedeğini sına

`pg_dump -Fc` ile alınmış, güvendiğin bir yedek ve uygulamanın ihtiyaç duyduğu bir tablo seç.

```sh
export DRILL_PROJECT_ID=inventory
export DRILL_APP_VERSION=v1.2.0
export DRILL_BACKUP=/mutlak/yol/inventory.dump
export DRILL_BACKUP_AT=2026-11-08T00:00:00Z
export DRILL_REQUIRED_TABLE=public.orders

node restorelab.mjs drill examples/postgres-profile.mjs
node restorelab.mjs serve examples/postgres-profile.mjs
```

[Başlangıç profili](examples/postgres-profile.mjs) tablonun geri yüklenen veritabanında bulunduğunu doğrular. Tablo adını küçük harfli `şema.tablo` biçiminde gir. Gerektiğinde `DRILL_POSTGRES_IMAGE` ile yedeğin PostgreSQL sürümü ve eklentileriyle uyumlu imajı seç. Başlangıç profili tablo kontrolü için kaynak sahipliğini ve izinleri uygulamaz. Yetki testi için gerekli rolleri oluşturup Docker yardımcısının sahiplik ve izinleri koruyan varsayılan geri yüklemesini kullanabilirsin. Profili kopyalayıp tablo kontrolünü kendi uygulama testinle değiştirebilirsin. Kontroller değiştiğinde test paketi sürümünü de değiştir.

`drill` komutunu cron, systemd veya CI ile düzenli çalıştırabilirsin. Başarısız koşum hata kodu döndürür ve sonucunu saklar. Geçmiş varsayılan olarak `~/.local/state/restorelab` altında tutulur. Yedek ve geçmiş dosyalarını özel tut, kontrollerde yalnız sentetik veya maskelenmiş değerler kaydet. Docker yardımcısı PostgreSQL’i dış ağa kapalı, geçici bir konteynerde çalıştırır.

Daha kapsamlı bir örnek için [Supabase Auth ve REST vaka çalışmasına](docs/supabase-case-study.md) bakabilirsin.

## Kendi yedeğinde iş kurallarını sına

[Stok test paketini](examples/inventory-checks.json) kopyala ve SQL ifadelerini uygulamanın kurallarıyla değiştir. Örneğin ödemesi alınan her siparişin stok rezervasyonu olmalı. Önceki bölümdeki ortam değişkenlerine test paketi yolunu ekle ve SQL profilini çalıştır.

```sh
export DRILL_SQL_SUITE=/mutlak/yol/inventory-checks.json
node restorelab.mjs drill examples/sql-profile.mjs
node restorelab.mjs serve examples/sql-profile.mjs
```

Her kontrolde `label`, isteğe bağlı `english` ve noktalı virgül içermeyen tek bir boolean `sql` ifadesi bulunur. En fazla 20 kontrol, beş saniye sorgu zaman aşımıyla ayrı salt okunur işlemlerde çalışır. Yalnızca `true` geçer. False, NULL ve SQL hataları başarısız sayılır. Sorgu metni ve satır verileri rapora yazılmaz. Testler veya Docker imaj adı değiştiğinde yeni bir test paketi geçmişi başlar. Koşumlar arasında imajın sabit kalması gerekiyorsa imaj özetini kullan.

SQL profili arşivdeki sahiplik ve izinleri atlar. Veri kurallarını konteynerin PostgreSQL yöneticisiyle kontrol eder. Yetki, oturum açma, API veya yazma kontrolleri için uygulama rollerini kullanan özel bir profil hazırla.

### Stok örneğini dene

İzole bir Docker konteynerinde iki sentetik yedek üret. İkisi de geri yüklenir. İki testi de yalnızca eksiksiz yedek geçer.

```sh
demo_dir=$(mktemp -d)
node examples/make-inventory-dumps.mjs "$demo_dir/dumps"
export RESTORELAB_STATE="$demo_dir/history"
export DRILL_PROJECT_ID=inventory DRILL_APP_VERSION=1.0
export DRILL_SQL_SUITE=examples/inventory-checks.json
DRILL_BACKUP="$demo_dir/dumps/healthy.dump" DRILL_BACKUP_AT=2026-11-10T01:00:00Z \
  node restorelab.mjs drill examples/sql-profile.mjs
DRILL_BACKUP="$demo_dir/dumps/incomplete.dump" DRILL_BACKUP_AT=2026-11-11T01:00:00Z \
  node restorelab.mjs drill examples/sql-profile.mjs
node restorelab.mjs serve examples/sql-profile.mjs
```

İkinci tatbikat, ödenmiş siparişin rezervasyonu eksik olduğu için 1 koduyla çıkar. Son denenen ve son geçen yedeği panelde yan yana görebilirsin.

## Lisans

[MIT](LICENSE)

---

## Geliştirici

**Mehmet Fatih Doğan** — yazılım geliştirici.

- 🌐 Portfolyo & iletişim: [mehmetfatihdogan.com.tr](https://mehmetfatihdogan.com.tr)
- 💻 GitHub: [@fatihdogann](https://github.com/fatihdogann)

Proje hakkında soru, hata bildirimi veya geri bildirim için [iletişim sayfamdan](https://mehmetfatihdogan.com.tr/iletisim) ulaşabilirsin.
