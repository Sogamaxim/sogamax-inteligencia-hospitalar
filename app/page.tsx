"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import sogamaxDescriptions from "./sogamax-base.json";

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

type ProductData = { sogamaxPrice: number; sogamaxCost: number; offers: MarketOffer[] };

const rows: DescriptionRow[] = [
  { id: 1, marketDescription: "ABAIXADOR LINGUA MADEIRA PCT 100 UND", standardDescription: "ABAIXADOR DE LINGUA EM MADEIRA C/100", repetitions: 14, confidence: 96.8, status: "Padronizado", evidence: ["Termos principais equivalentes", "Apresentação C/100 preservada", "Descrição localizada na base Sogamax"] },
  { id: 2, marketDescription: "ABSORVENTE GERIATRICO UNISSEX TAM UNICO 20UN", standardDescription: "ABSORVENTE GERIATRICO TAMANHO ÚNICO UNISSEX C/20", repetitions: 9, confidence: 94.1, status: "Padronizado", evidence: ["Uso geriátrico e unissex", "Tamanho único compatível", "Quantidade C/20 confirmada"] },
  { id: 3, marketDescription: "ACEBROFILINA 25 MG 5 ML XAROPE FR 120 ML", standardDescription: "ACEBROFILINA 25MG/5ML XPE 120ML", repetitions: 11, confidence: 98.2, status: "Padronizado", evidence: ["Concentração 25MG/5ML", "Forma xarope", "Volume 120ML"] },
  { id: 4, marketDescription: "ACEBROFILINA INFANTIL XAROPE 120ML", standardDescription: "ACEBROFILINA XPE INF 120ML", repetitions: 7, confidence: 89.4, status: "Provável", evidence: ["Medicamento e volume compatíveis", "INF interpretado como infantil", "Concentração não informada no mercado"] },
  { id: 5, marketDescription: "AAS 100MG COMPRIMIDO", standardDescription: "ACIDO ACETILSALICILICO 100MG COMP", repetitions: 18, confidence: 86.7, status: "Provável", evidence: ["AAS reconhecido como abreviação", "Dosagem 100MG compatível", "Forma comprimido compatível"] },
  { id: 6, marketDescription: "AGUA DESTILADA P/ INJECAO 10 ML AMP", standardDescription: "AGUA PARA INJECAO AMP 10ML", repetitions: 22, confidence: 92.5, status: "Padronizado", evidence: ["Finalidade injetável", "Ampola de 10ML", "Variação textual removida"] },
  { id: 7, marketDescription: "AGULHA DESC 25X0,70", standardDescription: "AGULHA 25 X 0,70 UN", repetitions: 31, confidence: 83.6, status: "Provável", evidence: ["Medida 25 × 0,70 preservada", "DESC interpretado como descartável", "Unidade compatível"] },
  { id: 8, marketDescription: "ACETILCISTEINA SACHE 600 MG 5G", standardDescription: "ACETILCISTEINA 600MG ENV 5G", repetitions: 12, confidence: 91.9, status: "Padronizado", evidence: ["Dosagem 600MG", "Peso 5G", "Sachê normalizado como envelope"] },
];

