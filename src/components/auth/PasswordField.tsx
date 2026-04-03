import { Eye, EyeOff, Lock } from "lucide-react";

type PasswordFieldProps = {
  label: string;
  value: string;
  placeholder: string;
  visible: boolean;
  onChange: (value: string) => void;
  onToggleVisibility: () => void;
};

export function PasswordField({
  label,
  value,
  placeholder,
  visible,
  onChange,
  onToggleVisibility,
}: PasswordFieldProps) {
  return (
    <div className="space-y-1.5 focus-within:text-white text-white/70 transition-colors">
      <label className="block text-sm font-semibold ml-1 tracking-wide">{label}</label>
      <div className="relative">
        <div className="absolute left-4 top-1/2 -translate-y-1/2">
          <Lock size={18} />
        </div>
        <input
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-black/20 border border-white/10 hover:border-white/20 focus:border-white/40 focus:bg-black/30 text-white placeholder:text-white/30 rounded-2xl py-3.5 pl-11 pr-11 focus:outline-none transition-all shadow-inner font-medium"
          required
        />
        <button
          type="button"
          onClick={onToggleVisibility}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors focus:outline-none"
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </div>
  );
}
