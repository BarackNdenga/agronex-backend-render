import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import ManualPurchaseDialog from "./ManualPurchaseDialog";

type Provider = "orange" | "airtel" | "afrimoney" | "mpesa";
type PaymentResume = { id: string; provider: Provider; grossAmount: number; commissionAmount: number; farmerAmount: number; reference: string; status: string; destinationName: string | null; destinationPhone: string | null; paymentMethod?: "manual"; failureNote?: string | null };
const fc = (value: number) => `${new Intl.NumberFormat("fr-FR").format(value)} FC`;
const providerName = (provider: Provider) => ({ orange: "Orange Money", airtel: "Airtel Money", afrimoney: "AfriMoney", mpesa: "M-Pesa" }[provider]);
const payStatus: Record<string, string> = { pending: "À vérifier", awaiting_payment: "En attente", payout_pending: "Versement en cours", approved: "Validé", rejected: "Refusé", refund_required: "Remboursement à faire", refunded: "Remboursé" };

export default function PaymentWalletPanel({ userId, onClose }: { userId: number; onClose?: () => void }) {
  const utils = trpc.useUtils();
  const options = trpc.agronex.orders.paymentOptions.useQuery(undefined, { retry: false });
  const wallet = trpc.agronex.orders.myPayments.useQuery(undefined, { retry: false });
  const [amount, setAmount] = useState("");
  const [provider, setProvider] = useState<Provider>("mpesa");
  const [phone, setPhone] = useState("");
  const [sellerProvider, setSellerProvider] = useState<Provider>("mpesa");
  const [sellerPhone, setSellerPhone] = useState("");
  const [resume, setResume] = useState<PaymentResume | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const settings = options.data;
  const providers: Provider[] = ["orange", "airtel", "afrimoney", "mpesa"];
  const activeProvider = providers.includes(provider) ? provider : providers[0];
  const savePayoutDetails = trpc.agronex.orders.savePayoutDetails.useMutation({ onSuccess: async (result) => { setSellerProvider(result.payoutProvider); setSellerPhone(result.payoutPhone); setNotice("Compte de versement vendeur enregistré."); setError(""); await wallet.refetch(); }, onError: (e) => setError(e.message) });
  const request = trpc.agronex.orders.requestPayout.useMutation({ onSuccess: async () => { await wallet.refetch(); setAmount(""); setPhone(""); setNotice("Demande de retrait envoyée. L’administrateur effectuera le transfert puis le confirmera ici."); setError(""); }, onError: (e) => setError(e.message) });
  const canResume = (payment: PaymentResume & { buyerId: number }) => payment.buyerId === userId && payment.status === "pending" && payment.reference === `PENDING-${payment.id}`;

  useEffect(() => {
    if (wallet.data?.payoutProvider === "mpesa" || wallet.data?.payoutProvider === "airtel") setSellerProvider(wallet.data.payoutProvider);
    if (wallet.data?.payoutPhone) setSellerPhone(wallet.data.payoutPhone);
  }, [wallet.data?.payoutProvider, wallet.data?.payoutPhone]);

  return <section className="agx-wallet">
    <div className="agx-wallet-head"><span className="agx-kicker">PAIEMENTS MOBILE MONEY · FC</span><h2>Portefeuille</h2><p>Les paiements Mobile Money restent désactivés par défaut. Les références sont contrôlées par l’administration avant toute validation.</p></div>
    {!settings?.enabled && <div className="agx-pay-warning">Les nouvelles commandes sont en pause. Les demandes de retrait pour les soldes déjà crédités restent possibles.</div>}
    {wallet.isLoading ? <div className="agx-loading agx-loading-inline">Chargement du solde…</div> : wallet.error ? <div className="agx-pay-error">{wallet.error.message}</div> : <>
      {wallet.data?.role === "agriculteur" && <>
        <article className="agx-wallet-balance"><span>SOLDE AGRICULTEUR DISPONIBLE</span><b>{fc(wallet.data.availableBalance)}</b><small>En attente de retrait : {fc(wallet.data.pendingPayout)} · Les ventes automatiques sont envoyées directement au compte Mobile Money enregistré.</small></article>
        {false && <form className="agx-pay-form agx-withdraw" onSubmit={(event) => { event.preventDefault(); savePayoutDetails.mutate({ provider: sellerProvider, phone: sellerPhone }); }}>
          <h3>Compte de réception des ventes</h3>
          <p>Ce numéro recevra le net vendeur (95 %) automatiquement après confirmation de l’encaissement. Vérifie soigneusement l’opérateur et le numéro.</p>
          <label>Opérateur<select value={sellerProvider} onChange={(event) => setSellerProvider(event.target.value as Provider)}>{providers.map((item) => <option key={item} value={item}>{providerName(item)}</option>)}</select></label>
          <label>Ton numéro de réception<input type="tel" inputMode="tel" autoComplete="tel" value={sellerPhone} onChange={(event) => setSellerPhone(event.target.value)} placeholder="ex. +243 812 345 678" required minLength={8} maxLength={48} /></label>
          {notice && <p className="agx-pay-success-text" role="status">{notice}</p>}{error && <p className="agx-pay-error" role="alert">{error}</p>}
          <button className="agx-primary" type="submit" disabled={savePayoutDetails.isPending}>{savePayoutDetails.isPending ? "Enregistrement…" : "Enregistrer mon compte vendeur"}</button>
        </form>}
        <form className="agx-pay-form agx-withdraw" onSubmit={(event) => { event.preventDefault(); request.mutate({ amount: Number(amount), provider: activeProvider, phone }); }}>
          <h3>Demander un retrait manuel</h3>
          <p>Réservé aux soldes déjà crédités ou aux transferts automatiques échoués; l’administration effectue et confirme alors le virement.</p>
          <label>Montant (FC)<input type="number" min="1" step="1" max={wallet.data.availableBalance} value={amount} onChange={(event) => setAmount(event.target.value)} required /></label>
          <label>Opérateur<select value={activeProvider} onChange={(event) => setProvider(event.target.value as Provider)}>{providers.map((item) => <option key={item} value={item}>{providerName(item)}</option>)}</select></label>
          <label>Ton numéro de réception<input type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="ex. 0812345678" required minLength={8} maxLength={48} /></label>
          {notice && <p className="agx-pay-success-text" role="status">{notice}</p>}{error && <p className="agx-pay-error" role="alert">{error}</p>}
          <button className="agx-primary" type="submit" disabled={request.isPending || wallet.data.availableBalance <= 0}>{request.isPending ? "Envoi…" : "Demander le retrait"}</button>
          <small>Vérifie le numéro : un transfert fait au mauvais destinataire ne peut pas toujours être récupéré.</small>
        </form>
      </>}
      <section className="agx-wallet-history"><h3>Achats, ventes et retraits</h3>
        {wallet.data?.payments.length ? wallet.data.payments.map((payment) => <article className="agx-wallet-row" key={payment.id}>
          <span className={`agx-wallet-status ${payment.status}`}>{payStatus[payment.status] || payment.status}</span>
          <div><b>{payment.postTitle}</b><small>{payment.buyerId === userId ? "Achat" : "Vente · part agriculteur 95 %"} · {providerName(payment.provider)}{payment.reference.startsWith("PENDING-") ? " · transfert non confirmé" : ` · réf. ${payment.reference}`}</small>{payment.failureNote && <small>{payment.failureNote}</small>}</div>
          <strong>{fc(payment.buyerId === userId ? Number(payment.grossAmount) : Number(payment.farmerAmount))}</strong>
          {canResume(payment as PaymentResume & { buyerId: number }) && <button type="button" onClick={() => setResume({ id: payment.id, provider: payment.provider, grossAmount: Number(payment.grossAmount), commissionAmount: Number(payment.commissionAmount), farmerAmount: Number(payment.farmerAmount), reference: payment.reference, status: payment.status, destinationName: payment.destinationName, destinationPhone: payment.destinationPhone, paymentMethod: payment.paymentMethod, failureNote: payment.failureNote })}>{"Reprendre"}</button>}
        </article>) : <p className="agx-wallet-empty">Aucune transaction pour le moment.</p>}
        {wallet.data?.payouts.map((payout) => <article className="agx-wallet-row" key={payout.id}>
          <span className={`agx-wallet-status ${payout.status}`}>{payout.status === "pending" ? "Retrait demandé" : payout.status === "paid" ? "Retiré" : "Refusé"}</span>
          <div><b>Retrait · {providerName(payout.provider)}</b><small>{payout.phone}{payout.payoutReference ? ` · réf. ${payout.payoutReference}` : ""}</small></div>
          <strong>− {fc(Number(payout.amount))}</strong>
        </article>)}
      </section>
    </>}
    {resume && <ManualPurchaseDialog resume={resume} onClose={() => setResume(null)} onCompleted={() => void wallet.refetch()} />}
    {onClose && <button type="button" className="agx-pay-cancel" onClick={onClose}>Retour</button>}
  </section>;
}
