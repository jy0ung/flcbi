import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { isSupabaseConfigured } from '@/lib/supabase';

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const authReady = isSupabaseConfigured;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authReady) {
      setError('Supabase Auth is not configured for this environment yet.');
      return;
    }
    setError('');
    setLoading(true);
    const ok = await login(email, password);
    setLoading(false);
    if (!ok) setError('Sign-in failed. Check your credentials or confirm that your account has been provisioned.');
  };

  return (
    <div className="min-h-screen flex items-center justify-center executive-gradient">
      <div className="w-full max-w-md p-8 glass-panel gold-glow animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-lg">F</span>
            </div>
            <h1 className="text-2xl font-bold text-foreground">FLC BI</h1>
          </div>
          <p className="text-muted-foreground text-sm">Business Intelligence Platform</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-foreground">Email</Label>
            <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} className="bg-secondary border-border" placeholder="Enter your work email" disabled={!authReady || loading} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="text-foreground">Password</Label>
            <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} className="bg-secondary border-border" placeholder="Enter password" disabled={!authReady || loading} />
          </div>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <Button type="submit" className="w-full" disabled={!authReady || loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </Button>
        </form>

        <div className="mt-6 p-3 rounded-md bg-secondary/50 border border-border/50">
          <p className="text-xs text-muted-foreground mb-1">Authentication status</p>
          <div className="text-xs text-muted-foreground space-y-1">
            <p>{authReady ? 'Supabase Auth is configured for this environment.' : 'Supabase Auth is not configured yet.'}</p>
            <p>Use a provisioned company account. Demo users are no longer available.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
