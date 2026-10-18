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
  await page.context().close();
}

await browser.close();
console.log(`\n${ok} ok, ${falha} falha(s)`);
process.exit(falha ? 1 : 0);
