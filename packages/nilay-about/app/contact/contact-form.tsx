"use client";

import { useForm } from "react-hook-form";
import { useContactForm } from "@/hooks";
import { useUIStore } from "@/store";
import type { ContactFormData } from "@/lib/schemas";

export function ContactForm() {
  const { alert, showSuccess, showError, clearAlert } = useUIStore();
  const mutation = useContactForm();

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ContactFormData>({
    defaultValues: {
      requiresReply: false,
      email: "",
      title: "",
      message: "",
    },
  });

  const requiresReply = watch("requiresReply");

  const onSubmit = async (data: ContactFormData) => {
    try {
      const result = await mutation.mutateAsync(data);

      if (result.hasError) {
        showError("送信エラー", result.errorMessage);
        return;
      }

      showSuccess(
        "送信完了",
        `お問い合わせありがとうございます。— お問い合わせ番号：${result.uuid}`
      );
      reset();
    } catch {
      showError(
        "送信エラー",
        "何らかのエラーが発生しました。しばらく時間をおいてから送信するか、Ｅメールなどで直接お問い合わせください。"
      );
    }
  };

  const isLoading = isSubmitting || mutation.isPending;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mt-4">
      <p>
        <input
          type="checkbox"
          id="requiresReply"
          disabled={isLoading}
          {...register("requiresReply")}
        />{" "}
        <label htmlFor="requiresReply">返信を希望する</label>
      </p>

      {requiresReply && (
        <p>
          <label htmlFor="email">Ｅメールアドレス *</label>
          <br />
          <input
            id="email"
            type="email"
            disabled={isLoading}
            className="w-full max-w-md"
            aria-describedby={errors.email ? "email-error" : undefined}
            aria-invalid={errors.email ? "true" : undefined}
            {...register("email", {
              required: "返信を希望する場合はＥメールアドレスが必要です。",
              pattern: {
                value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                message: "Ｅメールアドレスの形式が不正です。",
              },
            })}
          />
          {errors.email && (
            <span
              id="email-error"
              role="alert"
              className="block text-destructive mt-1"
            >
              {errors.email.message}
            </span>
          )}
        </p>
      )}

      <p>
        <label htmlFor="title">タイトル *</label>
        <br />
        <input
          id="title"
          type="text"
          disabled={isLoading}
          className="w-full max-w-md"
          aria-describedby={errors.title ? "title-error" : undefined}
          aria-invalid={errors.title ? "true" : undefined}
          aria-required="true"
          {...register("title", {
            required: "タイトルは必須です。",
          })}
        />
        {errors.title && (
          <span
            id="title-error"
            role="alert"
            className="block text-destructive mt-1"
          >
            {errors.title.message}
          </span>
        )}
      </p>

      <p>
        <label htmlFor="message">お問い合わせ内容 *</label>
        <br />
        <textarea
          id="message"
          rows={6}
          disabled={isLoading}
          className="w-full max-w-md"
          aria-describedby={errors.message ? "message-error" : undefined}
          aria-invalid={errors.message ? "true" : undefined}
          aria-required="true"
          {...register("message", {
            required: "お問い合わせ内容は必須です。",
          })}
        />
        {errors.message && (
          <span
            id="message-error"
            role="alert"
            className="block text-destructive mt-1"
          >
            {errors.message.message}
          </span>
        )}
      </p>

      <p>
        <button type="submit" disabled={isLoading}>
          {isLoading ? "送信中..." : "送信"}
        </button>
      </p>

      {alert && (
        <p
          className={
            alert.type === "success" ? "text-foreground" : "text-destructive"
          }
        >
          <strong>{alert.title}</strong>: {alert.message}{" "}
          <button type="button" onClick={clearAlert}>
            [閉じる]
          </button>
        </p>
      )}
    </form>
  );
}
