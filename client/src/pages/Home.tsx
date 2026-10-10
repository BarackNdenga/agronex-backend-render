import { useEffect, useMemo, useState } from "react";
import { startLogin } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import AuthPanel from "@/components/AuthPanel";
import { ADMIN_RETURN_TARGET_KEY, getAdminReturnTarget } from "@/lib/admin-return";
import { getAdminLandingPath } from "@/lib/admin-routing";
import SocialNetwork from "@/components/SocialNetwork";
import { PAYMENT_DISABLED_MESSAGE, PAYMENT_STATUS_MESSAGE } from "@shared/payment-policy";
import ManualPurchaseDialog from "@/components/ManualPurchaseDialog";
import PaymentWalletPanel from "@/components/PaymentWalletPanel";

type Role = "agriculteur" | "acheteur" | "transporteur" | "investisseur";
type Post = { id: string; farmerId: number; farmerName: string; title: string; qty: number; unit: string; price: number; location: string; photoUrl: string | null; status: string; createdAt: number };
type Order = { id: string; postTitle: string; qty: number; unit: string; pickup: string; buyerLocation: string; buyerName: string; status: "a_transporter" | "en_transport" | "livree"; transporterName: string | null; createdAt: number };
type Message = { id: string; fromName: string; toName: string; text: string; createdAt: number };

const roleInfo: Record<Role, { label: string; icon: string; desc: string }> = {
  agriculteur: { label: "Agriculteur", icon: "🌾", desc: "Publiez vos récoltes et vos terrains" },
  acheteur: { label: "Acheteur", icon: "🛒", desc: "Trouvez des produits frais partout" },
  transporteur: { label: "Transporteur", icon: "🚚", desc: "Prenez en charge des livraisons" },
  investisseur: { label: "Investisseur", icon: "💰", desc: "Suivez le marché et contactez les agriculteurs" },
};
const roleTabs: Record<Role, { id: string; label: string; icon: string }[]> = {
  agriculteur: [{ id: "feed", label: "Le marché", icon: "📰" }, { id: "publier", label: "Publier", icon: "📸" }, { id: "mesposts", label: "Mes produits", icon: "🌱" }, { id: "messages", label: "Messages", icon: "✉️" }, { id: "wallet", label: "Portefeuille", icon: "◈" }],
  acheteur: [{ id: "feed", label: "Le marché", icon: "🛒" }, { id: "mescommandes", label: "Historique", icon: "📦" }, { id: "wallet", label: "Portefeuille", icon: "◈" }],
  transporteur: [{ id: "missions", label: "Missions", icon: "🚚" }, { id: "mesmissions", label: "Mes livraisons", icon: "🧭" }],
  investisseur: [{ id: "feed", label: "Le marché", icon: "📰" }, { id: "messages", label: "Messages", icon: "✉️" }, { id: "wallet", label: "Portefeuille", icon: "◈" }],
};
const units = ["kg", "sacs", "tonnes", "caisses"] as const;
const money = (n: number) => new Intl.NumberFormat("fr-FR").format(n);
const dateLabel = (ts: number) => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(new Date(ts));
const relative = (ts: number) => {
  const m = Math.max(0, Math.floor((Date.now() - ts) / 60000));
  if (m < 1) return "À l’instant";
  if (m < 60) return `Il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Il y a ${h} h`;
  return `Il y a ${Math.floor(h / 24)} j`;
};

function fileAsDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Lecture photo impossible"));
    reader.readAsDataURL(blob);
  });
}
async function compressPhoto(file: File) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Compression photo impossible")), "image/jpeg", 0.78));
  return fileAsDataUrl(blob);
}

