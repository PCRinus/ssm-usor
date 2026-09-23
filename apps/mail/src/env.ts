export type MailEnv = {
  MAIL_FROM: string;
  /** Contracts leave from an address of their own: a no-reply one belies the reply-to. */
  MAIL_FROM_CONTRACTS?: string;
  MAIL_REPLY_TO?: string;
  RESEND_API_KEY?: string;
};