const productData: Record<number, ProductData> = {
  1: { sogamaxPrice: 8.90, sogamaxCost: 6.34, offers: [
    { competitor: "Fornecedor Alfa", brand: "THEOTO", price: 8.42, quantity: 60, unit: "PACOTE", packSize: 100, baseUnit: "UN" },
    { competitor: "Fornecedor Beta", brand: "ESTILO", price: 9.18, quantity: 4200, unit: "UN", packSize: 1, baseUnit: "UN" },
    { competitor: "Fornecedor Delta", brand: "TALGE", price: 8.76, quantity: 35, unit: "PACOTE", packSize: 100, baseUnit: "UN" },
  ]},
  2: { sogamaxPrice: 18.70, sogamaxCost: 13.82, offers: [
    { competitor: "Fornecedor Alfa", brand: "MAXI CONFORT", price: 19.10, quantity: 28, unit: "PACOTE", packSize: 20, baseUnit: "UN" },
    { competitor: "Fornecedor Gama", brand: "BIGFRAL", price: 17.95, quantity: 600, unit: "UN", packSize: 1, baseUnit: "UN" },
    { competitor: "Fornecedor Ômega", brand: "PLENITUD", price: 20.30, quantity: 12, unit: "FARDO", packSize: null, baseUnit: "UN" },
  ]},
  3: { sogamaxPrice: 14.55, sogamaxCost: 10.41, offers: [
    { competitor: "Fornecedor Beta", brand: "ACHE", price: 15.20, quantity: 45, unit: "FRASCO", packSize: 1, baseUnit: "FR" },
    { competitor: "Fornecedor Delta", brand: "CIMED", price: 13.88, quantity: 80, unit: "FRASCO", packSize: 1, baseUnit: "FR" },
    { competitor: "Fornecedor Gama", brand: "GEOLAB", price: 14.76, quantity: 9, unit: "CAIXA", packSize: 1, baseUnit: "FR" },
  ]},
  4: { sogamaxPrice: 16.20, sogamaxCost: 11.76, offers: [
    { competitor: "Fornecedor Alfa", brand: "EMS", price: 15.65, quantity: 32, unit: "FRASCO", packSize: 1, baseUnit: "FR" },
    { competitor: "Fornecedor Beta", brand: "ACHE", price: 17.40, quantity: 20, unit: "FRASCO", packSize: 1, baseUnit: "FR" },
  ]},
  5: { sogamaxPrice: 0.18, sogamaxCost: 0.11, offers: [
    { competitor: "Fornecedor Delta", brand: "BRASTERAPICA", price: 0.16, quantity: 2500, unit: "COMP", packSize: 1, baseUnit: "COMP" },
    { competitor: "Fornecedor Gama", brand: "EMS", price: 0.19, quantity: 40, unit: "CAIXA", packSize: 30, baseUnit: "COMP" },
  ]},
  6: { sogamaxPrice: 0.74, sogamaxCost: 0.48, offers: [
    { competitor: "Fornecedor Alfa", brand: "SAMTEC", price: 0.69, quantity: 1200, unit: "AMPOLA", packSize: 1, baseUnit: "AMP" },
    { competitor: "Fornecedor Ômega", brand: "EQUIPLEX", price: 0.78, quantity: 30, unit: "CAIXA", packSize: 200, baseUnit: "AMP" },
  ]},
  7: { sogamaxPrice: 0.12, sogamaxCost: 0.08, offers: [
    { competitor: "Fornecedor Beta", brand: "DESCARPACK", price: 0.11, quantity: 6000, unit: "UN", packSize: 1, baseUnit: "UN" },
    { competitor: "Fornecedor Delta", brand: "SR", price: 0.13, quantity: 50, unit: "CAIXA", packSize: 100, baseUnit: "UN" },
    { competitor: "Fornecedor Gama", brand: "INJEX", price: 0.12, quantity: 40, unit: "CAIXA", packSize: 100, baseUnit: "UN" },
  ]},
  8: { sogamaxPrice: 3.36, sogamaxCost: 2.29, offers: [
    { competitor: "Fornecedor Alfa", brand: "EUROFARMA", price: 3.25, quantity: 240, unit: "ENVELOPE", packSize: 1, baseUnit: "ENV" },
    { competitor: "Fornecedor Ômega", brand: "EMS", price: 3.58, quantity: 20, unit: "CAIXA", packSize: 16, baseUnit: "ENV" },
  ]},
};

const processedFiles = [
  { name: "MedicalVM_2026-08-20.xlsx", period: "20/08/2026", rows: "2.597 linhas", status: "Concluído" },
  { name: "MedicalVM_2026-08-13.xlsx", period: "13/08/2026", rows: "2.418 linhas", status: "Concluído" },
  { name: "MedicalVM_2026-08-06.xlsx", period: "06/08/2026", rows: "2.206 linhas", status: "Concluído" },
];

