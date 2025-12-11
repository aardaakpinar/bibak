class RSSDatabase {
    constructor() {
        this.db = null;
        this.dbName = "BibakRSSDB";
        this.version = 1;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = () => reject(request.error);

            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Delete old stores to avoid broken schema
                if (db.objectStoreNames.contains("feeds")) db.deleteObjectStore("feeds");
                if (db.objectStoreNames.contains("articles")) db.deleteObjectStore("articles");

                // FEEDS
                const feedStore = db.createObjectStore("feeds", {
                    keyPath: "id",
                    autoIncrement: true,
                });
                feedStore.createIndex("url", "url", { unique: true });

                // ARTICLES
                const articleStore = db.createObjectStore("articles", {
                    keyPath: "id",
                    autoIncrement: true,
                });

                articleStore.createIndex("feedId", "feedId", { unique: false });
                articleStore.createIndex("guid", "guid", { unique: false });

                // bookmark index is now integer 0 or 1 → ALWAYS VALID KEY
                articleStore.createIndex("bookmarked", "bookmarked", { unique: false });
            };
        });
    }

    async addFeed(feed) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(["feeds"], "readwrite");
            const store = tx.objectStore("feeds");

            const request = store.add(feed);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    

    async getAllFeeds() {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(["feeds"], "readonly");
            const store = tx.objectStore("feeds");

            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async deleteFeed(feedId) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(["feeds", "articles"], "readwrite");

            tx.objectStore("feeds").delete(feedId);

            const articleStore = tx.objectStore("articles");
            const index = articleStore.index("feedId");

            const req = index.getAllKeys(feedId);

            req.onsuccess = () => {
                req.result.forEach(key => articleStore.delete(key));
            };

            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async addArticles(articles) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(["articles"], "readwrite");
            const store = tx.objectStore("articles");
            const guidIndex = store.index("guid");

            let i = 0;

            const addNext = () => {
                if (i >= articles.length) return;

                const article = articles[i++];
                
                // ALWAYS INTEGER KEY (0 or 1)
                article.bookmarked = article.bookmarked ? 1 : 0;

                const req = guidIndex.get(article.guid);

                req.onsuccess = () => {
                    if (!req.result) store.add(article);
                    addNext();
                };

                req.onerror = () => reject(req.error);
            };

            addNext();

            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async getAllArticles() {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(["articles"], "readonly");
            const store = tx.objectStore("articles");

            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getArticlesByFeed(feedId) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(["articles"], "readonly");
            const store = tx.objectStore("articles");
            const index = store.index("feedId");

            const request = index.getAll(feedId);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getBookmarkedArticles() {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(["articles"], "readonly");
            const store = tx.objectStore("articles");
            const index = store.index("bookmarked");

            // 🔥 Integer key → always valid
            const request = index.getAll(1);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async updateArticle(article) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(["articles"], "readwrite");
            const store = tx.objectStore("articles");

            // normalize bookmark value
            article.bookmarked = article.bookmarked ? 1 : 0;

            const request = store.put(article);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
}
