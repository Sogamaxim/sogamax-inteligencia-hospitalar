"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import realData from "./market-data.json";
import sogamaxPresentations from "./sogamax-presentations.json";

type View = "dashboard" | "schedule" | "validation" | "export";
type MatchStatus = "Padronizado" | "Provável" | "Revisar";
type PopupKind = "prices" | "demands" | "brands";
type FileState = "ready" | "duplicate" | "old";

type DescriptionRow = {
  id: number;
  marketDescription: string;
  standardDescription: string;
  repetitions: number;
  confidence: number;
  status: MatchStatus;
  evidence: string[];
};

type MarketOffer = {
  competitor: string;
  brand: string;
  price: number;
  quantity: number;
  unit: string;
  packSize: number | null;
  baseUnit: string;
};

type ProductData = {
  sogamaxPrice: number;
  sogamaxCost: number;
  lastPurchaseCost: number;
  offers: MarketOffer[];
};

type NormalizedOffer = MarketOffer & {
  originalPrice: number;
  normalizedPrice: number;
  clientPresentation: number;
  priceBasis: "Embalagem" | "Unidade básica";
  conversionRule: string;
};

const rows = realData.rows as DescriptionRow[];
const productData = realData.productData as Record<number, ProductData>;
const summaryData = realData.summary;
const formatCount = (value: number) => value.toLocaleString("pt-BR");

const processedFiles = [
  {
    name: "MedicalVM_2026-08-20.xlsx",
    period: "20/08/2026",
    rows: "2.597 linhas",
    status: "Concluído",
  },
  {
    name: "MedicalVM_2026-08-13.xlsx",
    period: "13/08/2026",
    rows: "2.418 linhas",
    status: "Concluído",
  },
  {
    name: "MedicalVM_2026-08-06.xlsx",
    period: "06/08/2026",
    rows: "2.206 linhas",
    status: "Concluído",
  },
];

const navItems: { id: View; label: string; description: string }[] = [
  {
    id: "dashboard",
    label: "Visão geral",
    description: "Indicadores da padronização",
  },
  {
    id: "schedule",
    label: "Programar análise",
    description: "Enviar tabela do mercado",
  },
  {
    id: "validation",
    label: "Validação assistida",
    description: "Revisar descrições",
  },
  { id: "export", label: "Exportação", description: "Relatório padronizado" },
];

const statusClass: Record<MatchStatus, string> = {
  Padronizado: "status strong",
  Provável: "status probable",
  Revisar: "status review",
};
const money = (value: number) =>
  value > 0
    ? value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "—";

const containerUnits = new Set([
  "CX",
  "CAIXA",
  "FD",
  "FDO",
  "FARDO",
  "PCT",
  "PCTE",
  "PACOTE",
  "PACK",
]);

function normalizedUnit(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
}

function sogamaxPresentation(description: string) {
  return Math.max(
    1,
    Number((sogamaxPresentations as Record<string, number>)[description]) || 1,
  );
}

function normalizeOffer(offer: MarketOffer): NormalizedOffer {
  const clientPresentation = Math.max(1, Number(offer.packSize) || 1);
  const priceBasis = containerUnits.has(normalizedUnit(offer.unit))
    ? "Embalagem"
    : "Unidade básica";
  const normalizedPrice =
    priceBasis === "Embalagem"
      ? offer.price / clientPresentation
      : offer.price;
  const conversionRule =
    priceBasis === "Embalagem"
      ? `${money(offer.price)} ÷ ${clientPresentation}`
      : "Preço já informado por unidade básica";

  return {
    ...offer,
    price: normalizedPrice,
    originalPrice: offer.price,
    normalizedPrice,
    clientPresentation,
    priceBasis,
    conversionRule,
  };
}

function priceSummary(id: number) {
  const data = productData[id];
  const offers = data.offers.map((offer) => normalizeOffer(offer));
  const ordered = [...offers].sort(
    (a, b) => a.normalizedPrice - b.normalizedPrice,
  );
  return {
    data,
    offers,
    lowest: ordered[0],
    average:
      ordered.reduce((sum, offer) => sum + offer.normalizedPrice, 0) /
      ordered.length,
  };
}

