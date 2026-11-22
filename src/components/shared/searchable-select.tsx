"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface SearchableOption {
  id: string;
  label: string;
  secondary?: string | null;
}

export function SearchableSelect({
  value,
  options,
  onSearch,
  onSelect,
  placeholder = "Search…",
  ariaLabel,
  disabled,
  onCreate,
  invalid,
}: {
  value?: string | null;
  options: SearchableOption[];
  onSearch: (query: string) => Promise<SearchableOption[]>;
  onSelect: (option: SearchableOption) => void;
  placeholder?: string;
  ariaLabel: string;
  disabled?: boolean;
  onCreate?: () => void;
  invalid?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<SearchableOption[]>(options);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const next = await onSearch(query);
        if (active) setResults(next);
      } finally {
        if (active) setLoading(false);
      }
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [open, query, onSearch]);

  React.useEffect(() => {
    if (!open) setResults(options);
  }, [options, open]);

  const selected = [...options, ...results].find((option) => option.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-label={ariaLabel}
          aria-invalid={invalid}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">{selected?.label ?? placeholder}</span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-2">
        <Input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder}
          aria-label={`${ariaLabel} search`}
        />
        <div className="mt-2 max-h-60 space-y-1 overflow-y-auto" role="listbox" aria-label={ariaLabel}>
          {loading ? (
            <p className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Searching…
            </p>
          ) : results.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">No matches found.</p>
          ) : (
            results.map((option) => (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={option.id === value}
                onClick={() => {
                  onSelect(option);
                  setOpen(false);
                  setQuery("");
                }}
                className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm hover:bg-accent"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{option.label}</span>
                  {option.secondary ? (
                    <span className="block truncate text-xs text-muted-foreground">{option.secondary}</span>
                  ) : null}
                </span>
                {option.id === value ? <Check className="size-4 shrink-0" aria-hidden="true" /> : null}
              </button>
            ))
          )}
        </div>
        {onCreate ? (
          <Button type="button" variant="ghost" size="sm" className="mt-2 w-full justify-start" onClick={onCreate}>
            <Plus className="size-4" aria-hidden="true" /> Create new
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
