"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { APP } from "@/config/app";

export function SearchBar({
  value,
  onSearch,
  placeholder = "Search…",
}: {
  value: string;
  onSearch: (value: string) => void;
  placeholder?: string;
}) {
  const [local, setLocal] = React.useState(value);

  React.useEffect(() => setLocal(value), [value]);

  React.useEffect(() => {
    if (local === value) return;
    const timer = window.setTimeout(() => onSearch(local), APP.searchDebounceMs);
    return () => window.clearTimeout(timer);
  }, [local, value, onSearch]);

  return (
    <div className="relative w-full sm:max-w-xs">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input
        type="search"
        value={local}
        onChange={(event) => setLocal(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="pl-9"
      />
    </div>
  );
}
