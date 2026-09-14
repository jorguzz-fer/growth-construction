# TELA-ponto — código na íntegra

Coleta do código da tela **Controle de Ponto da Obra** (`/ponto`), em `main`
(commit `45f4ce3`). Sem resumo, sem análise.

**Árvore de dependências própria (recursiva):**

```
ponto/page.tsx
├── components/app/page-header.tsx
├── components/app/access-denied.tsx
│   └── components/app/page-header.tsx        (já listado)
└── components/app/ponto-manager.tsx
    ├── PontoManager    — casca e empilhamento dos blocos     (43–63)
    ├── RegistroPonto   — bater ponto (geolocalização)        (67–145)
    ├── ConfigObra      — localização e raio da obra         (149–227)
    ├── Apuracao        — apuração → conta a pagar           (231–313)
    └── Historico       — últimos registros                  (317–371)

Arquivo único; não importa nenhum outro componente próprio. As demais
importações são primitivas de UI (card, button, input, badge, table) e `utils`.

queries.ts:  NENHUMA — a página consulta o banco direto (ver seção 3)
actions:     updateObraLocation, registrarPonto, gerarContaPagarPonto
             — as TRÊS únicas de ponto no repositório
```

---

## 1. Página

### `src/app/(app)/ponto/page.tsx`

```tsx
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/app/page-header";
import { AccessDenied } from "@/components/app/access-denied";
import { PontoManager } from "@/components/app/ponto-manager";

export const dynamic = "force-dynamic";

export default async function PontoPage() {
  const ctx = await getActiveContext();
  if (!ctx) return null;
  if (!can(ctx.perms, "ponto", "ver")) return <AccessDenied />;

  const obras = ctx.projects
    .filter((p) => p.kind === "proj")
    .map((p) => ({
      id: p.id,
      nome: p.name,
      endereco: p.endereco ?? null,
      latitude: p.latitude != null ? String(p.latitude) : null,
      longitude: p.longitude != null ? String(p.longitude) : null,
      raio: p.pontoRaioMetros ?? 100,
    }));

  const rows = await db
    .select({
      e: schema.timeEntries,
      projectName: schema.projects.name,
    })
    .from(schema.timeEntries)
    .innerJoin(schema.projects, eq(schema.timeEntries.projectId, schema.projects.id))
    .where(eq(schema.timeEntries.tenantId, ctx.tenant.id))
    .orderBy(desc(schema.timeEntries.serverAt))
    .limit(300);

  const entries = rows.map((r) => ({
    id: r.e.id,
    projectId: r.e.projectId,
    projectName: r.projectName,
    funcionario: r.e.funcionario,
    tipo: r.e.tipo,
    data: r.e.data,
    hora: r.e.hora,
    distanciaMetros: r.e.distanciaMetros,
    dentroRaio: r.e.dentroRaio,
    temDespesa: r.e.despesaId != null,
  }));

  return (
    <>
      <PageHeader
        eyebrow={ctx.tenant.name}
        title="Controle de Ponto da Obra"
        subtitle="Registro georreferenciado de entrada/saída com validação de raio; apuração por período gera conta a pagar."
      />
      {obras.length === 0 ? (
        <p className="text-[13px] text-[var(--color-ink3)]">
          Cadastre ao menos uma obra (projeto) para usar o controle de ponto.
        </p>
      ) : (
        <PontoManager
          obras={obras}
          entries={entries}
          canConfig={can(ctx.perms, "ponto", "editar")}
        />
      )}
    </>
  );
}
```

---

## 2. Componentes próprios (recursivo)

### `src/components/app/page-header.tsx`

```tsx
import * as React from "react";

export function PageHeader({
  title,
  actions,
}: {
  /** Mantidos por compatibilidade; ocultados por ora para um visual mais clean. */
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <h1 className="font-[family-name:var(--font-serif)] text-2xl text-[var(--color-ink)]">
        {title}
      </h1>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
```

### `src/components/app/access-denied.tsx`

Importa `page-header.tsx`, já listado acima.

```tsx
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";

export function AccessDenied() {
  return (
    <>
      <PageHeader title="Acesso negado" />
      <Card>
        <CardContent className="flex flex-col items-center gap-2 p-12 text-center">
          <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.2em] text-[var(--color-ink4)]">
            Sem permissão
          </span>
          <p className="text-sm text-[var(--color-ink3)]">
            Você não tem permissão de <strong>Ver</strong> esta tela. Fale com um
            administrador em Gestão de Acessos.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
```

### `src/components/app/ponto-manager.tsx`

Arquivo único com os cinco componentes da tela.

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  registrarPonto,
  updateObraLocation,
  gerarContaPagarPonto,
} from "@/lib/actions/ponto";
import { brl } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

export interface ObraOpt {
  id: string;
  nome: string;
  endereco: string | null;
  latitude: string | null;
  longitude: string | null;
  raio: number;
}
export interface PontoEntry {
  id: string;
  projectId: string;
  projectName: string;
  funcionario: string | null;
  tipo: string;
  data: string;
  hora: string;
  distanciaMetros: number | null;
  dentroRaio: boolean;
  temDespesa: boolean;
}

const dateBRfromInternal = (d: string) => {
  const p = d.split("/");
  return p.length === 3 ? `${p[1]}/${p[0]}/${p[2]}` : d;
};

export function PontoManager({
  obras,
  entries,
  canConfig,
}: {
  obras: ObraOpt[];
  entries: PontoEntry[];
  canConfig: boolean;
}) {
  const router = useRouter();
  const [start] = useTransition();
  void start;
  return (
    <div className="space-y-6">
      <RegistroPonto obras={obras} router={router} />
      {canConfig && <ConfigObra obras={obras} router={router} />}
      {canConfig && <Apuracao obras={obras} entries={entries} router={router} />}
      <Historico entries={entries} />
    </div>
  );
}

/* ─────────────────────── Registro (funcionário) ─────────────────────────── */

