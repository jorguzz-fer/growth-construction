/**
 * Prompt D2 (Fase 3): ação de servidor devolve `{ ok, error }` em vez de lançar.
 * Em produção, o Next esconde a mensagem de erro lançada por uma Server Action
 * (a pessoa vê "An error occurred"); a recusa escrita para ela só chega se
 * voltar como dado. Módulo PURO.
 */
export type Resultado<T = undefined> = { ok: true; dados: T } | { ok: false; error: string };

const GENERICA = "Não foi possível concluir. Tente de novo.";

/**
 * Roda a ação e devolve o resultado. A mensagem de um `Error` comum (as
 * recusas escritas no código) passa; erro de outro tipo (banco, rede) vira a
 * mensagem genérica, e só o tipo vai ao log — nunca o conteúdo.
 */
export async function capturar<T>(fn: () => Promise<T>, rotulo = "acao"): Promise<Resultado<T>> {
  try {
    return { ok: true, dados: await fn() };
  } catch (e) {
    if (e instanceof Error && e.constructor === Error && e.message) return { ok: false, error: e.message };
    console.error(`[${rotulo}] falha:`, e instanceof Error ? e.name : typeof e);
    return { ok: false, error: GENERICA };
  }
}

/** No cliente: o dado do resultado, ou lança a recusa para o `catch` da tela. */
export function dadosOuErro<T>(r: Resultado<T>): T {
  if (!r.ok) throw new Error(r.error);
  return r.dados;
}
