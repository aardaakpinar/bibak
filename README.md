# Bibak RSS Reader

Modern, hızlı ve tamamen tarayıcı üzerinde çalışan bir RSS okuyucu uygulaması.
Kendi RSS kaynaklarını ekleyebilir, OPML içe aktarabilir, yazıları yer imlerine kaydedebilir ve keşfet sekmesinden yeni kaynaklar keşfedebilirsin.

---

## Özellikler

* RSS ve Atom feed desteği
* IndexedDB ile local veri saklama
* Yer imi (bookmark) sistemi
* OPML import desteği
* Discover / keşfet sekmesi
* Feed filtreleme
* Mobil uyumlu sidebar
* Context menu ile feed yönetimi
* Tarihe göre sıralama
* Proxy üzerinden CORS-safe RSS çekme
* Tamamen Vanilla JavaScript

---

# Ekran Görüntüsü

Buraya uygulama ekran görüntüsü ekleyebilirsin:

```md
![Screenshot](assets/screenshot.png)
```
---

## Ekran Yapısı

### Home

* Tüm makaleleri görüntüler
* Feed filtreleme yapılabilir
* Makaleler tarihe göre sıralanır

### Discover

Hazır RSS kaynaklarını kategorilere göre keşfetmeni sağlar.

Kategoriler:

* Technology
* News
* Gaming
* Economy
* Science
* Sports
* Fashion

### Bookmarks

Kaydedilen makaleleri listeler.

---

# Teknolojiler

* Vanilla JavaScript
* IndexedDB
* DOMParser
* Fetch API
* Lucide Icons

---

# Proje Yapısı

```bash
project/
│
├── index.html
├── style.css
├── app.js
├── data.js
└── README.md
```

---

# Kurulum

Projeyi klonla:

```bash
git clone <repo-url>
cd bibak-rss-reader
```

Basit bir local server çalıştır:

## VSCode Live Server

veya

```bash
npx serve .
```

---

# Kullanım

## Yeni RSS Feed Ekleme

1. “Add Feed” butonuna tıkla
2. RSS URL gir
3. İsteğe bağlı isim belirle
4. Kaydet

---

## OPML İçe Aktarma

1. Upload butonuna tıkla
2. `.opml` dosyasını seç
3. Feedler otomatik eklenecektir

---

# IndexedDB Yapısı

## feeds store

```js
{
  id,
  url,
  name,
  addedAt
}
```

## articles store

```js
{
  id,
  feedId,
  title,
  link,
  description,
  pubDate,
  guid,
  bookmarked
}
```

---

# RSS Parser

Uygulama hem:

* RSS
* Atom

formatlarını destekler.

Parser:

* XML parse eder
* Feed tipini otomatik algılar
* Makaleleri normalize eder

---

# Proxy Sistemi

Bazı RSS kaynakları CORS nedeniyle doğrudan erişilemez.

Proxy:

* RSS içeriğini fetch eder
* XML döndürür
* Hata durumlarını normalize eder

---

# Bookmark Sistemi

Kullanıcılar:

* Makale kaydedebilir
* Bookmark kaldırabilir
* Sadece bookmark’ları görüntüleyebilir

Bookmark verileri IndexedDB içinde saklanır.

---

# Feed Yönetimi

Desteklenen işlemler:

* Feed ekleme
* Feed silme
* Feed yenileme
* Feed filtreleme

Sağ tık context menu ile feed işlemleri yapılabilir.

---

# Mobil Destek

Mobil cihazlar için:

* Açılır sidebar
* Overlay close
* Responsive layout

desteklenmektedir.

---

# Veri Akışı

```text
RSS URL
   ↓
Proxy Fetch
   ↓
XML Parse
   ↓
RSS / Atom Detection
   ↓
Normalize Articles
   ↓
IndexedDB Save
   ↓
UI Render
```

---

# Sınıflar

## BibakRSSReader

Ana uygulama sınıfı.

Sorumluluklar:

* UI yönetimi
* Event listener’lar
* Feed işlemleri
* Görünüm yönetimi

---

## RSSDatabase

IndexedDB wrapper sınıfı.

Sorumluluklar:

* Feed CRUD
* Article CRUD
* Bookmark işlemleri

---

## RSSParser

RSS/Atom parser sınıfı.

Sorumluluklar:

* Feed fetch
* XML parse
* Tarih formatlama
* RSS/Atom ayrımı

---

# Gelecek Planları

* Feed kategorileri
* Arama sistemi
* Offline sync
* Push notifications
* Read/unread state
* OPML export
* Multi proxy fallback

# Katkı Sağlama

Pull request’ler ve issue’lar her zaman açıktır.

## Geliştirme

```bash
npm install
npm run dev
```

Developed by Bibak 🚀