export default function Home() {
  const { user, loading: authLoading, isAuthenticated, logout } = useAuth();
  const utils = trpc.useUtils();
  const paymentOptions = trpc.agronex.orders.paymentOptions.useQuery(undefined, { retry: false });
  const paymentStatusCopy = paymentOptions.data?.enabled ? PAYMENT_STATUS_MESSAGE : PAYMENT_DISABLED_MESSAGE;
  const [pendingRole, setPendingRole] = useState<Role | null>(() => {
    try { return sessionStorage.getItem("agronex-pending-role") as Role | null; } catch { return null; }
  });
  const [tab, setTab] = useState("social");
  const [toast, setToast] = useState("");
  const [authMode, setAuthMode] = useState<"signin" | "signup">(() => ["login", "recovery"].includes(new URLSearchParams(window.location.search).get("auth") || "") ? "signin" : "signup");
  const [installHelp, setInstallHelp] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [adminInviteToken, setAdminInviteToken] = useState<string | null>(() => { try { return sessionStorage.getItem("agronex-admin-invitation"); } catch { return null; } });
  const [adminReturnTarget, setAdminReturnTarget] = useState<string | null>(() => { try { return sessionStorage.getItem(ADMIN_RETURN_TARGET_KEY); } catch { return null; } });
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState("");
  const [modal, setModal] = useState<null | { kind: "message"; post: Post }>(null);
  const [purchase, setPurchase] = useState<Post | null>(null);

  const profileQuery = trpc.agronex.profile.me.useQuery(undefined, { enabled: isAuthenticated, retry: false });
  const profile = profileQuery.data ?? null;
  const feedQuery = trpc.agronex.posts.feed.useQuery(undefined, { enabled: Boolean(profile && tab === "feed") });
  const postsQuery = trpc.agronex.posts.mine.useQuery(undefined, { enabled: Boolean(profile && tab === "mesposts") });
  const buyerOrders = trpc.agronex.orders.buyer.useQuery(undefined, { enabled: Boolean(profile && tab === "mescommandes") });
  const openMissions = trpc.agronex.orders.openMissions.useQuery(undefined, { enabled: Boolean(profile && tab === "missions") });
  const myMissions = trpc.agronex.orders.myMissions.useQuery(undefined, { enabled: Boolean(profile && tab === "mesmissions") });
  const messagesQuery = trpc.agronex.messages.mine.useQuery(undefined, { enabled: Boolean(profile && tab === "messages") });

  const profileSave = trpc.agronex.profile.save.useMutation({ onSuccess: async () => { await utils.agronex.profile.me.invalidate(); setToast("Bienvenue sur AGRONEX"); } });
  const postCreate = trpc.agronex.posts.create.useMutation({ onSuccess: async () => { setPhotoUrl(null); setPhotoPreview(null); await Promise.all([utils.agronex.posts.feed.invalidate(), utils.agronex.posts.mine.invalidate()]); setTab("mesposts"); setToast("Produit publié sur le marché"); } });
  const missionClaim = trpc.agronex.orders.claim.useMutation({ onSuccess: async () => { await Promise.all([utils.agronex.orders.openMissions.invalidate(), utils.agronex.orders.myMissions.invalidate()]); setToast("Mission acceptée"); } });
  const missionDeliver = trpc.agronex.orders.deliver.useMutation({ onSuccess: async () => { await utils.agronex.orders.myMissions.invalidate(); setToast("Livraison confirmée"); } });
  const messageSend = trpc.agronex.messages.send.useMutation({ onSuccess: async () => { setModal(null); await utils.agronex.messages.mine.invalidate(); setToast("Message envoyé"); } });
  const photoUpload = trpc.agronex.photos.upload.useMutation();

  useEffect(() => {
    if (profile && tab !== "social") setTab(roleTabs[profile.role].some((t) => t.id === tab) ? tab : roleTabs[profile.role][0].id);
  }, [profile?.userId]);
  useEffect(() => {
    if (profile && new URLSearchParams(window.location.search).has("post")) setTab("social");
  }, [profile?.userId]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authResult = params.get("auth");
    if (!authResult) return;
    if (authResult && authResult !== "login" && authResult !== "recovery") setToast("La connexion n’a pas abouti. Réessaie.");
    params.delete("auth");
    const cleanUrl = `${window.location.pathname}${params.size ? `?${params}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", cleanUrl);
  }, []);
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    const onInstall = (event: Event) => { event.preventDefault(); setInstallPrompt(event); };
    window.addEventListener("beforeinstallprompt", onInstall);
    return () => window.removeEventListener("beforeinstallprompt", onInstall);
  }, []);
  useEffect(() => {
    if (!adminInviteToken || authLoading || !isAuthenticated || window.location.pathname === "/admin/invite") return;
    window.location.replace(`/admin/invite#${encodeURIComponent(adminInviteToken)}`);
  }, [adminInviteToken, authLoading, isAuthenticated]);
  useEffect(() => {
    const destination = getAdminLandingPath(user?.role);
    if (authLoading || !isAuthenticated || !destination || adminInviteToken) return;
    try {
      sessionStorage.removeItem("agronex-pending-role");
      sessionStorage.removeItem(ADMIN_RETURN_TARGET_KEY);
    } catch {}
    setPendingRole(null);
    if (window.location.pathname !== destination) window.location.replace(destination);
  }, [adminInviteToken, authLoading, isAuthenticated, user?.role]);
  useEffect(() => {
    if (authLoading || !isAuthenticated || user?.role === "admin" || !adminReturnTarget) return;
    const target = getAdminReturnTarget(adminReturnTarget, true);
    try { sessionStorage.removeItem(ADMIN_RETURN_TARGET_KEY); } catch {}
    setAdminReturnTarget(null);
    if (target && window.location.pathname !== target) window.location.replace(target);
  }, [adminReturnTarget, authLoading, isAuthenticated, user?.role]);

  const selectRole = (role: Role) => {
    setPendingRole(role);
    setAuthMode("signup");
    try { sessionStorage.setItem("agronex-pending-role", role); } catch { /* private browser */ }
  };
  const showError = (error: unknown) => setToast(error instanceof Error ? error.message : "Une erreur est survenue. Réessayez.");
  const handleProfileSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!pendingRole) { setToast("Choisissez votre profil pour continuer."); return; }
    const form = new FormData(event.currentTarget);
    profileSave.mutate({ name: String(form.get("name") || "").trim(), phone: String(form.get("phone") || "").trim(), location: String(form.get("location") || "").trim(), role: pendingRole }, { onError: showError });
  };
  const handlePhoto = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { setPhotoError("Choisissez un fichier image."); return; }
    try {
      setPhotoError("");
      const dataUrl = await compressPhoto(file);
      setPhotoPreview(dataUrl);
      const result = await photoUpload.mutateAsync({ dataUrl, contentType: "image/jpeg" });
      setPhotoUrl(result.url);
    } catch (error) { setPhotoError(error instanceof Error ? error.message : "Envoi photo impossible"); }
  };
  const handlePost = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!profile) return;
    const form = new FormData(event.currentTarget);
    postCreate.mutate({ title: String(form.get("title") || "").trim(), qty: Number(form.get("qty")), unit: String(form.get("unit") || "kg") as (typeof units)[number], price: Number(form.get("price")), location: String(form.get("location") || profile.location).trim(), photoUrl }, { onError: showError });
  };
  const handleMessage = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!modal || modal.kind !== "message") return;
    messageSend.mutate({ farmerId: modal.post.farmerId, text: String(new FormData(event.currentTarget).get("text") || "").trim() }, { onError: showError });
  };
  const openInstall = async () => {
    if (installPrompt) {
      await installPrompt.prompt();
      setInstallPrompt(null);
    } else setInstallHelp(true);
  };

  const viewPosts = useMemo(() => (tab === "mesposts" ? postsQuery.data : feedQuery.data) as Post[] | undefined, [tab, postsQuery.data, feedQuery.data]);
  const isDataLoading = tab === "feed" ? feedQuery.isLoading : tab === "mesposts" ? postsQuery.isLoading : tab === "mescommandes" ? buyerOrders.isLoading : tab === "missions" ? openMissions.isLoading : tab === "mesmissions" ? myMissions.isLoading : tab === "messages" ? messagesQuery.isLoading : false;
  const orders = (tab === "mescommandes" ? buyerOrders.data : tab === "missions" ? openMissions.data : myMissions.data) as Order[] | undefined;
  const messages = messagesQuery.data as Message[] | undefined;

  if (adminInviteToken && (authLoading || isAuthenticated)) return <main className="agx-loading"><span className="agx-spinner" /><span>Retour à votre invitation privée…</span></main>;
  if (user?.role === "admin" && !adminInviteToken) return <main className="agx-loading"><span className="agx-spinner" /><span>Ouverture de votre espace administrateur…</span></main>;
  if (authLoading || (isAuthenticated && profileQuery.isLoading)) return <main className="agx-loading"><span className="agx-spinner" /><span>Préparation de votre espace AGRONEX…</span></main>;

  if (!isAuthenticated) return <main className="agx-welcome">
    <section className="agx-hero">
      <div className="agx-hero-glow" />
      <div className="agx-brand"><img className="agx-brand-mark" src="/manus-storage/agronex-app-icon-192_22e74f30.png" alt="" /><span>AGRONEX</span></div>
      <img className="agx-hero-logo" src="/manus-storage/agronex-full-logo_1d7959e2.png" alt="AGRONEX — The African Agricultural Nexus, du champ à la valeur" />
      <p className="agx-eyebrow">THE AFRICAN AGRICULTURAL NEXUS</p>
      <h1>Du champ<br />à la <em>consommation.</em></h1>
      <p className="agx-hero-copy">Une même place de marché pour celles et ceux qui cultivent, achètent, transportent et investissent.</p>
      <div className="agx-hero-stats"><div><b>01</b><span>Produire</span></div><i /><div><b>02</b><span>Connecter</span></div><i /><div><b>03</b><span>Avancer</span></div></div>
      <div className="agx-orbit agx-orbit-one" /><div className="agx-orbit agx-orbit-two" />
    </section>
    <section className="agx-role-section">
      <div className="agx-section-heading"><div><span className="agx-kicker">VOTRE ESPACE COMMENCE ICI</span><h2>Choisissez votre profil</h2></div><button className="agx-install" onClick={openInstall} aria-label="Installer AGRONEX">＋ Installer</button></div>
      <div className="agx-role-grid">
        {(Object.entries(roleInfo) as [Role, typeof roleInfo[Role]][]).map(([role, info], index) => <button className={`agx-role-card agx-role-${role}`} key={role} onClick={() => selectRole(role)}>
          <span className="agx-role-index">0{index + 1}</span><span className="agx-role-icon">{info.icon}</span><strong>{info.label}</strong><span className="agx-role-desc">{info.desc}</span><span className="agx-arrow">↗</span>
        </button>)}
      </div>
      {(pendingRole || authMode === "signin") && <>
        {pendingRole && <p className="agx-auth-role-note">Profil choisi : <strong>{roleInfo[pendingRole].label}</strong></p>}
        <AuthPanel pendingRole={pendingRole} initialMode={authMode} onModeChange={setAuthMode} onError={setToast} />
      </>}
      <p className="agx-auth-note">Connexion sécurisée · Vos publications sont partagées entre les appareils</p>
      <p className="agx-payment-disabled" role="status">{PAYMENT_DISABLED_MESSAGE}</p>
    </section>
    <footer className="agx-footer"><span>AGRONEX © {new Date().getFullYear()}</span><div className="agx-auth-footer"><button onClick={() => setAuthMode("signin")}>Déjà membre · se connecter</button><button onClick={openInstall}>Installer sur mon téléphone</button></div></footer>
    {installHelp && <InstallModal onClose={() => setInstallHelp(false)} />}
    {toast && <div className="agx-toast" role="status">{toast}</div>}
  </main>;

  if (!profile) {
    const role = pendingRole;
    return <main className="agx-onboarding">
      <div className="agx-onboarding-actions"><button className="agx-back" onClick={() => { try { sessionStorage.removeItem("agronex-pending-role"); } catch {} setPendingRole(null); }}>← Changer de profil</button></div>
      <div className="agx-form-card"><div className="agx-brand agx-brand-dark"><img className="agx-brand-mark" src="/manus-storage/agronex-app-icon-192_22e74f30.png" alt="" /><span>AGRONEX</span></div>
        <span className="agx-kicker">BIENVENUE DANS LE RÉSEAU</span><h1>Votre profil<br />professionnel.</h1>
        <p className="agx-form-intro">{role ? `${roleInfo[role].icon} ${roleInfo[role].label} · ${roleInfo[role].desc}` : "Complétez votre profil pour rejoindre le marché partagé."}</p>
        <form onSubmit={handleProfileSubmit} className="agx-form">
          {!role && <label>Je suis…<select value={pendingRole || ""} onChange={(e) => { const value = e.target.value as Role; setPendingRole(value); try { sessionStorage.setItem("agronex-pending-role", value); } catch {} }} required><option value="" disabled>Choisir un profil</option>{Object.entries(roleInfo).map(([key, info]) => <option value={key} key={key}>{info.icon} {info.label}</option>)}</select></label>}
          <label>Nom complet<input name="name" defaultValue={user?.name || ""} placeholder="ex. Jean Kabila" required minLength={2} /></label>
          <label>Téléphone (facultatif)<input name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="+243 8xx xxx xxx" /></label>
          <label>Ville / localisation<input name="location" placeholder="ex. Kinshasa, RDC" required minLength={2} /></label>
          <button className="agx-primary" type="submit" disabled={profileSave.isPending}>{profileSave.isPending ? "Création…" : "Créer mon profil"}<span>↗</span></button>
        </form>
        <p className="agx-privacy">Votre identité de connexion est protégée. Seuls le nom, le rôle et les coordonnées de profil sont partagés selon les fonctions de l’application.</p>
        <p className="agx-payment-disabled" role="status">{PAYMENT_DISABLED_MESSAGE}</p>
      </div>
      {toast && <div className="agx-toast" role="status">{toast}</div>}
    </main>;
  }

  const info = roleInfo[profile.role];
  const tabs = roleTabs[profile.role];
  return <main className="agx-app">
    <header className="agx-topbar"><a className="agx-brand agx-brand-light" href="#home" onClick={(e) => { e.preventDefault(); setTab(tabs[0].id); }}><img className="agx-brand-mark" src="/manus-storage/agronex-app-icon-192_22e74f30.png" alt="" /><span>AGRONEX</span></a><div className="agx-top-actions">{tab === "social" && <button className="agx-market-shortcut" onClick={() => setTab(tabs[0].id)}>🌾 Marché</button>}<button className="agx-install agx-install-top" onClick={openInstall}>＋ Installer</button><button className="agx-account" onClick={() => void logout()} aria-label="Se déconnecter"><span>{profile.name.slice(0, 1).toUpperCase()}</span><i>↗</i></button></div></header>
    <section className={`agx-greeting ${tab === "social" ? "is-social-mode" : ""}`}><div><span className="agx-kicker">{info.icon} ESPACE {info.label.toUpperCase()}</span><h1>Bonjour, <em>{profile.name.split(" ")[0]}</em></h1><p>📍 {profile.location} <span>·</span> Le réseau agricole, en mouvement.</p></div><div className="agx-date">{new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(new Date())}</div></section>
    <nav className={`agx-tabs ${tab === "social" ? "is-social-mode" : ""}`} aria-label="Navigation principale">{[...tabs, { id: "social", label: "Réseau", icon: "◎" }].map((item) => <button key={item.id} className={tab === item.id ? "is-active" : ""} onClick={() => setTab(item.id)}><span>{item.icon}</span>{item.label}</button>)}</nav>
    <aside className="agx-payment-disabled" role="status">{paymentStatusCopy}</aside>
    <section className="agx-content" key={tab}>
      {tab === "social" && <SocialNetwork me={profile} onMarket={() => setTab(roleTabs[profile.role][0].id)} />}
      {tab === "publier" && <article className="agx-panel agx-publish-panel"><div className="agx-panel-title"><div><span className="agx-kicker">DIRECTEMENT DE VOTRE EXPLOITATION</span><h2>Mettre en vente</h2></div><span className="agx-title-icon">📸</span></div>
        <form onSubmit={handlePost} className="agx-form agx-publish-form">
          <label className="agx-photo-field">Photo du produit ou du champ
            <span className={`agx-photo-picker ${photoPreview ? "has-photo" : ""}`}>{photoPreview ? <img src={photoPreview} alt="Aperçu du produit" /> : <><b>＋</b><strong>Ajouter une photo</strong><small>Caméra ou galerie · JPG, PNG</small></>}<input type="file" accept="image/*" capture="environment" onChange={(e) => void handlePhoto(e.target.files?.[0])} /></span>
            {photoUpload.isPending && <small>Envoi sécurisé de la photo…</small>}{photoError && <small className="agx-error">{photoError}</small>}
          </label>
          <label>Nom du produit<input name="title" placeholder="ex. Maïs blanc fraîchement récolté" required maxLength={180} /></label>
          <div className="agx-form-row"><label>Quantité<input name="qty" type="number" min="1" placeholder="500" required /></label><label>Unité<select name="unit">{units.map((unit) => <option key={unit}>{unit}</option>)}</select></label></div>
          <label>Prix par unité (FC)<input name="price" type="number" min="1" placeholder="1500" required /></label>
          <label>Lieu de collecte<input name="location" defaultValue={profile.location} required /></label>
          <button className="agx-primary" type="submit" disabled={postCreate.isPending || photoUpload.isPending}>{postCreate.isPending ? "Publication…" : "Publier sur le marché"}<span>↗</span></button>
        </form>
      </article>}

      {(tab === "feed" || tab === "mesposts") && <>
        <div className="agx-market-heading"><div><span className="agx-kicker">{tab === "feed" ? "OFFRES DE LA COMMUNAUTÉ" : "VOTRE CATALOGUE"}</span><h2>{tab === "feed" ? "Le marché" : "Mes produits"}</h2></div><span className="agx-count">{viewPosts?.length ?? 0} {viewPosts?.length === 1 ? "offre" : "offres"}</span></div>
        {isDataLoading ? <Loading /> : !viewPosts?.length ? <Empty icon="🌾" title={tab === "feed" ? "Le marché se réveille" : "Votre catalogue est vide"} copy={tab === "feed" ? "Les prochaines récoltes publiées apparaîtront ici." : "Publiez votre premier produit pour rencontrer des acheteurs."} action={profile.role === "agriculteur" && tab === "mesposts" ? () => setTab("publier") : undefined} actionLabel="Publier un produit" /> : <div className="agx-market-grid">{viewPosts.map((post) => <ProductCard key={post.id} post={post} role={profile.role} own={post.farmerId === profile.userId} paymentEnabled={Boolean(paymentOptions.data?.enabled)} onMessage={() => setModal({ kind: "message", post })} onPurchase={() => setPurchase(post)} />)}</div>}
      </>}

      {tab === "wallet" && <PaymentWalletPanel userId={profile.userId} />}

      {tab === "missions" && <><SectionTitle eyebrow="LIVRAISONS À POURVOIR" title="Missions disponibles" count={openMissions.data?.length} />{isDataLoading ? <Loading /> : !orders?.length ? <Empty icon="🚚" title="Aucune mission pour le moment" copy="De nouvelles commandes seront affichées ici." action={() => void openMissions.refetch()} actionLabel="Actualiser" /> : <div className="agx-list">{orders.map((order) => <OrderCard key={order.id} order={order}><p>📍 Départ : {order.pickup}<br />🎯 Livraison : {order.buyerLocation} · {order.buyerName}</p><button className="agx-primary agx-small" onClick={() => missionClaim.mutate({ id: order.id }, { onError: showError })} disabled={missionClaim.isPending}>🚚 Prendre en charge</button></OrderCard>)}</div>}</>}
      {tab === "mesmissions" && <><SectionTitle eyebrow="VOTRE TOURNÉE" title="Mes livraisons" count={myMissions.data?.length} />{isDataLoading ? <Loading /> : !orders?.length ? <Empty icon="🧭" title="Votre tournée est libre" copy="Acceptez une mission pour commencer une livraison." action={() => setTab("missions")} actionLabel="Voir les missions" /> : <div className="agx-list">{orders.map((order) => <OrderCard key={order.id} order={order}>{order.status === "en_transport" && <button className="agx-primary agx-small" onClick={() => missionDeliver.mutate({ id: order.id }, { onError: showError })} disabled={missionDeliver.isPending}>✓ Confirmer la livraison</button>}</OrderCard>)}</div>}</>}
      {tab === "mescommandes" && <><SectionTitle eyebrow="ACHATS · TRANSFERTS MANUELS MOBILE MONEY" title="Historique des commandes" count={buyerOrders.data?.length} />{isDataLoading ? <Loading /> : !orders?.length ? <Empty icon="📦" title="Aucun achat enregistré" copy="Les commandes M-Pesa/Airtel et leur état de vérification apparaîtront ici. Les paiements restent manuels." action={() => setTab("feed")} actionLabel="Explorer le marché" /> : <div className="agx-list">{orders.map((order) => <OrderCard key={order.id} order={order} />)}</div>}</>}
      {tab === "messages" && <><SectionTitle eyebrow="ÉCHANGES DU RÉSEAU" title="Messages" count={messages?.length} />{isDataLoading ? <Loading /> : !messages?.length ? <Empty icon="✉️" title="Votre boîte est vide" copy={profile.role === "investisseur" ? "Contactez un agriculteur depuis une offre du marché." : "Les messages reçus apparaîtront ici."} action={profile.role === "investisseur" ? () => setTab("feed") : undefined} actionLabel="Parcourir les offres" /> : <div className="agx-list">{messages.map((message) => <article className="agx-message" key={message.id}><span className="agx-message-avatar">{(profile.role === "investisseur" ? message.toName : message.fromName).slice(0, 1)}</span><div><strong>{profile.role === "investisseur" ? `À ${message.toName}` : `De ${message.fromName}`}</strong><p>{message.text}</p><small>{relative(message.createdAt)}</small></div></article>)}</div>}</>}
    </section>
    <footer className="agx-app-footer"><span>{info.icon} {info.label} · {profile.location}</span><button onClick={openInstall}>Installer AGRONEX sur mon téléphone</button></footer>
    {modal?.kind === "message" && <Dialog title={`Écrire à ${modal.post.farmerName}`} onClose={() => setModal(null)}><form onSubmit={handleMessage} className="agx-form"><label>Votre message<textarea name="text" rows={5} placeholder="Bonjour, je souhaite en savoir plus sur votre récolte…" required maxLength={4000} autoFocus /></label><button className="agx-primary" disabled={messageSend.isPending}>{messageSend.isPending ? "Envoi…" : "Envoyer le message"}<span>↗</span></button></form></Dialog>}
    {purchase && <ManualPurchaseDialog product={purchase} onClose={() => setPurchase(null)} onCompleted={() => { void utils.agronex.orders.myPayments.invalidate(); void utils.agronex.orders.buyer.invalidate(); }} />}
    {installHelp && <InstallModal onClose={() => setInstallHelp(false)} />}
    {toast && <div className="agx-toast" role="status">{toast}</div>}
  </main>;
}