function RegistroPonto({ obras, router }: { obras: ObraOpt[]; router: ReturnType<typeof useRouter> }) {
  const [projectId, setProjectId] = useState(obras[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const registrar = (tipo: "entrada" | "saida") => {
    setMsg(null);
    setErro(null);
    if (!projectId) return setErro("Selecione a obra.");
    if (!("geolocation" in navigator)) return setErro("Geolocalização não disponível neste dispositivo.");
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await registrarPonto({
            projectId,
            tipo,
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            precisaoMetros: pos.coords.accuracy,
            dispositivo: navigator.userAgent.slice(0, 120),
          });
          if (res.ok) {
            setMsg(res.message);
            router.refresh();
          } else {
            setErro(res.message);
          }
        } catch (e) {
          setErro(e instanceof Error ? e.message : "Falha ao registrar ponto.");
        } finally {
          setBusy(false);
        }
      },
      (err) => {
        setBusy(false);
        setErro(
          err.code === err.PERMISSION_DENIED
            ? "Permissão de localização negada. Autorize o acesso à localização para registrar o ponto."
            : "Não foi possível obter sua localização.",
        );
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  return (
    <Card>
      <CardContent className="p-5">
        <h2 className="mb-1 text-sm font-semibold text-[var(--color-ink)]">Registrar ponto</h2>
        <p className="mb-3 text-[12px] text-[var(--color-ink3)]">
          O registro só é aceito dentro do raio permitido da obra. A data e a hora são do servidor.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px]">
            <Label>Obra</Label>
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              {obras.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nome}
                  {o.latitude == null ? " (sem localização)" : ""}
                </option>
              ))}
            </Select>
          </div>
          <Button disabled={busy} onClick={() => registrar("entrada")}>
            {busy ? "Registrando…" : "↓ Registrar entrada"}
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => registrar("saida")}>
            ↑ Registrar saída
          </Button>
        </div>
        {msg && <p className="mt-2 text-xs text-[var(--color-success)]">{msg}</p>}
        {erro && <p className="mt-2 text-xs text-[var(--color-danger)]">{erro}</p>}
      </CardContent>
    </Card>
  );
}

/* ─────────────────────── Config da obra (gestor) ────────────────────────── */

