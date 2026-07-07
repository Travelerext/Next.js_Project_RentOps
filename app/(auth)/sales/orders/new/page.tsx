import NewOrderForm from "./order-form";
import { getInquiryOrderPrefill } from "@/lib/actions/rental-order";

interface NewOrderPageProps {
  searchParams?: Promise<{
    inquiryId?: string | string[];
    customerId?: string | string[];
  }>;
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function NewOrderPage({ searchParams }: NewOrderPageProps) {
  const params = await searchParams;
  const sourceInquiryId = firstParam(params?.inquiryId)?.trim() || null;
  const sourceCustomerId = firstParam(params?.customerId)?.trim() || null;

  if (!sourceInquiryId) {
    return <NewOrderForm sourceInquiryId={null} sourceCustomerId={sourceCustomerId} initialPrefill={null} />;
  }

  const prefill = await getInquiryOrderPrefill(sourceInquiryId);
  return (
    <NewOrderForm
      sourceInquiryId={sourceInquiryId}
      sourceCustomerId={sourceCustomerId}
      initialPrefill={prefill.success ? prefill.data : null}
      initialError={prefill.success ? null : prefill.error}
    />
  );
}
