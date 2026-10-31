import { apiFetch } from '../../lib/api'

export type Money = { amount: string; currency: string }
export type ProductVariant = {
  id: string
  name: string
  priceAdjustment: Money
  isActive: boolean
}
export type Product = {
  id: string
  name: string
  type: string
  salesPrice: Money
  costPrice: Money
  notes: string
  isActive: boolean
  variants: ProductVariant[]
  createdAt: string
  updatedAt: string
}
export type ProductInput = {
  name: string
  type: string
  salesPrice: Money
  costPrice: Money
  notes: string
  isActive?: boolean
}
export type VariantInput = {
  name: string
  priceAdjustment: Money
}

export async function listProducts(search = '', cursor?: string): Promise<{ items: Product[]; nextCursor: string | null }> {
  const params = new URLSearchParams({ limit: '25' })
  if (search) params.set('search', search)
  if (cursor) params.set('cursor', cursor)
  return apiFetch<{ items: Product[]; nextCursor: string | null }>(`products?${params.toString()}`)
}

export async function createProduct(input: ProductInput): Promise<Product> {
  return apiFetch<Product>('products', { method: 'POST', body: JSON.stringify(input) })
}

export async function updateProduct(id: string, input: Partial<ProductInput>): Promise<Product> {
  return apiFetch<Product>(`products/${id}`, { method: 'PATCH', body: JSON.stringify(input) })
}

export async function createVariant(productId: string, input: VariantInput): Promise<ProductVariant> {
  return apiFetch<ProductVariant>(`products/${productId}/variants`, { method: 'POST', body: JSON.stringify(input) })
}

export async function updateVariant(productId: string, variantId: string, input: Partial<VariantInput> & { isActive?: boolean }): Promise<ProductVariant> {
  return apiFetch<ProductVariant>(`products/${productId}/variants/${variantId}`, { method: 'PATCH', body: JSON.stringify(input) })
}
