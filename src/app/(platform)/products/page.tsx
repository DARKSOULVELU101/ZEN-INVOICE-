import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/shared/feedback";
import { listProducts } from "@/features/catalog/server/product-service";
import { ProductForm } from "@/features/catalog/components/product-form";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const result = await listProducts();
  return (
    <div className="space-y-6">
      <PageHeader title="Products" description="Products and services available on invoices." />
      {!result.ok ? <ErrorState description={result.error.message} /> : null}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader><CardTitle>Product catalog</CardTitle></CardHeader>
          <CardContent>
            {result.ok && result.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">No products yet.</p>
            ) : null}
            <div className="divide-y">
              {result.ok ? result.data.map((product) => (
                <div key={product.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <p className="font-medium">{product.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {product.sku} · {product.unitPrice} {product.currencyCode} · {product.unitOfMeasure}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">{product.hsnSac ?? "No HSN/SAC"} · {product.type}</p>
                </div>
              )) : null}
            </div>
          </CardContent>
        </Card>
        <ProductForm />
      </div>
    </div>
  );
}
