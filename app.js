let DATA = [];
const el = (id) => document.getElementById(id);

function norm(s){
  return (s ?? "")
    .toString()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function uniqueSorted(arr){
  return [...new Set(arr.filter(v => v !== null && v !== undefined && v !== ""))]
    .map(v => v.toString())
    .sort((a,b) => a.localeCompare(b, "pt-BR", {numeric:true, sensitivity:"base"}));
}

function buildIndex(r){
  const parts = [
    r.id, r.area, r.painel, r.disjuntor, r.cubic, r.funcao,
    r.tensao_v, r.vem_de, r.vai_para, r.grau, r.obs
  ];
  return norm(parts.filter(Boolean).join(" | "));
}

// Configuração central dos filtros em cascata: cada select mapeado ao campo do registro.
const FILTER_CONFIG = [
  { id: "f_painel", field: (r) => r.painel },
  { id: "f_area", field: (r) => r.area },
  { id: "f_funcao", field: (r) => r.funcao },
  { id: "f_tensao", field: (r) => String(r.tensao_v ?? "") },
  { id: "f_grau", field: (r) => String(r.grau ?? ) }
];
const FILTER_IDS = FILTER_CONFIG.map(f => f.id);

// Verifica se um registro passa em todos os filtros, EXCETO o do select "excludeId".
// Usado para recalcular as opções de um select com base nos demais filtros já escolhidos.
function matchesFilterExcept(r, excludeId){
  const fPainel = el("f_painel").value;
  const fArea = el("f_area").value;
  const fFunc = el("f_funcao").value;
  const fTen = el("f_tensao").value;
  const fGrau = el("f_grau").value;

  if (excludeId !== "f_painel" && fPainel && (r.painel ?? "") !== fPainel) return false;
  if (excludeId !== "f_area" && fArea && (r.area ?? "") !== fArea) return false;
  if (excludeId !== "f_funcao" && fFunc && (r.funcao ?? "") !== fFunc) return false;
  if (excludeId !== "f_tensao" && fTen && String(r.tensao_v ?? "") !== fTen) return false;
  if (excludeId !== "f_grau" && fGrau && String(r.grau ?? "") !== fGrau) return false;
  return true;
}

function matchesFilters(r){
  const fPainel = el("f_painel").value;
  const fArea = el("f_area").value;
  const fFunc = el("f_funcao").value;
  const fTen = el("f_tensao").value;
  const fGrau = el("f_grau").value;

  if (fPainel && (r.painel ?? "") !== fPainel) return false;
  if (fArea && (r.area ?? "") !== fArea) return false;
  if (fFunc && (r.funcao ?? "") !== fFunc) return false;
  if (fTen && String(r.tensao_v ?? "") !== fTen) return false;
  if (fGrau && String(r.grau ?? "") !== fGrau) return false;
  return true;
}

function toEmptyIfNull(x){
  if (x === null || x === undefined) return "";
  // Limpa espaços invisíveis provenientes de planilhas (\u00a0)
  return x.toString().replace(/\u00a0/g, " ").trim();
}

function normalizeRecord(raw){
  return {
    id: toEmptyIfNull(raw["ID"]),
    area: toEmptyIfNull(raw["Nome da Área"]),
    painel: toEmptyIfNull(raw["Painel"]),
    disjuntor: toEmptyIfNull(raw["Disjuntor"]),
    // Suporta variadas grafias para Cubículo/Gaveta
    cubic: toEmptyIfNull(raw["Cubículo-- Gaveta"] ?? raw["Cubículo/ Gaveta"] ?? raw["Cubículo/Gaveta"] ?? raw["Cubículo"] ?? ""),
    funcao: toEmptyIfNull(raw["Função"]),
    tensao_v: toEmptyIfNull(raw["Tensão (V)"] ?? raw["Tensão"] ?? ""),
    vem_de: toEmptyIfNull(raw["Vem de"]),
    // Suporta tanto a chave nova ("Alimenta") quanto a antiga ("Vai para")
    vai_para: toEmptyIfNull(raw["Alimenta"] ?? raw["Vai para"] ?? ""),
    grau: toEmptyIfNull(raw["Grau"]),
    obs: toEmptyIfNull(raw["Obs"] ?? raw["Observações] ?? "")
  };
}

// Campos usados para indicar em qual informação a busca encontrou correspondência.
// "Alimenta" e "Vem de" não entram aqui pois já são sempre exibidos no card (título e subtítulo).
function findHitLabel(r, qRaw){
  const q = norm(qRaw);
  if (!q) return "";

  const fields = [
    { key: "disjuntor", label: "Equipamento },
    { key: "painel", label: "Painel" },
    { key: "cubic", label: "Cubículo/Gaveta" },
    { key: "funcao", label: "Função" },
    { key: "area", label: "Área" },
    { key: "tensao_v", label: "Tensão" },
    { key: "grau", label: "Grau" },
    { key: "id", label: "ID" }
  ];

  for (const f of fields){
    const v = (r[f.key] ?? "").toString();
    if (norm(v).includes(q)){
      return `${f.label}: ${v || "—"}`;
    }
  }
  return "";
}

// Informação secundária (opcional): indica em qual campo a busca encontrou o termo,
// exibida apenas quando esse termo não aparece já no "Alimenta" (título) ou "Vem de" (subtítulo).
function buildMatchInfo(r, qRaw){
  const q = norm(qRaw);
  if (!q) return "";
  if (norm(r.vai_para || "").includes(q)) return "";
  if (norm(r.vem_de || "").includes(q)) return "";
  return findHitLabel(r, qRaw);
}

// Valores que não representam um equipamento/painel real — não faz sentido navegar para eles.
const NON_NAVIGABLE_VALUES = new Set(["", "futuro", "reserva"]);

function isNavigableToken(token){
  const t = norm(token);
  return t && !NON_NAVIGABLE_VALUES.has(t);
}

// Divide um valor composto (ex.: "TF-025101-01A -- PN-025101-03") em tokens individuais,
// já que cada trecho normalmente representa um equipamento/painel distinto na cadeia elétrica.
function splitChainValue(value){
  return (value ?? )
    .toString()
    .split(/\s*--\s*/g)
    .map(s => s.trim())
    .filter(Boolean);
}

// Navega a busca para o valor clicado: fecha o modal (se aberto), limpa os filtros de
// select (para não ocultar o resultado) e preenche o campo de busca com o token clicado,
// aplicando o filtro imediatamente e rolando até a lista de resultados.
function navigateToValue(token){
  const value = (token ?? "").toString().trim();
  if (!value) return;

  if (el("dlg").open) el("dlg").close();

  for (const id of FILTER_IDS){
    el(id).value = "";
  }
  updateFilterOptions();

  el("q").value = value;
  apply();

  el("list").scrollIntoView({ behavior: "smooth", block: "start" });
}

// Constrói uma linha "Rótulo: token1 → token2 → ..." com cada token clicável (quando
// representar um equipamento/painel navegável), permitindo seguir a cadeia elétrica.
function buildChainLine(labelText, rawValue){
  const wrap = document.createElement("span");

  if (labelText){
    const labelEl = document.createElement("span");
    labelEl.className = "chain_label";
    labelEl.textContent = `0){
    const emptyEl = document.createElement("span");
    emptyEl.textContent = (não definido)";
    wrap.appendChild(emptyEl);
    return wrap;
  }

  tokens.forEach((token, idx) => {
    if (idx > 0){
      const sep = document.createElement("span);
      sep.className = "chain_sep";
      sep.textContent = " → ";
      wrap.appendChild(sep);
    }

    if (isNavigableToken(token)){
      const link = document.createElement("span");
      link.className = "chain_link";
      link.textContent = token;
      link.tabIndex = 0;
      link.setAttribute("role", "button");
      link.title = `Buscar por 
        if (ev.key === "Enter" || ev.key === " "){
          ev.preventDefault();
          navigateToValue(token);
        }
      });
      wrap.appendChild(link);
    } else {
      const span = document.createElement("span");
      span.textContent = token;
      wrap.appendChild(span);
    }
  });

  return wrap;
}

function render(list, qRaw){
  const root = el("list");
  root.innerHTML = "";
  el("count").textContent = ` "card";

    const topo = document.createElement(div");
    topo.className = "card_top";

    const left = document.createElement("div");
    left.style.width = "100%";

    // 1. Título (.k1) — sempre os dados de "Alimenta", com navegação clicável por token
    const divK1 = document.createElement("div");
    divK1.className = "k1";
    divK1.appendChild(buildChainLine("Alimenta:", r.vai_para));
    left.appendChild(divK1);

    // 1b. "Vem de" — sempre visível (quando existir), também navegável
    if (r.vem_de){
      const divFrom = document.createElement("div");
      divFrom.className = "k_from";
      divFrom.appendChild(buildChainLine("Vem de:", r.vem_de));
      left.appendChild(divFrom);
    }

    // 1c. Indicador de on