const navItems: { id: View; label: string; description: string }[] = [
  { id: "dashboard", label: "Visão geral", description: "Indicadores da padronização" },
  { id: "schedule", label: "Programar análise", description: "Enviar tabela do mercado" },
  { id: "validation", label: "Validação assistida", description: "Revisar descrições" },
  { id: "export", label: "Exportação", description: "Relatório padronizado" },
];

const statusClass: Record<MatchStatus, string> = { Padronizado: "status strong", Provável: "status probable", Revisar: "status review" };
const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function priceSummary(id: number) {
  const data = productData[id];
  const ordered = [...data.offers].sort((a, b) => a.price - b.price);
  return { data, lowest: ordered[0], average: ordered.reduce((sum, offer) => sum + offer.price, 0) / ordered.length };
}

function downloadCsv(approved: number[]) {
  const header = ["descricao_recebida", "descricao_padronizada_sogamax", "repeticoes", "confianca_descricao", "menor_preco_mercado", "concorrente_menor_preco", "marca_menor_preco", "preco_praticado_sogamax", "demanda_padronizada", "marcas_encontradas", "status_validacao"];
  const body = rows.map((row) => {
    const { data, lowest } = priceSummary(row.id);
    const demand = data.offers.reduce((sum, offer) => sum + (offer.packSize === null ? 0 : offer.quantity * offer.packSize), 0);
    const brands = [...new Set(data.offers.map((offer) => offer.brand))].join(" | ");
    return [row.marketDescription, row.standardDescription, row.repetitions, `${row.confidence.toFixed(1).replace(".", ",")}%`, lowest.price.toFixed(2).replace(".", ","), lowest.competitor, lowest.brand, data.sogamaxPrice.toFixed(2).replace(".", ","), demand, brands, approved.includes(row.id) ? "APROVADO" : "PENDENTE"];
  });
  const csv = [header, ...body].map((line) => line.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(";")).join("\n");
  const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = "descricoes_hospitalares_padronizadas.csv"; anchor.click(); URL.revokeObjectURL(url);
}

