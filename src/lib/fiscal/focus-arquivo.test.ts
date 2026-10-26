import { describe, it, expect, vi, afterEach } from "vitest";
import { baixarArquivoDaNota } from "./focus";

/** Prompt AG, 5.5 — o download do arquivo na Focus. Rede simulada. */
describe("baixarArquivoDaNota", () => {
  const original = { fetch: globalThis.fetch, env: { ...process.env } };
  afterEach(() => {
    globalThis.fetch = original.fetch;
    process.env = { ...original.env };
  });
  const simular = () => {
    const f = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "application/pdf" } }));
    globalThis.fetch = f as unknown as typeof fetch;
    return f;
  };

  it("caminho relativo vai ao host do ambiente, com o token", async () => {
    process.env.FOCUS_NFE_TOKEN_HOMOLOGACAO = "tk";
    const f = simular();
    const r = await baixarArquivoDaNota("homologacao", "/arquivos/x/nota.xml");
    expect(r.bytes).toEqual(new Uint8Array([1, 2, 3]));
    const [url, init] = f.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe("https://homologacao.focusnfe.com.br/arquivos/x/nota.xml");
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^Basic /);
  });

  it("URL de outro host recebe o pedido SEM o token", async () => {
    process.env.FOCUS_NFE_TOKEN_PRODUCAO = "tk";
    const f = simular();
    await baixarArquivoDaNota("producao", "https://prefeitura.exemplo.gov.br/danfse.pdf");
    const [, init] = f.mock.calls[0] as unknown as [URL, RequestInit];
    expect(init.headers).toEqual({});
  });

  it("recusa http, //host e caminho sem barra; erro HTTP e arquivo vazio viram erro", async () => {
    simular();
    await expect(baixarArquivoDaNota("homologacao", "http://x/a.pdf")).rejects.toThrow();
    await expect(baixarArquivoDaNota("homologacao", "//evil.com/a.pdf")).rejects.toThrow();
    await expect(baixarArquivoDaNota("homologacao", "javascript:alert(1)")).rejects.toThrow();
    globalThis.fetch = (async () => new Response("x", { status: 404 })) as unknown as typeof fetch;
    await expect(baixarArquivoDaNota("homologacao", "/a.pdf")).rejects.toThrow("404");
    globalThis.fetch = (async () => new Response(new Uint8Array(), { status: 200 })) as unknown as typeof fetch;
    await expect(baixarArquivoDaNota("homologacao", "/a.pdf")).rejects.toThrow("vazio");
  });
});
