// Fase 3 — conferência das telas mudadas pelos prompts da revisão V5.
// Uso: com o app em http://localhost:3400 e o banco do seed:
//   node scripts/e2e/v3-telas.mjs
import pw from "playwright";
const { chromium } = pw;

const BASE = process.env.BASE ?? "http://localhost:3400";
const OUT = process.env.OUT ?? ".";
let ok = 0, falha = 0;
const check = (n, c, d = "") => { console.log(`[${c ? "  OK  " : " FALHA"}] ${n}${d ? " — " + d : ""}`); c ? ok++ : falha++; };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });

async function entrar(email) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "Trocar@2026");
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 30000 });
  return page;
}

const texto = async (page, url) => {
  await page.goto(`${BASE}${url}`, { timeout: 90000 });
  await page.waitForLoadState("networkidle", { timeout: 90000 });
  return (await page.textContent("body")) ?? "";
};

// ── Owner do cliente (não é operador da plataforma) ──────────────────────
{
  const page = await entrar("admin@rmv.com.br");
  const menu = await texto(page, "/dashboard");
  check("REN: menu mostra Fornecedores e Parceiros", menu.includes("Fornecedores e Parceiros"));
  check("REN: menu mostra Medição de Projeto", menu.includes("Medição de Projeto"));
  check("PLAT: owner não vê Chaves de mudança no menu", !menu.includes("Chaves de mudança"));
  check("PLAT: owner não vê Backup de dados no menu", !menu.includes("Backup de dados"));
  const chaves = await texto(page, "/chaves");
  check("PLAT: owner não abre /chaves", !chaves.includes("Ligar") && /acesso|permiss/i.test(chaves));
  const desp = await texto(page, "/despesas?proj=all");
  check("REN: Despesas sem a aba A Pagar", !/\bA Pagar\b/.test(desp.replace("Contas a Pagar", "")));
  await page.goto(`${BASE}/despesas?tab=apagar`);
  await page.waitForLoadState("networkidle");
  check("REN: ?tab=apagar leva a Contas a Pagar", page.url().includes("/contaspagar"), page.url());
  await page.context().close();
}

