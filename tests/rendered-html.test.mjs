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
  const initialCmv = (data.sogamaxFullCost / offer.price) * 100;
  const effectivePrice =
    initialCmv < 30
      ? offer.price / data.sogamaxPresentation
      : initialCmv > 200
        ? offer.price * data.sogamaxPresentation
        : offer.price;
  const effectiveCmv = (data.sogamaxFullCost / effectivePrice) * 100;

  assert.equal(standardizedUnit, "Pacote");
  assert.equal(offer.packSize, 10);
  assert.equal(offer.selected, false);
  assert.ok(initialCmv > 86.69 && initialCmv < 86.7);
  assert.equal(effectivePrice, 5.47);
  assert.ok(effectiveCmv > 86.69 && effectiveCmv < 86.7);
  assert.notEqual(effectivePrice, 547);
});

test("applies the commercially validated multiplication to sub-real glove prices", async () => {
  const root = new URL("../", import.meta.url);
  const marketData = await readMarketData(root);
  const row = marketData.rows.find(
    (item) =>
      item.standardDescription === "LUVA DE PROCEDIMENTO TAM PP C/ PO C/100" &&
      item.marketDescription.includes("pp com po"),
  );
  const data = marketData.productData[String(row.id)];
  const offer = data.offers.find(
    (item) => item.competitor === "MEDFUTURA - RJ" && item.price === 0.3,
  );
  const consideredPrice = offer.price * data.sogamaxPresentation;
  const cmv = (data.sogamaxFullCost / consideredPrice) * 100;

  assert.equal(consideredPrice, 30);
  assert.equal(cmv, 52);
});

test("treats compress and gauze prices as basic-unit prices", async () => {
  const root = new URL("../", import.meta.url);
  const marketData = await readMarketData(root);
  const row = marketData.rows.find(
    (item) =>
      item.standardDescription ===
        "COMPRESSA DE GAZE 13F. 7,5 x 7,5 500 X 10 ESTERIL" &&
      item.marketDescription === "Gaze Estéril 7,5 X 7,5 - 13 fios",
  );
  const data = marketData.productData[String(row.id)];
  const offer = data.offers.find(
    (item) =>
      item.competitor === "SUPERMED ARUJA SP" &&
      item.price === 0.42 &&
      item.packSize === 1200,
  );
  const consideredPrice = offer.price * data.sogamaxPresentation;
  const cmv = (data.sogamaxFullCost / consideredPrice) * 100;

  assert.equal(data.sogamaxPresentation, 500);
  assert.equal(consideredPrice, 210);
  assert.ok(cmv > 98.94 && cmv < 98.95);
  assert.notEqual(consideredPrice, (offer.price / offer.packSize) * 500);
});

test("uses the CMV coherence band for Campo Operatorio C/5", async () => {
  const root = new URL("../", import.meta.url);
  const marketData = await readMarketData(root);
  const standardDescription =
    "CAMPO OPERATORIO 25CM X 28CM PCT C/5 15G C/RX EST";

  const packageRow = marketData.rows.find(
    (item) =>
      item.standardDescription === standardDescription &&
      item.marketDescription === "CAMPO OPERATORIO 25 X 28 CM",
  );
  const packageData = marketData.productData[String(packageRow.id)];
  const rioclarense = packageData.offers.find(
    (item) =>
      item.competitor === "RIOCLARENSE LONDRINA - PR" &&
      item.price === 5.6665,
  );
  const incorrectLogisticConversion =
    (rioclarense.price / rioclarense.packSize) *
    packageData.sogamaxPresentation;
  const initialCmv =
    (packageData.sogamaxFullCost / rioclarense.price) * 100;

  assert.ok(incorrectLogisticConversion < 0.17);
  assert.ok(initialCmv > 79.83 && initialCmv < 79.85);
  assert.ok(initialCmv >= 30 && initialCmv <= 200);
  assert.equal(rioclarense.price, 5.6665);

  const unitRow = marketData.rows.find(
    (item) =>
      item.standardDescription === standardDescription &&
      item.marketDescription ===
        "COMPRESSA CAMPO OPERATORIO ESTERIL 25x28 C/ 5UN",
  );
  const unitData = marketData.productData[String(unitRow.id)];
  const brazmix = unitData.offers.find(
    (item) => item.competitor === "BRAZMIX" && item.price === 4.75,
  );
  const unitInitialCmv = (unitData.sogamaxFullCost / brazmix.price) * 100;
  const effectivePrice =
    unitInitialCmv < 30
      ? brazmix.price / unitData.sogamaxPresentation
      : unitInitialCmv > 200
        ? brazmix.price * unitData.sogamaxPresentation
        : brazmix.price;
  const effectiveCmv = (unitData.sogamaxFullCost / effectivePrice) * 100;

  assert.ok(unitInitialCmv > 95.24 && unitInitialCmv < 95.25);
  assert.equal(effectivePrice, 4.75);
  assert.ok(effectiveCmv > 95.24 && effectiveCmv < 95.25);
});

