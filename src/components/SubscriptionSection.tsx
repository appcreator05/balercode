import React, { useState, useEffect } from 'react';
import { ArrowLeft, CheckCircle2, ShieldCheck, Sparkles } from 'lucide-react';
import {
  SUBSCRIPTION_PLANS,
  SubscriptionPlan,
  checkActiveSubscription,
  payAndActivate,
  getDeviceId,
  ActiveSubscriptionResult,
  applySubscriptionUserAgent
} from '../services/subscriptionService';

interface SubscriptionSectionProps {
  onBack: () => void;
  onSubscriptionStatusChange?: (isSubscribed: boolean) => void;
}

export const SubscriptionSection: React.FC<SubscriptionSectionProps> = ({
  onBack,
  onSubscriptionStatusChange
}) => {
  const [subStatus, setSubStatus] = useState<ActiveSubscriptionResult>({
    isSubscribed: false,
    expiryDate: null,
    daysRemaining: 0
  });
  const [loadingStatus, setLoadingStatus] = useState<boolean>(true);
  const [processingPlanName, setProcessingPlanName] = useState<string | null>(null);

  const deviceId = getDeviceId();

  const loadStatus = async () => {
    setLoadingStatus(true);
    try {
      const res = await checkActiveSubscription();
      setSubStatus(res);
      if (onSubscriptionStatusChange) {
        onSubscriptionStatusChange(res.isSubscribed);
      }
    } catch (e) {
      console.error('Error checking active subscription:', e);
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    applySubscriptionUserAgent();
    loadStatus();
  }, []);

  const handleSelectPlan = (plan: SubscriptionPlan, e: React.MouseEvent<HTMLButtonElement>) => {
    applySubscriptionUserAgent();
    const buttonEl = e.currentTarget;
    setProcessingPlanName(plan.name);

    payAndActivate(plan.price, plan.days, plan.name, buttonEl, () => {
      setProcessingPlanName(null);
      loadStatus();
      if (onSubscriptionStatusChange) {
        onSubscriptionStatusChange(true);
      }
    });
  };

  return (
    <div className="sub-user-theme-wrapper min-h-screen bg-black text-white px-4 py-6 font-['Poppins',sans-serif]">
      <style>{`
        .sub-user-theme-wrapper .container h1 {
          text-align: center;
          margin-bottom: 12px;
          font-weight: 700;
          font-size: 28px;
        }
        .sub-user-theme-wrapper .plans {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 20px;
          max-width: 1200px;
          margin: 0 auto;
        }
        .sub-user-theme-wrapper .plan {
          background: linear-gradient(180deg, #111, #000);
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 10px 30px rgba(0,0,0,.6);
          transition: .3s;
          border: 1px solid #333;
          display: flex;
          flex-direction: column;
        }
        .sub-user-theme-wrapper .plan:hover {
          transform: translateY(-6px);
          border-color: #e50914;
        }
        .sub-user-theme-wrapper .plan-header {
          background: #e50914;
          padding: 15px;
          text-align: center;
          font-weight: 600;
          color: white;
        }
        .sub-user-theme-wrapper .plan-body {
          padding: 25px;
          text-align: center;
          flex-grow: 1;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }
        .sub-user-theme-wrapper .price {
          font-size: 36px;
          font-weight: 700;
          margin: 10px 0;
          color: white;
        }
        .sub-user-theme-wrapper .duration {
          opacity: .8;
          margin-bottom: 10px;
          color: white;
        }
        .sub-user-theme-wrapper .device {
          opacity: .8;
          margin-bottom: 20px;
          color: white;
        }
        .sub-user-theme-wrapper .btn {
          display: block;
          width: 100%;
          background: #e50914;
          color: #fff;
          padding: 12px 25px;
          border-radius: 6px;
          text-decoration: none;
          font-weight: 600;
          border: none;
          cursor: pointer;
          transition: 0.3s;
          font-size: 15px;
        }
        .sub-user-theme-wrapper .btn:hover {
          background: #b80710;
        }
        .sub-user-theme-wrapper .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
      {/* Top Bar with Back Button */}
      <div className="max-w-[1200px] mx-auto flex items-center justify-between mb-6 pb-3 border-b border-[#222]">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm font-semibold bg-[#1a1a1a] hover:bg-[#2a2a2a] text-white px-4 py-2 rounded-lg transition-colors border border-[#333]"
        >
          <ArrowLeft size={16} />
          <span>Back to Movies</span>
        </button>

        <div className="text-xs text-[#888] flex items-center gap-2 font-mono">
          <ShieldCheck size={14} className="text-[#04AA6D]" />
          <span>Device: {deviceId.slice(0, 14)}</span>
        </div>
      </div>

      {/* Active VIP Status Banner if User is Already Subscribed */}
      {subStatus.isSubscribed && (
        <div className="max-w-[1200px] mx-auto mb-8 bg-gradient-to-r from-[#111] via-[#1a0505] to-[#111] border-2 border-[#e50914] rounded-xl p-5 shadow-[0_10px_30px_rgba(229,9,20,0.3)] flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-[#e50914]/20 border border-[#e50914] flex items-center justify-center text-[#e50914] flex-shrink-0">
              <CheckCircle2 size={28} />
            </div>
            <div>
              <div className="text-lg font-bold text-white flex items-center gap-2">
                <span>VIP Subscription Active</span>
                <span className="text-xs bg-[#e50914] text-white font-semibold px-2 py-0.5 rounded">
                  100% Ad-Free
                </span>
              </div>
              <div className="text-xs text-[#aaa] mt-1">
                {subStatus.daysRemaining} Day(s) remaining • All video & banner ads removed
                {subStatus.expiryDate && (
                  <span className="ml-1 text-[#ccc]">
                    (Expires: {subStatus.expiryDate.toLocaleDateString()})
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={onBack}
            className="w-full sm:w-auto bg-[#e50914] hover:bg-[#b80710] text-white font-bold px-6 py-2.5 rounded-lg text-sm transition-all shadow-md"
          >
            Enjoy HD Stream
          </button>
        </div>
      )}

      {/* Main Pricing Section */}
      <div className="container max-w-[1200px] mx-auto">
        <h1 className="text-2xl sm:text-4xl font-bold text-center mb-2 tracking-tight">
          Subscribe now at a very low price.
        </h1>
        <p className="text-center text-[#bbb] text-sm sm:text-base mb-10 leading-relaxed">
          Recommended UPI Payment<br />
          <span className="text-[#04AA6D] font-medium text-xs sm:text-sm">Safe And Secure</span>
        </p>

        {/* Pricing Plans Grid */}
        <div className="plans grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {SUBSCRIPTION_PLANS.map((plan) => {
            const isProcessing = processingPlanName === plan.name;
            return (
              <div
                key={plan.name}
                className="plan bg-gradient-to-b from-[#111] to-[#000] rounded-xl overflow-hidden shadow-[0_10px_30px_rgba(0,0,0,0.6)] border border-[#333] hover:-translate-y-1.5 hover:border-[#e50914] transition-all flex flex-col"
              >
                <div className="plan-header bg-[#e50914] py-3.5 px-4 text-center font-semibold text-white tracking-wide">
                  {plan.name}
                </div>
                <div className="plan-body p-6 text-center flex-grow flex flex-col justify-between">
                  <div>
                    <div className="price text-3xl sm:text-4xl font-bold my-2.5 text-white">
                      ₹{plan.price.toFixed(2)}
                    </div>
                    <div className="duration opacity-80 mb-2.5 text-white text-sm">
                      {plan.durationText}
                    </div>
                    <div className="device opacity-80 mb-5 text-white text-xs">
                      {plan.deviceLimitText}
                    </div>
                  </div>
                  <button
                    disabled={isProcessing}
                    onClick={(e) => handleSelectPlan(plan, e)}
                    className="btn block w-full bg-[#e50914] hover:bg-[#b80710] text-white py-3 px-6 rounded-md font-semibold text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer uppercase tracking-wider"
                  >
                    {isProcessing ? 'Processing...' : 'SELECT PLAN'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Security / Info Footer */}
        <div className="mt-12 text-center text-xs text-[#777] max-w-xl mx-auto space-y-2">
          <p>Instant Activation via Razorpay UPI, Cards & NetBanking.</p>
          <p>Subscription is locked securely to 1 device. No password or login required.</p>
        </div>
      </div>

      {/* Custom Alert Popup UI */}
      <div id="customAlert" className="custom-alert-overlay">
        <div className="custom-alert-box">
          <div className="icon">✓</div>
          <h3>Subscription Activated!</h3>
          <p>Successfully processed. Redirecting...</p>
          <div className="alert-spinner"></div>
        </div>
      </div>
    </div>
  );
};
