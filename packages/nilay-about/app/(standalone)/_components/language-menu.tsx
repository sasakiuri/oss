"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui";
import { LuLanguages } from "react-icons/lu";

type Language = "ja" | "en";

interface LanguageMenuProps {
  language: Language;
  onLanguageChange: (lang: Language) => void;
}

/**
 * Language selector dropdown for standalone apps
 */
export function LanguageMenu({ language, onLanguageChange }: LanguageMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (lang: Language) => {
    onLanguageChange(lang);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={menuRef}>
      <Button
        variant="ghost"
        size="icon"
        className="text-primary-foreground hover:bg-primary/80"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="言語を選択"
        aria-expanded={isOpen}
      >
        <LuLanguages className="h-5 w-5" />
      </Button>
      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[120px] rounded-md border bg-background p-1 shadow-md">
          <button
            className="w-full cursor-pointer rounded px-3 py-2 text-left text-sm hover:bg-secondary"
            onClick={() => handleSelect("en")}
          >
            {language === "en" && "✓ "}English
          </button>
          <button
            className="w-full cursor-pointer rounded px-3 py-2 text-left text-sm hover:bg-secondary"
            onClick={() => handleSelect("ja")}
          >
            {language === "ja" && "✓ "}日本語
          </button>
        </div>
      )}
    </div>
  );
}
