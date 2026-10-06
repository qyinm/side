import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { Command, CommandEmpty, CommandItem, CommandList } from "./components/ui/command";
import type { SelectionOptions } from "../shared/contracts";

export function SelectionPopup() {
  const [data, setData] = useState<SelectionOptions>();
  const [error, setError] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void window.side.getSelectionOptions().then((options) => {
      document.title = options.title;
      setData(options);
    }).catch(() => setError("Could not load options."));
  }, []);

  useEffect(() => {
    const focusList = () => listRef.current?.focus({ preventScroll: true });
    window.addEventListener("focus", focusList);
    const frame = requestAnimationFrame(focusList);
    return () => {
      window.removeEventListener("focus", focusList);
      cancelAnimationFrame(frame);
    };
  }, [data]);

  return (
    <Command ref={listRef} tabIndex={-1} shouldFilter={false} className="selection-popup" label={data?.title ?? "Choose an option"}
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); window.side.cancelSelection(); }
      }}>
      <CommandList>
        <CommandEmpty>{error || (data ? "No options." : "Loading…")}</CommandEmpty>
        {data?.options.map((option) => (
          <CommandItem key={option.id} value={option.id}
            onSelect={() => window.side.chooseSelection(option.id)}>
            <Check aria-hidden="true" style={{ opacity: option.id === data.selectedId ? 1 : 0 }} />
            <span>{option.name}</span>
          </CommandItem>
        ))}
      </CommandList>
    </Command>
  );
}