function ConfigObra({ obras, router }: { obras: ObraOpt[]; router: ReturnType<typeof useRouter> }) {
  const [projectId, setProjectId] = useState(obras[0]?.id ?? "");
  const obra = obras.find((o) => o.id === projectId);
  const [endereco, setEndereco] = useState(obra?.endereco ?? "");
  const [lat, setLat] = useState(obra?.latitude ?? "");
  const [lng, setLng] = useState(obra?.longitude ?? "");
  const [raio, setRaio] = useState(String(obra?.raio ?? 100));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const trocar = (id: string) => {
    setProjectId(id);
    const o = obras.find((x) => x.id === id);
    setEndereco(o?.endereco ?? "");
    setLat(o?.latitude ?? "");
    setLng(o?.longitude ?? "");
    setRaio(String(o?.raio ?? 100));
    setMsg(null);
  };

  const usarMinha = () => {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      setLat(pos.coords.latitude.toFixed(7));
      setLng(pos.coords.longitude.toFixed(7));
    });
  };

  const salvar = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await updateObraLocation(projectId, {
        endereco,
        latitude: lat,
        longitude: lng,
        raio: Number(raio) || 100,
      });
      setMsg("Localização da obra salva.");
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardContent className="p-5">
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-ink)]">Localização da obra (gestor)</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <Label>Obra</Label>
            <Select value={projectId} onChange={(e) => trocar(e.target.value)}>
              {obras.map((o) => (
                <option key={o.id} value={o.id}>{o.nome}</option>
              ))}
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>Endereço</Label>
            <Input value={endereco} onChange={(e) => setEndereco(e.target.value)} />
          </div>
          <div><Label>Latitude</Label><Input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="-23.5" /></div>
          <div><Label>Longitude</Label><Input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="-46.6" /></div>
          <div><Label>Raio (metros)</Label><Input type="number" min={10} value={raio} onChange={(e) => setRaio(e.target.value)} /></div>
          <div className="flex items-end gap-2">
            <Button variant="outline" onClick={usarMinha} type="button">Usar minha localização</Button>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Button disabled={busy} onClick={salvar}>Salvar localização</Button>
          {msg && <span className="text-xs text-[var(--color-ink3)]">{msg}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

/* ─────────────────────── Apuração → conta a pagar ───────────────────────── */

function Apuracao({
  obras,
  entries,
  router,
}: {
  obras: ObraOpt[];
  entries: PontoEntry[];
  router: ReturnType<typeof useRouter>;
}) {
  const [projectId, setProjectId] = useState(obras[0]?.id ?? "");
  const [funcionario, setFuncionario] = useState("");
  const [valorDiaria, setValorDiaria] = useState("");
  const [competencia, setCompetencia] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const funcionarios = [
    ...new Set(entries.filter((e) => e.projectId === projectId && e.funcionario).map((e) => e.funcionario as string)),
  ];
  const elegiveis = entries.filter(
    (e) => e.projectId === projectId && e.funcionario === funcionario && e.tipo === "entrada" && !e.temDespesa,
  );
  const dias = new Set(elegiveis.map((e) => e.data)).size;
  const total = dias * (Number(valorDiaria) || 0);

  const gerar = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await gerarContaPagarPonto({
        projectId,
        funcionario,
        entryIds: elegiveis.map((e) => e.id),
        valorDiaria: Number(valorDiaria) || 0,
        competencia,
      });
      setMsg("Conta a pagar gerada com sucesso.");
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao gerar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardContent className="p-5">
        <h2 className="mb-1 text-sm font-semibold text-[var(--color-ink)]">Apuração → conta a pagar</h2>
        <p className="mb-3 text-[12px] text-[var(--color-ink3)]">
          Gera uma conta a pagar pelos dias trabalhados (não apurados) do funcionário na obra.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div>
            <Label>Obra</Label>
            <Select value={projectId} onChange={(e) => { setProjectId(e.target.value); setFuncionario(""); }}>
              {obras.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
            </Select>
          </div>
          <div>
            <Label>Funcionário</Label>
            <Select value={funcionario} onChange={(e) => setFuncionario(e.target.value)}>
              <option value="">Selecione…</option>
              {funcionarios.map((f) => <option key={f} value={f}>{f}</option>)}
            </Select>
          </div>
          <div><Label>Valor da diária</Label><Input type="number" step="0.01" value={valorDiaria} onChange={(e) => setValorDiaria(e.target.value)} /></div>
          <div><Label>Competência (MM/AAAA)</Label><Input value={competencia} onChange={(e) => setCompetencia(e.target.value)} placeholder="08/2026" /></div>
          <div className="flex items-end">
            <Button disabled={busy || !funcionario || dias === 0} onClick={gerar} className="w-full">
              Gerar ({dias} dia{dias === 1 ? "" : "s"})
            </Button>
          </div>
        </div>
        <p className="mt-2 text-[12px] text-[var(--color-ink3)]">
          Dias elegíveis: <strong>{dias}</strong> · valor previsto:{" "}
          <strong className="text-[var(--color-accent)]">{brl(total)}</strong>
          {msg && <span className="ml-3 text-[var(--color-ink2)]">{msg}</span>}
        </p>
      </CardContent>
    </Card>
  );
}

/* ─────────────────────── Histórico ──────────────────────────────────────── */

function Historico({ entries }: { entries: PontoEntry[] }) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="tbl-scroll overflow-x-auto">
          <Table>
            <THead>
              <tr>
                <TH>Data</TH>
                <TH>Hora</TH>
                <TH>Obra</TH>
                <TH>Funcionário</TH>
                <TH>Tipo</TH>
                <TH className="text-right">Distância</TH>
                <TH>Geofence</TH>
                <TH>Apurado</TH>
              </tr>
            </THead>
            <tbody>
              {entries.map((e) => (
                <TR key={e.id}>
                  <TD className="whitespace-nowrap font-[family-name:var(--font-mono)]">{dateBRfromInternal(e.data)}</TD>
                  <TD className="font-[family-name:var(--font-mono)]">{e.hora}</TD>
                  <TD className="whitespace-nowrap">{e.projectName}</TD>
                  <TD className="text-[var(--color-ink3)]">{e.funcionario ?? "—"}</TD>
                  <TD>
                    <Badge tone={e.tipo === "entrada" ? "success" : "neutral"}>
                      {e.tipo === "entrada" ? "Entrada" : "Saída"}
                    </Badge>
                  </TD>
                  <TD className="text-right font-[family-name:var(--font-mono)]">
                    {e.distanciaMetros != null ? `${e.distanciaMetros} m` : "—"}
                  </TD>
                  <TD>
                    <Badge tone={e.dentroRaio ? "success" : "danger"}>
                      {e.dentroRaio ? "no raio" : "fora"}
                    </Badge>
                  </TD>
                  <TD>{e.temDespesa ? <Badge tone="info">sim</Badge> : "—"}</TD>
                </TR>
              ))}
              {entries.length === 0 && (
                <TR>
                  <TD colSpan={8} className="py-8 text-center text-[var(--color-ink4)]">
                    Nenhum registro de ponto ainda.
                  </TD>
                </TR>
              )}
            </tbody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
```

---

## 3. Funções de `queries.ts` chamadas pela página


**Nenhuma.** A página não importa `@/lib/queries` — importa `db` e `schema`
diretamente (`page.tsx:1–2`) e monta a consulta inline
(`page.tsx:27–36`). É a única das telas coletadas até aqui que faz isso.

A lista de obras também não vem de query: sai de `ctx.projects`, filtrado por
`kind === "proj"` (`page.tsx:16–25`).

A consulta inline:

- filtra por `tenant_id` apenas — **não** por projeto nem por período;
- faz `innerJoin` em `project` só para trazer o nome;
- ordena por `server_at` desc e corta em **300 registros** (`limit(300)`).

Esse corte de 300 importa: é ele que alimenta tanto o histórico quanto o
seletor de funcionários e o cálculo de dias elegíveis da apuração (seções 7 e
8).

### `src/app/(app)/ponto/page.tsx` · linhas 27–49

A consulta inline e a projeção enviada ao componente.

```tsx
  const rows = await db
    .select({
      e: schema.timeEntries,
      projectName: schema.projects.name,
    })
    .from(schema.timeEntries)
    .innerJoin(schema.projects, eq(schema.timeEntries.projectId, schema.projects.id))
    .where(eq(schema.timeEntries.tenantId, ctx.tenant.id))
    .orderBy(desc(schema.timeEntries.serverAt))
    .limit(300);

  const entries = rows.map((r) => ({
    id: r.e.id,
    projectId: r.e.projectId,
    projectName: r.projectName,
    funcionario: r.e.funcionario,
    tipo: r.e.tipo,
    data: r.e.data,
    hora: r.e.hora,
    distanciaMetros: r.e.distanciaMetros,
    dentroRaio: r.e.dentroRaio,
    temDespesa: r.e.despesaId != null,
  }));
```

---

## 4. As Server Actions de ponto


São três, no arquivo inteiro de 225 linhas. Não existe action de **correção**
nem de **exclusão** de registro de ponto: uma batida errada não pode ser
desfeita pela interface.

| Action | Permissão | Sem permissão |
|---|---|---|
| `updateObraLocation` | `ponto:editar` | **lança** `Error` |
| `registrarPonto` | `ponto:criar` | **lança** `Error` |
| `gerarContaPagarPonto` | `ponto:editar` | **lança** `Error` |

As três gravam auditoria (`obra.location.update`, `ponto.registrar`,
`ponto.gerar_conta`).

### `src/lib/actions/ponto.ts`

```ts
"use server";

import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { getActiveContext } from "@/lib/context";
import { getAtualVersion } from "@/lib/queries";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { reserveDespesaNumber } from "@/lib/db/numbering";

/** Distância entre dois pontos (graus) em metros — fórmula de haversine. */
function haversineMetros(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/** Cadastra/atualiza a localização e o raio permitido de uma obra. */
export async function updateObraLocation(
  projectId: string,
  patch: { endereco?: string | null; latitude?: string; longitude?: string; raio?: number },
) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "ponto", "editar")) {
    throw new Error("Sem permissão para configurar a obra.");
  }
  if (!ctx.projects.some((p) => p.id === projectId)) return;
  const set: Partial<typeof schema.projects.$inferInsert> = {};
  if (patch.endereco !== undefined) set.endereco = patch.endereco?.trim() || null;
  if (patch.latitude !== undefined)
    set.latitude = patch.latitude?.toString().trim() ? patch.latitude : null;
  if (patch.longitude !== undefined)
    set.longitude = patch.longitude?.toString().trim() ? patch.longitude : null;
  if (patch.raio !== undefined)
    set.pontoRaioMetros = Number.isFinite(patch.raio) && patch.raio! > 0 ? Math.round(patch.raio!) : 100;
  if (Object.keys(set).length === 0) return;
  await db.update(schema.projects).set(set).where(eq(schema.projects.id, projectId));
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "obra.location.update",
    entity: "project",
    entityId: projectId,
    meta: set,
  });
  revalidatePath("/ponto");
}

export interface RegistrarPontoInput {
  projectId: string;
  tipo: "entrada" | "saida";
  latitude: number;
  longitude: number;
  precisaoMetros?: number;
  dispositivo?: string;
  justificativa?: string;
}

export interface RegistrarPontoResult {
  ok: boolean;
  distanciaMetros: number | null;
  raio: number;
  dentroRaio: boolean;
  message: string;
}

