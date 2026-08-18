/**
 * E2E da BAIXA em Contas a Receber, no navegador de verdade.
 *
 * Diferente da varredura em `scripts/varredura-baixa-receber.ts` (que prova o
 * efeito no banco), este teste exercita o caminho REAL: tela → Server Action →
 * banco → re-render. É o que garante que o botão existe, que a validação chega
 * ao usuário e que o estorno funciona pela interface.
 *
 * Requer a app rodando em http://localhost:3300 com o seed aplicado.
 *   node scripts/e2e/baixa-receber.mjs
 */
import { chromium } from "playwright";

const BASE = "http://localhost:3300";
// Marca única por execução: sem isso, uma rodada anterior deixa uma conta com o
// mesmo nome e o teste passa a mirar a linha errada.
const TAG = `E2E BAIXA ${Date.now()}`;
let ok = 0, falha = 0;
const check = (nome, cond, detalhe = "") => {
  console.log(`[${cond ? "  OK  " : " FALHA"}] ${nome}${detalhe ? " — " + detalhe : ""}`);
  if (cond) ok++; else falha++;
};

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });

// ── login ────────────────────────────────────────────────────────────────
await page.goto(`${BASE}/login`);
await page.fill('input[type="email"]', "admin@rmv.com.br");
await page.fill('input[type="password"]', "Trocar@2026");
await page.click('button[type="submit"]');
await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20000 });
check("Login", true);

// ── cria uma conta a receber de R$ 10.000 ────────────────────────────────
await page.goto(`${BASE}/contasreceber`);
await page.waitForLoadState("networkidle");
check("Tela de Contas a Receber abre", await page.locator("h1").first().isVisible());

const novaCard = page.locator('form:has(button:text-is("Adicionar"))').first();
// MoneyInput é um acumulador de CENTAVOS: "1000000" digita R$ 10.000,00.
await novaCard.locator('input[placeholder="0,00"]').first().fill("1000000");
const vencNova = novaCard.locator('input[placeholder="dd/mm/aaaa"]').first();
await vencNova.fill("10/03/2026");
await vencNova.blur();
await novaCard.locator('input[placeholder="Opcional"]').first().fill(TAG);
await novaCard.locator('button:text-is("Adicionar")').click();
await page.waitForLoadState("networkidle");
await page.waitForTimeout(600);

const linha = page.locator(`tr:has-text("${TAG}")`).first();
check("A conta criada aparece na listagem", await linha.isVisible());

// ── colunas novas ────────────────────────────────────────────────────────
for (const col of ["Recebido", "Saldo"]) {
  check(`Coluna "${col}" existe no cabeçalho`, await page.locator(`th:has-text("${col}")`).first().isVisible());
}
check(
  "Saldo em aberto aparece na linha (10.000)",
  (await linha.innerText()).includes("10.000"),
  (await linha.innerText()).replace(/\s+/g, " ").slice(0, 120),
);

// ── abre o painel de baixa ───────────────────────────────────────────────
await linha.locator('button:text-is("Dar baixa")').click();
const modal = page.locator("div.fixed.inset-0").first();
await modal.waitFor({ state: "visible", timeout: 5000 });
check("Painel de baixa abre", await modal.isVisible());
const txtModal = await modal.innerText();
const upper = (t) => t.toUpperCase();
check("Painel mostra o valor da conta", upper(txtModal).includes("VALOR DA CONTA"));
check("Painel mostra o saldo em aberto", upper(txtModal).includes("SALDO EM ABERTO"));
check(
  "Painel avisa que a baixa NÃO lança receita (RG-01)",
  txtModal.includes("não lança receita"),
  txtModal.split("\n").find((l) => l.includes("não lança receita"))?.slice(0, 90) ?? "",
);

// ── validação: valor acima do saldo é recusado ───────────────────────────
const campoValor = modal.locator('input[placeholder="0,00"]').first();
await campoValor.fill("1500000"); // R$ 15.000 — acima do saldo
await page.waitForTimeout(200);
const btnConfirmar = modal.locator('button:has-text("Confirmar recebimento")');
check("Botão de confirmar fica desabilitado com valor acima do saldo", await btnConfirmar.isDisabled());

