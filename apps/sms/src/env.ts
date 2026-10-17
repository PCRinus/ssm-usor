export type SmsEnv = {
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  /** An alphanumeric sender such as "SSMUsor", a Twilio number, or a Messaging Service SID. */
  SMS_FROM?: string;
};