/**
 * Registra entrada/saída de ponto. Usa o relógio do SERVIDOR (não confia no
 * dispositivo) e valida o geofence: só aceita dentro do raio permitido, salvo
 * quando um gestor (permissão de editar) informa justificativa.
 */
export async function registrarPonto(
  input: RegistrarPontoInput,
): Promise<RegistrarPontoResult> {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "ponto", "criar")) {
    throw new Error("Sem permissão para registrar ponto.");
  }
  const [obra] = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, input.projectId), eq(schema.projects.tenantId, ctx.tenant.id)))
    .limit(1);
  if (!obra) throw new Error("Obra não encontrada.");

  const raio = obra.pontoRaioMetros ?? 100;
  let distancia: number | null = null;
  if (obra.latitude != null && obra.longitude != null) {
    distancia = haversineMetros(
      Number(obra.latitude),
      Number(obra.longitude),
      input.latitude,
      input.longitude,
    );
  }
  const dentroRaio = distancia != null && distancia <= raio;
  const podeForcar = can(ctx.perms, "ponto", "editar"); // gestor
  const justificativa = input.justificativa?.trim() || null;

  if (obra.latitude == null || obra.longitude == null) {
    throw new Error("A obra ainda não tem localização cadastrada. Peça ao gestor para configurar.");
  }
  if (!dentroRaio && !(podeForcar && justificativa)) {
    return {
      ok: false,
      distanciaMetros: distancia,
      raio,
      dentroRaio: false,
      message: `Você está a ${distancia} m da obra (limite ${raio} m). Aproxime-se para registrar o ponto.`,
    };
  }

  const now = new Date();
  const data = `${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")}/${now.getFullYear()}`;
  const hora = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  await db.insert(schema.timeEntries).values({
    tenantId: ctx.tenant.id,
    projectId: input.projectId,
    userId: ctx.userId,
    funcionario: ctx.userEmail || ctx.userId || null,
    tipo: input.tipo,
    data,
    hora,
    latitude: String(input.latitude),
    longitude: String(input.longitude),
    precisaoMetros: input.precisaoMetros != null ? Math.round(input.precisaoMetros) : null,
    distanciaMetros: distancia,
    dentroRaio,
    dispositivo: input.dispositivo || null,
    justificativa: !dentroRaio ? justificativa : null,
  });
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "ponto.registrar",
    entity: "time_entry",
    entityId: input.projectId,
    meta: { tipo: input.tipo, data, hora, distancia, dentroRaio },
  });
  revalidatePath("/ponto");
  return {
    ok: true,
    distanciaMetros: distancia,
    raio,
    dentroRaio,
    message: `Ponto de ${input.tipo} registrado às ${hora} (${data}).`,
  };
}

/**
 * Apura os dias trabalhados de um funcionário numa obra e gera UMA conta a
 * pagar (despesa) com o valor previsto. Evita gerar em duplicidade marcando os
 * registros já vinculados a uma despesa.
 */
export async function gerarContaPagarPonto(input: {
  projectId: string;
  funcionario: string;
  entryIds: string[];
  valorDiaria: number;
  competencia: string; // "MM/YYYY"
}) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "ponto", "editar")) {
    throw new Error("Sem permissão para gerar contas a pagar do ponto.");
  }
  const version = await getAtualVersion(ctx.tenant.id, input.projectId);
  if (!version) throw new Error("Projeto sem versão Atual.");

  // Considera só os registros informados que ainda não geraram despesa.
  const entries = await db
    .select()
    .from(schema.timeEntries)
    .where(and(eq(schema.timeEntries.tenantId, ctx.tenant.id), eq(schema.timeEntries.projectId, input.projectId)))
    .orderBy(asc(schema.timeEntries.data));
  const alvo = entries.filter(
    (e) => input.entryIds.includes(e.id) && !e.despesaId && e.funcionario === input.funcionario,
  );
  // Dias distintos trabalhados (entrada conta como dia).
  const dias = new Set(alvo.filter((e) => e.tipo === "entrada").map((e) => e.data));
  if (dias.size === 0) throw new Error("Nenhum dia elegível para apuração (já apurados ou sem entrada).");
  const valor = dias.size * (input.valorDiaria || 0);

  const numDoc = await reserveDespesaNumber(ctx.tenant.id);
  const [row] = await db
    .insert(schema.despesas)
    .values({
      versionId: version.id,
      tenantId: ctx.tenant.id,
      numDoc,
      competencia: input.competencia || null,
      valor: String(valor),
      status: "A pagar",
      categoriaDre: "Custo Variável",
      obs: `Mão de obra (ponto) · ${input.funcionario} · ${dias.size} dia(s)`,
    })
    .returning();

  // Vincula os registros à despesa gerada (evita gerar de novo).
  for (const e of alvo) {
    await db.update(schema.timeEntries).set({ despesaId: row.id }).where(eq(schema.timeEntries.id, e.id));
  }
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "ponto.gerar_conta",
    entity: "despesa",
    entityId: row.id,
    meta: { funcionario: input.funcionario, dias: dias.size, valor },
  });
  revalidatePath("/ponto");
  revalidatePath("/despesas");
  revalidatePath("/contaspagar");
}
```

---

## 5. `time_entry` e as colunas relacionadas


`time_entry` é a única tabela própria do módulo. Não há tabela de
funcionários, de jornada, de escala nem de justificativas: o que sustenta o
geofence são quatro colunas dentro de `project`, e a saída da apuração é uma
linha em `despesa`.

| Tabela | Papel no módulo |
|---|---|
| `time_entry` | o registro de ponto em si |
| `project.endereco`, `.latitude`, `.longitude`, `.ponto_raio_metros` | o geofence da obra |
| `despesa` | destino da apuração, via `time_entry.despesa_id` (`set null`) |

Como em `stock_movement`, **não há enum**: `tipo` é `text` `notNull` com
`"entrada" | "saida"` só no comentário (`schema.ts:340`). Sem `CHECK`, o
banco aceita qualquer string; a trava é o tipo TypeScript do input da action.

### `src/lib/db/schema.ts` · linhas 325–358

`time_entry`.

```ts
/**
 * Registro de ponto georreferenciado, vinculado à obra. Cada dia trabalhado
 * fica vinculado à obra correspondente (base da apuração → conta a pagar).
 */