// ── Operador da plataforma ───────────────────────────────────────────────
{
  const page = await entrar("fer.jorge@gmail.com");
  const menu = await texto(page, "/dashboard");
  check("PLAT: operador vê Chaves de mudança", menu.includes("Chaves de mudança"));
  check("PLAT: operador vê Backup de dados", menu.includes("Backup de dados"));

  const dre = await texto(page, "/dre?proj=all");
  check("AC2: DRE tem a visão mensal abaixo", dre.includes("Visão mensal"));
  const caixas = await page.locator('input[type="checkbox"]').count();
  check("AC2: cenários em caixas de seleção", caixas >= 3, `${caixas} caixas`);
  check("AC2: seletor Consolidado/Mensal saiu", !(await page.locator('option[value="mensal"]').count()));
  await page.screenshot({ path: `${OUT}/v3-dre.png`, fullPage: true });

  // E2 — a Cris sabe a tela e responde (sem chave de IA: pelo cálculo local).
  await page.click("[data-chat-botao]");
  const ctxCris = (await page.textContent("[data-chat-contexto]")) ?? "";
  check("E2: Cris abre com o nome e a tela", /DRE/.test(ctxCris) && (await page.locator("[data-chat]").getAttribute("aria-label"))?.startsWith("Cris"), ctxCris.slice(0, 80));
  check("E2: Cris traz as sugestões da tela", ((await page.textContent("[data-chat]")) ?? "").includes("Qual linha mais pesa sobre a receita?"));
  await page.fill('input[aria-label="Mensagem para a Cris"]', "Qual o saldo das contas hoje?");
  await page.click('[data-chat] button[type="submit"]');
  await page.waitForSelector("[data-chat-resposta], [data-chat] [role=alert]", { timeout: 60000 });
  const resp = (await page.textContent("[data-chat]")) ?? "";
  check("E2: Cris responde o saldo", /Saldo disponível/.test(resp), resp.slice(-160));
  await page.screenshot({ path: `${OUT}/v3-cris.png` });
  await page.click("[data-chat-botao]");

  const fluxo = await texto(page, "/fluxocaixa?proj=all");
  check("AD2: Fluxo de Caixa tem a visão semanal", fluxo.includes("Visão semanal"));
  const linhasSem = await page.locator("[data-fluxo-semanal] tbody tr").count();
  check("AD2: janela de 13 semanas", linhasSem === 13, `${linhasSem} linhas`);
  check("AD2: marca a semana atual", fluxo.includes("esta semana"));
  await page.click("text=Próximas →");
  await page.waitForURL(/[?&]sem=/, { timeout: 60000 }).catch(() => {});
  check("AD2: navega para as próximas semanas", /[?&]sem=\d{4}-\d{2}-\d{2}/.test(page.url()), page.url());
  await page.screenshot({ path: `${OUT}/v3-fluxo.png`, fullPage: true });

  await texto(page, "/caixa");
  const primeiro = await page.locator("select option").nth(1).getAttribute("value");
  const caixa = await texto(page, `/caixa?proj=${primeiro}`);
  check("L2: Caixa lista os dias fechados", (await page.locator("[data-dias-fechados]").count()) === 1);
  const previstos = await page.locator("[data-previsto-dia]").count();
  check("L2: dias de hoje em diante mostram o previsto", previstos >= 1, `${previstos} dia(s)`);
  check("L2: cartão traz o saldo projetado", caixa.includes("Saldo projetado"));
  await page.screenshot({ path: `${OUT}/v3-caixa.png`, fullPage: true });

  // AB2 — Consolidado e Balanço do Dia saem (redirecionamento com aviso).
  check("AB2: menu sem Consolidado e sem Balanço do Dia", !/\bConsolidado\b/.test(menu) && !menu.includes("Balanço do Dia"));
  const proj = await texto(page, "/consolidado");
  check("AB2: /consolidado leva à Projeção com o aviso", page.url().includes("/projecao") && proj.includes("A tela Consolidado saiu"), page.url());
  await page.context().close();
}
{
  const page = await entrar("fer.jorge@gmail.com");
  await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} });
  const bal = await texto(page, "/balancodia");
  check("AB2: /balancodia leva ao Caixa com o aviso", page.url().includes("/caixa") && bal.includes("A tela Balanço do Dia saiu"), page.url());
  check("AB2: dias fechados aparecem no Caixa", (await page.locator("[data-dias-fechados]").count()) === 1);

  // DP — categoria da DRE por conta; a chave nasce desligada, com prévia.
  const plano = await texto(page, "/planocontas");
  const comCategoria = await page.locator("[data-categoria-conta]").count();
  check("DP: cada conta do plano mostra a categoria da DRE", comCategoria > 10 && plano.includes("(padrão)"), `${comCategoria} contas`);
  check("DP: gasto de obra nasce Custo Variável", ((await page.textContent('[data-categoria-conta="1.1"]')) ?? "").includes("Custo Variável"));
  const chaves = await texto(page, "/chaves");
  check("DP: a chave aparece desligada com a prévia", chaves.includes("Despesa herda a categoria da DRE do Plano de Contas") && (await page.locator("#previa-categoria [data-previa-categoria-total]").count()) === 1);
  await page.screenshot({ path: `${OUT}/v3-chaves-categoria.png`, fullPage: false });
  const desp = await texto(page, "/despesas");
  check("DP: com a chave desligada, a categoria da despesa segue livre", (await page.locator("[data-categoria-travada]").count()) === 0, desp.length ? "" : "vazio");

  // AC3 — DRE Analítica: categoria → grupo → conta, com os totais da DRE.
  // Precisa de despesa lançada na Atual (o seed não traz; ver o relatório do AC3).
  const dreTxt = await texto(page, "/dre?proj=all");
  const resultadoDre = (await page.locator("tr", { hasText: "= Resultado Final" }).first().locator("td").nth(1).textContent())?.trim();
  const analitica = await texto(page, "/dre/analitica?proj=all");
  check("AC3: menu traz a DRE Analítica", dreTxt.includes("DRE Analítica"));
  check("AC3: abre com as categorias e os grupos", (await page.locator('[data-tabela-analitica] tr[data-tipo="grupo"]').count()) > 0, analitica.slice(0, 0));
  const resultadoAna = (await page.locator('[data-tabela-analitica] tr[data-tipo="final"] td').nth(1).textContent())?.trim();
  check("AC3: Resultado Final igual ao da DRE", !!resultadoDre && resultadoDre === resultadoAna, `${resultadoDre} × ${resultadoAna}`);
  await page.click("[data-abrir-tudo]");
  check("AC3: abre até a conta", (await page.locator('[data-tabela-analitica] tr[data-tipo="conta"]').count()) > 0);
  check("AC3: só o item DRE Analítica fica marcado no menu", (await page.locator('a[aria-current="page"]').count()) === 1 && ((await page.locator('a[aria-current="page"]').textContent()) ?? "").includes("DRE Analítica"));
  await page.screenshot({ path: `${OUT}/v3-dre-analitica.png`, fullPage: true });

  // AD3 — Fluxo de Caixa Analítico: bloco → grupo → conta, pelo vencimento.
  const fluxoAna = await texto(page, "/fluxocaixa/analitico?proj=all");
  check("AD3: menu traz o Fluxo de Caixa Analítico", fluxoAna.includes("Fluxo de Caixa Analítico"));
  check("AD3: saídas abertas em obra e complementares", fluxoAna.includes("Obra (grupos CEF)") && fluxoAna.includes("Complementares"));
  check("AD3: traz o saldo do período", (await page.locator('[data-tabela-analitica] tr[data-tipo="final"]').count()) === 1);
  check("AD3: só o item analítico fica marcado", ((await page.locator('a[aria-current="page"]').textContent()) ?? "").includes("Fluxo de Caixa Analítico") && (await page.locator('a[aria-current="page"]').count()) === 1);
  await page.screenshot({ path: `${OUT}/v3-fluxo-analitico.png`, fullPage: true });

  // PDF — os relatórios exportam pelo navegador, com a faixa da empresa só no PDF.
  check("PDF: botão Exportar PDF no Fluxo Analítico", (await page.locator("[data-exportar-pdf]").count()) === 1);
  check("PDF: a faixa da empresa fica escondida na tela", !(await page.locator("[data-cabecalho-impressao]").isVisible()));
  await page.emulateMedia({ media: "print" });
  check("PDF: na impressão, a faixa aparece e os seletores somem", (await page.locator("[data-cabecalho-impressao]").isVisible()) && !(await page.locator("[data-exportar-pdf]").isVisible()));
  await page.emulateMedia({ media: "screen" });

  // AA2 — Dashboard: fluxo em linhas, DRE em barras empilhadas, e o PDF.
  await texto(page, "/dashboard?proj=all");
  await page.waitForSelector("[data-graficos-dashboard] canvas", { timeout: 30000 }).catch(() => {});
  check("AA2: gráfico do fluxo de caixa", (await page.locator('[data-grafico="fluxo"] canvas').count()) === 1);
  check("AA2: gráfico da DRE em barras", (await page.locator('[data-grafico="dre"] canvas').count()) === 1);
  check("AA2: Dashboard exporta PDF", (await page.locator("[data-exportar-pdf]").count()) === 1);
  await page.screenshot({ path: `${OUT}/v3-dashboard.png`, fullPage: true });
  await page.context().close();
}

await browser.close();
console.log(`\n${ok} ok, ${falha} falha(s)`);
process.exit(falha ? 1 : 0);
