"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type View = "dashboard" | "import" | "mapping" | "export";
type Status = "Forte" | "Provável" | "Revisar" | "Sem código";

type MatchRow = {
  id: number;
  description: string;
  repetitions: number;
  candidate: string;
  product: string;
  confidence: number;
  status: Status;
  brand: string;
  evidence: string[];
};

type PopupKind = "prices" | "demands" | "brands";
type MarketOffer = {
  competitor: string;
  brand: string;
  price: number;
  quantity: number;
  unit: string;
  packSize: number | null;
  baseUnit: string;
};

const initialRows: MatchRow[] = [
  { id: 1, description: "LUVA CIRÚRGICA 6.5 EST PO C/01 PAR", repetitions: 7, candidate: "32025", product: "LUVA CIRÚRGICA EST C/ PÓ 6,5 PAR", confidence: 83.2, status: "Forte", brand: "MEDIX", evidence: ["Tamanho 6,5 compatível", "Apresentação em par", "Descrição encontrada em 7 respostas"] },
  { id: 2, description: "LUVA NITRÍLICA M SEM PO AZUL C/100", repetitions: 19, candidate: "19313", product: "LUVA NITRÍLICA SEM PÓ AZUL TAM M C/100", confidence: 77.9, status: "Provável", brand: "DESCARPACK", evidence: ["Material nitrílico", "Tamanho M e caixa com 100", "Marca não informada no mercado"] },
  { id: 3, description: "LUVA 7.0", repetitions: 11, candidate: "—", product: "Candidato insuficiente", confidence: 65.5, status: "Revisar", brand: "—", evidence: ["Descrição muito curta", "Falta tipo de luva", "Falta apresentação"] },
  { id: 4, description: "ACALABRUTINIBE 100MG CAPS", repetitions: 3, candidate: "—", product: "Nenhum produto seguro no estoque hospitalar", confidence: 47.1, status: "Sem código", brand: "—", evidence: ["Princípio ativo sem equivalente seguro", "Confiança abaixo do limite", "Requer análise do cadastro"] },
  { id: 5, description: "SERINGA DESC 10ML S/AGULHA BICO SLIP", repetitions: 14, candidate: "10584", product: "SERINGA DESCARTÁVEL 10ML BICO SLIP SEM AGULHA", confidence: 81.4, status: "Forte", brand: "SR", evidence: ["Volume 10 ml", "Bico slip", "Sem agulha"] },
  { id: 6, description: "EQUIPO MACROGOTAS C/INJETOR LATERAL", repetitions: 8, candidate: "14772", product: "EQUIPO MACROGOTAS COM INJETOR LATERAL", confidence: 75.6, status: "Provável", brand: "LABOR IMPORT", evidence: ["Tipo macrogotas", "Injetor lateral compatível", "Fabricante não informado"] },
];

