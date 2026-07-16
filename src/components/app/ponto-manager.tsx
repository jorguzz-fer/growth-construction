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
        <div className="overflow-x-auto">
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
