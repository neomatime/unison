"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

const inputClass =
  "mt-1.5 h-11 w-full border border-border bg-background px-3 pr-10 text-sm outline-none focus:border-brand";

/**
 * A text field with a list of suggested names under it, styled like the rest of UNISON (the browser's own datalist
 * popup cannot be styled). The person can pick a name or type any other; the list always shows every name.
 */
export function NameCombobox({
  name,
  label,
  value,
  onValueChange,
  suggestions,
  hint,
}: {
  name: string;
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  suggestions: string[];
  hint?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const hasList = suggestions.length > 0;
  const shown = open && hasList;

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const choose = (suggestion: string) => {
    onValueChange(suggestion);
    setOpen(false);
    setActive(-1);
    input.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!hasList) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setActive(Math.max(0, suggestions.indexOf(value)));
        return;
      }
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) => (current + step + suggestions.length) % suggestions.length);
    } else if (event.key === "Enter" && open && active >= 0) {
      event.preventDefault();
      choose(suggestions[active]);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div ref={root} className="relative">
      <label className="text-sm font-medium">
        {label}
        <div className="relative">
          <input
            ref={input}
            name={name}
            value={value}
            autoComplete="off"
            role="combobox"
            aria-expanded={shown}
            aria-controls={shown ? listId : undefined}
            aria-autocomplete="list"
            aria-activedescendant={shown && active >= 0 ? `${listId}-${active}` : undefined}
            onChange={(event) => {
              onValueChange(event.target.value);
              setActive(-1);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            className={inputClass}
          />
          {hasList ? <button
            type="button"
            tabIndex={-1}
            aria-label={shown ? "Close the list of names" : "Show the list of names"}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setOpen((current) => !current);
              input.current?.focus();
            }}
            className="absolute top-1.5 right-0 flex h-11 w-10 items-center justify-center text-muted-foreground hover:text-foreground"
          >
            <ChevronDown className={`size-4 transition-transform ${shown ? "rotate-180" : ""}`} />
          </button> : null}
          {shown ? (
            <ul
              id={listId}
              role="listbox"
              aria-label={label}
              className="unison-menu-enter absolute top-full right-0 left-0 z-40 mt-1 max-h-72 overflow-y-auto border border-border bg-card p-1.5 shadow-xl"
            >
              {suggestions.map((suggestion, index) => {
                const selected = suggestion === value;
                return (
                  <li
                    key={suggestion}
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={selected}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={(event) => {
                      event.preventDefault();
                      choose(suggestion);
                    }}
                    onMouseEnter={() => setActive(index)}
                    className={`flex cursor-pointer items-start justify-between gap-3 px-3 py-2 text-sm ${
                      index === active ? "bg-muted text-foreground" : "text-foreground"
                    } ${selected ? "font-semibold" : "font-medium"}`}
                  >
                    <span>{suggestion}</span>
                    {selected ? <Check className="mt-0.5 size-4 shrink-0 text-brand" /> : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
        {hint ? <span className="mt-1 block text-xs font-normal text-muted-foreground">{hint}</span> : null}
      </label>
    </div>
  );
}
