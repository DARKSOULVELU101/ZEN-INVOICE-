export interface CustomerOption {
  id: string;
  label: string;
  email: string | null;
  currencyCode: string | null;
  stateCode: string | null;
  gstin: string | null;
}

export interface CustomerListItem extends CustomerOption {
  customerNumber: string;
  phone: string | null;
  status: string;
}
