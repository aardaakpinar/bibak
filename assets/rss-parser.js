// RSS Parser
class RSSParser {
    async fetchFeed(url) {
        try {
            const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
            const response = await fetch(proxyUrl);
            const text = await response.text();
            const parser = new DOMParser();
            const xml = parser.parseFromString(text, "text/xml");

            const parserError = xml.querySelector("parsererror");
            if (parserError) {
                throw new Error("Invalid XML");
            }

            const isAtom = xml.querySelector("feed");
            if (isAtom) {
                return this.parseAtom(xml);
            } else {
                return this.parseRSS(xml);
            }
        } catch (error) {
            console.error("Error fetching feed:", error);
            throw error;
        }
    }

    parseRSS(xml) {
        const channel = xml.querySelector("channel");
        const items = Array.from(xml.querySelectorAll("item"));

        return {
            title: this.getTextContent(channel, "title"),
            items: items.map((item) => ({
                title: this.getTextContent(item, "title"),
                link: this.getTextContent(item, "link"),
                description: this.getTextContent(item, "description"),
                pubDate: this.getTextContent(item, "pubDate"),
                guid: this.getTextContent(item, "guid") || this.getTextContent(item, "link"),
            })),
        };
    }

    parseAtom(xml) {
        const feed = xml.querySelector("feed");
        const entries = Array.from(xml.querySelectorAll("entry"));

        return {
            title: this.getTextContent(feed, "title"),
            items: entries.map((entry) => {
                const link = entry.querySelector("link");
                return {
                    title: this.getTextContent(entry, "title"),
                    link: link ? link.getAttribute("href") : "",
                    description: this.getTextContent(entry, "summary") || this.getTextContent(entry, "content"),
                    pubDate: this.getTextContent(entry, "published") || this.getTextContent(entry, "updated"),
                    guid: this.getTextContent(entry, "id"),
                };
            }),
        };
    }

    getTextContent(parent, tagName) {
        const element = parent.querySelector(tagName);
        return element ? element.textContent.trim() : "";
    }

    formatDate(dateString) {
        if (!dateString) return "Tarih bilinmiyor";

        const date = new Date(dateString);
        if (isNaN(date.getTime())) return "Tarih bilinmiyor";

        const now = new Date();
        const diff = now - date;
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));

        if (days === 0) return "Bugün";
        if (days === 1) return "Dün";
        if (days < 7) return `${days} gün önce`;

        return date.toLocaleDateString("tr-TR", {
            year: "numeric",
            month: "short",
            day: "numeric",
        });
    }
}
