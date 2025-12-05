"use client";

import { useMutation } from "@tanstack/react-query";
import { sendContactMessage } from "@/lib/api/contact";
import type { ContactFormData } from "@/lib/schemas";

export function useContactForm() {
  return useMutation({
    mutationFn: (data: ContactFormData) => sendContactMessage(data),
  });
}