const marketOffers: Record<number, MarketOffer[]> = {
  1: [
    { competitor: "Fornecedor A", brand: "MEDIX", price: 12.48, quantity: 12, unit: "CAIXA", packSize: 50, baseUnit: "PAR" },
    { competitor: "Fornecedor B", brand: "DESCARPACK", price: 13.2, quantity: 250, unit: "PAR", packSize: 1, baseUnit: "PAR" },
    { competitor: "Fornecedor C", brand: "NEW HAND", price: 15.9, quantity: 3, unit: "PACOTE", packSize: 10, baseUnit: "PAR" },
    { competitor: "Fornecedor D", brand: "MEDIX", price: 12.95, quantity: 5, unit: "FARDO", packSize: null, baseUnit: "PAR" },
  ],
  2: [
    { competitor: "Fornecedor A", brand: "MEDIX", price: 26.9, quantity: 18, unit: "CAIXA", packSize: 100, baseUnit: "UN" },
    { competitor: "Fornecedor E", brand: "NUGARD", price: 24.7, quantity: 650, unit: "UN", packSize: 1, baseUnit: "UN" },
    { competitor: "Fornecedor B", brand: "DESCARPACK", price: 28.35, quantity: 9, unit: "CAIXA", packSize: 100, baseUnit: "UN" },
  ],
  3: [
    { competitor: "Fornecedor C", brand: "MEDIX", price: 8.4, quantity: 20, unit: "PAR", packSize: 1, baseUnit: "PAR" },
    { competitor: "Fornecedor F", brand: "LEMGRUBER", price: 9.15, quantity: 4, unit: "CAIXA", packSize: null, baseUnit: "PAR" },
  ],
  4: [
    { competitor: "Fornecedor G", brand: "ASTRAZENECA", price: 4380, quantity: 2, unit: "CAIXA", packSize: 60, baseUnit: "CÁPS" },
    { competitor: "Fornecedor H", brand: "ASTRAZENECA", price: 4295, quantity: 120, unit: "CÁPS", packSize: 1, baseUnit: "CÁPS" },
  ],
  5: [
    { competitor: "Fornecedor A", brand: "SR", price: 0.68, quantity: 10, unit: "CAIXA", packSize: 100, baseUnit: "UN" },
    { competitor: "Fornecedor B", brand: "DESCARPACK", price: 0.74, quantity: 800, unit: "UN", packSize: 1, baseUnit: "UN" },
    { competitor: "Fornecedor E", brand: "INJEX", price: 0.71, quantity: 4, unit: "PACOTE", packSize: 50, baseUnit: "UN" },
  ],
  6: [
    { competitor: "Fornecedor D", brand: "LABOR IMPORT", price: 1.42, quantity: 420, unit: "UN", packSize: 1, baseUnit: "UN" },
    { competitor: "Fornecedor B", brand: "DESCARPACK", price: 1.58, quantity: 5, unit: "CAIXA", packSize: 100, baseUnit: "UN" },
    { competitor: "Fornecedor F", brand: "MEDSONDA", price: 1.36, quantity: 2, unit: "FARDO", packSize: null, baseUnit: "UN" },
  ],
};

const statusClass: Record<Status, string> = { Forte: "status strong", Provável: "status probable", Revisar: "status review", "Sem código": "status missing" };
const navItems: { id: View; label: string; description: string }[] = [
  { id: "dashboard", label: "Visão geral", description: "Indicadores do cruzamento" },
  { id: "import", label: "Importar arquivos", description: "Mercado e estoque" },
  { id: "mapping", label: "Mapa de descrições", description: "Revisar e aprovar" },
  { id: "export", label: "Exportação", description: "Relatório enriquecido" },
];

