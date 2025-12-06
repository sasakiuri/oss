import { NetworkError } from "@/lib/errors";
import type { ContactFormData, ContactResponse } from "@/lib/schemas";
import type { ContactService } from "./types";

/**
 * API Route経由のコンタクトサービス
 */
class ApiContactService implements ContactService {
  async send(data: ContactFormData): Promise<ContactResponse> {
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      const result: ContactResponse = await response.json();
      return result;
    } catch (cause) {
      throw new NetworkError("お問い合わせの送信に失敗しました", cause);
    }
  }
}

// Singleton instance
const contactService = new ApiContactService();

// Public API function (facade pattern)
export async function sendContactMessage(
  data: ContactFormData
): Promise<ContactResponse> {
  return contactService.send(data);
}

// Export for testing and DI
export { contactService, ApiContactService };
export type { ContactService };
