class RSSParser {
    async fetchFeed(url) {
        const proxies = [
            (u) => `https://bibak.yyazok.workers.dev/?url=${encodeURIComponent(u)}`
        ];

        let lastError = null;

        for (const makeProxy of proxies) {
            try {
                const proxyUrl = makeProxy(url);
                const res = await fetch(proxyUrl);
                const text = await res.text();

                // HTML hata sayfası
                if (text.startsWith("<!DOCTYPE html") || text.startsWith("<html")) {
                    throw new Error("Proxy returned HTML, feed not accessible.");
                }

                // JSON error
                if (text.trim().startsWith("{")) {
                    const json = JSON.parse(text);
                    if (json.error) throw new Error(json.message);
                }

                // XML parse
                const parser = new DOMParser();
                const xml = parser.parseFromString(text, "application/xml");

                if (xml.querySelector("parsererror")) {
                    throw new Error("Invalid XML");
                }

                // Parse başarılı
                const isAtom = xml.querySelector("feed");
                return isAtom ? this.parseAtom(xml) : this.parseRSS(xml);
            } catch (err) {
                lastError = err;
                console.warn("Proxy error:", err.message);
                continue;
            }
        }

        throw lastError || new Error("Feed could not be loaded via any proxy.");
    }

    parseRSS(xml) {
        const channel = xml.querySelector("channel");
        const items = Array.from(xml.querySelectorAll("item"));

        return {
            title: this.getTextContent(channel, "title"),
            items: items.map((item) => {
                const description = this.getTextContent(item, "description");
                // <content:encoded> carries the full article on many feeds
                const content = this.getByTag(item, "content:encoded");

                return {
                    title: this.getTextContent(item, "title"),
                    link: this.getTextContent(item, "link"),
                    description,
                    content,
                    image: this.findImage(item, content || description),
                    pubDate: this.getTextContent(item, "pubDate"),
                    guid: this.getTextContent(item, "guid") || this.getTextContent(item, "link"),
                };
            }),
        };
    }

    parseAtom(xml) {
        const feed = xml.querySelector("feed");
        const entries = Array.from(xml.querySelectorAll("entry"));

        return {
            title: this.getTextContent(feed, "title"),
            items: entries.map((entry) => {
                const links = Array.from(entry.querySelectorAll("link"));
                const link = links.find((l) => !l.getAttribute("rel") || l.getAttribute("rel") === "alternate") || links[0];
                const summary = this.getTextContent(entry, "summary");
                const content = this.getTextContent(entry, "content");

                return {
                    title: this.getTextContent(entry, "title"),
                    link: link ? link.getAttribute("href") : "",
                    description: summary || content,
                    content,
                    image: this.findImage(entry, content || summary),
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

    // Namespaced tags (content:encoded, media:thumbnail) are looked up by qualified name
    getByTag(parent, qualifiedName) {
        const element = parent.getElementsByTagName(qualifiedName)[0];
        return element ? element.textContent.trim() : "";
    }

    // Best cover image for an item: media tags, image enclosure, then first <img> in the body
    findImage(item, html) {
        const candidates = [];

        for (const tag of ["media:thumbnail", "media:content"]) {
            for (const el of Array.from(item.getElementsByTagName(tag))) {
                const type = el.getAttribute("type") || "";
                const medium = el.getAttribute("medium") || "";
                if (!type || type.startsWith("image/") || medium === "image" || tag === "media:thumbnail") {
                    candidates.push(el.getAttribute("url"));
                }
            }
        }

        for (const el of Array.from(item.querySelectorAll("enclosure, link[rel='enclosure']"))) {
            if ((el.getAttribute("type") || "").startsWith("image/")) {
                candidates.push(el.getAttribute("url") || el.getAttribute("href"));
            }
        }

        const found = candidates.find(Boolean);
        return found ? this.normalizeUrl(found) : this.firstImageInHTML(html);
    }

    firstImageInHTML(html) {
        if (!html) return "";
        const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
        return match ? this.normalizeUrl(match[1]) : "";
    }

    // The app is served over https, so plain-http images would be blocked
    normalizeUrl(url) {
        if (!url) return "";
        url = url.trim();
        if (url.startsWith("//")) return "https:" + url;
        return url.replace(/^http:\/\//i, "https://");
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