export default function Home() {
  const [view, setView] = useState<View>("dashboard");
  const [selectedId, setSelectedId] = useState(1);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"Todos" | MatchStatus>("Todos");
  const [approved, setApproved] = useState<number[]>([]);
  const [toast, setToast] = useState("");
  const [marketFile, setMarketFile] = useState("MedicalVM_2026-08-27.xlsx");
  const [period, setPeriod] = useState("2026-08-27");
  const [fileState, setFileState] = useState<FileState>("ready");
  const [processing, setProcessing] = useState(false);
  const [activePopup, setActivePopup] = useState<PopupKind | null>(null);
  const marketInput = useRef<HTMLInputElement>(null);

  const selected = rows.find((row) => row.id === selectedId) ?? rows[0];
  const summary = priceSummary(selected.id);
  const filteredRows = useMemo(() => rows.filter((row) => {
    const text = `${row.marketDescription} ${row.standardDescription}`.toLowerCase();
    return text.includes(search.toLowerCase()) && (filter === "Todos" || row.status === filter);
  }), [search, filter]);

  useEffect(() => {
    if (!activePopup) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && setActivePopup(null);
    window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close);
  }, [activePopup]);

  function flash(message: string) { setToast(message); window.setTimeout(() => setToast(""), 3000); }

  function validateFile(name: string, selectedPeriod = period) {
    const duplicate = processedFiles.some((item) => item.name.toLowerCase() === name.toLowerCase());
    const old = selectedPeriod < "2026-08-20";
    const state: FileState = duplicate ? "duplicate" : old ? "old" : "ready";
    setFileState(state); return state;
  }

  function chooseFile(file: File) {
    setMarketFile(file.name); const state = validateFile(file.name);
    if (state !== "ready") flash(state === "duplicate" ? "Arquivo bloqueado: ele já foi processado." : "Arquivo bloqueado: competência anterior à última análise válida.");
  }

  function changePeriod(value: string) { setPeriod(value); validateFile(marketFile, value); }
  function runAnalysis() {
    if (fileState !== "ready") return flash("A análise não pode iniciar enquanto o arquivo estiver bloqueado.");
    setProcessing(true);
    window.setTimeout(() => { setProcessing(false); flash("Análise concluída: descrições limpas, agrupadas e comparadas com a base Sogamax."); setView("validation"); }, 1500);
  }
  function openProduct(id: number, popup: PopupKind = "prices") { setSelectedId(id); setActivePopup(popup); }
  function approve() { setApproved((current) => current.includes(selected.id) ? current : [...current, selected.id]); flash(`Padronização aprovada para ${selected.repetitions} ocorrência(s).`); }

  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">S</div><div><strong>SOGAMAX</strong><span>Inteligência Hospitalar</span></div></div>
      <nav aria-label="Navegação principal">{navItems.map((item, index) => <button key={item.id} className={view === item.id ? "nav-item active" : "nav-item"} onClick={() => setView(item.id)}><span className="nav-index">0{index + 1}</span><span><strong>{item.label}</strong><small>{item.description}</small></span></button>)}</nav>
      <div className="sidebar-note"><span className="pulse" /><div><strong>Base integrada</strong><small>{sogamaxDescriptions.length} descrições Sogamax</small></div></div>
      <div className="sidebar-footer">Protótipo conceitual · Central-IC</div>
    </aside>

    <section className="workspace">
      <header className="topbar"><div><div className="breadcrumb">INTELIGÊNCIA DE MERCADO / HOSPITALAR</div><h1>{navItems.find((item) => item.id === view)?.label}</h1></div><div className="top-actions"><span className="safe-pill"><i /> Base Sogamax conectada</span><div className="avatar">IM</div></div></header>

      {view === "dashboard" && <div className="page dashboard-page">
        <section className="hero-row"><div><span className="eyebrow">OBJETIVO DA FERRAMENTA</span><h2>Uma descrição única para<br />entender todo o mercado.</h2><p>A ferramenta limpa as descrições recebidas, agrupa repetições e encontra a forma equivalente na base hospitalar da Sogamax. O resultado é um padrão confiável para análise.</p></div><button className="primary" onClick={() => setView("validation")}>Abrir validação <span>→</span></button></section>
        <section className="kpi-grid"><article><span>Linhas recebidas</span><strong>2.597</strong><small>100% preservadas</small></article><article><span>Descrições limpas</span><strong>232</strong><small>repetições agrupadas</small></article><article className="accent"><span>Referências Sogamax</span><strong>{sogamaxDescriptions.length}</strong><small>da planilha hospitalar enviada</small></article><article><span>Validadas nesta sessão</span><strong>{approved.length}</strong><small>decisões reaplicadas às repetições</small></article></section>
        <section className="content-grid">
          <article className="panel status-panel"><div className="panel-head"><div><span className="eyebrow">QUALIDADE DA PADRONIZAÇÃO</span><h3>Confiança baseada na descrição</h3></div><button className="text-button" onClick={() => setView("validation")}>Ver tabela →</button></div><div className="status-bars">{[{ label: "Padronizado", value: 112, color: "#25a56a" }, { label: "Provável", value: 64, color: "#e7b53f" }, { label: "Revisão humana", value: 56, color: "#e8833a" }].map((item) => <div className="bar-row" key={item.label}><div className="bar-label"><span>{item.label}</span><strong>{item.value}</strong></div><div className="bar-track"><div style={{ width: `${item.value / 112 * 100}%`, background: item.color }} /></div></div>)}</div></article>
          <article className="panel coverage-panel"><span className="eyebrow">GANHO OPERACIONAL</span><div className="coverage-number">232 <span>decisões</span></div><p>substituem a revisão manual das 2.597 linhas porque cada descrição limpa é tratada uma única vez.</p><div className="coverage-meter"><div style={{ width: "91%" }} /></div><small>Repetições preservadas para preços, marcas e demanda</small></article>
          <article className="panel rule-panel"><span className="rule-icon">✓</span><div><span className="eyebrow">REGRA PRINCIPAL</span><h3>A descrição Sogamax vira a referência.</h3><p>A confiança considera termos, dosagem, volume, apresentação e quantidade da embalagem.</p></div></article>
        </section>
      </div>}

      {view === "schedule" && <div className="page">
        <section className="section-intro"><div><span className="eyebrow">ENTRADA ÚNICA</span><h2>Programar nova análise</h2><p>A pessoa envia apenas a tabela recebida do mercado. A base Sogamax já está integrada e não precisa ser importada novamente.</p></div><div className="step-pill">Base fixa · {sogamaxDescriptions.length} descrições</div></section>
        <section className="schedule-grid">
          <article className="panel upload-card market-only"><div className="upload-icon">↑</div><span className="eyebrow">TABELA RECEBIDA</span><h3>Relatório do mercado hospitalar</h3><p>MedicalVM ou outra plataforma com descrições, preços, marcas e demandas.</p><input ref={marketInput} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(event) => event.target.files?.[0] && chooseFile(event.target.files[0])} /><button className="drop-zone" onClick={() => marketInput.current?.click()}><strong>{marketFile}</strong><span>Selecionar outra tabela</span></button><label className="period-field"><span>Competência do arquivo</span><input type="date" value={period} onChange={(event) => changePeriod(event.target.value)} /></label><FileValidation state={fileState} /></article>
          <aside className="panel integration-card"><span className="integration-icon">↻</span><span className="eyebrow">FONTE INTERNA</span><h3>Descrição hospitalar Sogamax</h3><strong className="base-count">{sogamaxDescriptions.length}</strong><p>descrições únicas já gravadas no protótipo a partir da planilha enviada.</p><div className="integration-ok"><span>✓</span><div><strong>Integração simulada ativa</strong><small>No sistema definitivo, esses dados chegarão automaticamente pela API.</small></div></div></aside>
        </section>
        <section className={`panel process-panel file-${fileState}`}><div><span className="eyebrow">VERIFICAÇÃO AUTOMÁTICA</span><h3>{fileState === "ready" ? "Arquivo liberado para análise" : fileState === "duplicate" ? "Arquivo já processado" : "Competência anterior bloqueada"}</h3><p>{fileState === "ready" ? "Identidade e período conferidos. Nenhum processamento anterior encontrado." : fileState === "duplicate" ? "A mesma planilha consta no histórico e não pode ser analisada novamente." : "A competência informada é anterior ao último relatório válido de 20/08/2026."}</p></div><button className="primary" onClick={runAnalysis} disabled={processing || fileState !== "ready"}>{processing ? "Padronizando…" : fileState === "ready" ? "Iniciar análise" : "Análise bloqueada"}</button>{processing && <div className="loading-line"><div /></div>}</section>
        <section className="panel history-panel"><div className="panel-head"><div><span className="eyebrow">HISTÓRICO DE CONTROLE</span><h3>Arquivos já analisados</h3></div><span className="history-lock">Bloqueio de duplicidade ativo</span></div><div className="table-wrap"><table className="history-table"><thead><tr><th>Arquivo</th><th>Competência</th><th>Volume</th><th>Situação</th></tr></thead><tbody>{processedFiles.map((file) => <tr key={file.name}><td><strong>{file.name}</strong></td><td>{file.period}</td><td>{file.rows}</td><td><span className="status strong">{file.status}</span></td></tr>)}</tbody></table></div></section>
      </div>}

      {view === "validation" && <div className="page mapping-page">
        <section className="section-intro compact"><div><span className="eyebrow">PADRONIZAÇÃO ASSISTIDA</span><h2>Descrições prontas para validar</h2><p>A tabela já mostra preço Sogamax, menor preço do mercado, concorrente e marca. Clique em qualquer produto para abrir todos os detalhes.</p></div><div className="approval-count"><strong>{approved.length}</strong><span>aprovadas nesta sessão</span></div></section>
        <div className="mapping-layout validation-wide">
          <section className="panel table-panel"><div className="table-toolbar"><label className="search-box"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar descrição recebida ou descrição Sogamax…" /></label><select value={filter} onChange={(event) => setFilter(event.target.value as "Todos" | MatchStatus)} aria-label="Filtrar por situação"><option>Todos</option><option>Padronizado</option><option>Provável</option><option>Revisar</option></select></div><div className="table-wrap"><table className="validation-table"><thead><tr><th>Descrição recebida → padrão Sogamax</th><th>Rep.</th><th>Confiança</th><th>Menor preço</th><th>Concorrente / marca</th><th>Preço Sogamax</th><th>Status</th></tr></thead><tbody>{filteredRows.map((row) => { const info = priceSummary(row.id); return <tr key={row.id} className={selected.id === row.id ? "selected" : ""} onClick={() => openProduct(row.id)}><td><strong>{row.marketDescription}</strong><small>{row.standardDescription}</small></td><td><strong>{row.repetitions}</strong></td><td><strong>{row.confidence.toFixed(1).replace(".", ",")}%</strong></td><td><strong>{money(info.lowest.price)}</strong></td><td><strong>{info.lowest.competitor}</strong><small>{info.lowest.brand}</small></td><td><strong>{money(info.data.sogamaxPrice)}</strong><small>demonstrativo</small></td><td><span className={statusClass[row.status]}>{approved.includes(row.id) ? "Aprovado" : row.status}</span></td></tr>})}</tbody></table></div></section>
          <aside className="panel detail-panel compact-detail"><div className="detail-top"><span className={statusClass[selected.status]}>{approved.includes(selected.id) ? "Aprovado" : selected.status}</span><span>{selected.confidence.toFixed(1).replace(".", ",")}%</span></div><span className="eyebrow">PADRÃO SOGAMAX</span><h3>{selected.standardDescription}</h3><div className="quick-price"><span>Preço Sogamax</span><strong>{money(summary.data.sogamaxPrice)}</strong><small>valor demonstrativo</small></div><div className="winner-card"><span>MENOR PREÇO DO MERCADO</span><strong>{money(summary.lowest.price)}</strong><p>{summary.lowest.competitor} · {summary.lowest.brand}</p></div><button className="primary wide" onClick={() => setActivePopup("prices")}>Ver todos os detalhes</button><button className="secondary wide" onClick={approve} disabled={approved.includes(selected.id)}>{approved.includes(selected.id) ? "Padronização aprovada ✓" : "Aprovar descrição"}</button></aside>
        </div>
      </div>}

      {view === "export" && <div className="page"><section className="section-intro"><div><span className="eyebrow">SAÍDA DA ANÁLISE</span><h2>Relatório com descrições padronizadas</h2><p>As 2.597 linhas permanecem no relatório. Cada repetição recebe a mesma descrição Sogamax aprovada, preservando preços, demandas, marcas e concorrentes.</p></div></section><section className="export-grid"><article className="panel export-card"><div className="file-badge">CSV</div><div><span className="eyebrow">ARQUIVO FINAL</span><h3>Mercado hospitalar padronizado</h3><p>Inclui descrição original, descrição padrão Sogamax, repetições, confiança, menor preço, concorrente, marca, preço Sogamax, demanda padronizada e situação da validação.</p></div><div className="export-stats"><div><strong>2.597</strong><span>linhas preservadas</span></div><div><strong>232</strong><span>descrições limpas</span></div><div><strong>{approved.length}</strong><span>padrões aprovados</span></div></div><button className="primary wide" onClick={() => downloadCsv(approved)}>Baixar demonstração em CSV <span>↓</span></button></article><aside className="panel release-card"><span className="eyebrow">CONTEÚDO DO ARQUIVO</span><h3>Pronto para análise comercial</h3>{["Descrição única da Sogamax", "Menor preço e responsável", "Preço praticado pela Sogamax", "Demanda em unidade-base", "Marcas e concorrentes"].map((item) => <div className="check-item ok" key={item}><span>✓</span><div><strong>{item}</strong></div></div>)}</aside></section></div>}
    </section>

    {toast && <div className="toast" role="status"><span>✓</span>{toast}</div>}
    {activePopup && <ProductPopup kind={activePopup} row={selected} data={summary.data} onChange={setActivePopup} onClose={() => setActivePopup(null)} />}
  </main>;
}