export const timeEntries = pgTable("time_entry", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  userId: text("user_id"),
  /** nome/e-mail do funcionário (snapshot). */
  funcionario: text("funcionario"),
  /** "entrada" | "saida" */
  tipo: text("tipo").notNull(),
  /** data ("MM/DD/YYYY") e hora ("HH:MM") pelo relógio do servidor. */
  data: text("data").notNull(),
  hora: text("hora").notNull(),
  serverAt: timestamp("server_at", { mode: "date" }).notNull().defaultNow(),
  latitude: numeric("latitude", { precision: 10, scale: 7 }),
  longitude: numeric("longitude", { precision: 10, scale: 7 }),
  /** precisão informada pelo dispositivo (m) e distância à obra (m). */
  precisaoMetros: integer("precisao_metros"),
  distanciaMetros: integer("distancia_metros"),
  dentroRaio: boolean("dentro_raio").notNull().default(false),
  dispositivo: text("dispositivo"),
  justificativa: text("justificativa"),
  /** despesa (conta a pagar) gerada a partir deste registro, se houver. */
  despesaId: uuid("despesa_id").references(() => despesas.id, {
    onDelete: "set null",
  }),
});
```

### `src/lib/db/schema.ts` · linhas 280–298

As colunas de `project` que o ponto usa — note que `ponto_raio_metros` é `notNull` com default 100, e lat/long são opcionais.

```ts
  // ── Localização da obra (controle de ponto georreferenciado) ────────────
  endereco: text("endereco"),
  latitude: numeric("latitude", { precision: 10, scale: 7 }),
  longitude: numeric("longitude", { precision: 10, scale: 7 }),
  // ── Dados fiscais da obra (emissão de NFS-e) ────────────────────────────
  // Na construção civil o ISS é devido no município da OBRA (LC 116/2003,
  // art. 3º, III), que nem sempre é o da sede. Por isso o município de
  // incidência sai do projeto e não do tenant. Opcionais: projeto que não
  // fatura serviço nunca precisa deles.
  /** código IBGE (7 dígitos) do município onde a obra é executada. */
  codigoMunicipioObra: text("codigo_municipio_obra"),
  municipioObra: text("municipio_obra"),
  ufObra: text("uf_obra"),
  /** matrícula CNO/CEI da obra — vai no campo `codigo_obra` da NFS-e. */
  codigoObra: text("codigo_obra"),
  /** número da ART/RRT do responsável técnico. */
  art: text("art"),
  /** raio permitido para registro de ponto, em metros (padrão 100). */
  pontoRaioMetros: integer("ponto_raio_metros").notNull().default(100),
```

---

## 6. Distância, geofence, e o que acontece fora do raio


### 6.1 A distância

**Haversine**, em `ponto.ts:13–27` — função local do arquivo, não está em
`calc/` e não tem teste. Raio da Terra fixo em 6 371 000 m, resultado
arredondado para metro inteiro. Não considera altitude nem a precisão
informada pelo dispositivo.

A coordenada do funcionário vem do navegador
(`navigator.geolocation.getCurrentPosition`, `ponto-manager.tsx:79`, com
`enableHighAccuracy: true` e timeout de 15 s). A `accuracy` do dispositivo é
enviada e **gravada** em `precisao_metros`, mas **não entra na decisão**: um
registro com precisão de 500 m é tratado como se fosse exato.

### 6.2 O geofence

```ts
const raio = obra.pontoRaioMetros ?? 100;
const dentroRaio = distancia != null && distancia <= raio;
```

(`ponto.ts:97` e `:107`.) Comparação `<=`: exatamente no limite conta como
dentro. O raio é por obra, configurável no `ConfigObra` via
`updateObraLocation`, que força o padrão 100 quando o valor não é finito ou
não é positivo (`ponto.ts:46`).

### 6.3 O que acontece fora do raio: **bloqueia**

Não é só marcação. A action tem duas saídas antes do `insert`:

| Situação | Linha | O que acontece |
|---|---|---|
| Obra sem `latitude`/`longitude` | `ponto.ts:111–113` | **lança** `Error` — "A obra ainda não tem localização cadastrada" |
| Fora do raio, sem poder forçar | `ponto.ts:114–122` | devolve `{ ok: false, message }` e **não grava nada** |

A mensagem devolvida é literal: `"Você está a {distancia} m da obra (limite
{raio} m). Aproxime-se para registrar o ponto."` O cliente a exibe como erro
(`ponto-manager.tsx:94`) e não chama `router.refresh()`.

### 6.4 A exceção — e quem pode usá-la

```ts
const podeForcar = can(ctx.perms, "ponto", "editar"); // gestor
if (!dentroRaio && !(podeForcar && justificativa)) { … }
```

Fora do raio, o registro só passa com **as duas** condições: `ponto:editar`
**e** justificativa não vazia. Nesse caso o registro é gravado com
`dentroRaio: false` e a justificativa preenchida (`ponto.ts:142`) — é aí que
entra a "marcação". Dentro do raio a justificativa é descartada
(`!dentroRaio ? justificativa : null`).

Dois pontos que a revisão deve olhar:

- `ponto:editar` é a **mesma** permissão que configura a localização e o raio
  da obra (`updateObraLocation`, usada pelo `ConfigObra`) e que gera a conta
  a pagar (`gerarContaPagarPonto`). Quem pode forçar um registro fora do
  raio pode também mover a obra, mudar o raio e apurar.
- O `RegistroPonto` **não tem campo de justificativa**: a chamada em
  `ponto-manager.tsx:82–89` não envia `justificativa`. O caminho de exceção
  existe na action e não é alcançável por esta tela.

### `src/lib/actions/ponto.ts` · linhas 12–27

`haversineMetros`.

```ts
/** Distância entre dois pontos (graus) em metros — fórmula de haversine. */
function haversineMetros(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}
```

### `src/lib/actions/ponto.ts` · linhas 90–143

O geofence, o bloqueio e a gravação.

