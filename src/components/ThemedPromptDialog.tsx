import { X } from "lucide-react";
import { useEffect, useState } from "react";

interface ThemedPromptDialogProps {
  open: boolean;
  title: string;
  placeholder?: string;
  initialValue?: string;
  confirmText?: string;
  onCancel: () => void;
  onConfirm: (value: string) => void;
}

export function ThemedPromptDialog({
  open,
  title,
  placeholder,
  initialValue = "",
  confirmText = "确认",
  onCancel,
  onConfirm,
}: ThemedPromptDialogProps) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (open) setValue(initialValue);
  }, [open, initialValue]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/45 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl border border-white/30 dark:border-[#2a3b52] bg-white/95 dark:bg-[#0f1826]/95 backdrop-blur-xl shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-5 border-b border-gray-200/70 dark:border-[#2a3b52]">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h3>
          <button onClick={onCancel} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-[#162233]">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (value.trim()) onConfirm(value.trim());
              }
            }}
            placeholder={placeholder}
            className="w-full bg-white dark:bg-[#111b29] border border-gray-200 dark:border-[#30435c] rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#88B5D3]/25"
          />
          <div className="flex justify-end gap-2">
            <button onClick={onCancel} className="px-4 py-2 rounded-xl text-sm font-semibold border border-gray-200 dark:border-[#30435c] text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#162233]">取消</button>
            <button
              onClick={() => value.trim() && onConfirm(value.trim())}
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-[#88B5D3] hover:bg-[#6f9fbe] text-white"
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
