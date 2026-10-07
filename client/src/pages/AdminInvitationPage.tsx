import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";

function invitationToken() {
  if (typeof window === "undefined") return "";
  let token = "";
  try { token = decodeURIComponent(window.location.hash.slice(1)); } catch { return ""; }
  if (!/^[A-Za-z0-9_-]{40,50}$/.test(token)) return "";
  try { sessionStorage.setItem("agronex-admin-invitation", token); } catch {}
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  return token;
}

export default function AdminInvitationPage() {
  const { user, loading, logout } = useAuth();
  const [token] = useState(invitationToken);
  const [error, setError] = useState("");
  const infoStarted = useRef(false);
  const invitationInfo = trpc.admin.invitationInfo.useMutation();
  const redeem = trpc.admin.redeemInvitation.useMutation({ onSuccess: async () => {
    try { sessionStorage.removeItem("agronex-admin-invitation"); } catch {}
    await utils.auth.me.invalidate();
    window.location.replace("/admin");
  } });
  const utils = trpc.useUtils();

  useEffect(() => {
    if (!token || infoStarted.current) return;
    infoStarted.current = true;
    invitationInfo.mutate({ token });
  }, [token]);

  const status = invitationInfo.data?.status;
  const unavailable = !token || Boolean(invitationInfo.error) || status === "expired" || status === "revoked" || status === "used";
  const emailMatches = Boolean(user?.email && invitationInfo.data?.email && user.email.trim().toLowerCase() === invitationInfo.data.email.trim().toLowerCase());

  const continueLogin = () => {
    if (!token) return;
    try { sessionStorage.setItem("agronex-admin-invitation", token); } catch {}
    startLogin();
  };
  const accept = () => {
    setError("");
    redeem.mutate({ token }, { onError: (cause) => setError(cause.message) });
  };

  return <main className="adm-page adm-invite-page">
    <header className="adm-header"><a className="adm-brand" href="/" aria-label="Retour à AGRONEX"><span>🌱</span> AGRONEX</a><span className="adm-live"><i /> INSCRIPTION PRIVÉE</span></header>
    <section className="adm-invitation-card">
      <span className="adm-invitation-mark">⛨</span><span className="adm-eyebrow">ÉQUIPE DE GOUVERNANCE</span>
      {loading || invitationInfo.isPending ? <><h1>Vérification…</h1><p>Nous contrôlons votre lien d’invitation.</p></> : unavailable ? <><h1>Lien indisponible</h1><p>{!token ? "Cette page n’est accessible qu’avec un lien d’invitation personnel." : invitationInfo.data?.status === "expired" ? "Cette invitation a expiré. Contacte le propriétaire pour recevoir un nouveau lien." : invitationInfo.data?.status === "used" ? "Cette invitation a déjà été utilisée." : invitationInfo.data?.status === "revoked" ? "Cette invitation a été révoquée par le propriétaire." : invitationInfo.error?.message || "Ce lien d’invitation n’est pas valide."}</p><a className="adm-invitation-back" href="/">Retour à AGRONEX</a></> : <>
        <h1>Rejoindre l’administration.</h1><p>Cette inscription est réservée aux personnes invitées par le propriétaire d’AGRONEX.</p><div className="adm-invite-recipient"><small>INVITATION PERSONNELLE POUR</small><b>{invitationInfo.data?.email}</b><small>Ce lien est unique et expire le {new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(new Date(invitationInfo.data?.expiresAt || 0))}.</small></div>
        {error && <div className="adm-invite-error" role="alert">{error}</div>}
        {!user ? <button className="adm-invitation-primary" onClick={continueLogin}>Se connecter ou créer mon compte <span>↗</span></button> : emailMatches ? <button className="adm-invitation-primary" onClick={accept} disabled={redeem.isPending}>{redeem.isPending ? "Validation de l’invitation…" : `Accepter avec ${user.email}`}<span>↗</span></button> : <div className="adm-invite-error">Le compte connecté ({user.email || "sans adresse e-mail"}) ne correspond pas à l’adresse invitée. Déconnecte-toi puis connecte-toi avec {invitationInfo.data?.email}.<button className="adm-invite-logout" onClick={() => void logout()}>Me déconnecter</button></div>}
        <small className="adm-invite-privacy">L’inscription passe par la connexion AGRONEX. Le compte utilisé doit avoir la même adresse e-mail que l’invitation.</small>
      </>}
    </section>
  </main>;
}
