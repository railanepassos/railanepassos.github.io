import type { SupabaseClient, Session, Subscription, AuthChangeEvent } from "@supabase/supabase-js";

export interface Auth {
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  getSession(): Promise<Session | null>;
  onAuthStateChange(
    callback: (event: AuthChangeEvent, session: Session | null) => void
  ): Subscription;
}

export function createAuth(client: SupabaseClient): Auth {
  return {
    async signIn(email: string, password: string): Promise<void> {
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);
    },

    async signOut(): Promise<void> {
      await client.auth.signOut();
    },

    async getSession(): Promise<Session | null> {
      const { data } = await client.auth.getSession();
      return data.session;
    },

    onAuthStateChange(
      callback: (event: AuthChangeEvent, session: Session | null) => void
    ): Subscription {
      const { data } = client.auth.onAuthStateChange(callback);
      return data.subscription;
    },
  };
}
