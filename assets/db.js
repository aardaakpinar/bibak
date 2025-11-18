// IndexedDB wrapper
class RSSDatabase {
    constructor() {
        this.dbName = "bibak-rss-reader";
        this.version = 1;
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                if (!db.objectStoreNames.contains("feeds")) {
                    const feedStore = db.createObjectStore("feeds", { keyPath: "id", autoIncrement: true });
                    feedStore.createIndex("url", "url", { unique: true });
                }

                if (!db.objectStoreNames.contains("articles")) {
                    const articleStore = db.createObjectStore("articles", { keyPath: "id", autoIncrement: true });
                    articleStore.createIndex("feedId", "feedId", { unique: false });
                    articleStore.createIndex("pubDate", "pubDate", { unique: false });
                    articleStore.createIndex("bookmarked", "bookmarked", { unique: false });
                }
            };
        });
    }

    async addFeed(feed) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(["feeds"], "readwrite");
            const store = transaction.objectStore("feeds");
            const request = store.add(feed);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getAllFeeds() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(["feeds"], "readonly");
            const store = transaction.objectStore("feeds");
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async deleteFeed(feedId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(["feeds", "articles"], "readwrite");
            const feedStore = transaction.objectStore("feeds");
            const articleStore = transaction.objectStore("articles");

            feedStore.delete(feedId);

            const articlesIndex = articleStore.index("feedId");
            const articlesRequest = articlesIndex.openCursor(IDBKeyRange.only(feedId));

            articlesRequest.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    cursor.delete();
                    cursor.continue();
                }
            };

            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }

    async addArticles(articles) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(["articles"], "readwrite");
            const store = transaction.objectStore("articles");

            articles.forEach((article) => {
                store.put(article);
            });

            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }

    async getAllArticles() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(["articles"], "readonly");
            const store = transaction.objectStore("articles");
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getArticlesByFeed(feedId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(["articles"], "readonly");
            const store = transaction.objectStore("articles");
            const index = store.index("feedId");
            const request = index.getAll(feedId);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async updateArticle(article) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(["articles"], "readwrite");
            const store = transaction.objectStore("articles");
            const request = store.put(article);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getBookmarkedArticles() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(["articles"], "readonly");
            const store = transaction.objectStore("articles");
            const request = store.openCursor();
            const bookmarkedArticles = [];

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    if (cursor.value.bookmarked === true) {
                        bookmarkedArticles.push(cursor.value);
                    }
                    cursor.continue();
                } else {
                    resolve(bookmarkedArticles);
                }
            };

            request.onerror = () => reject(request.error);
        });
    }
}
