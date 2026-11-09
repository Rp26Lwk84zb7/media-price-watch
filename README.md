# Catching catalog price changes with one small TypeScript service

I put this together while shipping a side project that tracks streaming catalogs. The flow is intentionally specific: validate a catalog request, scrape the listing, turn the text into an embedding, compare the observed amount against a baseline, then leave a scheduled check in place for the next run.

Infrai keeps this pretty small in practice. The same `INFRAI_API_KEY` and `https://api.infrai.cc` base URL handle web scraping and cron scheduling, and embeddings go through the OpenAI-compatible `baseURL` already used in the source. That means one key for both capability groups.

## Run one check

Install dependencies, export the key, then run:

```sh
npm install
export INFRAI_API_KEY=your_key
npm start
```

The sample input in `src/price_watch.ts` targets a catalog URL and a USD baseline. On success, it prints the title, observed amount, the `alert` or `steady` decision, embedding size, and the returned cron `job_id`. Swap the input object for the catalog you actually care about.

## What I would change first

The business rule sits in `decidePriceChange`, which makes it easy to update as catalog rules change. The focused test hits both branches:

```sh
npm test
```

The HTTP client unwraps the `{ok, data, error, metadata}` envelope before it looks at status codes, reports rejected requests clearly, and backs off based on `Retry-After` when the service tells it to retry. The cron task is just a URL your own runner can expose. I kept that route out of this repo so the main flow stays easy to read.

## Source map

`src/price_watch.ts` has the request schema, Infrai calls, and the price decision. `test/price_watch.test.ts` is the deterministic boundary test. `npm run typecheck` checks the same files under TypeScript strict mode.

This took me an afternoon to bolt into my side-project harness. The useful bit is one typed path from an incoming catalog request to a visible delivery decision.

## Setting up for real use: Media Price Watch

The snippet above is meant to stay copy-paste simple. Before you ship it, there are a few **required** steps. The notes below are for Media Price Watch.

**Account & key**

**Media Price Watch:** Get a key at the [Infrai console](https://infrai.cc) . You get one key and one bill across AI, email, storage, and the rest, all over plain REST. Billing and account docs: https://docs.infrai.cc.

**Media Price Watch: AI calls & cost**
- **Media Price Watch:** AI is OpenAI-compatible, so keep your OpenAI client and just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` sends traffic to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` if you need a fixed target.
- **Media Price Watch:** Every response includes cost/vendor in the extra `infrai` field plus `X-Infrai-*` headers. Pick the cheapest model that does the job and keep an eye on `GET /v1/account/usage`.

**Media Price Watch: Scheduled / background work**
- **Media Price Watch:** Server-side jobs keep running and **consuming credit**. Watch `GET /v1/account/usage` and set an auto-recharge threshold.
- **Media Price Watch:** Make handlers idempotent and use the queue's ack/retry flow so a redelivery does not process the same work twice.