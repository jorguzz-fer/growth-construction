"use client";

import { useState, useTransition } from "react";
import type { Version } from "@/lib/context";
import {
  updateVersion,
  toggleVersionLock,
  setDefaultVersion,
  deleteVersion,
} from "@/lib/actions/versions";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

/** Edição da identidade da versão ativa (nome, cor) + controles. */
export function VersionIdentity({
  version,
  canEdit,
  canDelete,
}: {
  version: Version;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [label, setLabel] = useState(version.label);
  const [color, setColor] = useState(version.color);
  const [pending, start] = useTransition();
  const isFixed = version.kind !== "custom";

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <Label>Nome da versão</Label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            disabled={!canEdit}
          />
        </div>
        {canEdit && (
          <div>
            <Label>Cor</Label>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-9 w-12 rounded-[8px] border border-[var(--color-accent2)]/20"
            />
          </div>
        )}
      </div>

      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            disabled={pending}
            onClick={() => start(() => updateVersion(version.id, { label, color }))}
          >
            Salvar
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => start(() => toggleVersionLock(version.id, !version.locked))}
          >
            {version.locked ? "Descongelar" : "Congelar"}
          </Button>
          {!version.isDefault && (
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => start(() => setDefaultVersion(version.id))}
            >
              Tornar default
            </Button>
          )}
          {canDelete && !isFixed && (
            <button
              disabled={pending}
              onClick={() => start(() => deleteVersion(version.id))}
              className="ml-auto text-sm text-[var(--color-danger)] hover:underline disabled:opacity-50"
            >
              Excluir versão
            </button>
          )}
        </div>
      )}
    </div>
  );
}
