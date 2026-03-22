import { UserAvatarProps } from "@/types";
import Image from "next/image";

export function UserAvatar({ isVibrating, src, className }: UserAvatarProps) {
  return (
    <div className={`relative ${className || ''} w-48 h-48 sm:w-64 sm:h-64 rounded-full border-4 border-primary/20 shadow-2xl transition-transform duration-300 overflow-hidden ${isVibrating ? 'vibrate scale-105' : 'scale-100'}`}>
      <Image
        src={src || "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&q=80&w=400"}
        alt="User"
        width={12}
        height={12}
        className="object-cover"
        priority
      />
      {isVibrating && (
        <div className="absolute inset-0 bg-primary/10 mix-blend-overlay animate-pulse" />
      )}
    </div>
  );
}
