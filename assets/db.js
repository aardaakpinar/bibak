class RSSDatabase {
    constructor() {
        this.db = null;
        this.dbName = "BibakRSSDB";
        this.version = 2;
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

                if (db.objectStoreNames.contains("feeds")) db.deleteObjectStore("feeds");
                if (db.objectStoreNames.contains("articles")) db.deleteObjectStore("articles");

                const feedStore = db.createObjectStore("feeds", {
                    keyPath: "id",
                    autoIncrement: true,
                });
                feedStore.createIndex("url", "url", { unique: true });

                const articleStore = db.createObjectStore("articles", {
                    keyPath: "id",
                    autoIncrement: true,
                });

                articleStore.createIndex(
                    "feed_guid",
                    ["feedId", "guid"],
                    { unique: true }
                );

                articleStore.createIndex("feedId", "feedId", { unique: false });
                articleStore.createIndex("bookmarked", "bookmarked", { unique: false });
                articleStore.createIndex("unread", "unread", { unique: false });
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
            const index = store.index("feed_guid");

            let i = 0;

            const addNext = () => {
                if (i >= articles.length) return;

                const article = articles[i++];
                article.bookmarked = article.bookmarked ? 1 : 0;

                const req = index.get([article.feedId, article.guid]);

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
            article.unread = article.unread ? 1 : 0;

            const request = store.put(article);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getUnreadArticles() {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(["articles"], "readonly");
            const store = tx.objectStore("articles");
            const index = store.index("unread");

            const request = index.getAll(1);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async markArticleAsRead(articleId) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(["articles"], "readwrite");
            const store = tx.objectStore("articles");

            const getRequest = store.get(articleId);

            getRequest.onsuccess = () => {
                const article = getRequest.result;
                if (article) {
                    article.unread = 0;
                    const updateRequest = store.put(article);
                    updateRequest.onsuccess = () => resolve(article);
                    updateRequest.onerror = () => reject(updateRequest.error);
                } else {
                    resolve(null);
                }
            };

            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    async markArticleAsUnread(articleId) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(["articles"], "readwrite");
            const store = tx.objectStore("articles");

            const getRequest = store.get(articleId);

            getRequest.onsuccess = () => {
                const article = getRequest.result;
                if (article) {
                    article.unread = 1;
                    const updateRequest = store.put(article);
                    updateRequest.onsuccess = () => resolve(article);
                    updateRequest.onerror = () => reject(updateRequest.error);
                } else {
                    resolve(null);
                }
            };

            getRequest.onerror = () => reject(getRequest.error);
        });
    }
}
