import { httpsCallable } from "firebase/functions";
import { getFirebaseFunctions } from "@/lib/firebase";
import { NetworkError } from "@/lib/errors";
import type { ContactFormData, ContactResponse } from "@/lib/schemas";
import type { ContactService } from "./types";

interface SendContactMessageRequest {
  requiresReply: boolean;
  email: string;
  title: string;
  message: string;
}

/**
 * Firebase Functions実装のコンタクトサービス
 */
class FirebaseContactService implements ContactService {
  async send(data: ContactFormData): Promise<ContactResponse> {
    try {
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
    } catch (cause) {
      throw new NetworkError("お問い合わせの送信に失敗しました", cause);
    }
  }
}

// Singleton instance
const contactService = new FirebaseContactService();

// Public API function (facade pattern)
export async function sendContactMessage(
  data: ContactFormData
): Promise<ContactResponse> {
  return contactService.send(data);
}

// Export for testing and DI
export { contactService, FirebaseContactService };
export type { ContactService };
