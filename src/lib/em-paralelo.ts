/** Executa `fn` sobre os itens com no máximo `n` ao mesmo tempo (Prompt AO, 4.4). Módulo puro. */
export async function emParalelo<T>(itens: readonly T[], n: number, fn: (item: T, i: number) => Promise<void>): Promise<void> {
  let proximo = 0;
  const trabalhador = async () => {
    while (proximo < itens.length) {
      const i = proximo++;
      await fn(itens[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, itens.length) }, trabalhador));
}
