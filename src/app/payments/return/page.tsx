import { redirect } from "next/navigation";
import { configured } from "@/lib/config";
import { authenticatedUser } from "@/lib/supabase";
import { PaymentConfirmation } from "@/components/payment-confirmation";

export default async function PaymentReturn({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!configured()) redirect("/login");
  if (!(await authenticatedUser())) redirect("/login");
  const params = await searchParams;
  const reference =
    typeof params.reference === "string" &&
    /^[A-Za-z0-9.=-]{1,150}$/.test(params.reference)
      ? params.reference
      : null;
  return (
    <main id="main" className="narrow-page">
      <p className="section-label">Semester pass</p>
      <h1>Confirming your payment</h1>
      <PaymentConfirmation reference={reference} />
    </main>
  );
}
