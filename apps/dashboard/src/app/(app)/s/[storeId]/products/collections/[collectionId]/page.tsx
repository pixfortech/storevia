import { getCollection } from "@storevia/commerce";
import { hasPermission } from "@storevia/tenancy";
import { isDomainError } from "@storevia/types";
import { Alert, Badge } from "@storevia/ui/surfaces";
import type { JSONContent } from "@tiptap/react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CollectionArchiveControl,
  CollectionDetailsForm,
  CollectionProducts,
} from "@/components/catalogue/collection-forms";
import { PageHeader } from "@/components/shell/app-shell";
import { collectionsPath } from "@/lib/catalogue";
import { storeContextOr404 } from "@/lib/tenant";

export const metadata: Metadata = { title: "Collection" };

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ storeId: string; collectionId: string }>;
}) {
  const { storeId, collectionId } = await params;
  const ctx = await storeContextOr404(
    storeId,
    `/s/${storeId}/products/collections/${collectionId}`,
  );
  let collection;
  try {
    collection = await getCollection(ctx, collectionId);
  } catch (error) {
    if (isDomainError(error)) notFound();
    throw error;
  }
  const archived = collection.archivedAt !== null;
  const canManage = hasPermission(ctx, "collection.manage") && ctx.storeStatus !== "ARCHIVED";
  return (
    <>
      <PageHeader
        eyebrow={
          <Link href={collectionsPath(ctx.storeId)} className="hover:text-ink">
            Collections
          </Link>
        }
        title={collection.title}
        meta={
          archived ? (
            <Badge variant="dot" tone="warning">
              Archived
            </Badge>
          ) : null
        }
        actions={
          canManage ? (
            <CollectionArchiveControl
              storeId={storeId}
              collectionId={collection.id}
              archived={archived}
            />
          ) : undefined
        }
      />
      {archived ? (
        <Alert tone="neutral" className="mb-6">
          This collection is archived. Restore it to change its products.
        </Alert>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <CollectionDetailsForm
          storeId={storeId}
          collectionId={collection.id}
          canEdit={canManage}
          values={{
            title: collection.title,
            handle: collection.handle,
            description: collection.description as JSONContent | null,
            seoTitle: collection.seoTitle ?? "",
            seoDescription: collection.seoDescription ?? "",
          }}
        />
        <CollectionProducts
          storeId={storeId}
          collectionId={collection.id}
          canEdit={canManage && !archived}
          products={collection.products.map((p) => ({
            id: p.id,
            title: p.title,
            status: p.status,
          }))}
        />
      </div>
    </>
  );
}
