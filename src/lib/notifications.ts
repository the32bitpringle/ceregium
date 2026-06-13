export type NotificationChannel = "email" | "sms";

export async function sendVerification(
  channel: NotificationChannel,
  destination: string,
  code: string,
) {
  const message = `Your Ceregium trusted-contact verification code is ${code}. It expires in 10 minutes.`;
  if (channel === "email" && process.env.RESEND_API_KEY && process.env.TRUSTED_CONTACT_FROM_EMAIL) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.TRUSTED_CONTACT_FROM_EMAIL,
        to: [destination],
        subject: "Ceregium trusted-contact verification",
        text: message,
      }),
    });
    if (!response.ok) throw new Error(`Resend failed: ${await response.text()}`);
    return { delivered: true, provider: "resend" };
  }

  if (
    channel === "sms" &&
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_FROM_NUMBER
  ) {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(
            `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`,
          ).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: destination,
          From: process.env.TWILIO_FROM_NUMBER,
          Body: message,
        }),
      },
    );
    if (!response.ok) throw new Error(`Twilio failed: ${await response.text()}`);
    return { delivered: true, provider: "twilio" };
  }

  return { delivered: false, provider: "preview" };
}

export async function sendTrustedContactTest(
  channel: NotificationChannel,
  destination: string,
) {
  const message =
    "This is a Ceregium safety-plan test. No wellness alert was triggered. The student can pause or revoke this contact at any time.";
  if (channel === "email" && process.env.RESEND_API_KEY && process.env.TRUSTED_CONTACT_FROM_EMAIL) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.TRUSTED_CONTACT_FROM_EMAIL,
        to: [destination],
        subject: "Ceregium safety-plan test",
        text: message,
      }),
    });
    if (!response.ok) throw new Error(`Resend failed: ${await response.text()}`);
    return { delivered: true };
  }
  if (
    channel === "sms" &&
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_FROM_NUMBER
  ) {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(
            `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`,
          ).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: destination,
          From: process.env.TWILIO_FROM_NUMBER,
          Body: message,
        }),
      },
    );
    if (!response.ok) throw new Error(`Twilio failed: ${await response.text()}`);
    return { delivered: true };
  }
  return { delivered: false };
}
