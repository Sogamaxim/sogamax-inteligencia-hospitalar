import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";

async function readMarketData(root) {
  return JSON.parse(
    gunzipSync(
      await readFile(new URL("public/market-data.json.gz", root)),
    ).toString("utf8"),
  );
}

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
  const root = new URL("../", import.meta.url);
  const marketData = await readMarketData(root);
  const unitMap = JSON.parse(
    await readFile(new URL("app/medicalvm-unit-map.json", root)),
  ).mappings;
  const row = marketData.rows.find(
    (item) =>
      item.standardDescription === "ABAIXADOR DE LINGUA EM MADEIRA C/100" &&
      item.marketDescription.trim().toUpperCase() === "ABAIXADOR DE LINGUA",
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
  assert.equal(offer.selected, false);
  assert.ok(Math.abs(convertedPrice - 0.547) < Number.EPSILON);
  assert.ok(convertedCmv > 8.66 && convertedCmv < 8.68);
  assert.equal(effectivePrice, 5.47);
  assert.ok(effectiveCmv > 0.86 && effectiveCmv < 0.88);
  assert.notEqual(effectivePrice, 547);
});

test("builds September data from official sources and blocks unsafe matches", async () => {
  const root = new URL("../", import.meta.url);
  const marketData = await readMarketData(root);

  assert.equal(marketData.summary.marketLines, 173495);
  assert.equal(marketData.summary.cleanDescriptions, 16444);
  assert.equal(marketData.summary.sogamaxReferences, 5053);

  const clonidine = marketData.rows.find(
    (item) => item.marketDescription.trim().toUpperCase() === "CLONIDINA 0,100MG VO",
  );
  assert.equal(clonidine.status, "Revisar");
  assert.match(clonidine.evidence.join(" "), /incompatível/i);
  assert.equal(marketData.productData[String(clonidine.id)].sogamaxPrice, 0);

  const speculum = marketData.rows.find((item) =>
    item.marketDescription
      .trim()
      .toUpperCase()
      .includes("ESPECULO VAGINAL DESC G NAO ESTERIL"),
  );
  assert.equal(speculum.status, "Revisar");
  assert.match(speculum.evidence.join(" "), /não estéril incompatível/i);

  const ceftriaxone = marketData.rows.find(
    (item) =>
      item.status === "Padronizado" &&
      item.standardDescription === "CEFTRIAXONA 1G PÓ FR/AMP IV *",
  );
  const ceftriaxoneData = marketData.productData[String(ceftriaxone.id)];
  assert.equal(ceftriaxoneData.sogamaxPrice, 4.085);
  assert.equal(ceftriaxoneData.sogamaxBrand, "BLAU");

  const simethicone = marketData.rows.find(
    (item) =>
      item.status === "Padronizado" &&
      item.standardDescription === "SIMETICONA 40MG C/20 COMP",
  );
  assert.equal(
    marketData.productData[String(simethicone.id)].sogamaxPresentation,
    20,
  );
});

test("uses only selected MedicalVM offers for demand and shows the official brand", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /offer\.selected \? offer\.quantity : 0/);
  assert.match(source, /offers\.filter\(\(offer\) => offer\.selected\)/);
  assert.match(source, /data\.sogamaxBrand \|\| "Marca não informada"/);
  assert.match(source, /data\.sogamaxFullPrice \?\? data\.sogamaxPrice/);
  assert.match(
    source,
    /info\.data\.sogamaxFullCost \?\?[\s\S]*info\.data\.sogamaxCost/,
  );
  assert.match(source, /não disponível na tabela oficial/);
  assert.match(source, /valor exato da coluna CUSTO/);
  assert.doesNotMatch(source, /money\(info\.data\.lastPurchaseCost\)/);
  assert.equal(source.match(/<th>Regra aplicada<\/th>/g)?.length, 2);
  assert.doesNotMatch(source, /<th>Preço após conversão<\/th>/);
  assert.doesNotMatch(source, /<th>CMV após conversão<\/th>/);
  assert.doesNotMatch(source, /<th>CMV considerado<\/th>/);
  assert.match(source, /Preço cheio aplicado no ranking/);
  assert.match(source, /SELECIONADO=S/);
});
