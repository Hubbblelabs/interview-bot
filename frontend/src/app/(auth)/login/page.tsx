"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogIn, Loader2, ArrowRight } from "lucide-react";
import api from "@/lib/api";
import { setToken, setUser } from "@/lib/auth";
import { SmokeBackground } from "@/components/ui/spooky-smoke-animation";
import { toast } from "sonner";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data } = await api.post("/auth/login", { email, password });
      setToken(data.access_token);
      setUser(data.user);
      
      toast.success("Welcome back!", {
        description: `Successfully signed in as ${data.user.name}`,
      });

      if (data.user.role === "admin") {
        router.push("/admin");
      } else {
        router.push("/dashboard");
      }
    } catch (err: any) {
      toast.error("Authentication Failed", {
        description: err.response?.data?.detail || "Please check your credentials and try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-white overflow-hidden font-sans">
      {/* Left: Details Side */}
      <div className="flex-1 flex items-center justify-center p-8 sm:p-16 lg:p-24 relative z-10 bg-white">
        <div className="w-full max-w-sm animate-fade-in-up">
          <div className="mb-12">
            <h1 className="text-5xl font-black tracking-tighter mb-4 text-primary leading-tight font-sans">Welcome <br/>Back</h1>
            <p className="text-muted-foreground text-lg font-medium">Please enter your details to prepare.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-3">
              <label className="text-[10px] font-black text-primary/40 uppercase tracking-[0.2em] ml-1">Email Identifier</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full px-5 py-4 bg-primary/5 border-2 border-transparent focus:border-primary/20 focus:bg-white rounded-2xl transition-all text-primary font-semibold text-lg placeholder:text-primary/20 shadow-sm"
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between ml-1">
                <label className="text-[10px] font-black text-primary/40 uppercase tracking-[0.2em]">Secret Key</label>
                <Link href="#" className="text-xs font-black text-primary hover:underline tracking-tighter">FORGOT?</Link>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full px-5 py-4 bg-primary/5 border-2 border-transparent focus:border-primary/20 focus:bg-white rounded-2xl transition-all text-primary font-semibold text-lg placeholder:text-primary/20 shadow-sm"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-10 py-5 bg-primary text-white rounded-2xl font-black text-xl hover:bg-black transition-all shadow-2xl flex items-center justify-center gap-4 group"
            >
              {loading ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : (
                <>
                  <span>SIGN IN</span>
                  <ArrowRight className="w-6 h-6 group-hover:translate-x-2 transition-transform" />
                </>
              )}
            </button>
          </form>

          <p className="mt-12 text-muted-foreground font-bold tracking-tight">
            NEW HERE?{" "}
            <Link href="/register" className="text-primary hover:underline border-b-2 border-primary">
              CREATE ACCOUNT
            </Link>
          </p>
        </div>
      </div>

      {/* Right: Smoke Side */}
      <div className="hidden lg:flex w-[45%] relative bg-[#020617] items-center justify-center overflow-hidden">
        <SmokeBackground 
          smokeColor="#1E40AF" // Deep Blue
          baseColor="#020617"  // Very Dark Base
          brightness={0.05}     // Dark theme
        />
        <div className="relative z-10 text-center px-12 animate-fade-in delay-500">
          <h2 className="text-white text-6xl font-black tracking-tighter leading-[0.9] mb-4">
            Interview prep <br/>Anywhere Anytime❤️
          </h2>
          <div className="w-20 h-1 bg-white/20 mx-auto rounded-full" />
        </div>
      </div>
    </div>
  );
}