test("keeps the multiplied price selected from an initial CMV above 200%", async () => {
  const root = new URL("../", import.meta.url);
  const marketData = await readMarketData(root);
  const row = marketData.rows.find(
    (item) =>
      item.standardDescription ===
        "CAMPO OPERATORIO 45CM X 50CM PCT C/50 15G S/RX N/EST" &&
      item.marketDescription ===
        "Compressa campo operatorio 45cm x 50cm (sem fio radiopaco)",
  );
  const data = marketData.productData[String(row.id)];
  const offer = data.offers.find(
    (item) =>
      item.competitor === "SUPERMED CAMBUI ITAIM MG" &&
      item.price === 2.8512,
  );
  const initialCmv = (data.sogamaxFullCost / offer.price) * 100;
  const consideredPrice = offer.price * data.sogamaxPresentation;
  const consideredCmv =
    (data.sogamaxFullCost / consideredPrice) * 100;

  assert.ok(initialCmv > 1476 && initialCmv < 1477);
  assert.equal(data.sogamaxPresentation, 50);
  assert.equal(consideredPrice, 142.56);
  assert.ok(consideredCmv > 29.52 && consideredCmv < 29.53);
});

test("converts the validated Campo Operatorio case above the new 200% ceiling", async () => {
  const root = new URL("../", import.meta.url);
  const marketData = await readMarketData(root);
  const row = marketData.rows.find(
    (item) =>
      item.standardDescription ===
        "CAMPO OPERATORIO 25CM X 28CM PCT C/5 15G C/RX EST" &&
      item.marketDescription ===
        "CAMPO OPERATATRIO ESTERIL RADIOPACO 25X28 C/ 5",
  );
  const data = marketData.productData[String(row.id)];
  const offer = data.offers.find(
    (item) =>
      item.competitor === "CA HOSPITALAR" && item.price === 1.8869,
  );
  const initialCmv = (data.sogamaxFullCost / offer.price) * 100;
  const consideredPrice = offer.price * data.sogamaxPresentation;
  const consideredCmv =
    (data.sogamaxFullCost / consideredPrice) * 100;

  assert.ok(initialCmv > 239.75 && initialCmv < 239.77);
  assert.equal(data.sogamaxPresentation, 5);
  assert.equal(consideredPrice, 9.4345);
  assert.ok(consideredCmv > 47.95 && consideredCmv < 47.96);
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

test("builds September data from official sources and blocks unsafe matches", async () => {
  const root = new URL("../", import.meta.url);
  const marketData = await readMarketData(root);

  assert.equal(marketData.summary.marketLines, 173495);
  assert.equal(marketData.summary.cleanDescriptions, 16444);
  assert.equal(marketData.summary.sogamaxReferences, 5053);

  const clonidine = marketData.rows.find(
    (item) =>
      item.marketDescription.trim().toUpperCase() === "CLONIDINA 0,100MG VO",
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
  assert.match(source, /não disponível na tabela oficial/);
  assert.match(source, /valor exato da coluna CUSTO/);
  assert.doesNotMatch(source, /money\(info\.data\.lastPurchaseCost\)/);
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
