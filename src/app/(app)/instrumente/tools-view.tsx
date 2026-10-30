"use client";

import { Building2, FileCheck2, FileCode2, FileDown, Landmark } from "lucide-react";
import * as React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BnrTool, type RatePoint } from "./bnr-tool";
import { CuiTool } from "./cui-tool";
import { PdfTool } from "./pdf-tool";
import { UblTool, type InvoiceOption } from "./ubl-tool";
import { ValidateTool } from "./validate-tool";

export type ToolTab = "cui" | "validare" | "pdf" | "bnr" | "ubl";

export function ToolsView({
  initialTab,
  initialCui,
  initialDocument,
  cachedRates,
  series,
  invoices,
}: {
  initialTab: ToolTab;
  initialCui: string | null;
  initialDocument: string | null;
  cachedRates: { date: string; rates: Record<string, number> } | null;
  series: RatePoint[];
  invoices: InvoiceOption[];
}) {
  const [tab, setTab] = React.useState<ToolTab>(initialTab);
  const change = (v: string) => {
    setTab(v as ToolTab);
    const url = new URL(window.location.href);
    url.search = `?tab=${v}`;
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  };

  return (
    <Tabs value={tab} onValueChange={change}>
      <TabsList className="w-full sm:w-fit">
        <TabsTrigger value="cui">
          <Building2 /> Verificare CUI
        </TabsTrigger>
        <TabsTrigger value="validare">
          <FileCheck2 /> Validare XML
        </TabsTrigger>
        <TabsTrigger value="pdf">
          <FileDown /> XML → PDF
        </TabsTrigger>
        <TabsTrigger value="bnr">
          <Landmark /> Curs BNR
        </TabsTrigger>
        <TabsTrigger value="ubl">
          <FileCode2 /> Previzualizare UBL
        </TabsTrigger>
      </TabsList>
      <TabsContent value="cui">
        <CuiTool initialCui={initialCui} />
      </TabsContent>
      <TabsContent value="validare">
        <ValidateTool />
      </TabsContent>
      <TabsContent value="pdf">
        <PdfTool />
      </TabsContent>
      <TabsContent value="bnr">
        <BnrTool cached={cachedRates} series={series} />
      </TabsContent>
      <TabsContent value="ubl">
        <UblTool invoices={invoices} initialDocument={initialDocument} />
      </TabsContent>
    </Tabs>
  );
}
