import { feeds } from './data.js';

class BibakRSSReader {
    constructor() {
        this.db = new RSSDatabase();
        this.parser = new RSSParser();
        this.selectedFeedId = null;
        this.showBookmarked = false;
        this.contextMenuFeedId = null;
        this.currentView = 'home';

        this.init();
    }

    async init() {
        await this.db.init();
        this.setupEventListeners();
        await this.loadFeeds();
        await this.refreshAllFeeds();
        await this.loadArticles();
        this.loadDiscoverFeeds();
    }

    setupEventListeners() {
        // Add feed button
        document.getElementById("addFeedBtn").addEventListener("click", () => {
            this.showAddFeedModal();
        });

        document.getElementById("uploadFeedBtn").addEventListener("click", () => {
            this.uploadOpenModal();
        });

        document.getElementById("exportFeedBtn").addEventListener("click", () => {
            this.exportOPML();
        });

        // Modal controls
        document.getElementById("closeModalBtn").addEventListener("click", () => {
            this.hideAddFeedModal();
        });

        document.getElementById("cancelBtn").addEventListener("click", () => {
            this.hideAddFeedModal();
        });

        document.getElementById("addFeedForm").addEventListener("submit", (e) => {
            e.preventDefault();
            this.addFeed();
        });

        document.getElementById("opmlInput").addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (file) this.importOPML(file);
        });

        // Close modal on overlay click
        document.querySelector(".modal-overlay")?.addEventListener("click", () => {
            this.hideAddFeedModal();
        });

        // Context menu
        document.addEventListener("click", () => {
            this.hideContextMenu();
        });

        document.getElementById("refreshFeedBtn").addEventListener("click", () => {
            if (this.contextMenuFeedId) {
                this.refreshFeed(this.contextMenuFeedId);
            }
        });

        document.getElementById("markAsReadBtn").addEventListener("click", () => {
            if (this.contextMenuFeedId) {
                this.markFeedAsRead(this.contextMenuFeedId);
            }
        });

        document.getElementById("deleteFeedBtn").addEventListener("click", () => {
            if (this.contextMenuFeedId) {
                this.deleteFeed(this.contextMenuFeedId);
            }
        });

        // Mobile sidebar
        const openSidebar = document.getElementById("openSidebar");
        const sidebar = document.getElementById("sidebar");

        openSidebar.addEventListener("click", () => {
            sidebar.classList.add("mobile-active");
        });

        // Close sidebar when clicking outside
        document.addEventListener("click", (e) => {
            if (sidebar.classList.contains("mobile-active") && 
                !sidebar.contains(e.target) && 
                !openSidebar.contains(e.target)) {
                sidebar.classList.remove("mobile-active");
            }
        });

        // View navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => {
                const view = item.getAttribute('data-view');
                this.switchView(view);
            });
        });

        // Refresh all button
        document.getElementById("refreshAllBtn")?.addEventListener("click", async () => {
            await this.refreshAllFeeds();
            await this.loadArticles();
        });

        // Category chips
        document.querySelectorAll('.category-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                document.querySelectorAll('.category-chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                const category = chip.getAttribute('data-category');
                this.filterDiscoverFeeds(category);
            });
        });
    }

    showAddFeedModal() {
        document.getElementById("addFeedModal").classList.add("show");
        document.getElementById("feedUrlInput").value = "";
        document.getElementById("feedNameInput").value = "";
    }

    uploadOpenModal() {
      document.getElementById("opmlInput").click();
    }

    hideAddFeedModal() {
        document.getElementById("addFeedModal").classList.remove("show");
    }

    async refreshAllFeeds() {
        const feeds = await this.db.getAllFeeds();

        for (const feed of feeds) {
            try {
                const feedData = await this.parser.fetchFeed(feed.url);

                const articles = feedData.items.map(item => ({
                    ...item,
                    feedId: feed.id,
                    bookmarked: 0,
                    unread: 1,
                    guid: item.guid || item.link,
                }));

                await this.db.addArticles(articles);
            } catch (e) {
                console.warn("Feed yenilenemedi:", feed.url);
            }
        }
    }

    async addFeed() {
        const url = document.getElementById("feedUrlInput").value.trim();
        const customName = document.getElementById("feedNameInput").value.trim();

        if (!url) {
            alert("Lütfen bir RSS URL'si girin");
            return;
        }

        try {
            this.showLoading(true);
            const feedData = await this.parser.fetchFeed(url);

            const feed = {
                url: url,
                name: customName || feedData.title || "İsimsiz Kaynak",
                addedAt: new Date().toISOString(),
            };

            const feedId = await this.db.addFeed(feed);

            // Save articles
            const articles = feedData.items.map((item) => ({
                ...item,
                feedId: feedId,
                bookmarked: false,
                unread: true,
                guid: item.guid || item.link,
            }));

            await this.db.addArticles(articles);

            this.hideAddFeedModal();
            await this.loadFeeds();
            await this.loadArticles();
        } catch (error) {
            console.error("Error adding feed:", error);
            alert("RSS kaynağı eklenirken hata oluştu. URL'yi kontrol edin.");
        } finally {
            this.showLoading(false);
        }
    }

    async loadFeeds() {
        const feeds = await this.db.getAllFeeds();
        const feedSourcesContainer = document.getElementById("feedSources");

        feedSourcesContainer.innerHTML = "";

        // Individual feed buttons
        feeds.forEach((feed) => {
            const feedBtn = this.createFeedButton(feed.id, feed.name);
            feedSourcesContainer.appendChild(feedBtn);
        });
    }

    switchView(view) {
        this.currentView = view;
        
        // Update nav items
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-view="${view}"]`)?.classList.add('active');

        // Update views
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        
        // Update title and subtitle
        const titleEl = document.getElementById('viewTitle');
        
        if (view === 'home') {
            document.getElementById('homeView').classList.add('active');
            titleEl.textContent = 'Feeds';
            this.loadArticles();
        } else if (view === 'discover') {
            document.getElementById('discoverView').classList.add('active');
            titleEl.textContent = 'Discover';
        } else if (view === 'bookmarks') {
            document.getElementById('bookmarksView').classList.add('active');
            titleEl.textContent = 'Bookmarks';
            this.loadBookmarks();
        }

        // Close mobile sidebar
        document.getElementById('sidebar').classList.remove('mobile-active');
    }

    async loadBookmarks() {
        const articles = await this.db.getBookmarkedArticles();
        const container = document.getElementById('bookmarksContainer');
        const emptyState = document.getElementById('bookmarksEmpty');

        if (articles.length === 0) {
            container.innerHTML = '';
            emptyState.style.display = 'flex';
        } else {
            emptyState.style.display = 'none';
            container.innerHTML = '';

            const feeds = await this.db.getAllFeeds();
            const feedMap = {};
            feeds.forEach((feed) => {
                feedMap[feed.id] = feed.name;
            });

            // Sort by date
            articles.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

            articles.forEach((article) => {
                const card = this.createArticleCard(article, feedMap[article.feedId]);
                container.appendChild(card);
            });
        }
    }

    loadDiscoverFeeds() {
        this.allDiscoverFeeds = feeds;
        this.renderDiscoverFeeds(feeds);
    }

    filterDiscoverFeeds(category) {
        if (category === 'all') {
            this.renderDiscoverFeeds(this.allDiscoverFeeds);
        } else {
            const filtered = this.allDiscoverFeeds.filter(f => f.category === category);
            this.renderDiscoverFeeds(filtered);
        }
    }

    renderDiscoverFeeds(feeds) {
        const container = document.getElementById('discoverFeeds');
        container.innerHTML = '';

        feeds.forEach(feed => {
            const card = document.createElement('div');
            card.className = 'discover-card';
            
            card.innerHTML = `
                <div class="discover-card-header">
                    <div class="discover-icon">${feed.icon}</div>
                    <div class="discover-info">
                        <h3>${feed.name}</h3>
                        <p>${feed.description}</p>
                    </div>
                </div>
                <div class="discover-meta">
                    <span class="discover-tag">${this.getCategoryName(feed.category)}</span>
                </div>
                <div class="discover-actions">
                    <button class="btn btn-primary" data-url="${feed.url}" data-name="${feed.name}">
                        <i data-lucide="plus"></i>
                        <span>Ekle</span>
                    </button>
                </div>
            `;

            const addBtn = card.querySelector('.btn');
            addBtn.addEventListener('click', async () => {
                await this.addFeedFromDiscover(feed.url, feed.name);
                addBtn.disabled = true;
                addBtn.innerHTML = '<i data-lucide="check"></i><span>Eklendi</span>';
                lucide.createIcons();
            });

            container.appendChild(card);
        });

        lucide.createIcons();
    }

    getCategoryName(category) {
        const names = {
            'tech': 'Technology',
            'news': 'News',
            'gaming': 'Gaming',
            'economy': 'Economy',
            'science': 'Science',
            'sports': 'Sports',
            'fashion': 'Fashion'
        };
        return names[category] || category;
    }

    async addFeedFromDiscover(url, name) {
        try {
            this.showLoading(true);
            const feedData = await this.parser.fetchFeed(url);

            const feed = {
                url: url,
                name: name || feedData.title || "İsimsiz Kaynak",
                addedAt: new Date().toISOString(),
            };

            const feedId = await this.db.addFeed(feed);

            const articles = feedData.items.map((item) => ({
                ...item,
                feedId: feedId,
                bookmarked: false,
                unread: true,
                guid: item.guid || item.link,
            }));

            await this.db.addArticles(articles);
            await this.loadFeeds();
            
            // Switch to home view
            this.switchView('home');
        } catch (error) {
            console.error("Error adding feed:", error);
            alert("RSS kaynağı eklenirken hata oluştu.");
        } finally {
            this.showLoading(false);
        }
    }

    async importOPML(file) {
        try {
            this.showLoading(true);

            const text = await file.text();
            const parser = new DOMParser();
            const xml = parser.parseFromString(text, "application/xml");

            if (xml.querySelector("parsererror")) {
                alert("Geçersiz OPML dosyası");
                return;
            }

            // OPML outline'ları
            const outlines = Array.from(xml.querySelectorAll("outline[xmlUrl]"));

            if (outlines.length === 0) {
                alert("OPML içinde RSS kaynağı bulunamadı");
                return;
            }

            let added = 0;

            for (const outline of outlines) {
                const url = outline.getAttribute("xmlUrl");
                const title = outline.getAttribute("title") || outline.getAttribute("text") || "OPML Kaynağı";

                if (!url) continue;

                try {
                    const feedData = await this.parser.fetchFeed(url);

                    const feed = {
                        url,
                        name: title || feedData.title || "İsimsiz Kaynak",
                        addedAt: new Date().toISOString(),
                    };

                    const feedId = await this.db.addFeed(feed);

                    const articles = feedData.items.map((item) => ({
                        ...item,
                        feedId,
                        bookmarked: 0,
                        unread: 1,
                        guid: item.guid || item.link,
                    }));

                    await this.db.addArticles(articles);
                    added++;
                } catch (err) {
                    console.warn("OPML feed atlandı:", url, err.message);
                    // devam et
                }
            }

            alert(`${added} RSS kaynağı başarıyla eklendi 🎉`);
            this.hideAddFeedModal();
            await this.loadFeeds();
            await this.loadArticles();
        } catch (err) {
            console.error("OPML import error:", err);
            alert("OPML içe aktarılırken hata oluştu");
        } finally {
            this.showLoading(false);
            document.getElementById("opmlInput").value = "";
        }
    }

    createFeedButton(feedId, name) {
        const button = document.createElement("button");
        button.className = "feed-button";

        button.innerHTML = `<span>${name}</span>`;

        // Set active class
        if (this.selectedFeedId === feedId) {
            button.classList.add("active");
        }

        button.addEventListener("click", () => {
            if (this.selectedFeedId === feedId) {
                this.selectedFeedId = null;
            } else {
                this.selectedFeedId = feedId;
            }

            this.loadFeeds();
            this.loadArticles();
        });

        button.addEventListener("contextmenu", (e) => {
            if (feedId) {
                e.preventDefault();
                this.showContextMenu(e, feedId);
            }
        });

        return button;
    }

    async loadArticles() {
        this.showLoading(true);

        let articles;

        if (this.selectedFeedId) {
            articles = await this.db.getArticlesByFeed(this.selectedFeedId);
        } else {
            articles = await this.db.getAllArticles();
        }

        // Sort by date (newest first)
        articles.sort((a, b) => {
            const dateA = new Date(a.pubDate);
            const dateB = new Date(b.pubDate);
            return dateB - dateA;
        });

        const container = document.getElementById("articlesContainer");
        const emptyState = document.getElementById("emptyState");

        if (articles.length === 0) {
            container.innerHTML = "";
            emptyState.style.display = "flex";
        } else {
            emptyState.style.display = "none";
            container.innerHTML = "";

            const feeds = await this.db.getAllFeeds();
            const feedMap = {};
            feeds.forEach((feed) => {
                feedMap[feed.id] = feed.name;
            });

            articles.forEach((article) => {
                const card = this.createArticleCard(article, feedMap[article.feedId]);
                container.appendChild(card);
            });
        }

        this.showLoading(false);
    }

    createArticleCard(article, feedName) {
        const card = document.createElement("div");
        card.className = `article-card ${article.unread ? "unread" : ""}`;

        const cleanDescription = article.description
            ? article.description.replace(/<[^>]*>/g, "").substring(0, 200)
            : "";

        card.innerHTML = `
      <div class="article-header">
        <span class="article-source">${feedName || "Kaynak"}</span>
        <div class="article-buttons">
          <button class="unread-btn ${article.unread ? "unread" : ""}" data-article-id="${article.id}">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="1"></circle>
            </svg>
          </button>
          <button class="bookmark-btn ${article.bookmarked ? "bookmarked" : ""}" data-article-id="${article.id}">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="m19 21-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>
            </svg>
          </button>
        </div>
      </div>
      <h3 class="article-title">${article.title}</h3>
      <p class="article-description">${cleanDescription}</p>
      <div class="article-footer">
        <span>${this.parser.formatDate(article.pubDate)}</span>
      </div>
    `;

        card.addEventListener("click", async (e) => {
            if (!e.target.closest(".bookmark-btn") && !e.target.closest(".unread-btn")) {
                // Mark as read when opening
                if (article.unread) {
                    await this.db.markArticleAsRead(article.id);
                    article.unread = false;
                }
                window.open(article.link, "_blank");
            }
        });

        // Unread button
        const unreadBtn = card.querySelector(".unread-btn");
        unreadBtn.addEventListener("click", async (e) => {
            e.stopPropagation();
            article.unread = !article.unread;
            await this.db.updateArticle(article);
            unreadBtn.classList.toggle("unread");
            card.classList.toggle("unread");
        });

        // Bookmark button
        const bookmarkBtn = card.querySelector(".bookmark-btn");
        bookmarkBtn.addEventListener("click", async (e) => {
            e.stopPropagation();
            article.bookmarked = !article.bookmarked;
            await this.db.updateArticle(article);
            bookmarkBtn.classList.toggle("bookmarked");
        });

        return card;
    }

    showContextMenu(event, feedId) {
        event.preventDefault();
        this.contextMenuFeedId = feedId;

        const menu = document.getElementById("contextMenu");
        menu.style.display = "block";

        let x = event.pageX;
        let y = event.pageY;

        const menuWidth = menu.offsetWidth;
        const menuHeight = menu.offsetHeight;

        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;

        if (x + menuWidth > windowWidth) {
            x = windowWidth - menuWidth - 10;
        }

        if (y + menuHeight > windowHeight) {
            y = windowHeight - menuHeight - 10;
        }

        menu.style.left = x + "px";
        menu.style.top = y + "px";
    }

    hideContextMenu() {
        document.getElementById("contextMenu").style.display = "none";
        this.contextMenuFeedId = null;
    }

    async refreshFeed(feedId) {
        try {
            this.showLoading(true);
            const feeds = await this.db.getAllFeeds();
            const feed = feeds.find((f) => f.id === feedId);

            if (!feed) return;

            const feedData = await this.parser.fetchFeed(feed.url);

            const articles = feedData.items.map((item) => ({
                ...item,
                feedId: feedId,
                bookmarked: false,
                unread: true,
                guid: item.guid || item.link,
            }));

            await this.db.addArticles(articles);
            await this.loadArticles();
        } catch (error) {
            console.error("Error refreshing feed:", error);
            alert("Feed yenilenirken hata oluştu");
        } finally {
            this.showLoading(false);
        }
    }

    async deleteFeed(feedId) {
        if (confirm("Bu kaynağı silmek istediğinizden emin misiniz?")) {
            await this.db.deleteFeed(feedId);
            if (this.selectedFeedId === feedId) {
                this.selectedFeedId = null;
            }
            await this.loadFeeds();
            await this.loadArticles();
        }
    }

    async markFeedAsRead(feedId) {
        try {
            this.showLoading(true);
            
            // Get all articles for this feed
            const articles = await this.db.getArticlesByFeed(feedId);
            
            // Mark each article as read
            for (const article of articles) {
                if (article.unread) {
                    article.unread = 0;
                    await this.db.updateArticle(article);
                }
            }
            
            // Reload articles to reflect changes
            await this.loadArticles();
        } catch (error) {
            console.error("Error marking feed as read:", error);
            alert("Makaleler işaretlenirken hata oluştu");
        } finally {
            this.showLoading(false);
        }
    }

    async exportOPML() {
        try {
            const feeds = await this.db.getAllFeeds();
            
            if (feeds.length === 0) {
                alert("Dışa aktarılacak RSS kaynağı bulunamadı");
                return;
            }

            // Create OPML XML
            let opmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Bi'Bak RSS Feeds</title>
    <dateCreated>${new Date().toISOString()}</dateCreated>
    <ownerName>Bi'Bak RSS Reader</ownerName>
  </head>
  <body>
    <outline text="RSS Feeds" title="RSS Feeds">
`;

            feeds.forEach(feed => {
                const escapedTitle = this.escapeXML(feed.name);
                const escapedUrl = this.escapeXML(feed.url);
                opmlContent += `      <outline type="rss" text="${escapedTitle}" title="${escapedTitle}" xmlUrl="${escapedUrl}" />\n`;
            });

            opmlContent += `    </outline>
  </body>
</opml>`;

            // Download the file
            const blob = new Blob([opmlContent], { type: "application/xml" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `bibak-feeds-${new Date().toISOString().split('T')[0]}.opml`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            alert(`${feeds.length} RSS kaynağı başarıyla dışa aktarıldı 📥`);
        } catch (error) {
            console.error("OPML export error:", error);
            alert("OPML dışa aktarımı sırasında hata oluştu");
        }
    }

    escapeXML(str) {
        if (!str) return "";
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&apos;");
    }

    showLoading(show) {
        const loadingState = document.getElementById("loadingState");
        loadingState.style.display = show ? "flex" : "none";
    }
}

// Initialize app when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
    new BibakRSSReader();
    lucide.createIcons();
});