import React, { useState } from 'react';
import { ArrowLeft, ShieldCheck, Lock, Check } from 'lucide-react';
import { saveSubscriptionToFirebase } from '../services/subscriptionService';

interface AdminSectionProps {
  onBack: () => void;
  onSubscriptionStatusChange?: (status: boolean) => void;
}

export const AdminSection: React.FC<AdminSectionProps> = ({
  onBack,
  onSubscriptionStatusChange
}) => {
  const [password, setPassword] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [errorMsg, setErrorMsg] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSuccessAlert, setShowSuccessAlert] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);

  const handleCheckPassword = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (password.trim() === 's2026kp') {
      setIsUnlocked(true);
      setErrorMsg(false);
      setDbError(null);
    } else {
      setErrorMsg(true);
    }
  };

  const handleActivatePlan = async (days: number) => {
    setIsProcessing(true);
    setDbError(null);
    try {
      await saveSubscriptionToFirebase(days);
      onSubscriptionStatusChange?.(true);
      setShowSuccessAlert(true);
      setTimeout(() => {
        setShowSuccessAlert(false);
        onBack();
      }, 2000);
    } catch (err: any) {
      console.error('Admin activation error:', err);
      setDbError('Database Error! Unable to activate plan at this moment.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <main className="min-h-screen bg-black text-white pb-24 font-['Poppins',sans-serif] animate-fadeIn select-none">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-5">
        
        {/* Top Header Bar */}
        <div className="bg-gradient-to-r from-[#1c1917] via-[#292524] to-[#451a03] border border-amber-500/40 rounded-2xl p-4 sm:p-5 mb-6 flex flex-wrap items-center justify-between gap-4 shadow-xl">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border-2 border-amber-500 flex items-center justify-center text-amber-400 shadow-[0_0_18px_rgba(245,158,11,0.35)] shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-white tracking-wide">
                  Admin Panel
                </h1>
                <span className="text-[11px] font-bold bg-amber-500 text-black px-2 py-0.5 rounded-full uppercase">
                  Protected
                </span>
              </div>
              <p className="text-xs text-stone-400 mt-0.5">
                Authorized administrator configuration &amp; plan manager
              </p>
            </div>
          </div>

          <button
            onClick={onBack}
            className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 active:scale-95 text-white text-xs font-bold py-2 px-4 rounded-xl border border-white/20 transition-all cursor-pointer shadow"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Home</span>
          </button>
        </div>

        {/* Locked Content Password Box */}
        {!isUnlocked ? (
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="max-w-[400px] w-full p-7 sm:p-8 rounded-2xl border border-gray-800 bg-[#111111] text-center shadow-2xl">
              <div className="w-14 h-14 rounded-2xl bg-red-600/15 border border-red-500/40 flex items-center justify-center text-red-500 mx-auto mb-4">
                <Lock className="w-7 h-7" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">🔒 Locked Content</h3>
              <p className="text-xs sm:text-sm text-gray-400 mb-5">
                To view this post, enter the password below:
              </p>

              <form onSubmit={handleCheckPassword}>
                <input
                  type="password"
                  id="post-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errorMsg) setErrorMsg(false);
                  }}
                  placeholder="Enter Password Here"
                  className="w-full p-3 text-base border border-gray-700 bg-black text-white rounded-lg mb-3 outline-none text-center focus:border-red-600 transition-colors"
                />

                <button
                  type="submit"
                  className="w-full p-3 bg-[#e50914] hover:bg-[#b80710] active:scale-95 text-white font-bold text-base rounded-lg transition-all cursor-pointer shadow-lg shadow-red-950/60"
                >
                  Unlock Content
                </button>
              </form>

              {errorMsg && (
                <p id="error-msg" className="text-[#e50914] text-xs font-bold mt-3 animate-shake">
                  ❌ Only Admin Access
                </p>
              )}
            </div>
          </div>
        ) : (
          /* Secret Content: Pricing Plans */
          <div id="secret-content" className="py-4 animate-fadeIn">
            <h2 className="text-xl sm:text-2xl font-bold text-center text-white mb-6">
              Subscribe now at a very low price.
            </h2>

            {dbError && (
              <div className="max-w-md mx-auto mb-6 p-3.5 bg-red-950/80 border border-red-500 rounded-xl text-center text-red-200 text-sm font-semibold">
                {dbError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 max-w-6xl mx-auto">
              
              {/* Basic Plan */}
              <div className="bg-gradient-to-b from-[#111111] to-black rounded-xl overflow-hidden border border-gray-800 hover:border-[#e50914] hover:-translate-y-1.5 transition-all shadow-xl flex flex-col">
                <div className="bg-[#e50914] text-white p-3.5 text-center font-bold text-base">
                  Basic Plan
                </div>
                <div className="p-6 text-center flex-1 flex flex-col justify-between">
                  <div>
                    <div className="text-3xl font-black text-white my-2">₹10.00</div>
                    <div className="text-white/80 text-sm mb-2">2 Day(s)</div>
                    <div className="text-white/80 text-xs mb-5">Device Limit - 1</div>
                  </div>
                  <button
                    disabled={isProcessing}
                    onClick={() => handleActivatePlan(2)}
                    className="w-full py-3 px-5 rounded-md bg-[#e50914] hover:bg-[#b80710] disabled:opacity-50 text-white font-bold text-sm transition-all cursor-pointer shadow-md"
                  >
                    SELECT PLAN
                  </button>
                </div>
              </div>

              {/* Premium Plan */}
              <div className="bg-gradient-to-b from-[#111111] to-black rounded-xl overflow-hidden border border-gray-800 hover:border-[#e50914] hover:-translate-y-1.5 transition-all shadow-xl flex flex-col">
                <div className="bg-[#e50914] text-white p-3.5 text-center font-bold text-base">
                  Premium Plan
                </div>
                <div className="p-6 text-center flex-1 flex flex-col justify-between">
                  <div>
                    <div className="text-3xl font-black text-white my-2">₹39.99</div>
                    <div className="text-white/80 text-sm mb-2">1 Month(s)</div>
                    <div className="text-white/80 text-xs mb-5">Device Limit - 1</div>
                  </div>
                  <button
                    disabled={isProcessing}
                    onClick={() => handleActivatePlan(30)}
                    className="w-full py-3 px-5 rounded-md bg-[#e50914] hover:bg-[#b80710] disabled:opacity-50 text-white font-bold text-sm transition-all cursor-pointer shadow-md"
                  >
                    SELECT PLAN
                  </button>
                </div>
              </div>

              {/* Platinum Plan */}
              <div className="bg-gradient-to-b from-[#111111] to-black rounded-xl overflow-hidden border border-gray-800 hover:border-[#e50914] hover:-translate-y-1.5 transition-all shadow-xl flex flex-col">
                <div className="bg-[#e50914] text-white p-3.5 text-center font-bold text-base">
                  Platinum Plan
                </div>
                <div className="p-6 text-center flex-1 flex flex-col justify-between">
                  <div>
                    <div className="text-3xl font-black text-white my-2">₹299.00</div>
                    <div className="text-white/80 text-sm mb-2">6 Month(s)</div>
                    <div className="text-white/80 text-xs mb-5">Device Limit - 1</div>
                  </div>
                  <button
                    disabled={isProcessing}
                    onClick={() => handleActivatePlan(180)}
                    className="w-full py-3 px-5 rounded-md bg-[#e50914] hover:bg-[#b80710] disabled:opacity-50 text-white font-bold text-sm transition-all cursor-pointer shadow-md"
                  >
                    SELECT PLAN
                  </button>
                </div>
              </div>

              {/* Diamond Plan */}
              <div className="bg-gradient-to-b from-[#111111] to-black rounded-xl overflow-hidden border border-gray-800 hover:border-[#e50914] hover:-translate-y-1.5 transition-all shadow-xl flex flex-col">
                <div className="bg-[#e50914] text-white p-3.5 text-center font-bold text-base">
                  Diamond Plan
                </div>
                <div className="p-6 text-center flex-1 flex flex-col justify-between">
                  <div>
                    <div className="text-3xl font-black text-white my-2">₹579.00</div>
                    <div className="text-white/80 text-sm mb-2">1 Year(s)</div>
                    <div className="text-white/80 text-xs mb-5">Device Limit - 1</div>
                  </div>
                  <button
                    disabled={isProcessing}
                    onClick={() => handleActivatePlan(365)}
                    className="w-full py-3 px-5 rounded-md bg-[#e50914] hover:bg-[#b80710] disabled:opacity-50 text-white font-bold text-sm transition-all cursor-pointer shadow-md"
                  >
                    SELECT PLAN
                  </button>
                </div>
              </div>

            </div>
          </div>
        )}

      </div>

      {/* Success Notification Alert */}
      {showSuccessAlert && (
        <div className="fixed inset-0 z-[9999999] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-[#111111] border-2 border-[#e50914] p-8 rounded-2xl text-center max-w-[400px] w-full shadow-[0_10px_40px_rgba(229,9,20,0.3)] animate-scaleUp">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-[#04AA6D] flex items-center justify-center text-3xl mx-auto mb-4 border border-emerald-500/40">
              <Check className="w-9 h-9 stroke-[3]" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Subscription Activated!</h3>
            <p className="text-sm text-gray-300">Successfully processed. Redirecting to Home page...</p>
            <div className="w-6 h-6 border-3 border-white/30 border-t-[#e50914] rounded-full animate-spin mx-auto mt-4" />
          </div>
        </div>
      )}
    </main>
  );
};
