const STORAGE_KEY = "oblio_dashboard_v1";

const state = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") || {
  requesters: [],
  screenings: [],
  cases: [],
  requests: [],
  legalActions: [],
};

const $ = (id) => document.getElementById(id);

const sentimentFromText = (text) => {
  const lower = text.toLowerCase();
  const negativeWords = ["condanna", "truffa", "indagine", "arresto", "scandalo"];
  const positiveWords = ["premio", "successo", "riconoscimento", "donazione", "innovazione"];
  if (negativeWords.some((w) => lower.includes(w))) return "Negativo";
  if (positiveWords.some((w) => lower.includes(w))) return "Positivo";
  return "Neutro";
};

const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

const addRequester = (firstName, lastName, aliases = []) => {
  const fullName = `${lastName} ${firstName}`.trim();
  const existing = state.requesters.find((r) => r.fullName === fullName);
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  state.requesters.push({ id, firstName, lastName, fullName, aliases });
  return id;
};

const buildScreening = ({ firstName, lastName, aliases, scope }) => {
  const variants = [
    `${firstName} ${lastName}`,
    `${lastName} ${firstName}`,
    ...aliases,
  ].filter(Boolean);

  const fakeLinks = variants.slice(0, 4).map((variant, i) => {
    const snippets = [
      `${variant} coinvolto in iniziativa sociale locale con risultati positivi`,
      `${variant} menzionato in articolo su vecchia indagine non aggiornata`,
      `${variant} citato in evento professionale senza criticità`,
      `${variant} presente in archivio storico con informazioni potenzialmente obsolete`,
    ];
    const snippet = snippets[i % snippets.length];
    return {
      url: `https://example.com/search/${encodeURIComponent(variant)}/${i + 1}`,
      title: `Risultato ${i + 1} - ${variant}`,
      sentiment: sentimentFromText(snippet),
      snippet,
      relevance: ["Alta", "Media", "Bassa"][i % 3],
    };
  });

  const relation = `Screening ${scope}: trovati ${fakeLinks.length} risultati per ${lastName} ${firstName}. ` +
    `Focus su contenuti ${fakeLinks.filter((l) => l.sentiment === "Negativo").length ? "potenzialmente critici" : "prevalentemente neutri/positivi"}.`;

  return { variants, links: fakeLinks, relation };
};

const daysFrom = (dateString) => {
  const ms = Date.now() - new Date(dateString).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
};

const urgencyBadge = (d) => {
  if (d >= 30) return `<span class="badge urgent">Scaduta (${d} gg)</span>`;
  if (d >= 20) return `<span class="badge warning">In scadenza (${d} gg)</span>`;
  return `<span class="badge ok">Nei tempi (${d} gg)</span>`;
};

const renderSelects = () => {
  const requesterSelect = $("requesterSelect");
  requesterSelect.innerHTML = state.requesters
    .map((r) => `<option value="${r.id}">${r.fullName}</option>`)
    .join("");

  const options = state.cases
    .map((c) => `<option value="${c.id}">${c.label}</option>`)
    .join("");
  ["trackerCaseSelect", "legalCaseSelect"].forEach((id) => {
    $(id).innerHTML = options;
  });
};

const renderKpi = () => {
  const pending = state.requests.filter((r) => r.status === "In attesa" || r.status === "Silenzio").length;
  const resolved = state.requests.filter((r) => r.status === "Approvato").length;
  const overdue = state.requests.filter((r) => daysFrom(r.sentDate) >= 30).length;

  $("kpi").innerHTML = `
    <ul>
      <li>Casi attivi: <strong>${state.cases.length}</strong></li>
      <li>Richieste pendenti/silenzio: <strong>${pending}</strong></li>
      <li>Richieste scadute oltre 30gg: <strong>${overdue}</strong></li>
      <li>Richieste risolte (approvate): <strong>${resolved}</strong></li>
      <li>Azioni legali registrate: <strong>${state.legalActions.length}</strong></li>
    </ul>
  `;
};

