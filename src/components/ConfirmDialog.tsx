import { AlertTriangle, X } from "lucide-react";
import { useEffect, useRef } from "react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "warning" | "info";
  onConfirm: () => void;
  onCancel: () => void;
}

const variantConfig = {
  danger: {
    icon: "bg-red-100 dark:bg-red-500/15 text-red-600 dark:text-red-400",
    btn: "bg-red-600 hover:bg-red-700 text-white",
  },
  warning: {
    icon: "bg-amber-100 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400",
    btn: "bg-amber-600 hover:bg-amber-700 text-white",
  },
  info: {
    icon: "bg-[#88B5D3]/15 text-[#88B5D3]",
    btn: "bg-[#88B5D3] hover:bg-[#6f9fbe] text-white",
  },
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmText = "确认",
  cancelText = "取消",
  variant = "danger",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cfg = variantConfig[variant];

  useEffect(() => {
    if (open) {
      // Focus cancel button by default — prevents accidental Enter confirm
      const timer = setTimeout(() => confirmRef.current?.focus(), 80);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-150"
        onClick={onCancel}
      />

      {/* Dialog */}
      <div className="relative w-full max-w-sm rounded-2xl border border-white/30 dark:border-[#2a3b52] bg-white dark:bg-[#0f1826] shadow-2xl animate-in zoom-in-95 fade-in duration-200">
        {/* Close button */}
        <button
          onClick={onCancel}
          className="absolute right-3 top-3 p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-[#162233] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-6 flex flex-col items-center text-center">
          {/* Icon */}
          <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 ${cfg.icon}`}>
            <AlertTriangle className="w-6 h-6" />
          </div>

          {/* Title */}
          <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
            {title}
          </h3>

          {/* Description */}
          {description && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
              {description}
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 mt-6 w-full">
            <button
              onClick={onCancel}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 dark:border-[#30435c] text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#162233] transition-colors"
            >
              {cancelText}
            </button>
            <button
              ref={confirmRef}
              onClick={onConfirm}
              className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${cfg.btn}`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