function downloadCsv(approved: number[]) {
  const header = [
    "descricao_recebida",
    "descricao_padronizada_sogamax",
    "repeticoes",
    "confianca_descricao",
    "menor_preco_mercado",
    "concorrente_menor_preco",
    "marca_menor_preco",
    "preco_praticado_sogamax",
    "demanda_padronizada",
    "marcas_encontradas",
    "status_validacao",
  ];
  const body = rows.map((row) => {
    const { data, lowest } = priceSummary(row.id);
    const demand = data.offers.reduce(
      (sum, offer) =>
        sum + (offer.packSize === null ? 0 : offer.quantity * offer.packSize),
      0,
    );
    const brands = [...new Set(data.offers.map((offer) => offer.brand))].join(
      " | ",
    );
    return [
      row.marketDescription,
      row.standardDescription,
      row.repetitions,
      `${row.confidence.toFixed(1).replace(".", ",")}%`,
      lowest.normalizedPrice.toFixed(2).replace(".", ","),
      lowest.competitor,
      lowest.brand,
      data.sogamaxPrice.toFixed(2).replace(".", ","),
      demand,
      brands,
      approved.includes(row.id) ? "APROVADO" : "PENDENTE",
    ];
  });
  const csv = [header, ...body]
    .map((line) =>
      line.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(";"),
    )
    .join("\n");
  const url = URL.createObjectURL(
    new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "descricoes_hospitalares_padronizadas.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function Home() {
  const [view, setView] = useState<View>("dashboard");
  const [selectedId, setSelectedId] = useState(1);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"Todos" | MatchStatus>("Todos");
  const [approved, setApproved] = useState<number[]>([]);
  const [toast, setToast] = useState("");
  const [marketFile, setMarketFile] = useState(summaryData.marketFile);
  const [period, setPeriod] = useState(summaryData.period);
  const [fileState, setFileState] = useState<FileState>("ready");
  const [processing, setProcessing] = useState(false);
  const [activePopup, setActivePopup] = useState<PopupKind | null>(null);
  const [purchaseSuggestions, setPurchaseSuggestions] = useState<
    Record<number, string>
  >({});
  const marketInput = useRef<HTMLInputElement>(null);

  const selected = rows.find((row) => row.id === selectedId) ?? rows[0];
  const summary = priceSummary(selected.id);
  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        const text =
          `${row.marketDescription} ${row.standardDescription}`.toLowerCase();
        return (
          text.includes(search.toLowerCase()) &&
          (filter === "Todos" || row.status === filter)
        );
      }),
    [search, filter],
  );

  useEffect(() => {
    if (!activePopup) return;
    const close = (event: KeyboardEvent) =>
      event.key === "Escape" && setActivePopup(null);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [activePopup]);

  function flash(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 3000);
  }

  function validateFile(name: string, selectedPeriod = period) {
    const duplicate = processedFiles.some(
      (item) => item.name.toLowerCase() === name.toLowerCase(),
    );
    const old = selectedPeriod < "2026-08-20";
    const state: FileState = duplicate ? "duplicate" : old ? "old" : "ready";
    setFileState(state);
    return state;
  }

  function chooseFile(file: File) {
    setMarketFile(file.name);
    const state = validateFile(file.name);
    if (state !== "ready")
      flash(
        state === "duplicate"
          ? "Arquivo bloqueado: ele já foi processado."
          : "Arquivo bloqueado: competência anterior à última análise válida.",
      );
  }

  function changePeriod(value: string) {
    setPeriod(value);
    validateFile(marketFile, value);
  }
  function runAnalysis() {
    if (fileState !== "ready")
      return flash(
        "A análise não pode iniciar enquanto o arquivo estiver bloqueado.",
      );
    setProcessing(true);
    window.setTimeout(() => {
      setProcessing(false);
      flash(
        "Análise concluída: descrições limpas, agrupadas e comparadas com a base Sogamax.",
      );
      setView("validation");
    }, 1500);
  }
  function openProduct(id: number, popup: PopupKind = "prices") {
    setSelectedId(id);
    setActivePopup(popup);
  }
  function approve() {
    setApproved((current) =>
      current.includes(selected.id) ? current : [...current, selected.id],
    );
    flash(`Padronização aprovada para ${selected.repetitions} ocorrência(s).`);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">S</div>
          <div>
            <strong>SOGAMAX</strong>
            <span>Inteligência Hospitalar</span>
          </div>
        </div>
        <nav aria-label="Navegação principal">
          {navItems.map((item, index) => (
            <button
              key={item.id}
              className={view === item.id ? "nav-item active" : "nav-item"}
              onClick={() => setView(item.id)}
            >
              <span className="nav-index">0{index + 1}</span>
              <span>
                <strong>{item.label}</strong>
                <small>{item.description}</small>
              </span>
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="pulse" />
          <div>
            <strong>Base integrada</strong>
            <small>
              {formatCount(summaryData.sogamaxReferences)} descrições Sogamax
            </small>
          </div>
        </div>
        <div className="sidebar-footer">Protótipo conceitual · Central-IC</div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <div className="breadcrumb">
              INTELIGÊNCIA DE MERCADO / HOSPITALAR
            </div>
            <h1>{navItems.find((item) => item.id === view)?.label}</h1>
          </div>
          <div className="top-actions">
            <span className="safe-pill">
              <i /> Base Sogamax conectada
            </span>
            <div className="avatar">IM</div>
          </div>
        </header>

        {view === "dashboard" && (
          <div className="page dashboard-page">
            <section className="hero-row">
              <div>
                <span className="eyebrow">OBJETIVO DA FERRAMENTA</span>
                <h2>
                  Uma descrição única para
                  <br />
                  entender todo o mercado.
                </h2>
                <p>
                  A ferramenta limpa as descrições recebidas, agrupa repetições
                  e encontra a forma equivalente na base hospitalar da Sogamax.
                  O resultado é um padrão confiável para análise.
                </p>
              </div>
              <button className="primary" onClick={() => setView("validation")}>
                Abrir validação <span>→</span>
              </button>
            </section>
            <section className="kpi-grid">
              <article>
                <span>Linhas recebidas</span>
                <strong>{formatCount(summaryData.marketLines)}</strong>
                <small>100% preservadas</small>
              </article>
              <article>
                <span>Descrições limpas</span>
                <strong>{formatCount(summaryData.cleanDescriptions)}</strong>
                <small>repetições agrupadas</small>
              </article>
              <article className="accent">
                <span>Referências Sogamax</span>
                <strong>{formatCount(summaryData.sogamaxReferences)}</strong>
                <small>da planilha hospitalar enviada</small>
              </article>
              <article>
                <span>Validadas nesta sessão</span>
                <strong>{approved.length}</strong>
                <small>decisões reaplicadas às repetições</small>
              </article>
            </section>
            <section className="content-grid">
              <article className="panel status-panel">
                <div className="panel-head">
                  <div>
                    <span className="eyebrow">QUALIDADE DA PADRONIZAÇÃO</span>
                    <h3>Confiança baseada na descrição</h3>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => setView("validation")}
                  >
                    Ver tabela →
                  </button>
                </div>
                <div className="status-bars">
                  {[
                    {
                      label: "Padronizado",
                      value: summaryData.statusCounts.Padronizado,
                      color: "#25a56a",
                    },
                    {
                      label: "Provável",
                      value: summaryData.statusCounts.Provável,
                      color: "#e7b53f",
                    },
                    {
                      label: "Revisão humana",
                      value: summaryData.statusCounts.Revisar,
                      color: "#e8833a",
                    },
                  ].map((item) => (
                    <div className="bar-row" key={item.label}>
                      <div className="bar-label">
                        <span>{item.label}</span>
                        <strong>{formatCount(item.value)}</strong>
                      </div>
                      <div className="bar-track">
                        <div
                          style={{
                            width: `${(item.value / Math.max(...Object.values(summaryData.statusCounts))) * 100}%`,
                            background: item.color,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </article>
              <article className="panel coverage-panel">
                <span className="eyebrow">GANHO OPERACIONAL</span>
                <div className="coverage-number">
                  {formatCount(summaryData.cleanDescriptions)}{" "}
                  <span>decisões</span>
                </div>
                <p>
                  substituem a revisão manual das{" "}
                  {formatCount(summaryData.marketLines)} linhas porque cada
                  descrição limpa é tratada uma única vez.
                </p>
                <div className="coverage-meter">
                  <div
                    style={{
                      width: `${Math.round((1 - summaryData.cleanDescriptions / summaryData.marketLines) * 100)}%`,
                    }}
                  />
                </div>
                <small>
                  Repetições preservadas para preços, marcas e demanda
                </small>
              </article>
              <article className="panel rule-panel">
                <span className="rule-icon">✓</span>
                <div>
                  <span className="eyebrow">REGRA PRINCIPAL</span>
                  <h3>A descrição Sogamax vira a referência.</h3>
                  <p>
                    A confiança considera termos, dosagem, volume, apresentação
                    e quantidade da embalagem.
                  </p>
                </div>
              </article>
            </section>
          </div>
        )}

        {view === "schedule" && (
          <div className="page">
            <section className="section-intro">
              <div>
                <span className="eyebrow">ENTRADA ÚNICA</span>
                <h2>Programar nova análise</h2>
                <p>
                  A pessoa envia apenas a tabela recebida do mercado. A base
                  Sogamax já está integrada e não precisa ser importada
                  novamente.
                </p>
              </div>
              <div className="step-pill">
                Base fixa · {formatCount(summaryData.sogamaxReferences)}{" "}
                descrições
              </div>
            </section>
            <section className="schedule-grid">
              <article className="panel upload-card market-only">
                <div className="upload-icon">↑</div>
                <span className="eyebrow">TABELA RECEBIDA</span>
                <h3>Relatório do mercado hospitalar</h3>
                <p>
                  MedicalVM ou outra plataforma com descrições, preços, marcas e
                  demandas.
                </p>
                <input
                  ref={marketInput}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  hidden
                  onChange={(event) =>
                    event.target.files?.[0] && chooseFile(event.target.files[0])
                  }
                />
                <button
                  className="drop-zone"
                  onClick={() => marketInput.current?.click()}
                >
                  <strong>{marketFile}</strong>
                  <span>Selecionar outra tabela</span>
                </button>
                <label className="period-field">
                  <span>Competência do arquivo</span>
                  <input
                    type="date"
                    value={period}
                    onChange={(event) => changePeriod(event.target.value)}
                  />
                </label>
                <FileValidation state={fileState} />
              </article>
              <aside className="panel integration-card">
                <span className="integration-icon">↻</span>
                <span className="eyebrow">FONTE INTERNA</span>
                <h3>Descrição hospitalar Sogamax</h3>
                <strong className="base-count">
                  {formatCount(summaryData.sogamaxReferences)}
                </strong>
                <p>
                  descrições únicas já gravadas no protótipo a partir da
                  planilha enviada.
                </p>
                <div className="integration-ok">
                  <span>✓</span>
                  <div>
                    <strong>Integração simulada ativa</strong>
                    <small>
                      No sistema definitivo, esses dados chegarão
                      automaticamente pela API.
                    </small>
                  </div>
                </div>
              </aside>
            </section>
            <section className={`panel process-panel file-${fileState}`}>
              <div>
                <span className="eyebrow">VERIFICAÇÃO AUTOMÁTICA</span>
                <h3>
                  {fileState === "ready"
                    ? "Arquivo liberado para análise"
                    : fileState === "duplicate"
                      ? "Arquivo já processado"
                      : "Competência anterior bloqueada"}
                </h3>
                <p>
                  {fileState === "ready"
                    ? "Identidade e período conferidos. Nenhum processamento anterior encontrado."
                    : fileState === "duplicate"
                      ? "A mesma planilha consta no histórico e não pode ser analisada novamente."
                      : "A competência informada é anterior ao último relatório válido de 20/08/2026."}
                </p>
              </div>
              <button
                className="primary"
                onClick={runAnalysis}
                disabled={processing || fileState !== "ready"}
              >
                {processing
                  ? "Padronizando…"
                  : fileState === "ready"
                    ? "Iniciar análise"
                    : "Análise bloqueada"}
              </button>
              {processing && (
                <div className="loading-line">
                  <div />
                </div>
              )}
            </section>
            <section className="panel history-panel">
              <div className="panel-head">
                <div>
                  <span className="eyebrow">HISTÓRICO DE CONTROLE</span>
                  <h3>Arquivos já analisados</h3>
                </div>
                <span className="history-lock">
                  Bloqueio de duplicidade ativo
                </span>
              </div>
              <div className="table-wrap">
                <table className="history-table">
                  <thead>
                    <tr>
                      <th>Arquivo</th>
                      <th>Competência</th>
                      <th>Volume</th>
                      <th>Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {processedFiles.map((file) => (
                      <tr key={file.name}>
                        <td>
                          <strong>{file.name}</strong>
                        </td>
                        <td>{file.period}</td>
                        <td>{file.rows}</td>
                        <td>
                          <span className="status strong">{file.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {view === "validation" && (
          <div className="page mapping-page">
            <section className="section-intro compact">
              <div>
                <span className="eyebrow">PADRONIZAÇÃO ASSISTIDA</span>
                <h2>Descrições prontas para validar</h2>
                <p>
                  A tabela compara o menor preço do mercado com o preço Sogamax
                  e apresenta o CMV correspondente a cada valor. Clique em
                  qualquer produto para abrir todos os detalhes.
                </p>
              </div>
            </section>
            <div className="mapping-layout validation-full">
              <section className="panel table-panel">
                <div className="table-toolbar">
                  <label className="search-box">
                    <span>⌕</span>
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Buscar descrição recebida ou descrição Sogamax…"
                    />
                  </label>
                  <select
                    value={filter}
                    onChange={(event) =>
                      setFilter(event.target.value as "Todos" | MatchStatus)
                    }
                    aria-label="Filtrar por situação"
                  >
                    <option>Todos</option>
                    <option>Padronizado</option>
                    <option>Provável</option>
                    <option>Revisar</option>
                  </select>
                </div>
                <div className="table-wrap">
                  <table className="validation-table commercial-table">
                    <thead>
                      <tr>
                        <th>Descrição recebida → padrão Sogamax</th>
                        <th>Menor preço unitário</th>
                        <th>CMV</th>
                        <th>Concorrente / marca</th>
                        <th>Preço Sogamax</th>
                        <th>Último custo comprado</th>
                        <th>Custo médio</th>
                        <th>CMV</th>
                        <th>Sugestão de compra</th>
                        <th>CMV</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((row) => {
                        const info = priceSummary(row.id);
                        const mapped = row.status !== "Revisar";
                        const marketCmv =
                          mapped && info.data.sogamaxCost > 0
                            ? (info.data.sogamaxCost / info.lowest.price) * 100
                            : null;
                        const sogamaxCmv =
                          mapped && info.data.sogamaxPrice > 0
                            ? (info.data.sogamaxCost / info.data.sogamaxPrice) *
                              100
                            : null;
                        const purchaseSuggestion =
                          purchaseSuggestions[row.id] ?? "";
                        const purchaseSuggestionValue = Number(
                          purchaseSuggestion.replace(",", "."),
                        );
                        const suggestionCmv =
                          mapped &&
                          purchaseSuggestion.trim() !== "" &&
                          purchaseSuggestionValue > 0 &&
                          Number.isFinite(purchaseSuggestionValue)
                            ? (info.data.sogamaxCost /
                                purchaseSuggestionValue) *
                              100
                            : null;
                        return (
                          <tr
                            key={row.id}
                            className={selected.id === row.id ? "selected" : ""}
                            onClick={() => openProduct(row.id)}
                          >
                            <td>
                              <strong>{row.marketDescription}</strong>
                              <small>{row.standardDescription}</small>
                            </td>
                            <td>
                              <strong>{money(info.lowest.price)}</strong>
                              <small>unidade básica comparável</small>
                            </td>
                            <td>
                              <strong className="table-cmv">
                                {marketCmv === null
                                  ? "—"
                                  : `${marketCmv.toFixed(2).replace(".", ",")}%`}
                              </strong>
                            </td>
                            <td>
                              <strong>{info.lowest.competitor}</strong>
                              <small>{info.lowest.brand}</small>
                            </td>
                            <td>
                              <strong>
                                {mapped ? money(info.data.sogamaxPrice) : "—"}
                              </strong>
                              <small>
                                {mapped
                                  ? `apresentação C/${sogamaxPresentation(row.standardDescription)}`
                                  : "aguardando validação"}
                              </small>
                            </td>
                            <td>
                              <strong>
                                {mapped
                                  ? money(info.data.lastPurchaseCost)
                                  : "—"}
                              </strong>
                            </td>
                            <td>
                              <strong>
                                {mapped ? money(info.data.sogamaxCost) : "—"}
                              </strong>
                            </td>
                            <td>
                              <strong className="table-cmv">
                                {sogamaxCmv === null
                                  ? "—"
                                  : `${sogamaxCmv.toFixed(2).replace(".", ",")}%`}
                              </strong>
                            </td>
                            <td>
                              <label
                                className="purchase-input"
                                onClick={(event) => event.stopPropagation()}
                              >
                                <span>R$</span>
                                <input
                                  value={purchaseSuggestion}
                                  inputMode="decimal"
                                  aria-label={`Sugestão de compra para ${row.standardDescription}`}
                                  onChange={(event) =>
                                    setPurchaseSuggestions((current) => ({
                                      ...current,
                                      [row.id]: event.target.value,
                                    }))
                                  }
                                  onKeyDown={(event) => event.stopPropagation()}
                                />
                              </label>
                            </td>
                            <td>
                              <strong className="table-cmv">
                                {suggestionCmv === null
                                  ? "—"
                                  : `${suggestionCmv.toFixed(2).replace(".", ",")}%`}
                              </strong>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </div>
        )}

        {view === "export" && (
          <div className="page">
            <section className="section-intro">
              <div>
                <span className="eyebrow">SAÍDA DA ANÁLISE</span>
                <h2>Relatório com descrições padronizadas</h2>
                <p>
                  As {formatCount(summaryData.marketLines)} linhas permanecem no
                  relatório. Cada repetição recebe a mesma descrição Sogamax
                  aprovada, preservando preços, demandas, marcas e concorrentes.
                </p>
              </div>
            </section>
            <section className="export-grid">
              <article className="panel export-card">
                <div className="file-badge">CSV</div>
                <div>
                  <span className="eyebrow">ARQUIVO FINAL</span>
                  <h3>Mercado hospitalar padronizado</h3>
                  <p>
                    Inclui descrição original, descrição padrão Sogamax,
                    repetições, confiança, menor preço, concorrente, marca,
                    preço Sogamax, demanda padronizada e situação da validação.
                  </p>
                </div>
                <div className="export-stats">
                  <div>
                    <strong>{formatCount(summaryData.marketLines)}</strong>
                    <span>linhas preservadas</span>
                  </div>
                  <div>
                    <strong>
                      {formatCount(summaryData.cleanDescriptions)}
                    </strong>
                    <span>descrições limpas</span>
                  </div>
                  <div>
                    <strong>{approved.length}</strong>
                    <span>padrões aprovados</span>
                  </div>
                </div>
                <button
                  className="primary wide"
                  onClick={() => downloadCsv(approved)}
                >
                  Baixar demonstração em CSV <span>↓</span>
                </button>
              </article>
              <aside className="panel release-card">
                <span className="eyebrow">CONTEÚDO DO ARQUIVO</span>
                <h3>Pronto para análise comercial</h3>
                {[
                  "Descrição única da Sogamax",
                  "Menor preço e responsável",
                  "Preço praticado pela Sogamax",
                  "Demanda em unidade-base",
                  "Marcas e concorrentes",
                ].map((item) => (
                  <div className="check-item ok" key={item}>
                    <span>✓</span>
                    <div>
                      <strong>{item}</strong>
                    </div>
                  </div>
                ))}
              </aside>
            </section>
          </div>
        )}
      </section>

      {toast && (
        <div className="toast" role="status">
          <span>✓</span>
          {toast}
        </div>
      )}
      {activePopup && (
        <ProductPopup
          kind={activePopup}
          row={selected}
          data={summary.data}
          onChange={setActivePopup}
          onClose={() => setActivePopup(null)}
        />
      )}
    </main>
  );
}

function FileValidation({ state }: { state: FileState }) {
  if (state === "ready")
    return (
      <div className="file-validation ok">
        <span>✓</span>
        <div>
          <strong>Arquivo novo e válido</strong>
          <small>Liberado para programação</small>
        </div>
      </div>
    );
  return (
    <div className="file-validation blocked">
      <span>!</span>
      <div>
        <strong>
          {state === "duplicate" ? "Arquivo já analisado" : "Arquivo antigo"}
        </strong>
        <small>
          {state === "duplicate"
            ? "Duplicidade encontrada no histórico"
            : "Competência anterior ao limite permitido"}
        </small>
      </div>
    </div>
  );
}

function ProductPopup({
  kind,
  row,
  data,
  onChange,
  onClose,
}: {
  kind: PopupKind;
  row: DescriptionRow;
  data: ProductData;
  onChange: (kind: PopupKind) => void;
  onClose: () => void;
}) {
  const offers = data.offers
    .map((offer) => normalizeOffer(offer))
    .sort((a, b) => a.price - b.price);
  const converted = offers.filter((offer) => offer.quantity > 0);
  const pending = offers.filter((offer) => offer.quantity <= 0);
  // QUANTIDADE já vem na unidade básica do mercado. QTDE_EMBALAGEM descreve a
  // apresentação comercial e não deve multiplicar a demanda novamente.
  const totalDemand = converted.reduce((sum, offer) => sum + offer.quantity, 0);
  const brands = [...new Set(offers.map((offer) => offer.brand))]
    .map((brand) => {
      const group = offers.filter((offer) => offer.brand === brand);
      return {
        brand,
        competitor: group.map((offer) => offer.competitor).join(" · "),
        demand: group.reduce((sum, offer) => sum + offer.quantity, 0),
      };
    })
    .sort((a, b) => b.demand - a.demand);
  const allPrices = [
    {
      competitor: "SOGAMAX",
      brand: "Preço praticado",
      price: data.sogamaxPrice,
      originalPrice: data.sogamaxPrice,
      normalizedPrice: data.sogamaxPrice,
      unit: "Referência interna",
      packSize: 1,
      clientPresentation: sogamaxPresentation(row.standardDescription),
      priceBasis: "Unidade básica" as const,
      conversionRule: "Preço unitário Sogamax",
    },
    ...offers,
  ];
  const rankedPrices = [...allPrices].sort((a, b) => a.price - b.price);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section className="market-modal" role="dialog" aria-modal="true">
        <header className="modal-header">
          <div>
            <span className="eyebrow">DETALHES DO PRODUTO</span>
            <h2>{row.standardDescription}</h2>
            <p>
              Recebido como: {row.marketDescription} · aparece {row.repetitions}{" "}
              vezes
            </p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </header>
        <div className="modal-tabs">
          <button
            className={kind === "prices" ? "active" : ""}
            onClick={() => onChange("prices")}
          >
            Preços
          </button>
          <button
            className={kind === "demands" ? "active" : ""}
            onClick={() => onChange("demands")}
          >
            Demanda padronizada
          </button>
          <button
            className={kind === "brands" ? "active" : ""}
            onClick={() => onChange("brands")}
          >
            Marcas
          </button>
        </div>
        {kind === "prices" && (
          <div className="modal-content">
            <div className="popup-table-wrap">
              <table className="popup-table">
                <thead>
                  <tr>
                    <th>Posição</th>
                    <th>Empresa</th>
                    <th>Marca</th>
                    <th>Apresentação do cliente</th>
                    <th>Preço original</th>
                    <th>Regra aplicada</th>
                    <th>Preço unitário</th>
                    <th>CMV Sogamax</th>
                  </tr>
                </thead>
                <tbody>
                  {rankedPrices.map((offer, index) => {
                    const cmv =
                      offer.price > 0
                        ? (data.sogamaxCost / offer.price) * 100
                        : null;
                    return (
                      <tr
                        key={`${offer.competitor}-${offer.price}`}
                        className={
                          offer.competitor === "SOGAMAX" ? "sogamax-row" : ""
                        }
                      >
                        <td>
                          <span className="price-rank">{index + 1}º</span>
                        </td>
                        <td>
                          <strong>{offer.competitor}</strong>
                        </td>
                        <td>{offer.brand}</td>
                        <td>
                          {offer.unit}
                          {offer.clientPresentation > 1
                            ? ` C/${offer.clientPresentation}`
                            : ""}
                          <small>{offer.priceBasis}</small>
                        </td>
                        <td>
                          <strong>{money(offer.originalPrice)}</strong>
                        </td>
                        <td>
                          <small>{offer.conversionRule}</small>
                        </td>
                        <td>
                          <strong>{money(offer.normalizedPrice)}</strong>
                        </td>
                        <td>
                          <strong className="cmv-value">
                            {cmv === null
                              ? "—"
                              : `${cmv.toFixed(2).replace(".", ",")}%`}
                          </strong>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="modal-note">
              Ranking calculado pela unidade básica. Quando o cliente informa o
              preço de uma caixa, pacote ou fardo, o valor é dividido pela
              quantidade contida. Ampola, frasco, comprimido e unidade mantêm o
              preço informado.
            </div>
          </div>
        )}
        {kind === "demands" && (
          <div className="modal-content">
            <div className="modal-kpis">
              <div>
                <span>Demanda convertida</span>
                <strong>
                  {totalDemand.toLocaleString("pt-BR")} {offers[0]?.baseUnit}
                </strong>
              </div>
              <div>
                <span>Registros convertidos</span>
                <strong>{converted.length}</strong>
              </div>
              <div>
                <span>Aguardando regra</span>
                <strong>{pending.length}</strong>
              </div>
              <div>
                <span>Unidade-base</span>
                <strong>{offers[0]?.baseUnit}</strong>
              </div>
            </div>
            <div className="popup-table-wrap">
              <table className="popup-table">
                <thead>
                  <tr>
                    <th>Concorrente</th>
                    <th>Demanda original</th>
                    <th>Regra aplicada</th>
                    <th>Demanda padronizada</th>
                    <th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {offers.map((offer) => (
                    <tr key={`${offer.competitor}-${offer.quantity}`}>
                      <td>
                        <strong>{offer.competitor}</strong>
                      </td>
                      <td>
                        {offer.quantity.toLocaleString("pt-BR")} {offer.unit}
                      </td>
                      <td>Quantidade já informada em {offer.baseUnit}</td>
                      <td>
                        <strong>
                          {offer.quantity > 0
                            ? `${offer.quantity.toLocaleString("pt-BR")} ${offer.baseUnit}`
                            : "—"}
                        </strong>
                      </td>
                      <td>
                        {offer.quantity > 0 ? (
                          <span className="conversion ok">Convertido</span>
                        ) : (
                          <span className="conversion pending">
                            Validar conversão
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pending.length > 0 && (
              <div className="conversion-alert">
                <strong>{pending.length} registro fora do total.</strong>
                <span>Registros sem quantidade não são somados.</span>
              </div>
            )}
          </div>
        )}
        {kind === "brands" && (
          <div className="modal-content">
            <div className="brand-summary">
              <div>
                <span className="eyebrow">MARCAS ENCONTRADAS</span>
                <strong>{brands.length}</strong>
                <p>
                  Visão consolidada das marcas oferecidas para esta descrição
                  padronizada.
                </p>
              </div>
              <div
                className="brand-ring"
                style={
                  { "--brand-count": brands.length } as React.CSSProperties
                }
              >
                <span>{brands.length}</span>
                <small>marcas</small>
              </div>
            </div>
            <div className="brand-grid">
              {brands.map((brand, index) => (
                <article key={brand.brand}>
                  <div className="brand-rank">0{index + 1}</div>
                  <div>
                    <h3>{brand.brand}</h3>
                    <p>{brand.competitor}</p>
                  </div>
                  <dl className="brand-demand-only">
                    <div>
                      <dt>Demanda convertida</dt>
                      <dd>
                        {brand.demand.toLocaleString("pt-BR")}{" "}
                        {offers[0]?.baseUnit}
                      </dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
