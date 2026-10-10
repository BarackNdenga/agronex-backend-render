import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type AuthPanelProps = {
  pendingRole: string | null;
  initialMode: "signin" | "signup";
  onModeChange: (mode: "signin" | "signup") => void;
  onError: (message: string) => void;
};

export default function AuthPanel({ pendingRole, initialMode, onModeChange, onError }: AuthPanelProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [mode, setMode] = useState<"signin" | "signup" | "update">(initialMode);

  useEffect(() => { setMode(initialMode); }, [initialMode]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setMode("update");
    });
    return () => subscription.unsubscribe();
  }, []);

  const switchMode = (next: "signin" | "signup") => {
    setMode(next);
    setNotice("");
    onModeChange(next);
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      if (mode === "update") {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        await supabase.auth.signOut();
        setPassword("");
        setMode("signin");
        onModeChange("signin");
        setNotice("Mot de passe mis à jour. Tu peux te reconnecter.");
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { display_name: name.trim() },
            emailRedirectTo: `${window.location.origin}/`,
          },
        });
        if (error) throw error;
        if (data.session) {
          window.location.replace("/");
          return;
        }
        setMode("signin");
        onModeChange("signin");
        setNotice("Compte créé. Vérifie ta boîte e-mail et confirme ton adresse avant de te connecter.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        window.location.replace("/");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Authentification impossible. Réessaie.";
      onError(message);
    } finally {
      setBusy(false);
    }
  };

  return <section className="agx-social-signup" aria-labelledby="agx-auth-heading">
    <div className="agx-social-signup-heading">
      <span className="agx-kicker">{mode === "signup" ? "CRÉATION DE COMPTE" : mode === "update" ? "RÉCUPÉRATION DU COMPTE" : "CONNEXION SÉCURISÉE"}</span>
      <h3 id="agx-auth-heading">{mode === "signup" ? "Créer un compte AGRONEX" : mode === "update" ? "Choisir un nouveau mot de passe" : "Se connecter à AGRONEX"}</h3>
      <p>{mode === "signup" ? pendingRole ? `Compte Supabase sécurisé pour le profil ${pendingRole}.` : "Un compte Supabase sécurisé pour rejoindre AGRONEX." : mode === "update" ? "Choisis un mot de passe de remplacement pour ton compte." : "Les comptes administrateur sont reconnus automatiquement après connexion."}</p>
    </div>
    <form className="agx-form" onSubmit={submit}>
      {mode === "signup" && <label>Nom complet<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" minLength={2} maxLength={160} required placeholder="ex. Jean Kabila" /></label>}
      {mode !== "update" && <label>Adresse e-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" maxLength={320} required placeholder="vous@exemple.com" /></label>}
      <label>{mode === "update" ? "Nouveau mot de passe" : "Mot de passe"}<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "signup" || mode === "update" ? "new-password" : "current-password"} minLength={mode === "signup" || mode === "update" ? 8 : 1} maxLength={128} required placeholder={mode === "signup" || mode === "update" ? "8 caractères minimum" : "Votre mot de passe"} /></label>
      {notice && <p className="agx-social-signup-note" role="status">{notice}</p>}
      <button className="agx-primary" type="submit" disabled={busy}>{busy ? "Patiente…" : mode === "signup" ? "Créer mon compte" : mode === "update" ? "Mettre à jour le mot de passe" : "Se connecter"}<span>↗</span></button>
    </form>
    {mode === "signin" && <p className="agx-social-signup-note"><button type="button" className="agx-auth-mode" onClick={async () => {
      if (!email.trim()) { onError("Saisis ton adresse e-mail pour recevoir le lien de réinitialisation."); return; }
      setBusy(true);
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/?auth=recovery` });
      setBusy(false);
      if (error) onError(error.message);
      else setNotice("Si cette adresse correspond à un compte, un lien de récupération vient d’être envoyé.");
    }}>Mot de passe oublié ?</button></p>}
    {mode === "signin" ? <p className="agx-social-signup-note">Pas encore de compte ? <button type="button" className="agx-auth-mode" onClick={() => switchMode("signup")}>Créer un compte</button></p> : mode === "signup" ? <p className="agx-social-signup-note">Déjà membre ? <button type="button" className="agx-auth-mode" onClick={() => switchMode("signin")}>Se connecter</button></p> : null}
  </section>;
}
