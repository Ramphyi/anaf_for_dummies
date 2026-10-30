"use client";

import { Archive, FileSpreadsheet, ShieldAlert } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { exportAllDataAction, exportInvoicesCsvAction } from "@/app/(app)/setari/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeaderRow } from "@/components/ui/card";

function download(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Zona de date: exporturi complete (CSV / ZIP). */
export function DataExportCard() {
  const [busy, setBusy] = React.useState<"csv" | "zip" | null>(null);

  const exportCsv = async () => {
    setBusy("csv");
    try {
      const r = await exportInvoicesCsvAction();
      if (!r.ok) return void toast.error(r.error);
      download(new Blob(["﻿" + r.data.csv], { type: "text/csv;charset=utf-8" }), r.data.filename);
      toast.success("Exportul facturilor a fost descărcat");
    } finally {
      setBusy(null);
    }
  };

  const exportZip = async () => {
    setBusy("zip");
    try {
      const r = await exportAllDataAction();
      if (!r.ok) return void toast.error(r.error);
      const bytes = Uint8Array.from(atob(r.data.base64), (c) => c.charCodeAt(0));
      download(new Blob([bytes], { type: "application/zip" }), r.data.filename);
      toast.success("Arhiva cu toate datele a fost descărcată");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="border-danger/30">
      <CardHeaderRow
        title="Zona de date"
        description="Exporturile conțin date fiscale și personale ale clienților — păstrează-le în siguranță."
        icon={<ShieldAlert />}
        className="[&>div>div:first-child]:bg-danger-soft [&>div>div:first-child]:text-danger-soft-foreground"
      />
      <CardContent className="divide-y divide-border">
        <div className="flex flex-col gap-3 py-3 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">Exportă facturile (CSV)</p>
            <p className="text-xs text-muted-foreground">Toate facturile emise, cu status, valută, curs, încasări și starea e-Factura — compatibil Excel.</p>
          </div>
          <Button variant="outline" size="sm" onClick={exportCsv} loading={busy === "csv"} disabled={!!busy}>
            <FileSpreadsheet /> Exportă CSV
          </Button>
        </div>
        <div className="flex flex-col gap-3 py-3 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">Exportă toate datele (ZIP)</p>
            <p className="text-xs text-muted-foreground">
              Facturi, linii, încasări, cheltuieli, parteneri, produse, proiecte, pontaj și stocuri — câte un CSV. Fără parole sau token-uri.
            </p>
          </div>
          <Button variant="destructive-soft" size="sm" onClick={exportZip} loading={busy === "zip"} disabled={!!busy}>
            <Archive /> Descarcă arhiva
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
