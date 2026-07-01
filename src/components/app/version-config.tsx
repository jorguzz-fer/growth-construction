"use client";

import { useState, useTransition } from "react";
import type { Version } from "@/lib/context";
import {
  updateVersion,
  toggleVersionLock,
  setDefaultVersion,
  deleteVersion,
} from "@/lib/actions/versions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export function VersionConfig({
  versions,
  canEdit,
  canDelete,
}: {
  versions: Version[];
  canEdit: boolean;
  canDelete: boolean;
}) {
  return (
    <div className="space-y-3">
      {versions.map((v) => (
        <VersionRow key={v.id} v={v} canEdit={canEdit} canDelete={canDelete} />
      ))}
    </div>
  );
}

function VersionRow({
  v,
  canEdit,
  canDelete,
}: {
  v: Version;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [label, setLabel] = useState(v.label);
  const [color, setColor] = useState(v.color);
  const [pending, start] = useTransition();

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <span
          className="mt-6 inline-block h-4 w-4 shrink-0 rounded-full"
          style={{ background: color }}
        />
        <div className="flex-1">
          <Label>Nome da versão</Label>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} disabled={!canEdit} />
        </div>
        <div>
          <Label>Cor</Label>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            disabled={!canEdit}
            className="h-9 w-14 rounded-[8px] border border-[var(--color-accent2)]/20"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">{v.kind}</Badge>
          {v.isDefault && <Badge tone="accent">default</Badge>}
          {v.locked && <Badge tone="warning">congelada</Badge>}
        </div>
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              disabled={pending}
              onClick={() => start(() => updateVersion(v.id, { label, color }))}
            >
              Salvar
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => start(() => toggleVersionLock(v.id, !v.locked))}
            >
              {v.locked ? "Descongelar" : "Congelar"}
            </Button>
            {!v.isDefault && (
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => start(() => setDefaultVersion(v.id))}
              >
                Tornar default
              </Button>
            )}
            {canDelete && v.kind === "custom" && (
              <button
                disabled={pending}
                onClick={() => start(() => deleteVersion(v.id))}
                className="text-sm text-[var(--color-danger)] hover:underline disabled:opacity-50"
              >
                Excluir
              </button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
