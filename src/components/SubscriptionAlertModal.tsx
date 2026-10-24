import React from 'react';

interface SubscriptionAlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubscribeNow: () => void;
  title?: string;
  message?: string;
}

export const SubscriptionAlertModal: React.FC<SubscriptionAlertModalProps> = ({
  isOpen,
  onClose,
  onSubscribeNow,
  title = 'Go Ad-Free with VIP',
  message = 'Subscribe to remove all ads from movies, player banners, and music!'
}) => {
  if (!isOpen) return null;

  return (
    <div
      id="subscriptionAlertModalOverlay"
      onClick={onClose}
      className="fixed inset-0 z-[9999999] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn select-none"
    >
      <div
        id="subscriptionAlertModalCard"
        onClick={(e) => e.stopPropagation()}
        className="relative bg-[#11141b] border border-[#262c3a] rounded-2xl p-6 sm:p-7 max-w-[340px] w-full flex flex-col items-center text-center shadow-[0_25px_60px_rgba(0,0,0,0.95)] animate-fadeIn"
      >
        {/* Pink/Red Rounded Square with Question Mark Icon */}
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-b from-[#ff1957] to-[#d60a3b] flex items-center justify-center shadow-lg shadow-red-950/70 mb-4">
          <span className="text-white text-3xl font-black font-sans leading-none select-none">
            ?
          </span>
        </div>

        {/* Title */}
        <h3 className="text-lg sm:text-xl font-bold text-white mb-2 tracking-wide font-sans">
          {title}
        </h3>

        {/* Subtitle / Description */}
        <p className="text-xs sm:text-sm text-[#8fa0b5] font-normal leading-relaxed mb-6 px-1 max-w-[260px]">
          {message}
        </p>

        {/* Bottom Action Buttons: Cancel and Subscribe Now */}
        <div className="w-full flex items-center justify-center gap-3">
          <button
            type="button"
            id="btn-sub-alert-cancel"
            onClick={onClose}
            className="flex-1 py-2.5 sm:py-3 px-3 rounded-xl bg-[#1f2430] hover:bg-[#283040] active:scale-95 text-white font-bold text-xs sm:text-sm transition-all border border-[#303848] cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            id="btn-sub-alert-subscribe"
            onClick={() => {
              onClose();
              onSubscribeNow();
            }}
            className="flex-1 py-2.5 sm:py-3 px-3 rounded-xl bg-[#ff174d] hover:bg-[#e00c3e] active:scale-95 text-white font-bold text-xs sm:text-sm transition-all shadow-lg shadow-red-950/70 cursor-pointer whitespace-nowrap"
          >
            Subscribe Now
          </button>
        </div>
      </div>
    </div>
  );
};