function downloadCsv(rows: MatchRow[], approved: number[]) {
  const header = ["descricao_limpa", "repeticoes", "codigo_sogamax", "produto_sogamax", "confianca", "preco_minimo", "preco_medio", "demanda_padronizada", "unidade_base", "marcas_concorrentes", "status_aprovacao"];
  const body = rows.map((row) => {
    const offers = marketOffers[row.id] ?? [];
    const prices = offers.map((offer) => offer.price);
    const convertedDemand = offers.reduce((total, offer) => total + (offer.packSize === null ? 0 : offer.quantity * offer.packSize), 0);
    const brands = [...new Set(offers.map((offer) => offer.brand))].join(" | ");
    return [row.description, row.repetitions, approved.includes(row.id) ? row.candidate : "", approved.includes(row.id) ? row.product : "", row.confidence.toFixed(1).replace(".", ","), Math.min(...prices).toFixed(2).replace(".", ","), (prices.reduce((sum, price) => sum + price, 0) / prices.length).toFixed(2).replace(".", ","), convertedDemand, offers[0]?.baseUnit ?? "", brands, approved.includes(row.id) ? "APROVADO" : "PENDENTE"];
  });
  const csv = [header, ...body].map((line) => line.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(";")).join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "relatorio_hospitalar_enriquecido.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function Home() {
  const [view, setView] = useState<View>("dashboard");
  const [selectedId, setSelectedId] = useState(1);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"Todos" | Status>("Todos");
  const [approved, setApproved] = useState<number[]>([]);
  const [toast, setToast] = useState("");
  const [marketFile, setMarketFile] = useState("Relatório Modelo — MedicalVM.xlsx");
  const [stockFile, setStockFile] = useState("Estoque Hospitalar Atualizado.xls");
  const [processing, setProcessing] = useState(false);
  const [processed, setProcessed] = useState(true);
  const [activePopup, setActivePopup] = useState<PopupKind | null>(null);
  const marketInput = useRef<HTMLInputElement>(null);
  const stockInput = useRef<HTMLInputElement>(null);

  const selected = initialRows.find((row) => row.id === selectedId) ?? initialRows[0];
  const selectedOffers = marketOffers[selected.id] ?? [];
  const filteredRows = useMemo(() => initialRows.filter((row) => {
    const matchesText = `${row.description} ${row.candidate} ${row.product}`.toLowerCase().includes(search.toLowerCase());
    return matchesText && (filter === "Todos" || row.status === filter);
  }), [search, filter]);

  useEffect(() => {
    if (!activePopup) return;
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && setActivePopup(null);
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [activePopup]);

  function flash(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  }

  function approve() {
    if (selected.candidate === "—") return flash("Escolha um código Sogamax antes de aprovar.");
    setApproved((current) => current.includes(selected.id) ? current : [...current, selected.id]);
    flash(`Código ${selected.candidate} aprovado e pronto para reaplicar.`);
  }

  function runMatching() {
    if (!marketFile || !stockFile) return flash("Selecione os dois arquivos para iniciar.");
    setProcessing(true); setProcessed(false);
    window.setTimeout(() => { setProcessing(false); setProcessed(true); flash("Cruzamento concluído: 232 descrições limpas analisadas."); }, 1500);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">S</div><div><strong>SOGAMAX</strong><span>Inteligência Hospitalar</span></div></div>
        <nav aria-label="Navegação principal">
          {navItems.map((item, index) => (
            <button key={item.id} className={view === item.id ? "nav-item active" : "nav-item"} onClick={() => setView(item.id)}>
              <span className="nav-index">0{index + 1}</span><span><strong>{item.label}</strong><small>{item.description}</small></span>
            </button>
          ))}
        </nav>
        <div className="sidebar-note"><span className="pulse" /><div><strong>Base atualizada</strong><small>846 códigos hospitalares</small></div></div>
        <div className="sidebar-footer">Protótipo conceitual · Central-IC</div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div><div className="breadcrumb">INTELIGÊNCIA DE MERCADO / HOSPITALAR</div><h1>{navItems.find((item) => item.id === view)?.label}</h1></div>
          <div className="top-actions"><span className="safe-pill"><i /> Validação humana ativa</span><div className="avatar">IM</div></div>
        </header>

        {view === "dashboard" && (
          <div className="page dashboard-page">
            <section className="hero-row">
              <div><span className="eyebrow">ÚLTIMO PROCESSAMENTO</span><h2>O mercado agora pode ser analisado<br />pelo código Sogamax.</h2><p>As linhas foram preservadas. As descrições repetidas foram agrupadas para que cada vínculo seja validado uma única vez.</p></div>
              <button className="primary" onClick={() => setView("mapping")}>Revisar sugestões <span>→</span></button>
            </section>

            <section className="kpi-grid">
              <article><span>Linhas do mercado</span><strong>2.597</strong><small>100% preservadas</small></article>
              <article><span>Descrições limpas</span><strong>232</strong><small>264 descrições exatas</small></article>
              <article className="accent"><span>Com sugestão</span><strong>56</strong><small>705 linhas alcançadas</small></article>
              <article><span>Aguardando decisão</span><strong>{176 - approved.length}</strong><small>{approved.length} aprovadas nesta sessão</small></article>
            </section>

            <section className="content-grid">
              <article className="panel status-panel">
                <div className="panel-head"><div><span className="eyebrow">QUALIDADE DO VÍNCULO</span><h3>Status das descrições</h3></div><button className="text-button" onClick={() => setView("mapping")}>Ver mapa completo →</button></div>
                <div className="status-bars">
                  {[{ label: "Forte", value: 12, color: "#25a56a" }, { label: "Provável", value: 44, color: "#e7b53f" }, { label: "Revisão manual", value: 78, color: "#e8833a" }, { label: "Sem código seguro", value: 98, color: "#d95555" }].map((item) => (
                    <div className="bar-row" key={item.label}><div className="bar-label"><span>{item.label}</span><strong>{item.value}</strong></div><div className="bar-track"><div style={{ width: `${item.value / 98 * 100}%`, background: item.color }} /></div></div>
                  ))}
                </div>
              </article>
              <article className="panel coverage-panel"><span className="eyebrow">IMPACTO IMEDIATO</span><div className="coverage-number">705 <span>linhas</span></div><p>podem reutilizar as 56 sugestões fortes ou prováveis depois da aprovação.</p><div className="coverage-meter"><div /></div><small>27,1% das linhas do relatório cobertas por candidatos seguros</small></article>
              <article className="panel rule-panel"><span className="rule-icon">✓</span><div><span className="eyebrow">REGRA DE SEGURANÇA</span><h3>Nenhum código é publicado automaticamente.</h3><p>A ferramenta recomenda. A equipe confirma ou corrige antes de enriquecer o relatório.</p></div></article>
            </section>
          </div>
        )}

        {view === "import" && (
          <div className="page">
            <section className="section-intro"><div><span className="eyebrow">ETAPA 01</span><h2>Importe as duas fontes</h2><p>A chave comum será construída pela limpeza das descrições. Os arquivos originais não são alterados.</p></div><div className="step-pill">1 de 4 · Importação</div></section>
            <section className="upload-grid">
              <UploadCard title="Relatório de mercado" subtitle="MedicalVM ou plataforma de cotação" filename={marketFile} inputRef={marketInput} onFile={setMarketFile} />
              <UploadCard title="Estoque hospitalar Sogamax" subtitle="Base de produtos e códigos internos" filename={stockFile} inputRef={stockInput} onFile={setStockFile} />
            </section>
            <section className="panel process-panel"><div><span className="eyebrow">PROCESSAMENTO</span><h3>{processing ? "Limpando e comparando descrições…" : processed ? "Arquivos prontos para novo processamento" : "Aguardando arquivos"}</h3><p>Normalização → agrupamento → busca de candidatos → classificação de confiança</p></div><button className="primary" onClick={runMatching} disabled={processing}>{processing ? "Processando…" : "Executar cruzamento"}</button>{processing && <div className="loading-line"><div /></div>}</section>
            <div className="flow-strip">{["Importar", "Limpar", "Cruzar", "Validar", "Publicar"].map((step, index) => <div key={step} className={index === 0 || (index <= 2 && processed) ? "done" : ""}><span>{index + 1}</span><strong>{step}</strong></div>)}</div>
          </div>
        )}

        {view === "mapping" && (
          <div className="page mapping-page">
            <section className="section-intro compact"><div><span className="eyebrow">ETAPA 04</span><h2>Validação assistida</h2><p>Uma decisão aprovada é reaplicada a todas as ocorrências da mesma descrição limpa.</p></div><div className="approval-count"><strong>{approved.length}</strong><span>aprovadas nesta sessão</span></div></section>
            <div className="mapping-layout">
              <section className="panel table-panel">
                <div className="table-toolbar"><label className="search-box"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar descrição ou código…" /></label><select value={filter} onChange={(event) => setFilter(event.target.value as "Todos" | Status)} aria-label="Filtrar por status"><option>Todos</option><option>Forte</option><option>Provável</option><option>Revisar</option><option>Sem código</option></select></div>
                <div className="table-wrap"><table><thead><tr><th>Descrição limpa</th><th>Repet.</th><th>Código</th><th>Confiança</th><th>Status</th></tr></thead><tbody>{filteredRows.map((row) => (
                  <tr key={row.id} className={selected.id === row.id ? "selected" : ""} onClick={() => setSelectedId(row.id)}><td><strong>{row.description}</strong><small>{approved.includes(row.id) ? "✓ vínculo aprovado" : row.product}</small></td><td>{row.repetitions}</td><td><strong>{row.candidate}</strong></td><td>{row.confidence.toFixed(1).replace(".", ",")}%</td><td><span className={statusClass[row.status]}>{row.status}</span></td></tr>
                ))}</tbody></table>{filteredRows.length === 0 && <div className="empty-state">Nenhuma descrição encontrada com esses filtros.</div>}</div>
              </section>
              <aside className="panel detail-panel">
                <div className="detail-top"><span className={statusClass[selected.status]}>{selected.status}</span><span>{selected.confidence.toFixed(1).replace(".", ",")}% de confiança</span></div>
                <span className="eyebrow">DESCRIÇÃO DO MERCADO</span><h3>{selected.description}</h3><div className="arrow-down">↓</div>
                <span className="eyebrow">CANDIDATO SOGAMAX</span><div className="candidate-code">{selected.candidate === "—" ? "Sem candidato seguro" : `Código ${selected.candidate}`}</div><h4>{selected.product}</h4>
                <div className="candidate-meta"><span>Marca</span><strong>{selected.brand}</strong><span>Repetições</span><strong>{selected.repetitions} linhas</strong></div>
                <div className="market-actions">
                  <span className="eyebrow">DETALHES DO MERCADO</span>
                  <div className="market-action-grid">
                    <button onClick={() => setActivePopup("prices")}><span className="market-action-icon">R$</span><strong>Preços</strong><small>{selectedOffers.length} concorrentes</small></button>
                    <button onClick={() => setActivePopup("demands")}><span className="market-action-icon">Σ</span><strong>Demanda</strong><small>unidades tratadas</small></button>
                    <button onClick={() => setActivePopup("brands")}><span className="market-action-icon">M</span><strong>Marcas</strong><small>{new Set(selectedOffers.map((offer) => offer.brand)).size} encontradas</small></button>
                  </div>
                </div>
                <div className="evidence"><span className="eyebrow">EVIDÊNCIAS</span>{selected.evidence.map((evidence) => <p key={evidence}><i>✓</i>{evidence}</p>)}</div>
                <div className="decision-actions"><button className="primary" onClick={approve} disabled={approved.includes(selected.id)}>{approved.includes(selected.id) ? "Código aprovado ✓" : "Aprovar código"}</button><button className="secondary" onClick={() => flash("Modo de correção aberto para busca manual no estoque.")}>Corrigir vínculo</button></div>
                <small className="security-copy">A aprovação será registrada para auditoria e reutilização futura.</small>
              </aside>
            </div>
          </div>
        )}

        {view === "export" && (
          <div className="page">
            <section className="section-intro"><div><span className="eyebrow">ETAPA 05</span><h2>Relatório enriquecido</h2><p>Os códigos aparecem somente nas linhas cujas descrições foram aprovadas pela equipe.</p></div></section>
            <section className="export-grid">
              <article className="panel export-card"><div className="file-badge">XLSX</div><div><span className="eyebrow">SAÍDA PRINCIPAL</span><h3>Relatório completo com código Sogamax</h3><p>Preserva as 2.597 linhas originais, preços, fornecedores e marcas. O código validado é reaplicado às repetições.</p></div><div className="export-stats"><div><strong>2.597</strong><span>linhas</span></div><div><strong>{approved.length}</strong><span>vínculos aprovados</span></div><div><strong>{initialRows.filter((row) => approved.includes(row.id)).reduce((sum, row) => sum + row.repetitions, 0)}</strong><span>linhas enriquecidas</span></div></div><button className="primary wide" onClick={() => downloadCsv(initialRows, approved)}>Baixar demonstração em CSV <span>↓</span></button></article>
              <aside className="panel release-card"><span className="eyebrow">CONTROLE DE PUBLICAÇÃO</span><h3>Pronto para liberar?</h3><div className="check-item ok"><span>✓</span><div><strong>Dados originais preservados</strong><small>Nenhuma linha foi removida</small></div></div><div className="check-item ok"><span>✓</span><div><strong>Estoque hospitalar atualizado</strong><small>846 códigos disponíveis</small></div></div><div className={approved.length ? "check-item ok" : "check-item pending"}><span>{approved.length ? "✓" : "!"}</span><div><strong>Validação humana</strong><small>{approved.length ? `${approved.length} vínculo(s) aprovado(s)` : "Nenhum vínculo aprovado nesta sessão"}</small></div></div><button className="secondary wide" onClick={() => setView("mapping")}>Voltar para validação</button></aside>
            </section>
          </div>
        )}
      </section>
      {toast && <div className="toast" role="status"><span>✓</span>{toast}</div>}
      {activePopup && <MarketPopup kind={activePopup} row={selected} offers={selectedOffers} onChange={setActivePopup} onClose={() => setActivePopup(null)} />}
    </main>
  );
}

function MarketPopup({ kind, row, offers, onChange, onClose }: { kind: PopupKind; row: MatchRow; offers: MarketOffer[]; onChange: (kind: PopupKind) => void; onClose: () => void }) {
  const prices = offers.map((offer) => offer.price);
  const minimum = Math.min(...prices);
  const maximum = Math.max(...prices);
  const average = prices.reduce((sum, price) => sum + price, 0) / prices.length;
  const converted = offers.filter((offer) => offer.packSize !== null);
  const pending = offers.filter((offer) => offer.packSize === null);
  const totalDemand = converted.reduce((sum, offer) => sum + offer.quantity * (offer.packSize ?? 0), 0);
  const brands = [...new Set(offers.map((offer) => offer.brand))].map((brand) => {
    const brandOffers = offers.filter((offer) => offer.brand === brand);
    const normalizedDemand = brandOffers.reduce((sum, offer) => sum + (offer.packSize === null ? 0 : offer.quantity * offer.packSize), 0);
    return { brand, offers: brandOffers.length, average: brandOffers.reduce((sum, offer) => sum + offer.price, 0) / brandOffers.length, normalizedDemand };
  });
  const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="market-modal" role="dialog" aria-modal="true" aria-labelledby="market-modal-title">
        <header className="modal-header">
          <div><span className="eyebrow">VISÃO POR PRODUTO</span><h2 id="market-modal-title">{row.description}</h2><p>{row.candidate === "—" ? "Sem código Sogamax aprovado" : `Candidato Sogamax ${row.candidate}`} · Dados demonstrativos para validação do modelo</p></div>
          <button className="modal-close" onClick={onClose} aria-label="Fechar pop-up">×</button>
        </header>
        <div className="modal-tabs" role="tablist" aria-label="Informações do mercado">
          <button className={kind === "prices" ? "active" : ""} onClick={() => onChange("prices")}>Preços</button>
          <button className={kind === "demands" ? "active" : ""} onClick={() => onChange("demands")}>Demanda padronizada</button>
          <button className={kind === "brands" ? "active" : ""} onClick={() => onChange("brands")}>Marcas</button>
        </div>

        {kind === "prices" && <div className="modal-content">
          <div className="modal-kpis"><div><span>Menor preço</span><strong>{money(minimum)}</strong></div><div><span>Preço médio</span><strong>{money(average)}</strong></div><div><span>Maior preço</span><strong>{money(maximum)}</strong></div><div><span>Cotações</span><strong>{offers.length}</strong></div></div>
          <div className="popup-table-wrap"><table className="popup-table"><thead><tr><th>Concorrente</th><th>Marca</th><th>Apresentação</th><th>Preço cotado</th><th>Comparação</th></tr></thead><tbody>{[...offers].sort((a, b) => a.price - b.price).map((offer, index) => <tr key={`${offer.competitor}-${offer.price}`}><td><strong>{offer.competitor}</strong></td><td>{offer.brand}</td><td>{offer.unit}{offer.packSize && offer.packSize > 1 ? ` C/${offer.packSize}` : ""}</td><td><strong>{money(offer.price)}</strong></td><td>{index === 0 ? <span className="best-price">Menor preço</span> : <span className="price-delta">+{((offer.price / minimum - 1) * 100).toFixed(1).replace(".", ",")}%</span>}</td></tr>)}</tbody></table></div>
          <div className="modal-note">Os preços permanecem separados por concorrente e apresentação. A ferramenta não mistura valores de embalagens diferentes sem identificar a unidade.</div>
        </div>}

        {kind === "demands" && <div className="modal-content">
          <div className="modal-kpis"><div><span>Demanda convertida</span><strong>{totalDemand.toLocaleString("pt-BR")} {offers[0]?.baseUnit}</strong></div><div><span>Registros convertidos</span><strong>{converted.length}</strong></div><div><span>Aguardando regra</span><strong>{pending.length}</strong></div><div><span>Unidade-base</span><strong>{offers[0]?.baseUnit}</strong></div></div>
          <div className="popup-table-wrap"><table className="popup-table demand-table"><thead><tr><th>Concorrente</th><th>Demanda original</th><th>Fator aplicado</th><th>Demanda padronizada</th><th>Situação</th></tr></thead><tbody>{offers.map((offer) => <tr key={`${offer.competitor}-${offer.quantity}`}><td><strong>{offer.competitor}</strong></td><td>{offer.quantity.toLocaleString("pt-BR")} {offer.unit}</td><td>{offer.packSize === null ? "Não definido" : offer.packSize === 1 ? "1 × 1" : `1 ${offer.unit} = ${offer.packSize} ${offer.baseUnit}`}</td><td><strong>{offer.packSize === null ? "—" : `${(offer.quantity * offer.packSize).toLocaleString("pt-BR")} ${offer.baseUnit}`}</strong></td><td>{offer.packSize === null ? <span className="conversion pending">Validar conversão</span> : <span className="conversion ok">Convertido</span>}</td></tr>)}</tbody></table></div>
          {pending.length > 0 && <div className="conversion-alert"><strong>{pending.length} registro(s) fora do total.</strong><span>As quantidades em unidades sem fator confirmado não são somadas, evitando uma demanda incorreta.</span></div>}
        </div>}

        {kind === "brands" && <div className="modal-content">
          <div className="brand-summary"><div><span className="eyebrow">MARCAS ENCONTRADAS</span><strong>{brands.length}</strong><p>Marcas distintas cotadas para esta mesma descrição de mercado.</p></div><div className="brand-ring" style={{ "--brand-count": brands.length } as React.CSSProperties}><span>{brands.length}</span><small>marcas</small></div></div>
          <div className="brand-grid">{brands.map((brand, index) => <article key={brand.brand}><div className="brand-rank">0{index + 1}</div><div><h3>{brand.brand}</h3><p>{brand.offers} concorrente(s) oferecendo esta marca</p></div><dl><div><dt>Preço médio</dt><dd>{money(brand.average)}</dd></div><div><dt>Demanda convertida</dt><dd>{brand.normalizedDemand.toLocaleString("pt-BR")} {offers[0]?.baseUnit}</dd></div></dl></article>)}</div>
          <div className="modal-note">Uma mesma descrição pode receber marcas diferentes. Por isso, a marca é exibida como visão de mercado e não substitui automaticamente a marca do cadastro Sogamax.</div>
        </div>}
      </section>
    </div>
  );
}

function UploadCard({ title, subtitle, filename, inputRef, onFile }: { title: string; subtitle: string; filename: string; inputRef: React.RefObject<HTMLInputElement | null>; onFile: (name: string) => void }) {
  return <article className="panel upload-card"><div className="upload-icon">↑</div><span className="eyebrow">ARQUIVO DE ENTRADA</span><h3>{title}</h3><p>{subtitle}</p><input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(event) => event.target.files?.[0] && onFile(event.target.files[0].name)} /><button className="drop-zone" onClick={() => inputRef.current?.click()}><strong>{filename || "Clique para selecionar"}</strong><span>{filename ? "Arquivo selecionado · substituir" : "XLSX, XLS ou CSV"}</span></button>{filename && <div className="file-ready"><span>✓</span><div><strong>Arquivo pronto</strong><small>{filename}</small></div></div>}</article>;
}
