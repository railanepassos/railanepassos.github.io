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
      const { error } = await client.auth.signOut();
      if (error) throw new Error(error.message);
    },

    async getSession(): Promise<Session | null> {
      const { data, error } = await client.auth.getSession();
      if (error) throw new Error(error.message);
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