function ProductCard({ post, role, own, paymentEnabled, onMessage, onPurchase }: { post: Post; role: Role; own: boolean; paymentEnabled: boolean; onMessage: () => void; onPurchase: () => void }) {
  return <article className="agx-product-card"><div className="agx-product-photo">{post.photoUrl ? <img src={post.photoUrl} alt={post.title} loading="lazy" /> : <span>🌾</span>}<small>{post.status === "disponible" ? "DISPONIBLE" : "RÉSERVÉ"}</small></div><div className="agx-product-body"><div className="agx-producer"><span className="agx-producer-avatar">{post.farmerName.slice(0, 1).toUpperCase()}</span><span><b>{post.farmerName}</b><small>📍 {post.location} · {relative(post.createdAt)}</small></span></div><h3>{post.title}</h3><div className="agx-product-meta"><span>◈ {money(post.qty)} {post.unit}</span><b>{money(post.price)} <small>FC / {post.unit}</small></b></div>{!own && (role === "acheteur" || role === "investisseur") && <button className="agx-primary agx-small agx-payment-button" type="button" onClick={onPurchase} disabled={!paymentEnabled || post.status !== "disponible"} title={paymentEnabled ? "Payer manuellement via M-Pesa ou Airtel Money" : PAYMENT_DISABLED_MESSAGE}>{paymentEnabled ? "Acheter · paiement manuel" : "Paiement non configuré"}</button>}{!own && role === "investisseur" && <button className="agx-secondary agx-small" onClick={onMessage}>✉ Contacter l’agriculteur</button>}{own && <span className="agx-own-tag">Votre annonce</span>}</div></article>;
}
function SectionTitle({ eyebrow, title, count }: { eyebrow: string; title: string; count?: number }) { return <div className="agx-market-heading"><div><span className="agx-kicker">{eyebrow}</span><h2>{title}</h2></div>{count !== undefined && <span className="agx-count">{count} {count === 1 ? "élément" : "éléments"}</span>}</div>; }
function OrderCard({ order, children }: { order: Order; children?: React.ReactNode }) {
  const status = order.status === "livree" ? ["Livrée", "done"] : order.status === "en_transport" ? ["En cours de livraison", "moving"] : ["En attente d’un transporteur", "waiting"];
  return <article className="agx-order-card"><div className="agx-order-top"><span className={`agx-status-dot ${status[1]}`} /><span>{status[0]}</span><time>{dateLabel(order.createdAt)}</time></div><h3>{order.postTitle}</h3><p className="agx-order-qty">{money(order.qty)} {order.unit}</p>{children}</article>;
}
function Empty({ icon, title, copy, action, actionLabel }: { icon: string; title: string; copy: string; action?: () => void; actionLabel?: string }) { return <div className="agx-empty"><span>{icon}</span><h3>{title}</h3><p>{copy}</p>{action && <button className="agx-secondary agx-small" onClick={action}>{actionLabel}</button>}</div>; }
function Loading() { return <div className="agx-loading agx-loading-inline"><span className="agx-spinner" /><span>Chargement…</span></div>; }
function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { return <div className="agx-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><section className="agx-modal" role="dialog" aria-modal="true" aria-label={title}><button className="agx-modal-close" onClick={onClose} aria-label="Fermer">×</button><span className="agx-kicker">AGRONEX · LE RÉSEAU</span><h2>{title}</h2>{children}</section></div>; }
function InstallModal({ onClose }: { onClose: () => void }) { return <Dialog title="Emporter le marché avec vous" onClose={onClose}><div className="agx-install-steps"><div><span>01</span><p><b>Android</b><br />Dans Chrome, ouvrez le menu ⋮ puis choisissez <em>Installer l’application</em> ou <em>Ajouter à l’écran d’accueil</em>.</p></div><div><span>02</span><p><b>iPhone / iPad</b><br />Dans Safari, touchez <em>Partager</em> puis <em>Sur l’écran d’accueil</em>.</p></div></div><button className="agx-secondary agx-small agx-wide" onClick={onClose}>J’ai compris</button></Dialog>; }
