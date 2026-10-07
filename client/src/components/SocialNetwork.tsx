import { FormEvent, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { BOOST_DISABLED_MESSAGE } from "@shared/payment-policy";

type SocialView = "feed" | "search" | "create" | "notifications" | "me" | "settings" | "connections" | "saved" | "profile";
type FeedPost = {
  id: string; authorId: number; body: string; mediaUrl: string | null; sourcePostId: string | null;
  kind: "post" | "repost" | "quote"; visibility: "public" | "connections"; createdAt: number;
  authorName: string; authorAvatar: string | null; authorLocation: string; authorRole: string;
  likeCount: number; commentCount: number; liked: boolean; saved: boolean; following: boolean;
  connected: boolean; requestStatus: "pending" | "accepted" | "declined" | null;
  requestDirection: "incoming" | "outgoing" | null; requestId: string | null;
  sourcePost: { id: string; authorId: number; body: string; mediaUrl: string | null; visibility: "public" | "connections"; createdAt: number; authorName: string; authorAvatar: string | null } | null;
};

const timeAgo = (value: number) => {
  const minutes = Math.max(0, Math.floor((Date.now() - value) / 60000));
  if (minutes < 1) return "à l’instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  return `il y a ${Math.floor(hours / 24)} j`;
};

async function compress(file: File) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => b ? resolve(b) : reject(new Error("Compression photo impossible")), "image/jpeg", .8));
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("Lecture de la photo impossible")); reader.readAsDataURL(blob);
  });
}

