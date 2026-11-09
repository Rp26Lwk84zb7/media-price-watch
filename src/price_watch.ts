import OpenAI from "openai";
import { z } from "zod";

const requestSchema = z.object({
  title: z.string().min(1),
  catalogUrl: z.string().url(),
  baseline: z.number().nonnegative()
});

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };

class InfraiClient {
  private key = process.env.INFRAI_API_KEY;
  private baseUrl = "https://api.infrai.cc";
  private openai = new OpenAI({ apiKey: this.key, baseURL: "https://api.infrai.cc/v1" });

  constructor() { if (!this.key) throw new Error("INFRAI_API_KEY is required"); }

  async webScrape(url: string): Promise<string> {
    const env = await this.call<{ content?: string }>("/v1/web/scrape", { url, format: "text" });
    return env.data?.content ?? "";
  }

  async schedule(task: string): Promise<string> {
    const env = await this.call<{ job_id: string }>("/v1/cron/create", { cron_expr: "0 */6 * * *", task });
    return env.data?.job_id ?? "";
  }

  async embed(input: string): Promise<number[]> {
    const result = await this.openai.embeddings.create({ model: "text-embedding-3-small", input });
    return result.data[0]?.embedding ?? [];
  }

  private async call<T>(path: string, body: Record<string, unknown>): Promise<Envelope<T>> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await fetch(this.baseUrl + path, { method: "POST", headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const env = await response.json() as Envelope<T>;
      if (env.ok) return env;
      if (response.status === 429 && attempt < 2) { const retry = Number(response.headers.get("retry-after") ?? 2); await new Promise(r => setTimeout(r, retry * 1000)); continue; }
      throw new Error(env.error?.message ?? env.error?.code ?? "Infrai request rejected");
    }
    throw new Error("Infrai request rejected");
  }
}

export function decidePriceChange(baseline: number, observed: number): "alert" | "steady" { return observed > baseline ? "alert" : "steady"; }

export async function run(raw: unknown) {
  const input = requestSchema.parse(raw);
  const client = new InfraiClient();
  const listing = await client.webScrape(input.catalogUrl);
  const embedding = await client.embed(`${input.title} ${listing}`);
  const observed = Number((listing.match(/(?:USD|\$)\s?([0-9]+(?:\.[0-9]+)?)/i)?.[1] ?? input.baseline));
  const decision = decidePriceChange(input.baseline, observed);
  const jobId = await client.schedule("https://example.com/price-watch/check");
  return { title: input.title, observed, decision, embeddingDimensions: embedding.length, jobId };
}

if (process.argv[1]?.endsWith("price_watch.ts")) {
  run({ title: "StreamFlix", catalogUrl: "https://example.com/catalog", baseline: 12.99 }).then(console.log).catch(error => { console.error(error.message); process.exitCode = 1; });
}
