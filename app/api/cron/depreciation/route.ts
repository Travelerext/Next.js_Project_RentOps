import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

/**
 * Cron job: calculate monthly depreciation for all active equipment.
 *
 * Auth: expects `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`.
 * Call this from pg_cron, Vercel Cron, or any external scheduler.
 */
export async function GET(request: Request) {
  // Verify the request carries the service_role key
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`;
  if (!authHeader || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Fetch non-scrapped equipment with valid purchase data
  const { data: equipment, error } = await supabase
    .from("equipment")
    .select("id, purchase_price, depreciation_years, residual_rate, current_residual_value")
    .eq("scrapped", false)
    .is("deleted_at", null)
    .not("purchase_price", "is", null);

  if (error || !equipment) {
    return NextResponse.json({ processed: 0, error: error?.message });
  }

  const now = new Date().toISOString();
  let processed = 0;

  for (const equip of equipment) {
    const purchasePrice = parseFloat(equip.purchase_price ?? "0");
    const depreciationYears = equip.depreciation_years ?? 8;
    const residualRate = parseFloat(equip.residual_rate ?? "5.00");
    const currentValue = parseFloat(equip.current_residual_value ?? String(purchasePrice));

    if (purchasePrice <= 0) continue;
    if (depreciationYears <= 0) continue;

    const monthlyDepreciation =
      (purchasePrice * (1 - residualRate / 100)) / (depreciationYears * 12);
    const newValue = Math.max(0, currentValue - monthlyDepreciation);

    // Only update if value actually changes
    if (Math.abs(newValue - currentValue) < 0.01) continue;

    const { error: updateError } = await supabase
      .from("equipment")
      .update({
        current_residual_value: Math.round(newValue * 100) / 100,
        updated_at: now,
      })
      .eq("id", equip.id);

    if (!updateError) processed++;
  }

  return NextResponse.json({ processed });
}
