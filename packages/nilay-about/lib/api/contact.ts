import { httpsCallable } from "firebase/functions";
import { getFirebaseFunctions } from "@/lib/firebase";
import type { ContactFormData, ContactResponse } from "@/lib/schemas";

interface SendContactMessageRequest {
  requiresReply: boolean;
  email: string;
  title: string;
  message: string;
}

export async function sendContactMessage(
  data: ContactFormData
): Promise<ContactResponse> {
  const functions = getFirebaseFunctions();
  const sendContactMessageFn = httpsCallable<
    SendContactMessageRequest,
    ContactResponse
  >(functions, "sendContactMessage");

  const request: SendContactMessageRequest = {
    requiresReply: data.requiresReply,
    email: data.email || "",
    title: data.title,
    message: data.message,
  };

  const result = await sendContactMessageFn(request);
  return result.data;
}
