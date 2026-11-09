import assert from "node:assert/strict";
import { decidePriceChange } from "../src/price_watch.js";

assert.equal(decidePriceChange(12.99, 15), "alert");
assert.equal(decidePriceChange(12.99, 12.99), "steady");
console.log("price decision test passed");
