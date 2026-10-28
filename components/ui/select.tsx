"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";

export interface Option { value: string; label: string; hint?: string }

/**
 * A styled listbox that replaces native <select> and <datalist>. Keyboard: Enter/Space/↓ opens,
 * ↑/↓ move, Enter picks, Esc closes, typing jumps (or filters when `searchable`). With `allowCustom`
 * the typed text itself can be picked, which makes it a combobox (e.g. any language).
 */
export function Select({ id, label, options, value, onChange, placeholder = "Choose…", searchable = false, allowCustom = false, disabled = false }: {
  id?: string; label: string; options: Option[]; value: string; onChange: (v: string) => void;
  placeholder?: string; searchable?: boolean; allowCustom?: boolean; disabled?: boolean;
}) {
  const auto = useId();
  const baseId = id ?? auto;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: "", at: 0 });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q && (searchable || allowCustom) ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
    const custom = allowCustom && q && !options.some((o) => o.label.toLowerCase() === q) ? [{ value: query.trim(), label: query.trim(), hint: "Use this" }] : [];
    return [...base, ...custom];
  }, [options, query, searchable, allowCustom]);
  const current = options.find((o) => o.value === value) ?? (value ? { value, label: value } : null);
  const withSearch = searchable || allowCustom;

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  useEffect(() => {
    if (open) (withSearch ? search.current : list.current)?.focus();
  }, [open, withSearch]);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function show() {
    if (disabled) return;
    setQuery("");
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  }
  function pick(o: Option | undefined) {
    if (!o) return;
    onChange(o.value); setOpen(false); btn.current?.focus();
  }
  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(filtered.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Home") { e.preventDefault(); setActive(0); }
    else if (e.key === "End") { e.preventDefault(); setActive(filtered.length - 1); }
    else if (e.key === "Enter") { e.preventDefault(); pick(filtered[active]); }
    else if (e.key === "Escape") { e.preventDefault(); setOpen(false); btn.current?.focus(); }
    else if (e.key === "Tab") setOpen(false);
    else if (!withSearch && e.key.length === 1) {
      // Typeahead: jump to the first option starting with what was typed in the last second.
      const now = e.timeStamp;
      typed.current = { text: (now - typed.current.at < 1000 ? typed.current.text : "") + e.key.toLowerCase(), at: now };
      const i = filtered.findIndex((o) => o.label.toLowerCase().startsWith(typed.current.text));
      if (i >= 0) setActive(i);
    }
  }

  return (
    <div className={`ui-select ${open ? "open" : ""}`} ref={root}>
      <span className="ui-label" id={`${baseId}-l`}>{label}</span>
      <button
        ref={btn} id={baseId} type="button" className="ui-trigger" disabled={disabled}
        aria-haspopup="listbox" aria-expanded={open} aria-labelledby={`${baseId}-l ${baseId}`}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(e) => { if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) { e.preventDefault(); show(); } }}
      >
        <span className={current ? "" : "ui-ph"}>{current?.label ?? placeholder}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="ui-pop" onKeyDown={onKey}>
          {withSearch && (
            <input
              ref={search} className="ui-search" type="text" value={query} placeholder={allowCustom ? "Search or type your own" : "Search"}
              aria-label={`Search ${label}`} aria-controls={`${baseId}-list`} aria-activedescendant={filtered[active] ? `${baseId}-o${active}` : undefined}
              onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            />
          )}
          <ul ref={list} id={`${baseId}-list`} role="listbox" tabIndex={-1} aria-labelledby={`${baseId}-l`} aria-activedescendant={filtered[active] ? `${baseId}-o${active}` : undefined} className="ui-list">
            {filtered.length === 0 && <li className="ui-empty">No matches</li>}
            {filtered.map((o, i) => (
              <li
                key={`${o.value}-${i}`} id={`${baseId}-o${i}`} data-i={i} role="option" aria-selected={o.value === value}
                className={`${i === active ? "act" : ""} ${o.value === value ? "sel" : ""}`}
                onPointerMove={() => setActive(i)} onClick={() => pick(o)}
              >
                <span className="ui-opt"><span>{o.label}</span>{o.hint && <span className="ui-hint">{o.hint}</span>}</span>
                {o.value === value && <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6 9 17l-5-5" /></svg>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
