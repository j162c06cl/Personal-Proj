import { describe, expect, it } from "vitest";
import { companyKeywords, dedupeNews, relevanceOf, RawNews } from "./news";

const kw = companyKeywords("NVDA", "NVIDIA Corporation");
const scored = (items: RawNews[]) => items.map((n) => ({ ...n, relevance: relevanceOf(n, "NVDA", kw) }));

describe("companyKeywords", () => {
  it("uses the ticker and the first word of the company name", () => {
    expect(kw).toEqual(["nvda", "nvidia"]);
    expect(companyKeywords("KO", "The Coca-Cola Company")).toEqual(["ko", "coca-cola"]);
    expect(companyKeywords("AAPL", "Apple Inc.")).toEqual(["aapl", "apple"]);
  });
});

describe("relevanceOf", () => {
  it("is direct when the headline names the company or ticker", () => {
    expect(relevanceOf({ title: "Nvidia beats estimates" }, "NVDA", kw)).toBe("direct");
    expect(relevanceOf({ title: "Why NVDA stock fell today" }, "NVDA", kw)).toBe("direct");
    expect(relevanceOf({ title: "Nvidia's chipmaker partner reports" }, "NVDA", kw)).toBe("direct");
  });

  it("is related when Yahoo lists the stock as the story's main ticker", () => {
    expect(relevanceOf({ title: "Chip stocks rally", relatedTickers: ["NVDA", "AMD"] }, "NVDA", kw)).toBe("related");
  });

  it("is broad for listicles that only tag the stock in passing", () => {
    expect(relevanceOf({ title: "3 dividend stocks to buy now", relatedTickers: ["KO", "PEP", "NVDA"] }, "NVDA", kw)).toBe("broad");
  });

  it("does not match the ticker inside other words", () => {
    expect(relevanceOf({ title: "Envidia launches new brand" }, "NVDA", kw)).toBe("broad");
  });
});

describe("dedupeNews", () => {
  const items = scored([
    { uuid: "a", title: "Nvidia shares jump after record data center revenue", publisher: "Reuters", link: "https://r/1", providerPublishTime: 1000 },
    { uuid: "b", title: "Nvidia Shares Jump After Record Data-Center Revenue", publisher: "Yahoo Finance", link: "https://y/1", providerPublishTime: 1100 },
    { uuid: "c", title: "NVIDIA shares jump after record data center revenue, beats estimates", publisher: "MarketWatch", link: "https://m/1", providerPublishTime: 900 },
    { uuid: "d", title: "Nvidia faces new export restrictions to China", publisher: "Bloomberg", link: "https://b/1", providerPublishTime: 950 },
    { uuid: "e", title: "Nvidia faces new export restrictions to China", publisher: "Bloomberg", link: "https://b/1", providerPublishTime: 950 },
    { uuid: "f", title: "3 dividend stocks to buy now", publisher: "Fool", link: "https://f/1", providerPublishTime: 800, relatedTickers: ["KO", "NVDA"] },
  ]);
  const out = dedupeNews(items);

  it("merges re-headlined copies of the same story", () => {
    expect(out).toHaveLength(3);
  });

  it("keeps the newest copy and every other outlet's link", () => {
    expect(out[0].publisher).toBe("Yahoo Finance");
    expect(out[0].alsoReportedBy).toEqual([
      { publisher: "Reuters", link: "https://r/1" },
      { publisher: "MarketWatch", link: "https://m/1" },
    ]);
  });

  it("drops exact repeats of the same link", () => {
    expect(out.filter((n) => n.link === "https://b/1")).toHaveLength(1);
  });

  it("keeps different stories apart and sorts newest first", () => {
    expect(out.map((n) => n.title)).toEqual([
      "Nvidia Shares Jump After Record Data-Center Revenue",
      "Nvidia faces new export restrictions to China",
      "3 dividend stocks to buy now",
    ]);
    expect(out[2].relevance).toBe("broad");
  });

  it("upgrades a merged story to the most specific relevance", () => {
    const merged = dedupeNews([
      { title: "Chip stocks rally on AI demand", link: "https://1", providerPublishTime: 2, relevance: "broad" },
      { title: "Chip stocks rally on AI demand", link: "https://2", providerPublishTime: 1, publisher: "X", relevance: "direct" },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].relevance).toBe("direct");
  });
});