function FileValidation({ state }: { state: FileState }) {
  if (state === "ready") return <div className="file-validation ok"><span>✓</span><div><strong>Arquivo novo e válido</strong><small>Liberado para programação</small></div></div>;
  return <div className="file-validation blocked"><span>!</span><div><strong>{state === "duplicate" ? "Arquivo já analisado" : "Arquivo antigo"}</strong><small>{state === "duplicate" ? "Duplicidade encontrada no histórico" : "Competência anterior ao limite permitido"}</small></div></div>;
}

function ProductPopup({ kind, row, data, onChange, onClose }: { kind: PopupKind; row: DescriptionRow; data: ProductData; onChange: (kind: PopupKind) => void; onClose: () => void }) {
  const offers = [...data.offers].sort((a, b) => a.price - b.price);
  const minimum = offers[0];
  const average = offers.reduce((sum, offer) => sum + offer.price, 0) / offers.length;
  const maximum = offers[offers.length - 1];
  const converted = offers.filter((offer) => offer.packSize !== null);
  const pending = offers.filter((offer) => offer.packSize === null);
  const totalDemand = converted.reduce((sum, offer) => sum + offer.quantity * (offer.packSize ?? 0), 0);
  const brands = [...new Set(offers.map((offer) => offer.brand))].map((brand) => { const group = offers.filter((offer) => offer.brand === brand); return { brand, competitor: group.map((offer) => offer.competitor).join(" · "), average: group.reduce((sum, offer) => sum + offer.price, 0) / group.length, demand: group.reduce((sum, offer) => sum + (offer.packSize === null ? 0 : offer.quantity * offer.packSize), 0) }; });
  const allPrices = [{ competitor: "SOGAMAX", brand: "Preço praticado", price: data.sogamaxPrice, unit: "Referência interna", packSize: 1 }, ...offers];
  const absoluteMinimum = Math.min(...allPrices.map((offer) => offer.price));

  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="market-modal" role="dialog" aria-modal="true"><header className="modal-header"><div><span className="eyebrow">DETALHES DO PRODUTO</span><h2>{row.standardDescription}</h2><p>Recebido como: {row.marketDescription} · aparece {row.repetitions} vezes</p></div><button className="modal-close" onClick={onClose} aria-label="Fechar">×</button></header><div className="modal-tabs"><button className={kind === "prices" ? "active" : ""} onClick={() => onChange("prices")}>Preços</button><button className={kind === "demands" ? "active" : ""} onClick={() => onChange("demands")}>Demanda padronizada</button><button className={kind === "brands" ? "active" : ""} onClick={() => onChange("brands")}>Marcas</button></div>
    {kind === "prices" && <div className="modal-content"><div className="modal-kpis price-kpis"><div className="sogamax-kpi"><span>Preço praticado Sogamax</span><strong>{money(data.sogamaxPrice)}</strong><small>demonstrativo</small></div><div><span>Menor preço do mercado</span><strong>{money(minimum.price)}</strong><small>{minimum.competitor} · {minimum.brand}</small></div><div><span>Preço médio do mercado</span><strong>{money(average)}</strong></div><div><span>Maior preço do mercado</span><strong>{money(maximum.price)}</strong></div></div><div className="winner-banner"><span>MENOR PREÇO GERAL</span><strong>{absoluteMinimum === data.sogamaxPrice ? "SOGAMAX" : minimum.competitor}</strong><small>{absoluteMinimum === data.sogamaxPrice ? "Preço praticado Sogamax" : minimum.brand} · {money(absoluteMinimum)}</small></div><div className="popup-table-wrap"><table className="popup-table"><thead><tr><th>Empresa</th><th>Marca</th><th>Apresentação</th><th>Preço de venda</th><th>Nosso CMV</th></tr></thead><tbody>{allPrices.sort((a, b) => a.price - b.price).map((offer) => { const cmv = data.sogamaxCost / offer.price * 100; return <tr key={`${offer.competitor}-${offer.price}`} className={offer.competitor === "SOGAMAX" ? "sogamax-row" : ""}><td><strong>{offer.competitor}</strong></td><td>{offer.brand}</td><td>{offer.unit}{offer.packSize > 1 ? ` C/${offer.packSize}` : ""}</td><td><strong>{money(offer.price)}</strong></td><td><strong className="cmv-value">{cmv.toFixed(2).replace(".", ",")}%</strong><small className="cmv-source">custo ÷ preço de venda</small></td></tr> })}</tbody></table></div><div className="modal-note">CMV = custo atual Sogamax ÷ preço de venda × 100. O percentual é recalculado para o preço praticado pela Sogamax e para cada preço concorrente. Os dados permanecem demonstrativos no protótipo; na versão integrada, o custo atual virá do ERP.</div></div>}
    {kind === "demands" && <div className="modal-content"><div className="modal-kpis"><div><span>Demanda convertida</span><strong>{totalDemand.toLocaleString("pt-BR")} {offers[0]?.baseUnit}</strong></div><div><span>Registros convertidos</span><strong>{converted.length}</strong></div><div><span>Aguardando regra</span><strong>{pending.length}</strong></div><div><span>Unidade-base</span><strong>{offers[0]?.baseUnit}</strong></div></div><div className="popup-table-wrap"><table className="popup-table"><thead><tr><th>Concorrente</th><th>Demanda original</th><th>Regra aplicada</th><th>Demanda padronizada</th><th>Situação</th></tr></thead><tbody>{offers.map((offer) => <tr key={`${offer.competitor}-${offer.quantity}`}><td><strong>{offer.competitor}</strong></td><td>{offer.quantity.toLocaleString("pt-BR")} {offer.unit}</td><td>{offer.packSize === null ? "Não definida" : offer.packSize === 1 ? "1 × 1" : `1 ${offer.unit} = ${offer.packSize} ${offer.baseUnit}`}</td><td><strong>{offer.packSize === null ? "—" : `${(offer.quantity * offer.packSize).toLocaleString("pt-BR")} ${offer.baseUnit}`}</strong></td><td>{offer.packSize === null ? <span className="conversion pending">Validar conversão</span> : <span className="conversion ok">Convertido</span>}</td></tr>)}</tbody></table></div>{pending.length > 0 && <div className="conversion-alert"><strong>{pending.length} registro fora do total.</strong><span>Quantidades sem fator confirmado não são somadas.</span></div>}</div>}
    {kind === "brands" && <div className="modal-content"><div className="brand-summary"><div><span className="eyebrow">MARCAS ENCONTRADAS</span><strong>{brands.length}</strong><p>Visão consolidada das marcas oferecidas para esta descrição padronizada.</p></div><div className="brand-ring" style={{ "--brand-count": brands.length } as React.CSSProperties}><span>{brands.length}</span><small>marcas</small></div></div><div className="brand-grid">{brands.map((brand, index) => <article key={brand.brand}><div className="brand-rank">0{index + 1}</div><div><h3>{brand.brand}</h3><p>{brand.competitor}</p></div><dl><div><dt>Preço médio</dt><dd>{money(brand.average)}</dd></div><div><dt>Demanda convertida</dt><dd>{brand.demand.toLocaleString("pt-BR")} {offers[0]?.baseUnit}</dd></div></dl></article>)}</div></div>}
  </section></div>;
}
