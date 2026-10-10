import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { ADMIN_RETURN_TARGET_KEY } from "@/lib/admin-return";
import AdminPaymentPanel from "@/components/AdminPaymentPanel";

const number = (n: number) => new Intl.NumberFormat("fr-FR").format(n);
const timeLabel = (ts: number | Date) => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(ts));
const statusLabel: Record<string, string> = { a_transporter: "Transport à trouver", en_transport: "En livraison", livree: "Livrée" };
type CreatedInvite = { email: string; url: string; expiresAt: number };

export default function AdminDashboard() {
  const { user, loading: authLoading, isAuthenticated, logout } = useAuth();
  const [email, setEmail] = useState("");
  const [createdInvite, setCreatedInvite] = useState<CreatedInvite | null>(null);
  const utils = trpc.useUtils();
  const overview = trpc.admin.overview.useQuery(undefined, { retry: false });
  const isOwner = Boolean(overview.data?.canManageAdmins);
  const invitations = trpc.admin.invitations.useQuery(undefined, { enabled: isOwner, retry: false });
  const refreshAdmin = async () => Promise.all([utils.admin.overview.invalidate(), utils.admin.invitations.invalidate()]);
  const createInvite = trpc.admin.createInvitation.useMutation({ onSuccess: async (data) => { setCreatedInvite({ email: data.email, url: `${window.location.origin}/admin/invite#${data.token}`, expiresAt: data.expiresAt }); setEmail(""); await refreshAdmin(); } });
  const revokeInvite = trpc.admin.revokeInvitation.useMutation({ onSuccess: refreshAdmin });
  const revoke = trpc.admin.revoke.useMutation({ onSuccess: async () => { await utils.admin.overview.invalidate(); } });
  const signInAsOwner = async () => {
    if (isAuthenticated) {
      try { await logout(); }
      catch { window.alert("Déconnexion impossible. Ferme la session AGRONEX puis réessaie."); return; }
    }
    try { sessionStorage.setItem(ADMIN_RETURN_TARGET_KEY, "/admin"); } catch {}
    startLogin();
  };
  const leaveAdmin = async () => {
    try {
      await logout();
      window.location.replace("/");
    } catch {
      window.alert("Déconnexion impossible. Réessaie dans un instant.");
    }
  };

  if (authLoading || overview.isLoading) return <main className="adm-page"><div className="adm-loading"><span className="adm-spinner" />Vérification de votre session…</div></main>;
  if (overview.error) return <main className="adm-page"><header className="adm-header"><a className="adm-brand" href="/" aria-label="Retour à AGRONEX"><span>🌱</span> AGRONEX</a></header><section className="adm-denied"><span>⛨</span><h1>Espace administrateur</h1>{!isAuthenticated ? <><p>Connecte-toi avec le compte du propriétaire pour ouvrir cet espace.</p><small>Le compte propriétaire est autorisé par la configuration sécurisée d’AGRONEX.</small></> : <><p>Le compte connecté n’a pas accès à cet espace.</p><small>L’accès propriétaire est déterminé par la configuration sécurisée d’AGRONEX.</small></>}<button className="adm-login-btn" onClick={() => void signInAsOwner()}>{isAuthenticated ? "Changer de compte et continuer" : "Se connecter avec le compte propriétaire"}<span>↗</span></button><a className="adm-invitation-back" href="/">Retour à AGRONEX</a></section></main>;
  const data = overview.data;
  if (!data) return null;

  const activeInvites = invitations.data ?? [];
  const invitationStateKnown = !data.canManageAdmins || invitations.isSuccess;
  const seatsUsed = Math.min(4, data.counts.admins + (invitations.isSuccess ? activeInvites.length : 0));
  const seatsLeft = Math.max(0, 4 - seatsUsed);
  const slots = Array.from({ length: 4 }, (_, index) => ({ number: index + 1, admin: data.admins[index] ?? null, invitation: index >= data.admins.length ? activeInvites[index - data.admins.length] ?? null : null }));
  const flashError = (error: unknown) => window.alert(error instanceof Error ? error.message : "Action impossible. Réessayez.");
  const copyInvite = async (url: string) => {
    try { await navigator.clipboard.writeText(url); window.alert("Lien copié. Envoie-le uniquement à la personne invitée."); }
    catch { window.prompt("Copie ce lien et envoie-le uniquement à la personne invitée :", url); }
  };
  const cancelInvite = (id: string, inviteEmail: string) => { if (window.confirm(`Révoquer l’invitation envoyée à ${inviteEmail} ?`)) revokeInvite.mutate({ invitationId: id }, { onError: flashError }); };

  return <main className="adm-page">
    <header className="adm-header"><div className="adm-brand" aria-label="AGRONEX"><span>🌱</span> AGRONEX</div><div className="adm-header-right"><span className="adm-live"><i /> Espace privé</span><button type="button" className="adm-exit" onClick={() => void leaveAdmin()}>Se déconnecter ↗</button></div></header>
    <section className="adm-hero"><div><span className="adm-eyebrow">GOUVERNANCE · RÉSEAU AGRICOLE</span><h1>Espace <em>administrateur.</em></h1><p>Vue d’ensemble de la plateforme et gestion privée des quatre accès.</p></div><div className="adm-seat-badge"><span>PLACES ADMIN</span><b>{seatsUsed}<i> / 4</i></b><small>{seatsLeft} disponible{seatsLeft === 1 ? "" : "s"}</small></div></section>
    <section className="adm-metrics" aria-label="Indicateurs de la plateforme">
      {[{ label: "Comptes inscrits", value: data.counts.users, icon: "♙", tone: "green" }, { label: "Profils actifs", value: data.counts.profiles, icon: "◉", tone: "sage" }, { label: "Offres publiées", value: data.counts.posts, icon: "▤", tone: "gold" }, { label: "Commandes", value: data.counts.orders, icon: "↗", tone: "blue" }, { label: "Messages", value: data.counts.messages, icon: "✉", tone: "lavender" }].map((metric) => <article className="adm-metric" key={metric.label}><span className={`adm-metric-icon ${metric.tone}`}>{metric.icon}</span><small>{metric.label}</small><strong>{number(metric.value)}</strong></article>)}
    </section>
    <div className="adm-grid">
      <section className="adm-card adm-admins">
        <div className="adm-card-heading"><div><span className="adm-eyebrow">ACCÈS & SÉCURITÉ</span><h2>Les quatre administrateurs</h2></div><span className="adm-seat-count">{seatsUsed} / 4</span></div>
        <div className="adm-admin-list" aria-label="Quatre places administrateur">{slots.map(({ number: slotNumber, admin, invitation }) => <article className={`adm-slot-row ${admin ? "filled" : invitation ? "pending" : "open"}`} key={slotNumber}><span className="adm-slot-number">0{slotNumber}</span>{admin ? <><span className="adm-avatar">{(admin.name || admin.email || "A").slice(0, 1).toUpperCase()}</span><div className="adm-admin-info"><b>{admin.name || "Administrateur"}{admin.isOwner ? " · Propriétaire" : ""}</b><small>{admin.email || "E-mail indisponible"}</small></div><span className="adm-admin-badge">INSCRIT</span>{data.canManageAdmins && admin.email && !admin.isOwner && <button className="adm-revoke" onClick={() => { if (window.confirm(`Retirer l’accès administrateur de ${admin.email} ?`)) revoke.mutate({ userId: admin.id }, { onError: flashError }); }} disabled={revoke.isPending} aria-label={`Retirer ${admin.email}`}>−</button>}</> : invitation ? <><span className="adm-slot-icon pending-icon">✉</span><div className="adm-admin-info"><b>{invitation.email}</b><small>Invitation en attente · expire le {timeLabel(invitation.expiresAt)}</small></div><span className="adm-pending-badge">EN ATTENTE</span>{data.canManageAdmins && <button className="adm-revoke" onClick={() => cancelInvite(invitation.id, invitation.email)} disabled={revokeInvite.isPending} aria-label={`Révoquer ${invitation.email}`}>−</button>}</> : <><span className="adm-slot-icon open-icon">＋</span><div className="adm-admin-info"><b>Place disponible</b><small>Crée un lien privé pour cette personne</small></div><span className="adm-open-badge">LIBRE</span></>}</article>)}</div>
        {data.canManageAdmins ? <div className="adm-invite">
          <span className="adm-eyebrow">INSCRIPTION PRIVÉE SUR INVITATION</span><label htmlFor="admin-invite-email">Enregistrer les trois autres administrateurs</label><p>Crée un lien personnel pour chaque personne et transmets-le toi-même. Le lien expire après 7 jours et ne peut servir qu’une fois. Aucun e-mail n’est envoyé automatiquement.</p>
          <form className="adm-search" onSubmit={(event) => { event.preventDefault(); createInvite.mutate({ email }, { onError: flashError }); }}><span>✉</span><input id="admin-invite-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="administrateur@exemple.com" autoComplete="email" required /><button type="submit" disabled={createInvite.isPending || invitations.isLoading || !invitationStateKnown || seatsLeft <= 0}>{createInvite.isPending ? "Création…" : invitations.isLoading ? "Vérification…" : invitations.isError ? "Base indisponible" : seatsLeft <= 0 ? "4 places réservées" : "Créer le lien privé"}</button></form>
          {createInvite.error && <small className="adm-error">{createInvite.error.message}</small>}
          {createdInvite && <div className="adm-created-link"><b>Invitation prête pour {createdInvite.email}</b><small>À utiliser avant le {timeLabel(createdInvite.expiresAt)} · lien à usage unique · même adresse requise</small><button type="button" onClick={() => void copyInvite(createdInvite.url)}>Copier le lien d’inscription</button></div>}
          {invitations.isLoading && <p className="adm-note">Vérification des invitations actives…</p>}
          {invitations.isError && <p className="adm-error">Les invitations n’ont pas pu être chargées. La création est bloquée pour préserver la limite de quatre places.</p>}
          <p className="adm-note">Un lien seul ouvre l’inscription de son destinataire. Pour voir le tableau admin, chaque personne doit accepter son invitation puis se connecter normalement.</p>
        </div> : <p className="adm-note">La création et la révocation des invitations sont réservées au propriétaire du projet.</p>}
      </section>
      <section className="adm-card adm-activity"><div className="adm-card-heading"><div><span className="adm-eyebrow">ACTIVITÉ RÉCENTE</span><h2>Commandes</h2></div><span className="adm-activity-count">{data.counts.orders} total</span></div>
        {data.recentOrders.length ? <div className="adm-order-list">{data.recentOrders.map((order) => <article className="adm-order-row" key={order.id}><span className={`adm-order-dot ${order.status}`} /><div><b>{order.postTitle}</b><small>{order.buyerName} · {timeLabel(order.createdAt)}</small></div><span className={`adm-status ${order.status}`}>{statusLabel[order.status] || order.status}</span></article>)}</div> : <div className="adm-empty"><span>📦</span><p>Aucune commande pour l’instant.</p></div>}
      </section>
    </div>
    <div className="adm-money-wrap"><AdminPaymentPanel isOwner={data.canManageAdmins} /></div>
    <footer className="adm-footer"><span>AGRONEX · Administration sécurisée</span><span>Les invitations sont liées à l’e-mail et leur validation est faite sur le serveur.</span></footer>
  </main>;
}