// ── baixa parcial de R$ 4.000 ────────────────────────────────────────────
await campoValor.fill("400000"); // R$ 4.000 — dentro do saldo
await page.waitForTimeout(200);
check("Botão volta a habilitar com valor dentro do saldo", await btnConfirmar.isEnabled());
check(
  "Painel prevê que a conta ficará parcialmente recebida",
  (await modal.innerText()).includes("parcialmente recebida"),
);
await btnConfirmar.click();
await page.waitForLoadState("networkidle");
await page.waitForTimeout(1200);

const linha2 = page.locator(`tr:has-text("${TAG}")`).first();
const t2 = (await linha2.innerText()).replace(/\s+/g, " ");
check("Status vira 'Parcialmente recebido'", t2.includes("Parcialmente recebido"), t2.slice(0, 140));
check("Selo 'Baixa manual' aparece na linha", t2.includes("Baixa manual"), t2.slice(0, 140));
check("Coluna Recebido mostra 4.000", t2.includes("4.000"), t2.slice(0, 140));
check("Coluna Saldo mostra 6.000", t2.includes("6.000"), t2.slice(0, 140));

// ── o recebimento chegou ao Caixa Diário ─────────────────────────────────
await page.goto(`${BASE}/caixa`);
await page.waitForLoadState("networkidle");
const caixaTxt = await page.locator("body").innerText();
check(
  "O recebimento aparece no Caixa Diário",
  caixaTxt.includes(TAG),
  "descrição do movimento encontrada",
);

// ── baixa do saldo restante fecha a conta ────────────────────────────────
await page.goto(`${BASE}/contasreceber`);
await page.waitForLoadState("networkidle");
const linha3 = page.locator(`tr:has-text("${TAG}")`).first();
await linha3.locator('button:text-is("Dar baixa")').click();
const modal2 = page.locator("div.fixed.inset-0").first();
await modal2.waitFor({ state: "visible", timeout: 5000 });
const sugerido = await modal2.locator('input[placeholder="0,00"]').first().inputValue();
check(
  "Ao reabrir, o painel sugere o saldo restante (6.000,00)",
  sugerido.replace(/\./g, "") === "6000,00",
  sugerido,
);
check(
  "Painel lista o recebimento já registrado",
  (await modal2.innerText()).toUpperCase().includes("RECEBIMENTOS REGISTRADOS"),
);
await modal2.locator('button:has-text("Confirmar recebimento")').click();
await page.waitForLoadState("networkidle");
await page.waitForTimeout(1200);

const linha4 = page.locator(`tr:has-text("${TAG}")`).first();
const t4 = (await linha4.innerText()).replace(/\s+/g, " ");
check("Conta fecha como 'Recebido'", /Recebido(?!s)/.test(t4) && !t4.includes("Parcialmente"), t4.slice(0, 140));
check("Botão vira 'Recebimentos' quando não há saldo", await linha4.locator('button:text-is("Recebimentos")').isVisible());

// ── estorno pela interface ───────────────────────────────────────────────
await linha4.locator('button:text-is("Recebimentos")').click();
const modal3 = page.locator("div.fixed.inset-0").first();
await modal3.waitFor({ state: "visible", timeout: 5000 });
const txt3 = await modal3.innerText();
check("Painel avisa que a conta já está totalmente recebida", txt3.includes("já está totalmente recebida"));
check("Painel lista as duas baixas", (await modal3.locator('button:text-is("Estornar")').count()) === 2,
  `${await modal3.locator('button:text-is("Estornar")').count()} botão(ões) de estorno`);

await modal3.locator('button:text-is("Estornar")').last().click();
await page.waitForLoadState("networkidle");
await page.waitForTimeout(1200);
const linha5 = page.locator(`tr:has-text("${TAG}")`).first();
const t5 = (await linha5.innerText()).replace(/\s+/g, " ");
check("Estorno devolve a conta a 'Parcialmente recebido'", t5.includes("Parcialmente recebido"), t5.slice(0, 140));
check("Saldo volta a 6.000 após o estorno", t5.includes("6.000"), t5.slice(0, 140));

// ── o estorno também removeu o movimento do caixa ────────────────────────
await page.goto(`${BASE}/caixa`);
await page.waitForLoadState("networkidle");
const ocorrencias = (await page.locator("body").innerText()).split(TAG).length - 1;
check("Sobrou apenas 1 movimento no caixa após o estorno", ocorrencias === 1, `${ocorrencias} ocorrência(s)`);

console.log(`\n=== E2E BAIXA: ${ok} OK · ${falha} FALHA(S) ===`);
await browser.close();
process.exit(falha === 0 ? 0 : 1);