export default function SocialNetwork({ me, onMarket }: { me: { userId: number; name: string; avatarUrl?: string | null; bio?: string | null; location: string; role: string }; onMarket: () => void }) {
  const [view, setView] = useState<SocialView>("feed");
  const [mode, setMode] = useState<"for-you" | "following" | "connections">("for-you");
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [body, setBody] = useState("");
  const [quote, setQuote] = useState("");
  const [visibility, setVisibility] = useState<"public" | "connections">("public");
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(me.avatarUrl ?? null);
  const [bio, setBio] = useState(me.bio ?? "");
  const [displayName, setDisplayName] = useState(me.name);
  const [location, setLocation] = useState(me.location);
  const [commentPost, setCommentPost] = useState<FeedPost | null>(null);
  const [repostPost, setRepostPost] = useState<FeedPost | null>(null);
  const [toast, setToast] = useState("");
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const utils = trpc.useUtils();
  const feedInput = useMemo(() => ({ mode }), [mode]);
  const searchInput = useMemo(() => ({ query }), [query]);
  const [sharedPostId, setSharedPostId] = useState<string | null>(() => new URLSearchParams(window.location.search).get("post"));
  const feed = trpc.agronex.social.feed.useQuery(feedInput, { enabled: view === "feed", refetchOnWindowFocus: true });
  const sharedPost = trpc.agronex.social.post.useQuery({ postId: sharedPostId ?? "00000000-0000-4000-8000-000000000000" }, { enabled: Boolean(sharedPostId) });
  const search = trpc.agronex.social.search.useQuery(searchInput, { enabled: view === "search" && query.trim().length >= 2 });
  const postSearch = trpc.agronex.social.searchPosts.useQuery(searchInput, { enabled: view === "search" && query.trim().length >= 2 });
  const memberProfile = trpc.agronex.social.profile.useQuery({ userId: selectedUserId ?? me.userId }, { enabled: view === "profile" && selectedUserId !== null });
  const saved = trpc.agronex.social.saved.useQuery(undefined, { enabled: view === "saved" });
  const notifications = trpc.agronex.social.notifications.useQuery(undefined, { refetchInterval: 30000, refetchOnWindowFocus: true });
  const connections = trpc.agronex.social.connections.useQuery(undefined, { enabled: view === "connections" });
  const settings = trpc.agronex.social.settings.useQuery(undefined, { enabled: view === "settings" });
  const comments = trpc.agronex.social.comments.useQuery({ postId: commentPost?.id ?? "00000000-0000-4000-8000-000000000000" }, { enabled: Boolean(commentPost) });
  const upload = trpc.agronex.photos.upload.useMutation();
  const publish = trpc.agronex.social.publish.useMutation({ onSuccess: async () => { setBody(""); setMediaUrl(null); setPreview(null); setView("feed"); setMode("for-you"); setToast("Publication partagée avec le réseau"); await utils.agronex.social.feed.invalidate(); } });
  const comment = trpc.agronex.social.comment.useMutation({ onSuccess: async () => { await Promise.all([utils.agronex.social.comments.invalidate(), utils.agronex.social.feed.invalidate()]); setToast("Commentaire ajouté"); } });
  const likeOrSave = trpc.agronex.social.toggle.useMutation({ onSuccess: async () => { await Promise.all([utils.agronex.social.feed.invalidate(), utils.agronex.social.saved.invalidate()]); } });
  const follow = trpc.agronex.social.follow.useMutation({ onSuccess: async (result) => { setToast(result.following ? "Vous suivez ce membre" : "Abonnement retiré"); await Promise.all([utils.agronex.social.feed.invalidate(), utils.agronex.social.search.invalidate()]); } });
  const request = trpc.agronex.social.requestConnection.useMutation({ onSuccess: async () => { setToast("Demande de connexion envoyée"); await Promise.all([utils.agronex.social.feed.invalidate(), utils.agronex.social.search.invalidate(), utils.agronex.social.connections.invalidate()]); } });
  const respond = trpc.agronex.social.respondConnection.useMutation({ onSuccess: async () => { await Promise.all([utils.agronex.social.connections.invalidate(), utils.agronex.social.feed.invalidate()]); setToast("Demande mise à jour"); } });
  const repost = trpc.agronex.social.repost.useMutation({ onSuccess: async () => { setRepostPost(null); setQuote(""); setToast("Publication repartagée"); await utils.agronex.social.feed.invalidate(); } });
  const saveSettings = trpc.agronex.social.updateSettings.useMutation({ onSuccess: async () => { setToast("Paramètres enregistrés"); await Promise.all([utils.agronex.social.settings.invalidate(), utils.agronex.social.feed.invalidate()]); } });
  const saveProfile = trpc.agronex.social.updateProfile.useMutation({ onSuccess: async () => { setToast("Profil mis à jour"); await utils.agronex.profile.me.invalidate(); } });
  const markRead = trpc.agronex.social.markNotificationsRead.useMutation({ onSuccess: async () => { await utils.agronex.social.notifications.invalidate(); } });

  const fail = (error: unknown) => setToast(error instanceof Error ? error.message : "Une erreur est survenue. Réessayez.");
  const handleUpload = async (file?: File, purpose: "product" | "profile" | "social" = "social") => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { setUploadError("Choisissez un fichier image."); return; }
    setUploadError(""); setUploadBusy(true);
    try {
      const dataUrl = await compress(file);
      const result = await upload.mutateAsync({ dataUrl, contentType: "image/jpeg", purpose });
      if (purpose === "profile") setProfilePhoto(result.url);
      else { setPreview(dataUrl); setMediaUrl(result.url); }
    } catch (error) { setUploadError(error instanceof Error ? error.message : "Envoi de la photo impossible."); }
    finally { setUploadBusy(false); }
  };
  const onPublish = (event: FormEvent) => { event.preventDefault(); publish.mutate({ body, mediaUrl, visibility }, { onError: fail }); };
  const doShare = async (post: FeedPost) => {
    const url = `${window.location.origin}/?post=${encodeURIComponent(post.id)}`;
    try { if (navigator.share) await navigator.share({ title: "Publication AGRONEX", text: post.body.slice(0, 150), url }); else { await navigator.clipboard.writeText(url); setToast("Lien de publication copié"); } }
    catch { /* annulation du partage natif */ }
  };
  const unreadCount = notifications.data?.filter((n) => !n.readAt).length ?? 0;

  return <section className="agx-social" aria-label="Réseau social AGRONEX">
    <header className="agx-social-top">
      <a className="agx-social-logo" href="#social" onClick={(e) => { e.preventDefault(); setView("feed"); setMode("for-you"); }}>🌱 AGRONEX</a>
      {view === "feed" ? <nav className="agx-social-tabs" aria-label="Fil"><button className={mode === "following" ? "active" : ""} onClick={() => setMode("following")}>Suivis</button><button className={mode === "connections" ? "active" : ""} onClick={() => setMode("connections")}>Ami(e)s</button><button className={mode === "for-you" ? "active" : ""} onClick={() => setMode("for-you")}>Pour toi</button></nav> : <strong className="agx-social-heading">{view === "search" ? "Découvrir" : view === "create" ? "Nouvelle publication" : view === "notifications" ? "Notifications" : view === "connections" ? "Connexions" : view === "saved" ? "Enregistrés" : view === "settings" ? "Paramètres" : view === "profile" ? "Profil membre" : "Mon profil"}</strong>}
      <button className="agx-social-search-icon" onClick={() => setView("search")} aria-label="Rechercher">⌕</button>
    </header>

    <div className="agx-social-content">
      {view === "feed" && <>
        <form className="agx-quick-publish" onClick={() => setView("create")}><Avatar name={me.name} url={me.avatarUrl} /><span>Partager une récolte, une idée…</span><b>＋</b></form>
        {sharedPostId && <article className="agx-shared-highlight"><span className="agx-post-topline">PUBLICATION PARTAGÉE AVEC VOUS</span>{sharedPost.isLoading ? <SocialLoading /> : !sharedPost.data ? <p>Cette publication n’est plus disponible ou son auteur l’a réservée à ses connexions.</p> : <><div className="agx-create-author"><Avatar name={sharedPost.data.authorName} url={sharedPost.data.authorAvatar} /><div><b>{sharedPost.data.authorName}</b><small>{sharedPost.data.authorRole} · {timeAgo(sharedPost.data.createdAt)}</small></div></div>{sharedPost.data.body && <p>{sharedPost.data.body}</p>}{sharedPost.data.mediaUrl && <img src={sharedPost.data.mediaUrl} alt={`Publication de ${sharedPost.data.authorName}`} />}</>}</article>}
        {feed.isLoading ? <SocialLoading /> : !feed.data?.length ? <SocialEmpty title={mode === "following" ? "Vous ne suivez personne pour l’instant" : "Le fil démarre ici"} copy="Découvrez des membres, publiez une histoire ou partagez une récolte avec la communauté." action={() => setView("search")} label="Découvrir des membres" /> : <div className="agx-social-feed">{(feed.data as FeedPost[]).map((post) => <SocialPostCard key={post.id} post={post} meId={me.userId} onLike={() => likeOrSave.mutate({ postId: post.id, action: "like" }, { onError: fail })} onSave={() => likeOrSave.mutate({ postId: post.id, action: "save" }, { onError: fail })} onFollow={() => follow.mutate({ userId: post.authorId }, { onError: fail })} onConnect={() => request.mutate({ userId: post.authorId }, { onError: fail })} onComment={() => setCommentPost(post)} onRepost={() => { setRepostPost(post); setQuote(""); }} onShare={() => void doShare(post)} onProfile={(userId) => { setSelectedUserId(userId); setView("profile"); }} onAccept={(requestId) => respond.mutate({ requestId, accept: true }, { onError: fail })} />)}</div>}
      </>}

      {view === "search" && <div className="agx-social-discover">
        <label className="agx-search-field"><span>⌕</span><input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Personnes, récoltes, villes…" /></label>
        {query.trim().length < 2 ? <SocialEmpty title="Une recherche agricole" copy="Saisissez au moins deux caractères pour trouver des membres et des publications." /> : <>
          <p className="agx-social-caption">MEMBRES</p>
          {search.isLoading ? <SocialLoading /> : !search.data?.length ? <p className="agx-inline-empty">Aucun membre correspondant.</p> : <div className="agx-people-list">{search.data.map((person) => <article className="agx-person-row agx-person-clickable" key={person.userId} onClick={() => { setSelectedUserId(person.userId); setView("profile"); }}><Avatar name={person.name} url={person.avatarUrl} /><div className="agx-person-copy"><b>{person.name}</b><small>{person.role} · {person.location}</small>{person.bio && <span>{person.bio}</span>}</div><div className="agx-person-actions"><button onClick={(e) => { e.stopPropagation(); follow.mutate({ userId: person.userId }, { onError: fail }); }}>Suivre</button><button className="light" onClick={(e) => { e.stopPropagation(); request.mutate({ userId: person.userId }, { onError: fail }); }}>Se connecter</button></div></article>)}</div>}
          <p className="agx-social-caption agx-space-top">PUBLICATIONS</p>
          {postSearch.isLoading ? <SocialLoading /> : !postSearch.data?.length ? <p className="agx-inline-empty">Aucune publication publique correspondante.</p> : <div className="agx-people-list">{postSearch.data.map((post) => <button className="agx-search-post" key={post.id} onClick={() => { setSharedPostId(post.id); window.history.replaceState(null, "", `/?post=${encodeURIComponent(post.id)}`); setView("feed"); }}><span className="agx-search-post-author"><Avatar name={post.authorName} url={post.authorAvatar} /><span><b>{post.authorName}</b><small>{post.authorRole} · {timeAgo(post.createdAt)}</small></span></span><span className="agx-search-post-body">{post.body || "Photo AGRONEX"}</span>{post.mediaUrl && <img src={post.mediaUrl} alt="Aperçu de la publication" />}</button>)}</div>}
        </>}</div>}

      {view === "profile" && <div className="agx-member-profile">{memberProfile.isLoading ? <SocialLoading /> : !memberProfile.data ? <SocialEmpty title="Profil introuvable" copy="Ce profil n’est pas disponible." action={() => setView("search")} label="Revenir à la recherche" /> : <><div className="agx-member-cover" /><div className="agx-member-summary"><Avatar name={memberProfile.data.name} url={memberProfile.data.avatarUrl} size="large" /><h2>{memberProfile.data.name}</h2><span>{memberProfile.data.role} · {memberProfile.data.location}</span>{memberProfile.data.bio && <p>{memberProfile.data.bio}</p>}<div className="agx-member-stats"><span><b>{memberProfile.data.followerCount}</b> abonnés</span><span><b>{memberProfile.data.followingCount}</b> abonnements</span></div>{memberProfile.data.isPrivate ? <div className="agx-private-note">Ce profil est privé. Connectez-vous à cette personne pour voir ses publications.</div> : memberProfile.data.userId !== me.userId && <div className="agx-person-actions agx-member-actions"><button onClick={() => follow.mutate({ userId: memberProfile.data!.userId }, { onError: fail })}>{memberProfile.data.following ? "Suivi" : "＋ Suivre"}</button>{memberProfile.data.connected ? <span className="agx-connected-badge">CONNECTÉ</span> : memberProfile.data.requestStatus === "pending" ? <span className="agx-connected-badge pending">DEMANDE EN ATTENTE</span> : <button className="light" onClick={() => request.mutate({ userId: memberProfile.data!.userId }, { onError: fail })}>＋ Se connecter</button>}</div>}</div><p className="agx-social-caption agx-member-posts-title">PUBLICATIONS</p>{memberProfile.data.isPrivate ? <SocialEmpty title="Contenu réservé" copy="Les publications de ce profil ne sont visibles que par ses connexions." /> : !memberProfile.data.posts.length ? <SocialEmpty title="Aucune publication" copy="Ce membre n’a pas encore publié dans son fil." /> : memberProfile.data.posts.map((post) => <article className="agx-saved-card" key={post.id}><div className="agx-create-author"><Avatar name={memberProfile.data!.name} url={memberProfile.data!.avatarUrl} /><div><b>{memberProfile.data!.name}</b><small>{timeAgo(post.createdAt)}</small></div></div><p>{post.body}</p>{post.mediaUrl && <img src={post.mediaUrl} alt={`Publication de ${memberProfile.data!.name}`} />}</article>)}</>}</div>}

      {view === "create" && <form className="agx-social-create" onSubmit={onPublish}><div className="agx-create-author"><Avatar name={me.name} url={me.avatarUrl} /><div><b>{me.name}</b><small>{me.location}</small></div></div><textarea autoFocus maxLength={1800} rows={5} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Que se passe-t-il dans votre exploitation ou votre communauté ?" /><label className="agx-create-visibility">Qui peut voir ? <select value={visibility} onChange={(e) => setVisibility(e.target.value as "public" | "connections")}><option value="public">Tout AGRONEX</option><option value="connections">Mes connexions</option></select></label>{preview && <div className="agx-create-preview"><img src={preview} alt="Aperçu de la photo à publier" /><button type="button" onClick={() => { setPreview(null); setMediaUrl(null); }}>Retirer</button></div>}{uploadError && <small className="agx-upload-error">{uploadError}</small>}<div className="agx-create-actions"><label className="agx-add-photo">▧ Photo<input type="file" accept="image/*" capture="environment" onChange={(e) => void handleUpload(e.target.files?.[0])} /></label><span>{body.length}/1800</span><button type="submit" disabled={publish.isPending || uploadBusy || (!body.trim() && !mediaUrl)}>{publish.isPending ? "Publication…" : uploadBusy ? "Envoi photo…" : "Publier"}</button></div></form>}

      {view === "notifications" && <div className="agx-social-notifications"><div className="agx-social-heading-row"><span className="agx-social-caption">VOTRE ACTIVITÉ</span>{unreadCount > 0 && <button onClick={() => markRead.mutate(undefined, { onError: fail })}>Tout marquer comme lu</button>}</div>{notifications.isLoading ? <SocialLoading /> : !notifications.data?.length ? <SocialEmpty title="Pas encore de notifications" copy="Les nouveaux abonnements, réactions et demandes de connexion apparaîtront ici." /> : notifications.data.map((item) => <article className={`agx-notification ${item.readAt ? "" : "unread"}`} key={item.id}><Avatar name={item.actorName ?? "A"} url={item.actorAvatar} /><div><p><b>{item.actorName ?? "Un membre"}</b> {item.message}</p><small>{timeAgo(item.createdAt)}</small></div><span className="agx-notification-mark">{item.kind === "like" ? "♥" : item.kind === "comment" ? "▤" : item.kind === "connection" ? "＋" : "●"}</span></article>)}</div>}

      {view === "connections" && <div className="agx-social-connections">{connections.isLoading ? <SocialLoading /> : <><p className="agx-social-caption">DEMANDES REÇUES</p>{!connections.data?.incoming.length ? <p className="agx-inline-empty">Aucune demande en attente.</p> : connections.data.incoming.map((item) => <article className="agx-person-row" key={item.id}><Avatar name={item.profile?.name ?? "Membre"} url={item.profile?.avatarUrl} /><div className="agx-person-copy"><b>{item.profile?.name}</b><small>{item.profile?.location}</small></div><div className="agx-person-actions"><button onClick={() => respond.mutate({ requestId: item.id, accept: true }, { onError: fail })}>Accepter</button><button className="light" onClick={() => respond.mutate({ requestId: item.id, accept: false }, { onError: fail })}>Ignorer</button></div></article>)}<p className="agx-social-caption agx-space-top">MES CONNEXIONS</p>{!connections.data?.accepted.length ? <p className="agx-inline-empty">Vos connexions acceptées apparaîtront ici.</p> : connections.data.accepted.map((person: any) => <article className="agx-person-row" key={person.userId}><Avatar name={person.name} url={person.avatarUrl} /><div className="agx-person-copy"><b>{person.name}</b><small>{person.role} · {person.location}</small></div><span className="agx-connected-badge">CONNECTÉ</span></article>)}<p className="agx-social-caption agx-space-top">ENVOYÉES</p>{(connections.data?.outgoing ?? []).map((item) => <article className="agx-person-row" key={item.id}><Avatar name={item.profile?.name ?? "Membre"} url={item.profile?.avatarUrl} /><div className="agx-person-copy"><b>{item.profile?.name}</b><small>En attente de réponse</small></div><span className="agx-connected-badge pending">EN ATTENTE</span></article>)}</>}</div>}

      {view === "saved" && <div className="agx-social-saved">{saved.isLoading ? <SocialLoading /> : !saved.data?.length ? <SocialEmpty title="Rien d’enregistré" copy="Touchez le marque-page d’une publication pour la retrouver ici." /> : saved.data.map((post: any) => <article className="agx-saved-card" key={post.id}><div className="agx-create-author"><Avatar name={post.authorName} url={post.authorAvatar} /><div><b>{post.authorName}</b><small>{timeAgo(post.createdAt)}</small></div></div><p>{post.body}</p>{post.mediaUrl && <img src={post.mediaUrl} alt="Publication enregistrée" />}</article>)}</div>}

      {view === "me" && <div className="agx-social-me"><div className="agx-my-profile-card"><div className="agx-profile-banner" /><label className="agx-profile-avatar-upload"><Avatar name={displayName} url={profilePhoto} size="large" /><input type="file" accept="image/*" capture="user" onChange={(e) => void handleUpload(e.target.files?.[0], "profile")} aria-label="Choisir une photo de profil" /></label><div className="agx-my-profile-info"><h2>{displayName}</h2><span>{me.role} · {location}</span><p>{bio || "Ajoutez une courte présentation de votre activité."}</p><button onClick={() => setView("settings")}>Modifier le profil</button></div></div><div className="agx-my-shortcuts"><button onClick={() => setView("saved")}><span>▮</span><b>Publications enregistrées</b><i>›</i></button><button onClick={() => setView("connections")}><span>♧</span><b>Connexions et demandes</b><i>›</i></button><button onClick={() => setView("settings")}><span>⚙</span><b>Paramètres et confidentialité</b><i>›</i></button><button onClick={onMarket}><span>🌾</span><b>Marché agricole</b><i>›</i></button></div><button className="agx-boost-card" type="button" disabled title={BOOST_DISABLED_MESSAGE}><span>✦</span><b>Boost désactivé</b><small>Les boosts et abonnements sont désactivés.</small><i>—</i></button></div>}

      {view === "settings" && <div className="agx-social-settings"><form className="agx-settings-profile" onSubmit={(e) => { e.preventDefault(); saveProfile.mutate({ name: displayName, location, bio, avatarUrl: profilePhoto }, { onError: fail }); }}><div className="agx-settings-avatar"><label className="agx-profile-avatar-upload"><Avatar name={displayName} url={profilePhoto} size="large" /><input type="file" accept="image/*" capture="user" onChange={(e) => void handleUpload(e.target.files?.[0], "profile")} aria-label="Choisir une photo de profil" /></label><small>{uploadBusy ? "Téléversement…" : "Touchez pour changer la photo"}</small></div><label>Nom affiché<input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={160} required /></label><label>Ville<input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={160} required /></label><label>À propos<textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={240} rows={3} placeholder="Présentez votre activité agricole…" /></label><button className="agx-settings-save" disabled={saveProfile.isPending}>{saveProfile.isPending ? "Enregistrement…" : "Enregistrer le profil"}</button></form><div className="agx-settings-privacy"><p className="agx-social-caption">CONFIDENTIALITÉ</p><SettingToggle title="Profil privé" description="Seules vos connexions acceptées voient vos publications." checked={settings.data?.privateProfile ?? false} onChange={(value) => saveSettings.mutate({ privateProfile: value, allowConnectionRequests: settings.data?.allowConnectionRequests ?? true }, { onError: fail })} /><SettingToggle title="Demandes de connexion" description="Permettre aux autres membres de vous envoyer une demande." checked={settings.data?.allowConnectionRequests ?? true} onChange={(value) => saveSettings.mutate({ privateProfile: settings.data?.privateProfile ?? false, allowConnectionRequests: value }, { onError: fail })} /></div><p className="agx-settings-note">Vos publications, abonnements, réactions et préférences sont enregistrés dans votre compte et synchronisés entre vos appareils.</p></div>}
    </div>

    <nav className="agx-social-bottom" aria-label="Navigation AGRONEX"><button className={view === "feed" ? "active" : ""} onClick={() => setView("feed")}><span>⌂</span><small>Accueil</small></button><button className={view === "search" ? "active" : ""} onClick={() => setView("search")}><span>⌕</span><small>Découvrir</small></button><button className="create" onClick={() => setView("create")} aria-label="Créer une publication"><span>＋</span></button><button className={view === "notifications" || view === "connections" ? "active" : ""} onClick={() => { setView("notifications"); markRead.mutate(undefined); }}><span>▢{unreadCount > 0 && <i>{unreadCount > 99 ? "99+" : unreadCount}</i>}</span><small>Activité</small></button><button className={view === "me" || view === "settings" || view === "saved" ? "active" : ""} onClick={() => setView("me")}><span>♙</span><small>Moi</small></button></nav>

    {commentPost && <div className="agx-social-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setCommentPost(null); }}><section className="agx-social-sheet"><button className="agx-social-sheet-close" onClick={() => setCommentPost(null)}>×</button><h2>Commentaires</h2><div className="agx-comment-list">{comments.isLoading ? <SocialLoading /> : !comments.data?.length ? <p className="agx-inline-empty">Soyez la première personne à commenter.</p> : comments.data.map((item) => <article className="agx-comment" key={item.id}><Avatar name={item.authorName} url={item.avatarUrl} /><div><b>{item.authorName}</b><p>{item.body}</p><small>{timeAgo(item.createdAt)}</small></div></article>)}</div><form className="agx-comment-form" onSubmit={(e) => { e.preventDefault(); const form = new FormData(e.currentTarget); const value = String(form.get("body") ?? "").trim(); if (commentPost && value) comment.mutate({ postId: commentPost.id, body: value }, { onError: fail }); e.currentTarget.reset(); }}><input name="body" maxLength={1200} placeholder="Écrire un commentaire…" required /><button disabled={comment.isPending}>Envoyer</button></form></section></div>}
    {repostPost && <div className="agx-social-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setRepostPost(null); }}><section className="agx-social-sheet agx-repost-sheet"><button className="agx-social-sheet-close" onClick={() => setRepostPost(null)}>×</button><h2>Repartager</h2><p>Ajoutez une citation ou republiez directement cette publication.</p><textarea rows={3} maxLength={1000} value={quote} onChange={(e) => setQuote(e.target.value)} placeholder="Ajouter votre point de vue (facultatif)" /><div className="agx-repost-actions"><button className="secondary" onClick={() => repost.mutate({ postId: repostPost.id, quote: "" }, { onError: fail })}>↻ Republier</button><button onClick={() => repost.mutate({ postId: repostPost.id, quote }, { onError: fail })}>Citer la publication</button></div></section></div>}
    {toast && <div className="agx-toast" role="status">{toast}<button onClick={() => setToast("")} aria-label="Fermer">×</button></div>}
  </section>;
}

function Avatar({ name, url, size }: { name?: string | null; url?: string | null; size?: "large" }) {
  return <span className={`agx-social-avatar ${size === "large" ? "large" : ""}`}>{url ? <img src={url} alt={`Photo de ${name ?? "profil"}`} /> : (name || "A").trim().slice(0, 1).toUpperCase()}</span>;
}

function SocialPostCard({ post, meId, onLike, onSave, onFollow, onConnect, onComment, onRepost, onShare, onProfile, onAccept }: {
  post: FeedPost; meId: number; onLike: () => void; onSave: () => void; onFollow: () => void; onConnect: () => void; onComment: () => void; onRepost: () => void; onShare: () => void; onProfile: (userId: number) => void; onAccept: (id: string) => void;
}) {
  const source = trpc.agronex.social.profile.useQuery({ userId: post.authorId }, { enabled: false });
  return <article className="agx-social-post"><div className="agx-post-topline">{post.kind === "repost" ? "↻ Publication repartagée" : post.kind === "quote" ? "✎ Publication citée" : post.visibility === "connections" ? "♧ Connexions" : "🌱 AGRONEX · COMMUNAUTÉ"}</div><div className="agx-post-author"><button className="agx-author-button" onClick={() => onProfile(post.authorId)}><Avatar name={post.authorName} url={post.authorAvatar} /><span><b>{post.authorName}</b><small>{post.authorRole} · {post.authorLocation} · {timeAgo(post.createdAt)}</small></span></button>{post.authorId !== meId && <div className="agx-author-social-actions"><button onClick={onFollow}>{post.following ? "Suivi" : "+ Suivre"}</button>{post.connected ? <span className="agx-connected-badge">AMI(E)</span> : post.requestStatus === "pending" && post.requestDirection === "outgoing" ? <span className="agx-connected-badge pending">Envoyée</span> : post.requestStatus === "pending" && post.requestDirection === "incoming" ? <button onClick={() => post.requestId && onAccept(post.requestId)}>Accepter</button> : <button className="connect" onClick={onConnect}>＋ Connexion</button>}</div>}</div><div className="agx-post-body">{post.body && <p>{post.body}</p>}{post.sourcePost ? <div className="agx-post-source"><div><Avatar name={post.sourcePost.authorName} url={post.sourcePost.authorAvatar} /><span><b>{post.sourcePost.authorName}</b><small>{timeAgo(post.sourcePost.createdAt)}</small></span></div>{post.sourcePost.body && <p>{post.sourcePost.body}</p>}{post.sourcePost.mediaUrl && <img src={post.sourcePost.mediaUrl} alt={`Publication originale de ${post.sourcePost.authorName}`} loading="lazy" />}</div> : post.sourcePostId && <div className="agx-post-source-unavailable">La publication d’origine n’est plus visible.</div>}{post.mediaUrl && <img src={post.mediaUrl} alt={`Photo publiée par ${post.authorName}`} loading="lazy" />}</div><div className="agx-post-counts"><span>{post.likeCount ? `♥ ${post.likeCount}` : "Soyez le premier à réagir"}</span><span>{post.commentCount ? `${post.commentCount} commentaire${post.commentCount > 1 ? "s" : ""}` : ""}</span></div><div className="agx-post-actions"><button className={post.liked ? "liked" : ""} onClick={onLike}><span>{post.liked ? "♥" : "♡"}</span><small>J’aime</small></button><button onClick={onComment}><span>▤</span><small>Commenter</small></button><button onClick={onRepost}><span>↻</span><small>Reposter</small></button><button onClick={onShare}><span>↗</span><small>Partager</small></button><button className={post.saved ? "saved" : ""} onClick={onSave}><span>{post.saved ? "▮" : "▯"}</span><small>Enregistrer</small></button></div></article>;
}

function SettingToggle({ title, description, checked, onChange }: { title: string; description: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="agx-setting-toggle"><span><b>{title}</b><small>{description}</small></span><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /><i /></label>;
}
function SocialLoading() { return <div className="agx-social-loading"><span className="agx-spinner" />Chargement…</div>; }
function SocialEmpty({ title, copy, action, label }: { title: string; copy: string; action?: () => void; label?: string }) { return <div className="agx-social-empty"><span>🌾</span><b>{title}</b><p>{copy}</p>{action && <button onClick={action}>{label}</button>}</div>; }
