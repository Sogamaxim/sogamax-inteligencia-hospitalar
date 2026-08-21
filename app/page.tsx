"use client";

import { useMemo, useRef, useState } from "react";

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

const initialRows: MatchRow[] = [
  { id: 1, description: "LUVA CIRÚRGICA 6.5 EST PO C/01 PAR", repetitions: 7, candidate: "32025", product: "LUVA CIRÚRGICA EST C/ PÓ 6,5 PAR", confidence: 83.2, status: "Forte", brand: "MEDIX", evidence: ["Tamanho 6,5 compatível", "Apresentação em par", "Descrição encontrada em 7 respostas"] },
  { id: 2, description: "LUVA NITRÍLICA M SEM PO AZUL C/100", repetitions: 19, candidate: "19313", product: "LUVA NITRÍLICA SEM PÓ AZUL TAM M C/100", confidence: 77.9, status: "Provável", brand: "DESCARPACK", evidence: ["Material nitrílico", "Tamanho M e caixa com 100", "Marca não informada no mercado"] },
  { id: 3, description: "LUVA 7.0", repetitions: 11, candidate: "—", product: "Candidato insuficiente", confidence: 65.5, status: "Revisar", brand: "—", evidence: ["Descrição muito curta", "Falta tipo de luva", "Falta apresentação"] },
  { id: 4, description: "ACALABRUTINIBE 100MG CAPS", repetitions: 3, candidate: "—", product: "Nenhum produto seguro no estoque hospitalar", confidence: 47.1, status: "Sem código", brand: "—", evidence: ["Princípio ativo sem equivalente seguro", "Confiança abaixo do limite", "Requer análise do cadastro"] },
  { id: 5, description: "SERINGA DESC 10ML S/AGULHA BICO SLIP", repetitions: 14, candidate: "10584", product: "SERINGA DESCARTÁVEL 10ML BICO SLIP SEM AGULHA", confidence: 81.4, status: "Forte", brand: "SR", evidence: ["Volume 10 ml", "Bico slip", "Sem agulha"] },
  { id: 6, description: "EQUIPO MACROGOTAS C/INJETOR LATERAL", repetitions: 8, candidate: "14772", product: "EQUIPO MACROGOTAS COM INJETOR LATERAL", confidence: 75.6, status: "Provável", brand: "LABOR IMPORT", evidence: ["Tipo macrogotas", "Injetor lateral compatível", "Fabricante não informado"] },
];

const statusClass: Record<Status, string> = { Forte: "status strong", Provável: "status probable", Revisar: "status review", "Sem código": "status missing" };
const navItems: { id: View; label: string; description: string }[] = [
  { id: "dashboard", label: "Visão geral", description: "Indicadores do cruzamento" },
  { id: "import", label: "Importar arquivos", description: "Mercado e estoque" },
  { id: "mapping", label: "Mapa de descrições", description: "Revisar e aprovar" },
  { id: "export", label: "Exportação", description: "Relatório enriquecido" },
];

function downloadCsv(rows: MatchRow[], approved: number[]) {
  const header = ["descricao_limpa", "repeticoes", "codigo_sogamax", "produto_sogamax", "confianca", "status_aprovacao"];
  const body = rows.map((row) => [row.description, row.repetitions, approved.includes(row.id) ? row.candidate : "", approved.includes(row.id) ? row.product : "", row.confidence.toFixed(1).replace(".", ","), approved.includes(row.id) ? "APROVADO" : "PENDENTE"]);
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
  const marketInput = useRef<HTMLInputElement>(null);
  const stockInput = useRef<HTMLInputElement>(null);

  const selected = initialRows.find((row) => row.id === selectedId) ?? initialRows[0];
  const filteredRows = useMemo(() => initialRows.filter((row) => {
    const matchesText = `${row.description} ${row.candidate} ${row.product}`.toLowerCase().includes(search.toLowerCase());
    return matchesText && (filter === "Todos" || row.status === filter);
  }), [search, filter]);

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
    </main>
  );
}

function UploadCard({ title, subtitle, filename, inputRef, onFile }: { title: string; subtitle: string; filename: string; inputRef: React.RefObject<HTMLInputElement | null>; onFile: (name: string) => void }) {
  return <article className="panel upload-card"><div className="upload-icon">↑</div><span className="eyebrow">ARQUIVO DE ENTRADA</span><h3>{title}</h3><p>{subtitle}</p><input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(event) => event.target.files?.[0] && onFile(event.target.files[0].name)} /><button className="drop-zone" onClick={() => inputRef.current?.click()}><strong>{filename || "Clique para selecionar"}</strong><span>{filename ? "Arquivo selecionado · substituir" : "XLSX, XLS ou CSV"}</span></button>{filename && <div className="file-ready"><span>✓</span><div><strong>Arquivo pronto</strong><small>{filename}</small></div></div>}</article>;
}