const renderCases = () => {
  const requesterMap = new Map(state.requesters.map((r) => [r.id, r]));
  const requestsByCase = state.requests.reduce((acc, item) => {
    (acc[item.caseId] ||= []).push(item);
    return acc;
  }, {});
  const legalByCase = state.legalActions.reduce((acc, item) => {
    (acc[item.caseId] ||= []).push(item);
    return acc;
  }, {});

  $("cases-list").innerHTML = state.cases
    .map((c) => {
      const req = requestsByCase[c.id] || [];
      const actions = legalByCase[c.id] || [];
      return `
      <article>
        <h3>${c.label}</h3>
        <p><strong>Profilo:</strong> ${c.profileType} • <strong>Categoria:</strong> ${c.category}</p>
        <p><a href="${c.url}" target="_blank" rel="noreferrer">${c.url}</a></p>
        <p><strong>Richiedente:</strong> ${requesterMap.get(c.requesterId)?.fullName || "n/d"}</p>
        <p><strong>Tracker:</strong></p>
        <ul>
          ${req.map((r) => `<li>${r.engine} - ${r.status} ${urgencyBadge(daysFrom(r.sentDate))}</li>`).join("") || "<li>Nessuna richiesta</li>"}
        </ul>
        <p><strong>Azioni legali:</strong></p>
        <ul>
          ${actions.map((a) => `<li>${a.actionType} (${a.actionDate})</li>`).join("") || "<li>Nessuna azione</li>"}
        </ul>
      </article>`;
    })
    .join("") || "<p>Nessun caso registrato.</p>";
};

const render = () => {
  renderSelects();
  renderKpi();
  renderCases();
  save();
};

$("egosurfing-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const firstName = form.get("firstName").toString().trim();
  const lastName = form.get("lastName").toString().trim();
  const aliases = form
    .get("aliases")
    .toString()
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  const scope = form.get("scope").toString();

  const requesterId = addRequester(firstName, lastName, aliases);
  const result = buildScreening({ firstName, lastName, aliases, scope });
  state.screenings.push({ id: crypto.randomUUID(), requesterId, scope, createdAt: new Date().toISOString(), ...result });

  $("screening-result").innerHTML = `
    <p><strong>Varianti usate:</strong> ${result.variants.join(" • ")}</p>
    <p><strong>Relazione sintetica:</strong> ${result.relation}</p>
    <ul>
      ${result.links
        .map(
          (l) => `<li><a href="${l.url}" target="_blank" rel="noreferrer">${l.title}</a> — ${l.sentiment} (${l.relevance})<br/><small>${l.snippet}</small></li>`,
        )
        .join("")}
    </ul>
  `;

  e.target.reset();
  render();
});

$("case-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const requesterId = form.get("requesterId").toString();
  const requester = state.requesters.find((r) => r.id === requesterId);

  state.cases.push({
    id: crypto.randomUUID(),
    requesterId,
    label: `${requester?.fullName || "Richiedente"} • ${new Date().toLocaleDateString("it-IT")}`,
    profileType: form.get("profileType").toString(),
    url: form.get("url").toString(),
    category: form.get("category").toString(),
  });

  e.target.reset();
  render();
});

$("tracker-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  state.requests.push({
    id: crypto.randomUUID(),
    caseId: form.get("caseId").toString(),
    engine: form.get("engine").toString(),
    status: form.get("status").toString(),
    sentDate: form.get("sentDate").toString(),
  });
  e.target.reset();
  render();
});

$("legal-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  state.legalActions.push({
    id: crypto.randomUUID(),
    caseId: form.get("caseId").toString(),
    actionType: form.get("actionType").toString(),
    actionDate: form.get("actionDate").toString(),
    notes: form.get("notes").toString(),
  });
  e.target.reset();
  render();
});

if (!state.requesters.length) {
  const id = addRequester("Mario", "Rossi", ["M. Rossi"]);
  state.cases.push({
    id: crypto.randomUUID(),
    requesterId: id,
    label: "Rossi Mario • demo",
    profileType: "Privato",
    url: "https://example.com/notizia",
    category: "Obsoleto",
  });
}

render();
