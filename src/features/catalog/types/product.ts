export interface ProductOption {
  id: string;
  label: string;
  description: string | null;
  unitPrice: string;
  currencyCode: string;
  unitOfMeasure: string;
  isTaxable: boolean;
  defaultTaxIds: string[];
  sku: string;
  hsnSac: string | null;
}

export interface ProductListItem extends ProductOption {
  status: string;
  type: string;
}
