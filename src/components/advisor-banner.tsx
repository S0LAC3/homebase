'use client';

import { useAuth } from '@/components/auth-provider';
import { Eye, Users } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function AdvisorBanner() {
  const { isAdvisor, activeBuyerName, activeBuyerId, linkedBuyers, setActiveBuyerId } = useAuth();

  if (!isAdvisor) return null;

  if (!activeBuyerId) {
    return (
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-2">
        <div className="container mx-auto flex items-center gap-2 text-amber-800 text-sm">
          <Eye className="h-4 w-4 flex-shrink-0" />
          <span>No buyers have granted you access yet. Ask your client to invite you from their Settings page.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-blue-50 border-b border-blue-200 px-4 py-2">
      <div className="container mx-auto flex items-center gap-2 text-blue-800 text-sm">
        <Eye className="h-4 w-4 flex-shrink-0" />
        <span>
          Viewing as advisor for <strong>{activeBuyerName ?? 'buyer'}</strong> — read-only access
        </span>
        {linkedBuyers.length > 1 && (
          <div className="ml-auto flex items-center gap-2">
            <Users className="h-4 w-4" />
            <Select value={activeBuyerId ?? undefined} onValueChange={(v) => v && setActiveBuyerId(v)}>
              <SelectTrigger className="h-7 w-[180px] text-xs bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {linkedBuyers.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name ?? b.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </div>
  );
}
