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
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  assert.match(await response.text(), developmentPreviewMeta);
});

test("keeps the three global CMV branches available for every eligible product", async () => {
  const root = new URL("../", import.meta.url);
  const marketData = await readMarketData(root);
  const bands = { below: false, middle: false, above: false };

  for (const row of marketData.rows) {
    const data = marketData.productData[String(row.id)];
    if (!(data.sogamaxFullCost > 0)) continue;
    for (const offer of data.offers) {
      if (!(offer.price > 0)) continue;
      const cmv = (data.sogamaxFullCost / offer.price) * 100;
      if (cmv < 30) bands.below = true;
      else if (cmv > 200) bands.above = true;
      else bands.middle = true;
    }
  }

  assert.deepEqual(bands, { below: true, middle: true, above: true });
});

test("preserves the validated special handling for gloves, compresses and gauzes", async () => {
  const source = await readFile(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /Validação comercial da luva/);
  assert.match(source, /Validação comercial de compressas\/gazes/);
  assert.match(source, /offer\.price \* sogamaxPackSize/);
});

test("applies the validated CMV formula once and quarantines absurd results", async () => {
  const root = new URL("../", import.meta.url);
  const source = await readFile(new URL("app/page.tsx", root), "utf8");

  assert.match(source, /FULL_PRICE_CMV_THRESHOLD = 30/);
  assert.match(source, /MAX_COHERENT_CMV_THRESHOLD = 200/);
  assert.match(source, /normalized\.originalPrice \/ presentation/);
  assert.match(source, /normalized\.originalPrice \* presentation/);
  assert.match(source, /preço original mantido/);
  assert.match(source, /MIN_DISPLAYABLE_CMV_THRESHOLD = 1/);
  assert.match(source, /MAX_DISPLAYABLE_CMV_THRESHOLD = 500/);
  assert.match(source, /Cadastro fora do ranking/);
});

test("calculates purchase suggestion CMV from the entered value divided by the best price", async () => {
  const root = new URL("../", import.meta.url);
  const source = await readFile(new URL("app/page.tsx", root), "utf8");
  const exampleCmv = (10 / 7.33) * 100;

  assert.equal(exampleCmv.toFixed(2), "136.43");
  assert.match(source, /info\.lowest &&[\s\S]*purchaseSuggestionValue \/ info\.lowest\.price/);
  assert.doesNotMatch(
    source,
    /sogamaxOfficialCost \/ purchaseSuggestionValue/,
  );
});

test("builds the October refresh from official sources and blocks unsafe matches", async () => {
  const root = new URL("../", import.meta.url);
  const marketData = await readMarketData(root);

  assert.equal(marketData.summary.marketLines, 50312);
  assert.equal(marketData.summary.cleanDescriptions, 6527);
  assert.equal(marketData.summary.sogamaxReferences, 5055);
  assert.equal(marketData.summary.period, "2026-10-13");

  const unsafe = marketData.rows.find(
    (item) =>
      item.status === "Revisar" &&
      item.evidence.some((value) => /incompatível/i.test(value)),
  );
  assert.ok(unsafe);
  assert.equal(marketData.productData[String(unsafe.id)].sogamaxPrice, 0);

  const ceftriaxone = marketData.rows.find(
    (item) =>
      item.status === "Padronizado" &&
      item.standardDescription === "CEFTRIAXONA 1G PÓ FR/AMP IV *",
  );
  const ceftriaxoneData = marketData.productData[String(ceftriaxone.id)];
  assert.equal(ceftriaxoneData.sogamaxPrice, 4.09);
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
  const source = await readFile(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /offer\.selected \? offer\.quantity : 0/);
  assert.match(source, /offers\.filter\(\(offer\) => offer\.selected\)/);
  assert.match(source, /data\.sogamaxBrand \|\| "Marca não informada"/);
  assert.match(source, /data\.sogamaxFullPrice \?\? data\.sogamaxPrice/);
  assert.match(
    source,
    /const sogamaxOfficialPrice =[\s\S]*info\.data\.sogamaxFullPrice \?\? info\.data\.sogamaxPrice/,
  );
  assert.match(
    source,
    /const sogamaxOfficialCost =[\s\S]*info\.data\.sogamaxFullCost \?\? info\.data\.sogamaxCost/,
  );
  assert.match(source, /sogamaxOfficialCost \/ sogamaxOfficialPrice/);
  assert.match(source, /valor exato da coluna VALOR/);
  assert.match(source, /Validação comercial da luva/);
  assert.match(source, /Validação comercial de compressas\/gazes/);
  assert.match(source, /Menor preço comparável/);
  assert.match(source, /na apresentação Sogamax/);
  assert.match(
    source,
    /info\.data\.sogamaxFullCost \?\?[\s\S]*info\.data\.sogamaxCost/,
  );
  assert.match(source, /valor exato da coluna VLR ÚLT\.COMPRA/);
  assert.match(source, /valor exato da coluna CUSTO/);
  assert.match(source, /money\(info\.data\.lastPurchaseCost\)/);
  assert.match(source, /money\(sogamaxOfficialCost\)/);
  assert.equal(source.match(/<th>Regra aplicada<\/th>/g)?.length, 2);
  assert.doesNotMatch(source, /<th>Preço após conversão<\/th>/);
  assert.doesNotMatch(source, /<th>CMV após conversão<\/th>/);
  assert.doesNotMatch(source, /<th>CMV considerado<\/th>/);
  assert.match(source, /Regra única baseada no CMV inicial/);
  assert.match(source, /Revisar cadastro/);
  assert.match(source, /não participam do[\s\S]*ranking/);
  assert.match(source, /SELECIONADO=S/);
  assert.match(source, /filter\(\(offer\) => !isOwnSogamaxOffer\(offer\)\)/);
  assert.match(source, /oferta\(s\) da própria Sogamax/);
});

test("shows demand for every brand from all offers associated with that brand", async () => {
  const source = await readFile(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /demand: group\.reduce\([\s\S]*sum \+ Math\.max\(offer\.quantity, 0\)/,
  );
  assert.match(source, /baseUnit: group\[0\]\?\.baseUnit/);
  assert.match(source, /\{brand\.baseUnit\}/);
});

test("does not treat inhaler doses as commercial package quantity", async () => {
  const root = new URL("../", import.meta.url);
  const marketData = await readMarketData(root);
  const rows = marketData.rows.filter(
    (item) => item.standardDescription === "AEROLIN SPRAY 100MCG C/200 DOSES",
  );

  assert.ok(rows.length > 0);
  for (const row of rows) {
    const data = marketData.productData[String(row.id)];
    assert.equal(data.sogamaxPresentation, 1);
    assert.equal(data.sogamaxPrice, data.sogamaxFullPrice);
    assert.equal(data.sogamaxCost, data.sogamaxFullCost);
  }
});