```ts
  const [obra] = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, input.projectId), eq(schema.projects.tenantId, ctx.tenant.id)))
    .limit(1);
  if (!obra) throw new Error("Obra não encontrada.");

  const raio = obra.pontoRaioMetros ?? 100;
  let distancia: number | null = null;
  if (obra.latitude != null && obra.longitude != null) {
    distancia = haversineMetros(
      Number(obra.latitude),
      Number(obra.longitude),
      input.latitude,
      input.longitude,
    );
  }
  const dentroRaio = distancia != null && distancia <= raio;
  const podeForcar = can(ctx.perms, "ponto", "editar"); // gestor
  const justificativa = input.justificativa?.trim() || null;

  if (obra.latitude == null || obra.longitude == null) {
    throw new Error("A obra ainda não tem localização cadastrada. Peça ao gestor para configurar.");
  }
  if (!dentroRaio && !(podeForcar && justificativa)) {
    return {
      ok: false,
      distanciaMetros: distancia,
      raio,
      dentroRaio: false,
      message: `Você está a ${distancia} m da obra (limite ${raio} m). Aproxime-se para registrar o ponto.`,
    };
  }

  const now = new Date();
  const data = `${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")}/${now.getFullYear()}`;
  const hora = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  await db.insert(schema.timeEntries).values({
    tenantId: ctx.tenant.id,
    projectId: input.projectId,
    userId: ctx.userId,
    funcionario: ctx.userEmail || ctx.userId || null,
    tipo: input.tipo,
    data,
    hora,
    latitude: String(input.latitude),
    longitude: String(input.longitude),
    precisaoMetros: input.precisaoMetros != null ? Math.round(input.precisaoMetros) : null,
    distanciaMetros: distancia,
    dentroRaio,
    dispositivo: input.dispositivo || null,
    justificativa: !dentroRaio ? justificativa : null,
  });
```

### `src/components/app/ponto-manager.tsx` · linhas 73–120

O lado do cliente: geolocalização, tratamento do `ok: false` e o texto exibido ao usuário.

```tsx
  const registrar = (tipo: "entrada" | "saida") => {
    setMsg(null);
    setErro(null);
    if (!projectId) return setErro("Selecione a obra.");
    if (!("geolocation" in navigator)) return setErro("Geolocalização não disponível neste dispositivo.");
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await registrarPonto({
            projectId,
            tipo,
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            precisaoMetros: pos.coords.accuracy,
            dispositivo: navigator.userAgent.slice(0, 120),
          });
          if (res.ok) {
            setMsg(res.message);
            router.refresh();
          } else {
            setErro(res.message);
          }
        } catch (e) {
          setErro(e instanceof Error ? e.message : "Falha ao registrar ponto.");
        } finally {
          setBusy(false);
        }
      },
      (err) => {
        setBusy(false);
        setErro(
          err.code === err.PERMISSION_DENIED
            ? "Permissão de localização negada. Autorize o acesso à localização para registrar o ponto."
            : "Não foi possível obter sua localização.",
        );
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  return (
    <Card>
      <CardContent className="p-5">
        <h2 className="mb-1 text-sm font-semibold text-[var(--color-ink)]">Registrar ponto</h2>
        <p className="mb-3 text-[12px] text-[var(--color-ink3)]">
          O registro só é aceito dentro do raio permitido da obra. A data e a hora são do servidor.
        </p>
```

---

## 7. A apuração: dias elegíveis e o que é gravado


### 7.1 "Dias elegíveis" é calculado DUAS vezes, com filtros diferentes

**No cliente** (`ponto-manager.tsx:250–253`), para exibir a prévia e montar o
`entryIds` que será enviado:

```ts
const elegiveis = entries.filter(
  (e) => e.projectId === projectId && e.funcionario === funcionario && e.tipo === "entrada" && !e.temDespesa,
);
const dias = new Set(elegiveis.map((e) => e.data)).size;
```

**No servidor** (`ponto.ts:182–193`), para valer:

```ts
const alvo = entries.filter(
  (e) => input.entryIds.includes(e.id) && !e.despesaId && e.funcionario === input.funcionario,
);
const dias = new Set(alvo.filter((e) => e.tipo === "entrada").map((e) => e.data));
```

Ou seja, **dia elegível = valor distinto da coluna `data`** entre os registros
que satisfazem, cumulativamente: estar na lista `entryIds` enviada, ter
`despesa_id` nulo, ter `funcionario` igual ao informado, e ser `tipo =
"entrada"`. Uma saída nunca cria dia; um dia com duas entradas conta uma vez.
Se o conjunto for vazio, a action **lança** `Error`.

Três consequências que saem direto desses filtros:

- **A jornada não é medida.** Não há pareamento entrada/saída, não há cálculo
  de horas, não há mínimo. Uma entrada às 07h sem saída nenhuma vale um dia
  inteiro, igual a quem ficou o dia todo.
- **Registro fora do raio conta.** Nem o filtro do cliente nem o do servidor
  olham `dentro_raio`. Um ponto forçado por gestor com justificativa entra na
  apuração como qualquer outro.
- **O universo é o das 300 linhas da página.** O `entryIds` vem do cliente,
  montado sobre a consulta com `limit(300)`. Registros mais antigos que esse
  corte não são apurados — e a action **confia no `entryIds` recebido**: ela
  filtra o que chegou, não recalcula o conjunto a partir de um período.

O filtro por projeto merece nota à parte: **o cliente filtra por
`projectId`, o servidor não.** A action busca as entries do projeto
(`ponto.ts:185`) e depois cruza com `entryIds`, então na prática o projeto é
respeitado — mas por onde a query foi feita, não por validação do input.

### 7.2 O que exatamente é gravado

Uma linha em `despesa`, com estes campos e **só** estes
(`ponto.ts:196–208`):

| Campo | Valor |
|---|---|
| `versionId` | a versão **Atual** do projeto (`getAtualVersion`); sem ela, lança `Error` |
| `tenantId` | tenant do contexto |
| `numDoc` | PED novo, de `reserveDespesaNumber` |
| `competencia` | `input.competencia` — **texto livre vindo do formulário**, sem validação |
| `valor` | `dias.size × input.valorDiaria` |
| `status` | `"A pagar"` |
| `categoriaDre` | `"Custo Variável"` — **fixo em código** |
| `obs` | `Mão de obra (ponto) · {funcionario} · {n} dia(s)` |

O que **não** é gravado: `fornecedorId` (fica nulo — o funcionário existe
apenas como texto dentro de `obs`), `vencimento`, `dataCaixa`, `contaCef`,
`formaPagamento`. A despesa nasce sem vencimento e sem fornecedor vinculado.

Em seguida, cada registro de `alvo` recebe `despesa_id` num `UPDATE` por vez
(`ponto.ts:211–213`). Repare que **`alvo` inclui as saídas**: elas não contam
como dia, mas são marcadas como apuradas junto. É isso que impede a
reapuração.

Nada disso está em transação: o `insert` da despesa e os `update` dos
registros são chamadas soltas.

### `src/lib/actions/ponto.ts` · linhas 162–225

`gerarContaPagarPonto` inteira.

```ts
/**
 * Apura os dias trabalhados de um funcionário numa obra e gera UMA conta a
 * pagar (despesa) com o valor previsto. Evita gerar em duplicidade marcando os
 * registros já vinculados a uma despesa.
 */
export async function gerarContaPagarPonto(input: {
  projectId: string;
  funcionario: string;
  entryIds: string[];
  valorDiaria: number;
  competencia: string; // "MM/YYYY"
}) {
  const ctx = await getActiveContext();
  if (!ctx || !can(ctx.perms, "ponto", "editar")) {
    throw new Error("Sem permissão para gerar contas a pagar do ponto.");
  }
  const version = await getAtualVersion(ctx.tenant.id, input.projectId);
  if (!version) throw new Error("Projeto sem versão Atual.");

  // Considera só os registros informados que ainda não geraram despesa.
  const entries = await db
    .select()
    .from(schema.timeEntries)
    .where(and(eq(schema.timeEntries.tenantId, ctx.tenant.id), eq(schema.timeEntries.projectId, input.projectId)))
    .orderBy(asc(schema.timeEntries.data));
  const alvo = entries.filter(
    (e) => input.entryIds.includes(e.id) && !e.despesaId && e.funcionario === input.funcionario,
  );
  // Dias distintos trabalhados (entrada conta como dia).
  const dias = new Set(alvo.filter((e) => e.tipo === "entrada").map((e) => e.data));
  if (dias.size === 0) throw new Error("Nenhum dia elegível para apuração (já apurados ou sem entrada).");
  const valor = dias.size * (input.valorDiaria || 0);

  const numDoc = await reserveDespesaNumber(ctx.tenant.id);
  const [row] = await db
    .insert(schema.despesas)
    .values({
      versionId: version.id,
      tenantId: ctx.tenant.id,
      numDoc,
      competencia: input.competencia || null,
      valor: String(valor),
      status: "A pagar",
      categoriaDre: "Custo Variável",
      obs: `Mão de obra (ponto) · ${input.funcionario} · ${dias.size} dia(s)`,
    })
    .returning();

  // Vincula os registros à despesa gerada (evita gerar de novo).
  for (const e of alvo) {
    await db.update(schema.timeEntries).set({ despesaId: row.id }).where(eq(schema.timeEntries.id, e.id));
  }
  await logAudit({
    tenantId: ctx.tenant.id,
    userId: ctx.userId,
    action: "ponto.gerar_conta",
    entity: "despesa",
    entityId: row.id,
    meta: { funcionario: input.funcionario, dias: dias.size, valor },
  });
  revalidatePath("/ponto");
  revalidatePath("/despesas");
  revalidatePath("/contaspagar");
}
```

### `src/components/app/ponto-manager.tsx` · linhas 231–313

O componente `Apuracao` inteiro — a prévia no cliente e o envio.

```tsx
function Apuracao({
  obras,
  entries,
  router,
}: {
  obras: ObraOpt[];
  entries: PontoEntry[];
  router: ReturnType<typeof useRouter>;
}) {
  const [projectId, setProjectId] = useState(obras[0]?.id ?? "");
  const [funcionario, setFuncionario] = useState("");
  const [valorDiaria, setValorDiaria] = useState("");
  const [competencia, setCompetencia] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const funcionarios = [
    ...new Set(entries.filter((e) => e.projectId === projectId && e.funcionario).map((e) => e.funcionario as string)),
  ];
  const elegiveis = entries.filter(
    (e) => e.projectId === projectId && e.funcionario === funcionario && e.tipo === "entrada" && !e.temDespesa,
  );
  const dias = new Set(elegiveis.map((e) => e.data)).size;
  const total = dias * (Number(valorDiaria) || 0);

  const gerar = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await gerarContaPagarPonto({
        projectId,
        funcionario,
        entryIds: elegiveis.map((e) => e.id),
        valorDiaria: Number(valorDiaria) || 0,
        competencia,
      });
      setMsg("Conta a pagar gerada com sucesso.");
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao gerar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardContent className="p-5">
        <h2 className="mb-1 text-sm font-semibold text-[var(--color-ink)]">Apuração → conta a pagar</h2>
        <p className="mb-3 text-[12px] text-[var(--color-ink3)]">
          Gera uma conta a pagar pelos dias trabalhados (não apurados) do funcionário na obra.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div>
            <Label>Obra</Label>
            <Select value={projectId} onChange={(e) => { setProjectId(e.target.value); setFuncionario(""); }}>
              {obras.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
            </Select>
          </div>
          <div>
            <Label>Funcionário</Label>
            <Select value={funcionario} onChange={(e) => setFuncionario(e.target.value)}>
              <option value="">Selecione…</option>
              {funcionarios.map((f) => <option key={f} value={f}>{f}</option>)}
            </Select>
          </div>
          <div><Label>Valor da diária</Label><Input type="number" step="0.01" value={valorDiaria} onChange={(e) => setValorDiaria(e.target.value)} /></div>
          <div><Label>Competência (MM/AAAA)</Label><Input value={competencia} onChange={(e) => setCompetencia(e.target.value)} placeholder="08/2026" /></div>
          <div className="flex items-end">
            <Button disabled={busy || !funcionario || dias === 0} onClick={gerar} className="w-full">
              Gerar ({dias} dia{dias === 1 ? "" : "s"})
            </Button>
          </div>
        </div>
        <p className="mt-2 text-[12px] text-[var(--color-ink3)]">
          Dias elegíveis: <strong>{dias}</strong> · valor previsto:{" "}
          <strong className="text-[var(--color-accent)]">{brl(total)}</strong>
          {msg && <span className="ml-3 text-[var(--color-ink2)]">{msg}</span>}
        </p>
      </CardContent>
    </Card>
  );
}
```

---

## 8. De onde vem a lista de funcionários do seletor


Dos **próprios registros de ponto já gravados** — não de um cadastro.

```ts
const funcionarios = [
  ...new Set(entries.filter((e) => e.projectId === projectId && e.funcionario).map((e) => e.funcionario as string)),
];
```

(`ponto-manager.tsx:247–249`.) A cadeia completa:

```
time_entry.funcionario          ← gravado por registrarPonto (ponto.ts:132)
  = ctx.userEmail || ctx.userId || null
  → page.tsx:27–36   consulta inline, limit(300), ordem server_at desc
  → page.tsx:42      projetado como `funcionario`
  → ponto-manager.tsx:247  filtra por obra + dedup
  → o <Select> do componente Apuracao
```

Consequências:

- **Não há tabela de funcionários.** `stakeholder` não é consultado, mesmo
  tendo os papéis "Mão de Obra CLT" e "Mão de Obra RPA". `user`/`membership`
  também não.
- **O "funcionário" é o e-mail de quem estava logado** ao bater o ponto
  (`ctx.userEmail`), com fallback para o `userId`. Quem não tem login no app
  não aparece — e não pode bater ponto.
- **Quem nunca bateu ponto não existe no seletor**, e quem bateu só fora das
  300 linhas mais recentes some dele.
- O valor é um **snapshot em texto**: se o e-mail do usuário mudar, os
  registros antigos continuam com o antigo, e ele aparece duas vezes na lista
  como duas pessoas diferentes.

### `src/components/app/ponto-manager.tsx` · linhas 240–254

A montagem da lista e dos elegíveis.

```tsx
  const [projectId, setProjectId] = useState(obras[0]?.id ?? "");
  const [funcionario, setFuncionario] = useState("");
  const [valorDiaria, setValorDiaria] = useState("");
  const [competencia, setCompetencia] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const funcionarios = [
    ...new Set(entries.filter((e) => e.projectId === projectId && e.funcionario).map((e) => e.funcionario as string)),
  ];
  const elegiveis = entries.filter(
    (e) => e.projectId === projectId && e.funcionario === funcionario && e.tipo === "entrada" && !e.temDespesa,
  );
  const dias = new Set(elegiveis.map((e) => e.data)).size;
  const total = dias * (Number(valorDiaria) || 0);
```

### `src/lib/actions/ponto.ts` · linhas 128–135

Onde `funcionario` é gravado, no `insert`.

```ts
  await db.insert(schema.timeEntries).values({
    tenantId: ctx.tenant.id,
    projectId: input.projectId,
    userId: ctx.userId,
    funcionario: ctx.userEmail || ctx.userId || null,
    tipo: input.tipo,
    data,
    hora,
```

---

## 9. A data e a hora são mesmo do servidor?


A tela afirma, em `ponto-manager.tsx:119`:

> *"O registro só é aceito dentro do raio permitido da obra. **A data e a hora
> são do servidor.**"*

### 9.1 Sim quanto à origem

São geradas no servidor, dentro da action, com `new Date()`
(`ponto.ts:124–126`). O relógio do dispositivo não é lido em lugar nenhum: o
cliente envia apenas coordenadas, precisão e `userAgent`
(`ponto-manager.tsx:82–89`). Não há campo de data/hora no input
(`RegistrarPontoInput`, `ponto.ts:60–68`), então não há como um aparelho com
relógio adiantado influenciar o registro. Há ainda `server_at`, um `timestamp`
com `defaultNow()` — carimbo do próprio Postgres.

### 9.2 Mas o fuso é o do processo, e o repositório diz que é UTC

```ts
const now = new Date();
const data = `${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")}/${now.getFullYear()}`;
const hora = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
```

`getMonth`, `getDate`, `getHours` são os getters de **hora local do processo
Node** — não UTC explícito, não fuso de Brasília. Não há conversão, e
`registrarPonto` não importa nada de `@/lib/agent/datas`.

Qual é esse fuso, o repositório mesmo responde. Não há `ENV TZ` no
`Dockerfile`, nada no `docker-entrypoint.sh`, nada no `.env.example`; a única
menção a fuso em todo o projeto é `src/lib/agent/datas.ts`, cujo cabeçalho diz:

> *"Não é preciosismo: **a VPS roda em UTC**. Depois das 21h de Brasília o
> `new Date()` do servidor já está no dia seguinte, e 'contas a pagar hoje'
> devolveria as de amanhã — silenciosamente, e só à noite."*

Esse módulo existe justamente para resolver o problema — via `hojeSP` e
`Intl.DateTimeFormat` com `America/Sao_Paulo` — mas é usado apenas por duas
rotas de API do agente (`api/agent/contas-receber` e `api/agent/contas-pagar`).
**`registrarPonto` não o usa.**

### 9.3 O efeito prático

Se a VPS roda em UTC, como o comentário afirma:

| Batida em Brasília (UTC−3) | `hora` gravada | `data` gravada |
|---|---|---|
| 07:00 do dia 12 | `10:00` | 12 |
| 18:00 do dia 12 | `21:00` | 12 |
| **22:00 do dia 12** | `01:00` | **13** — dia seguinte |

A hora sai três horas adiantada, e toda batida a partir das 21h de Brasília é
gravada com a data do dia seguinte. Como o dia elegível da apuração é o valor
distinto da coluna `data` (seção 7), uma jornada noturna que atravesse as 21h
com entrada registrada depois desse horário é contada no dia seguinte.

O que o código **garante** é que a data e a hora não vêm do aparelho. O que
ele **não** garante é que correspondam ao horário local da obra.

### `src/lib/actions/ponto.ts` · linhas 60–76

`RegistrarPontoInput` — não há campo de data nem de hora.

```ts
export interface RegistrarPontoInput {
  projectId: string;
  tipo: "entrada" | "saida";
  latitude: number;
  longitude: number;
  precisaoMetros?: number;
  dispositivo?: string;
  justificativa?: string;
}

export interface RegistrarPontoResult {
  ok: boolean;
  distanciaMetros: number | null;
  raio: number;
  dentroRaio: boolean;
  message: string;
}
```

### `src/lib/actions/ponto.ts` · linhas 124–127

A geração de `data` e `hora`, com os getters de hora local do processo.

```ts
  const now = new Date();
  const data = `${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")}/${now.getFullYear()}`;
  const hora = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
```

### `src/lib/agent/datas.ts` · linhas 1–23

`src/lib/agent/datas.ts` — o módulo que trata o fuso corretamente, e que o ponto não usa. O comentário é a afirmação do próprio repositório sobre o fuso da VPS.

```ts
/**
 * O app guarda datas como "MM/DD/YYYY" (convenção herdada do protótipo, ver
 * src/lib/utils.ts). Aqui só existe o que a API de agente precisa a mais:
 * saber que dia é HOJE **no fuso de São Paulo**.
 *
 * Não é preciosismo: a VPS roda em UTC. Depois das 21h de Brasília o `new
 * Date()` do servidor já está no dia seguinte, e "contas a pagar hoje"
 * devolveria as de amanhã — silenciosamente, e só à noite.
 */
const FUSO = "America/Sao_Paulo";

/** Hoje em São Paulo, no formato interno "MM/DD/YYYY". */
export function hojeSP(agora: Date = new Date()): string {
  // "en-CA" formata como YYYY-MM-DD, que é estável para fatiar.
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
  const [a, m, d] = iso.split("-");
  return `${m}/${d}/${a}`;
}
```

### `src/components/app/ponto-manager.tsx` · linhas 114–120

A afirmação exibida ao usuário.

```tsx
  return (
    <Card>
      <CardContent className="p-5">
        <h2 className="mb-1 text-sm font-semibold text-[var(--color-ink)]">Registrar ponto</h2>
        <p className="mb-3 text-[12px] text-[var(--color-ink3)]">
          O registro só é aceito dentro do raio permitido da obra. A data e a hora são do servidor.
        </p>
```
