import type { ReportType } from "@prisma/client";

export interface ReportColumn {
  key: string;
  label: string;
  numeric?: boolean;
}

export interface ReportResult {
  type: ReportType;
  title: string;
  description: string;
  currency: string;
  columns: ReportColumn[];
  rows: Record<string, string | number>[];
  summary: Record<string, string>;
}
