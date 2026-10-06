import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

test("renders development preview metadata", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  assert.match(await response.text(), developmentPreviewMeta);
});

test("applies the full-price rule to the mandatory tongue-depressor case", async () => {
  const root = new URL("../app/", import.meta.url);
  const marketData = JSON.parse(await readFile(new URL("market-data.json", root)));
  const unitMap = JSON.parse(
    await readFile(new URL("medicalvm-unit-map.json", root)),
  ).mappings;
  const row = marketData.rows.find(
    (item) =>
      item.standardDescription === "ABAIXADOR DE LINGUA EM MADEIRA C/100" &&
      item.marketDescription === "ABAIXADOR DE LINGUA",
  );
  const data = marketData.productData[String(row.id)];
  const offer = data.offers.find(
    (item) => item.competitor === "LONDRICIR" && item.price === 5.47,
  );
  const standardizedUnit = unitMap[offer.unit] ?? offer.unit;
  const isPackage = ["CAIXA", "FARDO", "PACOTE", "PACK"].includes(
    standardizedUnit.toUpperCase(),
  );
  const convertedPrice = isPackage ? offer.price / offer.packSize : offer.price;
  const convertedCmv = (data.sogamaxCost / convertedPrice) * 100;
  const effectivePrice = convertedCmv < 30 ? offer.price : convertedPrice;
  const effectiveCmv = (data.sogamaxCost / effectivePrice) * 100;

  assert.equal(standardizedUnit, "Pacote");
  assert.equal(offer.packSize, 10);
  assert.ok(Math.abs(convertedPrice - 0.547) < Number.EPSILON);
  assert.ok(convertedCmv > 8.66 && convertedCmv < 8.68);
  assert.equal(effectivePrice, 5.47);
  assert.ok(effectiveCmv > 0.86 && effectiveCmv < 0.88);
  assert.notEqual(effectivePrice, 547);
});
